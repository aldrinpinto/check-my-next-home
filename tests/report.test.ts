import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportPage from "../components/ReportPage";
import type { AddressResolution } from "../lib/address";
import type { AreaBundle } from "../lib/area-bundle";
import type { CrimeBundle } from "../lib/crime";
import type { FloodBundle, FloodMaps } from "../lib/flood";
import { floodMapFrame } from "../lib/flood";
import type { CategoryAnswer, NearbyBundle, NearbyCategory } from "../lib/nearby";
import {
  REPORT_DISCLAIMER_D9,
  REPORT_VIEW_ROUTE,
  buildFloodMapModels,
  buildReportView,
  reportViewGate,
  reportViewRoute,
  type ReportInput,
  type ReportView,
} from "../lib/report";
import { CATCHMENT_BLOCK_LINE } from "../lib/results";
import {
  areaWith,
  birkdale,
  category,
  crimeServed,
  floodServed,
  input,
  nearbyWith,
  soldServed,
} from "./fixtures/report-inputs";
import { REPORT_DOOR_STATE } from "../lib/site";
import type { SoldPricesBundle } from "../lib/sold-prices";

// M8.1 — the on-screen report: the view builder's
// derivations against fabricated bundles at the frozen
// shapes (the bundle-contracts pins), carrying the core
// golden facts (Birkdale) as the base case. The same view
// built from REAL bundles is asserted in the golden
// replay (tests/golden-replay.test.ts). What is pinned
// here: the nine sections in order; the carve-outs (no
// computed sale tiles, no IMD rank or score, no monthly
// total, no summed EPC savings); the scope additions
// (a)–(q) each rendering as served; the snapshot's
// serialisability; the buyer-route seam and the door gate.

function text(view: ReportView): string {
  return JSON.stringify(view);
}

function sectionText(view: ReportView, number: number): string {
  return JSON.stringify(view.sections[number - 1]);
}

