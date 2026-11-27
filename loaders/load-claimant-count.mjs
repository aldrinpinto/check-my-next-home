// Claimant Count loader — ONS via the Nomis API
// (plan step M5.16; founder rulings Q1/Q6, 13 Nov 2026).
//
// Files the Claimant Count for every LSOA in England and
// Wales into benefits_stats (migration 0013), series
// 'claimant_count': the published count plus the published
// percentage of residents aged 16–64, each against its own
// reference month. One half of the M5.16 benefits step; the
// Universal Credit half is load-dwp-uc.mjs, a separate
// loader under the same step (the flood precedent — one
// broken source never blocks the other, and a Stat-Xplore
// key problem must never stall this keyless series).
//
// The label is the series' own name, always in full: the
// Claimant Count — Jobseeker's Allowance plus Universal
// Credit claimants required to seek work (ONS's count of
// people claiming unemployment-related benefits). It is
// never shortened to the bare word unemployment, nor
// called an unemployment rate, in anything this data
// feeds: ONS states the series is no longer a reliable
// indicator of the labour market.
// The percentage is ONS's published figure, filed exactly
// as published (one decimal place) — never computed here,
// never back-calculated from anything.
//
// Source (verified live at the M5.16 prep, 13 Nov 2026, and
// again at this build): Nomis dataset NM_162_1 "Claimant
// count by sex and age", GUEST access — no key, no
// registration (£0, inside the project's running-cost
// rule). gender=0 (Total), age=0 (All categories: Age 16+),
// measure=1 the count, measure=2 the published percentage,
// measures=20100 (Value). Since the January 2026 release
// the geography is "2021 super output areas - lower layer"
// (typecode 151) — the same 2021 LSOAs our directory
// carries; the response's geography-type string is asserted
// on every pull, so a future re-basing fails loudly here,
// not in a report. Scotland's claimant figures publish by
// 2022 Data Zones and Northern Ireland's separately, so
// this loader files England & Wales LSOAs only and a
// Scottish or NI home has no row (serving prints the named
// not-covered state).
//
// Cadence: genuinely monthly, published about five to six
// weeks after the count date (September 2026 was released
// 20 Oct 2026), and each release REVISES the previous
// month — so every run files the latest TWO months
// (date=latest and date=latestMINUS1), anchored to the API,
// never a hard-coded month. A failed pull files nothing for
// either month and the last good months keep serving.
//
// Suppression (measured on the build's national proof,
// 13 Nov 2026): where an LSOA's claimant figure is very
// small, Nomis publishes the count but SUPPRESSES the
// percentage — the measure-2 row arrives with an empty
// value and OBS_STATUS "M" ("These figures are suppressed
// as value is 1 or 2"); 54 LSOAs in September 2026. The
// suppressed percentage files as NULL — the table's pct is
// nullable for exactly this — and serving must print the
// suppressed state, never a back-calculated figure (the
// design's guardrail 2). An empty percentage in any other
// status, or an empty count in any status, is a shape
// change and fails the load.
//
// The national pull, keyless: one month at both measures
// is 35,672 LSOAs × 2 = 71,344 rows, over the 25,000-row
// guest cap — a geography=TYPE151 query truncates at
// exactly 25,000 (measured at the build). The pull
// therefore pages with recordOffset in 25,000-row steps
// until a short page answers, then validates: the merged
// pages must hold each LSOA exactly once per measure, the
// distinct-LSOA count must sit in the expected band, and
// the three golden LSOAs must be present. Terms: OGL;
// serving attribution "Source: ONS Claimant Count via
// Nomis", the month on every figure.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import { createLoaderResume } from "./loader-resume.mjs";

const { Pool } = pg;

export const SOURCE_NAME = "ONS Claimant Count via Nomis";
export const SERIES = "claimant_count";
export const API_BASE = "https://www.nomisweb.co.uk/api/v01/dataset/NM_162_1.data.csv";
export const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";
export const GEOGRAPHY_TYPE = "2021 super output areas - lower layer";
export const PAGE_SIZE = 25000;
// The published E&W LSOA count is 35,672 (measured at the
// prep and again at this build). The band, not the exact
// figure, is the filing gate: a boundary revision moves it
// by ones, a broken or truncated feed by thousands.
export const LSOA_COUNT_BAND = { min: 35000, max: 36500 };
// The two month selectors every run files: the new month
// and the revised previous month.
export const MONTH_SELECTORS = ["latest", "latestMINUS1"];

