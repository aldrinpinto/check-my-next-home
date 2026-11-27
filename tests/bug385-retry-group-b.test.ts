// Group-B fetch retry — a transient fetch failure is retried
// for up to 30 minutes (TRANSIENT_RETRY_BUDGET_MS, BUG-385
// cap, founder-ordered 27 Nov 2026); a non-transient failure
// fails at once, and a persistent transient failure past the
// budget throws the original error. The same three proofs
// per loader, against the loader's exported fetch helper
// (plus entry-point proofs where the opts thread through):
// (a) transient failures are retried and a later success is
// returned; (b) a persistent transient failure past the
// budget throws the original error; (c) a non-transient
// failure (HTTP 404) fails at once with a single attempt.
import { afterEach, describe, expect, it } from "vitest";
import { fetchRetry as censusFetchRetry } from "../loaders/load-census.mjs";
import { fetchRetry as claimantFetchRetry } from "../loaders/load-claimant-count.mjs";
import {
  englandReleaseInfo,
  fetchBuffer as councilTaxFetchBuffer,
  fetchJson as councilTaxFetchJson,
} from "../loaders/load-council-tax.mjs";
import { callStatXploreDirect } from "../loaders/load-dwp-uc.mjs";
import { fetchText as imdFetchText } from "../loaders/load-imd.mjs";
import { fetchRetry as lsoaFetchRetry } from "../loaders/load-lsoa-bases.mjs";
import { fetchBinary as mobileFetchBinary } from "../loaders/load-mobile.mjs";
import { fetchRetry as noiseFetchRetry, sampleWms } from "../loaders/load-noise.mjs";
import { fetchRetry as pollutionFetchRetry } from "../loaders/load-pollution-inventory.mjs";
import { fetchJson as pvgisFetchJson, sampleCells } from "../loaders/load-pvgis.mjs";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function transientError() {
  const error = new Error("fetch failed") as Error & { cause?: unknown };
  error.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
  return error;
}

function okResponse({ text = "", json = {}, bytes = [1, 2, 3] }: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => json,
    text: async () => text,
    arrayBuffer: async () => new Uint8Array(bytes as number[]).buffer,
  };
}

function httpError(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => "",
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

// A stub that fails `failures` times — a connect timeout, or
// an HTTP `failStatus` — and then answers with `ok`.
function flakyStub({
  failures = 2,
  failStatus = null as number | null,
  ok = okResponse(),
}: {
  failures?: number;
  failStatus?: number | null;
  ok?: unknown;
}) {
  let attempts = 0;
  let retries = 0;
  const stub = (async () => {
    attempts += 1;
    if (attempts <= failures) {
      if (failStatus) return httpError(failStatus);
      throw transientError();
    }
    return ok;
  }) as unknown as typeof fetch;
  return {
    stub,
    attempts: () => attempts,
    retries: () => retries,
    onRetry: () => {
      retries += 1;
    },
  };
}

// A stub that never answers: on uncapped code this spins
// forever. The one error instance is thrown every time, so
// the test can prove the budget throws the ORIGINAL error.
function alwaysTransientStub() {
  const error = transientError();
  let attempts = 0;
  const stub = (async () => {
    attempts += 1;
    throw error;
  }) as unknown as typeof fetch;
  return { stub, error, attempts: () => attempts };
}

const INSTANT = { delaysMs: [], retryBudgetMs: 30_000 };

describe("census fetchRetry (BUG-385)", () => {
  const url = "https://www.nomisweb.co.uk/output/census/2021/census2021-age.zip";

  it("retries connect timeouts and returns the response", async () => {
    const { stub, attempts, retries, onRetry } = flakyStub({});
    globalThis.fetch = stub;
    const response = await censusFetchRetry(url, { ...INSTANT, onRetry });
    expect(response.ok).toBe(true);
    expect(attempts()).toBe(3);
    expect(retries()).toBe(2);
  });

  it("retries an HTTP 503 and returns the response", async () => {
    const { stub, attempts } = flakyStub({ failStatus: 503 });
    globalThis.fetch = stub;
    const response = await censusFetchRetry(url, INSTANT);
    expect(response.ok).toBe(true);
    expect(attempts()).toBe(3);
  });

  it("gives up once the budget is spent and throws the original error", async () => {
    const { stub, error, attempts } = alwaysTransientStub();
    globalThis.fetch = stub;
    await expect(censusFetchRetry(url, { delaysMs: [], retryBudgetMs: 100 })).rejects.toBe(error);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fails at once on an HTTP 404", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(404);
    }) as unknown as typeof fetch;
    await expect(censusFetchRetry(url, INSTANT)).rejects.toThrow(/HTTP 404 for /);
    expect(attempts).toBe(1);
  });
});

