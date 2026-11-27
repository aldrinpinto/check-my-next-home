// Transient fetch retry, group C (BUG-385): a transient
// fetch failure is retried for up to 30 minutes
// (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
// 2026) — the same retry the flood loaders got in
// BUG-384 — past the budget the original error fails the
// run and it waits, and a non-transient failure fails at
// once. One file covers all nine group-C loaders; the
// parent merges the four groups' files.
import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  downloadCompaniesHouse,
  fetchResponse as companyOwnershipFetch,
} from "../loaders/load-company-ownership.mjs";
import { apiGet, fetchResponse as epcFetch, liveCertificates } from "../loaders/load-epc.mjs";
import { fetchResponse as healthFetch } from "../loaders/load-health.mjs";
import { fetchResponse as nurseriesFetch } from "../loaders/load-nurseries.mjs";
import { fetchResponse as schoolsFetch } from "../loaders/load-schools.mjs";
import { fetchResponse as destinationsFetch } from "../loaders/load-school-destinations.mjs";
import { downloadCountry, fetchResponse as streetsFetch } from "../loaders/load-streets.mjs";
import { downloadNational } from "../loaders/load-transport.mjs";
import { fetchResponse as tribunalFetch } from "../loaders/load-tribunal-building-safety.mjs";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// The stubs answer with plain response-shaped objects,
// not real Responses; the double cast is the same one
// load-flood-retry.test.ts uses for its always-404 stub.
function installFetch(stub: unknown) {
  globalThis.fetch = stub as unknown as typeof fetch;
}

