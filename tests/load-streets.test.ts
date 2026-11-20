// Street lines loader — unit tests (plan step M8.3).
//
// The loader's pure helpers only: the filed highway
// vocabulary, the name rule, bbox parsing and matching,
// the golden checks and the extract verification helpers.
// The filing itself (PostGIS) is exercised by the golden
// replay in CI's database job, where the fixture captures
// file through this loader and the flood maps' promise
// assertions read the filed streets back.

import { describe, expect, it } from "vitest";
import {
  EXTRACT_FLOORS,
  FILED_HIGHWAY_CLASSES,
  classifyHighway,
  extractDataDate,
  goldenChecks,
  md5Matches,
  parseBbox,
  parsePublishedMd5,
  streetName,
  wayMeetsBbox,
} from "../loaders/load-streets.mjs";

describe("load-streets — the filed vocabulary", () => {
  it("files the road and path classes a street map draws", () => {
    for (const cls of [
      "motorway",
      "trunk",
      "primary",
      "secondary",
      "tertiary",
      "unclassified",
      "residential",
      "living_street",
      "service",
      "pedestrian",
      "footway",
      "path",
      "cycleway",
    ])
      expect(classifyHighway({ highway: cls }), cls).toBe(cls);
  });

  it("never files a street that is not there, or a non-way", () => {
    for (const cls of ["construction", "proposed", "abandoned", "raceway", "bus_guideway"])
      expect(classifyHighway({ highway: cls }), cls).toBeNull();
    expect(classifyHighway({})).toBeNull();
    expect(classifyHighway({ highway: "" })).toBeNull();
    expect(FILED_HIGHWAY_CLASSES.has("construction")).toBe(false);
  });
});

describe("load-streets — names", () => {
  it("records the name tag trimmed; unnamed ways file with no name", () => {
    expect(streetName({ name: "  Birkdale Rise " })).toBe("Birkdale Rise");
    expect(streetName({})).toBeNull();
    expect(streetName({ name: "   " })).toBeNull();
  });
});

describe("load-streets — bboxes", () => {
  it("parses and validates", () => {
    expect(parseBbox("0.59,51.76,0.62,51.79")).toEqual({
      west: 0.59,
      south: 51.76,
      east: 0.62,
      north: 51.79,
    });
    expect(() => parseBbox("0.62,51.76,0.59,51.79")).toThrow(/inverted/);
    expect(() => parseBbox("a,b,c,d")).toThrow(/does not parse/);
  });

  it("a way meets a bbox when any point lies inside it", () => {
    const bbox = { west: 0.59, south: 51.76, east: 0.62, north: 51.79 };
    expect(
      wayMeetsBbox(
        [
          [51.7, 0.5],
          [51.77, 0.6],
        ],
        bbox,
      ),
    ).toBe(true);
    expect(wayMeetsBbox([[51.7, 0.5]], bbox)).toBe(false);
  });
});

describe("load-streets — golden checks", () => {
  const birkdaleRow = {
    osmId: 1,
    name: "Birkdale Rise",
    highway: "residential",
    points: [
      [51.7766, 0.6016],
      [51.7771, 0.603],
    ] as [number, number][],
  };
  const exeterRow = {
    osmId: 2,
    name: "Exeter Road",
    highway: "residential",
    points: [
      [51.5154, 0.021],
      [51.515, 0.0209],
    ] as [number, number][],
  };

  it("passes when both golden streets file by their homes", () => {
    expect(goldenChecks([birkdaleRow, exeterRow], () => true)).toEqual([]);
  });

  it("fails plainly when a golden street is missing or far", () => {
    expect(goldenChecks([exeterRow], () => true)[0]).toContain("Birkdale Rise");
    const far = { ...birkdaleRow, points: [[51.9, 0.6]] as [number, number][] };
    expect(goldenChecks([far, exeterRow], () => true)[0]).toContain("within 0.6");
  });

  it("checks only the homes in scope", () => {
    expect(goldenChecks([], (key: string) => key === "exeter")).toEqual([
      expect.stringContaining("Exeter Road"),
    ]);
    expect(goldenChecks([], () => false)).toEqual([]);
  });
});

describe("load-streets — extract verification", () => {
  it("parses Geofabrik's published md5 and compares hashes", () => {
    expect(parsePublishedMd5("d41d8cd98f00b204e9800998ecf8427e  england-latest.osm.pbf\n")).toBe(
      "d41d8cd98f00b204e9800998ecf8427e",
    );
    expect(() => parsePublishedMd5("not a hash")).toThrow(/does not parse/);
    expect(md5Matches("D41D8CD98F00B204E9800998ECF8427E", "d41d8cd98f00b204e9800998ecf8427e")).toBe(
      true,
    );
    expect(md5Matches("aaaa", "bbbb")).toBe(false);
  });

  it("reads the extract's data date from the dated filename", () => {
    expect(
      extractDataDate("https://download.geofabrik.de/europe/united-kingdom/england-261112.osm.pbf"),
    ).toBe("2026-11-12");
    expect(() => extractDataDate("england-latest.osm.pbf")).toThrow(/does not parse/);
  });

  it("the staged floors sit far below the measured yields", () => {
    // Measured on the 2026-11-12 extracts (M8.3): England
    // 4,550,399 filed-class ways, Wales ~494,000 highway
    // ways. A floor anywhere near the yield would refuse
    // ordinary map change; a floor near zero would pass a
    // broken read.
    expect(EXTRACT_FLOORS.england).toBeGreaterThan(1_000_000);
    expect(EXTRACT_FLOORS.england).toBeLessThan(4_550_399);
    expect(EXTRACT_FLOORS.wales).toBeGreaterThan(100_000);
    expect(EXTRACT_FLOORS.wales).toBeLessThan(494_373);
  });
});
