// Bundle-shape contracts (plan step M6.19) — the frozen
// front-end contract for M7.
//
// Every bundle the website will consume is built here from fake
// sources, reduced to a canonical SHAPE (sorted keys, type tags,
// array element shapes), and asserted deep-equal against the
// pinned shape for its variant. A shape change in M7 — a renamed
// key, a dropped field, a nullability change, a new section —
// fails here loudly instead of breaking the site silently.
//
// Values in the fakes are illustrative; only shapes are pinned.
// State-by-state served LINES are the state census's job
// (tests/state-matrix.test.ts); golden figures are the matrix's
// and the golden replay's job (tests/golden-replay.test.ts).
// This file pins the third thing: the wire shape of every bundle
// kind and rung the front end branches on, plus the key-changing
// state variants (a section whose keys appear or disappear with
// its state).
//
// RE-PIN RECORD: M6.20 (decision D39) deliberately widened the
// frozen crime shape after this freeze — the served crime
// section gained perHead, englandFigure and
// calibrationExplainer, the short bundle's crime section gained
// perHeadLine and englandLine, and a crime.served-pre-calibration
// pin was added for the pre-step artefact shape. Authorised by
// the founder's D39 ruling; recorded here and in the golden
// matrix so the change is never mistaken for drift.
//
// RE-PIN RECORD: M6.21 (decision D41) deliberately widened the
// frozen area and short shapes — the constraints section gained
// brownfield and builtUpArea, the heritage section gained
// worldHeritageSites, battlefields, protectedWrecks and
// worldHeritageBufferZones, every served EPC certificate gained
// improvements, and the short constraints skim gained brownfield
// and builtUpArea. Eleven pins moved (area.rung1-rich, area.rung2,
// area.rung1-empty, area.rung1-scotland, the three flag-on pins,
// area.tribunal-served, short.rung1, short.rung2, short.scotland);
// the rung-3/4 pins did not move — no section serves there.
// Authorised by the founder's D41 ruling; recorded here and in
// the golden matrix so the change is never mistaken for drift.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  resolveAddressInput,
  type AddressDataSource,
  type AddressResolution,
  type DirectoryPostcode,
} from "../lib/address";
import {
  buildAreaBundle,
  type AreaDataSource,
  type BroadbandAnswerFacts,
  type CensusFacts,
  type CompanyOwnershipFacts,
  type EpcArtefact,
  type EpcCertificate,
  type MobileAnswerFacts,
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
// The census facts are the loader's own parse of its committed
// fixture (the area-bundle test's pattern), so the census
// section's served shape is pinned against real table fragments.
import { DATASETS, buildRows, parseDatasetCsv } from "../loaders/load-census.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------
// Shape machinery
// ------------------------------------------------------------------

type Shape = string | { [key: string]: Shape } | Shape[];

function shapeOf(value: unknown): Shape {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const distinct = new Map<string, Shape>();
    for (const element of value) {
      const s = shapeOf(element);
      distinct.set(JSON.stringify(s), s);
    }
    return [...distinct.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, s]) => s);
  }
  if (typeof value === "object") {
    const out: { [key: string]: Shape } = {};
    for (const key of Object.keys(value as object).sort()) {
      out[key] = shapeOf((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return typeof value;
}

const PRINT = process.env.PRINT_SHAPES === "1";
const EXPECTED = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "replay", "bundle-shapes.json"), "utf8"),
) as Record<string, Shape>;

function pin(name: string, bundle: unknown) {
  const shape = shapeOf(bundle);
  if (PRINT) {
    console.log(`@@SHAPE ${name} ${JSON.stringify(shape)}`);
    return;
  }
  expect(EXPECTED[name], `no pinned shape recorded for ${name}`).toBeDefined();
  expect(
    shape,
    `bundle shape changed for ${name} — if this change is intended, re-pin it here deliberately`,
  ).toEqual(EXPECTED[name]);
}

// ------------------------------------------------------------------
// Directories and resolutions
// ------------------------------------------------------------------

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

