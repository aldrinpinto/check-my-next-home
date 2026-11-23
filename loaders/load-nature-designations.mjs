// Nature designations loader (plan step M5.3). Files SSSI,
// SAC, SPA and Ramsar designations and the merged ancient
// woodland layer from Natural England's ArcGIS services,
// following the user-seat gap check of 12 Nov 2026:
//
//   npm run load:nature-designations
//   npm run load:nature-designations -- --verify-only
//   npm run load:nature-designations -- --file tests/fixtures/nature-designations
//
// What the gap check changed, and where it lives in this file:
//   - L1, ancient woodland is TWO inventories. The original
//     (compiled to a 2-hectare minimum) is explicitly "not
//     definitive"; the revised inventory republishes county by
//     county under Natural England's own precedence rule —
//     "where available this dataset takes precedence" — with
//     the rollout mid-flight (Surrey is not a completed county).
//     Reading either alone is wrong at the golden homes:
//     original-only puts Birkdale's nearest wood at 0.85 miles
//     (merged: 0.39) and revised-only finds 12 polygons within
//     5 miles of the Epsom flat where the original has 145.
//     This loader files ONE ancient_woodland layer per run —
//     revised polygons win where they intersect originals,
//     originals stand elsewhere — with `detail` recording which
//     inventory each polygon came from, and the log line
//     carrying both read counts plus the replaced count, so the
//     run record proves both services were read. The serving
//     rule that follows: the ancient-woodland absence answer is
//     "no ancient woodland recorded in the inventory", never
//     "there is no ancient woodland".
//   - L2, features are not sites. SAC files ~7 rows per site;
//     every log line here carries BOTH the feature count and
//     the distinct site count (by site code), asserted
//     separately — a rows-only count would inflate the European
//     layers several-fold and make the empty-result proof
//     meaningless.
//   - L3, "current" needs a status filter. 36 SAC features are
//     STATUS "Candidate" (6 sites) — not designations in law.
//     SAC files Designated only, SPA Classified, Ramsar Listed;
//     the rest are counted in the log line, never filed.
//   - L4, SSSI Units (28,305 condition-assessment polygons) are
//     never read, let alone filed: they would multiply every
//     SSSI ~7x and smuggle condition verdicts into a product
//     that prints no verdicts.
//   - L6, blank woodland names are normal data (the nearest
//     revised polygon to Birkdale is unnamed; all four nearest
//     originals to Epsom are). Names file exactly as published,
//     blank included — dropping them moves Birkdale's headline
//     from 0.39 to 0.84 miles.
//
// The four statutory layers are complete registers, so their
// "none found" answers hold at full strength; the empty-result
// proof is the same as M5.2's — per layer, features read ==
// features filed against the service's own count, recomputed in
// the same run, with the golden homes' answers asserted against
// the filed set.
//
// Ancient woodland has no site code — its polygons are the
// unit — so source_reference files the service's OBJECTID with
// an inventory prefix (AWI- / AWI-R-). Natural England publishes
// no per-row quality flag, so `quality` files NULL for every
// nature row rather than inventing one.
//
// Sources: Natural England ArcGIS feature services, Open
// Government Licence v3.0. Source dates are each service's own
// data-edit date from its layer metadata. Distances are to the
// nearest polygon edge on the longitude-scaled plane (miles =
// degrees of latitude x 69.05), the prep's basis.
//
// Transport, measured live on 12 Nov 2026: these services
// intermittently close connections mid-transfer ("other side
// closed"), and the odds rise with page size and transfer
// time — a 1,000-feature SSSI page is 56 MB and takes ~27
// seconds, the woodland services slow to 60–70 seconds per
// 2,000-polygon page at deep offsets, and one full read died
// three times before this design settled. So pages stay
// small (250–1,000 features, roughly 5–15 MB a page) and
// fetch with patient retries. Retries and page sizes change
// nothing about the data — the count oracle still has to
// reconcile exactly.
//
// BUG-195 (23 Nov 2026): the reads used to accumulate every
// service's features into one array, process them into a
// whole-layer item set, and then map the filed set into a
// second whole-dataset array of WKT rows before inserting
// anything — both woodland inventories' flat geometry
// (~30M vertices across the pair) held at once, plus the
// raw GeoJSON behind it. The reads now stream in the
// BUG-187 flood shape: each validated page is processed as
// it lands and handed to the staging inserter inside the
// one swap transaction, the golden checks run over the
// flood sift, and the counts are scalars. Two retentions
// are properties of the contracts, not of the read: the
// REVISED woodland inventory's items are the merge
// substrate (an original files only where no revised
// polygon intersects it — the L1 rule is judged in JS, so
// the revised set is held, in the flat storage this file
// already uses, while the originals stream past it), and
// the statutory layers' site-code sets (L2 counts sites,
// not rows — keys only, never rows). The sift window for
// this loader is 8 miles: its pinned golden distances run
// to 7.05 miles (the SPA / Ramsar nearests), beyond the
// flood loaders' 2-mile pins.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createGoldenSift } from "./flood-stream.mjs";

const NE_BASE = "https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services";
const ORGANISATION = "Natural England";

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};

