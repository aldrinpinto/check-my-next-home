// EV chargers loader — Open Charge Map (plan step M5.7).
//
// Files public EV charging SITES into ev_points from Open
// Charge Map (OCM), one of the runner's quarterly loaders.
//
// The source (prep + gap reports, 13 Nov 2026): the step was
// written against the National Chargepoint Registry, which
// the government decommissioned on 28 November 2024 — domain
// dead, guidance withdrawn, no successor registry. Zapmap is
// the de facto national database but sells access, breaking
// the £0 rule; OpenStreetMap alone was measured WRONG at the
// Birkdale golden home (zero chargers within 2 mi where real
// ones stand at 1.87/1.93 mi). The founder ruled Open Charge
// Map — the only free national point-level aggregator, and
// the only candidate with an explicit usage vocabulary.
// Per-record data-provider attribution rides in every row's
// detail: 42% of OCM's GB data is the dead registry's own
// December 2023 import, and the attribution is what keeps
// that honest rather than decorative.
//
// Access — what files (gap L6, founder rulings 13 Nov 2026):
// only records whose usage class is EXPLICITLY public file:
// UsageType 1 "Public", 5 "Public - Pay At Location", and —
// under the founder's re-rule after the coverage gate —
// 4 "Public – Membership Required", filed WITH its class
// shown exactly as recorded, never silently upgraded to
// plain "public" (the gate measured that excluding it left
// Birkdale, a universal golden home, with no fileable site
// within 2 miles while a working public charger stands
// 1.866 mi away). Everything else stays out and is COUNTED
// per run, never silent: UsageType 7 "Public – Notice
// Required" (excluded — it requires notifying the owner
// before use, so it is not walk-up public), the private /
// restricted / staff-visitors-customers classes, the
// unknown class, and records whose usage is simply not
// recorded (silence is not consent — gap P2). Planned and
// Removed statuses are excluded and counted too (gap L7):
// they are not chargers a mover can use. Northern Ireland is
// out of scope (gap O3): the project is GB, so records in
// the NI box are excluded and counted, and every pull is
// scoped countrycode=GB.
//
// The unit of filing is the SITE, not the device (gap L4):
// records group before filing (same operator + same
// normalised title + representative points within 30 m —
// the M5.6 dedupe precedent), and device / connector counts
// file as facts about the site. A site's served access class
// is the MOST RESTRICTIVE class among its filed records
// (membership required > pay at location > public): one
// member's condition is never hidden by another's plain
// "public". The representative record (the member with the
// most connectors) gives the site its id, position, name,
// operator, status and provider.
//
// Status is a DATED RECORD, never a live fact (gap L7, the
// transport precedent): the representative record's status
// and its DateLastStatusUpdate file into detail, and no
// serving language may call it availability. Status is
// unrecorded on 37% of records and NumberOfPoints is often
// null — both are NORMAL states here, carried as NULL /
// derived counts, never contract failures.
//
// Names (gap P4): the recorded place title; when the source
// has none, operator + street/town as recorded; never an
// invented name. Speeds: the fastest published connector
// files as max_kw and the legacy charging_speed summary
// "up to X kW"; the full connector list (type + kW +
// quantity) rides in detail for the report's depth (gap P3:
// headline (ii), depth (i)). Where the source publishes no
// power at all, max_kw is NULL and no speed is shown — never
// an inferred one.
//
// The pull: bounding-box tiles over GB with ADAPTIVE
// subdivision — a tile that returns the result cap splits
// into quadrants and re-pulls, because the gate pull's South
// tile already ran at 87% of the cap and this is the
// fastest-growing dataset in the quarterly group (~13,281
// devices added nationally in 2025, DfT). Calls are
// sequential with a pause between them (OCM may ban
// excessive or duplicate queries). Only openly-licensed
// records are requested (opendata=true). Authentication is
// Key K17: when OPEN_CHARGE_MAP_API_KEY is set the loader
// calls the API directly with the X-API-Key header; in this
// sandbox the key lives in the Secure Vault, so the loader
// shells out to the custom.open-charge-map connector helper
// (OCM_HELPER_PATH overrides its location), which injects
// the credential through the surrogate exchange. The key
// value never appears in this file, the logs or a fixture.
//
// Golden checks (re-fixed from the gate capture of
// 13 Nov 2026 under the re-rule — the plan's old figures
// were the dead registry's and OSM's, and could not survive
// the source change, gap P1): Birkdale's nearest site is
// Witham Leisure Centre at 1.866 mi, a MEMBERSHIP REQUIRED
// site (Charge Your Car) — the anti-Birkdale anchor: any
// future source or filter change that loses it fails here.
// Exeter 0.277 mi with 183 sites within 2 mi; Epsom's
// nearest 0.580 (also membership class); Cardiff 0.168;
// Oxford 0.120; Hilgay honestly sparse — nothing within
// 2 mi, nearest 3.538. Distances are haversine miles on
// earth radius 3959, the basis every EV figure in the prep
// and the gate was fixed on.

