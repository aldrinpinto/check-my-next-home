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
//     arrives. Staging rides inside the one transaction because
//     the read itself is the long pole — the swap is still
//     atomic and count-verified, and any failure (a broken page,
//     a failed golden check) rolls the whole load back, so a
//     failed load files nothing, exactly as the house pattern
//     requires.
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
export async function readPhiPages(
  layerUrl,
  expected,
  onBatch,
  { delaysMs = RETRY_DELAYS_MS, log = () => {} } = {},
) {
  let offset = 0;
  let lastObjectId = null;
  let pages = 0;
  while (offset < expected) {
    const page = await fetchPhiPage(layerUrl, offset, expected, lastObjectId, delaysMs);
    await onBatch(page.features);
    lastObjectId = page.features[page.features.length - 1].properties.OBJECTID;
    offset += page.features.length;
    pages += 1;
    if (pages % 10 === 0 || offset === expected)
      log(`load-priority-habitats · read ${offset} of ${expected} patches (page ${pages})`);
  }
  return offset;
}

// The fixture read, streamed part by part (BUG-195): each
// part is parsed, handed to onFeature feature by feature,
// and released before the next part is read — the parts
// are never concatenated into one array.
export async function streamPhiFixture(fixtureDir, onFeature) {
  const stem = "priority-habitats";
  const entries = await readdir(fixtureDir);
  const partNames = entries
    .filter((name) => new RegExp(`^${stem}-\\d+\\.geojson$`).test(name))
    .sort();
  const names = entries.includes(`${stem}.geojson`) ? [`${stem}.geojson`] : partNames;
  if (names.length === 0) throw new Error("contract failure: no priority-habitats fixture file");
  let count = 0;
  for (const name of names) {
    const body = JSON.parse(await readFile(join(fixtureDir, name), "utf8"));
    for (const feature of body.features ?? []) {
      count += 1;
      await onFeature(feature);
    }
  }
  if (count === 0)
    throw new Error("contract failure: the priority-habitats fixture has no features");
  return { count };
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;

  const state = {
    read: 0,
    geoless: 0,
    invalid: 0,
    duplicates: 0,
    filed: 0,
    uids: new Set(),
    versions: new Map(),
    homes: Object.fromEntries(
      Object.keys(HOMES).map((pc) => [
        pc,
        { inside: 0, nearestName: null, nearestMiles: Infinity, within1: 0 },
      ]),
    ),
  };

  let client = null;
  let stageBuffer = [];
  const flushStage = async () => {
    if (!client || stageBuffer.length === 0) return;
    const chunk = stageBuffer;
    stageBuffer = [];
    const values = [];
    const params = [];
    chunk.forEach((row, i) => {
      const base = i * 9;
      values.push(
        `($${base + 1},$${base + 2},ST_Multi(ST_GeomFromText($${base + 3}, 4326)),$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`,
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
      );
    });
    await client.query(
      `INSERT INTO planning_stage (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date)
       VALUES ${values.join(",")}`,
      params,
    );
  };

  // One patch: validate, dedupe by UID, tally against the
  // golden homes, and (in filing mode) stage it. Returns
  // nothing; failures accumulate in state and are judged after
  // the read completes.
  const processFeature = async (feature) => {
    state.read += 1;
    const props = {};
    for (const [k, v] of Object.entries(feature.properties ?? {}))
      props[k] = typeof v === "string" ? v.trim() : v;
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
    if (client) {
      stageBuffer.push({
        name: props.MainHabs || null,
        wkt: polygonsToWkt(polygons),
        reference: uid,
        detail:
          [props.HabCodes, props.AddHabs, props.PrimSource]
            .filter((p) => p !== "" && p != null)
            .join(" · ") || null,
        sourceDate: versionDate(parseVersion(props.Version)),
      });
      if (stageBuffer.length >= 500) await flushStage();
    }
  };

  const checkGolden = () => {
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
  };

  try {
    if (!verifyOnly) {
      if (!process.env.DATABASE_URL)
        throw new Error("DATABASE_URL is not set — filing requires a database");
      client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query("BEGIN");
      await client.query(
        `CREATE TEMP TABLE planning_stage (
           constraint_type text, name text, geom geometry(MultiPolygon, 4326),
           source_reference text, organisation text, quality text, detail text,
           source_name text, source_date date,
           loaded_at timestamptz NOT NULL DEFAULT now()
         ) ON COMMIT DROP`,
      );
    }

    let expected = null;
    if (fixtureMode) {
      // The parts stream through streamPhiFixture (BUG-195);
      // the field contract judges the first feature before
      // any patch is processed, as it did when the parts
      // were concatenated.
      let fieldChecked = false;
      await streamPhiFixture(fixtureDir, async (feature) => {
        if (!fieldChecked) {
          fieldChecked = true;
          for (const field of FIELDS) {
            if (!(field in (feature.properties ?? {})))
              throw new Error(`contract failure: the fixture no longer carries "${field}"`);
          }
        }
        await processFeature(feature);
      });
    } else {
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
      await readPhiPages(
        layerUrl,
        expected,
        async (batch) => {
          for (const feature of batch) await processFeature(feature);
        },
        { log: (line) => console.log(line) },
      );
      if (state.read !== expected)
        throw new Error(
          `read ${state.read} patches but the service count is ${expected} — the read does not reconcile`,
        );
    }
    await flushStage();

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
    checkGolden();

    const summary = () =>
      `load-priority-habitats · Natural England · Priority Habitat Inventory ${versionLabel} (${versionDate(version)}) · ` +
      `${state.filed} patches filed (${state.read} read · ${state.geoless} without geometry counted · ${state.duplicates} duplicate UIDs dropped)`;

    if (verifyOnly) {
      console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
      return;
    }
    const staged = await client.query("SELECT count(*)::int AS n FROM planning_stage");
    if (staged.rows[0].n !== state.filed)
      throw new Error("the staged patch count does not match — rolling back");
    await client.query("DELETE FROM planning_layers WHERE constraint_type = 'priority_habitat'");
    await client.query(
      `INSERT INTO planning_layers (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at)
       SELECT constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at FROM planning_stage`,
    );
    const filedCount = await client.query(
      "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = 'priority_habitat'",
    );
    if (filedCount.rows[0].n !== state.filed)
      throw new Error("the filed patch count does not match — rolling back");
    await client.query("COMMIT");
    console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (client) await client.end();
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
