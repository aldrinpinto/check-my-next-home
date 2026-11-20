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

async function insertRows(client, table, rows, sourceDate, { onConflict }) {
  const values = [];
  const params = [];
  const flush = async () => {
    if (values.length === 0) return;
    await client.query(
      `INSERT INTO ${table} (osm_id, name, highway, geom, source_name, source_date)
       VALUES ${values.join(", ")} ${onConflict}`,
      params,
    );
    values.length = 0;
    params.length = 0;
  };
  for (const row of rows) {
    const base = params.length;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, ST_GeomFromText($${base + 4}, 4326), $${base + 5}, $${base + 6})`,
    );
    params.push(row.osmId, row.name, row.highway, wktOf(row.points), SOURCE_NAME, sourceDate);
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
// national flow fills country by country. Reset at the
// start of a run (a previous interrupted run's stage is
// discarded, never merged), appended per country, and
// swapped by swapStagedStreets only when every country
// has staged.
export async function resetStreetStage(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS street_lines_stage (
    osm_id bigint PRIMARY KEY, name text, highway text NOT NULL, geom geometry(LineString, 4326) NOT NULL,
    source_name text NOT NULL, source_date date
  )`);
  await pool.query("TRUNCATE street_lines_stage");
}

export async function stageStreets(pool, rows, sourceDate) {
  const client = await pool.connect();
  try {
    await insertRows(client, "street_lines_stage", rows, sourceDate, {
      onConflict: "ON CONFLICT (osm_id) DO NOTHING",
    });
  } finally {
    client.release();
  }
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

async function fetchText(url, what) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} from ${url}`);
  return res.text();
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

async function downloadCountry(country, workDir) {
  const latestUrl = `${GEOFABRIK_BASE}/${country}/${country}-latest.osm.pbf`;
  const head = await fetch(latestUrl, { method: "HEAD" });
  if (!head.ok) throw new Error(`${country}: HEAD ${latestUrl} returned HTTP ${head.status}`);
  const dataDate = extractDataDate(head.url);
  const published = parsePublishedMd5(await fetchText(`${latestUrl}.md5`, `${country} md5`));
  const dest = join(workDir, `${country}.osm.pbf`);
  // One retry on a network cut (these are the largest
  // downloads in the project — England is ~1.7 GB); a
  // partial file is always discarded, and the md5 below
  // remains the only acceptance test.
  let downloadError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(latestUrl);
      if (!res.ok || !res.body)
        throw new Error(`${country}: download of ${latestUrl} returned HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
      downloadError = null;
      break;
    } catch (err) {
      downloadError = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (downloadError) throw downloadError;
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

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const fixtureMode = args.includes("--fixture") || fileArg !== null;
  const verifyOnly = args.includes("--verify-only");
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
          `load-streets · would file ${rows.length} street lines from fixture captures — golden homes OK (verify-only: nothing filed)`,
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
        `load-streets · ${rows.length} street lines filed from fixture captures — golden homes OK`,
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
    for (const country of countries) {
      const reused = await reusedCut(country, reuseDir);
      if (reused) {
        console.log(
          `load-streets · ${country}: reusing the completed cut at ${reused.path} — download and cut skipped`,
        );
        extracts.push({ country, ndjsonPath: reused.path, dataDate: reused.dataDate });
        continue;
      }
      const got = pbfDir
        ? await localCountry(country, pbfDir)
        : await downloadCountry(country, workDir);
      if (!got) continue;
      console.log(`load-streets · cutting ${country} (extract dated ${got.dataDate})…`);
      const ndjsonPath = await cutExtract(got.path, workDir, country);
      extracts.push({ country, ndjsonPath, dataDate: got.dataDate });
    }
    if (extracts.length === 0) throw new Error("no country extracts were read");

    if (bboxes) {
      // Area cuts: each area files in its own
      // transaction, in argument order. Each area makes
      // two streamed passes over the extracts' cuts —
      // the first counts the area's rows and collects
      // its golden candidates for the checks, the second
      // (fileStreetsScopedStream) files them in batches
      // inside the area's transaction — so an area run
      // holds a handful of candidate rows and one insert
      // batch, never a country's read. (The first smoke
      // run held the whole England read and died before
      // filing a single area.)
      const pool = verifyOnly ? null : new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        for (const bbox of bboxes) {
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
          if (verifyOnly) {
            console.log(
              `load-streets · would file ${rows} street lines for area ${bbox.west},${bbox.south},${bbox.east},${bbox.north} (${waysRead} highway ways read) — golden homes OK (verify-only: nothing filed)`,
            );
            continue;
          }
          await fileStreetsScopedStream(pool, extracts, bbox, sourceDate ?? retrievedOn);
          console.log(
            `load-streets · ${rows} street lines filed for area ${bbox.west},${bbox.south},${bbox.east},${bbox.north} (${waysRead} highway ways read) — golden homes OK`,
          );
        }
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
    // and still gate the swap: the stage is scratch by
    // design (the next run's start resets it), so a
    // refused country leaves staged rows that never
    // serve — the live table changes only at the swap.
    const pool = verifyOnly ? null : new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      if (pool) await resetStreetStage(pool);
      let totalStaged = 0;
      for (const ex of extracts) {
        const candidates = goldenCandidates();
        let batch = [];
        const flush = async () => {
          if (batch.length === 0) return;
          if (pool) await stageStreets(pool, batch, ex.dataDate ?? retrievedOn);
          batch = [];
        };
        const part = await streamCutRows(ex.ndjsonPath, async (row) => {
          candidates.take(row);
          batch.push(row);
          if (batch.length >= STREAM_BATCH) await flush();
        });
        await flush();
        if (part.rowsFiled < EXTRACT_FLOORS[ex.country])
          throw new Error(
            `${ex.country}: staged ${part.rowsFiled} street lines but the floor is ${EXTRACT_FLOORS[ex.country]} — the read does not reconcile`,
          );
        if (ex.country === "england") {
          const golden = goldenChecks(candidates.rows, () => true);
          if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);
        }
        console.log(
          `load-streets · ${ex.country}: ${part.waysRead} highway ways read, ${part.rowsFiled} street lines staged`,
        );
        totalStaged += part.rowsFiled;
      }
      if (verifyOnly) {
        console.log(
          `load-streets · would file ${totalStaged} street lines (${extracts.map((e) => e.country).join(" + ")}) — golden homes OK (verify-only: nothing filed)`,
        );
        return;
      }
      const filed = await swapStagedStreets(pool);
      console.log(
        `load-streets · ${filed} street lines filed (${extracts.map((e) => e.country).join(" + ")}) — golden homes OK`,
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
