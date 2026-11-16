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

// The per-feature filing contract (prep check 3): every
// breach throws, so a failed run files nothing. The
// coverage contract (band + floors) is separate —
// checkCoverage — because it judges the edition as a
// whole and applies to live filings only.
export function processFeatures(features) {
  const filed = [];
  const seen = new Set();
  const perNation = { E: 0, W: 0, S: 0, N: 0 };
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
    filed.push({ ref, name, authority, pollutants, nation, polygons });
  }
  return { total: features.length, filed, perNation };
}

// The coverage contract (prep check 1): the edition as
// a whole must sit inside the ±10% band AND clear every
// nation's floor. Live filings only — a fixture is a
// cut, judged by the golden checks instead.
export function checkCoverage(processed) {
  const n = processed.filed.length;
  if (n < BAND_LOW || n > BAND_HIGH)
    throw new Error(
      `coverage failure: ${n} AQMA areas is outside the band ${BAND_LOW}–${BAND_HIGH} (±10% of the ${SNAPSHOT} snapshot) — nothing filed`,
    );
  for (const [letter, floor] of Object.entries(NATION_FLOORS)) {
    if (processed.perNation[letter] < floor)
      throw new Error(
        `coverage failure: ${NATION_NAMES[letter]} files ${processed.perNation[letter]} areas, below its floor of ${floor} — an edition that drops a nation fails the filing rather than serving false absences; nothing filed`,
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

async function fetchAllFeatures() {
  const features = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
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
    features.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return features;
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;

  let features;
  let edition;
  if (fixtureMode) {
    const meta = JSON.parse(await readFile(join(fixtureDir, "service.json"), "utf8"));
    edition = parseEdition(meta);
    const text = await readFile(join(fixtureDir, "aqma.geojson"), "utf8");
    features = JSON.parse(text).features ?? [];
  } else {
    const meta = await fetchJson(SERVICE_META_URL, "the AQMA service metadata");
    edition = parseEdition(meta);
    features = await fetchAllFeatures();
  }

  const processed = processFeatures(features);
  if (!fixtureMode) checkCoverage(processed);
  checkGolden(processed);

  const nationSummary = Object.entries(processed.perNation)
    .map(([letter, n]) => `${NATION_NAMES[letter]} ${n}`)
    .join(" · ");
  const summary = () =>
    `load-aqma · ${SOURCE_NAME} · edition ${edition} · ` +
    `${processed.filed.length} areas filed (${nationSummary})`;

  if (verifyOnly) {
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    return;
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not set — filing requires a database");

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
    const CHUNK = 10;
    for (let at = 0; at < processed.filed.length; at += CHUNK) {
      const chunk = processed.filed.slice(at, at + CHUNK);
      const values = [];
      const params = [];
      chunk.forEach((item, i) => {
        const base = i * 9;
        values.push(
          `($${base + 1},$${base + 2},ST_Multi(ST_GeomFromText($${base + 3}, 4326)),$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`,
        );
        params.push(
          "aqma",
          item.name,
          polygonsToWkt(item.polygons),
          String(item.ref),
          item.authority,
          null,
          item.pollutants.join("; "),
          SOURCE_NAME,
          edition,
        );
      });
      await client.query(
        `INSERT INTO planning_stage (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date)
         VALUES ${values.join(",")}`,
        params,
      );
    }
    const staged = await client.query("SELECT count(*)::int AS n FROM planning_stage");
    if (staged.rows[0].n !== processed.filed.length)
      throw new Error("the staged area count does not match — rolling back");
    // The single-edition swap: the whole aqma layer is
    // replaced in this transaction, so a revoked area
    // disappears at this filing and a failed run leaves
    // the last good filing serving untouched.
    await client.query("DELETE FROM planning_layers WHERE constraint_type = 'aqma'");
    await client.query(
      `INSERT INTO planning_layers (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at)
       SELECT constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at FROM planning_stage`,
    );
    const filedCount = await client.query(
      "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = 'aqma'",
    );
    if (filedCount.rows[0].n !== processed.filed.length)
      throw new Error("the filed area count does not match — rolling back");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`load-aqma FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