function okText(body: string) {
  return {
    ok: true,
    status: 200,
    text: async () => body,
    json: async () => JSON.parse(body),
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}
function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
  };
}
function httpError(status: number) {
  return {
    ok: false,
    status,
    text: async () => "",
    json: async () => ({}),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}
function connectTimeoutError() {
  const error = new Error("fetch failed") as Error & { cause?: unknown };
  error.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
  return error;
}

type RetryOpts = {
  delaysMs?: number[];
  onRetry?: ((error: Error, attempt: number, delay: number, what: string) => void) | null;
  retryBudgetMs?: number;
  init?: unknown;
};
type FetchResponseFn = (url: string, what: string, opts?: RetryOpts) => Promise<Response>;

// The three behaviours every loader's fetchResponse must
// show: (a) transient failures are retried and a later
// success is returned; (b) a persistent transient failure
// past the budget throws the original error; (c) a
// non-transient failure (HTTP 404) fails at once with a
// single attempt.
function fetchResponseChecks(label: string, fetchResponse: FetchResponseFn) {
  it(`${label}: transient failures are retried and a later success is returned`, async () => {
    let attempts = 0;
    installFetch(async () => {
      attempts += 1;
      if (attempts <= 2) throw connectTimeoutError();
      return okText("hello");
    });
    const response = await fetchResponse("https://example.invalid/x", "the test fetch", {
      delaysMs: [],
      retryBudgetMs: 30_000,
    });
    expect(await response.text()).toBe("hello");
    expect(attempts).toBe(3);
  });

  it(`${label}: a persistent transient failure past the budget throws the original error`, async () => {
    let attempts = 0;
    installFetch(async () => {
      attempts += 1;
      throw connectTimeoutError();
    });
    await expect(
      fetchResponse("https://example.invalid/x", "the test fetch", {
        delaysMs: [],
        retryBudgetMs: 100,
      }),
    ).rejects.toThrow(/fetch failed/);
    // It retried before giving up — the budget is spent
    // retrying, not a first-attempt failure.
    expect(attempts).toBeGreaterThan(1);
  });

  it(`${label}: a non-transient failure fails at once with a single attempt`, async () => {
    let attempts = 0;
    installFetch(async () => {
      attempts += 1;
      return httpError(404);
    });
    await expect(
      fetchResponse("https://example.invalid/x", "the test fetch", {
        delaysMs: [],
        retryBudgetMs: 30_000,
      }),
    ).rejects.toThrow(/HTTP 404/);
    expect(attempts).toBe(1);
  });
}

describe("company-ownership fetchResponse (BUG-385)", () => {
  fetchResponseChecks("company-ownership", companyOwnershipFetch);
});

describe("epc fetchResponse (BUG-385)", () => {
  fetchResponseChecks("epc", epcFetch);
});

describe("health fetchResponse (BUG-385)", () => {
  fetchResponseChecks("health", healthFetch);
});

describe("nurseries fetchResponse (BUG-385)", () => {
  fetchResponseChecks("nurseries", nurseriesFetch);
});

describe("schools fetchResponse (BUG-385)", () => {
  fetchResponseChecks("schools", schoolsFetch);
});

describe("school-destinations fetchResponse (BUG-385)", () => {
  fetchResponseChecks("school-destinations", destinationsFetch);
});

describe("streets fetchResponse (BUG-385)", () => {
  fetchResponseChecks("streets", streetsFetch);
});

describe("tribunal-building-safety fetchResponse (BUG-385)", () => {
  fetchResponseChecks("tribunal-building-safety", tribunalFetch);

  it("builds a fresh fetch init per attempt, so a fired AbortSignal.timeout never poisons a retry", async () => {
    let attempts = 0;
    let initCalls = 0;
    installFetch(async () => {
      attempts += 1;
      if (attempts <= 2) throw connectTimeoutError();
      return okText("hello");
    });
    const response = await tribunalFetch("https://example.invalid/x", "the test fetch", {
      delaysMs: [],
      retryBudgetMs: 30_000,
      init: () => {
        initCalls += 1;
        return { signal: AbortSignal.timeout(60_000) };
      },
    });
    expect(await response.text()).toBe("hello");
    expect(attempts).toBe(3);
    expect(initCalls).toBe(3);
  });
});

describe("epc liveCertificates retries the register (BUG-385)", () => {
  it("survives 8 connect timeouts on the search and 2 on a certificate fetch", async () => {
    let searchAttempts = 0;
    let certAttempts = 0;
    installFetch(async (url: string) => {
      if (url.includes("/api/domestic/search")) {
        searchAttempts += 1;
        if (searchAttempts <= 8) throw connectTimeoutError();
        return okJson({
          data: [{ certificateNumber: "cert-0", addressLine1: "1 Test Street" }],
          pagination: { totalPages: 1 },
        });
      }
      certAttempts += 1;
      if (certAttempts <= 2) throw connectTimeoutError();
      return okJson({
        data: {
          address_line_1: "1 Test Street",
          postcode: "ZZ9 1AA",
          current_energy_efficiency_band: "C",
        },
      });
    });
    const { certificates, skipped } = await liveCertificates("ZZ9 1AA", "test-token", {
      delaysMs: [],
      retryBudgetMs: 30_000,
    });
    expect(certificates).toHaveLength(1);
    expect(certificates[0]?.certificateNumber).toBe("cert-0");
    expect(skipped).toBe(0);
    // 8 failed searches + the answering one: more than
    // the old 2-attempt apiGet budget ever allowed.
    expect(searchAttempts).toBe(9);
    expect(certAttempts).toBe(3);
  });

  it("fails the run when the search stays transient past the budget", async () => {
    let searchAttempts = 0;
    installFetch(async (url: string) => {
      if (url.includes("/api/domestic/search")) {
        searchAttempts += 1;
        throw connectTimeoutError();
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    await expect(
      liveCertificates("ZZ9 1AA", "test-token", { delaysMs: [], retryBudgetMs: 100 }),
    ).rejects.toThrow(/fetch failed/);
    expect(searchAttempts).toBeGreaterThan(1);
  });

  it("a 404 search still means 'no certificates' with a single attempt", async () => {
    let searchAttempts = 0;
    installFetch(async (url: string) => {
      if (url.includes("/api/domestic/search")) {
        searchAttempts += 1;
        return httpError(404);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    await expect(liveCertificates("ZZ9 1AA", "test-token", { delaysMs: [] })).resolves.toEqual({
      certificates: [],
      skipped: 0,
    });
    expect(searchAttempts).toBe(1);
  });
});

describe("epc apiGet keeps its contract (BUG-385)", () => {
  it("a 404 returns null with a single attempt", async () => {
    let attempts = 0;
    installFetch(async () => {
      attempts += 1;
      return httpError(404);
    });
    await expect(
      apiGet("/api/certificate?certificate_number=x", "t", { delaysMs: [] }),
    ).resolves.toBeNull();
    expect(attempts).toBe(1);
  });

  it("a transient HTTP 500 is retried and past the budget throws with the helper's message", async () => {
    let attempts = 0;
    installFetch(async () => {
      attempts += 1;
      return httpError(500);
    });
    await expect(
      apiGet("/api/certificate?certificate_number=x", "t", {
        delaysMs: [],
        retryBudgetMs: 100,
      }),
    ).rejects.toThrow(/EPC API request failed: HTTP 500/);
    expect(attempts).toBeGreaterThan(1);
  });

  it("a non-transient HTTP 400 fails at once with a single attempt", async () => {
    let attempts = 0;
    installFetch(async () => {
      attempts += 1;
      return httpError(400);
    });
    await expect(
      apiGet("/api/certificate?certificate_number=x", "t", { delaysMs: [] }),
    ).rejects.toThrow(/EPC API request failed: HTTP 400/);
    expect(attempts).toBe(1);
  });
});

// A web-stream body: a full one, and one that emits a
// partial chunk and then dies mid-transfer with a
// transient error.
function fullBody(text: string) {
  return new Response(text).body;
}
function partialBody(text: string) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.error(new Error("socket hang up"));
    },
  });
}

describe("transport downloadNational retries the whole download (BUG-385)", () => {
  it("a mid-transfer cut retries from scratch and the landed file holds the full bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bug385-transport-"));
    try {
      const tmpPath = join(dir, "naptan.csv");
      let attempts = 0;
      installFetch(async () => {
        attempts += 1;
        if (attempts === 1) return { ok: true, status: 200, body: partialBody("PARTIAL-") };
        return { ok: true, status: 200, body: fullBody("FULL-CONTENT") };
      });
      await downloadNational(tmpPath, { delaysMs: [], retryBudgetMs: 30_000 });
      expect(attempts).toBe(2);
      // The second attempt truncated the partial file —
      // the landed bytes are the full download, not the
      // partial prefix plus the full one.
      expect(await readFile(tmpPath, "utf8")).toBe("FULL-CONTENT");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("a persistent transient failure past the budget throws the original error", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bug385-transport-"));
    try {
      const tmpPath = join(dir, "naptan.csv");
      let attempts = 0;
      installFetch(async () => {
        attempts += 1;
        throw connectTimeoutError();
      });
      await expect(downloadNational(tmpPath, { delaysMs: [], retryBudgetMs: 100 })).rejects.toThrow(
        /fetch failed/,
      );
      expect(attempts).toBeGreaterThan(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("a non-transient HTTP 404 fails at once with a single attempt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bug385-transport-"));
    try {
      const tmpPath = join(dir, "naptan.csv");
      let attempts = 0;
      installFetch(async () => {
        attempts += 1;
        return httpError(404);
      });
      await expect(
        downloadNational(tmpPath, { delaysMs: [], retryBudgetMs: 30_000 }),
      ).rejects.toThrow(/HTTP 404 for the NaPTAN download/);
      expect(attempts).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("streets downloadCountry retries the whole download (BUG-385)", () => {
  const FULL = "PBF-BYTES";
  const md5 = createHash("md5").update(FULL).digest("hex");

  function stubGeofabrik({
    downloadFailures = 0,
    downloadStatus = 200,
  }: {
    downloadFailures?: number;
    downloadStatus?: number;
  } = {}) {
    let headCalls = 0;
    let md5Calls = 0;
    let downloadCalls = 0;
    const stub = async (url: unknown, init?: { method?: string }) => {
      const u = String(url);
      if (init?.method === "HEAD") {
        headCalls += 1;
        return {
          ok: true,
          status: 200,
          url: "https://download.geofabrik.de/europe/united-kingdom/england/england-261127.osm.pbf",
        };
      }
      if (u.endsWith(".md5")) {
        md5Calls += 1;
        return okText(`${md5}  england-261127.osm.pbf`);
      }
      downloadCalls += 1;
      if (downloadStatus !== 200) return httpError(downloadStatus);
      if (downloadCalls <= downloadFailures)
        return { ok: true, status: 200, body: partialBody("PARTIAL-") };
      return { ok: true, status: 200, body: fullBody(FULL) };
    };
    return {
      stub,
      counts: () => ({ headCalls, md5Calls, downloadCalls }),
    };
  }

  it("a mid-transfer cut retries from scratch and the md5 accepts the full file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bug385-streets-"));
    try {
      const { stub, counts } = stubGeofabrik({ downloadFailures: 1 });
      installFetch(stub);
      const result = await downloadCountry("england", dir, {
        delaysMs: [],
        retryBudgetMs: 30_000,
      });
      expect(result.dataDate).toBe("2026-11-27");
      expect(counts().downloadCalls).toBe(2);
      expect(await readFile(result.path, "utf8")).toBe(FULL);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("a persistent transient failure past the budget throws the original error", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bug385-streets-"));
    try {
      let downloadCalls = 0;
      installFetch(async (url: unknown, init?: { method?: string }) => {
        const u = String(url);
        if (init?.method === "HEAD")
          return {
            ok: true,
            status: 200,
            url: "https://download.geofabrik.de/europe/united-kingdom/england/england-261127.osm.pbf",
          };
        if (u.endsWith(".md5")) return okText(`${md5}  england-261127.osm.pbf`);
        downloadCalls += 1;
        throw connectTimeoutError();
      });
      await expect(
        downloadCountry("england", dir, { delaysMs: [], retryBudgetMs: 100 }),
      ).rejects.toThrow(/fetch failed/);
      expect(downloadCalls).toBeGreaterThan(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("a non-transient HTTP 404 on the download fails at once with a single attempt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bug385-streets-"));
    try {
      const { stub, counts } = stubGeofabrik({ downloadStatus: 404 });
      installFetch(stub);
      await expect(
        downloadCountry("england", dir, { delaysMs: [], retryBudgetMs: 30_000 }),
      ).rejects.toThrow(/england: download of .* returned HTTP 404/);
      expect(counts().downloadCalls).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("company-ownership downloadCompaniesHouse (BUG-385)", () => {
  function stamp(back: number) {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }

  it("a 404 probe walks back a month and a transient download failure retries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bug385-company-ownership-"));
    try {
      let probeCalls = 0;
      let downloadCalls = 0;
      installFetch(async (url: unknown, init?: { headers?: Record<string, string> }) => {
        const u = String(url);
        if (init?.headers?.Range) {
          probeCalls += 1;
          if (u.includes(stamp(0))) return httpError(404);
          return {
            ok: true,
            status: 206,
            arrayBuffer: async () => new ArrayBuffer(0),
          };
        }
        downloadCalls += 1;
        if (downloadCalls === 1) throw connectTimeoutError();
        return { ok: true, status: 200, body: fullBody("ZIP-BYTES") };
      });
      const result = await downloadCompaniesHouse(dir, {
        delaysMs: [],
        retryBudgetMs: 30_000,
      });
      expect(result.edition).toBe(stamp(1).slice(0, 7));
      expect(probeCalls).toBe(2);
      expect(downloadCalls).toBe(2);
      expect(await readFile(result.path, "utf8")).toBe("ZIP-BYTES");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("a persistent transient probe failure past the budget throws the original error", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bug385-company-ownership-"));
    try {
      let probeCalls = 0;
      installFetch(async (_url: unknown, init?: { headers?: Record<string, string> }) => {
        if (init?.headers?.Range) {
          probeCalls += 1;
          throw connectTimeoutError();
        }
        throw new Error("unexpected download fetch");
      });
      await expect(
        downloadCompaniesHouse(dir, { delaysMs: [], retryBudgetMs: 100 }),
      ).rejects.toThrow(/fetch failed/);
      expect(probeCalls).toBeGreaterThan(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("a non-transient HTTP 404 on the download fails at once with a single attempt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bug385-company-ownership-"));
    try {
      let downloadCalls = 0;
      installFetch(async (_url: unknown, init?: { headers?: Record<string, string> }) => {
        if (init?.headers?.Range)
          return { ok: true, status: 206, arrayBuffer: async () => new ArrayBuffer(0) };
        downloadCalls += 1;
        return httpError(404);
      });
      await expect(
        downloadCompaniesHouse(dir, { delaysMs: [], retryBudgetMs: 30_000 }),
      ).rejects.toThrow(/the Companies House download failed \(HTTP 404\)/);
      expect(downloadCalls).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
