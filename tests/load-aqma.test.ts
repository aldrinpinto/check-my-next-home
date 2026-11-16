import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BAND_HIGH,
  BAND_LOW,
  NATION_FLOORS,
  SNAPSHOT,
  checkCoverage,
  checkGolden,
  nationOf,
  parseEdition,
  polygonsBoundaryMiles,
  polygonsContain,
  processFeatures,
} from "../loaders/load-aqma.mjs";

// Guards the Air Quality Management Areas loader (plan
// step M6.30, decision D59): the Ricardo ArcGIS service
// for Defra UK-AIR, layer 0 "All pollutants", filed into
// planning_layers as constraint_type 'aqma' — no new
// table, no migration. The file is UK-wide despite the
// catalogue calling it England-only (measured from the
// file itself: 374 areas, England 310 / Wales 32 /
// Scotland 14 / Northern Ireland 18), and it carries NO
// per-area dates, so the filing stamps the dataset
// edition parsed from the service description and the
// served answer carries that date (the register pages
// holding per-area dates are never read). Coverage is a
// loader contract — total band + per-nation floors —
// because a future edition that silently dropped a
// nation must fail the filing rather than serve false
// absences. The fixture is a cut of the real 2026-10-20
// edition (72 areas around the golden homes plus one
// per devolved nation, captured 16 Nov 2026); the
// loader's own golden checks run over it; the filing
// proof runs in CI against a real PostGIS.

const loader = readFileSync(join(process.cwd(), "loaders/load-aqma.mjs"), "utf8");
const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/aqma");

type RawFeature = {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } | null;
};
const loadFixture = (name: string): RawFeature[] =>
  (JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as { features: RawFeature[] }).features;
const fixture = loadFixture("aqma.geojson");
const fixtureB = loadFixture("aqma-edition-b.geojson");
const serviceMeta = JSON.parse(readFileSync(join(fixtureDir, "service.json"), "utf8")) as {
  serviceDescription: string;
};

const HOMES = {
  birkdale: { lat: 51.776176, lng: 0.60387 },
  exeter: { lat: 51.515224, lng: 0.021177 },
  minerva: { lat: 51.344571, lng: -0.247104 },
  cardiff: { lat: 51.467947, lng: -3.192837 },
  edinburgh: { lat: 55.9533, lng: -3.1883 },
};

describe("AQMA loader sources", () => {
  it("reads layer 0 of the UK-AIR service Ricardo operates for Defra", () => {
    expect(loader).toContain(
      "ukair.maps.rcdo.co.uk/ukairserver/rest/services/AQMA/aqma_boundaries/MapServer",
    );
    expect(loader).toContain('SOURCE_NAME = "Defra UK-AIR — Air Quality Management Areas"');
    // The register's per-area pages are never the source.
    expect(loader).not.toContain("aqma/details");
  });

  it("is registered quarterly, with its friendly names, fixture pass and canary probe", () => {
    expect(runner).toContain('{ item: "load-aqma", cadence: "quarterly", timeoutMinutes: 30 }');
    expect(runner).toContain('"load-aqma": "Air Quality Management Areas');
    expect(runner).toContain('await runAndLog("load-aqma", ["--file", fx("aqma")])');
    expect(canary).toContain("probeAqma");
    expect(canary).toContain('await run("aqma", probeAqma)');
  });

  it("files into planning_layers as aqma — no new table, no migration", () => {
    expect(loader).toContain("DELETE FROM planning_layers WHERE constraint_type = 'aqma'");
    expect(loader).toContain("INSERT INTO planning_layers");
    // The un-filed fields stay un-filed (prep section 2):
    // source prose, the change log, the objective
    // shorthand and the non-unique AQMA_ID.
    for (const field of ["DESCRIPTIO", "CHANGE_LOG", "NO2_LV", "AQMA_ID"])
      expect(loader).not.toContain(`props.${field}`);
  });
});

describe("AQMA edition discipline (prep check 4)", () => {
  it("parses the edition from the service description", () => {
    expect(parseEdition(serviceMeta)).toBe("2026-10-20");
    expect(parseEdition({ serviceDescription: "Published: 2027_01_05" })).toBe("2027-01-05");
  });

  it("fails loud when the Published date is absent or unparseable", () => {
    expect(() => parseEdition({ serviceDescription: "no date here" })).toThrow(/Published/);
    expect(() => parseEdition({})).toThrow(/Published/);
    expect(() => parseEdition(null)).toThrow(/Published/);
  });
});

