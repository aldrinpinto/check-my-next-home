import { describe, expect, it } from "vitest";

import type { CensusFacts } from "../lib/area-bundle";
import {
  buildDistrictBundle,
  cleanSettlements,
  type DistrictBundle,
  type DistrictDataSource,
  type DistrictWarningItem,
  type DistrictWarningSource,
} from "../lib/district";
import { buildDistrictResultsView, type SectionBlock } from "../lib/results";

// The district brain and its view (founder ruling, 18 Nov
// 2026), driven through a fake filed-data source: every
// aggregation is pinned from fixtures — census fragment
// sums, the flood roll-up shares computed from per-postcode
// band assignments, the sold median rules, the council-tax
// straddle, the broadband mean, the warnings composition —
// and the census section speaks in its own words at
// district grain (audit item 37: never the nearby brain's
// rung-3 refusal wording).

type Served = Extract<DistrictBundle, { kind: "district" }>;

const POSTCODES = [
  {
    postcode: "ZZ9 1AA",
    latitude: 51.7,
    longitude: 0.46,
    council: "Braintree",
    region: "East of England",
    lsoaCode: "E01000001",
    msoaCode: "E02000001",
    sourceName: "Office for National Statistics",
    sourceDate: "2024-11-01",
  },
  {
    postcode: "ZZ9 1AB",
    latitude: 51.71,
    longitude: 0.47,
    council: "Braintree",
    region: "East of England",
    lsoaCode: "E01000002",
    msoaCode: "E02000001",
    sourceName: "Office for National Statistics",
    sourceDate: "2024-11-01",
  },
  {
    postcode: "ZZ9 2AA",
    latitude: 51.72,
    longitude: 0.48,
    council: "Maldon",
    region: "East of England",
    lsoaCode: "E01000003",
    msoaCode: "E02000002",
    sourceName: "Office for National Statistics",
    sourceDate: "2024-11-01",
  },
  {
    postcode: "ZZ9 2AB",
    latitude: 51.73,
    longitude: 0.49,
    council: "Maldon",
    region: "East of England",
    lsoaCode: "E01000003",
    msoaCode: "E02000002",
    sourceName: "Office for National Statistics",
    sourceDate: "2024-11-01",
  },
];

function censusFacts(msoaCode: string, scale: 1 | 2): CensusFacts {
  const years = new Array<number>(101).fill(30);
  const fragments =
    scale === 1
      ? {
          ts007a: { total: 3000, bands: {} },
          ts007: { total: 3030, years },
          ts021: {
            total: 3000,
            categories: {},
            groups: {
              White: 2700,
              "Asian, Asian British or Asian Welsh": 150,
              "Black, Black British, Black Welsh, Caribbean or African": 60,
              "Mixed or Multiple ethnic groups": 60,
              "Other ethnic group": 30,
            },
          },
          ts030: {
            total: 3000,
            categories: {
              Christian: 1500,
              "No religion": 1200,
              Muslim: 150,
              "Not answered": 150,
            },
          },
          ts044: {
            total: 1000,
            categories: {
              Detached: 400,
              "Semi-detached": 300,
              Terraced: 200,
              "A flat, maisonette or apartment in a purpose-built block of flats": 100,
            },
          },
          ts054: {
            total: 1000,
            categories: {
              Owned: 700,
              "Owned: Owns outright": 400,
              "Owned: Owns with a mortgage or loan": 300,
              "Social rented": 100,
              "Private rented": 200,
            },
            social_rented: 100,
          },
        }
      : {
          ts007a: { total: 3000, bands: {} },
          ts007: { total: 3030, years },
          ts021: {
            total: 3000,
            categories: {},
            groups: {
              White: 2400,
              "Asian, Asian British or Asian Welsh": 300,
              "Black, Black British, Black Welsh, Caribbean or African": 150,
              "Mixed or Multiple ethnic groups": 90,
              "Other ethnic group": 60,
            },
          },
          ts030: {
            total: 3000,
            categories: {
              Christian: 1200,
              "No religion": 1500,
              Muslim: 180,
              "Not answered": 120,
            },
          },
          ts044: {
            total: 1400,
            categories: {
              Detached: 600,
              "Semi-detached": 300,
              Terraced: 300,
              "A flat, maisonette or apartment in a purpose-built block of flats": 200,
            },
          },
          ts054: {
            total: 1400,
            categories: {
              Owned: 980,
              "Owned: Owns outright": 560,
              "Owned: Owns with a mortgage or loan": 420,
              "Social rented": 140,
              "Private rented": 280,
            },
            social_rented: 140,
          },
        };
  return {
    msoaCode,
    msoaName: msoaCode,
    stats: fragments,
    sourceName: "Office for National Statistics",
    sourceDate: "2023-11-01",
  };
}

// The rows carry their postcodes (BUG-016's coverage
// count): the ten sales span two of the district's four
// postcodes, so the section's coverage is partial.
const SOLD_ROWS = [
  ...[300000, 320000, 340000, 360000, 380000, 400000].map((price, i) => ({
    price,
    saleDate: `2023-0${i + 1}-15`,
    propertyType: "D",
    postcode: "ZZ9 1AA",
  })),
  ...[200000, 210000, 220000].map((price, i) => ({
    price,
    saleDate: `2024-0${i + 1}-10`,
    propertyType: "T",
    postcode: "ZZ9 1AB",
  })),
  { price: 150000, saleDate: "2022-12-01", propertyType: "F", postcode: "ZZ9 1AB" },
];

