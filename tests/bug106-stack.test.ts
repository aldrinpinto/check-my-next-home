import { describe, expect, it } from "vitest";
import type { AddressResolution } from "../lib/address";
import { nationOfPostcode } from "../lib/nation";
import { buildNearbyBundle, type NearbyDataSource, type NearbyPoint } from "../lib/nearby";

// The BUG-106 stack's own proofs: the nation gate and
// distance sanity in the nearby brain (slimmed Road A),
// and BUG-108's selective list. A fabricated source
// stands in for the filed tables: a Scottish home point
// with English points filed implausibly far away — the
// Gretna pattern from the sample reports.

const HOME = { latitude: 55.0, longitude: -3.0 };
// ~6.2 and ~6.5 miles north of the home point, in the
// brain's own haversine basis (1 degree lat ≈ 69 miles).
const NEAR_LAT = 55.09;
const NEAR_LAT_2 = 55.094;

function resolutionFor(postcode: string, lsoaCode: string): AddressResolution {
  return {
    rung: 2,
    kind: "address-list",
    street: null,
    building: null,
    addresses: [],
    directory: {
      postcode,
      latitude: HOME.latitude,
      longitude: HOME.longitude,
      council: "Cumberland",
      ward: "Longtown",
      region: "North West",
      lsoaCode,
      msoaCode: null,
    },
  };
}

function fakeSource(points: NearbyPoint[]): NearbyDataSource {
  return {
    async pointsWithin(category, latitude, longitude, radiusMiles) {
      void category;
      void latitude;
      void longitude;
      void radiusMiles;
      return points;
    },
    async nearestPoint() {
      return points[0] ?? null;
    },
    async filedCount() {
      return 10;
    },
    async industrialSiteFacts() {
      return { filedCount: 0, dataYear: null, sourceName: null, sourceDate: null, sites: [] };
    },
    async destinationsRelease() {
      return { filedCount: 0, ks4: null, ks5: null };
    },
  };
}

const ENGLISH_POINTS: NearbyPoint[] = [
  { name: "Faraway GP", latitude: 58.5, longitude: -3.0 },
  { name: "Grammar One", latitude: NEAR_LAT, longitude: -3.0, selective: true },
  { name: "Grammar Two", latitude: NEAR_LAT_2, longitude: -3.0, selective: true },
];

describe("BUG-106 — the postcode nation detector", () => {
  it("reads Scotland and Northern Ireland from the postcode area, never the filed small area", () => {
    expect(nationOfPostcode("DG16 5JB")).toBe("scotland");
    expect(nationOfPostcode("EH1 1BB")).toBe("scotland");
    expect(nationOfPostcode("BT1 1AA")).toBe("northern-ireland");
    expect(nationOfPostcode("CM3 2JT")).toBeNull();
    expect(nationOfPostcode("SY20 8QT")).toBeNull();
  });
});

describe("BUG-106 — the nearby nation gate", () => {
  it("a Scottish home (English LSOA filed, the Gretna case) gets not-covered, never the English points", async () => {
    const bundle = await buildNearbyBundle(
      resolutionFor("DG16 5JB", "E01021395"),
      fakeSource(ENGLISH_POINTS),
    );
    if (bundle.kind !== "distances") throw new Error("expected distances bundle");
    for (const key of ["gp", "schools-secondary", "station", "ev-chargers", "nurseries"]) {
      const answer = bundle.categories.find((c) => c.category === key);
      expect(answer?.state).toBe("not-covered");
      expect(answer?.places).toEqual([]);
      expect(answer?.beyondNearest).toBeNull();
      expect(answer?.line).toContain("Scotland");
    }
    const secondary = bundle.categories.find((c) => c.category === "schools-secondary");
    expect(secondary?.selectiveSchools).toEqual([]);
  });

  it("an England home at the same point is served as before", async () => {
    const bundle = await buildNearbyBundle(
      resolutionFor("CA6 5AA", "E01021395"),
      fakeSource(ENGLISH_POINTS),
    );
    if (bundle.kind !== "distances") throw new Error("expected distances bundle");
    const gp = bundle.categories.find((c) => c.category === "gp");
    // The filed GP stands ~240 miles away: beyond the
    // 25-mile sanity bound, so it is not named either.
    expect(gp?.beyondNearest).toBeNull();
  });
});

describe("BUG-108 — every selective secondary within 10 miles serves", () => {
  it("the secondary answer carries the full list, nearest first, each with its distance", async () => {
    const bundle = await buildNearbyBundle(
      resolutionFor("CA6 5AA", "E01021395"),
      fakeSource(ENGLISH_POINTS),
    );
    if (bundle.kind !== "distances") throw new Error("expected distances bundle");
    const secondary = bundle.categories.find((c) => c.category === "schools-secondary");
    expect(secondary?.selectiveSchools?.map((s) => s.name)).toEqual(["Grammar One", "Grammar Two"]);
    expect(secondary?.selectiveSchools?.[0]?.miles).toBeLessThan(
      secondary?.selectiveSchools?.[1]?.miles ?? 0,
    );
    expect(secondary?.nearestSelective?.name).toBe("Grammar One");
  });
});
