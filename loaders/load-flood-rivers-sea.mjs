// Flood rivers & sea loader (plan step M5.1). Files the
// Environment Agency's Risk of Flooding from Rivers and Sea
// likelihood bands as shapes, following the user-seat gap
// check of 12 Nov 2026:
//
//   npm run load:flood-rivers-sea
//   npm run load:flood-rivers-sea -- --verify-only
//   npm run load:flood-rivers-sea -- --file tests/fixtures/flood-rivers-sea
//
// This is ONE of three flood loaders, and the three products
// are never merged (gap L1). This product answers "how likely
// is flooding from rivers and the sea, TAKING INTO ACCOUNT
// the presence and condition of flood defences" (EA's words);
// the planning zones (load-flood-zones) answer a different
// question with the defences deliberately ignored, and
// surface water (load-flood-surface-water) is a different
// water source. At the Exeter golden home this product says
// Very low where the zones say Zone 3, at the same point,
// and both are right. Each loader files its own layer_type,
// its own edition stamp, its own log line.
//
// What the gap check changed, and where it lives in this file:
//   - L6, absence here is NOT a band. Where no shape covers a
//     point, this product publishes no band for that ground —
//     a different fact from a filed "Very low" polygon, and
//     the two must never be served as the same. Birkdale and
//     Epsom have absence (nearest Low 0.84 / 0.40 miles);
//     Exeter has the filed polygon. The loader files only
//     published shapes — no synthetic absence polygon exists
//     — and the golden checks assert the two states as
//     distinct, so no later step can quietly convert
//     Birkdale's absence into "Very low".
//   - L2, the bands' depth basis has a home: migration 0008
//     added flood_layers.detail, and every row here files
//     ">0 m" — these are the likelihood bands for flooding
//     deeper than 0 m. The per-depth sibling collections
//     (0.2–1.2 m) are deliberately not filed (gap O4), and
//     this column is what stops the filed bands being
//     misread as one of them. risk_label stays the clean
//     vocabulary {High, Medium, Low, Very low}.
//   - L3, shapes file exactly as published — no buffering,
//     snapping or simplification anywhere in this loader.
//   - L4, invalid geometries are counted, never dropped: the
//     count comes from the database step (ST_IsValid on the
//     staged shapes), every filed shape is made valid via
//     ST_MakeValid, a filed-invalid or emptied shape fails
//     the run, and staging is chunked by rows and by bytes.
//   - L5, counts are computed from the fetched data, never
//     from the service's filtered counts (the OGC service
//     silently ignores property filters — measured in the
//     prep). The only service figure trusted is the
//     unfiltered numberMatched, the oracle the paged read
//     must reconcile with exactly.
//
// The edition stamp is the serving system's own: the WMS
// build layer is named rofrs_4band_03_11_2026, and the
// loader parses that date out of the capabilities document
// (the CSW metadata record states the same 3 Nov 2026
// revision). If no dated build layer is published, the run
// fails: provenance is not guessed.
//
// Source: Environment Agency via the Defra Data Services
// Platform (OGC API Features, dataset 96ab4342-82c1-4095-
// 87f1-0082e8d84ef1), Open Government Licence; © Environment
// Agency copyright and/or database right. The national
// products "do not show risk at a property level" (EA's
// words) — answers are about the postcode point and its
// mapped surroundings. Distances are to the nearest polygon
// EDGE on the longitude-scaled plane (miles = degrees of
// latitude x 69.05), the prep's basis.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createGoldenSift, createTotals } from "./flood-stream.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

const ITEMS_URL =
  "https://environment.data.gov.uk/geoservices/datasets/96ab4342-82c1-4095-87f1-0082e8d84ef1/ogc/features/v1/collections/rofrs_4band/items";
const WMS_URL =
  "https://environment.data.gov.uk/spatialdata/nafra2-risk-of-flooding-from-rivers-and-sea/wms?service=WMS&version=1.3.0&request=GetCapabilities";
const COLLECTION = "rofrs_4band";
const LAYER_TYPE = "rofrs";
const SOURCE_NAME = "Environment Agency — Risk of Flooding from Rivers and Sea";
const VOCAB = ["High", "Medium", "Low", "Very low"];
const DETAIL = ">0 m";
const PAGE = 250;
const SNAPSHOT = 249019; // the service's unfiltered count, 12 Nov 2026

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};

