// Sold-prices loader (plan step M4.2; Technical Plan job
// load-land-registry). HM Land Registry Price Paid data, loaded ON
// DEMAND per postcode — never bulk-filed for the whole country.
//
//   npm run load:sold-prices -- "CM3 2JT" "E16 1GN"
//   npm run load:sold-prices -- --verify-only "CM3 2JT"
//   npm run load:sold-prices -- --file tests/fixtures/land-registry "CM3 2JT" "E16 1GN"
//
// Pattern (Technical Plan Section 4D — load, stamp, then swap): the
// full file is streamed and filtered to the requested postcodes, the
// monthly update file is merged over it by transaction id (an update
// row marked A or C replaces the full-file row with the same id; a
// row marked D deletes it), sanity checks run, and only then is each
// postcode's filed set swapped inside ONE transaction — a failed
// load files nothing and the previous data keeps serving.
//
// The plan's Check for M4.2, as data (the golden homes):
//   - 19 Birkdale Rise's latest (and only) recorded sale is
//     £588,995 on 15 Jun 2023.
//   - The street median of £610,875 is the median of the eight sales
//     the approved Birkdale report lists as "every sale counted"
//     (Nos. 8, 11, 15, 16, 19, 23, 26, 28 Birkdale Rise) — encoded
//     below by transaction id. The loader files ALL recorded street
//     sales; the proof checks the median over the report's eight.
//   - The E16 1GN postcode median is £310,000 over all 9 sales.
// The proof reads the filed rows back from price_paid before commit.
// Any failure exits non-zero and files nothing.
//
// THE NATIONAL MODE AND THE MONTHLY UPDATE (Price Paid national
// step, adopted prep 23 Nov 2026 — PRICE-PAID-NATIONAL-PREP.md):
//
//   npm run load:sold-prices-national
//   npm run load:sold-prices-national -- --file tests/fixtures/land-registry
//   npm run load:sold-prices-update
//   npm run load:sold-prices-update -- --file <dir> --edition YYYY-MM-DD
//
// --national files the WHOLE register in one pass: the full file is
// streamed once into a session staging table in batches (no
// postcode filter — every line is parsed), rows for Scotland/NI
// postcode areas are skipped and counted per area at intake
// (BUG-184: the source legitimately publishes TD15 — Berwick —
// sales, so an uncovered row is data to skip, never a reason to
// refuse the run), duplicate transaction ids collapse to the
// last row filed, the current monthly update file is merged over
// the staging table by transaction id (the legacy merge,
// unfiltered), the golden proof and a zero-uncovered-row
// self-check run against staging, and only then is the live
// register swapped inside one transaction (truncate +
// insert-select + the golden proof read back from the live table).
// A failed pass files nothing: staging is a TEMP table, so it dies
// with the session and the previous register keeps serving. After
// the swap, every directory postcode in a covered nation that
// filed no rows is bulk-stamped with the load (gap 2 of the prep)
// — without the stamp its first check would pay for a phantom
// full-file load just to learn it has no sales.
//
// BUG-188 (found 23 Nov 2026): the first national pass filed
// 30,668,847 rows where the source (edition 2026-10-28) holds
// 31,642,211 filable records — 973,364 sales never reached the
// register, among them all three of TR8 4LX's 1995 sales, the
// only loss the golden set could see. A full reconciliation of
// the source through this loader's own parser proved the loss
// was not in any deterministic code path: the file holds zero
// duplicate transaction ids (the staging dedupe deletes
// nothing), none of the lost ids appears in the monthly update
// file (the merge is net-zero: its 96,272 upserts replace
// exactly 96,272 staged rows), and the three sales file cleanly
// through the staging/swap path in every reproduction. The pass
// under-consumed its source — a short stream or a truncated
// copy — and nothing in the loader could tell: it counted no
// lines, no bytes, and never reconciled what it staged against
// what it parsed. The pass now reconciles at every step and
// refuses rather than file a register it cannot account for:
// the bytes the line source delivers must match the size the
// source declared (the Content-Length live, the file's size
// under --file), the staged count must equal the parsed count
// after intake, after the dedupe and after the update merge,
// and the swap must land exactly the staged total inside its
// transaction. The monthly update path reads its file whole
// into memory before runUpdate ever sees it (a short body makes
// the read itself fail), so the under-delivery mechanism cannot
// occur there; its records are counted by parseAllRecords as
// before.
//
// BUG-201 (24 Nov 2026): the first repair re-fire of that pass
// died on the play server's disk — "No space left on device"
// some 74 minutes in, ~6 GB into the swap's insert, with ~25 GB
// consumed. The staging had been shaped for correctness, not
// for the box: the edition stamp rewrote all 31.6M staged rows
// (a dead-tuple doubling of the heap), two staging indexes rode
// along (~2 GB plus their sort spill), and the ~50-character
// source name was stored on every staged row — while at the
// peak the staging, the old register and the new one all had
// to coexist. The staging is now slim by construction: it
// stores neither the source name nor the edition (each is one
// constant per pass; the swap's insert-select writes both as
// parameters), it is never rewritten after intake, and it
// carries no indexes — the proofs and the merge read it by
// sequential scan, and transaction-id uniqueness is enforced
// where it ultimately lives, by the live table's own unique
// index (migration 0003) inside the swap transaction, on top
// of the dedupe and the count reconciliations. Peak staging is
// the bare heap (~6 GB at the 2026-10 register's size) instead
// of ~17 GB, and the pass's whole peak fits the box's ~25 GB
// of steady-state free space with room to spare.
//
// --update applies ONE monthly update file to the live register:
// A/C rows upsert by transaction id, D rows delete by id (a
// category change arrives as a D for the old id plus an A under a
// new one, and lands as exactly one row in the new category). The
// mode is edition-gated against the last edition its own run
// stamps recorded: an already-applied edition is a no-op success,
// an older one is refused, and an edition more than one monthly
// cycle past the last applied one is refused with the gap named —
// each monthly file covers only its own month, so a missed month
// is a permanent hole no later file fills; the remedy is a fresh
// --national pass. Both modes stamp their outcome (success AND
// failure) into loader_runs / loader_run_items in the runner's
// shape (gap 4): the district cache's version vector reads the
// load-sold-prices last-success stamp, so a price-only correction
// month (counts unmoved) still invalidates on the stamp. The
// stamp write itself never fails the load — a stamp that cannot
// be written is a stderr warning, per migration 0006's rule.
//
// The new modes parse their arguments BY NAME (gap 3): the legacy
// path's filter drops the slot its --file value occupies (and
// slot 0 when no --file is present), which is survivable only
// because its callers pass postcodes after a "--" separator. The
// new modes take no postcodes at all, and a flag in slot 0 is
// honoured exactly like a flag anywhere else.

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";
import { createLoaderResume, writeCheckpoint } from "./loader-resume.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import pg from "pg";

const FULL_FILE_URL =
  "http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-complete.csv";
const UPDATE_FILE_URL =
  "http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-monthly-update-new-version.csv";
const SOURCE_NAME = "HM Land Registry Price Paid (full file + monthly update)";

// The eight transactions the approved Birkdale report counts for its
// street median (Section 2, "Every sale counted"), by Registry id.
const BIRKDALE_COUNTED_IDS = new Set([
  "0B85394F-89B0-69A5-E063-4704A8C07DAC", // 19 Birkdale Rise, 15 Jun 2023
  "09266DDB-77A0-AF90-E063-4704A8C02087", // 23 Birkdale Rise, 30 Jun 2023
  "2131FCF5-A5B1-86E8-E063-4804A8C0372B", // 15 Birkdale Rise, 4 Dec 2023
  "1A0C5C63-013E-7CBE-E063-4804A8C06C96", // 11 Birkdale Rise, 8 Dec 2023
  "237B17FD-9136-22AC-E063-4804A8C0EA3A", // 28 Birkdale Rise, 9 Feb 2024
  "237B17FD-9142-22AC-E063-4804A8C0EA3A", // 26 Birkdale Rise, 9 Feb 2024
  "5834E4E8-AD5B-29C7-E063-4804A8C015BC", // 8 Birkdale Rise, 17 Jul 2026
  "5834E4E8-59A3-29C7-E063-4804A8C015BC", // 16 Birkdale Rise, 20 Jul 2026
]);

// Quote-aware parser for one Price Paid line (every field is quoted;
// a doubled quote inside a field is an escaped quote).
export function parsePpdLine(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '"') return null;
    let value = "";
    i += 1;
    while (i < line.length) {
      if (line[i] === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i += 2;
        } else {
          i += 1;
          break;
        }
      } else {
        value += line[i];
        i += 1;
      }
    }
    fields.push(value);
    if (line[i] === ",") i += 1;
  }
  return fields;
}

// Price Paid column order: transaction id, price, date, postcode,
// type, new build, duration, PAON, SAON, street, locality, town,
// district, county, category, record status.
export function toRecord(fields) {
  if (!fields || fields.length !== 16) return null;
  const price = Number.parseInt(fields[1], 10);
  if (!Number.isInteger(price) || price <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(fields[2])) return null;
  return {
    transactionId: fields[0].replace(/[{}]/g, ""),
    price,
    saleDate: fields[2].slice(0, 10),
    postcode: fields[3],
    propertyType: fields[4] || null,
    newBuild: fields[5] === "Y" ? true : fields[5] === "N" ? false : null,
    tenure: fields[6] || null,
    paon: fields[7] || null,
    saon: fields[8] || null,
    street: fields[9] || null,
    locality: fields[10] || null,
    town: fields[11] || null,
    county: fields[13] || null,
    ppdCategory: fields[14] || null,
    recordStatus: fields[15] || null,
  };
}