describe("lsoa-bases fetchRetry (BUG-385)", () => {
  const url = "https://www.nomisweb.co.uk/output/census/2021/census2021-ts021.zip";

  it("retries connect timeouts and returns the response", async () => {
    const { stub, attempts, retries, onRetry } = flakyStub({});
    globalThis.fetch = stub;
    const response = await lsoaFetchRetry(url, { ...INSTANT, onRetry });
    expect(response.ok).toBe(true);
    expect(attempts()).toBe(3);
    expect(retries()).toBe(2);
  });

  it("gives up once the budget is spent and throws the original error", async () => {
    const { stub, error, attempts } = alwaysTransientStub();
    globalThis.fetch = stub;
    await expect(lsoaFetchRetry(url, { delaysMs: [], retryBudgetMs: 100 })).rejects.toBe(error);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fails at once on an HTTP 404", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(404);
    }) as unknown as typeof fetch;
    await expect(lsoaFetchRetry(url, INSTANT)).rejects.toThrow(/HTTP 404 for /);
    expect(attempts).toBe(1);
  });
});

describe("claimant-count fetchRetry (BUG-385)", () => {
  const url = "https://www.nomisweb.co.uk/api/v01/dataset/NM_162_1.data.csv?geography=TYPE151";

  it("retries connect timeouts and returns the text", async () => {
    const { stub, attempts, retries, onRetry } = flakyStub({
      ok: okResponse({ text: "a,b\n1,2\n" }),
    });
    globalThis.fetch = stub;
    const text = await claimantFetchRetry(url, { ...INSTANT, onRetry });
    expect(text).toBe("a,b\n1,2\n");
    expect(attempts()).toBe(3);
    expect(retries()).toBe(2);
  });

  it("gives up once the budget is spent and throws the original error", async () => {
    const { stub, error, attempts } = alwaysTransientStub();
    globalThis.fetch = stub;
    await expect(claimantFetchRetry(url, { delaysMs: [], retryBudgetMs: 100 })).rejects.toBe(error);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fails at once on an HTTP 404", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(404);
    }) as unknown as typeof fetch;
    await expect(claimantFetchRetry(url, INSTANT)).rejects.toThrow(/HTTP 404 for /);
    expect(attempts).toBe(1);
  });
});

describe("imd fetchText (BUG-385)", () => {
  const url = "https://example.invalid/imd-file7.csv";

  it("retries connect timeouts and returns the text", async () => {
    const { stub, attempts, retries, onRetry } = flakyStub({
      ok: okResponse({ text: "lsoa,decile\nE01000001,5\n" }),
    });
    globalThis.fetch = stub;
    const text = await imdFetchText(url, { ...INSTANT, onRetry });
    expect(text).toBe("lsoa,decile\nE01000001,5\n");
    expect(attempts()).toBe(3);
    expect(retries()).toBe(2);
  });

  it("gives up once the budget is spent and throws the original error", async () => {
    const { stub, error, attempts } = alwaysTransientStub();
    globalThis.fetch = stub;
    await expect(imdFetchText(url, { delaysMs: [], retryBudgetMs: 100 })).rejects.toBe(error);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fails at once on an HTTP 404", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(404);
    }) as unknown as typeof fetch;
    await expect(imdFetchText(url, INSTANT)).rejects.toThrow(/returned HTTP 404/);
    expect(attempts).toBe(1);
  });
});

