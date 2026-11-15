import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AddressResolution, DirectoryPostcode, ResolvedAddress } from "../lib/address";
import {
  buildAreaBundle,
  certificateMatchesHome,
  createAreaSource,
  projectHeadline,
  solarCellRef,
  translateArticle4Codes,
  type AreaDataSource,
  type CensusFacts,
  type CouncilTaxFacts,
  type DesignationFacts,
  type EpcArtefact,
  type EpcCertificate,
  type ImdFacts,
  type ListedFacts,
  type PlanningLayerFacts,
  type PlanningLayerKind,
} from "../lib/area-bundle";
import { DATASETS, buildRows, parseDatasetCsv } from "../loaders/load-census.mjs";
import { imdSummaryFor } from "../loaders/load-imd.mjs";

// Constraints & area in the brain (plan step M6.6, decision
// D26).
//
// One bundle of per-dataset sections off M6.1's resolution:
// constraints, heritage, nature, the home's EPC, council tax,
// Census, IMD, air, noise, benefits, solar — three grains
// (home / postcode point / area) named in every section, depth
// encoded per section, and every dataset's absence its own
// named state. The fake facts below are the rehearsal-measured
// facts: the filed data read back through the real database
// source against the fullest local filing (the national
// planning / heritage / nature / census / IMD / air filings
// from the M5 builds' own downloads, the fixture filings for
// the rest), with every distance a PostGIS geography distance
// from the filed shapes — the serving basis. Divergences from
// the prep-era pins are named in tests/golden-matrix.md
// ("Constraints & area in the brain (M6.6)").

// --- census facts: the loader's own parse of its fixture ----

const CENSUS_BY_MSOA = new Map<string, CensusFacts>();
{
  const parsed = new Map<string, Map<string, { name: string; fragment: never }>>();
  for (const dataset of DATASETS) {
    const text = readFileSync(
      join(__dirname, "fixtures", "census", `census2021-${dataset.code}-msoa.csv`),
      "utf8",
    );
    parsed.set(dataset.code, parseDatasetCsv(text, dataset) as never);
  }
  for (const row of buildRows(parsed as never)) {
    CENSUS_BY_MSOA.set(row.msoaCode, {
      msoaCode: row.msoaCode,
      msoaName: row.msoaName,
      stats: row.stats as Record<string, unknown>,
      sourceName: "ONS Census 2021 via Nomis (bulk download)",
      sourceDate: "2021-03-21",
    });
  }
}

// --- directories and resolutions ------------------------------

function directory(partial: Partial<DirectoryPostcode> & { postcode: string }): DirectoryPostcode {
  return {
    latitude: 0,
    longitude: 0,
    council: null,
    ward: null,
    region: null,
    lsoaCode: null,
    msoaCode: null,
    ...partial,
  };
}

function home(
  dir: DirectoryPostcode,
  address: Partial<ResolvedAddress> & { label: string },
): AddressResolution {
  return {
    rung: 1,
    kind: "home",
    directory: dir,
    address: {
      postcode: dir.postcode,
      paon: null,
      saon: null,
      street: null,
      locality: null,
      town: null,
      ...address,
    },
  };
}

function addressList(dir: DirectoryPostcode): AddressResolution {
  return {
    rung: 2,
    kind: "address-list",
    directory: dir,
    street: null,
    building: null,
    addresses: [],
  };
}

const BIRKDALE_DIR = directory({
  postcode: "CM3 2JT",
  latitude: 51.776176,
  longitude: 0.60387,
  council: "Braintree",
  lsoaCode: "E01021395",
  msoaCode: "E02004463",
});
const EXETER_DIR = directory({
  postcode: "E16 1GN",
  latitude: 51.515224,
  longitude: 0.021177,
  council: "Newham",
  lsoaCode: "E01003511",
  msoaCode: "E02000749",
});
const MINERVA_DIR = directory({
  postcode: "KT17 1FH",
  latitude: 51.344571,
  longitude: -0.247104,
  council: "Epsom and Ewell",
  lsoaCode: "E01030396",
  msoaCode: "E02006837",
});

const BIRKDALE = home(BIRKDALE_DIR, {
  label: "19 Birkdale Rise",
  paon: "19",
  street: "BIRKDALE RISE",
});
const EXETER = home(EXETER_DIR, { label: "6 Exeter Road", paon: "6", street: "EXETER ROAD" });
const MINERVA = home(MINERVA_DIR, {
  label: "Flat 4, Minerva House, 12 Ceres Crescent",
  paon: "MINERVA HOUSE, 12",
  saon: "FLAT 4",
  street: "CERES CRESCENT",
});
const JUPITER = home(MINERVA_DIR, {
  label: "Flat 4, Jupiter House, 10 Ceres Crescent",
  paon: "JUPITER HOUSE, 10",
  saon: "FLAT 4",
  street: "CERES CRESCENT",
});
const JUNO = home(MINERVA_DIR, {
  label: "Flat 4, Juno House, 16 Ceres Crescent",
  paon: "JUNO HOUSE, 16",
  saon: "FLAT 4",
  street: "CERES CRESCENT",
});

// --- the fake source ------------------------------------------

const PLANNING_SOURCE = "Digital Land — planning.data.gov.uk";
const PLANNING_DATE = "2026-11-10";

function layerFacts(partial: Partial<PlanningLayerFacts>): PlanningLayerFacts {
  return {
    filedCount: 1000,
    covering: [],
    nearestWithin: [],
    nearestBeyond: null,
    sourceName: PLANNING_SOURCE,
    sourceDate: PLANNING_DATE,
    ...partial,
  };
}

function emptyDesignations(): DesignationFacts {
  const empty = () => layerFacts({});
  return {
    byType: { sssi: empty(), sac: empty(), spa: empty(), ramsar: empty() },
    overlaps: [],
  };
}

interface HomeFacts {
  layers?: Partial<Record<PlanningLayerKind, PlanningLayerFacts>>;
  designations?: DesignationFacts;
  listed?: ListedFacts;
  phi?: {
    filedCount: number;
    nearest: { habitat: string; miles: number } | null;
    typesWithin: string[];
  };
  epc?: EpcArtefact | null;
  noise?: {
    filedCount: number;
    rows: { sourceKind: string; dayBand: string | null; nightBand: string | null }[];
  };
  air?: { year: number; no2: number; pm25: number; pm10: number } | null;
  solar?: { gridFiledCount: number; cell: Record<string, unknown> | null };
}

const FACTS = new Map<string, HomeFacts>();
const keyOf = (lat: number, lng: number) => `${lat},${lng}`;

const GATE_PUBLISHERS = new Set([
  "Epsom and Ewell",
  "Tower Hamlets",
  "Oxford",
  "Kingston upon Thames",
]);

const COUNCIL_TAX = new Map<string, CouncilTaxFacts>([
  [
    "Braintree",
    {
      authorityName: "Braintree",
      nation: "england",
      taxYear: "2026-27",
      bandDAreaAveragePence: 228034,
      parishAveraged: true,
      components: [
        { role: "billing_authority", label: "Braintree", pence: 20601 },
        { role: "county", label: "county council", pence: 164196 },
        { role: "police", label: "police", pence: 27531 },
        { role: "fire", label: "fire and rescue", pence: 9252 },
      ],
      sourceName: "MHCLG — Council Tax levels set by local authorities in England 2026 to 2027",
      sourceDate: "2026-03-25",
    },
  ],
  [
    "Newham",
    {
      authorityName: "Newham",
      nation: "england",
      taxYear: "2026-27",
      bandDAreaAveragePence: 194423,
      parishAveraged: false,
      components: [
        { role: "billing_authority", label: "Newham", pence: 143372 },
        { role: "gla", label: "Greater London Authority", pence: 51051 },
      ],
      sourceName: "MHCLG — Council Tax levels set by local authorities in England 2026 to 2027",
      sourceDate: "2026-03-25",
    },
  ],
  [
    "Epsom and Ewell",
    {
      authorityName: "Epsom and Ewell",
      nation: "england",
      taxYear: "2026-27",
      bandDAreaAveragePence: 253084,
      parishAveraged: false,
      components: [
        { role: "billing_authority", label: "Epsom and Ewell", pence: 23985 },
        { role: "county", label: "county council", pence: 193842 },
        { role: "police", label: "police", pence: 35257 },
      ],
      sourceName: "MHCLG — Council Tax levels set by local authorities in England 2026 to 2027",
      sourceDate: "2026-03-25",
    },
  ],
  [
    "Cardiff",
    {
      authorityName: "Cardiff",
      nation: "wales",
      taxYear: "2026-27",
      bandDAreaAveragePence: 201318,
      parishAveraged: true,
      components: [
        { role: "billing_authority", label: "Cardiff", pence: 160372 },
        { role: "police", label: "police", pence: 40514 },
      ],
      sourceName: "Welsh Government via StatsWales — Composition of average Band D council tax",
      sourceDate: "2026-03-24",
    },
  ],
]);

const IMD = new Map<string, ImdFacts>([
  [
    "E01021395",
    {
      lsoaCode: "E01021395",
      lsoaName: "Braintree 018C",
      decile: 8,
      summary: imdSummaryFor(8),
      domains: {
        income: 7,
        employment: 8,
        education: 7,
        health: 7,
        crime: 8,
        barriers: 4,
        livingEnvironment: 9,
      },
      sourceName: "English Indices of Deprivation 2025 — File 7 (MHCLG)",
      sourceDate: "2025-10-30",
    },
  ],
  [
    "E01003511",
    {
      lsoaCode: "E01003511",
      lsoaName: "Newham 036A",
      decile: 3,
      summary: imdSummaryFor(3),
      domains: {
        income: 2,
        employment: 4,
        education: 4,
        health: 5,
        crime: 5,
        barriers: 1,
        livingEnvironment: 6,
      },
      sourceName: "English Indices of Deprivation 2025 — File 7 (MHCLG)",
      sourceDate: "2025-10-30",
    },
  ],
  [
    "E01030396",
    {
      lsoaCode: "E01030396",
      lsoaName: "Epsom and Ewell 010D",
      decile: 10,
      summary: imdSummaryFor(10),
      domains: {
        income: 9,
        employment: 10,
        education: 10,
        health: 10,
        crime: 8,
        barriers: 10,
        livingEnvironment: 7,
      },
      sourceName: "English Indices of Deprivation 2025 — File 7 (MHCLG)",
      sourceDate: "2025-10-30",
    },
  ],
]);

const BENEFITS = new Map<
  string,
  {
    claimantCount: { month: string; count: number; pct: number | null } | null;
    ucPeople: { month: string; count: number } | null;
    ucHouseholds: { month: string; count: number } | null;
    bases: { residents: number; households: number } | null;
  }
