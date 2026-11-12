// Flood zones loader (plan step M5.1). Files the Environment
// Agency's Flood Map for Planning zones — Flood Zone 2 and
// Flood Zone 3 — as shapes, following the user-seat gap check
// of 12 Nov 2026:
//
//   npm run load:flood-zones
//   npm run load:flood-zones -- --verify-only
//   npm run load:flood-zones -- --file tests/fixtures/flood-zones
//
// This is ONE of three flood loaders, and the three products
// are never merged (gap L1): the zones are a planning
// instrument computed as if flood defences did not exist;
// the rivers & sea bands (load-flood-rivers-sea) count the
// defences; surface water (load-flood-surface-water) is a
// different water source entirely. At the Exeter golden home
// the zones say Zone 3 and the rivers & sea bands say Very
// low, at the same point, and both are right — any code path
// that averages them into one "flood risk" fact destroys
// that. Each loader files its own layer_type, its own
// edition stamp, its own log line.
//
// What the gap check changed, and where it lives in this file:
//   - L2, published detail has a home. flood_source ("river",
//     "sea", "river and sea") and origin ("modelled",
//     "modelled and recorded", ...) are part of the published
//     fact — Exeter's zone says "river and sea" — so migration
//     0008 added flood_layers.detail and this loader files
//     "source · origin" there. risk_label stays the clean
//     vocabulary {FZ2, FZ3} that the contract check guards.
//   - L3, shapes file exactly as published. No buffering, no
//     snapping, no simplification — the surface-water pins in
//     the sibling loader turn on metres, and the same
//     discipline holds here. The only repair is PostGIS
//     ST_MakeValid at filing time (L4), which fixes structure
//     without moving boundaries by design.
//   - L4, invalid geometries are counted, never dropped. The
//     count comes from the database step (ST_IsValid on the
//     staged shapes), every filed shape is made valid via
//     ST_MakeValid, a filed-invalid or emptied shape fails
//     the run, and staging is chunked by rows and by bytes —
//     these are dissolved, vertex-heavy multipolygons.
//   - L5, counts are computed from the fetched data, never
//     from the service's filtered counts: the OGC service
//     silently ignores property filters (measured in the
//     prep — a flood_zone=FZ2 query returned the full
//     415,408). The only service figure trusted is the
//     unfiltered numberMatched, the oracle the paged read
//     must reconcile with exactly.
//   - L6, absence is computed, never filed. Zone 1 is not in
//     this dataset BY DEFINITION — it is everything not in
//     Zones 2 or 3 — so no synthetic Zone 1 polygon exists in
//     flood_layers; Birkdale's Zone 1 state is proven by the
//     empty-result proof (the full count filed in the same
//     run that asserts the point is inside none of them).
//
// The edition stamp is the serving system's own: the WMS
// build layer is named Flood_Zones_2_3_Rivers_and_Sea_
// 21_10_2026, and the loader parses that date out of the
// capabilities document — the same fact the CSW metadata
// record states as the dataset's revision date (21 Oct
// 2026). If no dated build layer is published, the run
// fails: provenance is not guessed.
//
// Source: Environment Agency via the Defra Data Services
// Platform (OGC API Features, dataset 04532375-a198-476e-
// 985e-0579a0a11b47), Open Government Licence; © Environment
// Agency copyright and/or database right. The zones "are not
// suitable for showing whether an individual property is at
// risk of flooding" (EA's words) — the product serves them
// as area facts about a point and its surroundings, and the
// distances are to the nearest polygon EDGE on the
// longitude-scaled plane (miles = degrees of latitude x
// 69.05), the prep's basis.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const ITEMS_URL =
  "https://environment.data.gov.uk/geoservices/datasets/04532375-a198-476e-985e-0579a0a11b47/ogc/features/v1/collections/Flood_Zones_2_3_Rivers_and_Sea/items";
const WMS_URL =
  "https://environment.data.gov.uk/spatialdata/flood-map-for-planning-flood-zones/wms?service=WMS&version=1.3.0&request=GetCapabilities";
