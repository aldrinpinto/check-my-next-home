// Group-A transient retry — a transient fetch failure is
// retried for up to 30 minutes (TRANSIENT_RETRY_BUDGET_MS,
// BUG-385 cap, founder-ordered 27 Nov 2026); a
// non-transient failure fails at once, and a persistent
// transient failure past the budget throws the original
// error. The same retry the flood loaders got in BUG-384,
// wired into the ten group-A loaders here. Each loader is
// proved through its exported fetch helper, and the three
// loaders with a cheap live entry point (AQMA, nature
// designations, priority habitats) are proved through that
// entry point too, so the threading from the entry point
// down to the fetch is covered, not just the helper.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { fetchText as fetchAirText } from "../loaders/load-air-quality.mjs";
import { fetchJson as fetchAqmaJson, readLive as readAqmaLive } from "../loaders/load-aqma.mjs";
import { fetchText as fetchBrownfieldText } from "../loaders/load-brownfield.mjs";
import { fetchJson as fetchChargingJson } from "../loaders/load-charging-zones.mjs";
import { fetchText as fetchGreenBeltText } from "../loaders/load-green-belt.mjs";
import { fetchText as fetchHeritageText } from "../loaders/load-heritage.mjs";
import {
  fetchJson as fetchNatureJson,
  readServiceLive as readNatureLive,
  SERVICES as NATURE_SERVICES,
} from "../loaders/load-nature-designations.mjs";
import { fetchText as fetchPlanningText } from "../loaders/load-planning-areas.mjs";
import { fetchJson as fetchPhiJson, readPhiPages } from "../loaders/load-priority-habitats.mjs";
import {
  downloadGreenspaceFile,
  fetchJson as fetchGreenspaceJson,
} from "../loaders/load-os-greenspace.mjs";

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
    json: async () => JSON.parse(body),
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

type RetryOpts = { delaysMs: number[]; retryBudgetMs: number };
type FetchCall = (url: string, what: string, opts: RetryOpts) => Promise<unknown>;

// One retry suite per loader: (a) transient failures are
// retried and a later success is returned; (b) a persistent
// transient failure past the budget throws the original
// error; (c) a non-transient failure fails at once with a
// single attempt.
function retrySuite(name: string, call: FetchCall, okBody: () => unknown, expected: unknown) {
  describe(`${name} — transient retry (BUG-385)`, () => {
    it("retries transient failures and returns a later success", async () => {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        if (calls <= 2) throw connectTimeoutError();
        return okBody();
      }) as unknown as typeof fetch;
      await expect(
        call("https://example.invalid/x", "the test download", {
          delaysMs: [],
          retryBudgetMs: 30_000,
        }),
      ).resolves.toEqual(expected);
      expect(calls).toBe(3);
    });

    it("throws the original error once the budget is spent", async () => {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        throw connectTimeoutError();
      }) as unknown as typeof fetch;
      await expect(
        call("https://example.invalid/x", "the test download", {
          delaysMs: [],
          retryBudgetMs: 50,
        }),
      ).rejects.toThrow(/fetch failed/);
      // It retried before giving up — the budget is spent
      // retrying, not a first-attempt failure.
      expect(calls).toBeGreaterThan(1);
    });

    it("fails at once on a non-transient HTTP 404", async () => {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        return httpError(404);
      }) as unknown as typeof fetch;
      await expect(
        call("https://example.invalid/x", "the test download", {
          delaysMs: [],
          retryBudgetMs: 30_000,
        }),
      ).rejects.toThrow(/HTTP 404/);
      expect(calls).toBe(1);
    });
  });
}

retrySuite(
  "air-quality",
  (url, _what, opts) => fetchAirText(url, opts),
  () => okText("hello"),
  "hello",
);
retrySuite(
  "aqma",
  (url, what, opts) => fetchAqmaJson(url, what, opts),
  () => okJson({ ok: true }),
  { ok: true },
);
retrySuite(
  "brownfield",
  (url, what, opts) => fetchBrownfieldText(url, what, opts),
  () => okText("hello"),
  "hello",
);
retrySuite(
  "charging-zones",
  (url, what, opts) => fetchChargingJson(url, what, opts),
  () => okJson({ ok: true }),
  { ok: true },
);
retrySuite(
  "green-belt",
  (url, what, opts) => fetchGreenBeltText(url, what, opts),
  () => okText("hello"),
  "hello",
);
retrySuite(
  "heritage",
  (url, what, opts) => fetchHeritageText(url, what, opts),
  () => okText("hello"),
  "hello",
);
retrySuite(
  "nature-designations",
  (url, what, opts) => fetchNatureJson(url, what, opts),
  () => okJson({ ok: true }),
  { ok: true },
);
retrySuite(
  "planning-areas",
  (url, what, opts) => fetchPlanningText(url, what, opts),
  () => okText("hello"),
  "hello",
);
retrySuite(
  "priority-habitats",
  (url, what, opts) => fetchPhiJson(url, what, opts),
  () => okJson({ ok: true }),
  { ok: true },
);
retrySuite(
  "os-greenspace",
  (url, what, opts) => fetchGreenspaceJson(url, what, opts),
  () => okJson({ ok: true }),
  { ok: true },
);

