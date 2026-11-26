// Transport loader (plan step M5.5). Files NaPTAN stops and
// stations into transport_stops, following the user-seat gap
// check of 13 Nov 2026:
//
//   npm run load:transport
//   npm run load:transport -- --verify-only
//   npm run load:transport -- --file tests/fixtures/transport
//
// The step: "Transport loader (NaPTAN + bus data). Stops and
// stations with positions. Live times are never stored — links
// out only. Check: Exeter — Custom House station 0.44 mi."
//
// What the gap check changed, and where it lives in this file:
//   - L1, the grid-only trap. 31,417 active stops (8.1% of the
//     13 Nov 2026 file) publish no Longitude/Latitude at all —
//     only an OS grid reference. They are whole authorities'
//     returns, and they include all eleven grid-only rail rows,
//     every one an Elizabeth line station (Custom House among
//     them) plus Barking Riverside; and every one of the 7 bus
//     stops within 2 miles of the Hilgay golden home. A
//     coordinates-only loader answers that home's nearest bus
//     stop as 7.965 miles where the truth is a paired stop at
//     0.044. The table's lat/lon columns are NOT NULL, so the
//     failure would be silent absence, never a crash. Every
//     active row that lacks published coordinates is converted
//     from its Easting/Northing (EPSG:27700 → EPSG:4326, the
//     schools loader's proj4 basis — verified to reproduce
//     published positions to 5 decimal places where both
//     exist) and the converted count rides in the log line.
//     Rows with neither coordinates nor a grid reference are
//     counted, never filed (the 13 Nov 2026 file has none).
//   - L2, a station is a cluster, not a point. Custom House
//     files as six rows spanning 0.440–0.504 miles (station
//     points, a platform, an entrance, the grid-only rail row);
//     only the 4900-series station point gives the step's
//     check figure. So the loader files exactly nine stop
//     families — BCT, BCS, BST, RLY, MET, TMU, FER, FBT, FTD —
//     and never entrances (RSE), platforms (PLT), bus-station
//     entrances (BCE/BCQ), gates (GAT), interchange points
//     (STR), taxi ranks (TXR), airports (AIR) or
//     rail-replacement points (RPL). Sibling station points
//     file under their own ATCO codes; grouping them into one
//     "station" is a read-time (M6) concern. Note the prep's
//     honesty point, pinned in the golden checks below: the
//     nearest station-level point to the Exeter home is Royal
//     Victoria's (0.414) — the step's check names Custom House
//     (0.440), and it is that point's filed distance that is
//     asserted, not a "nearest" claim.
//   - L3, StopType lies about mode. MET and TMU include
//     heritage steam railways (Cardiff's nearest are a Somerset
//     line 20.6 miles away); in London the same codes are the
//     Tube and DLR. Names and stop-type codes are
//     filed verbatim — the code is the source's vocabulary,
//     never translated into a network claim here; and NaPTAN carries
//     no line or route data at all, so no "(Elizabeth line &
//     DLR)" attribution can come from this table.
//   - L4, Status is the currency filter; Modification is a
//     decoy (20,960 rows say "delete", nearly all already
//     inactive; 28,996 active rows carry it blank). Filing
//     every row would serve Canning Town's closed rail station
//     (9100CNTN, inactive, 0.647 miles from the Exeter home)
//     and West Ham's superseded rail row (9100WHAM, inactive,
//     0.025 miles nearer than the live 9100WHAMHL). Active
//     only; the excluded count is logged.
//   - L5, the source moved. The retired app subdomain now
//     redirects to a beta site; the working route is the DfT
//     API host below, no key required. Its responses carry no
//     Last-Modified header, so freshness is read from the
//     file's own ModificationDateTime values (the canary does
//     the same on a one-area probe). There is no published
//     national count oracle; the load's own in-band count
//     assertions are the national proof.
//   - L6, the M5.4 boundary. The Bus Open Data Service holds
//     timetables, fares and live vehicle locations behind the
//     K10 key; this loader never calls it — it files positions
//     only, and the step's own words forbid storing the rest.
//     What K10 would unlock later joins on the ATCO codes
//     filed here, which is the whole of the future-proofing.
//
// Sources: NaPTAN (Department for Transport) via the NaPTAN
// API, Open Government Licence v3.0. The file carries no
// edition date, so the source date is the retrieval date.
// Distances are haversine miles on the filed points, earth
// radius 3956 (the heritage basis).

