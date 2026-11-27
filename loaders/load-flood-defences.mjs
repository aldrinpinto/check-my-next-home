#!/usr/bin/env node
// Recorded flood defences loader (plan step M6.27, decisions
// D49 and D54).
//
// The Environment Agency's AIMS Spatial Flood Defences
// (Approval for Access product AfA345, Open Government
// Licence v3.0) — the register of flood defence assets the
// Agency owns, manages or inspects: embankments, walls,
// engineered and natural high ground, flood gates and the
// rest, each with its filed maintainer and operator
// categories, condition grade, and design / current
// standards of protection. It joins the three filed flood
// layers as the RECORD behind the rivers & sea likelihood
// (which already counts these defences); the brain serves
// it at report depth only, as its own block, never merged
// into a layer.
//
// Access (measured in the M6.27 prep, 16 Nov 2026): there is
// no OGC collection for this product (the M5.1 route 404s).
// The national GeoPackage is served whole from the Data
// Sharing Platform file endpoint below — a 41 MB zip holding
// a 123 MB GeoPackage, 141,458 features in the 13 Nov 2026
// build. The edition stamp is the zip member's own date,
// read from the zip directory: the CKAN record's modified
// date is the metadata record's, not the data's, so it is
// never used as the edition. An unreadable member date
// fails the run — a stamp is never guessed.
//
// Filing (migration 0024): single-edition swap, the flood
// loaders' pattern — read and validate the whole new copy,
// stage it, then DELETE + INSERT inside one transaction, so
// a failed load never overwrites the last good filing.
// Geometries file as published: NO ST_MakeValid (deliberate
// — a line has no area semantics, MakeValid can move or
// split a published line, and serving needs only ST_Distance
// plus the GiST index). Lines failing ST_IsValid are counted
// in the summary line, never dropped, never repaired.
//
// BUG-366 (26 Nov 2026): the read is resumable. Staging is a
// persistent table (migration 0047) and a checkpoint records
// the last fully staged 1,000 rows as the read proceeds (one
// progress line per checkpoint), so a run killed mid-read
// resumes from the checkpoint instead of starting from zero.
// The file is re-streamed from the top on resume — the golden
// statistics accumulate over the whole file either way — but
// rows below the checkpoint are not re-staged. --restart
// discards the checkpoint and staging and starts from zero.
//
//   npm run load:flood-defences -- --restart
//
// THE VOCABULARY CONTRACT (D54, fail-closed): the maintainer
// and operator columns are closed publisher categories —
// organisations and classes, never a person's name. The
// measured file's complete vocabularies (10 maintainer
// values, 9 operator values, condition codes '' / '0'–'5' /
// NULL, 14 asset sub-types) are pinned below, and ANY
// out-of-vocabulary value fails the run and files nothing:
// a future edition that names an individual maintainer
// stops here, at the loader, instead of reaching a report.
// Values are trimmed before matching ('Network Rail '
// carries a trailing space in the file and files trimmed).
//
// last_inspection_date files (D54) but is NOT served in V1 —
// the brain's read port does not carry it. The file carries
// it as DD/MM/YYYY text; the loader converts to an ISO date
// and fails the run on any other shape.

import { execFileSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import proj4 from "proj4";
import yauzl from "yauzl";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
  withFilingPulse,
} from "./progress.mjs";
import {
  createFloodResume,
  isTransientFetchError,
  TRANSIENT_RETRY_BUDGET_MS,
} from "./flood-resume.mjs";
import { assessShortRead, shortReadNotice } from "./read-tolerance.mjs";

export const ITEM = "load-flood-defences";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKDIR = join(ROOT, ".load-flood-defences-work");

export const DOWNLOAD_URL =
  "https://environment.data.gov.uk/api/file/download?fileDataSetId=3aa34e3d-1d6d-4345-a655-64a683e06b6b&fileName=AIMS_Spatial_Flood_Defences_inc_standardised_attributes.gpkg.zip";
const GPKG_MEMBER = "AIMS_Spatial_Flood_Defences_inc_standardised_attributes.gpkg";
const LAYER = "Spatial_Flood_Defences_Including_Standardised_Attributes";
export const SOURCE_NAME = "Environment Agency — AIMS Spatial Flood Defences";

// The feature count of the 13 Nov 2026 build, measured in
// the prep. The live run sanity-checks its read against
// ±10% of it; the band's job is catching a truncated or
// wrong download, not tracking the register's growth — a
// genuine move beyond the band fails loudly for a human to
// re-baseline, the flood loaders' idiom.
export const SNAPSHOT = 141_458;
export const BAND_LOW = Math.floor(SNAPSHOT * 0.9);
export const BAND_HIGH = Math.ceil(SNAPSHOT * 1.1);