const ENG_DIR = directory({
  postcode: "CM3 2JT",
  latitude: 51.776176,
  longitude: 0.60387,
  council: "Braintree",
  ward: "Witham South",
  region: "East of England",
  lsoaCode: "E01021395",
  msoaCode: "E02004463",
});
const SCO_DIR = directory({
  postcode: "EH1 1AD",
  latitude: 55.948894,
  longitude: -3.19259,
  council: "City of Edinburgh",
  ward: "City Centre",
  region: "S99999999",
  lsoaCode: "S01014710",
  msoaCode: "S02002727",
});
const FLAT_DIR = directory({
  postcode: "KT17 1FH",
  latitude: 51.344571,
  longitude: -0.247104,
  council: "Epsom and Ewell",
  ward: "Nonsuch",
  region: "South East",
  lsoaCode: "E01030396",
  msoaCode: "E02006837",
});

function home(
  dir: DirectoryPostcode,
  address: Partial<{
    paon: string | null;
    saon: string | null;
    street: string | null;
    locality: string | null;
    town: string | null;
  }> & { label: string },
): AddressResolution {
  const { label, ...parts } = address;
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
      label,
      ...parts,
    },
  } as AddressResolution;
}

function addressList(dir: DirectoryPostcode): AddressResolution {
  return {
    rung: 2,
    kind: "address-list",
    directory: dir,
    street: null,
    building: null,
    addresses: [],
  } as AddressResolution;
}

const ENG_HOME = home(ENG_DIR, { paon: "19", street: "BIRKDALE RISE", label: "19 Birkdale Rise" });
const SCO_HOME = home(SCO_DIR, { paon: "1", street: "PRINCES STREET", label: "1 Princes Street" });
const FLAT_HOME = home(FLAT_DIR, {
  paon: "Minerva House",
  saon: "Flat 4",
  street: "CERES CRESCENT",
  label: "Flat 4, Minerva House",
});
const WIDER: AddressResolution = {
  rung: 3,
  kind: "wider-area",
  outward: "CM3",
  postcodeCount: 1588,
} as AddressResolution;
const NO_LOCATION: AddressResolution = { rung: 4, kind: "no-location" } as AddressResolution;

// ------------------------------------------------------------------
// Address resolution — the resolver against a fake directory
// ------------------------------------------------------------------

class FakeAddressSource implements AddressDataSource {
  async directoryPostcode(postcode: string) {
    return postcode === ENG_DIR.postcode ? ENG_DIR : null;
  }
  async addressesInPostcode() {
    return [
      {
        postcode: "CM3 2JT",
        paon: "19",
        saon: null,
        street: "BIRKDALE RISE",
        locality: null,
        town: "CHELMSFORD",
      },
      {
        postcode: "CM3 2JT",
        paon: "21",
        saon: null,
        street: "BIRKDALE RISE",
        locality: null,
        town: "CHELMSFORD",
      },
    ];
  }
  async districtSummary() {
    return { postcodeCount: 1588 };
  }
}

describe("contract — address resolution", () => {
  it("pins the four rungs", async () => {
    const source = new FakeAddressSource();
    pin(
      "resolution.rung1",
      await resolveAddressInput("19 Birkdale Rise, Hatfield Peverel CM3 2JT", source),
    );
    pin("resolution.rung2", await resolveAddressInput("Birkdale Rise CM3 2JT", source));
    pin("resolution.rung3", await resolveAddressInput("CM3", source));
    pin("resolution.rung4", await resolveAddressInput("Birkdale Rise", source));
  });
});

// ------------------------------------------------------------------
// Nearby
// ------------------------------------------------------------------

function point(name: string | null, miles: number, extra: Partial<NearbyPoint> = {}): NearbyPoint {
  return {
    name,
    latitude: ENG_DIR.latitude + miles / 69,
    longitude: ENG_DIR.longitude,
    ...extra,
  };
}

class FakeNearbySource implements NearbyDataSource {
  mode: "full" | "beyond" | "none" | "unfiled" = "full";
  async filedCount() {
    return this.mode === "unfiled" ? 0 : 1000;
  }
  async pointsWithin(category: NearbyCategory) {
    if (this.mode !== "full") return [];
    const base = [
      point("Nearest One", 0.1, category.startsWith("schools") ? { selective: false } : {}),
      point("Second One", 0.5, { detail: "a filed detail" }),
      point(null, 1.5),
    ];
    return base;
  }
  async nearestPoint(category: NearbyCategory) {
    if (this.mode === "none") return null;
    if (this.mode === "beyond") return point("Beyond One", 3.2);
    return point("Nearest One", 0.1, category.startsWith("schools") ? { selective: true } : {});
  }
}

