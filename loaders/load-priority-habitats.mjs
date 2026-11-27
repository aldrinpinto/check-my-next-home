// Priority habitats loader (plan step M5.3). Files the
// Priority Habitat Inventory from Natural England's ArcGIS
// service, following the user-seat gap check of 12 Nov 2026:
//
//   npm run load:priority-habitats
//   npm run load:priority-habitats -- --verify-only
//   npm run load:priority-habitats -- --file tests/fixtures/priority-habitats
//
// What the gap check changed, and where it lives in this file:
//   - L5, PHI is 818,225 habitat patches, not sites, and
//     not a protection register. It is a compiled map of where
//     priority habitat is recorded — assembled from surveys of
//     varying age — so the serving rule is the phrase
//     "recorded in the Priority Habitat Inventory":
//     PHI is not a protection and never proof of absence.
//     Patches file as the unit, by UID, with the
//     habitat label (MainHabs) exactly as published; the four
//     non-priority mosaic classes file too, with their labels
//     verbatim — nothing is filtered, so the filed count must
//     reconcile to the service's own count exactly.
//   - The bulk route: the hosted dataset is 9.1 GB of File
//     Geodatabase, which no part of this stack can read, so the
//     loader pages the feature service in OBJECTID order with
//     the service's own count as the oracle the read must match
//     (the same empty-result proof as the designations loader).
//     Pages are processed one at a time and never held whole:
//     golden tallies are computed per patch and dropped, and in
//     filing mode each page stages into the database as it
//     arrives. Staging is persistent and checkpointed (BUG-368):
//     a kill mid-read resumes from the last checkpointed flush
//     instead of restarting, and the swap is still atomic and
//     count-verified — a failed load files nothing, exactly as
//     the house pattern requires.
//
// BUG-195 (23 Nov 2026): the live read already streamed; the
// one whole-set read left in this loader was the FIXTURE
// read, which concatenated every fixture part into a single
// features array before processing. streamPhiFixture below
// now parses, processes and releases one part at a time.
// The one dataset-sized structure a run still holds is the
// UID dedupe index (state.uids): the patch counts are a
// loader contract — a duplicate UID is counted and dropped,
// never a failed run — and the counts reconcile exactly
// (filed + geometry-less + duplicates == read), with the
// duplicate judged BEFORE the geometry parse, so no
// database-side dedupe can stand in for it without changing
// the counted contract. It holds keys only, never rows.
//
// Natural England publishes no per-row quality flag, so
// `quality` files NULL rather than inventing one. The source
// date is the inventory's own version month (the Version field
// is uniform across every patch — Sept_26 at the 12 Nov 2026
// snapshot), never the retrieval date.
//
// Source: Natural England ArcGIS feature service, Open
// Government Licence v3.0. Distances are to the nearest polygon
// edge on the longitude-scaled plane (miles = degrees of
// latitude x 69.05), the prep's basis.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createLoaderResume } from "./loader-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

const NE_BASE = "https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services";
const SERVICE = "Priority_Habitats_Inventory_England";
const SOURCE_NAME = "Natural England — Priority Habitat Inventory (England)";
const ORGANISATION = "Natural England";
const FIELDS = [
  "OBJECTID",
  "UID",
  "MainHabs",
  "HabCodes",
  "AddHabs",
  "PrimSource",
  "AreaHa",
  "Version",
];
const PAGE_SIZE = 2000;

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};
const GOLDEN = {
  "CM3 2JT": { nearestName: "Traditional orchard", nearestMiles: 0.25, within1: 33 },
  "E16 1GN": { nearestName: "Deciduous woodland", nearestMiles: 0.14, within1: 38 },
  "KT17 1FH": { nearestName: "Deciduous woodland", nearestMiles: 0.18, within1: 57 },
};

// --- geometry (the house copies, on GeoJSON rings) ---------------

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
  return raw;
}

function bboxOf(polygons) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const polygon of polygons)
    for (const ring of polygon)
      for (const [x, y] of ring) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  return [x0, y0, x1, y1];
}

function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
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

function geometryDistanceMiles(polygons, home) {
  if (polygonsContain(polygons, home.lng, home.lat)) return 0;
  const scaleX = Math.cos((home.lat * Math.PI) / 180);
  const px = home.lng * scaleX;
  const py = home.lat;
  let best = Infinity;
  for (const polygon of polygons)
    for (const ring of polygon)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const d = segmentDistance(
          px,
          py,
          ring[j][0] * scaleX,
          ring[j][1],
          ring[i][0] * scaleX,
          ring[i][1],
        );
        if (d < best) best = d;
      }
  return best * 69.05;
}

