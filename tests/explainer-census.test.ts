// The explainer census enforcement (plan step M6.18,
// decision D37, on D13).
//
// The register lives in tests/explainer-census.ts — a test
// artefact only; the explainers stay inside the served
// shapes. This suite builds ONE golden home's real bundles
// through the real builders over fake sources (the state
// matrix's pattern), at both depths, and runs the census
// in both directions:
//
//   direction one — every hard family's named line is
//     present and non-empty;
//   direction two — no note field appears on a
//     self-explanatory figure's own object (D13's second
//     direction is a real constraint: the founder's length
//     concern is policed by the same machinery);
//   fail-closed — the leaf walk: every numeric or labelled
//     leaf of every served bundle is a census entry or on
//     the not-a-figure allowlist, so a future figure
//     shipping unregistered fails here naming its path.
//
// The prospective census rows (63–67, for the sections
// built at M6.16/M6.17) were re-verified against the built
// shapes at this step: building safety's explainer and
// per-decision kind lines, broadband's availability
// explainer and named unclassified line, and mobile's
// council-named modelled lines all satisfy their rows as
// built — no row was contradicted.

import { describe, expect, it } from "vitest";

import type { AddressResolution, DirectoryPostcode, ResolvedAddress } from "../lib/address";
import {
  buildAreaBundle,
  type AreaDataSource,
  type BroadbandAnswerFacts,
  type CompanyOwnershipFacts,
  type DesignationFacts,
  type EpcArtefact,
  type EpcCertificate,
  type ListedFacts,
  type MobileAnswerFacts,
  type PhiFacts,
  type PlanningLayerFacts,
  type TribunalFacts,
} from "../lib/area-bundle";
import { buildCrimeBundle, type CrimeDataSource, type FiledCrimeAnswer } from "../lib/crime";
import { buildFloodBundle, type FloodDataSource, type FloodLayerFacts } from "../lib/flood";
import {
  buildNearbyBundle,
  type NearbyCategory,
  type NearbyDataSource,
  type NearbyPoint,
} from "../lib/nearby";
import { buildShortBundle } from "../lib/short-bundle";
import {
  buildSoldPricesBundle,
  type SoldPriceRow,
  type SoldPricesDataSource,
} from "../lib/sold-prices";
import { EXPLAINER_CENSUS, FIGURE_PATH_PATTERNS, findUnregisteredLeaves } from "./explainer-census";

// ------------------------------------------------------------------
// The golden home and its fake sources
// ------------------------------------------------------------------

const DIR: DirectoryPostcode = {
  postcode: "CM3 2JT",
  latitude: 51.7786,
  longitude: 0.5798,
  council: "Braintree",
  ward: null,
  region: null,
  lsoaCode: "E01021395",
  msoaCode: "E02004463",
};

const HOME: AddressResolution = {
  rung: 1,
  kind: "home",
  directory: DIR,
  address: {
    postcode: "CM3 2JT",
    paon: "19",
    saon: null,
    street: "BIRKDALE RISE",
    locality: null,
    town: "HATFIELD PEVEREL",
    label: "19 Birkdale Rise",
  } as ResolvedAddress,
};

function layerFacts(partial: Partial<PlanningLayerFacts>): PlanningLayerFacts {
  return {
    filedCount: 1000,
    covering: [],
    nearestWithin: [],
    nearestBeyond: null,
    sourceName: "Digital Land — planning.data.gov.uk",
    sourceDate: "2026-11-10",
    ...partial,
  };
}

function cert(partial: Partial<EpcCertificate> & { certificateNumber: string }): EpcCertificate {
  return {
    addressLine1: null,
    addressLine2: null,
    addressLine3: null,
    postTown: null,
    postcode: "CM3 2JT",
    uprn: null,
    band: null,
    ratingCurrent: null,
    potentialBand: null,
    totalFloorArea: null,
    dwellingType: null,
    assessmentType: null,
    registrationDate: null,
    ...partial,
  };
}