describe("contract — nearby", () => {
  it("pins the served variants and the rung forms", async () => {
    const source = new FakeNearbySource();
    pin("nearby.served", await buildNearbyBundle(ENG_HOME, source));
    source.mode = "beyond";
    pin("nearby.beyond-only", await buildNearbyBundle(ENG_HOME, source));
    source.mode = "none";
    pin("nearby.none-anywhere", await buildNearbyBundle(ENG_HOME, source));
    source.mode = "unfiled";
    pin("nearby.not-filed", await buildNearbyBundle(ENG_HOME, source));
    pin("nearby.rung3", await buildNearbyBundle(WIDER, source));
    pin("nearby.rung4", await buildNearbyBundle(NO_LOCATION, source));
  });
});

// ------------------------------------------------------------------
// Sold prices
// ------------------------------------------------------------------

function sale(partial: Partial<SoldPriceRow>): SoldPriceRow {
  return {
    transactionId: "txn",
    price: 300000,
    saleDate: "2020-01-01",
    postcode: "CM3 2JT",
    propertyType: "D",
    newBuild: false,
    tenure: "F",
    paon: "1",
    saon: null,
    street: "BIRKDALE RISE",
    locality: null,
    town: "CHELMSFORD",
    category: "A",
    sourceName: "HM Land Registry — Price Paid Data",
    sourceDate: "2026-07-20",
    ...partial,
  };
}

class FakeSoldSource implements SoldPricesDataSource {
  rows: SoldPriceRow[] = [];
  edition: string | null = "2026-07-20";
  async salesInPostcode() {
    return this.rows;
  }
  async loadEdition() {
    return this.edition;
  }
  async loadPostcode() {}
}

describe("contract — sold prices", () => {
  it("pins the served variants and the rung forms", async () => {
    const source = new FakeSoldSource();
    source.rows = [
      sale({ paon: "19", price: 588995, saleDate: "2023-06-15" }),
      ...[1, 2, 3, 4, 5, 6].map((n) =>
        sale({ paon: String(n), price: 300000 + n * 1000, saleDate: `202${n}-01-01` }),
      ),
      sale({ paon: "32", category: "B", price: 153243, saleDate: "2022-12-29" }),
    ];
    pin("sold.served-house", await buildSoldPricesBundle(ENG_HOME, source));

    source.rows = [
      sale({
        postcode: "KT17 1FH",
        paon: "Minerva House",
        saon: "Flat 4",
        price: 420000,
        saleDate: "2019-12-03",
        propertyType: "F",
        tenure: "L",
      }),
      ...[1, 2, 3, 5, 6].map((n) =>
        sale({
          postcode: "KT17 1FH",
          paon: "Minerva House",
          saon: `Flat ${n}`,
          price: 350000 + n * 5000,
          saleDate: `202${n}-02-02`,
          propertyType: "F",
          tenure: "L",
        }),
      ),
    ];
    pin("sold.served-flat", await buildSoldPricesBundle(FLAT_HOME, source));
    pin("sold.rung2", await buildSoldPricesBundle(addressList(FLAT_DIR), source));

    source.rows = source.rows.slice(0, 3);
    pin("sold.too-few", await buildSoldPricesBundle(ENG_HOME, source));

    source.rows = [];
    pin("sold.loaded-none", await buildSoldPricesBundle(ENG_HOME, source));
    pin("sold.not-covered", await buildSoldPricesBundle(SCO_HOME, source));
    pin("sold.rung3", await buildSoldPricesBundle(WIDER, source));
    pin("sold.rung4", await buildSoldPricesBundle(NO_LOCATION, source));
  });
});

// ------------------------------------------------------------------
// Crime
// ------------------------------------------------------------------

function crimeArtefact(total: number): FiledCrimeAnswer {
  return {
    total,
    // The M6.20 calibration fields (decision D39), as the
    // loader files them: Birkdale's measured Basis B
    // population, and the England embedding at the practice
    // fixture's synthetic total over the real denominator.
    basisResidents: 6380,
    national: { total: 5503997, residents: 56490108 },
    windowFrom: "2025-10",
    windowTo: "2026-09",
    months: [
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
    ].map((month) => ({ month, count: Math.floor(total / 12) })),
    categories: { "violent-crime": 133, "anti-social-behaviour": 65, burglary: 7 },
    basis: "Street-level crimes recorded within 1 mile of the postcode point (Police.uk API)",
    sourceName: "Police.uk — street-level crime data",
    sourceDate: "2026-11-12",
    loadedAt: "2026-11-12T00:00:00.000Z",
  };
}

