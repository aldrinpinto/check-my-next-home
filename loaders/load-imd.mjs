// English Indices of Deprivation 2025 (IoD2025) — ONE static source,
// filed into neighbourhood_stats, one row per 2021 LSOA:
//
//   load-imd — MHCLG's File 7 CSV (all ranks, scores, deciles and
//   population denominators), keyless from GOV.UK's asset server under
//   the Open Government Licence v3. Files the overall IMD score, rank
//   and decile plus the SEVEN DOMAIN DECILES (Income, Employment,
//   Education Skills and Training, Health Deprivation and Disability,
//   Crime, Barriers to Housing and Services, Living Environment) into
//   the stats JSON, the decile into imd_decile, and the Final Design's
//   standard summary line rendered from the decile into imd_summary.
//
// Why this shape:
//   * England only. Scotland and Wales publish their own indices on
//     their own scales; the scores must never be compared across the
//     border, so nothing is filed for a non-English LSOA and the brain
//     serves its named not-covered state there (plan M5.9, gap G8).
//   * IDACI and IDAOPI stay out (founder ruling, gap G9): File 7
//     carries them, this loader never reads those columns.
//   * imd_summary is a deterministic rendering of the decile in the
//     Final Design's words ("among the more deprived 30 percent of
//     areas in England") — rendered once at load time so every surface
//     reads the same line (gap G10, build-level steer).
//   * File 7 was re-issued as "v2" after an ONS lookup correction —
//     the canary watches the GOV.UK release page (probe "govuk-iod"),
//     and a re-file is an operator re-run of this loader.
//   * Static runner class: due exactly once, then only when the
//     canary or an operator says a new edition exists.
//
// Load discipline (house pattern): the CSV is parsed and validated in
// full (header contract, row count, golden homes) BEFORE anything is
// filed; filing is one transaction — stage table, then swap — so a
// failed load never overwrites the last good copy. neighbourhood_stats
// is IMD's table today (Census lives in census_stats, migration 0011),
// so the swap replaces the whole table.
//
// Modes:
//   node loaders/load-imd.mjs                  live download + file
//   node loaders/load-imd.mjs --verify-only    live download + golden
//                                              checks, files nothing
//   node loaders/load-imd.mjs --file <dir>     file from a local folder
//     holding iod2025-file7.csv (the CI fixture is three rows verbatim
//     from the published file — see tests/fixtures/imd/README.md).
//
// Verify-only runs need no database. Exits non-zero on any failure and
// prints "load-imd FAILED: …" to stderr.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createLoaderResume } from "./loader-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";

const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";

// The GOV.UK release page for the English indices of deprivation 2025;
// File 7 hangs off the asset server. The media id in the asset URL is
// the v2 re-issue (ONS lookup correction) current at build time — the
// canary resolves the current link from the release page rather than
// trusting this constant.
export const IOD_RELEASE_PAGE =
  "https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025";
export const FILE7_URL =
  "https://assets.publishing.service.gov.uk/media/691ded56d140bbbaa59a2a7d/File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv";
export const FIXTURE_FILE = "iod2025-file7.csv";

export const SOURCE_NAME = "English Indices of Deprivation 2025 — File 7 (MHCLG)";
// IoD2025 was published on 30 October 2025.
export const SOURCE_DATE = "2025-10-30";
// The published File 7 row count (2021 LSOAs in England).
export const NATIONAL_LSOA_COUNT = 33755;

// The columns this loader consumes, by their published header text
// with whitespace collapsed (two published headers wrap across lines
// inside quotes: "Education, Skills and Training …"). Anything else
// in the file (sub-domains, IDACI/IDAOPI, population denominators) is
// deliberately not read.
const COL = {
  lsoaCode: "LSOA code (2021)",
  lsoaName: "LSOA name (2021)",
  score: "Index of Multiple Deprivation (IMD) Score",
  rank: "Index of Multiple Deprivation (IMD) Rank (where 1 is most deprived)",
  decile: "Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)",
};
const DOMAIN_COLS = {
  income: "Income Decile (where 1 is most deprived 10% of LSOAs)",
  employment: "Employment Decile (where 1 is most deprived 10% of LSOAs)",
  education: "Education, Skills and Training Decile (where 1 is most deprived 10% of LSOAs)",
  health: "Health Deprivation and Disability Decile (where 1 is most deprived 10% of LSOAs)",
  crime: "Crime Decile (where 1 is most deprived 10% of LSOAs)",
  barriers: "Barriers to Housing and Services Decile (where 1 is most deprived 10% of LSOAs)",
  livingEnvironment: "Living Environment Decile (where 1 is most deprived 10% of LSOAs)",
};
export const EXPECTED_COLUMN_COUNT = 56;

