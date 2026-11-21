import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportPage from "../components/ReportPage";
import type { AddressResolution } from "../lib/address";
import type { AreaBundle, AreaSections, ServedCertificate } from "../lib/area-bundle";
import type { FloodBundle, ServedFloodLayer } from "../lib/flood";
import {
  SELLER_QUESTIONS_EMPTY_LINE,
  buildReportView,
  type ReportInput,
  type ReportView,
} from "../lib/report";
import type { SoldPricesBundle } from "../lib/sold-prices";
import {
  areaWith,
  baseNearby,
  birkdale,
  floodServed,
  input,
  nearbyWith,
  soldServed,
} from "./fixtures/report-inputs";

// M8.5 — Section 9, "Questions to ask the seller": the
// eleven hand-written blocks, their fixed selection rules
// over the report's own facts, the cap of five in the
// samples' priority order, and the guardrail (no block
// is ever drawn from the demographics or benefits
// figures). The golden sets are the approved samples'
// own: Birkdale's five and Exeter's five, reproduced
// from the fabricated golden views, in sample order.
// Two sample leads are carried in their served form, on
// the project's standing rule that the served facts
// govern where a hand-made sample overclaims: broadband
// says "gigabit-capable" (Ofcom's data does not separate
// full fibre, as the broadband section's own explainer
// states), and school places names "the nearest primary
// school" and "the council" (no served fact names the
// village schools or the county council).

interface AskedQuestion {
  title: string;
  text: string;
}

function section8(view: ReportView) {
  const found = view.sections.find((s) => s.number === 9);
  if (!found) throw new Error("no Section 9");
  return found;
}

function questionsOf(view: ReportView): AskedQuestion[] {
  const block = section8(view).blocks.find((b) => b.type === "questions");
  if (!block || block.type !== "questions") return [];
  return block.items;
}

function rendered(view: ReportView): string[] {
  return questionsOf(view).map((q) => `${q.title}: ${q.text}`);
}

function introOf(view: ReportView): string | null {
  const block = section8(view).blocks.find((b) => b.type === "intro");
  return block && block.type === "intro" ? block.text : null;
}

function titles(view: ReportView): string[] {
  return questionsOf(view).map((q) => q.title);
}

// --- Fabrication helpers --------------------------------

const baseArea = areaWith();
if (baseArea.kind !== "area-bundle") throw new Error("expected an area bundle");
const baseSections: AreaSections = baseArea.sections;

function areaPatched(patch: Partial<AreaSections>): AreaBundle {
  const fresh = areaWith();
  if (fresh.kind !== "area-bundle") throw new Error("expected an area bundle");
  return { ...fresh, sections: { ...fresh.sections, ...patch } };
}

function floodPatched(
  patchLayers: (layers: ServedFloodLayer[]) => ServedFloodLayer[],
): FloodBundle {
  return {
    ...floodServed,
    flood: { ...floodServed.flood, layers: patchLayers(floodServed.flood.layers) },
  };
}

function layerPatched(type: string, patch: Partial<ServedFloodLayer>): FloodBundle {
  return floodPatched((layers) =>
    layers.map((layer) => (layer.layer === type ? { ...layer, ...patch } : layer)),
  );
}

function certPatched(patch: Partial<ServedCertificate>): AreaBundle {
  const base = baseSections.epc.certificates[0];
  if (!base) throw new Error("no base certificate");
  return areaPatched({
    epc: { ...baseSections.epc, certificates: [{ ...base, ...patch }] },
  });
}

const FLOOD_LABELS = {
  fz3: {
    label: "FZ3",
    displayLabel: "Flood Zone 3",
    definition:
      "land having a 1 in 100 or greater annual probability of river flooding, or a 1 in 200 or greater annual probability of sea flooding",
    detail: "river and sea · modelled",
  },
  veryLow: {
    label: "Very low",
    displayLabel: "Very low",
    definition: "a chance of flooding in any given year of less than 1 in 1,000",
    detail: ">0 m",
  },
  lowLabel: {
    label: "Low",
    displayLabel: "Low",
    definition: "a chance of flooding in any given year between 1 in 1,000 and 1 in 100",
    detail: ">0 m",
  },
  lowEdge: {
    label: "Low",
    displayLabel: "Low",
    definition: "a chance of flooding in any given year between 1 in 1,000 and 1 in 100",
    detail: ">0 m",
    miles: 0.01,
  },
  highEdge: {
    label: "High",
    displayLabel: "High",
    definition: "a 1 in 30 or greater chance of flooding in any given year",
    detail: ">0 m",
    miles: 0.1,
  },
};

