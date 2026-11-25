import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { haversineMiles } from "../lib/nearby";
import {
  BRT_TEXT,
  GOLDEN,
  HEADERS,
  buildFiling,
  deletePollutionInventory,
  dosDate,
  filePollutionInventory,
  goldenChecks,
  latestResource,
  loadPollutionInventoryRows,
  parseSubstances,
} from "../loaders/load-pollution-inventory.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the Pollution Inventory loader (plan step M6.32,
// decisions D50, D60 and D62): the Environment Agency's
// annual workbook, published on the Defra Data Services
// Platform as one ZIP per reporting year — no CSV, no API,
// no spatial service. Only the "<year> Substances" sheet
// files; the register is its permits (2,870 in the 2024
// vintage, published 20 Nov 2025); only the Air route
// files. A below-reporting-threshold return is the literal
// text in the quantity column and files as quantity NULL +
// the flag — never 0 — distinct from a quantified return
// of 0 and from no row at all. The fixture is the real
// published 2024 ZIP cut to nine permits (the seven
// goldens, one no-air-rows permit, one coordinate-less
// permit); the filing proof runs in CI against a real
// PostGIS, and the golden replay asserts the served block
// through the real source there.

const loader = readFileSync(join(process.cwd(), "loaders/load-pollution-inventory.mjs"), "utf8");
const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
const pkg = readFileSync(join(process.cwd(), "package.json"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "db/migrations/0027_industrial_sites.sql"),
  "utf8",
);
const fixtureDir = join(process.cwd(), "tests/fixtures/pollution-inventory");

describe("Pollution Inventory loader sources", () => {
  it("reads the data.gov.uk dataset record and the DSP download for the year's ZIP", () => {
    expect(loader).toContain("ckan.publishing.service.gov.uk/api/3/action/package_show");
    expect(loader).toContain("cfd94301-a2f2-48a2-9915-e477ca6d8b7e");
    expect(loader).toContain('PI_FILE_DATASET_ID = "4faa4a52-7df2-4047-bc3f-877dd04222d8"');
    expect(loader).toContain('SOURCE_NAME = "Environment Agency Pollution Inventory"');
    // The Waste Transfers and Radioactive sheets are never
    // opened: the reader selects the sheet whose name ends
    // " Substances" and reads no other worksheet.
    expect(loader).toContain("/ Substances$/");
    expect(loader).not.toContain("sheet2.xml");
    expect(loader).not.toContain("sheet3.xml");
  });

  it("is registered static (annual register), with its friendly names, fixture pass, npm script and canary probe", () => {
    expect(runner).toContain(
      '{ item: "load-pollution-inventory", cadence: "static", timeoutMinutes: 30 }',
    );
    expect(runner).toContain(
      '"load-pollution-inventory": "Industrial sites — Environment Agency Pollution Inventory"',
    );
    expect(runner).toContain('"ea-pollution-inventory": "Industrial sites source (canary)"');
    expect(runner).toContain(
      'await runAndLog("load-pollution-inventory", ["--file", fx("pollution-inventory")])',
    );
    expect(pkg).toContain(
      '"load:pollution-inventory": "node loaders/load-pollution-inventory.mjs"',
    );
    expect(canary).toContain("probePollutionInventory");
    expect(canary).toContain('await run("ea-pollution-inventory", probePollutionInventory)');
  });

  it("migration 0027 files sites and releases as rows — no JSONB, no site-name or regulator column", () => {
    expect(migration).toContain("CREATE TABLE industrial_sites");
    expect(migration).toContain("CREATE TABLE industrial_site_releases");
    expect(migration).toContain("below_threshold boolean");
    expect(migration).toContain("quantity_kg double precision");
    expect(migration).toContain("REFERENCES industrial_sites (permit_id) ON DELETE CASCADE");
    // D62: no site-name field exists in the source and no
    // regulator column files — the address is the identity
    // and the Agency is a block-level fact. (The migration's
    // comments explain both absences, so the assertions
    // target column definitions, not the words.)
    expect(migration).not.toContain("site_name text");
    expect(migration).not.toContain("regulator text");
    expect(migration).not.toContain("jsonb");
  });
});

