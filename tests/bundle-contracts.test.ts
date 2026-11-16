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
//
// RE-PIN RECORD: M6.22 (decision D42) deliberately widened the
// frozen flood, short and nearby shapes — the served flood
// section gained the liveWarnings key (null when the bundle is
// built without a warning source), the short bundle's flood
// section gained the same key, and the nearby distances shape
// gained the schoolDeadlines key. Two pins were added:
// flood.served-warnings (the composed block — two captured EA
// alerts at report depth, message in full) and
// short.flood-warnings (the same warnings at headline depth,
// no message field by construction). The pins that moved:
// flood.served-mixed, short.rung1, short.rung2 and the four
// nearby served pins; the not-covered and rung pins did not
// move — no live block serves there. Authorised by the
// founder's D42 ruling; recorded here and in the golden matrix
// so the change is never mistaken for drift.
//
// NO-RE-PIN RECORD: M6.24 (founder ruling at M6.23) added the
// maternity category to the nearby bundle — a content change,
// not a shape change. The category's answer is the established
// category shape (already among the pinned distinct shapes),
// the pins are category-name-agnostic, and the short bundle
// does not derive from the category at all. All 46 pins stand
// unmoved; recorded here so the absence of a re-pin is a
// checked fact, not an oversight.
//
// RE-PIN RECORD: M6.25 (founder ruling at M6.23) put the
// filed CQC ratings on the nearby bundle's health rows — the
// GP, A&E and maternity places gain cqcRating (the location's
// overall rating object as filed, or null where none files).
// One pin moved: nearby.served (the health places' variants
// gain both forms). Dentists and pharmacies serve exactly as
// before, and the short bundle's derivation never reads the
// field, so no other pin moved; all 46 pins stand.
//
// RE-PIN RECORD: M6.26 (decision D48) deliberately widened
// the frozen area shape — every served EPC certificate gains
// construction (the certificate's recorded construction
// descriptions as a per-certificate block, or null where the
// filed artefact predates the widening). Three pins moved
// (area.rung1-rich, area.flag-on-no-match, area.tribunal-
// served — the pins whose bundles serve a certificate); the
// short pins did not move — the headline projection never
// picks the block, proven by an identity test in the short
// suite. All 46 pins stand. Authorised by the founder's D48
// ruling; recorded here and in the golden matrix so the
// change is never mistaken for drift.
//
// RE-PIN RECORD: M6.27 (decisions D49 and D54) deliberately
// widened the frozen flood shape — the served flood answer
// gains defences (the recorded-defences sibling block: the
// EA's AIMS register served at report depth, capped, with
// its caveat, bridge and named states). Two pins moved
// (flood.served-mixed, flood.served-warnings — the two pins
// whose bundles serve a flood answer; in this fake world
// the defences table is unfiled, so both gain the block in
// its not-filed form). The short pins did not move — the
// headline projection picks named fields and never reads
// the block, proven by an identity test in the flood suite.
// All 46 pins stand. Authorised by the founder's D49/D54
// rulings; recorded here so the change is never mistaken
// for drift.
//
// RE-PIN RECORD: M6.28 (decisions D49 and D55) deliberately
// widened the frozen flood shape once more — the served
// flood answer gains climate (the climate outlook sibling
// block: the EA's two Climate Change 1 scenario likelihoods
// served at report depth, point state only, each source's
// scenario basis named in its own epochs). Two pins moved
// (flood.served-mixed, flood.served-warnings — the two pins
// whose bundles serve a flood answer; in this fake world
// the climate layers are unfiled, so both gain the block in
// its not-filed form). Two pins are new (flood.climate-mixed,
// flood.climate-inside — the block's filed state mix). The
// short pins did not move — the headline projection picks
// named fields and never reads the block, proven by an
// identity test in the short-bundle suite. All 48 pins
// stand. Authorised by the founder's D49/D55 rulings;
// recorded here so the change is never mistaken for drift.
//
// RE-PIN RECORD: M6.29 (decisions D50 and D57) deliberately
// widened the frozen area shape — the air section gains
// yardsticks (the yardstick block: each figure's position
// against the UK legal limit and the WHO 2021 guideline
// at report depth, with the block's basis line; the key
// is present always, its value null in the not-filed
// state). Eight pins moved (area.flag-on-building,
// area.flag-on-no-match, area.flag-on-own-title,
// area.rung1-empty, area.rung1-rich, area.rung1-scotland,
// area.rung2, area.tribunal-served); the rung-3/4 pins
// did not move — their air entries are state stubs with
// no section body — and the short pins did not move: the
// headline projection picks air as exactly {state,
// headlineFigure, line}, proven by an identity test in
// the short suite. All 48 pins stand. Authorised by the
// founder's D50/D57 rulings; recorded here and in the
// golden matrix so the change is never mistaken for
// drift.
//
// RE-PIN RECORD: M6.30 (decision D59) deliberately
// widened the frozen area shape — the air section gains
// aqma (the Air Quality Management Areas block: the
// declared-area fact for the postcode point at report
// depth, with its basis line and the dataset edition
// date; the key is present always, in both air arms).
// Eight pins moved (area.flag-on-building,
// area.flag-on-no-match, area.flag-on-own-title,
// area.rung1-empty, area.rung1-rich, area.rung1-scotland,
// area.rung2, area.tribunal-served — the same family
// M6.29 moved), each differing by exactly the added
// aqma key in its not-filed form (this fake's world
// files no AQMA layer); the rung-3/4 pins did not move
// and the short pins did not move: the headline
// projection picks air as exactly {state,
// headlineFigure, line}, proven by an identity test in
// the short suite. All 48 pins stand. Authorised by the
// founder's D59 ruling; recorded here so the change is
// never mistaken for drift. (Draft state at M6.30's
// D58 draft; re-verified at integration.)
//
// RE-PIN RECORD: M6.31 (decisions D50, D61 and D63)
// deliberately widened the frozen area shape — the area
// bundle gains chargingZones, a seventeenth top-level
// section (the charging-zone fact for the postcode
// point at report depth: inside a filed scheme, outside
// behind the completeness gate, or not-covered; present
// in every bundle). NINE pins moved — the same eight
// area pins M6.29 and M6.30 moved, each differing by
// exactly the added chargingZones key in its
// not-covered form (this fake's world files no charging
// zones), PLUS area.rung3, whose sections record gains
// the section's named-state stub ("charging zones need
// an exact postcode") — the rung-3 pin did not move at
// M6.29/M6.30 because those blocks live inside the air
// section, whose rung-3 stub carries no body; a
// top-level section's stub is the record itself. The
// rung-4 pin did not move (no sections record) and the
// short pins did not move: the headline projection
// never picks the section, proven by an identity test
// in the charging-zones suite. All 48 pins stand.
// Authorised by the founder's D50/D61/D63 rulings;
// recorded here so the change is never mistaken for
// drift. (Draft state at M6.31's D58 draft; re-verified
// at integration.)
//
// RE-PIN RECORD: M6.32 (decisions D50, D60 and D62)
// deliberately widened the frozen nearby shape — the
// rung 1/2 nearby bundle gains industrialSites, the
// Pollution Inventory block at the end of What's Nearby
// (present only while INDUSTRIAL_SITES_ENABLED is on;
// this fake's flag position is the shipped ON). Four
// pins moved (nearby.served, nearby.beyond-only,
// nearby.none-anywhere, nearby.not-filed), each
// differing by exactly the added industrialSites key —
// in its served form for served/beyond-only (this
// fake's world files one site near the home), its
// none-within form for none-anywhere, its not-filed
// form for not-filed. The rung-3/4 pins did NOT move —
// the block attaches at rungs 1 and 2 only, so a moving
// rung pin is the leak alarm — and no other brain's
// pins moved: the block is a sibling key the short
// bundle's derivation never reads, proven by an identity
// test in the industrial-sites suite. All 48 pins stand.
// Authorised by the founder's D50/D60/D62 rulings;
// recorded here so the change is never mistaken for
// drift. (Draft state at M6.32's D58 draft; re-verified
// at integration.)

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
  type IndustrialSitesFacts,
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
import {
  BURE_ITEM,
  LEADON_ITEM,
  WARNING_NOW,
  FakeFloodWarningSource,
} from "./flood-warning-fixtures";

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
    // The health categories' points carry the filed CQC
    // rating pair (M6.25): the nearest rated, the second
    // carrying the null absence — both place variants pin.
    const rated = category === "gp" || category === "ae" || category === "maternity";
    const base = [
      point("Nearest One", 0.1, {
        ...(category.startsWith("schools") ? { selective: false } : {}),
        ...(rated ? { cqcRating: { rating: "Good", date: "2026-01-15" } } : {}),
      }),
      point("Second One", 0.5, {
        detail: "a filed detail",
        ...(rated ? { cqcRating: null } : {}),
      }),
      point(null, 1.5),
    ];
    return base;
  }
  async nearestPoint(category: NearbyCategory) {
    if (this.mode === "none") return null;
    if (this.mode === "beyond") return point("Beyond One", 3.2);
    return point("Nearest One", 0.1, category.startsWith("schools") ? { selective: true } : {});
  }
  // The Pollution Inventory facts (M6.32): mode-shaped
  // like the categories — full/beyond serve one site with
  // a quantified release and a below-threshold name, none
  // files the register with nothing near, unfiled files
  // nothing.
  async industrialSiteFacts(): Promise<IndustrialSitesFacts> {
    if (this.mode === "unfiled")
      return { filedCount: 0, dataYear: null, sourceName: null, sourceDate: null, sites: [] };
    const filed = {
      filedCount: 2856,
      dataYear: 2024,
      sourceName: "Environment Agency Pollution Inventory",
      sourceDate: "2025-11-20",
    };
    if (this.mode === "none") return { ...filed, sites: [] };
    return {
      ...filed,
      sites: [
        {
          permitId: "YP3432XR",
          operator: "Stuart Davis Limited",
          siteAddress: "Fairwinds Farm Poultry Unit Crouchmans Farm Road Ulting Essex",
          sitePostcode: "CM9 6QS",
          activityDescription: "INTENSIVE FARMING; > 40,000 POULTRY",
          sector: "Agriculture",
          subSector: "Intensive Farming",
          latitude: ENG_DIR.latitude + 0.5 / 69,
          longitude: ENG_DIR.longitude,
          releases: [
            { substance: "Ammonia", quantityKg: 3128, thresholdKg: 1000, belowThreshold: false },
            {
              substance: "Nitrogen oxides (NO and NO2) as NO2",
              quantityKg: null,
              thresholdKg: 100000,
              belowThreshold: true,
            },
          ],
        },
      ],
    };
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
  // M6.27: the defences table is unfiled in this fake world,
  // so both served pins gain the block in its not-filed form.
  async defencesNear() {
    return { filedCount: 0, totalWithin: 0, sourceName: null, sourceDate: null, defences: [] };
  }
  // M6.28: the climate layers are unfiled in this fake
  // world by default, so both served pins gain the block in
  // its not-filed form; the dedicated climate pins below
  // set their own facts.
  climate = new Map<string, object>();
  async climateFacts(layer: string) {
    return (this.climate.get(layer) ?? {
      filedCount: 0,
      coveringLabel: null,
      sourceName: null,
      sourceDate: null,
    }) as never;
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
    // M6.22: the composed live-warnings form — the two EA
    // alerts captured live at the step's first contact,
    // replayed through the fake source.
    const warnings = new FakeFloodWarningSource();
    warnings.items = [LEADON_ITEM, BURE_ITEM];
    pin(
      "flood.served-warnings",
      await buildFloodBundle(ENG_HOME, source, { warningSource: warnings, now: WARNING_NOW }),
    );
    pin("flood.not-covered", await buildFloodBundle(SCO_HOME, source));
    pin("flood.rung3", await buildFloodBundle(WIDER, source));
    pin("flood.rung4", await buildFloodBundle(NO_LOCATION, source));
    // M6.28: the climate block's own state mix — rivers &
    // sea inside its Low band while surface water is filed
    // with no band published at the point.
    const climateMixed = new FakeFloodSource();
    climateMixed.climate.set("rofrs_cc", {
      filedCount: 252932,
      coveringLabel: "Low",
      sourceName: "Environment Agency",
      sourceDate: "2026-11-03",
    });
    climateMixed.climate.set("rofsw_cc", {
      filedCount: 406734,
      coveringLabel: null,
      sourceName: "Environment Agency",
      sourceDate: "2026-11-10",
    });
    pin("flood.climate-mixed", await buildFloodBundle(ENG_HOME, climateMixed));
    // M6.28: both scenario sources inside their bands.
    const climateInside = new FakeFloodSource();
    climateInside.climate.set("rofrs_cc", {
      filedCount: 252932,
      coveringLabel: "Low",
      sourceName: "Environment Agency",
      sourceDate: "2026-11-03",
    });
    climateInside.climate.set("rofsw_cc", {
      filedCount: 406734,
      coveringLabel: "Low",
      sourceName: "Environment Agency",
      sourceDate: "2026-11-10",
    });
    pin("flood.climate-inside", await buildFloodBundle(ENG_HOME, climateInside));
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
        construction: {
          walls: ["Average thermal transmittance 0.27 W/m²K"],
          roofs: ["Average thermal transmittance 0.11 W/m²K"],
          floors: ["Average thermal transmittance 0.15 W/m²K"],
          windows: "High performance glazing",
          lighting: "Low energy lighting in all fixed outlets",
          mainHeating: ["Boiler and radiators, mains gas"],
          hotWater: "From main system, waste water heat recovery",
        },
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
  async aqmaFacts() {
    // This fake's world files no AQMA layer, in either
    // mode — every area pin gains the block in its
    // not-filed form (the M6.28 climate pattern).
    return {
      filedCount: 0,
      covering: [],
      nearestWithin: null,
      sourceName: null,
      sourceDate: null,
    };
  }
  async chargingZonesFacts() {
    // This fake's world files no charging zones either —
    // every area pin gains the section in its
    // not-covered form (the M6.31 pattern).
    return { filedCount: 0, filedKeys: [], oldestLoadedDate: null, covering: null };
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

    // M6.22: the composed headline form — the same two
    // captured alerts, headline depth (no message field).
    const warnings = new FakeFloodWarningSource();
    warnings.items = [LEADON_ITEM, BURE_ITEM];
    pin(
      "short.flood-warnings",
      buildShortBundle({
        nearby: await buildNearbyBundle(ENG_HOME, nearbySource),
        soldPrices: await buildSoldPricesBundle(ENG_HOME, soldSource),
        crime: await buildCrimeBundle(ENG_HOME, crimeSource, { now }),
        flood: await buildFloodBundle(ENG_HOME, floodSource, {
          warningSource: warnings,
          now: WARNING_NOW,
        }),
        area: await buildAreaBundle(ENG_HOME, areaSource),
      }),
    );
  });
});
