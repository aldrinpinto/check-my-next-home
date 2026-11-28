import { describe, expect, it } from "vitest";
import type { AddressResolution, DirectoryPostcode } from "../lib/address";
import {
  CURRENT_SOP_EXPLAINER,
  DEFENCES_LIST_CAP,
  DESIGN_SOP_EXPLAINER,
  FLOOD_BAND_DEFINITIONS,
  FLOOD_CLIMATE_BASIS_LINE,
  FLOOD_CLIMATE_CAVEAT_LINE,
  FLOOD_CLIMATE_HEADING,
  FLOOD_DEFENCES_BRIDGE,
  FLOOD_DEFENCES_CAVEAT,
  FLOOD_DEFENCES_NONE_LINE,
  FLOOD_DEFENCES_NOT_FILED_LINE,
  FLOOD_DEFENCES_TITLE,
  FLOOD_HOW_WE_CHECK,
  FLOOD_WARNING_ATTRIBUTION,
  FLOOD_WARNING_LINK,
  FLOOD_ZONE_1_DEFINITION,
  FLOOD_ZONE_DEFINITIONS,
  ROFRS_CC_SCENARIO_LINE,
  ROFSW_CC_SCENARIO_LINE,
  buildFloodBundle,
  buildFloodMaps,
  createFloodSource,
  createFloodWarningSource,
  floodMapFrame,
  parseFloodWarningItems,
  type FloodBundle,
  type FloodDataSource,
  type FloodDefenceRow,
  type FloodDefencesBlock,
  type FloodDefencesFacts,
  type FloodClimateFacts,
  type FloodClimateLayerType,
  type FloodLayerFacts,
  type FloodLayerType,
  type FloodWarningItem,
  type ServedClimateOutlook,
  type ServedFloodLayer,
} from "../lib/flood";
import {
  BURE_ITEM,
  BURE_RAW,
  LAPSED_ITEM,
  LEADON_ITEM,
  LEADON_RAW,
  WARNING_NOW,
  FakeFloodWarningSource,
} from "./flood-warning-fixtures";
import { BANNED_WORDING } from "./banned-wording";

// Flood in the brain (plan step M6.5, decision D25).
//
// The answer is computed from the shapes filed at M5.1 into
// flood_layers — three Environment Agency products that are
// never merged: the planning zones (drawn as if flood defences
// did not exist), the rivers & sea likelihood bands (defences
// counted) and the surface water bands. Every statement is
// about the POSTCODE POINT on the published map, never about
// the home. Rung 1 and rung 2 serve the identical answer; rung
// 3 carries only the named state; Wales, Scotland and Northern
// Ireland carry the named not-covered state, detected from the
// resolution's filed lsoa_code — never from outward letters.
//
// The fake facts below are the rehearsal-measured facts: a
// scoped filing of the filed shapes around the golden points
// (all three layers read live from the EA services into a
// local PostGIS) read back through the real database source,
// with every distance a PostGIS geography distance from the
// filed shapes — the serving basis. The loaders' planar pins
// (degrees of latitude x 69.05) differ slightly; the
// divergences are named in tests/golden-matrix.md ("Flood in
// the brain (M6.5)"), which also records why the filing is
// scoped and what is owed to CI.

// --- the filed facts, as measured from the scoped filing ----

const ZONES_SOURCE = "Environment Agency — Flood Map for Planning (Flood Zones 2 and 3)";
const ROFRS_SOURCE = "Environment Agency — Risk of Flooding from Rivers and Sea";
const ROFSW_SOURCE = "Environment Agency — Risk of Flooding from Surface Water";

function facts(
  partial: Partial<FloodLayerFacts> & { sourceName: string; sourceDate: string },
): FloodLayerFacts {
  return {
    filedCount: 1000,
    covering: [],
    nearestWithin: [],
    nearestBeyond: null,
    ...partial,
  };
}

// Keyed by "lat,lon" — the flood source reads by point, not by
// postcode. Values are the rehearsal's geography-basis reads.
const FACTS = new Map<string, Record<FloodLayerType, FloodLayerFacts>>();

function fileFacts(directory: DirectoryPostcode, layers: Record<FloodLayerType, FloodLayerFacts>) {
  FACTS.set(`${directory.latitude},${directory.longitude}`, layers);
}

// The defences facts (M6.27), keyed the same way; a point
// with no entry reads the unfiled table.
const DEFENCES = new Map<string, FloodDefencesFacts>();

function fileDefences(directory: DirectoryPostcode, facts: FloodDefencesFacts) {
  DEFENCES.set(`${directory.latitude},${directory.longitude}`, facts);
}

const NO_DEFENCES: FloodDefencesFacts = {
  filedCount: 0,
  totalWithin: 0,
  sourceName: null,
  sourceDate: null,
  defences: [],
};

// The climate facts (M6.28), keyed the same way; a point
// with no entry reads both scenario layers unfiled.
const CLIMATE = new Map<string, Record<FloodClimateLayerType, FloodClimateFacts>>();

function fileClimate(
  directory: DirectoryPostcode,
  layers: Record<FloodClimateLayerType, FloodClimateFacts>,
) {
  CLIMATE.set(`${directory.latitude},${directory.longitude}`, layers);
}

const NO_CLIMATE: FloodClimateFacts = {
  filedCount: 0,
  coveringLabel: null,
  sourceName: null,
  sourceDate: null,
};

class FakeFloodSource implements FloodDataSource {
  async layerFacts(layer: FloodLayerType, latitude: number, longitude: number) {
    const record = FACTS.get(`${latitude},${longitude}`);
    if (!record) throw new Error(`no fake facts for ${latitude},${longitude}`);
    return record[layer];
  }
  async defencesNear(latitude: number, longitude: number) {
    return DEFENCES.get(`${latitude},${longitude}`) ?? NO_DEFENCES;
  }
  async climateFacts(layer: FloodClimateLayerType, latitude: number, longitude: number) {
    return CLIMATE.get(`${latitude},${longitude}`)?.[layer] ?? NO_CLIMATE;
  }
  // M8.3: no map geometry in this fake world — the maps
  // sibling serves its empty form (no streets filed, so
  // no picture is drawn).
  async mapFacts() {
    return { polygons: [], streets: [], homeStreet: null };
  }
}

const source = new FakeFloodSource();

// --- directories and resolutions ------------------------------

function directory(
  postcode: string,
  latitude: number,
  longitude: number,
  lsoaCode: string | null,
): DirectoryPostcode {
  return {
    postcode,
    latitude,
    longitude,
    council: null,
    ward: null,
    region: null,
    lsoaCode,
    msoaCode: null,
  };
}

const BIRKDALE = directory("CM3 2JT", 51.776176, 0.60387, "E01021395");
const EXETER = directory("E16 1GN", 51.515224, 0.021177, "E01003511");
const EPSOM = directory("KT17 1FH", 51.344571, -0.247104, "E01030396");
const OXFORD = directory("OX1 1HD", 51.751268, -1.264073, "E01028521");
const CITYISLAND = directory("E14 0BZ", 51.511184, 0.005102, "E01035702");
const KINGSTON = directory("KT1 1JS", 51.409811, -0.306243, "E01002968");
const HIGHLAVER = directory("CM5 0DR", 51.749133, 0.214797, "E01021796");
const HILGAY = directory("CB6 1EH", 52.507481, 0.33491, "E01026679");

// The rehearsal-measured facts (scoped filing of the filed
// shapes around the golden points, read back through the real
// database source on the PostGIS geography basis — see
// tests/golden-matrix.md, "Flood in the brain (M6.5)").
fileFacts(BIRKDALE, {
  flood_zone: facts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    nearestWithin: [
      { riskLabel: "FZ2", detail: "river · direct rainfall model", miles: 0.841 },
      { riskLabel: "FZ3", detail: "river · modelled", miles: 0.845 },
    ],
  }),
  rofrs: facts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.841 },
      { riskLabel: "High", detail: ">0 m", miles: 0.845 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.845 },
      { riskLabel: "Very low", detail: ">0 m", miles: 1.307 },
    ],
  }),
  rofsw: facts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.03 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.032 },
      { riskLabel: "High", detail: ">0 m", miles: 0.079 },
    ],
  }),
});
fileFacts(EXETER, {
  flood_zone: facts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    covering: [{ riskLabel: "FZ3", detail: "river and sea · modelled" }],
    nearestWithin: [{ riskLabel: "FZ2", detail: "river · modelled", miles: 0.138 }],
  }),
  rofrs: facts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    covering: [{ riskLabel: "Very low", detail: ">0 m" }],
    nearestWithin: [
      { riskLabel: "High", detail: ">0 m", miles: 0.159 },
      { riskLabel: "Low", detail: ">0 m", miles: 0.497 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.741 },
    ],
  }),
  rofsw: facts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.005 },
      { riskLabel: "High", detail: ">0 m", miles: 0.016 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.017 },
    ],
  }),
});
fileFacts(EPSOM, {
  flood_zone: facts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    nearestWithin: [
      { riskLabel: "FZ2", detail: "river · modelled", miles: 0.404 },
      { riskLabel: "FZ3", detail: "river · modelled", miles: 0.412 },
    ],
  }),
  rofrs: facts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.404 },
      { riskLabel: "High", detail: ">0 m", miles: 0.412 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.412 },
    ],
  }),
  rofsw: facts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    covering: [{ riskLabel: "Low", detail: ">0 m" }],
    nearestWithin: [
      { riskLabel: "Medium", detail: ">0 m", miles: 0.007 },
      { riskLabel: "High", detail: ">0 m", miles: 0.028 },
    ],
  }),
});
fileFacts(OXFORD, {
  flood_zone: facts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    covering: [{ riskLabel: "FZ3", detail: "river · modelled" }],
    nearestWithin: [{ riskLabel: "FZ2", detail: "river · modelled", miles: 0.002 }],
  }),
  rofrs: facts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    covering: [{ riskLabel: "Medium", detail: ">0 m" }],
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.002 },
      { riskLabel: "High", detail: ">0 m", miles: 0.003 },
    ],
  }),
  rofsw: facts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.002 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.011 },
      { riskLabel: "High", detail: ">0 m", miles: 0.027 },
    ],
  }),
});
fileFacts(CITYISLAND, {
  flood_zone: facts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    covering: [{ riskLabel: "FZ3", detail: "river and sea · modelled and recorded" }],
    nearestWithin: [{ riskLabel: "FZ2", detail: "river · recorded", miles: 0.051 }],
  }),
  rofrs: facts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    nearestWithin: [
      { riskLabel: "Very low", detail: ">0 m", miles: 0.001 },
      { riskLabel: "High", detail: ">0 m", miles: 0.013 },
      { riskLabel: "Low", detail: ">0 m", miles: 0.014 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.113 },
    ],
  }),
  rofsw: facts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.022 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.023 },
      { riskLabel: "High", detail: ">0 m", miles: 0.025 },
    ],
  }),
});
fileFacts(KINGSTON, {
  flood_zone: facts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    covering: [{ riskLabel: "FZ2", detail: "river · modelled" }],
    nearestWithin: [{ riskLabel: "FZ3", detail: "river · modelled", miles: 0.016 }],
  }),
  rofrs: facts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    covering: [{ riskLabel: "Low", detail: ">0 m" }],
    nearestWithin: [
      { riskLabel: "Medium", detail: ">0 m", miles: 0.016 },
      { riskLabel: "Very low", detail: ">0 m", miles: 0.042 },
      { riskLabel: "High", detail: ">0 m", miles: 0.046 },
    ],
  }),
  rofsw: facts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    nearestWithin: [
      { riskLabel: "Medium", detail: ">0 m", miles: 0.025 },
      { riskLabel: "High", detail: ">0 m", miles: 0.027 },
      { riskLabel: "Low", detail: ">0 m", miles: 0.032 },
    ],
  }),
});
fileFacts(HIGHLAVER, {
  flood_zone: facts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    nearestWithin: [
      { riskLabel: "FZ2", detail: "river · modelled", miles: 0.001 },
      { riskLabel: "FZ3", detail: "river · modelled", miles: 0.01 },
    ],
  }),
  rofrs: facts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.001 },
      { riskLabel: "High", detail: ">0 m", miles: 0.01 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.01 },
      { riskLabel: "Very low", detail: ">0 m", miles: 0.493 },
    ],
  }),
  rofsw: facts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.007 },
      { riskLabel: "High", detail: ">0 m", miles: 0.012 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.012 },
    ],
  }),
});
fileFacts(HILGAY, {
  flood_zone: facts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    covering: [{ riskLabel: "FZ3", detail: "river · modelled" }],
    nearestWithin: [{ riskLabel: "FZ2", detail: "river · modelled", miles: 1.33 }],
  }),
  rofrs: facts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    covering: [{ riskLabel: "Low", detail: ">0 m" }],
    nearestWithin: [
      { riskLabel: "Medium", detail: ">0 m", miles: 0.241 },
      { riskLabel: "High", detail: ">0 m", miles: 0.64 },
      { riskLabel: "Very low", detail: ">0 m", miles: 1.29 },
    ],
  }),
  rofsw: facts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.003 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.005 },
      { riskLabel: "High", detail: ">0 m", miles: 0.031 },
    ],
  }),
});

