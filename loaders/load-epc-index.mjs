// Loader: the picking index's EPC parts — the Energy
// Performance of Buildings register's bulk domestic
// certificate file, parsed under a strict
// witnessed-shape grammar into the picking index (plan
// step M7.15B; migration 0030; the filing machinery is
// shared with the sales pass in picking-index-filing.mjs).
//
// Run it:
//   node loaders/load-epc-index.mjs --file <directory holding certificates.csv>
//     The bulk file is a FOUNDER-SIDE download (the
//     register's bulk route sits behind a GOV.UK One
//     Login sign-in — there is no URL this loader can
//     fetch), dropped on the server and filed from
//     there. The runner's schedule therefore carries
//     this pass as an operator entry: its monthly
//     "not run" line is the prompt to download and file
//     a fresh copy.
//   node loaders/load-epc-index.mjs --kill-switch
//     Remove every EPC-derived row from the served
//     index (a rebuild from the sales extract alone —
//     see picking-index-filing.mjs). The separability
//     is structural and this switch is its tested
//     deliverable.
//
// LICENSING, AND WHY THE SHAPE IS WHAT IT IS. The
// certificate facts are OGL v3.0; the ADDRESS fields are
// Ordnance Survey / Royal Mail copyright, usable under
// the register service's own permitted purposes —
// energy-performance purposes. The founder lifted this
// step's written-clearance gate by executive decision
// (18 Nov 2026), with the risk recorded once, there: the
// register's data is held under energy-performance
// purposes and the picking use is arguably outside
// them. The mitigation is structural, and it is this
// file's shape: certificate addresses live in their own
// extract (picking_epc_extract), every served row
// carries its provenance, and the kill switch above
// removes the EPC half cleanly if the register ever
// objects. Nothing in this loader touches price_paid,
// and no brain reads the index.
//
// THE PARSER IS STRICT, AND THERE IS NO FUZZY PASS.
// The per-postcode EPC loader's witnessed data shows
// the register's address lines are free text in a small
// set of shapes; parseEpcAddressLines implements exactly
// those shapes (flat designator with an anchor; number
// + street; number alone with the street on the next
// line; a named building in the register's own PAON
// form). A line set that fits no witnessed shape files
// NOTHING and is counted as a refusal, by reason —
// ambiguity never files. Nothing is ever fuzzy-matched,
// edit-distanced or repaired: a missed home costs one
// Postio lookup (2.6p) when a visitor picks it; a
// wrongly merged home serves the wrong household's
// facts and is unrecoverable.
//
// FRESHNESS. Until the register's API deltas feed is
// characterised, this pass repeats monthly from a fresh
// bulk download, under the same DISTINCT-count
// tolerance proof as the sales pass.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import {
  fileStagedExtract,
  homeKeyForParts,
  recordRejection,
  removeEpcFromIndex,
  COUNT_MOVEMENT_TOLERANCE,
} from "./picking-index-filing.mjs";
import { createProgressLogger, formatCount } from "./progress.mjs";

export const EPC_INDEX_FILE = "certificates.csv";

// Rows per batched stage insert.
export const STAGE_BATCH_ROWS = 1000;

// ------------------------------------------------------------------
// The bulk CSV: a streaming record reader
// ------------------------------------------------------------------

// Stream CSV records out of text chunks: quoted fields,
// embedded commas and doubled quotes, CRLF or LF line
// endings. Yields one array of field strings per record;
// blank lines are skipped. Nothing accumulates beyond
// the current record — the bulk file is far too large
// to hold.
export async function* streamCsvRecords(chunks) {
  let record = [];
  let field = "";
  let fieldStarted = false;
  let inQuotes = false;
  let quotePending = false;

  const endField = () => {
    record.push(field);
    field = "";
    fieldStarted = false;
  };

  for await (const chunk of chunks) {
    for (const ch of chunk) {
      if (inQuotes) {
        if (quotePending) {
          if (ch === '"') {
            field += '"';
            quotePending = false;
            continue;
          }
          inQuotes = false;
          quotePending = false;
          // fall through: ch is handled as unquoted below
        } else {
          if (ch === '"') {
            quotePending = true;
          } else {
            field += ch;
          }
          continue;
        }
      }
      if (ch === '"' && !fieldStarted) {
        inQuotes = true;
        fieldStarted = true;
      } else if (ch === ",") {
        endField();
      } else if (ch === "\n") {
        endField();
        if (record.length > 1 || record[0] !== "") yield record;
        record = [];
      } else if (ch === "\r") {
        // Part of a CRLF ending outside quotes: ignored.
      } else {
        field += ch;
        fieldStarted = true;
      }
    }
  }
  if (fieldStarted || record.length > 0) {
    endField();
    if (record.length > 1 || record[0] !== "") yield record;
  }
}

