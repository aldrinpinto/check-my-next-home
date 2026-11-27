// Heritage loader (plan step M5.2). Files listed buildings as
// points and scheduled monuments as shapes, following the
// user-seat gap check of 12 Nov 2026:
//
//   npm run load:heritage
//   npm run load:heritage -- --verify-only
//   npm run load:heritage -- --file tests/fixtures/heritage
//
// The register of record is Historic England's National
// Heritage List for England (NHLE): the platform's two heritage
// datasets are that list republished (the `reference` IS the
// NHLE entry number), so the loader takes the platform CSVs in
// the house pattern and stamps NHLE as the source of record.
//
// What the gap check changed, and where it lives in this file:
//   - L6, grades and monuments. Listed-building grades are
//     filed exactly as published, validated against the
//     vocabulary {I, II*, II}: the file's one anomalous "NL"
//     row (Barton Hill Engine Sheds, NHLE 1495697) is
//     quarantined and counted, never silently normalised.
//     Scheduled monuments are extent POLYGONS (100%
//     MultiPolygon in the data) and file into planning_layers —
//     as points they would lose the "inside the monument"
//     answer, the one fact that matters most.
//   - Listed buildings are POINTS by the source's own design
//     ("a point within the listed building and does not define
//     the extent") and neither source publishes an address, so
//     address/postcode file as NULL: a listed building is
//     identified by name + NHLE number + grade + distance,
//     never by address, and never as "your home is listed".
//   - L4, ended rows: delisted buildings and descheduled
//     monuments (end-date set) are excluded and counted.
//   - Current buildings with no published point (518 in the
//     12 Nov 2026 snapshot) are counted, never silently
//     dropped — they exist, they simply cannot be placed.
//
// Sources: planning.data.gov.uk bulk CSVs (files host), Open
// Government Licence v3.0 with attribution to Historic England
// and Ordnance Survey. The files carry no edition date, so the
// source date is the retrieval date. Building distances are
// haversine miles on the published points; monument distances
// are to the nearest polygon edge on the longitude-scaled
// plane, the prep's basis.
//
// M6.21 (decision D41) extends the polygon path with four
// more NHLE datasets, filed into planning_layers the same
// way: world heritage sites, battlefields, protected wreck
// sites, and — as its own layer, because a home inside a
// buffer zone but outside the site is a distinct fact —
// world heritage site buffer zones. Two source facts the
// extension met at first contact (16 Nov 2026): the world
// heritage and battlefield files carry each site twice, a
// geometry-bearing entity and a nameless geometry-less stub
// from an earlier publication round — the stubs count as
// geometry-less and the dedupe keeps the geometry row; and
// only 9 buffer zones are published (not every site has
// one), so the buffer layer's filed count is 9, honestly
// small.
//
// M8.10 completes the register family with the sixth NHLE
// polygon dataset: registered parks & gardens (the
// platform's "park-and-garden" dataset, published title
// "Historic parks and gardens"). The wiring lands ahead
// of the filing — the national filing rides with the
// national loads programme — so until then the layer
// files nothing anywhere and the brain serves its named
// not-filed state. See PARK_AND_GARDEN_DATASET below for
// why it does not join NEW_LAYER_DATASETS.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createLoaderResume } from "./loader-resume.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
  withFilingPulse,
} from "./progress.mjs";

const FILES_BASE = "https://files.planning.data.gov.uk/dataset";
const SOURCE_HERITAGE =
  "Historic England — National Heritage List for England (via planning.data.gov.uk)";

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};
// The Bath witness (M6.21): a point in the city centre, inside
// the City of Bath world heritage site — the positive control
// the three universal homes cannot give, since all three serve
// the absence lines for the four M6.21 layers.
const BATH = { lat: 51.3811, lng: -2.359 };

// The M6.21 polygon datasets: platform dataset name, the
// planning_layers constraint type it files as, and the live
// sanity band for its filed count (post-exclusion,
// post-dedupe), from the first-contact counts of 16 Nov 2026
// (19 / 47 / 57 / 9).
const NEW_LAYER_DATASETS = [
  { dataset: "world-heritage-site", constraintType: "world_heritage_site", band: [15, 25] },
  { dataset: "battlefield", constraintType: "battlefield", band: [40, 55] },
  { dataset: "protected-wreck-site", constraintType: "protected_wreck_site", band: [45, 65] },
  {
    dataset: "world-heritage-site-buffer-zone",
    constraintType: "world_heritage_buffer_zone",
    band: [5, 15],
  },
];
// Registered parks & gardens (M8.10). It does NOT join
// NEW_LAYER_DATASETS: that list's golden check asserts
// every layer's absence at all three universal homes,
// and Nonsuch Park — a registered park and garden —
// stands about half a mile from the Epsom flat, so the
// absence assertion cannot hold for this layer; its
// golden check is the filed-count proof below. The live
// band is the published register's size: the platform's
// dataset page counted 1,723 parks and gardens on
// 21 Nov 2026, so the filed shapes (current, deduped)
// land in [1600, 1850]. In fixture mode a missing
// park-and-garden.csv is a named skip, never a failure —
// no fixture cut exists until the national filing's own
// capture, and a fixture run without the cut files
// nothing for the layer, exactly the production state
// until the filing lands. In live mode the file is
// required: a failed download fails the run.
const PARK_AND_GARDEN_DATASET = {
  dataset: "park-and-garden",
  constraintType: "registered_park_and_garden",
  band: [1600, 1850],
};
const GRADE_VOCABULARY = new Set(["I", "II*", "II"]);
const NL_REFERENCE = "1495697";
const ENDED_LB_REFERENCE = "1338507";

