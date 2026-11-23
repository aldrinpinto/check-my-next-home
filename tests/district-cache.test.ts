import { describe, expect, it } from "vitest";

import type { AddressQueryable } from "../lib/address";
import {
  buildDistrictBundle,
  startDistrictBuild,
  type DistrictDataSource,
  type DistrictWarningItem,
  type DistrictWarningSource,
} from "../lib/district";
import {
  DISTRICT_DEPENDENCIES,
  buildDistrictBundleCached,
  createDistrictCache,
  districtBuildFor,
} from "../lib/district-cache";
import { LOADER_SCHEDULE } from "../loaders/run-loaders.mjs";

// The district bundle cache (founder fix batch, 19 Nov
// 2026 — audit Part 3, the district latency item): the
// D29 pattern keyed by outward. District facts change
// only on re-filing, so a repeat view of a district page
// serves from the entry — near-instant against the
// measured 12–14s of recompute. The proofs mirror the
// bundle cache's own: a second build serves from the
// entry with no builder-source reads beyond the
// live-warnings refresh; live flood warnings are never
// stored (composed fresh on every serve, the flood
// brain's D42 rule carried to the district page); a
// moved loader stamp and a moved guard count both
// invalidate; a poisoned entry and a missing cache table
// degrade to a direct build, never to a wrong answer.

class FakeDb implements AddressQueryable {
  stamps = new Map<string, string>();
  entries = new Map<string, { version: unknown; bundle: unknown }>();
  cacheTableDropped = false;
  districtPostcodes = 2;
  districtSales = 10;
  pickingHomes = 42;
  floodCounts = new Map<string, number>([
    ["flood_zone", 200],
    ["rofrs", 500],
    ["rofsw", 300],
  ]);
  floodDefences = 834;
  districtSchools = 7;
  censusRows = 2;
  lsoaBases = 3;
  broadbandHash: string | null = "bb-hash";
  mobileHash: string | null = "mob-hash";

  async query(text: string, params: readonly unknown[] = []) {
    if (text.includes("FROM loader_run_items")) {
      const items = params[0] as string[];
      return {
        rows: items
          .filter((item) => this.stamps.has(item))
          .map((item) => ({ item, finished_at: this.stamps.get(item)! })),
      };
    }
    if (text.includes("FROM bundle_cache") || text.includes("INTO bundle_cache")) {
      if (this.cacheTableDropped) throw new Error('relation "bundle_cache" does not exist');
      const [postcode, brain, rung, homeKey] = params as [string, string, number, string];
      const key = [postcode, brain, rung, homeKey].join(" ");
      if (text.includes("SELECT")) {
        const entry = this.entries.get(key);
        return { rows: entry ? [{ version: entry.version, bundle: entry.bundle }] : [] };
      }
      this.entries.set(key, {
        version: JSON.parse(params[4] as string),
        bundle: JSON.parse(params[5] as string),
      });
      return { rows: [] };
    }
    if (text.includes("answers -> 'broadband'")) return { rows: [{ h: this.broadbandHash }] };
    if (text.includes("answers -> 'mobile'")) return { rows: [{ h: this.mobileHash }] };
    if (text.includes("FROM flood_layers"))
      return {
        rows: [...this.floodCounts.entries()].map(([layer_type, n]) => ({ layer_type, n })),
      };
    if (text.includes("FROM flood_defences")) return { rows: [{ n: this.floodDefences }] };
    if (text.includes("FROM price_paid")) return { rows: [{ n: this.districtSales }] };
    if (text.includes("FROM picking_index")) return { rows: [{ n: this.pickingHomes }] };
    if (text.includes("FROM census_stats")) return { rows: [{ n: this.censusRows }] };
    if (text.includes("FROM lsoa_bases")) return { rows: [{ n: this.lsoaBases }] };
    if (text.includes("FROM schools")) return { rows: [{ n: this.districtSchools }] };
    if (text.includes("FROM postcode_cache")) return { rows: [{ n: this.districtPostcodes }] };
    throw new Error(`FakeDb: unhandled SQL: ${text}`);
  }
}

