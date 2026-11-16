import { describe, expect, it } from "vitest";
import type { AddressResolution, DirectoryPostcode } from "../lib/address";
import {
  INDUSTRIAL_SITES_NOT_COVERED_BASIS,
  INDUSTRIAL_SITES_NOT_COVERED_NORTHERN_IRELAND_LINE,
  INDUSTRIAL_SITES_NOT_COVERED_SCOTLAND_LINE,
  INDUSTRIAL_SITES_NOT_COVERED_WALES_LINE,
  INDUSTRIAL_SITES_NOT_FILED_LINE,
  buildNearbyBundle,
  haversineMiles,
  type IndustrialSiteFact,
  type IndustrialSitesBlock,
  type IndustrialSitesFacts,
  type NearbyDataSource,
} from "../lib/nearby";
import { BANNED_WORDING } from "./banned-wording";

// Guards the industrial sites block (plan step M6.32,
// decisions D50, D60 and D62): the Environment Agency
// Pollution Inventory's regulated sites within two miles,
// at the END of the nearby bundle — the report's What's
// Nearby section, never the air section — behind
// INDUSTRIAL_SITES_ENABLED (default ON, D60). Each site
// serves its filed address verbatim (the source carries
// no site name), its operator, its permit reference and
// its operator-reported releases to air for the filed
// year; a below-threshold return is a name on a labelled
// line, never a number; nothing is totalled or ranked.
// The cache behaviour (presence agreement, first-filing
// bust, the purge-free flip drill) is proven in
// tests/bundle-cache.test.ts; the short-bundle identity
// and the real-corpus serving are proven in the golden
// replay.

const FILED: Omit<IndustrialSitesFacts, "sites"> = {
  filedCount: 2856,
  dataYear: 2024,
  sourceName: "Environment Agency Pollution Inventory",
  sourceDate: "2025-11-20",
};
const NOT_FILED: IndustrialSitesFacts = {
  filedCount: 0,
  dataYear: null,
  sourceName: null,
  sourceDate: null,
  sites: [],
};

class FakeSource implements NearbyDataSource {
  facts: IndustrialSitesFacts = { ...FILED, sites: [] };
  industrialCalls = 0;
  async pointsWithin() {
    return [];
  }
  async nearestPoint() {
    return null;
  }
  async filedCount() {
    return 1000;
  }
  async industrialSiteFacts() {
    this.industrialCalls++;
    return this.facts;
  }
  async destinationsRelease() {
    return { filedCount: 0, ks4: null, ks5: null };
  }
}

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

function home(partial: Partial<DirectoryPostcode> & { postcode: string }): AddressResolution {
  return {
    rung: 1,
    kind: "home",
    directory: directory(partial),
    address: {
      postcode: partial.postcode,
      paon: "1",
      saon: null,
      street: "SOME STREET",
      town: null,
      label: "1 Some Street",
    } as never,
  };
}

// The universal homes (the replay directory's points).
const BIRKDALE = home({
  postcode: "CM3 2JT",
  latitude: 51.776176,
  longitude: 0.60387,
  lsoaCode: "E01021395",
  msoaCode: "E02004581",
});
const CARDIFF = home({
  postcode: "CF11 8AA",
  latitude: 51.467947,
  longitude: -3.192837,
  lsoaCode: "W01001945",
  msoaCode: "W02000266",
});
const EDINBURGH = home({
  postcode: "EH1 1AA",
  latitude: 55.95094,
  longitude: -3.188386,
  lsoaCode: "S01006954",
  msoaCode: "S02001936",
});
const BELFAST = home({
  postcode: "BT1 1AA",
  latitude: 54.597665,
  longitude: -5.930679,
  lsoaCode: "N01000001",
  msoaCode: "N02000001",
});

// Birkdale's golden site at its filed point (the loader
// fixture's own conversion of the published easting /
// northing — 1.328 miles from the postcode point).
const FAIRWINDS: IndustrialSiteFact = {
  permitId: "YP3432XR",
  operator: "Stuart Davis Limited",
  siteAddress: "Fairwinds Farm Poultry Unit Crouchmans Farm Road Ulting Essex",
  sitePostcode: "CM9 6QS",
  activityDescription: "INTENSIVE FARMING; > 40,000 POULTRY",
  sector: "Agriculture",
  subSector: "Intensive Farming",
  latitude: 51.75726430590678,
  longitude: 0.6095227688342956,
  releases: [
    { substance: "Ammonia", quantityKg: 3128, thresholdKg: 1000, belowThreshold: false },
    {
      substance: "Particulate matter - PM10",
      quantityKg: 3066,
      thresholdKg: 1000,
      belowThreshold: false,
    },
    {
      substance: "Nitrogen oxides (NO and NO2) as NO2",
      quantityKg: null,
      thresholdKg: 100000,
      belowThreshold: true,
    },
  ],
};

