// BUG-387: re-fetch short pages, then a 1% read tolerance — all loaders.
//
// (a) A short read fails today: a page that comes back truncated and
//     is followed by an empty page kills the run ("paging stopped").
// (b) A short page recovered by the one re-fetch files complete.
// (c) A shortfall over 1% after the re-fetch still fails with nothing
//     filed. (d) A shortfall within 1% after the re-fetch files, with
//     the shortfall logged loudly. The gate decision itself
//     (verifyReadCounts) is unit-tested directly — the live OGC read
//     loop cannot end short through its public seam (it either
//     completes or throws mid-read), so the tolerance half of the
//     gate is proven at the function level and the re-fetch half
//     through the stubbed service below.
import { afterEach, describe, expect, it } from "vitest";
import {
  READ_TOLERANCE_FRACTION,
  assessShortRead,
  createShortPageTracker,
  isShortPage,
  shortReadNotice,
  verifyReadCounts,
  withinOnePercent,
} from "../loaders/read-tolerance.mjs";
import { readLive as readZonesLive } from "../loaders/load-flood-zones.mjs";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ZONES_WMS =
  "<WMS_Capabilities><Capability><Layer><Name>Flood_Zones_2_3_Rivers_and_Sea_21_10_2026</Name></Layer></Capability></WMS_Capabilities>";

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
function zonesFeatures(n: number) {
  return Array.from({ length: n }, () => zonesFeature());
}

describe("isShortPage — what counts as a short page (BUG-387)", () => {
  it("a full page is not short", () => {
    expect(isShortPage({ returned: 250, want: 250, read: 0, expected: 1000 })).toBe(false);
  });
  it("the final page returning the remainder is not short", () => {
    expect(isShortPage({ returned: 108, want: 108, read: 415300, expected: 415408 })).toBe(false);
  });
  it("a mid-read page returning fewer than asked is short", () => {
    expect(isShortPage({ returned: 200, want: 250, read: 1000, expected: 415408 })).toBe(true);
  });
  it("an empty page is not short — it is a failed page, not a short one", () => {
    expect(isShortPage({ returned: 0, want: 250, read: 1000, expected: 415408 })).toBe(false);
  });
  it("a page that completes the read is not short", () => {
    expect(isShortPage({ returned: 200, want: 250, read: 415208, expected: 415408 })).toBe(false);
  });
  it("non-integer inputs are never short", () => {
    expect(isShortPage({ returned: 200.5, want: 250, read: 1000, expected: 415408 })).toBe(false);
    expect(isShortPage({ returned: 200, want: 250, read: 1000, expected: 0 })).toBe(false);
  });
});

describe("withinOnePercent — the tolerance is shortfall-only (BUG-387)", () => {
  it("the fraction is 1%", () => {
    expect(READ_TOLERANCE_FRACTION).toBe(0.01);
  });
  it("an exact read is not a shortfall", () => {
    expect(withinOnePercent(415408, 415408)).toBe(false);
  });
  it("99 of 100 is inside the tolerance (boundary)", () => {
    expect(withinOnePercent(99, 100)).toBe(true);
  });
  it("98 of 100 is outside the tolerance", () => {
    expect(withinOnePercent(98, 100)).toBe(false);
  });
  it("411,254 of 415,408 is inside; 411,253 is outside", () => {
    expect(withinOnePercent(411254, 415408)).toBe(true);
    expect(withinOnePercent(411253, 415408)).toBe(false);
  });
  it("an overshoot is never tolerated", () => {
    expect(withinOnePercent(415409, 415408)).toBe(false);
  });
  it("a non-positive expected count is never tolerated", () => {
    expect(withinOnePercent(0, 0)).toBe(false);
    expect(withinOnePercent(5, -10)).toBe(false);
  });
});

describe("assessShortRead — the gate decision (BUG-387)", () => {
  it("an exact read is accepted with no tolerance", () => {
    expect(assessShortRead({ read: 415408, expected: 415408 })).toEqual({
      accepted: true,
      shortfall: 0,
      withinTolerance: false,
    });
  });
  it("a shortfall within 1% is accepted by the tolerance", () => {
    expect(assessShortRead({ read: 411300, expected: 415408 })).toEqual({
      accepted: true,
      shortfall: 4108,
      withinTolerance: true,
    });
  });
  it("a shortfall over 1% is not accepted", () => {
    expect(assessShortRead({ read: 411200, expected: 415408 })).toEqual({
      accepted: false,
      shortfall: 4208,
      withinTolerance: false,
    });
  });
  it("an overshoot is not accepted", () => {
    expect(assessShortRead({ read: 415500, expected: 415408 })).toEqual({
      accepted: false,
      shortfall: -92,
      withinTolerance: false,
    });
  });
});

