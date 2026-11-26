import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GOLDEN,
  buildRows,
  fileAirGrid,
  goldenChecks,
  parsePcmCsv,
} from "../loaders/load-air-quality.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Air quality loader (plan step M5.9), tested against the fixture in
// tests/fixtures/air — the three golden 1 km squares verbatim from
// Defra's PCM 2024 CSVs (see the fixture README).

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/air");
const text = (name: string) => readFileSync(join(FIXTURE_DIR, name), "utf8");

function fixtureRows() {
  return buildRows(
    {
      no2: parsePcmCsv(text("mapno22024.csv"), "no2", 2024),
      pm25: parsePcmCsv(text("mappm252024g.csv"), "pm25", 2024),
      pm10: parsePcmCsv(text("mappm102024g.csv"), "pm10", 2024),
    },
    2024,
  );
}

describe("the fixture load", () => {
  it("joins the three pollutant files into the golden squares, full precision", () => {
    const rows = fixtureRows() as {
      gridRef: string;
      no2: number;
      pm25: number;
      pm10: number;
    }[];
    expect(rows).toHaveLength(3);
    for (const [gridRef, g] of Object.entries(GOLDEN)) {
      const row = rows.find((r) => r.gridRef === gridRef);
      expect(row, gridRef).toBeDefined();
      expect([row?.no2, row?.pm25, row?.pm10]).toEqual([g.no2, g.pm25, g.pm10]);
    }
    expect(() => goldenChecks(rows, { full: false })).not.toThrow();
  });

  it("files the square centres converted from EPSG:27700", () => {
    const rows = fixtureRows() as { gridRef: string; latitude: number; longitude: number }[];
    const birkdale = rows.find((r) => r.gridRef === "751310");
    // The centre (579500, 211500) converts to a point inside the
    // Birkdale square — within ~150 m of the postcode point itself.
    expect(birkdale?.latitude).toBeCloseTo(51.7762, 2);
    expect(birkdale?.longitude).toBeCloseTo(0.6039, 2);
  });
});

describe("the file contract", () => {
  it("refuses a wrong-vintage file", () => {
    const wrong = text("mapno22024.csv").replace("\n2024,", "\n2023,");
    expect(() => parsePcmCsv(wrong, "no2", 2024)).toThrow(/metadata year/);
  });

  it("refuses a moved value column", () => {
    const wrong = text("mapno22024.csv").replace("no22024", "no22025");
    expect(() => parsePcmCsv(wrong, "no2", 2024)).toThrow(/header/);
  });

  it("files the publisher's MISSING marker as NULL, not a failure", () => {
    const withMissing = `${text("mappm252024g.csv")}534070,-500,525500,MISSING\n`;
    const cells = parsePcmCsv(withMissing, "pm25", 2024);
    expect(cells.get("534070")?.value).toBeNull();
  });

  it("refuses mismatched square sets across pollutants", () => {
    const pm25 = parsePcmCsv(text("mappm252024g.csv"), "pm25", 2024);
    pm25.delete("751310");
    expect(() =>
      buildRows(
        {
          no2: parsePcmCsv(text("mapno22024.csv"), "no2", 2024),
          pm25,
          pm10: parsePcmCsv(text("mappm102024g.csv"), "pm10", 2024),
        },
        2024,
      ),
    ).toThrow(/counts differ|missing/);
  });
});

