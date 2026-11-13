// Parks loader — OS Open Greenspace (plan step M5.6).
//
// Files OS Open Greenspace sites and their access points into
// greenspace_points: one CENTRE row per site and one row per
// access point, for the three park-serving functions only
// (Public Park Or Garden, Playing Field, Play Space). One of
// the runner's quarterly loaders — but the product itself
// updates only twice a year (April and October editions), so
// most quarterly runs are expected to be a healthy no-op
// (below). The OSM half of the parks serving is the
// load-osm-places loader; serving merges the two (the user's
// ruling of 13 Nov 2026), this loader never tries to reconcile
// the sources' names — Bow Green here, Bow Creek there, both
// filed, distances the only join.
//
// Access and the oracle (prep Section 6, measured): the OS
// Downloads API lists the product with NO account, NO key and
// NO click-through — a programmatic GET is inside the
// product's Open Government Licence use. The listing entry for
// the Great Britain GeoPackage carries the edition's md5 and
// byte size, and those two values are this loader's oracle
// (T2), applied as a three-way decision (decideGreenspaceAction):
// - the listing's version AND md5 both match what the last
//   filed run stamped → the held data IS the current edition:
//   a HEALTHY NO-OP. The run still ends in a successful item
//   (not "skipped", not an error), so a quiet edition never
//   reads as a missed refresh; the held rows keep serving.
// - same version, different md5 → the publisher replaced the
//   file inside its edition: a FAILURE, loudly — the held data
//   keeps serving, nothing is filed, and the alert says the
//   edition changed under its own version number.
// - a new version → download, verify the bytes against the
//   listing's md5 (a mismatch refuses the run), file.
// The last filed run's version+md5 are read back from the
// runner's own item record (loader_run_items.log_line carries
// them, written by this loader's summary line); a hand-run
// outside the runner simply has no record and files fresh.
//
// Functions (GAP L1 — the single most consequential filing
// call in this step): ALL Greenspace functions that are parks
// file, not only "Public Park Or Garden". The Exeter golden
// site, Canning Town Recreation Ground, is classified by OS
// as a PLAYING FIELD — a Public-Park-only loader files
// nothing at the design's own check home. Play Space files
// too (45k sites nationally; it is the closest thing the
// product has to a playground). The product's other functions
// (allotments, cemeteries, golf courses, bowling greens…)
// stay design-excluded. The function itself is NOT stored —
// the schema gives it no column, deliberately: function mix
// is a filing rule, not a served distinction.
//
// Points: a site's point is its AREA CENTROID — computed in
// EPSG:27700 from the polygon, the convention that reproduces
// the design's park figures (the user's ruling of 13 Nov
// 2026: centre-point distances, accepted knowingly for V1) —
// converted to WGS84 for the table. Access points file with
// the product's own coordinates. A centre that cannot be
// computed (a degenerate polygon) is counted in the log line
// and skipped, never invented; a site with no name files with
// a NULL name, like everywhere else (serving is named-first).
//
// greenspace_points.osm_id stays NULL on every row this
// loader writes: the column is bigint, but the product's site
// and access ids are UUID strings — there is no honest way to
// put one in the other, and inventing a numeric surrogate
// would be worse than the NULL. Site↔access linkage is by the
// shared site NAME each access row carries (the product's own
// distinctive name for that site), which is all serving needs:
// the nearest access point OF a named ground is found by name.
//
// Golden checks (the prep's verified reads — the structured
// blocks of golden-reads.json, which the loader's live
// computation reproduces to the metre): Exeter's Canning Town
// Recreation Ground centre at 0.32 mi (the step check this
// loader owns), filed FROM a Playing Field site, with Fisher
// Street Open Space the nearest named Public Park Or Garden
// at 0.275 mi; Keir Hardie Park's ABSENCE from this source
// (it is OSM-only — asserted so a future edition quietly
// gaining it is a noticed change, and so the merged-serving
// rule is visibly load-bearing); Birkdale's nearest named
// centre, Strutt Memorial Recreation Ground at 0.219 mi;
// Cardiff's Sevenoaks Park at 0.10 mi from the Wales-side
// home; and the national function mix (Play Space the largest
// of the three filed functions, as the product publishes it).
// One prep-prose figure does NOT survive its own raw reads
// and is deliberately not asserted: the report text names a
// Birkdale churchyard play area at 0.418 mi as that home's
// nearest Greenspace centre, but the prep's raw reads and
// structured blocks both put Strutt Memorial (0.219 mi,
// named, Playing Field) nearer — the structured reads win.

