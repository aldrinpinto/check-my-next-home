// Charging zones loader (plan step M6.31, decisions
// D50, D61 and D63).
// Files the boundaries of the UK's charging zones into
// charging_zones (migration 0026), following the M6.31
// prep:
//
//   npm run load:charging-zones
//   npm run load:charging-zones -- --verify-only
//   npm run load:charging-zones -- --file tests/fixtures/charging-zones
//
// What the prep settled, and where it lives in this file:
//   - TWELVE schemes are in the register below: the
//     seven Clean Air Zones (GOV.UK's "Driving in a clean
//     air zone" guidance, re-verified at build), the
//     London Ultra Low Emission Zone, and the four
//     Scottish Low Emission Zones (lowemissionzones.scot,
//     re-verified at build). ELEVEN file from published
//     boundaries. Portsmouth files NO row: the council
//     publishes no boundary in any form (checked to the
//     shapefile level at prep; the council was emailed
//     16 Nov 2026 and the reply is outstanding). Decision
//     D63: the step ticks on the eleven, the brain serves
//     a named-gap outside line while the set is
//     incomplete, and Portsmouth's first filing is a
//     routine load whenever a boundary arrives (M12.10(h)).
//   - Each scheme files from its OPERATOR's own published
//     boundary — the prep verified every endpoint against
//     the operator's map or hub (the BSR lesson: never a
//     third-party copy when the publisher's own exists).
//     The quirks, all verified at build:
//       * Bristol files ONLY from the council's
//         production layer, whose features carry STATUS
//         'In force' — asserted per feature below. The
//         identical geometry circulates on a WECA hosted
//         service with STATUS 'Proposed'; filing from it
//         is refused by the same assertion (the fixture
//         bristol-weca.geojson is the refusal's test
//         input).
//       * The ULEZ file (GLA / London Datastore dataset
//         vd455) is labelled EPSG:4326 but its coordinates
//         are actually EPSG:27700 metres — detected and
//         transformed on load (the loaders' proj4 basis),
//         then made valid and unioned like every scheme.
//         Its 22 features all carry the LEZ boundary the
//         2023 ULEZ expansion adopted.
//       * Sheffield's service is native EPSG:27700; the
//         query requests outSR=4326, as for every ArcGIS
//         source here.
//       * Edinburgh's service still names its three
//         features "Proposed Low Emission Zone" — stale
//         consultation-era naming on the in-force zone
//         (geometry verified at prep and build: the main
//         feature contains EH1 1AA). The features file
//         as one scheme geometry; the source's names are
//         never filed.
//       * Aberdeen's service is published by an unnamed
//         ArcGIS account and carries no licence text;
//         its identity as Aberdeen City Council's own
//         service is on the layer itself — copyrightText
//         "Will Hekelaar, Aberdeen City Council" —
//         confirmed at build (16 Nov 2026). Its terms
//         note records exactly that position.
//       * Tyneside's boundary is published by Gateshead
//         Council (co-operator); the service carries no
//         licence text — its terms note records that too.
//       * Bradford's zone is under council review in
//         2026 but remains in force (GOV.UK still lists
//         it, class C) — it files.
//   - in_force_date is the date the scheme's charges —
//     or, for the Scottish zones, its penalties — BEGAN
//     (decision D61, uniform): Bath 15 Mar 2021,
//     Birmingham 14 Jun 2021 (charging commenced; the
//     zone went live 1 Jun with a two-week soft launch),
//     Portsmouth 29 Nov 2021 (register only, until it
//     files), Bradford 26 Sep 2022, Bristol 28 Nov 2022,
//     Sheffield 27 Feb 2023, Tyneside 30 Jan 2023 (the
//     first charging date; vans and LGVs joined 17 Jul
//     2023), London ULEZ 29 Aug 2023 (this boundary's
//     charging start), Glasgow 1 Jun 2023, Dundee 30 May
//     2024, Aberdeen 1 Jun 2024, Edinburgh 1 Jun 2024.
//     The four LEZs were formally introduced on 31 May
//     2022 with grace periods; the served date is the
//     penalties-began date, per D61.
//   - Charging AMOUNTS are never filed (decision D50):
//     no column, no field, no line can hold one.
//   - The filing is ONE transaction over the whole set:
//     stage every scheme, validate every staged row
//     (valid geometry; measured area within ±25% of the
//     reference area pinned below — the figure measured
//     from the published boundary at build), assert the
//     staged set is pairwise disjoint (the zones are
//     disjoint as published; a future overlap is a
//     filing refusal, never a serving ambiguity), then
//     delete-all + insert-all + count check. A failed
//     run files nothing and the last good set keeps
//     serving; the swap also means the set's loaded_at
//     stamps share one instant — the completeness gate's
//     set date the brain serves is that stamp.
//   - Cadence: quarterly (the prep's ruling — boundaries
//     change rarely, and the register canaries watch
//     GOV.UK's CAZ list and the Scottish LEZ count
//     between filings).

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import proj4 from "proj4";
import { createLoaderResume } from "./loader-resume.mjs";
import { createProgressLogger, formatCount } from "./progress.mjs";

