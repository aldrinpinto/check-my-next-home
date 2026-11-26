import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkGolden as checkAqmaGolden,
  createFeatureProcessor as createAqmaProcessor,
  processFeatures as processAqmaFeatures,
  readFixture as readAqmaFixture,
} from "../loaders/load-aqma.mjs";
import {
  createFeatureProcessor as createBuaProcessor,
  processFeatures as processBuaFeatures,
  readFixture as readBuaFixture,
} from "../loaders/load-built-up-areas.mjs";
import {
  DATABASES as UC_DATABASES,
  createRunStats,
  createUcFiler,
  createUcGoldenTally,
  fileUc,
  goldenChecks as ucGoldenChecks,
  loadUcRows,
  streamUcRows,
} from "../loaders/load-dwp-uc.mjs";
import {
  createFeatureProcessor as createNatureProcessor,
  createStatutoryProcessor,
  createWoodlandMerger,
  mergeWoodland,
} from "../loaders/load-nature-designations.mjs";
import {
  SOURCE_NAME as GREENSPACE_SOURCE,
  createGoldenTally,
  createGreenspaceFiler,
  fileGreenspace,
  goldenChecks as greenspaceGoldenChecks,
  iterateGreenspaceFile,
  readGreenspaceFile,
} from "../loaders/load-os-greenspace.mjs";
import { streamPhiFixture } from "../loaders/load-priority-habitats.mjs";
import {
  buildCases,
  createCaseBuilder,
  extractPdfText,
  parseDecisionHeader,
  readFixturePdf,
} from "../loaders/load-tribunal-building-safety.mjs";

// BUG-195: the seven remaining whole-file loaders were
// converted to the streaming / bounded-batch pattern proven
// by BUG-187 (flood) and BUG-191 (broadband). These tests pin
// the converted shape:
//   - streamed processing is judgement-identical to the
//     collecting form each loader kept (same items, same
//     counts, same golden failures) on the real fixtures;
//   - reads hand data over in bounded batches, never as one
//     whole-dataset array built before filing;
//   - every one of the seven files by an atomic swap, so the
//     failure tests pin the swap contract against stateful
//     fakes: a mid-filing failure leaves the previously filed
//     data whole, and a re-run completes the filing. (The
//     chunk-commit semantics of the flood/broadband loaders
//     do not apply here — no BUG-195 loader commits in
//     pieces, by design.)

const FIXTURES = join(process.cwd(), "tests/fixtures");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

function slicesOf<T>(items: T[], sizes: number[]): T[][] {
  const out: T[][] = [];
  let at = 0;
  for (const size of sizes) {
    out.push(items.slice(at, at + size));
    at += size;
  }
  if (at < items.length) out.push(items.slice(at));
  return out;
}

describe("built-up areas — streamed processing equals the collecting form", () => {
  const features = readJson(join(FIXTURES, "built-up-areas/built-up-areas.geojson")).features;

  it("per-batch processing over uneven slices files the identical items and totals", () => {
    const collecting = processBuaFeatures(features);
    const processor = createBuaProcessor();
    const streamed = slicesOf(features, [1, 7, 2]).flatMap((batch) =>
      processor.processBatch(batch),
    );
    const totals = processor.finish();
    expect(streamed).toEqual(collecting.filed);
    expect(totals).toEqual({
      total: collecting.total,
      geoless: collecting.geoless,
      filed: collecting.filed.length,
    });
  });

  it("the fixture read's sink receives the full filed set in batches", async () => {
    const batches: unknown[][] = [];
    const read = await readBuaFixture(join(FIXTURES, "built-up-areas"), {
      onItems: async (items: unknown[]) => {
        batches.push(items);
      },
    } as never);
    expect(batches.length).toBeGreaterThan(0);
    expect(batches.flat()).toEqual(processBuaFeatures(features).filed);
    expect(read.filed).toBe(processBuaFeatures(features).filed.length);
  });

  it("the read's sifted candidates hold the golden areas (BUG-199)", async () => {
    // main() judges the golden points over read.items — the
    // sifted set — not over the sink's full set. The sift
    // speaks the flood loaders' flat polygon form; this
    // loader's nested pairs must reach it with their own
    // bbox, or it retains nothing and the golden checks
    // fail on an empty set (the CI fixture pass, 23 Nov
    // 2026). The four pinned areas must survive the sift.
    const read = await readBuaFixture(join(FIXTURES, "built-up-areas"), {});
    const codes = read.items.map((f: { code: string }) => f.code);
    expect(codes).toContain("E63011486"); // Hatfield Peverel
    expect(codes).toContain("E63012003"); // Newham
    expect(codes).toContain("E63012408"); // Ewell
    expect(codes).toContain("E63012364"); // Bath
  });
});