// The register's column names, in the forms the bulk
// file and the API both use. The match is on the
// header row, lower-cased and trimmed.
const COLUMN_ALIASES = {
  line1: ["address1", "address_line_1", "addressline1"],
  line2: ["address2", "address_line_2", "addressline2"],
  line3: ["address3", "address_line_3", "addressline3"],
  postTown: ["post_town", "posttown", "post town"],
  postcode: ["postcode", "post_code"],
};

// Map streamed records onto certificate address shapes
// using the header row. Throws when the file does not
// carry the columns the parser needs — a wrong file
// must fail loudly, never file nothing quietly.
export async function* streamCertificates(records) {
  let columns = null;
  for await (const record of records) {
    if (columns === null) {
      const header = record.map((name) => name.trim().toLowerCase());
      columns = {};
      for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
        const index = header.findIndex((name) => aliases.includes(name));
        if (index >= 0) columns[field] = index;
      }
      if (columns.line1 === undefined || columns.postcode === undefined) {
        throw new Error(
          "load-epc-index: the bulk file's header carries no address-line-1 or no postcode column — this is not the register's domestic certificate file",
        );
      }
      continue;
    }
    const at = (field) => (columns[field] === undefined ? "" : (record[columns[field]] ?? ""));
    yield {
      line1: at("line1"),
      line2: at("line2"),
      line3: at("line3"),
      postTown: at("postTown"),
      postcode: at("postcode"),
    };
  }
}

// ------------------------------------------------------------------
// The strict witnessed-shape parser
// ------------------------------------------------------------------

const NUMBER_TOKEN = /^\d{1,5}[A-Z]?$/i;
const RANGE_TOKEN = /^\d{1,5}\s*[-–]\s*\d{1,5}[A-Z]?$/i;
const FLAT_PREFIX = /^(FLAT|APARTMENT|APT|UNIT)\s+(\d{1,4}[A-Z]?)\b/i;

function cleanLine(value) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function tokensOf(line) {
  return line === "" ? [] : line.split(" ");
}

// A leading house number, with the register's optional
// comma after it ("16, Ceres Crescent"): returns
// { number, street } or null.
function numberAndStreet(line) {
  const tokens = tokensOf(line.replace(/,$/, ""));
  if (tokens.length < 2) return null;
  const first = tokens[0].replace(/,$/, "");
  if (!NUMBER_TOKEN.test(first)) return null;
  return { number: first.toUpperCase(), street: tokens.slice(1).join(" ") };
}

// A bare leading number and nothing else ("49").
function bareNumber(line) {
  const token = line.replace(/,$/, "");
  return NUMBER_TOKEN.test(token) ? token.toUpperCase() : null;
}

// The register's PAON form for a named building: name
// tokens, a number, then the street ("Minerva House, 12
// Ceres Crescent" / "Minerva House 12 Ceres Crescent"):
// returns { paon, street } or null.
function buildingPaonForm(line) {
  const tokens = tokensOf(line);
  for (let i = 1; i < tokens.length - 1; i += 1) {
    const token = tokens[i].replace(/,$/, "");
    if (NUMBER_TOKEN.test(token)) {
      const name = tokens.slice(0, i).join(" ").replace(/,$/, "");
      if (name === "") return null;
      return {
        paon: `${name}, ${token.toUpperCase()}`,
        street: tokens.slice(i + 1).join(" "),
      };
    }
  }
  return null;
}

// A line that can serve as a bare street: at least one
// token, and no number token anywhere (a number would
// make it some other shape — or another home).
function bareStreet(line) {
  if (line === "") return null;
  return tokensOf(line).some((token) => NUMBER_TOKEN.test(token.replace(/,$/, ""))) ? null : line;
}

function refusal(reason) {
  return { refusal: reason };
}

function parsed(paon, saon, street, town, postcode) {
  return {
    parts: {
      postcode,
      paon: paon === null ? null : paon.toUpperCase(),
      saon: saon === null ? null : saon.toUpperCase(),
      street: street.toUpperCase(),
      town: town === "" ? null : town.toUpperCase(),
    },
  };
}

