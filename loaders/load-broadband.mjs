// Ofcom Connected Nations — fixed broadband coverage by postcode,
// filed into postcode_cache.answers under the "broadband" key:
//
//   load-broadband — Ofcom's Connected Nations fixed coverage
//   release (snapshot January 2026 at build), Open Government
//   Licence. The release ZIP is DISCOVERED from Ofcom's publication
//   page on every run — never a hardcoded filename (plan M5.9,
//   gap G12: the Spring 2026 postcode files were re-issued mid-cycle
//   from r1 to r2 after two area files duplicated others; a loader
//   pinned to r1 would have filed the wrong data without a murmur).
//   Inside the ZIP, the all-premises postcode files are nested
//   under 202601_fixed_pc_coverage/postcode_files_r<N>/ with
//   basenames <snapshot>_fixed_pc_coverage_r<N>_<area>.csv; those
//   are the filed set. The residential-only series under
//   postcode_res_files_r<N>/ is deliberately not filed.
//
// What is filed, per postcode, exactly as published (gap G6):
// the gigabit-capable percentage is the headline figure; alongside
// it the superfast (30 Mbit/s), ultrafast (100 and 300 Mbit/s) and
// NGA percentages, the unable-to-receive percentages (2/5/10/30
// Mbit/s and "decent" from fixed or FWA), the decent-via-FWA
// percentage, and the maximum-speed band shares. Ofcom publishes
// PERCENTAGES ONLY at postcode level — no premise counts — and no
// full-fibre percentage and no fastest-speed field at this level
// (commercial confidentiality, per Ofcom's own notes); nothing here
// invents them. Every figure carries the release snapshot month.
//
// ACCESS NOTE (build, 13 Nov 2026): ofcom.org.uk returns HTTP 403
// to this build sandbox and to the M5.9 prep sandbox (Cloudflare).
// This loader is built against Ofcom's published file documentation
// ("About this data — fixed coverage", Spring 2026, v2) with
// format-faithful fixtures; its live-pull proof is OUTSTANDING and
// runs on the founder's machine (the PHI precedent, M5.3). The
// header contract below names the documented columns and, on any
// mismatch, fails with the file's actual headers in the message so
// the first real pull is self-diagnosing. --file mode files a
// downloaded release without touching ofcom.org.uk.
//
// Filing is the answers pattern (like load-crime / load-epc):
// every postcode's answer is staged into broadband_stage and
// merged into postcode_cache.answers; postcodes the new release
// no longer carries lose their stale key. A failed load never
// overwrites the last good copy.
//
// BUG-191 (23 Nov 2026): the first national filing held the whole
// release in memory (the ~1.74M parsed rows in one array) and ran
// the merge inside ONE transaction that stayed open for 7+ hours,
// queueing other loaders' completion stamps behind its locks.
// The read now streams — files are parsed record by record off
// read streams and handed to the filer in batches — and the
// filing runs in bounded transactions throughout: staging
// inserts batch by batch, the merge in postcode chunks (each
// chunk marks the staged rows it merged, so a re-run re-enters
// cleanly), and the stale-key sweep last, in cursor-bounded
// chunks, only once the whole release has merged. Postcodes are
// independent units: a failure mid-merge leaves every postcode
// holding either its whole old answer or its whole new one, and
// a re-run completes the merge and only then sweeps stale keys.
//
// Modes:
//   node loaders/load-broadband.mjs                  discover + file
//   node loaders/load-broadband.mjs --verify-only    discover +
//     structural checks, files nothing
//   node loaders/load-broadband.mjs --file <dir>     file a local
//     release folder: release.json plus real-shaped all-premises
//     postcode entries at any depth below it.
//
// Exits non-zero on any failure and prints
// "load-broadband FAILED: …" to stderr.

import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import pg from "pg";
import yauzl from "yauzl";

const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";

export const PUBLICATION_PAGE =
  process.env.OFCOM_CN_PAGE ??
  "https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/connected-nations-update-spring-2026";
export const SOURCE_NAME = "Ofcom Connected Nations — fixed broadband coverage";
export const ANSWER_KEY = "broadband";

