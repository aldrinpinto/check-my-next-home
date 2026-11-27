// Flood surface water — CLIMATE SCENARIO loader (plan step
// M6.28, decision D49). Files the Environment Agency's Risk
// of Flooding from Surface Water – Climate Change 1
// likelihood bands as shapes:
//
//   npm run load:flood-surface-water-climate
//   npm run load:flood-surface-water-climate -- --verify-only
//   npm run load:flood-surface-water-climate -- --file tests/fixtures/flood-surface-water-climate
//   npm run load:flood-surface-water-climate -- --restart
//
// BUG-366 (26 Nov 2026): the read is resumable. Staging is a
// persistent table and a checkpoint records the last fully
// staged page as the read proceeds (one progress line per
// checkpoint), so a run killed mid-read resumes from the
// checkpoint instead of starting from zero. --restart discards
// the checkpoint and staging and starts from zero.
//
// This is the present-day surface water loader's scenario
// sibling, and the two are NEVER read against each other.
// The present-day product (load-flood-surface-water) files
// the likelihood bands of the map as it stands; this
// product files the bands of ONE published climate
// scenario — UKCP18, RCP 8.5, the Central allowance for the
// 2050s epoch (2040–2060), including anticipated changes to
// peak rainfall intensity — a different map, answering a
// different question. Nothing in this loader (or, by the
// step's fence, anywhere in the serving) computes a change
// or a comparison between the two maps. The scenario's
// wording — allowance and epoch — is serving material
// pinned in the brain at M6.28; this loader files shapes,
// bands and the edition, nothing else.
//
// What decides this loader's shape:
//   - A SEPARATE TABLE. The shapes file into
//     flood_climate_layers (migration 0025) under layer_type
//     'rofsw_cc', never into flood_layers: that table's
//     contract is the three present-day products, and
//     keeping scenario shapes out of it makes it structurally
//     impossible for a present-day query to serve a scenario
//     shape as a present-day fact, or the reverse.
//   - Absence here is the state "no band published for this
//     point under the scenario" — a state of the scenario
//     map, named by the step. It is NOT the present-day
//     product's reading of its own absence ("below the Low
//     threshold" — this scenario product's absence carries
//     no such inference), and it is never an inferred band:
//     no synthetic polygon files for it. Birkdale and Exeter
//     have absence; only Epsom has a point band (Low). The
//     golden checks assert the two states side by side.
//   - The bands' depth basis has a home: every row files
//     detail ">0 m". The per-depth sibling collections
//     (0–1.2 m thresholds) are deliberately not filed,
//     exactly as for the present-day product. risk_label
//     stays the clean THREE-band vocabulary {High, Medium,
//     Low} — a "Very low" arriving here would mean the
//     product changed shape, and the contract check fails
//     the run on it.
//   - The features carry NO confidence field (sampled
//     750/750 in the M6.28 prep, and again in this loader's
//     fixture capture: the published fields are risk_band,
//     shape_length, shape_area). The present-day sibling
//     product does publish one; nothing consumes it in
//     either loader, and this loader asserts nothing about
//     it — recorded so nobody copies a confidence
//     expectation into this product.
//   - Shapes file exactly as published — no buffering,
//     snapping or simplification. Surface water at a point
//     is a near-miss science; any of those would flip point
//     answers invisibly.
//   - Invalid and heavy geometries are the NORMAL case
//     here, not the exception: these features arrive as
//     self-intersecting multipolygons and individually run
//     to hundreds of KB. The invalid count comes from the
//     database step (ST_IsValid on the staged shapes), every
//     filed shape is made valid via ST_MakeValid, a
//     filed-invalid or emptied shape fails the run, and
//     staging is chunked by rows and by bytes. Pages stay
//     small (100) for the same reason.
//   - Counts are computed from the fetched data, never from
//     the service's filtered counts (the OGC service
//     silently ignores property filters — measured at M5.1
//     and again in the M6.28 prep). The only service figure
//     trusted is the unfiltered numberMatched, the oracle
//     the paged read must reconcile with exactly. The full
//     read's per-band census against that oracle is this
//     loader's integrity gate — the M6.28 prep recorded
//     exactly equal per-band counts in every golden box
//     census (an unexplained observation, not an error);
//     the census is where a real anomaly would surface.
//   - No proximity is computed or pinned. The scenario block
//     serves the point state only (M6.28 prep R10): the
//     nearest-edge distance machinery its present-day parent
//     carries for golden pins is deliberately not carried here.
//
// The edition stamp is the serving system's own: the WMS
// build layer is named rofsw_cc01_10_11_2026, and the
// loader parses that date out of the capabilities document.
// If no dated build layer is published, the run fails:
// provenance is not guessed.
//
// Source: Environment Agency via the Defra Data Services
// Platform (OGC API Features, dataset e5b38de2-99b3-44ee-
// b10c-b244926878ef), Open Government Licence; © Environment
// Agency copyright and/or database right. The national
// products "do not show risk at a property level" (EA's
// words) — answers are about the postcode point and its
// mapped surroundings.

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
} from "./progress.mjs";
import { createShortPageTracker, isShortPage, verifyReadCounts } from "./read-tolerance.mjs";

