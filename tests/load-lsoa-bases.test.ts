import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GOLDEN,
  LSOA_COUNT,
  SOURCE_DATE,
  buildRows,
  fileLsoaBases,
  goldenChecks,
  loadLsoaBaseRows,
  parseLsoaCsv,
  BASE_DATASETS,
} from "../loaders/load-lsoa-bases.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// LSOA Census base totals loader (plan step M5.16, gap
// G5), tested against the fixture in tests/fixtures/
// lsoa-bases — three LSOA rows cut verbatim from the live
// bulk files at the build's first pull (13 Nov 2026; see
// the fixture README). What is pinned: the golden totals
// exactly, the total-column header contract, the
// all-or-nothing build, the filer's schema contract and
// statement order, and the runner's static-class
// registration.

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/lsoa-bases");

type BaseRow = {
  lsoaCode: string;
  lsoaName: string;
  residents: number;
  households: number;
};

async function fixtureRows(): Promise<BaseRow[]> {
  const { rows } = await loadLsoaBaseRows({ kind: "dir", dir: FIXTURE_DIR });
  return rows as BaseRow[];
}

describe("the fixture load", () => {
  it("builds exactly the three golden LSOAs with their measured totals", async () => {
    const rows = await fixtureRows();
    expect(rows).toHaveLength(3);
    const byCode = new Map(rows.map((r) => [r.lsoaCode, r]));
    expect(byCode.get("E01021395")).toMatchObject({
      lsoaName: "Braintree 018C",
      residents: 1489,
      households: 625,
    });
    expect(byCode.get("E01003511")).toMatchObject({
      lsoaName: "Newham 036A",
      residents: 1923,
      households: 671,
    });
    expect(byCode.get("E01030396")).toMatchObject({
      lsoaName: "Epsom and Ewell 010D",
      residents: 2487,
      households: 852,
    });
    expect(goldenChecks(rows, { full: false })).toEqual([]);
  });

  it("the golden registry and the fixture agree, and the national count is the published 35,672", () => {
    expect(Object.keys(GOLDEN)).toHaveLength(3);
    expect(LSOA_COUNT).toBe(35672);
    expect(SOURCE_DATE).toBe("2021-03-21");
    expect(BASE_DATASETS.map((d) => d.code)).toEqual(["ts021", "ts054"]);
  });
});

describe("the header contract and the all-or-nothing build", () => {
  const ts021 = BASE_DATASETS[0] as never;

  it("a renamed Total column fails the parse, naming the dataset", () => {
    const text = readFileSync(join(FIXTURE_DIR, "census2021-ts021-lsoa.csv"), "utf8");
    const renamed = text.replace("Total: All usual residents", "Total: All residents");
    expect(() => parseLsoaCsv(renamed, ts021)).toThrow(/ts021/);
  });

  it("a missing dataset fails the build — nothing partial is ever built", () => {
    const parsed = new Map();
    parsed.set(
      "ts021",
      parseLsoaCsv(
        readFileSync(join(FIXTURE_DIR, "census2021-ts021-lsoa.csv"), "utf8"),
        BASE_DATASETS[0] as never,
      ),
    );
    expect(() => buildRows(parsed)).toThrow(/both base datasets/);
  });

  it("golden checks catch a tampered total", async () => {
    const rows = await fixtureRows();
    const tampered = rows.map((r) => (r.lsoaCode === "E01021395" ? { ...r, residents: 1490 } : r));
    const failures = goldenChecks(tampered as never, { full: false });
    expect(failures.some((f) => f.includes("Braintree 018C"))).toBe(true);
  });
});

