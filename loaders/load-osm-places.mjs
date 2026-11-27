// Nearby places loader — OpenStreetMap (plan step M5.6).
//
// Files the places the What's Nearby section serves — vets,
// pet shops and boarding, supermarkets, food & drink, leisure,
// places to visit, places of worship (with the religion AS
// RECORDED, in the detail column migration 0009 added),
// libraries and parks — from Geofabrik's country extracts of
// OpenStreetMap into osm_points. One of the runner's quarterly
// loaders (OSM is a living map; Geofabrik republishes daily,
// the loader refreshes quarterly like the other M5 loaders).
//
// How the read works (prep Sections 3 and 8, measured): there
// is no usable bulk API for this — the Overpass API failed a
// combined county query three times in the prep (504/502), and
// a naive per-object Python parse of a country extract did not
// finish in ~30 minutes. So each country file (England, Wales,
// Scotland .osm.pbf) is downloaded whole, verified against the
// md5 Geofabrik publishes for it — a mismatch refuses the run,
// nothing is filed from an unverified file — and cut down to
// the elements carrying an amenity, shop, leisure or tourism
// key by loaders/osm-extract.py, which rides libosmium's C++
// filters (England: ~2.07M candidate elements in ~6 minutes).
// The loader needs python3 with pyosmium installed
// (pip install osmium) wherever it runs, fixture mode included.
//
// The point held for every place is its representative point —
// a node's own position, a way's node-average centre, a
// multipolygon relation's member average — the same point for
// every group, so distances are comparable across the section.
// The user-seat gap check of 13 Nov 2026 shaped the filing
// rules (GAP-REPORT L1–L14, decisions D5/D9, and the user's
// rulings of 13 Nov recorded in the plan):
// - Centre-point distances are accepted knowingly for V1
//   (ruling 1). The Exeter park check below therefore reads
//   the Greenspace loader's centre figure (0.32 mi by centre
//   point); this loader's own park rows are the OSM half of
//   the merged parks serving (ruling 2) — both sources are
//   filed, serving merges them, and a ground named differently
//   by the two sources (Bow Creek in OSM, Bow Green in
//   Greenspace) stays two rows, distances being the honest
//   join, never a name match.
// - Food & drink is ANY sort of food option (ruling 3):
//   restaurant, pub, cafe, fast food and bar.
// - One primary group per place (ruling 4), priority: places
//   to visit, then places of worship, then leisure, then
//   libraries, then food & drink; the care and shop groups sit
//   below those, parks last (a park with a cafe on it is the
//   cafe). The element's other groups are dropped — 13% of the
//   prep's Exeter elements matched two or more groups, and the
//   schema holds exactly one row per place.
// - Named AND unnamed rows are filed (L3): serving shows
//   named places only and counts the rest, so an unnamed
//   swimming-pool polygon files here (as leisure) and never
//   poses as a named centre at serving time (L4).
// - Leisure files the leisure tags as mapped, gym included —
//   amenity=gym at Exeter's nearest leisure point is how
//   mappers record a fitness centre (L4 evidence); the design
//   prose's "pools and gyms" line grouped them in one breath.
// - Libraries file as tagged and are never labelled "public"
//   (L7 — a university or school library files too, and the
//   word "public" appears on no row this loader writes).
// - Supermarkets file as tagged (L14): a convenience store
//   carrying shop=supermarket files here (Exeter's "Local
//   Express", 0.39 mi, nearer than Lidl); telling chains from
//   convenience stores is M8 presentation, not this loader.
// - Dedupe (L9): the same element twice (a border way in two
//   country files) files once; then same group + same
//   normalised name + points under 30 m apart files once,
//   preferring the relation over the way over the node (the
//   node+way pair for Epsom's "Galu" restaurant). Name alone
//   NEVER dedupes — Oxford's two "Pets at Home", 0.94 and
//   2.33 mi out, are two real shops and stay two rows.
// - The worship religion files verbatim in detail, multi-value
//   strings like "pagan;christian" included, never normalised
//   and never inferred; no tag, NULL detail (migration 0009).
// - An empty group at a home is a fact about the MAP, never
//   about the ground (L2/L14): Birkdale files ZERO vets — a
//   real vet trades 2.3 miles away that OSM has not mapped as
//   one — so serving says "none mapped within two miles" and
//   offers the nearest mapped beyond, and no line this loader
//   writes ever claims a place does not exist.
//
// osm_id holds the element's numeric id only: nodes, ways and
// relations share one number space, so the id is a reference
// back to the map, not a unique key (the same reason the
// stage-table swap replaces the whole table each run rather
// than upserting).
//
// Licence (T12): OpenStreetMap data is © OpenStreetMap
// contributors, available under the ODbL. The filed table is a
// derivative database and stays private — only facts (names,
// distances) are served, with the attribution line the
// schema doc carries; the dataset itself is never published.
//
// Golden checks run on every load (loader's own TARGETS — the
// universal three homes plus the M5.6 targeted reads from the
// prep): Exeter's vet and both supermarkets, Epsom's vet and
// its deduped restaurant pair, Birkdale's honestly-empty vet
// group with its boarding and library reads, Hilgay's empty
// radius with its beyond-radius fallbacks, Cardiff read from
// the WALES file, Oxford's verbatim religion string and its
// two pet shops, and City Island's unnamed residents' pool
// filing closer than any named leisure row. The merged
// Exeter park check (0.32 mi by centre point) belongs to the
// Greenspace loader, whose sites win that ground.