describe("Pollution Inventory record resolution", () => {
  // The record's shape as captured live at the step's prep
  // (16 Nov 2026): twelve yearly ZIP resources on one file
  // dataset id, names varying by vintage.
  const recordWith = (years: number[]) => ({
    result: {
      resources: years.map((year) => ({
        name: `${year} Pollution Inventory Dataset.zip`,
        url: `https://environment.data.gov.uk/api/file/download?fileDataSetId=4faa4a52-7df2-4047-bc3f-877dd04222d8&fileName=${year}%20Pollution%20Inventory%20Dataset.zip`,
      })),
    },
  });

  it("resolves the latest year present — never a hardcoded one", () => {
    const all = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
    expect(latestResource(recordWith(all)).year).toBe(2024);
    expect(latestResource(recordWith([...all, 2025])).year).toBe(2025);
  });

  it("fails loud when the record lists no Inventory ZIP", () => {
    expect(() => latestResource({ result: { resources: [] } })).toThrow(/no Pollution Inventory/);
    expect(() => latestResource({})).toThrow(/no resources list/);
  });

  it("reads a member's publication date from its DOS date field", () => {
    // 23412 is the stored DOS date of the real 2024
    // workbook member: 20 November 2025, the day the EA
    // published the vintage.
    expect(dosDate(23412)).toBe("2025-11-20");
    expect(dosDate(0)).toBeNull();
    expect(dosDate(undefined as unknown as number)).toBeNull();
  });
});

describe("Pollution Inventory fixture — the real 2024 ZIP, cut", () => {
  it("parses to nine permits: the seven goldens, one no-air-rows, one coordinate-less", async () => {
    const { rows, sourceDate, year } = await loadPollutionInventoryRows({ fileDir: fixtureDir });
    expect(year).toBe(2024);
    expect(sourceDate).toBe("2025-11-20");
    const parsed = parseSubstances(rows);
    expect(parsed.counts).toEqual({ sites: 9, airSites: 8, airRows: 34, brtAir: 27 });
    const filing = buildFiling(parsed, { year, sourceDate });
    expect(filing.releases).toHaveLength(34);
    // The no-air-rows permit files a site with no releases.
    expect(filing.releases.filter((r) => r.permitId === "PP3936YU")).toHaveLength(0);
    expect(filing.sites.find((s) => s.permitId === "PP3936YU")?.operator).toBeTruthy();
    // The coordinate-less permit files a NULL point and
    // can never serve spatially.
    const coordless = filing.sites.find((s) => s.permitId === "CP3140QU");
    expect(coordless?.latitude).toBeNull();
    expect(coordless?.longitude).toBeNull();
    // The golden checks pass over the fixture (they run
    // before anything files, on every pull).
    expect(() => goldenChecks(filing, { full: false })).not.toThrow();
  });

  it("Birkdale's golden reproduces: Fairwinds Farm at the prep's 1.328 miles, NOx below threshold", async () => {
    const { rows, sourceDate, year } = await loadPollutionInventoryRows({ fileDir: fixtureDir });
    const filing = buildFiling(parseSubstances(rows), { year, sourceDate });
    const site = filing.sites.find((s) => s.permitId === "YP3432XR");
    expect(site?.operator).toBe("Stuart Davis Limited");
    expect(site?.siteAddress).toBe("Fairwinds Farm Poultry Unit Crouchmans Farm Road Ulting Essex");
    const miles = haversineMiles(51.776176, 0.60387, site!.latitude!, site!.longitude!);
    expect(Math.abs(miles - 1.328)).toBeLessThan(0.005);
    type Release = {
      permitId: string;
      substance: string;
      quantityKg: number | null;
      thresholdKg: number;
      belowThreshold: boolean;
    };
    const releases = filing.releases.filter((r: Release) => r.permitId === "YP3432XR");
    expect(releases).toHaveLength(3);
    const nox = releases.find(
      (r: Release) => r.substance === "Nitrogen oxides (NO and NO2) as NO2",
    );
    // Below threshold files as NULL + the flag — never 0.
    expect(nox?.belowThreshold).toBe(true);
    expect(nox?.quantityKg).toBeNull();
    const pm10 = releases.find((r: Release) => r.substance === "Particulate matter - PM10");
    expect(pm10).toMatchObject({ quantityKg: 3066, thresholdKg: 1000, belowThreshold: false });
  });
});