describe("report — the nine sections and the format", () => {
  const view = buildReportView(input());

  it("builds exactly nine sections, in the approved order", () => {
    expect(view.sections.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(view.sections.map((s) => s.title)).toEqual([
      "Price & this home",
      "Sold prices nearby",
      "Schools & nurseries",
      "Health, air, noise & crime",
      "What's nearby",
      "Home, costs & risks",
      "Flood risk",
      "Questions to ask the seller",
      "Sources, notes & disclaimers",
    ]);
  });

  it("the view model is plain serialisable data — the one snapshot source for screen and PDF", () => {
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it("a none-within line is recomposed at one-decimal precision, never the brain's raw line (BUG-014, founder ruling 20 Nov 2026)", () => {
    const served = JSON.stringify(view);
    expect(served).toContain("nearest is Broomfield Hospital, 5.9 miles away");
    expect(served).not.toContain("5.89 miles away");
  });

  it("the masthead names the home, its place and the matched certificate's facts", () => {
    expect(view.masthead.title).toBe("19 Birkdale Rise");
    expect(view.masthead.addressLine).toBe("Chelmsford CM3 2JT");
    expect(view.masthead.meta).toContainEqual({ label: "Property", value: "Detached house" });
    expect(view.masthead.meta).toContainEqual({ label: "Floor area", value: "118 m²" });
    expect(view.masthead.meta).toContainEqual({ label: "Last sale", value: "£588,995" });
  });

  it("Section 1 carries the factual tiles only — the computed tiles are not built (B7 carve-out)", () => {
    const s1 = sectionText(view, 1);
    expect(s1).toContain("Last sale");
    expect(s1).toContain("Times sold");
    const whole = text(view);
    expect(whole).not.toContain("Change since previous sale");
    expect(whole).not.toContain("Held by last owner");
    expect(whole).not.toContain("Annual growth");
    expect(whole).not.toContain("Price change");
  });

  it("Section 1's building block carries the building's middle price as its stat (BUG-036)", () => {
    // The Atlantic Reach evidence shape (TR8 4LX, play
    // server 20 Nov 2026): the building's median is served
    // — £65,500 over 38 counted sales — and the figure
    // itself must stand in the block as a stat, in Section
    // 2's tile form, beside its counted line and explainer.
    // (The golden replay's one building case, Minerva
    // House, holds only two KT17 rows, so its building
    // median stands too-few there and cannot pin the
    // served figure — this unit pin carries it instead.)
    const withBuilding = buildReportView(
      input({
        sold: {
          ...soldServed,
          building: {
            building: "Atlantic Reach",
            sales: [],
            counted: 38,
            median: {
              state: "served",
              value: 65500,
              counted: 38,
              spanFrom: "1998-07-08",
              spanTo: "2026-06-19",
              line: "counted over 38 recorded sales, 1998-07-08 to 2026-06-19",
              explainer:
                "The middle recorded sale price in this building — half sold for more, half for less. It is not a valuation of this home.",
            },
          },
        },
      }),
    );
    const s1 = withBuilding.sections[0];
    const statBlock = s1.blocks.find(
      (b) => b.type === "tiles" && b.tiles.some((t) => t.label === "Building median"),
    );
    if (!statBlock || statBlock.type !== "tiles") throw new Error("expected the building stat");
    expect(statBlock.tiles).toContainEqual({
      label: "Building median",
      value: "£65,500",
      sub: "Category A median for Atlantic Reach",
    });
    const s1Text = sectionText(withBuilding, 1);
    expect(s1Text).toContain("Sales in Atlantic Reach");
    expect(s1Text).toContain("counted over 38 recorded sales, 1998-07-08 to 2026-06-19");
    // The stat stands between the sub heading and the
    // counted line — the block reads heading, figure, basis.
    expect(s1Text.indexOf("Sales in Atlantic Reach")).toBeLessThan(s1Text.indexOf("£65,500"));
    expect(s1Text.indexOf("£65,500")).toBeLessThan(
      s1Text.indexOf("counted over 38 recorded sales"),
    );
  });

  it("Section 1's building block prints no stat when the building median is not served (BUG-036)", () => {
    const tooFew = buildReportView(
      input({
        sold: {
          ...soldServed,
          building: {
            building: "Minerva House",
            sales: [],
            counted: 1,
            median: {
              state: "too-few",
              value: null,
              counted: 1,
              spanFrom: "2019-12-03",
              spanTo: "2019-12-03",
              line: "only 1 recorded sale in this building — too few for a median",
              explainer:
                "The middle recorded sale price in this building — half sold for more, half for less. It is not a valuation of this home.",
            },
          },
        },
      }),
    );
    const s1Text = sectionText(tooFew, 1);
    expect(s1Text).toContain("Sales in Minerva House");
    expect(s1Text).toContain("only 1 recorded sale in this building — too few for a median");
    expect(s1Text).not.toContain("Building median");
  });

  it("Section 2 carries the median form: value, counted, span, explainer", () => {
    const s2 = sectionText(view, 2);
    expect(s2).toContain("£588,995");
    expect(s2).toContain('"value":"29"');
    expect(s2).toContain("MEDIAN-EXPLAINER");
  });

  it("no monthly cost-of-ownership figure appears anywhere (X6/X7 carve-out)", () => {
    const whole = text(view).toLowerCase();
    expect(whole).not.toContain("cost of ownership");
    expect(whole).not.toContain("total monthly");
    // The two D33 lines ride inside their own sections only.
    expect(sectionText(view, 6)).toContain("spread evenly over 12 months");
  });

  it("no childminder wording appears anywhere (founder ruling, 19 Nov 2026)", () => {
    expect(text(view).toLowerCase()).not.toContain("childminder");
  });
});

describe("report — Section 3 schools", () => {
  const view = buildReportView(input());

  it("carries the catchment honesty block verbatim", () => {
    expect(sectionText(view, 3)).toContain(CATCHMENT_BLOCK_LINE);
  });

  it("secondary rows carry their destinations block as served; sixth-form rows carry none (q)", () => {
    const s3 = sectionText(view, 3);
    expect(s3).toContain("COHORT-LINE: 171 leavers, 2022/23 cohort");
    expect(s3).toContain("84.8%");
    expect(s3).toContain("SUSTAINED-LINE");
    expect(s3).toContain("This school has a sixth form.");
    const sixthFormsAt = s3.indexOf("Sixth forms and colleges");
    expect(s3.slice(sixthFormsAt)).not.toContain("COHORT-LINE");
  });

  it("the selective line serves beside the secondary list", () => {
    expect(sectionText(view, 3)).toContain("selective means admission by entrance test");
  });
});

describe("report — Section 4 health, air, noise & crime", () => {
  const view = buildReportView(input());
  const s4 = sectionText(view, 4);

  it("health rows carry the CQC rating with its publication date, never as an inspection date (i)", () => {
    expect(s4).toContain("Rated Good overall by the Care Quality Commission");
    expect(s4).toContain("rating published 19 December 2024");
    expect(s4.toLowerCase()).not.toContain("inspected");
    // Dentists are unrated: the dentist row carries no CQC line.
    const dentistAt = s4.indexOf("Birkdale Dental");
    expect(s4.slice(dentistAt, dentistAt + 300)).not.toContain("Care Quality Commission");
  });

  it("the air table carries the yardstick lines as served, and the AQMA answer (m, n)", () => {
    expect(s4).toContain("8.15 µg/m³");
    expect(s4).toContain("YARDSTICK-NO2");
    expect(s4).toContain("AQMA-NONE-LINE");
    expect(s4).toContain("Air Quality Management Areas");
  });

  it("noise renders the publisher's band text verbatim, day and night (h)", () => {
    expect(s4).toContain("Below 55 dB");
    expect(s4).toContain("Below 50 dB");
  });

  it("crime carries the counts with the D39 calibration lines beside them (f)", () => {
    expect(s4).toContain("330 recorded crimes within 1 mile");
    expect(s4).toContain("Violence and sexual offences");
    expect(s4).toContain("51.7 recorded crimes for every 1,000 residents here");
    expect(s4).toContain("across England, the figure is 94.5");
    expect(s4).toContain("CALIBRATION-EXPLAINER");
  });

  it("benefits render at the end of Section 4 as plain published lines — and nowhere else (c)", () => {
    expect(s4).toContain("Claimant count, September 2026: 15 people — 1.6%.");
    expect(text(view).split("Claimant count, September 2026").length).toBe(2);
    expect(JSON.stringify(view.shortVersion)).not.toContain("Claimant count");
  });

  it("charging zones render under their own label with no charge amount (o)", () => {
    expect(s4).toContain("Charging zones");
    expect(s4).toContain("not inside any Clean Air Zone");
    const zonesAt = s4.indexOf("Charging zones");
    expect(s4.slice(zonesAt)).not.toContain("£");
  });
});

describe("report — Section 5 and its map", () => {
  const view = buildReportView(input());

  it("the map pins exactly the named places in Section 5's own lists — no schools, no other sections' places, no unnamed points", () => {
    const mapBlock = view.sections[4].blocks.find((b) => b.type === "map");
    if (!mapBlock || mapBlock.type !== "map") throw new Error("expected a map block");
    const names = mapBlock.map.pins.map((p) => p.name);
    expect(names).toContain("Co-op");
    expect(names).toContain("Hatfield Peverel Station");
    expect(names).toContain("Birkdale Rise Green");
    expect(names).not.toContain("St Andrew's Junior School");
    expect(names).not.toContain("Maltings Academy");
    // Broomfield Hospital is the A&E beyond-nearest — a
    // Section 4 place, so the Section 5 map never pins it.
    expect(names).not.toContain("Broomfield Hospital");
    expect(mapBlock.map.rings.map((r) => r.label)).toEqual(["1 mile", "2 miles"]);
  });

  it("the map also pins an essential service's single nearest beyond 2 miles, from Section 5's own categories", () => {
    const withBeyond = buildReportView(
      input({
        nearby: nearbyWith({
          station: category({
            category: "station",
            label: "stations",
            state: "none-within",
            places: [],
            countWithin: 0,
            beyondNearest: {
              name: "Witham Station",
              miles: 3.4,
              latitude: 51.8,
              longitude: 0.64,
            },
            line: "none within 2 miles — nearest is Witham Station, 3.4 miles away (straight-line distance from the postcode point)",
          }),
          supermarket: category({
            category: "supermarket",
            label: "supermarkets",
            state: "within",
            places: [
              { name: "Co-op", miles: 0.3, detail: null, latitude: 51.777, longitude: 0.605 },
            ],
            countWithin: 1,
          }),
        }),
      }),
    );
    const mapBlock = withBeyond.sections[4].blocks.find((b) => b.type === "map");
    if (!mapBlock || mapBlock.type !== "map") throw new Error("expected a map block");
    expect(mapBlock.map.pins.map((p) => p.name)).toContain("Witham Station");
  });

  it("the industrial sites block stands at the end of Section 5 while the flag serves it (p)", () => {
    const s5 = view.sections[4];
    const subs = s5.blocks.filter((b) => b.type === "sub");
    expect(subs[subs.length - 1]).toEqual({ type: "sub", text: "Regulated industrial sites" });
    const s5Text = sectionText(view, 5);
    expect(s5Text).toContain("Example Chemicals Ltd");
    expect(s5Text).toContain("REPORTED-LINE");
    expect(s5Text).toContain("THRESHOLD-LINE");
  });

  it("with no industrial block in the bundle, no placeholder stands in its place", () => {
    const bare = buildReportView(input({ nearby: nearbyWith({}, false) }));
    expect(sectionText(bare, 5)).not.toContain("Regulated industrial sites");
  });
});

describe("report — Section 6 home, costs & risks", () => {
  const view = buildReportView(input());
  const s6 = sectionText(view, 6);

  it("council tax carries the bands table and its own D33 monthly line", () => {
    expect(s6).toContain("£2,145.00");
    expect(s6).toContain("£178.75 a month if the Band D average is spread evenly over 12 months");
  });

  it("EPC improvements render in register sequence with their own figures, never summed", () => {
    const first = s6.indexOf("Loft insulation");
    const second = s6.indexOf("Solar panels");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(s6.toLowerCase()).not.toContain("save about");
    expect(s6).toContain("CLOSING-LINE");
  });

  it("the solar basis rides in the section, immediately with the line", () => {
    const lineAt = s6.indexOf("SOLAR-LINE");
    const basisAt = s6.indexOf("SOLAR-BASIS");
    expect(lineAt).toBeGreaterThan(-1);
    expect(basisAt).toBeGreaterThan(lineAt);
  });

  it("demographics are led by the IMD decile-in-words line — no score, no rank, no bare decile (g)", () => {
    const demoAt = s6.indexOf("The area in numbers");
    const demo = s6.slice(demoAt);
    expect(demo).toContain("Among the less deprived 30 percent of areas in England");
    expect(demo).toContain("Income: among the less deprived 20 percent of areas in England.");
    expect(demo.toLowerCase()).not.toContain("rank");
    expect(demo).not.toContain("decile 8");
  });

  it("the Census charts render in the Master's grid — the Age tile opens it and the age-bands bars are not drawn (a, M8.2), and social rent stands as its own line (d)", () => {
    expect(s6).toContain("Age — Census 2021");
    expect(s6).toContain("46.5 years");
    expect(s6).toContain("calculated from the Census's single years of age");
    expect(s6).not.toContain("Age by five-year age bands");
    expect(s6).toContain("Tenure — Census 2021");
    expect(s6).toContain("Tenure table (TS054): 3,397 households.");
    expect(s6).toContain("SOCIAL-RENTED-LINE");
    expect(s6).toContain("SPREAD-EXPLAINER: certificates, not homes");
  });

  it("the EPC spread renders as a band chart with the row's served line as its caption — and no home marker anywhere on it (M8.2, the M8.11(e) chart moved up)", () => {
    const spread = view.sections[5].blocks.find(
      (b) => b.type === "bars" && b.title.includes("RdSAP"),
    );
    if (!spread || spread.type !== "bars") throw new Error("expected the EPC spread chart");
    expect(spread.rows).toEqual([{ label: "Band B", widthPct: 100, value: "20", strong: true }]);
    expect(spread.caption).toBe("SPREAD-LINE");
    expect(JSON.stringify(spread).toLowerCase()).not.toContain("this home");
  });

  it("the planning hand-off renders — never a count, never a named list", () => {
    expect(s6).toContain("planning register");
    expect(s6).toContain("Search the register of planning decisions (GOV.UK)");
  });
});

describe("report — Section 7 flood", () => {
  const view = buildReportView(input());
  const s7 = view.sections[6];
  const s7Text = sectionText(view, 7);

  it("opens with the live warnings block, the warning in full (e)", () => {
    const firstSub = s7.blocks.find((b) => b.type === "sub");
    expect(firstSub).toEqual({ type: "sub", text: "Flood warning — River Leadon catchment" });
    expect(s7Text).toContain("EA-MESSAGE-FULL-TEXT");
    expect(s7Text).toContain("raised at 16:35 on 15 November 2026");
    expect(s7Text).toContain("Open Government Licence");
  });

  it("the three filed layers stand separate, in served order", () => {
    const zones = s7Text.indexOf("Flood zones");
    const rivers = s7Text.indexOf("Flooding from rivers & sea");
    const surface = s7Text.indexOf("Flooding from surface water");
    expect(zones).toBeGreaterThan(-1);
    expect(rivers).toBeGreaterThan(zones);
    expect(surface).toBeGreaterThan(rivers);
  });

  it("the defences sub-block carries its caveat and bridge line (k)", () => {
    expect(s7Text).toContain("DEFENCES-CAVEAT");
    expect(s7Text).toContain("DEFENCES-BRIDGE");
    expect(s7Text).toContain("River Chelmer embankment");
    expect(s7Text).toContain("condition: Fair (grade 3 of 5)");
  });

  it("the climate outlook stands as its own fenced sub-block with its basis (l)", () => {
    expect(s7Text).toContain("CLIMATE-BASIS: UKCP18 RCP 8.5");
    expect(s7Text).toContain("CLIMATE-CAVEAT");
    expect(s7Text).toContain("ROFRS-SCENARIO");
  });
});

describe("report — Section 9 and the closing notes", () => {
  const view = buildReportView(input());
  const s9 = sectionText(view, 9);

  it("carries the served schoolDeadlines line verbatim (j)", () => {
    expect(s9).toContain(
      "Apply by 31 October for secondary places and 15 January for primary places (England).",
    );
  });

  it("carries the full D9 wording verbatim in the closing disclaimer block", () => {
    expect(s9).toContain(REPORT_DISCLAIMER_D9);
    expect(REPORT_DISCLAIMER_D9).toContain("what it means for your decision is your own judgement");
  });

  it("names the check explanations (the M7.12 discharge)", () => {
    expect(s9).toContain("/check/flood-risk");
    expect(s9).toContain("/check/schools");
    expect(sectionText(view, 7)).toContain("/check/flood-risk");
  });

  it("collects the bundles' own source lines", () => {
    expect(s9).toContain("Source: HM Land Registry Price Paid Data, edition 28 October 2026");
    expect(s9).toContain("Source: Police.uk street-level crime data");
  });
});

describe("report — states, nations and the door seam", () => {
  it("the sold-prices cold degrade renders its named state in Sections 1 and 2", () => {
    const unavailable: SoldPricesBundle = {
      rung: 1,
      kind: "sold-prices",
      postcode: "CM3 2JT",
      soldPrices: {
        state: "unavailable",
        reason: "sold prices are still being gathered for this postcode — check again shortly",
      },
    };
    const view = buildReportView(input({ sold: unavailable }));
    expect(sectionText(view, 1)).toContain("still being gathered");
    expect(sectionText(view, 2)).toContain("still being gathered");
  });

  it("a Scottish report renders the bundles' not-covered states, never blanks or England data", () => {
    const scotland: AddressResolution = {
      rung: 1,
      kind: "home",
      address: {
        postcode: "EH1 1AD",
        paon: "1",
        saon: null,
        street: "HIGH STREET",
        locality: null,
        town: "EDINBURGH",
        label: "1 High Street",
      },
      directory: {
        postcode: "EH1 1AD",
        latitude: 55.948894,
        longitude: -3.19259,
        council: "City of Edinburgh",
        ward: "City Centre",
        region: "S99999999",
        lsoaCode: "S01014710",
        msoaCode: "S02002727",
      },
    };
    const soldNotCovered: SoldPricesBundle = {
      rung: 1,
      kind: "not-covered",
      postcode: "EH1 1AD",
      soldPrices: { state: "not-covered", reason: "SOLD-NOT-COVERED-REASON" },
    };
    const crimeNotCovered: CrimeBundle = {
      rung: 1,
      kind: "not-covered",
      postcode: "EH1 1AD",
      crime: { state: "not-covered", reason: "CRIME-NOT-COVERED-REASON" },
    };
    const floodNotCovered: FloodBundle = {
      rung: 1,
      kind: "not-covered",
      postcode: "EH1 1AD",
      flood: { state: "not-covered", reason: "FLOOD-NOT-COVERED-REASON" },
    } as unknown as FloodBundle;
    const view = buildReportView(
      input({
        resolution: scotland,
        sold: soldNotCovered,
        crime: crimeNotCovered,
        flood: floodNotCovered,
      }),
    );
    expect(sectionText(view, 1)).toContain("SOLD-NOT-COVERED-REASON");
    expect(sectionText(view, 4)).toContain("CRIME-NOT-COVERED-REASON");
    expect(sectionText(view, 7)).toContain("FLOOD-NOT-COVERED-REASON");
    expect(view.sections).toHaveLength(9);
  });

  it("a postcode (rung 2) report heads with the postcode and fills Section 1 from the postcode's sales", () => {
    const rung2Resolution: AddressResolution = {
      rung: 2,
      kind: "address-list",
      directory: birkdale.directory,
      street: null,
      building: null,
      addresses: [birkdale.address],
    };
    const soldRung2 = { ...soldServed, rung: 2 } as unknown as SoldPricesBundle;
    const view = buildReportView(input({ resolution: rung2Resolution, sold: soldRung2 }));
    expect(view.masthead.title).toBe("CM3 2JT");
    expect(sectionText(view, 1)).toContain("19 Birkdale Rise");
    expect(sectionText(view, 2)).toContain("£588,995");
  });

  it("the buyer-route seam: the view route's shape, and the gate holding while the door holds", () => {
    expect(REPORT_VIEW_ROUTE).toBe("/report/view");
    expect(reportViewRoute("CM3 2JT")).toBe("/report/view?postcode=CM3+2JT");
    expect(reportViewRoute("CM3 2JT", "19|BIRKDALE RISE")).toBe(
      "/report/view?postcode=CM3+2JT&home=19%7CBIRKDALE+RISE",
    );
    expect(REPORT_DOOR_STATE).toBe("holding");
    expect(reportViewGate("CM3 2JT", null)).toEqual({
      action: "door",
      href: "/report?postcode=CM3+2JT",
    });
    expect(reportViewGate("CM3 2JT", null, "paid")).toEqual({ action: "serve" });
  });
});

describe("report — M8.2 charts: the dot plot", () => {
  function dotPlotOf(view: ReportView) {
    const block = view.sections[1].blocks.find((b) => b.type === "dotPlot");
    if (!block || block.type !== "dotPlot") throw new Error("expected a dot plot in Section 2");
    return block.plot;
  }

  const exeterResolution: AddressResolution = {
    rung: 1,
    kind: "home",
    address: {
      postcode: "EX1 1AA",
      paon: "1",
      saon: null,
      street: "HIGH STREET",
      locality: null,
      town: "EXETER",
      label: "1 High Street",
    },
    directory: {
      postcode: "EX1 1AA",
      latitude: 50.7,
      longitude: -3.5,
      council: "Exeter",
      ward: "Newtown",
      region: "South West",
      lsoaCode: "E01020001",
      msoaCode: "E02000750",
    },
  };

  function soldWith(args: {
    prices: number[];
    medianValue: number | null;
    homePrice?: number;
    rung?: 1 | 2;
  }): SoldPricesBundle {
    const counted = args.prices.length;
    const base = {
      kind: "sold-prices" as const,
      postcode: "EX1 1AA",
      loadState: "found" as const,
      recordedCount: counted,
      sourceName: "HM Land Registry",
      edition: "2026-10-28",
      sourceLine: "Source: HM Land Registry Price Paid Data, edition 28 October 2026",
      stateLine: null,
      median:
        args.medianValue !== null
          ? {
              state: "served" as const,
              value: args.medianValue,
              counted,
              spanFrom: "2001-05-11",
              spanTo: "2024-09-30",
              line: "the postcode median",
              explainer: "MEDIAN-EXPLAINER",
            }
          : {
              state: "too-few" as const,
              value: null,
              counted,
              spanFrom: "2001-05-11",
              spanTo: "2024-09-30",
              line: `only ${counted} recorded sales in this postcode — too few for a median`,
              explainer: "MEDIAN-EXPLAINER",
            },
      countedSales: args.prices.map((price) => ({
        price,
        date: "2020-01-01",
        propertyType: "T",
        tenure: "F",
        newBuild: false,
        address: "High Street",
      })),
      recentSales: [],
      recentLabel: "The most recent recorded sales in this postcode",
      building: null,
    };
    if (args.rung === 2) return { rung: 2, ...base };
    return {
      rung: 1,
      ...base,
      ownHistory:
        args.homePrice !== undefined
          ? [
              {
                price: args.homePrice,
                date: "2014-01-17",
                propertyType: "T",
                tenure: "F",
                newBuild: false,
                address: "1 High Street",
              },
            ]
          : [],
      ownLine: null,
      ownExplainer: "OWN-EXPLAINER",
    };
  }

  it("the plan's own check: Exeter's dot plot — 9 dots, median £310,000 and this home £270,000 in the right coordinates", () => {
    // The axis rule: range £175,000–£440,000 → nice step
    // £100,000, axis £100,000–£500,000 over x 30–730, so
    // x(price) = 30 + (price − 100,000) / 400,000 × 700.
    const view = buildReportView(
      input({
        resolution: exeterResolution,
        sold: soldWith({
          prices: [175000, 210000, 245000, 280000, 310000, 335000, 360000, 395000, 440000],
          medianValue: 310000,
          homePrice: 270000,
        }),
      }),
    );
    const plot = dotPlotOf(view);
    expect(plot.dots).toHaveLength(9);
    expect(plot.median.x).toBe(397.5);
    expect(plot.median.label).toBe("Median £310,000");
    expect(plot.home?.x).toBe(327.5);
    expect(plot.home?.label).toBe("This home — £270,000");
    expect(plot.title).toBe("Where this home sits — recorded sales in postcode EX1 1AA");
    expect(plot.ticks.map((t) => t.label)).toEqual(["£100k", "£200k", "£300k", "£400k", "£500k"]);
    expect(plot.caption).toContain("9 counted recorded sales in this postcode (category A)");
    expect(plot.caption).toContain("spanning 11 May 2001 to 30 September 2024");
    expect(plot.ariaLabel).toContain("This home's sale, £270,000, is the large brass dot");
  });

  it("Birkdale: every one of the 29 counted sales is a dot, the home sits on the median line, and same-column dots stack", () => {
    const plot = dotPlotOf(buildReportView(input()));
    expect(plot.dots).toHaveLength(29);
    expect(plot.home?.x).toBe(plot.median.x);
    expect(plot.caption).toContain("sits on the median line");
    expect(plot.caption).toContain("stack above the line, so every sale stays visible");
    expect(plot.ariaLabel).toContain("29 counted recorded sales in postcode CM3 2JT");
  });

  it("dots at the same price stack upward in rows, and the viewBox grows a row-step per extra stack row", () => {
    const view = buildReportView(
      input({
        resolution: exeterResolution,
        sold: soldWith({
          prices: [100000, 100000, 100000, 200000, 300000],
          medianValue: 100000,
          homePrice: 200000,
        }),
      }),
    );
    const plot = dotPlotOf(view);
    const stacked = plot.dots.filter((d) => d.x === 146.7).map((d) => d.y);
    expect(stacked.sort((a, b) => a - b)).toEqual([44, 58, 72]);
    expect(plot.axisY).toBe(72);
    expect(plot.height).toBe(132);
  });

  it("at rung 2 the plot carries dots and the median line, no home dot, under the postcode-form title", () => {
    const rung2Resolution: AddressResolution = {
      rung: 2,
      kind: "address-list",
      directory: exeterResolution.directory,
      street: null,
      building: null,
      addresses: [exeterResolution.address],
    };
    const view = buildReportView(
      input({
        resolution: rung2Resolution,
        sold: soldWith({
          prices: [175000, 210000, 245000, 280000, 310000, 335000, 360000, 395000, 440000],
          medianValue: 310000,
          rung: 2,
        }),
      }),
    );
    const plot = dotPlotOf(view);
    expect(plot.home).toBeNull();
    expect(plot.title).toBe("Recorded sales in postcode EX1 1AA");
    expect(plot.dots).toHaveLength(9);
    expect(plot.caption).not.toContain("brass dot");
  });

  it("at 1–4 counted sales there is no plot — the too-few line stands alone", () => {
    const view = buildReportView(
      input({
        resolution: exeterResolution,
        sold: soldWith({ prices: [150000, 200000, 250000], medianValue: null, homePrice: 200000 }),
      }),
    );
    expect(view.sections[1].blocks.some((b) => b.type === "dotPlot")).toBe(false);
    expect(sectionText(view, 2)).toContain("too few for a median");
  });
});

describe("report — M8.2 charts: crime by month and by category", () => {
  const view = buildReportView(input());
  const s4 = view.sections[3];

  function monthChartOf(v: ReportView) {
    const block = v.sections[3].blocks.find((b) => b.type === "monthChart");
    if (!block || block.type !== "monthChart") throw new Error("expected a month chart");
    return block.chart;
  }

  it("the month chart stands before the category chart, after the calibration lines (the Master's order)", () => {
    const types = s4.blocks.map((b) => b.type);
    const monthAt = types.indexOf("monthChart");
    const categoryAt = s4.blocks.findIndex((b) => b.type === "bars");
    const perHeadAt = s4.blocks.findIndex(
      (b) => b.type === "line" && b.text.includes("for every 1,000 residents"),
    );
    expect(perHeadAt).toBeGreaterThan(-1);
    expect(monthAt).toBeGreaterThan(perHeadAt);
    expect(categoryAt).toBeGreaterThan(monthAt);
  });

  it("the month chart: twelve bars on the sample's axis for a highest month of 47 — step 10, top gridline 50", () => {
    const chart = monthChartOf(view);
    expect(chart.title).toBe("Incidents by month — October 2025 to September 2026");
    expect(chart.bars).toHaveLength(12);
    expect(chart.gridlines.map((g) => g.label)).toEqual(["0", "10", "20", "30", "40", "50"]);
    const november = chart.bars[1];
    expect(november.value).toBe("47");
    expect(november.height).toBe(188);
    expect(november.y).toBe(44);
    expect(chart.bars.reduce((sum, bar) => sum + Number(bar.value), 0)).toBe(330);
    expect(chart.caption).toContain(
      "Months run October to December 2025, then January to September 2026.",
    );
    expect(chart.caption).toContain("The twelve bars add up to the 330 total.");
    expect(chart.ariaLabel).toContain("November 47");
    expect(chart.ariaLabel).toContain("Total 330");
    // The caption never names a highest or lowest month.
    expect(chart.caption.toLowerCase()).not.toContain("highest");
    expect(chart.caption.toLowerCase()).not.toContain("lowest");
  });

  it("the month axis adapts by nice steps for a high-count window (a highest month of 940 → step 200, top 1,000)", () => {
    const big = buildReportView(
      input({
        crime: {
          ...crimeServed,
          crime: {
            ...crimeServed.crime,
            total: 1500,
            months: [
              { month: "2025-10", count: 940 },
              ...crimeServed.crime.months.slice(1).map((m) => ({ ...m, count: 50 })),
            ],
          },
        },
      }),
    );
    const chart = monthChartOf(big);
    expect(chart.gridlines.map((g) => g.label)).toEqual(["0", "200", "400", "600", "800", "1,000"]);
    expect(chart.bars[0].height).toBe(188);
    expect(chart.bars[0].value).toBe("940");
  });

  it("the category chart zero-fills to all 14 categories with explicit 0s, and its bars sum to the headline total", () => {
    const block = s4.blocks.find((b) => b.type === "bars");
    if (!block || block.type !== "bars") throw new Error("expected the category chart");
    expect(block.title).toBe(
      "Incidents by category — 12 months to September 2026 · all 14 categories",
    );
    expect(block.rows).toHaveLength(14);
    expect(block.rows.reduce((sum, row) => sum + Number(row.value), 0)).toBe(330);
    expect(block.rows[0]).toEqual({
      label: "Violence and sexual offences",
      widthPct: 100,
      value: "120",
      strong: true,
    });
    // The six categories the window never recorded stand
    // as explicit zero rows, last, in slug order.
    const zeros = block.rows.filter((row) => row.value === "0").map((row) => row.label);
    expect(zeros).toEqual([
      "Bicycle theft",
      "Drugs",
      "Other crime",
      "Possession of weapons",
      "Robbery",
      "Theft from the person",
    ]);
    expect(block.caption).toContain("All 14 Police.uk categories are shown in full.");
    expect(block.caption).toContain("add up to the 330 total");
    expect(block.caption).toContain("BASIS: recorded against nearby streets");
  });

  it("a served 'unknown' bucket rides where its count sorts — it is never zero-filled and never one of the 14", () => {
    const withUnknown = buildReportView(
      input({
        crime: {
          ...crimeServed,
          crime: {
            ...crimeServed.crime,
            categories: [...crimeServed.crime.categories, { slug: "unknown", count: 5 }],
          },
        },
      }),
    );
    const block = withUnknown.sections[3].blocks.find((b) => b.type === "bars");
    if (!block || block.type !== "bars") throw new Error("expected the category chart");
    expect(block.rows).toHaveLength(15);
    const unknown = block.rows.find((row) => row.label === "Category not published");
    expect(unknown?.value).toBe("5");
  });
});

describe("report — M8.2 charts: the Census grid at full sample parity", () => {
  const censusFull = {
    state: "served",
    line: "CENSUS-LINE",
    explainer: "CENSUS-EXPLAINER: the whole Census area",
    sourceName: "Census 2021",
    sourceDate: "2021-03-21",
    sourceLine: "Source: Census 2021",
    msoaCode: "E02004463",
    msoaName: "Braintree 018",
    residentsTotal: 8138,
    householdsTotal: 3398,
    medianAge: { value: 46.5, calculated: true, line: "MEDIAN-AGE-LINE" },
    socialRented: { count: 469, total: 3397, pct: 13.8, line: "SOCIAL-RENTED-LINE" },
    tables: [
      {
        code: "ts007a",
        title: "Age by five-year age bands",
        total: 8138,
        rows: [{ label: "Aged 0–4", count: 400, pct: 4.9 }],
        groups: null,
      },
      {
        code: "ts054",
        title: "Tenure",
        total: 3397,
        rows: [
          { label: "Owned", count: 2384, pct: 70.2 },
          { label: "Owned: Owns outright", count: 1287, pct: 37.9 },
          { label: "Owned: Owns with a mortgage or loan", count: 1097, pct: 32.3 },
          { label: "Shared ownership", count: 12, pct: 0.4 },
          { label: "Shared ownership: Shared ownership", count: 12, pct: 0.4 },
          { label: "Social rented", count: 469, pct: 13.8 },
          { label: "Social rented: Rents from council or Local Authority", count: 300, pct: 8.8 },
          { label: "Social rented: Other social rented", count: 169, pct: 5.0 },
          { label: "Private rented", count: 523, pct: 15.4 },
          { label: "Private rented: Private landlord or letting agency", count: 500, pct: 14.7 },
          { label: "Private rented: Other private rented", count: 23, pct: 0.7 },
          { label: "Lives rent free", count: 9, pct: 0.3 },
        ],
        groups: null,
      },
      {
        code: "ts044",
        title: "Accommodation type",
        total: 3398,
        rows: [
          { label: "Detached", count: 1287, pct: 37.9 },
          { label: "Semi-detached", count: 1388, pct: 40.8 },
          { label: "Terraced", count: 481, pct: 14.2 },
          { label: "In a purpose-built block of flats or tenement", count: 208, pct: 6.1 },
          { label: "Part of a converted or shared house, including bedsits", count: 21, pct: 0.6 },
          { label: "Part of another converted building", count: 8, pct: 0.2 },
          { label: "In a commercial building", count: 3, pct: 0.1 },
          { label: "A caravan or other mobile or temporary structure", count: 2, pct: 0.1 },
        ],
        groups: null,
      },
      {
        code: "ts021",
        title: "Ethnic group",
        total: 8138,
        rows: [
          { label: "Asian, Asian British or Asian Welsh: Bangladeshi", count: 3, pct: 0.0 },
          { label: "Asian, Asian British or Asian Welsh: Chinese", count: 9, pct: 0.1 },
          { label: "Asian, Asian British or Asian Welsh: Indian", count: 43, pct: 0.5 },
          { label: "Asian, Asian British or Asian Welsh: Pakistani", count: 22, pct: 0.3 },
          { label: "Asian, Asian British or Asian Welsh: Other Asian", count: 38, pct: 0.5 },
          {
            label: "Black, Black British, Black Welsh, Caribbean or African: African",
            count: 60,
            pct: 0.7,
          },
          {
            label: "Black, Black British, Black Welsh, Caribbean or African: Caribbean",
            count: 18,
            pct: 0.2,
          },
          {
            label: "Black, Black British, Black Welsh, Caribbean or African: Other Black",
            count: 4,
            pct: 0.0,
          },
          { label: "Mixed or Multiple ethnic groups: White and Asian", count: 50, pct: 0.6 },
          {
            label: "Mixed or Multiple ethnic groups: White and Black African",
            count: 20,
            pct: 0.2,
          },
          {
            label: "Mixed or Multiple ethnic groups: White and Black Caribbean",
            count: 40,
            pct: 0.5,
          },
          {
            label: "Mixed or Multiple ethnic groups: Other Mixed or Multiple ethnic groups",
            count: 21,
            pct: 0.3,
          },
          {
            label: "White: English, Welsh, Scottish, Northern Irish or British",
            count: 7528,
            pct: 92.5,
          },
          { label: "White: Irish", count: 57, pct: 0.7 },
          { label: "White: Gypsy or Irish Traveller", count: 15, pct: 0.2 },
          { label: "White: Roma", count: 0, pct: 0.0 },
          { label: "White: Other White", count: 172, pct: 2.1 },
          { label: "Other ethnic group: Arab", count: 10, pct: 0.1 },
          { label: "Other ethnic group: Any other ethnic group", count: 28, pct: 0.3 },
        ],
        groups: [
          { label: "Asian, Asian British or Asian Welsh", count: 115, pct: 1.4 },
          { label: "Black, Black British, Black Welsh, Caribbean or African", count: 82, pct: 1.0 },
          { label: "Mixed or Multiple ethnic groups", count: 131, pct: 1.6 },
          { label: "White", count: 7772, pct: 95.5 },
          { label: "Other ethnic group", count: 38, pct: 0.5 },
        ],
      },
      {
        code: "ts030",
        title: "Religion",
        total: 8138,
        rows: [
          { label: "No religion", count: 3284, pct: 40.4 },
          { label: "Christian", count: 4232, pct: 52.0 },
          { label: "Buddhist", count: 20, pct: 0.2 },
          { label: "Hindu", count: 35, pct: 0.4 },
          { label: "Jewish", count: 9, pct: 0.1 },
          { label: "Muslim", count: 48, pct: 0.6 },
          { label: "Sikh", count: 13, pct: 0.2 },
          { label: "Other religion", count: 27, pct: 0.3 },
          { label: "Not answered", count: 470, pct: 5.8 },
        ],
        groups: null,
      },
      {
        code: "ts052",
        title: "Occupancy rating for bedrooms",
        total: 3399,
        rows: [
          { label: "+2 or more", count: 1519, pct: 44.7 },
          { label: "+1", count: 1163, pct: 34.2 },
          { label: "0", count: 660, pct: 19.4 },
          { label: "-1", count: 41, pct: 1.2 },
          { label: "-2 or less", count: 16, pct: 0.5 },
        ],
        groups: null,
      },
    ],
  };
  const view = buildReportView(input({ area: areaWith({ census: censusFull }) }));
  const grid = view.sections[5].blocks.find((b) => b.type === "chartGrid");
  if (!grid || grid.type !== "chartGrid") throw new Error("expected the census chart grid");
  const cards = grid.cards;
  const cardByTitle = (title: string) => {
    const card = cards.find((c) => c.type !== "chartGrid" && "title" in c && c.title === title);
    if (!card || card.type !== "bars") throw new Error(`expected a bars card: ${title}`);
    return card;
  };

  it("the grid opens with the Age tile, then the five cards in the Master's order", () => {
    const titles = cards.map((c) => ("title" in c ? c.title : ""));
    expect(titles).toEqual([
      "Age — Census 2021",
      "Tenure — Census 2021",
      "Accommodation type — Census 2021",
      "Ethnic group — Census 2021",
      "Religion — Census 2021",
      "Occupancy rating for bedrooms — Census 2021",
    ]);
    const age = cards[0];
    if (!age || age.type !== "statTile") throw new Error("expected the Age stat tile");
    expect(age.value).toBe("46.5 years");
    expect(age.sub).toBe("MSOA Braintree 018 · 8,138 residents counted in this area's tables");
    expect(age.caption).toBe(
      "Median age 46.5 years, calculated from the Census's single years of age for Braintree 018 (8,138 residents, 3,398 households).",
    );
    // The section-level note follows the grid.
    const gridAt = view.sections[5].blocks.findIndex((b) => b.type === "chartGrid");
    expect(view.sections[5].blocks[gridAt + 1]).toEqual({
      type: "note",
      text: "CENSUS-EXPLAINER: the whole Census area",
    });
  });

  it("tenure charts the Owned total, its split, then the other top-level tenures — no sub-part double-counts", () => {
    const tenure = cardByTitle("Tenure — Census 2021");
    expect(tenure.rows.map((r) => r.label)).toEqual([
      "Owned",
      "Owned: Owns outright",
      "Owned: Owns with a mortgage or loan",
      "Private rented",
      "Social rented",
      "Shared ownership",
      "Lives rent free",
    ]);
    expect(tenure.rows[0]).toEqual({
      label: "Owned",
      widthPct: 70.2,
      value: "70.2%",
      strong: true,
    });
    expect(tenure.rows.slice(1).every((r) => !r.strong)).toBe(true);
    expect(tenure.caption).toBe("Tenure table (TS054): 3,397 households.");
  });

  it("accommodation charts every served row unmerged, largest first and full-strength", () => {
    const accom = cardByTitle("Accommodation type — Census 2021");
    expect(accom.rows).toHaveLength(8);
    expect(accom.rows[0].label).toBe("Semi-detached");
    expect(accom.rows[0].strong).toBe(true);
    expect(accom.rows[0].value).toBe("40.8%");
    expect(accom.caption).toContain(
      "Counts, of 3,398 households: Semi-detached 1,388 · Detached 1,287",
    );
  });

  it("ethnic group charts the five headline groups; the detailed categories compose into the caption and reconcile", () => {
    const ethnic = cardByTitle("Ethnic group — Census 2021");
    expect(ethnic.rows.map((r) => r.label)).toEqual([
      "White",
      "Mixed or Multiple ethnic groups",
      "Asian, Asian British or Asian Welsh",
      "Black, Black British, Black Welsh, Caribbean or African",
      "Other ethnic group",
    ]);
    expect(ethnic.rows[0]).toEqual({
      label: "White",
      widthPct: 95.5,
      value: "95.5%",
      strong: true,
    });
    expect(ethnic.caption).toContain(
      "White 7,772 (English, Welsh, Scottish, Northern Irish or British 7,528, Other White 172, Irish 57, Gypsy or Irish Traveller 15, Roma 0)",
    );
    expect(ethnic.caption).toContain(
      "Asian, Asian British or Asian Welsh 115 (Indian 43, Other Asian 38, Pakistani 22, Chinese 9, Bangladeshi 3)",
    );
  });

  it("religion and occupancy captions carry their counts and their standing sentences", () => {
    const religion = cardByTitle("Religion — Census 2021");
    expect(religion.rows[0].label).toBe("Christian");
    expect(religion.caption).toContain("Christian 4,232 · No religion 3,284");
    expect(religion.caption).toContain("The religion question was voluntary in Census 2021.");
    const occupancy = cardByTitle("Occupancy rating for bedrooms — Census 2021");
    expect(occupancy.rows.map((r) => r.value)).toEqual(["44.7%", "34.2%", "19.4%", "1.2%", "0.5%"]);
    expect(occupancy.caption).toContain(
      "Occupancy is the Census rating comparing bedrooms in the home with the bedrooms the ONS standard says the household needs.",
    );
  });
});

describe("report — the rendered page", () => {
  it("the rendered page carries the nine numbered sections and no SAMPLE furniture", () => {
    const html = renderToStaticMarkup(
      createElement(ReportPage, { view: buildReportView(input()) }),
    );
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(html).toContain(`<span class="rpt-secNum">${n}</span>`);
    }
    expect(html).toContain("rpt-doc");
    expect(html).not.toContain("watermark");
    expect(html).not.toContain("sample-banner");
    expect(html.toLowerCase()).not.toContain("childminder");
    // The M8.2 charts render in the Master's own forms:
    // the dot plot and month chart as inline SVG in chart
    // cards, the census cards in the two-column grid, the
    // category bars with the pale tint on all but the
    // largest row.
    expect(html).toContain('class="dotPlot"');
    expect(html).toContain("Median £588,995");
    expect(html).toContain("This home — £588,995");
    expect(html).toContain('class="monthChart"');
    expect(html).toContain("Incidents by month — October 2025 to September 2026");
    expect(html).toContain(
      "Incidents by category — 12 months to September 2026 · all 14 categories",
    );
    expect(html).toContain('class="rpt-chartGrid"');
    expect(html).toContain('class="rpt-barFill light"');
    expect(html).toContain("Band spread — assessments of existing homes (RdSAP)");
    // The map is an inline SVG picture — no tile service,
    // no image, no external basemap of any kind.
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("openstreetmap");
    expect(html).not.toContain("basemap");
  });
});

// ------------------------------------------------------------------
// M8.3 — the flood-map models (genuine flood maps)
// ------------------------------------------------------------------
//
// The model builder's own tests, on fabricated geometry:
// the frame maths, the no-picture states, and the three
// caption cases (defended / clear / inside). The promise
// assertions against REAL filed geometry are the golden
// replay's (tests/golden-replay.test.ts).

type ServedFlood = Extract<FloodBundle, { kind: "flood" }>["flood"];

const MAP_HOME = { lat: 51.776176, lon: 0.60387 };
const MAP_FRAME = floodMapFrame(MAP_HOME.lat, MAP_HOME.lon);

// A square polygon (as [lon, lat] rings) centred on the
// home point, half-size d degrees.
function squareAt(lon: number, lat: number, d: number): [number, number][][][] {
  return [
    [
      [
        [lon - d, lat - d],
        [lon + d, lat - d],
        [lon + d, lat + d],
        [lon - d, lat + d],
        [lon - d, lat - d],
      ],
    ],
  ];
}

function mapsWith(overrides: Partial<FloodMaps> = {}): FloodMaps {
  const homeStreet = {
    name: "Birkdale Rise",
    highway: "residential",
    points: [
      [MAP_HOME.lon - 0.004, MAP_HOME.lat],
      [MAP_HOME.lon + 0.004, MAP_HOME.lat],
    ] as [number, number][],
  };
  return {
    frame: MAP_FRAME,
    streets: [
      homeStreet,
      {
        name: null,
        highway: "service",
        points: [
          [MAP_HOME.lon, MAP_HOME.lat - 0.004],
          [MAP_HOME.lon, MAP_HOME.lat + 0.004],
        ] as [number, number][],
      },
    ],
    homeStreet,
    zones: null,
    surfaceWater: null,
    ...overrides,
  };
}

function servedWithMaps(
  maps: FloodMaps,
  layerPatch: Record<string, Partial<ServedFlood["layers"][number]>> = {},
  bridgeLine: string | null = null,
): ServedFlood {
  if (floodServed.kind !== "flood") throw new Error("fixture is not a served flood bundle");
  const served = structuredClone(floodServed.flood) as ServedFlood;
  served.maps = maps;
  for (const layer of served.layers) {
    const patch = layerPatch[layer.layer];
    if (patch) Object.assign(layer, patch);
  }
  served.defences.bridgeLine = bridgeLine;
  return served;
}

describe("report — M8.3 flood maps: frame maths and projection", () => {
  it("the frame reaches a mile in each direction with the point centred", () => {
    const frame = floodMapFrame(MAP_HOME.lat, MAP_HOME.lon);
    expect(frame.east - frame.west).toBeGreaterThan(0.04);
    expect(frame.east - frame.west).toBeLessThan(0.052);
    expect(frame.north - frame.south).toBeCloseTo(2 / 69.0, 3);
    expect((frame.west + frame.east) / 2).toBeCloseTo(MAP_HOME.lon, 9);
    expect((frame.south + frame.north) / 2).toBeCloseTo(MAP_HOME.lat, 9);
  });

  it("projects the frame's centre to the pin and its edges to the viewBox edges", () => {
    const served = servedWithMaps(
      mapsWith({
        zones: {
          polygons: [{ label: "FZ3", polygons: squareAt(MAP_HOME.lon, MAP_HOME.lat, 0.002) }],
        },
      }),
      {
        flood_zone: {
          pointState: "inside",
          covering: { label: "FZ3", displayLabel: "Flood Zone 3", definition: "", detail: null },
        },
      },
    );
    const { zones } = buildFloodMapModels(served);
    if (!zones) throw new Error("expected a zones picture");
    expect(zones.homeX).toBe(380);
    expect(zones.homeY).toBe(280);
    const ring = zones.shades[0].polygons[0][0];
    // The square is centred on the home: its corners sit
    // symmetric about the pin.
    expect(ring[0].x + ring[2].x).toBeCloseTo(760, 0);
    expect(ring[0].y + ring[2].y).toBeCloseTo(560, 0);
    // The home street runs west–east through the centre.
    const homeLine = zones.streets.find((s) => s.home);
    if (!homeLine) throw new Error("expected the home street to be flagged");
    expect(homeLine.points[0].y).toBe(280);
    expect(homeLine.points[0].x).toBeLessThan(380);
    expect(homeLine.points[1].x).toBeGreaterThan(380);
  });

  it("the projection is isotropic: a mile east lands at the same pixel offset as a mile north", () => {
    // Known geometry: one street running exactly one mile
    // east from the home point, one running exactly one
    // mile north. In mile space (the Section 5 pattern)
    // both projected end points must sit the same pixel
    // distance from the pin — the audit's Divergence 1
    // (the build stretched east–west by about 1.36×).
    const milesPerDegLon = 69.0 * Math.cos((MAP_HOME.lat * Math.PI) / 180);
    const eastStreet = {
      name: "East Street",
      highway: "residential",
      points: [
        [MAP_HOME.lon, MAP_HOME.lat],
        [MAP_HOME.lon + 1 / milesPerDegLon, MAP_HOME.lat],
      ] as [number, number][],
    };
    const northStreet = {
      name: "North Street",
      highway: "residential",
      points: [
        [MAP_HOME.lon, MAP_HOME.lat],
        [MAP_HOME.lon, MAP_HOME.lat + 1 / 69.0],
      ] as [number, number][],
    };
    const served = servedWithMaps(
      mapsWith({
        streets: [eastStreet, northStreet],
        homeStreet: null,
        zones: {
          polygons: [
            { label: "FZ2", polygons: squareAt(MAP_HOME.lon - 0.006, MAP_HOME.lat, 0.0015) },
          ],
        },
      }),
      { flood_zone: { pointState: "zone-1", covering: null } },
    );
    const { zones } = buildFloodMapModels(served);
    if (!zones) throw new Error("expected a zones picture");
    const east = zones.streets[0].points[1];
    const north = zones.streets[1].points[1];
    const eastOffset = east.x - zones.homeX;
    const northOffset = zones.homeY - north.y;
    expect(eastOffset).toBeGreaterThan(0);
    expect(northOffset).toBeGreaterThan(0);
    // Equal miles, equal pixels (to the model's 0.1px
    // rounding), at the fitted scale: the frame's two
    // miles span the card's 560 height.
    expect(Math.abs(eastOffset - northOffset)).toBeLessThan(0.2);
    expect(eastOffset).toBeCloseTo(280, 0);
    expect(northOffset).toBeCloseTo(280, 0);
  });
});

describe("report — M8.3 flood maps: JSON round-trip cleanliness", () => {
  it("no model leaf is -0 or NaN, even for geometry a hair outside the frame edge", () => {
    // The served geometry arrives as GeoJSON, whose
    // coordinate rounding can leave a clipped vertex a
    // hair beyond the frame's north edge; projected, its
    // y lands a hair below zero and the 0.1 rounding
    // would emit -0 — a different leaf from 0 to a strict
    // equality check, the same leaf in JSON, so the
    // model fails its own round-trip (CI #266).
    const polygons = squareAt(MAP_HOME.lon, MAP_FRAME.north - 0.0005, 0.0005);
    polygons[0][0][2][1] = MAP_FRAME.north + 0.000001;
    polygons[0][0][3][1] = MAP_FRAME.north + 0.000001;
    const served = servedWithMaps(mapsWith({ zones: { polygons: [{ label: "FZ2", polygons }] } }), {
      flood_zone: { pointState: "zone-1", covering: null },
    });
    const models = buildFloodMapModels(served);
    if (!models.zones) throw new Error("expected a zones picture");
    const scan = (value: unknown, path: string): void => {
      if (typeof value === "number") {
        if (Object.is(value, -0)) throw new Error(`${path} is -0`);
        if (Number.isNaN(value)) throw new Error(`${path} is NaN`);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((v, i) => scan(v, `${path}[${i}]`));
        return;
      }
      if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) scan(v, `${path}.${k}`);
      }
    };
    scan(models, "models");
    expect(JSON.parse(JSON.stringify(models))).toEqual(models);
  });
});

