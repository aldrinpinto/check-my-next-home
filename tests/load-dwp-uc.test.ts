import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeStatXploreUc } from "../loaders/canary.mjs";
import {
  DATABASES,
  FIRST_PULL,
  GOLDEN_LSOAS,
  GOLDEN_VALUES,
  HOUSEHOLDS_MISSING_LSOAS,
  buildTableQuery,
  createRunStats,
  createUcFiler,
  createUcGoldenTally,
  discoverSchema,
  extendMonthList,
  fetchDiscovery,
  fileUc,
  fixtureRoutes,
  goldenChecks,
  loadUcRows,
  monthFromText,
  monthsToFile,
  parseTableResponse,
  streamUcRows,
} from "../loaders/load-dwp-uc.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Universal Credit loader (plan step M5.16) — reconciled
// at the FIRST PULL, 13 Nov 2026. DWP's gateway refuses
// every Muse-side network (HTTP 401) while the same K22
// key answers 200 from the founder's browser, so the pull
// ran as founder-run captures: the fixture in
// tests/fixtures/dwp-uc is REAL — DWP's own schema nodes
// and table responses (see its README). What is pinned
// here: the real response grammar ({fields, cubes}), the
// real query grammar (recodes + field-array dimensions —
// the built verify queries equal the captures' own echoed
// queries), the level-by-level schema assembly with its
// month probing, the locked golden values, the Households
// gap (Newham 036A absent from that cube), the quarterly
// filing-window logic, the filer's statement order and
// schema contract, the runner registration, the canary's
// arms, and the wording discipline (Introduced Random
// Error, never the bulletin's rounding; UC's quarterly
// cadence, never plain "monthly").

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/dwp-uc");
const PEOPLE = DATABASES[0] as never;
const HOUSEHOLDS = DATABASES[1] as never;

type UcRow = {
  lsoaCode: string;
  lsoaName: string;
  series: string;
  month: string;
  count: number;
};

function readFixture(name: string) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8"));
}

async function fixtureRows(): Promise<UcRow[]> {
  const { rows } = await loadUcRows({ kind: "dir", dir: FIXTURE_DIR });
  return rows as UcRow[];
}

async function fixtureDiscovery(entry: never) {
  const tableFile =
    (entry as { series: string }).series === "uc_people"
      ? "uc-people-table.json"
      : "uc-households-table.json";
  const tableJson = readFixture(tableFile);
  return fetchDiscovery(entry, fixtureRoutes(FIXTURE_DIR, entry as never, tableJson));
}

describe("the first pull — done, and what it locked", () => {
  it("the golden values are locked, each series at its own latest month", () => {
    expect(GOLDEN_VALUES).toEqual({
      uc_people: { "2026-05": { E01021395: 117, E01003511: 383, E01030396: 93 } },
      uc_households: { "2026-04": { E01021395: 105, E01030396: 83 } },
    });
    expect(FIRST_PULL).toContain("DONE 13 Nov 2026");
    expect(FIRST_PULL).toContain("founder-run browser captures");
    expect(FIRST_PULL).not.toContain("PENDING");
  });

  it("the Households gap is a named constant, and the record states it", () => {
    expect(HOUSEHOLDS_MISSING_LSOAS).toEqual(["E01003511"]);
    expect(FIRST_PULL).toContain("E01003511");
    expect(FIRST_PULL).toContain("HOUSEHOLDS_MISSING_LSOAS");
  });

  it("the two series are the two confirmed databases, people first", () => {
    expect(DATABASES.map((d) => d.series)).toEqual(["uc_people", "uc_households"]);
    expect(DATABASES.map((d) => d.database)).toEqual([
      "str:database:UC_Monthly",
      "str:database:UC_Households",
    ]);
    expect(DATABASES.map((d) => (d as { documentedMeasure: string }).documentedMeasure)).toEqual([
      "str:count:UC_Monthly:V_F_UC_CASELOAD_FULL",
      "str:count:UC_Households:V_F_UC_HOUSEHOLDS",
    ]);
    expect(Object.keys(GOLDEN_LSOAS)).toEqual(["E01021395", "E01003511", "E01030396"]);
  });
});

