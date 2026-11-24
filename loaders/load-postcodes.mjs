// Check My Next Home — postcode directory loader (plan step M4.1).
//
// The glue: loads every live UK postcode from the ONS Postcode
// Directory (ONSPD) with its map position and area codes (LSOA /
// MSOA / council, plus ward and region names), so every other
// loader can join onto postcode_cache. Source: Office for National
// Statistics, Open Geography Portal, Open Government Licence v3.0.
// ONSPD is published quarterly (Feb / May / Aug / Nov); each run
// resolves the newest edition itself — nothing is hard-coded.
//
// The loader follows the Milestone 4 pattern: fetch → check the
// file looks sane → file it → write its log line → prove it with
// the golden homes (CM3 2JT → Braintree, E16 1GN → Newham). A failed
// sanity check or proof aborts BEFORE anything is filed, so a bad
// edition can never overwrite good data.
//
// Filing is an upsert of the directory columns only: cached answers
// (broadband / crime / EPC, stored per postcode by later steps) are
// never touched. Terminated postcodes are skipped, not filed.
//
// Usage:
//   npm run load:postcodes                    latest edition, into the database
//   npm run load:postcodes -- --verify-only   latest edition, parse + prove only
//   npm run load:postcodes -- --file <path>   a local ONSPD zip, or a folder
//                                             with the same layout (the test
//                                             fixture) — folder mode relaxes
//                                             the row-count sanity band

import { createWriteStream, createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import pg from "pg";
import yauzl from "yauzl";

const SOURCE_NAME = "ONS Postcode Directory";

// The plan's Check for M4.1, as data: both golden homes must resolve
// to exactly these areas (cross-checked against the directory
// itself and Postcodes.io on 12 Nov 2026).
const GOLDEN = [
  {
    postcode: "CM3 2JT",
    council: "Braintree",
    lsoa: "E01021395",
    msoa: "E02004463",
    lat: 51.776176,
    lng: 0.60387,
  },
  {
    postcode: "E16 1GN",
    council: "Newham",
    lsoa: "E01003511",
    msoa: "E02000749",
    lat: 51.515224,
    lng: 0.021177,
  },
];
const COORD_TOLERANCE = 0.0015;
const FULL_LIVE_MIN = 1_500_000;
const FULL_LIVE_MAX = 2_200_000;
const MONTHS = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};
const MONTH_ABBR = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};
const MONTH_NAMES = {
  "01": "January",
  "02": "February",
  "03": "March",
  "04": "April",
  "05": "May",
  "06": "June",
  "07": "July",
  "08": "August",
  "09": "September",
  10: "October",
  11: "November",
  12: "December",
};

// ---------------------------------------------------------------------------
// Small streaming CSV reader (quoted fields, "" escapes, CRLF, BOM).
// ---------------------------------------------------------------------------
async function* parseCsv(stream) {
  const decoder = new StringDecoder("utf8");
  let field = "";
  let row = [];
  let inQuotes = false;
  let fieldStarted = false;
  let firstChunk = true;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };

  for await (const chunk of stream) {
    let text = decoder.write(chunk);
    if (firstChunk) {
      text = text.replace(/^\uFEFF/, "");
      firstChunk = false;
    }
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"' && !fieldStarted) {
        inQuotes = true;
        fieldStarted = true;
      } else if (ch === ",") {
        endField();
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        endField();
        yield row;
        row = [];
      } else {
        field += ch;
        fieldStarted = true;
      }
    }
  }
  if (fieldStarted || row.length > 0) {
    endField();
    yield row;
  }
}

// ---------------------------------------------------------------------------
// Sources: a downloaded zip, a local zip, or a folder with the zip's
// layout (Data/multi_csv/*.csv + Documents/*.csv lookups). Entries
// are always visited under their zip-style names and each entry's
// stream is fully consumed before the next one starts.
// ---------------------------------------------------------------------------
function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => (err ? reject(err) : resolve(zip)));
  });
}

async function eachZipEntry(zipPath, predicate, handler) {
  const zip = await openZip(zipPath);
  await new Promise((resolve, reject) => {
    zip.on("error", reject);
    zip.on("end", resolve);
    zip.on("entry", (entry) => {
      if (!predicate(entry.fileName)) {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        handler(entry.fileName, stream).then(() => zip.readEntry(), reject);
      });
    });
    zip.readEntry();
  });
}

async function forEachEntry(source, predicate, handler) {
  if (source.kind === "zip") {
    await eachZipEntry(source.path, predicate, handler);
    return;
  }
  const spots = [
    { dir: join(source.path, "Data", "multi_csv"), prefix: "Data/multi_csv/" },
    { dir: join(source.path, "Documents"), prefix: "Documents/" },
  ];
  for (const spot of spots) {
    const names = (await readdir(spot.dir)).sort();
    for (const name of names) {
      const fullName = spot.prefix + name;
      if (predicate(fullName)) await handler(fullName, createReadStream(join(spot.dir, name)));
    }
  }
}