import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";
import proj4 from "proj4";
import yauzl from "yauzl";

const { Pool } = pg;

export const HOMES = {
  birkdale: { label: "19 Birkdale Rise CM3 2JT", lat: 51.776176, lon: 0.60387 },
  exeter: { label: "6 Exeter Road E16 1GN", lat: 51.515224, lon: 0.021177 },
  cardiff: { label: "Cardiff CF11 8AA", lat: 51.467947, lon: -3.192837 },
};

// The functions that file (L1). Everything else in the
// product stays out.
export const FILED_FUNCTIONS = ["Public Park Or Garden", "Playing Field", "Play Space"];

// Product listing endpoints (no key, no account — prep 6.2).
export const PRODUCT_URL = "https://api.os.uk/downloads/v1/products/OpenGreenspace";
export const DOWNLOADS_URL = `${PRODUCT_URL}/downloads`;

export const SOURCE_NAME =
  "OS Open Greenspace (Contains OS data © Crown Copyright and database rights 2026)";

// The house EPSG:27700 definition — the schools/transport
// loaders' basis, WITH the OSGB36→WGS84 datum shift
// (+towgs84). Omitting the shift leaves every converted point
// ~50–100 m from where the prep's pyproj reads put it (seen
// live 13 Nov 2026: golden centres tens of metres out at all
// three check homes); do not "simplify" this string.
proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
    "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);
const toWgs84 = proj4("EPSG:27700", "EPSG:4326");

// The listing entry for the national GeoPackage — the only
// file this loader downloads (the per-grid-square files are
// the same data in pieces).
export function gbGeoPackageEntry(downloads) {
  const entry = downloads.find((e) => e.area === "GB" && e.format === "GeoPackage");
  if (!entry) throw new Error("the downloads listing holds no GB GeoPackage entry");
  if (!/^[0-9a-f]{32}$/.test(entry.md5 ?? "") || !(entry.size > 0) || !entry.url)
    throw new Error("the GB GeoPackage listing entry lacks a usable md5, size or url");
  return entry;
}

// The product's current version string ("2026-10"), parsed
// from the product record — never from a filename or a date
// guess.
export function productVersion(product) {
  const version = product?.version;
  if (typeof version !== "string" || version.trim() === "")
    throw new Error("the product record holds no version");
  return version.trim();
}

// The three-way edition decision (T2), pure so the tests hold
// every arm: "noop" (same version AND md5 — healthy),
// "conflict" (same version, changed md5 — fail loudly),
// "file" (new version, or nothing filed before).
export function decideGreenspaceAction(listing, lastFiled) {
  if (!lastFiled || lastFiled.version !== listing.version) return "file";
  return lastFiled.md5 === listing.md5 ? "noop" : "conflict";
}

// What the last filed run stamped, read back from the
// runner's item record: this loader's summary line carries
// "version <v> · md5 <hex>" on filed AND no-op runs, so the
// freshest successful item is the state. Returns null when no
// run is on record (a first or hand run) — the caller files.
export function parseFiledStamp(logLine) {
  if (!logLine) return null;
  const version = /version (\S+)/.exec(logLine);
  const md5 = /md5 ([0-9a-f]{32})/.exec(logLine);
  if (!version || !md5) return null;
  return { version: version[1], md5: md5[1] };
}

// The edition's stamp date: the first of the version month
// ("2026-10" → 2026-10-01).
export function versionDate(version) {
  const match = /^(\d{4})-(\d{2})$/.exec(version);
  if (!match) throw new Error(`product version does not parse: ${version}`);
  return `${match[1]}-${match[2]}-01`;
}