import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { formatCount } from "./progress.mjs";

const { Pool } = pg;

export const HOMES = {
  birkdale: { label: "19 Birkdale Rise CM3 2JT", lat: 51.776176, lon: 0.60387 },
  exeter: { label: "6 Exeter Road E16 1GN", lat: 51.515224, lon: 0.021177 },
  epsom: { label: "Flat 4, Minerva House KT17 1FH", lat: 51.344571, lon: -0.247104 },
  ewell: { label: "Ewell Village KT17 1DR", lat: 51.350243, lon: -0.256581 },
  cityisland: { label: "London City Island E14 0BZ", lat: 51.511184, lon: 0.005102 },
  hilgay: { label: "Hilgay CB6 1EH", lat: 52.507481, lon: 0.33491 },
  cardiff: { label: "Cardiff CF11 8AA", lat: 51.467947, lon: -3.192837 },
  oxford: { label: "Oxford OX1 1HD", lat: 51.751268, lon: -1.264073 },
};

export const SOURCE_NAME = "Open Charge Map";
export const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";
export const API_BASE = "https://api.openchargemap.io/v3";

// The fileable usage classes (header): 1 Public, 4 Public -
// Membership Required (the re-rule), 5 Public - Pay At
// Location. Restrictiveness ranks decide a merged site's
// served class: the highest rank among its records wins.
export const FILEABLE_USAGE = new Map([
  [1, { title: "Public", rank: 1 }],
  [5, { title: "Public - Pay At Location", rank: 2 }],
  [4, { title: "Public - Membership Required", rank: 3 }],
]);

// Planned (150) and Removed (200, 210) — not chargers a
// mover can use (gap L7). Everything else with a recorded
// status files, including "Unknown" and the 37% whose status
// is not recorded at all.
export const EXCLUDED_STATUS = new Map([
  [150, "Planned"],
  [200, "Removed"],
  [210, "Removed"],
]);

// Northern Ireland scope box (gap O3): lat range, lon range.
export const NI_BOX = { latMin: 54.0, latMax: 55.35, lonMin: -8.3, lonMax: -5.35 };

// Sanity bands, set from the gate capture of 13 Nov 2026
// (measured beside each band) and deliberately wide: this
// dataset grows ~13k devices a year, so the bands exist to
// catch a broken feed or licence filter — a cliff, in either
// direction — not ordinary growth.
export const BANDS = {
  read: { min: 20000, max: 40000, measured: 27112 },
  filedPois: { min: 15000, max: 35000, measured: 25040 },
  sites: { min: 15000, max: 35000, measured: 24697 },
  membershipPois: { min: 5000, measured: 9618 },
};