const POSTCODES = [
  {
    postcode: "ZZ9 1AA",
    latitude: 51.7,
    longitude: 0.46,
    council: "Braintree",
    region: "East of England",
    lsoaCode: "E01000001",
    msoaCode: "E02000001",
    sourceName: "Office for National Statistics",
    sourceDate: "2024-11-01",
  },
  {
    postcode: "ZZ9 1AB",
    latitude: 51.71,
    longitude: 0.47,
    council: "Braintree",
    region: "East of England",
    lsoaCode: "E01000002",
    msoaCode: "E02000001",
    sourceName: "Office for National Statistics",
    sourceDate: "2024-11-01",
  },
];

function fakeSource() {
  const calls = { postcodes: 0, soldFacts: 0 };
  const source: DistrictDataSource = {
    postcodes: async () => {
      calls.postcodes += 1;
      return POSTCODES;
    },
    lsoaBases: async () => [],
    censusRows: async () => [],
    imdDeciles: async () => ({ deciles: [], sourceName: null, sourceDate: null }),
    councilTax: async () => null,
    soldFacts: async () => {
      calls.soldFacts += 1;
      return { rows: [], sourceName: null, sourceDate: null };
    },
    broadbandAnswers: async () => [],
    mobileAnswers: async () => [],
    schools: async () => ({ rows: [], sourceName: null, sourceDate: null }),
    healthCounts: async () => [],
    stations: async () => [],
    pickingHomes: async () => 0,
    places: async () => ({
      localities: [],
      towns: [],
      counties: [],
      settlementCounties: [],
      settlementPostcodes: [],
    }),
    floodFacts: async () => ({
      filedCount: 0,
      covered: false,
      assignments: [],
      sourceName: null,
      sourceDate: null,
    }),
    defenceWatercourses: async () => [],
    airSquares: async () => ({ squares: [], sourceName: null, sourceDate: null }),
    crimeFacts: async () => null,
  };
  return { source, calls };
}

function warningSource(descriptions: string[]): DistrictWarningSource {
  const items: DistrictWarningItem[] = descriptions.map((description) => ({
    severity: "Flood alert",
    severityLevel: 3,
    description,
    riverOrSea: null,
    latitude: null,
    longitude: null,
  }));
  return { warningsNear: async () => items };
}

function succeedAll(db: FakeDb, iso = "2026-11-01T05:15:00.000Z") {
  for (const item of DISTRICT_DEPENDENCIES) db.stamps.set(item, iso);
}

describe("district cache — the dependency pin", () => {
  it("names only loader items the schedule carries", () => {
    const scheduled = new Set(LOADER_SCHEDULE.map((entry) => entry.item));
    for (const item of DISTRICT_DEPENDENCIES) {
      expect(scheduled.has(item), `${item} is not in LOADER_SCHEDULE`).toBe(true);
    }
  });
});

