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
import { createProgressLogger } from "../loaders/progress.mjs";

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

// BUG-265: the join and the staging carry the shared progress
// logger — a tally every 25,000 rows built (a closing line
// only at fixture scale) and every 25 chunks staged.
describe("progress logging (BUG-265)", () => {
  const collect = () => {
    const lines: string[] = [];
    const log = (...args: unknown[]) => lines.push(args.join(" "));
    return { lines, log };
  };

  it("builds the fixture rows with a closing build line", () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-air-quality", log });
    const rows = buildRows(
      {
        no2: parsePcmCsv(text("mapno22024.csv"), "no2", 2024),
        pm25: parsePcmCsv(text("mappm252024g.csv"), "pm25", 2024),
        pm10: parsePcmCsv(text("mappm102024g.csv"), "pm10", 2024),
      },
      2024,
      { progress },
    );
    expect(rows).toHaveLength(3);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/progress · build 3\/3 rows \(100%\)$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("stages 12,600 rows with a tally line at 25 chunks and a closing line", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-air-quality", log });
    const client = { query: async () => ({ rows: [], rowCount: 0 }) };
    const rows = Array.from({ length: 12600 }, (_, i) => ({
      gridRef: String(100000 + i),
      year: 2024,
      no2: 1,
      pm25: 2,
      pm10: 3,
      latitude: 51.5,
      longitude: 0.1,
    }));
    await fileAirGrid(client as never, rows as never, { progress });
    // The stage tally lines are the pin: the heartbeat fires
    // every 10 chunks by count, so both health lines are
    // deterministic too — but a slow-batch warning is
    // timing-dependent (the instant fake client can time a
    // 1 ms chunk against a 0 ms average), so no total count
    // is pinned here.
    const stageLines = lines.filter((l) => /progress · stage \d+\/\d+ chunks/.test(l));
    expect(stageLines).toHaveLength(2);
    expect(stageLines[0]).toMatch(/progress · stage 25\/26 chunks \(96%\)$/);
    expect(stageLines[1]).toMatch(/progress · stage 26\/26 chunks \(100%\)$/);
    const heartbeats = lines.filter((l) => l.includes(" heartbeat · "));
    expect(heartbeats).toHaveLength(2);
    expect(heartbeats[0]).toMatch(/heartbeat · stage · 10\/26 · /);
    expect(heartbeats[1]).toMatch(/heartbeat · stage · 20\/26 · /);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });
});
