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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

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

function processFeatures(features) {
  let geoless = 0;
  let invalid = 0;
  const filed = [];
  const seen = new Set();
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
    filed.push({ code, name, polygons });
  }
  if (invalid > 0)
    throw new Error(
      `built-up areas: ${invalid} features are malformed, unnamed or duplicated — contract failure, nothing filed`,
    );
  return { total: features.length, geoless, filed };
}

function checkGolden(processed) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  for (const [postcode, home] of Object.entries(HOMES)) {
    const inside = processed.filed.filter((f) => polygonsContain(f.polygons, home.lng, home.lat));
    const expected = EXPECTED_INSIDE[postcode];
    expect(
      inside.length === 1 && inside[0].code === expected.code && inside[0].name === expected.name,
      `${postcode}: the point should fall inside ${expected.name} (${expected.code}), got ${
        inside.map((f) => `${f.name} (${f.code})`).join(", ") || "no area"
      }`,
    );
  }
  const bath = processed.filed.filter((f) => polygonsContain(f.polygons, BATH.lng, BATH.lat));
  expect(
    bath.length === 1 && bath[0].name === "Bath",
    `the Bath witness point should fall inside the Bath built-up area, got ${bath.map((f) => f.name).join(", ") || "no area"}`,
  );
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

async function fetchAllFeatures() {
  const features = [];
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
  if (fixtureMode) {
    const text = await readFile(join(fixtureDir, "built-up-areas.geojson"), "utf8");
    features = JSON.parse(text).features ?? [];
  } else {
    features = await fetchAllFeatures();
  }

  const processed = processFeatures(features);
  if (!fixtureMode && (processed.filed.length < 7000 || processed.filed.length > 8500))
    throw new Error(
      `sanity failure: ${processed.filed.length} built-up areas is outside the expected band for the December 2024 edition (7,775 as published)`,
    );
  checkGolden(processed);

  const summary = () =>
    `load-built-up-areas · ONS Built Up Areas (December 2024) Boundaries EW BGG (V2) · ` +
    `${processed.filed.length} areas filed (${processed.total} features in file · ${processed.geoless} without geometry counted) · ` +
    `golden points inside Hatfield Peverel, Newham and Ewell`;

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
          "built_up_area",
          item.name,
          polygonsToWkt(item.polygons),
          item.code,
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
    const staged = await client.query("SELECT count(*)::int AS n FROM planning_stage");
    if (staged.rows[0].n !== processed.filed.length)
      throw new Error("the staged area count does not match — rolling back");
    await client.query("DELETE FROM planning_layers WHERE constraint_type = 'built_up_area'");
    await client.query(
      `INSERT INTO planning_layers (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at)
       SELECT constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at FROM planning_stage`,
    );
    const filedCount = await client.query(
      "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = 'built_up_area'",
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

main().catch((error) => {
  console.error(`load-built-up-areas FAILED: ${error.message}`);
  process.exitCode = 1;
});
