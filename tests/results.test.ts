import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ResultsPage from "../components/ResultsPage";
import type { AddressResolution } from "../lib/address";
import type { AreaBundle, CensusSection, ImdSection } from "../lib/area-bundle";
import { CHECK_PAGES, CHECK_PAGE_PATHS } from "../lib/check-pages";
import type { CrimeBundle } from "../lib/crime";
import type { FloodBundle, FloodLayerType, FloodLiveWarnings, FloodPointState } from "../lib/flood";
import { nearbyCheckingGroups } from "../lib/journey";
import type { CategoryAnswer, NearbyBundle, NearbyCategory } from "../lib/nearby";
import {
  ARTICLE4_UNCHECKABLE_TEXT,
  BROADBAND_CAVEAT,
  CATCHMENT_LINK,
  FLOOD_ROFRS_ABSENCE_LINE,
  FLOOD_ROFSW_ABSENCE_LINE,
  REPORT_ROUTE,
  RESULTS_TABS,
  buildResultsView,
  buildWiderAreaView,
  checkLinksForTabs,
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
  type ResultsTabView,
} from "../lib/results";
import type { ShortBundle, ShortFloodLayer, ShortSections } from "../lib/short-bundle";
import type { ShortlistCard } from "../lib/shortlist";
import { DISCLAIMER_CLOSING_BLOCK, DISCLAIMER_SHORT_FORM, HOW_WE_CHECK_PATH } from "../lib/site";
import { HOW_WE_CHECK_CARDS } from "../lib/site-pages";
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
    { latitude: 51.7, longitude: 0.6, name: "Birkdale Primary School", miles: 0.442, detail: null },
    {
      latitude: 51.7,
      longitude: 0.6,
      name: "Hatfield Peverel Infant School",
      miles: 0.913,
      detail: null,
    },
    {
      latitude: 51.7,
      longitude: 0.6,
      name: "St Andrew's Junior School",
      miles: 1.204,
      detail: null,
    },
  ],
  countWithin: 5,
});