const ITEMS_URL =
  "https://environment.data.gov.uk/geoservices/datasets/e5b38de2-99b3-44ee-b10c-b244926878ef/ogc/features/v1/collections/rofsw_cc01/items";
const WMS_URL =
  "https://environment.data.gov.uk/spatialdata/nafra2-risk-of-flooding-from-surface-water-climate-change/wms?service=WMS&version=1.3.0&request=GetCapabilities";
const COLLECTION = "rofsw_cc01";
const LAYER_TYPE = "rofsw_cc";
const SOURCE_NAME = "Environment Agency — Risk of Flooding from Surface Water – Climate Change 1";
export const VOCAB = ["High", "Medium", "Low"];
const DETAIL = ">0 m";
const PAGE = 100;
export const SNAPSHOT = 406734; // the service's unfiltered count, 16 Nov 2026
export const BAND_LOW = Math.floor(SNAPSHOT * 0.9);
export const BAND_HIGH = Math.ceil(SNAPSHOT * 1.1);

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
// "<collection>_DD_MM_YYYY" beside the plain one (the depth
// siblings carry the same build date but do not match this
// pattern). Every dated match must agree — two builds in
// one document would mean the service is mid-republication
// and the honest move is to fail and retry later.
export function parseEdition(xml) {
  const pattern = new RegExp(`${COLLECTION}_(\\d{2})_(\\d{2})_(\\d{4})`, "g");
  const dates = new Set();
  for (const match of xml.matchAll(pattern)) dates.add(`${match[3]}-${match[2]}-${match[1]}`);
  if (dates.size !== 1)
    throw new Error(
      `contract failure: the WMS capabilities carry ${dates.size} distinct build dates for ${COLLECTION} — no single edition can be stamped`,
    );
  return [...dates][0];
}

async function fetchEdition(opts) {
  const xml = await fetchText(WMS_URL, "the surface water climate WMS capabilities", opts);
  return parseEdition(xml);
}