function fakeSource(overrides: Partial<DistrictDataSource> = {}): DistrictDataSource {
  const base: DistrictDataSource = {
    postcodes: async () => POSTCODES,
    lsoaBases: async () => [
      { lsoaCode: "E01000001", residents: 1000, households: 400 },
      { lsoaCode: "E01000002", residents: 2000, households: 800 },
      { lsoaCode: "E01000003", residents: 3000, households: 1200 },
    ],
    censusRows: async () => [censusFacts("E02000001", 1), censusFacts("E02000002", 2)],
    imdDeciles: async () => ({
      deciles: [
        { lsoaCode: "E01000001", decile: 3 },
        { lsoaCode: "E01000002", decile: 3 },
        { lsoaCode: "E01000003", decile: 8 },
      ],
      sourceName: "Ministry of Housing, Communities and Local Government",
      sourceDate: "2019-09-26",
    }),
    councilTax: async (council) =>
      council === "Braintree"
        ? {
            authorityName: "Braintree",
            nation: "england" as const,
            taxYear: "2025/26",
            bandDAreaAveragePence: 214500,
            parishAveraged: true,
            sourceName: "Ministry of Housing, Communities and Local Government",
            sourceDate: "2025-03-01",
          }
        : null,
    soldFacts: async () => ({
      rows: SOLD_ROWS,
      sourceName: "HM Land Registry",
      sourceDate: "2025-10-01",
    }),
    broadbandAnswers: async () => [
      { basis: "premises", snapshot: "December 2024", gigabitCapablePct: 80, superfast30Pct: 90 },
      { basis: "premises", snapshot: "December 2024", gigabitCapablePct: 60, superfast30Pct: 95 },
      { basis: "premises", snapshot: "December 2024", gigabitCapablePct: 100, superfast30Pct: 100 },
    ],
    mobileAnswers: async () => [
      { lauaName: "Braintree", snapshot: "December 2024", fourGOutdoorAtLeastOnePct: 97 },
      { lauaName: "Braintree", snapshot: "December 2024", fourGOutdoorAtLeastOnePct: 97 },
      { lauaName: "Maldon", snapshot: "December 2024", fourGOutdoorAtLeastOnePct: null },
    ],
    schools: async () => ({
      rows: [
        { phase: "Primary", selective: false, ofstedRating: "Good" },
        { phase: "Primary", selective: false, ofstedRating: "Good" },
        { phase: "Primary", selective: false, ofstedRating: "Outstanding" },
        { phase: "Primary", selective: false, ofstedRating: null },
        { phase: "Secondary", selective: true, ofstedRating: "Good" },
        { phase: "Secondary", selective: false, ofstedRating: null },
        { phase: "All-through", selective: false, ofstedRating: "Requires improvement" },
      ],
      sourceName: "Department for Education",
      sourceDate: "2025-09-01",
    }),
    healthCounts: async () => [
      { serviceType: "gp_practice", count: 3 },
      { serviceType: "gp_branch_surgery", count: 1 },
      { serviceType: "dentist", count: 2 },
      { serviceType: "pharmacy", count: 4 },
    ],
    stations: async () => ["Hatfield Peverel", "Southminster"],
    pickingHomes: async () => 12345,
    places: async () => ({
      localities: [
        { name: "HATFIELD PEVEREL", filings: 12 },
        { name: "DANBURY", filings: 9 },
      ],
      towns: [{ name: "CHELMSFORD", filings: 40 }],
      counties: ["ESSEX"],
      settlementPostcodes: [
        { locality: "HATFIELD PEVEREL", postcode: "ZZ9 1AA" },
        { locality: "DANBURY", postcode: "ZZ9 2AA" },
      ],
    }),
    floodFacts: async (layer) => {
      if (layer === "rofrs") {
        return {
          filedCount: 500,
          covered: true,
          assignments: [
            { postcode: "ZZ9 1AA", label: "High" },
            { postcode: "ZZ9 1AB", label: "Medium" },
            { postcode: "ZZ9 2AA", label: null },
            { postcode: "ZZ9 2AB", label: null },
          ],
          sourceName: "Environment Agency",
          sourceDate: "2025-06-01",
        };
      }
      if (layer === "rofsw") {
        return {
          filedCount: 300,
          covered: true,
          assignments: [
            { postcode: "ZZ9 1AA", label: "High" },
            { postcode: "ZZ9 1AB", label: "Low" },
            { postcode: "ZZ9 2AA", label: "Low" },
            { postcode: "ZZ9 2AB", label: null },
          ],
          sourceName: "Environment Agency",
          sourceDate: "2025-06-01",
        };
      }
      return {
        filedCount: 200,
        covered: true,
        assignments: [
          { postcode: "ZZ9 1AA", label: "FZ3" },
          { postcode: "ZZ9 1AB", label: null },
          { postcode: "ZZ9 2AA", label: "FZ2" },
          { postcode: "ZZ9 2AB", label: null },
        ],
        sourceName: "Environment Agency",
        sourceDate: "2025-06-01",
      };
    },
    defenceWatercourses: async () => ["River Chelmer"],
    airSquares: async () => ({
      squares: [
        { year: 2024, no2: 8, pm25: 5, pm10: 9 },
        { year: 2024, no2: 14.5, pm25: 7.25, pm10: 12 },
        { year: 2023, no2: 99, pm25: 99, pm10: 99 },
      ],
      sourceName: "Department for Environment, Food and Rural Affairs",
      sourceDate: "2025-01-01",
    }),
    crimeFacts: async () => null,
  };
  return { ...base, ...overrides };
}