// The closed vocabularies, complete as measured over all
// 141,458 features of the 13 Nov 2026 build (trimmed forms).
export const MAINTAINER_VOCABULARY = [
  "Environment Agency",
  "Internal Drainage Board",
  "Local Authority",
  "Network Rail",
  "Not Maintained",
  "Other Public Body",
  "Private individual, Company or Charity",
  "Transport Authority",
  "Unknown",
  "Water Company",
];
export const OPERATOR_VOCABULARY = [
  "Environment Agency",
  "Internal Drainage Board",
  "Local Authority",
  "Not Maintained",
  "Other Public Body",
  "Private individual, Company or Charity",
  "Transport Authority",
  "Unknown",
  "Water Company",
];
export const SUB_TYPE_VOCABULARY = [
  "Barrier Beach",
  "Beach",
  "Bridge Abutment",
  "Cliff",
  "Demountable Defence",
  "Dunes",
  "Embankment",
  "Engineered High Ground",
  "Flood Gate",
  "Natural High Ground",
  "Promenade",
  "Quay",
  "Spillway",
  "Wall",
];
// The condition codes as filed: '' (no grade recorded — the
// dominant state) and NULL are filed states distinct from
// the recorded grade '0' (Unchecked).
export const CONDITION_VOCABULARY = ["", "0", "1", "2", "3", "4", "5"];

const RADIUS_M = 2 * 1609.344;

// The house British National Grid definition — the same one
// every loader transforms with (load-flood-rivers-sea.mjs):
// the towgs84 datum shift is part of the definition and so
// applies per vertex, in both directions.
const BNG_DEF =
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
  "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs";
proj4.defs("EPSG:27700", BNG_DEF);
const toBng = (lng, lat) => proj4("EPSG:4326", "EPSG:27700", [lng, lat]);
const toWgs84 = (e, n) => proj4("EPSG:27700", "EPSG:4326", [e, n]);

// The three golden homes (plan D10) — directory points.
const GOLDEN_HOMES = [
  { key: "birkdale", postcode: "CM3 2JT", lat: 51.776176, lng: 0.60387 },
  { key: "exeter", postcode: "E16 1GN", lat: 51.515224, lng: 0.021177 },
  { key: "epsom", postcode: "KT17 1FH", lat: 51.344571, lng: -0.247104 },
];

// ------------------------------------------------------------------
// GeoPackage geometry reading (the OS Greenspace reader,
// extended with the line types this product carries).
// ------------------------------------------------------------------

// A GPkg geometry blob: 'GP' magic, flags byte (envelope
// size varies), srs id, optional envelope, then WKB. This
// product's features are all MultiLineString; a bare
// LineString normalises to a one-member MultiLineString.
// Anything else throws — the reader never guesses.
export function parseGpkgGeometry(blob) {
  if (blob.length < 8 || blob[0] !== 0x47 || blob[1] !== 0x50)
    throw new Error("not a GeoPackage geometry blob");
  const flags = blob[3];
  const envelopeType = (flags >> 1) & 0x07;
  const envelopeBytes = [0, 32, 48, 48, 64][envelopeType] ?? 0;
  const offset = 8 + envelopeBytes;
  const view = new DataView(blob.buffer, blob.byteOffset + offset, blob.length - offset);
  return readWkb(view, 0).geometry;
}

function readWkb(view, offset) {
  const littleEndian = view.getUint8(offset) === 1;
  const type = view.getUint32(offset + 1, littleEndian);
  let p = offset + 5;
  const num = () => {
    const v = view.getFloat64(p, littleEndian);
    p += 8;
    return v;
  };
  const count = () => {
    const v = view.getUint32(p, littleEndian);
    p += 4;
    return v;
  };
  const line = () => {
    const n = count();
    const points = [];
    for (let j = 0; j < n; j++) points.push([num(), num()]);
    return points;
  };
  if (type === 2) return { geometry: { type: "MultiLineString", coordinates: [line()] }, next: p };
  if (type === 5) {
    const parts = count();
    const lines = [];
    for (let i = 0; i < parts; i++) {
      const member = readWkb(view, p);
      lines.push(...member.geometry.coordinates);
      p = member.next;
    }
    return { geometry: { type: "MultiLineString", coordinates: lines }, next: p };
  }
  throw new Error(`unsupported WKB geometry type ${type} — the defences file's shape changed`);
}

// ------------------------------------------------------------------
// The file read: the filed columns plus the BNG lines.
// ------------------------------------------------------------------