import { createReadStream, createWriteStream } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import pg from "pg";
import proj4 from "proj4";
import { createLoaderResume } from "./loader-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
    "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);
const toLatLng = (easting, northing) => {
  const [lng, lat] = proj4("EPSG:27700", "EPSG:4326", [easting, northing]);
  return { lat, lng };
};

const API_URL = "https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=CSV";
const SOURCE_TRANSPORT =
  "NaPTAN — National Public Transport Access Nodes (Department for Transport)";

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};
// Targeted golden homes (decision D10): C8 guards the Wales
// answer, C9 the grid-conversion and near-empty cases, C3 the
// far-station rural case.
const TARGETS = {
  "CF11 8AA": { lat: 51.467947, lng: -3.192837 },
  "CB6 1EH": { lat: 52.507481, lng: 0.33491 },
  "CM5 0DR": { lat: 51.749133, lng: 0.214797 },
};
const FILE_FAMILIES = ["BCT", "BCS", "BST", "RLY", "MET", "TMU", "FER", "FBT", "FTD"];
const FAMILY_SET = new Set(FILE_FAMILIES);
const STATION_TYPES = new Set(["RLY", "MET", "TMU"]);
const BUS_TYPES = new Set(["BCT", "BCS", "BST"]);
const ELIZABETH_LINE = [
  "9100ABWDXR",
  "9100BONDST",
  "9100CANWHRF",
  "9100CUSTMHS",
  "9100FRNDXR",
  "9100LIVSTLL",
  "9100PADTLL",
  "9100TOTCTRD",
  "9100WCHAPXR",
  "9100WOLWXR",
  "9100BARKRIV",
];
const CONSUMED = [
  "ATCOCode",
  "CommonName",
  "Longitude",
  "Latitude",
  "Easting",
  "Northing",
  "StopType",
  "Status",
  "ModificationDateTime",
];