describe("createShortPageTracker — the re-fetch record (BUG-387)", () => {
  it("records short pages, re-fetches and recovered features", () => {
    const tracker = createShortPageTracker();
    tracker.note({ startIndex: 1000, want: 250, returned: 200 });
    tracker.note({ startIndex: 5000, want: 250, returned: 120 });
    tracker.recordRefetch({ startIndex: 1000, returned: 250 });
    tracker.recordRefetch({ startIndex: 5000, returned: 100 });
    const summary = tracker.summary();
    expect(summary.refetched).toBe(2);
    // Only the gain counts as recovered: 50 on the first page,
    // nothing on the second (the re-fetch returned fewer).
    expect(summary.recovered).toBe(50);
    expect(summary.pages).toEqual([
      { startIndex: 1000, want: 250, returned: 200, refetched: true, recovered: 50 },
      { startIndex: 5000, want: 250, returned: 120, refetched: true, recovered: 0 },
    ]);
  });
  it("a re-fetch for an unnoted page is ignored", () => {
    const tracker = createShortPageTracker();
    tracker.recordRefetch({ startIndex: 0, returned: 250 });
    expect(tracker.summary()).toEqual({ pages: [], refetched: 0, recovered: 0 });
  });
});

describe("shortReadNotice — the loud log line (BUG-387)", () => {
  it("names the shortfall, the re-fetched pages and the final counts", () => {
    const notice = shortReadNotice({
      label: "flood zones",
      read: 411300,
      expected: 415408,
      refetch: {
        pages: [
          { startIndex: 100000, want: 250, returned: 200, refetched: true, recovered: 50 },
          { startIndex: 250000, want: 250, returned: 120, refetched: true, recovered: 0 },
        ],
        refetched: 2,
        recovered: 50,
      },
    });
    expect(notice).toContain("411,300 of 415,408");
    expect(notice).toContain("short 4,108 (0.99%)");
    expect(notice).toContain("re-fetching 2 short pages");
    expect(notice).toContain("100,000");
    expect(notice).toContain("250,000");
    expect(notice).toContain("recovered 50 features");
    expect(notice).toContain("1% tolerance (BUG-387)");
  });
  it("says so when no short page was re-fetched", () => {
    const notice = shortReadNotice({ label: "flood zones", read: 411300, expected: 415408 });
    expect(notice).toContain("no short pages re-fetched");
  });
});

describe("verifyReadCounts — the full read gate (BUG-387)", () => {
  const base = {
    label: "flood zones",
    filed: 415408,
    geoless: 0,
    refetch: null,
  };
  it("an exact read passes with no notice", () => {
    expect(verifyReadCounts({ ...base, read: 415408, expected: 415408 })).toEqual({
      shortfall: 0,
      withinTolerance: false,
      notice: null,
    });
  });
  it("a shortfall within 1% passes with the loud notice", () => {
    const verdict = verifyReadCounts({
      ...base,
      read: 411300,
      expected: 415408,
      filed: 411300,
    });
    expect(verdict.withinTolerance).toBe(true);
    expect(verdict.shortfall).toBe(4108);
    expect(verdict.notice).toContain("accepted within the 1% tolerance (BUG-387)");
  });
  it("a shortfall over 1% still fails with nothing filed", () => {
    expect(() => verifyReadCounts({ ...base, read: 411200, expected: 415408 })).toThrow(
      "flood zones: read 411200 features but the service count is 415408 — nothing filed",
    );
  });
  it("a shortfall over 1% after re-fetching names the re-fetch in the failure", () => {
    const refetch = {
      pages: [
        { startIndex: 1000, want: 250, returned: 200, refetched: true, recovered: 50 },
        { startIndex: 5000, want: 250, returned: 120, refetched: true, recovered: 0 },
      ],
      refetched: 2,
      recovered: 50,
    };
    expect(() => verifyReadCounts({ ...base, read: 411200, expected: 415408, refetch })).toThrow(
      "flood zones: read 411200 features but the service count is 415408 — re-fetched 2 short pages, still short by 4208 — nothing filed",
    );
  });
  it("an overshoot still fails", () => {
    expect(() => verifyReadCounts({ ...base, read: 415500, expected: 415408 })).toThrow(
      "flood zones: read 415500 features but the service count is 415408 — nothing filed",
    );
  });
  it("a reconciliation failure still fails", () => {
    expect(() =>
      verifyReadCounts({ ...base, read: 415408, expected: 415408, filed: 415400, geoless: 0 }),
    ).toThrow("flood zones: the processed counts do not reconcile — nothing filed");
  });
});

