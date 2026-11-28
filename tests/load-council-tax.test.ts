import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AREA_PRECEPTORS,
  ENGLAND_SOURCE_NAME,
  RELEASES,
  SEED_CODES,
  WALES_SOURCE_NAME,
  buildRows,
  currentTaxYear,
  fileAllRows,
  fileSeedRows,
  goldenChecks,
  nextTaxYear,
  parseEnglandRelease,
  parseWales,
  readFixtureOds,
  previousTaxYear,
} from "../loaders/load-council-tax.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Council tax loader (plan step M5.10), tested against the
// two fixture sets under tests/fixtures/council-tax{,-2025-26}
// — trimmed cuts of the REAL releases (MHCLG Tables 1-9 and
// Table 10 ODS; the StatsWales composition CSV), values
// verbatim. What is pinned: the seed's 13 authorities with
// their penny-exact published figures for the live year
// 2026-27; the fully verified 2025-26 rehearsal goldens
// (Newham £1,855.96 exact; Braintree's components £2,133.54
// before its parish element; Epsom and Ewell at the
// RELEASE's £2,416.84 — the prep's £2,416.39 came from the
// council minutes with a Surrey Police element 45p lower
// than the release prints, and the release is what files);
// the reconciliation identity in both directions (the
// components must sum to the area figure, and Table 10's
// arithmetic must agree with Table 8's); the GLA identity's
// uniformity across London; the nation split held in the
// data itself; and the filers' statement order.

const FIXTURE_2026 = join(process.cwd(), "tests/fixtures/council-tax");
const FIXTURE_2025 = join(process.cwd(), "tests/fixtures/council-tax-2025-26");

type Row = {
  code: string;
  name: string;
  nation: string;
  bandD: number;
  parishAveraged: boolean;
  billing: number | null;
  county: number | null;
  police: number | null;
  fire: number | null;
  gla: number | null;
  combinedAuthority: number | null;
  sourceName?: string;
  sourceDate?: string;
};

async function seedRows(dir: string): Promise<{ rows: Row[]; taxYear: string }> {
  const england = await parseEnglandRelease(
    await readFixtureOds(dir, "Tables_1-9.ods"),
    await readFixtureOds(dir, "Table_10.ods"),
  );
  const walesRows = parseWales(
    await readFile(join(dir, "wales-composition.csv"), "utf8"),
    england.taxYear,
  );
  const { rows } = buildRows(england, walesRows, { mode: "seed", codes: SEED_CODES });
  const known = RELEASES[england.taxYear as keyof typeof RELEASES];
  for (const row of rows as Row[])
    Object.assign(
      row,
      row.nation === "wales"
        ? { sourceName: WALES_SOURCE_NAME, sourceDate: known.wales }
        : { sourceName: ENGLAND_SOURCE_NAME, sourceDate: known.england },
    );
  return { rows: rows as Row[], taxYear: england.taxYear };
}