const WARNING_ITEMS: DistrictWarningItem[] = [
  {
    severity: "Flood warning",
    severityLevel: 2,
    description: "River Chelmer at Hatfield Peverel",
    riverOrSea: "River Chelmer",
    latitude: 51.705,
    longitude: 0.465,
  },
  {
    severity: "Flood warning",
    severityLevel: 2,
    description: "River Chelmer at Hatfield Peverel",
    riverOrSea: "River Chelmer",
    latitude: 51.706,
    longitude: 0.466,
  },
  {
    severity: "Flood alert",
    severityLevel: 3,
    description: "Far away stream",
    riverOrSea: null,
    latitude: 54.0,
    longitude: -2.0,
  },
  {
    severity: "Warning no longer in force",
    severityLevel: 4,
    description: "River Chelmer at Hatfield Peverel",
    riverOrSea: "River Chelmer",
    latitude: 51.705,
    longitude: 0.465,
  },
  {
    severity: "Flood alert",
    severityLevel: 3,
    description: "No-point brook",
    riverOrSea: null,
    latitude: null,
    longitude: null,
  },
];

function warningSource(items: DistrictWarningItem[] | Error): DistrictWarningSource {
  return {
    warningsNear: async () => {
      if (items instanceof Error) throw items;
      return items;
    },
  };
}

async function servedBundle(
  overrides: Partial<DistrictDataSource> = {},
  warnings: DistrictWarningItem[] | Error | null = WARNING_ITEMS,
): Promise<Served> {
  const bundle = await buildDistrictBundle("ZZ9", fakeSource(overrides), {
    warningSource: warnings === null ? undefined : warningSource(warnings),
  });
  if (bundle.kind !== "district") throw new Error("expected a district bundle");
  return bundle;
}

function sectionBlocks(bundle: Served, tabId: string, key: string): SectionBlock[] {
  const view = buildDistrictResultsView(bundle);
  const tab = view.tabs.find((candidate) => candidate.id === tabId);
  const section = tab?.sections.find((candidate) => candidate.key === key);
  if (!section) throw new Error(`no section ${key} in tab ${tabId}`);
  return section.blocks;
}

function blockTexts(blocks: SectionBlock[]): string {
  return JSON.stringify(blocks);
}

describe("district bundle — head and the district itself", () => {
  it("derives membership, councils and the post town from filed rows only", async () => {
    const bundle = await servedBundle();
    expect(bundle.head.postcodeCount).toBe(4);
    expect(bundle.head.lsoaCount).toBe(3);
    expect(bundle.head.msoaCount).toBe(2);
    expect(bundle.head.councils).toEqual(["Braintree", "Maldon"]);
    expect(bundle.head.postTown).toBe("Chelmsford");
    // The county chip's data (founder fix batch, audit
    // item 4): the district's filed Price Paid counties,
    // in display form — the sample's first chip is the
    // county, not the region the page used to serve.
    expect(bundle.head.counties).toEqual(["Essex"]);
    expect(bundle.sections.district.settlements).toEqual(["Danbury", "Hatfield Peverel"]);
    expect(bundle.sections.district.homes).toBe(12345);
    expect(bundle.sections.district.residents).toBe(6000);
    expect(bundle.sections.district.households).toBe(2400);
    expect(bundle.sections.bridge.postcodes).toEqual(["ZZ9 1AA", "ZZ9 1AB", "ZZ9 2AA", "ZZ9 2AB"]);
  });

  it("filters filed fragments that are not settlement names at the derivation (audit item 9)", async () => {
    const bundle = await servedBundle({
      places: async () => ({
        localities: [
          { name: "HATFIELD PEVEREL", filings: 12 },
          // A postcode filed in the locality column (the
          // audit's EX2 witness, "Ex2 7ub").
          { name: "EX2 7UB", filings: 1 },
          // A trailing-comma fragment of a split address.
          { name: "DANBURY,", filings: 1 },
          // A council's full authority name is never a
          // settlement.
          { name: "BRAINTREE DISTRICT COUNCIL", filings: 1 },
          { name: "DANBURY", filings: 9 },
          // A settlement that shares its council's short
          // name is honestly a settlement and stays.
          { name: "MALDON", filings: 7 },
        ],
        towns: [{ name: "CHELMSFORD", filings: 40 }],
        counties: ["ESSEX"],
        settlementPostcodes: [],
      }),
    });
    expect(bundle.sections.district.settlements).toEqual(["Danbury", "Hatfield Peverel", "Maldon"]);
  });

  it("cleans the register's spelling variants and county forms at the same derivation (BUG-034)", async () => {
    // The parity re-check's CM1 witness, in the
    // register's filed forms: the place page served
    // "Chelmsford, Chemlsford, Ess, Essex and 5 more"
    // from filings in this shape. The district page
    // reads the same shared filter, so its own set is
    // the cleaned one too.
    const bundle = await servedBundle({
      places: async () => ({
        localities: [
          { name: "CHELMSFORD", filings: 900 },
          { name: "CHEMLSFORD", filings: 2 },
          { name: "ESS", filings: 1 },
          { name: "ESSEX", filings: 3 },
          { name: "SPRINGFIELD", filings: 60 },
          { name: "BROOMFIELD", filings: 55 },
          { name: "CHELMER VILLAGE", filings: 30 },
        ],
        towns: [{ name: "CHELMSFORD", filings: 900 }],
        counties: ["ESSEX"],
        settlementPostcodes: [],
      }),
    });
    expect(bundle.sections.district.settlements).toEqual([
      "Broomfield",
      "Chelmer Village",
      "Chelmsford",
      "Springfield",
    ]);
  });
});