const EPC_ARTEFACT: EpcArtefact = {
  certificates: [
    cert({
      certificateNumber: "0000-0000-0000-0000-0001",
      addressLine1: "19 Birkdale Rise",
      band: "B",
      ratingCurrent: 85,
      potentialBand: "A",
      totalFloorArea: 141,
      assessmentType: "SAP",
      registrationDate: "2022-10-07",
      heatingCostCurrent: 1000,
      hotWaterCostCurrent: 200,
      lightingCostCurrent: 100,
      heatingCostPotential: 800,
      hotWaterCostPotential: 180,
      lightingCostPotential: 90,
    }),
    cert({
      certificateNumber: "0000-0000-0000-0000-0002",
      addressLine1: "21 Birkdale Rise",
      band: "C",
      ratingCurrent: 65,
      totalFloorArea: 90,
      assessmentType: "RdSAP",
      registrationDate: "2023-05-01",
    }),
  ],
  certificateCount: 2,
  sourceName: "Get energy performance of buildings data (MHCLG)",
  sourceDate: "2026-11-12",
  loadedAt: "2026-11-12T00:00:00.000Z",
};

const BROADBAND: BroadbandAnswerFacts = {
  basis: "All premises",
  snapshot: "2026-01",
  gigabitCapablePct: 87.4,
  superfast30Pct: 96.2,
  ultrafast100Pct: 91.5,
  ultrafast300Pct: 88.9,
  ngaPct: 12.34,
  unable2Pct: 0.11,
  unable5Pct: 0.22,
  unable10Pct: 0.33,
  unable30Pct: 3.21,
  unableDecentFixedOrFwaPct: 0.44,
  decentViaFwaPct: 0.55,
  speedBandPct: {
    under_2: 0.4,
    "2_to_5": 0.8,
    "5_to_10": 1.6,
    "10_to_30": 4.3,
    "30_to_300": 12.5,
    "300_plus": 69.3,
  },
};

const MOBILE: MobileAnswerFacts = {
  basis: "Local authority area",
  snapshot: "2026-01",
  laua: "E07000067",
  lauaName: "Braintree",
  services: {
    voice: {
      outdoor: { noOperatorPct: 0, allOperatorsPct: 99.29, atLeastOneOperatorPct: 100 },
    },
    "4g": {
      outdoor: { noOperatorPct: 0, allOperatorsPct: 99.04, atLeastOneOperatorPct: 100 },
      indoor: { noOperatorPct: 1, allOperatorsPct: 84.64, atLeastOneOperatorPct: 99 },
    },
    "5g_high_confidence": {
      outdoor: { noOperatorPct: 2.1, allOperatorsPct: 42.45, atLeastOneOperatorPct: 97.9 },
    },
  },
};

