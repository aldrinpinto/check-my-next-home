// Brownfield land loader (plan step M6.21, decision D41).
// Files the recorded brownfield sites from the platform's
// unified national dataset, following the M6.21 prep:
//
//   npm run load:brownfield
//   npm run load:brownfield -- --verify-only
//   npm run load:brownfield -- --file tests/fixtures/brownfield
//
// What the prep settled, and where it lives in this file:
//   - The dataset is POINTS only — a representative point per
//     recorded site, no site boundary — so sites file as
//     points and serve in the listed-building points shape
//     (nearest sites plus the count within 2 miles, D22
//     basis). Nothing filed here can support a "this plot
//     is / is not on the register" claim, and nothing is
//     shaped to.
//   - Absence is GATED on supply, the Article 4 pattern: the
//     supplier gate (brownfield_publishers) files in the
//     same run from the same file — one row per organisation
//     entity with at least one current site. A council that
//     supplies nothing has published nothing an absence
//     could rest on.
//   - The register's free-text notes are NEVER filed: they
//     are unstructured council prose, and nothing
//     unstructured reaches a reader. The site-plan URL files
//     but never serves (the brain's read port does not carry
//     it). Served per site: the address label, the distance,
//     hectares, the register's own planning-permission
//     status, and the published minimum/maximum net
//     dwellings — all exactly as published.
//   - The same physical site is sometimes recorded twice:
//     republished under a second reference by the same
//     council (Epsom's Etwell House, references "1" and
//     "194", identical in every other field), or published
//     by two organisations (45 Beckton Road, by Newham and
//     by the Greater London Authority's entity). After the
//     republication dedupe (reference + organisation,
//     newest entry kept), rows sharing a point to four
//     decimal places (about 11 metres — the Beckton pair's
//     points differ in the sixth decimal) and a normalised
//     site address collapse to the newest entry, counted.
//     One recorded site serves once.
//   - Ended rows (the site left the register) are excluded
//     and counted; current rows with no published point are
//     counted, never placed at a guessed position.
//
// Source: planning.data.gov.uk bulk CSV (files host), built
// from councils' own brownfield registers, Open Government
// Licence v3.0. The file carries no edition date, so the
// source date is the platform retrieval date. Distances are
// haversine miles on the published points, earth radius
// 3956 (the D22 basis).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

const FILE_URL = "https://files.planning.data.gov.uk/dataset/brownfield-land.csv";
const SOURCE_BROWNFIELD = "planning.data.gov.uk — brownfield land (Open Government Licence v3.0)";

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};
// The platform's organisation entities for the golden homes'
// councils (the bulk files publish numbers only): Braintree
// District Council, the London Borough of Newham, Epsom and
// Ewell Borough Council.
const ORG_BRAINTREE = "56";
const ORG_NEWHAM = "246";
const ORG_EPSOM_EWELL = "129";

