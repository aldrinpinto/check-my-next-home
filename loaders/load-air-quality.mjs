// Defra Pollution Climate Mapping (PCM) background maps — ONE static
// source, filed into air_grid, one row per 1 km grid square per year:
//
//   load-air-quality — the three annual-mean background CSVs (NO2,
//   PM2.5, PM10) from UK-AIR, keyless under the Open Government
//   Licence v3 ("acknowledge Defra"). Each CSV is one pollutant for
//   one modelled year: five metadata lines, then gridcode,x,y,value
//   rows for the square's centre in EPSG:27700.
//
// Why this shape:
//   * The concentrations are filed AS PUBLISHED, at full precision,
//     year-stamped, and served labelled as the modelled background
//     estimates they are — no band, no verdict (founder ruling,
//     plan M5.9 gap G4). PM2.5/PM10 are the gravimetric ("g") series,
//     the published headline basis.
//   * The point answer for a home is the 1 km square containing the
//     postcode point — no interpolation across squares (prep steer).
//     The loader files the square centres converted to EPSG:4326 with
//     proj4 on the schools/transport basis, so the brain's point
//     lookup is a plain grid_ref/year or nearest-centre read.
//   * One square in the country (534070, offshore at x=-500) is
//     published as "MISSING" in both PM files while carrying an
//     NO2 value: the parser files it with NULL concentrations —
//     the columns are nullable by design, and "not published for
//     this square" is the honest fact. No postcode point falls in
//     that square.
//   * Vintage: the 2024 spreadsheets are the latest CSV vintage
//     (founder ruling, gap G5). The 2025 maps exist only as GOV.UK
//     compliance shapefiles under a new model — not comparable
//     square-by-square and not filed. The canary (probe "defra-pcm")
//     watches the datastore for the 2025 CSVs; when they land, an
//     operator re-runs this loader with PCM_YEAR moved on.
//   * Static runner class: due exactly once per vintage.
//
// Load discipline (house pattern): all three files are parsed and
// cross-checked (identical square sets, golden cells) BEFORE anything
// is filed; filing is one transaction — stage table, then a swap
// scoped to the filed year — so a failed load never overwrites the
// last good copy, and a future vintage files alongside the old one
// rather than replacing it.
//
// Modes:
//   node loaders/load-air-quality.mjs                  live + file
//   node loaders/load-air-quality.mjs --verify-only    live + golden
//                                                      checks only
//   node loaders/load-air-quality.mjs --file <dir>     file from a
//     local folder holding mapno2<year>.csv, mappm25<year>g.csv and
//     mappm10<year>g.csv (the CI fixture holds the three golden
//     squares verbatim — see tests/fixtures/air/README.md).
//
// Verify-only runs need no database. Exits non-zero on any failure
// and prints "load-air-quality FAILED: …" to stderr.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import proj4 from "proj4";
import { createLoaderResume } from "./loader-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";

// Same EPSG:27700 definition as the schools and transport loaders —
// one conversion basis across the codebase (M5.5: it is load-bearing).
proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
    "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);
export const toLatLng = (easting, northing) => {
  const [lng, lat] = proj4("EPSG:27700", "EPSG:4326", [easting, northing]);
  return { lat, lng };
};

export const PCM_YEAR = 2024;
export const PCM_BASE = "https://uk-air.defra.gov.uk/datastore/pcm";
export const PCM_PAGE = "https://uk-air.defra.gov.uk/data/pcm-data";
export const SOURCE_NAME = "Defra Pollution Climate Mapping (PCM) background maps — UK-AIR";
export const SOURCE_DATE = "2024-12-31";
// Measured on the published 2024 files at build (13 Nov 2026): every
// pollutant file carries the same 254,905 squares.
export const NATIONAL_CELL_COUNT = 254905;

export const POLLUTANTS = {
  no2: { file: (y) => `mapno2${y}.csv`, column: (y) => `no2${y}` },
  pm25: { file: (y) => `mappm25${y}g.csv`, column: (y) => `pm25${y}g` },
  pm10: { file: (y) => `mappm10${y}g.csv`, column: (y) => `pm10${y}g` },
};

// The golden homes' 1 km squares (D10 universal set), centres in
// EPSG:27700, with the concentrations extracted live from the
// published 2024 CSVs on 13 November 2026 (M5.9 prep, re-verified at
// build). Full published precision — the loader files what Defra
// prints, never a rounded copy.
export const GOLDEN = {
  751310: { x: 579500, y: 211500, no2: 8.150298, pm25: 7.124671, pm10: 12.54823 },
  771971: { x: 540500, y: 181500, no2: 21.71409, pm25: 9.939679, pm10: 16.97423 },
  785063: { x: 522500, y: 162500, no2: 12.49256, pm25: 7.868347, pm10: 12.10357 },
};

