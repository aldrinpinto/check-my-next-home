import { describe, expect, it } from "vitest";
import type { CompanyOwnershipSection, CompanyTitleServed } from "../lib/area-bundle";
import type { FloodBundle } from "../lib/flood";
import { buildReportView, type ReportRichLine, type ReportView } from "../lib/report";
import type { SoldPricesBundle } from "../lib/sold-prices";
import { areaWith, input, soldServed } from "./fixtures/report-inputs";

// Plan step M8.9 — report Section 1 additions: the
// Material Information checklist and the company-owner
// block, at the end of Section 1, checklist first, home
// reports only. The checklist pins here run on the
// fixture view (the Birkdale base case); the same view
// built from the real golden bundles is asserted in the
// golden replay (tests/golden-replay.test.ts). The
// company block's flag-forced cases run on a served
// section in the exact shape the M6.13 brain builds —
// tests/area-bundle.test.ts proves the brain builds this
// shape for the control home (39 Birkdale Rise, inside
// both SAGE titles) with the flag forced on; what is
// pinned here is that the report renders that answer in
// full, and that with the flag off (the shipped state,
// where the bundle carries no such key) no block stands
// at all.

function sectionText(view: ReportView, number: number): string {
  return JSON.stringify(view.sections[number - 1]);
}

function lineText(line: ReportRichLine): string {
  return line.map((segment) => segment.text).join("");
}

function checklistItems(view: ReportView): string[] {
  const s1 = view.sections[0];
  const subAt = s1.blocks.findIndex((b) => b.type === "sub" && b.text === "Material information");
  if (subAt === -1) throw new Error("expected the Material information sub heading");
  const list = s1.blocks[subAt + 2];
  if (!list || list.type !== "richList") throw new Error("expected the checklist after its intro");
  return list.items.map(lineText);
}

describe("report — Section 1 additions (M8.9): the Material Information checklist", () => {
  const view = buildReportView(input());

  it("stands at the end of Section 1, after the history table, with the six items in the fixed order", () => {
    const s1 = view.sections[0];
    const tableAt = s1.blocks.findIndex((b) => b.type === "table");
    const subAt = s1.blocks.findIndex((b) => b.type === "sub" && b.text === "Material information");
    expect(tableAt).toBeGreaterThanOrEqual(0);
    expect(subAt).toBeGreaterThan(tableAt);
    // The block's introduction: what the records state,
    // never the seller's or the agent's declaration.
    const intro = s1.blocks[subAt + 1];
    if (!intro || intro.type !== "intro") throw new Error("expected the checklist intro");
    expect(intro.text).toContain("as the official records we hold state them for this home");
    expect(intro.text).toContain(
      "not the seller's or the agent's material information declaration",
    );
    expect(checklistItems(view)).toEqual([
      "Tenure: freehold, as recorded at this home's last recorded sale (15 Jun 2023) — HM Land Registry Price Paid Data.",
      "Property type: detached, as recorded at this home's last recorded sale (15 Jun 2023) — HM Land Registry Price Paid Data.",
      "Council tax: the average Band D charge for Braintree is £2,145.00 a year (2026/27). This is the area's Band D average — not this home's own band, and not its bill.",
      "Energy rating: Band B (score 85), from the energy performance certificate recorded for this home on the official register.",
      "Floor area: 118 m², as recorded on the energy performance certificate for this home.",
      "Flood standing: rivers and sea — no band published at this point; surface water — below the lowest mapped band; flood zones for planning — Flood Zone 1 — Environment Agency flood data.",
    ]);
  });

  it("the council tax item carries no monthly figure and no home's-own-band claim", () => {
    const item = checklistItems(view)[2];
    expect(item).not.toContain("a month");
    expect(item).not.toContain("this home's band is");
    expect(item).toContain("not this home's own band");
  });

  it("an item the records do not state is marked 'not stated in the records we hold'", () => {
    const area = areaWith();
    if (area.kind !== "area-bundle") throw new Error("expected an area bundle");
    area.sections.epc.certificates = [];
    area.sections.councilTax.state = "not-filed";
    area.sections.councilTax.bandDAverageLabel = null;
    const floodNotCovered: FloodBundle = {
      rung: 1,
      kind: "not-covered",
      postcode: "CM3 2JT",
      flood: { state: "not-covered", reason: "FLOOD-NOT-COVERED-REASON" },
    } as unknown as FloodBundle;
    const bare = buildReportView(
      input({
        sold: {
          ...soldServed,
          ownHistory: [
            {
              price: 588995,
              date: "2023-06-15",
              propertyType: null,
              tenure: null,
              newBuild: false,
              address: "19 Birkdale Rise",
            },
          ],
        },
        area,
        flood: floodNotCovered,
      }),
    );
    expect(checklistItems(bare)).toEqual([
      "Tenure: not stated in the records we hold.",
      "Property type: not stated in the records we hold.",
      "Council tax: not stated in the records we hold.",
      "Energy rating: not stated in the records we hold.",
      "Floor area: not stated in the records we hold.",
      "Flood standing: not stated in the records we hold.",
    ]);
  });

  it("stands for a home with no recorded sale — its sale-record items marked not stated, the rest served", () => {
    const noSale = buildReportView(
      input({
        sold: {
          ...soldServed,
          ownHistory: [],
          ownLine: "OWN-LINE: no recorded sale found for this address",
          ownExplainer: "OWN-EXPLAINER",
        },
      }),
    );
    const items = checklistItems(noSale);
    expect(items[0]).toBe("Tenure: not stated in the records we hold.");
    expect(items[1]).toBe("Property type: not stated in the records we hold.");
    expect(items[2]).toContain("£2,145.00 a year");
    expect(items[3]).toContain("Band B (score 85)");
    expect(items[4]).toContain("118 m²");
    expect(items[5]).toContain("Flood Zone 1");
  });

  it("a postcode (rung 2) report carries no checklist — it has no single home", () => {
    const rung2 = buildReportView(
      input({
        resolution: {
          rung: 2,
          kind: "address-list",
          directory: {
            postcode: "CM3 2JT",
            latitude: 51.778,
            longitude: 0.606,
            council: "Braintree",
            ward: "Hatfield Peverel",
            region: "East of England",
            lsoaCode: "E01021395",
            msoaCode: "E02004463",
          },
          street: null,
          building: null,
          addresses: [],
        },
        sold: { ...soldServed, rung: 2 } as unknown as SoldPricesBundle,
      }),
    );
    expect(sectionText(rung2, 1)).not.toContain("Material information");
  });
});

