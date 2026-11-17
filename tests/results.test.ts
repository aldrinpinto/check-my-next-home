import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ResultsPage from "../components/ResultsPage";
import type { AddressResolution } from "../lib/address";
import type { AreaBundle } from "../lib/area-bundle";
import type { CrimeBundle } from "../lib/crime";
import type { FloodBundle, FloodLayerType, FloodLiveWarnings, FloodPointState } from "../lib/flood";
import type { CategoryAnswer, NearbyBundle, NearbyCategory } from "../lib/nearby";
import {
  CATCHMENT_BLOCK_LINE,
  REPORT_ROUTE,
  RESULTS_TABS,
  buildResultsView,
  buildWiderAreaView,
  distanceBand,
  floodWarningsBlock,
  formatMiles,
  pillText,
  placeGroupView,
  resultsScopeLabel,
  summaryPills,
  truncationFor,
  warningsStrip,
  type ResultsInput,
} from "../lib/results";
import type { ShortBundle, ShortFloodLayer, ShortSections } from "../lib/short-bundle";
import { DISCLAIMER_CLOSING_BLOCK, DISCLAIMER_SHORT_FORM } from "../lib/site";
import type { SoldPricesBundle } from "../lib/sold-prices";

// M7.4 — the free results page's derivations: pill logic E2
// (slots, ranking, thresholds, fallbacks), the section-to-tab
// placement, display counts and truncation lines, the
// warnings forms (full in the flood section, slim under the
// strip), the D39 calibration pair, the noise states, the
// B7 exclusion (no computed sale tiles) and the D66 depth
// exclusions. The bundles are fabricated at the frozen
// shapes with the core-3 golden facts (Birkdale) as the
// base case; report-depth material is planted with marker
// strings and proven absent from the view.

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

const birkdale: AddressResolution = {
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
  };
}

const ALL_CATEGORIES: NearbyCategory[] = [
  "schools-primary",
  "schools-secondary",
  "sixth-forms",
  "nurseries",
  "gp",
  "dentist",
  "pharmacy",
  "ae",
  "maternity",
  "station",
  "bus-stop",
  "ev-chargers",
  "supermarket",
  "food-and-drink",
  "leisure",
  "places-to-visit",
  "places-of-worship",
  "libraries",
  "vets",
  "pet-shops",
  "pet-boarding",
  "parks",
];

function nearbyWith(overrides: Record<string, Partial<CategoryAnswer>> = {}): NearbyBundle {
  const categories = ALL_CATEGORIES.map((key) =>
    category({
      category: key,
      state: "empty",
      line: `no ${key} filed near`,
      ...(overrides[key] ?? {}),
    }),
  );
  return {
    rung: 1,
    kind: "distances",
    postcode: "CM3 2JT",
    basisLabel: "straight-line distance from the postcode point",
    categories,
    schoolDeadlines: {
      state: "england",
      line: "Apply by 31 October for secondary places and 15 January for primary places (England).",
    },
  };
}

const primaryNear = category({
  category: "schools-primary",
  state: "within",
  places: [
    { name: "Birkdale Primary School", miles: 0.442, detail: null },
    { name: "Hatfield Peverel Infant School", miles: 0.913, detail: null },
    { name: "St Andrew's Junior School", miles: 1.204, detail: null },
  ],
  countWithin: 5,
});

const baseNearby = nearbyWith({
  "schools-primary": primaryNear,
  "schools-secondary": category({
    category: "schools-secondary",
    state: "within",
    places: [
      { name: "Maltings Academy", miles: 1.87, detail: null, sixthForm: true, urn: "135653" },
    ],
    countWithin: 1,
    nearestSelective: null,
    nearestSelectiveLine: null,
  }),
  gp: category({
    category: "gp",
    state: "within",
    places: [
      {
        name: "Fern House Surgery",
        miles: 0.62,
        detail: null,
        cqcRating: { rating: "Good", date: "2024-12-19" },
      },
    ],
    countWithin: 2,
  }),
  parks: category({
    category: "parks",
    state: "within",
    places: [{ name: "Birkdale Rise Green", miles: 0.32, detail: null }],
    countWithin: 1,
  }),
  ae: category({
    category: "ae",
    state: "none-within",
    places: [],
    countWithin: 0,
    beyondNearest: { name: "Broomfield Hospital", miles: 4.213 },
    line: "none within 2 miles — nearest is Broomfield Hospital, 4.213 miles away (straight-line distance from the postcode point)",
  }),
  maternity: category({
    category: "maternity",
    state: "none-within",
    places: [],
    countWithin: 0,
    beyondNearest: { name: "Broomfield Hospital", miles: 5.89 },
    line: "none within 2 miles — nearest is Broomfield Hospital, 5.89 miles away (straight-line distance from the postcode point)",
  }),
});

