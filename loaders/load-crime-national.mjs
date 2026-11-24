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
import { formatCount } from "./progress.mjs";

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

async function fetchJson(url) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) return response.json();
    if (attempt === 2)
      throw new Error(`Police.uk request failed: HTTP ${response.status} (${url})`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("unreachable");
}

async function downloadArchive(month, dest) {
  const response = await fetch(ARCHIVE_URL(month));
  if (!response.ok || !response.body)
    throw new Error(`Police.uk archive download failed: HTTP ${response.status} (${month})`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
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

  try {
    // 2 — count the window's unfiled months. The filed rows
    // are the resume state: a month with a row is never
    // recounted.
    const filed = new Set();
    if (client) {
      const res = await client.query("SELECT month FROM crime_national_months");
      for (const row of res.rows) filed.add(row.month);
    }
    let newlyCounted = 0;
    // Live counting downloads the LATEST archive once and
    // counts every unfiled month from its folder inside it
    // (the archive is cumulative — see the header). A month
    // the latest archive's window does not reach falls back
    // to its own month's archive.
    let latestZipPath = null;
    try {
      for (const month of months) {
        if (filed.has(month)) continue;
        let total;
        if (fixture) {
          total = fixture.months[month];
          if (typeof total !== "number")
            throw new Error(
              `${month}: no count in the fixture (fixture covers ${Object.keys(fixture.months).join(", ")})`,
            );
        } else {
          if (!latestZipPath) {
            latestZipPath = join(tmpdir(), `cmnh-archive-${latest}.zip`);
            await downloadArchive(latest, latestZipPath);
          }
          total = await countArchiveEnglandTotal(latestZipPath, month);
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
        }
        if (client) {
          await client.query(
            "INSERT INTO crime_national_months (month, england_total, source_name, source_date) VALUES ($1, $2, $3, $4) ON CONFLICT (month) DO NOTHING",
            [month, total, SOURCE_NAME, month],
          );
        }
        filed.add(month);
        newlyCounted += 1;
      }
    } finally {
      if (latestZipPath) await rm(latestZipPath, { force: true });
    }

    // 3 — embed the window figure into every filed crime
    // artefact whose window is now fully counted and whose
    // embedding is missing or stale.
    let embedded = 0;
    if (client && !verifyOnly) {
      const res = await client.query(
        "SELECT postcode, answers -> 'crime' AS crime FROM postcode_cache WHERE answers -> 'crime' IS NOT NULL",
      );
      for (const row of res.rows) {
        const artefact = row.crime;
        if (!artefact?.windowFrom || !artefact?.windowTo) continue;
        const national = await nationalForWindow(client, artefactMonths(artefact));
        if (!national) continue;
        const current = artefact.national;
        if (current && current.total === national.total && current.residents === national.residents)
          continue;
        await client.query(
          "UPDATE postcode_cache SET answers = jsonb_set(answers, '{crime,national}', $1::jsonb) WHERE postcode = $2",
          [JSON.stringify(national), row.postcode],
        );
        embedded += 1;
      }
    }

    const windowTotal = client ? ((await nationalForWindow(client, months))?.total ?? null) : null;
    console.log(
      `load-crime-national · latest month ${latest} · window ${months[0]}..${latest} · England 12-month total ${windowTotal === null ? "not yet countable" : formatCount(windowTotal)} · ${formatCount(months.filter((m) => filed.has(m)).length)} of ${formatCount(months.length)} months on file (${formatCount(newlyCounted)} new) · ${formatCount(embedded)} artefacts embedded${verifyOnly ? " · verify only, nothing filed" : ""} · ${Math.round((Date.now() - startedAt) / 1000)}s`,
    );
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
