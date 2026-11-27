// BUG-387 group C — census + dwp-uc + osm-places: page/chunk
// re-fetch on a short read, then the 1% tolerance where an
// independent expected count exists. Fail-before: every test
// here must fail on the unfixed loaders (the short read
// throws / the tolerance helper is absent / the re-download
// helper is absent) and pass on the fixed ones.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DATASETS,
  MSOA_COUNT,
  loadCensusRows,
  tolerateMsoaShortfall,
} from "../loaders/load-census.mjs";
import {
  DATABASES,
  fetchDiscovery,
  fixtureRoutes,
  pullUcSeries,
  streamUcRows,
  tableGeoCount,
} from "../loaders/load-dwp-uc.mjs";
import { downloadAndVerifyExtract } from "../loaders/load-osm-places.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STATXPLORE_API_KEY;
});

// --- census -----------------------------------------------------
//
// The live pull downloads seven ONS bulk zips. The tests
// stub fetch with STORE zips built here (yauzl reads them;
// no zip-writing dependency exists in the repo) around
// synthetic CSVs grown from the fixture's own headers and
// data rows: the three fixture MSOAs, sorted by code so
// every dataset maps each generated code to the same area
// name, cycled out to the national count.

const CENSUS_FIXTURE_DIR = join(process.cwd(), "tests/fixtures/census");

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(entries: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt32LE(0, 36);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralStart = offset;
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, ...central, end]);
}

function censusCsv(code: string, areas: number): string {
  const lines = readFileSync(join(CENSUS_FIXTURE_DIR, `census2021-${code}-msoa.csv`), "utf8")
    .trimEnd()
    .split("\n");
  const [header, ...dataRows] = lines;
  // The fixture lists the three MSOAs in a different order
  // per dataset; sorting by code gives every dataset the
  // same code → name mapping, which buildRows requires.
  const sorted = [...dataRows].sort((a, b) => (a.split(",")[2] < b.split(",")[2] ? -1 : 1));
  const out = [header];
  for (let i = 0; i < areas; i += 1) {
    const fields = sorted[i % sorted.length].split(",");
    fields[2] = `E02${String(i + 1).padStart(6, "0")}`;
    out.push(fields.join(","));
  }
  return `${out.join("\n")}\n`;
}

function censusFetchStub(plan: Record<string, number[]>) {
  const calls: Record<string, number> = {};
  const fetchStub = async (url: string) => {
    const code = /census2021-(ts\d+[a-z]?)\.zip/.exec(url)?.[1];
    if (!code) throw new Error(`unexpected census fetch ${url}`);
    calls[code] = (calls[code] ?? 0) + 1;
    const counts = plan[code] ?? [MSOA_COUNT];
    const n = counts[Math.min(calls[code] - 1, counts.length - 1)];
    const zip = zipStore([
      {
        name: `census2021-${code}-msoa.csv`,
        data: Buffer.from(censusCsv(code, n), "utf8"),
      },
    ]);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength),
    };
  };
  return { fetchStub, calls };
}

describe("census — a short dataset is re-downloaded once (BUG-387)", () => {
  it("a short ts007a dataset is re-downloaded once and the full 7,264 areas build", async () => {
    const { fetchStub, calls } = censusFetchStub({ ts007a: [7200, MSOA_COUNT] });
    vi.stubGlobal("fetch", fetchStub);
    const { rows, refetch } = await loadCensusRows(
      { kind: "live" },
      { fetchOpts: { delaysMs: [] } },
    );
    expect(rows).toHaveLength(MSOA_COUNT);
    expect(refetch.refetched).toBe(1);
    expect(refetch.recovered).toBe(64);
    expect(calls.ts007a).toBe(2);
    expect(Object.values(calls).filter((c) => c > 1)).toHaveLength(1);
  }, 30_000);

  it("a dataset that stays short after the re-download still fails — nothing partial builds", async () => {
    const { fetchStub, calls } = censusFetchStub({ ts007a: [7000, 7100] });
    vi.stubGlobal("fetch", fetchStub);
    await expect(loadCensusRows({ kind: "live" }, { fetchOpts: { delaysMs: [] } })).rejects.toThrow(
      /disagree on coverage/,
    );
    expect(calls.ts007a).toBe(2);
  }, 30_000);

  it("the fixture dir path never re-fetches — its 3 areas are a subset by design", async () => {
    const { rows, refetch } = await loadCensusRows({
      kind: "dir",
      dir: CENSUS_FIXTURE_DIR,
    });
    expect(rows).toHaveLength(3);
    expect(refetch.refetched).toBe(0);
    expect(refetch.recovered).toBe(0);
  });

  it("every dataset is in the registry the re-fetch walks", () => {
    expect(DATASETS.map((d) => d.code)).toEqual([
      "ts007a",
      "ts007",
      "ts021",
      "ts030",
      "ts044",
      "ts052",
      "ts054",
    ]);
  });
});

