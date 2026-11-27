// PVGIS solar loader (plan step M5.18). Files the grid behind
// decision D26's solar section: PVGIS (European Commission
// Joint Research Centre) modelled PV yield and in-plane
// irradiation for the LOCATION — never the home's roof, never
// the home's yield — into `solar_grid` (migration 0019).
//
//   npm run load:pvgis                    live sample + file
//   npm run load:pvgis -- --verify-only   sample the golden cells
//                                         only; checks; no database
//   npm run load:pvgis -- --file tests/fixtures/pvgis
//                                         file from captured API
//                                         responses (the CI fixture)
//
// THE ROUTE, proven at build (15 Nov 2026), not assumed:
//   * PVGIS publishes NO downloadable yield grid. The JRC
//     geospatial download page offers only the first-generation
//     PVGIS-SARAH long-term-average IRRADIANCE grids (ESRI
//     ascii, 0.05°, 2005–2016, W/m²) — radiation only, a
//     superseded database, and no PV yield anywhere in them.
//     The current database, PVGIS-SARAH3 (2005–2023), is
//     served only through the PVcalc API, one point at a time.
//   * Per-postcode API calls (~1.8M) are not a route. So the
//     loader samples the API once per 0.1° CELL that the filed
//     postcode directory actually populates — the cells are
//     derived from postcode_cache, the nurseries loader's
//     directory pattern — at each cell's centre, and files the
//     cells as a grid in the air_grid shape (M5.9): serving
//     reads the cell containing the postcode point. 0.1°
//     (about 11 km north–south) is coarser than SARAH3's
//     native 0.05° — a deliberate, named grain: the API is
//     rate-sensitive (10 concurrent calls broke connections
//     at build; 3 concurrent is stable at ~0.5 s per call),
//     so the populated-cell count at 0.1° (a few thousand) is
//     the count that fits the runner's 30-minute window,
//     where 0.05° (roughly four times as many) does not.
//   * The yield at a cell centre is a fact about that centre,
//     sampled from PVGIS's own model — nothing is interpolated
//     or computed here. Golden-cell values differ from the
//     same API's values at the golden POSTCODE points by
//     +7.8 / +5.8 / +0.1 kWh per kWp (locked in the golden
//     matrix): that is the honest size of the grain.
//
// THE STANDARD BASIS (one basis, named everywhere it is used):
// a fixed, building-integrated crystalline-silicon system of
// 1 kWp, slope 35° (the standard UK roof pitch), azimuth 0°
// (PVGIS convention: 0 = south — an unshaded, south-facing
// roof), system loss 14% (PVGIS's own suggested figure),
// terrain horizon counted (the API's usehorizon default).
// Every parameter is filed per row from the API response, so
// M6.6's served words name the basis from filed data alone.
//
// Cadence: STATIC in the runner (the air/IMD precedent).
// Radiation databases are revised on a multi-year cycle —
// SARAH (2005–2016) → SARAH2 → SARAH3 (2005–2023, arriving
// with PVGIS 5.3) — so the grid files exactly once; a new
// database vintage is an operator re-run of this loader,
// which re-samples every cell and stage-swaps the grid.
//
// Load discipline (house pattern): every cell is sampled and
// the golden cells checked BEFORE anything files; a cell that
// fails after retries fails the whole load — a partial grid
// would serve silent holes. Filing is one transaction: stage
// table, then a whole-grid swap, so a failed load never
// overwrites the last good copy.
//
// The loader refuses any argument it does not recognise, so
// an argument can never be silently dropped. It takes no
// postcode arguments: its cell set comes from the directory.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createLoaderResume } from "./loader-resume.mjs";
import {
  HEARTBEAT_EVERY_BATCHES,
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";

const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";

export const PVGIS_API = "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc";
export const SOURCE_NAME = "PVGIS (European Commission Joint Research Centre) — PVGIS-SARAH3";
// The SARAH3 vintage spans 2005–2023; the stamp is its last
// year end, the air grid's modelled-year pattern.
export const SOURCE_DATE = "2023-12-31";
export const EXPECTED_RADIATION_DB = "PVGIS-SARAH3";

// The one standard basis. `mountingplace=building` in the API
// is PVGIS's building-integrated mounting.
export const STANDARD_BASIS = {
  peakpower: 1,
  loss: 14,
  angle: 35,
  aspect: 0,
  mountingplace: "building",
  pvtechchoice: "crystSi",
};

// Cell grain: tenths of a degree. A point's cell is the
// 0.1° × 0.1° square containing it; the sample point is the
// square's centre.
export const CELL_TENTHS = 10;

export function cellFor(lat, lng) {
  const latIdx = Math.floor(lat * CELL_TENTHS);
  const lngIdx = Math.floor(lng * CELL_TENTHS);
  const centreLat = (latIdx + 0.5) / CELL_TENTHS;
  const centreLng = (lngIdx + 0.5) / CELL_TENTHS;
  return {
    cellRef: `${centreLat.toFixed(2)},${centreLng.toFixed(2)}`,
    latitude: centreLat,
    longitude: centreLng,
  };
}

// The three universal homes (D10) and the cells containing
// them — the golden locks, from the first live sampling of
// PVGIS-SARAH3 on 15 November 2026, at the standard basis.
export const GOLDEN_POSTCODES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};
export const GOLDEN_CELLS = {
  "51.75,0.65": { yield: 1057.65, irradiation: 1336.65 },
  "51.55,0.05": { yield: 1009.96, irradiation: 1289.44 },
  "51.35,-0.25": { yield: 991.49, irradiation: 1264.87 },
};