const COLLECTION = "Flood_Zones_2_3_Rivers_and_Sea";
const LAYER_TYPE = "flood_zone";
const SOURCE_NAME = "Environment Agency — Flood Map for Planning (Flood Zones 2 and 3)";
const VOCAB = ["FZ2", "FZ3"];
const SOURCES = ["river", "sea", "river and sea"];
const PAGE = 250;
const SNAPSHOT = 415408; // the service's unfiltered count, 12 Nov 2026

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
// "<collection>_DD_MM_YYYY" beside the plain one. Every
// dated match must agree — two builds in one document would
// mean the service is mid-republication and the honest move
// is to fail and retry later.
async function fetchEdition() {
  const xml = await fetchText(WMS_URL, "the flood zones WMS capabilities");
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
// counted, never filed; malformed geometry and any label,
// source or origin outside the published vocabularies fail
// the run (the contract check, gap L3/L5: labels are read
// off the fetched features themselves, never trusted from a
// filtered query).
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
    const label = props.flood_zone;
    if (!VOCAB.includes(label))
      throw new Error(`contract failure: flood_zone "${label}" is outside {FZ2, FZ3}`);
    const source = props.flood_source;
    if (!SOURCES.includes(source))
      throw new Error(
        `contract failure: flood_source "${source}" is outside {river, sea, river and sea}`,
      );
    const origin = props.origin;
    if (typeof origin !== "string" || origin === "")
      throw new Error("contract failure: a zone feature carries no origin");
    perLabel[label] += 1;
    items.push({
      label,
      detail: `${source} · ${origin}`,
      polygons,
      bbox: bboxOf(polygons),
    });
  }
  if (malformed > 0)
    throw new Error(
      `flood zones: ${malformed} features carry geometry that does not parse — contract failure, nothing filed`,
    );
  return { items, geoless, perLabel };
}

// The whole collection, read by paging: the unfiltered
// numberMatched is the oracle (L5), every page must restate
// it, and the read must reconcile exactly or file nothing.
// Pages are processed as they land, so the raw GeoJSON of a
// page is released before the next arrives.
async function readLive() {
  const first = await fetchJson(`${ITEMS_URL}?limit=1&f=json`, "the flood zones count");
  const expected = first.numberMatched;
  if (!Number.isInteger(expected) || expected <= 0)
    throw new Error("contract failure: the zones items response carries no numberMatched");
  const edition = await fetchEdition();
  const items = [];
  const perLabel = Object.fromEntries(VOCAB.map((label) => [label, 0]));
  let geoless = 0;
  let read = 0;
  let startIndex = 0;
  while (read < expected) {
    const page = await fetchJson(
      `${ITEMS_URL}?limit=${PAGE}&startIndex=${startIndex}&f=json`,
      "the flood zones features",
    );
    if (page.numberMatched !== expected)
      throw new Error(
        `contract failure: the zones count moved mid-read (${expected} -> ${page.numberMatched}) — nothing filed`,
      );
    const batch = page.features ?? [];
    if (batch.length === 0)
      throw new Error(`flood zones: paging stopped at ${read} of ${expected} features`);
    const processed = processFeatures(batch);
    items.push(...processed.items);
    geoless += processed.geoless;
    for (const label of VOCAB) perLabel[label] += processed.perLabel[label];
    read += batch.length;
    startIndex += batch.length;
  }
  return { items, geoless, perLabel, read, expected, edition, captured: null };
}

// A fixture file too large for one connector push is held as
// numbered parts (<stem>-1.geojson, <stem>-2.geojson, ...)
// whose feature arrays concatenate to the capture, in order.
async function readFixtureFeatures(fixtureDir, fileName) {
  const stem = fileName.replace(/\.geojson$/, "");
  const entries = await readdir(fixtureDir);
  const partNames = entries
    .filter((name) => new RegExp(`^${stem}-\\d+\\.geojson$`).test(name))
    .sort();
  const names = entries.includes(fileName) ? [fileName] : partNames;
  if (names.length === 0) throw new Error(`contract failure: no fixture file for ${fileName}`);
  const features = [];
  for (const name of names) {
    const body = JSON.parse(await readFile(join(fixtureDir, name), "utf8"));
    features.push(...(body.features ?? []));
  }
  return features;
}

