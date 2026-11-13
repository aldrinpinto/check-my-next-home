import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FILED_FUNCTIONS,
  SOURCE_NAME,
  decideGreenspaceAction,
  gbGeoPackageEntry,
  goldenChecks,
  haversineMiles,
  parseFiledStamp,
  parseGpkgGeometry,
  polygonAreaCentroid,
  productVersion,
  readGreenspaceFile,
  versionDate,
} from "../loaders/load-os-greenspace.mjs";

// OS Open Greenspace loader (plan step M5.6), tested against
// the radius-trimmed fixture in tests/fixtures/os-greenspace —
// a subset of the verified 2026-10 edition (GB GeoPackage md5
// 3d0c0c5e92c5dbf1d23d71b18530c962, the listing's own hash),
// cut from the same GeoPackage the live proof read, plus the
// captured product record and downloads listing. The golden
// figures are the M5.6 prep's verified reads
// (golden-reads.json, structured blocks).

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/os-greenspace");
const loaderSource = readFileSync(join(process.cwd(), "loaders/load-os-greenspace.mjs"), "utf8");

// The fixture GeoPackage travels base64-encoded (the repo's
// push channel is text-only; the loader decodes it the same
// way in fixture mode). The test decodes its own copy so the
// reads below use the real GeoPackage bytes.
const GPKG_PATH = join(mkdtempSync(join(tmpdir(), "cmnh-gs-test-")), "opgrsp_gb.gpkg");
writeFileSync(
  GPKG_PATH,
  Buffer.from(
    readFileSync(join(FIXTURE_DIR, "opgrsp_gb.gpkg.b64"), "utf8").replace(/\s+/g, ""),
    "base64",
  ),
);

const HOMES = {
  birkdale: { lat: 51.776176, lon: 0.60387 },
  exeter: { lat: 51.515224, lon: 0.021177 },
  cardiff: { lat: 51.467947, lon: -3.192837 },
};

describe("T2 — the listing oracle and the edition decision", () => {
  it("reads the GB GeoPackage entry out of the captured listing", () => {
    const downloads = JSON.parse(readFileSync(join(FIXTURE_DIR, "downloads.json"), "utf8"));
    const entry = gbGeoPackageEntry(downloads);
    expect(entry.md5).toBe("3d0c0c5e92c5dbf1d23d71b18530c962");
    expect(entry.size).toBe(58957224);
    expect(entry.fileName).toBe("opgrsp_gpkg_gb.zip");
  });

  it("reads the version from the captured product record", () => {
    const product = JSON.parse(readFileSync(join(FIXTURE_DIR, "product.json"), "utf8"));
    expect(productVersion(product)).toBe("2026-10");
    expect(versionDate("2026-10")).toBe("2026-10-01");
    expect(() => productVersion({})).toThrow();
    expect(() => versionDate("October 2026")).toThrow();
  });

  it("decides all three arms: unchanged is a healthy no-op, a changed md5 inside a version is a conflict, a new version files", () => {
    const filed = { version: "2026-10", md5: "3d0c0c5e92c5dbf1d23d71b18530c962" };
    expect(
      decideGreenspaceAction(
        { version: "2026-10", md5: "3d0c0c5e92c5dbf1d23d71b18530c962" },
        filed,
      ),
    ).toBe("noop");
    expect(decideGreenspaceAction({ version: "2026-10", md5: "a".repeat(32) }, filed)).toBe(
      "conflict",
    );
    expect(decideGreenspaceAction({ version: "2027-04", md5: "b".repeat(32) }, filed)).toBe("file");
    expect(decideGreenspaceAction({ version: "2026-10", md5: filed.md5 }, null)).toBe("file");
  });

  it("recovers the filed stamp from the loader's own summary lines", () => {
    expect(
      parseFiledStamp(
        "load-os-greenspace · 317730 points filed (89280 centres · 228450 access; Public Park Or Garden 22176 · Playing Field 21844 · Play Space 45260; version 2026-10 · md5 3d0c0c5e92c5dbf1d23d71b18530c962) — golden homes OK",
      ),
    ).toEqual({ version: "2026-10", md5: "3d0c0c5e92c5dbf1d23d71b18530c962" });
    expect(
      parseFiledStamp(
        "load-os-greenspace · OS Open Greenspace edition 2026-10 is unchanged (version 2026-10 · md5 3d0c0c5e92c5dbf1d23d71b18530c962) — the filed data is current, nothing to file — golden homes OK",
      ),
    ).toEqual({ version: "2026-10", md5: "3d0c0c5e92c5dbf1d23d71b18530c962" });
    expect(parseFiledStamp("some other line")).toBeNull();
    expect(parseFiledStamp(null)).toBeNull();
  });

  it("the loader refuses a same-version md5 change and an unverified download in its source", () => {
    expect(loaderSource).toContain("changed under its own version number");
    expect(loaderSource).toContain("refusing to file an unverified download");
    expect(loaderSource).toContain("decideGreenspaceAction");
  });
});

