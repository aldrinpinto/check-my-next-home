// Environment Agency Pollution Inventory — ONE annual source,
// filed into industrial_sites + industrial_site_releases:
//
//   load-pollution-inventory — the yearly workbook the EA
//   publishes on the Defra Data Services Platform (the
//   data.gov.uk dataset "Pollution Inventory": twelve yearly
//   ZIPs, 2013–2024, and nothing else — no CSV, no API, no
//   spatial service). Each ZIP holds one workbook; only its
//   "<year> Substances" sheet files. The Waste Transfers and
//   Radioactive Wastes sheets are out of scope (decisions
//   D50/D62): waste-only and radioactive-only permits are not
//   in the Substances register and file nothing here.
//
// Why this shape:
//   * The register is the Substances sheet's permits (2,870
//     in the 2024 vintage, published 20 Nov 2025 — an
//     ~11-month lag the served answers never hide: serving
//     always names its data year). England only, verified
//     three ways at prep: the publisher's remit, the
//     record's England bounding box, and the filed postcodes
//     and EA areas measured from the file itself.
//   * The workbook carries NO site-name field and NO
//     regulator column (D62): SITE ADDRESS files verbatim
//     and serves as the site's identity, OPERATOR NAME files
//     beside it, and "Environment Agency" is a block-level
//     fact, never a column. EA AREA NAME is deliberately not
//     filed — the Agency's internal geographic team, not a
//     regulator.
//   * A below-threshold return is the literal text "Below
//     Reporting Threshold" IN THE QUANTITY COLUMN (the EA's
//     own definition: "Where the quantity emitted or
//     transferred is below the reporting threshold. A value
//     does not have to be submitted."). It files as
//     quantity_kg NULL + below_threshold true — structurally
//     distinct from a quantified return of 0 (109 air rows
//     in 2024) and from no row at all. Any quantity cell that
//     is neither numeric nor that exact text fails the load.
//   * Only the Air route files (17,907 of 31,384 rows in
//     2024): water, wastewater and land returns are out of
//     scope, and the EPC minimisation precedent governs —
//     file what serves.
//   * The workbook is XLSX: a minimal in-loader reader
//     (workbook rels → the Substances sheet XML + a
//     sharedStrings scan) in the house hand-rolled tradition
//     (M6.27's WKB reader); ZIPs are read with yauzl, the
//     house reader. No new dependency.
//   * Vintage discipline (the PCM pattern): the loader
//     resolves the LATEST year on the dataset record — it
//     never hardcodes a year — but files only a vintage
//     whose counts the operator has measured and pinned in
//     MEASURED_VINTAGES below. A newer year appearing on the
//     record fails the load closed, naming the operator
//     action; the canary (probe "ea-pollution-inventory")
//     warns the day it lands. One vintage is held at a time:
//     filing is one transaction — stage, check, swap both
//     tables — so a failed load never overwrites the last
//     good vintage.
//   * Filing proceeds while the EA's licence answer is
//     outstanding (decision D60): holding the data in our
//     own database is the internal use the dataset's Special
//     Conditions name, and the M5.13 precedent filed behind
//     its flag the same way. Serving is what the flag
//     (INDUSTRIAL_SITES_ENABLED, lib/site.ts) governs.
//
// Modes:
//   node loaders/load-pollution-inventory.mjs               live + file
//   node loaders/load-pollution-inventory.mjs --verify-only live + checks only
//   node loaders/load-pollution-inventory.mjs --file <dir>  file from a
//     local folder holding the year's ZIP (the CI fixture —
//     the real 2024 ZIP cut to the golden permits' rows) or
//     the bare workbook (.xlsx).
//
// Verify-only runs need no database. Exits non-zero on any
// failure and prints "load-pollution-inventory FAILED: …"
// to stderr.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import proj4 from "proj4";
import yauzl from "yauzl";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";
import { createLoaderResume } from "./loader-resume.mjs";

const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";

// Same EPSG:27700 definition as the schools and transport
// loaders — one conversion basis across the codebase.
proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
    "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);
export const toLatLng = (easting, northing) => {
  const [lng, lat] = proj4("EPSG:27700", "EPSG:4326", [easting, northing]);
  return { lat, lng };
};

export const PI_RECORD_URL =
  "https://ckan.publishing.service.gov.uk/api/3/action/package_show?id=cfd94301-a2f2-48a2-9915-e477ca6d8b7e";
export const PI_FILE_DATASET_ID = "4faa4a52-7df2-4047-bc3f-877dd04222d8";
export const SOURCE_NAME = "Environment Agency Pollution Inventory";
export const BRT_TEXT = "Below Reporting Threshold";