describe("AQMA fixture — the 2026-10-20 edition cut", () => {
  const processed = processFeatures(fixture);

  it("files 72 areas across all four nations", () => {
    expect(processed.total).toBe(72);
    expect(processed.filed).toHaveLength(72);
    expect(processed.perNation).toEqual({ E: 62, W: 5, S: 4, N: 1 });
  });

  it("keys on AQMA_REF and files name, authority and pollutant codes in register order", () => {
    const newham = processed.filed.find((f) => f.ref === 3604);
    expect(newham?.name).toBe("Newham AQMA (No. 2)");
    expect(newham?.authority).toBe("London Borough of Newham");
    expect(newham?.pollutants).toEqual(["NO2", "PM10"]);
    expect(newham?.nation).toBe("E");
  });

  it("passes the loader's own golden checks on the fixture", () => {
    expect(() => checkGolden(processed)).not.toThrow();
  });

  it("Exeter falls inside the Newham AQMA (No. 2) and no other filed area", () => {
    const inside = processed.filed.filter((f) =>
      polygonsContain(f.polygons, HOMES.exeter.lng, HOMES.exeter.lat),
    );
    expect(inside.map((f) => f.ref)).toEqual([3604]);
  });

  it("Minerva's nearest is the Sutton AQMA at ~0.929 miles; Kingston is second at ~1.999", () => {
    const scored = processed.filed
      .map((f) => ({
        f,
        miles: polygonsBoundaryMiles(f.polygons, HOMES.minerva.lat, HOMES.minerva.lng),
      }))
      .sort((a, b) => a.miles - b.miles);
    expect(scored[0].f.name).toBe("Sutton AQMA");
    expect(scored[0].miles).toBeCloseTo(0.929, 2);
    // The flagged edge (prep section 6): the
    // second-nearest sits on the 2-mile line on the
    // golden-check basis; only the single nearest is
    // ever served, so the PostGIS figure landing either
    // side of 2.00 changes nothing served.
    expect(scored[1].f.name).toBe("Kingston upon Thames AQMA");
    expect(scored[1].miles).toBeCloseTo(1.999, 1);
  });

  it("Birkdale has no area covering it or within 2 miles (nearest ~4.30 miles)", () => {
    const scored = processed.filed
      .map((f) => ({
        f,
        miles: polygonsBoundaryMiles(f.polygons, HOMES.birkdale.lat, HOMES.birkdale.lng),
      }))
      .sort((a, b) => a.miles - b.miles);
    expect(scored[0].miles).toBeGreaterThan(2);
    expect(scored[0].f.name).toBe("MDC Air Quality Management Area number 1");
    expect(scored[0].miles).toBeCloseTo(4.3, 1);
  });

  it("Cardiff's nearest is the Cardiff City Centre AQMA at ~0.883 miles (the Welsh witness)", () => {
    const scored = processed.filed
      .map((f) => ({
        f,
        miles: polygonsBoundaryMiles(f.polygons, HOMES.cardiff.lat, HOMES.cardiff.lng),
      }))
      .sort((a, b) => a.miles - b.miles);
    expect(scored[0].f.name).toBe("Cardiff City Centre AQMA");
    expect(scored[0].f.authority).toBe("Cardiff County Council");
    expect(scored[0].miles).toBeCloseTo(0.883, 2);
  });

  it("Edinburgh EH1 1AA falls inside AQMA No. 1 City Centre (the Scottish inside witness)", () => {
    const inside = processed.filed.filter((f) =>
      polygonsContain(f.polygons, HOMES.edinburgh.lng, HOMES.edinburgh.lat),
    );
    expect(inside.map((f) => f.ref)).toEqual([69]);
    expect(inside[0].authority).toBe("Edinburgh City Council");
  });
});

// A minimal synthetic feature: a small square polygon
// around a far-away point, valid under every per-feature
// rule, parameterised by the contract dimension under
// test.
function syntheticFeature(ref: number, overrides: Record<string, unknown> = {}): RawFeature {
  const c: [number, number][] = [
    [10, 50],
    [10.01, 50],
    [10.01, 50.01],
    [10, 50.01],
    [10, 50],
  ];
  return {
    properties: {
      AQMA_REF: ref,
      TITLE: `Synthetic AQMA ${ref}`,
      LOCAL_AUTH: "Synthetic Council",
      NO2: 1,
      PM10: 0,
      SO2: 0,
      BENZENE: 0,
      LA_ONS_ID: "E06000000",
      ...overrides,
    },
    geometry: { type: "Polygon", coordinates: [c] },
  };
}

