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
// sift), and the filing stays the same single-transaction
// stage-and-swap — the swap's atomicity is the contract
// (a failed run leaves the last good filing serving), so
// the intake streams into the staging table inside that
// transaction rather than committing in chunks.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createGoldenSift } from "./flood-stream.mjs";
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
    finish() {
      if (invalid > 0)
        throw new Error(
          `built-up areas: ${invalid} features are malformed, unnamed or duplicated — contract failure, nothing filed`,
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
// in a filing run) as it lands, offered to the golden sift,
// and released. What the run retains is the totals and the
// sifted candidates — never the dataset.
async function driveRead(batches, onItems, { progress = null } = {}) {
  const processor = createFeatureProcessor();
  const sift = createGoldenSift(SIFT_HOMES);
  // BUG-265: the paged read is the run's long phase — 7,775
  // areas live over four pages — so a tally lands every
  // 2,000 features, a heartbeat halfway through the read,
  // and a page that takes more than 3x the recent average
  // earns a warning. No total: the service carries no count
  // up front.
  const readTally = progress?.tally({ label: "read", every: PAGE_SIZE, unit: "features" });
  const readWatch = createBatchWatch();
  let pageIndex = 0;
  let read = 0;
  for await (const features of batches) {
    const started = Date.now();
    const items = processor.processBatch(features);
    for (const item of items) sift.offer({ ...item, bbox: bboxOfNested(item.polygons) });
    if (onItems) await onItems(items);
    const { tookMs, averageMs, slow } = readWatch.observe(Date.now() - started);
    pageIndex += 1;
    read += features.length;
    readTally?.tick(read);
    progress?.heartbeat({ stage: "read", done: read, every: 2 * PAGE_SIZE });
    if (slow) {
      progress?.warning({
        what: "read page duration",
        value: `page ${pageIndex} took ${formatDuration(tookMs)}`,
        threshold: `3x recent average ${formatDuration(averageMs)}`,
      });
    }
  }
  const totals = processor.finish();
  readTally?.finish(totals.total);
  return { ...totals, items: sift.items };
}

export async function readLive({ onItems = null, progress = null } = {}) {
  async function* pages() {
    for (let offset = 0; ; offset += PAGE_SIZE) {
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
      const response = await fetch(`${SERVICE_URL}?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status} for the built-up areas download`);
      const page = await response.json();
      const batch = page.features ?? [];
      yield batch;
      if (batch.length < PAGE_SIZE) break;
    }
  }
  return driveRead(pages(), onItems, { progress });
}

/**
 * @param {string} fixtureDir
 * @param {{ onItems?: ((items: any[]) => Promise<void>) | null, progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export async function readFixture(fixtureDir, { onItems = null, progress = null } = {}) {
  const text = await readFile(join(fixtureDir, "built-up-areas.geojson"), "utf8");
  const features = JSON.parse(text).features ?? [];
  async function* slices() {
    for (let at = 0; at < features.length; at += PAGE_SIZE)
      yield features.slice(at, at + PAGE_SIZE);
  }
  return driveRead(slices(), onItems, { progress });
}

// --- filing ------------------------------------------------------------

// Stage, count, swap — one transaction, fed as a stream
// (BUG-195, the flood shape). beginFiling opens the
// transaction and the staging table; stageItems converts
// each batch to WKT and inserts it in the house chunks of
// 10 rows, so neither the item set nor its WKT copy is ever
// held whole; finishFiling runs the counts and the swap
// exactly as the one-shot filer did. Any failure mid-stream
// rolls the whole load back via abortFiling — the swap's
// atomicity is the contract.
async function beginFiling() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `CREATE TEMP TABLE planning_stage (
         constraint_type text, name text, geom geometry(MultiPolygon, 4326),
         source_reference text, organisation text, quality text, detail text,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now()
       ) ON COMMIT DROP`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
    throw error;
  }
  const CHUNK = 10;
  const pending = [];
  async function flushPending(flushTail = false) {
    while (pending.length >= CHUNK || (flushTail && pending.length > 0)) {
      const chunk = pending.splice(0, Math.min(CHUNK, pending.length));
      const values = [];
      const params = [];
      chunk.forEach((row, i) => {
        const base = i * 9;
        values.push(
          `($${base + 1},$${base + 2},ST_Multi(ST_GeomFromText($${base + 3}, 4326)),$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`,
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
        );
      });
      await client.query(
        `INSERT INTO planning_stage (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date)
         VALUES ${values.join(",")}`,
        params,
      );
    }
  }
  return {
    async stageItems(items) {
      for (const item of items) {
        pending.push({ name: item.name, wkt: polygonsToWkt(item.polygons), code: item.code });
        if (pending.length >= CHUNK) await flushPending();
      }
    },
    async finishFiling(expectedCount) {
      try {
        await flushPending(true);
        const staged = await client.query("SELECT count(*)::int AS n FROM planning_stage");
        if (staged.rows[0].n !== expectedCount)
          throw new Error("the staged area count does not match — rolling back");
        await client.query("DELETE FROM planning_layers WHERE constraint_type = 'built_up_area'");
        await client.query(
          `INSERT INTO planning_layers (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at)
           SELECT constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at FROM planning_stage`,
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
  // BUG-265: one logger for the run — the read tally and the
  // filing marker below.
  const progress = createProgressLogger({ name: "load-built-up-areas" });

  // A filing run streams the read into the staging
  // transaction as it lands (BUG-195), so the database check
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
    progress.stage("reading the built-up areas");
    const onItems = filer ? (items) => filer.stageItems(items) : null;
    processed = fixtureMode
      ? await readFixture(fixtureDir, { onItems, progress })
      : await readLive({ onItems, progress });
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
      resume: "re-run the loader from the start (nothing is filed until the swap)",
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
      resume:
        "re-run the loader from the start (the swap rolled back, the live layer is untouched)",
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