describe("cleanSettlements — the shared settlement filter (BUG-034)", () => {
  // The parity re-check's three Chelmsford witness
  // sets, in the register's filed forms with their
  // filing counts, pinned to their cleaned outputs.
  // The founder's ruling (20 Nov 2026): drop the
  // fragments, collapse spelling variants to the
  // most-filed form, and never merge real distinct
  // settlements.
  const filed = (name: string, filings: number) => ({ name, filings });

  it("CM1: the county and its fragment go, the misspelling collapses, distinct settlements survive", () => {
    expect(
      cleanSettlements(
        [
          filed("CHELMSFORD", 900),
          filed("CHEMLSFORD", 2),
          filed("ESS", 1),
          filed("ESSEX", 3),
          filed("SPRINGFIELD", 60),
          filed("BROOMFIELD", 55),
          filed("CHELMER VILLAGE", 30),
          filed("GREAT BADDOW", 45),
        ],
        ["ESSEX"],
      ),
    ).toEqual(["Broomfield", "Chelmer Village", "Chelmsford", "Great Baddow", "Springfield"]);
  });

  it("CM11: a dropped-letter variant collapses to the most-filed form", () => {
    expect(
      cleanSettlements(
        [
          filed("BILLERCAY", 3),
          filed("BILLERICAY", 700),
          filed("CHELMSFORD", 200),
          filed("DOWNHAM", 40),
          filed("RAMSDEN HEATH", 25),
          filed("STOCK", 35),
        ],
        ["ESSEX"],
      ),
    ).toEqual(["Billericay", "Chelmsford", "Downham", "Ramsden Heath", "Stock"]);
  });

  it("CM2: two misspellings of one name collapse together; Great and Little Baddow both survive", () => {
    expect(
      cleanSettlements(
        [
          filed("BURNHAM-ON-CROUCH", 300),
          filed("CHELMESFORD", 2),
          filed("CHELMSFORD", 500),
          filed("CHEMLSFORD", 1),
          filed("GALLYWOOD", 40),
          filed("GREAT BADDOW", 45),
          filed("LITTLE BADDOW", 20),
          filed("SANDON", 30),
        ],
        ["ESSEX"],
      ),
    ).toEqual([
      "Burnham-on-crouch",
      "Chelmsford",
      "Gallywood",
      "Great Baddow",
      "Little Baddow",
      "Sandon",
    ]);
  });

  it("equal filings fall to standing among the variants: the hub form survives", () => {
    expect(
      cleanSettlements(
        [filed("CHEMLSFORD", 5), filed("CHELMSFORD", 5), filed("CHELMESFORD", 5)],
        ["ESSEX"],
      ),
    ).toEqual(["Chelmsford"]);
  });

  it("a settlement filed only under a misspelling keeps that form — no better form is filed", () => {
    expect(cleanSettlements([filed("CHEMLSFORD", 4)], ["ESSEX"])).toEqual(["Chemlsford"]);
  });

  it("without filed counties the filter cannot know a county form, and keeps it", () => {
    expect(cleanSettlements([filed("ESSEX", 10), filed("CHELMSFORD", 900)])).toEqual([
      "Chelmsford",
      "Essex",
    ]);
  });
});

describe("district bundle — census sums (audit item 37)", () => {
  it("sums integer counts exactly across the district's MSOAs", async () => {
    const bundle = await servedBundle();
    const census = bundle.sections.census;
    expect(census.state).toBe("served");
    expect(census.residentsTotal).toBe(6000);
    expect(census.householdsTotal).toBe(2400);
    expect(census.ageYears?.[50]).toBe(60);
    expect(census.medianAge?.value).toBe(50.5);
    expect(census.socialRented).toEqual({ count: 240, total: 2400, pct: 10 });
    const tenure = census.tables.find((table) => table.code === "ts054");
    expect(tenure?.rows.find((row) => row.label === "Owned")?.count).toBe(1680);
  });

  it("speaks in its own words at district grain in the view — never the rung-3 refusal wording", async () => {
    const bundle = await servedBundle();
    const view = buildDistrictResultsView(bundle);
    const censusText = blockTexts(sectionBlocks(bundle, "neighbourhood", "census"));
    expect(censusText).toContain("The typical (median) age is 50½");
    expect(censusText).toContain(
      "Owning and renting — 7 in 10 households across ZZ9 own their home: 40% outright and 30% with a mortgage. 10% rent from a social landlord, 20% rent privately.",
    );
    expect(censusText).toContain("The people here — 85 in 100 residents are White");
    // The Religion headline in the sample's form (founder
    // fix batch, audit item 7): the two largest groups
    // named, the remaining named religions combined, the
    // not-answered share last as "Not stated" — never the
    // first four rows as filed.
    expect(censusText).toContain(
      "Religion — Christian: 45% · No religion: 45% · Other religions combined: 6% · Not stated: 5%",
    );
    // The homes-themselves headline is retired (audit
    // item 7): the sample carries Family make-up in its
    // place — a line no filed table can compose today
    // (no household-composition table is filed), so the
    // headline simply goes; the ts044 depth stays in the
    // bundle's tables.
    expect(censusText).not.toContain("The homes themselves");
    expect(censusText).toContain("summed across the 2 Census areas");
    const wholeView = JSON.stringify(view);
    expect(wholeView).not.toContain("need an exact postcode");
    expect(wholeView).not.toContain("needs an exact postcode");
    expect(wholeView).not.toContain("Census figures need");
  });

  it("serves the census not-filed line where no area files", async () => {
    const bundle = await servedBundle({ censusRows: async () => [] });
    expect(bundle.sections.census.state).toBe("not-filed");
    expect(bundle.sections.census.line).toContain("Census 2021 figures are not filed");
  });
});