class CensusAreaSource implements AreaDataSource {
  async planningLayerFacts() {
    return layerFacts({});
  }
  async designationFacts(): Promise<DesignationFacts> {
    const empty = () => layerFacts({});
    return {
      byType: {
        sssi: layerFacts({
          nearestWithin: [{ id: 1, name: "Test SSSI Site", detail: null, miles: 0.5 }],
        }),
        sac: empty(),
        spa: empty(),
        ramsar: empty(),
      },
      overlaps: [],
    };
  }
  async listedFacts(): Promise<ListedFacts> {
    return {
      filedCount: 379169,
      within: [{ listEntryId: "100002", name: "Old Hall", grade: "II*", miles: 0.4 }],
      nearestBeyond: null,
      sourceName: "Historic England — National Heritage List for England",
      sourceDate: "2026-11-10",
    };
  }
  async phiFacts(): Promise<PhiFacts> {
    return {
      filedCount: 818225,
      nearest: { habitat: "Deciduous woodland", miles: 0.7 },
      typesWithin: ["Deciduous woodland"],
      sourceName: "Natural England — Priority Habitat Inventory",
      sourceDate: "2026-11-10",
    };
  }
  async article4Gate() {
    return false;
  }
  async epcArtefact() {
    return EPC_ARTEFACT;
  }
  async loadEpc() {
    throw new Error("not needed");
  }
  async councilTaxRow() {
    return {
      authorityName: "Braintree",
      nation: "england" as const,
      taxYear: "2026-27",
      bandDAreaAveragePence: 228034,
      parishAveraged: false,
      components: [{ role: "billing_authority", label: "Braintree", pence: 228034 }],
      sourceName: "MHCLG — Council Tax levels set by local authorities in England 2026 to 2027",
      sourceDate: "2026-03-25",
    };
  }
  async censusRow() {
    return {
      msoaCode: "E02004463",
      msoaName: "Braintree 018",
      stats: {
        ts007a: {
          total: 1000,
          categories: { "Aged 4 years and under": 100, "Aged 5 to 9 years": 200 },
        },
        ts021: { total: 990, categories: { White: 900, Asian: 90 } },
        ts007: { years: Array.from({ length: 100 }, () => 10) },
        ts054: {
          total: 500,
          categories: { Owned: 300, "Social rented": 50 },
          social_rented: 50,
        },
      } as Record<string, unknown>,
      sourceName: "ONS Census 2021 via Nomis (bulk download)",
      sourceDate: "2021-03-21",
    };
  }
  async imdRow() {
    return {
      lsoaCode: "E01021395",
      lsoaName: "Braintree 018C",
      decile: 8,
      summary:
        "This area is in the tenth of areas with the lowest measured deprivation (decile 8 of 10)",
      domains: { income: 7 },
      sourceName: "English Indices of Deprivation 2025 — File 7 (MHCLG)",
      sourceDate: "2025-10-30",
    };
  }
  async airSquare() {
    return {
      year: 2024,
      no2: 8.15,
      pm25: 7.12,
      pm10: 12.55,
      sourceName: "Defra — Pollution Climate Mapping (PCM)",
      sourceDate: "2025-06-30",
    };
  }
  async noiseRows() {
    return {
      filedCount: 100,
      rows: [{ sourceKind: "road", dayBand: "55–59 dB", nightBand: "50–54 dB" }],
      sourceName: "Defra strategic noise mapping — England Round 4 (2022 reference year)",
      sourceDate: "2024-10-01",
    };
  }
  async benefits() {
    const series = (month: string, count: number, pct: number | null) => ({
      month,
      count,
      pct,
      sourceName: "DWP via Stat-Xplore",
      sourceDate: "2026-11-01",
    });
    return {
      claimantCount: series("2026-09-01", 15, 1.6),
      ucPeople: series("2026-05-01", 117, null),
      ucHouseholds: series("2026-04-01", 105, null),
      bases: { residents: 1489, households: 625 },
    };
  }
  async solarCell() {
    return {
      gridFiledCount: 1000,
      cell: {
        cellRef: "51.75,0.55",
        yieldKwhPerKwp: 1057.65,
        irradiationKwhM2: 1336.65,
        peakPowerKwp: 1,
        systemLossPct: 14,
        slopeDeg: 35,
        azimuthDeg: 0,
        mounting: "free-standing",
        pvTechnology: "crystalline silicon",
        radiationDb: "PVGIS-SARAH3",
        yearMin: 2005,
        yearMax: 2023,
        sourceName: "PVGIS",
        sourceDate: "2026-11-01",
      },
    };
  }
  async companyOwnershipFacts(): Promise<CompanyOwnershipFacts> {
    return {
      ccodFiledCount: 100,
      ocodFiledCount: 100,
      editions: {
        ccod: { sourceName: "HM Land Registry — CCOD", sourceDate: "2026-11-01" },
        ocod: { sourceName: "HM Land Registry — OCOD", sourceDate: "2026-11-01" },
      },
      titles: [
        {
          titleNumber: "EX123456",
          dataset: "ccod",
          tenure: "Freehold",
          propertyAddress: "19 Birkdale Rise, Hatfield Peverel",
          proprietorName: "ACME HOMES LTD",
          companyNumber: "12345678",
          proprietorshipCategory: "Limited Company",
          countryIncorporated: null,
          additionalProprietor: false,
          sourceName: "HM Land Registry — CCOD",
          sourceDate: "2026-11-01",
        },
      ],
      snapshots: {
        "12345678": {
          companyNumber: "12345678",
          companyName: "ACME HOMES LTD",
          status: "Active",
          incorporationDate: "2010-01-01",
          sicCodes: ["68209"],
          sourceName: "Companies House",
          sourceDate: "2026-11-01",
        },
      },
    };
  }
  async tribunalFacts(): Promise<TribunalFacts> {
    return {
      filedCount: 28,
      lastFiledAt: "2026-11-14T05:15:00.000Z",
      sourceName: "GOV.UK — Residential property tribunal decisions",
      rows: [],
    };
  }
  async broadbandAnswer() {
    return BROADBAND;
  }
  async mobileAnswer() {
    return MOBILE;
  }
}