// One CSV parser, quote-aware and header-keyed (the house copy —
// geometry fields are quoted WKT containing commas).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const push = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    push();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") push();
    else if (ch === "\n") endRow();
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) endRow();
  const header = rows[0].map((h) => h.replace(/^﻿/, "").trim());
  return rows
    .slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// Building distances use the prep's haversine basis (earth
// radius 3956 miles): the locked golden counts were computed
// that way, and at E16 1GN one building (NHLE 1289552) sits at
// 2.000–2.001 miles, so the radius convention decides whether
// the count is the locked 215 or 214. Polygon-edge distances
// use the scaled plane, below — also the prep's basis.
function haversineMiles(aLat, aLng, bLat, bLng) {
  const R = 3956;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function parsePoint(text) {
  const s = (text ?? "").trim();
  if (!s.startsWith("POINT")) return null;
  const inner = s.slice(s.indexOf("(") + 1, s.lastIndexOf(")"));
  const parts = inner.replace(",", " ").split(/\s+/).filter(Boolean).map(Number);
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
  return { lng: parts[0], lat: parts[1] };
}

// WKT POLYGON / MULTIPOLYGON → polygons → rings → [lng, lat]
// pairs. Returns null for an empty geometry; throws on anything
// malformed, because corrupt geometry is a contract breach —
// unlike an absent geometry, which is a published state.
function parseWktGeometry(wktText) {
  const text = (wktText ?? "").trim();
  if (text === "" || / EMPTY$/i.test(text)) return null;
  const typeMatch = text.match(/^(MULTIPOLYGON|POLYGON)/i);
  if (!typeMatch) throw new Error(`unsupported geometry type: ${text.slice(0, 40)}`);
  const body = text.slice(typeMatch[0].length).trim();
  let pos = 0;
  const parseGroup = () => {
    if (body[pos] !== "(") throw new Error("malformed WKT: expected (");
    pos += 1;
    const items = [];
    let token = "";
    const flush = () => {
      const t = token.trim();
      token = "";
      if (t !== "") {
        const parts = t.split(/\s+/).map(Number);
        if (parts.length !== 2 || !parts.every(Number.isFinite))
          throw new Error(`malformed WKT coordinate: "${t}"`);
        items.push(parts);
      }
    };
    while (pos < body.length) {
      const ch = body[pos];
      if (ch === "(") items.push(parseGroup());
      else if (ch === ")") {
        pos += 1;
        flush();
        return items;
      } else if (ch === ",") {
        flush();
        pos += 1;
      } else {
        token += ch;
        pos += 1;
      }
    }
    throw new Error("malformed WKT: unbalanced parentheses");
  };
  const top = parseGroup();
  const polygons = typeMatch[1].toUpperCase() === "POLYGON" ? [top] : top;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0)
      throw new Error("malformed WKT: empty polygon");
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4)
        throw new Error("malformed WKT: ring with fewer than 4 points");
      for (const pair of ring)
        if (!Array.isArray(pair) || pair.length !== 2)
          throw new Error("malformed WKT: coordinate is not a pair");
    }
  }
  return polygons;
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

// Distance from a home to the nearest polygon EDGE, miles —
// zero when the point falls inside. Longitude is scaled by
// cos(latitude); miles are degrees of latitude × 69.05.
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

function nearestEdge(filed, home) {
  let best = null;
  for (const item of filed) {
    const miles = geometryDistanceMiles(item.polygons, home);
    if (!best || miles < best.miles) best = { item, miles };
  }
  return best;
}

// -------------------------------------------------------------------

const CONSUMED = [
  "entity",
  "reference",
  "name",
  "organisation-entity",
  "end-date",
  "entry-date",
  "geometry",
  "point",
  "quality",
];

function requireHeaders(rows, dataset, extra = []) {
  if (rows.length === 0) throw new Error(`contract failure: the ${dataset} file has no rows`);
  for (const header of [...CONSUMED, ...extra]) {
    if (!(header in rows[0]))
      throw new Error(`contract failure: the ${dataset} file no longer carries "${header}"`);
  }
}