// --- golden figures -----------------------------------------
//
// Locked at the M5.16 prep (13 Nov 2026) from the live API
// and re-verified at this build: September 2026 (released
// 20 Oct 2026). Golden checks assert these EXACTLY for rows
// of the golden month; for any other month the values are
// expected to move (the count is a monthly statistic and
// the previous month is revised at every release), so the
// checks assert presence and sanity there instead.

export const GOLDEN = {
  month: "2026-09",
  rows: {
    E01021395: { name: "Braintree 018C", count: 15, pct: 1.6 },
    E01003511: { name: "Newham 036A", count: 120, pct: 8.6 },
    E01030396: { name: "Epsom and Ewell 010D", count: 20, pct: 1.2 },
  },
};

// --- CSV parsing ----------------------------------------------
// (A local copy of the house quote-aware parser — each
// loader in this codebase is self-contained. The Nomis API
// quotes every field.)

export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\ufeff/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

// The columns this loader consumes — the header contract.
// A Nomis re-issue that renames or drops one fails the load
// loudly here, naming the column.
export const CONSUMED_COLUMNS = [
  "DATE_CODE",
  "GEOGRAPHY_CODE",
  "GEOGRAPHY_NAME",
  "GEOGRAPHY_TYPE",
  "MEASURE_CODE",
  "OBS_VALUE",
  "OBS_STATUS",
];

// Parse one API response into raw observations — one per
// (LSOA, month, measure) — validating the shape of every
// row as it goes. Completeness (both measures present) is
// NOT judged here: a national page boundary can split an
// LSOA's two measure rows across two pages, so completeness
// belongs to the assembly step below, which sees the whole
// pull. Pure — the tests run this on the fixture and on
// tampered copies.
export function parseClaimantObservations(text) {
  const raw = parseCsvText(text);
  if (raw.length < 2) throw new Error("the Claimant Count response is empty");
  const header = raw[0].map((h) => h.trim());
  const at = {};
  for (const col of CONSUMED_COLUMNS) {
    at[col] = header.indexOf(col);
    if (at[col] === -1)
      throw new Error(
        `the Claimant Count response carries no ${col} column — the shape changed (the header is the contract)`,
      );
  }
  const observations = [];
  for (const row of raw.slice(1)) {
    const month = (row[at.DATE_CODE] ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(month))
      throw new Error(`a row's DATE_CODE is "${month}" — not a YYYY-MM month`);
    const code = (row[at.GEOGRAPHY_CODE] ?? "").trim();
    if (!/^[EW]01\d{6}$/.test(code))
      throw new Error(`a row's GEOGRAPHY_CODE is "${code}" — not a 2021 LSOA code`);
    const geoType = (row[at.GEOGRAPHY_TYPE] ?? "").trim();
    if (geoType !== GEOGRAPHY_TYPE)
      throw new Error(
        `the response's geography type is "${geoType}" — expected "${GEOGRAPHY_TYPE}" (a geography re-basing must fail here, not file)`,
      );
    const measure = (row[at.MEASURE_CODE] ?? "").trim();
    const rawValue = (row[at.OBS_VALUE] ?? "").trim();
    if (measure === "1") {
      if (!/^\d+$/.test(rawValue))
        throw new Error(
          `${code} (${month}): the Claimant count is "${rawValue}" — not a published non-negative integer`,
        );
      observations.push({
        lsoaCode: code,
        lsoaName: (row[at.GEOGRAPHY_NAME] ?? "").trim(),
        month,
        measure,
        value: Number(rawValue),
      });
    } else if (measure === "2") {
      const status = (row[at.OBS_STATUS] ?? "").trim();
      if (rawValue === "") {
        // The published suppression: Nomis withholds the
        // percentage where the underlying value is 1 or 2
        // (OBS_STATUS "M"). It files as a null percentage —
        // never back-calculated. An empty value in any
        // other status is a shape change.
        if (status !== "M")
          throw new Error(
            `${code} (${month}): the published percentage is empty with OBS_STATUS "${status}" — only the published suppression (status M) may file as no percentage`,
          );
        observations.push({
          lsoaCode: code,
          lsoaName: (row[at.GEOGRAPHY_NAME] ?? "").trim(),
          month,
          measure,
          value: null,
        });
        continue;
      }
      const pct = Number(rawValue);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100)
        throw new Error(
          `${code} (${month}): the published percentage is "${rawValue}" — not a number within 0–100`,
        );
      // One decimal place, as published — a second decimal
      // means the measure changed shape under us.
      if (Math.abs(pct * 10 - Math.round(pct * 10)) > 1e-9)
        throw new Error(
          `${code} (${month}): the published percentage ${rawValue} carries more than one decimal place — not the published shape`,
        );
      observations.push({
        lsoaCode: code,
        lsoaName: (row[at.GEOGRAPHY_NAME] ?? "").trim(),
        month,
        measure,
        value: pct,
      });
    } else {
      throw new Error(`a row's MEASURE_CODE is "${measure}" — only measures 1 and 2 are requested`);
    }
  }
  return observations;
}