// --- the company-owner block --------------------------------
// The served shapes below are the M6.13 brain's own
// output for the filed control cases, in the values
// tests/area-bundle.test.ts pins against the brain: the
// two SAGE titles over 39 Birkdale Rise (both "own", the
// snapshot held), the clean No over 19 Birkdale Rise, and
// the Adriatic building title over Minerva House (own
// title No, building held, no company number recorded).

const CCOD_SOURCE = "HM Land Registry — UK companies that own property in England and Wales (CCOD)";
const OCOD_SOURCE =
  "HM Land Registry — Overseas companies that own property in England and Wales (OCOD)";
const CH_SOURCE = "Companies House — Free Company Data Product";

const COMPANY_EXPLAINER =
  "This check answers one question: is a company a registered proprietor of this home's own title? It reads HM Land Registry's two company-ownership datasets — one for UK companies, one for overseas companies — and matches this home against the titles filed at its postcode. A flat's own title and its building's title are different titles with different proprietors, so where the building is held on its own title that is named separately, never as this home's answer. The datasets' address text is used only to make the match — it is never shown; the address you see is the one you gave. A 'not company-owned' answer has three holes, and they matter: charities are excluded from both datasets by category, so a charity-owned home returns the same answer; roughly a tenth of land in England and Wales is unregistered, so no title exists for the datasets to hold; and a sale still being registered has not reached the data yet. The answer is only as current as the dataset month it names. For everything deeper — the full register entry, and anything about the company beyond the facts shown — the hand-off is HM Land Registry's title register for the title number shown.";