// Documented postcode-file columns (Ofcom, "About this data — fixed
// coverage", Spring 2026 v2), normalised for matching: lowercase,
// whitespace collapsed. The two ultrafast columns are distinguished
// in the document by their descriptions: "(100Mbit/s)" is 100, the
// bare "UFBB availability" is 300.
const COL = {
  postcode: "postcode_space",
  superfast: "sfbb availability (% premises)",
  ultrafast100: "ufbb (100mbit/s) availability (% premises)",
  ultrafast300: "ufbb availability (% premises)",
  gigabit: "gigabit availability (% premises)",
  nga: "% of premises with nga",
  unable2: "% of premises unable to receive 2mbit/s",
  unable5: "% of premises unable to receive 5mbit/s",
  unable10: "% of premises unable to receive 10mbit/s",
  unable30: "% of premises unable to receive 30mbit/s",
  unableDecent: "% of premises unable to receive decent broadband from fixed or fwa",
  decentFwa: "% of premises able to receive decent broadband from fwa",
  bandLt2: "% of premises with 0<2mbit/s download speed",
  band2to5: "% of premises with 2<5mbit/s download speed",
  band5to10: "% of premises with 5<10mbit/s download speed",
  band10to30: "% of premises with 10<30mbit/s download speed",
  band30to300: "% of premises with 30<300mbit/s download speed",
  band300Plus: "% of premises with >=300mbit/s download speed",
};

const normaliseHeader = (h) => h.replace(/\s+/g, " ").trim().toLowerCase();

// The CSV record parser, incremental (BUG-191): push text in as
// it arrives off a read stream and take the records it completes;
// finish() flushes the trailing record. Chunk boundaries can fall
// anywhere — inside a quoted field, between the two quotes of an
// escaped quote, between the \r and \n of a CRLF — so the parser
// carries three one-character uncertainties across pushes: a
// closing quote that might be an escape (pendingQuote), a \r that
// might be half of a CRLF (pendingCR), and the BOM, skipped only
// as the very first character. csvRecords below runs the same
// machine over a whole string, so the streamed and one-shot reads
// can never drift apart.
export function createCsvParser() {
  let field = "";
  let record = [];
  let inQuotes = false;
  let pendingQuote = false;
  let pendingCR = false;
  let started = false;
  const emit = (out) => {
    record.push(field);
    field = "";
    out.push(record);
    record = [];
  };
  return {
    push(text) {
      const out = [];
      let i = 0;
      if (!started && text.length > 0) {
        started = true;
        if (text.charCodeAt(0) === 0xfeff) i = 1;
      }
      for (; i < text.length; i++) {
        const c = text[i];
        if (pendingCR) {
          pendingCR = false;
          if (c === "\n") continue;
        }
        if (pendingQuote) {
          pendingQuote = false;
          if (c === '"') {
            field += '"';
            continue;
          }
          inQuotes = false;
        }
        if (inQuotes) {
          if (c === '"') pendingQuote = true;
          else field += c;
        } else if (c === '"') {
          inQuotes = true;
        } else if (c === ",") {
          record.push(field);
          field = "";
        } else if (c === "\n") {
          emit(out);
        } else if (c === "\r") {
          emit(out);
          pendingCR = true;
        } else field += c;
      }
      return out;
    },
    finish() {
      const out = [];
      pendingQuote = false;
      pendingCR = false;
      if (field !== "" || record.length > 0) emit(out);
      return out;
    },
  };
}

export function* csvRecords(text) {
  const parser = createCsvParser();
  yield* parser.push(text);
  yield* parser.finish();
}

const pct = (raw, postcode, field) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`broadband: ${field} "${raw}" for ${postcode} is not a percentage`);
  }
  return n;
};

// The header contract of one postcode-area file: the documented
// columns must all be present (normalised for matching); on any
// mismatch the error names the file's actual headers so a real
// pull is self-diagnosing.
function postcodeCsvHeader(headerRecord) {
  const header = headerRecord.map(normaliseHeader);
  const index = new Map(header.map((h, i) => [h, i]));
  for (const name of Object.values(COL)) {
    if (!index.has(name)) {
      throw new Error(
        `broadband: missing column "${name}"; file headers: ${headerRecord.join(" | ")}`,
      );
    }
  }
  return index;
}