// The golden homes' LSOAs (D10 universal set), with the figures
// extracted live from the published File 7 on 13 November 2026
// (M5.9 prep, re-verified at build). Domain deciles in the order
// income, employment, education, health, crime, barriers,
// livingEnvironment.
export const GOLDEN = {
  E01021395: {
    name: "Braintree 018C",
    score: 9.497,
    rank: 25570,
    decile: 8,
    domains: [7, 8, 7, 7, 8, 4, 9],
  },
  E01003511: {
    name: "Newham 036A",
    score: 29.212,
    rank: 8676,
    decile: 3,
    domains: [2, 4, 4, 5, 5, 1, 6],
  },
  E01030396: {
    name: "Epsom and Ewell 010D",
    score: 2.986,
    rank: 32740,
    decile: 10,
    domains: [9, 10, 10, 10, 8, 10, 7],
  },
};
const DOMAIN_KEYS = Object.keys(DOMAIN_COLS);

// The Final Design's standard summary line, rendered from the decile:
// deciles 1–5 are the more deprived half ("among the more deprived
// 30 percent of areas in England" for decile 3), deciles 6–10 the
// less deprived half. No score, no verdict — the published decile in
// the design's words.
export function imdSummaryFor(decile) {
  if (!Number.isInteger(decile) || decile < 1 || decile > 10) {
    throw new Error(`imdSummaryFor: decile ${decile} is not 1–10`);
  }
  return decile <= 5
    ? `Among the more deprived ${decile * 10} percent of areas in England`
    : `Among the less deprived ${(11 - decile) * 10} percent of areas in England`;
}

const normaliseHeader = (h) => h.replace(/\s+/g, " ").trim();

// Minimal RFC-4180 CSV reader: quoted fields, embedded commas and
// newlines, CRLF. Yields arrays of raw string fields.
export function* csvRecords(text) {
  let field = "";
  let record = [];
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      yield record;
      record = [];
    } else field += c;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    yield record;
  }
}

// Parse File 7 text into filed rows. Throws on any contract breach —
// a changed header or a short file must stop the load, never file a
// partial or mis-mapped copy.
export function parseFile7(text) {
  const records = [...csvRecords(text)];
  if (records.length < 2) throw new Error("File 7: fewer than 2 records");
  const header = records[0].map(normaliseHeader);
  if (header.length !== EXPECTED_COLUMN_COUNT) {
    throw new Error(
      `File 7: header has ${header.length} columns, expected ${EXPECTED_COLUMN_COUNT}`,
    );
  }
  const index = new Map(header.map((h, i) => [h, i]));
  for (const name of [
    COL.lsoaCode,
    COL.lsoaName,
    COL.score,
    COL.rank,
    COL.decile,
    ...Object.values(DOMAIN_COLS),
  ]) {
    if (!index.has(name)) throw new Error(`File 7: missing column "${name}"`);
  }
  const get = (rec, name) => rec[index.get(name)];
  const rows = [];
  const seen = new Set();
  for (const rec of records.slice(1)) {
    if (rec.length === 1 && rec[0] === "") continue; // trailing blank line
    if (rec.length !== header.length) {
      throw new Error(`File 7: row has ${rec.length} fields, expected ${header.length}: ${rec[0]}`);
    }
    const lsoaCode = get(rec, COL.lsoaCode).trim();
    if (!/^E010\d{5}$/.test(lsoaCode)) {
      throw new Error(`File 7: unexpected LSOA code "${lsoaCode}"`);
    }
    if (seen.has(lsoaCode)) throw new Error(`File 7: duplicate LSOA ${lsoaCode}`);
    seen.add(lsoaCode);
    const decile = Number(get(rec, COL.decile) ?? NaN);
    if (!Number.isInteger(decile) || decile < 1 || decile > 10) {
      throw new Error(`File 7: bad IMD decile for ${lsoaCode}`);
    }
    const domains = {};
    for (const key of DOMAIN_KEYS) {
      const d = Number(get(rec, DOMAIN_COLS[key]) ?? NaN);
      if (!Number.isInteger(d) || d < 1 || d > 10) {
        throw new Error(`File 7: bad ${key} decile for ${lsoaCode}`);
      }
      domains[key] = d;
    }
    const score = Number(get(rec, COL.score) ?? NaN);
    const rank = Number(get(rec, COL.rank) ?? NaN);
    if (!Number.isFinite(score) || !Number.isInteger(rank) || rank < 1) {
      throw new Error(`File 7: bad score/rank for ${lsoaCode}`);
    }
    rows.push({
      lsoaCode,
      lsoaName: get(rec, COL.lsoaName).trim(),
      stats: { score, rank, domains },
      imdDecile: decile,
      imdSummary: imdSummaryFor(decile),
    });
  }
  return rows;
}