describe("Pollution Inventory parser contract", () => {
  const LETTERS = "ABCDEFGHIJKLMN".split("");
  const headerRow = () => new Map(HEADERS.map((h, i) => [LETTERS[i], h] as [string, string]));
  const dataRow = (cells: Record<string, string | number>) =>
    new Map(Object.entries(cells) as [string, string | number][]);
  const base = {
    A: "XX0000XX",
    B: "SOME ACTIVITY",
    C: "An Operator Limited",
    D: "1 Works Road Town",
    E: "AB1 2CD",
    F: 500000,
    G: 200000,
    H: "Some EA Area",
    M: "Energy",
    N: "Combustion",
  };

  it("a quantified 0 is a filed fact, distinct from below-threshold", () => {
    const parsed = parseSubstances([
      headerRow(),
      dataRow({ ...base, I: "Air", J: "Ammonia", K: 1000, L: 0 }),
      dataRow({ ...base, I: "Air", J: "Methane", K: 1000, L: BRT_TEXT }),
    ]);
    const zero = parsed.releases.find((r) => r.substance === "Ammonia");
    const brt = parsed.releases.find((r) => r.substance === "Methane");
    expect(zero).toMatchObject({ quantityKg: 0, belowThreshold: false });
    expect(brt).toMatchObject({ quantityKg: null, belowThreshold: true });
    expect(parsed.counts).toEqual({ sites: 1, airSites: 1, airRows: 2, brtAir: 1 });
  });

  it("a quantity cell that is neither numeric nor the exact marker text fails the load", () => {
    expect(() =>
      parseSubstances([headerRow(), dataRow({ ...base, I: "Air", J: "Ammonia", K: 1, L: "n/a" })]),
    ).toThrow(/not numeric/);
    // The marker is the file's exact wording — a near-miss
    // is a format change, not a below-threshold return.
    expect(() =>
      parseSubstances([
        headerRow(),
        dataRow({ ...base, I: "Air", J: "Ammonia", K: 1, L: "Below reporting threshold" }),
      ]),
    ).toThrow(/not numeric/);
  });

  it("non-air routes file the site but no release; a missing header fails loud", () => {
    const parsed = parseSubstances([
      headerRow(),
      dataRow({ ...base, I: "Controlled Waters", J: "Ammonia", K: 1, L: 5 }),
    ]);
    expect(parsed.sites).toHaveLength(1);
    expect(parsed.releases).toHaveLength(0);
    expect(() => parseSubstances([dataRow({ ...base })])).toThrow(/header row/);
  });

  it("duplicate (permit, route, substance) and split coordinates fail the load", () => {
    const row = dataRow({ ...base, I: "Air", J: "Ammonia", K: 1, L: 5 });
    expect(() => parseSubstances([headerRow(), row, row])).toThrow(/duplicate/);
    expect(() =>
      parseSubstances([
        headerRow(),
        dataRow({ ...base, G: undefined as unknown as string, I: "Air", J: "Ammonia", K: 1, L: 5 }),
      ]),
    ).toThrow(/together or not at all/);
  });
});

describe("Pollution Inventory vintage discipline", () => {
  const filingWith = (counts: Record<string, number>, year = 2024) => ({
    year,
    sourceDate: "2025-11-20",
    sites: [],
    releases: [],
    counts: { sites: 2870, airSites: 2720, airRows: 17907, brtAir: 12841, ...counts },
  });

  it("an unmeasured vintage refuses to file, naming the operator action", () => {
    expect(() => goldenChecks(filingWith({}, 2025) as never, { full: true })).toThrow(
      /no measured counts pinned/,
    );
  });

  it("a count outside the ±10% band refuses the load; the measured counts pass", () => {
    expect(() => goldenChecks(filingWith({}) as never, { full: true })).toThrow(/missing/);
    // (The golden permits are absent from this synthetic
    // filing, so a passing band still fails on goldens —
    // the band failure must name itself distinctly.)
    expect(() => goldenChecks(filingWith({ sites: 100 }) as never, { full: true })).toThrow(
      /outside ±10%/,
    );
  });

  it("the golden register is the prep's seven permits", () => {
    expect(Object.keys(GOLDEN).sort()).toEqual(
      ["BP3530YR", "DP3906BE", "EP3507SL", "FP3839YQ", "MP3530HZ", "SP3237JU", "YP3432XR"].sort(),
    );
  });
});

