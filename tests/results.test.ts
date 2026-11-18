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
  reportRoute,
  resultsScopeLabel,
  summaryPills,
  truncationFor,
  warningsStrip,
  type ResultsInput,
} from "../lib/results";
import type { ShortBundle, ShortFloodLayer, ShortSections } from "../lib/short-bundle";
import type { ShortlistCard } from "../lib/shortlist";
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
    // The hand-off pick (M7.9): buildResultsView reads
    // the hand-off from the short bundle now, so the
    // fixture carries the pick in the picked form —
    // state, council, line and link, matching the area
    // fixture's section below.
    planningApplications: {
      state: "handed-off",
      council: "Braintree",
      line: "planning applications for this area are held on the council's register",
      link: {
        label: "Search the register of planning decisions (GOV.UK)",
        url: "https://www.gov.uk/search-register-planning-decisions",
      },
    },
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

function crimeBundle(
  multiple: number | null,
  staleLine: string | null = null,
  per1000 = 44.9,
): CrimeBundle {
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
        per1000,
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
    homeKey: "19||BIRKDALE RISE",
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
  it("formatMiles renders one decimal place, trailing zeros trimmed (CI #205 fix)", () => {
    expect(formatMiles(0.442)).toBe("0.4");
    expect(formatMiles(5.89)).toBe("5.9");
    expect(formatMiles(0.1)).toBe("0.1");
    expect(formatMiles(4.213)).toBe("4.2");
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

  it("reportRoute: the M7.6 link contract — postcode always, home key only when a home is identified", () => {
    expect(reportRoute("CM3 2JT")).toBe("/report?postcode=CM3+2JT");
    expect(reportRoute("CM3 2JT", null)).toBe("/report?postcode=CM3+2JT");
    expect(reportRoute("CM3 2JT", "19||BIRKDALE RISE")).toBe(
      "/report?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE",
    );
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
    expect(group.rows[0].milesText).toBe("0.4 mi");
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

describe("results — pill logic D75 (fold-in)", () => {
  const d75Area = (overrides: Record<string, unknown> = {}): AreaBundle =>
    ({
      rung: 1,
      kind: "area-bundle",
      postcode: "CM3 2JT",
      sections: {
        air: {
          state: "served",
          line: null,
          year: 2024,
          no2: 8.15,
          pm25: 7.12,
          pm10: 12.55,
          headlineFigure: null,
          sourceLine: null,
        },
        noise: {
          state: "served",
          line: null,
          bands: [
            {
              sourceKind: "road",
              label: "road noise",
              dayBand: "Below 55 dB",
              nightBand: "Below 50 dB",
              line: "road noise: Below 55 dB by day, Below 50 dB by night",
            },
            {
              sourceKind: "rail",
              label: "rail noise",
              dayBand: "Below 55 dB",
              nightBand: "Below 50 dB",
              line: "rail noise: Below 55 dB by day, Below 50 dB by night",
            },
          ],
          headlineBand: { sourceKind: "road", dayBand: "Below 55 dB" },
          sourceLine: null,
        },
        imd: {
          state: "served",
          line: null,
          decile: 8,
          summary: null,
          domains: [],
          sourceLine: null,
        },
        broadband: {
          state: "served",
          line: null,
          gigabitCapablePct: 100,
          superfast30Pct: 100,
          sourceLine: null,
        },
        ...overrides,
      },
    }) as unknown as AreaBundle;

  it("the Birkdale worked example: only Schools is concerning — the strip reads Schools · Flood · Crime · Noise · Deprivation", () => {
    const nearby = nearbyWith({
      "schools-primary": primaryNear,
      "schools-secondary": category({
        category: "schools-secondary",
        state: "within",
        places: [{ name: "Maltings Academy", miles: 1.87, detail: null, sixthForm: true }],
        countWithin: 1,
        nearestSelective: null,
        nearestSelectiveLine: null,
      }),
      ae: category({
        category: "ae",
        state: "none-within",
        places: [],
        countWithin: 0,
        beyondNearest: { name: "Broomfield Hospital", miles: 5.8 },
        line: "none within 2 miles — nearest is Broomfield Hospital, 5.8 miles away",
      }),
      station: category({
        category: "station",
        state: "within",
        places: [{ name: "Hatfield Peverel station", miles: 0.6, detail: null }],
        countWithin: 1,
      }),
      nurseries: category({
        category: "nurseries",
        state: "within",
        places: [{ name: "Nursery", miles: 0.3, detail: null }],
        countWithin: 1,
      }),
    });
    const pills = summaryPills({
      nearby: nearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(0.5),
      sections: shortSections(),
      area: d75Area(),
    });
    expect(pills?.map(pillText)).toEqual([
      "Schools 0.4 / 1.9 mi",
      "Flood Very low",
      "Crime Below England average",
      "Noise Quiet",
      "Deprivation 8 of 10",
    ]);
  });

  it("the golden flood shape: rofsw below-lowest-band still earns the Flood pill as a good pill", () => {
    // The golden replay pins Birkdale's real flood
    // states: rofrs at "no-band-published" and rofsw at
    // "below-lowest-band" (the surface-water absence
    // state). The worked example above hand-builds rofsw
    // as "no-band-published", which masked floodBandOf
    // missing the below-lowest-band state (CI #206).
    const nearby = nearbyWith({
      "schools-primary": primaryNear,
      "schools-secondary": category({
        category: "schools-secondary",
        state: "within",
        places: [{ name: "Maltings Academy", miles: 1.87, detail: null, sixthForm: true }],
        countWithin: 1,
        nearestSelective: null,
        nearestSelectiveLine: null,
      }),
      ae: category({
        category: "ae",
        state: "none-within",
        places: [],
        countWithin: 0,
        beyondNearest: { name: "Broomfield Hospital", miles: 5.8 },
        line: "none within 2 miles — nearest is Broomfield Hospital, 5.8 miles away",
      }),
      station: category({
        category: "station",
        state: "within",
        places: [{ name: "Hatfield Peverel station", miles: 0.6, detail: null }],
        countWithin: 1,
      }),
      nurseries: category({
        category: "nurseries",
        state: "within",
        places: [{ name: "Nursery", miles: 0.3, detail: null }],
        countWithin: 1,
      }),
    });
    const sections = shortSections({
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
            "below-lowest-band",
            null,
            "this postcode point is below the lowest mapped surface-water band",
          ),
        ],
      },
    });
    const pills = summaryPills({
      nearby: nearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(0.5),
      sections,
      area: d75Area(),
    });
    // The Flood pill is present with the Very low figure,
    // sitting in the good fill behind the one concerning
    // fact (Schools) — and the worked-example strip is
    // unchanged under the golden flood states.
    const floodPill = pills?.find((pill) => pill.label === "Flood");
    expect(floodPill?.figure).toBe("Very low");
    expect(pills?.map(pillText)).toEqual([
      "Schools 0.4 / 1.9 mi",
      "Flood Very low",
      "Crime Below England average",
      "Noise Quiet",
      "Deprivation 8 of 10",
    ]);
  });

  it("the golden noise shape: 'No modelled rail noise' still earns the Noise pill as a good pill", () => {
    // The golden replay pins Birkdale's real noise
    // states (tests/fixtures/noise, measured through
    // Defra's WMS): road below the published range, rail
    // and airport with no modelled source at the point.
    // The worked example above hand-builds rail as
    // "Below 55 dB" — a state Birkdale never serves —
    // which masked noiseBandLow accepting only the
    // below-range wording: on the real bands the rail
    // "low" test failed, Noise fell to "neither" and the
    // strip lost its fourth pill (CI #207, the same
    // masking pattern as the CI #206 flood states).
    const nearby = nearbyWith({
      "schools-primary": primaryNear,
      "schools-secondary": category({
        category: "schools-secondary",
        state: "within",
        places: [{ name: "Maltings Academy", miles: 1.87, detail: null, sixthForm: true }],
        countWithin: 1,
        nearestSelective: null,
        nearestSelectiveLine: null,
      }),
      ae: category({
        category: "ae",
        state: "none-within",
        places: [],
        countWithin: 0,
        beyondNearest: { name: "Broomfield Hospital", miles: 5.8 },
        line: "none within 2 miles — nearest is Broomfield Hospital, 5.8 miles away",
      }),
      station: category({
        category: "station",
        state: "within",
        places: [{ name: "Hatfield Peverel station", miles: 0.6, detail: null }],
        countWithin: 1,
      }),
      nurseries: category({
        category: "nurseries",
        state: "within",
        places: [{ name: "Nursery", miles: 0.3, detail: null }],
        countWithin: 1,
      }),
    });
    const pills = summaryPills({
      nearby: nearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(0.5),
      sections: shortSections(),
      area: d75Area({
        noise: {
          state: "served",
          line: null,
          bands: [
            {
              sourceKind: "road",
              label: "road noise",
              dayBand: "Below 55 dB",
              nightBand: "Below 50 dB",
              line: "road noise: Below 55 dB by day, Below 50 dB by night",
            },
            {
              sourceKind: "rail",
              label: "rail noise",
              dayBand: "No modelled rail noise",
              nightBand: "No modelled rail noise",
              line: "rail noise: No modelled rail noise by day, No modelled rail noise by night",
            },
            {
              sourceKind: "airport",
              label: "airport noise",
              dayBand: "No modelled airport noise",
              nightBand: "No modelled airport noise",
              line: "airport noise: No modelled airport noise by day, No modelled airport noise by night",
            },
          ],
          headlineBand: { sourceKind: "road", dayBand: "Below 55 dB" },
          sourceLine: null,
        },
      }),
    });
    // The Noise pill is present with the Quiet figure,
    // sitting in the good fill behind Flood and Crime —
    // and the worked-example strip is unchanged under
    // the golden noise states.
    const noisePill = pills?.find((pill) => pill.label === "Noise");
    expect(noisePill?.figure).toBe("Quiet");
    expect(pills?.map(pillText)).toEqual([
      "Schools 0.4 / 1.9 mi",
      "Flood Very low",
      "Crime Below England average",
      "Noise Quiet",
      "Deprivation 8 of 10",
    ]);
  });

  it("a rail band inside the published range is not 'low': the Noise pill stays off", () => {
    // The CI #207 fix accepts only the below-range
    // wording and the no-modelled state as low; a rail
    // band of 55–59 dB by day is a real published band —
    // neither quiet enough for "good" nor loud enough
    // for "concerning" — so Noise takes no pill.
    const pills = summaryPills({
      nearby: baseNearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(0.5),
      sections: shortSections(),
      area: d75Area({
        noise: {
          state: "served",
          line: null,
          bands: [
            {
              sourceKind: "road",
              label: "road noise",
              dayBand: "Below 55 dB",
              nightBand: "Below 50 dB",
              line: "road noise: Below 55 dB by day, Below 50 dB by night",
            },
            {
              sourceKind: "rail",
              label: "rail noise",
              dayBand: "55–59 dB",
              nightBand: "Below 50 dB",
              line: "rail noise: 55–59 dB by day, Below 50 dB by night",
            },
          ],
          headlineBand: { sourceKind: "road", dayBand: "Below 55 dB" },
          sourceLine: null,
        },
      }),
    });
    expect(pills?.some((pill) => pill.label === "Noise")).toBe(false);
  });

  it("concerning facts come first in priority order, capped at three, then good facts fill", () => {
    const sections = shortSections({
      flood: {
        state: "served",
        liveWarnings: null,
        layers: [
          floodLayer("flood_zone", "zone-1", null, "zone 1"),
          floodLayer("rofrs", "inside", "Low", "a Low river band covers this point"),
          floodLayer("rofsw", "inside", "Very low", "very low surface water"),
        ],
      },
      epc: { state: "served", headlineBand: "D", headlineAssessmentLabel: "band D", line: "epc" },
    });
    const crimeHigh = {
      rung: 1,
      kind: "crime",
      postcode: "CM3 2JT",
      crime: {
        state: "served",
        total: 700,
        perHead: { per1000: 120, line: "120 per 1,000", basisLine: "basis" },
        englandFigure: { englandPer1000: 94.5, multiple: 1.3, line: "england" },
      },
    } as unknown as CrimeBundle;
    const pills = summaryPills({
      nearby: baseNearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeHigh,
      sections,
      area: d75Area(),
    });
    // Concerning in priority order: Flood, Crime, Schools
    // (A&E at 4.21 mi is good, EPC D concerning but fourth —
    // the cap is three). Good fill: A&E, Noise.
    expect(pills?.map((pill) => pill.label)).toEqual(["Flood", "Crime", "Schools", "A&E", "Noise"]);
  });

  it("neither facts never take a pill: A&E at 6 mi, EPC C, decile 5, air between the yardsticks", () => {
    const nearby = nearbyWith({
      ae: category({
        category: "ae",
        state: "none-within",
        places: [],
        countWithin: 0,
        beyondNearest: { name: "Hospital", miles: 6 },
        line: "none within 2 miles",
      }),
    });
    const sections = shortSections({
      epc: { state: "served", headlineBand: "C", headlineAssessmentLabel: "band C", line: "epc" },
    });
    const pills = summaryPills({
      nearby: nearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(0.5),
      sections,
      area: d75Area({
        imd: {
          state: "served",
          line: null,
          decile: 5,
          summary: null,
          domains: [],
          sourceLine: null,
        },
      }),
    });
    const labels = pills?.map((pill) => pill.label) ?? [];
    expect(labels).not.toContain("A&E");
    expect(labels).not.toContain("EPC");
    expect(labels).not.toContain("Deprivation");
    expect(labels).not.toContain("Air quality");
  });

  it("the merged Schools rule: good only when primary <=0.5 AND secondary <=1; grammar distance is never a pill", () => {
    const nearby = nearbyWith({
      "schools-primary": category({
        category: "schools-primary",
        state: "within",
        places: [{ name: "Primary", miles: 0.4, detail: null }],
        countWithin: 1,
      }),
      "schools-secondary": category({
        category: "schools-secondary",
        state: "within",
        places: [{ name: "Grammar School", miles: 0.9, detail: null, selective: true }],
        countWithin: 1,
        nearestSelective: { name: "Grammar School", miles: 0.9 },
        nearestSelectiveLine: "the nearest selective secondary school is Grammar School",
      }),
    });
    const pills = summaryPills({
      nearby: nearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(0.5),
      sections: shortSections(),
    });
    expect(pills?.map((pill) => pill.label)).toContain("Schools");
    expect(pills?.map((pill) => pill.label)).not.toContain("Grammar school");
    expect(pills?.find((pill) => pill.label === "Schools")?.figure).toBe("0.4 / 0.9 mi");
  });

  it("fewer qualifying facts means fewer pills", () => {
    const sections = shortSections({
      broadband: { state: "served", gigabitCapablePct: 0, line: null },
      crime: { state: "not-covered", reason: "not covered" },
      flood: {
        state: "served",
        liveWarnings: null,
        layers: [
          floodLayer("flood_zone", "zone-1", null, "zone 1"),
          floodLayer("rofrs", "no-band-published", null, "no band"),
          floodLayer("rofsw", "no-band-published", null, "no band"),
        ],
      },
    });
    const pills = summaryPills({
      nearby: nearbyWith({}) as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: {
        rung: 1,
        kind: "not-covered",
        postcode: "CM3 2JT",
        crime: { state: "not-covered", reason: "x" },
      } as unknown as CrimeBundle,
      sections,
    });
    expect(pills?.map(pillText)).toEqual(["Flood Very low"]);
  });

  it("the schools and nurseries upsells carry the trimmed F1/F3 wording — never the banned promises", () => {
    const view = buildResultsView(
      input({
        nearby: nearbyWith({
          "schools-primary": primaryNear,
          nurseries: category({
            category: "nurseries",
            state: "within",
            places: [{ name: "Nursery", miles: 0.3, detail: null }],
            countWithin: 2,
          }),
        }),
      }),
    );
    const text = allText(view);
    expect(text).not.toContain("full Ofsted reports");
    expect(text).not.toContain("ERA detail");
    expect(text).not.toContain("admissions deadlines");
    expect(text).not.toContain("Ofsted outcomes and dates");
    expect(text).toContain("with their Ofsted ratings and inspection dates");
    expect(text).toContain("The full list of nurseries and pre-schools near this home.");
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
  it("places every section in its D76 tab, in order — four tabs, What's Nearby always last", () => {
    const view = buildResultsView(input());
    expect(view.tabs.map((t) => t.label)).toEqual([
      "Family Checks",
      "The Neighbourhood",
      "Home, Costs & Risks",
      "What's Nearby",
    ]);
    for (const [index, tab] of view.tabs.entries()) {
      expect(tab.sections.map((sec) => sec.key)).toEqual(RESULTS_TABS[index].sections);
    }
    expect(view.tabs[0].sections.map((sec) => sec.key)).toEqual([
      "schools-primary",
      "schools-secondary",
      "catchment",
      "nurseries",
      "pets",
    ]);
    expect(view.tabs[3].sections.map((sec) => sec.key)).toEqual([
      "health",
      "hospitals",
      "parks",
      "shops",
      "transport",
      "food-and-drink",
      "leisure",
      "places-to-visit",
      "worship-libraries",
    ]);
  });

  it("the flood section renders the warnings block FIRST, in full form", () => {
    const view = buildResultsView(input({ flood: floodBundle(activeWarnings) }));
    const flood = section(view, "home", "flood");
    expect(flood.blocks[0].type).toBe("flood-warnings");
    expect(view.floodWarningsState).toBe("warnings");
    expect(view.warningsStrip.kind).toBe("warnings");
    // The flood upsell carries the founder's softened F4 wording.
    const text = JSON.stringify(flood.blocks);
    expect(text).toContain("Plus the flood findings in full, with a location map for each check");
    expect(text).toContain(
      "The defences near this home, and how the picture changes in the years ahead.",
    );
    expect(text).not.toContain("flood map");
  });

  it("crime (D77(a)): the percentage form with the calibration pair beneath, the stale line first when stale; no crime types", () => {
    const stale = "these counts are older than usual — the filed window has not been refreshed";
    const sections = shortSections();
    if (sections.crime.state === "served") sections.crime.staleLine = stale;
    const view = buildResultsView(
      input({
        crime: crimeBundle(0.5, stale),
        short: { rung: 1, kind: "short-bundle", postcode: "CM3 2JT", sections },
      }),
    );
    const crime = section(view, "neighbourhood", "crime");
    expect(crime.blocks[0]).toEqual({ type: "notice", variant: "stale", text: stale });
    const text = JSON.stringify(crime.blocks);
    // Fixture calibration: 44.9 per 1,000 here, 94.5 across England.
    expect(text).toContain(
      "330 crimes recorded in the last 12 months — about 52% below the England average.",
    );
    expect(text).toContain(
      "That's 44.9 recorded crimes for every 1,000 residents here. Across England, the figure is 94.5.",
    );
    expect(text).toContain(
      "Incidents are recorded against nearby streets, not against individual houses.",
    );
    expect(text).not.toContain("burglary");
  });

  it("crime (D77(a)): the percentage is computed from the served pair — 51.7 against 94.5 renders about 45% below (CI #205 fix)", () => {
    const view = buildResultsView(input({ crime: crimeBundle(0.5, null, 51.7) }));
    const crime = section(view, "neighbourhood", "crime");
    const text = JSON.stringify(crime.blocks);
    expect(text).toContain(
      "330 crimes recorded in the last 12 months — about 45% below the England average.",
    );
    expect(text).toContain(
      "That's 51.7 recorded crimes for every 1,000 residents here. Across England, the figure is 94.5.",
    );
  });

  it("air quality & noise render together: the named not-filed line by default, the verbatim bands when served", () => {
    const notFiled = buildResultsView(input());
    const airNoise = section(notFiled, "neighbourhood", "air-noise");
    expect(JSON.stringify(airNoise.blocks)).toContain(
      "modelled noise bands are not filed yet, so no noise answer can be given yet",
    );
    const served = buildResultsView(input({ area: areaBundle("served") }));
    expect(JSON.stringify(section(served, "neighbourhood", "air-noise").blocks)).toContain(
      "road noise: Below 55 dB by day, Below 50 dB by night",
    );
    const welsh = buildResultsView(input({ area: areaBundle("not-covered") }));
    expect(JSON.stringify(section(welsh, "neighbourhood", "air-noise").blocks)).toContain(
      "Wales is not covered",
    );
  });

  it("sold prices render the served facts only — no computed tiles (B7/D23)", () => {
    const view = buildResultsView(input());
    const sold = section(view, "home", "sold-prices");
    expect(sold.heading).toBe("Sold history");
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

  it("costs carries council tax, EPC, EV and the broadband headline in one section (D76/D77)", () => {
    const view = buildResultsView(input());
    const costs = section(view, "home", "costs");
    const text = JSON.stringify(costs.blocks);
    expect(text).toContain("Band D averages £2,280.36 a year in Braintree");
    expect(text).toContain("£190.03 a month if the Band D average is spread evenly over 12 months");
    expect(text).toContain("gigabit");
    expect(text).toContain("Plus every council tax band and the full EPC certificate detail");
  });

  it("the buy bar carries the founder's pinned line — location maps, never flood map pictures (F4 ruling)", () => {
    const view = buildResultsView(input());
    expect(view.buyBar?.heading).toBe("Get the full detailed report for this home");
    expect(view.buyBar?.line).toBe(
      "Everything behind the headlines — the breakdowns, the flood findings with location maps, the fuller EPC detail and the questions to ask the seller — in one dated, print-ready document. Or save this home and compare it first.",
    );
    expect(view.calculators.lastSalePrice).toBe(588995);
  });

  it("the buy bar carries the mystery tease and the contract href (M7.6, D21 as amended)", () => {
    const view = buildResultsView(input());
    // The tease names nothing about the extra — the gift
    // stays a surprise until the delivery email.
    expect(view.buyBar?.mysteryLine).toBe(
      "Every report comes with a mystery extra, on us — it arrives in your email with your report.",
    );
    // Rung 1: the door link carries postcode + home key.
    expect(view.reportHref).toBe(reportRoute("CM3 2JT", "19||BIRKDALE RISE"));
    expect(view.buyBar?.href).toBe(reportRoute("CM3 2JT", "19||BIRKDALE RISE"));
  });

  it("the company-ownership line does NOT render while the flag is off (the bundle key is absent) — and renders from the key when present (D77(d))", () => {
    const off = buildResultsView(input());
    const offText = JSON.stringify(section(off, "home", "planning-protection").blocks);
    expect(offText).not.toContain("Owned by a company");
    expect(offText).not.toContain("Company ownership");
    const area = areaBundle() as unknown as {
      sections: Record<string, unknown>;
    };
    area.sections.companyOwnership = {
      state: "served",
      line: "a registered proprietor of this home's title is a company",
    };
    const on = buildResultsView(input({ area: area as unknown as AreaBundle }));
    const text = JSON.stringify(section(on, "home", "planning-protection").blocks);
    expect(text).toContain("Company ownership");
    expect(text).toContain("Owned by a company");
  });

  it("the company line takes the sample's single-line form behind the flag (M7.9, founder ruling 17 Nov): Yes / No from the section state, the brain's sentence never rendered on the free page", () => {
    const withSection = (companyOwnership: Record<string, unknown>) => {
      const area = areaBundle() as unknown as {
        sections: Record<string, unknown>;
      };
      area.sections.companyOwnership = companyOwnership;
      return JSON.stringify(
        section(
          buildResultsView(input({ area: area as unknown as AreaBundle })),
          "home",
          "planning-protection",
        ).blocks,
      );
    };
    // Served (an own-title company match): the one line
    // reads Yes; the fuller served sentence with its
    // as-at date stays at report depth and does not
    // render here.
    const yes = withSection({
      state: "served",
      line: "a registered proprietor of this home's title is a company",
    });
    expect(yes).toContain("Owned by a company: Yes.");
    expect(yes).not.toContain("a registered proprietor of this home's title is a company");
    // Not company-owned (both datasets filed, no match):
    // the one line reads No.
    const no = withSection({
      state: "not-company-owned",
      line: "this home's title is not in HM Land Registry's company-ownership data",
    });
    expect(no).toContain("Owned by a company: No.");
    expect(no).not.toContain("this home's title is not in HM Land Registry");
    // The named states keep their honest served lines —
    // no Yes/No is invented where the boolean is null.
    const named = withSection({
      state: "needs-exact-home",
      line: "choose the exact home to see whether a company is a registered proprietor of its title",
    });
    expect(named).toContain(
      "choose the exact home to see whether a company is a registered proprietor of its title",
    );
    expect(named).not.toContain("Owned by a company: Yes.");
    expect(named).not.toContain("Owned by a company: No.");
  });

  it("rung 2: the EPC needs-exact-home line rides inside Costs; truncations still link", () => {
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
    expect(JSON.stringify(section(view, "home", "costs").blocks)).toContain(
      "choose the exact home to see its energy certificates",
    );
    const primary = section(view, "family", "schools-primary");
    const places = primary.blocks.find((b) => b.type === "places");
    if (!places || places.type !== "places") throw new Error("places missing");
    // M7.6 link contract at rung 2: the postcode travels,
    // no home key — no home is identified at this rung.
    expect(places.group.truncation?.href).toBe(reportRoute("CM3 2JT"));
    expect(view.reportHref).toBe(reportRoute("CM3 2JT"));
    expect(view.buyBar?.href).toBe(reportRoute("CM3 2JT"));
  });
});

describe("results — nation gating (Scotland/NI gap check, fold-in workstream 6)", () => {
  const resolutionFor = (lsoaCode: string, postcode: string): AddressResolution => ({
    rung: 2,
    kind: "address-list",
    directory: { ...directory, postcode, lsoaCode },
    street: null,
    building: null,
    addresses: [],
  });
  const beyond = (key: string, miles: number) =>
    category({
      category: key as never,
      state: "none-within",
      places: [],
      countWithin: 0,
      beyondNearest: { name: "Far Away Place", miles },
      line: `none within 2 miles — nearest is Far Away Place, ${miles} miles away`,
    });
  const gatedBundle = () =>
    nearbyWith({
      "schools-primary": beyond("schools-primary", 14.671),
      "schools-secondary": beyond("schools-secondary", 12.446),
      "sixth-forms": beyond("sixth-forms", 12.446),
      gp: beyond("gp", 9.345),
      dentist: beyond("dentist", 11.259),
      pharmacy: beyond("pharmacy", 8.972),
      ae: beyond("ae", 5.89),
      maternity: beyond("maternity", 5.89),
      station: category({
        category: "station",
        state: "within",
        places: [{ name: "Far Away Place", miles: 0.5, detail: null }],
        countWithin: 1,
      }),
      "bus-stop": category({
        category: "bus-stop",
        state: "within",
        places: [{ name: "Far Away Place", miles: 0.2, detail: null }],
        countWithin: 1,
      }),
      "ev-chargers": category({
        category: "ev-chargers",
        state: "within",
        places: [{ name: "Far Away Place", miles: 1.1, detail: null }],
        countWithin: 1,
      }),
      parks: category({
        category: "parks",
        state: "within",
        places: [{ name: "Far Away Place", miles: 0.4, detail: null }],
        countWithin: 1,
      }),
    });

  it("Scotland: the 9 gated sections render the D77(c) not-covered line and no place row; no three-digit miles anywhere", () => {
    const view = buildResultsView(
      input({ resolution: resolutionFor("S01000001", "EH1 1AD"), nearby: gatedBundle() }),
    );
    const text = allText(view);
    expect(text).toContain(
      "Primary schools isn't part of this check in Scotland — the figures we use cover England and Wales.",
    );
    expect(text).toContain("GP surgeries isn't part of this check in Scotland");
    expect(text).toContain("A&E hospitals isn't part of this check in Scotland");
    expect(text).toContain("Nurseries & pre-schools isn't part of this check in Scotland");
    expect(text).not.toMatch(/\d{3}\.\d+ mi/);
    // Scotland's stations/bus stops/EV chargers are NOT gated (GB/UK-wide datasets).
    const transport = section(view, "nearby", "transport");
    expect(JSON.stringify(transport.blocks)).toContain("Far Away Place");
  });

  it("NI: the same 9 plus stations, bus stops and parks are gated; EV chargers still serve", () => {
    const view = buildResultsView(
      input({ resolution: resolutionFor("N01000001", "BT1 1AA"), nearby: gatedBundle() }),
    );
    const text = allText(view);
    expect(text).toContain("in Northern Ireland — the figures we use cover England and Wales.");
    const transport = section(view, "nearby", "transport");
    expect(JSON.stringify(transport.blocks)).toContain(
      "isn't part of this check in Northern Ireland",
    );
    const parks = section(view, "nearby", "parks");
    expect(JSON.stringify(parks.blocks)).toContain("isn't part of this check in Northern Ireland");
    const costs = section(view, "home", "costs");
    expect(JSON.stringify(costs.blocks)).toContain("Far Away Place");
    expect(text).not.toMatch(/\d{3}\.\d+ mi/);
  });

  it("Wales: A&E and maternity are gated only — Welsh schools and GP keep serving", () => {
    const view = buildResultsView(
      input({ resolution: resolutionFor("W01000001", "CF11 8AA"), nearby: gatedBundle() }),
    );
    const hospitals = section(view, "nearby", "hospitals");
    expect(JSON.stringify(hospitals.blocks)).toContain("isn't part of this check in Wales");
    const primary = section(view, "family", "schools-primary");
    expect(JSON.stringify(primary.blocks)).toContain("Far Away Place");
    const health = section(view, "nearby", "health");
    expect(JSON.stringify(health.blocks)).toContain("Far Away Place");
  });

  it("pills: a Scotland view yields no 'Nearest primary … mi' pill even when flood/crime artificially serve", () => {
    const view = buildResultsView(
      input({ resolution: resolutionFor("S01000001", "EH1 1AD"), nearby: gatedBundle() }),
    );
    const pillLabels = view.pills?.map((pill) => pill.label) ?? [];
    expect(pillLabels).not.toContain("Schools");
    expect(allText(view.pills ?? [])).not.toMatch(/\d{3}\.\d+ mi/);
  });

  it("England control: identical fixtures under an E code render the beyond rows unchanged", () => {
    // The fixtures' beyond miles sit inside the legitimate
    // golden range (the corpus maximum is 14.671), so this
    // control isolates the nation gating: nothing here is
    // gated, and nothing is radius-suppressed either.
    const view = buildResultsView(input({ nearby: gatedBundle() }));
    const primary = section(view, "family", "schools-primary");
    expect(JSON.stringify(primary.blocks)).toContain("Far Away Place");
    expect(JSON.stringify(primary.blocks)).toContain("14.7 mi");
  });

  it("beyond radius (CI #205 fix): a nearest beyond 25 miles serves the no-finding line, in England too", () => {
    const far = (key: string, label: string, miles: number) =>
      category({
        category: key as never,
        label,
        state: "none-within",
        places: [],
        countWithin: 0,
        beyondNearest: { name: "Far Away Place", miles },
        line: `none within 2 miles — nearest is Far Away Place, ${miles} miles away`,
      });
    const view = buildResultsView(
      input({
        nearby: nearbyWith({
          station: far("station", "stations", 279.258),
          "bus-stop": far("bus-stop", "bus stops", 308.378),
          supermarket: far("supermarket", "supermarkets", 306.32),
          ae: far("ae", "A&E hospitals", 324.328),
        }),
      }),
    );
    const transport = section(view, "nearby", "transport");
    expect(JSON.stringify(transport.blocks)).toContain(
      "no stations within 2 miles of the postcode point",
    );
    expect(JSON.stringify(transport.blocks)).toContain(
      "no bus stops within 2 miles of the postcode point",
    );
    const shops = section(view, "nearby", "shops");
    expect(JSON.stringify(shops.blocks)).toContain(
      "no supermarkets recorded within 2 miles on the map data we hold — a gap in the map is not proof that none exists",
    );
    const hospitals = section(view, "nearby", "hospitals");
    expect(JSON.stringify(hospitals.blocks)).toContain(
      "no A&E hospitals within 2 miles of the postcode point",
    );
    const text = allText(view);
    expect(text).not.toContain("Far Away Place");
    expect(text).not.toMatch(/\d{3}\.\d+ mi/);
    // The pill builder reads the same suppressed view: no
    // A&E pill is struck from a 324-mile pointer.
    expect(view.pills?.map((pill) => pill.label) ?? []).not.toContain("A&E");
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
  it("renders the D75 pills, the D9 form verbatim, the closing block, the buy bar and the calculators", () => {
    const view = buildResultsView(input());
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).toContain("pill pill--summary");
    expect(html).toContain(DISCLAIMER_SHORT_FORM);
    expect(html).toContain(DISCLAIMER_CLOSING_BLOCK);
    expect(html).toContain('<a href="/how-we-check">How we check</a>.');
    // Tab order is fixed (D76): Family, Neighbourhood, Home, Nearby.
    const familyAt = html.indexOf("Family Checks");
    const neighbourhoodAt = html.indexOf("The Neighbourhood");
    const homeAt = html.indexOf("Home, Costs &amp; Risks");
    const nearbyAt = html.indexOf("What&#x27;s Nearby");
    expect(familyAt).toBeGreaterThan(-1);
    expect(neighbourhoodAt).toBeGreaterThan(familyAt);
    expect(homeAt).toBeGreaterThan(neighbourhoodAt);
    expect(nearbyAt).toBeGreaterThan(homeAt);
    // Truncation lines carry the M7.6 link contract:
    // postcode + home key, the identity the door resolves.
    expect(html).toContain(
      '<a href="/report?postcode=CM3+2JT&amp;home=19%7C%7CBIRKDALE+RISE">Plus 3 more primary schools in the detailed report — £4.99</a>',
    );
    // The buy bar: the mystery tease rides inside it, and
    // its button is the priced form on the contract href.
    expect(html).toContain("A mystery extra");
    expect(html).toContain(
      "Every report comes with a mystery extra, on us — it arrives in your email with your report.",
    );
    expect(html).toContain(
      '<a class="report-btn" href="/report?postcode=CM3+2JT&amp;home=19%7C%7CBIRKDALE+RISE">Get the full report — £4.99</a>',
    );
    // The buy bar and the calculators sit below the tabs.
    expect(html).toContain("Get the full detailed report for this home");
    expect(html).toContain("the flood findings with location maps");
    expect(html).not.toContain("flood map pictures");
    expect(html).toContain("Could this home fit your life?");
  });

  it("the shortlist add control renders inside the buy bar, exactly once (M7.6 move, F6 pin)", () => {
    const view = buildResultsView(input());
    const card = {
      id: "r1:CM3 2JT:19||BIRKDALE RISE",
      postcode: "CM3 2JT",
      homeKey: "19||BIRKDALE RISE",
      rung: 1,
      scopeLabel: "19 Birkdale Rise, CM3 2JT",
      addressLine: "19 Birkdale Rise, CM3 2JT",
      lastSale: null,
      factsLine: null,
      comparison: {} as ShortlistCard["comparison"],
      savedAt: "2026-11-17T08:00:00.000Z",
    } as ShortlistCard;
    const withCard = renderToStaticMarkup(
      createElement(ResultsPage, { view, shortlistCard: card }),
    );
    // One control on the page, and it sits inside the bar
    // (after the bar opens, before it closes) — the header
    // area carries no second control.
    expect(withCard.match(/data-shortlist-toggle/g)).toHaveLength(1);
    const barAt = withCard.indexOf('class="buy-bar"');
    const toggleAt = withCard.indexOf("data-shortlist-toggle");
    expect(barAt).toBeGreaterThan(-1);
    expect(toggleAt).toBeGreaterThan(barAt);
    expect(withCard).not.toContain("results-actions");
    // Without a card (rung 2, not-covered) no control
    // renders at all.
    const withoutCard = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(withoutCard).not.toContain("data-shortlist-toggle");
  });

  it("the closing disclaimer block is pinned verbatim (Final Design, website form)", () => {
    expect(DISCLAIMER_CLOSING_BLOCK).toBe(
      "School places are never promised and catchments are not guaranteed — check council and school admissions, apply by 31 Oct (secondary) / 15 Jan (primary). GP lists and NHS dentist places open and close. Pet data from OpenStreetMap may be incomplete. Air quality, noise and solar are modelled. Distances are straight-line. This result is information, not advice. Full method, sources and disclaimers:",
    );
  });
});