// Parse one PVcalc JSON response into a filed row. The
// response is the contract: it must name the expected
// radiation database and echo the standard basis back — a
// PVGIS version change that silently moved the basis or the
// database fails here, never files.
export function parsePvcalcResponse(json, cell) {
  const inputs = json?.inputs;
  const totals = json?.outputs?.totals?.fixed;
  if (!inputs || !totals) throw new Error("PVGIS response carries no inputs/totals");
  const db = inputs.meteo_data?.radiation_db;
  if (db !== EXPECTED_RADIATION_DB) {
    throw new Error(`PVGIS radiation database is "${db}", expected ${EXPECTED_RADIATION_DB}`);
  }
  const fixed = inputs.mounting_system?.fixed;
  const slope = fixed?.slope?.value;
  const azimuth = fixed?.azimuth?.value;
  const mounting = fixed?.type;
  const peak = inputs.pv_module?.peak_power;
  const loss = inputs.pv_module?.system_loss;
  const tech = inputs.pv_module?.technology;
  if (
    slope !== STANDARD_BASIS.angle ||
    azimuth !== STANDARD_BASIS.aspect ||
    peak !== STANDARD_BASIS.peakpower ||
    loss !== STANDARD_BASIS.loss ||
    tech !== "c-Si"
  ) {
    throw new Error(
      `PVGIS response basis differs from the standard basis (slope ${slope}, azimuth ${azimuth}, peak ${peak}, loss ${loss}, tech ${tech})`,
    );
  }
  const yieldKwh = totals.E_y;
  const irradiation = totals["H(i)_y"];
  if (!Number.isFinite(yieldKwh) || !Number.isFinite(irradiation) || yieldKwh <= 0) {
    throw new Error(
      `PVGIS response totals are not usable (E_y ${yieldKwh}, H(i)_y ${irradiation})`,
    );
  }
  return {
    cellRef: cell.cellRef,
    latitude: cell.latitude,
    longitude: cell.longitude,
    yieldKwhPerKwp: yieldKwh,
    irradiationKwhM2: irradiation,
    peakPowerKwp: peak,
    systemLossPct: loss,
    slopeDeg: slope,
    azimuthDeg: azimuth,
    mounting,
    pvTechnology: tech,
    radiationDb: db,
    yearMin: inputs.meteo_data.year_min,
    yearMax: inputs.meteo_data.year_max,
  };
}

