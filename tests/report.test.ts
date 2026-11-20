import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportPage from "../components/ReportPage";
import type { AddressResolution } from "../lib/address";
import type { AreaBundle } from "../lib/area-bundle";
import type { CrimeBundle } from "../lib/crime";
import type { FloodBundle } from "../lib/flood";
import type { CategoryAnswer, NearbyBundle, NearbyCategory } from "../lib/nearby";
import {
  REPORT_DISCLAIMER_D9,
  REPORT_VIEW_ROUTE,
  buildReportView,
  reportViewGate,
  reportViewRoute,
  type ReportInput,
  type ReportView,
} from "../lib/report";
import { CATCHMENT_BLOCK_LINE } from "../lib/results";
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

const NOW = new Date("2026-11-19T12:00:00.000Z");

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
  directory: {
    postcode: "CM3 2JT",
    latitude: 51.776176,
    longitude: 0.60387,
    council: "Braintree",
    ward: "Witham South",
    region: "East of England",
    lsoaCode: "E01021395",
    msoaCode: "E02004463",
  },
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

function nearbyWith(
  overrides: Record<string, Partial<CategoryAnswer>> = {},
  industrial: boolean = true,
): NearbyBundle {
  const categories = ALL_CATEGORIES.map((key) =>
    category({
      category: key,
      state: "empty",
      line: `no ${key} filed near`,
      ...(overrides[key] ?? {}),
    }),
  );
  const bundle: NearbyBundle = {
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
  if (industrial) {
    bundle.industrialSites = {
      state: "served",
      dataYear: 2024,
      sourceName: "Environment Agency",
      sourceDate: "2026-01-15",
      basisLine: "BASIS-LINE",
      reportedLine: "REPORTED-LINE: releases as reported by the operator",
      thresholdLine: "THRESHOLD-LINE",
      line: "1 regulated industrial site within 2 miles of this postcode, as filed",
      sites: [
        {
          permitId: "P1",
          operator: "Example Chemicals Ltd",
          siteAddress: "1 Industrial Way",
          sitePostcode: "CM3 2AA",
          activityDescription: "Chemical plant",
          sector: "Chemicals",
          subSector: null,
          miles: 1.234,
          releases: [],
          belowThreshold: [],
          belowThresholdLine: null,
          noAirReturns: false,
          noAirReturnsLine: null,
        },
      ],
    };
  }
  return bundle;
}

const baseNearby = nearbyWith({
  "schools-primary": category({
    category: "schools-primary",
    label: "primary schools",
    state: "within",
    places: [
      {
        name: "St Andrew's Junior School",
        miles: 0.3,
        detail: "Ages 7–11 · Inspected — Good",
        latitude: 51.777,
        longitude: 0.604,
      },
    ],
    countWithin: 3,
  }),
  "schools-secondary": category({
    category: "schools-secondary",
    label: "secondary schools",
    state: "within",
    places: [
      {
        name: "Maltings Academy",
        miles: 1.8,
        detail: "Ages 11–18",
        latitude: 51.79,
        longitude: 0.62,
        sixthForm: true,
        urn: "135653",
        destinations: {
          ks4: {
            state: "served",
            cohortYear: "2022/23",
            cohortCount: 171,
            cohortLine: "COHORT-LINE: 171 leavers, 2022/23 cohort",
            sustainedLine: "SUSTAINED-LINE",
            overall: { value: 84.8, low: false },
            education: { value: 72.5, low: false },
            higherEducation: null,
            apprenticeships: { value: 5.3, low: false },
            employment: { value: 7.0, low: false },
          },
          ks5: null,
        },
      },
    ],
    countWithin: 1,
    nearestSelective: { name: "King Edward VI Grammar School", miles: 6.1 },
    nearestSelectiveLine:
      "the nearest selective secondary school is King Edward VI Grammar School — selective means admission by entrance test",
  }),
  "sixth-forms": category({
    category: "sixth-forms",
    label: "sixth forms and colleges",
    state: "within",
    places: [
      {
        name: "Chelmsford College",
        miles: 2.4,
        detail: "Further education",
        latitude: 51.73,
        longitude: 0.47,
      },
    ],
    countWithin: 1,
  }),
  gp: category({
    category: "gp",
    label: "GP surgeries",
    state: "within",
    places: [
      {
        name: "Fern House Surgery",
        miles: 0.6,
        detail: "The Street",
        latitude: 51.775,
        longitude: 0.6,
        cqcRating: { rating: "Good", date: "2024-12-19" },
      },
    ],
    countWithin: 1,
  }),
  dentist: category({
    category: "dentist",
    label: "dentists",
    state: "within",
    places: [
      {
        name: "Birkdale Dental",
        miles: 0.4,
        detail: null,
        latitude: 51.776,
        longitude: 0.602,
      },
    ],
    countWithin: 1,
  }),
  ae: category({
    category: "ae",
    label: "A&E hospitals",
    state: "none-within",
    places: [],
    countWithin: 0,
    beyondNearest: {
      name: "Broomfield Hospital",
      miles: 5.89,
      latitude: 51.774662,
      longitude: 0.466021,
    },
    line: "none within 2 miles — nearest is Broomfield Hospital, 5.89 miles away (straight-line distance from the postcode point)",
  }),
  station: category({
    category: "station",
    label: "stations",
    state: "within",
    places: [
      {
        name: "Hatfield Peverel Station",
        miles: 0.6,
        detail: null,
        latitude: 51.77,
        longitude: 0.59,
      },
    ],
    countWithin: 1,
  }),
  supermarket: category({
    category: "supermarket",
    label: "supermarkets",
    state: "within",
    places: [{ name: "Co-op", miles: 0.3, detail: null, latitude: 51.777, longitude: 0.605 }],
    countWithin: 2,
  }),
  parks: category({
    category: "parks",
    label: "parks",
    state: "within",
    places: [
      { name: "Birkdale Rise Green", miles: 0.2, detail: null, latitude: 51.778, longitude: 0.606 },
    ],
    countWithin: 1,
  }),
});

const soldServed: SoldPricesBundle = {
  rung: 1,
  kind: "sold-prices",
  postcode: "CM3 2JT",
  loadState: "found",
  recordedCount: 30,
  sourceName: "HM Land Registry",
  edition: "2026-10-28",
  sourceLine: "Source: HM Land Registry Price Paid Data, edition 28 October 2026",
  stateLine: null,
  median: {
    state: "served",
    value: 588995,
    counted: 29,
    spanFrom: "1996-12-20",
    spanTo: "2026-07-20",
    line: "the postcode median is £588,995",
    explainer: "MEDIAN-EXPLAINER: the middle of the counted category A sales",
  },
  recentSales: [
    {
      price: 588995,
      date: "2023-06-15",
      propertyType: "D",
      tenure: "F",
      newBuild: true,
      address: "19 Birkdale Rise",
    },
  ],
  recentLabel: "The most recent recorded sales in this postcode",
  building: null,
  ownHistory: [
    {
      price: 588995,
      date: "2023-06-15",
      propertyType: "D",
      tenure: "F",
      newBuild: true,
      address: "19 Birkdale Rise",
    },
  ],
  ownLine: null,
  ownExplainer: "OWN-EXPLAINER: recorded sales only — not a valuation of this home",
};

const crimeServed: CrimeBundle = {
  rung: 1,
  kind: "crime",
  postcode: "CM3 2JT",
  crime: {
    state: "served",
    total: 330,
    totalLine: "330 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
    windowFrom: "2025-10",
    windowTo: "2026-09",
    windowLine: "the 12 months from October 2025 to September 2026",
    categories: [
      { slug: "violent-crime", count: 120 },
      { slug: "anti-social-behaviour", count: 65 },
    ],
    months: [{ month: "2025-10", count: 22 }],
    basis: "BASIS: recorded against nearby streets",
    sourceName: "Police.uk",
    sourceLine: "Source: Police.uk street-level crime data",
    explainer: "CRIME-EXPLAINER",
    perHead: {
      residents: 6380,
      per1000: 51.7,
      line: "51.7 recorded crimes for every 1,000 residents here",
      basisLine: "PERHEAD-BASIS",
    },
    englandFigure: {
      englandPer1000: 94.5,
      multiple: 0.55,
      line: "across England, the figure is 94.5 for every 1,000 residents",
    },
    calibrationExplainer: "CALIBRATION-EXPLAINER",
    staleLine: null,
  },
};

const floodServed: FloodBundle = {
  rung: 1,
  kind: "flood",
  postcode: "CM3 2JT",
  flood: {
    state: "served",
    liveWarnings: {
      state: "warnings",
      checkedAt: "16:35 on 15 November 2026",
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
      overflowCount: null,
      overflowLine: null,
      attributionLine:
        "Contains public sector information licensed under the Open Government Licence v3.0.",
      link: {
        label: "Check the current flood warnings (GOV.UK)",
        url: "https://www.gov.uk/check-flooding",
      },
    },
    layers: [
      {
        layer: "flood_zone",
        title: "Flood zones",
        basisLine: "ZONE-BASIS",
        explainer: "ZONE-EXPLAINER",
        pointState: "zone-1",
        line: "this postcode point is in Flood Zone 1",
        covering: null,
        remainder: null,
        proximity: [],
        beyondNearest: null,
        beyondLine: null,
        sourceName: "Environment Agency",
        sourceDate: "2026-10-01",
        sourceLine: "Source: EA flood zones",
      },
      {
        layer: "rofrs",
        title: "Flooding from rivers & sea",
        basisLine: "ROFRS-BASIS",
        explainer: "ROFRS-EXPLAINER",
        pointState: "no-band-published",
        line: "no band is published at this point",
        covering: null,
        remainder: null,
        proximity: [],
        beyondNearest: null,
        beyondLine: null,
        sourceName: "Environment Agency",
        sourceDate: "2026-10-01",
        sourceLine: "Source: EA rivers & sea",
      },
      {
        layer: "rofsw",
        title: "Flooding from surface water",
        basisLine: "ROFSW-BASIS",
        explainer: "ROFSW-EXPLAINER",
        pointState: "below-lowest-band",
        line: "below the lowest mapped band at this point",
        covering: null,
        remainder: null,
        proximity: [],
        beyondNearest: null,
        beyondLine: null,
        sourceName: "Environment Agency",
        sourceDate: "2026-10-01",
        sourceLine: "Source: EA surface water",
      },
    ],
    defences: {
      state: "served",
      title: "Recorded flood defences",
      caveat: "DEFENCES-CAVEAT",
      bridgeLine: "DEFENCES-BRIDGE",
      defences: [
        {
          assetId: "A1",
          type: "Embankment",
          name: "River Chelmer embankment",
          protectionType: null,
          watercourse: "River Chelmer",
          maintainer: "Environment Agency",
          maintainerRecorded: true,
          condition: 3,
          conditionLine: "condition: Fair (grade 3 of 5)",
          designSop: null,
          designSopLine: null,
          designSopExplainer: null,
          designSopQuality: null,
          currentSop: null,
          currentSopLine: null,
          currentSopExplainer: null,
          miles: 1.1,
        },
      ],
      totalWithin: 1,
      overflowLine: null,
      line: null,
      sourceName: "Environment Agency",
      sourceDate: "2026-10-01",
      sourceLine: "Source: EA flood defences",
    },
    climate: {
      heading: "Climate outlook",
      basisLine: "CLIMATE-BASIS: UKCP18 RCP 8.5",
      caveatLine: "CLIMATE-CAVEAT",
      sources: [
        {
          source: "rofrs_cc",
          title: "Rivers & sea, climate outlook",
          scenarioLine: "ROFRS-SCENARIO",
          pointState: "no-band-published",
          band: null,
          line: "no band is published at this point in the outlook",
          sourceName: "Environment Agency",
          sourceDate: "2026-11-03",
          sourceLine: "Source: EA climate outlook",
        },
      ],
    },
    howWeCheck: "HOW-WE-CHECK-FLOOD",
  },
} as unknown as FloodBundle;

function meta(sourceLine: string | null) {
  return {
    depth: "report",
    grain: "postcode",
    grainLine: "this postcode",
    explainer: "EXPLAINER",
    sourceName: "Source",
    sourceDate: "2026-01-01",
    sourceLine,
  };
}

function areaWith(overrides: Record<string, unknown> = {}): AreaBundle {
  const polygon = (line: string) => ({
    layer: "layer",
    label: "Layer",
    state: "absence",
    line,
    insideName: null,
    insideDetail: null,
    nearest: null,
    beyondNearest: null,
    beyondLine: null,
    sourceName: "Source",
    sourceDate: "2026-01-01",
    sourceLine: null,
  });
  const sections = {
    constraints: {
      ...meta(null),
      state: "served",
      conservationArea: polygon("no conservation area at this point"),
      article4: polygon("no Article 4 direction at this point"),
      greenBelt: polygon("not in the green belt"),
      brownfield: {
        label: "Brownfield land",
        state: "none-found",
        within: [],
        countWithin: 0,
        beyondNearest: null,
        beyondLine: null,
        line: "no brownfield site filed within 2 miles",
        councilPublishes: true,
        sourceName: "Source",
        sourceDate: "2026-01-01",
        sourceLine: null,
      },
      builtUpArea: polygon("inside the built-up area"),
    },
    heritage: {
      ...meta(null),
      state: "served",
      listed: {
        state: "served",
        within: [{ listEntryId: "1", name: "Church of St Andrew", grade: "II*", miles: 0.4 }],
        nearest: null,
        countWithin: 102,
        beyondNearest: null,
        beyondLine: null,
        line: "102 listed buildings within 2 miles",
      },
      atPoint: { state: "none" },
      monuments: polygon("no scheduled monument at this point"),
      worldHeritageSites: polygon("no World Heritage Site at this point"),
      battlefields: polygon("no registered battlefield at this point"),
      protectedWrecks: polygon("no protected wreck at this point"),
      worldHeritageBufferZones: polygon("no buffer zone at this point"),
      localListsLine: null,
    },
    nature: {
      ...meta(null),
      state: "served",
      coverageLine: "COVERAGE-LINE",
      places: [],
      placesWithinCount: 0,
      beyondPlace: null,
      beyondLine: null,
      placesLine: "PLACES-LINE",
      designationsLine: null,
      ancientWoodland: polygon("no ancient woodland at this point"),
      ancientWoodlandInventoryLine: null,
      priorityHabitat: {
        state: "served",
        line: "PRIORITY-HABITAT-LINE",
        typesWithin: [],
        nearest: null,
        sourceName: "Source",
        sourceDate: "2026-01-01",
        sourceLine: null,
      },
    },
    epc: {
      ...meta("Source: EPC register"),
      state: "served",
      line: "Band B (85) is the headline rating at this postcode",
      certificates: [
        {
          certificateNumber: "0000-0000-0000-0000-0001",
          address: "19 Birkdale Rise, Hatfield Peverel",
          band: "B",
          rating: 85,
          ratingLine: "Band B (85), potential A (93)",
          potentialBand: "A",
          potentialRating: 93,
          floorAreaSqM: 118,
          dwellingType: "Detached house",
          assessmentType: "SAP",
          predicted: false,
          assessmentLabel: "Assessed (SAP)",
          registrationDate: "2023-05-09",
          solarFacts: [],
          energyCosts: {
            currentAnnualPence: 48900,
            currentAnnualLabel: "£489",
            currentMonthlyPence: 4075,
            currentMonthlyLabel: "£40.75",
            potentialAnnualPence: 45500,
            potentialAnnualLabel: "£455",
            potentialMonthlyPence: 3791,
            potentialMonthlyLabel: "£37.91",
            line: "Modelled energy costs: £489 a year (£40.75 a month)",
            potentialLine: "After the suggested improvements: £455 a year",
          },
          improvements: {
            state: "served",
            line: "IMPROVEMENTS-LINE",
            steps: [
              {
                sequence: 1,
                name: "Loft insulation",
                typicalSavingPence: 2000,
                typicalSavingLabel: "£20",
                indicativeCost: "£100–£350",
                energyRatingAfter: 87,
                environmentalRatingAfter: null,
                line: "1. Loft insulation — typical saving £20 a year, indicative cost £100–£350",
              },
              {
                sequence: 2,
                name: "Solar panels",
                typicalSavingPence: 1400,
                typicalSavingLabel: "£14",
                indicativeCost: "£5,000–£8,000",
                energyRatingAfter: 93,
                environmentalRatingAfter: null,
                line: "2. Solar panels — typical saving £14 a year, indicative cost £5,000–£8,000",
              },
            ],
            closingLine: "CLOSING-LINE: after all the steps, the rating reaches A (93)",
          },
          construction: null,
        },
      ],
      certificateCountAtPostcode: 26,
      headlineBand: "B",
      spread: {
        grainLine: "the postcode's recorded certificates",
        certificateCount: 26,
        explainer: "SPREAD-EXPLAINER: certificates, not homes",
        rows: [
          {
            kind: "assessed",
            count: 26,
            bands: [{ band: "B", count: 20, pct: 76.9 }],
            line: "SPREAD-LINE",
          },
        ],
      },
    },
    councilTax: {
      ...meta("Source: council tax data"),
      state: "served",
      line: "Council tax Band D average for Braintree is £2,145.00 a year",
      authority: "Braintree",
      taxYear: "2026/27",
      bandDAveragePence: 214500,
      bandDAverageLabel: "£2,145.00",
      components: [],
      parish: null,
      bands: [
        {
          band: "D",
          pence: 214500,
          labelPence: "£2,145.00",
          monthlyPence: 17875,
          monthlyLabelPence: "£178.75",
        },
      ],
      bandsLine: "BANDS-LINE: derived from Band D by the statutory ratios",
      monthlyLine: "£178.75 a month if the Band D average is spread evenly over 12 months",
      bandDMonthlyPence: 17875,
      bandDMonthlyLabel: "£178.75",
    },
    planningApplications: {
      ...meta(null),
      state: "handed-off",
      council: "Braintree",
      line: "planning applications for this area are published by Braintree District Council on its planning register",
      link: {
        label: "Search the register of planning decisions (GOV.UK)",
        url: "https://www.gov.uk/search-register-planning-decisions",
      },
    },
    buildingSafety: { ...meta(null), tribunal: {}, register: {} },
    census: {
      ...meta("Source: Census 2021"),
      state: "served",
      line: "CENSUS-LINE: Braintree 018 area — 8,139 residents",
      msoaCode: "E02004463",
      msoaName: "Braintree 018",
      residentsTotal: 8139,
      householdsTotal: 3398,
      medianAge: { value: 46.5, calculated: true, line: "MEDIAN-AGE-LINE: median age 46.5" },
      socialRented: {
        count: 210,
        total: 3397,
        pct: 6.2,
        line: "SOCIAL-RENTED-LINE: 6.2% of households rent from the council or a housing association",
      },
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
          rows: [{ label: "Owner-occupied", count: 2384, pct: 70.2 }],
          groups: null,
        },
      ],
    },
    imd: {
      ...meta("Source: Indices of Deprivation 2025"),
      state: "served",
      line: "Among the less deprived 30 percent of areas in England — the Hatfield Peverel area",
      lsoaCode: "E01021395",
      lsoaName: "Hatfield Peverel",
      decile: 8,
      summary: "Among the less deprived 30 percent of areas in England",
      domains: [{ key: "income", name: "Income", decile: 9 }],
    },
    air: {
      ...meta("Source: Defra air quality"),
      state: "served",
      line: "AIR-LINE",
      year: 2024,
      no2: 8.15,
      pm25: 7.12,
      pm10: 12.55,
      unit: "µg/m³",
      headlineFigure: { pollutant: "no2", value: 8.15, line: "HEADLINE-FIGURE" },
      yardsticks: {
        basisLine: "YARDSTICK-BASIS",
        pollutants: [
          {
            pollutant: "no2",
            value: 8.15,
            ukLimit: 40,
            whoGuideline: 10,
            position: "below-both",
            yardstickLine: "YARDSTICK-NO2: below the UK legal limit and the WHO guideline",
            summaryLine: null,
          },
        ],
      },
      aqma: {
        state: "none",
        line: "AQMA-NONE-LINE: no Air Quality Management Area within 2 miles",
        basisLine: "AQMA-BASIS",
        name: null,
        authority: null,
        pollutants: [],
        miles: null,
        filedCount: 12,
        sourceName: "Defra",
        sourceDate: "2026-01-01",
      },
    },
    noise: {
      ...meta("Source: Defra noise mapping"),
      state: "served",
      line: "NOISE-LINE",
      bands: [
        {
          sourceKind: "road",
          label: "Road noise",
          dayBand: "Below 55 dB",
          nightBand: "Below 50 dB",
          line: "road noise: Below 55 dB by day",
        },
      ],
      headlineBand: { sourceKind: "road", dayBand: "Below 55 dB" },
    },
    benefits: {
      ...meta("Source: DWP via Stat-Xplore"),
      state: "served",
      line: "BENEFITS-LINE",
      lsoaCode: "E01021395",
      series: [
        {
          series: "claimant_count",
          label: "Claimant count",
          state: "served",
          month: "2026-09",
          monthLabel: "September 2026",
          count: 15,
          pct: 1.6,
          pctState: "served",
          pctLine: null,
          line: "Claimant count, September 2026: 15 people — 1.6%.",
        },
      ],
      bases: { residents: 940, households: 890 },
      basesLine: "BASES-LINE",
    },
    solar: {
      ...meta("Source: PVGIS"),
      state: "served",
      line: "SOLAR-LINE: modelled yield 1,057.65 kWh per kWp",
      cellRef: "51.77,0.60",
      yieldKwhPerKwp: 1057.65,
      irradiationKwhM2: 1150,
      basis: {},
      basisLine:
        "SOLAR-BASIS: modelled for this location on the standard PVGIS basis, not a judgement on this home's roof",
    },
    broadband: {
      ...meta("Source: Ofcom"),
      state: "served",
      line: "BROADBAND-LINE: gigabit-capable broadband is available at this postcode",
      snapshot: "January 2026",
      gigabitCapablePct: 100,
      superfastLine: null,
      superfastPct: null,
      ultrafastLine: null,
      ultrafastPct: null,
      bands: [],
      bandsLine: "BANDS-LINE-BB",
      unclassifiedPct: null,
      unclassifiedLine: null,
    },
    mobile: {
      ...meta("Source: Ofcom"),
      state: "served",
      line: "MOBILE-LINE",
      council: "Braintree",
      snapshot: "January 2026",
      services: [
        {
          service: "data",
          label: "Data",
          state: "served",
          line: "DATA-LINE",
          outdoor: null,
          indoor: null,
        },
      ],
    },
    chargingZones: {
      ...meta("Source: charging zones data"),
      state: "outside",
      line: "not inside any Clean Air Zone, the London Ultra Low Emission Zone, or any Scottish Low Emission Zone in force on 1 November 2026",
      basisLine: "ZONES-BASIS",
      scheme: null,
      setDate: "2026-11-01",
      filedCount: 15,
    },
    ...overrides,
  };
  return { rung: 1, kind: "area-bundle", postcode: "CM3 2JT", sections } as unknown as AreaBundle;
}

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    resolution: birkdale,
    nearby: baseNearby,
    flood: floodServed,
    area: areaWith(),
    sold: soldServed,
    crime: crimeServed,
    now: NOW,
    ...overrides,
  };
}

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

  it("the Census tables render as published, the age table among them (a), and social rent stands as its own line (d)", () => {
    expect(s6).toContain("Age by five-year age bands — Census 2021");
    expect(s6).toContain("Tenure — Census 2021");
    expect(s6).toContain("SOCIAL-RENTED-LINE");
    expect(s6).toContain("SPREAD-EXPLAINER: certificates, not homes");
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
    // The map is an inline SVG picture — no tile service,
    // no image, no external basemap of any kind.
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("openstreetmap");
    expect(html).not.toContain("basemap");
  });
});