// The file read streams (BUG-187): rows are yielded one at
// a time off the SQLite cursor, each with its parsed BNG
// lines, so a filing run never holds the whole register in
// memory. readDefencesFile collects the stream — the shape
// the tests and the golden helpers consume at fixture
// scale.
export function* iterateDefencesFile(gpkgPath) {
  const db = new DatabaseSync(gpkgPath, { readOnly: true });
  try {
    const statement = db.prepare(
      `SELECT asset_id, asset_name, asset_sub_type, protection_type,
              asset_maintainer, asset_operator, current_condition,
              design_sop, design_sop_dqf, current_sop,
              water_course_name, last_inspection_date, shape
         FROM "${LAYER}"`,
    );
    for (const row of statement.iterate())
      yield { ...row, lines: parseGpkgGeometry(row.shape).coordinates };
  } finally {
    db.close();
  }
}

export function readDefencesFile(gpkgPath) {
  return [...iterateDefencesFile(gpkgPath)];
}

// The file's row count, read before the stream (BUG-366): the
// resume checkpoint is validated against it, exactly as the
// OGC loaders validate against the service count — a
// republication between runs invalidates the checkpoint.
export function countDefencesFile(gpkgPath) {
  const db = new DatabaseSync(gpkgPath, { readOnly: true });
  try {
    return db.prepare(`SELECT count(*) AS n FROM "${LAYER}"`).get().n;
  } finally {
    db.close();
  }
}