// Parse one certificate's address lines into index
// parts, or refuse. The witnessed shapes (from the
// register's own data, via the per-postcode loader's
// fixtures):
//
//   S1  "26 Birkdale Rise"                     number + street on line 1
//   S2  "49" / "George Heard Crescent"         number alone, street on line 2
//   S3  "Flat 8 Juno House" / "16, Ceres Crescent"
//                                              flat + building, street number on line 2
//   S4  "Flat 4" / "12 Ceres Crescent"         flat alone, number + street on line 2
//   S5  "Minerva House, 12 Ceres Crescent"     named building, PAON form
//   S6  "Rose Cottage" / "Church Lane"         named home, street on line 2
//
// Line 3 is never a street (it carries localities —
// "Hatfield Peverel" — in the witnessed data) and the
// post town is filed as the town exactly as the
// register files it.
export function parseEpcAddressLines({ line1, line2, line3, postTown, postcode }) {
  const town = cleanLine(postTown);
  const pc = cleanLine(postcode).toUpperCase();
  if (pc === "") return refusal("no-postcode");
  // The lines keep their POSITIONS: line 3 is never a
  // street (it carries localities in the witnessed
  // data), so an empty line 2 is an empty line 2 — the
  // parser must not promote line 3 into its place.
  const [first, second = ""] = [cleanLine(line1), cleanLine(line2), cleanLine(line3)];
  if (first === "") return refusal("empty");

  // A number range anywhere in the first two lines is
  // more than one home wearing one line: refuse.
  for (const line of [first, second ?? ""]) {
    if (tokensOf(line).some((token) => RANGE_TOKEN.test(token))) {
      return refusal("number-range");
    }
  }

  const flat = FLAT_PREFIX.exec(first);
  if (flat !== null) {
    const designator = flat[1].toUpperCase() === "UNIT" ? "UNIT" : "FLAT";
    const saon = `${designator} ${flat[2].toUpperCase()}`;
    const rest = first.slice(flat[0].length).trim().replace(/,$/, "");
    if (second === "") return refusal("no-anchor");
    if (rest !== "") {
      // S3: the building is named on line 1; line 2 must
      // anchor it to a street.
      const anchored = numberAndStreet(second);
      if (anchored !== null) {
        return parsed(`${rest}, ${anchored.number}`, saon, anchored.street, town, pc);
      }
      const street = bareStreet(second);
      if (street !== null) return parsed(rest, saon, street, town, pc);
      return refusal("no-anchor");
    }
    // S4: the flat stands alone on line 1; line 2 must
    // carry the building's street address, in either
    // the PAON form or number + street.
    const paonForm = buildingPaonForm(second);
    if (paonForm !== null) return parsed(paonForm.paon, saon, paonForm.street, town, pc);
    const anchored = numberAndStreet(second);
    if (anchored !== null) return parsed(anchored.number, saon, anchored.street, town, pc);
    return refusal("no-anchor");
  }

  const firstNumberStreet = numberAndStreet(first);
  if (firstNumberStreet !== null) {
    // S1. A second line that is itself a number + street
    // is a second home, not a locality: refuse.
    if (second !== "" && numberAndStreet(second) !== null) {
      return refusal("conflicting-numbers");
    }
    return parsed(firstNumberStreet.number, null, firstNumberStreet.street, town, pc);
  }

  const firstBareNumber = bareNumber(first);
  if (firstBareNumber !== null) {
    // S2. Line 2 must be the street, bare — a numbered
    // line 2 conflicts with the number on line 1.
    if (second === "") return refusal("no-street");
    if (numberAndStreet(second) !== null || buildingPaonForm(second) !== null) {
      return refusal("conflicting-numbers");
    }
    const street = bareStreet(second);
    if (street === null) return refusal("no-street");
    return parsed(firstBareNumber, null, street, town, pc);
  }

  const firstPaonForm = buildingPaonForm(first);
  if (firstPaonForm !== null) {
    // S5.
    if (second !== "" && numberAndStreet(second) !== null) {
      return refusal("conflicting-numbers");
    }
    return parsed(firstPaonForm.paon, null, firstPaonForm.street, town, pc);
  }

  // A name ending in a number ("Minerva House 12") with
  // the street on line 2: the PAON form, split across
  // lines.
  const firstTokens = tokensOf(first);
  const lastToken = firstTokens[firstTokens.length - 1]?.replace(/,$/, "") ?? "";
  if (firstTokens.length >= 2 && NUMBER_TOKEN.test(lastToken)) {
    if (second === "") return refusal("no-street");
    const street = bareStreet(second);
    if (street === null) return refusal("no-street");
    const name = firstTokens.slice(0, -1).join(" ").replace(/,$/, "");
    return parsed(`${name}, ${lastToken.toUpperCase()}`, null, street, town, pc);
  }

  // S6 and the building-on-line-1 forms: line 1 is a
  // name with no numbers; line 2 anchors it.
  if (!tokensOf(first).some((token) => /\d/.test(token))) {
    if (second === "") return refusal("no-street");
    const anchored = numberAndStreet(second);
    if (anchored !== null) {
      return parsed(`${first}, ${anchored.number}`, null, anchored.street, town, pc);
    }
    const street = bareStreet(second);
    if (street !== null) return parsed(first, null, street, town, pc);
    return refusal("unmatched-shape");
  }

  return refusal("unmatched-shape");
}

