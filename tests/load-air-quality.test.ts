import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GOLDEN,
  buildRows,
  fileAirGrid,
  goldenChecks,
  parsePcmCsv,
} from "../loaders/load-air-quality.mjs";

// Air quality loader (plan step M5.9), tested against the fixture in
// tests/fixtures/air — the three golden 1 km squares verbatim from
// Defra's PCM 2024 CSVs (see the fixture README).

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/air");
const text = (name: string) => readFileSync(join(FIXTURE_DIR, name), "utf8");

function fixtureRows() {
  return buildRows(
    {
      no2: parsePcmCsv(text("mapno22024.csv"), "no2", 2024),
      pm25: parsePcmCsv(text("mappm252024g.csv"), "pm25", 2024),
      pm10: parsePcmCsv(text("mappm102024g.csv"), "pm10", 2024),
    },
    2024,
  );
}

describe("the fixture load", () => {
  it("joins the three pollutant files into the golden squares, full precision", () => {
    const rows = fixtureRows() as {
      gridRef: string;
      no2: number;
      pm25: number;
      pm10: number;
    }[];
    expect(rows).toHaveLength(3);
    for (const [gridRef, g] of Object.entries(GOLDEN)) {
      const row = rows.find((r) => r.gridRef === gridRef);
      expect(row, gridRef).toBeDefined();
      expect([row?.no2, row?.pm25, row?.pm10]).toEqual([g.no2, g.pm25, g.pm10]);
    }
    expect(() => goldenChecks(rows, { full: false })).not.toThrow();
  });

  it("files the square centres converted from EPSG:27700", () => {
    const rows = fixtureRows() as { gridRef: string; latitude: number; longitude: number }[];
    const birkdale = rows.find((r) => r.gridRef === "751310");
    // The centre (579500, 211500) converts to a point inside the
    // Birkdale square — within ~150 m of the postcode point itself.
    expect(birkdale?.latitude).toBeCloseTo(51.7762, 2);
    expect(birkdale?.longitude).toBeCloseTo(0.6039, 2);
  });
});

describe("the file contract", () => {
  it("refuses a wrong-vintage file", () => {
    const wrong = text("mapno22024.csv").replace("\n2024,", "\n2023,");
    expect(() => parsePcmCsv(wrong, "no2", 2024)).toThrow(/metadata year/);
  });

  it("refuses a moved value column", () => {
    const wrong = text("mapno22024.csv").replace("no22024", "no22025");
    expect(() => parsePcmCsv(wrong, "no2", 2024)).toThrow(/header/);
  });

  it("files the publisher's MISSING marker as NULL, not a failure", () => {
    const withMissing = `${text("mappm252024g.csv")}534070,-500,525500,MISSING\n`;
    const cells = parsePcmCsv(withMissing, "pm25", 2024);
    expect(cells.get("534070")?.value).toBeNull();
  });

  it("refuses mismatched square sets across pollutants", () => {
    const pm25 = parsePcmCsv(text("mappm252024g.csv"), "pm25", 2024);
    pm25.delete("751310");
    expect(() =>
      buildRows(
        {
          no2: parsePcmCsv(text("mapno22024.csv"), "no2", 2024),
          pm25,
          pm10: parsePcmCsv(text("mappm102024g.csv"), "pm10", 2024),
        },
        2024,
      ),
    ).toThrow(/counts differ|missing/);
  });
});

describe("filing — statement order and the year-scoped swap", () => {
  it("opens BEGIN before the stage create and only deletes the filed year", async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        return { rows: [], rowCount: 0 };
      },
    };
    await fileAirGrid(client as never, fixtureRows() as never);
    const beginAt = statements.findIndex((s) => s === "BEGIN");
    const stageAt = statements.findIndex((s) => /CREATE TEMP TABLE air_stage/.test(s));
    expect(beginAt).toBeGreaterThanOrEqual(0);
    expect(stageAt).toBeGreaterThan(beginAt);
    expect(statements.some((s) => /DELETE FROM air_grid WHERE year = \$1/.test(s))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
  });
});
