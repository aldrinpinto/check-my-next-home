// Air Quality Management Areas loader (plan step M6.30,
// decision D59).
// Files the AQMA boundaries into planning_layers as
// constraint type aqma, following the M6.30 prep:
//
//   npm run load:aqma
//   npm run load:aqma -- --verify-only
//   npm run load:aqma -- --file tests/fixtures/aqma
//
// What the prep settled, and where it lives in this file:
//   - The source is the ArcGIS service Ricardo operates
//     for Defra UK-AIR (the service the UK-AIR map app
//     itself renders), layer 0 "All pollutants" over one
//     feature class. The service description calls the
//     file England-only nowhere; planning.data.gov.uk's
//     consideration record says "England", but the file
//     itself is UK-wide — measured from the file: 374
//     areas (England 310, Wales 32, Scotland 14, Northern
//     Ireland 18), every feature carrying an LA_ONS_ID
//     whose first letter names its nation. UK-AIR is
//     right about the file; the consideration is wrong.
//   - The file carries NO per-area dates of any kind —
//     no declaration, amendment or revocation column.
//     Dates live only in the UK-AIR register's per-area
//     web pages, and the house files published downloads,
//     never register pages (the BSR-register lesson), so
//     the filing carries the DATASET EDITION instead:
//     the "Published: YYYY_MM_DD" date in the service
//     description, parsed on every run, fail-loud if
//     absent (the flood WMS dated-layer pattern). The
//     served answer carries that edition date.
//   - Revoked areas are ABSENT from the file, not
//     flagged — the file is the current set only. The
//     revocation mechanism is the single-edition swap
//     below: each filing replaces the whole aqma layer
//     in one transaction, so a revoked area disappears
//     at the next quarterly filing, and between filings
//     the served edition date states the vintage.
//   - The filing key is AQMA_REF (unique on all 374;
//     files as source_reference). AQMA_ID is NOT unique
//     and is never keyed on; fid is a service artefact.
//     Not filed: DESCRIPTIO (source prose — the
//     brownfield notes precedent), CHANGE_LOG (an
//     objective-level note, not a status), AREA_*,
//     LA_ID, LA_ONS_ID/NAM (the nation is derived from
//     LA_ONS_ID for the coverage contract and not filed),
//     and the *_LV objective shorthand ("annual" /
//     "both" / "24-hour") — shorthand codes, not
//     publishable words; the step serves pollutants,
//     not objectives (prep R2).
//   - The pollutant flags file as CODES in detail,
//     semicolon-joined in register order ("NO2; PM10") —
//     the Article 4 detail precedent; the brain composes
//     the words. BENZENE is in the vocabulary though no
//     area in the current edition declares it.
//   - Coverage is a LOADER CONTRACT, not a served state
//     (prep R7): the total must sit within ±10% of the
//     374 snapshot and every nation's count must clear
//     its floor, or the run files nothing and the last
//     good filing keeps serving. A future edition that
//     silently dropped a nation fails the filing rather
//     than serving false absences.
//   - Licence: Open Government Licence, from UK-AIR's
//     own WMS services page ("The WMS layers hosted by
//     UK-AIR are published and licensed under the Open
//     Government Licence"); the underlying OS mapping
//     carries the consideration record's attribution
//     "© Crown copyright and database rights 2024
//     licenced under Defra's Public Sector Mapping
//     Agreement with Ordnance Survey (licence No.
//     100022861)". M10.4 names it as OGL at its build.
//   - Cadence: quarterly (the step's own rhythm). The
//     GIS edition is a dated republication; declarations
//     are live register events between editions.
//
// Distances in the golden checks are to the nearest
// polygon edge on the longitude-scaled plane, the house
// basis (the prep's goldens.py formula, verbatim).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createGoldenSift, GOLDEN_WINDOW_MILES } from "./flood-stream.mjs";
import { createLoaderResume } from "./loader-resume.mjs";
import { createProgressLogger, formatCount } from "./progress.mjs";

const SERVICE_BASE =
  "https://ukair.maps.rcdo.co.uk/ukairserver/rest/services/AQMA/aqma_boundaries/MapServer";
const SERVICE_META_URL = `${SERVICE_BASE}?f=json`;
const QUERY_URL = `${SERVICE_BASE}/0/query`;
export const SOURCE_NAME = "Defra UK-AIR — Air Quality Management Areas";
const PAGE_SIZE = 2000;