export function median(prices) {
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// The golden-home assertions, run against a row source (the parsed
// records, or rows read back from the database).
export function checkGolden(rowsFor, label) {
  const problems = [];
  const cm = rowsFor("CM3 2JT");
  if (cm) {
    const home = cm.filter((r) => r.paon === "19" && r.street === "BIRKDALE RISE");
    if (home.length !== 1) {
      problems.push(`CM3 2JT: expected exactly 1 sale for 19 Birkdale Rise, found ${home.length}`);
    } else if (home[0].price !== 588995 || home[0].saleDate !== "2023-06-15") {
      problems.push(
        `CM3 2JT: 19 Birkdale Rise sale is £${home[0].price} on ${home[0].saleDate}, expected £588995 on 2023-06-15`,
      );
    }
    const counted = cm.filter((r) => BIRKDALE_COUNTED_IDS.has(r.transactionId));
    if (counted.length !== 8) {
      problems.push(
        `CM3 2JT: expected the report's 8 counted street sales, found ${counted.length}`,
      );
    } else if (median(counted.map((r) => r.price)) !== 610875) {
      problems.push(
        `CM3 2JT: street median over the report's eight is £${median(counted.map((r) => r.price))}, expected £610875`,
      );
    }
  }
  const e16 = rowsFor("E16 1GN");
  if (e16) {
    if (e16.length !== 9) problems.push(`E16 1GN: expected 9 sales, found ${e16.length}`);
    else if (median(e16.map((r) => r.price)) !== 310000)
      problems.push(
        `E16 1GN: postcode median is £${median(e16.map((r) => r.price))}, expected £310000`,
      );
  }
  if (problems.length > 0)
    throw new Error(`the golden-home proof failed (${label}) — ${problems.join("; ")}`);
}

async function collectFromLines(lines, targets, stats) {
  const targetList = [...targets];
  const byGuid = new Map();
  for await (const line of lines) {
    if (!line) continue;
    // Cheap pre-filter: only lines naming a target postcode get parsed.
    if (!targetList.some((pc) => line.includes(`"${pc}"`))) continue;
    const record = toRecord(parsePpdLine(line));
    if (!record) {
      stats.malformed += 1;
      continue;
    }
    if (!targets.has(record.postcode)) continue;
    if (byGuid.has(record.transactionId)) stats.duplicates += 1;
    byGuid.set(record.transactionId, record);
  }
  return byGuid;
}

// ------------------------------------------------------------------
// The national mode and the monthly update (adopted prep, gaps 1–7)
// ------------------------------------------------------------------

// The price_paid column list every filing path writes, in order —
// the loader's legacy INSERT list, spelled out literally in the
// SQL (the loader-contracts guard reads the lists from the source
// text). loaded_at is the database's own (DEFAULT now()), never
// the loader's.
const PRICE_PAID_COLUMN_LIST =
  "transaction_id, postcode, price, sale_date, property_type, new_build, tenure, paon, saon, street, locality, town, county, ppd_category, record_status, source_name, source_date";
const PRICE_PAID_COLUMNS = PRICE_PAID_COLUMN_LIST.split(", ");

const STAGE_TABLE = "price_paid_stage";
const INSERT_BATCH_ROWS = 1000;
const GUID_CHUNK = 5000;
const STAMP_PAGE_ROWS = 5000;

// Postcode areas the register does not cover: Scotland's areas
// plus BT (Northern Ireland) — lib/sold-prices.ts's coverage rule,
// restated for the standalone loader. The brain's gate is the
// serving authority; this copy drives the new modes' intake skip
// (BUG-184 — skip-and-count, never refuse), the staging
// self-check, and the no-sale stamping.
const UNCOVERED_AREAS = new Set([
  "AB",
  "DD",
  "DG",
  "EH",
  "FK",
  "G",
  "HS",
  "IV",
  "KA",
  "KY",
  "ML",
  "PA",
  "PH",
  "TD",
  "ZE",
  "BT",
]);

export function postcodeArea(postcode) {
  const outward = postcode.split(" ")[0] ?? "";
  return /^[A-Z]+/.exec(outward)?.[0] ?? "";
}

export function isCoveredPostcode(postcode) {
  return !UNCOVERED_AREAS.has(postcodeArea(postcode));
}

// BUG-184's intake skip, shared by the national pass and the
// monthly update: a record for an uncovered area is never filed;
// it is counted per area in stats.uncovered, so the run's summary
// — and its stamp, which carries the summary — reconciles exactly
// what was left out. Returns true when the record was skipped.
function skipUncoveredRecord(record, stats) {
  const area = postcodeArea(record.postcode);
  if (!UNCOVERED_AREAS.has(area)) return false;
  stats.uncovered ??= {};
  stats.uncovered[area] = (stats.uncovered[area] ?? 0) + 1;
  return true;
}

// The summary segment for the intake skip: the total plus the
// per-area counts, areas in alphabetical order.
function uncoveredSkipSegment(stats) {
  const entries = Object.entries(stats.uncovered ?? {}).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const total = entries.reduce((n, [, count]) => n + count, 0);
  if (total === 0) return "0 uncovered-area rows skipped";
  return `${formatCount(total)} uncovered-area rows skipped (${entries
    .map(([area, count]) => `${area} ${formatCount(count)}`)
    .join(" · ")})`;
}

// Named-flag parsing for the new modes (gap 3). Every flag is
// found by name wherever it stands — slot 0 included — and a
// value flag consumes exactly the next slot. The legacy path
// keeps its own filter, untouched, below.
export function parseModeArgs(args) {
  let mode = null;
  let fileDir = null;
  let edition = null;
  let verifyOnly = false;
  let restart = false;
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--national" || arg === "--update") {
      const named = arg === "--national" ? "national" : "update";
      if (mode !== null && mode !== named)
        throw new Error("--national and --update are different modes — name exactly one");
      mode = named;
    } else if (arg === "--file") {
      fileDir = args[i + 1] ?? null;
      if (!fileDir)
        throw new Error("--file needs a directory, e.g. --file tests/fixtures/land-registry");
      i += 1;
    } else if (arg === "--edition") {
      edition = args[i + 1] ?? null;
      if (!edition || !/^\d{4}-\d{2}-\d{2}$/.test(edition))
        throw new Error("--edition needs a date shaped YYYY-MM-DD (the file's publication date)");
      i += 1;
    } else if (arg === "--verify-only") {
      verifyOnly = true;
    } else if (arg === "--restart") {
      // BUG-368: discard any checkpoint + staging and file the
      // national pass from the start.
      restart = true;
    } else if (arg === "--") {
      rest.push(...args.slice(i + 1));
      break;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag ${arg} for the --national/--update modes`);
    } else {
      rest.push(arg);
    }
  }
  return { mode, fileDir, edition, verifyOnly, rest, restart };
}

function recordValues(record, sourceDate, sourceName = SOURCE_NAME) {
  return [
    record.transactionId,
    record.postcode,
    record.price,
    record.saleDate,
    record.propertyType,
    record.newBuild,
    record.tenure,
    record.paon,
    record.saon,
    record.street,
    record.locality,
    record.town,
    record.county,
    record.ppdCategory,
    record.recordStatus,
    sourceName,
    sourceDate,
  ];
}

// One multi-row INSERT of parsed records into a table holding the
// PRICE_PAID_COLUMNS shape (the live register or the staging
// table). Batches are the caller's; 1,000 rows × 17 params stays
// well under the wire protocol's parameter ceiling. sourceName
// defaults to the register's standing source name; the national
// pass stages with null — the staging stores no per-row copy of
// a pass-wide constant (BUG-201), and the swap writes the real
// one as it files the rows. seqBase, when given, prepends the
// staging seq (BUG-368, the legacy pass's takeSeq-assigned
// ordinal — the national pass's identity column needs none).
async function insertRecords(
  client,
  table,
  records,
  sourceDate,
  sourceName = SOURCE_NAME,
  seqBase = null,
) {
  if (records.length === 0) return;
  const width = PRICE_PAID_COLUMNS.length + (seqBase === null ? 0 : 1);
  const tuples = [];
  const params = [];
  records.forEach((record, row) => {
    const values = seqBase === null ? [] : [seqBase + row];
    values.push(...recordValues(record, sourceDate, sourceName));
    tuples.push(`(${values.map((_, col) => `$${row * width + col + 1}`).join(",")})`);
    params.push(...values);
  });
  const columns =
    seqBase === null
      ? `(transaction_id, postcode, price, sale_date, property_type, new_build,
        tenure, paon, saon, street, locality, town, county, ppd_category,
        record_status, source_name, source_date)`
      : `(seq, transaction_id, postcode, price, sale_date, property_type, new_build,
        tenure, paon, saon, street, locality, town, county, ppd_category,
        record_status, source_name, source_date)`;
  await client.query(`INSERT INTO ${table} ${columns} VALUES ${tuples.join(", ")}`, params);
}

async function deleteByGuids(client, table, guids) {
  for (let at = 0; at < guids.length; at += GUID_CHUNK) {
    await client.query(`DELETE FROM ${table} WHERE transaction_id = ANY($1)`, [
      guids.slice(at, at + GUID_CHUNK),
    ]);
  }
}

// The update merge over a table (the legacy loader's rule,
// unfiltered): an update row marked D deletes its transaction id;
// any other row replaces it. Deletes run first, in chunks, so the
// inserts that follow can never meet the row they replace — the
// in-memory Map's delete-then-set, in SQL. A category change is
// the source's own pair (D of the old id, A under a new id) and
// lands as exactly one row in the new category. seqBase, when
// given, carries the staging seq for the upserts (BUG-379):
// the legacy stage's seq is NOT NULL with no default, so its
// merge must supply one; the national stage's seq is an
// identity column and the live register has no seq column, so
// those callers pass none. Batches advance the base, so the
// seqs stay contiguous across them.
async function mergeUpdateRecords(
  client,
  table,
  records,
  sourceDate,
  sourceName = SOURCE_NAME,
  seqBase = null,
) {
  const upserts = records.filter((r) => r.recordStatus !== "D");
  const guids = [...new Set(records.map((r) => r.transactionId))];
  await deleteByGuids(client, table, guids);
  for (let at = 0; at < upserts.length; at += INSERT_BATCH_ROWS) {
    await insertRecords(
      client,
      table,
      upserts.slice(at, at + INSERT_BATCH_ROWS),
      sourceDate,
      sourceName,
      seqBase === null ? null : seqBase + at,
    );
  }
  return {
    upserted: upserts.length,
    deleted: records.length - upserts.length,
  };
}

// Every valid record in a set of Price Paid lines, parsed whole —
// the new modes' reader. No postcode pre-filter (the national
// pass files everything covered; the update merge keys on ids
// alone). Rows with an empty postcode are skipped and counted
// (gap 7): filed, they would sit under an empty key no check can
// serve. Rows for uncovered (Scotland/NI) areas are skipped and
// counted per area (BUG-184): the register never files them.
export function parseAllRecords(lines, stats) {
  const records = [];
  for (const line of lines) {
    if (!line) continue;
    const record = toRecord(parsePpdLine(line));
    if (!record) {
      stats.malformed += 1;
      continue;
    }
    if (record.postcode.trim() === "") {
      stats.emptyPostcode += 1;
      continue;
    }
    if (skipUncoveredRecord(record, stats)) continue;
    records.push(record);
  }
  return records;
}

// The golden proof's database read: the filed rows for one
// postcode from a named table, in the shape checkGolden reads
// (the legacy loader's read-back, table-parameterised).
async function filedRowsFor(client, table, postcode) {
  const res = await client.query(
    `SELECT transaction_id AS "transactionId", price, sale_date AS "saleDate",
            paon, street
       FROM ${table} WHERE postcode = $1`,
    [postcode],
  );
  return res.rows.map((r) => ({
    ...r,
    saleDate: r.saleDate instanceof Date ? r.saleDate.toISOString().slice(0, 10) : r.saleDate,
  }));
}

// The run stamp (gap 4): one loader_runs row and one
// loader_run_items row in the runner's own shape, written by the
// update/national modes themselves because the monthly job runs
// standalone under cron, not under the runner. NEVER throws —
// migration 0006's rule is that no load fails because logging
// failed; a stamp that cannot be written is a stderr warning and
// the load's own outcome stands.
export async function writeRunStamp(
  client,
  { mode, status, startedAt, sourceDate, logLine, errorMessage },
) {
  try {
    const runId = randomUUID();
    const finishedAt = new Date();
    await client.query(
      `INSERT INTO loader_runs (id, kind, environment, trigger_source, status, started_at, finished_at, summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        runId,
        "load",
        process.env.RUNNER_ENV ?? "local",
        `sold-prices-${mode}`,
        status,
        startedAt,
        finishedAt,
        logLine ?? errorMessage ?? null,
      ],
    );
    await client.query(
      `INSERT INTO loader_run_items (run_id, item, mode, status, started_at, finished_at, duration_ms, source_name, source_date, log_line, error_message, exit_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        runId,
        "load-sold-prices",
        mode,
        status,
        startedAt,
        finishedAt,
        finishedAt.getTime() - startedAt.getTime(),
        SOURCE_NAME,
        sourceDate,
        logLine,
        errorMessage,
        status === "succeeded" ? 0 : 1,
      ],
    );
    return true;
  } catch (error) {
    console.error(
      `load-sold-prices WARNING: the run stamp could not be written (${error.message}) — the load's own outcome stands`,
    );
    return false;
  }
}