// One data record -> one answer row (null for the blank-line
// record a trailing newline leaves behind). Speed-band rule
// (Ofcom, "About this data — fixed broadband coverage and full
// fibre take-up 2026", v2): each band is the percentage of ALL
// premises in the postcode whose maximum download speed falls in
// that range. Premises that could not be matched to at least one
// provider record with a non-zero predicted speed are
// UNCLASSIFIED — they count in the denominator but sit in no
// band — so the six bands legitimately sum to LESS than 100, the
// shortfall is the postcode's unclassified share, and a sum of
// exactly 0 is the legitimate limiting case (no matched
// premises). Only a sum OVER 100 (beyond a small rounding
// tolerance) signals a mis-mapped column; every single band is
// separately held to [0, 100] by pct().
function answerRowFromRecord(rec, index, release) {
  if (rec.length === 1 && rec[0] === "") return null;
  const get = (r, name) => r[index.get(name)];
  const postcode = get(rec, COL.postcode).trim().toUpperCase();
  if (!/^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/.test(postcode)) {
    throw new Error(`broadband: unexpected postcode "${postcode}"`);
  }
  const bands = {
    under_2: pct(get(rec, COL.bandLt2), postcode, "band 0<2"),
    "2_to_5": pct(get(rec, COL.band2to5), postcode, "band 2<5"),
    "5_to_10": pct(get(rec, COL.band5to10), postcode, "band 5<10"),
    "10_to_30": pct(get(rec, COL.band10to30), postcode, "band 10<30"),
    "30_to_300": pct(get(rec, COL.band30to300), postcode, "band 30<300"),
    "300_plus": pct(get(rec, COL.band300Plus), postcode, "band >=300"),
  };
  const bandSum = Object.values(bands).reduce((a, b) => a + b, 0);
  // Bands are shares of all premises and may sum below 100 (the
  // shortfall is the unclassified share — see the rule above);
  // only a sum over 100, beyond a small rounding tolerance,
  // means a column is mis-mapped.
  if (bandSum > 100.5) {
    throw new Error(
      `broadband: speed bands for ${postcode} sum to ${bandSum}, over 100 — a column is mis-mapped (bands are shares of all premises; a sum below 100 is legitimate, the shortfall being the unclassified share of unmatched / zero-predicted-speed premises — Ofcom, "About this data — fixed broadband coverage and full fibre take-up 2026")`,
    );
  }
  return {
    postcode,
    answer: {
      basis: "All premises",
      snapshot: release.snapshotLabel,
      gigabit_capable_pct: pct(get(rec, COL.gigabit), postcode, "gigabit"),
      superfast_30_pct: pct(get(rec, COL.superfast), postcode, "superfast"),
      ultrafast_100_pct: pct(get(rec, COL.ultrafast100), postcode, "ultrafast 100"),
      ultrafast_300_pct: pct(get(rec, COL.ultrafast300), postcode, "ultrafast 300"),
      nga_pct: pct(get(rec, COL.nga), postcode, "NGA"),
      unable_2_pct: pct(get(rec, COL.unable2), postcode, "unable 2"),
      unable_5_pct: pct(get(rec, COL.unable5), postcode, "unable 5"),
      unable_10_pct: pct(get(rec, COL.unable10), postcode, "unable 10"),
      unable_30_pct: pct(get(rec, COL.unable30), postcode, "unable 30"),
      unable_decent_fixed_or_fwa_pct: pct(get(rec, COL.unableDecent), postcode, "unable decent"),
      decent_via_fwa_pct: pct(get(rec, COL.decentFwa), postcode, "decent via FWA"),
      speed_band_pct: bands,
    },
  };
}

// Parse one postcode-area CSV into answer rows (the one-shot
// form; the streaming read below runs the same header contract
// and row builder record by record).
export function parsePostcodeCsv(text, release) {
  const records = [...csvRecords(text)];
  if (records.length < 2) throw new Error("broadband: postcode file has no rows");
  const index = postcodeCsvHeader(records[0]);
  const rows = [];
  for (const rec of records.slice(1)) {
    const row = answerRowFromRecord(rec, index, release);
    if (row) rows.push(row);
  }
  return rows;
}

