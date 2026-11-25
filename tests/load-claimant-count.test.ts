import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimantLatestFacts, probeNomisClaimant } from "../loaders/canary.mjs";
import {
  GOLDEN,
  assembleClaimantRows,
  claimantUrl,
  fileClaimant,
  goldenChecks,
  loadClaimantRows,
  parseClaimantCsv,
  parseClaimantObservations,
} from "../loaders/load-claimant-count.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";
import { dueDecision } from "../loaders/run-loaders.mjs";

// Claimant Count loader (plan step M5.16), tested against
// the fixture in tests/fixtures/claimant-count — two
// verbatim Nomis API responses captured live at the build
// (13 Nov 2026): September 2026 (the prep-locked golden
// month) and August 2026 (the revised previous month).
// What is pinned: the golden figures exactly, the header
// contract, the page-split-safe assembly, the two-month
// filing shape, the filer's statement order and schema
// contract, the monthly due class, and the canary's arms
// with the network stubbed and the clock fixed (the
// freshness arm is calendar-relative, so an unfixed clock
// would make this suite a time bomb).

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/claimant-count");
const latestText = () => readFileSync(join(FIXTURE_DIR, "claimant-count-latest.csv"), "utf8");

type ClaimantRow = {
  lsoaCode: string;
  lsoaName: string;
  month: string;
  count: number;
  pct: number;
};

async function fixtureRows(): Promise<ClaimantRow[]> {
  const { rows } = await loadClaimantRows({ kind: "dir", dir: FIXTURE_DIR });
  return rows as ClaimantRow[];
}

describe("the fixture load — the prep-locked goldens, exactly", () => {
  it("files the golden month with the locked figures, and the revised month beside it", async () => {
    const rows = await fixtureRows();
    expect(rows).toHaveLength(6);
    const sep = new Map(rows.filter((r) => r.month === "2026-09").map((r) => [r.lsoaCode, r]));
    expect(sep.get("E01021395")).toMatchObject({ lsoaName: "Braintree 018C", count: 15, pct: 1.6 });
    expect(sep.get("E01003511")).toMatchObject({ lsoaName: "Newham 036A", count: 120, pct: 8.6 });
    expect(sep.get("E01030396")).toMatchObject({
      lsoaName: "Epsom and Ewell 010D",
      count: 20,
      pct: 1.2,
    });
    const aug = new Map(rows.filter((r) => r.month === "2026-08").map((r) => [r.lsoaCode, r]));
    expect(aug.get("E01021395")).toMatchObject({ count: 15, pct: 1.7 });
    expect(aug.get("E01003511")).toMatchObject({ count: 120, pct: 8.4 });
    expect(aug.get("E01030396")).toMatchObject({ count: 20, pct: 1.2 });
    expect(goldenChecks(rows, { full: false })).toEqual([]);
    expect(GOLDEN.month).toBe("2026-09");
  });

  it("golden checks catch a tampered golden-month figure", async () => {
    const rows = await fixtureRows();
    const tampered = rows.map((r) =>
      r.lsoaCode === "E01003511" && r.month === "2026-09" ? { ...r, count: 121 } : r,
    );
    const failures = goldenChecks(tampered as never, { full: false });
    expect(failures.some((f) => f.includes("Newham 036A"))).toBe(true);
  });
});