// ---------------------------------------------------------------------------
// Lookups: LAD / ward / region code → name, from the Documents files.
// ---------------------------------------------------------------------------
async function loadLookups(source) {
  const wanted = [
    { kind: "LAD", prefix: "LAD ", map: new Map() },
    { kind: "WD", prefix: "WD ", map: new Map() },
    { kind: "RGN", prefix: "RGN ", map: new Map() },
  ];
  await forEachEntry(
    source,
    (name) => /^Documents\/.*\.csv$/.test(name),
    async (name, stream) => {
      const target = wanted.find((w) => basename(name).startsWith(w.prefix));
      if (!target) {
        for await (const chunk of stream) void chunk; // drain and ignore
        return;
      }
      let first = true;
      for await (const row of parseCsv(stream)) {
        if (first) {
          first = false;
          continue; // header
        }
        if (row.length >= 2 && row[0]) target.map.set(row[0], row[1]);
      }
    },
  );
  for (const w of wanted) {
    if (w.map.size === 0) throw new Error(`the ${w.kind} names lookup is missing or empty`);
  }
  return Object.fromEntries(wanted.map((w) => [w.kind, w.map]));
}

// ---------------------------------------------------------------------------
// Resolve the newest ONSPD edition on the Open Geography Portal.
// ---------------------------------------------------------------------------
async function resolveLatestEdition() {
  const query = 'tags:ONSPD AND owner:ONSGeography_data AND type:"CSV Collection"';
  const url =
    "https://www.arcgis.com/sharing/rest/search?q=" +
    encodeURIComponent(query) +
    "&f=json&num=50&sortField=modified&sortOrder=desc";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`the geography portal search failed (HTTP ${res.status})`);
  const data = await res.json();
  const items = (data.results ?? []).filter(
    (r) => /^ONS Postcode Directory \(/.test(r.title ?? "") && !/User Guide/.test(r.title),
  );
  if (items.length === 0) throw new Error("no ONSPD download found on the geography portal");
  const item = items[0];
  const match = item.title.match(/\(([A-Za-z]+) (\d{4})\)/);
  if (!match) throw new Error(`cannot read the edition from the title "${item.title}"`);
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) throw new Error(`unknown edition month "${match[1]}"`);
  return {
    itemId: item.id,
    editionLabel: `${match[1]} ${match[2]}`,
    sourceDate: `${match[2]}-${month}-01`,
    downloadUrl: `https://www.arcgis.com/sharing/rest/content/items/${item.id}/data`,
  };
}