describe("district bundle — crime", () => {
  it("serves its own honest line: no LSOA-grain filing exists, and 1-mile circles would double-count", async () => {
    const bundle = await servedBundle();
    const crime = bundle.sections.crime;
    expect(crime.state).toBe("not-filed");
    expect(crime.line).toContain("would count the same crimes again and again");
    const viewText = blockTexts(sectionBlocks(bundle, "neighbourhood", "crime"));
    expect(viewText).toContain("no district crime total that does not double-count");
  });

  it("serves the D77(a) pair when a true total is filed, under the England-base guard", async () => {
    const bundle = await servedBundle({
      crimeFacts: async () => ({
        total: 720,
        windowFrom: "2024-10",
        windowTo: "2025-09",
        categories: { burglary: 120, "violent-crime": 600, shoplifting: 0 },
        residents: 6000,
        national: { total: 5400000, residents: 60000000 },
        sourceName: "Police.uk",
        sourceDate: "2025-11-01",
      }),
    });
    const crime = bundle.sections.crime;
    expect(crime.state).toBe("served");
    expect(crime.total).toBe(720);
    expect(crime.per1000).toBe(120);
    expect(crime.windowLine).toBe("October 2024 to September 2025");
    expect(crime.england?.englandPer1000).toBe(90);
    expect(crime.england?.multiple).toBe(1.3);
    expect(crime.england?.line).toContain("about 1.3 times the England figure");
    expect(crime.categories).toEqual([
      { slug: "violent-crime", label: "Violence and sexual offences", count: 600 },
      { slug: "burglary", label: "Burglary", count: 120 },
    ]);
    const bars = sectionBlocks(bundle, "neighbourhood", "crime").find(
      (block) => block.type === "bars",
    );
    expect(bars?.type === "bars" && bars.rows.map((row) => row.pctOfMax)).toEqual([100, 75]);
  });

  it("withholds the England pair where the national base is too thin", async () => {
    const bundle = await servedBundle({
      crimeFacts: async () => ({
        total: 720,
        windowFrom: "2024-10",
        windowTo: "2025-09",
        categories: { burglary: 120 },
        residents: 6000,
        national: { total: 900000, residents: 10000000 },
        sourceName: "Police.uk",
        sourceDate: "2025-11-01",
      }),
    });
    expect(bundle.sections.crime.state).toBe("served");
    expect(bundle.sections.crime.england).toBeNull();
  });
});

describe("district bundle — sold prices (D23)", () => {
  it("states the district median at five or more sales, split by type with folding", async () => {
    const bundle = await servedBundle();
    const sold = bundle.sections.soldPrices;
    expect(sold.state).toBe("served");
    expect(sold.count).toBe(10);
    expect(sold.median).toBe(310000);
    expect(sold.spanLine).toBe("1 December 2022 to 10 March 2024");
    expect(sold.types).toEqual([{ code: "D", label: "Detached", count: 6, median: 350000 }]);
    expect(sold.foldedTypeCount).toBe(4);
    // Coverage (fix batch, 19 Nov 2026 — BUG-016): the
    // ten sales span two of the district's four
    // postcodes, so the section names its coverage and
    // the district-wide closing form does NOT serve.
    expect(sold.postcodesCovered).toBe(2);
    const viewText = blockTexts(sectionBlocks(bundle, "home", "sold-prices"));
    expect(viewText).toContain("£310,000");
    expect(viewText).toContain(
      "Sales are filed for 2 of the district's 4 postcodes so far — these figures cover those postcodes only",
    );
    expect(viewText).toContain("do not value any one home");
    expect(viewText).not.toContain("The district median across ZZ9 as a whole");
  });

  it("at full coverage the sold section keeps its district-wide closing line (BUG-016)", async () => {
    const bundle = await servedBundle({
      soldFacts: async () => ({
        rows: [
          ...SOLD_ROWS,
          { price: 500000, saleDate: "2024-05-01", propertyType: "D", postcode: "ZZ9 2AA" },
          { price: 510000, saleDate: "2024-06-01", propertyType: "D", postcode: "ZZ9 2AB" },
        ],
        sourceName: "HM Land Registry",
        sourceDate: "2025-10-01",
      }),
    });
    expect(bundle.sections.soldPrices.postcodesCovered).toBe(4);
    const viewText = blockTexts(sectionBlocks(bundle, "home", "sold-prices"));
    expect(viewText).toContain("The district median across ZZ9 as a whole");
    expect(viewText).not.toContain("postcodes so far");
  });

  it("a part-filed census names its coverage in the Households line and the closing line (BUG-016)", async () => {
    // One of the district's two Census areas filed: the
    // sums cover that one area, and both lines that
    // present them say so — the header's whole-district
    // residents figure (6,000 from the LSOA bases) no
    // longer stands unexplained beside a part-filed sum.
    const bundle = await servedBundle({
      censusRows: async () => [censusFacts("E02000001", 1)],
    });
    expect(bundle.sections.census.msoaCount).toBe(1);
    expect(bundle.head.msoaCount).toBe(2);
    const viewText = blockTexts(sectionBlocks(bundle, "neighbourhood", "census"));
    expect(viewText).toContain("the 1 of the district's 2 Census areas filed so far");
    expect(viewText).toContain("summed across the 1 of the district's 2 Census areas filed so far");
    expect(viewText).not.toContain("this district's postcodes fall in");
  });

  it("a fully filed census keeps its district-wide closing line (BUG-016)", async () => {
    const bundle = await servedBundle();
    const viewText = blockTexts(sectionBlocks(bundle, "neighbourhood", "census"));
    expect(viewText).toContain(
      "summed across the 2 Census areas this district's postcodes fall in",
    );
    expect(viewText).not.toContain("filed so far");
  });

  it("a part-filed deprivation spread names its coverage (BUG-016)", async () => {
    const bundle = await servedBundle({
      imdDeciles: async () => ({
        deciles: [
          { lsoaCode: "E01000001", decile: 3 },
          { lsoaCode: "E01000002", decile: 8 },
        ],
        sourceName: "Ministry of Housing, Communities and Local Government",
        sourceDate: "2019-09-26",
      }),
    });
    expect(bundle.sections.deprivation.areasCounted).toBe(2);
    expect(bundle.head.lsoaCount).toBe(3);
    const viewText = blockTexts(sectionBlocks(bundle, "neighbourhood", "deprivation"));
    expect(viewText).toContain("the 2 of ZZ9's 3 small areas filed so far");
  });

  it("states no median below five sales", async () => {
    const bundle = await servedBundle({
      soldFacts: async () => ({
        rows: SOLD_ROWS.slice(0, 3),
        sourceName: "HM Land Registry",
        sourceDate: "2025-10-01",
      }),
    });
    expect(bundle.sections.soldPrices.count).toBe(3);
    expect(bundle.sections.soldPrices.median).toBeNull();
    const viewText = blockTexts(sectionBlocks(bundle, "home", "sold-prices"));
    expect(viewText).toContain("Too few sales are filed to state a district median");
  });
});