class CensusNearbySource implements NearbyDataSource {
  async pointsWithin(category: NearbyCategory): Promise<NearbyPoint[]> {
    if (category === "schools-secondary")
      return [
        {
          name: "Selective Grammar School",
          latitude: DIR.latitude + 0.5 / 69.0,
          longitude: DIR.longitude,
          detail: null,
          selective: true,
        },
      ];
    if (category === "schools-primary")
      return [
        {
          name: "Village Primary School",
          latitude: DIR.latitude + 0.3 / 69.0,
          longitude: DIR.longitude,
          detail: null,
        },
      ];
    return [];
  }
  async nearestPoint() {
    return null;
  }
  async filedCount() {
    return 1000;
  }
}

class CensusSoldSource implements SoldPricesDataSource {
  rows: SoldPriceRow[] = [1, 2, 3, 4, 5].map((n) => ({
    transactionId: null,
    price: 100000 * n,
    saleDate: `202${n}-01-05`,
    postcode: "CM3 2JT",
    propertyType: "D",
    newBuild: false,
    tenure: "F",
    paon: n === 5 ? "19" : `${20 + n}`,
    saon: null,
    street: "BIRKDALE RISE",
    locality: null,
    town: "HATFIELD PEVEREL",
    category: "A",
    sourceName: "HM Land Registry Price Paid",
    sourceDate: "2026-07-01",
  }));
  async salesInPostcode() {
    return this.rows;
  }
  async loadEdition() {
    return "2026-07-01";
  }
  async loadPostcode() {
    throw new Error("not needed");
  }
}

const CRIME_MONTHS = [
  "2025-10",
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
];

class CensusCrimeSource implements CrimeDataSource {
  async crimeAnswer(): Promise<FiledCrimeAnswer> {
    return {
      total: 330,
      // The M6.20 calibration fields (decision D39):
      // Birkdale's measured Basis B population, and a
      // synthetic England embedding (5,310,070 over the real
      // denominator is 94.0 per 1,000 — arithmetic for the
      // census walk, not a pinned figure).
      basisResidents: 6380,
      national: { total: 5310070, residents: 56490108 },
      windowFrom: "2025-10",
      windowTo: "2026-09",
      months: CRIME_MONTHS.map((month) => ({ month, count: 10 })),
      categories: { "violent-crime": 200, "anti-social-behaviour": 130 },
      basis: "Police.uk street-level crimes within 1 mile of the postcode point",
      sourceName: "Police.uk street-level crime",
      sourceDate: "2026-09",
      loadedAt: "2026-11-14T00:00:00.000Z",
    };
  }
  async loadPostcode() {
    throw new Error("not needed");
  }
}

class CensusFloodSource implements FloodDataSource {
  async layerFacts(layer: "flood_zone" | "rofrs" | "rofsw"): Promise<FloodLayerFacts> {
    const base: FloodLayerFacts = {
      filedCount: 1000,
      covering: [],
      nearestWithin: [],
      nearestBeyond: null,
      sourceName: "Environment Agency",
      sourceDate: "2026-10-21",
    };
    if (layer === "flood_zone")
      return { ...base, covering: [{ riskLabel: "FZ3", detail: "river and sea · modelled" }] };
    if (layer === "rofrs")
      return { ...base, covering: [{ riskLabel: "Very low", detail: ">0 m" }] };
    return { ...base, nearestWithin: [{ riskLabel: "Low", detail: ">0 m", miles: 0.01 }] };
  }
}

