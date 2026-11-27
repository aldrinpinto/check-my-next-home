// BUG-389 (27 Nov 2026): the flood zones loader died twice on the
// identical contract failure at startIndex 409,991/415,408 (99%) —
// an Environment Agency feature whose flood_source is null:
//   contract failure: flood_source "null" is outside {river, sea, river and sea, unknown}
// The live page at that offset carries exactly one such feature
// (Flood_Zones_2_3_Rivers_and_Sea.410161: FZ2, origin "recorded",
// flood_source null; numberMatched still 415,408). A missing
// source now files as "unknown" — "unknown" is already in the
// published vocabulary — the mapping is logged loudly per page,
// and any other out-of-vocabulary value still fails the run.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readFixture, readLive } from "../loaders/load-flood-zones.mjs";

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

// The real bad feature's shape, shrunk to a valid polygon.
function nullSourceFeature() {
  return {
    id: "Flood_Zones_2_3_Rivers_and_Sea.410161",
    properties: { flood_zone: "FZ2", flood_source: null, origin: "recorded" },
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

function stubService(feature: unknown) {
  return async (url: unknown) => {
    const u = String(url);
    if (u.includes("/wms")) return okText(ZONES_WMS);
    if (u.includes("limit=1&")) return okJson({ numberMatched: 1 });
    if (u.includes("startIndex=")) return okJson({ numberMatched: 1, features: [feature] });
    throw new Error(`unexpected fetch ${u}`);
  };
}

function progressStub() {
  const warnings: { what: string; value: string; threshold: string }[] = [];
  return {
    warnings,
    progress: {
      warning: (w: { what: string; value: string; threshold: string }) => {
        warnings.push(w);
      },
      tally: () => ({ tick() {}, finish() {} }),
      heartbeat: () => false,
      count() {},
      stage() {},
      failed() {},
      pulse: () => () => {},
    },
  };
}

describe("BUG-389: a null flood_source files as unknown", () => {
  it("live read: null flood_source files as FZ2 with detail 'unknown · recorded'", async () => {
    globalThis.fetch = stubService(nullSourceFeature()) as typeof fetch;
    const { warnings, progress } = progressStub();
    const result = await readLive({ delaysMs: [], progress });
    expect(result.read).toBe(1);
    expect(result.filed).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].label).toBe("FZ2");
    expect(result.items[0].detail).toBe("unknown · recorded");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].what).toMatch(/null.*unknown|unknown.*null/i);
    expect(warnings[0].value).toMatch(/1 feature/);
  });

  it("live read: a missing flood_source (undefined) files as unknown too", async () => {
    const feature = nullSourceFeature();
    delete (feature.properties as Record<string, unknown>).flood_source;
    globalThis.fetch = stubService(feature) as typeof fetch;
    const { warnings, progress } = progressStub();
    const result = await readLive({ delaysMs: [], progress });
    expect(result.read).toBe(1);
    expect(result.items[0].detail).toBe("unknown · recorded");
    expect(warnings).toHaveLength(1);
  });

  it("live read: any other out-of-vocabulary value still fails the run", async () => {
    const feature = nullSourceFeature();
    (feature.properties as Record<string, unknown>).flood_source = "lake";
    globalThis.fetch = stubService(feature) as typeof fetch;
    await expect(readLive({ delaysMs: [] })).rejects.toThrow(
      'contract failure: flood_source "lake" is outside {river, sea, river and sea, unknown}',
    );
  });

  it("fixture read: null flood_source files as unknown", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bug389-fixture-"));
    try {
      writeFileSync(join(dir, "fixture.json"), JSON.stringify({ edition: "2026-10-21" }));
      writeFileSync(
        join(dir, "flood-zones.geojson"),
        JSON.stringify({ features: [nullSourceFeature()] }),
      );
      const { warnings, progress } = progressStub();
      const result = await readFixture(dir, { progress });
      expect(result.read).toBe(1);
      expect(result.items[0].detail).toBe("unknown · recorded");
      expect(warnings).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
