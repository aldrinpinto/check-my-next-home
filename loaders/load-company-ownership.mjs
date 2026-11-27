// Company ownership loader — HM Land Registry CCOD /
// OCOD + Companies House snapshots (plan step M5.13;
// founder rulings Q1–Q7 of the M5.13 gap check, 13 Nov
// 2026, recorded as decision D15; built ahead of the
// written clause-3.2 answer under decision D18,
// 14 Nov 2026).
//
// WHAT IT FILES. Two monthly FULL snapshots from HM
// Land Registry's "Use land and property data" service —
// CCOD (UK companies that own property in England and
// Wales, ~4.49M titles) and OCOD (overseas companies,
// ~91k titles) — into company_titles (migration 0016),
// and, for the company numbers those titles carry, the
// five published snapshot fields (name, status,
// incorporation date, SIC codes, registered office) from
// Companies House's Free Company Data Product (monthly
// bulk snapshot, OGL v3.0, no key) into
// company_snapshots. Each dataset's rows are replaced
// WHOLESALE every pass (full-file replacement, never the
// change-only files): a title sold to an individual, or
// a company corrected out of the datasets, drops out
// instead of lingering.
//
// THE FLAG. This loader files data as PREPARATION only.
// COMPANY_OWNERSHIP_ENABLED (lib/site.ts) defaults to
// false: while it is false nothing user-facing reads
// these tables. It stays off until HM Land Registry Data
// Services' written clause-3.2 answer permits this use
// AND the founder gives the go (decision D18). If the
// written answer is no, the founder alone decides the
// kill — this loader never deletes on its own.
//
// THE LICENCE SHAPE (decision D15). CCOD/OCOD are NOT
// open data: they are free under HM Land Registry's
// bespoke, revocable licence. Its clause 3.2 restricts
// the datasets' address fields (they derive from Royal
// Mail / Ordnance Survey address data, and we hold no
// PSGA licence) — so the register address text filed
// here is a MATCH KEY ONLY: it is never displayed, never
// published, never served; the address on screen is
// always the buyer's own input. Attribution wherever
// this information is used: "Information produced by HM
// Land Registry © Crown copyright [year]". The licence's
// operating obligations (End-User Records, audit access,
// deletion within 48 hours of a termination) are product
// requirements recorded in decision D15 — the
// full-replacement shape of these tables is what makes
// the deletion obligation a drop, not a clean-up.
// Depth boundary (D15): no officers, no persons with
// significant control, no parent-company inference, no
// charges — the snapshot is the five published fields
// and nothing behind them.
//
// THE ANSWER SHAPE THIS DATA FEEDS (M6.13 owns serving;
// recorded here so the filing never drifts from it): the
// headline answers the home's OWN title; a company-held
// building freehold is a separate labelled line in
// report depth only (a flat's leasehold title and its
// building's freehold are different titles — the golden
// set proves the distinction, below). A No names its
// holes: charities are excluded from both datasets by
// category, roughly a tenth of England and Wales is
// unregistered land no dataset can see, and the register
// lags (a transfer files only after registration
// completes and the next monthly file lands — every
// figure carries its dataset month for exactly this
// reason, which the licence also requires).
//
// SNAPSHOT HOLES ARE NAMED, NEVER FILLED. The Companies
// House bulk product holds LIVE companies only, keyed by
// its own company-number forms. A filed title whose
// company number is absent from the product — a
// dissolved proprietor, or a number the product keys
// differently (the golden set's registered society,
// below) — files NO snapshot row, and serving names the
// missing-snapshot state. The loader never repairs the
// join by name-matching, and never invents a profile.
// The Companies House API key (K24) that could fetch
// dissolved profiles is NOT taken (decision D15 as
// built). Titles whose register row records no company
// number at all ("where available" — most overseas
// proprietors) are the second named state, counted in
// every run's output.
//
// GOLDEN SAMPLE-CHECK — RUN AT THIS BUILD, 14 Nov 2026,
// from the real November 2026 files (the prep could not
// run it: the downloads are account-gated). Locked as
// GOLDEN below and asserted on every pass whose edition
// is the locked one:
//   19 Birkdale Rise, CM3 2JT — in NEITHER dataset: a
//   clean No, against a NON-EMPTY CCOD slice for the
//   postcode (2 rows: SAGE HOMES RP LIMITED's titles over
//   other Birkdale Rise houses) — the lookup provably
//   ran. OCOD holds no CM3 2JT row.
//   6 Exeter Road, E16 1GN — no row in either dataset at
//   the postcode; a street-name search of both full
//   files found company titles only at 8 Exeter Road
//   (Evan House, E16 1GP — a different building). A No
//   on the own title and at building level.
//   Flat 4, Minerva House, KT17 1FH — no own-title row
//   in either dataset (a No), AND the building-level
//   fact: OCOD title SY876459, "Flats 1-9 Minerva House,
//   12 Ceres Crescent, Epsom (KT17 1FH)", Freehold,
//   proprietor ADRIATIC LAND 11 LIMITED, incorporated in
//   GUERNSEY, no company number recorded — the separate
//   building-freehold line, with the no-number snapshot
//   state, from real data.
//   Snapshots: 11217910 (SAGE HOMES RP LIMITED) and
//   13678133 (SOMY RESIDENTIAL LIMITED) are in the
//   Companies House product, fields asserted exactly.
//   7686 (CLARION HOUSING ASSOCIATION LIMITED, as filed
//   on its Juno House titles) is NOT: the product keys
//   that society RS007686 — the named number-not-in-the-
//   snapshot state, measured, not hypothetical.
//
// PARSE DISCIPLINE. The header is the contract: a
// renamed or dropped consumed column fails the load
// loudly, naming the column. A row whose field count
// differs from the header's, or whose tenure, price or
// proprietor-added date is not in the published shape,
// files NOTHING and is counted BY NAME (title number
// where readable) in the run output — measured on the
// November 2026 files: exactly one such row in each
// dataset (a trailing malformed record in each). A
// reject count above the bound fails the dataset's load
// — a shape change, not noise. Postcodes are the file's
// own column, normalised; a postcode not in UK form
// files as NULL (the row's address text remains the
// match material) and is counted by class. Validation
// runs as a full pre-pass before anything files (the
// schema's load-stamp-then-swap rule): a failed load
// never overwrites the last good copy.
//
// ACQUISITION. --file <dir> reads a local set: ccod.csv /
// ocod.csv / companies-house.csv (plain CSVs — the
// fixture shape), or the downloaded zips themselves
// (CCOD_FULL_*.zip, OCOD_FULL_*.zip,
// BasicCompanyDataAsOneFile-*.zip), or a mix; a
// manifest.json in the directory names the editions
// (the fixture carries one), otherwise the edition is
// read from the FULL file names. Live mode is the
// OPERATOR mode: it shells to the Land Registry
// connector helper (lrdata.py — the only key path; no
// credential ever appears in this repo, its fixtures,
// its tests or its logs) for the dataset metadata and
// the signed-URL downloads, and downloads the Companies
// House snapshot from download.companieshouse.gov.uk
// directly (no key exists to protect). The helper path
// defaults to this workspace's connector beside the
// repo and is overridden with CMNH_LRDATA_HELPER —
// at M12 the VPS holds the founder's key in its own
// connector install. Every downloaded zip is verified
// (it must open, and its CSV must be the size the
// metadata publishes) BEFORE it parses: on a constrained
// network the helper's single-connection download can be
// cut short (measured at this build: repeated cuts at
// ~316 MB of the CCOD file from this sandbox; the build's
// own pull used a resumable chunked fetch through the
// same helper's API calls), and a truncated file fails
// the load loudly — a partial edition never files.
//
// Run it (DATABASE_URL from .env, Key K6):
//   npm run load:company-ownership               operator (live) pass
//   npm run load:company-ownership -- --verify-only
//   node loaders/load-company-ownership.mjs --file tests/fixtures/company-ownership