describe("AQMA — streamed processing equals the collecting form", () => {
  const features = readJson(join(FIXTURES, "aqma/aqma.geojson")).features;

  it("per-batch processing over uneven slices files the identical items and counts", () => {
    const collecting = processAqmaFeatures(features);
    const processor = createAqmaProcessor();
    const streamed = slicesOf(features, [3, 1, 16]).flatMap((batch) =>
      processor.processBatch(batch),
    );
    expect(streamed).toEqual(collecting.filed);
    expect(processor.total()).toBe(collecting.total);
    expect(processor.filedCount()).toBe(collecting.filed.length);
    expect(processor.perNation).toEqual(collecting.perNation);
  });

  it("the fixture read's sink receives the full filed set and the edition", async () => {
    const batches: unknown[][] = [];
    const editions: unknown[] = [];
    const read = await readAqmaFixture(join(FIXTURES, "aqma"), {
      onItems: async (items: unknown[], edition: unknown) => {
        batches.push(items);
        editions.push(edition);
      },
    } as never);
    expect(batches.flat()).toEqual(processAqmaFeatures(features).filed);
    expect(editions.every((e) => e === read.edition)).toBe(true);
    expect(read.filed).toBe(processAqmaFeatures(features).filed.length);
  });

  it("the golden checks pass over the read's sifted candidates (BUG-199)", async () => {
    // main() runs checkGolden over read.items — the sifted
    // set. The sift speaks the flood loaders' flat polygon
    // form; this loader's nested pairs must reach it with
    // their own bbox, or it retains nothing and the golden
    // checks fail on an empty set (the CI fixture pass,
    // 23 Nov 2026) while the collecting judgement passes.
    const read = await readAqmaFixture(join(FIXTURES, "aqma"), {});
    expect(read.items.length).toBeGreaterThan(0);
    expect(() => checkAqmaGolden({ filed: read.items })).not.toThrow();
    // The same judgement over the collecting form agrees.
    expect(() => checkAqmaGolden({ filed: processAqmaFeatures(features).filed })).not.toThrow();
  });
});

describe("nature designations — processors and the woodland merger", () => {
  const square = (x: number, y: number, s: number) => ({
    type: "Polygon",
    coordinates: [
      [
        [x, y],
        [x + s, y],
        [x + s, y + s],
        [x, y + s],
        [x, y],
      ],
    ],
  });
  const feature = (props: Record<string, unknown>, geometry: unknown) => ({
    properties: props,
    geometry,
  });

  it("malformed geometry is counted across batches and judged once, at finish", () => {
    const processor = createNatureProcessor("test layer");
    const bad = feature({}, { type: "Polygon", coordinates: 42 });
    const good = feature({ A: "1" }, square(0, 0, 1));
    expect(processor.processBatch([bad, good])).toHaveLength(1);
    expect(processor.processBatch([bad])).toHaveLength(0);
    expect(() => processor.finish()).toThrow(
      "test layer: 2 features carry geometry that does not parse — contract failure, nothing filed",
    );
  });

  it("the statutory processor applies the status filter and counts sites by code", () => {
    const spec = {
      label: "test statutory",
      statusField: "STATUS",
      keepStatus: "Current",
      codeField: "CODE",
    };
    const processor = createStatutoryProcessor(spec as never);
    const filed = [
      ...processor.processBatch([
        feature({ STATUS: "Current", CODE: "S1" }, square(0, 0, 1)),
        feature({ STATUS: "Proposed", CODE: "S2" }, square(5, 5, 1)),
      ]),
      ...processor.processBatch([feature({ STATUS: "Current", CODE: "S1" }, square(9, 9, 1))]),
    ];
    const totals = processor.finish();
    expect(filed).toHaveLength(2);
    expect(totals).toEqual({ read: 3, geoless: 0, excluded: 1, filed: 2, sites: 1 });
  });

  it("the streaming merger files exactly what mergeWoodland files", () => {
    const processor = createNatureProcessor("woodland");
    const revItems = processor.processBatch([feature({ NAME: "rev" }, square(0, 0, 2))]);
    const origItems = processor.processBatch([
      feature({ NAME: "overlapping" }, square(1, 1, 2)),
      feature({ NAME: "disjoint" }, square(10, 10, 1)),
    ]);
    processor.finish();
    const collecting = mergeWoodland(origItems, revItems);
    const merger = createWoodlandMerger(revItems);
    const streamed = [...merger.revisedFiled];
    for (const item of origItems) {
      const kept = merger.offer(item);
      if (kept) streamed.push(kept);
    }
    expect(streamed).toEqual(collecting.filed);
    expect(merger.replaced()).toBe(collecting.replaced);
    expect(collecting.replaced).toBe(1);
  });
});

