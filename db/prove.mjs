// Check My Next Home — the map-brain proof (plan step M3.4).
//
// Proves, against a real PostgreSQL + PostGIS database, that:
//   1. PostGIS is switched on.
//   2. All 20 shelves from the Technical Plan's Section 2 list exist.
//   3. A nearest-point query returns the right nearest point for a
//      known location, at a sane distance (the Technical Plan's
//      Week 5 test, in miniature).
//   4. A point-in-polygon query finds the flood shape covering a
//      point, and not one that doesn't (the Weeks 9–10 test, in
//      miniature).
//
// Every test row is inserted inside one transaction that is rolled
// back at the end, so the proof leaves the database exactly as it
// found it. Run it with: npm run db:prove (DATABASE_URL as in
// db/migrate.mjs). Exits non-zero on the first failed proof.

import pg from "pg";

import { rebuildPickingPlaces, rebuildPickingStreets } from "../loaders/picking-index-filing.mjs";

const EXPECTED_TABLES = [
  "postcode_cache",
  "price_paid",
  "reports",
  "licence_keys",
  "schools",
  "ofsted_outcomes",
  "nurseries",
  "health_points",
  "cqc_ratings",
  "greenspace_points",
  "osm_points",
  "transport_stops",
  "air_grid",
  "noise_summary",
  "flood_layers",
  "planning_layers",
  "listed_buildings",
  "neighbourhood_stats",
  "ev_points",
  "council_tax_charges",
];

// A test location in Hatfield Peverel, Essex (the project's golden
// test area). The two test schools sit 0.01 degrees of latitude
// (~1.1 km) and 1 degree (~111 km) north of it.
const HOME = { latitude: 51.7566, longitude: 0.5813 };
const NEAR = { latitude: 51.7666, longitude: 0.5813 };
const FAR = { latitude: 52.7566, longitude: 0.5813 };

