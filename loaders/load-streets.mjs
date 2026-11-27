// Street lines loader — OpenStreetMap (plan step M8.3).
//
// Files the street lines the genuine flood maps are
// drawn over — one row per OpenStreetMap highway way in
// street_lines (migration 0038) — from Geofabrik's
// country extracts of OpenStreetMap into the database.
// Until this step the project held no street geometry
// anywhere: the nearby-places loader (M5.6) files
// places as points, and the flood maps' promise ("our
// own loaded EA shapes over open street data we hold")
// needs the lines themselves. The national filing was
// an M12 item; the founder preponed it into M8.3 on
// 20 Nov 2026 so the maps and the street data land
// together.
//
// How the read works (the places loader's pattern,
// prep L11): each country file (England, Wales) is
// downloaded whole, verified against the md5 Geofabrik
// publishes for it — a mismatch refuses the run, nothing
// is filed from an unverified file — and cut down to
// the highway-carrying ways by loaders/
// osm-streets-extract.py, which rides libosmium's C++
// KeyFilter. The loader therefore needs python3 with
// pyosmium installed (pip install osmium) wherever it
// runs, fixture mode included.
//
// Filing rules:
// - The filed vocabulary is the allowlist below: the
//   road classes a street map draws, plus the path
//   classes (footway, path, cycleway, bridleway,
//   pedestrian) that carry the riverside and cut-through
//   lines a flood picture reads by. Construction,
//   proposed and abandoned ways never file — a map must
//   not draw a street that is not there.
// - Named AND unnamed ways file: an unnamed service
//   road is still street context on the picture;
//   serving picks the home's street by name where the
//   resolution carries one.
// - One row per way, keyed on the OSM way id: a border
//   way appearing in both country extracts files once.
//
// Filing shapes, by mode:
// - National (default, --pbf-dir, --countries): rows
//   are staged into street_lines_stage country by
//   country with progress logged, and swapped into
//   street_lines inside ONE transaction only when
//   every country has staged and passed its floor —
//   an interrupted run leaves the last good table
//   serving untouched and the stage where it stopped;
//   a re-run resets the stage and starts again. Safe
//   to run detached for a long time.
// - Area cuts (--bbox minLon,minLat,maxLon,maxLat, one
//   or more separated by ';', over --pbf-dir or a
//   download): each area files in its own transaction —
//   the rows whose geometry meets the area are deleted
//   and the cut's ways for that area are inserted — so
//   areas commit one by one and a cut can be re-run.
// - Fixture (--file <dir>): the committed .osm captures
//   file scoped to their own extent, in one transaction.
//
// Licence (T12): OpenStreetMap data is © OpenStreetMap
// contributors, available under the ODbL. The filed
// table is a derivative database and stays private —
// only drawn facts are served, with the attribution
// line the flood-map pictures carry; the dataset
// itself is never published.
//
// Golden checks run on every mode that covers them:
// Birkdale Rise files by the Birkdale golden home and
// Exeter Road by the Exeter golden home (the two homes
// the M8.3 promise test reads its streets from).
//
// The read of a cut STREAMS, and the rows never pile up
// behind the stream: the first golden-area smoke
// (20 Nov 2026) cut England perfectly — 6,596,554
// highway ways — then died at a ~1.9 GB heap holding
// the country's ~4.5M filed rows in one array before
// filing began. Stage-then-swap made the death
// harmless (the live table never saw the run); the
// streamed shape makes it impossible: the loader hands
// each row to its filing as it is read and holds only
// working sets — a batch of staged rows, an area's
// golden candidates, one extract at a time.
//
// A completed cut can be reused whole: when the
// environment names CMNH_STREETS_REUSE_DIR — a
// directory holding a previous run's cuts
// (<country>-streets.ndjson, exactly as a run's
// workdir leaves them) — the run streams from there
// and skips the download AND the cut for that country,
// so a filing-phase failure is re-run against the same
// cut instead of paying hours of cutting again. The
// sanity a reused cut gets is the download's md5
// refusal translated (Geofabrik publishes hashes for
// extracts, not for our cuts, and the published hash
// moves on daily besides): the file is present,
// non-empty, and its first line parses as a cut row —
// and the run's floors and golden checks then judge
// the stream as they judge any read.

import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import pg from "pg";

import {
  createLoaderResume,
  clearCheckpoint,
  readCheckpoint,
  writeCheckpoint,
} from "./loader-resume.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

const { Pool } = pg;

export const HOMES = {
  birkdale: {
    label: "19 Birkdale Rise CM3 2JT",
    lat: 51.776176,
    lon: 0.60387,
    street: "Birkdale Rise",
  },
  exeter: { label: "6 Exeter Road E16 1GN", lat: 51.515224, lon: 0.021177, street: "Exeter Road" },
};

export const COUNTRIES = ["england", "wales"];
const GEOFABRIK_BASE = "https://download.geofabrik.de/europe/united-kingdom";
// Staged-way floors per country extract: a short read is
// a broken read, and the run refuses rather than filing
// a partial country. The floors sit well below the first
// measured yields — England 4,550,399 filed-class ways
// and Wales ~494,000 highway ways in the 2026-11-12
// extracts (M8.3 measurement) — so ordinary map growth
// never trips them.
export const EXTRACT_FLOORS = { england: 3_000_000, wales: 300_000 };

export const SOURCE_NAME = "OpenStreetMap via Geofabrik (© OpenStreetMap contributors)";
const EXTRACT_SCRIPT = fileURLToPath(new URL("./osm-streets-extract.py", import.meta.url));

// The filed highway vocabulary (see the header): road
// classes plus the drawn path classes. Everything else
// a highway key can hold — construction, proposed,
// abandoned, raceway, bus guideways, crossings — never
// files.
export const FILED_HIGHWAY_CLASSES = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "pedestrian",
  "track",
  "footway",
  "path",
  "cycleway",
  "bridleway",
  "steps",
  "road",
]);

// The one filed class for an element's tags, or null
// when the element is not a street line this loader
// files.
export function classifyHighway(tags) {
  const highway = tags.highway ?? null;
  return highway !== null && FILED_HIGHWAY_CLASSES.has(highway) ? highway : null;
}