describe("report — M8.3 flood maps: the no-picture states", () => {
  it("an unfiled layer (null entry) builds no picture, and Section 7 carries none", () => {
    const served = servedWithMaps(mapsWith());
    const models = buildFloodMapModels(served);
    expect(models.zones).toBeNull();
    expect(models.surfaceWater).toBeNull();
    const view = buildReportView(input());
    expect(view.sections[6].blocks.filter((b) => b.type === "floodMap")).toEqual([]);
  });

  it("shapes without street lines build no picture (the bundle's null stands)", () => {
    // buildFloodMaps' rule, exercised at the bundle seam in
    // tests/flood.test.ts; here the served null is honoured.
    const served = servedWithMaps(mapsWith({ zones: null, surfaceWater: null }));
    expect(buildFloodMapModels(served).zones).toBeNull();
  });
});

describe("report — M8.3 flood maps: captions", () => {
  it("defended: inside a zone, Very low rivers & sea — the caption carries the defences point", () => {
    const served = servedWithMaps(
      mapsWith({
        zones: {
          polygons: [{ label: "FZ3", polygons: squareAt(MAP_HOME.lon, MAP_HOME.lat, 0.002) }],
        },
      }),
      {
        flood_zone: {
          pointState: "inside",
          line: "the postcode point falls inside Flood Zone 3 on the Environment Agency's planning map",
          covering: { label: "FZ3", displayLabel: "Flood Zone 3", definition: "", detail: null },
        },
        rofrs: {
          pointState: "inside",
          line: "the postcode point falls in the Very low band on the Environment Agency's map of flooding from rivers and the sea",
          covering: { label: "Very low", displayLabel: "Very low", definition: "", detail: null },
        },
      },
      "BRIDGE",
    );
    const { zones } = buildFloodMapModels(served);
    if (!zones) throw new Error("expected a zones picture");
    expect(zones.caption).toContain("falls inside Flood Zone 3");
    expect(zones.caption).toContain("falls in the Very low band");
    expect(zones.caption).toContain("already counts the flood defences in place");
    expect(zones.ariaLabel).toContain("sits inside Flood Zone 3");
  });

  it("clear: shapes in frame, the home outside them — the caption claims the point's state, not the street's", () => {
    const served = servedWithMaps(
      mapsWith({
        zones: {
          polygons: [
            {
              label: "FZ2",
              polygons: squareAt(MAP_HOME.lon - 0.006, MAP_HOME.lat + 0.004, 0.0015),
            },
          ],
        },
        surfaceWater: {
          polygons: [
            {
              label: "Low",
              polygons: squareAt(MAP_HOME.lon + 0.006, MAP_HOME.lat - 0.004, 0.0015),
            },
          ],
        },
      }),
      {
        flood_zone: {
          pointState: "zone-1",
          line: "the postcode point is not in Flood Zone 2 or Flood Zone 3 on the Environment Agency's planning map",
          covering: null,
        },
        rofsw: {
          pointState: "below-lowest-band",
          line: "no surface-water band reaches this point — below the lowest band this product publishes",
          covering: null,
        },
      },
    );
    const models = buildFloodMapModels(served);
    if (!models.zones || !models.surfaceWater) throw new Error("expected both pictures");
    expect(models.zones.caption).toContain("this home sits outside them");
    expect(models.zones.caption).not.toContain("Birkdale Rise sits outside them");
    expect(models.zones.caption).toContain("not in Flood Zone 2 or Flood Zone 3");
    expect(models.zones.ariaLabel).toContain("sits outside every shaded area");
    expect(models.surfaceWater.caption).toContain("this home sits outside them");
    // Legend strongest first; shades drawn weakest first.
    expect(models.surfaceWater.legend.map((l) => l.label)).toEqual(["Low"]);
    expect(models.zones.shades.map((s) => s.label)).toEqual(["FZ2"]);
  });

  it("inside a surface-water band: the caption is the layer's own line; draw order is weakest first", () => {
    const served = servedWithMaps(
      mapsWith({
        surfaceWater: {
          polygons: [
            { label: "High", polygons: squareAt(MAP_HOME.lon, MAP_HOME.lat, 0.002) },
            { label: "Low", polygons: squareAt(MAP_HOME.lon - 0.005, MAP_HOME.lat, 0.0015) },
          ],
        },
      }),
      {
        rofsw: {
          pointState: "inside",
          line: "the postcode point falls in the High band on the Environment Agency's surface water map",
          covering: { label: "High", displayLabel: "High", definition: "", detail: null },
        },
      },
    );
    const { surfaceWater } = buildFloodMapModels(served);
    if (!surfaceWater) throw new Error("expected a surface-water picture");
    expect(surfaceWater.caption).toBe(
      "The postcode point falls in the High band on the Environment Agency's surface water map.",
    );
    expect(surfaceWater.shades.map((s) => s.label)).toEqual(["Low", "High"]);
    expect(surfaceWater.legend.map((l) => l.label)).toEqual(["High", "Low"]);
    expect(surfaceWater.attribution).toContain("OpenStreetMap contributors");
  });
});

