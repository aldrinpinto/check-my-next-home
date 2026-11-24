import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createBroadbandFiler,
  createCsvParser,
  csvRecords,
  fileBroadband,
  parsePostcodeCsv,
  streamBroadbandRows,
  structuralCheckStats,
} from "../loaders/load-broadband.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// BUG-191: the broadband loader used to parse the whole Ofcom
// release (~1.74M rows) into one in-memory array and merge it
// inside a single transaction — 7+ hours open on the first
// national filing, queueing other loaders' stamps behind its
// locks. These tests pin the streamed shape that replaced it:
// the incremental CSV parser against the one-shot generator at
// every chunk boundary; streamed staging byte-identical to the
// current (collecting) path on the existing fixtures; and the
// filer's failure semantics against a stateful fake — a
// mid-merge failure leaves every postcode holding a whole old
// or whole new answer, the stale-key sweep never fires on a
// partial merge, and a re-run completes the merge cleanly.

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/broadband");
const FIXTURE_FILES = [
  "202601_fixed_pc_coverage/postcode_files_r2/202601_fixed_pc_coverage_r2_CM.csv",
  "202601_fixed_pc_coverage/postcode_files_r2/202601_fixed_pc_coverage_r2_E.csv",
  "202601_fixed_pc_coverage/postcode_files_r2/202601_fixed_pc_coverage_r2_KT.csv",
];

type StageRow = { answer: Record<string, unknown>; merged: boolean };
type CacheAnswers = Record<string, unknown>;

// A fake pg client that interprets the filer's statements
// against in-memory stage / cache tables, with real transaction
// semantics (BEGIN snapshots, ROLLBACK restores, COMMIT keeps)
// and an injectable failure on the Nth merge statement.
function createFakeClient() {
  let stage: Map<string, StageRow> | null = null;
  let cache = new Map<string, CacheAnswers>();
  let snapshot: { stage: Map<string, StageRow> | null; cache: Map<string, CacheAnswers> } | null =
    null;
  const statements: string[] = [];
  let mergeCalls = 0;
  let failMergeAtCall = -1;
  const clone = <T>(v: T): T => structuredClone(v);
  // Snapshots are shallow Map copies: the fake never mutates a
  // stored row or answers object in place (merges and sweeps
  // replace them), so a shallow copy is a faithful snapshot.

  const client = {
    statements,
    seedCache(postcode: string, answers: CacheAnswers) {
      cache.set(postcode, clone(answers));
    },
    cacheAnswers(postcode: string) {
      return cache.get(postcode);
    },
    cachePostcodes() {
      return [...cache.keys()];
    },
    failOnMergeCall(n: number) {
      failMergeAtCall = n;
    },
    async query(sql: string, params: unknown[] = []) {
      statements.push(sql);
      if (sql === "BEGIN") {
        snapshot = {
          stage: stage === null ? null : new Map(stage),
          cache: new Map(cache),
        };
        return { rows: [], rowCount: 0 };
      }
      if (sql === "COMMIT") {
        snapshot = null;
        return { rows: [], rowCount: 0 };
      }
      if (sql === "ROLLBACK") {
        if (snapshot) {
          stage = snapshot.stage;
          cache = snapshot.cache;
          snapshot = null;
        }
        return { rows: [], rowCount: 0 };
      }
      if (/DROP TABLE IF EXISTS broadband_stage/.test(sql)) {
        stage = null;
        return { rows: [], rowCount: 0 };
      }
      if (/CREATE TEMP TABLE broadband_stage/.test(sql)) {
        stage = new Map();
        return { rows: [], rowCount: 0 };
      }
      if (/INSERT INTO broadband_stage/.test(sql)) {
        let inserted = 0;
        for (let j = 0; j < params.length; j += 2) {
          const postcode = params[j] as string;
          if (stage && !stage.has(postcode)) {
            stage.set(postcode, {
              answer: JSON.parse(params[j + 1] as string) as Record<string, unknown>,
              merged: false,
            });
            inserted += 1;
          }
        }
        return { rows: [], rowCount: inserted };
      }
      if (/WITH batch AS/.test(sql)) {
        mergeCalls += 1;
        if (mergeCalls === failMergeAtCall) {
          throw new Error("simulated mid-merge failure");
        }
        const limit = params[0] as number;
        const batch = [...(stage?.entries() ?? [])]
          .filter(([, row]) => !row.merged)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .slice(0, limit);
        let updated = 0;
        for (const [postcode, row] of batch) {
          stage?.set(postcode, { ...row, merged: true });
          const answers = cache.get(postcode);
          if (answers) {
            cache.set(postcode, { ...answers, broadband: clone(row.answer) });
            updated += 1;
          }
        }
        return { rows: [], rowCount: updated };
      }
      if (/SELECT count\(\*\)::int AS n FROM postcode_cache/.test(sql)) {
        // BUG-204: the sweep's up-front COUNT — one scan
        // beside the ~346 the sweep itself performs.
        const n = [...cache.values()].filter((answers) => "broadband" in answers).length;
        return { rows: [{ n }], rowCount: 1 };
      }
      if (/SELECT postcode FROM postcode_cache/.test(sql)) {
        const cursor = params[0] as string;
        const limit = params[1] as number;
        const rows = [...cache.entries()]
          .filter(([pc, answers]) => "broadband" in answers && pc > cursor)
          .map(([pc]) => pc)
          .sort()
          .slice(0, limit)
          .map((postcode) => ({ postcode }));
        return { rows, rowCount: rows.length };
      }
      if (/answers - 'broadband'/.test(sql)) {
        let n = 0;
        for (const postcode of params[0] as string[]) {
          const answers = cache.get(postcode);
          if (answers && "broadband" in answers && !(stage && stage.has(postcode))) {
            const next = { ...answers };
            delete next.broadband;
            cache.set(postcode, next);
            n += 1;
          }
        }
        return { rows: [], rowCount: n };
      }
      throw new Error(`fake client: unhandled statement: ${sql.slice(0, 80)}`);
    },
  };
  return client;
}

