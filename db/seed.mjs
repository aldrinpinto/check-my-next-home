// Check My Next Home — fake facts for practice (plan step M3.6).
//
// Seeds a small, clearly-labelled practice dataset around the two
// golden test homes (19 Birkdale Rise, Hatfield Peverel CM3 2JT and
// 6 Exeter Road, London E16 1GN) so the engine and screens can be
// built and tried before the real loaders arrive (Milestones 4–5).
//
// EVERY seeded row is stamped source_name = "SEED — fake practice
// data (M3.6)". Nothing here is a real fact about a real place, and
// no seeded row may ever be served as one. Re-running the seed first
// deletes every previously seeded row, so it is safe to run any
// number of times. Real loaders replace this data table by table.
//
// Usage:
//   npm run db:seed              delete old seed rows, insert fresh
//   npm run db:seed -- --verify  print seeded row counts per table

import pg from "pg";

const SEED_SOURCE = "SEED — fake practice data (M3.6)";
const SEED_DATE = "2026-11-12";

// Every table the seed touches (reports and licence_keys are never
// seeded — they belong to real orders only). Children first, so the
// deletes respect the foreign keys.
const SEEDED_TABLES = [
  "ofsted_outcomes",
  "cqc_ratings",
  "postcode_cache",
  "price_paid",
  "schools",
  "nurseries",
  "health_points",
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

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set — see .env.example (Key K6).");
  process.exit(1);
}

