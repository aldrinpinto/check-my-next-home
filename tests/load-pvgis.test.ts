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
