import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGoldenSift } from "../loaders/flood-stream.mjs";
import {
  HOMES as LOADER_HOMES,
  SERVICES,
  beginFiling,
  createFeatureProcessor,
  createStatutoryProcessor,
  createWoodlandMerger,
  readServiceFixtureStream,
  statutoryRow,
  woodlandRow,
} from "../loaders/load-nature-designations.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

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

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged rows, the live layer and the
  // loader_checkpoint rows as arrays, with just enough SQL to
  // run the filer. The WKT the filer inserts is converted back
  // to GeoJSON for the staged-golden rebuild, so the sift on a
  // resumed run filters exactly as it would live.
  type StagedRow = {
    layer: string;
    name: string;
    wkt: string;
    reference: string;
    detail: string;
    sourceName: string;
    sourceDate: string;
    seq: number;
  };
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  function wktToGeoJson(wkt: string): { type: "MultiPolygon"; coordinates: number[][][][] } {
    const body = wkt.replace(/^MULTIPOLYGON\s*/, "");
    let i = 0;
    const parseGroup = (): unknown[] => {
      const out: unknown[] = [];
      i++; // consume "("
      while (i < body.length) {
        const ch = body[i];
        if (ch === "(") out.push(parseGroup());
        else if (ch === ")") {
          i++;
          return out;
        } else if (ch === ",") i++;
        else {
          const m = /^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/.exec(body.slice(i));
          if (!m) {
            i++;
            continue;
          }
          out.push([parseFloat(m[1]), parseFloat(m[2])]);
          i += m[0].length;
        }
      }
      return out;
    };
    return { type: "MultiPolygon", coordinates: parseGroup() as number[][][][] };
  }
  function createFakeClient() {
    let staged: StagedRow[] = [];
    let live: StagedRow[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let snapshot: {
      staged: StagedRow[];
      live: StagedRow[];
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = { staged: [...staged], live: [...live], checkpoints: new Map(checkpoints) };
        return { rows: [] };
      }
      if (text === "COMMIT") {
        snapshot = null;
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        if (snapshot) {
          staged = snapshot.staged;
          live = snapshot.live;
          checkpoints.clear();
          for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS nature_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO nature_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 11; r++) {
          const b = r * 11;
          staged.push({
            layer: params[b] as string,
            name: params[b + 2] as string,
            wkt: params[b + 3] as string,
            reference: params[b + 4] as string,
            detail: params[b + 7] as string,
            sourceName: params[b + 8] as string,
            sourceDate: params[b + 9] as string,
            seq: params[b + 10] as number,
          });
        }
        return { rows: [], rowCount: params.length / 11 };
      }
      if (
        /SELECT loader, edition, expected, next_start_index, read_count, filed_count, state, updated_at/.test(
          text,
        )
      ) {
        const row = checkpoints.get(params[0] as string);
        return { rows: row ? [row] : [] };
      }
      if (/INSERT INTO loader_checkpoint/.test(text)) {
        checkpoints.set(params[0] as string, {
          loader: params[0] as string,
          edition: params[1] as string,
          expected: params[2] as number | null,
          next_start_index: params[3] as number,
          read_count: params[4] as number,
          filed_count: params[5] as number,
          state: JSON.parse(params[6] as string) as Record<string, unknown>,
        });
        return { rows: [] };
      }
      if (/DELETE FROM loader_checkpoint WHERE loader =/.test(text)) {
        checkpoints.delete(params[0] as string);
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n, coalesce\(sum\(seq\)/.test(text)) {
        const rows = staged.filter((r) => r.layer === (params[0] as string));
        return {
          rows: [
            {
              n: rows.length,
              s: rows.reduce((a, r) => a + r.seq, 0),
              m: rows.length ? Math.max(...rows.map((r) => r.seq)) : 0,
            },
          ],
        };
      }
      if (/DELETE FROM nature_stage WHERE seq >=/.test(text)) {
        staged = staged.filter(
          (r) => !(r.layer === (params[1] as string) && r.seq >= (params[0] as number)),
        );
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM nature_stage WHERE layer =/.test(text)) {
        staged = staged.filter((r) => r.layer !== (params[0] as string));
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM nature_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/SELECT DISTINCT source_reference FROM nature_stage/.test(text)) {
        const seen = new Set<string>();
        for (const r of staged.filter((x) => x.layer === (params[0] as string)))
          seen.add(r.reference);
        return { rows: [...seen].map((source_reference) => ({ source_reference })) };
      }
      if (/ST_AsGeoJSON\(geom\)/.test(text)) {
        const rows = staged
          .filter((r) => r.layer === (params[0] as string))
          .sort((a, b) => a.seq - b.seq);
        return {
          rows: rows.map((r) => ({
            name: r.name,
            source_reference: r.reference,
            detail: r.detail,
            geojson: JSON.stringify(wktToGeoJson(r.wkt)),
          })),
        };
      }
      if (/DELETE FROM planning_layers WHERE constraint_type IN/.test(text)) {
        live = [];
        return { rows: [] };
      }
      if (/INSERT INTO planning_layers/.test(text)) {
        live = [...staged];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM planning_layers/.test(text))
        return { rows: [{ n: live.length }] };
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: (layer?: string) => (layer ? staged.filter((r) => r.layer === layer) : staged),
      live: () => live,
      liveRefs: () => live.map((r) => r.reference),
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        failAfterInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  const captured = JSON.parse(readFileSync(join(fixtureDir, "fixture.json"), "utf8"))
    .captured as string;

  // Drives one statutory layer exactly as main()'s
  // loadStatutoryLayer does: onHead prepares the layer and
  // seeds the processor + sift from the staged rows; each
  // page stages and checkpoints.
  async function runStatutoryLayer(
    fake: FakeClient,
    key: "sssi" | "sac" | "spa" | "ramsar",
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const capturedLines: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-nature-designations",
      log: (line: string) => capturedLines.push(line),
    });
    const filer = await beginFiling(progress, { client: fake as never, restart });
    const spec = SERVICES[key];
    let processor = createStatutoryProcessor(spec);
    const sift = createGoldenSift(LOADER_HOMES, 8);
    const onHead = async ({
      sourceDate,
      expected,
    }: {
      sourceDate: string;
      expected: number | null;
    }) => {
      const prep = await filer.prepareLayer(key, sourceDate, expected);
      if (!prep.resumed) return { startOffset: 0, lastObjectId: null };
      const cp = prep.checkpoint;
      processor = createStatutoryProcessor(spec, {
        seed: {
          read: cp.read_count,
          filed: cp.filed_count,
          excluded: cp.state?.excluded ?? 0,
          geoless: cp.state?.geoless ?? 0,
          invalid: cp.state?.invalid ?? 0,
          lastObjectId: cp.state?.lastObjectId ?? null,
          sites: await filer.stagedSites(key),
        },
      });
      for (const item of await filer.stagedGoldenItems(key)) sift.offer(item);
      return { startOffset: cp.next_start_index, lastObjectId: cp.state?.lastObjectId ?? null };
    };
    await readServiceFixtureStream(
      SERVICES[key],
      fixtureDir,
      captured,
      async (features, date) => {
        const filed = processor.processBatch(features);
        const rows = [];
        for (const item of filed) {
          sift.offer(item);
          rows.push(statutoryRow(item, spec, date));
        }
        if (rows.length > 0) await filer.stageRows(key, rows);
        await filer.checkpointPage(key, {
          read: processor.readCount(),
          state: processor.checkpointState(),
        });
      },
      { progress, onHead },
    );
    const totals = processor.finish();
    return { filer, totals, sifted: sift.items, lines: capturedLines };
  }

  // Drives the woodland pair exactly as main() does: the
  // revised inventory stages per page, the originals stream
  // past the merger and stage their survivors per page.
  async function runWoodland(
    fake: FakeClient,
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const capturedLines: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-nature-designations",
      log: (line: string) => capturedLines.push(line),
    });
    const filer = await beginFiling(progress, { client: fake as never, restart });
    let revProcessor = createFeatureProcessor(SERVICES.awiRev.label);
    const revSift = createGoldenSift(LOADER_HOMES, 8);
    const revItems: Array<{
      polygons: unknown;
      bbox: number[];
      props: Record<string, unknown>;
      inventory?: string;
    }> = [];
    const revOnHead = async ({
      sourceDate,
      expected,
    }: {
      sourceDate: string;
      expected: number | null;
    }) => {
      const prep = await filer.prepareLayer("awi-rev", sourceDate, expected);
      if (!prep.resumed) return { startOffset: 0, lastObjectId: null };
      const cp = prep.checkpoint;
      const staged = await filer.stagedLayerItems("awi-rev");
      revItems.push(
        ...(staged as Array<{
          polygons: unknown;
          bbox: number[];
          props: Record<string, unknown>;
          inventory?: string;
        }>),
      );
      for (const item of staged) revSift.offer(item);
      revProcessor = createFeatureProcessor(SERVICES.awiRev.label, {
        seed: {
          read: cp.read_count,
          geoless: cp.state?.geoless ?? 0,
          invalid: cp.state?.invalid ?? 0,
          lastObjectId: cp.state?.lastObjectId ?? null,
        },
      });
      return { startOffset: cp.next_start_index, lastObjectId: cp.state?.lastObjectId ?? null };
    };
    await readServiceFixtureStream(
      SERVICES.awiRev,
      fixtureDir,
      captured,
      async (features, date) => {
        const items = revProcessor.processBatch(features);
        for (const item of items) {
          revItems.push(item);
          revSift.offer(item);
        }
        if (items.length > 0)
          await filer.stageRows(
            "awi-rev",
            items.map((item) => woodlandRow({ ...item, inventory: "revised inventory" }, date)),
          );
        await filer.checkpointPage("awi-rev", {
          read: revProcessor.readCount(),
          state: revProcessor.checkpointState(),
        });
      },
      { progress, onHead: revOnHead },
    );
    const revTotals = revProcessor.finish();
    let origProcessor = createFeatureProcessor(SERVICES.awi.label);
    const origSift = createGoldenSift(LOADER_HOMES, 8);
    let origFiled = 0;
    let merger = createWoodlandMerger(revItems);
    const origOnHead = async ({
      sourceDate,
      expected,
    }: {
      sourceDate: string;
      expected: number | null;
    }) => {
      const prep = await filer.prepareLayer("awi", sourceDate, expected);
      if (!prep.resumed) {
        merger = createWoodlandMerger(revItems);
        return { startOffset: 0, lastObjectId: null };
      }
      const cp = prep.checkpoint;
      merger = createWoodlandMerger(revItems, { replaced: cp.state?.replaced ?? 0 });
      origFiled = cp.filed_count;
      origProcessor = createFeatureProcessor(SERVICES.awi.label, {
        seed: {
          read: cp.read_count,
          geoless: cp.state?.geoless ?? 0,
          invalid: cp.state?.invalid ?? 0,
          lastObjectId: cp.state?.lastObjectId ?? null,
        },
      });
      for (const item of await filer.stagedGoldenItems("awi")) origSift.offer(item);
      return { startOffset: cp.next_start_index, lastObjectId: cp.state?.lastObjectId ?? null };
    };
    await readServiceFixtureStream(
      SERVICES.awi,
      fixtureDir,
      captured,
      async (features, date) => {
        const items = origProcessor.processBatch(features);
        const rows = [];
        for (const item of items) {
          origSift.offer(item);
          const kept = merger.offer(item);
          if (kept) {
            origFiled += 1;
            rows.push(woodlandRow(kept, date));
          }
        }
        if (rows.length > 0) await filer.stageRows("awi", rows);
        await filer.checkpointPage("awi", {
          read: origProcessor.readCount(),
          state: { ...origProcessor.checkpointState(), replaced: merger.replaced() },
        });
      },
      { progress, onHead: origOnHead },
    );
    const origTotals = origProcessor.finish();
    return {
      filer,
      revItems,
      revTotals,
      origTotals,
      origFiled,
      replaced: merger.replaced(),
      lines: capturedLines,
    };
  }

  it(
    "kill mid-SSSI resumes and files every feature exactly once",
    { timeout: 60_000 },
    async () => {
      const fake = createFakeClient();
      // SSSI parts: 7 then 22 features. Page 1 stages 7 and
      // checkpoints at 7; page 2 stages two 10-row chunks and
      // dies flushing its 2-row tail (insert 4) — 27 staged,
      // the checkpoint still at 7.
      const killLines: string[] = [];
      fake.setFailAfterInserts(3);
      await expect(runStatutoryLayer(fake, "sssi", { lines: killLines })).rejects.toThrow(
        /simulated kill/,
      );
      expect(fake.staged("sssi").length).toBe(27);
      expect(fake.checkpoints.get("load-nature-designations-sssi")?.next_start_index).toBe(7);
      expect(
        killLines.some((l) => /checkpoint 7 features · staged 7 · resume from 7/.test(l)),
      ).toBe(true);

      fake.setFailAfterInserts(null);
      const { filer, totals, lines } = await runStatutoryLayer(fake, "sssi");
      expect(totals.read).toBe(29);
      expect(totals.filed).toBe(29);
      expect(
        lines.some((l) =>
          /resuming from checkpoint · 7 rows staged · edition 2026-11-12 · resume from 7/.test(l),
        ),
      ).toBe(true);
      await filer.finishFiling(29);
      const expectedRefs = loadFixture("sssi").map((f) =>
        String(f.properties[SERVICES.sssi.codeField] ?? ""),
      );
      expect(fake.liveRefs().sort()).toEqual(expectedRefs.sort());
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-nature-designations-sssi")).toBeUndefined();
      expect(filer.resumeNote()).toBe("the start (nothing staged yet)");
    },
  );

  it(
    "an edition change discards the staged rows and starts from zero",
    { timeout: 60_000 },
    async () => {
      const fake = createFakeClient();
      fake.setFailAfterInserts(3);
      await expect(runStatutoryLayer(fake, "sssi")).rejects.toThrow(/simulated kill/);
      expect(fake.staged("sssi").length).toBe(27);

      const progress = createProgressLogger({ name: "load-nature-designations" });
      const filer = await beginFiling(progress, { client: fake as never });
      const prep = await filer.prepareLayer("sssi", "2099-01-01", null);
      expect(prep.resumed).toBe(false);
      expect(fake.staged("sssi").length).toBe(0);
      expect(fake.checkpoints.get("load-nature-designations-sssi")).toBeUndefined();
    },
  );

  it("--restart discards the checkpoint and starts from zero", { timeout: 60_000 }, async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(3);
    await expect(runStatutoryLayer(fake, "sssi")).rejects.toThrow(/simulated kill/);
    expect(fake.staged("sssi").length).toBe(27);

    fake.setFailAfterInserts(null);
    const { totals } = await runStatutoryLayer(fake, "sssi", { restart: true });
    expect(totals.read).toBe(29);
    expect(totals.filed).toBe(29);
  });

  it(
    "kill mid-woodland resumes from the staged substrate and the merge still replaces 167",
    { timeout: 120_000 },
    async () => {
      const fake = createFakeClient();
      // Revised parts: 260 then 280. Page 1 stages 260 in
      // 26 chunks and checkpoints at 260; page 2 dies on
      // its third chunk (insert 29) — 280 staged, the
      // checkpoint still at 260.
      fake.setFailAfterInserts(28);
      await expect(runWoodland(fake)).rejects.toThrow(/simulated kill/);
      expect(fake.staged("awi-rev").length).toBe(280);
      expect(fake.checkpoints.get("load-nature-designations-awi-rev")?.next_start_index).toBe(260);

      fake.setFailAfterInserts(null);
      const { filer, revItems, revTotals, origTotals, origFiled, replaced } =
        await runWoodland(fake);
      expect(revTotals.read).toBe(540);
      expect(revItems.length).toBe(540);
      expect(origTotals.read).toBe(498);
      expect(replaced).toBe(167);
      expect(origFiled).toBe(498 - 167);
      await filer.finishFiling(540 + origFiled);
      expect(fake.liveRefs().length).toBe(540 + origFiled);
      expect(new Set(fake.liveRefs()).size).toBe(540 + origFiled);
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.size).toBe(0);
    },
  );
});