import { execFile } from "node:child_process";
import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import yauzl from "yauzl";
import pg from "pg";
import { createLoaderResume } from "./loader-resume.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

const { Pool } = pg;

export const CCOD_SOURCE_NAME =
  "HM Land Registry — UK companies that own property in England and Wales (CCOD)";
export const OCOD_SOURCE_NAME =
  "HM Land Registry — Overseas companies that own property in England and Wales (OCOD)";
export const CH_SOURCE_NAME = "Companies House — Free Company Data Product";
export const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";
export const GOLDEN_POSTCODES = ["CM3 2JT", "E16 1GN", "KT17 1FH"];
// The reject bound: the measured malformed-row rate is
// one row per file; anything beyond half a percent of a
// dataset is a shape change, not noise.
export const REJECT_BOUND = 0.005;

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
export const DEFAULT_HELPER = join(
  REPO_ROOT,
  "..",
  "custom-connectors",
  "custom.land-registry-data",
  "bin",
  "lrdata.py",
);

// --- the locked golden record (see the header) ----------------

export const GOLDEN = {
  edition: "2026-11",
  // The Birkdale street slice: the two CCOD titles over
  // OTHER Birkdale Rise houses. Their presence is the
  // proof the lookup ran; 19 Birkdale Rise is in neither.
  birkdaleTitles: [
    { titleNumber: "AA53500", proprietorName: "SAGE HOMES RP LIMITED", companyNumber: "11217910" },
    { titleNumber: "AA53502", proprietorName: "SAGE HOMES RP LIMITED", companyNumber: "11217910" },
  ],
  // Minerva House's building freehold (OCOD): the
  // separate building-level line for Flat 4.
  minervaFreehold: {
    titleNumber: "SY876459",
    tenure: "Freehold",
    propertyAddress: "Flats 1-9 Minerva House, 12 Ceres Crescent, Epsom (KT17 1FH)",
    proprietorName: "ADRIATIC LAND 11 LIMITED",
    companyNumber: null,
    countryIncorporated: "GUERNSEY",
  },
  snapshots: {
    11217910: {
      companyName: "SAGE HOMES RP LIMITED",
      status: "Active",
      incorporationDate: "2018-02-21",
      sicText: "68201 - Renting and operating of Housing Association real estate",
    },
    13678133: {
      companyName: "SOMY RESIDENTIAL LIMITED",
      status: "Active",
      incorporationDate: "2021-10-13",
      sicText: "68209 - Other letting and operating of own or leased real estate",
    },
  },
  // As filed on the Juno House titles; the bulk product
  // holds no row under it (it keys the society RS007686).
  missingByNumber: "7686",
};

// --- CSV parsing ------------------------------------------------
// (A local streaming copy of the house parser — each
// loader in this codebase is self-contained. Handles
// quoted fields with embedded commas, quotes and
// newlines, across chunk boundaries.)

export async function* parseCsv(stream) {
  let field = "";
  let row = [];
  let inQuotes = false;
  let fieldStarted = false;
  let firstChar = true;
  let pending = "";
  const decoder = new StringDecoder("utf8");
  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const process = function* (text, isFinal) {
    // A closing-or-escaped quote as the very last character
    // of a chunk cannot be told apart from its pair — hold
    // it back for the next chunk (UTF-8 splits are the
    // decoder's business; this one is the parser's).
    if (!isFinal && text.endsWith('"') && inQuotes) {
      pending = '"';
      text = text.slice(0, -1);
    } else pending = "";
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (firstChar) {
        firstChar = false;
        if (ch === "\ufeff") continue;
      }
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
        fieldStarted = true;
      } else if (ch === ",") {
        endField();
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i += 1;
        endField();
        if (row.length > 1 || row[0] !== "") yield row;
        row = [];
      } else {
        field += ch;
        fieldStarted = true;
      }
    }
  };
  for await (const chunk of stream) {
    const text = pending + (typeof chunk === "string" ? chunk : decoder.write(chunk));
    yield* process(text, false);
  }
  const tail = pending + decoder.end();
  if (tail !== "") yield* process(tail, true);
  if (fieldStarted || row.length > 0) {
    endField();
    if (row.length > 1 || row[0] !== "") yield row;
  }
}

// Open a CSV or a ZIP holding one CSV, as a text stream.
// ZIPs are read with yauzl (the house zip reader): the
// archive must open — a truncated download has no
// central directory and fails here, before any parsing.
export function openCsvStream(path) {
  if (/\.zip$/i.test(path)) {
    const zipPromise = new Promise((resolve, reject) => {
      yauzl.open(path, { lazyEntries: true }, (err, zip) => (err ? reject(err) : resolve(zip)));
    });
    const stream = new Readable({ read() {} });
    (async () => {
      try {
        const zip = await zipPromise;
        zip.on("entry", (entry) => {
          if (!/\.csv$/i.test(entry.fileName)) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (err, entryStream) => {
            if (err) {
              stream.destroy(err);
              return;
            }
            entryStream.on("data", (d) => stream.push(d));
            entryStream.on("end", () => stream.push(null));
            entryStream.on("error", (e) => stream.destroy(e));
          });
        });
        zip.on("end", () => {});
        zip.on("error", (e) => stream.destroy(e));
        zip.readEntry();
      } catch (err) {
        stream.destroy(err);
      }
    })();
    return stream;
  }
  return createReadStream(path, { encoding: "utf8" });
}

// --- title rows ---------------------------------------------------
//
// The columns this loader consumes — the header contract.
// A Land Registry re-issue that renames or drops one fails
// the load loudly here, naming the column. CCOD and OCOD
// share every consumed column except the country, which
// only OCOD publishes (one per proprietor slot; slot 1 is
// consumed, as the row's lead proprietor is slot 1's).

export const TITLE_COLUMNS = [
  "Title Number",
  "Tenure",
  "Property Address",
  "District",
  "County",
  "Region",
  "Postcode",
  "Multiple Address Indicator",
  "Price Paid",
  "Proprietor Name (1)",
  "Company Registration No. (1)",
  "Proprietorship Category (1)",
  "Date Proprietor Added",
  "Additional Proprietor Indicator",
];
export const OCOD_EXTRA_COLUMNS = ["Country Incorporated (1)"];

const POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]? [0-9][A-Z]{2}$/;

export function normalisePostcode(raw) {
  const norm = (raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (norm === "") return { postcode: null, dropped: false };
  if (POSTCODE_RE.test(norm)) return { postcode: norm, dropped: false };
  return { postcode: null, dropped: true };
}

function parseUkDate(raw, label) {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  const m = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) throw new Error(`${label} "${value}" is not in the published DD-MM-YYYY shape`);
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCDate() !== Number(m[1]) ||
    d.getUTCMonth() + 1 !== Number(m[2])
  )
    throw new Error(`${label} "${value}" is not a real date`);
  return iso;
}

function parseYesNo(raw, label) {
  const value = (raw ?? "").trim().toUpperCase();
  if (value === "Y") return true;
  if (value === "N") return false;
  throw new Error(`${label} "${raw}" is not the published Y/N`);
}