const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";

// Same EPSG:27700 definition as the schools, transport
// and air-quality loaders — one conversion basis across
// the codebase (M5.5: it is load-bearing).
proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
    "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);
const fromBng = (x, y) => proj4("EPSG:27700", "EPSG:4326", [x, y]);
const toBng = (lng, lat) => proj4("EPSG:4326", "EPSG:27700", [lng, lat]);

const CAZ_CHECKER = "https://www.gov.uk/clean-air-zones";
const LEZ_CHECKER = "https://vehicleemissionscheck.service.gov.scot/";
const ULEZ_CHECKER = "https://tfl.gov.uk/modes/driving/check-your-vehicle/";

// The scheme register: the twelve schemes in scope, in
// the order the prep's register lists them. referenceAreaKm2
// is the EPSG:27700 area of the published boundary union,
// measured at build (16 Nov 2026) from the live services;
// the filing refuses a scheme whose measured area leaves
// ±25% of it. Portsmouth's entry carries source: null —
// the pending scheme (decision D63); its register facts
// are recorded for the day it files.
export const SCHEMES = [
  {
    key: "bath",
    name: "Bath Clean Air Zone",
    family: "caz",
    class: "C",
    operator: "Bath and North East Somerset Council",
    inForceDate: "2021-03-15",
    checkerUrl: CAZ_CHECKER,
    sourceName: "Bath and North East Somerset Council — Bath Clean Air Zones (open-data hub)",
    sourceDate: null,
    termsNote:
      "Open Government Licence v3.0 — dataset 'Bath Clean Air Zones', Bath and North East Somerset Council open-data hub, edition April 2024.",
    referenceAreaKm2: 3.203,
    source: {
      kind: "geojson",
      url: "https://xmap-hub.s3.eu-west-2.amazonaws.com/public-sector/bathnes/bath_clean_air_zone.geojson",
    },
  },
  {
    key: "birmingham",
    name: "Birmingham Clean Air Zone",
    family: "caz",
    class: "D",
    operator: "Birmingham City Council",
    inForceDate: "2021-06-14",
    checkerUrl: CAZ_CHECKER,
    sourceName: "Transport for West Midlands — Clean Air Zone (ArcGIS service)",
    sourceDate: null,
    termsNote:
      "Open Government Licence v3.0 — the ArcGIS item states the data is available under the Open Government Licence v3.0.",
    referenceAreaKm2: 7.657,
    source: {
      kind: "arcgis",
      url: "https://maps.tfwm.org.uk/server/rest/services/Hosted/Clean_Air_Zone/FeatureServer/0",
    },
  },
  {
    key: "bradford",
    name: "Bradford Clean Air Zone",
    family: "caz",
    class: "C",
    operator: "City of Bradford Metropolitan District Council",
    inForceDate: "2022-09-26",
    checkerUrl: CAZ_CHECKER,
    sourceName: "City of Bradford Metropolitan District Council — Clean Air Zone Boundary",
    sourceDate: null,
    termsNote:
      "Open Government Licence v3.0 — the ArcGIS item carries the Open Government Licence; the dataset's data.gov.uk record states no licence.",
    referenceAreaKm2: 21.985,
    source: {
      kind: "arcgis",
      url: "https://gis.bradford.gov.uk/server/rest/services/Open_Data/Clean_Air_Zone_Boundary/MapServer/0",
    },
  },
  {
    key: "bristol",
    name: "Bristol Clean Air Zone",
    family: "caz",
    class: "D",
    operator: "Bristol City Council",
    inForceDate: "2022-11-28",
    checkerUrl: CAZ_CHECKER,
    sourceName: "Bristol City Council — Clean Air Zone boundaries (production service)",
    sourceDate: null,
    termsNote:
      "Bristol City Council open data under the Open Government Licence v3.0 — filed from the council's production layer only, whose features carry STATUS 'In force' (boundary version June 2022).",
    referenceAreaKm2: 3.258,
    source: {
      kind: "arcgis",
      url: "https://maps2.bristol.gov.uk/server2/rest/services/ext/ll_transport/MapServer/61",
    },
  },
  {
    key: "portsmouth",
    name: "Portsmouth Clean Air Zone",
    family: "caz",
    class: "B",
    operator: "Portsmouth City Council",
    inForceDate: "2021-11-29",
    checkerUrl: CAZ_CHECKER,
    sourceName: null,
    sourceDate: null,
    termsNote: null,
    referenceAreaKm2: null,
    source: null,
  },
  {
    key: "sheffield",
    name: "Sheffield Clean Air Zone",
    family: "caz",
    class: "C",
    operator: "Sheffield City Council",
    inForceDate: "2023-02-27",
    checkerUrl: CAZ_CHECKER,
    sourceName: "Sheffield City Council — Clean Air Zone Boundary",
    sourceDate: null,
    termsNote: "Open Government Licence — the council's open-data service.",
    referenceAreaKm2: 2.371,
    source: {
      kind: "arcgis",
      url: "https://sheffieldcitycouncil.cloud.esriuk.com/server/rest/services/AGOL/OpenData/MapServer/28",
    },
  },
  {
    key: "tyneside",
    name: "Tyneside Clean Air Zone (Newcastle and Gateshead)",
    family: "caz",
    class: "C",
    operator: "Newcastle City Council and Gateshead Council",
    inForceDate: "2023-01-30",
    checkerUrl: CAZ_CHECKER,
    sourceName: "Gateshead Council — CleanAirZone (ArcGIS service)",
    sourceDate: null,
    termsNote:
      "The boundary is published by Gateshead Council (co-operator) as an open ArcGIS service; the service itself carries no licence text (checked 16 November 2026).",
    referenceAreaKm2: 2.294,
    source: {
      kind: "arcgis",
      url: "https://gis.gateshead.gov.uk/server/rest/services/Hosted/CleanAirZone2/FeatureServer/0",
    },
  },
  {
    key: "ulez",
    name: "London Ultra Low Emission Zone (ULEZ)",
    family: "ulez",
    class: null,
    operator: "Transport for London",
    inForceDate: "2023-08-29",
    checkerUrl: ULEZ_CHECKER,
    sourceName:
      "Greater London Authority — London Ultra Low Emission Zone boundary (London Datastore)",
    sourceDate: null,
    termsNote:
      "Open Government Licence v2.0 — London Datastore dataset vd455, 'London-wide Ultra Low Emission Zone'. The published file's coordinates are EPSG:27700 despite its EPSG:4326 label; transformed on load.",
    referenceAreaKm2: 1528.357,
    source: {
      kind: "geojson-27700",
      url: "https://data.london.gov.uk/download/vd455/0cab9a8b-ca8a-47b0-aaf8-0e77a9041a19/LondonWideUltraLowEmissionZone.geojson",
    },
  },
  {
    key: "glasgow",
    name: "Glasgow Low Emission Zone",
    family: "lez",
    class: null,
    operator: "Glasgow City Council",
    inForceDate: "2023-06-01",
    checkerUrl: LEZ_CHECKER,
    sourceName: "Glasgow City Council — Low Emission Zone (open data service)",
    sourceDate: null,
    termsNote:
      "Open Government Licence v3.0 — the service states the boundary is 'supplied under the Open Government Licence v3.0'.",
    referenceAreaKm2: 3.062,
    source: {
      kind: "arcgis",
      url: "https://www.mapping.glasgow.gov.uk/arcgis_web/rest/services/OPEN_DATA/Low_Emission_Zone/MapServer/0",
    },
  },
  {
    key: "edinburgh",
    name: "Edinburgh Low Emission Zone",
    family: "lez",
    class: null,
    operator: "City of Edinburgh Council",
    inForceDate: "2024-06-01",
    checkerUrl: LEZ_CHECKER,
    sourceName: "City of Edinburgh Council — Low Emission Zone (ArcGIS service)",
    sourceDate: null,
    termsNote:
      "Open Government Licence v3.0 — the ArcGIS item states 'This information is supplied under the Open Government License v3.0'. The service still names its features 'Proposed Low Emission Zone'; the geometry is the in-force zone (verified at build).",
    referenceAreaKm2: 3.036,
    source: {
      kind: "arcgis",
      url: "https://services-eu1.arcgis.com/FgpikkYuSUOuITxp/arcgis/rest/services/Low_Emission_Zone/FeatureServer/59",
    },
  },
  {
    key: "dundee",
    name: "Dundee Low Emission Zone",
    family: "lez",
    class: null,
    operator: "Dundee City Council",
    inForceDate: "2024-05-30",
    checkerUrl: LEZ_CHECKER,
    sourceName: "Dundee City Council — LEZ Boundary (ArcGIS service)",
    sourceDate: null,
    termsNote:
      "Published by Dundee City Council as the boundary layer of its own LEZ web map, openly served; the service carries no licence text (checked 16 November 2026).",
    referenceAreaKm2: 0.459,
    source: {
      kind: "arcgis",
      url: "https://services.arcgis.com/GlZ1P6ksdiXNYhvC/arcgis/rest/services/LEZ_Boundary/FeatureServer/425",
    },
  },
  {
    key: "aberdeen",
    name: "Aberdeen Low Emission Zone",
    family: "lez",
    class: null,
    operator: "Aberdeen City Council",
    inForceDate: "2024-06-01",
    checkerUrl: LEZ_CHECKER,
    sourceName: "Aberdeen City Council — LEZ Low Emission Zone (ArcGIS service)",
    sourceDate: null,
    termsNote:
      "Published openly by Aberdeen City Council — the layer's copyright names Aberdeen City Council (confirmed at build, 16 November 2026); the service carries no licence text.",
    referenceAreaKm2: 0.857,
    source: {
      kind: "arcgis",
      url: "https://services5.arcgis.com/0sktPVp3t1LvXc9z/arcgis/rest/services/LEZ_Low_Emission_Zone/FeatureServer/52",
    },
  },
];