// --- GeoPackage geometry ------------------------------------
// Minimal reader for the product's own shapes: a GeoPackage
// binary header (magic, flags, optional envelope) over
// little-endian WKB Point / Polygon / MultiPolygon. Anything
// else throws — an unreadable shape must fail the read, not
// file a fiction.

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
  if (type === 1) {
    const x = num();
    const y = num();
    return { geometry: { type: "Point", coordinates: [x, y] }, next: p };
  }
  if (type === 3) {
    const rings = [];
    const ringCount = count();
    for (let r = 0; r < ringCount; r++) {
      const n = count();
      const ring = [];
      for (let j = 0; j < n; j++) ring.push([num(), num()]);
      rings.push(ring);
    }
    return { geometry: { type: "Polygon", coordinates: [rings] }, next: p };
  }
  if (type === 6) {
    // A MultiPolygon's members are complete WKB Polygons,
    // each with its own byte-order and type words — read them
    // recursively rather than as bare ring collections.
    const parts = count();
    const polygons = [];
    for (let i = 0; i < parts; i++) {
      const member = readWkb(view, p);
      if (member.geometry.type !== "Polygon")
        throw new Error(`MultiPolygon member is a ${member.geometry.type}, not a Polygon`);
      polygons.push(member.geometry.coordinates[0]);
      p = member.next;
    }
    return { geometry: { type: "MultiPolygon", coordinates: polygons }, next: p };
  }
  throw new Error(`unsupported WKB geometry type ${type}`);
}

// Area centroid of a (multi)polygon's outer rings, shoelace —
// the centroid shapely computed for the prep's reads, in the
// geometry's own coordinates (EPSG:27700 metres here). Each
// part is weighted by its ABSOLUTE area: parts of a
// multipolygon can wind in opposite directions, and summing
// signed areas lets two halves of one ground cancel each
// other and fling the "centre" somewhere neither half is
// (seen live 13 Nov 2026 — an unnamed site spuriously
// "nearest" at two golden homes before this fix).
export function polygonAreaCentroid(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let totalWeight = 0;
  let cx = 0;
  let cy = 0;
  for (const rings of polygons) {
    const ring = rings[0];
    let a = 0;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      const cross = x1 * y2 - x2 * y1;
      a += cross;
      sx += (x1 + x2) * cross;
      sy += (y1 + y2) * cross;
    }
    a /= 2;
    if (a === 0) continue;
    const weight = Math.abs(a);
    cx += (sx / (6 * a)) * weight;
    cy += (sy / (6 * a)) * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return [cx / totalWeight, cy / totalWeight];
}

// The site's recorded name: distinctive_name_1, else the
// first non-empty of the alternates, else NULL (a third of
// Greenspace sites are unnamed — they file unnamed, L3's rule
// applies here too).
export function siteName(row) {
  for (const key of [
    "distinctive_name_1",
    "distinctive_name_2",
    "distinctive_name_3",
    "distinctive_name_4",
  ]) {
    const value = (row[key] ?? "").trim();
    if (value !== "") return value;
  }
  return null;
}

