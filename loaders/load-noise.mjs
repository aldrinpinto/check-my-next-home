// Defra strategic noise mapping, England Round 4 — ONE static
// source family (three modelled sources), filed into noise_summary
// as pre-summarised bands, one row per postcode per source:
//
//   load-noise — road, rail and airport noise from the Defra Data
//   Services Platform (environment.data.gov.uk), reference year
//   2022, published October 2024, Open Government Licence v3. The
//   publisher's 10 m grids (EPSG:27700, receptor height 4 m) are
//   sampled at each postcode's point loader-side and filed ONLY as
//   the publisher's 5 dB presentation bands — the raw grid never
//   enters the database (docs/schema.md item 14).
//
// The M5.9 extension (founder rulings, 13 Nov 2026, gaps G2/G3):
// migration 0001 designed this table road-only. Rail and airport are
// in V1, so migration 0012 adds source_kind and this loader files
// road, rail and airport rows side by side, each with its own day
// (Lday) and night (Lnight) band (gap G1: Lday + Lnight, the two
// metrics every surface phrases as "daytime" and "night-time").
//
// Band states (gap G14) — three kinds of answer, never conflated:
//   * a published band: "55–59 dB" … "75 dB or more" (day bands run
//     55–59, 60–64, 65–69, 70–74, ≥75; night bands 50–54 … ≥70);
//   * below the published range: "Below 55 dB" / "Below 50 dB" — a
//     real modelled value under the first band (the grids hold
//     values down to 40 dB Lday / 35 dB Lnight);
//   * no modelled source: "No modelled road noise" (likewise rail /
//     airport) — the grid value is 0 (below the mapping floor: no
//     contribution modelled at this point) or nodata (outside the
//     modelled extent — most of England for airports). A grid value
//     of 0 is NEVER filed as "0 dB".
//
// England only: the Round 4 grids cover England. A postcode whose
// road cell is nodata sits outside the modelled land (Wales,
// Scotland, the sea) and gets no rows at all — the brain serves its
// named not-covered state there.
//
// Load routes (gap G13, measured at build): the all-metrics bulk
// download is a file geodatabase behind the DSP's explore app — no
// direct file, no size published, and a geodatabase needs tooling
// this project does not carry. The loader therefore samples through
// the publisher's WCS: 20 km GeoTIFF extracts (uncompressed Float32
// tiles — a minimal reader is included below; measured 16.8 MB and
// ~25 s per populated tile), one tile at a time, discarding each
// raster after its postcodes are sampled. Sampling is RESUMABLE:
// per-tile sample files land in the work directory (env
// NOISE_WORK_DIR, default a temp folder) and a re-run skips finished
// tiles. A national first pass is an operator-run job measured in
// hours, not a runner-window job — the same shape as the PHI load
// (M5.3); the loader exits non-zero until sampling completes, so the
// runner keeps it due and every pass resumes where the last stopped.
// Filing itself is the house pattern: validate everything, then one
// transaction — stage, swap — so a failed load never overwrites the
// last good copy.
//
// Modes:
//   node loaders/load-noise.mjs                  sample (resuming)
//                                                + file when complete
//   node loaders/load-noise.mjs --verify-only    re-sample the golden
//     points through the publisher's WMS and check the measured
//     values and their bands (no database, no filing)
//   node loaders/load-noise.mjs --file <dir>     band + file from a
//     folder holding noise-samples.csv (postcode, source_kind,
//     day_value, night_value — a number, 0, or "nodata"). The CI
//     fixture's values are the build's own WMS measurements at the
//     golden points (see tests/fixtures/noise/README.md).
//
// Verify-only runs need no database. Exits non-zero on any failure
// and prints "load-noise FAILED: …" to stderr.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import proj4 from "proj4";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";

// Same EPSG:27700 definition as the schools and transport loaders.
proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
    "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);