const sageTitle = (titleNumber: string): CompanyTitleServed => ({
  titleNumber,
  dataset: "ccod",
  tenure: "Freehold",
  proprietorName: "SAGE HOMES RP LIMITED",
  companyNumber: "11217910",
  numberState: "recorded",
  proprietorshipCategory: "Limited Company or Public Limited Company",
  countryIncorporated: null,
  additionalProprietor: false,
  line: "a registered proprietor of this title is a company",
  snapshotLine: null,
  snapshot: {
    companyName: "SAGE HOMES RP LIMITED",
    status: "Active",
    incorporationDate: "2018-02-21",
    sicCodes: ["68201 - Renting and operating of Housing Association real estate"],
    sicCodesLine:
      "the SIC codes are Companies House's standard industrial classification codes for the company's activities, served as filed",
    sourceName: CH_SOURCE,
    sourceDate: "2026-11-01",
    sourceLine: `${CH_SOURCE} — data to 1 November 2026`,
  },
  attributionLine: "Information produced by HM Land Registry © Crown copyright 2026",
  sourceName: CCOD_SOURCE,
  sourceDate: "2026-11-01",
  sourceLine: `${CCOD_SOURCE} — data to 1 November 2026`,
});

const companyBase = {
  depth: "report" as const,
  grain: "home" as const,
  grainLine: "this home's own title, in HM Land Registry's company-ownership data",
  explainer: COMPANY_EXPLAINER,
  sourceName: CCOD_SOURCE,
  sourceDate: "2026-11-01",
  sourceLine: `${CCOD_SOURCE} — data to 1 November 2026`,
  buildingLine: null,
  buildingTitles: [] as CompanyTitleServed[],
  attributionLine: "Information produced by HM Land Registry © Crown copyright 2026",
};

const companyServed: CompanyOwnershipSection = {
  ...companyBase,
  state: "served",
  line: "a registered proprietor of this home's title is a company",
  ownTitles: [sageTitle("AA53500"), sageTitle("AA53502")],
};

const companyNo: CompanyOwnershipSection = {
  ...companyBase,
  state: "not-company-owned",
  line: "This home's title is not in HM Land Registry's company-ownership data as at November 2026",
  ownTitles: [],
};

const adriaticBuildingTitle: CompanyTitleServed = {
  titleNumber: "SY876459",
  dataset: "ocod",
  tenure: "Freehold",
  proprietorName: "ADRIATIC LAND 11 LIMITED",
  companyNumber: null,
  numberState: "no-number-recorded",
  proprietorshipCategory: "Limited Company or Public Limited Company",
  countryIncorporated: "GUERNSEY",
  additionalProprietor: false,
  line: "a registered proprietor of this building's title is a company",
  snapshotLine: "the register records no company number for this proprietor",
  snapshot: null,
  attributionLine: "Information produced by HM Land Registry © Crown copyright 2026",
  sourceName: OCOD_SOURCE,
  sourceDate: "2026-11-01",
  sourceLine: `${OCOD_SOURCE} — data to 1 November 2026`,
};

const companyBuildingOnly: CompanyOwnershipSection = {
  ...companyNo,
  buildingLine:
    "this home's building is held on a separate title from this home's own title, and a company is a registered proprietor of that building title",
  buildingTitles: [adriaticBuildingTitle],
};

const companyNotCovered: CompanyOwnershipSection = {
  ...companyBase,
  sourceName: null,
  sourceDate: null,
  sourceLine: null,
  attributionLine: null,
  state: "not-covered",
  line: "the company-ownership datasets cover England and Wales only — title information for Scotland is held by Registers of Scotland",
  ownTitles: [],
};

