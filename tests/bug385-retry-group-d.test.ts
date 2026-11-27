// Group-D transient retry — a transient fetch failure is
// retried for up to 30 minutes (TRANSIENT_RETRY_BUDGET_MS,
// BUG-385 cap, founder-ordered 27 Nov 2026); a non-transient
// failure throws at once, and a persistent transient failure
// past the budget throws the original error. One describe per
// loader, each proving (a) transient failures are retried and
// a later success is returned, (b) a persistent transient
// failure past the budget throws the original error, and (c)
// a non-transient failure fails at once with a single attempt
// — through the loader's own exported fetch helper or entry
// point, with the loader's own error wording pinned.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  fetchResponse as broadbandFetchResponse,
  fetchRetry as broadbandFetchRetry,
  discoverReleaseZips,
} from "../loaders/load-broadband.mjs";
import {
  fetchResponse as builtUpFetchResponse,
  readLive as builtUpReadLive,
} from "../loaders/load-built-up-areas.mjs";
import {
  fetchResponse as crimeFetchResponse,
  fetchJson as crimeFetchJson,
} from "../loaders/load-crime.mjs";
import {
  fetchResponse as crimeNationalFetchResponse,
  fetchJson as crimeNationalFetchJson,
  downloadArchive,
} from "../loaders/load-crime-national.mjs";
import { fetchResponse as evFetchResponse, callOcm } from "../loaders/load-ev-chargers.mjs";
import {
  fetchResponse as osmFetchResponse,
  fetchText as osmFetchText,
  downloadExtract,
} from "../loaders/load-osm-places.mjs";
import { fetchResponse as pickingFetchResponse } from "../loaders/load-picking-index.mjs";
import {
  fetchResponse as postcodesFetchResponse,
  downloadEdition,
  resolveLatestEdition,
} from "../loaders/load-postcodes.mjs";
import { fetchResponse as soldPricesFetchResponse } from "../loaders/load-sold-prices.mjs";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => Buffer.from(JSON.stringify(body)),
    body: null,
  };
}
function okText(body: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => {
      throw new Error("not json");
    },
    text: async () => body,
    arrayBuffer: async () => Buffer.from(body),
    body: null,
  };
}
function okBody(body: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => {
      throw new Error("not json");
    },
    text: async () => body,
    arrayBuffer: async () => Buffer.from(body),
    body: Readable.toWeb(Readable.from([Buffer.from(body)])),
  };
}
function httpError(status: number) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => ({}),
    text: async () => "",
    body: null,
  };
}
function transientError() {
  const error = new Error("fetch failed") as Error & { cause?: unknown };
  error.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
  return error;
}

// A stubbed fetch: throws `failure` for the first
// `failures` calls, then answers with `okValue`. Counts
// every call and every onRetry firing.
function stubFlaky({
  failures = 0,
  failure = transientError(),
  okValue,
}: {
  failures?: number;
  failure?: unknown;
  okValue: unknown;
}) {
  let attempts = 0;
  const stub = (async () => {
    attempts += 1;
    if (attempts <= failures) throw failure;
    return okValue;
  }) as unknown as typeof fetch;
  return { stub, attempts: () => attempts };
}

