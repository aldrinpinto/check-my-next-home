import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GOLDEN, fileImd, goldenChecks, imdSummaryFor, parseFile7 } from "../loaders/load-imd.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// IMD loader (plan step M5.9), tested against the fixture in
// tests/fixtures/imd — the published File 7 header plus the three
// golden LSOA rows verbatim (see the fixture README). The golden
// figures are the M5.9 prep's live extraction of 13 Nov 2026,
// confirmed against the founder verdicts (Birkdale decile 8,
// Exeter 3, Epsom 10).

const FIXTURE = readFileSync(join(process.cwd(), "tests/fixtures/imd/iod2025-file7.csv"), "utf8");

type ImdRow = {
  lsoaCode: string;
  lsoaName: string;
  stats: { score: number; rank: number; domains: Record<string, number> };
  imdDecile: number;
  imdSummary: string;
};

describe("the fixture load", () => {
  it("parses the three golden LSOAs with every filed figure exact", () => {
    const rows = parseFile7(FIXTURE) as ImdRow[];
    expect(rows).toHaveLength(3);
    for (const [code, golden] of Object.entries(GOLDEN)) {
      const row = rows.find((r) => r.lsoaCode === code);
      expect(row, code).toBeDefined();
      expect(row?.lsoaName).toBe(golden.name);
      expect(row?.stats.score).toBe(golden.score);
      expect(row?.stats.rank).toBe(golden.rank);
      expect(row?.imdDecile).toBe(golden.decile);
      const keys = [
        "income",
        "employment",
        "education",
        "health",
        "crime",
        "barriers",
        "livingEnvironment",
      ];
      expect(keys.map((k) => row?.stats.domains[k])).toEqual(golden.domains);
    }
    expect(() => goldenChecks(rows, { full: false })).not.toThrow();
  });

  it("files no IDACI or IDAOPI figure anywhere in the stats", () => {
    const rows = parseFile7(FIXTURE) as ImdRow[];
    for (const row of rows) {
      expect(Object.keys(row.stats).sort()).toEqual(["domains", "rank", "score"]);
      expect(JSON.stringify(row.stats)).not.toMatch(/idaci|idaopi/i);
    }
  });
});

describe("imd_summary — the Final Design's words, rendered from the decile", () => {
  it("renders the design's example for decile 3 exactly", () => {
    expect(imdSummaryFor(3)).toBe("Among the more deprived 30 percent of areas in England");
  });

  it("renders both halves across all ten deciles", () => {
    expect(imdSummaryFor(1)).toContain("more deprived 10 percent");
    expect(imdSummaryFor(5)).toContain("more deprived 50 percent");
    expect(imdSummaryFor(6)).toContain("less deprived 50 percent");
    expect(imdSummaryFor(8)).toContain("less deprived 30 percent");
    expect(imdSummaryFor(10)).toContain("less deprived 10 percent");
    expect(() => imdSummaryFor(0)).toThrow();
    expect(() => imdSummaryFor(11)).toThrow();
  });

  it("files the rendered line on every row", () => {
    const rows = parseFile7(FIXTURE) as ImdRow[];
    for (const row of rows) expect(row.imdSummary).toBe(imdSummaryFor(row.imdDecile));
  });
});

describe("the header contract", () => {
  it("refuses a file whose consumed columns moved", () => {
    const broken = FIXTURE.replace("Crime Decile", "Crime Decile Renamed");
    expect(() => parseFile7(broken)).toThrow(/missing column/);
  });

  it("refuses a short file in full mode via the golden checks", () => {
    const rows = parseFile7(FIXTURE);
    expect(() => goldenChecks(rows, { full: true })).toThrow(/33,755|33755/);
  });

  it("refuses a non-English code — Scotland and Wales are never filed", () => {
    const scottish = FIXTURE.replace("E01021395", "S01012345");
    expect(() => parseFile7(scottish)).toThrow(/unexpected LSOA code/);
  });
});

describe("filing — statement order and the stage swap (the M5.6 pattern)", () => {
  it("opens BEGIN before the stage create and swaps in one transaction", async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        return { rows: [], rowCount: 0 };
      },
    };
    const rows = parseFile7(FIXTURE);
    await fileImd(client as never, rows as never);
    const beginAt = statements.findIndex((s) => s === "BEGIN");
    const stageAt = statements.findIndex((s) => /CREATE TEMP TABLE imd_stage/.test(s));
    expect(beginAt).toBeGreaterThanOrEqual(0);
    expect(stageAt).toBeGreaterThan(beginAt);
    expect(statements.some((s) => /DELETE FROM neighbourhood_stats/.test(s))).toBe(true);
    expect(statements.some((s) => /INSERT INTO neighbourhood_stats \(/.test(s))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
  });
});

describe("progress — BUG-265", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };

  it("logs the filing chunks with a real percentage and closes the tally", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-imd", log });
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        return { rows: [], rowCount: 0 };
      },
    };
    await fileImd(client as never, parseFile7(FIXTURE) as never, { progress });
    expect(lines.some((l) => /progress · file 1\/1 chunks \(100%\)$/.test(l))).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("names a filing failure with the filed count and the resume point, first line only", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-imd", log });
    const client = {
      query: async (sql: string) => {
        if (/INSERT INTO imd_stage/.test(sql)) throw new Error("boom\nsecond line");
        return { rows: [], rowCount: 0 };
      },
    };
    await expect(
      fileImd(client as never, parseFile7(FIXTURE) as never, { progress }),
    ).rejects.toThrow("boom");
    expect(
      lines.some((l) =>
        /failed · file · filed 0 of 3 · boom · resume from re-run from scratch/.test(l),
      ),
    ).toBe(true);
    expect(lines.some((l) => l.includes("second line"))).toBe(false);
  });
});