async function goldenBundles() {
  const nearby = await buildNearbyBundle(HOME, new CensusNearbySource());
  const soldPrices = await buildSoldPricesBundle(HOME, new CensusSoldSource());
  const crime = await buildCrimeBundle(HOME, new CensusCrimeSource(), {
    now: new Date("2026-11-15T00:00:00.000Z"),
  });
  const flood = await buildFloodBundle(HOME, new CensusFloodSource());
  const area = await buildAreaBundle(HOME, new CensusAreaSource());
  const areaWithCompany = await buildAreaBundle(HOME, new CensusAreaSource(), {
    companyOwnershipEnabled: true,
  });
  if (
    nearby.kind !== "distances" ||
    soldPrices.kind !== "sold-prices" ||
    crime.kind !== "crime" ||
    flood.kind !== "flood" ||
    area.kind !== "area-bundle" ||
    areaWithCompany.kind !== "area-bundle"
  )
    throw new Error("expected served golden bundles");
  const short = buildShortBundle({ nearby, soldPrices, crime, flood, area });
  return { nearby, soldPrices, crime, flood, area, areaWithCompany, short };
}

type Golden = Awaited<ReturnType<typeof goldenBundles>>;

// ------------------------------------------------------------------
// The register itself
// ------------------------------------------------------------------

describe("explainer census — the register", () => {
  it("enumerates the prep census: 71 families, 42 hard, ids unique and stable in row order", () => {
    expect(EXPLAINER_CENSUS).toHaveLength(71);
    expect(EXPLAINER_CENSUS.map((entry) => entry.row)).toEqual(
      Array.from({ length: 71 }, (_, i) => i + 1),
    );
    expect(new Set(EXPLAINER_CENSUS.map((entry) => entry.id)).size).toBe(71);
    expect(EXPLAINER_CENSUS.filter((entry) => entry.hardness === "hard")).toHaveLength(42);
    // Every figure-path pattern names census ids that exist.
    const ids = new Set(EXPLAINER_CENSUS.map((entry) => entry.id));
    for (const { censusIds } of FIGURE_PATH_PATTERNS)
      for (const id of censusIds) expect(ids.has(id), id).toBe(true);
  });

  it("records the census outcome: 9 naked + 1 latent fixed, 3 partials resolved or carried, 0 over-noted", () => {
    const fixed = EXPLAINER_CENSUS.filter((entry) => entry.note?.startsWith("FIXED at M6.18"));
    // Rows 4, 23, 25, 27, 30, 40, 49, 50, 58 (naked), 55
    // (latent), 37 + 59 (partials closed by a served line).
    expect(fixed.map((entry) => entry.row).sort((a, b) => a - b)).toEqual([
      4, 23, 25, 27, 30, 37, 40, 49, 50, 55, 58, 59,
    ]);
    const air = EXPLAINER_CENSUS.find((entry) => entry.id === "area.air.concentrations");
    expect(air?.note).toContain("How-we-check page carrying the limits material at M7");
  });
});

// ------------------------------------------------------------------
// Direction one — every hard figure's named line is present
// ------------------------------------------------------------------