class FakeCrimeSource implements CrimeDataSource {
  artefact: FiledCrimeAnswer | null = crimeArtefact(330);
  async crimeAnswer() {
    return this.artefact;
  }
  async loadPostcode(): Promise<void> {
    throw new Error("the crime load failed");
  }
}

describe("contract — crime", () => {
  it("pins the served variants and the rung forms", async () => {
    const source = new FakeCrimeSource();
    const now = new Date("2026-11-15T00:00:00.000Z");
    pin("crime.served", await buildCrimeBundle(ENG_HOME, source, { now }));
    // The pre-M6.20 artefact shape: counts served,
    // calibration absent (nulls), the explainer present.
    // This pin is the deliberate post-freeze shape change's
    // other half — M6.20 (decision D39) widened the served
    // crime shape after M6.19 froze it, and the freeze
    // record in tests/fixtures/replay/bundle-shapes.json
    // was re-pinned for it with the founder's authority.
    const preStep = crimeArtefact(330);
    delete preStep.basisResidents;
    delete preStep.national;
    source.artefact = preStep;
    pin("crime.served-pre-calibration", await buildCrimeBundle(ENG_HOME, source, { now }));
    source.artefact = crimeArtefact(330);
    pin(
      "crime.served-stale",
      await buildCrimeBundle(ENG_HOME, source, { now: new Date("2027-02-01T00:00:00.000Z") }),
    );
    source.artefact = null;
    pin("crime.not-filed", await buildCrimeBundle(ENG_HOME, source, { now }));
    pin("crime.not-covered", await buildCrimeBundle(SCO_HOME, source, { now }));
    pin("crime.rung3", await buildCrimeBundle(WIDER, source, { now }));
    pin("crime.rung4", await buildCrimeBundle(NO_LOCATION, source, { now }));
  });
});

// ------------------------------------------------------------------
// Flood
// ------------------------------------------------------------------

function floodLayer(partial: Partial<FloodLayerFacts>): FloodLayerFacts {
  return {
    filedCount: 1000,
    covering: [],
    nearestWithin: [],
    nearestBeyond: null,
    sourceName: "Environment Agency",
    sourceDate: "2026-11-03",
    ...partial,
  };
}

class FakeFloodSource implements FloodDataSource {
  layers = new Map<string, FloodLayerFacts>();
  async layerFacts(layer: string) {
    return this.layers.get(layer) ?? floodLayer({});
  }
}

describe("contract — flood", () => {
  it("pins the served variants and the rung forms", async () => {
    const source = new FakeFloodSource();
    source.layers.set(
      "flood_zone",
      floodLayer({
        covering: [{ riskLabel: "Flood zone 3", detail: "river and sea · modelled" }],
        nearestWithin: [{ riskLabel: "Flood zone 2", detail: null, miles: 0.4 }],
      }),
    );
    source.layers.set(
      "rofrs",
      floodLayer({ nearestBeyond: { riskLabel: "Low", detail: null, miles: 2.4 } }),
    );
    source.layers.set("rofsw", floodLayer({ filedCount: 0, sourceName: null, sourceDate: null }));
    pin("flood.served-mixed", await buildFloodBundle(ENG_HOME, source));
    pin("flood.not-covered", await buildFloodBundle(SCO_HOME, source));
    pin("flood.rung3", await buildFloodBundle(WIDER, source));
    pin("flood.rung4", await buildFloodBundle(NO_LOCATION, source));
  });
});

// ------------------------------------------------------------------
// Area bundle
// ------------------------------------------------------------------

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

function planningLayer(partial: Partial<PlanningLayerFacts>): PlanningLayerFacts {
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

function contractCert(
  partial: Partial<EpcCertificate> & { certificateNumber: string },
): EpcCertificate {
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
    heatingCostCurrent: null,
    hotWaterCostCurrent: null,
    lightingCostCurrent: null,
    heatingCostPotential: null,
    hotWaterCostPotential: null,
    lightingCostPotential: null,
    ...partial,
  };
}