// A recording client: captures the staged (postcode, answer
// JSON) pairs exactly as the filer sends them; everything else
// is a benign no-op with truthful insert counts.
function createRecordingClient() {
  const staged = new Map<string, string>();
  return {
    staged,
    async query(sql: string, params: unknown[] = []) {
      if (/INSERT INTO broadband_stage/.test(sql)) {
        let inserted = 0;
        for (let j = 0; j < params.length; j += 2) {
          const postcode = params[j] as string;
          if (!staged.has(postcode)) {
            staged.set(postcode, params[j + 1] as string);
            inserted += 1;
          }
        }
        return { rows: [], rowCount: inserted };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

describe("the incremental CSV parser (BUG-191)", () => {
  const TRICKY =
    "﻿postcode,notes\r\n" +
    '"AB1 2CD","a, b"\n' +
    '"CD3 4EF","say ""hi""\nthen"\r\n' +
    '"EF5 6GH",plain';
  const expected = [...csvRecords(TRICKY)];

  it("parses the tricky text whole", () => {
    expect(expected).toEqual([
      ["postcode", "notes"],
      ["AB1 2CD", "a, b"],
      ["CD3 4EF", 'say "hi"\nthen'],
      ["EF5 6GH", "plain"],
    ]);
  });

  it("agrees with the one-shot generator at every two-push split", () => {
    for (let split = 0; split <= TRICKY.length; split++) {
      const parser = createCsvParser();
      const records = [
        ...parser.push(TRICKY.slice(0, split)),
        ...parser.push(TRICKY.slice(split)),
        ...parser.finish(),
      ];
      expect(records).toEqual(expected);
    }
  });
});

describe("streamed staging (BUG-191)", () => {
  it("stages byte-identical answers to the current path on the existing fixtures", async () => {
    const release = JSON.parse(await readFile(join(FIXTURE_DIR, "release.json"), "utf8")) as never;
    // The current path: whole-file texts through parsePostcodeCsv,
    // filed through fileBroadband.
    const currentRows: { postcode: string; answer: Record<string, unknown> }[] = [];
    for (const rel of FIXTURE_FILES) {
      const text = await readFile(join(FIXTURE_DIR, rel), "utf8");
      currentRows.push(...(parsePostcodeCsv(text, release) as typeof currentRows));
    }
    const fakeA = createRecordingClient();
    await fileBroadband(fakeA as never, currentRows as never);

    // The streamed path: the fixture directory through
    // streamBroadbandRows into a filer's staging.
    const fakeB = createRecordingClient();
    const filer = await createBroadbandFiler(fakeB as never);
    const { stats } = (await streamBroadbandRows(
      { fileDir: FIXTURE_DIR } as never,
      (batch: { postcode: string; answer: Record<string, unknown> }[]) =>
        filer.stageItems(batch as never),
    )) as { stats: { parsed: number; goldensSeen: Set<string> } };
    await filer.finishFiling();

    expect(stats.parsed).toBe(6);
    expect([...stats.goldensSeen].sort()).toEqual(["CM3 2JT", "E16 1GN", "KT17 1FH"]);
    expect(fakeB.staged.size).toBe(6);
    expect(Object.fromEntries(fakeB.staged)).toEqual(Object.fromEntries(fakeA.staged));
  });

  it("counts duplicates from staging: offered minus staged", async () => {
    const fake = createRecordingClient();
    const filer = await createBroadbandFiler(fake as never);
    const row = { postcode: "CM3 2JT", answer: { snapshot: "2026-01" } };
    await filer.stageItems([
      row,
      row,
      { postcode: "E16 1GN", answer: { snapshot: "2026-01" } },
    ] as never);
    await filer.finishFiling();
    expect(filer.offeredCount()).toBe(3);
    expect(filer.stagedCount()).toBe(2);
    expect(() =>
      structuralCheckStats(
        {
          parsed: 3,
          duplicates: filer.offeredCount() - filer.stagedCount(),
          goldensSeen: new Set(["CM3 2JT", "E16 1GN", "KT17 1FH"]),
        },
        { full: false },
      ),
    ).toThrow(/duplicate postcodes in the release/);
  });

  it("checks the way run() does: flush, then staged count, before finishFiling (CI #320)", async () => {
    // run() reads stagedCount() for the structural check after
    // streaming and BEFORE finishFiling. stagedCount() only
    // advances on a flush, and stageItems flushes only at
    // STAGE_CHUNK — so without the flush run() now performs, the
    // pending tail (here the whole 6-row fixture) reads as that
    // many duplicate postcodes and the check throws on a clean
    // release. This is the composition the CI fixture pass runs.
    const fake = createRecordingClient();
    const filer = await createBroadbandFiler(fake as never);
    const { stats } = (await streamBroadbandRows(
      { fileDir: FIXTURE_DIR } as never,
      (batch: { postcode: string; answer: Record<string, unknown> }[]) =>
        filer.stageItems(batch as never),
    )) as { stats: { parsed: number; goldensSeen: Set<string> } };
    expect(filer.stagedCount()).toBe(0);
    await filer.flushPending();
    expect(filer.stagedCount()).toBe(6);
    expect(() =>
      structuralCheckStats(
        {
          parsed: stats.parsed,
          duplicates: stats.parsed - filer.stagedCount(),
          goldensSeen: stats.goldensSeen,
        },
        { full: false },
      ),
    ).not.toThrow();
    await filer.finishFiling();
  });

  it("still refuses a genuine duplicate at the run() composition, after the flush", async () => {
    const fake = createRecordingClient();
    const filer = await createBroadbandFiler(fake as never);
    const row = { postcode: "CM3 2JT", answer: { snapshot: "2026-01" } };
    await filer.stageItems([
      row,
      row,
      { postcode: "E16 1GN", answer: { snapshot: "2026-01" } },
      { postcode: "KT17 1FH", answer: { snapshot: "2026-01" } },
    ] as never);
    await filer.flushPending();
    expect(filer.stagedCount()).toBe(3);
    expect(() =>
      structuralCheckStats(
        {
          parsed: 4,
          duplicates: 4 - filer.stagedCount(),
          goldensSeen: new Set(["CM3 2JT", "E16 1GN", "KT17 1FH"]),
        },
        { full: false },
      ),
    ).toThrow(/duplicate postcodes in the release/);
  });
});

// 12,000 synthetic rows — enough to span several merge chunks
// (MERGE_CHUNK is 5,000) and staging transactions (500 each).
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const syntheticPostcode = (i: number) =>
  `A${LETTERS[i % 26]}1 ${Math.floor(i / 17576) % 10}${LETTERS[Math.floor(i / 676) % 26]}${LETTERS[Math.floor(i / 26) % 26]}`;
const syntheticRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    postcode: syntheticPostcode(i),
    answer: { snapshot: "2026-01", gigabit_capable_pct: i % 101 },
  }));
const OLD_ANSWER = { snapshot: "2025-01", gigabit_capable_pct: 111 };

describe("progress lines (BUG-204)", () => {
  it(
    "emits merge and sweep lines while filing, and the filed outcome is unchanged",
    { timeout: 30_000 },
    async () => {
      const rows = syntheticRows(12_000);
      const fake = createFakeClient();
      // seedOldCache is scoped to the failure-semantics block,
      // so the seed is repeated here: every row plus one stale
      // postcode the release does not cover.
      for (const row of rows)
        fake.seedCache(row.postcode, { broadband: { ...OLD_ANSWER }, other: 1 });
      fake.seedCache("ZZ9 9ZZ", { broadband: { ...OLD_ANSWER } });

      const lines: string[] = [];
      const progress = createProgressLogger({
        name: "load-broadband",
        log: (line: string) => lines.push(line),
      });
      const updated = await fileBroadband(fake as never, rows as never, { progress });

      expect(updated).toBe(12_000);
      expect(fake.cacheAnswers("ZZ9 9ZZ")?.broadband).toBeUndefined();
      expect(fake.cacheAnswers(rows[0].postcode)?.other).toBe(1);
      // The sweep's up-front COUNT was issued once.
      expect(fake.statements.filter((s) => /count\(\*\)::int AS n/.test(s)).length).toBe(1);
      // The merge's closing line (3 chunks of 5,000) and the
      // sweep's opening line with its real batch count.
      expect(lines.some((l) => /progress · merge 3\/3 chunks \(100%\)/.test(l))).toBe(true);
      expect(
        lines.some((l) =>
          /progress · sweep started — 12,001 postcodes carry the broadband key \(3 batches of 5,000\)/.test(
            l,
          ),
        ),
      ).toBe(true);
      expect(
        lines.some((l) => /progress · sweep 3\/3 batches \(100%\) · 1 stale key removed/.test(l)),
      ).toBe(true);
      // No progress line can be mistaken for the summary line:
      // none starts with the loader name.
      expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
    },
  );

  it(
    "reads '2 stale keys removed' when the sweep removes two (BUG-227)",
    { timeout: 30_000 },
    async () => {
      const rows = syntheticRows(12_000);
      const fake = createFakeClient();
      for (const row of rows)
        fake.seedCache(row.postcode, { broadband: { ...OLD_ANSWER }, other: 1 });
      fake.seedCache("ZZ9 9ZZ", { broadband: { ...OLD_ANSWER } });
      fake.seedCache("ZZ9 9ZY", { broadband: { ...OLD_ANSWER } });

      const lines: string[] = [];
      const progress = createProgressLogger({
        name: "load-broadband",
        log: (line: string) => lines.push(line),
      });
      const updated = await fileBroadband(fake as never, rows as never, { progress });

      expect(updated).toBe(12_000);
      expect(fake.cacheAnswers("ZZ9 9ZZ")?.broadband).toBeUndefined();
      expect(fake.cacheAnswers("ZZ9 9ZY")?.broadband).toBeUndefined();
      expect(
        lines.some((l) => /progress · sweep 3\/3 batches \(100%\) · 2 stale keys removed/.test(l)),
      ).toBe(true);
    },
  );
});

describe("the filer's failure semantics (BUG-191)", () => {
  const seedOldCache = (
    fake: ReturnType<typeof createFakeClient>,
    rows: { postcode: string }[],
  ) => {
    for (const row of rows)
      fake.seedCache(row.postcode, { broadband: { ...OLD_ANSWER }, other: 1 });
    fake.seedCache("ZZ9 9ZZ", { broadband: { ...OLD_ANSWER } });
  };
  const generations = (fake: ReturnType<typeof createFakeClient>, rows: { postcode: string }[]) => {
    let newCount = 0;
    let oldCount = 0;
    for (const row of rows) {
      const answer = fake.cacheAnswers(row.postcode)?.broadband as
        { snapshot: string; gigabit_capable_pct: number } | undefined;
      // A postcode holds a WHOLE generation: the snapshot and the
      // figure always move together, never a mix.
      if (answer?.snapshot === "2026-01" && answer.gigabit_capable_pct !== 111) newCount += 1;
      else if (answer?.snapshot === "2025-01" && answer.gigabit_capable_pct === 111) oldCount += 1;
      else throw new Error(`mixed or missing answer at ${row.postcode}`);
    }
    return { newCount, oldCount };
  };

  it(
    "a mid-merge failure leaves the table consistent, the sweep unfired, and a re-run completes",
    { timeout: 30_000 },
    async () => {
      const rows = syntheticRows(12_000);
      const fake = createFakeClient();
      seedOldCache(fake, rows);
      fake.failOnMergeCall(2);

      await expect(fileBroadband(fake as never, rows as never)).rejects.toThrow(
        /simulated mid-merge failure/,
      );

      // One chunk (5,000 postcodes) merged and committed; the rest
      // still hold their whole old answers; nothing is mixed.
      expect(generations(fake, rows)).toEqual({ newCount: 5000, oldCount: 7000 });
      // The stale-key sweep never fired on the partial merge.
      expect(fake.cacheAnswers("ZZ9 9ZZ")?.broadband).toEqual(OLD_ANSWER);
      expect(fake.statements.some((s) => /answers - 'broadband'/.test(s))).toBe(false);

      // A re-run completes the merge cleanly and only then sweeps.
      fake.failOnMergeCall(-1);
      const updated = await fileBroadband(fake as never, rows as never);
      expect(updated).toBe(12_000);
      expect(generations(fake, rows)).toEqual({ newCount: 12_000, oldCount: 0 });
      expect(fake.cacheAnswers("ZZ9 9ZZ")?.broadband).toBeUndefined();
      // The other answer keys are untouched throughout.
      expect(fake.cacheAnswers(rows[0].postcode)?.other).toBe(1);
    },
  );

  it(
    "the stale sweep fires only after the last merge chunk, in bounded transactions",
    { timeout: 30_000 },
    async () => {
      const rows = syntheticRows(12_000);
      const fake = createFakeClient();
      seedOldCache(fake, rows);
      await fileBroadband(fake as never, rows as never);

      const mergeAt = fake.statements
        .map((s, i) => (/WITH batch AS/.test(s) ? i : -1))
        .filter((i) => i >= 0);
      const sweepAt = fake.statements.findIndex((s) => /answers - 'broadband'/.test(s));
      expect(mergeAt.length).toBe(3);
      expect(sweepAt).toBeGreaterThan(mergeAt[mergeAt.length - 1]);

      // Bounded transactions: BEGINs and COMMITs pair up, and no
      // transaction carries more than two statements (the stage
      // creation's DROP + CREATE is the fullest).
      const begins = fake.statements.filter((s) => s === "BEGIN").length;
      const commits = fake.statements.filter((s) => s === "COMMIT").length;
      expect(begins).toBe(commits);
      expect(begins).toBeGreaterThanOrEqual(24 + 1 + 3 + 1);
      let inTxn = 0;
      let maxInTxn = 0;
      for (const s of fake.statements) {
        if (s === "BEGIN") inTxn = 0;
        else if (s === "COMMIT") maxInTxn = Math.max(maxInTxn, inTxn);
        else inTxn += 1;
      }
      expect(maxInTxn).toBeLessThanOrEqual(2);
    },
  );
});