describe("the 2026-27 seed — the live year, penny-exact", () => {
  it("builds exactly the 13 seed authorities and passes every golden", async () => {
    const { rows, taxYear } = await seedRows(FIXTURE_2026);
    expect(taxYear).toBe("2026-27");
    expect(rows).toHaveLength(13);
    expect(() => goldenChecks(rows, "2026-27")).not.toThrow();
    const byCode = new Map(rows.map((r) => [r.code, r]));
    // The golden areas.
    expect(byCode.get("E09000025")).toMatchObject({
      name: "Newham",
      bandD: 194423,
      billing: 143372,
      gla: 51051,
      parishAveraged: false,
    });
    expect(byCode.get("E07000067")).toMatchObject({
      name: "Braintree",
      bandD: 228034,
      billing: 20601,
      county: 164196,
      police: 27531,
      fire: 9252,
      parishAveraged: true,
    });
    expect(byCode.get("E07000208")).toMatchObject({
      name: "Epsom and Ewell",
      bandD: 253084,
      county: 193842,
      police: 35257,
      fire: null, // Surrey's fire service sits inside the county element
      parishAveraged: false, // unparished: incl == excl in Table 8c
    });
    // Wales: unitary rows — a police element, and never a
    // county, GLA or combined-authority element.
    expect(byCode.get("W06000015")).toMatchObject({
      name: "Cardiff",
      nation: "wales",
      bandD: 201318,
      billing: 160372,
      police: 40514,
      county: null,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true, // Cardiff has community councils
    });
    expect(byCode.get("W06000011")).toMatchObject({ name: "Swansea", bandD: 223829 });
    // Birmingham: the combined authority prints £0.00, so
    // it files as NO combined-authority component.
    expect(byCode.get("E08000025")).toMatchObject({
      bandD: 236290,
      police: 24450,
      fire: 8519,
      combinedAuthority: null,
      parishAveraged: true,
    });
  });

  it("stamps each row with its own publisher and the release state filed from", async () => {
    const { rows } = await seedRows(FIXTURE_2026);
    const newham = rows.find((r) => r.code === "E09000025")!;
    expect(newham.sourceName).toContain("MHCLG");
    expect(newham.sourceDate).toBe("2026-03-25");
    const cardiff = rows.find((r) => r.code === "W06000015")!;
    expect(cardiff.sourceName).toContain("StatsWales");
    expect(cardiff.sourceDate).toBe("2026-03-24");
  });
});

describe("the 2025-26 rehearsal goldens — the fully verified year", () => {
  it("files the release's figures, Epsom's 45p included", async () => {
    const { rows, taxYear } = await seedRows(FIXTURE_2025);
    expect(taxYear).toBe("2025-26");
    expect(() => goldenChecks(rows, "2025-26")).not.toThrow();
    const byCode = new Map(rows.map((r) => [r.code, r]));
    expect(byCode.get("E09000025")!.bandD).toBe(185596); // £1,855.96 exact
    const braintree = byCode.get("E07000067")!;
    const components =
      (braintree.billing ?? 0) +
      (braintree.county ?? 0) +
      (braintree.police ?? 0) +
      (braintree.fire ?? 0);
    expect(components).toBe(213354); // £2,133.54 pre-parish, per the golden rule
    expect(braintree.parishAveraged).toBe(true);
    expect(braintree.bandD).toBe(219467); // components + £61.13 average parish element
    // The prep pinned Epsom at £2,416.39 from the council's
    // own minutes; the (revised) MHCLG release prints
    // £2,416.84, its Surrey Police element 45p higher. The
    // release files; the difference is in the spot-check
    // record.
    expect(byCode.get("E07000208")).toMatchObject({ bandD: 241684, police: 33757 });
    expect(byCode.get("W06000015")!.bandD).toBe(192618);
  });
});