const SERVICES = {
  sssi: {
    service: "SSSI_England",
    file: "sssi.geojson",
    constraintType: "sssi",
    label: "SSSI",
    sourceName: "Natural England — Sites of Special Scientific Interest (England)",
    fields: ["OBJECTID", "REF_CODE", "NAME", "MEASURE", "HYPERLINK"],
    nameField: "NAME",
    codeField: "REF_CODE",
    detailField: "HYPERLINK",
    keepStatus: null,
    pageCap: 250,
  },
  sac: {
    service: "Special_Areas_of_Conservation_England",
    file: "sac.geojson",
    constraintType: "sac",
    label: "SAC",
    sourceName: "Natural England — Special Areas of Conservation (England)",
    fields: ["OBJECTID", "SAC_NAME", "SAC_CODE", "SAC_AREA", "STATUS", "GIS_DATE", "VERSION"],
    nameField: "SAC_NAME",
    codeField: "SAC_CODE",
    statusField: "STATUS",
    keepStatus: "Designated",
    detailField: "STATUS",
  },
  spa: {
    service: "Special_Protection_Areas_England",
    file: "spa.geojson",
    constraintType: "spa",
    label: "SPA",
    sourceName: "Natural England — Special Protection Areas (England)",
    fields: ["OBJECTID", "SPA_NAME", "SPA_CODE", "SPA_AREA", "STATUS", "GIS_DATE", "VERSION"],
    nameField: "SPA_NAME",
    codeField: "SPA_CODE",
    statusField: "STATUS",
    keepStatus: "Classified",
    detailField: "STATUS",
  },
  ramsar: {
    service: "Ramsar_England",
    file: "ramsar.geojson",
    constraintType: "ramsar",
    label: "Ramsar",
    sourceName: "Natural England — Ramsar Sites (England)",
    fields: ["OBJECTID", "NAME", "CODE", "AREA", "STATUS", "GIS_DATE", "VERSION"],
    nameField: "NAME",
    codeField: "CODE",
    statusField: "STATUS",
    keepStatus: "Listed",
    detailField: "STATUS",
    pageCap: 250,
  },
  awi: {
    service: "Ancient_Woodland_England",
    file: "ancient-woodland.geojson",
    label: "ancient woodland (original inventory)",
    fields: ["OBJECTID", "NAME", "THEME", "THEMNAME", "STATUS", "AREA"],
    themeField: "THEMNAME",
    pageCap: 1000,
  },
  awiRev: {
    service: "Ancient_Woodland_Revised_England",
    file: "ancient-woodland-revised.geojson",
    label: "ancient woodland (revised inventory)",
    fields: ["OBJECTID", "NAME", "THEME", "THEMENAME", "STATUS", "AREA"],
    themeField: "THEMENAME",
    pageCap: 1000,
  },
};

// --- geometry (the house copies, on GeoJSON rings) ---------------

function geojsonPolygons(geometry) {
  if (!geometry) return null;
  const raw =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : null;
  if (!raw) throw new Error(`unsupported geometry type: ${geometry.type}`);
  for (const polygon of raw) {
    if (!Array.isArray(polygon) || polygon.length === 0)
      throw new Error("malformed geometry: empty polygon");
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4)
        throw new Error("malformed geometry: ring with fewer than 4 points");
      for (const pair of ring) {
        if (
          !Array.isArray(pair) ||
          pair.length < 2 ||
          !Number.isFinite(pair[0]) ||
          !Number.isFinite(pair[1])
        )
          throw new Error("malformed geometry: coordinate is not a finite pair");
      }
    }
  }
  // Rings are held FLAT — a Float64Array of x,y pairs — not as
  // arrays of [x, y] arrays. At national scale the two woodland
  // inventories carry ~30M vertices; pair arrays cost ~70+
  // bytes a vertex and the first live read died at the 2 GB
  // heap limit, while flat storage costs 16 bytes a vertex.
  // Every helper below indexes rings accordingly (point k is
  // ring[2k], ring[2k+1]).
  return raw.map((polygon) =>
    polygon.map((ring) => {
      const flat = new Float64Array(ring.length * 2);
      ring.forEach((pair, i) => {
        flat[2 * i] = pair[0];
        flat[2 * i + 1] = pair[1];
      });
      return flat;
    }),
  );
}

function bboxOf(polygons) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const polygon of polygons)
    for (const ring of polygon)
      for (let i = 0; i < ring.length; i += 2) {
        const x = ring[i];
        const y = ring[i + 1];
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  return [x0, y0, x1, y1];
}