// The Exeter fabrication: FZ3 covering the point with
// the defended rivers & sea rating Very low, a leasehold
// last sale, two certificates that disagree on floor area
// (71 m² in 2013, 91 m² in 2023), the newest recording a
// community heating scheme and no published improvements.
const exeterResolution: Extract<AddressResolution, { rung: 1 }> = {
  rung: 1,
  kind: "home",
  address: {
    postcode: "E16 1GN",
    paon: "6",
    saon: null,
    street: "EXETER ROAD",
    locality: null,
    town: "LONDON",
    label: "6 Exeter Road",
  },
  directory: {
    postcode: "E16 1GN",
    latitude: 51.5152,
    longitude: 0.0212,
    council: "Newham",
    ward: "Custom House",
    region: "London",
    lsoaCode: "E01023787",
    msoaCode: "E02000749",
  },
};

function exeterCert(partial: Partial<ServedCertificate>): ServedCertificate {
  return {
    certificateNumber: "0000-0000-0000-0000-0002",
    address: "6 Exeter Road, London",
    band: "B",
    rating: 82,
    ratingLine: null,
    potentialBand: "A",
    potentialRating: 91,
    floorAreaSqM: null,
    dwellingType: "Maisonette",
    assessmentType: "RdSAP",
    predicted: false,
    assessmentLabel: "Assessed (RdSAP)",
    registrationDate: null,
    solarFacts: [],
    energyCosts: null,
    improvements: null,
    construction: null,
    ...partial,
  };
}

const exeterCert2013 = exeterCert({
  certificateNumber: "0000-0000-0000-0000-2013",
  floorAreaSqM: 71,
  registrationDate: "2013-10-14",
  assessmentType: "SAP",
  assessmentLabel: "Assessed (SAP)",
});
const exeterCert2023 = exeterCert({
  certificateNumber: "0000-0000-0000-0000-2023",
  floorAreaSqM: 91,
  registrationDate: "2023-05-25",
  improvements: {
    state: "none-published",
    line: "no measures published",
    steps: [],
    closingLine: null,
  },
  construction: {
    line: "CONSTRUCTION-LINE",
    uValueLine: null,
    groups: [
      {
        key: "mainHeating",
        label: "Main heating",
        descriptions: ["Community scheme"],
        line: "Main heating: Community scheme",
      },
    ],
  },
});

const exeterInput: ReportInput = input({
  resolution: exeterResolution,
  sold: {
    ...soldServed,
    postcode: "E16 1GN",
    ownHistory: [
      {
        price: 270000,
        date: "2021-03-05",
        propertyType: "F",
        tenure: "L",
        newBuild: false,
        address: "6 Exeter Road",
      },
    ],
    recentSales: [
      {
        price: 270000,
        date: "2021-03-05",
        propertyType: "F",
        tenure: "L",
        newBuild: false,
        address: "6 Exeter Road",
      },
    ],
  },
  flood: {
    ...floodServed,
    postcode: "E16 1GN",
    flood: {
      ...floodServed.flood,
      layers: floodServed.flood.layers.map((layer) => {
        if (layer.layer === "flood_zone")
          return { ...layer, pointState: "inside" as const, covering: FLOOD_LABELS.fz3 };
        if (layer.layer === "rofrs")
          return { ...layer, pointState: "inside" as const, covering: FLOOD_LABELS.veryLow };
        if (layer.layer === "rofsw") return { ...layer, proximity: [FLOOD_LABELS.lowEdge] };
        return layer;
      }),
    },
  },
  area: areaPatched({
    epc: { ...baseSections.epc, certificates: [exeterCert2013, exeterCert2023] },
  }),
});

// --- The golden sets ------------------------------------