describe("district bundle — deprivation, council tax, connectivity", () => {
  it("counts the district's small areas per decile — a spread, never a score", async () => {
    const bundle = await servedBundle();
    const deprivation = bundle.sections.deprivation;
    expect(deprivation.state).toBe("served");
    expect(deprivation.counts).toEqual([0, 0, 2, 0, 0, 0, 0, 1, 0, 0]);
    expect(deprivation.areasCounted).toBe(3);
  });

  it("serves every council the district straddles, filed and unfiled apart", async () => {
    const bundle = await servedBundle();
    const tax = bundle.sections.councilTax;
    expect(tax.councils).toHaveLength(1);
    expect(tax.councils[0].authorityName).toBe("Braintree");
    expect(tax.councils[0].bandDAreaAveragePence).toBe(214500);
    expect(tax.unfiledCouncils).toEqual(["Maldon"]);
    // Council tax is its own section again (founder fix
    // batch, audit item 8 — the sample never merged it
    // into a Costs section).
    const viewText = blockTexts(sectionBlocks(bundle, "home", "council-tax"));
    expect(viewText).toContain("Band D £2,145.00 a year");
    expect(viewText).toContain("Maldon — its council tax charges are not filed yet.");
  });

  it("averages the filed per-postcode shares for broadband and dedupes mobile areas", async () => {
    const bundle = await servedBundle();
    const connectivity = bundle.sections.connectivity;
    expect(connectivity.broadband?.postcodesCounted).toBe(3);
    expect(connectivity.broadband?.gigabitMeanPct).toBe(80);
    expect(connectivity.broadband?.superfastMeanPct).toBe(95);
    expect(connectivity.mobile?.areas).toEqual([
      { lauaName: "Braintree", fourGOutdoorAtLeastOnePct: 97 },
      { lauaName: "Maldon", fourGOutdoorAtLeastOnePct: null },
    ]);
    const viewText = blockTexts(sectionBlocks(bundle, "home", "connectivity"));
    expect(viewText).toContain("Gigabit-capable: 80% of premises on average.");
    expect(viewText).toContain(
      "Braintree — 4G outdoors from at least one network covers 97% of the area.",
    );
    expect(viewText).toContain("Ofcom does not publish a 4G outdoor figure for this area.");
  });
});

describe("district bundle — schools and everyday counts", () => {
  it("counts phases, grammars and Ofsted grades in their published order", async () => {
    const bundle = await servedBundle();
    const schools = bundle.sections.schools;
    expect(schools.counted).toBe(7);
    expect(schools.primary).toBe(4);
    expect(schools.secondary).toBe(2);
    expect(schools.allThrough).toBe(1);
    expect(schools.grammar).toBe(1);
    expect(schools.ofsted).toEqual([
      { rating: "Outstanding", count: 1 },
      { rating: "Good", count: 3 },
      { rating: "Requires improvement", count: 1 },
    ]);
    expect(schools.notYetInspected).toBe(2);
    const everyday = bundle.sections.everyday;
    expect(everyday.gp).toBe(4);
    expect(everyday.dentists).toBe(2);
    expect(everyday.pharmacies).toBe(4);
    expect(everyday.stations).toEqual(["Hatfield Peverel", "Southminster"]);
  });
});