export const SCHEME_COUNT = SCHEMES.length; // 12
export const SOURCED_SCHEMES = SCHEMES.filter((scheme) => scheme.source !== null);
export const PENDING_SCHEMES = SCHEMES.filter((scheme) => scheme.source === null);
// The measured-area band: a filing refuses a scheme
// whose staged area leaves ±25% of its reference area.
export const AREA_TOLERANCE = 0.25;

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
  "CF11 8AA": { lat: 51.467947, lng: -3.192837 },
  "EH1 1AA": { lat: 55.9533, lng: -3.1883 },
};

// ------------------------------------------------------------------
// Geometry — the house polygon structure (polygons ->
// rings -> [lng, lat] pairs), validated as strictly as
// the AQMA loader validates its file.
// ------------------------------------------------------------------

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

// GeoJSON geometry -> the house polygon structure. When
// the source file's coordinates are actually EPSG:27700
// (the ULEZ quirk: any coordinate beyond ±360 gives it
// away), every coordinate is transformed to EPSG:4326
// first — the detection is on the data, never on the
// file's own CRS label, which is exactly what lies.
function geojsonPolygons(geometry, schemeKey) {
  if (!geometry) return null;
  const firstPair = (coords) => {
    let node = coords;
    while (Array.isArray(node) && Array.isArray(node[0])) node = node[0];
    return node;
  };
  const raw = firstPair(geometry.coordinates);
  const inBng =
    Array.isArray(raw) && raw.some((value) => typeof value === "number" && Math.abs(value) > 360);
  const convert = (pair) => {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite))
      throw new Error(`malformed GeoJSON coordinate in the ${schemeKey} boundary`);
    return inBng ? fromBng(pair[0], pair[1]) : pair;
  };
  const wrap = (coords, depth) => {
    if (depth === 0) return convert(coords);
    if (!Array.isArray(coords) || coords.length === 0)
      throw new Error(`malformed GeoJSON geometry in the ${schemeKey} boundary`);
    return coords.map((c) => wrap(c, depth - 1));
  };
  if (geometry.type === "Polygon") return [wrap(geometry.coordinates, 2)];
  if (geometry.type === "MultiPolygon") return wrap(geometry.coordinates, 3);
  throw new Error(
    `unsupported GeoJSON geometry type in the ${schemeKey} boundary: ${geometry.type}`,
  );
}

