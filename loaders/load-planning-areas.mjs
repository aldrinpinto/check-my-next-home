// Planning areas loader (plan step M5.2). Files conservation
// areas and Article 4 direction areas from planning.data.gov.uk,
// plus the Article 4 publication gate, following the user-seat
// gap check of 12 Nov 2026:
//
//   npm run load:planning-areas
//   npm run load:planning-areas -- --verify-only
//   npm run load:planning-areas -- --file tests/fixtures/planning-areas
//
// What the gap check changed, and where it lives in this file:
//   - L1, the Article 4 gate. The platform's Article 4 data is a
//     pilot fed by a small group of councils (116 supply current
//     areas in the 12 Nov 2026 snapshot). Newham has a borough-
//     wide direction in force in law and supplies NONE of them,
//     so a data-driven "no Article 4" answer for E16 1GN would be
//     wrong, not just unproven. The loader records every
//     organisation that demonstrably supplies current areas in
//     article4_publishers: presence there is the only licence to
//     serve "none found"; everywhere else the recorded state is
//     "not published by the council to the national dataset".
//   - L3, geometry-less rows. About 9% of current conservation
//     areas (953 of 10,751) carry no geometry at all. They are
//     counted in the log line, never silently dropped — a
//     geometry-only load would manufacture fake "none" answers.
//   - L4, ended rows. Superseded and revoked designations
//     (end-date set) are excluded at load and counted, never
//     served.
//   - The article-4-direction records are validated and counted
//     (the run record proves the file was read) but not filed:
//     the rights a direction removes are published on the AREA
//     rows themselves (permitted-development-rights), and those
//     are filed in planning_layers.detail; the direction records
//     carry no further fact the shelves hold.
//
// The empty-result proof (the step's own check): every count in
// the log line — rows in file, current, filed, ended excluded,
// geometry-less counted — lands in loader_run_items via the
// runner, so a golden home's empty answer is provable against a
// layer that demonstrably loaded in the same run.
//
// Sources: planning.data.gov.uk bulk CSVs (files host), Open
// Government Licence v3.0. The files carry no edition date, so
// the source date is the retrieval date, honestly — the same
// rule as the ODS reports in the health loader. Distances to
// polygon edges are computed on the longitude-scaled plane
// (miles = degrees latitude), the prep's basis; inside tests are
// point-in-polygon on the published shapes.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { formatCount } from "./progress.mjs";

const FILES_BASE = "https://files.planning.data.gov.uk/dataset";
const SOURCE_AREAS = "planning.data.gov.uk (Open Government Licence v3.0)";

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};
// platform organisation-entity numbers, established by the prep
// from the councils' own published data (the bulk files publish
// numbers only — no name list exists on the files host).
const ORG_BRAINTREE = "56";
const ORG_NEWHAM = "246";
const ORG_EPSOM_EWELL = "129";
const ORG_TOWER_HAMLETS = "350";

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
// cos(latitude) so degrees behave like the plane; miles are
// degrees of latitude × 69.05 (the prep's basis).
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
// geometry-less current rows counted, never filed (the shelf's
// shape column cannot hold them, and dropping them silently is
// exactly the L3 failure); unparseable geometry fails the run.
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
    // Dedupe on reference + organisation: the same area filed by
    // two councils (the canal conservation area is the known
    // case) is two register entries with different references,
    // and one reference republished by a second organisation is
    // still that organisation's filing — only an exact
    // reference-and-organisation repeat is a duplicate.
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

function toLayer(item, constraintType) {
  return {
    constraintType,
    name: item.row.name || null,
    wkt: (item.row.geometry ?? "").trim(),
    reference: item.row.reference || null,
    organisation: item.row["organisation-entity"] || null,
    quality: item.row.quality || null,
    detail: (item.row["permitted-development-rights"] ?? "") || null,
  };
}