// The entry points thread the retry options down to the
// fetch — proved here, so the wiring is not helper-only.
describe("entry points thread the retry options through (BUG-385)", () => {
  it("aqma readLive survives 2 connect timeouts on the boundaries page", async () => {
    let pageAttempts = 0;
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes("/0/query")) {
        pageAttempts += 1;
        if (pageAttempts <= 2) throw connectTimeoutError();
        return okJson({ features: [] });
      }
      return okJson({ serviceDescription: "AQMA boundaries. Published: 2026_10_20" });
    }) as unknown as typeof fetch;
    const result = await readAqmaLive({ delaysMs: [], retryBudgetMs: 30_000 });
    expect(result.edition).toBe("2026-10-20");
    expect(result.total).toBe(0);
    expect(pageAttempts).toBe(3);
  });

  it("nature readServiceLive survives 2 connect timeouts on the features page", async () => {
    const spec = NATURE_SERVICES.sssi;
    let pageAttempts = 0;
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes("returnCountOnly")) return okJson({ count: 1 });
      if (u.includes("resultOffset")) {
        pageAttempts += 1;
        if (pageAttempts <= 2) throw connectTimeoutError();
        return okJson({ features: [{ properties: { OBJECTID: 1 } }] });
      }
      return okJson({
        fields: spec.fields.map((name: string) => ({ name })),
        editingInfo: { dataLastEditDate: Date.parse("2026-01-01") },
        maxRecordCount: 250,
      });
    }) as unknown as typeof fetch;
    const result = await readNatureLive(spec, { delaysMs: [], retryBudgetMs: 30_000 });
    expect(result.expected).toBe(1);
    expect(result.features).toHaveLength(1);
    expect(pageAttempts).toBe(3);
  });

  it("priority-habitats readPhiPages survives 2 connect timeouts on the page", async () => {
    let pageAttempts = 0;
    globalThis.fetch = (async () => {
      pageAttempts += 1;
      if (pageAttempts <= 2) throw connectTimeoutError();
      return okJson({ features: [{ properties: { OBJECTID: 7 } }], properties: {} });
    }) as unknown as typeof fetch;
    const seen: unknown[] = [];
    const read = await readPhiPages(
      "https://example.invalid/FeatureServer/0",
      1,
      async (batch) => {
        seen.push(...batch);
      },
      { delaysMs: [], retryBudgetMs: 30_000 },
    );
    expect(read).toBe(1);
    expect(seen).toHaveLength(1);
    expect(pageAttempts).toBe(3);
  });
});

// The Greenspace download retries the WHOLE download from
// scratch: a cut mid-body restarts the file, and each
// attempt writes a fresh temp file — a failed attempt's
// partial file is discarded, never renamed into place.
describe("os-greenspace download retries whole from scratch (BUG-385)", () => {
  it("restarts after a mid-download cut and files the complete bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cmnh-bug385-greenspace-"));
    try {
      const dest = join(dir, "opgrsp_gb.zip");
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        if (calls === 1) {
          const cut = new Readable({ read() {} });
          cut.push(Buffer.from("partial-"));
          cut.destroy(connectTimeoutError());
          return { ok: true, status: 200, body: Readable.toWeb(cut) };
        }
        return {
          ok: true,
          status: 200,
          body: Readable.toWeb(Readable.from([Buffer.from("complete-bytes")])),
        };
      }) as unknown as typeof fetch;
      await expect(
        downloadGreenspaceFile("https://example.invalid/opgrsp.zip", dest, {
          delaysMs: [],
          retryBudgetMs: 30_000,
        }),
      ).resolves.toBe(dest);
      expect(await readFile(dest, "utf8")).toBe("complete-bytes");
      expect(calls).toBe(2);
      // No partial attempt file survives beside the download.
      expect((await readdir(dir)).filter((n) => n.includes(".attempt-"))).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws the original error once the budget is spent and files nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cmnh-bug385-greenspace-"));
    try {
      const dest = join(dir, "opgrsp_gb.zip");
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        throw connectTimeoutError();
      }) as unknown as typeof fetch;
      await expect(
        downloadGreenspaceFile("https://example.invalid/opgrsp.zip", dest, {
          delaysMs: [],
          retryBudgetMs: 50,
        }),
      ).rejects.toThrow(/fetch failed/);
      expect(calls).toBeGreaterThan(1);
      expect(await readdir(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails at once on a non-transient HTTP 404", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cmnh-bug385-greenspace-"));
    try {
      const dest = join(dir, "opgrsp_gb.zip");
      let calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        return { ok: false, status: 404, body: null };
      }) as unknown as typeof fetch;
      await expect(
        downloadGreenspaceFile("https://example.invalid/opgrsp.zip", dest, {
          delaysMs: [],
          retryBudgetMs: 30_000,
        }),
      ).rejects.toThrow(/Greenspace download returned HTTP 404/);
      expect(calls).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