describe("report — Section 1 additions (M8.9): the company-owner block", () => {
  it("flag off (the shipped state): the checklist stands and no company block stands at all", () => {
    const view = buildReportView(input());
    const s1 = sectionText(view, 1);
    expect(s1).toContain("Material information");
    expect(s1).not.toContain("Company ownership");
    expect(JSON.stringify(view)).not.toContain("registered proprietor");
  });

  it("flag on, company-owned: the answer in full — both titles, the snapshot as published, after the checklist", () => {
    const view = buildReportView(input({ area: areaWith({ companyOwnership: companyServed }) }));
    const s1 = view.sections[0];
    const s1Text = sectionText(view, 1);
    // Placement: checklist first, company block after it.
    expect(s1Text.indexOf("Material information")).toBeLessThan(
      s1Text.indexOf("Company ownership"),
    );
    // The lead answer, as a sentence.
    expect(s1Text).toContain("A registered proprietor of this home's title is a company.");
    // Both titles serve whole, unranked, in title order.
    expect(s1Text.indexOf("AA53500")).toBeLessThan(s1Text.indexOf("AA53502"));
    expect(s1Text).toContain("SAGE HOMES RP LIMITED, as filed on the register.");
    expect(s1Text).toContain("Title number:");
    expect(s1Text).toContain("AA53500 (Freehold)");
    expect(s1Text).toContain("Company number:");
    expect(s1Text).toContain("11217910");
    // The Companies House snapshot as published, with
    // its source and date.
    expect(s1Text).toContain("Company name (Companies House):");
    expect(s1Text).toContain("Status:");
    expect(s1Text).toContain("Active, as published by Companies House.");
    expect(s1Text).toContain("Incorporated:");
    expect(s1Text).toContain("21 February 2018");
    expect(s1Text).toContain("68201 - Renting and operating of Housing Association real estate");
    expect(s1Text).toContain(`${CH_SOURCE} — data to 1 November 2026`);
    // The licence attribution and the explainer ride with
    // the block.
    expect(s1Text).toContain("Information produced by HM Land Registry © Crown copyright 2026");
    expect(s1Text).toContain("charities are excluded from both datasets by category");
    // The block's own source files in Section 10 under
    // its topic name, like every other section's.
    const s10 = sectionText(view, 10);
    expect(s10).toContain("Company ownership");
    expect(s10).toContain("UK companies that own property in England and Wales (CCOD)");
    // Block order inside Section 1: the sub heading opens
    // the block and the explainer closes the section.
    const subAt = s1.blocks.findIndex((b) => b.type === "sub" && b.text === "Company ownership");
    expect(subAt).toBeGreaterThanOrEqual(0);
    // BUG-114: the section now closes with its How-we-check
    // link line; the company explainer note stands before it.
    const lastBlock = s1.blocks[s1.blocks.length - 1];
    expect(lastBlock.type).toBe("links");
    expect(s1.blocks[s1.blocks.length - 2]?.type).toBe("note");
  });

  it("flag on, the clean No: the dated No line and the explainer's caveats, no proprietor detail", () => {
    const view = buildReportView(input({ area: areaWith({ companyOwnership: companyNo }) }));
    const s1Text = sectionText(view, 1);
    expect(s1Text).toContain(
      "This home's title is not in HM Land Registry's company-ownership data as at November 2026.",
    );
    expect(s1Text).toContain("roughly a tenth of land in England and Wales is unregistered");
    expect(s1Text).toContain("a sale still being registered has not reached the data yet");
    expect(s1Text).not.toContain("Proprietor:");
    expect(s1Text).not.toContain("SAGE HOMES");
  });

  it("flag on, building title only: the building line stands separate and names its proprietor as filed", () => {
    const view = buildReportView(
      input({ area: areaWith({ companyOwnership: companyBuildingOnly }) }),
    );
    const s1Text = sectionText(view, 1);
    // The home's own answer is still the No.
    expect(s1Text).toContain(
      "This home's title is not in HM Land Registry's company-ownership data",
    );
    // The building line stands as its own labelled line,
    // before the building title's detail — never merged
    // into the home's answer.
    const buildingAt = s1Text.indexOf("This home's building is held on a separate title");
    expect(buildingAt).toBeGreaterThanOrEqual(0);
    expect(s1Text.indexOf("ADRIATIC LAND 11 LIMITED")).toBeGreaterThan(buildingAt);
    expect(s1Text).toContain("SY876459 (Freehold)");
    // No company number recorded: the named line stands.
    expect(s1Text).toContain("The register records no company number for this proprietor.");
    expect(s1Text).not.toContain("Company number:");
  });

  it("flag on, not covered: the named state line stands with the explainer", () => {
    const view = buildReportView(
      input({ area: areaWith({ companyOwnership: companyNotCovered }) }),
    );
    const s1Text = sectionText(view, 1);
    expect(s1Text).toContain(
      "The company-ownership datasets cover England and Wales only — title information for Scotland is held by Registers of Scotland.",
    );
    expect(s1Text).toContain("This check answers one question");
    expect(s1Text).not.toContain("Proprietor:");
  });
});