// Features -> validated items. Geometry-less features are
// counted, never filed; malformed geometry and any band
// outside the published THREE-band vocabulary fail the run
// (the contract check, gap L5/L6: bands are read off the
// fetched features themselves, and a "Very low" arriving
// here would mean the product changed shape — it has none).
export function processFeatures(raw) {
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
        `contract failure: risk_band "${label}" is outside {High, Medium, Low} — this product has no Very low band`,
      );
    perLabel[label] += 1;
    items.push({ label, detail: DETAIL, polygons });
  }
  if (malformed > 0)
    throw new Error(
      `surface water climate: ${malformed} features carry geometry that does not parse — contract failure, nothing filed`,
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
async function fetchSurfaceWaterClimatePage(
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
      "the surface water climate features",
      { delaysMs, onRetry, retryBudgetMs },
    );
    try {
      const page = await response.json();
      const errorText = serviceErrorText(page);
      if (errorText)
        throw new Error(
          `the surface water climate service returned an error for the page at startIndex ${startIndex}: ${errorText}`,
        );
      if (page?.numberMatched !== expected)
        throw new Error(
          `contract failure: the surface water climate count moved mid-read (${expected} -> ${page?.numberMatched}) — nothing filed`,
        );
      if (!Array.isArray(page.features))
        throw new Error(
          `the the surface water climate service returned an error for the page at startIndex ${startIndex} carries no features array`,
        );
      if (page.features.length === 0)
        throw new Error(`surface water climate: paging stopped at ${read} of ${expected} features`);
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
  const first = await fetchJson(`${ITEMS_URL}?limit=1&f=json`, "the surface water climate count", {
    delaysMs,
    onRetry,
    retryBudgetMs,
  });
  const expected = first.numberMatched;
  if (!Number.isInteger(expected) || expected <= 0)
    throw new Error("contract failure: the surface water items response carries no numberMatched");
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
  // BUG-387: the short pages this read met, for the one re-fetch
  // each earns (below) and the loud log if the read lands short.
  const refetch = createShortPageTracker();
  while (totals.read < expected) {
    const started = Date.now();
    const page = await fetchSurfaceWaterClimatePage(
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
    // fetch function, so it carries the BUG-384 transient retry;
    // the fuller of the two pages is the one staged.
    const want = Math.min(PAGE, expected - startIndex);
    if (isShortPage({ returned: batch.length, want, read: totals.read, expected })) {
      refetch.note({ startIndex, want, returned: batch.length });
      const again = await fetchSurfaceWaterClimatePage(
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
    throw new Error("contract failure: the surface water climate fixture carries no edition stamp");
  const names = await fixturePartNames(fixtureDir, "flood-surface-water-climate.geojson");
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
  for (const [part, name] of names.entries()) {
    const body = JSON.parse(await readFile(join(fixtureDir, name), "utf8"));
    const features = body.features ?? [];
    if (skipped + features.length <= resumeFrom) {
      skipped += features.length;
      continue;
    }
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
    // BUG-366: the part is staged now — checkpoint it.
    if (resume)
      await resume.checkpoint({
        edition: stamp.edition,
        expected: fixtureTotal,
        nextStartIndex: totals.read,
        totals,
      });
  }
  if (totals.read === 0)
    throw new Error("contract failure: the surface water climate fixture is empty");
  return {
    items: onItems ? sift.items : items,
    filed: totals.filed,
    geoless: totals.geoless,
    perLabel: totals.perLabel,
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

  // Epsom: the one golden point with a scenario band — a
  // filed Low polygon covers the point under the scenario.
  const epsom = covering(HOMES["KT17 1FH"]);
  expect(
    epsom.length >= 1 && epsom.every((item) => item.label === "Low"),
    `KT17 1FH: the point should be covered by a filed Low polygon under the scenario, got ${
      epsom.map((i) => i.label).join(", ") || "no shape"
    }`,
  );

  // Birkdale and Exeter: NO BAND PUBLISHED — no shape
  // covers the point under the scenario. The served state
  // for this absence is "no band published for this point
  // under the scenario" — NOT the present-day surface water
  // product's below-the-lowest-band reading of its own
  // absence, and never an inferred band. Asserted as
  // absence beside Epsom's filed Low, in one run, so the
  // two states can never be conflated.
  for (const postcode of ["CM3 2JT", "E16 1GN"]) {
    expect(
      covering(HOMES[postcode]).length === 0,
      `${postcode}: a surface water climate shape covers the point — the golden reads say no shape (no band published under the scenario)`,
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
    loader: "load-flood-surface-water-climate",
    layerType: LAYER_TYPE,
    stageTable: "flood_climate_stage",
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
      `INSERT INTO flood_climate_stage (layer_type, risk_label, geom, layer_date, detail, source_name, source_date, seq)
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
          "SELECT count(*)::int AS n FROM flood_climate_stage WHERE layer_type = $1",
          [LAYER_TYPE],
        );
        if (staged.rows[0].n !== expectedCount)
          throw new Error("the staged shape count does not match — rolling back");
        const invalidStaged = await client.query(
          "SELECT count(*)::int AS n FROM flood_climate_stage WHERE layer_type = $1 AND NOT ST_IsValid(geom)",
          [LAYER_TYPE],
        );
        const invalidCount = invalidStaged.rows[0].n;
        await client.query("DELETE FROM flood_climate_layers WHERE layer_type = $1", [LAYER_TYPE]);
        await client.query(
          `INSERT INTO flood_climate_layers (layer_type, risk_label, geom, layer_date, detail, source_name, source_date, loaded_at)
           SELECT layer_type, risk_label, ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3)), layer_date, detail, source_name, source_date, loaded_at FROM flood_climate_stage WHERE layer_type = $1`,
          [LAYER_TYPE],
        );
        const filedCount = await client.query(
          "SELECT count(*)::int AS n FROM flood_climate_layers WHERE layer_type = $1",
          [LAYER_TYPE],
        );
        if (filedCount.rows[0].n !== expectedCount)
          throw new Error("the filed shape count does not match — rolling back");
        const emptied = await client.query(
          "SELECT count(*)::int AS n FROM flood_climate_layers WHERE layer_type = $1 AND ST_IsEmpty(geom)",
          [LAYER_TYPE],
        );
        if (emptied.rows[0].n !== 0)
          throw new Error(
            `${emptied.rows[0].n} shapes were emptied by validity repair — rolling back (L4: never drop silently)`,
          );
        const invalidFiled = await client.query(
          "SELECT count(*)::int AS n FROM flood_climate_layers WHERE layer_type = $1 AND NOT ST_IsValid(geom)",
          [LAYER_TYPE],
        );
        if (invalidFiled.rows[0].n !== 0)
          throw new Error(`${invalidFiled.rows[0].n} filed shapes are invalid — rolling back`);
        await client.query("COMMIT");
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
  const progress = createProgressLogger({ name: "load-flood-surface-water-climate" });

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
          `sanity failure: ${processed.read} surface water features is outside the expected band (${lo}–${hi}, the 16 Nov 2026 snapshot ±10%)`,
        );
    }
    verdict = verifyReadCounts({
      label: "surface water climate",
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
    `load-flood-surface-water-climate · Environment Agency Risk of Flooding from Surface Water – Climate Change 1 · edition ${processed.edition}` +
    (processed.captured ? ` (fixture captured ${processed.captured})` : "") +
    ` · ${formatCount(processed.filed)} features filed (${formatCount(processed.read)} read · ${perLabel} · ${formatCount(processed.geoless)} without geometry counted)` +
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
      `load-flood-surface-water-climate FAILED: ${error.message}${error.cause ? ` (${error.cause.message ?? error.cause})` : ""}`,
    );
    process.exitCode = 1;
  });
}