// Parse one pollutant CSV: five metadata lines (pollutant, year,
// "annual mean", units, blank) then the header row. Throws on any
// contract breach.
export function parsePcmCsv(text, pollutant, year) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines.length < 7) throw new Error(`PCM ${pollutant}: fewer than 7 lines`);
  const meta = lines.slice(0, 5).map((l) => l.split(",")[0].trim().toLowerCase());
  if (!meta[0].startsWith(pollutant === "pm25" ? "pm2.5" : pollutant)) {
    throw new Error(`PCM ${pollutant}: metadata names "${meta[0]}"`);
  }
  if (meta[1] !== String(year)) {
    throw new Error(`PCM ${pollutant}: metadata year "${meta[1]}", expected ${year}`);
  }
  const header = lines[5].split(",").map((h) => h.trim());
  const valueColumn = POLLUTANTS[pollutant].column(year);
  if (
    header.length !== 4 ||
    header[0] !== "gridcode" ||
    header[1] !== "x" ||
    header[2] !== "y" ||
    header[3] !== valueColumn
  ) {
    throw new Error(
      `PCM ${pollutant}: header "${header.join(",")}", expected gridcode,x,y,${valueColumn}`,
    );
  }
  const cells = new Map();
  for (const line of lines.slice(6)) {
    if (!line.trim()) continue;
    const [gridcode, xs, ys, vs] = line.split(",");
    const x = Number(xs);
    const y = Number(ys);
    // "MISSING" is the publisher's own marker for a square with no
    // modelled value (one offshore square in the PM files) — file
    // it as NULL, never as a number and never as a load failure.
    const value = vs === "MISSING" ? null : Number(vs);
    if (!/^\d+$/.test(gridcode) || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`PCM ${pollutant}: bad coordinate row "${line}"`);
    }
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`PCM ${pollutant}: bad value in row "${line}"`);
    }
    if (cells.has(gridcode)) throw new Error(`PCM ${pollutant}: duplicate square ${gridcode}`);
    cells.set(gridcode, { x, y, value });
  }
  return cells;
}