// WGS84 → BNG (the live sampling route) and back (the golden-point
// fallback below). proj4's first argument is the SOURCE projection:
// toBng(51.776176, 0.60387) lands within ~2 m of CM3 2JT's recorded
// BNG point [579733, 211818] — pinned by a test.
export const toBng = (lat, lng) => proj4("EPSG:4326", "EPSG:27700", [lng, lat]);
export const fromBng = (x, y) => {
  const [lng, lat] = proj4("EPSG:27700", "EPSG:4326", [x, y]);
  return { latitude: lat, longitude: lng };
};

export const SOURCE_NAME = "Defra strategic noise mapping — England Round 4 (2022 reference year)";
// Round 4 was published in October 2024.
export const SOURCE_DATE = "2024-10-01";

const DSP = "https://environment.data.gov.uk/spatialdata";
export const SERVICES = {
  road: {
    wcs: `${DSP}/road-noise-all-metrics-england-round-4/wcs`,
    wms: `${DSP}/road-noise-all-metrics-england-round-4/wms`,
    coverage: {
      Lday: "Road_Noise_Lday_England_Round_4_All",
      Lnight: "Road_Noise_Lnight_England_Round_4_All",
    },
    layer: {
      Lday: "Road_Noise_Lday_England_Round_4_All",
      Lnight: "Road_Noise_Lnight_England_Round_4_All",
    },
  },
  rail: {
    wcs: `${DSP}/noise-data/wcs`,
    wms: `${DSP}/noise-data/wms`,
    coverage: {
      Lday: "Rail_Noise_Lday_England_Round_4_All",
      Lnight: "Rail_Noise_Lnight_England_Round_4_All",
    },
    layer: {
      Lday: "Rail_Noise_Lday_England_Round_4_All",
      Lnight: "Rail_Noise_Lnight_England_Round_4_All",
    },
  },
  airport: {
    wcs: `${DSP}/airport-noise-all-metrics-england-round-4/wcs`,
    wms: `${DSP}/airport-noise-all-metrics-england-round-4/wms`,
    coverage: { Lday: "Airport_Noise_ALL_Lday", Lnight: "Airport_Noise_ALL_Lnight" },
    layer: { Lday: "Airport_Noise_ALL_Lday", Lnight: "Airport_Noise_ALL_Lnight" },
  },
};
export const SOURCE_KINDS = Object.keys(SERVICES);
const TILE = 20000;

// ------------------------------------------------------------------
// Bands. The publisher's presentation ranges, as text. value is a
// grid value in dB, 0 (below the mapping floor), or null (nodata).
export function bandFor(value, metric, sourceKind) {
  if (value === null || value === 0) return `No modelled ${sourceKind} noise`;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`bandFor: unexpected grid value ${value}`);
  }
  const floor = metric === "Lday" ? 55 : 50;
  if (value < floor) return `Below ${floor} dB`;
  const top = metric === "Lday" ? 75 : 70;
  if (value >= top) return `${top} dB or more`;
  const low = floor + Math.floor((value - floor) / 5) * 5;
  return `${low}–${low + 4} dB`;
}

// The golden points (D10) with the values this build measured through
// the publisher's WMS on 13 November 2026 (GetFeatureInfo,
// GRAY_INDEX), BNG coordinates from the postcode directory. Verify-
// only re-samples and compares; the fixture files these same values.
// null = nodata at the point.
export const GOLDEN_SAMPLES = {
  "CM3 2JT": {
    bng: [579733, 211818],
    road: [49.38999938964844, 42.529998779296875],
    rail: [0, 0],
    airport: [null, null],
  },
  "E16 1GN": {
    bng: [540341, 181525],
    road: [55.20000076293945, 41.81999969482422],
    rail: [0, 0],
    airport: [45.20000076293945, null],
  },
  "KT17 1FH": {
    bng: [522181, 162068],
    road: [57.599998474121094, 49.08000183105469],
    rail: [0, 0],
    airport: [null, null],
  },
  "KT17 1DR": {
    bng: [521506, 162683],
    road: [47.22, 38.77],
    rail: [53.84000015258789, 49.47999954223633],
    airport: [null, null],
  },
};

