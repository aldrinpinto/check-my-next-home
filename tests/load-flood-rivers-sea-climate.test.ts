import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BAND_HIGH,
  BAND_LOW,
  SNAPSHOT,
  VOCAB,
  checkGolden,
  parseEdition,
  processFeatures,
  readLive,
} from "../loaders/load-flood-rivers-sea-climate.mjs";

// Guards the flood rivers & sea CLIMATE SCENARIO loader (plan
// step M6.28, decision D49): the scenario product files as
// its OWN layer_type ('rofrs_cc') into its OWN table
// (flood_climate_layers, migration 0025) — never into
// flood_layers, whose contract is the three present-day
// products, so no present-day query can ever serve a
// scenario shape as a present-day fact or the reverse.
// Absence under the scenario is "no band published", a state
// asserted as DISTINCT from every filed band — above all
// from the present-day product's "Very low" (at Exeter the
// scenario says Low where present day says Very low; the
// two facts are locked separately and never compared). The
// fixture holds real features captured 16 Nov 2026 in
// ±0.01° boxes around the golden homes; the loader's own
// golden checks run over it; the filing proof runs in CI
// against a real PostGIS; the full-file proof is the
// loader's live verify-only run (252,932 features at the
// 16 Nov 2026 snapshot).

const loader = readFileSync(
  join(process.cwd(), "loaders/load-flood-rivers-sea-climate.mjs"),
  "utf8",
);
const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/flood-rivers-sea-climate");

type Feature = {
  id?: string;
  properties: Record<string, string | number>;
  geometry: { type: string; coordinates: unknown } | null;
};
// Oversized captures are held as numbered parts whose feature
// arrays concatenate to the capture, in order (see the fixture
// README) — the helper mirrors the loader's fixture reader.
const loadFixture = (name: string): Feature[] => {
  const entries = readdirSync(fixtureDir);
  const parts = entries
    .filter((entry) => new RegExp(`^${name}-\\d+\\.geojson$`).test(entry))
    .sort();
  const names = entries.includes(`${name}.geojson`) ? [`${name}.geojson`] : parts;
  return names.flatMap(
    (entry) => JSON.parse(readFileSync(join(fixtureDir, entry), "utf8")).features,
  );
};
const bands = loadFixture("flood-rivers-sea-climate");
const stamp = JSON.parse(readFileSync(join(fixtureDir, "fixture.json"), "utf8"));

const HOMES = {
  birkdale: { lat: 51.776176, lng: 0.60387 },
  exeter: { lat: 51.515224, lng: 0.021177 },
  epsom: { lat: 51.344571, lng: -0.247104 },
};
type Pt = [number, number];
type Polys = Pt[][][]; // polygons -> rings -> points

