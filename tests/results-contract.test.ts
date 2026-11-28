import { describe, expect, it } from "vitest";

import type { AddressResolution } from "../lib/address";
import type { AreaBundle } from "../lib/area-bundle";
import type { CrimeBundle } from "../lib/crime";
import type { FloodBundle } from "../lib/flood";
import {
  EV_LIST_SIZE,
  LIST_SIZE,
  PET_LIST_SIZE,
  REPORT_SCHOOL_LIST_SIZE,
  reportListSizeFor,
  type CategoryAnswer,
  type NearbyCategory,
} from "../lib/nearby";
import {
  FAMILY_CATEGORIES,
  NEARBY_CATEGORIES,
  buildResultsView,
  placeGroupView,
  type ResultsInput,
  type SectionBlock,
} from "../lib/results";
import type { ShortFloodLayer, ShortSections } from "../lib/short-bundle";
import type { SoldPricesBundle } from "../lib/sold-prices";

// OBS-012 (the recurrence deep dive, remedy adopted
// 22 Nov 2026): the contract the per-instance fixes
// never had. ONE test enumerates EVERY results category
// at an urban density (countWithin = 400 — the density
// the village-scale fixtures never reach) and asserts:
//
//   1. at the seam (placeGroupView → truncationFor), the
//      count a strip may speak is capped at report
//      depth: n = min(countWithin, reportListSizeFor) −
//      shown, and the capped total agrees;
//   2. in the composed view, no numeral on any surviving
//      strip exceeds report depth, and no section
//      double-speaks — where a section declares its own
//      strip (an upsell block), no group above it keeps
//      a strip of its own;
//   3. the What's Nearby tab carries exactly the
//      sample's five strips and no group count strip at
//      all (WN-13, through the structural mechanism);
//   4. reportListSizeFor agrees with the serving depths
//      the report itself slices at (the nearby
//      constants), so the table and the serving cannot
//      drift apart silently again.

const COUNT_WITHIN = 400;

function places(count: number, prefix: string) {
  return Array.from({ length: count }, (_, i) => ({
    latitude: 51.7,
    longitude: 0.6,
    name: `${prefix} ${i + 1}`,
    miles: 0.3 + i * 0.2,
    detail: null,
  }));
}

function category(partial: Partial<CategoryAnswer> & { category: NearbyCategory }): CategoryAnswer {
  return {
    label: "places",
    basisLabel: "straight-line distance from the postcode point",
    state: "within",
    places: [],
    countWithin: 0,
    beyondNearest: null,
    line: null,
    ...partial,
  } as CategoryAnswer;
}

const ALL_KEYS = [
  ...Object.keys(FAMILY_CATEGORIES),
  ...Object.keys(NEARBY_CATEGORIES),
] as NearbyCategory[];

describe("OBS-012 contract — the seam cap, every category", () => {
  for (const key of ALL_KEYS) {
    it(`${key}: countWithin ${COUNT_WITHIN} caps at report depth`, () => {
      const presentation = (FAMILY_CATEGORIES[key] ?? NEARBY_CATEGORIES[key])!;
      const answer = category({
        category: key,
        state: "within",
        places: places(6, `${key} place`),
        countWithin: COUNT_WITHIN,
      });
      const group = placeGroupView(answer, presentation, true);
      const depth = reportListSizeFor(key);
      const shown = group.rows.length;
      if (depth - shown <= 0) {
        expect(group.truncation).toBeNull();
      } else {
        expect(group.truncation).not.toBeNull();
        expect(group.truncation!.n).toBe(Math.min(COUNT_WITHIN, depth) - shown);
        expect(group.truncation!.total).toBe(Math.min(COUNT_WITHIN, depth));
        expect(group.truncation!.n).toBeLessThanOrEqual(depth - shown);
      }
    });
  }

  it("reportListSizeFor agrees with the serving constants", () => {
    expect(reportListSizeFor("schools-primary")).toBe(REPORT_SCHOOL_LIST_SIZE);
    expect(reportListSizeFor("schools-secondary")).toBe(REPORT_SCHOOL_LIST_SIZE);
    expect(reportListSizeFor("ev-chargers")).toBe(EV_LIST_SIZE);
    expect(reportListSizeFor("vets")).toBe(PET_LIST_SIZE);
    expect(reportListSizeFor("pet-shops")).toBe(PET_LIST_SIZE);
    expect(reportListSizeFor("pet-boarding")).toBe(PET_LIST_SIZE);
    for (const key of ALL_KEYS) {
      if (
        [
          "schools-primary",
          "schools-secondary",
          "ev-chargers",
          "vets",
          "pet-shops",
          "pet-boarding",
        ].includes(key)
      )
        continue;
      expect(reportListSizeFor(key), key).toBe(LIST_SIZE);
    }
  });
});

