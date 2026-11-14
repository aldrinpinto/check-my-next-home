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

  await client.query("ROLLBACK");
  console.log("All proofs passed; test rows rolled back.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
