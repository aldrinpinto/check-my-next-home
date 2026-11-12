import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the flood rivers & sea loader (plan step M5.1): the
// defences-counted likelihood bands file as their OWN
// layer_type, never merged with the planning zones or
// surface water (gap L1); absence is "no band published",
// a state asserted as DISTINCT from a filed "Very low"
// polygon — never interchangeable with it (gap L6); the
// depth basis ">0 m" files into detail (gap L2); per-band
// counts are computed from the fetched features with the
// unfiltered numberMatched as the only trusted service
// figure (gap L5). The fixture holds real features captured
// 12 Nov 2026 in boxes around the golden homes. The loader's
// own golden checks run in both modes; the filing proof runs
// in CI against a real PostGIS; the full-file proof is the
// loader's live verify-only run (249,019 features at the
// 12 Nov 2026 snapshot).

const loader = readFileSync(join(process.cwd(), "loaders/load-flood-rivers-sea.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/flood-rivers-sea");

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
const bands = loadFixture("flood-rivers-sea");

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
function polyContains(polys: Polys, lng: number, lat: number) {
  return polys.some((poly) => {
    let ins = false;
    for (const r of poly) if (ringContains(r, lng, lat)) ins = !ins;
    return ins;
  });
}
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  let t = l === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}
// The prep's basis: nearest polygon edge on the longitude-
// scaled plane, miles = degrees of latitude x 69.05.
function distMi(polys: Polys, home: { lat: number; lng: number }) {
  if (polyContains(polys, home.lng, home.lat)) return 0;
  const s = Math.cos((home.lat * Math.PI) / 180);
  const px = home.lng * s;
  const py = home.lat;
  let best = Infinity;
  for (const poly of polys)
    for (const ring of poly)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const d = segDist(px, py, ring[j][0] * s, ring[j][1], ring[i][0] * s, ring[i][1]);
        if (d < best) best = d;
      }
  return best * 69.05;
}
function covering(feats: Feature[], home: { lat: number; lng: number }) {
  return feats.filter((f) => polyContains(polysOf(f), home.lng, home.lat));
}
function nearest(feats: Feature[], home: { lat: number; lng: number }) {
  return feats.map((f) => ({ f, d: distMi(polysOf(f), home) })).sort((a, b) => a.d - b.d)[0];
}

describe("flood rivers & sea loader sources", () => {
  it("reads the EA rofrs_4band collection via OGC API Features and files its own layer type", () => {
    expect(loader).toContain("96ab4342-82c1-4095-87f1-0082e8d84ef1");
    expect(loader).toContain("rofrs_4band/items");
    expect(loader).toContain('LAYER_TYPE = "rofrs"');
    expect(loader).toContain("flood_layers");
  });

  it("never merges the three products (L1): the other flood layer types are not filed here", () => {
    expect(loader).not.toContain('LAYER_TYPE = "flood_zone"');
    expect(loader).not.toContain('LAYER_TYPE = "rofsw"');
    expect(loader).toContain("never merged");
  });

  it("files the depth basis into detail (L2) and keeps risk_label the clean vocabulary", () => {
    expect(loader).toContain('DETAIL = ">0 m"');
    expect(loader).toContain('"Very low"');
  });

  it("trusts only the unfiltered count and computes per-band counts from the data (L5)", () => {
    expect(loader).toContain("numberMatched");
    expect(loader).toContain("silently ignores property filters");
    expect(loader).not.toContain("risk_band=High");
  });

  it("files shapes as published and repairs validity only at filing (L3/L4)", () => {
    expect(loader).toContain("ST_MakeValid");
    expect(loader).toContain("ST_IsValid");
    expect(loader).not.toContain("ST_Simplify");
    expect(loader).not.toContain("ST_Buffer");
  });

  it("files only published shapes — no synthetic absence polygon is manufactured (L6)", () => {
    expect(loader).toContain("no synthetic absence polygon");
    expect(loader).not.toContain("Zone 1");
  });

  it("takes the edition from the WMS build layer name, the serving system's own stamp", () => {
    expect(loader).toContain("nafra2-risk-of-flooding-from-rivers-and-sea/wms");
    expect(loader).toContain("build dates");
  });
});

describe("fixture vocabulary contract (computed from the fetched data)", () => {
  it("holds 143 features, every band in {High, Medium, Low, Very low}, counts pinned", () => {
    expect(bands).toHaveLength(143);
    const counts = new Map<string, number>();
    for (const f of bands) {
      const label = f.properties.risk_band as string;
      expect(["High", "Medium", "Low", "Very low"]).toContain(label);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    expect(counts.get("High")).toBe(41);
    expect(counts.get("Medium")).toBe(33);
    expect(counts.get("Low")).toBe(41);
    expect(counts.get("Very low")).toBe(28);
  });
});

describe("fixture golden facts", () => {
  it("Exeter is covered by a filed Very low polygon (the defences-counted half of the pair)", () => {
    const inside = covering(bands, HOMES.exeter);
    expect(inside.length).toBeGreaterThanOrEqual(1);
    expect(inside.every((f) => f.properties.risk_band === "Very low")).toBe(true);
  });

  it("the nearest other ground to Exeter is High at 0.159 mi — the defended picture is local", () => {
    const inside = covering(bands, HOMES.exeter);
    const others = bands.filter((f) => !inside.includes(f));
    const near = nearest(others, HOMES.exeter);
    expect(near.f.properties.risk_band).toBe("High");
    expect(Math.abs(near.d - 0.159)).toBeLessThanOrEqual(0.02);
  });

  it("absence-state separation (L6): Birkdale and Epsom have NO covering shape, a different fact from Exeter's filed Very low", () => {
    // One dataset, both states, asserted side by side: a
    // build that served absence as "Very low" (or filed a
    // synthetic polygon for it) could not pass both this and
    // the Exeter assertion above.
    expect(covering(bands, HOMES.birkdale)).toHaveLength(0);
    expect(covering(bands, HOMES.epsom)).toHaveLength(0);
    const birkdaleNear = nearest(bands, HOMES.birkdale);
    expect(birkdaleNear.f.properties.risk_band).toBe("Low");
    expect(Math.abs(birkdaleNear.d - 0.84)).toBeLessThanOrEqual(0.03);
    const epsomNear = nearest(bands, HOMES.epsom);
    expect(epsomNear.f.properties.risk_band).toBe("Low");
    expect(Math.abs(epsomNear.d - 0.4)).toBeLessThanOrEqual(0.03);
  });
});