// The streaming read with progress (BUG-265): the read is the
// run's long phase — 141,458 features in the 13 Nov 2026 build
// — so a tally lands every 10,000 features, a heartbeat every
// 50,000, and a 10,000-feature chunk that takes more than 3x
// the recent average earns a warning. main() drives it with
// the golden statistics and the staging filer as the per-row
// sink; a fixture read is the same stream at small scale (a
// finish line only). readDefencesFile above keeps the
// collecting form the tests consume.
/**
 * @param {string} gpkgPath
 * @param {{ onRow?: ((row: any) => Promise<void>) | null, progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export async function streamDefencesFile(gpkgPath, { onRow = null, progress = null } = {}) {
  const readTally = progress?.tally({ label: "read", every: 10_000, unit: "features" });
  const readWatch = createBatchWatch();
  let read = 0;
  let chunkRows = 0;
  let chunkStarted = Date.now();
  for (const raw of iterateDefencesFile(gpkgPath)) {
    read += 1;
    chunkRows += 1;
    if (onRow) await onRow(raw);
    readTally?.tick(read);
    progress?.heartbeat({ stage: "read", done: read, every: 50_000 });
    if (chunkRows >= 10_000) {
      const { tookMs, averageMs, slow } = readWatch.observe(Date.now() - chunkStarted);
      if (slow) {
        progress?.warning({
          what: "read chunk duration",
          value: `chunk ending at feature ${formatCount(read)} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
      chunkStarted = Date.now();
      chunkRows = 0;
    }
  }
  readTally?.finish(read);
  return { read };
}

// ------------------------------------------------------------------
// The vocabulary contract and the filed-row transform.
// ------------------------------------------------------------------

function trimmed(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim();
}

function requireVocabulary(field, value, vocabulary) {
  if (!vocabulary.includes(value))
    throw new Error(
      `${field} ${JSON.stringify(value)} is outside the closed vocabulary pinned at M6.27 — ` +
        `the run files nothing (a new publisher category, or a person's name where a category belongs, stops here)`,
    );
  return value;
}

// The file carries inspection dates as DD/MM/YYYY text
// (uniform across all 128,423 populated values measured).
// Anything else is a shape change and fails the run.
export function parseInspectionDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value).trim());
  if (!m)
    throw new Error(
      `last_inspection_date ${JSON.stringify(value)} is not in the published DD/MM/YYYY form — the file's shape changed`,
    );
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (
    d.getUTCFullYear() !== Number(yyyy) ||
    d.getUTCMonth() !== Number(mm) - 1 ||
    d.getUTCDate() !== Number(dd)
  )
    throw new Error(`last_inspection_date ${JSON.stringify(value)} is not a real calendar date`);
  return `${yyyy}-${mm}-${dd}`;
}

function lineToWkt(lines) {
  const parts = lines.map(
    (line) =>
      `(${line
        .map(([e, n]) => {
          const [lng, lat] = toWgs84(e, n);
          return `${lng} ${lat}`;
        })
        .join(", ")})`,
  );
  return `MULTILINESTRING(${parts.join(", ")})`;
}

// Validate the contract and transform one raw row into a
// filed row. Throws — filing nothing — on the first breach.
// processRows is the batch form the tests consume; a filing
// run transforms row by row as the read streams (BUG-187),
// through this same function.
export function processRow(row) {
  const maintainer = requireVocabulary(
    "asset_maintainer",
    trimmed(row.asset_maintainer),
    MAINTAINER_VOCABULARY,
  );
  const operator = requireVocabulary(
    "asset_operator",
    trimmed(row.asset_operator),
    OPERATOR_VOCABULARY,
  );
  const subType = requireVocabulary(
    "asset_sub_type",
    trimmed(row.asset_sub_type),
    SUB_TYPE_VOCABULARY,
  );
  const condition =
    row.current_condition === null || row.current_condition === undefined
      ? null
      : requireVocabulary("current_condition", String(row.current_condition), CONDITION_VOCABULARY);
  if (row.asset_id === null || row.asset_id === undefined || String(row.asset_id) === "")
    throw new Error("a feature carries no asset_id — the file's shape changed");
  return {
    assetId: String(row.asset_id),
    assetName: row.asset_name ?? null,
    assetSubType: subType,
    protectionType: row.protection_type ?? null,
    assetMaintainer: maintainer,
    assetOperator: operator,
    currentCondition: condition,
    designSop: row.design_sop ?? null,
    designSopDqf: row.design_sop_dqf ?? null,
    currentSop: row.current_sop ?? null,
    waterCourseName: row.water_course_name ?? null,
    lastInspectionDate: parseInspectionDate(row.last_inspection_date),
    wkt: lineToWkt(row.lines),
  };
}

export function processRows(rows) {
  return rows.map((row) => processRow(row));
}

// ------------------------------------------------------------------
// Golden checks — computed on the BNG plane from the raw
// lines, the prep's basis: point-to-segment distances from
// each golden home's directory point. The serving basis
// (PostGIS geography over the transformed lines) is locked
// separately in the brain's golden tests.
// ------------------------------------------------------------------

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}

// The per-home statistics accumulate in one pass
// (BUG-187): offer() each raw row as the read streams and
// only the three homes' counts and nearest defences are
// retained — the same figures homeStats computes over a
// whole in-memory read, which remains as the batch form.
export function createHomeStats() {
  const acc = GOLDEN_HOMES.map((home) => {
    const [hx, hy] = toBng(home.lng, home.lat);
    return {
      home,
      hx,
      hy,
      count: 0,
      nearest:
        /** @type {null | { assetId: string, subType: unknown, watercourse: unknown, metres: number }} */ (
          null
        ),
    };
  });
  return {
    offer(row) {
      for (const stat of acc) {
        let best = Infinity;
        for (const line of row.lines)
          for (let i = 0; i + 1 < line.length; i++)
            best = Math.min(
              best,
              segmentDistance(
                stat.hx,
                stat.hy,
                line[i][0],
                line[i][1],
                line[i + 1][0],
                line[i + 1][1],
              ),
            );
        if (best <= RADIUS_M) {
          stat.count += 1;
          if (!stat.nearest || best < stat.nearest.metres)
            stat.nearest = {
              assetId: String(row.asset_id),
              subType: row.asset_sub_type,
              watercourse: row.water_course_name,
              metres: best,
            };
        }
      }
    },
    result() {
      return acc.map(({ home, count, nearest }) => ({ ...home, count, nearest }));
    },
  };
}

export function homeStats(rows) {
  const acc = createHomeStats();
  for (const row of rows) acc.offer(row);
  return acc.result();
}

// The locked expectations (the prep's verified reads over
// the real file; distances to the printed precision, so the
// tolerance is a rounding guard, not a fudge).
const GOLDEN_EXPECTED = {
  birkdale: {
    count: 26,
    assetId: "73925",
    subType: "Natural High Ground",
    watercourse: "River Ter",
    miles: 0.851,
  },
  exeter: { count: 443, subType: "Wall", watercourse: "River Lea or Lee", miles: 0.579 },
  epsom: {
    count: 52,
    assetId: "80375",
    subType: "Natural High Ground",
    watercourse: "Hogsmill River",
    miles: 0.429,
  },
};

