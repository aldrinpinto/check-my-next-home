// LSOA Census base totals loader — ONS via Nomis bulk
// downloads (plan step M5.16, gap G5; founder ruling Q5).
//
// Files the two LSOA-level Census 2021 totals the benefits
// report block (M8.1(c)) states and divides by — TS021's
// total (all usual residents) and TS054's total (all
// households) — into lsoa_bases (migration 0013). M5.8
// filed the Census at MSOA grain deliberately, so until
// this loader no filed fact sized an LSOA: the block's
// header ("the small area containing this home — [name],
// 625 households, 1,489 residents") and the
// households-on-UC share both read these two numbers.
//
// The source is the one the census loader already trusts:
// the same two keyless Nomis bulk zips, whose LSOA CSVs sit
// beside the MSOA ones load-census reads (Open Government
// Licence v3.0; no registration, no key). Only the Total
// column of each file files — the category detail lives at
// MSOA grain in census_stats and is not duplicated here.
//
// A ONE-OFF, static load like the census itself (the
// runner's static class): Census Day 2021-03-21 is every
// row's source_date. England and Wales only — the LSOA
// files hold exactly the 35,672 E&W LSOAs; Scotland and
// Northern Ireland have no LSOA codes and no rows, and
// serving prints their named not-covered state.
//
// All-or-nothing, like load-census: both files parse and
// validate (identical coverage, agreeing names, the golden
// totals exact) before anything files, and the swap is one
// transaction.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import yauzl from "yauzl";
import { formatCount } from "./progress.mjs";

const { Pool } = pg;

export const SOURCE_NAME = "ONS Census 2021 via Nomis (bulk download)";
// Census Day — the reference date of every figure.
export const SOURCE_DATE = "2021-03-21";
export const BULK_BASE = "https://www.nomisweb.co.uk/output/census/2021";
export const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";
export const LSOA_COUNT = 35672;

// The two datasets and the exact published header of each
// file's Total column — the header is the contract, as in
// load-census: a re-issue that renames the total fails the
// load loudly rather than filing a neighbouring column.
export const BASE_DATASETS = [
  { code: "ts021", totalHeader: "Ethnic group: Total: All usual residents", field: "residents" },
  { code: "ts054", totalHeader: "Tenure of household: Total: All households", field: "households" },
];

// The three universal golden homes' LSOAs — measured from
// the live bulk files at the build's first pull (13 Nov
// 2026), the same pull the fixture was cut from.
export const GOLDEN = {
  E01021395: { name: "Braintree 018C", residents: 1489, households: 625 },
  E01003511: { name: "Newham 036A", residents: 1923, households: 671 },
  E01030396: { name: "Epsom and Ewell 010D", residents: 2487, households: 852 },
};

// --- CSV parsing ----------------------------------------------
// (A local copy of load-census's quote-aware parser — each
// loader in this codebase is self-contained.)

export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\ufeff/, ""); // strips a BOM if the file carries one
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

// Parse one dataset's LSOA CSV into code → { name, total },
// asserting the header contract exactly.
export function parseLsoaCsv(text, dataset) {
  const rows = parseCsvText(text);
  if (rows.length < 2) throw new Error(`${dataset.code}: the LSOA CSV is empty`);
  const header = rows[0].map((h) => h.trim());
  const nameAt = header.indexOf("geography");
  const codeAt = header.indexOf("geography code");
  const totalAt = header.indexOf(dataset.totalHeader);
  if (nameAt === -1 || codeAt === -1)
    throw new Error(`${dataset.code}: the LSOA CSV has no geography / geography code columns`);
  if (totalAt === -1)
    throw new Error(
      `${dataset.code}: the LSOA CSV carries no "${dataset.totalHeader}" column — the shape changed (the header is the contract)`,
    );
  const areas = new Map();
  for (const row of rows.slice(1)) {
    const code = (row[codeAt] ?? "").trim();
    if (!/^[EW]01\d{6}$/.test(code))
      throw new Error(
        `${dataset.code}: a row's geography code is "${code}" — not a 2021 LSOA code`,
      );
    if (areas.has(code)) throw new Error(`${dataset.code}: ${code} appears twice`);
    const raw = (row[totalAt] ?? "").trim();
    if (!/^\d+$/.test(raw))
      throw new Error(
        `${dataset.code}: the total for ${code} is "${raw}" — not a published non-negative integer`,
      );
    areas.set(code, { name: (row[nameAt] ?? "").trim(), total: Number(raw) });
  }
  return areas;
}