describe("Pollution Inventory filing — the transaction", () => {
  type Call = { text: string; params?: unknown[] };
  const fakeClient = (filedSites: number, filedReleases: number) => {
    const calls: Call[] = [];
    return {
      calls,
      async query(text: string, params?: unknown[]) {
        calls.push({ text, params });
        if (text.includes("FROM industrial_site_releases") && text.includes("count(*)"))
          return { rows: [{ n: filedReleases }] };
        if (text.includes("FROM industrial_sites") && text.includes("count(*)"))
          return { rows: [{ n: filedSites }] };
        return { rows: [] };
      },
    };
  };
  const filing = {
    year: 2024,
    sourceDate: "2025-11-20",
    counts: { sites: 1, airSites: 1, airRows: 1, brtAir: 0 },
    sites: [
      {
        permitId: "YP3432XR",
        operator: "Stuart Davis Limited",
        siteAddress: "Fairwinds Farm Poultry Unit Crouchmans Farm Road Ulting Essex",
        sitePostcode: "CM9 6QS",
        activityDescription: "INTENSIVE FARMING; > 40,000 POULTRY",
        sector: "Agriculture",
        subSector: "Intensive Farming",
        easting: 579908,
        northing: 208753,
        latitude: 51.75726430590678,
        longitude: 0.6095227688342956,
      },
    ],
    releases: [
      {
        permitId: "YP3432XR",
        substance: "Ammonia",
        thresholdKg: 1000,
        quantityKg: 3128,
        belowThreshold: false,
      },
    ],
  };

  it("stages inside one transaction, swaps, asserts counts, commits (statement order)", async () => {
    const client = fakeClient(1, 1);
    await filePollutionInventory(client as never, filing as never);
    const texts = client.calls.map((c) => c.text);
    expect(texts[0]).toBe("BEGIN");
    const beginAt = 0;
    const stageAt = texts.findIndex((t) => t.includes("CREATE TEMP TABLE industrial_sites_stage"));
    const deleteAt = texts.findIndex((t) => t === "DELETE FROM industrial_sites");
    expect(stageAt).toBeGreaterThan(beginAt);
    expect(deleteAt).toBeGreaterThan(stageAt);
    expect(texts.some((t) => t.includes("ST_SetSRID(ST_MakePoint"))).toBe(true);
    expect(texts.at(-1)).toBe("COMMIT");
    expect(texts.some((t) => t === "ROLLBACK")).toBe(false);
  });

  it("a short filing rolls the whole swap back", async () => {
    const client = fakeClient(0, 1);
    await expect(filePollutionInventory(client as never, filing as never)).rejects.toThrow(
      /the swap filed 0 sites/,
    );
    expect(client.calls.at(-1)?.text).toBe("ROLLBACK");
  });

  it("the deletion path exists and empties releases before sites, in one transaction (D60/D62)", async () => {
    const client = fakeClient(0, 0);
    await deletePollutionInventory(client as never);
    const texts = client.calls.map((c) => c.text);
    expect(texts).toEqual([
      "BEGIN",
      "DELETE FROM industrial_site_releases",
      "DELETE FROM industrial_sites",
      "COMMIT",
    ]);
  });
});

