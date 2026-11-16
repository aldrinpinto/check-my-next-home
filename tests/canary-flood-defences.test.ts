import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { floodDefencesRecordCheck } from "../loaders/canary-flood-defences.mjs";

// Flood defences canary probe (plan step M6.27): the pure
// shape check over the CKAN package record, exercised
// against the record captured live in the step's prep
// (~/workspace/scratch-m627/ckan.json — its result object is
// reproduced here in the fields the probe reads, so the
// test needs no network and no scratch files).

const CAPTURED = {
  name: "aims-spatial-flood-defences-inc-standardised-attributes",
  notes:
    "This record is for Approval for Access product AfA345. \n\nThe Environment Agency's (EA) Asset Information Management System (AIMS) Spatial Flood Defences dataset.",
  resources: [
    {
      name: "AIMS Spatial Flood Defences Product Description.pdf",
      url: "https://environment.data.gov.uk/api/file/download?fileDataSetId=3aa34e3d-1d6d-4345-a655-64a683e06b6b&fileName=AIMS%20Spatial%20Flood%20Defences%20Product%20Description.pdf",
    },
    {
      name: "AIMS_Spatial_Flood_Defences_inc_standardised_attributes.gpkg.zip",
      url: "https://environment.data.gov.uk/api/file/download?fileDataSetId=3aa34e3d-1d6d-4345-a655-64a683e06b6b&fileName=AIMS_Spatial_Flood_Defences_inc_standardised_attributes.gpkg.zip",
    },
    {
      name: "AIMS_Spatial_Flood_Defences_inc_standardised_attributes.shp.zip",
      url: "https://environment.data.gov.uk/api/file/download?fileDataSetId=3aa34e3d-1d6d-4345-a655-64a683e06b6b&fileName=AIMS_Spatial_Flood_Defences_inc_standardised_attributes.shp.zip",
    },
  ],
};

describe("canary flood-defences — the record shape check", () => {
  it("the captured record passes: AfA345 named, the GeoPackage on the loader's pattern", () => {
    expect(floodDefencesRecordCheck(CAPTURED)).toEqual({ resources: 3 });
  });

  it("a record that stops naming AfA345 is a shape alert, not a pass", () => {
    expect(() => floodDefencesRecordCheck({ ...CAPTURED, notes: "A different product." })).toThrow(
      /no longer names the AfA345 product/,
    );
  });

  it("a missing GeoPackage resource is a shape alert", () => {
    const without = {
      ...CAPTURED,
      resources: CAPTURED.resources.filter((r) => !r.name.includes("gpkg")),
    };
    expect(() => floodDefencesRecordCheck(without)).toThrow(/no resource named/);
  });

  it("a GeoPackage moved off the file-download pattern is a shape alert", () => {
    const moved = {
      ...CAPTURED,
      resources: CAPTURED.resources.map((r) =>
        r.name.includes("gpkg")
          ? {
              ...r,
              url: "https://example.com/api/file/download?fileDataSetId=3aa34e3d-1d6d-4345-a655-64a683e06b6b",
            }
          : r,
      ),
    };
    expect(() => floodDefencesRecordCheck(moved)).toThrow(/file-download pattern/);
    const reIded = {
      ...CAPTURED,
      resources: CAPTURED.resources.map((r) =>
        r.name.includes("gpkg")
          ? {
              ...r,
              url: "https://environment.data.gov.uk/api/file/download?fileDataSetId=00000000-0000-0000-0000-000000000000&fileName=x.gpkg.zip",
            }
          : r,
      ),
    };
    expect(() => floodDefencesRecordCheck(reIded)).toThrow(/file-download pattern/);
  });

  it("a differently-named record is a shape alert", () => {
    expect(() => floodDefencesRecordCheck({ ...CAPTURED, name: "some-other-package" })).toThrow(
      /is named "some-other-package"/,
    );
    expect(() => floodDefencesRecordCheck(null)).toThrow(/not an object/);
  });

  it("the probe is wired into the canary's run list", () => {
    const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
    expect(canary).toContain('await run("flood-defences", probeFloodDefences)');
    expect(canary).toContain('from "./canary-flood-defences.mjs"');
  });
});