// Bounding-box lower bound on the edge distance, miles — a
// patch whose bound exceeds a mile can feed neither the
// within-a-mile counts nor (once any patch inside a mile is
// tallied) the nearest, so its exact distance is never needed.
function bboxLowerBoundMiles(bbox, home) {
  const scaleX = Math.cos((home.lat * Math.PI) / 180);
  const px = home.lng * scaleX;
  const py = home.lat;
  const [x0, y0, x1, y1] = bbox;
  const dx = px < x0 * scaleX ? x0 * scaleX - px : px > x1 * scaleX ? px - x1 * scaleX : 0;
  const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
  return Math.sqrt(dx * dx + dy * dy) * 69.05;
}

function polygonsToWkt(polygons) {
  const body = polygons
    .map(
      (polygon) =>
        `(${polygon.map((ring) => `(${ring.map(([x, y]) => `${x} ${y}`).join(",")})`).join(",")})`,
    )
    .join(",");
  return `MULTIPOLYGON(${body})`;
}

// --- the inventory version -----------------------------------------

const MONTHS = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Sept: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};
function parseVersion(version) {
  const m = String(version ?? "").match(/^([A-Za-z]+)_(\d{2})$/);
  if (!m || !MONTHS[m[1]])
    throw new Error(`contract failure: unparseable PHI version "${version}"`);
  return { year: 2000 + Number(m[2]), month: MONTHS[m[1]] };
}
const versionDate = (v) => `${v.year}-${String(v.month).padStart(2, "0")}-01`;
function versionAgeMonths(v, now = new Date()) {
  return now.getUTCFullYear() * 12 + (now.getUTCMonth() + 1) - (v.year * 12 + v.month);
}

// --- the run ---------------------------------------------------------

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
async function fetchJson(url, what, attempts = RETRY_DELAYS_MS.length + 1) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${what}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    }
  }
  throw lastError;
}

// --- paging: the count is the contract -------------------------
//
// ArcGIS reports query failures as an HTTP 200 body carrying an
// `error` member and no `features` member. The first version of
// this loop read such a body as an empty page — end of data —
// and a live verify-only run on 13 Nov 2026 stopped at exactly
// 392 x 2000 = 784,000 of 818,225 patches (the diagnosis is
// scratch-nature/PHI-DIAGNOSIS.md). The reconcile guard caught
// the shortfall and filed nothing, but the read itself must
// never trust a page it has not validated. So the count taken
// at the start is the contract: the read ends only when
// read === expected, every page is validated INSIDE the retry
// boundary, a failed page re-requests the SAME offset, and
// after the last attempt the load fails loudly, filing nothing.

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

// One page, judged against the count contract; returns the
// page's last OBJECTID. Throws on any disagreement — the
// caller retries the same offset, then fails. OBJECTID gaps
// are legitimate (the published sequence has deletions); only
// the ORDER is asserted, never contiguity.
function validatePhiPage(page, { want, isFinal, lastObjectId, offset }) {
  const errorText = serviceErrorText(page);
  if (errorText)
    throw new Error(
      `the PHI service returned an error for the page at offset ${offset}: ${errorText}`,
    );
  if (!Array.isArray(page?.features))
    throw new Error(`the PHI page at offset ${offset} carries no features array`);
  if (page.features.length !== want)
    throw new Error(
      `the PHI page at offset ${offset} returned ${page.features.length} features — the count contract requires exactly ${want}`,
    );
  const flag = page.properties?.exceededTransferLimit;
  if (!isFinal && flag !== true)
    throw new Error(
      `the PHI page at offset ${offset} does not restate exceededTransferLimit — the service's view of the total disagrees with the count`,
    );
  if (isFinal && flag)
    throw new Error(
      `the PHI page at offset ${offset} is the last the count allows, yet still claims exceededTransferLimit — the service's view of the total disagrees with the count`,
    );
  let previous = lastObjectId;
  for (const feature of page.features) {
    const objectId = feature?.properties?.OBJECTID;
    if (!Number.isFinite(objectId))
      throw new Error(`a feature on the PHI page at offset ${offset} carries no OBJECTID`);
    if (previous !== null && objectId <= previous)
      throw new Error(
        `PHI OBJECTID ordering broke at offset ${offset}: ${objectId} follows ${previous} — the read cannot be trusted`,
      );
    previous = objectId;
  }
  return previous;
}