// --- The composed view at urban density ----------------

const directory = {
  postcode: "CM3 2JT",
  latitude: 51.7,
  longitude: 0.6,
  council: null,
  ward: null,
  region: null,
  lsoaCode: "E01021395",
  msoaCode: null,
};

const resolution: AddressResolution = {
  rung: 1,
  kind: "home",
  address: {
    postcode: "CM3 2JT",
    paon: "19",
    saon: null,
    street: "BIRKDALE RISE",
    locality: null,
    town: "CHELMSFORD",
    label: "19 Birkdale Rise",
  },
  directory,
};

function floodLayer(
  layer: ShortFloodLayer["layer"],
  pointState: ShortFloodLayer["pointState"],
  line: string,
): ShortFloodLayer {
  return {
    layer,
    title: layer,
    pointState,
    line,
    coveringLabel: null,
    coveringDefinition: null,
    coveringDetail: null,
    basisLine: "basis",
    sourceLine: "Environment Agency data",
  };
}

function shortSections(): ShortSections {
  const polygon = (line: string) => ({
    layer: "conservation_area" as never,
    label: "layer",
    state: "outside" as never,
    line,
    insideName: null,
    nearest: null,
    beyondLine: null,
    sourceLine: null,
  });
  return {
    soldPrices: {
      state: "served",
      stateLine: null,
      ownLastSale: { price: 588995, date: "2023-06-15" },
      ownLine: "19 Birkdale Rise last sold for £588,995 on 15 June 2023",
      median: {
        state: "served",
        value: 588995,
        counted: 29,
        spanFrom: "1995",
        spanTo: "2026",
        line: "the middle of 29 category-A sales in CM3 2JT since 1995 is £588,995",
      },
      buildingMedian: null,
      sourceLine: "HM Land Registry Price Paid Data",
      explainer: "explainer",
    },
    flood: {
      state: "served",
      liveWarnings: null,
      layers: [
        floodLayer("flood_zone", "zone-1", "this postcode point is in Flood Zone 1"),
        floodLayer("rofrs", "no-band-published", "no river or sea flood band is published"),
        floodLayer("rofsw", "no-band-published", "no surface-water flood band is published"),
      ],
    },
    crime: {
      state: "served",
      total: 330,
      totalLine:
        "330 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
      windowLine: "the 12 months from October 2025 to September 2026",
      asb: { count: 90 },
      perHeadLine: "about 45 recorded crimes per 1,000 residents in this postcode's area",
      englandLine: "England's figure for the same months is 94.5 per 1,000",
      staleLine: null,
      sourceLine: "Police.uk crime data",
      explainer: "explainer",
    },
    epc: {
      state: "served",
      headlineBand: "C",
      headlineAssessmentLabel: "the newest certificate for this home is assessed band C",
      line: "energy certificates for CM3 2JT",
    },
    councilTax: {
      state: "served",
      authority: "Braintree",
      taxYear: "2026/27",
      bandDAverageLabel: "£2,280.36",
      line: "Band D averages £2,280.36 a year in Braintree",
    },
    constraints: {
      state: "served",
      conservationArea: polygon("this postcode point is not in a conservation area"),
      article4: polygon("no Article 4 direction is filed for this postcode point"),
      greenBelt: polygon("this postcode point is not in the green belt"),
      builtUpArea: polygon("this postcode point is inside a built-up area"),
      brownfield: {
        state: "none-found",
        line: "No brownfield site is filed within 2 miles",
        countWithin: 0,
        nearest: null,
        beyondLine: null,
        sourceLine: null,
      },
    },
    heritage: {
      state: "served",
      listed: {
        state: "served",
        line: "3 listed buildings within 2 miles",
        countWithin: 3,
        nearest: null,
        beyondLine: null,
      },
      atPoint: { state: "none" },
      sourceLine: "Historic England",
    },
    nature: {
      state: "served",
      coverageLine: null,
      placesLine: "1 designated nature site within 2 miles",
      designationsLine: null,
      placesWithinCount: 1,
      nearestPlace: null,
      beyondLine: null,
      ancientWoodland: polygon("no ancient woodland is filed at this postcode point"),
      priorityHabitat: { state: "not-filed", line: "priority habitat data is not filed yet" },
      sourceLine: "Natural England",
    },
    air: {
      state: "served",
      headlineFigure: {
        pollutant: "NO2",
        value: 8.2,
        line: "modelled nitrogen dioxide (NO₂) of 8.2 micrograms per cubic metre",
      },
      line: "modelled air quality for this postcode's area",
    },
    noise: { state: "not-filed", headlineBand: null, line: "noise is not filed" },
    broadband: {
      state: "served",
      gigabitCapablePct: 98,
      line: "98% of homes in this postcode can get gigabit broadband",
    },
    nearby: { basisLabel: "basis", categories: [] },
    planningApplications: {
      state: "handed-off",
      council: "Braintree",
      line: "planning applications for this area are held on the council's register",
      link: {
        label: "Search the register of planning decisions (GOV.UK)",
        url: "https://www.gov.uk/search-register-planning-decisions",
      },
    },
  } as unknown as ShortSections;
}