// Current entities only: ended excluded and counted;
// geometry-less current rows counted, never filed; unparseable
// geometry fails the run.
export function processPolygons(rows, dataset) {
  let ended = 0;
  let geoless = 0;
  let invalid = 0;
  const current = [];
  for (const row of rows) {
    if ((row["end-date"] ?? "") !== "") {
      ended += 1;
      continue;
    }
    let polygons = null;
    try {
      polygons = parseWktGeometry(row.geometry ?? "");
    } catch {
      invalid += 1;
      continue;
    }
    if (polygons === null) {
      geoless += 1;
      continue;
    }
    current.push({ row, polygons });
  }
  if (invalid > 0)
    throw new Error(
      `${dataset}: ${invalid} current rows carry geometry that does not parse — contract failure, nothing filed`,
    );
  const byKey = new Map();
  let duplicates = 0;
  for (const item of current) {
    const reference = (item.row.reference ?? "").trim();
    const key = reference
      ? `${reference}|${item.row["organisation-entity"] ?? ""}`
      : `entity-${item.row.entity}`;
    const prev = byKey.get(key);
    if (prev) {
      duplicates += 1;
      if ((item.row["entry-date"] ?? "") <= (prev.row["entry-date"] ?? "")) continue;
    }
    byKey.set(key, item);
  }
  return {
    total: rows.length,
    ended,
    geoless,
    current: rows.length - ended,
    filed: [...byKey.values()],
    duplicates,
  };
}

// Listed buildings: current only; grades validated against the
// published vocabulary (anything else is quarantined and
// counted); buildings with no published point are counted,
// never placed at a guessed position.
export function processBuildings(rows) {
  let ended = 0;
  let quarantined = 0;
  let noPoint = 0;
  const quarantinedRefs = [];
  const placeable = [];
  for (const row of rows) {
    if ((row["end-date"] ?? "") !== "") {
      ended += 1;
      continue;
    }
    const grade = (row["listed-building-grade"] ?? "").trim();
    if (!GRADE_VOCABULARY.has(grade)) {
      quarantined += 1;
      quarantinedRefs.push(row.reference ?? "");
      continue;
    }
    const point = parsePoint(row.point ?? "");
    if (!point) {
      noPoint += 1;
      continue;
    }
    placeable.push({ row, lat: point.lat, lng: point.lng, grade });
  }
  // list_entry_id is unique on the shelf, so dedupe is by the
  // NHLE reference itself, keeping the newest entry.
  const byRef = new Map();
  let duplicates = 0;
  for (const item of placeable) {
    const key = (item.row.reference ?? "").trim() || `entity-${item.row.entity}`;
    const prev = byRef.get(key);
    if (prev) {
      duplicates += 1;
      if ((item.row["entry-date"] ?? "") <= (prev.row["entry-date"] ?? "")) continue;
    }
    byRef.set(key, item);
  }
  return {
    total: rows.length,
    ended,
    quarantined,
    quarantinedRefs,
    noPoint,
    current: rows.length - ended,
    filed: [...byRef.values()],
    duplicates,
  };
}

function checkGolden(lb, sm) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };

  for (const [postcode, home] of Object.entries(HOMES)) {
    const inside = sm.filed.filter((item) => polygonsContain(item.polygons, home.lng, home.lat));
    expect(
      inside.length === 0,
      `${postcode}: the point falls inside a scheduled monument (${inside.map((i) => i.row.name).join(", ")}) — the golden reads say inside none`,
    );
  }
  const expectMonument = (postcode, ref, miles, tolerance) => {
    const best = nearestEdge(sm.filed, HOMES[postcode]);
    expect(
      best && best.item.row.reference === ref && Math.abs(best.miles - miles) <= tolerance,
      `${postcode}: nearest scheduled monument should be ${ref} at ${miles} mi, got ${
        best ? `${best.item.row.reference} at ${best.miles.toFixed(3)} mi` : "none"
      }`,
    );
  };
  expectMonument("CM3 2JT", "1002150", 0.49, 0.03);
  expectMonument("E16 1GN", "1003473", 0.92, 0.04);
  expectMonument("KT17 1FH", "1003721", 0.44, 0.03);
  const nonsuch = sm.filed.find((item) => item.row.reference === "1017998");
  expect(
    nonsuch && Math.abs(geometryDistanceMiles(nonsuch.polygons, HOMES["KT17 1FH"]) - 0.45) <= 0.03,
    "Nonsuch Palace (1017998) should sit 0.45 mi from the Epsom flat",
  );

  const expectBuildings = (postcode, count, nearestRef, nearestMiles) => {
    const home = HOMES[postcode];
    const within = lb.filed
      .map((b) => ({ b, miles: haversineMiles(home.lat, home.lng, b.lat, b.lng) }))
      .filter((x) => x.miles <= 2.0)
      .sort((a, z) => a.miles - z.miles);
    expect(
      within.length === count,
      `${postcode}: expected ${count} listed buildings within 2 miles, got ${within.length}`,
    );
    expect(
      within[0] &&
        within[0].b.row.reference === nearestRef &&
        Math.abs(within[0].miles - nearestMiles) <= 0.02,
      `${postcode}: nearest listed building should be ${nearestRef} at ${nearestMiles} mi, got ${
        within[0] ? `${within[0].b.row.reference} at ${within[0].miles.toFixed(3)} mi` : "none"
      }`,
    );
  };
  expectBuildings("CM3 2JT", 102, "1123430", 0.19);
  expectBuildings("E16 1GN", 215, "1406622", 0.32);
  expectBuildings("KT17 1FH", 315, "1214537", 0.17);

  expect(
    lb.quarantinedRefs.includes(NL_REFERENCE),
    "the anomalous 'NL' row (1495697) must be quarantined by the grade vocabulary, never filed",
  );
  expect(
    !lb.filed.some((b) => b.row.reference === NL_REFERENCE),
    "the 'NL' row must not be among the filed buildings",
  );
  expect(
    !lb.filed.some((b) => b.row.reference === ENDED_LB_REFERENCE),
    "an ended (delisted) building (1338507, ended 2023-07-27) must never be filed",
  );
  expect(
    lb.filed.every((b) => GRADE_VOCABULARY.has(b.grade)),
    "every filed building's grade must be in the published vocabulary",
  );
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