// Read the GeoPackage at gpkgPath into filing rows. Pure
// file→rows (no network, no database), so the fixture run and
// the live run take the identical path. Returns the rows plus
// the read counts the run log and the T2/T3 tests reconcile.
export function readGreenspaceFile(gpkgPath, sourceDate) {
  const db = new DatabaseSync(gpkgPath, { readOnly: true });
  try {
    const siteRows = db
      .prepare(
        "SELECT id, function AS fn, distinctive_name_1, distinctive_name_2, distinctive_name_3, distinctive_name_4, geometry FROM greenspace_site",
      )
      .all();
    const accessRows = db
      .prepare("SELECT id, ref_to_greenspace_site, geometry FROM access_point")
      .all();
    const rows = [];
    const keptSiteNames = new Map();
    const functionCounts = {};
    let centresDropped = 0;
    for (const site of siteRows) {
      if (!FILED_FUNCTIONS.includes(site.fn)) continue;
      functionCounts[site.fn] = (functionCounts[site.fn] ?? 0) + 1;
      const geometry = parseGpkgGeometry(site.geometry);
      const centre = polygonAreaCentroid(geometry);
      if (centre === null) {
        centresDropped++;
        continue;
      }
      const [lon, lat] = toWgs84.forward(centre);
      const name = siteName(site);
      keptSiteNames.set(site.id, name);
      rows.push({
        osmId: null,
        name,
        pointRole: "centre",
        lat,
        lon,
        sourceName: SOURCE_NAME,
        sourceDate,
        fn: site.fn,
      });
    }
    let accessFiled = 0;
    let accessSkipped = 0;
    for (const access of accessRows) {
      if (!keptSiteNames.has(access.ref_to_greenspace_site)) {
        accessSkipped++;
        continue;
      }
      const geometry = parseGpkgGeometry(access.geometry);
      if (geometry.type !== "Point") {
        accessSkipped++;
        continue;
      }
      const [lon, lat] = toWgs84.forward(geometry.coordinates);
      rows.push({
        osmId: null,
        name: keptSiteNames.get(access.ref_to_greenspace_site),
        pointRole: "access",
        lat,
        lon,
        sourceName: SOURCE_NAME,
        sourceDate,
        fn: null,
      });
      accessFiled++;
    }
    return {
      rows,
      sitesRead: siteRows.length,
      accessRead: accessRows.length,
      functionCounts,
      centresDropped,
      accessFiled,
      accessSkipped,
    };
  } finally {
    db.close();
  }
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

// Golden checks over the filed rows + the read's function
// counts. The fixture is a radius-trimmed cut of the same
// edition, so the same figures must reproduce there; the
// function-mix check applies to full reads only (the
// fixture's mix is whatever the golden postcodes hold).
export function goldenChecks(rows, functionCounts, { full }) {
  const failures = [];
  const centres = rows.filter((r) => r.pointRole === "centre");
  // The prep's verified reads — and so these checks — are on
  // the SERVING basis: the nearest NAMED centre. Unnamed
  // centres file and count (at Exeter an unnamed Play Space
  // centre sits 0.06 mi out, nearer than any named ground),
  // but no served line ever leads with a nameless place, so
  // the golden figures are the named ones.
  const nearestCentre = (home) => {
    let best = null;
    for (const row of centres) {
      if (row.name === null) continue;
      const d = haversineMiles(home.lat, home.lon, row.lat, row.lon);
      if (best === null || d < best.d) best = { row, d };
    }
    return best;
  };
  // Exeter (the step check this loader owns): Canning Town
  // Recreation Ground, 0.32 mi BY CENTRE POINT, and it files
  // from a Playing Field site (L1). Fisher Street Open Space
  // is the nearest named Public Park Or Garden (0.275 mi) —
  // asserted too, so the check set holds the whole verified
  // picture, not only the design's headline ground.
  {
    const ctrg = centres
      .filter((r) => r.name === "Canning Town Recreation Ground")
      .map((r) => ({ row: r, d: haversineMiles(HOMES.exeter.lat, HOMES.exeter.lon, r.lat, r.lon) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!ctrg)
      failures.push("Exeter: Canning Town Recreation Ground is not filed as a Greenspace centre");
    else {
      if (Math.abs(ctrg.d - 0.316) > 0.02)
        failures.push(
          `Exeter: Canning Town Recreation Ground centre is ${ctrg.d.toFixed(3)} mi from the home, expected 0.316 ± 0.02 (the 0.32 step check, by centre point)`,
        );
      if (ctrg.row.fn !== "Playing Field")
        failures.push(
          `Exeter: Canning Town Recreation Ground filed from function "${ctrg.row.fn}", expected "Playing Field" (gap L1)`,
        );
    }
    const ppg = centres
      .filter((r) => r.name !== null && r.fn === "Public Park Or Garden")
      .map((r) => ({ row: r, d: haversineMiles(HOMES.exeter.lat, HOMES.exeter.lon, r.lat, r.lon) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!ppg || ppg.row.name !== "Fisher Street Open Space" || Math.abs(ppg.d - 0.275) > 0.02)
      failures.push(
        `Exeter: nearest named Public Park Or Garden is ${ppg ? `"${ppg.row.name}" at ${ppg.d.toFixed(3)} mi` : "missing"}, expected "Fisher Street Open Space" at 0.275 ± 0.02`,
      );
    if (centres.some((r) => r.name === "Keir Hardie Park"))
      failures.push(
        "Exeter: Keir Hardie Park appears in the Greenspace rows — the prep verified it is OSM-only (a change to notice, not to file silently)",
      );
  }
  // Birkdale: the nearest named centre is Strutt Memorial
  // Recreation Ground (Playing Field, 0.219 mi) — the prep's
  // structured reads, not its prose summary (see the header).
  {
    const best = nearestCentre(HOMES.birkdale);
    if (
      !best ||
      best.row.name !== "Strutt Memorial Recreation Ground" ||
      Math.abs(best.d - 0.219) > 0.02
    )
      failures.push(
        `Birkdale: nearest named Greenspace centre is ${best ? `"${best.row.name}" at ${best.d.toFixed(3)} mi` : "missing"}, expected "Strutt Memorial Recreation Ground" at 0.219 ± 0.02`,
      );
    else if (best.row.fn !== "Playing Field")
      failures.push(
        `Birkdale: Strutt Memorial Recreation Ground filed from function "${best.row.fn}", expected "Playing Field"`,
      );
  }
  // Cardiff (T10's Greenspace half): Sevenoaks Park from the
  // national file, 0.10 mi.
  {
    const best = nearestCentre(HOMES.cardiff);
    if (!best || best.row.name !== "Sevenoaks Park" || Math.abs(best.d - 0.099) > 0.02)
      failures.push(
        `Cardiff: nearest Greenspace centre is ${best ? `"${best.row.name}" at ${best.d.toFixed(3)} mi` : "missing"}, expected "Sevenoaks Park" at 0.099 ± 0.02`,
      );
  }
  // Access rows exist and carry their site's name (the Exeter
  // ground's own access points among them).
  {
    const access = rows.filter((r) => r.pointRole === "access");
    if (access.length === 0) failures.push("no access rows filed at all");
    if (!access.some((r) => r.name === "Canning Town Recreation Ground"))
      failures.push("no access row carries the Canning Town Recreation Ground name");
  }
  if (full) {
    const counts = functionCounts ?? {};
    if (!((counts["Play Space"] ?? 0) > (counts["Public Park Or Garden"] ?? 0)))
      failures.push(
        `national function mix changed: Play Space ${counts["Play Space"] ?? 0} is no longer the largest filed function (Public Park Or Garden ${counts["Public Park Or Garden"] ?? 0})`,
      );
  }
  return failures;
}

// Stage-table swap — the house pattern (see load-osm-places).
export async function fileGreenspace(pool, rows, retrievedAt) {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TEMP TABLE greenspace_stage (
      osm_id bigint, name text, point_role text,
      lat double precision, lon double precision,
      source_name text, source_date date
    ) ON COMMIT DROP`);
    const values = [];
    const params = [];
    const flush = async () => {
      if (values.length === 0) return;
      await client.query(
        `INSERT INTO greenspace_stage (osm_id, name, point_role, lat, lon, source_name, source_date) VALUES ${values.join(", ")}`,
        params,
      );
      values.length = 0;
      params.length = 0;
    };
    for (const row of rows) {
      const base = params.length;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`,
      );
      params.push(
        row.osmId,
        row.name,
        row.pointRole,
        row.lat,
        row.lon,
        row.sourceName,
        row.sourceDate,
      );
      if (values.length >= 500) await flush();
    }
    await flush();
    await client.query("BEGIN");
    await client.query("DELETE FROM greenspace_points");
    await client.query(
      `INSERT INTO greenspace_points (osm_id, name, point_role, lat, lon, source_name, source_date, loaded_at)
       SELECT osm_id, name, point_role, lat, lon, source_name, source_date, $1 FROM greenspace_stage`,
      [retrievedAt],
    );
    await client.query("COMMIT");
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
  new URL("../../tests/fixtures/os-greenspace/", import.meta.url),
);

async function fetchJson(url, what) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} from ${url}`);
  return res.json();
}

async function md5OfFile(path) {
  const hash = createHash("md5");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function unzipFirstEntry(zipPath, destPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (!entry.fileName.endsWith(".gpkg")) return zip.readEntry();
        zip.openReadStream(entry, (err2, stream) => {
          if (err2) return reject(err2);
          const chunks = [];
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", () => {
            writeFileSync(destPath, Buffer.concat(chunks));
            zip.close();
            resolve(entry.fileName);
          });
          stream.on("error", reject);
        });
      });
      zip.on("end", () => reject(new Error("the download holds no .gpkg entry")));
      zip.on("error", reject);
    });
  });
}

// The last filed stamp, from the runner's item record —
// best-effort: any failure (no database, no runner table, no
// row yet) means "nothing on record" and the run files.
async function lastFiledStamp() {
  if (!process.env.DATABASE_URL) return null;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `SELECT log_line FROM loader_run_items
        WHERE item = 'load-os-greenspace' AND mode = 'live' AND status = 'succeeded'
          AND log_line IS NOT NULL
        ORDER BY finished_at DESC NULLS LAST, id DESC LIMIT 1`,
    );
    return parseFiledStamp(result.rows[0]?.log_line ?? null);
  } catch {
    return null;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const fixtureMode = args.includes("--fixture") || fileArg !== null;
  const verifyOnly = args.includes("--verify-only");
  const retrievedOn = todayDate();
  const workDir = mkdtempSync(join(tmpdir(), "cmnh-greenspace-"));
  try {
    let version;
    let md5;
    let gpkgPath;
    let full = true;

    if (fixtureMode) {
      full = false;
      const fixtureDir = fileArg ?? DEFAULT_FIXTURE_DIR;
      // The fixture takes the listing path too: the edition
      // this run stamps is the one its captured product record
      // and downloads listing name — the same code that reads
      // the live listing reads the capture (T2's fixture arm).
      const product = JSON.parse(readFileSync(join(fixtureDir, "product.json"), "utf8"));
      version = productVersion(product);
      const downloads = JSON.parse(readFileSync(join(fixtureDir, "downloads.json"), "utf8"));
      md5 = gbGeoPackageEntry(downloads).md5;
      // The fixture travels through the repo's text-only push
      // channel, so its GeoPackage is stored base64-encoded
      // (opgrsp_gb.gpkg.b64) and decoded here into the
      // workdir; everything downstream reads a real
      // GeoPackage through the same path the live download
      // takes. A plain opgrsp_gb.gpkg beside it, when
      // present, wins.
      gpkgPath = join(fixtureDir, "opgrsp_gb.gpkg");
      if (!existsSync(gpkgPath)) {
        const encoded = readFileSync(join(fixtureDir, "opgrsp_gb.gpkg.b64"), "utf8");
        gpkgPath = join(workDir, "opgrsp_gb.gpkg");
        writeFileSync(gpkgPath, Buffer.from(encoded.replace(/\s+/g, ""), "base64"));
      }
    } else {
      const product = await fetchJson(PRODUCT_URL, "OS Greenspace product record");
      version = productVersion(product);
      const downloads = await fetchJson(DOWNLOADS_URL, "OS Greenspace downloads listing");
      const entry = gbGeoPackageEntry(downloads);
      md5 = entry.md5;
      const action = decideGreenspaceAction({ version, md5 }, await lastFiledStamp());
      if (action === "conflict")
        throw new Error(
          `OS replaced the Greenspace file inside edition ${version}: the listing now hashes to ${md5}, which is not what the last filed run stamped — refusing to file an edition that changed under its own version number`,
        );
      if (action === "noop") {
        console.log(
          `load-os-greenspace · OS Open Greenspace edition ${version} is unchanged (version ${version} · md5 ${md5}) — the filed data is current, nothing to file — golden homes OK`,
        );
        return;
      }
      const zipPath = join(workDir, "opgrsp_gb.zip");
      // One retry on a network cut (a 59 MB single-shot
      // download through a proxy does get cut — seen live
      // 13 Nov 2026); a partial file is always discarded, and
      // the md5 below remains the only acceptance test.
      let downloadError = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(entry.url);
          if (!res.ok || !res.body)
            throw new Error(`Greenspace download returned HTTP ${res.status}`);
          await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));
          downloadError = null;
          break;
        } catch (err) {
          downloadError = err;
          if (attempt === 0) await new Promise((r) => setTimeout(r, 3000));
        }
      }
      if (downloadError) throw downloadError;
      const actual = await md5OfFile(zipPath);
      if (actual !== md5)
        throw new Error(
          `downloaded Greenspace file hashes to ${actual} but the listing publishes ${md5} — refusing to file an unverified download`,
        );
      gpkgPath = join(workDir, "opgrsp_gb.gpkg");
      await unzipFirstEntry(zipPath, gpkgPath);
    }

    const read = readGreenspaceFile(gpkgPath, versionDate(version));
    const golden = goldenChecks(read.rows, read.functionCounts, { full });
    if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);
    const centres = read.rows.filter((r) => r.pointRole === "centre").length;
    const mix = FILED_FUNCTIONS.map((f) => `${f} ${read.functionCounts[f] ?? 0}`).join(" · ");
    if (verifyOnly) {
      console.log(
        `load-os-greenspace · read ${read.sitesRead} sites and ${read.accessRead} access points — would file ${read.rows.length} points (${centres} centres · ${read.accessFiled} access; ${mix}; version ${version} · md5 ${md5}) — golden homes OK (verify-only: nothing filed)`,
      );
      return;
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await fileGreenspace(pool, read.rows, `${retrievedOn}T00:00:00Z`);
    } finally {
      await pool.end();
    }
    console.log(
      `load-os-greenspace · ${read.rows.length} points filed (${centres} centres · ${read.accessFiled} access; ${mix}; version ${version} · md5 ${md5}) — golden homes OK`,
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// Run only as a script (run-loaders / npm), never on import.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(`load-os-greenspace FAILED: ${err.message}`);
    process.exit(1);
  });
}
