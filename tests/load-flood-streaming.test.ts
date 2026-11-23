import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGoldenSift } from "../loaders/flood-stream.mjs";
import {
  checkGolden as zonesCheckGolden,
  readFixture as zonesReadFixture,
  readLive as zonesReadLive,
} from "../loaders/load-flood-zones.mjs";
import {
  checkGolden as riversSeaCheckGolden,
  readFixture as riversSeaReadFixture,
  readLive as riversSeaReadLive,
} from "../loaders/load-flood-rivers-sea.mjs";
import {
  checkGolden as surfaceWaterCheckGolden,
  readFixture as surfaceWaterReadFixture,
  readLive as surfaceWaterReadLive,
} from "../loaders/load-flood-surface-water.mjs";
import {
  checkGolden as riversSeaClimateCheckGolden,
  readFixture as riversSeaClimateReadFixture,
  readLive as riversSeaClimateReadLive,
} from "../loaders/load-flood-rivers-sea-climate.mjs";
import {
  checkGolden as surfaceWaterClimateCheckGolden,
  readFixture as surfaceWaterClimateReadFixture,
  readLive as surfaceWaterClimateReadLive,
} from "../loaders/load-flood-surface-water-climate.mjs";
import {
  createHomeStats,
  homeStats,
  iterateDefencesFile,
  processRow,
  processRows,
  readDefencesFile,
} from "../loaders/load-flood-defences.mjs";

// BUG-187: the flood loaders used to assemble the whole
// national dataset in memory — the paged reads accumulated
// every page's items into one array, the fixture reads
// concatenated every part, and the filer then mapped the
// array into a second whole-dataset array of WKT strings
// before inserting anything. On the 8 GB play server the
// five OGC layers were kernel-killed (~5–5.6 GB RSS) or hit
// Node's heap limit; only the small defences set survived.
//
// These tests pin the streaming shape that replaced it, per
// loader instance: a read carrying an onItems sink hands
// every batch to the sink as it lands (the sink is what the
// staging inserter consumes in a filing run) and retains
// only the golden candidates, while the totals — read,
// filed, geometry-less, per-label — come out identical to
// the legacy no-sink read over the same source. The filer
// input is a pure function of an item's polygons (WKT), so
// polygon-identical sink output IS identical filing input;
// the staged-swap SQL itself is proven in CI against a real
// PostGIS, as it was before this change.

const HOMES = {
  birkdale: { lat: 51.776176, lng: 0.60387 },
  exeter: { lat: 51.515224, lng: 0.021177 },
  epsom: { lat: 51.344571, lng: -0.247104 },
};

type Item = {
  label: string;
  detail: string | null;
  polygons: Float64Array[][];
};
type ReadResult = {
  items: Item[];
  filed: number;
  geoless: number;
  perLabel: Record<string, number>;
  read: number;
  expected: number;
  edition: string;
};
type OnItems = (items: Item[], edition: string) => Promise<void>;
type OgcModule = {
  readFixture: (dir: string, opts?: { onItems?: OnItems }) => Promise<ReadResult>;
  readLive: (opts: { delaysMs: number[]; onItems?: OnItems }) => Promise<ReadResult>;
  checkGolden: (processed: { items: Item[] }) => void;
};

// An item, reduced to what filing consumes: label, detail
// and the polygon rings as plain arrays (WKT is a pure
// function of these).
const normalise = (items: Item[]) =>
  items.map((item) => ({
    label: item.label,
    detail: item.detail,
    polygons: item.polygons.map((polygon) => polygon.map((ring) => Array.from(ring))),
  }));

// The fixture proof, per loader: the streaming read over
// the loader's own fixture files the same items, in the
// same order, with the same totals as the legacy read —
// and its retained set is exactly the golden sift of the
// full set, over which the loader's own golden checks pass.
async function expectFixtureStreaming(mod: OgcModule, fixtureDir: string) {
  const legacy = await mod.readFixture(fixtureDir);
  const sunk: Item[] = [];
  const streamed = await mod.readFixture(fixtureDir, {
    onItems: async (items) => {
      sunk.push(...items);
    },
  });
  expect(streamed.read).toBe(legacy.read);
  expect(streamed.expected).toBe(legacy.expected);
  expect(streamed.filed).toBe(legacy.filed);
  expect(streamed.filed).toBe(legacy.items.length);
  expect(streamed.geoless).toBe(legacy.geoless);
  expect(streamed.perLabel).toEqual(legacy.perLabel);
  expect(streamed.edition).toBe(legacy.edition);
  expect(normalise(sunk)).toEqual(normalise(legacy.items));
  const sift = createGoldenSift(HOMES);
  for (const item of legacy.items) sift.offer(item);
  expect(normalise(streamed.items)).toEqual(normalise(sift.items as Item[]));
  expect(() => mod.checkGolden(streamed)).not.toThrow();
}