const HARD_LINES: Record<string, (b: Golden) => unknown> = {
  "nearby.nearest-selective": (b) =>
    b.nearby.categories.find((c) => c.category === "schools-secondary")?.nearestSelectiveLine,
  "sold.postcode-median": (b) =>
    b.soldPrices.kind === "sold-prices" ? b.soldPrices.median.explainer : null,
  "sold.building-median": (b) =>
    b.soldPrices.kind === "sold-prices"
      ? (b.soldPrices.building?.median.explainer ??
        "no building at the golden home — asserted where a building serves")
      : null,
  "crime.total": (b) =>
    b.crime.kind === "crime" && b.crime.crime.state === "served" ? b.crime.crime.explainer : null,
  "crime.category-counts": (b) =>
    b.crime.kind === "crime" && b.crime.crime.state === "served" ? b.crime.crime.explainer : null,
  "flood.label": (b) =>
    b.flood.kind === "flood"
      ? b.flood.flood.layers.flatMap((l) =>
          [
            l.covering?.definition,
            l.remainder?.definition,
            ...l.proximity.map((prox) => prox.definition),
          ].filter((d): d is string => typeof d === "string"),
        )
      : null,
  "flood.limits": (b) => (b.flood.kind === "flood" ? b.flood.flood.howWeCheck : null),
  "area.constraints.article4-rights": (b) =>
    b.area.sections.constraints.article4.rights?.map((r) => r.words) ??
    "rights translations serve beside the codes where an Article 4 area covers the point — the golden point is outside one, and the translation shape is asserted in the area suite",
  "area.heritage.grade": (b) => b.area.sections.heritage.explainer,
  "area.nature.designation-labels": (b) => b.area.sections.nature.explainer,
  "area.nature.ancient-woodland": (b) => b.area.sections.nature.ancientWoodlandInventoryLine,
  "area.epc.rating": (b) => b.area.sections.epc.certificates.map((c) => c.ratingLine),
  "area.epc.energy-costs": (b) => b.area.sections.epc.certificates.map((c) => c.energyCosts?.line),
  "area.epc.spread": (b) => b.area.sections.epc.spread?.rows.map((r) => r.line),
  "area.council-tax.band-d-average": (b) => b.area.sections.councilTax.line,
  "area.council-tax.bands-table": (b) => b.area.sections.councilTax.bandsLine,
  "area.council-tax.monthly": (b) => b.area.sections.councilTax.monthlyLine,
  "area.census.table-percentages": (b) => b.area.sections.census.explainer,
  "area.census.median-age": (b) => b.area.sections.census.medianAge?.line,
  "area.census.social-rented": (b) => b.area.sections.census.socialRented?.line,
  "area.imd.decile": (b) => b.area.sections.imd.explainer,
  "area.imd.domain-deciles": (b) => b.area.sections.imd.explainer,
  "area.air.concentrations": (b) => b.area.sections.air.explainer,
  "area.benefits.series-counts": (b) => b.area.sections.benefits.explainer,
  "area.benefits.claimant-pct": (b) =>
    b.area.sections.benefits.series.find((s) => s.series === "claimant_count")?.pctLine,
  "area.benefits.bases": (b) => b.area.sections.benefits.basesLine,
  "area.solar.yield": (b) => b.area.sections.solar.basisLine,
  "area.solar.irradiation": (b) => b.area.sections.solar.line,
  "area.company.sic-codes": (b) =>
    b.areaWithCompany.sections.companyOwnership?.ownTitles.map((t) => t.snapshot?.sicCodesLine),
  "short.sold-median": (b) =>
    b.short.sections.soldPrices.state === "served" ? b.short.sections.soldPrices.explainer : null,
  "short.crime-total-asb": (b) =>
    b.short.sections.crime.state === "served" ? b.short.sections.crime.explainer : null,
  "short.flood-labels": (b) =>
    b.short.sections.flood.state === "served"
      ? b.short.sections.flood.layers
          .map((l) => l.coveringDefinition)
          .filter((d): d is string => typeof d === "string")
      : null,
  "short.council-tax-line": (b) =>
    "line" in b.short.sections.councilTax ? b.short.sections.councilTax.line : null,
  "short.air-noise": (b) => ("line" in b.short.sections.air ? b.short.sections.air.line : null),
  "area.building-safety.order-types": (b) => b.area.sections.buildingSafety.explainer,
  "area.broadband.gigabit-pct": (b) => b.area.sections.broadband.explainer,
  "area.broadband.bands-unclassified": (b) => b.area.sections.broadband.unclassifiedLine,
  "area.mobile.operator-pct": (b) => b.area.sections.mobile.services.map((s) => s.line),
  "crime.per-head": (b) =>
    b.crime.kind === "crime" && b.crime.crime.state === "served"
      ? b.crime.crime.perHead?.basisLine
      : null,
  "crime.england-comparison": (b) =>
    b.crime.kind === "crime" && b.crime.crime.state === "served"
      ? b.crime.crime.englandFigure?.line
      : null,
  "short.crime-per-head": (b) =>
    b.short.sections.crime.state === "served" ? b.short.sections.crime.perHeadLine : null,
  "short.crime-england-comparison": (b) =>
    b.short.sections.crime.state === "served" ? b.short.sections.crime.englandLine : null,
};