function siteAt(
  milesNorth: number,
  partial: Partial<IndustrialSiteFact> & { permitId: string },
): IndustrialSiteFact {
  return {
    operator: "An Operator Limited",
    siteAddress: "1 Works Road Town",
    sitePostcode: "AB1 2CD",
    activityDescription: "SOME ACTIVITY",
    sector: "Energy",
    subSector: "Combustion",
    latitude: 51.776176 + milesNorth / 69,
    longitude: 0.60387,
    releases: [],
    ...partial,
  };
}

async function block(
  facts: IndustrialSitesFacts,
  resolution: AddressResolution = BIRKDALE,
  options?: { industrialSitesEnabled?: boolean },
): Promise<IndustrialSitesBlock | undefined> {
  const source = new FakeSource();
  source.facts = facts;
  const bundle = await buildNearbyBundle(resolution, source, options);
  if (bundle.kind !== "distances") throw new Error("expected a distances bundle");
  return bundle.industrialSites;
}

describe("industrial sites — the flag (D60)", () => {
  it("flag off: the key is ABSENT, the source is never read, and no served string names the Inventory", async () => {
    const source = new FakeSource();
    source.facts = { ...FILED, sites: [FAIRWINDS] };
    const bundle = await buildNearbyBundle(BIRKDALE, source, { industrialSitesEnabled: false });
    if (bundle.kind !== "distances") throw new Error("expected a distances bundle");
    expect("industrialSites" in bundle).toBe(false);
    expect(bundle.industrialSites).toBeUndefined();
    expect(source.industrialCalls).toBe(0);
    expect(JSON.stringify(bundle)).not.toContain("Pollution Inventory");
    expect(JSON.stringify(bundle)).not.toContain("industrial");
  });

  it("flag on: the block is present, and rung 3 / rung 4 bundles carry no trace of it", async () => {
    const source = new FakeSource();
    const rung3 = await buildNearbyBundle(
      { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area — CM3", postcodeCount: 1 },
      source,
    );
    const rung4 = await buildNearbyBundle(
      { rung: 4, kind: "no-location", label: "No location" } as never,
      source,
    );
    expect("industrialSites" in rung3).toBe(false);
    expect("industrialSites" in rung4).toBe(false);
    expect(JSON.stringify(rung3)).not.toContain("Pollution Inventory");
    expect(source.industrialCalls).toBe(0);
  });
});

describe("industrial sites — the served block (prep checks 2, 6–9, 11)", () => {
  it("serves Birkdale's golden site whole: address verbatim, operator, permit, releases, the three pinned lines", async () => {
    const served = await block({ ...FILED, sites: [FAIRWINDS] });
    expect(served).toMatchObject({
      state: "served",
      dataYear: 2024,
      sourceName: "Environment Agency Pollution Inventory",
      sourceDate: "2025-11-20",
    });
    expect(served?.basisLine).toBe(
      "Regulated industrial sites from the Environment Agency's Pollution Inventory for 2024: the sites the Agency permits for large industrial activities, and the releases to air their operators reported for that year.",
    );
    expect(served?.reportedLine).toBe(
      "Every figure is the quantity the operator reported to the Environment Agency for 2024.",
    );
    expect(served?.thresholdLine).toBe(
      "Each substance also shows the reporting threshold for 2024 — the level at or above which a quantity must be reported. A substance reported below its threshold was still released; below the reporting threshold is not a measurement of zero.",
    );
    expect(served?.line).toBe(
      "The regulated industrial sites recorded within two miles of this postcode point are listed below, nearest first.",
    );
    expect(served?.sites).toHaveLength(1);
    const site = served!.sites[0]!;
    expect(site.permitId).toBe("YP3432XR");
    expect(site.operator).toBe("Stuart Davis Limited");
    expect(site.siteAddress).toBe("Fairwinds Farm Poultry Unit Crouchmans Farm Road Ulting Essex");
    expect(site.sitePostcode).toBe("CM9 6QS");
    expect(site.activityDescription).toBe("INTENSIVE FARMING; > 40,000 POULTRY");
    expect(site.sector).toBe("Agriculture");
    expect(site.subSector).toBe("Intensive Farming");
    // The distance basis (D22): the house haversine at
    // three decimals — the prep's 1.328 miles.
    expect(site.miles).toBe(1.328);
    expect(site.miles).toBe(
      Math.round(
        haversineMiles(51.776176, 0.60387, FAIRWINDS.latitude, FAIRWINDS.longitude) * 1000,
      ) / 1000,
    );
    // Quantified releases largest first; the below-
    // threshold return is a name on its own line, never
    // a number beside the quantified rows.
    expect(site.releases).toEqual([
      { substance: "Ammonia", quantityKg: 3128, thresholdKg: 1000 },
      { substance: "Particulate matter - PM10", quantityKg: 3066, thresholdKg: 1000 },
    ]);
    expect(site.belowThreshold).toEqual(["Nitrogen oxides (NO and NO2) as NO2"]);
    expect(site.belowThresholdLine).toBe(
      "Also reported for 2024, below the reporting threshold: Nitrogen oxides (NO and NO2) as NO2.",
    );
    expect(site.noAirReturns).toBe(false);
    expect(site.noAirReturnsLine).toBeNull();
  });

  it("the three return states stay distinct: a filed 0, a below-threshold name, and no air rows at all", async () => {
    const zero = siteAt(0.5, {
      permitId: "ZERO0001",
      releases: [{ substance: "Ammonia", quantityKg: 0, thresholdKg: 1000, belowThreshold: false }],
    });
    const brtOnly = siteAt(0.6, {
      permitId: "BRT00001",
      releases: [
        { substance: "Methane", quantityKg: null, thresholdKg: 1000, belowThreshold: true },
      ],
    });
    const noRows = siteAt(0.7, { permitId: "NOROWS01", releases: [] });
    const served = await block({ ...FILED, sites: [zero, brtOnly, noRows] });
    expect(served?.state).toBe("served");
    const [z, b, n] = served!.sites;
    expect(z?.releases).toEqual([{ substance: "Ammonia", quantityKg: 0, thresholdKg: 1000 }]);
    expect(z?.belowThreshold).toEqual([]);
    expect(z?.noAirReturns).toBe(false);
    expect(b?.releases).toEqual([]);
    expect(b?.belowThreshold).toEqual(["Methane"]);
    expect(b?.noAirReturns).toBe(false);
    expect(n?.releases).toEqual([]);
    expect(n?.belowThreshold).toEqual([]);
    expect(n?.noAirReturns).toBe(true);
    expect(n?.noAirReturnsLine).toBe("No releases to air were reported for this site for 2024.");
  });

  it("a threshold of 0 serves as 0, and a decimal quantity serves as filed", async () => {
    const site = siteAt(0.5, {
      permitId: "THRESH001",
      releases: [
        {
          substance: "Carbon Dioxide From Qualifying Renewable Fuel Sources",
          quantityKg: 670,
          thresholdKg: 0,
          belowThreshold: false,
        },
        { substance: "Ammonia", quantityKg: 123.5, thresholdKg: 1000, belowThreshold: false },
      ],
    });
    const served = await block({ ...FILED, sites: [site] });
    expect(served?.sites[0]?.releases).toEqual([
      {
        substance: "Carbon Dioxide From Qualifying Renewable Fuel Sources",
        quantityKg: 670,
        thresholdKg: 0,
      },
      { substance: "Ammonia", quantityKg: 123.5, thresholdKg: 1000 },
    ]);
  });

  it("orders sites nearest first, releases largest first, below-threshold names alphabetically — and cuts at two miles", async () => {
    const far = siteAt(1.9, {
      permitId: "FAR00001",
      releases: [
        { substance: "Zinc", quantityKg: 5, thresholdKg: 1, belowThreshold: false },
        { substance: "Ammonia", quantityKg: 50, thresholdKg: 1, belowThreshold: false },
        { substance: "Methane", quantityKg: null, thresholdKg: 1, belowThreshold: true },
        { substance: "Benzene", quantityKg: null, thresholdKg: 1, belowThreshold: true },
      ],
    });
    const near = siteAt(0.4, { permitId: "NEAR0001" });
    const beyond = siteAt(2.1, { permitId: "BEYOND01" });
    const served = await block({ ...FILED, sites: [far, beyond, near] });
    expect(served?.sites.map((s) => s.permitId)).toEqual(["NEAR0001", "FAR00001"]);
    const farServed = served!.sites[1]!;
    expect(farServed.releases.map((r) => r.substance)).toEqual(["Ammonia", "Zinc"]);
    expect(farServed.belowThreshold).toEqual(["Benzene", "Methane"]);
    expect(farServed.belowThresholdLine).toBe(
      "Also reported for 2024, below the reporting threshold: Benzene; Methane.",
    );
  });

  it("no aggregation anywhere: no total-shaped key exists, and no sum of two quantities appears (prep check 10)", async () => {
    const served = await block({ ...FILED, sites: [FAIRWINDS] });
    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object")
        for (const [k, v] of Object.entries(value)) {
          keys.push(k);
          walk(v);
        }
    };
    walk(served);
    for (const key of keys) expect(key).not.toMatch(/total|sum|rank|aggregate|combined/i);
    // 3,128 + 3,066 = 6,194: the sum of the golden site's
    // two quantities appears nowhere in the block.
    expect(JSON.stringify(served)).not.toContain("6194");
  });
});