async function readFixture(fixtureDir) {
  const stamp = JSON.parse(await readFile(join(fixtureDir, "fixture.json"), "utf8"));
  if (!stamp.edition)
    throw new Error("contract failure: the flood zones fixture carries no edition stamp");
  const raw = await readFixtureFeatures(fixtureDir, "flood-zones.geojson");
  if (raw.length === 0) throw new Error("contract failure: the flood zones fixture is empty");
  const processed = processFeatures(raw);
  return {
    ...processed,
    read: raw.length,
    expected: raw.length,
    edition: stamp.edition,
    captured: stamp.captured ?? null,
  };
}

// --- golden checks ---------------------------------------------------

function checkGolden(processed) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  const filed = processed.items;
  const covering = (home) =>
    filed.filter((item) => polygonsContain(item.polygons, home.lng, home.lat));

  // The Exeter composition, zones half: exactly one zone
  // polygon covers the point, it is FZ3, and its published
  // source and origin survive into detail. The origin is
  // "modelled" — pinned deliberately: the prep paperwork
  // recorded "modelled and recorded", but that value belongs
  // to a neighbouring FZ3 feature; the covering feature
  // (…155716) says "modelled" in both services' captures,
  // and this check fails loudly if a republication changes
  // which feature covers the point or what it says.
  const exeter = covering(HOMES["E16 1GN"]);
  expect(
    exeter.length >= 1 && exeter.every((item) => item.label === "FZ3"),
    `E16 1GN: the point should be covered by FZ3 only, got ${exeter.map((i) => i.label).join(", ") || "none"}`,
  );
  expect(
    exeter.some((item) => item.detail === "river and sea · modelled"),
    `E16 1GN: the covering FZ3 should carry detail "river and sea · modelled", got ${exeter
      .map((i) => i.detail)
      .join(" | ")}`,
  );

  // Birkdale: inside no zone (Zone 1 by absence — L6), with
  // the nearest edge an FZ2 from the river at 0.84 miles.
  const birkdale = covering(HOMES["CM3 2JT"]);
  expect(
    birkdale.length === 0,
    "CM3 2JT: the point falls inside a flood zone — the golden reads say inside none",
  );
  const birkdaleNear = nearestEdge(filed, HOMES["CM3 2JT"]);
  expect(
    birkdaleNear &&
      birkdaleNear.item.label === "FZ2" &&
      birkdaleNear.item.detail.startsWith("river · ") &&
      Math.abs(birkdaleNear.miles - 0.84) <= 0.03,
    `CM3 2JT: the nearest zone edge should be an FZ2 (river) at 0.84 mi, got ${
      birkdaleNear
        ? `${birkdaleNear.item.label} (${birkdaleNear.item.detail}) at ${birkdaleNear.miles.toFixed(3)} mi`
        : "none"
    }`,
  );

  // Epsom: inside none; nearest FZ2 (river) at 0.40 miles.
  const epsom = covering(HOMES["KT17 1FH"]);
  expect(
    epsom.length === 0,
    "KT17 1FH: the point falls inside a flood zone — the golden reads say inside none",
  );
  const epsomNear = nearestEdge(filed, HOMES["KT17 1FH"]);
  expect(
    epsomNear && epsomNear.item.label === "FZ2" && Math.abs(epsomNear.miles - 0.4) <= 0.03,
    `KT17 1FH: the nearest zone edge should be an FZ2 at 0.40 mi, got ${
      epsomNear ? `${epsomNear.item.label} at ${epsomNear.miles.toFixed(3)} mi` : "none"
    }`,
  );

  // Zone exclusivity at the goldens: no point is inside both
  // an FZ2 and an FZ3 polygon.
  for (const [postcode, home] of Object.entries(HOMES)) {
    const labels = new Set(covering(home).map((item) => item.label));
    expect(
      !(labels.has("FZ2") && labels.has("FZ3")),
      `${postcode}: the point is inside both FZ2 and FZ3 polygons`,
    );
  }
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