function rung1(dir: DirectoryPostcode): AddressResolution {
  return {
    rung: 1,
    kind: "home",
    directory: dir,
    address: {
      postcode: dir.postcode,
      paon: "1",
      saon: null,
      street: null,
      locality: null,
      town: null,
      label: "1",
    },
  };
}

function rung2(dir: DirectoryPostcode): AddressResolution {
  return {
    rung: 2,
    kind: "address-list",
    directory: dir,
    street: null,
    building: null,
    addresses: [],
  };
}

async function served(dir: DirectoryPostcode, rung: 1 | 2 = 1): Promise<ServedFloodLayer[]> {
  const bundle = await buildFloodBundle(rung === 1 ? rung1(dir) : rung2(dir), source);
  if (bundle.kind !== "flood" || bundle.flood.state !== "served")
    throw new Error(`expected a served flood bundle, got ${bundle.kind}`);
  return bundle.flood.layers;
}

function layer(layers: ServedFloodLayer[], type: FloodLayerType): ServedFloodLayer {
  const found = layers.find((l) => l.layer === type);
  if (!found) throw new Error(`no ${type} layer`);
  return found;
}

// The filed facts for the golden postcodes are registered
// above, beside their directory entries.

describe("flood — the publisher's definitions, verified at build", () => {
  it("carries the EA's published annual-chance definitions", () => {
    expect(FLOOD_ZONE_DEFINITIONS.FZ3).toBe(
      "land having a 1 in 100 or greater annual probability of river flooding, or a 1 in 200 or greater annual probability of sea flooding",
    );
    expect(FLOOD_ZONE_DEFINITIONS.FZ2).toBe(
      "land having between a 1 in 100 and a 1 in 1,000 annual probability of river flooding, or between a 1 in 200 and a 1 in 1,000 annual probability of sea flooding",
    );
    expect(FLOOD_ZONE_1_DEFINITION).toBe(
      "land having a less than 1 in 1,000 annual probability of river or sea flooding",
    );
    expect(FLOOD_BAND_DEFINITIONS.High).toBe(
      "a 1 in 30 or greater chance of flooding in any given year",
    );
    expect(FLOOD_BAND_DEFINITIONS.Medium).toBe(
      "a chance of flooding in any given year between 1 in 100 and 1 in 30",
    );
    expect(FLOOD_BAND_DEFINITIONS.Low).toBe(
      "a chance of flooding in any given year between 1 in 1,000 and 1 in 100",
    );
    expect(FLOOD_BAND_DEFINITIONS["Very low"]).toBe(
      "a chance of flooding in any given year of less than 1 in 1,000",
    );
  });
});

describe("flood — ladder rungs (D25)", () => {
  it("serves the IDENTICAL answer at rung 1 and rung 2", async () => {
    const one = await buildFloodBundle(rung1(BIRKDALE), source);
    const two = await buildFloodBundle(rung2(BIRKDALE), source);
    if (one.kind !== "flood" || two.kind !== "flood") throw new Error("expected flood bundles");
    expect(one.rung).toBe(1);
    expect(two.rung).toBe(2);
    expect(two.flood).toEqual(one.flood);
    // The wording never attaches the answer to the home itself.
    const serialised = JSON.stringify(one);
    expect(serialised).not.toContain("this home");
    expect(serialised).not.toContain("your home");
  });

  it("returns NO flood payload at rung 3 — the named state only", async () => {
    const bundle = await buildFloodBundle(
      {
        rung: 3,
        kind: "wider-area",
        outward: "CM3",
        label: "Wider area — CM3, not this exact home",
        postcodeCount: 100,
      },
      source,
    );
    expect(bundle).toEqual({
      rung: 3,
      kind: "wider-area",
      flood: { state: "unavailable", reason: "Flood answers need an exact postcode" },
    });
    const serialised = JSON.stringify(bundle);
    expect(serialised).not.toContain("Flood Zone");
    expect(serialised).not.toContain("likelihood");
    expect(serialised).not.toContain("miles");
  });

  it("returns the no-location state at rung 4", async () => {
    const bundle = await buildFloodBundle({ rung: 4, kind: "no-location" }, source);
    expect(bundle).toEqual({
      rung: 4,
      kind: "no-location",
      flood: { state: "unavailable", reason: "Flood answers need an exact postcode" },
    });
  });
});

describe("flood — coverage (England only, from the filed area code)", () => {
  it("gives a Welsh postcode the named not-covered state — and NOT any layer's absence", async () => {
    const cardiff = directory("CF11 8AA", 51.467947, -3.192837, "W01001759");
    const bundle = await buildFloodBundle(rung2(cardiff), source);
    expect(bundle.kind).toBe("not-covered");
    if (bundle.kind !== "not-covered") throw new Error("expected not-covered");
    expect(bundle.flood.reason).toContain("Wales");
    expect(bundle.flood.reason).toContain("Natural Resources Wales");
    // The Wales trap: an unguarded lookup would find no shapes
    // and print an absence. None of the three absence wordings
    // may appear.
    const serialised = JSON.stringify(bundle);
    expect(serialised).not.toContain("not in Flood Zone 2 or Flood Zone 3");
    expect(serialised).not.toContain("no likelihood band is published");
    expect(serialised).not.toContain("no surface-water band reaches");
    expect(serialised).not.toContain("Flood Zone 1");
  });

  it("gives a Scottish postcode the named not-covered state", async () => {
    const edinburgh = directory("EH1 1YZ", 55.950328, -3.193018, "S01014710");
    const bundle = await buildFloodBundle(rung1(edinburgh), source);
    expect(bundle.kind).toBe("not-covered");
    if (bundle.kind !== "not-covered") throw new Error("expected not-covered");
    expect(bundle.flood.reason).toContain("Scotland");
  });

  it("gives a Northern Ireland postcode the named not-covered state", async () => {
    const belfast = directory("BT1 1AA", 54.602438, -5.922291, "N21000192");
    const bundle = await buildFloodBundle(rung2(belfast), source);
    expect(bundle.kind).toBe("not-covered");
    if (bundle.kind !== "not-covered") throw new Error("expected not-covered");
    expect(bundle.flood.reason).toContain("Northern Ireland");
  });

  it("does not use outward letters: a border-straddling English postcode still serves", async () => {
    // SY and CH straddle the Welsh border; coverage follows the
    // filed area code, so an English SY postcode (E…) serves.
    // SY1 1AD is a real Shrewsbury postcode in the directory.
    const shrewsbury = directory("SY1 1AD", 52.705472, -2.750596, "E01035061");
    FACTS.set(
      "52.705472,-2.750596",
      FACTS.get("51.776176,0.60387") as Record<FloodLayerType, FloodLayerFacts>,
    );
    const bundle = await buildFloodBundle(rung2(shrewsbury), source);
    expect(bundle.kind).toBe("flood");
  });
});

describe("flood — a layer with no filing serves its not-filed state, never an absence", () => {
  it("serves not-filed for the empty layer while the filed layers answer normally", async () => {
    const partial = directory("XX1 1XX", 51.5, 0.5, "E01000001");
    fileFacts(partial, {
      flood_zone: facts({ sourceName: ZONES_SOURCE, sourceDate: "2026-10-21" }),
      rofrs: facts({ sourceName: ROFRS_SOURCE, sourceDate: "2026-11-03" }),
      rofsw: {
        filedCount: 0,
        covering: [],
        nearestWithin: [],
        nearestBeyond: null,
        sourceName: null,
        sourceDate: null,
      },
    });
    const layers = await served(partial, 2);
    expect(layer(layers, "flood_zone").pointState).toBe("zone-1");
    const rofsw = layer(layers, "rofsw");
    expect(rofsw.pointState).toBe("not-filed");
    expect(rofsw.line).toContain("not filed yet");
    expect(rofsw.sourceLine).toBeNull();
  });
});

describe("flood — the beyond form (nothing within the radius)", () => {
  it("serves 'None within 2 miles — nearest is…' with the single nearest edge", async () => {
    const remote = directory("XX2 2XX", 52.5, -1.5, "E01000002");
    fileFacts(remote, {
      flood_zone: facts({
        sourceName: ZONES_SOURCE,
        sourceDate: "2026-10-21",
        nearestBeyond: { riskLabel: "FZ2", detail: "river · modelled", miles: 4.3174 },
      }),
      rofrs: facts({
        sourceName: ROFRS_SOURCE,
        sourceDate: "2026-11-03",
        nearestBeyond: { riskLabel: "Low", detail: ">0 m", miles: 4.3174 },
      }),
      rofsw: facts({
        sourceName: ROFSW_SOURCE,
        sourceDate: "2026-11-10",
        nearestWithin: [{ riskLabel: "Low", detail: ">0 m", miles: 1.2344 }],
      }),
    });
    const layers = await served(remote, 2);
    const zones = layer(layers, "flood_zone");
    expect(zones.proximity).toEqual([]);
    expect(zones.beyondNearest).toEqual({ displayLabel: "Flood Zone 2", miles: 4.317 });
    expect(zones.beyondLine).toBe(
      "None within 2 miles — the nearest mapped edge is Flood Zone 2, 4.317 miles away",
    );
    // A layer with a band inside the radius serves proximity
    // and no beyond entry.
    const rofsw = layer(layers, "rofsw");
    expect(rofsw.proximity).toHaveLength(1);
    expect(rofsw.beyondNearest).toBeNull();
    expect(rofsw.beyondLine).toBeNull();
  });
});