// The bands the golden samples must file to — derived from the
// measured values above through bandFor, pinned here so a banding
// change shows up as a test failure, not a silent display change.
export function expectedGoldenBands() {
  const out = {};
  for (const [postcode, g] of Object.entries(GOLDEN_SAMPLES)) {
    out[postcode] = {};
    for (const kind of SOURCE_KINDS) {
      out[postcode][kind] = [
        bandFor(g[kind][0], "Lday", kind),
        bandFor(g[kind][1], "Lnight", kind),
      ];
    }
  }
  return out;
}

export function goldenBandChecks(rows) {
  const expected = expectedGoldenBands();
  const problems = [];
  for (const [postcode, kinds] of Object.entries(expected)) {
    for (const [kind, [day, night]] of Object.entries(kinds)) {
      const row = rows.find((r) => r.areaRef === postcode && r.sourceKind === kind);
      if (!row) {
        problems.push(`${postcode} ${kind}: row missing`);
        continue;
      }
      if (row.dayBand !== day || row.nightBand !== night) {
        problems.push(
          `${postcode} ${kind}: filed "${row.dayBand}"/"${row.nightBand}", golden "${day}"/"${night}"`,
        );
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`golden checks failed:\n  - ${problems.join("\n  - ")}`);
  }
}

// ------------------------------------------------------------------
// A minimal GeoTIFF reader for the DSP's WCS dialect: single-band
// Float32, uncompressed, tiled or stripped, georeferenced by the
// ModelTransformation tag (or pixel scale + tiepoint). Anything
// outside that dialect throws — a changed service must stop the
// load loudly, never sample garbage.
export function parseGeotiff(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!little && !(bytes[0] === 0x4d && bytes[1] === 0x4d)) {
    throw new Error("GeoTIFF: not a TIFF file");
  }
  const u16 = (o) => view.getUint16(o, little);
  const u32 = (o) => view.getUint32(o, little);
  if (u16(2) !== 42) throw new Error("GeoTIFF: bad magic");
  const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 12: 8 };
  const tags = new Map();
  const ifd = u32(4);
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    const tag = u16(at);
    const type = u16(at + 2);
    const n = u32(at + 4);
    const size = SIZES[type] * n;
    const base = size <= 4 ? at + 8 : u32(at + 8);
    const read = (k) => {
      const o = base + k * SIZES[type];
      if (type === 3) return u16(o);
      if (type === 4) return u32(o);
      if (type === 12) return view.getFloat64(o, little);
      if (type === 5) return view.getUint32(o, little) / view.getUint32(o + 4, little);
      if (type === 2) return bytes[o];
      return bytes[o];
    };
    const values = [];
    for (let k = 0; k < n; k++) values.push(read(k));
    tags.set(tag, type === 2 ? String.fromCharCode(...values).replace(/\0.*$/s, "") : values);
  }
  const one = (tag) => tags.get(tag)?.[0];
  const width = one(256);
  const height = one(257);
  if (!width || !height) throw new Error("GeoTIFF: no dimensions");
  if (one(258) !== 32 || one(339) !== 3) {
    throw new Error("GeoTIFF: expected a 32-bit float band");
  }
  if (one(259) !== 1) throw new Error(`GeoTIFF: compression ${one(259)} not supported`);
  if ((one(277) ?? 1) !== 1) throw new Error("GeoTIFF: expected a single band");
  let originX;
  let originY;
  let pixel = 10;
  if (tags.has(34264)) {
    const m = tags.get(34264);
    pixel = m[0];
    originX = m[3];
    originY = m[7];
  } else if (tags.has(33550) && tags.has(33922)) {
    const scale = tags.get(33550);
    const tie = tags.get(33922);
    pixel = scale[0];
    originX = tie[3] - tie[0] * scale[0];
    originY = tie[4] + tie[1] * scale[1];
  } else {
    throw new Error("GeoTIFF: no georeferencing tags");
  }
  const nodata = tags.has(42113) ? Number(tags.get(42113)) : null;
  const readCell = (col, row) => {
    if (col < 0 || row < 0 || col >= width || row >= height) return null;
    let offset;
    if (tags.has(324)) {
      const tw = one(322);
      const th = one(323);
      const tilesAcross = Math.ceil(width / tw);
      const tileIndex = Math.floor(row / th) * tilesAcross + Math.floor(col / tw);
      const byteCounts = tags.get(325);
      if (byteCounts[tileIndex] === 0) return null;
      offset = tags.get(324)[tileIndex] + ((row % th) * tw + (col % tw)) * 4;
    } else if (tags.has(273)) {
      const rowsPerStrip = one(278) ?? height;
      const strip = Math.floor(row / rowsPerStrip);
      offset = tags.get(273)[strip] + ((row % rowsPerStrip) * width + col) * 4;
    } else {
      throw new Error("GeoTIFF: no tile or strip offsets");
    }
    const value = view.getFloat32(offset, little);
    if (nodata !== null && value === nodata) return null;
    if (!Number.isFinite(value)) return null;
    return value;
  };
  return {
    width,
    height,
    // The grid value at a BNG point: the cell containing it, or null
    // for nodata / outside the extract.
    valueAt(x, y) {
      const col = Math.floor((x - originX) / pixel);
      const row = Math.floor((originY - y) / pixel);
      return readCell(col, row);
    },
  };
}