// --- geometry (the house copies, on GeoJSON rings) ---------------
// Rings are held FLAT — a Float64Array of x,y pairs — not as
// arrays of [x, y] arrays: at national scale the dissolved
// flood polygons carry tens of millions of vertices, and the
// nature loader's live read is the standing proof that flat
// storage (16 bytes a vertex) survives where pair arrays
// (~70+ bytes a vertex) die at the heap limit. Point k of a
// ring is ring[2k], ring[2k+1].

function geojsonPolygons(geometry) {
  if (!geometry) return null;
  const raw =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : null;
  if (!raw) throw new Error(`unsupported geometry type: ${geometry.type}`);
  for (const polygon of raw) {
    if (!Array.isArray(polygon) || polygon.length === 0)
      throw new Error("malformed geometry: empty polygon");
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4)
        throw new Error("malformed geometry: ring with fewer than 4 points");
      for (const pair of ring) {
        if (
          !Array.isArray(pair) ||
          pair.length < 2 ||
          !Number.isFinite(pair[0]) ||
          !Number.isFinite(pair[1])
        )
          throw new Error("malformed geometry: coordinate is not a finite pair");
      }
    }
  }
  return raw.map((polygon) =>
    polygon.map((ring) => {
      const flat = new Float64Array(ring.length * 2);
      ring.forEach((pair, i) => {
        flat[2 * i] = pair[0];
        flat[2 * i + 1] = pair[1];
      });
      return flat;
    }),
  );
}

function bboxOf(polygons) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const polygon of polygons)
    for (const ring of polygon)
      for (let i = 0; i < ring.length; i += 2) {
        const x = ring[i];
        const y = ring[i + 1];
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  return [x0, y0, x1, y1];
}

function ringContains(ring, x, y) {
  let inside = false;
  const points = ring.length / 2;
  for (let i = 0, j = points - 1; i < points; j = i++) {
    const xi = ring[2 * i];
    const yi = ring[2 * i + 1];
    const xj = ring[2 * j];
    const yj = ring[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonsContain(polygons, lng, lat) {
  return polygons.some((polygon) => {
    let inside = false;
    for (const ring of polygon) if (ringContains(ring, lng, lat)) inside = !inside;
    return inside;
  });
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}

// Distance from a home to the nearest polygon EDGE, miles —
// zero when the point falls inside. Longitude is scaled by
// cos(latitude); miles are degrees of latitude x 69.05.
function geometryDistanceMiles(polygons, home) {
  if (polygonsContain(polygons, home.lng, home.lat)) return 0;
  const scaleX = Math.cos((home.lat * Math.PI) / 180);
  const px = home.lng * scaleX;
  const py = home.lat;
  let best = Infinity;
  for (const polygon of polygons)
    for (const ring of polygon) {
      const points = ring.length / 2;
      for (let i = 0, j = points - 1; i < points; j = i++) {
        const d = segmentDistance(
          px,
          py,
          ring[2 * j] * scaleX,
          ring[2 * j + 1],
          ring[2 * i] * scaleX,
          ring[2 * i + 1],
        );
        if (d < best) best = d;
      }
    }
  return best * 69.05;
}

// Nearest filed item to a home, with a bounding-box lower
// bound so a national layer stays cheap to scan: the bound
// is exact-plane, so a skipped polygon can never be the
// nearest.
function nearestEdge(filed, home) {
  const scaleX = Math.cos((home.lat * Math.PI) / 180);
  const px = home.lng * scaleX;
  const py = home.lat;
  let best = null;
  for (const item of filed) {
    if (best && item.bbox) {
      const [x0, y0, x1, y1] = item.bbox;
      const dx = px < x0 * scaleX ? x0 * scaleX - px : px > x1 * scaleX ? px - x1 * scaleX : 0;
      const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
      if (Math.sqrt(dx * dx + dy * dy) * 69.05 >= best.miles) continue;
    }
    const miles = geometryDistanceMiles(item.polygons, home);
    if (!best || miles < best.miles) best = { item, miles };
  }
  return best;
}

function polygonsToWkt(polygons) {
  const body = polygons
    .map((polygon) => {
      const rings = polygon.map((ring) => {
        const points = [];
        for (let i = 0; i < ring.length; i += 2) points.push(`${ring[i]} ${ring[i + 1]}`);
        return `(${points.join(",")})`;
      });
      return `(${rings.join(",")})`;
    })
    .join(",");
  return `MULTIPOLYGON(${body})`;
}

// --- fetching ------------------------------------------------------

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
async function fetchResponse(url, what, attempts = RETRY_DELAYS_MS.length + 1) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${what}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    }
  }
  throw lastError;
}
async function fetchJson(url, what) {
  return (await fetchResponse(url, what)).json();
}
async function fetchText(url, what) {
  return (await fetchResponse(url, what)).text();
}

