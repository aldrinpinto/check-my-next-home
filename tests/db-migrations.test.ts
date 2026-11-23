import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the shelves (plan steps M3.3 / M3.5): the migration files are
// named and numbered properly, and migration 0001 switches PostGIS on
// and creates every table on the Technical Plan's Section 2 list.
// The live proof against a real database runs in CI (db/prove.mjs).

const migrationsDir = join(process.cwd(), "db", "migrations");
const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

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
  "council_tax_rates",
];

describe("database migrations", () => {
  it("uses NNNN_snake_case.sql names with unique numbers, in order", () => {
    const versions = files.map((file) => {
      const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(file);
      expect(match, `bad migration file name: ${file}`).not.toBeNull();
      return Number.parseInt(match![1], 10);
    });
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
  });

  it("migration 0045 gives price_paid its postcode pattern index (BUG-194)", () => {
    // The register was the one table of the suggest
    // path's three still missing its text_pattern_ops
    // index (0035 gave the other two theirs), so every
    // postcode-fragment keystroke seq-scanned all
    // 10 GB of it. The migration is that one index,
    // in the house form — a plain CREATE INDEX inside
    // the runner's transaction, as 0035 wrote its two.
    const file = files.find((candidate) => candidate.startsWith("0045_"));
    expect(file).toBeDefined();
    const sql = readFileSync(join(migrationsDir, file!), "utf8");
    expect(sql).toContain("CREATE INDEX price_paid_postcode_prefix_idx");
    expect(sql).toContain("ON price_paid (postcode text_pattern_ops)");
  });

  it("migration 0001 enables PostGIS and creates all 20 shelves", () => {
    const first = files.find((file) => file.startsWith("0001_"));
    expect(first).toBeDefined();
    const sql = readFileSync(join(migrationsDir, first!), "utf8");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS postgis");
    for (const table of EXPECTED_TABLES) {
      expect(sql, `missing table: ${table}`).toContain(`CREATE TABLE ${table} (`);
    }
  });
});
