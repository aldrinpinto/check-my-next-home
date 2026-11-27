// Resume support for the flood loaders (BUG-366), tested
// against the zones fixture in fixture mode.
//
// The fake database below is the whole point: a stateful
// in-memory stand-in for Postgres — the checkpoint table,
// the staging table and the live table as arrays, with just
// enough SQL understood for the resume flow. It lets the
// test stage partway, kill the run, resume it and file the
// complete set without a database server (the real-SQL proof
// is the local-db-spike rehearsal, run before the push).
//
// The fake's staged-golden filter mirrors the in-memory
// sift's own test (bboxDistanceMiles < the golden window)
// rather than PostGIS geography: the resumed run's sift must
// equal the uninterrupted run's exactly, and the sift is the
// reference. In production the SQL's envelope test decides;
// the two agree except on rows whose bbox sits within a
// rounding error of the window, and no golden check turns
// on such a row (a covering polygon is always well inside).

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProgressLogger } from "../loaders/progress.mjs";
import {
  GOLDEN_WINDOW_MILES,
  bboxDistanceMiles,
  bboxOfPolygons,
} from "../loaders/flood-stream.mjs";
import { createFloodResume, validateCheckpoint } from "../loaders/flood-resume.mjs";
import { beginFiling, checkGolden, readFixture } from "../loaders/load-flood-zones.mjs";
import { beginFiling as beginRiversSeaFiling } from "../loaders/load-flood-rivers-sea.mjs";
import { beginFiling as beginSurfaceWaterFiling } from "../loaders/load-flood-surface-water.mjs";
import { beginFiling as beginRiversSeaClimateFiling } from "../loaders/load-flood-rivers-sea-climate.mjs";
import { beginFiling as beginSurfaceWaterClimateFiling } from "../loaders/load-flood-surface-water-climate.mjs";
import { createDefencesFiler } from "../loaders/load-flood-defences.mjs";

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/flood-zones");
const EDITION = "2026-10-21";
const EXPECTED = 463;

