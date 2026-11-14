import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  GOLDEN,
  collectSnapshots,
  collectTitles,
  fileTitles,
  goldenChecks,
  loadCompanyOwnership,
  normalisePostcode,
  openCsvStream,
  parseTitleRow,
  resolveFileSources,
} from "../loaders/load-company-ownership.mjs";

// Company ownership loader (plan step M5.13; decisions
// D15 + D18), tested against the fixture in
// tests/fixtures/company-ownership — REAL extracts pulled
// live at the build (14 Nov 2026) from the November 2026
// CCOD/OCOD full files and the 1 Nov 2026 Companies House
// bulk snapshot: the three golden postcodes' complete
// slices. What is pinned: the golden sample-check record
// exactly (the No's proven against non-empty slices, the
// Minerva House building freehold, both snapshot states),
// the header contract, the reject-by-name discipline,
// the filer's statement order and full-replacement shape,
// and the missing-snapshot classification. Live national
// filing is proven by the build's rehearsal, not here.

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/company-ownership");
const ccodText = () => readFileSync(join(FIXTURE_DIR, "ccod.csv"), "utf8");

type TitleRow = {
  titleNumber: string;
  dataset: string;
  tenure: string;
  propertyAddress: string;
  postcode: string | null;
  proprietorName: string;
  companyNumber: string | null;
  countryIncorporated: string | null;
  pricePaid: number | null;
  dateProprietorAdded: string | null;
};

async function fixtureTitles() {
  const ccod = await collectTitles(openCsvStream(join(FIXTURE_DIR, "ccod.csv")), "ccod", null);
  const ocod = await collectTitles(openCsvStream(join(FIXTURE_DIR, "ocod.csv")), "ocod", null);
  const ccodRows: TitleRow[] = [];
  const ocodRows: TitleRow[] = [];
  await collectTitles(openCsvStream(join(FIXTURE_DIR, "ccod.csv")), "ccod", async (r: TitleRow) =>
    ccodRows.push(r),
  );
  await collectTitles(openCsvStream(join(FIXTURE_DIR, "ocod.csv")), "ocod", async (r: TitleRow) =>
    ocodRows.push(r),
  );
  return { ccod, ocod, ccodRows, ocodRows };
}

async function fixtureSnapshots(numbers: Set<string>) {
  const { found } = await collectSnapshots(
    openCsvStream(join(FIXTURE_DIR, "companies-house.csv")),
    numbers,
  );
  return found;
}