// The last edition the new modes' own stamps record as applied —
// the gap check's baseline (gap 5). Only these stamps carry a
// source_date; the runner's rows for this loader leave it null,
// so they can neither pose as an applied edition nor hide one.
export async function lastAppliedEdition(client) {
  const res = await client.query(
    `SELECT max(source_date)::text AS edition FROM loader_run_items
      WHERE item = 'load-sold-prices' AND status = 'succeeded' AND source_date IS NOT NULL`,
  );
  return res.rows[0]?.edition ?? null;
}

// Editions are publication dates, roughly a month apart (the
// Registry publishes on the 20th working day). Consecutive
// editions stand 26–37 days apart in practice; a missed month
// makes the jump 56 days or more. 45 days separates the two with
// margin on both sides.
export const MAX_EDITION_GAP_DAYS = 45;

// The update mode's edition gate (gap 5), as a pure decision:
// apply, stand down as already applied, or refuse — an older
// file (which would wind the register back) or a gap (a missed
// month no later file heals; the remedy is a --national pass).
export function decideUpdateAction(baseline, edition) {
  if (!baseline) return { action: "apply", reason: "no earlier edition is recorded" };
  if (edition === baseline)
    return { action: "noop", reason: `edition ${edition} is already applied` };
  if (edition < baseline)
    return {
      action: "refuse",
      reason: `the update file's edition ${edition} is older than the last applied edition ${baseline} — refusing to wind the register back`,
    };
  const days = Math.round((Date.parse(edition) - Date.parse(baseline)) / 86400000);
  if (days > MAX_EDITION_GAP_DAYS)
    return {
      action: "refuse",
      reason: `the update file's edition ${edition} is ${days} days after the last applied edition ${baseline} — more than one monthly cycle, so a month has been missed and this file cannot heal it; the register is NOT updated (run the --national pass to file the complete register)`,
    };
  return { action: "apply", reason: `edition ${baseline} → ${edition}` };
}

// Gap 2's bulk stamp: every directory postcode in a covered
// nation that filed no rows gets the load's stamp in its cached
// answers — the same {edition, loadedAt} shape the brain's own
// load path writes — so its first check answers "loaded, none
// recorded" instead of spawning a phantom full-file load. Paged
// by postcode so no statement is unbounded; each page's UPDATE
// is its own commit.
export async function stampNoSalePostcodes(client, edition, { progress = null } = {}) {
  const stamp = JSON.stringify({ edition, loadedAt: new Date().toISOString() });
  let stamped = 0;
  let last = "";
  // BUG-204: the stamp walks every directory postcode that
  // filed nothing — a line every 25,000 stamped, so the
  // tail of the pass is visible too.
  const stampTally = progress?.tally({
    label: "stamping",
    every: 25000,
    unit: "no-sale postcodes",
  });
  // BUG-248: the stamp's pages get a slow-page warning and a
  // heartbeat (every 10 pages or 15 minutes) — the tail of
  // the pass is the part that used to run silent.
  const stampWatch = createBatchWatch();
  let pages = 0;
  for (;;) {
    const started = Date.now();
    const res = await client.query(
      `SELECT postcode FROM postcode_cache
        WHERE postcode > $1
          AND NOT EXISTS (
            SELECT 1 FROM price_paid WHERE price_paid.postcode = postcode_cache.postcode
          )
        ORDER BY postcode LIMIT $2`,
      [last, STAMP_PAGE_ROWS],
    );
    if (res.rows.length === 0) break;
    last = res.rows[res.rows.length - 1].postcode;
    const covered = res.rows.map((r) => r.postcode).filter(isCoveredPostcode);
    if (covered.length > 0) {
      await client.query(
        `UPDATE postcode_cache
            SET answers = jsonb_set(answers, '{soldPricesLoad}', $1::jsonb, true),
                updated_at = now()
          WHERE postcode = ANY($2)`,
        [stamp, covered],
      );
      stamped += covered.length;
      stampTally?.tick(stamped);
    }
    pages += 1;
    const { tookMs, averageMs, slow } = stampWatch.observe(Date.now() - started);
    progress?.heartbeat({ stage: "stamping", done: pages, every: 10 });
    if (slow) {
      progress?.warning({
        what: "stamp page duration",
        value: `page ${pages} took ${formatDuration(tookMs)}`,
        threshold: `3x recent average ${formatDuration(averageMs)}`,
      });
    }
    if (res.rows.length < STAMP_PAGE_ROWS) break;
  }
  stampTally?.finish(stamped);
  return stamped;
}

// --national: one streaming pass over the full file into the
// staging table, the update merge over it, proofs against
// staging, then the swap. Returns the summary facts; the caller
// stamps and prints. fullLines/updateLines are iterables of raw
// file lines (arrays in tests; a readline stream live and under
// --file alike, since BUG-200); edition is the full file's
// publication date, or null to
// fall back to the newest sale date filed (the legacy loader's
// --file fallback). expectedFullBytes, when the caller knows it,
// is the full file's size in bytes as its source declared it
// (the download's Content-Length, or the file's size under
// --file): the pass reconciles the lines it actually consumed
// against that size and refuses an under-delivered source
// before anything is filed (BUG-188).
/**
 * @param {any} client
 * @param {{ fullLines: AsyncIterable<string> | Iterable<string>, updateLines: Iterable<string>, edition: string | null, verifyOnly?: boolean, expectedFullBytes?: number | null, progress?: any, restart?: boolean, resumeEdition?: string | null }} options
 */