// The M6.21 layers' golden checks: all three universal homes
// serve the absence lines for all four layers (no shape covers
// a home point, and no shape's edge comes within the 2-mile
// serving radius — the closest call is the Maritime Greenwich
// buffer zone, 2.256 miles from E16 1GN), and the Bath witness
// falls inside the City of Bath world heritage site.
function checkGoldenNewLayers(newLayers) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  for (const layer of newLayers) {
    const { filed } = layer.processed;
    expect(filed.length > 0, `${layer.dataset}: no shapes filed — the layer cannot prove absence`);
    for (const [postcode, home] of Object.entries(HOMES)) {
      const inside = filed.filter((item) => polygonsContain(item.polygons, home.lng, home.lat));
      expect(
        inside.length === 0,
        `${postcode}: the point falls inside a ${layer.dataset} (${inside.map((i) => i.row.name).join(", ")}) — the golden reads say inside none`,
      );
      const best = nearestEdge(filed, home);
      expect(
        best === null || best.miles > 2.0,
        `${postcode}: the nearest ${layer.dataset} edge should be beyond 2 miles, got ${best?.miles.toFixed(3)}`,
      );
    }
  }
  const whs = newLayers.find((l) => l.constraintType === "world_heritage_site");
  const bath = whs?.processed.filed.find((item) => item.row.reference === "1000103");
  expect(
    bath && polygonsContain(bath.polygons, BATH.lng, BATH.lat),
    "the Bath witness point should fall inside the City of Bath world heritage site (1000103)",
  );
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

// The parks & gardens golden check (M8.10): the universal
// absence assertion cannot hold for this layer (Nonsuch
// Park stands about half a mile from the Epsom flat), so
// the check is the filing proof alone — where the dataset
// was read at all, it must file shapes. A fixture run
// without a cut passes null and proves nothing, by the
// design its spec comment records.
function checkGoldenParks(parks) {
  if (!parks) return;
  if (parks.processed.filed.length <= 0)
    throw new Error("golden checks failed:\n - park-and-garden: no shapes filed");
}

// --- filing ------------------------------------------------------------

