import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CENSUS_GOLDEN_TOTALS,
  censusCountColumns,
  censusGoldenTotals,
  probeNomisCensus,
} from "../loaders/canary.mjs";
import { dueDecision, STATIC_THRESHOLD_DAYS } from "../loaders/run-loaders.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";
import {
  AGE_BANDS,
  DATASETS,
  GOLDEN,
  buildRows,
  fileCensus,
  goldenChecks,
  loadCensusRows,
  medianAge,
  parseDatasetCsv,
} from "../loaders/load-census.mjs";

// Census 2021 loader (plan step M5.8), tested against the
// fixture in tests/fixtures/census — three MSOA rows cut
// verbatim from the live bulk files during the build's first
// act (the live pull, 13 Nov 2026; see the fixture README).
// Braintree 018 (E02004463) and Newham 036 (E02000749) match
// the founder-approved sample reports figure for figure;
// Epsom and Ewell 010 (E02006837) is the first-pull
// measurement the prep said would fix at first load.
//
// What is pinned here: the published category shapes (the
// header contract), the golden counts and the filed
// social-rented facts, the median-age computation, the
// filer's schema contract and statement order (the M5.6
// fix-2 pattern), the all-or-nothing build, the runner's
// static-class due-ness, and the canary's arms with the
// network stubbed.

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/census");
const BIRKDALE = "E02004463";
const NEWHAM = "E02000749";
const EPSOM = "E02006837";

// The loader is plain JS; its row shape is pinned here so the
// assertions below are typed against the filed structure.
type CensusRow = {
  msoaCode: string;
  msoaName: string;
  stats: {
    ts007a: { total: number; bands: Record<string, number> };
    ts007: { total: number; years: number[] };
    ts021: {
      total: number;
      groups: Record<string, number>;
      categories: Record<string, number>;
    };
    ts030: { total: number; categories: Record<string, number> };
    ts044: { total: number; categories: Record<string, number> };
    ts052: { total: number; categories: Record<string, number> };
    ts054: {
      total: number;
      categories: Record<string, number>;
      social_rented: number;
    };
  };
};

type GoldenEntry = {
  name: string;
  totals: Record<string, number>;
  socialRented: number;
  medianAge?: number;
  ts021: { groups: Record<string, number>; categories: Record<string, number> };
};

const goldenFor = (code: string): GoldenEntry => (GOLDEN as Record<string, GoldenEntry>)[code];

function fixtureText(code: string): string {
  return readFileSync(join(FIXTURE_DIR, `census2021-${code}-msoa.csv`), "utf8");
}

async function fixtureRows(): Promise<CensusRow[]> {
  const { rows } = await loadCensusRows({ kind: "dir", dir: FIXTURE_DIR });
  return rows as CensusRow[];
}

