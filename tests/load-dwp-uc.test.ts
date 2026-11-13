import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeStatXploreUc } from "../loaders/canary.mjs";
import {
  DATABASES,
  GOLDEN_LSOAS,
  GOLDEN_VALUES,
  PENDING_FIRST_PULL,
  buildTableQuery,
  discoverSchema,
  fileUc,
  goldenChecks,
  loadUcRows,
  monthFromText,
  monthsToFile,
  parseTableResponse,
} from "../loaders/load-dwp-uc.mjs";

// Universal Credit loader (plan step M5.16) — the half of
// the benefits step whose live pull is PENDING: the K22
// Stat-Xplore key is refused account-side at DWP (HTTP 401
// AUTHENTICATION, 13 Nov 2026), so no real response exists
// to capture. The fixture in tests/fixtures/dwp-uc is
// therefore SYNTHETIC — hand-built in the API's documented
// {fields, cells} shape, with invented counts, and its
// README says so in terms. What is pinned here: the
// documented-shape parser, the schema discovery, the
// quarterly filing-window logic, the golden checks'
// pending behaviour (presence + sanity asserted, exact
// values asserted only once GOLDEN_VALUES is locked), the
// filer's statement order and schema contract, the runner
// registration, the canary's plain not-verified report, and
// the wording discipline (Introduced Random Error, never
// the bulletin's rounding; UC's quarterly cadence, never
// plain "monthly").

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/dwp-uc");
const PEOPLE = DATABASES[0] as never;

type UcRow = {
  lsoaCode: string;
  lsoaName: string;
  series: string;
  month: string;
  count: number;
};

async function fixtureRows(): Promise<UcRow[]> {
  const { rows } = await loadUcRows({ kind: "dir", dir: FIXTURE_DIR });
  return rows as UcRow[];
}

describe("the pending state — stated, not smoothed over", () => {
  it("the golden values are unlocked (null) until the first keyed pull", () => {
    expect(GOLDEN_VALUES).toBeNull();
    expect(PENDING_FIRST_PULL).toContain("PENDING");
    expect(PENDING_FIRST_PULL).toContain("--verify-only");
    expect(PENDING_FIRST_PULL).toContain("401");
  });

  it("the canary probe reports not verified, plainly, as a skipped outcome", async () => {
    const outcome = (await probeStatXploreUc()) as { skipped: string };
    expect(outcome.skipped).toContain("not verified");
    expect(outcome.skipped).toContain("refused by DWP");
    const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
    expect(canary).toContain('run("stat-xplore-uc", probeStatXploreUc)');
  });

  it("the two series are the two documented databases, people first", () => {
    expect(DATABASES.map((d) => d.series)).toEqual(["uc_people", "uc_households"]);
    expect(DATABASES.map((d) => d.database)).toEqual([
      "str:database:UC_Monthly",
      "str:database:UC_Households",
    ]);
    expect((DATABASES[0] as { documentedMeasure: string }).documentedMeasure).toBe(
      "str:count:UC_Monthly:V_F_UC_CASELOAD_FULL",
    );
    expect(Object.keys(GOLDEN_LSOAS)).toEqual(["E01021395", "E01003511", "E01030396"]);
  });
});

describe("the documented-shape parser (synthetic fixture)", () => {
  it("parses both series' responses into filing rows, each with its own month", async () => {
    const rows = await fixtureRows();
    expect(rows).toHaveLength(6);
    const people = rows.filter((r) => r.series === "uc_people");
    expect(people.map((r) => r.month)).toEqual(["2026-05", "2026-05", "2026-05"]);
    expect(people.find((r) => r.lsoaCode === "E01021395")).toMatchObject({
      lsoaName: "Braintree 018C",
      count: 300,
    });
    const households = rows.filter((r) => r.series === "uc_households");
    expect(households.map((r) => r.month)).toEqual(["2026-04", "2026-04", "2026-04"]);
    expect(goldenChecks(rows, { full: false })).toEqual([]);
  });

  it("a response outside the documented shape refuses to parse — nothing files from it", () => {
    expect(() => parseTableResponse({ unexpected: true }, PEOPLE)).toThrow(/documented/);
    expect(() => parseTableResponse({ fields: [], cells: [] }, PEOPLE)).toThrow(/do not resolve/);
  });

  it("a non-integer or negative cell is refused", async () => {
    const json = JSON.parse(readFileSync(join(FIXTURE_DIR, "uc-people-table.json"), "utf8"));
    json.cells[0].value = -4;
    expect(() => parseTableResponse(json, PEOPLE)).toThrow(/non-negative integer/);
    json.cells[0].value = 12.5;
    expect(() => parseTableResponse(json, PEOPLE)).toThrow(/non-negative integer/);
  });

  it("golden checks catch a missing golden LSOA", async () => {
    const rows = await fixtureRows();
    const cut = rows.filter((r) => r.lsoaCode !== "E01030396");
    const failures = goldenChecks(cut as never, { full: false });
    expect(failures.some((f) => f.includes("E01030396"))).toBe(true);
  });
});

