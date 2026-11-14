import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
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