describe("district bundle — the flood roll-up", () => {
  it("computes band shares from the per-postcode assignments, layers never merged", async () => {
    const bundle = await servedBundle();
    const flood = bundle.sections.flood;
    expect(flood.state).toBe("served");
    expect(flood.countedPostcodes).toBe(4);
    expect(flood.riversSea?.buckets.map((bucket) => [bucket.label, bucket.pct])).toEqual([
      ["High", 25],
      ["Medium", 25],
      ["Low", 0],
      ["Very low", 0],
      ["No band published", 50],
    ]);
    expect(flood.surfaceWater?.buckets.map((bucket) => [bucket.label, bucket.pct])).toEqual([
      ["High", 25],
      ["Medium", 0],
      ["Low", 50],
      ["Below the lowest published band", 25],
    ]);
    expect(flood.zones).toEqual({ zone3Pct: 25, zone2Pct: 25 });
    expect(flood.watercourses).toEqual(["River Chelmer"]);
    expect(flood.honestyLine).toContain("District shares describe the district");
    const viewText = blockTexts(sectionBlocks(bundle, "home", "flood"));
    expect(viewText).toContain("Flooding from rivers and the sea");
    expect(viewText).toContain("Flooding from surface water (heavy rain)");
    expect(viewText).toContain("Flood Zone 3");
    // The sample's flood furniture the filed data can fill
    // honestly (founder fix batch, audit item 10): the
    // rivers & sea block carries its "Where it touches…"
    // narrative from the filed defence watercourses, and
    // the roll-up carries its method box.
    expect(viewText).toContain(
      "Where it touches ZZ9: flood defences are recorded along the River Chelmer within 2 miles of the district's postcodes.",
    );
    expect(viewText).toContain("How the roll-up is built");
    expect(viewText).not.toContain("Flood defences are recorded along");
  });

  it("serves the not-filed state where a layer files no shapes", async () => {
    const bundle = await servedBundle({
      floodFacts: async () => ({
        filedCount: 0,
        covered: false,
        assignments: [],
        sourceName: null,
        sourceDate: null,
      }),
    });
    expect(bundle.sections.flood.state).toBe("not-filed");
    expect(bundle.sections.flood.line).toContain("The flood maps are not filed yet");
  });

  it("serves the honest not-filed line where the filed layers do not cover this district (audit item 14)", async () => {
    // The one dishonest surface the audit found: the
    // layers ARE filed (for another part of the country),
    // every assignment reads null, and the old guard —
    // the layer table is non-empty — printed a computed
    // "No band published 100%". Coverage is now a fact
    // per district: uncovered serves the not-filed form,
    // never a share.
    const uncovered = {
      filedCount: 500,
      covered: false,
      assignments: POSTCODES.map((row) => ({ postcode: row.postcode, label: null })),
      sourceName: "Environment Agency",
      sourceDate: "2025-06-01",
    };
    const bundle = await servedBundle({ floodFacts: async () => uncovered });
    const flood = bundle.sections.flood;
    expect(flood.state).toBe("not-filed");
    expect(flood.line).toBe(
      "The flood maps are not filed for this district yet, so no district flood answer can be given yet.",
    );
    expect(flood.riversSea).toBeNull();
    expect(flood.surfaceWater).toBeNull();
    expect(flood.zones).toBeNull();
    const viewText = blockTexts(sectionBlocks(bundle, "home", "flood"));
    expect(viewText).toContain("not filed for this district yet");
    expect(viewText).not.toContain("No band published");
  });

  it("serves the covered layer's roll-up and the uncovered layer's own line where coverage is mixed", async () => {
    const bundle = await servedBundle({
      floodFacts: async (layer) => {
        if (layer === "rofsw") {
          return {
            filedCount: 300,
            covered: false,
            assignments: POSTCODES.map((row) => ({ postcode: row.postcode, label: null })),
            sourceName: "Environment Agency",
            sourceDate: "2025-06-01",
          };
        }
        if (layer === "rofrs") {
          return {
            filedCount: 500,
            covered: true,
            assignments: [
              { postcode: "ZZ9 1AA", label: "High" },
              { postcode: "ZZ9 1AB", label: "Medium" },
              { postcode: "ZZ9 2AA", label: null },
              { postcode: "ZZ9 2AB", label: null },
            ],
            sourceName: "Environment Agency",
            sourceDate: "2025-06-01",
          };
        }
        return {
          filedCount: 200,
          covered: true,
          assignments: [
            { postcode: "ZZ9 1AA", label: "FZ3" },
            { postcode: "ZZ9 1AB", label: null },
            { postcode: "ZZ9 2AA", label: "FZ2" },
            { postcode: "ZZ9 2AB", label: null },
          ],
          sourceName: "Environment Agency",
          sourceDate: "2025-06-01",
        };
      },
    });
    const flood = bundle.sections.flood;
    expect(flood.state).toBe("served");
    expect(flood.riversSea).not.toBeNull();
    expect(flood.surfaceWater).toBeNull();
    const viewText = blockTexts(sectionBlocks(bundle, "home", "flood"));
    expect(viewText).toContain("Flooding from rivers and the sea");
    expect(viewText).toContain("The surface water flood map is not filed for this district yet.");
    expect(viewText).not.toContain("Flooding from surface water (heavy rain)");
  });

  it("composes live warnings over the district's spread: severity 1–3 only, deduped, far areas out, point-less warnings kept", async () => {
    const bundle = await servedBundle();
    const warnings = bundle.sections.flood.warnings;
    expect(warnings.state).toBe("warnings");
    expect(warnings.areas).toEqual([
      { severity: "Flood warning", description: "River Chelmer at Hatfield Peverel" },
      { severity: "Flood alert", description: "No-point brook" },
    ]);
    expect(warnings.line).toBe(
      "2 live flood warnings are in force for areas in or around ZZ9 just now.",
    );
    expect(buildDistrictResultsView(bundle).floodWarningsState).toBe("warnings");
  });

  it("serves the none and unavailable warning states", async () => {
    const none = await servedBundle({}, []);
    expect(none.sections.flood.warnings.state).toBe("none");
    expect(none.sections.flood.warnings.line).toContain("No live flood warnings");
    const failed = await servedBundle({}, new Error("feed down"));
    expect(failed.sections.flood.warnings.state).toBe("unavailable");
    const noSource = await servedBundle({}, null);
    expect(noSource.sections.flood.warnings.state).toBe("unavailable");
  });
});

describe("district bundle — air range", () => {
  it("ranges over the latest year's squares only", async () => {
    const bundle = await servedBundle();
    const air = bundle.sections.air;
    expect(air.state).toBe("served");
    expect(air.year).toBe(2024);
    expect(air.squaresCounted).toBe(2);
    expect(air.no2).toEqual({ min: 8, max: 14.5 });
    expect(air.pm25).toEqual({ min: 5, max: 7.25 });
    const viewText = blockTexts(sectionBlocks(bundle, "neighbourhood", "air"));
    expect(viewText).toContain("NO₂ 8–14.5 µg/m³");
    expect(viewText).toContain("MODELLED");
  });
});