describe("the canary probe", () => {
  it("reports not verified, plainly, when no credential route is available to the run", async () => {
    const savedKey = process.env.STATXPLORE_API_KEY;
    const savedHelper = process.env.STATXPLORE_HELPER_PATH;
    delete process.env.STATXPLORE_API_KEY;
    process.env.STATXPLORE_HELPER_PATH = join(FIXTURE_DIR, "no-such-helper.py");
    try {
      const outcome = (await probeStatXploreUc()) as { skipped: string };
      expect(outcome.skipped).toContain("not verified");
      expect(outcome.skipped).toContain("no Stat-Xplore credential route");
    } finally {
      if (savedKey === undefined) delete process.env.STATXPLORE_API_KEY;
      else process.env.STATXPLORE_API_KEY = savedKey;
      if (savedHelper === undefined) delete process.env.STATXPLORE_HELPER_PATH;
      else process.env.STATXPLORE_HELPER_PATH = savedHelper;
    }
    const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
    expect(canary).toContain('run("stat-xplore-uc", probeStatXploreUc)');
  });
});

describe("the real-shape parser (first pull's captures)", () => {
  it("parses both series' responses into filing rows, months and values exact", async () => {
    const rows = await fixtureRows();
    expect(rows).toHaveLength(15);
    const people = rows.filter((r) => r.series === "uc_people");
    expect(people).toHaveLength(9);
    expect(people.find((r) => r.lsoaCode === "E01021395" && r.month === "2026-05")).toMatchObject({
      lsoaName: "Braintree 018C",
      count: 117,
    });
    expect(people.find((r) => r.lsoaCode === "E01003511" && r.month === "2026-05")?.count).toBe(
      383,
    );
    expect(people.find((r) => r.lsoaCode === "E01030396" && r.month === "2026-03")?.count).toBe(96);
    const households = rows.filter((r) => r.series === "uc_households");
    expect(households).toHaveLength(6);
    expect(households.find((r) => r.lsoaCode === "E01030396" && r.month === "2026-04")?.count).toBe(
      83,
    );
    // The Households rows hold no Newham row — the measured
    // gap — and the golden checks pass with it absent.
    expect(households.some((r) => r.lsoaCode === "E01003511")).toBe(false);
    expect(goldenChecks(rows, { full: false })).toEqual([]);
  });

  it("a response outside the real shape refuses to parse — nothing files from it", async () => {
    const discovery = await fixtureDiscovery(PEOPLE);
    expect(() => parseTableResponse({ unexpected: true }, PEOPLE, discovery as never)).toThrow(
      /real \{fields, cubes\} shape/,
    );
    expect(() => parseTableResponse({ fields: [], cubes: {} }, PEOPLE, discovery as never)).toThrow(
      /real \{fields, cubes\} shape/,
    );
    const json = readFixture("uc-people-table.json");
    delete json.cubes["str:count:UC_Monthly:V_F_UC_CASELOAD_FULL"];
    expect(() => parseTableResponse(json, PEOPLE, discovery as never)).toThrow(/no cube/);
  });

  it("a non-integer, negative or suppressed-marker cell is refused", async () => {
    const discovery = await fixtureDiscovery(PEOPLE);
    for (const bad of [-4, 12.5, ".."]) {
      const json = readFixture("uc-people-table.json");
      json.cubes["str:count:UC_Monthly:V_F_UC_CASELOAD_FULL"].values[0][0] = bad;
      expect(() => parseTableResponse(json, PEOPLE, discovery as never)).toThrow(
        /non-negative integer/,
      );
    }
  });

  it("golden checks catch a missing golden LSOA — and a moved locked value", async () => {
    const rows = await fixtureRows();
    const cut = rows.filter((r) => !(r.series === "uc_people" && r.lsoaCode === "E01030396"));
    expect(goldenChecks(cut as never, { full: false }).some((f) => f.includes("E01030396"))).toBe(
      true,
    );
    const moved = rows.map((r) =>
      r.series === "uc_people" && r.month === "2026-05" && r.lsoaCode === "E01021395"
        ? { ...r, count: 118 }
        : r,
    );
    expect(
      goldenChecks(moved as never, { full: false }).some((f) =>
        f.includes("expected the golden 117"),
      ),
    ).toBe(true);
  });
});