function checkGolden(ca, a4, publishers) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  const caFiled = ca.filed;
  const a4Filed = a4.filed;

  for (const [postcode, home] of Object.entries(HOMES)) {
    for (const [label, filed] of [
      ["conservation area", caFiled],
      ["Article 4 area", a4Filed],
    ]) {
      const inside = filed.filter((item) => polygonsContain(item.polygons, home.lng, home.lat));
      expect(
        inside.length === 0,
        `${postcode}: the point falls inside a ${label} (${inside.map((i) => i.row.name).join(", ")}) — the golden reads say inside none`,
      );
    }
  }

  const expectNearest = (filed, postcode, ref, miles, tolerance, label) => {
    const best = nearestEdge(filed, HOMES[postcode]);
    expect(
      best && best.item.row.reference === ref && Math.abs(best.miles - miles) <= tolerance,
      `${postcode}: nearest ${label} should be ${ref} at ${miles} mi, got ${
        best ? `${best.item.row.reference} at ${best.miles.toFixed(3)} mi` : "none"
      }`,
    );
    return best;
  };
  expectNearest(caFiled, "CM3 2JT", "4452", 1.47, 0.03, "conservation area");
  expectNearest(caFiled, "E16 1GN", "TH-28-NRC", 1.13, 0.03, "conservation area");
  expectNearest(caFiled, "KT17 1FH", "000008/CONARA", 0.099, 0.02, "conservation area");
  expectNearest(a4Filed, "CM3 2JT", "ART4/1981/3", 1.58, 0.04, "Article 4 area");
  const epsomA4 = expectNearest(
    a4Filed,
    "KT17 1FH",
    "11/00002/ART4",
    0.099,
    0.02,
    "Article 4 area",
  );
  expect(
    epsomA4 && epsomA4.item.row["permitted-development-rights"] === "1A;1C;1D;1F;2A;2B",
    "the Ewell Village Article 4 area must carry its removed-rights codes as published",
  );
  const exeterA4 = nearestEdge(a4Filed, HOMES["E16 1GN"]);
  expect(
    exeterA4 && exeterA4.item.row["organisation-entity"] === ORG_TOWER_HAMLETS,
    "the nearest Article 4 area to E16 1GN is Tower Hamlets' — Newham itself publishes none",
  );

  // The gate (L1): Epsom & Ewell and Tower Hamlets demonstrably
  // publish; Newham and Braintree do not, so their Article 4
  // answer state is "not published", never "none".
  expect(
    (publishers.get(ORG_EPSOM_EWELL)?.currentAreas ?? 0) >= 1,
    "gate: Epsom and Ewell (129) must be recorded as publishing Article 4 areas",
  );
  expect(
    (publishers.get(ORG_TOWER_HAMLETS)?.currentAreas ?? 0) >= 1,
    "gate: Tower Hamlets (350) must be recorded as publishing Article 4 areas",
  );
  expect(
    !publishers.has(ORG_NEWHAM),
    "gate: Newham (246) supplies no Article 4 areas — its answer state is 'not published', never 'none'",
  );
  expect(
    !publishers.has(ORG_BRAINTREE),
    "gate: Braintree (56) supplies no Article 4 areas — its answer state is 'not published', never 'none'",
  );

  const filedRefs = new Set(a4Filed.map((item) => item.row.reference));
  expect(
    !filedRefs.has("A4D-2015-RETAIL-TO-RESIDENTIAL-A17"),
    "an ended Article 4 area (Lauriston Road, ended 2021-07-31) must never be filed",
  );
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
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

  const caRows = parseCsv(await readDataset("conservation-area"));
  const a4Rows = parseCsv(await readDataset("article-4-direction-area"));
  const dirRows = parseCsv(await readDataset("article-4-direction"));
  requireHeaders(caRows, "conservation-area");
  requireHeaders(a4Rows, "article-4-direction-area", [
    "article-4-direction",
    "permitted-development-rights",
  ]);
  requireHeaders(dirRows, "article-4-direction");

  const ca = processPolygons(caRows, "conservation-area");
  const a4 = processPolygons(a4Rows, "article-4-direction-area");
  const dirEnded = dirRows.filter((r) => (r["end-date"] ?? "") !== "").length;
  const dirCurrent = dirRows.length - dirEnded;

  // The gate evidence: every organisation supplying at least one
  // current Article 4 area, with its geometry coverage.
  const publishers = new Map();
  for (const row of a4Rows) {
    if ((row["end-date"] ?? "") !== "") continue;
    const org = row["organisation-entity"] ?? "";
    if (org === "") continue;
    const entry = publishers.get(org) ?? { currentAreas: 0, areasWithGeometry: 0 };
    entry.currentAreas += 1;
    if ((row.geometry ?? "").trim() !== "") entry.areasWithGeometry += 1;
    publishers.set(org, entry);
  }

  if (!fixtureMode) {
    if (ca.current < 9500 || ca.current > 12000)
      throw new Error(
        `sanity failure: ${ca.current} current conservation areas is outside the expected band`,
      );
    if (a4.current < 5000 || a4.current > 10000)
      throw new Error(
        `sanity failure: ${a4.current} current Article 4 areas is outside the expected band`,
      );
    if (ca.geoless > 3000)
      throw new Error(
        `sanity failure: ${ca.geoless} conservation areas without geometry is far above the known ~9%`,
      );
    if (publishers.size < 80 || publishers.size > 200)
      throw new Error(
        `sanity failure: ${publishers.size} Article 4 publishing organisations is outside the expected band`,
      );
  }
  checkGolden(ca, a4, publishers);

  const layers = [
    ...ca.filed.map((item) => toLayer(item, "conservation_area")),
    ...a4.filed.map((item) => toLayer(item, "article_4_area")),
  ];
  const summary = () =>
    `load-planning-areas · planning.data.gov.uk files retrieved ${sourceDate} · ` +
    `conservation areas: ${formatCount(ca.filed.length)} filed (${formatCount(ca.current)} current of ${formatCount(ca.total)} in file · ${formatCount(ca.ended)} ended excluded · ${formatCount(ca.geoless)} without geometry counted · ${formatCount(ca.duplicates)} duplicates dropped) · ` +
    `article 4 areas: ${formatCount(a4.filed.length)} filed (${formatCount(a4.current)} current of ${formatCount(a4.total)} in file · ${formatCount(a4.ended)} ended excluded · ${formatCount(a4.geoless)} without geometry counted · ${formatCount(a4.duplicates)} duplicates dropped) · ` +
    `article 4 directions: ${formatCount(dirCurrent)} current checked (${formatCount(dirRows.length)} in file · ${formatCount(dirEnded)} ended excluded) · ` +
    `article 4 gate: ${formatCount(publishers.size)} organisations publish areas (gate filed)`;

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
    await client.query(
      `CREATE TEMP TABLE gate_stage (
         organisation_entity text, current_areas integer, areas_with_geometry integer,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now()
       ) ON COMMIT DROP`,
    );
    const CHUNK = 25;
    for (let at = 0; at < layers.length; at += CHUNK) {
      const chunk = layers.slice(at, at + CHUNK);
      const values = [];
      const params = [];
      chunk.forEach((layer, i) => {
        const base = i * 9;
        values.push(
          `($${base + 1},$${base + 2},ST_Multi(ST_GeomFromText($${base + 3}, 4326)),$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`,
        );
        params.push(
          layer.constraintType,
          layer.name,
          layer.wkt,
          layer.reference,
          layer.organisation,
          layer.quality,
          layer.detail,
          SOURCE_AREAS,
          sourceDate,
        );
      });
      await client.query(
        `INSERT INTO planning_stage (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date)
         VALUES ${values.join(",")}`,
        params,
      );
    }
    for (const [org, entry] of publishers) {
      await client.query(
        `INSERT INTO gate_stage (organisation_entity, current_areas, areas_with_geometry, source_name, source_date)
         VALUES ($1,$2,$3,$4,$5)`,
        [org, entry.currentAreas, entry.areasWithGeometry, SOURCE_AREAS, sourceDate],
      );
    }
    const staged = await client.query("SELECT count(*)::int AS n FROM planning_stage");
    if (staged.rows[0].n !== layers.length)
      throw new Error("the staged layer count does not match — rolling back");
    await client.query(
      "DELETE FROM planning_layers WHERE constraint_type IN ('conservation_area', 'article_4_area')",
    );
    await client.query(
      `INSERT INTO planning_layers (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at)
       SELECT constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at FROM planning_stage`,
    );
    await client.query("DELETE FROM article4_publishers");
    await client.query(
      `INSERT INTO article4_publishers (organisation_entity, current_areas, areas_with_geometry, source_name, source_date, loaded_at)
       SELECT organisation_entity, current_areas, areas_with_geometry, source_name, source_date, loaded_at FROM gate_stage`,
    );
    const filedCount = await client.query(
      "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type IN ('conservation_area', 'article_4_area')",
    );
    if (filedCount.rows[0].n !== layers.length)
      throw new Error("the filed layer count does not match — rolling back");
    const gateCount = await client.query("SELECT count(*)::int AS n FROM article4_publishers");
    if (gateCount.rows[0].n !== publishers.size)
      throw new Error("the filed gate count does not match — rolling back");
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
  console.error(`load-planning-areas FAILED: ${error.message}`);
  process.exitCode = 1;
});