function ringContains(ring, x, y) {
  let inside = false;
  const points = ring.length / 2;
  for (let i = 0, j = points - 1; i < points; j = i++) {
    const xi = ring[2 * i];
    const yi = ring[2 * i + 1];
    const xj = ring[2 * j];
    const yj = ring[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonsContain(polygons, lng, lat) {
  return polygons.some((polygon) => {
    let inside = false;
    for (const ring of polygon) if (ringContains(ring, lng, lat)) inside = !inside;
    return inside;
  });
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}

// Distance from a home to the nearest polygon EDGE, miles —
// zero when the point falls inside. Longitude is scaled by
// cos(latitude); miles are degrees of latitude x 69.05.
function geometryDistanceMiles(polygons, home) {
  if (polygonsContain(polygons, home.lng, home.lat)) return 0;
  const scaleX = Math.cos((home.lat * Math.PI) / 180);
  const px = home.lng * scaleX;
  const py = home.lat;
  let best = Infinity;
  for (const polygon of polygons)
    for (const ring of polygon) {
      const points = ring.length / 2;
      for (let i = 0, j = points - 1; i < points; j = i++) {
        const d = segmentDistance(
          px,
          py,
          ring[2 * j] * scaleX,
          ring[2 * j + 1],
          ring[2 * i] * scaleX,
          ring[2 * i + 1],
        );
        if (d < best) best = d;
      }
    }
  return best * 69.05;
}

// Nearest filed item to a home, with a bounding-box lower bound
// so the ~90k-polygon woodland layer stays cheap to scan: the
// bound is exact-plane, so a skipped polygon can never be the
// nearest.
function nearestEdge(filed, home) {
  const scaleX = Math.cos((home.lat * Math.PI) / 180);
  const px = home.lng * scaleX;
  const py = home.lat;
  let best = null;
  for (const item of filed) {
    if (best && item.bbox) {
      const [x0, y0, x1, y1] = item.bbox;
      const dx = px < x0 * scaleX ? x0 * scaleX - px : px > x1 * scaleX ? px - x1 * scaleX : 0;
      const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
      if (Math.sqrt(dx * dx + dy * dy) * 69.05 >= best.miles) continue;
    }
    const miles = geometryDistanceMiles(item.polygons, home);
    if (!best || miles < best.miles) best = { item, miles };
  }
  return best;
}

function orient(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}
function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  return o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0;
}
// True when two polygon sets touch or overlap: any boundary
// crossing, or either's first vertex inside the other.
function polygonsIntersect(A, B) {
  for (const pa of A) {
    for (const pb of B) {
      for (const ra of pa)
        for (const rb of pb) {
          const pointsA = ra.length / 2;
          const pointsB = rb.length / 2;
          for (let i = 0; i < pointsA - 1; i++)
            for (let j = 0; j < pointsB - 1; j++)
              if (
                segmentsCross(
                  ra[2 * i],
                  ra[2 * i + 1],
                  ra[2 * i + 2],
                  ra[2 * i + 3],
                  rb[2 * j],
                  rb[2 * j + 1],
                  rb[2 * j + 2],
                  rb[2 * j + 3],
                )
              )
                return true;
        }
    }
  }
  const bRing = B[0][0];
  const aRing = A[0][0];
  if (polygonsContain(A, bRing[0], bRing[1])) return true;
  if (polygonsContain(B, aRing[0], aRing[1])) return true;
  return false;
}

function polygonsToWkt(polygons) {
  const body = polygons
    .map((polygon) => {
      const rings = polygon.map((ring) => {
        const points = [];
        for (let i = 0; i < ring.length; i += 2) points.push(`${ring[i]} ${ring[i + 1]}`);
        return `(${points.join(",")})`;
      });
      return `(${rings.join(",")})`;
    })
    .join(",");
  return `MULTIPOLYGON(${body})`;
}

// --- fetching ------------------------------------------------------

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
async function fetchJson(url, what, attempts = RETRY_DELAYS_MS.length + 1) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${what}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    }
  }
  throw lastError;
}

// --- paging: the count is the contract -------------------------
//
// The same guard pattern as the priority habitats loader (the
// 13 Nov 2026 diagnosis, scratch-nature/PHI-DIAGNOSIS.md):
// ArcGIS reports query failures as an HTTP 200 body carrying
// an `error` member and no `features` member, so a page is
// validated INSIDE the retry boundary — an error envelope, a
// missing features array, a page of the wrong length, or a
// break in OBJECTID order fails the page, the SAME offset is
// re-requested, and after the last attempt the read fails
// loudly rather than ending early or improvising.

function serviceErrorText(body) {
  const error = body?.error;
  if (!error) return null;
  const parts = [
    error.code != null ? `code ${error.code}` : null,
    error.message ?? null,
    ...(Array.isArray(error.details) ? error.details : []),
  ].filter((part) => part !== null && part !== "");
  return parts.length > 0 ? parts.join(": ") : "unknown error";
}

function validateServicePage(page, { spec, want, lastObjectId, offset }) {
  const errorText = serviceErrorText(page);
  if (errorText)
    throw new Error(
      `the ${spec.service} service returned an error for the page at offset ${offset}: ${errorText}`,
    );
  if (!Array.isArray(page?.features))
    throw new Error(`the ${spec.service} page at offset ${offset} carries no features array`);
  if (page.features.length !== want)
    throw new Error(
      `the ${spec.service} page at offset ${offset} returned ${page.features.length} features — the count contract requires exactly ${want}`,
    );
  let previous = lastObjectId;
  for (const feature of page.features) {
    const objectId = feature?.properties?.OBJECTID;
    if (!Number.isFinite(objectId))
      throw new Error(
        `a feature on the ${spec.service} page at offset ${offset} carries no OBJECTID`,
      );
    if (previous !== null && objectId <= previous)
      throw new Error(
        `${spec.service} OBJECTID ordering broke at offset ${offset}: ${objectId} follows ${previous} — the read cannot be trusted`,
      );
    previous = objectId;
  }
  return previous;
}