describe("industrial sites — the absence states (prep checks 3–5)", () => {
  it("none within two miles: the filed none sentence, standing on the filed count", async () => {
    const served = await block({ ...FILED, sites: [] });
    expect(served?.state).toBe("none-within-2-miles");
    expect(served?.line).toBe(
      "No regulated industrial site in the Environment Agency's Pollution Inventory for 2024 is recorded within two miles of this postcode point.",
    );
    expect(served?.sites).toEqual([]);
    expect(served?.dataYear).toBe(2024);
  });

  it("not filed: the D30 not-filed line, never a none read from an empty register", async () => {
    const served = await block(NOT_FILED);
    expect(served?.state).toBe("not-filed");
    expect(served?.line).toBe(INDUSTRIAL_SITES_NOT_FILED_LINE);
    expect(served?.line).toBe(
      "The Pollution Inventory is not filed yet, so regulated industrial sites cannot be shown for this check.",
    );
    expect(served?.basisLine).toBeNull();
    expect(served?.thresholdLine).toBeNull();
  });

  it("Wales, Scotland and Northern Ireland serve the named not-covered state — and the source is never read", async () => {
    const cases: [AddressResolution, string][] = [
      [CARDIFF, INDUSTRIAL_SITES_NOT_COVERED_WALES_LINE],
      [EDINBURGH, INDUSTRIAL_SITES_NOT_COVERED_SCOTLAND_LINE],
      [BELFAST, INDUSTRIAL_SITES_NOT_COVERED_NORTHERN_IRELAND_LINE],
    ];
    for (const [resolution, line] of cases) {
      const source = new FakeSource();
      source.facts = { ...FILED, sites: [FAIRWINDS] };
      const bundle = await buildNearbyBundle(resolution, source);
      if (bundle.kind !== "distances") throw new Error("expected a distances bundle");
      expect(bundle.industrialSites?.state).toBe("not-covered");
      expect(bundle.industrialSites?.line).toBe(line);
      expect(bundle.industrialSites?.basisLine).toBe(INDUSTRIAL_SITES_NOT_COVERED_BASIS);
      expect(bundle.industrialSites?.sites).toEqual([]);
      expect(source.industrialCalls).toBe(0);
    }
    // The names are the inventories' own published names.
    expect(INDUSTRIAL_SITES_NOT_COVERED_WALES_LINE).toContain("Welsh Emissions Inventory");
    expect(INDUSTRIAL_SITES_NOT_COVERED_WALES_LINE).toContain("Natural Resources Wales");
    expect(INDUSTRIAL_SITES_NOT_COVERED_SCOTLAND_LINE).toContain(
      "Scottish Pollutant Release Inventory",
    );
    expect(INDUSTRIAL_SITES_NOT_COVERED_SCOTLAND_LINE).toContain(
      "Scottish Environment Protection Agency",
    );
    expect(INDUSTRIAL_SITES_NOT_COVERED_NORTHERN_IRELAND_LINE).toContain(
      "Northern Ireland Pollution Inventory",
    );
    expect(INDUSTRIAL_SITES_NOT_COVERED_NORTHERN_IRELAND_LINE).toContain(
      "Northern Ireland Environment Agency",
    );
  });
});

describe("industrial sites — wording (prep check 14)", () => {
  it("no served string in any state carries a banned term", async () => {
    const blocks = [
      await block({ ...FILED, sites: [FAIRWINDS] }),
      await block({ ...FILED, sites: [] }),
      await block(NOT_FILED),
      await block({ ...FILED, sites: [] }, CARDIFF),
      await block({ ...FILED, sites: [] }, EDINBURGH),
      await block({ ...FILED, sites: [] }, BELFAST),
    ];
    const strings: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") strings.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    blocks.forEach(walk);
    expect(strings.length).toBeGreaterThan(20);
    // The step's local additions to the shared union: the
    // block states facts about reported releases; it never
    // characterises a site or an operator.
    const banned = [...BANNED_WORDING, "polluter", "polluting", "contamination"];
    for (const text of strings)
      for (const term of banned)
        expect(text.toLowerCase(), `${term} in "${text}"`).not.toContain(term);
  });
});