describe("census — the MSOA_COUNT gate's 1% tolerance (BUG-387)", () => {
  const msoaFailure = (n: number) =>
    `the load holds ${n} areas, expected exactly ${MSOA_COUNT} MSOAs`;
  const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ msoaCode: `E020${i}` }));

  it("drops the MSOA failure within 1% and returns the loud notice", () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-census",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const { failures, notice } = tolerateMsoaShortfall({
      rows: rowsOf(7200),
      golden: [msoaFailure(7200), "some other failure"],
      progress,
    });
    expect(failures).toEqual(["some other failure"]);
    expect(notice).toMatch(/read 7,200 of 7,264 expected census/);
    expect(notice).toMatch(/accepted within the 1% tolerance \(BUG-387\)/);
    expect(lines.some((l) => /read shortfall accepted \(BUG-387\)/.test(l))).toBe(true);
  });

  it("keeps the MSOA failure over 1% short", () => {
    const { failures, notice } = tolerateMsoaShortfall({
      rows: rowsOf(7100),
      golden: [msoaFailure(7100)],
    });
    expect(failures).toEqual([msoaFailure(7100)]);
    expect(notice).toBeNull();
  });

  it("leaves golden failures alone when the read is exact", () => {
    const { failures, notice } = tolerateMsoaShortfall({
      rows: rowsOf(MSOA_COUNT),
      golden: ["some other failure"],
    });
    expect(failures).toEqual(["some other failure"]);
    expect(notice).toBeNull();
  });
});

// --- dwp-uc -------------------------------------------------------
//
// The series pull is one Stat-Xplore table POST. The tests
// stub fetch on the direct route (STATXPLORE_API_KEY set)
// with synthetic table JSONs at the real scale — the band
// is 35,000–36,500 LSOAs, so a fixture-scale response would
// trip the re-fetch on every call.

const DWP_FIXTURE_DIR = join(process.cwd(), "tests/fixtures/dwp-uc");
const PEOPLE = DATABASES[0] as never;
const HOUSEHOLDS = DATABASES[1] as never;
const MEASURE = "str:count:UC_Monthly:V_F_UC_CASELOAD_FULL";
const DATE_FIELD = "str:field:UC_Monthly:F_UC_DATE:DATE_NAME";
const GEO_FIELD = "str:field:UC_Monthly:V_F_UC_CASELOAD_FULL:COA_CODE";

async function peopleDiscovery() {
  const tableJson = JSON.parse(readFileSync(join(DWP_FIXTURE_DIR, "uc-people-table.json"), "utf8"));
  return fetchDiscovery(PEOPLE, fixtureRoutes(DWP_FIXTURE_DIR, PEOPLE, tableJson));
}

function ucTableJson(geoCount: number) {
  const items = [];
  for (let i = 0; i < geoCount; i += 1) {
    const code = `E01${String(i + 1).padStart(6, "0")}`;
    items.push({
      type: "RecodeItem",
      uris: [
        `str:value:UC_Monthly:V_F_UC_CASELOAD_FULL:COA_CODE:V_C_MASTERGEOG21_LSOA_TO_MSOA:${code}`,
      ],
      labels: [`Area ${i + 1}`],
    });
  }
  return {
    fields: [
      {
        uri: DATE_FIELD,
        label: "Month",
        items: [
          {
            type: "RecodeItem",
            uris: ["str:value:UC_Monthly:F_UC_DATE:DATE_NAME:C_UC_DATE:202605"],
            labels: ["May 2026"],
          },
        ],
      },
      { uri: GEO_FIELD, label: "National - Regional - LA - OAs", items },
    ],
    cubes: { [MEASURE]: { values: [new Array(geoCount).fill(1)] } },
  };
}

