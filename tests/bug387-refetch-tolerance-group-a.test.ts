// BUG-387: re-fetch short pages — ArcGIS trio + claimant count (group A).
//
// Verdicts (surveyed before building; the loader comments say the same):
//   - load-aqma, load-built-up-areas, load-claimant-count: no independent
//     expected exists (ArcGIS publishes no count; Nomis publishes none),
//     so a page is short when it returns fewer than PAGE_SIZE rows while
//     returning any at all, and a short page stays the loop terminator.
//     The 1% tolerance does NOT apply to any of the three: it is subsumed
//     by each loader's own ±10% band (AQMA 337–411 of the 374 snapshot;
//     built-up areas 7,000–8,500 of the published 7,775; claimant count
//     35,000–36,500 LSOAs a month around the published 35,672) — a read
//     within 1% of the snapshot can never change the band's verdict, so
//     no tolerance is added and the bands stay inline, byte-identical.
//     What is tested here, per loader: (b) a short page recovered by the
//     one re-fetch files complete, with the re-fetch logged; a page the
//     re-fetch cannot recover still ends the read short (the band, in
//     main, is what refuses it); an empty page is never re-fetched; and
//     a recovered full page continues paging. (a)/(c)/(d) in the task's
//     terms are the band's, already pinned by the existing tests — the
//     fail-before for the re-fetch itself is each (b) test run against
//     the unfixed loader, where the same scripted service ends the read
//     at the short page.
import { afterEach, describe, expect, it } from "vitest";
import { readLive as readAqmaLive } from "../loaders/load-aqma.mjs";
import { readLive as readBuaLive } from "../loaders/load-built-up-areas.mjs";
import { loadClaimantRows, pullClaimantNational } from "../loaders/load-claimant-count.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
function okText(body: string) {
  return {
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("not json");
    },
    text: async () => body,
  };
}
function collectProgress() {
  const lines: string[] = [];
  return {
    lines,
    progress: createProgressLogger({
      name: "bug387-group-a",
      log: (line: string) => lines.push(line),
    }),
  };
}

const POLYGON = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0.01, 0],
      [0.01, 0.01],
      [0, 0.01],
      [0, 0],
    ],
  ],
};

function aqmaFeature(ref: number) {
  return {
    properties: {
      AQMA_REF: ref,
      TITLE: `Area ${ref}`,
      LOCAL_AUTH: "Test Council",
      NO2: 1,
      PM10: 0,
      SO2: 0,
      BENZENE: 0,
      LA_ONS_ID: "E08000001",
    },
    geometry: POLYGON,
  };
}
function aqmaFeatures(from: number, n: number) {
  return Array.from({ length: n }, (_, i) => aqmaFeature(from + i));
}

// A stubbed Defra UK-AIR service with scripted pages: pages[offset] is
// the list of successive page bodies that offset answers, in order. An
// unscripted offset answers an empty page.
function aqmaService(pages: Record<number, unknown[][]>) {
  const requests: number[] = [];
  const stub = async (url: unknown) => {
    const u = String(url);
    if (u.includes("/query")) {
      const offset = Number(new URL(u).searchParams.get("resultOffset") ?? "0");
      requests.push(offset);
      const script = pages[offset] ?? [];
      const body = script.shift();
      return okJson({ features: body ?? [] });
    }
    return okJson({ serviceDescription: "AQMA boundaries. Published: 2026_10_20" });
  };
  return { stub, requests };
}