describe("explainer census — direction one (hard ⇒ line present, both depths)", () => {
  it("every hard family's named line serves, non-empty, on the golden bundles", async () => {
    const bundles = await goldenBundles();
    const hard = EXPLAINER_CENSUS.filter((entry) => entry.hardness === "hard");
    expect(Object.keys(HARD_LINES).sort()).toEqual(hard.map((entry) => entry.id).sort());
    for (const entry of hard) {
      const value = HARD_LINES[entry.id](bundles);
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) {
        if (typeof v === "string" && v.startsWith("rights translations serve")) continue;
        if (typeof v === "string" && v.startsWith("no building at the golden home")) continue;
        expect(typeof v, `${entry.id} (${entry.linePath})`).toBe("string");
        expect((v as string).length, `${entry.id} (${entry.linePath})`).toBeGreaterThan(0);
      }
    }
  });

  it("the M6.18 fixes serve their lines verbatim", async () => {
    const b = await goldenBundles();
    const secondary = b.nearby.categories.find((c) => c.category === "schools-secondary");
    expect(secondary?.nearestSelectiveLine).toBe(
      "the nearest selective secondary school is Selective Grammar School — selective means admission by entrance test",
    );
    expect(b.area.sections.heritage.explainer).toContain(
      "Grade I buildings are of exceptional interest, Grade II* buildings are particularly important buildings of more than special interest, and Grade II buildings are of special interest",
    );
    expect(b.area.sections.nature.explainer).toContain(
      "SSSI is a Site of Special Scientific Interest, SAC is a Special Area of Conservation, SPA is a Special Protection Area, and a Ramsar site is a wetland of international importance under the Ramsar Convention",
    );
    expect(b.area.sections.nature.ancientWoodlandInventoryLine).toBe(
      "the Ancient Woodland Inventory is a provisional inventory, being revised county by county — small woods can be missing from it",
    );
    expect(b.area.sections.epc.certificates[0]?.ratingLine).toBe(
      "this number is the register's energy-efficiency measure for this home — the certificate's band derives from it",
    );
    expect(b.area.sections.census.explainer).toContain(
      "Each table's percentages are of that table's own total — the tables' totals differ because the Census applies disclosure control, so a percentage from one table is not a share of another table's total",
    );
    const claimant = b.area.sections.benefits.series.find((s) => s.series === "claimant_count");
    expect(claimant?.pctLine).toBe("1.6 percent of the working-age population");
    expect(b.area.sections.benefits.basesLine).toBe(
      "the counts are read against the small area's Census 2021 population, filed as the series' context: 1489 residents and 625 households",
    );
    expect(b.area.sections.councilTax.bandsLine).toBe(
      "the other bands are set from Band D by fixed statutory ratios — each band's charge is a set number of ninths of the Band D charge",
    );
    const zones =
      b.short.sections.flood.state === "served"
        ? b.short.sections.flood.layers.find((l) => l.layer === "flood_zone")
        : null;
    expect(zones?.coveringLabel).toBe("Flood Zone 3");
    expect(zones?.coveringDefinition).toBe(
      "land having a 1 in 100 or greater annual probability of river flooding, or a 1 in 200 or greater annual probability of sea flooding",
    );
    expect(
      "headlineAssessmentLabel" in b.short.sections.epc
        ? b.short.sections.epc.headlineAssessmentLabel
        : null,
    ).toBe("predicted — a SAP assessment, the assessor's model made for a new-build home");
    const snapshot = b.areaWithCompany.sections.companyOwnership?.ownTitles[0]?.snapshot;
    expect(snapshot?.sicCodesLine).toBe(
      "the SIC codes are Companies House's standard industrial classification codes for the company's activities, served as filed",
    );
  });
});

