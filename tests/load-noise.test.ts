import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bandFor,
  fileNoise,
  goldenBandChecks,
  parseGeotiff,
  parseSamplesCsv,
  samplesToRows,
} from "../loaders/load-noise.mjs";

// Noise loader (plan step M5.9). The fixture's values are the
// build's own WMS measurements at the golden points (see the
// fixture README); band edges are pinned at every boundary, and the
// GeoTIFF reader is tested against a synthetic file in the DSP's
// exact dialect (tiled, uncompressed Float32, nodata -96) — the
// reader was additionally proven at build time against two real
// WCS extracts, reproducing the WMS goldens digit for digit.

describe("bandFor — the publisher's ranges and the three states", () => {
  it("bands daytime values on the published 5 dB steps from 55", () => {
    expect(bandFor(54.99, "Lday", "road")).toBe("Below 55 dB");
    expect(bandFor(55, "Lday", "road")).toBe("55–59 dB");
    expect(bandFor(59.99, "Lday", "road")).toBe("55–59 dB");
    expect(bandFor(60, "Lday", "road")).toBe("60–64 dB");
    expect(bandFor(74.99, "Lday", "road")).toBe("70–74 dB");
    expect(bandFor(75, "Lday", "road")).toBe("75 dB or more");
    expect(bandFor(91.2, "Lday", "road")).toBe("75 dB or more");
  });

  it("bands night values from 50, topping out at 70", () => {
    expect(bandFor(49.99, "Lnight", "road")).toBe("Below 50 dB");
    expect(bandFor(50, "Lnight", "road")).toBe("50–54 dB");
    expect(bandFor(69.9, "Lnight", "rail")).toBe("65–69 dB");
    expect(bandFor(70, "Lnight", "rail")).toBe("70 dB or more");
  });

  it("never files 0 as decibels, and keeps nodata a distinct state in words", () => {
    expect(bandFor(0, "Lday", "road")).toBe("No modelled road noise");
    expect(bandFor(0, "Lnight", "rail")).toBe("No modelled rail noise");
    expect(bandFor(null, "Lday", "airport")).toBe("No modelled airport noise");
    expect(bandFor(0, "Lday", "road")).not.toContain("dB");
  });

  it("refuses impossible values", () => {
    expect(() => bandFor(-3, "Lday", "road")).toThrow();
    expect(() => bandFor(Number.NaN, "Lday", "road")).toThrow();
  });
});

// Build a tiny tiled Float32 GeoTIFF in the DSP dialect: 32x32
// cells of 10 m, tiles of 16x16, origin (500000, 180000) top-left,
// nodata -96. Cell values: the cell's column index, except a nodata
// patch at columns 20-23 of row 5.
function syntheticTiff(): Uint8Array {
  const width = 32;
  const height = 32;
  const tile = 16;
  const tilesAcross = width / tile;
  const tileCount = tilesAcross * (height / tile);
  const headerSize = 8;
  const ifdSize = 2 + 13 * 12 + 4;
  const extraAt = headerSize + ifdSize;
  const tileOffsetsAt = extraAt;
  const tileBytesAt = tileOffsetsAt + tileCount * 4;
  const transformAt = tileBytesAt + tileCount * 4;
  const nodataAt = transformAt + 16 * 8;
  const dataAt = nodataAt + 8;
  const tileBytes = tile * tile * 4;
  const total = dataAt + tileCount * tileBytes;
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  const le = true;
  buf[0] = 0x49;
  buf[1] = 0x49;
  view.setUint16(2, 42, le);
  view.setUint32(4, headerSize, le);
  const tags: [number, number, number, number][] = [
    [256, 4, 1, width],
    [257, 4, 1, height],
    [258, 3, 1, 32],
    [259, 3, 1, 1],
    [262, 3, 1, 1],
    [277, 3, 1, 1],
    [322, 4, 1, tile],
    [323, 4, 1, tile],
    [324, 4, tileCount, tileOffsetsAt],
    [325, 4, tileCount, tileBytesAt],
    [339, 3, 1, 3],
    [34264, 12, 16, transformAt],
    [42113, 2, 5, nodataAt],
  ];
  view.setUint16(headerSize, tags.length, le);
  tags.forEach(([tag, type, n, value], i) => {
    const at = headerSize + 2 + i * 12;
    view.setUint16(at, tag, le);
    view.setUint16(at + 2, type, le);
    view.setUint32(at + 4, n, le);
    if (type === 3 && n === 1) view.setUint16(at + 8, value, le);
    else view.setUint32(at + 8, value, le);
  });
  view.setUint32(headerSize + 2 + tags.length * 12, 0, le);
  for (let t = 0; t < tileCount; t++) {
    view.setUint32(tileOffsetsAt + t * 4, dataAt + t * tileBytes, le);
    view.setUint32(tileBytesAt + t * 4, tileBytes, le);
  }
  const matrix = [10, 0, 0, 500000, 0, -10, 0, 180000, 0, 0, 0, 0, 0, 0, 0, 1];
  matrix.forEach((v, i) => view.setFloat64(transformAt + i * 8, v, le));
  const nodataText = "-96.0\0\0\0";
  for (let i = 0; i < nodataText.length; i++) buf[nodataAt + i] = nodataText.charCodeAt(i);
  for (let t = 0; t < tileCount; t++) {
    const tileCol = t % tilesAcross;
    const tileRow = Math.floor(t / tilesAcross);
    for (let r = 0; r < tile; r++) {
      for (let c = 0; c < tile; c++) {
        const col = tileCol * tile + c;
        const row = tileRow * tile + r;
        const value = row === 5 && col >= 20 && col <= 23 ? -96 : col;
        view.setFloat32(dataAt + t * tileBytes + (r * tile + c) * 4, value, le);
      }
    }
  }
  return buf;
}