// The golden postcodes (D10) — structural checks only. No coverage
// figure for any postcode is asserted anywhere in this loader: none
// has been measured (Ofcom 403, see the header note), and inventing
// one would poison the golden set.
export const GOLDEN_POSTCODES = ["CM3 2JT", "E16 1GN", "KT17 1FH"];
const GOLDEN_SET = new Set(GOLDEN_POSTCODES);

export function structuralChecks(rows, { full }) {
  const problems = [];
  if (full && rows.length < 1_000_000) {
    problems.push(`only ${rows.length} postcode rows — a national release carries ~1.74M`);
  }
  const byPostcode = new Map(rows.map((r) => [r.postcode, r]));
  if (byPostcode.size !== rows.length) problems.push("duplicate postcodes in the release");
  for (const pc of GOLDEN_POSTCODES) {
    if (!byPostcode.has(pc)) problems.push(`golden postcode ${pc} missing from the release`);
  }
  if (problems.length > 0) {
    throw new Error(`structural checks failed:\n  - ${problems.join("\n  - ")}`);
  }
}

// The same checks over a streamed read's accumulated scalars:
// the parsed count, the duplicate count (parsed minus staged —
// the staging insert's ON CONFLICT DO NOTHING is the duplicate
// detector, so no postcode set is ever held), and the golden
// postcodes seen on the way past. Problem strings are identical
// to the array form's, so the failure reads the same either way.
export function structuralCheckStats({ parsed, duplicates, goldensSeen }, { full }) {
  const problems = [];
  if (full && parsed < 1_000_000) {
    problems.push(`only ${parsed} postcode rows — a national release carries ~1.74M`);
  }
  if (duplicates > 0) problems.push("duplicate postcodes in the release");
  for (const pc of GOLDEN_POSTCODES) {
    if (!goldensSeen.has(pc)) problems.push(`golden postcode ${pc} missing from the release`);
  }
  if (problems.length > 0) {
    throw new Error(`structural checks failed:\n  - ${problems.join("\n  - ")}`);
  }
}

// --- filing --------------------------------------------------------------

// The bounds (BUG-191): rows per staging transaction, postcodes
// per merge transaction, cache postcodes scanned per stale-sweep
// transaction. Nothing in the filing ever holds a transaction
// open across more than one bound.
const STAGE_CHUNK = 500;
const MERGE_CHUNK = 5000;
const SWEEP_CHUNK = 5000;

// One merge chunk: the next MERGE_CHUNK unmerged staged rows,
// marked merged and written into the directory's answers in the
// same statement, so the mark and the merge can never disagree.
// The answer carries its own snapshot; the row's source stamps
// stay the postcode directory's (the crime/EPC pattern).
const MERGE_CHUNK_SQL = `
  WITH batch AS (
    SELECT postcode, answer FROM broadband_stage
    WHERE NOT merged ORDER BY postcode LIMIT $1
  ),
  marked AS (
    UPDATE broadband_stage s SET merged = true
    FROM batch b WHERE s.postcode = b.postcode
    RETURNING s.postcode
  )
  UPDATE postcode_cache SET answers = answers || jsonb_build_object('broadband', b.answer)
  FROM batch b WHERE postcode_cache.postcode = b.postcode`;

const SWEEP_SCAN_SQL = `
  SELECT postcode FROM postcode_cache
  WHERE answers ? 'broadband' AND postcode > $1
  ORDER BY postcode LIMIT $2`;

const SWEEP_DELETE_SQL = `
  UPDATE postcode_cache SET answers = answers - 'broadband'
  WHERE postcode = ANY($1::text[])
    AND postcode NOT IN (SELECT postcode FROM broadband_stage)`;

