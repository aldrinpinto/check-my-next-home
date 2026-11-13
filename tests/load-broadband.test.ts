import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fileBroadband,
  loadBroadbandRows,
  parsePostcodeCsv,
  releaseFromNames,
  structuralChecks,
} from "../loaders/load-broadband.mjs";

// Broadband loader (plan step M5.9). The fixture is format-faithful
// with INVENTED values (see the fixture README — Ofcom 403s the
// build sandbox; the live pull is outstanding). Tests pin the
// parse, the published band-sum invariant, the release discovery
// arithmetic and the answers filing pattern — never a coverage
// figure.

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/broadband");
const RELEASE = { snapshot: "2026-01", snapshotLabel: "2026-01" };

describe("the fixture release", () => {
  it("loads all three area files into structural-checked rows", async () => {
    const { release, rows } = (await loadBroadbandRows({ fileDir: FIXTURE_DIR } as never)) as {
      release: { snapshot: string; revision: string };
      rows: { postcode: string; answer: Record<string, unknown> }[];
    };
    expect(release.snapshot).toBe("2026-01");
    expect(rows.map((r) => r.postcode).sort()).toEqual([
      "CM1 6ER",
      "CM3 2JT",
      "E16 1GN",
      "KT17 1FH",
    ]);
    expect(() => structuralChecks(rows, { full: false })).not.toThrow();
    const birkdale = rows.find((r) => r.postcode === "CM3 2JT");
    expect(birkdale?.answer.basis).toBe("All premises");
    expect(birkdale?.answer.snapshot).toBe("2026-01");
    // The filed answer has no full-fibre or max-speed field — Ofcom
    // does not publish them at postcode level (gap G6).
    expect(JSON.stringify(birkdale?.answer)).not.toMatch(/full_fibre|max_speed/);
  });

  it("derives the release from the file names (the r1-to-r2 lesson)", () => {
    const release = releaseFromNames([
      "202601_fixed_postcode_coverage_r2_CM.csv",
      "202601_fixed_postcode_coverage_r2_E.csv",
    ]) as { snapshot: string; revision: string; sourceDate: string };
    expect(release.snapshot).toBe("2026-01");
    expect(release.revision).toBe("r2");
    expect(release.sourceDate).toBe("2026-01-01");
  });
});

describe("the file contract", () => {
  const HEADER =
    "postcode,postcode_space,postcode area,SFBB availability (% premises),UFBB (100Mbit/s) availability (% premises),UFBB availability (% premises),Gigabit availability (% premises),% of premises unable to receive 2Mbit/s,% of premises unable to receive 5Mbit/s,% of premises unable to receive 10Mbit/s,% of premises unable to receive 30Mbit/s,% of premises unable to receive decent broadband from fixed or FWA,% of premises with NGA,% of premises able to receive decent broadband from FWA,% of premises with 0<2Mbit/s download speed,% of premises with 2<5Mbit/s download speed,% of premises with 5<10Mbit/s download speed,% of premises with 10<30Mbit/s download speed,% of premises with 30<300Mbit/s download speed,% of premises with >=300Mbit/s download speed";
  const ROW = "AB12CD,AB1 2CD,AB,90,80,70,70,1,2,3,10,2,95,1,1,2,3,4,20,70";

  it("parses a documented row", () => {
    const rows = parsePostcodeCsv(`${HEADER}\n${ROW}\n`, RELEASE) as {
      postcode: string;
      answer: { gigabit_capable_pct: number };
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].postcode).toBe("AB1 2CD");
    expect(rows[0].answer.gigabit_capable_pct).toBe(70);
  });

  it("refuses a renamed column and names the actual headers", () => {
    const broken = `${HEADER.replace("Gigabit availability", "Gigabit avail.")}\n${ROW}\n`;
    expect(() => parsePostcodeCsv(broken, RELEASE)).toThrow(/missing column/);
  });

  it("refuses a row whose speed bands do not sum to ~100", () => {
    const broken = `${HEADER}\n${ROW.replace(",20,70", ",20,60")}\n`;
    expect(() => parsePostcodeCsv(broken, RELEASE)).toThrow(/sum to/);
  });
});

describe("filing — the answers pattern (guard-asserted shape)", () => {
  it("stages, merges with UPDATE postcode_cache SET answers, clears stale keys", async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        return { rows: [], rowCount: 3 };
      },
    };
    const { rows } = await loadBroadbandRows({ fileDir: FIXTURE_DIR } as never);
    const updated = await fileBroadband(client as never, rows as never);
    expect(updated).toBe(3);
    const beginAt = statements.findIndex((s) => s === "BEGIN");
    const stageAt = statements.findIndex((s) => /CREATE TEMP TABLE broadband_stage/.test(s));
    expect(beginAt).toBeGreaterThanOrEqual(0);
    expect(stageAt).toBeGreaterThan(beginAt);
    expect(statements.some((s) => /UPDATE postcode_cache SET answers/.test(s))).toBe(true);
    expect(statements.some((s) => /answers - 'broadband'/.test(s))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
  });
});
