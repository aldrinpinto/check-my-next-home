// Built-up areas loader (plan step M6.21, decision D41).
// Files the ONS built-up area polygons into planning_layers
// as constraint type built_up_area, following the M6.21 prep:
//
//   npm run load:built-up-areas
//   npm run load:built-up-areas -- --verify-only
//   npm run load:built-up-areas -- --file tests/fixtures/built-up-areas
//
// What the prep settled, and where it lives in this file:
//   - The source is ONS direct: "Built Up Areas (December
//     2024) Boundaries EW BGG (V2)", England and Wales,
//     7,775 areas as published. The platform's republished
//     copy is England-only and predates this edition
//     (new data last found 11 June 2024) — rejected at prep.
//   - Serving is the green-belt shape: the inside line names
//     the filed area, otherwise the nearest within 2 miles,
//     otherwise a proven none for England and Wales. The
//     name served is the filed polygon's name, never an
//     invented settlement name: within Greater London the
//     geography follows borough boundaries, so the Exeter
//     Road point's area is "Newham" — the borough — and the
//     answer says exactly that.
//   - The edition is two-yearly, so the loader is STATIC
//     class (the PVGIS precedent): it loads once, and a
//     re-file is a manual operator re-run when ONS publishes
//     a new edition. The source date filed is the edition
//     date (December 2024), not the retrieval date — the
//     edition is a property of the dataset.
//   - Attribution, from the ONS product page for this
//     dataset (not a mirror): "Source: Office for National
//     Statistics licensed under the Open Government Licence
//     v.3.0; contains OS data © Crown copyright and database
//     right" — the product is created from OS Open Built Up
//     Areas and carries both ONS and OS intellectual
//     property, as its own description states.
//
// Distances in the golden checks are to the nearest polygon
// edge on the longitude-scaled plane, the house basis.
//
// BUG-195 (23 Nov 2026): the read used to accumulate every
// fetched page into one features array and hold the whole
// processed set (full polygon geometry for all 7,775 areas)
// in memory while the filer sliced it. The read now streams
// in the BUG-187 flood shape: each page is processed as it
// lands and handed to the staging inserter, the run retains
// only the totals and the golden candidates (the flood
// sift), and the filing stays the same single-edition swap
// — the swap's atomicity is the contract (a failed run
// leaves the last good filing serving).
//
// BUG-368 (26 Nov 2026): the staging table is PERSISTENT
// now (built_up_area_stage, migration 0048) and a
// loader_checkpoint row records the last fully staged
// page, so a killed run resumes instead of restarting.
// The resume point is PAGE-GRANULAR, not per staged
// chunk: this loader's processor drops geoless and
// invalid features, so the count of items offered is
// not the count of features read — the only position a
// resumed run can reproduce exactly is a page boundary,
// where every raw feature of the page has been tallied
// and every filed item staged. The checkpoint's state
// therefore carries the dropped-feature tallies
// (geoless, invalid) as of that page, and the read
// skips to the checkpoint's raw-feature offset.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createGoldenSift, GOLDEN_WINDOW_MILES } from "./flood-stream.mjs";
import { createLoaderResume } from "./loader-resume.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

const SERVICE_URL =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/main_ONS_BUA_2024_EW_V2/FeatureServer/0/query";
const SOURCE_BUA =
  "Office for National Statistics — Built Up Areas (December 2024), licensed under the Open Government Licence v.3.0; contains OS data © Crown copyright and database right";
const EDITION_DATE = "2024-12-01";
const PAGE_SIZE = 2000;

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};
const BATH = { lat: 51.3811, lng: -2.359 };
// The areas the golden points fall inside, pinned from the
// filed December 2024 polygons at build (16 Nov 2026).
const EXPECTED_INSIDE = {
  "CM3 2JT": { code: "E63011486", name: "Hatfield Peverel" },
  "E16 1GN": { code: "E63012003", name: "Newham" },
  "KT17 1FH": { code: "E63012408", name: "Ewell" },
};

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