// The pull's result cap per call — a tile returning this
// many records is assumed truncated and subdivides.
export const TILE_CAP = 20000;
export const TILE_MAX_DEPTH = 3;
// The gate pull's four GB tiles: (north, west), (south,
// east). Subdivision starts from these.
export const INITIAL_TILES = [
  { name: "scotland", north: 61.0, west: -8.5, south: 54.55, east: -0.5 },
  { name: "north", north: 54.65, west: -5.95, south: 52.8, east: 1.95 },
  { name: "midlands-wales", north: 52.85, west: -5.4, south: 51.9, east: 1.95 },
  { name: "south", north: 51.95, west: -5.75, south: 50.55, east: 1.95 },
];

// The retained gate capture's pull date — the fixture's
// source_date (the fixture IS that capture, trimmed; see the
// fixture README).
export const FIXTURE_PULL_DATE = "2026-11-13";

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Title normalisation for the grouping key — the gate
// analysis's rule (diacritics folded, punctuation collapsed),
// matching the M5.6 places precedent.
export function normaliseTitle(title) {
  if (!title) return "";
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inNi(lat, lon) {
  return (
    lat >= NI_BOX.latMin && lat <= NI_BOX.latMax && lon >= NI_BOX.lonMin && lon <= NI_BOX.lonMax
  );
}

const recordedTitle = (obj) => {
  const title = obj?.Title;
  return typeof title === "string" && title.trim() !== "" ? title.trim() : null;
};

// Apply the filing rules to raw POI records. Pure, so the
// tests hold every arm. Returns the usable records and the
// run's exclusion counts — every record read is accounted
// for exactly once: read = filed + noPosition + ni +
// statusExcluded + usageExcluded (the bands and the log
// line reconcile on that identity).
export function classifyPois(pois) {
  const counts = {
    read: pois.length,
    noPosition: 0,
    northernIreland: 0,
    statusExcluded: 0,
    statusExcludedByClass: {},
    usageExcluded: 0,
    usageExcludedByClass: {},
    filedPois: 0,
    membershipPois: 0,
  };
  const usable = [];
  for (const poi of pois) {
    const ai = poi?.AddressInfo ?? {};
    const lat = ai.Latitude;
    const lon = ai.Longitude;
    if (typeof lat !== "number" || typeof lon !== "number") {
      counts.noPosition++;
      continue;
    }
    if (inNi(lat, lon)) {
      counts.northernIreland++;
      continue;
    }
    const statusId = poi.StatusTypeID ?? null;
    if (statusId !== null && EXCLUDED_STATUS.has(statusId)) {
      const label = EXCLUDED_STATUS.get(statusId);
      counts.statusExcluded++;
      counts.statusExcludedByClass[label] = (counts.statusExcludedByClass[label] ?? 0) + 1;
      continue;
    }
    const usageId = poi.UsageTypeID ?? null;
    if (usageId === null || !FILEABLE_USAGE.has(usageId)) {
      const label =
        usageId === null
          ? "usage not recorded"
          : (recordedTitle(poi.UsageType) ?? `usage class ${usageId}`);
      counts.usageExcluded++;
      counts.usageExcludedByClass[label] = (counts.usageExcludedByClass[label] ?? 0) + 1;
      continue;
    }
    if (usageId === 4) counts.membershipPois++;
    counts.filedPois++;
    usable.push(poi);
  }
  return { usable, counts };
}

// One POI's device count: the recorded NumberOfPoints when
// it is a positive number; otherwise the record still IS a
// charge point, so its connector count, at least one —
// "not recorded" derives a floor, never a zero and never a
// contract failure.
export function poiDevices(poi) {
  const recorded = poi.NumberOfPoints;
  if (typeof recorded === "number" && recorded > 0) return recorded;
  return Math.max((poi.Connections ?? []).length, 1);
}

// Merge a site's member connections into the filed
// connector list: keyed by (type title, power), quantities
// summed (an unrecorded quantity counts as one connector —
// the connection exists). Sorted fastest first, then by
// type name, so the detail reads in the order a mover scans.
export function mergeConnectors(members) {
  const byKey = new Map();
  for (const poi of members) {
    for (const conn of poi.Connections ?? []) {
      const type = recordedTitle(conn.ConnectionType) ?? "Connection type not recorded";
      const kw = typeof conn.PowerKW === "number" && conn.PowerKW > 0 ? conn.PowerKW : null;
      const key = `${type}|${kw ?? ""}`;
      const qty = typeof conn.Quantity === "number" && conn.Quantity > 0 ? conn.Quantity : 1;
      const existing = byKey.get(key);
      if (existing) existing.quantity += qty;
      else byKey.set(key, { type, kw, quantity: qty });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => (b.kw ?? -1) - (a.kw ?? -1) || a.type.localeCompare(b.type),
  );
}

function formatKw(kw) {
  return Number.isInteger(kw) ? String(kw) : String(Math.round(kw * 10) / 10);
}

// Group the usable records into sites and derive every filed
// fact. Pure — the tests and the golden checks run on this.
export function groupSites(usable) {
  // Union-find over a ~100 m grid, as the gate analysis ran
  // it: same operator + same normalised title + points
  // within 30 m cluster; an unnamed record never
  // name-clusters (the M5.6 rule — a name alone is the only
  // clustering evidence there is).
  const parent = usable.map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const grid = new Map();
  usable.forEach((poi, i) => {
    const ai = poi.AddressInfo;
    const title = normaliseTitle(ai.Title);
    if (title === "") return;
    const key = `${poi.OperatorID ?? ""}|${title}`;
    const cell = `${Math.round(ai.Latitude / 0.001)},${Math.round(ai.Longitude / 0.001)}`;
    const [cx, cy] = cell.split(",").map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const other = usable[j];
          if (`${other.OperatorID ?? ""}|${normaliseTitle(other.AddressInfo.Title)}` !== key)
            continue;
          if (
            haversineMiles(
              ai.Latitude,
              ai.Longitude,
              other.AddressInfo.Latitude,
              other.AddressInfo.Longitude,
            ) <=
            30 / 1609.344
          )
            union(i, j);
        }
      }
    }
    if (!grid.has(cell)) grid.set(cell, []);
    grid.get(cell).push(i);
  });
  const clusters = new Map();
  usable.forEach((poi, i) => {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(poi);
  });

  const sites = [];
  for (const members of clusters.values()) {
    // The representative: most connectors, then lowest id —
    // deterministic across runs and pulls.
    const rep = [...members].sort(
      (a, b) =>
        (b.Connections ?? []).length - (a.Connections ?? []).length || (a.ID ?? 0) - (b.ID ?? 0),
    )[0];
    const ai = rep.AddressInfo;
    const operator = recordedTitle(rep.OperatorInfo);
    // The served access class: the most restrictive recorded
    // class among the members (header), with every recorded
    // class kept in the detail.
    const usageTitles = [
      ...new Set(members.map((m) => recordedTitle(m.UsageType)).filter(Boolean)),
    ];
    let usageType = recordedTitle(rep.UsageType);
    let bestRank = -1;
    for (const m of members) {
      const rank = FILEABLE_USAGE.get(m.UsageTypeID)?.rank ?? -1;
      if (rank > bestRank) {
        bestRank = rank;
        usageType = recordedTitle(m.UsageType) ?? usageType;
      }
    }
    const connectors = mergeConnectors(members);
    const powers = connectors.map((c) => c.kw).filter((kw) => kw !== null);
    const maxKw = powers.length > 0 ? Math.max(...powers) : null;
    const providers = [
      ...new Set(members.map((m) => recordedTitle(m.DataProvider)).filter(Boolean)),
    ];
    const devices = members.reduce((sum, m) => sum + poiDevices(m), 0);
    const title = typeof ai.Title === "string" && ai.Title.trim() !== "" ? ai.Title.trim() : null;
    const street = ai.AddressLine1?.trim() || ai.Town?.trim() || null;
    const name = title ?? (operator ? (street ? `${operator} — ${street}` : operator) : street);
    sites.push({
      registryId: String(rep.ID),
      name,
      lat: ai.Latitude,
      lon: ai.Longitude,
      operator,
      connectorTypes:
        connectors.length > 0 ? [...new Set(connectors.map((c) => c.type))].join(", ") : null,
      chargingSpeed: maxKw !== null ? `up to ${formatKw(maxKw)} kW` : null,
      detail: {
        usage_type: usageType,
        usage_types: usageTitles,
        status: recordedTitle(rep.StatusType),
        status_date:
          typeof rep.DateLastStatusUpdate === "string" && rep.DateLastStatusUpdate.length >= 10
            ? rep.DateLastStatusUpdate.slice(0, 10)
            : null,
        data_provider: recordedTitle(rep.DataProvider),
        data_providers: providers,
        devices,
        pois_merged: members.length,
        connectors: connectors.map((c) => ({ type: c.type, kw: c.kw, quantity: c.quantity })),
        max_kw: maxKw,
        address: {
          line1: ai.AddressLine1?.trim() || null,
          line2: ai.AddressLine2?.trim() || null,
          town: ai.Town?.trim() || null,
          postcode: ai.Postcode?.trim() || null,
        },
      },
    });
  }
  return sites.sort((a, b) => Number(a.registryId) - Number(b.registryId));
}