describe("the fixture load — the locked golden record, exactly", () => {
  it("files the golden slices with the measured counts and snapshot states", async () => {
    const { totals } = await loadCompanyOwnership(resolveFileSources(FIXTURE_DIR), {
      verifyOnly: true,
    });
    expect(totals.ccod).toBe(8);
    expect(totals.ocod).toBe(3);
    expect(totals.snapshots).toBe(2);
    expect(totals.numbersWanted).toBe(3);
    // The society's filed number is the one missing
    // snapshot; the three Adriatic titles carry no number.
    expect(totals.missingByNumber).toEqual(["7686"]);
    expect(totals.noNumber).toBe(3);
    expect(totals.rejects.every((r) => r.count === 0)).toBe(true);
  });

  it("Birkdale: the street's company titles are Sage Homes', and 19 Birkdale Rise is absent", async () => {
    const { ccodRows } = await fixtureTitles();
    const birkdale = ccodRows.filter((r) => r.postcode === "CM3 2JT");
    expect(birkdale.map((r) => r.titleNumber).sort()).toEqual(["AA53500", "AA53502"]);
    for (const row of birkdale) {
      expect(row.proprietorName).toBe("SAGE HOMES RP LIMITED");
      expect(row.companyNumber).toBe("11217910");
    }
    expect(ccodRows.find((r) => r.titleNumber === "AA53500")).toMatchObject({
      tenure: "Freehold",
      pricePaid: 153243,
      dateProprietorAdded: "2024-04-03",
    });
    expect(ccodRows.some((r) => r.propertyAddress.includes("19 Birkdale Rise"))).toBe(false);
  });

  it("Exeter Road: no rows at the postcode in either dataset", async () => {
    const { ccodRows, ocodRows } = await fixtureTitles();
    expect([...ccodRows, ...ocodRows].filter((r) => r.postcode === "E16 1GN")).toEqual([]);
  });

  it("Minerva House: no own-title row for Flat 4; the building freehold is Adriatic Land 11 (Guernsey, no number)", async () => {
    const { ocodRows, ccodRows } = await fixtureTitles();
    const freehold = ocodRows.find((r) => r.titleNumber === "SY876459");
    expect(freehold).toMatchObject({
      tenure: "Freehold",
      propertyAddress: "Flats 1-9 Minerva House, 12 Ceres Crescent, Epsom (KT17 1FH)",
      proprietorName: "ADRIATIC LAND 11 LIMITED",
      companyNumber: null,
      countryIncorporated: "GUERNSEY",
    });
    const all = [...ccodRows, ...ocodRows];
    expect(all.some((r) => /FLAT 4,?\s+MINERVA HOUSE/i.test(r.propertyAddress))).toBe(false);
    // The Juno House "4 Juno House" title is a different
    // building's flat — present in the slice, and not a
    // Minerva fact.
    expect(ccodRows.find((r) => r.titleNumber === "SY857898")?.propertyAddress).toBe(
      "4 Juno House, 16 Ceres Crescent, Epsom (KT17 1FH)",
    );
  });

  it("snapshots: Sage and Somy exactly as Companies House publishes; the society's number absent", async () => {
    const found = await fixtureSnapshots(new Set(["11217910", "13678133", "7686"]));
    expect(found.get("11217910")).toMatchObject({
      companyName: "SAGE HOMES RP LIMITED",
      status: "Active",
      incorporationDate: "2018-02-21",
    });
    expect(found.get("11217910")?.sicCodes).toContain(
      "68201 - Renting and operating of Housing Association real estate",
    );
    expect(found.get("13678133")).toMatchObject({
      companyName: "SOMY RESIDENTIAL LIMITED",
      status: "Active",
      incorporationDate: "2021-10-13",
    });
    expect(found.has("7686")).toBe(false);
  });

  it("golden checks pass on the fixture, and bite on tampering", async () => {
    const { ccod, ocod } = await fixtureTitles();
    const snapshots = await fixtureSnapshots(new Set(["11217910", "13678133", "7686"]));
    const base = {
      ccodGolden: ccod.goldenRows as TitleRow[],
      ocodGolden: ocod.goldenRows as TitleRow[],
      snapshots,
      edition: "2026-11",
    };
    expect(goldenChecks(base as never)).toEqual([]);

    const wrongNumber = base.ccodGolden.map((r) =>
      r.titleNumber === "AA53500" ? { ...r, companyNumber: "99999999" } : r,
    );
    expect(goldenChecks({ ...base, ccodGolden: wrongNumber } as never).join(" ")).toMatch(
      /AA53500.*company number/,
    );

    const with19 = [
      ...base.ccodGolden,
      {
        ...base.ccodGolden[0],
        titleNumber: "XX999",
        propertyAddress: "19 Birkdale Rise, Hatfield Peverel, Chelmsford (CM3 2JT)",
      },
    ];
    expect(goldenChecks({ ...base, ccodGolden: with19 } as never).join(" ")).toMatch(
      /negative control/,
    );

    const withSociety = new Map(snapshots);
    withSociety.set("7686", { companyName: "CLARION HOUSING ASSOCIATION LIMITED" } as never);
    expect(goldenChecks({ ...base, snapshots: withSociety } as never).join(" ")).toMatch(/7686/);

    const noFreehold = base.ocodGolden.filter((r) => r.titleNumber !== "SY876459");
    expect(goldenChecks({ ...base, ocodGolden: noFreehold } as never).join(" ")).toMatch(
      /SY876459/,
    );
    expect(GOLDEN.edition).toBe("2026-11");
  });
});

