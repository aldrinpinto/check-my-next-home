// Street lines loader — unit tests (plan step M8.3).
//
// The loader's pure helpers only: the filed highway
// vocabulary, the name rule, bbox parsing and matching,
// the golden checks and the extract verification helpers.
// The filing itself (PostGIS) is exercised by the golden
// replay in CI's database job, where the fixture captures
// file through this loader and the flood maps' promise
// assertions read the filed streets back.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXTRACT_FLOORS,
  FILED_HIGHWAY_CLASSES,
  areaResumeNote,
  beginNationalStaging,
  classifyHighway,
  extractDataDate,
  extractsEdition,
  goldenChecks,
  md5Matches,
  parseBbox,
  parsePublishedMd5,
  runAreaCuts,
  streetName,
  wayMeetsBbox,
  wktLineToPoints,
} from "../loaders/load-streets.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

describe("load-streets — the filed vocabulary", () => {
  it("files the road and path classes a street map draws", () => {
    for (const cls of [
      "motorway",
      "trunk",
      "primary",
      "secondary",
      "tertiary",
      "unclassified",
      "residential",
      "living_street",
      "service",
      "pedestrian",
      "footway",
      "path",
      "cycleway",
    ])
      expect(classifyHighway({ highway: cls }), cls).toBe(cls);
  });

  it("never files a street that is not there, or a non-way", () => {
    for (const cls of ["construction", "proposed", "abandoned", "raceway", "bus_guideway"])
      expect(classifyHighway({ highway: cls }), cls).toBeNull();
    expect(classifyHighway({})).toBeNull();
    expect(classifyHighway({ highway: "" })).toBeNull();
    expect(FILED_HIGHWAY_CLASSES.has("construction")).toBe(false);
  });
});

describe("load-streets — names", () => {
  it("records the name tag trimmed; unnamed ways file with no name", () => {
    expect(streetName({ name: "  Birkdale Rise " })).toBe("Birkdale Rise");
    expect(streetName({})).toBeNull();
    expect(streetName({ name: "   " })).toBeNull();
  });
});

describe("load-streets — bboxes", () => {
  it("parses and validates", () => {
    expect(parseBbox("0.59,51.76,0.62,51.79")).toEqual({
      west: 0.59,
      south: 51.76,
      east: 0.62,
      north: 51.79,
    });
    expect(() => parseBbox("0.62,51.76,0.59,51.79")).toThrow(/inverted/);
    expect(() => parseBbox("a,b,c,d")).toThrow(/does not parse/);
  });

  it("a way meets a bbox when any point lies inside it", () => {
    const bbox = { west: 0.59, south: 51.76, east: 0.62, north: 51.79 };
    expect(
      wayMeetsBbox(
        [
          [51.7, 0.5],
          [51.77, 0.6],
        ],
        bbox,
      ),
    ).toBe(true);
    expect(wayMeetsBbox([[51.7, 0.5]], bbox)).toBe(false);
  });
});

describe("load-streets — golden checks", () => {
  const birkdaleRow = {
    osmId: 1,
    name: "Birkdale Rise",
    highway: "residential",
    points: [
      [51.7766, 0.6016],
      [51.7771, 0.603],
    ] as [number, number][],
  };
  const exeterRow = {
    osmId: 2,
    name: "Exeter Road",
    highway: "residential",
    points: [
      [51.5154, 0.021],
      [51.515, 0.0209],
    ] as [number, number][],
  };

  it("passes when both golden streets file by their homes", () => {
    expect(goldenChecks([birkdaleRow, exeterRow], () => true)).toEqual([]);
  });

  it("fails plainly when a golden street is missing or far", () => {
    expect(goldenChecks([exeterRow], () => true)[0]).toContain("Birkdale Rise");
    const far = { ...birkdaleRow, points: [[51.9, 0.6]] as [number, number][] };
    expect(goldenChecks([far, exeterRow], () => true)[0]).toContain("within 0.6");
  });

  it("checks only the homes in scope", () => {
    expect(goldenChecks([], (key: string) => key === "exeter")).toEqual([
      expect.stringContaining("Exeter Road"),
    ]);
    expect(goldenChecks([], () => false)).toEqual([]);
  });
});