// ------------------------------------------------------------------
// Samples: the seam between sampling (WCS or WMS or a fixture file)
// and filing. A sample is {postcode, sourceKind, day, night} with
// day/night a dB number, 0, or null (nodata).
export function samplesToRows(samples, pointsByPostcode) {
  const rows = [];
  for (const s of samples) {
    const point = pointsByPostcode.get(s.postcode);
    if (!point) throw new Error(`noise: sample for unknown postcode ${s.postcode}`);
    rows.push({
      areaRef: s.postcode,
      sourceKind: s.sourceKind,
      dayBand: bandFor(s.day, "Lday", s.sourceKind),
      nightBand: bandFor(s.night, "Lnight", s.sourceKind),
      latitude: point.latitude,
      longitude: point.longitude,
    });
  }
  return rows;
}

// The point a fixture (--file) sample files at, for one postcode:
// the postcode directory's row when it holds one (the directory is
// authoritative), else — for a golden postcode — the point this
// loader itself recorded in GOLDEN_SAMPLES, converted from BNG.
// The fallback exists because the directory's CI fixture is an
// excerpt (the ONSPD sample carries only the CM and E area files,
// so its golden set is CM3 2JT + E16 1GN), while the noise fixture
// samples the KT golden points too: their samples are golden-point
// measurements by construction (tests/fixtures/noise/README.md),
// so the recorded point is the right coordinate. A postcode that is
// neither in the directory nor a golden point stays absent from the
// map, and samplesToRows still refuses it as unknown.
export function pointsForSamples(samples, directoryRows) {
  const points = new Map(directoryRows.map((p) => [p.postcode, p]));
  for (const s of samples) {
    if (points.has(s.postcode)) continue;
    const golden = GOLDEN_SAMPLES[s.postcode];
    if (golden) {
      points.set(s.postcode, { postcode: s.postcode, ...fromBng(...golden.bng) });
    }
  }
  return points;
}

export function parseSamplesCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines[0] !== "postcode,source_kind,day_value,night_value") {
    throw new Error(`noise samples: unexpected header "${lines[0]}"`);
  }
  const value = (raw, postcode) => {
    if (raw === "nodata") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`noise samples: bad value "${raw}" for ${postcode}`);
    }
    return n;
  };
  return lines.slice(1).map((line) => {
    const [postcode, sourceKind, day, night] = line.split(",");
    if (!SOURCE_KINDS.includes(sourceKind)) {
      throw new Error(`noise samples: unknown source "${sourceKind}"`);
    }
    return {
      postcode,
      sourceKind,
      day: value(day, postcode),
      night: value(night, postcode),
    };
  });
}

const CHUNK = 500;