// Merge the two parsed totals into filing rows. Both files
// must cover exactly the same LSOAs and agree on each
// area's published name — a partial base set never files.
export function buildRows(parsedByCode) {
  const [first, second] = BASE_DATASETS;
  const a = parsedByCode.get(first.code);
  const b = parsedByCode.get(second.code);
  if (!a || !b) throw new Error("both base datasets must be parsed before rows are built");
  if (a.size !== b.size)
    throw new Error(
      `the datasets disagree on coverage: ${first.code} holds ${a.size} areas, ${second.code} holds ${b.size} — a partial base set must never file`,
    );
  const rows = [];
  for (const [code, areaA] of a) {
    const areaB = b.get(code);
    if (!areaB)
      throw new Error(
        `the datasets disagree on coverage: ${code} is in ${first.code} but not in ${second.code}`,
      );
    if (areaA.name !== areaB.name)
      throw new Error(
        `${code}: the area name disagrees between datasets ("${areaA.name}" vs "${areaB.name}")`,
      );
    rows.push({
      lsoaCode: code,
      lsoaName: areaA.name,
      [first.field]: areaA.total,
      [second.field]: areaB.total,
    });
  }
  return rows.sort((x, y) => (x.lsoaCode < y.lsoaCode ? -1 : 1));
}

export function goldenChecks(rows, { full }) {
  const failures = [];
  const byCode = new Map(rows.map((r) => [r.lsoaCode, r]));
  for (const [code, golden] of Object.entries(GOLDEN)) {
    const row = byCode.get(code);
    if (!row) {
      failures.push(`${code} (${golden.name}) is missing from the load`);
      continue;
    }
    if (row.lsoaName !== golden.name)
      failures.push(`${code}: filed name "${row.lsoaName}", expected "${golden.name}"`);
    if (row.residents !== golden.residents)
      failures.push(`${golden.name}: residents is ${row.residents}, expected ${golden.residents}`);
    if (row.households !== golden.households)
      failures.push(
        `${golden.name}: households is ${row.households}, expected ${golden.households}`,
      );
  }
  if (full && rows.length !== LSOA_COUNT)
    failures.push(`the load holds ${rows.length} areas, expected exactly ${LSOA_COUNT} LSOAs`);
  return failures;
}

// --- filing -----------------------------------------------------
//
// Stage-table swap — the house pattern, one transaction
// (BEGIN before the ON COMMIT DROP stage create; the column
// names are migration 0013's own, pinned by the
// schema-contract tests).