const baseNearby = nearbyWith({
  "schools-primary": primaryNear,
  "schools-secondary": category({
    category: "schools-secondary",
    state: "within",
    places: [
      {
        latitude: 51.7,
        longitude: 0.6,
        name: "Maltings Academy",
        miles: 1.87,
        detail: null,
        sixthForm: true,
        urn: "135653",
      },
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
        latitude: 51.7,
        longitude: 0.6,
        detail: null,
        cqcRating: { rating: "Good", date: "2024-12-19" },
      },
    ],
    countWithin: 2,
  }),
  parks: category({
    category: "parks",
    state: "within",
    places: [
      { latitude: 51.7, longitude: 0.6, name: "Birkdale Rise Green", miles: 0.32, detail: null },
    ],
    countWithin: 1,
  }),
  ae: category({
    category: "ae",
    state: "none-within",
    places: [],
    countWithin: 0,
    beyondNearest: { latitude: 51.7, longitude: 0.6, name: "Broomfield Hospital", miles: 4.213 },
    line: "none within 2 miles — nearest is Broomfield Hospital, 4.213 miles away",
  }),
  maternity: category({
    category: "maternity",
    state: "none-within",
    places: [],
    countWithin: 0,
    beyondNearest: { latitude: 51.7, longitude: 0.6, name: "Broomfield Hospital", miles: 5.89 },
    line: "none within 2 miles — nearest is Broomfield Hospital, 5.89 miles away",
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
      per1000: 45,
      englandPer1000: 94.5,
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
        // The served fields the Costs rows compose from
        // (parity fix batch): the stub previously carried
        // only the monthly line, which masked the real
        // section shape.
        state: "served",
        authority: "Braintree",
        taxYear: "2026/27",
        bandDAveragePence: 228036,
        bandDAverageLabel: "£2,280.36",
        bandDMonthlyPence: 19003,
        bandDMonthlyLabel: "£190.03",
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
    // Re-pinned (parity fix batch, item 14): the truncRow
    // carries the lead and the price as separate parts —
    // the lead no longer embeds "in the detailed report —
    // £4.99".
    // Re-pinned (OBS-012, BUG-152): the cap stands inside
    // truncationFor — the category is a required argument,
    // n = min(countWithin, report depth) − shown, and the
    // view carries the capped total. At countWithin 400
    // the schools strip still speaks "Plus 3 more" (the
    // deep dive's costed re-pin: the pre-fix formula
    // would have spoken 398).
    expect(truncationFor(5, 2, "primary schools", true, "schools-primary")).toEqual({
      n: 3,
      total: 5,
      lead: "Plus 3 more primary schools",
      detail: null,
      href: REPORT_ROUTE,
    });
    expect(truncationFor(400, 2, "primary schools", true, "schools-primary")).toEqual({
      n: 3,
      total: 5,
      lead: "Plus 3 more primary schools",
      detail: null,
      href: REPORT_ROUTE,
    });
    expect(truncationFor(2, 2, "primary schools", true, "schools-primary")).toBeNull();
    expect(truncationFor(5, 2, "primary schools", false, "schools-primary")?.href).toBeNull();
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
    expect(group.truncation?.lead).toBe("Plus 3 more primary schools");
  });

  it("health rows carry the CQC rating in the detail, never an inspection date", () => {
    const gp = (baseNearby as Extract<NearbyBundle, { kind: "distances" }>).categories.find(
      (c) => c.category === "gp",
    );
    if (!gp) throw new Error("gp missing");
    const group = placeGroupView(
      gp,
      { heading: "GP surgeries", groupLabel: "GP surgeries", display: 1, family: "everyday" },
      true,
    );
    // Re-pinned (parity fix batch, items 29/14): the CQC
    // part rides inside the row's one detail line in the
    // Master's form — "CQC overall rating: Good", with no
    // publication date on the results page (the date stays
    // at report depth) and never an inspection date.
    expect(group.rows[0].detail).toContain("CQC overall rating: Good");
    expect(group.rows[0].detail).not.toContain("published");
    expect(group.rows[0].detail).not.toContain("inspect");
    expect(group.truncation?.n).toBe(1);
  });

  it("secondary rows carry the filed sixth-form flag and the selective line", () => {
    const secondary = category({
      category: "schools-secondary",
      state: "within",
      places: [
        {
          latitude: 51.7,
          longitude: 0.6,
          name: "Maltings Academy",
          miles: 1.87,
          detail: null,
          sixthForm: true,
          urn: "135653",
        },
        {
          latitude: 51.7,
          longitude: 0.6,
          name: "Other School",
          miles: 1.95,
          detail: null,
          sixthForm: null,
          urn: "1",
        },
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
    // O-3 (M7.11): the yes form is the sample's plain
    // words; the not-recorded form stays as filed — both
    // now ride inside the row's one detail line (parity
    // fix batch, item 29). The selective fact renders as
    // the grammar row (item 12), not a sentence.
    expect(group.rows[0].detail).toBe("Sixth form at the school");
    expect(group.rows[1].detail).toBe("sixth form: not recorded");
    expect(group.grammar?.name).toBe("Grammar School");
    expect(group.grammar?.milesText).toBe("1.2 mi");
    // Destinations are report depth: the row model carries
    // no destinations field at all.
    expect(JSON.stringify(group)).not.toContain("destinations");
  });

  it("the grammar list caps at the nearest five with the true total stated (BUG-140)", () => {
    const selectiveSchools = [
      { name: "Selective One", miles: 5.5 },
      { name: "Selective Two", miles: 6 },
      { name: "Selective Three", miles: 7 },
      { name: "Selective Four", miles: 8 },
      { name: "Selective Five", miles: 9 },
      { name: "Selective Six", miles: 9.5 },
      { name: "Selective Seven", miles: 10 },
    ];
    const presentation = {
      heading: "Secondary schools",
      groupLabel: "secondary schools",
      display: 2,
      family: "school" as const,
    };
    const capped = placeGroupView(
      category({
        category: "schools-secondary",
        state: "within",
        places: [],
        countWithin: 0,
        selectiveSchools,
        nearestSelective: selectiveSchools[0],
        nearestSelectiveLine: null,
      }),
      presentation,
      true,
    );
    expect(capped.grammarSchools.map((s) => s.name)).toEqual([
      "Selective One",
      "Selective Two",
      "Selective Three",
      "Selective Four",
      "Selective Five",
    ]);
    expect(capped.grammarCountLine).toBe(
      "There are 7 selective schools within 10 miles — the 5 nearest are shown.",
    );
    // The single-fact grammar entry still names the
    // nearest, cap or no cap.
    expect(capped.grammar?.name).toBe("Selective One");

    // At five or fewer the whole set shows and no
    // count line stands.
    const uncapped = placeGroupView(
      category({
        category: "schools-secondary",
        state: "within",
        places: [],
        countWithin: 0,
        selectiveSchools: selectiveSchools.slice(0, 3),
        nearestSelective: selectiveSchools[0],
        nearestSelectiveLine: null,
      }),
      presentation,
      true,
    );
    expect(uncapped.grammarSchools).toHaveLength(3);
    expect(uncapped.grammarCountLine).toBeNull();
  });

  it("BUG-213: none-within groups render the beyond row alone — no preamble line", () => {
    const ae = (baseNearby as Extract<NearbyBundle, { kind: "distances" }>).categories.find(
      (c) => c.category === "ae",
    );
    if (!ae) throw new Error("ae missing");
    const group = placeGroupView(
      ae,
      { heading: "A&E hospitals", groupLabel: "A&E hospitals", display: 1, family: "hospital" },
      true,
    );
    // The sample shows the named entry with its pill
    // and no preamble (Sample 3 Tab 4; View 7
    // Section 5) — the old ruled form carried the
    // line above the row saying the same place at
    // the same distance.
    expect(group.line).toBeNull();
    expect(group.rows).toHaveLength(1);
    expect(group.rows[0].name).toBe("Broomfield Hospital");
    expect(group.rows[0].band).toBe("green");
    expect(group.truncation).toBeNull();
  });

  it("BUG-213: none-within — the beyond-nearest miles round to one decimal on the row (BUG-014 residual)", () => {
    // The brain's composed line carries its miles at
    // three decimals — the input below is the brain's
    // own form, verbatim — and the results page used to
    // recompose it as a preamble line at one decimal
    // (founder ruling, 20 Nov 2026: round it like
    // everywhere else). BUG-213 retires the preamble
    // line; the rounding now lives on the row's pill,
    // and the brain's line itself is not touched.
    const primary = category({
      category: "schools-primary",
      state: "none-within",
      places: [],
      countWithin: 0,
      beyondNearest: { name: "Far Away Place", miles: 14.671, latitude: 51.7, longitude: 0.6 },
      line: "none within 2 miles — nearest is Far Away Place, 14.671 miles away",
    });
    const group = placeGroupView(
      primary,
      { heading: "Primary schools", groupLabel: "primary schools", display: 3, family: "school" },
      true,
    );
    expect(group.line).toBeNull();
    expect(group.rows).toHaveLength(1);
    expect(group.rows[0].milesText).toBe("14.7 mi");
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
        places: [
          {
            latitude: 51.7,
            longitude: 0.6,
            name: "Maltings Academy",
            miles: 1.87,
            detail: null,
            sixthForm: true,
          },
        ],
        countWithin: 1,
        nearestSelective: null,
        nearestSelectiveLine: null,
      }),
      ae: category({
        category: "ae",
        state: "none-within",
        places: [],
        countWithin: 0,
        beyondNearest: { latitude: 51.7, longitude: 0.6, name: "Broomfield Hospital", miles: 5.8 },
        line: "none within 2 miles — nearest is Broomfield Hospital, 5.8 miles away",
      }),
      station: category({
        category: "station",
        state: "within",
        places: [
          {
            latitude: 51.7,
            longitude: 0.6,
            name: "Hatfield Peverel station",
            miles: 0.6,
            detail: null,
          },
        ],
        countWithin: 1,
      }),
      nurseries: category({
        category: "nurseries",
        state: "within",
        places: [{ latitude: 51.7, longitude: 0.6, name: "Nursery", miles: 0.3, detail: null }],
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
      "Schools · 0.4 / 1.9 mi",
      "Flood · Very low",
      "Crime · Below England average",
      "Noise · Quiet",
      "Deprivation · 8 of 10",
    ]);
  });

  it("item 8/9 (parity fix batch): an Exeter-shaped crime pair — local rate above the true England figure — makes Crime a concerning pill in D75 priority order", () => {
    // Exeter's real pair: 122.5 per 1,000 here against
    // England's 94.5. Crime is concerning, and D75 priority
    // (Flood, Crime, Schools…) puts it ahead of the
    // concerning Schools pill.
    const pills = summaryPills({
      nearby: nearbyWith({
        "schools-primary": primaryNear,
        "schools-secondary": category({
          category: "schools-secondary",
          state: "within",
          places: [
            {
              latitude: 51.7,
              longitude: 0.6,
              name: "Maltings Academy",
              miles: 1.87,
              detail: null,
              sixthForm: true,
            },
          ],
          countWithin: 1,
        }),
      }) as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(1.3, null, 122.5),
      sections: shortSections(),
      area: d75Area(),
    });
    // Re-pinned (BUG-151): the pair here is 122.5 against
    // 94.5 — about 30% above, past the founder's +25%
    // line — so the graduated band speaks "Well above
    // England average" (red), where the pre-graduation
    // pill said "Above England average" at any margin.
    expect(pills?.map(pillText)).toEqual([
      "Crime · Well above England average",
      "Schools · 0.4 / 1.9 mi",
      "Flood · Very low",
      "Noise · Quiet",
      "Deprivation · 8 of 10",
    ]);
  });

  it("BUG-164: Air quality fills immediately after Crime — ahead of Schools, Noise and Deprivation — and takes the fifth slot from Deprivation", () => {
    // The same shape as the Birkdale worked example, with
    // two changes: the secondary stands at 0.9 mi (Schools
    // good, not concerning) and the air section serves a
    // WHO-clean set (NO2 8, PM2.5 4, PM10 12 — all at or
    // under the WHO 2021 guidelines), so Air is a good
    // factor. The good fill runs in the new D75 order —
    // Flood, Crime, Air quality, Schools, Noise — and
    // Deprivation, which held the fifth slot before
    // BUG-164 moved Air up, is displaced out of the strip.
    const pills = summaryPills({
      nearby: nearbyWith({
        "schools-primary": primaryNear,
        "schools-secondary": category({
          category: "schools-secondary",
          state: "within",
          places: [
            {
              latitude: 51.7,
              longitude: 0.6,
              name: "Maltings Academy",
              miles: 0.9,
              detail: null,
              sixthForm: true,
            },
          ],
          countWithin: 1,
          nearestSelective: null,
          nearestSelectiveLine: null,
        }),
        station: category({
          category: "station",
          state: "within",
          places: [
            {
              latitude: 51.7,
              longitude: 0.6,
              name: "Hatfield Peverel station",
              miles: 0.6,
              detail: null,
            },
          ],
          countWithin: 1,
        }),
        nurseries: category({
          category: "nurseries",
          state: "within",
          places: [{ latitude: 51.7, longitude: 0.6, name: "Nursery", miles: 0.3, detail: null }],
          countWithin: 1,
        }),
      }) as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(0.5),
      sections: shortSections(),
      area: d75Area({
        air: {
          state: "served",
          line: null,
          year: 2024,
          no2: 8,
          pm25: 4,
          pm10: 12,
          headlineFigure: null,
          sourceLine: null,
        },
      }),
    });
    expect(pills?.map(pillText)).toEqual([
      "Flood · Very low",
      "Crime · Below England average",
      "Air quality · Within WHO guidelines",
      "Schools · 0.4 / 0.9 mi",
      "Noise · Quiet",
    ]);
    // Air's colour is the BUG-151 air band's good dress.
    expect(pills?.[2].band).toBe("green");
  });

  it("item 8/9 (parity fix batch): with no England figure (the thin-base guard's form), no Crime pill serves at all", () => {
    const pills = summaryPills({
      nearby: nearbyWith({
        "schools-primary": primaryNear,
        "schools-secondary": category({
          category: "schools-secondary",
          state: "within",
          places: [
            {
              latitude: 51.7,
              longitude: 0.6,
              name: "Maltings Academy",
              miles: 1.87,
              detail: null,
              sixthForm: true,
            },
          ],
          countWithin: 1,
        }),
      }) as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(null, null, 122.5),
      sections: shortSections(),
      area: d75Area(),
    });
    expect(pills?.some((pill) => pill.label === "Crime")).toBe(false);
  });

  it("CI #221 diagnosis: with no England figure but a band-B certificate (the seeded corpus's Birkdale), the strip fills to five and ends with the EPC pill", () => {
    // The pin above runs on shortSections()'s headlineBand
    // C — a "neither" fact, so no EPC pill can serve and
    // the strip stops at four. The SEEDED corpus's
    // Birkdale home carries a band-B certificate: EPC is
    // a good fact there, fourth in the good fill after
    // Flood, Noise and Deprivation, and the strip is
    // five. (The #220 fix round inferred four pills for
    // the browser strip from this fixture's C; CI #221's
    // count assertion corrected it — this pin keeps the
    // seeded case executable at unit level.)
    const pills = summaryPills({
      nearby: nearbyWith({
        "schools-primary": primaryNear,
        "schools-secondary": category({
          category: "schools-secondary",
          state: "within",
          places: [
            {
              latitude: 51.7,
              longitude: 0.6,
              name: "Maltings Academy",
              miles: 1.87,
              detail: null,
              sixthForm: true,
            },
          ],
          countWithin: 1,
        }),
      }) as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(null, null, 122.5),
      sections: shortSections({
        epc: {
          state: "served",
          headlineBand: "B",
          headlineAssessmentLabel: "the newest certificate for this home is assessed band B",
          line: "energy certificates for CM3 2JT",
        },
      }),
      area: d75Area(),
    });
    expect(pills?.map(pillText)).toEqual([
      "Schools · 0.4 / 1.9 mi",
      "Flood · Very low",
      "Noise · Quiet",
      "Deprivation · 8 of 10",
      "EPC · B",
    ]);
  });

  it("item 8 (parity fix batch): the corrupted England figure reproduces the live Exeter departure — the diagnosis pin", () => {
    // The play server's thin LSOA base divided the national
    // total by 5,899 residents, serving an "England figure"
    // of 933039: Exeter's 122.5 read as BELOW it, flipping
    // Crime to a good pill and producing the departed strip
    // (Deprivation promoted, Noise dropped). The pill
    // algorithm itself never departed from D75 — its input
    // did. This pin keeps the diagnosis executable.
    const corrupted = crimeBundle(0.5, null, 122.5) as unknown as {
      crime: { englandFigure: { englandPer1000: number; multiple: number; line: string } | null };
    };
    corrupted.crime.englandFigure = { englandPer1000: 933039, multiple: 0, line: "corrupted" };
    const pills = summaryPills({
      nearby: nearbyWith({
        "schools-primary": primaryNear,
        "schools-secondary": category({
          category: "schools-secondary",
          state: "within",
          places: [
            {
              latitude: 51.7,
              longitude: 0.6,
              name: "Maltings Academy",
              miles: 1.87,
              detail: null,
              sixthForm: true,
            },
          ],
          countWithin: 1,
        }),
      }) as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: corrupted as unknown as CrimeBundle,
      sections: shortSections(),
      area: d75Area(),
    });
    const crimePill = pills?.find((pill) => pill.label === "Crime");
    expect(crimePill?.figure).toBe("Below England average");
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
        places: [
          {
            latitude: 51.7,
            longitude: 0.6,
            name: "Maltings Academy",
            miles: 1.87,
            detail: null,
            sixthForm: true,
          },
        ],
        countWithin: 1,
        nearestSelective: null,
        nearestSelectiveLine: null,
      }),
      ae: category({
        category: "ae",
        state: "none-within",
        places: [],
        countWithin: 0,
        beyondNearest: { latitude: 51.7, longitude: 0.6, name: "Broomfield Hospital", miles: 5.8 },
        line: "none within 2 miles — nearest is Broomfield Hospital, 5.8 miles away",
      }),
      station: category({
        category: "station",
        state: "within",
        places: [
          {
            latitude: 51.7,
            longitude: 0.6,
            name: "Hatfield Peverel station",
            miles: 0.6,
            detail: null,
          },
        ],
        countWithin: 1,
      }),
      nurseries: category({
        category: "nurseries",
        state: "within",
        places: [{ latitude: 51.7, longitude: 0.6, name: "Nursery", miles: 0.3, detail: null }],
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
      "Schools · 0.4 / 1.9 mi",
      "Flood · Very low",
      "Crime · Below England average",
      "Noise · Quiet",
      "Deprivation · 8 of 10",
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
        places: [
          {
            latitude: 51.7,
            longitude: 0.6,
            name: "Maltings Academy",
            miles: 1.87,
            detail: null,
            sixthForm: true,
          },
        ],
        countWithin: 1,
        nearestSelective: null,
        nearestSelectiveLine: null,
      }),
      ae: category({
        category: "ae",
        state: "none-within",
        places: [],
        countWithin: 0,
        beyondNearest: { latitude: 51.7, longitude: 0.6, name: "Broomfield Hospital", miles: 5.8 },
        line: "none within 2 miles — nearest is Broomfield Hospital, 5.8 miles away",
      }),
      station: category({
        category: "station",
        state: "within",
        places: [
          {
            latitude: 51.7,
            longitude: 0.6,
            name: "Hatfield Peverel station",
            miles: 0.6,
            detail: null,
          },
        ],
        countWithin: 1,
      }),
      nurseries: category({
        category: "nurseries",
        state: "within",
        places: [{ latitude: 51.7, longitude: 0.6, name: "Nursery", miles: 0.3, detail: null }],
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
      "Schools · 0.4 / 1.9 mi",
      "Flood · Very low",
      "Crime · Below England average",
      "Noise · Quiet",
      "Deprivation · 8 of 10",
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

  it("a loud airport band earns the concerning Noise pill even with road and rail quiet", () => {
    // The founder ruled (18 Nov 2026) that the Noise
    // pill counts airport, road and rail — all three.
    // The concerning scan has always read every filed
    // band, airport included; this pin holds that side
    // of the ruling in place: a filed airport band at
    // 65–69 dB by day is high (day >=65), so Noise
    // serves as a concerning pill with the "Noisy"
    // figure however quiet road and rail are.
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
              dayBand: "Below 55 dB",
              nightBand: "Below 50 dB",
              line: "rail noise: Below 55 dB by day, Below 50 dB by night",
            },
            {
              sourceKind: "airport",
              label: "airport noise",
              dayBand: "65–69 dB",
              nightBand: "Below 50 dB",
              line: "airport noise: 65–69 dB by day, Below 50 dB by night",
            },
          ],
          headlineBand: { sourceKind: "road", dayBand: "Below 55 dB" },
          sourceLine: null,
        },
      }),
    });
    const noisePill = pills?.find((pill) => pill.label === "Noise");
    expect(noisePill?.figure).toBe("Noisy");
  });

  it("an airport band inside the published range blocks the good Noise pill: Noise stays off", () => {
    // The new behaviour under the founder's 18 Nov 2026
    // ruling. Before it, the good test read road and
    // rail only, so this shape — road and rail in the
    // lowest bands, a real airport band of 55–59 dB by
    // day filed beside them — served "Noise · Quiet"
    // over a section reporting that airport band. The
    // airport band is neither low (not the below-range
    // band) nor high (under the day >=65 threshold), so
    // Noise now takes no pill at all.
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
              dayBand: "Below 55 dB",
              nightBand: "Below 50 dB",
              line: "rail noise: Below 55 dB by day, Below 50 dB by night",
            },
            {
              sourceKind: "airport",
              label: "airport noise",
              dayBand: "55–59 dB",
              nightBand: "Below 50 dB",
              line: "airport noise: 55–59 dB by day, Below 50 dB by night",
            },
          ],
          headlineBand: { sourceKind: "road", dayBand: "Below 55 dB" },
          sourceLine: null,
        },
      }),
    });
    expect(pills?.some((pill) => pill.label === "Noise")).toBe(false);
  });

  it("all three sources in the lowest bands earn the good Noise pill", () => {
    // The good side of the founder's 18 Nov 2026
    // ruling: road, rail and airport all in the
    // below-range bands (day below 55 dB, night below
    // 50 dB) — Noise serves as a good pill with the
    // "Quiet" figure. (The golden-shape pin above
    // covers the same verdict where rail and airport
    // file as "No modelled … noise" instead.)
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
              dayBand: "Below 55 dB",
              nightBand: "Below 50 dB",
              line: "rail noise: Below 55 dB by day, Below 50 dB by night",
            },
            {
              sourceKind: "airport",
              label: "airport noise",
              dayBand: "Below 55 dB",
              nightBand: "Below 50 dB",
              line: "airport noise: Below 55 dB by day, Below 50 dB by night",
            },
          ],
          headlineBand: { sourceKind: "road", dayBand: "Below 55 dB" },
          sourceLine: null,
        },
      }),
    });
    const noisePill = pills?.find((pill) => pill.label === "Noise");
    expect(noisePill?.figure).toBe("Quiet");
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
        beyondNearest: { latitude: 51.7, longitude: 0.6, name: "Hospital", miles: 6 },
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
        places: [{ latitude: 51.7, longitude: 0.6, name: "Primary", miles: 0.4, detail: null }],
        countWithin: 1,
      }),
      "schools-secondary": category({
        category: "schools-secondary",
        state: "within",
        places: [
          {
            latitude: 51.7,
            longitude: 0.6,
            name: "Grammar School",
            miles: 0.9,
            detail: null,
            selective: true,
          },
        ],
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
    expect(pills?.map(pillText)).toEqual(["Flood · Very low"]);
  });

  it("BUG-007: one served flood check at Low is enough for the concerning Flood pill — D75's 'either check'", () => {
    // Only the rivers & sea layer serves a band; the
    // surface-water layer carries no band at all. Before
    // the fix the Flood factor stayed silent unless BOTH
    // layers filed bands, so a one-layer postcode at Low
    // showed no Flood pill while a two-layer postcode at
    // the same risk did.
    const sections = shortSections({
      flood: {
        state: "served",
        liveWarnings: null,
        layers: [
          floodLayer("rofrs", "inside", "Low", "this postcode point is in the Low band"),
          floodLayer("rofsw", "not-filed", null, "surface water is not filed for this point"),
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
    // The fixture's broadband fact is good and fills
    // behind the concerning Flood pill (D75 order).
    expect(pills?.map(pillText)).toEqual(["Flood · Low", "Broadband · Full fibre available"]);
  });

  it("BUG-007: one served flood check at Very low alone is NOT a good Flood pill — good needs both checks", () => {
    const sections = shortSections({
      flood: {
        state: "served",
        liveWarnings: null,
        layers: [
          floodLayer("rofrs", "no-band-published", null, "no river or sea band is published"),
          floodLayer("rofsw", "not-filed", null, "surface water is not filed for this point"),
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
    // No Flood pill: the only pill is the fixture's
    // good broadband fact.
    expect(pills?.map(pillText)).toEqual(["Broadband · Full fibre available"]);
    expect(pills?.some((pill) => pill.label === "Flood")).toBe(false);
  });

  it("the schools and nurseries upsells carry the trimmed F1/F3 wording — never the banned promises", () => {
    const view = buildResultsView(
      input({
        nearby: nearbyWith({
          "schools-primary": primaryNear,
          nurseries: category({
            category: "nurseries",
            state: "within",
            places: [{ latitude: 51.7, longitude: 0.6, name: "Nursery", miles: 0.3, detail: null }],
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
    // Re-pinned (BUG-152): the nurseries detail names the
    // NEAREST set — "the full list" was one of the three
    // false wordings corrected sample→product; the
    // report serves the nearest three.
    expect(text).toContain(
      "The nearest nurseries and pre-schools to this home, with their details.",
    );
    expect(text).not.toContain("full list of nurseries");
  });

  it("BUG-079 side effect (CI #292): a vets list widened to a far two-nearest pair gives NO Vet pill — the pill keeps its list-radius basis", () => {
    // The second-pass batch (BUG-079) widened the vets
    // category's served list to the two nearest at ANY
    // distance — the What's Nearby lists' rule the founder
    // ruled on; he never ruled on pill thresholds. In a
    // sparse corpus the nearest vet stands 29.7 miles away
    // (the e2e corpus), and the factor, reading places[0],
    // called that "concerning" (>5 mi), took a concerning
    // slot and pushed EPC off the strip. The input below
    // is the Birkdale worked example's, plus the widened
    // vets list in its served form: the strip must read
    // exactly as the worked example's — no Vet pill.
    const nearby = nearbyWith({
      "schools-primary": primaryNear,
      "schools-secondary": category({
        category: "schools-secondary",
        state: "within",
        places: [
          {
            latitude: 51.7,
            longitude: 0.6,
            name: "Maltings Academy",
            miles: 1.87,
            detail: null,
            sixthForm: true,
          },
        ],
        countWithin: 1,
        nearestSelective: null,
        nearestSelectiveLine: null,
      }),
      ae: category({
        category: "ae",
        state: "none-within",
        places: [],
        countWithin: 0,
        beyondNearest: { latitude: 51.7, longitude: 0.6, name: "Broomfield Hospital", miles: 5.8 },
        line: "none within 2 miles — nearest is Broomfield Hospital, 5.8 miles away",
      }),
      station: category({
        category: "station",
        state: "within",
        places: [
          {
            latitude: 51.7,
            longitude: 0.6,
            name: "Hatfield Peverel station",
            miles: 0.6,
            detail: null,
          },
        ],
        countWithin: 1,
      }),
      nurseries: category({
        category: "nurseries",
        state: "within",
        places: [{ latitude: 51.7, longitude: 0.6, name: "Nursery", miles: 0.3, detail: null }],
        countWithin: 1,
      }),
      vets: category({
        category: "vets",
        state: "within",
        places: [
          { latitude: 51.7, longitude: 0.6, name: "Faraway Vets", miles: 29.7, detail: null },
          { latitude: 51.7, longitude: 0.6, name: "Farther Vets", miles: 31.304, detail: null },
        ],
        countWithin: 0,
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
      "Schools · 0.4 / 1.9 mi",
      "Flood · Very low",
      "Crime · Below England average",
      "Noise · Quiet",
      "Deprivation · 8 of 10",
    ]);
    expect(pills?.some((pill) => pill.label === "Vet")).toBe(false);
  });

  it("BUG-079 side effect (CI #292): a vet inside the list radius still earns its good pill, in D75 fill order", () => {
    // The bound is the list radius, not a silence: a vet
    // within it qualifies exactly as before the batch.
    // Same shape as the test above, with the deprivation
    // fact neutral (decile 5) so the good Vet pill takes
    // the last fill slot in priority order.
    const nearby = nearbyWith({
      "schools-primary": primaryNear,
      "schools-secondary": category({
        category: "schools-secondary",
        state: "within",
        places: [
          {
            latitude: 51.7,
            longitude: 0.6,
            name: "Maltings Academy",
            miles: 1.87,
            detail: null,
            sixthForm: true,
          },
        ],
        countWithin: 1,
        nearestSelective: null,
        nearestSelectiveLine: null,
      }),
      vets: category({
        category: "vets",
        state: "within",
        places: [
          { latitude: 51.7, longitude: 0.6, name: "Village Vets", miles: 1.2, detail: null },
        ],
        countWithin: 1,
      }),
    });
    const pills = summaryPills({
      nearby: nearby as Extract<NearbyBundle, { kind: "distances" }>,
      flood: floodBundle(noWarnings),
      crime: crimeBundle(0.5),
      sections: shortSections(),
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
    expect(pills?.map(pillText)).toEqual([
      "Schools · 0.4 / 1.9 mi",
      "Flood · Very low",
      "Crime · Below England average",
      "Noise · Quiet",
      "Vet · 1.2 mi",
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
    // Re-pinned (FC-06, BUG-154): the catchment section
    // is retired — the Family tab carries four standing
    // sections (the selective section stands only where
    // selective schools serve, and this fixture serves
    // none).
    expect(view.tabs[0].sections.map((sec) => sec.key)).toEqual([
      "schools-primary",
      "schools-secondary",
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
    // The flood upsell carries the founder's softened F4
    // wording — re-pinned (HCR-03, BUG-153): "a location
    // map for each check" promised maps the report does
    // not draw (rivers & sea has none). BUG-214
    // (founder ruling 24 Nov 2026): the mapped-layers
    // tail is trimmed — the lead stands alone.
    const text = JSON.stringify(flood.blocks);
    expect(text).toContain("Plus the flood findings in full");
    expect(text).not.toContain("for each check");
    expect(text).not.toContain("with location maps for the flood zones");
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
    // Re-pinned (BUG-156 / NB-03): the stale line now
    // renders sentence-cased by the composition
    // boundary's pass (HCR-08 mechanism) — its first
    // letter stands capital in the view.
    expect(crime.blocks[0]).toEqual({
      type: "notice",
      variant: "stale",
      text: "These counts are older than usual — the filed window has not been refreshed",
    });
    const text = JSON.stringify(crime.blocks);
    // Fixture calibration: 44.9 per 1,000 here, 94.5 across England.
    expect(text).toContain(
      "330 crimes recorded in the last 12 months — about 52% below the England average.",
    );
    // Re-pinned (BUG-156 / NB-03): the calibration pair
    // takes the report's list form — the rate as its own
    // bullet, the England figure as a labelled third —
    // not the pre-fix "That's … Across England, the
    // figure is …" sentence.
    expect(text).toContain("44.9 recorded crimes for every 1,000 residents here.");
    expect(text).toContain('"lead":"Across England:"');
    expect(text).toContain("94.5 recorded crimes for every 1,000 residents.");
    expect(text).not.toContain("That's 44.9");
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
    // Re-pinned (BUG-156 / NB-03): the pair in list form.
    expect(text).toContain("51.7 recorded crimes for every 1,000 residents here.");
    expect(text).toContain("94.5 recorded crimes for every 1,000 residents.");
  });

  it("air quality & noise render together: the named not-filed line by default, the verbatim bands when served", () => {
    const notFiled = buildResultsView(input());
    const airNoise = section(notFiled, "neighbourhood", "air-noise");
    // Re-pinned (HCR-08): the brain's line renders
    // sentence-cased at the composition boundary, as the
    // report renders it — the mechanism, not the
    // instance.
    expect(JSON.stringify(airNoise.blocks)).toContain(
      "Modelled noise bands are not filed yet, so no noise answer can be given yet",
    );
    const served = buildResultsView(input({ area: areaBundle("served") }));
    // Item 24 (parity fix batch): the noise serves as the
    // Master's single joined line, not the brain's
    // per-band lines.
    expect(JSON.stringify(section(served, "neighbourhood", "air-noise").blocks)).toContain(
      "Road noise day below 55 dB and night below 50 dB.",
    );
    expect(JSON.stringify(section(served, "neighbourhood", "air-noise").blocks)).toContain(
      "Defra modelled bands.",
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
    // Re-pinned (HCR-12, BUG-153): the "Postcode median"
    // tile is gone — it restated the median line's
    // figure a second time; the line carries figure,
    // count and span alone.
    expect(tiles.tiles).toEqual([
      { label: "Last sale of this home", value: "£588,995 — 15 June 2023" },
    ]);
    const text = JSON.stringify(sold);
    expect(text).not.toMatch(/change since|held for|annual growth|time held/i);
  });

  it("sold history: the Master's four stat tiles, the property line and human dates (item 20, parity fix batch)", () => {
    const sections = shortSections({
      soldPrices: {
        state: "served",
        stateLine: null,
        ownLastSale: { price: 588995, date: "2023-06-15" },
        ownSales: [
          { price: 450000, date: "2019-03-01", propertyType: "D", tenure: "F", newBuild: true },
          { price: 588995, date: "2023-06-15", propertyType: "D", tenure: "F", newBuild: false },
        ],
        ownLine: "19 Birkdale Rise last sold for £588,995 on 15 June 2023",
        median: {
          state: "served",
          value: 588995,
          counted: 29,
          spanFrom: "2013-09-20",
          spanTo: "2024-01-31",
          line: "the middle of 29 category-A sales in CM3 2JT is £588,995",
        },
        buildingMedian: null,
        sourceLine: "HM Land Registry Price Paid Data",
        explainer: "explainer",
      } as ShortSections["soldPrices"],
    });
    const view = buildResultsView(
      input({ short: { rung: 1, kind: "short-bundle", postcode: "CM3 2JT", sections } }),
    );
    const sold = section(view, "home", "sold-prices");
    const tiles = sold.blocks.find((b) => b.type === "tiles");
    if (!tiles || tiles.type !== "tiles") throw new Error("tiles missing");
    expect(tiles.tiles).toEqual([
      { label: "Last sale", value: "£588,995", sub: "15 June 2023 • Land Registry" },
      { label: "Times sold", value: "2", sub: "2 recorded sales found" },
      {
        label: "Change since prev.",
        value: "+£138,995",
        sub: "Previous sale £450,000 — 1 March 2019",
      },
      {
        label: "Held by last owner",
        value: "4 years 3 months",
        sub: "Bought 1 March 2019 — sold 15 June 2023",
      },
    ]);
    const text = JSON.stringify(sold.blocks);
    expect(text).toContain(
      "Detached, freehold. These figures describe recorded sales only — they are not a valuation of this home.",
    );
    // Human dates everywhere: the median span composes
    // from the filed ISO span into human form.
    expect(text).toContain("20 September 2013 to 31 January 2024");
    expect(text).not.toContain("2013-09-20");
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
            latitude: 51.7,
            longitude: 0.6,
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

  it("the catchment block is RETIRED (FC-06, BUG-154): no catchment section stands on the Family tab", () => {
    // The block restated, in fuller prose, the catchment
    // and deadline substance the page's closing
    // disclaimers carry verbatim, and the sample's tab
    // never carried it — the founder retired it. The
    // honesty itself stands in the disclaimers and in
    // the report's Section 10; the block's link constant
    // survives for those surfaces.
    const view = buildResultsView(input());
    const family = view.tabs.find((t) => t.id === "family");
    expect(family?.sections.map((s) => s.key)).not.toContain("catchment");
    expect(JSON.stringify(view.tabs)).not.toContain("We hold no catchment boundaries");
    expect(CATCHMENT_LINK).toEqual({
      label: "School admissions on GOV.UK",
      url: "https://www.gov.uk/schools-admissions",
    });
  });

  it("costs carries council tax, EPC, EV and the broadband headline in one section (D76/D77)", () => {
    const view = buildResultsView(input());
    const costs = section(view, "home", "costs");
    const text = JSON.stringify(costs.blocks);
    // Item 22 (parity fix batch): council tax is stated
    // ONCE, in the Master's single Band D line — the
    // brain's monthly restatement no longer renders beside
    // it.
    expect(text).toContain("Band D — Braintree: £2,280.36 a year, £190.03 a month");
    expect(text).toContain("this home's own band isn't published");
    expect(text).not.toContain("spread evenly over 12 months");
    expect(text.split("£2,280.36 a year").length - 1).toBe(1);
    expect(text).toContain("gigabit");
    // Re-pinned (HCR-07, BUG-153): broadband stands as a
    // row under its COVERAGE badge, and neither EV
    // charging nor Broadband & mobile carries a
    // subheading — both are rows among the Costs rows,
    // as the sample draws them.
    expect(text).toContain('"lead":"Broadband & mobile"');
    expect(text).toContain('"tag":"COVERAGE"');
    expect(text).not.toContain('"type":"subheading","text":"EV charging"');
    expect(text).not.toContain('"type":"subheading","text":"Broadband & mobile"');
    // Re-pinned (HCR-11): the strip's EPC promise is
    // gated on a certificate being filed — this fixture
    // files none, so the strip speaks of council tax
    // alone.
    expect(text).toContain("Plus every council tax band in full");
    expect(text).not.toContain("full EPC certificate detail");
  });

  it("the buy bar carries the founder's pinned line — location maps, never flood map pictures (F4 ruling)", () => {
    const view = buildResultsView(input());
    expect(view.buyBar?.heading).toBe("Get the full detailed report for this home");
    expect(view.buyBar?.line).toBe(
      "Everything behind the headlines — the breakdowns, the flood findings with location maps, the fuller EPC detail and the questions to ask the seller — in one dated, print-ready document. Or save this home and compare it first.",
    );
    expect(view.calculators?.lastSalePrice).toBe(588995);
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
    // Re-pinned (HCR-08): the served line renders
    // sentence-cased at the composition boundary — the
    // honest line itself, its first letter capital.
    expect(named).toContain(
      "Choose the exact home to see whether a company is a registered proprietor of its title",
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
    // Re-pinned (HCR-08): sentence-cased at the boundary.
    expect(JSON.stringify(section(view, "home", "costs").blocks)).toContain(
      "Choose the exact home to see its energy certificates",
    );
    const primary = section(view, "family", "schools-primary");
    const places = primary.blocks.find((b) => b.type === "places");
    if (!places || places.type !== "places") throw new Error("places missing");
    // M7.6 link contract at rung 2: the postcode travels,
    // no home key — no home is identified at this rung.
    expect(places.group.truncation?.href).toBe(reportRoute("CM3 2JT"));
    expect(view.reportHref).toBe(reportRoute("CM3 2JT"));
    // Fix batch, 19 Nov 2026 — BUG-004 (pin move): the
    // Master has NO postcode-scope buy bar; the bar is a
    // home-scope surface and serves at rung 1 only. This
    // assertion used to pin the rung-2 bar's href — the
    // defect itself.
    expect(view.buyBar).toBeNull();
  });

  it("BUG-013: a loaded-none postcode's no-sale line renders once in the sold section, not twice", () => {
    // The brain composes "No sale recorded for this
    // postcode since 1995" in two slots of the same
    // section — the load state's line and the median
    // answer's line. The section used to push both; the
    // median line now serves only when it says something
    // the state line has not already said.
    const NO_SALE = "No sale recorded for this postcode since 1995";
    const sections = shortSections({
      soldPrices: {
        state: "served",
        stateLine: NO_SALE,
        ownLastSale: null,
        ownLine: null,
        median: {
          state: "none-recorded",
          value: null,
          counted: 0,
          spanFrom: null,
          spanTo: null,
          line: NO_SALE,
        },
        buildingMedian: null,
        sourceLine: "HM Land Registry Price Paid Data",
        explainer: "explainer",
      },
    });
    const view = buildResultsView(
      input({ short: { rung: 1, kind: "short-bundle", postcode: "CM3 2JT", sections } }),
    );
    const sold = section(view, "home", "sold-prices");
    const occurrences = JSON.stringify(sold.blocks).split(NO_SALE).length - 1;
    expect(occurrences).toBe(1);
  });
});

// BUG-212 — the planning-constraints grouping (Sample 2
// "Grouped by answer", founder pick 24 Nov 2026): the
// four polygon layers and brownfield group by answer on
// the free page — findings first, each its own named row
// with its tag and distance pill, then anything the data
// could not check, Article 4 last. The Birkdale base case
// carries a within nearest (conservation), a beyond
// nearest (green belt), an inside finding (built-up) and
// two uncheckable layers (brownfield, Article 4), so it
// exercises every group and the Article 4-last order.
describe("results — planning constraints grouping (BUG-212)", () => {
  function birkdaleSections() {
    const sections = shortSections();
    sections.constraints = {
      state: "served",
      conservationArea: {
        layer: "conservation_area",
        label: "Conservation area",
        state: "none-found",
        line: "no conservation area found in the national data, checked 10 November 2026",
        insideName: null,
        nearest: { name: "Chelmer and Blackwater Navigation", miles: 1.473 },
        beyondLine: null,
        sourceLine: "conservation area data",
      },
      article4: {
        layer: "article_4_area",
        label: "Article 4 directions",
        state: "not-published",
        line: "Article 4 directions are not published by this council to the national dataset, so no finding can be made from the data — the answer lives on the council's own planning register",
        insideName: null,
        nearest: null,
        beyondLine: null,
        sourceLine: "Article 4 data",
      },
      greenBelt: {
        layer: "green_belt",
        label: "Green belt",
        state: "none-found",
        line: "no green belt covers this postcode point in the national data",
        insideName: null,
        nearest: { name: "London", miles: 5.831 },
        beyondLine: "none within 2 miles — the nearest is London, 5.831 miles away",
        sourceLine: "green belt data",
      },
      builtUpArea: {
        layer: "built_up_area",
        label: "Built-up area",
        state: "inside",
        line: "the postcode point falls inside the Hatfield Peverel built-up area",
        insideName: "Hatfield Peverel",
        nearest: null,
        beyondLine: null,
        sourceLine: "built-up area data",
      },
      brownfield: {
        state: "not-published",
        line: "this council does not supply the national brownfield register, so no finding can be made from the data — the council's own brownfield register is the record",
        countWithin: null,
        nearest: null,
        beyondLine: null,
        sourceLine: null,
      },
    } as unknown as ShortSections["constraints"];
    return sections;
  }

  function planningBlocks() {
    const view = buildResultsView(
      input({
        short: { rung: 1, kind: "short-bundle", postcode: "CM3 2JT", sections: birkdaleSections() },
      }),
    );
    return section(view, "home", "planning-protection").blocks;
  }

  it("groups the findings under one head, each its own named row with its tag and pill", () => {
    const blocks = planningBlocks();
    expect(blocks[0]).toEqual({ type: "subheading", text: "Planning constraints" });
    expect(blocks[1]).toEqual({ type: "subheading", text: "Findings" });
    const conservation = blocks[2];
    if (conservation?.type !== "tagged-line") throw new Error("expected the conservation row");
    expect(conservation.lead).toBe("Conservation area");
    expect(conservation.texts).toEqual([
      "Not in a conservation area — the nearest conservation area is Chelmer and Blackwater Navigation.",
    ]);
    expect(conservation.tag).toBe("Clear");
    expect(conservation.tagTone).toBe("g");
    expect(conservation.miles).toEqual({ text: "1.5 mi", band: "orange" });
    const greenBelt = blocks[3];
    if (greenBelt?.type !== "tagged-line") throw new Error("expected the green belt row");
    expect(greenBelt.lead).toBe("Green belt");
    expect(greenBelt.texts).toEqual([
      "Not in the green belt, and none within 2 miles — the nearest green belt is London.",
    ]);
    expect(greenBelt.tag).toBe("Clear");
    expect(greenBelt.miles).toEqual({ text: "5.8 mi", band: "green" });
    const builtUp = blocks[4];
    if (builtUp?.type !== "tagged-line") throw new Error("expected the built-up row");
    expect(builtUp.lead).toBe("Built-up area");
    expect(builtUp.texts).toEqual(["Inside the Hatfield Peverel built-up area."]);
    expect(builtUp.tag).toBeUndefined();
    expect(builtUp.miles).toBeUndefined();
  });

  it("puts what could not be checked last, Article 4 as the section's last constraints row — with no link on it", () => {
    const blocks = planningBlocks();
    expect(blocks[5]).toEqual({ type: "subheading", text: "Could not be checked" });
    const brownfield = blocks[6];
    if (brownfield?.type !== "tagged-line") throw new Error("expected the brownfield row");
    expect(brownfield.lead).toBe("Brownfield land");
    expect(brownfield.texts).toEqual([
      "This council does not supply the national brownfield register, so no finding can be made from the data — the council's own brownfield register is the record.",
    ]);
    expect(brownfield.tag).toBe("Can't be checked");
    expect(brownfield.tagTone).toBe("grey");
    const article4 = blocks[7];
    if (article4?.type !== "tagged-line") throw new Error("expected the Article 4 row");
    expect(article4.lead).toBe("Article 4 directions");
    expect(article4.texts).toEqual([ARTICLE4_UNCHECKABLE_TEXT]);
    expect(article4.tag).toBe("Can't be checked");
    // Article 4 is the group's last row: the next block
    // is the nature row, and no link stands anywhere in
    // the group (founder correction 24 Nov: no council
    // link — "its a wrong link").
    const next = blocks[8];
    if (next?.type !== "tagged-line") throw new Error("expected the nature row");
    expect(next.lead).toBe("Nature designations");
    expect(JSON.stringify(blocks.slice(0, 8))).not.toContain("http");
  });

  it("carries no joined constraints row, no FACTS badge on the group rows, and no straight-line parenthetical", () => {
    const blocks = planningBlocks();
    const text = JSON.stringify(blocks);
    expect(blocks.some((b) => b.type === "tagged-line" && b.lead === "Planning constraints")).toBe(
      false,
    );
    for (const row of blocks.slice(2, 8)) {
      if (row.type === "tagged-line") expect(row.tag).not.toBe("FACTS");
    }
    expect(text).not.toContain("straight-line distance");
    expect(text).not.toContain("5.831 miles away");
    expect(text).not.toContain("1.473 miles away");
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
      beyondNearest: { name: "Far Away Place", miles, latitude: 51.7, longitude: 0.6 },
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
        places: [
          { latitude: 51.7, longitude: 0.6, name: "Far Away Place", miles: 0.5, detail: null },
        ],
        countWithin: 1,
      }),
      "bus-stop": category({
        category: "bus-stop",
        state: "within",
        places: [
          { latitude: 51.7, longitude: 0.6, name: "Far Away Place", miles: 0.2, detail: null },
        ],
        countWithin: 1,
      }),
      "ev-chargers": category({
        category: "ev-chargers",
        state: "within",
        places: [
          { latitude: 51.7, longitude: 0.6, name: "Far Away Place", miles: 1.1, detail: null },
        ],
        countWithin: 1,
      }),
      parks: category({
        category: "parks",
        state: "within",
        places: [
          { latitude: 51.7, longitude: 0.6, name: "Far Away Place", miles: 0.4, detail: null },
        ],
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
    expect(text).toContain("Nurseries isn't part of this check in Scotland");
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
    // BUG-014 residual (founder ruling, 20 Nov 2026):
    // the row carries the beyond-nearest miles at one
    // decimal — the brain's three-decimal form appears
    // nowhere in the section. (BUG-213 retired the
    // preamble line that used to carry "14.7 miles
    // away" beside the row.)
    expect(JSON.stringify(primary.blocks)).not.toContain("14.671");
  });

  it("beyond radius (BUG-213 ruling): a nearest beyond 25 miles is named as a row with a red pill, in England too", () => {
    // Founder ruling 24 Nov 2026: the far-beyond nearest
    // is NAMED on the free page — the CI #205 guard still
    // suppresses it for the checking feed and the summary
    // pills, but the groups render it as a row (the same
    // row form as a within-guard beyond-nearest), its
    // distance pill red at these miles. The unnamed
    // no-finding lines — including the supermarket's
    // map-gap caveat — are gone from the groups.
    const far = (key: string, label: string, miles: number) =>
      category({
        category: key as never,
        label,
        state: "none-within",
        places: [],
        countWithin: 0,
        beyondNearest: { name: "Far Away Place", miles, latitude: 51.7, longitude: 0.6 },
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
    const transportText = JSON.stringify(transport.blocks);
    expect(transportText).toContain("Far Away Place");
    expect(transportText).toContain("279.3 mi");
    expect(transportText).toContain("Bus stop — Far Away Place");
    expect(transportText).toContain("308.4 mi");
    expect(transportText).not.toContain("No stations within 2 miles of the postcode point");
    expect(transportText).not.toContain("No bus stops within 2 miles of the postcode point");
    const shops = section(view, "nearby", "shops");
    const shopsText = JSON.stringify(shops.blocks);
    expect(shopsText).toContain("Supermarket — Far Away Place");
    expect(shopsText).toContain("306.3 mi");
    expect(shopsText).not.toContain("a gap in the map is not proof that none exists");
    const hospitals = section(view, "nearby", "hospitals");
    const hospitalsText = JSON.stringify(hospitals.blocks);
    expect(hospitalsText).toContain("Far Away Place — A&E department");
    expect(hospitalsText).toContain("324.3 mi");
    expect(hospitalsText).not.toContain("No A&E hospitals within 2 miles of the postcode point");
    // Every far-beyond row carries a red pill (station,
    // bus-stop and supermarket on the everyday family,
    // A&E on the hospital family — all red past their
    // thresholds), and the brain's three-decimal miles
    // appear nowhere: the rows render one decimal.
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).toContain("place-row__miles--red");
    const text = allText(view);
    expect(text).not.toContain("279.258");
    expect(text).not.toContain("308.378");
    expect(text).not.toContain("306.32");
    expect(text).not.toContain("324.328");
    // The pill builder still reads the suppressed view:
    // no A&E pill — and no Train station pill — is struck
    // from a 324/279-mile pointer.
    const pillLabels = view.pills?.map((pill) => pill.label) ?? [];
    expect(pillLabels).not.toContain("A&E");
    expect(pillLabels).not.toContain("Train station");
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

describe("results — BUG-205/206/209 hierarchy fixes", () => {
  // BUG-205: the PETS section's three kinds each stand
  // under their own subheading — the "Vets" subheading
  // was never pushed, so the vet rows stood bare under
  // the section heading.
  it("BUG-205: the pets section carries Vets, Pet boarding and Pet shops subheadings, in that order", () => {
    const view = buildResultsView(input());
    const pets = section(view, "family", "pets");
    const subs = pets.blocks
      .filter((b) => b.type === "subheading")
      .map((b) => (b as { text: string }).text);
    expect(subs).toEqual(["Vets", "Pet boarding (kennels & catteries)", "Pet shops"]);
    // The Vets subheading stands first, before the vets rows.
    expect(pets.blocks[0]).toEqual({ type: "subheading", text: "Vets" });
  });

  it("BUG-205: the rendered page shows the Vets subheading as an h4", () => {
    const view = buildResultsView(input());
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).toContain('<h4 class="results-subheading">Vets</h4>');
  });

  // BUG-206: the census headlines' detail bullets sit
  // one level in under their group bullet. The fixture
  // mirrors the founder's screenshot (70% own, 38%
  // outright, 32% mortgage, 14% social, 15% private;
  // median age 43.6; 95 in 100 White, Mixed 2.6,
  // Asian 1.3; 70% detached or semi, 14% flats;
  // deprivation genuinely unfiled).
  const servedCensus = {
    state: "served",
    line: null,
    msoaCode: "E02012345",
    msoaName: "Braintree 001",
    residentsTotal: 8100,
    householdsTotal: 3100,
    medianAge: { value: 43.6, calculated: true, line: "The median age is 43.6." },
    socialRented: { count: 434, total: 3100, pct: 14, line: "14% rent from a social landlord." },
    tables: [
      {
        code: "ts054",
        title: "Tenure",
        total: 3100,
        rows: [
          { label: "Owned", count: 2170, pct: 70 },
          { label: "Owned: Owns outright", count: 1178, pct: 38 },
          { label: "Owned: Owns with a mortgage or loan", count: 992, pct: 32 },
          { label: "Social rented", count: 434, pct: 14 },
          { label: "Private rented", count: 465, pct: 15 },
        ],
        groups: null,
      },
      {
        code: "ts021",
        title: "Ethnic group",
        total: 8100,
        rows: [],
        groups: [
          { label: "White", count: 7695, pct: 95 },
          { label: "Mixed or Multiple ethnic groups", count: 211, pct: 2.6 },
          { label: "Asian, Asian British or Asian Welsh", count: 105, pct: 1.3 },
        ],
      },
      {
        code: "ts044",
        title: "Accommodation type",
        total: 3100,
        rows: [
          { label: "Detached", count: 1240, pct: 40 },
          { label: "Semi-detached", count: 930, pct: 30 },
          { label: "Whole house or bungalow: Flat, maisonette or apartment", count: 434, pct: 14 },
        ],
        groups: null,
      },
    ],
    sourceLine: "Census 2021",
  } as unknown as CensusSection;

  const baseArea = areaBundle();
  if (baseArea.kind !== "area-bundle") throw new Error("expected an area-bundle fixture");

  const censusView = () =>
    buildResultsView(
      input({
        area: {
          ...baseArea,
          sections: {
            ...baseArea.sections,
            census: servedCensus,
            imd: {
              state: "not-filed",
              line: "No deprivation index figure is filed for this area.",
              decile: null,
            } as unknown as ImdSection,
          },
        },
      }),
    );

  it("BUG-206: the census detail bullets carry sub: true under their group bullets; groups and Deprivation do not", () => {
    const view = censusView();
    const census = section(view, "neighbourhood", "census");
    const list = census.blocks.find((b) => b.type === "list");
    expect(list).toBeDefined();
    if (list?.type !== "list") return;
    const byText = (text: string) => list.items.find((i) => i.text === text);
    expect(byText("7 in 10 households own their home.")?.sub).toBeUndefined();
    expect(byText("38% own outright.")?.sub).toBe(true);
    expect(byText("32% own with a mortgage.")?.sub).toBe(true);
    expect(byText("14% rent from a social landlord.")?.sub).toBe(true);
    expect(byText("15% rent privately.")?.sub).toBe(true);
    expect(byText("The typical age is 43.6.")?.sub).toBeUndefined();
    expect(byText("95 in 100 residents are White.")?.sub).toBe(true);
    expect(
      byText("The next largest groups are Mixed (2.6 in 100) and Asian (1.3 in 100).")?.sub,
    ).toBe(true);
    expect(byText("Nearly 7 in 10 are detached or semi-detached houses.")?.sub).toBeUndefined();
    expect(byText("About 1 in 7 is a flat.")?.sub).toBe(true);
    // Deprivation stands alone, with no sub-bullets.
    expect(byText("No deprivation index figure is filed for this area.")?.sub).toBeUndefined();
  });

  it("BUG-206: the rendered page marks the detail bullets with the sub class", () => {
    const view = censusView();
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).toContain('class="results-list__item results-list__item--sub"');
    expect(html).toContain("38% own outright.");
    expect(html).toContain("About 1 in 7 is a flat.");
  });

  // BUG-209: in COSTS, the EV charging point is a row
  // among the Costs rows with the bold "EV charging"
  // lead (the sample's form) — never a bare place row
  // under "EPC & energy" — and the "None within 5
  // miles..." line is gone: it duplicated the entry
  // below it.
  const evBeyondView = () =>
    buildResultsView(
      input({
        nearby: nearbyWith({
          "ev-chargers": category({
            category: "ev-chargers",
            state: "none-within",
            places: [],
            countWithin: 0,
            beyondNearest: {
              name: "Shell Recharge/Ubitricity",
              miles: 13.9,
              latitude: 51.7,
              longitude: 0.6,
            },
            line: "none within 5 miles — nearest is Shell Recharge/Ubitricity, 13.9 miles away",
          }),
        }),
      }),
    );

  it("BUG-209: a beyond-nearest charger renders as the EV row in Costs, with no None-within line and no bare place row", () => {
    const view = evBeyondView();
    const costs = section(view, "home", "costs");
    const evRow = costs.blocks.find(
      (b) => b.type === "tagged-line" && (b as { lead?: string }).lead === "EV charging",
    );
    expect(evRow).toBeDefined();
    if (evRow?.type !== "tagged-line") return;
    expect(evRow.texts).toEqual(["Nearest public charge point — Shell Recharge/Ubitricity."]);
    expect(evRow.miles).toEqual({ text: "13.9 mi", band: "red" });
    const text = JSON.stringify(costs.blocks);
    expect(text).not.toContain("None within 5 miles");
    expect(text).not.toContain("nearest is Shell Recharge/Ubitricity, 13.9 miles away");
    expect(costs.blocks.some((b) => b.type === "places")).toBe(false);
  });

  it("BUG-209: the rendered page shows the EV row with its 13.9 mi pill and no None-within line", () => {
    const view = evBeyondView();
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).toContain("EV charging");
    expect(html).toContain("Nearest public charge point — Shell Recharge/Ubitricity.");
    expect(html).toContain("13.9 mi");
    expect(html).not.toContain("None within 5 miles");
  });

  it("BUG-209: a within-range charger renders the same EV row form with the nearest", () => {
    const view = buildResultsView(
      input({
        nearby: nearbyWith({
          "ev-chargers": category({
            category: "ev-chargers",
            state: "within",
            places: [
              { latitude: 51.7, longitude: 0.6, name: "Roam Charging", miles: 1.8, detail: null },
            ],
            countWithin: 1,
          }),
        }),
      }),
    );
    const costs = section(view, "home", "costs");
    const evRow = costs.blocks.find(
      (b) => b.type === "tagged-line" && (b as { lead?: string }).lead === "EV charging",
    );
    expect(evRow).toBeDefined();
    if (evRow?.type !== "tagged-line") return;
    expect(evRow.texts).toEqual(["Nearest public charge point — Roam Charging."]);
    expect(evRow.miles).toEqual({ text: "1.8 mi", band: "orange" });
  });
});

describe("results — BUG-247 district and place links", () => {
  // The census section's foot carries the wider links:
  // the district link always at rung 1, the place link
  // only where the page resolved the home's town to a
  // filed place. The default input() carries no census,
  // so it exercises the not-served branch; the minimal
  // served census below exercises the served branch.
  const servedCensusMinimal = {
    state: "served",
    tables: [],
    residentsTotal: null,
    sourceLine: "Census 2021",
  } as unknown as CensusSection;

  const linksOf = (view: ReturnType<typeof buildResultsView>) =>
    section(view, "neighbourhood", "census").blocks.filter((b) => b.type === "link");

  const viewWithServedCensus = (overrides: Partial<ResultsInput> = {}) => {
    const baseArea = areaBundle();
    if (baseArea.kind !== "area-bundle") throw new Error("expected an area-bundle fixture");
    return buildResultsView(
      input({
        area: {
          ...baseArea,
          sections: { ...baseArea.sections, census: servedCensusMinimal },
        },
        ...overrides,
      }),
    );
  };

  it("rung 1 with a place: the census section ends with the district link and the place link", () => {
    const view = viewWithServedCensus({ placeName: "Hatfield Peverel" });
    const links = linksOf(view);
    expect(links).toEqual([
      { type: "link", label: "Wider area — CM3", url: "/search?outward=CM3" },
      { type: "link", label: "Hatfield Peverel", url: "/search?place=Hatfield+Peverel" },
    ]);
    // The links stand last in the section, after the data.
    const census = section(view, "neighbourhood", "census");
    expect(census.blocks.slice(-2)).toEqual(links);
  });

  it("rung 1 with a place, census not served: both links still stand", () => {
    const view = buildResultsView(input({ placeName: "Hatfield Peverel" }));
    expect(linksOf(view)).toEqual([
      { type: "link", label: "Wider area — CM3", url: "/search?outward=CM3" },
      { type: "link", label: "Hatfield Peverel", url: "/search?place=Hatfield+Peverel" },
    ]);
  });

  it("rung 1 without a place: only the district link, never a dead place link", () => {
    const view = viewWithServedCensus();
    expect(linksOf(view)).toEqual([
      { type: "link", label: "Wider area — CM3", url: "/search?outward=CM3" },
    ]);
  });

  it("rung 2 carries no wider links: no single home whose town they could name", () => {
    const view = buildResultsView(
      input({
        resolution: {
          rung: 2,
          kind: "address-list",
          directory,
          street: null,
          building: null,
          addresses: [],
        },
        placeName: "Hatfield Peverel",
      }),
    );
    expect(linksOf(view)).toEqual([]);
  });

  it("the rendered page carries both links as anchors with the right destinations", () => {
    const view = viewWithServedCensus({ placeName: "Hatfield Peverel" });
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).toContain('href="/search?outward=CM3"');
    expect(html).toContain("Wider area — CM3");
    expect(html).toContain('href="/search?place=Hatfield+Peverel"');
    expect(html).toContain("Hatfield Peverel");
  });
});

describe("results — BUG-211 straight-line wording", () => {
  // BUG-211: the straight-line explanation lives once,
  // in How We Check — never on a report surface. The
  // default fixture carries beyond-nearest lines (A&E,
  // maternity) that used to print the parenthetical.
  it("BUG-211: the free page carries no straight-line parenthetical anywhere", () => {
    const view = buildResultsView(input());
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).not.toContain("(straight-line distance from the postcode point)");
    expect(html).not.toContain("straight-line distance from the postcode point");
    expect(JSON.stringify(view)).not.toContain("straight-line distance from the postcode point");
  });

  it("BUG-211: the explanation lives exactly once, in How We Check, and not in the disclaimers", () => {
    const howText = HOW_WE_CHECK_CARDS.map((c) => `${c.howLabel ?? ""} ${c.howText ?? ""}`).join(
      " ",
    );
    expect(howText.match(/straight-line/g) ?? []).toHaveLength(1);
    expect(howText).toContain("How distances are measured:");
    expect(howText).toContain("every distance on the site is straight-line — as the crow flies");
    expect(DISCLAIMER_CLOSING_BLOCK).not.toContain("straight-line");
  });
});

describe("results — BUG-213 none-within preamble", () => {
  // BUG-213: where the named entry below carries the
  // nearest with its distance pill, the "None within"
  // preamble line is gone — the sample shows the entry
  // alone (Sample 3 Tabs 1 and 4; View 7 Section 5).
  // The default fixture carries beyond-nearest A&E and
  // maternity (4.2 and 5.9 miles) — both inside the
  // 25-mile guard; the A&E row renders and the maternity
  // group sits behind the strip (BUG-213 hospitals
  // ruling, below).
  it("BUG-213: the free page carries no None-within preamble where a named entry carries the nearest", () => {
    const view = buildResultsView(input());
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).not.toContain("None within");
    expect(html).not.toContain("none within");
    expect(JSON.stringify(view)).not.toContain("None within");
    // The entries themselves still stand, with pills.
    expect(html).toContain("Broomfield Hospital");
    expect(html).toContain("4.2 mi");
  });

  it("BUG-213 far-beyond ruling: a far-beyond GP is named as a row with a red pill — the unnamed line is gone", () => {
    // Founder ruling 24 Nov 2026: past the 25-mile guard
    // the nearest GP is NAMED on the free page — the row
    // carries the name and a red distance pill. The
    // checking feed keeps the guard (see the feed pin
    // below), and the summary pills keep it too.
    const bundle = nearbyWith({
      gp: category({
        category: "gp",
        label: "GP surgeries",
        state: "none-within",
        places: [],
        countWithin: 0,
        beyondNearest: {
          name: "Far Away Surgery",
          miles: 30,
          latitude: 51.7,
          longitude: 0.6,
        },
        line: "none within 2 miles — nearest is Far Away Surgery, 30 miles away",
      }),
    });
    const view = buildResultsView(input({ nearby: bundle }));
    const health = section(view, "nearby", "health");
    const text = JSON.stringify(health.blocks);
    expect(text).toContain("GP — Far Away Surgery");
    expect(text).toContain("30 mi");
    expect(text).toContain('"band":"red"');
    expect(text).not.toContain("No GP surgeries within 2 miles of the postcode point");
    expect(text).not.toContain("None within");
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).toContain("Far Away Surgery");
    expect(html).toContain("place-row__miles--red");
    // The checking screen is unchanged: its feed still
    // runs the guard, so the same GP lands on the
    // unnamed no-finding line there, never the name.
    const feed = nearbyCheckingGroups(bundle);
    expect(feed.health.state).toBe("done");
    expect(feed.health.line).toBe("no GP surgeries within 2 miles of the postcode point");
    expect(feed.health.line).not.toContain("Far Away Surgery");
  });
});

describe("results — BUG-213 hospitals maternity behind the strip", () => {
  // BUG-213 ruling (founder, 24 Nov 2026): the maternity
  // group never renders as visible rows on the free page —
  // it sits behind the section's strip ("Plus maternity,
  // community hospital & more hospitals") in every case,
  // as Sample 3 Tab 4 shows the A&E row only. This
  // retires item 28's dedup, which suppressed the
  // maternity group only when its lead place WAS the A&E
  // lead place — a different nearest maternity unit used
  // to serve as a second visible row.
  it("BUG-213: a different nearest maternity unit renders behind the strip, not as a row", () => {
    const view = buildResultsView(
      input({
        nearby: nearbyWith({
          ae: category({
            category: "ae",
            state: "none-within",
            places: [],
            countWithin: 0,
            beyondNearest: {
              name: "Broomfield Hospital",
              miles: 4.213,
              latitude: 51.7,
              longitude: 0.6,
            },
            line: "none within 2 miles — nearest is Broomfield Hospital, 4.213 miles away",
          }),
          maternity: category({
            category: "maternity",
            state: "within",
            places: [
              {
                name: "St Peter's Hospital",
                miles: 3.4,
                latitude: 51.7,
                longitude: 0.6,
                detail: null,
                cqcRating: { rating: "Good", date: "2024-12-19" },
              },
            ],
            countWithin: 1,
          }),
        }),
      }),
    );
    const hospitals = section(view, "nearby", "hospitals");
    const text = JSON.stringify(hospitals.blocks);
    // The A&E row stands, and the strip speaks for maternity.
    expect(text).toContain("Broomfield Hospital");
    expect(text).toContain("Plus maternity, community hospital & more hospitals");
    // No maternity group anywhere in the section — neither
    // its heading nor its place name.
    expect(text).not.toContain("Maternity units");
    expect(text).not.toContain("St Peter's Hospital");
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).not.toContain("St Peter's Hospital");
  });

  it("BUG-213: the identical-nearest case (Birkdale) is unchanged — one A&E row plus the strip", () => {
    const view = buildResultsView(input());
    const hospitals = section(view, "nearby", "hospitals");
    const placesBlocks = hospitals.blocks.filter((block) => block.type === "places");
    expect(placesBlocks).toHaveLength(1);
    const only = placesBlocks[0];
    expect(only?.type).toBe("places");
    if (only?.type === "places") expect(only.group.heading).toBe("A&E hospitals");
    const text = JSON.stringify(hospitals.blocks);
    expect(text).toContain("Broomfield Hospital");
    expect(text).toContain("Plus maternity, community hospital & more hospitals");
    expect(text).not.toContain("Maternity units");
  });
});

describe("results — the rendered page", () => {
  it("keeps the one-tier section headings on the home surface (BUG-218: district only)", () => {
    const view = buildResultsView(input());
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    // Every home section still renders its single
    // <h3 class="results-section__heading"> — the
    // district page's removal (BUG-218) must not leak
    // into the per-home report.
    const headings = html.match(/results-section__heading/g) ?? [];
    expect(headings).toHaveLength(view.tabs.flatMap((tab) => tab.sections).length);
    expect(html).not.toContain("district-sect");
  });

  it("renders the D75 pills, the closing block, the buy bar and the calculators", () => {
    const view = buildResultsView(input());
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).toContain("pill pill--summary");
    // The D9 short form verbatim beside the results
    // (D66; M7.4's Disclaimer (D9) line): under the
    // strip, above the tabs — and the closing block
    // stands at the foot as a separate instance. The
    // parity batch's item 16 removed the line against
    // the Master's HTML and this pin asserted its
    // absence; CI #222 reversed both: where the Final
    // Design and a decision differ, the decision
    // governs (M7.4's check line).
    expect(html).toContain(`<p class="results-disclaimer-short">${DISCLAIMER_SHORT_FORM}</p>`);
    const stripAt = html.indexOf("results-strip");
    const shortFormAt = html.indexOf("results-disclaimer-short");
    const tabsAt = html.indexOf("Family Checks");
    expect(shortFormAt).toBeGreaterThan(stripAt);
    expect(shortFormAt).toBeLessThan(tabsAt);
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
    // Truncation rows carry the M7.6 link contract:
    // postcode + home key, the identity the door resolves.
    // Item 14 (parity fix batch): the row is the sample's
    // merged truncRow — lead, detail, the £4.99 chip and
    // the arrow as separate parts.
    expect(html).toContain(
      '<a class="trunc-row trunc-row--merged" href="/report?postcode=CM3+2JT&amp;home=19%7C%7CBIRKDALE+RISE"><span class="trunc-row__main"><span class="trunc-row__lead">Plus 3 more primary schools</span><span class="trunc-row__detail">All 5, with their Ofsted ratings and inspection dates.</span></span><span class="trunc-row__cta"><span class="trunc-row__price">£4.99</span> <span class="trunc-row__arrow">Get the full report →</span></span></a>',
    );
    // The buy bar: the mystery tease rides inside it, and
    // its button is the UNPRICED form on the contract href
    // (item 19: the priced form is only the results-head
    // button).
    expect(html).toContain("A mystery extra");
    expect(html).toContain(
      "Every report comes with a mystery extra, on us — it arrives in your email with your report.",
    );
    expect(html).toContain(
      '<a class="report-btn" href="/report?postcode=CM3+2JT&amp;home=19%7C%7CBIRKDALE+RISE">Get the full report</a>',
    );
    expect(html).not.toContain("Get the full report — £4.99");
    // The buy bar and the calculators sit below the tabs.
    expect(html).toContain("Get the full detailed report for this home");
    expect(html).toContain("the flood findings with location maps");
    expect(html).not.toContain("flood map pictures");
    expect(html).toContain("Could this home fit your life?");
  });

  it("BUG-022: the grammar block stands after the Secondary group's plus row, in its own block — now its own section (FC-05), in the sample's row form (FC-04)", () => {
    const view = buildResultsView(
      input({
        nearby: nearbyWith({
          "schools-secondary": category({
            category: "schools-secondary",
            state: "within",
            places: [
              {
                latitude: 51.7,
                longitude: 0.6,
                name: "Maltings Academy",
                miles: 1.87,
                detail: null,
                sixthForm: true,
              },
            ],
            countWithin: 3,
            nearestSelective: { name: "King Edward VI Grammar School", miles: 6.1 },
            nearestSelectiveLine: null,
          }),
        }),
      }),
    );
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    const secondaryAt = html.indexOf("Secondary schools");
    const grammarAt = html.indexOf("place-group__grammar");
    expect(secondaryAt).toBeGreaterThan(-1);
    expect(grammarAt).toBeGreaterThan(secondaryAt);
    // Re-pinned (FC-05, BUG-154): the grammar block
    // stands in its OWN section, headed "Selective
    // schools", after the secondary section. Re-pinned
    // (FC-04): the row wears the sample's form — the
    // school's name alone (no star, no "Grammar
    // schools — " prefix), the small "Entry by test."
    // line under it, the badge in the sample's grey.
    expect(html).toContain('data-section="selective"');
    expect(html).toContain("Selective schools");
    expect(html).toContain("King Edward VI Grammar School");
    expect(html).not.toContain("★ Grammar schools —");
    expect(html).toContain("Entry by test.");
    expect(html).toContain("badge badge--grey");
    // The group's own rows and its plus (truncation) row
    // both precede the standalone grammar block.
    const rowAt = html.indexOf("Maltings Academy", secondaryAt);
    const plusAt = html.indexOf("trunc-row", secondaryAt);
    expect(rowAt).toBeGreaterThan(secondaryAt);
    expect(plusAt).toBeGreaterThan(rowAt);
    expect(grammarAt).toBeGreaterThan(plusAt);
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
      "School places are never promised and catchments are not guaranteed — check council and school admissions, apply by 31 Oct (secondary) / 15 Jan (primary). GP lists and NHS dentist places open and close. Pet data from OpenStreetMap may be incomplete. Air quality, noise and solar are modelled. This result is information, not advice. Full method, sources and disclaimers:",
    );
  });
});

describe("results — M7.11 figures in place (D-1/D-2/O-3)", () => {
  it("D-1: the broadband line in Costs carries the sample's varies-by-provider caveat", () => {
    const view = buildResultsView(input());
    const costs = section(view, "home", "costs");
    const text = JSON.stringify(costs.blocks);
    expect(text).toContain(
      `98% of homes in this postcode can get gigabit broadband — ${BROADBAND_CAVEAT}`,
    );
    expect(BROADBAND_CAVEAT).toBe("the exact package at this home varies by provider");
  });

  it("D-2: the rivers & sea absence state gains the publisher's annual-chance explanation", () => {
    // The publisher's own Very-low definition words
    // (lib/flood.ts's pinned table), never retyped here.
    expect(FLOOD_ROFRS_ABSENCE_LINE).toBe(
      "The Very low band means a chance of flooding in any given year of less than 1 in 1,000.",
    );
    const view = buildResultsView(input());
    const flood = section(view, "home", "flood");
    const text = JSON.stringify(flood.blocks);
    // Re-pinned (parity fix batch, item 25): the verdict
    // row carries the definition in the Master's
    // verdict-led form — "Very low — a chance of flooding
    // in any given year of less than 1 in 1,000." The D-2
    // principle stands (the absence state explains itself
    // in the publisher's words); the dataset-wording line
    // no longer renders on this page.
    expect(text).toContain(
      "Very low — a chance of flooding in any given year of less than 1 in 1,000.",
    );
    expect(text).not.toContain("no river or sea flood band is published for this postcode point");
  });

  it("D-2: the surface-water below-lowest-band state gains the sample's extreme-picture line", () => {
    expect(FLOOD_ROFSW_ABSENCE_LINE).toBe(
      "This postcode appears only in the extreme 1-in-1,000-year surface-water picture.",
    );
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
            "no surface-water band reaches this point — below the lowest band this product publishes",
          ),
        ],
      },
    });
    const view = buildResultsView(
      input({ short: { rung: 1, kind: "short-bundle", postcode: "CM3 2JT", sections } }),
    );
    const text = JSON.stringify(section(view, "home", "flood").blocks);
    // Item 25 form: the absence sentence rides inside the
    // verdict after "Very low — ", lower-cased as the
    // Master's row writes it.
    expect(text).toContain(
      "Very low — this postcode appears only in the extreme 1-in-1,000-year surface-water picture.",
    );
    expect(text).toContain(
      "Very low — a chance of flooding in any given year of less than 1 in 1,000.",
    );
  });

  it("D-2: a layer inside a band gains no absence explanation", () => {
    const sections = shortSections({
      flood: {
        state: "served",
        liveWarnings: null,
        layers: [
          floodLayer("flood_zone", "zone-1", null, "this postcode point is in Flood Zone 1"),
          {
            ...floodLayer("rofrs", "inside", "Low", "a Low river band covers this point"),
            coveringDefinition:
              "a chance of flooding in any given year between 1 in 1,000 and 1 in 100",
          },
          floodLayer(
            "rofsw",
            "below-lowest-band",
            null,
            "no surface-water band reaches this point — below the lowest band this product publishes",
          ),
        ],
      },
    });
    const view = buildResultsView(
      input({ short: { rung: 1, kind: "short-bundle", postcode: "CM3 2JT", sections } }),
    );
    const text = JSON.stringify(section(view, "home", "flood").blocks);
    expect(text).not.toContain(FLOOD_ROFRS_ABSENCE_LINE);
    // The inside layer's verdict is its own band plus the
    // band's definition — no absence form anywhere in it.
    expect(text).toContain(
      "Low — a chance of flooding in any given year between 1 in 1,000 and 1 in 100.",
    );
    expect(text).toContain(
      "Very low — this postcode appears only in the extreme 1-in-1,000-year surface-water picture.",
    );
  });

  it("O-3: the sixth-form no form reads 'sixth form: no' (BUG-250 item 24 — no filing language)", () => {
    const secondary = category({
      category: "schools-secondary",
      state: "within",
      places: [
        {
          latitude: 51.7,
          longitude: 0.6,
          name: "No Sixth School",
          miles: 1.2,
          detail: null,
          sixthForm: false,
          urn: "2",
        },
      ],
      countWithin: 1,
      nearestSelective: null,
      nearestSelectiveLine: null,
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
    // The no form rides inside the row's detail line
    // (parity fix batch, item 29) — plain words since
    // BUG-250 item 24, 24 Nov 2026: the ", as filed"
    // tail was internal language on a consumer-facing
    // line.
    expect(group.rows[0].detail).toBe("sixth form: no");
  });
});

describe("results — calculators in the view (M7.10 G1/G2)", () => {
  const resolutionFor = (lsoaCode: string, postcode: string): AddressResolution => ({
    rung: 2,
    kind: "address-list",
    directory: { ...directory, postcode, lsoaCode },
    street: null,
    building: null,
    addresses: [],
  });

  it("the view threads the home's nation into the calculators (G1)", () => {
    expect(buildResultsView(input()).calculators?.nation).toBe("england");
    expect(
      buildResultsView(input({ resolution: resolutionFor("S01000001", "EH1 1AD") })).calculators
        ?.nation,
    ).toBe("scotland");
    expect(
      buildResultsView(input({ resolution: resolutionFor("W01000001", "CF11 8AA") })).calculators
        ?.nation,
    ).toBe("wales");
    expect(
      buildResultsView(input({ resolution: resolutionFor("N01000001", "BT1 1AA") })).calculators
        ?.nation,
    ).toBe("northern-ireland");
  });

  it("Scotland renders the LBTT named line and no SDLT calculation; Wales renders the LTT line (G1)", () => {
    const scotland = renderToStaticMarkup(
      createElement(ResultsPage, {
        view: buildResultsView(input({ resolution: resolutionFor("S01000001", "EH1 1AD") })),
      }),
    );
    expect(scotland).toContain("Land and Buildings Transaction Tax");
    expect(scotland).toContain(
      "https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property",
    );
    expect(scotland).not.toContain("Calculate stamp duty");
    expect(scotland).toContain("Calculate monthly payment");

    const wales = renderToStaticMarkup(
      createElement(ResultsPage, {
        view: buildResultsView(input({ resolution: resolutionFor("W01000001", "CF11 8AA") })),
      }),
    );
    expect(wales).toContain("Land Transaction Tax");
    expect(wales).toContain("https://www.gov.wales/land-transaction-tax-guide");
    expect(wales).not.toContain("Calculate stamp duty");
  });
});

describe("results — About these checks (M7.12)", () => {
  it("every link resolves within CHECK_PAGE_PATHS and carries the check page's own name", () => {
    const view = buildResultsView(input());
    expect(view.checkLinks.length).toBeGreaterThan(0);
    for (const link of view.checkLinks) {
      // The one exception is the census section's hub
      // link (NB-09): it names the How-we-check page,
      // not a check page. The dedicated case below pins
      // its label and position.
      if (link.href === HOW_WE_CHECK_PATH) continue;
      expect(CHECK_PAGE_PATHS).toContain(link.href);
      expect(link.label).toBe(CHECK_PAGES[link.href].name);
    }
    // Deduped: no check page appears twice.
    expect(new Set(view.checkLinks.map((link) => link.href)).size).toBe(view.checkLinks.length);
  });

  it("the census section contributes its hub link, in section order (NB-09, settled in BUG-143)", () => {
    const section = (key: string) =>
      ({ key, heading: key, blocks: [], sourceLine: null }) as ResultsTabView["sections"][number];
    const tabs = [
      {
        id: "neighbourhood",
        label: "The Neighbourhood",
        sections: [section("census"), section("crime")],
      },
    ] as ResultsTabView[];
    expect(checkLinksForTabs(tabs)).toEqual([
      { label: "The neighbourhood in numbers", href: HOW_WE_CHECK_PATH },
      { label: CHECK_PAGES["/check/crime"].name, href: "/check/crime" },
    ]);
  });

  it("covers every mapped section the view carries, in tab order", () => {
    const view = buildResultsView(input());
    expect(view.checkLinks.map((link) => link.href)).toEqual([
      "/check/schools",
      "/check/family-essentials",
      // The census section's hub link (NB-09).
      "/how-we-check",
      "/check/crime",
      "/check/air-quality",
      "/check/noise",
      "/check/sold-prices",
      "/check/council-tax-band",
      "/check/epc",
      "/check/ev-charging",
      "/check/broadband",
      "/check/mobile-coverage",
      "/check/flood-risk",
      "/check/planning-constraints",
      "/check/public-transport",
    ]);
  });

  it("renders as a pill strip, last on the page, with the closing disclaimer directly under the tabs — and nowhere else (BUG-143)", () => {
    const view = buildResultsView(input());
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    // The pull-down is gone; the links stand as pills.
    expect(html).not.toContain("<details");
    expect(html).not.toContain("about-checks");
    expect(html).toContain("check-pills");
    expect(html).toContain("About these checks");
    const calculatorsAt = html.indexOf("Could this home fit your life?");
    const pillsAt = html.indexOf("check-pills");
    const closingAt = html.indexOf("results-disclaimer-closing");
    expect(calculatorsAt).toBeGreaterThan(-1);
    // The closing disclaimer stands directly under the
    // results — before the calculators — and the pill
    // strip is the page's last furniture.
    expect(closingAt).toBeLessThan(calculatorsAt);
    expect(pillsAt).toBeGreaterThan(calculatorsAt);
    // The strip is the only home for these links: no
    // /check/ link appears anywhere before it.
    expect(html.slice(0, pillsAt)).not.toContain('href="/check/');
    for (const link of view.checkLinks) {
      expect(html).toContain(`<a class="check-pills__pill" href="${link.href}">${link.label}</a>`);
    }
  });

  it("the wider-area view carries no calculators (G2) but carries the pill strip, mapped the same way", () => {
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
    const view = buildWiderAreaView(widerShort);
    expect(view.calculators).toBeNull();
    expect(view.checkLinks.map((link) => link.href)).toEqual(
      buildResultsView(input()).checkLinks.map((link) => link.href),
    );
    const html = renderToStaticMarkup(createElement(ResultsPage, { view }));
    expect(html).not.toContain("Could this home fit your life?");
    expect(html).not.toContain("Calculate stamp duty");
    expect(html).toContain("check-pills");
    expect(html).toContain("About these checks");
  });
});
