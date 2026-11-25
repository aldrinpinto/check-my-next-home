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
