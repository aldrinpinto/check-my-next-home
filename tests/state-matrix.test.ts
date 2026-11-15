// The state matrix (plan step M6.9, decision D30).
//
// The M6.9 prep's census — every "empty" answer the check
// can give, across all six brains — as a test: 71 state
// slots, each served here through its brain's real builder
// against a fake source and asserted, wording included.
// The census (prep Part 1):
//
//   address ladder ......... 4   (one per rung)
//   nearby ................. 5   (within / none-within /
//                                 empty-map / empty /
//                                 not-filed — D30's guard)
//   sold prices ............ 7   (served / own none /
//                                 too-few / none-recorded /
//                                 loaded-none / not-covered /
//                                 unavailable)
//   crime .................. 4   (served / not-filed /
//                                 not-covered / unavailable)
//   flood .................. 8   (3 bundle states + 5
//                                 per-layer point states)
//   area bundle ............ 43  (constraints 9, heritage 7,
//                                 nature 7, EPC 5, council
//                                 tax 3, Census 3, IMD 3,
//                                 air 2, noise 5, benefits 6,
//                                 solar 2, rung 3's eleven
//                                 per-section reasons — the
//                                 arithmetic is in the prep)
//
// What D30 changed, and where it is pinned below:
//   Q1 crime cold load — a covered postcode with no filed
//      artefact is loaded on first check; not-filed means
//      load-attempted-and-failed, in EPC's "could not be
//      loaded" form; the loader is invoked with the
//      postcode after "--" (the argument-filter trap).
//   Q2 flood per-layer not-filed — unchanged in meaning.
//   Q4 council tax — the state is not-filed, not
//      not-published: the gap is our filing backlog, and
//      the line says so. (Article 4's not-published and
//      DWP's not-published-for-this-area do NOT change.)
//   Q5 supermarkets take the map wording — the same OSM
//      table as the What's Nearby groups, the same honesty.
//   Q6 the short bundle's EPC, council tax, air and noise
//      sections carry their sections' own state lines
//      verbatim from the full bundle.
//   M6.12 (decision D31) adds one more family, asserted
//      in its own block below: planning applications'
//      handed-off — the data exists and is public, and is
//      deliberately not held, so the answer is a pointer.
//      One state across four nation forms (plus the
//      Mid Ulster exception and the unnamed-council
//      form), and rung 3's twelfth per-section reason.
//   M6.13 (decision D32) adds the company-ownership
//      family, asserted in its own block below: five
//      states (served / not-company-owned /
//      needs-exact-home / not-covered / not-filed) that
//      exist ONLY behind the section's flag — with the
//      shipped flag off the section is absent from every
//      shape, which the same block asserts — plus rung
//      3's thirteenth per-section reason in the flag-on
//      position.
//   Settled fixes — nature designations and nearby
//      categories gain filed-count guards in the flood
//      form; the sold-prices median's none-recorded line
//      speaks of the counted set when other sales are
//      recorded; one polygon absence template; one
//      two-part not-filed sentence form; not-covered lines
//      name the nation's own publisher where one exists,
//      and Census's names the nation; Article 4's
//      not-published line names the council's planning
//      register as where the answer lives; the essential-
//      category silence (measured zero, no named nearest)
//      serves the category's empty line, never nothing.

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { AddressResolution, DirectoryPostcode, ResolvedAddress } from "../lib/address";
import {
  buildAreaBundle,
  type AreaDataSource,
  type BenefitsFacts,
  type CompanyOwnershipFacts,
  type CompanyTitleRow,
  type CouncilTaxFacts,
  type DesignationFacts,
  type EpcArtefact,
  type EpcCertificate,
  type ListedFacts,
  type PhiFacts,
  type PlanningLayerFacts,
  type SolarFacts,
} from "../lib/area-bundle";
import {
  buildCrimeBundle,
  createCrimeSource,
  type CrimeDataSource,
  type FiledCrimeAnswer,
} from "../lib/crime";
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

// ------------------------------------------------------------------
// Resolutions
// ------------------------------------------------------------------

function directory(partial: Partial<DirectoryPostcode>): DirectoryPostcode {
  return {
    postcode: "CM3 2JT",
    latitude: 51.7786,
    longitude: 0.5798,
    council: "Braintree",
    ward: null,
    region: null,
    lsoaCode: "E01021395",
    msoaCode: "E02004463",
    ...partial,
  };
}

const ENG_DIR = directory({});
const WAL_DIR = directory({
  postcode: "CF11 8AA",
  latitude: 51.478,
  longitude: -3.182,
  council: "Cardiff",
  lsoaCode: "W01001759",
  msoaCode: "W02000400",
});
const SCO_DIR = directory({
  postcode: "EH1 1AA",
  latitude: 55.9533,
  longitude: -3.1883,
  council: "City of Edinburgh",
  lsoaCode: "S01014710",
  msoaCode: null,
});
const NI_DIR = directory({
  postcode: "BT1 1AA",
  latitude: 54.5973,
  longitude: -5.9301,
  council: "Belfast",
  lsoaCode: "N21000192",
  msoaCode: null,
});
// Mid Ulster — the one NI council not on the national
// register (M6.12). The directory row is a fixture in the
// filed form: ONSPD files the bare name "Mid Ulster".
const MID_ULSTER_DIR = directory({
  postcode: "BT45 6EB",
  latitude: 54.6419,
  longitude: -6.6069,
  council: "Mid Ulster",
  lsoaCode: "N21001000",
  msoaCode: null,
});
const UNKNOWN_DIR = directory({ postcode: "ZZ1 1ZZ", lsoaCode: null, msoaCode: null });