describe("report — M8.3 flood maps: the home-street label", () => {
  it("Birkdale: the model labels Birkdale Rise along its line, clear of the pin, and the rendered picture carries the name", () => {
    const maps = mapsWith({
      zones: {
        polygons: [
          { label: "FZ2", polygons: squareAt(MAP_HOME.lon - 0.006, MAP_HOME.lat + 0.004, 0.0015) },
        ],
      },
    });
    const served = servedWithMaps(maps, {
      flood_zone: { pointState: "zone-1", covering: null },
    });
    const { zones } = buildFloodMapModels(served);
    if (!zones) throw new Error("expected a zones picture");
    const label = zones.homeStreetLabel;
    if (!label) throw new Error("expected the home street to be labelled");
    expect(label.text).toBe("Birkdale Rise");
    // The fabricated street runs west–east: no rotation,
    // and the anchor sits well clear of the pin (r = 11).
    expect(label.angle).toBe(0);
    expect(Math.hypot(label.x - zones.homeX, label.y - zones.homeY)).toBeGreaterThan(40);
    expect(zones.ariaLabel).toContain("The home street, Birkdale Rise, is labelled");
    // The rendered picture carries the name as an SVG
    // text element (the label itself, not the aria text).
    const bundle: FloodBundle = {
      ...(floodServed as Extract<FloodBundle, { kind: "flood" }>),
      flood: served,
    };
    const rendered = renderToStaticMarkup(
      createElement(ReportPage, { view: buildReportView(input({ flood: bundle })) }),
    );
    expect(rendered).toMatch(/<text[^>]*>Birkdale Rise<\/text>/);
  });

  it("Exeter: the model labels Exeter Road on a north–south street, and the rendered picture carries the name", () => {
    const exeterRoad = {
      name: "Exeter Road",
      highway: "residential",
      points: [
        [MAP_HOME.lon, MAP_HOME.lat - 0.004],
        [MAP_HOME.lon, MAP_HOME.lat + 0.004],
      ] as [number, number][],
    };
    const maps = mapsWith({
      streets: [exeterRoad],
      homeStreet: exeterRoad,
      zones: {
        polygons: [{ label: "FZ3", polygons: squareAt(MAP_HOME.lon, MAP_HOME.lat, 0.002) }],
      },
    });
    const served = servedWithMaps(maps, {
      flood_zone: {
        pointState: "inside",
        covering: { label: "FZ3", displayLabel: "Flood Zone 3", definition: "", detail: null },
      },
    });
    const { zones } = buildFloodMapModels(served);
    if (!zones) throw new Error("expected a zones picture");
    const label = zones.homeStreetLabel;
    if (!label) throw new Error("expected the home street to be labelled");
    expect(label.text).toBe("Exeter Road");
    // A north–south street: the label turns with the
    // line (never upside down) and clears the pin.
    expect(Math.abs(label.angle)).toBe(90);
    expect(Math.hypot(label.x - zones.homeX, label.y - zones.homeY)).toBeGreaterThan(40);
    expect(zones.ariaLabel).toContain("The home street, Exeter Road, is labelled");
    const bundle: FloodBundle = {
      ...(floodServed as Extract<FloodBundle, { kind: "flood" }>),
      flood: served,
    };
    const rendered = renderToStaticMarkup(
      createElement(ReportPage, { view: buildReportView(input({ flood: bundle })) }),
    );
    expect(rendered).toMatch(/<text[^>]*>Exeter Road<\/text>/);
  });

  it("no resolved home street: no label is built", () => {
    const served = servedWithMaps(
      mapsWith({
        homeStreet: null,
        zones: {
          polygons: [
            { label: "FZ2", polygons: squareAt(MAP_HOME.lon - 0.006, MAP_HOME.lat, 0.0015) },
          ],
        },
      }),
      { flood_zone: { pointState: "zone-1", covering: null } },
    );
    const { zones } = buildFloodMapModels(served);
    if (!zones) throw new Error("expected a zones picture");
    expect(zones.homeStreetLabel).toBeNull();
    expect(zones.ariaLabel).not.toContain("is labelled");
  });
});