describe("schema assembly and discovery (real captures, level by level)", () => {
  it("assembles each database and discovers its confirmed measure, fields and months", async () => {
    const people = (await fixtureDiscovery(PEOPLE)) as {
      measure: string;
      dateFieldId: string;
      geographyFieldId: string;
      months: { month: string }[];
      geographies: Map<string, { itemId: string }>;
    };
    expect(people.measure).toBe("str:count:UC_Monthly:V_F_UC_CASELOAD_FULL");
    expect(people.dateFieldId).toBe("str:field:UC_Monthly:F_UC_DATE:DATE_NAME");
    expect(people.geographyFieldId).toBe("str:field:UC_Monthly:V_F_UC_CASELOAD_FULL:COA_CODE");
    // The captured valueset slice runs May 2013 – August
    // 2021 (the 100-value cap); probing + compositional
    // completion carries the list to the captured latest.
    expect(people.months[0].month).toBe("2013-05");
    expect(people.months.at(-1)?.month).toBe("2026-05");
    expect(people.months).toHaveLength(157);
    expect(people.geographies.size).toBe(100);
    expect(people.geographies.get("E01000001")?.itemId).toContain("E01000001");

    const households = (await fixtureDiscovery(HOUSEHOLDS)) as {
      measure: string;
      months: { month: string }[];
    };
    expect(households.measure).toBe("str:count:UC_Households:V_F_UC_HOUSEHOLDS");
    expect(households.months[0].month).toBe("2015-08");
    expect(households.months.at(-1)?.month).toBe("2026-04");
  });

  it("the built verify queries equal the captures' own echoed queries", async () => {
    const peopleDiscovery = await fixtureDiscovery(PEOPLE);
    const peopleQuery = buildTableQuery(peopleDiscovery as never, PEOPLE, {
      months: ["2026-03", "2026-04", "2026-05"],
      lsoaCodes: ["E01021395", "E01003511", "E01030396"],
    }) as { recodes: Record<string, unknown> };
    const echoedPeople = readFixture("uc-people-table.json").query;
    for (const key of Object.keys(echoedPeople.recodes)) delete echoedPeople.recodes[key].total;
    expect(peopleQuery).toEqual(echoedPeople);

    const householdsDiscovery = await fixtureDiscovery(HOUSEHOLDS);
    const householdsQuery = buildTableQuery(householdsDiscovery as never, HOUSEHOLDS, {
      months: ["2026-02", "2026-03", "2026-04"],
      lsoaCodes: ["E01021395", "E01030396"],
    }) as { recodes: Record<string, unknown> };
    const echoedHouseholds = readFixture("uc-households-table.json").query;
    for (const key of Object.keys(echoedHouseholds.recodes))
      delete echoedHouseholds.recodes[key].total;
    expect(householdsQuery).toEqual(echoedHouseholds);
  });

  it("a production query recodes the date field only — geography returns every area", async () => {
    const discovery = await fixtureDiscovery(PEOPLE);
    const query = buildTableQuery(discovery as never, PEOPLE, {
      months: ["2026-05"],
      lsoaCodes: undefined,
    }) as { dimensions: string[][]; recodes: Record<string, { map: string[][] }> };
    expect(query.dimensions).toEqual([
      ["str:field:UC_Monthly:F_UC_DATE:DATE_NAME"],
      ["str:field:UC_Monthly:V_F_UC_CASELOAD_FULL:COA_CODE"],
    ]);
    expect(Object.keys(query.recodes)).toEqual(["str:field:UC_Monthly:F_UC_DATE:DATE_NAME"]);
    expect(query.recodes["str:field:UC_Monthly:F_UC_DATE:DATE_NAME"].map).toEqual([
      ["str:value:UC_Monthly:F_UC_DATE:DATE_NAME:C_UC_DATE:202605"],
    ]);
  });

  it("an undiscovered month in a query fails loudly", async () => {
    const discovery = await fixtureDiscovery(PEOPLE);
    expect(() =>
      buildTableQuery(discovery as never, PEOPLE, { months: ["2027-01"], lsoaCodes: undefined }),
    ).toThrow(/not in the schema's month list/);
  });

  it("month probing strides and binary-searches within its bound", async () => {
    const valueset = {
      id: "str:valueset:UC_Monthly:F_UC_DATE:DATE_NAME:C_UC_DATE",
      children: [{ id: "str:value:X:202101", label: "January 2021", type: "VALUE" }],
    };
    let probes = 0;
    const latest = await extendMonthList(valueset as never, async (month: string) => {
      probes += 1;
      return month <= "2022-03";
    });
    expect(latest).toBe("2022-03");
    expect(probes).toBeLessThanOrEqual(30);
    const months = (valueset.children as { label: string }[]).map((c) => monthFromText(c.label));
    expect(months).toEqual([
      "2021-01",
      "2021-02",
      "2021-03",
      "2021-04",
      "2021-05",
      "2021-06",
      "2021-07",
      "2021-08",
      "2021-09",
      "2021-10",
      "2021-11",
      "2021-12",
      "2022-01",
      "2022-02",
      "2022-03",
    ]);
  });

  it("discovery still refuses a wrong discovered measure for the people database", () => {
    const tree = {
      id: "str:database:UC_Monthly",
      children: [
        { id: "str:count:UC_Monthly:SOMETHING_ELSE", label: "Count" },
        {
          id: "str:field:UC_Monthly:F_UC_DATE:DATE_NAME",
          children: [{ id: "str:value:UC_Monthly:X:202605", label: "May 2026" }],
        },
        {
          id: "str:field:UC_Monthly:V_F_UC_CASELOAD_FULL:COA_CODE",
          children: [
            {
              id: "str:value:UC_Monthly:V_F_UC_CASELOAD_FULL:COA_CODE:V_C_MASTERGEOG21_LSOA_TO_MSOA:E01021395",
              label: "Braintree 018C",
            },
          ],
        },
      ],
    };
    expect(() => discoverSchema(tree as never, DATABASES[0] as never)).toThrow(/documented/);
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
    let staged = 0;
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const head = sql.trim().replace(/\s+/g, " ");
        statements.push(head);
        calls.push({ sql: head, params: [...params] });
        if (/INSERT INTO uc_stage/.test(sql)) staged += params.length / 7;
        if (/SELECT count\(\*\)::int AS n FROM uc_stage/.test(sql))
          return { rows: [{ n: staged }], rowCount: 1 };
        if (failOn && head.startsWith(failOn)) throw new Error(`forced failure: ${failOn}`);
        return { rows: [], rowCount: 0 };
      },
      release() {
        released = true;
      },
    };
    return { statements, calls, released: () => released, pool: { connect: async () => client } };
  }

  it("stages into a persistent table, swaps each series-month with pct NULL, and prunes per series", async () => {
    const rows = await fixtureRows();
    const rec = recordingPool();
    await fileUc(rec.pool as never, rows, "2026-11-13T00:00:00.000Z");
    const at = (prefix: string) => rec.statements.findIndex((s) => s.startsWith(prefix));
    // BUG-368: the stage is persistent now — the CREATE
    // TABLE IF NOT EXISTS opens the run (no BEGIN before
    // it: staging commits per flush), and only the swap
    // runs inside one transaction after the staging.
    expect(rec.statements[0]).toBe(
      "CREATE TABLE IF NOT EXISTS uc_stage ( lsoa_code text, lsoa_name text, series text, reference_month date, count integer, source_name text, seq bigint NOT NULL, UNIQUE (series, seq) )",
    );
    expect(at("INSERT INTO uc_stage")).toBeGreaterThan(at("CREATE TABLE IF NOT EXISTS uc_stage"));
    expect(at("BEGIN")).toBeGreaterThan(at("INSERT INTO uc_stage"));
    const liveInserts = rec.calls.filter((c) => c.sql.startsWith("INSERT INTO benefits_stats"));
    // Six series-months in the real fixture: three months
    // per series, each swapped separately.
    expect(liveInserts).toHaveLength(6);
    for (const ins of liveInserts) expect(ins.sql).toContain("count, NULL, source_name");
    const prunes = rec.calls.filter(
      (c) =>
        c.sql.startsWith("DELETE FROM benefits_stats WHERE series") && c.sql.includes("LIMIT 13"),
    );
    expect(prunes.map((p) => p.params[0]).sort()).toEqual(["uc_households", "uc_people"]);
    expect(rec.statements.at(-1)).toBe("COMMIT");
    expect(rec.released()).toBe(true);
  });

  it("a failure mid-staging leaves the staged rows for the next run and still releases the client", async () => {
    const rows = await fixtureRows();
    const rec = recordingPool("INSERT INTO uc_stage");
    await expect(fileUc(rec.pool as never, rows, "2026-11-13T00:00:00.000Z")).rejects.toThrow(
      "forced failure",
    );
    // BUG-368: staging is durable per flush — no ROLLBACK
    // and no COMMIT: the checkpoint stands for the next
    // run to resume from.
    expect(rec.statements).not.toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
    expect(rec.released()).toBe(true);
  });
});