describe("the parse contract", () => {
  it("a renamed consumed column fails the load, naming the column", async () => {
    const renamed = ccodText().replace(",Tenure,", ",Tenure Type,");
    await expect(collectTitles(Readable.from([renamed]), "ccod", null)).rejects.toThrow(/Tenure/);
  });

  it("a short row is rejected by name and files nothing, while the rest of the file loads", async () => {
    const lines = ccodText().trimEnd().split("\n");
    const tampered = [...lines, '"XX12345","Freehold"'].join("\n");
    const rows: TitleRow[] = [];
    const stats = await collectTitles(Readable.from([tampered]), "ccod", async (r: TitleRow) =>
      rows.push(r),
    );
    expect(stats.rejectCount).toBe(1);
    expect(stats.rejects[0]).toContain("XX12345");
    expect(rows.map((r) => r.titleNumber)).not.toContain("XX12345");
    expect(stats.filed).toBe(8);
  });

  it("postcode normalisation: case and spacing repaired; a non-UK form files as no-postcode", () => {
    expect(normalisePostcode("cm3  2jt")).toEqual({ postcode: "CM3 2JT", dropped: false });
    expect(normalisePostcode("")).toEqual({ postcode: null, dropped: false });
    expect(normalisePostcode("NOT A POSTCODE")).toEqual({ postcode: null, dropped: true });
  });

  it("row validation: bad tenure, a non-numeric price and an impossible date each throw", () => {
    // A positional row in the CCOD layout (35 fields):
    // slots 2–4 and the proprietor addresses are blank.
    const baseRow = [
      "AA53500",
      "Freehold",
      "39 Birkdale Rise",
      "BRAINTREE",
      "ESSEX",
      "EAST",
      "CM3 2JT",
      "N",
      "153243",
      "SAGE HOMES RP LIMITED",
      "11217910",
      "Limited Company or Public Limited Company",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "03-04-2024",
      "N",
    ];
    const atMap: Record<string, number> = {
      "Title Number": 0,
      Tenure: 1,
      "Property Address": 2,
      District: 3,
      County: 4,
      Region: 5,
      Postcode: 6,
      "Multiple Address Indicator": 7,
      "Price Paid": 8,
      "Proprietor Name (1)": 9,
      "Company Registration No. (1)": 10,
      "Proprietorship Category (1)": 11,
      "Date Proprietor Added": 33,
      "Additional Proprietor Indicator": 34,
    };
    const idx = (patch: Record<number, string>) => {
      const copy = [...baseRow];
      for (const [k, v] of Object.entries(patch)) copy[Number(k)] = v;
      return copy;
    };
    expect(() => parseTitleRow(idx({}) as never, atMap as never, "ccod")).not.toThrow();
    expect(() =>
      parseTitleRow(idx({ 1: "Leasehold " }) as never, atMap as never, "ccod"),
    ).not.toThrow();
    expect(() => parseTitleRow(idx({ 1: "Commonhold" }) as never, atMap as never, "ccod")).toThrow(
      /Tenure/,
    );
    expect(() => parseTitleRow(idx({ 8: "153,243" }) as never, atMap as never, "ccod")).toThrow(
      /Price Paid/,
    );
    expect(() => parseTitleRow(idx({ 33: "31-02-2024" }) as never, atMap as never, "ccod")).toThrow(
      /real date/,
    );
  });
});

describe("the filer — statement order and full replacement", () => {
  function fakePool() {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql.replace(/\s+/g, " ").trim());
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    };
    return { pool: { connect: async () => client }, queries };
  }

  it("BEGIN precedes the stage create; the swap deletes the dataset's rows then inserts from the stage", async () => {
    const { pool, queries } = fakePool();
    await fileTitles(
      pool as never,
      "ccod",
      join(FIXTURE_DIR, "ccod.csv"),
      { sourceName: "test", sourceDate: "2026-11-01" },
      "2026-11-14T00:00:00Z",
    );
    const begin = queries.findIndex((q) => q === "BEGIN");
    const create = queries.findIndex((q) => q.includes("CREATE TEMP TABLE company_titles_stage"));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(begin);
    expect(queries[create]).toContain("ON COMMIT DROP");
    const insertStage = queries.find((q) => q.startsWith("INSERT INTO company_titles_stage"));
    expect(insertStage).toContain("proprietor_name");
    expect(insertStage).toContain("country_incorporated");
    const del = queries.findIndex((q) => q.startsWith("DELETE FROM company_titles WHERE dataset"));
    const swap = queries.findIndex((q) => q.startsWith("INSERT INTO company_titles ("));
    expect(del).toBeGreaterThan(create);
    expect(swap).toBeGreaterThan(del);
    expect(queries.at(-1)).toBe("COMMIT");
  });

  it("a second pass has the same full-replacement shape — no append path exists", async () => {
    const first = fakePool();
    await fileTitles(
      first.pool as never,
      "ocod",
      join(FIXTURE_DIR, "ocod.csv"),
      {
        sourceName: "test",
        sourceDate: "2026-11-01",
      },
      "2026-11-14T00:00:00Z",
    );
    const second = fakePool();
    await fileTitles(
      second.pool as never,
      "ocod",
      join(FIXTURE_DIR, "ocod.csv"),
      {
        sourceName: "test",
        sourceDate: "2026-11-01",
      },
      "2026-12-14T00:00:00Z",
    );
    expect(second.queries).toEqual(first.queries);
  });
});