// Join the three pollutant maps into filed rows. The three files must
// cover exactly the same squares at the same centres — a mismatched
// vintage or a truncated file stops the load.
/**
 * @param {{ no2: Map<string, any>, pm25: Map<string, any>, pm10: Map<string, any> }} maps
 * @param {number} year
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export function buildRows(maps, year, { progress = null } = {}) {
  const [no2, pm25, pm10] = [maps.no2, maps.pm25, maps.pm10];
  if (no2.size !== pm25.size || no2.size !== pm10.size) {
    throw new Error(
      `PCM: square counts differ (NO2 ${no2.size}, PM2.5 ${pm25.size}, PM10 ${pm10.size})`,
    );
  }
  // BUG-265: the join is the run's long loop — 254,905 squares
  // live, one proj4 conversion each — so a tally lands every
  // 25,000 rows against the files' own square count, a
  // heartbeat every 100,000, and a 25,000-row chunk that takes
  // more than 3x the recent average earns a warning.
  const buildTally = progress?.tally({
    label: "build",
    total: no2.size,
    every: 25_000,
    unit: "rows",
  });
  const buildWatch = createBatchWatch();
  let chunkRows = 0;
  let chunkStarted = Date.now();
  const rows = [];
  for (const [gridRef, a] of no2) {
    const b = pm25.get(gridRef);
    const c = pm10.get(gridRef);
    if (!b || !c) throw new Error(`PCM: square ${gridRef} missing from a pollutant file`);
    if (b.x !== a.x || b.y !== a.y || c.x !== a.x || c.y !== a.y) {
      throw new Error(`PCM: square ${gridRef} centres disagree across pollutants`);
    }
    const { lat, lng } = toLatLng(a.x, a.y);
    rows.push({
      gridRef,
      year,
      no2: a.value,
      pm25: b.value,
      pm10: c.value,
      latitude: lat,
      longitude: lng,
    });
    chunkRows += 1;
    buildTally?.tick(rows.length);
    progress?.heartbeat({ stage: "build", done: rows.length, total: no2.size, every: 100_000 });
    if (chunkRows >= 25_000) {
      const { tookMs, averageMs, slow } = buildWatch.observe(Date.now() - chunkStarted);
      if (slow) {
        progress?.warning({
          what: "build chunk duration",
          value: `chunk ending at row ${formatCount(rows.length)} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
      chunkStarted = Date.now();
      chunkRows = 0;
    }
  }
  buildTally?.finish(rows.length);
  return rows;
}

export function goldenChecks(rows, { full }) {
  const problems = [];
  if (full && rows.length !== NATIONAL_CELL_COUNT) {
    problems.push(
      `filed squares ${rows.length.toLocaleString("en-GB")} ≠ ${NATIONAL_CELL_COUNT.toLocaleString("en-GB")}`,
    );
  }
  const byRef = new Map(rows.map((r) => [r.gridRef, r]));
  for (const [gridRef, g] of Object.entries(GOLDEN)) {
    const row = byRef.get(gridRef);
    if (!row) {
      problems.push(`golden square ${gridRef} missing`);
      continue;
    }
    for (const key of ["no2", "pm25", "pm10"]) {
      if (row[key] !== g[key]) {
        problems.push(`square ${gridRef} ${key} is ${row[key]}, golden ${g[key]}`);
      }
    }
    // The filed point must be the square's centre, converted: within
    // 10 m of the proj4 conversion of the published centre.
    const centre = toLatLng(g.x, g.y);
    if (
      Math.abs(row.latitude - centre.lat) > 0.0001 ||
      Math.abs(row.longitude - centre.lng) > 0.0001
    ) {
      problems.push(`square ${gridRef} filed point is not its published centre`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`golden checks failed:\n  - ${problems.join("\n  - ")}`);
  }
}

const CHUNK = 500;

// Filing with resume support (BUG-368): the stage is a
// PERSISTENT table now (migration 0048) and a
// loader_checkpoint row records the last fully staged
// chunk, so a killed run resumes staging from the
// checkpoint instead of re-staging the whole grid. The
// read/build still re-runs — the rows are rebuilt from
// the three CSVs — but the 510 staging chunks do not.
// The edition is the PCM year; the expected total is the
// row count, known once the build ends. The swap stays
// atomic and year-scoped, and a successful swap clears
// staging + checkpoint together (BUG-248 unchanged).
/**
 * @param {any} client
 * @param {any[]} rows
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, restart?: boolean }} [options]
 */
