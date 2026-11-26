// Loader: council_tax_charges — the billing authorities'
// average Band D council tax, England and Wales (plan step
// M5.10; founder rulings Q1–Q6 of the M5.10 gap check,
// 13 Nov 2026, decision D16).
//
// THE MANUAL CLASS. Unlike the other loaders there is NO
// feed to poll: council tax is set once a year, and the
// figures that matter are the publishers' own summary
// tables. So this loader is a seed, filed by hand from the
// published releases, re-run by the operator each spring
// when the new year's releases land (the runner keeps it
// due-once and static, the M5.10 precedent it already
// cites). The revision canary (loaders/canary.mjs) watches
// for the two shapes of trouble: a filed year quietly
// revised, and a new year's release landing.
//
// SOURCES, both official and free:
//   England — MHCLG, "Council Tax levels set by local
//   authorities in England" (annual GOV.UK release):
//     Tables 1-9 (.ods): Table 9 carries the AREA Band D
//     per billing authority — the filed headline — and
//     Tables 8a/8c each authority's own element excluding
//     and including parish precepts, 8b the counties, 8d
//     the police and crime commissioners, 8e the fire
//     authorities, 8f the combined authorities. A body's
//     element already includes anything it levies for
//     (adult social care sits inside the county/billing
//     element it belongs to; a fire service run by a
//     county or a unitary sits inside that body's element
//     and files as NO fire component — never borrowed).
//     Table 10 (.ods): the billing authorities' revenue
//     accounts — requirement and tax base per authority,
//     from which the same two numbers (own element
//     excluding parishes; the average parish precept) fall
//     out a second, independent way.
//   Wales — Welsh Government via StatsWales, "Composition
//   of average Band D council tax by billing authority":
//   per unitary authority the county element excluding
//   community councils, the average community element, the
//   police element and the total. Wales is unitary: no
//   county tier, no GLA, no combined authority — the
//   schema's nation CHECKs hold that line in the data.
//
// THE IDENTITY every filed row must satisfy, asserted
// here before anything is filed (a failure files NOTHING
// and says why): components + the average parish or
// community element = the published area Band D, to the
// penny; and, for England, Table 10's arithmetic agrees
// with Table 8's printed averages to the penny (both are
// roundings of the same unrounded quotients, so a penny
// of tolerance covers the rounding and nothing else).
// London is asserted as a set: every borough's area
// figure minus its own including-parish element is the
// SAME number — the GLA element — except the City of
// London, whose GLA precept is abated and which files its
// own difference if it is ever seeded.
//
// SEED SCOPE (the step's own terms): the three golden
// areas plus ten further authorities verified the same
// way — the spot-check set, recorded in
// loaders/council-tax-spot-check.md. Every other
// authority stays UNFILED, which serving reads as the
// honest "not published" state; the spring pass extends
// AREA_PRECEPTORS below (the release prints no
// district-to-county membership, so membership is
// operator reference data) and files the rest. --all
// refuses, listing the unmapped authorities, until the
// map covers every billing authority in the release.
//
// BANDS ARE NEVER DATA: no band column beyond Band D
// exists in the table, and none is computed here. The
// other bands are statutory ratios of Band D (England A
// 6/9 to H 18/9; Wales A 6/9 to I 21/9 on 2003 values),
// applied at answer time in the brain (M6) — the nation
// column is what tells the brain which ratio set a row
// takes.
//
// Run it (DATABASE_URL from .env, Key K6):
//   npm run load:council-tax                 live seed
//   npm run load:council-tax -- --all        full national pass
//   npm run load:council-tax -- --file <dir> filed from local release files
//   npm run load:council-tax -- --verify-only  parse + assert, file nothing
//
// Live files are the two ODS downloads named below plus
// the StatsWales CSV export; --file reads the same three
// names (Tables_1-9.ods, Table_10.ods,
// wales-composition.csv) from a directory — the fixture
// sets under tests/fixtures/ are trimmed cuts of the real
// releases in exactly this shape. The ODS fixtures travel
// through the repo's text-only push channel base64-encoded
// (Tables_1-9.ods.b64, Table_10.ods.b64 — the OS
// Greenspace precedent) and are decoded by readFixtureOds
// below; a plain .ods beside its .b64 wins.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import yauzl from "yauzl";
import { createLoaderResume } from "./loader-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

const { Pool } = pg;

export const ENGLAND_SOURCE_NAME =
  "MHCLG — Council Tax levels set by local authorities in England (Tables 8, 9 and 10)";
export const WALES_SOURCE_NAME =
  "Welsh Government via StatsWales — Composition of average Band D council tax by billing authority";
export const STATSWALES_DATASET_ID = "3ca971eb-7d9b-4b79-89fa-6d7f77431aad";

// Release dates of the years this loader knows, keyed by
// tax year: fixture mode stamps rows from here; live mode
// reads the England date from the GOV.UK release itself
// and the Welsh date from the dataset metadata, so these
// are the fallback record, extended by the operator as
// part of each spring pass. Each year's England date is
// the state of the release its figures were verified
// against — for 2025-26 that is the REVISED re-issue of
// 22 Apr 2026 (the original publication was 20 Mar 2025),
// because the revised tables are the ones that file. The
// Welsh date is the StatsWales dataset's own
// last-updated stamp — the version of the dataset the
// rows were read from.
export const RELEASES = {
  "2026-27": { england: "2026-03-25", wales: "2026-03-24" },
  "2025-26": { england: "2026-04-22", wales: "2026-03-24" },
};

// The tax year whose April start is the most recent —
// what "the live year" means at any date (in November
// 2026, 2026-27). Shared with the council-tax canary.
export function currentTaxYear(at = new Date()) {
  const aprilYear = at.getMonth() >= 3 ? at.getFullYear() : at.getFullYear() - 1;
  return `${aprilYear}-${String((aprilYear + 1) % 100).padStart(2, "0")}`;
}