// A stubbed live service: a WMS capabilities document naming
// one dated build layer, a count oracle, and pages of tiny
// squares near (0, 0) — thousands of miles from every golden
// home, so a streaming read must retain NONE of them while
// the sink still receives every one.
type LiveStub = {
  wmsName: string;
  total: number;
  pageSize: number;
  feature: (i: number) => unknown;
  edition: string;
};

const squareAt = (i: number) => {
  const x = i * 0.01;
  return {
    type: "Polygon",
    coordinates: [
      [
        [x, 0],
        [x + 0.001, 0],
        [x + 0.001, 0.001],
        [x, 0.001],
        [x, 0],
      ],
    ],
  };
};

async function expectLiveStreaming(mod: OgcModule, stub: LiveStub) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const text = String(url);
    if (text.includes("GetCapabilities"))
      return {
        ok: true,
        text: async () => `<Layer><Name>${stub.wmsName}</Name></Layer>`,
        json: async () => ({}),
      };
    if (text.includes("startIndex=")) {
      const start = Number(new URL(text).searchParams.get("startIndex"));
      const features = Array.from({ length: Math.min(stub.pageSize, stub.total - start) }, (_, k) =>
        stub.feature(start + k),
      );
      return {
        ok: true,
        json: async () => ({ numberMatched: stub.total, features }),
        text: async () => "",
      };
    }
    if (text.includes("limit=1&"))
      return { ok: true, json: async () => ({ numberMatched: stub.total }), text: async () => "" };
    throw new Error(`unexpected url ${text}`);
  }) as typeof fetch;
  try {
    const sunk: Item[] = [];
    const streamed = await mod.readLive({
      delaysMs: [],
      onItems: async (items) => {
        sunk.push(...items);
      },
    });
    expect(streamed.read).toBe(stub.total);
    expect(streamed.expected).toBe(stub.total);
    expect(streamed.filed).toBe(stub.total);
    expect(streamed.edition).toBe(stub.edition);
    expect(sunk).toHaveLength(stub.total);
    expect(streamed.items).toHaveLength(0);
  } finally {
    globalThis.fetch = realFetch;
  }
}

const FIXTURES = join(process.cwd(), "tests/fixtures");

describe("load-flood-zones streaming (BUG-187)", () => {
  const mod = {
    readFixture: zonesReadFixture,
    readLive: zonesReadLive,
    checkGolden: zonesCheckGolden,
  } as unknown as OgcModule;
  it("load-flood-zones: streaming fixture read files identically to the legacy read", async () => {
    await expectFixtureStreaming(mod, join(FIXTURES, "flood-zones"));
  }, 30_000);
  it("load-flood-zones: streaming live read hands every page to the sink and retains nothing far from the golden homes", async () => {
    await expectLiveStreaming(mod, {
      wmsName: "Flood_Zones_2_3_Rivers_and_Sea_03_11_2026",
      total: 260,
      pageSize: 250,
      edition: "2026-11-03",
      feature: (i) => ({
        properties: { flood_zone: "FZ3", flood_source: "river", origin: "modelled" },
        geometry: squareAt(i),
      }),
    });
  });
});

describe("load-flood-rivers-sea streaming (BUG-187)", () => {
  const mod = {
    readFixture: riversSeaReadFixture,
    readLive: riversSeaReadLive,
    checkGolden: riversSeaCheckGolden,
  } as unknown as OgcModule;
  it("load-flood-rivers-sea: streaming fixture read files identically to the legacy read", async () => {
    await expectFixtureStreaming(mod, join(FIXTURES, "flood-rivers-sea"));
  }, 30_000);
  it("load-flood-rivers-sea: streaming live read hands every page to the sink and retains nothing far from the golden homes", async () => {
    await expectLiveStreaming(mod, {
      wmsName: "rofrs_4band_03_11_2026",
      total: 260,
      pageSize: 250,
      edition: "2026-11-03",
      feature: (i) => ({ properties: { risk_band: "Low" }, geometry: squareAt(i) }),
    });
  });
});