describe("filing — statement order and the schema contract", () => {
  function recordingPool(failOn?: string) {
    const statements: string[] = [];
    const calls: { sql: string; params: unknown[] }[] = [];
    let released = false;
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const head = sql.trim().replace(/\s+/g, " ");
        statements.push(head);
        calls.push({ sql: head, params: [...params] });
        if (failOn && head.startsWith(failOn)) throw new Error(`forced failure: ${failOn}`);
        return { rows: [], rowCount: 0 };
      },
      release() {
        released = true;
      },
    };
    return { statements, calls, released: () => released, pool: { connect: async () => client } };
  }

  it("stages and swaps inside one transaction — BEGIN before the stage create, COMMIT last", async () => {
    const rows = await fixtureRows();
    const rec = recordingPool();
    await fileLsoaBases(rec.pool as never, rows, "2026-11-13T00:00:00.000Z");
    const at = (prefix: string) => rec.statements.findIndex((s) => s.startsWith(prefix));
    expect(rec.statements[0]).toBe("BEGIN");
    expect(at("CREATE TEMP TABLE lsoa_bases_stage")).toBeGreaterThan(0);
    expect(at("INSERT INTO lsoa_bases_stage")).toBeGreaterThan(
      at("CREATE TEMP TABLE lsoa_bases_stage"),
    );
    expect(at("DELETE FROM lsoa_bases")).toBeGreaterThan(at("INSERT INTO lsoa_bases_stage"));
    expect(at("INSERT INTO lsoa_bases (")).toBeGreaterThan(at("DELETE FROM lsoa_bases"));
    expect(rec.statements.at(-1)).toBe("COMMIT");
    expect(rec.released()).toBe(true);
  });

  it("a failure mid-filing rolls back and still releases the client", async () => {
    const rows = await fixtureRows();
    const rec = recordingPool("INSERT INTO lsoa_bases_stage");
    await expect(
      fileLsoaBases(rec.pool as never, rows, "2026-11-13T00:00:00.000Z"),
    ).rejects.toThrow("forced failure");
    expect(rec.statements).toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
    expect(rec.released()).toBe(true);
  });

  it("migration 0013 defines lsoa_bases with the filing shape, and the filer names only its columns", async () => {
    const migration = readFileSync(
      join(process.cwd(), "db/migrations/0013_benefits_stats.sql"),
      "utf8",
    );
    expect(migration).toContain("CREATE TABLE lsoa_bases");
    expect(migration).toContain("lsoa_code text PRIMARY KEY");
    const rows = await fixtureRows();
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql);
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    await fileLsoaBases({ connect: async () => client } as never, rows, "2026-11-13T00:00:00.000Z");
    const liveInserts = statements.filter((s) => /INSERT INTO lsoa_bases \(/.test(s));
    expect(liveInserts).toHaveLength(1);
    const columns = /INSERT INTO lsoa_bases \(([^)]*)\)/
      .exec(liveInserts[0])![1]
      .split(",")
      .map((c) => c.trim());
    expect(columns).toEqual([
      "lsoa_code",
      "lsoa_name",
      "residents",
      "households",
      "source_name",
      "source_date",
      "loaded_at",
    ]);
    // The DDL itself, parsed from every migration, carries
    // exactly these columns for the table.
    const dir = join(process.cwd(), "db", "migrations");
    const ddl = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    for (const col of columns) expect(ddl).toContain(col);
  });
});

describe("the runner's registration", () => {
  it("load-lsoa-bases is static-class, directory-free and fixture-backed", () => {
    const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
    expect(runner).toContain(
      '"load-lsoa-bases": "Area sizes — Census residents and households by small area"',
    );
    expect(runner).toContain('runAndLog("load-lsoa-bases", ["--file", fx("lsoa-bases")])');
    // M5.15: registration is the schedule-registry entry now —
    // static class, 30-minute timeout; the class thresholds
    // themselves are pinned in tests/run-loaders.test.ts.
    expect(runner).toContain('{ item: "load-lsoa-bases", cadence: "static", timeoutMinutes: 30 }');
    const directoryFree = runner.slice(
      runner.indexOf("const DIRECTORY_FREE"),
      runner.indexOf("]);", runner.indexOf("const DIRECTORY_FREE")),
    );
    expect(directoryFree).toContain('"load-lsoa-bases"');
  });
});