describe("mobile fetchBinary (BUG-385)", () => {
  const url = "https://example.invalid/connected-nations.zip";

  it("retries connect timeouts and returns the buffer", async () => {
    const { stub, attempts, retries, onRetry } = flakyStub({});
    globalThis.fetch = stub;
    const buffer = await mobileFetchBinary(url, { ...INSTANT, onRetry });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(attempts()).toBe(3);
    expect(retries()).toBe(2);
  });

  it("gives up once the budget is spent and throws the original error", async () => {
    const { stub, error, attempts } = alwaysTransientStub();
    globalThis.fetch = stub;
    await expect(mobileFetchBinary(url, { delaysMs: [], retryBudgetMs: 100 })).rejects.toBe(error);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fails at once on an HTTP 404", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(404);
    }) as unknown as typeof fetch;
    await expect(mobileFetchBinary(url, INSTANT)).rejects.toThrow(/returned HTTP 404/);
    expect(attempts).toBe(1);
  });

  it("fails at once on an HTTP 403, with the Ofcom message", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(403);
    }) as unknown as typeof fetch;
    await expect(mobileFetchBinary(url, INSTANT)).rejects.toThrow(/Ofcom returned HTTP 403/);
    expect(attempts).toBe(1);
  });
});

describe("council-tax fetchBuffer / fetchJson (BUG-385)", () => {
  const tablesUrl = "https://example.invalid/Tables_1-9.ods";
  const tablesWhat = "Tables 1 to 9 for 2026-27";
  const metaUrl = "https://api.stats.gov.wales/v2/3ca971eb-7d9b-4b79-89fa-6d7f77431aad";
  const metaWhat = "the StatsWales composition dataset metadata";

  it("fetchBuffer retries connect timeouts and returns the buffer", async () => {
    const { stub, attempts, retries, onRetry } = flakyStub({});
    globalThis.fetch = stub;
    const buffer = await councilTaxFetchBuffer(tablesUrl, tablesWhat, { ...INSTANT, onRetry });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(attempts()).toBe(3);
    expect(retries()).toBe(2);
  });

  it("fetchBuffer retries an HTTP 503 and returns the buffer", async () => {
    const { stub, attempts } = flakyStub({ failStatus: 503 });
    globalThis.fetch = stub;
    const buffer = await councilTaxFetchBuffer(tablesUrl, tablesWhat, INSTANT);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(attempts()).toBe(3);
  });

  it("fetchBuffer gives up once the budget is spent and throws the original error", async () => {
    const { stub, error, attempts } = alwaysTransientStub();
    globalThis.fetch = stub;
    await expect(
      councilTaxFetchBuffer(tablesUrl, tablesWhat, { delaysMs: [], retryBudgetMs: 100 }),
    ).rejects.toBe(error);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fetchBuffer fails at once on an HTTP 404", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(404);
    }) as unknown as typeof fetch;
    await expect(councilTaxFetchBuffer(tablesUrl, tablesWhat, INSTANT)).rejects.toThrow(
      /Tables 1 to 9 for 2026-27: HTTP 404/,
    );
    expect(attempts).toBe(1);
  });

  it("fetchJson retries connect timeouts and returns the parsed body", async () => {
    const { stub, attempts } = flakyStub({
      ok: okResponse({ json: { last_updated_at: "2026-04-01" } }),
    });
    globalThis.fetch = stub;
    const doc = await councilTaxFetchJson(metaUrl, metaWhat, INSTANT);
    expect(doc).toEqual({ last_updated_at: "2026-04-01" });
    expect(attempts()).toBe(3);
  });

  it("fetchJson gives up once the budget is spent and throws the original error", async () => {
    const { stub, error, attempts } = alwaysTransientStub();
    globalThis.fetch = stub;
    await expect(
      councilTaxFetchJson(metaUrl, metaWhat, { delaysMs: [], retryBudgetMs: 100 }),
    ).rejects.toBe(error);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fetchJson answers a 404 with null, unretried — the release has not landed yet", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(404);
    }) as unknown as typeof fetch;
    await expect(councilTaxFetchJson(metaUrl, metaWhat, INSTANT)).resolves.toBeNull();
    expect(attempts).toBe(1);
  });

  it("englandReleaseInfo threads the retry opts through to the fetch", async () => {
    const doc = {
      details: {
        attachments: [
          {
            url: "https://assets.publishing.service.gov.uk/media/x/Tables_1-9_2026-27.ods",
            title: "Tables 1-9",
          },
          {
            url: "https://assets.publishing.service.gov.uk/media/x/Table_10_2026-27.ods",
            title: "Table 10",
          },
        ],
      },
      first_published_at: "2026-04-01T00:00:00.000Z",
      public_updated_at: "2026-04-02T00:00:00.000Z",
    };
    const { stub, attempts, onRetry } = flakyStub({ ok: okResponse({ json: doc }) });
    globalThis.fetch = stub;
    const info = await englandReleaseInfo("2026-27", { ...INSTANT, onRetry });
    expect(info?.tablesUrl).toContain("Tables_1-9_2026-27.ods");
    expect(info?.table10Url).toContain("Table_10_2026-27.ods");
    expect(attempts()).toBe(3);
  });
});