describe("the fixture load", () => {
  it("builds exactly the three golden MSOAs, keyed by code", async () => {
    const rows = await fixtureRows();
    expect(new Set(rows.map((r) => r.msoaCode))).toEqual(new Set([BIRKDALE, NEWHAM, EPSOM]));
    expect(rows.find((r) => r.msoaCode === BIRKDALE)?.msoaName).toBe("Braintree 018");
    expect(rows.find((r) => r.msoaCode === EPSOM)?.msoaName).toBe("Epsom and Ewell 010");
  });

  it("passes the loader's own golden checks", async () => {
    const rows = await fixtureRows();
    expect(goldenChecks(rows, { full: false })).toEqual([]);
  });

  it("files counts only — every filed value is a non-negative integer", async () => {
    const rows = await fixtureRows();
    const walk = (v: unknown): void => {
      if (typeof v === "number") {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    for (const row of rows) walk(row.stats);
  });
});

describe("category shapes — the published structures, unmerged", () => {
  it("TS007A carries its total plus the 18 published bands (19 count columns)", async () => {
    const rows = await fixtureRows();
    const stats = rows[0].stats.ts007a;
    expect(Object.keys(stats.bands)).toEqual([...AGE_BANDS]);
    expect(AGE_BANDS).toHaveLength(18);
    expect(censusCountColumns(fixtureText("ts007a"))).toHaveLength(19);
  });

  it("TS007 carries 101 single years of age (plus a total)", async () => {
    const rows = await fixtureRows();
    for (const row of rows) {
      expect(row.stats.ts007.years).toHaveLength(101);
      expect(row.stats.ts007.years.reduce((a, b) => a + b, 0)).toBe(row.stats.ts007.total);
    }
    expect(censusCountColumns(fixtureText("ts007"))).toHaveLength(113);
  });

  it("TS021 carries 25 count columns: total, 5 groups, 19 detailed categories", async () => {
    const rows = await fixtureRows();
    const stats = rows[0].stats.ts021;
    expect(Object.keys(stats.groups)).toHaveLength(5);
    expect(Object.keys(stats.categories)).toHaveLength(19);
    expect(censusCountColumns(fixtureText("ts021"))).toHaveLength(25);
  });

  it("TS030 / TS044 / TS052 / TS054 carry 10 / 9 / 6 / 13 count columns", async () => {
    const rows = await fixtureRows();
    expect(Object.keys(rows[0].stats.ts030.categories)).toHaveLength(9);
    expect(Object.keys(rows[0].stats.ts044.categories)).toHaveLength(8);
    expect(Object.keys(rows[0].stats.ts052.categories)).toHaveLength(5);
    expect(Object.keys(rows[0].stats.ts054.categories)).toHaveLength(12);
    expect(censusCountColumns(fixtureText("ts030"))).toHaveLength(10);
    expect(censusCountColumns(fixtureText("ts044"))).toHaveLength(9);
    expect(censusCountColumns(fixtureText("ts052"))).toHaveLength(6);
    expect(censusCountColumns(fixtureText("ts054"))).toHaveLength(13);
  });

  it("the dataset registry is the seven ruled datasets", () => {
    expect(DATASETS.map((d) => d.code)).toEqual([
      "ts007a",
      "ts007",
      "ts021",
      "ts030",
      "ts044",
      "ts052",
      "ts054",
    ]);
  });
});

describe("golden figures — the approved samples, figure for figure", () => {
  it("TS021 totals and vectors match for all three MSOAs", async () => {
    const rows = await fixtureRows();
    for (const row of rows) {
      const golden = goldenFor(row.msoaCode);
      expect(row.stats.ts021.total).toBe(golden.totals.ts021);
      expect(row.stats.ts021.groups).toEqual(golden.ts021.groups);
      expect(row.stats.ts021.categories).toEqual(golden.ts021.categories);
      // The five groups sum exactly to the published total.
      expect(Object.values(golden.ts021.groups).reduce((a, b) => a + b, 0)).toBe(
        golden.totals.ts021,
      );
    }
  });

  it("per-table totals differ between tables — each table is checked on its own total", async () => {
    const rows = await fixtureRows();
    const birkdale = rows.find((r) => r.msoaCode === BIRKDALE)!;
    expect(birkdale.stats.ts007a.total).toBe(8141);
    expect(birkdale.stats.ts007.total).toBe(8136);
    expect(birkdale.stats.ts021.total).toBe(8138);
    expect(birkdale.stats.ts054.total).toBe(3397);
  });

  it("social rented files as its own fact: 469 / 1631 / 241", async () => {
    const rows = await fixtureRows();
    const byCode = new Map(rows.map((r) => [r.msoaCode, r]));
    expect(byCode.get(BIRKDALE)?.stats.ts054.social_rented).toBe(469);
    expect(byCode.get(NEWHAM)?.stats.ts054.social_rented).toBe(1631);
    expect(byCode.get(EPSOM)?.stats.ts054.social_rented).toBe(241);
    // And it is the sum of its two published parts, as filed.
    for (const row of rows) {
      const cats = row.stats.ts054.categories;
      expect(
        cats["Social rented: Rents from council or Local Authority"] +
          cats["Social rented: Other social rented"],
      ).toBe(row.stats.ts054.social_rented);
    }
  });

  it("percentages computed at serve time reproduce the samples' rounding", async () => {
    const rows = await fixtureRows();
    const birkdale = rows.find((r) => r.msoaCode === BIRKDALE)!;
    const british =
      birkdale.stats.ts021.categories["White: English, Welsh, Scottish, Northern Irish or British"];
    expect(Math.round((british / birkdale.stats.ts021.total) * 1000) / 10).toBe(92.5);
    const newham = rows.find((r) => r.msoaCode === NEWHAM)!;
    expect(
      Math.round((newham.stats.ts054.social_rented / newham.stats.ts054.total) * 1000) / 10,
    ).toBe(49.0);
  });
});

describe("median age — computed from the filed single years, never filed", () => {
  it("a synthetic vector with a known median interpolates inside the crossing year", () => {
    // 100 people: 40 aged exactly 20, then 10 each at 30..35
    // would put the median at 30 exactly; the vector below
    // spreads the second half so the crossing (person 50)
    // falls inside age 32: 40 + 4 + 4 = 48 before 32, 4 at 32
    // → median = 32 + (50 − 48) / 4 = 32.5.
    const years = new Array(101).fill(0);
    years[20] = 40;
    years[30] = 4;
    years[31] = 4;
    years[32] = 4;
    for (let a = 33; a <= 44; a++) years[a] = 4;
    expect(years.reduce((x, y) => x + y, 0)).toBe(100);
    expect(medianAge(years)).toBe(32.5);
  });

  it("Birkdale's filed vector computes the approved sample's printed median, 46.5", async () => {
    // The fixture row is Birkdale's real published TS007 row
    // (cut verbatim from the bulk file in the build's live
    // pull), so this is a measurement, not a fabrication.
    // medianAge returns the raw interpolated value (46.450…);
    // the sample's printed figure is that value at 1dp.
    const rows = await fixtureRows();
    const birkdale = rows.find((r) => r.msoaCode === BIRKDALE)!;
    expect(Math.round(medianAge(birkdale.stats.ts007.years) * 10) / 10).toBe(46.5);
  });

  it("an empty vector has no median — the computation refuses it", () => {
    expect(() => medianAge(new Array(101).fill(0))).toThrow(/non-empty/);
    expect(() => medianAge([])).toThrow(/non-empty/);
  });
});

describe("the header contract and the all-or-nothing build", () => {
  it("a renamed category fails the parse, naming the dataset", () => {
    const ts030 = DATASETS.find((d) => d.code === "ts030")!;
    const renamed = fixtureText("ts030").replace("Christian", "Christiann");
    expect(() => parseDatasetCsv(renamed, ts030)).toThrow(/ts030/);
  });

  it("an unexpected extra category fails the parse too", () => {
    const ts052 = DATASETS.find((d) => d.code === "ts052")!;
    const widened = fixtureText("ts052")
      .split("\n")
      .map((line, i) => {
        if (line.trim() === "") return line;
        return i === 0
          ? `${line},Occupancy rating for bedrooms: Occupancy rating of bedrooms: +3 or more`
          : `${line},0`;
      })
      .join("\n");
    expect(() => parseDatasetCsv(widened, ts052)).toThrow(/unexpected/);
  });

  it("a missing dataset fails the build — nothing partial is ever built", () => {
    const parsed = new Map();
    for (const dataset of DATASETS) {
      if (dataset.code === "ts044") continue;
      parsed.set(dataset.code, parseDatasetCsv(fixtureText(dataset.code), dataset));
    }
    expect(() => buildRows(parsed)).toThrow(/ts044/);
  });

  it("golden checks catch a tampered count", async () => {
    const rows = await fixtureRows();
    const tampered = rows.map((r) =>
      r.msoaCode === BIRKDALE
        ? { ...r, stats: { ...r.stats, ts021: { ...r.stats.ts021, total: 8139 } } }
        : r,
    );
    const failures = goldenChecks(tampered as never, { full: false });
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.some((f) => f.includes("Braintree 018"))).toBe(true);
  });
});

describe("filing — statement order (the M5.6 fix-1 pattern)", () => {
  function recordingPool(failOn?: string) {
    const statements: string[] = [];
    const calls: { sql: string; params: unknown[] }[] = [];
    let released = false;
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const head = sql.trim().replace(/\s+/g, " ");
        statements.push(head);
        // Snapshot the params: the filer reuses and empties
        // its batch array after each flush, so a stored
        // reference would read as empty by assertion time.
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
    await fileCensus(rec.pool as never, rows, "2026-11-13T00:00:00.000Z");
    const at = (prefix: string) => rec.statements.findIndex((s) => s.startsWith(prefix));
    expect(rec.statements[0]).toBe("BEGIN");
    expect(at("CREATE TEMP TABLE census_stage")).toBeGreaterThan(0);
    expect(at("INSERT INTO census_stage")).toBeGreaterThan(at("CREATE TEMP TABLE census_stage"));
    expect(at("DELETE FROM census_stats")).toBeGreaterThan(at("INSERT INTO census_stage"));
    expect(at("INSERT INTO census_stats")).toBeGreaterThan(at("DELETE FROM census_stats"));
    expect(rec.statements.at(-1)).toBe("COMMIT");
    expect(rec.released()).toBe(true);
  });

  it("the staged Birkdale row carries the filed facts the practice run asserts", async () => {
    const rows = await fixtureRows();
    const rec = recordingPool();
    await fileCensus(rec.pool as never, rows, "2026-11-13T00:00:00.000Z");
    const staged = rec.calls.filter((c) => c.sql.startsWith("INSERT INTO census_stage"));
    expect(staged.length).toBeGreaterThan(0);
    // Staged inserts are batched: the params are consecutive
    // (code, name, stats, source_name, source_date) quintuples.
    const quintuples: unknown[][] = [];
    for (const call of staged)
      for (let i = 0; i < call.params.length; i += 5) quintuples.push(call.params.slice(i, i + 5));
    expect(quintuples).toHaveLength(3);
    const birkdale = quintuples.find((t) => t[0] === BIRKDALE)!;
    const stats = JSON.parse(birkdale[2] as string);
    expect(stats.ts021.total).toBe(8138);
    expect(stats.ts054.social_rented).toBe(469);
    expect(stats.ts007.years).toHaveLength(101);
  });

  it("a failure mid-filing rolls the transaction back and still releases the client", async () => {
    const rows = await fixtureRows();
    const rec = recordingPool("INSERT INTO census_stage");
    await expect(fileCensus(rec.pool as never, rows, "2026-11-13T00:00:00.000Z")).rejects.toThrow(
      "forced failure",
    );
    expect(rec.statements).toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
    expect(rec.released()).toBe(true);
  });
});