// (a/b/c) for a fetchResponse-shaped helper: call(url, what,
// opts) returns the Response.
function checkFetchResponse(
  label: string,
  fetchFn: (url: string, what: string, opts?: Record<string, unknown>) => Promise<unknown>,
) {
  describe(`${label} fetchResponse (BUG-385)`, () => {
    it("(a) retries transient failures and returns the later success", async () => {
      const { stub, attempts } = stubFlaky({ failures: 2, okValue: okText("ok") });
      globalThis.fetch = stub;
      const retries: unknown[] = [];
      const response = (await fetchFn("https://example.com/x", "the test download", {
        delaysMs: [],
        onRetry: (error: unknown, attempt: number, delay: number) =>
          retries.push([error, attempt, delay]),
      })) as { text: () => Promise<string> };
      expect(await response.text()).toBe("ok");
      expect(attempts()).toBe(3);
      expect(retries.length).toBe(2);
    });

    it("(b) a persistent transient failure past the budget throws the original error", async () => {
      const failure = transientError();
      const { stub, attempts } = stubFlaky({ failures: Infinity, failure, okValue: null });
      globalThis.fetch = stub;
      let caught: unknown;
      try {
        await fetchFn("https://example.com/x", "the test download", {
          delaysMs: [],
          retryBudgetMs: 100,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBe(failure);
      // It retried before giving up — the budget is spent
      // retrying, not a first-attempt failure.
      expect(attempts()).toBeGreaterThan(1);
    });

    it("(c) a non-transient failure fails at once with a single attempt", async () => {
      const { stub, attempts } = stubFlaky({ failures: 0, okValue: httpError(404) });
      globalThis.fetch = stub;
      await expect(
        fetchFn("https://example.com/x", "the test download", { delaysMs: [] }),
      ).rejects.toThrow("HTTP 404 for the test download");
      expect(attempts()).toBe(1);
    });
  });
}

describe("broadband fetchRetry (BUG-385)", () => {
  const URL = "https://www.ofcom.org.uk/files/fixed-broadband.zip";
  it("(a) retries transient failures and returns the later success", async () => {
    const { stub, attempts } = stubFlaky({ failures: 2, okValue: okText("page") });
    globalThis.fetch = stub;
    expect(await broadbandFetchRetry(URL, { delaysMs: [] })).toBe("page");
    expect(attempts()).toBe(3);
  });

  it("(a) binary returns a Buffer", async () => {
    const { stub, attempts } = stubFlaky({ failures: 1, okValue: okText("zip") });
    globalThis.fetch = stub;
    const buffer = await broadbandFetchRetry(URL, { binary: true, delaysMs: [] });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe("zip");
    expect(attempts()).toBe(2);
  });

  it("(b) a persistent transient failure past the budget throws the original error", async () => {
    const failure = transientError();
    const { stub, attempts } = stubFlaky({ failures: Infinity, failure, okValue: null });
    globalThis.fetch = stub;
    let caught: unknown;
    try {
      await broadbandFetchRetry(URL, { delaysMs: [], retryBudgetMs: 100 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(failure);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("(c) a non-transient failure fails at once with a single attempt", async () => {
    const { stub, attempts } = stubFlaky({ failures: 0, okValue: httpError(404) });
    globalThis.fetch = stub;
    await expect(broadbandFetchRetry(URL, { delaysMs: [] })).rejects.toThrow(
      `${URL} returned HTTP 404`,
    );
    expect(attempts()).toBe(1);
  });

  it("a 403 keeps the Ofcom wording and fails at once", async () => {
    const { stub, attempts } = stubFlaky({ failures: 0, okValue: httpError(403) });
    globalThis.fetch = stub;
    await expect(broadbandFetchRetry(URL, { delaysMs: [] })).rejects.toThrow(
      /Ofcom returned HTTP 403/,
    );
    expect(attempts()).toBe(1);
  });

  it("discoverReleaseZips retries the publication page and finds the fixed ZIP", async () => {
    const html = '<a href="https://www.ofcom.org.uk/files/fixed-broadband-coverage.zip">fixed</a>';
    const { stub, attempts } = stubFlaky({ failures: 1, okValue: okText(html) });
    globalThis.fetch = stub;
    const zips = await discoverReleaseZips("https://example.com/page", { delaysMs: [] });
    expect(zips.fixedZipUrl).toBe("https://www.ofcom.org.uk/files/fixed-broadband-coverage.zip");
    expect(zips.mobileZipUrl).toBeNull();
    expect(attempts()).toBe(2);
  });
});

checkFetchResponse("broadband", broadbandFetchResponse as never);

describe("built-up-areas (BUG-385)", () => {
  it("readLive retries a transient page failure and reads", async () => {
    const { stub, attempts } = stubFlaky({ failures: 1, okValue: okJson({ features: [] }) });
    globalThis.fetch = stub;
    const result = await builtUpReadLive({ delaysMs: [] });
    expect(result.total).toBe(0);
    expect(attempts()).toBe(2);
  });

  it("readLive throws at once on an HTTP 404", async () => {
    const { stub, attempts } = stubFlaky({ failures: 0, okValue: httpError(404) });
    globalThis.fetch = stub;
    await expect(builtUpReadLive({ delaysMs: [] })).rejects.toThrow(
      "HTTP 404 for the built-up areas download",
    );
    expect(attempts()).toBe(1);
  });
});

checkFetchResponse("built-up-areas", builtUpFetchResponse as never);

describe("crime fetchJson (BUG-385)", () => {
  const URL = "https://data.police.uk/api/crimes-street/all-crime?lat=51&lng=0&date=2026-09";
  it("(a) retries transient failures and returns the later success", async () => {
    const { stub, attempts } = stubFlaky({ failures: 2, okValue: okJson([{ id: 1 }]) });
    globalThis.fetch = stub;
    expect(await crimeFetchJson(URL, { delaysMs: [] })).toEqual([{ id: 1 }]);
    expect(attempts()).toBe(3);
  });

  it("(b) a persistent transient failure past the budget throws the original error", async () => {
    const failure = transientError();
    const { stub, attempts } = stubFlaky({ failures: Infinity, failure, okValue: null });
    globalThis.fetch = stub;
    let caught: unknown;
    try {
      await crimeFetchJson(URL, { delaysMs: [], retryBudgetMs: 100 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(failure);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("(c) a non-transient failure fails at once with a single attempt", async () => {
    const { stub, attempts } = stubFlaky({ failures: 0, okValue: httpError(404) });
    globalThis.fetch = stub;
    await expect(crimeFetchJson(URL, { delaysMs: [] })).rejects.toThrow(
      `Police.uk request failed: HTTP 404 (${URL})`,
    );
    expect(attempts()).toBe(1);
  });
});

checkFetchResponse("crime", crimeFetchResponse as never);

describe("crime-national (BUG-385)", () => {
  const URL = "https://data.police.uk/api/crimes-street-dates";
  it("fetchJson (a) retries transient failures and returns the later success", async () => {
    const { stub, attempts } = stubFlaky({ failures: 2, okValue: okJson([{ date: "2026-09" }]) });
    globalThis.fetch = stub;
    expect(await crimeNationalFetchJson(URL, { delaysMs: [] })).toEqual([{ date: "2026-09" }]);
    expect(attempts()).toBe(3);
  });

  it("fetchJson (b) a persistent transient failure past the budget throws the original error", async () => {
    const failure = transientError();
    const { stub, attempts } = stubFlaky({ failures: Infinity, failure, okValue: null });
    globalThis.fetch = stub;
    let caught: unknown;
    try {
      await crimeNationalFetchJson(URL, { delaysMs: [], retryBudgetMs: 100 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(failure);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fetchJson (c) a non-transient failure fails at once with a single attempt", async () => {
    const { stub, attempts } = stubFlaky({ failures: 0, okValue: httpError(404) });
    globalThis.fetch = stub;
    await expect(crimeNationalFetchJson(URL, { delaysMs: [] })).rejects.toThrow(
      `Police.uk request failed: HTTP 404 (${URL})`,
    );
    expect(attempts()).toBe(1);
  });

  it("downloadArchive (a) retries the whole download and writes the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-bug385-crime-national-"));
    try {
      const dest = join(dir, "2026-09.zip");
      const { stub, attempts } = stubFlaky({ failures: 1, okValue: okBody("ZIPBYTES") });
      globalThis.fetch = stub;
      await downloadArchive("2026-09", dest, { delaysMs: [] });
      expect(readFileSync(dest, "utf8")).toBe("ZIPBYTES");
      expect(attempts()).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("downloadArchive (b) a persistent transient failure past the budget throws the original error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-bug385-crime-national-"));
    try {
      const dest = join(dir, "2026-09.zip");
      const failure = transientError();
      const { stub, attempts } = stubFlaky({ failures: Infinity, failure, okValue: null });
      globalThis.fetch = stub;
      let caught: unknown;
      try {
        await downloadArchive("2026-09", dest, { delaysMs: [], retryBudgetMs: 100 });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBe(failure);
      expect(attempts()).toBeGreaterThan(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("downloadArchive (c) a 404 fails at once with a single attempt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-bug385-crime-national-"));
    try {
      const dest = join(dir, "2026-09.zip");
      const { stub, attempts } = stubFlaky({ failures: 0, okValue: httpError(404) });
      globalThis.fetch = stub;
      await expect(downloadArchive("2026-09", dest, { delaysMs: [] })).rejects.toThrow(
        "Police.uk archive download failed: HTTP 404 (2026-09)",
      );
      expect(attempts()).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

checkFetchResponse("crime-national", crimeNationalFetchResponse as never);

describe("ev-chargers callOcm (BUG-385)", () => {
  const savedKey = process.env.OPEN_CHARGE_MAP_API_KEY;
  beforeEach(() => {
    process.env.OPEN_CHARGE_MAP_API_KEY = "test-key";
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.OPEN_CHARGE_MAP_API_KEY;
    else process.env.OPEN_CHARGE_MAP_API_KEY = savedKey;
  });

  it("(a) retries transient failures and returns the later success", async () => {
    let seenInit: Record<string, unknown> | null = null;
    let attempts = 0;
    globalThis.fetch = (async (_url: unknown, init: unknown) => {
      attempts += 1;
      seenInit = init as Record<string, unknown>;
      if (attempts <= 2) throw transientError();
      return okJson([{ ID: 7 }]);
    }) as unknown as typeof fetch;
    const result = await callOcm("poi", { maxresults: 20000 }, tmpdir(), { delaysMs: [] });
    expect(result).toEqual([{ ID: 7 }]);
    expect(attempts).toBe(3);
    expect((seenInit!.headers as Record<string, string> | undefined)?.["X-API-Key"]).toBe(
      "test-key",
    );
  });

  it("(b) a persistent transient failure past the budget throws the original error", async () => {
    const failure = transientError();
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      throw failure;
    }) as unknown as typeof fetch;
    let caught: unknown;
    try {
      await callOcm("poi", {}, tmpdir(), { delaysMs: [], retryBudgetMs: 100 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(failure);
    expect(attempts).toBeGreaterThan(1);
  });

  it("(c) a credential refusal fails at once with a single attempt", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      return httpError(403);
    }) as unknown as typeof fetch;
    await expect(callOcm("poi", {}, tmpdir(), { delaysMs: [] })).rejects.toThrow(
      "Open Charge Map poi returned HTTP 403",
    );
    expect(attempts).toBe(1);
  });
});

checkFetchResponse("ev-chargers", evFetchResponse as never);

describe("osm-places (BUG-385)", () => {
  it("fetchText (a) retries transient failures and returns the later success", async () => {
    const { stub, attempts } = stubFlaky({ failures: 2, okValue: okText("abc123  file.pbf") });
    globalThis.fetch = stub;
    expect(
      await osmFetchText("https://example.com/england.md5", "england md5", { delaysMs: [] }),
    ).toBe("abc123  file.pbf");
    expect(attempts()).toBe(3);
  });

  it("fetchText (b) a persistent transient failure past the budget throws the original error", async () => {
    const failure = transientError();
    const { stub, attempts } = stubFlaky({ failures: Infinity, failure, okValue: null });
    globalThis.fetch = stub;
    let caught: unknown;
    try {
      await osmFetchText("https://example.com/england.md5", "england md5", {
        delaysMs: [],
        retryBudgetMs: 100,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(failure);
    expect(attempts()).toBeGreaterThan(1);
  });

  it("fetchText (c) a non-transient failure fails at once with a single attempt", async () => {
    const { stub, attempts } = stubFlaky({ failures: 0, okValue: httpError(404) });
    globalThis.fetch = stub;
    await expect(
      osmFetchText("https://example.com/england.md5", "england md5", { delaysMs: [] }),
    ).rejects.toThrow("england md5: HTTP 404 from https://example.com/england.md5");
    expect(attempts()).toBe(1);
  });

  it("fetchResponse carries a HEAD init through to fetch", async () => {
    let seenInit: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_url: unknown, init: unknown) => {
      seenInit = init as Record<string, unknown>;
      return okText("");
    }) as unknown as typeof fetch;
    await osmFetchResponse("https://example.com/england-latest.osm.pbf", "england extract HEAD", {
      init: { method: "HEAD" },
      delaysMs: [],
    });
    expect(seenInit!.method).toBe("HEAD");
  });

  it("downloadExtract (a) retries the whole download and writes the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-bug385-osm-"));
    try {
      const dest = join(dir, "england.osm.pbf");
      const { stub, attempts } = stubFlaky({ failures: 1, okValue: okBody("PBF") });
      globalThis.fetch = stub;
      await downloadExtract("england", "https://example.com/england.osm.pbf", dest, {
        delaysMs: [],
      });
      expect(readFileSync(dest, "utf8")).toBe("PBF");
      expect(attempts()).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("downloadExtract writes a fresh file, never appending to a partial one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-bug385-osm-"));
    try {
      const dest = join(dir, "england.osm.pbf");
      writeFileSync(dest, "STALE-PARTIAL");
      const { stub, attempts } = stubFlaky({ failures: 0, okValue: okBody("PBF") });
      globalThis.fetch = stub;
      await downloadExtract("england", "https://example.com/england.osm.pbf", dest, {
        delaysMs: [],
      });
      expect(readFileSync(dest, "utf8")).toBe("PBF");
      expect(attempts()).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("downloadExtract (b) a persistent transient failure past the budget throws the original error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-bug385-osm-"));
    try {
      const dest = join(dir, "england.osm.pbf");
      const failure = transientError();
      const { stub, attempts } = stubFlaky({ failures: Infinity, failure, okValue: null });
      globalThis.fetch = stub;
      let caught: unknown;
      try {
        await downloadExtract("england", "https://example.com/england.osm.pbf", dest, {
          delaysMs: [],
          retryBudgetMs: 100,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBe(failure);
      expect(attempts()).toBeGreaterThan(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("downloadExtract (c) a 404 fails at once with a single attempt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-bug385-osm-"));
    try {
      const dest = join(dir, "england.osm.pbf");
      const { stub, attempts } = stubFlaky({ failures: 0, okValue: httpError(404) });
      globalThis.fetch = stub;
      await expect(
        downloadExtract("england", "https://example.com/england.osm.pbf", dest, {
          delaysMs: [],
        }),
      ).rejects.toThrow(
        "england: download of https://example.com/england.osm.pbf returned HTTP 404",
      );
      expect(attempts()).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

checkFetchResponse("osm-places", osmFetchResponse as never);

checkFetchResponse("picking-index", pickingFetchResponse as never);

describe("postcodes (BUG-385)", () => {
  it("resolveLatestEdition retries a transient failure and resolves the edition", async () => {
    const { stub, attempts } = stubFlaky({
      failures: 1,
      okValue: okJson({
        results: [{ title: "ONS Postcode Directory (August 2026)", id: "abc123" }],
      }),
    });
    globalThis.fetch = stub;
    const edition = await resolveLatestEdition({ delaysMs: [] });
    expect(edition).toEqual({
      itemId: "abc123",
      editionLabel: "August 2026",
      sourceDate: "2026-08-01",
      downloadUrl: "https://www.arcgis.com/sharing/rest/content/items/abc123/data",
    });
    expect(attempts()).toBe(2);
  });

  it("downloadEdition (a) retries the whole download and writes the file", async () => {
    const itemId = `bug385groupd${Date.now()}`;
    const dest = join(tmpdir(), `onspd-${itemId}.zip`);
    try {
      const { stub, attempts } = stubFlaky({ failures: 1, okValue: okBody("ONSPDZIP") });
      globalThis.fetch = stub;
      const out = await downloadEdition({ itemId }, { delaysMs: [] });
      expect(out).toBe(dest);
      expect(readFileSync(dest, "utf8")).toBe("ONSPDZIP");
      expect(attempts()).toBe(2);
    } finally {
      rmSync(dest, { force: true });
    }
  });

  it("downloadEdition (b) a persistent transient failure past the budget throws the original error", async () => {
    const itemId = `bug385groupd${Date.now()}`;
    const dest = join(tmpdir(), `onspd-${itemId}.zip`);
    try {
      const failure = transientError();
      const { stub, attempts } = stubFlaky({ failures: Infinity, failure, okValue: null });
      globalThis.fetch = stub;
      let caught: unknown;
      try {
        await downloadEdition({ itemId }, { delaysMs: [], retryBudgetMs: 100 });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBe(failure);
      expect(attempts()).toBeGreaterThan(1);
    } finally {
      rmSync(dest, { force: true });
    }
  });

  it("downloadEdition (c) a 404 fails at once with a single attempt", async () => {
    const itemId = `bug385groupd${Date.now()}`;
    const dest = join(tmpdir(), `onspd-${itemId}.zip`);
    try {
      const { stub, attempts } = stubFlaky({ failures: 0, okValue: httpError(404) });
      globalThis.fetch = stub;
      await expect(downloadEdition({ itemId }, { delaysMs: [] })).rejects.toThrow(
        "the edition download failed (HTTP 404)",
      );
      expect(attempts()).toBe(1);
    } finally {
      rmSync(dest, { force: true });
    }
  });
});

checkFetchResponse("postcodes", postcodesFetchResponse as never);

checkFetchResponse("sold-prices", soldPricesFetchResponse as never);