export const SNAPSHOT = 374; // the service's unfiltered count, 16 Nov 2026
// The ±10% band, rounded toward the snapshot: 337–411.
export const BAND_LOW = Math.ceil(SNAPSHOT * 0.9);
export const BAND_HIGH = Math.floor(SNAPSHOT * 1.1);
// Per-nation floors (the 2026-10-20 edition files
// 310 / 32 / 14 / 18): a nation falling below its floor
// fails the filing, loudly, every run.
export const NATION_FLOORS = { E: 200, W: 10, S: 5, N: 5 };
export const NATION_NAMES = {
  E: "England",
  W: "Wales",
  S: "Scotland",
  N: "Northern Ireland",
};
// The pollutant vocabulary, in register order — the
// order the codes file in detail and serve in words.
export const POLLUTANT_CODES = ["NO2", "PM10", "SO2", "BENZENE"];

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};
// The golden facts, pinned from the 2026-10-20 edition
// at the prep and re-verified at build (16 Nov 2026):
// Exeter inside ref 3604; Minerva's nearest is Sutton
// (ref 1545) at ~0.93 miles; Birkdale's nearest is over
// 4 miles away, so nothing files within 2.
const EXETER_INSIDE_REF = 3604;
const MINERVA_NEAREST_REF = 1545;

// The edition, from the service description's
// "Published: YYYY_MM_DD" — the dataset's own stamp.
// Absent or unparseable is a contract failure:
// provenance is not guessed.
export function parseEdition(serviceMeta) {
  const description = serviceMeta?.serviceDescription ?? "";
  const match = /Published:\s*(\d{4})_(\d{2})_(\d{2})/.exec(description);
  if (!match)
    throw new Error(
      "the AQMA service description carries no parseable 'Published: YYYY_MM_DD' edition date — refusing to file without provenance",
    );
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function nationOf(laOnsId) {
  const letter = (laOnsId ?? "").charAt(0);
  if (!(letter in NATION_FLOORS))
    throw new Error(
      `LA_ONS_ID "${laOnsId}" does not begin with a nation letter (E/W/S/N) — the coverage contract cannot place this area`,
    );
  return letter;
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

export function polygonsContain(polygons, lng, lat) {
  return polygons.some((polygon) => {
    let inside = false;
    for (const ring of polygon) if (ringContains(ring, lng, lat)) inside = !inside;
    return inside;
  });
}

// Point-to-boundary distance on the longitude-scaled
// plane about the point (the loaders' golden-check
// basis): kx = cos(lat) * 111320, ky = 110540, miles =
// metres / 1609.344. 0 when the point is inside is the
// caller's business (check contains first) — this is
// the raw edge distance.
export function polygonsBoundaryMiles(polygons, lat, lng) {
  const kx = Math.cos((lat * Math.PI) / 180) * 111320;
  const ky = 110540;
  let best = Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const x1 = (ring[i][0] - lng) * kx;
        const y1 = (ring[i][1] - lat) * ky;
        const x2 = (ring[i + 1][0] - lng) * kx;
        const y2 = (ring[i + 1][1] - lat) * ky;
        const dx = x2 - x1;
        const dy = y2 - y1;
        let distance;
        if (dx === 0 && dy === 0) {
          distance = Math.hypot(x1, y1);
        } else {
          const t = Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy)));
          distance = Math.hypot(x1 + t * dx, y1 + t * dy);
        }
        if (distance < best) best = distance;
      }
    }
  }
  return best / 1609.344;
}

// GeoJSON geometry -> the house polygon structure
// (polygons -> rings -> [lng, lat] pairs), validated as
// strictly as the built-up areas loader validates its:
// corrupt geometry is a contract breach, an absent
// geometry likewise (the file carries none).
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