async function fetchServicePage(
  layerUrl,
  spec,
  offset,
  expected,
  pageSize,
  lastObjectId,
  delaysMs = RETRY_DELAYS_MS,
) {
  const want = Math.min(pageSize, expected - offset);
  const q = new URLSearchParams({
    where: "1=1",
    outFields: spec.fields.join(","),
    returnGeometry: "true",
    outSR: "4326",
    resultOffset: String(offset),
    resultRecordCount: String(pageSize),
    orderByFields: "OBJECTID",
    f: "geojson",
  });
  let lastError = null;
  for (let attempt = 1; attempt <= delaysMs.length + 1; attempt++) {
    try {
      const response = await fetch(`${layerUrl}/query?${q}`);
      if (!response.ok) throw new Error(`HTTP ${response.status} for the ${spec.service} features`);
      const page = await response.json();
      validateServicePage(page, { spec, want, lastObjectId, offset });
      return page;
    } catch (error) {
      lastError = error;
      if (attempt <= delaysMs.length)
        await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt - 1]));
    }
  }
  throw lastError;
}

// One service, read as a stream (BUG-195): layer metadata
// (the contract and the data-edit stamp), the service's own
// count (the oracle the paged read must match), then every
// page in OBJECTID order handed to onFeatures (with the
// source date) as it lands — the page is released before
// the next is fetched, so the read never holds the service
// whole.
export async function readServiceLiveStream(
  spec,
  { delaysMs = RETRY_DELAYS_MS, onFeatures = null } = {},
) {
  const layerUrl = `${NE_BASE}/${spec.service}/FeatureServer/0`;
  const meta = await fetchJson(`${layerUrl}?f=json`, `the ${spec.service} layer metadata`);
  const metaFields = (meta.fields ?? []).map((f) => f.name);
  for (const field of spec.fields) {
    if (!metaFields.includes(field))
      throw new Error(`contract failure: the ${spec.service} layer no longer carries "${field}"`);
  }
  const editMs = meta.editingInfo?.dataLastEditDate;
  if (!editMs) throw new Error(`contract failure: ${spec.service} carries no data-edit date`);
  const sourceDate = new Date(editMs).toISOString().slice(0, 10);
  const pageSize = Math.min(meta.maxRecordCount ?? 2000, spec.pageCap ?? 2000);
  const countBody = await fetchJson(
    `${layerUrl}/query?where=1%3D1&returnCountOnly=true&f=json`,
    `the ${spec.service} count`,
  );
  const countError = serviceErrorText(countBody);
  if (countError) throw new Error(`the ${spec.service} count query failed: ${countError}`);
  const expected = countBody.count;
  if (!Number.isInteger(expected) || expected < 0)
    throw new Error(`contract failure: the ${spec.service} count response carries no count`);
  let read = 0;
  let offset = 0;
  let lastObjectId = null;
  while (offset < expected) {
    const page = await fetchServicePage(
      layerUrl,
      spec,
      offset,
      expected,
      pageSize,
      lastObjectId,
      delaysMs,
    );
    if (onFeatures) await onFeatures(page.features, sourceDate);
    lastObjectId = page.features[page.features.length - 1].properties.OBJECTID;
    offset += page.features.length;
    read += page.features.length;
  }
  if (read !== expected)
    throw new Error(`${spec.service}: read ${read} features but the service count is ${expected}`);
  return { sourceDate, expected };
}

// The collecting form over the streaming read: the whole
// service's features in one array — the shape this step
// was built with, kept for small inputs and tests. The
// filing run streams.
export async function readServiceLive(spec, { delaysMs = RETRY_DELAYS_MS } = {}) {
  const features = [];
  const { sourceDate, expected } = await readServiceLiveStream(spec, {
    delaysMs,
    onFeatures: async (batch) => {
      features.push(...batch);
    },
  });
  return { features, sourceDate, expected };
}

// A fixture file too large for one connector push is held as
// numbered parts (<stem>-1.geojson, <stem>-2.geojson, ...) whose
// feature arrays concatenate to the capture, in order. The
// parts stream (BUG-195): each is parsed, handed to
// onFeatures, and released before the next is read — the
// parts are never concatenated into one array.
async function streamFixtureFeatures(fixtureDir, fileName, onFeatures) {
  const stem = fileName.replace(/\.geojson$/, "");
  const entries = await readdir(fixtureDir);
  const partNames = entries
    .filter((name) => new RegExp(`^${stem}-\\d+\\.geojson$`).test(name))
    .sort();
  const names = entries.includes(fileName) ? [fileName] : partNames;
  if (names.length === 0) throw new Error(`contract failure: no fixture file for ${fileName}`);
  let count = 0;
  for (const name of names) {
    const body = JSON.parse(await readFile(join(fixtureDir, name), "utf8"));
    const features = body.features ?? [];
    count += features.length;
    if (onFeatures) await onFeatures(features);
  }
  return count;
}

export async function readServiceFixtureStream(spec, fixtureDir, captured, onFeatures) {
  let fieldChecked = false;
  const expected = await streamFixtureFeatures(fixtureDir, spec.file, async (features) => {
    if (!fieldChecked && features.length > 0) {
      fieldChecked = true;
      for (const field of spec.fields) {
        if (!(field in (features[0].properties ?? {})))
          throw new Error(
            `contract failure: the ${spec.file} fixture no longer carries "${field}"`,
          );
      }
    }
    if (onFeatures) await onFeatures(features, captured);
  });
  if (expected === 0) throw new Error(`contract failure: the ${spec.file} fixture has no features`);
  return { sourceDate: captured, expected };
}