// Parse + classify + group a raw POI array into filing rows
// plus the run counts. The one path every mode takes.
export function buildSites(pois) {
  const { usable, counts } = classifyPois(pois);
  const sites = groupSites(usable);
  return {
    sites,
    counts: { ...counts, sites: sites.length, merged: counts.filedPois - sites.length },
  };
}

// Golden checks over the grouped sites + the run counts.
// The fixture is a windowed cut of the same capture, so the
// per-home figures reproduce there exactly; the national
// bands apply to full pulls only.
export function goldenChecks(sites, counts, { full }) {
  const failures = [];
  const nearest = (home) => {
    let best = null;
    for (const site of sites) {
      const d = haversineMiles(home.lat, home.lon, site.lat, site.lon);
      if (best === null || d < best.d) best = { site, d };
    }
    return best;
  };
  const within2 = (home) =>
    sites.filter((s) => haversineMiles(home.lat, home.lon, s.lat, s.lon) <= 2.0).length;
  const expectNearest = (key, name, miles, tol = 0.02) => {
    const best = nearest(HOMES[key]);
    if (!best || Math.abs(best.d - miles) > tol || (name !== null && best.site.name !== name))
      failures.push(
        `${HOMES[key].label}: nearest charging site is ${best ? `"${best.site.name}" at ${best.d.toFixed(3)} mi` : "missing"}, expected ${name ? `"${name}" at ` : ""}${miles} ± ${tol}`,
      );
    return best;
  };
  // Birkdale — the anti-Birkdale anchor (header): the
  // membership-required leisure centre files, under its
  // recorded class, and it is the ONLY site within 2 miles.
  {
    const best = expectNearest("birkdale", "Witham Leisure Centre", 1.866);
    if (best && best.site.detail.usage_type !== "Public - Membership Required")
      failures.push(
        `Birkdale: Witham Leisure Centre filed under usage class "${best.site.detail.usage_type}", expected "Public - Membership Required" as recorded (the re-rule shows the class, never upgrades it)`,
      );
    if (best && best.site.operator !== "Charge Your Car")
      failures.push(
        `Birkdale: Witham Leisure Centre operator is "${best.site.operator}", expected "Charge Your Car"`,
      );
    const n = within2(HOMES.birkdale);
    if (n !== 1)
      failures.push(
        `Birkdale: ${n} charging sites within 2 mi, expected exactly 1 (the leisure centre)`,
      );
  }
  // Exeter — dense urban: nearest 0.277 and 183 sites
  // within 2 miles under the re-rule.
  expectNearest("exeter", null, 0.277);
  {
    const n = within2(HOMES.exeter);
    if (n !== 183) failures.push(`Exeter: ${n} charging sites within 2 mi, expected 183`);
  }
  // Epsom — nearest is also membership class (a POD Point
  // site at a car dealership, as recorded).
  {
    const best = expectNearest("epsom", "Wilsons of Epsom Nissan", 0.58);
    if (best && best.site.detail.usage_type !== "Public - Membership Required")
      failures.push(
        `Epsom: nearest site filed under usage class "${best.site.detail.usage_type}", expected "Public - Membership Required" as recorded`,
      );
  }
  expectNearest("cardiff", null, 0.168);
  expectNearest("oxford", null, 0.12);
  expectNearest("ewell", null, 0.504);
  expectNearest("cityisland", null, 0.312);
  // Hilgay — the honest rural sparse: nothing within
  // 2 miles, and the nearest site is the membership-class
  // farm-stay charger at 3.538 (corroborated near-empty,
  // never padded).
  {
    const n = within2(HOMES.hilgay);
    if (n !== 0) failures.push(`Hilgay: ${n} charging sites within 2 mi, expected 0`);
    expectNearest("hilgay", null, 3.538, 0.05);
  }
  if (full) {
    for (const key of ["read", "filedPois", "sites"]) {
      const band = BANDS[key];
      if (counts[key] < band.min || counts[key] > band.max)
        failures.push(
          `national ${key} is ${counts[key]}, outside the sanity band ${band.min}–${band.max} (measured ${band.measured} on the 13 Nov 2026 gate capture — a cliff means a broken feed or licence filter, not growth)`,
        );
    }
    if (counts.membershipPois < BANDS.membershipPois.min)
      failures.push(
        `only ${counts.membershipPois} membership-required records filed, expected at least ${BANDS.membershipPois.min} (measured ${BANDS.membershipPois.measured}) — the re-rule class silently stopped filing, which is the Birkdale failure returning`,
      );
    if (counts.usageExcluded === 0)
      failures.push(
        "no records were excluded by access class — the explicit-public filter is not visibly working",
      );
  }
  return failures;
}