// The per-feature filing contract (prep check 3): every
// breach throws, so a failed run files nothing. The
// coverage contract (band + floors) is separate —
// checkCoverage — because it judges the edition as a
// whole and applies to live filings only.
//
// BUG-195 (23 Nov 2026): the read used to accumulate every
// fetched page into one features array and hold the whole
// processed set in memory. The processor below is the
// per-batch form: the read hands it one page at a time, it
// validates and dedupes across pages (the seen set is the
// run's dedupe index — AQMA_REF keys only, never rows),
// tallies the nations as scalars, and returns each page's
// filed items for the sink. processFeatures is the
// collecting form over it, kept for the shape the step was
// built with; the filing run streams (readLive /
// readFixture with a sink, the golden sift, and the
// staging transaction — the BUG-187 flood shape). The
// single-edition swap's atomicity is unchanged: staging
// rides inside the one transaction and any failure rolls
// the whole load back.
export function createFeatureProcessor() {
  const seen = new Set();
  const perNation = { E: 0, W: 0, S: 0, N: 0 };
  let total = 0;
  let filedCount = 0;
  return {
    perNation,
    total: () => total,
    filedCount: () => filedCount,
    processBatch(features) {
      total += features.length;
      const filed = [];
      for (const feature of features) {
        const props = feature.properties ?? {};
        const ref = props.AQMA_REF;
        if (!Number.isInteger(ref))
          throw new Error(`an AQMA feature carries no integer AQMA_REF — contract failure`);
        if (seen.has(ref))
          throw new Error(`AQMA_REF ${ref} appears twice in the file — contract failure`);
        seen.add(ref);
        const name = (props.TITLE ?? "").trim();
        const authority = (props.LOCAL_AUTH ?? "").trim();
        if (name === "" || authority === "")
          throw new Error(`AQMA_REF ${ref} has a blank TITLE or LOCAL_AUTH — contract failure`);
        const pollutants = [];
        for (const code of POLLUTANT_CODES) {
          const flag = props[code];
          if (flag !== 0 && flag !== 1)
            throw new Error(
              `AQMA_REF ${ref} carries ${code} = ${JSON.stringify(flag)} — outside the flag vocabulary {0, 1}`,
            );
          if (flag === 1) pollutants.push(code);
        }
        if (pollutants.length === 0)
          throw new Error(`AQMA_REF ${ref} declares no pollutant — contract failure`);
        const nation = nationOf(props.LA_ONS_ID);
        let polygons = null;
        try {
          polygons = geojsonPolygons(feature.geometry);
        } catch (error) {
          throw new Error(`AQMA_REF ${ref}: ${error.message}`);
        }
        if (polygons === null)
          throw new Error(`AQMA_REF ${ref} carries no geometry — contract failure`);
        perNation[nation] += 1;
        filedCount += 1;
        filed.push({ ref, name, authority, pollutants, nation, polygons });
      }
      return filed;
    },
  };
}

// The collecting form over the processor: the whole feature
// set in, the whole filed set out — the shape this step was
// built with, kept for small inputs and tests.
export function processFeatures(features) {
  const processor = createFeatureProcessor();
  const filed = processor.processBatch(features);
  return { total: processor.total(), filed, perNation: processor.perNation };
}

// The coverage contract (prep check 1): the edition as
// a whole must sit inside the ±10% band AND clear every
// nation's floor. Live filings only — a fixture is a
// cut, judged by the golden checks instead.
export function checkCoverage(processed) {
  checkCoverageCounts(processed.filed.length, processed.perNation);
}

// The same contract over the streamed read's scalars: the
// filed count and the per-nation tallies, no filed set.
function checkCoverageCounts(n, perNation) {
  if (n < BAND_LOW || n > BAND_HIGH)
    throw new Error(
      `coverage failure: ${n} AQMA areas is outside the band ${BAND_LOW}–${BAND_HIGH} (±10% of the ${SNAPSHOT} snapshot) — nothing filed`,
    );
  for (const [letter, floor] of Object.entries(NATION_FLOORS)) {
    if (perNation[letter] < floor)
      throw new Error(
        `coverage failure: ${NATION_NAMES[letter]} files ${perNation[letter]} areas, below its floor of ${floor} — an edition that drops a nation fails the filing rather than serving false absences; nothing filed`,
      );
  }
}

