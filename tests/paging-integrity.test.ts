import { afterEach, describe, expect, it, vi } from "vitest";
import { readPhiPages } from "../loaders/load-priority-habitats.mjs";
import { readServiceLive } from "../loaders/load-nature-designations.mjs";
import { readLive as readFloodZonesLive } from "../loaders/load-flood-zones.mjs";
import { readLive as readFloodRiversSeaLive } from "../loaders/load-flood-rivers-sea.mjs";
import { readLive as readFloodSurfaceWaterLive } from "../loaders/load-flood-surface-water.mjs";
import { neCount, probeAncientWoodlandRevised, probeFloodProduct } from "../loaders/canary.mjs";

// Guards the paging-integrity fix of 13 Nov 2026 (diagnosis:
// scratch-nature/PHI-DIAGNOSIS.md). ArcGIS reports query
// failures as an HTTP 200 body carrying an `error` member and
// no `features` member; the PHI loop read one such body as an
// empty page — end of data — and a live verify-only read
// stopped at exactly 392 x 2000 = 784,000 of 818,225 patches.
// The reconcile guard caught it and filed nothing, but every
// paged read now validates each page INSIDE its retry
// boundary: the count taken at the start is the contract, a
// bad page is re-requested at the SAME offset, and a page that
// never comes good fails the read loudly — never silently
// truncates it. These tests drive the loaders' own paging
// entry points against stubbed page sources.

const FAST = [0, 0, 0];
const ERROR_ENVELOPE = {
  error: { code: 400, message: "Unable to complete operation.", details: [] },
};

function stubFetch(route: (url: string) => unknown) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    const body = route(url);
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    };
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- priority habitats (ArcGIS, count-driven) -----------------

const PHI_LAYER = "https://example.test/phi/FeatureServer/0";
const phiFeature = (objectId: number) => ({ properties: { OBJECTID: objectId }, geometry: null });
function phiPage(firstObjectId: number, count: number, final: boolean) {
  const features = Array.from({ length: count }, (_, i) => phiFeature(firstObjectId + i));
  return final ? { features } : { features, properties: { exceededTransferLimit: true } };
}
// A healthy 4,500-patch service at the loader's 2,000 page size.
function phiRoute(fault?: (offset: number, attempt: number) => unknown) {
  const attempts = new Map<number, number>();
  return (url: string) => {
    const offset = Number(new URL(url).searchParams.get("resultOffset"));
    const attempt = (attempts.get(offset) ?? 0) + 1;
    attempts.set(offset, attempt);
    const faulty = fault?.(offset, attempt);
    if (faulty !== undefined) return faulty;
    if (offset === 0) return phiPage(1, 2000, false);
    if (offset === 2000) return phiPage(2001, 2000, false);
    if (offset === 4000) return phiPage(4001, 500, true);
    throw new Error(`unexpected offset ${offset}`);
  };
}

describe("priority habitats paging (the count is the contract)", () => {
  it("retries an error-envelope page in place and completes the read", async () => {
    const calls = stubFetch(
      phiRoute((offset, attempt) =>
        offset === 2000 && attempt === 1 ? ERROR_ENVELOPE : undefined,
      ),
    );
    const delivered: number[] = [];
    const read = await readPhiPages(
      PHI_LAYER,
      4500,
      async (batch: unknown[]) => {
        delivered.push(batch.length);
      },
      { delaysMs: FAST },
    );
    expect(read).toBe(4500);
    expect(delivered).toEqual([2000, 2000, 500]);
    const offset2000Calls = calls.filter((url) => url.includes("resultOffset=2000")).length;
    expect(offset2000Calls).toBe(2);
  });

  it("fails loudly — never silently truncates — when a page keeps erroring", async () => {
    stubFetch(phiRoute((offset) => (offset === 2000 ? ERROR_ENVELOPE : undefined)));
    const delivered: number[] = [];
    await expect(
      readPhiPages(
        PHI_LAYER,
        4500,
        async (batch: unknown[]) => {
          delivered.push(batch.length);
        },
        { delaysMs: FAST },
      ),
    ).rejects.toThrow(/Unable to complete operation/);
    // Only the first page was ever delivered; the read did not
    // resolve short and call itself done.
    expect(delivered).toEqual([2000]);
  });

  it("retries a short non-final page at the same offset", async () => {
    const calls = stubFetch(
      phiRoute((offset, attempt) =>
        offset === 2000 && attempt === 1 ? phiPage(2001, 1500, false) : undefined,
      ),
    );
    const read = await readPhiPages(PHI_LAYER, 4500, async () => {}, { delaysMs: FAST });
    expect(read).toBe(4500);
    const offset2000Calls = calls.filter((url) => url.includes("resultOffset=2000")).length;
    expect(offset2000Calls).toBe(2);
  });

  it("fails when a non-final page does not restate exceededTransferLimit", async () => {
    stubFetch(
      phiRoute((offset) =>
        offset === 0 ? { features: phiPage(1, 2000, false).features } : undefined,
      ),
    );
    await expect(readPhiPages(PHI_LAYER, 4500, async () => {}, { delaysMs: FAST })).rejects.toThrow(
      /exceededTransferLimit/,
    );
  });

  it("fails when OBJECTID order breaks mid-read", async () => {
    stubFetch(phiRoute((offset) => (offset === 2000 ? phiPage(1500, 2000, false) : undefined)));
    await expect(readPhiPages(PHI_LAYER, 4500, async () => {}, { delaysMs: FAST })).rejects.toThrow(
      /OBJECTID ordering broke/,
    );
  });
});

// --- nature designations (ArcGIS, count-driven) ---------------