// Stage-table swap — the house pattern (see load-os-greenspace).
export async function fileEvPoints(pool, sites, sourceDate, retrievedAt) {
  const client = await pool.connect();
  try {
    // BEGIN first — the other M5 loaders' shape, and load-
    // bearing: the stage table is ON COMMIT DROP, and outside
    // a transaction each statement is its own commit, so a
    // stage created before BEGIN is dropped again by the end
    // of its own CREATE statement and the first staged insert
    // fails with "relation ev_stage does not exist". That is
    // exactly what CI runs 101 and 102's database jobs hit —
    // the first real calls of this function anywhere, the
    // sandbox proofs having all been verify-only. This filer
    // was written before the M5.6 fix rounds and copied the
    // then-buggy shape.
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE ev_stage (
      registry_id text, name text, lat double precision, lon double precision,
      operator text, connector_types text, charging_speed text, detail jsonb,
      source_name text, source_date date
    ) ON COMMIT DROP`);
    const values = [];
    const params = [];
    const flush = async () => {
      if (values.length === 0) return;
      await client.query(
        `INSERT INTO ev_stage (registry_id, name, lat, lon, operator, connector_types, charging_speed, detail, source_name, source_date) VALUES ${values.join(", ")}`,
        params,
      );
      values.length = 0;
      params.length = 0;
    };
    for (const site of sites) {
      const base = params.length;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::jsonb, $${base + 9}, $${base + 10})`,
      );
      params.push(
        site.registryId,
        site.name,
        site.lat,
        site.lon,
        site.operator,
        site.connectorTypes,
        site.chargingSpeed,
        JSON.stringify(site.detail),
        SOURCE_NAME,
        sourceDate,
      );
      if (values.length >= 500) await flush();
    }
    await flush();
    await client.query("DELETE FROM ev_points");
    await client.query(
      `INSERT INTO ev_points (registry_id, name, latitude, longitude, connector_types, charging_speed, operator, detail, source_name, source_date, loaded_at)
       SELECT registry_id, name, lat, lon, connector_types, charging_speed, operator, detail, source_name, source_date, $1 FROM ev_stage`,
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

// --- API access ---------------------------------------------------
//
// Two routes to the same call (header): the env key directly,
// or the connector helper, which receives the vault-held key
// through the surrogate exchange. Both send the project's
// User-Agent. The helper's stdout can be tens of megabytes,
// so it is captured to a temp file, never a pipe buffer.

export function helperPath() {
  return (
    process.env.OCM_HELPER_PATH ??
    join(homedir(), "workspace/custom-connectors/custom.open-charge-map/bin/ocm.py")
  );
}

export function callOcmViaHelper(path, params, workDir) {
  return new Promise((resolve, reject) => {
    const outPath = join(workDir, `ocm-${Math.random().toString(36).slice(2)}.json`);
    const args = [helperPath(), path];
    for (const [k, v] of Object.entries(params)) args.push(`--${k}`, String(v));
    const out = createWriteStream(outPath);
    // spawn, not execFile: execFile buffers the child's
    // stdout against maxBuffer even without a callback, and
    // a tile response is tens of megabytes — the child was
    // killed at the buffer limit on the first live run. The
    // stream goes straight to a file; the timeout is manual.
    const child = spawn("python3", args);
    const timer = setTimeout(() => child.kill("SIGKILL"), 600_000);
    child.stdout.pipe(out);
    let stderr = "";
    child.stderr.on("data", (c) => {
      stderr = (stderr + c).slice(-2000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      out.end(() => {
        if (code !== 0)
          return reject(
            new Error(`Open Charge Map helper failed (${code}): ${stderr.slice(-400)}`),
          );
        try {
          resolve(JSON.parse(readFileSync(outPath, "utf8")));
        } catch (err) {
          reject(new Error(`Open Charge Map helper returned unparseable JSON: ${err.message}`));
        }
      });
    });
  });
}

async function callOcmDirect(path, params) {
  const url = new URL(`${API_BASE}/${path}/`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      "X-API-Key": process.env.OPEN_CHARGE_MAP_API_KEY,
    },
  });
  if (!res.ok)
    throw new Error(
      `Open Charge Map ${path} returned HTTP ${res.status} — with the key sent as the X-API-Key header (a 403 means the credential did not reach the API or is not accepted)`,
    );
  return res.json();
}