export function pvgisUrl(lat, lng) {
  const q = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    peakpower: String(STANDARD_BASIS.peakpower),
    loss: String(STANDARD_BASIS.loss),
    mountingplace: STANDARD_BASIS.mountingplace,
    angle: String(STANDARD_BASIS.angle),
    aspect: String(STANDARD_BASIS.aspect),
    pvtechchoice: STANDARD_BASIS.pvtechchoice,
    outputformat: "json",
  });
  return `${PVGIS_API}?${q}`;
}

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
// BUG-385: a transient fetch failure is retried for up to 30
// minutes (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
// 2026) — the same retry the flood loaders got in BUG-384.
// Past the budget the original error fails the run and it
// waits. The delay caps at the last schedule entry; a test
// may pass delaysMs: [] for instant retries. Non-transient
// failures throw at once (see isTransientFetchError).
/**
 * @param {string} url
 * @param {object} [opts]
 * @param {number[]} [opts.delaysMs]
 * @param {((error: any, attempt: number, delay: number, what: string) => void) | null} [opts.onRetry]
 * @param {number} [opts.retryBudgetMs]
 */
export async function fetchJson(
  url,
  { delaysMs = RETRY_DELAYS_MS, onRetry = null, retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS } = {},
) {
  const startedAt = Date.now();
  let attempt = 0;
  let res;
  for (;;) {
    attempt += 1;
    try {
      res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) break;
      const error = new Error(`${url} returned HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    } catch (error) {
      if (!isTransientFetchError(error)) throw error;
      if (Date.now() - startedAt >= retryBudgetMs) throw error;
      const delay =
        delaysMs.length === 0 ? 0 : delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      onRetry?.(error, attempt, delay, url);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // The body read stays outside the retry: a malformed body
  // is a contract failure, not a transient fetch failure.
  return res.json();
}

// Sample every cell, three at a time (the concurrency the API
// held stably at build; ten broke connections). Any failure
// after retries propagates — the load files nothing.
//
// BUG-265: the sampling is the run's long phase — a tally
// over the cells (a real percentage: the cell count is
// known up front), a heartbeat and a slow-cell warning.
/**
 * @param {any[]} cells
 * @param {(url: string) => Promise<any>} fetchOne
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, onSampled?: ((row: any) => Promise<void>) | null, resumeNote?: (() => string) | null, fetchOpts?: import("./flood-resume.mjs").FetchRetryOptions | null }} [options]
 */
export async function sampleCells(
  cells,
  fetchOne = fetchJson,
  { progress = null, onSampled = null, resumeNote = null, fetchOpts = null } = {},
) {
  const rows = [];
  let next = 0;
  let done = 0;
  let stopped = false;
  const sampleTally = progress?.tally({
    label: "sampling",
    total: cells.length,
    every: Math.max(1, Math.ceil(cells.length / 20)),
    unit: "cells",
  });
  const sampleWatch = createBatchWatch();
  // The heartbeat stays coarse on a run of thousands of
  // cells: every tenth of the run at least, never per cell.
  const heartbeatEvery = Math.max(HEARTBEAT_EVERY_BATCHES, Math.ceil(cells.length / 10));
  const fetchCell = fetchOpts ? (url) => fetchOne(url, fetchOpts) : fetchOne;
  const worker = async () => {
    try {
      // BUG-368: a worker that fails stops the others —
      // without this the surviving workers would keep
      // sampling (and, on a live run, staging) after the
      // call has already failed and its client has closed.
      while (!stopped && next < cells.length) {
        const cell = cells[next++];
        const started = Date.now();
        const json = await fetchCell(pvgisUrl(cell.latitude, cell.longitude));
        const { tookMs, averageMs, slow } = sampleWatch.observe(Date.now() - started);
        const row = parsePvcalcResponse(json, cell);
        rows.push(row);
        // BUG-368: a live filing run stages each sampled cell
        // as it lands (onSampled), so a kill during the long
        // sampling phase loses at most the cells in flight.
        // Verify-only and tests pass no hook and keep the old
        // collect-then-file shape.
        if (onSampled && !stopped) await onSampled(row);
        done += 1;
        sampleTally?.tick(done);
        progress?.heartbeat({
          stage: "sampling",
          done,
          total: cells.length,
          every: heartbeatEvery,
        });
        if (slow) {
          progress?.warning({
            what: "sample cell duration",
            value: `cell ${cell.cellRef} took ${formatDuration(tookMs)}`,
            threshold: `3x recent average ${formatDuration(averageMs)}`,
          });
        }
      }
    } catch (err) {
      stopped = true;
      throw err;
    }
  };
  const settled = await Promise.allSettled([worker(), worker(), worker()]);
  const failure = settled.find((r) => r.status === "rejected");
  if (failure) {
    const err = /** @type {PromiseRejectedResult} */ (failure).reason;
    // BUG-265: the failure line names the sampling stage
    // and how many cells were sampled — a partial grid
    // would serve silent holes, so the load files nothing.
    // BUG-368: a resumable run's line names the point the
    // next run resumes from instead.
    progress?.failed({
      stage: "sampling",
      filed: done,
      total: cells.length,
      error: err,
      resume:
        resumeNote?.() ??
        "re-run from scratch (sampling re-samples every cell, nothing is filed until the swap)",
    });
    throw err;
  }
  sampleTally?.finish(done);
  return rows.sort((a, b) => a.cellRef.localeCompare(b.cellRef));
}

export function goldenChecks(rows, { requireAll = true } = {}) {
  const problems = [];
  const byRef = new Map(rows.map((r) => [r.cellRef, r]));
  for (const [cellRef, g] of Object.entries(GOLDEN_CELLS)) {
    const row = byRef.get(cellRef);
    if (!row) {
      if (requireAll) problems.push(`golden cell ${cellRef} missing`);
      continue;
    }
    if (row.yieldKwhPerKwp !== g.yield) {
      problems.push(`cell ${cellRef} yield is ${row.yieldKwhPerKwp}, golden ${g.yield}`);
    }
    if (row.irradiationKwhM2 !== g.irradiation) {
      problems.push(
        `cell ${cellRef} irradiation is ${row.irradiationKwhM2}, golden ${g.irradiation}`,
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(`golden checks failed:\n  - ${problems.join("\n  - ")}`);
  }
}

// Rows from the fixture's captured responses — the same parse
// path as a live sample, so CI proves the contract, not a copy.
export function rowsFromFixture(fixture) {
  if (!fixture || !Array.isArray(fixture.cells) || fixture.cells.length === 0) {
    throw new Error("the PVGIS fixture carries no cells");
  }
  return fixture.cells.map((c) => {
    const cell = cellFor(c.latitude, c.longitude);
    if (c.cell_ref !== cell.cellRef) {
      throw new Error(`fixture cell "${c.cell_ref}" is not the cell of its own centre point`);
    }
    return parsePvcalcResponse(c.response, cell);
  });
}

const CHUNK = 500;

// The resume edition: the SARAH3 vintage's last year end
// plus the radiation database — a new database vintage is
// a new edition, and its staged rows never mix with the old.
export const SOLAR_EDITION = `${SOURCE_DATE}/${EXPECTED_RADIATION_DB}`;

// --- filing ------------------------------------------------------------
//
// Stage, count, swap — with resume support (BUG-368): staging is
// a PERSISTENT table now (migration 0048), and a loader_checkpoint
// row records the last fully staged chunk, so a killed run resumes
// instead of restarting. beginSolarFiling opens the staging table;
// stageRows inserts in the house chunks of 500, checkpointing
// after each chunk; finishFiling runs the counts and the swap
// exactly as the one-shot filer did, in its own transaction. The
// single-edition swap: the whole solar grid is replaced in this
// transaction, so a failed run leaves the last good grid serving
// untouched.
//
// THE RESUME UNITS. The read is API sampling, one cell at a
// time, so the resume point is the count of cells staged — a
// resumed run samples only the cells not already staged
// (stagedCellRefs) and stages them with the next seqs. The
// staged rows are read back for the golden checks (stagedRows),
// so the checks run over the whole grid either way.
/**
 * Open the filing run's database client and resume handle
 * (BUG-368). The client is injectable so the resume tests
 * can file against a fake database; production passes none
 * and a real client is opened as before.
 *
 * @param {import("./progress.mjs").ProgressLogger | null} [progress]
 * @param {{ restart?: boolean, client?: any }} [options]
 */
export async function beginSolarFiling(
  progress = null,
  { restart = false, client: injectedClient = null } = {},
) {
  const client = injectedClient ?? new pg.Client({ connectionString: process.env.DATABASE_URL });
  const ownsClient = !injectedClient;
  if (ownsClient) await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS solar_stage (
         cell_ref text, latitude double precision, longitude double precision,
         yield_kwh_per_kwp numeric, irradiation_kwh_m2 numeric,
         peak_power_kwp numeric, system_loss_pct numeric,
         slope_deg numeric, azimuth_deg numeric,
         mounting text, pv_technology text, radiation_db text,
         year_min integer, year_max integer,
         seq bigint NOT NULL, UNIQUE (seq)
       )`,
    );
  } catch (error) {
    if (ownsClient) await client.end().catch(() => {});
    throw error;
  }
  const resume = createLoaderResume(client, {
    loader: "load-pvgis",
    stageTable: "solar_stage",
    progress,
    restart,
  });
  let staged = 0;
  let expected = null;
  /** @type {{ resumed: boolean, reason?: string, checkpoint?: any, prefix?: boolean }} */
  let resumePrep = { resumed: false };
  const stageWatch = createBatchWatch();
  async function insertChunk(chunk) {
    const started = Date.now();
    const values = [];
    const params = [];
    const base = resume.takeSeq(chunk.length);
    chunk.forEach((r, j) => {
      const b = j * 15;
      values.push(
        `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12}, $${b + 13}, $${b + 14}, $${b + 15})`,
      );
      params.push(
        r.cellRef,
        r.latitude,
        r.longitude,
        r.yieldKwhPerKwp,
        r.irradiationKwhM2,
        r.peakPowerKwp,
        r.systemLossPct,
        r.slopeDeg,
        r.azimuthDeg,
        r.mounting,
        r.pvTechnology,
        r.radiationDb,
        r.yearMin,
        r.yearMax,
        base + j,
      );
    });
    await client.query(
      `INSERT INTO solar_stage (cell_ref, latitude, longitude, yield_kwh_per_kwp, irradiation_kwh_m2, peak_power_kwp, system_loss_pct, slope_deg, azimuth_deg, mounting, pv_technology, radiation_db, year_min, year_max, seq) VALUES ${values.join(", ")}`,
      params,
    );
    staged += chunk.length;
    const { tookMs, averageMs, slow } = stageWatch.observe(Date.now() - started);
    if (slow) {
      progress?.warning({
        what: "stage chunk duration",
        value: `chunk took ${formatDuration(tookMs)}`,
        threshold: `3x recent average ${formatDuration(averageMs)}`,
      });
    }
    await resume.checkpoint({
      edition: SOLAR_EDITION,
      expected,
      nextStartIndex: staged,
      read: staged,
      filed: staged,
      unit: "cells",
    });
  }
  return {
    stagedCount: () => staged,
    resumePrep: () => resumePrep,
    resumeNote: () => resume.resumeNote(),
    // Decide, from the edition and the staged rows, whether this
    // run resumes or starts from zero. Called once the cell set
    // is known, before the first cell is sampled.
    async prepareResume(expectedCount) {
      expected = expectedCount;
      resumePrep = await resume.prepare({ edition: SOLAR_EDITION, expected });
      if (resumePrep.resumed) staged = resumePrep.checkpoint.filed_count;
      return resumePrep;
    },
    // The cell_refs already staged — the resumed run samples
    // only the cells outside this set.
    async stagedCellRefs() {
      const { rows } = await client.query("SELECT cell_ref FROM solar_stage");
      return new Set(rows.map((r) => r.cell_ref));
    },
    // Stage rows in the house chunks, checkpointing after each
    // fully staged chunk. Called per sampled batch during the
    // live run, and once with the whole set by fileSolarGrid.
    async stageRows(rows) {
      for (let at = 0; at < rows.length; at += CHUNK) {
        await insertChunk(rows.slice(at, at + CHUNK));
      }
    },
    // The staged grid, in stage order, for the golden checks —
    // the checks run over the whole grid whether this run
    // sampled it fresh or resumed it.
    async stagedRows() {
      const { rows } = await client.query(
        `SELECT cell_ref, latitude, longitude, yield_kwh_per_kwp, irradiation_kwh_m2,
           peak_power_kwp, system_loss_pct, slope_deg, azimuth_deg, mounting,
           pv_technology, radiation_db, year_min, year_max
         FROM solar_stage ORDER BY seq`,
      );
      return rows.map((r) => ({
        cellRef: r.cell_ref,
        latitude: r.latitude,
        longitude: r.longitude,
        yieldKwhPerKwp: Number(r.yield_kwh_per_kwp),
        irradiationKwhM2: Number(r.irradiation_kwh_m2),
        peakPowerKwp: Number(r.peak_power_kwp),
        systemLossPct: Number(r.system_loss_pct),
        slopeDeg: Number(r.slope_deg),
        azimuthDeg: Number(r.azimuth_deg),
        mounting: r.mounting,
        pvTechnology: r.pv_technology,
        radiationDb: r.radiation_db,
        yearMin: r.year_min,
        yearMax: r.year_max,
      }));
    },
    async finishFiling(expectedCount) {
      try {
        progress?.stage("swap started — replacing the solar grid");
        const stagedRes = await client.query("SELECT count(*)::int AS n FROM solar_stage");
        if (stagedRes.rows[0].n !== expectedCount)
          throw new Error("the staged cell count does not match — rolling back");
        await client.query("BEGIN");
        try {
          await client.query(`DELETE FROM solar_grid`);
          await client.query(
            `INSERT INTO solar_grid (cell_ref, latitude, longitude, yield_kwh_per_kwp, irradiation_kwh_m2, peak_power_kwp, system_loss_pct, slope_deg, azimuth_deg, mounting, pv_technology, radiation_db, year_min, year_max, source_name, source_date)
             SELECT cell_ref, latitude, longitude, yield_kwh_per_kwp, irradiation_kwh_m2, peak_power_kwp, system_loss_pct, slope_deg, azimuth_deg, mounting, pv_technology, radiation_db, year_min, year_max, $1, $2 FROM solar_stage`,
            [SOURCE_NAME, SOURCE_DATE],
          );
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        }
        // The run is complete: staging + checkpoint go together,
        // so nothing is left behind for the next vintage.
        await resume.clear();
      } finally {
        if (ownsClient) await client.end().catch(() => {});
      }
    },
    async abortFiling() {
      // The staging + checkpoint STAY: they are the next run's
      // resume point.
      if (ownsClient) await client.end().catch(() => {});
    },
  };
}

