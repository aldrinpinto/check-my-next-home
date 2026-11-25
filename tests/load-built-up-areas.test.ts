import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFixture } from "../loaders/load-built-up-areas.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the built-up areas loader (plan step M6.21,
// decision D41): the ONS Built Up Areas (December 2024)
// boundaries file DIRECT from ONS into planning_layers as
// built_up_area — never the platform's republished copy
// (England-only and older, rejected at the prep). The
// fixture (the seven areas around the three universal
// homes plus the Bath witness, from the live service on
// 16 Nov 2026) reproduces the pinned names below by an
// independent point-in-polygon over the filed polygons:
// Birkdale in Hatfield Peverel, Exeter in Newham (the
// Greater London borough rule — the built-up area takes
// the borough's name inside London), Minerva in Ewell,
// and the Bath witness inside Bath. The loader's own
// golden checks run in both modes; the filing proof runs
// in CI against a real PostGIS.

const loader = readFileSync(join(process.cwd(), "loaders/load-built-up-areas.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/built-up-areas");
const geojson = JSON.parse(readFileSync(join(fixtureDir, "built-up-areas.geojson"), "utf8")) as {
  features: {
    properties: { BUA24CD: string; BUA24NM: string };
    geometry: { type: string; coordinates: number[][][] | number[][][][] };
  }[];
};

const HOMES = {
  birkdale: { lat: 51.776176, lng: 0.60387 },
  exeter: { lat: 51.515224, lng: 0.021177 },
  epsom: { lat: 51.344571, lng: -0.247104 },
  bath: { lat: 51.3811, lng: -2.359 },
};

function ringContains(ring: number[][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function featureContains(
  feature: (typeof geojson.features)[number],
  lng: number,
  lat: number,
): boolean {
  const polys =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as number[][][]]
      : (feature.geometry.coordinates as number[][][][]);
  return polys.some((poly) => {
    if (!ringContains(poly[0], lng, lat)) return false;
    return !poly.slice(1).some((hole) => ringContains(hole, lng, lat));
  });
}

function areaAt(home: { lat: number; lng: number }): string | null {
  const hit = geojson.features.find((f) => featureContains(f, home.lng, home.lat));
  return hit ? hit.properties.BUA24NM : null;
}

describe("built-up areas loader sources", () => {
  it("reads the December 2024 edition direct from the ONS service", () => {
    expect(loader).toContain("services1.arcgis.com/ESMARspQHYMw9BZ9");
    expect(loader).toContain("main_ONS_BUA_2024_EW_V2");
    expect(loader).toContain('EDITION_DATE = "2024-12-01"');
    // The platform's republished copy is never the source.
    expect(loader).not.toContain("planning.data.gov.uk");
  });

  it("carries the attribution pinned from the ONS product itself", () => {
    expect(loader).toContain("contains OS data © Crown copyright and database right");
    expect(loader).toContain("Open Government Licence v.3.0");
  });

  it("files into planning_layers as built_up_area, keyed by the ONS code", () => {
    expect(loader).toContain("planning_layers");
    expect(loader).toContain("'built_up_area'");
    expect(loader).toContain("BUA24CD");
    expect(loader).toContain("BUA24NM");
  });
});

describe("built-up areas fixture goldens (16 Nov 2026 capture)", () => {
  it("the cut holds the seven areas around the homes and the witness", () => {
    expect(geojson.features.map((f) => f.properties.BUA24NM).sort()).toEqual([
      "Bath",
      "Epsom",
      "Ewell",
      "Hatfield Peverel",
      "Newham",
      "Tower Hamlets",
      "Witham",
    ]);
  });

  it("pins the three homes' areas from the filed polygons", () => {
    expect(areaAt(HOMES.birkdale)).toBe("Hatfield Peverel");
    expect(areaAt(HOMES.exeter)).toBe("Newham");
    expect(areaAt(HOMES.epsom)).toBe("Ewell");
  });

  it("pins the Bath witness inside Bath", () => {
    expect(areaAt(HOMES.bath)).toBe("Bath");
  });
});

// BUG-265: the paged read carries the shared progress logger
// — a line per 2,000 features (a closing line only at fixture
// scale: the fixture is one page of 7).
describe("progress logging (BUG-265)", () => {
  it("reads the fixture with a closing read line, and the read is unchanged", async () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-built-up-areas",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const processed = await readFixture(fixtureDir, { progress });
    expect(processed.filed).toBe(7);
    expect(processed.total).toBe(7);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/progress · read 7 features$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });
});