function floodLayer(
  layer: FloodLayerType,
  pointState: FloodPointState,
  coveringLabel: string | null,
  line: string,
): ShortFloodLayer {
  return {
    layer,
    title: layer,
    pointState,
    line,
    coveringLabel,
    coveringDefinition: null,
    coveringDetail: null,
    basisLine: "basis",
    sourceLine: "Environment Agency data",
  };
}

function shortSections(overrides: Partial<ShortSections> = {}): ShortSections {
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
        floodLayer("flood_zone", "zone-1", null, "this postcode point is in Flood Zone 1"),
        floodLayer(
          "rofrs",
          "no-band-published",
          null,
          "no river or sea flood band is published for this postcode point",
        ),
        floodLayer(
          "rofsw",
          "no-band-published",
          null,
          "no surface-water flood band is published for this postcode point",
        ),
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
      englandLine:
        "England's figure for the same months is 94.5 per 1,000 — about 0.5× this area's rate",
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
      line: "Band D averages £2,280.36 a year in Braintree (the council's scale — not this home's bill)",
    },
    constraints: {
      state: "served",
      conservationArea: polygon("this postcode point is not in a conservation area"),
      article4: polygon("no Article 4 direction is filed for this postcode point"),
      greenBelt: polygon("this postcode point is not in the green belt"),
      builtUpArea: polygon("this postcode point is inside a built-up area"),
      brownfield: {
        state: "none-found",
        line: "no brownfield site is filed within 2 miles",
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
    ...overrides,
  };
}

const noWarnings: FloodLiveWarnings = {
  state: "none",
  checkedAt: "09:00 on 17 November 2026",
  line: "No flood warning in force for this area — checked at 09:00 on 17 November 2026",
  warnings: [],
  overflowCount: null,
  overflowLine: null,
  attributionLine: "Flood warnings from the Environment Agency",
  link: { label: "Check for flooding", url: "https://www.gov.uk/check-flooding" },
};

const activeWarnings: FloodLiveWarnings = {
  ...noWarnings,
  state: "warnings",
  line: null,
  warnings: [
    {
      severityLevel: 2,
      severity: "Flood warning",
      areaDescription: "River Leadon catchment",
      riverOrSea: "River Leadon",
      message: "EA-MESSAGE-FULL-TEXT",
      timeRaised: "2026-11-15T16:35:00",
      raisedLine: "raised at 16:35 on 15 November 2026",
      line: "Flood warning — River Leadon catchment",
    },
  ],
};

function floodBundle(liveWarnings: FloodLiveWarnings | null): FloodBundle {
  return {
    rung: 1,
    kind: "flood",
    postcode: "CM3 2JT",
    flood: {
      state: "served",
      liveWarnings,
      layers: [],
      // Report-depth blocks, planted with markers: the
      // page must never render them (D66).
      defences: { marker: "DEFENCES-MARKER" },
      climate: { marker: "CLIMATE-MARKER" },
      howWeCheck: "how we check",
    },
  } as unknown as FloodBundle;
}