// Assemble observations into filing rows. The same
// (LSOA, month, measure) arriving twice is refused — a
// page overlap or a repeated selector — and an LSOA-month
// holding only one of the two measures is refused: filing
// either copy, or half a row, on faith is how a truncated
// pull disguises itself.
export function assembleClaimantRows(observations) {
  const byKey = new Map();
  for (const obs of observations) {
    const key = `${obs.lsoaCode}|${obs.month}`;
    const entry = byKey.get(key) ?? {
      lsoaCode: obs.lsoaCode,
      lsoaName: obs.lsoaName,
      month: obs.month,
      count: null,
      pct: undefined,
    };
    if (entry.lsoaName !== obs.lsoaName)
      throw new Error(
        `${obs.lsoaCode}: the area name disagrees within one pull ("${entry.lsoaName}" vs "${obs.lsoaName}")`,
      );
    if (obs.measure === "1") {
      if (entry.count !== null)
        throw new Error(`${obs.lsoaCode} (${obs.month}): the count arrived twice in one pull`);
      entry.count = obs.value;
    } else {
      if (entry.pct !== undefined)
        throw new Error(`${obs.lsoaCode} (${obs.month}): the percentage arrived twice in one pull`);
      entry.pct = obs.value;
    }
    byKey.set(key, entry);
  }
  const rows = [...byKey.values()];
  for (const row of rows) {
    if (row.count === null || row.pct === undefined)
      throw new Error(
        `${row.lsoaCode} (${row.month}): the pull holds only one of the two measures — a partial row must never file`,
      );
  }
  return rows.sort((a, b) =>
    a.month === b.month ? (a.lsoaCode < b.lsoaCode ? -1 : 1) : a.month < b.month ? -1 : 1,
  );
}

// One response, parsed and assembled (the small pulls: the
// golden verify, the fixture files).
export function parseClaimantCsv(text) {
  return assembleClaimantRows(parseClaimantObservations(text));
}

export function goldenChecks(rows, { full }) {
  const failures = [];
  const byKey = new Map(rows.map((r) => [`${r.lsoaCode}|${r.month}`, r]));
  const goldenMonthPresent = rows.some((r) => r.month === GOLDEN.month);
  for (const [code, golden] of Object.entries(GOLDEN.rows)) {
    const row = byKey.get(`${code}|${GOLDEN.month}`);
    if (!row) {
      // The golden month is asserted only when this pull
      // carries it (the fixture and any pull near the lock
      // date do; a run two years from now files newer months
      // only, and its goldens are the presence checks below).
      if (goldenMonthPresent)
        failures.push(`${code} (${golden.name}) is missing from the ${GOLDEN.month} rows`);
      continue;
    }
    if (row.lsoaName !== golden.name)
      failures.push(`${code}: filed name "${row.lsoaName}", expected "${golden.name}"`);
    if (row.count !== golden.count)
      failures.push(
        `${golden.name}: the ${GOLDEN.month} Claimant count is ${row.count}, expected the prep-locked ${golden.count}`,
      );
    if (row.pct !== golden.pct)
      failures.push(
        `${golden.name}: the ${GOLDEN.month} percentage is ${row.pct}, expected the prep-locked ${golden.pct}`,
      );
  }
  // Presence + sanity in every month the pull carries.
  const months = [...new Set(rows.map((r) => r.month))];
  for (const month of months) {
    for (const code of Object.keys(GOLDEN.rows)) {
      const row = byKey.get(`${code}|${month}`);
      if (!row) failures.push(`${code} is missing from the ${month} rows`);
      else if (row.count < 0 || (row.pct !== null && (row.pct < 0 || row.pct > 100)))
        failures.push(
          `${code} (${month}): count ${row.count} / pct ${row.pct} outside sane bounds`,
        );
    }
  }
  if (full) {
    for (const month of months) {
      const n = rows.filter((r) => r.month === month).length;
      if (n < LSOA_COUNT_BAND.min || n > LSOA_COUNT_BAND.max)
        failures.push(
          `the ${month} pull holds ${n} LSOAs — outside the ${LSOA_COUNT_BAND.min}–${LSOA_COUNT_BAND.max} band around the published 35,672 (a truncated or wrong-geography pull, not growth)`,
        );
    }
  }
  return failures;
}