export function checkGolden(processed) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  const exeter = HOMES["E16 1GN"];
  const inside = processed.filed.filter((f) => polygonsContain(f.polygons, exeter.lng, exeter.lat));
  expect(
    inside.length === 1 && inside[0].ref === EXETER_INSIDE_REF,
    `E16 1GN: the point should fall inside the Newham AQMA (No. 2) (ref ${EXETER_INSIDE_REF}), got ${
      inside.map((f) => `${f.name} (ref ${f.ref})`).join(", ") || "no area"
    }`,
  );
  const minerva = HOMES["KT17 1FH"];
  expect(
    !processed.filed.some((f) => polygonsContain(f.polygons, minerva.lng, minerva.lat)),
    "KT17 1FH: the point should fall inside no AQMA",
  );
  const minervaScored = processed.filed
    .map((f) => ({ f, miles: polygonsBoundaryMiles(f.polygons, minerva.lat, minerva.lng) }))
    .sort((a, b) => a.miles - b.miles);
  expect(
    minervaScored.length > 0 &&
      minervaScored[0].f.ref === MINERVA_NEAREST_REF &&
      minervaScored[0].miles > 0.85 &&
      minervaScored[0].miles < 1.05,
    `KT17 1FH: the nearest AQMA should be the Sutton AQMA (ref ${MINERVA_NEAREST_REF}) at ~0.93 miles, got ${
      minervaScored.length > 0
        ? `${minervaScored[0].f.name} (ref ${minervaScored[0].f.ref}) at ${minervaScored[0].miles.toFixed(3)} miles`
        : "no areas"
    }`,
  );
  const birkdale = HOMES["CM3 2JT"];
  const birkdaleWithin = processed.filed.filter(
    (f) =>
      polygonsContain(f.polygons, birkdale.lng, birkdale.lat) ||
      polygonsBoundaryMiles(f.polygons, birkdale.lat, birkdale.lng) <= 2,
  );
  expect(
    birkdaleWithin.length === 0,
    `CM3 2JT: no AQMA should cover the point or come within 2 miles, got ${birkdaleWithin
      .map((f) => f.name)
      .join(", ")}`,
  );
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