// The edition date, from the serving system's own build
// stamp: the WMS capabilities name a dated build layer
// "<collection>_DD_MM_YYYY" beside the plain one (the depth
// siblings carry the same build date but do not match this
// pattern). Every dated match must agree — two builds in
// one document would mean the service is mid-republication
// and the honest move is to fail and retry later.
async function fetchEdition() {
  const xml = await fetchText(WMS_URL, "the rivers & sea WMS capabilities");
  const pattern = new RegExp(`${COLLECTION}_(\\d{2})_(\\d{2})_(\\d{4})`, "g");
  const dates = new Set();
  for (const match of xml.matchAll(pattern)) dates.add(`${match[3]}-${match[2]}-${match[1]}`);
  if (dates.size !== 1)
    throw new Error(
      `contract failure: the WMS capabilities carry ${dates.size} distinct build dates for ${COLLECTION} — no single edition can be stamped`,
    );
  return [...dates][0];
}

// Features -> validated items. Geometry-less features are
// counted, never filed; malformed geometry and any band
// outside the published vocabulary fail the run (the
// contract check, gap L5: bands are read off the fetched
// features themselves, never trusted from a filtered query).
function processFeatures(raw) {
  let geoless = 0;
  let malformed = 0;
  const perLabel = Object.fromEntries(VOCAB.map((label) => [label, 0]));
  const items = [];
  for (const feature of raw) {
    let polygons = null;
    try {
      polygons = geojsonPolygons(feature.geometry);
    } catch {
      malformed += 1;
      continue;
    }
    if (polygons === null) {
      geoless += 1;
      continue;
    }
    const props = {};
    for (const [k, v] of Object.entries(feature.properties ?? {}))
      props[k] = typeof v === "string" ? v.trim() : v;
    const label = props.risk_band;
    if (!VOCAB.includes(label))
      throw new Error(
        `contract failure: risk_band "${label}" is outside {High, Medium, Low, Very low}`,
      );
    perLabel[label] += 1;
    items.push({ label, detail: DETAIL, polygons, bbox: bboxOf(polygons) });
  }
  if (malformed > 0)
    throw new Error(
      `rivers & sea: ${malformed} features carry geometry that does not parse — contract failure, nothing filed`,
    );
  return { items, geoless, perLabel };
}

function serviceErrorText(body) {
  const error = body?.error;
  if (!error) return null;
  const parts = [
    error.code != null ? `code ${error.code}` : null,
    error.message ?? null,
    ...(Array.isArray(error.details) ? error.details : []),
  ].filter((part) => part !== null && part !== "");
  return parts.length > 0 ? parts.join(": ") : "unknown error";
}

