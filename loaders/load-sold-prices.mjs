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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
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

async function collectFromText(text, targets, stats) {
  return collectFromLines(text.split(/\r?\n/), targets, stats);
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
  return `${total} uncovered-area rows skipped (${entries
    .map(([area, count]) => `${area} ${count}`)
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
    } else if (arg === "--") {
      rest.push(...args.slice(i + 1));
      break;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag ${arg} for the --national/--update modes`);
    } else {
      rest.push(arg);
    }
  }
  return { mode, fileDir, edition, verifyOnly, rest };
}

function recordValues(record, sourceDate) {
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
    SOURCE_NAME,
    sourceDate,
  ];
}

// One multi-row INSERT of parsed records into a table holding the
// PRICE_PAID_COLUMNS shape (the live register or the staging
// table). Batches are the caller's; 1,000 rows × 17 params stays
// well under the wire protocol's parameter ceiling.
async function insertRecords(client, table, records, sourceDate) {
  if (records.length === 0) return;
  const width = PRICE_PAID_COLUMNS.length;
  const tuples = [];
  const params = [];
  records.forEach((record, row) => {
    tuples.push(`(${PRICE_PAID_COLUMNS.map((_, col) => `$${row * width + col + 1}`).join(",")})`);
    params.push(...recordValues(record, sourceDate));
  });
  await client.query(
    `INSERT INTO ${table}
       (transaction_id, postcode, price, sale_date, property_type, new_build,
        tenure, paon, saon, street, locality, town, county, ppd_category,
        record_status, source_name, source_date)
     VALUES ${tuples.join(", ")}`,
    params,
  );
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
// lands as exactly one row in the new category.
async function mergeUpdateRecords(client, table, records, sourceDate) {
  const upserts = records.filter((r) => r.recordStatus !== "D");
  const guids = [...new Set(records.map((r) => r.transactionId))];
  await deleteByGuids(client, table, guids);
  for (let at = 0; at < upserts.length; at += INSERT_BATCH_ROWS) {
    await insertRecords(client, table, upserts.slice(at, at + INSERT_BATCH_ROWS), sourceDate);
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
export async function stampNoSalePostcodes(client, edition) {
  const stamp = JSON.stringify({ edition, loadedAt: new Date().toISOString() });
  let stamped = 0;
  let last = "";
  for (;;) {
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
    }
    if (res.rows.length < STAMP_PAGE_ROWS) break;
  }
  return stamped;
}

// --national: one streaming pass over the full file into the
// staging table, the update merge over it, proofs against
// staging, then the swap. Returns the summary facts; the caller
// stamps and prints. fullLines/updateLines are iterables of raw
// file lines (arrays in tests and --file runs, a readline stream
// live); edition is the full file's publication date, or null to
// fall back to the newest sale date filed (the legacy loader's
// --file fallback). expectedFullBytes, when the caller knows it,
// is the full file's size in bytes as its source declared it
// (the download's Content-Length, or the file's size under
// --file): the pass reconciles the lines it actually consumed
// against that size and refuses an under-delivered source
// before anything is filed (BUG-188).
/**
 * @param {any} client
 * @param {{ fullLines: AsyncIterable<string> | Iterable<string>, updateLines: Iterable<string>, edition: string | null, verifyOnly?: boolean, expectedFullBytes?: number | null }} options
 */
export async function runNational(
  client,
  { fullLines, updateLines, edition, verifyOnly = false, expectedFullBytes = null },
) {
  const startedAt = Date.now();
  const stats = { malformed: 0, emptyPostcode: 0, duplicates: 0, uncovered: {} };
  await client.query(`DROP TABLE IF EXISTS ${STAGE_TABLE}`);
  await client.query(
    `CREATE TEMP TABLE ${STAGE_TABLE} (
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

  // 1 — the full file, every line parsed, filed in batches
  // (uncovered-area rows skipped and counted at intake, BUG-184 —
  // they are never staged). Intake keeps the reconciliation
  // tallies BUG-188 demands: the lines read, the bytes they
  // account for, and the records handed to the staging inserts.
  let batch = [];
  let linesRead = 0;
  let lineBytes = 0;
  let recordsStaged = 0;
  const flush = async () => {
    await insertRecords(client, STAGE_TABLE, batch, null);
    batch = [];
  };
  for await (const line of fullLines) {
    if (!line) continue;
    linesRead += 1;
    lineBytes += Buffer.byteLength(line);
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

  const stagedCount = async () =>
    (await client.query(`SELECT count(*)::int AS n FROM ${STAGE_TABLE}`)).rows[0].n;

  // 1b — the source-completeness guard (BUG-188): when the
  // caller declared the full file's size, the lines consumed
  // must account for exactly that many bytes — one terminator
  // per line, LF or CRLF, the final terminator present or not.
  // Anything else means the source under-delivered (or over-
  // delivered) and the register this pass would file is not the
  // register the source describes; refuse before the swap.
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

  // 1c — the staged count must equal the parsed count: a batch
  // insert that landed short is a silent hole of exactly the
  // BUG-188 shape, caught here instead of after the swap.
  const afterIntake = await stagedCount();
  if (afterIntake !== recordsStaged)
    throw new Error(
      `the national pass staged ${afterIntake} rows from ${recordsStaged} parsed records — refusing to file a register it cannot account for (BUG-188)`,
    );

  // 2 — duplicate transaction ids in the full file collapse to
  // the last row filed (the legacy loader's Map semantics), in
  // SQL: seq is insertion order, so the greatest seq survives.
  const deduped = await client.query(
    `DELETE FROM ${STAGE_TABLE} a USING ${STAGE_TABLE} b
      WHERE a.transaction_id = b.transaction_id AND a.seq < b.seq`,
  );
  stats.duplicates = deduped.rowCount ?? 0;
  const afterDedupe = await stagedCount();
  if (afterDedupe !== recordsStaged - stats.duplicates)
    throw new Error(
      `the national pass holds ${afterDedupe} staged rows after collapsing ${stats.duplicates} duplicates from ${recordsStaged} parsed records — refusing to file a register it cannot account for (BUG-188)`,
    );

  // 3 — the monthly update file merged over the staged full
  // file, by transaction id (the register's standing definition:
  // full file + monthly update, the SOURCE_NAME's own words).
  // The merge is reconciled too: staged rows whose id the update
  // names are counted before the merge, and the staged total
  // after it must be that count removed and the upserts added.
  const updateRecords = parseAllRecords(updateLines, stats);
  const updateGuids = [...new Set(updateRecords.map((r) => r.transactionId))];
  let updateMatched = 0;
  for (let at = 0; at < updateGuids.length; at += GUID_CHUNK) {
    const res = await client.query(
      `SELECT count(*)::int AS n FROM ${STAGE_TABLE} WHERE transaction_id = ANY($1)`,
      [updateGuids.slice(at, at + GUID_CHUNK)],
    );
    updateMatched += res.rows[0].n;
  }
  const merged = await mergeUpdateRecords(client, STAGE_TABLE, updateRecords, null);
  const afterMerge = await stagedCount();
  if (afterMerge !== afterDedupe - updateMatched + merged.upserted)
    throw new Error(
      `the national pass holds ${afterMerge} staged rows after the update merge (expected ${afterDedupe - updateMatched + merged.upserted}: ${afterDedupe} staged − ${updateMatched} replaced or deleted + ${merged.upserted} upserted) — refusing to file a register it cannot account for (BUG-188)`,
    );

  // 4 — the edition settles once, over the whole staged set:
  // the file's publication date when the source gave one, else
  // the newest sale date filed. One UPDATE stamps every row —
  // the national pass is one edition, exactly as a legacy load
  // stamps its whole set with its file's edition.
  let sourceDate = edition;
  if (!sourceDate) {
    const res = await client.query(`SELECT max(sale_date)::text AS newest FROM ${STAGE_TABLE}`);
    sourceDate = res.rows[0]?.newest ?? null;
  }
  if (!sourceDate) throw new Error("the full file filed no sales — nothing to swap in");
  await client.query(`UPDATE ${STAGE_TABLE} SET source_date = $1`, [sourceDate]);

  // 5 — the staging indexes: the postcode index the proofs and
  // the swap read by, and the unique transaction index, whose
  // build is itself the proof that no duplicate id survives.
  await client.query(`CREATE INDEX price_paid_stage_postcode_idx ON ${STAGE_TABLE} (postcode)`);
  await client.query(
    `CREATE UNIQUE INDEX price_paid_stage_txn_idx ON ${STAGE_TABLE} (transaction_id) WHERE transaction_id IS NOT NULL`,
  );

  // 6 — proofs against staging, before anything live moves: the
  // golden homes, and the zero-uncovered-row self-check.
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
  const total = totalRes.rows[0].n;
  if (total !== afterMerge)
    throw new Error(
      `the national pass holds ${total} staged rows at the proofs against ${afterMerge} reconciled after the update merge — refusing to file a register it cannot account for (BUG-188)`,
    );

  const seconds = () => Math.round((Date.now() - startedAt) / 1000);
  const summary = (stamped) =>
    `load-sold-prices · edition ${sourceDate} · national pass · ${total} sales filed · ${updateRecords.length} update rows merged · ${stats.malformed} malformed skipped · ${stats.duplicates} duplicates collapsed · ${stats.emptyPostcode} empty-postcode rows skipped · ${uncoveredSkipSegment(stats)} · ${stamped} no-sale postcodes stamped · ${linesRead} full-file lines read · golden homes OK · ${seconds()}s`;

  if (verifyOnly) {
    await client.query(`DROP TABLE IF EXISTS ${STAGE_TABLE}`);
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

  // 7 — the swap: one transaction. Serving reads see the old
  // register until commit and the new one after; there is no
  // moment with a half-filed register. The golden proof reads
  // the filed rows back from the live table before commit, as
  // the legacy loader proves its own filing.
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
              record_status, source_name, source_date
         FROM ${STAGE_TABLE}`,
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
    await client.query("ROLLBACK");
    throw error;
  }

  // 8 — gap 2's bulk stamp, after the swap (it reads the new
  // register to decide who filed nothing).
  const stamped = await stampNoSalePostcodes(client, sourceDate);
  await client.query(`DROP TABLE IF EXISTS ${STAGE_TABLE}`);
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

// --update: one monthly update file applied to the live
// register, edition-gated. Returns the summary facts; the
// caller stamps and prints. A refusal throws with the gate's
// reason — the caller stamps the failure before it propagates.
// Uncovered-area rows in the file are skipped and counted at
// intake (BUG-184), exactly as in the national pass: the
// monthly file carries TD rows most months, and this path never
// had an area guard — without the skip it would FILE them.
export async function runUpdate(client, { updateLines, edition, verifyOnly = false }) {
  const startedAt = Date.now();
  const stats = { malformed: 0, emptyPostcode: 0, uncovered: {} };
  const records = parseAllRecords(updateLines, stats);
  const seconds = () => Math.round((Date.now() - startedAt) / 1000);

  if (verifyOnly) {
    const upserts = records.filter((r) => r.recordStatus !== "D").length;
    return {
      edition,
      logLine: `load-sold-prices · edition ${edition} · monthly update · ${upserts} sales to add or correct · ${records.length - upserts} to delete · ${stats.malformed} malformed skipped · ${uncoveredSkipSegment(stats)} · verify only, nothing filed · ${seconds()}s`,
      applied: 0,
      deleted: 0,
      stats,
    };
  }

  const baseline = await lastAppliedEdition(client);
  const decision = decideUpdateAction(baseline, edition);
  if (decision.action === "refuse") throw new Error(decision.reason);
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
  try {
    await client.query("BEGIN");
    merged = await mergeUpdateRecords(client, "price_paid", records, edition);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  return {
    edition,
    logLine: `load-sold-prices · edition ${edition} · monthly update · ${merged.upserted} sales added or corrected · ${merged.deleted} deleted · ${stats.malformed} malformed skipped · ${stats.emptyPostcode} empty-postcode rows skipped · ${uncoveredSkipSegment(stats)} · ${seconds()}s`,
    applied: merged.upserted,
    deleted: merged.deleted,
    stats,
  };
}

// The new modes' entry: sources resolved (live downloads or a
// --file directory), the work run, the outcome stamped (gap 4 —
// success and failure alike; a verify-only run stamps nothing,
// as the legacy verify files nothing).
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
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    if (parsed.mode === "national") {
      let fullLines;
      let updateLines;
      // The full file's declared size, reconciled by the pass
      // against the lines it consumes (BUG-188): the file's byte
      // length under --file; live, the download's Content-Length
      // — taken only when the body arrives unencoded, since an
      // encoded body's length counts compressed bytes the line
      // stream never sees. Absent a usable declaration the pass
      // runs unguarded on size (its staged-count reconciliations
      // still apply).
      let expectedFullBytes = null;
      if (parsed.fileDir) {
        const fullText = await readFile(join(parsed.fileDir, "pp-complete.csv"));
        expectedFullBytes = fullText.length;
        fullLines = fullText.toString("utf8").split(/\r?\n/);
        updateLines = (await readFile(join(parsed.fileDir, "pp-monthly-update.csv"), "utf8")).split(
          /\r?\n/,
        );
      } else {
        const response = await fetch(FULL_FILE_URL);
        if (!response.ok) throw new Error(`the full file download failed: HTTP ${response.status}`);
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
        const updateResponse = await fetch(UPDATE_FILE_URL);
        if (!updateResponse.ok)
          throw new Error(`the monthly update download failed: HTTP ${updateResponse.status}`);
        updateLines = (await updateResponse.text()).split(/\r?\n/);
      }
      const result = await runNational(client, {
        fullLines,
        updateLines,
        edition: context.sourceDate,
        verifyOnly: parsed.verifyOnly,
        expectedFullBytes,
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
      const response = await fetch(UPDATE_FILE_URL);
      if (!response.ok)
        throw new Error(`the monthly update download failed: HTTP ${response.status}`);
      const lastModified = response.headers.get("last-modified");
      if (lastModified && !edition) edition = new Date(lastModified).toISOString().slice(0, 10);
      if (!edition)
        throw new Error(
          "the update file's edition could not be read (no Last-Modified header) — refusing to apply an undated update",
        );
      updateLines = (await response.text()).split(/\r?\n/);
    }
    context.sourceDate = edition;
    const result = await runUpdate(client, {
      updateLines,
      edition,
      verifyOnly: parsed.verifyOnly,
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
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileIdx = args.indexOf("--file");
  const fileDir = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const postcodes = args.filter((a, i) => !a.startsWith("--") && i !== fileIdx + 1);
  if (postcodes.length === 0)
    throw new Error('name at least one postcode, e.g. load-sold-prices -- "CM3 2JT"');
  const targets = new Set(postcodes.map((pc) => pc.trim().toUpperCase()));
  const stats = { malformed: 0, duplicates: 0 };
  let sourceDate = null;

  // 1 — the full file.
  let byGuid;
  if (fileDir) {
    const text = await readFile(join(fileDir, "pp-complete.csv"), "utf8");
    byGuid = await collectFromText(text, targets, stats);
  } else {
    const response = await fetch(FULL_FILE_URL);
    if (!response.ok) throw new Error(`the full file download failed: HTTP ${response.status}`);
    const lastModified = response.headers.get("last-modified");
    if (lastModified) sourceDate = new Date(lastModified).toISOString().slice(0, 10);
    const lines = createInterface({
      input: Readable.fromWeb(response.body),
      crlfDelay: Infinity,
    });
    byGuid = await collectFromLines(lines, targets, stats);
  }

  // 2 — the monthly update file, merged over the full file by id.
  let updateCount = 0;
  const updateText = fileDir
    ? await readFile(join(fileDir, "pp-monthly-update.csv"), "utf8")
    : await (await fetch(UPDATE_FILE_URL)).text();
  const targetList = [...targets];
  for (const line of updateText.split(/\r?\n/)) {
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
    .map(([pc, rows]) => `${pc} ${rows.length} sales`)
    .join(" · ");
  const summary = () =>
    `load-sold-prices · edition ${sourceDate} · ${counts} · ${updateCount} update rows merged · ${stats.malformed} malformed skipped · ${stats.duplicates} duplicates ignored`;

  if (verifyOnly) {
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    return;
  }

  // 3 — file it: one transaction; each postcode's set is swapped whole.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example, Key K6)");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const [pc, rows] of perPostcode) {
      await client.query("DELETE FROM price_paid WHERE postcode = $1", [pc]);
      for (const r of rows) {
        await client.query(
          `INSERT INTO price_paid
             (transaction_id, postcode, price, sale_date, property_type, new_build,
              tenure, paon, saon, street, locality, town, county, ppd_category,
              record_status, source_name, source_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            r.transactionId,
            r.postcode,
            r.price,
            r.saleDate,
            r.propertyType,
            r.newBuild,
            r.tenure,
            r.paon,
            r.saon,
            r.street,
            r.locality,
            r.town,
            r.county,
            r.ppdCategory,
            r.recordStatus,
            SOURCE_NAME,
            sourceDate,
          ],
        );
      }
    }
    // Proof: read the filed rows back from the database, pre-commit.
    const filed = new Map();
    for (const pc of targets) {
      const res = await client.query(
        `SELECT transaction_id AS "transactionId", price, sale_date AS "saleDate",
                paon, street
           FROM price_paid WHERE postcode = $1`,
        [pc],
      );
      filed.set(
        pc,
        res.rows.map((r) => ({
          ...r,
          saleDate: r.saleDate instanceof Date ? r.saleDate.toISOString().slice(0, 10) : r.saleDate,
        })),
      );
    }
    checkGolden((pc) => (targets.has(pc) ? filed.get(pc) : null), "the filed rows");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
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
