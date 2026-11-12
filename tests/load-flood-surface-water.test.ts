import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the flood surface water loader (plan step M5.1):
// the surface-water bands file as their OWN layer_type,
// never merged with the zones or the rivers & sea bands
// (gap L1); point answers are pinned as PROXIMITIES —
// nearest band plus distance — because at a point this
// product is a near-miss science (gap L3: Exeter's point is
// in no polygon with Low ~9 m away, Birkdale's in none with
// High 0.08 mi away, only Epsom has a point band); absence
// means "below the Low threshold" in a product with THREE
// bands and no Very low (gap L6); invalid, heavy geometries
// are counted and made valid at filing, never dropped
// (gap L4). The fixture holds real features captured
// 12 Nov 2026 in boxes around the golden homes. The loader's
// own golden checks run in both modes; the filing proof runs
// in CI against a real PostGIS; the full-file proof is the
// loader's live verify-only run (405,438 features at the
// 12 Nov 2026 snapshot).

const loader = readFileSync(join(process.cwd(), "loaders/load-flood-surface-water.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/flood-surface-water");

type Feature = {
  id?: string;
  properties: Record<string, string | number | null>;
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
const bands = loadFixture("flood-surface-water");

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
function nearest(feats: Feature[], home: { lat: number; lng: number }, label?: string) {
  return feats
    .filter((f) => label === undefined || f.properties.risk_band === label)
    .map((f) => ({ f, d: distMi(polysOf(f), home) }))
    .sort((a, b) => a.d - b.d)[0];
}

// Precomputed at module level: these polygons are dissolved
// and vertex-heavy, so each home's reads are computed once.
const reads = Object.fromEntries(
  Object.entries(HOMES).map(([name, home]) => [
    name,
    {
      inside: covering(bands, home),
      near: nearest(bands, home),
      nearLow: nearest(bands, home, "Low"),
      nearMedium: nearest(bands, home, "Medium"),
      nearHigh: nearest(bands, home, "High"),
    },
  ]),
);

describe("flood surface water loader sources", () => {
  it("reads the EA rofsw collection via OGC API Features and files its own layer type", () => {
    expect(loader).toContain("b5aaa28d-6eb9-460e-8d6f-43caa71fbe0e");
    expect(loader).toContain("collections/rofsw/items");
    expect(loader).toContain('LAYER_TYPE = "rofsw"');
    expect(loader).toContain("flood_layers");
  });

  it("never merges the three products (L1): the other flood layer types are not filed here", () => {
    expect(loader).not.toContain('LAYER_TYPE = "flood_zone"');
    expect(loader).not.toContain('LAYER_TYPE = "rofrs"');
    expect(loader).toContain("never merged");
  });

  it("guards the THREE-band vocabulary — a Very low here would mean the product changed shape (L6)", () => {
    expect(loader).toContain('VOCAB = ["High", "Medium", "Low"]');
    expect(loader).toContain("no Very low band");
  });

  it("files the depth basis into detail (L2)", () => {
    expect(loader).toContain('DETAIL = ">0 m"');
  });

  it("trusts only the unfiltered count and computes per-band counts from the data (L5)", () => {
    expect(loader).toContain("numberMatched");
    expect(loader).toContain("silently ignores property filters");
    expect(loader).not.toContain("risk_band=High");
  });

  it("files shapes exactly as published — no buffering, snapping or simplification (L3)", () => {
    expect(loader).not.toContain("ST_Buffer");
    expect(loader).not.toContain("ST_Simplify");
    expect(loader).toContain("ST_MakeValid");
    expect(loader).toContain("ST_IsValid");
  });

  it("takes the edition from the WMS build layer name, the serving system's own stamp", () => {
    expect(loader).toContain("nafra2-risk-of-flooding-from-surface-water/wms");
    expect(loader).toContain("build dates");
  });
});

describe("fixture vocabulary contract (computed from the fetched data)", () => {
  it("holds 204 features in three bands only, counts pinned — and no Very low anywhere (L6)", () => {
    expect(bands).toHaveLength(204);
    const counts = new Map<string, number>();
    for (const f of bands) {
      const label = f.properties.risk_band as string;
      expect(["High", "Medium", "Low"]).toContain(label);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    expect(counts.get("High")).toBe(68);
    expect(counts.get("Medium")).toBe(68);
    expect(counts.get("Low")).toBe(68);
    expect(counts.has("Very low")).toBe(false);
  });
});

describe("fixture golden facts — the proximity pins (L3)", () => {
  it("Epsom has the one point band: Low, with Medium mapped 0.007 mi away", () => {
    expect(reads.epsom.inside.length).toBeGreaterThanOrEqual(1);
    expect(reads.epsom.inside.every((f) => f.properties.risk_band === "Low")).toBe(true);
    expect(reads.epsom.nearMedium.d).toBeLessThanOrEqual(0.01);
    expect(Math.abs(reads.epsom.nearHigh.d - 0.028)).toBeLessThanOrEqual(0.01);
  });

  it("Exeter: no shape at the point, Low within 0.01 mi (≈9 m) — the near miss, pinned as a pair", () => {
    expect(reads.exeter.inside).toHaveLength(0);
    expect(reads.exeter.nearLow.d).toBeLessThanOrEqual(0.01);
    expect(reads.exeter.near.f.properties.risk_band).toBe("Low");
  });

  it("Birkdale: no shape at the point, High within 0.1 mi and the nearest shape Low at 0.03 mi", () => {
    expect(reads.birkdale.inside).toHaveLength(0);
    expect(reads.birkdale.nearHigh.d).toBeLessThanOrEqual(0.1);
    expect(reads.birkdale.near.f.properties.risk_band).toBe("Low");
    expect(Math.abs(reads.birkdale.near.d - 0.03)).toBeLessThanOrEqual(0.015);
  });
});