// The Substances sheet's fourteen columns, as published. The
// header row is found by its first cell, never by row number
// (nine preamble rows sit above it in the 2024 file, and the
// count is the publisher's choice, not a contract).
export const HEADERS = [
  "AUTHORISATION ID / PERMIT ID",
  "ACTIVITY DESCRIPTION",
  "OPERATOR NAME",
  "SITE ADDRESS",
  "SITE POSTCODE",
  "EASTING",
  "NORTHING",
  "EA AREA NAME",
  "ROUTE NAME",
  "SUBSTANCE NAME",
  "REPORTING THRESHOLD (kg)",
  "QUANTITY RELEASED (kg)",
  "REGULATED INDUSTRY SECTOR",
  "REGULATED INDUSTRY SUB SECTOR",
];

// The measured counts per vintage (the PCM pattern: a new
// vintage re-measures its constants at its first filing and
// the operator pins them here). 2024, measured on the
// published file at build (16 Nov 2026): 2,870 permits in
// the Substances register; 2,720 of them report to air in
// some form; 17,907 air-route rows; 12,841 of those the
// below-threshold marker.
export const MEASURED_VINTAGES = {
  2024: { sites: 2870, airSites: 2720, airRows: 17907, brtAir: 12841 },
};
export const PINNED_YEAR = Math.max(...Object.keys(MEASURED_VINTAGES).map(Number));
// The sanity band: a filed count outside ±10% of its
// measured value refuses the load (a collapse in the
// below-threshold share signals a format change, not a
// quieter year).
export const BAND_TOLERANCE = 0.1;

// The golden permits (prep Section 6, measured on the
// published 2024 file): the register facts and the air
// content the loader must reproduce exactly, checked BEFORE
// anything files. Quantified releases map substance →
// [quantity kg, threshold kg]; belowThreshold names the
// marker returns, which file no quantity.
export const GOLDEN = {
  YP3432XR: {
    operator: "Stuart Davis Limited",
    quantified: { Ammonia: [3128, 1000], "Particulate matter - PM10": [3066, 1000] },
    belowThreshold: ["Nitrogen oxides (NO and NO2) as NO2"],
  },
  SP3237JU: {
    operator: "Telehouse International Corporation of Europe Limited",
    quantified: {},
    belowThreshold: [
      "Carbon dioxide",
      "Carbon monoxide",
      "Nitrogen oxides (NO and NO2) as NO2",
      "Particulate matter - total",
    ],
  },
  BP3530YR: {
    operator: "Global Switch Limited",
    quantified: {},
    belowThreshold: [
      "Carbon monoxide",
      "Nitrous oxide",
      "Particulate matter - PM10",
      "Sulphur oxides (SO2 and SO3) as SO2",
    ],
  },
  FP3839YQ: {
    operator: "Greencore Food To Go Limited",
    quantified: {},
    belowThreshold: ["Carbon dioxide", "Chloroform (Trichloromethane)"],
  },
  EP3507SL: {
    operator: "Telehouse International Corporation of Europe Limited",
    quantified: { "Carbon Dioxide From Qualifying Renewable Fuel Sources": [670, 0] },
    belowThreshold: ["Carbon dioxide"],
  },
  MP3530HZ: {
    operator: "T & L Sugars Limited",
    quantified: {
      "Carbon dioxide": [88988870, 10000000],
      "Carbon Dioxide From Qualifying Renewable Fuel Sources": [22090, 0],
    },
    belowThreshold: [
      "Carbon monoxide",
      "Nitrous oxide",
      "Particulate matter - total",
      "Sulphur oxides (SO2 and SO3) as SO2",
    ],
  },
  DP3906BE: {
    operator: "Equinix (UK) Limited",
    quantified: {},
    belowThreshold: [
      "Carbon dioxide",
      "Carbon monoxide",
      "Methane",
      "Nitrogen oxides (NO and NO2) as NO2",
      "Nitrous oxide",
      "Non-methane volatile organic compounds (NMVOCs)",
      "Particulate matter - PM10",
      "Particulate matter - PM2.5",
      "Particulate matter - total",
      "Sulphur oxides (SO2 and SO3) as SO2",
    ],
  },
};

// ------------------------------------------------------------------
// ZIP + XLSX reading (minimal, in-loader)
// ------------------------------------------------------------------

// A member's stored date: yauzl exposes the raw DOS date
// field, whose bit fields ARE the published date (a DOS
// timestamp carries no timezone to convert through). Null
// when the field is absent or malformed.
export function dosDate(field) {
  if (typeof field !== "number" || !Number.isFinite(field)) return null;
  const year = ((field >> 9) & 0x7f) + 1980;
  const month = (field >> 5) & 0x0f;
  const day = field & 0x1f;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Every entry of a ZIP buffer: name → { buffer, date }, the
// date being the member's own stored timestamp (the 2024
// vintage's workbook member is dated 2025-11-20, the day
// the EA published it).
export function readZipEntries(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const entries = new Map();
      zip.readEntry();
      zip.on("entry", (entry) => {
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const chunks = [];
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", () => {
            entries.set(entry.fileName, {
              buffer: Buffer.concat(chunks),
              date: dosDate(entry.lastModFileDate),
            });
            zip.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zip.on("error", reject);
      zip.on("end", () => resolve(entries));
    });
  });
}