// The recorded name: the name tag trimmed, NULL when
// absent or blank. Unnamed ways file (see the header).
export function streetName(tags) {
  const name = (tags.name ?? "").trim();
  return name === "" ? null : name;
}

// A bbox as {west, south, east, north} in degrees,
// parsed from "minLon,minLat,maxLon,maxLat".
export function parseBbox(text) {
  const parts = text.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)))
    throw new Error(`bbox does not parse: ${JSON.stringify(text)}`);
  const [west, south, east, north] = parts;
  if (!(west < east && south < north)) throw new Error(`bbox is inverted: ${JSON.stringify(text)}`);
  return { west, south, east, north };
}

// A way meets a bbox when any of its points lies inside
// it (the serving read clips the filed geometry to the
// frame, so a way filed whole is correct; a way crossing
// the bbox with no node inside it is a theoretical miss
// the golden areas' wide cuts never meet in practice).
export function wayMeetsBbox(points, bbox) {
  return points.some(
    ([lat, lon]) => lon >= bbox.west && lon <= bbox.east && lat >= bbox.south && lat <= bbox.north,
  );
}

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3956;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// The golden checks (see the header): for each golden
// home in scope, a way carrying the home's street name
// files within 0.6 miles of the home point (nearest
// node — the check proves the street is filed by the
// home, not that serving will clip it, which is the
// flood suite's job). `inScope(homeKey)` decides which
// homes a run can prove anything about.
export function goldenChecks(rows, inScope) {
  const failures = [];
  for (const [key, home] of Object.entries(HOMES)) {
    if (!inScope(key)) continue;
    let best = null;
    for (const row of rows) {
      if (row.name !== home.street) continue;
      for (const [lat, lon] of row.points) {
        const d = haversineMiles(home.lat, home.lon, lat, lon);
        if (best === null || d < best) best = d;
      }
    }
    if (best === null) failures.push(`${home.label}: no way named "${home.street}" filed at all`);
    else if (best > 0.6)
      failures.push(
        `${home.label}: nearest "${home.street}" node is ${best.toFixed(3)} mi away, expected within 0.6`,
      );
  }
  return failures;
}

// Geofabrik's published .md5 file: "<hex>  <filename>".
// The oracle — a downloaded extract whose bytes do not
// hash to the published value is refused, never filed.
export function parsePublishedMd5(text) {
  const match = /^([0-9a-f]{32})\s+\S+/m.exec(text.trim());
  if (!match)
    throw new Error(`published md5 file does not parse: ${JSON.stringify(text.slice(0, 80))}`);
  return match[1];
}

export function md5Matches(actualHex, expectedHex) {
  return actualHex.toLowerCase() === expectedHex.toLowerCase();
}

// The extract's data date, from the dated filename the
// -latest name resolves to (england-261112.osm.pbf →
// 2026-11-12). Stamped on every row the file produced.
export function extractDataDate(datedUrl) {
  const match = /-(\d{2})(\d{2})(\d{2})\.osm\.pbf/.exec(datedUrl);
  if (!match) throw new Error(`dated extract filename does not parse: ${datedUrl}`);
  return `20${match[1]}-${match[2]}-${match[3]}`;
}

function wktOf(points) {
  return `LINESTRING(${points.map(([lat, lon]) => `${lon} ${lat}`).join(", ")})`;
}

const INSERT_BATCH = 500;

// The streamed filings accumulate this many rows
// before flushing them through insertRows — the only
// row array a streamed run ever holds, whatever the
// extract's size.
const STREAM_BATCH = 5000;

// The scoped filing's conflict rule: a way already
// filed (a border way read from both country extracts)
// is replaced by the later read.
const SCOPED_ON_CONFLICT =
  "ON CONFLICT (osm_id) DO UPDATE SET name = EXCLUDED.name, highway = EXCLUDED.highway, geom = EXCLUDED.geom, source_name = EXCLUDED.source_name, source_date = EXCLUDED.source_date, loaded_at = now()";

async function insertRows(client, table, rows, sourceDate, { onConflict, seqBase = null }) {
  const values = [];
  const params = [];
  // BUG-368: a staged row's seq is its ordinal in the staged
  // set (takeSeq-assigned by the caller), so the resume proof
  // can read the staged rows as a contiguous prefix. Live
  // tables carry no seq — the column is only ever written
  // for the stage table.
  const columns =
    seqBase === null
      ? "(osm_id, name, highway, geom, source_name, source_date)"
      : "(osm_id, name, highway, geom, source_name, source_date, seq)";
  const flush = async () => {
    if (values.length === 0) return;
    await client.query(
      `INSERT INTO ${table} ${columns}
       VALUES ${values.join(", ")} ${onConflict}`,
      params,
    );
    values.length = 0;
    params.length = 0;
  };
  let rowIndex = 0;
  for (const row of rows) {
    const base = params.length;
    const placeholders = [`$${base + 1}`, `$${base + 2}`, `$${base + 3}`];
    placeholders.push(`ST_GeomFromText($${base + 4}, 4326)`);
    placeholders.push(`$${base + 5}`, `$${base + 6}`);
    if (seqBase !== null) placeholders.push(`$${base + 7}`);
    values.push(`(${placeholders.join(", ")})`);
    params.push(row.osmId, row.name, row.highway, wktOf(row.points), SOURCE_NAME, sourceDate);
    if (seqBase !== null) params.push(seqBase + rowIndex);
    rowIndex += 1;
    if (values.length >= INSERT_BATCH) await flush();
  }
  await flush();
}

