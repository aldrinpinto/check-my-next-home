// BUG-387 group B: re-fetch short pages, then a 1% read tolerance —
// nature designations + priority habitats.
//
// (a) A short page that stays short still fails with the
//     exact-validation throw, exactly as today.
// (b) A short page recovered by the one re-fetch files complete.
// (c) A shortfall over 1% after the re-fetch still fails with
//     nothing filed. (d) A shortfall within 1% files, with the
//     shortfall logged loudly. The live read loop cannot end
//     short through its public seam — a page that stays short
//     throws mid-read, exactly as today — so (c) and (d) are
//     proven at the gate the loaders now call (verifyReadCounts),
//     with each loader's own label and re-fetch record, while
//     (a) and (b) prove the re-fetch through the stubbed service.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgressLogger } from "../loaders/progress.mjs";
import { createShortPageTracker, verifyReadCounts } from "../loaders/read-tolerance.mjs";
import { readServiceLive } from "../loaders/load-nature-designations.mjs";
import { readPhiPages } from "../loaders/load-priority-habitats.mjs";

// The shared gate (verifyReadCounts) carries no JSDoc in the
// frozen helper, so its options infer too narrowly for a
// re-fetch record — the call-site type below states the
// helper's actual runtime contract (see the BUG-387 build
// report: the helper needs JSDoc at source).
type ReadGateArgs = {
  label: string;
  read: number;
  expected: number;
  filed: number;
  geoless: number;
  refetch?: { pages: unknown[]; refetched: number; recovered: number } | null;
};
const verifyGate = verifyReadCounts as unknown as (args: ReadGateArgs) => {
  shortfall: number;
  withinTolerance: boolean;
  notice: string | null;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// A stubbed ArcGIS service: script[offset] is the list of
// successive page bodies that offset answers, in order. An
// exhausted script repeats its last body (a persistently
// short page stays short); an unscripted offset answers the
// healthy page. Every page URL is recorded, so the tests can
// prove the re-fetch fired exactly once.
function scriptedArcGIS(route: (url: string) => unknown) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    return okJson(route(url));
  });
  return calls;
}

// --- nature designations (ArcGIS, count-driven) ---------------

const NATURE_SPEC = { service: "Test_Service", fields: ["OBJECTID", "NAME"], pageCap: 2 };
const natureFeature = (objectId: number) => ({
  properties: { OBJECTID: objectId, NAME: `site ${objectId}` },
  geometry: null,
});
function natureFeatures(firstObjectId: number, count: number) {
  return Array.from({ length: count }, (_, i) => natureFeature(firstObjectId + i));
}
function natureRoute(script: Record<number, { features: unknown[] }[]>) {
  const attempts = new Map<number, number>();
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
    const bodies = script[offset];
    if (bodies) return bodies[Math.min(attempt - 1, bodies.length - 1)];
    if (offset === 0) return { features: natureFeatures(1, 2) };
    if (offset === 2) return { features: natureFeatures(3, 2) };
    if (offset === 4) return { features: natureFeatures(5, 1) };
    throw new Error(`unexpected offset ${offset}`);
  };
}

describe("nature designations re-fetch (BUG-387)", () => {
  it("(a) a short page that stays short still fails with the exact-validation throw", async () => {
    scriptedArcGIS(
      natureRoute({ 2: [{ features: natureFeatures(3, 1) }, { features: natureFeatures(3, 1) }] }),
    );
    await expect(readServiceLive(NATURE_SPEC, { delaysMs: [] })).rejects.toThrow(
      /the count contract requires exactly 2/,
    );
  });

  it("(b) a short page recovered by the one re-fetch files complete", async () => {
    const calls = scriptedArcGIS(
      natureRoute({ 2: [{ features: natureFeatures(3, 1) }, { features: natureFeatures(3, 2) }] }),
    );
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-nature-designations",
      log: (line: string) => lines.push(line),
    });
    const result = await readServiceLive(NATURE_SPEC, { delaysMs: [], progress });
    expect(result.features).toHaveLength(5);
    expect(result.expected).toBe(5);
    // Exactly one re-fetch of the short page — no more.
    expect(calls.filter((url) => url.includes("resultOffset=2")).length).toBe(2);
    expect(result.refetch.refetched).toBe(1);
    expect(result.refetch.recovered).toBe(1);
    expect(lines.some((l) => l.includes("short page re-fetched (BUG-387)"))).toBe(true);
  });

  it("a healthy read fires no re-fetch", async () => {
    const calls = scriptedArcGIS(natureRoute({}));
    const result = await readServiceLive(NATURE_SPEC, { delaysMs: [] });
    expect(result.features).toHaveLength(5);
    expect(result.refetch.refetched).toBe(0);
    expect(calls.filter((url) => url.includes("resultOffset=")).length).toBe(3);
  });

  it("(c) a shortfall over 1% after the re-fetch still fails with nothing filed", () => {
    const refetch = createShortPageTracker();
    refetch.note({ startIndex: 2000, want: 2, returned: 1 });
    refetch.recordRefetch({ startIndex: 2000, returned: 1 });
    expect(() =>
      verifyGate({
        label: "SSSI_England",
        read: 4058,
        expected: 4100,
        filed: 4058,
        geoless: 0,
        refetch: refetch.summary(),
      }),
    ).toThrow(
      "SSSI_England: read 4058 features but the service count is 4100 — re-fetched 1 short page, still short by 42 — nothing filed",
    );
  });

  it("(d) a shortfall within 1% files with the shortfall logged", () => {
    const refetch = createShortPageTracker();
    refetch.note({ startIndex: 2000, want: 2, returned: 1 });
    refetch.recordRefetch({ startIndex: 2000, returned: 2 });
    const verdict = verifyGate({
      label: "SSSI_England",
      read: 4090,
      expected: 4100,
      filed: 4090,
      geoless: 0,
      refetch: refetch.summary(),
    });
    expect(verdict.withinTolerance).toBe(true);
    expect(verdict.shortfall).toBe(10);
    expect(verdict.notice).toContain("read 4,090 of 4,100 expected SSSI_England features");
    expect(verdict.notice).toContain("accepted within the 1% tolerance (BUG-387)");
  });
});