describe("reconciliation — the identity, asserted both ways", () => {
  it("a preceptor element that stops summing to the area figure fails the build", async () => {
    const england = await parseEnglandRelease(
      await readFixtureOds(FIXTURE_2026, "Tables_1-9.ods"),
      await readFixtureOds(FIXTURE_2026, "Table_10.ods"),
    );
    england.preceptors.set("Essex Police", england.preceptors.get("Essex Police")! + 500);
    expect(() => buildRows(england, [], { mode: "seed", codes: SEED_CODES })).toThrow(
      /do not reconcile/,
    );
  });

  it("Table 10 disagreeing with Table 8 fails the build before any identity is trusted", async () => {
    const england = await parseEnglandRelease(
      await readFixtureOds(FIXTURE_2026, "Tables_1-9.ods"),
      await readFixtureOds(FIXTURE_2026, "Table_10.ods"),
    );
    const billing = england.billing.get("E07000067")!;
    england.billing.set("E07000067", { ...billing, billing: billing.billing + 250 });
    expect(() => buildRows(england, [], { mode: "seed", codes: SEED_CODES })).toThrow(
      /disagrees with Table 8/,
    );
  });

  it("one London borough out of line breaks the GLA uniformity assertion", async () => {
    const england = await parseEnglandRelease(
      await readFixtureOds(FIXTURE_2026, "Tables_1-9.ods"),
      await readFixtureOds(FIXTURE_2026, "Table_10.ods"),
    );
    const kingston = england.area.get("E09000021")!;
    england.area.set("E09000021", { ...kingston, bandD: kingston.bandD + 100 });
    expect(() => buildRows(england, [], { mode: "seed", codes: SEED_CODES })).toThrow(
      /not uniform|not the release's uniform/,
    );
  });

  it("a Welsh total its parts cannot make fails the parse", async () => {
    const text = await readFile(join(FIXTURE_2026, "wales-composition.csv"), "utf8");
    const tampered = text.replace(
      "2013.18,£ per band D,Total CT for billing authority area,2026-27,Cardiff",
      "2014.18,£ per band D,Total CT for billing authority area,2026-27,Cardiff",
    );
    expect(tampered).not.toBe(text);
    expect(() => parseWales(tampered, "2026-27")).toThrow(/do not reconcile/);
  });

  it("a tampered filed figure fails the golden checks by field", async () => {
    const { rows } = await seedRows(FIXTURE_2026);
    const newham = rows.find((r) => r.code === "E09000025")!;
    newham.gla = 51052;
    expect(() => goldenChecks(rows, "2026-27")).toThrow(/E09000025 gla is 51052/);
  });
});