function polygonsToWkt(polygons) {
  const ring = (r) => `(${r.map((pair) => `${pair[0]} ${pair[1]}`).join(",")})`;
  const polygon = (p) => `(${p.map(ring).join(",")})`;
  return `MULTIPOLYGON (${polygons.map(polygon).join(",")})`;
}

// The polygons' area in km2, measured on the EPSG:27700
// plane (project each vertex, shoelace per ring, holes
// subtracted). The loader's own measuring basis — the
// filing's staged PostGIS area is the authority, and
// the two are pinned against each other by the golden
// checks' reference areas.
export function schemeAreaKm2(polygons) {
  let total = 0;
  for (const polygon of polygons) {
    polygon.forEach((ring, ringIndex) => {
      let sum = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = toBng(ring[i][0], ring[i][1]);
        const [x2, y2] = toBng(ring[i + 1][0], ring[i + 1][1]);
        sum += x1 * y2 - x2 * y1;
      }
      const area = Math.abs(sum) / 2;
      total += ringIndex === 0 ? area : -area;
    });
  }
  return total / 1e6;
}

// ------------------------------------------------------------------
// The per-scheme filing contract: every breach throws,
// so a failed run files nothing. A scheme's features
// must carry a usable boundary; Bristol's must
// additionally carry STATUS 'In force' on EVERY feature
// — the assertion that keeps the WECA 'Proposed' copy
// out of the filing forever.
// ------------------------------------------------------------------