// A MULTIPOLYGON WKT string to GeoJSON coordinates — the
// shape geojsonPolygons returns, so the loader's rebuild
// maps it back to polygons and a bbox exactly.
function wktToCoordinates(wkt: string): number[][][][] {
  const body = wkt.trim().replace(/^MULTIPOLYGON\s*/i, "");
  let i = 0;
  const skipWs = () => {
    while (i < body.length && /\s/.test(body[i])) i += 1;
  };
  const parseNumber = () => {
    skipWs();
    const m = /^-?\d+(?:\.\d+)?(?:e-?\d+)?/i.exec(body.slice(i));
    if (!m) throw new Error(`bad WKT number at ${body.slice(i, i + 12)}`);
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const expectChar = (c: string) => {
    skipWs();
    if (body[i] !== c) throw new Error(`bad WKT: expected ${c} at ${body.slice(i, i + 12)}`);
    i += 1;
  };
  const parseRing = (): number[][] => {
    expectChar("(");
    const ring: number[][] = [];
    for (;;) {
      ring.push([parseNumber(), parseNumber()]);
      skipWs();
      if (body[i] === ",") {
        i += 1;
        continue;
      }
      expectChar(")");
      return ring;
    }
  };
  const parsePolygon = (): number[][][] => {
    expectChar("(");
    const rings: number[][][] = [];
    for (;;) {
      rings.push(parseRing());
      skipWs();
      if (body[i] === ",") {
        i += 1;
        continue;
      }
      expectChar(")");
      return rings;
    }
  };
  expectChar("(");
  const polygons: number[][][][] = [];
  for (;;) {
    polygons.push(parsePolygon());
    skipWs();
    if (body[i] === ",") {
      i += 1;
      continue;
    }
    expectChar(")");
    return polygons;
  }
}

interface FakeStageRow {
  layerType: string;
  label: string;
  wkt: string;
  edition: string;
  detail: string;
  source: string;
  sourceDate: string;
  seq: number;
}

// The stateful fake pg client. query() matches on the SQL's
// distinctive shape; anything unrecognised throws, so a new
// query the flow issues is a loud failure, not a silent pass.
function createFakeDb() {
  const checkpoint = new Map<string, Record<string, unknown>>();
  const stage: FakeStageRow[] = [];
  const layers: FakeStageRow[] = [];
  const statements: string[] = [];
  // Every query the flow issues, with its params — the
  // BUG-374 staging-shape test reads the SQL text itself,
  // so a mismatch the row handlers would silently absorb
  // is still caught.
  const calls: { sql: string; params: unknown[] }[] = [];
  // Every seq ever inserted as a NEW staged row (re-staged
  // no-ops are not recorded): the distinct set proves the
  // read staged every seq exactly once.
  const insertedSeqs: number[] = [];
  const client = {
    checkpoint,
    stage,
    layers,
    statements,
    calls,
    insertedSeqs,
    connect: async () => {},
    end: async () => {},
    query: async (sql: string, params: unknown[] = []) => {
      statements.push(sql);
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      // The DELETE must match before the SELECT below: its
      // text contains the SELECT's FROM ... WHERE fragment.
      if (sql.includes("DELETE FROM flood_loader_checkpoint WHERE loader = $1")) {
        checkpoint.delete(params[0] as string);
        return { rows: [] };
      }
      if (sql.includes("FROM flood_loader_checkpoint WHERE loader = $1")) {
        const row = checkpoint.get(params[0] as string);
        return { rows: row ? [row] : [] };
      }
      if (sql.includes("INSERT INTO flood_loader_checkpoint")) {
        const [
          loader,
          layerType,
          edition,
          expected,
          nextStartIndex,
          read,
          filed,
          geoless,
          perLabel,
        ] = params as [string, string, string, number, number, number, number, number, string];
        checkpoint.set(loader as string, {
          loader,
          layer_type: layerType,
          edition,
          expected,
          next_start_index: nextStartIndex,
          read_count: read,
          filed_count: filed,
          geoless_count: geoless,
          per_label: JSON.parse(perLabel),
          updated_at: new Date().toISOString(),
        });
        return { rows: [] };
      }
      if (
        sql.includes("INSERT INTO flood_stage") ||
        sql.includes("INSERT INTO flood_climate_stage")
      ) {
        const tupleCount = (sql.match(/ST_GeomFromText\(/g) || []).length;
        for (let t = 0; t < tupleCount; t += 1) {
          const base = t * 8;
          const row: FakeStageRow = {
            layerType: params[base] as string,
            label: params[base + 1] as string,
            wkt: params[base + 2] as string,
            edition: params[base + 3] as string,
            detail: params[base + 4] as string,
            source: params[base + 5] as string,
            sourceDate: params[base + 6] as string,
            seq: params[base + 7] as number,
          };
          if (!stage.some((r) => r.layerType === row.layerType && r.seq === row.seq)) {
            stage.push(row);
            insertedSeqs.push(row.seq);
          }
        }
        return { rows: [], rowCount: tupleCount };
      }
      // The defences staging INSERT (BUG-374): the BUG-374
      // test reads the recorded SQL + params itself, so this
      // handler only has to accept the statement.
      if (sql.includes("INSERT INTO flood_defences_stage")) {
        const tupleCount = (sql.match(/\(\$/g) || []).length;
        return { rows: [], rowCount: tupleCount };
      }
      if (
        sql.includes("SELECT risk_label, detail, ST_AsGeoJSON(geom) AS geojson FROM flood_stage")
      ) {
        const layerType = params[0] as string;
        const homeCount = (sql.match(/ST_DWithin/g) || []).length;
        const homes: { lng: number; lat: number }[] = [];
        for (let h = 0; h < homeCount; h += 1)
          homes.push({ lng: params[1 + h * 2] as number, lat: params[2 + h * 2] as number });
        const capped = sql.includes("AND seq <");
        const cap = capped ? (params[params.length - 1] as number) : null;
        const inLayer = stage.filter((r) => r.layerType === layerType);
        const inPrefix = inLayer.filter((r) => cap === null || r.seq < cap);
        const rows = inPrefix
          .filter((r) => {
            // The loader's rings are flat [x0, y0, x1, y1, …];
            // the WKT parses to GeoJSON pairs, so flatten
            // before the bbox test (the returned GeoJSON keeps
            // the pairs — geojsonPolygons flattens them).
            const flat = wktToCoordinates(r.wkt).map((polygon) =>
              polygon.map((ring) => ring.flat()),
            );
            const bbox = bboxOfPolygons(flat);
            return homes.some((home) => bboxDistanceMiles(bbox, home) < GOLDEN_WINDOW_MILES);
          })
          .map((r) => ({
            risk_label: r.label,
            detail: r.detail,
            geojson: JSON.stringify({ type: "MultiPolygon", coordinates: wktToCoordinates(r.wkt) }),
          }));
        return { rows };
      }
      if (
        sql.includes(
          "SELECT count(*)::int AS n FROM flood_stage WHERE layer_type = $1 AND NOT ST_IsValid(geom)",
        )
      )
        return { rows: [{ n: 0 }] };
      if (sql.includes("coalesce(sum(seq), 0)::bigint AS s FROM flood_stage")) {
        const rows = stage.filter((r) => r.layerType === (params[0] as string));
        return {
          rows: [{ n: rows.length, s: String(rows.reduce((acc, r) => acc + r.seq, 0)) }],
        };
      }
      // Climate staging (BUG-382: the climate filers stage into
      // flood_climate_stage, so their prepare() needs the same
      // count/sum answer as the flood_stage table).
      if (sql.includes("coalesce(sum(seq), 0)::bigint AS s FROM flood_climate_stage")) {
        const rows = stage.filter((r) => r.layerType === (params[0] as string));
        return {
          rows: [{ n: rows.length, s: String(rows.reduce((acc, r) => acc + r.seq, 0)) }],
        };
      }
      if (sql.includes("SELECT count(*)::int AS n FROM flood_stage WHERE layer_type = $1"))
        return {
          rows: [{ n: stage.filter((r) => r.layerType === (params[0] as string)).length }],
        };
      if (sql.includes("DELETE FROM flood_stage WHERE layer_type = $1")) {
        for (let i = stage.length - 1; i >= 0; i -= 1)
          if (stage[i].layerType === (params[0] as string)) stage.splice(i, 1);
        return { rows: [] };
      }
      if (sql.includes("DELETE FROM flood_climate_stage WHERE layer_type = $1")) {
        for (let i = stage.length - 1; i >= 0; i -= 1)
          if (stage[i].layerType === (params[0] as string)) stage.splice(i, 1);
        return { rows: [] };
      }
      if (sql.includes("DELETE FROM flood_layers WHERE layer_type = $1")) {
        for (let i = layers.length - 1; i >= 0; i -= 1)
          if (layers[i].layerType === (params[0] as string)) layers.splice(i, 1);
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO flood_layers")) {
        for (const row of stage.filter((r) => r.layerType === (params[0] as string)))
          layers.push({ ...row });
        return { rows: [] };
      }
      if (sql.includes("FROM flood_layers WHERE layer_type = $1 AND ST_IsEmpty(geom)"))
        return { rows: [{ n: 0 }] };
      if (sql.includes("FROM flood_layers WHERE layer_type = $1 AND NOT ST_IsValid(geom)"))
        return { rows: [{ n: 0 }] };
      if (sql.includes("SELECT count(*)::int AS n FROM flood_layers WHERE layer_type = $1"))
        return {
          rows: [{ n: layers.filter((r) => r.layerType === (params[0] as string)).length }],
        };
      throw new Error(`fake db: unhandled SQL: ${sql.slice(0, 120)}`);
    },
  };
  return client;
}

const collect = () => {
  const lines: string[] = [];
  const log = (...args: unknown[]) => lines.push(args.join(" "));
  return { lines, progress: createProgressLogger({ name: "load-flood-zones", log }) };
};

describe("validateCheckpoint — the resume contract, as a pure function", () => {
  const base = {
    checkpoint: {
      edition: EDITION,
      expected: EXPECTED,
      next_start_index: 381,
      filed_count: 381,
    },
    edition: EDITION,
    expected: EXPECTED,
    staged: { count: 381, sum: (381 * 380) / 2 },
  };
  it("trusts a checkpoint for the same edition, count and staged rows", () => {
    expect(validateCheckpoint(base).resumed).toBe(true);
  });
  it("trusts a checkpoint when staging runs past it — the interrupted unit's flushed tail", () => {
    // A kill mid-part leaves 450 staged rows against a
    // checkpoint at 381: the tail is the interrupted part's
    // flushed chunks, re-staged as no-ops on resume.
    expect(
      validateCheckpoint({ ...base, staged: { count: 450, sum: (450 * 449) / 2 } }).resumed,
    ).toBe(true);
  });
  it("discards when the staged seqs have a gap, even at the right count", () => {
    const check = validateCheckpoint({
      ...base,
      staged: { count: 450, sum: (450 * 449) / 2 + 1 },
    });
    expect(check.resumed).toBe(false);
    expect(check.reason).toMatch(/not contiguous/);
  });
  it("discards when there is no checkpoint", () => {
    expect(validateCheckpoint({ ...base, checkpoint: null }).resumed).toBe(false);
  });
  it("discards when the edition changed", () => {
    const check = validateCheckpoint({ ...base, edition: "2026-11-13" });
    expect(check.resumed).toBe(false);
    expect(check.reason).toMatch(/edition changed/);
  });
  it("discards when the expected count changed", () => {
    const check = validateCheckpoint({ ...base, expected: 415408 });
    expect(check.resumed).toBe(false);
    expect(check.reason).toMatch(/expected count changed/);
  });
  it("discards when the staged rows do not match the checkpoint", () => {
    const check = validateCheckpoint({
      ...base,
      staged: { count: 380, sum: (380 * 379) / 2 },
    });
    expect(check.resumed).toBe(false);
    expect(check.reason).toMatch(/staged 380 rows but the checkpoint says 381/);
  });
  it("discards when the resume point sits outside the read", () => {
    const check = validateCheckpoint({
      ...base,
      checkpoint: { ...base.checkpoint, next_start_index: 464 },
      staged: { count: 381, sum: (381 * 380) / 2 },
    });
    expect(check.resumed).toBe(false);
    expect(check.reason).toMatch(/outside 0–463/);
  });
});

describe("createFloodResume — checkpoint, resume, discard, clear", () => {
  it("writes a checkpoint with a visible log line, resumes from it, and clears it", async () => {
    const db = createFakeDb();
    const { lines, progress } = collect();
    const handle = createFloodResume(db as never, {
      loader: "load-flood-zones",
      layerType: "flood_zone",
      stageTable: "flood_stage",
      progress,
    });
    // A fresh start with stale staging underneath clears it.
    db.stage.push({
      layerType: "flood_zone",
      label: "FZ2",
      wkt: "MULTIPOLYGON(((0 0, 1 0, 1 1, 0 0)))",
      edition: EDITION,
      detail: "stale",
      source: "x",
      sourceDate: EDITION,
      seq: 0,
    });
    expect((await handle.prepare({ edition: EDITION, expected: EXPECTED })).resumed).toBe(false);
    expect(db.stage).toHaveLength(0);
    // The staged rows the checkpoint below describes — the
    // resume validation requires them to number exactly what
    // the checkpoint says.
    for (let seq = 0; seq < 250; seq += 1)
      db.stage.push({
        layerType: "flood_zone",
        label: "FZ2",
        wkt: "MULTIPOLYGON(((0 0, 1 0, 1 1, 0 0)))",
        edition: EDITION,
        detail: "staged",
        source: "x",
        sourceDate: EDITION,
        seq,
      });
    await handle.checkpoint({
      edition: EDITION,
      expected: EXPECTED,
      nextStartIndex: 250,
      totals: { read: 250, filed: 250, geoless: 0, perLabel: { FZ2: 100, FZ3: 150 } },
    });
    expect(
      lines.some((l) =>
        /checkpoint 250\/463 features \(54%\) · staged 250 · resume from 250$/.test(l),
      ),
    ).toBe(true);
    expect(handle.resumeNote()).toBe("checkpoint 250/463 features (edition 2026-10-21)");
    const second = createFloodResume(db as never, {
      loader: "load-flood-zones",
      layerType: "flood_zone",
      stageTable: "flood_stage",
      progress,
    });
    const prepared = await second.prepare({ edition: EDITION, expected: EXPECTED });
    expect(prepared.resumed).toBe(true);
    expect(second.takeSeq(5)).toBe(250);
    await second.clear();
    expect(db.checkpoint.size).toBe(0);
    expect(db.stage).toHaveLength(0);
    expect(lines.some((l) => /staging cleared · checkpoint removed$/.test(l))).toBe(true);
  });

  it("discards a checkpoint whose edition changed, and says why", async () => {
    const db = createFakeDb();
    const { lines, progress } = collect();
    const handle = createFloodResume(db as never, {
      loader: "load-flood-zones",
      layerType: "flood_zone",
      stageTable: "flood_stage",
      progress,
    });
    await handle.checkpoint({
      edition: EDITION,
      expected: EXPECTED,
      nextStartIndex: 250,
      totals: { read: 250, filed: 250, geoless: 0, perLabel: {} },
    });
    const next = createFloodResume(db as never, {
      loader: "load-flood-zones",
      layerType: "flood_zone",
      stageTable: "flood_stage",
      progress,
    });
    const prepared = await next.prepare({ edition: "2026-11-13", expected: EXPECTED });
    expect(prepared.resumed).toBe(false);
    expect(db.checkpoint.size).toBe(0);
    expect(lines.some((l) => /discarding stale checkpoint · edition changed/.test(l))).toBe(true);
  });

  it("--restart discards a valid checkpoint and starts from zero", async () => {
    const db = createFakeDb();
    const { lines, progress } = collect();
    const handle = createFloodResume(db as never, {
      loader: "load-flood-zones",
      layerType: "flood_zone",
      stageTable: "flood_stage",
      progress,
    });
    await handle.checkpoint({
      edition: EDITION,
      expected: EXPECTED,
      nextStartIndex: 250,
      totals: { read: 250, filed: 250, geoless: 0, perLabel: {} },
    });
    const restarted = createFloodResume(db as never, {
      loader: "load-flood-zones",
      layerType: "flood_zone",
      stageTable: "flood_stage",
      progress,
      restart: true,
    });
    const prepared = await restarted.prepare({ edition: EDITION, expected: EXPECTED });
    expect(prepared.resumed).toBe(false);
    expect(db.checkpoint.size).toBe(0);
    expect(lines.some((l) => /restart requested — discarding checkpoint and staging/.test(l))).toBe(
      true,
    );
  });
});

describe("fixture-mode resume end to end (BUG-366)", () => {
  it(
    "stages partway, aborts, resumes and files the complete set",
    // Three full fixture reads over the fake database — slow
    // under parallel workers on this box (the BUG-187
    // streaming tests carry the same 30 s allowance).
    { timeout: 30_000 },
    async () => {
      // The reference: one uninterrupted filing run.
      const refDb = createFakeDb();
      const ref = collect();
      const refFiler = await beginFiling(ref.progress, { client: refDb as never });
      const refResult = await readFixture(FIXTURE_DIR, {
        onItems: (items, edition) => refFiler.stageItems(items, edition),
        progress: ref.progress,
        resume: refFiler,
      });
      expect(refResult.read).toBe(EXPECTED);
      expect(refResult.filed).toBe(EXPECTED);
      expect(refResult.geoless).toBe(0);
      expect(() => checkGolden(refResult)).not.toThrow();
      await refFiler.finishFiling(EXPECTED);
      expect(refDb.layers).toHaveLength(EXPECTED);

      // Run one: parts 1+2 stage and checkpoint; part 3 stages
      // its flushed chunks and then the run dies — the rows
      // still buffered in the filer (after its last flush) die
      // with it, the checkpoint stands at part 2, and the live
      // table is untouched. (BUG-382: the checkpoint flushes
      // the tail first, so nothing is buffered at part 2 — the
      // old "6 rows still buffered" shape is gone.)
      const db = createFakeDb();
      const run1 = collect();
      const filer1 = await beginFiling(run1.progress, { client: db as never });
      let partsSeen = 0;
      await expect(
        readFixture(FIXTURE_DIR, {
          onItems: async (items, edition) => {
            partsSeen += 1;
            await filer1.stageItems(items, edition);
            if (partsSeen === 3) throw new Error("simulated kill mid-read");
          },
          progress: run1.progress,
          resume: filer1,
        }),
      ).rejects.toThrow("simulated kill mid-read");
      await filer1.abortFiling();
      expect(db.layers).toHaveLength(0);
      // Parts 1+2 (381 rows) plus part 3's flushed chunks —
      // the 25-row and 4 MB flushes fire mid-part, so the exact
      // count is the chunking's business, not the test's: what
      // matters is that staging holds a contiguous prefix of
      // the read (every seq from 0, no gaps), past the
      // checkpoint and short of the whole part.
      expect(db.stage.length).toBeGreaterThan(381);
      // Short of the whole part (463): the exact count is the
      // chunking's business — the 4 MB flush can fire late in
      // part 3 and leave a single row buffered.
      expect(db.stage.length).toBeLessThan(EXPECTED);
      expect(db.stage.map((r) => r.seq).sort((a, b) => a - b)).toEqual(
        Array.from({ length: db.stage.length }, (_, i) => i),
      );
      const checkpoint = db.checkpoint.get("load-flood-zones") as Record<string, unknown>;
      expect(checkpoint.next_start_index).toBe(381);
      expect(checkpoint.filed_count).toBe(381);
      expect(
        run1.lines.some((l) =>
          /checkpoint 381\/463 features \(82%\) · staged 381 · resume from 381$/.test(l),
        ),
      ).toBe(true);

      // Run two: the same fake database — the run resumes from
      // the checkpoint, re-reads part 3 (its flushed rows are
      // no-ops, the rows lost from the buffer stage now), and files the set.
      const run2 = collect();
      const filer2 = await beginFiling(run2.progress, { client: db as never });
      const resumed = await readFixture(FIXTURE_DIR, {
        onItems: (items, edition) => filer2.stageItems(items, edition),
        progress: run2.progress,
        resume: filer2,
      });
      expect(resumed.read).toBe(EXPECTED);
      expect(resumed.filed).toBe(EXPECTED);
      expect(resumed.perLabel).toEqual(refResult.perLabel);
      // The sift is exactly the uninterrupted run's — no
      // candidate twice (the rebuild is capped at the
      // checkpoint, the interrupted part is offered once).
      expect(resumed.items).toHaveLength(refResult.items.length);
      expect(() => checkGolden(resumed)).not.toThrow();
      // The staged set is exactly the read: every seq once.
      // (The last few rows are still buffered in the filer
      // when the read returns — finishFiling flushes them
      // before the swap's staged-count check, which is what
      // proves the set complete — so the seq proof is read off
      // the fake's insert record after the swap, below.)
      expect(
        run2.lines.some((l) =>
          /resuming from checkpoint · 381\/463 features staged · edition 2026-10-21 · resume from 381/.test(
            l,
          ),
        ),
      ).toBe(true);
      expect(
        run2.lines.some((l) =>
          /checkpoint 463\/463 features \(100%\) · staged 463 · resume from 463$/.test(l),
        ),
      ).toBe(true);

      // The swap files the complete set and cleans up: no
      // staging rows and no checkpoint are left behind.
      expect(await filer2.finishFiling(EXPECTED)).toBe(0);
      expect(db.layers).toHaveLength(EXPECTED);
      expect(new Set(db.insertedSeqs).size).toBe(EXPECTED);
      expect(Math.min(...db.insertedSeqs)).toBe(0);
      expect(Math.max(...db.insertedSeqs)).toBe(EXPECTED - 1);
      expect(db.stage).toHaveLength(0);
      expect(db.checkpoint.size).toBe(0);
      expect(run2.lines.some((l) => /staging cleared · checkpoint removed$/.test(l))).toBe(true);
    },
  );

  it(
    "a failed swap leaves the live table untouched and the staged read standing",
    { timeout: 30_000 },
    async () => {
      const db = createFakeDb();
      const { progress } = collect();
      const filer = await beginFiling(progress, { client: db as never });
      const result = await readFixture(FIXTURE_DIR, {
        onItems: (items, edition) => filer.stageItems(items, edition),
        progress,
        resume: filer,
      });
      expect(result.read).toBe(EXPECTED);
      // The swap's staged-count check fails (the run read 463
      // but the caller asks to file 462): the swap rolls back,
      // the live table is untouched, and the staged read stands
      // checkpointed for the next run.
      await expect(filer.finishFiling(462)).rejects.toThrow(/staged shape count does not match/);
      expect(db.layers).toHaveLength(0);
      expect(db.stage).toHaveLength(EXPECTED);
      expect(db.checkpoint.get("load-flood-zones")).toBeDefined();
      expect(filer.resumeNote()).toBe(
        "the swap — the staged read stands checkpointed (edition 2026-10-21)",
      );
    },
  );
});

// --- staging INSERT shape (BUG-374) ------------------------------------
// CI #366 died on the defences staging INSERT: 15 target columns
// but 14 placeholders per tuple (stride 14) while 15 params were
// pushed per row — "INSERT has more target columns than
// expressions". The fake database's row handlers trusted the
// stride, so the mismatch shipped silently. These tests read the
// recorded SQL text and params themselves and assert the counts
// agree, for every flood staging INSERT, so the class cannot
// recur unnoticed.

// Split the VALUES list into its top-level tuples, honouring the
// nested ST_GeomFromText(...) parens inside the OGC tuples.
function valuesTuples(sql: string): string[] {
  const valuesAt = sql.indexOf("VALUES");
  const onConflictAt = sql.indexOf("ON CONFLICT");
  const valuesPart = sql.slice(
    valuesAt + "VALUES".length,
    onConflictAt === -1 ? undefined : onConflictAt,
  );
  const tuples: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of valuesPart) {
    if (ch === "(") {
      depth += 1;
      if (depth === 1) {
        current = "";
        continue;
      }
    }
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        tuples.push(current);
        continue;
      }
    }
    if (depth >= 1) current += ch;
  }
  return tuples;
}