function syntheticEdition(counts: Record<string, number>): RawFeature[] {
  const features: RawFeature[] = [];
  let ref = 900000;
  for (const [letter, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i += 1) {
      ref += 1;
      features.push(syntheticFeature(ref, { LA_ONS_ID: `${letter}06000000` }));
    }
  }
  return features;
}

describe("AQMA coverage contract (prep check 1)", () => {
  it("the band is 337–411 around the 374 snapshot", () => {
    expect(SNAPSHOT).toBe(374);
    expect(BAND_LOW).toBe(337);
    expect(BAND_HIGH).toBe(411);
    expect(NATION_FLOORS).toEqual({ E: 200, W: 10, S: 5, N: 5 });
  });

  it("a compliant synthetic edition passes", () => {
    const processed = processFeatures(syntheticEdition({ E: 315, W: 12, S: 6, N: 7 }));
    expect(processed.filed).toHaveLength(340);
    expect(() => checkCoverage(processed)).not.toThrow();
  });

  it("a total outside the band fails the filing", () => {
    const processed = processFeatures(syntheticEdition({ E: 300, W: 12, S: 6, N: 7 }));
    expect(processed.filed).toHaveLength(325);
    expect(() => checkCoverage(processed)).toThrow(/outside the band/);
  });

  it("any nation below its floor fails the filing, even inside the band", () => {
    const scotlandShort = processFeatures(syntheticEdition({ E: 320, W: 12, S: 4, N: 7 }));
    expect(scotlandShort.filed).toHaveLength(343);
    expect(() => checkCoverage(scotlandShort)).toThrow(/Scotland files 4 areas, below its floor/);
    const walesShort = processFeatures(syntheticEdition({ E: 320, W: 9, S: 6, N: 7 }));
    expect(() => checkCoverage(walesShort)).toThrow(/Wales files 9 areas, below its floor/);
  });

  it("nationOf places areas by the LA_ONS_ID first letter and refuses anything else", () => {
    expect(nationOf("E09000025")).toBe("E");
    expect(nationOf("W06000015")).toBe("W");
    expect(nationOf("S12000036")).toBe("S");
    expect(nationOf("N09000003")).toBe("N");
    expect(() => nationOf("X06000000")).toThrow(/nation letter/);
    expect(() => nationOf("")).toThrow(/nation letter/);
  });
});

describe("AQMA per-feature filing contract (prep check 3)", () => {
  it("a blank TITLE or LOCAL_AUTH fails the run", () => {
    expect(() => processFeatures([syntheticFeature(1, { TITLE: "  " })])).toThrow(/blank TITLE/);
    expect(() => processFeatures([syntheticFeature(1, { LOCAL_AUTH: "" })])).toThrow(
      /blank TITLE or LOCAL_AUTH/,
    );
  });

  it("a feature with no pollutant flag set fails the run", () => {
    expect(() => processFeatures([syntheticFeature(1, { NO2: 0 })])).toThrow(
      /declares no pollutant/,
    );
  });

  it("a flag outside {0, 1} fails the run", () => {
    expect(() => processFeatures([syntheticFeature(1, { PM10: 2 })])).toThrow(
      /outside the flag vocabulary/,
    );
    expect(() => processFeatures([syntheticFeature(1, { SO2: "yes" })])).toThrow(
      /outside the flag vocabulary/,
    );
  });

  it("a duplicate AQMA_REF fails the run", () => {
    expect(() => processFeatures([syntheticFeature(7), syntheticFeature(7)])).toThrow(
      /appears twice/,
    );
  });

  it("a missing geometry fails the run", () => {
    const feature = syntheticFeature(1);
    feature.geometry = null;
    expect(() => processFeatures([feature])).toThrow(/no geometry/);
  });

  it("BENZENE is in the vocabulary though no current area declares it", () => {
    const processed = processFeatures([syntheticFeature(1, { NO2: 0, BENZENE: 1 })]);
    expect(processed.filed[0].pollutants).toEqual(["BENZENE"]);
  });
});

