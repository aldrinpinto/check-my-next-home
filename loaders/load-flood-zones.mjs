// Flood zones loader (plan step M5.1). Files the Environment
// Agency's Flood Map for Planning zones — Flood Zone 2 and
// Flood Zone 3 — as shapes, following the user-seat gap check
// of 12 Nov 2026:
//
//   npm run load:flood-zones
//   npm run load:flood-zones -- --verify-only
//   npm run load:flood-zones -- --file tests/fixtures/flood-zones
//   npm run load:flood-zones -- --restart
//
// BUG-366 (26 Nov 2026): the read is resumable. Staging is a
// persistent table and a checkpoint records the last fully
// staged page as the read proceeds (one progress line per
// checkpoint), so a run killed mid-read resumes from the
// checkpoint instead of starting from zero. --restart discards
// the checkpoint and staging and starts from zero.
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
//     "sea", "river and sea", "unknown") and origin
//     ("modelled", "modelled and recorded", ...) are part of
//     the published fact — Exeter's zone says "river and
//     sea" — so migration 0008 added flood_layers.detail and
//     this loader files "source · origin" there. risk_label
//     stays the clean vocabulary {FZ2, FZ3} that the contract
//     check guards. D27 (15 Nov 2026): the live collection
//     began publishing shapes whose flood_source is
//     "unknown" (origin "local evidence") after the 12 Nov
//     2026 capture — the word is admitted as published and
//     files verbatim ("unknown · local evidence"); the
//     finding is recorded in tests/golden-matrix.md (M6.5).
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
import { fileURLToPath } from "node:url";
import pg from "pg";
import { bboxOfPolygons, createGoldenSift, createTotals } from "./flood-stream.mjs";
import {
  createFloodResume,
  isTransientFetchError,
  TRANSIENT_RETRY_BUDGET_MS,
} from "./flood-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
  withFilingPulse,
} from "./progress.mjs";
import { createShortPageTracker, isShortPage, verifyReadCounts } from "./read-tolerance.mjs";

const ITEMS_URL =
  "https://environment.data.gov.uk/geoservices/datasets/04532375-a198-476e-985e-0579a0a11b47/ogc/features/v1/collections/Flood_Zones_2_3_Rivers_and_Sea/items";
const WMS_URL =
  "https://environment.data.gov.uk/spatialdata/flood-map-for-planning-flood-zones/wms?service=WMS&version=1.3.0&request=GetCapabilities";