export function previousTaxYear(taxYear) {
  const start = Number(taxYear.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function nextTaxYear(taxYear) {
  const start = Number(taxYear.slice(0, 4)) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function englandReleaseSlug(taxYear) {
  const start = Number(taxYear.slice(0, 4));
  return `council-tax-levels-set-by-local-authorities-in-england-${start}-to-${start + 1}`;
}

// The 22 Welsh unitary authorities, name as printed by
// StatsWales → ONS code (the stable W060000xx series).
// Cardiff W06000015 and Swansea W06000011 are golden
// authorities; the rest serve the spring pass.
export const WALES_CODES = {
  "Isle of Anglesey": "W06000001",
  Gwynedd: "W06000002",
  Conwy: "W06000003",
  Denbighshire: "W06000004",
  Flintshire: "W06000005",
  Wrexham: "W06000006",
  Powys: "W06000007",
  Ceredigion: "W06000008",
  Pembrokeshire: "W06000009",
  Carmarthenshire: "W06000010",
  Swansea: "W06000011",
  "Neath Port Talbot": "W06000012",
  Bridgend: "W06000013",
  "Vale of Glamorgan": "W06000014",
  Cardiff: "W06000015",
  "Rhondda Cynon Taf": "W06000016",
  "Merthyr Tydfil": "W06000017",
  Caerphilly: "W06000018",
  "Blaenau Gwent": "W06000019",
  Torfaen: "W06000020",
  Monmouthshire: "W06000021",
  Newport: "W06000022",
};

// Which precepting bodies' elements make up each seeded
// English billing authority's area figure — names
// VERBATIM as Tables 8b/8d/8e/8f print them (the loader
// fails loudly if a name here is not in the release).
// London boroughs are absent by design: the GLA element
// comes from the per-borough identity, asserted uniform
// across the release. A combined authority whose printed
// element is £0.00 levies no general charge that year and
// files as no component. The spring pass extends this map
// county by county; --all lists whatever is still missing.
export const AREA_PRECEPTORS = {
  E07000067: {
    county: "Essex",
    police: "Essex Police",
    fire: "Essex Police, Fire and Crime Commissioner - Fire",
  },
  E07000070: {
    county: "Essex",
    police: "Essex Police",
    fire: "Essex Police, Fire and Crime Commissioner - Fire",
  },
  E07000072: {
    county: "Essex",
    police: "Essex Police",
    fire: "Essex Police, Fire and Crime Commissioner - Fire",
  },
  E07000208: { county: "Surrey", police: "Surrey Police" },
  E07000207: { county: "Surrey", police: "Surrey Police" },
  E07000210: { county: "Surrey", police: "Surrey Police" },
  E07000178: { county: "Oxfordshire", police: "Thames Valley Police" },
  E08000025: {
    police: "West Midlands Police",
    fire: "West Midlands Fire and Rescue Authority",
    combinedAuthority: "West Midlands",
  },
};

// The seed set: the three golden areas (Braintree,
// Newham, Epsom and Ewell), Cardiff for Wales and the
// spot-check set — ten further authorities verified the
// same way, recorded in council-tax-spot-check.md.
export const SEED_CODES = [
  "E07000067",
  "E09000025",
  "E07000208",
  "W06000015",
  "W06000011",
  "E09000030",
  "E07000178",
  "E07000070",
  "E07000207",
  "E07000210",
  "E07000072",
  "E09000021",
  "E08000025",
];

// Golden authorities: the figures the loader asserts
// EXACTLY (whole pence, as published) for the year being
// filed, before anything is written. The 2025-26 set is
// the rehearsal year (the fully verified release the prep
// pinned: Newham £1,855.96 exact; Braintree's components
// £2,133.54 before its £61.13 average parish element;
// Epsom and Ewell £2,416.84 AS THE REVISED RELEASE PRINTS
// IT — the prep's £2,416.39 came from the council minutes
// and used a Surrey Police element 45p lower than the
// release's £337.57; the release is what files, and the
// difference is recorded in the spot-check record).
const GOLDENS = {
  "2026-27": [
    {
      code: "E07000067",
      bandD: 228034,
      billing: 20601,
      county: 164196,
      police: 27531,
      fire: 9252,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true,
    },
    {
      code: "E09000025",
      bandD: 194423,
      billing: 143372,
      county: null,
      police: null,
      fire: null,
      gla: 51051,
      combinedAuthority: null,
      parishAveraged: false,
    },
    {
      code: "E07000208",
      bandD: 253084,
      billing: 23985,
      county: 193842,
      police: 35257,
      fire: null,
      gla: null,
      combinedAuthority: null,
      parishAveraged: false,
    },
    {
      code: "W06000015",
      bandD: 201318,
      billing: 160372,
      county: null,
      police: 40514,
      fire: null,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true,
    },
    {
      code: "W06000011",
      bandD: 223829,
      billing: 180738,
      county: null,
      police: 40514,
      fire: null,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true,
    },
    {
      code: "E09000030",
      bandD: 183778,
      billing: 132727,
      county: null,
      police: null,
      fire: null,
      gla: 51051,
      combinedAuthority: null,
      parishAveraged: false,
    },
    {
      code: "E07000178",
      bandD: 267840,
      billing: 36738,
      county: 200678,
      police: 29828,
      fire: null,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true,
    },
    {
      code: "E07000070",
      bandD: 230018,
      billing: 23485,
      county: 164196,
      police: 27531,
      fire: 9252,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true,
    },
    {
      code: "E07000207",
      bandD: 255775,
      billing: 26588,
      county: 193842,
      police: 35257,
      fire: null,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true,
    },
    {
      code: "E07000210",
      bandD: 251986,
      billing: 21759,
      county: 193842,
      police: 35257,
      fire: null,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true,
    },
    {
      code: "E07000072",
      bandD: 227721,
      billing: 17712,
      county: 164196,
      police: 27531,
      fire: 9252,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true,
    },
    {
      code: "E09000021",
      bandD: 260920,
      billing: 209869,
      county: null,
      police: null,
      fire: null,
      gla: 51051,
      combinedAuthority: null,
      parishAveraged: false,
    },
    {
      code: "E08000025",
      bandD: 236290,
      billing: 202348,
      county: null,
      police: 24450,
      fire: 8519,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true,
    },
  ],
  "2025-26": [
    {
      code: "E07000067",
      bandD: 219467,
      billing: 20601,
      county: 157959,
      police: 26037,
      fire: 8757,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true,
    },
    {
      code: "E09000025",
      bandD: 185596,
      billing: 136558,
      county: null,
      police: null,
      fire: null,
      gla: 49038,
      combinedAuthority: null,
      parishAveraged: false,
    },
    {
      code: "E07000208",
      bandD: 241684,
      billing: 23292,
      county: 184635,
      police: 33757,
      fire: null,
      gla: null,
      combinedAuthority: null,
      parishAveraged: false,
    },
    {
      code: "W06000015",
      bandD: 192618,
      billing: 154352,
      county: null,
      police: 37867,
      fire: null,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true,
    },
    {
      code: "W06000011",
      bandD: 214288,
      billing: 173961,
      county: null,
      police: 37867,
      fire: null,
      gla: null,
      combinedAuthority: null,
      parishAveraged: true,
    },
  ],
};

export function goldenChecks(rows, taxYear) {
  const goldens = GOLDENS[taxYear];
  if (!goldens) return;
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const fields = [
    "bandD",
    "billing",
    "county",
    "police",
    "fire",
    "gla",
    "combinedAuthority",
    "parishAveraged",
  ];
  for (const golden of goldens) {
    const row = byCode.get(golden.code);
    if (!row)
      throw new Error(
        `golden check: ${golden.code} is a golden authority for ${taxYear} but was not built from the release — the release shape has moved; nothing filed`,
      );
    for (const field of fields) {
      if (row[field] !== golden[field])
        throw new Error(
          `golden check: ${golden.code} ${field} is ${row[field]}, the verified figure is ${golden[field]} — nothing filed`,
        );
    }
  }
}

// ------------------------------------------------------------------
// Reading the published files.
//
// The ODS reader is deliberately small: it walks the
// spreadsheet's content.xml for the named sheets, expanding
// repeated rows/columns, and returns each sheet as rows of
// cell values (number for value cells, string for text
// cells, null for empty/covered). It is keyed to the
// publishers' table SHAPES — header rows found by their
// printed column titles, data rows by ONS code — never to
// fixed positions, and every shape assumption is checked
// with a loud error: a release that changes shape fails
// the run, it never files a quietly wrong number.

function readZipEntry(zipBuffer, wanted) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      let settled = false;
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (entry.fileName !== wanted) return zip.readEntry();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => {
            settled = true;
            resolve(Buffer.concat(chunks));
          });
          stream.on("error", reject);
        });
      });
      zip.on("end", () => {
        if (!settled) reject(new Error(`${wanted} is not inside the .ods file`));
      });
      zip.on("error", reject);
    });
  });
}

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function cellText(inner) {
  const parts = [];
  for (const match of inner.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)) {
    parts.push(match[1].replace(/<[^>]+>/g, ""));
  }
  return decodeEntities(parts.join(" ")).trim();
}