describe("dwp-uc callStatXploreDirect (BUG-385)", () => {
  it("retries connect timeouts on a POST and returns the parsed body", async () => {
    let method = "";
    const { stub, attempts, retries, onRetry } = flakyStub({
      ok: okResponse({ json: { fields: [] } }),
    });
    globalThis.fetch = (async (url: unknown, init: unknown) => {
      method = (init as { method?: string }).method ?? "";
      return stub(url as string);
    }) as unknown as typeof fetch;
    const json = await callStatXploreDirect("/table", {
      method: "POST",
      body: "{}",
      ...INSTANT,
      onRetry,
    });
    expect(method).toBe("POST");
    expect(json).toEqual({ fields: [] });
    expect(attempts()).toBe(3);
    expect(retries()).toBe(2);
  });

  it("retries an HTTP 503 and returns the parsed body", async () => {
    const { stub, attempts } = flakyStub({ failStatus: 503, ok: okResponse({ json: {} }) });
    globalThis.fetch = stub;
    const json = await callStatXploreDirect("/schema/foo", INSTANT);
    expect(json).toEqual({});
    expect(attempts()).toBe(3);
  });

  it("gives up once the budget is spent and throws the original error", async () => {
    const { stub, error, attempts } = alwaysTransientStub();
    globalThis.fetch = stub;
    await expect(
      callStatXploreDirect("/schema/foo", { delaysMs: [], retryBudgetMs: 100 }),
    ).rejects.toBe(error);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fails at once on an HTTP 404", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(404);
    }) as unknown as typeof fetch;
    await expect(callStatXploreDirect("/schema/foo", INSTANT)).rejects.toThrow(/HTTP 404/);
    expect(attempts).toBe(1);
  });
});

describe("noise fetchRetry (BUG-385)", () => {
  const url = "https://example.invalid/noise?service=WMS&version=1.3.0&request=GetFeatureInfo";

  it("retries connect timeouts and returns the text", async () => {
    const { stub, attempts, retries, onRetry } = flakyStub({
      ok: okResponse({ text: "<xml/>" }),
    });
    globalThis.fetch = stub;
    const text = await noiseFetchRetry(url, { ...INSTANT, onRetry });
    expect(text).toBe("<xml/>");
    expect(attempts()).toBe(3);
    expect(retries()).toBe(2);
  });

  it("retries connect timeouts and returns the binary tile", async () => {
    const { stub, attempts } = flakyStub({});
    globalThis.fetch = stub;
    const tile = await noiseFetchRetry(url, { binary: true, ...INSTANT });
    expect(tile).toBeInstanceOf(Uint8Array);
    expect(attempts()).toBe(3);
  });

  it("gives up once the budget is spent and throws the original error", async () => {
    const { stub, error, attempts } = alwaysTransientStub();
    globalThis.fetch = stub;
    await expect(noiseFetchRetry(url, { delaysMs: [], retryBudgetMs: 100 })).rejects.toBe(error);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fails at once on an HTTP 404", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(404);
    }) as unknown as typeof fetch;
    await expect(noiseFetchRetry(url, INSTANT)).rejects.toThrow(/returned HTTP 404/);
    expect(attempts).toBe(1);
  });

  it("sampleWms threads the retry opts through to the fetch", async () => {
    const { stub, attempts, onRetry } = flakyStub({
      ok: okResponse({
        text: JSON.stringify({ features: [{ properties: { GRAY_INDEX: 42 } }] }),
      }),
    });
    globalThis.fetch = stub;
    const value = await sampleWms("road", "Lday", 530000, 180000, { ...INSTANT, onRetry });
    expect(value).toBe(42);
    expect(attempts()).toBe(3);
  });
});