// GeoJSON geometry -> the house polygon structure (polygons
// -> rings -> [lng, lat] pairs), validated as strictly as
// the WKT loaders validate theirs: corrupt geometry is a
// contract breach, an absent geometry a counted state.
function geojsonPolygons(geometry) {
  if (!geometry) return null;
  const wrap = (coords, depth) => {
    if (depth === 0) {
      if (!Array.isArray(coords) || coords.length !== 2 || !coords.every(Number.isFinite))
        throw new Error("malformed GeoJSON coordinate");
      return coords;
    }
    if (!Array.isArray(coords) || coords.length === 0)
      throw new Error("malformed GeoJSON geometry");
    return coords.map((c) => wrap(c, depth - 1));
  };
  if (geometry.type === "Polygon") return [wrap(geometry.coordinates, 2)];
  if (geometry.type === "MultiPolygon") return wrap(geometry.coordinates, 3);
  throw new Error(`unsupported GeoJSON geometry type: ${geometry.type}`);
}

function polygonsToWkt(polygons) {
  const ring = (r) => `(${r.map((pair) => `${pair[0]} ${pair[1]}`).join(",")})`;
  const polygon = (p) => `(${p.map(ring).join(",")})`;
  return `MULTIPOLYGON (${polygons.map(polygon).join(",")})`;
}

// The bounding box of this loader's polygon form —
// polygons -> rings -> [lng, lat] pairs — in the golden
// sift's [x0, y0, x1, y1] shape. The sift's own
// bboxOfPolygons speaks the flood loaders' flat form
// (rings as Float64Array x,y pairs); fed this loader's
// nested pairs it reads arrays as coordinates, every
// comparison misses, and the box comes out infinite —
// the sift then retains nothing and the golden checks
// fail on an empty candidate set (BUG-199, the CI
// fixture pass of 23 Nov 2026). The sift's contract
// takes an item's own bbox when it carries one, so the
// read offers each item with its box computed here, in
// the form this loader actually holds.
function bboxOfNested(polygons) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const polygon of polygons)
    for (const ring of polygon)
      for (const pair of ring) {
        const x = pair[0];
        const y = pair[1];
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  return [x0, y0, x1, y1];
}

// The per-batch processor (BUG-195): the read hands it one
// page — or one page-sized slice of the fixture — at a time.
// It validates and dedupes across batches (the seen set is
// the run's dedupe index: 7,775 short codes, keys only,
// never rows), counts the geometry-less, and returns each
// batch's filed items. The malformed / unnamed / duplicate
// count is judged at finish(), over the whole read, exactly
// as the one-shot form judged it — the same total, the same
// message, nothing filed.
export function createFeatureProcessor() {
  let total = 0;
  let geoless = 0;
  let invalid = 0;
  let filedCount = 0;
  const seen = new Set();
  return {
    processBatch(features) {
      total += features.length;
      const items = [];
      for (const feature of features) {
        let polygons = null;
        try {
          polygons = geojsonPolygons(feature.geometry);
        } catch {
          invalid += 1;
          continue;
        }
        if (polygons === null) {
          geoless += 1;
          continue;
        }
        const code = (feature.properties?.BUA24CD ?? "").trim();
        const name = (feature.properties?.BUA24NM ?? "").trim();
        if (code === "" || name === "") {
          invalid += 1;
          continue;
        }
        if (seen.has(code)) {
          invalid += 1;
          continue;
        }
        seen.add(code);
        filedCount += 1;
        items.push({ code, name, polygons });
      }
      return items;
    },
    // The running tallies as of the last processed page —
    // the read driver hands them to the staging sink so
    // the page-end checkpoint can seed a resumed run
    // (BUG-368).
    tallies() {
      return { total, geoless, invalid, filed: filedCount };
    },
    // BUG-368: the seeded invalid count rides in — a run
    // resumed after an earlier portion already counted
    // invalid features must still fail the whole read at
    // this judgement, over the combined count. The return
    // keeps the shape the collecting form always had
    // ({ total, geoless, filed }) — the invalid count is
    // judgement input only, never a filed total.
    finish(seedInvalid = 0) {
      const invalidTotal = invalid + seedInvalid;
      if (invalidTotal > 0)
        throw new Error(
          `built-up areas: ${invalidTotal} features are malformed, unnamed or duplicated — contract failure, nothing filed`,
        );
      return { total, geoless, filed: filedCount };
    },
  };
}

// The collecting form over the processor: the whole feature
// set in, the whole filed set out — the shape this step was
// built with, kept for small inputs and tests. The filing
// run streams (readLive / readFixture with a sink).
export function processFeatures(features) {
  const processor = createFeatureProcessor();
  const filed = processor.processBatch(features);
  const totals = processor.finish();
  return { total: totals.total, geoless: totals.geoless, filed };
}

