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

import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
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
function parsePpdLine(line) {
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
function toRecord(fields) {
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

function median(prices) {
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// The golden-home assertions, run against a row source (the parsed
// records, or rows read back from the database).
function checkGolden(rowsFor, label) {
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

async function main() {
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

main().catch((error) => {
  console.error(`load-sold-prices FAILED: ${error.message}`);
  process.exitCode = 1;
});