function ucFetchStub(queue: unknown[]) {
  let calls = 0;
  const fetchStub = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => queue[Math.min(calls - 1, queue.length - 1)],
    };
  };
  return { fetchStub, calls: () => calls };
}

describe("dwp-uc — a short series pull is re-POSTed once (BUG-387)", () => {
  it("a short series pull is re-POSTed once and the fuller response stands", async () => {
    process.env.STATXPLORE_API_KEY = "test-key";
    const { fetchStub, calls } = ucFetchStub([ucTableJson(34900), ucTableJson(35672)]);
    vi.stubGlobal("fetch", fetchStub);
    const discovery = await peopleDiscovery();
    const { rows, refetch } = await pullUcSeries(PEOPLE, {
      months: ["2026-05"],
      discovery,
      fetchOpts: { delaysMs: [] },
    });
    expect(rows).toHaveLength(35672);
    expect(calls()).toBe(2);
    expect(refetch).toEqual({
      series: "uc_people",
      months: ["2026-05"],
      first: 34900,
      recovered: 772,
    });
  });

  it("a re-POST that returns fewer keeps the first response", async () => {
    process.env.STATXPLORE_API_KEY = "test-key";
    const { fetchStub, calls } = ucFetchStub([ucTableJson(34900), ucTableJson(34800)]);
    vi.stubGlobal("fetch", fetchStub);
    const discovery = await peopleDiscovery();
    const { rows, refetch } = await pullUcSeries(PEOPLE, {
      months: ["2026-05"],
      discovery,
      fetchOpts: { delaysMs: [] },
    });
    expect(rows).toHaveLength(34900);
    expect(calls()).toBe(2);
    expect(refetch).toBeNull();
  });

  it("the verify pull (lsoaCodes) never re-posts — its handful of areas is by design", async () => {
    process.env.STATXPLORE_API_KEY = "test-key";
    const { fetchStub, calls } = ucFetchStub([ucTableJson(3)]);
    vi.stubGlobal("fetch", fetchStub);
    const discovery = await peopleDiscovery();
    const { rows } = await pullUcSeries(PEOPLE, {
      months: ["2026-05"],
      lsoaCodes: ["E01000001"],
      discovery,
      fetchOpts: { delaysMs: [] },
    });
    expect(rows).toHaveLength(3);
    expect(calls()).toBe(1);
  });

  it("tableGeoCount reads the geography axis, and null on a malformed response", async () => {
    const discovery = await peopleDiscovery();
    expect(tableGeoCount(ucTableJson(5), discovery)).toBe(5);
    expect(tableGeoCount({ unexpected: true }, discovery)).toBeNull();
    expect(tableGeoCount({ fields: [], cubes: {} }, discovery)).toBeNull();
  });
});

// The streaming pull is the path main() actually files
// through, so it gets its own test: fetch is stubbed at the
// Stat-Xplore surface — schema nodes from the fixture
// captures, table POSTs from expanded copies of the real
// fixture tables (same URIs, grown to the national scale).
function expandTableJson(file: string, geoCount: number) {
  const json = JSON.parse(readFileSync(join(DWP_FIXTURE_DIR, file), "utf8"));
  const geoField = json.fields[1];
  const baseItems = geoField.items as { uris: string[]; labels: string[] }[];
  const items = [];
  for (let i = 0; i < geoCount; i += 1) {
    const base = baseItems[i % baseItems.length];
    const code = `E01${String(i + 1).padStart(6, "0")}`;
    items.push({
      ...base,
      uris: [base.uris[0].replace(/[EW]01\d{6}$/, code)],
      labels: [`Area ${i + 1}`],
    });
  }
  geoField.items = items;
  // One month is enough: the re-fetch turns on the geography
  // axis, and a single month keeps the drain at 35,672 rows
  // per series instead of three times that.
  json.fields[0].items = [json.fields[0].items[0]];
  const measure = Object.keys(json.cubes)[0];
  const firstRow = (json.cubes[measure].values as number[][])[0];
  const out = [];
  for (let i = 0; i < geoCount; i += 1) out.push(firstRow[i % firstRow.length]);
  json.cubes[measure].values = [out];
  return json;
}