const BROADBAND_FILED: BroadbandAnswerFacts = {
  basis: "Ofcom Connected Nations — fixed broadband coverage by postcode",
  snapshot: "2026-01",
  gigabitCapablePct: 100,
  superfast30Pct: 100,
  ultrafast100Pct: 100,
  ultrafast300Pct: 100,
  ngaPct: 100,
  unable2Pct: 0,
  unable5Pct: 0,
  unable10Pct: 0,
  unable30Pct: 0,
  unableDecentFixedOrFwaPct: 0,
  decentViaFwaPct: 0,
  speedBandPct: {
    under_2: 0,
    "2_to_5": 0,
    "5_to_10": 0,
    "10_to_30": 0,
    "30_to_300": 0,
    "300_plus": 100,
  },
};

const MOBILE_FILED: MobileAnswerFacts = {
  basis: "Ofcom Connected Nations — mobile coverage by local authority",
  snapshot: "2026-01",
  laua: "E06000047",
  lauaName: "Braintree",
  services: {
    voice: { outdoor: { noOperatorPct: 0, allOperatorsPct: 99.29, atLeastOneOperatorPct: 100 } },
    "4g": {
      outdoor: { noOperatorPct: 0, allOperatorsPct: 99.04, atLeastOneOperatorPct: 100 },
      indoor: { noOperatorPct: 0.99, allOperatorsPct: 84.64, atLeastOneOperatorPct: 99 },
    },
    "5g_high_confidence": {
      outdoor: { noOperatorPct: 2.1, allOperatorsPct: 42.45, atLeastOneOperatorPct: 97.9 },
    },
    "5g_very_high_confidence": {
      outdoor: { noOperatorPct: null, allOperatorsPct: null, atLeastOneOperatorPct: null },
    },
    "5g_sa_high_confidence": {
      outdoor: { noOperatorPct: null, allOperatorsPct: null, atLeastOneOperatorPct: null },
    },
    "5g_sa_very_high_confidence": {
      outdoor: { noOperatorPct: null, allOperatorsPct: null, atLeastOneOperatorPct: null },
    },
  },
};