// ------------------------------------------------------------------
// Progress logging (BUG-265).
// ------------------------------------------------------------------
describe("progress logging (BUG-265)", () => {
  const collect = () => {
    const lines: string[] = [];
    return {
      lines,
      progress: createProgressLogger({
        name: "load-pollution-inventory",
        log: (line: string) => lines.push(line),
      }),
    };
  };
  // A two-site, two-release filing: one stage chunk per
  // table, so the staging tally closes at 2/2.
  const filing = {
    year: 2024,
    sourceDate: "2025-11-20",
    counts: { sites: 2, airSites: 2, airRows: 2, brtAir: 0 },
    sites: [
      {
        permitId: "YP3432XR",
        operator: "Stuart Davis Limited",
        siteAddress: "Fairwinds Farm Poultry Unit Crouchmans Farm Road Ulting Essex",
        sitePostcode: "CM9 6QS",
        activityDescription: "INTENSIVE FARMING; > 40,000 POULTRY",
        sector: "Agriculture",
        subSector: "Intensive Farming",
        easting: 579908,
        northing: 208753,
        latitude: 51.75726430590678,
        longitude: 0.6095227688342956,
      },
      {
        permitId: "SP3237JU",
        operator: "Telehouse International Corporation of Europe Limited",
        siteAddress: "Telehouse West, 12 Coriander Avenue, London",
        sitePostcode: "E14 2AA",
        activityDescription: "DATA CENTRE",
        sector: "Energy",
        subSector: "Data Centres",
        easting: 538000,
        northing: 180000,
        latitude: 51.5,
        longitude: 0.0,
      },
    ],
    releases: [
      {
        permitId: "YP3432XR",
        substance: "Ammonia",
        thresholdKg: 1000,
        quantityKg: 3128,
        belowThreshold: false,
      },
      {
        permitId: "SP3237JU",
        substance: "Carbon dioxide",
        thresholdKg: 100000,
        quantityKg: null,
        belowThreshold: true,
      },
    ],
  };
  const fakeClient = (filedSites: number, filedReleases: number, failOn?: string) => {
    const calls: { text: string; params?: unknown[] }[] = [];
    return {
      calls,
      async query(text: string, params?: unknown[]) {
        calls.push({ text, params });
        if (failOn && text.includes(failOn)) throw new Error(`forced failure: ${failOn}`);
        if (text.includes("FROM industrial_site_releases") && text.includes("count(*)"))
          return { rows: [{ n: filedReleases }] };
        if (text.includes("FROM industrial_sites") && text.includes("count(*)"))
          return { rows: [{ n: filedSites }] };
        return { rows: [] };
      },
    };
  };

  it("logs a stage marker and closes the staging tally at 2/2 chunks", async () => {
    const { lines, progress } = collect();
    await filePollutionInventory(fakeClient(2, 2) as never, filing as never, { progress });
    expect(lines.some((l) => /progress · staging 2 sites and 2 air releases$/.test(l))).toBe(true);
    expect(lines.some((l) => /progress · staging 2\/2 chunks \(100%\)$/.test(l))).toBe(true);
    expect(
      lines.some((l) => /progress · swap started — replacing the filed vintage$/.test(l)),
    ).toBe(true);
    // The runner contract: no progress line starts with the
    // loader name — every line starts with its timestamp.
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("a short filing logs a failure line naming the filing stage and the staged rows", async () => {
    const { lines, progress } = collect();
    await expect(
      filePollutionInventory(fakeClient(0, 2) as never, filing as never, { progress }),
    ).rejects.toThrow(/the swap filed 0 sites/);
    expect(
      lines.some((l) =>
        /failed · filing · filed 4 of 4 · the swap filed 0 sites and 2 releases, expected 2 and 2 · resume from re-run from scratch/.test(
          l,
        ),
      ),
    ).toBe(true);
  });

  it("a failed stage insert logs a failure line with zero rows staged", async () => {
    const { lines, progress } = collect();
    await expect(
      filePollutionInventory(
        fakeClient(2, 2, "INSERT INTO industrial_sites_stage") as never,
        filing as never,
        { progress },
      ),
    ).rejects.toThrow(/forced failure/);
    expect(
      lines.some((l) =>
        /failed · filing · filed 0 of 4 · forced failure: INSERT INTO industrial_sites_stage · resume from re-run from scratch/.test(
          l,
        ),
      ),
    ).toBe(true);
  });
});
