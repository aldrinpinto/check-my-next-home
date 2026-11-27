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
//
// BUG-195 (streaming conversion): the GeoPackage read
// iterates its two tables row by row (the flood-defences
// shape) instead of materialising both .all() sets and the
// whole filing-row array; the golden judgement runs as a
// tally over the stream (createGoldenTally replays its
// candidate rows through the unchanged check body), and a
// filing run stages each row into the swap transaction as
// it is built. The swap stays atomic — greenspace_points
// is replaced whole, so a mid-run failure rolls everything
// back and a re-run files the edition whole. The read's
// one dataset-sized structure is the kept-site name map
// (site id → name, filed functions only): access points
// file under their site's name, so the map is the join.

import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { rename, rm } from "node:fs/promises";
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
import { createLoaderResume } from "./loader-resume.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

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

// Read the GeoPackage at gpkgPath as a stream of filing
// rows (BUG-195, the flood-defences shape): the two tables
// are iterated row by row (statement.iterate(), never
// .all()), each filing row is yielded as it is built, and
// the read counts the run log and the T2/T3 tests
// reconcile are the generator's return value. Pure
// file→rows (no network, no database), so the fixture run
// and the live run take the identical path. The one
// dataset-sized structure the read holds is the kept-site
// name map (site id → name for the filed functions only):
// access points file under their site's name, so the map
// is the join — keys and short names, never geometry.
export function* iterateGreenspaceFile(gpkgPath, sourceDate) {
  const db = new DatabaseSync(gpkgPath, { readOnly: true });
  try {
    const keptSiteNames = new Map();
    const functionCounts = {};
    let sitesRead = 0;
    let centresDropped = 0;
    const siteStatement = db.prepare(
      "SELECT id, function AS fn, distinctive_name_1, distinctive_name_2, distinctive_name_3, distinctive_name_4, geometry FROM greenspace_site",
    );
    for (const site of siteStatement.iterate()) {
      sitesRead += 1;
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
      yield {
        osmId: null,
        name,
        pointRole: "centre",
        lat,
        lon,
        sourceName: SOURCE_NAME,
        sourceDate,
        fn: site.fn,
      };
    }
    let accessRead = 0;
    let accessFiled = 0;
    let accessSkipped = 0;
    const accessStatement = db.prepare(
      "SELECT id, ref_to_greenspace_site, geometry FROM access_point",
    );
    for (const access of accessStatement.iterate()) {
      accessRead += 1;
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
      accessFiled++;
      yield {
        osmId: null,
        name: keptSiteNames.get(access.ref_to_greenspace_site),
        pointRole: "access",
        lat,
        lon,
        sourceName: SOURCE_NAME,
        sourceDate,
        fn: null,
      };
    }
    return {
      sitesRead,
      accessRead,
      functionCounts,
      centresDropped,
      accessFiled,
      accessSkipped,
    };
  } finally {
    db.close();
  }
}