function parseSheetRows(xml, sheetName) {
  const tableTag = /<table:table\b[^>]*>/g;
  let match;
  let start = -1;
  while ((match = tableTag.exec(xml)) !== null) {
    const name = /table:name="([^"]+)"/.exec(match[0]);
    if (name && name[1] === sheetName) {
      start = match.index;
      break;
    }
  }
  if (start === -1)
    throw new Error(`the release has no sheet named ${sheetName} — its shape has moved`);
  const end = xml.indexOf("</table:table>", start);
  const sheetXml = xml.slice(start, end === -1 ? undefined : end);
  const rows = [];
  for (const rowMatch of sheetXml.matchAll(
    /<table:table-row\b([^>]*?)>([\s\S]*?)<\/table:table-row>|<table:table-row\b([^>]*?)\/>/g,
  )) {
    const attrs = rowMatch[1] ?? rowMatch[3] ?? "";
    const inner = rowMatch[2] ?? "";
    const repeat = Math.min(
      Number(/table:number-rows-repeated="(\d+)"/.exec(attrs)?.[1] ?? 1),
      100,
    );
    const cells = [];
    for (const cellMatch of inner.matchAll(
      /<table:(table-cell|covered-table-cell)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g,
    )) {
      const cellAttrs = cellMatch[2] ?? "";
      const cellRepeat = Math.min(
        Number(/table:number-columns-repeated="(\d+)"/.exec(cellAttrs)?.[1] ?? 1),
        64,
      );
      let value = null;
      if (cellMatch[1] === "table-cell") {
        const type = /office:value-type="([^"]+)"/.exec(cellAttrs)?.[1];
        const raw = /office:value="([^"]+)"/.exec(cellAttrs)?.[1];
        const dateRaw = /office:date-value="([^"]+)"/.exec(cellAttrs)?.[1];
        if ((type === "float" || type === "percentage") && raw !== undefined) value = Number(raw);
        else if (type === "date" && dateRaw !== undefined) value = dateRaw.slice(0, 10);
        else {
          const text = cellText(cellMatch[3] ?? "");
          value = text === "" ? null : text;
        }
      }
      for (let i = 0; i < cellRepeat; i++) cells.push(value);
    }
    if (cells.every((cell) => cell === null)) continue;
    rows.push(cells);
    // Repeated data rows (identical neighbours) are kept;
    // repeated EMPTY rows were dropped above — positions
    // are never used, headers and data are found by content.
    for (let i = 1; i < repeat; i++) rows.push(cells);
  }
  return rows;
}

export async function parseOdsSheets(buffer, sheetNames) {
  const xml = (await readZipEntry(buffer, "content.xml")).toString("utf8");
  const sheets = new Map();
  for (const name of sheetNames) sheets.set(name, parseSheetRows(xml, name));
  return sheets;
}