describe("AQMA revocation (prep check 2)", () => {
  it("edition B omits the Sutton AQMA (ref 1545) that edition A files", () => {
    const a = processFeatures(fixture);
    const b = processFeatures(fixtureB);
    expect(a.filed.map((f) => f.ref)).toContain(1545);
    expect(b.filed.map((f) => f.ref)).not.toContain(1545);
    expect(b.filed).toHaveLength(a.filed.length - 1);
  });

  it("after edition B, no answer for Minerva can name the revoked area", () => {
    const b = processFeatures(fixtureB);
    const scored = b.filed
      .map((f) => ({
        f,
        miles: polygonsBoundaryMiles(f.polygons, HOMES.minerva.lat, HOMES.minerva.lng),
      }))
      .sort((x, y) => x.miles - y.miles);
    expect(scored[0].f.name).not.toBe("Sutton AQMA");
    expect(scored[0].f.ref).not.toBe(1545);
  });

  it("the filing is a single-edition swap: the whole aqma layer is replaced in one transaction", () => {
    // The swap IS the revocation mechanism (the BUA
    // discipline): stage, delete the layer's rows,
    // insert the new edition, count-check, commit — a
    // failed run files nothing and the last good filing
    // keeps serving. The statement order is also pinned
    // generically by the loader-contracts suite.
    const begin = loader.indexOf('client.query("BEGIN")');
    const del = loader.indexOf("DELETE FROM planning_layers WHERE constraint_type = 'aqma'");
    const insert = loader.indexOf("INSERT INTO planning_layers");
    const commit = loader.indexOf('client.query("COMMIT")');
    expect(begin).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(begin);
    expect(insert).toBeGreaterThan(del);
    expect(commit).toBeGreaterThan(insert);
  });
});

describe("boundary-distance basis (prep check 9)", () => {
  // Distance is to the nearest BOUNDARY, never the
  // centroid — proven with two shapes whose centroid and
  // boundary fall on opposite sides of the 2-mile line.
  // (The serving read is PostGIS geography distance from
  // the point to the polygon, which is the boundary
  // distance by definition; this pins the same basis in
  // the loader's golden-check geometry.)
  const lat = 51.5;
  const lng = 0;
  const milesToLng = (miles: number) => miles / (Math.cos((lat * Math.PI) / 180) * 69.171);
  const milesToLat = (miles: number) => miles / 68.686;

  function squareRing(halfMi: number): [number, number][] {
    return [
      [lng - milesToLng(halfMi), lat - milesToLat(halfMi)],
      [lng + milesToLng(halfMi), lat - milesToLat(halfMi)],
      [lng + milesToLng(halfMi), lat + milesToLat(halfMi)],
      [lng - milesToLng(halfMi), lat + milesToLat(halfMi)],
      [lng - milesToLng(halfMi), lat - milesToLat(halfMi)],
    ];
  }

  it("centroid at the point, boundary beyond 2 miles: an annulus around the point measures beyond", () => {
    // One polygon: an outer square (±5 miles) with a
    // square hole (±2.6 miles). The shape's centroid is
    // the point itself (0 miles — a centroid basis would
    // serve "nearest"), the point is NOT contained (it
    // sits in the hole), and the nearest boundary is the
    // hole's edge at 2.6 miles.
    const polygons = [[squareRing(5), squareRing(2.6)]];
    expect(polygonsContain(polygons, lng, lat)).toBe(false);
    const miles = polygonsBoundaryMiles(polygons, lat, lng);
    expect(miles).toBeGreaterThan(2);
    expect(miles).toBeCloseTo(2.6, 1);
  });

  it("boundary within 2 miles, centroid beyond: a long thin rectangle east measures within", () => {
    // Spans 1.5 → 6.5 miles east (centroid ~4 miles
    // away), thin in latitude: the nearest boundary is
    // the western edge at 1.5 miles.
    const ring: [number, number][] = [
      [lng + milesToLng(1.5), lat - milesToLat(0.05)],
      [lng + milesToLng(6.5), lat - milesToLat(0.05)],
      [lng + milesToLng(6.5), lat + milesToLat(0.05)],
      [lng + milesToLng(1.5), lat + milesToLat(0.05)],
      [lng + milesToLng(1.5), lat - milesToLat(0.05)],
    ];
    const polygons = [[ring]];
    expect(polygonsContain(polygons, lng, lat)).toBe(false);
    const miles = polygonsBoundaryMiles(polygons, lat, lng);
    expect(miles).toBeLessThan(2);
    expect(miles).toBeCloseTo(1.5, 1);
  });
});