function denseInput(): ResultsInput {
  const categories = ALL_KEYS.map((key) =>
    category({
      category: key,
      state: "within",
      places: places(6, `${key} place`),
      countWithin: COUNT_WITHIN,
    }),
  );
  return {
    resolution,
    nearby: {
      rung: 1,
      kind: "distances",
      postcode: "CM3 2JT",
      basisLabel: "straight-line distance from the postcode point",
      categories,
      schoolDeadlines: {
        state: "england",
        line: "Apply by 31 October for secondary places and 15 January for primary places (England).",
      },
    } as ResultsInput["nearby"],
    flood: {
      rung: 1,
      kind: "flood",
      postcode: "CM3 2JT",
      flood: {
        state: "served",
        liveWarnings: null,
        layers: [],
        defences: {},
        climate: {},
        howWeCheck: "",
      },
    } as unknown as FloodBundle,
    crime: {
      rung: 1,
      kind: "crime",
      postcode: "CM3 2JT",
      crime: {
        state: "served",
        total: 330,
        totalLine: "330 recorded crimes within 1 mile",
        windowFrom: "2025-10",
        windowTo: "2026-09",
        windowLine: "the 12 months from October 2025 to September 2026",
        categories: [{ slug: "burglary", count: 12 }],
        months: [],
        basis: "basis",
        sourceName: "Police.uk",
        sourceLine: "Police.uk crime data",
        explainer: "explainer",
        perHead: { per1000: 44.9, line: "about 45 per 1,000", basisLine: "basis" },
        englandFigure: { englandPer1000: 94.5, multiple: 0.5, line: "England comparison line" },
        calibrationExplainer: "calibration",
        staleLine: null,
      },
    } as unknown as CrimeBundle,
    sold: { rung: 1, kind: "sold-prices" } as unknown as SoldPricesBundle,
    area: {
      rung: 1,
      kind: "area-bundle",
      postcode: "CM3 2JT",
      sections: {
        air: { sourceLine: "Defra air quality data" },
        noise: {
          state: "not-filed",
          line: "modelled noise bands are not filed yet",
          bands: [],
          headlineBand: null,
          sourceLine: null,
        },
        councilTax: {
          state: "served",
          authority: "Braintree",
          taxYear: "2026/27",
          bandDAveragePence: 228036,
          bandDAverageLabel: "£2,280.36",
          bandDMonthlyPence: 19003,
          bandDMonthlyLabel: "£190.03",
          monthlyLine: "£190.03 a month",
          sourceLine: "Council tax data",
        },
        epc: { sourceLine: "EPC register" },
        planningApplications: {
          state: "handed-off",
          council: "Braintree",
          line: "planning applications for this area are held on the council's register",
          link: {
            label: "Search the register of planning decisions (GOV.UK)",
            url: "https://www.gov.uk/search-register-planning-decisions",
          },
          sourceLine: null,
        },
      },
    } as unknown as AreaBundle,
    short: {
      rung: 1,
      kind: "short-bundle",
      postcode: "CM3 2JT",
      sections: shortSections(),
    } as unknown as ResultsInput["short"],
    homeKey: "19||BIRKDALE RISE",
  };
}