describe("flood — the database source", () => {
  it("reads covering shapes, per-label nearest edges and the edition from flood_layers", async () => {
    const seen: string[] = [];
    const db = {
      async query(text: string) {
        seen.push(text);
        if (text.includes("LIMIT 1"))
          return { rows: [{ source_name: ZONES_SOURCE, source_date: "2026-10-21" }] };
        if (text.includes("count(*)")) return { rows: [{ n: 415408 }] };
        if (text.includes("ST_Covers"))
          return { rows: [{ risk_label: "FZ3", detail: "river and sea · modelled" }] };
        if (text.includes("DISTINCT ON")) {
          // One label inside the radius, one beyond it: the
          // source's own radius cut keeps only the first.
          return {
            rows: [
              { risk_label: "FZ2", detail: "river · modelled", miles: 1.25 },
              { risk_label: "FZ3", detail: "sea · modelled", miles: 2.4 },
            ],
          };
        }
        throw new Error(`unexpected query: ${text}`);
      },
    };
    const dbSource = createFloodSource(db);
    const result = await dbSource.layerFacts("flood_zone", 51.515224, 0.021177);
    expect(result.filedCount).toBe(415408);
    expect(result.covering).toEqual([{ riskLabel: "FZ3", detail: "river and sea · modelled" }]);
    expect(result.nearestWithin).toEqual([
      { riskLabel: "FZ2", detail: "river · modelled", miles: 1.25 },
    ]);
    // A covering point never triggers the beyond search.
    expect(result.nearestBeyond).toBeNull();
    expect(result.sourceName).toBe(ZONES_SOURCE);
    expect(result.sourceDate).toBe("2026-10-21");
    expect(seen.some((q) => q.includes("ST_DWithin"))).toBe(true);
    expect(seen.some((q) => q.includes("geom::geography"))).toBe(true);
  });

  it("searches outward in bounded steps for the beyond edge when nothing is within the radius", async () => {
    let distinctOnCalls = 0;
    const db = {
      async query(text: string) {
        if (text.includes("LIMIT 1"))
          return { rows: [{ source_name: ROFRS_SOURCE, source_date: "2026-11-03" }] };
        if (text.includes("count(*)")) return { rows: [{ n: 249019 }] };
        if (text.includes("ST_Covers")) return { rows: [] };
        if (text.includes("DISTINCT ON")) {
          distinctOnCalls += 1;
          // The 2-mile read and the 5-mile step find nothing the
          // brain can use; the 10-mile step finds the edge.
          if (distinctOnCalls < 3) return { rows: [] };
          return { rows: [{ risk_label: "Low", detail: ">0 m", miles: 7.5 }] };
        }
        throw new Error(`unexpected query: ${text}`);
      },
    };
    const dbSource = createFloodSource(db);
    const result = await dbSource.layerFacts("rofrs", 52.5, -1.5);
    expect(result.nearestWithin).toEqual([]);
    expect(result.nearestBeyond).toEqual({ riskLabel: "Low", detail: ">0 m", miles: 7.5 });
    expect(distinctOnCalls).toBe(3);
  });

  it("short-circuits an unfiled layer: no geometry queries are issued", async () => {
    const seen: string[] = [];
    const db = {
      async query(text: string) {
        seen.push(text);
        if (text.includes("LIMIT 1")) return { rows: [] };
        if (text.includes("count(*)")) return { rows: [{ n: 0 }] };
        throw new Error(`unexpected query: ${text}`);
      },
    };
    const dbSource = createFloodSource(db);
    const result = await dbSource.layerFacts("rofsw", 51.5, 0.5);
    expect(result.filedCount).toBe(0);
    expect(seen).toHaveLength(2);
  });
});

