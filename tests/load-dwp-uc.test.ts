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
} from "../loaders/load-dwp-uc.mjs";

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