import {
  createReadStream,
  createWriteStream,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createLoaderResume } from "./loader-resume.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

const { Pool } = pg;

// The golden homes (decision D10: the universal three every
// loader asserts, plus the M5.6 targeted homes: Hilgay for the
// empty-state honesty, Cardiff for the Wales file, Oxford for
// the religion string and the duplicate-name pair).
export const HOMES = {
  birkdale: { label: "19 Birkdale Rise CM3 2JT", lat: 51.776176, lon: 0.60387 },
  exeter: { label: "6 Exeter Road E16 1GN", lat: 51.515224, lon: 0.021177 },
  epsom: { label: "Flat 4, Minerva House KT17 1FH", lat: 51.344571, lon: -0.247104 },
  hilgay: { label: "Hilgay CB6 1EH", lat: 52.507481, lon: 0.33491 },
  cardiff: { label: "Cardiff CF11 8AA", lat: 51.467947, lon: -3.192837 },
  oxford: { label: "Oxford OX1 1HD", lat: 51.751268, lon: -1.264073 },
  cityisland: { label: "London City Island E14 0BZ", lat: 51.511184, lon: 0.005102 },
};

export const COUNTRIES = ["england", "wales", "scotland"];
const GEOFABRIK_BASE = "https://download.geofabrik.de/europe/united-kingdom";
// Candidate-element floors per country extract (the
// KeyFilter yield): a short read is a broken read, and the
// run refuses rather than filing a partial country (T1's
// reconcile, at extract scale). England measured 2,071,516
// candidates in the prep; the floors sit far below the
// measured yields so ordinary map growth never trips them.
export const EXTRACT_FLOORS = { england: 1_500_000, wales: 80_000, scotland: 80_000 };

export const SOURCE_NAME = "OpenStreetMap via Geofabrik (© OpenStreetMap contributors)";
const EXTRACT_SCRIPT = fileURLToPath(new URL("./osm-extract.py", import.meta.url));

// The group vocabulary — the place_type values of docs/schema.md
// item 11. One element files under exactly one.
export const PLACE_TYPES = [
  "vet",
  "pet_shop",
  "pet_boarding",
  "supermarket",
  "food_and_drink",
  "leisure",
  "visit",
  "worship",
  "library",
  "park",
];

// Primary-group priority (ruling 4 first, then the care and
// shop groups, parks last): the first matching group wins.
export const GROUP_PRIORITY = [
  "visit",
  "worship",
  "leisure",
  "library",
  "food_and_drink",
  "vet",
  "pet_shop",
  "pet_boarding",
  "supermarket",
  "park",
];

const FOOD_AMENITIES = new Set(["restaurant", "pub", "cafe", "fast_food", "bar"]);
const LEISURE_AMENITIES = new Set(["cinema", "theatre", "gym"]);
const LEISURE_VALUES = new Set([
  "leisure_centre",
  "sports_centre",
  "fitness_centre",
  "swimming_pool",
]);
const VISIT_VALUES = new Set(["museum", "attraction", "viewpoint", "gallery"]);

// Every group an element's tags match (before priority picks
// one). Exported for the tests' independent recomputation.
export function matchingGroups(tags) {
  const groups = new Set();
  if (VISIT_VALUES.has(tags.tourism)) groups.add("visit");
  if (tags.amenity === "place_of_worship") groups.add("worship");
  if (LEISURE_AMENITIES.has(tags.amenity) || LEISURE_VALUES.has(tags.leisure))
    groups.add("leisure");
  if (tags.amenity === "library") groups.add("library");
  if (FOOD_AMENITIES.has(tags.amenity)) groups.add("food_and_drink");
  if (tags.amenity === "veterinary") groups.add("vet");
  if (tags.shop === "pet") groups.add("pet_shop");
  if (tags.amenity === "animal_boarding") groups.add("pet_boarding");
  if (tags.shop === "supermarket") groups.add("supermarket");
  if (tags.leisure === "park") groups.add("park");
  return groups;
}

// The one primary group for an element's tags, or null when
// the element is not a place this loader files (a garden
// centre, a playground, a pitch — deliberately not filed,
// GAP L6).
export function classifyTags(tags) {
  const groups = matchingGroups(tags);
  for (const group of GROUP_PRIORITY) if (groups.has(group)) return group;
  return null;
}

// Source-name corrections (BUG-239, 24 Nov 2026):
// OpenStreetMap names file verbatim — the loader never
// renames a place — except where the source name is
// itself a plain typo and the correct name is the
// business's own (its signage, its website). Each entry
// is one exact source string to its correction, with
// the OSM element it came from, so a re-file from a
// fresh Geofabrik extract keeps the fix instead of
// re-filing the typo. The map is removed entry by entry
// as the corrections land upstream in OSM itself and a
// re-file proves them gone.
//   - "Latneys Boarding Kennelsl and Cattery" — OSM way
//     1319900560, London Road, Witham CM8 1EB: the
//     stray "l" is a typo in the name tag; the business
//     is "Latneys Boarding Kennels and Cattery".
const NAME_CORRECTIONS = new Map([
  ["Latneys Boarding Kennelsl and Cattery", "Latneys Boarding Kennels and Cattery"],
  // BUG-344(e) (25 Nov 2026): "Hatfield Tandori" — OSM
  // node 1203700697, 26a Maldon Road, Hatfield Peverel:
  // the missing "o" is a typo in the name tag; the
  // business's own spelling is "Hatfield Tandoori" (its
  // own site, hatfieldtandoorionline.com, and the Food
  // Hygiene Ratings entry for the same address).
  ["Hatfield Tandori", "Hatfield Tandoori"],
]);