describe("report — M8.5 seller questions: the golden sets", () => {
  it("Birkdale asks its five, in the sample's order, word for word where the served facts carry the sample's words", () => {
    const view = buildReportView(input());
    expect(introOf(view)).toBe(
      "Five questions drawn from this home's own results above — the points a viewing or a direct question can settle.",
    );
    expect(rendered(view)).toEqual([
      "Council tax band: the band isn't published in the sources checked — ask the seller to confirm it, and check it against the GOV.UK council tax band service before you budget.",
      "Surface water: the postcode is mapped only in the extreme 1-in-1,000-year surface-water event — ask whether the street or the plot has ever flooded or held standing water in heavy rain, and whether drains or soakaways have ever been an issue.",
      "Energy improvements: the certificate's suggested steps would save about £34 a year and lift the home from B (85) to A — ask which, if any, of those steps have already been done since the certificate was issued.",
      "Broadband at No. 19: the postcode is gigabit-capable — ask which provider the current service uses and what speed is actually delivered at this house.",
      "School places: living 0.3 miles from the nearest primary school does not guarantee a place — check admissions and recent cut-off distances with the council and the schools directly.",
    ]);
  });

  it("Exeter asks its own different five, in the sample's order", () => {
    const view = buildReportView(exeterInput);
    expect(introOf(view)).toBe(
      "Five questions drawn from this home's own results above — the points a viewing or a direct question can settle.",
    );
    expect(rendered(view)).toEqual([
      "Flood risk and insurance: the planning map puts this postcode in Flood Zone 3, while the long-term check with the flood defences in place rates the risk very low — ask whether the home has ever flooded, whether buildings insurance has ever been refused, loaded or made subject to a flood excess, and what the current premium is.",
      "The lease: this home is leasehold — ask how many years are left on the lease, what the ground rent is and how it reviews, and what the annual service charge is and what it covers. None of those figures are in the public sources checked for this report, and they decide what this home really costs to own.",
      "Community heating: heating and hot water come from a community scheme — ask who runs it, what the unit rate and standing charge are, what the current household pays over a year, and whether any scheme repairs or price rises are planned.",
      "Floor area: the two energy certificates disagree — 71 m² in 2013 and 91 m² in 2023 — ask the seller to confirm the home's actual internal area, and check the current certificate on GOV.UK.",
      "Council tax band: the band isn't published in the sources checked — ask the seller to confirm it, and check it against the GOV.UK council tax band service before you budget.",
    ]);
  });

  it("the flood block is Question 1 whenever it fires (the Exeter cross-reference standing)", () => {
    const view = buildReportView(exeterInput);
    expect(questionsOf(view)[0]?.title).toBe("Flood risk and insurance");
  });

  it("the cap: a home triggering ten blocks shows exactly the priority top five", () => {
    // Exeter, plus a predicted certificate with published
    // improvements (estate charges and energy improvements
    // now fire too): ten blocks trigger, five stand.
    const greedy = buildReportView({
      ...exeterInput,
      area: areaPatched({
        epc: {
          ...baseSections.epc,
          certificates: [
            exeterCert2013,
            {
              ...exeterCert2023,
              predicted: true,
              improvements: {
                state: "served",
                line: "IMPROVEMENTS-LINE",
                steps: [
                  {
                    sequence: 1,
                    name: "Insulation",
                    typicalSavingPence: 5000,
                    typicalSavingLabel: "£50",
                    indicativeCost: "£100",
                    energyRatingAfter: 91,
                    environmentalRatingAfter: null,
                    line: "1. Insulation — typical saving £50 a year",
                  },
                ],
                closingLine: null,
              },
            },
          ],
        },
      }),
    });
    expect(titles(greedy)).toEqual([
      "Flood risk and insurance",
      "The lease",
      "Community heating",
      "Floor area",
      "Council tax band",
    ]);
  });

  it("the snapshot stays plain serialisable data with the questions in it", () => {
    const view = buildReportView(exeterInput);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it("the rendered page prints the numbered list in the sample's form, and the PDF twin inherits it", () => {
    const html = renderToStaticMarkup(
      createElement(ReportPage, { view: buildReportView(input()) }),
    );
    expect(html).toContain('<ol class="rpt-seller">');
    expect(html).toContain("<strong>Council tax band:</strong>");
    expect(html).toContain("<strong>Broadband at No. 19:</strong>");
  });

  it("no question reaches the short version on the same page", () => {
    const view = buildReportView(input());
    const short = JSON.stringify(view.shortVersion);
    // The questions' own sentences never leak upward. (A
    // one-word topic title — "Surface water" — is a
    // shared label, not a leak: the flood layer carries
    // the same name in the short version by right, since
    // the parity batch composed its bullets.)
    for (const q of questionsOf(view)) expect(short).not.toContain(q.text);
    expect(short).not.toContain("ask the seller");
  });

  it("a whole-postcode (rung 2) report carries no questions — there is no single seller", () => {
    const rung2Resolution: AddressResolution = {
      rung: 2,
      kind: "address-list",
      directory: birkdale.directory,
      street: null,
      building: null,
      addresses: [],
    };
    const soldRung2 = { ...soldServed, rung: 2 } as unknown as SoldPricesBundle;
    const view = buildReportView(input({ resolution: rung2Resolution, sold: soldRung2 }));
    expect(section8(view).blocks).toEqual([]);
  });
});

// --- The rules, block by block --------------------------

describe("report — M8.5 seller questions: the block rules", () => {
  it("flood and insurance: silent when the defended rating is not Very low", () => {
    const flood = floodPatched((layers) =>
      layers.map((layer) => {
        if (layer.layer === "flood_zone")
          return { ...layer, pointState: "inside" as const, covering: FLOOD_LABELS.fz3 };
        if (layer.layer === "rofrs")
          return {
            ...layer,
            pointState: "inside" as const,
            covering: { ...FLOOD_LABELS.veryLow, label: "Low", displayLabel: "Low" },
          };
        return layer;
      }),
    );
    const view = buildReportView({ ...exeterInput, flood });
    expect(titles(view)).not.toContain("Flood risk and insurance");
  });

  it("the lease: fires on a leasehold last sale, silent on Birkdale's freehold", () => {
    expect(titles(buildReportView(input()))).not.toContain("The lease");
    const leasehold = buildReportView(
      input({
        sold: {
          ...soldServed,
          ownHistory: soldServed.ownHistory.map((sale, i) =>
            i === 0 ? { ...sale, tenure: "L" } : sale,
          ),
        },
      }),
    );
    expect(titles(leasehold)).toContain("The lease");
  });

  it("community heating: fires on the register's community description, silent on a boiler", () => {
    const withHeating = (descriptions: string[]) =>
      buildReportView(
        input({
          area: certPatched({
            construction: {
              line: "CONSTRUCTION-LINE",
              uValueLine: null,
              groups: [
                {
                  key: "mainHeating",
                  label: "Main heating",
                  descriptions,
                  line: `Main heating: ${descriptions.join(", ")}`,
                },
              ],
            },
          }),
        }),
      );
    expect(titles(withHeating(["Community scheme"]))).toContain("Community heating");
    expect(titles(withHeating(["Boiler, mains gas"]))).not.toContain("Community heating");
  });

  it("floor area: fires only where two dated certificates disagree", () => {
    const base = baseSections.epc.certificates[0];
    if (!base) throw new Error("no base certificate");
    const twoCerts = (a: Partial<ServedCertificate>, b: Partial<ServedCertificate>) => {
      return buildReportView(
        input({
          area: areaPatched({
            epc: {
              ...baseSections.epc,
              certificates: [
                { ...base, ...a },
                { ...base, certificateNumber: "0000-0000-0000-0000-0099", ...b },
              ],
            },
          }),
        }),
      );
    };
    const disagree = twoCerts(
      { floorAreaSqM: 100, registrationDate: "2020-01-15" },
      { floorAreaSqM: 118, registrationDate: "2023-05-09" },
    );
    expect(rendered(disagree)).toContain(
      "Floor area: the two energy certificates disagree — 100 m² in 2020 and 118 m² in 2023 — ask the seller to confirm the home's actual internal area, and check the current certificate on GOV.UK.",
    );
    const agree = twoCerts(
      { floorAreaSqM: 118, registrationDate: "2020-01-15" },
      { floorAreaSqM: 118, registrationDate: "2023-05-09" },
    );
    expect(titles(agree)).not.toContain("Floor area");
    const undated = twoCerts(
      { floorAreaSqM: 100, registrationDate: null },
      { floorAreaSqM: 118, registrationDate: "2023-05-09" },
    );
    expect(titles(undated)).not.toContain("Floor area");
  });

  it("council tax: fires on the served scale, silent where the council is not filed (our gap, not a question)", () => {
    expect(titles(buildReportView(input()))).toContain("Council tax band");
    const notFiled = buildReportView(
      input({
        area: areaPatched({
          councilTax: { ...baseSections.councilTax, state: "not-filed" },
        }),
      }),
    );
    expect(titles(notFiled)).not.toContain("Council tax band");
  });

  it("planning: fires only where the hand-off serves no register link (no golden home triggers it)", () => {
    expect(titles(buildReportView(input()))).not.toContain("Planning applications");
    const bare = buildReportView(
      input({
        area: areaPatched({
          planningApplications: { ...baseSections.planningApplications, link: null },
        }),
      }),
    );
    expect(rendered(bare)).toContain(
      "Planning applications: there is no register this report can link to for this area, and it holds no copy of any council's register — ask the seller whether any planning applications have been made for this home or the homes around it, and whether any work on the home was done with the planning consent it needed.",
    );
  });

  it("estate charges: fires while the register knows the home only as a new build (a predicted certificate)", () => {
    expect(titles(buildReportView(input()))).not.toContain("Estate charges and warranties");
    const predicted = buildReportView(input({ area: certPatched({ predicted: true }) }));
    expect(rendered(predicted)).toContain(
      "Estate charges and warranties: this is a 2023 new build on a modern estate — is there an annual estate or management charge, what does it cover, and are the builder's warranties still running with any snagging or defect claims still open?",
    );
  });

  it("surface water: the edge form for a High band nearby; silent with nothing mapped near, or the point inside a band", () => {
    const high = buildReportView(
      input({ flood: layerPatched("rofsw", { proximity: [FLOOD_LABELS.highEdge] }) }),
    );
    expect(rendered(high)).toContain(
      "Surface water: the nearest High surface-water band edge is 0.1 miles from this home — ask whether the street or the plot has ever flooded or held standing water in heavy rain, and whether drains or soakaways have ever been an issue.",
    );
    const noneNear = buildReportView(input({ flood: layerPatched("rofsw", { proximity: [] }) }));
    expect(titles(noneNear)).not.toContain("Surface water");
    const inside = buildReportView(
      input({
        flood: layerPatched("rofsw", {
          pointState: "inside",
          covering: FLOOD_LABELS.lowLabel,
          proximity: [],
        }),
      }),
    );
    expect(titles(inside)).not.toContain("Surface water");
  });

  it("energy improvements: a step with no filed saving leaves a hole in the total, so the block stays silent", () => {
    const base = baseSections.epc.certificates[0];
    if (!base) throw new Error("no base certificate");
    const improvements = base.improvements;
    if (!improvements || improvements.state !== "served") throw new Error("fixture drift");
    const holed = buildReportView(
      input({
        area: certPatched({
          improvements: {
            ...improvements,
            steps: improvements.steps.map((step, i) =>
              i === 0 ? { ...step, typicalSavingPence: null } : step,
            ),
          },
        }),
      }),
    );
    expect(titles(holed)).not.toContain("Energy improvements");
    const unpublished = buildReportView(input({ area: certPatched({ improvements: null }) }));
    expect(titles(unpublished)).not.toContain("Energy improvements");
  });

  it("broadband: fires only where every premises in the postcode is gigabit-capable", () => {
    expect(titles(buildReportView(input()))).toContain("Broadband at No. 19");
    const partial = buildReportView(
      input({
        area: areaPatched({
          broadband: { ...baseSections.broadband, gigabitCapablePct: 99 },
        }),
      }),
    );
    expect(titles(partial).some((t) => t.startsWith("Broadband"))).toBe(false);
  });

  it("school places: the grammar tail follows only where a selective school stands within the radius", () => {
    if (baseNearby.kind !== "distances") throw new Error("expected a distances bundle");
    const near = buildReportView(
      input({
        nearby: {
          ...baseNearby,
          categories: baseNearby.categories.map((answer) =>
            answer.category === "schools-secondary"
              ? {
                  ...answer,
                  nearestSelective: { name: "King Edward VI Grammar School", miles: 1.5 },
                }
              : answer,
          ),
        },
      }),
    );
    expect(rendered(near)).toContain(
      "School places: living 0.3 miles from the nearest primary school does not guarantee a place — check admissions and recent cut-off distances with the council and the schools directly, and note that King Edward VI Grammar School admits by test.",
    );
    const noneNear = buildReportView(input({ nearby: nearbyWith({}) }));
    expect(titles(noneNear)).not.toContain("School places");
  });
});

// --- The intro, the empty case, the guardrail -----------

describe("report — M8.5 seller questions: intro, empty case, guardrail", () => {
  // A view with every trigger stripped: freehold, no
  // flood proximity, council tax not filed, no
  // certificates, no gigabit figure, no schools within —
  // while the area bundle stays rich in exactly the
  // figures the guardrail protects (Census tables,
  // benefits series, IMD) and the crime bundle serves.
  const stripped = () =>
    input({
      area: areaPatched({
        councilTax: { ...baseSections.councilTax, state: "not-filed" },
        broadband: { ...baseSections.broadband, gigabitCapablePct: null },
        epc: { ...baseSections.epc, certificates: [] },
      }),
      flood: layerPatched("rofsw", { proximity: [] }),
      nearby: nearbyWith({}),
    });

  it("the empty case: one honest line, no intro, no questions", () => {
    const view = buildReportView(stripped());
    expect(section8(view).blocks).toEqual([{ type: "line", text: SELLER_QUESTIONS_EMPTY_LINE }]);
    expect(SELLER_QUESTIONS_EMPTY_LINE).toBe(
      "Nothing in this home's results above raised a question that needs a seller's answer — every check was answered from the published sources.",
    );
  });

  it("the guardrail: demographics and benefits figures trigger nothing, however rich the view", () => {
    const view = buildReportView(stripped());
    // The view really is rich in the protected figures:
    // Section 6 carries the Census tables and the
    // benefits series, Section 4 the crime counts
    // (the print-check regrouping, item 14).
    expect(JSON.stringify(view.sections[5])).toContain("Tenure");
    expect(JSON.stringify(view.sections[5])).toContain("Claimant count");
    expect(JSON.stringify(view.sections[3])).toContain("330 incidents");
    expect(JSON.stringify(view.sections[3])).not.toContain("Claimant count");
    // And Section 9 is the empty line alone — no block
    // was drawn from any of it.
    expect(questionsOf(view)).toEqual([]);
    expect(section8(view).blocks).toEqual([{ type: "line", text: SELLER_QUESTIONS_EMPTY_LINE }]);
  });

  it("the intro counts in words, singular and plural", () => {
    // The stripped view with only the council tax scale
    // restored: exactly one question (the band).
    const one = buildReportView({
      ...stripped(),
      area: areaPatched({
        councilTax: baseSections.councilTax,
        broadband: { ...baseSections.broadband, gigabitCapablePct: null },
        epc: { ...baseSections.epc, certificates: [] },
      }),
    });
    expect(titles(one)).toEqual(["Council tax band"]);
    expect(introOf(one)).toBe(
      "One question drawn from this home's own results above — the point a viewing or a direct question can settle.",
    );
    // Restore the gigabit figure as well: two questions.
    const two = buildReportView({
      ...stripped(),
      area: areaPatched({
        councilTax: baseSections.councilTax,
        epc: { ...baseSections.epc, certificates: [] },
      }),
    });
    expect(titles(two)).toEqual(["Council tax band", "Broadband at No. 19"]);
    expect(introOf(two)).toBe(
      "Two questions drawn from this home's own results above — the points a viewing or a direct question can settle.",
    );
  });
});