describe("the parse contract", () => {
  it("the golden query URL is the prep's recipe, verbatim parameters", () => {
    const url = claimantUrl({ selector: "latest", codes: ["E01021395"] } as never);
    expect(url).toContain("NM_162_1.data.csv");
    expect(url).toContain("geography=E01021395");
    expect(url).toContain("date=latest");
    expect(url).toContain("gender=0");
    expect(url).toContain("age=0");
    expect(url).toContain("measure=1%2C2");
    expect(url).toContain("measures=20100");
    const national = claimantUrl({ selector: "latest", offset: 25000 } as never);
    expect(national).toContain("geography=TYPE151");
    expect(national).toContain("recordOffset=25000");
  });

  it("a renamed consumed column fails the parse, naming the column", () => {
    const renamed = latestText().replace('"OBS_VALUE"', '"VALUE"');
    expect(() => parseClaimantCsv(renamed)).toThrow(/OBS_VALUE/);
  });

  it("a geography re-basing fails the parse instead of filing", () => {
    const rebased = latestText().replaceAll(
      "2021 super output areas - lower layer",
      "2011 super output areas - lower layer",
    );
    expect(() => parseClaimantCsv(rebased)).toThrow(/geography type/);
  });

  it("a percentage with a second decimal place is not the published shape", () => {
    const widened = latestText().replace(",1.6,", ",1.65,");
    expect(() => parseClaimantCsv(widened)).toThrow(/decimal/);
  });

  it("a suppressed percentage (status M, empty value) files as null — never back-calculated", () => {
    // Nomis suppresses the percentage where the underlying
    // value is 1 or 2 (measured live at the build: 54 in Sep 2026
    // LSOAs a month). Rebuild Exeter's measure-2 row in
    // that published shape from the verbatim fixture.
    const lines = latestText().split("\n");
    const suppressed = lines
      .map((line) => {
        if (!line.includes('"E01003511"') || !line.includes('"2","Claimants as')) return line;
        return line.replace(
          ',8.6,"A","Normal Value"',
          ',,"M","These figures are suppressed as value is 1 or 2"',
        );
      })
      .join("\n");
    const rows = parseClaimantCsv(suppressed);
    const exeter = rows.find((r) => r.lsoaCode === "E01003511");
    expect(exeter?.count).toBe(120);
    expect(exeter?.pct).toBeNull();
  });

  it("an empty percentage in any other status is a shape change, not a suppression", () => {
    const lines = latestText().split("\n");
    const emptied = lines
      .map((line) => {
        if (!line.includes('"E01003511"') || !line.includes('"2","Claimants as')) return line;
        return line.replace(',8.6,"A"', ',,"A"');
      })
      .join("\n");
    expect(() => parseClaimantCsv(emptied)).toThrow(/suppression/);
  });

  it("a response holding only one measure for an area refuses to assemble", () => {
    const lines = latestText().split("\n");
    const oneMeasureOnly = lines.filter((l) => !l.includes('"2","Claimants as')).join("\n");
    expect(() => parseClaimantCsv(oneMeasureOnly)).toThrow(/only one of the two measures/);
  });

  it("a page boundary splitting an area's two measures still assembles whole", () => {
    // Split the golden response mid-area (after Birkdale's
    // count row): the national pull assembles observations
    // from every page before judging completeness.
    const lines = latestText().trim().split("\n");
    const head = lines.slice(0, 2).join("\n"); // header + Birkdale count
    const rest = [lines[0], ...lines.slice(2)].join("\n");
    const rows = assembleClaimantRows([
      ...parseClaimantObservations(head),
      ...parseClaimantObservations(rest),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.lsoaCode === "E01021395")).toMatchObject({ count: 15, pct: 1.6 });
  });

  it("the same measure arriving twice in one pull is refused", () => {
    const observations = parseClaimantObservations(latestText());
    expect(() => assembleClaimantRows([...observations, ...observations])).toThrow(/twice/);
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

  it("stages, swaps each month and prunes inside one transaction", async () => {
    const rows = await fixtureRows();
    const rec = recordingPool();
    await fileClaimant(rec.pool as never, rows, "2026-11-13T00:00:00.000Z");
    const at = (prefix: string) => rec.statements.findIndex((s) => s.startsWith(prefix));
    expect(rec.statements[0]).toBe("BEGIN");
    expect(at("CREATE TEMP TABLE benefits_stage")).toBeGreaterThan(0);
    expect(at("INSERT INTO benefits_stage")).toBeGreaterThan(
      at("CREATE TEMP TABLE benefits_stage"),
    );
    // One delete+insert pair per filed month, then the
    // 13-month prune for this series only, then COMMIT.
    const deletes = rec.calls.filter((c) =>
      c.sql.startsWith("DELETE FROM benefits_stats WHERE series"),
    );
    expect(deletes).toHaveLength(3); // two month swaps + the prune
    expect(deletes[0].params).toEqual(["claimant_count", "2026-08-01"]);
    expect(deletes[1].params).toEqual(["claimant_count", "2026-09-01"]);
    expect(deletes[2].params).toEqual(["claimant_count"]);
    expect(deletes[2].sql).toContain("LIMIT 13");
    const liveInserts = rec.calls.filter((c) => c.sql.startsWith("INSERT INTO benefits_stats"));
    expect(liveInserts).toHaveLength(2);
    for (const ins of liveInserts) {
      expect(ins.sql).toContain(
        "(lsoa_code, series, reference_month, lsoa_name, count, pct, source_name, source_date, loaded_at)",
      );
      expect(ins.params[1]).toBe("ONS Claimant Count via Nomis");
    }
    expect(rec.statements.at(-1)).toBe("COMMIT");
    expect(rec.released()).toBe(true);
  });

  it("a failure mid-filing rolls back and still releases the client", async () => {
    const rows = await fixtureRows();
    const rec = recordingPool("INSERT INTO benefits_stage");
    await expect(fileClaimant(rec.pool as never, rows, "2026-11-13T00:00:00.000Z")).rejects.toThrow(
      "forced failure",
    );
    expect(rec.statements).toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
    expect(rec.released()).toBe(true);
  });

  it("migration 0013 defines benefits_stats with the closed series vocabulary", () => {
    const migration = readFileSync(
      join(process.cwd(), "db/migrations/0013_benefits_stats.sql"),
      "utf8",
    );
    expect(migration).toContain("CREATE TABLE benefits_stats");
    expect(migration).toContain(
      "CHECK (series IN ('uc_people', 'uc_households', 'claimant_count'))",
    );
    expect(migration).toContain("PRIMARY KEY (lsoa_code, series, reference_month)");
  });
});

describe("the runner's monthly class", () => {
  it("the 25-day class: due at 25 days, not before", () => {
    const now = new Date("2026-11-13T00:00:00Z");
    expect(dueDecision("2026-10-19T00:00:00Z", 25, now).due).toBe(true);
    expect(dueDecision("2026-11-01T00:00:00Z", 25, now).due).toBe(false);
  });

  it("load-claimant-count is registered monthly, directory-free and fixture-backed", () => {
    const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
    expect(runner).toContain('"load-claimant-count": "Benefits figures — Claimant Count"');
    expect(runner).toContain('runAndLog("load-claimant-count", ["--file", fx("claimant-count")])');
    // M5.15: registration is the schedule-registry entry now —
    // monthly class, 30-minute timeout; the class thresholds
    // themselves are pinned in tests/run-loaders.test.ts.
    expect(runner).toContain(
      '{ item: "load-claimant-count", cadence: "monthly", timeoutMinutes: 30 }',
    );
    const directoryFree = runner.slice(
      runner.indexOf("const DIRECTORY_FREE"),
      runner.indexOf("]);", runner.indexOf("const DIRECTORY_FREE")),
    );
    expect(directoryFree).toContain('"load-claimant-count"');
  });
});

describe("the nomis-claimant canary arms (network stubbed, clock fixed)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("the golden arm reads month, counts and percentages from the published shape", () => {
    const facts = claimantLatestFacts(latestText()) as {
      month: string;
      rows: Record<string, { count: string; pct: string }>;
    };
    expect(facts.month).toBe("2026-09");
    expect(facts.rows["E01021395"]).toEqual({ count: "15", pct: "1.6" });
    expect(facts.rows["E01003511"]).toEqual({ count: "120", pct: "8.6" });
    expect(facts.rows["E01030396"]).toEqual({ count: "20", pct: "1.2" });
  });

  it("the probe passes on the golden response within its freshness arm", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-11-15T00:00:00Z").getTime());
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      text: async () => latestText(),
    }));
    const outcome = (await probeNomisClaimant()) as { logLine: string };
    expect(outcome.logLine).toContain("canary nomis-claimant");
    expect(outcome.logLine).toContain("2026-09");
  });

  it("the freshness arm fails loudly once the latest month is past ~75 days", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2027-01-15T00:00:00Z").getTime());
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      text: async () => latestText(),
    }));
    await expect(probeNomisClaimant()).rejects.toThrow(/75-day arm/);
  });

  it("the probe is registered under its own name", () => {
    const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
    expect(canary).toContain('run("nomis-claimant", probeNomisClaimant)');
  });
});