// --- priority habitats (ArcGIS, count-driven) -----------------

const PHI_LAYER = "https://example.test/phi/FeatureServer/0";
const phiFeature = (objectId: number) => ({ properties: { OBJECTID: objectId }, geometry: null });
function phiPage(firstObjectId: number, count: number, final: boolean) {
  const features = Array.from({ length: count }, (_, i) => phiFeature(firstObjectId + i));
  return final ? { features } : { features, properties: { exceededTransferLimit: true } };
}
function phiRoute(script: Record<number, unknown[]>) {
  const attempts = new Map<number, number>();
  return (url: string) => {
    const offset = Number(new URL(url).searchParams.get("resultOffset"));
    const attempt = (attempts.get(offset) ?? 0) + 1;
    attempts.set(offset, attempt);
    const bodies = script[offset];
    if (bodies) return bodies[Math.min(attempt - 1, bodies.length - 1)];
    if (offset === 0) return phiPage(1, 2000, false);
    if (offset === 2000) return phiPage(2001, 2000, false);
    if (offset === 4000) return phiPage(4001, 500, true);
    throw new Error(`unexpected offset ${offset}`);
  };
}

describe("priority habitats re-fetch (BUG-387)", () => {
  it("(a) a short page that stays short still fails with the exact-validation throw", async () => {
    scriptedArcGIS(phiRoute({ 2000: [phiPage(2001, 1500, false), phiPage(2001, 1500, false)] }));
    await expect(readPhiPages(PHI_LAYER, 4500, async () => {}, { delaysMs: [] })).rejects.toThrow(
      /the count contract requires exactly 2000/,
    );
  });

  it("(b) a short page recovered by the one re-fetch files complete", async () => {
    const calls = scriptedArcGIS(
      phiRoute({ 2000: [phiPage(2001, 1500, false), phiPage(2001, 2000, false)] }),
    );
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-priority-habitats",
      log: (line: string) => lines.push(line),
    });
    const refetch = createShortPageTracker();
    const delivered: number[] = [];
    const read = await readPhiPages(
      PHI_LAYER,
      4500,
      async (batch: unknown[]) => {
        delivered.push(batch.length);
      },
      { delaysMs: [], progress, refetch },
    );
    expect(read).toBe(4500);
    expect(delivered).toEqual([2000, 2000, 500]);
    // Exactly one re-fetch of the short page — no more.
    expect(calls.filter((url) => url.includes("resultOffset=2000")).length).toBe(2);
    expect(refetch.summary().refetched).toBe(1);
    expect(refetch.summary().recovered).toBe(500);
    expect(lines.some((l) => l.includes("short page re-fetched (BUG-387)"))).toBe(true);
  });

  it("a healthy read fires no re-fetch", async () => {
    const calls = scriptedArcGIS(phiRoute({}));
    const refetch = createShortPageTracker();
    const read = await readPhiPages(PHI_LAYER, 4500, async () => {}, { delaysMs: [], refetch });
    expect(read).toBe(4500);
    expect(refetch.summary().refetched).toBe(0);
    expect(calls.filter((url) => url.includes("resultOffset=")).length).toBe(3);
  });

  it("(c) a shortfall over 1% after the re-fetch still fails with nothing filed", () => {
    const refetch = createShortPageTracker();
    refetch.note({ startIndex: 2000, want: 2000, returned: 1500 });
    refetch.recordRefetch({ startIndex: 2000, returned: 1500 });
    expect(() =>
      verifyGate({
        label: "PHI",
        read: 809000,
        expected: 818225,
        filed: 809000,
        geoless: 0,
        refetch: refetch.summary(),
      }),
    ).toThrow(
      "PHI: read 809000 features but the service count is 818225 — re-fetched 1 short page, still short by 9225 — nothing filed",
    );
  });

  it("(d) a shortfall within 1% files with the shortfall logged", () => {
    const refetch = createShortPageTracker();
    refetch.note({ startIndex: 2000, want: 2000, returned: 1500 });
    refetch.recordRefetch({ startIndex: 2000, returned: 2000 });
    const verdict = verifyGate({
      label: "PHI",
      read: 810500,
      expected: 818225,
      filed: 810500,
      geoless: 0,
      refetch: refetch.summary(),
    });
    expect(verdict.withinTolerance).toBe(true);
    expect(verdict.shortfall).toBe(7725);
    expect(verdict.notice).toContain("read 810,500 of 818,225 expected PHI features");
    expect(verdict.notice).toContain("accepted within the 1% tolerance (BUG-387)");
  });
});