function xmlUnescape(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

// The shared strings table: one <si> per string, its text
// the concatenation of its <t> runs.
export function parseSharedStrings(xml) {
  const strings = [];
  for (const match of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = "";
    for (const t of match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
    strings.push(xmlUnescape(text));
  }
  return strings;
}

// Workbook sheet name → worksheet path, through the
// workbook's own relationships (never a guessed sheetN).
export function parseWorkbookSheets(workbookXml, relsXml) {
  const rels = new Map();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = match[0];
    const id = /\bId="([^"]+)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
    if (id && target && tag.includes("/worksheet")) rels.set(id, target);
  }
  const sheets = new Map();
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = match[0];
    const name = /\bname="([^"]+)"/.exec(tag)?.[1];
    const rid = /\br:id="([^"]+)"/.exec(tag)?.[1];
    if (name && rid && rels.has(rid)) {
      const target = rels.get(rid);
      sheets.set(name, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    }
  }
  return sheets;
}

// One worksheet's rows: an array of Map(column letter →
// value), values strings or numbers as the cells carry them.
// Shared-string cells resolve through the table; numeric
// cells file as numbers; an absent or empty cell is simply
// not in the map.
export function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map();
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      if (!ref) continue;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const rawV = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (type === "s") {
        if (rawV === undefined) continue;
        const value = sharedStrings[Number(rawV)];
        if (value === undefined) throw new Error(`shared string ${rawV} missing from the table`);
        cells.set(ref, value);
      } else if (type === "inlineStr" || type === "str") {
        let text = "";
        for (const t of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
        cells.set(ref, xmlUnescape(text));
      } else if (rawV !== undefined && rawV !== "") {
        const value = Number(rawV);
        cells.set(ref, Number.isFinite(value) ? value : xmlUnescape(rawV));
      }
    }
    rows.push(cells);
  }
  return rows;
}

// The workbook inside a ZIP buffer (the published form) —
// or a bare workbook buffer — read to its Substances rows.
// Returns { rows, sourceDate }: the publication date from
// the ZIP member's stored timestamp, null for a bare
// workbook (the DSP publishes the ZIP; a bare file is a
// local convenience and carries no date of its own).
export async function readSubstancesRows(buffer, { fromZip }) {
  let xlsxBuffer = buffer;
  let sourceDate = null;
  if (fromZip) {
    const entries = await readZipEntries(buffer);
    const member = [...entries.entries()].find(([name]) => name.toLowerCase().endsWith(".xlsx"));
    if (!member) throw new Error("the Pollution Inventory ZIP holds no .xlsx workbook");
    xlsxBuffer = member[1].buffer;
    sourceDate = member[1].date;
  }
  const parts = await readZipEntries(xlsxBuffer);
  const workbookXml = parts.get("xl/workbook.xml")?.buffer.toString("utf8");
  const relsXml = parts.get("xl/_rels/workbook.xml.rels")?.buffer.toString("utf8");
  if (!workbookXml || !relsXml) throw new Error("the workbook's structure parts are missing");
  const sheets = parseWorkbookSheets(workbookXml, relsXml);
  const substancesName = [...sheets.keys()].find((name) => / Substances$/.test(name));
  if (!substancesName) throw new Error("the workbook holds no Substances sheet");
  const sheetXml = parts.get(sheets.get(substancesName))?.buffer.toString("utf8");
  if (!sheetXml) throw new Error(`the sheet ${substancesName} is missing from the workbook`);
  const sharedXml = parts.get("xl/sharedStrings.xml")?.buffer.toString("utf8");
  const sharedStrings = sharedXml ? parseSharedStrings(sharedXml) : [];
  return { rows: parseSheetRows(sheetXml, sharedStrings), sourceDate, sheetName: substancesName };
}

/**
 * @typedef {{ permitId: string, operator: string, siteAddress: string, sitePostcode: string | null, activityDescription: string | null, sector: string | null, subSector: string | null, easting: number | null, northing: number | null }} PiSite
 * @typedef {{ permitId: string, substance: string, thresholdKg: number, quantityKg: number | null, belowThreshold: boolean }} PiRelease
 * @typedef {{ sites: number, airSites: number, airRows: number, brtAir: number }} PiCounts
 * @typedef {{ sites: PiSite[], releases: PiRelease[], counts: PiCounts }} PiParsed
 * @typedef {{ year: number, sourceDate: string | null, sites: (PiSite & { latitude: number | null, longitude: number | null })[], releases: PiRelease[], counts: PiCounts }} PiFiling
 */

// ------------------------------------------------------------------
// The Substances sheet → the filing
// ------------------------------------------------------------------

