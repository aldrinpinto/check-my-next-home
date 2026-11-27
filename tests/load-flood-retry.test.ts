// Flood fetch retry — a transient fetch failure is retried
// for up to 30 minutes (TRANSIENT_RETRY_BUDGET_MS, BUG-384
// cap, founder-ordered 27 Nov 2026); a non-transient
// transport failure fails at once, and a page whose body
// fails the contract is re-requested within the delays
// budget and then fails loudly (BUG-384). The failing case
// is the BUG-381 kill: the old 5-attempt page budget died
// after ~3 minutes of connect timeouts and took a 5-hour
// read with it.
import { afterEach, describe, expect, it } from "vitest";
import { isTransientFetchError } from "../loaders/flood-resume.mjs";
import { readLive as readZonesLive } from "../loaders/load-flood-zones.mjs";
import { readLive as readRiversSeaLive } from "../loaders/load-flood-rivers-sea.mjs";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ZONES_WMS =
  "<WMS_Capabilities><Capability><Layer><Name>Flood_Zones_2_3_Rivers_and_Sea_21_10_2026</Name></Layer></Capability></WMS_Capabilities>";
const RIVERS_WMS =
  "<WMS_Capabilities><Capability><Layer><Name>rofrs_4band_03_11_2026</Name></Layer></Capability></WMS_Capabilities>";

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
function httpError(status: number) {
  return { ok: false, status, json: async () => ({}), text: async () => "" };
}
function connectTimeoutError() {
  const error = new Error("fetch failed") as Error & { cause?: unknown };
  error.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
  return error;
}
function zonesFeature() {
  return {
    properties: { flood_zone: "FZ2", flood_source: "river", origin: "modelled" },
    geometry: {
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
    },
  };
}
function riversFeature() {
  return {
    properties: { risk_band: "Low" },
    geometry: {
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
    },
  };
}