function home(dir: DirectoryPostcode, address: Partial<ResolvedAddress> = {}): AddressResolution {
  return {
    rung: 1,
    kind: "home",
    directory: dir,
    address: {
      postcode: dir.postcode,
      paon: "19",
      saon: null,
      street: "BIRKDALE RISE",
      locality: null,
      town: "HATFIELD PEVEREL",
      label: "19 Birkdale Rise",
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

const ENG_HOME = home(ENG_DIR);
const WAL_HOME = home(WAL_DIR, {
  paon: "1",
  street: "WESTGATE STREET",
  label: "1 Westgate Street",
});
const SCO_HOME = home(SCO_DIR, { paon: "1", street: "PRINCES STREET", label: "1 Princes Street" });
const NI_HOME = home(NI_DIR, { paon: "1", street: "ROYAL AVENUE", label: "1 Royal Avenue" });
const MID_ULSTER_HOME = home(MID_ULSTER_DIR, {
  paon: "1",
  street: "BROAD STREET",
  label: "1 Broad Street",
});

// The banned-wording union (the prep's Part 5 scan): no
// served object in this file may carry a verdict word.
const BANNED = [
  "score",
  "rating",
  "rated",
  "safe",
  "unsafe",
  "dangerous",
  "high-crime",
  "low-crime",
  "crime rate",
  "valuation",
  "worth",
  "estimate",
  "bargain",
  "overpriced",
  "underpriced",
  "good price",
  "no flood risk",
  "flood-proof",
  "quiet",
  "peaceful",
  "noisy",
  "clean air",
  "polluted",
  "deprived",
  "affluent",
  "desirable",
  "protected",
  "no crime",
];

function expectClean(bundle: unknown) {
  // String VALUES only — field names are data shapes, not
  // wording (the EPC certificate's filed `rating` field is
  // the standing example). Two ruled NEGATIONS are removed
  // before the scan: the D13 explainer "It is not a
  // valuation of this home" and the not-filed reason's "no
  // crime answer can be given" contain the banned strings
  // as grammar, not as claims — the per-brain scans remain
  // the authority on their own surfaces.
  const values: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") values.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(bundle);
  const text = values
    .join("\n")
    .toLowerCase()
    .replaceAll("it is not a valuation of this home", "")
    .replaceAll("no crime answer can be given", "");
  for (const word of BANNED) expect(text, `banned word: ${word}`).not.toContain(word);
}

// ------------------------------------------------------------------
// The ladder itself (4 slots)
// ------------------------------------------------------------------

describe("matrix — the address ladder's own states", () => {
  it("rung 3 is a wider area: every brain serves its named unavailable state, and the area bundle carries all twelve per-section reasons", async () => {
    const rung3: AddressResolution = {
      rung: 3,
      kind: "wider-area",
      outward: "CM3",
      label: "Wider area — CM3, not this exact home",
      postcodeCount: 541,
    };
    const nearby = await buildNearbyBundle(rung3, new MatrixNearbySource());
    expect(nearby).toEqual({
      rung: 3,
      kind: "wider-area",
      distances: { state: "unavailable", reason: "distances need an exact postcode" },
    });
    const area = await buildAreaBundle(rung3, new MatrixAreaSource());
    if (area.kind !== "wider-area") throw new Error("expected wider-area");
    expect(area.area.reason).toBe("area answers need an exact postcode");
    expect(Object.keys(area.area.sections)).toHaveLength(12);
  });

  it("rung 4 is no location: the shared unavailable reason, no sections record", async () => {
    const rung4: AddressResolution = { rung: 4, kind: "no-location" };
    const area = await buildAreaBundle(rung4, new MatrixAreaSource());
    expect(area).toEqual({
      rung: 4,
      kind: "no-location",
      area: { state: "unavailable", reason: "area answers need an exact postcode" },
    });
  });
});

// ------------------------------------------------------------------
// Nearby (5 slots)
// ------------------------------------------------------------------

class MatrixNearbySource implements NearbyDataSource {
  points = new Map<NearbyCategory, NearbyPoint[]>();
  nearest = new Map<NearbyCategory, NearbyPoint | null>();
  filed = new Map<NearbyCategory, number>();

  async pointsWithin(category: NearbyCategory) {
    return this.points.get(category) ?? [];
  }
  async nearestPoint(category: NearbyCategory) {
    return this.nearest.get(category) ?? null;
  }
  async filedCount(category: NearbyCategory) {
    return this.filed.get(category) ?? 0;
  }
}

const ALL_CATEGORIES: NearbyCategory[] = [
  "schools-primary",
  "schools-secondary",
  "nurseries",
  "gp",
  "dentist",
  "pharmacy",
  "ae",
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

function filedEverywhere(source: MatrixNearbySource) {
  for (const c of ALL_CATEGORIES) source.filed.set(c, 1000);
}

// A point roughly `miles` due north of the directory point.
function northOf(dir: DirectoryPostcode, name: string, miles: number): NearbyPoint {
  return {
    name,
    latitude: dir.latitude + miles / 69.0,
    longitude: dir.longitude,
    detail: null,
  };
}

async function categoryOf(source: MatrixNearbySource, category: NearbyCategory) {
  const bundle = await buildNearbyBundle(ENG_HOME, source);
  if (bundle.kind !== "distances") throw new Error("expected distances");
  const answer = bundle.categories.find((c) => c.category === category);
  if (!answer) throw new Error(`no ${category} answer`);
  return { bundle, answer };
}

describe("matrix — nearby", () => {
  it("within: named places inside the radius", async () => {
    const source = new MatrixNearbySource();
    filedEverywhere(source);
    source.points.set("schools-primary", [northOf(ENG_DIR, "A School", 0.5)]);
    const { answer } = await categoryOf(source, "schools-primary");
    expect(answer.state).toBe("within");
    expect(answer.places[0]?.name).toBe("A School");
    expect(answer.countWithin).toBe(1);
    expect(answer.line).toBeNull();
  });

  it("none-within: an essential service names its single nearest beyond the radius", async () => {
    const source = new MatrixNearbySource();
    filedEverywhere(source);
    source.nearest.set("gp", northOf(ENG_DIR, "Far Surgery", 3.208));
    const { answer } = await categoryOf(source, "gp");
    expect(answer.state).toBe("none-within");
    expect(answer.beyondNearest?.name).toBe("Far Surgery");
    expect(answer.line).toContain("none within 2 miles — nearest is Far Surgery");
  });

  it("empty-map: a What's Nearby group with nothing filed within the radius is a fact about the map", async () => {
    const source = new MatrixNearbySource();
    filedEverywhere(source);
    const { answer } = await categoryOf(source, "food-and-drink");
    expect(answer.state).toBe("empty-map");
    expect(answer.line).toBe(
      "no food and drink places recorded within 2 miles on the map data we hold — a gap in the map is not proof that none exists",
    );
  });

  it("empty: a non-essential register category states the register's own fact (nurseries)", async () => {
    const source = new MatrixNearbySource();
    filedEverywhere(source);
    const { answer } = await categoryOf(source, "nurseries");
    expect(answer.state).toBe("empty");
    expect(answer.line).toBe(
      "no nursery within 2 miles of the postcode point in the childcare register we hold",
    );
  });

  it("not-filed (D30 guard): a category whose table is empty serves the not-filed family, never an absence or silence", async () => {
    const source = new MatrixNearbySource();
    filedEverywhere(source);
    source.filed.set("gp", 0);
    source.filed.set("parks", 0);
    const gp = await categoryOf(source, "gp");
    expect(gp.answer.state).toBe("not-filed");
    expect(gp.answer.line).toBe(
      "the GP surgeries data is not filed yet, so no GP surgeries answer can be given yet",
    );
    expect(gp.answer.places).toEqual([]);
    const parks = await categoryOf(source, "parks");
    expect(parks.answer.state).toBe("not-filed");
    expect(parks.answer.line).toBe(
      "the parks and greenspace data is not filed yet, so no parks and greenspace answer can be given yet",
    );
    expectClean(gp.bundle);
  });

  it("supermarkets take the MAP wording (D30/Q5): the same OSM table, the same honesty", async () => {
    const source = new MatrixNearbySource();
    filedEverywhere(source);
    const { answer } = await categoryOf(source, "supermarket");
    expect(answer.state).toBe("none-within");
    expect(answer.line).toBe(
      "no supermarkets recorded within 2 miles on the map data we hold — a gap in the map is not proof that none exists",
    );
    expectClean(answer);
  });

  it("the essential silence is completed: measured zero with no named nearest serves the empty line, never nothing", async () => {
    const source = new MatrixNearbySource();
    filedEverywhere(source);
    // GP: filed, nothing within, and the nearest point is
    // unnamed — it can never be listed, so the answer must
    // still speak.
    source.nearest.set("gp", { name: null, latitude: 52.5, longitude: 0.9, detail: null });
    const { answer } = await categoryOf(source, "gp");
    expect(answer.state).toBe("none-within");
    expect(answer.beyondNearest).toBeNull();
    expect(answer.line).toBe("no GP surgeries within 2 miles of the postcode point");
  });
});

// ------------------------------------------------------------------
// Sold prices (7 slots)
// ------------------------------------------------------------------

function sale(partial: Partial<SoldPriceRow>): SoldPriceRow {
  return {
    transactionId: null,
    price: 300000,
    saleDate: "2020-01-01",
    postcode: "CM3 2JT",
    propertyType: "D",
    newBuild: false,
    tenure: "F",
    paon: "19",
    saon: null,
    street: "BIRKDALE RISE",
    locality: null,
    town: "HATFIELD PEVEREL",
    category: "A",
    sourceName: "HM Land Registry Price Paid",
    sourceDate: "2026-07-01",
    ...partial,
  };
}

class MatrixSoldPricesSource implements SoldPricesDataSource {
  rows = new Map<string, SoldPriceRow[]>();
  editions = new Map<string, string | null>();
  load: ((postcode: string) => void) | null = null;
  loadCalls: string[] = [];

  async salesInPostcode(postcode: string) {
    return this.rows.get(postcode) ?? [];
  }
  async loadEdition(postcode: string) {
    return this.editions.get(postcode) ?? null;
  }
  async loadPostcode(postcode: string) {
    this.loadCalls.push(postcode);
    if (this.load) {
      this.load(postcode);
      return;
    }
    throw new Error("the load failed");
  }
}

describe("matrix — sold prices", () => {
  it("served: own history plus the postcode median over the counted set", async () => {
    const source = new MatrixSoldPricesSource();
    source.rows.set("CM3 2JT", [
      sale({ price: 100000, saleDate: "2001-01-05", paon: "29" }),
      sale({ price: 200000, saleDate: "2005-02-05", paon: "21" }),
      sale({ price: 300000, saleDate: "2010-03-05", paon: "23" }),
      sale({ price: 400000, saleDate: "2015-04-05", paon: "25" }),
      sale({ price: 588995, saleDate: "2023-06-15" }),
    ]);
    const bundle = await buildSoldPricesBundle(ENG_HOME, source);
    if (bundle.kind !== "sold-prices" || bundle.rung !== 1) throw new Error("expected rung 1");
    expect(bundle.loadState).toBe("found");
    expect(bundle.ownHistory).toHaveLength(1);
    expect(bundle.ownHistory[0]?.price).toBe(588995);
    expect(bundle.ownLine).toBeNull();
    expect(bundle.median.state).toBe("served");
    expect(bundle.median.value).toBe(300000);
    expect(bundle.median.line).toBe("counted over 5 recorded sales, 2001-01-05 to 2023-06-15");
    expectClean(bundle);
  });

  it("own none-recorded: the home has no sale; the postcode figures still serve", async () => {
    const source = new MatrixSoldPricesSource();
    source.rows.set("CM3 2JT", [
      sale({ price: 100000, saleDate: "2001-01-05", paon: "21" }),
      sale({ price: 200000, saleDate: "2005-02-05", paon: "23" }),
      sale({ price: 300000, saleDate: "2010-03-05", paon: "25" }),
      sale({ price: 400000, saleDate: "2015-04-05", paon: "27" }),
      sale({ price: 500000, saleDate: "2020-05-05", paon: "29" }),
    ]);
    const bundle = await buildSoldPricesBundle(ENG_HOME, source);
    if (bundle.kind !== "sold-prices" || bundle.rung !== 1) throw new Error("expected rung 1");
    expect(bundle.ownHistory).toEqual([]);
    expect(bundle.ownLine).toBe("No sale recorded for this home since 1995");
  });

  it("too-few: below the floor of 5 the sales list, no median", async () => {
    const source = new MatrixSoldPricesSource();
    source.rows.set("CM3 2JT", [
      sale({ price: 100000, saleDate: "2001-01-05" }),
      sale({ price: 200000, saleDate: "2005-02-05", paon: "21" }),
      sale({ price: 300000, saleDate: "2010-03-05", paon: "23" }),
    ]);
    const bundle = await buildSoldPricesBundle(ENG_HOME, source);
    if (bundle.kind !== "sold-prices") throw new Error("expected sold-prices");
    expect(bundle.median.state).toBe("too-few");
    expect(bundle.median.value).toBeNull();
    expect(bundle.median.line).toBe(
      "only 3 recorded sales in this postcode — too few for a median",
    );
  });

  it("none-recorded with category-B-only rows: the median speaks of the counted set (Part 3, item 4)", async () => {
    const source = new MatrixSoldPricesSource();
    source.rows.set("CM3 2JT", [
      sale({ price: 1, saleDate: "2022-12-29", category: "B" }),
      sale({ price: 1, saleDate: "2022-12-29", paon: "32", category: "B" }),
    ]);
    const bundle = await buildSoldPricesBundle(ENG_HOME, source);
    if (bundle.kind !== "sold-prices") throw new Error("expected sold-prices");
    expect(bundle.recordedCount).toBe(2);
    expect(bundle.median.state).toBe("none-recorded");
    expect(bundle.median.counted).toBe(0);
    expect(bundle.median.line).toBe("no recorded sales in this postcode count toward a median");
    // The home's own category-B sale still serves in its
    // history, unlabelled (D23) — only the median's line
    // changed.
    if (bundle.rung === 1) expect(bundle.ownHistory).toHaveLength(1);
    expectClean(bundle);
  });

  it("the building median makes the same distinction for a flat's building", async () => {
    const flat = home(ENG_DIR, {
      paon: "MINERVA HOUSE, 12",
      saon: "FLAT 4",
      street: "CERES CRESCENT",
      label: "Flat 4, Minerva House, 12 Ceres Crescent",
    });
    const source = new MatrixSoldPricesSource();
    source.rows.set("CM3 2JT", [
      sale({ price: 420000, paon: "MINERVA HOUSE, 12", saon: "FLAT 4", street: "CERES CRESCENT" }),
      sale({
        price: 1,
        paon: "MINERVA HOUSE, 12",
        saon: "FLAT 5",
        street: "CERES CRESCENT",
        category: "B",
      }),
    ]);
    const bundle = await buildSoldPricesBundle(flat, source);
    if (bundle.kind !== "sold-prices" || bundle.rung !== 1) throw new Error("expected rung 1");
    expect(bundle.building?.building).toBe("Minerva House");
    expect(bundle.building?.median.state).toBe("too-few");
    // A building whose ONLY sales are category B: the
    // counted-set line, not the since-1995 sentence.
    const source2 = new MatrixSoldPricesSource();
    source2.rows.set("CM3 2JT", [
      sale({
        price: 1,
        paon: "MINERVA HOUSE, 12",
        saon: "FLAT 5",
        street: "CERES CRESCENT",
        category: "B",
      }),
    ]);
    const bundle2 = await buildSoldPricesBundle(flat, source2);
    if (bundle2.kind !== "sold-prices" || bundle2.rung !== 1) throw new Error("expected rung 1");
    expect(bundle2.building?.median.state).toBe("none-recorded");
    expect(bundle2.building?.median.line).toBe(
      "no recorded sales in this building count toward a median",
    );
  });

  it("loaded-none: a proven load that filed nothing — the since-1995 sentence is honest here", async () => {
    const source = new MatrixSoldPricesSource();
    source.editions.set("CM3 2JT", "2026-07-01");
    const bundle = await buildSoldPricesBundle(ENG_HOME, source);
    if (bundle.kind !== "sold-prices") throw new Error("expected sold-prices");
    expect(bundle.loadState).toBe("loaded-none");
    expect(bundle.recordedCount).toBe(0);
    expect(bundle.stateLine).toBe("No sale recorded for this postcode since 1995");
    expect(bundle.median.state).toBe("none-recorded");
    expect(bundle.median.line).toBe("No sale recorded for this postcode since 1995");
    expect(source.loadCalls).toEqual([]);
  });

  it("a never-loaded postcode is loaded first (the D23 pattern this brain set)", async () => {
    const source = new MatrixSoldPricesSource();
    source.load = (postcode) => {
      source.rows.set(postcode, [sale({})]);
      source.editions.set(postcode, "2026-07-01");
    };
    const bundle = await buildSoldPricesBundle(ENG_HOME, source);
    expect(source.loadCalls).toEqual(["CM3 2JT"]);
    if (bundle.kind !== "sold-prices") throw new Error("expected sold-prices");
    expect(bundle.loadState).toBe("found");
  });

  it("not-covered: Scotland names its own register (Registers of Scotland); Northern Ireland keeps the boundary form", async () => {
    const source = new MatrixSoldPricesSource();
    const scotland = await buildSoldPricesBundle(SCO_HOME, source);
    if (scotland.kind !== "not-covered") throw new Error("expected not-covered");
    expect(scotland.soldPrices.reason).toBe(
      "sold prices are not covered for Scotland — HM Land Registry publishes Price Paid for England and Wales only; property sales in Scotland are recorded by Registers of Scotland",
    );
    const ni = await buildSoldPricesBundle(NI_HOME, source);
    if (ni.kind !== "not-covered") throw new Error("expected not-covered");
    expect(ni.soldPrices.reason).toBe(
      "sold prices are not covered for Northern Ireland — HM Land Registry publishes Price Paid for England and Wales only",
    );
    expectClean(scotland);
  });

  it("rung 2 carries no own-history payload by construction; rungs 3 and 4 share the unavailable reason", async () => {
    const source = new MatrixSoldPricesSource();
    source.rows.set("CM3 2JT", [sale({})]);
    const rung2 = await buildSoldPricesBundle(addressList(ENG_DIR), source);
    expect("ownHistory" in rung2).toBe(false);
    const rung3 = await buildSoldPricesBundle(
      { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area — CM3", postcodeCount: 1 },
      source,
    );
    expect(rung3).toEqual({
      rung: 3,
      kind: "wider-area",
      soldPrices: { state: "unavailable", reason: "sold prices need an exact postcode" },
    });
  });
});

// ------------------------------------------------------------------
// Crime (4 slots)
// ------------------------------------------------------------------

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

function crimeArtefact(total: number): FiledCrimeAnswer {
  return {
    total,
    windowFrom: "2025-10",
    windowTo: "2026-09",
    months: CRIME_MONTHS.map((month) => ({ month, count: 0 })),
    categories: total > 0 ? { "violent-crime": 2, "anti-social-behaviour": 1 } : {},
    basis: "Police.uk street-level crimes within 1 mile of the postcode point",
    sourceName: "Police.uk street-level crime",
    sourceDate: "2026-09",
    loadedAt: "2026-11-14T00:00:00.000Z",
  };
}

class MatrixCrimeSource implements CrimeDataSource {
  artefacts = new Map<string, FiledCrimeAnswer>();
  loadCalls: string[] = [];
  load: ((postcode: string) => void) | null = null;

  async crimeAnswer(postcode: string) {
    return this.artefacts.get(postcode) ?? null;
  }
  async loadPostcode(postcode: string) {
    this.loadCalls.push(postcode);
    if (this.load) {
      this.load(postcode);
      return;
    }
    throw new Error("the Police.uk load failed");
  }
}

// Inside the stale guard's tolerance of the filed window.
const CRIME_NOW = new Date("2026-11-15T00:00:00.000Z");

describe("matrix — crime", () => {
  it("served: the total, the full breakdown, ASB inside the total and as its own line", async () => {
    const source = new MatrixCrimeSource();
    source.artefacts.set("CM3 2JT", crimeArtefact(330));
    const bundle = await buildCrimeBundle(ENG_HOME, source, { now: CRIME_NOW });
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected served crime");
    expect(bundle.crime.total).toBe(330);
    expect(bundle.crime.totalLine).toBe(
      "330 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
    );
    expect(bundle.crime.categories).toEqual([
      { slug: "violent-crime", count: 2 },
      { slug: "anti-social-behaviour", count: 1 },
    ]);
    expect(bundle.crime.staleLine).toBeNull();
    expect(source.loadCalls).toEqual([]);
    expectClean(bundle);
  });

  it("a zero total stays a count — never 'no crime', never radius-widened", async () => {
    const source = new MatrixCrimeSource();
    source.artefacts.set("CM3 2JT", crimeArtefact(0));
    const bundle = await buildCrimeBundle(ENG_HOME, source, { now: CRIME_NOW });
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected served crime");
    expect(bundle.crime.total).toBe(0);
    expect(bundle.crime.totalLine).toBe(
      "0 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
    );
    expect(bundle.crime.categories).toEqual([]);
    expectClean(bundle);
  });

  it("stale: an old window serves last-good WITH the stale line; counts are never suppressed", async () => {
    const source = new MatrixCrimeSource();
    source.artefacts.set("CM3 2JT", crimeArtefact(330));
    const bundle = await buildCrimeBundle(ENG_HOME, source, {
      now: new Date("2027-01-15T00:00:00.000Z"),
    });
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected served crime");
    expect(bundle.crime.total).toBe(330);
    expect(bundle.crime.staleLine).toBe(
      "the latest month we hold is September 2026 — Police.uk has not published newer data we can file",
    );
  });

  it("cold load (D30/Q1): a covered postcode with no artefact is loaded on first check and then serves", async () => {
    const source = new MatrixCrimeSource();
    source.load = (postcode) => {
      source.artefacts.set(postcode, crimeArtefact(7));
    };
    const bundle = await buildCrimeBundle(ENG_HOME, source, { now: CRIME_NOW });
    expect(source.loadCalls).toEqual(["CM3 2JT"]);
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected served crime after the cold load");
    expect(bundle.crime.total).toBe(7);
  });

  it("not-filed means load-attempted-and-failed, in EPC's 'could not be loaded' form", async () => {
    const source = new MatrixCrimeSource();
    const bundle = await buildCrimeBundle(ENG_HOME, source, { now: CRIME_NOW });
    expect(source.loadCalls).toEqual(["CM3 2JT"]);
    if (bundle.kind !== "crime") throw new Error("expected a crime bundle");
    expect(bundle.crime).toEqual({
      state: "not-filed",
      reason: "crime counts could not be loaded for this postcode, so no crime answer can be given",
    });
    expect(JSON.stringify(bundle)).not.toContain("total");
    expectClean(bundle);
  });

  it("not-covered: the nation's own publisher is named where one exists (Part 7)", async () => {
    const source = new MatrixCrimeSource();
    const scotland = await buildCrimeBundle(SCO_HOME, source, { now: CRIME_NOW });
    if (scotland.kind !== "not-covered") throw new Error("expected not-covered");
    expect(scotland.crime.reason).toBe(
      "crime counts are not covered for Scotland — Police.uk publishes street-level data for England and Wales forces only; recorded crime in Scotland is published by Police Scotland",
    );
    const ni = await buildCrimeBundle(NI_HOME, source, { now: CRIME_NOW });
    if (ni.kind !== "not-covered") throw new Error("expected not-covered");
    expect(ni.crime.reason).toBe(
      "crime counts are not covered for Northern Ireland — Police.uk publishes street-level data for England and Wales forces only; recorded crime in Northern Ireland is published by the Police Service of Northern Ireland",
    );
    // Coverage is decided before any load is attempted.
    expect(source.loadCalls).toEqual([]);
    expectClean(scotland);
  });

  it("rungs 3 and 4: the shared unavailable reason", async () => {
    const source = new MatrixCrimeSource();
    const rung3 = await buildCrimeBundle(
      { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area — CM3", postcodeCount: 1 },
      source,
      { now: CRIME_NOW },
    );
    expect(rung3).toEqual({
      rung: 3,
      kind: "wider-area",
      crime: { state: "unavailable", reason: "crime counts need an exact postcode" },
    });
    const rung4 = await buildCrimeBundle({ rung: 4, kind: "no-location" }, source, {
      now: CRIME_NOW,
    });
    expect(rung4).toEqual({
      rung: 4,
      kind: "no-location",
      crime: { state: "unavailable", reason: "crime counts need an exact postcode" },
    });
  });

  it("the database source invokes the loader with the postcode after '--' (the argument-filter trap, pinned)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cmnh-crime-loader-"));
    const argvFile = path.join(dir, "argv.json");
    const stub = path.join(dir, "stub-crime-loader.mjs");
    writeFileSync(
      stub,
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)));\n`,
    );
    const db = {
      async query() {
        return { rows: [] as Record<string, unknown>[] };
      },
    };
    const source = createCrimeSource(db, {
      databaseUrl: "postgres://unused",
      crimeLoaderPath: stub,
    });
    await source.loadPostcode("CM3 2JT");
    expect(JSON.parse(readFileSync(argvFile, "utf8"))).toEqual(["--", "CM3 2JT"]);
  });

  it("the hunt's zero witnesses (D30/Q3): genuine filed zeros serve as counts — the M6.4 gap is closed", async () => {
    // Filed live from Police.uk on 15 November 2026 through
    // the loader path, during the M6.9 hunt over six remote
    // covered postcodes (the set and every total are
    // recorded in tests/golden-matrix.md). The artefacts
    // are the loader's own filed answers, verbatim.
    for (const [postcode, file, lsoaCode] of [
      ["CA20 1EX", "zero-witness-ca20-1ex.json", "E01019279"],
      ["LD5 4AD", "zero-witness-ld5-4ad.json", "W01000471"],
    ] as const) {
      const artefact = JSON.parse(
        readFileSync(path.join(process.cwd(), "tests/fixtures/police-uk", file), "utf8"),
      ) as FiledCrimeAnswer;
      expect(artefact.total).toBe(0);
      const source = new MatrixCrimeSource();
      source.artefacts.set(postcode, artefact);
      const resolution = home(directory({ postcode, lsoaCode, msoaCode: null }));
      const bundle = await buildCrimeBundle(resolution, source, { now: CRIME_NOW });
      if (bundle.kind !== "crime" || bundle.crime.state !== "served")
        throw new Error(`expected served crime for ${postcode}`);
      expect(bundle.crime.total).toBe(0);
      expect(bundle.crime.totalLine).toBe(
        "0 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
      );
      expect(bundle.crime.categories).toEqual([]);
      expect(source.loadCalls).toEqual([]);
      expectClean(bundle);
    }
  });
});

// ------------------------------------------------------------------
// Flood (3 bundle states + 5 per-layer point states)
// ------------------------------------------------------------------

const ZONES_SOURCE = "Environment Agency — Flood Map for Planning (Flood Zones 2 and 3)";
const ROFRS_SOURCE = "Environment Agency — Risk of Flooding from Rivers and Sea";
const ROFSW_SOURCE = "Environment Agency — Risk of Flooding from Surface Water";

function floodLayer(partial: Partial<FloodLayerFacts>): FloodLayerFacts {
  return {
    filedCount: 1000,
    covering: [],
    nearestWithin: [],
    nearestBeyond: null,
    sourceName: null,
    sourceDate: null,
    ...partial,
  };
}

class MatrixFloodSource implements FloodDataSource {
  layers: Record<string, FloodLayerFacts> = {
    flood_zone: floodLayer({ sourceName: ZONES_SOURCE, sourceDate: "2026-10-21" }),
    rofrs: floodLayer({ sourceName: ROFRS_SOURCE, sourceDate: "2026-11-03" }),
    rofsw: floodLayer({ sourceName: ROFSW_SOURCE, sourceDate: "2026-11-10" }),
  };
  async layerFacts(layer: string) {
    return this.layers[layer];
  }
}

describe("matrix — flood", () => {
  it("inside: the covering fact, per layer", async () => {
    const source = new MatrixFloodSource();
    source.layers.flood_zone = floodLayer({
      sourceName: ZONES_SOURCE,
      sourceDate: "2026-10-21",
      covering: [{ riskLabel: "FZ3", detail: "river and sea · modelled" }],
    });
    const bundle = await buildFloodBundle(ENG_HOME, source);
    if (bundle.kind !== "flood") throw new Error("expected flood");
    const zones = bundle.flood.layers.find((l) => l.layer === "flood_zone");
    expect(zones?.pointState).toBe("inside");
    expect(zones?.line).toBe(
      "the postcode point falls inside Flood Zone 3 on the Environment Agency's planning map",
    );
    expect(zones?.covering?.detail).toBe("river and sea · modelled");
    expectClean(bundle);
  });

  it("the three absences stay three distinct states with three distinct lines (D25)", async () => {
    const bundle = await buildFloodBundle(ENG_HOME, new MatrixFloodSource());
    if (bundle.kind !== "flood") throw new Error("expected flood");
    const byLayer = new Map(bundle.flood.layers.map((l) => [l.layer, l]));
    expect(byLayer.get("flood_zone")?.pointState).toBe("zone-1");
    expect(byLayer.get("flood_zone")?.line).toBe(
      "the postcode point is not in Flood Zone 2 or Flood Zone 3 on the Environment Agency's planning map",
    );
    expect(byLayer.get("rofrs")?.pointState).toBe("no-band-published");
    expect(byLayer.get("rofrs")?.line).toBe(
      "no likelihood band is published for this point on the Environment Agency's map of flooding from rivers and the sea",
    );
    expect(byLayer.get("rofsw")?.pointState).toBe("below-lowest-band");
    expect(byLayer.get("rofsw")?.line).toBe(
      "no surface-water band reaches this point — below the lowest band this product publishes",
    );
    expect(new Set(bundle.flood.layers.map((l) => l.line)).size).toBe(3);
    expectClean(bundle);
  });

  it("per-layer not-filed (D30/Q2): unchanged in meaning — a layer with no filing answers for itself only", async () => {
    const source = new MatrixFloodSource();
    source.layers.rofsw = floodLayer({ filedCount: 0 });
    const bundle = await buildFloodBundle(ENG_HOME, source);
    if (bundle.kind !== "flood") throw new Error("expected flood");
    const byLayer = new Map(bundle.flood.layers.map((l) => [l.layer, l]));
    expect(byLayer.get("rofsw")?.pointState).toBe("not-filed");
    expect(byLayer.get("rofsw")?.line).toBe(
      "this flood map is not filed yet, so no answer can be given from it",
    );
    expect(byLayer.get("flood_zone")?.pointState).toBe("zone-1");
    expect(byLayer.get("rofrs")?.pointState).toBe("no-band-published");
  });

  it("not-covered: Wales and Scotland name their own publishers; Northern Ireland and the unknown fallback keep the boundary form", async () => {
    const source = new MatrixFloodSource();
    const wales = await buildFloodBundle(WAL_HOME, source);
    if (wales.kind !== "not-covered") throw new Error("expected not-covered");
    expect(wales.flood.reason).toBe(
      "flood answers are not covered for Wales — the Environment Agency's flood maps cover England only, and flood maps for Wales are published by Natural Resources Wales",
    );
    const scotland = await buildFloodBundle(SCO_HOME, source);
    if (scotland.kind !== "not-covered") throw new Error("expected not-covered");
    expect(scotland.flood.reason).toBe(
      "flood answers are not covered for Scotland — the Environment Agency's flood maps cover England only, and flood maps for Scotland are published by the Scottish Environment Protection Agency",
    );
    const ni = await buildFloodBundle(NI_HOME, source);
    if (ni.kind !== "not-covered") throw new Error("expected not-covered");
    expect(ni.flood.reason).toBe(
      "flood answers are not covered for Northern Ireland — the Environment Agency's flood maps cover England only",
    );
    const unknown = await buildFloodBundle(home(UNKNOWN_DIR), source);
    if (unknown.kind !== "not-covered") throw new Error("expected not-covered");
    expect(unknown.flood.reason).toBe(
      "the Environment Agency's flood maps cover England only, and this postcode's filed area code does not place it in England",
    );
    expectClean(wales);
  });

  it("rungs 3 and 4: the shared unavailable reason", async () => {
    const source = new MatrixFloodSource();
    const rung3 = await buildFloodBundle(
      { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area — CM3", postcodeCount: 1 },
      source,
    );
    expect(rung3).toEqual({
      rung: 3,
      kind: "wider-area",
      flood: { state: "unavailable", reason: "flood answers need an exact postcode" },
    });
    const rung4 = await buildFloodBundle({ rung: 4, kind: "no-location" }, source);
    expect(rung4).toEqual({
      rung: 4,
      kind: "no-location",
      flood: { state: "unavailable", reason: "flood answers need an exact postcode" },
    });
  });
});

// ------------------------------------------------------------------
// The area bundle (43 slots)
// ------------------------------------------------------------------

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

function designations(byType: Partial<DesignationFacts["byType"]>): DesignationFacts {
  const empty = () => layerFacts({});
  return {
    byType: {
      sssi: byType.sssi ?? empty(),
      sac: byType.sac ?? empty(),
      spa: byType.spa ?? empty(),
      ramsar: byType.ramsar ?? empty(),
    },
    overlaps: [],
  };
}

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

function epcArtefact(certificates: EpcCertificate[]): EpcArtefact {
  return {
    certificates,
    certificateCount: certificates.length,
    sourceName: "Get energy performance of buildings data (MHCLG)",
    sourceDate: "2026-11-12",
    loadedAt: "2026-11-12T00:00:00.000Z",
  };
}

const BIRKDALE_CERT = cert({
  certificateNumber: "0000-0000-0000-0000-0001",
  addressLine1: "19 Birkdale Rise",
  band: "B",
  ratingCurrent: 81,
  registrationDate: "2022-10-07",
});

class MatrixAreaSource implements AreaDataSource {
  layers = new Map<string, PlanningLayerFacts>();
  designationFactsValue: DesignationFacts = designations({});
  listed: ListedFacts = {
    filedCount: 379169,
    within: [],
    nearestBeyond: null,
    sourceName: "Historic England — National Heritage List for England",
    sourceDate: PLANNING_DATE,
  };
  phi: PhiFacts = {
    filedCount: 818225,
    nearest: null,
    typesWithin: [],
    sourceName: "Natural England — Priority Habitat Inventory",
    sourceDate: PLANNING_DATE,
  };
  gate = false;
  epc: EpcArtefact | null = epcArtefact([BIRKDALE_CERT]);
  epcLoad: (() => void) | null = null;
  tax: CouncilTaxFacts | null = {
    authorityName: "Braintree",
    nation: "england",
    taxYear: "2026-27",
    bandDAreaAveragePence: 228034,
    parishAveraged: false,
    components: [{ role: "billing_authority", label: "Braintree", pence: 228034 }],
    sourceName: "MHCLG — Council Tax levels set by local authorities in England 2026 to 2027",
    sourceDate: "2026-03-25",
  };
  census = {
    msoaCode: "E02004463",
    msoaName: "Braintree 018",
    stats: {} as Record<string, unknown>,
    sourceName: "ONS Census 2021 via Nomis (bulk download)",
    sourceDate: "2021-03-21" as string | null,
  };
  imd = {
    lsoaCode: "E01021395",
    lsoaName: "Braintree 018C",
    decile: 8,
    summary:
      "This area is in the tenth of areas with the lowest measured deprivation (decile 8 of 10)",
    domains: {} as Record<string, number>,
    sourceName: "English Indices of Deprivation 2025 — File 7 (MHCLG)",
    sourceDate: "2025-10-30" as string | null,
  };
  air = {
    year: 2024,
    no2: 8.150298,
    pm25: 7.124671,
    pm10: 12.54823,
    sourceName: "Defra — Pollution Climate Mapping (PCM)" as string | null,
    sourceDate: "2025-06-30" as string | null,
  };
  noise = {
    filedCount: 100,
    rows: [] as { sourceKind: string; dayBand: string | null; nightBand: string | null }[],
    sourceName: "Defra strategic noise mapping — England Round 4 (2022 reference year)" as
      string | null,
    sourceDate: "2024-10-01" as string | null,
  };
  benefitsFacts: BenefitsFacts = {
    claimantCount: null,
    ucPeople: null,
    ucHouseholds: null,
    bases: null,
  };
  solar: SolarFacts = { gridFiledCount: 1000, cell: null };
  company: CompanyOwnershipFacts = {
    ccodFiledCount: 4485124,
    ocodFiledCount: 90950,
    editions: {
      ccod: {
        sourceName: "HM Land Registry — UK companies that own property in England and Wales (CCOD)",
        sourceDate: "2026-11-01",
      },
      ocod: {
        sourceName:
          "HM Land Registry — Overseas companies that own property in England and Wales (OCOD)",
        sourceDate: "2026-11-01",
      },
    },
    titles: [],
    snapshots: {},
  };

  async planningLayerFacts(layer: string) {
    return this.layers.get(layer) ?? layerFacts({});
  }
  async designationFacts() {
    return this.designationFactsValue;
  }
  async listedFacts() {
    return this.listed;
  }
  async phiFacts() {
    return this.phi;
  }
  async article4Gate() {
    return this.gate;
  }
  async epcArtefact() {
    return this.epc;
  }
  async loadEpc() {
    if (this.epcLoad) {
      this.epcLoad();
      return;
    }
    throw new Error("the EPC load failed");
  }
  async councilTaxRow() {
    return this.tax;
  }
  async censusRow() {
    return this.census;
  }
  async imdRow() {
    return this.imd;
  }
  async airSquare() {
    return this.air;
  }
  async noiseRows() {
    return this.noise;
  }
  async benefits() {
    return this.benefitsFacts;
  }
  async solarCell() {
    return this.solar;
  }
  async companyOwnershipFacts() {
    return this.company;
  }
}

async function areaBundle(source: MatrixAreaSource, resolution: AddressResolution = ENG_HOME) {
  const bundle = await buildAreaBundle(resolution, source);
  if (bundle.kind !== "area-bundle") throw new Error("expected an area bundle");
  return bundle;
}

describe("matrix — area: polygon layers", () => {
  it("inside: the covering fact", async () => {
    const source = new MatrixAreaSource();
    source.layers.set(
      "conservation_area",
      layerFacts({ covering: [{ id: 1, name: "Old Town", detail: null }] }),
    );
    const bundle = await areaBundle(source);
    const ca = bundle.sections.constraints.conservationArea;
    expect(ca.state).toBe("inside");
    expect(ca.line).toBe("the postcode point falls inside the Old Town conservation area");
    expectClean(bundle);
  });

  it("none-found: one absence template (Part 3, item 7) — green belt joins Article 4 and monuments", async () => {
    const bundle = await areaBundle(new MatrixAreaSource());
    const { constraints, heritage } = bundle.sections;
    expect(constraints.greenBelt.state).toBe("none-found");
    expect(constraints.greenBelt.line).toBe(
      "no green belt covers this postcode point in the national data",
    );
    expect(heritage.monuments.state).toBe("none-found");
    expect(heritage.monuments.line).toBe(
      "no scheduled monument covers this postcode point in the national data",
    );
    // Conservation areas keep their check date — council-
    // supplied data, and the date is load-bearing there.
    expect(constraints.conservationArea.state).toBe("none-found");
    expect(constraints.conservationArea.line).toBe(
      "no conservation area found in the national data, checked 10 November 2026",
    );
    // Ancient woodland keeps 'recorded in the inventory'.
    const aw = bundle.sections.nature.ancientWoodland;
    expect(aw.state).toBe("none-found");
    expect(aw.line).toBe("no ancient woodland recorded in the inventory near this postcode point");
    expectClean(bundle);
  });

  it("Article 4 not-published: names the council's own planning register as where the answer lives (Part 7)", async () => {
    const bundle = await areaBundle(new MatrixAreaSource());
    const a4 = bundle.sections.constraints.article4;
    expect(a4.state).toBe("not-published");
    expect(a4.councilPublishes).toBe(false);
    expect(a4.line).toBe(
      "Article 4 directions are not published by this council to the national dataset, so no finding can be made from the data — the answer lives on the council's own planning register",
    );
    expectClean(bundle);
  });

  it("Article 4 none-found stays gate-locked: only a positive gate answer serves it", async () => {
    const source = new MatrixAreaSource();
    source.gate = true;
    const bundle = await areaBundle(source);
    const a4 = bundle.sections.constraints.article4;
    expect(a4.state).toBe("none-found");
    expect(a4.councilPublishes).toBe(true);
    expect(a4.line).toBe(
      "no Article 4 direction area covers this postcode point in the national data",
    );
  });

  it("not-filed: one two-part sentence form across the polygon family (Part 3, item 8)", async () => {
    const source = new MatrixAreaSource();
    source.layers.set("conservation_area", layerFacts({ filedCount: 0 }));
    source.layers.set("green_belt", layerFacts({ filedCount: 0 }));
    const bundle = await areaBundle(source);
    expect(bundle.sections.constraints.conservationArea.state).toBe("not-filed");
    expect(bundle.sections.constraints.conservationArea.line).toBe(
      "the conservation area data is not filed yet, so no conservation area answer can be given yet",
    );
    expect(bundle.sections.constraints.greenBelt.line).toBe(
      "the green belt data is not filed yet, so no green belt answer can be given yet",
    );
  });

  it("sparse-coverage: Welsh and Scottish absences are coverage facts, never proven nones", async () => {
    const wales = await areaBundle(new MatrixAreaSource(), WAL_HOME);
    expect(wales.sections.constraints.conservationArea.state).toBe("sparse-coverage");
    expect(wales.sections.constraints.conservationArea.line).toBe(
      "no conservation area is filed near this point — conservation areas are supplied by councils and coverage here is sparse, so this is not a proven none",
    );
    expect(wales.sections.constraints.greenBelt.state).toBe("sparse-coverage");
    expect(wales.sections.constraints.greenBelt.line).toBe(
      "the green belt data filed covers England and Wales, and no green belt is filed near this point",
    );
    const scotland = await areaBundle(new MatrixAreaSource(), SCO_HOME);
    expect(scotland.sections.heritage.monuments.state).toBe("sparse-coverage");
    expect(scotland.sections.heritage.monuments.line).toBe(
      "the scheduled monuments filed cover England, and none is filed near this point",
    );
    expect(scotland.sections.nature.ancientWoodland.state).toBe("sparse-coverage");
    expect(scotland.sections.nature.ancientWoodland.line).toBe(
      "the ancient woodland inventory filed covers England, and no woodland in it is filed near this point",
    );
    expectClean(wales);
  });
});

describe("matrix — area: heritage", () => {
  it("served with none within: the register fact plus the beyond line", async () => {
    const source = new MatrixAreaSource();
    source.listed = {
      filedCount: 379169,
      within: [],
      nearestBeyond: { listEntryId: "100001", name: "Apes Hall", grade: "II", miles: 2.532 },
      sourceName: "Historic England — National Heritage List for England",
      sourceDate: PLANNING_DATE,
    };
    const bundle = await areaBundle(source);
    const listed = bundle.sections.heritage.listed;
    expect(listed.state).toBe("served");
    expect(listed.countWithin).toBe(0);
    expect(listed.line).toBe("no listed buildings within 2 miles of the postcode point");
    expect(listed.beyondLine).toContain("Apes Hall");
    expect(bundle.sections.heritage.localListsLine).toBe(
      "buildings on councils' local lists are not included — local lists are held by each council and are not part of the national data",
    );
    expectClean(bundle);
  });

  it("not-filed: the two-part form", async () => {
    const source = new MatrixAreaSource();
    source.listed = {
      filedCount: 0,
      within: [],
      nearestBeyond: null,
      sourceName: null,
      sourceDate: null,
    };
    const bundle = await areaBundle(source);
    expect(bundle.sections.heritage.listed.state).toBe("not-filed");
    expect(bundle.sections.heritage.listed.line).toBe(
      "the listed buildings data is not filed yet, so no listed buildings answer can be given yet",
    );
  });

  it("sparse-coverage outside England: the count is null, never 0", async () => {
    const bundle = await areaBundle(new MatrixAreaSource(), WAL_HOME);
    const listed = bundle.sections.heritage.listed;
    expect(listed.state).toBe("sparse-coverage");
    expect(listed.countWithin).toBeNull();
    expect(listed.line).toBe(
      "the listed buildings filed are England's National Heritage List — listed buildings in Wales sit on their own register, which is not filed, so no count can be given for this point",
    );
  });

  it("at the point: recorded at rung 1, none when the nearest is beyond the threshold, needs-exact-home at rung 2", async () => {
    const source = new MatrixAreaSource();
    source.listed = {
      filedCount: 379169,
      within: [{ listEntryId: "100002", name: "Market House", grade: "II*", miles: 0 }],
      nearestBeyond: null,
      sourceName: "Historic England — National Heritage List for England",
      sourceDate: PLANNING_DATE,
    };
    const rung1 = await areaBundle(source);
    expect(rung1.sections.heritage.atPoint.state).toBe("recorded");
    if (rung1.sections.heritage.atPoint.state === "recorded")
      expect(rung1.sections.heritage.atPoint.line).toContain("check the NHLE entry");

    source.listed = {
      ...source.listed,
      within: [{ listEntryId: "100003", name: "Far Hall", grade: "II", miles: 0.5 }],
    };
    const far = await areaBundle(source);
    expect(far.sections.heritage.atPoint.state).toBe("none");

    const rung2 = await areaBundle(source, addressList(ENG_DIR));
    expect(rung2.sections.heritage.atPoint).toEqual({
      state: "needs-exact-home",
      reason: "choose the exact home to check a listed building recorded at its point",
    });
  });
});

describe("matrix — area: nature", () => {
  it("served absence: no designated site, proven against the filings", async () => {
    const bundle = await areaBundle(new MatrixAreaSource());
    const nature = bundle.sections.nature;
    expect(nature.placesLine).toBe("no designated site at or within 2 miles of the postcode point");
    expect(nature.designationsLine).toBeNull();
    expect(nature.coverageLine).toBeNull();
    expectClean(bundle);
  });

  it("guarded (Part 3, item 5): one unfiled designation type names itself and withholds only its own absence", async () => {
    const source = new MatrixAreaSource();
    source.designationFactsValue = designations({
      sssi: layerFacts({ filedCount: 0 }),
      sac: layerFacts({ covering: [{ id: 7, name: "Example Estuary", detail: null }] }),
    });
    const bundle = await areaBundle(source);
    const nature = bundle.sections.nature;
    expect(nature.designationsLine).toBe(
      "the SSSI designation data is not filed yet, so no SSSI answer can be given yet",
    );
    expect(nature.placesWithinCount).toBe(1);
    expect(nature.places[0]?.line).toBe("Example Estuary — SAC");
    expectClean(bundle);
  });

  it("guarded: rows filed under an unfiled type are never served as a finding", async () => {
    const source = new MatrixAreaSource();
    source.designationFactsValue = designations({
      sssi: layerFacts({
        filedCount: 0,
        covering: [{ id: 9, name: "Ghost SSSI", detail: null }],
      }),
    });
    const bundle = await areaBundle(source);
    expect(bundle.sections.nature.places).toEqual([]);
    expect(bundle.sections.nature.placesLine).toBe(
      "no designated site at or within 2 miles of the postcode point",
    );
  });

  it("all four types unfiled: the section serves its not-filed line, never an absence", async () => {
    const source = new MatrixAreaSource();
    const empty = layerFacts({ filedCount: 0 });
    source.designationFactsValue = designations({
      sssi: empty,
      sac: empty,
      spa: empty,
      ramsar: empty,
    });
    const bundle = await areaBundle(source);
    const nature = bundle.sections.nature;
    expect(nature.placesLine).toBe(
      "nature designations are not filed yet, so no designation answer can be given yet",
    );
    expect(nature.places).toEqual([]);
    expect(nature.designationsLine).toBe(
      "the SSSI designation data is not filed yet, so no SSSI answer can be given yet; the SAC designation data is not filed yet, so no SAC answer can be given yet; the SPA designation data is not filed yet, so no SPA answer can be given yet; the Ramsar designation data is not filed yet, so no Ramsar answer can be given yet",
    );
  });

  it("outside England: the coverage line names the boundary", async () => {
    const bundle = await areaBundle(new MatrixAreaSource(), WAL_HOME);
    expect(bundle.sections.nature.coverageLine).toBe(
      "the nature designations filed come from Natural England's England services, so an absence in Wales is a coverage fact, not a finding",
    );
  });

  it("priority habitats: not-filed behind the guard; served-but-none-near behind a filing", async () => {
    const source = new MatrixAreaSource();
    source.phi = {
      filedCount: 0,
      nearest: null,
      typesWithin: [],
      sourceName: null,
      sourceDate: null,
    };
    const unfiled = await areaBundle(source);
    expect(unfiled.sections.nature.priorityHabitat).toEqual({
      state: "not-filed",
      line: "priority habitat records are not filed yet, so no habitat answer can be given yet",
    });
    const filed = await areaBundle(new MatrixAreaSource());
    const phi = filed.sections.nature.priorityHabitat;
    expect(phi.state).toBe("served");
    if (phi.state === "served")
      expect(phi.line).toBe("no priority habitat is recorded near this postcode point");
  });
});

describe("matrix — area: EPC", () => {
  it("served: the home's certificate", async () => {
    const bundle = await areaBundle(new MatrixAreaSource());
    expect(bundle.sections.epc.state).toBe("served");
    expect(bundle.sections.epc.headlineBand).toBe("B");
  });

  it("filed-zero: the register was loaded and holds none for this postcode", async () => {
    const source = new MatrixAreaSource();
    source.epc = epcArtefact([]);
    const bundle = await areaBundle(source);
    expect(bundle.sections.epc.state).toBe("filed-zero");
    expect(bundle.sections.epc.line).toBe("no energy certificate is recorded for this postcode");
    expect(bundle.sections.epc.certificateCountAtPostcode).toBe(0);
  });

  it("none-matching: certificates exist at the postcode, none for this exact home", async () => {
    const source = new MatrixAreaSource();
    source.epc = epcArtefact([
      cert({ certificateNumber: "X2", addressLine1: "21 Birkdale Rise", band: "C" }),
    ]);
    const bundle = await areaBundle(source);
    expect(bundle.sections.epc.state).toBe("none-matching");
    expect(bundle.sections.epc.line).toBe(
      "certificates are recorded for this postcode; none is for this exact home",
    );
    expect(bundle.sections.epc.certificateCountAtPostcode).toBe(1);
  });

  it("not-filed: the cold load was attempted and failed — the 'could not be loaded' form", async () => {
    const source = new MatrixAreaSource();
    source.epc = null;
    const bundle = await areaBundle(source);
    expect(bundle.sections.epc.state).toBe("not-filed");
    expect(bundle.sections.epc.line).toBe(
      "energy certificates could not be loaded for this postcode, so no certificate answer can be given",
    );
    expectClean(bundle);
  });

  it("cold load success: a never-loaded postcode loads, then serves", async () => {
    const source = new MatrixAreaSource();
    source.epc = null;
    source.epcLoad = () => {
      source.epc = epcArtefact([BIRKDALE_CERT]);
    };
    const bundle = await areaBundle(source);
    expect(bundle.sections.epc.state).toBe("served");
  });

  it("needs-exact-home at rung 2", async () => {
    const bundle = await areaBundle(new MatrixAreaSource(), addressList(ENG_DIR));
    expect(bundle.sections.epc.state).toBe("needs-exact-home");
    expect(bundle.sections.epc.line).toBe("choose the exact home to see its energy certificates");
  });
});

describe("matrix — area: council tax", () => {
  it("served: the authority's scale, labelled as the area average", async () => {
    const bundle = await areaBundle(new MatrixAreaSource());
    const tax = bundle.sections.councilTax;
    expect(tax.state).toBe("served");
    expect(tax.line).toBe(
      "Braintree's average Band D council tax for 2026-27 is £2,280.34 — an area average, not this home's bill",
    );
    expectClean(bundle);
  });

  it("renamed (D30/Q4): an unfiled authority serves the NOT-FILED family — the gap is ours, not the council's publication", async () => {
    const source = new MatrixAreaSource();
    source.tax = null;
    const bundle = await areaBundle(source);
    const tax = bundle.sections.councilTax;
    expect(tax.state).toBe("not-filed");
    expect(tax.line).toBe(
      "this council's council tax charges are not filed yet — most councils are filed in the spring pass, and until then no figure can be given",
    );
    expect(JSON.stringify(tax)).not.toContain("not published");
    expectClean(bundle);
  });

  it("not-covered: Scotland and Northern Ireland run different systems", async () => {
    const bundle = await areaBundle(new MatrixAreaSource(), SCO_HOME);
    const tax = bundle.sections.councilTax;
    expect(tax.state).toBe("not-covered");
    expect(tax.line).toBe(
      "council tax figures are not covered for Scotland — it runs a different system, and no comparable charge is filed",
    );
  });
});

describe("matrix — area: Census, IMD, air, noise, benefits, solar", () => {
  it("Census served / not-filed / not-covered naming the nation (Part 3, item 10a)", async () => {
    const served = await areaBundle(new MatrixAreaSource());
    expect(served.sections.census.state).toBe("served");

    const missing = new MatrixAreaSource();
    missing.census = null as never;
    const notFiled = await areaBundle(missing);
    expect(notFiled.sections.census.state).toBe("not-filed");
    expect(notFiled.sections.census.line).toBe("Census 2021 figures are not filed for this area");

    const scotland = await areaBundle(new MatrixAreaSource(), SCO_HOME);
    expect(scotland.sections.census.state).toBe("not-covered");
    expect(scotland.sections.census.line).toBe(
      "Census 2021 figures are published for England and Wales — Scotland is outside that coverage",
    );
    expectClean(scotland);
  });

  it("IMD served / not-filed / not-covered in its own form", async () => {
    const served = await areaBundle(new MatrixAreaSource());
    expect(served.sections.imd.state).toBe("served");
    expect(served.sections.imd.decile).toBe(8);

    const missing = new MatrixAreaSource();
    missing.imd = null as never;
    const notFiled = await areaBundle(missing);
    expect(notFiled.sections.imd.state).toBe("not-filed");
    expect(notFiled.sections.imd.line).toBe("no deprivation index figure is filed for this area");

    const wales = await areaBundle(new MatrixAreaSource(), WAL_HOME);
    expect(wales.sections.imd.state).toBe("not-covered");
    expect(wales.sections.imd.line).toBe(
      "the English Indices of Deprivation do not cover Wales — it publishes its own index on its own scale, which is not filed and is never compared with the English one",
    );
  });

  it("air served / not-filed", async () => {
    const served = await areaBundle(new MatrixAreaSource());
    expect(served.sections.air.state).toBe("served");
    expect(served.sections.air.headlineFigure?.line).toBe(
      "modelled NO2 8.150298 µg/m³ (annual mean, 2024)",
    );
    const missing = new MatrixAreaSource();
    missing.air = null as never;
    const notFiled = await areaBundle(missing);
    expect(notFiled.sections.air.state).toBe("not-filed");
    expect(notFiled.sections.air.line).toBe(
      "no modelled air quality square is filed for this point",
    );
  });

  it("noise: not-filed (in that order) before not-covered; per-row states distinct", async () => {
    const unfiledSource = new MatrixAreaSource();
    unfiledSource.noise = { filedCount: 0, rows: [], sourceName: null, sourceDate: null };
    const unfiled = await areaBundle(unfiledSource, SCO_HOME);
    expect(unfiled.sections.noise.state).toBe("not-filed");
    expect(unfiled.sections.noise.line).toBe(
      "modelled noise bands are not filed yet, so no noise answer can be given yet",
    );

    const scotland = await areaBundle(new MatrixAreaSource(), SCO_HOME);
    expect(scotland.sections.noise.state).toBe("not-covered");
    expect(scotland.sections.noise.line).toBe(
      "the modelled noise mapping filed covers England only — Scotland is not covered",
    );

    const noRows = await areaBundle(new MatrixAreaSource());
    expect(noRows.sections.noise.state).toBe("served");
    expect(noRows.sections.noise.line).toBe("no noise bands are filed for this postcode");

    const withRows = new MatrixAreaSource();
    withRows.noise = {
      filedCount: 100,
      rows: [
        { sourceKind: "road", dayBand: "Below 55 dB", nightBand: "Below 50 dB" },
        { sourceKind: "rail", dayBand: null, nightBand: null },
      ],
      sourceName: "Defra strategic noise mapping — England Round 4 (2022 reference year)",
      sourceDate: "2024-10-01",
    };
    const servedBundle = await areaBundle(withRows);
    const bands = servedBundle.sections.noise.bands;
    // Below-range is a real filed value, never 0 dB.
    expect(bands[0]?.line).toBe("road noise: Below 55 dB by day, Below 50 dB by night");
    // A row with no band is the publisher's no-modelled state.
    expect(bands[1]?.line).toBe("no rail noise band is filed for this postcode");
    expectClean(servedBundle);
  });

  it("benefits: the three series serve separately; a missing Households LSOA is not-published-for-this-area, never a zero", async () => {
    const source = new MatrixAreaSource();
    const stamp = { sourceName: "DWP via Stat-Xplore / ONS Nomis", sourceDate: "2026-10-13" };
    source.benefitsFacts = {
      claimantCount: { month: "2026-09-01", count: 15, pct: null, ...stamp },
      ucPeople: { month: "2026-05-01", count: 117, pct: null, ...stamp },
      ucHouseholds: null,
      bases: { residents: 1489, households: 625 },
    };
    const bundle = await areaBundle(source);
    const benefits = bundle.sections.benefits;
    expect(benefits.state).toBe("served");
    const claimant = benefits.series.find((s) => s.series === "claimant_count");
    expect(claimant?.state).toBe("served");
    expect(claimant?.count).toBe(15);
    // Nomis suppresses the percentage for counts of 1 or 2 —
    // served as the publisher's own not-published, never
    // back-calculated.
    expect(claimant?.pct).toBeNull();
    expect(claimant?.pctState).toBe("not-published");
    const households = benefits.series.find((s) => s.series === "uc_households");
    expect(households?.state).toBe("not-published-for-this-area");
    expect(households?.line).toBe("households on Universal Credit is not published for this area");
    expect(households?.count).toBeNull();
    expectClean(bundle);
  });

  it("benefits: nothing filed serves the section and series not-filed lines; Scotland is not covered", async () => {
    const bundle = await areaBundle(new MatrixAreaSource());
    const benefits = bundle.sections.benefits;
    expect(benefits.state).toBe("not-filed");
    expect(benefits.line).toBe("benefit counts are not filed for this area");
    const people = benefits.series.find((s) => s.series === "uc_people");
    expect(people?.state).toBe("not-filed");
    expect(people?.line).toBe("people on Universal Credit is not filed for this area");

    const scotland = await areaBundle(new MatrixAreaSource(), SCO_HOME);
    expect(scotland.sections.benefits.state).toBe("not-covered");
    expect(scotland.sections.benefits.line).toBe(
      "these benefit series are filed for England and Wales areas — Scotland is not covered",
    );
  });

  it("solar: an empty grid and a missing cell are two different not-filed facts", async () => {
    const emptyGrid = new MatrixAreaSource();
    emptyGrid.solar = { gridFiledCount: 0, cell: null };
    const a = await areaBundle(emptyGrid);
    expect(a.sections.solar.state).toBe("not-filed");
    expect(a.sections.solar.line).toBe(
      "solar modelling is not filed yet, so no solar answer can be given yet",
    );
    const missingCell = await areaBundle(new MatrixAreaSource());
    expect(missingCell.sections.solar.state).toBe("not-filed");
    expect(missingCell.sections.solar.line).toBe("solar modelling is not filed for this area yet");
  });

  it("rung 3: every section present only as its named state, per-section reasons intact (12)", async () => {
    const bundle = await buildAreaBundle(
      { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area — CM3", postcodeCount: 1 },
      new MatrixAreaSource(),
    );
    if (bundle.kind !== "wider-area") throw new Error("expected wider-area");
    expect(bundle.area.sections).toEqual({
      constraints: { state: "unavailable", reason: "planning constraints need an exact postcode" },
      heritage: { state: "unavailable", reason: "heritage answers need an exact postcode" },
      nature: { state: "unavailable", reason: "nature answers need an exact postcode" },
      epc: { state: "unavailable", reason: "energy certificates need an exact postcode" },
      councilTax: { state: "unavailable", reason: "council tax needs an exact postcode" },
      planningApplications: {
        state: "unavailable",
        reason: "planning applications need an exact postcode",
      },
      census: { state: "unavailable", reason: "Census figures need an exact postcode" },
      imd: { state: "unavailable", reason: "area statistics need an exact postcode" },
      air: { state: "unavailable", reason: "air quality needs an exact postcode" },
      noise: { state: "unavailable", reason: "noise bands need an exact postcode" },
      benefits: { state: "unavailable", reason: "benefit counts need an exact postcode" },
      solar: { state: "unavailable", reason: "solar modelling needs an exact postcode" },
    });
  });
});

// ------------------------------------------------------------------
// The short bundle: state lines travel verbatim (D30/Q6)
// ------------------------------------------------------------------

async function shortFor(
  resolution: AddressResolution,
  area: MatrixAreaSource,
  nearby: MatrixNearbySource,
) {
  const soldSource = new MatrixSoldPricesSource();
  soldSource.rows.set("CM3 2JT", [
    sale({ price: 100000, saleDate: "2001-01-05" }),
    sale({ price: 200000, saleDate: "2005-02-05" }),
    sale({ price: 300000, saleDate: "2010-03-05" }),
    sale({ price: 400000, saleDate: "2015-04-05" }),
    sale({ price: 588995, saleDate: "2023-06-15" }),
  ]);
  const crimeSource = new MatrixCrimeSource();
  crimeSource.artefacts.set("CM3 2JT", crimeArtefact(3));
  const [nearbyBundle, soldPrices, crime, flood, areaBundleResult] = await Promise.all([
    buildNearbyBundle(resolution, nearby),
    buildSoldPricesBundle(resolution, soldSource),
    buildCrimeBundle(resolution, crimeSource, { now: CRIME_NOW }),
    buildFloodBundle(resolution, new MatrixFloodSource()),
    buildAreaBundle(resolution, area),
  ]);
  const short = buildShortBundle({
    nearby: nearbyBundle,
    soldPrices,
    crime,
    flood,
    area: areaBundleResult,
  });
  return { short, areaBundle: areaBundleResult };
}

function headlineNearby(): MatrixNearbySource {
  const source = new MatrixNearbySource();
  filedEverywhere(source);
  for (const c of ["schools-primary", "schools-secondary", "nurseries", "station", "gp"] as const)
    source.points.set(c, [northOf(ENG_DIR, "A Place", 0.5)]);
  return source;
}

describe("matrix — the short bundle's state lines equal the full bundle's, verbatim", () => {
  it("EPC filed-zero, council tax not-filed, air not-filed, noise not-filed: the sentences travel", async () => {
    const area = new MatrixAreaSource();
    area.epc = epcArtefact([]);
    area.tax = null;
    area.air = null as never;
    area.noise = { filedCount: 0, rows: [], sourceName: null, sourceDate: null };
    const { short, areaBundle } = await shortFor(ENG_HOME, area, headlineNearby());
    if (short.kind !== "short-bundle" || areaBundle.kind !== "area-bundle")
      throw new Error("expected bundles");
    const full = areaBundle.sections;
    expect(short.sections.epc.state).toBe("filed-zero");
    expect(short.sections.epc.line).toBe(full.epc.line);
    expect(short.sections.epc.line).toBe("no energy certificate is recorded for this postcode");
    expect(short.sections.councilTax.state).toBe("not-filed");
    expect(short.sections.councilTax.line).toBe(full.councilTax.line);
    expect(short.sections.councilTax.line).toBe(
      "this council's council tax charges are not filed yet — most councils are filed in the spring pass, and until then no figure can be given",
    );
    expect(short.sections.air.state).toBe("not-filed");
    expect(short.sections.air.line).toBe(full.air.line);
    expect(short.sections.noise.state).toBe("not-filed");
    expect(short.sections.noise.line).toBe(full.noise.line);
    expectClean(short);
  });

  it("EPC none-matching and needs-exact-home lines travel; the served council-tax headline keeps its D28 composed line", async () => {
    const area = new MatrixAreaSource();
    area.epc = epcArtefact([
      cert({ certificateNumber: "X9", addressLine1: "21 Birkdale Rise", band: "C" }),
    ]);
    const rung1 = await shortFor(ENG_HOME, area, headlineNearby());
    if (rung1.short.kind !== "short-bundle") throw new Error("expected a short bundle");
    expect(rung1.short.sections.epc.state).toBe("none-matching");
    expect(rung1.short.sections.epc.line).toBe(
      "certificates are recorded for this postcode; none is for this exact home",
    );
    expect(rung1.short.sections.councilTax.line).toBe(
      "Band D averages £2,280.34 a year in Braintree (the council's scale — not this home's bill)",
    );

    const rung2 = await shortFor(addressList(ENG_DIR), new MatrixAreaSource(), headlineNearby());
    if (rung2.short.kind !== "short-bundle") throw new Error("expected a short bundle");
    expect(rung2.short.sections.epc.state).toBe("needs-exact-home");
    expect(rung2.short.sections.epc.line).toBe(
      "choose the exact home to see its energy certificates",
    );
  });

  it("Scotland: the not-covered lines for council tax and noise travel verbatim", async () => {
    const nearby = new MatrixNearbySource();
    filedEverywhere(nearby);
    const { short, areaBundle } = await shortFor(SCO_HOME, new MatrixAreaSource(), nearby);
    if (short.kind !== "short-bundle" || areaBundle.kind !== "area-bundle")
      throw new Error("expected bundles");
    expect(short.sections.councilTax.state).toBe("not-covered");
    expect(short.sections.councilTax.line).toBe(areaBundle.sections.councilTax.line);
    expect(short.sections.noise.state).toBe("not-covered");
    expect(short.sections.noise.line).toBe(areaBundle.sections.noise.line);
    expectClean(short);
  });

  it("the supermarket map wording flows through the projection unchanged", async () => {
    const { short } = await shortFor(ENG_HOME, new MatrixAreaSource(), headlineNearby());
    if (short.kind !== "short-bundle") throw new Error("expected a short bundle");
    const supermarkets = short.sections.nearby.categories.find((c) => c.category === "supermarket");
    expect(supermarkets?.line).toBe(
      "no supermarkets recorded within 2 miles on the map data we hold — a gap in the map is not proof that none exists",
    );
  });

  it("the nature designations line travels to the short bundle", async () => {
    const area = new MatrixAreaSource();
    area.designationFactsValue = designations({ sssi: layerFacts({ filedCount: 0 }) });
    const { short, areaBundle } = await shortFor(ENG_HOME, area, headlineNearby());
    if (short.kind !== "short-bundle" || areaBundle.kind !== "area-bundle")
      throw new Error("expected bundles");
    expect(short.sections.nature.designationsLine).toBe(
      areaBundle.sections.nature.designationsLine,
    );
    expect(short.sections.nature.designationsLine).toBe(
      "the SSSI designation data is not filed yet, so no SSSI answer can be given yet",
    );
  });
});

// ------------------------------------------------------------------
// Planning applications: the handed-off family (M6.12, D31)
// ------------------------------------------------------------------

describe("matrix — area: planning applications (the hand-off)", () => {
  const GOVUK_LINK = {
    label: "Search the register of planning decisions (GOV.UK)",
    url: "https://www.gov.uk/search-register-planning-decisions",
  };

  it("England: handed-off, the council named from the directory, the GOV.UK signpost", async () => {
    const bundle = await areaBundle(new MatrixAreaSource(), ENG_HOME);
    const planning = bundle.sections.planningApplications;
    expect(planning.state).toBe("handed-off");
    expect(planning.council).toBe("Braintree");
    expect(planning.council).toBe(ENG_DIR.council);
    expect(planning.line).toBe(
      "planning applications for this area are published on the planning register kept by Braintree — we do not hold a copy, so no applications are listed here; the link below takes you to the official search, where you enter the postcode",
    );
    expect(planning.link).toEqual(GOVUK_LINK);
    expect(planning.depth).toBe("report");
    expect(planning.sourceLine).toBeNull();
    expectClean(bundle);
  });

  it("Wales: the same signpost — GOV.UK's service covers England and Wales", async () => {
    const bundle = await areaBundle(new MatrixAreaSource(), WAL_HOME);
    const planning = bundle.sections.planningApplications;
    expect(planning.state).toBe("handed-off");
    expect(planning.council).toBe("Cardiff");
    expect(planning.line).toBe(
      "planning applications for this area are published on the planning register kept by Cardiff — we do not hold a copy, so no applications are listed here; the link below takes you to the official search, where you enter the postcode",
    );
    expect(planning.link).toEqual(GOVUK_LINK);
    expectClean(bundle);
  });

  it("Scotland: handed-off with NO link — viewing is per-council, and no national register exists", async () => {
    const bundle = await areaBundle(new MatrixAreaSource(), SCO_HOME);
    const planning = bundle.sections.planningApplications;
    expect(planning.state).toBe("handed-off");
    expect(planning.council).toBe("City of Edinburgh");
    expect(planning.line).toBe(
      "planning applications for this area are published by City of Edinburgh on its own website — we do not hold a copy, so no applications are listed here, and there is no single Scottish register to link to",
    );
    expect(planning.link).toBeNull();
    expectClean(bundle);
  });

  it("Northern Ireland: handed-off WITH the Public Register link", async () => {
    const bundle = await areaBundle(new MatrixAreaSource(), NI_HOME);
    const planning = bundle.sections.planningApplications;
    expect(planning.state).toBe("handed-off");
    expect(planning.council).toBe("Belfast");
    expect(planning.line).toBe(
      "planning applications for this area are published on the Northern Ireland Public Register — we do not hold a copy, so no applications are listed here; the link below takes you to the register, where you can search by postcode",
    );
    expect(planning.link).toEqual({
      label: "Northern Ireland Public Register",
      url: "https://planningregister.planningsystemni.gov.uk/simple-search",
    });
    expectClean(bundle);
  });

  it("Mid Ulster: the exception line — the one NI council not on the register gets no link", async () => {
    const bundle = await areaBundle(new MatrixAreaSource(), MID_ULSTER_HOME);
    const planning = bundle.sections.planningApplications;
    expect(planning.state).toBe("handed-off");
    expect(planning.council).toBe("Mid Ulster");
    expect(planning.line).toBe(
      "planning applications for this area are published by Mid Ulster District Council on its own planning portal — it is the one Northern Ireland council not on the national register; we do not hold a copy, so no applications are listed here",
    );
    expect(planning.link).toBeNull();
    expectClean(bundle);
  });

  it("the unknown nation: the council named, no link — the link is the only nation-shaped part", async () => {
    const bundle = await areaBundle(new MatrixAreaSource(), home(UNKNOWN_DIR));
    const planning = bundle.sections.planningApplications;
    expect(planning.state).toBe("handed-off");
    expect(planning.council).toBe("Braintree");
    expect(planning.line).toBe(
      "planning applications for this area are published on the planning register kept by Braintree — we do not hold a copy, so no applications are listed here",
    );
    expect(planning.link).toBeNull();
    expectClean(bundle);
  });

  it("rungs 1 and 2 serve the hand-off identically — it depends on the directory row alone", async () => {
    const rung1 = await areaBundle(new MatrixAreaSource(), ENG_HOME);
    const rung2 = await areaBundle(new MatrixAreaSource(), addressList(ENG_DIR));
    expect(rung2.sections.planningApplications).toEqual(rung1.sections.planningApplications);
  });

  it("the hand-off never reaches the short bundle — D28's eleven sections stand", async () => {
    const { short } = await shortFor(ENG_HOME, new MatrixAreaSource(), headlineNearby());
    if (short.kind !== "short-bundle") throw new Error("expected a short bundle");
    expect(Object.keys(short.sections)).toHaveLength(11);
    expect("planningApplications" in short.sections).toBe(false);
  });

  it("the section asserts no absence: no line offers our own search or claims none exist", async () => {
    const cases = [
      [ENG_HOME, "CM3 2JT"],
      [WAL_HOME, "CF11 8AA"],
      [SCO_HOME, "EH1 1AA"],
      [NI_HOME, "BT1 1AA"],
      [MID_ULSTER_HOME, "BT45 6EB"],
    ] as const;
    for (const [resolution, postcode] of cases) {
      const bundle = await areaBundle(new MatrixAreaSource(), resolution);
      const planning = bundle.sections.planningApplications;
      const text = `${planning.line} ${planning.link?.label ?? ""}`.toLowerCase();
      for (const banned of [
        "check planning applications",
        "search planning applications here",
        "view applications",
        "no planning applications",
        "none found",
      ])
        expect(text).not.toContain(banned);
      if (planning.link) expect(planning.link.url).not.toContain(postcode);
    }
  });
});

// ------------------------------------------------------------------
// Company ownership: the flag-gated family (M6.13, D32)
// ------------------------------------------------------------------

const CCOD_SOURCE_M =
  "HM Land Registry — UK companies that own property in England and Wales (CCOD)";
const OCOD_SOURCE_M =
  "HM Land Registry — Overseas companies that own property in England and Wales (OCOD)";

function matrixTitle(
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
    sourceName: CCOD_SOURCE_M,
    sourceDate: "2026-11-01",
    ...partial,
  };
}

const SAGE_TITLES_M: CompanyTitleRow[] = [
  matrixTitle({
    titleNumber: "AA53500",
    propertyAddress: "39, 41 and, 49 Birkdale Rise, Hatfield Peverel, Chelmsford (CM3 2JT)",
    proprietorName: "SAGE HOMES RP LIMITED",
    companyNumber: "11217910",
  }),
  matrixTitle({
    titleNumber: "AA53502",
    propertyAddress:
      "35, 37, 43, 45, 47 And 32 To 44 (inclusive), Birkdale Rise, Hatfield Peverel, Chelmsford (CM3 2JT)",
    proprietorName: "SAGE HOMES RP LIMITED",
    companyNumber: "11217910",
  }),
];

const MINERVA_DIR_M = directory({
  postcode: "KT17 1FH",
  latitude: 51.344571,
  longitude: -0.247104,
  council: "Epsom and Ewell",
  lsoaCode: "E01030396",
  msoaCode: "E02006837",
});
const MINERVA_HOME_M = home(MINERVA_DIR_M, {
  paon: "MINERVA HOUSE, 12",
  saon: "FLAT 4",
  street: "CERES CRESCENT",
  label: "Flat 4, Minerva House, 12 Ceres Crescent",
});

async function areaBundleOn(source: MatrixAreaSource, resolution: AddressResolution = ENG_HOME) {
  const bundle = await buildAreaBundle(resolution, source, { companyOwnershipEnabled: true });
  if (bundle.kind !== "area-bundle") throw new Error("expected an area bundle");
  return bundle;
}

describe("matrix — area: company ownership (behind the flag)", () => {
  it("flag OFF (the shipped position): the section is absent from the full bundle — no key, no state, no wording", async () => {
    const bundle = await areaBundle(new MatrixAreaSource(), ENG_HOME);
    expect("companyOwnership" in bundle.sections).toBe(false);
    expect(JSON.stringify(bundle)).not.toContain("companyOwnership");
    expectClean(bundle);
  });

  it("served: an own-title match serves the proprietor as filed, with its snapshot", async () => {
    const source = new MatrixAreaSource();
    source.company.titles = [
      matrixTitle({
        titleNumber: "AA99999",
        propertyAddress: "19 Birkdale Rise, Hatfield Peverel, Chelmsford (CM3 2JT)",
        proprietorName: "EXAMPLE HOMES LIMITED",
        companyNumber: "99999999",
      }),
    ];
    source.company.snapshots = {
      "99999999": {
        companyNumber: "99999999",
        companyName: "EXAMPLE HOMES LIMITED",
        status: "Active",
        incorporationDate: "2020-01-01",
        sicCodes: ["68100 - Buying and selling of own real estate"],
        sourceName: "Companies House — Free Company Data Product",
        sourceDate: "2026-11-01",
      },
    };
    const bundle = await areaBundleOn(source, ENG_HOME);
    const company = bundle.sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("served");
    expect(company.line).toBe("a registered proprietor of this home's title is a company");
    expect(company.ownTitles).toHaveLength(1);
    expect(company.ownTitles[0].titleNumber).toBe("AA99999");
    expect(company.ownTitles[0].numberState).toBe("recorded");
    expect(company.depth).toBe("report");
    expectClean(bundle);
  });

  it("not-company-owned: the No over a non-empty slice, dated by the dataset month, its holes in the explainer", async () => {
    const source = new MatrixAreaSource();
    source.company.titles = SAGE_TITLES_M;
    const bundle = await areaBundleOn(source, ENG_HOME);
    const company = bundle.sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("not-company-owned");
    expect(company.line).toBe(
      "this home's title is not in HM Land Registry's company-ownership data as at November 2026",
    );
    expect(company.explainer).toContain("charities are excluded from both datasets by category");
    expect(company.explainer).toContain("unregistered");
    expect(company.explainer).toContain("still being registered");
    expect(company.attributionLine).toBe(
      "Information produced by HM Land Registry © Crown copyright 2026",
    );
    expectClean(bundle);
  });

  it("the building line: a flat's building title serves separately, named, never as the flat's own", async () => {
    const source = new MatrixAreaSource();
    source.company.titles = [
      matrixTitle({
        titleNumber: "SY876459",
        dataset: "ocod",
        propertyAddress: "Flats 1-9 Minerva House, 12 Ceres Crescent, Epsom (KT17 1FH)",
        proprietorName: "ADRIATIC LAND 11 LIMITED",
        countryIncorporated: "GUERNSEY",
        sourceName: OCOD_SOURCE_M,
      }),
    ];
    const bundle = await areaBundleOn(source, MINERVA_HOME_M);
    const company = bundle.sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("not-company-owned");
    expect(company.ownTitles).toEqual([]);
    expect(company.buildingTitles.map((t) => t.titleNumber)).toEqual(["SY876459"]);
    expect(company.buildingTitles[0].numberState).toBe("no-number-recorded");
    expect(company.buildingLine).toContain("separate title");
    expectClean(bundle);
  });

  it("needs-exact-home at rung 2, with no title payload", async () => {
    const bundle = await areaBundleOn(new MatrixAreaSource(), addressList(ENG_DIR));
    const company = bundle.sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("needs-exact-home");
    expect(company.line).toBe(
      "choose the exact home to see whether a company is a registered proprietor of its title",
    );
    expect(company.ownTitles).toEqual([]);
    expect(company.buildingTitles).toEqual([]);
    expectClean(bundle);
  });

  it("not-covered: Scotland and Northern Ireland name their own registers — never a No", async () => {
    const scotland = (await areaBundleOn(new MatrixAreaSource(), SCO_HOME)).sections
      .companyOwnership;
    if (!scotland) throw new Error("expected the section");
    expect(scotland.state).toBe("not-covered");
    expect(scotland.line).toContain("Registers of Scotland");
    const ni = (await areaBundleOn(new MatrixAreaSource(), NI_HOME)).sections.companyOwnership;
    if (!ni) throw new Error("expected the section");
    expect(ni.state).toBe("not-covered");
    expect(ni.line).toContain("Land & Property Services");
  });

  it("not-filed: an unfiled dataset serves the not-filed family, never a No", async () => {
    const source = new MatrixAreaSource();
    source.company.ocodFiledCount = 0;
    source.company.titles = SAGE_TITLES_M;
    const bundle = await areaBundleOn(source, ENG_HOME);
    const company = bundle.sections.companyOwnership;
    if (!company) throw new Error("expected the section");
    expect(company.state).toBe("not-filed");
    expect(company.line).toBe(
      "the company-ownership data is not filed yet, so no company-ownership answer can be given yet",
    );
    expectClean(bundle);
  });

  it("rung 3 in the flag-on position: the thirteenth per-section reason joins the record", async () => {
    const bundle = await buildAreaBundle(
      { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area — CM3", postcodeCount: 1 },
      new MatrixAreaSource(),
      { companyOwnershipEnabled: true },
    );
    if (bundle.kind !== "wider-area") throw new Error("expected wider-area");
    expect(Object.keys(bundle.area.sections)).toHaveLength(13);
    expect(bundle.area.sections.companyOwnership).toEqual({
      state: "unavailable",
      reason: "company ownership needs an exact postcode",
    });
  });

  it("the section never reaches the short bundle, in either flag position", async () => {
    const { short } = await shortFor(ENG_HOME, new MatrixAreaSource(), headlineNearby());
    if (short.kind !== "short-bundle") throw new Error("expected a short bundle");
    expect(Object.keys(short.sections)).toHaveLength(11);
    expect("companyOwnership" in short.sections).toBe(false);

    const soldSource = new MatrixSoldPricesSource();
    soldSource.rows.set("CM3 2JT", [
      sale({ price: 100000, saleDate: "2001-01-05" }),
      sale({ price: 200000, saleDate: "2005-02-05" }),
      sale({ price: 300000, saleDate: "2010-03-05" }),
      sale({ price: 400000, saleDate: "2015-04-05" }),
      sale({ price: 588995, saleDate: "2023-06-15" }),
    ]);
    const crimeSource = new MatrixCrimeSource();
    crimeSource.artefacts.set("CM3 2JT", crimeArtefact(3));
    const [nearbyBundle, soldPrices, crime, flood, areaOn] = await Promise.all([
      buildNearbyBundle(ENG_HOME, headlineNearby()),
      buildSoldPricesBundle(ENG_HOME, soldSource),
      buildCrimeBundle(ENG_HOME, crimeSource, { now: CRIME_NOW }),
      buildFloodBundle(ENG_HOME, new MatrixFloodSource()),
      areaBundleOn(new MatrixAreaSource(), ENG_HOME),
    ]);
    const shortOn = buildShortBundle({
      nearby: nearbyBundle,
      soldPrices,
      crime,
      flood,
      area: areaOn,
    });
    if (shortOn.kind !== "short-bundle") throw new Error("expected a short bundle");
    expect(Object.keys(shortOn.sections)).toHaveLength(11);
    expect("companyOwnership" in shortOn.sections).toBe(false);
    expect(JSON.stringify(shortOn)).not.toContain("companyOwnership");
  });

  it("the register's address text is absent from every served shape", async () => {
    const source = new MatrixAreaSource();
    source.company.titles = SAGE_TITLES_M;
    const bundle = await areaBundleOn(source, ENG_HOME);
    const json = JSON.stringify(bundle.sections.companyOwnership);
    for (const fragment of ["HATFIELD PEVEREL", "CHELMSFORD", "Birkdale Rise,"])
      expect(json).not.toContain(fragment);
  });
});