export function processScheme(scheme, body) {
  if (!body || typeof body !== "object")
    throw new Error(`${scheme.name}: the boundary response is not an object — contract failure`);
  if (body.error)
    throw new Error(
      `${scheme.name}: the service returned an error envelope: ${body.error.code ?? ""} ${body.error.message ?? ""}`.trim(),
    );
  const features = body.features;
  if (!Array.isArray(features) || features.length === 0)
    throw new Error(`${scheme.name}: the boundary response carries no features — contract failure`);
  if (body.exceededTransferLimit)
    throw new Error(`${scheme.name}: the service truncated the response — contract failure`);
  const polygons = [];
  for (const feature of features) {
    if (scheme.key === "bristol") {
      const status = feature?.properties?.STATUS;
      if (status !== "In force")
        throw new Error(
          `Bristol Clean Air Zone: a feature carries STATUS ${JSON.stringify(status ?? null)} — only the council production layer's 'In force' boundary may file (the WECA hosted copy reads 'Proposed'); refusing the scheme`,
        );
    }
    let featurePolygons = null;
    try {
      featurePolygons = geojsonPolygons(feature?.geometry, scheme.key);
    } catch (error) {
      throw new Error(`${scheme.name}: ${error.message}`);
    }
    if (featurePolygons === null)
      throw new Error(`${scheme.name}: a feature carries no geometry — contract failure`);
    polygons.push(...featurePolygons);
  }
  if (polygons.length === 0)
    throw new Error(`${scheme.name}: no usable boundary polygons — contract failure`);
  return { scheme, polygons, featureCount: features.length };
}

// Assemble the filing from the processed schemes: every
// sourced scheme must be present and processed; the
// register's source-less schemes are the pending set,
// reported, never silently dropped (decision D63).
export function assembleFiling(processedByKey) {
  const filed = [];
  const pending = [];
  for (const scheme of SCHEMES) {
    if (scheme.source === null) {
      pending.push(scheme);
      continue;
    }
    const processed = processedByKey.get(scheme.key);
    if (!processed)
      throw new Error(
        `${scheme.name}: no processed boundary was supplied — a sourced scheme missing from a filing fails the whole run`,
      );
    filed.push(processed);
  }
  return { filed, pending };
}

// The golden checks, over the processed filing: the
// prep's verified states. Exeter inside the ULEZ and
// nothing else; EH1 1AA inside the Edinburgh LEZ and
// nothing else; Minerva, Birkdale and Cardiff inside
// nothing filed. (Minerva's 1.362-mile distance to the
// ULEZ boundary is recorded in docs/backend-m6.31.md —
// it is never served, so it is not a golden here.)
export function checkGolden(filed) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  const insideAt = (home) =>
    filed.filter((entry) => polygonsContain(entry.polygons, home.lng, home.lat));
  const exeter = insideAt(HOMES["E16 1GN"]);
  expect(
    exeter.length === 1 && exeter[0].scheme.key === "ulez",
    `E16 1GN: the point should fall inside the London ULEZ only, got ${
      exeter.map((entry) => entry.scheme.name).join(", ") || "no scheme"
    }`,
  );
  const edinburgh = insideAt(HOMES["EH1 1AA"]);
  expect(
    edinburgh.length === 1 && edinburgh[0].scheme.key === "edinburgh",
    `EH1 1AA: the point should fall inside the Edinburgh LEZ only, got ${
      edinburgh.map((entry) => entry.scheme.name).join(", ") || "no scheme"
    }`,
  );
  for (const postcode of ["KT17 1FH", "CM3 2JT", "CF11 8AA"]) {
    const inside = insideAt(HOMES[postcode]);
    expect(
      inside.length === 0,
      `${postcode}: the point should fall inside no filed scheme, got ${inside
        .map((entry) => entry.scheme.name)
        .join(", ")}`,
    );
  }
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

// The edition for a run: a hash of the eleven scheme
// bodies in register order — the sources carry no edition
// date (source_date is null throughout), so the bodies
// themselves are the edition: a republication changes the
// hash and the next run discards the staging.
export function chargingZonesEdition(bodiesByKey) {
  const hash = createHash("sha256");
  for (const scheme of SOURCED_SCHEMES) {
    const body = bodiesByKey.get(scheme.key);
    const text = JSON.stringify(body ?? null);
    hash.update(`${scheme.key}:${text.length}:${text}`);
  }
  return hash.digest("hex").slice(0, 16);
}

// The edition from a processed filing (the WKT of each
// scheme's boundary, in register order) — the fallback
// when the caller has the processed schemes but not the
// raw bodies, as the resume tests do.
export function chargingZonesWktEdition(filed) {
  const hash = createHash("sha256");
  for (const entry of filed) {
    const wkt = polygonsToWkt(entry.polygons);
    hash.update(`${entry.scheme.key}:${wkt.length}:${wkt}`);
  }
  return hash.digest("hex").slice(0, 16);
}

// --- filing ------------------------------------------------------------