// The golden checks run over the sifted candidates (the
// flood-stream sift): every assertion here is a containment
// at a golden point, and a containing polygon's bounding
// box holds the point — distance zero, always retained.
function checkGolden(filed) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  for (const [postcode, home] of Object.entries(HOMES)) {
    const inside = filed.filter((f) => polygonsContain(f.polygons, home.lng, home.lat));
    const expected = EXPECTED_INSIDE[postcode];
    expect(
      inside.length === 1 && inside[0].code === expected.code && inside[0].name === expected.name,
      `${postcode}: the point should fall inside ${expected.name} (${expected.code}), got ${
        inside.map((f) => `${f.name} (${f.code})`).join(", ") || "no area"
      }`,
    );
  }
  const bath = filed.filter((f) => polygonsContain(f.polygons, BATH.lng, BATH.lat));
  expect(
    bath.length === 1 && bath[0].name === "Bath",
    `the Bath witness point should fall inside the Bath built-up area, got ${bath.map((f) => f.name).join(", ") || "no area"}`,
  );
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

// The golden points the sift retains candidates for: the
// three homes and the Bath witness.
const SIFT_HOMES = { ...HOMES, BATH };

// The streaming read driver (BUG-195, the BUG-187 shape):
// batches of raw features arrive one at a time; each is
// processed and handed to the sink (the staging inserter
// in a filing run) as it lands, offered to the golden
// sift, and released. What the run retains is the totals
// and the sifted candidates — never the dataset.
//
// BUG-368: a resumed run is seeded — the staged portion's
// totals ride in as `seed` (raw features read, areas
// filed, geoless and invalid tallies) and its golden
// candidates as `seedItems`, so the returned totals and
// the golden checks cover the whole read. The sink is
// called per page as onItems(items, rawOffset, tallies):
// rawOffset is the absolute raw-feature position at the
// end of the page (seed included) — the page-end resume
// point — and tallies are the dropped-feature counts as
// of that page, seed included.
async function driveRead(batches, onItems, { progress = null, seed = null, seedItems = [] } = {}) {
  const processor = createFeatureProcessor();
  const sift = createGoldenSift(SIFT_HOMES);
  for (const item of seedItems) sift.offer({ ...item, bbox: bboxOfNested(item.polygons) });
  // BUG-265: the paged read is the run's long phase — 7,775
  // areas live over four pages — so a tally lands every
  // 2,000 features, a heartbeat halfway through the read,
  // and a page that takes more than 3x the recent average
  // earns a warning. No total: the service carries no count
  // up front. On a resume the tally counts the whole read,
  // seed included.
  const readTally = progress?.tally({ label: "read", every: PAGE_SIZE, unit: "features" });
  const readWatch = createBatchWatch();
  let pageIndex = 0;
  let read = 0;
  for await (const features of batches) {
    const started = Date.now();
    const items = processor.processBatch(features);
    for (const item of items) sift.offer({ ...item, bbox: bboxOfNested(item.polygons) });
    read += features.length;
    const rawOffset = read + (seed?.total ?? 0);
    const tallies = processor.tallies();
    if (onItems)
      await onItems(items, rawOffset, {
        geoless: tallies.geoless + (seed?.geoless ?? 0),
        invalid: tallies.invalid + (seed?.invalid ?? 0),
      });
    const { tookMs, averageMs, slow } = readWatch.observe(Date.now() - started);
    pageIndex += 1;
    readTally?.tick(rawOffset);
    progress?.heartbeat({ stage: "read", done: rawOffset, every: 2 * PAGE_SIZE });
    if (slow) {
      progress?.warning({
        what: "read page duration",
        value: `page ${pageIndex} took ${formatDuration(tookMs)}`,
        threshold: `3x recent average ${formatDuration(averageMs)}`,
      });
    }
  }
  const totals = processor.finish(seed?.invalid ?? 0);
  readTally?.finish(totals.total + (seed?.total ?? 0));
  return {
    total: totals.total + (seed?.total ?? 0),
    geoless: totals.geoless + (seed?.geoless ?? 0),
    filed: totals.filed + (seed?.filed ?? 0),
    items: sift.items,
  };
}

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
// BUG-385: a transient fetch failure is retried for up to 30
// minutes (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
// 2026) — the same retry the flood loaders got in BUG-384.
// Past the budget the original error fails the run and it
// waits. The delay caps at the last schedule entry; a test
// may pass delaysMs: [] for instant retries. Non-transient
// failures throw at once (see isTransientFetchError).
export async function fetchResponse(
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
      if (Date.now() - startedAt >= retryBudgetMs) throw error;
      const delay =
        delaysMs.length === 0 ? 0 : delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      onRetry?.(error, attempt, delay, what);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function readLive({
  onItems = null,
  progress = null,
  onEdition = null,
  delaysMs = RETRY_DELAYS_MS,
  onRetry = null,
  retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS,
} = {}) {
  // BUG-368: the edition fires the resume decision — the
  // runner returns the raw-feature offset the read starts
  // from, the seeded totals, and the staged golden
  // candidates. The edition is the dataset's own date,
  // constant for this edition.
  const resume = (await onEdition?.(EDITION_DATE)) ?? { startOffset: 0 };
  async function* pages() {
    for (let offset = resume.startOffset; ; offset += PAGE_SIZE) {
      const params = new URLSearchParams({
        where: "1=1",
        outFields: "BUA24CD,BUA24NM,BUA24NMW",
        outSR: "4326",
        f: "geojson",
        resultOffset: String(offset),
        resultRecordCount: String(PAGE_SIZE),
        orderByFields: "BUA24CD",
        geometryPrecision: "6",
      });
      const response = await fetchResponse(
        `${SERVICE_URL}?${params}`,
        "the built-up areas download",
        {
          delaysMs,
          onRetry,
          retryBudgetMs,
        },
      );
      const page = await response.json();
      const batch = page.features ?? [];
      yield batch;
      if (batch.length < PAGE_SIZE) break;
    }
  }
  return driveRead(pages(), onItems, {
    progress,
    seed: resume.seed ?? null,
    seedItems: resume.seedItems ?? [],
  });
}

/**
 * @param {string} fixtureDir
 * @param {{ onItems?: ((items: any[], rawOffset: number, tallies: { geoless: number, invalid: number }) => Promise<void>) | null, progress?: import("./progress.mjs").ProgressLogger | null, onEdition?: ((edition: string) => Promise<{ startOffset: number, seed?: { total: number, filed: number, geoless: number, invalid: number }, seedItems?: any[] }>) | null }} [options]
 */
export async function readFixture(
  fixtureDir,
  { onItems = null, progress = null, onEdition = null } = {},
) {
  // BUG-368: same resume decision point as the live read.
  const resume = (await onEdition?.(EDITION_DATE)) ?? { startOffset: 0 };
  const text = await readFile(join(fixtureDir, "built-up-areas.geojson"), "utf8");
  const features = JSON.parse(text).features ?? [];
  async function* slices() {
    for (let at = resume.startOffset; at < features.length; at += PAGE_SIZE)
      yield features.slice(at, at + PAGE_SIZE);
  }
  return driveRead(slices(), onItems, {
    progress,
    seed: resume.seed ?? null,
    seedItems: resume.seedItems ?? [],
  });
}

// --- filing ------------------------------------------------------------

// Stage, count, swap — streamed (BUG-195, the flood shape),
// with resume support (BUG-368): staging is a PERSISTENT
// table now (migration 0048), and a loader_checkpoint row
// records the last fully staged page, so a killed run
// resumes instead of restarting. beginFiling opens the
// staging table; stageItems converts each page to WKT and
// inserts it in the house chunks of 10 rows, checkpointing
// once the whole page is staged; finishFiling runs the
// counts and the swap exactly as the one-shot filer did,
// in its own transaction. The single-edition swap: the
// whole built_up_area layer is replaced in this
// transaction, so a failed run leaves the last good filing
// serving untouched.
//
// THE RESUME UNITS. The read is paged by resultOffset and
// the processor drops geoless/invalid features, so the
// resume point is the raw-feature offset at the last
// fully staged page (next_start_index), and the
// checkpoint's state carries the dropped-feature tallies
// as of that page. A page that was mid-stage when the run
// died has staged rows past the checkpoint; prepare()
// trims that tail, and the resumed run re-stages the
// page whole. The golden sift is rebuilt from the staged
// rows near the golden homes (stagedGoldenItems), so the
// golden checks run over the whole read either way.
/**
 * Open the filing run's database client and resume handle
 * (BUG-368). The client is injectable so the resume tests
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
  const ownsClient = !injectedClient;
  if (ownsClient) await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS built_up_area_stage (
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
    loader: "load-built-up-areas",
    stageTable: "built_up_area_stage",
    progress,
    restart,
  });
  const CHUNK = 10;
  const pending = [];
  let staged = 0;
  let seqNext = 0;
  let edition = null;
  /** @type {{ resumed: boolean, reason?: string, checkpoint?: any, prefix?: boolean }} */
  let resumePrep = { resumed: false };
  async function flushPending(flushTail = false) {
    while (pending.length >= CHUNK || (flushTail && pending.length > 0)) {
      const chunk = pending.splice(0, Math.min(CHUNK, pending.length));
      const values = [];
      const params = [];
      const base = seqNext;
      seqNext += chunk.length;
      chunk.forEach((row, i) => {
        const b = i * 10;
        values.push(
          `($${b + 1},$${b + 2},ST_Multi(ST_GeomFromText($${b + 3}, 4326)),$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`,
        );
        params.push(
          "built_up_area",
          row.name,
          row.wkt,
          row.code,
          null,
          null,
          null,
          SOURCE_BUA,
          EDITION_DATE,
          base + i,
        );
      });
      await client.query(
        `INSERT INTO built_up_area_stage (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, seq)
         VALUES ${values.join(",")}`,
        params,
      );
      staged += chunk.length;
    }
  }
  return {
    stagedCount: () => staged,
    resumePrep: () => resumePrep,
    resumeNote: () => resume.resumeNote(),
    // Decide, from the edition and the staged rows, whether this
    // run resumes or starts from zero. Called by the runner once
    // the read has resolved the edition, before the first page
    // is staged.
    async prepareResume(ed) {
      edition = ed;
      resumePrep = await resume.prepare({ edition, expected: null });
      if (resumePrep.resumed) {
        const cp = resumePrep.checkpoint;
        staged = cp.filed_count;
        seqNext = cp.filed_count;
      }
      return resumePrep;
    },
    // The staged portion's golden candidates, for rebuilding the
    // sift after a resume — the envelope test mirrors the sift's
    // bbox test, so the rebuilt set is exactly what the live sift
    // would have retained for that portion. Called after
    // prepareResume, which has already trimmed the staged tail
    // past the checkpoint, so no cap is needed.
    async stagedGoldenItems() {
      const homes = Object.values(SIFT_HOMES);
      const windowParam = 2 + homes.length * 2;
      const conditions = [];
      const params = [];
      homes.forEach((home, i) => {
        const base = 2 + i * 2;
        conditions.push(
          `ST_DWithin(ST_Envelope(geom)::geography, ST_SetSRID(ST_MakePoint($${base}, $${base + 1}), 4326)::geography, $${windowParam})`,
        );
        params.push(home.lng, home.lat);
      });
      params.push(GOLDEN_WINDOW_MILES * 1609.344);
      const { rows } = await client.query(
        `SELECT name, source_reference, ST_AsGeoJSON(geom) AS geojson FROM built_up_area_stage WHERE (${conditions.join(" OR ")})`,
        params,
      );
      return rows.map((r) => ({
        code: r.source_reference,
        name: r.name,
        polygons: geojsonPolygons(JSON.parse(r.geojson)),
      }));
    },
    // Stage one page's filed items, then checkpoint the page:
    // the page is fully staged now — tail included — so the
    // resume point is this page's raw-feature offset and the
    // checkpoint state carries the dropped-feature tallies
    // as of this page. A page that yields no filed items
    // still checkpoints: its raw features are consumed and
    // must be skipped on resume.
    async stageItems(items, rawOffset, tallies = {}) {
      for (const item of items) {
        pending.push({ name: item.name, wkt: polygonsToWkt(item.polygons), code: item.code });
        if (pending.length >= CHUNK) await flushPending();
      }
      await flushPending(true);
      if (edition && Number.isFinite(rawOffset)) {
        await resume.checkpoint({
          edition,
          expected: null,
          nextStartIndex: rawOffset,
          read: rawOffset,
          filed: staged,
          state: {
            geoless: tallies.geoless ?? 0,
            invalid: tallies.invalid ?? 0,
          },
          unit: "features",
        });
      }
    },
    async finishFiling(expectedCount) {
      try {
        await flushPending(true);
        const stagedRes = await client.query("SELECT count(*)::int AS n FROM built_up_area_stage");
        if (stagedRes.rows[0].n !== expectedCount)
          throw new Error("the staged area count does not match — rolling back");
        await client.query("BEGIN");
        try {
          await client.query("DELETE FROM planning_layers WHERE constraint_type = 'built_up_area'");
          await client.query(
            `INSERT INTO planning_layers (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at)
           SELECT constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at FROM built_up_area_stage`,
          );
          const filedCount = await client.query(
            "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = 'built_up_area'",
          );
          if (filedCount.rows[0].n !== expectedCount)
            throw new Error("the filed area count does not match — rolling back");
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

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last checkpointed page instead of
  // restarting; with no checkpoint this is a fresh start.
  const restart = args.includes("--restart");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;
  // BUG-265: one logger for the run — the read tally and the
  // filing marker below.
  const progress = createProgressLogger({ name: "load-built-up-areas" });

  // A filing run streams the read into the persistent
  // staging table as it lands (BUG-195, BUG-368), so the
  // database check moves ahead of the read: without
  // DATABASE_URL a filing run now fails before fetching
  // instead of after it. Verify-only never opens the
  // database.
  let filer = null;
  if (!verifyOnly) {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL is not set — filing requires a database");
    filer = await beginFiling(progress, { restart });
  }

  let processed;
  try {
    progress.stage("reading the built-up areas");
    const onItems = filer
      ? (items, rawOffset, tallies) => filer.stageItems(items, rawOffset, tallies)
      : null;
    // BUG-368: the edition fires the resume decision — the
    // filer prepares (resume or fresh start) and hands back
    // the raw-feature offset the read starts from, with the
    // seeded totals and the staged golden candidates for the
    // sift.
    const onEdition = filer
      ? async (edition) => {
          const prep = await filer.prepareResume(edition);
          if (!prep.resumed) return { startOffset: 0 };
          const cp = prep.checkpoint;
          return {
            startOffset: cp.next_start_index,
            seed: {
              total: cp.read_count,
              filed: cp.filed_count,
              geoless: cp.state?.geoless ?? 0,
              invalid: cp.state?.invalid ?? 0,
            },
            seedItems: await filer.stagedGoldenItems(),
          };
        }
      : null;
    processed = fixtureMode
      ? await readFixture(fixtureDir, { onItems, progress, onEdition })
      : await readLive({ onItems, progress, onEdition });
    if (!fixtureMode && (processed.filed < 7000 || processed.filed > 8500))
      throw new Error(
        `sanity failure: ${processed.filed} built-up areas is outside the expected band for the December 2024 edition (7,775 as published)`,
      );
    checkGolden(processed.items);
  } catch (error) {
    // BUG-265: the read, the sanity band and the golden checks
    // all fail before anything is filed.
    progress.failed({
      stage: "read",
      filed: 0,
      error,
      resume: filer
        ? filer.resumeNote()
        : "re-run the loader from the start (nothing is filed until the swap)",
    });
    if (filer) await filer.abortFiling();
    throw error;
  }

  const summary = () =>
    `load-built-up-areas · ONS Built Up Areas (December 2024) Boundaries EW BGG (V2) · ` +
    `${formatCount(processed.filed)} areas filed (${formatCount(processed.total)} features in file · ${formatCount(processed.geoless)} without geometry counted) · ` +
    `golden points inside Hatfield Peverel, Newham and Ewell`;

  if (verifyOnly) {
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    return;
  }

  const activeFiler = filer;
  filer = null;
  // BUG-265: the filing swap is the run's second long step.
  progress.stage(`filing ${formatCount(processed.filed)} areas — counts and swap`);
  try {
    await activeFiler.finishFiling(processed.filed);
  } catch (error) {
    progress.failed({
      stage: "filing",
      filed: 0,
      total: processed.filed,
      error,
      // BUG-368: a swap failure leaves the staged read
      // checkpointed, so the next run resumes at the swap.
      resume: activeFiler.resumeNote(),
    });
    throw error;
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`load-built-up-areas FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
