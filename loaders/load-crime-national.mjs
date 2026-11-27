// Crime — England totals loader (plan step M6.20, decision D39).
// The numerator of the crime answer's England calibration
// figure, filed into crime_national_months (migration 0021):
// one row per published month, counted once, ever, from
// Police.uk's own data archive — the same street-level
// dataset the API serves, published at
// https://data.police.uk/data/archive/<yyyy-mm>.zip.
//
// THE ARCHIVE IS CUMULATIVE (found at this step's backfill,
// the hard way): the zip named for a month is the archive
// AS OF that month, holding one folder per month for a
// rolling multi-year window (the 2026-09 archive holds
// 2023-10..2026-09, 4,475 files). Counting a month means
// counting ONLY that month's folder inside the archive —
// counting every street CSV in the zip over-counts by the
// number of months the archive holds (the first backfill
// attempt produced 16,220,417 for "one month": 37 months
// at ~440,000 each). One download of the latest archive
// therefore serves every unfiled month in its window.
//
//   npm run load:crime-national
//   npm run load:crime-national -- --verify-only
//   npm run load:crime-national -- --file tests/fixtures/police-uk-national
//
// How it works:
//   1. Anchor to the LATEST published month (the same
//      availability endpoint and the same 3-month freshness
//      guard as load-crime — one threshold, shared).
//   2. For each month of the 12-month window with no filed
//      row, count it from the latest archive (downloaded
//      once per run): stream that month's folder's street
//      CSVs and count the records whose LSOA code begins
//      E01 (England's 2021 LSOAs — geographically
//      consistent with the denominator, the lsoa_bases E01
//      sum, 56,490,108; British Transport Police records
//      are inside both counts). A month older than the
//      latest archive's window falls back to its own
//      month's archive. The filed rows are the resume
//      state: the first fill is a 12-month backfill, and an
//      interrupted run resumes at the first unfiled month.
//   3. Embed: for every filed crime artefact whose window
//      is now fully counted, write the window figure
//      { total, residents } into the artefact's "national"
//      key (load-crime embeds the same figure at file time;
//      this pass lights up artefacts filed before their
//      window completed). The artefact write moves the
//      artefact's md5, which is the cache guard (D29) —
//      cached bundles bust on the embedding, by design.
//
// The brain never reads crime_national_months: it stays a
// pure artefact read (D24's architecture). This loader is
// the monthly class in the runner's schedule (D19 family),
// after load-crime, so a monthly run files fresh counts,
// counts the new month, and embeds in one pass.

import { createWriteStream } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import pg from "pg";
import yauzl from "yauzl";

import { monthIndex, nationalForWindow, windowMonths } from "./load-crime.mjs";
import { createLoaderResume } from "./loader-resume.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

const DATES_URL = "https://data.police.uk/api/crimes-street-dates";
const ARCHIVE_URL = (month) => `https://data.police.uk/data/archive/${month}.zip`;
export const SOURCE_NAME = "Police.uk street-level crime (monthly archive)";
const MAX_LAG_MONTHS = 3; // shared with load-crime — one threshold, not forked

// ------------------------------------------------------------------
// The counting machinery (exported for its tests)
// ------------------------------------------------------------------

// A minimal streaming CSV reader: yields one array of fields
// per record, honouring quoted fields (doubled quotes, and
// commas or newlines inside quotes). The Police.uk street
// files are plain, but the counter must not depend on that.
export async function* csvRecords(readable) {
  let field = "";
  let record = [];
  let inQuotes = false;
  let fieldQuoted = false;
  let pendingQuote = false;
  const pushField = () => {
    record.push(field);
    field = "";
    fieldQuoted = false;
  };
  const pushRecord = () => {
    pushField();
    const done = record;
    record = [];
    return done;
  };
  for await (const chunk of readable) {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (pendingQuote) {
        pendingQuote = false;
        if (ch === '"') {
          field += '"';
          continue;
        }
        inQuotes = false;
        // fall through: ch is the delimiter after the closing quote
      }
      if (inQuotes) {
        if (ch === '"') pendingQuote = true;
        else field += ch;
        continue;
      }
      if (ch === '"' && field === "" && !fieldQuoted) {
        inQuotes = true;
        fieldQuoted = true;
        continue;
      }
      if (ch === ",") {
        pushField();
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i += 1;
        yield pushRecord();
        continue;
      }
      field += ch;
    }
  }
  if (pendingQuote) inQuotes = false;
  if (field !== "" || record.length > 0) yield pushRecord();
}