describe("the schema — migration 0014", () => {
  const migration = readFileSync(
    join(process.cwd(), "db/migrations/0014_council_tax_charges.sql"),
    "utf8",
  );

  it("creates council_tax_charges and drops the 0001 placeholder it supersedes", () => {
    expect(migration).toContain("CREATE TABLE council_tax_charges");
    expect(migration).toContain("DROP TABLE council_tax_rates");
    expect(migration).toContain("PRIMARY KEY (billing_authority_ons_code, tax_year)");
  });

  it("files Band D only — no other band is ever a column (ratios live at answer time)", () => {
    expect(migration).toContain("band_d_area_average_pence");
    expect(migration).not.toMatch(/band_[abcefghi]_/);
  });

  it("nation CHECKs keep Welsh rows free of English tier elements, and the GLA on London codes only", () => {
    expect(migration).toContain("CHECK (nation IN ('england', 'wales'))");
    expect(migration).toMatch(/nation = 'england'\s+OR \(\s+county_component_pence IS NULL/);
    expect(migration).toContain("billing_authority_ons_code LIKE 'E09000%'");
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

  it("the seed upserts inside one transaction, with the golden pence as its parameters", async () => {
    const { rows } = await seedRows(FIXTURE_2026);
    const rec = recordingPool();
    await fileSeedRows(rec.pool as never, rows, "2026-27");
    expect(rec.statements[0]).toBe("BEGIN");
    expect(rec.statements.at(-1)).toBe("COMMIT");
    const inserts = rec.calls.filter((c) => c.sql.startsWith("INSERT INTO council_tax_charges"));
    expect(inserts).toHaveLength(13);
    expect(inserts[0].sql).toContain("ON CONFLICT (billing_authority_ons_code, tax_year)");
    const braintree = rec.calls.find((c) => c.params[0] === "E07000067")!;
    expect(braintree.params.slice(0, 12)).toEqual([
      "E07000067",
      "Braintree",
      "england",
      "2026-27",
      228034,
      true,
      20601,
      164196,
      27531,
      9252,
      null,
      null,
    ]);
    expect(rec.released()).toBe(true);
  });

  it("a failure mid-seed rolls back and still releases the client", async () => {
    const { rows } = await seedRows(FIXTURE_2026);
    const rec = recordingPool("INSERT INTO council_tax_charges");
    await expect(fileSeedRows(rec.pool as never, rows, "2026-27")).rejects.toThrow(
      "forced failure",
    );
    expect(rec.statements).toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
    expect(rec.released()).toBe(true);
  });

  it("the full pass stages and swaps the year — BEGIN before the stage create", async () => {
    const { rows } = await seedRows(FIXTURE_2026);
    const rec = recordingPool();
    await fileAllRows(rec.pool as never, rows, "2026-27");
    const at = (prefix: string) => rec.statements.findIndex((s) => s.startsWith(prefix));
    expect(rec.statements[0]).toBe("BEGIN");
    expect(at("CREATE TEMP TABLE stg_council_tax_charges")).toBeGreaterThan(0);
    expect(at("INSERT INTO stg_council_tax_charges")).toBeGreaterThan(
      at("CREATE TEMP TABLE stg_council_tax_charges"),
    );
    expect(at("DELETE FROM council_tax_charges")).toBeGreaterThan(
      at("INSERT INTO stg_council_tax_charges"),
    );
    expect(at("INSERT INTO council_tax_charges (")).toBeGreaterThan(
      at("DELETE FROM council_tax_charges"),
    );
    expect(rec.statements.at(-1)).toBe("COMMIT");
  });
});

async function allRows(): Promise<{
  england: Awaited<ReturnType<typeof parseEnglandRelease>>;
  walesRows: ReturnType<typeof parseWales>;
}> {
  const england = await parseEnglandRelease(
    await readFixtureOds(FIXTURE_2026, "Tables_1-9.ods"),
    await readFixtureOds(FIXTURE_2026, "Table_10.ods"),
  );
  const walesRows = parseWales(
    await readFile(join(FIXTURE_2026, "wales-composition.csv"), "utf8"),
    england.taxYear,
  );
  return { england, walesRows };
}

describe("the national map — all 263 non-London authorities (28 Nov 2026)", () => {
  // The 8-entry seed map this replaces, verbatim from the pre-change loader.
  const OLD_SEED_MAP: Record<string, unknown> = {
    E07000067: {
      county: "Essex",
      police: "Essex Police",
      fire: "Essex Police, Fire and Crime Commissioner - Fire",
    },
    E07000070: {
      county: "Essex",
      police: "Essex Police",
      fire: "Essex Police, Fire and Crime Commissioner - Fire",
    },
    E07000072: {
      county: "Essex",
      police: "Essex Police",
      fire: "Essex Police, Fire and Crime Commissioner - Fire",
    },
    E07000208: { county: "Surrey", police: "Surrey Police" },
    E07000207: { county: "Surrey", police: "Surrey Police" },
    E07000210: { county: "Surrey", police: "Surrey Police" },
    E07000178: { county: "Oxfordshire", police: "Thames Valley Police" },
    E08000025: {
      police: "West Midlands Police",
      fire: "West Midlands Fire and Rescue Authority",
      combinedAuthority: "West Midlands",
    },
  };

  it("covers every non-London English billing authority and keeps the 8 seed entries verbatim", () => {
    expect(Object.keys(AREA_PRECEPTORS)).toHaveLength(263);
    for (const [code, entry] of Object.entries(OLD_SEED_MAP))
      expect((AREA_PRECEPTORS as Record<string, unknown>)[code]).toEqual(entry);
    expect(
      Object.keys(AREA_PRECEPTORS).every(
        (c) => c.startsWith("E") && !c.startsWith("E09000") && !c.startsWith("W"),
      ),
    ).toBe(true);
  });

  it("names the GM/YNY police and general elements per combined authority", () => {
    expect(AREA_PRECEPTORS["E08000002"]).toEqual({
      police: "Greater Manchester CA - Police Functions",
      combinedAuthority: "Greater Manchester — general functions",
    });
    expect(AREA_PRECEPTORS["E06000014"]).toEqual({
      police: "York and North Yorkshire CA - Police Functions",
      combinedAuthority: "York and North Yorkshire — general functions",
    });
  });

  it("leaves South Yorkshire and West Yorkshire police-only", () => {
    expect(AREA_PRECEPTORS["E08000039"]).toEqual({
      police: "South Yorkshire Mayoral CA - Police Functions",
      fire: "South Yorkshire Fire and Rescue Authority",
    });
    expect(AREA_PRECEPTORS["E08000035"]).toEqual({
      police: "West Yorkshire CA - Police Functions",
      fire: "West Yorkshire Fire and Rescue Authority",
    });
  });
});

describe("Spelthorne — the named ±10p exception (founder ruling 28 Nov 2026)", () => {
  it("files Spelthorne at its published £2,526.44 and names the 5p gap", async () => {
    const { england, walesRows } = await allRows();
    const { rows, unfiled, toleranceExceptions } = buildRows(england, walesRows, {
      mode: "all",
    });
    expect(unfiled).toEqual([]);
    // 19 England authorities from Table 9 plus the 3 Welsh
    // rows the fixture's composition file carries (Cardiff,
    // Swansea, Newport) — the seed pass files only 13 of
    // these, by code.
    expect(rows).toHaveLength(22);
    const spelthorne = rows.find((r: Row) => r.code === "E07000213")!;
    expect(spelthorne).toMatchObject({
      name: "Spelthorne",
      bandD: 252644,
      billing: 23550,
      county: 193842,
      police: 35257,
      fire: null,
      parishAveraged: false,
    });
    expect(toleranceExceptions).toHaveLength(1);
    expect(toleranceExceptions[0]).toMatchObject({
      code: "E07000213",
      diff: 5,
      tolerancePence: 10,
    });
    expect(toleranceExceptions[0].note).toMatch(/Table 8/);
    expect(toleranceExceptions[0].note).toMatch(/Table 10/);
  });

  it("a 5p gap on any other authority still fails the run", async () => {
    const { england } = await allRows();
    england.preceptors.set("Essex Police", england.preceptors.get("Essex Police")! + 5);
    expect(() => buildRows(england, [], { mode: "seed", codes: SEED_CODES })).toThrow(
      /do not reconcile/,
    );
  });

  it("the 13 golden checks still pass exactly over the full pass", async () => {
    const { england, walesRows } = await allRows();
    const { rows } = buildRows(england, walesRows, { mode: "all" });
    expect(() => goldenChecks(rows, "2026-27")).not.toThrow();
  });
});

describe("Greater Manchester / York and North Yorkshire — the split, filed properly", () => {
  it("Table 8f keeps each 'Of which general functions' value under its own CA", async () => {
    const { england } = await allRows();
    expect(england.preceptors.get("Greater Manchester — general functions")).toBe(15395);
    expect(england.preceptors.get("York and North Yorkshire — general functions")).toBe(11662);
    expect(england.preceptors.get("South Yorkshire Mayoral — general functions")).toBe(0);
    expect(england.preceptors.get("West Yorkshire — general functions")).toBe(0);
    expect(england.preceptors.has("Of which general functions")).toBe(false);
  });

  it("a GM borough and a YNY authority file police and CA general as separate components", async () => {
    const { england } = await allRows();
    const { rows } = buildRows(england, [], {
      mode: "seed",
      codes: ["E08000002", "E06000014"],
    });
    expect(rows.find((r: Row) => r.code === "E08000002")).toMatchObject({
      name: "Bury",
      bandD: 255515,
      billing: 211590,
      police: 28530,
      combinedAuthority: 15395,
      parishAveraged: false,
    });
    expect(rows.find((r: Row) => r.code === "E06000014")).toMatchObject({
      name: "York",
      bandD: 228715,
      billing: 181743,
      police: 33586,
      combinedAuthority: 11662,
      parishAveraged: true,
    });
  });

  it("South Yorkshire and West Yorkshire still file police-only, unchanged", async () => {
    const { england } = await allRows();
    const { rows } = buildRows(england, [], {
      mode: "seed",
      codes: ["E08000039", "E08000035"],
    });
    expect(rows.find((r: Row) => r.code === "E08000039")).toMatchObject({
      name: "Sheffield",
      bandD: 251016,
      billing: 213023,
      police: 28004,
      combinedAuthority: null,
      fire: 9505,
      parishAveraged: true,
    });
    expect(rows.find((r: Row) => r.code === "E08000035")).toMatchObject({
      name: "Leeds",
      bandD: 228373,
      billing: 190374,
      police: 27828,
      combinedAuthority: null,
      fire: 8949,
      parishAveraged: true,
    });
  });

  it("the full pass files all 22 fixture authorities and leaves the 13 seed rows unchanged", async () => {
    const { england, walesRows } = await allRows();
    const { rows: seed } = await seedRows(FIXTURE_2026);
    const { rows: all, unfiled } = buildRows(england, walesRows, { mode: "all" });
    expect(unfiled).toEqual([]);
    // 19 England authorities from Table 9 plus the 3 Welsh
    // rows the fixture's composition file carries.
    expect(all).toHaveLength(22);
    const byCode = new Map(all.map((r: Row) => [r.code, r]));
    for (const s of seed) {
      const row = byCode.get(s.code)!;
      expect(row).toMatchObject({
        bandD: s.bandD,
        billing: s.billing,
        county: s.county,
        police: s.police,
        fire: s.fire,
        gla: s.gla,
        combinedAuthority: s.combinedAuthority,
        parishAveraged: s.parishAveraged,
      });
    }
  });
});

describe("the tax-year helpers the canary shares", () => {
  it("the live year turns on 1 April", () => {
    expect(currentTaxYear(new Date("2026-11-13T12:00:00Z"))).toBe("2026-27");
    expect(currentTaxYear(new Date("2027-02-01T12:00:00Z"))).toBe("2026-27");
    expect(currentTaxYear(new Date("2027-04-01T12:00:00Z"))).toBe("2027-28");
    expect(previousTaxYear("2026-27")).toBe("2025-26");
    expect(nextTaxYear("2026-27")).toBe("2027-28");
    expect(nextTaxYear("2099-00")).toBe("2100-01");
  });
});

describe("registration — runner, package and canary wiring", () => {
  it("the runner registers the loader as manual-class, directory-free and fixture-backed", () => {
    const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
    expect(runner).toContain(
      '"load-council-tax": "Council tax — the councils\' average Band D charges"',
    );
    expect(runner).toContain('runAndLog("load-council-tax", ["--file", fx("council-tax")])');
    // M5.15: registration is the schedule-registry entry now —
    // static (manual) class, 30-minute timeout; the class
    // thresholds themselves are pinned in tests/run-loaders.test.ts.
    expect(runner).toContain('{ item: "load-council-tax", cadence: "static", timeoutMinutes: 30 }');
    const directoryFree = runner.slice(
      runner.indexOf("const DIRECTORY_FREE"),
      runner.indexOf("]);", runner.indexOf("const DIRECTORY_FREE")),
    );
    expect(directoryFree).toContain('"load-council-tax"');
  });

  it("package.json carries the load script and canary.mjs runs the probe", () => {
    const pkg = readFileSync(join(process.cwd(), "package.json"), "utf8");
    expect(pkg).toContain('"load:council-tax": "node loaders/load-council-tax.mjs"');
    const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
    expect(canary).toContain('await run("mhclg-council-tax", probeCouncilTax);');
    expect(canary).toContain('from "./canary-council-tax.mjs"');
  });
});

describe("BUG-265 progress logging", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };

  // The filing describe's recording pool, repeated here:
  // that helper is scoped to its own describe.
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

  it("the seed filer logs a line every 10 authorities and a closing line, with the genuine total", async () => {
    const { rows } = await seedRows(FIXTURE_2026);
    const rec = recordingPool();
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-council-tax", log });
    await fileSeedRows(rec.pool as never, rows, "2026-27", { progress });
    expect(lines).toContainEqual(
      expect.stringMatching(/load-council-tax progress · file 10\/13 authorities \(77%\)$/),
    );
    expect(lines).toContainEqual(
      expect.stringMatching(/load-council-tax progress · file 13\/13 authorities \(100%\)$/),
    );
    expect(lines).toContainEqual(
      expect.stringMatching(/load-council-tax heartbeat · file · 10\/13 · /),
    );
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("the full filer logs a closing line with the genuine total", async () => {
    const { rows } = await seedRows(FIXTURE_2026);
    const rec = recordingPool();
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-council-tax", log });
    await fileAllRows(rec.pool as never, rows, "2026-27", { progress });
    expect(lines).toContainEqual(
      expect.stringMatching(/load-council-tax progress · file 13\/13 authorities \(100%\)$/),
    );
  });

  it("a filing failure reports the file stage with the genuine total, then still rolls back", async () => {
    const { rows } = await seedRows(FIXTURE_2026);
    const rec = recordingPool("INSERT INTO council_tax_charges");
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-council-tax", log });
    await expect(fileSeedRows(rec.pool as never, rows, "2026-27", { progress })).rejects.toThrow(
      "forced failure",
    );
    expect(lines).toContainEqual(
      expect.stringMatching(
        /load-council-tax failed · file · filed 0 of 13 · forced failure: INSERT INTO council_tax_charges · resume from re-run from scratch \(the filing transaction rolls back\)$/,
      ),
    );
    expect(rec.statements).toContain("ROLLBACK");
  });
});

describe("resume (BUG-368) — the full pass only; the seed filer is untouched", () => {
  // A fake pg pool: the staged rows, the live table and the
  // loader_checkpoint row as arrays, with just enough SQL to
  // run the full-pass filer. The 13 seed rows are cloned
  // into 350 synthetic authorities with unique codes.
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  type StagedRow = { code: string; seq: number };
  async function makeRows(n: number): Promise<Row[]> {
    const { rows: seed } = await seedRows(FIXTURE_2026);
    return Array.from({ length: n }, (_, i) => {
      const template = seed[i % seed.length];
      return { ...template, code: `E${String(10000000 + i)}` };
    });
  }
  function createFakePool() {
    let staged: StagedRow[] = [];
    let live: { code: string; taxYear: string }[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let failSwapOnce = false;
    let snapshot: {
      staged: StagedRow[];
      live: { code: string; taxYear: string }[];
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
        if (/CREATE TABLE IF NOT EXISTS council_tax_charges_stage/.test(text)) return { rows: [] };
        if (/INSERT INTO council_tax_charges_stage/.test(text)) {
          insertCalls += 1;
          if (failAfterInserts !== null && insertCalls > failAfterInserts)
            throw new Error("simulated kill: the database connection dropped mid-insert");
          for (let r = 0; r < params.length / 15; r++) {
            const b = r * 15;
            staged.push({ code: params[b] as string, seq: params[b + 14] as number });
          }
          return { rows: [], rowCount: params.length / 15 };
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
        if (/DELETE FROM council_tax_charges_stage WHERE seq >=/.test(text)) {
          staged = staged.filter((r) => r.seq < (params[0] as number));
          return { rows: [], rowCount: 0 };
        }
        if (/DELETE FROM council_tax_charges_stage/.test(text)) {
          staged = [];
          return { rows: [] };
        }
        if (/SELECT count\(\*\)::int AS n FROM council_tax_charges_stage/.test(text))
          return { rows: [{ n: staged.length }] };
        if (/DELETE FROM council_tax_charges WHERE tax_year/.test(text)) {
          if (failSwapOnce) {
            failSwapOnce = false;
            throw new Error("simulated kill: the database connection dropped mid-swap");
          }
          live = live.filter((r) => r.taxYear !== (params[0] as string));
          return { rows: [] };
        }
        if (/INSERT INTO council_tax_charges \(/.test(text)) {
          live.push(...staged.map((r) => ({ code: r.code, taxYear: "2026-27" })));
          return { rows: [] };
        }
        throw new Error(`fake pool: unhandled SQL: ${sql}`);
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
      setFailSwapOnce: () => {
        failSwapOnce = true;
      },
    };
  }
  type FakePool = ReturnType<typeof createFakePool>;
  async function runFiling(
    fake: FakePool,
    rows: Row[],
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-council-tax",
      log: (line: string) => captured.push(line),
    });
    await fileAllRows(fake.pool as never, rows as never, "2026-27", {
      progress,
      resume: { restart },
    });
    return captured;
  }

  it("kill mid-staging resumes and files every authority exactly once", async () => {
    const fake = createFakePool();
    const rows = await makeRows(350);
    // Kill after two 100-row chunks: 200 rows staged, the
    // checkpoint at 200, the rest never landed.
    const killLines: string[] = [];
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows, { lines: killLines })).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(200);
    expect(fake.checkpoints.get("load-council-tax")?.next_start_index).toBe(200);
    expect(
      killLines.some((l) =>
        /checkpoint 200\/350 authorities \(57%\) · staged 200 · resume from 200/.test(l),
      ),
    ).toBe(true);
    expect(fake.live().length).toBe(0);

    fake.setFailAfterInserts(null);
    const lines = await runFiling(fake, rows);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 200 rows staged · edition 2026-27 · resume from 200/.test(l),
      ),
    ).toBe(true);
    expect(fake.live().map((r) => r.code)).toEqual(rows.map((r) => r.code));
    // The swap cleared staging and the checkpoint together.
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-council-tax")).toBeUndefined();
  });

  it("kill during the swap resumes with staging complete and swaps cleanly", async () => {
    const fake = createFakePool();
    const rows = await makeRows(350);
    fake.setFailSwapOnce();
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    // The swap transaction rolled back: staging and the
    // checkpoint stand, the live table is untouched.
    expect(fake.staged().length).toBe(350);
    expect(fake.checkpoints.get("load-council-tax")?.next_start_index).toBe(350);
    expect(fake.live().length).toBe(0);

    const lines = await runFiling(fake, rows);
    // The resumed run stages nothing, and its filing tally
    // still closes at 350/350.
    expect(lines.some((l) => /progress · file 350\/350 authorities \(100%\)$/.test(l))).toBe(true);
    expect(fake.live().map((r) => r.code)).toEqual(rows.map((r) => r.code));
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-council-tax")).toBeUndefined();
  });

  it("a checkpoint for another tax year is discarded and the run starts from zero", async () => {
    const fake = createFakePool();
    const rows = await makeRows(350);
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(200);

    // The tax year never changes between runs of the same
    // pass, so simulate the new year by editing the stored
    // checkpoint's edition directly.
    const cp = fake.checkpoints.get("load-council-tax");
    expect(cp).toBeDefined();
    if (!cp) throw new Error("expected a checkpoint to exist");
    fake.checkpoints.set("load-council-tax", { ...cp, edition: "2025-26" });
    fake.setFailAfterInserts(null);
    const lines = await runFiling(fake, rows);
    expect(lines.some((l) => /discarding stale checkpoint · edition changed/.test(l))).toBe(true);
    expect(fake.live().map((r) => r.code)).toEqual(rows.map((r) => r.code));
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-council-tax")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakePool();
    const rows = await makeRows(350);
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(200);

    fake.setFailAfterInserts(null);
    await runFiling(fake, rows, { restart: true });
    expect(fake.live().map((r) => r.code)).toEqual(rows.map((r) => r.code));
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-council-tax")).toBeUndefined();
  });
});
