// Loader: the picking index's sales parts — the Land
// Registry Price Paid complete file's address parts,
// streamed into the picking index (plan step M7.15B;
// migration 0030; the filing machinery is shared with
// the EPC pass in picking-index-filing.mjs).
//
// Run it:
//   node loaders/load-picking-index.mjs
//     Streams pp-complete.csv from the same public
//     endpoint the sold-prices loader uses and files the
//     nation's address parts. Monthly cadence (the
//     runner's schedule): every pass is a FULL re-extract
//     — see the freshness note below.
//   node loaders/load-picking-index.mjs --file tests/fixtures/picking-index
//     Files the fixture directory's pp-complete.csv
//     instead — the test and rehearsal path.
//
// WHAT THIS FILES, AND WHAT IT NEVER DOES. The complete
// file carries ~30M transactions since 1 Jan 1995; this
// pass keeps only each transaction's address parts
// (postcode, PAON, SAON, street, town), deduped in SQL
// to the distinct homes. It writes NOTHING to
// price_paid: that table is the sold-prices brain's
// evidence, loaded on demand per postcode, and its
// rows-present state is the brain's proof of a load — a
// national fill would poison the proof and the monthly
// refresh's target list. The index this pass feeds is
// identity for picking, never evidence for an answer,
// and no brain reads it.
//
// STREAMING IS THE SHAPE, NOT AN OPTIMISATION. The
// sold-prices loader accumulates a postcode's sales in
// memory — right for one postcode, fatal for the nation
// on a ~4GB server. This pass streams line by line and
// writes the stage in batches; its only accumulation is
// one batch. Dedupe happens in SQL, not in a JS map.
//
// FRESHNESS. price_paid's monthly cadence rides the
// Registry's small update file because its rows are
// keyed by transaction id; the index holds no ids, so an
// update file's adds/changes/deletes cannot be applied
// to it safely. The index's freshness is instead a
// monthly FULL re-extract under its own schedule entry
// and timeout, proved by its DISTINCT counts: a
// re-extract whose distinct home count moves beyond
// tolerance against the filed edition is refused before
// anything swaps (picking-index-filing.mjs), and the
// picking-index canary item ages the filed editions.
//
// THE CLI TAKES NO POSTCODES — BY DESIGN. The
// sold-prices loader's argument filter drops the slot
// its --file value occupies, so a bare first postcode is
// silently never loaded. This loader's whole input is
// the nation or one fixture directory, so the trap is
// designed out: --file consumes exactly its value, and
// any other argument — a postcode included — is an
// error, never a silently dropped slot.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import pg from "pg";

import {
  fileStagedExtract,
  homeKeyForParts,
  recordRejection,
  COUNT_MOVEMENT_TOLERANCE,
} from "./picking-index-filing.mjs";
import { createProgressLogger, formatCount } from "./progress.mjs";

// The same public endpoint the sold-prices loader uses.
export const FULL_FILE_URL =
  "http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-complete.csv";

// The Price Paid record logic, copied from
// load-sold-prices.mjs (which runs its main on import —
// it has no import guard — so it cannot be imported
// from here; the loaders are standalone files and this
// is the codebase's pattern for shared register
// formats). One behavioural parity pin lives in
// tests/load-picking-index.test.ts: both parsers read
// the golden fixture to the same golden figures.
//
// Quote-aware parser for one Price Paid line (every
// field is quoted; a doubled quote inside a field is
// an escaped quote).
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

// Price Paid column order: transaction id, price, date,
// postcode, type, new build, duration, PAON, SAON,
// street, locality, town, district, county, category,
// record status.
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

// Rows per batched stage insert.
export const STAGE_BATCH_ROWS = 1000;

export const PICKING_INDEX_FILE = "pp-complete.csv";

// The golden proof, read back from the SERVED index
// after a pass: the two golden homes the fixture file
// (and the nation) must name in the register's own
// parts. E16 1GN's town is the file's own "LONDON" — the
// parts are filed as the register files them.
export const GOLDEN_PICKING_ROWS = [
  {
    postcode: "CM3 2JT",
    homeKey: "19||BIRKDALE RISE",
    paon: "19",
    saon: null,
    street: "BIRKDALE RISE",
    town: "CHELMSFORD",
  },
  {
    postcode: "E16 1GN",
    homeKey: "6||EXETER ROAD",
    paon: "6",
    saon: null,
    street: "EXETER ROAD",
    town: "LONDON",
  },
];

// Pure check over read-back rows ({ postcode: [...] }):
// every golden home present in the served index, in the
// register's parts, or an error naming what is missing.
export function verifyGoldenPickingRows(rowsByPostcode) {
  for (const golden of GOLDEN_PICKING_ROWS) {
    const rows = rowsByPostcode[golden.postcode] ?? [];
    const found = rows.some(
      (row) =>
        row.home_key === golden.homeKey &&
        (row.paon ?? null) === golden.paon &&
        (row.saon ?? null) === golden.saon &&
        (row.street ?? null) === golden.street &&
        (row.town ?? null) === golden.town,
    );
    if (!found) {
      throw new Error(
        `picking-index golden proof failed: ${golden.paon} ${golden.street} (${golden.postcode}) is not in the served index in the register's parts`,
      );
    }
  }
}