describe("dwp-uc — the streaming pull re-POSTs a short series before draining (BUG-387)", () => {
  it("both series re-POST once and only the fuller responses are drained", async () => {
    process.env.STATXPLORE_API_KEY = "test-key";
    const byId = new Map<string, unknown>();
    for (const file of [
      "uc-monthly-database.json",
      "uc-monthly-date-field.json",
      "uc-monthly-date-valueset.json",
      "uc-monthly-geography-group.json",
      "uc-monthly-coa-field.json",
      "uc-monthly-lsoa-valueset.json",
      "uc-households-database.json",
      "uc-households-date-field.json",
      "uc-households-date-valueset.json",
      "uc-households-geography-group.json",
      "uc-households-coa-field.json",
      "uc-households-lsoa-valueset.json",
    ]) {
      const node = JSON.parse(readFileSync(join(DWP_FIXTURE_DIR, "schema", file), "utf8")) as {
        id: string;
      };
      byId.set(node.id, node);
    }
    const queues: Record<string, unknown[]> = {
      "str:count:UC_Monthly:V_F_UC_CASELOAD_FULL": [
        expandTableJson("uc-people-table.json", 34900),
        expandTableJson("uc-people-table.json", 35672),
      ],
      "str:count:UC_Households:V_F_UC_HOUSEHOLDS": [
        expandTableJson("uc-households-table.json", 34900),
        expandTableJson("uc-households-table.json", 35672),
      ],
    };
    let tablePosts = 0;
    vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
      if (url.includes("/schema/")) {
        const id = decodeURIComponent(url.split("/schema/")[1]);
        const node = byId.get(id);
        if (!node) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => node };
      }
      tablePosts += 1;
      const body = JSON.parse(init?.body ?? "{}") as { measures?: string[] };
      const measure = body.measures?.[0] ?? "";
      const queue = queues[measure];
      if (!queue) throw new Error(`unexpected table POST for ${measure}`);
      return { ok: true, status: 200, json: async () => queue.shift() };
    });
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-dwp-uc",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const streamed: unknown[] = [];
    await streamUcRows(
      { kind: "live" },
      {},
      async (batch: unknown[]) => {
        streamed.push(...batch);
      },
      { progress },
    );
    // Each series drained only its fuller response: 1 month
    // × 35,672 LSOAs, twice over.
    expect(streamed).toHaveLength(2 * 35672);
    expect(tablePosts).toBe(4);
    expect(lines.filter((l) => /short series pull re-posted \(BUG-387\)/.test(l))).toHaveLength(2);
    expect(lines.filter((l) => /short series pull recovered \(BUG-387\)/.test(l))).toHaveLength(2);
  }, 30_000);
});

// --- osm-places ---------------------------------------------------
//
// The extract is the chunk: a download that completes but
// is truncated fails only its md5, so the re-download is
// proven at downloadAndVerifyExtract with stubbed fetch
// serving byte streams (first wrong, then right).

describe("osm-places — a download that fails its md5 is re-downloaded once (BUG-387)", () => {
  const good = Buffer.from("good-extract-bytes");
  const bad = Buffer.from("bad-extract-bytes");
  const published = createHash("md5").update(good).digest("hex");

  function runExtract(
    serve: () => Buffer,
    progress: ReturnType<typeof createProgressLogger> | null = null,
  ) {
    const dir = mkdtempSync(join(tmpdir(), "bug387-osm-"));
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response(new Uint8Array(serve()));
    });
    const dest = join(dir, "england.osm.pbf");
    const promise = downloadAndVerifyExtract(
      "england",
      "https://example.invalid/england-latest.osm.pbf",
      dest,
      published,
      progress ? { progress } : {},
    );
    return {
      dir,
      dest,
      calls: () => calls,
      promise: promise.finally(() => rmSync(dir, { recursive: true, force: true })),
    };
  }

  it("a first download that fails its md5 is re-downloaded once and verifies", async () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-osm-places",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    let first = true;
    const run = runExtract(() => {
      if (first) {
        first = false;
        return bad;
      }
      return good;
    }, progress);
    await run.promise;
    expect(run.calls()).toBe(2);
    expect(lines.some((l) => /re-downloading once \(BUG-387\)/.test(l))).toBe(true);
  });

  it("two failed downloads throw the refusing-to-file message", async () => {
    const run = runExtract(() => bad);
    await expect(run.promise).rejects.toThrow(/refusing to file from an unverified extract/);
    expect(run.calls()).toBe(2);
  });

  it("a first download that verifies is never re-downloaded", async () => {
    const run = runExtract(() => good);
    await run.promise;
    expect(run.calls()).toBe(1);
  });
});
