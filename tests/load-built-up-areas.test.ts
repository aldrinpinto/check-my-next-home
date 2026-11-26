import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { beginFiling, readFixture } from "../loaders/load-built-up-areas.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the built-up areas loader (plan step M6.21,
// decision D41): the ONS Built Up Areas (December 2024)
// boundaries file DIRECT from ONS into planning_layers as
// built_up_area — never the platform's republished copy
// (England-only and older, rejected at the prep). The
// fixture (the seven areas around the three universal
// homes plus the Bath witness, from the live service on
// 16 Nov 2026) reproduces the pinned names below by an
// independent point-in-polygon over the filed polygons:
// Birkdale in Hatfield Peverel, Exeter in Newham (the
// Greater London borough rule — the built-up area takes
// the borough's name inside London), Minerva in Ewell,
// and the Bath witness inside Bath. The loader's own
// golden checks run in both modes; the filing proof runs
// in CI against a real PostGIS.

const loader = readFileSync(join(process.cwd(), "loaders/load-built-up-areas.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/built-up-areas");
const geojson = JSON.parse(readFileSync(join(fixtureDir, "built-up-areas.geojson"), "utf8")) as {
  features: {
    properties: { BUA24CD: string; BUA24NM: string };
    geometry: { type: string; coordinates: number[][][] | number[][][][] };
  }[];
};

const HOMES = {
  birkdale: { lat: 51.776176, lng: 0.60387 },
  exeter: { lat: 51.515224, lng: 0.021177 },
  epsom: { lat: 51.344571, lng: -0.247104 },
  bath: { lat: 51.3811, lng: -2.359 },
};

function ringContains(ring: number[][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function featureContains(
  feature: (typeof geojson.features)[number],
  lng: number,
  lat: number,
): boolean {
  const polys =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as number[][][]]
      : (feature.geometry.coordinates as number[][][][]);
  return polys.some((poly) => {
    if (!ringContains(poly[0], lng, lat)) return false;
    return !poly.slice(1).some((hole) => ringContains(hole, lng, lat));
  });
}

function areaAt(home: { lat: number; lng: number }): string | null {
  const hit = geojson.features.find((f) => featureContains(f, home.lng, home.lat));
  return hit ? hit.properties.BUA24NM : null;
}

describe("built-up areas loader sources", () => {
  it("reads the December 2024 edition direct from the ONS service", () => {
    expect(loader).toContain("services1.arcgis.com/ESMARspQHYMw9BZ9");
    expect(loader).toContain("main_ONS_BUA_2024_EW_V2");
    expect(loader).toContain('EDITION_DATE = "2024-12-01"');
    // The platform's republished copy is never the source.
    expect(loader).not.toContain("planning.data.gov.uk");
  });

  it("carries the attribution pinned from the ONS product itself", () => {
    expect(loader).toContain("contains OS data © Crown copyright and database right");
    expect(loader).toContain("Open Government Licence v.3.0");
  });

  it("files into planning_layers as built_up_area, keyed by the ONS code", () => {
    expect(loader).toContain("planning_layers");
    expect(loader).toContain("'built_up_area'");
    expect(loader).toContain("BUA24CD");
    expect(loader).toContain("BUA24NM");
  });
});

describe("built-up areas fixture goldens (16 Nov 2026 capture)", () => {
  it("the cut holds the seven areas around the homes and the witness", () => {
    expect(geojson.features.map((f) => f.properties.BUA24NM).sort()).toEqual([
      "Bath",
      "Epsom",
      "Ewell",
      "Hatfield Peverel",
      "Newham",
      "Tower Hamlets",
      "Witham",
    ]);
  });

  it("pins the three homes' areas from the filed polygons", () => {
    expect(areaAt(HOMES.birkdale)).toBe("Hatfield Peverel");
    expect(areaAt(HOMES.exeter)).toBe("Newham");
    expect(areaAt(HOMES.epsom)).toBe("Ewell");
  });

  it("pins the Bath witness inside Bath", () => {
    expect(areaAt(HOMES.bath)).toBe("Bath");
  });
});

// BUG-265: the paged read carries the shared progress logger
// — a line per 2,000 features (a closing line only at fixture
// scale: the fixture is one page of 7).
describe("progress logging (BUG-265)", () => {
  it("reads the fixture with a closing read line, and the read is unchanged", async () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-built-up-areas",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const processed = await readFixture(fixtureDir, { progress });
    expect(processed.filed).toBe(7);
    expect(processed.total).toBe(7);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/progress · read 7 features$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged rows, the live layer and the
  // loader_checkpoint row as arrays, with just enough SQL to
  // run the filer. The WKT the filer inserts is converted back
  // to GeoJSON for the staged-golden rebuild, so the sift on a
  // resumed run filters exactly as it would live.
  type StagedRow = {
    name: string;
    wkt: string;
    code: string;
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
      if (/CREATE TABLE IF NOT EXISTS built_up_area_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO built_up_area_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 10; r++) {
          const b = r * 10;
          staged.push({
            name: params[b + 1] as string,
            wkt: params[b + 2] as string,
            code: params[b + 3] as string,
            seq: params[b + 9] as number,
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
          // The real jsonb column returns a parsed object; the
          // writer sends a JSON string (loader-resume.mjs).
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
      if (/DELETE FROM built_up_area_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM built_up_area_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM built_up_area_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/ST_AsGeoJSON\(geom\)/.test(text)) {
        return {
          rows: staged.map((r) => ({
            name: r.name,
            source_reference: r.code,
            geojson: JSON.stringify(wktToGeoJson(r.wkt)),
          })),
        };
      }
      if (/DELETE FROM planning_layers WHERE constraint_type = 'built_up_area'/.test(text)) {
        live = [];
        return { rows: [] };
      }
      if (/INSERT INTO planning_layers/.test(text)) {
        live = [...staged];
        return { rows: [] };
      }
      if (
        /SELECT count\(\*\)::int AS n FROM planning_layers WHERE constraint_type = 'built_up_area'/.test(
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
      liveCodes: () => live.map((r) => r.code),
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        failAfterInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;

  // A two-page fixture: the seven real areas first, then
  // 1,998 synthetic areas on a far-away square — 2,005
  // features over two 2,000-feature pages, so a kill can
  // land between pages. The golden areas sit in page 1,
  // which is what makes the resumed run's sift rebuild
  // observable: the resumed read sees page 2 only, and
  // the golden candidates can arrive only from the staged
  // rows.
  function syntheticFeature(code: string, name: string) {
    const c: [number, number][] = [
      [10, 50],
      [10.01, 50],
      [10.01, 50.01],
      [10, 50.01],
      [10, 50],
    ];
    return {
      properties: { BUA24CD: code, BUA24NM: name },
      geometry: { type: "Polygon", coordinates: [c] },
    };
  }
  const resumeDir = (() => {
    const dir = mkdtempSync(join(tmpdir(), "bua-resume-"));
    const features = [...geojson.features];
    for (let n = 1; n <= 1998; n += 1) {
      features.push(syntheticFeature(`E6309${String(n).padStart(4, "0")}`, `Synthetic ${n}`));
    }
    writeFileSync(
      join(dir, "built-up-areas.geojson"),
      JSON.stringify({ type: "FeatureCollection", features }),
    );
    return dir;
  })();

  async function runLoad(
    fake: FakeClient,
    {
      restart = false,
      lines = null as string[] | null,
    }: { restart?: boolean; lines?: string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-built-up-areas",
      log: (line: string) => captured.push(line),
    });
    const filer = await beginFiling(progress, { client: fake as never, restart });
    const onEdition = async (edition: string) => {
      const prep = await filer.prepareResume(edition);
      if (!prep.resumed) return { startOffset: 0 };
      const cp = prep.checkpoint;
      return {
        startOffset: cp.next_start_index,
        seed: {
          total: cp.read_count,
          filed: cp.filed_count,
          geoless: (cp.state?.geoless ?? 0) as number,
          invalid: (cp.state?.invalid ?? 0) as number,
        },
        seedItems: await filer.stagedGoldenItems(),
      };
    };
    const processed = await readFixture(resumeDir, {
      onItems: (items, rawOffset, tallies) => filer.stageItems(items, rawOffset, tallies),
      progress,
      onEdition,
    });
    return { filer, processed, lines: captured };
  }
  // The golden areas' codes: the three homes' areas plus
  // the Bath witness. On a resumed run these reach the
  // sift only through the staged-golden rebuild.
  const GOLDEN_CODES = ["E63011486", "E63012003", "E63012408", "E63012364"];

  it(
    "kill after page 1 resumes from the page boundary and files every area exactly once",
    { timeout: 30_000 },
    async () => {
      const fake = createFakeClient();
      // Kill on page 2's single insert: page 1 staged whole
      // (200 chunks of 10) and checkpointed at raw offset
      // 2,000; page 2 never landed.
      const killLines: string[] = [];
      fake.setFailAfterInserts(200);
      await expect(runLoad(fake, { lines: killLines })).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(2000);
      expect(fake.checkpoints.get("load-built-up-areas")?.next_start_index).toBe(2000);
      expect(fake.checkpoints.get("load-built-up-areas")?.filed_count).toBe(2000);
      expect(
        killLines.some((l) =>
          /checkpoint 2,000 features · staged 2,000 · resume from 2,000/.test(l),
        ),
      ).toBe(true);

      fake.setFailAfterInserts(null);
      const { filer, processed, lines } = await runLoad(fake);
      expect(processed.total).toBe(2005);
      expect(processed.filed).toBe(2005);
      expect(processed.geoless).toBe(0);
      expect(
        lines.some((l) =>
          /resuming from checkpoint · 2,000 rows staged · edition 2024-12-01 · resume from 2,000/.test(
            l,
          ),
        ),
      ).toBe(true);
      // The golden areas reach the sift only from the staged
      // rows — the resumed read saw page 2's synthetics alone.
      for (const code of GOLDEN_CODES) {
        expect(processed.items.some((f) => f.code === code)).toBe(true);
      }
      await filer.finishFiling(processed.filed);
      expect(fake.liveCodes().sort()).toHaveLength(2005);
      expect(new Set(fake.liveCodes()).size).toBe(2005);
      for (const code of GOLDEN_CODES) {
        expect(fake.liveCodes()).toContain(code);
      }
      // The swap cleared staging and the checkpoint together.
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-built-up-areas")).toBeUndefined();
      expect(filer.resumeNote()).toBe("the start (nothing staged yet)");
    },
  );

  it(
    "a kill mid-page leaves no checkpoint, so the next run starts from zero",
    { timeout: 30_000 },
    async () => {
      const fake = createFakeClient();
      // Kill on page 1's 151st chunk: 1,500 rows staged, the
      // page-end checkpoint never written.
      fake.setFailAfterInserts(150);
      await expect(runLoad(fake)).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(1500);
      expect(fake.checkpoints.get("load-built-up-areas")).toBeUndefined();

      fake.setFailAfterInserts(null);
      const { filer, processed, lines } = await runLoad(fake);
      expect(processed.total).toBe(2005);
      expect(processed.filed).toBe(2005);
      expect(lines.some((l) => /resuming from checkpoint/.test(l))).toBe(false);
      await filer.finishFiling(processed.filed);
      expect(fake.liveCodes()).toHaveLength(2005);
      expect(new Set(fake.liveCodes()).size).toBe(2005);
      expect(fake.staged().length).toBe(0);
    },
  );

  it(
    "an edition change discards the staged rows and starts from zero",
    { timeout: 30_000 },
    async () => {
      const fake = createFakeClient();
      fake.setFailAfterInserts(200);
      await expect(runLoad(fake)).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(2000);

      const progress = createProgressLogger({
        name: "load-built-up-areas",
        log: () => {},
      });
      const filer = await beginFiling(progress, { client: fake as never });
      const prep = await filer.prepareResume("1999-01-01");
      expect(prep.resumed).toBe(false);
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-built-up-areas")).toBeUndefined();
    },
  );

  it("--restart discards the checkpoint and starts from zero", { timeout: 30_000 }, async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(200);
    await expect(runLoad(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(2000);

    fake.setFailAfterInserts(null);
    const { filer, processed, lines } = await runLoad(fake, { restart: true });
    expect(processed.total).toBe(2005);
    expect(processed.filed).toBe(2005);
    expect(
      lines.some((l) =>
        /restart requested — discarding checkpoint and staging · starting from 0/.test(l),
      ),
    ).toBe(true);
    expect(lines.some((l) => /resuming from checkpoint/.test(l))).toBe(false);
    await filer.finishFiling(processed.filed);
    expect(fake.liveCodes()).toHaveLength(2005);
    expect(new Set(fake.liveCodes()).size).toBe(2005);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-built-up-areas")).toBeUndefined();
  });
});