// One transaction record → the index's parts, or null
// when the row cannot name a home (no postcode, or
// neither a PAON nor a street). Empty strings file as
// null, the filed form price_paid uses.
export function partsFromRecord(record) {
  const clean = (value) => {
    const trimmed = (value ?? "").trim();
    return trimmed === "" ? null : trimmed;
  };
  const parts = {
    postcode: clean(record.postcode),
    paon: clean(record.paon),
    saon: clean(record.saon),
    street: clean(record.street),
    town: clean(record.town),
  };
  if (parts.postcode === null) return null;
  if (parts.paon === null && parts.street === null) return null;
  return parts;
}

// Stream Price Paid lines → batched stage inserts.
// `lines` is any async iterable of text lines (a file
// stream, a web stream, or a test's array); `insertBatch`
// receives arrays of stage rows. Nothing accumulates
// beyond one batch.
export async function streamPickingParts(lines, insertBatch, { progress = null } = {}) {
  let rowsRead = 0;
  let malformed = 0;
  let unusable = 0;
  let batch = [];
  for await (const line of lines) {
    if (line.trim() === "") continue;
    rowsRead += 1;
    // BUG-204: a line every 1M transactions read — the
    // staging stream is the pass's long phase, and its
    // total is the file's own line count, unknowable
    // until the stream ends, so the line carries the
    // count alone.
    if (rowsRead % 1000000 === 0) {
      progress?.count({ label: "staging", done: rowsRead, unit: "transactions" });
      // BUG-248: the staging stream is the pass's long phase —
      // a heartbeat every 10,000,000 transactions or 15
      // minutes. The 1,000-row stage inserts are too
      // fine-grained for a slow-batch watch.
      progress?.heartbeat({ stage: "staging", done: rowsRead, every: 10_000_000 });
    }
    // A CRLF source read without a CRLF-aware splitter
    // leaves the \r on the line's end, where the parser
    // would reject the line: strip it here so any line
    // source is safe.
    const fields = parsePpdLine(line.replace(/\r$/, ""));
    if (fields === null) {
      malformed += 1;
      continue;
    }
    const record = toRecord(fields);
    if (record === null) {
      // A line the register's own record validation
      // rejects (bad price or date) is counted with the
      // malformed lines: the summary prints the count,
      // so an anomalous file shows it.
      malformed += 1;
      continue;
    }
    const parts = partsFromRecord(record);
    if (parts === null) {
      unusable += 1;
      continue;
    }
    batch.push({ ...parts, homeKey: homeKeyForParts(parts) });
    if (batch.length >= STAGE_BATCH_ROWS) {
      await insertBatch(batch);
      batch = [];
    }
  }
  if (batch.length > 0) await insertBatch(batch);
  return { rowsRead, malformed, unusable };
}

// The batched stage insert for the sales stage table.
export function stageInsertFor(client) {
  return async (rows) => {
    const values = [];
    const params = [];
    rows.forEach((row, i) => {
      const base = i * 6;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
      );
      params.push(row.postcode, row.paon, row.saon, row.street, row.town, row.homeKey);
    });
    await client.query(
      `INSERT INTO picking_sales_stage (postcode, paon, saon, street, town, home_key) VALUES ${values.join(", ")}`,
      params,
    );
  };
}

// Stage a pass: truncate the stage, stream the lines
// into it. Files nothing — the stage is scratch until
// filePickingIndex swaps it in.
export async function stagePickingIndex(client, lines, { progress = null } = {}) {
  await client.query("TRUNCATE picking_sales_stage");
  return streamPickingParts(lines, stageInsertFor(client), { progress });
}