const COLLECTION = "Flood_Zones_2_3_Rivers_and_Sea";
const LAYER_TYPE = "flood_zone";
const SOURCE_NAME = "Environment Agency — Flood Map for Planning (Flood Zones 2 and 3)";
const VOCAB = ["FZ2", "FZ3"];
const SOURCES = ["river", "sea", "river and sea", "unknown"];
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
// BUG-384: a transient fetch failure is retried for up to 30
// minutes (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
// 2026) — the old 5-attempt budget died after ~3 minutes of
// connect timeouts (BUG-381) and took a 5-hour read with it.
// Past the budget the original error fails the run and it
// waits. The delay caps at the last schedule entry; a test
// may pass delaysMs: [] for instant retries. Non-transient
// failures throw at once (see isTransientFetchError):
// retrying them cannot help.
async function fetchResponse(
  url,
  what,
  { delaysMs = RETRY_DELAYS_MS, onRetry = null, retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS } = {},
) {
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${what}`);
        error.status = response.status;
        throw error;
      }
      return response;
    } catch (error) {
      if (!isTransientFetchError(error)) throw error;
      // BUG-384 cap: 30 minutes of retrying, then the run
      // dies with the original error and waits (founder's
      // rule) — a dead service never parks it forever.
      if (Date.now() - startedAt >= retryBudgetMs) throw error;
      const delay =
        delaysMs.length === 0 ? 0 : delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      onRetry?.(error, attempt, delay, what);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
async function fetchJson(url, what, opts) {
  return (await fetchResponse(url, what, opts)).json();
}
async function fetchText(url, what, opts) {
  return (await fetchResponse(url, what, opts)).text();
}

// The edition date, from the serving system's own build
// stamp: the WMS capabilities name a dated build layer
// "<collection>_DD_MM_YYYY" beside the plain one. Every
// dated match must agree — two builds in one document would
// mean the service is mid-republication and the honest move
// is to fail and retry later.
async function fetchEdition(opts) {
  const xml = await fetchText(WMS_URL, "the flood zones WMS capabilities", opts);
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
// filtered query). One exception, BUG-389 (27 Nov 2026): a
// missing flood_source (null or absent) files as "unknown"
// instead of failing the run — the live service published
// exactly one such shape (…410161, FZ2, origin "recorded",
// flood_source null, page at startIndex 409,991) and it
// killed two runs at 99%; "unknown" is already in the
// published vocabulary, so nothing is invented. The mapped
// count is returned as nullSource and logged per page/part
// by the callers. Any other out-of-vocabulary value still
// fails the run.
function processFeatures(raw) {
  let geoless = 0;
  let malformed = 0;
  let nullSource = 0;
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
    // BUG-389: a missing source is "unknown", not a failure.
    let source = props.flood_source;
    if (source === null || source === undefined) {
      source = "unknown";
      nullSource += 1;
    }
    if (!SOURCES.includes(source))
      throw new Error(
        `contract failure: flood_source "${source}" is outside {river, sea, river and sea, unknown}`,
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
  return { items, geoless, perLabel, nullSource };
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

// One items page, fetched and judged (the guard pattern the
// 13 Nov 2026 PHI diagnosis set, scratch-nature/PHI-DIAGNOSIS.md:
// a body the service failed with must never read as a page of
// data — above all, never as an empty page that ends the read).
// Two retry levels, kept apart: the fetch retries transient
// TRANSPORT failures within the 30-minute retry budget
// (fetchResponse, BUG-384),
// while a page whose BODY fails the contract is re-requested
// in place within the delays budget — a single glitched page
// must not kill the run, and a page that stays bad past the
// budget fails loudly and files nothing. The transport call
// sits OUTSIDE the try: a non-transient fetch failure (a 404,
// an auth error) is not a bad body and is never re-requested
// here. The count oracle must be restated, the features
// member must be an array, and an empty page while the count
// says more remain is a failed page.
async function fetchZonesPage(
  startIndex,
  expected,
  read,
  delaysMs = RETRY_DELAYS_MS,
  onRetry = null,
  retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS,
) {
  let lastError = null;
  for (let attempt = 1; attempt <= delaysMs.length + 1; attempt++) {
    const response = await fetchResponse(
      `${ITEMS_URL}?limit=${PAGE}&startIndex=${startIndex}&f=json`,
      "the flood zones features",
      { delaysMs, onRetry, retryBudgetMs },
    );
    try {
      const page = await response.json();
      const errorText = serviceErrorText(page);
      if (errorText)
        throw new Error(
          `the flood zones service returned an error for the page at startIndex ${startIndex}: ${errorText}`,
        );
      if (page?.numberMatched !== expected)
        throw new Error(
          `contract failure: the zones count moved mid-read (${expected} -> ${page?.numberMatched}) — nothing filed`,
        );
      if (!Array.isArray(page.features))
        throw new Error(
          `the the flood zones service returned an error for the page at startIndex ${startIndex} carries no features array`,
        );
      if (page.features.length === 0)
        throw new Error(`flood zones: paging stopped at ${read} of ${expected} features`);
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
/**
 * @param {{ delaysMs?: number[], retryBudgetMs?: number, onItems?: ((items: any[], edition: string) => Promise<void>) | null, progress?: import("./progress.mjs").ProgressLogger | null, resume?: any }} [options]
 */
export async function readLive({
  delaysMs = RETRY_DELAYS_MS,
  retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS,
  onItems = null,
  progress = null,
  resume = null,
} = {}) {
  // BUG-384: a fetch retry earns a visible warning line, so a
  // run parked on a down service shows in the log instead of
  // looking stalled.
  const onRetry = (error, attempt, delay, what) =>
    progress?.warning({
      what: "fetch retry",
      value: `${what} attempt ${attempt} failed (${String(error?.message ?? error).split(/\r?\n/)[0]})`,
      threshold: `retrying in ${formatDuration(delay)}`,
    });
  const first = await fetchJson(`${ITEMS_URL}?limit=1&f=json`, "the flood zones count", {
    delaysMs,
    onRetry,
    retryBudgetMs,
  });
  const expected = first.numberMatched;
  if (!Number.isInteger(expected) || expected <= 0)
    throw new Error("contract failure: the zones items response carries no numberMatched");
  const edition = await fetchEdition({ delaysMs, onRetry, retryBudgetMs });
  // BUG-366: resume — a checkpoint for this loader, edition and
  // count lets the read pick up where a killed run stopped
  // instead of starting from zero. The totals seed from the
  // checkpoint, so every feature counts once across the two runs.
  let startIndex = 0;
  let resumed = null;
  if (resume) {
    resumed = await resume.prepare({ edition, expected });
    if (resumed.resumed) startIndex = resumed.checkpoint.next_start_index;
  }
  const totals = createTotals(VOCAB, resumed?.resumed ? resumed.checkpoint : null);
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
  if (resumed?.resumed && sift) {
    // The staged portion's golden candidates, rebuilt from the
    // staging table — the sift in this process only ever sees
    // the portion read after the resume point, and the golden
    // checks at the end run over the whole read either way.
    for (const row of await resume.stagedGoldenRows(HOMES)) {
      const polygons = geojsonPolygons(JSON.parse(row.geojson));
      sift.items.push({
        label: row.risk_label,
        detail: row.detail,
        polygons,
        bbox: bboxOfPolygons(polygons),
      });
    }
  }
  const items = [];
  // BUG-248: the paged read is the run's long phase — a
  // heartbeat every half of the read or 15 minutes, and a
  // warning for a page that takes more than 3x the recent
  // average. The fixture read is not wired: it is local,
  // fast, and its line count is pinned by test.
  const readWatch = createBatchWatch();
  const heartbeatEvery = Math.max(1, Math.ceil(expected / 2));
  let nullSourceTotal = 0;
  // BUG-387: the short pages this read met, for the one re-fetch
  // each earns (below) and the loud log if the read lands short.
  const refetch = createShortPageTracker();
  while (totals.read < expected) {
    const started = Date.now();
    const page = await fetchZonesPage(
      startIndex,
      expected,
      totals.read,
      delaysMs,
      onRetry,
      retryBudgetMs,
    );
    let batch = page.features;
    // BUG-387: a page that comes back short — fewer features than
    // asked for while more remain — is re-requested ONCE, in place,
    // before it is staged. The re-fetch goes through the same
    // fetchZonesPage, so it carries the BUG-384 transient retry;
    // the fuller of the two pages is the one staged.
    const want = Math.min(PAGE, expected - startIndex);
    if (isShortPage({ returned: batch.length, want, read: totals.read, expected })) {
      refetch.note({ startIndex, want, returned: batch.length });
      const again = await fetchZonesPage(
        startIndex,
        expected,
        totals.read,
        delaysMs,
        onRetry,
        retryBudgetMs,
      );
      refetch.recordRefetch({ startIndex, returned: again.features.length });
      progress?.warning({
        what: "short page re-fetched (BUG-387)",
        value: `page at startIndex ${startIndex} returned ${formatCount(batch.length)} of ${formatCount(want)} — re-fetch returned ${formatCount(again.features.length)}`,
        threshold: "one re-fetch per short page",
      });
      if (again.features.length > batch.length) batch = again.features;
    }
    const processed = processFeatures(batch);
    totals.addBatch(processed, batch.length);
    // BUG-389: a page whose features carry no flood_source
    // files them as "unknown" (processFeatures) — the mapping
    // earns a visible warning line per affected page, so the
    // count is in the log, not silent.
    if (processed.nullSource > 0) {
      nullSourceTotal += processed.nullSource;
      progress?.warning({
        what: "flood_source null mapped to unknown",
        value: `${formatCount(processed.nullSource)} feature${processed.nullSource === 1 ? "" : "s"} on the page at startIndex ${startIndex}`,
        threshold: "filed as unknown — the source was missing, not a different value",
      });
    }
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
    // BUG-366: the page is staged now — checkpoint it, so a kill
    // after this line loses at most the page in flight. The line
    // the checkpoint writes is the visible save.
    if (resume) await resume.checkpoint({ edition, expected, nextStartIndex: startIndex, totals });
  }
  readTally?.finish(totals.read);
  return {
    items: onItems ? sift.items : items,
    filed: totals.filed,
    geoless: totals.geoless,
    perLabel: totals.perLabel,
    nullSource: nullSourceTotal,
    read: totals.read,
    expected,
    edition,
    captured: null,
    refetch: refetch.summary(),
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
/**
 * @param {string} fixtureDir
 * @param {{ onItems?: ((items: any[], edition: string) => Promise<void>) | null, progress?: import("./progress.mjs").ProgressLogger | null, resume?: any }} [options]
 */
export async function readFixture(
  fixtureDir,
  { onItems = null, progress = null, resume = null } = {},
) {
  const stamp = JSON.parse(await readFile(join(fixtureDir, "fixture.json"), "utf8"));
  if (!stamp.edition)
    throw new Error("contract failure: the flood zones fixture carries no edition stamp");
  const names = await fixturePartNames(fixtureDir, "flood-zones.geojson");
  // BUG-366: the fixture's total feature count, counted upfront
  // (one parse per part — fixtures are small) so a checkpoint
  // can be validated against it exactly as a live count is.
  let fixtureTotal = 0;
  for (const name of names) {
    const body = JSON.parse(await readFile(join(fixtureDir, name), "utf8"));
    fixtureTotal += (body.features ?? []).length;
  }
  let resumed = null;
  if (resume) {
    resumed = await resume.prepare({ edition: stamp.edition, expected: fixtureTotal });
  }
  const totals = createTotals(VOCAB, resumed?.resumed ? resumed.checkpoint : null);
  const sift = onItems ? createGoldenSift(HOMES) : null;
  if (resumed?.resumed && sift) {
    for (const row of await resume.stagedGoldenRows(HOMES)) {
      const polygons = geojsonPolygons(JSON.parse(row.geojson));
      sift.items.push({
        label: row.risk_label,
        detail: row.detail,
        polygons,
        bbox: bboxOfPolygons(polygons),
      });
    }
  }
  const items = [];
  // Features already staged by the run this resumes, counted
  // off part by part: whole parts at or before the checkpoint
  // are skipped (their rows stand), the interrupted part is
  // re-read from its start and re-staged idempotently.
  let skipped = 0;
  const resumeFrom = resumed?.resumed ? resumed.checkpoint.read_count : 0;
  let nullSourceTotal = 0;
  for (const [part, name] of names.entries()) {
    const body = JSON.parse(await readFile(join(fixtureDir, name), "utf8"));
    const features = body.features ?? [];
    if (skipped + features.length <= resumeFrom) {
      skipped += features.length;
      continue;
    }
    const processed = processFeatures(features);
    totals.addBatch(processed, features.length);
    // BUG-389: same mapping as the live read — a part whose
    // features carry no flood_source files them as "unknown",
    // with a visible warning line per affected part.
    if (processed.nullSource > 0) {
      nullSourceTotal += processed.nullSource;
      progress?.warning({
        what: "flood_source null mapped to unknown",
        value: `${formatCount(processed.nullSource)} feature${processed.nullSource === 1 ? "" : "s"} in fixture part ${part + 1} (${name})`,
        threshold: "filed as unknown — the source was missing, not a different value",
      });
    }
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
    // BUG-366: the part is staged now — checkpoint it.
    if (resume)
      await resume.checkpoint({
        edition: stamp.edition,
        expected: fixtureTotal,
        nextStartIndex: totals.read,
        totals,
      });
  }
  if (totals.read === 0) throw new Error("contract failure: the flood zones fixture is empty");
  return {
    items: onItems ? sift.items : items,
    filed: totals.filed,
    geoless: totals.geoless,
    perLabel: totals.perLabel,
    nullSource: nullSourceTotal,
    read: totals.read,
    expected: totals.read,
    edition: stamp.edition,
    captured: stamp.captured ?? null,
    refetch: null, // a fixture read has no pages to re-fetch (BUG-387)
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

// Stage, count, repair, swap — fed as a stream (BUG-187),
// filed from persistent staging (BUG-366). beginFiling opens
// the client and the resume handle; there is NO long
// transaction any more — each staging flush commits as it
// lands, and the checkpoint (last fully staged page + running
// totals) commits with it, so a killed run's staged rows
// survive. stageItems converts each batch to WKT and inserts
// it in the house chunks (25 rows / 4 MB), so neither the
// item set nor its WKT copy is ever held whole; every staged
// row carries seq, its ordinal in the read, so re-staging a
// page is a no-op (ON CONFLICT DO NOTHING). finishFiling runs
// the counts and the swap in its own transaction, exactly as
// the one-shot filer did, then clears the staging rows and
// the checkpoint: the staged shapes are counted (source count
// == staged == filed), the topologically invalid ones are
// counted BEFORE repair so the log line can carry the number
// (L4), and the swap files ST_MakeValid output only: a filed
// shape that is still invalid, or was emptied by repair, fails
// the run and rolls the SWAP back — the staging and checkpoint
// stand, so the next run resumes at the swap — as does any
// failure mid-stream, via abortFiling, which ends the session
// and leaves staging + checkpoint for resume.
/**
 * Open the filing run's database client and resume handle
 * (BUG-366). The client is injectable so the resume tests
 * can file against a fake database; production passes none
 * and a real client is opened as before.
 *
 * @param {import("./progress.mjs").ProgressLogger | null} [progress]
 * @param {{ restart?: boolean, client?: any }} [options]
 */
export async function beginFiling(
  progress = null,
  { restart = false, client: injectedClient = null } = {},
) {
  // The client is injectable so the resume tests can file
  // against a fake database; production passes none and a
  // real client is opened as before (BUG-366).
  const client = injectedClient ?? new pg.Client({ connectionString: process.env.DATABASE_URL });
  if (!injectedClient) await client.connect();
  const resume = createFloodResume(client, {
    loader: "load-flood-zones",
    layerType: LAYER_TYPE,
    stageTable: "flood_stage",
    progress,
    restart,
  });
  const pending = [];
  let pendingBytes = 0;
  async function flushPending() {
    if (pending.length === 0) return;
    // Seqs are assigned at flush time, so the counter only
    // advances for rows actually inserted — and on resume it
    // is seeded from the checkpoint, so a re-staged page
    // reuses exactly the seqs its rows already carry.
    const seqBase = resume.takeSeq(pending.length);
    const values = [];
    const params = [];
    pending.forEach((row, i) => {
      const base = i * 8;
      values.push(
        `($${base + 1},$${base + 2},ST_GeomFromText($${base + 3}, 4326),$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`,
      );
      params.push(
        LAYER_TYPE,
        row.label,
        row.wkt,
        row.edition,
        row.detail,
        SOURCE_NAME,
        row.edition,
        seqBase + i,
      );
    });
    await client.query(
      `INSERT INTO flood_stage (layer_type, risk_label, geom, layer_date, detail, source_name, source_date, seq)
       VALUES ${values.join(",")} ON CONFLICT (layer_type, seq) DO NOTHING`,
      params,
    );
    pending.length = 0;
    pendingBytes = 0;
  }
  return {
    async prepare({ edition, expected }) {
      return resume.prepare({ edition, expected });
    },
    async checkpoint({ edition, expected, nextStartIndex, totals }) {
      return resume.checkpoint({ edition, expected, nextStartIndex, totals });
    },
    async stagedGoldenRows(homes) {
      return resume.stagedGoldenRows(homes);
    },
    resumeNote() {
      return resume.resumeNote();
    },
    async stageItems(items, edition) {
      for (const item of items) {
        const wkt = polygonsToWkt(item.polygons);
        pending.push({ wkt, label: item.label, detail: item.detail, edition });
        pendingBytes += wkt.length;
        if (pending.length >= 25 || pendingBytes >= 4_000_000) await flushPending();
      }
      // BUG-382: flush the tail before returning — the read loop
      // checkpoints immediately after this call, and the
      // checkpoint's filed count must name rows that are
      // durable, not rows still buffered here (a kill after
      // the checkpoint left staging 9 rows short of it).
      await flushPending();
    },
    async finishFiling(expectedCount) {
      try {
        await flushPending();
        await client.query("BEGIN");
        const staged = await client.query(
          "SELECT count(*)::int AS n FROM flood_stage WHERE layer_type = $1",
          [LAYER_TYPE],
        );
        if (staged.rows[0].n !== expectedCount)
          throw new Error("the staged shape count does not match — rolling back");
        // BUG-390: one progress line per sub-step — the
        // filing previously printed one line and then went
        // silent for ~30 minutes while the single
        // INSERT...SELECT ran.
        progress?.stage(`filing · staged count verified · ${formatCount(expectedCount)} shapes`);
        progress?.stage("filing · scanning staged shapes for invalid geometry");
        const invalidStaged = await withFilingPulse(
          progress,
          { stage: "filing · scanning staged shapes for invalid geometry" },
          () =>
            client.query(
              "SELECT count(*)::int AS n FROM flood_stage WHERE layer_type = $1 AND NOT ST_IsValid(geom)",
              [LAYER_TYPE],
            ),
        );
        const invalidCount = invalidStaged.rows[0].n;
        progress?.stage(`filing · invalid staged shapes · ${formatCount(invalidCount)}`);
        await client.query("DELETE FROM flood_layers WHERE layer_type = $1", [LAYER_TYPE]);
        progress?.stage("filing · live rows deleted");
        progress?.stage(
          `filing · copying ${formatCount(expectedCount)} shapes into flood_layers (validity repair)`,
        );
        await withFilingPulse(
          progress,
          {
            stage: `filing · copying ${formatCount(expectedCount)} shapes into flood_layers (validity repair)`,
          },
          () =>
            client.query(
              `INSERT INTO flood_layers (layer_type, risk_label, geom, layer_date, detail, source_name, source_date, loaded_at)
           SELECT layer_type, risk_label, ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3)), layer_date, detail, source_name, source_date, loaded_at FROM flood_stage WHERE layer_type = $1`,
              [LAYER_TYPE],
            ),
        );
        progress?.stage(`filing · copy done · ${formatCount(expectedCount)} shapes`);
        const filedCount = await client.query(
          "SELECT count(*)::int AS n FROM flood_layers WHERE layer_type = $1",
          [LAYER_TYPE],
        );
        if (filedCount.rows[0].n !== expectedCount)
          throw new Error("the filed shape count does not match — rolling back");
        progress?.stage(`filing · filed count verified · ${formatCount(expectedCount)} shapes`);
        progress?.stage("filing · scanning filed shapes for emptied geometry");
        const emptied = await withFilingPulse(
          progress,
          { stage: "filing · scanning filed shapes for emptied geometry" },
          () =>
            client.query(
              "SELECT count(*)::int AS n FROM flood_layers WHERE layer_type = $1 AND ST_IsEmpty(geom)",
              [LAYER_TYPE],
            ),
        );
        if (emptied.rows[0].n !== 0)
          throw new Error(
            `${emptied.rows[0].n} shapes were emptied by validity repair — rolling back (L4: never drop silently)`,
          );
        progress?.stage(`filing · emptied by repair · ${formatCount(emptied.rows[0].n)} shapes`);
        progress?.stage("filing · scanning filed shapes for invalid geometry");
        const invalidFiled = await withFilingPulse(
          progress,
          { stage: "filing · scanning filed shapes for invalid geometry" },
          () =>
            client.query(
              "SELECT count(*)::int AS n FROM flood_layers WHERE layer_type = $1 AND NOT ST_IsValid(geom)",
              [LAYER_TYPE],
            ),
        );
        if (invalidFiled.rows[0].n !== 0)
          throw new Error(`${invalidFiled.rows[0].n} filed shapes are invalid — rolling back`);
        progress?.stage(`filing · invalid filed shapes · ${formatCount(invalidFiled.rows[0].n)}`);
        await client.query("COMMIT");
        progress?.stage(`filing · swap committed · ${formatCount(expectedCount)} shapes live`);
        // The swap landed: clear the staging rows and the
        // checkpoint, so nothing of this run is left behind.
        await resume.clear();
        return invalidCount;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        await client.end();
      }
    },
    async abortFiling() {
      // No long transaction any more, so there is nothing to
      // roll back: ending the session leaves the staging rows
      // and the checkpoint in place, and the next run resumes
      // from them (BUG-366).
      await client.end().catch(() => {});
    },
  };
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const restart = args.includes("--restart");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;
  // BUG-204: one logger for the run — the read tally
  // and the filing marker below.
  const progress = createProgressLogger({ name: "load-flood-zones" });

  // A filing run streams the read into persistent staging as
  // it lands (BUG-187, BUG-366), so the database check moves
  // ahead of the read: without DATABASE_URL a filing run now
  // fails before fetching instead of after it. Verify-only
  // never opens the database.
  let filer = null;
  if (!verifyOnly) {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL is not set — filing requires a database");
    filer = await beginFiling(progress, { restart });
  }

  let processed;
  let verdict = null;
  try {
    const onItems = async (items, edition) => {
      if (filer) await filer.stageItems(items, edition);
    };
    processed = fixtureMode
      ? await readFixture(fixtureDir, { onItems, progress, resume: filer })
      : await readLive({ onItems, progress, resume: filer });

    // BUG-387: the read gate — the sanity band stays inline, exactly
    // as before (the fail-closed pin expects its wording here); the
    // read-vs-expected check carries the 1% tolerance after the
    // re-fetch, and the reconciliation stays exact. The tolerance
    // is the ONLY relaxation.
    if (!fixtureMode) {
      const lo = Math.floor(SNAPSHOT * 0.9);
      const hi = Math.ceil(SNAPSHOT * 1.1);
      if (processed.read < lo || processed.read > hi)
        throw new Error(
          `sanity failure: ${processed.read} flood zone features is outside the expected band (${lo}–${hi}, the 12 Nov 2026 snapshot ±10%)`,
        );
    }
    verdict = verifyReadCounts({
      label: "flood zones",
      read: processed.read,
      expected: processed.expected,
      filed: processed.filed,
      geoless: processed.geoless,
      refetch: processed.refetch,
    });
    if (verdict.withinTolerance) {
      // LOUD, twice: the progress log line here and the run
      // summary below both carry the shortfall — a tolerated
      // short read is never silent.
      progress.warning({
        what: "read shortfall accepted (BUG-387)",
        value: verdict.notice,
        threshold: "1% after re-fetch",
      });
    }
    checkGolden(processed);
  } catch (error) {
    // BUG-248: the read, sanity band, reconciliation and
    // golden checks all fail before anything is filed.
    progress.failed({
      stage: "read",
      filed: 0,
      error,
      resume: filer ? filer.resumeNote() : "the start (nothing staged yet)",
    });
    if (filer) await filer.abortFiling();
    throw error;
  }

  const perLabel = VOCAB.map((label) => `${label} ${formatCount(processed.perLabel[label])}`).join(
    " · ",
  );
  const summary = () =>
    `load-flood-zones · Environment Agency Flood Map for Planning zones · edition ${processed.edition}` +
    (processed.captured ? ` (fixture captured ${processed.captured})` : "") +
    ` · ${formatCount(processed.filed)} features filed (${formatCount(processed.read)} read · ${perLabel} · ${formatCount(processed.geoless)} without geometry counted)` +
    (processed.nullSource > 0
      ? ` · ${formatCount(processed.nullSource)} flood_source null mapped to unknown`
      : "") +
    (verdict?.notice ? ` · ${verdict.notice}` : "");

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
      resume: `${activeFiler.resumeNote()} — the live layer is untouched`,
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
      `load-flood-zones FAILED: ${error.message}${error.cause ? ` (${error.cause.message ?? error.cause})` : ""}`,
    );
    process.exitCode = 1;
  });
}