describe("district cache — serve, invalidate, degrade", () => {
  it("serves the second build from the entry: no builder reads, warnings composed fresh", async () => {
    const db = new FakeDb();
    succeedAll(db);
    const cache = createDistrictCache(db);
    const { source, calls } = fakeSource();

    const first = await buildDistrictBundleCached("ZZ9", source, cache, {
      warningSource: warningSource(["River Chelmer at Hatfield Peverel"]),
    });
    expect(first.kind).toBe("district");
    if (first.kind !== "district") return;
    expect(first.sections.flood.warnings.areas).toEqual([
      { severity: "Flood alert", description: "River Chelmer at Hatfield Peverel" },
    ]);
    expect(calls.soldFacts).toBe(1);

    // The stored entry carries no live warnings at all.
    const stored = [...db.entries.values()][0]?.bundle as typeof first;
    expect(stored.sections.flood.warnings.state).toBe("unavailable");

    const second = await buildDistrictBundleCached("ZZ9", source, cache, {
      warningSource: warningSource(["River Brain at Danbury"]),
    });
    expect(second.kind).toBe("district");
    if (second.kind !== "district") return;
    // No recompute: the builder's own reads never ran
    // again — the one extra postcodes read is the
    // warnings refresh's spread read.
    expect(calls.soldFacts).toBe(1);
    expect(calls.postcodes).toBe(2);
    // The warnings are the NEW feed's, not the stored
    // serve's: a cached bundle can neither freeze a
    // warning nor hide one.
    expect(second.sections.flood.warnings.areas).toEqual([
      { severity: "Flood alert", description: "River Brain at Danbury" },
    ]);
    // Everything else is the cached bundle, byte for byte.
    expect({ ...second, sections: { ...second.sections, flood: first.sections.flood } }).toEqual(
      first,
    );
  });

  it("without a warnings source, a cache hit reads nothing from the builder's source", async () => {
    const db = new FakeDb();
    succeedAll(db);
    const cache = createDistrictCache(db);
    const { source, calls } = fakeSource();
    await buildDistrictBundleCached("ZZ9", source, cache);
    await buildDistrictBundleCached("ZZ9", source, cache);
    expect(calls.postcodes).toBe(1);
    expect(calls.soldFacts).toBe(1);
  });

  it("a moved loader stamp invalidates the entry", async () => {
    const db = new FakeDb();
    succeedAll(db);
    const cache = createDistrictCache(db);
    const { source, calls } = fakeSource();
    await buildDistrictBundleCached("ZZ9", source, cache);
    db.stamps.set("load-census", "2026-12-01T05:15:00.000Z");
    await buildDistrictBundleCached("ZZ9", source, cache);
    expect(calls.soldFacts).toBe(2);
  });

  it("a moved guard count invalidates the entry — a re-filing that moves no stamp", async () => {
    const db = new FakeDb();
    succeedAll(db);
    const cache = createDistrictCache(db);
    const { source, calls } = fakeSource();
    await buildDistrictBundleCached("ZZ9", source, cache);
    db.floodCounts.set("rofsw", 301);
    await buildDistrictBundleCached("ZZ9", source, cache);
    expect(calls.soldFacts).toBe(2);
  });

  it("a poisoned entry degrades to a recompute, never to a wrong answer", async () => {
    const db = new FakeDb();
    succeedAll(db);
    const cache = createDistrictCache(db);
    const { source, calls } = fakeSource();
    const version = await cache.versionFor("ZZ9");
    expect(version).not.toBeNull();
    // An entry for another outward under this key, and a
    // shape missing this build's flood keys: both must
    // degrade.
    await cache.writeEntry("ZZ9", version!, {
      kind: "district",
      outward: "CM3",
      head: {},
      sections: {},
    });
    const bundle = await buildDistrictBundleCached("ZZ9", source, cache);
    expect(bundle.kind).toBe("district");
    expect(bundle.outward).toBe("ZZ9");
    expect(calls.soldFacts).toBe(1);
  });

  it("with the cache table gone, the build serves exactly as the plain builder does", async () => {
    const db = new FakeDb();
    succeedAll(db);
    db.cacheTableDropped = true;
    const cache = createDistrictCache(db);
    const { source, calls } = fakeSource();
    const cached = await buildDistrictBundleCached("ZZ9", source, cache);
    const plain = await buildDistrictBundle("ZZ9", source);
    expect(cached).toEqual(plain);
    expect(calls.soldFacts).toBe(2);
  });

  it("caches the not-covered kind under the same discipline", async () => {
    const db = new FakeDb();
    succeedAll(db);
    const cache = createDistrictCache(db);
    const { source, calls } = fakeSource();
    source.postcodes = async () => {
      calls.postcodes += 1;
      return POSTCODES.map((row) => ({
        ...row,
        lsoaCode: `S01${row.lsoaCode.slice(3)}`,
      }));
    };
    const first = await buildDistrictBundleCached("ZZ9", source, cache);
    expect(first).toEqual({ kind: "not-covered", outward: "ZZ9", nation: "scotland" });
    const second = await buildDistrictBundleCached("ZZ9", source, cache);
    expect(second).toEqual(first);
    expect(calls.postcodes).toBe(1);
  });

  it("two concurrent serves of one district share one build (the checking screen's single-flight)", async () => {
    const db = new FakeDb();
    succeedAll(db);
    const cache = createDistrictCache(db);
    const { source, calls } = fakeSource();
    // The wider-area page's streamed results and the
    // checking screen's payload call arrive together: one
    // build serves both, and both callers receive the very
    // same bundle — the screen's lines and the results
    // behind it are derived from one build, never two.
    const [page, payload] = await Promise.all([
      buildDistrictBundleCached("ZZ9", source, cache),
      buildDistrictBundleCached("ZZ9", source, cache),
    ]);
    expect(calls.postcodes).toBe(1);
    expect(payload).toBe(page);
    // Once the build settles the flight is over: the next
    // serve takes the ordinary path and reads the entry.
    const third = await buildDistrictBundleCached("ZZ9", source, cache);
    expect(third).toEqual(page);
    expect(calls.postcodes).toBe(1);
  });
});