// A small CSV reader (quoted fields, doubled quotes) — the
// StatsWales export is plain, but its Notes column is free
// text and earns the care.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const pence = (pounds) => Math.round(pounds * 100);
const BILLING_CODE = /^E\d{8}$/;

function headerRowIndex(rows, needles) {
  for (let i = 0; i < rows.length; i++) {
    const texts = rows[i].map((cell) => (typeof cell === "string" ? cell : ""));
    if (needles.every((needle) => texts.some((text) => text.includes(needle)))) return i;
  }
  throw new Error(`no header row carrying ${needles.join(" + ")} — the release shape has moved`);
}

function columnIndex(header, prefix, suffix) {
  for (let i = 0; i < header.length; i++) {
    const cell = header[i];
    if (typeof cell !== "string") continue;
    if (cell.startsWith(prefix) && (suffix === undefined || cell.trimEnd().endsWith(suffix)))
      return i;
  }
  throw new Error(`no column starting "${prefix}" — the release shape has moved`);
}

// Parses the two England ODS files into the pieces the row
// builder reconciles. Throws on any shape surprise.
export async function parseEnglandRelease(tablesBuffer, table10Buffer) {
  const tables = await parseOdsSheets(tablesBuffer, [
    "Table_9",
    "Table_8a",
    "Table_8c",
    "Table_8b",
    "Table_8d",
    "Table_8e",
    "Table_8f",
  ]);
  const table10 = await parseOdsSheets(table10Buffer, ["Data_Billing"]);

  const table9 = tables.get("Table_9");
  let taxYear = null;
  for (const row of table9.slice(0, 6)) {
    for (const cell of row) {
      if (typeof cell !== "string" || !cell.startsWith("Table 9")) continue;
      const found = /(\d{4}) to (\d{4})/.exec(cell);
      if (found) taxYear = `${found[1]}-${found[2].slice(2)}`;
    }
    if (taxYear) break;
  }
  if (!taxYear)
    throw new Error("Table 9's title carries no tax year — the release shape has moved");

  const h9 = headerRowIndex(table9, ["ONS Code", "Band D"]);
  const code9 = columnIndex(table9[h9], "ONS Code");
  const name9 = columnIndex(table9[h9], "Authority");
  const bandD9 = columnIndex(table9[h9], "Band D");
  const area = new Map();
  for (const row of table9.slice(h9 + 1)) {
    const code = row[code9];
    if (typeof code !== "string" || !BILLING_CODE.test(code)) continue;
    if (typeof row[bandD9] !== "number")
      throw new Error(`Table 9: ${code} has no numeric Band D — the release shape has moved`);
    area.set(code, { name: row[name9], bandD: pence(row[bandD9]) });
  }

  const own = new Map();
  for (const [sheet, exclPrefix, inclPrefix] of [
    [
      "Table_8a",
      "Average council tax for the authority including adult social care, excluding parish precepts",
      "Average council tax for the authority including adult social care and parish precepts",
    ],
    [
      "Table_8c",
      "Average council tax for the authority excluding parish precepts",
      "Average council tax for the authority including parish precepts",
    ],
  ]) {
    const rows = tables.get(sheet);
    const h = headerRowIndex(rows, ["ONS Code", "parish precepts"]);
    const codeAt = columnIndex(rows[h], "ONS Code");
    const exclAt = columnIndex(rows[h], exclPrefix);
    const inclAt = columnIndex(rows[h], inclPrefix);
    for (const row of rows.slice(h + 1)) {
      const code = row[codeAt];
      if (typeof code !== "string" || !BILLING_CODE.test(code)) continue;
      if (typeof row[exclAt] !== "number" || typeof row[inclAt] !== "number")
        throw new Error(
          `${sheet}: ${code} has no numeric own element — the release shape has moved`,
        );
      own.set(code, { excl: pence(row[exclAt]), incl: pence(row[inclAt]) });
    }
  }

  const preceptors = new Map();
  for (const sheet of ["Table_8b", "Table_8d", "Table_8e", "Table_8f"]) {
    const rows = tables.get(sheet);
    const h = headerRowIndex(rows, ["ONS Code", "Average council tax"]);
    const nameAt = columnIndex(rows[h], "Authority");
    const valueAt = columnIndex(rows[h], "Average council tax");
    for (const row of rows.slice(h + 1)) {
      const name = row[nameAt];
      if (typeof name !== "string" || name === "" || typeof row[valueAt] !== "number") continue;
      preceptors.set(name, pence(row[valueAt]));
    }
  }

  const billingSheet = table10.get("Data_Billing");
  const hb = headerRowIndex(billingSheet, ["ONS Code", "Council Tax Requirement"]);
  const codeB = columnIndex(billingSheet[hb], "ONS Code");
  const line1 = columnIndex(billingSheet[hb], "1. Council Tax Requirement", "(current year)");
  const line2 = columnIndex(billingSheet[hb], "2. Parish precepts", "(current year)");
  const line3 = columnIndex(billingSheet[hb], "3. Council Tax Requirement", "(current year)");
  const line7 = columnIndex(billingSheet[hb], "7. Council tax base", "(current year)");
  void line1;
  const billing = new Map();
  for (const row of billingSheet.slice(hb + 1)) {
    const code = row[codeB];
    if (typeof code !== "string" || !BILLING_CODE.test(code)) continue;
    const base = row[line7];
    if (typeof base !== "number" || !(base > 0) || typeof row[line3] !== "number")
      throw new Error(
        `Table 10: ${code} has no usable requirement/tax base — the release shape has moved`,
      );
    billing.set(code, {
      billing: pence(row[line3] / base),
      parish: pence((typeof row[line2] === "number" ? row[line2] : 0) / base),
    });
  }

  return { taxYear, area, own, preceptors, billing };
}