describe("filing — the schema contract (the M5.6 fix-2 pattern)", () => {
  // The order tests above pin statement ORDER, not names.
  // This block pins the names: census_stats' columns are
  // parsed from the migration files themselves (the proven
  // contract) and every column the filer issues is checked
  // against them. No Postgres needed.
  function liveTableColumns(table: string): Set<string> {
    const dir = join(process.cwd(), "db", "migrations");
    const cols = new Set<string>();
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".sql")) continue;
      const sql = readFileSync(join(dir, file), "utf8");
      const create = new RegExp(`CREATE TABLE ${table} \\(`).exec(sql);
      if (create) {
        let depth = 0;
        let end = -1;
        for (let i = create.index; i < sql.length; i++) {
          if (sql[i] === "(") depth++;
          else if (sql[i] === ")") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        const body = sql.slice(sql.indexOf("(", create.index) + 1, end);
        const parts: string[] = [];
        let d = 0;
        let cur = "";
        for (const ch of body) {
          if (ch === "(") d++;
          else if (ch === ")") d--;
          if (ch === "," && d === 0) {
            parts.push(cur);
            cur = "";
          } else cur += ch;
        }
        if (cur.trim() !== "") parts.push(cur);
        for (const part of parts) {
          const name = part.trim().split(/\s+/)[0];
          if (name && !/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)$/i.test(name)) cols.add(name);
        }
      }
      for (const alter of sql.matchAll(new RegExp(`ALTER TABLE ${table}([^;]*);`, "g"))) {
        for (const add of alter[1].matchAll(/ADD COLUMN (\w+)/g)) {
          cols.add(add[1]);
        }
      }
    }
    return cols;
  }

  it("migration 0011 defines census_stats with the prep's filing shape", () => {
    const cols = liveTableColumns("census_stats");
    expect([...cols].sort()).toEqual([
      "loaded_at",
      "msoa_code",
      "msoa_name",
      "source_date",
      "source_name",
      "stats",
    ]);
    const migration = readFileSync(
      join(process.cwd(), "db/migrations/0011_census_stats.sql"),
      "utf8",
    );
    expect(migration).toContain("msoa_code text PRIMARY KEY");
    expect(migration).toContain("stats jsonb NOT NULL");
  });

  it("every column the filer names exists in the DDL, and no generated column is targeted", async () => {
    const rows = await fixtureRows();
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql);
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    await fileCensus({ connect: async () => client } as never, rows, "2026-11-13T00:00:00.000Z");
    const ddl = liveTableColumns("census_stats");
    const liveInserts = statements.filter((s) => /INSERT INTO census_stats \(/.test(s));
    expect(liveInserts).toHaveLength(1);
    const columns = /INSERT INTO census_stats \(([^)]*)\)/
      .exec(liveInserts[0])![1]
      .split(",")
      .map((c) => c.trim());
    for (const col of columns) expect(ddl.has(col)).toBe(true);
    // census_stats defines no generated columns at all — the
    // database owns nothing here beyond the defaults, and the
    // filer must not name loaded_at's default away: it passes
    // the run's stamp explicitly, which the DDL allows.
    expect(columns).not.toContain("geom");
    expect(columns).not.toContain("id");
    // The stage table's columns are the filer's own five —
    // the row's three facts plus the source stamp the swap
    // carries into the live table.
    const stageInserts = statements.filter((s) => /INSERT INTO census_stage \(/.test(s));
    expect(stageInserts.length).toBeGreaterThan(0);
    for (const s of stageInserts) {
      const stageCols = /INSERT INTO census_stage \(([^)]*)\)/
        .exec(s)![1]
        .split(",")
        .map((c) => c.trim());
      expect(stageCols).toEqual(["msoa_code", "msoa_name", "stats", "source_name", "source_date"]);
    }
  });
});