// --- filing -----------------------------------------------------
//
// Filing with resume support (BUG-368): the stage is a
// PERSISTENT table now (migration 0048) and a
// loader_checkpoint row records the last fully staged
// chunk, so a killed run resumes staging from the
// checkpoint instead of re-staging the whole pull. The
// paged Nomis pull still re-runs — only the staging is
// saved. The edition is the filed months, joined; the
// expected total is the row count. The swap stays atomic
// and month-scoped, and a successful swap clears staging
// + checkpoint together (BUG-248 unchanged).

/**
 * @param {any} pool
 * @param {any[]} rows
 * @param {string} retrievedAt
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, restart?: boolean }} [options]
 */
export async function fileClaimant(
  pool,
  rows,
  retrievedAt,
  { progress = null, restart = false } = {},
) {
  const client = await pool.connect();
  // BUG-265: the filing is the run's long phase — a stage
  // marker up front and a line every 10,000 staged rows.
  progress?.stage(`filing ${formatCount(rows.length)} area-months`);
  const fileTally = progress?.tally({
    label: "file",
    total: rows.length,
    every: 10000,
    unit: "rows",
  });
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const edition = months.join("|");
  const expected = rows.length;
  await client.query(`CREATE TABLE IF NOT EXISTS benefits_stage (
      lsoa_code text, lsoa_name text, reference_month date,
      count integer, pct numeric,
      seq bigint NOT NULL, UNIQUE (seq)
    )`);
  const resume = createLoaderResume(client, {
    loader: "load-claimant-count",
    stageTable: "benefits_stage",
    progress,
    restart,
  });
  const resumePrep = await resume.prepare({ edition, expected });
  const startAt = resumePrep.resumed ? resumePrep.checkpoint.next_start_index : 0;
  let staged = resumePrep.resumed ? resumePrep.checkpoint.filed_count : 0;
  try {
    const values = [];
    const params = [];
    const flush = async () => {
      if (values.length === 0) return;
      const base = resume.takeSeq(values.length);
      await client.query(
        `INSERT INTO benefits_stage (lsoa_code, lsoa_name, reference_month, count, pct, seq) VALUES ${values.join(", ")}`,
        // The sixth parameter of every row is its seq —
        // a 0 placeholder at build time, replaced here
        // with the dense seq this flush owns.
        params.map((p, i) => (i % 6 === 5 ? base + Math.floor(i / 6) : p)),
      );
      staged += values.length;
      values.length = 0;
      params.length = 0;
      fileTally?.tick(staged);
      // BUG-368: one checkpoint line per committed chunk —
      // the save is visible in the logs, and a kill after
      // this line loses at most the chunk in flight.
      await resume.checkpoint({
        edition,
        expected,
        nextStartIndex: staged,
        read: staged,
        filed: staged,
        unit: "rows",
      });
    };
    for (const row of rows.slice(startAt)) {
      const base = params.length;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
      );
      params.push(row.lsoaCode, row.lsoaName, `${row.month}-01`, row.count, row.pct, 0);
      if (values.length >= 500) await flush();
    }
    await flush();
    fileTally?.finish(staged);
  } catch (err) {
    // BUG-368: the staging is durable per chunk — no
    // transaction to roll back, and the staged rows +
    // checkpoint STAY for the next run to resume from.
    progress?.failed({
      stage: "file",
      filed: staged,
      total: rows.length,
      error: err,
      resume: resume.resumeNote(),
    });
    client.release();
    throw err;
  }
  try {
    const stagedRes = await client.query("SELECT count(*)::int AS n FROM benefits_stage");
    if (stagedRes.rows[0].n !== expected)
      throw new Error("the staged area-month count does not match — rolling back");
    await client.query("BEGIN");
    try {
      for (const month of months) {
        await client.query(
          `DELETE FROM benefits_stats WHERE series = $1 AND reference_month = $2`,
          [SERIES, `${month}-01`],
        );
        await client.query(
          `INSERT INTO benefits_stats (lsoa_code, series, reference_month, lsoa_name, count, pct, source_name, source_date, loaded_at)
         SELECT lsoa_code, $1, reference_month, lsoa_name, count, pct, $2, reference_month, $3
         FROM benefits_stage WHERE reference_month = $4`,
          [SERIES, SOURCE_NAME, retrievedAt, `${month}-01`],
        );
      }
      await client.query(
        `DELETE FROM benefits_stats
       WHERE series = $1
         AND reference_month NOT IN (
           SELECT DISTINCT reference_month FROM benefits_stats
           WHERE series = $1 ORDER BY reference_month DESC LIMIT 13
         )`,
        [SERIES],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
    // The run is complete: staging + checkpoint go together,
    // so nothing is left behind for the next release.
    await resume.clear();
  } catch (err) {
    progress?.failed({
      stage: "file",
      filed: staged,
      total: rows.length,
      error: err,
      resume: resume.resumeNote(),
    });
    client.release();
    throw err;
  }
  client.release();
}

// --- sources ----------------------------------------------------

export function claimantUrl({ selector, codes, offset }) {
  const geography = codes ? codes.join(",") : "TYPE151";
  const params = new URLSearchParams({
    geography,
    date: selector,
    gender: "0",
    age: "0",
    measure: "1,2",
    measures: "20100",
  });
  if (offset) params.set("recordOffset", String(offset));
  return `${API_BASE}?${params.toString()}`;
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
export async function fetchRetry(
  url,
  { delaysMs = RETRY_DELAYS_MS, onRetry = null, retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS } = {},
) {
  const startedAt = Date.now();
  let attempt = 0;
  let response;
  for (;;) {
    attempt += 1;
    try {
      response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (response.status >= 500 || response.status === 429) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${url}`);
        error.status = response.status;
        throw error;
      }
      break;
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
  return response.text();
}

export const GOLDEN_CODES = Object.keys(GOLDEN.rows);

// One month for a named set of LSOAs (the verify-only pull
// and the canary's recipe, at full size).
export async function pullClaimantMonth(selector, codes, fetchOpts) {
  return parseClaimantCsv(await fetchRetry(claimantUrl({ selector, codes }), fetchOpts));
}

// One month nationally: page TYPE151 in guest-cap steps
// until a short page answers. Observations from every page
// are assembled together, so a page boundary falling
// between an LSOA's two measure rows is harmless, while a
// duplicated or missing measure still fails the assembly.
export async function pullClaimantNational(selector, { progress = null, fetchOpts } = {}) {
  const observations = [];
  // BUG-265: the paged pull is the run's long phase — a
  // line per page (25,000 rows), a heartbeat every 50,000
  // rows, and a warning for a page that takes more than 3x
  // the recent average. No total is known until the short
  // page answers, so no percentage is shown.
  const pullWatch = createBatchWatch();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const started = Date.now();
    const text = await fetchRetry(claimantUrl({ selector, offset }), fetchOpts);
    const rawCount = parseCsvText(text).length - 1;
    observations.push(...parseClaimantObservations(text));
    const { tookMs, averageMs, slow } = pullWatch.observe(Date.now() - started);
    progress?.count({ label: "pull", done: observations.length, unit: "rows", extra: selector });
    progress?.heartbeat({ stage: "pull", done: observations.length, every: 50000 });
    if (slow && tookMs >= 1000) {
      progress?.warning({
        what: "pull page duration",
        value: `page at offset ${formatCount(offset)} took ${formatDuration(tookMs)}`,
        threshold: `3x recent average ${formatDuration(averageMs)}`,
      });
    }
    if (rawCount < PAGE_SIZE) break;
    if (offset > PAGE_SIZE * 6)
      throw new Error(
        "the national pull paged past seven pages without a short page — the source shape changed",
      );
  }
  return assembleClaimantRows(observations);
}

// The live filing set: the latest month and the revised
// previous month, nationally — or for named codes when a
// verify pull asks for them. The fixture mode assembles
// every captured response in the folder the same way.
/**
 * @param {{ kind: string, dir?: string, codes?: string[] }} source
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export async function loadClaimantRows(source, { progress = null, fetchOpts } = {}) {
  if (source.kind === "dir") {
    const files = readdirSync(source.dir)
      .filter((f) => f.startsWith("claimant-count-") && f.endsWith(".csv"))
      .sort();
    if (files.length === 0)
      throw new Error(`${source.dir} holds no claimant-count-*.csv — the fixture is missing`);
    const observations = [];
    // BUG-265: a line per fixture file, with the running
    // observation count — the fixture's own file count is
    // the total.
    for (const [i, f] of files.entries()) {
      observations.push(...parseClaimantObservations(readFileSync(join(source.dir, f), "utf8")));
      progress?.count({
        label: "fixture",
        done: i + 1,
        total: files.length,
        unit: "files",
        extra: `${formatCount(observations.length)} observations`,
      });
    }
    return { rows: assembleClaimantRows(observations) };
  }
  const chunks = [];
  for (const selector of MONTH_SELECTORS) {
    // BUG-265: a stage marker per month — the pull is the
    // run's long phase.
    progress?.stage(`pulling ${selector} — Claimant Count month`);
    chunks.push(
      source.codes
        ? await pullClaimantMonth(selector, source.codes, fetchOpts)
        : await pullClaimantNational(selector, { progress, fetchOpts }),
    );
  }
  const seen = new Set();
  const rows = [];
  for (const row of chunks.flat()) {
    const key = `${row.lsoaCode}|${row.month}`;
    if (seen.has(key)) throw new Error(`${row.lsoaCode} (${row.month}) arrived twice in one pull`);
    seen.add(key);
    rows.push(row);
  }
  return { rows };
}

function summaryLine(rows, filed) {
  const months = [...new Set(rows.map((r) => r.month))].sort();
  return (
    `load-claimant-count · Claimant Count (count + published % of residents aged 16–64) · ` +
    `${formatCount(rows.length)} area-months ${filed ? "filed" : "would file"} for ${months.join(" and ")}`
  );
}

const DEFAULT_FIXTURE_DIR = fileURLToPath(
  new URL("../../tests/fixtures/claimant-count/", import.meta.url),
);

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const fixtureMode = fileArg !== null;
  const verifyOnly = args.includes("--verify-only");
  const restart = args.includes("--restart");
  const source = fixtureMode
    ? { kind: "dir", dir: fileArg ?? DEFAULT_FIXTURE_DIR }
    : verifyOnly
      ? { kind: "live", codes: GOLDEN_CODES }
      : { kind: "live" };
  // BUG-265: one logger for the run — the pull lines above
  // and the filing tally inside fileClaimant.
  const progress = createProgressLogger({ name: "load-claimant-count" });
  let rows;
  try {
    ({ rows } = await loadClaimantRows(source, { progress }));
  } catch (err) {
    progress.failed({
      stage: "pull",
      filed: 0,
      error: err,
      resume: "re-run from scratch (nothing is filed until the filing step)",
    });
    throw err;
  }
  const golden = goldenChecks(rows, { full: source.kind === "live" && !source.codes });
  if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);
  if (verifyOnly) {
    console.log(`${summaryLine(rows, false)} — golden areas OK (verify-only: nothing filed)`);
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await fileClaimant(pool, rows, new Date().toISOString(), { progress, restart });
  } finally {
    await pool.end();
  }
  console.log(`${summaryLine(rows, true)} — golden areas OK`);
}

// Run only as a script (run-loaders / npm), never on import.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(`load-claimant-count FAILED: ${err.message}`);
    process.exit(1);
  });
}