class FakeAreaSource implements AreaDataSource {
  empty = false;
  layers = new Map<string, PlanningLayerFacts>();
  gate = true;
  epc: EpcArtefact | null = {
    certificates: [
      contractCert({
        certificateNumber: "0000-0000-0000-0000-0001",
        addressLine1: "19 Birkdale Rise",
        band: "B",
        ratingCurrent: 81,
        potentialBand: "B",
        totalFloorArea: 141,
        dwellingType: "Detached house",
        assessmentType: "SAP",
        registrationDate: "2022-10-07",
        heatingCostCurrent: 300,
        hotWaterCostCurrent: 100,
        lightingCostCurrent: 89,
        heatingCostPotential: 280,
        hotWaterCostPotential: 95,
        lightingCostPotential: 80,
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
      contractCert({
        certificateNumber: "0000-0000-0000-0000-0002",
        addressLine1: "21 Birkdale Rise",
        band: "C",
        ratingCurrent: 70,
        assessmentType: "RdSAP",
        registrationDate: "2020-01-01",
      }),
    ],
    certificateCount: 2,
    sourceName: "Get energy performance of buildings data (MHCLG)",
    sourceDate: "2026-11-12",
    loadedAt: "2026-11-12T00:00:00.000Z",
  };
  company: CompanyOwnershipFacts = {
    ccodFiledCount: 4485124,
    ocodFiledCount: 90950,
    editions: {
      ccod: { sourceName: "HM Land Registry — CCOD", sourceDate: "2026-11-01" },
      ocod: { sourceName: "HM Land Registry — OCOD", sourceDate: "2026-11-01" },
    },
    titles: [],
    snapshots: {},
  };
  tribunal: TribunalFacts = {
    filedCount: 28,
    lastFiledAt: "2026-11-14T05:15:00.000Z",
    sourceName: "GOV.UK — Residential property tribunal decisions",
    rows: [],
  };
  broadband: BroadbandAnswerFacts | null = BROADBAND_FILED;
  mobile: MobileAnswerFacts | null = MOBILE_FILED;

  async planningLayerFacts(layer: string) {
    if (this.empty) return planningLayer({ filedCount: 0, sourceName: null, sourceDate: null });
    return this.layers.get(layer) ?? planningLayer({});
  }
  async designationFacts() {
    if (this.empty)
      return {
        byType: {
          sssi: planningLayer({ filedCount: 0, sourceName: null, sourceDate: null }),
          sac: planningLayer({ filedCount: 0, sourceName: null, sourceDate: null }),
          spa: planningLayer({ filedCount: 0, sourceName: null, sourceDate: null }),
          ramsar: planningLayer({ filedCount: 0, sourceName: null, sourceDate: null }),
        },
        overlaps: [] as [number, number][],
      };
    return {
      byType: {
        sssi: planningLayer({ covering: [{ id: 1, name: "Ashtead Common", detail: null }] }),
        sac: planningLayer({
          nearestWithin: [{ id: 2, name: "Mole Gap", detail: null, miles: 0.4 }],
        }),
        spa: planningLayer({
          nearestBeyond: { id: 3, name: "Thames Estuary", detail: null, miles: 4.2 },
        }),
        ramsar: planningLayer({}),
      },
      overlaps: [[1, 2]] as [number, number][],
    };
  }
  async listedFacts() {
    if (this.empty)
      return { filedCount: 0, within: [], nearestBeyond: null, sourceName: null, sourceDate: null };
    return {
      filedCount: 379169,
      within: [
        { listEntryId: "100001", name: "SAWYERS", grade: "II", miles: 0.008 },
        { listEntryId: "100002", name: null, grade: "II*", miles: 0.5 },
      ],
      nearestBeyond: null,
      sourceName: "Historic England — National Heritage List for England",
      sourceDate: "2026-11-10",
    };
  }
  async phiFacts() {
    if (this.empty)
      return { filedCount: 0, nearest: null, typesWithin: [], sourceName: null, sourceDate: null };
    return {
      filedCount: 818225,
      nearest: { habitat: "Deciduous woodland", miles: 0.123 },
      typesWithin: ["Deciduous woodland", "Lowland meadow"],
      sourceName: "Natural England — Priority Habitat Inventory",
      sourceDate: "2026-11-10",
    };
  }
  async article4Gate() {
    return this.empty ? false : this.gate;
  }
  async brownfieldFacts() {
    if (this.empty)
      return { filedCount: 0, within: [], nearestBeyond: null, sourceName: null, sourceDate: null };
    return {
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
      ],
      nearestBeyond: null,
      sourceName: "planning.data.gov.uk — brownfield land (Open Government Licence v3.0)",
      sourceDate: "2026-11-16",
    };
  }
  async brownfieldGate() {
    return this.empty ? false : this.gate;
  }
  async epcArtefact() {
    return this.empty ? null : this.epc;
  }
  async loadEpc(): Promise<void> {
    throw new Error("the EPC load failed");
  }
  async councilTaxRow() {
    if (this.empty) return null;
    return {
      authorityName: "Braintree",
      nation: "england" as const,
      taxYear: "2026-27",
      bandDAreaAveragePence: 228034,
      parishAveraged: true,
      components: [
        { role: "billing_authority", label: "Braintree", pence: 221580 },
        { role: "parish_average", label: "Parish average", pence: 6454 },
      ],
      sourceName: "MHCLG — Council Tax levels set by local authorities in England 2026 to 2027",
      sourceDate: "2026-03-25",
    };
  }
  async censusRow(msoaCode: string) {
    if (this.empty) return null;
    return CENSUS_BY_MSOA.get(msoaCode) ?? null;
  }
  async imdRow() {
    if (this.empty) return null;
    return {
      lsoaCode: "E01021395",
      lsoaName: "Braintree 018C",
      decile: 8,
      summary:
        "This area is in the tenth of areas with the lowest measured deprivation (decile 8 of 10)",
      domains: { income: 1, employment: 2 },
      sourceName: "English Indices of Deprivation 2025 — File 7 (MHCLG)",
      sourceDate: "2025-10-30",
    };
  }
  async airSquare() {
    if (this.empty) return null;
    return {
      year: 2024,
      no2: 8.150298,
      pm25: 7.124671,
      pm10: 12.54823,
      sourceName: "Defra — Pollution Climate Mapping (PCM)",
      sourceDate: "2025-06-30",
    };
  }
  async noiseRows() {
    if (this.empty) return { filedCount: 0, rows: [], sourceName: null, sourceDate: null };
    return {
      filedCount: 100,
      rows: [
        { sourceKind: "road", dayBand: "55-59", nightBand: "50-54" },
        { sourceKind: "rail", dayBand: null, nightBand: null },
      ],
      sourceName: "Defra strategic noise mapping — England Round 4 (2022 reference year)",
      sourceDate: "2024-10-01",
    };
  }
  async benefits() {
    if (this.empty) return { claimantCount: null, ucPeople: null, ucHouseholds: null, bases: null };
    const stamp = { sourceName: "DWP via Stat-Xplore / ONS Nomis", sourceDate: "2026-10-13" };
    return {
      claimantCount: { month: "2026-09-01", count: 15, pct: 1.6, ...stamp },
      ucPeople: { month: "2026-05-01", count: 117, pct: null, ...stamp },
      ucHouseholds: { month: "2026-04-01", count: 105, pct: null, ...stamp },
      bases: { residents: 1489, households: 625 },
    };
  }
  async solarCell() {
    if (this.empty) return { gridFiledCount: 0, cell: null };
    return {
      gridFiledCount: 1000,
      cell: {
        cellRef: "51.75,0.65",
        yieldKwhPerKwp: 1057.65,
        irradiationKwhM2: 1336.65,
        peakPowerKwp: 1,
        systemLossPct: 14,
        slopeDeg: 35,
        azimuthDeg: 0,
        mounting: "building-integrated",
        pvTechnology: "crystalline silicon",
        radiationDb: "PVGIS-SARAH3",
        yearMin: 2005,
        yearMax: 2023,
        sourceName: "PVGIS (European Commission Joint Research Centre) — PVGIS-SARAH3",
        sourceDate: "2023-12-31",
      },
    };
  }
  async companyOwnershipFacts() {
    return this.company;
  }
  async tribunalFacts() {
    return this.tribunal;
  }
  async broadbandAnswer() {
    return this.empty ? null : this.broadband;
  }
  async mobileAnswer() {
    return this.empty ? null : this.mobile;
  }
}

function richestAreaSource(): FakeAreaSource {
  const source = new FakeAreaSource();
  source.layers.set(
    "conservation_area",
    planningLayer({ covering: [{ id: 1, name: "Old Town", detail: null }] }),
  );
  source.layers.set(
    "article_4_area",
    planningLayer({ nearestWithin: [{ id: 2, name: "Old Town A4", detail: "1A;1C", miles: 0.3 }] }),
  );
  source.layers.set(
    "green_belt",
    planningLayer({ nearestBeyond: { id: 3, name: null, detail: null, miles: 3.1 } }),
  );
  source.layers.set("scheduled_monument", planningLayer({}));
  source.layers.set(
    "ancient_woodland",
    planningLayer({
      covering: [
        { id: 4, name: null, detail: "Ancient Semi-Natural Woodland (revised inventory)" },
      ],
    }),
  );
  return source;
}

describe("contract — area bundle", () => {
  it("pins the richest rung-1 shape, flag off (company section absent)", async () => {
    const bundle = await buildAreaBundle(ENG_HOME, richestAreaSource());
    if (bundle.kind === "area-bundle") {
      expect(Object.keys(bundle.sections).sort()).not.toContain("companyOwnership");
    }
    pin("area.rung1-rich", bundle);
  });

  it("pins the rung-2 shape", async () => {
    pin("area.rung2", await buildAreaBundle(addressList(ENG_DIR), richestAreaSource()));
  });

  it("pins the empty-source shape (every section in its not-filed form)", async () => {
    const source = richestAreaSource();
    source.empty = true;
    pin("area.rung1-empty", await buildAreaBundle(ENG_HOME, source));
  });

  it("pins the Scotland rung-1 shape (the not-covered section forms)", async () => {
    pin("area.rung1-scotland", await buildAreaBundle(SCO_HOME, richestAreaSource()));
  });

  it("pins the rung-3 and rung-4 forms", async () => {
    const source = richestAreaSource();
    pin("area.rung3", await buildAreaBundle(WIDER, source));
    pin("area.rung4", await buildAreaBundle(NO_LOCATION, source));
  });

  it("pins the flag-on company shapes (own title, building line, no match)", async () => {
    const own = richestAreaSource();
    own.company = {
      ...own.company,
      titles: [
        {
          titleNumber: "SY857898",
          dataset: "ccod",
          tenure: "Leasehold",
          propertyAddress: "Flat 4, Juno House, 16 Ceres Crescent, Epsom KT17 1FH",
          proprietorName: "CLARION HOUSING ASSOCIATION LIMITED",
          companyNumber: "7686",
          proprietorshipCategory: "Industrial and Provident Society",
          countryIncorporated: null,
          additionalProprietor: false,
          sourceName: "HM Land Registry — CCOD",
          sourceDate: "2026-11-01",
        },
      ],
      snapshots: {
        "7686": null,
      },
    };
    pin(
      "area.flag-on-own-title",
      await buildAreaBundle(
        home(FLAT_DIR, {
          paon: "Juno House",
          saon: "Flat 4",
          street: "CERES CRESCENT",
          label: "Flat 4, Juno House",
        }),
        own,
        { companyOwnershipEnabled: true },
      ),
    );

    const building = richestAreaSource();
    building.company = {
      ...building.company,
      titles: [
        {
          titleNumber: "SY876459",
          dataset: "ocod",
          tenure: "Freehold",
          propertyAddress: "Flats 1-9 Minerva House, 12 Ceres Crescent, Epsom KT17 1FH",
          proprietorName: "ADRIATIC LAND 11 LIMITED",
          companyNumber: null,
          proprietorshipCategory: null,
          countryIncorporated: "GUERNSEY",
          additionalProprietor: false,
          sourceName: "HM Land Registry — OCOD",
          sourceDate: "2026-11-01",
        },
      ],
    };
    pin(
      "area.flag-on-building",
      await buildAreaBundle(FLAT_HOME, building, { companyOwnershipEnabled: true }),
    );

    const none = richestAreaSource();
    pin(
      "area.flag-on-no-match",
      await buildAreaBundle(ENG_HOME, none, { companyOwnershipEnabled: true }),
    );
  });

  it("pins the tribunal-served shape (a filed decision at the postcode)", async () => {
    const source = richestAreaSource();
    source.tribunal = {
      ...source.tribunal,
      rows: [
        {
          caseRef: "HAV/00HQ/BSA/2025/0002",
          decisionDate: "2026-04-10",
          orderKind: "remediation-order",
          propertyText: "1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN",
          buildingKey: "oyster bay apartments",
          isSingleFlat: false,
          sourceUrl: "https://www.gov.uk/example",
          sourceName: "GOV.UK — Residential property tribunal decisions",
          sourceDate: "2026-11-10",
        },
      ],
    };
    pin("area.tribunal-served", await buildAreaBundle(ENG_HOME, source));
  });
});

// ------------------------------------------------------------------
// Short bundle
// ------------------------------------------------------------------

describe("contract — short bundle", () => {
  it("pins the short shapes at every rung", async () => {
    const nearbySource = new FakeNearbySource();
    const soldSource = new FakeSoldSource();
    soldSource.rows = [
      sale({ paon: "19", price: 588995, saleDate: "2023-06-15" }),
      ...[1, 2, 3, 4, 5, 6].map((n) =>
        sale({ paon: String(n), price: 300000 + n * 1000, saleDate: `202${n}-01-01` }),
      ),
    ];
    const crimeSource = new FakeCrimeSource();
    const floodSource = new FakeFloodSource();
    floodSource.layers.set(
      "flood_zone",
      floodLayer({ covering: [{ riskLabel: "Flood zone 3", detail: "river and sea · modelled" }] }),
    );
    floodSource.layers.set("rofrs", floodLayer({}));
    floodSource.layers.set("rofsw", floodLayer({}));
    const areaSource = richestAreaSource();
    const now = new Date("2026-11-15T00:00:00.000Z");

    const build = async (resolution: AddressResolution) =>
      buildShortBundle({
        nearby: await buildNearbyBundle(resolution, nearbySource),
        soldPrices: await buildSoldPricesBundle(resolution, soldSource),
        crime: await buildCrimeBundle(resolution, crimeSource, { now }),
        flood: await buildFloodBundle(resolution, floodSource),
        area: await buildAreaBundle(resolution, areaSource),
      });

    pin("short.rung1", await build(ENG_HOME));
    pin("short.rung2", await build(addressList(ENG_DIR)));
    pin("short.rung3", await build(WIDER));
    pin("short.rung4", await build(NO_LOCATION));
    pin("short.scotland", await build(SCO_HOME));
  });
});