// Validate one raw title row into its filing shape.
// Throws (with the reason) on any shape break — the
// collector turns a throw into a named reject.
export function parseTitleRow(row, at, dataset) {
  const get = (col) => (row[at[col]] ?? "").trim();
  const titleNumber = get("Title Number");
  if (titleNumber === "") throw new Error("the Title Number is blank");
  const tenure = get("Tenure");
  if (tenure !== "Freehold" && tenure !== "Leasehold")
    throw new Error(`Tenure "${tenure}" is not Freehold or Leasehold`);
  const propertyAddress = get("Property Address");
  if (propertyAddress === "") throw new Error("the Property Address is blank");
  // The lead proprietor is the first non-blank slot —
  // slot 1 in every measured row; the scan keeps the
  // row honest if a file ever leads with a later slot.
  let proprietorName = "";
  let companyNumber = null;
  let category = null;
  let country = null;
  for (let slot = 1; slot <= 4; slot += 1) {
    const nameCol = `Proprietor Name (${slot})`;
    if (at[nameCol] === undefined) break;
    const name = get(nameCol);
    if (name === "") continue;
    proprietorName = name;
    const num = get(`Company Registration No. (${slot})`);
    companyNumber = num === "" ? null : num;
    const cat = get(`Proprietorship Category (${slot})`);
    category = cat === "" ? null : cat;
    if (dataset === "ocod") {
      const c = get(`Country Incorporated (${slot})`);
      country = c === "" ? null : c;
    }
    break;
  }
  if (proprietorName === "") throw new Error("no proprietor name in any slot");
  const priceRaw = get("Price Paid");
  let pricePaid = null;
  if (priceRaw !== "") {
    if (!/^\d+$/.test(priceRaw))
      throw new Error(`Price Paid "${priceRaw}" is not a whole-pounds figure`);
    pricePaid = Number(priceRaw);
  }
  const { postcode, dropped } = normalisePostcode(get("Postcode"));
  return {
    titleNumber,
    dataset,
    tenure,
    propertyAddress,
    district: get("District") || null,
    county: get("County") || null,
    region: get("Region") || null,
    postcode,
    postcodeDropped: dropped,
    multipleAddressIndicator: parseYesNo(
      get("Multiple Address Indicator"),
      "Multiple Address Indicator",
    ),
    pricePaid,
    proprietorName,
    companyNumber,
    proprietorshipCategory: category,
    countryIncorporated: country,
    dateProprietorAdded: parseUkDate(get("Date Proprietor Added"), "Date Proprietor Added"),
    additionalProprietorIndicator: parseYesNo(
      get("Additional Proprietor Indicator"),
      "Additional Proprietor Indicator",
    ),
  };
}

// Stream one dataset file: validate every row, hand good
// rows to onRow, and collect the rejects BY NAME plus the
// golden-postcode rows. Pure over the stream — the tests
// run this on the fixture files.
//
// BUG-368: skipGood skips offering the first N good rows
// to onRow (the filing pass's resume: the checkpointed
// prefix is already staged, so it is validated but not
// re-offered). Skipped rows still count in stats.filed and
// still feed the numbers/golden tallies, so the pass's
// stats are identical with or without a skip.
/**
 * @param {any} stream
 * @param {string} dataset
 * @param {((row: any) => unknown) | null} onRow
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, skipGood?: number }} [options]
 */
export async function collectTitles(
  stream,
  dataset,
  onRow,
  { progress = null, skipGood = 0 } = {},
) {
  const stats = {
    dataset,
    rows: 0,
    filed: 0,
    skipped: 0,
    rejects: [],
    rejectCount: 0,
    postcodeDropped: 0,
    noNumber: 0,
    numbers: new Set(),
    goldenRows: [],
  };
  // BUG-265: the validation pass streams the whole
  // register — a line every 100,000 rows, a heartbeat
  // every 500,000. No total is known until the file ends,
  // so no percentage is shown.
  const validateTally = progress?.tally({
    label: `validate ${dataset}`,
    every: 100000,
    unit: "rows",
  });
  let header = null;
  let at = null;
  let line = 0;
  for await (const row of parseCsv(stream)) {
    if (header === null) {
      header = row.map((h) => h.trim());
      at = {};
      const wanted = dataset === "ocod" ? [...TITLE_COLUMNS, ...OCOD_EXTRA_COLUMNS] : TITLE_COLUMNS;
      for (let slot = 2; slot <= 4; slot += 1) {
        wanted.push(
          `Proprietor Name (${slot})`,
          `Company Registration No. (${slot})`,
          `Proprietorship Category (${slot})`,
        );
        if (dataset === "ocod") wanted.push(`Country Incorporated (${slot})`);
      }
      for (const col of wanted) {
        at[col] = header.indexOf(col);
        if (at[col] === -1)
          throw new Error(
            `the ${dataset.toUpperCase()} file carries no "${col}" column — the shape changed (the header is the contract)`,
          );
      }
      continue;
    }
    line += 1;
    stats.rows += 1;
    validateTally?.tick(stats.rows);
    progress?.heartbeat({ stage: `validate ${dataset}`, done: stats.rows, every: 500000 });
    if (row.length !== header.length) {
      stats.rejectCount += 1;
      if (stats.rejects.length < 50)
        stats.rejects.push(
          `${(row[0] ?? "").trim() || `line ${line}`}: the row carries ${row.length} fields against the header's ${header.length}`,
        );
      continue;
    }
    let parsed;
    try {
      parsed = parseTitleRow(row, at, dataset);
    } catch (err) {
      stats.rejectCount += 1;
      if (stats.rejects.length < 50)
        stats.rejects.push(`${(row[0] ?? "").trim() || `line ${line}`}: ${err.message}`);
      continue;
    }
    stats.filed += 1;
    if (parsed.postcodeDropped) stats.postcodeDropped += 1;
    if (parsed.companyNumber === null) stats.noNumber += 1;
    else stats.numbers.add(parsed.companyNumber);
    if (parsed.postcode !== null && GOLDEN_POSTCODES.includes(parsed.postcode))
      stats.goldenRows.push(parsed);
    // BUG-368: the resume skip — the row is validated and
    // tallied, but not re-offered: its staged copy stands.
    if (stats.skipped < skipGood) {
      stats.skipped += 1;
      continue;
    }
    if (onRow) await onRow(parsed);
  }
  if (header === null) throw new Error(`the ${dataset.toUpperCase()} file is empty`);
  if (stats.rows === 0) throw new Error(`the ${dataset.toUpperCase()} file carries no data rows`);
  validateTally?.finish(stats.rows);
  if (stats.rejectCount > Math.max(10, stats.rows * REJECT_BOUND))
    throw new Error(
      `the ${dataset.toUpperCase()} file rejected ${stats.rejectCount} of ${stats.rows} rows — beyond the malformed-row bound (a shape change, not noise)`,
    );
  return stats;
}

// --- Companies House snapshots ------------------------------------
//
// The Free Company Data Product's consumed columns. Its
// header pads some names with leading spaces — the
// contract matches the trimmed names, as filed.

export const CH_COLUMNS = [
  "CompanyName",
  "CompanyNumber",
  "RegAddress.CareOf",
  "RegAddress.POBox",
  "RegAddress.AddressLine1",
  "RegAddress.AddressLine2",
  "RegAddress.PostTown",
  "RegAddress.County",
  "RegAddress.Country",
  "RegAddress.PostCode",
  "CompanyStatus",
  "IncorporationDate",
  "SICCode.SicText_1",
  "SICCode.SicText_2",
  "SICCode.SicText_3",
  "SICCode.SicText_4",
];

