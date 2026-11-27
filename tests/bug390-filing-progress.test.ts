import { describe, expect, it } from "vitest";
import { createProgressLogger } from "../loaders/progress.mjs";
import { beginFiling as beginZones } from "../loaders/load-flood-zones.mjs";
import { beginFiling as beginRiversSea } from "../loaders/load-flood-rivers-sea.mjs";
import { beginFiling as beginRiversSeaClimate } from "../loaders/load-flood-rivers-sea-climate.mjs";
import { beginFiling as beginSurfaceWater } from "../loaders/load-flood-surface-water.mjs";
import { beginFiling as beginSurfaceWaterClimate } from "../loaders/load-flood-surface-water-climate.mjs";
import { createDefencesFiler } from "../loaders/load-flood-defences.mjs";
import { beginFiling as beginAqma } from "../loaders/load-aqma.mjs";
import { beginFiling as beginBuiltUpAreas } from "../loaders/load-built-up-areas.mjs";
import { beginFiling as beginGreenBelt } from "../loaders/load-green-belt.mjs";
import { beginFiling as beginNatureDesignations } from "../loaders/load-nature-designations.mjs";
import { beginFiling as beginPriorityHabitats } from "../loaders/load-priority-habitats.mjs";

// BUG-390: the filing/swap phase printed one line and then
// went silent — ~30 minutes for flood zones — while a single
// INSERT...SELECT ran. Every finishFiling below must now log
// one line per sub-step (staged count, delete, copy, filed
// count, commit) and pulse around the long single statement,
// so tailing the log shows movement in real time.

type CountFor = (sql: string, params?: unknown[]) => number | undefined;
type RowsFor = (sql: string, params?: unknown[]) => unknown[] | undefined;

interface PulseRec {
  stage: string;
  stops: number;
}

interface TallyRec {
  label: string;
  total: number | null;
  ticks: number[];
  finished: number | null;
}

interface Recorded {
  stages: string[];
  counts: string[];
  tallies: TallyRec[];
  pulses: PulseRec[];
  warnings: string[];
  failures: string[];
  progress: never;
}

const record = (): Recorded => {
  const stages: string[] = [];
  const counts: string[] = [];
  const tallies: TallyRec[] = [];
  const pulses: PulseRec[] = [];
  const warnings: string[] = [];
  const failures: string[] = [];
  const progress = {
    stage: (message: string) => {
      stages.push(message);
    },
    count: (args: { label: string; done: number; total?: number | null; unit?: string }) => {
      counts.push(
        `count: ${args.label} ${args.done}/${args.total ?? "?"} ${args.unit ?? ""}`.trim(),
      );
    },
    tally: (args: { label: string; total?: number | null; every: number; unit?: string }) => {
      const rec: TallyRec = {
        label: args.label,
        total: args.total ?? null,
        ticks: [],
        finished: null,
      };
      tallies.push(rec);
      return {
        tick: (done: number) => {
          rec.ticks.push(done);
        },
        finish: (done: number) => {
          rec.finished = done;
        },
      };
    },
    heartbeat: () => false,
    warning: (args: { what: string; value: string }) => {
      warnings.push(`${args.what}: ${args.value}`);
    },
    failed: (args: { stage: string }) => {
      failures.push(args.stage);
    },
    pulse: ({ stage }: { stage: string; intervalMs?: number }) => {
      const rec: PulseRec = { stage, stops: 0 };
      pulses.push(rec);
      return () => {
        rec.stops += 1;
      };
    },
  };
  return { stages, counts, tallies, pulses, warnings, failures, progress: progress as never };
};

