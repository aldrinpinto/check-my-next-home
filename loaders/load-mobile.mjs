// Ofcom Connected Nations — mobile coverage, filed into
// postcode_cache.answers under the "mobile" key:
//
//   load-mobile — the mobile companion to load-broadband, from the
//   same Connected Nations release (discovered from the same
//   publication page; plan M5.9 gap G7: mobile is in V1).
//
// THE GRAIN, stated plainly: Ofcom does not publish mobile coverage
// by postcode — it says so itself (the pixel-level data is not
// released; the address-level checker API is per-address, not bulk).
// The published bulk file is at LOCAL AUTHORITY level:
// <snapshot>_mobile_coverage_laua_r<N>.csv, one row per local or
// unitary authority, percentages of premises with coverage from
// exactly 0, 1, 2, 3 or 4 operators for each service. This loader
// files each postcode the answer for ITS OWN local authority (the
// council the postcode directory already files), with the grain
// named inside the answer — an area figure, never dressed up as a
// postcode measurement. The prep's expectation of a postcode-level
// mobile file was wrong; the founder's ruling stands (mobile is
// included), the design absorbs the true grain.
//
// What is filed per authority, from the published columns: for
// Voice, 4G, ordinary 5G (high and very high confidence) and 5G
// Standalone (high and very high confidence), the outdoor
// percentages with no operator and with all operators, plus
// Ofcom's own sanctioned derivation for "at least one operator"
// (100 minus the no-operator percentage — Spring 2026
// About-this-data note 4), with the published inputs filed beside
// it so the derivation is auditable. Every service's
// all-operators column is its _4 — Voice included: the real file
// publishes Voice_prem_out_4 with values (the founder's v6 raw
// rows show Braintree Voice_prem_out_4 = 99.29, with _3 = 0.64
// the exactly-three share). An earlier revision of this loader
// read Voice's all-operators from _3; that was wrong.
//
// EMPTY CELLS ARE ZEROS — with one documented exception. Ofcom
// writes an exact zero as an empty cell in the operator-count
// percentage columns: the founder's v6 live run (13 Nov 2026)
// printed the real rows, and Braintree's 4G_prem_out _0 is empty
// while _1.._4 sum to exactly 100, and Newham's _0.._3 are all
// empty beside _4 = 100. So parsing is two passes: a column that
// is empty in EVERY row is an unpublished column and its figure
// files as null; any other empty cell is an exact 0. The
// unpublished case is the documented one — the Spring 2026
// About-this-data states that all 3G columns for 2, 3 and 4
// operators are empty file-wide (3G switch-off) and all 5G SA
// columns for 4 operators are empty file-wide (one operator does
// not deploy 5G SA): those combinations do not exist, so the 5G
// SA all-operators figure files as null — never as 0 — while its
// published no-operator figure and the derivation still file. Of
// the filed services, only 4G also carries an indoor set; every
// 5G variant is outdoor-only.
//
// There is NO Data service in the Spring 2026 file. Older Ofcom
// documentation (through Spring 2025) listed an aggregate Data
// family, and this loader originally required it; the founder's
// live run on 13 Nov 2026 proved the shipped Spring 2026 file has
// no Data_* columns, and the Spring 2026 About-this-data service
// list omits Data. It is not reconstructed from 4G: the older
// aggregate was defined from combined 3G/4G thresholds, so 4G
// alone is not the same measure.
//
// Access, filing discipline and modes mirror load-broadband:
// ofcom.org.uk 403s this build sandbox. The founder-machine runs
// supplied the real Spring 2026 header shape this loader and its
// fixture now follow, and the v6 run passed end-to-end against
// the real release — its raw-row printout is also the evidence
// for the empty-cell rule above. One transaction stages and
// merges; stale
// keys are removed in the same transaction; a failed load never
// overwrites the last good copy. Postcodes whose council matches
// no published authority are counted and named in the loader's
// output — never silently skipped.
//
// Modes:
//   node loaders/load-mobile.mjs                  discover + file
//   node loaders/load-mobile.mjs --verify-only    discover +
//     structural checks, files nothing
//   node loaders/load-mobile.mjs --file <dir>     file a local
//     release folder: release.json + the laua CSV.
//
// Exits non-zero on any failure and prints
// "load-mobile FAILED: …" to stderr.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import yauzl from "yauzl";
import { csvRecords, discoverReleaseZips } from "./load-broadband.mjs";
import { createLoaderResume } from "./loader-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";

