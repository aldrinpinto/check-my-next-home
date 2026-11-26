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

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged rows, the live table and the
  // loader_checkpoint row as arrays, with just enough SQL to
  // run the filer.
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  type StagedRow = { lsoaCode: string; seq: number };
  const makeRows = (n: number): ImdRow[] =>
    Array.from({ length: n }, (_, i) => ({
      lsoaCode: `E010${String(10000 + i)}`,
      lsoaName: `Test LSOA ${i}`,
      stats: { score: 10 + i * 0.01, rank: 1000 + i, domains: { income: 5 } },
      imdDecile: 5,
      imdSummary: "Among the more deprived 50 percent of areas in England",
    }));
  function createFakeClient() {
    let staged: StagedRow[] = [];
    let live: StagedRow[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let snapshot: {
      staged: StagedRow[];
      live: StagedRow[];
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = { staged: [...staged], live: [...live], checkpoints: new Map(checkpoints) };
        return { rows: [] };
      }
      if (text === "COMMIT") {
        snapshot = null;
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        if (snapshot) {
          staged = snapshot.staged;
          live = snapshot.live;
          checkpoints.clear();
          for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS imd_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO imd_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 8; r++) {
          const b = r * 8;
          staged.push({ lsoaCode: params[b] as string, seq: params[b + 7] as number });
        }
        return { rows: [], rowCount: params.length / 8 };
      }
      if (
        /SELECT loader, edition, expected, next_start_index, read_count, filed_count, state, updated_at/.test(
          text,
        )
      ) {
        const row = checkpoints.get(params[0] as string);
        return { rows: row ? [row] : [] };
      }
      if (/INSERT INTO loader_checkpoint/.test(text)) {
        checkpoints.set(params[0] as string, {
          loader: params[0] as string,
          edition: params[1] as string,
          expected: params[2] as number | null,
          next_start_index: params[3] as number,
          read_count: params[4] as number,
          filed_count: params[5] as number,
          state: JSON.parse(params[6] as string) as Record<string, unknown>,
        });
        return { rows: [] };
      }
      if (/DELETE FROM loader_checkpoint WHERE loader =/.test(text)) {
        checkpoints.delete(params[0] as string);
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n, coalesce\(sum\(seq\)/.test(text)) {
        return {
          rows: [
            {
              n: staged.length,
              s: staged.reduce((a, r) => a + r.seq, 0),
              m: staged.length ? Math.max(...staged.map((r) => r.seq)) : 0,
            },
          ],
        };
      }
      if (/DELETE FROM imd_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM imd_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM imd_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/DELETE FROM neighbourhood_stats/.test(text)) {
        live = [];
        return { rows: [] };
      }
      if (/INSERT INTO neighbourhood_stats/.test(text)) {
        live = [...staged];
        return { rows: [] };
      }
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: () => staged,
      live: () => live,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        failAfterInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  async function runFiling(
    fake: FakeClient,
    rows: ImdRow[],
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-imd",
      log: (line: string) => captured.push(line),
    });
    await fileImd(fake as never, rows as never, { progress, resume: { restart } });
    return captured;
  }

  it("kill mid-staging resumes and files every LSOA exactly once", async () => {
    const fake = createFakeClient();
    const rows = makeRows(1200);
    // Kill after two 500-row chunks: 1,000 rows staged, the
    // checkpoint at 1,000, the third chunk never landed.
    const killLines: string[] = [];
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows, { lines: killLines })).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);
    expect(fake.checkpoints.get("load-imd")?.next_start_index).toBe(1000);
    expect(
      killLines.some((l) =>
        /checkpoint 1,000\/1,200 LSOAs \(83%\) · staged 1,000 · resume from 1,000/.test(l),
      ),
    ).toBe(true);

    fake.setFailAfterInserts(null);
    const lines = await runFiling(fake, rows);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 1,000 rows staged · edition 2025-10-30 · resume from 1,000/.test(
          l,
        ),
      ),
    ).toBe(true);
    expect(fake.live().map((r) => r.lsoaCode)).toEqual(rows.map((r) => r.lsoaCode));
    // The swap cleared staging and the checkpoint together.
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-imd")).toBeUndefined();
  });

  it("a checkpoint for another edition is discarded and the run starts from zero", async () => {
    const fake = createFakeClient();
    const rows = makeRows(1200);
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);

    // The IoD2025 edition never changes between runs of the
    // same release, so simulate the republication by editing
    // the stored checkpoint's edition directly.
    const cp = fake.checkpoints.get("load-imd");
    expect(cp).toBeDefined();
    if (!cp) throw new Error("expected a checkpoint to exist");
    fake.checkpoints.set("load-imd", { ...cp, edition: "2099-01-01" });
    fake.setFailAfterInserts(null);
    const lines = await runFiling(fake, rows);
    expect(lines.some((l) => /discarding stale checkpoint · edition changed/.test(l))).toBe(true);
    expect(fake.live().map((r) => r.lsoaCode)).toEqual(rows.map((r) => r.lsoaCode));
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-imd")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakeClient();
    const rows = makeRows(1200);
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);

    fake.setFailAfterInserts(null);
    await runFiling(fake, rows, { restart: true });
    expect(fake.live().map((r) => r.lsoaCode)).toEqual(rows.map((r) => r.lsoaCode));
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-imd")).toBeUndefined();
  });
});