describe("priority habitats — the fixture streams feature by feature", () => {
  it("streamPhiFixture hands over every fixture feature, one at a time", async () => {
    const dir = join(FIXTURES, "priority-habitats");
    const expected = [1, 2, 3]
      .map((n) => readJson(join(dir, `priority-habitats-${n}.geojson`)).features.length)
      .reduce((a, b) => a + b, 0);
    let calls = 0;
    let lastFeature: unknown = null;
    await streamPhiFixture(dir, (f: unknown) => {
      calls += 1;
      lastFeature = f;
    });
    expect(calls).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(lastFeature).not.toBeNull();
  });
});

describe("OS Greenspace — iterated read, golden tally, atomic filer", () => {
  const gpkgPath = join(mkdtempSync(join(tmpdir(), "cmnh-gs195-")), "opgrsp_gb.gpkg");
  // The fixture GeoPackage travels base64-encoded (the
  // repo's text-only push channel), as in the loader's own
  // suite.
  writeFileSync(
    gpkgPath,
    Buffer.from(
      readFileSync(join(FIXTURES, "os-greenspace/opgrsp_gb.gpkg.b64"), "utf8").replace(/\s+/g, ""),
      "base64",
    ),
  );
  const collected = readGreenspaceFile(gpkgPath, "2026-08-14");

  it("the iterated read yields the collecting read's rows and counts", () => {
    const rows: unknown[] = [];
    const iterator = iterateGreenspaceFile(gpkgPath, "2026-08-14");
    let step;
    while (!(step = iterator.next()).done) rows.push(step.value);
    expect(rows).toEqual(collected.rows);
    expect(step.value).toEqual({
      sitesRead: collected.sitesRead,
      accessRead: collected.accessRead,
      functionCounts: collected.functionCounts,
      centresDropped: collected.centresDropped,
      accessFiled: collected.accessFiled,
      accessSkipped: collected.accessSkipped,
    });
  });

  it("the golden tally composes the collecting checks' failures", () => {
    for (const full of [false, true]) {
      const tally = createGoldenTally();
      for (const row of collected.rows) tally.offer(row as never);
      expect(tally.failures(collected.functionCounts, { full })).toEqual(
        greenspaceGoldenChecks(collected.rows as never, collected.functionCounts, { full }),
      );
    }
  });

  // A stateful fake: greenspace_points and the stage as
  // in-memory row sets, with real transaction semantics —
  // BEGIN snapshots, ROLLBACK restores, COMMIT keeps.
  // BUG-368: the stage is PERSISTENT now and the filer
  // checkpoints into loader_checkpoint, so the fake models
  // the checkpoint row and the staged-count query too —
  // otherwise a re-run stages onto the first run's rows.
  type PointRow = Record<string, unknown>;
  function statefulPool({ failSwapOnce = false } = {}) {
    let live: PointRow[] = [{ name: "Previously Filed Park", point_role: "centre" }];
    let stage: PointRow[] = [];
    let checkpoint: Record<string, unknown> | null = null;
    let snapshot: PointRow[] | null = null;
    let swapFailed = false;
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const head = sql.trim().replace(/\s+/g, " ");
        if (head === "BEGIN") snapshot = structuredClone(live);
        else if (head.startsWith("CREATE TEMP TABLE greenspace_stage")) stage = [];
        else if (head.startsWith("INSERT INTO greenspace_stage")) {
          // BUG-368: the stage insert carries 8 params/row
          // (the added seq); the old 7-stride garbled rows.
          for (let at = 0; at < params.length; at += 8)
            stage.push({
              osm_id: params[at],
              name: params[at + 1],
              point_role: params[at + 2],
              latitude: params[at + 3],
              longitude: params[at + 4],
              source_name: params[at + 5],
              source_date: params[at + 6],
              seq: params[at + 7],
            });
        } else if (head.startsWith("SELECT loader, edition, expected, next_start_index")) {
          return { rows: checkpoint ? [checkpoint] : [], rowCount: checkpoint ? 1 : 0 };
        } else if (head.startsWith("INSERT INTO loader_checkpoint")) {
          checkpoint = {
            loader: params[0],
            edition: params[1],
            expected: params[2],
            next_start_index: params[3],
            read_count: params[4],
            filed_count: params[5],
            state: params[6],
            updated_at: new Date().toISOString(),
          };
        } else if (head.startsWith("SELECT count(*)::int AS n, coalesce(sum(seq)")) {
          const seqs = stage.map((r) => Number(r.seq ?? 0));
          return {
            rows: [
              {
                n: stage.length,
                s: seqs.reduce((a, b) => a + b, 0),
                m: seqs.length > 0 ? Math.max(...seqs) : 0,
              },
            ],
            rowCount: 1,
          };
        } else if (head === "DELETE FROM greenspace_stage") stage = [];
        else if (head.startsWith("DELETE FROM greenspace_stage WHERE seq >=")) {
          const threshold = Number(params[0]);
          stage = stage.filter((r) => Number(r.seq ?? 0) < threshold);
        } else if (head.startsWith("DELETE FROM loader_checkpoint")) checkpoint = null;
        else if (head === "DELETE FROM greenspace_points") live = [];
        else if (head.startsWith("INSERT INTO greenspace_points")) {
          if (failSwapOnce && !swapFailed) {
            swapFailed = true;
            throw new Error("forced failure: the swap insert");
          }
          live = stage.map((row) => ({ ...row, loaded_at: params[0] }));
        } else if (head === "COMMIT") snapshot = null;
        else if (head === "ROLLBACK") {
          if (snapshot) live = snapshot;
          snapshot = null;
        }
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    return { pool: { connect: async () => client }, live: () => live };
  }

  const newRows = [
    {
      osmId: null,
      name: "New Park",
      pointRole: "centre",
      lat: 51.5,
      lon: 0.02,
      sourceName: GREENSPACE_SOURCE,
      sourceDate: "2026-08-14",
    },
    {
      osmId: null,
      name: "New Park",
      pointRole: "access",
      lat: 51.51,
      lon: 0.005,
      sourceName: GREENSPACE_SOURCE,
      sourceDate: "2026-08-14",
    },
  ];

  it("an aborted filing leaves the previously filed points whole", async () => {
    const fake = statefulPool();
    const filer = await createGreenspaceFiler(fake.pool as never, "2026-11-23T00:00:00Z");
    await filer.stageRows(newRows as never);
    await filer.abortFiling();
    expect(fake.live()).toEqual([{ name: "Previously Filed Park", point_role: "centre" }]);
  });

  it("a mid-swap failure files nothing, and the re-run files the new set whole", async () => {
    const fake = statefulPool({ failSwapOnce: true });
    await expect(
      fileGreenspace(fake.pool as never, newRows as never, "2026-11-23T00:00:00Z"),
    ).rejects.toThrow("forced failure");
    expect(fake.live()).toEqual([{ name: "Previously Filed Park", point_role: "centre" }]);
    await fileGreenspace(fake.pool as never, newRows as never, "2026-11-23T00:00:00Z");
    expect(fake.live().map((r) => r.name)).toEqual(["New Park", "New Park"]);
    expect(fake.live()).toHaveLength(2);
  });
});