// Stage, validate, swap — with resume support (BUG-368):
// the staging is a PERSISTENT table now (migration 0048)
// and one loader_checkpoint row records the last staged
// scheme, so a killed run re-reads the eleven boundaries
// (cheap) and stages only the schemes past the
// checkpoint. Each staged row carries the sha256 of its
// WKT, so a resumed run also re-stages a scheme whose
// boundary changed since the kill — the edition hash
// catches a changed body, and the per-scheme hash catches
// a boundary that re-processes differently under the
// same body (a code change in the transform). BUG-248
// atomicity is unchanged: the live table changes ONLY
// on a complete, verified swap, in its own transaction;
// staging + checkpoint are dropped (clear()) after a
// successful swap, and stay on any failure.
/**
 * @param {import("./progress.mjs").ProgressLogger | null} [progress]
 * @param {{ restart?: boolean, client?: any }} [options]
 */
export async function beginFiling(
  progress = null,
  { restart = false, client: injectedClient = null } = {},
) {
  // The client is injectable so the resume tests can file
  // against a fake database; production passes none and a
  // real client is opened as before.
  const client = injectedClient ?? new pg.Client({ connectionString: process.env.DATABASE_URL });
  const ownsClient = !injectedClient;
  if (ownsClient) await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS cz_stage (
         scheme_key text PRIMARY KEY, name text, family text, class text,
         operator text, in_force_date date, checker_url text,
         geom geometry(MultiPolygon, 4326),
         source_name text, source_date date, terms_note text,
         loaded_at timestamptz NOT NULL DEFAULT now(),
         geom_hash text,
         seq bigint NOT NULL, UNIQUE (seq)
       )`,
    );
  } catch (error) {
    if (ownsClient) await client.end().catch(() => {});
    throw error;
  }
  const resume = createLoaderResume(client, {
    loader: "load-charging-zones",
    stageTable: "cz_stage",
    progress,
    restart,
  });
  let edition = null;
  let expected = null;
  let staged = 0;
  // The staged schemes' WKT hashes, keyed by scheme —
  // seeded from the stage table on resume, advanced as
  // schemes stage.
  let hashes = {};
  // The failure line's resume note: the last checkpoint
  // written (prepare seeds it with the resumed checkpoint,
  // the staging loop advances it).
  let lastNote = "the start (nothing staged yet)";
  // A scheme's seq is its index in register order — dense
  // from 0, stable across runs, so a re-staged scheme
  // keeps the seq the checkpoint proof already verified.
  const schemeSeq = (key) => SOURCED_SCHEMES.findIndex((scheme) => scheme.key === key);
  return {
    resumeNote: () => lastNote,
    filedSoFar: () => staged,
    stagedHash: (key) => hashes[key] ?? null,
    // Decide, from the edition and the staged rows, whether
    // the run resumes or starts from zero. On resume the
    // staged hashes are seeded from the stage table, so a
    // scheme whose boundary changed since the kill is
    // re-staged rather than skipped.
    async prepareResume(ed, exp) {
      edition = ed;
      expected = exp;
      const prep = await resume.prepare({ edition: ed, expected: exp });
      if (prep.resumed) {
        staged = prep.checkpoint.filed_count;
        const rows = await client.query("SELECT scheme_key, geom_hash FROM cz_stage");
        hashes = Object.fromEntries(rows.rows.map((row) => [row.scheme_key, row.geom_hash]));
        lastNote = resume.resumeNote();
      }
      return prep;
    },
    // Stage one scheme — unless it is already staged with
    // the same boundary, in which case it is skipped: the
    // resumed run's cheap path. A changed boundary
    // re-stages under the same seq (an upsert on the
    // scheme key), and a new scheme advances the staged
    // count. Every staged scheme checkpoints, so the save
    // is visible in the logs.
    async stageScheme(entry) {
      const scheme = entry.scheme;
      const wkt = polygonsToWkt(entry.polygons);
      const hash = createHash("sha256").update(wkt).digest("hex");
      const seq = schemeSeq(scheme.key);
      if (seq < 0) throw new Error(`unknown scheme ${scheme.key} — not in the register`);
      if (seq < staged && hashes[scheme.key] === hash) return false;
      await client.query(
        `INSERT INTO cz_stage (scheme_key, name, family, class, operator, in_force_date, checker_url, geom, source_name, source_date, terms_note, geom_hash, seq)
         VALUES ($1, $2, $3, $4, $5, $6, $7, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromText($8, 4326)), 3)), $9, $10, $11, $12, $13)
         ON CONFLICT (scheme_key) DO UPDATE SET
           name = EXCLUDED.name, family = EXCLUDED.family, class = EXCLUDED.class,
           operator = EXCLUDED.operator, in_force_date = EXCLUDED.in_force_date,
           checker_url = EXCLUDED.checker_url, geom = EXCLUDED.geom,
           source_name = EXCLUDED.source_name, source_date = EXCLUDED.source_date,
           terms_note = EXCLUDED.terms_note, geom_hash = EXCLUDED.geom_hash,
           seq = EXCLUDED.seq, loaded_at = now()`,
        [
          scheme.key,
          scheme.name,
          scheme.family,
          scheme.class,
          scheme.operator,
          scheme.inForceDate,
          scheme.checkerUrl,
          wkt,
          scheme.sourceName,
          scheme.sourceDate,
          scheme.termsNote,
          hash,
          seq,
        ],
      );
      if (seq >= staged) staged = seq + 1;
      hashes[scheme.key] = hash;
      await resume.checkpoint({
        edition,
        expected,
        nextStartIndex: staged,
        read: staged,
        filed: staged,
        state: { hashes },
        unit: "schemes",
      });
      lastNote = resume.resumeNote();
      return true;
    },
    // Validate the staged set (validity, measured area
    // against the pinned reference, pairwise
    // disjointness), then swap in one transaction and
    // verify the filed count. Staging + checkpoint go
    // together after a successful swap.
    async finishFiling(filing) {
      const { filed } = filing;
      try {
        const stagedRes = await client.query("SELECT count(*)::int AS n FROM cz_stage");
        if (stagedRes.rows[0].n !== filed.length)
          throw new Error(
            `the staged scheme count ${stagedRes.rows[0].n} does not match the ${filed.length} processed schemes — refusing the filing`,
          );
        // Validity + measured area, per staged scheme: the
        // boundary as filed must be a valid shape of the
        // size the publisher's boundary measures (±25% of
        // the reference pinned at build) — a truncated,
        // wrong-layer or wrong-CRS republication fails
        // here, naming the scheme.
        const areaRows = await client.query(
          `SELECT scheme_key, ST_IsValid(geom) AS valid,
                  ST_Area(ST_Transform(geom, 27700)) / 1000000 AS km2
           FROM cz_stage`,
        );
        const byKey = new Map(filed.map((entry) => [entry.scheme.key, entry.scheme]));
        for (const row of areaRows.rows) {
          const scheme = byKey.get(row.scheme_key);
          if (!scheme) throw new Error(`a staged row names unknown scheme ${row.scheme_key}`);
          if (!row.valid)
            throw new Error(
              `${scheme.name}: the staged boundary is not valid after make-valid — refusing the filing`,
            );
          const reference = scheme.referenceAreaKm2;
          const km2 = Number(row.km2);
          if (
            !Number.isFinite(km2) ||
            km2 < reference * (1 - AREA_TOLERANCE) ||
            km2 > reference * (1 + AREA_TOLERANCE)
          )
            throw new Error(
              `${scheme.name}: the staged boundary measures ${km2.toFixed(3)} km2, outside ±25% of the reference ${reference} km2 measured from the published boundary — refusing the filing`,
            );
        }
        if (areaRows.rows.length !== filed.length)
          throw new Error("the staged area check did not cover every scheme — refusing the filing");
        // Pairwise disjointness over the staged set: the
        // zones are disjoint as published (verified at
        // build); interiors intersecting is a filing
        // refusal — a shared boundary edge or point (a
        // touch) is not an overlap.
        const overlaps = await client.query(
          `SELECT a.scheme_key AS a, b.scheme_key AS b
           FROM cz_stage a JOIN cz_stage b ON a.scheme_key < b.scheme_key
           WHERE ST_Intersects(a.geom, b.geom) AND NOT ST_Touches(a.geom, b.geom)`,
        );
        if (overlaps.rows.length > 0) {
          const pair = overlaps.rows[0];
          throw new Error(
            `the staged boundaries of ${byKey.get(pair.a)?.name ?? pair.a} and ${byKey.get(pair.b)?.name ?? pair.b} overlap — the zones are disjoint as published, so an overlap is a filing error; refusing the filing`,
          );
        }
        // The swap: the whole set is replaced in this
        // transaction, so the set's loaded_at stamps share
        // one instant and a scheme that ever leaves the
        // register disappears at the filing that drops it.
        await client.query("BEGIN");
        try {
          await client.query("DELETE FROM charging_zones");
          await client.query(
            `INSERT INTO charging_zones (scheme_key, name, family, class, operator, in_force_date, checker_url, geom, source_name, source_date, terms_note, loaded_at)
             SELECT scheme_key, name, family, class, operator, in_force_date, checker_url, geom, source_name, source_date, terms_note, loaded_at FROM cz_stage`,
          );
          const filedCount = await client.query("SELECT count(*)::int AS n FROM charging_zones");
          if (filedCount.rows[0].n !== filed.length)
            throw new Error("the filed scheme count does not match — rolling back");
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        }
        await resume.clear();
        lastNote = "the start (nothing staged yet)";
      } finally {
        if (ownsClient) await client.end().catch(() => {});
      }
    },
    async abortFiling() {
      // The staging + checkpoint STAY: they are the next
      // run's resume point.
      if (ownsClient) await client.end().catch(() => {});
    },
  };
}

// ------------------------------------------------------------------
// The filing: stage every scheme (resumable, BUG-368),
// validate the staged rows (validity, measured area
// against the pinned reference), assert pairwise
// disjointness over the staged set, then swap in its own
// transaction. Any failure files nothing and the last
// good set keeps serving; the staging stays as the next
// run's resume point.
// ------------------------------------------------------------------

/**
 * @param {any} client
 * @param {{ filed: any[], pending: any[] }} filing
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, edition?: string | null, restart?: boolean }} [options]
 */
export async function fileChargingZones(
  client,
  filing,
  { progress = null, edition = null, restart = false } = {},
) {
  const { filed, pending } = filing;
  // BUG-265: the filing stages per scheme, validates the
  // staged set, then swaps.
  progress?.stage(
    `filing ${formatCount(filed.length)} schemes — validity, area and disjointness checks, then the swap`,
  );
  // BUG-368: the filing is resumable — the edition is the
  // hash of the eleven scheme bodies (or of the filed
  // WKTs when the caller has no bodies), so a kill
  // mid-stage resumes from the last checkpointed scheme
  // instead of re-staging the whole set.
  const filer = await beginFiling(progress, { restart, client });
  try {
    const ed = edition ?? chargingZonesWktEdition(filed);
    await filer.prepareResume(ed, filed.length);
    for (const entry of filed) await filer.stageScheme(entry);
    await filer.finishFiling(filing);
  } catch (error) {
    // BUG-368: the failure line carries the resume note,
    // so it names the point the next run resumes from.
    // The filing is not one transaction any more — on a
    // failure the live table is untouched and the staging
    // stays as the resume point.
    progress?.failed({
      stage: "filing",
      filed: filer.filedSoFar(),
      total: filed.length,
      error,
      resume: filer.resumeNote(),
    });
    await filer.abortFiling();
    throw error;
  }
  return { filedCount: filed.length, pendingCount: pending.length };
}

async function fetchJson(url, what) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${what}`);
  const body = await response.json();
  if (body?.error)
    throw new Error(
      `${what} returned an error envelope: ${body.error.code ?? ""} ${body.error.message ?? ""}`.trim(),
    );
  return body;
}

