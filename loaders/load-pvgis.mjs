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

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`${url} returned HTTP ${res.status}`);
      }
      lastError = new Error(`${url} returned HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (/returned HTTP 4/.test(err.message)) throw err;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw lastError;
}

// Sample every cell, three at a time (the concurrency the API
// held stably at build; ten broke connections). Any failure
// after retries propagates — the load files nothing.
export async function sampleCells(cells, fetchOne = fetchJson) {
  const rows = [];
  let next = 0;
  const worker = async () => {
    while (next < cells.length) {
      const cell = cells[next++];
      const json = await fetchOne(pvgisUrl(cell.latitude, cell.longitude));
      rows.push(parsePvcalcResponse(json, cell));
    }
  };
  await Promise.all([worker(), worker(), worker()]);
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

export async function fileSolarGrid(client, rows) {
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
    }
    await client.query(`DELETE FROM solar_grid`);
    await client.query(
      `INSERT INTO solar_grid (cell_ref, latitude, longitude, yield_kwh_per_kwp, irradiation_kwh_m2, peak_power_kwp, system_loss_pct, slope_deg, azimuth_deg, mounting, pv_technology, radiation_db, year_min, year_max, source_name, source_date)
       SELECT cell_ref, latitude, longitude, yield_kwh_per_kwp, irradiation_kwh_m2, peak_power_kwp, system_loss_pct, slope_deg, azimuth_deg, mounting, pv_technology, radiation_db, year_min, year_max, $1, $2 FROM solar_stage`,
      [SOURCE_NAME, SOURCE_DATE],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;
  const known = new Set(["--verify-only", "--file"]);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--file") {
      i += 1;
      continue;
    }
    if (!known.has(args[i])) throw new Error(`unrecognised argument: ${args[i]}`);
  }
  if (fixtureMode && !fixtureDir) throw new Error("--file needs a directory");

  let rows;
  if (fixtureMode) {
    const fixture = JSON.parse(await readFile(join(fixtureDir, "responses.json"), "utf8"));
    rows = rowsFromFixture(fixture);
  } else if (verifyOnly) {
    const cells = Object.values(GOLDEN_POSTCODES).map((p) => cellFor(p.lat, p.lng));
    const unique = [...new Map(cells.map((c) => [c.cellRef, c])).values()];
    rows = await sampleCells(unique);
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
    rows = await sampleCells(cells);
  }
  goldenChecks(rows);
  const base = `load-pvgis · PVGIS-SARAH3 (2005–2023) · standard basis 1 kWp, 35° south, building-integrated, 14% loss · ${rows.length.toLocaleString("en-GB")} cells`;
  if (verifyOnly) {
    console.log(`${base} — golden cells OK (verify only, nothing filed)`);
    return;
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    try {
      await fileSolarGrid(client, rows);
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