// One staging INSERT, fully reconciled: every tuple carries
// exactly one placeholder per target column, the stride from one
// tuple to the next is the column count, and the params array
// holds exactly tuples x columns values.
function assertStagingInsertShape(call: { sql: string; params: unknown[] }, table: string) {
  const { sql, params } = call;
  const colsMatch = /INSERT INTO \S+ \(([^)]+)\)/.exec(sql);
  expect(colsMatch, `${table}: no target-column list in the staging INSERT`).not.toBeNull();
  const columns = colsMatch![1]
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const tuples = valuesTuples(sql);
  // More than one tuple: a stride error hides in a single row.
  expect(tuples.length, `${table}: expected a multi-row flush`).toBeGreaterThan(1);
  for (const [t, tuple] of tuples.entries()) {
    const placeholders = (tuple.match(/\$\d+/g) || []).length;
    expect(
      placeholders,
      `${table} tuple ${t}: ${placeholders} placeholders for ${columns.length} target columns`,
    ).toBe(columns.length);
    const first = parseInt((tuple.match(/\$\d+/) || ["$0"])[0].slice(1), 10);
    expect(first, `${table} tuple ${t}: stride is not the column count`).toBe(
      t * columns.length + 1,
    );
  }
  expect(
    params.length,
    `${table}: ${params.length} params for ${tuples.length} tuples x ${columns.length} columns`,
  ).toBe(tuples.length * columns.length);
}