>([
  [
    "E01021395",
    {
      claimantCount: { month: "2026-09-01", count: 15, pct: 1.6 },
      ucPeople: { month: "2026-05-01", count: 117 },
      ucHouseholds: { month: "2026-04-01", count: 105 },
      bases: { residents: 1489, households: 625 },
    },
  ],
  [
    "E01003511",
    {
      claimantCount: { month: "2026-09-01", count: 120, pct: 8.6 },
      ucPeople: { month: "2026-05-01", count: 383 },
      ucHouseholds: null, // absent from the Households cube — never a zero
      bases: { residents: 1923, households: 671 },
    },
  ],
  [
    "E01030396",
    {
      claimantCount: { month: "2026-09-01", count: 20, pct: 1.2 },
      ucPeople: { month: "2026-05-01", count: 93 },
      ucHouseholds: { month: "2026-04-01", count: 83 },
      bases: { residents: 2487, households: 852 },
    },
  ],
]);

class FakeAreaSource implements AreaDataSource {
  epcLoads: string[] = [];
  coldArtefact: EpcArtefact | null = null;
  solarGridEmpty = false;

  private facts(lat: number, lng: number): HomeFacts {
    return FACTS.get(keyOf(lat, lng)) ?? {};
  }

  async planningLayerFacts(layer: PlanningLayerKind, latitude: number, longitude: number) {
    return this.facts(latitude, longitude).layers?.[layer] ?? layerFacts({});
  }

  async designationFacts(latitude: number, longitude: number) {
    return this.facts(latitude, longitude).designations ?? emptyDesignations();
  }

  async listedFacts(latitude: number, longitude: number) {
    return (
      this.facts(latitude, longitude).listed ?? {
        filedCount: 379169,
        within: [],
        nearestBeyond: null,
        sourceName: "Historic England — National Heritage List for England",
        sourceDate: PLANNING_DATE,
      }
    );
  }

  async phiFacts(latitude: number, longitude: number) {
    const phi = this.facts(latitude, longitude).phi;
    if (!phi || phi.filedCount <= 0)
      return { filedCount: 0, nearest: null, typesWithin: [], sourceName: null, sourceDate: null };
    return {
      filedCount: phi.filedCount,
      nearest: phi.nearest,
      typesWithin: phi.typesWithin,
      sourceName: "Natural England — Priority Habitat Inventory",
      sourceDate: PLANNING_DATE,
    };
  }

  async article4Gate(council: string | null) {
    return council !== null && GATE_PUBLISHERS.has(council);
  }

  async epcArtefact(postcode: string) {
    return EPC_BY_POSTCODE.get(postcode) ?? null;
  }

  async loadEpc(postcode: string) {
    this.epcLoads.push(postcode);
    if (postcode === "ZZ1 1ZZ" && this.coldArtefact)
      EPC_BY_POSTCODE.set(postcode, this.coldArtefact);
    if (postcode === "ZZ1 1ZZ") return;
    throw new Error("the EPC load failed");
  }

  async councilTaxRow(council: string | null) {
    return (council && COUNCIL_TAX.get(council)) || null;
  }

  async censusRow(msoaCode: string) {
    return CENSUS_BY_MSOA.get(msoaCode) ?? null;
  }

  async imdRow(lsoaCode: string) {
    return IMD.get(lsoaCode) ?? null;
  }

  async airSquare(latitude: number, longitude: number) {
    const air = this.facts(latitude, longitude).air;
    if (!air) return null;
    return {
      ...air,
      sourceName: "Defra — Pollution Climate Mapping (PCM)",
      sourceDate: "2025-06-30",
    };
  }

  async noiseRows(postcode: string) {
    const noise = NOISE_BY_POSTCODE.get(postcode);
    if (!noise || noise.filedCount <= 0)
      return { filedCount: 0, rows: [], sourceName: null, sourceDate: null };
    return {
      filedCount: noise.filedCount,
      rows: noise.rows,
      sourceName: "Defra strategic noise mapping — England Round 4 (2022 reference year)",
      sourceDate: "2024-10-01",
    };
  }

  async benefits(lsoaCode: string) {
    const filed = BENEFITS.get(lsoaCode);
    if (!filed) return { claimantCount: null, ucPeople: null, ucHouseholds: null, bases: null };
    const stamp = { sourceName: "DWP via Stat-Xplore / ONS Nomis", sourceDate: "2026-10-13" };
    return {
      claimantCount: filed.claimantCount
        ? { ...filed.claimantCount, pct: filed.claimantCount.pct, ...stamp }
        : null,
      ucPeople: filed.ucPeople ? { ...filed.ucPeople, pct: null, ...stamp } : null,
      ucHouseholds: filed.ucHouseholds ? { ...filed.ucHouseholds, pct: null, ...stamp } : null,
      bases: filed.bases,
    };
  }

  async solarCell(cellRef: string) {
    if (this.solarGridEmpty) return { gridFiledCount: 0, cell: null };
    for (const facts of FACTS.values()) {
      const solar = facts.solar;
      if (solar && solar.cell && solar.cell.cellRef === cellRef)
        return { gridFiledCount: solar.gridFiledCount, cell: solar.cell as never };
    }
    const anySolar = [...FACTS.values()].find((f) => f.solar);
    return { gridFiledCount: anySolar?.solar?.gridFiledCount ?? 0, cell: null };
  }
}

const EPC_BY_POSTCODE = new Map<string, EpcArtefact | null>();
const NOISE_BY_POSTCODE = new Map<
  string,
  {
    filedCount: number;
    rows: { sourceKind: string; dayBand: string | null; nightBand: string | null }[];
  }
>();