// Features -> validated items, per batch (BUG-195): the
// read hands the processor one page (or one fixture part)
// at a time. Geometry-less features are counted, never
// filed; malformed geometry is counted across the whole
// read and judged at finish() — the same total, the same
// message, nothing filed.
export function createFeatureProcessor(label) {
  let geoless = 0;
  let invalid = 0;
  let read = 0;
  return {
    processBatch(raw) {
      read += raw.length;
      const items = [];
      for (const feature of raw) {
        let polygons = null;
        try {
          polygons = geojsonPolygons(feature.geometry);
        } catch {
          invalid += 1;
          continue;
        }
        if (polygons === null) {
          geoless += 1;
          continue;
        }
        const props = {};
        for (const [k, v] of Object.entries(feature.properties ?? {}))
          props[k] = typeof v === "string" ? v.trim() : v;
        items.push({ props, polygons, bbox: bboxOf(polygons) });
      }
      return items;
    },
    finish() {
      if (invalid > 0)
        throw new Error(
          `${label}: ${invalid} features carry geometry that does not parse — contract failure, nothing filed`,
        );
      return { read, geoless };
    },
  };
}

// The collecting form over the processor, kept for the
// shape this step was built with (small inputs and tests).
function processFeatures(raw, label) {
  const processor = createFeatureProcessor(label);
  const items = processor.processBatch(raw);
  const { geoless } = processor.finish();
  return { items, geoless };
}

// Statutory layers, per batch: the status filter is what
// "current" means (L3); sites are counted by site code,
// never by rows (L2) — the site set holds codes only.
export function createStatutoryProcessor(spec) {
  const processor = createFeatureProcessor(spec.label);
  let excluded = 0;
  let filedCount = 0;
  const sites = new Set();
  return {
    processBatch(raw) {
      const items = processor.processBatch(raw);
      const filed = [];
      for (const item of items) {
        if (spec.keepStatus && item.props[spec.statusField] !== spec.keepStatus) {
          excluded += 1;
          continue;
        }
        filedCount += 1;
        const code = item.props[spec.codeField];
        if (code !== "" && code != null) sites.add(code);
        filed.push(item);
      }
      return filed;
    },
    finish() {
      const { read, geoless } = processor.finish();
      return { read, geoless, excluded, filed: filedCount, sites: sites.size };
    },
  };
}

// The collecting form over the statutory processor: the
// whole raw set in, the whole filed set out.
function processStatutory(raw, spec) {
  const processor = createStatutoryProcessor(spec);
  const filedItems = processor.processBatch(raw);
  const totals = processor.finish();
  return {
    read: totals.read,
    geoless: totals.geoless,
    excluded: totals.excluded,
    filed: filedItems,
    sites: totals.sites,
  };
}

// The merged woodland layer (L1): revised polygons all file;
// an original files only where no revised polygon intersects
// it. Revised candidates are found through a grid over their
// bounding boxes, so the national merge stays cheap.
//
// The merger is the streaming form (BUG-195): it is built
// once over the revised items — the merge substrate, held
// for the whole originals pass — and each original is
// offered as it streams past: offer() returns the item to
// file (tagged with its inventory) or null when the
// revision replaces it, counting the replaced as it goes.
// mergeWoodland below is the collecting form over it, so
// the intersection judgement lives in exactly one place.
export function createWoodlandMerger(revItems) {
  const CELL = 0.05;
  const grid = new Map();
  const cellKeys = (bbox) => {
    const keys = [];
    for (let cx = Math.floor(bbox[0] / CELL); cx <= Math.floor(bbox[2] / CELL); cx += 1)
      for (let cy = Math.floor(bbox[1] / CELL); cy <= Math.floor(bbox[3] / CELL); cy += 1)
        keys.push(`${cx},${cy}`);
    return keys;
  };
  revItems.forEach((item, idx) => {
    for (const key of cellKeys(item.bbox)) {
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(idx);
    }
  });
  let replaced = 0;
  return {
    replaced: () => replaced,
    revisedFiled: revItems.map((item) => ({ ...item, inventory: "revised inventory" })),
    offer(item) {
      const candidates = new Set();
      for (const key of cellKeys(item.bbox))
        for (const idx of grid.get(key) ?? []) candidates.add(idx);
      const hit = [...candidates].some((idx) => {
        const other = revItems[idx];
        const b = other.bbox;
        if (
          item.bbox[0] > b[2] ||
          item.bbox[2] < b[0] ||
          item.bbox[1] > b[3] ||
          item.bbox[3] < b[1]
        )
          return false;
        return polygonsIntersect(item.polygons, other.polygons);
      });
      if (hit) {
        replaced += 1;
        return null;
      }
      return { ...item, inventory: "original inventory" };
    },
  };
}

export function mergeWoodland(origItems, revItems) {
  const merger = createWoodlandMerger(revItems);
  const filed = [...merger.revisedFiled];
  for (const item of origItems) {
    const kept = merger.offer(item);
    if (kept) filed.push(kept);
  }
  return { filed, replaced: merger.replaced() };
}

