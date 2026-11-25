import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bandFor,
  fileNoise,
  goldenBandChecks,
  parseGeotiff,
  parseSamplesCsv,
  pointsForSamples,
  samplesToRows,
  toBng,
} from "../loaders/load-noise.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

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

// The runner's fixture pass (CI's database job) files the noise
// fixture against a postcode directory loaded from the ONSPD
// excerpt fixture, which carries only the CM and E area files —
// so the directory holds CM3 2JT and E16 1GN but neither KT
// postcode the noise fixture samples. pointsForSamples is the
// exact resolution the loader's --file branch runs: directory
// rows first, a golden postcode's recorded point as the fallback.
// (This is the path that failed in CI with "sample for unknown
// postcode KT17 1FH" while the hand-built map above stayed green.)
describe("fixture-mode point resolution — the runner's path", () => {
  const fixtureSamples = () =>
    parseSamplesCsv(
      readFileSync(join(process.cwd(), "tests/fixtures/noise/noise-samples.csv"), "utf8"),
    );
  // What the excerpt directory actually returns for the fixture's
  // postcodes: the two it holds, at their directory coordinates.
  const excerptDirectory = [
    { postcode: "CM3 2JT", latitude: 51.776176, longitude: 0.60387 },
    { postcode: "E16 1GN", latitude: 51.515224, longitude: 0.021177 },
  ];

  it("resolves all three core golden postcodes against the excerpt directory", () => {
    const rows = samplesToRows(
      fixtureSamples(),
      pointsForSamples(fixtureSamples(), excerptDirectory),
    ) as {
      areaRef: string;
      sourceKind: string;
      dayBand: string;
      nightBand: string;
      latitude: number;
      longitude: number;
    }[];
    expect(rows).toHaveLength(12);
    expect(() => goldenBandChecks(rows)).not.toThrow();
    // Directory coordinates are used where the directory has them.
    const birkdale = rows.find((r) => r.areaRef === "CM3 2JT");
    expect(birkdale?.latitude).toBe(51.776176);
    expect(birkdale?.longitude).toBe(0.60387);
    // The KT rows fall back to the golden points' recorded BNG
    // positions: Minerva House KT17 1FH is 51.344571, -0.247104
    // and Ewell Village KT17 1DR converts to ~51.350244, -0.256606.
    const minerva = rows.find((r) => r.areaRef === "KT17 1FH");
    expect(Math.abs((minerva?.latitude ?? 0) - 51.344571)).toBeLessThan(0.001);
    expect(Math.abs((minerva?.longitude ?? 0) - -0.247104)).toBeLessThan(0.001);
    const ewell = rows.find((r) => r.areaRef === "KT17 1DR");
    expect(Math.abs((ewell?.latitude ?? 0) - 51.350244)).toBeLessThan(0.001);
    expect(Math.abs((ewell?.longitude ?? 0) - -0.256606)).toBeLessThan(0.001);
  });

  it("prefers a directory row over the golden fallback when both exist", () => {
    const directory = [
      ...excerptDirectory,
      { postcode: "KT17 1FH", latitude: 51.0, longitude: 0.0 },
    ];
    const rows = samplesToRows(fixtureSamples(), pointsForSamples(fixtureSamples(), directory));
    const minerva = rows.find((r) => r.areaRef === "KT17 1FH");
    expect(minerva?.latitude).toBe(51.0);
    expect(minerva?.longitude).toBe(0.0);
  });

  it("still refuses a genuinely unknown postcode with the same error", () => {
    const samples = parseSamplesCsv(
      "postcode,source_kind,day_value,night_value\nZZ9 9ZZ,road,50,40\n",
    );
    const points = pointsForSamples(samples, excerptDirectory);
    expect(() => samplesToRows(samples, points)).toThrow(
      "noise: sample for unknown postcode ZZ9 9ZZ",
    );
  });
});

describe("toBng — the live sampling conversion", () => {
  it("lands on the golden points' recorded BNG coordinates", () => {
    // GOLDEN_SAMPLES records CM3 2JT at BNG [579733, 211818] and
    // KT17 1FH at [522181, 162068], from the postcode directory.
    const [cmX, cmY] = toBng(51.776176, 0.60387) as number[];
    expect(Math.abs(cmX - 579733)).toBeLessThan(3);
    expect(Math.abs(cmY - 211818)).toBeLessThan(3);
    const [ktX, ktY] = toBng(51.344571, -0.247104) as number[];
    expect(Math.abs(ktX - 522181)).toBeLessThan(3);
    expect(Math.abs(ktY - 162068)).toBeLessThan(3);
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

describe("progress — BUG-265", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };

  const oneRow = [
    {
      areaRef: "CM3 2JT",
      sourceKind: "road",
      dayBand: "Below 55 dB",
      nightBand: "Below 50 dB",
      latitude: 51.776176,
      longitude: 0.60387,
    },
  ];

  it("logs the filing chunks with a real percentage and closes the tally", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-noise", log });
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        return { rows: [], rowCount: 0 };
      },
    };
    await fileNoise(client as never, oneRow as never, { progress });
    expect(lines.some((l) => /progress · file 1\/1 chunks \(100%\)$/.test(l))).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("names a filing failure with the filed count and the resume point", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-noise", log });
    const client = {
      query: async (sql: string) => {
        if (/INSERT INTO noise_stage/.test(sql)) throw new Error("forced failure");
        return { rows: [], rowCount: 0 };
      },
    };
    await expect(fileNoise(client as never, oneRow as never, { progress })).rejects.toThrow(
      "forced failure",
    );
    expect(
      lines.some((l) =>
        /failed · file · filed 0 of 1 · forced failure · resume from re-run from scratch/.test(l),
      ),
    ).toBe(true);
  });
});
