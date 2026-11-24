import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AddressResolution, DirectoryPostcode, ResolvedAddress } from "../lib/address";
import {
  AIR_YARDSTICKS,
  EpcLoadPendingError,
  buildAreaBundle,
  certificateMatchesHome,
  companyTitleMatch,
  createAreaSource,
  epcLoadWaitMsFromEnv,
  projectHeadline,
  solarCellRef,
  translateArticle4Codes,
  type AreaDataSource,
  type AqmaFacts,
  type ChargingZonesFacts,
  type BroadbandAnswerFacts,
  type BrownfieldFacts,
  type CensusFacts,
  type CompanyOwnershipFacts,
  type CompanySnapshotRow,
  type CompanyTitleRow,
  type CouncilTaxFacts,
  type DesignationFacts,
  type EpcArtefact,
  type EpcCertificate,
  type ImdFacts,
  type ListedFacts,
  type MobileAnswerFacts,
  type MobileCoverageSetFacts,
  type PlanningLayerFacts,
  type PlanningLayerKind,
  type TribunalDecisionRow,
  type TribunalFacts,
} from "../lib/area-bundle";
import { DATASETS, buildRows, parseDatasetCsv } from "../loaders/load-census.mjs";
import { imdSummaryFor } from "../loaders/load-imd.mjs";
import {
  SOURCE_NAME as TRIBUNAL_SOURCE,
  buildCases,
  extractPdfText,
  parseDecisionHeader,
  readFixturePdf,
} from "../loaders/load-tribunal-building-safety.mjs";

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
const JUNO_FLAT2 = home(MINERVA_DIR, {
  label: "Flat 2, Juno House, 16 Ceres Crescent",
  paon: "JUNO HOUSE, 16",
  saon: "FLAT 2",
  street: "CERES CRESCENT",
});
const BIRKDALE_39 = home(BIRKDALE_DIR, {
  label: "39 Birkdale Rise",
  paon: "39",
  street: "BIRKDALE RISE",
});
const BIRKDALE_4 = home(BIRKDALE_DIR, {
  label: "4 Birkdale Rise",
  paon: "4",
  street: "BIRKDALE RISE",
});
const BIRKDALE_9 = home(BIRKDALE_DIR, {
  label: "9 Birkdale Rise",
  paon: "9",
  street: "BIRKDALE RISE",
});
const BIRKDALE_44 = home(BIRKDALE_DIR, {
  label: "44 Birkdale Rise",
  paon: "44",
  street: "BIRKDALE RISE",
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
  brownfield?: BrownfieldFacts;
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
  aqma?: AqmaFacts;
  chargingZones?: ChargingZonesFacts;
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

// The brownfield supplier gate's publishers, in the fake's
// world: Braintree and Epsom and Ewell supply the register;
// Newham does not (its absence can only serve sites found,
// never a "none found").
const BROWNFIELD_PUBLISHERS = new Set(["Braintree", "Epsom and Ewell"]);

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

  async brownfieldFacts(latitude: number, longitude: number) {
    return (
      this.facts(latitude, longitude).brownfield ?? {
        filedCount: 30355,
        within: [],
        nearestBeyond: null,
        sourceName: "planning.data.gov.uk — brownfield land (Open Government Licence v3.0)",
        sourceDate: "2026-11-16",
      }
    );
  }

  async brownfieldGate(council: string | null) {
    return council !== null && BROWNFIELD_PUBLISHERS.has(council);
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

  async aqmaFacts(latitude: number, longitude: number) {
    return (
      this.facts(latitude, longitude).aqma ?? {
        filedCount: 0,
        covering: [],
        nearestWithin: null,
        sourceName: null,
        sourceDate: null,
      }
    );
  }

  async chargingZonesFacts(latitude: number, longitude: number) {
    return (
      this.facts(latitude, longitude).chargingZones ?? {
        filedCount: 0,
        filedKeys: [],
        oldestLoadedDate: null,
        covering: null,
      }
    );
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

  companyCalls: string[] = [];
  companyOverride: CompanyOwnershipFacts | null = null;

  async companyOwnershipFacts(postcode: string) {
    this.companyCalls.push(postcode);
    return this.companyOverride ?? COMPANY_BY_POSTCODE.get(postcode) ?? EMPTY_COMPANY_FACTS;
  }

  tribunalCalls: string[] = [];
  tribunalOverride: TribunalFacts | null = null;

  async tribunalFacts(postcode: string) {
    this.tribunalCalls.push(postcode);
    return this.tribunalOverride ?? tribunalFactsFor(postcode);
  }

  broadbandOverride: BroadbandAnswerFacts | null | undefined = undefined;
  mobileOverride: MobileAnswerFacts | null | undefined = undefined;

  async broadbandAnswer(postcode: string) {
    return this.broadbandOverride !== undefined
      ? this.broadbandOverride
      : (BROADBAND_BY_POSTCODE.get(postcode) ?? null);
  }

  async mobileAnswer(postcode: string) {
    return this.mobileOverride !== undefined
      ? this.mobileOverride
      : (MOBILE_BY_POSTCODE.get(postcode) ?? null);
  }
}

// --- tribunal facts: the M5.14 fixture corpus, parsed by
// the loader's own code (the loader test's pattern) — the
// fake serves exactly what the fixture pass files (11
// cases from 9 documents), never a transcription. The
// filing currency is the fixture pass's stamp.

const TRIBUNAL_FILED_AT = "2026-11-14T05:15:00.000Z";

interface FiledTribunalRow extends TribunalDecisionRow {
  postcode: string | null;
}

const TRIBUNAL_CORPUS: Promise<FiledTribunalRow[]> = (async () => {
  const dir = join(__dirname, "fixtures", "tribunal-building-safety");
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as {
    items: { link: string; title: string; decisionDate: string | null; pdf: string }[];
  };
  const documents = [];
  for (const entry of manifest.items) {
    const buffer = await readFixturePdf(dir, entry.pdf);
    documents.push({
      item: { link: entry.link, title: entry.title, decisionDate: entry.decisionDate },
      parsed: parseDecisionHeader(extractPdfText(buffer)),
    });
  }
  const { rows } = buildCases(documents) as unknown as {
    rows: (TribunalDecisionRow & { postcode: string | null })[];
  };
  return rows.map((row) => ({ ...row, sourceName: TRIBUNAL_SOURCE, sourceDate: row.decisionDate }));
})();

async function tribunalFactsFor(postcode: string): Promise<TribunalFacts> {
  const all = await TRIBUNAL_CORPUS;
  return {
    filedCount: all.length,
    lastFiledAt: TRIBUNAL_FILED_AT,
    sourceName: TRIBUNAL_SOURCE,
    rows: all
      .filter((row) => row.postcode === postcode)
      .sort(
        (a, b) =>
          a.decisionDate.localeCompare(b.decisionDate) || a.caseRef.localeCompare(b.caseRef),
      )
      .map((row) => ({
        caseRef: row.caseRef,
        decisionDate: row.decisionDate,
        orderKind: row.orderKind,
        propertyText: row.propertyText,
        buildingKey: row.buildingKey,
        isSingleFlat: row.isSingleFlat,
        sourceUrl: row.sourceUrl,
        sourceName: row.sourceName,
        sourceDate: row.sourceDate,
      })),
  };
}

// --- company ownership facts: the M5.13 fixture slices,
// transcribed from tests/fixtures/company-ownership (real
// November 2026 extracts — the loader's own golden record).

const CCOD_SOURCE = "HM Land Registry — UK companies that own property in England and Wales (CCOD)";
const OCOD_SOURCE =
  "HM Land Registry — Overseas companies that own property in England and Wales (OCOD)";
const CH_SOURCE = "Companies House — Free Company Data Product";
const COMPANY_DATE = "2026-11-01";

function companyTitle(
  partial: Partial<CompanyTitleRow> & { titleNumber: string; propertyAddress: string },
): CompanyTitleRow {
  return {
    dataset: "ccod",
    tenure: "Freehold",
    proprietorName: "",
    companyNumber: null,
    proprietorshipCategory: "Limited Company or Public Limited Company",
    countryIncorporated: null,
    additionalProprietor: false,
    sourceName: CCOD_SOURCE,
    sourceDate: COMPANY_DATE,
    ...partial,
  };
}

const SAGE_SNAPSHOT: CompanySnapshotRow = {
  companyNumber: "11217910",
  companyName: "SAGE HOMES RP LIMITED",
  status: "Active",
  incorporationDate: "2018-02-21",
  sicCodes: ["68201 - Renting and operating of Housing Association real estate"],
  sourceName: CH_SOURCE,
  sourceDate: COMPANY_DATE,
};

const SOMY_SNAPSHOT: CompanySnapshotRow = {
  companyNumber: "13678133",
  companyName: "SOMY RESIDENTIAL LIMITED",
  status: "Active",
  incorporationDate: "2021-10-13",
  sicCodes: ["68209 - Other letting and operating of own or leased real estate"],
  sourceName: CH_SOURCE,
  sourceDate: COMPANY_DATE,
};

function companyFacts(
  titles: CompanyTitleRow[],
  snapshots: CompanyOwnershipFacts["snapshots"] = {},
): CompanyOwnershipFacts {
  return {
    ccodFiledCount: 4485124,
    ocodFiledCount: 90950,
    editions: {
      ccod: { sourceName: CCOD_SOURCE, sourceDate: COMPANY_DATE },
      ocod: { sourceName: OCOD_SOURCE, sourceDate: COMPANY_DATE },
    },
    titles,
    snapshots,
  };
}

const EMPTY_COMPANY_FACTS = companyFacts([]);

const BIRKDALE_TITLES: CompanyTitleRow[] = [
  companyTitle({
    titleNumber: "AA53500",
    propertyAddress: "39, 41 and, 49 Birkdale Rise, Hatfield Peverel, Chelmsford (CM3 2JT)",
    proprietorName: "SAGE HOMES RP LIMITED",
    companyNumber: "11217910",
  }),
  companyTitle({
    titleNumber: "AA53502",
    propertyAddress:
      "35, 37, 43, 45, 47 And 32 To 44 (inclusive), Birkdale Rise, Hatfield Peverel, Chelmsford (CM3 2JT)",
    proprietorName: "SAGE HOMES RP LIMITED",
    companyNumber: "11217910",
  }),
];

const CLARION = {
  proprietorName: "CLARION HOUSING ASSOCIATION LIMITED",
  companyNumber: "7686",
  proprietorshipCategory: "Community Benefit Society (Company)",
  tenure: "Leasehold",
};

const ADRIATIC = {
  dataset: "ocod" as const,
  proprietorName: "ADRIATIC LAND 11 LIMITED",
  countryIncorporated: "GUERNSEY",
  sourceName: OCOD_SOURCE,
};

const EPSOM_TITLES: CompanyTitleRow[] = [
  companyTitle({
    titleNumber: "SY857896",
    propertyAddress: "3 Juno House, 16 Ceres Crescent, Epsom (KT17 1FH)",
    ...CLARION,
  }),
  companyTitle({
    titleNumber: "SY857898",
    propertyAddress: "4 Juno House, 16 Ceres Crescent, Epsom (KT17 1FH)",
    ...CLARION,
  }),
  companyTitle({
    titleNumber: "SY873488",
    propertyAddress: "Flat 2, Juno House, 16 Ceres Crescent, Epsom (KT17 1FH)",
    proprietorName: "SOMY RESIDENTIAL LIMITED",
    companyNumber: "13678133",
    tenure: "Leasehold",
  }),
  companyTitle({
    titleNumber: "SY857895",
    propertyAddress: "Apartment 7, Juno House, 16 Ceres Crescent, Epsom (KT17 1FH)",
    ...CLARION,
  }),
  companyTitle({
    titleNumber: "SY857897",
    propertyAddress: "1 Juno House, 16 Ceres Crescent, Epsom (KT17 1FH)",
    ...CLARION,
  }),
  companyTitle({
    titleNumber: "SY857899",
    propertyAddress: "6 Juno House, 16 Ceres Crescent, Epsom (KT17 1FH)",
    ...CLARION,
  }),
  companyTitle({
    titleNumber: "SY876459",
    propertyAddress: "Flats 1-9 Minerva House, 12 Ceres Crescent, Epsom (KT17 1FH)",
    ...ADRIATIC,
  }),
  companyTitle({
    titleNumber: "SY874425",
    propertyAddress: "Jupiter House, 10 Ceres Crescent, Epsom (KT17 1FH)",
    ...ADRIATIC,
  }),
  companyTitle({
    titleNumber: "SY874424",
    propertyAddress: "Flats 1 To 8 (inclusive), Juno House, 16 Ceres Crescent, Epsom (KT17 1FH)",
    ...ADRIATIC,
  }),
];

const COMPANY_BY_POSTCODE = new Map<string, CompanyOwnershipFacts>([
  ["CM3 2JT", companyFacts(BIRKDALE_TITLES, { "11217910": SAGE_SNAPSHOT, "7686": null })],
  ["E16 1GN", companyFacts([])],
  [
    "KT17 1FH",
    companyFacts(EPSOM_TITLES, {
      "13678133": SOMY_SNAPSHOT,
      "7686": null,
    }),
  ],
]);

const EPC_BY_POSTCODE = new Map<string, EpcArtefact | null>();
const NOISE_BY_POSTCODE = new Map<
  string,
  {
    filedCount: number;
    rows: { sourceKind: string; dayBand: string | null; nightBand: string | null }[];
  }
>();

// --- Ofcom facts (M6.17): the founder-harness live
// verifications of the real Spring 2026 release (13 Nov
// 2026, the M5.9 proof), in the port's shape. For
// broadband ONLY the gigabit figure was live-verified
// (100% at all three universal postcodes); the remaining
// served fields carry the consistent all-100 shape the
// harness record supports and are NOT asserted as goldens
// here — their rendering is proven on the labelled
// synthetic witness in the M6.17 block below. The
// filed-but-unserved fields (NGA, the unable family)
// carry distinctive values so a test can prove they never
// serve. For mobile, the asserted sets are exactly the
// harness's recorded triples; the sets it did not record
// carry values marked FILLER and are never asserted.

function broadbandAnswer(partial: Partial<BroadbandAnswerFacts>): BroadbandAnswerFacts {
  return {
    basis: "All premises",
    snapshot: "2026-01",
    gigabitCapablePct: 100,
    superfast30Pct: 100,
    ultrafast100Pct: 100,
    ultrafast300Pct: 100,
    ngaPct: 12.34,
    unable2Pct: 0.11,
    unable5Pct: 0.22,
    unable10Pct: 0.33,
    unable30Pct: 3.21,
    unableDecentFixedOrFwaPct: 0.44,
    decentViaFwaPct: 0.55,
    speedBandPct: {
      under_2: 0,
      "2_to_5": 0,
      "5_to_10": 0,
      "10_to_30": 0,
      "30_to_300": 0,
      "300_plus": 100,
    },
    ...partial,
  };
}

const BROADBAND_BY_POSTCODE = new Map<string, BroadbandAnswerFacts>([
  ["CM3 2JT", broadbandAnswer({})],
  ["E16 1GN", broadbandAnswer({})],
  ["KT17 1FH", broadbandAnswer({})],
]);

function coverageSet(
  noOperatorPct: number | null,
  allOperatorsPct: number | null,
  atLeastOneOperatorPct: number | null,
): MobileCoverageSetFacts {
  return { noOperatorPct, allOperatorsPct, atLeastOneOperatorPct };
}

function mobileAnswer(
  laua: string,
  lauaName: string,
  services: MobileAnswerFacts["services"],
): MobileAnswerFacts {
  return {
    basis:
      "Local authority area — Ofcom publishes mobile coverage at local-authority level, not by postcode",
    snapshot: "2026-01",
    laua,
    lauaName,
    services,
  };
}

const MOBILE_BY_POSTCODE = new Map<string, MobileAnswerFacts>([
  [
    "CM3 2JT",
    mobileAnswer("E07000067", "Braintree", {
      voice: { outdoor: coverageSet(0, 99.29, 100) },
      "4g": { outdoor: coverageSet(0, 99.04, 100), indoor: coverageSet(0.99, 84.64, 99) },
      "5g_high_confidence": { outdoor: coverageSet(2.1, 42.45, 97.9) },
      // FILLER — not recorded by the harness; never asserted.
      "5g_very_high_confidence": { outdoor: coverageSet(0, 50.5, 100) },
      "5g_sa_high_confidence": { outdoor: coverageSet(4.5, null, 95.5) },
      "5g_sa_very_high_confidence": { outdoor: coverageSet(4.5, null, 95.5) },
    }),
  ],
  [
    "E16 1GN",
    mobileAnswer("E09000025", "Newham", {
      voice: { outdoor: coverageSet(0, 100, 100) },
      "4g": { outdoor: coverageSet(0, 100, 100), indoor: coverageSet(0, 98.89, 100) },
      "5g_high_confidence": { outdoor: coverageSet(0, 100, 100) },
      "5g_very_high_confidence": { outdoor: coverageSet(0, 99.33, 100) },
      "5g_sa_high_confidence": { outdoor: coverageSet(0, null, 100) },
      // FILLER — not recorded by the harness; never asserted.
      "5g_sa_very_high_confidence": { outdoor: coverageSet(1.5, null, 98.5) },
    }),
  ],
  [
    "KT17 1FH",
    mobileAnswer("E07000208", "Epsom and Ewell", {
      voice: { outdoor: coverageSet(0, 100, 100) },
      "4g": { outdoor: coverageSet(0, 100, 100), indoor: coverageSet(0, 96.85, 100) },
      "5g_high_confidence": { outdoor: coverageSet(0, 98.42, 100) },
      "5g_very_high_confidence": { outdoor: coverageSet(0, 67.31, 100) },
      // FILLER — not recorded by the harness; never asserted.
      "5g_sa_high_confidence": { outdoor: coverageSet(2.5, null, 97.5) },
      "5g_sa_very_high_confidence": { outdoor: coverageSet(1.24, null, 98.8) },
    }),
  ],
]);

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
    built_up_area: layerFacts({
      filedCount: 7775,
      covering: [{ id: 61, name: "Hatfield Peverel", detail: null }],
    }),
  },
  brownfield: {
    filedCount: 30355,
    within: [
      {
        reference: "15/01103/OUT",
        siteAddress: "Universal Garage, The Street, Hatfield Peverel",
        hectares: 0.22,
        planningPermissionStatus: "permissioned",
        minimumNetDwellings: 9,
        maximumNetDwellings: 9,
        miles: 0.252,
      },
      {
        reference: "22/00071/FUL",
        siteAddress: "Land east of Bury Lane, Hatfield Peverel",
        hectares: 0.61,
        planningPermissionStatus: "not-permissioned",
        minimumNetDwellings: null,
        maximumNetDwellings: null,
        miles: 1.87,
      },
    ],
    nearestBeyond: null,
    sourceName: "planning.data.gov.uk — brownfield land (Open Government Licence v3.0)",
    sourceDate: "2026-11-16",
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
  aqma: {
    filedCount: 374,
    covering: [],
    nearestWithin: null,
    sourceName: "Defra UK-AIR — Air Quality Management Areas",
    sourceDate: "2026-10-20",
  },
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
    built_up_area: layerFacts({
      filedCount: 7775,
      covering: [{ id: 62, name: "Newham", detail: null }],
    }),
  },
  brownfield: {
    filedCount: 30355,
    within: [
      {
        reference: "23/01785/FUL",
        siteAddress: "45 Beckton Road, London",
        hectares: 0.09,
        planningPermissionStatus: "permissioned",
        minimumNetDwellings: 9,
        maximumNetDwellings: 9,
        miles: 0.163,
      },
      {
        reference: "21/01234/FUL",
        siteAddress: "117-125 Freemasons Road, London",
        hectares: 0.14,
        planningPermissionStatus: "pending-decision",
        minimumNetDwellings: 14,
        maximumNetDwellings: 14,
        miles: 0.267,
      },
    ],
    nearestBeyond: null,
    sourceName: "planning.data.gov.uk — brownfield land (Open Government Licence v3.0)",
    sourceDate: "2026-11-16",
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
  aqma: {
    filedCount: 374,
    covering: [
      { name: "Newham AQMA (No. 2)", authority: "London Borough of Newham", detail: "NO2; PM10" },
    ],
    nearestWithin: null,
    sourceName: "Defra UK-AIR — Air Quality Management Areas",
    sourceDate: "2026-10-20",
  },
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
    built_up_area: layerFacts({
      filedCount: 7775,
      covering: [{ id: 63, name: "Ewell", detail: null }],
    }),
  },
  brownfield: {
    filedCount: 30355,
    within: [],
    nearestBeyond: {
      reference: "194",
      siteAddress: "Etwell House and former coach, Station Approach",
      hectares: 0.19,
      planningPermissionStatus: "not-permissioned",
      minimumNetDwellings: 10,
      maximumNetDwellings: 10,
      miles: 2.41,
    },
    sourceName: "planning.data.gov.uk — brownfield land (Open Government Licence v3.0)",
    sourceDate: "2026-11-16",
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
  aqma: {
    filedCount: 374,
    covering: [],
    nearestWithin: {
      name: "Sutton AQMA",
      authority: "London Borough of Sutton",
      detail: "NO2; PM10",
      miles: 0.929,
    },
    sourceName: "Defra UK-AIR — Air Quality Management Areas",
    sourceDate: "2026-10-20",
  },
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
      // The register's modelled costs, as filed (M6.14):
      // £489 a year current, £455 potential.
      heatingCostCurrent: 305,
      hotWaterCostCurrent: 82,
      lightingCostCurrent: 102,
      heatingCostPotential: 306,
      hotWaterCostPotential: 47,
      lightingCostPotential: 102,
      // The certificate's suggested improvements, as filed
      // (M6.21): the register's two modelled steps.
      suggestedImprovements: [
        {
          sequence: 1,
          improvementType: "N",
          improvementNumber: 19,
          improvementCategory: 5,
          typicalSaving: 34,
          indicativeCost: "£4,000 - £6,000",
          energyRatingAfter: 86,
          environmentalRatingAfter: 87,
        },
        {
          sequence: 2,
          improvementType: "U",
          improvementNumber: 34,
          improvementCategory: 5,
          typicalSaving: 383,
          indicativeCost: "£3,500 - £5,500",
          energyRatingAfter: 93,
          environmentalRatingAfter: 94,
        },
      ],
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
      // £351 a year on both sides (the 2013 SAP run models
      // hot water at £0 — served as filed).
      heatingCostCurrent: 308,
      hotWaterCostCurrent: 0,
      lightingCostCurrent: 43,
      heatingCostPotential: 308,
      hotWaterCostPotential: 0,
      lightingCostPotential: 43,
      suggestedImprovements: null,
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
      // £1,104 a year on both sides.
      heatingCostCurrent: 339,
      hotWaterCostCurrent: 609,
      lightingCostCurrent: 156,
      heatingCostPotential: 339,
      hotWaterCostPotential: 609,
      lightingCostPotential: 156,
      suggestedImprovements: null,
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
      // Captured from the register for M6.14: £278 a year
      // on both sides (£144 heating, £73 hot water, £61
      // lighting).
      heatingCostCurrent: 144,
      hotWaterCostCurrent: 73,
      lightingCostCurrent: 61,
      heatingCostPotential: 144,
      hotWaterCostPotential: 73,
      lightingCostPotential: 61,
      // The widened filing records no published measures
      // for this certificate (M6.21): the named
      // no-measures state, not a missing block.
      suggestedImprovements: null,
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

// Northern Ireland witnesses for the M6.12 hand-off: Belfast
// is on the national Public Register; Magherafelt's council
// is Mid Ulster, the one council that is not (its directory
// row is a fixture in the filed form — ONSPD files the bare
// name "Mid Ulster").
const BELFAST_DIR = directory({
  postcode: "BT1 1AA",
  latitude: 54.597,
  longitude: -5.93,
  council: "Belfast",
  lsoaCode: "N21000192",
  msoaCode: null,
});
const BELFAST = home(BELFAST_DIR, { label: "Belfast", paon: "1", street: "ROYAL AVENUE" });

const MID_ULSTER_DIR = directory({
  postcode: "BT45 6EB",
  latitude: 54.641,
  longitude: -6.606,
  council: "Mid Ulster",
  lsoaCode: "N21001000",
  msoaCode: null,
});
const MID_ULSTER = home(MID_ULSTER_DIR, {
  label: "Magherafelt",
  paon: "1",
  street: "BROAD STREET",
});

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
        "broadband",
        "buildingSafety",
        "census",
        "chargingZones",
        "constraints",
        "councilTax",
        "epc",
        "heritage",
        "imd",
        "mobile",
        "nature",
        "noise",
        "planningApplications",
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
      "planningApplications",
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

  it("Birkdale: the certificate's modelled energy costs serve with it (M6.14, D33)", async () => {
    const { sections } = await bundle(BIRKDALE);
    const cert0 = sections.epc.certificates[0];
    expect(cert0?.energyCosts).toMatchObject({
      currentAnnualPence: 48900,
      currentAnnualLabel: "£489.00",
      currentMonthlyPence: 4075,
      currentMonthlyLabel: "£40.75",
      potentialAnnualPence: 45500,
      potentialAnnualLabel: "£455.00",
      potentialMonthlyPence: 3792,
      potentialMonthlyLabel: "£37.92",
    });
    expect(cert0?.energyCosts?.line).toBe(
      "the register models this home's energy costs at £40.75 a month (£489.00 a year) on a standard occupancy pattern, priced at the assessment date — a model, not a bill",
    );
    expect(cert0?.energyCosts?.potentialLine).toBe(
      "with the improvements this certificate recommends, the same model gives £37.92 a month (£455.00 a year)",
    );
  });

  it("Exeter: BOTH certificates' costs serve, whole and unranked — £92.00 and £29.25 a month (M6.14)", async () => {
    const { sections } = await bundle(EXETER);
    const costs = sections.epc.certificates.map((c) => c.energyCosts);
    expect(costs.map((c) => c?.currentAnnualPence)).toEqual([110400, 35100]);
    expect(costs.map((c) => c?.currentMonthlyLabel)).toEqual(["£92.00", "£29.25"]);
    // The 2013 certificate is SAP: its cost line rides with
    // the certificate's own predicted label, as filed.
    expect(sections.epc.certificates[1].predicted).toBe(true);
    expect(costs[1]?.line).toContain("£29.25 a month (£351.00 a year)");
  });

  it("Minerva: the captured certificate models £23.17 a month on both sides (M6.14)", async () => {
    const { sections } = await bundle(MINERVA);
    const cert0 = sections.epc.certificates[0];
    expect(cert0?.energyCosts).toMatchObject({
      currentAnnualPence: 27800,
      currentMonthlyPence: 2317,
      currentMonthlyLabel: "£23.17",
      potentialAnnualPence: 27800,
      potentialMonthlyLabel: "£23.17",
    });
  });

  it("an artefact filed before the widening serves exactly as before: no cost line, no error (M6.14)", async () => {
    // Jupiter's filed certificate carries no cost fields —
    // the pre-widening shape.
    const { sections } = await bundle(JUPITER);
    expect(sections.epc.state).toBe("served");
    const cert0 = sections.epc.certificates[0];
    expect(cert0?.band).toBe("B");
    expect(cert0?.floorAreaSqM).toBe(68);
    expect(cert0?.energyCosts).toBeNull();

    // A PARTIAL cost set is not a figure either.
    class PartialSource extends FakeAreaSource {
      override async epcArtefact() {
        return artefact([
          cert({
            certificateNumber: "0000-0000-0000-0000-0099",
            addressLine1: "19 Birkdale Rise",
            postcode: "CM3 2JT",
            band: "B",
            totalFloorArea: 141,
            assessmentType: "SAP",
            registrationDate: "2022-10-07",
            heatingCostCurrent: 305,
          }),
        ]);
      }
    }
    const partial = await bundle(BIRKDALE, new PartialSource());
    expect(partial.sections.epc.certificates[0]?.energyCosts).toBeNull();
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
    // The monthly line (M6.14, D33): the same scale spread
    // evenly over 12 months, correction inside the line.
    expect(tax.monthlyLine).toBe(
      "Braintree's average Band D council tax spread evenly over 12 months is £190.03 a month — the council's scale, not this home's bill",
    );
    expect(tax.bandDMonthlyPence).toBe(19003);
    expect(tax.bandDMonthlyLabel).toBe("£190.03");
    // Every band carries its own monthly equivalent — Band
    // A £1,520.23 a year is £126.69 a month.
    const bandA = tax.bands.find((b) => b.band === "A");
    expect(bandA).toMatchObject({ monthlyPence: 12669, monthlyLabelPence: "£126.69" });
    const bandD = tax.bands.find((b) => b.band === "D");
    expect(bandD).toMatchObject({ monthlyPence: 19003, monthlyLabelPence: "£190.03" });
    // The explainer carries the instalment fact.
    expect(tax.explainer).toContain("10 monthly instalments");
  });

  it("the monthly equivalent is DERIVED from the filed average, never filed itself (M6.14)", async () => {
    class TaxVariantSource extends FakeAreaSource {
      override async councilTaxRow() {
        return {
          authorityName: "Braintree",
          nation: "england" as const,
          taxYear: "2026-27",
          bandDAreaAveragePence: 99999,
          parishAveraged: false,
          components: [{ role: "billing_authority", label: "Braintree", pence: 99999 }],
          sourceName: "variant",
          sourceDate: "2026-03-25",
        };
      }
    }
    const { sections } = await bundle(BIRKDALE, new TaxVariantSource());
    const tax = sections.councilTax;
    // £999.99 a year spread over 12 months is £83.33: the
    // figure moved with the filed average, proving the
    // derivation.
    expect(tax.bandDMonthlyPence).toBe(8333);
    expect(tax.monthlyLine).toContain("£83.33 a month");
  });

  it("Newham: the GLA component serves; no parish line", async () => {
    const { sections } = await bundle(EXETER);
    const tax = sections.councilTax;
    expect(tax.state).toBe("served");
    if (tax.state !== "served") return;
    const gla = tax.components.find((c) => c.label === "Greater London Authority");
    expect(gla).toMatchObject({ pence: 51051, labelPence: "£510.51" });
    expect(tax.parish).toBeNull();
    // £1,944.23 a year spread over 12 months is £162.02.
    expect(tax.bandDMonthlyPence).toBe(16202);
    expect(tax.monthlyLine).toContain("£162.02 a month");
  });

  it("Epsom and Ewell: the derived band table from the filed average", async () => {
    const { sections } = await bundle(MINERVA);
    const tax = sections.councilTax;
    expect(tax.state).toBe("served");
    if (tax.state !== "served") return;
    const bands = Object.fromEntries(tax.bands.map((b) => [b.band, b.pence]));
    expect(bands.D).toBe(253084);
    expect(bands.E).toBe(309325);
    // £2,530.84 a year spread over 12 months is £210.90.
    expect(tax.bandDMonthlyPence).toBe(21090);
    expect(tax.bandDMonthlyLabel).toBe("£210.90");
  });

  it("an unfiled authority serves not-filed (D30: the gap is our filing backlog) — Reigate and Banstead is the witness", async () => {
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
    expect(reigate.sections.councilTax.state).toBe("not-filed");
    expect(reigate.sections.councilTax.line).toBe(
      "this council's council tax charges are not filed yet — most councils are filed in the spring pass, and until then no figure can be given",
    );
    // No monthly figure exists where no annual figure does.
    expect(reigate.sections.councilTax.monthlyLine).toBeNull();
    expect(reigate.sections.councilTax.bandDMonthlyPence).toBeNull();
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

// --- Monthly cost: two lines, never a total (M6.14, D33) --------------

describe("monthly cost — never a total (M6.14, D33)", () => {
  function keysOf(value: unknown, into: string[] = []): string[] {
    if (Array.isArray(value)) for (const item of value) keysOf(item, into);
    else if (value && typeof value === "object")
      for (const [key, inner] of Object.entries(value)) {
        into.push(key);
        keysOf(inner, into);
      }
    return into;
  }

  it("no total-shaped field exists in either monthly-bearing section, for any golden home", async () => {
    for (const resolution of [BIRKDALE, EXETER, MINERVA]) {
      const { sections } = await bundle(resolution);
      for (const section of [sections.councilTax, sections.epc]) {
        for (const key of keysOf(section))
          expect(key, `key "${key}"`).not.toMatch(/total|sum|combined|overall/i);
        const text = JSON.stringify(section).toLowerCase();
        for (const phrase of [
          "your monthly cost",
          "cost of living",
          "you will pay",
          "typical monthly bill",
          "monthly total",
          "combined monthly",
        ])
          expect(text, `phrase "${phrase}"`).not.toContain(phrase);
      }
    }
  });

  it("the monthly lines are report depth: the headline projection cannot carry them", async () => {
    const built = await bundle(BIRKDALE);
    const headline = projectHeadline(built);
    expect(headline).not.toBeNull();
    if (!headline) return;
    expect(Object.keys(headline.councilTax).sort()).toEqual(
      ["authority", "bandDAverageLabel", "line", "state", "taxYear"].sort(),
    );
    expect(Object.keys(headline.epc).sort()).toEqual(
      ["headlineAssessmentLabel", "headlineBand", "line", "state"].sort(),
    );
  });
});

// --- The postcode's EPC spread (M6.15, D34) ------------------------------

describe("the postcode's EPC spread (M6.15, D34)", () => {
  // The loader's minimisation, mirrored so the artefacts
  // below are the filed shape the real loader produces from
  // the captured register documents (tests/fixtures/epc).
  function fixtureArtefact(postcode: string): EpcArtefact {
    const dir = join(__dirname, "fixtures", "epc");
    const fixture = JSON.parse(readFileSync(join(dir, "fixture.json"), "utf8")) as {
      postcodes: Record<string, { searchFile: string }>;
    };
    const search = JSON.parse(
      readFileSync(join(dir, fixture.postcodes[postcode].searchFile), "utf8"),
    ) as { data: Record<string, unknown>[] };
    const costOf = (doc: Record<string, unknown>, key: string): number | null => {
      const cost = doc[key] as { value?: unknown; currency?: unknown } | null;
      if (cost === null || typeof cost !== "object") return null;
      if (cost.currency !== "GBP") return null;
      return typeof cost.value === "number" && Number.isFinite(cost.value) ? cost.value : null;
    };
    const certificates: EpcCertificate[] = search.data.map((stub) => {
      const raw = JSON.parse(
        readFileSync(join(dir, "certs", `${stub.certificateNumber as string}.json`), "utf8"),
      ) as { data?: Record<string, unknown> } & Record<string, unknown>;
      const doc = (raw.data ?? raw) as Record<string, unknown>;
      const dwelling = doc.dwelling_type as { value?: string } | string | null;
      return {
        certificateNumber: stub.certificateNumber as string,
        addressLine1:
          (doc.address_line_1 as string | null) ?? (stub.addressLine1 as string | null) ?? null,
        addressLine2:
          (doc.address_line_2 as string | null) ?? (stub.addressLine2 as string | null) ?? null,
        addressLine3:
          (doc.address_line_3 as string | null) ?? (stub.addressLine3 as string | null) ?? null,
        postTown: (doc.post_town as string | null) ?? (stub.postTown as string | null) ?? null,
        postcode: (doc.postcode as string) ?? (stub.postcode as string),
        uprn: (doc.uprn as string | null) ?? (stub.uprn as string | null) ?? null,
        band:
          (doc.current_energy_efficiency_band as string | null) ??
          (stub.currentEnergyEfficiencyBand as string | null) ??
          null,
        ratingCurrent: (doc.energy_rating_current as number | null) ?? null,
        potentialBand: (doc.potential_energy_efficiency_band as string | null) ?? null,
        totalFloorArea: (doc.total_floor_area as number | null) ?? null,
        dwellingType:
          typeof dwelling === "object" && dwelling !== null
            ? (dwelling.value ?? null)
            : (dwelling ?? null),
        assessmentType: (doc.assessment_type as string | null) ?? null,
        registrationDate:
          (doc.registration_date as string | null) ??
          (stub.registrationDate as string | null) ??
          null,
        heatingCostCurrent: costOf(doc, "heating_cost_current"),
        hotWaterCostCurrent: costOf(doc, "hot_water_cost_current"),
        lightingCostCurrent: costOf(doc, "lighting_cost_current"),
        heatingCostPotential: costOf(doc, "heating_cost_potential"),
        hotWaterCostPotential: costOf(doc, "hot_water_cost_potential"),
        lightingCostPotential: costOf(doc, "lighting_cost_potential"),
      };
    });
    return artefact(certificates);
  }

  const FIXTURE_ARTEFACTS = new Map<string, EpcArtefact>([
    ["CM3 2JT", fixtureArtefact("CM3 2JT")],
    ["E16 1GN", fixtureArtefact("E16 1GN")],
    ["KT17 1FH", fixtureArtefact("KT17 1FH")],
    ["CM1 6ER", fixtureArtefact("CM1 6ER")],
  ]);

  class FixtureEpcSource extends FakeAreaSource {
    override async epcArtefact(postcode: string) {
      return FIXTURE_ARTEFACTS.get(postcode) ?? null;
    }
    override async loadEpc() {
      // The fixture artefacts are already filed.
    }
  }
  const fixtureSource = new FixtureEpcSource();

  const BEAULIEU_DIR = directory({
    postcode: "CM1 6ER",
    latitude: 51.7425,
    longitude: 0.492,
    council: "Chelmsford",
    lsoaCode: "E01000002",
    msoaCode: null,
  });
  const BEAULIEU = home(BEAULIEU_DIR, {
    label: "49 George Heard Crescent",
    paon: "49",
    street: "GEORGE HEARD CRESCENT",
  });
  const BIRKDALE_2 = home(BIRKDALE_DIR, {
    label: "2 Birkdale Rise",
    paon: "2",
    street: "BIRKDALE RISE",
  });

  const SPREAD_EXPLAINER =
    "The spread counts certificates, not homes: a home assessed more than once appears more than once, and most homes in a postcode have no certificate at all — a certificate exists only where a home was built, sold or let since the register began. It describes what the register holds for the postcode, and says nothing about any one home.";

  const BIRKDALE_SPREAD = {
    grainLine: "the postcode's recorded certificates",
    certificateCount: 42,
    explainer: SPREAD_EXPLAINER,
    rows: [
      {
        kind: "predicted",
        count: 38,
        bands: [{ band: "B", count: 38, pct: 100 }],
        line: "of the 38 predicted (SAP) certificates recorded for this postcode, 38 are band B (100 percent)",
      },
      {
        kind: "assessed",
        count: 4,
        bands: [
          { band: "C", count: 1, pct: 25 },
          { band: "D", count: 3, pct: 75 },
        ],
        line: "of the 4 assessments of existing homes (RdSAP) recorded for this postcode, 1 is band C (25 percent) and 3 are band D (75 percent)",
      },
    ],
  };

  it("Birkdale: both rows serve, split as filed — 38 predicted all B; 4 assessed, C 1 and D 3", async () => {
    const { sections } = await bundle(BIRKDALE, fixtureSource);
    expect(sections.epc.state).toBe("served");
    expect(sections.epc.certificateCountAtPostcode).toBe(42);
    expect(sections.epc.spread).toEqual(BIRKDALE_SPREAD);
  });

  it("Exeter: 12 certificates — 10 predicted all B; 2 assessed, B 1 and C 1", async () => {
    const { sections } = await bundle(EXETER, fixtureSource);
    expect(sections.epc.spread).toEqual({
      grainLine: "the postcode's recorded certificates",
      certificateCount: 12,
      explainer: SPREAD_EXPLAINER,
      rows: [
        {
          kind: "predicted",
          count: 10,
          bands: [{ band: "B", count: 10, pct: 100 }],
          line: "of the 10 predicted (SAP) certificates recorded for this postcode, 10 are band B (100 percent)",
        },
        {
          kind: "assessed",
          count: 2,
          bands: [
            { band: "B", count: 1, pct: 50 },
            { band: "C", count: 1, pct: 50 },
          ],
          line: "of the 2 assessments of existing homes (RdSAP) recorded for this postcode, 1 is band B (50 percent) and 1 is band C (50 percent)",
        },
      ],
    });
  });

  it("Minerva: a single predicted row — 25, all B, on the real documents; no assessed row serves", async () => {
    const { sections } = await bundle(MINERVA, fixtureSource);
    expect(sections.epc.spread).toEqual({
      grainLine: "the postcode's recorded certificates",
      certificateCount: 25,
      explainer: SPREAD_EXPLAINER,
      rows: [
        {
          kind: "predicted",
          count: 25,
          bands: [{ band: "B", count: 25, pct: 100 }],
          line: "of the 25 predicted (SAP) certificates recorded for this postcode, 25 are band B (100 percent)",
        },
      ],
    });
  });

  it("Beaulieu: a single predicted row — 49, all B, from the captured register documents", async () => {
    const { sections } = await bundle(BEAULIEU, fixtureSource);
    expect(sections.epc.state).toBe("served");
    expect(sections.epc.spread).toEqual({
      grainLine: "the postcode's recorded certificates",
      certificateCount: 49,
      explainer: SPREAD_EXPLAINER,
      rows: [
        {
          kind: "predicted",
          count: 49,
          bands: [{ band: "B", count: 49, pct: 100 }],
          line: "of the 49 predicted (SAP) certificates recorded for this postcode, 49 are band B (100 percent)",
        },
      ],
    });
  });

  it("no comparison: the spread is identical whatever the checked home's own band, and carries no home-derived field", async () => {
    const birkdale = await bundle(BIRKDALE, fixtureSource);
    const birkdale2 = await bundle(BIRKDALE_2, fixtureSource);
    // The two homes' own answers genuinely differ (band B
    // against band C) — and the spread does not move.
    expect(birkdale.sections.epc.headlineBand).toBe("B");
    expect(birkdale2.sections.epc.headlineBand).toBe("C");
    expect(birkdale2.sections.epc.spread).toEqual(birkdale.sections.epc.spread);
    // The block's shape is closed: nothing in it is derived
    // from the home's certificates (the D23 rule, applied to
    // bands and pinned structurally as at M6.14).
    const spread = birkdale.sections.epc.spread;
    if (!spread) throw new Error("expected a spread");
    expect(Object.keys(spread).sort()).toEqual(
      ["certificateCount", "explainer", "grainLine", "rows"].sort(),
    );
    for (const row of spread.rows) {
      expect(Object.keys(row).sort()).toEqual(["bands", "count", "kind", "line"].sort());
      for (const band of row.bands)
        expect(Object.keys(band).sort()).toEqual(["band", "count", "pct"].sort());
    }
    // No certificate is referenced: not the home's own, not
    // any other.
    expect(JSON.stringify(spread)).not.toContain("2490-1633-0432-1002-3023");
  });

  it("the spread serves at rung 2 while the home's certificates serve needs-exact-home", async () => {
    const rung1 = await bundle(BIRKDALE, fixtureSource);
    const rung2 = await bundle(addressList(BIRKDALE_DIR), fixtureSource);
    expect(rung2.sections.epc.state).toBe("needs-exact-home");
    expect(rung2.sections.epc.certificates).toEqual([]);
    expect(rung2.sections.epc.spread).toEqual(rung1.sections.epc.spread);
    expect(rung2.sections.epc.spread).toEqual(BIRKDALE_SPREAD);
  });

  it("the spread serves whole in the none-matching state — it completes the count's context", async () => {
    const nowhere = home(BIRKDALE_DIR, {
      label: "999 Birkdale Rise",
      paon: "999",
      street: "BIRKDALE RISE",
    });
    const { sections } = await bundle(nowhere, fixtureSource);
    expect(sections.epc.state).toBe("none-matching");
    expect(sections.epc.spread).toEqual(BIRKDALE_SPREAD);
  });

  it("the headline projection cannot carry the spread (report depth)", async () => {
    const built = await bundle(BIRKDALE, fixtureSource);
    const headline = projectHeadline(built);
    expect(headline).not.toBeNull();
    if (!headline) return;
    expect(Object.keys(headline.epc).sort()).toEqual(
      ["headlineAssessmentLabel", "headlineBand", "line", "state"].sort(),
    );
    expect(JSON.stringify(headline)).not.toContain("certificates recorded for this postcode");
  });

  it("no area energy verdict wording appears in any golden spread", async () => {
    for (const resolution of [BIRKDALE, EXETER, MINERVA, BEAULIEU]) {
      const { sections } = await bundle(resolution, fixtureSource);
      const text = JSON.stringify(sections.epc.spread).toLowerCase();
      for (const banned of [
        "efficient area",
        "efficient postcode",
        "energy-efficient area",
        "energy-efficient postcode",
        "well-insulated",
        "poorly insulated",
        "insulated postcode",
        "green area",
        "green postcode",
      ])
        expect(text, `spread contains "${banned}"`).not.toContain(banned);
    }
  });
});

// --- Planning applications: the hand-off (M6.12, D31) -----------------

describe("planning applications — the hand-off", () => {
  const GOVUK_LINK = {
    label: "Search the register of planning decisions (GOV.UK)",
    url: "https://www.gov.uk/search-register-planning-decisions",
  };
  const NI_LINK = {
    label: "Northern Ireland Public Register",
    url: "https://planningregister.planningsystemni.gov.uk/simple-search",
  };

  it("the universal three: the filed council named, the GOV.UK signpost carried", async () => {
    const cases = [
      [BIRKDALE, BIRKDALE_DIR, "Braintree"],
      [EXETER, EXETER_DIR, "Newham"],
      [MINERVA, MINERVA_DIR, "Epsom and Ewell"],
    ] as const;
    for (const [resolution, dir, council] of cases) {
      const { sections } = await bundle(resolution);
      const planning = sections.planningApplications;
      expect(planning.state).toBe("handed-off");
      // The same string the council-tax section joins on:
      // the resolution's own filed directory council.
      expect(planning.council).toBe(council);
      expect(planning.council).toBe(dir.council);
      expect(planning.line).toBe(
        `planning applications for this area are published on the planning register kept by ${council} — we do not hold a copy, so no applications are listed here; the link below takes you to the official search, where you enter the postcode`,
      );
      expect(planning.link).toEqual(GOVUK_LINK);
      // The section carries no filed dataset to stamp.
      expect(planning.depth).toBe("report");
      expect(planning.grain).toBe("area");
      expect(planning.grainLine).toBe("the council's planning register for this area");
      expect(planning.sourceName).toBeNull();
      expect(planning.sourceDate).toBeNull();
      expect(planning.sourceLine).toBeNull();
    }
  });

  it("the explainer carries D14's guardrail in the section itself", async () => {
    const { sections } = await bundle(BIRKDALE);
    expect(sections.planningApplications.explainer).toBe(
      "Planning applications are published by the council on its own planning register. We do not hold a copy of any council's register, so this check names the council and points you to the official search instead of summarising applications it has not seen. An application is a proposal, not a decision: being published does not mean it was permitted, and permission does not mean anything has been built.",
    );
  });

  it("Cardiff: the Wales form — same GOV.UK signpost, the Welsh council named", async () => {
    const { sections } = await bundle(C8);
    const planning = sections.planningApplications;
    expect(planning.state).toBe("handed-off");
    expect(planning.council).toBe("Cardiff");
    expect(planning.line).toBe(
      "planning applications for this area are published on the planning register kept by Cardiff — we do not hold a copy, so no applications are listed here; the link below takes you to the official search, where you enter the postcode",
    );
    expect(planning.link).toEqual(GOVUK_LINK);
  });

  it("Scotland: the council named and NO link — there is no single Scottish register", async () => {
    const { sections } = await bundle(SCOTLAND);
    const planning = sections.planningApplications;
    expect(planning.state).toBe("handed-off");
    expect(planning.council).toBe("City of Edinburgh");
    expect(planning.line).toBe(
      "planning applications for this area are published by City of Edinburgh on its own website — we do not hold a copy, so no applications are listed here, and there is no single Scottish register to link to",
    );
    expect(planning.link).toBeNull();
  });

  it("Northern Ireland: the one link that lands on a real register", async () => {
    const { sections } = await bundle(BELFAST);
    const planning = sections.planningApplications;
    expect(planning.state).toBe("handed-off");
    expect(planning.council).toBe("Belfast");
    expect(planning.line).toBe(
      "planning applications for this area are published on the Northern Ireland Public Register — we do not hold a copy, so no applications are listed here; the link below takes you to the register, where you can search by postcode",
    );
    expect(planning.link).toEqual(NI_LINK);
  });

  it("Mid Ulster: the exception line, and no register link that would exclude them", async () => {
    const { sections } = await bundle(MID_ULSTER);
    const planning = sections.planningApplications;
    expect(planning.state).toBe("handed-off");
    expect(planning.council).toBe("Mid Ulster");
    expect(planning.line).toBe(
      "planning applications for this area are published by Mid Ulster District Council on its own planning portal — it is the one Northern Ireland council not on the national register; we do not hold a copy, so no applications are listed here",
    );
    expect(planning.link).toBeNull();
  });

  it("an unknown nation: the council named if the directory carries one, and no link", async () => {
    const dir = directory({
      postcode: "ZZ1 1ZZ",
      latitude: 51.5,
      longitude: 0.5,
      council: "Braintree",
      lsoaCode: null,
      msoaCode: null,
    });
    const { sections } = await bundle(home(dir, { label: "Nowhere", paon: "1" }));
    const planning = sections.planningApplications;
    expect(planning.state).toBe("handed-off");
    expect(planning.council).toBe("Braintree");
    expect(planning.line).toBe(
      "planning applications for this area are published on the planning register kept by Braintree — we do not hold a copy, so no applications are listed here",
    );
    expect(planning.link).toBeNull();
  });

  it("a directory row with no council: the unnamed form, the link still by nation", async () => {
    const dir = directory({
      postcode: "ZZ1 1ZA",
      latitude: 51.5,
      longitude: 0.5,
      council: null,
      lsoaCode: "E01000001",
      msoaCode: null,
    });
    const { sections } = await bundle(home(dir, { label: "Unnamed", paon: "1" }));
    const planning = sections.planningApplications;
    expect(planning.state).toBe("handed-off");
    expect(planning.council).toBeNull();
    expect(planning.line).toBe(
      "planning applications are published by the local council on its planning register — we do not hold a copy, so no applications are listed here",
    );
    expect(planning.link).toEqual(GOVUK_LINK);
  });

  it("no emitted URL carries a postcode, and no line offers our own search", async () => {
    const cases = [
      [BIRKDALE, BIRKDALE_DIR],
      [EXETER, EXETER_DIR],
      [MINERVA, MINERVA_DIR],
      [C8, C8_DIR],
      [SCOTLAND, SCOTLAND_DIR],
      [BELFAST, BELFAST_DIR],
      [MID_ULSTER, MID_ULSTER_DIR],
    ] as const;
    for (const [resolution, dir] of cases) {
      const { sections } = await bundle(resolution);
      const planning = sections.planningApplications;
      if (planning.link) {
        expect(planning.link.url).not.toContain(dir.postcode);
        expect(planning.link.url).not.toContain("?");
      }
      const text = `${planning.line} ${planning.link?.label ?? ""}`.toLowerCase();
      for (const banned of [
        "check planning applications",
        "search planning applications here",
        "view applications",
        "no planning applications",
        "none found",
      ])
        expect(text).not.toContain(banned);
    }
  });
});

// --- company ownership (M6.13, decision D32) --------------------------

describe("company ownership — behind the flag", () => {
  const ON = { companyOwnershipEnabled: true };

  async function bundleOn(resolution: AddressResolution, src: AreaDataSource = source) {
    const built = await buildAreaBundle(resolution, src, ON);
    if (built.kind !== "area-bundle") throw new Error("expected an area bundle");
    return built;
  }

  it("flag OFF (the shipped default): the key is absent — not null, not a named state — and the tables are never read", async () => {
    const fresh = new FakeAreaSource();
    for (const resolution of [BIRKDALE, EXETER, MINERVA, JUNO]) {
      const built = await bundle(resolution, fresh);
      expect("companyOwnership" in built.sections).toBe(false);
      const json = JSON.stringify(built);
      expect(json).not.toContain("SAGE HOMES");
      expect(json).not.toContain("ADRIATIC");
      expect(json).not.toContain("companyOwnership");
      const headline = projectHeadline(built);
      expect(headline === null || !("companyOwnership" in headline)).toBe(true);
    }
    // The default path makes NO read of the company tables.
    expect(fresh.companyCalls).toEqual([]);
  });

  it("the matcher springs every trap in the fixture set", () => {
    const addr = (resolution: AddressResolution) => {
      if (resolution.kind !== "home") throw new Error("expected a home resolution");
      return resolution.address;
    };
    const [aa53500, aa53502] = BIRKDALE_TITLES;
    const byNumber = new Map(EPSOM_TITLES.map((t) => [t.titleNumber, t]));
    // Numeric membership, never substring.
    expect(companyTitleMatch(aa53500, addr(BIRKDALE))).toBeNull();
    expect(companyTitleMatch(aa53502, addr(BIRKDALE))).toBeNull();
    expect(companyTitleMatch(aa53500, addr(BIRKDALE_4))).toBeNull();
    expect(companyTitleMatch(aa53502, addr(BIRKDALE_4))).toBeNull();
    expect(companyTitleMatch(aa53500, addr(BIRKDALE_9))).toBeNull();
    expect(companyTitleMatch(aa53502, addr(BIRKDALE_9))).toBeNull();
    // 39 is enumerated in one title AND inside the other's range.
    expect(companyTitleMatch(aa53500, addr(BIRKDALE_39))).toBe("own");
    expect(companyTitleMatch(aa53502, addr(BIRKDALE_39))).toBe("own");
    expect(companyTitleMatch(aa53502, addr(BIRKDALE_44))).toBe("own");
    expect(companyTitleMatch(aa53500, addr(BIRKDALE_44))).toBeNull();
    // The range form is the building's title, never the flat's own.
    expect(companyTitleMatch(byNumber.get("SY876459")!, addr(MINERVA))).toBe("building");
    expect(companyTitleMatch(byNumber.get("SY876459")!, addr(JUNO))).toBeNull();
    expect(companyTitleMatch(byNumber.get("SY874424")!, addr(JUNO))).toBe("building");
    expect(companyTitleMatch(byNumber.get("SY874424")!, addr(MINERVA))).toBeNull();
    // The bare-building form: every flat in that building, no other.
    expect(companyTitleMatch(byNumber.get("SY874425")!, addr(JUPITER))).toBe("building");
    expect(companyTitleMatch(byNumber.get("SY874425")!, addr(JUNO))).toBeNull();
    // Single-flat forms: the flat's own title, in its building only.
    expect(companyTitleMatch(byNumber.get("SY857898")!, addr(JUNO))).toBe("own");
    expect(companyTitleMatch(byNumber.get("SY857898")!, addr(JUNO_FLAT2))).toBeNull();
    expect(companyTitleMatch(byNumber.get("SY873488")!, addr(JUNO_FLAT2))).toBe("own");
    expect(companyTitleMatch(byNumber.get("SY873488")!, addr(JUNO))).toBeNull();
    expect(companyTitleMatch(byNumber.get("SY857896")!, addr(JUNO))).toBeNull();
  });

  it("Birkdale: the clean No, over a slice provably holding two SAGE titles", async () => {
    const { sections } = await bundleOn(BIRKDALE);
    const company = sections.companyOwnership;
    expect(company).toBeDefined();
    if (!company) return;
    expect(company.state).toBe("not-company-owned");
    expect(company.line).toBe(
      "this home's title is not in HM Land Registry's company-ownership data as at November 2026",
    );
    expect(company.ownTitles).toEqual([]);
    expect(company.buildingTitles).toEqual([]);
    expect(company.buildingLine).toBeNull();
    expect(company.depth).toBe("report");
    expect(company.grain).toBe("home");
    expect(company.sourceName).toBe(CCOD_SOURCE);
    expect(company.sourceDate).toBe("2026-11-01");
    expect(company.sourceLine).toBe(`${CCOD_SOURCE} — data to 1 November 2026`);
    expect(company.attributionLine).toBe(
      "Information produced by HM Land Registry © Crown copyright 2026",
    );
    // The No's three holes ride in the explainer, every time.
    expect(company.explainer).toContain("charities are excluded from both datasets by category");
    expect(company.explainer).toContain(
      "roughly a tenth of land in England and Wales is unregistered",
    );
    expect(company.explainer).toContain("a sale still being registered has not reached the data");
  });

  it("39 Birkdale Rise: BOTH SAGE titles match, and both serve whole with the snapshot", async () => {
    const { sections } = await bundleOn(BIRKDALE_39);
    const company = sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("served");
    expect(company.line).toBe("a registered proprietor of this home's title is a company");
    expect(company.ownTitles.map((t) => t.titleNumber)).toEqual(["AA53500", "AA53502"]);
    for (const title of company.ownTitles) {
      expect(title.proprietorName).toBe("SAGE HOMES RP LIMITED");
      expect(title.companyNumber).toBe("11217910");
      expect(title.numberState).toBe("recorded");
      expect(title.tenure).toBe("Freehold");
      expect(title.line).toBe("a registered proprietor of this title is a company");
      expect(title.snapshotLine).toBeNull();
      expect(title.snapshot?.companyName).toBe("SAGE HOMES RP LIMITED");
      expect(title.snapshot?.status).toBe("Active");
      expect(title.snapshot?.incorporationDate).toBe("2018-02-21");
      expect(title.snapshot?.sicCodes).toEqual([
        "68201 - Renting and operating of Housing Association real estate",
      ]);
      expect(title.snapshot?.sourceLine).toBe(`${CH_SOURCE} — data to 1 November 2026`);
      expect(title.attributionLine).toBe(
        "Information produced by HM Land Registry © Crown copyright 2026",
      );
      // Filed but never served.
      expect(JSON.stringify(title)).not.toContain("153243");
      expect(JSON.stringify(title)).not.toContain("651439");
    }
    expect(company.buildingTitles).toEqual([]);
  });

  it("Minerva Flat 4: own-title No AND the building line — Adriatic, Guernsey, no number recorded", async () => {
    const { sections } = await bundleOn(MINERVA);
    const company = sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("not-company-owned");
    expect(company.line).toBe(
      "this home's title is not in HM Land Registry's company-ownership data as at November 2026",
    );
    expect(company.ownTitles).toEqual([]);
    expect(company.buildingLine).toBe(
      "this home's building is held on a separate title from this home's own title, and a company is a registered proprietor of that building title",
    );
    expect(company.buildingTitles).toHaveLength(1);
    const title = company.buildingTitles[0];
    expect(title.titleNumber).toBe("SY876459");
    expect(title.dataset).toBe("ocod");
    expect(title.tenure).toBe("Freehold");
    expect(title.proprietorName).toBe("ADRIATIC LAND 11 LIMITED");
    expect(title.companyNumber).toBeNull();
    expect(title.numberState).toBe("no-number-recorded");
    expect(title.snapshotLine).toBe("the register records no company number for this proprietor");
    expect(title.snapshot).toBeNull();
    expect(title.countryIncorporated).toBe("GUERNSEY");
    expect(title.line).toBe("a registered proprietor of this building's title is a company");
    expect(title.sourceLine).toBe(`${OCOD_SOURCE} — data to 1 November 2026`);
  });

  it("Juno Flat 4: a Clarion own-title Yes — the number as filed, its snapshot state named, never repaired — PLUS the Adriatic building line", async () => {
    const { sections } = await bundleOn(JUNO);
    const company = sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("served");
    expect(company.ownTitles.map((t) => t.titleNumber)).toEqual(["SY857898"]);
    const own = company.ownTitles[0];
    expect(own.proprietorName).toBe("CLARION HOUSING ASSOCIATION LIMITED");
    expect(own.companyNumber).toBe("7686");
    expect(own.numberState).toBe("number-not-in-the-snapshot");
    expect(own.snapshotLine).toBe(
      "no Companies House snapshot is held under company number 7686 as filed",
    );
    expect(own.snapshot).toBeNull();
    expect(own.proprietorshipCategory).toBe("Community Benefit Society (Company)");
    expect(own.tenure).toBe("Leasehold");
    // The product's own keying is never substituted.
    expect(JSON.stringify(company)).not.toContain("RS007686");
    expect(company.buildingTitles.map((t) => t.titleNumber)).toEqual(["SY874424"]);
    expect(company.buildingLine).not.toBeNull();
  });

  it("Juno Flat 2: the SOMY title serves with its Companies House snapshot attached", async () => {
    const { sections } = await bundleOn(JUNO_FLAT2);
    const company = sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("served");
    expect(company.ownTitles.map((t) => t.titleNumber)).toEqual(["SY873488"]);
    const own = company.ownTitles[0];
    expect(own.proprietorName).toBe("SOMY RESIDENTIAL LIMITED");
    expect(own.numberState).toBe("recorded");
    expect(own.snapshot?.companyName).toBe("SOMY RESIDENTIAL LIMITED");
    expect(own.snapshot?.status).toBe("Active");
    expect(own.snapshot?.incorporationDate).toBe("2021-10-13");
    expect(own.snapshot?.sicCodes).toEqual([
      "68209 - Other letting and operating of own or leased real estate",
    ]);
  });

  it("Jupiter Flat 4: the bare-building form is its building line, and nothing is its own title", async () => {
    const { sections } = await bundleOn(JUPITER);
    const company = sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("not-company-owned");
    expect(company.ownTitles).toEqual([]);
    expect(company.buildingTitles.map((t) => t.titleNumber)).toEqual(["SY874425"]);
  });

  it("Exeter: a No at own-title and building level, over an empty slice with filed tables", async () => {
    const { sections } = await bundleOn(EXETER);
    const company = sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("not-company-owned");
    expect(company.ownTitles).toEqual([]);
    expect(company.buildingTitles).toEqual([]);
    expect(company.buildingLine).toBeNull();
  });

  it("rung 2 serves needs-exact-home and nothing else — no read, no title payload", async () => {
    const fresh = new FakeAreaSource();
    const built = await buildAreaBundle(addressList(MINERVA_DIR), fresh, ON);
    if (built.kind !== "area-bundle") throw new Error("expected an area bundle");
    const company = built.sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("needs-exact-home");
    expect(company.line).toBe(
      "choose the exact home to see whether a company is a registered proprietor of its title",
    );
    expect(company.ownTitles).toEqual([]);
    expect(company.buildingTitles).toEqual([]);
    const json = JSON.stringify(company);
    expect(json).not.toContain("SY876459");
    expect(json).not.toContain("ADRIATIC");
    expect(fresh.companyCalls).toEqual([]);
  });

  it("rung 3: the company reason joins the record ONLY with the flag on", async () => {
    const wider = {
      rung: 3,
      kind: "wider-area",
      outward: "CM3",
      label: "Wider area — CM3, not this exact home",
      postcodeCount: 541,
    } as const;
    const on = await buildAreaBundle(wider, source, ON);
    if (on.kind !== "wider-area") throw new Error("expected wider-area");
    expect(Object.keys(on.area.sections)).toHaveLength(17);
    expect(on.area.sections.companyOwnership).toEqual({
      state: "unavailable",
      reason: "company ownership needs an exact postcode",
    });
    const off = await buildAreaBundle(wider, source);
    if (off.kind !== "wider-area") throw new Error("expected wider-area");
    expect(Object.keys(off.area.sections)).toHaveLength(16);
    expect("companyOwnership" in off.area.sections).toBe(false);
  });

  it("an unfiled dataset serves not-filed, never a No — the guard is per-dataset", async () => {
    for (const counts of [
      { ccodFiledCount: 0, ocodFiledCount: 90950 },
      { ccodFiledCount: 4485124, ocodFiledCount: 0 },
    ]) {
      const fresh = new FakeAreaSource();
      fresh.companyOverride = { ...companyFacts(BIRKDALE_TITLES), ...counts };
      const { sections } = await bundleOn(BIRKDALE, fresh);
      const company = sections.companyOwnership;
      if (!company) throw new Error("expected the section");
      expect(company.state).toBe("not-filed");
      expect(company.line).toBe(
        "the company-ownership data is not filed yet, so no company-ownership answer can be given yet",
      );
      expect(company.ownTitles).toEqual([]);
    }
  });

  it("Scotland and Northern Ireland serve not-covered, naming the nation's own register — never a No", async () => {
    const scotland = (await bundleOn(SCOTLAND)).sections.companyOwnership;
    if (!scotland) throw new Error("expected the section");
    expect(scotland.state).toBe("not-covered");
    expect(scotland.line).toBe(
      "the company-ownership datasets cover England and Wales only — title information for Scotland is held by Registers of Scotland",
    );
    const ni = (await bundleOn(BELFAST)).sections.companyOwnership;
    if (!ni) throw new Error("expected the section");
    expect(ni.state).toBe("not-covered");
    expect(ni.line).toBe(
      "the company-ownership datasets cover England and Wales only — title information for Northern Ireland is held by Land & Property Services",
    );
  });

  it("Wales serves normally — the datasets cover England and Wales", async () => {
    const fresh = new FakeAreaSource();
    fresh.companyOverride = companyFacts([]);
    const { sections } = await bundleOn(C8, fresh);
    const company = sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("not-company-owned");
  });

  it("the additional-proprietor flag changes nothing in the sentence — it never asserts sole ownership", async () => {
    const fresh = new FakeAreaSource();
    fresh.companyOverride = companyFacts([{ ...BIRKDALE_TITLES[0], additionalProprietor: true }], {
      "11217910": SAGE_SNAPSHOT,
    });
    const { sections } = await bundleOn(BIRKDALE_39, fresh);
    const company = sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("served");
    expect(company.ownTitles).toHaveLength(1);
    expect(company.ownTitles[0].additionalProprietor).toBe(true);
    expect(company.ownTitles[0].line).toBe("a registered proprietor of this title is a company");
    const json = JSON.stringify(company).toLowerCase();
    expect(json).not.toContain("the owner is a company");
    expect(json).not.toContain("sole");
  });

  it("mixed editions: each part carries its own month, and the No is dated by the earlier edition", async () => {
    const fresh = new FakeAreaSource();
    const facts = companyFacts(EPSOM_TITLES, { "13678133": SOMY_SNAPSHOT, "7686": null });
    facts.editions.ocod = { sourceName: OCOD_SOURCE, sourceDate: "2026-10-01" };
    facts.titles = facts.titles.map((t) =>
      t.dataset === "ocod" ? { ...t, sourceDate: "2026-10-01" } : t,
    );
    fresh.companyOverride = facts;
    const { sections } = await bundleOn(JUNO, fresh);
    const company = sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.ownTitles[0].sourceLine).toBe(`${CCOD_SOURCE} — data to 1 November 2026`);
    expect(company.buildingTitles[0].sourceLine).toBe(`${OCOD_SOURCE} — data to 1 October 2026`);

    const noFresh = new FakeAreaSource();
    const noFacts = companyFacts(BIRKDALE_TITLES, { "11217910": SAGE_SNAPSHOT });
    noFacts.editions.ocod = { sourceName: OCOD_SOURCE, sourceDate: "2026-10-01" };
    noFresh.companyOverride = noFacts;
    const no = (await bundleOn(BIRKDALE, noFresh)).sections.companyOwnership;
    if (!no) throw new Error("expected the section");
    expect(no.line).toBe(
      "this home's title is not in HM Land Registry's company-ownership data as at October 2026",
    );
    expect(no.sourceLine).toBe(`${OCOD_SOURCE} — data to 1 October 2026`);
  });

  it("the register's address text never serves — the licence's core serving rule, proven", async () => {
    for (const resolution of [BIRKDALE, BIRKDALE_39, EXETER, MINERVA, JUNO, JUNO_FLAT2, JUPITER]) {
      const { sections } = await bundleOn(resolution);
      const json = JSON.stringify(sections.companyOwnership);
      for (const fragment of [
        "CERES CRESCENT",
        "HATFIELD PEVEREL",
        "CHELMSFORD",
        "ORION HOUSE",
        "ROYAL PLAZA",
        "PETER PORT",
        "HAMPSTEAD ROAD",
        "FIR TREE ROAD",
        "ALDESGATE",
        "Birkdale Rise,",
      ])
        expect(json, `${resolution.kind} bundle leaks "${fragment}"`).not.toContain(fragment);
    }
  });

  it("no verdict phrasing beyond the filed facts, anywhere in the section", async () => {
    for (const resolution of [BIRKDALE, BIRKDALE_39, MINERVA, JUNO, JUPITER]) {
      const { sections } = await bundleOn(resolution);
      const text = JSON.stringify(sections.companyOwnership).toLowerCase();
      for (const banned of [
        "corporate landlord",
        "landlord",
        "institutional",
        "beneficial owner",
        "parent company",
        "the owner is a company",
      ])
        expect(text, `${resolution.kind} bundle contains "${banned}"`).not.toContain(banned);
    }
  });

  it("report depth, structurally: the headline projection cannot carry the section, flag on or off", async () => {
    const built = await bundleOn(BIRKDALE_39);
    expect(built.sections.companyOwnership?.depth).toBe("report");
    const headline = projectHeadline(built);
    if (!headline) throw new Error("expected a headline projection");
    expect(Object.keys(headline).sort()).toEqual(
      [
        "air",
        "broadband",
        "constraints",
        "councilTax",
        "epc",
        "heritage",
        "nature",
        "noise",
        "postcode",
      ].sort(),
    );
    expect(JSON.stringify(headline)).not.toContain("SAGE HOMES");
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
    // The section line and explainer carry no limit
    // comparison — since M6.29 (D50) the comparison
    // serves only in the yardsticks block, at report
    // depth, in the tests below.
    expect((birkdale.sections.air.line ?? "").toLowerCase()).not.toContain("limit");
    expect(birkdale.sections.air.explainer.toLowerCase()).not.toContain("limit");

    const exeter = await bundle(EXETER);
    if (exeter.sections.air.state === "served") expect(exeter.sections.air.no2).toBe(21.71409);
    const minerva = await bundle(MINERVA);
    if (minerva.sections.air.state === "served") expect(minerva.sections.air.no2).toBe(12.49256);
  });

  it("the yardstick constants are the pinned six, in one place (M6.29)", () => {
    // Pinned against the instruments: UK legal limits
    // from SI 2010/1001 Schedule 2 as amended; WHO
    // guidelines from the WHO 2021 air quality
    // guidelines. Pollutant order NO2, PM2.5, PM10.
    expect(AIR_YARDSTICKS.pollutants).toEqual([
      { pollutant: "NO2", ukLimit: 40, whoGuideline: 10 },
      { pollutant: "PM2.5", ukLimit: 20, whoGuideline: 5 },
      { pollutant: "PM10", ukLimit: 40, whoGuideline: 15 },
    ]);
    // The PM2.5 guard: the limit is the stage-2 value
    // 20 — the 2040 target (10) is never a yardstick
    // limit, and appears as no pollutant's limit here.
    expect(AIR_YARDSTICKS.pollutants.find((p) => p.pollutant === "PM2.5")?.ukLimit).toBe(20);
    expect(AIR_YARDSTICKS.pollutants.some((p) => (p.ukLimit as number) === 10)).toBe(false);
    expect(AIR_YARDSTICKS.basisLine).toBe(
      "A figure's position against these yardsticks is a scale for reading the figure. Whether a legal limit is met is decided for whole zones from monitoring and modelling together — not from one square's modelled background figure, and never for an individual home.",
    );
  });

  it("the yardstick block serves the golden positions with the pinned lines verbatim (M6.29)", async () => {
    const birkdale = await bundle(BIRKDALE);
    if (birkdale.sections.air.state !== "served") throw new Error("expected served");
    const yardsticks = birkdale.sections.air.yardsticks;
    expect(yardsticks?.basisLine).toBe(AIR_YARDSTICKS.basisLine);
    // Pollutant order is NO2, PM2.5, PM10 (D50's listing).
    expect(yardsticks?.pollutants.map((p) => p.pollutant)).toEqual(["NO2", "PM2.5", "PM10"]);
    const byPollutant = Object.fromEntries(
      (yardsticks?.pollutants ?? []).map((p) => [p.pollutant, p]),
    );
    // Birkdale: NO2 below both, PM2.5 between, PM10 below both.
    expect(byPollutant.NO2).toMatchObject({
      value: 8.150298,
      ukLimit: 40,
      whoGuideline: 10,
      position: "below-both",
      summaryLine: "within the UK legal limit, and below the stricter WHO guideline",
    });
    expect(byPollutant.NO2?.yardstickLine).toBe(
      "NO2 yardsticks: the UK legal limit is 40 µg/m³ as an annual mean (the Air Quality Standards Regulations 2010), and the World Health Organization's 2021 guideline is 10 µg/m³ as an annual mean.",
    );
    expect(byPollutant["PM2.5"]).toMatchObject({
      value: 7.124671,
      ukLimit: 20,
      whoGuideline: 5,
      position: "between",
      // D50's pinned summary, character for character.
      summaryLine: "within the UK legal limit, but above the stricter WHO guideline",
    });
    expect(byPollutant.PM10).toMatchObject({ value: 12.54823, position: "below-both" });
    // The figure is never embedded in the yardstick prose.
    for (const p of yardsticks?.pollutants ?? [])
      expect(p.yardstickLine).not.toContain(String(p.value));

    const exeter = await bundle(EXETER);
    if (exeter.sections.air.state !== "served") throw new Error("expected served");
    // Exeter: all three between.
    expect(exeter.sections.air.yardsticks?.pollutants.map((p) => p.position)).toEqual([
      "between",
      "between",
      "between",
    ]);
    expect(
      exeter.sections.air.yardsticks?.pollutants.every(
        (p) => p.summaryLine === "within the UK legal limit, but above the stricter WHO guideline",
      ),
    ).toBe(true);

    const minerva = await bundle(MINERVA);
    if (minerva.sections.air.state !== "served") throw new Error("expected served");
    // Minerva: NO2 between, PM2.5 between, PM10 below both.
    expect(minerva.sections.air.yardsticks?.pollutants.map((p) => p.position)).toEqual([
      "between",
      "between",
      "below-both",
    ]);
  });

  // A source whose air square is whatever the test sets —
  // the above-limit case has no golden witness (prep
  // Section 2), so it is fixtured synthetically here, and
  // the boundary cases with it.
  class SyntheticAirSource extends FakeAreaSource {
    syntheticAir: { year: number; no2: number; pm25: number; pm10: number } | null = null;
    async airSquare() {
      if (!this.syntheticAir) return null;
      return {
        ...this.syntheticAir,
        sourceName: "Defra — Pollution Climate Mapping (PCM)",
        sourceDate: "2025-06-30",
      };
    }
  }

  it("the above-limit case serves its summary with the basis line (M6.29)", async () => {
    const src = new SyntheticAirSource();
    src.syntheticAir = { year: 2024, no2: 45.5, pm25: 20.5, pm10: 41 };
    const built = await bundle(BIRKDALE, src);
    if (built.sections.air.state !== "served") throw new Error("expected served");
    const yardsticks = built.sections.air.yardsticks;
    expect(yardsticks?.pollutants.map((p) => p.position)).toEqual([
      "above-uk-limit",
      "above-uk-limit",
      "above-uk-limit",
    ]);
    for (const p of yardsticks?.pollutants ?? [])
      expect(p.summaryLine).toBe("above the UK legal limit, and above the stricter WHO guideline");
    // The basis line travels with the block, verbatim —
    // the summary never stands alone (D57).
    expect(yardsticks?.basisLine).toBe(AIR_YARDSTICKS.basisLine);
  });

  it("the boundary semantics: at the limit reads within, at the guideline takes the at form (M6.29)", async () => {
    const src = new SyntheticAirSource();
    // NO2 exactly at its limit, PM2.5 exactly at its
    // guideline, PM10 marginally above its limit.
    src.syntheticAir = { year: 2024, no2: 40, pm25: 5, pm10: 40.000001 };
    const built = await bundle(BIRKDALE, src);
    if (built.sections.air.state !== "served") throw new Error("expected served");
    const byPollutant = Object.fromEntries(
      (built.sections.air.yardsticks?.pollutants ?? []).map((p) => [p.pollutant, p]),
    );
    expect(byPollutant.NO2?.position).toBe("between");
    expect(byPollutant.NO2?.summaryLine).toBe(
      "within the UK legal limit, but above the stricter WHO guideline",
    );
    expect(byPollutant["PM2.5"]?.position).toBe("below-both");
    expect(byPollutant["PM2.5"]?.summaryLine).toBe(
      "within the UK legal limit, and at the stricter WHO guideline",
    );
    expect(byPollutant.PM10?.position).toBe("above-uk-limit");

    // Marginally above the guideline flips to between;
    // marginally below stays below-both; exactly at the
    // PM10 guideline takes the at form.
    src.syntheticAir = { year: 2024, no2: 10.000001, pm25: 4.999999, pm10: 15 };
    const flipped = await bundle(BIRKDALE, src);
    if (flipped.sections.air.state !== "served") throw new Error("expected served");
    const flippedBy = Object.fromEntries(
      (flipped.sections.air.yardsticks?.pollutants ?? []).map((p) => [p.pollutant, p]),
    );
    expect(flippedBy.NO2?.position).toBe("between");
    expect(flippedBy["PM2.5"]?.position).toBe("below-both");
    expect(flippedBy["PM2.5"]?.summaryLine).toBe(
      "within the UK legal limit, and below the stricter WHO guideline",
    );
    expect(flippedBy.PM10?.position).toBe("below-both");
    expect(flippedBy.PM10?.summaryLine).toBe(
      "within the UK legal limit, and at the stricter WHO guideline",
    );
  });

  it("an unfiled square serves the not-filed state with the yardsticks key present, value null (M6.29)", async () => {
    const src = new SyntheticAirSource();
    const built = await bundle(BIRKDALE, src);
    expect(built.sections.air.state).toBe("not-filed");
    expect(built.sections.air).toHaveProperty("yardsticks", null);
  });

  // ---------------------------------------------------------------
  // Air Quality Management Areas (M6.30, decision D59): the
  // declared-area fact in the air section, report depth only.
  // The golden facts are the 2026-10-20 edition's, pinned at
  // the M6.30 prep and re-verified at build: Exeter inside
  // the Newham AQMA (No. 2); Minerva's nearest the Sutton
  // AQMA at 0.929 miles (served 0.93); Birkdale none within
  // 2 miles against the filed set of 374.
  // ---------------------------------------------------------------

  const AQMA_BASIS =
    "An Air Quality Management Area is an area a council has declared because the national air quality objectives are not being met there, or are not likely to be met. The council must publish an action plan for improving air quality in the area. It is a management designation for the area: it is not a measurement of the air at this home, and it does not say what the air at this home is like.";

  it("the AQMA inside state: Exeter serves the Newham AQMA (No. 2) as filed (M6.30)", async () => {
    const built = await bundle(EXETER);
    const aqma = built.sections.air.aqma;
    expect(aqma.state).toBe("inside");
    expect(aqma.name).toBe("Newham AQMA (No. 2)");
    expect(aqma.authority).toBe("London Borough of Newham");
    expect(aqma.pollutants).toEqual(["nitrogen dioxide (NO2)", "particulate matter (PM10)"]);
    // The prep's template is "declared by {authority}",
    // the authority verbatim as filed — its Exeter
    // instance sentence carries an extra "the" the
    // template does not; the template governs (an
    // authority like "Buckinghamshire" takes no "the").
    expect(aqma.line).toBe(
      "This postcode point falls inside the Newham AQMA (No. 2), declared by London Borough of Newham for nitrogen dioxide (NO2) and particulate matter (PM10).",
    );
    expect(aqma.basisLine).toBe(AQMA_BASIS);
    expect(aqma.miles).toBeNull();
    expect(aqma.filedCount).toBe(374);
    expect(aqma.sourceName).toBe("Defra UK-AIR — Air Quality Management Areas");
    expect(aqma.sourceDate).toBe("2026-10-20");
  });

  it("the AQMA nearest state: Minerva serves the Sutton AQMA with its boundary distance (M6.30)", async () => {
    const built = await bundle(MINERVA);
    const aqma = built.sections.air.aqma;
    expect(aqma.state).toBe("nearest");
    expect(aqma.name).toBe("Sutton AQMA");
    expect(aqma.authority).toBe("London Borough of Sutton");
    expect(aqma.pollutants).toEqual(["nitrogen dioxide (NO2)", "particulate matter (PM10)"]);
    expect(aqma.miles).toBe(0.93);
    expect(aqma.line).toBe(
      "This postcode point is not inside an Air Quality Management Area. The nearest is the Sutton AQMA (London Borough of Sutton), declared for nitrogen dioxide (NO2) and particulate matter (PM10): its nearest boundary is 0.93 miles from the postcode point.",
    );
    expect(aqma.basisLine).toBe(AQMA_BASIS);
  });

  it("the AQMA none state: Birkdale's line carries the filed count and the edition in words (M6.30)", async () => {
    const built = await bundle(BIRKDALE);
    const aqma = built.sections.air.aqma;
    expect(aqma.state).toBe("none");
    expect(aqma.line).toBe(
      "No Air Quality Management Area covers this postcode point, and none comes within 2 miles of it. This was checked against the complete filed set of 374 declared areas (Defra UK-AIR, edition 20 October 2026).",
    );
    expect(aqma.name).toBeNull();
    expect(aqma.miles).toBeNull();
    expect(aqma.filedCount).toBe(374);
    expect(aqma.basisLine).toBe(AQMA_BASIS);
  });

  it("the AQMA not-filed state: an unfiled layer serves the two-part line and nothing else (M6.30)", async () => {
    class NoAqmaSource extends FakeAreaSource {
      async aqmaFacts() {
        return {
          filedCount: 0,
          covering: [],
          nearestWithin: null,
          sourceName: null,
          sourceDate: null,
        };
      }
    }
    const built = await bundle(EXETER, new NoAqmaSource());
    const aqma = built.sections.air.aqma;
    expect(aqma.state).toBe("not-filed");
    expect(aqma.line).toBe(
      "Air Quality Management Area — the Air Quality Management Area data is not filed yet, so no Air Quality Management Area answer can be given yet",
    );
    expect(aqma.basisLine).toBeNull();
    expect(aqma.filedCount).toBeNull();
    expect(aqma.sourceName).toBeNull();
    expect(aqma.sourceDate).toBeNull();
  });

  it("the AQMA block is independent of the PCM square, in both directions (M6.30)", async () => {
    // Air filed, AQMA unfiled is the test above; here the
    // reverse: no PCM square (SyntheticAirSource with no
    // synthetic air returns null) still carries Birkdale's
    // filed AQMA answer.
    const src = new SyntheticAirSource();
    const built = await bundle(BIRKDALE, src);
    expect(built.sections.air.state).toBe("not-filed");
    expect(built.sections.air.yardsticks).toBeNull();
    expect(built.sections.air.aqma.state).toBe("none");
    expect(built.sections.air.aqma.filedCount).toBe(374);
  });

  it("multiple covering areas serve the first by the covering order, naming only it (M6.30)", async () => {
    class OverlapSource extends FakeAreaSource {
      async aqmaFacts() {
        return {
          filedCount: 374,
          covering: [
            { name: "Alpha AQMA", authority: "Alpha Council", detail: "NO2" },
            { name: "Beta AQMA", authority: "Beta Council", detail: "PM10" },
          ],
          nearestWithin: null,
          sourceName: "Defra UK-AIR — Air Quality Management Areas",
          sourceDate: "2026-10-20",
        };
      }
    }
    const built = await bundle(BIRKDALE, new OverlapSource());
    const aqma = built.sections.air.aqma;
    expect(aqma.state).toBe("inside");
    expect(aqma.name).toBe("Alpha AQMA");
    expect(aqma.line).toContain("Alpha AQMA");
    expect(aqma.line).not.toContain("Beta");
    expect(aqma.pollutants).toEqual(["nitrogen dioxide (NO2)"]);
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

// --- building safety (M6.16, D35) --------------------------------------

const OYSTER_DIR = directory({
  postcode: "BH15 2FN",
  latitude: 50.72,
  longitude: -1.982,
  council: "Bournemouth, Christchurch and Poole",
  lsoaCode: "E01013500",
  msoaCode: "E02006700",
});
const OYSTER_FLAT = home(OYSTER_DIR, {
  label: "Oyster Bay",
  saon: "Flat 5",
  paon: "OYSTER BAY APARTMENTS",
  street: "STERTE",
  town: "POOLE",
});

const PLANETREE_DIR = directory({
  postcode: "E17 7FW",
  latitude: 51.59,
  longitude: -0.021,
  council: "Waltham Forest",
  lsoaCode: "E01004700",
  msoaCode: "E02000850",
});
const PLANETREE = home(PLANETREE_DIR, {
  label: "Planetree Path",
  paon: "5",
  street: "PLANETREE PATH",
  town: "LONDON",
});

const THANET_DIR = directory({
  postcode: "NW2 4JA",
  latitude: 51.55,
  longitude: -0.235,
  council: "Brent",
  lsoaCode: "E01000500",
  msoaCode: "E02000150",
});
const THANET = home(THANET_DIR, {
  label: "Thanet Lodge",
  paon: "THANET LODGE",
  street: "MAPESBURY ROAD",
  town: "LONDON",
});

const EMPIRE_DIR = directory({
  postcode: "SE1 4NH",
  latitude: 51.499,
  longitude: -0.096,
  council: "Southwark",
  lsoaCode: "E01004000",
  msoaCode: "E02000780",
});

describe("building safety — the tribunal half serves the filed corpus (D35)", () => {
  it("Oyster Bay: the positive control serves verbatim, its group labelled, beside the hand-off", async () => {
    const { sections } = await bundle(OYSTER_FLAT);
    const section = sections.buildingSafety;
    expect(section.depth).toBe("report");
    const tribunal = section.tribunal;
    expect(tribunal.state).toBe("served");
    expect(tribunal.line).toBe(
      "1 published building-safety order naming this postcode, as at 14 November 2026",
    );
    expect(tribunal.decisionCount).toBe(1);
    expect(tribunal.groups).toHaveLength(1);
    const group = tribunal.groups[0];
    expect(group.buildingName).toBe("1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN");
    expect(group.buildingKey).toBe("oyster bay apartments sterte poole");
    expect(group.isHomeBuilding).toBe(true);
    expect(group.decisions).toHaveLength(1);
    const decision = group.decisions[0];
    expect(decision.caseRef).toBe("HAV/00HQ/BSA/2025/0002");
    expect(decision.kind).toBe("remediation-order");
    expect(decision.kindLine).toBe(
      "remediation order (section 123 of the Building Safety Act 2022)",
    );
    expect(decision.line).toBe(
      "remediation order (section 123 of the Building Safety Act 2022) for 1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN — HAV/00HQ/BSA/2025/0002, 10 April 2026",
    );
    expect(decision.sourceUrl).toBe(
      "https://www.gov.uk/residential-property-tribunal-decisions/1-31-oyster-bay-apartments-sterte-poole-dorset-bh15-2fn-hav-slash-00hq-slash-bsa-slash-2025-slash-0002",
    );
    // The section's source fields are the tribunal half's.
    expect(section.sourceName).toBe(TRIBUNAL_SOURCE);
    expect(section.sourceDate).toBe("2026-11-14");
    expect(tribunal.sourceLine).toContain(TRIBUNAL_SOURCE);
    // The register half corrects the reading: a flat is
    // never scope-worded, so the hand-off stands.
    expect(section.register.state).toBe("handed-off");
    expect(section.register.link).toEqual({
      label: "Search the register of high-rise residential buildings (GOV.UK)",
      url: "https://www.register-high-rise-building.service.gov.uk/public-register/search",
    });
  });

  it("Planetree Path: a remediation contribution order serves with its own kind line", async () => {
    const { sections } = await bundle(PLANETREE);
    const tribunal = sections.buildingSafety.tribunal;
    expect(tribunal.state).toBe("served");
    expect(tribunal.line).toBe(
      "1 published building-safety order naming this postcode, as at 14 November 2026",
    );
    const decision = tribunal.groups[0].decisions[0];
    expect(decision.caseRef).toBe("LON/00BH/BSB/2024/0500");
    expect(decision.kind).toBe("remediation-contribution-order");
    expect(decision.kindLine).toBe(
      "remediation contribution order (section 124 of the Building Safety Act 2022)",
    );
    expect(decision.propertyText).toBe("1-9 PLANETREE PATH, LONDON E17 7FW");
  });

  it("Thanet Lodge: three cases for one building serve as ONE group, in filing order", async () => {
    const { sections } = await bundle(THANET);
    const tribunal = sections.buildingSafety.tribunal;
    expect(tribunal.state).toBe("served");
    expect(tribunal.line).toBe(
      "3 published building-safety orders naming this postcode, as at 14 November 2026",
    );
    expect(tribunal.decisionCount).toBe(3);
    expect(tribunal.groups).toHaveLength(1);
    expect(tribunal.groups[0].buildingName).toBe("Thanet Lodge, 10 Mapesbury Road, London NW2 4JA");
    expect(tribunal.groups[0].decisions.map((d) => d.caseRef)).toEqual([
      "LON/00AE/BSA/2024/0007",
      "LON/00AE/BSA/2024/0500",
      "LON/00AE/BSA/2024/0502",
    ]);
  });

  it("Empire Square at rung 2: the postcode's decisions serve with no home label", async () => {
    const { sections } = await bundle(addressList(EMPIRE_DIR));
    const tribunal = sections.buildingSafety.tribunal;
    expect(tribunal.state).toBe("served");
    expect(tribunal.decisionCount).toBe(1);
    expect(tribunal.groups[0].isHomeBuilding).toBe(false);
    expect(tribunal.groups[0].decisions[0].caseRef).toBe("LON/00BE/BSB/2024/0602");
    expect(tribunal.groups[0].decisions[0].kind).toBe("remediation-contribution-order");
  });

  it("the universal three serve the locked empty form — no filed decision names them", async () => {
    for (const resolution of [BIRKDALE, EXETER, MINERVA]) {
      const { sections } = await bundle(resolution);
      const tribunal = sections.buildingSafety.tribunal;
      expect(tribunal.state).toBe("none-filed");
      expect(tribunal.line).toBe(
        "no published building-safety orders naming this postcode, as at 14 November 2026",
      );
      expect(tribunal.decisionCount).toBe(0);
      expect(tribunal.groups).toEqual([]);
    }
  });

  it("the register scope line: a clear single house only — Birkdale and Exeter take it, Minerva's flat never does", async () => {
    const birkdale = await bundle(BIRKDALE);
    expect(birkdale.sections.buildingSafety.register.state).toBe("out-of-scope");
    expect(birkdale.sections.buildingSafety.register.line).toBe(
      "the Building Safety Regulator's register covers high-rise residential buildings — buildings of 7 or more storeys or 18 metres or more, with 2 or more residential units; a house is outside what the register is for",
    );
    expect(birkdale.sections.buildingSafety.register.link).toBeNull();
    const exeter = await bundle(EXETER);
    expect(exeter.sections.buildingSafety.register.state).toBe("out-of-scope");
    const minerva = await bundle(MINERVA);
    expect(minerva.sections.buildingSafety.register.state).toBe("handed-off");
    expect(minerva.sections.buildingSafety.register.link?.url).toBe(
      "https://www.register-high-rise-building.service.gov.uk/public-register/search",
    );
    // Rung 2 never scope-words: the list is not one home.
    const rung2 = await bundle(addressList(BIRKDALE_DIR));
    expect(rung2.sections.buildingSafety.register.state).toBe("handed-off");
  });

  it("an unfiled table serves not-filed — the guard, never an empty line", async () => {
    const fresh = new FakeAreaSource();
    fresh.tribunalOverride = { filedCount: 0, lastFiledAt: null, sourceName: null, rows: [] };
    const { sections } = await bundle(BIRKDALE, fresh);
    const section = sections.buildingSafety;
    expect(section.tribunal.state).toBe("not-filed");
    expect(section.tribunal.line).toBe(
      "the building-safety decisions data is not filed yet, so no building-safety answer can be given yet",
    );
    expect(section.sourceName).toBeNull();
    expect(section.sourceDate).toBeNull();
    // The register half is independent of the filing.
    expect(section.register.state).toBe("out-of-scope");
  });

  it("the nations: tribunal and register both serve their not-covered forms", async () => {
    const scotland = await bundle(SCOTLAND);
    expect(scotland.sections.buildingSafety.tribunal.state).toBe("not-covered");
    expect(scotland.sections.buildingSafety.tribunal.line).toContain("Cladding Assurance Register");
    expect(scotland.sections.buildingSafety.register.state).toBe("not-covered");
    expect(scotland.sections.buildingSafety.register.line).toContain("Cladding Assurance Register");
    // Named WITHOUT a link (D35): no verified landing
    // exists in the record.
    expect(scotland.sections.buildingSafety.register.link).toBeNull();

    const cardiff = await bundle(C8);
    expect(cardiff.sections.buildingSafety.tribunal.state).toBe("not-covered");
    expect(cardiff.sections.buildingSafety.tribunal.line).toContain("Welsh Government");
    expect(cardiff.sections.buildingSafety.register.state).toBe("not-covered");
    expect(cardiff.sections.buildingSafety.register.link).toBeNull();

    const belfast = await bundle(BELFAST);
    expect(belfast.sections.buildingSafety.tribunal.state).toBe("not-covered");
    expect(belfast.sections.buildingSafety.tribunal.line).toContain("no equivalent register");
    expect(belfast.sections.buildingSafety.register.state).toBe("not-covered");
    expect(belfast.sections.buildingSafety.register.line).toContain("no equivalent register");
  });

  it("group-and-label is fail-open: a stem mismatch labels nothing and filters nothing", async () => {
    const fresh = new FakeAreaSource();
    const row = (
      partial: Partial<TribunalDecisionRow> & { caseRef: string },
    ): TribunalDecisionRow => ({
      decisionDate: "2025-03-03",
      orderKind: "remediation-order",
      propertyText: "Alpha House, Birkdale Rise, Hatfield Peverel CM3 2JT",
      buildingKey: "alpha house birkdale rise hatfield peverel",
      isSingleFlat: false,
      sourceUrl: "https://www.gov.uk/example",
      sourceName: TRIBUNAL_SOURCE,
      sourceDate: "2025-03-03",
      ...partial,
    });
    fresh.tribunalOverride = {
      filedCount: 11,
      lastFiledAt: TRIBUNAL_FILED_AT,
      sourceName: TRIBUNAL_SOURCE,
      rows: [
        row({ caseRef: "SYN/0001" }),
        row({
          caseRef: "SYN/0002",
          propertyText: "19 Birkdale Rise CM3 2JT",
          buildingKey: "19 birkdale rise",
        }),
      ],
    };
    const { sections } = await bundle(BIRKDALE, fresh);
    const tribunal = sections.buildingSafety.tribunal;
    expect(tribunal.state).toBe("served");
    expect(tribunal.decisionCount).toBe(2);
    // Both groups serve; the home's own group is labelled
    // and first even though it was filed second.
    expect(tribunal.groups.map((g) => g.buildingKey)).toEqual([
      "19 birkdale rise",
      "alpha house birkdale rise hatfield peverel",
    ]);
    expect(tribunal.groups[0].isHomeBuilding).toBe(true);
    expect(tribunal.groups[1].isHomeBuilding).toBe(false);
  });

  it("a single-flat decision serves only at its own flat's rung-1 check", async () => {
    const fresh = new FakeAreaSource();
    const base: TribunalDecisionRow = {
      caseRef: "SYN/FLAT",
      decisionDate: "2025-04-04",
      orderKind: "remediation-order",
      propertyText: "Flat 2, 19 Birkdale Rise, Hatfield Peverel CM3 2JT",
      buildingKey: "19 birkdale rise hatfield peverel",
      isSingleFlat: true,
      sourceUrl: "https://www.gov.uk/example",
      sourceName: TRIBUNAL_SOURCE,
      sourceDate: "2025-04-04",
    };
    const buildingWide: TribunalDecisionRow = {
      ...base,
      caseRef: "SYN/BUILDING",
      propertyText: "19 Birkdale Rise, Hatfield Peverel CM3 2JT",
      isSingleFlat: false,
    };
    fresh.tribunalOverride = {
      filedCount: 11,
      lastFiledAt: TRIBUNAL_FILED_AT,
      sourceName: TRIBUNAL_SOURCE,
      rows: [base, buildingWide],
    };
    // The house itself: the flat's decision is not its
    // answer — only the building-wide one serves.
    const house = await bundle(BIRKDALE, fresh);
    expect(house.sections.buildingSafety.tribunal.decisionCount).toBe(1);
    expect(
      house.sections.buildingSafety.tribunal.groups[0].decisions.map((d) => d.caseRef),
    ).toEqual(["SYN/BUILDING"]);
    // Flat 2's own check: both serve, in one labelled
    // group.
    const flat2 = home(BIRKDALE_DIR, {
      label: "Flat 2, Birkdale",
      saon: "Flat 2",
      paon: "19",
      street: "BIRKDALE RISE",
      town: "HATFIELD PEVEREL",
    });
    const own = await bundle(flat2, fresh);
    expect(own.sections.buildingSafety.tribunal.decisionCount).toBe(2);
    expect(own.sections.buildingSafety.tribunal.groups).toHaveLength(1);
    expect(own.sections.buildingSafety.tribunal.groups[0].isHomeBuilding).toBe(true);
    // A sibling flat: the single-flat decision is not
    // theirs either.
    const flat3 = home(BIRKDALE_DIR, {
      label: "Flat 3, Birkdale",
      saon: "Flat 3",
      paon: "19",
      street: "BIRKDALE RISE",
      town: "HATFIELD PEVEREL",
    });
    const sibling = await bundle(flat3, fresh);
    expect(sibling.sections.buildingSafety.tribunal.decisionCount).toBe(1);
    // Rung 2: single-flat decisions never serve.
    const rung2 = await bundle(addressList(BIRKDALE_DIR), fresh);
    expect(rung2.sections.buildingSafety.tribunal.decisionCount).toBe(1);
  });

  it("the explainer carries the completeness caveats — publication is never stated complete", async () => {
    const { sections } = await bundle(BIRKDALE);
    const explainer = sections.buildingSafety.explainer ?? "";
    expect(explainer).toContain("Publication is selective");
    expect(explainer).toContain("cannot be read by the filing process");
    expect(explainer).toContain("name no full postcode");
    expect(explainer).toContain(
      "An empty tribunal answer means only that no published, readable decision in the filed index names this postcode",
    );
    expect(explainer).toContain("EWS1 forms have no public register");
    expect(explainer).toContain(
      "Whether a building has cladding is a question neither record answers",
    );
  });
});

// --- broadband & mobile (M6.17, decision D36) ----------------------------

function allNumbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (Array.isArray(value)) for (const v of value) allNumbersIn(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) allNumbersIn(v, out);
  return out;
}

describe("broadband & mobile — the Ofcom answers (M6.17, D36)", () => {
  it("the universal three: the gigabit line serves verbatim at 100%, under the January 2026 source line", async () => {
    for (const resolution of [BIRKDALE, EXETER, MINERVA]) {
      const { sections } = await bundle(resolution);
      const section = sections.broadband;
      expect(section.state).toBe("served");
      expect(section.depth).toBe("headline");
      expect(section.grainLine).toBe("the premises in this postcode");
      expect(section.gigabitCapablePct).toBe(100);
      expect(section.line).toBe(
        "gigabit-capable broadband (at least 1 Gbit/s) is available to 100% of premises in this postcode",
      );
      expect(section.snapshot).toBe("2026-01");
      expect(section.sourceName).toBe("Ofcom Connected Nations — fixed broadband coverage");
      expect(section.sourceLine).toBe(
        "Ofcom Connected Nations — fixed broadband coverage — data to January 2026",
      );
      // The bands as the harness record supports them:
      // everything in the 300+ band, nothing unclassified.
      expect(section.bands.find((b) => b.key === "300_plus")?.pct).toBe(100);
      expect(section.unclassifiedPct).toBeNull();
      expect(section.unclassifiedLine).toBeNull();
    }
  });

  it("the filed-but-unserved figures never serve: no NGA percentage, no unable-to-receive figure", async () => {
    const { sections } = await bundle(BIRKDALE);
    const numbers = allNumbersIn(sections.broadband);
    for (const unserved of [12.34, 0.11, 0.22, 0.33, 3.21, 0.44, 0.55])
      expect(numbers).not.toContain(unserved);
    const json = JSON.stringify(sections.broadband).toLowerCase();
    expect(json).not.toContain("nga");
    expect(json).not.toContain("unable");
  });

  it("Braintree mobile: the verified triples lead, each service with its one figure", async () => {
    const { sections } = await bundle(BIRKDALE);
    const section = sections.mobile;
    expect(section.state).toBe("served");
    expect(section.depth).toBe("report");
    expect(section.council).toBe("Braintree");
    expect(section.line).toBe("modelled mobile coverage for the Braintree council area");
    expect(section.sourceLine).toBe(
      "Ofcom Connected Nations — mobile coverage (local authority level) — data to January 2026",
    );
    expect(section.services.map((s) => s.service)).toEqual([
      "voice",
      "4g",
      "5g_high_confidence",
      "5g_very_high_confidence",
      "5g_sa_high_confidence",
      "5g_sa_very_high_confidence",
    ]);
    const byKey = new Map(section.services.map((s) => [s.service, s]));
    const voice = byKey.get("voice")!;
    expect(voice.line).toBe(
      "at least one mobile network is modelled to have outdoor coverage at 100% of premises in Braintree",
    );
    expect(voice.outdoor?.allOperatorsLine).toBe(
      "all four mobile networks are modelled to have outdoor coverage at 99.29% of premises in Braintree",
    );
    expect(voice.indoor).toBeNull();
    const fourG = byKey.get("4g")!;
    expect(fourG.outdoor?.line).toBe(
      "at least one mobile network is modelled to have outdoor coverage at 100% of premises in Braintree",
    );
    expect(fourG.indoor?.line).toBe(
      "at least one mobile network is modelled to have indoor coverage at 99% of premises in Braintree",
    );
    expect(fourG.indoor?.allOperatorsLine).toBe(
      "all four mobile networks are modelled to have indoor coverage at 84.64% of premises in Braintree",
    );
    const fiveG = byKey.get("5g_high_confidence")!;
    expect(fiveG.line).toBe(
      "at least one mobile network is modelled to have outdoor coverage at 97.9% of premises in Braintree",
    );
    expect(fiveG.outdoor?.allOperatorsLine).toBe(
      "all four mobile networks are modelled to have outdoor coverage at 42.45% of premises in Braintree",
    );
  });

  it("Newham mobile: the standalone-5G all-operators figure serves as not published — never 0", async () => {
    const { sections } = await bundle(EXETER);
    const byKey = new Map(sections.mobile.services.map((s) => [s.service, s]));
    const sa = byKey.get("5g_sa_high_confidence")!;
    expect(sa.state).toBe("served");
    expect(sa.line).toBe(
      "at least one mobile network is modelled to have outdoor coverage at 100% of premises in Newham",
    );
    expect(sa.outdoor?.allOperatorsPct).toBeNull();
    expect(sa.outdoor?.allOperatorsPublished).toBe(false);
    expect(sa.outdoor?.allOperatorsLine).toBe(
      "the share of premises in Newham where all four mobile networks have outdoor coverage is not published for this service",
    );
    const vhc = byKey.get("5g_very_high_confidence")!;
    expect(vhc.outdoor?.allOperatorsLine).toBe(
      "all four mobile networks are modelled to have outdoor coverage at 99.33% of premises in Newham",
    );
    const fourG = byKey.get("4g")!;
    expect(fourG.indoor?.allOperatorsLine).toBe(
      "all four mobile networks are modelled to have indoor coverage at 98.89% of premises in Newham",
    );
  });

  it("Epsom and Ewell mobile: 5G very-high all-operators serves at 67.31%; SA very-high is not published", async () => {
    const { sections } = await bundle(MINERVA);
    const byKey = new Map(sections.mobile.services.map((s) => [s.service, s]));
    const vhc = byKey.get("5g_very_high_confidence")!;
    expect(vhc.outdoor?.allOperatorsLine).toBe(
      "all four mobile networks are modelled to have outdoor coverage at 67.31% of premises in Epsom and Ewell",
    );
    const saVhc = byKey.get("5g_sa_very_high_confidence")!;
    expect(saVhc.line).toBe(
      "at least one mobile network is modelled to have outdoor coverage at 98.8% of premises in Epsom and Ewell",
    );
    expect(saVhc.outdoor?.allOperatorsPct).toBeNull();
    expect(saVhc.outdoor?.allOperatorsPublished).toBe(false);
    const hc = byKey.get("5g_high_confidence")!;
    expect(hc.outdoor?.allOperatorsLine).toBe(
      "all four mobile networks are modelled to have outdoor coverage at 98.42% of premises in Epsom and Ewell",
    );
  });

  it("SYNTHETIC broadband: a sub-100 postcode serves its category lines and bands, the unclassified share derived and named", async () => {
    const fresh = new FakeAreaSource();
    fresh.broadbandOverride = broadbandAnswer({
      gigabitCapablePct: 87.4,
      superfast30Pct: 96.2,
      ultrafast100Pct: 91.5,
      ultrafast300Pct: 88.9,
      speedBandPct: {
        under_2: 0.4,
        "2_to_5": 0.8,
        "5_to_10": 1.6,
        "10_to_30": 4.3,
        "30_to_300": 12.5,
        "300_plus": 69.3,
      },
    });
    const { sections } = await bundle(BIRKDALE, fresh);
    const section = sections.broadband;
    expect(section.line).toBe(
      "gigabit-capable broadband (at least 1 Gbit/s) is available to 87.4% of premises in this postcode",
    );
    expect(section.superfastLine).toBe(
      "superfast broadband (at least 30 Mbit/s) is available to 96.2% of premises in this postcode",
    );
    expect(section.ultrafast100Line).toBe(
      "ultrafast broadband (at least 100 Mbit/s) is available to 91.5% of premises in this postcode",
    );
    expect(section.ultrafast300Line).toBe(
      "broadband at 300 Mbit/s or more is available to 88.9% of premises in this postcode",
    );
    expect(section.bands.map((b) => [b.label, b.pct])).toEqual([
      ["under 2 Mbit/s", 0.4],
      ["2 to 5 Mbit/s", 0.8],
      ["5 to 10 Mbit/s", 1.6],
      ["10 to 30 Mbit/s", 4.3],
      ["30 to 300 Mbit/s", 12.5],
      ["300 Mbit/s or more", 69.3],
    ]);
    // The bands sum to 88.9 — the derived shortfall serves
    // as its own named line, never absorbed.
    expect(section.unclassifiedPct).toBe(11.1);
    expect(section.unclassifiedLine).toBe(
      "11.1% of premises in this postcode could not be matched to a provider record with a predicted speed, so they appear in no speed band",
    );
  });

  it("SYNTHETIC mobile: a whole-service unpublished set serves its not-published line, and no service silently vanishes", async () => {
    const fresh = new FakeAreaSource();
    fresh.mobileOverride = mobileAnswer("E09999999", "Synthetic Borough", {
      voice: { outdoor: coverageSet(12.5, 40.2, 87.5) },
      "4g": { outdoor: coverageSet(8, 55.5, 92), indoor: coverageSet(20.5, 30.25, 79.5) },
      "5g_high_confidence": { outdoor: coverageSet(30, null, 70) },
      "5g_very_high_confidence": { outdoor: null },
      "5g_sa_high_confidence": { outdoor: coverageSet(45, null, 55) },
      "5g_sa_very_high_confidence": { outdoor: coverageSet(50, null, 50) },
    });
    const { sections } = await bundle(BIRKDALE, fresh);
    const section = sections.mobile;
    expect(section.services).toHaveLength(6);
    const byKey = new Map(section.services.map((s) => [s.service, s]));
    expect(byKey.get("voice")?.line).toBe(
      "at least one mobile network is modelled to have outdoor coverage at 87.5% of premises in Synthetic Borough",
    );
    expect(byKey.get("4g")?.indoor?.line).toBe(
      "at least one mobile network is modelled to have indoor coverage at 79.5% of premises in Synthetic Borough",
    );
    const vhc = byKey.get("5g_very_high_confidence")!;
    expect(vhc.state).toBe("not-published");
    expect(vhc.line).toBe(
      "5G (very high confidence) coverage is not published by Ofcom in this release",
    );
    expect(vhc.outdoor).toBeNull();
    const hc = byKey.get("5g_high_confidence")!;
    expect(hc.state).toBe("served");
    expect(hc.outdoor?.allOperatorsPublished).toBe(false);
    expect(hc.outdoor?.allOperatorsLine).toBe(
      "the share of premises in Synthetic Borough where all four mobile networks have outdoor coverage is not published for this service",
    );
  });

  it("not filed: a postcode with no Ofcom answers serves both named states, never a 0% reading", async () => {
    const fresh = new FakeAreaSource();
    fresh.broadbandOverride = null;
    fresh.mobileOverride = null;
    const { sections } = await bundle(BIRKDALE, fresh);
    expect(sections.broadband.state).toBe("not-filed");
    expect(sections.broadband.line).toBe("broadband coverage is not filed for this postcode yet");
    expect(sections.broadband.gigabitCapablePct).toBeNull();
    expect(sections.broadband.sourceLine).toBeNull();
    expect(sections.mobile.state).toBe("not-filed");
    expect(sections.mobile.line).toBe(
      "mobile coverage is not filed for this postcode's council area yet",
    );
    expect(sections.mobile.services).toEqual([]);
    expect(sections.mobile.council).toBeNull();
  });

  it("rung 2 serves the same two sections; rung 3 names the two new reasons", async () => {
    const rung1 = await bundle(BIRKDALE);
    const rung2 = await bundle(addressList(BIRKDALE_DIR));
    expect(rung2.sections.broadband).toEqual(rung1.sections.broadband);
    expect(rung2.sections.mobile).toEqual(rung1.sections.mobile);

    const rung3 = await buildAreaBundle(
      { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area — CM3", postcodeCount: 1 },
      source,
    );
    if (rung3.kind !== "wider-area") throw new Error("expected wider-area");
    expect(rung3.area.sections.broadband).toEqual({
      state: "unavailable",
      reason: "broadband answers need an exact postcode",
    });
    expect(rung3.area.sections.mobile).toEqual({
      state: "unavailable",
      reason: "mobile answers need an exact postcode",
    });
  });

  it("the headline projection carries the gigabit pick only — and no mobile payload in any form", async () => {
    const built = await bundle(BIRKDALE);
    const headline = projectHeadline(built);
    if (!headline) throw new Error("expected a headline projection");
    expect(headline.broadband).toEqual({
      state: "served",
      gigabitCapablePct: 100,
      line: "gigabit-capable broadband (at least 1 Gbit/s) is available to 100% of premises in this postcode",
    });
    expect("mobile" in headline).toBe(false);
    expect(JSON.stringify(headline)).not.toContain("mobile");
  });

  it("no served wording promises a speed, names a provider, or grades coverage", async () => {
    const bundles = [await bundle(BIRKDALE), await bundle(EXETER), await bundle(MINERVA)];
    const fresh = new FakeAreaSource();
    fresh.broadbandOverride = broadbandAnswer({ gigabitCapablePct: 87.4 });
    bundles.push(await bundle(BIRKDALE, fresh));
    for (const built of bundles) {
      const sections = [built.sections.broadband, built.sections.mobile];
      const text = JSON.stringify(sections).toLowerCase();
      for (const banned of [
        "you will get",
        "you'll get",
        "guaranteed",
        "poor coverage",
        "great coverage",
        "best network",
        "fastest",
      ])
        expect(text, `banned in the Ofcom sections: ${banned}`).not.toContain(banned);
      // "fast"/"slow" as our adjectives — Ofcom's own
      // category names (superfast, ultrafast) are labels,
      // excused exactly as filed.
      const stripped = text.replaceAll("superfast", "").replaceAll("ultrafast", "");
      expect(stripped).not.toContain("fast");
      expect(stripped).not.toContain("slow");
      // "full fibre" appears only inside the explainer's
      // separation sentence — never beside the gigabit
      // figure as a claim.
      expect(built.sections.broadband.line).not.toContain("fibre");
      expect(built.sections.broadband.explainer).toContain("the data does not separate them");
    }
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
    expect(sections.planningApplications.depth).toBe("report");
    expect(sections.broadband.depth).toBe("headline");
    expect(sections.mobile.depth).toBe("report");
  });

  it("the headline projection carries NO IMD, Census or benefits payload — derivation is a projection", async () => {
    const built = await bundle(BIRKDALE);
    const headline = projectHeadline(built);
    expect(headline).not.toBeNull();
    if (!headline) return;
    expect(Object.keys(headline).sort()).toEqual(
      [
        "air",
        "broadband",
        "constraints",
        "councilTax",
        "epc",
        "heritage",
        "nature",
        "noise",
        "postcode",
      ].sort(),
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

  it("bounds the EPC cold load: a caller whose wait expires is told the load is still running (BUG-003)", async () => {
    const { writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const script = join(tmpdir(), `fake-epc-loader-slow-${Date.now()}.mjs`);
    writeFileSync(script, "await new Promise((r) => setTimeout(r, 30_000));\n");
    const db = { query: async () => ({ rows: [] }) };
    const dbSource = createAreaSource(db as never, {
      databaseUrl: "postgres://unused",
      epcLoaderPath: script,
      epcLoadWaitMs: 50,
    });
    const started = Date.now();
    await expect(dbSource.loadEpc("ZZ9 9ZZ")).rejects.toBeInstanceOf(EpcLoadPendingError);
    expect(Date.now() - started).toBeLessThan(5_000);
    // The wait override reads only a non-negative number.
    expect(epcLoadWaitMsFromEnv({})).toBe(10_000);
    expect(epcLoadWaitMsFromEnv({ EPC_LOAD_WAIT_MS: "250" })).toBe(250);
    expect(epcLoadWaitMsFromEnv({ EPC_LOAD_WAIT_MS: "-5" })).toBe(10_000);
  });
});

// --- banned wording ------------------------------------------------------

// --- the missing layers (M6.21, decision D41) --------------------

describe("brownfield land — points serving, gated absence", () => {
  it("Birkdale: two recorded sites serve with the register's own facts per site", async () => {
    const { sections } = await bundle(BIRKDALE);
    const brownfield = sections.constraints.brownfield;
    expect(brownfield.state).toBe("served");
    expect(brownfield.countWithin).toBe(2);
    expect(brownfield.line).toBe(
      "2 recorded brownfield sites within 5 miles of the postcode point",
    );
    expect(brownfield.within).toHaveLength(2);
    const nearest = brownfield.within[0];
    expect(nearest.label).toBe("Universal Garage, The Street, Hatfield Peverel");
    expect(nearest.miles).toBe(0.252);
    expect(nearest.line).toBe("Universal Garage, The Street, Hatfield Peverel — 0.252 miles away");
    expect(nearest.hectaresLine).toBe("the register records the site at 0.22 hectares");
    expect(nearest.statusLine).toBe(
      "the register records its planning permission status as permissioned",
    );
    expect(nearest.dwellingsLine).toBe("the register publishes 9 net dwellings for the site");
    expect(brownfield.within[1].dwellingsLine).toBeNull();
    expect(brownfield.sourceLine).toBe(
      "planning.data.gov.uk — brownfield land (Open Government Licence v3.0) — data to 16 November 2026",
    );
    // Never a plot claim: nothing in the answer speaks of
    // this home's plot being on or off the register.
    const text = JSON.stringify(brownfield).toLowerCase();
    expect(text).not.toContain("this plot");
    expect(text).not.toContain("your plot");
  });

  it("Exeter: sites serve even though the gate is shut — presence needs no licence", async () => {
    const { sections } = await bundle(EXETER);
    const brownfield = sections.constraints.brownfield;
    expect(brownfield.state).toBe("served");
    expect(brownfield.councilPublishes).toBe(false);
    expect(brownfield.countWithin).toBe(2);
    expect(brownfield.within[0].label).toBe("45 Beckton Road, London");
    expect(brownfield.within[0].miles).toBe(0.163);
    expect(brownfield.within[1].statusLine).toBe(
      "the register records its planning permission status as pending-decision",
    );
  });

  it("Minerva: a supplying council with none within serves none-found, with the beyond line", async () => {
    const { sections } = await bundle(MINERVA);
    const brownfield = sections.constraints.brownfield;
    expect(brownfield.state).toBe("none-found");
    expect(brownfield.countWithin).toBe(0);
    expect(brownfield.line).toBe(
      "no brownfield sites are recorded within 5 miles of the postcode point on the national register",
    );
    expect(brownfield.beyondLine).toBe(
      "none within 5 miles — the nearest recorded site is Etwell House and former coach, Station Approach, 2.41 miles away",
    );
  });

  it("a council that does not supply serves not-published: no count, no beyond line", async () => {
    class NoSupplySource extends FakeAreaSource {
      override async brownfieldFacts() {
        return {
          filedCount: 30355,
          within: [],
          nearestBeyond: {
            reference: "15/01103/OUT",
            siteAddress: "Universal Garage, The Street, Hatfield Peverel",
            hectares: 0.22,
            planningPermissionStatus: "permissioned",
            minimumNetDwellings: 9,
            maximumNetDwellings: 9,
            miles: 2.6,
          },
          sourceName: "planning.data.gov.uk — brownfield land (Open Government Licence v3.0)",
          sourceDate: "2026-11-16",
        };
      }
      override async brownfieldGate() {
        return false;
      }
    }
    const { sections } = await bundle(BIRKDALE, new NoSupplySource());
    const brownfield = sections.constraints.brownfield;
    expect(brownfield.state).toBe("not-published");
    expect(brownfield.countWithin).toBeNull();
    expect(brownfield.beyondLine).toBeNull();
    expect(brownfield.beyondNearest).toBeNull();
    expect(brownfield.line).toBe(
      "this council does not supply the national brownfield register, so no finding can be made from the data — the council's own brownfield register is the record",
    );
  });

  it("an unfiled register serves the not-filed family, never an absence", async () => {
    class UnfiledSource extends FakeAreaSource {
      override async brownfieldFacts() {
        return {
          filedCount: 0,
          within: [],
          nearestBeyond: null,
          sourceName: null,
          sourceDate: null,
        };
      }
    }
    const { sections } = await bundle(BIRKDALE, new UnfiledSource());
    const brownfield = sections.constraints.brownfield;
    expect(brownfield.state).toBe("not-filed");
    expect(brownfield.countWithin).toBeNull();
    expect(brownfield.line).toBe(
      "the brownfield land data is not filed yet, so no brownfield answer can be given yet",
    );
  });

  it("Scotland serves the coverage form: the register filed covers England", async () => {
    const { sections } = await bundle(SCOTLAND);
    const brownfield = sections.constraints.brownfield;
    expect(brownfield.state).toBe("not-published");
    expect(brownfield.countWithin).toBeNull();
    expect(brownfield.line).toBe(
      "the brownfield register filed covers England — brownfield registers in Scotland are held by its own councils and are not filed, so no finding can be made from the data",
    );
  });
});

describe("built-up areas — the filed polygon's own name", () => {
  it("all three homes fall inside their pinned areas", async () => {
    const cases = [
      [BIRKDALE, "Hatfield Peverel"],
      [EXETER, "Newham"],
      [MINERVA, "Ewell"],
    ] as const;
    for (const [resolution, name] of cases) {
      const { sections } = await bundle(resolution);
      const bua = sections.constraints.builtUpArea;
      expect(bua.state).toBe("inside");
      expect(bua.insideName).toBe(name);
      expect(bua.line).toBe(`the postcode point falls inside the ${name} built-up area`);
    }
  });
});

describe("heritage — the four M6.21 layers", () => {
  it("all three homes serve the absence lines for all four layers", async () => {
    for (const resolution of [BIRKDALE, EXETER, MINERVA]) {
      const { sections } = await bundle(resolution);
      const heritage = sections.heritage;
      expect(heritage.worldHeritageSites.state).toBe("none-found");
      expect(heritage.worldHeritageSites.line).toBe(
        "no world heritage site covers this postcode point in the national data",
      );
      expect(heritage.battlefields.state).toBe("none-found");
      expect(heritage.battlefields.line).toBe(
        "no registered battlefield covers this postcode point in the national data",
      );
      expect(heritage.protectedWrecks.state).toBe("none-found");
      expect(heritage.protectedWrecks.line).toBe(
        "no protected wreck site covers this postcode point in the national data",
      );
      expect(heritage.worldHeritageBufferZones.state).toBe("none-found");
      expect(heritage.worldHeritageBufferZones.line).toBe(
        "no world heritage site buffer zone covers this postcode point in the national data",
      );
    }
  });

  it("inside a site and inside a buffer zone are distinct facts with distinct lines", async () => {
    class BathSource extends FakeAreaSource {
      override async planningLayerFacts(layer: PlanningLayerKind, lat: number, lng: number) {
        if (layer === "world_heritage_site")
          return layerFacts({
            filedCount: 19,
            covering: [{ id: 71, name: "City of Bath", detail: null }],
          });
        if (layer === "world_heritage_buffer_zone")
          return layerFacts({
            filedCount: 9,
            covering: [{ id: 72, name: "Maritime Greenwich", detail: null }],
          });
        return super.planningLayerFacts(layer, lat, lng);
      }
    }
    const { sections } = await bundle(BIRKDALE, new BathSource());
    const heritage = sections.heritage;
    expect(heritage.worldHeritageSites.state).toBe("inside");
    expect(heritage.worldHeritageSites.line).toBe(
      "the postcode point falls inside the City of Bath world heritage site",
    );
    expect(heritage.worldHeritageBufferZones.state).toBe("inside");
    expect(heritage.worldHeritageBufferZones.line).toBe(
      "the postcode point falls inside the buffer zone of the Maritime Greenwich world heritage site",
    );
  });
});

describe("heritage — registered parks & gardens (M8.10)", () => {
  it("unfiled, the layer serves its named not-filed state at all three homes — never an absence", async () => {
    // The wiring lands ahead of the filing (the national
    // filing rides with the national loads programme):
    // where the layer's table holds no shapes, the
    // layer's answer is the not-filed sentence, not a
    // "none found" computed over an empty table. (The
    // golden replay pins the same state on the real
    // corpus, which files no parks shapes.)
    class UnfiledParksSource extends FakeAreaSource {
      override async planningLayerFacts(layer: PlanningLayerKind, lat: number, lng: number) {
        if (layer === "registered_park_and_garden")
          return layerFacts({ filedCount: 0, sourceName: null, sourceDate: null });
        return super.planningLayerFacts(layer, lat, lng);
      }
    }
    for (const resolution of [BIRKDALE, EXETER, MINERVA]) {
      const { sections } = await bundle(resolution, new UnfiledParksSource());
      const parks = sections.heritage.parksAndGardens;
      expect(parks.state).toBe("not-filed");
      expect(parks.line).toBe(
        "the registered park and garden data is not filed yet, so no registered park and garden answer can be given yet",
      );
      expect(parks.beyondLine).toBeNull();
    }
  });

  it("inside a registered park or garden, the line names the site", async () => {
    class ParksSource extends FakeAreaSource {
      override async planningLayerFacts(layer: PlanningLayerKind, lat: number, lng: number) {
        if (layer === "registered_park_and_garden")
          return layerFacts({
            filedCount: 1723,
            covering: [{ id: 91, name: "Nonsuch Park", detail: null }],
          });
        return super.planningLayerFacts(layer, lat, lng);
      }
    }
    const { sections } = await bundle(MINERVA, new ParksSource());
    const parks = sections.heritage.parksAndGardens;
    expect(parks.state).toBe("inside");
    expect(parks.line).toBe(
      "the postcode point falls inside the Nonsuch Park registered park and garden",
    );
    expect(parks.insideName).toBe("Nonsuch Park");
  });

  it("filed but not covering, the absence line and the beyond line serve in the layer's own words", async () => {
    class ParksBeyondSource extends FakeAreaSource {
      override async planningLayerFacts(layer: PlanningLayerKind, lat: number, lng: number) {
        if (layer === "registered_park_and_garden")
          return layerFacts({
            filedCount: 1723,
            nearestBeyond: { id: 91, name: "Nonsuch Park", detail: null, miles: 2.412 },
          });
        return super.planningLayerFacts(layer, lat, lng);
      }
    }
    const { sections } = await bundle(BIRKDALE, new ParksBeyondSource());
    const parks = sections.heritage.parksAndGardens;
    expect(parks.state).toBe("none-found");
    expect(parks.line).toBe(
      "no registered park and garden covers this postcode point in the national data",
    );
    expect(parks.beyondLine).toBe(
      "none within 2 miles — the nearest is Nonsuch Park, 2.412 miles away",
    );
  });
});

describe("EPC suggested improvements — the register's modelled steps (M6.21)", () => {
  it("Birkdale: the two steps serve in register sequence, named, never summed", async () => {
    const { sections } = await bundle(BIRKDALE);
    const cert0 = sections.epc.certificates[0];
    const improvements = cert0.improvements;
    expect(improvements?.state).toBe("served");
    expect(improvements?.line).toBe(
      "the certificate's suggested improvements, in the register's order — the register's modelled steps for this home, not advice",
    );
    expect(improvements?.steps).toHaveLength(2);
    const [step1, step2] = improvements!.steps;
    expect(step1.name).toBe("Solar water heating");
    expect(step1.typicalSavingLabel).toBe("£34.00");
    expect(step1.line).toBe(
      "Solar water heating · typical saving £34.00 a year · indicative cost £4,000 - £6,000 · energy rating after this step 86 · environmental rating after this step 87",
    );
    expect(step2.name).toBe("Solar photovoltaic panels, 2.5 kWp");
    expect(step2.typicalSavingLabel).toBe("£383.00");
    expect(improvements?.closingLine).toBe(
      "after all 2 steps, the register's model gives an energy rating of 93 and an environmental rating of 94",
    );
    // The savings are never summed anywhere in the block:
    // £34 + £383 = £417 appears in no form.
    expect(JSON.stringify(improvements)).not.toContain("417");
  });

  it("Exeter and Minerva Flat 4: the filed-null certificates serve the named no-measures state", async () => {
    const exeter = await bundle(EXETER);
    for (const cert of exeter.sections.epc.certificates) {
      expect(cert.improvements?.state).toBe("none-published");
      expect(cert.improvements?.line).toBe("the certificate publishes no suggested improvements");
      expect(cert.improvements?.steps).toEqual([]);
    }
    const minerva = await bundle(MINERVA);
    const flat4 = minerva.sections.epc.certificates.find(
      (c) => c.certificateNumber === "8401-7039-6529-6723-9906",
    );
    expect(flat4?.improvements?.state).toBe("none-published");
  });

  it("a certificate whose artefact predates the widening serves no improvements block", async () => {
    class PreWideningSource extends FakeAreaSource {
      override async epcArtefact(postcode: string) {
        if (postcode !== "CM3 2JT") return super.epcArtefact(postcode);
        return artefact([
          cert({
            certificateNumber: "2490-1633-0432-1002-3023",
            addressLine1: "19 Birkdale Rise",
            postTown: "CHELMSFORD",
            postcode: "CM3 2JT",
            band: "B",
            ratingCurrent: 85,
            assessmentType: "SAP",
            registrationDate: "2022-10-07",
          }),
        ]);
      }
    }
    const { sections } = await bundle(BIRKDALE, new PreWideningSource());
    expect(sections.epc.certificates[0].improvements).toBeNull();
  });

  it("an improvement number the published list does not hold serves its figures with no name", async () => {
    class UnknownStepSource extends FakeAreaSource {
      override async epcArtefact(postcode: string) {
        if (postcode !== "CM3 2JT") return super.epcArtefact(postcode);
        return artefact([
          cert({
            certificateNumber: "2490-1633-0432-1002-3023",
            addressLine1: "19 Birkdale Rise",
            postTown: "CHELMSFORD",
            postcode: "CM3 2JT",
            band: "B",
            ratingCurrent: 85,
            assessmentType: "SAP",
            registrationDate: "2022-10-07",
            suggestedImprovements: [
              {
                sequence: 1,
                improvementType: "Z",
                improvementNumber: 999,
                improvementCategory: 5,
                typicalSaving: 50,
                indicativeCost: "£100 - £200",
                energyRatingAfter: 88,
                environmentalRatingAfter: 89,
              },
            ],
          }),
        ]);
      }
    }
    const { sections } = await bundle(BIRKDALE, new UnknownStepSource());
    const improvements = sections.epc.certificates[0].improvements;
    expect(improvements?.state).toBe("served");
    expect(improvements?.steps[0].name).toBeNull();
    expect(improvements?.steps[0].line).toBe(
      "typical saving £50.00 a year · indicative cost £100 - £200 · energy rating after this step 88 · environmental rating after this step 89",
    );
  });
});

describe("EPC construction — the certificate's recorded descriptions (M6.26, D48)", () => {
  // The filed artefacts below are built from the captured
  // register documents (tests/fixtures/epc) with the
  // loader's minimisation mirrored — descriptions only,
  // normalised across the register's two shapes — so the
  // blocks are proven verbatim through the real brain
  // against the real corpus, as the spread suite does.
  function filedConstruction(doc: Record<string, unknown>): EpcCertificate["construction"] {
    const text = (entry: unknown): string | null => {
      if (entry === null || typeof entry !== "object") return null;
      const description = (entry as { description?: unknown }).description;
      if (typeof description === "string") return description;
      if (description !== null && typeof description === "object")
        return ((description as { value?: unknown }).value as string) ?? null;
      return null;
    };
    const texts = (group: unknown): string[] | null => {
      if (!Array.isArray(group)) return null;
      const out = group.map(text).filter((d): d is string => typeof d === "string");
      return out.length > 0 ? out : null;
    };
    return {
      walls: texts(doc.walls),
      roofs: texts(doc.roofs),
      floors: texts(doc.floors),
      windows: text(doc.windows),
      lighting: text(doc.lighting),
      mainHeating: texts(doc.main_heating),
      hotWater: text(doc.hot_water),
    };
  }

  function fixtureCerts(postcode: string, address: string): EpcCertificate[] {
    const dir = join(__dirname, "fixtures", "epc");
    const fixture = JSON.parse(readFileSync(join(dir, "fixture.json"), "utf8")) as {
      postcodes: Record<string, { searchFile: string }>;
    };
    const search = JSON.parse(
      readFileSync(join(dir, fixture.postcodes[postcode].searchFile), "utf8"),
    ) as { data: Record<string, unknown>[] };
    return search.data
      .filter((stub) => stub.addressLine1 === address)
      .map((stub) => {
        const raw = JSON.parse(
          readFileSync(join(dir, "certs", `${stub.certificateNumber as string}.json`), "utf8"),
        ) as { data?: Record<string, unknown> } & Record<string, unknown>;
        const doc = (raw.data ?? raw) as Record<string, unknown>;
        return cert({
          certificateNumber: stub.certificateNumber as string,
          addressLine1: address,
          postcode,
          band: doc.current_energy_efficiency_band as string,
          assessmentType: doc.assessment_type as string,
          registrationDate: doc.registration_date as string,
          construction: filedConstruction(doc),
        });
      });
  }

  class ConstructionSource extends FakeAreaSource {
    override async epcArtefact(postcode: string) {
      if (postcode === "CM3 2JT") return artefact(fixtureCerts("CM3 2JT", "19 Birkdale Rise"));
      if (postcode === "E16 1GN") return artefact(fixtureCerts("E16 1GN", "6 Exeter Road"));
      if (postcode === "KT17 1FH")
        return artefact(fixtureCerts("KT17 1FH", "Flat 4 Minerva House"));
      return super.epcArtefact(postcode);
    }
    override async loadEpc() {
      // The fixture artefacts are already filed.
    }
  }
  const constructionSource = new ConstructionSource();

  const BASIS_LINE =
    "the certificate's own description of this home's construction, recorded at the assessment; on an existing-home (RdSAP) certificate '(assumed)' means the assessor could not inspect that part and recorded the standard assumption for a home of its kind.";
  const U_VALUE_LINE =
    "the U-value in a description is the register's measure of how fast heat passes through that part of the home, in watts per square metre for each degree of temperature difference — lower lets less heat escape.";

  it("Birkdale: the SAP set serves verbatim, in register order, with both pinned lines", async () => {
    const { sections } = await bundle(BIRKDALE, constructionSource);
    const construction = sections.epc.certificates[0]?.construction;
    expect(construction?.line).toBe(BASIS_LINE);
    expect(construction?.uValueLine).toBe(U_VALUE_LINE);
    expect(construction?.groups.map((g) => g.key)).toEqual([
      "walls",
      "roofs",
      "floors",
      "windows",
      "lighting",
      "mainHeating",
      "hotWater",
    ]);
    expect(construction?.groups.map((g) => g.line)).toEqual([
      "Walls: Average thermal transmittance 0.27 W/m²K",
      "Roofs: Average thermal transmittance 0.11 W/m²K",
      "Floors: Average thermal transmittance 0.15 W/m²K",
      "Windows: High performance glazing",
      "Lighting: Low energy lighting in all fixed outlets",
      "Main heating: Boiler and radiators, mains gas",
      "Hot water: From main system, waste water heat recovery",
    ]);
  });

  it("Exeter: the two certificates disagree whole — the 2023 windows absence is its own, never borrowed", async () => {
    const { sections } = await bundle(EXETER, constructionSource);
    expect(sections.epc.certificates.map((c) => c.registrationDate)).toEqual([
      "2023-05-25",
      "2013-10-15",
    ]);
    const [cert2023, cert2013] = sections.epc.certificates;
    // The 2023 RdSAP words, "(assumed)" markers kept; no
    // transmittance text anywhere, so no U-value line.
    expect(cert2023.construction?.uValueLine).toBeNull();
    expect(cert2023.construction?.groups.map((g) => g.line)).toEqual([
      "Walls: Cavity wall, as built, insulated (assumed)",
      "Roofs: (another dwelling above)",
      "Floors: Solid, insulated (assumed)",
      "Windows: not recorded on this certificate",
      "Lighting: Low energy lighting in all fixed outlets",
      "Main heating: Community scheme",
      "Hot water: Community scheme",
    ]);
    const windows2023 = cert2023.construction?.groups.find((g) => g.key === "windows");
    expect(windows2023?.descriptions).toEqual([]);
    // The 2013 SAP certificate keeps its own windows fact
    // and its transmittance set — the disagreement stands.
    expect(cert2013.construction?.uValueLine).toBe(U_VALUE_LINE);
    expect(cert2013.construction?.groups.map((g) => g.line)).toEqual([
      "Walls: Average thermal transmittance 0.28 W/m²K",
      "Roofs: Average thermal transmittance 0.2 W/m²K",
      "Floors: Average thermal transmittance 0.21 W/m²K",
      "Windows: Fully double glazed",
      "Lighting: Low energy lighting in all fixed outlets",
      "Main heating: Community scheme",
      "Hot water: Community scheme with CHP",
    ]);
  });

  it("Minerva Flat 4: the other-premises pair and the register's own ampersand serve verbatim", async () => {
    const { sections } = await bundle(MINERVA, constructionSource);
    const flat4 = sections.epc.certificates.find(
      (c) => c.certificateNumber === "8401-7039-6529-6723-9906",
    );
    expect(flat4?.construction?.groups.map((g) => g.line)).toEqual([
      "Walls: Average thermal transmittance 0.18 W/m²K",
      "Roofs: (other premises above)",
      "Floors: (other premises below)",
      "Windows: High performance glazing",
      "Lighting: Low energy lighting in all fixed outlets",
      "Main heating: Boiler& underfloor, mains gas",
      "Hot water: From main system",
    ]);
    expect(flat4?.construction?.uValueLine).toBe(U_VALUE_LINE);
  });

  it("a certificate whose artefact predates the widening serves no construction block", async () => {
    class PreWideningSource extends FakeAreaSource {
      override async epcArtefact(postcode: string) {
        if (postcode !== "CM3 2JT") return super.epcArtefact(postcode);
        return artefact([
          cert({
            certificateNumber: "2490-1633-0432-1002-3023",
            addressLine1: "19 Birkdale Rise",
            postTown: "CHELMSFORD",
            postcode: "CM3 2JT",
            band: "B",
            ratingCurrent: 85,
            assessmentType: "SAP",
            registrationDate: "2022-10-07",
          }),
        ]);
      }
    }
    const { sections } = await bundle(BIRKDALE, new PreWideningSource());
    expect(sections.epc.certificates[0].construction).toBeNull();
  });

  it("the served shape holds no numeric U-value field and no element rating, anywhere", async () => {
    const { sections } = await bundle(BIRKDALE, constructionSource);
    const keys: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (Array.isArray(value)) {
        value.forEach((element, i) => walk(element, `${path}[${i}]`));
        return;
      }
      if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          keys.push(key);
          walk(child, `${path}.${key}`);
        }
      }
    };
    walk(sections.epc, "epc");
    // No key anywhere in the served EPC section names a
    // U-value field or an element efficiency rating — the
    // only U-values in the output are text inside
    // descriptions. The single key the scan allows is
    // uValueLine: the pinned D13 line ABOUT the U-value,
    // a string (proven string-or-null by the leaf walk
    // below), never a number.
    for (const key of keys) {
      if (key !== "uValueLine") expect(key, "served key").not.toMatch(/u[-_ ]?value/i);
      expect(key, "served key").not.toMatch(/efficiency_rating|efficiencyRating/i);
    }
    const serialised = JSON.stringify(sections.epc);
    expect(serialised).not.toContain("energy_efficiency_rating");
    expect(serialised).not.toContain("environmental_efficiency_rating");
    // Every leaf of every construction block is a string
    // or null: no rating number can ride inside the block
    // in any form.
    const leafTypes = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(leafTypes);
      if (value !== null && typeof value === "object")
        return Object.values(value).flatMap(leafTypes);
      return [value === null ? "null" : typeof value];
    };
    for (const certificate of sections.epc.certificates) {
      expect(certificate.construction).not.toBeNull();
      for (const type of leafTypes(certificate.construction))
        expect(["string", "null"]).toContain(type);
    }
  });
});

describe("banned wording", () => {
  it("no served string turns an area statistic into a verdict, anywhere in the bundle", async () => {
    const resolutions = [BIRKDALE, EXETER, MINERVA, C1, C3, C4, C8, C9, SCOTLAND, ESTUARY];
    const summaries = Array.from({ length: 10 }, (_, i) => imdSummaryFor(i + 1));
    for (const resolution of resolutions) {
      const built = await bundle(resolution);
      let json = JSON.stringify(built);
      for (const summary of summaries) json = json.split(summary).join("");
      // "Protected wreck site" is the designation's own name
      // (M6.21, the NHLE dataset): the layer cannot be
      // served without naming it, and the name is not a
      // verdict. Removing the name's forms (in the label,
      // the layer key and the section key) keeps a served
      // "this home is protected" tripping the scan — only
      // the name is excused (the state matrix's precedent).
      const text = json
        .toLowerCase()
        .split("protected wreck")
        .join("")
        .split("protected_wreck")
        .join("")
        .split("protectedwrecks")
        .join("");
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