// ------------------------------------------------------------------
// Filing
// ------------------------------------------------------------------

// The golden proof for the EPC half, read back from the
// SERVED index: the Beaulieu acceptance witness (a
// postcode the filed sales have never named, whose 49
// certificates file 49 homes) and the Minerva flat —
// the register's PAON form must land on the same home
// key the sales parts produce.
export const GOLDEN_EPC_ROWS = [
  {
    postcode: "CM1 6ER",
    homeKey: "49||GEORGE HEARD CRESCENT",
    paon: "49",
    saon: null,
    street: "GEORGE HEARD CRESCENT",
    town: "CHELMSFORD",
    homes: 49,
  },
  {
    postcode: "KT17 1FH",
    homeKey: "MINERVA HOUSE 12|FLAT 4|CERES CRESCENT",
    paon: "MINERVA HOUSE, 12",
    saon: "FLAT 4",
    street: "CERES CRESCENT",
    town: "EPSOM",
    homes: null,
  },
];

export function verifyGoldenEpcRows(rowsByPostcode) {
  for (const golden of GOLDEN_EPC_ROWS) {
    const rows = rowsByPostcode[golden.postcode] ?? [];
    const found = rows.some(
      (row) =>
        row.home_key === golden.homeKey &&
        (row.paon ?? null) === golden.paon &&
        (row.saon ?? null) === golden.saon &&
        (row.street ?? null) === golden.street &&
        (row.town ?? null) === golden.town &&
        (row.sources ?? []).includes("epc"),
    );
    if (!found) {
      throw new Error(
        `epc-index golden proof failed: ${golden.paon} ${golden.street} (${golden.postcode}) is not in the served index as an EPC-derived row in the register's parts`,
      );
    }
    if (golden.homes !== null && rows.length !== golden.homes) {
      throw new Error(
        `epc-index golden proof failed: ${golden.postcode} serves ${rows.length} homes from the index, not the witnessed ${golden.homes}`,
      );
    }
  }
}

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
      `INSERT INTO picking_epc_stage (postcode, paon, saon, street, town, home_key) VALUES ${values.join(", ")}`,
      params,
    );
  };
}

// Stage a pass: truncate the stage, parse every
// certificate, batch the parsed homes in. Refusals are
// counted by reason and file nothing.
export async function stageEpcIndex(client, certificates, { progress = null } = {}) {
  await client.query("TRUNCATE picking_epc_stage");
  const insertBatch = stageInsertFor(client);
  let certificatesRead = 0;
  const refusals = {};
  let batch = [];
  for await (const certificate of certificates) {
    certificatesRead += 1;
    // BUG-204: a line every 500k certificates read — the
    // staging stream is the pass's long phase.
    if (certificatesRead % 500000 === 0)
      progress?.count({ label: "staging", done: certificatesRead, unit: "certificates" });
    const outcome = parseEpcAddressLines(certificate);
    if ("refusal" in outcome) {
      refusals[outcome.refusal] = (refusals[outcome.refusal] ?? 0) + 1;
      continue;
    }
    batch.push({
      ...outcome.parts,
      homeKey: homeKeyForParts(outcome.parts),
    });
    if (batch.length >= STAGE_BATCH_ROWS) {
      await insertBatch(batch);
      batch = [];
    }
  }
  if (batch.length > 0) await insertBatch(batch);
  const refusedTotal = Object.values(refusals).reduce((a, b) => a + b, 0);
  return { certificatesRead, refusals, refusedTotal };
}

// File the staged pass (the shared tolerance proof,
// swap, union rebuild, edition record) and run the EPC
// golden proof against the served index.
export async function fileEpcIndex(client, { edition, log = () => {}, progress = null }) {
  // BUG-204: the rebuild's stage markers ride the
  // caller's log when no logger is handed in.
  const progressLogger = progress ?? createProgressLogger({ name: "load-epc-index", log });
  const outcome = await fileStagedExtract(client, {
    source: "epc",
    edition,
    progress: progressLogger,
  });
  if (!outcome.filed) {
    await recordRejection(client, "epc", outcome.staged.homes);
    throw new Error(
      `epc index: the re-extract was refused — its distinct home count (${outcome.staged.homes}) moves beyond the ${COUNT_MOVEMENT_TOLERANCE * 100}% tolerance against the filed edition (${outcome.previousHomes}); the filed edition keeps serving`,
    );
  }
  const rowsByPostcode = {};
  for (const golden of GOLDEN_EPC_ROWS) {
    const { rows } = await client.query(
      "SELECT postcode, paon, saon, street, town, home_key, sources FROM picking_index WHERE postcode = $1",
      [golden.postcode],
    );
    rowsByPostcode[golden.postcode] = rows;
  }
  verifyGoldenEpcRows(rowsByPostcode);
  log(
    "Golden proof: Beaulieu (CM1 6ER) serves its 49 certificate homes from the index, and Flat 4, Minerva House (KT17 1FH) carries the register's PAON form.",
  );
  return outcome.counts;
}