async function fetchPhiPage(layerUrl, offset, expected, lastObjectId, delaysMs = RETRY_DELAYS_MS) {
  const want = Math.min(PAGE_SIZE, expected - offset);
  const isFinal = offset + want === expected;
  const q = new URLSearchParams({
    where: "1=1",
    outFields: FIELDS.join(","),
    returnGeometry: "true",
    outSR: "4326",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    orderByFields: "OBJECTID",
    f: "geojson",
  });
  let lastError = null;
  for (let attempt = 1; attempt <= delaysMs.length + 1; attempt++) {
    try {
      const response = await fetch(`${layerUrl}/query?${q}`);
      if (!response.ok) throw new Error(`HTTP ${response.status} for the PHI features`);
      const page = await response.json();
      validatePhiPage(page, { want, isFinal, lastObjectId, offset });
      return page;
    } catch (error) {
      lastError = error;
      if (attempt <= delaysMs.length)
        await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt - 1]));
    }
  }
  throw lastError;
}

// The whole read, driven by the count: each validated page is
// handed to onBatch (which tallies and stages it) before the
// next arrives, and progress is logged every ten pages and on
// the final page, so an hour-long read shows signs of life and
// names the offset where it failed.
//
// BUG-265: the progress now goes through the shared logger
// when a `progress` is passed — a tally over the service's
// own count (a real percentage), a heartbeat and a
// slow-page warning. The old `log` callback is kept for
// callers that still pass it, and stays silent when a
// progress logger is present, so the read never logs twice.
/**
 * @param {string} layerUrl
 * @param {number} expected
 * @param {(batch: any[]) => Promise<void>} onBatch
 * @param {{ delaysMs?: number[], log?: ((message: string) => void) | null, progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export async function readPhiPages(
  layerUrl,
  expected,
  onBatch,
  {
    delaysMs = RETRY_DELAYS_MS,
    log = () => {},
    progress = null,
    // BUG-368: a resumed run starts paging at the
    // checkpoint's input position instead of zero, with the
    // OBJECTID order check seeded from the last feature the
    // killed run consumed (checkpoint state).
    startOffset = 0,
    lastObjectId: seededLastObjectId = null,
  } = {},
) {
  let offset = startOffset;
  let lastObjectId = seededLastObjectId;
  let pages = 0;
  // BUG-265: a line every twentieth of the read, and a
  // closing line — the service's count is the total, so
  // the log carries a real percentage.
  const readTally = progress?.tally({
    label: "read",
    total: expected,
    every: Math.max(1, Math.ceil(expected / 20)),
    unit: "patches",
  });
  // BUG-265: the paged read is the run's long phase — a
  // heartbeat every half of the read or 15 minutes (the
  // flood-zones read's cadence), and a warning for a page
  // that takes more than 3x the recent average.
  const readWatch = createBatchWatch();
  const heartbeatEvery = Math.max(1, Math.ceil(expected / 2));
  while (offset < expected) {
    const started = Date.now();
    const page = await fetchPhiPage(layerUrl, offset, expected, lastObjectId, delaysMs);
    await onBatch(page.features);
    lastObjectId = page.features[page.features.length - 1].properties.OBJECTID;
    offset += page.features.length;
    pages += 1;
    const { tookMs, averageMs, slow } = readWatch.observe(Date.now() - started);
    readTally?.tick(offset);
    progress?.heartbeat({ stage: "read", done: offset, total: expected, every: heartbeatEvery });
    if (slow) {
      progress?.warning({
        what: "read page duration",
        value: `page at offset ${offset} took ${formatDuration(tookMs)}`,
        threshold: `3x recent average ${formatDuration(averageMs)}`,
      });
    }
    if (!progress && (pages % 10 === 0 || offset === expected))
      log(`load-priority-habitats · read ${offset} of ${expected} patches (page ${pages})`);
  }
  readTally?.finish(offset);
  return offset;
}

// The fixture read, streamed part by part (BUG-195): each
// part is parsed, handed to onFeature feature by feature,
// and released before the next part is read — the parts
// are never concatenated into one array.
//
// BUG-368: startOffset skips the features a resumed run
// already consumed (the checkpoint's input position); the
// returned count still covers the whole fixture.
export async function streamPhiFixture(fixtureDir, onFeature, { startOffset = 0 } = {}) {
  const stem = "priority-habitats";
  const entries = await readdir(fixtureDir);
  const partNames = entries
    .filter((name) => new RegExp(`^${stem}-\\d+\\.geojson$`).test(name))
    .sort();
  const names = entries.includes(`${stem}.geojson`) ? [`${stem}.geojson`] : partNames;
  if (names.length === 0) throw new Error("contract failure: no priority-habitats fixture file");
  let count = 0;
  let skipped = 0;
  for (const name of names) {
    const body = JSON.parse(await readFile(join(fixtureDir, name), "utf8"));
    for (const feature of body.features ?? []) {
      count += 1;
      if (skipped < startOffset) {
        skipped += 1;
        continue;
      }
      await onFeature(feature);
    }
  }
  if (count === 0)
    throw new Error("contract failure: the priority-habitats fixture has no features");
  return { count };
}

// The inventory version of the fixture's first feature —
// the edition a fixture run resumes on (the live run
// peeks the same field with a one-row query, below).
export async function peekPhiFixtureVersion(fixtureDir) {
  const stem = "priority-habitats";
  const entries = await readdir(fixtureDir);
  const partNames = entries
    .filter((name) => new RegExp(`^${stem}-\\d+\\.geojson$`).test(name))
    .sort();
  const names = entries.includes(`${stem}.geojson`) ? [`${stem}.geojson`] : partNames;
  if (names.length === 0) throw new Error("contract failure: no priority-habitats fixture file");
  const body = JSON.parse(await readFile(join(fixtureDir, names[0]), "utf8"));
  const version = body.features?.[0]?.properties?.Version;
  if (typeof version !== "string" || version === "")
    throw new Error("contract failure: the fixture's first feature carries no Version");
  return version;
}

// The inventory version of one live patch — the edition
// a live run resumes on. A single one-row query up front:
// the version is uniform across the inventory (the
// versions.size === 1 contract below), so one patch names
// the edition for the whole read.
async function peekPhiLiveVersion(layerUrl) {
  const body = await fetchJson(
    `${layerUrl}/query?where=1%3D1&outFields=Version&returnGeometry=false&resultRecordCount=1&f=json`,
    "the PHI version peek",
  );
  const version = body.features?.[0]?.properties?.Version;
  if (typeof version !== "string" || version === "")
    throw new Error("contract failure: the PHI service's first patch carries no Version");
  return version;
}

// --- filing ------------------------------------------------------------

// Stage, count, swap — streamed (BUG-195), with resume
// support (BUG-368): staging is a PERSISTENT table now
// (migration 0048), and a loader_checkpoint row records the
// last fully staged 500-row flush, so a killed run resumes
// instead of restarting. beginFiling opens the staging
// table; stageRow buffers rows into the house 500-row
// flushes, checkpointing after each flush; finishFiling
// runs the counts and the swap exactly as the one-shot
// filer did, in its own transaction. The single-layer
// swap's atomicity is unchanged: staging rides outside
// the swap transaction now, and a failed run leaves the
// last good filing serving untouched.
//
// THE RESUME UNITS. The read is paged by resultOffset and
// the processor never reorders a feature, so the resume
// point is the count of features consumed whose filed rows
// have committed (state.read at flush time) — the pending
// tail is offered but NOT staged, so it never counts and
// a resume skips exactly the staged rows. The checkpoint's
// state carries the run's scalars (geoless, duplicates,
// invalid, the inventory version, the last OBJECTID
// consumed, the per-home golden tallies), so a resumed
// run's counts and golden checks cover the whole read;
// the UID dedupe set is rebuilt from the staged rows
// (stagedUids), so a duplicate spanning the kill is still
// caught. The golden tallies seed from the checkpoint
// state, never from a re-scan.
/**
 * @param {import("./progress.mjs").ProgressLogger | null} [progress]
 * @param {{ restart?: boolean, client?: any }} [options]
 */