export function parseSnapshotRow(row, at) {
  const get = (col) => (row[at[col]] ?? "").trim();
  const companyNumber = get("CompanyNumber");
  if (companyNumber === "") throw new Error("the CompanyNumber is blank");
  const incRaw = get("IncorporationDate");
  let incorporationDate = null;
  if (incRaw !== "") {
    const m = incRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m)
      throw new Error(`IncorporationDate "${incRaw}" is not in the published DD/MM/YYYY shape`);
    incorporationDate = `${m[3]}-${m[2]}-${m[1]}`;
  }
  const sicCodes = [1, 2, 3, 4].map((k) => get(`SICCode.SicText_${k}`)).filter((s) => s !== "");
  const officeParts = [
    get("RegAddress.CareOf"),
    get("RegAddress.POBox"),
    get("RegAddress.AddressLine1"),
    get("RegAddress.AddressLine2"),
    get("RegAddress.PostTown"),
    get("RegAddress.County"),
    get("RegAddress.Country"),
    get("RegAddress.PostCode"),
  ].filter((s) => s !== "");
  return {
    companyNumber,
    companyName: get("CompanyName"),
    status: get("CompanyStatus") || null,
    incorporationDate,
    sicCodes,
    registeredOffice: officeParts.length > 0 ? officeParts.join(", ") : null,
  };
}

// Stream the Companies House product once, keeping only
// the rows whose number is wanted (the filed titles'
// numbers, or an explicit set). Malformed rows in an
// UNWANTED company are not this loader's business; a
// malformed wanted row fails loudly — a snapshot we
// meant to file must never silently thin.
/**
 * @param {any} stream
 * @param {Set<string>} wanted
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export async function collectSnapshots(stream, wanted, { progress = null } = {}) {
  const found = new Map();
  let header = null;
  let at = null;
  let rows = 0;
  // BUG-265: the snapshot scan streams the whole product —
  // a line every 100,000 rows, a heartbeat every 500,000.
  // No total is known until the file ends, so no
  // percentage is shown.
  const scanTally = progress?.tally({ label: "scan snapshots", every: 100000, unit: "rows" });
  for await (const row of parseCsv(stream)) {
    if (header === null) {
      header = row.map((h) => h.trim());
      at = {};
      for (const col of CH_COLUMNS) {
        at[col] = header.indexOf(col);
        if (at[col] === -1)
          throw new Error(
            `the Companies House file carries no "${col}" column — the shape changed (the header is the contract)`,
          );
      }
      continue;
    }
    rows += 1;
    scanTally?.tick(rows);
    progress?.heartbeat({ stage: "scan snapshots", done: rows, every: 500000 });
    if (row.length !== header.length) continue;
    const num = (row[at.CompanyNumber] ?? "").trim();
    if (!wanted.has(num)) continue;
    const parsed = parseSnapshotRow(row, at);
    if (found.has(parsed.companyNumber))
      throw new Error(
        `company ${parsed.companyNumber} appears twice in the Companies House snapshot`,
      );
    found.set(parsed.companyNumber, parsed);
  }
  if (header === null) throw new Error("the Companies House file is empty");
  scanTally?.finish(rows);
  return { found, rows };
}

// --- golden checks --------------------------------------------------
//
// Asserted on the collected golden-postcode rows and the
// golden companies' snapshots. For the locked edition
// the figures are EXACT (the register facts measured at
// the build); for a later edition the checks assert the
// structural truths a silent parse drift would break —
// the slices parsed, 19 Birkdale Rise still files
// nothing, Minerva House's building title still stands
// with a company proprietor — and a golden fact that has
// genuinely changed fails loudly for a human to re-lock,
// never silently.

export function goldenChecks({ ccodGolden, ocodGolden, snapshots, edition }) {
  const failures = [];
  const exact = edition === GOLDEN.edition;
  const allGolden = [...ccodGolden, ...ocodGolden];
  const byTitle = new Map(allGolden.map((r) => [`${r.dataset}:${r.titleNumber}`, r]));

  // Birkdale: the street's company titles are present
  // (the lookup ran) and 19 Birkdale Rise files nothing.
  const birkdaleRows = allGolden.filter((r) => r.postcode === "CM3 2JT");
  if (birkdaleRows.length === 0)
    failures.push("CM3 2JT: the golden slice is empty — the lookup cannot be proven to have run");
  for (const row of birkdaleRows) {
    // 19 as a discrete number token (a house number, or
    // the end of a range like 17-19) in the part of the
    // address before the street name — "49" or "119"
    // must not trip it, "19" and "17-19" must.
    const head = row.propertyAddress.split(/Birkdale Rise/i)[0] ?? "";
    if (
      row.propertyAddress.toUpperCase().includes("BIRKDALE RISE") &&
      /(?:^|\D)19(?:\D|$)/.test(head)
    )
      failures.push(
        `CM3 2JT: title ${row.titleNumber} names 19 Birkdale Rise — the negative control broke`,
      );
  }
  if (exact) {
    for (const g of GOLDEN.birkdaleTitles) {
      const row = byTitle.get(`ccod:${g.titleNumber}`);
      if (!row)
        failures.push(`CM3 2JT: golden title ${g.titleNumber} is missing from the CCOD slice`);
      else {
        if (row.proprietorName !== g.proprietorName)
          failures.push(
            `${g.titleNumber}: proprietor "${row.proprietorName}", expected "${g.proprietorName}"`,
          );
        if (row.companyNumber !== g.companyNumber)
          failures.push(
            `${g.titleNumber}: company number "${row.companyNumber}", expected "${g.companyNumber}"`,
          );
      }
    }
  }

  // Exeter Road: no row in either dataset at the postcode.
  const exeterRows = allGolden.filter((r) => r.postcode === "E16 1GN");
  if (exeterRows.length > 0)
    failures.push(
      `E16 1GN: ${exeterRows.length} golden-slice row(s) where the locked record holds none (${exeterRows.map((r) => r.titleNumber).join(", ")}) — re-check and re-lock deliberately if the register has genuinely changed`,
    );

  // Minerva House: no own-title row for Flat 4, and the
  // building freehold stands in OCOD.
  const minervaRows = allGolden.filter((r) =>
    r.propertyAddress.toUpperCase().includes("MINERVA HOUSE"),
  );
  for (const row of minervaRows) {
    if (/FLAT 4,?\s+MINERVA HOUSE/i.test(row.propertyAddress))
      failures.push(
        `KT17 1FH: title ${row.titleNumber} names Flat 4, Minerva House as its own title — the locked record holds no own-title row for the flat`,
      );
  }
  const freehold = byTitle.get(`ocod:${GOLDEN.minervaFreehold.titleNumber}`);
  if (!freehold)
    failures.push(
      `KT17 1FH: the Minerva House building title ${GOLDEN.minervaFreehold.titleNumber} is missing from the OCOD slice`,
    );
  else if (exact) {
    const g = GOLDEN.minervaFreehold;
    if (freehold.propertyAddress !== g.propertyAddress)
      failures.push(
        `SY876459: address "${freehold.propertyAddress}", expected "${g.propertyAddress}"`,
      );
    if (freehold.proprietorName !== g.proprietorName)
      failures.push(
        `SY876459: proprietor "${freehold.proprietorName}", expected "${g.proprietorName}"`,
      );
    if (freehold.companyNumber !== g.companyNumber)
      failures.push(`SY876459: company number "${freehold.companyNumber}", expected none recorded`);
    if (freehold.countryIncorporated !== g.countryIncorporated)
      failures.push(
        `SY876459: country "${freehold.countryIncorporated}", expected "${g.countryIncorporated}"`,
      );
    if (freehold.tenure !== g.tenure)
      failures.push(`SY876459: tenure "${freehold.tenure}", expected "${g.tenure}"`);
  } else if (freehold.proprietorName === "") {
    failures.push("KT17 1FH: the Minerva House building title carries no proprietor");
  }

  // Snapshots: the two golden companies exactly (locked
  // edition), and the society's filed number absent.
  if (exact) {
    for (const [num, g] of Object.entries(GOLDEN.snapshots)) {
      const snap = snapshots.get(num);
      if (!snap) {
        failures.push(
          `company ${num} (${g.companyName}) has no snapshot in the Companies House extract`,
        );
        continue;
      }
      if (snap.companyName !== g.companyName)
        failures.push(
          `company ${num}: snapshot name "${snap.companyName}", expected "${g.companyName}"`,
        );
      if (snap.status !== g.status)
        failures.push(`company ${num}: snapshot status "${snap.status}", expected "${g.status}"`);
      if (snap.incorporationDate !== g.incorporationDate)
        failures.push(
          `company ${num}: incorporated "${snap.incorporationDate}", expected "${g.incorporationDate}"`,
        );
      if (!snap.sicCodes.includes(g.sicText))
        failures.push(
          `company ${num}: SIC codes [${snap.sicCodes.join("; ")}] do not include "${g.sicText}"`,
        );
    }
  }
  if (snapshots.has(GOLDEN.missingByNumber))
    failures.push(
      `company ${GOLDEN.missingByNumber} unexpectedly HAS a snapshot — the register/product keying changed; re-check the missing-snapshot state deliberately`,
    );
  return failures;
}

// --- filing ---------------------------------------------------------
//
// Validation is a full pre-pass (collectTitles /
// collectSnapshots with no writer); filing then re-reads
// the same on-disk files into an ON COMMIT DROP stage
// inside ONE transaction per table group and swaps
// wholesale — BEGIN before the stage create, column
// names are migration 0016's own (pinned by the
// schema-contract tests). A failed pass files nothing
// and the last good copy keeps serving.

// Filing with resume support (BUG-368): the stage is a
// PERSISTENT table now (migration 0048, shared by both
// datasets — the dataset column is the layer) and a
// loader_checkpoint row per dataset records the last
// fully staged flush, so a killed filing pass resumes
// instead of re-staging the whole register. The filing
// pass still re-streams the file (it must, to validate
// every row), but the checkpointed prefix is validated
// and not re-offered (collectTitles' skipGood), and the
// checkpoint's next_start_index is the good-row ordinal
// consumed. The validation pre-pass still re-runs in full
// on a resumed run — it rebuilds the wanted-numbers set
// the snapshots need, which no checkpoint can carry. The
// swap stays atomic per dataset, and a successful swap
// clears staging + checkpoint together (BUG-248 unchanged).
/**
 * @param {any} pool
 * @param {string} dataset
 * @param {string} path
 * @param {any} meta
 * @param {string} retrievedAt
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, edition?: string | null, expected?: number | null, restart?: boolean }} [options]
 */
