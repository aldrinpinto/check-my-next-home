import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readPhiPages,
  beginFiling,
  createPhiProcessor,
  peekPhiFixtureVersion,
  streamPhiFixture,
} from "../loaders/load-priority-habitats.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

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

// ------------------------------------------------------------------
// Progress logging (BUG-265): the paged read through the
// shared logger, driven against a stubbed 4,500-patch
// service (the paging-integrity test's shape).
// ------------------------------------------------------------------
describe("progress logging (BUG-265)", () => {
  const PHI_LAYER = "https://example.test/phi/FeatureServer/0";
  const phiFeature = (objectId: number) => ({
    properties: { OBJECTID: objectId },
    geometry: null,
  });
  const phiPage = (firstObjectId: number, count: number, final: boolean) => {
    const features = Array.from({ length: count }, (_, i) => phiFeature(firstObjectId + i));
    return final ? { features } : { features, properties: { exceededTransferLimit: true } };
  };
  const phiRoute = (url: string) => {
    const offset = Number(new URL(url).searchParams.get("resultOffset"));
    if (offset === 0) return phiPage(1, 2000, false);
    if (offset === 2000) return phiPage(2001, 2000, false);
    if (offset === 4000) return phiPage(4001, 500, true);
    throw new Error(`unexpected offset ${offset}`);
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("the paged read logs a tally with a real percentage, and a heartbeat halfway", async () => {
    vi.stubGlobal("fetch", async (input: unknown) => ({
      ok: true,
      status: 200,
      json: async () => phiRoute(String(input)),
    }));
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-priority-habitats",
      log: (line: string) => lines.push(line),
    });
    const delivered: number[] = [];
    const read = await readPhiPages(
      PHI_LAYER,
      4500,
      async (batch: unknown[]) => {
        delivered.push(batch.length);
      },
      { delaysMs: [0, 0, 0], progress },
    );
    expect(read).toBe(4500);
    expect(delivered).toEqual([2000, 2000, 500]);
    // A line every twentieth of the read (every 225), and
    // the closing line at 100%.
    expect(lines.some((l) => /progress · read 2,000\/4,500 patches \(44%\)$/.test(l))).toBe(true);
    expect(lines.some((l) => /progress · read 4,000\/4,500 patches \(89%\)$/.test(l))).toBe(true);
    expect(lines.some((l) => /progress · read 4,500\/4,500 patches \(100%\)$/.test(l))).toBe(true);
    // One heartbeat, at half the read. (No exact line count
    // is pinned: a slow-page warning is timing-dependent
    // and may add a line — the tally and heartbeat lines
    // above are the contract.)
    expect(lines.some((l) => /heartbeat · read · 4,000\/4,500 · /.test(l))).toBe(true);
    // The runner contract: no progress line starts with the
    // loader name — every line starts with its timestamp.
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged rows, the live layer and the
  // loader_checkpoint row as arrays, with just enough SQL to
  // run the filer. The fixture's 1,716 patches all file
  // (unique UIDs, geometry on every one), so the kill point
  // below is exact: two 500-row flushes stage 1,000 rows and
  // checkpoint at 1,000.
  type StagedRow = { reference: string; seq: number };
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
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
      if (/CREATE TABLE IF NOT EXISTS phi_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO phi_stage/.test(text)) {
        // pg binds by the highest $N the statement names: the
        // bind must supply exactly that many parameters. Enforce
        // it here, or a stride/column mismatch sails through the
        // fake and only fails on real Postgres (BUG-380: stride
        // 9 named 4501 placeholders for a 500-row chunk while
        // the bind supplied 5000).
        const highest = Math.max(...[...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
        if (params.length !== highest)
          throw new Error(
            `bind message supplies ${params.length} parameters, but prepared statement "" requires ${highest}`,
          );
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 10; r++) {
          staged.push({
            reference: params[r * 10 + 3] as string,
            seq: params[r * 10 + 9] as number,
          });
        }
        return { rows: [], rowCount: params.length / 10 };
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
        return {
          rows: [
            {
              n: staged.length,
              s: staged.reduce((a, r) => a + r.seq, 0),
              m: staged.length ? Math.max(...staged.map((r) => r.seq)) : 0,
            },
          ],
        };
      }
      if (/DELETE FROM phi_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM phi_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM phi_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/SELECT source_reference FROM phi_stage/.test(text))
        return { rows: staged.map((r) => ({ source_reference: r.reference })) };
      if (/DELETE FROM planning_layers WHERE constraint_type = 'priority_habitat'/.test(text)) {
        live = [];
        return { rows: [] };
      }
      if (/INSERT INTO planning_layers/.test(text)) {
        live = [...staged];
        return { rows: [] };
      }
      if (
        /SELECT count\(\*\)::int AS n FROM planning_layers WHERE constraint_type = 'priority_habitat'/.test(
          text,
        )
      )
        return { rows: [{ n: live.length }] };
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: () => staged,
      live: () => live,
      liveRefs: () => live.map((r) => r.reference),
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        insertCalls = 0;
        failAfterInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  async function runLoad(
    fake: FakeClient,
    {
      restart = false,
      lines = null as string[] | null,
    }: { restart?: boolean; lines?: string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-priority-habitats",
      log: (line: string) => captured.push(line),
    });
    const filer = await beginFiling(progress, { client: fake as never, restart });
    const edition = await peekPhiFixtureVersion(fixtureDir);
    const prep = await filer.prepareResume(edition, null);
    const run = createPhiProcessor({
      onRow: (
        row: {
          name: string | null;
          wkt: string;
          reference: string;
          detail: string | null;
          sourceDate: string;
        },
        ctx: { read: number; state: Record<string, unknown> },
      ) => filer.stageRow(row, ctx),
    });
    if (prep.resumed) await run.seedFromCheckpoint(prep.checkpoint, await filer.stagedUids());
    const startOffset = prep.resumed ? prep.checkpoint.next_start_index : 0;
    await streamPhiFixture(fixtureDir, (feature: never) => run.processFeature(feature), {
      startOffset,
    });
    await filer.flushTail({ read: run.state.read, state: run.checkpointState() });
    return { filer, run, lines: captured };
  }
  const fixtureRefs = () => phi.map((f) => String(f.properties.UID));

  it("kill mid-read resumes and files every patch exactly once", { timeout: 60_000 }, async () => {
    const fake = createFakeClient();
    // Kill after two 500-row flushes: 1,000 rows staged, the
    // checkpoint at 1,000, the third flush never landed.
    const killLines: string[] = [];
    fake.setFailAfterInserts(2);
    await expect(runLoad(fake, { lines: killLines })).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);
    expect(fake.checkpoints.get("load-priority-habitats")?.next_start_index).toBe(1000);
    expect(fake.checkpoints.get("load-priority-habitats")?.filed_count).toBe(1000);
    expect(
      killLines.some((l) => /checkpoint 1,000 patches · staged 1,000 · resume from 1,000/.test(l)),
    ).toBe(true);

    fake.setFailAfterInserts(null);
    const { filer, run, lines } = await runLoad(fake);
    expect(run.state.read).toBe(1716);
    expect(run.state.filed).toBe(1716);
    expect(run.state.duplicates).toBe(0);
    expect(() => run.checkGolden()).not.toThrow();
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 1,000 rows staged · edition Sept_26 · resume from 1,000/.test(
          l,
        ),
      ),
    ).toBe(true);
    await filer.finishFiling(run.state.filed);
    expect(fake.liveRefs().sort()).toEqual(fixtureRefs().sort());
    // The swap cleared staging and the checkpoint together.
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-priority-habitats")).toBeUndefined();
    expect(filer.resumeNote()).toBe("the start (nothing staged yet)");
  });

  it(
    "an edition change discards the staged rows and starts from zero",
    { timeout: 60_000 },
    async () => {
      const fake = createFakeClient();
      fake.setFailAfterInserts(2);
      await expect(runLoad(fake)).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(1000);

      const progress = createProgressLogger({ name: "load-priority-habitats", log: () => {} });
      const filer = await beginFiling(progress, { client: fake as never });
      const prep = await filer.prepareResume("Sept_27", null);
      expect(prep.resumed).toBe(false);
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-priority-habitats")).toBeUndefined();
    },
  );

  it("--restart discards the checkpoint and starts from zero", { timeout: 60_000 }, async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(2);
    await expect(runLoad(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);

    fake.setFailAfterInserts(null);
    const { filer, run } = await runLoad(fake, { restart: true });
    expect(run.state.read).toBe(1716);
    expect(run.state.filed).toBe(1716);
    await filer.finishFiling(run.state.filed);
    expect(fake.liveRefs().sort()).toEqual(fixtureRefs().sort());
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-priority-habitats")).toBeUndefined();
  });

  it(
    "a 500-row stage flush binds exactly as many parameters as its placeholders name (BUG-380)",
    { timeout: 60_000 },
    async () => {
      const fake = createFakeClient();
      const { run } = await runLoad(fake);
      expect(run.state.read).toBe(1716);
      expect(run.state.filed).toBe(1716);
      // Three 500-row flushes plus a 216-row tail: every staged
      // row carries its dense seq, in read order.
      const staged = fake.staged();
      expect(staged.length).toBe(1716);
      expect(staged.map((r) => r.seq)).toEqual(Array.from({ length: 1716 }, (_, i) => i));
      expect(staged.map((r) => r.reference)).toEqual(fixtureRefs());
    },
  );
});