// --- filing ------------------------------------------------------------

// Stage, count, repair, swap — one transaction. The staged
// shapes are counted (source count == staged == filed), the
// topologically invalid ones are counted BEFORE repair so
// the log line can carry the number (L4), and the swap files
// ST_MakeValid output only: a filed shape that is still
// invalid, or was emptied by repair, fails the run and rolls
// everything back.
async function fileItems(items, edition) {
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
    const rows = items.map((item) => ({
      wkt: polygonsToWkt(item.polygons),
      label: item.label,
      detail: item.detail,
    }));
    let at = 0;
    while (at < rows.length) {
      const chunk = [];
      let bytes = 0;
      while (at < rows.length && chunk.length < 25 && bytes < 4_000_000) {
        chunk.push(rows[at]);
        bytes += rows[at].wkt.length;
        at += 1;
      }
      const values = [];
      const params = [];
      chunk.forEach((row, i) => {
        const base = i * 7;
        values.push(
          `($${base + 1},$${base + 2},ST_GeomFromText($${base + 3}, 4326),$${base + 4},$${base + 5},$${base + 6},$${base + 7})`,
        );
        params.push(LAYER_TYPE, row.label, row.wkt, edition, row.detail, SOURCE_NAME, edition);
      });
      await client.query(
        `INSERT INTO flood_stage (layer_type, risk_label, geom, layer_date, detail, source_name, source_date)
         VALUES ${values.join(",")}`,
        params,
      );
    }
    const staged = await client.query("SELECT count(*)::int AS n FROM flood_stage");
    if (staged.rows[0].n !== items.length)
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
    if (filedCount.rows[0].n !== items.length)
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
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;

  const processed = fixtureMode ? await readFixture(fixtureDir) : await readLive();

  if (!fixtureMode) {
    const lo = Math.floor(SNAPSHOT * 0.9);
    const hi = Math.ceil(SNAPSHOT * 1.1);
    if (processed.read < lo || processed.read > hi)
      throw new Error(
        `sanity failure: ${processed.read} flood zone features is outside the expected band (${lo}–${hi}, the 12 Nov 2026 snapshot ±10%)`,
      );
  }
  if (processed.read !== processed.expected)
    throw new Error(
      `flood zones: read ${processed.read} features but the service count is ${processed.expected} — nothing filed`,
    );
  if (processed.items.length + processed.geoless !== processed.read)
    throw new Error("flood zones: the processed counts do not reconcile — nothing filed");
  checkGolden(processed);

  const perLabel = VOCAB.map((label) => `${label} ${processed.perLabel[label]}`).join(" · ");
  const summary = () =>
    `load-flood-zones · Environment Agency Flood Map for Planning zones · edition ${processed.edition}` +
    (processed.captured ? ` (fixture captured ${processed.captured})` : "") +
    ` · ${processed.items.length} features filed (${processed.read} read · ${perLabel} · ${processed.geoless} without geometry counted)`;

  if (verifyOnly) {
    console.log(
      `${summary()} · golden homes OK (verify only, nothing filed — the invalid-geometry count is proven at filing)`,
    );
    return;
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not set — filing requires a database");

  const invalidCount = await fileItems(processed.items, processed.edition);
  console.log(
    `${summary()} · ${invalidCount} invalid geometries made valid · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`,
  );
}

main().catch((error) => {
  console.error(
    `load-flood-zones FAILED: ${error.message}${error.cause ? ` (${error.cause.message ?? error.cause})` : ""}`,
  );
  process.exitCode = 1;
});