async function downloadEdition(edition) {
  const dest = join(tmpdir(), `onspd-${edition.itemId}.zip`);
  try {
    const info = await stat(dest);
    if (info.size > 1_000_000) return dest; // already downloaded on this machine
  } catch {
    // not downloaded yet
  }
  const res = await fetch(edition.downloadUrl);
  if (!res.ok || !res.body) throw new Error(`the edition download failed (HTTP ${res.status})`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

function editionFromFileName(name) {
  const match = basename(name).match(/ONSPD_([A-Z]{3})_(\d{4})/i);
  if (!match) return null;
  const mm = MONTH_ABBR[match[1].toUpperCase()];
  if (!mm) return null;
  return { editionLabel: `${MONTH_NAMES[mm]} ${match[2]}`, sourceDate: `${match[2]}-${mm}-01` };
}

// A zip's own file name rarely carries the edition — read it from
// the data files inside instead.
async function editionFromZip(zipPath) {
  const zip = await openZip(zipPath);
  return new Promise((resolve) => {
    zip.on("error", () => resolve(null));
    zip.on("end", () => resolve(null));
    zip.on("entry", (entry) => {
      const edition = editionFromFileName(entry.fileName);
      if (edition) {
        zip.close();
        resolve(edition);
      } else {
        zip.readEntry();
      }
    });
    zip.readEntry();
  });
}

// ---------------------------------------------------------------------------
// Column mapping: admin codes carry a vintage suffix (lad26cd today,
// lad27cd tomorrow) so they are matched by pattern, never by year.
// ---------------------------------------------------------------------------
function columnMap(header) {
  const find = (pattern, label) => {
    const idx = header.findIndex((h) => pattern.test(h));
    if (idx === -1) throw new Error(`the directory file has no ${label} column`);
    return idx;
  };
  return {
    postcode: find(/^pcds$/, "postcode"),
    doterm: find(/^doterm$/, "termination date"),
    lad: find(/^lad\d+cd$/, "local authority"),
    ward: find(/^wd\d+cd$/, "ward"),
    region: find(/^rgn\d+cd$/, "region"),
    lsoa: find(/^lsoa21cd$/, "LSOA 2021"),
    msoa: find(/^msoa21cd$/, "MSOA 2021"),
    lat: find(/^lat$/, "latitude"),
    lng: find(/^long$/, "longitude"),
  };
}

function toRecord(row, cols, lookups) {
  const ladCode = row[cols.lad];
  const wardCode = row[cols.ward];
  const regionCode = row[cols.region];
  return {
    postcode: row[cols.postcode],
    latitude: Number.parseFloat(row[cols.lat]),
    longitude: Number.parseFloat(row[cols.lng]),
    council: lookups.LAD.get(ladCode) ?? ladCode,
    ward: lookups.WD.get(wardCode) ?? wardCode,
    region: lookups.RGN.get(regionCode) ?? regionCode,
    lsoa: row[cols.lsoa] || null,
    msoa: row[cols.msoa] || null,
  };
}

function checkGolden(getRecord, originLabel) {
  const problems = [];
  for (const expected of GOLDEN) {
    const actual = getRecord(expected.postcode);
    if (!actual) {
      problems.push(`${expected.postcode} is missing from ${originLabel}`);
      continue;
    }
    if (actual.council !== expected.council)
      problems.push(
        `${expected.postcode} council is "${actual.council}", expected "${expected.council}"`,
      );
    if (actual.lsoa !== expected.lsoa)
      problems.push(`${expected.postcode} LSOA is ${actual.lsoa}, expected ${expected.lsoa}`);
    if (actual.msoa !== expected.msoa)
      problems.push(`${expected.postcode} MSOA is ${actual.msoa}, expected ${expected.msoa}`);
    if (Math.abs(actual.latitude - expected.lat) > COORD_TOLERANCE)
      problems.push(
        `${expected.postcode} latitude is ${actual.latitude}, expected about ${expected.lat}`,
      );
    if (Math.abs(actual.longitude - expected.lng) > COORD_TOLERANCE)
      problems.push(
        `${expected.postcode} longitude is ${actual.longitude}, expected about ${expected.lng}`,
      );
  }
  if (problems.length > 0) throw new Error(`the golden-home proof failed — ${problems.join("; ")}`);
}

// ---------------------------------------------------------------------------
// Main run.
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileFlag = args.indexOf("--file");
  const startedAt = Date.now();

  let source;
  let edition;
  let fullMode;
  if (fileFlag !== -1) {
    const filePath = args[fileFlag + 1];
    if (!filePath) throw new Error("--file needs a path (an ONSPD zip or a folder)");
    const info = await stat(filePath);
    fullMode = !info.isDirectory();
    source = { kind: info.isDirectory() ? "folder" : "zip", path: filePath };
    edition = editionFromFileName(filePath);
    if (!edition && info.isDirectory()) {
      const firstCsv = (await readdir(join(filePath, "Data", "multi_csv"))).sort()[0] ?? "";
      edition = editionFromFileName(firstCsv);
    }
    if (!edition && !info.isDirectory()) edition = await editionFromZip(filePath);
    if (!edition) edition = { editionLabel: "local file", sourceDate: "2026-08-01" };
  } else {
    edition = await resolveLatestEdition();
    const zipPath = await downloadEdition(edition);
    source = { kind: "zip", path: zipPath };
    fullMode = true;
  }

  const lookups = await loadLookups(source);

  const counts = { total: 0, live: 0, terminated: 0, noCoords: 0, duplicates: 0 };
  const goldenFound = new Map();
  const seen = verifyOnly ? new Set() : null;

  const connectionString = process.env.DATABASE_URL;
  let client = null;
  let cacheBefore = 0;
  if (!verifyOnly) {
    if (!connectionString) throw new Error("DATABASE_URL is not set — see .env.example (Key K6).");
    client = new pg.Client({ connectionString });
    await client.connect();
    await client.query("BEGIN");
    await client.query(`
      CREATE TEMP TABLE onspd_stage (
        postcode text PRIMARY KEY,
        latitude double precision,
        longitude double precision,
        council text,
        ward text,
        region text,
        lsoa_code text,
        msoa_code text
      ) ON COMMIT DROP
    `);
    const before = await client.query("SELECT count(*)::int AS n FROM postcode_cache");
    cacheBefore = before.rows[0].n;
  }

  let batch = [];
  const flush = async () => {
    if (!client || batch.length === 0) return;
    const values = [];
    const tuples = batch.map((r, i) => {
      const base = i * 8;
      values.push(r.postcode, r.latitude, r.longitude, r.council, r.ward, r.region, r.lsoa, r.msoa);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    });
    const result = await client.query(
      `INSERT INTO onspd_stage (postcode, latitude, longitude, council, ward, region, lsoa_code, msoa_code)
       VALUES ${tuples.join(", ")} ON CONFLICT (postcode) DO NOTHING`,
      values,
    );
    counts.duplicates += batch.length - (result.rowCount ?? 0);
    batch = [];
  };

  try {
    await forEachEntry(
      source,
      (name) => /Data\/multi_csv\/.*\.csv$/.test(name),
      async (_name, stream) => {
        let cols = null;
        for await (const row of parseCsv(stream)) {
          if (!cols) {
            cols = columnMap(row);
            continue;
          }
          counts.total++;
          if (row[cols.doterm]) {
            counts.terminated++;
            continue;
          }
          if (!row[cols.lat] || !row[cols.lng]) {
            counts.noCoords++;
            continue;
          }
          const record = toRecord(row, cols, lookups);
          counts.live++;
          if (seen) {
            if (seen.has(record.postcode)) counts.duplicates++;
            seen.add(record.postcode);
          }
          if (GOLDEN.some((g) => g.postcode === record.postcode))
            goldenFound.set(record.postcode, record);
          if (client) {
            batch.push(record);
            if (batch.length >= 1000) await flush();
          }
          if (counts.total % 500_000 === 0)
            console.error(`  …${counts.total.toLocaleString("en-GB")} rows read`);
        }
      },
    );
    await flush();

    // Sanity: the file must look like the real directory before
    // anything is filed.
    if (fullMode && (counts.live < FULL_LIVE_MIN || counts.live > FULL_LIVE_MAX)) {
      throw new Error(
        `sanity check failed — ${counts.live} live postcodes is outside the expected ${FULL_LIVE_MIN}–${FULL_LIVE_MAX} band; nothing was filed`,
      );
    }
    if (!fullMode && counts.live < GOLDEN.length) {
      throw new Error(
        `sanity check failed — the sample holds only ${counts.live} live postcodes; nothing was filed`,
      );
    }

    if (verifyOnly) {
      checkGolden((pc) => goldenFound.get(pc), "the parsed directory");
    } else {
      await client.query(
        `INSERT INTO postcode_cache (postcode, latitude, longitude, council, ward, region, lsoa_code, msoa_code, source_name, source_date)
         SELECT postcode, latitude, longitude, council, ward, region, lsoa_code, msoa_code, $1, $2 FROM onspd_stage
         ON CONFLICT (postcode) DO UPDATE SET
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           council = EXCLUDED.council,
           ward = EXCLUDED.ward,
           region = EXCLUDED.region,
           lsoa_code = EXCLUDED.lsoa_code,
           msoa_code = EXCLUDED.msoa_code,
           source_name = EXCLUDED.source_name,
           source_date = EXCLUDED.source_date`,
        [SOURCE_NAME, edition.sourceDate],
      );
      const filed = await client.query(
        "SELECT postcode, council, lsoa_code AS lsoa, msoa_code AS msoa, latitude, longitude FROM postcode_cache WHERE postcode = ANY($1)",
        [GOLDEN.map((g) => g.postcode)],
      );
      const byPostcode = new Map(filed.rows.map((r) => [r.postcode, r]));
      checkGolden((pc) => byPostcode.get(pc), "postcode_cache");
      await client.query("COMMIT");
      const after = await client.query("SELECT count(*)::int AS n FROM postcode_cache");
      console.log(
        `load-postcodes · edition ${edition.editionLabel} (${edition.sourceDate}) · ${counts.live.toLocaleString("en-GB")} live postcodes filed · ` +
          `${counts.terminated.toLocaleString("en-GB")} terminated skipped · ${counts.noCoords.toLocaleString("en-GB")} without coordinates skipped · ${counts.duplicates.toLocaleString("en-GB")} duplicates ignored · ` +
          `postcode_cache ${cacheBefore.toLocaleString("en-GB")} → ${after.rows[0].n.toLocaleString("en-GB")} rows · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`,
      );
    }
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (client) await client.end();
  }

  if (verifyOnly) {
    console.log(
      `load-postcodes · edition ${edition.editionLabel} (${edition.sourceDate}) · verify only, nothing filed · ${counts.live.toLocaleString("en-GB")} live postcodes · ` +
        `${counts.terminated.toLocaleString("en-GB")} terminated skipped · ${counts.noCoords.toLocaleString("en-GB")} without coordinates skipped · ${counts.duplicates.toLocaleString("en-GB")} duplicates · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`,
    );
  }
}

main().catch((error) => {
  console.error(`load-postcodes FAILED: ${error.message}`);
  process.exit(1);
});