// Parses the StatsWales composition export for one tax
// year into a row per mapped Welsh authority.
export function parseWales(text, taxYear) {
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const at = (name) => {
    const index = header.indexOf(name);
    if (index === -1)
      throw new Error(`the StatsWales export has no "${name}" column — its shape has moved`);
    return index;
  };
  const valueAt = at("Data values");
  const descriptionAt = at("Data description");
  const rowAt = at("Row");
  const yearAt = at("Year");
  const authorityAt = at("Authority");
  const byAuthority = new Map();
  for (const row of rows.slice(1)) {
    if (row[yearAt] !== taxYear || row[descriptionAt] !== "£ per band D") continue;
    const name = row[authorityAt];
    if (!byAuthority.has(name)) byAuthority.set(name, {});
    byAuthority.get(name)[row[rowAt]] = Number(row[valueAt]);
  }
  const parsed = [];
  for (const [name, parts] of byAuthority) {
    const code = WALES_CODES[name];
    if (!code) continue; // the Wales-total row and any unmapped name
    const total = parts["Total CT for billing authority area"];
    const countyExc = parts["County council CT (exc. community councils)"];
    const community = parts["Community council CT"];
    const police = parts["Police council tax within county area"];
    if ([total, countyExc, community, police].some((v) => typeof v !== "number" || Number.isNaN(v)))
      throw new Error(
        `StatsWales: ${name} is missing one of its composition parts for ${taxYear} — its shape has moved`,
      );
    const bandD = pence(total);
    const billing = pence(countyExc);
    const policePence = pence(police);
    const communityPence = pence(community);
    if (Math.abs(billing + communityPence + policePence - bandD) > 1)
      throw new Error(
        `StatsWales: ${name}'s parts (${billing} + ${communityPence} + ${policePence}) do not reconcile to its total ${bandD} — nothing filed`,
      );
    parsed.push({
      code,
      name,
      nation: "wales",
      bandD,
      parishAveraged: communityPence > 0,
      billing,
      county: null,
      police: policePence,
      fire: null,
      gla: null,
      combinedAuthority: null,
    });
  }
  return parsed;
}

// ------------------------------------------------------------------
// Building filed rows: the reconciliation gauntlet.

const sumComponents = (row) =>
  (row.billing ?? 0) +
  (row.county ?? 0) +
  (row.police ?? 0) +
  (row.fire ?? 0) +
  (row.gla ?? 0) +
  (row.combinedAuthority ?? 0);

function englandRow(code, england) {
  const area = england.area.get(code);
  const own = england.own.get(code);
  const cross = england.billing.get(code);
  if (!area || !own || !cross)
    throw new Error(
      `${code} is missing from one of Table 9, Table 8 or Table 10 — the release is incomplete; nothing filed`,
    );
  const parish = own.incl - own.excl;
  if (Math.abs(cross.billing - own.excl) > 1 || Math.abs(cross.parish - parish) > 1)
    throw new Error(
      `${code}: Table 10's arithmetic (own element ${cross.billing}p, parish average ${cross.parish}p) disagrees with Table 8's printed averages (${own.excl}p, ${parish}p) by more than the rounding penny — the release does not reconcile with itself; nothing filed`,
    );
  const row = {
    code,
    name: area.name,
    nation: "england",
    bandD: area.bandD,
    parishAveraged: parish > 0,
    billing: own.excl,
    county: null,
    police: null,
    fire: null,
    gla: null,
    combinedAuthority: null,
  };
  if (code.startsWith("E09000")) {
    // London: the GLA element is the borough's own
    // identity; uniformity across boroughs is asserted
    // for the whole release in buildRows.
    row.gla = area.bandD - own.incl;
  } else {
    const map = AREA_PRECEPTORS[code];
    if (!map) return null; // membership not yet mapped — the spring pass's work
    const pick = (name, role) => {
      if (name === undefined) return null;
      const value = england.preceptors.get(name);
      if (value === undefined)
        throw new Error(
          `${code}: AREA_PRECEPTORS names ${role} "${name}", which the release does not print — the map or the release has moved; nothing filed`,
        );
      return value;
    };
    row.county = pick(map.county, "county");
    row.police = pick(map.police, "police");
    row.fire = pick(map.fire, "fire");
    const ca = pick(map.combinedAuthority, "combined authority");
    row.combinedAuthority = ca !== null && ca > 0 ? ca : null;
  }
  if (Math.abs(sumComponents(row) + parish - area.bandD) > 1)
    throw new Error(
      `${code}: components (${sumComponents(row)}p) + parish average (${parish}p) do not reconcile to the area Band D (${area.bandD}p) — nothing filed`,
    );
  return row;
}

// Asserts the GLA identity holds uniformly across every
// London borough in the release (the City of London
// excepted — its precept is abated), and that a seeded
// borough's element is that uniform figure.
function assertGlaUniformity(england) {
  const diffs = new Map();
  for (const [code, area] of england.area) {
    if (!code.startsWith("E09000")) continue;
    const own = england.own.get(code);
    if (!own) continue;
    diffs.set(code, area.bandD - own.incl);
  }
  const counts = new Map();
  for (const [code, diff] of diffs) {
    if (code === "E09000001") continue;
    counts.set(diff, (counts.get(diff) ?? 0) + 1);
  }
  const distinct = [...counts.keys()];
  if (distinct.length > 1)
    throw new Error(
      `the GLA identity is not uniform across London boroughs in this release (${distinct.join(", ")}) — the release shape has moved; nothing filed`,
    );
  return distinct[0] ?? null;
}