describe("report — M8.3 flood maps: Section 7 placement", () => {
  it("each picture rides directly under its own layer's words", () => {
    const maps = mapsWith({
      zones: {
        polygons: [
          { label: "FZ2", polygons: squareAt(MAP_HOME.lon - 0.006, MAP_HOME.lat, 0.0015) },
        ],
      },
      surfaceWater: {
        polygons: [
          { label: "Low", polygons: squareAt(MAP_HOME.lon + 0.006, MAP_HOME.lat, 0.0015) },
        ],
      },
    });
    const flood = servedWithMaps(maps, {
      flood_zone: { pointState: "zone-1", covering: null },
      rofsw: { pointState: "below-lowest-band", covering: null },
    });
    const bundle: FloodBundle = {
      ...(floodServed as Extract<FloodBundle, { kind: "flood" }>),
      flood,
    };
    const view = buildReportView(input({ flood: bundle }));
    const blocks = view.sections[6].blocks;
    const types = blocks.map((b) => b.type);
    const zonesSub = blocks.findIndex((b) => b.type === "sub" && b.text === "Flood zones");
    const rofrsSub = blocks.findIndex(
      (b) => b.type === "sub" && b.text === "Flooding from rivers & sea",
    );
    const rofswSub = blocks.findIndex(
      (b) => b.type === "sub" && b.text === "Flooding from surface water",
    );
    const mapIdx = types.map((t, i) => (t === "floodMap" ? i : -1)).filter((i) => i >= 0);
    expect(mapIdx).toHaveLength(2);
    expect(mapIdx[0]).toBeGreaterThan(zonesSub);
    expect(mapIdx[0]).toBeLessThan(rofrsSub);
    expect(mapIdx[1]).toBeGreaterThan(rofswSub);
    const rendered = renderToStaticMarkup(createElement(ReportPage, { view }));
    expect(rendered).toContain("Flood zones for planning (rivers and the sea)");
    expect(rendered).toContain("OpenStreetMap contributors");
  });
});