describe("staging INSERTs — placeholder count matches the target columns (BUG-374)", () => {
  const ogcFilers = [
    ["flood zones", "flood_stage", beginFiling],
    ["flood rivers and sea", "flood_stage", beginRiversSeaFiling],
    ["flood surface water", "flood_stage", beginSurfaceWaterFiling],
    ["flood rivers and sea climate", "flood_climate_stage", beginRiversSeaClimateFiling],
    ["flood surface water climate", "flood_climate_stage", beginSurfaceWaterClimateFiling],
  ] as const;

  it.each(ogcFilers)("%s stages with a matching INSERT", async (_label, table, begin) => {
    const db = createFakeDb();
    const { progress } = collect();
    const filer = await begin(progress, { client: db as never });
    // 26 items: the filer flushes at 25, so the recorded
    // INSERT is a genuine multi-row flush.
    const items = Array.from({ length: 26 }, (_, i) => ({
      polygons: [
        [
          [
            [0, 0],
            [0.01, 0],
            [0.01, 0.01],
            [0, 0],
          ],
        ],
      ],
      label: i % 2 === 0 ? "FZ2" : "FZ3",
      detail: "river · test",
    }));
    await filer.stageItems(items, EDITION);
    const call = db.calls.find((c) => c.sql.includes(`INSERT INTO ${table}`));
    expect(call, `no staging INSERT recorded for ${table}`).toBeDefined();
    assertStagingInsertShape(call!, table);
  });

  it("flood defences stages with a matching INSERT", async () => {
    const db = createFakeDb();
    // No progress logger: the filer's options type the logger
    // as null by default, and the flush under test logs nothing.
    const filer = await createDefencesFiler(db as never, EDITION);
    // 101 rows: the filer flushes at 100, so the recorded
    // INSERT is a genuine multi-row flush.
    for (let i = 0; i < 101; i += 1) {
      await filer.addRow({
        assetId: `A${i}`,
        assetName: `Defence ${i}`,
        assetSubType: "wall",
        protectionType: "fluvial",
        assetMaintainer: "Environment Agency",
        assetOperator: "Environment Agency",
        currentCondition: "2",
        designSop: "100",
        designSopDqf: "high",
        currentSop: "75",
        waterCourseName: "Test Brook",
        lastInspectionDate: "2024-01-01",
        wkt: "LINESTRING (0 0, 1 1)",
      });
    }
    const call = db.calls.find((c) => c.sql.includes("INSERT INTO flood_defences_stage"));
    expect(call, "no staging INSERT recorded for flood_defences_stage").toBeDefined();
    assertStagingInsertShape(call!, "flood_defences_stage");
  });
});