// A stubbed service: the count and WMS calls answer at once,
// the items page fails `pageFailures` times on a connect
// timeout and then answers. `pageBody` overrides the page
// the service finally returns.
function stubService({
  wms,
  feature,
  pageFailures = 0,
  pageBody = null as unknown,
}: {
  wms: string;
  feature: () => unknown;
  pageFailures?: number;
  pageBody?: unknown;
}) {
  let pageAttempts = 0;
  const stub = async (url: unknown) => {
    const u = String(url);
    if (u.includes("/wms")) return okText(wms);
    if (u.includes("limit=1&")) return okJson({ numberMatched: 1 });
    if (u.includes("startIndex=")) {
      pageAttempts += 1;
      if (pageAttempts <= pageFailures) throw connectTimeoutError();
      return okJson(pageBody ?? { numberMatched: 1, features: [feature()] });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  return { stub, pageAttempts: () => pageAttempts };
}

describe("isTransientFetchError — the retry classifier (BUG-384)", () => {
  it.each([
    [
      "connect timeout",
      Object.assign(new Error("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }),
      true,
    ],
    [
      "connection reset",
      Object.assign(new Error("read ECONNRESET"), { cause: { code: "ECONNRESET" } }),
      true,
    ],
    ["socket hang up", new Error("socket hang up"), true],
    ["bare fetch failed", new TypeError("fetch failed"), true],
    ["HTTP 503", Object.assign(new Error("HTTP 503"), { status: 503 }), true],
    ["HTTP 500", Object.assign(new Error("HTTP 500"), { status: 500 }), true],
    ["HTTP 429", Object.assign(new Error("HTTP 429"), { status: 429 }), true],
    ["HTTP 404", Object.assign(new Error("HTTP 404"), { status: 404 }), false],
    ["HTTP 400", Object.assign(new Error("HTTP 400"), { status: 400 }), false],
    ["contract failure", new Error("contract failure: the count moved mid-read"), false],
  ])("%s -> %s", (_label, error, transient) => {
    expect(isTransientFetchError(error)).toBe(transient);
  });
});

describe("readLive retries a page past the old 5-attempt budget (BUG-384)", () => {
  it("flood zones survives 8 connect timeouts on the items page", async () => {
    const { stub, pageAttempts } = stubService({
      wms: ZONES_WMS,
      feature: zonesFeature,
      pageFailures: 8,
    });
    globalThis.fetch = stub as typeof fetch;
    const result = await readZonesLive({ delaysMs: [] });
    expect(result.read).toBe(1);
    // 8 failed attempts + the answering one: more than the
    // old 5-attempt budget ever allowed.
    expect(pageAttempts()).toBe(9);
  });

  it("flood rivers & sea survives 8 connect timeouts on the items page", async () => {
    const { stub, pageAttempts } = stubService({
      wms: RIVERS_WMS,
      feature: riversFeature,
      pageFailures: 8,
    });
    globalThis.fetch = stub as typeof fetch;
    const result = await readRiversSeaLive({ delaysMs: [] });
    expect(result.read).toBe(1);
    expect(pageAttempts()).toBe(9);
  });

  it("flood zones retries an HTTP 503 on the count and then reads", async () => {
    let countAttempts = 0;
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes("/wms")) return okText(ZONES_WMS);
      if (u.includes("limit=1&")) {
        countAttempts += 1;
        if (countAttempts <= 2) return httpError(503);
        return okJson({ numberMatched: 1 });
      }
      if (u.includes("startIndex="))
        return okJson({ numberMatched: 1, features: [zonesFeature()] });
      throw new Error(`unexpected fetch ${u}`);
    }) as typeof fetch;
    const result = await readZonesLive({ delaysMs: [] });
    expect(result.read).toBe(1);
    expect(countAttempts).toBe(3);
  });
});

describe("readLive fails loudly when the failure is not a transient transport fault (BUG-384)", () => {
  it("flood zones throws at once when the count moves mid-read", async () => {
    const { stub, pageAttempts } = stubService({
      wms: ZONES_WMS,
      feature: zonesFeature,
      pageBody: { numberMatched: 2, features: [zonesFeature()] },
    });
    globalThis.fetch = stub as typeof fetch;
    await expect(readZonesLive({ delaysMs: [] })).rejects.toThrow(/count moved mid-read/);
    // delaysMs: [] spends the page's body-retry budget in a
    // single attempt, so the moved count fails on the first
    // page; with a real budget the page is re-requested in
    // place first (paging-integrity.test.ts pins that).
    expect(pageAttempts()).toBe(1);
  });

  it("flood zones throws at once on an HTTP 404", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return httpError(404);
    }) as unknown as typeof fetch;
    await expect(readZonesLive({ delaysMs: [] })).rejects.toThrow(/HTTP 404/);
    expect(calls).toBe(1);
  });
});

describe("the 30-minute transient retry budget (BUG-384 cap)", () => {
  it("flood zones gives up once the budget is spent and throws the original error", async () => {
    const { stub, pageAttempts } = stubService({
      wms: ZONES_WMS,
      feature: zonesFeature,
      // Never answers: on uncapped code this spins forever.
      pageFailures: Infinity,
    });
    globalThis.fetch = stub as typeof fetch;
    await expect(readZonesLive({ delaysMs: [], retryBudgetMs: 100 })).rejects.toThrow(
      /fetch failed/,
    );
    // It retried before giving up — the budget is spent
    // retrying, not a first-attempt failure.
    expect(pageAttempts()).toBeGreaterThan(1);
  });

  it("flood zones still succeeds when the service recovers inside the budget", async () => {
    const { stub, pageAttempts } = stubService({
      wms: ZONES_WMS,
      feature: zonesFeature,
      pageFailures: 2,
    });
    globalThis.fetch = stub as typeof fetch;
    const result = await readZonesLive({ delaysMs: [], retryBudgetMs: 30_000 });
    expect(result.read).toBe(1);
    expect(pageAttempts()).toBe(3);
  });
});