const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";

export const SOURCE_NAME = "Ofcom Connected Nations — mobile coverage (local authority level)";
export const ANSWER_KEY = "mobile";

// Service columns consumed, by their published names
// ([Service]_[prem type]_[operator count]). `allOperators` is the
// highest published operator-count column for that service: 4 for
// every filed service, Voice included — the real file publishes
// Voice_prem_out_4 with values. (The 5G SA _4 columns exist but
// are empty file-wide in Spring 2026; see the header note.)
const SERVICES = {
  voice: { label: "Voice", allOperators: 4 },
  "4g": { label: "4G", allOperators: 4 },
  "5g_high_confidence": { label: "5G_high_confidence", allOperators: 4 },
  "5g_very_high_confidence": { label: "5G_very_high_confidence", allOperators: 4 },
  "5g_sa_high_confidence": { label: "5G_SA_high_confidence", allOperators: 4 },
  "5g_sa_very_high_confidence": {
    label: "5G_SA_very_high_confidence",
    allOperators: 4,
  },
};
// The operator-count columns this loader consumes — the set the
// empty-cell rule's first pass is judged over.
const CONSUMED_COLUMNS = [
  ...Object.values(SERVICES).flatMap(({ label, allOperators }) => [
    `${label}_prem_out_0`,
    `${label}_prem_out_${allOperators}`,
  ]),
  "4G_prem_in_0",
  "4G_prem_in_4",
];
const REQUIRED_COLUMNS = ["laua", "laua_name", ...CONSUMED_COLUMNS];

// The golden homes' councils (D10) — directory facts from the
// postcode loader, not coverage figures. Their authorities must be
// present in the release and must match postcodes at filing time.
export const GOLDEN_COUNCILS = ["Braintree", "Newham", "Epsom and Ewell"];

export const normaliseCouncil = (name) => name.trim().replace(/\s+/g, " ").toLowerCase();

// A published (non-empty) cell must be a percentage. Empty cells
// never reach here — figure() inside parseLauaCsv resolves them
// first, under the empty-cell rule.
const pct = (raw, laua, field) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`mobile: ${field} "${raw}" for ${laua} is not a percentage`);
  }
  return n;
};

// Build one coverage set from its two resolved figures. A figure
// is null only when its column is unpublished (empty in every
// row — e.g. the 5G SA _4 columns: the no-operator figure and
// its derivation file beside a null all-operators figure). The
// set itself is null only when neither figure is usable, the
// defensive case, kept in the null shape earlier revisions
// filed for unpublished sets.
const coverageSet = (none, all) => {
  if (none === null && all === null) return null;
  return {
    no_operator_pct: none,
    all_operators_pct: all,
    // Ofcom's own derivation (Spring 2026 About-this-data note 4).
    at_least_one_operator_pct: none === null ? null : Math.round((100 - none) * 10) / 10,
  };
};

// Parse the laua CSV into {laua, lauaName, answer} rows.
export function parseLauaCsv(text, release) {
  const records = [...csvRecords(text)];
  if (records.length < 2) throw new Error("mobile: laua file has no rows");
  const header = records[0].map((h) => h.trim());
  const index = new Map(header.map((h, i) => [h, i]));
  for (const name of REQUIRED_COLUMNS) {
    if (!index.has(name)) {
      throw new Error(`mobile: missing column "${name}"; file headers: ${records[0].join(" | ")}`);
    }
  }
  const get = (rec, name) => rec[index.get(name)];
  // A record in which every field is empty is a blank row the
  // file carries (the real Spring 2026 file ends with an empty
  // row spanning all columns): it holds no data, so it is set
  // aside before anything else. A record that carries values but
  // no authority code or name is a data error and still throws
  // below.
  const dataRecords = records.slice(1).filter((rec) => !rec.every((field) => field.trim() === ""));
  // Pass 1 — the empty-cell rule (see the header note): a
  // consumed column that is empty in EVERY authority row is an
  // unpublished column (the documented 3G multi-operator and 5G
  // SA four-operator cases) and its figures file as null. Any
  // other empty cell is an exact zero Ofcom chose not to print.
  const unpublished = new Set(
    CONSUMED_COLUMNS.filter((name) =>
      dataRecords.every((rec) => {
        const value = get(rec, name);
        return value === undefined || value.trim() === "";
      }),
    ),
  );
  const figure = (rec, name, lauaName) => {
    const raw = get(rec, name);
    if (raw !== undefined && raw.trim() !== "") return pct(raw, lauaName, name);
    return unpublished.has(name) ? null : 0;
  };
  const rows = [];
  for (const rec of dataRecords) {
    const laua = get(rec, "laua").trim();
    const lauaName = get(rec, "laua_name").trim();
    if (!laua || !lauaName) throw new Error("mobile: a row with no authority code or name");
    const services = {};
    for (const [key, { label, allOperators }] of Object.entries(SERVICES)) {
      services[key] = {
        outdoor: coverageSet(
          figure(rec, `${label}_prem_out_0`, lauaName),
          figure(rec, `${label}_prem_out_${allOperators}`, lauaName),
        ),
      };
      if (key === "4g") {
        services[key].indoor = coverageSet(
          figure(rec, "4G_prem_in_0", lauaName),
          figure(rec, "4G_prem_in_4", lauaName),
        );
      }
    }
    rows.push({
      laua,
      lauaName,
      answer: {
        basis:
          "Local authority area — Ofcom publishes mobile coverage at local-authority level, not by postcode",
        snapshot: release.snapshotLabel,
        laua,
        laua_name: lauaName,
        services,
      },
    });
  }
  return rows;
}

