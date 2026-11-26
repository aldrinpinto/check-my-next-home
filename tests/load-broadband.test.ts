import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  POSTCODE_FILE,
  fileBroadband,
  loadBroadbandRows,
  parsePostcodeCsv,
  releaseFromNames,
  structuralChecks,
} from "../loaders/load-broadband.mjs";

// Broadband loader (plan step M5.9). The fixture is format-faithful
// with INVENTED values (see the fixture README — Ofcom 403s the
// build sandbox; the live pull is outstanding). Tests pin the
// parse, the documented band rule (bands are shares of all
// premises; the shortfall below 100 is the unclassified share, so
// only a sum over 100 fails), the release discovery arithmetic
// and the answers filing pattern — never a coverage figure.

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
      "CM8 8AA",
      "CM9 9AA",
      "E16 1GN",
      "KT17 1FH",
    ]);
    expect(() => structuralChecks(rows, { full: false })).not.toThrow();
    // The two real-shaped rows added 13 Nov 2026 (see the fixture
    // README): a postcode whose bands sum to 88.9 — the 11.1
    // shortfall is its unclassified share — and one whose bands
    // are all zero (no matched premises). Both must file.
    const partial = rows.find((r) => r.postcode === "CM9 9AA");
    const bandSum = (a: Record<string, unknown>) =>
      Object.values(a.speed_band_pct as Record<string, number>).reduce((x, y) => x + y, 0);
    expect(bandSum(partial!.answer)).toBeCloseTo(88.9, 5);
    const unclassified = rows.find((r) => r.postcode === "CM8 8AA");
    expect(bandSum(unclassified!.answer)).toBe(0);
    const birkdale = rows.find((r) => r.postcode === "CM3 2JT");
    expect(birkdale?.answer.basis).toBe("All premises");
    expect(birkdale?.answer.snapshot).toBe("2026-01");
    // The filed answer has no full-fibre or max-speed field — Ofcom
    // does not publish them at postcode level (gap G6).
    expect(JSON.stringify(birkdale?.answer)).not.toMatch(/full_fibre|max_speed/);
  });

  it("derives the release from the real all-premises file names", () => {
    const release = releaseFromNames([
      "202601_fixed_pc_coverage_r2_CM.csv",
      "202601_fixed_pc_coverage_r2_E.csv",
    ]) as { snapshot: string; revision: string; sourceDate: string };
    expect(release.snapshot).toBe("2026-01");
    expect(release.revision).toBe("r2");
    expect(release.sourceDate).toBe("2026-01-01");
  });

  it("matches the all-premises postcode files at any depth, never the residential series", () => {
    const allPremises =
      "202601_fixed_broadband_coverage_and_full_fibre_take-up (v2)/" +
      "202601_fixed_pc_coverage/postcode_files_r2/202601_fixed_pc_coverage_r2_CM.csv";
    const residential =
      "202601_fixed_broadband_coverage_and_full_fibre_take-up (v2)/" +
      "202601_fixed_pc_coverage/postcode_res_files_r1/202601_fixed_pc_coverage_res_r1_CM.csv";
    expect(POSTCODE_FILE.test(allPremises)).toBe(true);
    expect(POSTCODE_FILE.test("202601_fixed_pc_coverage_r2_CM.csv")).toBe(true);
    expect(POSTCODE_FILE.test(residential)).toBe(false);
    expect(POSTCODE_FILE.test("202601_fixed_pc_coverage_res_r1_CM.csv")).toBe(false);
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

  it("accepts a row whose speed bands sum below 100 (the shortfall is the unclassified share)", () => {
    // Bands 1,2,3,4,20,58.9 sum to 88.9 — legitimate per Ofcom's
    // "About this data" (unmatched / zero-predicted-speed premises
    // are in no band).
    const row = `${HEADER}\n${ROW.replace(",20,70", ",20,58.9")}\n`;
    const rows = parsePostcodeCsv(row, RELEASE) as {
      answer: { speed_band_pct: Record<string, number> };
    }[];
    expect(rows).toHaveLength(1);
    expect(Object.values(rows[0].answer.speed_band_pct).reduce((a, b) => a + b, 0)).toBeCloseTo(
      88.9,
      5,
    );
  });

  it("accepts a row whose speed bands are all zero (no matched premises)", () => {
    const zeroRow = "AB12CD,AB1 2CD,AB,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0";
    const rows = parsePostcodeCsv(`${HEADER}\n${zeroRow}\n`, RELEASE) as {
      answer: { speed_band_pct: Record<string, number> };
    }[];
    expect(rows).toHaveLength(1);
    expect(Object.values(rows[0].answer.speed_band_pct).every((v) => v === 0)).toBe(true);
  });

  it("refuses a row whose speed bands sum over 100", () => {
    const broken = `${HEADER}\n${ROW.replace(",20,70", ",20,80")}\n`;
    expect(() => parsePostcodeCsv(broken, RELEASE)).toThrow(/over 100/);
  });

  it("refuses a single speed band above 100", () => {
    const broken = `${HEADER}\n${ROW.replace(",20,70", ",20,101")}\n`;
    expect(() => parsePostcodeCsv(broken, RELEASE)).toThrow(/not a percentage/);
  });
});

describe("filing — the answers pattern (guard-asserted shape)", () => {
  it("stages, merges with UPDATE postcode_cache SET answers, sweeps stale keys", async () => {
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
    const stageAt = statements.findIndex((s) =>
      /CREATE TABLE IF NOT EXISTS broadband_stage/.test(s),
    );
    expect(beginAt).toBeGreaterThanOrEqual(0);
    expect(stageAt).toBeGreaterThan(beginAt);
    expect(
      statements.some(
        (s) =>
          /INSERT INTO broadband_stage/.test(s) && /ON CONFLICT \(postcode\) DO NOTHING/.test(s),
      ),
    ).toBe(true);
    expect(statements.some((s) => /UPDATE postcode_cache SET answers/.test(s))).toBe(true);
    // BUG-191: no single transaction spans the filing — staging,
    // merging and the sweep each commit separately (the mock's
    // empty scan ends the sweep before its delete can fire; the
    // delete itself is proven against the stateful fake in
    // load-broadband-streaming.test.ts).
    expect(statements.filter((s) => s === "BEGIN").length).toBeGreaterThanOrEqual(3);
    expect(statements.filter((s) => s === "COMMIT").length).toBeGreaterThanOrEqual(3);
    expect(statements.some((s) => /SELECT postcode FROM postcode_cache/.test(s))).toBe(true);
    // BUG-368: the stage is persistent now, so the run ends by
    // emptying it (DELETE), not dropping it — the TEMP table's
    // DROP is gone, and the next run starts from an empty stage.
    expect(statements.at(-1)).toMatch(/DELETE FROM broadband_stage/);
  });
});