describe("checkpoint after an unflushed tail — the filer flushes before the checkpoint (BUG-382)", () => {
  const ogcFilers = [
    ["flood zones", beginFiling],
    ["flood rivers and sea", beginRiversSeaFiling],
    ["flood surface water", beginSurfaceWaterFiling],
    ["flood rivers and sea climate", beginRiversSeaClimateFiling],
    ["flood surface water climate", beginSurfaceWaterClimateFiling],
  ] as const;

  it.each(ogcFilers)(
    "%s resumes after a kill with 10 unflushed rows still buffered",
    async (_label, begin) => {
      const db = createFakeDb();
      const { progress } = collect();
      // A killed run, the BUG-381 shape: 10 items staged —
      // below the 25-row flush threshold, so nothing has
      // reached the database — then the checkpoint written
      // for them, filed ahead of staged rows. A fresh filer
      // must resume from that checkpoint, not discard it.
      const filer = await begin(progress, { client: db as never });
      const items = Array.from({ length: 10 }, (_, i) => ({
        polygons: [
          [
            [
              [0, 0],
              [0.01, 0],
              [0.01, 0.01],
              [0, 0],
            ],
          ],
        ],
        label: i % 2 === 0 ? "FZ2" : "FZ3",
        detail: "river · test",
      }));
      await filer.stageItems(items, EDITION);
      await filer.checkpoint({
        edition: EDITION,
        expected: 100,
        nextStartIndex: 10,
        totals: { read: 10, filed: 10, geoless: 0, perLabel: {} },
      });
      const fresh = await begin(progress, { client: db as never });
      const outcome = await fresh.prepare({ edition: EDITION, expected: 100 });
      expect(outcome.resumed, "the checkpoint was discarded — the unflushed tail is lost").toBe(
        true,
      );
      expect(outcome.checkpoint?.next_start_index).toBe(10);
    },
  );
});