// Count one street CSV stream's England records: data rows
// whose "LSOA code" field begins E01. The header names the
// column — the header is the contract, as in load-census:
// a file without the column fails loudly rather than
// counting the wrong field as zero.
export async function countEnglandRecords(readable) {
  let lsoaIndex = -1;
  let count = 0;
  for await (const record of csvRecords(readable)) {
    if (lsoaIndex === -1) {
      lsoaIndex = record.indexOf("LSOA code");
      if (lsoaIndex === -1)
        throw new Error('a Police.uk street file has no "LSOA code" column — refusing to count it');
      continue;
    }
    if (record.length <= lsoaIndex) continue;
    if (record[lsoaIndex].startsWith("E01")) count += 1;
  }
  if (lsoaIndex === -1) throw new Error("a Police.uk street file was empty — refusing to count it");
  return count;
}

// Count ONE MONTH inside an archive: the entries under
// that month's own folder (<yyyy-mm>/<yyyy-mm>-*-street.csv)
// — the archive is cumulative (see the header), so the
// folder is the unit, never the zip. The outcomes files
// describe the same records and are never counted (they
// would double the month). Resolves null when the archive
// holds no folder for the month at all (the month is older
// than the archive's window); rejects when the folder is
// present but holds no street CSVs (a shape change, not an
// absence).
export function countArchiveEnglandTotal(zipPath, month) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      let total = 0;
      let streetFiles = 0;
      let folderSeen = false;
      const prefix = `${month}/`;
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (!entry.fileName.startsWith(prefix) || !/-street\.csv$/.test(entry.fileName)) {
          if (entry.fileName.startsWith(prefix)) folderSeen = true;
          zip.readEntry();
          return;
        }
        folderSeen = true;
        streetFiles += 1;
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          countEnglandRecords(stream)
            .then((n) => {
              total += n;
              zip.readEntry();
            })
            .catch(reject);
        });
      });
      zip.on("end", () => {
        if (!folderSeen) return resolve(null);
        if (streetFiles === 0)
          return reject(
            new Error(
              `${zipPath}: the ${month} folder holds no street CSVs — refusing to count it`,
            ),
          );
        resolve(total);
      });
      zip.on("error", reject);
    });
  });
}

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
// BUG-385: a transient fetch failure is retried for up to 30
// minutes (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
// 2026) — the same retry the flood loaders got in BUG-384.
// Past the budget the original error fails the run and it
// waits. The delay caps at the last schedule entry; a test
// may pass delaysMs: [] for instant retries. Non-transient
// failures throw at once (see isTransientFetchError).
export async function fetchResponse(
  url,
  what,
  { delaysMs = RETRY_DELAYS_MS, onRetry = null, retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS } = {},
) {
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${what}`);
        error.status = response.status;
        throw error;
      }
      return response;
    } catch (error) {
      if (!isTransientFetchError(error)) throw error;
      if (Date.now() - startedAt >= retryBudgetMs) throw error;
      const delay =
        delaysMs.length === 0 ? 0 : delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      onRetry?.(error, attempt, delay, what);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// BUG-385: the retry lives in fetchResponse now — this helper
// keeps its old shape and its old error message. The body
// read sits outside fetchResponse's try, so a malformed body
// fails fast instead of retrying. Note the behaviour change
// the retry brings: the old 2-attempt loop retried every
// HTTP failure once, including a 404; a non-transient
// failure now throws at once, with a single attempt.
export async function fetchJson(
  url,
  { delaysMs = RETRY_DELAYS_MS, onRetry = null, retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS } = {},
) {
  let response;
  try {
    response = await fetchResponse(url, "Police.uk", { delaysMs, onRetry, retryBudgetMs });
  } catch (err) {
    if (typeof err.status === "number")
      throw new Error(`Police.uk request failed: HTTP ${err.status} (${url})`);
    throw err;
  }
  return response.json();
}

// BUG-385: the archive download retries the WHOLE download
// from scratch for up to 30 minutes (TRANSIENT_RETRY_BUDGET_MS)
// — a transient failure at the fetch or mid-stream restarts
// it, and every attempt opens a fresh write stream, so a
// partial file from a cut attempt is truncated, never resumed
// or appended to. The error message is unchanged; a
// non-transient failure throws at once.
export async function downloadArchive(
  month,
  dest,
  { delaysMs = RETRY_DELAYS_MS, onRetry = null, retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS } = {},
) {
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const response = await fetch(ARCHIVE_URL(month));
      if (!response.ok || !response.body) {
        const error = new Error(
          `Police.uk archive download failed: HTTP ${response.status} (${month})`,
        );
        error.status = response.status;
        throw error;
      }
      await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
      return;
    } catch (error) {
      if (!isTransientFetchError(error)) throw error;
      if (Date.now() - startedAt >= retryBudgetMs) throw error;
      const delay =
        delaysMs.length === 0 ? 0 : delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      onRetry?.(error, attempt, delay, `the Police.uk ${month} archive`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// The months an artefact's window spans, from its filed
// windowFrom/windowTo (both "yyyy-mm", 12 months apart).
function artefactMonths(artefact) {
  const from = monthIndex(artefact.windowFrom);
  const to = monthIndex(artefact.windowTo);
  const months = [];
  for (let i = from; i <= to; i += 1) {
    months.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
  }
  return months;
}

// Count the window's unfiled months and embed the window figure
// into the filed crime artefacts — with resume support (BUG-368).
//
// THE RESUME SHAPE. This loader's resume state already existed
// in its live table: a month with a crime_national_months row is
// never recounted, and the embed skips artefacts whose figure is
// already the computed one. What BUG-368 adds is the visible,
// checkpointed form of that state: each counted month is
// witnessed in the PERSISTENT crime_national_stage table
// (migration 0048 — the parent adds the table at merge time;
// this function still creates it, so the loader works on a
// database the migration has not yet reached) and checkpointed
// in loader_checkpoint, one progress line per committed month,
// so a kill names the month the next run resumes from instead
// of re-counting the window blind.
//
// THE WITNESS. The stage table holds only the months THIS run
// counted (month, total, seq) — the live table stays the
// authority for what is filed, and a discard clears the stage
// alone, never the filed months. The checkpoint's edition is
// the window's latest month: a new month publishing rolls the
// window forward and the checkpoint discards, while the filed
// months still skip the recount. expected is null on purpose:
// the window is always 12 months and the edition already keys
// it, and a null expected keeps the failure line's resume note
// naming the checkpoint instead of the swap wording (this
// loader has no swap — a run that died after the count resumes
// at the embed). A kill between the live insert and the
// checkpoint leaves a staged row the next run trims, or a filed
// month the next run skips — either way the month is counted
// exactly once.
/**
 * @param {any} client
 * @param {{ months: string[], latest: string, countMonth: (month: string) => Promise<number>, progress?: import("./progress.mjs").ProgressLogger | null, restart?: boolean, verifyOnly?: boolean }} options
 */
export async function runCountAndEmbed(
  client,
  { months, latest, countMonth, progress = null, restart = false, verifyOnly = false },
) {
  let resume = null;
  /** @type {{ resumed: boolean, reason?: string, checkpoint?: any, prefix?: boolean }} */
  let resumePrep = { resumed: false };
  let staged = 0;
  let seqNext = 0;
  const edition = latest;
  if (client) {
    await client.query(
      `CREATE TABLE IF NOT EXISTS crime_national_stage (
         month text, england_total integer,
         seq bigint NOT NULL, UNIQUE (seq)
       )`,
    );
    resume = createLoaderResume(client, {
      loader: "load-crime-national",
      stageTable: "crime_national_stage",
      progress,
      restart,
    });
    resumePrep = await resume.prepare({ edition, expected: null });
    if (resumePrep.resumed) {
      staged = resumePrep.checkpoint.filed_count;
      seqNext = staged;
    }
  }
  const resumeNote = () =>
    resume
      ? resume.resumeNote()
      : "re-run — filed months are the resume state, unfiled months recount";

  // 2 — count the window's unfiled months. The filed rows
  // are the resume state: a month with a row is never
  // recounted.
  const filed = new Set();
  if (client) {
    const res = await client.query("SELECT month FROM crime_national_months");
    for (const row of res.rows) filed.add(row.month);
  }
  // BUG-265: the 12-month window is the genuine total —
  // the tally carries a real percentage, a line every 3
  // months, a heartbeat every 3 months, and a warning
  // for a month that takes more than 3x the recent
  // average.
  const countTally = progress?.tally({
    label: "count",
    total: months.length,
    every: 3,
    unit: "months",
  });
  const countWatch = createBatchWatch();
  let counted = 0;
  let newlyCounted = 0;
  // True once the embed's own catch has reported the
  // failure, so the outer catch does not mislabel it as a
  // counting failure.
  let embedFailed = false;
  try {
    for (const month of months) {
      if (filed.has(month)) {
        counted += 1;
        countTally?.tick(counted);
        continue;
      }
      const started = Date.now();
      const total = await countMonth(month);
      if (client) {
        await client.query(
          "INSERT INTO crime_national_months (month, england_total, source_name, source_date) VALUES ($1, $2, $3, $4) ON CONFLICT (month) DO NOTHING",
          [month, total, SOURCE_NAME, month],
        );
        // The witness stage + checkpoint: the live insert
        // above is the filing; this row is only the run's
        // record that it counted the month, and the
        // checkpoint is the visible save.
        const seq = seqNext;
        seqNext += 1;
        await client.query(
          "INSERT INTO crime_national_stage (month, england_total, seq) VALUES ($1, $2, $3)",
          [month, total, seq],
        );
        staged += 1;
        filed.add(month);
        newlyCounted += 1;
        const completed = months.filter((m) => filed.has(m)).length;
        await resume.checkpoint({
          edition,
          expected: null,
          nextStartIndex: completed,
          read: completed,
          filed: staged,
          state: { phase: "counting" },
          unit: "months",
        });
      } else {
        filed.add(month);
      }
      counted += 1;
      const { tookMs, averageMs, slow } = countWatch.observe(Date.now() - started);
      countTally?.tick(counted, `${formatCount(total)} England crimes in ${month}`);
      progress?.heartbeat({ stage: "count", done: counted, total: months.length, every: 3 });
      if (slow && tookMs >= 1000) {
        progress.warning({
          what: "month count duration",
          value: `${month} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
    }
    countTally?.finish(counted);

    // 3 — embed the window figure into every filed crime
    // artefact whose window is now fully counted and whose
    // embedding is missing or stale.
    let embedded = 0;
    if (client && !verifyOnly) {
      const res = await client.query(
        "SELECT postcode, answers -> 'crime' AS crime FROM postcode_cache WHERE answers -> 'crime' IS NOT NULL",
      );
      progress?.stage(
        `embedding the window figure into ${formatCount(res.rows.length)} filed crime artefacts`,
      );
      const embedTally = progress?.tally({
        label: "embed",
        total: res.rows.length,
        every: 100,
        unit: "artefacts",
      });
      try {
        for (const [i, row] of res.rows.entries()) {
          const artefact = row.crime;
          if (!artefact?.windowFrom || !artefact?.windowTo) {
            embedTally?.tick(i + 1, `${formatCount(embedded)} embedded`);
            continue;
          }
          const national = await nationalForWindow(client, artefactMonths(artefact));
          if (!national) {
            embedTally?.tick(i + 1, `${formatCount(embedded)} embedded`);
            continue;
          }
          const current = artefact.national;
          if (
            current &&
            current.total === national.total &&
            current.residents === national.residents
          ) {
            embedTally?.tick(i + 1, `${formatCount(embedded)} embedded`);
            continue;
          }
          await client.query(
            "UPDATE postcode_cache SET answers = jsonb_set(answers, '{crime,national}', $1::jsonb) WHERE postcode = $2",
            [JSON.stringify(national), row.postcode],
          );
          embedded += 1;
          embedTally?.tick(i + 1, `${formatCount(embedded)} embedded`);
          progress?.heartbeat({ stage: "embed", done: i + 1, total: res.rows.length, every: 100 });
        }
      } catch (err) {
        embedFailed = true;
        progress?.failed({
          stage: "embed",
          filed: embedded,
          total: res.rows.length,
          error: err,
          resume: resumeNote(),
        });
        throw err;
      }
      embedTally?.finish(res.rows.length, `${formatCount(embedded)} embedded`);
    }

    const windowTotal = client ? ((await nationalForWindow(client, months))?.total ?? null) : null;
    // The run is complete: the witness stage + checkpoint go
    // together, so nothing is left behind for the next window.
    // (A verify-only run keeps its checkpoint: it filed months
    // but skipped the embed, and the next real run resumes at
    // the embed instead of recounting.)
    if (resume && !verifyOnly) await resume.clear();
    return {
      newlyCounted,
      embedded,
      windowTotal,
      filedMonths: months.filter((m) => filed.has(m)).length,
      resumeNote,
      resumePrep,
    };
  } catch (err) {
    // BUG-265: the counting phase fails before the embed —
    // filed months are the resume state, so the resume is
    // a re-run that recounts only the unfiled months. (The
    // embed's own catch above reports its stage first.)
    if (!embedFailed) {
      progress?.failed({
        stage: "count",
        filed: newlyCounted,
        total: months.length,
        error: err,
        resume: resumeNote(),
      });
    }
    throw err;
  }
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileIdx = args.indexOf("--file");
  const fileDir = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const fixture = fileDir
    ? JSON.parse(await readFile(join(fileDir, "fixture.json"), "utf8"))
    : null;

  // 1 — the latest published month, and the freshness guard
  // (load-crime's, shared: the same endpoint, the same lag).
  const dates = fixture ? fixture.dates : await fetchJson(DATES_URL);
  const latest = dates
    .map((d) => d.date)
    .sort()
    .at(-1);
  if (!latest) throw new Error("Police.uk availability list is empty");
  const today = fixture ? fixture.today : new Date().toISOString().slice(0, 10);
  const lag = monthIndex(today.slice(0, 7)) - monthIndex(latest);
  if (lag > MAX_LAG_MONTHS)
    throw new Error(
      `freshness guard: the newest Police.uk month is ${latest}, ${lag} months behind ${today.slice(0, 7)} (expected lag ~2, tolerance ${MAX_LAG_MONTHS}) — treating this as a failed load; the previous data keeps serving`,
    );
  const months = windowMonths(latest);

  const connectionString = process.env.DATABASE_URL;
  let client = null;
  if (!verifyOnly || !fixture) {
    if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example, Key K6)");
    client = new pg.Client({ connectionString });
    await client.connect();
  }

  // BUG-265: one logger for the run — the month-count
  // tally, the archive-download stage, and the embed tally.
  const progress = createProgressLogger({ name: "load-crime-national" });
  progress.stage(
    `counting the ${formatCount(months.length)}-month window from the Police.uk archive`,
  );
  // BUG-368: --restart discards the witness stage +
  // checkpoint and re-derives the resume point from the
  // filed months (the filed months themselves are never
  // recounted — they are filed data, not staging).
  const restart = args.includes("--restart");

  // Live counting downloads the LATEST archive once and
  // counts every unfiled month from its folder inside it
  // (the archive is cumulative — see the header). A month
  // the latest archive's window does not reach falls back
  // to its own month's archive. Fixture mode reads the
  // pinned counts.
  let latestZipPath = null;
  const countMonth = async (month) => {
    if (fixture) {
      const total = fixture.months[month];
      if (typeof total !== "number")
        throw new Error(
          `${month}: no count in the fixture (fixture covers ${Object.keys(fixture.months).join(", ")})`,
        );
      return total;
    }
    if (!latestZipPath) {
      progress.stage(`downloading the ${latest} archive`);
      latestZipPath = join(tmpdir(), `cmnh-archive-${latest}.zip`);
      await downloadArchive(latest, latestZipPath);
    }
    let total = await countArchiveEnglandTotal(latestZipPath, month);
    if (total === null) {
      const ownZipPath = join(tmpdir(), `cmnh-archive-${month}.zip`);
      try {
        await downloadArchive(month, ownZipPath);
        total = await countArchiveEnglandTotal(ownZipPath, month);
      } finally {
        await rm(ownZipPath, { force: true });
      }
      if (total === null)
        throw new Error(
          `${month}: no folder for the month in its own archive — refusing to count it`,
        );
    }
    return total;
  };

  // BUG-248: set the moment the count-and-embed run starts —
  // the catch below reports only the failures the run itself
  // never reached, so a run's own failed line is never doubled.
  let runStarted = false;
  try {
    runStarted = true;
    let result;
    try {
      result = await runCountAndEmbed(client, {
        months,
        latest,
        countMonth,
        progress,
        restart,
        verifyOnly,
      });
    } finally {
      if (latestZipPath) await rm(latestZipPath, { force: true });
    }
    const { newlyCounted, embedded, windowTotal, filedMonths } = result;
    console.log(
      `load-crime-national · latest month ${latest} · window ${months[0]}..${latest} · England 12-month total ${windowTotal === null ? "not yet countable" : formatCount(windowTotal)} · ${formatCount(filedMonths)} of ${formatCount(months.length)} months on file (${formatCount(newlyCounted)} new) · ${formatCount(embedded)} artefacts embedded${verifyOnly ? " · verify only, nothing filed" : ""} · ${Math.round((Date.now() - startedAt) / 1000)}s`,
    );
  } catch (err) {
    // A failure the run itself already reported (its own
    // failed line, at the stage it failed in) is not
    // reported again here — this line covers only the
    // failures before the run started.
    if (!runStarted) {
      progress.failed({
        stage: "count",
        filed: 0,
        total: months.length,
        error: err,
        resume: "re-run — filed months are the resume state, unfiled months recount",
      });
    }
    throw err;
  } finally {
    if (client) await client.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(`load-crime-national FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