describe("load-flood-surface-water streaming (BUG-187)", () => {
  const mod = {
    readFixture: surfaceWaterReadFixture,
    readLive: surfaceWaterReadLive,
    checkGolden: surfaceWaterCheckGolden,
  } as unknown as OgcModule;
  it("load-flood-surface-water: streaming fixture read files identically to the legacy read", async () => {
    await expectFixtureStreaming(mod, join(FIXTURES, "flood-surface-water"));
  }, 30_000);
  it("load-flood-surface-water: streaming live read hands every page to the sink and retains nothing far from the golden homes", async () => {
    await expectLiveStreaming(mod, {
      wmsName: "rofsw_03_11_2026",
      total: 110,
      pageSize: 100,
      edition: "2026-11-03",
      feature: (i) => ({ properties: { risk_band: "Low" }, geometry: squareAt(i) }),
    });
  });
});

describe("load-flood-rivers-sea-climate streaming (BUG-187)", () => {
  const mod = {
    readFixture: riversSeaClimateReadFixture,
    readLive: riversSeaClimateReadLive,
    checkGolden: riversSeaClimateCheckGolden,
  } as unknown as OgcModule;
  it("load-flood-rivers-sea-climate: streaming fixture read files identically to the legacy read", async () => {
    await expectFixtureStreaming(mod, join(FIXTURES, "flood-rivers-sea-climate"));
  }, 30_000);
  it("load-flood-rivers-sea-climate: streaming live read hands every page to the sink and retains nothing far from the golden homes", async () => {
    await expectLiveStreaming(mod, {
      wmsName: "rofrs_cc01_4band_03_11_2026",
      total: 260,
      pageSize: 250,
      edition: "2026-11-03",
      feature: (i) => ({ properties: { risk_band: "Low" }, geometry: squareAt(i) }),
    });
  });
});

describe("load-flood-surface-water-climate streaming (BUG-187)", () => {
  const mod = {
    readFixture: surfaceWaterClimateReadFixture,
    readLive: surfaceWaterClimateReadLive,
    checkGolden: surfaceWaterClimateCheckGolden,
  } as unknown as OgcModule;
  it("load-flood-surface-water-climate: streaming fixture read files identically to the legacy read", async () => {
    await expectFixtureStreaming(mod, join(FIXTURES, "flood-surface-water-climate"));
  }, 30_000);
  it("load-flood-surface-water-climate: streaming live read hands every page to the sink and retains nothing far from the golden homes", async () => {
    await expectLiveStreaming(mod, {
      wmsName: "rofsw_cc01_10_11_2026",
      total: 110,
      pageSize: 100,
      edition: "2026-11-10",
      feature: (i) => ({ properties: { risk_band: "Low" }, geometry: squareAt(i) }),
    });
  });
});

describe("load-flood-defences streaming (BUG-187)", () => {
  const fixtureDir = join(FIXTURES, "flood-defences");
  const gpkgPath = join(mkdtempSync(join(tmpdir(), "cmnh-def-stream-")), "aims.gpkg");
  writeFileSync(
    gpkgPath,
    Buffer.from(
      readFileSync(join(fixtureDir, "aims.gpkg.b64"), "utf8").replace(/\s+/g, ""),
      "base64",
    ),
  );
  const rows = readDefencesFile(gpkgPath);

  it("load-flood-defences: the iterated file read yields exactly the collected read, row for row", () => {
    const streamed = [...iterateDefencesFile(gpkgPath)];
    expect(streamed).toHaveLength(rows.length);
    expect(streamed).toEqual(rows);
  });

  it("load-flood-defences: the streamed golden statistics equal the whole-read statistics", () => {
    const acc = createHomeStats();
    for (const row of rows) acc.offer(row);
    expect(acc.result()).toEqual(homeStats(rows));
  });

  it("load-flood-defences: row-by-row transformation files identically to the batch transform", () => {
    expect(rows.map((row: unknown) => processRow(row))).toEqual(processRows(rows));
  });
});