export function goldenChecks(rows, { full }) {
  const problems = [];
  if (full && rows.length !== NATIONAL_LSOA_COUNT) {
    problems.push(
      `filed LSOAs ${rows.length.toLocaleString("en-GB")} ≠ ${NATIONAL_LSOA_COUNT.toLocaleString("en-GB")}`,
    );
  }
  const byCode = new Map(rows.map((r) => [r.lsoaCode, r]));
  for (const [code, g] of Object.entries(GOLDEN)) {
    const row = byCode.get(code);
    if (!row) {
      problems.push(`golden LSOA ${code} missing`);
      continue;
    }
    if (row.lsoaName !== g.name) {
      problems.push(`${code} name is "${row.lsoaName}", golden "${g.name}"`);
    }
    if (row.stats.score !== g.score) {
      problems.push(`${code} score is ${row.stats.score}, golden ${g.score}`);
    }
    if (row.stats.rank !== g.rank) {
      problems.push(`${code} rank is ${row.stats.rank}, golden ${g.rank}`);
    }
    if (row.imdDecile !== g.decile) {
      problems.push(`${code} decile is ${row.imdDecile}, golden ${g.decile}`);
    }
    DOMAIN_KEYS.forEach((key, i) => {
      if (row.stats.domains[key] !== g.domains[i]) {
        problems.push(`${code} ${key} decile is ${row.stats.domains[key]}, golden ${g.domains[i]}`);
      }
    });
    if (row.imdSummary !== imdSummaryFor(g.decile)) {
      problems.push(`${code} summary does not render its decile`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`golden checks failed:\n  - ${problems.join("\n  - ")}`);
  }
}

const CHUNK = 500;

/**
 * @param {any} client
 * @param {any[]} rows
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, resume?: { restart?: boolean } | null }} [options]
 */
export async function fileImd(client, rows, { progress = null, resume: resumeOpts = null } = {}) {
  // BUG-265: the filing loop is the run's long phase — a line
  // every twentieth of the stage chunks, a heartbeat, and a
  // warning for a chunk over 3x the recent average.
  // BUG-368: with the resume option the stage is a PERSISTENT
  // table (migration 0048) and a loader_checkpoint row records
  // the last fully staged chunk, so a killed run resumes
  // instead of restarting. Without it the filing is exactly
  // the one-shot transaction below (a TEMP stage inside one
  // BEGIN…COMMIT). The edition is the IoD2025 publication
  // date — the load is a static one-off, so the edition never
  // changes between runs of the same release.
  const chunks = Math.ceil(rows.length / CHUNK);
  const fileTally = progress?.tally({
    label: "file",
    total: chunks,
    every: Math.max(1, Math.ceil(chunks / 20)),
    unit: "chunks",
  });
  const fileWatch = createBatchWatch();
  let staged = 0;
  let resume = null;
  try {
    if (resumeOpts) {
      await client.query(`CREATE TABLE IF NOT EXISTS imd_stage (
          lsoa_code text, lsoa_name text, stats jsonb, imd_decile integer,
          imd_summary text, source_name text, source_date date,
          seq bigint NOT NULL, UNIQUE (seq)
        )`);
      resume = createLoaderResume(client, {
        loader: "load-imd",
        stageTable: "imd_stage",
        progress,
        restart: resumeOpts.restart ?? false,
      });
      const prep = await resume.prepare({ edition: SOURCE_DATE, expected: rows.length });
      if (prep.resumed) staged = prep.checkpoint.filed_count;
    } else {
      await client.query("BEGIN");
      await client.query(`CREATE TEMP TABLE imd_stage (
        lsoa_code text, lsoa_name text, stats jsonb, imd_decile integer,
        imd_summary text, source_name text, source_date date
      ) ON COMMIT DROP`);
    }
    // The tally counts absolute chunks, so a resumed run's
    // first tick lands at its true position.
    // Ceil, not floor: the last chunk may be partial, and a
    // fully staged resume must finish at total/total, not one
    // short (a kill during the swap resumes here).
    let chunkNo = Math.ceil(staged / CHUNK);
    for (let i = staged; i < rows.length; i += CHUNK) {
      const started = Date.now();
      const chunk = rows.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      const base = resume ? resume.takeSeq(chunk.length) : 0;
      chunk.forEach((r, j) => {
        const b = resume ? j * 8 : j * 7;
        values.push(
          resume
            ? `($${b + 1}, $${b + 2}, $${b + 3}::jsonb, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8})`
            : `($${b + 1}, $${b + 2}, $${b + 3}::jsonb, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`,
        );
        params.push(
          r.lsoaCode,
          r.lsoaName,
          JSON.stringify(r.stats),
          r.imdDecile,
          r.imdSummary,
          SOURCE_NAME,
          SOURCE_DATE,
        );
        if (resume) params.push(base + j);
      });
      await client.query(
        resume
          ? `INSERT INTO imd_stage (lsoa_code, lsoa_name, stats, imd_decile, imd_summary, source_name, source_date, seq) VALUES ${values.join(", ")}`
          : `INSERT INTO imd_stage (lsoa_code, lsoa_name, stats, imd_decile, imd_summary, source_name, source_date) VALUES ${values.join(", ")}`,
        params,
      );
      staged += chunk.length;
      chunkNo += 1;
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
      if (resume) {
        await resume.checkpoint({
          edition: SOURCE_DATE,
          expected: rows.length,
          nextStartIndex: staged,
          read: staged,
          filed: staged,
          unit: "LSOAs",
        });
      }
    }
    fileTally?.finish(chunkNo);
    if (resume) {
      const stagedRes = await client.query("SELECT count(*)::int AS n FROM imd_stage");
      if (stagedRes.rows[0].n !== rows.length)
        throw new Error("the staged LSOA count does not match — rolling back");
      await client.query("BEGIN");
      try {
        await client.query(`DELETE FROM neighbourhood_stats`);
        await client.query(
          `INSERT INTO neighbourhood_stats (lsoa_code, lsoa_name, stats, imd_decile, imd_summary, source_name, source_date)
           SELECT lsoa_code, lsoa_name, stats, imd_decile, imd_summary, source_name, source_date FROM imd_stage`,
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
      // The run is complete: staging + checkpoint go together,
      // so nothing is left behind for the next release.
      await resume.clear();
    } else {
      await client.query(`DELETE FROM neighbourhood_stats`);
      await client.query(
        `INSERT INTO neighbourhood_stats (lsoa_code, lsoa_name, stats, imd_decile, imd_summary, source_name, source_date)
         SELECT lsoa_code, lsoa_name, stats, imd_decile, imd_summary, source_name, source_date FROM imd_stage`,
      );
      await client.query("COMMIT");
    }
  } catch (err) {
    progress?.failed({
      stage: "file",
      filed: staged,
      total: rows.length,
      error: err,
      resume: resume
        ? resume.resumeNote()
        : "re-run from scratch (filing is one transaction; nothing was swapped)",
    });
    if (!resumeOpts) await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
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
export async function fetchText(
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
  return res.text();
}

export async function loadImdRows({ fileDir = null, fetchOpts } = {}) {
  if (fileDir) {
    const names = await readdir(fileDir);
    if (!names.includes(FIXTURE_FILE)) {
      throw new Error(`no ${FIXTURE_FILE} in ${fileDir}`);
    }
    return parseFile7(await readFile(join(fileDir, FIXTURE_FILE), "utf8"));
  }
  return parseFile7(await fetchText(FILE7_URL, fetchOpts));
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

  // BUG-265: the download and the filing both log while they
  // work; the parse count carries the published total only on
  // a full (live) run — the fixture holds three rows, not the
  // national 33,755.
  const progress = createProgressLogger({ name: "load-imd" });
  progress.stage(
    fileDir ? `reading File 7 from ${fileDir}...` : "downloading File 7 from GOV.UK...",
  );
  let rows;
  try {
    rows = await loadImdRows({ fileDir });
    goldenChecks(rows, { full: !fileDir });
  } catch (err) {
    progress.failed({
      stage: "read",
      filed: 0,
      error: err,
      resume: "re-run (nothing filed)",
    });
    throw err;
  }
  progress.count({
    label: "parse",
    done: rows.length,
    total: fileDir ? null : NATIONAL_LSOA_COUNT,
    unit: "LSOAs",
  });
  const base = `load-imd · IoD2025 File 7 · ${rows.length.toLocaleString("en-GB")} LSOAs`;
  if (verifyOnly) {
    console.log(`${base} — golden homes OK (verify-only, nothing filed)`);
    return;
  }
  progress.stage(`filing ${formatCount(rows.length)} LSOAs into neighbourhood_stats...`);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    try {
      // BUG-368: stage resumably — a killed run's staging +
      // checkpoint survive, and the next run resumes from the
      // checkpoint instead of re-staging.
      await fileImd(client, rows, { progress, resume: { restart } });
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
    console.error(`load-imd FAILED: ${err.message}`);
    process.exit(1);
  });
}