const COLUMNS = "ABCDEFGHIJKLMN".split("");
const cell = (row, letter) => row.get(letter);

function numeric(value, what) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
    return Number(value);
  throw new Error(`${what} is not numeric: ${JSON.stringify(value)}`);
}

// Parse the Substances rows into the register + the air
// releases. Throws on any contract breach — a failed parse
// files nothing.
/** @param {Map<string, string | number>[]} rows @returns {PiParsed} */
export function parseSubstances(rows) {
  const headerAt = rows.findIndex((row) => cell(row, "A") === HEADERS[0]);
  if (headerAt === -1)
    throw new Error(`the Substances sheet's header row ("${HEADERS[0]}") was not found`);
  const header = rows[headerAt];
  HEADERS.forEach((name, i) => {
    const got = cell(header, COLUMNS[i]);
    if (got !== name)
      throw new Error(
        `the Substances header ${COLUMNS[i]} is ${JSON.stringify(got)}, expected "${name}"`,
      );
  });

  const sites = new Map();
  const releases = [];
  const triples = new Set();
  let airRows = 0;
  let brtAir = 0;
  const airPermits = new Set();

  for (const row of rows.slice(headerAt + 1)) {
    const permitId = cell(row, "A");
    if (permitId === undefined || permitId === "") continue; // a trailing blank row
    if (typeof permitId !== "string") throw new Error(`a permit id is not text: ${permitId}`);
    const route = cell(row, "I");
    const substance = cell(row, "J");
    const triple = `${permitId}|${route}|${substance}`;
    if (triples.has(triple)) throw new Error(`duplicate (permit, route, substance): ${triple}`);
    triples.add(triple);

    const eastingRaw = cell(row, "F");
    const northingRaw = cell(row, "G");
    const hasEasting = eastingRaw !== undefined && eastingRaw !== "";
    const hasNorthing = northingRaw !== undefined && northingRaw !== "";
    if (hasEasting !== hasNorthing)
      throw new Error(`${permitId}: easting and northing must file together or not at all`);
    const identity = {
      operator: cell(row, "C"),
      siteAddress: typeof cell(row, "D") === "string" ? cell(row, "D") : "",
      sitePostcode:
        typeof cell(row, "E") === "string" && cell(row, "E") !== "" ? cell(row, "E") : null,
      activityDescription: typeof cell(row, "B") === "string" ? cell(row, "B") : null,
      sector: typeof cell(row, "M") === "string" ? cell(row, "M") : null,
      subSector: typeof cell(row, "N") === "string" ? cell(row, "N") : null,
      easting: hasEasting ? numeric(eastingRaw, `${permitId} easting`) : null,
      northing: hasNorthing ? numeric(northingRaw, `${permitId} northing`) : null,
    };
    if (typeof identity.operator !== "string" || identity.operator === "")
      throw new Error(`${permitId}: the operator name is blank`);
    const existing = sites.get(permitId);
    if (!existing) {
      sites.set(permitId, { permitId, ...identity });
    } else {
      // The identity columns repeat on every row of a
      // permit (verified identical across all 2,870 permits
      // of the 2024 file): a vintage that stops repeating
      // them identically is a format change, not data.
      for (const key of Object.keys(identity))
        if (existing[key] !== identity[key])
          throw new Error(`${permitId}: identity column ${key} differs between its rows`);
    }

    if (route !== "Air") continue;
    airRows += 1;
    airPermits.add(permitId);
    if (typeof substance !== "string" || substance === "")
      throw new Error(`${permitId}: an air row carries no substance name`);
    const thresholdKg = numeric(cell(row, "K"), `${permitId} ${substance} threshold`);
    const quantityRaw = cell(row, "L");
    if (quantityRaw === BRT_TEXT) {
      brtAir += 1;
      releases.push({ permitId, substance, thresholdKg, quantityKg: null, belowThreshold: true });
    } else {
      const quantityKg = numeric(quantityRaw, `${permitId} ${substance} quantity`);
      releases.push({ permitId, substance, thresholdKg, quantityKg, belowThreshold: false });
    }
  }

  return {
    sites: [...sites.values()].sort((a, b) => a.permitId.localeCompare(b.permitId)),
    releases,
    counts: { sites: sites.size, airSites: airPermits.size, airRows, brtAir },
  };
}

// Assemble the filing: positions converted on the house
// proj4 basis, the vintage and its provenance stamped on.
/** @param {PiParsed} parsed @param {{ year: number, sourceDate: string | null }} vintage @returns {PiFiling} */
export function buildFiling(parsed, { year, sourceDate }) {
  const sites = parsed.sites.map((site) => {
    const point =
      site.easting !== null && site.northing !== null
        ? toLatLng(site.easting, site.northing)
        : null;
    return {
      ...site,
      latitude: point ? point.lat : null,
      longitude: point ? point.lng : null,
    };
  });
  return { year, sourceDate, sites, releases: parsed.releases, counts: parsed.counts };
}