// ------------------------------------------------------------------
// Direction two — self ⇒ no note on the figure's own object
// ------------------------------------------------------------------

const NOTE_KEYS = [
  "explainer",
  "note",
  "gloss",
  "definition",
  "howWeCheck",
  "ratingLine",
  "pctLine",
];

describe("explainer census — direction two (self ⇒ no note field)", () => {
  it("no note field appears on self-explanatory figure objects", async () => {
    const b = await goldenBundles();
    const selfObjects: [string, unknown][] = [
      [
        "sold.own-sale",
        b.soldPrices.kind === "sold-prices" && b.soldPrices.rung === 1
          ? b.soldPrices.ownHistory[0]
          : null,
      ],
      [
        "sold.recent-sales",
        b.soldPrices.kind === "sold-prices" ? b.soldPrices.recentSales[0] : null,
      ],
      [
        "crime.monthly-counts",
        b.crime.kind === "crime" && b.crime.crime.state === "served"
          ? b.crime.crime.months[0]
          : null,
      ],
      ["area.census.table-counts", b.area.sections.census.tables[0]?.rows[0]],
      ["area.epc.floor-area", b.area.sections.epc.certificates[0]],
      ["nearby.detail-facts", b.nearby.categories[0]?.places[0]],
    ];
    for (const [id, obj] of selfObjects) {
      if (typeof obj !== "object" || obj === null) throw new Error(`no object for ${id}`);
      // The EPC certificate is a mixed object: it carries
      // the rating's line (row 30, hard) and the band's
      // assessment label (row 29, line-embedded) — those
      // belong to their own rows, so the certificate is
      // checked for note keys beyond its registered set.
      const allowed = id === "area.epc.floor-area" ? ["assessmentLabel", "ratingLine"] : [];
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        if (allowed.includes(key)) continue;
        expect(NOTE_KEYS, `${id}: unexpected note field ${key}`).not.toContain(key);
      }
    }
  });

  it("the over-noted candidates stay legal: no census entry was manufactured for them", () => {
    // The prep's three cleared candidates (council-tax
    // correction repeated per surface, crime's filed basis
    // string, flood definitions per label occurrence) are
    // per-surface or filed-artefact facts, not notes on
    // self-explanatory figures — the register records no
    // second-direction violation for them.
    const ids = EXPLAINER_CENSUS.map((entry) => entry.id);
    expect(ids).not.toContain("area.council-tax.correction-repetition");
    expect(ids).not.toContain("crime.basis-restatement");
    expect(ids).not.toContain("flood.definition-repetition");
  });
});

// ------------------------------------------------------------------
// Fail-closed — the leaf walk
// ------------------------------------------------------------------

describe("explainer census — the fail-closed leaf walk", () => {
  it("every leaf of the golden bundles, at both depths, is registered or allowlisted", async () => {
    const b = await goldenBundles();
    const bundles: [string, unknown][] = [
      ["nearby", b.nearby],
      ["soldPrices", b.soldPrices],
      ["crime", b.crime],
      ["flood", b.flood],
      ["area", b.area],
      ["area", b.areaWithCompany],
      ["short", b.short],
    ];
    for (const [root, bundle] of bundles) {
      expect(findUnregisteredLeaves(bundle, root), root).toEqual([]);
    }
  });

  it("a deliberately unregistered figure fails the walk, naming its path", async () => {
    const b = await goldenBundles();
    const poisoned = JSON.parse(JSON.stringify(b.short)) as typeof b.short;
    (poisoned.sections.epc as unknown as Record<string, unknown>).secretFigure = 42;
    expect(findUnregisteredLeaves(poisoned, "short")).toEqual(["short.sections.epc.secretFigure"]);
  });
});