export async function beginFiling(
  progress = null,
  { restart = false, client: injectedClient = null } = {},
) {
  const client = injectedClient ?? new pg.Client({ connectionString: process.env.DATABASE_URL });
  const ownsClient = !injectedClient;
  if (ownsClient) await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS phi_stage (
         constraint_type text, name text, geom geometry(MultiPolygon, 4326),
         source_reference text, organisation text, quality text, detail text,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now(),
         seq bigint NOT NULL, UNIQUE (seq)
       )`,
    );
  } catch (error) {
    if (ownsClient) await client.end().catch(() => {});
    throw error;
  }
  const resume = createLoaderResume(client, {
    loader: "load-priority-habitats",
    stageTable: "phi_stage",
    progress,
    restart,
  });
  const CHUNK = 500;
  const pending = [];
  let staged = 0;
  let edition = null;
  let expected = null;
  let stageTally = null;
  const stageWatch = createBatchWatch();
  let latestRead = 0;
  let latestState = {};
  /** @type {{ resumed: boolean, reason?: string, checkpoint?: any, prefix?: boolean }} */
  let resumePrep = { resumed: false };
  async function flushPending(flushTail = false) {
    if (pending.length === 0) return false;
    // A flush is one INSERT per 500-row chunk; the
    // checkpoint below records the read count at the
    // moment the chunk committed, so the resume point
    // always sits on a feature boundary.
    while (pending.length >= CHUNK || (flushTail && pending.length > 0)) {
      const chunk = pending.splice(0, Math.min(CHUNK, pending.length));
      const values = [];
      const params = [];
      const base = resume.takeSeq(chunk.length);
      chunk.forEach((row, i) => {
        // Ten columns per row (seq included) — the stride must
        // match the column count, or pg binds fewer params
        // than the statement names (BUG-380: stride 9 named
        // 4501 placeholders for a 500-row chunk while the
        // bind supplied 5000).
        const b = i * 10;
        values.push(
          `($${b + 1},$${b + 2},ST_Multi(ST_GeomFromText($${b + 3}, 4326)),$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`,
        );
        params.push(
          "priority_habitat",
          row.name,
          row.wkt,
          row.reference,
          ORGANISATION,
          null,
          row.detail,
          SOURCE_NAME,
          row.sourceDate,
          base + i,
        );
      });
      const started = Date.now();
      await client.query(
        `INSERT INTO phi_stage (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, seq)
         VALUES ${values.join(",")}`,
        params,
      );
      staged += chunk.length;
      const { tookMs, averageMs, slow } = stageWatch.observe(Date.now() - started);
      stageTally?.tick(staged);
      if (slow) {
        progress?.warning({
          what: "stage flush duration",
          value: `flush of ${formatCount(chunk.length)} patches took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
      if (edition) {
        await resume.checkpoint({
          edition,
          expected,
          nextStartIndex: latestRead,
          read: latestRead,
          filed: staged,
          state: latestState,
          unit: "patches",
        });
      }
    }
    return true;
  }
  return {
    stagedCount: () => staged,
    resumePrep: () => resumePrep,
    resumeNote: () => resume.resumeNote(),
    // Decide, from the edition and the staged rows, whether
    // this run resumes or starts from zero. Called once the
    // read has resolved the inventory version (and the
    // service count, live), before the first patch is read.
    async prepareResume(ed, exp = null) {
      edition = ed;
      expected = exp;
      resumePrep = await resume.prepare({ edition, expected });
      if (resumePrep.resumed) {
        staged = resumePrep.checkpoint.filed_count;
        latestRead = resumePrep.checkpoint.next_start_index;
      }
      // BUG-265: the staging tally, against the service's
      // own count — the same total the read tally uses.
      // Filing mode only: verify-only stages nothing, so
      // it earns no staging line.
      stageTally =
        expected !== null && expected !== undefined
          ? progress?.tally({
              label: "staging",
              total: expected,
              every: Math.max(1, Math.ceil(expected / 20)),
              unit: "patches",
            })
          : progress?.tally({ label: "staging", every: 500, unit: "patches" });
      return resumePrep;
    },
    // Every staged UID — the dedupe set a resumed run
    // rebuilds from, so a duplicate spanning the kill is
    // still caught. Called after prepareResume, which has
    // already trimmed the staged tail past the checkpoint.
    async stagedUids() {
      const { rows } = await client.query(`SELECT source_reference FROM phi_stage`);
      return rows.map((r) => r.source_reference);
    },
    async stageRow(row, { read, state = {} } = {}) {
      latestRead = read;
      latestState = state;
      pending.push(row);
      if (pending.length >= CHUNK) await flushPending();
    },
    // Flush the pending tail and checkpoint it, so the
    // staged read stands complete before the golden
    // checks judge it. Called once, after the read ends.
    /**
     * @param {{ read?: number, state?: any }} [options]
     */
    async flushTail({ read, state = {} } = {}) {
      latestRead = read;
      latestState = state;
      await flushPending(true);
      stageTally?.finish(staged);
    },
    async finishFiling(expectedFiled) {
      try {
        await flushPending(true);
        const stagedRes = await client.query("SELECT count(*)::int AS n FROM phi_stage");
        if (stagedRes.rows[0].n !== expectedFiled)
          throw new Error("the staged patch count does not match — rolling back");
        await client.query("BEGIN");
        try {
          await client.query(
            "DELETE FROM planning_layers WHERE constraint_type = 'priority_habitat'",
          );
          await client.query(
            `INSERT INTO planning_layers (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at)
             SELECT constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at FROM phi_stage`,
          );
          const filedCount = await client.query(
            "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = 'priority_habitat'",
          );
          if (filedCount.rows[0].n !== expectedFiled)
            throw new Error("the filed patch count does not match — rolling back");
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        }
        // The run is complete: staging + checkpoint go together,
        // so nothing is left behind for the next edition.
        await resume.clear();
      } finally {
        if (ownsClient) await client.end().catch(() => {});
      }
    },
    async abortFiling() {
      // The staging + checkpoint STAY: they are the next run's
      // resume point. A run that never prepared leaves whatever
      // a previous run left, and the next run's prepare()
      // validates or discards it.
      if (ownsClient) await client.end().catch(() => {});
    },
  };
}