// The checks that run BEFORE anything files (PCM pattern):
// the measured-count bands on a full live pull, and the
// golden permits' content on every pull, fixture included.
/** @param {PiFiling} filing @param {{ full: boolean }} mode */
export function goldenChecks(filing, { full }) {
  const problems = [];
  if (full) {
    const measured = MEASURED_VINTAGES[filing.year];
    if (!measured)
      throw new Error(
        `the ${filing.year} vintage has no measured counts pinned — measure the published file and pin them in MEASURED_VINTAGES before this vintage can file (the canary has been warning since it landed)`,
      );
    for (const key of ["sites", "airSites", "airRows", "brtAir"]) {
      const got = filing.counts[key];
      const want = measured[key];
      if (got < want * (1 - BAND_TOLERANCE) || got > want * (1 + BAND_TOLERANCE))
        problems.push(
          `${key} ${got.toLocaleString("en-GB")} is outside ±10% of the measured ${want.toLocaleString("en-GB")}`,
        );
    }
  }
  const byPermit = new Map();
  for (const release of filing.releases) {
    if (!byPermit.has(release.permitId)) byPermit.set(release.permitId, []);
    byPermit.get(release.permitId).push(release);
  }
  const siteByPermit = new Map(filing.sites.map((s) => [s.permitId, s]));
  for (const [permitId, golden] of Object.entries(GOLDEN)) {
    const site = siteByPermit.get(permitId);
    if (!site) {
      problems.push(`golden permit ${permitId} missing from the register`);
      continue;
    }
    if (site.operator !== golden.operator)
      problems.push(`${permitId} operator is "${site.operator}", golden "${golden.operator}"`);
    const rows = byPermit.get(permitId) ?? [];
    const quantified = new Map(
      rows
        .filter((r) => !r.belowThreshold)
        .map((r) => [r.substance, [r.quantityKg, r.thresholdKg]]),
    );
    for (const [substance, want] of Object.entries(golden.quantified)) {
      const got = quantified.get(substance);
      if (!got) problems.push(`${permitId}: quantified return for ${substance} missing`);
      else if (got[0] !== want[0] || got[1] !== want[1])
        problems.push(
          `${permitId}: ${substance} is ${got[0]} kg (threshold ${got[1]}), golden ${want[0]} kg (threshold ${want[1]})`,
        );
    }
    if (quantified.size !== Object.keys(golden.quantified).length)
      problems.push(
        `${permitId}: ${quantified.size} quantified air returns, golden ${Object.keys(golden.quantified).length}`,
      );
    const brt = rows
      .filter((r) => r.belowThreshold)
      .map((r) => r.substance)
      .sort();
    const goldenBrt = [...golden.belowThreshold].sort();
    if (JSON.stringify(brt) !== JSON.stringify(goldenBrt))
      problems.push(`${permitId}: below-threshold set differs from the golden set`);
  }
  if (problems.length > 0) throw new Error(`golden checks failed:\n  - ${problems.join("\n  - ")}`);
}

// ------------------------------------------------------------------
// Filing — stage then swap, with resume support (BUG-368)
// ------------------------------------------------------------------

const CHUNK = 500;

// The two stage tables are PERSISTENT now (migration 0048)
// and each carries its own loader_checkpoint row
// (load-pollution-inventory:sites / :releases), so a killed
// run resumes staging from the checkpoint instead of
// re-staging the whole workbook. The workbook read/parse
// still re-runs — only the staging is saved. The edition
// is the inventory year; the expected total per table is
// its row count. The swap stays atomic across both tables,
// and a successful swap clears both stagings + checkpoints
// together (BUG-248 unchanged).
/**
 * @param {{ query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }} client
 * @param {PiFiling} filing
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, restart?: boolean }} [options]
 */