// One CSV parser, quote-aware and header-keyed (the house copy).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const push = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    push();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") push();
    else if (ch === "\n") endRow();
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) endRow();
  const header = rows[0].map((h) => h.replace(/^﻿/, "").trim());
  return rows
    .slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function haversineMiles(aLat, aLng, bLat, bLng) {
  const R = 3956;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function parsePoint(text) {
  const s = (text ?? "").trim();
  if (!s.startsWith("POINT")) return null;
  const inner = s.slice(s.indexOf("(") + 1, s.lastIndexOf(")"));
  const parts = inner.replace(",", " ").split(/\s+/).filter(Boolean).map(Number);
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
  return { lng: parts[0], lat: parts[1] };
}

function numberOrNull(text) {
  const value = Number((text ?? "").trim());
  return (text ?? "").trim() !== "" && Number.isFinite(value) ? value : null;
}

function integerOrNull(text) {
  const s = (text ?? "").trim();
  return /^-?\d+$/.test(s) ? Number(s) : null;
}

// The site-collapse key's address half: the brain's matching
// normal form (upper case, punctuation becomes spaces).
function normAddress(text) {
  return (text ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const CONSUMED = [
  "entity",
  "reference",
  "organisation-entity",
  "end-date",
  "entry-date",
  "point",
  "site-address",
  "hectares",
  "planning-permission-status",
  "minimum-net-dwellings",
  "maximum-net-dwellings",
  "site-plan-url",
];

// Current sites only: ended excluded and counted; point-less
// current rows counted, never placed; republications deduped
// on (reference, organisation); the same site recorded twice
// collapsed on (point to 4dp, normalised address) — the
// newest entry wins both times.
/**
 * @param {any[]} rows
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export function processSites(rows, { progress = null } = {}) {
  let ended = 0;
  let noPoint = 0;
  const placeable = [];
  // BUG-265: the scan is the run's first long loop — ~35,000
  // rows live — so a tally lands every 5,000 rows against the
  // file's own row count, and a closing line.
  const processTally = progress?.tally({
    label: "process",
    total: rows.length,
    every: 5000,
    unit: "rows",
  });
  let rowsSeen = 0;
  for (const row of rows) {
    rowsSeen += 1;
    processTally?.tick(rowsSeen);
    if ((row["end-date"] ?? "") !== "") {
      ended += 1;
      continue;
    }
    const point = parsePoint(row.point ?? "");
    if (!point) {
      noPoint += 1;
      continue;
    }
    placeable.push({ row, lat: point.lat, lng: point.lng });
  }
  processTally?.finish(rows.length);
  const byKey = new Map();
  let duplicates = 0;
  for (const item of placeable) {
    const reference = (item.row.reference ?? "").trim();
    const key = reference
      ? `${reference}|${item.row["organisation-entity"] ?? ""}`
      : `entity-${item.row.entity}`;
    const prev = byKey.get(key);
    if (prev) {
      duplicates += 1;
      if ((item.row["entry-date"] ?? "") <= (prev.row["entry-date"] ?? "")) continue;
    }
    byKey.set(key, item);
  }
  const bySite = new Map();
  let siteDuplicates = 0;
  for (const item of byKey.values()) {
    const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}|${normAddress(item.row["site-address"])}`;
    const prev = bySite.get(key);
    if (prev) {
      siteDuplicates += 1;
      if ((item.row["entry-date"] ?? "") <= (prev.row["entry-date"] ?? "")) continue;
    }
    bySite.set(key, item);
  }
  const filed = [...bySite.values()];
  const publishers = new Map();
  for (const item of filed) {
    const org = (item.row["organisation-entity"] ?? "").trim();
    if (org !== "") publishers.set(org, (publishers.get(org) ?? 0) + 1);
  }
  return {
    total: rows.length,
    ended,
    noPoint,
    current: rows.length - ended,
    filed,
    duplicates,
    siteDuplicates,
    publishers,
  };
}

function sitesWithin(filed, home, miles) {
  return filed
    .map((item) => ({ item, miles: haversineMiles(home.lat, home.lng, item.lat, item.lng) }))
    .filter((x) => x.miles <= miles)
    .sort((a, z) => a.miles - z.miles);
}

// The platform re-collects councils' registers continuously,
// so live goldens assert as FLOORS (at least this many sites,
// the nearest no farther than this) — the brief's rule. The
// fixture is a frozen cut of the same file, so fixture mode
// asserts the cut's exact counts.
function checkGolden(processed, fixtureMode) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  const { filed, publishers } = processed;

  for (const org of [ORG_BRAINTREE, ORG_NEWHAM, ORG_EPSOM_EWELL])
    expect(
      publishers.has(org),
      `the supplier gate must record organisation ${org} — the golden councils supply the dataset`,
    );

  const birkdale = sitesWithin(filed, HOMES["CM3 2JT"], 2.0);
  expect(
    birkdale.length >= 1,
    "CM3 2JT: at least one current brownfield site must file within 2 miles",
  );
  expect(
    birkdale[0] &&
      birkdale[0].item.row.reference === "15/01103/OUT" &&
      Math.abs(birkdale[0].miles - 0.252) <= 0.02,
    `CM3 2JT: the nearest site should be Universal Garage (15/01103/OUT) at 0.252 mi, got ${
      birkdale[0]
        ? `${birkdale[0].item.row["site-address"]} at ${birkdale[0].miles.toFixed(3)} mi`
        : "none"
    }`,
  );
  const exeter = sitesWithin(filed, HOMES["E16 1GN"], 2.0);
  expect(exeter.length >= 2, "E16 1GN: at least two current sites must file within 2 miles");
  expect(
    exeter[0] && exeter[0].miles <= 0.3,
    `E16 1GN: the nearest site should be no farther than 0.3 mi, got ${exeter[0]?.miles.toFixed(3)}`,
  );
  const minerva = sitesWithin(filed, HOMES["KT17 1FH"], 2.0);
  expect(minerva.length >= 1, "KT17 1FH: at least one current site must file within 2 miles");
  expect(
    minerva[0] && Math.abs(minerva[0].miles - 0.227) <= 0.02,
    `KT17 1FH: the nearest site should be Etwell House at 0.227 mi, got ${minerva[0]?.miles.toFixed(3)}`,
  );

  if (fixtureMode) {
    expect(
      birkdale.length === 2 && exeter.length === 97 && minerva.length === 30,
      `fixture counts within 2 miles should be 2 / 97 / 30, got ${birkdale.length} / ${exeter.length} / ${minerva.length}`,
    );
    expect(
      filed.length === 334,
      `the fixture cut should file 334 sites after dedupe, got ${filed.length}`,
    );
  }
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;
  // BUG-265: one logger for the run — the process tally and
  // the staging tally below.
  const progress = createProgressLogger({ name: "load-brownfield" });

  let text;
  let sourceDate;
  let processed;
  try {
    progress.stage("reading the brownfield-land file");
    if (fixtureMode) {
      text = await readFile(join(fixtureDir, "brownfield-land.csv"), "utf8");
      sourceDate = JSON.parse(await readFile(join(fixtureDir, "fixture.json"), "utf8")).captured;
    } else {
      const response = await fetch(FILE_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status} for the brownfield-land download`);
      text = await response.text();
      sourceDate = new Date().toISOString().slice(0, 10);
    }

    const rows = parseCsv(text);
    if (rows.length === 0)
      throw new Error("contract failure: the brownfield-land file has no rows");
    for (const header of CONSUMED) {
      if (!(header in rows[0]))
        throw new Error(`contract failure: the brownfield-land file no longer carries "${header}"`);
    }
    // The notes column is consumed only to prove it is never
    // filed: its presence is expected, its content never read
    // into any filed or served shape.
    if (!("notes" in rows[0]))
      throw new Error('contract failure: the brownfield-land file no longer carries "notes"');

    processed = processSites(rows, { progress });
    if (!fixtureMode) {
      if (processed.current < 28000 || processed.current > 37000)
        throw new Error(
          `sanity failure: ${processed.current} current brownfield sites is outside the expected band`,
        );
      if (processed.publishers.size < 250 || processed.publishers.size > 340)
        throw new Error(
          `sanity failure: ${processed.publishers.size} supplying organisations is outside the expected band`,
        );
    }
    checkGolden(processed, fixtureMode);
  } catch (error) {
    // BUG-265: the read, the process and the golden checks all
    // fail before anything is filed.
    progress.failed({
      stage: "read",
      filed: 0,
      error,
      resume: "re-run the loader from the start (nothing is filed)",
    });
    throw error;
  }

  const summary = () =>
    `load-brownfield · planning.data.gov.uk file retrieved ${sourceDate} · ` +
    `${formatCount(processed.filed.length)} sites filed (${formatCount(processed.current)} current of ${formatCount(processed.total)} in file · ${formatCount(processed.ended)} ended excluded · ${formatCount(processed.noPoint)} without a point counted · ${formatCount(processed.duplicates)} duplicates dropped · ${formatCount(processed.siteDuplicates)} same-site records collapsed) · ` +
    `supplier gate: ${formatCount(processed.publishers.size)} organisations with current sites`;

  if (verifyOnly) {
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    return;
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not set — filing requires a database");

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    // Stage tables are spelled out rather than copied with
    // LIKE (M4.7's lesson). brownfield_sites' geom is a
    // generated column and is never inserted.
    await client.query(
      `CREATE TEMP TABLE brownfield_stage (
         reference text, organisation_entity text, site_address text,
         hectares double precision, planning_permission_status text,
         minimum_net_dwellings integer, maximum_net_dwellings integer,
         site_plan_url text, latitude double precision, longitude double precision,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now()
       ) ON COMMIT DROP`,
    );
    await client.query(
      `CREATE TEMP TABLE brownfield_gate_stage (
         organisation_entity text, current_sites integer,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now()
       ) ON COMMIT DROP`,
    );
    const CHUNK = 500;
    // BUG-265: the staging is the run's long loop — ~70 chunks
    // of 500 live — so a tally lands every 10 chunks against
    // the chunk count, a heartbeat every 10, and a chunk that
    // takes more than 3x the recent average earns a warning.
    // (The supplier-gate inserts that follow are the small tail
    // of the same filing, inside this same transaction.)
    progress.stage(`filing ${formatCount(processed.filed.length)} sites`);
    const chunks = Math.ceil(processed.filed.length / CHUNK);
    const stageTally = progress.tally({
      label: "stage",
      total: chunks,
      every: 10,
      unit: "chunks",
    });
    const stageWatch = createBatchWatch();
    let chunkIndex = 0;
    for (let at = 0; at < processed.filed.length; at += CHUNK) {
      const started = Date.now();
      const chunk = processed.filed.slice(at, at + CHUNK);
      const values = [];
      const params = [];
      chunk.forEach((item, i) => {
        const base = i * 12;
        values.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12})`,
        );
        params.push(
          item.row.reference || null,
          item.row["organisation-entity"] || null,
          item.row["site-address"] || null,
          numberOrNull(item.row.hectares),
          item.row["planning-permission-status"] || null,
          integerOrNull(item.row["minimum-net-dwellings"]),
          integerOrNull(item.row["maximum-net-dwellings"]),
          item.row["site-plan-url"] || null,
          item.lat,
          item.lng,
          SOURCE_BROWNFIELD,
          sourceDate,
        );
      });
      await client.query(
        `INSERT INTO brownfield_stage (reference, organisation_entity, site_address, hectares, planning_permission_status, minimum_net_dwellings, maximum_net_dwellings, site_plan_url, latitude, longitude, source_name, source_date)
         VALUES ${values.join(",")}`,
        params,
      );
      chunkIndex += 1;
      const { tookMs, averageMs, slow } = stageWatch.observe(Date.now() - started);
      stageTally.tick(chunkIndex);
      progress.heartbeat({ stage: "stage", done: chunkIndex, total: chunks });
      if (slow) {
        progress.warning({
          what: "stage chunk duration",
          value: `chunk ${chunkIndex} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
    }
    stageTally.finish(chunks);
    for (const [org, count] of processed.publishers) {
      await client.query(
        `INSERT INTO brownfield_gate_stage (organisation_entity, current_sites, source_name, source_date)
         VALUES ($1,$2,$3,$4)`,
        [org, count, SOURCE_BROWNFIELD, sourceDate],
      );
    }
    const staged = await client.query("SELECT count(*)::int AS n FROM brownfield_stage");
    if (staged.rows[0].n !== processed.filed.length)
      throw new Error("the staged site count does not match — rolling back");
    await client.query("DELETE FROM brownfield_sites");
    await client.query(
      `INSERT INTO brownfield_sites (reference, organisation_entity, site_address, hectares, planning_permission_status, minimum_net_dwellings, maximum_net_dwellings, site_plan_url, latitude, longitude, source_name, source_date, loaded_at)
       SELECT reference, organisation_entity, site_address, hectares, planning_permission_status, minimum_net_dwellings, maximum_net_dwellings, site_plan_url, latitude, longitude, source_name, source_date, loaded_at FROM brownfield_stage`,
    );
    await client.query("DELETE FROM brownfield_publishers");
    await client.query(
      `INSERT INTO brownfield_publishers (organisation_entity, current_sites, source_name, source_date, loaded_at)
       SELECT organisation_entity, current_sites, source_name, source_date, loaded_at FROM brownfield_gate_stage`,
    );
    const filedCount = await client.query("SELECT count(*)::int AS n FROM brownfield_sites");
    if (filedCount.rows[0].n !== processed.filed.length)
      throw new Error("the filed site count does not match — rolling back");
    const gateCount = await client.query("SELECT count(*)::int AS n FROM brownfield_publishers");
    if (gateCount.rows[0].n !== processed.publishers.size)
      throw new Error("the filed gate count does not match — rolling back");
    await client.query("COMMIT");
  } catch (error) {
    // BUG-265: the filing is one transaction — on a rollback
    // the live tables are untouched.
    progress.failed({
      stage: "filing",
      filed: 0,
      total: processed.filed.length,
      error,
      resume:
        "re-run the loader from the start (the filing rolled back, the live tables are untouched)",
    });
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

main().catch((error) => {
  console.error(`load-brownfield FAILED: ${error.message}`);
  process.exitCode = 1;
});