// The streaming filer (BUG-191, the BUG-187 flood shape):
// beginFiling state lives in a session TEMP staging table — no
// ON COMMIT DROP, so it survives across the filer's bounded
// transactions on this one client — stageItems inserts each
// batch in its own transaction, finishFiling merges in bounded
// chunks and only then sweeps stale keys, and abortFiling drops
// the stage leaving the live table exactly as it was. The stage
// is rebuilt from scratch by every run, so a re-run after a
// failure anywhere simply starts again; the merge steps are
// idempotent (the same answer written again), and the sweep is
// unreachable until the merge has completed in full.
export async function createBroadbandFiler(client) {
  async function transact(work) {
    await client.query("BEGIN");
    try {
      const result = await work();
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }
  await transact(async () => {
    await client.query("DROP TABLE IF EXISTS broadband_stage");
    await client.query(`CREATE TEMP TABLE broadband_stage (
        postcode text PRIMARY KEY, answer jsonb NOT NULL, merged boolean NOT NULL DEFAULT false
      )`);
  });
  let pending = [];
  let offered = 0;
  let staged = 0;
  async function flushPending() {
    while (pending.length > 0) {
      const chunk = pending.slice(0, STAGE_CHUNK);
      pending = pending.slice(STAGE_CHUNK);
      const values = [];
      const params = [];
      chunk.forEach((r, j) => {
        const b = j * 2;
        values.push(`($${b + 1}, $${b + 2}::jsonb)`);
        params.push(r.postcode, JSON.stringify(r.answer));
      });
      const res = await transact(() =>
        client.query(
          `INSERT INTO broadband_stage (postcode, answer) VALUES ${values.join(", ")} ON CONFLICT (postcode) DO NOTHING`,
          params,
        ),
      );
      staged += res.rowCount ?? 0;
    }
  }
  return {
    offeredCount: () => offered,
    stagedCount: () => staged,
    async stageItems(rows) {
      offered += rows.length;
      pending.push(...rows);
      if (pending.length >= STAGE_CHUNK) await flushPending();
    },
    async finishFiling() {
      await flushPending();
      let updated = 0;
      const chunks = Math.ceil(staged / MERGE_CHUNK);
      for (let i = 0; i < chunks; i++) {
        updated += await transact(async () => {
          const res = await client.query(MERGE_CHUNK_SQL, [MERGE_CHUNK]);
          return res.rowCount ?? 0;
        });
      }
      // The stale-key sweep — only here, after the whole release
      // has merged. The scan walks the directory in postcode
      // order; each bounded batch deletes in its own transaction,
      // under the same NOT IN (stage) predicate as ever.
      let cursor = "";
      for (;;) {
        const { rows: batch } = await client.query(SWEEP_SCAN_SQL, [cursor, SWEEP_CHUNK]);
        if (batch.length === 0) break;
        cursor = batch[batch.length - 1].postcode;
        await transact(() => client.query(SWEEP_DELETE_SQL, [batch.map((r) => r.postcode)]));
        if (batch.length < SWEEP_CHUNK) break;
      }
      await client.query("DROP TABLE IF EXISTS broadband_stage");
      return updated;
    },
    async abortFiling() {
      await client.query("ROLLBACK").catch(() => {});
      await client.query("DROP TABLE IF EXISTS broadband_stage").catch(() => {});
    },
  };
}

// The batch form over the streaming filer (the BUG-187 defences
// precedent): file an already-collected rows array.
export async function fileBroadband(client, rows) {
  const filer = await createBroadbandFiler(client);
  try {
    await filer.stageItems(rows);
    return await filer.finishFiling();
  } catch (err) {
    await filer.abortFiling();
    throw err;
  }
}

async function fetchRetry(url, { binary = false } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
      if (res.status === 403) {
        throw new Error(
          `Ofcom returned HTTP 403 for ${url.split("?")[0]} — this network is blocked by Ofcom's Cloudflare (known; the live pull runs from an unblocked network or via --file)`,
        );
      }
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`${url} returned HTTP ${res.status}`);
      }
      lastError = new Error(`${url} returned HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (/returned HTTP|HTTP 403/.test(err.message)) throw err;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
  }
  throw lastError;
}

// Resolve the current release's ZIPs from the publication page.
// Returns {fixedZipUrl, mobileZipUrl} — either may be null if the
// page does not link it (the caller decides whether that is fatal).
export async function discoverReleaseZips(pageUrl = PUBLICATION_PAGE) {
  const html = await fetchRetry(pageUrl);
  const hrefs = [...html.matchAll(/href="([^"]+\.zip(?:\?[^"]*)?)"/gi)].map((m) => m[1]);
  const absolute = hrefs.map((h) => new URL(h, pageUrl).toString());
  const fixed = absolute.find((u) => /fixed/i.test(u) && /broadband/i.test(u));
  const mobile = absolute.find((u) => /mobile/i.test(u));
  return { fixedZipUrl: fixed ?? null, mobileZipUrl: mobile ?? null };
}

function listZipEntryNames(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const names = [];
      zip.readEntry();
      zip.on("entry", (entry) => {
        names.push(entry.fileName);
        zip.readEntry();
      });
      zip.on("end", () => resolve(names));
      zip.on("error", reject);
    });
  });
}

// Stream the matching entries' decoded text, one entry at a time:
// handle(name, textStream) is awaited before the next entry is
// read, so only one entry's text is ever in flight.
function streamZipEntries(buffer, predicate, handle) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (!predicate(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          handle(entry.fileName, stream).then(() => zip.readEntry(), reject);
        });
      });
      zip.on("end", () => resolve());
      zip.on("error", reject);
    });
  });
}

// Ofcom abbreviates "postcode" to "pc" in the real file names.
// Requiring _r<N> immediately after "coverage" is load-bearing:
// the residential series is _fixed_pc_coverage_res_r<N>_<area>.csv
// and must never match this all-premises pattern.
export const POSTCODE_FILE = /_fixed_pc_coverage_r(\d+)_([A-Z]+)\.csv$/i;

export function releaseFromNames(names) {
  const first = names[0]?.split(/[\\/]/).pop();
  const match = first?.match(/^(\d{6})_/);
  if (!match) throw new Error(`broadband: cannot read a snapshot from "${first}"`);
  const yyyymm = match[1];
  const snapshot = `${yyyymm.slice(0, 4)}-${yyyymm.slice(4)}`;
  const rev = names.map((n) => n.match(POSTCODE_FILE)?.[1]).filter(Boolean);
  return {
    snapshot,
    snapshotLabel: snapshot,
    sourceDate: `${snapshot}-01`,
    revision: rev.length ? `r${Math.max(...rev.map(Number))}` : null,
  };
}

// Rows are handed to the sink in batches of this size as they are
// parsed — the read side's only retained state is the batch in
// flight plus the stats scalars.
const ROW_BATCH = 1000;

// One postcode file's feed: decoded text in, answer rows out via
// emit, record by record. The first record is the header (the
// contract above); a file with fewer than two records is the
// no-rows failure, exactly as the one-shot parse reads it.
function createFileRowFeeder(release, emit) {
  const parser = createCsvParser();
  let index = null;
  let recordsSeen = 0;
  let batch = [];
  async function handleRecords(records) {
    for (const rec of records) {
      recordsSeen += 1;
      if (index === null) {
        index = postcodeCsvHeader(rec);
        continue;
      }
      const row = answerRowFromRecord(rec, index, release);
      if (row) {
        batch.push(row);
        if (batch.length >= ROW_BATCH) {
          const ready = batch;
          batch = [];
          await emit(ready);
        }
      }
    }
  }
  return {
    async pushText(text) {
      await handleRecords(parser.push(text));
    },
    async endFile() {
      await handleRecords(parser.finish());
      if (recordsSeen < 2) throw new Error("broadband: postcode file has no rows");
      if (batch.length > 0) {
        const ready = batch;
        batch = [];
        await emit(ready);
      }
    },
  };
}

// Stream a release's answer rows: from a local folder (--file) or
// by discovery + download (live). onRows, when given, receives
// each batch as it is parsed (the filer's stageItems in a filing
// run); the return carries the release and the read's accumulated
// stats — the parsed count, the golden postcodes seen, and, only
// when trackPostcodes is set (verify-only, which has no staging
// insert to detect duplicates with), the postcode set. A filing
// run never sets it: the whole release is never held in memory.
export async function streamBroadbandRows({ fileDir = null, trackPostcodes = false } = {}, onRows) {
  const stats = { parsed: 0, goldensSeen: new Set(), postcodes: trackPostcodes ? new Set() : null };
  const emit = async (batch) => {
    stats.parsed += batch.length;
    for (const row of batch) {
      if (GOLDEN_SET.has(row.postcode)) stats.goldensSeen.add(row.postcode);
      if (stats.postcodes) stats.postcodes.add(row.postcode);
    }
    if (onRows) await onRows(batch);
  };
  let release;
  if (fileDir) {
    release = JSON.parse(await readFile(join(fileDir, "release.json"), "utf8"));
    const paths = [];
    const walk = async (dir) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && POSTCODE_FILE.test(entry.name)) paths.push(path);
      }
    };
    await walk(fileDir);
    if (paths.length === 0) throw new Error(`broadband: no postcode files in ${fileDir}`);
    for (const path of paths) {
      const feeder = createFileRowFeeder(release, emit);
      const decoder = new StringDecoder("utf8");
      for await (const chunk of createReadStream(path, { highWaterMark: 1 << 20 })) {
        const text = decoder.write(chunk);
        if (text) await feeder.pushText(text);
      }
      const rest = decoder.end();
      if (rest) await feeder.pushText(rest);
      await feeder.endFile();
    }
  } else {
    const { fixedZipUrl } = await discoverReleaseZips();
    if (!fixedZipUrl) {
      throw new Error("broadband: no fixed-broadband ZIP linked from the publication page");
    }
    const buffer = await fetchRetry(fixedZipUrl, { binary: true });
    const names = await listZipEntryNames(buffer);
    const matched = names.filter((name) => POSTCODE_FILE.test(name));
    if (matched.length === 0) throw new Error("broadband: the release ZIP holds no postcode files");
    release = releaseFromNames(matched.map((k) => k.split("/").pop()));
    await streamZipEntries(
      buffer,
      (name) => POSTCODE_FILE.test(name),
      async (_name, stream) => {
        const feeder = createFileRowFeeder(release, emit);
        const decoder = new StringDecoder("utf8");
        for await (const chunk of stream) {
          const text = decoder.write(chunk);
          if (text) await feeder.pushText(text);
        }
        const rest = decoder.end();
        if (rest) await feeder.pushText(rest);
        await feeder.endFile();
      },
    );
  }
  return { release, stats };
}

// Load a release into answer rows: the collecting form over the
// streaming read (the BUG-187 defences precedent — small inputs
// and tests only; the filing run streams).
export async function loadBroadbandRows({ fileDir = null } = {}) {
  const rows = [];
  const { release } = await streamBroadbandRows({ fileDir }, async (batch) => {
    rows.push(...batch);
  });
  return { release, rows };
}

async function run() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fileDir = fileAt >= 0 ? args[fileAt + 1] : null;
  if (fileAt >= 0 && !fileDir) throw new Error("--file needs a directory");

  if (verifyOnly) {
    const { release, stats } = await streamBroadbandRows({ fileDir, trackPostcodes: true });
    structuralCheckStats(
      {
        parsed: stats.parsed,
        duplicates: stats.parsed - stats.postcodes.size,
        goldensSeen: stats.goldensSeen,
      },
      { full: !fileDir },
    );
    console.log(
      `load-broadband · Connected Nations ${release.snapshotLabel}${release.revision ? ` (${release.revision})` : ""} · ${stats.parsed.toLocaleString("en-GB")} postcodes — structural checks OK (verify-only, nothing filed)`,
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    try {
      const filer = await createBroadbandFiler(client);
      let streamed;
      try {
        streamed = await streamBroadbandRows({ fileDir }, (batch) => filer.stageItems(batch));
        structuralCheckStats(
          {
            parsed: streamed.stats.parsed,
            duplicates: streamed.stats.parsed - filer.stagedCount(),
            goldensSeen: streamed.stats.goldensSeen,
          },
          { full: !fileDir },
        );
      } catch (err) {
        await filer.abortFiling();
        throw err;
      }
      let updated;
      try {
        updated = await filer.finishFiling();
      } catch (err) {
        await filer.abortFiling();
        throw err;
      }
      const { release, stats } = streamed;
      console.log(
        `load-broadband · Connected Nations ${release.snapshotLabel}${release.revision ? ` (${release.revision})` : ""} · ${stats.parsed.toLocaleString("en-GB")} postcodes — ${updated.toLocaleString("en-GB")} answers filed`,
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  run().catch((err) => {
    console.error(`load-broadband FAILED: ${err.message}`);
    process.exit(1);
  });
}