// A stubbed EA service with scripted pages: pages[startIndex] is the
// list of successive page bodies that startIndex answers, in order.
// An unscripted startIndex answers an empty page (the service
// stopping) — the shape that kills an unrepaired short read.
function scriptedService({
  count,
  pages,
}: {
  count: number;
  pages: Record<number, { features: unknown[] }[]>;
}) {
  const requests: number[] = [];
  const stub = async (url: unknown) => {
    const u = String(url);
    if (u.includes("/wms")) return okText(ZONES_WMS);
    if (u.includes("limit=1&")) return okJson({ numberMatched: count });
    if (u.includes("startIndex=")) {
      const startIndex = Number(new URL(u).searchParams.get("startIndex"));
      requests.push(startIndex);
      const script = pages[startIndex] ?? [];
      const body = script.shift();
      if (body) return okJson({ numberMatched: count, ...body });
      return okJson({ numberMatched: count, features: [] });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  return { stub, requests };
}

describe("readLive re-fetches a short page (BUG-387)", () => {
  it("(b) a short page recovered by the re-fetch files complete", async () => {
    const { stub, requests } = scriptedService({
      count: 3,
      pages: {
        0: [{ features: zonesFeatures(1) }, { features: zonesFeatures(3) }],
      },
    });
    globalThis.fetch = stub as typeof fetch;
    const result = await readZonesLive({ delaysMs: [] });
    expect(result.read).toBe(3);
    expect(result.filed).toBe(3);
    expect(result.refetch.refetched).toBe(1);
    expect(result.refetch.recovered).toBe(2);
    // The re-fetch saved the read: the page after the short one
    // was never requested.
    expect(requests).toEqual([0, 0]);
  });

  it("a short page the re-fetch cannot recover still fails loudly", async () => {
    // The re-fetch is one extra chance, not a mask: when the
    // re-fetch of the short page comes back empty, the run dies
    // on the empty page instead of filing short. (The fail-before
    // for the re-fetch itself is the test above, run with the
    // re-fetch reverted: there the same service kills the run
    // with "paging stopped at 1 of 3".)
    const { stub } = scriptedService({
      count: 3,
      pages: {
        0: [{ features: zonesFeatures(1) }],
        1: [{ features: [] }],
      },
    });
    globalThis.fetch = stub as typeof fetch;
    await expect(readZonesLive({ delaysMs: [] })).rejects.toThrow(/paging stopped/);
  });

  it("the fuller first page wins when the re-fetch returns fewer", async () => {
    const { stub, requests } = scriptedService({
      count: 3,
      pages: {
        0: [{ features: zonesFeatures(2) }, { features: zonesFeatures(1) }],
        2: [{ features: zonesFeatures(1) }],
      },
    });
    globalThis.fetch = stub as typeof fetch;
    const result = await readZonesLive({ delaysMs: [] });
    expect(result.read).toBe(3);
    expect(result.filed).toBe(3);
    expect(result.refetch.refetched).toBe(1);
    expect(result.refetch.recovered).toBe(0);
    expect(requests).toEqual([0, 0, 2]);
  });

  it("a final page returning the remainder is never re-fetched", async () => {
    const { stub, requests } = scriptedService({
      count: 251,
      pages: {
        0: [{ features: zonesFeatures(250) }],
        250: [{ features: zonesFeatures(1) }],
      },
    });
    globalThis.fetch = stub as typeof fetch;
    const result = await readZonesLive({ delaysMs: [] });
    expect(result.read).toBe(251);
    expect(result.refetch.refetched).toBe(0);
    expect(requests).toEqual([0, 250]);
  });

  it("a short mid-read page is re-fetched across a multi-page read", async () => {
    const { stub, requests } = scriptedService({
      count: 300,
      pages: {
        0: [{ features: zonesFeatures(200) }, { features: zonesFeatures(250) }],
        250: [{ features: zonesFeatures(50) }],
      },
    });
    globalThis.fetch = stub as typeof fetch;
    const result = await readZonesLive({ delaysMs: [] });
    expect(result.read).toBe(300);
    expect(result.filed).toBe(300);
    expect(result.refetch.refetched).toBe(1);
    expect(result.refetch.recovered).toBe(50);
    expect(requests).toEqual([0, 0, 250]);
  });
});