export async function callOcm(path, params, workDir) {
  const attempt = () => {
    if (process.env.OPEN_CHARGE_MAP_API_KEY) return callOcmDirect(path, params);
    if (!existsSync(helperPath()))
      throw new Error(
        "no Open Charge Map credential route: OPEN_CHARGE_MAP_API_KEY is not set and the connector helper was not found (Key K17 lives in the Secure Vault — see .env.example)",
      );
    return callOcmViaHelper(path, params, workDir);
  };
  // One retry on a transient failure — the house habit
  // (the Greenspace download and the canary both retry
  // once); a credential refusal fails twice and surfaces.
  try {
    return await attempt();
  } catch {
    await new Promise((r) => setTimeout(r, 3000));
    return attempt();
  }
}

// Pull one bounding-box tile; subdivide adaptively when the
// tile comes back at the result cap (assumed truncated).
// Returns the tile's records plus the pull statistics the
// log line reports.
async function pullTile(tile, depth, workDir, stats) {
  const bbox = `(${tile.north},${tile.west}),(${tile.south},${tile.east})`;
  const pois = await callOcm(
    "poi",
    { boundingbox: bbox, countrycode: "GB", opendata: "true", maxresults: TILE_CAP },
    workDir,
  );
  if (!Array.isArray(pois))
    throw new Error(`Open Charge Map poi returned a non-array for tile ${tile.name ?? bbox}`);
  stats.calls++;
  if (pois.length >= TILE_CAP) {
    if (depth >= TILE_MAX_DEPTH)
      throw new Error(
        `tile ${bbox} still returns the ${TILE_CAP}-result cap at subdivision depth ${depth} — refusing to file a truncated pull`,
      );
    stats.subdivisions++;
    const midLat = (tile.north + tile.south) / 2;
    const midLon = (tile.west + tile.east) / 2;
    const quads = [
      { north: tile.north, west: tile.west, south: midLat, east: midLon },
      { north: tile.north, west: midLon, south: midLat, east: tile.east },
      { north: midLat, west: tile.west, south: tile.south, east: midLon },
      { north: midLat, west: midLon, south: tile.south, east: tile.east },
    ];
    const merged = [];
    for (const quad of quads) {
      await new Promise((r) => setTimeout(r, 1500));
      merged.push(...(await pullTile(quad, depth + 1, workDir, stats)));
    }
    return merged;
  }
  return pois;
}