// Scoped filing (area cuts and fixtures): the rows
// meeting the scope are replaced inside one transaction
// — the scope's filed rows are deleted and the cut's
// rows inserted — so a re-run of the same cut is a
// no-op in effect and an interrupted cut leaves the
// previous filing untouched.
export async function fileStreetsScoped(pool, rows, bbox, sourceDate) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM street_lines
       WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)`,
      [bbox.west, bbox.south, bbox.east, bbox.north],
    );
    await insertRows(client, "street_lines", rows, sourceDate, {
      onConflict: SCOPED_ON_CONFLICT,
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// The streamed scoped filing (area cuts over country
// extracts): the same delete-and-insert inside one
// transaction as fileStreetsScoped, but the rows arrive
// from a fresh streamed pass over the extracts' cuts,
// flushed through insertRows a batch at a time — the
// area's rows are never held, however wide the area.
async function fileStreetsScopedStream(pool, extracts, bbox, sourceDate) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM street_lines
       WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)`,
      [bbox.west, bbox.south, bbox.east, bbox.north],
    );
    for (const ex of extracts) {
      let batch = [];
      const flush = async () => {
        if (batch.length === 0) return;
        await insertRows(client, "street_lines", batch, sourceDate, {
          onConflict: SCOPED_ON_CONFLICT,
        });
        batch = [];
      };
      await streamCutRows(ex.ndjsonPath, async (row) => {
        if (!wayMeetsBbox(row.points, bbox)) return;
        batch.push(row);
        if (batch.length >= STREAM_BATCH) await flush();
      });
      await flush();
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// The national stage: a persistent stage table the
// national flow fills country by country. Created (with its
// resume seq — see below) at the start of a run; the clearing
// is prepareResume's job, not this function's: a resumed run
// keeps the staged rows, a fresh start clears them (BUG-368).
// A table left by a pre-resume run has no seq column — the
// ALTER adds it, and the stale rows it carries are discarded
// by the next run's prepare(), whose prefix proof cannot read
// seq-less rows.
export async function ensureStreetStage(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS street_lines_stage (
    osm_id bigint PRIMARY KEY, name text, highway text NOT NULL, geom geometry(LineString, 4326) NOT NULL,
    source_name text NOT NULL, source_date date
  )`);
  await pool.query("ALTER TABLE street_lines_stage ADD COLUMN IF NOT EXISTS seq bigint");
}

export async function stageStreets(pool, rows, sourceDate, { seqBase = null } = {}) {
  const client = await pool.connect();
  try {
    await insertRows(client, "street_lines_stage", rows, sourceDate, {
      onConflict: "ON CONFLICT (osm_id) DO NOTHING",
      seqBase,
    });
  } finally {
    client.release();
  }
}

// A LINESTRING's points back out of its WKT — the staged
// golden rebuild's parse (the stage stores geometry, and
// ST_AsText is the round-trip the fake and the live table
// both speak).
/**
 * @param {string} wkt
 * @returns {[number, number][]}
 */
export function wktLineToPoints(wkt) {
  const body = wkt.replace(/^LINESTRING\s*\(/i, "").replace(/\)\s*$/, "");
  if (body.trim() === "") return [];
  return body.split(",").map((pair) => {
    const [lon, lat] = pair.trim().split(/\s+/).map(Number);
    return [lat, lon];
  });
}

// The staged portion's golden candidates, for rebuilding the
// golden set after a resume — the envelope test mirrors the
// golden check's 0.6-mile basis with room to spare (2 miles),
// so the rebuilt set is exactly what the live stream would
// have retained for that portion.
/**
 * @param {any} pool
 * @returns {Promise<{ osmId: number, name: string, highway: string, points: [number, number][] }[]>}
 */
async function stagedGoldenCandidates(pool) {
  if (!pool) return [];
  const homes = Object.values(HOMES);
  const conditions = [];
  const params = [];
  homes.forEach((home, i) => {
    const base = 2 + i * 2;
    conditions.push(
      `ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($${base}, $${base + 1}), 4326)::geography, $${2 + homes.length * 2})`,
    );
    params.push(home.lon, home.lat);
  });
  params.push(GOLDEN_WINDOW_MILES * 1609.344);
  const { rows } = await pool.query(
    `SELECT osm_id, name, highway, ST_AsText(geom) AS wkt FROM street_lines_stage WHERE name = ANY($1) AND (${conditions.join(" OR ")})`,
    [[...GOLDEN_STREET_NAMES], ...params],
  );
  return rows.map((r) => ({
    osmId: Number(r.osm_id),
    name: r.name,
    highway: r.highway,
    points: wktLineToPoints(r.wkt),
  }));
}

// The golden checks only ever read rows carrying a golden
// street's name — goldenChecks skips every other row it is
// handed — so a streamed run collects just those candidate
// rows as it passes and runs the same checks over them:
// identical verdicts, a handful of rows held.
const GOLDEN_WINDOW_MILES = 2;

// --- national staging with resume (BUG-368) --------------------------

// Stage, floor, swap — with resume support (BUG-368): the
// national flow streams each country's cut into the PERSISTENT
// street_lines_stage table (migration 0048 — the parent adds
// the table at merge time; beginNationalStaging still creates
// it, so the loader works on a database the migration has not
// yet reached), and a loader_checkpoint row records the last
// fully staged chunk, so a killed run resumes mid-country
// instead of re-staging the whole extract.
//
// THE RESUME UNITS. The edition is the extracts' data dates
// (country@date, joined): a Geofabrik republication changes a
// date and invalidates the checkpoint, so a resumed run never
// stages rows from two different extracts. The checkpoint's
// next_start_index is the TOTAL staged rows; its state carries
// the country in progress, the completed countries' staged
// counts, and the in-progress country's staged count — the
// resumed run skips the completed countries entirely and
// re-reads the in-progress country's cut, skipping exactly
// the staged rows. The staged rows are keyed on osm_id and
// staged with ON CONFLICT DO NOTHING, so the re-read's
// re-stage of the uncheckpointed tail is a no-op in effect,
// and prepare() trims that tail first (the AQMA shape). The
// checkpoint lands every 100,000 staged rows per country and
// at each country's end — one line per checkpointed chunk,
// never per row — so a kill loses at most 100,000 rows of
// re-staging (a re-read of the cut, seconds against the
// hours-long run). The floor and golden verdicts are reached
// as the country's stream ends, over the country's whole
// filed-class count (the stream reads the whole cut either
// way) and the merged golden candidates (streamed + staged),
// and still gate the swap. The swap itself is unchanged: the
// live table is replaced from the stage inside one
// transaction, and the stage is dropped — a crash anywhere
// before the commit leaves the last good table serving.
// BUG-248 atomicity unchanged: the live table changes only
// at the swap.
//
// THE DOWNLOAD-AND-CUT CAVEAT. The checkpoint covers the
// staging stream, not the download + cut that precedes it: a
// kill before staging restarts the pass, re-downloading and
// re-cutting (unless CMNH_STREETS_REUSE_DIR holds the
// completed cuts, which the run then picks up again). The
// staging resume saves the long stream, not the cut.
/**
 * @param {any} pool
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, restart?: boolean }} [options]
 */
export async function beginNationalStaging(pool, { progress = null, restart = false } = {}) {
  if (pool) await ensureStreetStage(pool);
  const resume = pool
    ? createLoaderResume(pool, {
        loader: "load-streets",
        stageTable: "street_lines_stage",
        progress,
        restart,
      })
    : null;
  let edition = null;
  /** @type {{ resumed: boolean, reason?: string, checkpoint?: any, prefix?: boolean }} */
  let resumePrep = { resumed: false };
  let resumeState = {};
  // The staged counts: the global total, the completed
  // countries' totals, and the in-progress country's staged
  // count (the skip for its re-read).
  let totalStaged = 0;
  let perCountry = {};
  let currentCountry = null;
  let stagedInCountry = 0;
  return {
    resumePrep: () => resumePrep,
    resumeNote: () => (resume ? resume.resumeNote() : "the start (nothing staged yet)"),
    stagedCount: () => totalStaged,
    // Decide, from the extracts' edition and the staged rows,
    // whether this run resumes or starts from zero. Called
    // once the extracts are resolved and before the first
    // country streams.
    async prepareResume(ed) {
      edition = ed;
      if (!resume) return resumePrep;
      resumePrep = await resume.prepare({ edition, expected: null });
      if (resumePrep.resumed) {
        const cp = resumePrep.checkpoint;
        totalStaged = cp.filed_count;
        resumeState = cp.state ?? {};
        perCountry = { ...(resumeState.perCountry ?? {}) };
        currentCountry = resumeState.country ?? null;
        stagedInCountry = resumeState.stagedInCountry ?? 0;
      }
      return resumePrep;
    },
    // The completed countries, by name — the caller's loop
    // skips them outright on a resume.
    completedCountries: () => ({ ...perCountry }),
    // Stream one country's cut into the stage, checkpointing
    // every 100,000 staged rows and at the country's end.
    // Returns the country's whole filed-class count (the
    // stream reads the whole cut either way, so the floor
    // reads the country, not the resumed portion) and the
    // golden candidates the resumed portion streamed.
    async stageCountry(country, ndjsonPath, sourceDate) {
      const skipFiled = resumePrep.resumed && currentCountry === country ? stagedInCountry : 0;
      let skipped = 0;
      let stagedBefore = stagedInCountry;
      if (currentCountry !== country) {
        currentCountry = country;
        stagedInCountry = 0;
        stagedBefore = 0;
      }
      const candidates = goldenCandidates();
      let batch = [];
      // BUG-204: England stages ~3M rows — a line every
      // 100,000 staged, so the country's long stream is
      // visible. (The per-country summary line below stays
      // the closing line; the tally has no finish.)
      const stageTally = progress?.tally({
        label: `${country} staging`,
        every: 100000,
        unit: "street lines",
      });
      // BUG-248: the 5,000-row staging flushes get a
      // slow-batch watch; the heartbeat fires every
      // 1,000,000 staged rows or 15 minutes.
      const flushWatch = createBatchWatch();
      let lastCheckpointedInCountry = stagedInCountry;
      const checkpoint = async () => {
        if (!resume) return;
        await resume.checkpoint({
          edition,
          expected: null,
          nextStartIndex: totalStaged,
          read: totalStaged,
          filed: totalStaged,
          state: { country, perCountry: { ...perCountry }, stagedInCountry },
          unit: "street lines",
        });
        lastCheckpointedInCountry = stagedInCountry;
      };
      const flush = async () => {
        if (batch.length === 0) return;
        const started = Date.now();
        if (pool) {
          const seqBase = resume ? resume.takeSeq(batch.length) : null;
          await stageStreets(pool, batch, sourceDate, { seqBase });
        }
        const { tookMs, averageMs, slow } = flushWatch.observe(Date.now() - started);
        totalStaged += batch.length;
        stagedInCountry += batch.length;
        stageTally?.tick(stagedInCountry);
        progress?.heartbeat({
          stage: `${country} staging`,
          done: stagedInCountry,
          every: 1_000_000,
        });
        if (slow) {
          progress?.warning({
            what: `${country} staging flush duration`,
            value: `flush of ${formatCount(batch.length)} rows took ${formatDuration(tookMs)}`,
            threshold: `3x recent average ${formatDuration(averageMs)}`,
          });
        }
        batch = [];
        if (stagedInCountry - lastCheckpointedInCountry >= 100000) await checkpoint();
      };
      const part = await streamCutRows(ndjsonPath, async (row) => {
        if (skipped < skipFiled) {
          skipped += 1;
          return;
        }
        candidates.take(row);
        batch.push(row);
        if (batch.length >= STREAM_BATCH) await flush();
      });
      await flush();
      // The country's end is checkpointed even when the
      // 100,000-row cadence did not just fire: the completed
      // country's count is what the next country resumes
      // past, and a kill before it would re-stage the tail.
      if (pool) {
        perCountry[country] = stagedBefore + (part.rowsFiled - skipFiled);
        await checkpoint();
      }
      return {
        waysRead: part.waysRead,
        rowsFiled: part.rowsFiled,
        candidates: candidates.rows,
      };
    },
    // The staged portion's golden candidates, merged by the
    // caller with the streamed ones before the golden checks.
    async stagedGoldenCandidates() {
      return stagedGoldenCandidates(pool);
    },
    // The swap, then the checkpoint alone is cleared — the
    // swap already dropped the stage table, so the handle's
    // clear() (which deletes from the stage) cannot run.
    // The cleanup is best-effort and never fails the run:
    // the swap has already committed, and a leftover
    // checkpoint is discarded by the next run's prepare()
    // (its ensure recreates the dropped stage table first,
    // so the prefix proof reads an empty stage and discards).
    async finishStaging() {
      const filed = await swapStagedStreets(pool);
      if (pool) {
        try {
          await clearCheckpoint(pool, "load-streets");
          progress?.stage("staging cleared · checkpoint removed");
        } catch (error) {
          progress?.stage(
            "checkpoint cleanup failed — left for the next run to discard · " +
              String(error?.message ?? error ?? "").split(/\r?\n/)[0],
          );
        }
      }
      return filed;
    },
    async abortStaging() {
      // The staging + checkpoint STAY: they are the next run's
      // resume point.
    },
  };
}

// The swap: the live table is replaced from the stage
// inside one transaction, and the stage is dropped — a
// crash anywhere before the commit leaves the last good
// table serving, and no stale stage survives a success.
export async function swapStagedStreets(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT count(*)::int AS n FROM street_lines_stage");
    const staged = Number(rows[0]?.n ?? 0);
    await client.query("TRUNCATE street_lines");
    await client.query(
      `INSERT INTO street_lines (osm_id, name, highway, geom, source_name, source_date, loaded_at)
       SELECT osm_id, name, highway, geom, source_name, source_date, now() FROM street_lines_stage`,
    );
    await client.query("DROP TABLE street_lines_stage");
    await client.query("COMMIT");
    return staged;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_FIXTURE_DIR = fileURLToPath(
  new URL("../../tests/fixtures/streets/", import.meta.url),
);

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

// The loader's own HTTP-error wording, kept: fetchResponse
// throws `HTTP <status> for <what>`, this helper rewords a
// status failure into the form its callers have always
// seen (and keeps the status on the error, as
// fetchResponse stamps it). A failure with no status —
// the transport's own error — passes through untouched.
function rewordHttpError(error, message) {
  if (typeof error?.status !== "number") return error;
  return Object.assign(new Error(message), { status: error.status });
}

async function fetchText(url, what, opts = {}) {
  try {
    return (await fetchResponse(url, what, opts)).text();
  } catch (error) {
    throw rewordHttpError(error, `${what}: HTTP ${error.status} from ${url}`);
  }
}

async function md5OfFile(path) {
  const hash = createHash("md5");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

// Cut one extract down to its street lines with the
// libosmium cutter; returns the cut's ndjson path. The
// read of the cut is streamCutRows' job — the two are
// separate because a completed cut can be reused whole
// (see reusedCut below) and because the area mode reads
// one cut once per area without ever re-cutting.
async function cutExtract(inputPath, workDir, label) {
  const ndjsonPath = join(workDir, `${label}-streets.ndjson`);
  await new Promise((resolve, reject) => {
    const child = spawn("python3", [EXTRACT_SCRIPT, inputPath, ndjsonPath], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `osm-streets-extract failed for ${label} (exit ${code}) — python3 with pyosmium is required (pip install osmium)`,
          ),
        );
    });
  });
  return ndjsonPath;
}

// Stream one cut's ndjson, handing every filed row
// (post-vocabulary) to onRow as it is read, and return
// the ways read and the rows handed over. No caller
// receives a country's rows: each says what to do with
// a row — stage a batch, count it, test it against an
// area — and holds only its own working set (see the
// header: the array this function used to return is
// what died at a ~1.9 GB heap on the first smoke run).
async function streamCutRows(ndjsonPath, onRow) {
  let waysRead = 0;
  let rowsFiled = 0;
  const rl = createInterface({ input: createReadStream(ndjsonPath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim() === "") continue;
    waysRead++;
    const el = JSON.parse(line);
    const highway = classifyHighway(el.tags);
    if (highway === null) continue;
    rowsFiled++;
    await onRow({ osmId: el.id, name: streetName(el.tags), highway, points: el.points });
  }
  return { waysRead, rowsFiled };
}

// The golden checks only ever read rows carrying a
// golden street's name — goldenChecks skips every other
// row it is handed — so a streamed run collects just
// those candidate rows as it passes and runs the same
// checks over them: identical verdicts, a handful of
// rows held.
const GOLDEN_STREET_NAMES = new Set(Object.values(HOMES).map((h) => h.street));

function goldenCandidates() {
  const rows = [];
  return {
    rows,
    take(row) {
      if (row.name !== null && GOLDEN_STREET_NAMES.has(row.name)) rows.push(row);
    },
  };
}

/**
 * @param {string} country
 * @param {string} workDir
 * @param {{ delaysMs?: number[], onRetry?: ((error: Error, attempt: number, delay: number, what: string) => void) | null, retryBudgetMs?: number }} [opts]
 */
export async function downloadCountry(country, workDir, opts = {}) {
  const latestUrl = `${GEOFABRIK_BASE}/${country}/${country}-latest.osm.pbf`;
  let head;
  try {
    head = await fetchResponse(latestUrl, `${country}: HEAD ${latestUrl}`, {
      ...opts,
      init: { method: "HEAD" },
    });
  } catch (error) {
    throw rewordHttpError(error, `${country}: HEAD ${latestUrl} returned HTTP ${error.status}`);
  }
  const dataDate = extractDataDate(head.url);
  const published = parsePublishedMd5(await fetchText(`${latestUrl}.md5`, `${country} md5`, opts));
  const dest = join(workDir, `${country}.osm.pbf`);
  // BUG-385: the whole download is the retried unit — a
  // mid-transfer cut retries the download from scratch,
  // never the processing — for up to 30 minutes
  // (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
  // 2026), replacing the old one-retry-after-3s loop.
  // Each attempt opens a fresh write stream, and
  // createWriteStream truncates, so a cut-short attempt
  // never leaves a partial file for the next attempt to
  // extend; the md5 below remains the only acceptance
  // test. A non-transient failure throws at once.
  const {
    delaysMs = RETRY_DELAYS_MS,
    onRetry = null,
    retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS,
  } = opts;
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const res = await fetch(latestUrl);
      if (!res.ok || !res.body) {
        const error = new Error(`${country}: download of ${latestUrl} returned HTTP ${res.status}`);
        error.status = res.status;
        throw error;
      }
      await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
      break;
    } catch (error) {
      if (!isTransientFetchError(error)) throw error;
      if (Date.now() - startedAt >= retryBudgetMs) throw error;
      const delay =
        delaysMs.length === 0 ? 0 : delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      onRetry?.(error, attempt, delay, `${country} download`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  const actual = await md5OfFile(dest);
  if (!md5Matches(actual, published))
    throw new Error(
      `${country}: downloaded extract hashes to ${actual} but Geofabrik publishes ${published} — refusing to file from an unverified extract`,
    );
  return { path: dest, dataDate };
}

async function localCountry(country, pbfDir) {
  const file = readdirSync(pbfDir).find(
    (f) => f.startsWith(`${country}-`) && f.endsWith(".osm.pbf"),
  );
  if (!file) return null;
  const published = parsePublishedMd5(
    await fetchText(`${GEOFABRIK_BASE}/${country}/${country}-latest.osm.pbf.md5`, `${country} md5`),
  );
  const actual = await md5OfFile(join(pbfDir, file));
  if (!md5Matches(actual, published))
    throw new Error(
      `${country}: the local file ${file} hashes to ${actual} but Geofabrik publishes ${published} — refusing to file from an unverified extract`,
    );
  return { path: join(pbfDir, file), dataDate: extractDataDate(file) };
}

// The first non-blank line of a file, read without
// holding the file — the reused-cut sanity's parse
// probe.
async function firstCutLine(path) {
  const input = createReadStream(path);
  const rl = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (line.trim() !== "") return line;
    }
    return null;
  } finally {
    rl.close();
    input.destroy();
  }
}

// The reuse hook (see the header): when
// CMNH_STREETS_REUSE_DIR names a directory holding a
// country's completed cut, return that cut — the run
// streams from it and skips the download and the cut
// for the country. A country with no cut in the
// directory returns null and follows the ordinary
// path; a cut that is present but fails the sanity
// (empty, or its first line does not parse as a cut
// row) REFUSES the run, the md5 refusal's equivalent.
// The extract's data date rides on a dated sibling
// extract file (<country>-YYMMDD.osm.pbf) when the
// directory holds one; without one the cut's rows
// stamp the run's retrieval date, the fallback the
// area mode already uses for an undated read.
async function reusedCut(country, reuseDir) {
  if (!reuseDir) return null;
  const path = join(reuseDir, `${country}-streets.ndjson`);
  if (!existsSync(path)) return null;
  const refuse = (why) => {
    throw new Error(
      `CMNH_STREETS_REUSE_DIR: the reused ${country} cut at ${path} ${why} — refusing to file from it`,
    );
  };
  const stat = statSync(path);
  if (!stat.isFile() || stat.size === 0) refuse("is empty");
  const first = await firstCutLine(path);
  let parsed = null;
  try {
    parsed = first === null ? null : JSON.parse(first);
  } catch {
    parsed = null;
  }
  if (
    parsed === null ||
    typeof parsed.id !== "number" ||
    typeof parsed.tags !== "object" ||
    parsed.tags === null ||
    !Array.isArray(parsed.points)
  )
    refuse("does not parse as a street cut");
  const dated = readdirSync(reuseDir).find((f) =>
    new RegExp(`^${country}-\\d{6}\\.osm\\.pbf$`).test(f),
  );
  return { path, dataDate: dated ? extractDataDate(dated) : null };
}

// The extracts' edition, for the resume checkpoints — the
// countries' data dates, joined. A Geofabrik republication
// changes a date and invalidates any checkpoint, so a resumed
// run never mixes rows from two different extracts. An undated
// cut (a reused cut with no dated sibling) stamps the run's
// retrieval date instead, the fallback the area mode already
// uses for an undated read.
export function extractsEdition(extracts, retrievedOn) {
  return extracts.map((e) => `${e.country}@${e.dataDate ?? retrievedOn}`).join(",");
}

// The area run's resume note — the phrase after "resume from".
// Areas commit one by one, so the note names the next area to
// run, or the start when nothing has filed yet.
export function areaResumeNote(checkpoint, edition) {
  if (!checkpoint) return "the start (no area filed yet)";
  return `checkpoint ${formatCount(checkpoint.next_start_index)} (edition ${edition})`;
}

// Area cuts, with resume support (BUG-368): each area files in
// its own transaction, so a kill loses at most the area in
// flight — and a checkpoint row (loader "load-streets-areas",
// edition = the extracts' edition) records the completed
// areas, so the next run skips them instead of re-reading
// their cuts. The checkpoint is the resume state alone: areas
// commit straight to the live table, so there is no staging
// table for this mode, and the checkpoint is written with the
// module's own primitives (readCheckpoint / writeCheckpoint /
// clearCheckpoint), not the staging handle. A run that
// completes clears its checkpoint; a run after a republication
// discards it and starts from the first area.
/**
 * @param {any} pool
 * @param {any} extracts
 * @param {any} bboxes
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, restart?: boolean, verifyOnly?: boolean, retrievedOn: string, edition: string }} options
 */
export async function runAreaCuts(
  pool,
  extracts,
  bboxes,
  { progress = null, restart = false, verifyOnly = false, retrievedOn, edition },
) {
  // Area cuts: each area files in its own transaction, in
  // argument order. Each area makes two streamed passes over
  // the extracts' cuts — the first counts the area's rows and
  // collects its golden candidates for the checks, the second
  // (fileStreetsScopedStream) files them in batches inside
  // the area's transaction — so an area run holds a handful
  // of candidate rows and one insert batch, never a country's
  // read. (The first smoke run held the whole England read
  // and died before filing a single area.)
  let checkpoint = null;
  if (pool) {
    checkpoint = await readCheckpoint(pool, "load-streets-areas");
    if (restart) {
      await clearCheckpoint(pool, "load-streets-areas");
      checkpoint = null;
      progress?.stage("restart requested — discarding checkpoint · starting from the first area");
    } else if (checkpoint && checkpoint.edition !== edition) {
      progress?.stage(
        `discarding stale checkpoint · edition changed (${checkpoint.edition} → ${edition}) · starting from the first area`,
      );
      await clearCheckpoint(pool, "load-streets-areas");
      checkpoint = null;
    } else if (checkpoint) {
      progress?.stage(
        `resuming from checkpoint · ${formatCount(checkpoint.filed_count)} rows filed in ${formatCount(checkpoint.next_start_index)} areas · edition ${checkpoint.edition}`,
      );
    }
  }
  // BUG-248: areas file one by one, each in its own
  // transaction — the failure line names the area it
  // died in and how many rows earlier areas filed.
  let areasDone = checkpoint?.next_start_index ?? 0;
  let areasFiled = checkpoint?.filed_count ?? 0;
  const startAt = areasDone;
  for (let i = startAt; i < bboxes.length; i += 1) {
    const bbox = bboxes[i];
    try {
      let rows = 0;
      let waysRead = 0;
      let sourceDate = null;
      const candidates = goldenCandidates();
      for (const ex of extracts) {
        const part = await streamCutRows(ex.ndjsonPath, (row) => {
          candidates.take(row);
          if (wayMeetsBbox(row.points, bbox)) rows++;
        });
        waysRead += part.waysRead;
        sourceDate = ex.dataDate;
      }
      const inScope = (key) => {
        const home = HOMES[key];
        return (
          home.lon >= bbox.west &&
          home.lon <= bbox.east &&
          home.lat >= bbox.south &&
          home.lat <= bbox.north
        );
      };
      const golden = goldenChecks(candidates.rows, inScope);
      if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);
      areasDone += 1;
      progress?.heartbeat({ stage: "areas", done: areasDone, total: bboxes.length, every: 1 });
      if (verifyOnly) {
        console.log(
          `load-streets · would file ${formatCount(rows)} street lines for area ${bbox.west},${bbox.south},${bbox.east},${bbox.north} (${formatCount(waysRead)} highway ways read) — golden homes OK (verify-only: nothing filed)`,
        );
        continue;
      }
      await fileStreetsScopedStream(pool, extracts, bbox, sourceDate ?? retrievedOn);
      console.log(
        `load-streets · ${formatCount(rows)} street lines filed for area ${bbox.west},${bbox.south},${bbox.east},${bbox.north} (${formatCount(waysRead)} highway ways read) — golden homes OK`,
      );
      areasFiled += rows;
      if (pool) {
        // One line per committed area — the visible save.
        const row = {
          loader: "load-streets-areas",
          edition,
          expected: bboxes.length,
          nextStartIndex: areasDone,
          read: areasDone,
          filed: areasFiled,
          state: {},
        };
        await writeCheckpoint(pool, row);
        progress?.count({
          label: "checkpoint",
          done: areasDone,
          total: bboxes.length,
          unit: "areas",
          extra: `filed ${formatCount(areasFiled)} · resume from ${formatCount(areasDone)}`,
        });
        checkpoint = {
          ...row,
          next_start_index: row.nextStartIndex,
          read_count: row.read,
          filed_count: row.filed,
        };
      }
    } catch (err) {
      progress?.failed({
        stage: `area ${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
        filed: areasFiled,
        error: err,
        resume: areaResumeNote(checkpoint, edition),
      });
      throw err;
    }
  }
  if (pool) await clearCheckpoint(pool, "load-streets-areas");
  return { areasDone, areasFiled };
}

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const fixtureMode = args.includes("--fixture") || fileArg !== null;
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last checkpoint instead of
  // restarting; with no checkpoint this is a fresh start.
  const restart = args.includes("--restart");
  const pbfDirIdx = args.indexOf("--pbf-dir");
  const pbfDir = pbfDirIdx >= 0 ? args[pbfDirIdx + 1] : null;
  const bboxIdx = args.indexOf("--bbox");
  const bboxes = bboxIdx >= 0 ? args[bboxIdx + 1].split(";").map(parseBbox) : null;
  const countriesIdx = args.indexOf("--countries");
  const countries = countriesIdx >= 0 ? args[countriesIdx + 1].split(",") : COUNTRIES;
  for (const c of countries)
    if (!COUNTRIES.includes(c)) throw new Error(`unknown country ${JSON.stringify(c)}`);
  const retrievedOn = todayDate();
  const reuseDir = process.env.CMNH_STREETS_REUSE_DIR ?? null;
  const workDir = mkdtempSync(join(tmpdir(), "cmnh-streets-"));
  // BUG-204: one logger for the run — the national
  // staging tally and the swap marker below.
  const progress = createProgressLogger({ name: "load-streets" });
  try {
    if (fixtureMode) {
      const fixtureDir = fileArg ?? DEFAULT_FIXTURE_DIR;
      // A capture too large to commit raw (the Exeter
      // cut is 5 MB of XML, over the push channel's
      // request limit) is stored gzipped + base64 as
      // <name>.osm.gz.b64 and materialised here on
      // first use — the same encoded-fixture pattern
      // as the e2e screenshot baselines. A plain .osm
      // already on disk is never overwritten.
      for (const f of readdirSync(fixtureDir).filter((x) => x.endsWith(".osm.gz.b64"))) {
        const plain = join(fixtureDir, f.slice(0, -".gz.b64".length));
        if (!existsSync(plain)) {
          writeFileSync(
            plain,
            gunzipSync(Buffer.from(readFileSync(join(fixtureDir, f), "utf8"), "base64")),
          );
        }
      }
      const capturedDate = JSON.parse(
        readFileSync(join(fixtureDir, "fixture.json"), "utf8"),
      ).captured;
      const files = readdirSync(fixtureDir)
        .filter((f) => f.endsWith(".osm"))
        .sort();
      if (files.length === 0) throw new Error("streets fixture directory holds no .osm captures");
      // The captures are committed test files, bounded
      // by construction, so fixture mode still collects
      // its rows whole — the streamed country reads are
      // the ones that must never hold a read (see the
      // header).
      let rows = [];
      for (const file of files) {
        const ndjsonPath = await cutExtract(join(fixtureDir, file), workDir, `fixture-${file}`);
        await streamCutRows(ndjsonPath, (row) => {
          rows.push(row);
        });
      }
      const golden = goldenChecks(rows, () => true);
      if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);
      if (verifyOnly) {
        console.log(
          `load-streets · would file ${formatCount(rows.length)} street lines from fixture captures — golden homes OK (verify-only: nothing filed)`,
        );
        return;
      }
      // The fixture's own extent is its scope.
      let west = Infinity,
        south = Infinity,
        east = -Infinity,
        north = -Infinity;
      for (const row of rows)
        for (const [lat, lon] of row.points) {
          west = Math.min(west, lon);
          east = Math.max(east, lon);
          south = Math.min(south, lat);
          north = Math.max(north, lat);
        }
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        await fileStreetsScoped(pool, rows, { west, south, east, north }, capturedDate);
      } finally {
        await pool.end();
      }
      console.log(
        `load-streets · ${formatCount(rows.length)} street lines filed from fixture captures — golden homes OK`,
      );
      return;
    }

    // Country extracts, each resolved to the ndjson cut
    // the modes stream from: a reused completed cut
    // where CMNH_STREETS_REUSE_DIR holds one (download
    // and cut skipped), otherwise a fresh cut of the
    // local or downloaded extract, made once here —
    // every mode then reads cuts, never extracts.
    const extracts = [];
    // BUG-248: a download + cut is the pass's first long
    // phase — a heartbeat per country resolved, and one
    // failure line if a download or cut fails.
    try {
      for (const country of countries) {
        const reused = await reusedCut(country, reuseDir);
        if (reused) {
          console.log(
            `load-streets · ${country}: reusing the completed cut at ${reused.path} — download and cut skipped`,
          );
          extracts.push({ country, ndjsonPath: reused.path, dataDate: reused.dataDate });
        } else {
          const got = pbfDir
            ? await localCountry(country, pbfDir)
            : await downloadCountry(country, workDir);
          if (!got) continue;
          console.log(`load-streets · cutting ${country} (extract dated ${got.dataDate})…`);
          const ndjsonPath = await cutExtract(got.path, workDir, country);
          extracts.push({ country, ndjsonPath, dataDate: got.dataDate });
        }
        progress.heartbeat({
          stage: "extracts",
          done: extracts.length,
          total: countries.length,
          every: 1,
        });
      }
    } catch (err) {
      progress.failed({
        stage: "extracts",
        filed: 0,
        error: err,
        resume:
          "re-run the pass from the start (cuts are rebuilt; a reused cut is picked up again)",
      });
      throw err;
    }
    if (extracts.length === 0) throw new Error("no country extracts were read");

    if (bboxes) {
      // Area cuts (see runAreaCuts): each area files in its
      // own transaction, and a checkpoint records the
      // completed areas so a killed pass resumes past them.
      const pool = verifyOnly ? null : new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        await runAreaCuts(pool, extracts, bboxes, {
          progress,
          restart,
          verifyOnly,
          retrievedOn,
          edition: extractsEdition(extracts, retrievedOn),
        });
      } finally {
        if (pool) await pool.end();
      }
      return;
    }

    // National: stage every country, floor each, then
    // swap once. A country's rows stream from its cut
    // into the stage a batch at a time — the golden
    // candidates are the only rows held, and only
    // England's checks read them. The floor and golden
    // verdicts are reached as the country's stream ends
    // and still gate the swap: the stage is persistent by
    // design (a refused country leaves staged rows that
    // never serve — the live table changes only at the
    // swap), and a killed run resumes mid-country from
    // the checkpoint (BUG-368; see beginNationalStaging).
    const pool = verifyOnly ? null : new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const staging = await beginNationalStaging(pool, { progress, restart });
      await staging.prepareResume(extractsEdition(extracts, retrievedOn));
      const completed = staging.completedCountries();
      let totalStaged = 0;
      for (const ex of extracts) {
        if (completed[ex.country] !== undefined) {
          // Resumed: this country already staged whole in
          // an earlier run — its floor and golden verdicts
          // were reached then, and the checkpoint stands
          // for them.
          console.log(
            `load-streets · ${ex.country}: ${formatCount(completed[ex.country])} street lines already staged — resuming past it`,
          );
          totalStaged += completed[ex.country];
          continue;
        }
        // BUG-248: a country's staging fails before anything
        // serves — the stage is persistent, and the swap is
        // the only point that files.
        try {
          const part = await staging.stageCountry(
            ex.country,
            ex.ndjsonPath,
            ex.dataDate ?? retrievedOn,
          );
          if (part.rowsFiled < EXTRACT_FLOORS[ex.country])
            throw new Error(
              `${ex.country}: staged ${part.rowsFiled} street lines but the floor is ${EXTRACT_FLOORS[ex.country]} — the read does not reconcile`,
            );
          if (ex.country === "england") {
            const staged = await staging.stagedGoldenCandidates();
            const golden = goldenChecks([...part.candidates, ...staged], () => true);
            if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);
          }
          console.log(
            `load-streets · ${ex.country}: ${formatCount(part.waysRead)} highway ways read, ${formatCount(part.rowsFiled)} street lines staged`,
          );
          totalStaged += part.rowsFiled;
        } catch (err) {
          progress.failed({
            stage: `${ex.country} staging`,
            filed: totalStaged,
            error: err,
            resume: staging.resumeNote(),
          });
          throw err;
        }
      }
      if (verifyOnly) {
        console.log(
          `load-streets · would file ${formatCount(totalStaged)} street lines (${extracts.map((e) => e.country).join(" + ")}) — golden homes OK (verify-only: nothing filed)`,
        );
        return;
      }
      progress.stage(
        `swap started — filing ${formatCount(totalStaged)} staged street lines into the live table`,
      );
      let filed;
      try {
        filed = await staging.finishStaging();
      } catch (err) {
        // BUG-248: the swap is atomic — on a failure the
        // live table is untouched.
        progress.failed({
          stage: "swap",
          filed: 0,
          total: totalStaged,
          error: err,
          resume: staging.resumeNote(),
        });
        throw err;
      }
      console.log(
        `load-streets · ${formatCount(filed)} street lines filed (${extracts.map((e) => e.country).join(" + ")}) — golden homes OK`,
      );
    } finally {
      if (pool) await pool.end();
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// Run only as a script (run-loaders / npm), never on import —
// the tests import the pure helpers above.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(`load-streets FAILED: ${err.message}`);
    process.exit(1);
  });
}