describe("district bundle — nation gates", () => {
  it("keeps Scotland and Northern Ireland on the old rung-3 behaviour whole", async () => {
    const scottish = await buildDistrictBundle(
      "ZZ9",
      fakeSource({
        postcodes: async () =>
          POSTCODES.map((row) => ({ ...row, lsoaCode: `S01${row.lsoaCode.slice(3)}` })),
      }),
    );
    expect(scottish).toEqual({ kind: "not-covered", outward: "ZZ9", nation: "scotland" });
    const ni = await buildDistrictBundle(
      "ZZ9",
      fakeSource({
        postcodes: async () =>
          POSTCODES.map((row) => ({ ...row, lsoaCode: `N09${row.lsoaCode.slice(3)}` })),
      }),
    );
    expect(ni).toEqual({
      kind: "not-covered",
      outward: "ZZ9",
      nation: "northern-ireland",
    });
  });

  it("gives Welsh districts the page, with flood and deprivation on their not-covered lines", async () => {
    const bundle = await buildDistrictBundle(
      "ZZ9",
      fakeSource({
        postcodes: async () =>
          POSTCODES.map((row) => ({ ...row, lsoaCode: `W01${row.lsoaCode.slice(3)}` })),
      }),
    );
    if (bundle.kind !== "district") throw new Error("expected a district bundle");
    expect(bundle.sections.flood.state).toBe("not-covered");
    expect(bundle.sections.flood.line).toContain("not covered for Wales");
    expect(bundle.sections.deprivation.state).toBe("not-covered");
    expect(bundle.sections.deprivation.line).toContain(
      "Wales and Scotland publish their own indices",
    );
  });
});

describe("district view — the results layout system, no upsell", () => {
  it("distributes the twelve sections across the four D76 tabs in the results groupings", async () => {
    const bundle = await servedBundle();
    const view = buildDistrictResultsView(bundle);
    expect(view.tabs.map((tab) => tab.label)).toEqual([
      "Family Checks",
      "The Neighbourhood",
      "Home, Costs & Risks",
      "What's Nearby",
    ]);
    expect(view.tabs.map((tab) => tab.sections.map((section) => section.key))).toEqual([
      ["schools"],
      ["district", "census", "crime", "deprivation", "air"],
      ["sold-prices", "council-tax", "connectivity", "flood"],
      ["everyday"],
    ]);
  });

  it("carries no upsell anywhere: no pills, no buy bar, no report link, no upsell blocks", async () => {
    const bundle = await servedBundle();
    const view = buildDistrictResultsView(bundle);
    expect(view.pills).toBeNull();
    expect(view.buyBar).toBeNull();
    expect(view.reportHref).toBeNull();
    expect(view.calculators).toBeNull();
    const allBlocks = view.tabs.flatMap((tab) => tab.sections.flatMap((section) => section.blocks));
    expect(allBlocks.some((block) => block.type === "upsell")).toBe(false);
    expect(JSON.stringify(view)).not.toContain("£4.99");
    expect(JSON.stringify(view)).not.toContain("Get the full report");
  });

  it("offers the bridge as the only forward path, its links named for the settlements they land in", async () => {
    const bundle = await servedBundle();
    const view = buildDistrictResultsView(bundle);
    expect(view.bridge?.heading).toBe("Checking one home in ZZ9?");
    // The sample's bridge dress (founder fix batch, audit
    // item 5): named-area postcode links — a filed
    // postcode that lands in the named settlement — never
    // the old raw postcode chips with a count of the rest.
    expect(view.bridge?.links).toEqual([
      { label: "ZZ9 2AA · Danbury", href: "/search/home?postcode=ZZ9+2AA" },
      { label: "ZZ9 1AA · Hatfield Peverel", href: "/search/home?postcode=ZZ9+1AA" },
    ]);
  });

  it("caps the bridge's named links at the sample's four", async () => {
    const names = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT"];
    const bundle = await servedBundle({
      places: async () => ({
        localities: names.map((name) => ({ name, filings: 1 })),
        towns: [{ name: "CHELMSFORD", filings: 1 }],
        counties: ["ESSEX"],
        settlementPostcodes: names.map((locality, i) => ({
          locality,
          postcode: `ZZ9 1A${String.fromCharCode(65 + i)}`,
        })),
      }),
    });
    const view = buildDistrictResultsView(bundle);
    expect(view.bridge?.links).toHaveLength(4);
    expect(view.bridge?.links[0].label).toBe("ZZ9 1AA · Alpha");
  });

  it("names the About-these-checks links for this page's own sections — the sample's eleven", async () => {
    const bundle = await servedBundle();
    const view = buildDistrictResultsView(bundle);
    expect(view.checkLinks.map((link) => link.label)).toEqual([
      "The district itself",
      "The neighbourhood in numbers",
      "Crime",
      "Sold prices",
      "Deprivation",
      "Council tax",
      "Broadband & mobile",
      "Schools",
      "Counts in ZZ9",
      "Flood",
      "Air quality",
    ]);
    expect(view.checkLinks.map((link) => link.href)).toEqual([
      "/how-we-check",
      "/how-we-check",
      "/check/crime",
      "/check/sold-prices",
      "/how-we-check",
      "/check/council-tax-band",
      "/check/broadband",
      "/check/schools",
      "/check/family-essentials",
      "/check/flood-risk",
      "/check/air-quality",
    ]);
  });

  it("renders the settlements as pills, not a joined line (audit item 9)", async () => {
    const bundle = await servedBundle();
    const blocks = sectionBlocks(bundle, "neighbourhood", "district");
    const pills = blocks.find((block) => block.type === "pills");
    expect(pills?.type === "pills" && pills.items).toEqual(["Danbury", "Hatfield Peverel"]);
  });
});