describe("load-streets — extract verification", () => {
  it("parses Geofabrik's published md5 and compares hashes", () => {
    expect(parsePublishedMd5("d41d8cd98f00b204e9800998ecf8427e  england-latest.osm.pbf\n")).toBe(
      "d41d8cd98f00b204e9800998ecf8427e",
    );
    expect(() => parsePublishedMd5("not a hash")).toThrow(/does not parse/);
    expect(md5Matches("D41D8CD98F00B204E9800998ECF8427E", "d41d8cd98f00b204e9800998ecf8427e")).toBe(
      true,
    );
    expect(md5Matches("aaaa", "bbbb")).toBe(false);
  });

  it("reads the extract's data date from the dated filename", () => {
    expect(
      extractDataDate("https://download.geofabrik.de/europe/united-kingdom/england-261112.osm.pbf"),
    ).toBe("2026-11-12");
    expect(() => extractDataDate("england-latest.osm.pbf")).toThrow(/does not parse/);
  });

  it("the staged floors sit far below the measured yields", () => {
    // Measured on the 2026-11-12 extracts (M8.3): England
    // 4,550,399 filed-class ways, Wales ~494,000 highway
    // ways. A floor anywhere near the yield would refuse
    // ordinary map change; a floor near zero would pass a
    // broken read.
    expect(EXTRACT_FLOORS.england).toBeGreaterThan(1_000_000);
    expect(EXTRACT_FLOORS.england).toBeLessThan(4_550_399);
    expect(EXTRACT_FLOORS.wales).toBeGreaterThan(100_000);
    expect(EXTRACT_FLOORS.wales).toBeLessThan(494_373);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg pool: the staged rows, the live table and the
  // loader_checkpoint row as arrays, with just enough SQL to
  // run the staging and the area cuts. Stage inserts carry
  // the takeSeq seq (7 params a row); live inserts carry
  // none (6 params). WKT is stored as the string insertRows
  // writes and read back as ST_AsText would return it.
  type StageRow = {
    osmId: number;
    name: string | null;
    highway: string;
    wkt: string;
    sourceName: string;
    sourceDate: string;
    seq?: number;
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
  const BIRKDALE = {
    id: 101,
    tags: { highway: "residential", name: "Birkdale Rise" },
    points: [
      [51.7766, 0.6016],
      [51.7771, 0.603],
    ],
  };
  const EXETER = {
    id: 202,
    tags: { highway: "residential", name: "Exeter Road" },
    points: [
      [51.5154, 0.021],
      [51.515, 0.0209],
    ],
  };
  const FILLER_E = {
    id: 103,
    tags: { highway: "tertiary", name: "Hatfield Road" },
    points: [
      [51.78, 0.61],
      [51.781, 0.612],
    ],
  };
  const FILLER_W = {
    id: 204,
    tags: { highway: "unclassified", name: "Heol Fawr" },
    points: [
      [51.52, 0.03],
      [51.521, 0.032],
    ],
  };
  const CONSTRUCTION = {
    id: 105,
    tags: { highway: "construction", name: "Not Yet Street" },
    points: [
      [51.77, 0.6],
      [51.771, 0.601],
    ],
  };
  const UNNAMED = {
    id: 106,
    tags: { highway: "service" },
    points: [
      [51.775, 0.6],
      [51.7755, 0.601],
    ],
  };
  function ndjson(rows: unknown[]): string {
    return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  }
  function createFakePool() {
    let staged: StageRow[] = [];
    let live: StageRow[] = [];
    let stageExists = false;
    const checkpoints = new Map<string, CheckpointRow>();
    let stageInserts = 0;
    let liveInserts = 0;
    let failAfterStageInserts: number | null = null;
    let failAfterLiveInserts: number | null = null;
    let snapshot: {
      staged: StageRow[];
      live: StageRow[];
      stageExists: boolean;
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = {
          staged: [...staged],
          live: [...live],
          stageExists,
          checkpoints: new Map(checkpoints),
        };
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
          stageExists = snapshot.stageExists;
          checkpoints.clear();
          for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS street_lines_stage/.test(text)) {
        stageExists = true;
        return { rows: [] };
      }
      if (/ALTER TABLE street_lines_stage ADD COLUMN IF NOT EXISTS seq/.test(text)) {
        return { rows: [] };
      }
      if (/INSERT INTO street_lines_stage/.test(text)) {
        stageInserts += 1;
        if (failAfterStageInserts !== null && stageInserts > failAfterStageInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        const width = text.includes(", seq)") ? 7 : 6;
        for (let r = 0; r < params.length / width; r++) {
          const b = r * width;
          const osmId = params[b] as number;
          if (staged.some((s) => s.osmId === osmId)) continue; // ON CONFLICT DO NOTHING
          staged.push({
            osmId,
            name: params[b + 1] as string | null,
            highway: params[b + 2] as string,
            wkt: params[b + 3] as string,
            sourceName: params[b + 4] as string,
            sourceDate: params[b + 5] as string,
            seq: width === 7 ? (params[b + 6] as number) : undefined,
          });
        }
        return { rows: [], rowCount: params.length / width };
      }
      if (/INSERT INTO street_lines /.test(text) && !/street_lines_stage/.test(text)) {
        liveInserts += 1;
        if (failAfterLiveInserts !== null && liveInserts > failAfterLiveInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        const width = 6;
        for (let r = 0; r < params.length / width; r++) {
          const b = r * width;
          const row: StageRow = {
            osmId: params[b] as number,
            name: params[b + 1] as string | null,
            highway: params[b + 2] as string,
            wkt: params[b + 3] as string,
            sourceName: params[b + 4] as string,
            sourceDate: params[b + 5] as string,
          };
          const at = live.findIndex((l) => l.osmId === row.osmId);
          if (at >= 0)
            live[at] = row; // ON CONFLICT DO UPDATE
          else live.push(row);
        }
        return { rows: [], rowCount: params.length / width };
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
              s: staged.reduce((a, r) => a + (r.seq ?? 0), 0),
              m: staged.length ? Math.max(...staged.map((r) => r.seq ?? 0)) : 0,
            },
          ],
        };
      }
      if (/DELETE FROM street_lines_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => (r.seq ?? 0) < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM street_lines_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM street_lines_stage/.test(text)) {
        return { rows: [{ n: staged.length }] };
      }
      if (/ST_AsText\(geom\)/.test(text)) {
        const names = params[0] as string[];
        return {
          rows: staged
            .filter((r) => r.name !== null && names.includes(r.name))
            .map((r) => ({ osm_id: r.osmId, name: r.name, highway: r.highway, wkt: r.wkt })),
        };
      }
      if (/TRUNCATE street_lines/.test(text)) {
        live = [];
        return { rows: [] };
      }
      if (
        /INSERT INTO street_lines \(osm_id, name, highway, geom, source_name, source_date, loaded_at\)/.test(
          text,
        )
      ) {
        live = staged.map((r) => ({ ...r }));
        return { rows: [], rowCount: staged.length };
      }
      if (/DROP TABLE street_lines_stage/.test(text)) {
        staged = [];
        stageExists = false;
        return { rows: [] };
      }
      if (/DELETE FROM street_lines\s+WHERE geom/.test(text)) {
        const [west, south, east, north] = params as number[];
        live = live.filter((r) => {
          const points = wktLineToPoints(r.wkt);
          return !points.some(
            ([lat, lon]) => lon >= west && lon <= east && lat >= south && lat <= north,
          );
        });
        return { rows: [] };
      }
      throw new Error(`fake pool: unhandled SQL: ${sql}`);
    };
    const client = { query, release: () => {} };
    return {
      query,
      connect: async () => client,
      staged: () => staged,
      live: () => live,
      liveIds: () => live.map((r) => r.osmId).sort((a, b) => a - b),
      stageExists: () => stageExists,
      checkpoints,
      setFailAfterStageInserts: (n: number | null) => {
        failAfterStageInserts = n;
      },
      setFailAfterLiveInserts: (n: number | null) => {
        failAfterLiveInserts = n;
      },
    };
  }
  type FakePool = ReturnType<typeof createFakePool>;
  function writeCut(dir: string, name: string, rows: unknown[]): string {
    const path = join(dir, name);
    writeFileSync(path, ndjson(rows));
    return path;
  }
  async function runNational(
    fake: FakePool,
    extracts: { country: string; ndjsonPath: string; dataDate: string }[],
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-streets",
      log: (line: string) => captured.push(line),
    });
    const staging = await beginNationalStaging(fake as never, { progress, restart });
    await staging.prepareResume(extractsEdition(extracts, "2026-11-26"));
    const completed = staging.completedCountries();
    const parts: { country: string; rowsFiled: number; candidates: unknown[] }[] = [];
    for (const ex of extracts) {
      if (ex.country in completed) continue;
      const part = await staging.stageCountry(ex.country, ex.ndjsonPath, ex.dataDate);
      parts.push({ country: ex.country, rowsFiled: part.rowsFiled, candidates: part.candidates });
    }
    return { staging, parts, lines: captured };
  }

  it("kill mid-country resumes past the completed country and swaps exactly once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-streets-test-"));
    try {
      const extracts = [
        {
          country: "england",
          ndjsonPath: writeCut(dir, "england.ndjson", [BIRKDALE, FILLER_E, CONSTRUCTION, UNNAMED]),
          dataDate: "2026-11-12",
        },
        {
          country: "wales",
          ndjsonPath: writeCut(dir, "wales.ndjson", [EXETER, FILLER_W]),
          dataDate: "2026-11-12",
        },
      ];
      const fake = createFakePool();
      // Kill on the second country's stage insert: England
      // is checkpointed at its end, Wales never stages.
      const killLines: string[] = [];
      fake.setFailAfterStageInserts(1);
      await expect(runNational(fake, extracts, { lines: killLines })).rejects.toThrow(
        /simulated kill/,
      );
      expect(
        fake
          .staged()
          .map((r) => r.osmId)
          .sort((a, b) => a - b),
      ).toEqual([101, 103, 106]);
      const cp = fake.checkpoints.get("load-streets");
      expect(cp?.next_start_index).toBe(3);
      expect(cp?.state).toMatchObject({ country: "england", perCountry: { england: 3 } });

      fake.setFailAfterStageInserts(null);
      const { staging, parts, lines } = await runNational(fake, extracts);
      // England is skipped outright; only Wales stages.
      expect(parts.map((p) => p.country)).toEqual(["wales"]);
      expect(parts[0].rowsFiled).toBe(2);
      expect(
        lines.some((l) =>
          /resuming from checkpoint · 3 rows staged · edition england@2026-11-12,wales@2026-11-12 · resume from 3/.test(
            l,
          ),
        ),
      ).toBe(true);
      // The staged golden rebuild sees both golden streets.
      const stagedCandidates = await staging.stagedGoldenCandidates();
      expect(stagedCandidates.map((r) => r.name).sort()).toEqual(["Birkdale Rise", "Exeter Road"]);
      expect(goldenChecks(stagedCandidates, () => true)).toEqual([]);
      // A failure at the swap would name the checkpoint the
      // run staged to; the swap itself then clears it.
      expect(staging.resumeNote()).toBe(
        "checkpoint 5 (edition england@2026-11-12,wales@2026-11-12)",
      );
      const filed = await staging.finishStaging();
      expect(filed).toBe(5);
      expect(fake.liveIds()).toEqual([101, 103, 106, 202, 204]);
      expect(fake.stageExists()).toBe(false);
      expect(fake.checkpoints.get("load-streets")).toBeUndefined();
      // NOTE (BUG-368 module gap): finishStaging clears the
      // checkpoint row directly — the swap already dropped
      // the stage table, so the handle's clear() cannot run
      // — and the handle's in-memory note still names the
      // checkpoint after success. The handle dies with the
      // run and no failure line follows, so the stale note
      // is unobservable; it is reported, not asserted.
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("an edition change discards the staged rows and starts from zero", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-streets-test-"));
    try {
      const extracts = [
        {
          country: "england",
          ndjsonPath: writeCut(dir, "england.ndjson", [BIRKDALE, FILLER_E]),
          dataDate: "2026-11-12",
        },
        {
          country: "wales",
          ndjsonPath: writeCut(dir, "wales.ndjson", [EXETER, FILLER_W]),
          dataDate: "2026-11-12",
        },
      ];
      const fake = createFakePool();
      fake.setFailAfterStageInserts(1);
      await expect(runNational(fake, extracts)).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(2);

      const progress = createProgressLogger({ name: "load-streets", log: () => {} });
      const staging = await beginNationalStaging(fake as never, { progress });
      const prep = await staging.prepareResume("england@2026-11-13,wales@2026-11-13");
      expect(prep.resumed).toBe(false);
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-streets")).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-streets-test-"));
    try {
      const extracts = [
        {
          country: "england",
          ndjsonPath: writeCut(dir, "england.ndjson", [BIRKDALE, FILLER_E]),
          dataDate: "2026-11-12",
        },
        {
          country: "wales",
          ndjsonPath: writeCut(dir, "wales.ndjson", [EXETER, FILLER_W]),
          dataDate: "2026-11-12",
        },
      ];
      const fake = createFakePool();
      fake.setFailAfterStageInserts(1);
      await expect(runNational(fake, extracts)).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(2);

      fake.setFailAfterStageInserts(null);
      const { staging, parts } = await runNational(fake, extracts, { restart: true });
      expect(parts.map((p) => p.country)).toEqual(["england", "wales"]);
      const filed = await staging.finishStaging();
      expect(filed).toBe(4);
      expect(fake.liveIds()).toEqual([101, 103, 202, 204]);
      expect(fake.checkpoints.get("load-streets")).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("area cuts: kill mid-area resumes past the filed area", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-streets-test-"));
    try {
      const cutPath = writeCut(dir, "england.ndjson", [BIRKDALE, EXETER, FILLER_E, FILLER_W]);
      const extracts = [{ country: "england", ndjsonPath: cutPath, dataDate: "2026-11-12" }];
      const edition = extractsEdition(extracts, "2026-11-26");
      const bboxes = [parseBbox("0.59,51.76,0.62,51.79"), parseBbox("0.01,51.50,0.03,51.53")];
      const fake = createFakePool();
      // Kill on the second area's live insert: the first
      // area is checkpointed, the second rolls back.
      const killLines: string[] = [];
      const killProgress = createProgressLogger({
        name: "load-streets",
        log: (line: string) => killLines.push(line),
      });
      fake.setFailAfterLiveInserts(1);
      await expect(
        runAreaCuts(fake as never, extracts, bboxes, {
          progress: killProgress,
          retrievedOn: "2026-11-26",
          edition,
        }),
      ).rejects.toThrow(/simulated kill/);
      expect(fake.liveIds()).toEqual([101, 103]);
      const cp = fake.checkpoints.get("load-streets-areas");
      expect(cp?.next_start_index).toBe(1);
      expect(
        killLines.some((l) => /checkpoint 1\/2 areas \(50%\) · filed 2 · resume from 1/.test(l)),
      ).toBe(true);

      fake.setFailAfterLiveInserts(null);
      const lines: string[] = [];
      const progress = createProgressLogger({
        name: "load-streets",
        log: (line: string) => lines.push(line),
      });
      const result = await runAreaCuts(fake as never, extracts, bboxes, {
        progress,
        retrievedOn: "2026-11-26",
        edition,
      });
      expect(result.areasDone).toBe(2);
      expect(result.areasFiled).toBe(4);
      expect(
        lines.some((l) => /resuming from checkpoint · 2 rows filed in 1 areas · edition /.test(l)),
      ).toBe(true);
      // Both areas filed, each way exactly once.
      expect(fake.liveIds()).toEqual([101, 103, 202, 204]);
      expect(fake.checkpoints.get("load-streets-areas")).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("area cuts: an edition change discards the checkpoint and starts from the first area", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-streets-test-"));
    try {
      const cutPath = writeCut(dir, "england.ndjson", [BIRKDALE, EXETER]);
      const extracts = [{ country: "england", ndjsonPath: cutPath, dataDate: "2026-11-12" }];
      const edition = extractsEdition(extracts, "2026-11-26");
      const bboxes = [parseBbox("0.59,51.76,0.62,51.79"), parseBbox("0.01,51.50,0.03,51.53")];
      const fake = createFakePool();
      fake.setFailAfterLiveInserts(1);
      await expect(
        runAreaCuts(fake as never, extracts, bboxes, {
          progress: createProgressLogger({ name: "load-streets", log: () => {} }),
          retrievedOn: "2026-11-26",
          edition,
        }),
      ).rejects.toThrow(/simulated kill/);
      expect(fake.checkpoints.get("load-streets-areas")?.next_start_index).toBe(1);

      fake.setFailAfterLiveInserts(null);
      const lines: string[] = [];
      const progress = createProgressLogger({
        name: "load-streets",
        log: (line: string) => lines.push(line),
      });
      const result = await runAreaCuts(fake as never, extracts, bboxes, {
        progress,
        retrievedOn: "2026-11-26",
        edition: "england@2026-11-13",
      });
      expect(result.areasDone).toBe(2);
      expect(
        lines.some((l) =>
          /discarding stale checkpoint · edition changed \(england@2026-11-12 → england@2026-11-13\)/.test(
            l,
          ),
        ),
      ).toBe(true);
      expect(fake.liveIds()).toEqual([101, 202]);
      expect(fake.checkpoints.get("load-streets-areas")).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("wktLineToPoints round-trips the staged WKT, and the edition/note helpers read plainly", () => {
    expect(wktLineToPoints("LINESTRING(0.6016 51.7766, 0.603 51.7771)")).toEqual([
      [51.7766, 0.6016],
      [51.7771, 0.603],
    ]);
    expect(wktLineToPoints("LINESTRING()")).toEqual([]);
    expect(
      extractsEdition(
        [
          { country: "england", dataDate: "2026-11-12" },
          { country: "wales", dataDate: null },
        ],
        "2026-11-26",
      ),
    ).toBe("england@2026-11-12,wales@2026-11-26");
    expect(areaResumeNote(null, "england@2026-11-12")).toBe("the start (no area filed yet)");
    expect(areaResumeNote({ next_start_index: 1 }, "england@2026-11-12")).toBe(
      "checkpoint 1 (edition england@2026-11-12)",
    );
  });
});
