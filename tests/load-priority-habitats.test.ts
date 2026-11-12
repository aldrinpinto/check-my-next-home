import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the priority habitats loader (plan step M5.3): the
// Priority Habitat Inventory is a compiled habitat map, not a
// register (gap L5) — 818,225 unnamed OS MasterMap patches,
// filed as the unit by UID with the habitat label (MainHabs)
// verbatim, mosaic classes included, version-stamped. Nothing
// is filtered, so the filed count must reconcile to the source
// count exactly. The fixture holds real patches captured
// 12 Nov 2026 in 2.5-mile boxes around the golden homes; the
// loader's own golden checks run in both modes, the filing
// proof runs in CI against a real PostGIS, and the full-file
// proof is the loader's live verify-only run.

const loader = readFileSync(join(process.cwd(), "loaders/load-priority-habitats.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/priority-habitats");

type Feature = {
  properties: Record<string, string | number>;
  geometry: { type: string; coordinates: unknown } | null;
};
// The capture is held as numbered parts whose feature arrays
// concatenate to the capture, in order (see the fixture README)
// — the helper mirrors the loader's fixture reader.
const phi: Feature[] = readdirSync(fixtureDir)
  .filter((entry) => /^priority-habitats-\d+\.geojson$/.test(entry))
  .sort()
  .flatMap((entry) => JSON.parse(readFileSync(join(fixtureDir, entry), "utf8")).features);

const HOMES = {
  birkdale: { lat: 51.776176, lng: 0.60387 },
  exeter: { lat: 51.515224, lng: 0.021177 },
  epsom: { lat: 51.344571, lng: -0.247104 },
};
type Pt = [number, number];
type Polys = Pt[][][];

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

describe("priority habitats loader sources", () => {
  it("reads the PHI service and files patches by UID with the label verbatim (L5)", () => {
    expect(loader).toContain("Priority_Habitats_Inventory_England");
    expect(loader).toContain("UID");
    expect(loader).toContain("MainHabs");
    expect(loader).toContain("Natural England");
  });

  it("stamps the run with the inventory version read from the data", () => {
    expect(loader).toContain("Version");
    expect(loader).toContain("Priority Habitat Inventory");
  });

  it("carries the honesty rule: a habitat record, never a protection", () => {
    expect(loader).toContain("not a protection");
    expect(loader).toContain("recorded in the Priority Habitat Inventory");
  });
});

describe("fixture golden facts", () => {
  it("the captured boxes hold 1,716 patches, all at version Sept_26", () => {
    expect(phi).toHaveLength(1716);
    expect([...new Set(phi.map((f) => f.properties.Version))]).toEqual(["Sept_26"]);
    expect(new Set(phi.map((f) => f.properties.UID)).size).toBe(1716);
  });

  it("no golden home falls inside a patch", () => {
    for (const home of Object.values(HOMES))
      expect(phi.some((f) => polyContains(polysOf(f), home.lng, home.lat))).toBe(false);
  });

  it("the nearest patches and the within-a-mile counts are the locked ones", () => {
    const facts = Object.values(HOMES).map((home) => {
      const rows = phi.map((f) => ({ f, d: distMi(polysOf(f), home) })).sort((a, b) => a.d - b.d);
      return {
        nearest: String(rows[0].f.properties.MainHabs),
        miles: rows[0].d,
        within1: rows.filter((r) => r.d <= 1.0).length,
      };
    });
    expect(facts[0].nearest).toBe("Traditional orchard");
    expect(facts[0].miles).toBeCloseTo(0.25, 1);
    expect(facts[0].within1).toBe(33);
    expect(facts[1].nearest).toBe("Deciduous woodland");
    expect(facts[1].miles).toBeCloseTo(0.14, 1);
    expect(facts[1].within1).toBe(38);
    expect(facts[2].nearest).toBe("Deciduous woodland");
    expect(facts[2].miles).toBeCloseTo(0.18, 1);
    expect(facts[2].within1).toBe(57);
  });
});