async function fetchJson(url, what) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${what}`);
  const body = await response.json();
  if (body?.error)
    throw new Error(
      `${what} returned an error envelope: ${body.error.code ?? ""} ${body.error.message ?? ""}`.trim(),
    );
  return body;
}

// The streaming read driver (BUG-195, the BUG-187 shape):
// batches of raw features arrive one at a time; each is
// processed and handed to the sink (the staging inserter
// in a filing run) as it lands, offered to the golden
// sift, and released. The golden checks run over the
// sifted candidates — complete for every assertion they
// make: Exeter's containment is a distance of zero,
// Minerva's pinned nearest is ~0.93 miles, and Birkdale's
// assertion is that nothing comes within 2 miles, all
// inside the sift's 2-mile window. What the run retains
// is the totals and the sift.
async function driveRead(
  batches,
  onItems,
  edition,
  { progress = null, seed = null, seedItems = [] } = {},
) {
  const processor = createFeatureProcessor();
  const sift = createGoldenSift(HOMES);
  // BUG-368: a resumed run's staged golden candidates are
  // offered first, so the sift covers the whole read — the
  // staged rows were already proved against this edition.
  for (const item of seedItems) sift.offer({ ...item, bbox: bboxOfNested(item.polygons) });
  // BUG-265: the paged read is the run's long phase — a line
  // per 2,000-feature page, no total (the service carries no
  // count up front), and a closing line. On a resume the
  // tally counts the whole read, seed included.
  const readTally = progress?.tally({ label: "read", every: PAGE_SIZE, unit: "features" });
  for await (const features of batches) {
    const items = processor.processBatch(features);
    for (const item of items) sift.offer({ ...item, bbox: bboxOfNested(item.polygons) });
    if (onItems) await onItems(items, edition);
    readTally?.tick(processor.total() + (seed?.total ?? 0));
  }
  const total = processor.total() + (seed?.total ?? 0);
  readTally?.finish(total);
  const perNation = { E: 0, W: 0, S: 0, N: 0 };
  for (const nation of Object.keys(perNation))
    perNation[nation] = processor.perNation[nation] + (seed?.perNation?.[nation] ?? 0);
  return {
    total,
    filed: processor.filedCount() + (seed?.filed ?? 0),
    perNation,
    items: sift.items,
  };
}

export async function readLive({ onItems = null, progress = null, onEdition = null } = {}) {
  const meta = await fetchJson(SERVICE_META_URL, "the AQMA service metadata");
  const edition = parseEdition(meta);
  // BUG-368: the edition fires the resume decision — the
  // runner returns the offset the read starts from, the
  // seeded totals, and the staged golden candidates.
  const resume = (await onEdition?.(edition)) ?? { startOffset: 0 };
  async function* pages() {
    for (let offset = resume.startOffset; ; offset += PAGE_SIZE) {
      const params = new URLSearchParams({
        where: "1=1",
        outFields: "*",
        outSR: "4326",
        f: "geojson",
        resultOffset: String(offset),
        resultRecordCount: String(PAGE_SIZE),
        orderByFields: "AQMA_REF",
        geometryPrecision: "6",
      });
      const page = await fetchJson(`${QUERY_URL}?${params}`, "the AQMA boundaries download");
      const batch = page.features ?? [];
      yield batch;
      if (batch.length < PAGE_SIZE) break;
    }
  }
  const processed = await driveRead(pages(), onItems, edition, {
    progress,
    seed: resume.seed ?? null,
    seedItems: resume.seedItems ?? [],
  });
  return { ...processed, edition };
}

/**
 * @param {string} fixtureDir
 * @param {{ onItems?: ((items: any[], edition: string) => Promise<void>) | null, progress?: import("./progress.mjs").ProgressLogger | null, onEdition?: ((edition: string) => Promise<{ startOffset: number, seed?: { total: number, filed: number, perNation: Record<string, number> }, seedItems?: any[] }>) | null }} [options]
 */
export async function readFixture(
  fixtureDir,
  { onItems = null, progress = null, onEdition = null } = {},
) {
  const meta = JSON.parse(await readFile(join(fixtureDir, "service.json"), "utf8"));
  const edition = parseEdition(meta);
  // BUG-368: same resume decision point as the live read.
  const resume = (await onEdition?.(edition)) ?? { startOffset: 0 };
  const text = await readFile(join(fixtureDir, "aqma.geojson"), "utf8");
  const features = JSON.parse(text).features ?? [];
  async function* slices() {
    for (let at = resume.startOffset; at < features.length; at += PAGE_SIZE)
      yield features.slice(at, at + PAGE_SIZE);
  }
  const processed = await driveRead(slices(), onItems, edition, {
    progress,
    seed: resume.seed ?? null,
    seedItems: resume.seedItems ?? [],
  });
  return { ...processed, edition };
}

// --- filing ------------------------------------------------------------

// Stage, count, swap — streamed (BUG-195, the flood shape), with
// resume support (BUG-368): staging is a PERSISTENT table now
// (migration 0048), and a loader_checkpoint row records the last
// fully staged chunk, so a killed run resumes instead of
// restarting. beginFiling opens the staging table; stageItems
// converts each batch to WKT and inserts it in the house chunks
// of 10 rows, checkpointing after each chunk; finishFiling runs
// the counts and the swap exactly as the one-shot filer did, in
// its own transaction. The single-edition swap: the whole aqma
// layer is replaced in this transaction, so a revoked area
// disappears at this filing and a failed run leaves the last
// good filing serving untouched.
//
// THE RESUME UNITS. The read is paged by resultOffset and the
// processor never drops a feature, so the resume point is the
// count of features offered whose staging has committed
// (flushedOffered) — the pending tail is offered but NOT staged,
// so it never counts and a resume skips exactly the staged
// rows, losing none of the tail. The checkpoint's state carries
// the per-nation tallies, so a resumed run's coverage counts
// cover the whole read. The golden sift is rebuilt from the
// staged rows near the golden homes (stagedGoldenItems), so the
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
      `CREATE TABLE IF NOT EXISTS aqma_stage (
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
    loader: "load-aqma",
    stageTable: "aqma_stage",
    progress,
    restart,
  });
  const CHUNK = 10;
  const pending = [];
  let offered = 0;
  let staged = 0;
  let flushedOffered = 0;
  let seqNext = 0;
  let edition = null;
  /** @type {{ resumed: boolean, reason?: string, checkpoint?: any, prefix?: boolean }} */
  let resumePrep = { resumed: false };
  let resumeState = {};
  const perNation = { E: 0, W: 0, S: 0, N: 0 };
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
          "aqma",
          row.name,
          row.wkt,
          String(row.ref),
          row.authority,
          null,
          row.pollutants.join("; "),
          SOURCE_NAME,
          row.edition,
          base + i,
        );
      });
      await client.query(
        `INSERT INTO aqma_stage (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, seq)
         VALUES ${values.join(",")}`,
        params,
      );
      staged += chunk.length;
      flushedOffered += chunk.length;
      if (edition) {
        await resume.checkpoint({
          edition,
          expected: null,
          nextStartIndex: flushedOffered,
          read: flushedOffered,
          filed: staged,
          state: { perNation: { ...perNation } },
          unit: "features",
        });
      }
    }
  }
  return {
    offeredCount: () => offered,
    stagedCount: () => staged,
    flushedOfferedCount: () => flushedOffered,
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
        flushedOffered = cp.next_start_index;
        offered = cp.next_start_index;
        staged = cp.filed_count;
        seqNext = cp.filed_count;
        resumeState = cp.state ?? {};
        Object.assign(perNation, { E: 0, W: 0, S: 0, N: 0 }, resumeState.perNation ?? {});
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
      const homes = Object.values(HOMES);
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
        `SELECT name, source_reference, organisation, detail, ST_AsGeoJSON(geom) AS geojson FROM aqma_stage WHERE (${conditions.join(" OR ")})`,
        params,
      );
      return rows.map((r) => ({
        ref: Number(r.source_reference),
        name: r.name,
        authority: r.organisation,
        pollutants: (r.detail ?? "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
        polygons: geojsonPolygons(JSON.parse(r.geojson)),
      }));
    },
    async stageItems(items, ed) {
      for (const item of items) {
        offered += 1;
        perNation[item.nation] += 1;
        pending.push({
          name: item.name,
          wkt: polygonsToWkt(item.polygons),
          ref: item.ref,
          authority: item.authority,
          pollutants: item.pollutants,
          edition: ed,
        });
        if (pending.length >= CHUNK) await flushPending();
      }
    },
    async finishFiling(expectedCount) {
      try {
        await flushPending(true);
        const stagedRes = await client.query("SELECT count(*)::int AS n FROM aqma_stage");
        if (stagedRes.rows[0].n !== expectedCount)
          throw new Error("the staged area count does not match — rolling back");
        await client.query("BEGIN");
        try {
          await client.query("DELETE FROM planning_layers WHERE constraint_type = 'aqma'");
          await client.query(
            `INSERT INTO planning_layers (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at)
           SELECT constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at FROM aqma_stage`,
          );
          const filedCount = await client.query(
            "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = 'aqma'",
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
  // BUG-368: resume from the last checkpointed chunk instead of
  // restarting; with no checkpoint this is a fresh start.
  const restart = args.includes("--restart");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;
  // BUG-265: one logger for the run — the read tally and the
  // filing marker below.
  const progress = createProgressLogger({ name: "load-aqma" });

  // A filing run streams the read into the staging
  // transaction as it lands (BUG-195), so the database
  // check moves ahead of the read: without DATABASE_URL a
  // filing run now fails before fetching instead of after
  // it. Verify-only never opens the database.
  let filer = null;
  if (!verifyOnly) {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL is not set — filing requires a database");
    filer = await beginFiling(progress, { restart });
  }

  let processed;
  try {
    progress.stage("reading the AQMA boundaries");
    const onItems = filer ? (items, edition) => filer.stageItems(items, edition) : null;
    // BUG-368: the edition fires the resume decision — the
    // filer prepares (resume or fresh start) and hands back
    // the offset the read starts from, with the seeded totals
    // and the staged golden candidates for the sift.
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
              perNation: cp.state?.perNation ?? {},
            },
            seedItems: await filer.stagedGoldenItems(),
          };
        }
      : null;
    processed = fixtureMode
      ? await readFixture(fixtureDir, { onItems, progress, onEdition })
      : await readLive({ onItems, progress, onEdition });
    if (!fixtureMode) checkCoverageCounts(processed.filed, processed.perNation);
    checkGolden({ filed: processed.items });
  } catch (error) {
    // BUG-265: the read, the coverage contract and the golden
    // checks all fail before anything is filed.
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

  const edition = processed.edition;
  const nationSummary = Object.entries(processed.perNation)
    .map(([letter, n]) => `${NATION_NAMES[letter]} ${formatCount(n)}`)
    .join(" · ");
  const summary = () =>
    `load-aqma · ${SOURCE_NAME} · edition ${edition} · ` +
    `${formatCount(processed.filed)} areas filed (${nationSummary})`;

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
    console.error(`load-aqma FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