// One items page, fetched and judged INSIDE the retry boundary
// (the guard pattern the 13 Nov 2026 PHI diagnosis set,
// scratch-nature/PHI-DIAGNOSIS.md: a body the service failed
// with must never read as a page of data — above all, never as
// an empty page that ends the read). The count oracle must be
// restated, the features member must be an array, and an empty
// page while the count says more remain is a failed page: the
// SAME startIndex is re-requested, and after the last attempt
// the load fails loudly and files nothing.
async function fetchRiversSeaPage(startIndex, expected, read, delaysMs = RETRY_DELAYS_MS) {
  let lastError = null;
  for (let attempt = 1; attempt <= delaysMs.length + 1; attempt++) {
    try {
      const response = await fetchResponse(
        `${ITEMS_URL}?limit=${PAGE}&startIndex=${startIndex}&f=json`,
        "the rivers & sea features",
        1,
      );
      const page = await response.json();
      const errorText = serviceErrorText(page);
      if (errorText)
        throw new Error(
          `the rivers & sea service returned an error for the page at startIndex ${startIndex}: ${errorText}`,
        );
      if (page?.numberMatched !== expected)
        throw new Error(
          `contract failure: the rivers & sea count moved mid-read (${expected} -> ${page?.numberMatched}) — nothing filed`,
        );
      if (!Array.isArray(page.features))
        throw new Error(
          `the rivers & sea page at startIndex ${startIndex} carries no features array`,
        );
      if (page.features.length === 0)
        throw new Error(`rivers & sea: paging stopped at ${read} of ${expected} features`);
      return page;
    } catch (error) {
      lastError = error;
      if (attempt <= delaysMs.length)
        await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt - 1]));
    }
  }
  throw lastError;
}

// The whole collection, read by paging: the unfiltered
// numberMatched is the oracle (L5), every page must restate
// it, and the read must reconcile exactly or file nothing.
// Pages are processed as they land, so the raw GeoJSON of a
// page is released before the next arrives.
//
// Streaming (BUG-187, loaders/flood-stream.mjs): with an
// onItems sink, each page's processed items are handed to
// the sink as they land and only the golden candidates are
// retained (the returned items); the totals accumulate as
// scalars either way. Without a sink the read returns every
// item, as it always did — the shape the paging tests pin.
export async function readLive({
  delaysMs = RETRY_DELAYS_MS,
  onItems = null,
  progress = null,
} = {}) {
  const first = await fetchJson(`${ITEMS_URL}?limit=1&f=json`, "the rivers & sea count");
  const expected = first.numberMatched;
  if (!Number.isInteger(expected) || expected <= 0)
    throw new Error("contract failure: the rivers & sea items response carries no numberMatched");
  const edition = await fetchEdition();
  const totals = createTotals(VOCAB);
  // BUG-204: the paged read is the run's long phase — the
  // service's own count is the total, so the log carries a
  // real percentage, a line every twentieth of the read.
  const readTally = progress?.tally({
    label: "read",
    total: expected,
    every: Math.max(1, Math.ceil(expected / 20)),
    unit: "features",
  });
  const sift = onItems ? createGoldenSift(HOMES) : null;
  const items = [];
  let startIndex = 0;
  // BUG-248: the paged read is the run's long phase — a
  // heartbeat every half of the read or 15 minutes, and a
  // warning for a page that takes more than 3x the recent
  // average. The fixture read is not wired: it is local,
  // fast, and its line count is pinned by test.
  const readWatch = createBatchWatch();
  const heartbeatEvery = Math.max(1, Math.ceil(expected / 2));
  while (totals.read < expected) {
    const started = Date.now();
    const page = await fetchRiversSeaPage(startIndex, expected, totals.read, delaysMs);
    const batch = page.features;
    const processed = processFeatures(batch);
    totals.addBatch(processed, batch.length);
    const { tookMs, averageMs, slow } = readWatch.observe(Date.now() - started);
    readTally?.tick(totals.read);
    progress?.heartbeat({
      stage: "read",
      done: totals.read,
      total: expected,
      every: heartbeatEvery,
    });
    if (slow) {
      progress?.warning({
        what: "read page duration",
        value: `page at startIndex ${startIndex} took ${formatDuration(tookMs)}`,
        threshold: `3x recent average ${formatDuration(averageMs)}`,
      });
    }
    if (onItems) {
      for (const item of processed.items) sift.offer(item);
      await onItems(processed.items, edition);
    } else {
      items.push(...processed.items);
    }
    startIndex += batch.length;
  }
  readTally?.finish(totals.read);
  return {
    items: onItems ? sift.items : items,
    filed: totals.filed,
    geoless: totals.geoless,
    perLabel: totals.perLabel,
    read: totals.read,
    expected,
    edition,
    captured: null,
  };
}