export async function filePollutionInventory(
  client,
  filing,
  { progress = null, restart = false } = {},
) {
  // BUG-265: the staging is the run's long phase — a tally
  // over the stage chunks (sites, then releases), a slow-
  // chunk warning and a heartbeat, so the log moves while
  // the workbook files.
  progress?.stage(
    `staging ${formatCount(filing.sites.length)} sites and ${formatCount(filing.releases.length)} air releases`,
  );
  const chunks = Math.ceil(filing.sites.length / CHUNK) + Math.ceil(filing.releases.length / CHUNK);
  const stageTally = progress?.tally({
    label: "staging",
    total: chunks,
    every: 10,
    unit: "chunks",
  });
  const stageWatch = createBatchWatch();
  const edition = `pi-${filing.year}`;
  const sitesResume = createLoaderResume(client, {
    loader: "load-pollution-inventory:sites",
    stageTable: "industrial_sites_stage",
    progress,
    restart,
  });
  const releasesResume = createLoaderResume(client, {
    loader: "load-pollution-inventory:releases",
    stageTable: "industrial_site_releases_stage",
    progress,
    restart,
  });
  // The resume note names the furthest point reached —
  // the releases table stages second, so its note wins
  // once it has checkpointed anything.
  const resumeNote = () => {
    const releases = releasesResume.resumeNote();
    return releases === "the start (nothing staged yet)" ? sitesResume.resumeNote() : releases;
  };
  await client.query(`CREATE TABLE IF NOT EXISTS industrial_sites_stage (
      permit_id text, operator text, site_address text, site_postcode text,
      activity_description text, sector text, sub_sector text,
      easting double precision, northing double precision,
      latitude double precision, longitude double precision,
      data_year integer, source_name text, source_date date,
      seq bigint NOT NULL, UNIQUE (seq)
    )`);
  await client.query(`CREATE TABLE IF NOT EXISTS industrial_site_releases_stage (
      permit_id text, substance text, threshold_kg double precision,
      quantity_kg double precision, below_threshold boolean, data_year integer,
      seq bigint NOT NULL, UNIQUE (seq)
    )`);
  const sitesPrep = await sitesResume.prepare({ edition, expected: filing.sites.length });
  const releasesPrep = await releasesResume.prepare({
    edition,
    expected: filing.releases.length,
  });
  const sitesStartAt = sitesPrep.resumed ? sitesPrep.checkpoint.next_start_index : 0;
  const releasesStartAt = releasesPrep.resumed ? releasesPrep.checkpoint.next_start_index : 0;
  let chunksDone = Math.floor(sitesStartAt / CHUNK) + Math.floor(releasesStartAt / CHUNK);
  let stagedSites = sitesPrep.resumed ? sitesPrep.checkpoint.filed_count : 0;
  let stagedReleases = releasesPrep.resumed ? releasesPrep.checkpoint.filed_count : 0;
  let stagedRows = stagedSites + stagedReleases;
  // One staged chunk's worth of progress: the tally, the
  // heartbeat and the slow-chunk warning, in one place so
  // the sites and releases loops can never drift apart.
  async function stageChunk(insert) {
    const started = Date.now();
    await insert();
    const { tookMs, averageMs, slow } = stageWatch.observe(Date.now() - started);
    chunksDone += 1;
    stageTally?.tick(chunksDone);
    progress?.heartbeat({ stage: "staging", done: chunksDone, total: chunks });
    if (slow) {
      progress?.warning({
        what: "stage chunk duration",
        value: `chunk ${chunksDone} took ${formatDuration(tookMs)}`,
        threshold: `3x recent average ${formatDuration(averageMs)}`,
      });
    }
  }
  try {
    for (let i = sitesStartAt; i < filing.sites.length; i += CHUNK) {
      const chunk = filing.sites.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      const base = sitesResume.takeSeq(chunk.length);
      chunk.forEach((s, j) => {
        const b = j * 15;
        values.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12}, $${b + 13}, $${b + 14}, $${b + 15})`,
        );
        params.push(
          s.permitId,
          s.operator,
          s.siteAddress,
          s.sitePostcode,
          s.activityDescription,
          s.sector,
          s.subSector,
          s.easting,
          s.northing,
          s.latitude,
          s.longitude,
          filing.year,
          SOURCE_NAME,
          filing.sourceDate,
          base + j,
        );
      });
      await stageChunk(() =>
        client.query(
          `INSERT INTO industrial_sites_stage (permit_id, operator, site_address, site_postcode, activity_description, sector, sub_sector, easting, northing, latitude, longitude, data_year, source_name, source_date, seq) VALUES ${values.join(", ")}`,
          params,
        ),
      );
      stagedSites += chunk.length;
      stagedRows += chunk.length;
      // BUG-368: one checkpoint line per committed chunk —
      // the save is visible in the logs, and a kill after
      // this line loses at most the chunk in flight.
      await sitesResume.checkpoint({
        edition,
        expected: filing.sites.length,
        nextStartIndex: i + chunk.length,
        read: i + chunk.length,
        filed: stagedSites,
        unit: "rows",
      });
    }
    for (let i = releasesStartAt; i < filing.releases.length; i += CHUNK) {
      const chunk = filing.releases.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      const base = releasesResume.takeSeq(chunk.length);
      chunk.forEach((r, j) => {
        const b = j * 7;
        values.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`,
        );
        params.push(
          r.permitId,
          r.substance,
          r.thresholdKg,
          r.quantityKg,
          r.belowThreshold,
          filing.year,
          base + j,
        );
      });
      await stageChunk(() =>
        client.query(
          `INSERT INTO industrial_site_releases_stage (permit_id, substance, threshold_kg, quantity_kg, below_threshold, data_year, seq) VALUES ${values.join(", ")}`,
          params,
        ),
      );
      stagedReleases += chunk.length;
      stagedRows += chunk.length;
      await releasesResume.checkpoint({
        edition,
        expected: filing.releases.length,
        nextStartIndex: i + chunk.length,
        read: i + chunk.length,
        filed: stagedReleases,
        unit: "rows",
      });
    }
    stageTally?.finish(chunks);
  } catch (err) {
    // BUG-368: the staging is durable per chunk — no
    // transaction to roll back, and the staged rows +
    // checkpoints STAY for the next run to resume from.
    progress?.failed({
      stage: "filing",
      filed: stagedRows,
      total: filing.sites.length + filing.releases.length,
      error: err,
      resume: resumeNote(),
    });
    throw err;
  }
  try {
    const { rows: stagedSiteCount } = await client.query(
      "SELECT count(*)::int AS n FROM industrial_sites_stage",
    );
    const { rows: stagedReleaseCount } = await client.query(
      "SELECT count(*)::int AS n FROM industrial_site_releases_stage",
    );
    if (
      stagedSiteCount[0].n !== filing.sites.length ||
      stagedReleaseCount[0].n !== filing.releases.length
    )
      throw new Error(
        `the staged site count (${stagedSiteCount[0].n}) or release count (${stagedReleaseCount[0].n}) does not match — rolling back`,
      );
    // The swap: the old vintage goes only once the new one
    // is fully staged — and the counts are asserted inside
    // the transaction, so a short filing rolls back whole.
    progress?.stage("swap started — replacing the filed vintage");
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM industrial_site_releases");
      await client.query("DELETE FROM industrial_sites");
      await client.query(
        `INSERT INTO industrial_sites (permit_id, operator, site_address, site_postcode, activity_description, sector, sub_sector, easting, northing, latitude, longitude, geom, data_year, source_name, source_date)
       SELECT permit_id, operator, site_address, site_postcode, activity_description, sector, sub_sector, easting, northing, latitude, longitude,
              CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL
                   THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography END,
              data_year, source_name, source_date
       FROM industrial_sites_stage`,
      );
      await client.query(
        `INSERT INTO industrial_site_releases (permit_id, substance, threshold_kg, quantity_kg, below_threshold, data_year)
       SELECT permit_id, substance, threshold_kg, quantity_kg, below_threshold, data_year FROM industrial_site_releases_stage`,
      );
      const { rows: siteCount } = await client.query(
        "SELECT count(*)::int AS n FROM industrial_sites",
      );
      const { rows: releaseCount } = await client.query(
        "SELECT count(*)::int AS n FROM industrial_site_releases",
      );
      if (siteCount[0].n !== filing.sites.length || releaseCount[0].n !== filing.releases.length)
        throw new Error(
          `the swap filed ${siteCount[0].n} sites and ${releaseCount[0].n} releases, expected ${filing.sites.length} and ${filing.releases.length}`,
        );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
    // The run is complete: both stagings + checkpoints go
    // together, so nothing is left behind for the next
    // vintage.
    await sitesResume.clear();
    await releasesResume.clear();
  } catch (err) {
    progress?.failed({
      stage: "filing",
      filed: stagedRows,
      total: filing.sites.length + filing.releases.length,
      error: err,
      resume: resumeNote(),
    });
    throw err;
  }
}