describe("load-aqma re-fetches a short page (BUG-387)", () => {
  it("(b) a short page recovered by the re-fetch files complete", async () => {
    const { stub, requests } = aqmaService({
      0: [aqmaFeatures(1, 2), aqmaFeatures(1, 3)],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const { lines, progress } = collectProgress();
    const result = await readAqmaLive({ delaysMs: [], progress });
    expect(result.total).toBe(3);
    expect(result.filed).toBe(3);
    expect(result.refetch.refetched).toBe(1);
    expect(result.refetch.recovered).toBe(1);
    expect(requests).toEqual([0, 0]);
    expect(lines.some((l) => l.includes("warning · short page re-fetched (BUG-387)"))).toBe(true);
  });

  it("a short page the re-fetch cannot recover still ends the read short", async () => {
    const { stub, requests } = aqmaService({
      0: [aqmaFeatures(1, 2), aqmaFeatures(1, 2)],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const result = await readAqmaLive({ delaysMs: [] });
    expect(result.total).toBe(2);
    expect(result.refetch.refetched).toBe(1);
    expect(result.refetch.recovered).toBe(0);
    expect(requests).toEqual([0, 0]);
  });

  it("an empty page is never re-fetched", async () => {
    const { stub, requests } = aqmaService({ 0: [[]] });
    globalThis.fetch = stub as unknown as typeof fetch;
    const result = await readAqmaLive({ delaysMs: [] });
    expect(result.total).toBe(0);
    expect(result.refetch.refetched).toBe(0);
    expect(requests).toEqual([0]);
  });

  it("a recovered full page continues paging", async () => {
    const { stub, requests } = aqmaService({
      0: [aqmaFeatures(1, 1500), aqmaFeatures(1, 2000)],
      // No independent expected exists, so the genuine final page
      // earns one re-fetch too — it comes back the same, and the
      // read still ends there.
      2000: [aqmaFeatures(2001, 3), aqmaFeatures(2001, 3)],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const result = await readAqmaLive({ delaysMs: [] });
    expect(result.total).toBe(2003);
    expect(result.filed).toBe(2003);
    expect(result.refetch.refetched).toBe(2);
    expect(result.refetch.recovered).toBe(500);
    expect(requests).toEqual([0, 0, 2000, 2000]);
  });
});

function buaFeature(i: number) {
  return {
    properties: { BUA24CD: `E630${String(i).padStart(5, "0")}`, BUA24NM: `Area ${i}` },
    geometry: POLYGON,
  };
}
function buaFeatures(from: number, n: number) {
  return Array.from({ length: n }, (_, k) => buaFeature(from + k));
}

// A stubbed ONS ArcGIS service, scripted as the AQMA one above.
function buaService(pages: Record<number, unknown[][]>) {
  const requests: number[] = [];
  const stub = async (url: unknown) => {
    const u = String(url);
    const offset = Number(new URL(u).searchParams.get("resultOffset") ?? "0");
    requests.push(offset);
    const script = pages[offset] ?? [];
    const body = script.shift();
    return okJson({ features: body ?? [] });
  };
  return { stub, requests };
}

describe("load-built-up-areas re-fetches a short page (BUG-387)", () => {
  it("(b) a short page recovered by the re-fetch files complete", async () => {
    const { stub, requests } = buaService({
      0: [buaFeatures(1, 1500), buaFeatures(1, 2000)],
      2000: [buaFeatures(2001, 2000)],
      4000: [buaFeatures(4001, 1775), buaFeatures(4001, 1775)],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const { lines, progress } = collectProgress();
    const result = await readBuaLive({ delaysMs: [], progress });
    expect(result.total).toBe(5775);
    expect(result.filed).toBe(5775);
    expect(result.geoless).toBe(0);
    expect(result.refetch.refetched).toBe(2);
    expect(result.refetch.recovered).toBe(500);
    expect(requests).toEqual([0, 0, 2000, 4000, 4000]);
    expect(lines.some((l) => l.includes("warning · short page re-fetched (BUG-387)"))).toBe(true);
  });

  it("a short page the re-fetch cannot recover still ends the read short", async () => {
    const { stub, requests } = buaService({
      0: [buaFeatures(1, 1500), buaFeatures(1, 1500)],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const result = await readBuaLive({ delaysMs: [] });
    expect(result.total).toBe(1500);
    expect(result.refetch.refetched).toBe(1);
    expect(result.refetch.recovered).toBe(0);
    expect(requests).toEqual([0, 0]);
  });

  it("the genuine final page is re-fetched once, harmlessly", async () => {
    // No independent expected exists, so the loader cannot tell
    // the tail from a truncation: the tail earns one re-fetch,
    // comes back the same, and the read ends there.
    const { stub, requests } = buaService({
      0: [buaFeatures(1, 2000)],
      2000: [buaFeatures(2001, 1775), buaFeatures(2001, 1775)],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const result = await readBuaLive({ delaysMs: [] });
    expect(result.total).toBe(3775);
    expect(result.filed).toBe(3775);
    expect(result.refetch.refetched).toBe(1);
    expect(result.refetch.recovered).toBe(0);
    expect(requests).toEqual([0, 2000, 2000]);
  });
});

const CLAIMANT_HEADER =
  "DATE_CODE,GEOGRAPHY_CODE,GEOGRAPHY_NAME,GEOGRAPHY_TYPE,MEASURE_CODE,OBS_VALUE,OBS_STATUS";
function claimantCsv(month: string, lsoas: { code: string; name: string }[]) {
  const lines = [CLAIMANT_HEADER];
  for (const lsoa of lsoas) {
    lines.push(`${month},${lsoa.code},${lsoa.name},2021 super output areas - lower layer,1,15,A`);
    lines.push(`${month},${lsoa.code},${lsoa.name},2021 super output areas - lower layer,2,1.6,A`);
  }
  return lines.join("\n");
}
const LSOA_A = { code: "E01000001", name: "Test 001A" };
const LSOA_B = { code: "E01000002", name: "Test 001B" };

// A stubbed Nomis service with scripted pages: pages["<date>|<offset>"]
// is the list of successive CSV bodies that page answers, in order. An
// unscripted page answers a header-only CSV.
function nomisService(pages: Record<string, string[]>) {
  const requests: { selector: string; offset: number }[] = [];
  const stub = async (url: unknown) => {
    const u = new URL(String(url));
    const selector = u.searchParams.get("date") ?? "";
    const offset = Number(u.searchParams.get("recordOffset") ?? "0");
    requests.push({ selector, offset });
    const script = pages[`${selector}|${offset}`] ?? [];
    const body = script.shift();
    return okText(body ?? CLAIMANT_HEADER);
  };
  return { stub, requests };
}

describe("load-claimant-count re-fetches a short page (BUG-387)", () => {
  it("(b) a short page recovered by the re-fetch pulls complete", async () => {
    const { stub, requests } = nomisService({
      "2026-09|0": [claimantCsv("2026-09", [LSOA_A]), claimantCsv("2026-09", [LSOA_A, LSOA_B])],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const { lines, progress } = collectProgress();
    const pulled = await pullClaimantNational("2026-09", {
      progress,
      fetchOpts: { delaysMs: [] },
    });
    expect(pulled.rows.map((r) => r.lsoaCode)).toEqual(["E01000001", "E01000002"]);
    expect(pulled.refetch.refetched).toBe(1);
    expect(pulled.refetch.recovered).toBe(2);
    expect(requests).toEqual([
      { selector: "2026-09", offset: 0 },
      { selector: "2026-09", offset: 0 },
    ]);
    expect(lines.some((l) => l.includes("warning · short page re-fetched (BUG-387)"))).toBe(true);
  });

  it("a short page the re-fetch cannot recover still ends the pull short", async () => {
    const { stub, requests } = nomisService({
      "2026-09|0": [claimantCsv("2026-09", [LSOA_A]), claimantCsv("2026-09", [LSOA_A])],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const pulled = await pullClaimantNational("2026-09", { fetchOpts: { delaysMs: [] } });
    expect(pulled.rows.map((r) => r.lsoaCode)).toEqual(["E01000001"]);
    expect(pulled.refetch.refetched).toBe(1);
    expect(pulled.refetch.recovered).toBe(0);
    expect(requests).toHaveLength(2);
  });

  it("the fuller first page wins when the re-fetch returns fewer", async () => {
    const { stub } = nomisService({
      "2026-09|0": [claimantCsv("2026-09", [LSOA_A, LSOA_B]), claimantCsv("2026-09", [LSOA_A])],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const pulled = await pullClaimantNational("2026-09", { fetchOpts: { delaysMs: [] } });
    expect(pulled.rows.map((r) => r.lsoaCode)).toEqual(["E01000001", "E01000002"]);
    expect(pulled.refetch.refetched).toBe(1);
    expect(pulled.refetch.recovered).toBe(0);
  });

  it("an empty page is never re-fetched", async () => {
    const { stub, requests } = nomisService({ "2026-09|0": [CLAIMANT_HEADER] });
    globalThis.fetch = stub as unknown as typeof fetch;
    await expect(pullClaimantNational("2026-09", { fetchOpts: { delaysMs: [] } })).rejects.toThrow(
      "the Claimant Count response is empty",
    );
    expect(requests).toHaveLength(1);
  });

  it("loadClaimantRows carries the per-month re-fetch record through", async () => {
    const { stub } = nomisService({
      "latest|0": [claimantCsv("2026-09", [LSOA_A]), claimantCsv("2026-09", [LSOA_A, LSOA_B])],
      "latestMINUS1|0": [
        claimantCsv("2026-08", [LSOA_A]),
        claimantCsv("2026-08", [LSOA_A, LSOA_B]),
      ],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const { rows, refetch } = await loadClaimantRows(
      { kind: "live" },
      { fetchOpts: { delaysMs: [] } },
    );
    expect(rows).toHaveLength(4);
    expect(refetch).toHaveLength(2);
    expect(refetch[0].month).toBe("latest");
    expect(refetch[0].refetched).toBe(1);
    expect(refetch[1].month).toBe("latestMINUS1");
    expect(refetch[1].refetched).toBe(1);
  });
});