// A fixture file too large for one connector push is held as
// numbered parts (<stem>-1.geojson, <stem>-2.geojson, ...)
// whose feature arrays concatenate to the capture, in order.
async function fixturePartNames(fixtureDir, fileName) {
  const stem = fileName.replace(/\.geojson$/, "");
  const entries = await readdir(fixtureDir);
  const partNames = entries
    .filter((name) => new RegExp(`^${stem}-\\d+\\.geojson$`).test(name))
    .sort();
  const names = entries.includes(fileName) ? [fileName] : partNames;
  if (names.length === 0) throw new Error(`contract failure: no fixture file for ${fileName}`);
  return names;
}

// The fixture read streams like the live read (BUG-187):
// one part at a time is parsed, processed and handed to the
// sink, then released — the parts' feature arrays are never
// concatenated in memory. The totals and the golden sift
// are the same as the live read's.
export async function readFixture(fixtureDir, { onItems = null, progress = null } = {}) {
  const stamp = JSON.parse(await readFile(join(fixtureDir, "fixture.json"), "utf8"));
  if (!stamp.edition)
    throw new Error("contract failure: the rivers & sea fixture carries no edition stamp");
  const names = await fixturePartNames(fixtureDir, "flood-rivers-sea.geojson");
  const totals = createTotals(VOCAB);
  const sift = onItems ? createGoldenSift(HOMES) : null;
  const items = [];
  for (const [part, name] of names.entries()) {
    const body = JSON.parse(await readFile(join(fixtureDir, name), "utf8"));
    const features = body.features ?? [];
    const processed = processFeatures(features);
    totals.addBatch(processed, features.length);
    if (onItems) {
      for (const item of processed.items) sift.offer(item);
      await onItems(processed.items, stamp.edition);
    } else {
      items.push(...processed.items);
    }
    // BUG-204: a line per part — the fixture's own part
    // count is the total, with the running feature count.
    progress?.count({
      label: "fixture",
      done: part + 1,
      total: names.length,
      unit: "parts",
      extra: `${formatCount(totals.read)} features read`,
    });
  }
  if (totals.read === 0) throw new Error("contract failure: the rivers & sea fixture is empty");
  return {
    items: onItems ? sift.items : items,
    filed: totals.filed,
    geoless: totals.geoless,
    perLabel: totals.perLabel,
    read: totals.read,
    expected: totals.read,
    edition: stamp.edition,
    captured: stamp.captured ?? null,
  };
}

// --- golden checks ---------------------------------------------------

export function checkGolden(processed) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  const filed = processed.items;
  const covering = (home) =>
    filed.filter((item) => polygonsContain(item.polygons, home.lng, home.lat));

  // The Exeter composition, rivers & sea half: a FILED
  // "Very low" polygon covers the point. This is one half of
  // the step's check — the zones loader asserts Zone 3 at
  // the same point — and the two loaders' rows coexist in
  // flood_layers under different layer_types.
  const exeter = covering(HOMES["E16 1GN"]);
  expect(
    exeter.length >= 1 && exeter.every((item) => item.label === "Very low"),
    `E16 1GN: the point should be covered by a filed Very low polygon, got ${
      exeter.map((i) => i.label).join(", ") || "no shape"
    }`,
  );
  // The nearest other ground is High at 0.159 miles — the
  // defended picture is local, not a blanket.
  const exeterOthers = filed.filter((item) => !exeter.includes(item));
  const exeterNear = nearestEdge(exeterOthers, HOMES["E16 1GN"]);
  expect(
    exeterNear && exeterNear.item.label === "High" && Math.abs(exeterNear.miles - 0.159) <= 0.02,
    `E16 1GN: the nearest other rivers & sea polygon should be High at 0.159 mi, got ${
      exeterNear ? `${exeterNear.item.label} at ${exeterNear.miles.toFixed(3)} mi` : "none"
    }`,
  );

  // Birkdale and Epsom: ABSENCE — no shape at the point, and
  // the nearest is Low at 0.84 / 0.40 miles. Asserted as
  // absence, in the same run that asserts Exeter's filed
  // Very low above: the two states are different facts (L6),
  // and a build that filed synthetic absence polygons or
  // served absence as a band could not pass both halves.
  for (const [postcode, miles] of [
    ["CM3 2JT", 0.84],
    ["KT17 1FH", 0.4],
  ]) {
    const home = HOMES[postcode];
    expect(
      covering(home).length === 0,
      `${postcode}: a rivers & sea shape covers the point — the golden reads say no shape (absence, not a band)`,
    );
    const near = nearestEdge(filed, home);
    expect(
      near && near.item.label === "Low" && Math.abs(near.miles - miles) <= 0.03,
      `${postcode}: the nearest rivers & sea shape should be Low at ${miles} mi, got ${
        near ? `${near.item.label} at ${near.miles.toFixed(3)} mi` : "none"
      }`,
    );
  }
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