describe("filing — statement order and the year-scoped swap", () => {
  it("stages into a persistent table and swaps in its own transaction", async () => {
    const statements: string[] = [];
    let staged = 0;
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        statements.push(sql);
        if (/INSERT INTO air_stage/.test(sql)) staged += params.length / 8;
        if (/SELECT count\(\*\)::int AS n FROM air_stage/.test(sql))
          return { rows: [{ n: staged }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    };
    await fileAirGrid(client as never, fixtureRows() as never);
    // BUG-368: the stage is persistent now — the CREATE
    // TABLE IF NOT EXISTS opens the run (no BEGIN before
    // it: staging commits per chunk), and the swap runs in
    // its own transaction after the staging, ending with
    // the staging-clear COMMIT.
    const stageAt = statements.findIndex((s) => /CREATE TABLE IF NOT EXISTS air_stage/.test(s));
    expect(stageAt).toBe(0);
    const insertAt = statements.findIndex((s) => /INSERT INTO air_stage/.test(s));
    const beginAt = statements.findIndex((s) => s === "BEGIN");
    expect(insertAt).toBeGreaterThan(stageAt);
    expect(beginAt).toBeGreaterThan(insertAt);
    expect(statements.some((s) => /DELETE FROM air_grid WHERE year = \$1/.test(s))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged rows, the live grid and
  // the loader_checkpoint row as arrays, with just enough
  // SQL to run the filer.
  type StagedRow = { gridRef: string; year: number; seq: number };
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
    let snapshot: { staged: StagedRow[]; live: StagedRow[] } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = { staged: [...staged], live: [...live] };
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
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS air_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO air_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 8; r++)
          staged.push({
            gridRef: params[r * 8] as string,
            year: params[r * 8 + 1] as number,
            seq: params[r * 8 + 7] as number,
          });
        return { rows: [], rowCount: params.length / 8 };
      }
      if (/SELECT loader, edition, expected, next_start_index/.test(text)) {
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
      if (/DELETE FROM air_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM air_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM air_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/DELETE FROM air_grid WHERE year =/.test(text)) {
        live = live.filter((r) => r.year !== (params[0] as number));
        return { rows: [] };
      }
      if (/INSERT INTO air_grid/.test(text)) {
        live = [...staged];
        return { rows: [] };
      }
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: () => staged,
      live: () => live,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        insertCalls = 0;
        failAfterInserts = n;
      },
    };
  }
  const rows1200 = () =>
    Array.from({ length: 1200 }, (_, i) => ({
      gridRef: String(100000 + i),
      year: 2024,
      no2: 1,
      pm25: 2,
      pm10: 3,
      latitude: 51.5,
      longitude: 0.1,
    }));

  it("kill mid-staging resumes and files every square exactly once", async () => {
    const fake = createFakeClient();
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-air-quality",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    // Kill after the first 500-row chunk: 500 staged, the
    // checkpoint at 500, the second chunk never landed.
    fake.setFailAfterInserts(1);
    await expect(fileAirGrid(fake as never, rows1200() as never, { progress })).rejects.toThrow(
      /simulated kill/,
    );
    expect(fake.staged().length).toBe(500);
    expect(fake.checkpoints.get("load-air-quality")?.next_start_index).toBe(500);
    expect(
      lines.some((l) =>
        /checkpoint 500\/1,200 rows \(42%\) · staged 500 · resume from 500/.test(l),
      ),
    ).toBe(true);

    fake.setFailAfterInserts(null);
    const resumeLines: string[] = [];
    const resumeProgress = createProgressLogger({
      name: "load-air-quality",
      log: (...args: unknown[]) => resumeLines.push(args.join(" ")),
    });
    await fileAirGrid(fake as never, rows1200() as never, { progress: resumeProgress });
    expect(
      resumeLines.some((l) =>
        /resuming from checkpoint · 500 rows staged · edition pcm-2024 · resume from 500/.test(l),
      ),
    ).toBe(true);
    expect(fake.live().length).toBe(1200);
    expect(new Set(fake.live().map((r) => r.gridRef)).size).toBe(1200);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-air-quality")).toBeUndefined();
  });

  it("a vintage change discards the staged rows and starts from zero", async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(1);
    await expect(fileAirGrid(fake as never, rows1200() as never)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(500);
    fake.setFailAfterInserts(null);
    const rows2025 = rows1200().map((r) => ({ ...r, year: 2025 }));
    await fileAirGrid(fake as never, rows2025 as never);
    expect(fake.live().length).toBe(1200);
    expect(fake.live().every((r) => r.year === 2025)).toBe(true);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-air-quality")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(1);
    await expect(fileAirGrid(fake as never, rows1200() as never)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(500);
    fake.setFailAfterInserts(null);
    await fileAirGrid(fake as never, rows1200() as never, { restart: true });
    expect(fake.live().length).toBe(1200);
    expect(new Set(fake.live().map((r) => r.gridRef)).size).toBe(1200);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-air-quality")).toBeUndefined();
  });
});

// BUG-265: the join and the staging carry the shared progress
// logger — a tally every 25,000 rows built (a closing line
// only at fixture scale) and every 25 chunks staged.
describe("progress logging (BUG-265)", () => {
  const collect = () => {
    const lines: string[] = [];
    const log = (...args: unknown[]) => lines.push(args.join(" "));
    return { lines, log };
  };

  it("builds the fixture rows with a closing build line", () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-air-quality", log });
    const rows = buildRows(
      {
        no2: parsePcmCsv(text("mapno22024.csv"), "no2", 2024),
        pm25: parsePcmCsv(text("mappm252024g.csv"), "pm25", 2024),
        pm10: parsePcmCsv(text("mappm102024g.csv"), "pm10", 2024),
      },
      2024,
      { progress },
    );
    expect(rows).toHaveLength(3);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/progress · build 3\/3 rows \(100%\)$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("stages 12,600 rows with a tally line at 25 chunks and a closing line", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-air-quality", log });
    let staged = 0;
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/INSERT INTO air_stage/.test(sql)) staged += params.length / 8;
        if (/SELECT count\(\*\)::int AS n FROM air_stage/.test(sql))
          return { rows: [{ n: staged }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    };
    const rows = Array.from({ length: 12600 }, (_, i) => ({
      gridRef: String(100000 + i),
      year: 2024,
      no2: 1,
      pm25: 2,
      pm10: 3,
      latitude: 51.5,
      longitude: 0.1,
    }));
    await fileAirGrid(client as never, rows as never, { progress });
    // The stage tally lines are the pin: the heartbeat fires
    // every 10 chunks by count, so both health lines are
    // deterministic too — but a slow-batch warning is
    // timing-dependent (the instant fake client can time a
    // 1 ms chunk against a 0 ms average), so no total count
    // is pinned here.
    const stageLines = lines.filter((l) => /progress · stage \d+\/\d+ chunks/.test(l));
    expect(stageLines).toHaveLength(2);
    expect(stageLines[0]).toMatch(/progress · stage 25\/26 chunks \(96%\)$/);
    expect(stageLines[1]).toMatch(/progress · stage 26\/26 chunks \(100%\)$/);
    const heartbeats = lines.filter((l) => l.includes(" heartbeat · "));
    expect(heartbeats).toHaveLength(2);
    expect(heartbeats[0]).toMatch(/heartbeat · stage · 10\/26 · /);
    expect(heartbeats[1]).toMatch(/heartbeat · stage · 20\/26 · /);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });
});