describe("district build — the staged settlement (BUG-171)", () => {
  it("two callers join the one build, and the registry evicts on settlement", async () => {
    const db = new FakeDb();
    succeedAll(db);
    const cache = createDistrictCache(db);
    const { source } = fakeSource();
    const first = districtBuildFor("ZZ9", source, cache);
    const second = districtBuildFor("ZZ9", source, cache);
    expect(second).toBe(first);
    await first.bundle;
    const third = districtBuildFor("ZZ9", source, cache);
    expect(third).not.toBe(first);
    await third.bundle;
  });

  it("a group's sections settle without waiting for the district's slow reads", async () => {
    // The flood reads hang until the test releases them:
    // the schools section (and so the family group)
    // settles regardless, and the bundle stays unsettled
    // until the flood lands — the construction proof of
    // the per-group split.
    let releaseFlood: (() => void) | null = null;
    const floodGate = new Promise<void>((resolve) => {
      releaseFlood = resolve;
    });
    const { source } = fakeSource();
    const hanging = {
      ...source,
      floodFacts: async () => {
        await floodGate;
        return {
          filedCount: 0,
          covered: false,
          assignments: [],
          sourceName: null,
          sourceDate: null,
        };
      },
    };
    const build = startDistrictBuild("ZZ9", hanging);
    expect(await build.settlement).toEqual({ kind: "district" });
    const schools = await build.sections.schools;
    expect(schools.state).toBe("not-filed");
    let bundleSettled = false;
    void build.bundle.then(() => {
      bundleSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(bundleSettled).toBe(false);
    releaseFlood!();
    const bundle = await build.bundle;
    expect(bundle.kind).toBe("district");
  });

  it("the not-covered settlement answers from the directory read alone", async () => {
    // Every data read hangs: the settlement must still
    // answer, from the postcodes read and nothing else
    // (BUG-017's rule, on the staged build).
    const scottish = [
      {
        postcode: "EH9 1AA",
        latitude: 55.9,
        longitude: -3.2,
        council: "Edinburgh",
        region: "Scotland",
        lsoaCode: "S01000001",
        msoaCode: "S02000001",
        sourceName: "Office for National Statistics",
        sourceDate: "2024-11-01",
      },
    ];
    const hang = () => new Promise<never>(() => {});
    const { source } = fakeSource();
    const source2: DistrictDataSource = {
      ...source,
      postcodes: async () => scottish,
      lsoaBases: hang,
      censusRows: hang,
      soldFacts: hang,
      schools: hang,
      places: hang,
    };
    const build = startDistrictBuild("EH9", source2);
    expect(await build.settlement).toEqual({ kind: "not-covered", nation: "scotland" });
    const bundle = await build.bundle;
    expect(bundle).toEqual({ kind: "not-covered", outward: "EH9", nation: "scotland" });
  });
});