// The recorded name: the name tag trimmed, NULL when absent
// or blank. Unnamed rows file (L3) — serving filters them.
export function placeName(tags) {
  const name = (tags.name ?? "").trim();
  if (name === "") return null;
  return NAME_CORRECTIONS.get(name) ?? name;
}

// The detail for a filed row: the worship religion EXACTLY as
// recorded (multi-value strings verbatim), nothing for any
// other group, NULL when a place of worship carries no
// religion tag. Never normalised, never inferred (L8).
export function detailFor(placeType, tags) {
  if (placeType !== "worship") return null;
  const religion = (tags.religion ?? "").trim();
  return religion === "" ? null : religion;
}

const KIND_RANK = { relation: 0, way: 1, node: 2 };
const DEDUPE_RADIUS_MI = 30 / 1609.344;

export function normaliseName(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Dedupe (L9), in order: (a) the same element (kind + id)
// twice — a border way appears in two country extracts —
// files once, the first copy wins (same object, same data);
// (b) same group + same normalised name + points under 30 m
// apart files once, preferring relation over way over node.
// Name alone never dedupes. Returns the filed rows plus the
// drop counts, which the run log reports.
export function dedupePlaces(rows) {
  const byElement = new Map();
  let droppedElements = 0;
  for (const row of rows) {
    const key = `${row.kind}:${row.osmId}`;
    if (byElement.has(key)) {
      droppedElements++;
      continue;
    }
    byElement.set(key, row);
  }
  const unique = [...byElement.values()];
  const buckets = new Map();
  const filed = [];
  for (const row of unique) {
    if (row.name === null) {
      filed.push(row);
      continue;
    }
    const key = `${row.placeType}|${normaliseName(row.name)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  let droppedDuplicates = 0;
  for (const members of buckets.values()) {
    members.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
    const kept = [];
    for (const row of members) {
      const twin = kept.find(
        (k) => haversineMiles(k.lat, k.lon, row.lat, row.lon) <= DEDUPE_RADIUS_MI,
      );
      if (twin) {
        droppedDuplicates++;
        continue;
      }
      kept.push(row);
    }
    filed.push(...kept);
  }
  return { rows: filed, droppedElements, droppedDuplicates };
}

// Geofabrik's published .md5 file: "<hex>  <filename>". The
// oracle for T1 — a downloaded extract whose bytes do not
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

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3956;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestNamed(rows, home, placeType) {
  let best = null;
  for (const row of rows) {
    if (row.placeType !== placeType || row.name === null) continue;
    const d = haversineMiles(home.lat, home.lon, row.lat, row.lon);
    if (best === null || d < best.d) best = { row, d };
  }
  return best;
}

function countWithin(rows, home, placeType, miles, namedOnly = false) {
  let n = 0;
  for (const row of rows) {
    if (row.placeType !== placeType) continue;
    if (namedOnly && row.name === null) continue;
    if (haversineMiles(home.lat, home.lon, row.lat, row.lon) <= miles) n++;
  }
  return n;
}

const HOME_COUNTRY = {
  birkdale: "england",
  exeter: "england",
  epsom: "england",
  hilgay: "england",
  oxford: "england",
  cityisland: "england",
  cardiff: "wales",
};

// Golden checks over the filed rows (the prep's verified
// reads, golden-reads.json). Run on every mode — the fixture
// is cut from the same verified extracts, so the same figures
// must reproduce there. A partial --pbf-dir run scopes the
// checks to the homes whose country was actually read (a
// Wales-only run can prove Cardiff and can prove nothing
// about Exeter — asserting otherwise would fail a good read
// for the wrong reason).
export function goldenChecks(rows, countries = null) {
  const inScope = (homeKey) => countries === null || countries.has(HOME_COUNTRY[homeKey]);
  const failures = [];
  const expectNearest = (homeKey, placeType, namePart, expected, tolerance) => {
    if (!inScope(homeKey)) return;
    const home = HOMES[homeKey];
    const best = nearestNamed(rows, home, placeType);
    if (!best) {
      failures.push(`${home.label}: no named ${placeType} row filed at all`);
      return;
    }
    if (!best.row.name.toLowerCase().includes(namePart.toLowerCase()))
      failures.push(
        `${home.label}: nearest named ${placeType} is "${best.row.name}", expected a name containing "${namePart}"`,
      );
    else if (Math.abs(best.d - expected) > tolerance)
      failures.push(
        `${home.label}: nearest named ${placeType} "${best.row.name}" is ${best.d.toFixed(3)} mi from the home, expected ${expected} ± ${tolerance}`,
      );
  };
  const expectPresent = (homeKey, placeType, namePart, expected, tolerance) => {
    if (!inScope(homeKey)) return;
    const home = HOMES[homeKey];
    const hit = rows.find(
      (r) =>
        r.placeType === placeType &&
        r.name !== null &&
        r.name.toLowerCase().includes(namePart.toLowerCase()) &&
        Math.abs(haversineMiles(home.lat, home.lon, r.lat, r.lon) - expected) <= tolerance,
    );
    if (!hit)
      failures.push(
        `${home.label}: no ${placeType} row named like "${namePart}" at ${expected} ± ${tolerance} mi`,
      );
  };
  const expectNoneWithin = (homeKey, placeType, miles) => {
    if (!inScope(homeKey)) return;
    const home = HOMES[homeKey];
    const n = countWithin(rows, home, placeType, miles);
    if (n > 0)
      failures.push(
        `${home.label}: expected no ${placeType} rows within ${miles} mi (the honestly-empty state), found ${n}`,
      );
  };

  // Exeter (T4): the plan's vet check, and the design's two
  // supermarkets (the nearer convenience store files too —
  // the named pair is asserted, the sorting is M8's).
  expectNearest("exeter", "vet", "Goddard Vets Plaistow", 1.169, 0.03);
  expectPresent("exeter", "supermarket", "Lidl", 0.463, 0.03);
  expectPresent("exeter", "supermarket", "Morrisons", 0.464, 0.03);
  // Epsom (targeted pin): the design's 0.93 mi vet.
  expectNearest("epsom", "vet", "Goddard Veterinary Group", 0.929, 0.06);
  // Epsom dedupe (T6): the node+way "Galu" pair files ONCE.
  if (inScope("epsom")) {
    const galu = rows.filter(
      (r) =>
        r.placeType === "food_and_drink" &&
        r.name === "Galu" &&
        haversineMiles(HOMES.epsom.lat, HOMES.epsom.lon, r.lat, r.lon) <= 3.2,
    );
    if (galu.length !== 1)
      failures.push(
        `Epsom: expected exactly one filed "Galu" food & drink row (node+way dedupe), found ${galu.length}`,
      );
  }
  // City Island leisure honesty (T5): the residents' pool —
  // an unnamed swimming-pool way (972838399) — files as
  // leisure at 0.075 mi with NO name, while the served line
  // leads with a real name (The Strength Room, 0.041 mi): the
  // pool is in the data, counted, and never dressed as a
  // named centre. The gap report attributed this pool to
  // Epsom; the prep's own captures put it here (Epsom's
  // nearest unnamed pool files at 1.065 mi), so the check
  // lives at the home where the fact is.
  if (inScope("cityisland")) {
    const named = nearestNamed(rows, HOMES.cityisland, "leisure");
    if (!named || named.row.name !== "The Strength Room" || Math.abs(named.d - 0.041) > 0.01)
      failures.push(
        `City Island: nearest named leisure row is ${named ? `"${named.row.name}" at ${named.d.toFixed(3)} mi` : "missing"}, expected "The Strength Room" at 0.041 ± 0.01`,
      );
    const pool = rows
      .filter(
        (r) =>
          r.placeType === "leisure" &&
          r.name === null &&
          Math.abs(
            haversineMiles(HOMES.cityisland.lat, HOMES.cityisland.lon, r.lat, r.lon) - 0.075,
          ) <= 0.015,
      )
      .sort(
        (a, b) =>
          haversineMiles(HOMES.cityisland.lat, HOMES.cityisland.lon, a.lat, a.lon) -
          haversineMiles(HOMES.cityisland.lat, HOMES.cityisland.lon, b.lat, b.lon),
      )[0];
    if (!pool)
      failures.push(
        "City Island: the unnamed residents' pool (swimming-pool way at 0.075 ± 0.015 mi) is not filed as an unnamed leisure row",
      );
  }
  // Birkdale (T8): ZERO vets file — the empty group is the
  // mapped truth, asserted so a future mis-tag cannot quietly
  // invent one — while boarding and the library do file.
  expectNoneWithin("birkdale", "vet", 2.0);
  expectNearest("birkdale", "pet_boarding", "Latneys", 0.782, 0.06);
  expectNearest("birkdale", "library", "Hatfield Peverel Library", 0.462, 0.06);
  // Hilgay (T9): the served groups are empty within two miles
  // and present beyond it — both halves asserted.
  for (const placeType of ["vet", "supermarket", "worship", "library", "pet_boarding", "visit"])
    expectNoneWithin("hilgay", placeType, 2.0);
  expectNearest("hilgay", "vet", "The Crossings Veterinary Centre", 6.375, 0.15);
  expectNearest("hilgay", "supermarket", "Co-operative", 3.545, 0.1);
  expectNearest("hilgay", "worship", "Mary", 2.596, 0.1);
  expectNearest("hilgay", "library", "Littleport Library", 3.685, 0.1);
  expectNearest("hilgay", "pet_boarding", "Ashley", 5.517, 0.12);
  expectPresent("hilgay", "food_and_drink", "The Ship Inn", 1.412, 0.06);
  // Cardiff (T10): the reads come from the WALES extract.
  expectNearest("cardiff", "vet", "Park Vets", 1.164, 0.06);
  expectNearest("cardiff", "supermarket", "Clare Foods", 0.335, 0.05);
  // Oxford (T7, T11, T6): the verbatim multi-value religion,
  // a no-religion worship row, the Radcliffe Camera under
  // visit, and both Pets at Home still filed.
  if (inScope("oxford")) {
    const within = (r, miles) =>
      haversineMiles(HOMES.oxford.lat, HOMES.oxford.lon, r.lat, r.lon) <= miles;
    if (
      !rows.some(
        (r) => r.placeType === "worship" && r.detail === "pagan;christian" && within(r, 3.2),
      )
    )
      failures.push('Oxford: no worship row carries the verbatim detail "pagan;christian"');
    if (!rows.some((r) => r.placeType === "worship" && r.detail === null && within(r, 3.2)))
      failures.push(
        "Oxford: no worship row carries a NULL detail (a place of worship with no religion tag)",
      );
    if (
      !rows.some((r) => r.placeType === "visit" && r.name === "Radcliffe Camera" && within(r, 0.5))
    )
      failures.push('Oxford: "Radcliffe Camera" is not filed under visit within 0.5 mi');
    const pets = rows.filter(
      (r) => r.placeType === "pet_shop" && r.name === "Pets at Home" && within(r, 3.2),
    );
    if (pets.length < 2)
      failures.push(
        `Oxford: expected both "Pets at Home" shops filed (name alone never dedupes), found ${pets.length}`,
      );
  }
  return failures;
}

// National sanity, full three-country loads only (a fixture
// or a partial --pbf-dir run skips it — partial by design).
// Floors sit far below the prep's measured yields so map
// growth never trips them; a broken extract or a mapping
// regression falls through them at once.
// National sanity (full three-country loads only): the
// bands were set from the first measured national read,
// 13 Nov 2026 — 314,842 places filed (vet 2,909 · pet_shop
// 2,341 · pet_boarding 758 · supermarket 10,080 ·
// food_and_drink 166,261 · leisure 38,563 · visit 14,844 ·
// worship 40,022 · library 3,820 · park 35,244). The total
// band runs ~0.64x–1.75x of measured and each floor ~2/3 of
// measured, so ordinary map drift never trips them while a
// truncated or broken extract does. (The prep's advance
// estimate of 0.75–1.1M filed places proved ~3x too high —
// it counted candidate elements more broadly than the
// filed, deduplicated rows these bands guard.)
export function sanityChecks(rows, { national }) {
  if (!national) return [];
  const failures = [];
  const byType = new Map();
  for (const row of rows) byType.set(row.placeType, (byType.get(row.placeType) ?? 0) + 1);
  const floors = { vet: 1900, worship: 26000, park: 22900, supermarket: 6500 };
  if (rows.length < 200_000 || rows.length > 550_000)
    failures.push(`national filed total ${rows.length} is outside the expected 200k–550k band`);
  for (const [placeType, floor] of Object.entries(floors)) {
    const n = byType.get(placeType) ?? 0;
    if (n < floor) failures.push(`national ${placeType} count ${n} is below the floor of ${floor}`);
  }
  return failures;
}

// Stage-table swap (the other M5 loaders' pattern): rows are
// staged, then the live table is replaced inside one
// transaction, so a failed load leaves the last good data
// serving untouched.
//
// Filing with resume support (BUG-368): the stage is a
// PERSISTENT table now (migration 0048) and a
// loader_checkpoint row records the last fully staged
// flush, so a killed run resumes staging from the
// checkpoint instead of re-staging ~315k rows. The extract
// still re-runs — pyosmium re-cuts the downloads — but the
// staging does not. The edition is the extract date(s)
// the rows carry; the expected total is the row count.
// The swap stays atomic, and a successful swap clears
// staging + checkpoint together (BUG-248 unchanged). The
// old BEGIN-before-create discipline (CI run 98) died with
// the TEMP table: a persistent stage needs no enclosing
// transaction to survive its own CREATE.
/**
 * @param {any} pool
 * @param {any[]} rows
 * @param {string} retrievedAt
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, restart?: boolean }} [options]
 */
export async function filePlaces(
  pool,
  rows,
  retrievedAt,
  { progress = null, restart = false } = {},
) {
  const edition = `osm-${[...new Set(rows.map((r) => r.sourceDate))].sort().join("+") || "unknown"}`;
  const expected = rows.length;
  // BUG-265: the stage flushes are the filing's long phase
  // (~315k rows in 500-row flushes) — a line every
  // twentieth of the flushes, a heartbeat, and a warning
  // for a flush over 3x the recent average.
  const totalFlushes = Math.ceil(rows.length / 500);
  const stageTally = progress?.tally({
    label: "stage",
    total: totalFlushes,
    every: Math.max(1, Math.ceil(totalFlushes / 20)),
    unit: "flushes",
  });
  const stageWatch = createBatchWatch();
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS osm_places_stage (
      osm_id bigint, name text, place_type text, detail text,
      latitude double precision, longitude double precision,
      source_name text, source_date date,
      seq bigint NOT NULL, UNIQUE (seq)
    )`);
    const resume = createLoaderResume(client, {
      loader: "load-osm-places",
      stageTable: "osm_places_stage",
      progress,
      restart,
    });
    const resumePrep = await resume.prepare({ edition, expected });
    const startAt = resumePrep.resumed ? resumePrep.checkpoint.next_start_index : 0;
    let flushCount = Math.floor(startAt / 500);
    let stagedRows = resumePrep.resumed ? resumePrep.checkpoint.filed_count : 0;
    const values = [];
    const params = [];
    const flush = async () => {
      if (values.length === 0) return;
      const started = Date.now();
      const flushedRows = values.length;
      await client.query(
        `INSERT INTO osm_places_stage (osm_id, name, place_type, detail, latitude, longitude, source_name, source_date, seq) VALUES ${values.join(", ")}`,
        params,
      );
      values.length = 0;
      params.length = 0;
      stagedRows += flushedRows;
      flushCount += 1;
      const { tookMs, averageMs, slow } = stageWatch.observe(Date.now() - started);
      stageTally?.tick(flushCount);
      progress?.heartbeat({ stage: "stage", done: stagedRows, total: rows.length });
      if (slow) {
        progress?.warning({
          what: "stage flush duration",
          value: `flush ${flushCount} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
      // BUG-368: one checkpoint line per committed flush.
      await resume.checkpoint({
        edition,
        expected,
        nextStartIndex: stagedRows,
        read: stagedRows,
        filed: stagedRows,
        unit: "rows",
      });
    };
    try {
      for (let at = startAt; at < rows.length; at++) {
        const row = rows[at];
        const base = params.length;
        values.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`,
        );
        params.push(
          row.osmId,
          row.name,
          row.placeType,
          row.detail,
          row.lat,
          row.lon,
          SOURCE_NAME,
          row.sourceDate,
          resume.takeSeq(1),
        );
        if (values.length >= 500) await flush();
      }
      await flush();
      stageTally?.finish(flushCount);
    } catch (err) {
      // BUG-368: the staging is durable per flush — no
      // transaction to roll back, and the staged rows +
      // checkpoint STAY for the next run to resume from.
      progress?.failed({
        stage: "file",
        filed: stagedRows,
        total: rows.length,
        error: err,
        resume: resume.resumeNote(),
      });
      throw err;
    }
    try {
      const stagedRes = await client.query("SELECT count(*)::int AS n FROM osm_places_stage");
      if (stagedRes.rows[0].n !== expected)
        throw new Error("the staged place count does not match — rolling back");
      await client.query("BEGIN");
      try {
        await client.query("DELETE FROM osm_points");
        // The live table's position columns are latitude/longitude
        // (migration 0001, like every other point table) — this
        // INSERT originally named them lat/lon, the row objects'
        // property names, and CI run 99's database job failed with
        // "column lat of relation osm_points does not exist": the
        // filing path's first real execution anywhere, the fake-
        // pool tests having pinned statement order, not names.
        // The schema-contract tests now pin the names too.
        await client.query(
          `INSERT INTO osm_points (osm_id, name, place_type, latitude, longitude, source_name, source_date, loaded_at, detail)
       SELECT osm_id, name, place_type, latitude, longitude, source_name, source_date, $1, detail FROM osm_places_stage`,
          [retrievedAt],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
      // The run is complete: staging + checkpoint go together.
      await resume.clear();
    } catch (err) {
      // BUG-368: a swap failure leaves the staged read
      // checkpointed, so the next run resumes at the swap.
      progress?.failed({
        stage: "file",
        filed: stagedRows,
        total: rows.length,
        error: err,
        resume: resume.resumeNote(),
      });
      throw err;
    }
  } finally {
    client.release();
  }
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_FIXTURE_DIR = fileURLToPath(
  new URL("../../tests/fixtures/osm-places/", import.meta.url),
);

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
// BUG-385: a transient fetch failure is retried for up to 30
// minutes (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
// 2026) — the same retry the flood loaders got in BUG-384.
// Past the budget the original error fails the run and it
// waits. The delay caps at the last schedule entry; a test
// may pass delaysMs: [] for instant retries. Non-transient
// failures throw at once (see isTransientFetchError).
/**
 * @param {string} url
 * @param {string} what
 * @param {object} [opts]
 * @param {number[]} [opts.delaysMs]
 * @param {((error: any, attempt: number, delay: number, what: string) => void) | null} [opts.onRetry]
 * @param {number} [opts.retryBudgetMs]
 * @param {RequestInit} [opts.init]
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
      const response = await fetch(url, init);
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

// BUG-385: the retry lives in fetchResponse now — this helper
// keeps its old shape and its old error message. The body
// read sits outside fetchResponse's try, so a malformed body
// fails fast instead of retrying.
export async function fetchText(
  url,
  what,
  { delaysMs = RETRY_DELAYS_MS, onRetry = null, retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS } = {},
) {
  let res;
  try {
    res = await fetchResponse(url, what, { delaysMs, onRetry, retryBudgetMs });
  } catch (err) {
    if (typeof err.status === "number") throw new Error(`${what}: HTTP ${err.status} from ${url}`);
    throw err;
  }
  return res.text();
}

// BUG-385: the whole-download retry for a country extract
// (these are the largest downloads in the project — England
// is ~1.7 GB). A transient failure — at the fetch or
// mid-stream — restarts the download from scratch for up to
// 30 minutes (TRANSIENT_RETRY_BUDGET_MS); every attempt opens
// a fresh write stream, so a partial file from a cut attempt
// is truncated, never resumed or appended to. Non-transient
// failures throw at once, with the old error message.
export async function downloadExtract(
  country,
  latestUrl,
  dest,
  { delaysMs = RETRY_DELAYS_MS, onRetry = null, retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS } = {},
) {
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
      return;
    } catch (error) {
      if (!isTransientFetchError(error)) throw error;
      if (Date.now() - startedAt >= retryBudgetMs) throw error;
      const delay =
        delaysMs.length === 0 ? 0 : delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      onRetry?.(error, attempt, delay, `${country} extract download`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function md5OfFile(path) {
  const hash = createHash("md5");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

// BUG-387: download one country extract and verify it
// against Geofabrik's published md5 — with ONE re-download
// when the first download fails its hash. A download that
// completes but is truncated is not a fetch error (the
// BUG-385 retry never sees it); the hash is the only thing
// that catches it, and today it fails the run after the
// largest download in the project. The re-download goes
// through downloadExtract, so it carries the same 30-minute
// whole-download retry. A second hash failure throws exactly
// as today — refusing to file from an unverified extract.
// (The --pbf-dir path does not use this: its files are local,
// and re-reading the same file recovers nothing. The floor
// check in extractAndMap does not use it either: a
// hash-verified download re-downloads to identical bytes.)
/**
 * @param {string} country
 * @param {string} latestUrl
 * @param {string} dest
 * @param {string} published
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export async function downloadAndVerifyExtract(
  country,
  latestUrl,
  dest,
  published,
  { progress = null } = {},
) {
  await downloadExtract(country, latestUrl, dest);
  progress?.stage(`verifying the ${country} download against Geofabrik's md5...`);
  let actual = await md5OfFile(dest);
  if (md5Matches(actual, published)) return;
  progress?.warning({
    what: "downloaded extract failed its md5 check — re-downloading once (BUG-387)",
    value: `${country}: downloaded extract hashes to ${actual} but Geofabrik publishes ${published}`,
    threshold: "one re-download per extract",
  });
  await downloadExtract(country, latestUrl, dest);
  actual = await md5OfFile(dest);
  if (!md5Matches(actual, published))
    throw new Error(
      `${country}: downloaded extract hashes to ${actual} but Geofabrik publishes ${published} — refusing to file from an unverified extract`,
    );
}

// Cut one extract down to its candidate elements with the
// libosmium cutter; returns the elements read and the mapped
// candidate rows (pre-dedupe), stamped with the extract's
// data date.
async function extractAndMap(
  inputPath,
  sourceDate,
  workDir,
  floor,
  label,
  { progress = null } = {},
) {
  // BUG-265: the ndjson read is the per-country long phase
  // (England: ~2M candidate elements) — a line every
  // 250,000 elements and a heartbeat on the same cadence.
  // No percentage: the floor is a lower bound, not a total.
  const extractTally = progress?.tally({
    label: `extract ${label}`,
    every: 250_000,
    unit: "elements",
  });
  let elementsRead = 0;
  try {
    const ndjsonPath = join(workDir, `${label}.ndjson`);
    await new Promise((resolve, reject) => {
      const child = spawn("python3", [EXTRACT_SCRIPT, inputPath, ndjsonPath], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `osm-extract failed for ${label} (exit ${code}) — python3 with pyosmium is required (pip install osmium): ${stderr.slice(-400)}`,
            ),
          );
      });
    });
    const rows = [];
    const rl = createInterface({ input: createReadStream(ndjsonPath), crlfDelay: Infinity });
    for await (const line of rl) {
      if (line.trim() === "") continue;
      elementsRead++;
      extractTally?.tick(elementsRead);
      progress?.heartbeat({ stage: `extract ${label}`, done: elementsRead, every: 250_000 });
      const el = JSON.parse(line);
      const placeType = classifyTags(el.tags);
      if (placeType === null) continue;
      rows.push({
        kind: el.kind,
        osmId: el.id,
        name: placeName(el.tags),
        placeType,
        detail: detailFor(placeType, el.tags),
        lat: el.lat,
        lon: el.lon,
        sourceDate,
      });
    }
    if (floor !== null && elementsRead < floor)
      throw new Error(
        `${label}: read ${elementsRead} candidate elements but the floor is ${floor} — the read does not reconcile`,
      );
    extractTally?.finish(elementsRead);
    return { elementsRead, rows };
  } catch (err) {
    progress?.failed({
      stage: `extract ${label}`,
      filed: elementsRead,
      error: err,
      resume: "re-run from scratch (extracts re-cut from the downloaded files)",
    });
    throw err;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const fixtureMode = args.includes("--fixture") || fileArg !== null;
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last checkpointed flush instead of
  // restarting; with no checkpoint this is a fresh start.
  const restart = args.includes("--restart");
  const pbfDirIdx = args.indexOf("--pbf-dir");
  const pbfDir = pbfDirIdx >= 0 ? args[pbfDirIdx + 1] : null;
  const retrievedOn = todayDate();
  const workDir = mkdtempSync(join(tmpdir(), "cmnh-osm-places-"));
  // BUG-265: one logger for the downloads, the per-country
  // extracts and the filing; the extract and filing loops
  // carry their own tallies (see extractAndMap, filePlaces).
  const progress = createProgressLogger({ name: "load-osm-places" });
  try {
    const perCountry = [];
    // Merged row by row, never spread into push(): a country
    // part holds ~400k rows, and spreading that many arguments
    // overflows V8's call stack (seen on the first live run,
    // 13 Nov 2026 — Wales and the fixtures were too small to
    // trip it).
    let candidates = [];
    let national = false;
    let goldenScope = null;

    if (fixtureMode) {
      const fixtureDir = fileArg ?? DEFAULT_FIXTURE_DIR;
      const capturedDate = JSON.parse(
        readFileSync(join(fixtureDir, "fixture.json"), "utf8"),
      ).captured;
      const files = readdirSync(fixtureDir)
        .filter((f) => f.endsWith(".osm"))
        .sort();
      if (files.length === 0)
        throw new Error("osm-places fixture directory holds no .osm captures");
      let read = 0;
      for (const file of files) {
        progress.stage(`extracting fixture ${file}...`);
        const part = await extractAndMap(
          join(fixtureDir, file),
          capturedDate,
          workDir,
          null,
          `fixture-${file}`,
          { progress },
        );
        read += part.elementsRead;
        for (const row of part.rows) candidates.push(row);
      }
      perCountry.push(`fixture captures ${formatCount(read)} elements`);
    } else if (pbfDir) {
      const present = [];
      for (const country of COUNTRIES) {
        const file = readdirSync(pbfDir).find(
          (f) => f.startsWith(`${country}-`) && f.endsWith(".osm.pbf"),
        );
        if (!file) continue;
        progress.stage(`verifying the local ${country} extract against Geofabrik's md5...`);
        const published = parsePublishedMd5(
          await fetchText(
            `${GEOFABRIK_BASE}/${country}/${country}-latest.osm.pbf.md5`,
            `${country} md5`,
          ),
        );
        const actual = await md5OfFile(join(pbfDir, file));
        if (!md5Matches(actual, published))
          throw new Error(
            `${country}: the local file ${file} hashes to ${actual} but Geofabrik publishes ${published} — refusing to file from an unverified extract`,
          );
        progress.stage(`extracting ${country}...`);
        const part = await extractAndMap(
          join(pbfDir, file),
          extractDataDate(file),
          workDir,
          EXTRACT_FLOORS[country],
          country,
          { progress },
        );
        present.push(country);
        perCountry.push(`${country} ${formatCount(part.elementsRead)}`);
        for (const row of part.rows) candidates.push(row);
      }
      if (present.length === 0) throw new Error(`no country extracts found in ${pbfDir}`);
      national = present.length === COUNTRIES.length;
      goldenScope = new Set(present);
      if (!national)
        console.log(
          `load-osm-places · partial local run over ${present.join(", ")} only — national sanity skipped`,
        );
    } else {
      national = true;
      for (const country of COUNTRIES) {
        const latestUrl = `${GEOFABRIK_BASE}/${country}/${country}-latest.osm.pbf`;
        const dest = join(workDir, `${country}.osm.pbf`);
        let dataDate;
        let published;
        try {
          progress.stage(`downloading the ${country} extract from Geofabrik...`);
          // BUG-385: the HEAD read retries inside
          // fetchResponse; the old failure wording is kept.
          let head;
          try {
            head = await fetchResponse(latestUrl, `${country} extract HEAD`, {
              init: { method: "HEAD" },
            });
          } catch (err) {
            if (typeof err.status === "number")
              throw new Error(`${country}: HEAD ${latestUrl} returned HTTP ${err.status}`);
            throw err;
          }
          dataDate = extractDataDate(head.url);
          published = parsePublishedMd5(await fetchText(`${latestUrl}.md5`, `${country} md5`));
          // BUG-387: the download + md5 verify, with one
          // re-download when the first download fails its
          // hash (see downloadAndVerifyExtract); a partial
          // file is always discarded, and the md5 remains
          // the only acceptance test.
          await downloadAndVerifyExtract(country, latestUrl, dest, published, { progress });
        } catch (err) {
          progress.failed({
            stage: `download ${country}`,
            filed: 0,
            error: err,
            resume: "re-run from scratch (extracts re-download)",
          });
          throw err;
        }
        progress.stage(`extracting ${country}...`);
        const part = await extractAndMap(
          dest,
          dataDate,
          workDir,
          EXTRACT_FLOORS[country],
          country,
          { progress },
        );
        perCountry.push(`${country} ${formatCount(part.elementsRead)}`);
        for (const row of part.rows) candidates.push(row);
      }
    }

    const { rows, droppedElements, droppedDuplicates } = dedupePlaces(candidates);
    const sanity = sanityChecks(rows, { national });
    if (sanity.length > 0) throw new Error(`national sanity failed: ${sanity.join("; ")}`);
    const golden = goldenChecks(rows, goldenScope);
    if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);

    const byType = PLACE_TYPES.map(
      (t) => `${t} ${formatCount(rows.filter((r) => r.placeType === t).length)}`,
    ).join(" · ");
    if (verifyOnly) {
      console.log(
        `load-osm-places · ${perCountry.join(" · ")} — would file ${formatCount(rows.length)} places (${byType}; ${formatCount(droppedElements)} repeat elements and ${formatCount(droppedDuplicates)} duplicate places dropped) — golden homes OK (verify-only: nothing filed)`,
      );
      return;
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      progress.stage(`filing ${formatCount(rows.length)} places...`);
      await filePlaces(pool, rows, `${retrievedOn}T00:00:00Z`, { progress, restart });
    } finally {
      await pool.end();
    }
    console.log(
      `load-osm-places · ${formatCount(rows.length)} places filed (${byType}; ${formatCount(droppedElements)} repeat elements and ${formatCount(droppedDuplicates)} duplicate places dropped) — golden homes OK`,
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// Run only as a script (run-loaders / npm), never on import —
// the tests import the pure helpers above.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(`load-osm-places FAILED: ${err.message}`);
    process.exit(1);
  });
}