export async function fileTitles(
  pool,
  dataset,
  path,
  meta,
  retrievedAt,
  { progress = null, edition = null, expected = null, restart = false } = {},
) {
  const client = await pool.connect();
  const runEdition = edition ?? meta?.edition ?? "unknown";
  let filed = 0;
  let resume = null;
  // BUG-265: the filing pass re-streams the register — a
  // line every 10,000 filed rows, a heartbeat every
  // 10,000, and a warning for a flush that takes more than
  // 3x the recent average. The total is known only after
  // the pass, so no percentage is shown.
  const fileTally = progress?.tally({ label: `file ${dataset}`, every: 10000, unit: "rows" });
  const flushWatch = createBatchWatch();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS company_titles_stage (
      title_number text, dataset text, tenure text, property_address text,
      district text, county text, region text, postcode text,
      multiple_address_indicator boolean, price_paid numeric,
      proprietor_name text, company_number text, proprietorship_category text,
      country_incorporated text, date_proprietor_added date,
      additional_proprietor_indicator boolean,
      source_name text, source_date date, retrieved_at timestamptz,
      seq bigint NOT NULL, UNIQUE (seq)
    )`);
    resume = createLoaderResume(client, {
      loader: `load-company-ownership:${dataset}`,
      stageTable: "company_titles_stage",
      layerColumn: "dataset",
      layerValue: dataset,
      progress,
      restart,
    });
    const resumePrep = await resume.prepare({ edition: runEdition, expected });
    const skipGood = resumePrep.resumed ? resumePrep.checkpoint.next_start_index : 0;
    filed = resumePrep.resumed ? resumePrep.checkpoint.filed_count : 0;
    let batch = [];
    const flush = async () => {
      if (batch.length === 0) return;
      const started = Date.now();
      const values = [];
      const params = [];
      const base = resume.takeSeq(batch.length);
      for (const r of batch) {
        const b = params.length;
        values.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12}, $${b + 13}, $${b + 14}, $${b + 15}, $${b + 16}, $${b + 17}, $${b + 18}, $${b + 19}, $${b + 20})`,
        );
        params.push(
          r.titleNumber,
          r.dataset,
          r.tenure,
          r.propertyAddress,
          r.district,
          r.county,
          r.region,
          r.postcode,
          r.multipleAddressIndicator,
          r.pricePaid,
          r.proprietorName,
          r.companyNumber,
          r.proprietorshipCategory,
          r.countryIncorporated,
          r.dateProprietorAdded,
          r.additionalProprietorIndicator,
          meta.sourceName,
          meta.sourceDate,
          retrievedAt,
          base + values.length - 1,
        );
      }
      await client.query(
        `INSERT INTO company_titles_stage (title_number, dataset, tenure, property_address, district, county, region, postcode, multiple_address_indicator, price_paid, proprietor_name, company_number, proprietorship_category, country_incorporated, date_proprietor_added, additional_proprietor_indicator, source_name, source_date, retrieved_at, seq) VALUES ${values.join(", ")}`,
        params,
      );
      filed += batch.length;
      batch = [];
      const { tookMs, averageMs, slow } = flushWatch.observe(Date.now() - started);
      fileTally?.tick(filed);
      progress?.heartbeat({ stage: `file ${dataset}`, done: filed, every: 10000 });
      if (slow && tookMs >= 1000) {
        progress?.warning({
          what: "file flush duration",
          value: `flush took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
      // BUG-368: one checkpoint line per committed flush.
      await resume.checkpoint({
        edition: runEdition,
        expected,
        nextStartIndex: filed,
        read: filed,
        filed,
        state: { dataset },
        unit: "rows",
      });
    };
    const stats = await collectTitles(
      openCsvStream(path),
      dataset,
      async (row) => {
        batch.push(row);
        if (batch.length >= 1000) await flush();
      },
      { progress, skipGood },
    );
    await flush();
    fileTally?.finish(filed);
    if (filed !== stats.filed)
      throw new Error(
        `the ${dataset.toUpperCase()} filing pass filed ${filed} against ${stats.filed} validated rows`,
      );
    const stagedRes = await client.query(
      `SELECT count(*)::int AS n FROM company_titles_stage WHERE dataset = $1`,
      [dataset],
    );
    if (expected !== null && stagedRes.rows[0].n !== expected)
      throw new Error(`the ${dataset.toUpperCase()} staged count does not match — rolling back`);
    try {
      await client.query("BEGIN");
      try {
        await client.query(`DELETE FROM company_titles WHERE dataset = $1`, [dataset]);
        await client.query(
          `INSERT INTO company_titles (title_number, dataset, tenure, property_address, district, county, region, postcode, multiple_address_indicator, price_paid, proprietor_name, company_number, proprietorship_category, country_incorporated, date_proprietor_added, additional_proprietor_indicator, source_name, source_date, retrieved_at)
       SELECT title_number, dataset, tenure, property_address, district, county, region, postcode, multiple_address_indicator, price_paid, proprietor_name, company_number, proprietorship_category, country_incorporated, date_proprietor_added, additional_proprietor_indicator, source_name, source_date, retrieved_at FROM company_titles_stage WHERE dataset = $1`,
          [dataset],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
      // The run is complete: staging + checkpoint go together.
      await resume.clear();
    } catch (err) {
      // BUG-368: a swap failure leaves the staged pass
      // checkpointed, so the next run resumes at the swap.
      err.resumeNote = resume.resumeNote();
      throw err;
    }
    return { filed, stats };
  } catch (err) {
    // BUG-368: the staging is durable per flush — no
    // transaction to roll back, and the staged rows +
    // checkpoint STAY for the next run to resume from. The
    // note rides on the error so the run's one failure line
    // (in loadCompanyOwnership) names the resume point.
    if (err.resumeNote === undefined)
      err.resumeNote = resume ? resume.resumeNote() : "the start (nothing staged yet)";
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {any} pool
 * @param {string} path
 * @param {any} wanted
 * @param {any} meta
 * @param {string} retrievedAt
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, edition?: string | null, expected?: number | null, restart?: boolean }} [options]
 */
export async function fileSnapshots(
  pool,
  path,
  wanted,
  meta,
  retrievedAt,
  { progress = null, edition = null, expected = null, restart = false } = {},
) {
  const client = await pool.connect();
  const runEdition = edition ?? meta?.edition ?? "unknown";
  let filed = 0;
  let resume = null;
  // BUG-265: the wanted set's size is the genuine total —
  // the tally carries a real percentage, a line every
  // twentieth of the set.
  const fileTally = progress?.tally({
    label: "file snapshots",
    total: wanted.size,
    every: Math.max(1, Math.ceil(wanted.size / 20)),
    unit: "snapshots",
  });
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS company_snapshots_stage (
      company_number text, company_name text, status text, incorporation_date date,
      sic_codes text[], registered_office text,
      source_name text, source_date date, retrieved_at timestamptz,
      seq bigint NOT NULL, UNIQUE (seq)
    )`);
    resume = createLoaderResume(client, {
      loader: "load-company-ownership:snapshots",
      stageTable: "company_snapshots_stage",
      progress,
      restart,
    });
    const resumePrep = await resume.prepare({ edition: runEdition, expected });
    // BUG-368: the resume skip is the wanted-row ordinal —
    // the Companies House product is re-streamed, the first
    // N wanted rows are validated but not re-offered, and
    // the checkpoint's next_start_index is that ordinal.
    const skipWanted = resumePrep.resumed ? resumePrep.checkpoint.next_start_index : 0;
    filed = resumePrep.resumed ? resumePrep.checkpoint.filed_count : 0;
    let wantedSeen = 0;
    const batch = [];
    const flush = async () => {
      if (batch.length === 0) return;
      const values = [];
      const params = [];
      const base = resume.takeSeq(batch.length);
      for (const r of batch) {
        const b = params.length;
        values.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10})`,
        );
        params.push(
          r.companyNumber,
          r.companyName,
          r.status,
          r.incorporationDate,
          r.sicCodes,
          r.registeredOffice,
          meta.sourceName,
          meta.sourceDate,
          retrievedAt,
          base + values.length - 1,
        );
      }
      await client.query(
        `INSERT INTO company_snapshots_stage (company_number, company_name, status, incorporation_date, sic_codes, registered_office, source_name, source_date, retrieved_at, seq) VALUES ${values.join(", ")}`,
        params,
      );
      filed += batch.length;
      batch.length = 0;
      fileTally?.tick(filed);
      progress?.heartbeat({ stage: "file snapshots", done: filed, total: wanted.size });
      // BUG-368: one checkpoint line per committed flush.
      await resume.checkpoint({
        edition: runEdition,
        expected,
        nextStartIndex: wantedSeen,
        read: wantedSeen,
        filed,
        state: { phase: "snapshots" },
        unit: "snapshots",
      });
    };
    // Stream the product once, staging only wanted rows.
    // (collectSnapshots is the validating pre-pass; this
    // pass re-reads with the same parser and asserts the
    // same count before the swap.)
    let header = null;
    let at = null;
    for await (const row of parseCsv(openCsvStream(path))) {
      if (header === null) {
        header = row.map((h) => h.trim());
        at = {};
        for (const col of CH_COLUMNS) at[col] = header.indexOf(col);
        continue;
      }
      if (row.length !== header.length) continue;
      const num = (row[at.CompanyNumber] ?? "").trim();
      if (!wanted.has(num)) continue;
      wantedSeen += 1;
      if (wantedSeen <= skipWanted) continue;
      batch.push(parseSnapshotRow(row, at));
      if (batch.length >= 1000) await flush();
    }
    await flush();
    fileTally?.finish(filed);
    const stagedRes = await client.query("SELECT count(*)::int AS n FROM company_snapshots_stage");
    if (expected !== null && stagedRes.rows[0].n !== expected)
      throw new Error("the staged snapshot count does not match — rolling back");
    try {
      await client.query("BEGIN");
      try {
        await client.query(`DELETE FROM company_snapshots`);
        await client.query(
          `INSERT INTO company_snapshots (company_number, company_name, status, incorporation_date, sic_codes, registered_office, source_name, source_date, retrieved_at)
       SELECT company_number, company_name, status, incorporation_date, sic_codes, registered_office, source_name, source_date, retrieved_at FROM company_snapshots_stage`,
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
      await resume.clear();
    } catch (err) {
      err.resumeNote = resume.resumeNote();
      throw err;
    }
    return { filed };
  } catch (err) {
    if (err.resumeNote === undefined)
      err.resumeNote = resume ? resume.resumeNote() : "the start (nothing staged yet)";
    throw err;
  } finally {
    client.release();
  }
}

// --- sources ----------------------------------------------------------

function editionFromName(name) {
  const m = name.match(/_(\d{4})_(\d{2})\.zip$/i) ?? name.match(/-(\d{4})-(\d{2})-\d{2}\.zip$/i);
  return m ? `${m[1]}-${m[2]}` : null;
}

function findFile(dir, patterns) {
  const names = readdirSync(dir);
  for (const pattern of patterns) {
    const hit = names.filter((n) => pattern.test(n)).sort()[0];
    if (hit) return join(dir, hit);
  }
  return null;
}

// Resolve a --file directory: plain fixture CSVs, the
// downloaded ZIPs, or a mix. Editions come from the
// manifest when present (the fixture carries one), else
// from the FULL file names.
export function resolveFileSources(dir) {
  if (!existsSync(dir)) throw new Error(`--file directory ${dir} does not exist`);
  const manifest = existsSync(join(dir, "manifest.json"))
    ? JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"))
    : {};
  const ccod = findFile(dir, [/^ccod\.csv$/i, /^ccod.*\.csv$/i, /^ccod_full.*\.zip$/i]);
  const ocod = findFile(dir, [/^ocod\.csv$/i, /^ocod.*\.csv$/i, /^ocod_full.*\.zip$/i]);
  const ch = findFile(dir, [
    /^companies-house.*\.csv$/i,
    /^companies-house.*\.zip$/i,
    /^basiccompanydata.*\.zip$/i,
  ]);
  if (!ccod && !ocod)
    throw new Error(`${dir} holds no CCOD or OCOD file — the fixture/download set is missing`);
  const edition = (key, path) =>
    manifest[key] ?? (path ? editionFromName(path.split("/").pop()) : null);
  return {
    ccod: ccod ? { path: ccod, edition: edition("ccodEdition", ccod) } : null,
    ocod: ocod ? { path: ocod, edition: edition("ocodEdition", ocod) } : null,
    companiesHouse: ch ? { path: ch, edition: edition("companiesHouseEdition", ch) } : null,
  };
}

function runHelper(helper, args) {
  return new Promise((resolve, reject) => {
    execFile(
      "python3",
      [helper, ...args],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err)
          reject(
            new Error(`the Land Registry helper failed (${args[0]}): ${stderr || err.message}`),
          );
        else resolve(stdout);
      },
    );
  });
}

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
// BUG-385: a transient fetch failure is retried for up to 30
// minutes (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
// 2026) — the same retry the flood loaders got in BUG-384.
// Past the budget the original error fails the run and it
// waits. The delay caps at the last schedule entry; a test
// may pass delaysMs: [] for instant retries. Non-transient
// failures throw at once (see isTransientFetchError). `init`
// is the fetch init, or a function returning a fresh one
// per attempt (a caller passing an AbortSignal.timeout
// needs a new signal each retry — a fired one stays
// aborted).
/**
 * @param {string} url
 * @param {string} what
 * @param {{ delaysMs?: number[], onRetry?: ((error: Error, attempt: number, delay: number, what: string) => void) | null, retryBudgetMs?: number, init?: any }} [opts]
 */
export async function fetchResponse(
  url,
  what,
  {
    delaysMs = RETRY_DELAYS_MS,
    onRetry = null,
    retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS,
    init = undefined,
  } = {},
) {
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const response = await fetch(url, typeof init === "function" ? init() : init);
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

// Companies House: the current monthly snapshot, named
// for the first of its month; probe this month, then walk
// back up to three (publication lands within five working
// days of month end). BUG-385: the probe and the download
// both retry transient failures for up to 30 minutes
// (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
// 2026), the same retry the flood loaders got in BUG-384.
// A 404 on the probe is the month's file not being
// published yet — walk back, as before. Any other probe
// failure (a transient past its budget, or another
// status) fails the run instead of silently filing an
// older snapshot. The download retries whole from
// scratch: each attempt opens a fresh write stream, and
// createWriteStream truncates, so a cut-short attempt
// never leaves a partial file for the next attempt to
// extend.
/**
 * @param {string} dir
 * @param {{ delaysMs?: number[], onRetry?: ((error: Error, attempt: number, delay: number, what: string) => void) | null, retryBudgetMs?: number }} [opts]
 */
export async function downloadCompaniesHouse(dir, opts = {}) {
  const now = new Date();
  const {
    delaysMs = RETRY_DELAYS_MS,
    onRetry = null,
    retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS,
  } = opts;
  for (let back = 0; back <= 3; back += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const stamp = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const url = `https://download.companieshouse.gov.uk/BasicCompanyDataAsOneFile-${stamp}.zip`;
    let probe;
    try {
      probe = await fetchResponse(url, `the Companies House snapshot probe for ${stamp}`, {
        delaysMs,
        onRetry,
        retryBudgetMs,
        init: {
          method: "GET",
          headers: { "User-Agent": USER_AGENT, Range: "bytes=0-99" },
        },
      });
    } catch (error) {
      if (error?.status === 404) continue;
      throw error;
    }
    if (probe.status === 206 || probe.status === 200) {
      await probe.arrayBuffer().catch(() => {});
      const dest = join(dir, `BasicCompanyDataAsOneFile-${stamp}.zip`);
      const startedAt = Date.now();
      let attempt = 0;
      for (;;) {
        attempt += 1;
        try {
          const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
          if (!res.ok) {
            const error = new Error(`the Companies House download failed (HTTP ${res.status})`);
            error.status = res.status;
            throw error;
          }
          const { createWriteStream } = await import("node:fs");
          const { pipeline } = await import("node:stream/promises");
          await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
          break;
        } catch (error) {
          if (!isTransientFetchError(error)) throw error;
          if (Date.now() - startedAt >= retryBudgetMs) throw error;
          const delay =
            delaysMs.length === 0 ? 0 : delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
          onRetry?.(error, attempt, delay, "the Companies House download");
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      return { path: dest, edition: stamp.slice(0, 7) };
    }
  }
  throw new Error(
    "no Companies House snapshot file answered for this or the three previous months",
  );
}

// The operator (live) acquisition: metadata + downloads
// through the connector helper (the only credential
// path), the Companies House snapshot from its public
// download host, all into a scratch directory the
// caller deletes. Downloaded ZIPs are verified against
// the published CSV size before they are allowed to
// parse — a cut-short transfer fails here, never files.
/**
 * @param {{ delaysMs?: number[], onRetry?: ((error: Error, attempt: number, delay: number, what: string) => void) | null, retryBudgetMs?: number }} [opts]
 */
export async function acquireLiveSources(opts = {}) {
  const helper = process.env.CMNH_LRDATA_HELPER ?? DEFAULT_HELPER;
  if (!existsSync(helper))
    throw new Error(
      `the Land Registry connector helper was not found at ${helper} — set CMNH_LRDATA_HELPER to the lrdata.py path (the connector is the only key path)`,
    );
  const dir = await mkdtemp(join(tmpdir(), "cmnh-company-ownership-"));
  const sources = { dir };
  for (const dataset of ["ccod", "ocod"]) {
    const meta = JSON.parse(await runHelper(helper, ["dataset", dataset]));
    const resources = meta?.result?.resources ?? [];
    const full = resources.find((r) => /_FULL_\d{4}_\d{2}\.zip$/i.test(r.file_name ?? ""));
    if (!full) throw new Error(`the ${dataset.toUpperCase()} metadata names no FULL file`);
    const outPath = join(dir, full.file_name);
    const receipt = JSON.parse(
      await runHelper(helper, ["download", dataset, full.file_name, outPath]),
    );
    // Verify the landed ZIP: it must open, and its CSV
    // must measure what the service publishes (the
    // metadata's file_size is the CSV's byte size — the
    // build measured the correspondence exactly on both
    // datasets).
    const expectedCsvBytes = Math.round(
      parseFloat(full.file_size) * (full.file_size.includes("GB") ? 1e9 : 1e6),
    );
    const csvBytes = await new Promise((resolve, reject) => {
      yauzl.open(outPath, { lazyEntries: true }, (err, zip) => {
        if (err)
          reject(
            new Error(
              `the downloaded ${full.file_name} does not open as a ZIP (${err.message}) — the transfer was cut short; nothing files`,
            ),
          );
        else {
          zip.on("entry", (entry) => resolve(entry.uncompressedSize));
          zip.on("error", reject);
          zip.readEntry();
        }
      });
    });
    if (Math.abs(csvBytes - expectedCsvBytes) > 5_000_000)
      throw new Error(
        `the downloaded ${full.file_name} holds a ${csvBytes}-byte CSV against the published ~${expectedCsvBytes} — the transfer was cut short; nothing files`,
      );
    sources[dataset] = {
      path: outPath,
      edition: editionFromName(full.file_name),
      receiptBytes: receipt.bytes,
    };
  }
  sources.companiesHouse = await downloadCompaniesHouse(dir, opts);
  return sources;
}

// --- the run ------------------------------------------------------------

export async function loadCompanyOwnership(
  source,
  { verifyOnly = false, progress = null, restart = false } = {},
) {
  const retrievedAt = new Date().toISOString();
  // Pre-pass: validate both datasets fully, collecting
  // golden rows and the filed company numbers.
  const validated = {};
  const wanted = new Set();
  // BUG-265: the validation pre-pass is the run's first
  // long phase — a stage marker per dataset, and the
  // failure line names it.
  let snapshotFound = new Map();
  let snapshotRows = 0;
  try {
    for (const dataset of ["ccod", "ocod"]) {
      const src = source[dataset];
      if (!src) continue;
      progress?.stage(`validating ${dataset.toUpperCase()} titles`);
      const stats = await collectTitles(openCsvStream(src.path), dataset, null, { progress });
      validated[dataset] = { src, stats };
      for (const n of stats.numbers) wanted.add(n);
    }
    if (Object.keys(validated).length === 0) throw new Error("no dataset sources resolved");

    // Snapshots pre-pass: only the numbers the titles
    // carry. No Companies House source → every snapshot is
    // the named missing state, and the run says so.
    if (source.companiesHouse) {
      progress?.stage("validating Companies House snapshots");
      const { found, rows } = await collectSnapshots(
        openCsvStream(source.companiesHouse.path),
        wanted,
        { progress },
      );
      snapshotFound = found;
      snapshotRows = rows;
    }
  } catch (err) {
    progress?.failed({
      stage: "validate",
      filed: 0,
      error: err,
      resume: "re-run from scratch (nothing is filed until validation passes)",
    });
    throw err;
  }

  const ccodGolden = validated.ccod?.stats.goldenRows ?? [];
  const ocodGolden = validated.ocod?.stats.goldenRows ?? [];
  const edition = validated.ccod?.src.edition ?? validated.ocod?.src.edition ?? null;
  const golden = goldenChecks({
    ccodGolden,
    ocodGolden,
    snapshots: snapshotFound,
    edition,
  });
  if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);

  const totals = {
    ccod: validated.ccod?.stats.filed ?? 0,
    ocod: validated.ocod?.stats.filed ?? 0,
    rejects: Object.values(validated).map((v) => ({
      dataset: v.stats.dataset,
      count: v.stats.rejectCount,
      names: v.stats.rejects,
    })),
    postcodeDropped: Object.values(validated).reduce((a, v) => a + v.stats.postcodeDropped, 0),
    noNumber: Object.values(validated).reduce((a, v) => a + v.stats.noNumber, 0),
    numbersWanted: wanted.size,
    snapshots: snapshotFound.size,
    missingByNumber: [...wanted].filter((n) => !snapshotFound.has(n)),
    snapshotRows,
    editions: {
      ccod: validated.ccod?.src.edition ?? null,
      ocod: validated.ocod?.src.edition ?? null,
      companiesHouse: source.companiesHouse?.edition ?? null,
    },
  };

  if (verifyOnly) return { totals, filed: false };

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // BUG-265: the filing pass is the run's second long
  // phase — the failure line names it and counts what
  // filed before the failure.
  let filedTitles = 0;
  try {
    progress?.stage("filing validated titles and snapshots");
    for (const dataset of ["ccod", "ocod"]) {
      const v = validated[dataset];
      if (!v) continue;
      const { filed } = await fileTitles(
        pool,
        dataset,
        v.src.path,
        {
          sourceName: dataset === "ccod" ? CCOD_SOURCE_NAME : OCOD_SOURCE_NAME,
          sourceDate: v.src.edition ? `${v.src.edition}-01` : null,
          edition: v.src.edition,
        },
        retrievedAt,
        { progress, edition: v.src.edition, expected: v.stats.filed, restart },
      );
      filedTitles += filed;
      if (filed !== v.stats.filed)
        throw new Error(
          `${dataset.toUpperCase()}: filed ${filed} against ${v.stats.filed} validated rows`,
        );
    }
    if (source.companiesHouse) {
      const { filed } = await fileSnapshots(
        pool,
        source.companiesHouse.path,
        wanted,
        {
          sourceName: CH_SOURCE_NAME,
          sourceDate: source.companiesHouse.edition ? `${source.companiesHouse.edition}-01` : null,
          edition: source.companiesHouse.edition,
        },
        retrievedAt,
        { progress, edition: source.companiesHouse.edition, expected: snapshotFound.size, restart },
      );
      filedTitles += filed;
      if (filed !== snapshotFound.size)
        throw new Error(
          `snapshots: filed ${filed} against ${snapshotFound.size} validated matches`,
        );
    } else {
      // No snapshot source this pass: clear the table so
      // a stale snapshot never outlives its titles.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM company_snapshots`);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
  } catch (err) {
    progress?.failed({
      stage: "file",
      filed: filedTitles,
      total: totals.ccod + totals.ocod + totals.snapshots,
      error: err,
      // BUG-368: the filing pass names its resume point —
      // the staged rows + checkpoint stand for the next run.
      resume: err.resumeNote ?? "re-run from scratch (each filing pass is transactional)",
    });
    throw err;
  } finally {
    await pool.end();
  }
  return { totals, filed: true };
}

function summaryLine(totals, filed) {
  const total = totals.ccod + totals.ocod;
  const rejectNote = totals.rejects
    .filter((r) => r.count > 0)
    .map(
      (r) =>
        `${formatCount(r.count)} ${r.dataset.toUpperCase()} row(s) rejected by name (${r.names.join("; ")})`,
    )
    .join(" · ");
  return (
    `load-company-ownership · HM Land Registry company ownership (CCOD/OCOD) + Companies House snapshots · ` +
    `${formatCount(total)} company-owned titles ${filed ? "filed" : "would file"} (${formatCount(totals.ccod)} CCOD, ${formatCount(totals.ocod)} OCOD) · ` +
    `${formatCount(totals.snapshots)} snapshots ${filed ? "filed" : "would file"} of ${formatCount(totals.numbersWanted)} filed company numbers · ` +
    `missing snapshots: ${formatCount(totals.noNumber)} titles carry no company number, ${formatCount(totals.missingByNumber.length)} numbers not in the Companies House snapshot` +
    (totals.postcodeDropped > 0
      ? ` · ${formatCount(totals.postcodeDropped)} postcodes not in UK form (filed as no-postcode)`
      : "") +
    (rejectNote ? ` · ${rejectNote}` : "")
  );
}

const DEFAULT_FIXTURE_DIR = fileURLToPath(
  new URL("../../tests/fixtures/company-ownership/", import.meta.url),
);

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last checkpointed flush instead of
  // restarting; with no checkpoint this is a fresh start.
  const restart = args.includes("--restart");
  let liveDir = null;
  // BUG-265: one logger for the run — the validation and
  // filing lines inside loadCompanyOwnership.
  const progress = createProgressLogger({ name: "load-company-ownership" });
  try {
    const source =
      fileArg !== null
        ? resolveFileSources(fileArg ?? DEFAULT_FIXTURE_DIR)
        : await (async () => {
            const s = await acquireLiveSources();
            liveDir = s.dir;
            return s;
          })();
    const { totals, filed } = await loadCompanyOwnership(source, { verifyOnly, progress, restart });
    console.log(
      `${summaryLine(totals, filed)} — golden areas OK${verifyOnly ? " (verify-only: nothing filed)" : ""}`,
    );
  } finally {
    if (liveDir) await rm(liveDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Run only as a script (run-loaders / npm), never on import.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(`load-company-ownership FAILED: ${err.message}`);
    process.exit(1);
  });
}
