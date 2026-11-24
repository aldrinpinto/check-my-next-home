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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { formatCount } from "./progress.mjs";

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
function parseCsv(text) {
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
function processPolygons(rows, dataset) {
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
function processBuildings(rows) {
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

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;

  const readDataset = async (name) => {
    if (fixtureMode) return readFile(join(fixtureDir, `${name}.csv`), "utf8");
    const response = await fetch(`${FILES_BASE}/${name}.csv`);
    if (!response.ok) throw new Error(`HTTP ${response.status} for the ${name} download`);
    return response.text();
  };
  const sourceDate = fixtureMode
    ? JSON.parse(await readFile(join(fixtureDir, "fixture.json"), "utf8")).captured
    : new Date().toISOString().slice(0, 10);

  const lbRows = parseCsv(await readDataset("listed-building"));
  const smRows = parseCsv(await readDataset("scheduled-monument"));
  requireHeaders(lbRows, "listed-building", ["listed-building-grade"]);
  requireHeaders(smRows, "scheduled-monument");

  const lb = processBuildings(lbRows);
  const sm = processPolygons(smRows, "scheduled-monument");

  // The M6.21 layers, through the same polygon path.
  const newLayers = [];
  for (const spec of NEW_LAYER_DATASETS) {
    const rows = parseCsv(await readDataset(spec.dataset));
    requireHeaders(rows, spec.dataset);
    newLayers.push({ ...spec, processed: processPolygons(rows, spec.dataset) });
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
    parks = {
      ...PARK_AND_GARDEN_DATASET,
      processed: processPolygons(parksRows, PARK_AND_GARDEN_DATASET.dataset),
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

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    // Stage tables are spelled out rather than copied with LIKE
    // (M4.7's lesson: LIKE carries the id column's NOT NULL but
    // not its identity default). listed_buildings' geom is a
    // generated column and is never inserted.
    await client.query(
      `CREATE TEMP TABLE listed_stage (
         list_entry_id text, name text, grade text, address text, postcode text,
         latitude double precision, longitude double precision,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now()
       ) ON COMMIT DROP`,
    );
    await client.query(
      `CREATE TEMP TABLE planning_stage (
         constraint_type text, name text, geom geometry(MultiPolygon, 4326),
         source_reference text, organisation text, quality text, detail text,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now()
       ) ON COMMIT DROP`,
    );
    const LB_CHUNK = 1000;
    for (let at = 0; at < lb.filed.length; at += LB_CHUNK) {
      const chunk = lb.filed.slice(at, at + LB_CHUNK);
      const values = [];
      const params = [];
      chunk.forEach((b, i) => {
        const base = i * 9;
        values.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`,
        );
        params.push(
          b.row.reference || null,
          b.row.name || null,
          b.grade,
          null,
          null,
          b.lat,
          b.lng,
          SOURCE_HERITAGE,
          sourceDate,
        );
      });
      await client.query(
        `INSERT INTO listed_stage (list_entry_id, name, grade, address, postcode, latitude, longitude, source_name, source_date)
         VALUES ${values.join(",")}`,
        params,
      );
    }
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
    const SM_CHUNK = 25;
    for (const set of polygonSets) {
      for (let at = 0; at < set.filed.length; at += SM_CHUNK) {
        const chunk = set.filed.slice(at, at + SM_CHUNK);
        const values = [];
        const params = [];
        chunk.forEach((item, i) => {
          const base = i * 9;
          values.push(
            `($${base + 1},$${base + 2},ST_Multi(ST_GeomFromText($${base + 3}, 4326)),$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`,
          );
          params.push(
            set.constraintType,
            item.row.name || null,
            (item.row.geometry ?? "").trim(),
            item.row.reference || null,
            item.row["organisation-entity"] || null,
            item.row.quality || null,
            null,
            SOURCE_HERITAGE,
            sourceDate,
          );
        });
        await client.query(
          `INSERT INTO planning_stage (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date)
           VALUES ${values.join(",")}`,
          params,
        );
      }
    }
    const stagedListed = await client.query("SELECT count(*)::int AS n FROM listed_stage");
    if (stagedListed.rows[0].n !== lb.filed.length)
      throw new Error("the staged listed-building count does not match — rolling back");
    const stagedPolygons = await client.query("SELECT count(*)::int AS n FROM planning_stage");
    const expectedPolygons = polygonSets.reduce((sum, set) => sum + set.filed.length, 0);
    if (stagedPolygons.rows[0].n !== expectedPolygons)
      throw new Error("the staged polygon count does not match — rolling back");
    await client.query("DELETE FROM listed_buildings");
    await client.query(
      `INSERT INTO listed_buildings (list_entry_id, name, grade, address, postcode, latitude, longitude, source_name, source_date, loaded_at)
       SELECT list_entry_id, name, grade, address, postcode, latitude, longitude, source_name, source_date, loaded_at FROM listed_stage`,
    );
    for (const set of polygonSets) {
      await client.query("DELETE FROM planning_layers WHERE constraint_type = $1", [
        set.constraintType,
      ]);
    }
    await client.query(
      `INSERT INTO planning_layers (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at)
       SELECT constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at FROM planning_stage`,
    );
    const filedListed = await client.query("SELECT count(*)::int AS n FROM listed_buildings");
    if (filedListed.rows[0].n !== lb.filed.length)
      throw new Error("the filed listed-building count does not match — rolling back");
    for (const set of polygonSets) {
      const filedSet = await client.query(
        "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = $1",
        [set.constraintType],
      );
      if (filedSet.rows[0].n !== set.filed.length)
        throw new Error(`the filed ${set.constraintType} count does not match — rolling back`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

main().catch((error) => {
  console.error(`load-heritage FAILED: ${error.message}`);
  process.exitCode = 1;
});