// Stage, count, swap — with resume support (BUG-368): staging
// is two PERSISTENT tables now (migration 0048), one per
// filing stream, each with its own loader_checkpoint row, so
// a killed run resumes instead of restarting the ~380k
// building stage. The two handles share one edition — the
// retrieval date plus a hash of every file text read — so a
// same-day republication or a next-day re-run discards
// staging that belongs to another edition. BUG-248
// atomicity is unchanged: live tables change ONLY on a
// complete, verified swap, in its own transaction; staging +
// checkpoints are dropped (clear()) after a successful swap,
// and stay on any failure.
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
    // Stage tables are spelled out rather than copied with LIKE
    // (M4.7's lesson: LIKE carries the id column's NOT NULL but
    // not its identity default). listed_buildings' geom is a
    // generated column and is never inserted.
    await client.query(
      `CREATE TABLE IF NOT EXISTS heritage_listed_stage (
         list_entry_id text, name text, grade text, address text, postcode text,
         latitude double precision, longitude double precision,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now(),
         seq bigint NOT NULL, UNIQUE (seq)
       )`,
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS heritage_polygon_stage (
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
  const listedResume = createLoaderResume(client, {
    loader: "load-heritage",
    stageTable: "heritage_listed_stage",
    progress,
    restart,
  });
  const polygonResume = createLoaderResume(client, {
    loader: "load-heritage-polygons",
    stageTable: "heritage_polygon_stage",
    progress,
    restart,
  });
  const editions = {};
  const expecteds = {};
  let listedStaged = 0;
  let polygonStaged = 0;
  // The failure line's resume note: the last checkpoint
  // written by either handle (prepare seeds it with the
  // resumed checkpoint, the staging loops advance it).
  let lastNote = "the start (nothing staged yet)";
  const listedRow = (b, sourceDate) => ({
    listEntryId: b.row.reference || null,
    name: b.row.name || null,
    grade: b.grade,
    address: null,
    postcode: null,
    lat: b.lat,
    lng: b.lng,
    sourceName: SOURCE_HERITAGE,
    sourceDate,
  });
  const polygonRow = (constraintType, item, sourceDate) => ({
    constraintType,
    name: item.row.name || null,
    wkt: (item.row.geometry ?? "").trim(),
    reference: item.row.reference || null,
    organisation: item.row["organisation-entity"] || null,
    quality: item.row.quality || null,
    detail: null,
    sourceName: SOURCE_HERITAGE,
    sourceDate,
  });
  return {
    resumeNote: () => lastNote,
    filedSoFar: () => listedStaged + polygonStaged,
    // Decide, from the edition and the staged rows, whether
    // each stream resumes or starts from zero. Returns the
    // two prepare results; the caller slices each filed
    // array from its checkpoint's next_start_index.
    async prepareResume(edition, expectedListed, expectedPolygons) {
      editions.listed = edition;
      editions.polygons = edition;
      expecteds.listed = expectedListed;
      expecteds.polygons = expectedPolygons;
      const listed = await listedResume.prepare({ edition, expected: expectedListed });
      const polygons = await polygonResume.prepare({ edition, expected: expectedPolygons });
      if (listed.resumed) {
        listedStaged = listed.checkpoint.filed_count;
        lastNote = listedResume.resumeNote();
      }
      if (polygons.resumed) {
        polygonStaged = polygons.checkpoint.filed_count;
        lastNote = polygonResume.resumeNote();
      }
      return { listed, polygons };
    },
    // Stage the listed buildings the caller passes (already
    // sliced from the resume offset), in the house chunks of
    // 1000, checkpointing per chunk. The BUG-265 tally, the
    // heartbeat and the slow-chunk warning ride as before.
    async stageListed(items, sourceDate) {
      const LB_CHUNK = 1000;
      const chunks = Math.ceil(items.length / LB_CHUNK);
      const tally = progress?.tally({
        label: "stage listed buildings",
        total: chunks,
        every: Math.max(1, Math.ceil(chunks / 20)),
        unit: "chunks",
      });
      const watch = createBatchWatch();
      for (let at = 0; at < items.length; at += LB_CHUNK) {
        const started = Date.now();
        const chunk = items.slice(at, at + LB_CHUNK).map((b) => listedRow(b, sourceDate));
        const values = [];
        const params = [];
        const base = listedResume.takeSeq(chunk.length);
        chunk.forEach((row, i) => {
          const b = i * 10;
          values.push(
            `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`,
          );
          params.push(
            row.listEntryId,
            row.name,
            row.grade,
            row.address,
            row.postcode,
            row.lat,
            row.lng,
            row.sourceName,
            row.sourceDate,
            base + i,
          );
        });
        await client.query(
          `INSERT INTO heritage_listed_stage (list_entry_id, name, grade, address, postcode, latitude, longitude, source_name, source_date, seq)
           VALUES ${values.join(",")}`,
          params,
        );
        listedStaged += chunk.length;
        await listedResume.checkpoint({
          edition: editions.listed,
          expected: expecteds.listed,
          nextStartIndex: listedStaged,
          read: listedStaged,
          filed: listedStaged,
          unit: "rows",
        });
        lastNote = listedResume.resumeNote();
        const chunkNo = at / LB_CHUNK + 1;
        const { tookMs, averageMs, slow } = watch.observe(Date.now() - started);
        tally?.tick(chunkNo);
        progress?.heartbeat({ stage: "stage listed buildings", done: chunkNo, total: chunks });
        if (slow) {
          progress?.warning({
            what: "stage chunk duration",
            value: `chunk ${chunkNo} took ${formatDuration(tookMs)}`,
            threshold: `3x recent average ${formatDuration(averageMs)}`,
          });
        }
      }
      tally?.finish(chunks);
    },
    // Stage the flattened polygon rows the caller passes
    // (already sliced from the resume offset), in the house
    // chunks of 25, checkpointing per chunk. All five
    // polygon sets stage together, each row tagged with its
    // constraint type; the swap below is per type, so a
    // failure in any one rolls the whole filing back.
    async stagePolygons(rows, sourceDate) {
      const SM_CHUNK = 25;
      const chunks = Math.ceil(rows.length / SM_CHUNK);
      const tally = progress?.tally({
        label: "stage polygons",
        total: chunks,
        every: Math.max(1, Math.ceil(chunks / 20)),
        unit: "chunks",
      });
      const watch = createBatchWatch();
      for (let at = 0; at < rows.length; at += SM_CHUNK) {
        const started = Date.now();
        const chunk = rows
          .slice(at, at + SM_CHUNK)
          .map(({ constraintType, item }) => polygonRow(constraintType, item, sourceDate));
        const values = [];
        const params = [];
        const base = polygonResume.takeSeq(chunk.length);
        chunk.forEach((row, i) => {
          const b = i * 10;
          values.push(
            `($${b + 1},$${b + 2},ST_Multi(ST_GeomFromText($${b + 3}, 4326)),$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`,
          );
          params.push(
            row.constraintType,
            row.name,
            row.wkt,
            row.reference,
            row.organisation,
            row.quality,
            row.detail,
            row.sourceName,
            row.sourceDate,
            base + i,
          );
        });
        await client.query(
          `INSERT INTO heritage_polygon_stage (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, seq)
           VALUES ${values.join(",")}`,
          params,
        );
        polygonStaged += chunk.length;
        await polygonResume.checkpoint({
          edition: editions.polygons,
          expected: expecteds.polygons,
          nextStartIndex: polygonStaged,
          read: polygonStaged,
          filed: polygonStaged,
          unit: "rows",
        });
        lastNote = polygonResume.resumeNote();
        const chunkNo = at / SM_CHUNK + 1;
        const { tookMs, averageMs, slow } = watch.observe(Date.now() - started);
        tally?.tick(chunkNo);
        progress?.heartbeat({ stage: "stage polygons", done: chunkNo, total: chunks });
        if (slow) {
          progress?.warning({
            what: "stage chunk duration",
            value: `chunk ${chunkNo} took ${formatDuration(tookMs)}`,
            threshold: `3x recent average ${formatDuration(averageMs)}`,
          });
        }
      }
      tally?.finish(chunks);
    },
    // Count-check both stage tables, then swap both streams
    // in one transaction and verify the filed counts per
    // type. Staging + checkpoints go together after a
    // successful swap.
    async finishFiling(expectedListed, expectedPolygons, polygonSets) {
      try {
        const stagedListed = await client.query(
          "SELECT count(*)::int AS n FROM heritage_listed_stage",
        );
        if (stagedListed.rows[0].n !== expectedListed)
          throw new Error("the staged listed-building count does not match — rolling back");
        const stagedPolygons = await client.query(
          "SELECT count(*)::int AS n FROM heritage_polygon_stage",
        );
        if (stagedPolygons.rows[0].n !== expectedPolygons)
          throw new Error("the staged polygon count does not match — rolling back");
        // BUG-390: one progress line per sub-step — the
        // filing previously printed one line and then went
        // silent while the single INSERT...SELECT ran.
        progress?.stage(
          `filing · staged counts verified · ${formatCount(expectedListed)} listed buildings, ${formatCount(expectedPolygons)} polygons`,
        );
        await client.query("BEGIN");
        try {
          await client.query("DELETE FROM listed_buildings");
          progress?.stage("filing · live rows deleted");
          progress?.stage(
            `filing · copying ${formatCount(expectedListed)} listed buildings into listed_buildings`,
          );
          await withFilingPulse(
            progress,
            {
              stage: `filing · copying ${formatCount(expectedListed)} listed buildings into listed_buildings`,
            },
            () =>
              client.query(
                `INSERT INTO listed_buildings (list_entry_id, name, grade, address, postcode, latitude, longitude, source_name, source_date, loaded_at)
             SELECT list_entry_id, name, grade, address, postcode, latitude, longitude, source_name, source_date, loaded_at FROM heritage_listed_stage`,
              ),
          );
          progress?.stage(`filing · copy done · ${formatCount(expectedListed)} listed buildings`);
          for (const set of polygonSets) {
            await client.query("DELETE FROM planning_layers WHERE constraint_type = $1", [
              set.constraintType,
            ]);
          }
          progress?.stage("filing · live polygon rows deleted");
          progress?.stage(
            `filing · copying ${formatCount(expectedPolygons)} polygons into planning_layers`,
          );
          await withFilingPulse(
            progress,
            {
              stage: `filing · copying ${formatCount(expectedPolygons)} polygons into planning_layers`,
            },
            () =>
              client.query(
                `INSERT INTO planning_layers (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at)
             SELECT constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at FROM heritage_polygon_stage`,
              ),
          );
          progress?.stage(`filing · copy done · ${formatCount(expectedPolygons)} polygons`);
          const filedListed = await client.query("SELECT count(*)::int AS n FROM listed_buildings");
          if (filedListed.rows[0].n !== expectedListed)
            throw new Error("the filed listed-building count does not match — rolling back");
          for (const set of polygonSets) {
            const filedSet = await client.query(
              "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = $1",
              [set.constraintType],
            );
            if (filedSet.rows[0].n !== set.filed.length)
              throw new Error(
                `the filed ${set.constraintType} count does not match — rolling back`,
              );
          }
          progress?.stage(
            `filing · filed counts verified · ${formatCount(expectedListed)} listed buildings, ${formatCount(expectedPolygons)} polygons`,
          );
          await client.query("COMMIT");
          progress?.stage(
            `filing · swap committed · ${formatCount(expectedListed)} listed buildings, ${formatCount(expectedPolygons)} polygons live`,
          );
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        }
        await listedResume.clear();
        await polygonResume.clear();
        lastNote = "the start (nothing staged yet)";
      } finally {
        if (ownsClient) await client.end().catch(() => {});
      }
    },
    async abortFiling() {
      // The staging + checkpoints STAY: they are the next
      // run's resume point.
      if (ownsClient) await client.end().catch(() => {});
    },
  };
}

// The edition for a run: the retrieval date plus a hash of
// every file text read, in dataset order — the files carry
// no edition date, so the date guards a next-day resume
// (staged rows would otherwise carry mixed source_dates)
// and the hash guards a same-day republication. Each
// segment is length-prefixed so the join is unambiguous.
export function heritageEdition(sourceDate, texts) {
  const hash = createHash("sha256");
  for (const text of texts) hash.update(`${text.length}:${text}`);
  return `${sourceDate}:${hash.digest("hex").slice(0, 16)}`;
}

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
// BUG-385: a transient fetch failure is retried for up to 30
// minutes (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
// 2026) — the same retry the flood loaders got in BUG-384.
// Past the budget the original error fails the run and it
// waits. The delay caps at the last schedule entry; a test
// may pass delaysMs: [] for instant retries. Non-transient
// failures throw at once (see isTransientFetchError).
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
      if (Date.now() - startedAt >= retryBudgetMs) throw error;
      const delay =
        delaysMs.length === 0 ? 0 : delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      onRetry?.(error, attempt, delay, what);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function fetchText(url, what, opts) {
  // The body read stays outside the retry boundary, so a
  // parse failure fails fast instead of re-requesting.
  return (await fetchResponse(url, what, opts)).text();
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;

  // BUG-265: one logger for the reads, the processing counts
  // and the staging loops; the counts carry the file's own
  // row total, so the log shows a real percentage.
  const progress = createProgressLogger({ name: "load-heritage" });

  const readDataset = async (name) => {
    progress.stage(`reading the ${name} file...`);
    if (fixtureMode) return readFile(join(fixtureDir, `${name}.csv`), "utf8");
    return fetchText(`${FILES_BASE}/${name}.csv`, `the ${name} download`);
  };
  const sourceDate = fixtureMode
    ? JSON.parse(await readFile(join(fixtureDir, "fixture.json"), "utf8")).captured
    : new Date().toISOString().slice(0, 10);

  const lbText = await readDataset("listed-building");
  const lbRows = parseCsv(lbText);
  const smText = await readDataset("scheduled-monument");
  const smRows = parseCsv(smText);
  requireHeaders(lbRows, "listed-building", ["listed-building-grade"]);
  requireHeaders(smRows, "scheduled-monument");

  const lb = processBuildings(lbRows);
  progress.count({
    label: "process listed-building",
    done: lb.filed.length,
    total: lbRows.length,
    unit: "rows",
  });
  const sm = processPolygons(smRows, "scheduled-monument");
  progress.count({
    label: "process scheduled-monument",
    done: sm.filed.length,
    total: smRows.length,
    unit: "rows",
  });

  // The M6.21 layers, through the same polygon path.
  const newLayers = [];
  const newLayerTexts = [];
  for (const spec of NEW_LAYER_DATASETS) {
    const text = await readDataset(spec.dataset);
    newLayerTexts.push(text);
    const rows = parseCsv(text);
    requireHeaders(rows, spec.dataset);
    const processed = processPolygons(rows, spec.dataset);
    progress.count({
      label: `process ${spec.dataset}`,
      done: processed.filed.length,
      total: rows.length,
      unit: "rows",
    });
    newLayers.push({ ...spec, processed });
  }

  // Registered parks & gardens (M8.10), through the same
  // polygon path — read with the fixture-mode tolerance
  // its spec comment describes (a missing fixture cut is
  // a named skip; a missing live file fails the run).
  let parks = null;
  const parksText = fixtureMode
    ? await readDataset(PARK_AND_GARDEN_DATASET.dataset).catch(() => null)
    : await readDataset(PARK_AND_GARDEN_DATASET.dataset);
  if (parksText !== null) {
    const parksRows = parseCsv(parksText);
    requireHeaders(parksRows, PARK_AND_GARDEN_DATASET.dataset);
    const processed = processPolygons(parksRows, PARK_AND_GARDEN_DATASET.dataset);
    progress.count({
      label: `process ${PARK_AND_GARDEN_DATASET.dataset}`,
      done: processed.filed.length,
      total: parksRows.length,
      unit: "rows",
    });
    parks = {
      ...PARK_AND_GARDEN_DATASET,
      processed,
    };
  }

  if (!fixtureMode) {
    if (lb.current < 370000 || lb.current > 395000)
      throw new Error(
        `sanity failure: ${lb.current} current listed buildings is outside the expected band`,
      );
    if (sm.current < 18500 || sm.current > 21500)
      throw new Error(
        `sanity failure: ${sm.current} current scheduled monuments is outside the expected band`,
      );
    for (const layer of newLayers) {
      const [lo, hi] = layer.band;
      if (layer.processed.filed.length < lo || layer.processed.filed.length > hi)
        throw new Error(
          `sanity failure: ${layer.processed.filed.length} filed ${layer.dataset} shapes is outside the expected band`,
        );
    }
    if (parks) {
      const [lo, hi] = PARK_AND_GARDEN_DATASET.band;
      if (parks.processed.filed.length < lo || parks.processed.filed.length > hi)
        throw new Error(
          `sanity failure: ${parks.processed.filed.length} filed park-and-garden shapes is outside the expected band`,
        );
    }
  }
  checkGolden(lb, sm);
  checkGoldenNewLayers(newLayers);
  checkGoldenParks(parks);

  const summary = () =>
    `load-heritage · planning.data.gov.uk files retrieved ${sourceDate} (source of record: Historic England, NHLE) · ` +
    `listed buildings: ${formatCount(lb.filed.length)} filed (${formatCount(lb.current)} current of ${formatCount(lb.total)} in file · ${formatCount(lb.ended)} ended excluded · ${formatCount(lb.noPoint)} without a point counted · ${formatCount(lb.quarantined)} outside the grade vocabulary quarantined · ${formatCount(lb.duplicates)} duplicates dropped) · ` +
    `scheduled monuments: ${formatCount(sm.filed.length)} filed (${formatCount(sm.current)} current of ${formatCount(sm.total)} in file · ${formatCount(sm.ended)} ended excluded · ${formatCount(sm.geoless)} without geometry counted · ${formatCount(sm.duplicates)} duplicates dropped)` +
    newLayers
      .map(
        (layer) =>
          ` · ${layer.dataset}: ${formatCount(layer.processed.filed.length)} filed (${formatCount(layer.processed.current)} current of ${formatCount(layer.processed.total)} in file · ${formatCount(layer.processed.ended)} ended excluded · ${formatCount(layer.processed.geoless)} without geometry counted · ${formatCount(layer.processed.duplicates)} duplicates dropped)`,
      )
      .join("") +
    (parks
      ? ` · park-and-garden: ${formatCount(parks.processed.filed.length)} filed (${formatCount(parks.processed.current)} current of ${formatCount(parks.processed.total)} in file · ${formatCount(parks.processed.ended)} ended excluded · ${formatCount(parks.processed.geoless)} without geometry counted · ${formatCount(parks.processed.duplicates)} duplicates dropped)`
      : " · park-and-garden: no fixture captured — the layer files nothing this run");

  if (verifyOnly) {
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    return;
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not set — filing requires a database");

  // BUG-368: the filing is resumable — the edition is the
  // retrieval date plus a hash of every file text read, so
  // a kill mid-stage resumes from the last checkpointed
  // chunk instead of re-staging ~380k buildings.
  const restart = args.includes("--restart");
  const filer = await beginFiling(progress, { restart });
  // All five polygon sets stage together, each row tagged
  // with its constraint type; the swap below is per type,
  // so a failure in any one rolls the whole filing back.
  const polygonSets = [
    { constraintType: "scheduled_monument", filed: sm.filed },
    ...newLayers.map((layer) => ({
      constraintType: layer.constraintType,
      filed: layer.processed.filed,
    })),
    // Parks & gardens file only where the dataset was
    // read (M8.10): a fixture run without a cut leaves
    // any filed parks rows exactly as they stand.
    ...(parks ? [{ constraintType: parks.constraintType, filed: parks.processed.filed }] : []),
  ];
  const expectedPolygons = polygonSets.reduce((sum, set) => sum + set.filed.length, 0);
  const polygonRows = polygonSets.flatMap((set) =>
    set.filed.map((item) => ({ constraintType: set.constraintType, item })),
  );
  const edition = heritageEdition(sourceDate, [lbText, smText, ...newLayerTexts, parksText ?? ""]);
  try {
    const prep = await filer.prepareResume(edition, lb.filed.length, expectedPolygons);
    const listedStart = prep.listed.resumed ? prep.listed.checkpoint.next_start_index : 0;
    const polygonStart = prep.polygons.resumed ? prep.polygons.checkpoint.next_start_index : 0;
    await filer.stageListed(lb.filed.slice(listedStart), sourceDate);
    await filer.stagePolygons(polygonRows.slice(polygonStart), sourceDate);
    progress.stage(
      `swap started — filing ${formatCount(lb.filed.length + expectedPolygons)} staged rows into the live tables`,
    );
    await filer.finishFiling(lb.filed.length, expectedPolygons, polygonSets);
  } catch (error) {
    // BUG-368: the failure line carries the resume note,
    // so it names the point the next run resumes from.
    progress.failed({
      stage: "file",
      filed: filer.filedSoFar(),
      total: lb.filed.length + expectedPolygons,
      error,
      resume: filer.resumeNote(),
    });
    await filer.abortFiling();
    throw error;
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`load-heritage FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
