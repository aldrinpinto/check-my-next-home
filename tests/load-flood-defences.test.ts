import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProgressLogger } from "../loaders/progress.mjs";
import {
  BAND_HIGH,
  BAND_LOW,
  CONDITION_VOCABULARY,
  MAINTAINER_VOCABULARY,
  OPERATOR_VOCABULARY,
  SNAPSHOT,
  SUB_TYPE_VOCABULARY,
  checkGoldens,
  dosDateToIso,
  homeStats,
  parseInspectionDate,
  processRows,
  readDefencesFile,
  streamDefencesFile,
} from "../loaders/load-flood-defences.mjs";

// Recorded flood defences loader (plan step M6.27, decisions
// D49 and D54), tested against the subset fixture in
// tests/fixtures/flood-defences — every feature within
// 2.5 miles of the three golden homes, cut verbatim from
// the national AIMS GeoPackage of the 13 Nov 2026 build
// (141,458 features), so the within-2-miles sets the
// goldens lock are complete.

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/flood-defences");

// The fixture GeoPackage travels base64-encoded (the OS
// Greenspace idiom); the test decodes its own copy so the
// reads below use the real GeoPackage bytes.
const GPKG_PATH = join(mkdtempSync(join(tmpdir(), "cmnh-def-test-")), "aims.gpkg");
writeFileSync(
  GPKG_PATH,
  Buffer.from(
    readFileSync(join(FIXTURE_DIR, "aims.gpkg.b64"), "utf8").replace(/\s+/g, ""),
    "base64",
  ),
);

const rows = readDefencesFile(GPKG_PATH);

// The loader is plain JS; the filed row's shape as the
// tests read it.
interface FiledDefence {
  assetId: string;
  assetName: string | null;
  assetSubType: string;
  protectionType: string | null;
  assetMaintainer: string;
  assetOperator: string;
  currentCondition: string | null;
  designSop: number | null;
  designSopDqf: string | null;
  currentSop: number | null;
  waterCourseName: string | null;
  lastInspectionDate: string | null;
  wkt: string;
}
const fileRows = (raw: unknown[]): FiledDefence[] => processRows(raw) as FiledDefence[];

// A minimal raw row for the contract tests: one short line
// segment, every field in-vocabulary.
function rawRow(partial: Record<string, unknown> = {}) {
  return {
    asset_id: "1",
    asset_name: "Not Available",
    asset_sub_type: "Wall",
    protection_type: "Fluvial",
    asset_maintainer: "Environment Agency",
    asset_operator: "Environment Agency",
    current_condition: "3",
    design_sop: 100,
    design_sop_dqf: "Good",
    current_sop: null,
    water_course_name: "River Test",
    last_inspection_date: "13/05/2026",
    lines: [
      [
        [540000, 180000],
        [540100, 180100],
      ],
    ],
    ...partial,
  };
}

