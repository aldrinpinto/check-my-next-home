import { describe, expect, it } from "vitest";
import { createProgressLogger } from "../loaders/progress.mjs";
import { createLoaderResume, validateCheckpoint } from "../loaders/loader-resume.mjs";

// Resume support for the non-flood loaders (BUG-368), tested
// against a stateful in-memory stand-in for Postgres — the
// checkpoint table and one staging table as arrays, with just
// enough SQL understood for the resume flow. It lets the test
// stage partway, kill the run, resume it and clear the staging
// without a database server (the real-SQL proof is the
// local-db-spike rehearsal, run before the push).

type CheckpointRow = {
  loader: string;
  edition: string;
  expected: number | null;
  next_start_index: number;
  read_count: number;
  filed_count: number;
  state: Record<string, unknown>;
};

function createFakeClient() {
  let stage: number[] = [];
  const checkpoints = new Map<string, CheckpointRow>();
  const statements: string[] = [];
  return {
    statements,
    stageRows: () => [...stage],
    checkpoint: (loader: string) => checkpoints.get(loader),
    seedStage(seqs: number[]) {
      stage = [...seqs];
    },
    seedCheckpoint(row: CheckpointRow) {
      checkpoints.set(row.loader, { ...row });
    },
    async query(sql: string, params: unknown[] = []) {
      statements.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK")
        return { rows: [], rowCount: 0 };
      if (/FROM loader_checkpoint WHERE loader =/.test(sql) && sql.trim().startsWith("SELECT")) {
        const row = checkpoints.get(params[0] as string);
        return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
      }
      if (/INSERT INTO loader_checkpoint/.test(sql)) {
        checkpoints.set(params[0] as string, {
          loader: params[0] as string,
          edition: params[1] as string,
          expected: params[2] as number | null,
          next_start_index: params[3] as number,
          read_count: params[4] as number,
          filed_count: params[5] as number,
          state: JSON.parse(params[6] as string) as Record<string, unknown>,
        });
        return { rows: [], rowCount: 1 };
      }
      if (/DELETE FROM loader_checkpoint WHERE loader =/.test(sql)) {
        const had = checkpoints.delete(params[0] as string);
        return { rows: [], rowCount: had ? 1 : 0 };
      }
      if (/SELECT count\(\*\)::int AS n, coalesce\(sum\(seq\)/.test(sql)) {
        return {
          rows: [{ n: stage.length, s: stage.reduce((a, b) => a + b, 0) }],
          rowCount: 1,
        };
      }
      if (/DELETE FROM \w+ WHERE seq >=/.test(sql)) {
        const before = stage.length;
        stage = stage.filter((seq) => seq < (params[0] as number));
        return { rows: [], rowCount: before - stage.length };
      }
      if (/DELETE FROM \w+/.test(sql)) {
        const n = stage.length;
        stage = [];
        return { rows: [], rowCount: n };
      }
      throw new Error(`fake client: unhandled statement: ${sql.slice(0, 80)}`);
    },
  };
}

const LOADER = "load-test";
const EDITION = "2026-01";

describe("validateCheckpoint (the resume contract)", () => {
  const staged = { count: 1_000, sum: (1_000 * 999) / 2 };
  const checkpoint = {
    loader: LOADER,
    edition: EDITION,
    expected: 2_000,
    next_start_index: 1_000,
    read_count: 1_000,
    filed_count: 1_000,
    state: {},
  };

  it("trusts a checkpoint for the same edition, count and contiguous prefix", () => {
    expect(
      validateCheckpoint({ checkpoint, edition: EDITION, expected: 2_000, staged }).resumed,
    ).toBe(true);
  });

  it("trusts a checkpoint when the staged prefix runs past it (the interrupted chunk)", () => {
    const past = { count: 1_200, sum: (1_200 * 1_199) / 2 };
    expect(
      validateCheckpoint({ checkpoint, edition: EDITION, expected: 2_000, staged: past }).resumed,
    ).toBe(true);
  });

  it("refuses a checkpoint from another edition", () => {
    const check = validateCheckpoint({
      checkpoint,
      edition: "2026-02",
      expected: 2_000,
      staged,
    });
    expect(check.resumed).toBe(false);
    expect(check.reason).toMatch(/edition changed/);
  });

  it("refuses a checkpoint when the expected count moved", () => {
    const check = validateCheckpoint({
      checkpoint,
      edition: EDITION,
      expected: 2_100,
      staged,
    });
    expect(check.resumed).toBe(false);
    expect(check.reason).toMatch(/expected count changed/);
  });

  it("skips the expected-count check when the total is unknown", () => {
    expect(
      validateCheckpoint({ checkpoint, edition: EDITION, expected: null, staged }).resumed,
    ).toBe(true);
  });

  it("refuses staged rows with a gap in their seqs", () => {
    const gapped = { count: 1_000, sum: (1_000 * 999) / 2 + 7 };
    const check = validateCheckpoint({
      checkpoint,
      edition: EDITION,
      expected: 2_000,
      staged: gapped,
    });
    expect(check.resumed).toBe(false);
    expect(check.reason).toMatch(/not contiguous/);
  });

  it("refuses staged rows short of the checkpoint", () => {
    const short = { count: 900, sum: (900 * 899) / 2 };
    const check = validateCheckpoint({
      checkpoint,
      edition: EDITION,
      expected: 2_000,
      staged: short,
    });
    expect(check.resumed).toBe(false);
    expect(check.reason).toMatch(/checkpoint says 1,000/);
  });

  it("refuses a resume point outside the read", () => {
    const pastEnd = { ...checkpoint, next_start_index: 2_001 };
    const check = validateCheckpoint({
      checkpoint: pastEnd,
      edition: EDITION,
      expected: 2_000,
      staged,
    });
    expect(check.resumed).toBe(false);
    expect(check.reason).toMatch(/outside 0/);
  });

  it("proves a 1-based identity prefix with seqBase 1", () => {
    const staged1 = { count: 1_000, sum: (1_000 * 1_001) / 2 };
    expect(
      validateCheckpoint({
        checkpoint,
        edition: EDITION,
        expected: 2_000,
        staged: staged1,
        seqBase: 1,
      }).resumed,
    ).toBe(true);
    const gapped1 = { count: 1_000, sum: (1_000 * 1_001) / 2 + 7 };
    expect(
      validateCheckpoint({
        checkpoint,
        edition: EDITION,
        expected: 2_000,
        staged: gapped1,
        seqBase: 1,
      }).resumed,
    ).toBe(false);
  });
});

describe("createLoaderResume (the per-run handle)", () => {
  it("starts from zero with no checkpoint, clearing stale staging", async () => {
    const fake = createFakeClient();
    fake.seedStage([0, 1, 2]);
    const resume = createLoaderResume(fake as never, {
      loader: LOADER,
      stageTable: "test_stage",
    });
    const prep = await resume.prepare({ edition: EDITION, expected: 2_000 });
    expect(prep.resumed).toBe(false);
    expect(fake.stageRows()).toHaveLength(0);
    expect(resume.resumeNote()).toBe("the start (nothing staged yet)");
  });

  it("resumes from a checkpoint, seeds takeSeq, and trims the tail past it", async () => {
    const fake = createFakeClient();
    // 1,200 staged rows (seqs 0..1,199): the checkpoint covers
    // 1,000 and the last 200 are the interrupted chunk's.
    fake.seedStage(Array.from({ length: 1_200 }, (_, i) => i));
    fake.seedCheckpoint({
      loader: LOADER,
      edition: EDITION,
      expected: 2_000,
      next_start_index: 1_000,
      read_count: 1_000,
      filed_count: 1_000,
      state: {},
    });
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-test",
      log: (line: string) => lines.push(line),
    });
    const resume = createLoaderResume(fake as never, {
      loader: LOADER,
      stageTable: "test_stage",
      progress,
    });
    const prep = await resume.prepare({ edition: EDITION, expected: 2_000 });
    expect(prep.resumed).toBe(true);
    expect(fake.stageRows()).toHaveLength(1_000);
    expect(resume.takeSeq(5)).toBe(1_000);
    expect(resume.takeSeq(5)).toBe(1_005);
    expect(resume.resumeNote()).toBe("checkpoint 1,000 (edition 2026-01)");
    expect(lines.some((l) => /trimmed 200 staged rows past the checkpoint/.test(l))).toBe(true);
    expect(lines.some((l) => /resuming from checkpoint · 1,000 rows staged/.test(l))).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("discards a stale checkpoint and its staging, with a reason", async () => {
    const fake = createFakeClient();
    fake.seedStage(Array.from({ length: 500 }, (_, i) => i));
    fake.seedCheckpoint({
      loader: LOADER,
      edition: "2025-01",
      expected: 2_000,
      next_start_index: 500,
      read_count: 500,
      filed_count: 500,
      state: {},
    });
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-test",
      log: (line: string) => lines.push(line),
    });
    const resume = createLoaderResume(fake as never, {
      loader: LOADER,
      stageTable: "test_stage",
      progress,
    });
    const prep = await resume.prepare({ edition: EDITION, expected: 2_000 });
    expect(prep.resumed).toBe(false);
    expect(prep.reason).toMatch(/edition changed/);
    expect(fake.stageRows()).toHaveLength(0);
    expect(fake.checkpoint(LOADER)).toBeUndefined();
    expect(lines.some((l) => /discarding stale checkpoint · edition changed/.test(l))).toBe(true);
  });

  it("--restart discards a valid checkpoint and starts from zero", async () => {
    const fake = createFakeClient();
    fake.seedStage(Array.from({ length: 500 }, (_, i) => i));
    fake.seedCheckpoint({
      loader: LOADER,
      edition: EDITION,
      expected: 2_000,
      next_start_index: 500,
      read_count: 500,
      filed_count: 500,
      state: {},
    });
    const resume = createLoaderResume(fake as never, {
      loader: LOADER,
      stageTable: "test_stage",
      restart: true,
    });
    const prep = await resume.prepare({ edition: EDITION, expected: 2_000 });
    expect(prep.resumed).toBe(false);
    expect(prep.reason).toBe("restart requested");
    expect(fake.stageRows()).toHaveLength(0);
    expect(fake.checkpoint(LOADER)).toBeUndefined();
  });

  it("writes one checkpoint line per chunk and clears staging + checkpoint together", async () => {
    const fake = createFakeClient();
    fake.seedStage(Array.from({ length: 500 }, (_, i) => i));
    fake.seedCheckpoint({
      loader: LOADER,
      edition: EDITION,
      expected: 2_000,
      next_start_index: 500,
      read_count: 500,
      filed_count: 500,
      state: {},
    });
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-test",
      log: (line: string) => lines.push(line),
    });
    const resume = createLoaderResume(fake as never, {
      loader: LOADER,
      stageTable: "test_stage",
      progress,
    });
    await resume.prepare({ edition: EDITION, expected: 2_000 });
    await resume.checkpoint({
      edition: EDITION,
      expected: 2_000,
      nextStartIndex: 1_000,
      read: 1_000,
      filed: 1_000,
      state: { phase: "parse" },
      unit: "rows",
    });
    expect(fake.checkpoint(LOADER)?.filed_count).toBe(1_000);
    expect(fake.checkpoint(LOADER)?.state).toEqual({ phase: "parse" });
    expect(
      lines.some((l) =>
        /checkpoint 1,000\/2,000 rows \(50%\) · staged 1,000 · resume from 1,000/.test(l),
      ),
    ).toBe(true);
    expect(resume.resumeNote()).toBe("checkpoint 1,000 (edition 2026-01)");
    await resume.clear();
    expect(fake.stageRows()).toHaveLength(0);
    expect(fake.checkpoint(LOADER)).toBeUndefined();
    expect(lines.some((l) => /staging cleared · checkpoint removed/.test(l))).toBe(true);
  });

  it("names the swap in the resume note once the read is fully checkpointed", async () => {
    const fake = createFakeClient();
    fake.seedStage(Array.from({ length: 2_000 }, (_, i) => i));
    fake.seedCheckpoint({
      loader: LOADER,
      edition: EDITION,
      expected: 2_000,
      next_start_index: 2_000,
      read_count: 2_000,
      filed_count: 2_000,
      state: {},
    });
    const resume = createLoaderResume(fake as never, {
      loader: LOADER,
      stageTable: "test_stage",
    });
    await resume.prepare({ edition: EDITION, expected: 2_000 });
    expect(resume.resumeNote()).toMatch(/^the swap — the staged read stands checkpointed/);
  });
});