// Quote-aware split of one CSV line. The file carries no
// embedded newlines (its line count equals its row count + 1),
// so lines are the unit — the same property the canary's
// parser relies on.
function splitCsvLine(line) {
  const fields = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      fields.push(field);
      field = "";
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

// Yield the lines of a file (or of several part files in
// order) without ever holding the 97 MB national file whole.
async function* linesOf(paths) {
  for (const path of paths) {
    const decoder = new TextDecoder("utf8");
    let buffer = "";
    for await (const chunk of createReadStream(path)) {
      buffer += decoder.decode(chunk, { stream: true });
      let at = buffer.indexOf("\n");
      while (at !== -1) {
        const line = buffer.slice(0, at).replace(/\r$/, "");
        if (line.trim() !== "") yield line;
        buffer = buffer.slice(at + 1);
        at = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim() !== "") yield buffer.replace(/\r$/, "");
  }
}

function haversineMiles(aLat, aLng, bLat, bLng) {
  const R = 3956;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// A row's position: the published coordinates where they
// exist and are sane; otherwise the converted grid reference;
// otherwise nothing (counted, never filed). The bounds are
// Great Britain's — a corrupt published pair falls back to
// the grid reference instead of filing at 0,0.
function resolvePosition(row) {
  const lat = Number(row.Latitude);
  const lng = Number(row.Longitude);
  if (
    row.Latitude !== "" &&
    row.Longitude !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 48.5 &&
    lat <= 61.5 &&
    lng >= -9.5 &&
    lng <= 3.0
  ) {
    return { lat, lng, converted: false };
  }
  const easting = Number(row.Easting);
  const northing = Number(row.Northing);
  if (
    row.Easting !== "" &&
    row.Northing !== "" &&
    Number.isFinite(easting) &&
    Number.isFinite(northing) &&
    easting > 0 &&
    easting < 800000 &&
    northing > 0 &&
    northing < 1400000
  ) {
    return { ...toLatLng(easting, northing), converted: true };
  }
  return null;
}

async function processFiles(paths, { progress = null } = {}) {
  const stats = {
    total: 0,
    active: 0,
    excludedStatus: 0,
    outOfScope: 0,
    noPosition: 0,
    converted: 0,
    duplicates: 0,
    perFamily: Object.fromEntries(FILE_FAMILIES.map((f) => [f, 0])),
    newestEdit: "",
  };
  const filed = [];
  const seen = new Set();
  let headerIndex = null;
  let firstLine = true;
  for await (const line of linesOf(paths)) {
    if (firstLine || headerIndex === null) {
      const header = splitCsvLine(line.replace(/^﻿/, "")).map((h) => h.trim());
      if (headerIndex === null) {
        for (const column of CONSUMED) {
          if (!header.includes(column))
            throw new Error(`contract failure: the NaPTAN file no longer carries "${column}"`);
        }
        headerIndex = Object.fromEntries(header.map((h, i) => [h, i]));
      }
      firstLine = false;
      continue;
    }
    // Part files each carry the header line; skip repeats.
    if (line.replace(/^﻿/, "").startsWith("ATCOCode,")) continue;
    const fields = splitCsvLine(line);
    const row = Object.fromEntries(CONSUMED.map((c) => [c, (fields[headerIndex[c]] ?? "").trim()]));
    stats.total += 1;
    // BUG-265: the read count, every hundred thousand rows,
    // and a heartbeat at the same cadence. No total, so no
    // percentage: the file carries no national count oracle
    // (gap item L5), and none is guessed.
    if (stats.total % 100_000 === 0) {
      progress?.count({ label: "read", done: stats.total, unit: "rows" });
      progress?.heartbeat({ stage: "reading", done: stats.total, every: 100_000 });
    }
    if (row.ModificationDateTime > stats.newestEdit) stats.newestEdit = row.ModificationDateTime;
    if (row.Status !== "active") {
      stats.excludedStatus += 1;
      continue;
    }
    stats.active += 1;
    if (!FAMILY_SET.has(row.StopType)) {
      stats.outOfScope += 1;
      continue;
    }
    const position = resolvePosition(row);
    if (!position) {
      stats.noPosition += 1;
      continue;
    }
    if (seen.has(row.ATCOCode)) {
      stats.duplicates += 1;
      continue;
    }
    seen.add(row.ATCOCode);
    if (position.converted) stats.converted += 1;
    stats.perFamily[row.StopType] += 1;
    filed.push({
      atco: row.ATCOCode,
      name: row.CommonName,
      type: row.StopType,
      lat: position.lat,
      lng: position.lng,
      converted: position.converted,
    });
  }
  if (stats.total === 0) throw new Error("contract failure: the NaPTAN file has no rows");
  // BUG-265: the closing read line — the row total is known
  // only now that the file has streamed, and it is a count,
  // never a percentage against a guessed total.
  progress?.count({
    label: "read",
    done: stats.total,
    unit: "rows",
    extra: `${formatCount(filed.length)} stops filed`,
  });
  return { stats, filed };
}

function checkGolden(filed) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  const byAtco = new Map(filed.map((f) => [f.atco, f]));
  const miles = (home, f) => haversineMiles(home.lat, home.lng, f.lat, f.lng);
  const expectAt = (label, home, atco, expected, tolerance) => {
    const f = byAtco.get(atco);
    expect(!!f, `${label}: ${atco} must be filed`);
    if (f)
      expect(
        Math.abs(miles(home, f) - expected) <= tolerance,
        `${label}: ${atco} should sit at ${expected} mi, got ${miles(home, f).toFixed(3)}`,
      );
  };
  const within = (home, types, radius) =>
    filed.filter((f) => types.has(f.type) && miles(home, f) <= radius);

  // The step's check, as a presence-at-distance fact (L2's
  // honesty note: Royal Victoria's point is nearer, and the
  // loader asserts no "nearest" claim for the station).
  expectAt("E16 1GN", HOMES["E16 1GN"], "4900ZZDLCUS1", 0.44, 0.02);
  expect(
    byAtco.get("4900ZZDLCUS1")?.name === "Custom House Station",
    "the Custom House station point's name must file verbatim",
  );
  expectAt("E16 1GN", HOMES["E16 1GN"], "9400ZZLUCGT", 0.564, 0.02);
  expectAt("E16 1GN", HOMES["E16 1GN"], "490016788N", 0.172, 0.01);
  expectAt("E16 1GN", HOMES["E16 1GN"], "490011814S", 0.186, 0.01);
  // Status traps (L4): the closed and the superseded stay out.
  expect(!byAtco.has("9100CNTN"), "Canning Town's closed rail station (9100CNTN) must never file");
  expect(!byAtco.has("9100WHAM"), "West Ham's superseded rail row (9100WHAM) must never file");
  expect(byAtco.has("9100WHAMHL"), "West Ham's live rail row (9100WHAMHL) must file");
  // Name fidelity (gap item 8): qualifiers and all.
  expect(
    byAtco.get("9400ZZDLCUS")?.name === "Custom House (for ExCel) DLR Station",
    "the filed name for 9400ZZDLCUS must match the source byte-for-byte",
  );
  expect(
    byAtco.get("9100CUSTMHS")?.name === "Custom House",
    "the filed name for the grid-only rail row must be the suffix-less 'Custom House'",
  );

  // The grid-conversion proof (L1): the Hilgay pair, both
  // grid-only in the source, filed at 0.044 miles — an
  // implementation that skips conversion answers 7.965 and
  // fails here; and the whole Elizabeth line rail layer.
  const hilgay = TARGETS["CB6 1EH"];
  for (const atco of ["0500ELITP026", "0500ELITP036"]) {
    const f = byAtco.get(atco);
    expect(!!f && f.converted, `CB6 1EH: ${atco} must file from its grid reference`);
    if (f) expectAt("CB6 1EH", hilgay, atco, 0.044, 0.01);
  }
  const nearestBus = within(hilgay, BUS_TYPES, 0.1).sort(
    (a, b) => miles(hilgay, a) - miles(hilgay, b),
  )[0];
  expect(
    !!nearestBus && ["0500ELITP026", "0500ELITP036"].includes(nearestBus.atco),
    "CB6 1EH: the nearest filed bus stop must be the Black Horse Drove pair",
  );
  expect(
    within(hilgay, BUS_TYPES, 2).length === 7,
    `CB6 1EH: expected 7 bus stops within 2 miles, got ${within(hilgay, BUS_TYPES, 2).length}`,
  );
  expect(
    within(hilgay, BUS_TYPES, 5).length === 86,
    `CB6 1EH: expected 86 bus stops within 5 miles, got ${within(hilgay, BUS_TYPES, 5).length}`,
  );
  expectAt("CB6 1EH", hilgay, "9100LTLPORT", 3.208, 0.03);
  for (const atco of ELIZABETH_LINE) {
    const f = byAtco.get(atco);
    expect(
      !!f && f.converted,
      `${atco}: the grid-only Elizabeth line rail row must file, converted`,
    );
  }
  expectAt("E16 1GN", HOMES["E16 1GN"], "9100CUSTMHS", 0.488, 0.02);

  // Universal goldens.
  const birkdale = HOMES["CM3 2JT"];
  expectAt("CM3 2JT", birkdale, "9100HFLPEVL", 0.563, 0.02);
  expectAt("CM3 2JT", birkdale, "150009005007", 0.124, 0.01);
  expectAt("CM3 2JT", birkdale, "150009005008", 0.126, 0.01);
  expect(
    within(birkdale, BUS_TYPES, 0.5).length === 13,
    `CM3 2JT: expected 13 bus stops within half a mile, got ${within(birkdale, BUS_TYPES, 0.5).length}`,
  );
  const epsom = HOMES["KT17 1FH"];
  expectAt("KT17 1FH", epsom, "9100EWELLE", 0.246, 0.02);
  expectAt("KT17 1FH", epsom, "9100EWELW", 0.57, 0.02);
  expectAt("KT17 1FH", epsom, "9100EPSM", 1.17, 0.02);
  expectAt("KT17 1FH", epsom, "40004406167B", 0.128, 0.01);
  const nearestEpsomStation = within(epsom, STATION_TYPES, 0.3).sort(
    (a, b) => miles(epsom, a) - miles(epsom, b),
  )[0];
  expect(
    nearestEpsomStation?.atco === "9100EWELLE",
    "KT17 1FH: the flat's nearest station must be Ewell East, not Epsom",
  );

  // Wales files identically (gap item 6) and the far rural
  // answers are facts with distances (gap item 7).
  expectAt("CF11 8AA", TARGETS["CF11 8AA"], "9100GNTN", 0.136, 0.01);
  expectAt("CF11 8AA", TARGETS["CF11 8AA"], "5710AWA11589", 0.077, 0.01);
  expectAt("CM5 0DR", TARGETS["CM5 0DR"], "9100HRLWMIL", 4.531, 0.03);
  expectAt("CM5 0DR", TARGETS["CM5 0DR"], "1500IM915", 0.243, 0.01);

  expect(
    filed.every((f) => FAMILY_SET.has(f.type)),
    "every filed row's stop type must be one of the nine families",
  );
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

// The national download, with patient retries (the M5.3
// transport lesson): one 97 MB GET, streamed to a temp file
// so a mid-transfer failure retries the download, never the
// processing.
async function downloadNational(tmpPath) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status} for the NaPTAN download`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(tmpPath));
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 10000));
    }
  }
  throw lastError;
}

// A fixture file too large for one connector push is held as
// numbered parts (naptan-1.csv, naptan-2.csv, ...), each a
// complete CSV with the header; the parts' rows concatenate
// to the capture, in order.
async function fixturePaths(fixtureDir) {
  const entries = await readdir(fixtureDir);
  if (entries.includes("naptan.csv")) return [join(fixtureDir, "naptan.csv")];
  const parts = entries.filter((e) => /^naptan-\d+\.csv$/.test(e)).sort();
  if (parts.length === 0) throw new Error("contract failure: no fixture file for naptan.csv");
  return parts.map((p) => join(fixtureDir, p));
}

// --- filing ------------------------------------------------------------
//
// Stage, count, swap — with resume support (BUG-368): staging is
// a PERSISTENT table now (migration 0048), and a loader_checkpoint
// row records the last fully staged chunk, so a killed run resumes
// instead of restarting. beginTransportFiling opens the staging
// table; stageRows inserts in the house chunks of 1,000,
// checkpointing after each chunk; finishFiling runs the counts
// and the swap exactly as the one-shot filer did, in its own
// transaction. The single-edition swap: the whole transport_stops
// table is replaced in this transaction, so a failed run leaves
// the last good filing serving untouched.
//
// THE RESUME UNITS. The filed array is the read's whole output,
// held in memory as before, so the resume point is the count of
// rows staged (staged) — a resumed run re-reads the file (the
// parse is the cheap half here; the staging of ~380k rows is the
// long phase) and stages only the rows past the checkpoint, with
// the same seqs. The edition is the file's date (sourceDate).
/**
 * Open the filing run's database client and resume handle
 * (BUG-368). The client is injectable so the resume tests
 * can file against a fake database; production passes none
 * and a real client is opened as before.
 *
 * @param {import("./progress.mjs").ProgressLogger | null} [progress]
 * @param {{ restart?: boolean, client?: any }} [options]
 */
export async function beginTransportFiling(
  progress = null,
  { restart = false, client: injectedClient = null } = {},
) {
  const client = injectedClient ?? new pg.Client({ connectionString: process.env.DATABASE_URL });
  const ownsClient = !injectedClient;
  if (ownsClient) await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS transport_stage (
         atco_code text, name text, stop_type text,
         latitude double precision, longitude double precision,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now(),
         seq bigint NOT NULL, UNIQUE (seq)
       )`,
    );
  } catch (error) {
    if (ownsClient) await client.end().catch(() => {});
    throw error;
  }
  const resume = createLoaderResume(client, {
    loader: "load-transport",
    stageTable: "transport_stage",
    progress,
    restart,
  });
  const CHUNK = 1000;
  let staged = 0;
  let edition = null;
  /** @type {{ resumed: boolean, reason?: string, checkpoint?: any, prefix?: boolean }} */
  let resumePrep = { resumed: false };
  const stageWatch = createBatchWatch();
  return {
    stagedCount: () => staged,
    resumePrep: () => resumePrep,
    resumeNote: () => resume.resumeNote(),
    // Decide, from the file's date and the staged rows, whether
    // this run resumes or starts from zero. Called once the read
    // has resolved the edition, before the first row is staged.
    async prepareResume(ed, expected) {
      edition = ed;
      resumePrep = await resume.prepare({ edition, expected });
      if (resumePrep.resumed) staged = resumePrep.checkpoint.filed_count;
      return resumePrep;
    },
    async stageRows(filed) {
      const totalChunks = Math.ceil(filed.length / CHUNK);
      const stageTally = progress?.tally({
        label: "staging",
        total: totalChunks,
        every: Math.max(1, Math.ceil(totalChunks / 10)),
        unit: "chunks",
      });
      // The tally counts absolute chunks, so a resumed run's
      // first tick lands at its true position — no catch-up
      // lines for chunks a previous run staged.
      // Ceil, not floor: the last chunk may be partial, and a
      // fully staged resume must finish at total/total, not
      // one short (a kill during the swap resumes here).
      let chunksDone = Math.ceil(staged / CHUNK);
      for (let at = staged; at < filed.length; at += CHUNK) {
        const chunk = filed.slice(at, at + CHUNK);
        const started = Date.now();
        const values = [];
        const params = [];
        const base = resume.takeSeq(chunk.length);
        chunk.forEach((stop, i) => {
          const b = i * 8;
          values.push(
            `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`,
          );
          params.push(
            stop.atco,
            stop.name,
            stop.type,
            stop.lat,
            stop.lng,
            SOURCE_TRANSPORT,
            edition,
            base + i,
          );
        });
        await client.query(
          `INSERT INTO transport_stage (atco_code, name, stop_type, latitude, longitude, source_name, source_date, seq)
           VALUES ${values.join(",")}`,
          params,
        );
        staged += chunk.length;
        chunksDone += 1;
        const { tookMs, averageMs, slow } = stageWatch.observe(Date.now() - started);
        stageTally?.tick(chunksDone);
        progress?.heartbeat({ stage: "staging", done: chunksDone, total: totalChunks });
        if (slow) {
          progress?.warning({
            what: "stage chunk duration",
            value: `chunk ${chunksDone} took ${formatDuration(tookMs)}`,
            threshold: `3x recent average ${formatDuration(averageMs)}`,
          });
        }
        await resume.checkpoint({
          edition,
          expected: filed.length,
          nextStartIndex: staged,
          read: staged,
          filed: staged,
          unit: "stops",
        });
      }
      stageTally?.finish(chunksDone, `${formatCount(filed.length)} stops staged`);
    },
    async finishFiling(expectedCount) {
      try {
        progress?.stage("swap started — replacing the filed transport stops");
        const stagedRes = await client.query("SELECT count(*)::int AS n FROM transport_stage");
        if (stagedRes.rows[0].n !== expectedCount)
          throw new Error("the staged transport count does not match — rolling back");
        await client.query("BEGIN");
        try {
          await client.query("DELETE FROM transport_stops");
          await client.query(
            `INSERT INTO transport_stops (atco_code, name, stop_type, latitude, longitude, source_name, source_date, loaded_at)
             SELECT atco_code, name, stop_type, latitude, longitude, source_name, source_date, loaded_at FROM transport_stage`,
          );
          const filedCount = await client.query("SELECT count(*)::int AS n FROM transport_stops");
          if (filedCount.rows[0].n !== expectedCount)
            throw new Error("the filed transport count does not match — rolling back");
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        }
        // The run is complete: staging + checkpoint go together,
        // so nothing is left behind for the next edition.
        await resume.clear();
      } finally {
        if (ownsClient) await client.end().catch(() => {});
      }
    },
    async abortFiling() {
      // The staging + checkpoint STAY: they are the next run's
      // resume point.
      if (ownsClient) await client.end().catch(() => {});
    },
  };
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last checkpointed chunk instead of
  // restarting; with no checkpoint this is a fresh start.
  const restart = args.includes("--restart");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;

  let paths;
  let sourceDate;
  let tmpPath = null;
  // BUG-265: one logger for the run — the read count lives
  // in processFiles, the staging tally in the filer, and the
  // failure lines at each phase.
  const progress = createProgressLogger({ name: "load-transport" });
  let stats;
  let filed;
  try {
    if (fixtureMode) {
      paths = await fixturePaths(fixtureDir);
      sourceDate = JSON.parse(await readFile(join(fixtureDir, "fixture.json"), "utf8")).captured;
    } else {
      tmpPath = join(tmpdir(), `naptan-${process.pid}.csv`);
      await downloadNational(tmpPath);
      paths = [tmpPath];
      sourceDate = new Date().toISOString().slice(0, 10);
    }
    progress.stage("reading the NaPTAN file");
    ({ stats, filed } = await processFiles(paths, { progress }));
    if (!fixtureMode) {
      if (stats.total < 400000 || stats.total > 475000)
        throw new Error(
          `sanity failure: ${stats.total} rows read is outside the expected band (435,812 at the 13 Nov 2026 snapshot)`,
        );
      if (filed.length < 350000 || filed.length > 415000)
        throw new Error(
          `sanity failure: ${filed.length} filed stops is outside the expected band (381,640 at the snapshot)`,
        );
    }
    if (stats.converted === 0)
      throw new Error(
        "contract failure: no row needed grid conversion — the Easting/Northing columns have moved or emptied",
      );
    checkGolden(filed);
  } catch (error) {
    // BUG-265: the failure line names the read and how far it
    // got — nothing is filed until the swap.
    progress.failed({
      stage: "reading",
      filed: 0,
      error,
      resume: "re-run from scratch (nothing is filed until the swap)",
    });
    throw error;
  } finally {
    if (tmpPath) await rm(tmpPath, { force: true }).catch(() => {});
  }

  const familyLine = FILE_FAMILIES.map((f) => `${f} ${formatCount(stats.perFamily[f])}`).join(
    " · ",
  );
  const summary = () =>
    `load-transport · ${SOURCE_TRANSPORT} · file of ${sourceDate} · ` +
    `${formatCount(stats.total)} rows read · ${formatCount(stats.active)} active · ` +
    `${formatCount(filed.length)} transport stops filed (${familyLine}) · ` +
    `${formatCount(stats.converted)} grid references converted · ` +
    `${formatCount(stats.excludedStatus)} inactive or pending excluded · ` +
    `${formatCount(stats.outOfScope)} active sub-point or out-of-scope rows set aside · ` +
    `${formatCount(stats.noPosition)} without a position counted · ` +
    `${formatCount(stats.duplicates)} duplicate ATCO codes dropped`;

  if (verifyOnly) {
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    return;
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not set — filing requires a database");

  // BUG-265: the staging is the filing phase — the filer's
  // tally, slow-chunk warning and heartbeat log while the
  // stops file; the failure line below names the filing
  // stage and the resume point.
  progress.stage(`staging ${formatCount(filed.length)} transport stops`);
  const filer = await beginTransportFiling(progress, { restart });
  try {
    await filer.prepareResume(sourceDate, filed.length);
    await filer.stageRows(filed);
    await filer.finishFiling(filed.length);
  } catch (error) {
    progress.failed({
      stage: "filing",
      filed: filer.stagedCount(),
      total: filed.length,
      error,
      // BUG-368: a swap failure leaves the staged read
      // checkpointed, so the next run resumes at the swap.
      resume: filer.resumeNote(),
    });
    await filer.abortFiling();
    throw error;
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

main().catch((error) => {
  console.error(`load-transport FAILED: ${error.message}`);
  process.exitCode = 1;
});