// mode "seed": build exactly the given codes (all must be
// buildable). mode "all": build every authority in the
// releases; English authorities whose precept membership
// is not yet mapped are collected and reported, unfiled.
export function buildRows(england, walesRows, { mode, codes }) {
  const glaElement = assertGlaUniformity(england);
  const rows = [];
  const unfiled = [];
  const englandRowFor = (code) => {
    const row = englandRow(code, england);
    if (
      row &&
      row.gla !== null &&
      code !== "E09000001" &&
      glaElement !== null &&
      row.gla !== glaElement
    )
      throw new Error(
        `${code}: its GLA identity (${row.gla}p) is not the release's uniform GLA element (${glaElement}p) — nothing filed`,
      );
    return row;
  };
  if (mode === "seed") {
    for (const code of codes) {
      if (code.startsWith("W")) {
        const row = walesRows.find((candidate) => candidate.code === code);
        if (!row)
          throw new Error(
            `${code} is a seed authority but is not in the Welsh release — nothing filed`,
          );
        rows.push(row);
      } else {
        const row = englandRowFor(code);
        if (!row)
          throw new Error(
            `${code} is a seed authority but its precept membership is not mapped in AREA_PRECEPTORS — nothing filed`,
          );
        rows.push(row);
      }
    }
    return { rows, unfiled };
  }
  for (const code of england.area.keys()) {
    const row = englandRowFor(code);
    if (row) rows.push(row);
    else unfiled.push(code);
  }
  for (const row of walesRows) rows.push(row);
  return { rows, unfiled };
}

// ------------------------------------------------------------------
// Filing. Seed mode upserts its authorities (a re-run with
// a revised release corrects them in place and can never
// delete a fuller pass's rows); the full pass swaps the
// whole tax year through the stage table.

function rowValues(row, taxYear) {
  return [
    row.code,
    row.name,
    row.nation,
    taxYear,
    row.bandD,
    row.parishAveraged,
    row.billing,
    row.county,
    row.police,
    row.fire,
    row.gla,
    row.combinedAuthority,
    row.sourceName,
    row.sourceDate,
  ];
}

const PLACEHOLDERS = "($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)";

/**
 * @param {any} pool
 * @param {any[]} rows
 * @param {string} taxYear
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export async function fileSeedRows(pool, rows, taxYear, { progress = null } = {}) {
  const client = await pool.connect();
  // BUG-265: the seed is short, so the tally's step is
  // small — a line every 10 authorities, with the genuine
  // total and percentage.
  const fileTally = progress?.tally({
    label: "file",
    total: rows.length,
    every: 10,
    unit: "authorities",
  });
  try {
    await client.query("BEGIN");
    for (const [i, row] of rows.entries()) {
      await client.query(
        `INSERT INTO council_tax_charges (billing_authority_ons_code, authority_name, nation, tax_year, band_d_area_average_pence, parish_averaged, billing_authority_component_pence, county_component_pence, police_component_pence, fire_component_pence, gla_component_pence, combined_authority_component_pence, source_name, source_date) VALUES ${PLACEHOLDERS}
         ON CONFLICT (billing_authority_ons_code, tax_year) DO UPDATE SET
           authority_name = EXCLUDED.authority_name,
           nation = EXCLUDED.nation,
           band_d_area_average_pence = EXCLUDED.band_d_area_average_pence,
           parish_averaged = EXCLUDED.parish_averaged,
           billing_authority_component_pence = EXCLUDED.billing_authority_component_pence,
           county_component_pence = EXCLUDED.county_component_pence,
           police_component_pence = EXCLUDED.police_component_pence,
           fire_component_pence = EXCLUDED.fire_component_pence,
           gla_component_pence = EXCLUDED.gla_component_pence,
           combined_authority_component_pence = EXCLUDED.combined_authority_component_pence,
           source_name = EXCLUDED.source_name,
           source_date = EXCLUDED.source_date,
           loaded_at = now()`,
        rowValues(row, taxYear),
      );
      fileTally?.tick(i + 1);
      progress?.heartbeat({ stage: "file", done: i + 1, total: rows.length });
    }
    await client.query("COMMIT");
    fileTally?.finish(rows.length);
  } catch (error) {
    progress?.failed({
      stage: "file",
      filed: 0,
      total: rows.length,
      error,
      resume: "re-run from scratch (the filing transaction rolls back)",
    });
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @param {any} pool
 * @param {any[]} rows
 * @param {string} taxYear
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, resume?: { restart?: boolean } | null }} [options]
 */