export async function fileAirGrid(client, rows, { progress = null, restart = false } = {}) {
  const year = rows[0]?.year;
  if (year === undefined) throw new Error("PCM: no rows to file");
  const edition = `pcm-${year}`;
  const expected = rows.length;
  await client.query(`CREATE TABLE IF NOT EXISTS air_stage (
      grid_ref text, year integer, no2 numeric, pm25 numeric, pm10 numeric,
      latitude double precision, longitude double precision,
      seq bigint NOT NULL, UNIQUE (seq)
    )`);
  const resume = createLoaderResume(client, {
    loader: "load-air-quality",
    stageTable: "air_stage",
    progress,
    restart,
  });
  const resumePrep = await resume.prepare({ edition, expected });
  const startAt = resumePrep.resumed ? resumePrep.checkpoint.next_start_index : 0;
  // BUG-265: the staging is the run's second long loop — 510
  // chunks of 500 live — so a tally lands every 25 chunks
  // against the chunk count, a heartbeat every 10, and a
  // chunk that takes more than 3x the recent average earns
  // a warning. On a resume the tally counts from the
  // checkpointed chunk, so the log still ends at the total.
  const chunks = Math.ceil(rows.length / CHUNK);
  const stageTally = progress?.tally({
    label: "stage",
    total: chunks,
    every: 25,
    unit: "chunks",
  });
  const stageWatch = createBatchWatch();
  let chunkIndex = Math.floor(startAt / CHUNK);
  let staged = resumePrep.resumed ? resumePrep.checkpoint.filed_count : 0;
  try {
    for (let i = startAt; i < rows.length; i += CHUNK) {
      const started = Date.now();
      const chunk = rows.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      const base = resume.takeSeq(chunk.length);
      chunk.forEach((r, j) => {
        const b = j * 8;
        values.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8})`,
        );
        params.push(r.gridRef, r.year, r.no2, r.pm25, r.pm10, r.latitude, r.longitude, base + j);
      });
      await client.query(
        `INSERT INTO air_stage (grid_ref, year, no2, pm25, pm10, latitude, longitude, seq) VALUES ${values.join(", ")}`,
        params,
      );
      staged += chunk.length;
      chunkIndex += 1;
      const { tookMs, averageMs, slow } = stageWatch.observe(Date.now() - started);
      stageTally?.tick(chunkIndex);
      progress?.heartbeat({ stage: "stage", done: chunkIndex, total: chunks });
      if (slow) {
        progress?.warning({
          what: "stage chunk duration",
          value: `chunk ${chunkIndex} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
      // BUG-368: one checkpoint line per committed chunk —
      // the save is visible in the logs, and a kill after
      // this line loses at most the chunk in flight.
      await resume.checkpoint({
        edition,
        expected,
        nextStartIndex: i + chunk.length,
        read: i + chunk.length,
        filed: staged,
        unit: "rows",
      });
    }
    stageTally?.finish(chunks);
  } catch (err) {
    // BUG-368: the staging is durable per chunk — no
    // transaction to roll back, and the staged rows +
    // checkpoint STAY for the next run to resume from.
    progress?.failed({
      stage: "filing",
      filed: staged,
      total: rows.length,
      error: err,
      resume: resume.resumeNote(),
    });
    throw err;
  }
  try {
    const stagedRes = await client.query("SELECT count(*)::int AS n FROM air_stage");
    if (stagedRes.rows[0].n !== expected)
      throw new Error("the staged square count does not match — rolling back");
    await client.query("BEGIN");
    try {
      await client.query(`DELETE FROM air_grid WHERE year = $1`, [rows[0].year]);
      await client.query(
        `INSERT INTO air_grid (grid_ref, year, no2, pm25, pm10, latitude, longitude, source_name, source_date)
       SELECT grid_ref, year, no2, pm25, pm10, latitude, longitude, $1, $2 FROM air_stage`,
        [SOURCE_NAME, SOURCE_DATE],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
    // The run is complete: staging + checkpoint go together,
    // so nothing is left behind for the next vintage.
    await resume.clear();
  } catch (err) {
    // BUG-368: a swap failure leaves the staged read
    // checkpointed, so the next run resumes at the swap.
    progress?.failed({
      stage: "filing",
      filed: staged,
      total: rows.length,
      error: err,
      resume: resume.resumeNote(),
    });
    throw err;
  }
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return await res.text();
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`${url} returned HTTP ${res.status}`);
      }
      lastError = new Error(`${url} returned HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (/returned HTTP 4/.test(err.message)) throw err;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
  }
  throw lastError;
}

export async function loadAirRows({ fileDir = null, year = PCM_YEAR, progress = null } = {}) {
  const texts = {};
  for (const pollutant of Object.keys(POLLUTANTS)) {
    const name = POLLUTANTS[pollutant].file(year);
    texts[pollutant] = fileDir
      ? await readFile(join(fileDir, name), "utf8")
      : await fetchText(`${PCM_BASE}/${name}`);
  }
  const maps = {};
  for (const pollutant of Object.keys(POLLUTANTS)) {
    maps[pollutant] = parsePcmCsv(texts[pollutant], pollutant, year);
  }
  return buildRows(maps, year, { progress });
}

async function run() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last checkpointed chunk instead of
  // restarting; with no checkpoint this is a fresh start.
  const restart = args.includes("--restart");
  const fileAt = args.indexOf("--file");
  const fileDir = fileAt >= 0 ? args[fileAt + 1] : null;
  if (fileAt >= 0 && !fileDir) throw new Error("--file needs a directory");
  // BUG-265: one logger for the run — the build tally and the
  // staging tally below.
  const progress = createProgressLogger({ name: "load-air-quality" });

  let rows;
  try {
    progress.stage("reading the three PCM files");
    rows = await loadAirRows({ fileDir, progress });
    goldenChecks(rows, { full: !fileDir });
  } catch (err) {
    // BUG-265: the read, the build and the golden checks all
    // fail before anything is filed.
    progress.failed({
      stage: "read",
      filed: 0,
      error: err,
      resume: "re-run the loader from the start (nothing is filed)",
    });
    throw err;
  }
  const base = `load-air-quality · PCM ${PCM_YEAR} · ${rows.length.toLocaleString("en-GB")} squares`;
  if (verifyOnly) {
    console.log(`${base} — golden homes OK (verify-only, nothing filed)`);
    return;
  }
  progress.stage(`filing ${formatCount(rows.length)} squares`);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    try {
      await fileAirGrid(client, rows, { progress, restart });
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  console.log(`${base} filed — golden homes OK`);
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  run().catch((err) => {
    console.error(`load-air-quality FAILED: ${err.message}`);
    process.exit(1);
  });
}