// The collecting form over the iterated read: the whole
// file's rows in one array — the shape this step was built
// with, kept for small inputs and tests. The filing run
// streams.
export function readGreenspaceFile(gpkgPath, sourceDate) {
  const rows = [];
  const iterator = iterateGreenspaceFile(gpkgPath, sourceDate);
  let step;
  while (!(step = iterator.next()).done) rows.push(step.value);
  return { rows, ...step.value };
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
function goldenFailures(rows, functionCounts, { full }) {
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

// The golden checks over a whole read set — the shape this
// step was built with, kept for small inputs and tests.
export function goldenChecks(rows, functionCounts, opts) {
  return goldenFailures(rows, functionCounts, opts);
}

// The golden checks' streaming form (BUG-195): the filing
// run never holds the read set, so the judgement reduces
// to the nearest candidates and presence flags. offer()
// takes each row as it streams past; failures() replays
// exactly those candidate rows through the same check body
// above — every candidate is a real filed row, and each
// check's winner is the minimum over the whole set, which
// the candidate set always contains, so the verdicts are
// the collecting form's verdicts.
export function createGoldenTally() {
  let ctrgBest = null;
  let ppgBest = null;
  let keirHardieRow = null;
  let nearestNamedBirkdale = null;
  let nearestNamedCardiff = null;
  let accessCount = 0;
  let sawCtrgAccess = false;
  const consider = (best, row, home) => {
    const d = haversineMiles(home.lat, home.lon, row.lat, row.lon);
    return best === null || d < best.d ? { row, d } : best;
  };
  return {
    offer(row) {
      if (row.pointRole === "access") {
        accessCount += 1;
        if (row.name === "Canning Town Recreation Ground") sawCtrgAccess = true;
        return;
      }
      if (row.name === "Keir Hardie Park" && keirHardieRow === null) keirHardieRow = row;
      if (row.name === "Canning Town Recreation Ground")
        ctrgBest = consider(ctrgBest, row, HOMES.exeter);
      if (row.name !== null && row.fn === "Public Park Or Garden")
        ppgBest = consider(ppgBest, row, HOMES.exeter);
      if (row.name !== null) {
        nearestNamedBirkdale = consider(nearestNamedBirkdale, row, HOMES.birkdale);
        nearestNamedCardiff = consider(nearestNamedCardiff, row, HOMES.cardiff);
      }
    },
    failures(functionCounts, opts) {
      const rows = [];
      if (ctrgBest) rows.push(ctrgBest.row);
      if (ppgBest) rows.push(ppgBest.row);
      if (keirHardieRow) rows.push(keirHardieRow);
      if (nearestNamedBirkdale) rows.push(nearestNamedBirkdale.row);
      if (nearestNamedCardiff) rows.push(nearestNamedCardiff.row);
      if (accessCount > 0)
        rows.push({ osmId: null, name: null, pointRole: "access", lat: 0, lon: 0, fn: null });
      if (sawCtrgAccess)
        rows.push({
          osmId: null,
          name: "Canning Town Recreation Ground",
          pointRole: "access",
          lat: 0,
          lon: 0,
          fn: null,
        });
      return goldenFailures(rows, functionCounts, opts);
    },
  };
}

// Stage-table swap — the house pattern (see load-osm-places),
// in its streaming form (BUG-195), with resume support
// (BUG-368): the stage table is PERSISTENT now (migration
// 0048) and one loader_checkpoint row records the last
// fully staged 500-row flush, so a killed run re-iterates
// the GeoPackage from scratch and skips the first N yielded
// rows instead of re-staging them. The swap stays atomic —
// greenspace_points is replaced whole, in its own
// transaction — so a mid-run failure leaves the last good
// data serving and a re-run files the edition whole. The
// edition is the product version + md5 (the T2 oracle):
// the source date is stable per edition, so a resume works
// across days. The read's one dataset-sized structure is
// the kept-site name map, rebuilt by the generator itself
// on a resumed run.
export async function createGreenspaceFiler(
  pool,
  retrievedAt,
  { progress = null, edition = null, restart = false } = {},
) {
  const client = await pool.connect();
  const resume = createLoaderResume(client, {
    loader: "load-os-greenspace",
    stageTable: "greenspace_stage",
    progress,
    restart,
  });
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS greenspace_stage (
         osm_id bigint, name text, point_role text,
         latitude double precision, longitude double precision,
         source_name text, source_date date,
         seq bigint NOT NULL, UNIQUE (seq)
       )`,
    );
  } catch (err) {
    client.release();
    throw err;
  }
  // The edition is the product version + md5, passed by the
  // caller; without one (a hand-run through fileGreenspace)
  // the retrieval timestamp stands in, so a same-day
  // re-run resumes and a later run starts fresh.
  const filerEdition = edition ?? retrievedAt;
  const prep = await resume.prepare({ edition: filerEdition, expected: null });
  // BUG-265: the stage flushes are the filing's long phase.
  // No total exists at filer creation — the read's row count
  // is only known when the read ends — so the tally counts
  // flushes without a percentage, and the heartbeat counts
  // staged rows.
  const stageTally = progress?.tally({ label: "stage", every: 50, unit: "flushes" });
  const stageWatch = createBatchWatch();
  let flushCount = 0;
  let stagedRows = prep.resumed ? prep.checkpoint.filed_count : 0;
  const values = [];
  const params = [];
  const flush = async () => {
    if (values.length === 0) return;
    const started = Date.now();
    const flushedRows = values.length;
    await client.query(
      `INSERT INTO greenspace_stage (osm_id, name, point_role, latitude, longitude, source_name, source_date, seq) VALUES ${values.join(", ")}`,
      params,
    );
    values.length = 0;
    params.length = 0;
    stagedRows += flushedRows;
    flushCount += 1;
    // One BUG-204 line per committed flush, never per row.
    await resume.checkpoint({
      edition: filerEdition,
      expected: null,
      nextStartIndex: stagedRows,
      read: stagedRows,
      filed: stagedRows,
      unit: "rows",
    });
    const { tookMs, averageMs, slow } = stageWatch.observe(Date.now() - started);
    stageTally?.tick(flushCount);
    progress?.heartbeat({ stage: "stage", done: stagedRows, every: 50_000 });
    if (slow) {
      progress?.warning({
        what: "stage flush duration",
        value: `flush ${flushCount} took ${formatDuration(tookMs)}`,
        threshold: `3x recent average ${formatDuration(averageMs)}`,
      });
    }
  };
  return {
    // Rows already staged by a previous run: the caller
    // skips the first this many yielded rows.
    startOffset: prep.resumed ? prep.checkpoint.next_start_index : 0,
    resumeNote: () => resume.resumeNote(),
    stagedCount: () => stagedRows,
    async stageRows(rows) {
      for (const row of rows) {
        const base = params.length;
        values.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`,
        );
        params.push(
          row.osmId,
          row.name,
          row.pointRole,
          row.lat,
          row.lon,
          row.sourceName,
          row.sourceDate,
          resume.takeSeq(1),
        );
        if (values.length >= 500) await flush();
      }
    },
    async finishFiling() {
      stageTally?.finish(flushCount);
      await flush();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM greenspace_points");
        // The live table's position columns are latitude/longitude
        // (migration 0001) — this INSERT originally named them
        // lat/lon, the row objects' property names: the same
        // defect CI run 99 exposed in the places filer's INSERT
        // ("column lat of relation osm_points does not exist").
        // This filer's own copy of the error never reached the
        // log — the runner's one-line summary showed Node 22's
        // node:sqlite ExperimentalWarning instead (runs 98–99) —
        // but the DDL cross-check finds it here without needing
        // the log, and the schema-contract tests now pin it.
        await client.query(
          `INSERT INTO greenspace_points (osm_id, name, point_role, latitude, longitude, source_name, source_date, loaded_at)
           SELECT osm_id, name, point_role, latitude, longitude, source_name, source_date, $1 FROM greenspace_stage`,
          [retrievedAt],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
        throw err;
      }
      // The run is complete: staging + checkpoint go
      // together, so nothing is left behind for the next
      // edition. The clear runs on this client, before it
      // is released — it opens its own transaction. A
      // failed swap never reaches here, so its staging
      // stays as the next run's resume point.
      await resume.clear();
      client.release();
    },
    async abortFiling() {
      // No transaction is open during staging, so there is
      // nothing to roll back: the staging + checkpoint STAY
      // as the next run's resume point.
      client.release();
    },
  };
}