function assert(condition, message) {
  if (!condition) {
    throw new Error(`PROOF FAILED: ${message}`);
  }
  console.log(`proof ok — ${message}`);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set — see .env.example (Key K6).");
  process.exit(1);
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query("BEGIN");

  const version = await client.query("SELECT postgis_version() AS v");
  assert(version.rows[0].v, `PostGIS is on (version ${version.rows[0].v})`);

  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
  );
  const present = new Set(tables.rows.map((row) => row.table_name));
  const missing = EXPECTED_TABLES.filter((table) => !present.has(table));
  assert(missing.length === 0, `all 20 shelves exist (missing: ${missing.join(", ") || "none"})`);

  await client.query(
    "INSERT INTO schools (urn, name, latitude, longitude) VALUES ('PROOF-NEAR', 'Proof near school', $1, $2), ('PROOF-FAR', 'Proof far school', $3, $4)",
    [NEAR.latitude, NEAR.longitude, FAR.latitude, FAR.longitude],
  );
  const nearest = await client.query(
    `SELECT urn,
            ST_Distance(
              geom::geography,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            ) AS metres
       FROM schools
      WHERE urn IN ('PROOF-NEAR', 'PROOF-FAR')
      ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
      LIMIT 1`,
    [HOME.longitude, HOME.latitude],
  );
  assert(nearest.rows[0].urn === "PROOF-NEAR", "nearest-point query returns the near school");
  const metres = Number(nearest.rows[0].metres);
  assert(
    metres > 900 && metres < 1400,
    `nearest distance is sane (${Math.round(metres)} m for 0.01 degrees of latitude)`,
  );

  await client.query(
    `INSERT INTO flood_layers (layer_type, risk_label, geom)
     VALUES ('river_sea', 'Zone 2',
             ST_Multi(ST_MakeEnvelope($1, $2, $3, $4, 4326)))`,
    [HOME.longitude - 0.01, HOME.latitude - 0.01, HOME.longitude + 0.01, HOME.latitude + 0.01],
  );
  const covering = await client.query(
    `SELECT count(*)::int AS n
       FROM flood_layers
      WHERE layer_type = 'river_sea'
        AND ST_Covers(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
    [HOME.longitude, HOME.latitude],
  );
  assert(covering.rows[0].n === 1, "point-in-polygon finds the flood shape over the test home");
  const notCovering = await client.query(
    `SELECT count(*)::int AS n
       FROM flood_layers
      WHERE layer_type = 'river_sea'
        AND ST_Covers(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))`,
    [FAR.longitude, FAR.latitude],
  );
  assert(notCovering.rows[0].n === 0, "point-in-polygon correctly excludes the far point");

  // ---- Street suggestions (M7.15C, migration 0031).
  // The fuzzy tier's foundations, proved against the
  // real database: the extension is on, the pinned
  // threshold separates the prep's witness pair from an
  // unrelated street, and the filing machinery's rebuild
  // derives the street table at its ruled grain.
  const trgm = await client.query("SELECT 1 AS ok FROM pg_extension WHERE extname = 'pg_trgm'");
  assert(trgm.rows.length === 1, "pg_trgm extension is on (migration 0031)");

  const sims = await client.query(
    `SELECT similarity('BUGDALE RISE', 'BIRKDALE RISE') AS hit,
            similarity('BUGDALE RISE', 'BIRKDALE ROAD') AS miss`,
  );
  const hit = Number(sims.rows[0].hit);
  const miss = Number(sims.rows[0].miss);
  assert(
    hit >= 0.4,
    `the witness misspelling clears the pinned 0.4 threshold (BUGDALE RISE ~ BIRKDALE RISE = ${hit.toFixed(4)})`,
  );
  assert(
    miss < 0.4,
    `an unrelated street stays below it (BUGDALE RISE ~ BIRKDALE ROAD = ${miss.toFixed(4)})`,
  );

  await client.query(
    `INSERT INTO picking_index (postcode, paon, saon, street, town, home_key, sources, sales_edition, epc_edition)
     VALUES ('CM3 2JT', '19', NULL, 'BIRKDALE RISE', 'CHELMSFORD', '19||BIRKDALE RISE', ARRAY['sales'], 'proof', NULL),
            ('CM3 2JT', '21', NULL, 'BIRKDALE RISE', 'CHELMSFORD', '21||BIRKDALE RISE', ARRAY['sales'], 'proof', NULL),
            ('CM3 2JU', '31', NULL, 'BIRKDALE RISE', 'CHELMSFORD', '31||BIRKDALE RISE', ARRAY['sales'], 'proof', NULL)`,
  );
  await rebuildPickingStreets(client);
  const streets = await client.query(
    `SELECT street_norm, town, town_norm, postcode, home_count
       FROM picking_streets
      WHERE street_norm = 'BIRKDALE RISE'
      ORDER BY postcode`,
  );
  assert(streets.rows.length === 2, "the street rebuild files one row per (street, postcode)");
  assert(
    streets.rows[0].postcode === "CM3 2JT" &&
      streets.rows[0].home_count === 2 &&
      streets.rows[0].town === "CHELMSFORD" &&
      streets.rows[0].town_norm === "CHELMSFORD",
    "the street row carries its town and home count (CM3 2JT: 2 homes)",
  );
  assert(
    streets.rows[1].postcode === "CM3 2JU" && streets.rows[1].home_count === 1,
    "the same street in a second postcode is its own row (CM3 2JU: 1 home)",
  );
  // set_limit is session state; the proof's connection
  // ends with the process, so nothing leaks past it.
  await client.query("SELECT set_limit(0.4)");
  const fuzzy = await client.query(
    "SELECT street_norm FROM picking_streets WHERE street_norm % 'BUGDALE RISE'",
  );
  assert(
    fuzzy.rows.some((row) => row.street_norm === "BIRKDALE RISE"),
    "the % operator at the pinned limit offers the real street for the misspelling",
  );

  // ---- Place suggestions (M7.15D, migration 0032).
  // The same foundations for the Places group: the
  // plan's witness pair separates at the same pinned
  // 0.4 (the transposition clears it, the nearest
  // unrelated real town stays below), the filing
  // machinery's rebuild derives the place table at its
  // ruled grain from the very rows the street proof
  // filed, and the served-district predicate — the
  // district bundle's own test, read off the directory's
  // LSOA letters — separates an England district from a
  // Scottish one.
  const placeSims = await client.query(
    `SELECT similarity('CHLEMSFORD', 'CHELMSFORD') AS hit,
            similarity('CHELMSFORD', 'CHELTENHAM') AS miss`,
  );
  const placeHit = Number(placeSims.rows[0].hit);
  const placeMiss = Number(placeSims.rows[0].miss);
  assert(
    placeHit >= 0.4,
    `the witness place misspelling clears the pinned 0.4 threshold (CHLEMSFORD ~ CHELMSFORD = ${placeHit.toFixed(4)})`,
  );
  assert(
    placeMiss < 0.4,
    `the nearest unrelated real town stays below it (CHELMSFORD ~ CHELTENHAM = ${placeMiss.toFixed(4)})`,
  );

  await rebuildPickingPlaces(client);
  const placeRows = await client.query(
    `SELECT place_norm, place_display, outward, postcode_count
       FROM picking_places
      WHERE place_norm = 'CHELMSFORD'`,
  );
  assert(placeRows.rows.length === 1, "the place rebuild files one row per (place, district)");
  assert(
    placeRows.rows[0].outward === "CM3" &&
      placeRows.rows[0].place_display === "CHELMSFORD" &&
      placeRows.rows[0].postcode_count === 2,
    "the place row carries its district and distinct postcode count (Chelmsford in CM3: CM3 2JT + CM3 2JU)",
  );
  const fuzzyPlace = await client.query(
    "SELECT place_norm FROM picking_places WHERE place_norm % 'CHLEMSFORD'",
  );
  assert(
    fuzzyPlace.rows.some((row) => row.place_norm === "CHELMSFORD"),
    "the % operator at the pinned limit offers the real place for the misspelling",
  );

  await client.query(
    `INSERT INTO postcode_cache (postcode, latitude, longitude, lsoa_code)
     VALUES ('CM3 9ZZ', 51.75, 0.58, 'E01021395'),
            ('EH9 9ZZ', 55.95, -3.19, 'S01014710')`,
  );
  const served = await client.query(
    `SELECT
       EXISTS (SELECT 1 FROM postcode_cache
                WHERE postcode LIKE 'CM3 %'
                  AND (lsoa_code LIKE 'E%' OR lsoa_code LIKE 'W%')) AS england,
       EXISTS (SELECT 1 FROM postcode_cache
                WHERE postcode LIKE 'EH9 %'
                  AND (lsoa_code LIKE 'E%' OR lsoa_code LIKE 'W%')) AS scotland`,
  );
  assert(
    served.rows[0].england === true && served.rows[0].scotland === false,
    "the served-district predicate offers an England district and withholds a Scottish one",
  );

  await client.query("ROLLBACK");
  console.log("All proofs passed; test rows rolled back.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