describe("progress — BUG-265", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };

  function recordingPool(failOn?: string) {
    const statements: string[] = [];
    let released = false;
    const client = {
      async query(sql: string) {
        const head = sql.trim().replace(/\s+/g, " ");
        statements.push(head);
        if (failOn && head.startsWith(failOn)) throw new Error(`forced failure: ${failOn}`);
        return { rows: [], rowCount: 0 };
      },
      release() {
        released = true;
      },
    };
    return { statements, released: () => released, pool: { connect: async () => client } };
  }

  it("logs the stage flushes with a real percentage and closes the tally", async () => {
    const rows = await fixtureRows();
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-lsoa-bases", log });
    const rec = recordingPool();
    await fileLsoaBases(rec.pool as never, rows, "2026-11-13T00:00:00.000Z", { progress });
    expect(lines.some((l) => /progress · stage 1\/1 flushes \(100%\)$/.test(l))).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
    expect(rec.statements.at(-1)).toBe("COMMIT");
  });

  it("names a filing failure with the filed count and the resume point", async () => {
    const rows = await fixtureRows();
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-lsoa-bases", log });
    const rec = recordingPool("INSERT INTO lsoa_bases_stage");
    await expect(
      fileLsoaBases(rec.pool as never, rows, "2026-11-13T00:00:00.000Z", { progress }),
    ).rejects.toThrow("forced failure");
    expect(
      lines.some((l) =>
        /failed · file · filed 0 of 3 · forced failure: INSERT INTO lsoa_bases_stage · resume from re-run from scratch/.test(
          l,
        ),
      ),
    ).toBe(true);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pool/client: the staged rows, the live table and the
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
  const makeRows = (n: number): BaseRow[] =>
    Array.from({ length: n }, (_, i) => ({
      lsoaCode: `E010${String(10000 + i)}`,
      lsoaName: `Test LSOA ${i}`,
      residents: 1000 + i,
      households: 400 + i,
    }));
  function createFakePool() {
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
    const client = {
      async query(sql: string, params: unknown[] = []) {
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
        if (/CREATE TABLE IF NOT EXISTS lsoa_bases_stage/.test(text)) return { rows: [] };
        if (/INSERT INTO lsoa_bases_stage/.test(text)) {
          insertCalls += 1;
          if (failAfterInserts !== null && insertCalls > failAfterInserts)
            throw new Error("simulated kill: the database connection dropped mid-insert");
          for (let r = 0; r < params.length / 7; r++) {
            const b = r * 7;
            staged.push({ lsoaCode: params[b] as string, seq: params[b + 6] as number });
          }
          return { rows: [], rowCount: params.length / 7 };
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
        if (/DELETE FROM lsoa_bases_stage WHERE seq >=/.test(text)) {
          staged = staged.filter((r) => r.seq < (params[0] as number));
          return { rows: [], rowCount: 0 };
        }
        if (/DELETE FROM lsoa_bases_stage/.test(text)) {
          staged = [];
          return { rows: [] };
        }
        if (/SELECT count\(\*\)::int AS n FROM lsoa_bases_stage/.test(text))
          return { rows: [{ n: staged.length }] };
        if (/DELETE FROM lsoa_bases/.test(text)) {
          live = [];
          return { rows: [] };
        }
        if (/INSERT INTO lsoa_bases/.test(text)) {
          live = [...staged];
          return { rows: [] };
        }
        throw new Error(`fake client: unhandled SQL: ${sql}`);
      },
      release() {},
    };
    return {
      pool: { connect: async () => client },
      staged: () => staged,
      live: () => live,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        failAfterInserts = n;
      },
    };
  }
  type FakePool = ReturnType<typeof createFakePool>;
  async function runFiling(
    fake: FakePool,
    rows: BaseRow[],
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-lsoa-bases",
      log: (line: string) => captured.push(line),
    });
    await fileLsoaBases(fake.pool as never, rows, "2026-11-13T00:00:00.000Z", {
      progress,
      resume: { restart },
    });
    return captured;
  }

  it("kill mid-staging resumes and files every area exactly once", async () => {
    const fake = createFakePool();
    const rows = makeRows(1200);
    // Kill after two 500-row flushes: 1,000 rows staged, the
    // checkpoint at 1,000, the third flush never landed.
    const killLines: string[] = [];
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows, { lines: killLines })).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);
    expect(fake.checkpoints.get("load-lsoa-bases")?.next_start_index).toBe(1000);
    expect(
      killLines.some((l) =>
        /checkpoint 1,000\/1,200 LSOAs \(83%\) · staged 1,000 · resume from 1,000/.test(l),
      ),
    ).toBe(true);

    fake.setFailAfterInserts(null);
    const lines = await runFiling(fake, rows);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 1,000 rows staged · edition 2021-03-21 · resume from 1,000/.test(
          l,
        ),
      ),
    ).toBe(true);
    expect(fake.live().map((r) => r.lsoaCode)).toEqual(rows.map((r) => r.lsoaCode));
    // The swap cleared staging and the checkpoint together.
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-lsoa-bases")).toBeUndefined();
  });

  it("a checkpoint for another edition is discarded and the run starts from zero", async () => {
    const fake = createFakePool();
    const rows = makeRows(1200);
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);

    // The census edition never changes between runs of the
    // same census, so simulate the republication by editing
    // the stored checkpoint's edition directly.
    const cp = fake.checkpoints.get("load-lsoa-bases");
    expect(cp).toBeDefined();
    if (!cp) throw new Error("expected a checkpoint to exist");
    fake.checkpoints.set("load-lsoa-bases", { ...cp, edition: "2099-01-01" });
    fake.setFailAfterInserts(null);
    const lines = await runFiling(fake, rows);
    expect(lines.some((l) => /discarding stale checkpoint · edition changed/.test(l))).toBe(true);
    expect(fake.live().map((r) => r.lsoaCode)).toEqual(rows.map((r) => r.lsoaCode));
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-lsoa-bases")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakePool();
    const rows = makeRows(1200);
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);

    fake.setFailAfterInserts(null);
    await runFiling(fake, rows, { restart: true });
    expect(fake.live().map((r) => r.lsoaCode)).toEqual(rows.map((r) => r.lsoaCode));
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-lsoa-bases")).toBeUndefined();
  });
});