function checkGolden(layers) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  const { sssi, sac, spa, ramsar, awi } = layers;

  for (const [postcode, home] of Object.entries(HOMES)) {
    for (const [label, filed] of [
      ["SSSI", sssi.filed],
      ["SAC", sac.filed],
      ["SPA", spa.filed],
      ["Ramsar", ramsar.filed],
      ["ancient woodland", awi.filed],
    ]) {
      const inside = filed.filter((item) => polygonsContain(item.polygons, home.lng, home.lat));
      expect(
        inside.length === 0,
        `${postcode}: the point falls inside a ${label} — the golden reads say inside none`,
      );
    }
  }

  const expectNearest = (filed, postcode, nameField, name, miles, tolerance, label) => {
    const best = nearestEdge(filed, HOMES[postcode]);
    expect(
      best && best.item.props[nameField] === name && Math.abs(best.miles - miles) <= tolerance,
      `${postcode}: nearest ${label} should be ${name} at ${miles} mi, got ${
        best ? `${best.item.props[nameField]} at ${best.miles.toFixed(3)} mi` : "none"
      }`,
    );
    return best;
  };
  expectNearest(sssi.filed, "CM3 2JT", "NAME", "Woodham Walter Common SSSI", 2.88, 0.04, "SSSI");
  expectNearest(sssi.filed, "E16 1GN", "NAME", "Gilbert's Pit (Charlton) SSSI", 1.9, 0.04, "SSSI");
  expectNearest(sssi.filed, "KT17 1FH", "NAME", "Stones Road Pond SSSI", 0.67, 0.03, "SSSI");
  const commons = sssi.filed.find((item) => item.props.NAME === "Epsom and Ashtead Commons SSSI");
  expect(
    commons && Math.abs(geometryDistanceMiles(commons.polygons, HOMES["KT17 1FH"]) - 1.79) <= 0.03,
    "Epsom and Ashtead Commons SSSI should sit 1.79 mi from the Epsom flat",
  );
  expectNearest(sac.filed, "CM3 2JT", "SAC_NAME", "Essex Estuaries", 4.36, 0.04, "SAC");
  expectNearest(sac.filed, "E16 1GN", "SAC_NAME", "Epping Forest", 4.07, 0.04, "SAC");
  expectNearest(
    sac.filed,
    "KT17 1FH",
    "SAC_NAME",
    "Mole Gap to Reigate Escarpment",
    5.0,
    0.04,
    "SAC",
  );
  expect(
    sac.filed.every((item) => item.props.STATUS === "Designated"),
    "a non-designated SAC feature was filed — candidates must be excluded, never served (L3)",
  );

  // The stack, as one place with several designations: at
  // Birkdale the nearest SPA and Ramsar are the same named
  // ground at the same distance, filed as two designations.
  const spaBest = nearestEdge(spa.filed, HOMES["CM3 2JT"]);
  const ramBest = nearestEdge(ramsar.filed, HOMES["CM3 2JT"]);
  expect(
    spaBest &&
      ramBest &&
      spaBest.item.props.SPA_NAME === ramBest.item.props.NAME &&
      Math.abs(spaBest.miles - ramBest.miles) < 0.01,
    "the Blackwater SPA and Ramsar nearest Birkdale should be the same named ground at the same distance",
  );
  expectNearest(spa.filed, "E16 1GN", "SPA_NAME", "Lee Valley", 5.19, 0.04, "SPA");
  expectNearest(ramsar.filed, "E16 1GN", "NAME", "Lee Valley", 5.19, 0.04, "Ramsar");
  expectNearest(
    spa.filed,
    "KT17 1FH",
    "SPA_NAME",
    "South West London Waterbodies",
    7.05,
    0.05,
    "SPA",
  );
  expectNearest(
    ramsar.filed,
    "KT17 1FH",
    "NAME",
    "South West London Waterbodies",
    7.05,
    0.05,
    "Ramsar",
  );

  // The merged-woodland pair (L1): each half fails on one of
  // the single-inventory loads.
  const birkdaleWood = nearestEdge(awi.filed, HOMES["CM3 2JT"]);
  expect(
    birkdaleWood &&
      Math.abs(birkdaleWood.miles - 0.39) <= 0.02 &&
      birkdaleWood.item.inventory === "revised inventory" &&
      !birkdaleWood.item.props.NAME,
    `CM3 2JT: nearest merged ancient woodland should be the unnamed revised polygon at 0.39 mi, got ${
      birkdaleWood
        ? `${birkdaleWood.item.props.NAME || "(unnamed)"} (${birkdaleWood.item.inventory}) at ${birkdaleWood.miles.toFixed(3)} mi`
        : "none"
    }`,
  );
  const epsomWood = nearestEdge(awi.filed, HOMES["KT17 1FH"]);
  expect(
    epsomWood &&
      Math.abs(epsomWood.miles - 1.41) <= 0.02 &&
      epsomWood.item.inventory === "original inventory" &&
      !epsomWood.item.props.NAME,
    `KT17 1FH: nearest merged ancient woodland should be the unnamed original polygon at 1.41 mi, got ${
      epsomWood
        ? `${epsomWood.item.props.NAME || "(unnamed)"} (${epsomWood.item.inventory}) at ${epsomWood.miles.toFixed(3)} mi`
        : "none"
    }`,
  );
  const exeterWood = nearestEdge(awi.filed, HOMES["E16 1GN"]);
  expect(
    exeterWood &&
      Math.abs(exeterWood.miles - 2.51) <= 0.03 &&
      exeterWood.item.props.NAME === "Greenwich Park" &&
      exeterWood.item.inventory === "revised inventory",
    "E16 1GN: nearest merged ancient woodland should be Greenwich Park (revised) at 2.51 mi",
  );
  expect(
    awi.replaced > 0,
    "the merge replaced no originals — the revision demonstrably redraws woods (Titbeech among them)",
  );
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