describe("geometry — the GeoPackage reader and the area centroid", () => {
  it("parses a point blob and rejects an unsupported type", () => {
    // GeoPackage header (magic GP, version 0, flags 0, srs 27700)
    // + little-endian WKB point (277000.5, 178000.25).
    const blob = new Uint8Array(8 + 5 + 16);
    blob.set([0x47, 0x50, 0x00, 0x00], 0);
    const view = new DataView(blob.buffer);
    view.setInt32(4, 27700, true);
    view.setUint8(8, 1);
    view.setUint32(9, 1, true);
    view.setFloat64(13, 277000.5, true);
    view.setFloat64(21, 178000.25, true);
    expect(parseGpkgGeometry(blob)).toEqual({
      type: "Point",
      coordinates: [277000.5, 178000.25],
    });
    const bad = new Uint8Array(blob);
    new DataView(bad.buffer).setUint32(9, 2, true); // a LineString — not a shape this loader files
    expect(() => parseGpkgGeometry(bad)).toThrow(/unsupported WKB/);
  });

  it("weights multipolygon parts by absolute area, so opposite windings cannot cancel", () => {
    // Two equal squares, the second wound in the opposite
    // direction: the centroid is the midpoint of the pair.
    // (The signed-area version of this computation put a real
    // ground's centre in the wrong place — see the loader.)
    const geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
        [
          [
            [20, 0],
            [20, 10],
            [30, 10],
            [30, 0],
            [20, 0],
          ],
        ],
      ],
    };
    expect(polygonAreaCentroid(geometry)).toEqual([15, 5]);
    expect(
      polygonAreaCentroid({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
            [0, 0],
          ],
        ],
      }),
    ).toEqual([2, 2]);
  });
});