function assertGoldenStats(stats) {
  for (const stat of stats) {
    const want = GOLDEN_EXPECTED[stat.key];
    const fail = (msg) => {
      throw new Error(`golden check failed for ${stat.postcode}: ${msg}`);
    };
    if (stat.count !== want.count)
      fail(`expected ${want.count} defences within 2 miles, read ${stat.count}`);
    if (!stat.nearest) fail("no nearest defence read");
    if (want.assetId && stat.nearest.assetId !== want.assetId)
      fail(`nearest asset is ${stat.nearest.assetId}, expected ${want.assetId}`);
    if (stat.nearest.subType !== want.subType)
      fail(`nearest is a ${stat.nearest.subType}, expected ${want.subType}`);
    if (stat.nearest.watercourse !== want.watercourse)
      fail(`nearest watercourse is ${stat.nearest.watercourse}, expected ${want.watercourse}`);
    const miles = stat.nearest.metres / 1609.344;
    if (Math.abs(miles - want.miles) > 0.002)
      fail(`nearest is ${miles.toFixed(3)} miles away, expected ${want.miles}`);
  }
}

export function checkGoldens(rows) {
  assertGoldenStats(homeStats(rows));
}

// ------------------------------------------------------------------
// Filing: the staged single-edition swap.
// ------------------------------------------------------------------

// The staged swap, fed as a stream (BUG-187), filed from
// persistent staging (BUG-366): the filer opens the resume
// handle; there is NO long transaction any more — each
// staging flush commits as it lands, and the checkpoint
// (last fully staged 1,000 rows + running totals) commits
// with it, so a killed run's staged rows survive. addRow
// buffers filed rows into bounded multi-row inserts (100 at
// a time — the one-shot filer inserted row by row), and every
// staged row carries seq, its ordinal in the file stream, so
// re-staging a row is a no-op (ON CONFLICT DO NOTHING).
// prepare() decides resume vs fresh start from the file's
// row count (expected) and the checkpoint; finish runs the
// staged count, the swap and the invalid count in its own
// transaction, exactly as before, then clears the staging
// rows and the checkpoint. fileDefences keeps the one-shot
// shape over the same filer, so the two paths file identical
// stage content by construction.
const DEFENCES_LAYER_TYPE = "flood_defences";
// The checkpoint cadence (BUG-366): one checkpoint line per
// 1,000 staged rows — the fixture's 834 rows earn none, so
// the BUG-265 progress test's single closing read line is
// unchanged.
const CHECKPOINT_EVERY_ROWS = 1000;