// The full GB pull: the four initial tiles, merged by POI
// id (tiles overlap at their edges by design).
export async function pullGb(workDir) {
  const stats = { calls: 0, subdivisions: 0 };
  const merged = new Map();
  for (const tile of INITIAL_TILES) {
    const pois = await pullTile(tile, 0, workDir, stats);
    for (const poi of pois) if (poi?.ID != null) merged.set(poi.ID, poi);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { pois: [...merged.values()], stats };
}

// Read a captured POI array: a .json file directly, or a
// directory holding ocm-pois.json (the fixture layout).
export function readPoisFile(path) {
  const file = path.endsWith(".json") ? path : join(path, "ocm-pois.json");
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${file} does not hold a POI array`);
  return parsed;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function summaryLine(counts, filed) {
  const excluded = [];
  const byClass = (obj) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${formatCount(v)} ${k}`)
      .join(", ");
  if (counts.usageExcluded > 0)
    excluded.push(
      `${formatCount(counts.usageExcluded)} by access class (${byClass(counts.usageExcludedByClass)})`,
    );
  if (counts.statusExcluded > 0)
    excluded.push(
      `${formatCount(counts.statusExcluded)} planned or removed (${byClass(counts.statusExcludedByClass)})`,
    );
  if (counts.northernIreland > 0)
    excluded.push(`${formatCount(counts.northernIreland)} in Northern Ireland`);
  if (counts.noPosition > 0) excluded.push(`${formatCount(counts.noPosition)} with no position`);
  return (
    `${formatCount(counts.sites)} charging sites ${filed ? "filed" : "would file"} ` +
    `(${formatCount(counts.filedPois)} chargers recorded at them, ${formatCount(counts.merged)} records grouped into their site; ` +
    `read ${formatCount(counts.read)}${excluded.length > 0 ? ` · excluded ${excluded.join(" · ")}` : ""})`
  );
}