export async function loadEpcIndexFromCertificates(client, certificates, { edition, log }) {
  // BUG-204: one logger for the pass — the staging
  // stream's count lines and the rebuild's markers.
  const progress = createProgressLogger({ name: "load-epc-index", log });
  const stats = await stageEpcIndex(client, certificates, { progress });
  const counts = await fileEpcIndex(client, { edition, log, progress });
  const refusalDetail = Object.entries(stats.refusals)
    .map(([reason, count]) => `${reason} ${formatCount(count)}`)
    .join(", ");
  log(
    `Picking index (EPC parts) — edition ${edition}: ${formatCount(stats.certificatesRead)} certificates read, ${formatCount(stats.refusedTotal)} refused by the strict parser${refusalDetail === "" ? "" : ` (${refusalDetail})`}.`,
  );
  log(
    `Filed: ${formatCount(counts.postcodes)} distinct postcodes, ${formatCount(counts.homes)} distinct homes, ${formatCount(counts.streets)} distinct streets-with-town.`,
  );
  return { stats, counts };
}

async function* textChunksFromFile(file) {
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  for await (const chunk of stream) yield chunk;
}

// CLI: --file <directory> | --kill-switch, and nothing
// else. As with the sales pass, no argument is ever
// silently dropped.
export function parseArgs(argv) {
  let fileDir = null;
  let killSwitch = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") {
      fileDir = argv[i + 1] ?? null;
      if (fileDir === null) {
        throw new Error("load-epc-index: --file needs a directory");
      }
      i += 1;
    } else if (arg === "--kill-switch") {
      killSwitch = true;
    } else {
      throw new Error(
        `load-epc-index: unexpected argument "${arg}" — the pass files one --file directory of register data, or runs --kill-switch; it takes no postcodes`,
      );
    }
  }
  if (killSwitch && fileDir !== null) {
    throw new Error("load-epc-index: --kill-switch runs alone, without --file");
  }
  return { fileDir, killSwitch };
}

// The fixture/dropped-file pass: stream the directory's
// certificates.csv and file it. Exported so the specs
// drive the exact path the runner's fixture pass runs.
export async function loadEpcIndexFromFile(client, fileDir, { log }) {
  const file = path.join(fileDir, EPC_INDEX_FILE);
  if (!fs.existsSync(file)) {
    throw new Error(`load-epc-index: no ${EPC_INDEX_FILE} in ${fileDir}`);
  }
  const edition = fs.statSync(file).mtime.toISOString().slice(0, 10);
  const certificates = streamCertificates(streamCsvRecords(textChunksFromFile(file)));
  return loadEpcIndexFromCertificates(client, certificates, { edition, log });
}

export async function loadEpcIndex({ fileDir = null, killSwitch = false, log = console.log } = {}) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    if (killSwitch) {
      // BUG-204: the kill switch rebuilds through the same
      // shared path, so it carries the same markers.
      const progress = createProgressLogger({ name: "load-epc-index", log });
      await removeEpcFromIndex(client, { progress });
      const { rows } = await client.query("SELECT count(*) AS homes FROM picking_index");
      log(
        `Kill switch run: the served picking index now holds ${formatCount(rows[0].homes)} homes, rebuilt from the sales extract alone — every EPC-derived row is removed and every merged row keeps its sales parts.`,
      );
      return { killed: true };
    }
    if (fileDir === null) {
      throw new Error(
        "load-epc-index: the bulk certificate file is a founder-side download — pass --file <directory holding certificates.csv> (or --kill-switch)",
      );
    }
    const file = path.join(fileDir, EPC_INDEX_FILE);
    if (!fs.existsSync(file)) {
      throw new Error(`load-epc-index: no ${EPC_INDEX_FILE} in ${fileDir}`);
    }
    return await loadEpcIndexFromFile(client, fileDir, { log });
  } finally {
    client.release();
    await pool.end();
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedAsScript) {
  loadEpcIndex(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