describe("wording discipline — the series is never shortened", () => {
  it("the loader and runner carry the full Claimant Count name, never a bare 'unemployment' label", () => {
    const loader = readFileSync(join(process.cwd(), "loaders/load-claimant-count.mjs"), "utf8");
    const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
    expect(runner).toContain("Benefits figures — Claimant Count");
    // The honest compound is allowed; the bare label is not.
    expect(loader).not.toMatch(/["']unemployment["']/);
    expect(loader).not.toContain("the unemployment rate");
  });
});

describe("BUG-265 progress logging", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };

  it("logs one line per fixture file, with the file count as the total", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-claimant-count", log });
    await loadClaimantRows({ kind: "dir", dir: FIXTURE_DIR }, { progress });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /load-claimant-count progress · fixture 1\/2 files \(50%\) · 6 observations$/,
    );
    expect(lines[1]).toMatch(
      /load-claimant-count progress · fixture 2\/2 files \(100%\) · 12 observations$/,
    );
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("reports a filing failure with the file stage and the staged count, then still rolls back", async () => {
    const rows = await fixtureRows();
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        const head = sql.trim().replace(/\s+/g, " ");
        statements.push(head);
        if (head.startsWith("INSERT INTO benefits_stage"))
          throw new Error("forced failure: INSERT INTO benefits_stage");
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    const pool = { connect: async () => client };
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-claimant-count", log });
    await expect(
      fileClaimant(pool as never, rows, "2026-11-13T00:00:00.000Z", { progress }),
    ).rejects.toThrow("forced failure");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/load-claimant-count progress · filing 6 area-months$/);
    expect(lines[1]).toMatch(
      /load-claimant-count failed · file · filed 0 of 6 · forced failure: INSERT INTO benefits_stage · resume from re-run from scratch \(the filing transaction rolls back\)$/,
    );
    expect(statements).toContain("ROLLBACK");
  });
});