function scriptedClient({ countFor, rowsFor }: { countFor?: CountFor; rowsFor?: RowsFor }) {
  const queries: string[] = [];
  const client = {
    queries,
    query: async (sql: string, params: unknown[] = []) => {
      queries.push(sql);
      if (/SELECT count\(\*\)/i.test(sql)) {
        return { rows: [{ n: countFor?.(sql, params) ?? 0 }], rowCount: 1 };
      }
      const rows = rowsFor?.(sql, params);
      if (rows !== undefined) return { rows, rowCount: rows.length };
      // BUG-391 (rebase onto BUG-390): the zones delete
      // of the emptied shapes removes exactly the named
      // set — in this fake world the ST_IsEmpty count is
      // 0, so the delete removes 0. The generic rowCount
      // 1 below would fail the set-match check (deleted 1
      // but 0 named).
      if (sql.includes("ST_IsEmpty(geom)") && /^\s*DELETE/i.test(sql))
        return { rows: [], rowCount: 0 };
      if (/^\s*(UPDATE|DELETE|INSERT)/i.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    end: async () => {},
    release: () => {},
  };
  return client;
}

function expectSubsequence(actual: string[], expected: string[]) {
  let idx = 0;
  for (const want of expected) {
    const found = actual.indexOf(want, idx);
    expect(
      found,
      `missing line in order: ${want}\nactual:\n${actual.join("\n")}`,
    ).toBeGreaterThanOrEqual(0);
    idx = found + 1;
  }
}

function expectPulsesStopped(rec: Recorded) {
  expect(rec.pulses.length).toBeGreaterThan(0);
  for (const pulse of rec.pulses) expect(pulse.stops).toBe(1);
}

const floodStages = (liveTable: string) => [
  "filing · staged count verified · 3 shapes",
  "filing · scanning staged shapes for invalid geometry",
  "filing · invalid staged shapes · 0",
  "filing · live rows deleted",
  `filing · copying 3 shapes into ${liveTable} (validity repair)`,
  "filing · copy done · 3 shapes",
  "filing · filed count verified · 3 shapes",
  "filing · scanning filed shapes for emptied geometry",
  "filing · emptied by repair · 0 shapes",
  "filing · scanning filed shapes for invalid geometry",
  "filing · invalid filed shapes · 0",
  "filing · swap committed · 3 shapes live",
  "staging cleared · checkpoint removed",
];

function floodCountFor(sql: string): number | undefined {
  const stagedTable = sql.includes("FROM flood_stage") || sql.includes("FROM flood_climate_stage");
  const liveTable = sql.includes("FROM flood_layers") || sql.includes("FROM flood_climate_layers");
  if (sql.includes("NOT ST_IsValid(geom)") && stagedTable) return 0;
  if (stagedTable) return 3;
  if (sql.includes("ST_IsEmpty(geom)")) return 0;
  if (sql.includes("NOT ST_IsValid(geom)") && liveTable) return 0;
  if (liveTable) return 3;
  return undefined;
}

// BUG-391 (rebase onto BUG-390): flood zones no longer
// scans the filed layer for emptied geometry after the
// swap — the emptied shapes are named before the swap
// and deleted from the live layer, so there is nothing
// left to scan; the "emptied by repair" line now names
// the pre-swap count. The other flood loaders keep the
// fail-closed post-filing scan.
const zonesStages = (liveTable: string) =>
  floodStages(liveTable).filter((s) => s !== "filing · scanning filed shapes for emptied geometry");
const floodPulses = (liveTable: string) => [
  "filing · scanning staged shapes for invalid geometry",
  `filing · copying 3 shapes into ${liveTable} (validity repair)`,
  "filing · scanning filed shapes for emptied geometry",
  "filing · scanning filed shapes for invalid geometry",
];
const zonesPulses = (liveTable: string) =>
  floodPulses(liveTable).filter((s) => s !== "filing · scanning filed shapes for emptied geometry");

describe("flood loaders — finishFiling logs every sub-step (BUG-390)", () => {
  const loaders = [
    ["flood zones", beginZones, "flood_layers", zonesStages, zonesPulses],
    ["rivers & sea", beginRiversSea, "flood_layers", floodStages, floodPulses],
    [
      "rivers & sea climate",
      beginRiversSeaClimate,
      "flood_climate_layers",
      floodStages,
      floodPulses,
    ],
    ["surface water", beginSurfaceWater, "flood_layers", floodStages, floodPulses],
    [
      "surface water climate",
      beginSurfaceWaterClimate,
      "flood_climate_layers",
      floodStages,
      floodPulses,
    ],
  ] as const;

  it.each(loaders)(
    "%s: staged count, invalid scan, delete, copy, checks, commit",
    async (_name, begin, liveTable, stagesFor, pulsesFor) => {
      const rec = record();
      const client = scriptedClient({ countFor: floodCountFor });
      const filer = await begin(rec.progress, { client: client as never });
      await filer.finishFiling(3);
      expectSubsequence(rec.stages, stagesFor(liveTable));
      expect(rec.failures).toHaveLength(0);
      expect(rec.pulses).toHaveLength(pulsesFor(liveTable).length);
      expect(rec.pulses.map((p) => p.stage)).toEqual(pulsesFor(liveTable));
      expectPulsesStopped(rec);
    },
  );

  it("flood zones: the real logger's lines are timestamped progress lines, never load-", async () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-flood-zones",
      log: (l: string) => lines.push(l),
    });
    const client = scriptedClient({ countFor: floodCountFor });
    const filer = await beginZones(progress, { client: client as never });
    await filer.finishFiling(3);
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) {
      expect(line).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z load-flood-zones (progress|warning|failed) · /,
      );
      expect(line).not.toMatch(/^load-/);
    }
    expect(lines.some((l) => l.includes("filing · staged count verified · 3 shapes"))).toBe(true);
    expect(lines.some((l) => l.includes("filing · swap committed · 3 shapes live"))).toBe(true);
  });
});

