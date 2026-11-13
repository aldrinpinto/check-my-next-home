import { afterEach, describe, expect, it, vi } from "vitest";
import {
  planningApplicationCounts,
  probePlanningApplication,
} from "../loaders/canary-planning-application.mjs";

// Planning applications canary probe (plan step M5.12).
// The probe watches an empty dataset, so its three states
// are the whole contract: 0/0 is a healthy "still empty";
// any non-zero count is the trigger to re-open M5.12 as a
// filing step; and 503/403/unreachable is "source
// unreachable" in its own words — never read as "still
// empty" (the platform 503'd the build sandbox throughout
// prep day and at the build's start gate, 13 Nov 2026).
// Network stubbed throughout, per the other canary tests.

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

function stubDataset(dataset: unknown, pageHtml = "Data providers: 0") {
  vi.stubGlobal("fetch", async (input: unknown) => {
    const url = String(input);
    if (url.endsWith("planning-application.json")) return jsonResponse(dataset);
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => pageHtml,
    };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("planningApplicationCounts — the two published counts", () => {
  it("reads the entity count and a providers list from the dataset record", () => {
    expect(planningApplicationCounts({ "entity-count": 0, providers: [] }, null)).toEqual({
      entities: 0,
      providers: 0,
    });
    expect(
      planningApplicationCounts({ "entity-count": 143, providers: ["a", "b", "c"] }, null),
    ).toEqual({ entities: 143, providers: 3 });
  });

  it("reads a numeric provider-count from the dataset record", () => {
    expect(planningApplicationCounts({ "entity-count": 5, "provider-count": 2 }, null)).toEqual({
      entities: 5,
      providers: 2,
    });
  });

  it("falls back to the dataset page's own Data providers line", () => {
    expect(planningApplicationCounts({ "entity-count": 0 }, "<p>Data providers: 4</p>")).toEqual({
      entities: 0,
      providers: 4,
    });
  });

  it("leaves the provider count null when nothing carries it", () => {
    expect(planningApplicationCounts({ "entity-count": 0 }, null)).toEqual({
      entities: 0,
      providers: null,
    });
  });

  it("throws on an unreadable entity count — a shape change, never a silent zero", () => {
    expect(() => planningApplicationCounts({}, null)).toThrow(/entity-count/);
    expect(() => planningApplicationCounts({ "entity-count": "0" }, null)).toThrow(/entity-count/);
    expect(() => planningApplicationCounts(null, null)).toThrow(/entity-count/);
  });
});

describe("probePlanningApplication — the three states", () => {
  it("0 entities and 0 providers is a healthy 'still empty'", async () => {
    stubDataset({ "entity-count": 0, providers: [] });
    const outcome = (await probePlanningApplication()) as {
      logLine?: string;
      skipped?: string;
      warning?: boolean;
    };
    expect(outcome.skipped).toBeUndefined();
    expect(outcome.warning).toBeUndefined();
    expect(outcome.logLine).toContain("canary planning-application");
    expect(outcome.logLine).toContain("still empty");
  });

  it("reads the provider count off the page when the record omits it", async () => {
    stubDataset({ "entity-count": 0 }, "Total: 0 planning applications; Data providers: 0");
    const outcome = (await probePlanningApplication()) as { logLine?: string };
    expect(outcome.logLine).toContain("still empty");
  });

  it("a non-zero entity count is the re-open trigger (warning-grade)", async () => {
    stubDataset({ "entity-count": 143, providers: ["a"] });
    const outcome = (await probePlanningApplication()) as {
      logLine?: string;
      warning?: boolean;
    };
    expect(outcome.warning).toBe(true);
    expect(outcome.logLine).toContain("143 entities from 1 providers");
    expect(outcome.logLine).toContain("re-open M5.12 as a filing step");
  });

  it("providers alone moving off zero is also the trigger", async () => {
    stubDataset({ "entity-count": 0, "provider-count": 2 });
    const outcome = (await probePlanningApplication()) as {
      logLine?: string;
      warning?: boolean;
    };
    expect(outcome.warning).toBe(true);
    expect(outcome.logLine).toContain("re-open M5.12");
  });

  it("HTTP 403 is 'source unreachable', never 'still empty'", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse("Forbidden", 403));
    const outcome = (await probePlanningApplication()) as {
      logLine?: string;
      skipped?: string;
    };
    expect(outcome.logLine).toBeUndefined();
    expect(outcome.skipped).toContain("source unreachable");
    expect(outcome.skipped).toContain("HTTP 403");
    expect(outcome.skipped).not.toContain("healthy");
  });

  it("HTTP 503 surviving the retry is 'source unreachable', never 'still empty'", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse("Service unavailable", 503));
    const outcome = (await probePlanningApplication()) as {
      logLine?: string;
      skipped?: string;
    };
    expect(outcome.logLine).toBeUndefined();
    expect(outcome.skipped).toContain("source unreachable");
    expect(outcome.skipped).toContain("HTTP 503");
  });

  it("a network failure is 'source unreachable', never 'still empty'", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const outcome = (await probePlanningApplication()) as {
      logLine?: string;
      skipped?: string;
    };
    expect(outcome.logLine).toBeUndefined();
    expect(outcome.skipped).toContain("source unreachable");
  });

  it("a 200 with an unreadable shape fails loudly — not empty, not unreachable", async () => {
    stubDataset({ unexpected: true });
    await expect(probePlanningApplication()).rejects.toThrow(/entity-count/);
  });
});