function crimeBundle(multiple: number | null, staleLine: string | null = null): CrimeBundle {
  return {
    rung: 1,
    kind: "crime",
    postcode: "CM3 2JT",
    crime: {
      state: "served",
      total: 330,
      totalLine:
        "330 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
      windowFrom: "2025-10",
      windowTo: "2026-09",
      windowLine: "the 12 months from October 2025 to September 2026",
      categories: [{ slug: "burglary", count: 12 }],
      months: [],
      basis: "basis",
      sourceName: "Police.uk",
      sourceLine: "Police.uk crime data",
      explainer: "explainer",
      perHead: {
        per1000: 44.9,
        line: "about 45 recorded crimes per 1,000 residents in this postcode's area",
        basisLine:
          "BASIS-LINE: each rate divides the 12-month count by the area's usual residents (Census 2021)",
      },
      englandFigure:
        multiple === null
          ? null
          : { englandPer1000: 94.5, multiple, line: "England comparison line" },
      calibrationExplainer: "calibration",
      staleLine,
    },
  } as unknown as CrimeBundle;
}

function areaBundle(noiseState: "served" | "not-filed" | "not-covered" = "not-filed"): AreaBundle {
  return {
    rung: 1,
    kind: "area-bundle",
    postcode: "CM3 2JT",
    sections: {
      air: { sourceLine: "Defra air quality data" },
      noise:
        noiseState === "served"
          ? {
              state: "served",
              line: null,
              bands: [
                {
                  sourceKind: "road",
                  label: "Road noise",
                  dayBand: "Below 55 dB",
                  nightBand: "Below 50 dB",
                  line: "road noise: Below 55 dB by day, Below 50 dB by night",
                },
              ],
              headlineBand: { sourceKind: "road", dayBand: "Below 55 dB" },
              sourceLine: "Defra noise mapping",
            }
          : {
              state: noiseState,
              line:
                noiseState === "not-filed"
                  ? "modelled noise bands are not filed yet, so no noise answer can be given yet"
                  : "the modelled noise mapping filed covers England only — Wales is not covered",
              bands: [],
              headlineBand: null,
              sourceLine: null,
            },
      councilTax: {
        monthlyLine: "£190.03 a month if the Band D average is spread evenly over 12 months",
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
  } as unknown as AreaBundle;
}

function input(overrides: Partial<ResultsInput> = {}): ResultsInput {
  const sections = shortSections();
  return {
    resolution: birkdale,
    nearby: baseNearby,
    flood: floodBundle(noWarnings),
    crime: crimeBundle(0.5),
    sold: { rung: 1, kind: "sold-prices" } as unknown as SoldPricesBundle,
    area: areaBundle(),
    short: { rung: 1, kind: "short-bundle", postcode: "CM3 2JT", sections },
    ...overrides,
  };
}

function section(view: ReturnType<typeof buildResultsView>, tabId: string, key: string) {
  const tab = view.tabs.find((t) => t.id === tabId);
  const found = tab?.sections.find((s) => s.key === key);
  if (!found) throw new Error(`section ${tabId}/${key} missing`);
  return found;
}

function allText(view: unknown): string {
  return JSON.stringify(view);
}

describe("results — formatters and distance bands", () => {
  it("formatMiles trims to two decimals", () => {
    expect(formatMiles(0.442)).toBe("0.44");
    expect(formatMiles(5.89)).toBe("5.89");
    expect(formatMiles(0.1)).toBe("0.1");
    expect(formatMiles(4.213)).toBe("4.21");
  });

  it("distanceBand applies the design's per-family thresholds", () => {
    expect(distanceBand("school", 1)).toBe("green");
    expect(distanceBand("school", 1.5)).toBe("orange");
    expect(distanceBand("school", 2.5)).toBe("red");
    expect(distanceBand("everyday", 0.5)).toBe("green");
    expect(distanceBand("everyday", 1.5)).toBe("orange");
    expect(distanceBand("everyday", 1.6)).toBe("red");
    expect(distanceBand("hospital", 5)).toBe("green");
    expect(distanceBand("hospital", 10)).toBe("orange");
    expect(distanceBand("hospital", 10.1)).toBe("red");
  });

  it("truncationFor: N = served count minus shown; no line at zero; rung 3 unlinked", () => {
    expect(truncationFor(5, 2, "primary schools", true)).toEqual({
      n: 3,
      text: "Plus 3 more primary schools in the detailed report — £4.99",
      href: REPORT_ROUTE,
    });
    expect(truncationFor(2, 2, "primary schools", true)).toBeNull();
    expect(truncationFor(5, 2, "primary schools", false)?.href).toBeNull();
    expect(REPORT_ROUTE).toBe("/report");
  });

  it("resultsScopeLabel: rung 2 is the gap check's pinned form", () => {
    expect(resultsScopeLabel(birkdale)).toBe("19 Birkdale Rise, CM3 2JT");
    expect(
      resultsScopeLabel({
        rung: 2,
        kind: "address-list",
        directory,
        street: null,
        building: null,
        addresses: [],
      }),
    ).toBe("Postcode area — CM3 2JT, not one exact home");
    expect(
      resultsScopeLabel({
        rung: 3,
        kind: "wider-area",
        outward: "E16",
        label: "Wider area — E16, not this exact home",
        postcodeCount: 10,
      }),
    ).toBe("Wider area — E16, not this exact home");
  });
});

describe("results — place groups", () => {
  it("shows the display count, colours the miles figure by family, and truncates on the served count", () => {
    const group = placeGroupView(
      primaryNear,
      { heading: "Primary schools", groupLabel: "primary schools", display: 2, family: "school" },
      true,
    );
    expect(group.rows.map((r) => r.name)).toEqual([
      "Birkdale Primary School",
      "Hatfield Peverel Infant School",
    ]);
    expect(group.rows[0].milesText).toBe("0.44 mi");
    expect(group.rows[0].band).toBe("green");
    expect(group.rows[1].band).toBe("green");
    expect(group.truncation?.text).toBe(
      "Plus 3 more primary schools in the detailed report — £4.99",
    );
  });

  it("health rows carry the CQC rating with its publication date, never an inspection date", () => {
    const gp = (baseNearby as Extract<NearbyBundle, { kind: "distances" }>).categories.find(
      (c) => c.category === "gp",
    );
    if (!gp) throw new Error("gp missing");
    const group = placeGroupView(
      gp,
      { heading: "GP surgeries", groupLabel: "GP surgeries", display: 1, family: "everyday" },
      true,
    );
    expect(group.rows[0].ratingLine).toBe("CQC overall rating: Good (published 19 December 2024)");
    expect(group.rows[0].ratingLine).not.toContain("inspect");
    expect(group.truncation?.n).toBe(1);
  });

  it("secondary rows carry the filed sixth-form flag and the selective line", () => {
    const secondary = category({
      category: "schools-secondary",
      state: "within",
      places: [
        { name: "Maltings Academy", miles: 1.87, detail: null, sixthForm: true, urn: "135653" },
        { name: "Other School", miles: 1.95, detail: null, sixthForm: null, urn: "1" },
      ],
      countWithin: 2,
      nearestSelective: { name: "Grammar School", miles: 1.2 },
      nearestSelectiveLine:
        "the nearest selective secondary school is Grammar School — selective means admission by entrance test",
    });
    const group = placeGroupView(
      secondary,
      {
        heading: "Secondary schools",
        groupLabel: "secondary schools",
        display: 2,
        family: "school",
      },
      true,
    );
    expect(group.rows[0].sixthFormLine).toBe("sixth form: yes, as filed");
    expect(group.rows[1].sixthFormLine).toBe("sixth form: not recorded");
    expect(group.selectiveLine).toContain("Grammar School");
    // Destinations are report depth: the row model carries
    // no destinations field at all.
    expect(JSON.stringify(group)).not.toContain("destinations");
  });

  it("none-within essential groups render the ruled line plus the beyond row", () => {
    const ae = (baseNearby as Extract<NearbyBundle, { kind: "distances" }>).categories.find(
      (c) => c.category === "ae",
    );
    if (!ae) throw new Error("ae missing");
    const group = placeGroupView(
      ae,
      { heading: "A&E hospitals", groupLabel: "A&E hospitals", display: 1, family: "hospital" },
      true,
    );
    expect(group.line).toContain("none within 2 miles");
    expect(group.rows).toHaveLength(1);
    expect(group.rows[0].name).toBe("Broomfield Hospital");
    expect(group.rows[0].band).toBe("green");
    expect(group.truncation).toBeNull();
  });
});

describe("results — pill logic E2", () => {
  it("Birkdale base case: no threshold crossed — the fixed fallbacks fill slots 2–3", () => {
    const pills = summaryPills({
      nearby: baseNearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(0.5),
      sections: shortSections(),
    });
    // D70 R5: the pills are label+figure now; recomposed via
    // pillText they are byte-identical to the strings the
    // logic has always served (the split is pinned below).
    expect(pills?.map(pillText)).toEqual([
      "Nearest primary 0.44 mi",
      "Flood: 2 separate checks",
      "Crime: 12-month counts",
      "Park 0.32 mi",
    ]);
    expect(pills?.[0]).toEqual({ label: "Nearest primary", figure: "0.44 mi", band: "green" });
    expect(pills?.[1]).toEqual({ label: "Flood: 2 separate checks", figure: null, band: null });
    expect(pills?.[3]).toEqual({ label: "Park", figure: "0.32 mi", band: "green" });
  });

  it("a grammar within 2 miles takes slot 1", () => {
    const nearby = nearbyWith({
      "schools-primary": primaryNear,
      "schools-secondary": category({
        category: "schools-secondary",
        state: "within",
        places: [{ name: "Grammar School", miles: 1.2, detail: null, selective: true }],
        countWithin: 1,
        nearestSelective: { name: "Grammar School", miles: 1.2 },
        nearestSelectiveLine: "the nearest selective secondary school is Grammar School",
      }),
      parks: category({
        category: "parks",
        state: "within",
        places: [{ name: "Birkdale Rise Green", miles: 0.32, detail: null }],
        countWithin: 1,
      }),
    });
    const pills = summaryPills({
      nearby: nearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(0.5),
      sections: shortSections(),
    });
    expect(pills && pillText(pills[0])).toBe("Grammar school 1.2 mi ★");
    expect(pills?.[0]).toEqual({
      label: "Grammar school",
      figure: "1.2 mi",
      band: "orange",
      mark: "★",
    });
  });

  it("a higher flood band fires the flood pill, naming the check", () => {
    const sections = shortSections({
      flood: {
        state: "served",
        liveWarnings: null,
        layers: [
          floodLayer("flood_zone", "zone-1", null, "zone 1"),
          floodLayer("rofrs", "no-band-published", null, "no band"),
          floodLayer(
            "rofsw",
            "inside",
            "Medium",
            "a Medium surface-water band covers this postcode point",
          ),
        ],
      },
    });
    const pills = summaryPills({
      nearby: baseNearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(0.5),
      sections,
    });
    expect(pills && pillText(pills[1])).toBe("Surface-water flood band: higher for this street");
    expect(pills && pillText(pills[2])).toBe("Crime: 12-month counts");
  });

  it("crime at 1.5× fires the count pill; at 1.3× it does not", () => {
    const at = summaryPills({
      nearby: baseNearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(1.5),
      sections: shortSections(),
    });
    expect(at && pillText(at[1])).toBe("Crime: 330 recorded in 12 months");
    const below = summaryPills({
      nearby: baseNearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(1.3),
      sections: shortSections(),
    });
    expect(below && pillText(below[1])).toBe("Flood: 2 separate checks");
  });

  it("an A&E beyond 10 miles fires the distance pill", () => {
    const nearby = nearbyWith({
      "schools-primary": primaryNear,
      ae: category({
        category: "ae",
        state: "none-within",
        places: [],
        countWithin: 0,
        beyondNearest: { name: "Far Hospital", miles: 10.4 },
        line: "none within 2 miles",
      }),
      parks: category({
        category: "parks",
        state: "within",
        places: [{ name: "Birkdale Rise Green", miles: 0.32, detail: null }],
        countWithin: 1,
      }),
    });
    const pills = summaryPills({
      nearby: nearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(0.5),
      sections: shortSections(),
    });
    expect(pills?.map(pillText)).toContain("Nearest A&E 10.4 mi");
    expect(pills?.find((pill) => pill.label === "Nearest A&E")).toEqual({
      label: "Nearest A&E",
      figure: "10.4 mi",
      band: "red",
    });
  });

  it("the council tax fallback fires when another subject cannot serve a pill", () => {
    const sections = shortSections({
      crime: { state: "not-covered", reason: "crime is not covered in Scotland" },
    });
    const pills = summaryPills({
      nearby: baseNearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: {
        rung: 1,
        kind: "not-covered",
        postcode: "CM3 2JT",
        crime: { state: "not-covered", reason: "x" },
      } as unknown as CrimeBundle,
      sections,
    });
    expect(pills?.slice(1, 3).map(pillText)).toEqual([
      "Flood: 2 separate checks",
      "Council tax: Band D averages £2,280.36 a year",
    ]);
  });
});

describe("results — warnings forms", () => {
  it("the strip is the short form when active, the failure line when unavailable, nothing when none", () => {
    expect(warningsStrip(floodBundle(activeWarnings))).toEqual({
      kind: "warnings",
      items: [{ severity: "Flood warning", areaDescription: "River Leadon catchment" }],
      link: { label: "Check for flooding", url: "https://www.gov.uk/check-flooding" },
    });
    const unavailable: FloodLiveWarnings = {
      ...noWarnings,
      state: "unavailable",
      line: "Live flood warnings could not be checked just now",
    };
    expect(warningsStrip(floodBundle(unavailable))).toEqual({
      kind: "unavailable",
      line: "Live flood warnings could not be checked just now",
    });
    expect(warningsStrip(floodBundle(noWarnings))).toEqual({ kind: "none" });
  });

  it("the flood section's block is the FULL form — the EA message travels here, never to the strip", () => {
    const block = floodWarningsBlock(activeWarnings);
    expect(block.type).toBe("flood-warnings");
    if (block.type !== "flood-warnings") throw new Error("unreachable");
    expect(block.warnings[0].message).toBe("EA-MESSAGE-FULL-TEXT");
    expect(block.warnings[0].raisedLine).toBe("raised at 16:35 on 15 November 2026");
    expect(block.attributionLine).toContain("Environment Agency");
    expect(JSON.stringify(warningsStrip(floodBundle(activeWarnings)))).not.toContain(
      "EA-MESSAGE-FULL-TEXT",
    );
    const none = floodWarningsBlock(noWarnings);
    expect(none).toEqual({
      type: "notice",
      variant: "warning",
      text: "No flood warning in force for this area — checked at 09:00 on 17 November 2026",
    });
  });
});

describe("results — the built view", () => {
  it("places every section in its Section 6 tab, in order", () => {
    const view = buildResultsView(input());
    expect(view.tabs.map((t) => t.label)).toEqual([
      "Family Checks",
      "What's Nearby",
      "Home, Costs & Risks",
    ]);
    for (const [index, tab] of view.tabs.entries()) {
      const keys = tab.sections.map((s) => s.key);
      const expected = RESULTS_TABS[index].sections.filter((key) => keys.includes(key));
      expect(keys).toEqual(expected);
    }
    // The catchment block is present (England deadlines
    // serve) between sixth forms and nurseries.
    const familyKeys = view.tabs[0].sections.map((s) => s.key);
    expect(familyKeys).toEqual([
      "schools-primary",
      "schools-secondary",
      "sixth-forms",
      "catchment",
      "nurseries",
      "gp",
      "dentist",
      "pharmacy",
      "ae",
      "maternity",
      "air",
      "noise",
      "crime",
    ]);
    expect(view.tabs[1].sections).toHaveLength(13);
    expect(view.tabs[2].sections.map((s) => s.key)).toEqual([
      "sold-prices",
      "council-tax",
      "epc",
      "flood",
      "planning",
      "constraints",
      "heritage",
      "nature",
      "broadband",
    ]);
  });

  it("the flood section renders the warnings block FIRST, in full form", () => {
    const view = buildResultsView(input({ flood: floodBundle(activeWarnings) }));
    const flood = section(view, "home", "flood");
    expect(flood.blocks[0].type).toBe("flood-warnings");
    expect(view.floodWarningsState).toBe("warnings");
    expect(view.warningsStrip.kind).toBe("warnings");
  });

  it("the D39 calibration pair renders together with their basis line, under the stale line when stale", () => {
    const stale = "these counts are older than usual — the filed window has not been refreshed";
    const sections = shortSections();
    if (sections.crime.state === "served") sections.crime.staleLine = stale;
    const view = buildResultsView(
      input({
        crime: crimeBundle(0.5, stale),
        short: { rung: 1, kind: "short-bundle", postcode: "CM3 2JT", sections },
      }),
    );
    const crime = section(view, "family", "crime");
    const texts = crime.blocks.map((b) => (b.type === "line" || b.type === "notice" ? b.text : ""));
    expect(crime.blocks[0]).toEqual({ type: "notice", variant: "stale", text: stale });
    const perHeadAt = texts.findIndex((t) => t.includes("per 1,000 residents"));
    const englandAt = texts.findIndex((t) => t.includes("England's figure"));
    const basisAt = texts.findIndex((t) => t.startsWith("BASIS-LINE"));
    expect(perHeadAt).toBeGreaterThan(0);
    expect(englandAt).toBe(perHeadAt + 1);
    expect(basisAt).toBe(englandAt + 1);
  });

  it("noise renders its named not-filed line by default, and the verbatim day/night bands when served", () => {
    const notFiled = buildResultsView(input());
    const noiseSection = section(notFiled, "family", "noise");
    expect(JSON.stringify(noiseSection.blocks)).toContain(
      "modelled noise bands are not filed yet, so no noise answer can be given yet",
    );
    const served = buildResultsView(input({ area: areaBundle("served") }));
    const servedNoise = section(served, "family", "noise");
    expect(JSON.stringify(servedNoise.blocks)).toContain(
      "road noise: Below 55 dB by day, Below 50 dB by night",
    );
    const welsh = buildResultsView(input({ area: areaBundle("not-covered") }));
    expect(JSON.stringify(section(welsh, "family", "noise").blocks)).toContain(
      "Wales is not covered",
    );
  });

  it("sold prices render the served facts only — no computed tiles (B7/D23)", () => {
    const view = buildResultsView(input());
    const sold = section(view, "home", "sold-prices");
    const tiles = sold.blocks.find((b) => b.type === "tiles");
    if (!tiles || tiles.type !== "tiles") throw new Error("tiles missing");
    expect(tiles.tiles).toEqual([
      { label: "Last sale of this home", value: "£588,995 — 15 June 2023" },
      { label: "Postcode median", value: "£588,995" },
    ]);
    const text = JSON.stringify(sold);
    expect(text).not.toMatch(/change since|held for|annual growth|time held/i);
  });

  it("report-depth material never reaches the view (D66)", () => {
    const nearby = nearbyWith({
      "schools-secondary": category({
        category: "schools-secondary",
        state: "within",
        places: [
          {
            name: "Maltings Academy",
            miles: 1.87,
            detail: null,
            sixthForm: true,
            urn: "135653",
            destinations: { marker: "DESTINATIONS-MARKER" },
          } as never,
        ],
        countWithin: 1,
        nearestSelective: null,
        nearestSelectiveLine: null,
      }),
    });
    const view = buildResultsView(input({ nearby }));
    const text = allText(view);
    expect(text).not.toContain("DEFENCES-MARKER");
    expect(text).not.toContain("CLIMATE-MARKER");
    expect(text).not.toContain("DESTINATIONS-MARKER");
    expect(text).not.toContain("burglary");
  });

  it("the catchment block carries the honesty line, the GOV.UK link and the served deadlines line", () => {
    const view = buildResultsView(input());
    const catchment = section(view, "family", "catchment");
    const text = JSON.stringify(catchment.blocks);
    expect(text).toContain(CATCHMENT_BLOCK_LINE);
    expect(text).toContain("We hold no catchment boundaries");
    expect(catchment.blocks).toContainEqual({
      type: "link",
      label: "School admissions on GOV.UK",
      url: "https://www.gov.uk/schools-admissions",
    });
    expect(text).toContain("Apply by 31 October for secondary places");
  });

  it("broadband carries the gigabit headline and no other connectivity figures", () => {
    const view = buildResultsView(input());
    const broadband = section(view, "home", "broadband");
    expect(JSON.stringify(broadband.blocks)).toContain("gigabit");
    expect(JSON.stringify(broadband.blocks)).not.toMatch(/mobile|4G|5G/);
  });

  it("rung 2: address-level panels show the needs-exact-home state; truncations still link", () => {
    const sections = shortSections({
      epc: {
        state: "needs-exact-home",
        headlineBand: null,
        headlineAssessmentLabel: null,
        line: "choose the exact home to see its energy certificates",
      },
    });
    const rung2: AddressResolution = {
      rung: 2,
      kind: "address-list",
      directory,
      street: "BIRKDALE RISE",
      building: null,
      addresses: [birkdale.address],
    };
    const view = buildResultsView(
      input({
        resolution: rung2,
        short: { rung: 2, kind: "short-bundle", postcode: "CM3 2JT", sections },
      }),
    );
    expect(JSON.stringify(section(view, "home", "epc").blocks)).toContain(
      "choose the exact home to see its energy certificates",
    );
    const primary = section(view, "family", "schools-primary");
    const places = primary.blocks.find((b) => b.type === "places");
    if (!places || places.type !== "places") throw new Error("places missing");
    expect(places.group.truncation?.href).toBe(REPORT_ROUTE);
  });
});

describe("results — the wider-area view (rung 3)", () => {
  const widerShort: Extract<ShortBundle, { kind: "wider-area" }> = {
    rung: 3,
    kind: "wider-area",
    sections: Object.fromEntries(
      [
        "soldPrices",
        "flood",
        "crime",
        "epc",
        "councilTax",
        "constraints",
        "heritage",
        "nature",
        "air",
        "noise",
        "broadband",
        "nearby",
      ].map((key) => [key, { state: "unavailable", reason: `${key} needs an exact postcode` }]),
    ) as never,
  };

  it("every section renders its named state; no pills, no strip, no report link anywhere", () => {
    const view = buildWiderAreaView(widerShort);
    expect(view.pills).toBeNull();
    expect(view.warningsStrip.kind).toBe("none");
    const text = allText(view);
    expect(text).toContain("soldPrices needs an exact postcode");
    expect(text).toContain("nearby needs an exact postcode");
    expect(text).not.toContain(REPORT_ROUTE);
    expect(text).not.toContain("£4.99");
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).not.toContain('href="/report"');
    expect(html).toContain("Family Checks");
  });
});

describe("results — the rendered page", () => {
  it("renders the strip's pills as label + figure chip, the D9 form verbatim, and the closing block", () => {
    const view = buildResultsView(input());
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    // D70 R5: the pill is never coloured; its miles figure
    // rides as the tinted chip, and only there.
    expect(html).toContain("pill pill--summary");
    expect(html).toContain('<span class="pill__label">Nearest primary</span>');
    expect(html).toContain('<span class="pill__figure pill__figure--green">0.44 mi</span>');
    expect(html).not.toContain('place-row__miles--green">Nearest primary');
    expect(html).toContain(DISCLAIMER_SHORT_FORM);
    expect(html).toContain(DISCLAIMER_CLOSING_BLOCK);
    expect(html).toContain('<a href="/how-we-check">How we check</a>.');
    // Tab order is fixed.
    const familyAt = html.indexOf("Family Checks");
    const nearbyAt = html.indexOf("What&#x27;s Nearby");
    const homeAt = html.indexOf("Home, Costs &amp; Risks");
    expect(familyAt).toBeGreaterThan(-1);
    expect(nearbyAt).toBeGreaterThan(familyAt);
    expect(homeAt).toBeGreaterThan(nearbyAt);
    // Truncation lines link to the pinned report route.
    expect(html).toContain(
      '<a href="/report">Plus 3 more primary schools in the detailed report — £4.99</a>',
    );
  });

  it("the closing disclaimer block is pinned verbatim (Final Design, website form)", () => {
    expect(DISCLAIMER_CLOSING_BLOCK).toBe(
      "School places are never promised and catchments are not guaranteed — check council and school admissions, apply by 31 Oct (secondary) / 15 Jan (primary). GP lists and NHS dentist places open and close. Pet data from OpenStreetMap may be incomplete. Air quality, noise and solar are modelled. Distances are straight-line. This result is information, not advice. Full method, sources and disclaimers:",
    );
  });
});