describe("flood defences — finish logs every sub-step (BUG-390)", () => {
  it("staged count, delete, copy, invalid check, commit", async () => {
    const rec = record();
    const client = scriptedClient({
      countFor: (sql) => {
        if (sql.includes("FROM flood_defences_stage")) return 3;
        if (sql.includes("FROM flood_defences WHERE geom IS NOT NULL")) return 0;
        return undefined;
      },
    });
    const filer = await createDefencesFiler(client as never, "2026-10-21", {
      progress: rec.progress,
    });
    await filer.finish(3);
    expectSubsequence(rec.stages, [
      "filing · staged count verified · 3 defences",
      "filing · live rows deleted",
      "filing · copying 3 defences into flood_defences",
      "filing · copy done · 3 defences",
      "filing · invalid filed defences · 0",
      "filing · swap committed · 3 defences live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(1);
    expect(rec.pulses[0].stage).toBe("filing · copying 3 defences into flood_defences");
    expectPulsesStopped(rec);
  });
});

describe("planning-layers loaders — finishFiling logs every sub-step (BUG-390)", () => {
  const loaders = [
    ["aqma", beginAqma, "aqma_stage", "areas"],
    ["built-up areas", beginBuiltUpAreas, "built_up_area_stage", "areas"],
    ["green belt", beginGreenBelt, "green_belt_stage", "pieces"],
    ["nature designations", beginNatureDesignations, "nature_stage", "layers"],
    ["priority habitats", beginPriorityHabitats, "phi_stage", "patches"],
  ] as const;

  it.each(loaders)(
    "%s: staged count, delete, copy, filed count, commit",
    async (_name, begin, stageTable, unit) => {
      const rec = record();
      const client = scriptedClient({
        countFor: (sql) => {
          if (sql.includes(`FROM ${stageTable}`)) return 3;
          if (sql.includes("FROM planning_layers")) return 3;
          return undefined;
        },
      });
      const filer = await begin(rec.progress, { client: client as never });
      await filer.finishFiling(3);
      expectSubsequence(rec.stages, [
        `filing · staged count verified · 3 ${unit}`,
        "filing · live rows deleted",
        `filing · copying 3 ${unit} into planning_layers`,
        `filing · copy done · 3 ${unit}`,
        `filing · filed count verified · 3 ${unit}`,
        `filing · swap committed · 3 ${unit} live`,
        "staging cleared · checkpoint removed",
      ]);
      expect(rec.failures).toHaveLength(0);
      expect(rec.pulses).toHaveLength(1);
      expect(rec.pulses[0].stage).toBe(`filing · copying 3 ${unit} into planning_layers`);
      expectPulsesStopped(rec);
    },
  );
});
import { beginFiling as beginHealth } from "../loaders/load-health.mjs";
import { beginFiling as beginNurseries } from "../loaders/load-nurseries.mjs";
import { beginSchoolsFiling } from "../loaders/load-schools.mjs";
import { beginTransportFiling } from "../loaders/load-transport.mjs";
import { beginSolarFiling } from "../loaders/load-pvgis.mjs";
import { createGreenspaceFiler } from "../loaders/load-os-greenspace.mjs";
import { beginFiling as beginBrownfield } from "../loaders/load-brownfield.mjs";
import { beginFiling as beginPlanningAreas } from "../loaders/load-planning-areas.mjs";
import { beginFiling as beginHeritage } from "../loaders/load-heritage.mjs";
import { beginFiling as beginChargingZones } from "../loaders/load-charging-zones.mjs";
import { beginFiling as beginCrime } from "../loaders/load-crime.mjs";
import { beginFiling as beginEpc } from "../loaders/load-epc.mjs";
import { createUcFiler } from "../loaders/load-dwp-uc.mjs";

describe("health — finishFiling logs every sub-step (BUG-390)", () => {
  it("staged count, delete, copy, ratings, filed count, commit", async () => {
    const rec = record();
    const points = [
      {
        odsCode: "A1",
        rating: {
          cqcLocationId: "L1",
          rating: "Good",
          ratingDate: "2026-01-01",
          reportUrl: "https://example.com/1",
        },
      },
      {
        odsCode: "A2",
        rating: {
          cqcLocationId: "L2",
          rating: "Outstanding",
          ratingDate: "2026-01-02",
          reportUrl: "https://example.com/2",
        },
      },
      { odsCode: "A3", rating: null },
    ];
    const client = scriptedClient({
      countFor: (sql) => {
        if (sql.includes("FROM health_stage")) return 3;
        if (sql.includes("FROM health_points")) return 3;
        return undefined;
      },
      rowsFor: (sql) => {
        if (sql.includes("RETURNING id, ods_code"))
          return points.map((p, i) => ({ id: i + 1, ods_code: p.odsCode }));
        return undefined;
      },
    });
    const filer = await beginHealth(rec.progress, { client: client as never });
    await filer.finishFiling(points, { ratingsAsAt: "2026-11-01" });
    expectSubsequence(rec.stages, [
      "filing · staged count verified · 3 points",
      "filing · live rows deleted",
      "filing · copying 3 points into health_points",
      "filing · copy done · 3 points",
      "filing · filed count verified · 3 points",
      "filing · swap committed · 3 points live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(1);
    expectPulsesStopped(rec);
    const ratings = rec.tallies.find((t) => t.label === "filing ratings");
    expect(ratings).toBeDefined();
    expect(ratings?.ticks).toHaveLength(3);
    expect(ratings?.finished).toBe(3);
  });
});

describe("nurseries — finishFiling logs every sub-step (BUG-390)", () => {
  it("staged count, delete, copy, filed count, commit", async () => {
    const rec = record();
    const client = scriptedClient({
      countFor: (sql) => {
        if (sql.includes("FROM nurseries_stage")) return 3;
        if (sql.includes("FROM nurseries")) return 3;
        return undefined;
      },
    });
    const filer = await beginNurseries(rec.progress, { client: client as never });
    await filer.finishFiling([{}, {}, {}]);
    expectSubsequence(rec.stages, [
      "filing · staged count verified · 3 settings",
      "filing · live rows deleted",
      "filing · copying 3 settings into nurseries",
      "filing · copy done · 3 settings",
      "filing · filed count verified · 3 settings",
      "filing · swap committed · 3 settings live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(1);
    expectPulsesStopped(rec);
  });
});

describe("schools — finishFiling logs every sub-step (BUG-390)", () => {
  it("staged counts, delete, two copies, filed count, commit", async () => {
    const rec = record();
    const client = scriptedClient({
      countFor: (sql) => {
        if (sql.includes("FROM schools_stage")) return 2;
        if (sql.includes("FROM outcomes_stage")) return 3;
        if (sql.includes("FROM schools")) return 2;
        return undefined;
      },
    });
    const filer = await beginSchoolsFiling(rec.progress, { client: client as never });
    await filer.finishFiling(2, 3);
    expectSubsequence(rec.stages, [
      "swap started — replacing the filed schools and outcomes",
      "filing · staged counts verified · 2 schools, 3 outcomes",
      "filing · live rows deleted",
      "filing · copying 2 schools into schools",
      "filing · copy done · 2 schools",
      "filing · copying 3 outcomes into ofsted_outcomes",
      "filing · copy done · 3 outcomes",
      "filing · filed count verified · 2 schools",
      "filing · swap committed · 2 schools, 3 outcomes live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(2);
    expectPulsesStopped(rec);
  });
});

describe("transport — finishFiling logs every sub-step (BUG-390)", () => {
  it("staged count, delete, copy, filed count, commit", async () => {
    const rec = record();
    const client = scriptedClient({
      countFor: (sql) => {
        if (sql.includes("FROM transport_stage")) return 3;
        if (sql.includes("FROM transport_stops")) return 3;
        return undefined;
      },
    });
    const filer = await beginTransportFiling(rec.progress, { client: client as never });
    await filer.finishFiling(3);
    expectSubsequence(rec.stages, [
      "swap started — replacing the filed transport stops",
      "filing · staged count verified · 3 stops",
      "filing · live rows deleted",
      "filing · copying 3 stops into transport_stops",
      "filing · copy done · 3 stops",
      "filing · filed count verified · 3 stops",
      "filing · swap committed · 3 stops live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(1);
    expectPulsesStopped(rec);
  });
});

describe("pvgis — finishFiling logs every sub-step (BUG-390)", () => {
  it("staged count, delete, copy, commit", async () => {
    const rec = record();
    const client = scriptedClient({
      countFor: (sql) => {
        if (sql.includes("FROM solar_stage")) return 3;
        return undefined;
      },
    });
    const filer = await beginSolarFiling(rec.progress, { client: client as never });
    await filer.finishFiling(3);
    expectSubsequence(rec.stages, [
      "swap started — replacing the solar grid",
      "filing · staged count verified · 3 cells",
      "filing · live rows deleted",
      "filing · copying 3 cells into solar_grid",
      "filing · copy done · 3 cells",
      "filing · swap committed · 3 cells live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(1);
    expectPulsesStopped(rec);
  });
});

describe("os-greenspace — finishFiling logs every sub-step (BUG-390)", () => {
  it("delete, copy, commit after staging two rows", async () => {
    const rec = record();
    const client = scriptedClient({});
    const pool = { connect: async () => client };
    const filer = await createGreenspaceFiler(pool as never, "2026-11-27T00:00:00.000Z", {
      progress: rec.progress,
    });
    await filer.stageRows([
      {
        osmId: 1,
        name: "Green A",
        pointRole: "centre",
        lat: 51.5,
        lon: -0.1,
        sourceName: "OS",
        sourceDate: "2026-11-01",
      },
      {
        osmId: 2,
        name: "Green B",
        pointRole: "access",
        lat: 51.6,
        lon: -0.2,
        sourceName: "OS",
        sourceDate: "2026-11-01",
      },
    ]);
    await filer.finishFiling();
    expectSubsequence(rec.stages, [
      "filing · live rows deleted",
      "filing · copying 2 points into greenspace_points",
      "filing · copy done · 2 points",
      "filing · swap committed · 2 points live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(1);
    expectPulsesStopped(rec);
  });
});

describe("brownfield — finishFiling logs every sub-step (BUG-390)", () => {
  it("staged count, gate, delete, two copies, counts, commit", async () => {
    const rec = record();
    const publishers = new Map([
      ["E123", 2],
      ["E456", 1],
    ]);
    const client = scriptedClient({
      countFor: (sql) => {
        if (sql.includes("FROM brownfield_stage")) return 3;
        if (sql.includes("FROM brownfield_sites")) return 3;
        if (sql.includes("FROM brownfield_publishers")) return 2;
        return undefined;
      },
    });
    const filer = await beginBrownfield(rec.progress, { client: client as never });
    await filer.finishFiling(3, publishers, "2026-11-01");
    expectSubsequence(rec.stages, [
      "filing · staged count verified · 3 sites",
      "filing · gate staged · 2 organisations",
      "filing · live rows deleted",
      "filing · copying 3 sites into brownfield_sites",
      "filing · copy done · 3 sites",
      "filing · copying 2 publishers into brownfield_publishers",
      "filing · copy done · 2 publishers",
      "filing · filed count verified · 3 sites",
      "filing · gate filed · 2 publishers",
      "filing · swap committed · 3 sites live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(2);
    expectPulsesStopped(rec);
  });
});

describe("planning areas — finishFiling logs every sub-step (BUG-390)", () => {
  it("staged count, gate, delete, two copies, counts, commit", async () => {
    const rec = record();
    const publishers = new Map([
      ["E123", { currentAreas: 2, areasWithGeometry: 2 }],
      ["E456", { currentAreas: 1, areasWithGeometry: 1 }],
    ]);
    const client = scriptedClient({
      countFor: (sql) => {
        if (sql.includes("FROM planning_areas_stage")) return 3;
        if (sql.includes("FROM planning_layers")) return 3;
        if (sql.includes("FROM article4_publishers")) return 2;
        return undefined;
      },
    });
    const filer = await beginPlanningAreas(rec.progress, { client: client as never });
    await filer.finishFiling(3, publishers, "2026-11-01");
    expectSubsequence(rec.stages, [
      "filing · staged count verified · 3 layers",
      "filing · live rows deleted",
      "filing · copying 3 layers into planning_layers",
      "filing · copy done · 3 layers",
      "filing · copying 2 publishers into article4_publishers",
      "filing · copy done · 2 publishers",
      "filing · filed count verified · 3 layers",
      "filing · gate filed · 2 publishers",
      "filing · swap committed · 3 layers live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.counts.some((c) => c.includes("stage gate") && c.includes("2/2"))).toBe(true);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(2);
    expectPulsesStopped(rec);
  });
});

describe("heritage — finishFiling logs every sub-step (BUG-390)", () => {
  it("staged counts, delete, two copies, filed counts, commit", async () => {
    const rec = record();
    const polygonSets = [{ constraintType: "conservation_area", filed: [{}, {}, {}] }];
    const client = scriptedClient({
      countFor: (sql, params) => {
        if (sql.includes("FROM heritage_listed_stage")) return 2;
        if (sql.includes("FROM heritage_polygon_stage")) return 3;
        if (sql.includes("FROM listed_buildings")) return 2;
        if (sql.includes("FROM planning_layers WHERE constraint_type = $1"))
          return params?.[0] === "conservation_area" ? 3 : 0;
        return undefined;
      },
    });
    const filer = await beginHeritage(rec.progress, { client: client as never });
    await filer.finishFiling(2, 3, polygonSets);
    expectSubsequence(rec.stages, [
      "filing · staged counts verified · 2 listed buildings, 3 polygons",
      "filing · live rows deleted",
      "filing · copying 2 listed buildings into listed_buildings",
      "filing · copy done · 2 listed buildings",
      "filing · copying 3 polygons into planning_layers",
      "filing · copy done · 3 polygons",
      "filing · filed counts verified · 2 listed buildings, 3 polygons",
      "filing · swap committed · 2 listed buildings, 3 polygons live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(2);
    expectPulsesStopped(rec);
  });
});

describe("charging zones — finishFiling logs every sub-step (BUG-390)", () => {
  it("staged count, validity and area, overlaps, delete, copy, commit", async () => {
    const rec = record();
    const filing = {
      filed: [
        { scheme: { key: "CZ1", name: "Zone One", referenceAreaKm2: 10 } },
        { scheme: { key: "CZ2", name: "Zone Two", referenceAreaKm2: 20 } },
      ],
    };
    const client = scriptedClient({
      countFor: (sql) => {
        if (sql.includes("FROM cz_stage")) return 2;
        if (sql.includes("FROM charging_zones")) return 2;
        return undefined;
      },
      rowsFor: (sql) => {
        if (sql.includes("ST_Area"))
          return filing.filed.map((entry) => ({
            scheme_key: entry.scheme.key,
            valid: true,
            km2: entry.scheme.referenceAreaKm2,
          }));
        if (sql.includes("ST_Intersects")) return [];
        return undefined;
      },
    });
    const filer = await beginChargingZones(rec.progress, { client: client as never });
    await filer.finishFiling(filing);
    expectSubsequence(rec.stages, [
      "filing · staged count verified · 2 schemes",
      "filing · checking staged boundaries for validity and area",
      "filing · validity and area checked · 2 schemes",
      "filing · checking staged boundaries for overlaps",
      "filing · no overlapping boundaries",
      "filing · live rows deleted",
      "filing · copying 2 schemes into charging_zones",
      "filing · copy done · 2 schemes",
      "filing · filed count verified · 2 schemes",
      "filing · swap committed · 2 schemes live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(3);
    expectPulsesStopped(rec);
  });
});

describe("crime and epc — finishFiling tallies the per-postcode loops (BUG-390)", () => {
  it("crime: entry line, tally over the update loop, verify lines, commit", async () => {
    const rec = record();
    const postcodes = ["PC1", "PC2"];
    const answers = new Map(
      postcodes.map((pc) => [
        pc,
        {
          total: 5,
          windowTo: "2026-10-01",
          months: Array(12).fill("2025-11"),
          basisResidents: 100,
        },
      ]),
    );
    const client = scriptedClient({
      rowsFor: (sql, params) => {
        if (sql.includes("answers->'crime'"))
          return [{ crime: answers.get(params?.[0] as string) }];
        return undefined;
      },
    });
    const filer = await beginCrime(rec.progress, { client: client as never });
    await filer.finishFiling(postcodes, answers, "2026-10-01");
    expectSubsequence(rec.stages, [
      "filing 2 crime answers",
      "filing · verifying filed answers",
      "filing · filed answers verified",
      "filing · swap committed · 2 crime answers live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(0);
    const tally = rec.tallies.find((t) => t.label === "filing");
    expect(tally).toBeDefined();
    expect(tally?.ticks).toEqual([1, 2]);
    expect(tally?.finished).toBe(2);
  });

  it("epc: entry line, tally over the update loop, verify lines, commit", async () => {
    const rec = record();
    const postcodes = ["PC1", "PC2"];
    const answers = new Map(
      postcodes.map((pc) => [
        pc,
        {
          certificateCount: 2,
          certificates: [
            { addressLine1: "1 High Street", totalFloorArea: 80, band: "C" },
            { addressLine1: "1 High Street", totalFloorArea: 90, band: "C" },
          ],
        },
      ]),
    );
    const client = scriptedClient({
      rowsFor: (sql, params) => {
        if (sql.includes("answers->'epc'")) return [{ epc: answers.get(params?.[0] as string) }];
        return undefined;
      },
    });
    const filer = await beginEpc(rec.progress, { client: client as never });
    await filer.finishFiling(postcodes, answers);
    expectSubsequence(rec.stages, [
      "filing 2 EPC answers",
      "filing · verifying filed answers",
      "filing · filed answers verified",
      "filing · swap committed · 2 EPC answers live",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(0);
    const tally = rec.tallies.find((t) => t.label === "filing");
    expect(tally).toBeDefined();
    expect(tally?.ticks).toEqual([1, 2]);
    expect(tally?.finished).toBe(2);
  });
});

describe("dwp-uc — finishFiling logs every sub-step (BUG-390)", () => {
  it("swap line, prune line, commit line with no pairs staged", async () => {
    const rec = record();
    const client = scriptedClient({});
    const pool = { connect: async () => client };
    const filer = await createUcFiler(pool as never, "2026-11-01", { progress: rec.progress });
    await filer.finishFiling();
    expectSubsequence(rec.stages, [
      "swapping 0 series-months into benefits_stats",
      "filing · old months pruned",
      "filing · swap committed",
      "staging cleared · checkpoint removed",
    ]);
    expect(rec.failures).toHaveLength(0);
    expect(rec.pulses).toHaveLength(0);
  });
});
