import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GOLDEN_CELLS,
  GOLDEN_POSTCODES,
  cellFor,
  fileSolarGrid,
  goldenChecks,
  parsePvcalcResponse,
  rowsFromFixture,
  sampleCells,
} from "../loaders/load-pvgis.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// PVGIS solar loader (plan step M5.18), tested against the
// fixture in tests/fixtures/pvgis — the three golden cells'
// PVcalc responses verbatim from the JRC API (see the fixture
// README).

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/pvgis");
const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, "responses.json"), "utf8"));

describe("cell derivation", () => {
  it("places each golden postcode in its locked golden cell", () => {
    for (const [postcode, pos] of Object.entries(GOLDEN_POSTCODES)) {
      const cell = cellFor(pos.lat, pos.lng) as { cellRef: string };
      expect(Object.keys(GOLDEN_CELLS), postcode).toContain(cell.cellRef);
    }
  });

  it("floors negative longitudes to the cell that contains the point", () => {
    // -0.247 is inside the cell centred on -0.25, not -0.15:
    // rounding instead of flooring would file the wrong cell.
    expect(cellFor(51.344571, -0.247104)).toEqual({
      cellRef: "51.35,-0.25",
      latitude: 51.35,
      longitude: -0.25,
    });
    expect(cellFor(51.776176, 0.60387)).toEqual({
      cellRef: "51.75,0.65",
      latitude: 51.75,
      longitude: 0.65,
    });
  });
});

describe("the fixture load", () => {
  it("parses the captured responses into the golden cells, basis filed per row", () => {
    const rows = rowsFromFixture(fixture) as {
      cellRef: string;
      yieldKwhPerKwp: number;
      irradiationKwhM2: number;
      slopeDeg: number;
      azimuthDeg: number;
      systemLossPct: number;
      peakPowerKwp: number;
      mounting: string;
      radiationDb: string;
      yearMin: number;
      yearMax: number;
    }[];
    expect(rows).toHaveLength(3);
    for (const [cellRef, g] of Object.entries(GOLDEN_CELLS)) {
      const row = rows.find((r) => r.cellRef === cellRef);
      expect(row, cellRef).toBeDefined();
      expect([row?.yieldKwhPerKwp, row?.irradiationKwhM2]).toEqual([g.yield, g.irradiation]);
      expect(row).toMatchObject({
        slopeDeg: 35,
        azimuthDeg: 0,
        systemLossPct: 14,
        peakPowerKwp: 1,
        mounting: "building-integrated",
        radiationDb: "PVGIS-SARAH3",
        yearMin: 2005,
        yearMax: 2023,
      });
    }
    expect(() => goldenChecks(rows)).not.toThrow();
  });
});

describe("the API contract", () => {
  const cell = cellFor(51.776176, 0.60387);
  const good = fixture.cells[0].response;

  it("refuses a different radiation database", () => {
    const wrong = structuredClone(good);
    wrong.inputs.meteo_data.radiation_db = "PVGIS-SARAH2";
    expect(() => parsePvcalcResponse(wrong, cell as never)).toThrow(/radiation database/);
  });

  it("refuses a response whose basis is not the standard basis", () => {
    const wrong = structuredClone(good);
    wrong.inputs.mounting_system.fixed.slope.value = 30;
    expect(() => parsePvcalcResponse(wrong, cell as never)).toThrow(/standard basis/);
  });

  it("refuses a response with no usable totals", () => {
    const wrong = structuredClone(good);
    wrong.outputs.totals.fixed.E_y = null;
    expect(() => parsePvcalcResponse(wrong, cell as never)).toThrow(/not usable/);
  });

  it("refuses a fixture cell whose stated ref is not its centre's cell", () => {
    const wrong = structuredClone(fixture);
    wrong.cells[0].cell_ref = "0.05,0.05";
    expect(() => rowsFromFixture(wrong)).toThrow(/not the cell of its own centre/);
  });
});

describe("filing — statement order and the whole-grid swap", () => {
  it("opens BEGIN before the stage create and swaps the whole grid", async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        return { rows: [], rowCount: 0 };
      },
    };
    await fileSolarGrid(client as never, rowsFromFixture(fixture) as never);
    const beginAt = statements.findIndex((s) => s === "BEGIN");
    const stageAt = statements.findIndex((s) => /CREATE TEMP TABLE solar_stage/.test(s));
    expect(beginAt).toBeGreaterThanOrEqual(0);
    expect(stageAt).toBeGreaterThan(beginAt);
    expect(statements.some((s) => /DELETE FROM solar_grid/.test(s))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
  });
});