describe("load-flood-defences — the fixture read", () => {
  it("reads the whole subset: 834 features, every one a MultiLineString of BNG lines", () => {
    expect(rows).toHaveLength(834);
    for (const row of rows) {
      expect(Array.isArray(row.lines)).toBe(true);
      expect(row.lines.length).toBeGreaterThan(0);
      for (const line of row.lines) expect(line.length).toBeGreaterThan(1);
    }
  });

  it("files the golden nearest defence's fields as published", () => {
    const filed = fileRows(rows);
    const nearest = filed.find((r) => r.assetId === "73925");
    expect(nearest).toMatchObject({
      assetName: "Not Available",
      assetSubType: "Natural High Ground",
      protectionType: "Fluvial",
      assetMaintainer: "Environment Agency",
      currentCondition: "3",
      designSop: 10,
      currentSop: null,
      waterCourseName: "River Ter",
    });
    expect(nearest!.wkt.startsWith("MULTILINESTRING((")).toBe(true);
    // The transform lands in WGS84 near the golden point.
    expect(nearest!.wkt).toContain("0.6");
  });

  it("the whole fixture read passes the vocabulary contract and the date conversion", () => {
    const filed = fileRows(rows);
    for (const row of filed) {
      expect(MAINTAINER_VOCABULARY).toContain(row.assetMaintainer);
      expect(OPERATOR_VOCABULARY).toContain(row.assetOperator);
      expect(SUB_TYPE_VOCABULARY).toContain(row.assetSubType);
      if (row.currentCondition !== null)
        expect(CONDITION_VOCABULARY).toContain(row.currentCondition);
      if (row.lastInspectionDate !== null)
        expect(row.lastInspectionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("load-flood-defences — golden checks (the prep's verified reads)", () => {
  it("locks the three homes' counts and nearest defences on the BNG plane", () => {
    expect(() => checkGoldens(rows)).not.toThrow();
    const stats = Object.fromEntries(homeStats(rows).map((s) => [s.key, s]));
    expect(stats.birkdale.count).toBe(26);
    expect(stats.birkdale.nearest?.assetId).toBe("73925");
    expect(stats.exeter.count).toBe(443);
    expect(stats.exeter.nearest?.subType).toBe("Wall");
    expect(stats.exeter.nearest?.watercourse).toBe("River Lea or Lee");
    expect(stats.epsom.count).toBe(52);
    expect(stats.epsom.nearest?.assetId).toBe("80375");
  });

  it("the sanity band is ±10% of the measured snapshot", () => {
    expect(SNAPSHOT).toBe(141458);
    expect(BAND_LOW).toBe(127312);
    expect(BAND_HIGH).toBe(155604);
  });
});

describe("load-flood-defences — the vocabulary contract (D54, fail-closed)", () => {
  it("a person's name as maintainer fails the run — the 'J Smith' case", () => {
    expect(() => processRows([rawRow({ asset_maintainer: "J Smith" })])).toThrow(
      /asset_maintainer "J Smith" is outside the closed vocabulary/,
    );
  });

  it("an out-of-vocabulary operator fails the run the same way", () => {
    expect(() => processRows([rawRow({ asset_operator: "J Smith" })])).toThrow(
      /asset_operator "J Smith" is outside the closed vocabulary/,
    );
  });

  it("a condition outside '' / '0'–'5' fails the run", () => {
    expect(() => processRows([rawRow({ current_condition: "9" })])).toThrow(
      /current_condition "9" is outside the closed vocabulary/,
    );
    expect(() => processRows([rawRow({ current_condition: "Good" })])).toThrow(
      /outside the closed vocabulary/,
    );
  });

  it("an unknown asset sub-type fails the run", () => {
    expect(() => processRows([rawRow({ asset_sub_type: "Castle" })])).toThrow(
      /asset_sub_type "Castle" is outside the closed vocabulary/,
    );
  });

  it("every measured category passes, trimmed — 'Network Rail ' files as 'Network Rail'", () => {
    for (const maintainer of MAINTAINER_VOCABULARY) {
      expect(processRows([rawRow({ asset_maintainer: maintainer })])[0].assetMaintainer).toBe(
        maintainer,
      );
    }
    expect(processRows([rawRow({ asset_maintainer: "Network Rail " })])[0].assetMaintainer).toBe(
      "Network Rail",
    );
    for (const operator of OPERATOR_VOCABULARY)
      expect(() => processRows([rawRow({ asset_operator: operator })])).not.toThrow();
    for (const subType of SUB_TYPE_VOCABULARY)
      expect(() => processRows([rawRow({ asset_sub_type: subType })])).not.toThrow();
  });

  it("the filed condition states pass distinctly: '' is not '0' is not NULL", () => {
    expect(processRows([rawRow({ current_condition: "" })])[0].currentCondition).toBe("");
    expect(processRows([rawRow({ current_condition: "0" })])[0].currentCondition).toBe("0");
    expect(processRows([rawRow({ current_condition: null })])[0].currentCondition).toBeNull();
  });

  it("a feature with no asset_id fails the run", () => {
    expect(() => processRows([rawRow({ asset_id: null })])).toThrow(/no asset_id/);
  });
});

describe("load-flood-defences — the inspection date and the edition stamp", () => {
  it("converts the published DD/MM/YYYY form to an ISO date", () => {
    expect(parseInspectionDate("13/05/2026")).toBe("2026-05-13");
    expect(parseInspectionDate("")).toBeNull();
    expect(parseInspectionDate(null)).toBeNull();
  });

  it("any other shape fails the run — the form is part of the contract", () => {
    expect(() => parseInspectionDate("2026-05-13")).toThrow(/DD\/MM\/YYYY/);
    expect(() => parseInspectionDate("31/02/2026")).toThrow(/not a real calendar date/);
  });

  it("reads the edition off the zip member's DOS date", () => {
    // 13 Nov 2026 as a DOS date word: year (2026-1980)<<9 |
    // month 11<<5 | day 13.
    expect(dosDateToIso((46 << 9) | (11 << 5) | 13)).toBe("2026-11-13");
    expect(dosDateToIso(0)).toBeNull();
  });
});

// BUG-265: the streaming read carries the shared progress
// logger — a tally every 10,000 features (a finish line only
// at fixture scale), a heartbeat every 50,000, and a slow
// 10,000-feature chunk earns a warning.
describe("progress logging (BUG-265)", () => {
  it("streams the fixture with a closing read line, and the read is unchanged", async () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-flood-defences",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const { read } = await streamDefencesFile(GPKG_PATH, { progress });
    expect(read).toBe(834);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/progress · read 834 features$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("reads the same rows without a logger", async () => {
    const { read } = await streamDefencesFile(GPKG_PATH, {});
    expect(read).toBe(834);
  });
});