export function structuralChecks(rows, { full }) {
  const problems = [];
  if (full && rows.length < 300) {
    problems.push(`only ${rows.length} authorities — a national release carries ~361`);
  }
  const names = new Set(rows.map((r) => normaliseCouncil(r.lauaName)));
  for (const council of GOLDEN_COUNCILS) {
    if (!names.has(normaliseCouncil(council))) {
      problems.push(`golden council "${council}" missing from the release`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`structural checks failed:\n  - ${problems.join("\n  - ")}`);
  }
}

const CHUNK = 500;

// BUG-265 / BUG-227: the unmatched-council count in the
// filing line reads "1 council matched no authority" for
// exactly one — never "1 councils ...".
function unmatchedNote(n) {
  return n === 1
    ? "1 council matched no authority"
    : `${formatCount(n)} councils matched no authority`;
}

/**
 * @param {any} client
 * @param {any[]} rows
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, resume?: { edition?: string, restart?: boolean } | null }} [options]
 */
export async function fileMobile(
  client,
  rows,
  { progress = null, resume: resumeOpts = null } = {},
) {
  // BUG-265: the authority staging is one short loop and
  // the postcode_cache UPDATE is a single statement, so
  // this loader's lines are stage markers and counts — no
  // batch loop exists to tally. The total is genuine: the
  // release's own authority count.
  // BUG-368: with the resume option the stage is a PERSISTENT
  // table (migration 0048) and a loader_checkpoint row records
  // the last fully staged chunk, so a killed run resumes
  // instead of restarting. Without it the filing is exactly
  // the one-shot transaction below (a TEMP stage inside one
  // BEGIN…COMMIT). The edition is the release's snapshot +
  // revision (e.g. "2026-03r1") — the run passes it in, since
  // the rows alone do not carry it. The merge into
  // postcode_cache is idempotent, so a kill during the merge
  // resumes with staging complete and re-runs the merge.
  progress?.stage(`filing ${formatCount(rows.length)} authorities...`);
  let updated = 0;
  let resume = null;
  let staged = 0;
  const chunks = Math.ceil(rows.length / CHUNK);
  const fileTally = resumeOpts
    ? progress?.tally({
        label: "file",
        total: chunks,
        every: Math.max(1, Math.ceil(chunks / 20)),
        unit: "chunks",
      })
    : null;
  const fileWatch = createBatchWatch();
  try {
    if (resumeOpts) {
      if (!resumeOpts.edition)
        throw new Error("fileMobile with resume needs the release edition (snapshot + revision)");
      await client.query(`CREATE TABLE IF NOT EXISTS mobile_stage (
          laua_name text, laua_norm text PRIMARY KEY, answer jsonb,
          seq bigint NOT NULL, UNIQUE (seq)
        )`);
      resume = createLoaderResume(client, {
        loader: "load-mobile",
        stageTable: "mobile_stage",
        progress,
        restart: resumeOpts.restart ?? false,
      });
      const prep = await resume.prepare({ edition: resumeOpts.edition, expected: rows.length });
      if (prep.resumed) staged = prep.checkpoint.filed_count;
    } else {
      await client.query("BEGIN");
      await client.query(`CREATE TEMP TABLE mobile_stage (
        laua_name text, laua_norm text PRIMARY KEY, answer jsonb
      ) ON COMMIT DROP`);
    }
    // The tally counts absolute chunks, so a resumed run's
    // first tick lands at its true position. Ceil, not floor:
    // the last chunk may be partial, and a fully staged resume
    // must finish at total/total, not one short (a kill during
    // the merge resumes here).
    let chunkNo = Math.ceil(staged / CHUNK);
    for (let i = staged; i < rows.length; i += CHUNK) {
      const started = Date.now();
      const chunk = rows.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      const base = resume ? resume.takeSeq(chunk.length) : 0;
      chunk.forEach((r, j) => {
        const b = resume ? j * 4 : j * 3;
        values.push(
          resume
            ? `($${b + 1}, $${b + 2}, $${b + 3}::jsonb, $${b + 4})`
            : `($${b + 1}, $${b + 2}, $${b + 3}::jsonb)`,
        );
        params.push(r.lauaName, normaliseCouncil(r.lauaName), JSON.stringify(r.answer));
        if (resume) params.push(base + j);
      });
      await client.query(
        resume
          ? `INSERT INTO mobile_stage (laua_name, laua_norm, answer, seq) VALUES ${values.join(", ")}`
          : `INSERT INTO mobile_stage (laua_name, laua_norm, answer) VALUES ${values.join(", ")}`,
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
          edition: resumeOpts.edition,
          expected: rows.length,
          nextStartIndex: staged,
          read: staged,
          filed: staged,
          unit: "authorities",
        });
      }
    }
    fileTally?.finish(chunkNo);
    progress?.count({
      label: "stage",
      done: staged,
      total: rows.length,
      unit: "authorities",
    });
    progress?.stage("updating postcode_cache answers from the staged authorities...");
    if (resume) {
      // The staged authority count must match before the merge
      // runs — the merge itself is idempotent, so a kill here
      // resumes with staging complete and re-runs it.
      const stagedRes = await client.query("SELECT count(*)::int AS n FROM mobile_stage");
      if (stagedRes.rows[0].n !== rows.length)
        throw new Error("the staged authority count does not match — rolling back");
      await client.query("BEGIN");
    }
    try {
      const updatedRes = await client.query(
        `UPDATE postcode_cache SET answers = answers || jsonb_build_object('mobile', s.answer)
       FROM mobile_stage s
       WHERE lower(regexp_replace(trim(postcode_cache.council), '\\s+', ' ', 'g')) = s.laua_norm`,
      );
      updated = updatedRes.rowCount ?? 0;
      // Any postcode still holding a mobile key that this release did
      // not just refresh belongs to an unmatched or renamed council —
      // clear it rather than serve a stale area figure as current.
      await client.query(
        `UPDATE postcode_cache SET answers = answers - 'mobile'
       WHERE answers ? 'mobile'
         AND lower(regexp_replace(trim(council), '\\s+', ' ', 'g'))
             NOT IN (SELECT laua_norm FROM mobile_stage)`,
      );
      const unmatched = await client.query(
        `SELECT council, COUNT(*)::int AS n FROM postcode_cache
       WHERE council IS NOT NULL
         AND lower(regexp_replace(trim(council), '\\s+', ' ', 'g'))
             NOT IN (SELECT laua_norm FROM mobile_stage)
       GROUP BY council ORDER BY council`,
      );
      progress?.count({
        label: "file",
        done: updated,
        unit: "answers",
        extra:
          unmatched.rows.length === 0
            ? "all councils matched"
            : unmatchedNote(unmatched.rows.length),
      });
      await client.query("COMMIT");
      if (resume) {
        // The run is complete: staging + checkpoint go together,
        // so nothing is left behind for the next release.
        await resume.clear();
      }
      return { updated, unmatched: unmatched.rows };
    } catch (error) {
      if (resume) await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  } catch (err) {
    progress?.failed({
      stage: "file",
      filed: updated,
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
export async function fetchBinary(
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
      if (res.status === 403) {
        const error = new Error(
          `Ofcom returned HTTP 403 for ${url.split("?")[0]} — this network is blocked by Ofcom's Cloudflare (known; the live pull runs from an unblocked network or via --file)`,
        );
        error.status = 403;
        throw error;
      }
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
  return Buffer.from(await res.arrayBuffer());
}

const LAUA_FILE = /_mobile_coverage_laua_r\d+\.csv$/i;

function readZipEntry(buffer, predicate) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      let found = null;
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (!predicate(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const chunks = [];
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", () => {
            found = { name: entry.fileName, text: Buffer.concat(chunks).toString("utf8") };
            zip.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zip.on("end", () => resolve(found));
      zip.on("error", reject);
    });
  });
}

export function releaseFromLauaName(name) {
  const match = name.match(/(\d{6})_mobile_coverage_laua_r(\d+)\.csv$/i);
  if (!match) throw new Error(`mobile: cannot read a snapshot from "${name}"`);
  const snapshot = `${match[1].slice(0, 4)}-${match[1].slice(4)}`;
  return { snapshot, snapshotLabel: snapshot, revision: `r${match[2]}` };
}

/**
 * @param {{ fileDir?: string | null, progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export async function loadMobileRows({ fileDir = null, progress = null, fetchOpts } = {}) {
  let release;
  let text;
  // BUG-265: one stage line for the release read, one count
  // for the parsed authorities (no total — the release's own
  // authority count is what the parse establishes).
  progress?.stage(
    fileDir
      ? `reading the mobile release from ${fileDir}...`
      : "discovering the Connected Nations release...",
  );
  if (fileDir) {
    release = JSON.parse(await readFile(join(fileDir, "release.json"), "utf8"));
    const names = (await readdir(fileDir)).filter((n) => LAUA_FILE.test(n));
    if (names.length !== 1) {
      throw new Error(`mobile: expected one laua CSV in ${fileDir}, found ${names.length}`);
    }
    text = await readFile(join(fileDir, names[0]), "utf8");
  } else {
    const { mobileZipUrl } = await discoverReleaseZips();
    if (!mobileZipUrl) {
      throw new Error("mobile: no mobile ZIP linked from the publication page");
    }
    const entry = await readZipEntry(await fetchBinary(mobileZipUrl, fetchOpts), (name) =>
      LAUA_FILE.test(name.split("/").pop()),
    );
    if (!entry) throw new Error("mobile: the release ZIP holds no laua file");
    release = releaseFromLauaName(entry.name.split("/").pop());
    text = entry.text;
  }
  const rows = parseLauaCsv(text, release);
  progress?.count({ label: "parse", done: rows.length, unit: "authorities" });
  return { release, rows };
}

async function run() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last checkpointed authority
  // instead of re-staging the whole release; with no
  // checkpoint this is a fresh start.
  const restart = args.includes("--restart");
  const fileAt = args.indexOf("--file");
  const fileDir = fileAt >= 0 ? args[fileAt + 1] : null;
  if (fileAt >= 0 && !fileDir) throw new Error("--file needs a directory");

  // BUG-265: the read phase logs while it works; a read
  // failure names the read as the stage (filing failures
  // carry their own line from fileMobile).
  const progress = createProgressLogger({ name: "load-mobile" });
  let release;
  let rows;
  try {
    ({ release, rows } = await loadMobileRows({ fileDir, progress }));
    structuralChecks(rows, { full: !fileDir });
  } catch (err) {
    progress.failed({ stage: "read", filed: 0, error: err, resume: "re-run (nothing filed)" });
    throw err;
  }
  const base = `load-mobile · Connected Nations ${release.snapshotLabel}${release.revision ? ` (${release.revision})` : ""} · ${rows.length.toLocaleString("en-GB")} authorities`;
  if (verifyOnly) {
    console.log(`${base} — structural checks OK (verify-only, nothing filed)`);
    return;
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    let result;
    try {
      // BUG-368: the edition is the release's snapshot +
      // revision — the checkpoint is only valid for this
      // release.
      result = await fileMobile(client, rows, {
        progress,
        resume: { edition: `${release.snapshotLabel}${release.revision ?? ""}`, restart },
      });
    } finally {
      client.release();
    }
    const unmatchedNote =
      result.unmatched.length > 0
        ? ` — WARNING: ${result.unmatched.length.toLocaleString("en-GB")} councils matched no authority (${result.unmatched
            .slice(0, 5)
            .map((u) => `${u.council} ${u.n.toLocaleString("en-GB")}`)
            .join(", ")}${result.unmatched.length > 5 ? ", …" : ""})`
        : "";
    console.log(
      `${base} — ${result.updated.toLocaleString("en-GB")} answers filed${unmatchedNote}`,
    );
  } finally {
    await pool.end();
  }
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  run().catch((err) => {
    console.error(`load-mobile FAILED: ${err.message}`);
    process.exit(1);
  });
}