// The collecting form over the streaming filer: the whole
// row set staged, then the swap — the shape this step was
// built with, kept for small inputs and tests. On any
// failure the transaction rolls back and the client is
// released, exactly as the one-shot filer did.
/**
 * @param {any} pool
 * @param {any[]} rows
 * @param {string} retrievedAt
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, edition?: string | null, restart?: boolean }} [options]
 */
export async function fileGreenspace(
  pool,
  rows,
  retrievedAt,
  { progress = null, edition = null, restart = false } = {},
) {
  // BUG-265: stage marker and closing count around the
  // streaming filer (whose own flush tally covers the long
  // phase); the failure line names the staged count.
  progress?.stage(`filing ${formatCount(rows.length)} greenspace points...`);
  const filer = await createGreenspaceFiler(pool, retrievedAt, { progress, edition, restart });
  try {
    // BUG-368: a resumed run stages only the rows past the
    // checkpoint — the earlier rows are already staged.
    await filer.stageRows(rows.slice(filer.startOffset));
    progress?.count({ label: "file", done: rows.length, total: rows.length, unit: "points" });
    await filer.finishFiling();
  } catch (err) {
    progress?.failed({
      stage: "file",
      filed: filer.stagedCount(),
      total: rows.length,
      error: err,
      resume: filer.resumeNote(),
    });
    await filer.abortFiling();
    throw err;
  }
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_FIXTURE_DIR = fileURLToPath(
  new URL("../../tests/fixtures/os-greenspace/", import.meta.url),
);

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
// BUG-385: a transient fetch failure is retried for up to 30
// minutes (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
// 2026) — the same retry the flood loaders got in BUG-384.
// Past the budget the original error fails the run and it
// waits. The delay caps at the last schedule entry; a test
// may pass delaysMs: [] for instant retries. Non-transient
// failures throw at once (see isTransientFetchError).
async function fetchResponse(
  url,
  what,
  { delaysMs = RETRY_DELAYS_MS, onRetry = null, retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS } = {},
) {
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const response = await fetch(url);
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

export async function fetchJson(url, what, opts) {
  // The body read stays outside the retry boundary, so a
  // parse failure fails fast instead of re-requesting.
  return (await fetchResponse(url, what, opts)).json();
}

// The GeoPackage download, retried whole from scratch: the
// fetch AND the body stream sit inside the retry boundary,
// because a network cut mid-download (a 59 MB single-shot
// download through a proxy does get cut — seen live
// 13 Nov 2026) must restart the file, never resume a
// partial one. Each attempt writes a FRESH temp file next
// to the destination; a failed attempt's partial file is
// discarded, and only a complete download is renamed into
// place — the md5 below remains the only acceptance test.
export async function downloadGreenspaceFile(
  url,
  destPath,
  { delaysMs = RETRY_DELAYS_MS, onRetry = null, retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS } = {},
) {
  const what = "the OS Greenspace GeoPackage download";
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const attemptPath = `${destPath}.attempt-${attempt}`;
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) {
        const error = new Error(`Greenspace download returned HTTP ${res.status}`);
        error.status = res.status;
        throw error;
      }
      await pipeline(Readable.fromWeb(res.body), createWriteStream(attemptPath));
      await rename(attemptPath, destPath);
      return destPath;
    } catch (error) {
      await rm(attemptPath, { force: true }).catch(() => {});
      if (!isTransientFetchError(error)) throw error;
      if (Date.now() - startedAt >= retryBudgetMs) throw error;
      const delay =
        delaysMs.length === 0 ? 0 : delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      onRetry?.(error, attempt, delay, what);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
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
  // BUG-368: resume from the last checkpointed flush instead
  // of restarting; with no checkpoint this is a fresh start.
  const restart = args.includes("--restart");
  const retrievedOn = todayDate();
  // BUG-265: one logger for the download, the read and the
  // swap; the read's row total is unknown up front (the
  // listing publishes bytes, not rows), so its tally counts
  // without a percentage.
  const progress = createProgressLogger({ name: "load-os-greenspace" });
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
      // BUG-385: the download retries whole from scratch for
      // up to 30 minutes (downloadGreenspaceFile) — a cut
      // mid-download restarts the file, never resumes a
      // partial one.
      progress.stage(`downloading the OS Open Greenspace ${version} GeoPackage...`);
      await downloadGreenspaceFile(entry.url, zipPath);
      progress.stage("verifying the download against the listing's md5...");
      const actual = await md5OfFile(zipPath);
      if (actual !== md5)
        throw new Error(
          `downloaded Greenspace file hashes to ${actual} but the listing publishes ${md5} — refusing to file an unverified download`,
        );
      gpkgPath = join(workDir, "opgrsp_gb.gpkg");
      await unzipFirstEntry(zipPath, gpkgPath);
    }

    // The read streams (BUG-195): each row passes the
    // golden tally and, on a filing run, stages into the
    // swap transaction as it is built — the read set is
    // never held. A golden failure aborts the filing:
    // nothing files, exactly as when the checks ran ahead
    // of the one-shot filer.
    const tally = createGoldenTally();
    let centres = 0;
    let filedRows = 0;
    let read;
    let pool = null;
    let filer = null;
    // BUG-265: the GeoPackage read is the run's long phase —
    // a line every 25,000 rows, a heartbeat every 100,000.
    const readTally = progress.tally({ label: "read", every: 25_000, unit: "rows" });
    try {
      if (!verifyOnly) {
        pool = new Pool({ connectionString: process.env.DATABASE_URL });
        // BUG-368: the edition is the product version + md5
        // (the T2 oracle) — the filer resumes from the last
        // checkpointed flush when a previous run died.
        filer = await createGreenspaceFiler(pool, `${retrievedOn}T00:00:00Z`, {
          progress,
          edition: `${version}:${md5}`,
          restart,
        });
      }
      progress.stage("reading the GeoPackage...");
      const iterator = iterateGreenspaceFile(gpkgPath, versionDate(version));
      try {
        let step;
        while (!(step = iterator.next()).done) {
          const row = step.value;
          // The golden tally offers EVERY row, including
          // ones a resumed run skips staging: the checks
          // judge the whole read, not the resumed tail.
          tally.offer(row);
          if (row.pointRole === "centre") centres += 1;
          filedRows += 1;
          readTally.tick(filedRows);
          progress.heartbeat({ stage: "read", done: filedRows, every: 100_000 });
          if (filer && filedRows > filer.startOffset) await filer.stageRows([row]);
        }
        read = step.value;
      } finally {
        iterator.return();
      }
      readTally.finish(filedRows);
      const golden = tally.failures(read.functionCounts, { full });
      if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);
    } catch (err) {
      progress.failed({
        stage: "read",
        filed: filedRows,
        error: err,
        resume: filer ? filer.resumeNote() : "the start (nothing staged yet)",
      });
      if (filer) await filer.abortFiling();
      if (pool) await pool.end().catch(() => {});
      throw err;
    }
    const mix = FILED_FUNCTIONS.map((f) => `${f} ${formatCount(read.functionCounts[f] ?? 0)}`).join(
      " · ",
    );
    if (verifyOnly) {
      console.log(
        `load-os-greenspace · read ${formatCount(read.sitesRead)} sites and ${formatCount(read.accessRead)} access points — would file ${formatCount(filedRows)} points (${formatCount(centres)} centres · ${formatCount(read.accessFiled)} access; ${mix}; version ${version} · md5 ${md5}) — golden homes OK (verify-only: nothing filed)`,
      );
      return;
    }
    progress.stage(
      `swap started — filing ${formatCount(filedRows)} staged points into greenspace_points`,
    );
    await filer.finishFiling();
    await pool.end();
    console.log(
      `load-os-greenspace · ${formatCount(filedRows)} points filed (${formatCount(centres)} centres · ${formatCount(read.accessFiled)} access; ${mix}; version ${version} · md5 ${md5}) — golden homes OK`,
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