// ------------------------------------------------------------------
// Progress logging (BUG-265).
// ------------------------------------------------------------------
describe("progress logging (BUG-265)", () => {
  const collect = () => {
    const lines: string[] = [];
    return {
      lines,
      progress: createProgressLogger({
        name: "load-pvgis",
        log: (line: string) => lines.push(line),
      }),
    };
  };
  // Twenty-five distinct cells, sampled against the first
  // fixture cell's captured PVcalc response.
  const cells = Array.from({ length: 25 }, (_, i) => cellFor(51 + i * 0.1, 0.05));
  const response = fixture.cells[0].response;

  it("sampleCells logs a tally with a real percentage", async () => {
    const { lines, progress } = collect();
    const rows = await sampleCells(cells, async () => structuredClone(response), { progress });
    expect(rows).toHaveLength(25);
    // A line every twentieth of the run (every 2 cells),
    // and the closing line at 100%.
    expect(lines.some((l) => /progress · sampling 2\/25 cells \(8%\)$/.test(l))).toBe(true);
    expect(lines.some((l) => /progress · sampling 25\/25 cells \(100%\)$/.test(l))).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("sampleCells logs a failure line naming the sampling stage, with only the error's first line", async () => {
    const { lines, progress } = collect();
    await expect(
      sampleCells(
        cells,
        async () => {
          throw new Error("PVGIS is down\nsecond line");
        },
        { progress },
      ),
    ).rejects.toThrow("PVGIS is down");
    expect(
      lines.some((l) =>
        /failed · sampling · filed 0 of 25 · PVGIS is down · resume from re-run from scratch/.test(
          l,
        ),
      ),
    ).toBe(true);
    expect(lines.every((l) => !l.includes("second line"))).toBe(true);
  });

  it("fileSolarGrid logs a stage marker, the staging tally and the swap marker", async () => {
    const { lines, progress } = collect();
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        return { rows: [], rowCount: 0 };
      },
    };
    await fileSolarGrid(client as never, rowsFromFixture(fixture) as never, { progress });
    expect(lines.some((l) => /progress · staging 3 solar cells$/.test(l))).toBe(true);
    expect(lines.some((l) => /progress · staging 1\/1 chunks \(100%\)$/.test(l))).toBe(true);
    expect(lines.some((l) => /progress · swap started — replacing the solar grid$/.test(l))).toBe(
      true,
    );
    expect(statements.at(-1)).toBe("COMMIT");
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged rows, the live table and the
  // loader_checkpoint row as arrays, with just enough SQL to
  // run the filer.
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  type StagedRow = { cellRef: string; seq: number };
  const makeRows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      cellRef: `${(51 + i * 0.1).toFixed(2)},0.05`,
      latitude: 51 + i * 0.1,
      longitude: 0.05,
      yieldKwhPerKwp: 1000 + i,
      irradiationKwhM2: 1250 + i,
      peakPowerKwp: 1,
      systemLossPct: 14,
      slopeDeg: 35,
      azimuthDeg: 0,
      mounting: "building-integrated",
      pvTechnology: "c-Si",
      radiationDb: "PVGIS-SARAH3",
      yearMin: 2005,
      yearMax: 2023,
    }));
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
      if (/CREATE TABLE IF NOT EXISTS solar_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO solar_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 15; r++) {
          const b = r * 15;
          staged.push({ cellRef: params[b] as string, seq: params[b + 14] as number });
        }
        return { rows: [], rowCount: params.length / 15 };
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
      if (/DELETE FROM solar_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM solar_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT cell_ref FROM solar_stage/.test(text))
        return { rows: staged.map((r) => ({ cell_ref: r.cellRef })) };
      if (/FROM solar_stage ORDER BY seq/.test(text))
        return {
          rows: [...staged]
            .sort((a, b) => a.seq - b.seq)
            .map((r) => ({
              cell_ref: r.cellRef,
              latitude: 51,
              longitude: 0.05,
              yield_kwh_per_kwp: 1000,
              irradiation_kwh_m2: 1250,
              peak_power_kwp: 1,
              system_loss_pct: 14,
              slope_deg: 35,
              azimuth_deg: 0,
              mounting: "building-integrated",
              pv_technology: "c-Si",
              radiation_db: "PVGIS-SARAH3",
              year_min: 2005,
              year_max: 2023,
            })),
        };
      if (/SELECT count\(\*\)::int AS n FROM solar_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/DELETE FROM solar_grid/.test(text)) {
        live = [];
        return { rows: [] };
      }
      if (/INSERT INTO solar_grid/.test(text)) {
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
        failAfterInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  async function runFiling(
    fake: FakeClient,
    rows: ReturnType<typeof makeRows>,
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-pvgis",
      log: (line: string) => captured.push(line),
    });
    await fileSolarGrid(fake as never, rows as never, { progress, resume: { restart } });
    return captured;
  }

  it("kill mid-staging resumes and files every cell exactly once", async () => {
    const fake = createFakeClient();
    const rows = makeRows(1200);
    // Kill after two 500-row chunks: 1,000 rows staged, the
    // checkpoint at 1,000, the third chunk never landed.
    const killLines: string[] = [];
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows, { lines: killLines })).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);
    expect(fake.checkpoints.get("load-pvgis")?.next_start_index).toBe(1000);
    expect(
      killLines.some((l) =>
        /checkpoint 1,000\/1,200 cells \(83%\) · staged 1,000 · resume from 1,000/.test(l),
      ),
    ).toBe(true);

    fake.setFailAfterInserts(null);
    const lines = await runFiling(fake, rows);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 1,000 rows staged · edition 2023-12-31\/PVGIS-SARAH3 · resume from 1,000/.test(
          l,
        ),
      ),
    ).toBe(true);
    expect(fake.live().map((r) => r.cellRef)).toEqual(rows.map((r) => r.cellRef));
    // The swap cleared staging and the checkpoint together.
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-pvgis")).toBeUndefined();
  });

  it("a checkpoint for another edition is discarded and the run starts from zero", async () => {
    const fake = createFakeClient();
    const rows = makeRows(1200);
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);

    // The SARAH3 edition never changes between runs of the
    // same vintage, so simulate the new vintage by editing
    // the stored checkpoint's edition directly.
    const cp = fake.checkpoints.get("load-pvgis");
    expect(cp).toBeDefined();
    if (!cp) throw new Error("expected a checkpoint to exist");
    fake.checkpoints.set("load-pvgis", { ...cp, edition: "2099-01-01/PVGIS-SARAH4" });
    fake.setFailAfterInserts(null);
    const lines = await runFiling(fake, rows);
    expect(lines.some((l) => /discarding stale checkpoint · edition changed/.test(l))).toBe(true);
    expect(fake.live().map((r) => r.cellRef)).toEqual(rows.map((r) => r.cellRef));
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-pvgis")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakeClient();
    const rows = makeRows(1200);
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);

    fake.setFailAfterInserts(null);
    await runFiling(fake, rows, { restart: true });
    expect(fake.live().map((r) => r.cellRef)).toEqual(rows.map((r) => r.cellRef));
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-pvgis")).toBeUndefined();
  });

  it("kill mid-sampling resumes by sampling only the unstaged cells", async () => {
    const { beginSolarFiling } = await import("../loaders/load-pvgis.mjs");
    const fake = createFakeClient();
    const cells = Array.from({ length: 250 }, (_, i) => cellFor(51 + i * 0.1, 0.05));
    const response = fixture.cells[0].response;
    const progress = createProgressLogger({ name: "load-pvgis", log: () => {} });

    // First run: the API dies after 150 cells. The staging
    // buffer stages one 100-cell batch; the 50 sampled cells
    // still buffered are lost and re-sampled next run.
    let fetchCalls = 0;
    const dyingFetch = async () => {
      fetchCalls += 1;
      if (fetchCalls > 150) throw new Error("PVGIS is down");
      return structuredClone(response);
    };
    const filer = await beginSolarFiling(progress, { client: fake as never });
    await filer.prepareResume(cells.length);
    // The live run's staging buffer, as in main(): sampled
    // cells stage in batches of 100 through one chain, so the
    // batches commit in order.
    const makeStager = (f: Awaited<ReturnType<typeof beginSolarFiling>>) => {
      const pending: unknown[] = [];
      let chain: Promise<void> = Promise.resolve();
      const flush = () => {
        if (pending.length === 0) return chain;
        const batch = pending.splice(0, pending.length);
        chain = chain.then(() => f.stageRows(batch as never));
        return chain;
      };
      return {
        onSampled: async (row: unknown) => {
          pending.push(row);
          if (pending.length >= 100) await flush();
        },
        flush,
      };
    };
    const stager = makeStager(filer);
    await expect(
      sampleCells(cells, dyingFetch, {
        progress,
        resumeNote: () => filer.resumeNote(),
        onSampled: stager.onSampled,
      }),
    ).rejects.toThrow("PVGIS is down");
    // No flush here: the 50 sampled cells still buffered are
    // lost, exactly as a killed live run loses them — the
    // chain is already settled (allSettled waits for every
    // worker, and each worker awaited its own staging), so
    // only the one staged 100-cell batch stands.
    expect(fake.staged().length).toBe(100);
    expect(fake.checkpoints.get("load-pvgis")?.next_start_index).toBe(100);

    // Second run: only the 150 unstaged cells are fetched.
    fetchCalls = 0;
    const filer2 = await beginSolarFiling(progress, { client: fake as never });
    await filer2.prepareResume(cells.length);
    const alreadyStaged = await filer2.stagedCellRefs();
    expect(alreadyStaged.size).toBe(100);
    const remaining = cells.filter((c) => !alreadyStaged.has(c.cellRef));
    expect(remaining).toHaveLength(150);
    const stager2 = makeStager(filer2);
    await sampleCells(
      remaining,
      async () => {
        fetchCalls += 1;
        return structuredClone(response);
      },
      {
        progress,
        resumeNote: () => filer2.resumeNote(),
        onSampled: stager2.onSampled,
      },
    );
    await stager2.flush();
    expect(fetchCalls).toBe(150);
    expect(filer2.stagedCount()).toBe(250);
    const stagedRows = await filer2.stagedRows();
    expect(stagedRows).toHaveLength(250);
    expect(new Set(stagedRows.map((r: { cellRef: string }) => r.cellRef)).size).toBe(250);
    await filer2.finishFiling(250);
    expect(fake.live().length).toBe(250);
    expect(new Set(fake.live().map((r) => r.cellRef)).size).toBe(250);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-pvgis")).toBeUndefined();
  });
});