describe("flood — the golden homes (measured on the serving basis)", () => {
  const prox = (l: ServedFloodLayer) => l.proximity.map((p) => [p.label, p.miles]);

  it("Birkdale CM3 2JT: three absences, three DISTINCT states on one home", async () => {
    const layers = await served(BIRKDALE);
    const zones = layer(layers, "flood_zone");
    const rofrs = layer(layers, "rofrs");
    const rofsw = layer(layers, "rofsw");
    expect(zones.pointState).toBe("zone-1");
    expect(rofrs.pointState).toBe("no-band-published");
    expect(rofsw.pointState).toBe("below-lowest-band");
    expect(new Set([zones.pointState, rofrs.pointState, rofsw.pointState]).size).toBe(3);
    expect(new Set([zones.line, rofrs.line, rofsw.line]).size).toBe(3);
    expect(zones.line).toBe(
      "The postcode point is not in Flood Zone 2 or Flood Zone 3 on the Environment Agency's planning map",
    );
    expect(zones.remainder?.displayLabel).toBe("Flood Zone 1");
    expect(zones.remainder?.detail).toBeNull();
    expect(prox(zones)).toEqual([
      ["FZ2", 0.841],
      ["FZ3", 0.845],
    ]);
    // BUG-343: the rivers & sea absence reads as Very low
    // — the free pill's band — with its source (below the
    // lowest band the Agency publishes), never as "no band
    // is published". The point state stays
    // "no-band-published": the three absences stay three
    // distinct states.
    expect(rofrs.line).toBe(
      "the postcode point is below the lowest band the Environment Agency publishes on its map of flooding from rivers and the sea — Very low",
    );
    expect(prox(rofrs)).toEqual([
      ["Low", 0.841],
      ["High", 0.845],
      ["Medium", 0.845],
      ["Very low", 1.307],
    ]);
    expect(rofsw.line).toBe(
      "No surface-water band reaches this point — below the lowest band this product publishes",
    );
    expect(prox(rofsw)).toEqual([
      ["Low", 0.03],
      ["Medium", 0.032],
      ["High", 0.079],
    ]);
  });

  it("Exeter E16 1GN: the composition home, asserted WHOLE in one bundle", async () => {
    const bundle = await buildFloodBundle(rung1(EXETER), source);
    if (bundle.kind !== "flood" || bundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    const layers = bundle.flood.layers;
    const zones = layer(layers, "flood_zone");
    expect(zones.pointState).toBe("inside");
    expect(zones.covering?.label).toBe("FZ3");
    // The covering feature's published detail, exactly.
    expect(zones.covering?.detail).toBe("river and sea · modelled");
    expect(zones.line).toBe(
      "the postcode point falls inside Flood Zone 3 on the Environment Agency's planning map",
    );
    expect(prox(zones)).toEqual([["FZ2", 0.138]]);
    const rofrs = layer(layers, "rofrs");
    // A FILED "Very low" polygon covers the point — a filed
    // band, never an absence dressed as one.
    expect(rofrs.pointState).toBe("inside");
    expect(rofrs.covering?.label).toBe("Very low");
    expect(prox(rofrs)).toEqual([
      ["High", 0.159],
      ["Low", 0.497],
      ["Medium", 0.741],
    ]);
    const rofsw = layer(layers, "rofsw");
    expect(rofsw.pointState).toBe("below-lowest-band");
    expect(rofsw.covering).toBeNull();
    expect(prox(rofsw)).toEqual([
      ["Low", 0.005],
      ["High", 0.016],
      ["Medium", 0.017],
    ]);
    // Each layer carries its OWN source line and edition (D9).
    expect(zones.sourceLine).toBe(
      "Environment Agency — Flood Map for Planning (Flood Zones 2 and 3) — data to 21 October 2026",
    );
    expect(rofrs.sourceLine).toBe(
      "Environment Agency — Risk of Flooding from Rivers and Sea — data to 3 November 2026",
    );
    expect(rofsw.sourceLine).toBe(
      "Environment Agency — Risk of Flooding from Surface Water — data to 10 November 2026",
    );
  });

  it("Epsom KT17 1FH: surface-water Low AT the point, Medium 0.007 away", async () => {
    const layers = await served(EPSOM);
    const zones = layer(layers, "flood_zone");
    expect(zones.pointState).toBe("zone-1");
    expect(prox(zones)).toEqual([
      ["FZ2", 0.404],
      ["FZ3", 0.412],
    ]);
    const rofrs = layer(layers, "rofrs");
    expect(rofrs.pointState).toBe("no-band-published");
    expect(prox(rofrs)).toEqual([
      ["Low", 0.404],
      ["High", 0.412],
      ["Medium", 0.412],
    ]);
    const rofsw = layer(layers, "rofsw");
    expect(rofsw.pointState).toBe("inside");
    expect(rofsw.covering?.label).toBe("Low");
    expect(prox(rofsw)).toEqual([
      ["Medium", 0.007],
      ["High", 0.028],
    ]);
  });

  it("C7 Oxford OX1 1HD: FZ3 + rivers & sea Medium at the point; surface water Low 0.002 away", async () => {
    const layers = await served(OXFORD);
    expect(layer(layers, "flood_zone").covering?.label).toBe("FZ3");
    expect(layer(layers, "rofrs").covering?.label).toBe("Medium");
    // The M5.1 prep expected a surface-water Low AT the point
    // (WMS pixel sampling); the filed polygon puts its edge
    // 0.002 miles away, and the polygon filing is what we
    // serve — the same disagreement the prep recorded at
    // Exeter, in the other direction.
    const rofsw = layer(layers, "rofsw");
    expect(rofsw.pointState).toBe("below-lowest-band");
    expect(prox(rofsw)).toEqual([
      ["Low", 0.002],
      ["Medium", 0.011],
      ["High", 0.027],
    ]);
  });

  it("C2 City Island E14 0BZ: FZ3 at the point; the Very low edge 0.001 away, not covering", async () => {
    const layers = await served(CITYISLAND);
    const zones = layer(layers, "flood_zone");
    expect(zones.covering?.label).toBe("FZ3");
    expect(zones.covering?.detail).toBe("river and sea · modelled and recorded");
    // The prep's expected pairing was FZ3 + a filed Very low
    // covering; on the filed polygons the point sits 0.001
    // miles (about 2 m) OUTSIDE the Very low polygon, so the
    // served answer is the rivers & sea absence with the
    // Very low edge named in proximity.
    const rofrs = layer(layers, "rofrs");
    expect(rofrs.pointState).toBe("no-band-published");
    expect(prox(rofrs)).toEqual([
      ["Very low", 0.001],
      ["High", 0.013],
      ["Low", 0.014],
      ["Medium", 0.113],
    ]);
  });

  it("C4 Kingston KT1 1JS: FZ2 + rivers & sea Low at the point", async () => {
    const layers = await served(KINGSTON);
    expect(layer(layers, "flood_zone").covering?.label).toBe("FZ2");
    expect(layer(layers, "rofrs").covering?.label).toBe("Low");
    expect(prox(layer(layers, "flood_zone"))).toEqual([["FZ3", 0.016]]);
  });

  it("C3 High Laver CM5 0DR: the boundary point — the serving query lands OUTSIDE, edges 0.001 away", async () => {
    // The loader's planar pin put the point effectively ON
    // the FZ2 boundary (edge 0.001 mi). Under the brain's own
    // query semantics (ST_Covers over the filed shapes) the
    // point falls just outside both the FZ2 polygon and the
    // rivers & sea Low polygon — 0.001 miles from each edge —
    // and that is the answer served and locked here.
    const layers = await served(HIGHLAVER);
    const zones = layer(layers, "flood_zone");
    expect(zones.pointState).toBe("zone-1");
    expect(prox(zones)).toEqual([
      ["FZ2", 0.001],
      ["FZ3", 0.01],
    ]);
    const rofrs = layer(layers, "rofrs");
    expect(rofrs.pointState).toBe("no-band-published");
    expect(prox(rofrs)).toEqual([
      ["Low", 0.001],
      ["High", 0.01],
      ["Medium", 0.01],
      ["Very low", 0.493],
    ]);
  });

  it("C9 Hilgay CB6 1EH: the trio read at first load — FZ3, rivers & sea Low (the matrix GAP closes)", async () => {
    const layers = await served(HILGAY);
    expect(layer(layers, "flood_zone").covering?.label).toBe("FZ3");
    expect(layer(layers, "rofrs").covering?.label).toBe("Low");
    const rofsw = layer(layers, "rofsw");
    expect(rofsw.pointState).toBe("below-lowest-band");
    expect(prox(rofsw)).toEqual([
      ["Low", 0.003],
      ["Medium", 0.005],
      ["High", 0.031],
    ]);
  });

  it("surface-water High AT a point serves inside with the High definition", async () => {
    // No golden postcode point falls inside a filed High
    // polygon; the branch is proven against the filing
    // itself (a point-on-surface inside the filed High
    // polygon nearest the Exeter point — see the matrix) and
    // locked here at the composition seam.
    const synthetic = directory("XX3 3XX", 51.517107, 0.018839, "E01003511");
    fileFacts(synthetic, {
      flood_zone: facts({ sourceName: ZONES_SOURCE, sourceDate: "2026-10-21" }),
      rofrs: facts({ sourceName: ROFRS_SOURCE, sourceDate: "2026-11-03" }),
      rofsw: facts({
        sourceName: ROFSW_SOURCE,
        sourceDate: "2026-11-10",
        covering: [{ riskLabel: "High", detail: ">0 m" }],
        nearestWithin: [
          { riskLabel: "Low", detail: ">0 m", miles: 0.001 },
          { riskLabel: "Medium", detail: ">0 m", miles: 0.001 },
        ],
      }),
    });
    const rofsw = layer(await served(synthetic, 2), "rofsw");
    expect(rofsw.pointState).toBe("inside");
    expect(rofsw.covering?.label).toBe("High");
    expect(rofsw.covering?.definition).toBe(
      "a 1 in 30 or greater chance of flooding in any given year",
    );
    expect(prox(rofsw)).toEqual([
      ["Low", 0.001],
      ["Medium", 0.001],
    ]);
  });
});

describe("flood — the 'unknown' zone source (D27)", () => {
  it("serves a filed unknown-source zone row end-to-end, detail verbatim", async () => {
    // The live zones collection now publishes shapes whose
    // flood_source is "unknown" (origin "local evidence");
    // D27 files and serves them as published. The point is
    // the D27 fixture feature's own ground (a small FZ2
    // polygon on the south Cornish coast, feature …1070);
    // the facts are the filed row's shape: an FZ2 covering
    // whose detail is the published pair, verbatim.
    const cornwall = directory("XX4 4XX", 50.0718, -5.5811, "E01000004");
    fileFacts(cornwall, {
      flood_zone: facts({
        sourceName: ZONES_SOURCE,
        sourceDate: "2026-10-21",
        covering: [{ riskLabel: "FZ2", detail: "unknown · local evidence" }],
      }),
      rofrs: facts({ sourceName: ROFRS_SOURCE, sourceDate: "2026-11-03" }),
      rofsw: facts({ sourceName: ROFSW_SOURCE, sourceDate: "2026-11-10" }),
    });
    const zones = layer(await served(cornwall), "flood_zone");
    expect(zones.pointState).toBe("inside");
    expect(zones.covering?.label).toBe("FZ2");
    expect(zones.covering?.displayLabel).toBe("Flood Zone 2");
    expect(zones.covering?.detail).toBe("unknown · local evidence");
    expect(zones.line).toBe(
      "the postcode point falls inside Flood Zone 2 on the Environment Agency's planning map",
    );
  });

  it("the How-we-check copy states the unknown-source fact in plain English (D27)", () => {
    expect(FLOOD_HOW_WE_CHECK).toContain(
      "A small number of the Environment Agency's flood-zone shapes do not state whether the flooding is from rivers, the sea or another source.",
    );
  });
});

describe("flood — wording (D25's banned-wording scan)", () => {
  const BANNED = [
    "safe",
    "flood-proof",
    "floodproof",
    "will flood",
    "won't flood",
    "no flood risk",
    "at risk",
    "insurable",
    "uninsurable",
    "score",
    "rating",
    "rated",
    "you may struggle",
    "lenders require",
  ];

  function allStrings(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
    else if (value && typeof value === "object")
      for (const v of Object.values(value)) allStrings(v, out);
    return out;
  }

  function allKeys(value: unknown, out: string[] = []): string[] {
    if (Array.isArray(value)) for (const v of value) allKeys(v, out);
    else if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) {
        out.push(k);
        allKeys(v, out);
      }
    return out;
  }

  it("no served string carries a banned term, and no key computes a verdict", async () => {
    const bundles: FloodBundle[] = [];
    bundles.push(await buildFloodBundle(rung1(BIRKDALE), source));
    bundles.push(await buildFloodBundle(rung1(EXETER), source));
    bundles.push(await buildFloodBundle(rung1(EPSOM), source));
    bundles.push(
      await buildFloodBundle(
        { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area", postcodeCount: 1 },
        source,
      ),
    );
    bundles.push(
      await buildFloodBundle(
        rung2(directory("CF11 8AA", 51.467947, -3.192837, "W01001759")),
        source,
      ),
    );
    for (const bundle of bundles) {
      for (const text of allStrings(bundle)) {
        for (const term of BANNED) expect(text.toLowerCase()).not.toContain(term);
      }
      for (const key of allKeys(bundle)) {
        expect(key).not.toMatch(/score|rate|rank|percent|verdict|defended|insur/i);
      }
    }
    // The limits copy itself is inside the scan's reach.
    for (const term of BANNED) expect(FLOOD_HOW_WE_CHECK.toLowerCase()).not.toContain(term);
    expect(FLOOD_HOW_WE_CHECK).toContain("not the property");
    expect(FLOOD_HOW_WE_CHECK).toContain("no record of past flooding");
    expect(FLOOD_HOW_WE_CHECK).toContain("their own models");
  });
});

// ------------------------------------------------------------------
// Live warnings (M6.22, decision D42) — composed at serve time
// from the EA's live feed, replaying the two items captured
// live in the M6.22 prep (tests/flood-warning-fixtures.ts).
// ------------------------------------------------------------------

function warningItem(partial: Partial<FloodWarningItem>): FloodWarningItem {
  return { ...LEADON_ITEM, ...partial };
}

async function composedBundle(
  warnings: FakeFloodWarningSource,
  dir: DirectoryPostcode = BIRKDALE,
  rung: 1 | 2 = 1,
  now: Date = WARNING_NOW,
): Promise<FloodBundle> {
  return buildFloodBundle(rung === 1 ? rung1(dir) : rung2(dir), source, {
    warningSource: warnings,
    now,
  });
}

describe("flood — live warnings compose at serve time (M6.22, D42)", () => {
  it("serves the two captured live items FIRST, verbatim, ahead of the filed layers", async () => {
    const warnings = new FakeFloodWarningSource();
    // Deliberately unordered in the payload: same severity,
    // so the raised time orders them (Bure 09:00, Leadon 16:35).
    warnings.items = [LEADON_ITEM, BURE_ITEM];
    const bundle = await composedBundle(warnings);
    if (bundle.kind !== "flood" || bundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    // The block is the section's first element, structurally.
    // (M6.27: the defences sibling sits between the layers
    // and the closing limits copy; M6.28: the climate
    // sibling sits after the defences; M8.3: the maps
    // sibling sits after the climate.)
    expect(Object.keys(bundle.flood)).toEqual([
      "state",
      "liveWarnings",
      "layers",
      "defences",
      "climate",
      "maps",
      "howWeCheck",
    ]);
    const block = bundle.flood.liveWarnings;
    if (!block) throw new Error("expected a composed live-warnings block");
    expect(block.state).toBe("warnings");
    expect(block.line).toBeNull();
    expect(block.warnings.map((w) => w.areaDescription)).toEqual([
      "The tidal Rivers Bure, Ant and Thurne",
      "River Leadon catchment",
    ]);
    const leadon = block.warnings[1];
    // The EA's words, verbatim — label, area, river, message.
    expect(leadon.severity).toBe("Flood alert");
    expect(leadon.severityLevel).toBe(3);
    expect(leadon.riverOrSea).toBe("Leadon, Glynch");
    expect(leadon.message).toBe(LEADON_ITEM.message);
    expect(leadon.message).toContain("Flooding is possible on Sunday 15 November");
    // The composed lines: the never-truncated headline, and
    // the raised time read from the naive London timestamp's
    // own components.
    expect(leadon.line).toBe("Flood alert — River Leadon catchment");
    expect(leadon.timeRaised).toBe("2026-11-15T16:35:59");
    expect(leadon.raisedLine).toBe("raised at 16:35 on 15 November 2026");
    // The block's furniture: checked-at stamp, the EA's
    // attribution sentence, the official-service link.
    expect(block.checkedAt).toBe("06:54 on 16 November 2026");
    expect(block.attributionLine).toBe(FLOOD_WARNING_ATTRIBUTION);
    expect(block.link).toEqual({ label: FLOOD_WARNING_LINK.label, url: FLOOD_WARNING_LINK.url });
    expect(block.link.url).toBe("https://www.gov.uk/check-flooding");
    expect(block.overflowCount).toBeNull();
    expect(block.overflowLine).toBeNull();
    // The filed layers are untouched by the composition.
    expect(bundle.flood.layers).toHaveLength(3);
    expect(bundle.flood.layers.map((l) => l.layer)).toEqual(["flood_zone", "rofrs", "rofsw"]);
    // The fetch was made for the postcode point, once.
    expect(warnings.calls).toEqual([
      { latitude: BIRKDALE.latitude, longitude: BIRKDALE.longitude },
    ]);
  });

  it("orders most severe first, then earliest raised", async () => {
    const warnings = new FakeFloodWarningSource();
    warnings.items = [
      warningItem({
        severity: "Flood alert",
        severityLevel: 3,
        description: "Area Three",
        timeRaised: "2026-11-15T08:00:00",
      }),
      warningItem({
        severity: "Severe flood warning",
        severityLevel: 1,
        description: "Area One",
        timeRaised: "2026-11-15T09:00:00",
      }),
      warningItem({
        severity: "Flood warning",
        severityLevel: 2,
        description: "Area Two",
        timeRaised: "2026-11-15T07:00:00",
      }),
    ];
    const bundle = await composedBundle(warnings);
    if (bundle.kind !== "flood" || bundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    expect(bundle.flood.liveWarnings?.warnings.map((w) => w.areaDescription)).toEqual([
      "Area One",
      "Area Two",
      "Area Three",
    ]);
  });

  it("never serves a level-4 item (warnings no longer in force)", async () => {
    const onlyLapsed = new FakeFloodWarningSource();
    onlyLapsed.items = [LAPSED_ITEM];
    const bundle = await composedBundle(onlyLapsed);
    if (bundle.kind !== "flood" || bundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    expect(bundle.flood.liveWarnings?.state).toBe("none");
    expect(bundle.flood.liveWarnings?.warnings).toEqual([]);

    const mixed = new FakeFloodWarningSource();
    mixed.items = [LAPSED_ITEM, LEADON_ITEM];
    const mixedBundle = await composedBundle(mixed);
    if (mixedBundle.kind !== "flood" || mixedBundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    expect(mixedBundle.flood.liveWarnings?.warnings.map((w) => w.areaDescription)).toEqual([
      "River Leadon catchment",
    ]);
  });

  it("caps the block at five and names the overflow, never dropping it silently", async () => {
    const warnings = new FakeFloodWarningSource();
    warnings.items = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      warningItem({
        description: `Area ${n}`,
        timeRaised: `2026-11-15T0${n}:00:00`,
      }),
    );
    const bundle = await composedBundle(warnings);
    if (bundle.kind !== "flood" || bundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    const block = bundle.flood.liveWarnings;
    expect(block?.warnings).toHaveLength(5);
    expect(block?.overflowCount).toBe(2);
    expect(block?.overflowLine).toBe(
      "2 more flood warnings are in force for areas near this postcode — see the official Check for flooding service for the full list",
    );
  });

  it("the empty fetch serves the NAMED no-warning line, timestamped in London time", async () => {
    const warnings = new FakeFloodWarningSource();
    warnings.items = [];
    const bundle = await composedBundle(warnings);
    if (bundle.kind !== "flood" || bundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    const block = bundle.flood.liveWarnings;
    expect(block?.state).toBe("none");
    expect(block?.line).toBe(
      "No flood warning in force for this area — checked at 06:54 on 16 November 2026",
    );
    expect(block?.warnings).toEqual([]);
    // The named line rides beside the official link too.
    expect(block?.link.url).toBe("https://www.gov.uk/check-flooding");
  });

  it("a failed fetch serves the NAMED failure line and the filed answer complete, and never throws", async () => {
    const warnings = new FakeFloodWarningSource();
    warnings.error = new Error("the feed is down");
    const bundle = await composedBundle(warnings);
    if (bundle.kind !== "flood" || bundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    const block = bundle.flood.liveWarnings;
    expect(block?.state).toBe("unavailable");
    expect(block?.line).toBe("Live flood warnings could not be checked just now");
    expect(block?.warnings).toEqual([]);
    // The filed answer stands complete and unchanged.
    expect(bundle.flood.layers).toHaveLength(3);
    const zones = layer(bundle.flood.layers, "flood_zone");
    expect(zones.pointState).toBe("zone-1");
    expect(zones.line).toBe(
      "The postcode point is not in Flood Zone 2 or Flood Zone 3 on the Environment Agency's planning map",
    );
  });

  it("composes identically at rungs 1 and 2, and not at all without a warning source", async () => {
    const warnings = new FakeFloodWarningSource();
    warnings.items = [LEADON_ITEM];
    const one = await composedBundle(warnings, BIRKDALE, 1);
    const two = await composedBundle(warnings, BIRKDALE, 2);
    if (one.kind !== "flood" || two.kind !== "flood") throw new Error("expected flood bundles");
    expect(two.flood.liveWarnings).toEqual(one.flood.liveWarnings);

    const plain = await buildFloodBundle(rung1(BIRKDALE), source);
    if (plain.kind !== "flood" || plain.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    expect(plain.flood.liveWarnings).toBeNull();
  });

  it("never fetches for the not-covered nations or at rungs 3 and 4", async () => {
    const warnings = new FakeFloodWarningSource();
    warnings.items = [LEADON_ITEM];
    const cardiff = directory("CF11 8AA", 51.467947, -3.192837, "W01001759");
    const welsh = await buildFloodBundle(rung2(cardiff), source, {
      warningSource: warnings,
      now: WARNING_NOW,
    });
    expect(welsh.kind).toBe("not-covered");
    await buildFloodBundle(
      { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area", postcodeCount: 1 },
      source,
      { warningSource: warnings, now: WARNING_NOW },
    );
    await buildFloodBundle({ rung: 4, kind: "no-location" }, source, {
      warningSource: warnings,
      now: WARNING_NOW,
    });
    expect(warnings.calls).toEqual([]);
  });

  it("the checked-at stamp is Europe/London, not UTC (a summer instant renders BST)", async () => {
    const warnings = new FakeFloodWarningSource();
    warnings.items = [];
    // 16:35 UTC in July is 17:35 in London; a UTC misread
    // would stamp 16:35.
    const bundle = await composedBundle(
      warnings,
      BIRKDALE,
      1,
      new Date("2026-07-15T16:35:00.000Z"),
    );
    if (bundle.kind !== "flood" || bundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    expect(bundle.flood.liveWarnings?.checkedAt).toBe("17:35 on 15 July 2026");
    expect(bundle.flood.liveWarnings?.line).toBe(
      "No flood warning in force for this area — checked at 17:35 on 15 July 2026",
    );
  });

  it("the block's own prose passes the flood banned-wording scan; the EA's verbatim fields are quoted, not scanned as ours", async () => {
    const warnings = new FakeFloodWarningSource();
    warnings.items = [LEADON_ITEM, BURE_ITEM];
    const bundle = await composedBundle(warnings);
    if (bundle.kind !== "flood" || bundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    const block = bundle.flood.liveWarnings;
    if (!block) throw new Error("expected a composed block");
    // Publisher text is identified by field: severity,
    // areaDescription and message are the EA's words, served
    // verbatim (asserted in the composition test above) and
    // excluded from OUR wording scan — the noise bands'
    // verbatim-text precedent. Everything else in the block
    // is our prose and is scanned in full.
    const ours: unknown = {
      ...block,
      warnings: block.warnings.map((w) => ({
        ...w,
        severity: "",
        areaDescription: "",
        message: "",
      })),
    };
    const BANNED = [
      "safe",
      "flood-proof",
      "floodproof",
      "will flood",
      "won't flood",
      "no flood risk",
      "at risk",
      "insurable",
      "uninsurable",
      "score",
      "rating",
      "rated",
      "you may struggle",
      "lenders require",
    ];
    const strings: string[] = [];
    const collect = (value: unknown) => {
      if (typeof value === "string") strings.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    collect(ours);
    for (const text of strings)
      for (const term of BANNED) expect(text.toLowerCase()).not.toContain(term);
    // No key in the composed bundle computes a verdict.
    const keys: string[] = [];
    const collectKeys = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(collectKeys);
      else if (value && typeof value === "object")
        for (const [k, v] of Object.entries(value)) {
          keys.push(k);
          collectKeys(v);
        }
    };
    collectKeys(bundle);
    for (const key of keys)
      expect(key).not.toMatch(/score|rate|rank|percent|verdict|defended|insur/i);
  });
});

describe("flood — the live warning source and parser (M6.22)", () => {
  it("parses the captured live responses into items, verbatim", () => {
    const items = parseFloodWarningItems({ items: [LEADON_RAW, BURE_RAW] });
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      severity: "Flood alert",
      severityLevel: 3,
      description: "River Leadon catchment",
      riverOrSea: "Leadon, Glynch",
      message: LEADON_ITEM.message,
      timeRaised: "2026-11-15T16:35:59",
    });
    expect(items[1].riverOrSea).toBe("Bure, Ant, Thurne");
    expect(items[1].description).toBe("The tidal Rivers Bure, Ant and Thurne");
  });

  it("refuses malformed bodies loudly (the composition turns the throw into the named failure line)", () => {
    expect(() => parseFloodWarningItems(null)).toThrow();
    expect(() => parseFloodWarningItems({})).toThrow();
    expect(() => parseFloodWarningItems({ items: [{ severity: "Flood alert" }] })).toThrow();
    expect(() =>
      parseFloodWarningItems({
        items: [
          {
            severity: "Flood alert",
            severityLevel: 3,
            description: "Somewhere",
            message: "Text",
            timeRaised: "15 November 2026",
          },
        ],
      }),
    ).toThrow();
  });

  function fakeFetch(respond: (url: string) => Promise<unknown>, seen: string[]): typeof fetch {
    return (async (url: unknown) => {
      seen.push(String(url));
      return respond(String(url));
    }) as typeof fetch;
  }

  it("requests the geo-filtered list with the pinned reach and severity pattern", async () => {
    const seen: string[] = [];
    const fetchImpl = fakeFetch(
      async () => ({
        ok: true,
        status: 200,
        json: async () => ({ items: [LEADON_RAW] }),
      }),
      seen,
    );
    const warnings = createFloodWarningSource({ fetchImpl });
    const items = await warnings.warningsNear(52.034, -2.424);
    expect(items).toEqual([LEADON_ITEM]);
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0]);
    expect(url.origin + url.pathname).toBe(
      "https://environment.data.gov.uk/flood-monitoring/id/floods",
    );
    expect(url.searchParams.get("lat")).toBe("52.034");
    expect(url.searchParams.get("long")).toBe("-2.424");
    // dist is kilometres to the flood area (the API's
    // documented unit, live-pinned at build): 3.22 km is
    // the product's 2-mile radius.
    expect(url.searchParams.get("dist")).toBe("3.22");
    expect(url.searchParams.get("min-severity")).toBe("3");
  });

  it("rejects on a non-200 response and on an unparseable body", async () => {
    const seen: string[] = [];
    const httpError = createFloodWarningSource({
      fetchImpl: fakeFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }), seen),
    });
    await expect(httpError.warningsNear(52.034, -2.424)).rejects.toThrow("HTTP 503");
    const garbage = createFloodWarningSource({
      fetchImpl: fakeFetch(
        async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("not json");
          },
        }),
        seen,
      ),
    });
    await expect(garbage.warningsNear(52.034, -2.424)).rejects.toThrow("not json");
  });

  it("aborts at the timeout: a hanging feed rejects instead of blocking the check", async () => {
    const hanging = (async (_url: unknown, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;
    const warnings = createFloodWarningSource({ fetchImpl: hanging, timeoutMs: 25 });
    await expect(warnings.warningsNear(52.034, -2.424)).rejects.toThrow("aborted");
  });
});

// ------------------------------------------------------------------
// Recorded flood defences (M6.27, decisions D49 and D54) — the
// AIMS register as a sibling block: report depth only, capped,
// every absence named, framed by the pinned caveat and the
// RoFRS bridge line.
// ------------------------------------------------------------------

const DEFENCES_SOURCE = "Environment Agency — AIMS Spatial Flood Defences";

function defenceRow(partial: Partial<FloodDefenceRow>): FloodDefenceRow {
  return {
    assetId: "1",
    assetName: "Not Available",
    assetSubType: "Wall",
    protectionType: "Fluvial",
    assetMaintainer: "Environment Agency",
    currentCondition: "3",
    designSop: 100,
    designSopDqf: "Good",
    currentSop: null,
    waterCourseName: "River Test",
    miles: 0.5,
    ...partial,
  };
}

function defencesFacts(partial: Partial<FloodDefencesFacts>): FloodDefencesFacts {
  return {
    filedCount: 141458,
    totalWithin: 1,
    sourceName: DEFENCES_SOURCE,
    sourceDate: "2026-11-13",
    defences: [defenceRow({})],
    ...partial,
  };
}

async function defencesBlock(dir: DirectoryPostcode, rung: 1 | 2 = 1): Promise<FloodDefencesBlock> {
  const bundle = await buildFloodBundle(rung === 1 ? rung1(dir) : rung2(dir), source);
  if (bundle.kind !== "flood" || bundle.flood.state !== "served")
    throw new Error("expected a served flood bundle");
  return bundle.flood.defences;
}

describe("flood — recorded defences (M6.27, D49/D54)", () => {
  it("serves the nearest defence in full as filed, framed by the pinned caveat and bridge", async () => {
    fileDefences(
      BIRKDALE,
      defencesFacts({
        totalWithin: 2,
        defences: [
          defenceRow({
            assetId: "73925",
            assetSubType: "Natural High Ground",
            assetMaintainer: "Environment Agency",
            currentCondition: "3",
            designSop: 10,
            designSopDqf: null,
            waterCourseName: "River Ter",
            miles: 0.851,
          }),
          defenceRow({
            assetId: "155192",
            assetSubType: "Natural High Ground",
            assetMaintainer: "Private individual, Company or Charity",
            currentCondition: "",
            designSop: 10,
            designSopDqf: null,
            waterCourseName: "River Chelmer",
            miles: 1.581,
          }),
        ],
      }),
    );
    const block = await defencesBlock(BIRKDALE);
    expect(block.state).toBe("served");
    expect(block.title).toBe(FLOOD_DEFENCES_TITLE);
    expect(block.title).toBe("Recorded flood defences near this postcode point");
    expect(block.caveat).toBe(FLOOD_DEFENCES_CAVEAT);
    // Birkdale's rivers & sea layer is filed, so the bridge
    // serves, verbatim.
    expect(block.bridgeLine).toBe(FLOOD_DEFENCES_BRIDGE);
    expect(block.totalWithin).toBe(2);
    expect(block.overflowLine).toBeNull();
    expect(block.line).toBeNull();
    expect(block.sourceLine).toBe(
      "Environment Agency — AIMS Spatial Flood Defences — data to 13 November 2026",
    );
    const [first, second] = block.defences;
    expect(first).toMatchObject({
      assetId: "73925",
      type: "Natural High Ground",
      name: null, // 'Not Available' serves as its named absence
      protectionType: "Fluvial",
      watercourse: "River Ter",
      maintainer: "Environment Agency",
      maintainerRecorded: true,
      condition: "Fair",
      conditionLine: "condition: Fair",
      designSop: 10,
      designSopLine: "design standard: 1 in 10",
      designSopExplainer: DESIGN_SOP_EXPLAINER,
      currentSop: null,
      currentSopLine: "No current standard is recorded for this defence",
      miles: 0.851,
    });
    // The '' condition is the absence of a grade, not grade 0.
    expect(second.condition).toBeNull();
    expect(second.conditionLine).toBe("No condition is recorded for this defence");
    expect(second.maintainer).toBe("Private individual, Company or Charity");
  });

  it("serves every vocabulary maintainer as its filed category — 'Unknown' as its named absence", async () => {
    const categories = [
      "Environment Agency",
      "Internal Drainage Board",
      "Local Authority",
      "Network Rail",
      "Not Maintained",
      "Other Public Body",
      "Private individual, Company or Charity",
      "Transport Authority",
      "Unknown",
      "Water Company",
    ];
    fileDefences(
      EPSOM,
      defencesFacts({
        totalWithin: categories.length,
        defences: categories.map((c, i) =>
          defenceRow({ assetId: String(i + 1), assetMaintainer: c, miles: 0.1 * (i + 1) }),
        ),
      }),
    );
    const block = await defencesBlock(EPSOM);
    for (const [i, category] of categories.entries()) {
      const served = block.defences[i];
      if (category === "Unknown") {
        expect(served.maintainer).toBe("No maintainer is recorded for this defence");
        expect(served.maintainerRecorded).toBe(false);
      } else {
        expect(served.maintainer).toBe(category);
        expect(served.maintainerRecorded).toBe(true);
      }
      // No maintainer string outside the vocabulary (or its
      // one named absence) can appear in served output.
      expect([...categories, "No maintainer is recorded for this defence"]).toContain(
        served.maintainer,
      );
    }
  });

  it("caps the list at the pinned cap and carries the true total on the overflow line", async () => {
    const many = Array.from({ length: DEFENCES_LIST_CAP }, (_, i) =>
      defenceRow({ assetId: String(1000 + i), miles: 0.01 * (i + 1) }),
    );
    fileDefences(EXETER, defencesFacts({ totalWithin: 443, defences: many }));
    const block = await defencesBlock(EXETER);
    expect(block.defences).toHaveLength(DEFENCES_LIST_CAP);
    expect(block.totalWithin).toBe(443);
    expect(block.overflowLine).toBe("and 418 more recorded defences within two miles");
    // At exactly the cap there is no overflow line.
    fileDefences(EXETER, defencesFacts({ totalWithin: DEFENCES_LIST_CAP, defences: many }));
    const exact = await defencesBlock(EXETER);
    expect(exact.overflowLine).toBeNull();
  });

  it("the overflow line has a singular form — one more defence, not defences (BUG-344(c))", async () => {
    const many = Array.from({ length: DEFENCES_LIST_CAP }, (_, i) =>
      defenceRow({ assetId: String(1000 + i), miles: 0.01 * (i + 1) }),
    );
    fileDefences(EXETER, defencesFacts({ totalWithin: DEFENCES_LIST_CAP + 1, defences: many }));
    const block = await defencesBlock(EXETER);
    expect(block.defences).toHaveLength(DEFENCES_LIST_CAP);
    expect(block.totalWithin).toBe(DEFENCES_LIST_CAP + 1);
    expect(block.overflowLine).toBe("and 1 more recorded defence within two miles");
  });

  it("the bridge serves only where the rivers & sea layer is filed — the other arm", async () => {
    const unfiledRofrs = directory("XX3 3XX", 51.6, 0.6, "E01000003");
    fileFacts(unfiledRofrs, {
      flood_zone: facts({ sourceName: ZONES_SOURCE, sourceDate: "2026-10-21" }),
      rofrs: {
        filedCount: 0,
        covering: [],
        nearestWithin: [],
        nearestBeyond: null,
        sourceName: null,
        sourceDate: null,
      },
      rofsw: facts({ sourceName: ROFSW_SOURCE, sourceDate: "2026-11-10" }),
    });
    fileDefences(unfiledRofrs, defencesFacts({}));
    const block = await defencesBlock(unfiledRofrs);
    expect(block.state).toBe("served");
    expect(block.bridgeLine).toBeNull();
    expect(block.caveat).toBe(FLOOD_DEFENCES_CAVEAT);
  });

  it("serves the named absence within the radius, carrying the coverage limit", async () => {
    const remote = directory("XX4 4XX", 52.6, -1.6, "E01000004");
    fileFacts(remote, {
      flood_zone: facts({ sourceName: ZONES_SOURCE, sourceDate: "2026-10-21" }),
      rofrs: facts({ sourceName: ROFRS_SOURCE, sourceDate: "2026-11-03" }),
      rofsw: facts({ sourceName: ROFSW_SOURCE, sourceDate: "2026-11-10" }),
    });
    fileDefences(remote, defencesFacts({ totalWithin: 0, defences: [] }));
    const block = await defencesBlock(remote);
    expect(block.state).toBe("none-within-radius");
    expect(block.line).toBe(FLOOD_DEFENCES_NONE_LINE);
    expect(block.line).toContain(
      "No EA-recorded flood defence is mapped within 2 miles of this postcode point",
    );
    expect(block.line).toContain("defences recorded by other bodies");
    expect(block.caveat).toBeNull();
    expect(block.bridgeLine).toBeNull();
    expect(block.defences).toEqual([]);
    expect(block.totalWithin).toBe(0);
    expect(block.sourceLine).toBe(
      "Environment Agency — AIMS Spatial Flood Defences — data to 13 November 2026",
    );
  });

  it("serves the not-filed state when the table is empty — never an absence", async () => {
    const block = await defencesBlock(OXFORD);
    expect(block.state).toBe("not-filed");
    expect(block.line).toBe(FLOOD_DEFENCES_NOT_FILED_LINE);
    expect(block.line).toBe(
      "Recorded flood defences are not filed yet, so no answer can be given from them",
    );
    expect(block.caveat).toBeNull();
    expect(block.bridgeLine).toBeNull();
    expect(block.totalWithin).toBeNull();
    expect(block.sourceLine).toBeNull();
  });

  it("named absences per field: grade '0' is Unchecked, an unfiled standard borrows nothing", async () => {
    fileDefences(
      KINGSTON,
      defencesFacts({
        totalWithin: 3,
        defences: [
          defenceRow({ assetId: "a", currentCondition: "0", miles: 0.1 }),
          defenceRow({
            assetId: "b",
            currentCondition: null,
            designSop: null,
            designSopDqf: "Good", // a quality flag with no standard serves nothing
            currentSop: 50,
            waterCourseName: "",
            miles: 0.2,
          }),
          defenceRow({ assetId: "c", designSop: null, designSopDqf: null, miles: 0.3 }),
        ],
      }),
    );
    const block = await defencesBlock(KINGSTON);
    const [a, b, c] = block.defences;
    expect(a.condition).toBe("Unchecked");
    expect(a.conditionLine).toBe("condition: Unchecked");
    expect(b.condition).toBeNull();
    expect(b.conditionLine).toBe("No condition is recorded for this defence");
    expect(b.designSop).toBeNull();
    expect(b.designSopLine).toBe("No design standard is recorded for this defence");
    expect(b.designSopExplainer).toBeNull();
    expect(b.designSopQuality).toBeNull();
    expect(b.currentSop).toBe(50);
    expect(b.currentSopLine).toBe("current standard: 1 in 50");
    expect(b.currentSopExplainer).toBe(CURRENT_SOP_EXPLAINER);
    expect(b.watercourse).toBeNull();
    expect(c.designSopQuality).toBeNull();
  });

  it("no line in the block claims a defence protects this home (the no-protection scan)", async () => {
    const block = await defencesBlock(BIRKDALE);
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(block);
    const banned = [
      "protects this home",
      "protecting this home",
      "defends this home",
      "this home is protected",
      "safe",
      "flood-proof",
      "will flood",
      "won't flood",
      "no flood risk",
    ];
    for (const text of strings)
      for (const term of banned) expect(text.toLowerCase()).not.toContain(term);
    // The framing string is the pinned title.
    expect(block.title).toBe("Recorded flood defences near this postcode point");
  });

  it("rung 3 and the not-covered nations carry no defences payload", async () => {
    const rung3 = await buildFloodBundle(
      { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area", postcodeCount: 1 },
      source,
    );
    expect("defences" in rung3.flood).toBe(false);
    const welsh = await buildFloodBundle(
      rung2(directory("CF11 8AA", 51.467947, -3.192837, "W01001759")),
      source,
    );
    expect(welsh.kind).toBe("not-covered");
    expect("defences" in welsh.flood).toBe(false);
  });

  it("the database source reads the defences table: totals, the cap, the radius cut", async () => {
    const seen: string[] = [];
    const db = {
      async query(text: string) {
        seen.push(text);
        if (text.includes("FROM flood_defences LIMIT 1"))
          return { rows: [{ source_name: DEFENCES_SOURCE, source_date: "2026-11-13" }] };
        if (text.includes("count(*)") && text.includes("ST_Distance")) return { rows: [{ n: 26 }] };
        if (text.includes("SELECT count(*)::int AS n FROM flood_defences"))
          return { rows: [{ n: 141458 }] };
        if (text.includes("ORDER BY miles, asset_id")) {
          return {
            rows: [
              {
                asset_id: "73925",
                asset_name: "Not Available",
                asset_sub_type: "Natural High Ground",
                protection_type: "Fluvial",
                asset_maintainer: "Environment Agency",
                current_condition: "3",
                design_sop: 10,
                design_sop_dqf: null,
                current_sop: null,
                water_course_name: "River Ter",
                miles: 0.851,
              },
              {
                asset_id: "99999",
                asset_name: "Not Available",
                asset_sub_type: "Wall",
                protection_type: "Fluvial",
                asset_maintainer: "Unknown",
                current_condition: "",
                design_sop: null,
                design_sop_dqf: null,
                current_sop: null,
                water_course_name: "",
                miles: 2.4, // beyond the radius — the source's own cut drops it
              },
            ],
          };
        }
        throw new Error(`unexpected query: ${text}`);
      },
    };
    const dbSource = createFloodSource(db);
    const result = await dbSource.defencesNear(51.776176, 0.60387);
    expect(result.filedCount).toBe(141458);
    expect(result.totalWithin).toBe(26);
    expect(result.defences).toHaveLength(1);
    expect(result.defences[0].assetId).toBe("73925");
    expect(result.sourceName).toBe(DEFENCES_SOURCE);
    expect(result.sourceDate).toBe("2026-11-13");
    expect(seen.some((q) => q.includes("ST_DWithin"))).toBe(true);
    expect(seen.some((q) => q.includes("LIMIT"))).toBe(true);
  });

  it("the database source short-circuits an unfiled defences table", async () => {
    const seen: string[] = [];
    const db = {
      async query(text: string) {
        seen.push(text);
        if (text.includes("LIMIT 1")) return { rows: [] };
        if (text.includes("count(*)")) return { rows: [{ n: 0 }] };
        throw new Error(`unexpected query: ${text}`);
      },
    };
    const dbSource = createFloodSource(db);
    const result = await dbSource.defencesNear(51.5, 0.5);
    expect(result.filedCount).toBe(0);
    expect(result.defences).toEqual([]);
    expect(seen).toHaveLength(2);
  });
});

// ------------------------------------------------------------------
// Climate outlook (M6.28, decisions D49 and D55) — the two
// Climate Change 1 scenario likelihoods as a sibling block:
// the point state only, each source's scenario basis named
// in its own epochs, never a present-day comparison.
// ------------------------------------------------------------------

const ROFRS_CC_SOURCE =
  "Environment Agency — Risk of Flooding from Rivers and Sea – Climate Change 1";
const ROFSW_CC_SOURCE =
  "Environment Agency — Risk of Flooding from Surface Water – Climate Change 1";

function climateFacts(partial: Partial<FloodClimateFacts>): FloodClimateFacts {
  return { filedCount: 1000, coveringLabel: null, sourceName: null, sourceDate: null, ...partial };
}

async function climateBlock(
  dir: DirectoryPostcode,
  rung: 1 | 2 = 1,
): Promise<ServedClimateOutlook> {
  const bundle = await buildFloodBundle(rung === 1 ? rung1(dir) : rung2(dir), source);
  if (bundle.kind !== "flood" || bundle.flood.state !== "served")
    throw new Error("expected a served flood bundle");
  return bundle.flood.climate;
}

function climateStrings(block: ServedClimateOutlook): string[] {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(block);
  return strings;
}

// The golden climate facts, as filed by the two climate
// loaders from the prep's measured coverage of the three
// golden points (the prep's golden table, Section 5.4):
// rivers & sea — Birkdale no band, Exeter Low, Minerva no
// band; surface water — Birkdale no band, Exeter no band,
// Minerva Low.
function fileGoldenClimate() {
  fileClimate(BIRKDALE, {
    rofrs_cc: climateFacts({
      filedCount: 252932,
      sourceName: ROFRS_CC_SOURCE,
      sourceDate: "2026-11-03",
    }),
    rofsw_cc: climateFacts({
      filedCount: 406734,
      sourceName: ROFSW_CC_SOURCE,
      sourceDate: "2026-11-10",
    }),
  });
  fileClimate(EXETER, {
    rofrs_cc: climateFacts({
      filedCount: 252932,
      coveringLabel: "Low",
      sourceName: ROFRS_CC_SOURCE,
      sourceDate: "2026-11-03",
    }),
    rofsw_cc: climateFacts({
      filedCount: 406734,
      sourceName: ROFSW_CC_SOURCE,
      sourceDate: "2026-11-10",
    }),
  });
  fileClimate(EPSOM, {
    rofrs_cc: climateFacts({
      filedCount: 252932,
      sourceName: ROFRS_CC_SOURCE,
      sourceDate: "2026-11-03",
    }),
    rofsw_cc: climateFacts({
      filedCount: 406734,
      coveringLabel: "Low",
      sourceName: ROFSW_CC_SOURCE,
      sourceDate: "2026-11-10",
    }),
  });
}

describe("flood — climate outlook (M6.28, D49/D55)", () => {
  it("serves the block on a served England bundle, framed, both sources in order, never inside layers[]", async () => {
    const bundle = await buildFloodBundle(rung1(BIRKDALE), source);
    if (bundle.kind !== "flood" || bundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    const block = bundle.flood.climate;
    expect(block.heading).toBe(FLOOD_CLIMATE_HEADING);
    expect(block.heading).toBe("Climate outlook");
    expect(block.basisLine).toBe(FLOOD_CLIMATE_BASIS_LINE);
    expect(block.caveatLine).toBe(FLOOD_CLIMATE_CAVEAT_LINE);
    expect(block.sources.map((s) => s.source)).toEqual(["rivers-sea", "surface-water"]);
    // Unfiled by default in this suite: both sources serve
    // their named not-filed state.
    for (const s of block.sources) {
      expect(s.pointState).toBe("not-filed");
      expect(s.band).toBeNull();
      expect(s.sourceName).toBeNull();
      expect(s.sourceDate).toBeNull();
      expect(s.sourceLine).toBeNull();
    }
    expect(block.sources[0].line).toBe(
      "The climate scenario map of flooding from rivers and the sea is not filed yet, so no answer can be given from it",
    );
    expect(block.sources[1].line).toBe(
      "The climate scenario map of flooding from surface water is not filed yet, so no answer can be given from it",
    );
    // The block is a sibling: no climate material inside the
    // present-day layers.
    expect(JSON.stringify(bundle.flood.layers)).not.toContain("Climate outlook");
    expect(JSON.stringify(bundle.flood.layers)).not.toContain("climate scenario");
  });

  it("rung 3, rung 4 and the not-covered nations carry no climate payload", async () => {
    const rung3 = await buildFloodBundle(
      { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area", postcodeCount: 1 },
      source,
    );
    expect("climate" in rung3.flood).toBe(false);
    const rung4 = await buildFloodBundle({ rung: 4, kind: "no-location" }, source);
    expect("climate" in rung4.flood).toBe(false);
    const welsh = await buildFloodBundle(
      rung2(directory("CF11 8AA", 51.467947, -3.192837, "W01001759")),
      source,
    );
    expect(welsh.kind).toBe("not-covered");
    expect("climate" in welsh.flood).toBe(false);
  });

  it("serves the inside state with the band and the publisher's definition, and the no-band state as its own named absence", async () => {
    fileGoldenClimate();
    const block = await climateBlock(EXETER);
    const [riversSea, surfaceWater] = block.sources;
    expect(riversSea.pointState).toBe("inside");
    expect(riversSea.band).toEqual({
      label: "Low",
      displayLabel: "Low",
      definition: FLOOD_BAND_DEFINITIONS["Low"],
    });
    expect(riversSea.line).toBe(
      "the postcode point falls in the Low band on the Environment Agency's climate scenario map of flooding from rivers and the sea",
    );
    expect(riversSea.sourceName).toBe(ROFRS_CC_SOURCE);
    expect(riversSea.sourceDate).toBe("2026-11-03");
    expect(riversSea.sourceLine).toBe(`${ROFRS_CC_SOURCE} — data to 3 November 2026`);
    expect(surfaceWater.pointState).toBe("no-band-published");
    expect(surfaceWater.band).toBeNull();
    expect(surfaceWater.line).toBe(
      "No likelihood band is published for this point under this scenario on the Environment Agency's climate scenario map of flooding from surface water",
    );
    expect(surfaceWater.sourceLine).toBe(`${ROFSW_CC_SOURCE} — data to 10 November 2026`);
  });

  it("the golden homes serve their measured scenario states", async () => {
    fileGoldenClimate();
    const birkdale = await climateBlock(BIRKDALE);
    expect(birkdale.sources.map((s) => s.pointState)).toEqual([
      "no-band-published",
      "no-band-published",
    ]);
    const exeter = await climateBlock(EXETER);
    expect(exeter.sources.map((s) => s.pointState)).toEqual(["inside", "no-band-published"]);
    expect(exeter.sources[0].band?.label).toBe("Low");
    const epsom = await climateBlock(EPSOM);
    expect(epsom.sources.map((s) => s.pointState)).toEqual(["no-band-published", "inside"]);
    expect(epsom.sources[1].band?.label).toBe("Low");
    expect(epsom.sources[1].line).toBe(
      "the postcode point falls in the Low band on the Environment Agency's climate scenario map of flooding from surface water",
    );
  });

  it("Exeter's scenario band is a scenario fact only — the present-day band is never set beside it", async () => {
    fileGoldenClimate();
    const bundle = await buildFloodBundle(rung1(EXETER), source);
    if (bundle.kind !== "flood" || bundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    // The two products' facts, each in its own place: the
    // present-day rivers & sea layer serves Very low; the
    // scenario source serves Low. No climate string names
    // the present-day band, and no climate line sets the
    // two side by side.
    const rofrsLayer = bundle.flood.layers.find((l) => l.layer === "rofrs");
    expect(rofrsLayer?.covering?.displayLabel).toBe("Very low");
    expect(bundle.flood.climate.sources[0].band?.label).toBe("Low");
    for (const text of climateStrings(bundle.flood.climate)) expect(text).not.toContain("Very low");
  });

  it("names each source's scenario basis every time, in its own epochs (D55) — never the blended span", async () => {
    fileGoldenClimate();
    // A point with present-day facts filed but no climate
    // filing at all: the not-filed state still names the
    // scenario basis.
    const unfiled = directory("XX9 9XX", 51.9, 0.9, "E01000009");
    fileFacts(unfiled, {
      flood_zone: facts({ sourceName: ZONES_SOURCE, sourceDate: "2026-10-21" }),
      rofrs: facts({ sourceName: ROFRS_SOURCE, sourceDate: "2026-11-03" }),
      rofsw: facts({ sourceName: ROFSW_SOURCE, sourceDate: "2026-11-10" }),
    });
    const blocks = [
      await climateBlock(BIRKDALE), // filed, no band
      await climateBlock(EXETER), // filed, inside
      await climateBlock(unfiled), // unfiled
    ];
    for (const block of blocks) {
      const [riversSea, surfaceWater] = block.sources;
      expect(riversSea.scenarioLine).toBe(ROFRS_CC_SCENARIO_LINE);
      expect(riversSea.scenarioLine).toContain("UKCP18");
      expect(riversSea.scenarioLine).toContain("RCP 8.5");
      expect(riversSea.scenarioLine).toContain("Central allowance for rivers");
      expect(riversSea.scenarioLine).toContain("2040–2069");
      expect(riversSea.scenarioLine).toContain("Higher Central allowance for the sea");
      expect(riversSea.scenarioLine).toContain("2036–2065");
      expect(riversSea.scenarioLine).toContain("cumulative sea level rise to 2065");
      expect(surfaceWater.scenarioLine).toBe(ROFSW_CC_SCENARIO_LINE);
      expect(surfaceWater.scenarioLine).toContain("UKCP18");
      expect(surfaceWater.scenarioLine).toContain("RCP 8.5");
      expect(surfaceWater.scenarioLine).toContain("Central allowance for surface water");
      expect(surfaceWater.scenarioLine).toContain("2040–2060");
      for (const text of climateStrings(block)) {
        expect(text).not.toContain("between 2036 and 2069");
        expect(text).not.toContain("2036 and 2069");
      }
    }
  });

  it("no present-vs-scenario comparison is servable: the no-delta scan, and structural independence both ways", async () => {
    fileGoldenClimate();
    const block = await climateBlock(EXETER);
    const deltaTerms = [
      "rises to",
      "rises from",
      "increases",
      "decreases",
      "higher than",
      "lower than",
      "worse",
      "better than",
      "will become",
      "compared with",
      "compared to",
      "than today",
      "than at present",
      "deteriorat",
      "by 2069",
      "by 2065",
      "by 2060",
    ];
    for (const text of climateStrings(block))
      for (const term of deltaTerms) expect(text.toLowerCase()).not.toContain(term);

    // Structural independence: the block is composed from
    // the climate facts alone. A source whose present-day
    // rivers & sea facts differ (band, nearest, beyond)
    // serves a byte-identical climate block; a source whose
    // climate facts differ serves byte-identical layers.
    class VariantSource implements FloodDataSource {
      constructor(
        private rofrs: FloodLayerFacts | null,
        private climate: Record<FloodClimateLayerType, FloodClimateFacts> | null,
      ) {}
      async layerFacts(layer: FloodLayerType, latitude: number, longitude: number) {
        if (layer === "rofrs" && this.rofrs) return this.rofrs;
        return source.layerFacts(layer, latitude, longitude);
      }
      async defencesNear(latitude: number, longitude: number) {
        return source.defencesNear(latitude, longitude);
      }
      async climateFacts(layer: FloodClimateLayerType, latitude: number, longitude: number) {
        if (this.climate) return this.climate[layer];
        return source.climateFacts(layer, latitude, longitude);
      }
      async mapFacts() {
        return { polygons: [], streets: [], homeStreet: null };
      }
    }
    const base = await buildFloodBundle(rung1(EXETER), source);
    if (base.kind !== "flood" || base.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    const movedPresent = await buildFloodBundle(
      rung1(EXETER),
      new VariantSource(
        {
          filedCount: 176535,
          covering: [{ riskLabel: "High", detail: null }],
          nearestWithin: [{ riskLabel: "High", detail: null, miles: 0.01 }],
          nearestBeyond: null,
          sourceName: ROFRS_SOURCE,
          sourceDate: "2026-11-03",
        },
        null,
      ),
    );
    if (movedPresent.kind !== "flood" || movedPresent.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    expect(movedPresent.flood.layers).not.toEqual(base.flood.layers);
    expect(movedPresent.flood.climate).toEqual(base.flood.climate);
    const movedClimate = await buildFloodBundle(
      rung1(EXETER),
      new VariantSource(null, {
        rofrs_cc: climateFacts({
          filedCount: 252932,
          coveringLabel: "High",
          sourceName: ROFRS_CC_SOURCE,
          sourceDate: "2026-11-03",
        }),
        rofsw_cc: climateFacts({
          filedCount: 406734,
          coveringLabel: "Medium",
          sourceName: ROFSW_CC_SOURCE,
          sourceDate: "2026-11-10",
        }),
      }),
    );
    if (movedClimate.kind !== "flood" || movedClimate.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    expect(movedClimate.flood.climate).not.toEqual(base.flood.climate);
    expect(movedClimate.flood.layers).toEqual(base.flood.layers);
  });

  it("no 2080s horizon serves anywhere in the block", async () => {
    fileGoldenClimate();
    for (const dir of [BIRKDALE, EXETER, EPSOM]) {
      const block = await climateBlock(dir);
      for (const text of climateStrings(block)) {
        expect(text).not.toMatch(/208\d/);
        expect(text).not.toContain("2070");
        expect(text.toLowerCase()).not.toContain("end of the century");
      }
    }
  });

  it("every climate string passes the shared banned-wording scan", async () => {
    fileGoldenClimate();
    for (const dir of [BIRKDALE, EXETER, EPSOM]) {
      const block = await climateBlock(dir);
      for (const text of climateStrings(block))
        for (const term of BANNED_WORDING)
          expect(text.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it("the database source reads the climate table: the covering label and the edition", async () => {
    const seen: string[] = [];
    const db = {
      async query(text: string) {
        seen.push(text);
        if (text.includes("FROM flood_climate_layers") && text.includes("LIMIT 1"))
          return { rows: [{ source_name: ROFRS_CC_SOURCE, source_date: "2026-11-03" }] };
        if (text.includes("count(*)::int AS n FROM flood_climate_layers"))
          return { rows: [{ n: 252932 }] };
        if (text.includes("FROM flood_climate_layers") && text.includes("ST_Covers"))
          return { rows: [{ risk_label: "Low" }] };
        throw new Error(`unexpected query: ${text}`);
      },
    };
    const dbSource = createFloodSource(db);
    const result = await dbSource.climateFacts("rofrs_cc", 51.515224, 0.021177);
    expect(result).toEqual({
      filedCount: 252932,
      coveringLabel: "Low",
      sourceName: ROFRS_CC_SOURCE,
      sourceDate: "2026-11-03",
    });
    // No proximity is read for the block: no distance query
    // of any kind.
    expect(seen.some((q) => q.includes("ST_Distance") || q.includes("ST_DWithin"))).toBe(false);
  });

  it("the database source short-circuits an unfiled climate table", async () => {
    const seen: string[] = [];
    const db = {
      async query(text: string) {
        seen.push(text);
        if (text.includes("LIMIT 1")) return { rows: [] };
        if (text.includes("count(*)")) return { rows: [{ n: 0 }] };
        throw new Error(`unexpected query: ${text}`);
      },
    };
    const dbSource = createFloodSource(db);
    const result = await dbSource.climateFacts("rofsw_cc", 51.5, 0.5);
    expect(result).toEqual({
      filedCount: 0,
      coveringLabel: null,
      sourceName: null,
      sourceDate: null,
    });
    expect(seen).toHaveLength(2);
  });
});

// ------------------------------------------------------------------
// M8.3 — the maps sibling's composition rule
// ------------------------------------------------------------------

describe("flood — the maps sibling (M8.3)", () => {
  const frame = floodMapFrame(51.776176, 0.60387);
  const street = {
    name: "Birkdale Rise",
    highway: "residential",
    points: [
      [0.6, 51.776],
      [0.608, 51.776],
    ] as [number, number][],
  };
  const zoneSet = {
    label: "FZ3",
    polygons: [
      [
        [
          [0.6, 51.77],
          [0.61, 51.77],
          [0.61, 51.78],
          [0.6, 51.78],
          [0.6, 51.77],
        ],
      ],
    ] as [number, number][][][],
  };

  it("a layer with shapes in frame and streets filed serves its entry", () => {
    const maps = buildFloodMaps(
      frame,
      { polygons: [zoneSet], streets: [street], homeStreet: street },
      { polygons: [], streets: [street], homeStreet: street },
    );
    expect(maps.zones?.polygons).toHaveLength(1);
    expect(maps.surfaceWater).toBeNull();
    expect(maps.streets).toHaveLength(1);
    expect(maps.homeStreet?.name).toBe("Birkdale Rise");
  });

  it("shapes without street lines serve no entry — a picture is never drawn over streets we do not hold", () => {
    const maps = buildFloodMaps(
      frame,
      { polygons: [zoneSet], streets: [], homeStreet: null },
      { polygons: [zoneSet], streets: [], homeStreet: null },
    );
    expect(maps.zones).toBeNull();
    expect(maps.surfaceWater).toBeNull();
  });

  it("the builder composes the sibling on a served bundle", async () => {
    const bundle = await buildFloodBundle(rung1(BIRKDALE), source);
    if (bundle.kind !== "flood" || bundle.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    expect(bundle.flood.maps.frame.west).toBeCloseTo(frame.west, 9);
    // The fake world files no geometry: both entries null.
    expect(bundle.flood.maps.zones).toBeNull();
    expect(bundle.flood.maps.surfaceWater).toBeNull();
  });
});