describe("the runner's static class", () => {
  const now = new Date("2026-11-13T00:00:00Z");
  it("is due exactly once: never loaded is due, any past success is not", () => {
    expect(STATIC_THRESHOLD_DAYS).toBe(36500);
    expect(dueDecision(null, STATIC_THRESHOLD_DAYS, now).due).toBe(true);
    expect(dueDecision("2026-11-12T00:00:00Z", STATIC_THRESHOLD_DAYS, now).due).toBe(false);
    // Even a success decades old is not due again — a
    // republication is the canary's watch, and the re-file a
    // manual operator re-run.
    expect(dueDecision("1990-01-01T00:00:00Z", STATIC_THRESHOLD_DAYS, now).due).toBe(false);
  });

  it("the runner registers load-census as static, directory-free and fixture-backed", () => {
    const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
    expect(runner).toContain('"load-census": "Census 2021 — the area in numbers"');
    expect(runner).toContain('runAndLog("load-census", ["--file", fx("census")])');
    expect(runner).toContain("STATIC_THRESHOLD_DAYS");
    const directoryFree = runner.slice(
      runner.indexOf("const DIRECTORY_FREE"),
      runner.indexOf("]);", runner.indexOf("const DIRECTORY_FREE")),
    );
    expect(directoryFree).toContain('"load-census"');
  });
});