describe("pollution-inventory fetchRetry (BUG-385)", () => {
  const url = "https://example.invalid/pollution-inventory-record.json";

  it("retries connect timeouts and returns the parsed record", async () => {
    const { stub, attempts, retries, onRetry } = flakyStub({
      ok: okResponse({ json: { result: { resources: [] } } }),
    });
    globalThis.fetch = stub;
    const record = await pollutionFetchRetry(url, { ...INSTANT, onRetry });
    expect(record).toEqual({ result: { resources: [] } });
    expect(attempts()).toBe(3);
    expect(retries()).toBe(2);
  });

  it("retries connect timeouts and returns the ZIP buffer", async () => {
    const { stub, attempts } = flakyStub({});
    globalThis.fetch = stub;
    const zip = await pollutionFetchRetry(url, { buffer: true, ...INSTANT });
    expect(Buffer.isBuffer(zip)).toBe(true);
    expect(attempts()).toBe(3);
  });

  it("gives up once the budget is spent and throws the original error", async () => {
    const { stub, error, attempts } = alwaysTransientStub();
    globalThis.fetch = stub;
    await expect(pollutionFetchRetry(url, { delaysMs: [], retryBudgetMs: 100 })).rejects.toBe(
      error,
    );
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fails at once on an HTTP 404", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(404);
    }) as unknown as typeof fetch;
    await expect(pollutionFetchRetry(url, INSTANT)).rejects.toThrow(/returned HTTP 404/);
    expect(attempts).toBe(1);
  });
});

describe("pvgis fetchJson (BUG-385)", () => {
  const url = "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=51.5&lon=-0.1";

  it("retries connect timeouts and returns the parsed body", async () => {
    const { stub, attempts, retries, onRetry } = flakyStub({
      ok: okResponse({ json: { outputs: {} } }),
    });
    globalThis.fetch = stub;
    const json = await pvgisFetchJson(url, { ...INSTANT, onRetry });
    expect(json).toEqual({ outputs: {} });
    expect(attempts()).toBe(3);
    expect(retries()).toBe(2);
  });

  it("retries an HTTP 503 and returns the parsed body", async () => {
    const { stub, attempts } = flakyStub({ failStatus: 503, ok: okResponse({ json: {} }) });
    globalThis.fetch = stub;
    const json = await pvgisFetchJson(url, INSTANT);
    expect(json).toEqual({});
    expect(attempts()).toBe(3);
  });

  it("gives up once the budget is spent and throws the original error", async () => {
    const { stub, error, attempts } = alwaysTransientStub();
    globalThis.fetch = stub;
    await expect(pvgisFetchJson(url, { delaysMs: [], retryBudgetMs: 100 })).rejects.toBe(error);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fails at once on an HTTP 404", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(404);
    }) as unknown as typeof fetch;
    await expect(pvgisFetchJson(url, INSTANT)).rejects.toThrow(/returned HTTP 404/);
    expect(attempts).toBe(1);
  });

  it("sampleCells threads the retry opts through to the fetch", async () => {
    const error = transientError();
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      throw error;
    }) as unknown as typeof fetch;
    await expect(
      sampleCells([{ latitude: 51.5, longitude: -0.1 }], pvgisFetchJson, {
        fetchOpts: { delaysMs: [], retryBudgetMs: 100 },
      }),
    ).rejects.toBe(error);
    expect(attempts).toBeGreaterThan(1);
  });
});