describe("the fixture read — reconciliation and the golden figures (T3)", () => {
  const read = readGreenspaceFile(GPKG_PATH, "2026-10-01");
  const centres = read.rows.filter((r) => r.pointRole === "centre");
  const access = read.rows.filter((r) => r.pointRole === "access");
  const dist = (home: keyof typeof HOMES, row: { lat: number; lon: number }) =>
    haversineMiles(HOMES[home].lat, HOMES[home].lon, row.lat, row.lon);
  const nearestNamed = (home: keyof typeof HOMES, rows: typeof read.rows) =>
    rows
      .filter((r) => r.name !== null)
      .map((r) => ({ row: r, d: dist(home, r) }))
      .sort((a, b) => a.d - b.d)[0];

  it("reconciles with an independent count of the subset GeoPackage", () => {
    const db = new DatabaseSync(GPKG_PATH, { readOnly: true });
    const siteCount = (
      db
        .prepare(
          `SELECT count(*) AS n FROM greenspace_site WHERE function IN (${FILED_FUNCTIONS.map(() => "?").join(",")})`,
        )
        .get(...FILED_FUNCTIONS) as { n: number }
    ).n;
    const keptIds = new Set(
      (
        db
          .prepare(
            `SELECT id FROM greenspace_site WHERE function IN (${FILED_FUNCTIONS.map(() => "?").join(",")})`,
          )
          .all(...FILED_FUNCTIONS) as { id: string }[]
      ).map((r) => r.id),
    );
    const accessCount = (
      db.prepare("SELECT ref_to_greenspace_site AS ref FROM access_point").all() as {
        ref: string;
      }[]
    ).filter((r) => keptIds.has(r.ref)).length;
    db.close();
    expect(read.sitesRead).toBe(siteCount);
    expect(centres.length).toBe(siteCount);
    expect(read.accessFiled).toBe(accessCount);
    expect(access.length).toBe(accessCount);
    expect(read.rows.length).toBe(siteCount + accessCount);
    expect(read.centresDropped).toBe(0);
  });

  it("stamps every row with the source, the edition date and a NULL osm_id (T12's Greenspace half)", () => {
    for (const row of read.rows) {
      expect(row.sourceName).toBe(SOURCE_NAME);
      expect(row.sourceName).toContain("© Crown Copyright");
      expect(row.sourceDate).toBe("2026-10-01");
      expect(row.osmId).toBeNull();
    }
    expect(SOURCE_NAME).toContain("OS Open Greenspace");
  });

  it("passes the loader's own golden checks on the fixture", () => {
    expect(goldenChecks(read.rows, read.functionCounts, { full: false })).toEqual([]);
  });

  it("Exeter: Canning Town Recreation Ground centre 0.316, its access points at 0.18, Fisher Street the nearest named park-or-garden at 0.275", () => {
    const ctrg = centres
      .filter((r) => r.name === "Canning Town Recreation Ground")
      .map((r) => ({ row: r, d: dist("exeter", r) }))
      .sort((a, b) => a.d - b.d)[0];
    expect(ctrg.row.fn).toBe("Playing Field");
    expect(ctrg.d).toBeCloseTo(0.316, 1);
    const ctrgAccess = access
      .filter((r) => r.name === "Canning Town Recreation Ground")
      .map((r) => dist("exeter", r))
      .sort((a, b) => a - b)[0];
    expect(ctrgAccess).toBeCloseTo(0.18, 1);
    const fisher = nearestNamed(
      "exeter",
      centres.filter((r) => r.fn === "Public Park Or Garden"),
    );
    expect(fisher.row.name).toBe("Fisher Street Open Space");
    expect(fisher.d).toBeCloseTo(0.275, 1);
  });

  it("an unnamed centre files nearer than any named one at Exeter — filed and counted, never served as a name (L3)", () => {
    const unnamed = centres
      .filter((r) => r.name === null)
      .map((r) => dist("exeter", r))
      .sort((a, b) => a - b)[0];
    expect(unnamed).toBeLessThan(0.1);
    expect(unnamed).toBeLessThan(nearestNamed("exeter", centres).d);
  });

  it("Keir Hardie Park is absent from this source (it is OSM-only — the merged serving needs both loaders)", () => {
    expect(read.rows.some((r) => r.name === "Keir Hardie Park")).toBe(false);
  });

  it("Birkdale and Cardiff: Strutt Memorial 0.219 and Sevenoaks Park 0.099 are the nearest named centres", () => {
    const strutt = nearestNamed("birkdale", centres);
    expect(strutt.row.name).toBe("Strutt Memorial Recreation Ground");
    expect(strutt.d).toBeCloseTo(0.219, 1);
    const sevenoaks = nearestNamed("cardiff", centres);
    expect(sevenoaks.row.name).toBe("Sevenoaks Park");
    expect(sevenoaks.d).toBeCloseTo(0.099, 1);
  });

  it("files through a stage-table swap, so a failed load leaves the last good data serving", () => {
    expect(loaderSource).toContain("CREATE TEMP TABLE greenspace_stage");
    expect(loaderSource).toContain("DELETE FROM greenspace_points");
    expect(loaderSource).toContain("ON COMMIT DROP");
  });
});