// File the staged pass: the shared tolerance proof,
// swap, union rebuild and edition record — then this
// loader's golden proof, read back from the served
// index. A refused re-extract records its refusal (so
// the canary can report it) and throws; the filed
// edition keeps serving.
export async function filePickingIndex(client, { edition, log = () => {}, progress = null }) {
  // BUG-204: the rebuild's stage markers ride the
  // caller's log when no logger is handed in.
  const progressLogger = progress ?? createProgressLogger({ name: "load-picking-index", log });
  const outcome = await fileStagedExtract(client, {
    source: "sales",
    edition,
    progress: progressLogger,
  });
  if (!outcome.filed) {
    await recordRejection(client, "sales", outcome.staged.homes);
    // BUG-248: a refusal is a failed run — one line, at the
    // tolerance proof, with no re-run to offer.
    const refusal = new Error(
      `picking index: the sales re-extract was refused — its distinct home count (${outcome.staged.homes}) moves beyond the ${COUNT_MOVEMENT_TOLERANCE * 100}% tolerance against the filed edition (${outcome.previousHomes}); the filed edition keeps serving`,
    );
    progressLogger.failed({
      stage: "tolerance proof",
      filed: 0,
      total: outcome.previousHomes ?? null,
      error: refusal,
      resume: "no re-run — the re-extract is outside tolerance; check the source file",
    });
    throw refusal;
  }
  const rowsByPostcode = {};
  try {
    for (const golden of GOLDEN_PICKING_ROWS) {
      const { rows } = await client.query(
        "SELECT postcode, paon, saon, street, town, home_key FROM picking_index WHERE postcode = $1",
        [golden.postcode],
      );
      rowsByPostcode[golden.postcode] = rows;
    }
    verifyGoldenPickingRows(rowsByPostcode);
  } catch (err) {
    // BUG-248: the proof runs after the swap has committed,
    // so the new edition is already serving — investigate
    // before any re-run.
    progressLogger.failed({
      stage: "golden proof",
      filed: outcome.counts.homes,
      total: outcome.counts.homes,
      error: err,
      resume: "the new edition is filed — investigate before re-running",
    });
    throw err;
  }
  log(
    "Golden proof: 19 Birkdale Rise (CM3 2JT) and 6 Exeter Road (E16 1GN) are in the served index in the register's own parts.",
  );
  return outcome.counts;
}

// The whole pass over a line source. `edition` names the
// source file's edition (the live file's Last-Modified
// date; "fixture" for a fixture directory).
export async function loadPickingIndexFromLines(client, lines, { edition, log }) {
  // BUG-204: one logger for the pass — the staging
  // stream's count lines and the rebuild's markers.
  const progress = createProgressLogger({ name: "load-picking-index", log });
  // BUG-248: the staging stream fails before anything is
  // filed — the stage is truncated and re-streamed on a
  // re-run. The filing phase reports its own failures
  // (tolerance proof, swap, golden proof), so it is not
  // wrapped again here.
  let stats;
  try {
    stats = await stagePickingIndex(client, lines, { progress });
  } catch (err) {
    progress.failed({
      stage: "staging",
      filed: 0,
      error: err,
      resume: "re-run the pass from the start (the stage is truncated and re-streamed)",
    });
    throw err;
  }
  const counts = await filePickingIndex(client, { edition, log, progress });
  log(
    `Picking index (sales parts) — edition ${edition}: ${formatCount(stats.rowsRead)} transactions read, ${formatCount(stats.malformed)} malformed lines skipped, ${formatCount(stats.unusable)} rows without a usable postcode or address skipped.`,
  );
  log(
    `Filed: ${formatCount(counts.postcodes)} distinct postcodes, ${formatCount(counts.homes)} distinct homes, ${formatCount(counts.streets)} distinct streets-with-town.`,
  );
  return { stats, counts };
}

async function* linesFromFile(file) {
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

async function* linesFromWeb(response) {
  const stream = Readable.fromWeb(response.body);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

// CLI: [--file <fixture directory>] and nothing else.
// Any other argument is an error — see the header on
// why no argument is ever silently dropped here.
export function parseArgs(argv) {
  let fileDir = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") {
      fileDir = argv[i + 1] ?? null;
      if (fileDir === null) {
        throw new Error("load-picking-index: --file needs a directory");
      }
      i += 1;
    } else {
      throw new Error(
        `load-picking-index: unexpected argument "${arg}" — the pass is the whole nation, or one --file fixture directory; it takes no postcodes`,
      );
    }
  }
  return { fileDir };
}

// The fixture-directory pass: read the directory's
// pp-complete.csv as a stream and file it. Exported so
// the specs drive the exact path the runner's fixture
// pass runs.
export async function loadPickingIndexFromFile(client, fileDir, { log }) {
  const file = path.join(fileDir, PICKING_INDEX_FILE);
  if (!fs.existsSync(file)) {
    throw new Error(`load-picking-index: no ${PICKING_INDEX_FILE} in ${fileDir}`);
  }
  return loadPickingIndexFromLines(client, linesFromFile(file), {
    edition: "fixture",
    log,
  });
}

export async function loadPickingIndex({ fileDir = null, log = console.log } = {}) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    if (fileDir !== null) {
      return await loadPickingIndexFromFile(client, fileDir, { log });
    }
    const response = await fetch(FULL_FILE_URL);
    if (!response.ok || response.body === null) {
      throw new Error(
        `load-picking-index: the Price Paid complete file could not be fetched (HTTP ${response.status})`,
      );
    }
    const edition = response.headers.get("last-modified") ?? new Date().toISOString().slice(0, 10);
    return await loadPickingIndexFromLines(client, linesFromWeb(response), {
      edition,
      log,
    });
  } finally {
    client.release();
    await pool.end();
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedAsScript) {
  loadPickingIndex(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