describe("OBS-012 contract — the composed view at urban density", () => {
  const view = buildResultsView(denseInput());

  it("no surviving strip numeral exceeds report depth, on any tab", () => {
    for (const tab of view.tabs) {
      for (const section of tab.sections) {
        for (const block of section.blocks) {
          if (block.type !== "places" || !block.group.truncation) continue;
          const depth = reportListSizeFor(block.group.key as NearbyCategory);
          expect(block.group.truncation.n, `${tab.id}/${block.group.key}`).toBeLessThanOrEqual(
            depth - block.group.rows.length,
          );
          expect(block.group.truncation.total, `${tab.id}/${block.group.key}`).toBeLessThanOrEqual(
            depth,
          );
          const leadNumeral = /^Plus (\d+) more/.exec(block.group.truncation.lead);
          if (leadNumeral) expect(Number(leadNumeral[1])).toBe(block.group.truncation.n);
        }
      }
    }
  });

  it("no section double-speaks: a declared strip clears the groups above it", () => {
    for (const tab of view.tabs) {
      for (const section of tab.sections) {
        const firstUpsell = section.blocks.findIndex((b: SectionBlock) => b.type === "upsell");
        if (firstUpsell === -1) continue;
        section.blocks.forEach((block: SectionBlock, index: number) => {
          if (index < firstUpsell && block.type === "places") {
            expect(
              block.group.truncation,
              `${tab.id}/${section.key}/${block.group.key}`,
            ).toBeNull();
          }
        });
      }
    }
  });

  it("the What's Nearby tab carries exactly the sample's five strips and no group strip", () => {
    const nearby = view.tabs.find((t) => t.id === "nearby")!;
    let upsells = 0;
    for (const section of nearby.sections) {
      for (const block of section.blocks) {
        if (block.type === "upsell") upsells += 1;
        if (block.type === "places") expect(block.group.truncation).toBeNull();
      }
    }
    expect(upsells).toBe(5);
  });

  it("the schools strips speak the capped totals (All 5 at any density)", () => {
    const family = view.tabs.find((t) => t.id === "family")!;
    for (const key of ["schools-primary", "schools-secondary"]) {
      const section = family.sections.find((s) => s.key === key)!;
      const places = section.blocks.find((b: SectionBlock) => b.type === "places")!;
      expect(places.type === "places" && places.group.truncation?.detail).toMatch(/^All 5,/);
      expect(places.type === "places" && places.group.truncation?.n).toBe(3);
    }
  });
});