// The per-patch processor (BUG-368): the run's counters,
// the UID dedupe set, the per-home golden tallies and the
// checkpoint snapshot, owned by one object so the filing
// run and the resume tests drive the same path. main()
// wires onRow to the filer's stageRow; verify-only runs
// pass none and stage nothing.
/**
 * @param {{ onRow?: ((row: { name: string | null, wkt: string, reference: string, detail: string | null, sourceDate: string }, ctx: { read: number, state: Record<string, unknown> }) => Promise<void>) | null }} [options]
 */
export function createPhiProcessor({ onRow = null } = {}) {
  const state = {
    read: 0,
    geoless: 0,
    invalid: 0,
    duplicates: 0,
    filed: 0,
    uids: new Set(),
    versions: new Map(),
    // The OBJECTID of the last feature consumed — the
    // order check's seed on a resumed read.
    lastObjectId: null,
    homes: Object.fromEntries(
      Object.keys(HOMES).map((pc) => [
        pc,
        { inside: 0, nearestName: null, nearestMiles: Infinity, within1: 0 },
      ]),
    ),
  };
  // The checkpoint's state: the run's scalars, in a
  // JSON-plain shape (nearestMiles Infinity rides as
  // null; the versions Map rides as its keys).
  const checkpointState = () => ({
    geoless: state.geoless,
    duplicates: state.duplicates,
    invalid: state.invalid,
    lastObjectId: state.lastObjectId,
    versions: [...state.versions.keys()],
    homes: Object.fromEntries(
      Object.entries(state.homes).map(([pc, t]) => [
        pc,
        {
          inside: t.inside,
          nearestName: t.nearestName,
          nearestMiles: Number.isFinite(t.nearestMiles) ? t.nearestMiles : null,
          within1: t.within1,
        },
      ]),
    ),
  });
  return {
    state,
    checkpointState,
    // Seed the run's scalars from a resumed checkpoint, and
    // rebuild the UID dedupe set from the staged rows — the
    // staged prefix is the durable record of what the killed
    // run consumed.
    async seedFromCheckpoint(cp, stagedUids) {
      state.read = cp.read_count;
      state.filed = cp.filed_count;
      state.geoless = cp.state?.geoless ?? 0;
      state.duplicates = cp.state?.duplicates ?? 0;
      state.invalid = cp.state?.invalid ?? 0;
      state.lastObjectId = cp.state?.lastObjectId ?? null;
      for (const v of cp.state?.versions ?? []) state.versions.set(v, 1);
      for (const [pc, tally] of Object.entries(cp.state?.homes ?? {})) {
        if (!state.homes[pc]) continue;
        state.homes[pc].inside = tally.inside ?? 0;
        state.homes[pc].nearestName = tally.nearestName ?? null;
        state.homes[pc].nearestMiles = tally.nearestMiles ?? Infinity;
        state.homes[pc].within1 = tally.within1 ?? 0;
      }
      for (const uid of stagedUids) state.uids.add(uid);
    },
    // One patch: validate, dedupe by UID, tally against the
    // golden homes, and (in filing mode) hand the row to
    // onRow. Failures accumulate in state and are judged
    // after the read completes.
    async processFeature(feature) {
      state.read += 1;
      const props = {};
      for (const [k, v] of Object.entries(feature.properties ?? {}))
        props[k] = typeof v === "string" ? v.trim() : v;
      // Every consumed feature advances the order check's
      // seed, filed or not.
      if (Number.isFinite(props.OBJECTID)) state.lastObjectId = props.OBJECTID;
      const uid = props.UID;
      if (!uid) throw new Error("contract failure: a PHI patch carries no UID");
      if (state.uids.has(uid)) {
        state.duplicates += 1;
        return;
      }
      state.uids.add(uid);
      state.versions.set(props.Version, (state.versions.get(props.Version) ?? 0) + 1);
      let polygons = null;
      try {
        polygons = geojsonPolygons(feature.geometry);
      } catch {
        state.invalid += 1;
        return;
      }
      if (polygons === null) {
        state.geoless += 1;
        return;
      }
      const bbox = bboxOf(polygons);
      for (const [postcode, home] of Object.entries(HOMES)) {
        const tally = state.homes[postcode];
        // A point inside the patch would force the bound to 0,
        // so a bound over a mile settles all three tallies.
        if (bboxLowerBoundMiles(bbox, home) > 1.0) continue;
        const miles = geometryDistanceMiles(polygons, home);
        if (miles === 0) tally.inside += 1;
        if (miles <= 1.0) tally.within1 += 1;
        if (miles < tally.nearestMiles) {
          tally.nearestMiles = miles;
          tally.nearestName = props.MainHabs || null;
        }
      }
      state.filed += 1;
      if (onRow) {
        await onRow(
          {
            name: props.MainHabs || null,
            wkt: polygonsToWkt(polygons),
            reference: uid,
            detail:
              [props.HabCodes, props.AddHabs, props.PrimSource]
                .filter((p) => p !== "" && p != null)
                .join(" · ") || null,
            sourceDate: versionDate(parseVersion(props.Version)),
          },
          { read: state.read, state: checkpointState() },
        );
      }
    },
    checkGolden() {
      const fails = [];
      for (const [postcode, golden] of Object.entries(GOLDEN)) {
        const tally = state.homes[postcode];
        if (tally.inside !== 0)
          fails.push(
            `${postcode}: the point falls inside ${tally.inside} habitat patches — the golden reads say inside none`,
          );
        if (
          tally.nearestName !== golden.nearestName ||
          Math.abs(tally.nearestMiles - golden.nearestMiles) > 0.02
        )
          fails.push(
            `${postcode}: nearest patch should be ${golden.nearestName} at ${golden.nearestMiles} mi, got ${tally.nearestName} at ${tally.nearestMiles.toFixed(3)} mi`,
          );
        if (tally.within1 !== golden.within1)
          fails.push(
            `${postcode}: expected ${golden.within1} patches within a mile, got ${tally.within1}`,
          );
      }
      if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
    },
  };
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last checkpointed flush instead of
  // restarting; with no checkpoint this is a fresh start.
  const restart = args.includes("--restart");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;

  // BUG-265: one logger for the run — the read tally lives
  // in readPhiPages, the staging tally in flushStage, the
  // failure line in the catch below.
  const progress = createProgressLogger({ name: "load-priority-habitats" });
  // BUG-265: the phase the failure line names — reading
  // until the swap starts, filing after that.
  let phase = "reading";
  // The service's count, once known — the failure line's
  // total, and the staging tally's.
  let expected = null;

  // BUG-368: the filing run's filer — persistent staging +
  // checkpoint, opened ahead of the read so a failure
  // before any staging still names the resume point.
  let filer = null;
  // The run's processor: counters, dedupe, tallies. Its
  // onRow stages each filed patch through the filer.
  const run = createPhiProcessor({
    onRow: async (row, ctx) => {
      if (filer) await filer.stageRow(row, ctx);
    },
  });
  const state = run.state;

  try {
    // A filing run streams the reads into persistent
    // staging as they land (BUG-368), so the database
    // check moves ahead of the read: without DATABASE_URL a
    // filing run now fails before fetching instead of after
    // it. Verify-only never opens the database.
    if (!verifyOnly) {
      if (!process.env.DATABASE_URL)
        throw new Error("DATABASE_URL is not set — filing requires a database");
      filer = await beginFiling(progress, { restart });
    }

    if (fixtureMode) {
      // BUG-265: the fixture read has no count to read
      // against, so its progress is a stage marker, a
      // staging tally without a total, and a closing count.
      progress.stage("reading the fixture patches");
      // BUG-368: the edition fires the resume decision —
      // the filer prepares (resume or fresh start) and the
      // read skips the features the checkpoint covers.
      const edition = await peekPhiFixtureVersion(fixtureDir);
      let startOffset = 0;
      if (filer) {
        const prep = await filer.prepareResume(edition, null);
        if (prep.resumed) {
          startOffset = prep.checkpoint.next_start_index;
          await run.seedFromCheckpoint(prep.checkpoint, await filer.stagedUids());
        }
      }
      // The parts stream through streamPhiFixture (BUG-195);
      // the field contract judges the first feature before
      // any patch is processed, as it did when the parts
      // were concatenated.
      let fieldChecked = false;
      await streamPhiFixture(
        fixtureDir,
        async (feature) => {
          if (!fieldChecked) {
            fieldChecked = true;
            for (const field of FIELDS) {
              if (!(field in (feature.properties ?? {})))
                throw new Error(`contract failure: the fixture no longer carries "${field}"`);
            }
          }
          await run.processFeature(feature);
        },
        { startOffset },
      );
      progress.count({ label: "read", done: state.read, unit: "patches" });
    } else {
      progress.stage("reading the Priority Habitat Inventory service");
      const layerUrl = `${NE_BASE}/${SERVICE}/FeatureServer/0`;
      const meta = await fetchJson(`${layerUrl}?f=json`, "the PHI layer metadata");
      const metaFields = (meta.fields ?? []).map((f) => f.name);
      for (const field of FIELDS) {
        if (!metaFields.includes(field))
          throw new Error(`contract failure: the PHI layer no longer carries "${field}"`);
      }
      const countBody = await fetchJson(
        `${layerUrl}/query?where=1%3D1&returnCountOnly=true&f=json`,
        "the PHI count",
      );
      const countError = serviceErrorText(countBody);
      if (countError) throw new Error(`the PHI count query failed: ${countError}`);
      expected = countBody.count;
      if (!Number.isInteger(expected) || expected <= 0)
        throw new Error("contract failure: the PHI count response carries no count");
      // BUG-368: the edition (the inventory version, peeked
      // with one one-row query) fires the resume decision.
      const edition = await peekPhiLiveVersion(layerUrl);
      let startOffset = 0;
      if (filer) {
        const prep = await filer.prepareResume(edition, expected);
        if (prep.resumed) {
          startOffset = prep.checkpoint.next_start_index;
          await run.seedFromCheckpoint(prep.checkpoint, await filer.stagedUids());
        }
      }
      await readPhiPages(
        layerUrl,
        expected,
        async (batch) => {
          for (const feature of batch) await run.processFeature(feature);
        },
        { progress, startOffset, lastObjectId: state.lastObjectId },
      );
      if (state.read !== expected)
        throw new Error(
          `read ${state.read} patches but the service count is ${expected} — the read does not reconcile`,
        );
    }
    // The staged read stands complete before the golden
    // checks judge it — the tail flush checkpoints it.
    await filer?.flushTail({ read: state.read, state: run.checkpointState() });

    if (state.invalid > 0)
      throw new Error(
        `${state.invalid} patches carry geometry that does not parse — contract failure, nothing filed`,
      );
    if (state.filed + state.geoless + state.duplicates !== state.read)
      throw new Error("the patch counts do not reconcile — nothing filed");
    if (!fixtureMode && (state.read < 750000 || state.read > 900000))
      throw new Error(`sanity failure: ${state.read} patches read is outside the expected band`);
    if (state.versions.size !== 1)
      throw new Error(
        `contract failure: the inventory carries ${state.versions.size} versions (${[...state.versions.keys()].join(", ")}) — a single national version is the published shape`,
      );
    const [versionLabel] = [...state.versions.keys()];
    const version = parseVersion(versionLabel);
    if (!fixtureMode && versionAgeMonths(version) > 9)
      throw new Error(
        `sanity failure: PHI version ${versionLabel} is over ~9 months old — the twice-yearly cycle has slipped`,
      );
    run.checkGolden();

    const summary = () =>
      `load-priority-habitats · Natural England · Priority Habitat Inventory ${versionLabel} (${versionDate(version)}) · ` +
      `${formatCount(state.filed)} patches filed (${formatCount(state.read)} read · ${formatCount(state.geoless)} without geometry counted · ${formatCount(state.duplicates)} duplicate UIDs dropped)`;

    if (verifyOnly) {
      console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
      return;
    }
    phase = "filing";
    progress.stage(`filing ${formatCount(state.filed)} patches into planning_layers`);
    const activeFiler = filer;
    filer = null;
    await activeFiler.finishFiling(state.filed);
    console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
  } catch (error) {
    // BUG-265: the failure line names the phase and how far
    // the read or filing got — the swap is still atomic, so
    // a failed run files nothing and the live layer is
    // untouched. BUG-368: the line carries the resume note,
    // so a failure names the point the next run resumes from.
    progress.failed({
      stage: phase,
      filed: state.filed,
      total: expected,
      error,
      resume: filer
        ? filer.resumeNote()
        : "re-run the loader from the start (nothing is filed until the swap)",
    });
    if (filer) await filer.abortFiling();
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      `load-priority-habitats FAILED: ${error.message}${error.cause ? ` (${error.cause.message ?? error.cause})` : ""}`,
    );
    process.exitCode = 1;
  });
}