async function printCounts(client) {
  let total = 0;
  for (const table of SEEDED_TABLES) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE source_name = $1`,
      [SEED_SOURCE],
    );
    total += rows[0].n;
    console.log(`${table}: ${rows[0].n} seeded rows`);
  }
  console.log(`total seeded rows: ${total}`);
  return total;
}

async function bulkInsert(client, table, columns, rows) {
  if (rows.length === 0) return;
  const values = [];
  const tuples = rows.map((row, rowIndex) => {
    const placeholders = row.map((_, colIndex) => `$${rowIndex * row.length + colIndex + 1}`);
    values.push(...row);
    return `(${placeholders.join(", ")})`;
  });
  await client.query(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}`,
    values,
  );
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();

  if (process.argv.includes("--verify")) {
    const total = await printCounts(client);
    if (total === 0) {
      console.error("No seeded rows found — run npm run db:seed first.");
      process.exitCode = 1;
    }
  } else {
    await client.query("BEGIN");
    try {
      for (const table of SEEDED_TABLES) {
        await client.query(`DELETE FROM ${table} WHERE source_name = $1`, [SEED_SOURCE]);
      }

      const stamp = [SEED_SOURCE, SEED_DATE];

      await bulkInsert(
        client,
        "postcode_cache",
        [
          "postcode",
          "latitude",
          "longitude",
          "council",
          "ward",
          "region",
          "lsoa_code",
          "answers",
          "source_name",
          "source_date",
        ],
        [
          [
            "CM3 2JT",
            51.7566,
            0.5813,
            "Braintree",
            "Hatfield Peverel and Terling",
            "East of England",
            "E01021599",
            JSON.stringify({
              crime: { note: "Practice only — the real Police.uk loader lands in Milestone 4." },
            }),
            ...stamp,
          ],
          [
            "E16 1GN",
            51.5186,
            0.0243,
            "Newham",
            "Canning Town South",
            "London",
            "E01033789",
            JSON.stringify({
              crime: { note: "Practice only — the real Police.uk loader lands in Milestone 4." },
            }),
            ...stamp,
          ],
        ],
      );

      await bulkInsert(
        client,
        "price_paid",
        [
          "postcode",
          "price",
          "sale_date",
          "property_type",
          "new_build",
          "tenure",
          "paon",
          "street",
          "town",
          "county",
          "source_name",
          "source_date",
        ],
        [
          [
            "CM3 2JT",
            485000,
            "2023-05-12",
            "S",
            false,
            "F",
            "12",
            "Birkdale Rise",
            "Chelmsford",
            "Essex",
            ...stamp,
          ],
          [
            "CM3 2JT",
            512000,
            "2024-09-03",
            "D",
            false,
            "F",
            "27",
            "Birkdale Rise",
            "Chelmsford",
            "Essex",
            ...stamp,
          ],
          [
            "CM3 2JT",
            460000,
            "2022-11-25",
            "S",
            false,
            "F",
            "8",
            "Birkdale Rise",
            "Chelmsford",
            "Essex",
            ...stamp,
          ],
          [
            "CM3 2JT",
            530000,
            "2025-03-18",
            "D",
            false,
            "F",
            "31",
            "Birkdale Rise",
            "Chelmsford",
            "Essex",
            ...stamp,
          ],
          [
            "E16 1GN",
            342000,
            "2023-02-14",
            "F",
            false,
            "L",
            "6",
            "Exeter Road",
            "London",
            "Greater London",
            ...stamp,
          ],
          [
            "E16 1GN",
            355000,
            "2024-06-21",
            "F",
            false,
            "L",
            "14",
            "Exeter Road",
            "London",
            "Greater London",
            ...stamp,
          ],
          [
            "E16 1GN",
            328000,
            "2022-08-30",
            "F",
            false,
            "L",
            "22",
            "Exeter Road",
            "London",
            "Greater London",
            ...stamp,
          ],
        ],
      );

      await bulkInsert(
        client,
        "schools",
        [
          "urn",
          "name",
          "school_type",
          "phase",
          "age_range_low",
          "age_range_high",
          "postcode",
          "latitude",
          "longitude",
          "source_name",
          "source_date",
        ],
        [
          [
            "SEED-SCH-01",
            "Birkdale Practice Primary School",
            "Academy converter",
            "Primary",
            4,
            11,
            "CM3 2JT",
            51.7586,
            0.5773,
            ...stamp,
          ],
          [
            "SEED-SCH-02",
            "Birkdale Practice High School",
            "Academy converter",
            "Secondary",
            11,
            18,
            "CM3 2JX",
            51.7496,
            0.5903,
            ...stamp,
          ],
          [
            "SEED-SCH-03",
            "Exeter Practice Primary School",
            "Maintained school",
            "Primary",
            3,
            11,
            "E16 1GN",
            51.5176,
            0.0273,
            ...stamp,
          ],
          [
            "SEED-SCH-04",
            "Exeter Practice Academy",
            "Academy sponsor led",
            "Secondary",
            11,
            16,
            "E16 1AA",
            51.5236,
            0.0183,
            ...stamp,
          ],
        ],
      );

      await bulkInsert(
        client,
        "ofsted_outcomes",
        ["urn", "rating", "inspection_date", "report_url", "source_name", "source_date"],
        [
          ["SEED-SCH-01", "Good", "2025-03-04", null, ...stamp],
          ["SEED-SCH-02", "Outstanding", "2024-11-19", null, ...stamp],
          ["SEED-SCH-03", "Good", "2025-06-10", null, ...stamp],
          ["SEED-SCH-04", "Requires improvement", "2025-01-28", null, ...stamp],
        ],
      );

      await bulkInsert(
        client,
        "nurseries",
        [
          "urn",
          "name",
          "setting_type",
          "postcode",
          "latitude",
          "longitude",
          "source_name",
          "source_date",
        ],
        [
          [
            "SEED-NUR-01",
            "Birkdale Practice Day Nursery",
            "Childcare on non-domestic premises",
            "CM3 2JT",
            51.7556,
            0.5853,
            ...stamp,
          ],
          [
            "SEED-NUR-02",
            "Exeter Practice Day Nursery",
            "Childcare on non-domestic premises",
            "E16 1GN",
            51.5196,
            0.0213,
            ...stamp,
          ],
        ],
      );

      await bulkInsert(
        client,
        "health_points",
        [
          "ods_code",
          "name",
          "service_type",
          "postcode",
          "latitude",
          "longitude",
          "source_name",
          "source_date",
        ],
        [
          ["SEED-GP-01", "Birkdale Practice Surgery", "gp", "CM3 2JT", 51.7576, 0.5793, ...stamp],
          [
            "SEED-DEN-01",
            "Birkdale Practice Dental",
            "dentist",
            "CM3 2JT",
            51.7546,
            0.5833,
            ...stamp,
          ],
          [
            "SEED-PHA-01",
            "Birkdale Practice Pharmacy",
            "pharmacy",
            "CM3 2JT",
            51.7566,
            0.5833,
            ...stamp,
          ],
          ["SEED-GP-02", "Exeter Practice Health Centre", "gp", "E16 1GN", 51.518, 0.026, ...stamp],
        ],
      );
      const hospital = await client.query(
        `INSERT INTO health_points (ods_code, name, service_type, postcode, latitude, longitude, source_name, source_date)
         VALUES ('SEED-HOS-01', 'Exeter Practice Hospital', 'hospital', 'E16 1GN', 51.5256, 0.0303, $1, $2)
         RETURNING id`,
        stamp,
      );
      await bulkInsert(
        client,
        "cqc_ratings",
        [
          "health_point_id",
          "cqc_location_id",
          "rating",
          "rating_date",
          "report_url",
          "source_name",
          "source_date",
        ],
        [[hospital.rows[0].id, "SEED-CQC-01", "Good", "2025-02-11", null, ...stamp]],
      );

      await bulkInsert(
        client,
        "greenspace_points",
        ["osm_id", "name", "point_role", "latitude", "longitude", "source_name", "source_date"],
        [
          [900001, "Birkdale Practice Green", "centre", 51.7606, 0.5693, ...stamp],
          [900002, "Birkdale Practice Green", "access", 51.759, 0.572, ...stamp],
          [900003, "Exeter Practice Park", "centre", 51.5246, 0.0343, ...stamp],
        ],
      );

      await bulkInsert(
        client,
        "osm_points",
        ["osm_id", "name", "place_type", "latitude", "longitude", "source_name", "source_date"],
        [
          [910001, "Practice Supermarket (Birkdale)", "supermarket", 51.7536, 0.5753, ...stamp],
          [910002, "Practice Vets (Birkdale)", "veterinary", 51.7596, 0.5863, ...stamp],
          [910003, "Practice Playground (Birkdale)", "playground", 51.758, 0.589, ...stamp],
          [910004, "Practice Dog Park (Birkdale)", "dog_park", 51.7516, 0.5713, ...stamp],
          [910005, "Practice Supermarket (Exeter)", "supermarket", 51.5166, 0.0203, ...stamp],
          [910006, "Practice Corner Shop (Exeter)", "convenience", 51.519, 0.025, ...stamp],
          [910007, "Practice Playground (Exeter)", "playground", 51.5216, 0.0283, ...stamp],
        ],
      );

      await bulkInsert(
        client,
        "transport_stops",
        ["atco_code", "name", "stop_type", "latitude", "longitude", "source_name", "source_date"],
        [
          ["SEED-BUS-01", "Birkdale Rise (practice stop)", "bus", 51.756, 0.58, ...stamp],
          ["SEED-BUS-02", "The Street (practice stop)", "bus", 51.7583, 0.5846, ...stamp],
          [
            "SEED-RAIL-01",
            "Hatfield Peverel (practice station)",
            "rail",
            51.7626,
            0.5663,
            ...stamp,
          ],
          ["SEED-BUS-03", "Exeter Road (practice stop)", "bus", 51.5183, 0.023, ...stamp],
          ["SEED-RAIL-02", "Canning Town (practice station)", "rail", 51.5136, 0.0163, ...stamp],
        ],
      );

      await bulkInsert(
        client,
        "air_grid",
        [
          "grid_ref",
          "year",
          "no2",
          "pm25",
          "pm10",
          "latitude",
          "longitude",
          "source_name",
          "source_date",
        ],
        [
          ["SEED-CM3-1", 2024, 14.2, 8.9, 13.7, 51.7565, 0.5815, ...stamp],
          ["SEED-E16-1", 2024, 31.4, 12.8, 19.6, 51.5185, 0.0245, ...stamp],
        ],
      );

      await bulkInsert(
        client,
        "noise_summary",
        [
          "area_ref",
          "day_band",
          "night_band",
          "latitude",
          "longitude",
          "source_name",
          "source_date",
        ],
        [
          ["SEED-CM3-2JT", "55–59 dB", "50–54 dB", 51.7566, 0.5813, ...stamp],
          ["SEED-E16-1GN", "65–69 dB", "60–64 dB", 51.5186, 0.0243, ...stamp],
        ],
      );

      // Practice flood shapes: surface water near (not over) the
      // Birkdale home; a river & sea Zone 3 shape over the Exeter
      // home — one of each case to practise against.
      await client.query(
        `INSERT INTO flood_layers (layer_type, risk_label, geom, layer_date, source_name, source_date)
         VALUES ('surface_water', 'Medium', ST_Multi(ST_MakeEnvelope(0.56, 51.744, 0.572, 51.752, 4326)), $1, $2, $1),
                ('river_sea', 'Zone 3', ST_Multi(ST_MakeEnvelope(0.0143, 51.5086, 0.0343, 51.5286, 4326)), $1, $2, $1)`,
        [SEED_DATE, SEED_SOURCE],
      );

      await client.query(
        `INSERT INTO planning_layers (constraint_type, name, geom, source_name, source_date)
         VALUES ('tpo', 'Practice tree preservation order area', ST_Multi(ST_MakeEnvelope(0.59, 51.76, 0.6, 51.768, 4326)), $1, $2),
                ('conservation_area', 'Practice conservation area', ST_Multi(ST_MakeEnvelope(0.04, 51.526, 0.052, 51.536, 4326)), $1, $2)`,
        stamp,
      );

      await bulkInsert(
        client,
        "listed_buildings",
        [
          "list_entry_id",
          "name",
          "grade",
          "postcode",
          "latitude",
          "longitude",
          "source_name",
          "source_date",
        ],
        [
          ["SEED-LB-01", "Practice Old Hall", "II", "CM3 2JT", 51.7572, 0.576, ...stamp],
          ["SEED-LB-02", "Practice Dockside Warehouse", "II", "E16 1GN", 51.517, 0.019, ...stamp],
        ],
      );

      await bulkInsert(
        client,
        "neighbourhood_stats",
        [
          "lsoa_code",
          "lsoa_name",
          "stats",
          "imd_decile",
          "imd_summary",
          "source_name",
          "source_date",
        ],
        [
          [
            "E01021599",
            "Braintree 014A (practice)",
            JSON.stringify({
              tenure: { owned: 78.1, social_rented: 9.4, private_rented: 11.2 },
              households_with_children_share: 31.5,
            }),
            7,
            "Less deprived than most areas (practice line)",
            ...stamp,
          ],
          [
            "E01033789",
            "Newham 031A (practice)",
            JSON.stringify({
              tenure: { owned: 28.4, social_rented: 34.9, private_rented: 34.1 },
              households_with_children_share: 38.2,
            }),
            3,
            "More deprived than most areas (practice line)",
            ...stamp,
          ],
        ],
      );

      await bulkInsert(
        client,
        "ev_points",
        [
          "registry_id",
          "name",
          "latitude",
          "longitude",
          "connector_types",
          "charging_speed",
          "source_name",
          "source_date",
        ],
        [
          [
            "SEED-EV-01",
            "Practice charge point (Birkdale)",
            51.754,
            0.588,
            "Type 2",
            "7 kW",
            ...stamp,
          ],
          [
            "SEED-EV-02",
            "Practice charge point (Exeter)",
            51.5206,
            0.0153,
            "CCS",
            "50 kW",
            ...stamp,
          ],
        ],
      );

      await client.query("COMMIT");
      console.log("Seeded the practice facts.");
      await printCounts(client);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