describe("the nomis-census canary arms (network stubbed)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("the golden arm reads the three totals exactly from the bulk shape", () => {
    const totals = censusGoldenTotals(fixtureText("ts021"), "Ethnic group: Total") as Record<
      string,
      number
    >;
    expect(totals).toEqual({ E02004463: 8138, E02000749: 9552, E02006837: 11787 });
    expect(totals).toEqual(CENSUS_GOLDEN_TOTALS);
  });

  it("a corrected table would be caught: one changed count breaks the exact match", () => {
    const corrected = fixtureText("ts021").replace(
      "Braintree 018,E02004463,8138",
      "Braintree 018,E02004463,8139",
    );
    const totals = censusGoldenTotals(corrected, "Ethnic group: Total") as Record<string, number>;
    expect(totals.E02004463).toBe(8139);
    expect(totals).not.toEqual(CENSUS_GOLDEN_TOTALS);
  });

  it("the shape arm sees TS021's 25 and TS054's 13 count columns and the Social rented subtotal", () => {
    expect(censusCountColumns(fixtureText("ts021"))).toHaveLength(25);
    const ts054 = censusCountColumns(fixtureText("ts054"));
    expect(ts054).toHaveLength(13);
    expect(ts054).toContain("Tenure of household: Social rented");
  });

  it("the availability arm fails loudly when a bulk zip stops answering", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 404,
      headers: { get: () => null },
    }));
    await expect(probeNomisCensus()).rejects.toThrow(/404/);
  });

  it("the probe is registered under its own name", () => {
    const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
    expect(canary).toContain('run("nomis-census", probeNomisCensus)');
  });
});

// BUG-265: the dataset pull and the filing carry the shared
// progress logger — a stage marker and a count per dataset,
// and a tally every 5 flushes filed.
describe("progress logging (BUG-265)", () => {
  it("reads the fixture datasets with one stage and one count line each", async () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-census",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const { rows } = await loadCensusRows({ kind: "dir", dir: FIXTURE_DIR }, { progress });
    expect(rows).toHaveLength(3);
    expect(lines).toHaveLength(14);
    expect(lines[0]).toMatch(/progress · reading ts007a — Age by five-year age bands$/);
    expect(lines[1]).toMatch(/progress · ts007a 3\/7,264 areas \(0%\)$/);
    expect(lines[13]).toMatch(/progress · ts054 3\/7,264 areas \(0%\)$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("files the fixture rows with a closing file line", async () => {
    const rows = await fixtureRows();
    const pool = {
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: () => {},
      }),
    };
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-census",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    await fileCensus(pool as never, rows, "2026-11-13T00:00:00.000Z", { progress });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/progress · file 1\/1 flushes \(100%\)$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });
});