// --- filing ------------------------------------------------------------

// Stage, count, swap — one transaction, fed as a stream
// (BUG-195, the flood shape). beginFiling opens the
// transaction and the staging table; stageRows inserts
// the filing rows the caller builds per item as it
// streams, in the house chunks of 10 rows; finishFiling
// runs the counts and the swap exactly as the one-shot
// filer did.
async function beginFiling() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `CREATE TEMP TABLE planning_stage (
         constraint_type text, name text, geom geometry(MultiPolygon, 4326),
         source_reference text, organisation text, quality text, detail text,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now()
       ) ON COMMIT DROP`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
    throw error;
  }
  const CHUNK = 10;
  const pending = [];
  async function flushPending(flushTail = false) {
    while (pending.length >= CHUNK || (flushTail && pending.length > 0)) {
      const chunk = pending.splice(0, Math.min(CHUNK, pending.length));
      const values = [];
      const params = [];
      chunk.forEach((row, i) => {
        const base = i * 9;
        values.push(
          `($${base + 1},$${base + 2},ST_Multi(ST_GeomFromText($${base + 3}, 4326)),$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`,
        );
        params.push(
          row.constraintType,
          row.name,
          row.wkt,
          row.reference,
          ORGANISATION,
          null,
          row.detail,
          row.sourceName,
          row.sourceDate,
        );
      });
      await client.query(
        `INSERT INTO planning_stage (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date)
         VALUES ${values.join(",")}`,
        params,
      );
    }
  }
  return {
    async stageRows(rows) {
      pending.push(...rows);
      if (pending.length >= CHUNK) await flushPending();
    },
    async finishFiling(expectedCount) {
      try {
        await flushPending(true);
        const staged = await client.query("SELECT count(*)::int AS n FROM planning_stage");
        if (staged.rows[0].n !== expectedCount)
          throw new Error("the staged layer count does not match — rolling back");
        await client.query(
          "DELETE FROM planning_layers WHERE constraint_type IN ('sssi', 'sac', 'spa', 'ramsar', 'ancient_woodland')",
        );
        await client.query(
          `INSERT INTO planning_layers (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at)
           SELECT constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at FROM planning_stage`,
        );
        const filedCount = await client.query(
          "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type IN ('sssi', 'sac', 'spa', 'ramsar', 'ancient_woodland')",
        );
        if (filedCount.rows[0].n !== expectedCount)
          throw new Error("the filed layer count does not match — rolling back");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        await client.end();
      }
    },
    async abortFiling() {
      await client.query("ROLLBACK").catch(() => {});
      await client.end().catch(() => {});
    },
  };
}