describe("schema discovery and the quarterly filing window", () => {
  const schemaTree = {
    id: "str:database:UC_Monthly",
    children: [
      { id: "str:count:UC_Monthly:V_F_UC_CASELOAD_FULL", label: "Count" },
      {
        id: "str:field:UC_Monthly:V_F_UC_CASELOAD_FULL:DATE",
        children: [
          { id: "str:value:UC_Monthly:DATE:2026-03" },
          { id: "str:value:UC_Monthly:DATE:2026-04" },
          { id: "str:value:UC_Monthly:DATE:2026-05" },
        ],
      },
      {
        id: "str:field:UC_Monthly:V_F_UC_CASELOAD_FULL:GEOGRAPHY",
        children: [
          { id: "str:value:UC_Monthly:GEO:E01021395", label: "Braintree 018C" },
          { id: "str:value:UC_Monthly:GEO:E01003511", label: "Newham 036A" },
          { id: "str:value:UC_Monthly:GEO:E01030396", label: "Epsom and Ewell 010D" },
        ],
      },
    ],
  };

  it("finds the documented measure, the month list and the golden geography items", () => {
    const discovery = discoverSchema(schemaTree as never, DATABASES[0] as never) as {
      measure: string;
      months: { month: string }[];
      geographies: Map<string, { itemId: string }>;
    };
    expect(discovery.measure).toBe("str:count:UC_Monthly:V_F_UC_CASELOAD_FULL");
    expect(discovery.months.map((m) => m.month)).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(discovery.geographies.get("E01021395")?.itemId).toContain("E01021395");
  });

  it("a wrong discovered measure for the people database fails loudly", () => {
    const wrong = JSON.parse(JSON.stringify(schemaTree));
    wrong.children[0].id = "str:count:UC_Monthly:SOMETHING_ELSE";
    expect(() => discoverSchema(wrong as never, DATABASES[0] as never)).toThrow(/documented/);
  });

  it("the table query carries the discovered field ids and items", () => {
    const discovery = discoverSchema(schemaTree as never, DATABASES[0] as never);
    const query = buildTableQuery(discovery as never, DATABASES[0] as never, {
      months: ["2026-05"],
      lsoaCodes: ["E01021395"],
    }) as { database: string; measures: string[]; dimensions: { id: string; items?: string[] }[] };
    expect(query.database).toBe("str:database:UC_Monthly");
    expect(query.measures).toEqual(["str:count:UC_Monthly:V_F_UC_CASELOAD_FULL"]);
    expect(query.dimensions).toHaveLength(2);
    expect(query.dimensions[0].items).toEqual(["str:value:UC_Monthly:DATE:2026-05"]);
    expect(query.dimensions[1].items).toEqual(["str:value:UC_Monthly:GEO:E01021395"]);
  });

  it("months read from ids or from month-name labels alike", () => {
    expect(monthFromText("str:value:X:2026-05")).toBe("2026-05");
    expect(monthFromText("May 2026")).toBe("2026-05");
    expect(monthFromText("Braintree 018C")).toBeNull();
  });

  it("the filing window: new months plus the newest three, capped at thirteen", () => {
    const published = [
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ];
    // First pull: the newest 13 — here, all of them.
    expect(monthsToFile(published, null)).toEqual(published);
    // A quarterly step after filing to May: June–August are
    // new; the re-file window adds the newest three anyway.
    expect(monthsToFile(published, "2026-05")).toEqual(["2026-06", "2026-07", "2026-08"]);
    // A monthly run with nothing new files only the re-file
    // window (revisions), the healthy quarterly no-op.
    expect(monthsToFile(published, "2026-08")).toEqual(["2026-06", "2026-07", "2026-08"]);
    // Beyond 13 published months, the window never reaches
    // back past the retained thirteen.
    const longer = ["2025-06", "2025-07", ...published];
    expect(monthsToFile(longer, null)).toEqual(published);
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

  it("stages, swaps each series-month with pct NULL, and prunes per series in one transaction", async () => {
    const rows = await fixtureRows();
    const rec = recordingPool();
    await fileUc(rec.pool as never, rows, "2026-11-13T00:00:00.000Z");
    const at = (prefix: string) => rec.statements.findIndex((s) => s.startsWith(prefix));
    expect(rec.statements[0]).toBe("BEGIN");
    expect(at("CREATE TEMP TABLE uc_stage")).toBeGreaterThan(0);
    expect(at("INSERT INTO uc_stage")).toBeGreaterThan(at("CREATE TEMP TABLE uc_stage"));
    const liveInserts = rec.calls.filter((c) => c.sql.startsWith("INSERT INTO benefits_stats"));
    expect(liveInserts).toHaveLength(2);
    for (const ins of liveInserts) expect(ins.sql).toContain("count, NULL, source_name");
    const prunes = rec.calls.filter(
      (c) =>
        c.sql.startsWith("DELETE FROM benefits_stats WHERE series") && c.sql.includes("LIMIT 13"),
    );
    expect(prunes.map((p) => p.params[0]).sort()).toEqual(["uc_households", "uc_people"]);
    expect(rec.statements.at(-1)).toBe("COMMIT");
    expect(rec.released()).toBe(true);
  });

  it("a failure mid-filing rolls back and still releases the client", async () => {
    const rows = await fixtureRows();
    const rec = recordingPool("INSERT INTO uc_stage");
    await expect(fileUc(rec.pool as never, rows, "2026-11-13T00:00:00.000Z")).rejects.toThrow(
      "forced failure",
    );
    expect(rec.statements).toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
    expect(rec.released()).toBe(true);
  });
});

describe("the runner's registration", () => {
  it("load-dwp-uc is registered monthly, directory-free and fixture-backed", () => {
    const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
    expect(runner).toContain('"load-dwp-uc": "Benefits figures — Universal Credit"');
    expect(runner).toContain('runAndLog("load-dwp-uc", ["--file", fx("dwp-uc")])');
    expect(runner).toContain('dueDecision(await lastSuccess("load-dwp-uc"), 25)');
    const directoryFree = runner.slice(
      runner.indexOf("const DIRECTORY_FREE"),
      runner.indexOf("]);", runner.indexOf("const DIRECTORY_FREE")),
    );
    expect(directoryFree).toContain('"load-dwp-uc"');
  });
});

describe("wording discipline — the sources' own terms", () => {
  it("UC figures carry the Introduced Random Error wording, never the bulletin's rounding as a claim", () => {
    const loader = readFileSync(join(process.cwd(), "loaders/load-dwp-uc.mjs"), "utf8");
    expect(loader).toMatch(/introduced random error/i);
    expect(loader).toContain(
      "DWP adjusts small figures to protect confidentiality, so small-area counts are approximate",
    );
    // The phrase may appear only as the correction (what
    // the figures are NOT), never as the serving claim.
    expect(loader).not.toContain("counts rounded to the nearest 5");
    expect(loader).not.toContain("rounded to the nearest 5 by DWP");
  });

  it("the loader describes UC publication as quarterly, and the Claimant Count is never shortened in either loader", () => {
    const loader = readFileSync(join(process.cwd(), "loaders/load-dwp-uc.mjs"), "utf8");
    expect(loader).toContain("PUBLISHED QUARTERLY");
    const claimant = readFileSync(join(process.cwd(), "loaders/load-claimant-count.mjs"), "utf8");
    for (const source of [loader, claimant]) {
      expect(source).not.toMatch(/["']unemployment["']/);
      expect(source).not.toContain("the unemployment rate");
    }
  });
});