export async function createDefencesFiler(
  client,
  edition,
  { progress = null, restart = false } = {},
) {
  const resume = createFloodResume(client, {
    loader: ITEM,
    layerType: DEFENCES_LAYER_TYPE,
    stageTable: "flood_defences_stage",
    progress,
    restart,
  });
  const pending = [];
  // Rows staged in total across runs — seeded from the
  // checkpoint at prepare time, so re-staged rows (the
  // interrupted block, re-read from its start) count once:
  // each is already staged, and the re-stream processes
  // exactly the rows between the checkpoint and the kill.
  let staged = 0;
  let expected = null;
  let nextCheckpointAt = CHECKPOINT_EVERY_ROWS;
  async function maybeCheckpoint() {
    if (expected === null || staged < nextCheckpointAt) return;
    await resume.checkpoint({
      edition,
      expected,
      nextStartIndex: staged,
      totals: { read: staged, filed: staged, geoless: 0, perLabel: {} },
      unit: "rows",
    });
    nextCheckpointAt += CHECKPOINT_EVERY_ROWS;
  }
  async function flush() {
    if (pending.length === 0) return;
    // Seqs are assigned at flush time, so the counter only
    // advances for rows actually inserted — and on resume it
    // is seeded from the checkpoint, so a re-staged row
    // reuses exactly the seq it already carries.
    const seqBase = resume.takeSeq(pending.length);
    const values = [];
    const params = [];
    pending.forEach((row, i) => {
      const base = i * 15;
      values.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15})`,
      );
      params.push(
        DEFENCES_LAYER_TYPE,
        row.assetId,
        row.assetName,
        row.assetSubType,
        row.protectionType,
        row.assetMaintainer,
        row.assetOperator,
        row.currentCondition,
        row.designSop,
        row.designSopDqf,
        row.currentSop,
        row.waterCourseName,
        row.lastInspectionDate,
        row.wkt,
        seqBase + i,
      );
    });
    await client.query(
      `
      INSERT INTO flood_defences_stage (
        layer_type, asset_id, asset_name, asset_sub_type, protection_type,
        asset_maintainer, asset_operator, current_condition,
        design_sop, design_sop_dqf, current_sop, water_course_name,
        last_inspection_date, wkt, seq
      ) VALUES ${values.join(",")} ON CONFLICT (layer_type, seq) DO NOTHING`,
      params,
    );
    const flushed = pending.length;
    pending.length = 0;
    staged += flushed;
    await maybeCheckpoint();
  }
  return {
    // Decide resume vs fresh start from the file's row count
    // and the checkpoint, and seed the staged counter and
    // the checkpoint cadence from the checkpoint when resuming.
    async prepare({ expected: expectedCount }) {
      expected = expectedCount;
      const prepared = await resume.prepare({ edition, expected: expectedCount });
      if (prepared.resumed) {
        staged = prepared.checkpoint.filed_count;
        nextCheckpointAt = Math.floor(staged / CHECKPOINT_EVERY_ROWS + 1) * CHECKPOINT_EVERY_ROWS;
      } else {
        staged = 0;
        nextCheckpointAt = CHECKPOINT_EVERY_ROWS;
      }
      return prepared;
    },
    resumeNote() {
      return resume.resumeNote();
    },
    async addRow(row) {
      pending.push(row);
      if (pending.length >= 100) await flush();
    },
    async finish(expectedCount) {
      try {
        await flush();
        await client.query("BEGIN");
        const stagedRows = await client.query(
          "SELECT count(*)::int AS n FROM flood_defences_stage WHERE layer_type = $1",
          [DEFENCES_LAYER_TYPE],
        );
        if (stagedRows.rows[0].n !== expectedCount)
          throw new Error(
            `staged ${stagedRows.rows[0].n} of ${expectedCount} defences — refusing to swap`,
          );
        // BUG-390: one progress line per sub-step — the
        // filing previously printed one line and then went
        // silent while the single INSERT...SELECT ran.
        progress?.stage(`filing · staged count verified · ${formatCount(expectedCount)} defences`);
        await client.query("DELETE FROM flood_defences");
        progress?.stage("filing · live rows deleted");
        progress?.stage(
          `filing · copying ${formatCount(expectedCount)} defences into flood_defences`,
        );
        await withFilingPulse(
          progress,
          {
            stage: `filing · copying ${formatCount(expectedCount)} defences into flood_defences`,
          },
          () =>
            client.query(
              `
        INSERT INTO flood_defences (
          asset_id, asset_name, asset_sub_type, protection_type,
          asset_maintainer, asset_operator, current_condition,
          design_sop, design_sop_dqf, current_sop, water_course_name,
          last_inspection_date, geom, source_name, source_date
        )
        SELECT asset_id, asset_name, asset_sub_type, protection_type,
               asset_maintainer, asset_operator, current_condition,
               design_sop, design_sop_dqf, current_sop, water_course_name,
               last_inspection_date,
               ST_GeomFromText(wkt, 4326)::geometry(MultiLineString, 4326),
               $2, $3
          FROM flood_defences_stage WHERE layer_type = $1
      `,
              [DEFENCES_LAYER_TYPE, SOURCE_NAME, edition],
            ),
        );
        progress?.stage(`filing · copy done · ${formatCount(expectedCount)} defences`);
        // Lines file as published (no ST_MakeValid — see the
        // header); invalid lines are counted, never dropped.
        const invalid = await client.query(
          "SELECT count(*)::int AS n FROM flood_defences WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)",
        );
        progress?.stage(`filing · invalid filed defences · ${formatCount(invalid.rows[0].n)}`);
        await client.query("COMMIT");
        progress?.stage(`filing · swap committed · ${formatCount(expectedCount)} defences live`);
        // The swap landed: clear the staging rows and the
        // checkpoint, so nothing of this run is left behind.
        await resume.clear();
        return invalid.rows[0].n;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    },
    async abort() {
      // No long transaction any more, so there is nothing to
      // roll back: the staging rows and the checkpoint stay
      // in place, and the next run resumes from them
      // (BUG-366). The client belongs to main(), so it is
      // not ended here.
    },
  };
}

export async function fileDefences(
  client,
  rows,
  edition,
  { progress = null, restart = false } = {},
) {
  const filer = await createDefencesFiler(client, edition, { progress, restart });
  try {
    const prepared = await filer.prepare({ expected: rows.length });
    const resumeFrom = prepared.resumed ? prepared.checkpoint.next_start_index : 0;
    for (let i = 0; i < rows.length; i++) {
      if (i < resumeFrom) continue;
      await filer.addRow(rows[i]);
    }
    return await filer.finish(rows.length);
  } catch (error) {
    await filer.abort();
    throw error;
  }
}

// ------------------------------------------------------------------
// Access: the DSP file endpoint (live) and the fixture.
// ------------------------------------------------------------------

// The edition is the .gpkg member's own zip date. DOS dates
// carry no timezone; the member is stamped in the
// publisher's local terms and only its calendar date is
// used, which is all an edition stamp needs.
export function dosDateToIso(dateWord) {
  const day = dateWord & 0x1f;
  const month = (dateWord >> 5) & 0xf;
  const year = ((dateWord >> 9) & 0x7f) + 1980;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function zipMemberDate(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      let settled = false;
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (entry.fileName === GPKG_MEMBER) {
          settled = true;
          zip.close();
          resolve(dosDateToIso(entry.lastModFileDate));
        } else zip.readEntry();
      });
      zip.on("end", () => {
        if (!settled)
          reject(
            new Error(`the download carries no ${GPKG_MEMBER} member — the file's shape changed`),
          );
      });
      zip.on("error", reject);
    });
  });
}

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
// BUG-384: the one-shot download retried like the OGC pages —
// a transient failure (connect timeout, reset, 5xx, 429)
// retries for up to 30 minutes (TRANSIENT_RETRY_BUDGET_MS,
// founder-ordered 27 Nov 2026) instead of killing the run;
// past the budget the original error fails the run and it
// waits. Anything else throws at once.
async function fetchDownload(progress = null) {
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const response = await fetch(DOWNLOAD_URL);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for the AIMS GeoPackage download`);
        error.status = response.status;
        throw error;
      }
      return response;
    } catch (error) {
      if (!isTransientFetchError(error)) throw error;
      // BUG-384 cap: 30 minutes of retrying, then the run
      // dies with the original error and waits (founder's
      // rule) — a dead service never parks it forever.
      if (Date.now() - startedAt >= TRANSIENT_RETRY_BUDGET_MS) throw error;
      const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
      progress?.warning({
        what: "fetch retry",
        value: `the AIMS GeoPackage download attempt ${attempt} failed (${String(error?.message ?? error).split(/\r?\n/)[0]})`,
        threshold: `retrying in ${formatDuration(delay)}`,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function fetchLive(progress = null) {
  rmSync(WORKDIR, { recursive: true, force: true });
  mkdirSync(WORKDIR, { recursive: true });
  const zipPath = join(WORKDIR, "aims.zip");
  const response = await fetchDownload(progress);
  // The zip streams to disk (BUG-187) — the whole payload is
  // never buffered in memory on its way through.
  await pipeline(Readable.fromWeb(response.body), createWriteStream(zipPath));
  const edition = await zipMemberDate(zipPath);
  if (!edition)
    throw new Error(
      "the download's member date is unreadable — no edition can be stamped, so nothing files",
    );
  execFileSync("unzip", ["-o", zipPath, GPKG_MEMBER, "-d", WORKDIR], { stdio: "pipe" });
  return { gpkgPath: join(WORKDIR, GPKG_MEMBER), edition };
}

function readFixture(dir) {
  const meta = JSON.parse(readFileSync(join(dir, "fixture.json"), "utf8"));
  if (!meta.edition) throw new Error(`the fixture at ${dir} carries no edition stamp`);
  const plain = join(dir, "aims.gpkg");
  if (existsSync(plain)) return { gpkgPath: plain, edition: meta.edition };
  const encoded = join(dir, "aims.gpkg.b64");
  if (!existsSync(encoded))
    throw new Error(`no aims.gpkg or aims.gpkg.b64 in the fixture at ${dir}`);
  rmSync(WORKDIR, { recursive: true, force: true });
  mkdirSync(WORKDIR, { recursive: true });
  const gpkgPath = join(WORKDIR, "aims.gpkg");
  writeFileSync(gpkgPath, Buffer.from(readFileSync(encoded, "utf8").replace(/\s+/g, ""), "base64"));
  return { gpkgPath, edition: meta.edition };
}

async function main() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const restart = args.includes("--restart");
  const fileIndex = args.indexOf("--file");
  const fixtureDir = fileIndex >= 0 ? args[fileIndex + 1] : null;
  // BUG-265: one logger for the run — the read tally and the
  // filing marker below.
  const progress = createProgressLogger({ name: "load-flood-defences" });

  const { gpkgPath, edition } = fixtureDir ? readFixture(fixtureDir) : await fetchLive(progress);

  // One streaming pass (BUG-187): each row is read off the
  // file cursor, offered to the golden statistics and
  // transformed; a filing run stages it straight into
  // persistent staging (BUG-366), so the whole register is
  // never held in memory. A filing run therefore opens the
  // database before the pass — without DATABASE_URL it fails
  // before reading instead of after it.
  let pool = null;
  let client = null;
  let filer = null;
  if (!verifyOnly) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({ connectionString });
    client = await pool.connect();
    try {
      filer = await createDefencesFiler(client, edition, { progress, restart });
    } catch (error) {
      client.release();
      await pool.end();
      throw error;
    }
  }

  try {
    let read;
    let goldenSummary;
    let shortfallNotice = null;
    try {
      const stats = createHomeStats();
      // BUG-387: the file's own row count is the read's expected
      // count — the stream must reconcile with it exactly, or
      // within the 1% tolerance below. It is read once, here,
      // and reused by the resume decision.
      const fileCount = countDefencesFile(gpkgPath);
      // BUG-366: the resume decision, from the file's row
      // count, before the stream starts. The stream then
      // re-reads from the top — the golden statistics need
      // every row — but only rows at or after the checkpoint
      // are staged; the ones below it already stand.
      let resumeFrom = 0;
      if (filer) {
        const prepared = await filer.prepare({
          edition,
          expected: fileCount,
        });
        if (prepared.resumed) resumeFrom = prepared.checkpoint.next_start_index;
      }
      let rowIndex = 0;
      progress.stage("reading the AIMS GeoPackage");
      ({ read } = await streamDefencesFile(gpkgPath, {
        progress,
        onRow: async (raw) => {
          stats.offer(raw);
          const index = rowIndex++;
          if (filer && index >= resumeFrom) {
            const filedRow = processRow(raw);
            await filer.addRow(filedRow);
          }
        },
      }));
      if (!fixtureDir && (read < BAND_LOW || read > BAND_HIGH))
        throw new Error(
          `read ${read} features — outside the ±10% sanity band (${BAND_LOW}–${BAND_HIGH}) ` +
            `around the ${SNAPSHOT} of the 13 Nov 2026 build; refusing to file`,
        );
      // BUG-387: the stream must reconcile with the file's own row
      // count. There is no re-fetch pass here: the stream reads a
      // local SQLite cursor that yields every row or throws — it
      // cannot return short — and the download re-fetch already
      // lives in fetchLive (BUG-384). A shortfall within 1% is
      // accepted LOUDLY (the warning below and the run summary);
      // anything more refuses to file, exactly as a short OGC
      // read does.
      const readVerdict = assessShortRead({ read, expected: fileCount });
      if (!readVerdict.accepted)
        throw new Error(`read ${read} of ${fileCount} defences in the file — refusing to file`);
      if (readVerdict.withinTolerance) {
        shortfallNotice = shortReadNotice({
          label: "flood defences",
          read,
          expected: fileCount,
        });
        progress.warning({
          what: "read shortfall accepted (BUG-387)",
          value: shortfallNotice,
          threshold: "1% after re-fetch",
        });
      }
      const homeResults = stats.result();
      assertGoldenStats(homeResults);
      goldenSummary = homeResults
        .map((s) => {
          const miles = (s.nearest.metres / 1609.344).toFixed(3);
          return `${s.postcode.split(" ")[0]} ${formatCount(s.count)} within 2 miles (nearest ${s.nearest.subType}, ${s.nearest.watercourse}, ${miles} mi)`;
        })
        .join(" · ");
    } catch (error) {
      // BUG-265: the read, sanity band and golden checks all
      // fail before anything is filed.
      progress.failed({
        stage: "read",
        filed: 0,
        error,
        resume: filer ? filer.resumeNote() : "the start (nothing staged yet)",
      });
      if (filer) await filer.abort();
      throw error;
    }

    if (verifyOnly) {
      return {
        summary:
          `${ITEM} · ${SOURCE_NAME} · edition ${edition} · ${formatCount(read)} features verified, nothing filed ` +
          `— golden homes OK: ${goldenSummary}` +
          (shortfallNotice ? ` · ${shortfallNotice}` : ""),
      };
    }
    // BUG-265: the filing swap is the run's second long step.
    progress.stage(`filing ${formatCount(read)} features — counts and swap`);
    let invalidCount;
    try {
      invalidCount = await filer.finish(read);
    } catch (error) {
      progress.failed({
        stage: "filing",
        filed: 0,
        total: read,
        error,
        resume: `${filer.resumeNote()} — the live layer is untouched`,
      });
      if (filer) await filer.abort();
      throw error;
    }
    return {
      summary:
        `${ITEM} · ${SOURCE_NAME} · edition ${edition} · ${formatCount(read)} features filed ` +
        `(${formatCount(invalidCount)} invalid lines filed as published) — golden homes OK: ${goldenSummary}` +
        (shortfallNotice ? ` · ${shortfallNotice}` : ""),
    };
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (result) => {
      if (result?.summary) console.log(result.summary);
    },
    (error) => {
      console.error(`${ITEM} FAILED: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
