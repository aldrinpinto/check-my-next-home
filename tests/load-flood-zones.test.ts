import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the flood zones loader (plan step M5.1): the Flood
// Map for Planning zones file as their OWN layer_type, never
// merged with the likelihood bands (gap L1); flood_source
// and origin survive into flood_layers.detail (gap L2, via
// migration 0008); per-zone counts are computed from the
// fetched features, with the unfiltered numberMatched as the
// only trusted service figure (gap L5); and absence is Zone
// 1 by definition, never a filed polygon (gap L6). The
// fixture holds real features captured 12 Nov 2026 in boxes
// around the golden homes. The loader's own golden checks
// run in both modes; the filing proof runs in CI against a
// real PostGIS; the full-file proof is the loader's live
// verify-only run (415,408 features at the 12 Nov 2026
// snapshot).

const loader = readFileSync(join(process.cwd(), "loaders/load-flood-zones.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/flood-zones");

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
const zones = loadFixture("flood-zones");

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

describe("flood zones loader sources", () => {
  it("reads the EA zones collection via OGC API Features and files its own layer type", () => {
    expect(loader).toContain("04532375-a198-476e-985e-0579a0a11b47");
    expect(loader).toContain("Flood_Zones_2_3_Rivers_and_Sea/items");
    expect(loader).toContain('LAYER_TYPE = "flood_zone"');
    expect(loader).toContain("flood_layers");
  });

  it("never merges the three products (L1): the other flood layer types are not filed here", () => {
    expect(loader).not.toContain('LAYER_TYPE = "rofrs"');
    expect(loader).not.toContain('LAYER_TYPE = "rofsw"');
    expect(loader).toContain("never merged");
  });

  it("trusts only the unfiltered count and computes per-zone counts from the data (L5)", () => {
    expect(loader).toContain("numberMatched");
    expect(loader).toContain("silently ignores property filters");
    // The paged read's only parameters are limit / startIndex
    // / f — no property filter is ever constructed. (The
    // header comment quotes the prep's measured flood_zone=
    // FZ2 example, so the guard is on the query construction,
    // not the bare string.)
    expect(loader).toContain("limit=${PAGE}&startIndex=${startIndex}&f=json");
    expect(loader).not.toContain("items?flood_zone");
  });

  it("files shapes as published and repairs validity only at filing (L3/L4)", () => {
    expect(loader).toContain("ST_MakeValid");
    expect(loader).toContain("ST_IsValid");
    expect(loader).toContain("ST_CollectionExtract");
    expect(loader).not.toContain("ST_Simplify");
    expect(loader).not.toContain("ST_Buffer");
  });

  it("takes the edition from the WMS build layer name, the serving system's own stamp", () => {
    expect(loader).toContain("flood-map-for-planning-flood-zones/wms");
    expect(loader).toContain("build dates");
  });

  it("carries flood_source and origin into detail (L2)", () => {
    expect(loader).toContain("flood_source");
    expect(loader).toContain("origin");
  });

  it("admits the published source vocabulary including 'unknown' (D27)", () => {
    // The live collection began publishing shapes whose
    // flood_source is "unknown" after the 12 Nov 2026
    // capture; D27 admits the word as published, so the
    // loader's contract carries it alongside the original
    // three.
    expect(loader).toContain('SOURCES = ["river", "sea", "river and sea", "unknown"]');
  });
});

describe("migration 0008 — the detail column lands before any flood load (L2)", () => {
  const files = readdirSync(join(process.cwd(), "db", "migrations")).filter((f) =>
    f.startsWith("0008_"),
  );
  it("exists and adds detail to flood_layers in the 0007 pattern", () => {
    expect(files).toHaveLength(1);
    const sql = readFileSync(join(process.cwd(), "db", "migrations", files[0]), "utf8");
    expect(sql).toContain("ALTER TABLE flood_layers");
    expect(sql).toContain("ADD COLUMN detail text");
  });
});

describe("fixture vocabulary contract (computed from the fetched data)", () => {
  it("holds 463 features, every label in {FZ2, FZ3}, counts pinned", () => {
    expect(zones).toHaveLength(463);
    const counts = new Map<string, number>();
    for (const f of zones) {
      const label = f.properties.flood_zone as string;
      expect(["FZ2", "FZ3"]).toContain(label);
      expect(["river", "sea", "river and sea", "unknown"]).toContain(f.properties.flood_source);
      expect(typeof f.properties.origin).toBe("string");
      expect((f.properties.origin as string).length).toBeGreaterThan(0);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    expect(counts.get("FZ3")).toBe(339);
    expect(counts.get("FZ2")).toBe(124);
  });

  it("carries exactly one 'unknown'-source feature — the D27 capture, verbatim", () => {
    const unknown = zones.filter((f) => f.properties.flood_source === "unknown");
    expect(unknown).toHaveLength(1);
    expect(unknown[0].id).toContain("Flood_Zones_2_3_Rivers_and_Sea.1070");
    expect(unknown[0].properties.flood_zone).toBe("FZ2");
    expect(unknown[0].properties.origin).toBe("local evidence");
  });
});

describe("fixture golden facts", () => {
  it("Exeter is covered by exactly one polygon: FZ3, river and sea, origin modelled", () => {
    const inside = covering(zones, HOMES.exeter);
    expect(inside).toHaveLength(1);
    expect(inside[0].properties.flood_zone).toBe("FZ3");
    expect(inside[0].properties.flood_source).toBe("river and sea");
    // The prep paperwork said "modelled and recorded" — that
    // value belongs to a neighbouring feature; the covering
    // feature (…155716) says "modelled" in both captures.
    expect(inside[0].properties.origin).toBe("modelled");
    expect(inside[0].id).toContain("155716");
  });

  it("Birkdale is inside no zone — Zone 1 by absence — with FZ2 (river) 0.84 mi away", () => {
    expect(covering(zones, HOMES.birkdale)).toHaveLength(0);
    const near = nearest(zones, HOMES.birkdale);
    expect(near.f.properties.flood_zone).toBe("FZ2");
    expect(near.f.properties.flood_source).toBe("river");
    expect(Math.abs(near.d - 0.84)).toBeLessThanOrEqual(0.03);
  });

  it("Epsom is inside no zone, with FZ2 at 0.40 mi", () => {
    expect(covering(zones, HOMES.epsom)).toHaveLength(0);
    const near = nearest(zones, HOMES.epsom);
    expect(near.f.properties.flood_zone).toBe("FZ2");
    expect(Math.abs(near.d - 0.4)).toBeLessThanOrEqual(0.03);
  });

  it("zone exclusivity: no golden point is inside both an FZ2 and an FZ3 polygon", () => {
    for (const home of Object.values(HOMES)) {
      const labels = new Set(covering(zones, home).map((f) => f.properties.flood_zone));
      expect(labels.has("FZ2") && labels.has("FZ3")).toBe(false);
    }
  });
});