describe("the runner's registration", () => {
  it("load-dwp-uc is registered monthly, directory-free and fixture-backed", () => {
    const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
    expect(runner).toContain('"load-dwp-uc": "Benefits figures — Universal Credit"');
    expect(runner).toContain('runAndLog("load-dwp-uc", ["--file", fx("dwp-uc")])');
    // M5.15: registration is the schedule-registry entry now —
    // monthly class, 30-minute timeout; the class thresholds
    // themselves are pinned in tests/run-loaders.test.ts.
    expect(runner).toContain('{ item: "load-dwp-uc", cadence: "monthly", timeoutMinutes: 30 }');
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

describe("BUG-265 progress logging", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };

  it("streams one stage and one closing line per series, with no percentage (no total is known mid-cube)", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-dwp-uc", log });
    const seen: unknown[] = [];
    await streamUcRows(
      { kind: "dir", dir: FIXTURE_DIR },
      {},
      async (batch: UcRow[]) => {
        seen.push(...batch);
      },
      { progress },
    );
    expect(seen).toHaveLength(15);
    expect(lines).toContainEqual(
      expect.stringMatching(/load-dwp-uc progress · pulling uc_people$/),
    );
    expect(lines).toContainEqual(
      expect.stringMatching(/load-dwp-uc progress · pull uc_people 9 rows$/),
    );
    expect(lines).toContainEqual(
      expect.stringMatching(/load-dwp-uc progress · pulling uc_households$/),
    );
    expect(lines).toContainEqual(
      expect.stringMatching(/load-dwp-uc progress · pull uc_households 6 rows$/),
    );
    expect(lines.every((l) => !l.includes("%"))).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("the collecting form logs one count line per series", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-dwp-uc", log });
    const { rows } = await loadUcRows({ kind: "dir", dir: FIXTURE_DIR }, {}, { progress });
    expect(rows).toHaveLength(15);
    expect(lines).toContainEqual(
      expect.stringMatching(/load-dwp-uc progress · pull uc_people 9 rows$/),
    );
    expect(lines).toContainEqual(
      expect.stringMatching(/load-dwp-uc progress · pull uc_households 6 rows$/),
    );
  });
});

describe("resume (BUG-368)", () => {
  // A stateful fake for benefits_stats: stage and live as
  // in-memory row sets, per-series checkpoints, BEGIN
  // snapshots, ROLLBACK restores, COMMIT keeps; the
  // per-pair swaps and the 13-month prune are interpreted,
  // not just recorded.
  type StatRow = Record<string, unknown>;
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  function statefulPool({ failSecondSwap = false } = {}) {
    let live: StatRow[] = [];
    let stage: StatRow[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let snapshot: StatRow[] | null = null;
    let swaps = 0;
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const head = sql.trim().replace(/\s+/g, " ");
        if (head === "BEGIN") {
          snapshot = structuredClone(live);
          return { rows: [] };
        }
        if (head === "COMMIT") {
          snapshot = null;
          return { rows: [] };
        }
        if (head === "ROLLBACK") {
          if (snapshot) live = snapshot;
          snapshot = null;
          return { rows: [] };
        }
        if (head.startsWith("CREATE TABLE IF NOT EXISTS uc_stage")) return { rows: [] };
        if (head.startsWith("INSERT INTO uc_stage")) {
          insertCalls += 1;
          if (failAfterInserts !== null && insertCalls > failAfterInserts)
            throw new Error("simulated kill: the database connection dropped mid-insert");
          for (let at = 0; at < params.length; at += 7)
            stage.push({
              lsoa_code: params[at],
              lsoa_name: params[at + 1],
              series: params[at + 2],
              reference_month: params[at + 3],
              count: params[at + 4],
              source_name: params[at + 5],
              seq: params[at + 6],
            });
          return { rows: [], rowCount: params.length / 7 };
        }
        if (head.startsWith("SELECT count(*)::int AS n FROM uc_stage"))
          return { rows: [{ n: stage.length }], rowCount: 1 };
        if (head.startsWith("SELECT count(*)::int AS n, coalesce(sum(seq)")) {
          const rows = params[0] ? stage.filter((r) => r.series === params[0]) : stage;
          return {
            rows: [
              {
                n: rows.length,
                s: rows.reduce((a, r) => a + (r.seq as number), 0),
                m: rows.length ? Math.max(...rows.map((r) => r.seq as number)) : 0,
              },
            ],
            rowCount: 1,
          };
        }
        if (head.startsWith("DELETE FROM uc_stage WHERE seq >=")) {
          stage = stage.filter(
            (r) => !((r.seq as number) >= (params[0] as number) && r.series === params[1]),
          );
          return { rows: [], rowCount: 0 };
        }
        if (head.startsWith("DELETE FROM uc_stage")) {
          stage = params[0] ? stage.filter((r) => r.series !== params[0]) : [];
          return { rows: [], rowCount: 0 };
        }
        if (head.startsWith("SELECT lsoa_code, lsoa_name, series, reference_month")) {
          return {
            rows: stage
              .filter((r) => r.series === params[0])
              .sort((a, b) => (a.seq as number) - (b.seq as number)),
            rowCount: 0,
          };
        }
        if (head.startsWith("SELECT loader, edition, expected")) {
          const row = checkpoints.get(params[0] as string);
          return { rows: row ? [row] : [], rowCount: 0 };
        }
        if (head.startsWith("INSERT INTO loader_checkpoint")) {
          checkpoints.set(params[0] as string, {
            loader: params[0] as string,
            edition: params[1] as string,
            expected: params[2] as number | null,
            next_start_index: params[3] as number,
            read_count: params[4] as number,
            filed_count: params[5] as number,
            state: JSON.parse(params[6] as string) as Record<string, unknown>,
          });
          return { rows: [], rowCount: 0 };
        }
        if (head.startsWith("DELETE FROM loader_checkpoint")) {
          checkpoints.delete(params[0] as string);
          return { rows: [], rowCount: 0 };
        }
        if (
          head.startsWith("DELETE FROM benefits_stats WHERE series = $1 AND reference_month = $2")
        ) {
          live = live.filter((r) => !(r.series === params[0] && r.reference_month === params[1]));
          return { rows: [], rowCount: 0 };
        }
        if (head.startsWith("INSERT INTO benefits_stats")) {
          swaps += 1;
          if (failSecondSwap && swaps === 2) throw new Error("forced failure: the second swap");
          for (const row of stage.filter(
            (r) => r.series === params[0] && r.reference_month === params[2],
          ))
            live.push({
              ...row,
              pct: null,
              source_date: row.reference_month,
              loaded_at: params[1],
            });
          return { rows: [], rowCount: 0 };
        }
        if (
          head.startsWith("DELETE FROM benefits_stats WHERE series = $1 AND reference_month NOT IN")
        ) {
          const months = [
            ...new Set(live.filter((r) => r.series === params[0]).map((r) => r.reference_month)),
          ]
            .sort()
            .reverse()
            .slice(0, 13);
          live = live.filter((r) => r.series !== params[0] || months.includes(r.reference_month));
          return { rows: [], rowCount: 0 };
        }
        throw new Error(`fake client: unhandled SQL: ${sql}`);
      },
      release() {},
    };
    return {
      pool: { connect: async () => client },
      live: () => live,
      stage: () => stage,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        insertCalls = 0;
        failAfterInserts = n;
      },
    };
  }
  // 1,500 rows: the 15 fixture rows repeated with distinct
  // LSOA codes, series-grouped (900 uc_people, then 600
  // uc_households) so the filer's 500-row flushes land as
  // flush 1 (500 people), flush 2 (400 people + 100
  // households), flush 3 (500 households).
  async function bigRows() {
    const base = await fixtureRows();
    const people = base.filter((r) => r.series === "uc_people");
    const households = base.filter((r) => r.series === "uc_households");
    const rows: UcRow[] = [];
    for (let k = 0; k < 100; k++)
      for (const r of people)
        rows.push({ ...r, lsoaCode: `E9${String(rows.length).padStart(7, "0")}` });
    for (let k = 0; k < 100; k++)
      for (const r of households)
        rows.push({ ...r, lsoaCode: `E9${String(rows.length).padStart(7, "0")}` });
    return rows;
  }

  it("kill mid-staging resumes per series and files every row exactly once", async () => {
    const fake = statefulPool();
    const rows = await bigRows();
    fake.setFailAfterInserts(2);
    await expect(
      fileUc(fake.pool as never, rows as never, "2026-11-13T00:00:00.000Z"),
    ).rejects.toThrow(/simulated kill/);
    // Flush 1 (500 people) and flush 2's people group (400)
    // staged and checkpointed; flush 2's households group
    // never landed.
    expect(fake.stage().filter((r) => r.series === "uc_people").length).toBe(900);
    expect(fake.stage().filter((r) => r.series === "uc_households").length).toBe(0);
    expect(fake.checkpoints.get("load-dwp-uc:uc_people")?.next_start_index).toBe(900);
    expect(fake.checkpoints.get("load-dwp-uc:uc_households")).toBeUndefined();

    fake.setFailAfterInserts(null);
    await fileUc(fake.pool as never, rows as never, "2026-11-13T00:00:00.000Z");
    expect(fake.live().length).toBe(1500);
    const keys = fake.live().map((r) => `${r.lsoa_code}|${r.series}|${r.reference_month}`);
    expect(new Set(keys).size).toBe(1500);
    expect(fake.stage().length).toBe(0);
    expect(fake.checkpoints.size).toBe(0);
  });

  it("a months change discards the staged rows and starts from zero", async () => {
    const fake = statefulPool();
    const rows = await bigRows();
    fake.setFailAfterInserts(2);
    await expect(
      fileUc(fake.pool as never, rows as never, "2026-11-13T00:00:00.000Z"),
    ).rejects.toThrow(/simulated kill/);
    expect(fake.stage().length).toBe(900);
    fake.setFailAfterInserts(null);
    const moved = rows.map((r) => ({
      ...r,
      month: `${Number(r.month.slice(0, 4)) + 1}${r.month.slice(4)}`,
    }));
    await fileUc(fake.pool as never, moved as never, "2026-11-13T00:00:00.000Z");
    expect(fake.live().length).toBe(1500);
    expect(fake.live().every((r) => String(r.reference_month).startsWith("2027"))).toBe(true);
    expect(fake.stage().length).toBe(0);
    expect(fake.checkpoints.size).toBe(0);
  });

  it("--restart discards the checkpoints and starts from zero", async () => {
    const fake = statefulPool();
    const rows = await bigRows();
    fake.setFailAfterInserts(2);
    await expect(
      fileUc(fake.pool as never, rows as never, "2026-11-13T00:00:00.000Z"),
    ).rejects.toThrow(/simulated kill/);
    expect(fake.stage().length).toBe(900);
    fake.setFailAfterInserts(null);
    await fileUc(fake.pool as never, rows as never, "2026-11-13T00:00:00.000Z", {
      restart: true,
    });
    expect(fake.live().length).toBe(1500);
    const keys = fake.live().map((r) => `${r.lsoa_code}|${r.series}|${r.reference_month}`);
    expect(new Set(keys).size).toBe(1500);
    expect(fake.stage().length).toBe(0);
    expect(fake.checkpoints.size).toBe(0);
  });

  it("a mid-swap kill resumes the stream: staged rows seed the tally and the drain skips them", async () => {
    const fake = statefulPool({ failSecondSwap: true });
    const runStream = async (filer: Awaited<ReturnType<typeof createUcFiler>>) => {
      const tally = createUcGoldenTally();
      const stats = createRunStats();
      const offered: unknown[] = [];
      const onEdition = async ({ series, months }: { series: string; months: string[] }) => {
        const prep = await filer.prepareResumeForSeries(series, months);
        if (!prep.resumed) return { skip: 0 };
        const staged = await filer.stagedRowsForSeries(series);
        for (const row of staged) tally.offer(row as never);
        stats.addRows(staged as never);
        return { skip: prep.checkpoint.next_start_index };
      };
      await streamUcRows(
        { kind: "dir", dir: FIXTURE_DIR } as never,
        {},
        async (batch: UcRow[]) => {
          for (const row of batch) tally.offer(row as never);
          stats.addRows(batch as never);
          offered.push(...batch);
          await filer.stageRows(batch as never);
        },
        { onEdition },
      );
      return { tally, stats, offered };
    };
    // Run 1: both series stage, then the swap fails at the
    // second pair — live untouched, staging + checkpoints
    // stand.
    const first = await createUcFiler(fake.pool as never, "2026-11-23T00:00:00.000Z");
    const run1 = await runStream(first);
    expect(run1.offered).toHaveLength(15);
    await expect(first.finishFiling()).rejects.toThrow("forced failure: the second swap");
    await first.abortFiling();
    expect(fake.live()).toHaveLength(0);
    expect(fake.stage()).toHaveLength(15);
    expect(fake.checkpoints.get("load-dwp-uc:uc_people")?.next_start_index).toBe(9);
    expect(fake.checkpoints.get("load-dwp-uc:uc_households")?.next_start_index).toBe(6);

    // Run 2: the drain skips every staged row, so nothing
    // is offered twice — the tally and stats are seeded
    // from the staged rows instead.
    const second = await createUcFiler(fake.pool as never, "2026-11-23T00:00:00.000Z");
    const run2 = await runStream(second);
    expect(run2.offered).toHaveLength(0);
    expect(run2.tally.failures({ full: false })).toEqual([]);
    expect(run2.stats.summary(true)).toContain("uc_people: 9 areas");
    expect(run2.stats.summary(true)).toContain("uc_households: 6 areas");
    await second.finishFiling();
    expect(fake.live()).toHaveLength(15);
    expect(fake.stage()).toHaveLength(0);
    expect(fake.checkpoints.size).toBe(0);
  });
});