describe("parseGeotiff — the DSP dialect", () => {
  it("samples the cell containing the point", () => {
    const raster = parseGeotiff(syntheticTiff()) as {
      valueAt: (x: number, y: number) => number | null;
    };
    // Cell (col 7, row 3) spans x 500070-500080, y 179960-179970.
    expect(raster.valueAt(500075, 179965)).toBe(7);
    expect(raster.valueAt(500070, 179970 - 0.001)).toBe(7);
    // The nodata patch on row 5 reads as no coverage.
    expect(raster.valueAt(500215, 179945)).toBeNull();
    // Outside the extract reads as no coverage.
    expect(raster.valueAt(499000, 179000)).toBeNull();
    expect(raster.valueAt(500100, 181000)).toBeNull();
  });

  it("refuses a compressed file rather than sampling garbage", () => {
    const buf = syntheticTiff();
    new DataView(buf.buffer).setUint16(8 + 2 + 3 * 12 + 8, 32946, true);
    expect(() => parseGeotiff(buf)).toThrow(/compression/);
  });
});

describe("the fixture samples", () => {
  it("band to the golden rows for all four measured postcodes", () => {
    const samples = parseSamplesCsv(
      readFileSync(join(process.cwd(), "tests/fixtures/noise/noise-samples.csv"), "utf8"),
    );
    const points = new Map(
      ["CM3 2JT", "E16 1GN", "KT17 1FH", "KT17 1DR"].map((pc) => [
        pc,
        { latitude: 51.5, longitude: 0.1 },
      ]),
    );
    const rows = samplesToRows(samples, points) as {
      areaRef: string;
      sourceKind: string;
      dayBand: string;
      nightBand: string;
    }[];
    expect(rows).toHaveLength(12);
    expect(() => goldenBandChecks(rows)).not.toThrow();
    const exeterAirport = rows.find((r) => r.areaRef === "E16 1GN" && r.sourceKind === "airport");
    expect(exeterAirport?.dayBand).toBe("Below 55 dB");
    expect(exeterAirport?.nightBand).toBe("No modelled airport noise");
  });

  it("refuses a sample for a postcode the directory does not hold", () => {
    const samples = parseSamplesCsv(
      "postcode,source_kind,day_value,night_value\nZZ9 9ZZ,road,50,40\n",
    );
    expect(() => samplesToRows(samples, new Map())).toThrow(/unknown postcode/);
  });
});

describe("filing — statement order and the swap", () => {
  it("opens BEGIN before the stage create and swaps in one transaction", async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        return { rows: [], rowCount: 0 };
      },
    };
    await fileNoise(
      client as never,
      [
        {
          areaRef: "CM3 2JT",
          sourceKind: "road",
          dayBand: "Below 55 dB",
          nightBand: "Below 50 dB",
          latitude: 51.776176,
          longitude: 0.60387,
        },
      ] as never,
    );
    const beginAt = statements.findIndex((s) => s === "BEGIN");
    const stageAt = statements.findIndex((s) => /CREATE TEMP TABLE noise_stage/.test(s));
    expect(beginAt).toBeGreaterThanOrEqual(0);
    expect(stageAt).toBeGreaterThan(beginAt);
    expect(statements.some((s) => /INSERT INTO noise_summary \(/.test(s))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
  });
});