function polysOf(f: Feature): Polys {
  const g = f.geometry;
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates as Pt[][]];
  if (g.type === "MultiPolygon") return g.coordinates as Pt[][][];
  return [];
}
function ringContains(ring: Pt[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function covering(feats: Feature[], home: { lat: number; lng: number }) {
  return feats.filter((f) =>
    polysOf(f).some((poly) => {
      let ins = false;
      for (const r of poly) if (ringContains(r, home.lng, home.lat)) ins = !ins;
      return ins;
    }),
  );
}

// A minimal valid feature: a small square polygon carrying
// one band. Used by the vocabulary and paging tests.
function tinyFeature(band: string, at = 0): Feature {
  const x = at * 0.01;
  return {
    properties: { risk_band: band },
    geometry: {
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
    },
  };
}

describe("flood rivers & sea climate loader sources", () => {
  it("reads the EA rofrs_cc01_4band collection via OGC API Features and files its own layer type into its own table", () => {
    expect(loader).toContain("de4079f2-3569-45b2-8009-a00bccc520a1");
    expect(loader).toContain("rofrs_cc01_4band/items");
    expect(loader).toContain('LAYER_TYPE = "rofrs_cc"');
    expect(loader).toContain("INSERT INTO flood_climate_layers");
    expect(loader).toContain("DELETE FROM flood_climate_layers");
  });

  it("never files into flood_layers — the present-day table is structurally out of reach", () => {
    expect(loader).not.toContain("INSERT INTO flood_layers");
    expect(loader).not.toContain("DELETE FROM flood_layers");
    expect(loader).not.toContain('LAYER_TYPE = "rofrs"');
    expect(loader).toContain("structurally\n//     impossible");
  });

  it("files the depth basis into detail and keeps risk_label the clean vocabulary, in the features' own casing", () => {
    expect(loader).toContain('DETAIL = ">0 m"');
    expect(VOCAB).toEqual(["High", "Medium", "Low", "Very low"]);
    expect(loader).toContain('export const VOCAB = ["High", "Medium", "Low", "Very low"]');
  });

  it("pages at 250 and trusts only the unfiltered count", () => {
    expect(loader).toContain("const PAGE = 250");
    expect(loader).toContain("numberMatched");
    expect(loader).toContain("silently ignores property filters");
    expect(loader).not.toContain("risk_band=High");
  });

  it("files shapes as published and repairs validity only at filing", () => {
    expect(loader).toContain("ST_MakeValid");
    expect(loader).toContain("ST_IsValid");
    expect(loader).not.toContain("ST_Simplify");
    expect(loader).not.toContain("ST_Buffer");
  });

  it("files only published shapes — no synthetic absence polygon is manufactured", () => {
    expect(loader).toContain("no synthetic absence polygon");
    expect(loader).not.toContain("Zone 1");
  });

  it("takes the edition from the WMS build layer name, the serving system's own stamp", () => {
    expect(loader).toContain("nafra2-risk-of-flooding-from-rivers-and-sea-climate-change/wms");
    expect(loader).toContain("build dates");
  });

  it("is registered quarterly with a friendly name, a fixture invocation and an npm script", () => {
    expect(runner).toContain(
      '{ item: "load-flood-rivers-sea-climate", cadence: "quarterly", timeoutMinutes: 30 }',
    );
    expect(runner).toContain('"load-flood-rivers-sea-climate": "Flood climate outlook');
    expect(runner).toContain('runAndLog("load-flood-rivers-sea-climate"');
    expect(runner).toContain('fx("flood-rivers-sea-climate")');
    const pkg = readFileSync(join(process.cwd(), "package.json"), "utf8");
    expect(pkg).toContain(
      '"load:flood-rivers-sea-climate": "node loaders/load-flood-rivers-sea-climate.mjs"',
    );
  });

  it("has its canary probe in the FLOOD_PRODUCTS pattern, with the Exeter Low anchor", () => {
    expect(canary).toContain('"flood-rivers-sea-climate"');
    expect(canary).toContain("snapshot: 252932");
    expect(canary).toContain('await run("flood-rivers-sea-climate"');
  });
});

describe("the count band (fail-closed)", () => {
  it("pins the snapshot and its ±10% band", () => {
    expect(SNAPSHOT).toBe(252932);
    expect(BAND_LOW).toBe(227638);
    expect(BAND_HIGH).toBe(278226);
    expect(loader).toContain("outside the expected band");
    expect(loader).toContain("nothing filed");
  });
});

describe("edition stamping", () => {
  it("parses the single dated build layer out of the WMS capabilities", () => {
    const xml =
      "<Layer><Name>rofrs_cc01_4band</Name></Layer><Layer><Name>rofrs_cc01_4band_03_11_2026</Name></Layer>" +
      "<Layer><Name>rofrs_cc01_4band_0_2m_depth</Name></Layer>";
    expect(parseEdition(xml)).toBe("2026-11-03");
  });

  it("refuses two distinct build dates — no single edition can be stamped", () => {
    const xml = "<Name>rofrs_cc01_4band_03_11_2026</Name><Name>rofrs_cc01_4band_10_11_2026</Name>";
    expect(() => parseEdition(xml)).toThrow(/no single edition can be stamped/);
  });

  it("refuses a capabilities document with no dated build layer", () => {
    expect(() => parseEdition("<Name>rofrs_cc01_4band</Name>")).toThrow(
      /no single edition can be stamped/,
    );
  });

  it("the fixture carries the same edition the live WMS stamped on capture day", () => {
    expect(stamp.edition).toBe("2026-11-03");
    expect(stamp.captured).toBe("2026-11-16");
  });
});

describe("band vocabulary (fail-closed)", () => {
  it("files an in-vocabulary feature and counts it", () => {
    const processed = processFeatures([tinyFeature("Low")]) as {
      items: unknown[];
      perLabel: Record<string, number>;
    };
    expect(processed.items).toHaveLength(1);
    expect(processed.perLabel.Low).toBe(1);
  });

  it("fails the run on a band outside the published vocabulary", () => {
    expect(() => processFeatures([tinyFeature("Extreme")])).toThrow(
      /outside \{High, Medium, Low, Very low\}/,
    );
  });

  it("fails the run on the notes' casing — the vocabulary is the features' own", () => {
    expect(() => processFeatures([tinyFeature("Very Low")])).toThrow(/outside \{/);
  });

  it("counts a geometry-less feature, never files it", () => {
    const processed = processFeatures([{ properties: { risk_band: "Low" }, geometry: null }]) as {
      items: unknown[];
      geoless: number;
    };
    expect(processed.items).toHaveLength(0);
    expect(processed.geoless).toBe(1);
  });
});

describe("paging (the read reconciles exactly with the count oracle)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const WMS_XML = "<Layer><Name>rofrs_cc01_4band_03_11_2026</Name></Layer>";

  function stubFetch(pages: Map<number, unknown>, total: number) {
    globalThis.fetch = (async (url: string) => {
      const text = String(url);
      if (text.includes("/wms"))
        return { ok: true, text: async () => WMS_XML, json: async () => ({}) };
      if (text.includes("limit=1&"))
        return { ok: true, json: async () => ({ numberMatched: total }), text: async () => "" };
      const start = Number(new URL(text).searchParams.get("startIndex"));
      const body = pages.get(start);
      if (!body) throw new Error(`no stubbed page at startIndex ${start}`);
      return { ok: true, json: async () => body, text: async () => "" };
    }) as typeof fetch;
  }

  it("pages through the whole collection and reconciles read == numberMatched", async () => {
    const all = Array.from({ length: 260 }, (_, i) => tinyFeature(i % 2 ? "Low" : "High", i));
    const pages = new Map<number, unknown>([
      [0, { numberMatched: 260, features: all.slice(0, 250) }],
      [250, { numberMatched: 260, features: all.slice(250) }],
    ]);
    stubFetch(pages, 260);
    const result = (await readLive({ delaysMs: [] })) as {
      read: number;
      expected: number;
      items: unknown[];
      perLabel: Record<string, number>;
      edition: string;
    };
    expect(result.read).toBe(260);
    expect(result.expected).toBe(260);
    expect(result.items).toHaveLength(260);
    expect(result.perLabel.High + result.perLabel.Low).toBe(260);
    expect(result.edition).toBe("2026-11-03");
  });

  it("fails loudly when the count moves mid-read — nothing is filed from a moved read", async () => {
    const all = Array.from({ length: 260 }, (_, i) => tinyFeature("Low", i));
    const pages = new Map<number, unknown>([
      [0, { numberMatched: 260, features: all.slice(0, 250) }],
      [250, { numberMatched: 261, features: all.slice(250) }],
    ]);
    stubFetch(pages, 260);
    await expect(readLive({ delaysMs: [] })).rejects.toThrow(/count moved mid-read/);
  });

  it("fails loudly when a page comes back empty before the count is reached", async () => {
    const pages = new Map<number, unknown>([[0, { numberMatched: 260, features: [] }]]);
    stubFetch(pages, 260);
    await expect(readLive({ delaysMs: [] })).rejects.toThrow(/paging stopped at 0 of 260/);
  });
});

describe("fixture vocabulary contract (computed from the fetched data)", () => {
  it("holds 37 features, every band in {High, Medium, Low, Very low}, counts pinned", () => {
    expect(bands).toHaveLength(37);
    const counts = new Map<string, number>();
    for (const f of bands) {
      const label = f.properties.risk_band as string;
      expect(["High", "Medium", "Low", "Very low"]).toContain(label);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    expect(counts.get("High")).toBe(8);
    expect(counts.get("Medium")).toBe(9);
    expect(counts.get("Low")).toBe(11);
    expect(counts.get("Very low")).toBe(9);
  });
});

describe("fixture golden facts", () => {
  it("Exeter is covered by exactly one filed polygon under the scenario — Low", () => {
    const inside = covering(bands, HOMES.exeter);
    expect(inside).toHaveLength(1);
    expect(inside[0].properties.risk_band).toBe("Low");
  });

  it("no-band-published separation: Birkdale and Epsom have NO covering shape — absence, not a band", () => {
    // One dataset, both states, asserted side by side: a
    // build that served absence as a band (or filed a
    // synthetic polygon for it) could not pass both this and
    // the Exeter assertion above. Birkdale's box holds no
    // feature at all — its absence is total.
    expect(covering(bands, HOMES.birkdale)).toHaveLength(0);
    expect(covering(bands, HOMES.epsom)).toHaveLength(0);
  });

  it("the loader's own golden checks pass over the committed fixture", () => {
    expect(() => checkGolden(processFeatures(bands))).not.toThrow();
  });
});