/**
 * @param {any} client
 * @param {any[]} rows
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, resume?: { restart?: boolean } | null }} [options]
 */
export async function fileSolarGrid(
  client,
  rows,
  { progress = null, resume: resumeOpts = null } = {},
) {
  // Without the resume option the filing is exactly the
  // one-shot transaction below (a TEMP stage inside one
  // BEGIN…COMMIT), so the existing filing tests keep passing
  // unchanged. With it the filing runs through the resume
  // filer above.
  if (resumeOpts) {
    const filer = await beginSolarFiling(progress, {
      restart: resumeOpts.restart ?? false,
      client,
    });
    try {
      await filer.prepareResume(rows.length);
      // The staged prefix is the first stagedCount() rows of
      // the same array — re-staging them would double the grid.
      await filer.stageRows(rows.slice(filer.stagedCount()));
      await filer.finishFiling(rows.length);
    } catch (error) {
      progress?.failed({
        stage: "filing",
        filed: filer.stagedCount(),
        total: rows.length,
        error,
        resume: filer.resumeNote(),
      });
      await filer.abortFiling();
      throw error;
    }
    return;
  }
  // BUG-265: the staging is the filing phase — a tally over
  // the stage chunks, a slow-chunk warning and a heartbeat,
  // so the log moves while the grid files.
  progress?.stage(`staging ${formatCount(rows.length)} solar cells`);
  const chunks = Math.ceil(rows.length / CHUNK);
  const stageTally = progress?.tally({
    label: "staging",
    total: chunks,
    every: Math.max(1, Math.ceil(chunks / 10)),
    unit: "chunks",
  });
  const stageWatch = createBatchWatch();
  let chunksDone = 0;
  let stagedRows = 0;
  await client.query("BEGIN");
  try {
    await client.query(`CREATE TEMP TABLE solar_stage (
        cell_ref text, latitude double precision, longitude double precision,
        yield_kwh_per_kwp numeric, irradiation_kwh_m2 numeric,
        peak_power_kwp numeric, system_loss_pct numeric,
        slope_deg numeric, azimuth_deg numeric,
        mounting text, pv_technology text, radiation_db text,
        year_min integer, year_max integer
      ) ON COMMIT DROP`);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const started = Date.now();
      const values = [];
      const params = [];
      chunk.forEach((r, j) => {
        const b = j * 14;
        values.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12}, $${b + 13}, $${b + 14})`,
        );
        params.push(
          r.cellRef,
          r.latitude,
          r.longitude,
          r.yieldKwhPerKwp,
          r.irradiationKwhM2,
          r.peakPowerKwp,
          r.systemLossPct,
          r.slopeDeg,
          r.azimuthDeg,
          r.mounting,
          r.pvTechnology,
          r.radiationDb,
          r.yearMin,
          r.yearMax,
        );
      });
      await client.query(
        `INSERT INTO solar_stage (cell_ref, latitude, longitude, yield_kwh_per_kwp, irradiation_kwh_m2, peak_power_kwp, system_loss_pct, slope_deg, azimuth_deg, mounting, pv_technology, radiation_db, year_min, year_max) VALUES ${values.join(", ")}`,
        params,
      );
      stagedRows += chunk.length;
      chunksDone += 1;
      const { tookMs, averageMs, slow } = stageWatch.observe(Date.now() - started);
      stageTally?.tick(chunksDone);
      progress?.heartbeat({ stage: "staging", done: chunksDone, total: chunks });
      if (slow) {
        progress?.warning({
          what: "stage chunk duration",
          value: `chunk ${chunksDone} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
    }
    stageTally?.finish(chunksDone);
    progress?.stage("swap started — replacing the solar grid");
    await client.query(`DELETE FROM solar_grid`);
    await client.query(
      `INSERT INTO solar_grid (cell_ref, latitude, longitude, yield_kwh_per_kwp, irradiation_kwh_m2, peak_power_kwp, system_loss_pct, slope_deg, azimuth_deg, mounting, pv_technology, radiation_db, year_min, year_max, source_name, source_date)
       SELECT cell_ref, latitude, longitude, yield_kwh_per_kwp, irradiation_kwh_m2, peak_power_kwp, system_loss_pct, slope_deg, azimuth_deg, mounting, pv_technology, radiation_db, year_min, year_max, $1, $2 FROM solar_stage`,
      [SOURCE_NAME, SOURCE_DATE],
    );
    await client.query("COMMIT");
  } catch (err) {
    // BUG-265: the failure line names the filing stage and
    // how many rows were staged — the swap rolled back, so
    // the last good grid stands and a re-run starts over.
    progress?.failed({
      stage: "filing",
      filed: stagedRows,
      total: rows.length,
      error: err,
      resume: "re-run from scratch (the swap rolled back, the last good grid stands)",
    });
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last checkpointed cell instead of
  // re-sampling the whole grid; with no checkpoint this is a
  // fresh start.
  const restart = args.includes("--restart");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;
  const known = new Set(["--verify-only", "--file", "--restart"]);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--file") {
      i += 1;
      continue;
    }
    if (!known.has(args[i])) throw new Error(`unrecognised argument: ${args[i]}`);
  }
  if (fixtureMode && !fixtureDir) throw new Error("--file needs a directory");

  // BUG-265: one logger for the run — the sampling tally
  // lives in sampleCells, the staging tally in
  // fileSolarGrid; the golden-check failure line is here.
  const progress = createProgressLogger({ name: "load-pvgis" });

  let rows;
  // BUG-368: the live run's filer — staging is persistent
  // and checkpointed, so a kill during the long sampling
  // phase resumes from the last staged cell. Only the live
  // path uses it; fixture and verify-only keep their old
  // shapes (the fixture files through the resume filer at
  // the bottom, over its three rows).
  let filer = null;
  if (fixtureMode) {
    const fixture = JSON.parse(await readFile(join(fixtureDir, "responses.json"), "utf8"));
    rows = rowsFromFixture(fixture);
    // BUG-265: the fixture read is local and fast — one
    // count line, no percentage (no sampling total here).
    progress.count({ label: "read", done: rows.length, unit: "cells", extra: "fixture responses" });
  } else if (verifyOnly) {
    const cells = Object.values(GOLDEN_POSTCODES).map((p) => cellFor(p.lat, p.lng));
    const unique = [...new Map(cells.map((c) => [c.cellRef, c])).values()];
    progress.stage(`sampling ${formatCount(unique.length)} golden cells from PVGIS`);
    rows = await sampleCells(unique, fetchJson, { progress });
  } else {
    if (!process.env.DATABASE_URL)
      throw new Error(
        "DATABASE_URL is not set — the grid's cells are derived from the postcode directory, so a database is required",
      );
    const dirClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await dirClient.connect();
    let positions;
    try {
      const res = await dirClient.query(
        "SELECT latitude, longitude FROM postcode_cache WHERE latitude IS NOT NULL",
      );
      positions = res.rows;
    } finally {
      await dirClient.end();
    }
    if (positions.length === 0)
      throw new Error("the postcode directory is empty — no cells to sample");
    const cells = [
      ...new Map(
        positions.map((p) => {
          const c = cellFor(p.latitude, p.longitude);
          return [c.cellRef, c];
        }),
      ).values(),
    ];
    // Sanity band, named honestly: the populated UK at 0.1°
    // is a few thousand cells. Outside the band the directory
    // or the cell derivation is not what this loader expects.
    if (cells.length < 500 || cells.length > 10000) {
      throw new Error(
        `sanity failure: ${cells.length} populated cells is outside the expected band 500–10,000`,
      );
    }
    filer = await beginSolarFiling(progress, { restart });
    try {
      await filer.prepareResume(cells.length);
      const alreadyStaged = await filer.stagedCellRefs();
      const remaining = cells.filter((c) => !alreadyStaged.has(c.cellRef));
      progress.stage(
        `sampling ${formatCount(remaining.length)} populated cells from PVGIS` +
          (alreadyStaged.size > 0 ? ` (${formatCount(alreadyStaged.size)} already staged)` : ""),
      );
      // Sampled cells stage in batches of 100 as they land,
      // through one chain so the batches commit in order and
      // the checkpoint never runs backwards.
      let pendingSampled = [];
      let stagingChain = Promise.resolve();
      const stagePending = () => {
        if (pendingSampled.length === 0) return stagingChain;
        const batch = pendingSampled.splice(0, pendingSampled.length);
        stagingChain = stagingChain.then(() => filer.stageRows(batch));
        return stagingChain;
      };
      await sampleCells(remaining, fetchJson, {
        progress,
        resumeNote: () => filer.resumeNote(),
        onSampled: async (row) => {
          pendingSampled.push(row);
          if (pendingSampled.length >= 100) await stagePending();
        },
      });
      await stagePending();
      // The staged grid is the filing's rows — the golden
      // checks run over the whole grid whether this run
      // sampled it fresh or resumed it.
      rows = await filer.stagedRows();
    } catch (error) {
      await filer.abortFiling();
      throw error;
    }
  }
  try {
    goldenChecks(rows);
  } catch (err) {
    // BUG-265: the golden checks fail before anything is
    // filed — the failure line names the checks stage.
    // BUG-368: a live run's staged cells stand checkpointed,
    // so the line names the resume point.
    progress.failed({
      stage: "checks",
      filed: rows.length,
      total: rows.length,
      error: err,
      resume: filer ? filer.resumeNote() : "re-run from scratch (nothing is filed until the swap)",
    });
    if (filer) await filer.abortFiling();
    throw err;
  }
  const base = `load-pvgis · PVGIS-SARAH3 (2005–2023) · standard basis 1 kWp, 35° south, building-integrated, 14% loss · ${rows.length.toLocaleString("en-GB")} cells`;
  if (verifyOnly) {
    console.log(`${base} — golden cells OK (verify only, nothing filed)`);
    return;
  }
  if (filer) {
    try {
      await filer.finishFiling(rows.length);
    } catch (error) {
      progress.failed({
        stage: "filing",
        filed: filer.stagedCount(),
        total: rows.length,
        error,
        resume: filer.resumeNote(),
      });
      await filer.abortFiling();
      throw error;
    }
    console.log(
      `${base} filed — golden cells OK · ${Math.round((Date.now() - startedAt) / 1000)}s`,
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    try {
      // BUG-368: the fixture files through the resume filer,
      // over its three rows.
      await fileSolarGrid(client, rows, { progress, resume: { restart } });
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  console.log(`${base} filed — golden cells OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  main().catch((err) => {
    console.error(`load-pvgis FAILED: ${err.message}`);
    process.exit(1);
  });
}