describe("tribunal building safety — the case builder equals buildCases", () => {
  const FIXTURE_DIR = join(FIXTURES, "tribunal-building-safety");

  async function fixtureDocuments() {
    const manifest = readJson(join(FIXTURE_DIR, "manifest.json")) as {
      items: {
        link: string;
        title: string;
        decisionDate?: string;
        subCategory?: string;
        pdf: string;
      }[];
    };
    const docs = [];
    for (const entry of manifest.items) {
      const item = {
        link: entry.link,
        title: entry.title,
        decisionDate: entry.decisionDate ?? null,
        subCategory: entry.subCategory ?? null,
      };
      const buffer = await readFixturePdf(FIXTURE_DIR, entry.pdf);
      docs.push({ item, parsed: parseDecisionHeader(extractPdfText(buffer)) });
    }
    return docs;
  }

  it("documents fed one at a time build the identical cases", async () => {
    const docs = await fixtureDocuments();
    const collecting = buildCases(docs as never);
    const builder = createCaseBuilder();
    for (const doc of docs) builder.addDocument(doc as never);
    expect(builder.documents).toBe(docs.length);
    expect(builder.finish()).toEqual(collecting);
  });
});

describe("DWP Universal Credit — streamed pull, golden tally, atomic filer", () => {
  const FIXTURE_DIR = join(FIXTURES, "dwp-uc");
  type UcRow = {
    lsoaCode: string;
    lsoaName: string;
    series: string;
    sourceName: string;
    month: string;
    count: number;
  };
  const byKey = (rows: UcRow[]) =>
    [...rows].sort((a, b) =>
      `${a.series}|${a.month}|${a.lsoaCode}`.localeCompare(`${b.series}|${b.month}|${b.lsoaCode}`),
    );

  it("streamUcRows hands over bounded batches that together equal the collecting pull", async () => {
    const { rows } = await loadUcRows({ kind: "dir", dir: FIXTURE_DIR } as never);
    const batches: UcRow[][] = [];
    await streamUcRows({ kind: "dir", dir: FIXTURE_DIR } as never, {}, async (batch: UcRow[]) => {
      batches.push(batch);
    });
    expect(batches.length).toBeGreaterThan(0);
    for (const batch of batches) expect(batch.length).toBeLessThanOrEqual(5000);
    expect(byKey(batches.flat())).toEqual(byKey(rows as UcRow[]));
  });

  it("the golden tally composes the collecting checks' failures", async () => {
    const { rows } = await loadUcRows({ kind: "dir", dir: FIXTURE_DIR } as never);
    for (const full of [false, true]) {
      const tally = createUcGoldenTally();
      for (const row of rows as UcRow[]) tally.offer(row as never);
      expect(tally.failures({ full })).toEqual(ucGoldenChecks(rows as never, { full }));
    }
  });

  it("the run stats compose the collecting summary's figures", async () => {
    const { rows } = await loadUcRows({ kind: "dir", dir: FIXTURE_DIR } as never);
    const stats = createRunStats();
    stats.addRows(rows as never);
    const bits = UC_DATABASES.map(({ series }: { series: string }) => {
      const inSeries = (rows as UcRow[]).filter((r) => r.series === series);
      const months = [...new Set(inSeries.map((r) => r.month))].sort();
      return `${series}: ${inSeries.length} areas for ${months.join(", ") || "no new month"}`;
    });
    expect(stats.summary(true)).toBe(
      `load-dwp-uc · Universal Credit (people + households, as published by DWP) · ${bits.join(" · ")} · filed`,
    );
  });

  // A stateful fake for benefits_stats: stage and live as
  // in-memory row sets, BEGIN snapshots, ROLLBACK restores,
  // COMMIT keeps; the per-pair swaps and the 13-month prune
  // are interpreted, not just recorded.
  type StatRow = Record<string, unknown>;
  function statefulPool({ failSecondSwap = false } = {}) {
    const sentinel: StatRow = {
      lsoa_code: "E01000001",
      series: "uc_people",
      reference_month: "2020-01-01",
      lsoa_name: "Sentinel",
      count: 7,
      pct: null,
      source_name: "earlier filing",
      source_date: "2020-01-01",
      loaded_at: "earlier",
    };
    let live: StatRow[] = [sentinel];
    let stage: StatRow[] = [];
    let snapshot: StatRow[] | null = null;
    let swaps = 0;
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const head = sql.trim().replace(/\s+/g, " ");
        if (head === "BEGIN") snapshot = structuredClone(live);
        // BUG-368: the stage is persistent now — the CREATE
        // no longer resets it, and the inserts carry the
        // per-series seq as a seventh parameter.
        else if (head.startsWith("CREATE TABLE IF NOT EXISTS uc_stage")) {
          /* the persistent stage stands */
        } else if (head.startsWith("INSERT INTO uc_stage")) {
          for (let at = 0; at < params.length; at += 7)
            stage.push({
              lsoa_code: params[at],
              lsoa_name: params[at + 1],
              series: params[at + 2],
              reference_month: params[at + 3],
              count: params[at + 4],
              source_name: params[at + 5],
              seq: params[at + 6],
            });
        } else if (head.startsWith("SELECT count(*)::int AS n FROM uc_stage")) {
          return { rows: [{ n: stage.length }], rowCount: 1 };
        } else if (head.startsWith("SELECT count(*)::int AS n, coalesce(sum(seq)")) {
          const rows = params[0] ? stage.filter((r) => r.series === params[0]) : stage;
          return {
            rows: [
              {
                n: rows.length,
                s: rows.reduce((a, r) => a + (r.seq as number), 0),
                m: rows.length ? Math.max(...rows.map((r) => r.seq as number)) : 0,
              },
            ],
            rowCount: 1,
          };
        } else if (head.startsWith("DELETE FROM uc_stage WHERE seq >=")) {
          stage = stage.filter(
            (r) => !((r.seq as number) >= (params[0] as number) && r.series === params[1]),
          );
        } else if (head.startsWith("DELETE FROM uc_stage")) {
          stage = params[0] ? stage.filter((r) => r.series !== params[0]) : [];
        } else if (head.startsWith("SELECT lsoa_code, lsoa_name, series, reference_month")) {
          return {
            rows: stage
              .filter((r) => r.series === params[0])
              .sort((a, b) => (a.seq as number) - (b.seq as number)),
            rowCount: 0,
          };
        } else if (head.startsWith("SELECT loader, edition, expected")) {
          return { rows: [], rowCount: 0 };
        } else if (head.startsWith("INSERT INTO loader_checkpoint")) {
          return { rows: [], rowCount: 0 };
        } else if (head.startsWith("DELETE FROM loader_checkpoint")) {
          return { rows: [], rowCount: 0 };
        } else if (
          head.startsWith("DELETE FROM benefits_stats WHERE series = $1 AND reference_month = $2")
        ) {
          live = live.filter((r) => !(r.series === params[0] && r.reference_month === params[1]));
        } else if (head.startsWith("INSERT INTO benefits_stats")) {
          swaps += 1;
          if (failSecondSwap && swaps === 2) throw new Error("forced failure: the second swap");
          for (const row of stage.filter(
            (r) => r.series === params[0] && r.reference_month === params[2],
          ))
            live.push({
              ...row,
              pct: null,
              source_date: row.reference_month,
              loaded_at: params[1],
            });
        } else if (
          head.startsWith("DELETE FROM benefits_stats WHERE series = $1 AND reference_month NOT IN")
        ) {
          const months = [
            ...new Set(live.filter((r) => r.series === params[0]).map((r) => r.reference_month)),
          ]
            .sort()
            .reverse()
            .slice(0, 13);
          live = live.filter((r) => r.series !== params[0] || months.includes(r.reference_month));
        } else if (head === "COMMIT") snapshot = null;
        else if (head === "ROLLBACK") {
          if (snapshot) live = snapshot;
          snapshot = null;
        }
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    return { pool: { connect: async () => client }, live: () => live, sentinel };
  }

  it("a mid-swap failure files nothing, and the re-run completes the filing", async () => {
    const { rows } = await loadUcRows({ kind: "dir", dir: FIXTURE_DIR } as never);
    const fake = statefulPool({ failSecondSwap: true });
    const filer = await createUcFiler(fake.pool as never, "2026-11-23T00:00:00.000Z");
    await filer.stageRows(rows as never);
    await expect(filer.finishFiling()).rejects.toThrow("forced failure");
    await filer.abortFiling();
    // The whole filing rolled back: only the sentinel of
    // the earlier filing remains, untouched.
    expect(fake.live()).toEqual([fake.sentinel]);

    await fileUc(fake.pool as never, rows as never, "2026-11-23T00:00:00.000Z");
    const filed = fake.live().filter((r) => r.loaded_at === "2026-11-23T00:00:00.000Z");
    expect(filed).toHaveLength(rows.length);
    // The sentinel's month is outside every swapped pair
    // and inside the retained 13 months, so it survives.
    expect(fake.live()).toHaveLength(rows.length + 1);
  });
});