// The sift window for this loader's golden checks: the
// pinned nearests run to 7.05 miles (the SPA / Ramsar
// nearests at the Epsom flat), beyond the flood loaders'
// 2-mile pins — 8 miles keeps every pinned candidate with
// room to spare while staying a local, dataset-independent
// set.
const GOLDEN_WINDOW_MILES = 8;

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;
  const captured = fixtureMode
    ? JSON.parse(await readFile(join(fixtureDir, "fixture.json"), "utf8")).captured
    : null;

  // A filing run streams the reads into the staging
  // transaction as they land (BUG-195), so the database
  // check moves ahead of the reads: without DATABASE_URL a
  // filing run now fails before fetching instead of after
  // it. Verify-only never opens the database.
  let filer = null;
  if (!verifyOnly) {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL is not set — filing requires a database");
    filer = await beginFiling();
  }

  const readStream = (key, onFeatures) =>
    fixtureMode
      ? readServiceFixtureStream(SERVICES[key], fixtureDir, captured, onFeatures)
      : readServiceLiveStream(SERVICES[key], { onFeatures });

  const statutoryRow = (item, spec, sourceDate) => ({
    constraintType: spec.constraintType,
    name: item.props[spec.nameField] || null,
    wkt: polygonsToWkt(item.polygons),
    reference: item.props[spec.codeField] || null,
    detail: item.props[spec.detailField] || null,
    sourceName: spec.sourceName,
    sourceDate,
  });

  const woodlandRow = (item, sourceDate) => {
    const spec = item.inventory === "revised inventory" ? SERVICES.awiRev : SERVICES.awi;
    const detailParts = [item.props.STATUS, item.props[spec.themeField], item.inventory].filter(
      (p) => p !== "" && p != null,
    );
    return {
      constraintType: "ancient_woodland",
      name: item.props.NAME || null,
      wkt: polygonsToWkt(item.polygons),
      reference: `${item.inventory === "revised inventory" ? "AWI-R" : "AWI"}-${item.props.OBJECTID}`,
      detail: detailParts.join(" · "),
      sourceName:
        item.inventory === "revised inventory"
          ? "Natural England — Ancient Woodland Inventory, Revised (England)"
          : "Natural England — Ancient Woodland Inventory (England)",
      sourceDate,
    };
  };

  let sssi, sac, spa, ramsar, awi;
  try {
    const loadStatutoryLayer = async (key) => {
      const spec = SERVICES[key];
      const processor = createStatutoryProcessor(spec);
      const sift = createGoldenSift(HOMES, GOLDEN_WINDOW_MILES);
      const { sourceDate } = await readStream(key, async (features, date) => {
        const filed = processor.processBatch(features);
        const rows = [];
        for (const item of filed) {
          sift.offer(item);
          if (filer) rows.push(statutoryRow(item, spec, date));
        }
        if (filer && rows.length > 0) await filer.stageRows(rows);
      });
      const totals = processor.finish();
      return { ...totals, sourceDate, sifted: sift.items };
    };
    sssi = await loadStatutoryLayer("sssi");
    sac = await loadStatutoryLayer("sac");
    spa = await loadStatutoryLayer("spa");
    ramsar = await loadStatutoryLayer("ramsar");

    // Ancient woodland (L1): the revised inventory is read
    // first and held — it is the merge substrate — and its
    // filed rows stage as soon as the merger exists; the
    // originals then stream past it, staging only the
    // survivors. The golden sift merges the two sifted
    // inventories with the same merger the collecting form
    // uses; the replaced count the checks judge is the
    // full merge's, accumulated as a scalar.
    const revProcessor = createFeatureProcessor(SERVICES.awiRev.label);
    const revSift = createGoldenSift(HOMES, GOLDEN_WINDOW_MILES);
    const revItems = [];
    let revSourceDate = null;
    await readStream("awiRev", async (features, date) => {
      revSourceDate = date;
      const items = revProcessor.processBatch(features);
      for (const item of items) {
        revItems.push(item);
        revSift.offer(item);
      }
    });
    const revTotals = revProcessor.finish();
    const merger = createWoodlandMerger(revItems);
    if (filer) {
      await filer.stageRows(merger.revisedFiled.map((item) => woodlandRow(item, revSourceDate)));
    }
    const origProcessor = createFeatureProcessor(SERVICES.awi.label);
    const origSift = createGoldenSift(HOMES, GOLDEN_WINDOW_MILES);
    let origFiled = 0;
    await readStream("awi", async (features, date) => {
      const items = origProcessor.processBatch(features);
      const rows = [];
      for (const item of items) {
        origSift.offer(item);
        const kept = merger.offer(item);
        if (kept) {
          origFiled += 1;
          if (filer) rows.push(woodlandRow(kept, date));
        }
      }
      if (filer && rows.length > 0) await filer.stageRows(rows);
    });
    const origTotals = origProcessor.finish();
    awi = {
      read: origTotals.read + revTotals.read,
      origRead: origTotals.read,
      revRead: revTotals.read,
      geoless: origTotals.geoless + revTotals.geoless,
      replaced: merger.replaced(),
      filed: revItems.length + origFiled,
    };

    if (!fixtureMode) {
      const band = (value, lo, hi, what) => {
        if (value < lo || value > hi)
          throw new Error(`sanity failure: ${what} (${value}) is outside the expected band`);
      };
      band(sssi.read, 3900, 4400, "SSSI features read");
      band(sac.read, 1750, 2100, "SAC features read");
      band(sac.sites, 240, 270, "designated SAC sites");
      band(sac.excluded, 1, 200, "candidate SAC features excluded");
      band(spa.read, 950, 1250, "SPA features read");
      band(spa.sites, 80, 96, "SPA sites");
      band(ramsar.read, 1150, 1450, "Ramsar features read");
      band(ramsar.sites, 65, 82, "Ramsar sites");
      band(awi.origRead, 50000, 57500, "original woodland polygons read");
      band(awi.revRead, 40000, 65000, "revised woodland polygons read");
    }
    checkGolden({
      sssi: { filed: sssi.sifted },
      sac: { filed: sac.sifted },
      spa: { filed: spa.sifted },
      ramsar: { filed: ramsar.sifted },
      awi: {
        filed: mergeWoodland(origSift.items, revSift.items).filed,
        replaced: merger.replaced(),
      },
    });
  } catch (error) {
    if (filer) await filer.abortFiling();
    throw error;
  }

  const geoNote = (n) => (n > 0 ? ` · ${n} without geometry counted` : "");
  const summary = () =>
    `load-nature-designations · Natural England ArcGIS services · ` +
    `SSSI: ${sssi.filed} features filed · ${sssi.sites} sites (${sssi.read} read${geoNote(sssi.geoless)}) · ` +
    `SAC: ${sac.filed} designated features filed · ${sac.sites} designated sites (${sac.read} read · ${sac.excluded} candidate features excluded${geoNote(sac.geoless)}) · ` +
    `SPA: ${spa.filed} features filed · ${spa.sites} sites (${spa.read} read${geoNote(spa.geoless)}) · ` +
    `Ramsar: ${ramsar.filed} features filed · ${ramsar.sites} sites (${ramsar.read} read${geoNote(ramsar.geoless)}) · ` +
    `ancient woodland: ${awi.filed} filed (${awi.origRead} in the original inventory · ${awi.revRead} in the revised inventory · ${awi.replaced} originals replaced by the revision${geoNote(awi.geoless)})`;

  if (verifyOnly) {
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    return;
  }

  const totalFiled = sssi.filed + sac.filed + spa.filed + ramsar.filed + awi.filed;
  const activeFiler = filer;
  filer = null;
  await activeFiler.finishFiling(totalFiled);
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      `load-nature-designations FAILED: ${error.message}${error.cause ? ` (${error.cause.message ?? error.cause})` : ""}`,
    );
    process.exitCode = 1;
  });
}