// The deletion path (decisions D60/D62): if the EA's answer
// ever requires the filed data to go, this is the whole of
// it — both tables emptied in one transaction, the loader
// removed from the schedule in the same commit (the flip
// procedure in docs/backend-m6.32.md). Exported so the path
// is a tested function, not a hand-typed DELETE.
export async function deletePollutionInventory(client) {
  await client.query("BEGIN");
  try {
    await client.query("DELETE FROM industrial_site_releases");
    await client.query("DELETE FROM industrial_sites");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

// ------------------------------------------------------------------
// Sources
// ------------------------------------------------------------------

async function fetchRetry(url, { buffer = false } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return buffer ? Buffer.from(await res.arrayBuffer()) : await res.json();
      if (res.status !== 429 && res.status < 500)
        throw new Error(`${url} returned HTTP ${res.status}`);
      lastError = new Error(`${url} returned HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (/returned HTTP 4/.test(err.message)) throw err;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
  }
  throw lastError;
}

// The dataset record's yearly ZIP resources → the latest
// year present. Resource names vary by vintage ("2024
// Pollution Inventory Dataset.zip", "2016_Pollution_
// Inventory_dataset_-_version_2.zip"); the year is the
// name's leading four digits and the file dataset id is the
// publisher's stable handle.
export function latestResource(record) {
  const resources = record?.result?.resources;
  if (!Array.isArray(resources)) throw new Error("the dataset record carries no resources list");
  const candidates = [];
  for (const resource of resources) {
    const name = typeof resource?.name === "string" ? resource.name : "";
    const url = typeof resource?.url === "string" ? resource.url : "";
    const year = /^(\d{4})\D/.exec(name)?.[1];
    if (
      year &&
      /pollution inventory/i.test(name) &&
      url.includes(`fileDataSetId=${PI_FILE_DATASET_ID}`)
    )
      candidates.push({ year: Number(year), name, url });
  }
  if (candidates.length === 0)
    throw new Error("the dataset record lists no Pollution Inventory ZIP resource");
  candidates.sort((a, b) => b.year - a.year);
  return candidates[0];
}

/** @param {{ fileDir?: string | null }} [options] @returns {Promise<{ rows: Map<string, string | number>[], sourceDate: string | null, year: number }>} */
export async function loadPollutionInventoryRows({ fileDir = null } = {}) {
  if (fileDir) {
    const names = readdirSync(fileDir);
    const zipName = names.find((n) => n.toLowerCase().endsWith(".zip"));
    const encodedZipName = names.find((n) => n.toLowerCase().endsWith(".zip.b64"));
    const xlsxName = names.find((n) => n.toLowerCase().endsWith(".xlsx"));
    if (zipName) {
      const { rows, sourceDate } = await readSubstancesRows(readFileSync(join(fileDir, zipName)), {
        fromZip: true,
      });
      const year = /^(\d{4})/.exec(zipName)?.[1];
      if (!year) throw new Error(`the fixture ZIP name "${zipName}" does not lead with its year`);
      return { rows, sourceDate, year: Number(year) };
    }
    if (encodedZipName) {
      // The committed fixture carries the ZIP base64-encoded
      // (the aims.gpkg.b64 pattern of load-flood-defences):
      // decode it in memory; the raw ZIP is never written out.
      const zipBuffer = Buffer.from(
        readFileSync(join(fileDir, encodedZipName), "utf8").replace(/\s+/g, ""),
        "base64",
      );
      const { rows, sourceDate } = await readSubstancesRows(zipBuffer, { fromZip: true });
      const year = /^(\d{4})/.exec(encodedZipName)?.[1];
      if (!year)
        throw new Error(`the fixture ZIP name "${encodedZipName}" does not lead with its year`);
      return { rows, sourceDate, year: Number(year) };
    }
    if (xlsxName) {
      const { rows } = await readSubstancesRows(readFileSync(join(fileDir, xlsxName)), {
        fromZip: false,
      });
      const year = /^(\d{4})/.exec(xlsxName)?.[1];
      if (!year) throw new Error(`the workbook name "${xlsxName}" does not lead with its year`);
      return { rows, sourceDate: null, year: Number(year) };
    }
    throw new Error(`${fileDir} holds neither a Pollution Inventory ZIP nor a workbook (.xlsx)`);
  }
  const record = await fetchRetry(PI_RECORD_URL);
  const resource = latestResource(record);
  const zipBuffer = await fetchRetry(resource.url, { buffer: true });
  const { rows, sourceDate } = await readSubstancesRows(zipBuffer, { fromZip: true });
  return { rows, sourceDate, year: resource.year };
}

async function run() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const restart = args.includes("--restart");
  const fileAt = args.indexOf("--file");
  const fileDir = fileAt >= 0 ? args[fileAt + 1] : null;
  if (fileAt >= 0 && !fileDir) throw new Error("--file needs a directory");

  // BUG-265: one logger for the run — the read marker and
  // parsed count here, the staging tally inside
  // filePollutionInventory (which also carries the filing
  // failure line, so this catch covers the reading phase
  // only and the two can never double-log).
  const progress = createProgressLogger({ name: "load-pollution-inventory" });
  progress.stage("reading the Pollution Inventory workbook");
  let filing;
  let rows;
  let sourceDate;
  let year;
  try {
    ({ rows, sourceDate, year } = await loadPollutionInventoryRows({ fileDir }));
    filing = buildFiling(parseSubstances(rows), { year, sourceDate });
    goldenChecks(filing, { full: !fileDir });
  } catch (err) {
    progress.failed({
      stage: "reading",
      filed: 0,
      error: err,
      resume: "re-run from scratch (nothing is filed until the swap)",
    });
    throw err;
  }
  // BUG-265: the parsed count — no percentage, the workbook
  // carries no total of its own to read against.
  progress.count({
    label: "parsed",
    done: filing.counts.sites,
    unit: "sites",
    extra: `${formatCount(filing.counts.airRows)} air rows`,
  });
  const base =
    `load-pollution-inventory · Pollution Inventory ${year} · ` +
    `${filing.counts.sites.toLocaleString("en-GB")} sites filed ` +
    `(${filing.counts.airSites.toLocaleString("en-GB")} reporting to air) · ` +
    `vintage published ${sourceDate ?? "date not stated"}`;
  if (verifyOnly) {
    console.log(`${base} — golden checks OK (verify-only, nothing filed)`);
    return;
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    try {
      await filePollutionInventory(client, filing, { progress, restart });
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  console.log(`${base} — golden checks OK`);
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  run().catch((err) => {
    console.error(`load-pollution-inventory FAILED: ${err.message}`);
    process.exit(1);
  });
}