// --- filing ------------------------------------------------------------

// Stage, count, repair, swap — one transaction, fed as a
// stream (BUG-187). beginFiling opens the transaction and
// the staging table; stageItems converts each batch to WKT
// and inserts it in the house chunks (25 rows / 4 MB), so
// neither the item set nor its WKT copy is ever held whole;
// finishFiling runs the counts and the swap exactly as the
// one-shot filer did. The staged shapes are counted (source
// count == staged == filed), the topologically invalid ones
// are counted BEFORE repair so the log line can carry the
// number (L4), and the swap files ST_MakeValid output only:
// a filed shape that is still invalid, or was emptied by
// repair, fails the run and rolls everything back — as does
// any failure mid-stream, via abortFiling.
async function beginFiling() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `CREATE TEMP TABLE flood_stage (
         layer_type text, risk_label text, geom geometry(MultiPolygon, 4326),
         layer_date date, detail text, source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now()
       ) ON COMMIT DROP`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
    throw error;
  }
  const pending = [];
  let pendingBytes = 0;
  async function flushPending() {
    if (pending.length === 0) return;
    const values = [];
    const params = [];
    pending.forEach((row, i) => {
      const base = i * 7;
      values.push(
        `($${base + 1},$${base + 2},ST_GeomFromText($${base + 3}, 4326),$${base + 4},$${base + 5},$${base + 6},$${base + 7})`,
      );
      params.push(
        LAYER_TYPE,
        row.label,
        row.wkt,
        row.edition,
        row.detail,
        SOURCE_NAME,
        row.edition,
      );
    });
    await client.query(
      `INSERT INTO flood_stage (layer_type, risk_label, geom, layer_date, detail, source_name, source_date)
       VALUES ${values.join(",")}`,
      params,
    );
    pending.length = 0;
    pendingBytes = 0;
  }
  return {
    async stageItems(items, edition) {
      for (const item of items) {
        const wkt = polygonsToWkt(item.polygons);
        pending.push({ wkt, label: item.label, detail: item.detail, edition });
        pendingBytes += wkt.length;
        if (pending.length >= 25 || pendingBytes >= 4_000_000) await flushPending();
      }
    },
    async finishFiling(expectedCount) {
      try {
        await flushPending();
        const staged = await client.query("SELECT count(*)::int AS n FROM flood_stage");
        if (staged.rows[0].n !== expectedCount)
          throw new Error("the staged shape count does not match — rolling back");
        const invalidStaged = await client.query(
          "SELECT count(*)::int AS n FROM flood_stage WHERE NOT ST_IsValid(geom)",
        );
        const invalidCount = invalidStaged.rows[0].n;
        await client.query("DELETE FROM flood_layers WHERE layer_type = $1", [LAYER_TYPE]);
        await client.query(
          `INSERT INTO flood_layers (layer_type, risk_label, geom, layer_date, detail, source_name, source_date, loaded_at)
           SELECT layer_type, risk_label, ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3)), layer_date, detail, source_name, source_date, loaded_at FROM flood_stage`,
        );
        const filedCount = await client.query(
          "SELECT count(*)::int AS n FROM flood_layers WHERE layer_type = $1",
          [LAYER_TYPE],
        );
        if (filedCount.rows[0].n !== expectedCount)
          throw new Error("the filed shape count does not match — rolling back");
        const emptied = await client.query(
          "SELECT count(*)::int AS n FROM flood_layers WHERE layer_type = $1 AND ST_IsEmpty(geom)",
          [LAYER_TYPE],
        );
        if (emptied.rows[0].n !== 0)
          throw new Error(
            `${emptied.rows[0].n} shapes were emptied by validity repair — rolling back (L4: never drop silently)`,
          );
        const invalidFiled = await client.query(
          "SELECT count(*)::int AS n FROM flood_layers WHERE layer_type = $1 AND NOT ST_IsValid(geom)",
          [LAYER_TYPE],
        );
        if (invalidFiled.rows[0].n !== 0)
          throw new Error(`${invalidFiled.rows[0].n} filed shapes are invalid — rolling back`);
        await client.query("COMMIT");
        return invalidCount;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        await client.end();
      }
    },
    async abortFiling() {
      await client.query("ROLLBACK").catch(() => {});
      await client.end().catch(() => {});
    },
  };
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;
  // BUG-204: one logger for the run — the read tally
  // and the filing marker below.
  const progress = createProgressLogger({ name: "load-flood-rivers-sea" });

  // A filing run streams the read into the staging
  // transaction as it lands (BUG-187), so the database check
  // moves ahead of the read: without DATABASE_URL a filing
  // run now fails before fetching instead of after it.
  // Verify-only never opens the database.
  let filer = null;
  if (!verifyOnly) {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL is not set — filing requires a database");
    filer = await beginFiling();
  }

  let processed;
  try {
    const onItems = async (items, edition) => {
      if (filer) await filer.stageItems(items, edition);
    };
    processed = fixtureMode
      ? await readFixture(fixtureDir, { onItems, progress })
      : await readLive({ onItems, progress });

    if (!fixtureMode) {
      const lo = Math.floor(SNAPSHOT * 0.9);
      const hi = Math.ceil(SNAPSHOT * 1.1);
      if (processed.read < lo || processed.read > hi)
        throw new Error(
          `sanity failure: ${processed.read} rivers & sea features is outside the expected band (${lo}–${hi}, the 12 Nov 2026 snapshot ±10%)`,
        );
    }
    if (processed.read !== processed.expected)
      throw new Error(
        `rivers & sea: read ${processed.read} features but the service count is ${processed.expected} — nothing filed`,
      );
    if (processed.filed + processed.geoless !== processed.read)
      throw new Error("rivers & sea: the processed counts do not reconcile — nothing filed");
    checkGolden(processed);
  } catch (error) {
    // BUG-248: the read, sanity band, reconciliation and
    // golden checks all fail before anything is filed.
    progress.failed({
      stage: "read",
      filed: 0,
      error,
      resume: "re-run the loader from the start (nothing is filed until the swap)",
    });
    if (filer) await filer.abortFiling();
    throw error;
  }

  const perLabel = VOCAB.map((label) => `${label} ${formatCount(processed.perLabel[label])}`).join(
    " · ",
  );
  const summary = () =>
    `load-flood-rivers-sea · Environment Agency Risk of Flooding from Rivers and Sea · edition ${processed.edition}` +
    (processed.captured ? ` (fixture captured ${processed.captured})` : "") +
    ` · ${formatCount(processed.filed)} features filed (${formatCount(processed.read)} read · ${perLabel} · ${formatCount(processed.geoless)} without geometry counted)`;

  if (verifyOnly) {
    console.log(
      `${summary()} · golden homes OK (verify only, nothing filed — the invalid-geometry count is proven at filing)`,
    );
    return;
  }

  const activeFiler = filer;
  filer = null;
  progress.stage(
    `filing ${formatCount(processed.filed)} features — counts, validity repair and swap`,
  );
  let invalidCount;
  try {
    invalidCount = await activeFiler.finishFiling(processed.filed);
  } catch (err) {
    // BUG-248: the filing swap is atomic — on a rollback
    // the live layer is untouched.
    progress.failed({
      stage: "filing",
      filed: 0,
      total: processed.filed,
      error: err,
      resume:
        "re-run the loader from the start (the swap rolled back, the live layer is untouched)",
    });
    throw err;
  }
  console.log(
    `${summary()} · ${formatCount(invalidCount)} invalid geometries made valid · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      `load-flood-rivers-sea FAILED: ${error.message}${error.cause ? ` (${error.cause.message ?? error.cause})` : ""}`,
    );
    process.exitCode = 1;
  });
}
