import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the nature designations loader (plan step M5.3): the
// four statutory registers (SSSI, SAC, SPA, Ramsar) file by site
// code with candidate SACs excluded, and ancient woodland files
// as ONE layer merged from the two Natural England inventories
// under NE's own precedence rule (gap L1) — the assertion pair
// that catches both single-source failure modes is Birkdale's
// nearest merged wood at 0.39 miles (revised only) and Epsom's
// at 1.41 (original only). The fixture holds real features
// captured 12 Nov 2026 in the prep's 6-mile boxes. The loader's
// own golden checks run in both modes; the filing proof runs in
// CI against a real PostGIS; the full-file proof is the loader's
// live verify-only run (4,128 SSSI features; 1,875 designated
// SAC features over 254 sites with 36 candidate features
// excluded; 1,079 SPA; 1,291 Ramsar; 53,640 + 45,406 woodland
// polygons read).

const loader = readFileSync(join(process.cwd(), "loaders/load-nature-designations.mjs"), "utf8");
const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/nature-designations");

type Feature = {
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
// The prep's basis: nearest polygon edge on the longitude-scaled
// plane, miles = degrees of latitude x 69.05.
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
function nearest(feats: Feature[], home: { lat: number; lng: number }) {
  return feats.map((f) => ({ f, d: distMi(polysOf(f), home) })).sort((a, b) => a.d - b.d)[0];
}
function orient(a: Pt, b: Pt, c: Pt) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function segInt(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0;
}
function polysIntersect(A: Polys, B: Polys) {
  for (const pa of A)
    for (const pb of B) {
      for (const ra of pa)
        for (const rb of pb)
          for (let i = 0; i < ra.length - 1; i++)
            for (let j = 0; j < rb.length - 1; j++)
              if (segInt(ra[i], ra[i + 1], rb[j], rb[j + 1])) return true;
      const firstB = pb[0][0];
      const firstA = pa[0][0];
      let inB = false;
      for (const r of pa) if (ringContains(r, firstB[0], firstB[1])) inB = !inB;
      if (inB) return true;
      let inA = false;
      for (const r of pb) if (ringContains(r, firstA[0], firstA[1])) inA = !inA;
      if (inA) return true;
    }
  return false;
}

const sssi = loadFixture("sssi");
const sac = loadFixture("sac");
const spa = loadFixture("spa");
const ramsar = loadFixture("ramsar");
const awi = loadFixture("ancient-woodland");
const awiRev = loadFixture("ancient-woodland-revised");
const nameOf = (f: Feature, key: string) => String(f.properties[key] ?? "").trim();

describe("nature designations loader sources", () => {
  it("reads the six Natural England services — and never the SSSI Units service (L4)", () => {
    for (const svc of [
      "SSSI_England",
      "Special_Areas_of_Conservation_England",
      "Special_Protection_Areas_England",
      "Ramsar_England",
      "Ancient_Woodland_England",
      "Ancient_Woodland_Revised_England",
    ]) {
      expect(loader).toContain(svc);
    }
    expect(loader).not.toContain("SSSI_Units");
  });

  it("files the statutory layers by site code, with features and sites both counted (L2)", () => {
    for (const code of ["REF_CODE", "SAC_CODE", "SPA_CODE", "CODE"]) {
      expect(loader).toContain(code);
    }
    expect(loader).toContain("Natural England");
    expect(loader).toContain("sites");
  });

  it("excludes candidate SACs by the status filter and counts them (L3)", () => {
    expect(loader).toContain("Designated");
    expect(loader).toContain("Candidate");
    expect(loader).toContain("candidate features excluded");
  });

  it("merges the two woodland inventories under the revision's precedence (L1)", () => {
    expect(loader).toContain("replaced by the revision");
    expect(loader).toContain("original inventory");
    expect(loader).toContain("revised inventory");
    expect(loader).toContain("no ancient woodland recorded in the inventory");
  });

  it("the canary probes every nature service, with no staleness alarm for SAC/SPA/Ramsar", () => {
    for (const probe of [
      "sssi",
      "sac",
      "spa",
      "ramsar",
      "ancient-woodland",
      "ancient-woodland-revised",
      "priority-habitats",
    ]) {
      expect(canary).toContain(`"${probe}"`);
    }
    expect(canary).toContain("never decreases");
  });
});

describe("fixture golden facts", () => {
  it("the captured boxes hold the prep's feature counts", () => {
    expect(sssi).toHaveLength(29);
    expect(sac).toHaveLength(18);
    expect(spa).toHaveLength(18);
    expect(ramsar).toHaveLength(18);
    expect(awi).toHaveLength(498);
    expect(awiRev).toHaveLength(540);
  });

  it("no golden home falls inside any of the six layers", () => {
    for (const feats of [sssi, sac, spa, ramsar, awi, awiRev])
      for (const home of Object.values(HOMES))
        expect(feats.some((f) => polyContains(polysOf(f), home.lng, home.lat))).toBe(false);
  });

  it("the SSSI nearests are the locked ones", () => {
    expect(nameOf(nearest(sssi, HOMES.birkdale).f, "NAME")).toBe("Woodham Walter Common SSSI");
    expect(nearest(sssi, HOMES.birkdale).d).toBeCloseTo(2.88, 1);
    expect(nameOf(nearest(sssi, HOMES.exeter).f, "NAME")).toBe("Gilbert's Pit (Charlton) SSSI");
    expect(nearest(sssi, HOMES.exeter).d).toBeCloseTo(1.9, 1);
    expect(nameOf(nearest(sssi, HOMES.epsom).f, "NAME")).toBe("Stones Road Pond SSSI");
    expect(nearest(sssi, HOMES.epsom).d).toBeCloseTo(0.67, 1);
    const commons = sssi.find((f) => nameOf(f, "NAME") === "Epsom and Ashtead Commons SSSI")!;
    expect(distMi(polysOf(commons), HOMES.epsom)).toBeCloseTo(1.79, 1);
  });

  it("the SAC nearests are the locked designated sites", () => {
    expect(nameOf(nearest(sac, HOMES.birkdale).f, "SAC_NAME")).toBe("Essex Estuaries");
    expect(nearest(sac, HOMES.birkdale).d).toBeCloseTo(4.36, 1);
    expect(nameOf(nearest(sac, HOMES.exeter).f, "SAC_NAME")).toBe("Epping Forest");
    expect(nearest(sac, HOMES.exeter).d).toBeCloseTo(4.07, 1);
    expect(nameOf(nearest(sac, HOMES.epsom).f, "SAC_NAME")).toBe("Mole Gap to Reigate Escarpment");
    expect(nearest(sac, HOMES.epsom).d).toBeCloseTo(5.0, 1);
    // The fixture boxes hold designated features only; the 36
    // candidate features (6 sites) live outside the boxes and
    // are excluded live, proven by the loader's run record.
    expect(sac.every((f) => f.properties.STATUS === "Designated")).toBe(true);
  });

  it("the Blackwater stack: SPA and Ramsar are the same ground, filed as two designations (item 7)", () => {
    const spaN = nearest(spa, HOMES.birkdale);
    const ramN = nearest(ramsar, HOMES.birkdale);
    expect(nameOf(spaN.f, "SPA_NAME")).toBe(nameOf(ramN.f, "NAME"));
    expect(Math.abs(spaN.d - ramN.d)).toBeLessThan(0.01);
    const spaArea = Number(spaN.f.properties.SPA_AREA);
    const ramArea = Number(ramN.f.properties.AREA);
    expect(Math.abs(spaArea - ramArea) / spaArea).toBeLessThan(0.001);
    expect(nameOf(nearest(spa, HOMES.exeter).f, "SPA_NAME")).toBe("Lee Valley");
    expect(nameOf(nearest(ramsar, HOMES.exeter).f, "NAME")).toBe("Lee Valley");
    expect(nameOf(nearest(spa, HOMES.epsom).f, "SPA_NAME")).toBe("South West London Waterbodies");
    expect(nearest(spa, HOMES.epsom).d).toBeCloseTo(7.05, 1);
  });

  it("the woodland pair each single-source load gets wrong (L1)", () => {
    // Original only: Birkdale's nearest is Titbeech Wood, 0.85.
    const oB = nearest(awi, HOMES.birkdale);
    expect(nameOf(oB.f, "NAME")).toBe("TITBEECH WOOD");
    expect(oB.d).toBeCloseTo(0.85, 1);
    // Revised only: Birkdale's nearest is the unnamed 0.39 polygon.
    const rB = nearest(awiRev, HOMES.birkdale);
    expect(nameOf(rB.f, "NAME")).toBe("");
    expect(rB.d).toBeCloseTo(0.39, 1);
    // Original only: Epsom's nearest is the unnamed 1.41 polygon.
    const oE = nearest(awi, HOMES.epsom);
    expect(nameOf(oE.f, "NAME")).toBe("");
    expect(oE.d).toBeCloseTo(1.41, 1);
    // Revised only: Epsom's nearest is Castle Hill Wood, 2.11 —
    // Surrey is not a completed county, so the revision alone
    // manufactures false "nones" there.
    const rE = nearest(awiRev, HOMES.epsom);
    expect(nameOf(rE.f, "NAME")).toBe("Castle Hill Wood");
    expect(rE.d).toBeCloseTo(2.11, 1);
    // Blank names are normal data in this inventory (L6).
    expect(awi.filter((f) => nameOf(f, "NAME") === "").length).toBeGreaterThan(0);
    expect(awiRev.filter((f) => nameOf(f, "NAME") === "").length).toBeGreaterThan(0);
  });

  it("the merge replaces originals the revision redraws — Titbeech Wood is the proof", () => {
    const oTit = awi.find((f) => nameOf(f, "NAME") === "TITBEECH WOOD")!;
    const rTit = awiRev.find((f) => nameOf(f, "NAME") === "TITBEECH WOOD")!;
    expect(polysIntersect(polysOf(oTit), polysOf(rTit))).toBe(true);
    // The fixture merge, computed here independently: 167 of the
    // 498 originals intersect a revised polygon and are replaced.
    // Bounding boxes are precomputed once per feature — disjoint
    // boxes cannot intersect or contain, so the full segment
    // maths only runs for candidate pairs.
    const bboxOf = (polys: Polys) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const poly of polys)
        for (const ring of poly)
          for (const [x, y] of ring) {
            if (x < x0) x0 = x;
            if (y < y0) y0 = y;
            if (x > x1) x1 = x;
            if (y > y1) y1 = y;
          }
      return [x0, y0, x1, y1] as const;
    };
    const overlaps = (a: readonly number[], b: readonly number[]) =>
      a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
    const revPolys = awiRev.map((f) => {
      const polys = polysOf(f);
      return { polys, bbox: bboxOf(polys) };
    });
    const replaced = awi.filter((f) => {
      const polys = polysOf(f);
      const bbox = bboxOf(polys);
      return revPolys.some((rp) => overlaps(bbox, rp.bbox) && polysIntersect(polys, rp.polys));
    }).length;
    expect(replaced).toBe(167);
  });
});

describe("progress — BUG-265", () => {
  // This loader's long phases live in main() and the exported
  // stream readers, so the wiring is pinned here in source
  // and driven end-to-end in tests/load-progress-bug265-c.test.ts.
  it("creates one logger and wires it through the live and fixture reads", () => {
    expect(loader).toContain('createProgressLogger({ name: "load-nature-designations" })');
    expect(loader).toContain('label: "read"');
    expect(loader).toContain("stage: `read ${spec.label}`");
    expect(loader).toContain('label: "fixture"');
    expect(loader).toContain("progress?.failed");
    expect(loader).toContain("swap started — filing");
  });
});