export async function fileLsoaBases(pool, rows, retrievedAt) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE lsoa_bases_stage (
      lsoa_code text, lsoa_name text, residents integer, households integer,
      source_name text, source_date date
    ) ON COMMIT DROP`);
    const values = [];
    const params = [];
    const flush = async () => {
      if (values.length === 0) return;
      await client.query(
        `INSERT INTO lsoa_bases_stage (lsoa_code, lsoa_name, residents, households, source_name, source_date) VALUES ${values.join(", ")}`,
        params,
      );
      values.length = 0;
      params.length = 0;
    };
    for (const row of rows) {
      const base = params.length;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
      );
      params.push(
        row.lsoaCode,
        row.lsoaName,
        row.residents,
        row.households,
        SOURCE_NAME,
        SOURCE_DATE,
      );
      if (values.length >= 500) await flush();
    }
    await flush();
    await client.query("DELETE FROM lsoa_bases");
    await client.query(
      `INSERT INTO lsoa_bases (lsoa_code, lsoa_name, residents, households, source_name, source_date, loaded_at)
       SELECT lsoa_code, lsoa_name, residents, households, source_name, source_date, $1 FROM lsoa_bases_stage`,
      [retrievedAt],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// --- sources ----------------------------------------------------

export function zipUrl(code) {
  return `${BULK_BASE}/census2021-${code}.zip`;
}

async function fetchRetry(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (response.status >= 500 || response.status === 429)
        throw new Error(`HTTP ${response.status}`);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastError;
}

// The LSOA CSV out of one bulk zip buffer.
export function readLsoaCsvFromZip(buffer, code) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      let settled = false;
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (entry.fileName.split("/").pop()?.toLowerCase() !== `census2021-${code}-lsoa.csv`)
          return zip.readEntry();
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const chunks = [];
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", () => {
            settled = true;
            resolve(Buffer.concat(chunks).toString("utf8"));
          });
          stream.on("error", reject);
        });
      });
      zip.on("error", reject);
      zip.on("end", () => {
        if (!settled)
          reject(new Error(`the ${code} bulk zip holds no census2021-${code}-lsoa.csv entry`));
      });
    });
  });
}

async function downloadDatasetCsv(code) {
  const response = await fetchRetry(zipUrl(code));
  const buffer = Buffer.from(await response.arrayBuffer());
  return readLsoaCsvFromZip(buffer, code);
}

// One dataset from a local folder: the loose LSOA CSV (the
// fixture's layout), or the founder-downloaded bulk zip.
export function readDatasetFromDir(dir, code) {
  const csvPath = join(dir, `census2021-${code}-lsoa.csv`);
  if (existsSync(csvPath)) return Promise.resolve(readFileSync(csvPath, "utf8"));
  const zipPath = join(dir, `census2021-${code}.zip`);
  if (existsSync(zipPath)) return readLsoaCsvFromZip(readFileSync(zipPath), code);
  return Promise.reject(
    new Error(
      `${dir} holds neither census2021-${code}-lsoa.csv nor census2021-${code}.zip — both datasets must be present (the load is all-or-nothing)`,
    ),
  );
}

export async function loadLsoaBaseRows(source) {
  const parsedByCode = new Map();
  for (const dataset of BASE_DATASETS) {
    const text =
      source.kind === "dir"
        ? await readDatasetFromDir(source.dir, dataset.code)
        : await downloadDatasetCsv(dataset.code);
    parsedByCode.set(dataset.code, parseLsoaCsv(text, dataset));
  }
  return { rows: buildRows(parsedByCode) };
}

function summaryLine(rows, filed) {
  return (
    `load-lsoa-bases · 2 census totals (TS021 residents, TS054 households) · ${formatCount(rows.length)} areas ${filed ? "filed" : "would file"} ` +
    `(Census Day 21 March 2021)`
  );
}

const DEFAULT_FIXTURE_DIR = fileURLToPath(
  new URL("../../tests/fixtures/lsoa-bases/", import.meta.url),
);

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const fixtureMode = fileArg !== null;
  const verifyOnly = args.includes("--verify-only");
  const source = fixtureMode
    ? { kind: "dir", dir: fileArg ?? DEFAULT_FIXTURE_DIR }
    : { kind: "live" };
  const { rows } = await loadLsoaBaseRows(source);
  const golden = goldenChecks(rows, { full: !fixtureMode });
  if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);
  if (verifyOnly) {
    console.log(`${summaryLine(rows, false)} — golden areas OK (verify-only: nothing filed)`);
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await fileLsoaBases(pool, rows, new Date().toISOString());
  } finally {
    await pool.end();
  }
  console.log(`${summaryLine(rows, true)} — golden areas OK`);
}

// Run only as a script (run-loaders / npm), never on import.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(`load-lsoa-bases FAILED: ${err.message}`);
    process.exit(1);
  });
}