export async function fileAllRows(
  pool,
  rows,
  taxYear,
  { progress = null, resume: resumeOpts = null } = {},
) {
  const client = await pool.connect();
  // BUG-265: the full filing stages in chunks of 100 — a
  // line per chunk, with the genuine total and percentage.
  // BUG-368: with the resume option the stage is a PERSISTENT
  // table (migration 0048) and a loader_checkpoint row records
  // the last fully staged chunk, so a killed run resumes
  // instead of restarting. Without it the filing is exactly
  // the one-shot transaction below (a TEMP stage inside one
  // BEGIN…COMMIT). The edition is the tax year — a checkpoint
  // only ever belongs to the year it staged. The seed filer
  // is deliberately untouched: its upserts are already atomic
  // and idempotent, and a staging+swap would change its
  // semantics (a seed re-run must never delete a fuller
  // pass's rows).
  const fileTally = progress?.tally({
    label: "file",
    total: rows.length,
    every: 100,
    unit: "authorities",
  });
  const fileWatch = createBatchWatch();
  let staged = 0;
  let resume = null;
  try {
    if (resumeOpts) {
      await client.query(
        `CREATE TABLE IF NOT EXISTS council_tax_charges_stage (LIKE council_tax_charges INCLUDING ALL, seq bigint NOT NULL, UNIQUE (seq))`,
      );
      resume = createLoaderResume(client, {
        loader: "load-council-tax",
        stageTable: "council_tax_charges_stage",
        progress,
        restart: resumeOpts.restart ?? false,
      });
      const prep = await resume.prepare({ edition: taxYear, expected: rows.length });
      if (prep.resumed) staged = prep.checkpoint.filed_count;
    } else {
      await client.query("BEGIN");
      await client.query(
        "CREATE TEMP TABLE stg_council_tax_charges (LIKE council_tax_charges INCLUDING ALL) ON COMMIT DROP",
      );
    }
    const stageTable = resume ? "council_tax_charges_stage" : "stg_council_tax_charges";
    for (let at = staged; at < rows.length; at += 100) {
      const started = Date.now();
      const chunk = rows.slice(at, at + 100);
      const tuples = [];
      const values = [];
      const base = resume ? resume.takeSeq(chunk.length) : 0;
      chunk.forEach((row, index) => {
        const b = resume ? index * 15 : index * 14;
        tuples.push(
          resume
            ? `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12}, $${b + 13}, $${b + 14}, $${b + 15})`
            : `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12}, $${b + 13}, $${b + 14})`,
        );
        values.push(...rowValues(row, taxYear));
        if (resume) values.push(base + index);
      });
      await client.query(
        `INSERT INTO ${stageTable} (billing_authority_ons_code, authority_name, nation, tax_year, band_d_area_average_pence, parish_averaged, billing_authority_component_pence, county_component_pence, police_component_pence, fire_component_pence, gla_component_pence, combined_authority_component_pence, source_name, source_date${resume ? ", seq" : ""}) VALUES ${tuples.join(", ")}`,
        values,
      );
      staged += chunk.length;
      // The tally counts absolute rows, so a resumed run's
      // first tick lands at its true position.
      fileTally?.tick(at + chunk.length);
      progress?.heartbeat({ stage: "file", done: at + chunk.length, total: rows.length });
      const { tookMs, averageMs, slow } = fileWatch.observe(Date.now() - started);
      if (slow) {
        progress?.warning({
          what: "file chunk duration",
          value: `chunk at ${at} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
      if (resume) {
        await resume.checkpoint({
          edition: taxYear,
          expected: rows.length,
          nextStartIndex: staged,
          read: staged,
          filed: staged,
          unit: "authorities",
        });
      }
    }
    fileTally?.finish(rows.length);
    if (resume) {
      // The staged row count must match before the year's
      // rows are swapped in.
      const stagedRes = await client.query(
        "SELECT count(*)::int AS n FROM council_tax_charges_stage",
      );
      if (stagedRes.rows[0].n !== rows.length)
        throw new Error("the staged authority count does not match — rolling back");
      await client.query("BEGIN");
    }
    try {
      await client.query("DELETE FROM council_tax_charges WHERE tax_year = $1", [taxYear]);
      await client.query(
        `INSERT INTO council_tax_charges (billing_authority_ons_code, authority_name, nation, tax_year, band_d_area_average_pence, parish_averaged, billing_authority_component_pence, county_component_pence, police_component_pence, fire_component_pence, gla_component_pence, combined_authority_component_pence, source_name, source_date) SELECT billing_authority_ons_code, authority_name, nation, tax_year, band_d_area_average_pence, parish_averaged, billing_authority_component_pence, county_component_pence, police_component_pence, fire_component_pence, gla_component_pence, combined_authority_component_pence, source_name, source_date FROM ${stageTable}`,
      );
      await client.query("COMMIT");
    } catch (error) {
      if (resume) await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
    if (resume) {
      // The run is complete: staging + checkpoint go together,
      // so nothing is left behind for the next tax year.
      await resume.clear();
    }
  } catch (error) {
    progress?.failed({
      stage: "file",
      filed: 0,
      total: rows.length,
      error,
      resume: resume
        ? resume.resumeNote()
        : "re-run from scratch (the filing transaction rolls back)",
    });
    if (!resumeOpts) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------------
// Live discovery + main.

async function fetchBuffer(url, what) {
  const response = await fetch(url, {
    headers: { "user-agent": "check-my-next-home council-tax loader" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} from ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchJson(url, what) {
  const response = await fetch(url, {
    headers: { "user-agent": "check-my-next-home council-tax loader" },
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} from ${url}`);
  return response.json();
}

export async function englandReleaseInfo(taxYear) {
  const doc = await fetchJson(
    `https://www.gov.uk/api/content/government/statistics/${englandReleaseSlug(taxYear)}`,
    `the MHCLG ${taxYear} release page`,
  );
  if (!doc) return null;
  const attachments = doc.details?.attachments ?? [];
  const find = (filePattern) =>
    attachments.find((a) => typeof a.url === "string" && filePattern.test(a.url));
  const tables = find(/\/Tables_1-9_[^/]+\.ods$/);
  const table10 = find(/\/Table_10_[^/]+\.ods$/);
  if (!tables?.url || !table10?.url)
    throw new Error(
      `the MHCLG ${taxYear} release page carries no Tables_1-9/Table_10 .ods attachments — its shape has moved`,
    );
  return {
    tablesUrl: tables.url,
    table10Url: table10.url,
    published: (doc.first_published_at ?? doc.public_updated_at ?? "").slice(0, 10),
    updated: (doc.public_updated_at ?? "").slice(0, 10),
    attachmentTitles: attachments.map((a) => a.title ?? ""),
  };
}

// Reads one ODS fixture from a --file directory: the
// plain file when present, else its base64 travel form.
export async function readFixtureOds(dir, name) {
  try {
    return await readFile(join(dir, name));
  } catch {
    const encoded = await readFile(join(dir, `${name}.b64`), "utf8");
    return Buffer.from(encoded.replace(/\s+/g, ""), "base64");
  }
}

async function loadInputs(args, { progress = null } = {}) {
  if (args.fileDir) {
    progress?.stage("reading the fixture release");
    const tables = await readFixtureOds(args.fileDir, "Tables_1-9.ods");
    const table10 = await readFixtureOds(args.fileDir, "Table_10.ods");
    let walesText = null;
    try {
      walesText = await readFile(join(args.fileDir, "wales-composition.csv"), "utf8");
    } catch {
      walesText = null; // an England-only fixture set is legitimate
    }
    const england = await parseEnglandRelease(tables, table10);
    const known = RELEASES[england.taxYear];
    if (!known)
      throw new Error(
        `no recorded release dates for ${england.taxYear} — add them to RELEASES as part of the spring pass`,
      );
    return {
      england,
      walesText,
      englandStamp: { sourceName: ENGLAND_SOURCE_NAME, sourceDate: known.england },
      walesStamp: { sourceName: WALES_SOURCE_NAME, sourceDate: known.wales },
    };
  }
  // Live: the current tax year, falling back one year when
  // its release has not landed yet (early April).
  let taxYear = currentTaxYear();
  let info = await englandReleaseInfo(taxYear);
  if (!info) {
    taxYear = previousTaxYear(taxYear);
    info = await englandReleaseInfo(taxYear);
    if (!info)
      throw new Error(
        `neither the ${currentTaxYear()} nor the ${taxYear} MHCLG release is reachable`,
      );
    console.log(`The ${currentTaxYear()} release has not landed yet; filing ${taxYear}.`);
  }
  progress?.stage(`fetching the MHCLG ${taxYear} release (Tables 1–9 and Table 10)`);
  const [tables, table10] = await Promise.all([
    fetchBuffer(info.tablesUrl, `Tables 1 to 9 for ${taxYear}`),
    fetchBuffer(info.table10Url, `Table 10 for ${taxYear}`),
  ]);
  const england = await parseEnglandRelease(tables, table10);
  if (england.taxYear !== taxYear)
    throw new Error(
      `the ${taxYear} release's Table 9 titles itself ${england.taxYear} — the wrong release is attached; nothing filed`,
    );
  const walesMeta = await fetchJson(
    `https://api.stats.gov.wales/v2/${STATSWALES_DATASET_ID}`,
    "the StatsWales composition dataset metadata",
  );
  progress?.stage("fetching the StatsWales composition export");
  const walesCsv = await fetchBuffer(
    `https://api.stats.gov.wales/v2/${STATSWALES_DATASET_ID}/data?format=csv&page_size=10000&page_number=1`,
    "the StatsWales composition export",
  );
  return {
    england,
    walesText: walesCsv.toString("utf8"),
    englandStamp: {
      sourceName: ENGLAND_SOURCE_NAME,
      sourceDate: info.updated || info.published,
    },
    walesStamp: {
      sourceName: WALES_SOURCE_NAME,
      sourceDate: (walesMeta?.last_updated_at ?? RELEASES[taxYear]?.wales ?? "").slice(0, 10),
    },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const fileAt = argv.indexOf("--file");
  const args = {
    fileDir: fileAt === -1 ? null : argv[fileAt + 1],
    verifyOnly: argv.includes("--verify-only"),
    all: argv.includes("--all"),
    // BUG-368: resume the full pass from the last
    // checkpointed chunk instead of re-staging the whole
    // tax year; with no checkpoint this is a fresh start.
    // The seed pass is untouched (atomic upserts).
    restart: argv.includes("--restart"),
  };
  if (fileAt !== -1 && !args.fileDir) throw new Error("--file needs a directory");

  // BUG-265: one logger for the run — the input stages
  // above, the parsed-authorities count below, and the
  // filing tally inside the filers.
  const progress = createProgressLogger({ name: "load-council-tax" });
  let england;
  let walesText;
  let englandStamp;
  let walesStamp;
  let rows;
  let unfiled = [];
  let taxYear;
  let walesRows = [];
  try {
    ({ england, walesText, englandStamp, walesStamp } = await loadInputs(args, { progress }));
    taxYear = england.taxYear;
    walesRows = walesText ? parseWales(walesText, taxYear) : [];
    if (walesText && walesRows.length === 0)
      throw new Error(
        `the StatsWales composition export carries no ${taxYear} rows yet — the Welsh release is lagging; re-run when it lands rather than filing England alone`,
      );
    if (args.all) {
      ({ rows, unfiled } = buildRows(england, walesRows, { mode: "all" }));
      if (unfiled.length > 0)
        throw new Error(
          `--all refuses: ${unfiled.length} billing authorities have no AREA_PRECEPTORS entry yet (${unfiled.slice(0, 8).join(", ")}…) — extend the map as the spring pass describes; nothing filed`,
        );
    } else {
      const englandRows = buildRows(england, [], {
        mode: "seed",
        codes: SEED_CODES.filter((code) => code.startsWith("E")),
      }).rows;
      const welshRows = buildRows(england, walesRows, {
        mode: "seed",
        codes: SEED_CODES.filter((code) => code.startsWith("W")),
      }).rows;
      rows = [...englandRows, ...welshRows];
    }
    for (const row of rows) Object.assign(row, row.nation === "wales" ? walesStamp : englandStamp);
    goldenChecks(rows, taxYear);
    // BUG-265: the parsed-authorities total is genuine
    // (every England authority in the release plus every
    // Welsh row in the export), so the count carries a real
    // percentage — rows to file against authorities parsed.
    progress.count({
      label: "authorities",
      done: rows.length,
      total: england.area.size + walesRows.length,
      unit: "authorities",
      extra: `for ${taxYear}`,
    });
  } catch (err) {
    progress.failed({
      stage: "parse",
      filed: 0,
      error: err,
      resume: "re-run from scratch (nothing is filed until the filing step)",
    });
    throw err;
  }

  const englandCount = rows.filter((row) => row.nation === "england").length;
  const walesCount = rows.length - englandCount;
  const notYetFiled = england.area.size - englandCount + (walesRows.length - walesCount);
  const summary = args.all
    ? `${formatCount(rows.length)} authorities filed for ${taxYear} (${formatCount(englandCount)} England, ${formatCount(walesCount)} Wales)`
    : `${formatCount(rows.length)} authorities filed for ${taxYear} (${formatCount(englandCount)} England, ${formatCount(walesCount)} Wales); ${formatCount(notYetFiled)} further authorities parsed but not yet filed — their state is "not published" until the spring pass`;
  if (args.verifyOnly) {
    console.log(`Council tax verified for ${taxYear}: ${summary}. Nothing filed.`);
    return;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set — see .env.example (Key K6).");
    process.exit(1);
  }
  const pool = new Pool({ connectionString });
  try {
    if (args.all)
      await fileAllRows(pool, rows, taxYear, { progress, resume: { restart: args.restart } });
    else await fileSeedRows(pool, rows, taxYear, { progress });
  } finally {
    await pool.end();
  }
  console.log(`Council tax filed: ${summary}.`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