const DEFAULT_FIXTURE_DIR = fileURLToPath(
  new URL("../../tests/fixtures/ev-chargers/", import.meta.url),
);

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const fixtureMode = args.includes("--fixture") || fileArg !== null;
  const verifyOnly = args.includes("--verify-only");
  const retrievedOn = todayDate();
  const workDir = mkdtempSync(join(tmpdir(), "cmnh-ev-"));
  try {
    let pois;
    let sourceDate;
    let full = true;
    if (fixtureMode) {
      pois = readPoisFile(fileArg ?? DEFAULT_FIXTURE_DIR);
      sourceDate = FIXTURE_PULL_DATE;
      full = false;
    } else {
      // Credential smoke first: referencedata answering is
      // what proves the key reached the API (the canary
      // probes the same arm monthly).
      await callOcm("referencedata", {}, workDir);
      const pull = await pullGb(workDir);
      pois = pull.pois;
      sourceDate = retrievedOn;
    }
    const { sites, counts } = buildSites(pois);
    const golden = goldenChecks(sites, counts, { full });
    if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);
    if (verifyOnly) {
      console.log(
        `load-ev-chargers · ${summaryLine(counts, false)} — golden homes OK (verify-only: nothing filed)`,
      );
      return;
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await fileEvPoints(pool, sites, sourceDate, `${retrievedOn}T00:00:00Z`);
    } finally {
      await pool.end();
    }
    console.log(`load-ev-chargers · ${summaryLine(counts, true)} — golden homes OK`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// Run only as a script (run-loaders / npm), never on import.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(`load-ev-chargers FAILED: ${err.message}`);
    process.exit(1);
  });
}