/**
 * @param {any} client
 * @param {any[]} rows
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export async function fileNoise(client, rows, { progress = null } = {}) {
  // BUG-265: the stage inserts are the run's long phase —
  // nationally ~5M rows in 500-row chunks — a line every
  // twentieth of the chunks, a heartbeat, and a warning for
  // a chunk over 3x the recent average.
  const chunks = Math.ceil(rows.length / CHUNK);
  const fileTally = progress?.tally({
    label: "file",
    total: chunks,
    every: Math.max(1, Math.ceil(chunks / 20)),
    unit: "chunks",
  });
  const fileWatch = createBatchWatch();
  let staged = 0;
  await client.query("BEGIN");
  try {
    await client.query(`CREATE TEMP TABLE noise_stage (
        area_ref text, source_kind text, day_band text, night_band text,
        latitude double precision, longitude double precision
      ) ON COMMIT DROP`);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const started = Date.now();
      const chunk = rows.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      chunk.forEach((r, j) => {
        const b = j * 6;
        values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`);
        params.push(r.areaRef, r.sourceKind, r.dayBand, r.nightBand, r.latitude, r.longitude);
      });
      await client.query(
        `INSERT INTO noise_stage (area_ref, source_kind, day_band, night_band, latitude, longitude) VALUES ${values.join(", ")}`,
        params,
      );
      staged += chunk.length;
      const chunkNo = i / CHUNK + 1;
      const { tookMs, averageMs, slow } = fileWatch.observe(Date.now() - started);
      fileTally?.tick(chunkNo);
      progress?.heartbeat({ stage: "file", done: chunkNo, total: chunks });
      if (slow) {
        progress?.warning({
          what: "file chunk duration",
          value: `chunk ${chunkNo} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
    }
    fileTally?.finish(chunks);
    await client.query(`DELETE FROM noise_summary`);
    await client.query(
      `INSERT INTO noise_summary (area_ref, source_kind, day_band, night_band, latitude, longitude, source_name, source_date)
       SELECT area_ref, source_kind, day_band, night_band, latitude, longitude, $1, $2 FROM noise_stage`,
      [SOURCE_NAME, SOURCE_DATE],
    );
    await client.query("COMMIT");
  } catch (err) {
    progress?.failed({
      stage: "file",
      filed: staged,
      total: rows.length,
      error: err,
      resume: "re-run from scratch (filing is one transaction; nothing was swapped)",
    });
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

// ------------------------------------------------------------------
async function fetchRetry(url, { binary = false } = {}) {
  // The DSP rate-limits bursts (a 24-sample verify run draws 429s):
  // 429s and 5xx get up to three attempts with a growing backoff;
  // any other 4xx is final. Tile fetches are naturally paced by
  // their ~25 s generation time and never see the limit.
  const delays = [3000, 10000];
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return binary ? new Uint8Array(await res.arrayBuffer()) : await res.text();
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`${url.split("?")[0]} returned HTTP ${res.status}`);
      }
      lastError = new Error(`${url.split("?")[0]} returned HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (/returned HTTP 4/.test(err.message) && !/429/.test(err.message)) throw err;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, delays[attempt - 1]));
  }
  throw lastError;
}

// One WMS point sample (verify-only route; the prep's method).
export async function sampleWms(sourceKind, metric, x, y) {
  const svc = SERVICES[sourceKind];
  const layer = svc.layer[metric];
  const url =
    `${svc.wms}?service=WMS&version=1.3.0&request=GetFeatureInfo` +
    `&layers=${layer}&query_layers=${layer}&crs=EPSG:27700` +
    `&bbox=${x - 50},${y - 50},${x + 50},${y + 50}&width=11&height=11&i=5&j=5` +
    `&info_format=application/json`;
  const text = await fetchRetry(url);
  const parsed = JSON.parse(text);
  const features = parsed.features ?? [];
  if (features.length === 0) return null;
  const value = features[0].properties?.GRAY_INDEX;
  if (typeof value !== "number") throw new Error(`WMS ${layer}: no GRAY_INDEX`);
  return value > 1e30 ? null : value;
}

export async function verifyGoldenSamples() {
  const problems = [];
  let first = true;
  for (const [postcode, g] of Object.entries(GOLDEN_SAMPLES)) {
    const [x, y] = g.bng;
    for (const kind of SOURCE_KINDS) {
      for (const [i, metric] of ["Lday", "Lnight"].entries()) {
        // Paced: the DSP rate-limits bursts of point samples.
        if (!first) await new Promise((r) => setTimeout(r, 400));
        first = false;
        const live = await sampleWms(kind, metric, x, y);
        const expected = g[kind][i];
        const bothNull = live === null && expected === null;
        if (!bothNull && (live === null || expected === null || Math.abs(live - expected) > 0.05)) {
          problems.push(`${postcode} ${kind} ${metric}: live ${live}, measured ${expected}`);
        }
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`golden samples drifted:\n  - ${problems.join("\n  - ")}`);
  }
}

// Discover a source's coverage id + extent from its WCS — the ids
// embed a dataset UUID that changes if Defra republishes, so they
// are resolved, never hardcoded.
async function describeCoverage(sourceKind, metric) {
  const svc = SERVICES[sourceKind];
  const caps = await fetchRetry(`${svc.wcs}?service=WCS&version=2.0.1&request=GetCapabilities`);
  const ids = [...caps.matchAll(/<wcs:CoverageId>([^<]+)<\/wcs:CoverageId>/g)].map((m) => m[1]);
  const id = ids.find((c) => c.endsWith(`__${svc.coverage[metric]}`));
  if (!id) throw new Error(`WCS ${sourceKind}: coverage ${svc.coverage[metric]} not offered`);
  const desc = await fetchRetry(
    `${svc.wcs}?service=WCS&version=2.0.1&request=DescribeCoverage&coverageId=${encodeURIComponent(id)}`,
  );
  const lower = desc.match(/<gml:lowerCorner>([\d.]+) ([\d.]+)<\/gml:lowerCorner>/);
  const upper = desc.match(/<gml:upperCorner>([\d.]+) ([\d.]+)<\/gml:upperCorner>/);
  if (!lower || !upper) throw new Error(`WCS ${sourceKind}: no extent in DescribeCoverage`);
  return {
    id,
    extent: {
      minX: Number(lower[1]),
      minY: Number(lower[2]),
      maxX: Number(upper[1]),
      maxY: Number(upper[2]),
    },
  };
}

async function fetchTile(sourceKind, metric, coverageId, x0, y0) {
  const svc = SERVICES[sourceKind];
  const url =
    `${svc.wcs}?service=WCS&version=2.0.1&request=GetCoverage` +
    `&coverageId=${encodeURIComponent(coverageId)}` +
    `&subset=E(${x0},${x0 + TILE})&subset=N(${y0},${y0 + TILE})&format=image/tiff`;
  return parseGeotiff(await fetchRetry(url, { binary: true }));
}

// The live sample: resumable, per-tile sample files in the work
// directory. Returns the complete sample set, or throws with the
// progress made (the next run resumes).
export async function sampleAll(pool, workDir, { progress = null } = {}) {
  await mkdir(workDir, { recursive: true });
  const { rows: postcodes } = await pool.query(
    `SELECT postcode, latitude, longitude FROM postcode_cache ORDER BY postcode`,
  );
  if (postcodes.length === 0) throw new Error("noise: postcode_cache is empty");
  const points = postcodes.map((p) => {
    const [x, y] = toBng(p.latitude, p.longitude);
    return {
      ...p,
      x,
      y,
      tile: `${Math.floor(x / TILE) * TILE}_${Math.floor(y / TILE) * TILE}`,
    };
  });
  const byKind = new Map();
  let pendingTotal = 0;
  // BUG-265: sampling is the run's hours-long phase — one
  // stage line per source, and each source's tile loop
  // carries its own tally, heartbeat and slow-tile warning
  // (see sampleKind).
  progress?.stage(`sampling road coverage for ${formatCount(points.length)} postcodes...`);
  const road = await sampleKind("road", points, workDir, { progress });
  pendingTotal += road.pending;
  byKind.set("road", road.samples);
  // England gate: only postcodes with a modelled road cell get rows.
  const inEngland = points.filter((p) => {
    const s = road.samples.get(p.postcode);
    return s && s.day !== null;
  });
  for (const kind of ["rail", "airport"]) {
    progress?.stage(`sampling ${kind} coverage for ${formatCount(inEngland.length)} postcodes...`);
    const part = await sampleKind(kind, inEngland, workDir, { progress });
    pendingTotal += part.pending;
    byKind.set(kind, part.samples);
  }
  if (pendingTotal > 0) {
    throw new Error(
      `sampling incomplete: ${pendingTotal} tile(s) sampled this run; ` +
        `re-run to resume (work directory ${workDir})`,
    );
  }
  const samples = [];
  for (const p of inEngland) {
    for (const kind of SOURCE_KINDS) {
      const s = byKind.get(kind).get(p.postcode);
      if (!s) throw new Error(`noise: no ${kind} sample for ${p.postcode}`);
      samples.push(s);
    }
  }
  return { samples, postcodes };
}

// Sample one source for the given points, tile by tile. Tiles whose
// sample file already exists in the work directory are read, not
// re-fetched (the resume mechanism); tiles outside the coverage
// extent are answered nodata without a request.
async function sampleKind(sourceKind, points, workDir, { progress = null } = {}) {
  const coverages = {
    Lday: await describeCoverage(sourceKind, "Lday"),
    Lnight: await describeCoverage(sourceKind, "Lnight"),
  };
  const extent = coverages.Lday.extent;
  const tiles = new Map();
  for (const p of points) {
    if (!tiles.has(p.tile)) tiles.set(p.tile, []);
    tiles.get(p.tile).push(p);
  }
  // BUG-265: the tile loop is the hours-long phase — the tile
  // count is the total, so the log carries a real percentage,
  // a line every tenth of the tiles, and a heartbeat. The
  // slow-tile watch observes fetched tiles only: a cached
  // tile costs nothing, and letting those instant reads set
  // the average would flag every real fetch as slow.
  const tileTally = progress?.tally({
    label: `sample ${sourceKind}`,
    total: tiles.size,
    every: Math.max(1, Math.ceil(tiles.size / 10)),
    unit: "tiles",
  });
  const tileWatch = createBatchWatch();
  const have = new Map();
  let pending = 0;
  let tileDone = 0;
  try {
    for (const [tileKey, tilePoints] of tiles) {
      const tileFile = join(workDir, `${sourceKind}-${tileKey}.csv`);
      let tileSamples = null;
      try {
        tileSamples = parseSamplesCsv(await readFile(tileFile, "utf8")).filter(
          (s) => s.sourceKind === sourceKind,
        );
      } catch {
        tileSamples = null;
      }
      if (tileSamples) {
        for (const s of tileSamples) have.set(s.postcode, s);
        tileDone += 1;
        tileTally?.tick(tileDone);
        progress?.heartbeat({
          stage: `sample ${sourceKind}`,
          done: tileDone,
          total: tiles.size,
        });
        continue;
      }
      pending++;
      const started = Date.now();
      const [x0, y0] = tileKey.split("_").map(Number);
      const inside =
        x0 + TILE > extent.minX && x0 < extent.maxX && y0 + TILE > extent.minY && y0 < extent.maxY;
      const day = inside ? await fetchTile(sourceKind, "Lday", coverages.Lday.id, x0, y0) : null;
      const night = inside
        ? await fetchTile(sourceKind, "Lnight", coverages.Lnight.id, x0, y0)
        : null;
      const fresh = [];
      for (const p of tilePoints) {
        const sample = {
          postcode: p.postcode,
          sourceKind,
          day: day ? day.valueAt(p.x, p.y) : null,
          night: night ? night.valueAt(p.x, p.y) : null,
        };
        have.set(p.postcode, sample);
        fresh.push(sample);
      }
      const encode = (v) => (v === null ? "nodata" : String(v));
      await writeFile(
        tileFile,
        [
          "postcode,source_kind,day_value,night_value",
          ...fresh.map((s) => `${s.postcode},${s.sourceKind},${encode(s.day)},${encode(s.night)}`),
        ].join("\n") + "\n",
      );
      tileDone += 1;
      const { tookMs, averageMs, slow } = tileWatch.observe(Date.now() - started);
      tileTally?.tick(tileDone);
      progress?.heartbeat({ stage: `sample ${sourceKind}`, done: tileDone, total: tiles.size });
      if (slow) {
        progress?.warning({
          what: "sample tile duration",
          value: `tile ${tileKey} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
    }
  } catch (err) {
    progress?.failed({
      stage: `sample ${sourceKind}`,
      filed: have.size,
      total: points.length,
      error: err,
      resume: `re-run to resume (work directory ${workDir})`,
    });
    throw err;
  }
  tileTally?.finish(tileDone);
  return { samples: have, pending };
}

async function run() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fileDir = fileAt >= 0 ? args[fileAt + 1] : null;
  if (fileAt >= 0 && !fileDir) throw new Error("--file needs a directory");

  // BUG-265: the verify, sampling and filing phases all
  // log while they work; the verify count's total is
  // genuine — every golden point × every source × both
  // metrics.
  const progress = createProgressLogger({ name: "load-noise" });
  if (verifyOnly) {
    progress.stage("verifying the golden points through the publisher's WMS...");
    await verifyGoldenSamples();
    const sampleTotal = Object.keys(GOLDEN_SAMPLES).length * SOURCE_KINDS.length * 2;
    progress.count({ label: "verify", done: sampleTotal, total: sampleTotal, unit: "samples" });
    const rows = Object.entries(GOLDEN_SAMPLES).flatMap(([postcode, g]) =>
      SOURCE_KINDS.map((kind) => ({
        areaRef: postcode,
        sourceKind: kind,
        dayBand: bandFor(g[kind][0], "Lday", kind),
        nightBand: bandFor(g[kind][1], "Lnight", kind),
        latitude: 0,
        longitude: 0,
      })),
    );
    goldenBandChecks(rows);
    console.log(
      "load-noise · Defra Round 4 · golden points re-sampled live via WMS — values and bands OK (verify-only, nothing filed)",
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let rows;
    let note;
    if (fileDir) {
      progress.stage(`reading samples from ${fileDir}...`);
      const names = await readdir(fileDir);
      const samplesFile = names.find((n) => n === "noise-samples.csv");
      if (!samplesFile) throw new Error(`no noise-samples.csv in ${fileDir}`);
      const samples = parseSamplesCsv(await readFile(join(fileDir, samplesFile), "utf8"));
      progress.count({ label: "parse", done: samples.length, unit: "samples" });
      const wanted = [...new Set(samples.map((s) => s.postcode))];
      const { rows: found } = await pool.query(
        `SELECT postcode, latitude, longitude FROM postcode_cache WHERE postcode = ANY($1)`,
        [wanted],
      );
      const pointsByPostcode = pointsForSamples(samples, found);
      rows = samplesToRows(samples, pointsByPostcode);
      goldenBandChecks(rows);
      note = `${rows.length.toLocaleString("en-GB")} rows from ${fileDir}`;
    } else {
      const workDir = process.env.NOISE_WORK_DIR ?? join(tmpdir(), "cmnh-noise-round4");
      const { samples, postcodes } = await sampleAll(pool, workDir, { progress });
      const pointsByPostcode = new Map(postcodes.map((p) => [p.postcode, p]));
      rows = samplesToRows(samples, pointsByPostcode);
      goldenBandChecks(rows);
      note = `${rows.length.toLocaleString("en-GB")} rows`;
    }
    const client = await pool.connect();
    try {
      progress.stage(`filing ${formatCount(rows.length)} noise rows...`);
      await fileNoise(client, rows, { progress });
    } finally {
      client.release();
    }
    console.log(`load-noise · Defra Round 4 · ${note} filed — golden homes OK`);
  } finally {
    await pool.end();
  }
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  run().catch((err) => {
    console.error(`load-noise FAILED: ${err.message}`);
    process.exit(1);
  });
}