const NATURE_SPEC = { service: "Test_Service", fields: ["OBJECTID", "NAME"], pageCap: 2 };
function natureRoute(fault?: (offset: number, attempt: number) => unknown) {
  const attempts = new Map<number, number>();
  const feature = (objectId: number) => ({
    properties: { OBJECTID: objectId, NAME: `site ${objectId}` },
    geometry: null,
  });
  return (url: string) => {
    if (!url.includes("/query?")) {
      return {
        fields: [{ name: "OBJECTID" }, { name: "NAME" }],
        maxRecordCount: 2,
        editingInfo: { dataLastEditDate: Date.UTC(2026, 10, 12) },
      };
    }
    if (url.includes("returnCountOnly=true")) return { count: 5 };
    const offset = Number(new URL(url).searchParams.get("resultOffset"));
    const attempt = (attempts.get(offset) ?? 0) + 1;
    attempts.set(offset, attempt);
    const faulty = fault?.(offset, attempt);
    if (faulty !== undefined) return faulty;
    if (offset === 0) return { features: [feature(1), feature(2)] };
    if (offset === 2) return { features: [feature(3), feature(4)] };
    if (offset === 4) return { features: [feature(5)] };
    throw new Error(`unexpected offset ${offset}`);
  };
}

describe("nature designations paging", () => {
  it("retries an error-envelope page in place and completes the read", async () => {
    stubFetch(
      natureRoute((offset, attempt) =>
        offset === 2 && attempt === 1 ? ERROR_ENVELOPE : undefined,
      ),
    );
    const result = await readServiceLive(NATURE_SPEC, { delaysMs: FAST });
    expect(result.features).toHaveLength(5);
    expect(result.expected).toBe(5);
    expect(result.sourceDate).toBe("2026-11-12");
  });

  it("fails loudly when a page keeps erroring", async () => {
    stubFetch(natureRoute((offset) => (offset === 0 ? ERROR_ENVELOPE : undefined)));
    await expect(readServiceLive(NATURE_SPEC, { delaysMs: FAST })).rejects.toThrow(
      /Unable to complete operation/,
    );
  });

  it("retries a short non-final page at the same offset", async () => {
    stubFetch(
      natureRoute((offset, attempt) =>
        offset === 2 && attempt === 1
          ? { features: [{ properties: { OBJECTID: 3, NAME: "site 3" }, geometry: null }] }
          : undefined,
      ),
    );
    const result = await readServiceLive(NATURE_SPEC, { delaysMs: FAST });
    expect(result.features).toHaveLength(5);
  });
});

// --- flood products (OGC, numberMatched-driven) ---------------

const SQUARE = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
      [0, 0],
    ],
  ],
};

function floodRoute(collection: string, feature: unknown, fault: (attempt: number) => unknown) {
  let pageAttempts = 0;
  return (url: string) => {
    if (url.includes("GetCapabilities"))
      return `<Layer><Name>${collection}_03_11_2026</Name></Layer>`;
    if (url.includes("startIndex=")) {
      pageAttempts += 1;
      const faulty = fault(pageAttempts);
      if (faulty !== undefined) return faulty;
      return { numberMatched: 3, features: [feature, feature, feature] };
    }
    if (url.includes("limit=1&")) return { numberMatched: 3 };
    throw new Error(`unexpected url ${url}`);
  };
}

const FLOOD_LOADERS = [
  {
    name: "flood zones",
    readLive: readFloodZonesLive,
    collection: "Flood_Zones_2_3_Rivers_and_Sea",
    feature: {
      properties: { flood_zone: "FZ3", flood_source: "river", origin: "modelled" },
      geometry: SQUARE,
    },
  },
  {
    name: "flood rivers & sea",
    readLive: readFloodRiversSeaLive,
    collection: "rofrs_4band",
    feature: { properties: { risk_band: "Low" }, geometry: SQUARE },
  },
  {
    name: "flood surface water",
    readLive: readFloodSurfaceWaterLive,
    collection: "rofsw",
    feature: { properties: { risk_band: "Low" }, geometry: SQUARE },
  },
];

describe.each(FLOOD_LOADERS)("$name paging", ({ readLive, collection, feature }) => {
  it("retries a featureless error page in place and completes the read", async () => {
    stubFetch(floodRoute(collection, feature, (attempt) => (attempt === 1 ? {} : undefined)));
    const result = await readLive({ delaysMs: FAST });
    expect(result.read).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it("fails loudly when every page comes back featureless", async () => {
    stubFetch(floodRoute(collection, feature, () => ({})));
    await expect(readLive({ delaysMs: FAST })).rejects.toThrow(/count moved|features array/);
  });
});

// --- canary probes ---------------------------------------------

describe("canary probes read an error envelope as a failure", () => {
  it("neCount rejects an error envelope instead of reporting a count", async () => {
    stubFetch(() => ERROR_ENVELOPE);
    await expect(neCount("SSSI_England")).rejects.toThrow(/error envelope/);
  });

  it("the revised-woodland probe fails when the layer metadata is an error envelope", async () => {
    stubFetch((url) => (url.includes("/query?") ? { count: 50000 } : ERROR_ENVELOPE));
    await expect(probeAncientWoodlandRevised()).rejects.toThrow(/error envelope/);
  });

  it("the flood-zones probe fails when the Exeter anchor is an error envelope", async () => {
    stubFetch((url) => {
      if (url.includes("/collections?f=json"))
        return { collections: [{ id: "Flood_Zones_2_3_Rivers_and_Sea" }] };
      if (url.includes("limit=1&")) return { numberMatched: 415408 };
      if (url.includes("bbox=")) return ERROR_ENVELOPE;
      throw new Error(`unexpected url ${url}`);
    });
    await expect(probeFloodProduct("flood-zones")).rejects.toThrow(/error envelope/);
  });
});