async function fetchSchemeBody(scheme) {
  if (scheme.source.kind === "arcgis") {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      f: "geojson",
      outSR: "4326",
    });
    return fetchJson(`${scheme.source.url}/query?${params}`, `the ${scheme.name} boundary`);
  }
  return fetchJson(scheme.source.url, `the ${scheme.name} boundary`);
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last checkpointed scheme
  // instead of restarting; with no checkpoint this is a
  // fresh start.
  const restart = args.includes("--restart");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;

  const processedByKey = new Map();
  const bodiesByKey = new Map();
  // BUG-265: one logger for the run — the per-scheme tally
  // and the filing stage below.
  const progress = createProgressLogger({ name: "load-charging-zones" });
  let filing;
  try {
    progress.stage("reading the 11 scheme boundaries");
    const schemeTally = progress.tally({
      label: "read",
      total: SOURCED_SCHEMES.length,
      every: 1,
      unit: "schemes",
    });
    for (const scheme of SOURCED_SCHEMES) {
      const body = fixtureMode
        ? JSON.parse(await readFile(join(fixtureDir, `${scheme.key}.geojson`), "utf8"))
        : await fetchSchemeBody(scheme);
      bodiesByKey.set(scheme.key, body);
      processedByKey.set(scheme.key, processScheme(scheme, body));
      schemeTally.tick(processedByKey.size);
    }
    schemeTally.finish(processedByKey.size);
    filing = assembleFiling(processedByKey);
    checkGolden(filing.filed);
  } catch (error) {
    // BUG-265: the read and the golden checks all fail before
    // anything is filed.
    progress.failed({
      stage: "read",
      filed: 0,
      error,
      resume: "re-run the loader from the start (nothing is filed)",
    });
    throw error;
  }

  const pendingLine =
    filing.pending.length > 0
      ? filing.pending.map((scheme) => `${scheme.name} pending — no boundary published`).join("; ")
      : "no schemes pending";
  const summary = () =>
    `load-charging-zones · ${formatCount(filing.filed.length)} schemes filed (${pendingLine})`;

  if (verifyOnly) {
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    return;
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not set — filing requires a database");

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // BUG-368: the edition is the hash of the eleven
    // scheme bodies, so a republication discards the
    // staging and a kill mid-stage resumes from the last
    // checkpointed scheme.
    await fileChargingZones(client, filing, {
      progress,
      edition: chargingZonesEdition(bodiesByKey),
      restart,
    });
  } finally {
    await client.end();
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`load-charging-zones FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