function cert(partial: Partial<EpcCertificate> & { certificateNumber: string }): EpcCertificate {
  return {
    addressLine1: null,
    addressLine2: null,
    addressLine3: null,
    postTown: null,
    postcode: "",
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

function artefact(certificates: EpcCertificate[]): EpcArtefact {
  return {
    certificates,
    certificateCount: certificates.length,
    sourceName: "Get energy performance of buildings data (MHCLG)",
    sourceDate: "2026-11-12",
    loadedAt: "2026-11-12T00:00:00.000Z",
  };
}

function listedWithin(
  nearest: { listEntryId: string; name: string; grade: string; miles: number },
  count: number,
): ListedFacts {
  const within = [nearest];
  for (let i = 1; i < count; i += 1) {
    within.push({
      listEntryId: `900000${i}`,
      name: `Listed building ${i}`,
      grade: "II",
      miles: nearest.miles + i * 0.005,
    });
  }
  return {
    filedCount: 379169,
    within,
    nearestBeyond: null,
    sourceName: "Historic England — National Heritage List for England",
    sourceDate: PLANNING_DATE,
  };
}

// --- the filed facts, per golden home -------------------------

function solarCell(cellRef: string, yieldKwhPerKwp: number, irradiationKwhM2: number) {
  return {
    cellRef,
    yieldKwhPerKwp,
    irradiationKwhM2,
    peakPowerKwp: 1,
    systemLossPct: 14,
    slopeDeg: 35,
    azimuthDeg: 0,
    mounting: "building",
    pvTechnology: "crystSi",
    radiationDb: "PVGIS-SARAH3",
    yearMin: 2005,
    yearMax: 2023,
    sourceName: "PVGIS (European Commission Joint Research Centre) — PVGIS-SARAH3",
    sourceDate: "2023-12-31",
  };
}

const NOISE_ROWS = {
  birkdale: [
    { sourceKind: "road", dayBand: "Below 55 dB", nightBand: "Below 50 dB" },
    { sourceKind: "rail", dayBand: "No modelled rail noise", nightBand: "No modelled rail noise" },
    {
      sourceKind: "airport",
      dayBand: "No modelled airport noise",
      nightBand: "No modelled airport noise",
    },
  ],
  exeter: [
    { sourceKind: "road", dayBand: "55–59 dB", nightBand: "Below 50 dB" },
    { sourceKind: "rail", dayBand: "No modelled rail noise", nightBand: "No modelled rail noise" },
    { sourceKind: "airport", dayBand: "Below 55 dB", nightBand: "No modelled airport noise" },
  ],
  minerva: [
    { sourceKind: "road", dayBand: "55–59 dB", nightBand: "Below 50 dB" },
    { sourceKind: "rail", dayBand: "No modelled rail noise", nightBand: "No modelled rail noise" },
    {
      sourceKind: "airport",
      dayBand: "No modelled airport noise",
      nightBand: "No modelled airport noise",
    },
  ],
  c1: [
    { sourceKind: "road", dayBand: "Below 55 dB", nightBand: "Below 50 dB" },
    { sourceKind: "rail", dayBand: "Below 55 dB", nightBand: "Below 50 dB" },
    {
      sourceKind: "airport",
      dayBand: "No modelled airport noise",
      nightBand: "No modelled airport noise",
    },
  ],
};

FACTS.set(keyOf(BIRKDALE_DIR.latitude, BIRKDALE_DIR.longitude), {
  layers: {
    conservation_area: layerFacts({
      filedCount: 9798,
      nearestWithin: [
        { id: 1, name: "Chelmer and Blackwater Navigation", detail: null, miles: 1.473 },
      ],
    }),
    article_4_area: layerFacts({
      filedCount: 7521,
      nearestWithin: [
        { id: 55, name: "West Bowers Farm, Woodham Walter", detail: null, miles: 1.584 },
      ],
    }),
    green_belt: layerFacts({
      filedCount: 181,
      nearestBeyond: { id: 56, name: "London", detail: null, miles: 5.831 },
    }),
    scheduled_monument: layerFacts({
      filedCount: 20007,
      nearestWithin: [{ id: 2, name: "Hatfield Priory", detail: null, miles: 0.495 }],
    }),
    ancient_woodland: layerFacts({
      filedCount: 80358,
      nearestWithin: [{ id: 3, name: null, detail: "revised", miles: 0.387 }],
    }),
  },
  designations: {
    byType: {
      sssi: layerFacts({
        nearestBeyond: { id: 11, name: "Woodham Walter Common SSSI", detail: null, miles: 2.887 },
      }),
      sac: layerFacts({
        nearestBeyond: { id: 12, name: "Essex Estuaries", detail: null, miles: 4.36 },
      }),
      spa: layerFacts({
        nearestBeyond: { id: 13, name: "Blackwater Estuary", detail: null, miles: 4.36 },
      }),
      ramsar: layerFacts({
        nearestBeyond: { id: 14, name: "Blackwater Estuary", detail: null, miles: 4.36 },
      }),
    },
    overlaps: [
      [12, 13],
      [12, 14],
      [13, 14],
    ],
  },
  listed: listedWithin(
    { listEntryId: "1123430", name: "White Hart Cottage", grade: "II", miles: 0.187 },
    102,
  ),
  phi: { filedCount: 0, nearest: null, typesWithin: [] },
  air: { year: 2024, no2: 8.150298, pm25: 7.124671, pm10: 12.54823 },
  solar: { gridFiledCount: 3, cell: solarCell("51.75,0.65", 1057.65, 1336.65) },
});

FACTS.set(keyOf(EXETER_DIR.latitude, EXETER_DIR.longitude), {
  layers: {
    conservation_area: layerFacts({
      filedCount: 9798,
      nearestWithin: [{ id: 21, name: "Naval Row", detail: null, miles: 1.132 }],
    }),
    article_4_area: layerFacts({
      filedCount: 7521,
      nearestWithin: [{ id: 22, name: "London City Island", detail: null, miles: 0.617 }],
    }),
    green_belt: layerFacts({
      filedCount: 181,
      nearestBeyond: { id: 57, name: "London", detail: null, miles: 2.69 },
    }),
    scheduled_monument: layerFacts({
      filedCount: 20007,
      nearestWithin: [
        {
          id: 23,
          name: "Second World War anti-aircraft gun emplacements, Beckton",
          detail: null,
          miles: 0.924,
        },
      ],
    }),
    ancient_woodland: layerFacts({
      filedCount: 80358,
      nearestBeyond: { id: 24, name: "Greenwich Park", detail: "revised", miles: 2.51 },
    }),
  },
  designations: {
    byType: {
      sssi: layerFacts({
        nearestWithin: [
          { id: 25, name: "Gilbert's Pit (Charlton) SSSI", detail: null, miles: 1.902 },
        ],
      }),
      sac: layerFacts({
        nearestBeyond: { id: 26, name: "Epping Forest", detail: null, miles: 4.07 },
      }),
      spa: layerFacts({ nearestBeyond: { id: 27, name: "Lee Valley", detail: null, miles: 5.19 } }),
      ramsar: layerFacts({
        nearestBeyond: { id: 28, name: "Lee Valley", detail: null, miles: 5.19 },
      }),
    },
    overlaps: [[27, 28]],
  },
  listed: listedWithin(
    {
      listEntryId: "1406622",
      name: "Chapel of St George and St Helena at former Dockland Settlement No. 1",
      grade: "II",
      miles: 0.322,
    },
    213,
  ),
  phi: { filedCount: 0, nearest: null, typesWithin: [] },
  air: { year: 2024, no2: 21.71409, pm25: 9.939679, pm10: 16.97423 },
  solar: { gridFiledCount: 3, cell: solarCell("51.55,0.05", 1009.96, 1289.44) },
});

FACTS.set(keyOf(MINERVA_DIR.latitude, MINERVA_DIR.longitude), {
  layers: {
    conservation_area: layerFacts({
      filedCount: 9798,
      nearestWithin: [{ id: 31, name: "Ewell Village", detail: null, miles: 0.099 }],
    }),
    article_4_area: layerFacts({
      filedCount: 7521,
      nearestWithin: [{ id: 32, name: "Ewell Village", detail: "1A;1C;1D;1F;2A;2B", miles: 0.099 }],
    }),
    green_belt: layerFacts({
      filedCount: 181,
      nearestWithin: [{ id: 33, name: "London", detail: null, miles: 0.101 }],
    }),
    scheduled_monument: layerFacts({
      filedCount: 20007,
      nearestWithin: [{ id: 34, name: "Tower of old church, Ewell", detail: null, miles: 0.436 }],
    }),
    ancient_woodland: layerFacts({
      filedCount: 80358,
      nearestWithin: [{ id: 35, name: null, detail: "original", miles: 1.41 }],
    }),
  },
  designations: {
    byType: {
      sssi: layerFacts({
        nearestWithin: [{ id: 36, name: "Stones Road Pond SSSI", detail: null, miles: 0.673 }],
      }),
      sac: layerFacts({
        nearestBeyond: { id: 37, name: "Mole Gap to Reigate Escarpment", detail: null, miles: 5.0 },
      }),
      spa: layerFacts({
        nearestBeyond: { id: 38, name: "South West London Waterbodies", detail: null, miles: 7.05 },
      }),
      ramsar: layerFacts({
        nearestBeyond: { id: 39, name: "South West London Waterbodies", detail: null, miles: 7.05 },
      }),
    },
    overlaps: [[38, 39]],
  },
  listed: listedWithin(
    { listEntryId: "1214537", name: "PIT HOUSE", grade: "II", miles: 0.169 },
    315,
  ),
  phi: { filedCount: 0, nearest: null, typesWithin: [] },
  air: { year: 2024, no2: 12.49256, pm25: 7.868347, pm10: 12.10357 },
  solar: { gridFiledCount: 3, cell: solarCell("51.35,-0.25", 991.49, 1264.87) },
});

EPC_BY_POSTCODE.set(
  "CM3 2JT",
  artefact([
    cert({
      certificateNumber: "2490-1633-0432-1002-3023",
      addressLine1: "19 Birkdale Rise",
      postTown: "CHELMSFORD",
      postcode: "CM3 2JT",
      band: "B",
      ratingCurrent: 85,
      potentialBand: "B",
      totalFloorArea: 141,
      dwellingType: "Detached house",
      assessmentType: "SAP",
      registrationDate: "2022-10-07",
    }),
  ]),
);

EPC_BY_POSTCODE.set(
  "E16 1GN",
  artefact([
    cert({
      certificateNumber: "9248-9925-7330-1627-9930",
      addressLine1: "6 Exeter Road",
      postTown: "LONDON",
      postcode: "E16 1GN",
      band: "B",
      ratingCurrent: 83,
      potentialBand: "B",
      totalFloorArea: 71,
      dwellingType: "Ground-floor maisonette",
      assessmentType: "SAP",
      registrationDate: "2013-10-15",
    }),
    cert({
      certificateNumber: "2041-1785-8070-7006-5925",
      addressLine1: "6 Exeter Road",
      postTown: "LONDON",
      postcode: "E16 1GN",
      band: "B",
      ratingCurrent: 81,
      potentialBand: "B",
      totalFloorArea: 91,
      dwellingType: "Ground-floor maisonette",
      assessmentType: "RdSAP",
      registrationDate: "2023-05-25",
    }),
  ]),
);

EPC_BY_POSTCODE.set(
  "KT17 1FH",
  artefact([
    cert({
      certificateNumber: "8401-7039-6529-6723-9906",
      addressLine1: "Flat 4 Minerva House",
      addressLine2: "12, Ceres Crescent",
      postTown: "EPSOM",
      postcode: "KT17 1FH",
      band: "B",
      ratingCurrent: 84,
      potentialBand: "B",
      totalFloorArea: 70,
      dwellingType: "Flat",
      assessmentType: "SAP",
      registrationDate: "2019-11-07",
    }),
    cert({
      certificateNumber: "8108-3446-3539-2607-0313",
      addressLine1: "Flat 4 Jupiter House",
      addressLine2: "10, Ceres Crescent",
      postTown: "EPSOM",
      postcode: "KT17 1FH",
      band: "B",
      ratingCurrent: 82,
      potentialBand: "B",
      totalFloorArea: 68,
      dwellingType: "Flat",
      assessmentType: "SAP",
      registrationDate: "2019-07-04",
    }),
    cert({
      certificateNumber: "8104-6696-0932-8297-7703",
      addressLine1: "Flat 4 Juno House",
      addressLine2: "16, Ceres Crescent",
      postTown: "EPSOM",
      postcode: "KT17 1FH",
      band: "B",
      ratingCurrent: 83,
      potentialBand: "B",
      totalFloorArea: 72,
      dwellingType: "Flat",
      assessmentType: "SAP",
      registrationDate: "2020-03-11",
    }),
    cert({
      certificateNumber: "8511-7839-6129-9799-6926",
      addressLine1: "Flat 9 Minerva House",
      addressLine2: "12, Ceres Crescent",
      postTown: "EPSOM",
      postcode: "KT17 1FH",
      band: "B",
      ratingCurrent: 84,
      potentialBand: "B",
      totalFloorArea: 71,
      dwellingType: "Flat",
      assessmentType: "SAP",
      registrationDate: "2019-11-21",
    }),
  ]),
);

EPC_BY_POSTCODE.set("E16 1EG", artefact([]));

NOISE_BY_POSTCODE.set("CM3 2JT", { filedCount: 12, rows: NOISE_ROWS.birkdale });
NOISE_BY_POSTCODE.set("E16 1GN", { filedCount: 12, rows: NOISE_ROWS.exeter });
NOISE_BY_POSTCODE.set("KT17 1FH", { filedCount: 12, rows: NOISE_ROWS.minerva });
NOISE_BY_POSTCODE.set("KT17 1DR", { filedCount: 12, rows: NOISE_ROWS.c1 });

const source = new FakeAreaSource();

async function bundle(resolution: AddressResolution, src: AreaDataSource = source) {
  const built = await buildAreaBundle(resolution, src);
  if (built.kind !== "area-bundle") throw new Error(`expected an area bundle, got ${built.kind}`);
  return built;
}

// --- targeted homes -------------------------------------------

const C1_DIR = directory({
  postcode: "KT17 1DR",
  latitude: 51.3497,
  longitude: -0.2495,
  council: "Epsom and Ewell",
  lsoaCode: "E01030390",
  msoaCode: "E02006837",
});
const C1 = home(C1_DIR, { label: "Ewell Village", paon: "1", street: "HIGH STREET" });

const C2_DIR = directory({
  postcode: "E14 0BZ",
  latitude: 51.5115,
  longitude: -0.007,
  council: "Tower Hamlets",
  lsoaCode: "E01004200",
  msoaCode: "E02000800",
});
const C2 = home(C2_DIR, { label: "City Island", paon: "1", street: "LEAMOUTH ROAD" });

const C3_DIR = directory({
  postcode: "CM5 0DR",
  latitude: 51.716,
  longitude: 0.262,
  council: "Epping Forest",
  lsoaCode: "E01021300",
  msoaCode: "E02004500",
});
const C3 = home(C3_DIR, { label: "High Laver", paon: "1", street: "HIGH LAVER" });

const C4_DIR = directory({
  postcode: "KT1 1JS",
  latitude: 51.41,
  longitude: -0.307,
  council: "Kingston upon Thames",
  lsoaCode: "E01002900",
  msoaCode: "E02000700",
});
const C4 = home(C4_DIR, { label: "Kingston", paon: "1", street: "MARKET PLACE" });

const C5_DIR = directory({
  postcode: "KT13 8NB",
  latitude: 51.373,
  longitude: -0.441,
  council: "Elmbridge",
  lsoaCode: "E01030500",
  msoaCode: "E02006200",
});
const C5 = home(C5_DIR, { label: "Oatlands", paon: "1", street: "OATLANDS DRIVE" });

const C6_DIR = directory({
  postcode: "KT21 1AG",
  latitude: 51.313,
  longitude: -0.297,
  council: "Mole Valley",
  lsoaCode: "E01030600",
  msoaCode: "E02006250",
});
const C6 = home(C6_DIR, { label: "Ashtead", paon: "1", street: "THE STREET" });

const C7_DIR = directory({
  postcode: "OX1 1HD",
  latitude: 51.752,
  longitude: -1.258,
  council: "Oxford",
  lsoaCode: "E01028500",
  msoaCode: "E02006000",
});
const C7 = home(C7_DIR, { label: "Oxford", paon: "1", street: "HIGH STREET" });

const C8_DIR = directory({
  postcode: "CF11 8AA",
  latitude: 51.478,
  longitude: -3.184,
  council: "Cardiff",
  lsoaCode: "W01001900",
  msoaCode: "W02000400",
});
const C8 = home(C8_DIR, { label: "Cardiff", paon: "1", street: "CATHEDRAL ROAD" });

const C9_DIR = directory({
  postcode: "CB6 1EH",
  latitude: 52.352,
  longitude: 0.398,
  council: "East Cambridgeshire",
  lsoaCode: "E01033300",
  msoaCode: "E02001600",
});
const C9 = home(C9_DIR, { label: "Hilgay", paon: "1", street: "HIGH STREET" });

const SCOTLAND_DIR = directory({
  postcode: "EH1 1YZ",
  latitude: 55.953,
  longitude: -3.188,
  council: "City of Edinburgh",
  lsoaCode: "S01000001",
  msoaCode: null,
});
const SCOTLAND = home(SCOTLAND_DIR, { label: "Edinburgh", paon: "1", street: "HIGH STREET" });

const E16_1EG_DIR = directory({
  postcode: "E16 1EG",
  latitude: 51.5155,
  longitude: 0.022,
  council: "Newham",
  lsoaCode: "E01003511",
  msoaCode: "E02000749",
});
const E16_1EG = home(E16_1EG_DIR, { label: "1 Exeter Road", paon: "1", street: "EXETER ROAD" });

const ESTUARY_DIR = directory({
  postcode: "CM0 0AA",
  latitude: 51.6,
  longitude: 0.9,
  council: "Rochford",
  lsoaCode: "E01021500",
  msoaCode: "E02004550",
});
const ESTUARY = home(ESTUARY_DIR, { label: "Estuary Point", paon: "1", street: "SEA WALL" });

const KT22_DIR = directory({
  postcode: "KT22 8QA",
  latitude: 51.308,
  longitude: -0.282,
  council: "Mole Valley",
  lsoaCode: "E01030620",
  msoaCode: "E02006260",
});
const KT22 = home(KT22_DIR, { label: "Headley", paon: "1", street: "HEADLEY COMMON ROAD" });

FACTS.set(keyOf(C1_DIR.latitude, C1_DIR.longitude), {
  layers: {
    conservation_area: layerFacts({
      filedCount: 9798,
      covering: [{ id: 41, name: "Ewell Village", detail: null }],
    }),
    article_4_area: layerFacts({
      filedCount: 7521,
      covering: [{ id: 42, name: "Ewell Village", detail: "1A;1C;1D;1F;2A;2B" }],
    }),
  },
});

FACTS.set(keyOf(C2_DIR.latitude, C2_DIR.longitude), {
  layers: {
    article_4_area: layerFacts({
      filedCount: 7521,
      covering: [{ id: 43, name: "London City Island", detail: null }],
    }),
  },
});

FACTS.set(keyOf(C3_DIR.latitude, C3_DIR.longitude), {
  layers: {
    green_belt: layerFacts({
      filedCount: 181,
      covering: [{ id: 44, name: "London", detail: null }],
    }),
  },
  listed: listedWithin({ listEntryId: "1337547", name: "SAWYERS", grade: "II", miles: 0.008 }, 3),
});

FACTS.set(keyOf(C4_DIR.latitude, C4_DIR.longitude), {
  layers: {
    conservation_area: layerFacts({
      filedCount: 9798,
      covering: [{ id: 45, name: "KINGSTON OLD TOWN CONSERVATION AREA", detail: null }],
    }),
    article_4_area: layerFacts({
      filedCount: 7521,
      covering: [
        {
          id: 46,
          name: "Kingston",
          detail:
            "Removes permitted development rights for the change of use from commercial, business and service uses to residential use in the boroughs main town centres, local centres and industrial areas.",
        },
      ],
    }),
  },
  listed: listedWithin(
    { listEntryId: "1358428", name: "MARKET HOUSE", grade: "II*", miles: 0.0 },
    40,
  ),
});

FACTS.set(keyOf(C5_DIR.latitude, C5_DIR.longitude), {
  layers: {
    scheduled_monument: layerFacts({
      filedCount: 20007,
      covering: [{ id: 47, name: "Oatlands Palace", detail: null }],
    }),
  },
  listed: listedWithin(
    { listEntryId: "1191628", name: "Oatlands Palace gates", grade: "II", miles: 0.024 },
    5,
  ),
});

FACTS.set(keyOf(C6_DIR.latitude, C6_DIR.longitude), {
  layers: {
    green_belt: layerFacts({
      filedCount: 181,
      covering: [{ id: 49, name: "London", detail: null }],
    }),
  },
  designations: {
    byType: {
      sssi: layerFacts({ covering: [{ id: 48, name: "Ashtead Common", detail: null }] }),
      sac: layerFacts({}),
      spa: layerFacts({}),
      ramsar: layerFacts({}),
    },
    overlaps: [],
  },
});

FACTS.set(keyOf(C7_DIR.latitude, C7_DIR.longitude), {
  layers: {
    conservation_area: layerFacts({
      filedCount: 9798,
      covering: [{ id: 50, name: "Central", detail: null }],
    }),
    article_4_area: layerFacts({
      filedCount: 7521,
      covering: [
        { id: 51, name: "Houses in Multiple Occupation Article 4 Direction", detail: "3L" },
      ],
    }),
  },
  listed: listedWithin(
    { listEntryId: "1047176", name: "SWAN BRIDGE", grade: "II", miles: 0.022 },
    1087,
  ),
});

FACTS.set(keyOf(C8_DIR.latitude, C8_DIR.longitude), {
  designations: {
    byType: {
      sssi: layerFacts({}),
      sac: layerFacts({
        nearestWithin: [{ id: 52, name: "Severn Estuary", detail: null, miles: 1.837 }],
      }),
      spa: layerFacts({
        nearestWithin: [{ id: 53, name: "Severn Estuary", detail: null, miles: 1.837 }],
      }),
      ramsar: layerFacts({}),
    },
    overlaps: [[52, 53]],
  },
});

FACTS.set(keyOf(C9_DIR.latitude, C9_DIR.longitude), {
  layers: {
    conservation_area: layerFacts({
      filedCount: 9798,
      nearestBeyond: { id: 54, name: "Littleport", detail: null, miles: 3.572 },
    }),
  },
  listed: {
    filedCount: 379169,
    within: [],
    nearestBeyond: {
      listEntryId: "2000001",
      name: "Apes Hall, Littleport",
      grade: "II",
      miles: 2.532,
    },
    sourceName: "Historic England — National Heritage List for England",
    sourceDate: PLANNING_DATE,
  },
  phi: { filedCount: 0, nearest: null, typesWithin: [] },
});

FACTS.set(keyOf(ESTUARY_DIR.latitude, ESTUARY_DIR.longitude), {
  designations: {
    byType: {
      sssi: layerFacts({
        nearestWithin: [{ id: 61, name: "Blackwater Estuary", detail: null, miles: 0.5 }],
      }),
      sac: layerFacts({
        nearestWithin: [{ id: 64, name: "Essex Estuaries", detail: null, miles: 0.55 }],
      }),
      spa: layerFacts({
        nearestWithin: [{ id: 62, name: "Blackwater Estuary", detail: null, miles: 0.5 }],
      }),
      ramsar: layerFacts({
        nearestWithin: [{ id: 63, name: "Blackwater Estuary", detail: null, miles: 0.5 }],
      }),
    },
    overlaps: [
      [61, 62],
      [61, 63],
      [61, 64],
      [62, 63],
      [62, 64],
      [63, 64],
    ],
  },
});

FACTS.set(keyOf(KT22_DIR.latitude, KT22_DIR.longitude), {
  layers: {
    green_belt: layerFacts({
      filedCount: 181,
      covering: [{ id: 58, name: "London", detail: null }],
    }),
    ancient_woodland: layerFacts({
      filedCount: 80358,
      covering: [{ id: 59, name: null, detail: "revised" }],
    }),
  },
  designations: {
    byType: {
      sssi: layerFacts({
        nearestWithin: [
          { id: 60, name: "Mole Gap to Reigate Escarpment SSSI", detail: null, miles: 0.393 },
        ],
      }),
      sac: layerFacts({
        nearestWithin: [
          { id: 61, name: "Mole Gap to Reigate Escarpment", detail: null, miles: 0.393 },
        ],
      }),
      spa: layerFacts({}),
      ramsar: layerFacts({}),
    },
    overlaps: [[60, 61]],
  },
});

FACTS.set(keyOf(C3_DIR.latitude, C3_DIR.longitude), {
  ...FACTS.get(keyOf(C3_DIR.latitude, C3_DIR.longitude)),
  designations: {
    byType: {
      sssi: layerFacts({
        nearestBeyond: { id: 62, name: "Epping Forest SSSI", detail: null, miles: 4.019 },
      }),
      sac: layerFacts({
        nearestBeyond: { id: 63, name: "Epping Forest", detail: null, miles: 4.019 },
      }),
      spa: layerFacts({}),
      ramsar: layerFacts({}),
    },
    overlaps: [[62, 63]],
  },
});

NOISE_BY_POSTCODE.set("EH1 1YZ", { filedCount: 12, rows: [] });

// --- rungs ------------------------------------------------------

describe("the ladder", () => {
  it("rung 3 serves no figures from any M6.6 dataset — named states only", async () => {
    const built = await buildAreaBundle(
      {
        rung: 3,
        kind: "wider-area",
        outward: "CM3",
        label: "Wider area — CM3, not this exact home",
        postcodeCount: 541,
      },
      source,
    );
    expect(built.kind).toBe("wider-area");
    if (built.kind !== "wider-area") return;
    expect(Object.keys(built.area.sections).sort()).toEqual(
      [
        "air",
        "benefits",
        "census",
        "constraints",
        "councilTax",
        "epc",
        "heritage",
        "imd",
        "nature",
        "noise",
        "solar",
      ].sort(),
    );
    for (const section of Object.values(built.area.sections)) {
      expect(section.state).toBe("unavailable");
      expect(section.reason).toContain("exact postcode");
    }
    const json = JSON.stringify(built);
    for (const figure of ["1057.65", "228034", "decile", "7772", "Below 55"])
      expect(json).not.toContain(figure);
  });

  it("rung 4 serves nothing", async () => {
    const built = await buildAreaBundle({ rung: 4, kind: "no-location" }, source);
    expect(built.kind).toBe("no-location");
    if (built.kind !== "no-location") return;
    expect(built.area.state).toBe("unavailable");
  });

  it("rung 2 serves point and area facts exactly as at rung 1; home facts ask for the exact home", async () => {
    const rung1 = await bundle(MINERVA);
    const rung2 = await bundle(addressList(MINERVA_DIR));
    for (const key of [
      "constraints",
      "nature",
      "councilTax",
      "census",
      "imd",
      "air",
      "noise",
      "benefits",
      "solar",
    ] as const) {
      expect(rung2.sections[key]).toEqual(rung1.sections[key]);
    }
    expect(rung2.sections.heritage.listed).toEqual(rung1.sections.heritage.listed);
    expect(rung2.sections.heritage.monuments).toEqual(rung1.sections.heritage.monuments);
    expect(rung2.sections.heritage.atPoint.state).toBe("needs-exact-home");
    expect(rung2.sections.epc.state).toBe("needs-exact-home");
    expect(rung2.sections.epc.certificates).toEqual([]);
  });
});

// --- constraints --------------------------------------------------

describe("constraints", () => {
  it("Birkdale: conservation-area absence is the honest national-data wording with its check date", async () => {
    const { sections } = await bundle(BIRKDALE);
    const ca = sections.constraints.conservationArea;
    expect(ca.state).toBe("none-found");
    expect(ca.line).toContain(
      "no conservation area found in the national data, checked 10 November 2026",
    );
    expect(ca.nearest).toEqual({ name: "Chelmer and Blackwater Navigation", miles: 1.473 });
  });

  it("Article 4 absence is 'not published' for Braintree AND Newham — never 'none found'", async () => {
    const birkdale = await bundle(BIRKDALE);
    expect(birkdale.sections.constraints.article4.state).toBe("not-published");
    expect(birkdale.sections.constraints.article4.councilPublishes).toBe(false);
    expect(birkdale.sections.constraints.article4.line).toContain("not published by this council");

    const exeter = await bundle(EXETER);
    expect(exeter.sections.constraints.article4.state).toBe("not-published");
    // Proximity is a fact about the map and still serves: the
    // nearest filed area is the neighbouring borough's.
    expect(exeter.sections.constraints.article4.nearest?.name).toBe("London City Island");
    expect(exeter.sections.constraints.article4.nearest?.miles).toBe(0.617);
    const birkdaleA4 = birkdale.sections.constraints.article4;
    expect(birkdaleA4.nearest).toEqual({ name: "West Bowers Farm, Woodham Walter", miles: 1.584 });
  });

  it("green belt: Birkdale's absence is trustworthy; the Epsom flat's nearest belt is named 'London', never the district", async () => {
    const birkdale = await bundle(BIRKDALE);
    expect(birkdale.sections.constraints.greenBelt.state).toBe("none-found");
    expect(birkdale.sections.constraints.greenBelt.beyondNearest).toEqual({
      name: "London",
      miles: 5.831,
    });
    const minerva = await bundle(MINERVA);
    expect(minerva.sections.constraints.greenBelt.nearest).toEqual({
      name: "London",
      miles: 0.101,
    });
  });

  it("the Epsom flat sits 0.099 miles from both the conservation area and its Article 4 area", async () => {
    const { sections } = await bundle(MINERVA);
    expect(sections.constraints.conservationArea.nearest).toEqual({
      name: "Ewell Village",
      miles: 0.099,
    });
    expect(sections.constraints.article4.nearest).toEqual({ name: "Ewell Village", miles: 0.099 });
    // Outside, in a publishing council: the gated absence may serve.
    expect(sections.constraints.article4.state).toBe("none-found");
    expect(sections.constraints.article4.councilPublishes).toBe(true);
    // Codes serve only when inside.
    expect(sections.constraints.article4.codes).toBeNull();
  });

  it("C1 is inside both the Ewell Village conservation area and its Article 4 area, rights translated", async () => {
    const { sections } = await bundle(C1);
    expect(sections.constraints.conservationArea.state).toBe("inside");
    expect(sections.constraints.conservationArea.insideName).toBe("Ewell Village");
    const a4 = sections.constraints.article4;
    expect(a4.state).toBe("inside");
    expect(a4.codes).toEqual(["1A", "1C", "1D", "1F", "2A", "2B"]);
    const words = Object.fromEntries((a4.rights ?? []).map((r) => [r.code, r.words]));
    expect(words["1A"]).toBe("extensions and other alterations to a house");
    expect(words["1C"]).toBe("other alterations to a roof");
    expect(words["1D"]).toBe("porches");
    expect(words["1F"]).toBe("hard surfaces, such as driveways and patios");
    expect(words["2A"]).toBe("gates, fences and walls");
    expect(words["2B"]).toBe("a new or altered access to a road");
  });

  it("the translation table never invents a right: unknown codes serve untranslated", () => {
    const rights = translateArticle4Codes("3A;9Z");
    expect(rights[0]).toEqual({ code: "3A", words: "changes of use (Part 3 Class A)" });
    expect(rights[1]).toEqual({ code: "9Z", words: null });
    expect(translateArticle4Codes(null)).toEqual([]);
  });

  it("C2 is inside the London City Island Article 4 area", async () => {
    const { sections } = await bundle(C2);
    expect(sections.constraints.article4.state).toBe("inside");
    expect(sections.constraints.article4.insideName).toBe("London City Island");
  });

  it("Cardiff's conservation-area absence is sparse coverage, not a proven none", async () => {
    const { sections } = await bundle(C8);
    expect(sections.constraints.conservationArea.state).toBe("sparse-coverage");
    expect(sections.constraints.conservationArea.line).toContain("sparse");
  });

  it("Cardiff's green belt absence is also sparse coverage — the filed belts are England's", async () => {
    const { sections } = await bundle(C8);
    expect(sections.constraints.greenBelt.state).toBe("sparse-coverage");
  });

  it("a direction that files prose instead of codes serves the prose as its own words (Kingston)", async () => {
    const { sections } = await bundle(C4);
    const a4 = sections.constraints.article4;
    expect(a4.state).toBe("inside");
    expect(a4.rights).toHaveLength(1);
    expect(a4.rights?.[0].words).toContain("Removes permitted development rights");
    expect(a4.rights?.[0].words).toBe(a4.rights?.[0].code);
  });
});

// --- heritage -----------------------------------------------------

describe("heritage", () => {
  it("listed counts and nearest points reproduce for the universal homes", async () => {
    const birkdale = await bundle(BIRKDALE);
    expect(birkdale.sections.heritage.listed.countWithin).toBe(102);
    expect(birkdale.sections.heritage.listed.within[0]).toEqual({
      listEntryId: "1123430",
      name: "White Hart Cottage",
      grade: "II",
      miles: 0.187,
    });
    expect(birkdale.sections.heritage.listed.within).toHaveLength(3);

    const exeter = await bundle(EXETER);
    expect(exeter.sections.heritage.listed.countWithin).toBe(213);
    expect(exeter.sections.heritage.listed.within[0].listEntryId).toBe("1406622");

    const minerva = await bundle(MINERVA);
    expect(minerva.sections.heritage.listed.countWithin).toBe(315);
    expect(minerva.sections.heritage.listed.within[0]).toEqual({
      listEntryId: "1214537",
      name: "PIT HOUSE",
      grade: "II",
      miles: 0.169,
    });
  });

  it("Oxford carries the set maximum: 1,087 listed buildings within 2 miles", async () => {
    const { sections } = await bundle(C7);
    expect(sections.heritage.listed.countWithin).toBe(1087);
    expect(sections.constraints.conservationArea.state).toBe("inside");
    expect(sections.constraints.conservationArea.insideName).toBe("Central");
    expect(sections.constraints.article4.state).toBe("inside");
    expect(sections.constraints.article4.rights).toEqual([
      { code: "3L", words: "changes of use (Part 3 Class L)" },
    ]);
  });

  it("C4's point IS the listed Market House: the check line serves, never 'this home is listed'", async () => {
    const { sections } = await bundle(C4);
    const atPoint = sections.heritage.atPoint;
    expect(atPoint.state).toBe("recorded");
    if (atPoint.state !== "recorded") return;
    expect(atPoint.place.name).toBe("MARKET HOUSE");
    expect(atPoint.place.grade).toBe("II*");
    expect(atPoint.line).toContain("a listed building is recorded at this postcode point");
    expect(atPoint.line).toContain("check the NHLE entry to confirm it is this building");
    expect(atPoint.line).toContain("1358428");
  });

  it("C3's SAWYERS at 0.008 miles also earns the check line", async () => {
    const { sections } = await bundle(C3);
    expect(sections.heritage.atPoint.state).toBe("recorded");
    if (sections.heritage.atPoint.state === "recorded")
      expect(sections.heritage.atPoint.place.name).toBe("SAWYERS");
    // And its green belt inside fact serves the belt's name.
    expect(sections.constraints.greenBelt.state).toBe("inside");
  });

  it("Birkdale's nearest listed point is too far for the check line; monuments serve their nearest", async () => {
    const { sections } = await bundle(BIRKDALE);
    expect(sections.heritage.atPoint.state).toBe("none");
    expect(sections.heritage.monuments.state).toBe("none-found");
    expect(sections.heritage.monuments.nearest).toEqual({ name: "Hatfield Priory", miles: 0.495 });
    expect(sections.heritage.localListsLine).toContain("local lists");
  });

  it("C5's point falls inside the Oatlands Palace monument, its listed gates nearby", async () => {
    const { sections } = await bundle(C5);
    expect(sections.heritage.monuments.state).toBe("inside");
    expect(sections.heritage.monuments.insideName).toBe("Oatlands Palace");
    expect(sections.heritage.listed.within[0].listEntryId).toBe("1191628");
  });

  it("Cardiff: the listed section serves sparse coverage and NO count — the filed list is England's", async () => {
    const { sections } = await bundle(C8);
    expect(sections.heritage.listed.state).toBe("sparse-coverage");
    expect(sections.heritage.listed.countWithin).toBeNull();
    expect(sections.heritage.listed.within).toEqual([]);
    expect(sections.heritage.listed.beyondLine).toBeNull();
  });

  it("Hilgay: zero listed within 2 miles, the beyond form names the nearest", async () => {
    const { sections } = await bundle(C9);
    expect(sections.heritage.listed.countWithin).toBe(0);
    expect(sections.heritage.listed.beyondLine).toContain("none within 2 miles");
    expect(sections.constraints.conservationArea.beyondNearest?.miles).toBe(3.572);
  });
});

// --- nature -------------------------------------------------------

describe("nature", () => {
  it("designations group BY PLACE: the Blackwater stack is one entry with its designations named together", async () => {
    const { sections } = await bundle(ESTUARY);
    expect(sections.nature.places).toHaveLength(1);
    const place = sections.nature.places[0];
    expect(place.line).toBe(
      "Blackwater Estuary — SSSI · SPA · Ramsar · part of Essex Estuaries SAC",
    );
    expect(place.designations.map((d) => d.type)).toEqual(["sssi", "spa", "ramsar", "sac"]);
    expect(sections.nature.placesWithinCount).toBe(1);
  });

  it("Birkdale: no designated site within 2 miles; the beyond form names the nearest place", async () => {
    const { sections } = await bundle(BIRKDALE);
    expect(sections.nature.places).toEqual([]);
    expect(sections.nature.beyondPlace?.line).toBe("Woodham Walter Common SSSI — SSSI");
    expect(sections.nature.beyondLine).toContain("2.887 miles away");
  });

  it("Exeter and the Epsom flat: the nearest SSSI serves as its own place", async () => {
    const exeter = await bundle(EXETER);
    expect(exeter.sections.nature.places.map((p) => p.line)).toEqual([
      "Gilbert's Pit (Charlton) SSSI — SSSI",
    ]);
    const minerva = await bundle(MINERVA);
    expect(minerva.sections.nature.places.map((p) => p.line)).toEqual([
      "Stones Road Pond SSSI — SSSI",
    ]);
    expect(minerva.sections.nature.places[0].miles).toBe(0.673);
  });

  it("C6 stands inside an SSSI, alone", async () => {
    const { sections } = await bundle(C6);
    expect(sections.nature.places).toHaveLength(1);
    expect(sections.nature.places[0].inside).toBe(true);
    expect(sections.nature.places[0].line).toBe("Ashtead Common — SSSI");
  });

  it("Cardiff: the Severn Estuary's SAC and SPA are one place, and the coverage line is served", async () => {
    const { sections } = await bundle(C8);
    expect(sections.nature.places).toHaveLength(1);
    expect(sections.nature.places[0].line).toBe("Severn Estuary — SAC · SPA");
    expect(sections.nature.coverageLine).toContain("Natural England's England services");
  });

  it("KT22: the Mole Gap SSSI and SAC over the same ground are ONE place; the point is inside ancient woodland and the green belt", async () => {
    const { sections } = await bundle(KT22);
    expect(sections.nature.places).toHaveLength(1);
    expect(sections.nature.places[0].line).toBe(
      "Mole Gap to Reigate Escarpment SSSI — SSSI · part of Mole Gap to Reigate Escarpment SAC",
    );
    expect(sections.nature.places[0].miles).toBe(0.393);
    expect(sections.nature.ancientWoodland.state).toBe("inside");
    expect(sections.constraints.greenBelt.state).toBe("inside");
    expect(sections.constraints.greenBelt.insideName).toBe("London");
  });

  it("C3's beyond place groups the Epping Forest SSSI with its SAC", async () => {
    const { sections } = await bundle(C3);
    expect(sections.nature.places).toEqual([]);
    expect(sections.nature.beyondPlace?.line).toBe(
      "Epping Forest SSSI — SSSI · part of Epping Forest SAC",
    );
  });

  it("ancient woodland: unnamed shapes serve under the inventory's name, absence is 'not recorded in the inventory'", async () => {
    const birkdale = await bundle(BIRKDALE);
    const aw = birkdale.sections.nature.ancientWoodland;
    expect(aw.state).toBe("none-found");
    expect(aw.line).toContain("no ancient woodland recorded in the inventory");
    expect(aw.nearest).toEqual({
      name: "Unnamed woodland (Ancient Woodland Inventory)",
      miles: 0.387,
    });

    const minerva = await bundle(MINERVA);
    expect(minerva.sections.nature.ancientWoodland.nearest?.miles).toBe(1.41);
  });

  it("priority habitats: an unfiled table serves the not-filed state, never an absence", async () => {
    const birkdale = await bundle(BIRKDALE);
    expect(birkdale.sections.nature.priorityHabitat.state).toBe("not-filed");
    const hilgay = await bundle(C9);
    expect(hilgay.sections.nature.priorityHabitat.state).toBe("not-filed");
  });

  it("priority habitats: a filed table serves aggregated facts — nearest type and types, never patch counts", async () => {
    const key = keyOf(BIRKDALE_DIR.latitude, BIRKDALE_DIR.longitude);
    const original = FACTS.get(key);
    FACTS.set(key, {
      ...original,
      phi: {
        filedCount: 1716,
        nearest: { habitat: "Traditional orchard", miles: 0.249 },
        typesWithin: [
          "Coastal and floodplain grazing marsh",
          "Deciduous woodland",
          "No main habitat but additional habitats present",
          "Ponds",
          "Traditional orchard",
        ],
      },
    });
    try {
      const { sections } = await bundle(BIRKDALE);
      const phi = sections.nature.priorityHabitat;
      expect(phi.state).toBe("served");
      if (phi.state !== "served") return;
      expect(phi.nearest).toEqual({ habitat: "Traditional orchard", miles: 0.249 });
      expect(phi.typesWithin).toEqual([
        "Coastal and floodplain grazing marsh",
        "Deciduous woodland",
        "No main habitat but additional habitats present",
        "Ponds",
        "Traditional orchard",
      ]);
      expect(JSON.stringify(phi)).not.toContain("1716");
    } finally {
      if (original) FACTS.set(key, original);
    }
  });
});

// --- the home's EPC -------------------------------------------------

describe("the home's EPC", () => {
  it("Birkdale: its one certificate serves, SAP labelled predicted as filed", async () => {
    const { sections } = await bundle(BIRKDALE);
    const epc = sections.epc;
    expect(epc.state).toBe("served");
    if (epc.state !== "served") return;
    expect(epc.certificates).toHaveLength(1);
    expect(epc.certificates[0]).toMatchObject({
      certificateNumber: "2490-1633-0432-1002-3023",
      band: "B",
      floorAreaSqM: 141,
      registrationDate: "2022-10-07",
      predicted: true,
    });
    expect(epc.certificates[0].assessmentLabel).toContain("predicted");
    expect(epc.headlineBand).toBe("B");
  });

  it("Exeter: BOTH certificates serve, newest first, the disagreement named and unranked", async () => {
    const { sections } = await bundle(EXETER);
    const epc = sections.epc;
    expect(epc.state).toBe("served");
    if (epc.state !== "served") return;
    expect(epc.certificates.map((c) => c.floorAreaSqM)).toEqual([91, 71]);
    expect(epc.certificates.map((c) => c.registrationDate)).toEqual(["2023-05-25", "2013-10-15"]);
    expect(epc.certificates.map((c) => c.predicted)).toEqual([false, true]);
    expect(epc.line).toContain("disagree");
  });

  it("the three Flat 4s: each home matches ONLY its own building's certificate", async () => {
    const minerva = await bundle(MINERVA);
    expect(minerva.sections.epc.state).toBe("served");
    if (minerva.sections.epc.state === "served") {
      expect(minerva.sections.epc.certificates.map((c) => c.certificateNumber)).toEqual([
        "8401-7039-6529-6723-9906",
      ]);
      expect(minerva.sections.epc.certificates[0].floorAreaSqM).toBe(70);
      expect(minerva.sections.epc.certificateCountAtPostcode).toBe(4);
    }
    const jupiter = await bundle(JUPITER);
    if (jupiter.sections.epc.state === "served")
      expect(jupiter.sections.epc.certificates.map((c) => c.certificateNumber)).toEqual([
        "8108-3446-3539-2607-0313",
      ]);
    const juno = await bundle(JUNO);
    if (juno.sections.epc.state === "served")
      expect(juno.sections.epc.certificates.map((c) => c.certificateNumber)).toEqual([
        "8104-6696-0932-8297-7703",
      ]);
  });

  it("the matcher itself, both directions of the trap", () => {
    const minervaCert = cert({
      certificateNumber: "8401-7039-6529-6723-9906",
      addressLine1: "Flat 4 Minerva House",
      addressLine2: "12, Ceres Crescent",
      postcode: "KT17 1FH",
    });
    const jupiterCert = cert({
      certificateNumber: "8108-3446-3539-2607-0313",
      addressLine1: "Flat 4 Jupiter House",
      addressLine2: "10, Ceres Crescent",
      postcode: "KT17 1FH",
    });
    if (MINERVA.kind === "home" && JUPITER.kind === "home") {
      expect(certificateMatchesHome(minervaCert, MINERVA.address)).toBe(true);
      expect(certificateMatchesHome(minervaCert, JUPITER.address)).toBe(false);
      expect(certificateMatchesHome(jupiterCert, MINERVA.address)).toBe(false);
      expect(certificateMatchesHome(jupiterCert, JUPITER.address)).toBe(true);
    }
  });

  it("the three empty states are distinct: filed-zero, none for this exact home, not filed", async () => {
    const filedZero = await bundle(E16_1EG);
    expect(filedZero.sections.epc.state).toBe("filed-zero");

    const noneMatching = await bundle(
      home(MINERVA_DIR, { label: "99 Ceres Crescent", paon: "99", street: "CERES CRESCENT" }),
    );
    expect(noneMatching.sections.epc.state).toBe("none-matching");
    if (noneMatching.sections.epc.state === "none-matching")
      expect(noneMatching.sections.epc.certificateCountAtPostcode).toBe(4);
  });

  it("a cold postcode loads through the loader path before answering; a failed load serves not-filed", async () => {
    const coldSource = new FakeAreaSource();
    coldSource.coldArtefact = artefact([
      cert({
        certificateNumber: "0000-0000-0000-0000-0001",
        addressLine1: "1 Test Street",
        postcode: "ZZ1 1ZZ",
        band: "C",
        totalFloorArea: 80,
        assessmentType: "RdSAP",
        registrationDate: "2024-01-01",
      }),
    ]);
    const coldDir = directory({
      postcode: "ZZ1 1ZZ",
      latitude: 52.0,
      longitude: 0.0,
      council: null,
      lsoaCode: "E01000000",
      msoaCode: null,
    });
    const cold = await bundle(
      home(coldDir, { label: "1 Test Street", paon: "1", street: "TEST STREET" }),
      coldSource,
    );
    expect(coldSource.epcLoads).toEqual(["ZZ1 1ZZ"]);
    expect(cold.sections.epc.state).toBe("served");

    const failDir = directory({
      postcode: "ZZ9 9ZZ",
      latitude: 52.1,
      longitude: 0.1,
      council: null,
      lsoaCode: "E01000000",
      msoaCode: null,
    });
    const failed = await bundle(
      home(failDir, { label: "1 Nowhere", paon: "1", street: "NOWHERE" }),
      coldSource,
    );
    expect(failed.sections.epc.state).toBe("not-filed");
  });

  it("rung 2 never attempts a load", async () => {
    const fresh = new FakeAreaSource();
    await bundle(addressList(MINERVA_DIR), fresh);
    expect(fresh.epcLoads).toEqual([]);
  });
});

// --- council tax ------------------------------------------------------

describe("council tax", () => {
  it("Braintree: the area Band D average with its components and the parish average", async () => {
    const { sections } = await bundle(BIRKDALE);
    const tax = sections.councilTax;
    expect(tax.state).toBe("served");
    if (tax.state !== "served") return;
    expect(tax.authority).toBe("Braintree");
    expect(tax.bandDAveragePence).toBe(228034);
    expect(tax.bandDAverageLabel).toBe("£2,280.34");
    expect(tax.components.map((c) => c.pence)).toEqual([20601, 164196, 27531, 9252]);
    expect(tax.parish).toMatchObject({ pence: 6454, labelPence: "£64.54" });
    const bands = Object.fromEntries(tax.bands.map((b) => [b.band, b.pence]));
    expect(bands).toEqual({
      A: 152023,
      B: 177360,
      C: 202697,
      D: 228034,
      E: 278708,
      F: 329382,
      G: 380057,
      H: 456068,
    });
    expect(tax.line).toContain("area average");
  });

  it("Newham: the GLA component serves; no parish line", async () => {
    const { sections } = await bundle(EXETER);
    const tax = sections.councilTax;
    expect(tax.state).toBe("served");
    if (tax.state !== "served") return;
    const gla = tax.components.find((c) => c.label === "Greater London Authority");
    expect(gla).toMatchObject({ pence: 51051, labelPence: "£510.51" });
    expect(tax.parish).toBeNull();
  });

  it("Epsom and Ewell: the derived band table from the filed average", async () => {
    const { sections } = await bundle(MINERVA);
    const tax = sections.councilTax;
    expect(tax.state).toBe("served");
    if (tax.state !== "served") return;
    const bands = Object.fromEntries(tax.bands.map((b) => [b.band, b.pence]));
    expect(bands.D).toBe(253084);
    expect(bands.E).toBe(309325);
  });

  it("an unfiled authority serves 'not published' — Reigate and Banstead is the witness", async () => {
    const reigate = await bundle(
      home(
        directory({
          postcode: "RH2 0AA",
          latitude: 51.237,
          longitude: -0.206,
          council: "Reigate and Banstead",
          lsoaCode: "E01030700",
          msoaCode: "E02006300",
        }),
        { label: "Reigate", paon: "1", street: "HIGH STREET" },
      ),
    );
    expect(reigate.sections.councilTax.state).toBe("not-published");
  });

  it("Cardiff: Wales bands run to I, and the parish line is the community council average", async () => {
    const { sections } = await bundle(C8);
    const tax = sections.councilTax;
    expect(tax.state).toBe("served");
    if (tax.state !== "served") return;
    expect(tax.bands.map((b) => b.band)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
    expect(tax.bands.find((b) => b.band === "I")?.pence).toBe(469742);
    expect(tax.parish?.pence).toBe(432);
    expect(tax.parish?.line).toContain("community council");
  });

  it("Scotland is not covered — never a borrowed figure", async () => {
    const { sections } = await bundle(SCOTLAND);
    expect(sections.councilTax.state).toBe("not-covered");
  });
});

// --- Census -----------------------------------------------------------

describe("census", () => {
  it("Birkdale: every table serves on its OWN total — the totals deliberately differ", async () => {
    const { sections } = await bundle(BIRKDALE);
    const census = sections.census;
    expect(census.state).toBe("served");
    if (census.state !== "served") return;
    expect(census.msoaName).toBe("Braintree 018");
    expect(census.residentsTotal).toBe(8141);
    expect(census.householdsTotal).toBe(3398);
    const byCode = Object.fromEntries(census.tables.map((t) => [t.code, t]));
    expect(byCode.ts007a.total).toBe(8141);
    expect(byCode.ts021.total).toBe(8138);
    expect(byCode.ts030.total).toBe(8138);
    expect(byCode.ts044.total).toBe(3398);
    expect(byCode.ts052.total).toBe(3399);
    expect(byCode.ts054.total).toBe(3397);
    // White: 7,772 of the ethnic-group table's own 8,138.
    const white = byCode.ts021.groups?.find((g) => g.label === "White");
    expect(white).toEqual({ label: "White", count: 7772, pct: 95.5 });
    // Categories stay in the Census's exact words, unmerged.
    const british = byCode.ts021.rows.find((r) => r.label.startsWith("White: English"));
    expect(british?.count).toBe(7528);
    const christian = byCode.ts030.rows.find((r) => r.label === "Christian");
    expect(christian).toEqual({ label: "Christian", count: 4232, pct: 52.0 });
  });

  it("median age is computed from the single-year table and labelled calculated: 46.5 locked", async () => {
    const { sections } = await bundle(BIRKDALE);
    if (sections.census.state !== "served") throw new Error("expected served");
    expect(sections.census.medianAge).toMatchObject({ value: 46.5, calculated: true });
    expect(sections.census.socialRented).toMatchObject({ count: 469, total: 3397, pct: 13.8 });
  });

  it("Exeter: social-rented is 1,631 of 3,330 = 49.0 percent, its own line", async () => {
    const { sections } = await bundle(EXETER);
    if (sections.census.state !== "served") throw new Error("expected served");
    expect(sections.census.socialRented).toMatchObject({ count: 1631, total: 3330, pct: 49.0 });
    expect(sections.census.medianAge?.value).toBe(33.4);
    const byCode = Object.fromEntries(sections.census.tables.map((t) => [t.code, t]));
    expect(
      byCode.ts021.groups?.find(
        (g) => g.label === "Black, Black British, Black Welsh, Caribbean or African",
      ),
    ).toEqual({
      label: "Black, Black British, Black Welsh, Caribbean or African",
      count: 2940,
      pct: 30.8,
    });
  });

  it("the Epsom flat's MSOA: median age 44.5 computed and locked; social-rented 241 of 4,440", async () => {
    const { sections } = await bundle(MINERVA);
    if (sections.census.state !== "served") throw new Error("expected served");
    expect(sections.census.medianAge?.value).toBe(44.5);
    expect(sections.census.socialRented).toMatchObject({ count: 241, total: 4440, pct: 5.4 });
  });

  it("Census Day is stamped on the section; Scotland is not covered", async () => {
    const { sections } = await bundle(BIRKDALE);
    if (sections.census.state === "served")
      expect(sections.census.sourceLine).toContain("21 March 2021");
    const scotland = await bundle(SCOTLAND);
    expect(scotland.sections.census.state).toBe("not-covered");
    const cardiff = await bundle(C8);
    // Wales is inside Census coverage (its row is simply not
    // in this fake's filing) — never "not covered".
    expect(cardiff.sections.census.state).toBe("not-filed");
  });
});

// --- IMD ---------------------------------------------------------------

describe("imd", () => {
  it("the locked deciles serve, and the summary is the FILED string, character for character", async () => {
    const birkdale = await bundle(BIRKDALE);
    if (birkdale.sections.imd.state !== "served") throw new Error("expected served");
    expect(birkdale.sections.imd.decile).toBe(8);
    expect(birkdale.sections.imd.summary).toBe(imdSummaryFor(8));
    expect(birkdale.sections.imd.summary).toBe(
      "Among the less deprived 30 percent of areas in England",
    );

    const exeter = await bundle(EXETER);
    if (exeter.sections.imd.state !== "served") throw new Error("expected served");
    expect(exeter.sections.imd.decile).toBe(3);
    expect(exeter.sections.imd.summary).toBe(
      "Among the more deprived 30 percent of areas in England",
    );

    const minerva = await bundle(MINERVA);
    if (minerva.sections.imd.state !== "served") throw new Error("expected served");
    expect(minerva.sections.imd.decile).toBe(10);
    expect(minerva.sections.imd.summary).toBe(
      "Among the less deprived 10 percent of areas in England",
    );
  });

  it("Exeter's Barriers to Housing domain decile is 1", async () => {
    const exeter = await bundle(EXETER);
    if (exeter.sections.imd.state !== "served") throw new Error("expected served");
    const barriers = exeter.sections.imd.domains.find((d) => d.key === "barriers");
    expect(barriers).toEqual({
      key: "barriers",
      name: "Barriers to Housing and Services",
      decile: 1,
    });
    expect(exeter.sections.imd.domains).toHaveLength(7);
  });

  it("the score and rank are NEVER served — asserted at serialisation level", async () => {
    for (const resolution of [BIRKDALE, EXETER, MINERVA]) {
      const built = await bundle(resolution);
      const json = JSON.stringify(built);
      for (const leaked of [
        "9.497",
        "25570",
        "29.212",
        "8676",
        "2.986",
        "32740",
        '"score"',
        '"rank"',
      ])
        expect(json).not.toContain(leaked);
    }
  });

  it("Cardiff is not covered — no borrowed English figures", async () => {
    const { sections } = await bundle(C8);
    expect(sections.imd.state).toBe("not-covered");
    if (sections.imd.state === "not-covered") expect(sections.imd.line).toContain("Wales");
  });
});

// --- air, noise, benefits, solar ---------------------------------------

describe("air", () => {
  it("the three modelled concentrations serve as published, NO2 the one headline figure", async () => {
    const birkdale = await bundle(BIRKDALE);
    if (birkdale.sections.air.state !== "served") throw new Error("expected served");
    expect(birkdale.sections.air.no2).toBe(8.150298);
    expect(birkdale.sections.air.pm25).toBe(7.124671);
    expect(birkdale.sections.air.pm10).toBe(12.54823);
    expect(birkdale.sections.air.headlineFigure).toMatchObject({
      pollutant: "NO2",
      value: 8.150298,
    });
    expect(birkdale.sections.air.headlineFigure?.line).toContain("modelled");
    // No comparison to statutory limits anywhere in the answer.
    expect((birkdale.sections.air.line ?? "").toLowerCase()).not.toContain("limit");
    expect(birkdale.sections.air.explainer.toLowerCase()).not.toContain("limit");

    const exeter = await bundle(EXETER);
    if (exeter.sections.air.state === "served") expect(exeter.sections.air.no2).toBe(21.71409);
    const minerva = await bundle(MINERVA);
    if (minerva.sections.air.state === "served") expect(minerva.sections.air.no2).toBe(12.49256);
  });
});

describe("noise", () => {
  it("the publisher's band text serves verbatim, day and night, per source", async () => {
    const { sections } = await bundle(BIRKDALE);
    const noise = sections.noise;
    expect(noise.state).toBe("served");
    if (noise.state !== "served") return;
    const byKind = Object.fromEntries(noise.bands.map((b) => [b.sourceKind, b]));
    expect(byKind.road).toMatchObject({ dayBand: "Below 55 dB", nightBand: "Below 50 dB" });
    expect(byKind.rail.dayBand).toBe("No modelled rail noise");
    expect(noise.headlineBand).toEqual({ sourceKind: "road", dayBand: "Below 55 dB" });
  });

  it("'Below 55 dB' and 'No modelled … noise' are distinct filed states (Exeter airport)", async () => {
    const { sections } = await bundle(EXETER);
    if (sections.noise.state !== "served") throw new Error("expected served");
    const airport = sections.noise.bands.find((b) => b.sourceKind === "airport");
    expect(airport?.dayBand).toBe("Below 55 dB");
    expect(airport?.nightBand).toBe("No modelled airport noise");
    const road = sections.noise.bands.find((b) => b.sourceKind === "road");
    expect(road?.dayBand).toBe("55–59 dB");
  });

  it("C1's rail pair is a real below-range pair, distinct from no-modelled", async () => {
    const { sections } = await bundle(C1);
    if (sections.noise.state !== "served") throw new Error("expected served");
    const rail = sections.noise.bands.find((b) => b.sourceKind === "rail");
    expect(rail).toMatchObject({ dayBand: "Below 55 dB", nightBand: "Below 50 dB" });
  });

  it("an unfiled table serves the not-filed state, never bands; Scotland is not covered", async () => {
    const hilgay = await bundle(C9);
    expect(hilgay.sections.noise.state).toBe("not-filed");
    const scotland = await bundle(SCOTLAND);
    expect(scotland.sections.noise.state).toBe("not-covered");
  });
});

describe("benefits", () => {
  it("the three series serve separately, exactly as filed", async () => {
    const { sections } = await bundle(BIRKDALE);
    const benefits = sections.benefits;
    expect(benefits.state).toBe("served");
    if (benefits.state !== "served") return;
    expect(benefits.series).toHaveLength(3);
    const bySeries = Object.fromEntries(benefits.series.map((s) => [s.series, s]));
    expect(bySeries.claimant_count).toMatchObject({
      state: "served",
      count: 15,
      pct: 1.6,
      monthLabel: "September 2026",
    });
    expect(bySeries.claimant_count.label).toContain("Claimant Count");
    expect(bySeries.uc_people).toMatchObject({ count: 117, monthLabel: "May 2026" });
    expect(bySeries.uc_households).toMatchObject({ count: 105, monthLabel: "April 2026" });
    expect(benefits.bases).toEqual({ residents: 1489, households: 625 });
  });

  it("Exeter's LSOA is absent from the Households cube: not published for this area, never a zero", async () => {
    const { sections } = await bundle(EXETER);
    if (sections.benefits.state !== "served") throw new Error("expected served");
    const households = sections.benefits.series.find((s) => s.series === "uc_households");
    expect(households?.state).toBe("not-published-for-this-area");
    expect(households?.count).toBeNull();
    const people = sections.benefits.series.find((s) => s.series === "uc_people");
    expect(people?.count).toBe(383);
  });

  it("a suppressed percentage serves as filed — never back-calculated", async () => {
    BENEFITS.set("E01039999", {
      claimantCount: { month: "2026-09-01", count: 2, pct: null },
      ucPeople: null,
      ucHouseholds: null,
      bases: { residents: 900, households: 400 },
    });
    const built = await bundle(
      home(
        directory({
          postcode: "ZZ2 2ZZ",
          latitude: 52.2,
          longitude: 0.2,
          council: null,
          lsoaCode: "E01039999",
          msoaCode: null,
        }),
        { label: "Suppressed", paon: "1", street: "HIGH STREET" },
      ),
    );
    if (built.sections.benefits.state !== "served") throw new Error("expected served");
    const claimant = built.sections.benefits.series.find((s) => s.series === "claimant_count");
    expect(claimant?.count).toBe(2);
    expect(claimant?.pct).toBeNull();
    expect(claimant?.pctState).toBe("not-published");
  });

  it("Scotland is not covered", async () => {
    const { sections } = await bundle(SCOTLAND);
    expect(sections.benefits.state).toBe("not-covered");
  });
});

describe("solar", () => {
  it("the cell reference is the loader's own derivation", () => {
    expect(solarCellRef(51.776176, 0.60387)).toBe("51.75,0.65");
    expect(solarCellRef(51.515224, 0.021177)).toBe("51.55,0.05");
    expect(solarCellRef(51.344571, -0.247104)).toBe("51.35,-0.25");
  });

  it("the golden yields serve, worded as a fact about the location", async () => {
    const birkdale = await bundle(BIRKDALE);
    if (birkdale.sections.solar.state !== "served") throw new Error("expected served");
    expect(birkdale.sections.solar.yieldKwhPerKwp).toBe(1057.65);
    expect(birkdale.sections.solar.irradiationKwhM2).toBe(1336.65);
    expect(birkdale.sections.solar.line).toContain("at this location");
    expect(birkdale.sections.solar.basisLine).toContain("PVGIS-SARAH3");
    expect(birkdale.sections.solar.basisLine).toContain("south-facing");

    const exeter = await bundle(EXETER);
    if (exeter.sections.solar.state === "served")
      expect(exeter.sections.solar.yieldKwhPerKwp).toBe(1009.96);
    const minerva = await bundle(MINERVA);
    if (minerva.sections.solar.state === "served")
      expect(minerva.sections.solar.yieldKwhPerKwp).toBe(991.49);
  });

  it("an empty grid serves the not-filed state, never a zero; a missing cell in a filed grid says so", async () => {
    const emptySource = new FakeAreaSource();
    emptySource.solarGridEmpty = true;
    const empty = await bundle(BIRKDALE, emptySource);
    expect(empty.sections.solar.state).toBe("not-filed");
    if (empty.sections.solar.state === "not-filed")
      expect(empty.sections.solar.yieldKwhPerKwp).toBeNull();

    const hilgay = await bundle(C9);
    expect(hilgay.sections.solar.state).toBe("not-filed");
    if (hilgay.sections.solar.state === "not-filed")
      expect(hilgay.sections.solar.line).toContain("not filed for this area yet");
  });
});

// --- depth and the headline projection ---------------------------------

describe("depth is encoded in the bundle", () => {
  it("report-only sections carry report depth; headline sections carry headline depth", async () => {
    const { sections } = await bundle(BIRKDALE);
    expect(sections.imd.depth).toBe("report");
    expect(sections.census.depth).toBe("report");
    expect(sections.benefits.depth).toBe("report");
    expect(sections.constraints.depth).toBe("headline");
    expect(sections.air.depth).toBe("headline");
    expect(sections.noise.depth).toBe("headline");
    expect(sections.solar.depth).toBe("report");
  });

  it("the headline projection carries NO IMD, Census or benefits payload — derivation is a projection", async () => {
    const built = await bundle(BIRKDALE);
    const headline = projectHeadline(built);
    expect(headline).not.toBeNull();
    if (!headline) return;
    expect(Object.keys(headline).sort()).toEqual(
      ["air", "constraints", "councilTax", "epc", "heritage", "nature", "noise", "postcode"].sort(),
    );
    const json = JSON.stringify(headline).toLowerCase();
    for (const banned of ["among the", "claimant", "census", "ethnic", "decile", "7772"])
      expect(json).not.toContain(banned);
    expect(headline.air.headlineFigure?.value).toBe(8.150298);
    expect(headline.noise.headlineBand?.dayBand).toBe("Below 55 dB");
    expect(headline.epc.headlineBand).toBe("B");
    expect(headline.councilTax.authority).toBe("Braintree");
  });

  it("there is no headline projection of a wider-area answer", async () => {
    const built = await buildAreaBundle(
      { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area", postcodeCount: 10 },
      source,
    );
    expect(projectHeadline(built)).toBeNull();
  });
});

// --- the database source's loader invocation -------------------------

describe("the database source", () => {
  it("invokes the EPC loader with the postcode after -- (the sibling-loader trap)", async () => {
    const { writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const stamp = Date.now();
    const script = join(tmpdir(), `fake-epc-loader-${stamp}.mjs`);
    const out = join(tmpdir(), `fake-epc-argv-${stamp}.json`);
    writeFileSync(
      script,
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)));\n`,
    );
    const db = { query: async () => ({ rows: [] }) };
    const dbSource = createAreaSource(db as never, {
      databaseUrl: "postgres://unused",
      epcLoaderPath: script,
    });
    await dbSource.loadEpc("CM3 2JT");
    const { readFileSync } = await import("node:fs");
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(["--", "CM3 2JT"]);
  });
});

// --- banned wording ------------------------------------------------------

describe("banned wording", () => {
  it("no served string turns an area statistic into a verdict, anywhere in the bundle", async () => {
    const resolutions = [BIRKDALE, EXETER, MINERVA, C1, C3, C4, C8, C9, SCOTLAND, ESTUARY];
    const summaries = Array.from({ length: 10 }, (_, i) => imdSummaryFor(i + 1));
    for (const resolution of resolutions) {
      const built = await bundle(resolution);
      let json = JSON.stringify(built);
      for (const summary of summaries) json = json.split(summary).join("");
      const text = json.toLowerCase();
      for (const banned of [
        "quiet",
        "peaceful",
        "noisy",
        "clean air",
        "polluted",
        "healthy air",
        "affluent",
        "poor area",
        "good area",
        "family-friendly",
        "desirable",
        "good schools",
        "your home is listed",
        "no constraints",
        "no nature",
        "protected",
        "deprived",
      ]) {
        expect(text, `${resolution.kind} bundle contains "${banned}"`).not.toContain(banned);
      }
    }
  });
});