export async function runNational(
  client,
  {
    fullLines,
    updateLines,
    edition,
    verifyOnly = false,
    expectedFullBytes = null,
    progress = null,
    restart = false,
    resumeEdition = null,
  },
) {
  const startedAt = Date.now();
  const stats = { malformed: 0, emptyPostcode: 0, duplicates: 0, uncovered: {} };
  // The staging carries the register's column shape (one insert
  // shape serves both tables) but stores neither the source
  // name nor the edition in its rows — both stay null here and
  // the swap writes the pass's constants as it files (BUG-201).
  // BUG-368: the staging is a PERSISTENT table now (migration
  // 0048), and the pass resumes from a loader_checkpoint row
  // instead of restarting. The identity seq is the staged
  // ordinal (1-based: seqBase 1 in the resume handle), so the
  // dedupe's "greatest seq survives" rule and the resume
  // prefix proof both read it the same way.
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${STAGE_TABLE} (
       seq bigint GENERATED ALWAYS AS IDENTITY,
       transaction_id text,
       postcode text,
       price integer,
       sale_date date,
       property_type text,
       new_build boolean,
       tenure text,
       paon text,
       saon text,
       street text,
       locality text,
       town text,
       county text,
       ppd_category text,
       record_status text,
       source_name text,
       source_date date
     )`,
  );
  // The resume handle, when the caller keyed this pass with an
  // edition: without one there is nothing to match a checkpoint
  // against, so the pass runs unresumed, exactly as before.
  let resume = null;
  /** @type {{ resumed: boolean, reason?: string, checkpoint?: any, prefix?: boolean }} */
  let resumePrep = { resumed: false };
  if (resumeEdition) {
    resume = createLoaderResume(client, {
      loader: "load-sold-prices",
      stageTable: STAGE_TABLE,
      seqBase: 1,
      progress,
      restart,
    });
    resumePrep = await resume.prepare({
      edition: resumeEdition,
      expected: null,
      // Past the intake the staged set is no longer a prefix
      // (the dedupe deletes rows, the merge replaces them), so
      // the prefix proof cannot apply: the step reconciliations
      // below are the guard, and the phase checkpoints are
      // written only once their step has reconciled.
      stagedCheck: (checkpoint) => {
        const phase = checkpoint.state?.phase ?? "intake";
        if (phase === "intake") return null;
        return { resumed: true, checkpoint, prefix: false };
      },
    });
  }
  // The checkpoint's phase: intake (died reading), deduped,
  // merged. A run that died after the intake re-runs only the
  // steps after its phase — the intake stream is never re-read
  // once its tallies stand checkpointed.
  const resumeState = resumePrep.resumed ? (resumePrep.checkpoint.state ?? {}) : {};
  const resumePhase = resumePrep.resumed ? (resumeState.phase ?? "intake") : "intake";
  const skipLines = resumePrep.resumed ? resumePrep.checkpoint.next_start_index : 0;
  if (resumePrep.resumed) {
    stats.malformed = resumeState.malformed ?? 0;
    stats.emptyPostcode = resumeState.emptyPostcode ?? 0;
    stats.uncovered = resumeState.uncovered ?? {};
  }

  // 1 — the full file, every line parsed, filed in batches
  // (uncovered-area rows skipped and counted at intake, BUG-184 —
  // they are never staged). Intake keeps the reconciliation
  // tallies BUG-188 demands: the lines read, the bytes they
  // account for, and the records handed to the staging inserts.
  let batch = [];
  let linesRead = resumePhase === "intake" ? 0 : (resumeState.linesRead ?? 0);
  let lineBytes = resumePhase === "intake" ? 0 : (resumeState.lineBytes ?? 0);
  let recordsStaged = resumePrep.resumed ? resumePrep.checkpoint.filed_count : 0;
  // BUG-248: the pass's later steps read these — they are
  // assigned inside the intake-and-staging wrap below, and the
  // wrap's catch reports them when a step refuses.
  let updateRecords;
  let sourceDate = edition;
  let total = 0;
  // The checkpoint state for the phase this run reaches: the
  // intake tallies the BUG-188 guard reconciles against, so a
  // run that died after the intake can prove its staged set
  // without re-reading the file.
  const checkpointState = (phase) => ({
    phase,
    linesRead,
    lineBytes,
    malformed: stats.malformed,
    emptyPostcode: stats.emptyPostcode,
    uncovered: stats.uncovered,
    duplicates: stats.duplicates,
  });
  try {
    // The flush commits its rows and its checkpoint in ONE
    // transaction: the stage seq is an identity column, so a
    // chunk staged without its checkpoint could never be
    // re-staged with the same seqs — a kill between the two
    // would leave rows the next run cannot account for. The
    // checkpoint's log line lands after the commit, never
    // inside it: a line must only ever name durable work.
    const flush = async () => {
      if (batch.length === 0) return;
      await client.query("BEGIN");
      try {
        await insertRecords(client, STAGE_TABLE, batch, null, null);
        batch = [];
        let row = null;
        if (resume) {
          row = resume.checkpointRow({
            edition: resumeEdition,
            expected: null,
            nextStartIndex: linesRead,
            read: linesRead,
            filed: recordsStaged,
            state: checkpointState("intake"),
          });
          await writeCheckpoint(client, row);
        }
        await client.query("COMMIT");
        if (resume && row) resume.noteCheckpoint(row, { unit: "lines" });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    };
    // A run that died after the intake never re-reads the file:
    // its tallies stand checkpointed, and the steps below run
    // over the staged set. A run that died mid-intake re-reads
    // from the checkpoint's line and skips the staged prefix —
    // the skipped lines still count their bytes, so the BUG-188
    // size guard reconciles exactly as on a fresh run.
    if (resumePhase === "intake") {
      for await (const line of fullLines) {
        if (!line) continue;
        linesRead += 1;
        lineBytes += Buffer.byteLength(line);
        if (linesRead <= skipLines) continue;
        // BUG-204: a line every 2M lines read — and, where the
        // source declared its size (the --file stat, or the
        // live Content-Length), the share of those bytes
        // consumed so far, which is the pass's real percentage.
        if (linesRead % 2000000 === 0) {
          const declared =
            expectedFullBytes !== null && expectedFullBytes !== undefined
              ? `${Math.min(100, Math.round(((lineBytes + linesRead) / expectedFullBytes) * 100))}% of declared ${formatCount(expectedFullBytes)} bytes`
              : "";
          progress?.count({ label: "intake", done: linesRead, unit: "lines", extra: declared });
          // BUG-248: the intake is the longest phase — a heartbeat
          // every 10,000,000 lines or 15 minutes. The 1,000-row
          // staging flushes are too fine-grained for a slow-batch
          // watch (3x on ~50 ms is noise), so there is none here.
          progress?.heartbeat({ stage: "intake", done: linesRead, every: 10_000_000 });
        }
        const record = toRecord(parsePpdLine(line));
        if (!record) {
          stats.malformed += 1;
          continue;
        }
        if (record.postcode.trim() === "") {
          stats.emptyPostcode += 1;
          continue;
        }
        if (skipUncoveredRecord(record, stats)) continue;
        batch.push(record);
        recordsStaged += 1;
        if (batch.length >= INSERT_BATCH_ROWS) await flush();
      }
      await flush();
    }
    progress?.stage(
      `intake complete — ${formatCount(linesRead)} lines read, ${formatCount(recordsStaged)} records staged`,
    );

    const stagedCount = async () =>
      (await client.query(`SELECT count(*)::int AS n FROM ${STAGE_TABLE}`)).rows[0].n;

    // 1b/1c — the intake guards run only when this run read
    // the file: a run that died after the intake trusts the
    // checkpointed tallies (the dedupe/merge reconciliations
    // below are the guard for the staged set it resumes from).
    // The byte guard (BUG-188): when the caller declared the
    // full file's size, the lines consumed must account for
    // exactly that many bytes — one terminator per line, LF or
    // CRLF, the final terminator present or not. Anything else
    // means the source under-delivered (or over-delivered) and
    // the register this pass would file is not the register the
    // source describes; refuse before the swap.
    if (resumePhase === "intake") {
      if (expectedFullBytes !== null && expectedFullBytes !== undefined) {
        const honestSizes = new Set([
          lineBytes + linesRead, // LF, final newline present
          lineBytes + linesRead - 1, // LF, no final newline
          lineBytes + 2 * linesRead, // CRLF, final newline present
          lineBytes + 2 * linesRead - 2, // CRLF, no final newline
        ]);
        if (!honestSizes.has(expectedFullBytes))
          throw new Error(
            `the full file under-delivered: its source declared ${expectedFullBytes} bytes but the pass read ${linesRead} lines accounting for ${lineBytes + linesRead} of them — refusing to file a partial register (BUG-188)`,
          );
      }

      // The staged count must equal the parsed count: a batch
      // insert that landed short is a silent hole of exactly the
      // BUG-188 shape, caught here instead of after the swap.
      const afterIntake = await stagedCount();
      if (afterIntake !== recordsStaged)
        throw new Error(
          `the national pass staged ${afterIntake} rows from ${recordsStaged} parsed records — refusing to file a register it cannot account for (BUG-188)`,
        );
    }

    // 2 — duplicate transaction ids in the full file collapse to
    // the last row filed (the legacy loader's Map semantics), in
    // SQL: seq is insertion order, so the greatest seq survives.
    // A run that died after this step does not re-run it: the
    // staged set already holds the collapsed register, and the
    // duplicate count stands checkpointed.
    let afterDedupe;
    let parsedStaged;
    if (resumePhase === "merged") {
      // The merge already ran: the deduped count stands
      // checkpointed in the merged checkpoint's state — the
      // staged set no longer holds it (the merge replaced
      // rows), so it cannot be re-read from the table. A merged
      // checkpoint written before afterDedupe was carried is
      // reconstructed from the merge reconciliation itself:
      // afterMerge = afterDedupe − updateMatched + upserted.
      stats.duplicates = resumeState.duplicates ?? 0;
      afterDedupe =
        resumeState.afterDedupe ??
        (resumeState.afterMerge ?? resumePrep.checkpoint.filed_count) +
          (resumeState.updateMatched ?? 0) -
          (resumeState.upserted ?? 0);
      parsedStaged = resumeState.parsedStaged ?? afterDedupe + stats.duplicates;
    } else if (resumePhase === "deduped") {
      stats.duplicates = resumeState.duplicates ?? 0;
      afterDedupe = await stagedCount();
      // The deduped checkpoint carries the parsed count; a
      // checkpoint written before that field existed is
      // reconstructed from the collapsed total + duplicates.
      // The merge is atomic with its checkpoint (step 3), so a
      // run that died mid-merge rolled the stage back to
      // exactly this deduped set — the count here is the
      // deduped total, never a half-merged one.
      parsedStaged = resumeState.parsedStaged ?? afterDedupe + stats.duplicates;
      if (afterDedupe !== parsedStaged - stats.duplicates)
        throw new Error(
          `the national pass holds ${afterDedupe} staged rows after collapsing ${stats.duplicates} duplicates from ${parsedStaged} parsed records — refusing to file a register it cannot account for (BUG-188)`,
        );
    } else {
      // The dedupe and its checkpoint commit together: a kill
      // between the DELETE and the checkpoint would leave a
      // staged set the intake checkpoint's prefix proof cannot
      // recognise (the DELETE punches holes in the seqs), and
      // the next run would discard the whole intake.
      parsedStaged = recordsStaged;
      await client.query("BEGIN");
      try {
        const deduped = await client.query(
          `DELETE FROM ${STAGE_TABLE} a USING ${STAGE_TABLE} b
      WHERE a.transaction_id = b.transaction_id AND a.seq < b.seq`,
        );
        stats.duplicates = deduped.rowCount ?? 0;
        afterDedupe = await stagedCount();
        if (afterDedupe !== parsedStaged - stats.duplicates)
          throw new Error(
            `the national pass holds ${afterDedupe} staged rows after collapsing ${stats.duplicates} duplicates from ${parsedStaged} parsed records — refusing to file a register it cannot account for (BUG-188)`,
          );
        let row = null;
        if (resume) {
          row = resume.checkpointRow({
            edition: resumeEdition,
            expected: null,
            nextStartIndex: linesRead,
            read: linesRead,
            filed: afterDedupe,
            state: { ...checkpointState("deduped"), parsedStaged, afterDedupe },
          });
          await writeCheckpoint(client, row);
        }
        await client.query("COMMIT");
        if (resume && row) resume.noteCheckpoint(row, { unit: "lines" });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }

    // 3 — the monthly update file merged over the staged full
    // file, by transaction id (the register's standing definition:
    // full file + monthly update, the SOURCE_NAME's own words).
    // The merge is reconciled too: staged rows whose id the update
    // names are counted before the merge, and the staged total
    // after it must be that count removed and the upserts added.
    updateRecords = parseAllRecords(updateLines, stats);
    const updateGuids = [...new Set(updateRecords.map((r) => r.transactionId))];
    let updateMatched = 0;
    let merged;
    let afterMerge;
    if (resumePhase === "merged") {
      // The merge already ran: its counts stand checkpointed,
      // and the staged set already holds the merged register.
      // afterDedupe here is the state-carried deduped count
      // (step 2), never the staged count — the staged set
      // holds the merged register now, so re-reading it as the
      // deduped count would refuse a register that reconciles.
      updateMatched = resumeState.updateMatched ?? 0;
      merged = { upserted: resumeState.upserted ?? 0 };
      afterMerge = await stagedCount();
      if (afterMerge !== afterDedupe - updateMatched + merged.upserted)
        throw new Error(
          `the national pass holds ${afterMerge} staged rows after the update merge (expected ${afterDedupe - updateMatched + merged.upserted}: ${afterDedupe} staged − ${updateMatched} replaced or deleted + ${merged.upserted} upserted) — refusing to file a register it cannot account for (BUG-188)`,
        );
    } else {
      // The merge and its checkpoint commit together (the
      // dedupe's shape): a kill mid-merge rolls the stage
      // back to the deduped set, so the resumed run re-runs
      // the merge from a clean deduped register instead of a
      // half-merged one — and the match count below is taken
      // against that deduped set, never a half-merged one.
      await client.query("BEGIN");
      try {
        for (let at = 0; at < updateGuids.length; at += GUID_CHUNK) {
          const res = await client.query(
            `SELECT count(*)::int AS n FROM ${STAGE_TABLE} WHERE transaction_id = ANY($1)`,
            [updateGuids.slice(at, at + GUID_CHUNK)],
          );
          updateMatched += res.rows[0].n;
        }
        merged = await mergeUpdateRecords(client, STAGE_TABLE, updateRecords, null, null);
        afterMerge = await stagedCount();
        if (afterMerge !== afterDedupe - updateMatched + merged.upserted)
          throw new Error(
            `the national pass holds ${afterMerge} staged rows after the update merge (expected ${afterDedupe - updateMatched + merged.upserted}: ${afterDedupe} staged − ${updateMatched} replaced or deleted + ${merged.upserted} upserted) — refusing to file a register it cannot account for (BUG-188)`,
          );
        let row = null;
        if (resume) {
          row = resume.checkpointRow({
            edition: resumeEdition,
            expected: null,
            nextStartIndex: linesRead,
            read: linesRead,
            filed: afterMerge,
            state: {
              ...checkpointState("merged"),
              parsedStaged,
              afterDedupe,
              updateMatched,
              upserted: merged.upserted,
              afterMerge,
            },
          });
          await writeCheckpoint(client, row);
        }
        await client.query("COMMIT");
        if (resume && row) resume.noteCheckpoint(row, { unit: "lines" });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }
    progress?.stage(
      `update merged — ${formatCount(merged.upserted)} upserted, ${formatCount(updateRecords.length - merged.upserted)} deleted`,
    );

    // 4 — the edition settles once, over the whole staged set:
    // the file's publication date when the source gave one, else
    // the newest sale date filed. The staged rows are NOT stamped
    // with it: the edition is one constant for the whole pass,
    // and rewriting every staged row to carry it would double
    // the staging heap in dead tuples (BUG-201). The swap's
    // insert-select writes it — and the source name, likewise
    // never staged — as parameters, so the filed rows carry
    // exactly what the old stamp-then-copy wrote.
    if (!sourceDate) {
      const res = await client.query(`SELECT max(sale_date)::text AS newest FROM ${STAGE_TABLE}`);
      sourceDate = res.rows[0]?.newest ?? null;
    }
    if (!sourceDate) throw new Error("the full file filed no sales — nothing to swap in");

    // 5 — proofs against staging, before anything live moves: the
    // golden homes, and the zero-uncovered-row self-check. The
    // staging carries no indexes (BUG-201), so the proofs read it
    // by sequential scan — the same rows, the same verdicts. No
    // duplicate id can survive to be filed: the dedupe above
    // collapsed them and the counts reconciled, and the live
    // table's own unique index (migration 0003) rejects any
    // survivor inside the swap transaction, rolling it back.
    // Uncovered-area rows were skipped at intake (BUG-184), so
    // this count must read zero; a row here means the skip itself
    // is broken, and the pass refuses on that defect — never on
    // the source's data.
    const stagedFor = async (pc) => filedRowsFor(client, STAGE_TABLE, pc);
    const goldenStaged = {};
    for (const pc of ["CM3 2JT", "E16 1GN"]) goldenStaged[pc] = await stagedFor(pc);
    checkGolden((pc) => goldenStaged[pc] ?? null, "the staged records");
    const guard = await client.query(
      `SELECT count(*)::int AS n FROM ${STAGE_TABLE}
      WHERE regexp_replace(split_part(postcode, ' ', 1), '[0-9].*$', '') = ANY($1)`,
      [[...UNCOVERED_AREAS]],
    );
    if (guard.rows[0].n > 0)
      throw new Error(
        `the national pass staged ${guard.rows[0].n} rows for Scotland or Northern Ireland postcodes despite the intake skip (BUG-184) — the loader is defective, refusing to file them`,
      );
    const totalRes = await client.query(`SELECT count(*)::int AS n FROM ${STAGE_TABLE}`);
    total = totalRes.rows[0].n;
    if (total !== afterMerge)
      throw new Error(
        `the national pass holds ${total} staged rows at the proofs against ${afterMerge} reconciled after the update merge — refusing to file a register it cannot account for (BUG-188)`,
      );
  } catch (err) {
    // BUG-248: intake, dedupe, merge and proofs all fail
    // before anything is filed — one line, at the stage
    // that refused, and a re-run from the start.
    progress?.failed({
      stage: "intake and staging",
      filed: recordsStaged,
      error: err,
      resume: resume
        ? resume.resumeNote()
        : "re-run the national pass from the start (staging is rebuilt, nothing is filed until the swap)",
    });
    throw err;
  }

  const seconds = () => Math.round((Date.now() - startedAt) / 1000);
  const summary = (stamped) =>
    `load-sold-prices · edition ${sourceDate} · national pass · ${formatCount(total)} sales filed · ${formatCount(updateRecords.length)} update rows merged · ${formatCount(stats.malformed)} malformed skipped · ${formatCount(stats.duplicates)} duplicates collapsed · ${formatCount(stats.emptyPostcode)} empty-postcode rows skipped · ${uncoveredSkipSegment(stats)} · ${formatCount(stamped)} no-sale postcodes stamped · ${formatCount(linesRead)} full-file lines read · golden homes OK · ${seconds()}s`;

  if (verifyOnly) {
    if (resume) await resume.clear();
    else await client.query(`DROP TABLE IF EXISTS ${STAGE_TABLE}`);
    return {
      edition: sourceDate,
      logLine: `${summary(0)} · verify only, nothing filed`,
      total,
      linesRead,
      stats,
      updateRows: updateRecords.length,
      stamped: 0,
    };
  }

  // 6 — the swap: one transaction. Serving reads see the old
  // register until commit and the new one after; there is no
  // moment with a half-filed register. The golden proof reads
  // the filed rows back from the live table before commit, as
  // the legacy loader proves its own filing. The source name
  // and the edition ride as parameters — the staging never
  // stored either (BUG-201).
  progress?.stage(`swap started — filing ${formatCount(total)} staged rows into the live register`);
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE price_paid");
    const swapped = await client.query(
      `INSERT INTO price_paid
         (transaction_id, postcode, price, sale_date, property_type, new_build,
          tenure, paon, saon, street, locality, town, county, ppd_category,
          record_status, source_name, source_date)
       SELECT transaction_id, postcode, price, sale_date, property_type, new_build,
              tenure, paon, saon, street, locality, town, county, ppd_category,
              record_status, $1, $2
         FROM ${STAGE_TABLE}`,
      [SOURCE_NAME, sourceDate],
    );
    // The swap lands exactly the staged total or the whole
    // transaction rolls back (BUG-188): a short insert-select
    // must never become the served register.
    if (swapped.rowCount !== total)
      throw new Error(
        `the swap filed ${swapped.rowCount} rows against ${total} staged — rolling back (BUG-188)`,
      );
    const filed = {};
    for (const pc of ["CM3 2JT", "E16 1GN"])
      filed[pc] = await filedRowsFor(client, "price_paid", pc);
    checkGolden((pc) => filed[pc] ?? null, "the filed rows");
    await client.query("COMMIT");
  } catch (error) {
    // BUG-248: the swap files everything or nothing — on a
    // rollback nothing is filed, and the re-run starts over.
    progress?.failed({
      stage: "swap",
      filed: 0,
      total,
      error,
      resume:
        "re-run the national pass from the start (the swap rolled back, the live register is untouched)",
    });
    await client.query("ROLLBACK");
    throw error;
  }

  // 7 — gap 2's bulk stamp, after the swap (it reads the new
  // register to decide who filed nothing).
  // BUG-248: the swap has committed by here, so a stamp
  // failure resumes at the stamp alone.
  let stamped;
  try {
    stamped = await stampNoSalePostcodes(client, sourceDate, { progress });
  } catch (err) {
    progress?.failed({
      stage: "stamping",
      filed: total,
      total,
      error: err,
      resume: "re-run the stamp only (the swap already committed; the stamp is idempotent)",
    });
    throw err;
  }
  if (resume) await resume.clear();
  else await client.query(`DROP TABLE IF EXISTS ${STAGE_TABLE}`);
  return {
    edition: sourceDate,
    logLine: summary(stamped),
    total,
    linesRead,
    stats,
    updateRows: updateRecords.length,
    stamped,
  };
}

// --legacy: the per-postcode load, with resume support (BUG-368).
// The legacy mode streams the whole 5.54 GB full file (at ~2.6
// MB/s from this VM, ~35 minutes a postcode) and used to hold the
// target postcodes' sales in an in-memory Map, so a kill anywhere
// in the stream lost the run outright. It now stages the target
// records into the PERSISTENT sold_prices_legacy_stage table as
// the stream reads them (migration 0048 — the parent adds the
// table at merge time; runLegacy still creates it, so the loader
// works on a database the migration has not yet reached), and a
// loader_checkpoint row records the last fully staged chunk, so
// a killed run resumes mid-stream instead of re-reading the file.
//
// THE RESUME UNITS. The intake is line-based, like the national
// pass: the checkpoint's next_start_index is the count of lines
// read, and a resumed run re-reads the file from the start,
// skipping that many lines (the skipped lines still count their
// bytes, so the BUG-188 size guard reconciles exactly as on a
// fresh run). The staged rows carry takeSeq seqs (the AQMA
// shape — assigned at flush, so a kill between a flush and its
// checkpoint leaves a trimmable tail), and the checkpoint lands
// every 500,000 lines read plus at the intake's end, one line
// per checkpointed chunk — the target records are sparse (a
// handful per million lines), so the batch flush alone would
// stage nothing for most of the stream and the resume point
// would never advance. Past the intake the staged set is no
// longer a prefix (the dedupe deletes rows, the merge replaces
// them), so the phase checkpoints use the national pass's
// stagedCheck: only the intake phase takes the prefix proof,
// and the dedupe/merge steps reconcile by count instead. The
// filing is unchanged in shape: each postcode's set is swapped
// whole inside ONE transaction, proved by a read-back before
// commit, and a successful filing clears staging + checkpoint
// together (BUG-248 atomicity unchanged).
const LEGACY_STAGE_TABLE = "sold_prices_legacy_stage";
const LEGACY_CHECKPOINT_EVERY_LINES = 500000;

/**
 * @param {any} client
 * @param {{ fullLines: AsyncIterable<string> | Iterable<string>, updateLines: Iterable<string>, targets: Set<string>, edition: string | null, resumeEdition?: string | null, expectedFullBytes?: number | null, progress?: any, restart?: boolean }} options
 */
export async function runLegacy(
  client,
  {
    fullLines,
    updateLines,
    targets,
    edition,
    resumeEdition = null,
    expectedFullBytes = null,
    progress = null,
    restart = false,
  },
) {
  const startedAt = Date.now();
  const stats = { malformed: 0, emptyPostcode: 0, duplicates: 0, uncovered: {} };
  const targetList = [...targets];
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${LEGACY_STAGE_TABLE} (
       seq bigint NOT NULL,
       transaction_id text,
       postcode text,
       price integer,
       sale_date date,
       property_type text,
       new_build boolean,
       tenure text,
       paon text,
       saon text,
       street text,
       locality text,
       town text,
       county text,
       ppd_category text,
       record_status text,
       source_name text,
       source_date date,
       UNIQUE (seq)
     )`,
  );
  if (!resumeEdition) {
    // No edition to key a checkpoint on: this run cannot resume,
    // so a stage table left by a crashed earlier run is stale
    // and must not mix with this run's rows.
    await client.query(`TRUNCATE ${LEGACY_STAGE_TABLE}`);
  }
  let resume = null;
  /** @type {{ resumed: boolean, reason?: string, checkpoint?: any, prefix?: boolean }} */
  let resumePrep = { resumed: false };
  if (resumeEdition) {
    resume = createLoaderResume(client, {
      loader: "load-sold-prices-legacy",
      stageTable: LEGACY_STAGE_TABLE,
      progress,
      restart,
    });
    resumePrep = await resume.prepare({
      edition: resumeEdition,
      expected: null,
      // Past the intake the staged set is no longer a prefix
      // (the dedupe deletes rows, the merge replaces them), so
      // the prefix proof cannot apply: the step reconciliations
      // below are the guard, and the phase checkpoints are
      // written only once their step has reconciled.
      stagedCheck: (checkpoint) => {
        const phase = checkpoint.state?.phase ?? "intake";
        if (phase === "intake") return null;
        return { resumed: true, checkpoint, prefix: false };
      },
    });
  }
  // The checkpoint's phase: intake (died reading), deduped,
  // merged. A run that died after the intake re-runs only the
  // steps after its phase — the intake stream is never re-read
  // once its tallies stand checkpointed.
  const resumeState = resumePrep.resumed ? (resumePrep.checkpoint.state ?? {}) : {};
  const resumePhase = resumePrep.resumed ? (resumeState.phase ?? "intake") : "intake";
  const skipLines = resumePrep.resumed ? resumePrep.checkpoint.next_start_index : 0;
  if (resumePrep.resumed) {
    stats.malformed = resumeState.malformed ?? 0;
    stats.emptyPostcode = resumeState.emptyPostcode ?? 0;
    stats.uncovered = resumeState.uncovered ?? {};
  }

  // 1 — the full file, streamed and filtered to the requested
  // postcodes, staged as it is read (the target records are
  // sparse, so the checkpoint cadence is lines read, not rows
  // staged — a batch flush alone would never advance it).
  let batch = [];
  let linesRead = resumePhase === "intake" ? 0 : (resumeState.linesRead ?? 0);
  let lineBytes = resumePhase === "intake" ? 0 : (resumeState.lineBytes ?? 0);
  let recordsStaged = resumePrep.resumed ? resumePrep.checkpoint.filed_count : 0;
  // The parsed count before the dedupe collapses duplicates:
  // the dedupe reconciliation is checked against this, and a
  // run that died after the dedupe carries it in the
  // checkpoint (the deduped checkpoint's filed count is the
  // post-dedupe total, so it cannot stand in for it).
  let parsedStaged = 0;
  let seqNext = resumePrep.resumed ? resumePrep.checkpoint.filed_count : 0;
  let nextCheckpointLine =
    (Math.floor(skipLines / LEGACY_CHECKPOINT_EVERY_LINES) + 1) * LEGACY_CHECKPOINT_EVERY_LINES;
  // BUG-248: the pass's later steps read these — they are
  // assigned inside the intake-and-staging wrap below, and
  // the wrap's catch reports them when a step refuses.
  let updateRecords;
  let sourceDate = edition;
  let total = 0;
  let stagedByPostcode = new Map();
  // The checkpoint state for the phase this run reaches: the
  // intake tallies the BUG-188 guard reconciles against, so a
  // run that died after the intake can prove its staged set
  // without re-reading the file.
  const checkpointState = (phase) => ({
    phase,
    linesRead,
    lineBytes,
    malformed: stats.malformed,
    emptyPostcode: stats.emptyPostcode,
    uncovered: stats.uncovered,
    duplicates: stats.duplicates,
  });
  try {
    const flush = async () => {
      if (batch.length === 0) return;
      const base = seqNext;
      seqNext += batch.length;
      await insertRecords(client, LEGACY_STAGE_TABLE, batch, null, null, base);
      recordsStaged += batch.length;
      batch = [];
    };
    const checkpointIntake = async () => {
      if (!resume) return;
      await resume.checkpoint({
        edition: resumeEdition,
        expected: null,
        nextStartIndex: linesRead,
        read: linesRead,
        filed: recordsStaged,
        state: checkpointState("intake"),
        unit: "lines",
      });
    };
    // A run that died after the intake never re-reads the file:
    // its tallies stand checkpointed, and the steps below run
    // over the staged set. A run that died mid-intake re-reads
    // from the checkpoint's line and skips the staged prefix —
    // the skipped lines still count their bytes, so the BUG-188
    // size guard reconciles exactly as on a fresh run.
    if (resumePhase === "intake") {
      for await (const line of fullLines) {
        if (!line) continue;
        linesRead += 1;
        lineBytes += Buffer.byteLength(line);
        if (linesRead <= skipLines) continue;
        // BUG-204: a line every 2M lines read — and, where the
        // source declared its size (the --file stat, or the
        // live Content-Length), the share of those bytes
        // consumed so far, which is the pass's real percentage.
        if (linesRead % 2000000 === 0) {
          const declared =
            expectedFullBytes !== null && expectedFullBytes !== undefined
              ? `${Math.min(100, Math.round(((lineBytes + linesRead) / expectedFullBytes) * 100))}% of declared ${formatCount(expectedFullBytes)} bytes`
              : "";
          progress?.count({ label: "intake", done: linesRead, unit: "lines", extra: declared });
          progress?.heartbeat({ stage: "intake", done: linesRead, every: 10_000_000 });
        }
        // Cheap pre-filter: only lines naming a target postcode get parsed.
        if (!targetList.some((pc) => line.includes(`"${pc}"`))) continue;
        const record = toRecord(parsePpdLine(line));
        if (!record) {
          stats.malformed += 1;
          continue;
        }
        if (record.postcode.trim() === "") {
          stats.emptyPostcode += 1;
          continue;
        }
        if (skipUncoveredRecord(record, stats)) continue;
        batch.push(record);
        if (batch.length >= INSERT_BATCH_ROWS) await flush();
        if (linesRead >= nextCheckpointLine) {
          await flush();
          await checkpointIntake();
          nextCheckpointLine += LEGACY_CHECKPOINT_EVERY_LINES;
        }
      }
      await flush();
      await checkpointIntake();
      parsedStaged = recordsStaged;
    }
    progress?.stage(
      `intake complete — ${formatCount(linesRead)} lines read, ${formatCount(recordsStaged)} target records staged`,
    );

    const stagedCount = async () =>
      (await client.query(`SELECT count(*)::int AS n FROM ${LEGACY_STAGE_TABLE}`)).rows[0].n;

    // 1b/1c — the intake guards run only when this run read
    // the file: a run that died after the intake trusts the
    // checkpointed tallies (the dedupe/merge reconciliations
    // below are the guard for the staged set it resumes from).
    // The byte guard (BUG-188): when the caller declared the
    // full file's size, the lines consumed must account for
    // exactly that many bytes — one terminator per line, LF or
    // CRLF, the final terminator present or not. Anything else
    // means the source under-delivered (or over-delivered) and
    // the register this pass would file is not the register the
    // source describes; refuse before the swap.
    if (resumePhase === "intake") {
      if (expectedFullBytes !== null && expectedFullBytes !== undefined) {
        const honestSizes = new Set([
          lineBytes + linesRead, // LF, final newline present
          lineBytes + linesRead - 1, // LF, no final newline
          lineBytes + 2 * linesRead, // CRLF, final newline present
          lineBytes + 2 * linesRead - 2, // CRLF, no final newline
        ]);
        if (!honestSizes.has(expectedFullBytes))
          throw new Error(
            `the full file under-delivered: its source declared ${expectedFullBytes} bytes but the pass read ${linesRead} lines accounting for ${lineBytes + linesRead} of them — refusing to file a partial register (BUG-188)`,
          );
      }

      // The staged count must equal the parsed count: a batch
      // insert that landed short is a silent hole of exactly the
      // BUG-188 shape, caught here instead of after the swap.
      const afterIntake = await stagedCount();
      if (afterIntake !== recordsStaged)
        throw new Error(
          `the legacy pass staged ${afterIntake} rows from ${recordsStaged} parsed records — refusing to file a register it cannot account for (BUG-188)`,
        );
    }

    // 2 — duplicate transaction ids in the target set collapse to
    // the last row filed (the legacy loader's Map semantics), in
    // SQL: seq is insertion order, so the greatest seq survives.
    // A run that died after this step does not re-run it: the
    // staged set already holds the collapsed register, and the
    // duplicate count stands checkpointed.
    let afterDedupe;
    if (resumePhase === "merged") {
      // The merge already ran: the deduped count stands
      // checkpointed in the merged checkpoint's state — the
      // staged set no longer holds it (the merge replaced
      // rows), so it cannot be re-read from the table.
      stats.duplicates = resumeState.duplicates ?? 0;
      parsedStaged = resumeState.parsedStaged ?? (resumeState.afterDedupe ?? 0) + stats.duplicates;
      afterDedupe = resumeState.afterDedupe ?? parsedStaged - stats.duplicates;
    } else if (resumePhase === "deduped") {
      stats.duplicates = resumeState.duplicates ?? 0;
      afterDedupe = await stagedCount();
      // The deduped checkpoint carries the parsed count; a
      // checkpoint written before that field existed is
      // reconstructed from the collapsed total + duplicates.
      // The merge is atomic with its checkpoint (step 3), so a
      // run that died mid-merge rolled the stage back to
      // exactly this deduped set — the count here is the
      // deduped total, never a half-merged one.
      parsedStaged = resumeState.parsedStaged ?? afterDedupe + stats.duplicates;
      if (afterDedupe !== parsedStaged - stats.duplicates)
        throw new Error(
          `the legacy pass holds ${afterDedupe} staged rows after collapsing ${stats.duplicates} duplicates from ${parsedStaged} parsed records — refusing to file a register it cannot account for (BUG-188)`,
        );
    } else {
      // The dedupe and its checkpoint commit together: a kill
      // between the DELETE and the checkpoint would leave a
      // staged set the intake checkpoint's prefix proof cannot
      // recognise (the DELETE punches holes in the seqs), and
      // the next run would discard the whole intake.
      await client.query("BEGIN");
      try {
        const deduped = await client.query(
          `DELETE FROM ${LEGACY_STAGE_TABLE} a USING ${LEGACY_STAGE_TABLE} b
      WHERE a.transaction_id = b.transaction_id AND a.seq < b.seq`,
        );
        stats.duplicates = deduped.rowCount ?? 0;
        afterDedupe = await stagedCount();
        if (afterDedupe !== parsedStaged - stats.duplicates)
          throw new Error(
            `the legacy pass holds ${afterDedupe} staged rows after collapsing ${stats.duplicates} duplicates from ${parsedStaged} parsed records — refusing to file a register it cannot account for (BUG-188)`,
          );
        let row = null;
        if (resume) {
          row = resume.checkpointRow({
            edition: resumeEdition,
            expected: null,
            nextStartIndex: linesRead,
            read: linesRead,
            filed: afterDedupe,
            state: { ...checkpointState("deduped"), parsedStaged, afterDedupe },
          });
          await writeCheckpoint(client, row);
        }
        await client.query("COMMIT");
        if (resume && row) resume.noteCheckpoint(row, { unit: "lines" });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }

    // 3 — the monthly update file merged over the staged target
    // rows, by transaction id (the legacy merge, filtered to the
    // requested postcodes): an update row marked D deletes its
    // transaction id; any other row replaces it. The merge is
    // reconciled too: staged rows whose id the update names are
    // counted before the merge, and the staged total after it
    // must be that count removed and the upserts added.
    const targetUpdateLines = updateLines.filter(
      (line) => line && targetList.some((pc) => line.includes(`"${pc}"`)),
    );
    updateRecords = parseAllRecords(targetUpdateLines, stats);
    const updateGuids = [...new Set(updateRecords.map((r) => r.transactionId))];
    let updateMatched = 0;
    let merged;
    let afterMerge;
    if (resumePhase === "merged") {
      // The merge already ran: its counts stand checkpointed,
      // and the staged set already holds the merged register.
      updateMatched = resumeState.updateMatched ?? 0;
      merged = { upserted: resumeState.upserted ?? 0 };
      afterMerge = await stagedCount();
      if (afterMerge !== afterDedupe - updateMatched + merged.upserted)
        throw new Error(
          `the legacy pass holds ${afterMerge} staged rows after the update merge (expected ${afterDedupe - updateMatched + merged.upserted}: ${afterDedupe} staged − ${updateMatched} replaced or deleted + ${merged.upserted} upserted) — refusing to file a register it cannot account for (BUG-188)`,
        );
    } else {
      // The merge and its checkpoint commit together (the
      // dedupe's shape): a kill mid-merge rolls the stage
      // back to the deduped set, so the resumed run re-runs
      // the merge from a clean deduped register instead of a
      // half-merged one — and the match count below is taken
      // against that deduped set, never a half-merged one.
      await client.query("BEGIN");
      try {
        for (let at = 0; at < updateGuids.length; at += GUID_CHUNK) {
          const res = await client.query(
            `SELECT count(*)::int AS n FROM ${LEGACY_STAGE_TABLE} WHERE transaction_id = ANY($1)`,
            [updateGuids.slice(at, at + GUID_CHUNK)],
          );
          updateMatched += res.rows[0].n;
        }
        // The legacy stage's seq is NOT NULL with no default
        // (BUG-379): the merge's upserts must carry seqs, and
        // they continue past the greatest seq staged — the
        // dedupe punched holes, so the filed count is not
        // the max. Read the max: the merge is atomic with
        // its checkpoint, so a kill mid-merge rolls the
        // stage back and the resumed run reads the same
        // deduped max again.
        let nextSeq = null;
        if (updateRecords.some((r) => r.recordStatus !== "D")) {
          const res = await client.query(
            `SELECT coalesce(max(seq), -1) + 1 AS next FROM ${LEGACY_STAGE_TABLE}`,
          );
          nextSeq = res.rows[0].next;
        }
        merged = await mergeUpdateRecords(
          client,
          LEGACY_STAGE_TABLE,
          updateRecords,
          null,
          null,
          nextSeq,
        );
        afterMerge = await stagedCount();
        if (afterMerge !== afterDedupe - updateMatched + merged.upserted)
          throw new Error(
            `the legacy pass holds ${afterMerge} staged rows after the update merge (expected ${afterDedupe - updateMatched + merged.upserted}: ${afterDedupe} staged − ${updateMatched} replaced or deleted + ${merged.upserted} upserted) — refusing to file a register it cannot account for (BUG-188)`,
          );
        let row = null;
        if (resume) {
          row = resume.checkpointRow({
            edition: resumeEdition,
            expected: null,
            nextStartIndex: linesRead,
            read: linesRead,
            filed: afterMerge,
            state: {
              ...checkpointState("merged"),
              parsedStaged,
              afterDedupe,
              updateMatched,
              upserted: merged.upserted,
              afterMerge,
            },
          });
          await writeCheckpoint(client, row);
        }
        await client.query("COMMIT");
        if (resume && row) resume.noteCheckpoint(row, { unit: "lines" });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }
    progress?.stage(
      `update merged — ${formatCount(merged.upserted)} upserted, ${formatCount(updateRecords.length - merged.upserted)} deleted`,
    );

    // 4 — the edition settles once, over the whole staged set:
    // the file's publication date when the source gave one, else
    // the newest sale date filed. A pass that staged nothing —
    // the requested postcodes simply have no sales in the file —
    // is a legitimate empty result, not a broken register: the
    // intake guards above already proved the file read whole
    // and reconciled, so the edition falls back to the earliest
    // date, exactly as the old in-memory legacy path did
    // (BUG-383: the CM0 7AA seed witness files nothing by
    // design). The national pass keeps its throw — an empty
    // national register is defective.
    if (!sourceDate) {
      const res = await client.query(
        `SELECT max(sale_date)::text AS newest FROM ${LEGACY_STAGE_TABLE}`,
      );
      sourceDate = res.rows[0]?.newest ?? "1970-01-01";
    }

    // 5 — proofs against staging, before anything live moves: the
    // golden homes, and the zero-uncovered-row self-check.
    // Uncovered-area rows were skipped at intake (BUG-184), so
    // this count must read zero; a row here means the skip itself
    // is broken, and the pass refuses on that defect — never on
    // the source's data.
    stagedByPostcode = new Map();
    for (const pc of targets) {
      const res = await client.query(
        `SELECT transaction_id, postcode, price, sale_date, property_type, new_build, tenure,
                paon, saon, street, locality, town, county, ppd_category, record_status
           FROM ${LEGACY_STAGE_TABLE} WHERE postcode = $1 ORDER BY seq`,
        [pc],
      );
      stagedByPostcode.set(pc, res.rows);
    }
    for (const [pc, rows] of stagedByPostcode) {
      if (rows.length === 0)
        console.error(`load-sold-prices WARNING: no sales found for ${pc} — nothing filed for it`);
    }
    const goldenRowsFor = (pc) => {
      const rows = stagedByPostcode.get(pc);
      if (!rows) return null;
      return rows.map((r) => ({
        transactionId: r.transaction_id,
        price: r.price,
        saleDate:
          r.sale_date instanceof Date ? r.sale_date.toISOString().slice(0, 10) : r.sale_date,
        paon: r.paon,
        street: r.street,
      }));
    };
    checkGolden((pc) => (targets.has(pc) ? goldenRowsFor(pc) : null), "the staged records");
    const guard = await client.query(
      `SELECT count(*)::int AS n FROM ${LEGACY_STAGE_TABLE}
      WHERE regexp_replace(split_part(postcode, ' ', 1), '[0-9].*$', '') = ANY($1)`,
      [[...UNCOVERED_AREAS]],
    );
    if (guard.rows[0].n > 0)
      throw new Error(
        `the legacy pass staged ${guard.rows[0].n} rows for Scotland or Northern Ireland postcodes despite the intake skip (BUG-184) — the loader is defective, refusing to file them`,
      );
    total = await stagedCount();
    if (total !== afterMerge)
      throw new Error(
        `the legacy pass holds ${total} staged rows at the proofs against ${afterMerge} reconciled after the update merge — refusing to file a register it cannot account for (BUG-188)`,
      );
  } catch (err) {
    // BUG-248: intake, dedupe, merge and proofs all fail
    // before anything is filed — one line, at the stage
    // that refused.
    progress?.failed({
      stage: "intake and staging",
      filed: recordsStaged,
      error: err,
      resume: resume
        ? resume.resumeNote()
        : "re-run the legacy load from the start (staging is rebuilt, nothing is filed until the filing step)",
    });
    throw err;
  }

  const counts = [...stagedByPostcode.entries()]
    .map(([pc, rows]) => `${pc} ${formatCount(rows.length)} sales`)
    .join(" · ");
  const summary = () =>
    `load-sold-prices · edition ${sourceDate} · ${counts} · ${formatCount(updateRecords.length)} update rows merged · ${formatCount(stats.malformed)} malformed skipped · ${formatCount(stats.duplicates)} duplicates ignored`;

  // 6 — file it: one transaction; each postcode's set is swapped
  // whole, proved by a read-back before commit. A failed load
  // files nothing and the previous data keeps serving.
  progress?.stage(`filing ${formatCount(targets.size)} postcode sets — swap and proof`);
  try {
    await client.query("BEGIN");
    for (const [pc, rows] of stagedByPostcode) {
      await client.query("DELETE FROM price_paid WHERE postcode = $1", [pc]);
      for (const r of rows) {
        await client.query(
          `INSERT INTO price_paid
             (transaction_id, postcode, price, sale_date, property_type, new_build,
              tenure, paon, saon, street, locality, town, county, ppd_category,
              record_status, source_name, source_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            r.transaction_id,
            pc,
            r.price,
            r.sale_date,
            r.property_type,
            r.new_build,
            r.tenure,
            r.paon,
            r.saon,
            r.street,
            r.locality,
            r.town,
            r.county,
            r.ppd_category,
            r.record_status,
            SOURCE_NAME,
            sourceDate,
          ],
        );
      }
    }
    // Proof: read the filed rows back from the database, pre-commit.
    const filed = new Map();
    for (const pc of targets) {
      filed.set(pc, await filedRowsFor(client, "price_paid", pc));
    }
    checkGolden((pc) => (targets.has(pc) ? filed.get(pc) : null), "the filed rows");
    await client.query("COMMIT");
  } catch (error) {
    progress?.failed({
      stage: "filing",
      filed: 0,
      total: targets.size,
      error,
      resume: resume
        ? resume.resumeNote()
        : "re-run the legacy load from the start (the filing transaction rolls back)",
    });
    await client.query("ROLLBACK");
    throw error;
  }
  if (resume) await resume.clear();
  else await client.query(`DROP TABLE IF EXISTS ${LEGACY_STAGE_TABLE}`);
  return {
    edition: sourceDate,
    logLine: `${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`,
    total,
    linesRead,
    stats,
    updateRows: updateRecords.length,
  };
}

// --update: one monthly update file applied to the live
// register, edition-gated. Returns the summary facts; the
// caller stamps and prints. A refusal throws with the gate's
// reason — the caller stamps the failure before it propagates.
// Uncovered-area rows in the file are skipped and counted at
// intake (BUG-184), exactly as in the national pass: the
// monthly file carries TD rows most months, and this path never
// had an area guard — without the skip it would FILE them.
/**
 * @param {any} client
 * @param {{ updateLines: Iterable<string>, edition: string, verifyOnly?: boolean, progress?: import("./progress.mjs").ProgressLogger | null }} options
 */
export async function runUpdate(
  client,
  { updateLines, edition, verifyOnly = false, progress = null },
) {
  const startedAt = Date.now();
  const stats = { malformed: 0, emptyPostcode: 0, uncovered: {} };
  const records = parseAllRecords(updateLines, stats);
  const upserts = records.filter((r) => r.recordStatus !== "D").length;
  // BUG-204: the update file is small enough to parse whole,
  // so its progress is stage markers — parsed, then merging.
  progress?.stage(
    `update file parsed — ${formatCount(records.length)} records (${formatCount(upserts)} to add or correct, ${formatCount(records.length - upserts)} to delete)`,
  );
  const seconds = () => Math.round((Date.now() - startedAt) / 1000);

  if (verifyOnly) {
    return {
      edition,
      logLine: `load-sold-prices · edition ${edition} · monthly update · ${formatCount(upserts)} sales to add or correct · ${formatCount(records.length - upserts)} to delete · ${formatCount(stats.malformed)} malformed skipped · ${uncoveredSkipSegment(stats)} · verify only, nothing filed · ${seconds()}s`,
      applied: 0,
      deleted: 0,
      stats,
    };
  }

  const baseline = await lastAppliedEdition(client);
  const decision = decideUpdateAction(baseline, edition);
  if (decision.action === "refuse") {
    // BUG-248: the gate refused this edition — a failed run,
    // with no re-run to offer.
    progress?.failed({
      stage: "update gate",
      filed: 0,
      total: upserts,
      error: decision.reason,
      resume: "no re-run — the edition gate refused this file",
    });
    throw new Error(decision.reason);
  }
  if (decision.action === "noop") {
    return {
      edition,
      logLine: `load-sold-prices · edition ${edition} · monthly update · already applied — nothing to do · ${seconds()}s`,
      applied: 0,
      deleted: 0,
      stats,
      noop: true,
    };
  }

  // The merge is one transaction: the register never shows a
  // half-applied month. Rows the update writes carry the update
  // file's own edition (gap 6) — a postcode's rows may then span
  // editions, and the brain serves the newest among them.
  let merged;
  progress?.stage("merging the update into the live register");
  try {
    await client.query("BEGIN");
    merged = await mergeUpdateRecords(client, "price_paid", records, edition);
    await client.query("COMMIT");
  } catch (error) {
    // BUG-248: the merge files everything or nothing — on a
    // rollback nothing is filed, and the re-run starts over.
    progress?.failed({
      stage: "update merge",
      filed: 0,
      total: upserts,
      error,
      resume: "re-run the monthly update (the merge rolled back, the live register is untouched)",
    });
    await client.query("ROLLBACK");
    throw error;
  }
  return {
    edition,
    logLine: `load-sold-prices · edition ${edition} · monthly update · ${formatCount(merged.upserted)} sales added or corrected · ${formatCount(merged.deleted)} deleted · ${formatCount(stats.malformed)} malformed skipped · ${formatCount(stats.emptyPostcode)} empty-postcode rows skipped · ${uncoveredSkipSegment(stats)} · ${seconds()}s`,
    applied: merged.upserted,
    deleted: merged.deleted,
    stats,
  };
}

// The national pass's --file sources (BUG-200): the complete
// file consumed as a readline stream over a file read stream —
// the identical consumption shape to the live branch — and
// never held whole: at 5.54 GB the file cannot be a string at
// all (V8's string ceiling and heap are both smaller), which
// is what stranded the register repair on a byte-verified
// local copy the whole-read branch could not ingest. The
// declared size the BUG-188 guard reconciles against is the
// file's true on-disk size, from stat. The monthly update
// file rides whole, as the array of lines runNational's merge
// consumes — 17 MB at the Registry's current size, safe to
// hold, and the merge's own shape.
/**
 * @param {string} fileDir
 */
export async function nationalFileSources(fileDir) {
  const fullPath = join(fileDir, "pp-complete.csv");
  const { size: expectedFullBytes } = await stat(fullPath);
  // The line stream is created lazily, on the pass's first
  // pull: a readline interface over a file stream flows the
  // moment it is created, and lines it emits before the
  // consumer attaches are lost — and the pass's own preamble
  // (its staging-table setup) sits between this resolution
  // and the first pull, long enough for a fast local file to
  // empty itself into the void and leave the consumer waiting
  // on a stream that will never close for it. (The live
  // branch carries the same shape and is spared only by its
  // source's slowness.)
  const fullLines = (async function* () {
    const lines = createInterface({
      input: createReadStream(fullPath),
      crlfDelay: Infinity,
    });
    for await (const line of lines) yield line;
  })();
  const updateLines = (await readFile(join(fileDir, "pp-monthly-update.csv"), "utf8")).split(
    /\r?\n/,
  );
  return { fullLines, updateLines, expectedFullBytes };
}

// The new modes' entry: sources resolved (live downloads or a
// --file directory), the work run, the outcome stamped (gap 4 —
// success and failure alike; a verify-only run stamps nothing,
// as the legacy verify files nothing).
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

// BUG-385: the live-download fetch for this loader —
// fetchResponse's retry plus this loader's old failure
// wording (`<label> failed: HTTP <status>`). The body reads
// and streams sit outside fetchResponse's try, so a
// malformed body fails fast instead of retrying.
async function fetchDownload(url, label, opts = {}) {
  let response;
  try {
    response = await fetchResponse(url, label, opts);
  } catch (err) {
    if (typeof err.status === "number") throw new Error(`${label} failed: HTTP ${err.status}`);
    throw err;
  }
  return response;
}

async function modeMain(args) {
  const parsed = parseModeArgs(args);
  if (parsed.mode === null)
    throw new Error("name a mode: --national or --update (or neither, for the per-postcode load)");
  if (parsed.rest.length > 0)
    throw new Error(
      `the --${parsed.mode} modes take no postcodes — got: ${parsed.rest.join(", ")}`,
    );
  const startedAt = new Date();
  const context = { sourceDate: parsed.edition };
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example, Key K6)");
  // BUG-204: one logger for the pass — the intake, merge,
  // swap and stamp lines inside runNational / runUpdate.
  const progress = createProgressLogger({ name: "load-sold-prices" });
  const client = new pg.Client({ connectionString });
  await client.connect();
  // BUG-248: set the moment a run starts — the catch below
  // reports only the failures the run itself never reached,
  // so a run's own failed line is never doubled.
  let runStarted = false;
  try {
    if (parsed.mode === "national") {
      let fullLines;
      let updateLines;
      // The full file's declared size, reconciled by the pass
      // against the lines it consumes (BUG-188): the file's
      // on-disk size under --file; live, the download's Content-Length
      // — taken only when the body arrives unencoded, since an
      // encoded body's length counts compressed bytes the line
      // stream never sees. Absent a usable declaration the pass
      // runs unguarded on size (its staged-count reconciliations
      // still apply).
      let expectedFullBytes = null;
      if (parsed.fileDir) {
        ({ fullLines, updateLines, expectedFullBytes } = await nationalFileSources(parsed.fileDir));
      } else {
        const response = await fetchDownload(FULL_FILE_URL, "the full file download");
        const lastModified = response.headers.get("last-modified");
        if (lastModified && !context.sourceDate)
          context.sourceDate = new Date(lastModified).toISOString().slice(0, 10);
        const contentEncoding = response.headers.get("content-encoding");
        const contentLength = response.headers.get("content-length");
        if (contentLength && (!contentEncoding || contentEncoding === "identity"))
          expectedFullBytes = Number(contentLength);
        fullLines = createInterface({
          input: Readable.fromWeb(response.body),
          crlfDelay: Infinity,
        });
        const updateResponse = await fetchDownload(UPDATE_FILE_URL, "the monthly update download");
        updateLines = (await updateResponse.text()).split(/\r?\n/);
      }
      runStarted = true;
      // BUG-368: the resume key is the file's publication date
      // when the source gave one, else the declared file size —
      // a republication changes one or the other, so a checkpoint
      // from an older file can never resume into this one. With
      // neither, the pass runs unresumed, exactly as before.
      const resumeEdition =
        context.sourceDate ?? (expectedFullBytes ? `size-${expectedFullBytes}` : null);
      if (!resumeEdition)
        progress.stage(
          "resume off — no edition to key a checkpoint on (no publication date or file size)",
        );
      const result = await runNational(client, {
        fullLines,
        updateLines,
        edition: context.sourceDate,
        verifyOnly: parsed.verifyOnly,
        expectedFullBytes,
        progress,
        restart: parsed.restart,
        resumeEdition,
      });
      context.sourceDate = result.edition;
      if (parsed.verifyOnly) {
        console.log(result.logLine);
      } else {
        await writeRunStamp(client, {
          mode: "national",
          status: "succeeded",
          startedAt,
          sourceDate: result.edition,
          logLine: result.logLine,
          errorMessage: null,
        });
        console.log(result.logLine);
      }
      return;
    }

    // --update.
    let edition = parsed.edition;
    let updateLines;
    if (parsed.fileDir) {
      if (!edition)
        throw new Error(
          "a --file update run names its file's edition with --edition YYYY-MM-DD (the publication date) — the gap check has nothing honest to compare without it",
        );
      updateLines = (await readFile(join(parsed.fileDir, "pp-monthly-update.csv"), "utf8")).split(
        /\r?\n/,
      );
    } else {
      const response = await fetchDownload(UPDATE_FILE_URL, "the monthly update download");
      const lastModified = response.headers.get("last-modified");
      if (lastModified && !edition) edition = new Date(lastModified).toISOString().slice(0, 10);
      if (!edition)
        throw new Error(
          "the update file's edition could not be read (no Last-Modified header) — refusing to apply an undated update",
        );
      updateLines = (await response.text()).split(/\r?\n/);
    }
    context.sourceDate = edition;
    runStarted = true;
    const result = await runUpdate(client, {
      updateLines,
      edition,
      verifyOnly: parsed.verifyOnly,
      progress,
    });
    if (parsed.verifyOnly) {
      console.log(result.logLine);
    } else {
      await writeRunStamp(client, {
        mode: "update",
        status: "succeeded",
        startedAt,
        sourceDate: result.edition,
        logLine: result.logLine,
        errorMessage: null,
      });
      console.log(result.logLine);
    }
  } catch (error) {
    // BUG-248: a failure the run itself already reported (its
    // own failed line, at the stage it failed in) is not
    // reported again here — this line covers only the failures
    // before the run started (a download, a source read).
    if (!runStarted) {
      progress.failed({
        stage: parsed.mode,
        filed: 0,
        error,
        resume: `re-run the --${parsed.mode} pass from the start`,
      });
    }
    if (!parsed.verifyOnly) {
      await writeRunStamp(client, {
        mode: parsed.mode,
        status: "failed",
        startedAt,
        sourceDate: context.sourceDate,
        logLine: null,
        errorMessage: error.message,
      });
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function legacyMain() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last staged chunk instead of
  // re-reading the full file; with no checkpoint this is a
  // fresh start.
  const restart = args.includes("--restart");
  const fileIdx = args.indexOf("--file");
  const fileDir = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const postcodes = args.filter((a, i) => !a.startsWith("--") && i !== fileIdx + 1);
  if (postcodes.length === 0)
    throw new Error('name at least one postcode, e.g. load-sold-prices -- "CM3 2JT"');
  const targets = new Set(postcodes.map((pc) => pc.trim().toUpperCase()));

  // Sources, resolved once for both paths: the full file as a
  // line stream — never held whole (at 5.54 GB the file cannot
  // be a string at all, BUG-200) — and the monthly update file
  // as lines. The declared size feeds the BUG-188 guard: the
  // file's on-disk size under --file; live, the download's
  // Content-Length when the body arrives unencoded.
  let fullLines;
  let updateLines;
  let sourceDate = null;
  let expectedFullBytes = null;
  if (fileDir) {
    const fullPath = join(fileDir, "pp-complete.csv");
    ({ size: expectedFullBytes } = await stat(fullPath));
    // The line stream is created lazily, on the pass's first
    // pull (the national pass's BUG-200 shape): a readline
    // interface over a file stream flows the moment it is
    // created, and lines it emits before the consumer
    // attaches are lost.
    fullLines = (async function* () {
      const lines = createInterface({
        input: createReadStream(fullPath),
        crlfDelay: Infinity,
      });
      for await (const line of lines) yield line;
    })();
    updateLines = (await readFile(join(fileDir, "pp-monthly-update.csv"), "utf8")).split(/\r?\n/);
  } else {
    const response = await fetchDownload(FULL_FILE_URL, "the full file download");
    const lastModified = response.headers.get("last-modified");
    if (lastModified) sourceDate = new Date(lastModified).toISOString().slice(0, 10);
    const contentEncoding = response.headers.get("content-encoding");
    const contentLength = response.headers.get("content-length");
    if (contentLength && (!contentEncoding || contentEncoding === "identity"))
      expectedFullBytes = Number(contentLength);
    fullLines = createInterface({
      input: Readable.fromWeb(response.body),
      crlfDelay: Infinity,
    });
    // BUG-385: the legacy update fetch now goes through
    // fetchDownload, so a non-OK answer throws here instead
    // of being read as text (the old code took whatever body
    // came back, error page included).
    updateLines = (
      await (await fetchDownload(UPDATE_FILE_URL, "the monthly update download")).text()
    ).split(/\r?\n/);
  }
  // BUG-368: the resume key is the full file's publication date
  // when the source gave one, else the declared file size — a
  // republication changes one or the other, so a checkpoint
  // from an older file can never resume into this one. With
  // neither, the pass runs unresumed, exactly as before.
  const resumeEdition = sourceDate ?? (expectedFullBytes ? `size-${expectedFullBytes}` : null);

  if (verifyOnly) {
    // Verify-only keeps the in-memory path: it files nothing
    // and opens no database, so there is nothing to stage and
    // no checkpoint to write.
    const stats = { malformed: 0, duplicates: 0 };
    const byGuid = await collectFromLines(fullLines, targets, stats);
    let updateCount = 0;
    const targetList = [...targets];
    for (const line of updateLines) {
      if (!line || !targetList.some((pc) => line.includes(`"${pc}"`))) continue;
      const record = toRecord(parsePpdLine(line));
      if (!record || !targets.has(record.postcode)) continue;
      updateCount += 1;
      if (record.recordStatus === "D") byGuid.delete(record.transactionId);
      else byGuid.set(record.transactionId, record);
    }
    const records = [...byGuid.values()];
    const perPostcode = new Map();
    for (const pc of targets)
      perPostcode.set(
        pc,
        records.filter((r) => r.postcode === pc),
      );
    for (const [pc, rows] of perPostcode) {
      if (rows.length === 0)
        console.error(`load-sold-prices WARNING: no sales found for ${pc} — nothing filed for it`);
    }
    if (!sourceDate) {
      sourceDate = records.reduce((max, r) => (r.saleDate > max ? r.saleDate : max), "1970-01-01");
    }
    const rowsFor = (pc) => (targets.has(pc) ? perPostcode.get(pc) : null);
    checkGolden(rowsFor, "the parsed records");
    const counts = [...perPostcode.entries()]
      .map(([pc, rows]) => `${pc} ${formatCount(rows.length)} sales`)
      .join(" · ");
    const summary = () =>
      `load-sold-prices · edition ${sourceDate} · ${counts} · ${formatCount(updateCount)} update rows merged · ${formatCount(stats.malformed)} malformed skipped · ${formatCount(stats.duplicates)} duplicates ignored`;
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    return;
  }

  // Filing: stage the stream, merge, swap — resumable (BUG-368).
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example, Key K6)");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await runLegacy(client, {
      fullLines,
      updateLines,
      targets,
      edition: sourceDate,
      resumeEdition,
      expectedFullBytes,
      progress: createProgressLogger({ name: "load-sold-prices" }),
      restart,
    });
    console.log(result.logLine);
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--national") || args.includes("--update")) {
    await modeMain(args);
    return;
  }
  await legacyMain();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`load-sold-prices FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
