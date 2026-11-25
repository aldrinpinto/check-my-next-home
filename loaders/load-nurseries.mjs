// Nurseries loader (plan step M5.17). Files the group childcare
// settings of Ofsted's childcare register into `nurseries` — the
// table has been in the schema since M4 with no loader until now,
// so lib/nearby.ts's nursery answers (M6.2) served only the
// register-empty wording. This loader files the real register so
// those answers carry real figures.
//
//   npm run load:nurseries
//   npm run load:nurseries -- --verify-only
//   npm run load:nurseries -- --file tests/fixtures/nurseries
//
// The source: Ofsted's "Childcare providers and inspections:
// management information" (GOV.UK statistical data set) — the
// "childcare provider data" CSV, one row per registered provider.
// Ofsted publishes it TWICE A YEAR, in January/February for data
// as at 31 December and in July/August for data as at 30 June, so
// the runner registers this loader in the QUARTERLY class (the
// OS Greenspace precedent — the other twice-a-year source): each
// new edition is discovered within one quarterly cycle, and a
// run that finds the same edition again re-files it harmlessly
// (the stage-swap below makes a re-file a no-op in effect). The
// file's own asset name carries its as-at date and changes every
// release, so it is discovered from the GOV.UK page on every run,
// never hard-coded (the schools loader's Ofsted pattern).
//
// What files, and what never does (decision D5 + the step's
// scope). The register's Provider type vocabulary, measured on
// the 30 June 2026 file (60,007 rows, every row Active):
//   - "Childcare on non-domestic premises" — group settings.
//     These file, by subtype: "Full day care" (day nurseries)
//     and "Sessional day care" (pre-schools and playgroups).
//     "Out-of-school day care" — breakfast, after-school and
//     holiday clubs for school-age children — does NOT file:
//     the category the brain serves is nurseries, and a
//     wraparound club is not one. The blank-subtype rows do not
//     file either: Ofsted publishes no provision type for them,
//     so filing them as nurseries would assert a type the
//     register does not state. Both classes are counted in the
//     log line, never silent.
//   - A setting files ONLY if it is on the Early Years
//     Register (the "Provider Early Years Register flag" is
//     "Y") — BUG-240, 24 Nov 2026. A setting caring for
//     children under five must be EYR-registered by law; a
//     group setting that is NOT on it is registered only
//     on the voluntary (or compulsory) childcare register
//     for activity, tutoring or holiday care — a maths
//     tutor, a stage school, a leisure-centre crèche —
//     not a nursery, and the brain's nurseries category
//     must not list it. The excluded class is counted in
//     the log line, never silent.
//   - "Childminder", "Home childcarer" and "Childminder without
//     domestic premises" NEVER file: childminders are not
//     included at all — Ofsted publishes no location for them
//     (names and postcodes REDACTED), so they can be neither
//     placed nor honestly counted near a home. Decision D5's
//     count-only position is superseded by the founder's
//     19 Nov 2026 ruling dropping childminders from the product.
//   - "Childcare on domestic premises" (group childminding
//     from a home) never files either: Ofsted publishes those
//     rows REDACTED too, so the register itself holds no
//     position for them, and a point is never placed at a guess.
// Every exclusion is counted in the log line by class.
//
// Position: no childcare source publishes coordinates, so each
// setting sits at its own postcode's position from the M4.1
// postcode directory (the health loader's convention). A setting
// whose postcode is not in the directory is NOT filed and is
// counted — never dropped silently, never placed at a guessed
// position. The loader takes no postcode arguments at all — it
// files the whole register — and refuses any argument it does
// not recognise, so an argument can never be silently dropped
// the way the per-postcode loaders' bare invocation drops one.
//
// Distances in the golden checks use the brain's own basis —
// haversine, earth radius 3,956 miles (lib/nearby.ts) — so the
// figures locked here are the figures the brain serves.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

const OFSTED_PAGE =
  "https://www.gov.uk/government/statistical-data-sets/childcare-providers-and-inspections-management-information";
const SOURCE_NAME = "Ofsted childcare register (management information)";

const GROUP_TYPE = "Childcare on non-domestic premises";
const FILED_SUBTYPES = new Set(["Full day care", "Sessional day care"]);
const CHILDMINDER_TYPES = new Set([
  "Childminder",
  "Home childcarer",
  "Childminder without domestic premises",
]);
const DOMESTIC_TYPE = "Childcare on domestic premises";

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};

// The golden facts, locked at this build (14 Nov 2026) from the
// first filed load of the register as at 30 June 2026: for each
// universal home, the nearest filed setting, the count within
// 2 miles of the postcode point, and the three nearest names in
// distance order — the exact shape lib/nearby.ts serves. The
// fixture block is the same facts on the fixture cut (real rows
// around the homes, captured from the same file).
const GOLDENS_LIVE = {
  "CM3 2JT": {
    nearest: "Shining Stars",
    nearestMiles: 0.11,
    countWithin: 5,
    top3: ["Shining Stars", "The Little Bears Nursery", "Gershwin Park Day Nursery School"],
  },
  "E16 1GN": {
    nearest: "Cribs Day Nursery",
    nearestMiles: 0.088,
    countWithin: 81,
    top3: ["Cribs Day Nursery", "Moksliukas", "Clever Cloggs Day Nursery"],
  },
  "KT17 1FH": {
    nearest: "Nestots Day Nursery",
    nearestMiles: 0.174,
    countWithin: 35,
    top3: ["Nestots Day Nursery", "Lynton House Day Nursery", "Little Nick Nursery and Pre-School"],
  },
};
const GOLDENS_FIXTURE = {
  "CM3 2JT": {
    nearest: "Shining Stars",
    nearestMiles: 0.11,
    countWithin: 5,
    top3: ["Shining Stars", "The Little Bears Nursery", "Gershwin Park Day Nursery School"],
  },
  "E16 1GN": {
    nearest: "Cribs Day Nursery",
    nearestMiles: 0.088,
    countWithin: 81,
    top3: ["Cribs Day Nursery", "Moksliukas", "Clever Cloggs Day Nursery"],
  },
  "KT17 1FH": {
    nearest: "Nestots Day Nursery",
    nearestMiles: 0.174,
    countWithin: 35,
    top3: ["Nestots Day Nursery", "Lynton House Day Nursery", "Little Nick Nursery and Pre-School"],
  },
};

function haversineMiles(aLat, aLng, bLat, bLng) {
  const R = 3956;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Quote-aware CSV parsing, header-keyed. The published file
// opens with two preamble rows (the release title, carrying the
// as-at date, and a worksheet note) before the header row, so
// the header is found by its "Provider URN" column rather than
// assumed at a fixed line.
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
  return rows;
}

const MONTHS = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12",
};
function longDate(day, monthName, year) {
  return MONTHS[monthName] ? `${year}-${MONTHS[monthName]}-${String(day).padStart(2, "0")}` : null;
}

function parseRegister(text) {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const headerAt = rows.findIndex((r) => r[1] === "Provider URN" && r[3] === "Provider type");
  if (headerAt === -1)
    throw new Error('contract failure: no header row carrying "Provider URN" found in the file');
  const title = rows.slice(0, headerAt).flat().join(" ");
  const asAtMatch = title.match(/as at (\d{1,2}) ([A-Za-z]+) (\d{4})/);
  const asAt = asAtMatch ? longDate(asAtMatch[1], asAtMatch[2], asAtMatch[3]) : null;
  if (!asAt)
    throw new Error("contract failure: the file's title row carries no readable as-at date");
  const header = rows[headerAt].map((h) => h.trim());
  const required = [
    "Provider URN",
    "Provider type",
    "Provider subtype",
    "Provider status",
    "Provider name",
    "Provider Early Years Register flag",
    "Provider address line 1",
    "Provider address line 2",
    "Provider address line 3",
    "Provider town",
    "Provider postcode",
  ];
  for (const name of required) {
    if (!header.includes(name))
      throw new Error(`contract failure: the register file no longer carries the "${name}" column`);
  }
  const records = rows
    .slice(headerAt + 1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { records, asAt };
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

async function discoverRegister() {
  const page = await fetchText(OFSTED_PAGE);
  const links = [
    ...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"']+\.csv/g),
  ].map((m) => m[0]);
  const candidates = [];
  for (const url of links) {
    if (!/childcare_providers_data_as_at/i.test(url)) continue;
    const m = url.match(/as_at_(\d{1,2})_([A-Za-z]+)_(\d{4})/);
    if (!m || !MONTHS[m[2]]) continue;
    candidates.push({ url, asAt: longDate(m[1], m[2], m[3]) });
  }
  candidates.sort((a, b) => (a.asAt < b.asAt ? 1 : -1));
  const newest = candidates[0];
  if (!newest)
    throw new Error("could not find a dated childcare provider data CSV on the Ofsted page");
  const ageDays = (Date.now() - new Date(`${newest.asAt}T00:00:00Z`).getTime()) / 86400000;
  if (ageDays > 300)
    throw new Error(
      `the newest provider data findable is as at ${newest.asAt} — too old to trust (the register publishes twice a year)`,
    );
  const text = await fetchText(newest.url);
  return { text, asAt: newest.asAt };
}

/**
 * @param {any[]} records
 * @param {(postcode: string) => { lat: number, lng: number } | null} positionOf
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export function buildSettings(records, positionOf, { progress = null } = {}) {
  const settings = [];
  const stats = {
    total: records.length,
    childminderTypes: 0,
    domesticPremises: 0,
    outOfSchool: 0,
    blankSubtype: 0,
    otherSubtype: 0,
    notOnEarlyYearsRegister: 0,
    notActive: 0,
    otherType: 0,
    duplicateUrns: 0,
    unresolvedPostcode: 0,
    unresolvedPostcodes: [],
  };
  const seen = new Set();
  // BUG-265: the scan is the run's first long loop — ~60,000
  // register rows live — so a tally lands every 5,000 rows
  // against the file's own row count, and a closing line.
  const buildTally = progress?.tally({
    label: "build",
    total: records.length,
    every: 5000,
    unit: "rows",
  });
  let recordsSeen = 0;
  for (const row of records) {
    recordsSeen += 1;
    buildTally?.tick(recordsSeen);
    const type = row["Provider type"];
    if (CHILDMINDER_TYPES.has(type)) {
      stats.childminderTypes += 1;
      continue;
    }
    if (type === DOMESTIC_TYPE) {
      stats.domesticPremises += 1;
      continue;
    }
    if (type !== GROUP_TYPE) {
      stats.otherType += 1;
      continue;
    }
    if (row["Provider status"] !== "Active") {
      stats.notActive += 1;
      continue;
    }
    const subtype = row["Provider subtype"];
    if (subtype === "Out-of-school day care") {
      stats.outOfSchool += 1;
      continue;
    }
    if (subtype === "") {
      stats.blankSubtype += 1;
      continue;
    }
    if (!FILED_SUBTYPES.has(subtype)) {
      stats.otherSubtype += 1;
      continue;
    }
    // BUG-240: only settings on the Early Years Register
    // file as nurseries. A group setting off the EYR is
    // a voluntary/compulsory-register-only provider for
    // activity, tutoring or holiday care — not a nursery.
    if (row["Provider Early Years Register flag"] !== "Y") {
      stats.notOnEarlyYearsRegister += 1;
      continue;
    }
    const urn = row["Provider URN"];
    if (!urn) throw new Error("contract failure: a group setting row carries no Provider URN");
    if (seen.has(urn)) {
      stats.duplicateUrns += 1;
      continue;
    }
    seen.add(urn);
    const postcode = (row["Provider postcode"] ?? "").toUpperCase();
    const position = positionOf(postcode);
    if (!position) {
      stats.unresolvedPostcode += 1;
      stats.unresolvedPostcodes.push(postcode);
      continue;
    }
    const address = [
      row["Provider address line 1"],
      row["Provider address line 2"],
      row["Provider address line 3"],
      row["Provider town"],
    ]
      .map((part) => (part ?? "").trim())
      .filter((part) => part !== "")
      .join(", ");
    settings.push({
      urn,
      name: row["Provider name"],
      settingType: subtype,
      address: address === "" ? null : address,
      postcode,
      lat: position.lat,
      lng: position.lng,
    });
  }
  buildTally?.finish(records.length);
  return { settings, stats };
}

function withinAndNearest(settings, home) {
  const measured = settings
    .map((s) => ({ setting: s, miles: haversineMiles(home.lat, home.lng, s.lat, s.lng) }))
    .sort((a, b) => a.miles - b.miles || a.setting.name.localeCompare(b.setting.name));
  const within = measured.filter((m) => m.miles <= 2);
  return {
    nearest: measured[0] ?? null,
    withinCount: within.length,
    top3: within.slice(0, 3),
  };
}

function checkGolden(settings, fixtureMode) {
  const goldens = fixtureMode ? GOLDENS_FIXTURE : GOLDENS_LIVE;
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  for (const [postcode, golden] of Object.entries(goldens)) {
    const { nearest, withinCount, top3 } = withinAndNearest(settings, HOMES[postcode]);
    expect(
      nearest && nearest.setting.name === golden.nearest,
      `${postcode} nearest nursery: expected ${golden.nearest}, got ${nearest ? nearest.setting.name : "none"}`,
    );
    expect(
      nearest && Math.abs(nearest.miles - golden.nearestMiles) <= 0.005,
      `${postcode} nearest distance: expected ${golden.nearestMiles} mi, got ${nearest ? nearest.miles.toFixed(3) : "none"}`,
    );
    expect(
      withinCount === golden.countWithin,
      `${postcode} count within 2 miles: expected ${golden.countWithin}, got ${withinCount}`,
    );
    expect(
      JSON.stringify(top3.map((m) => m.setting.name)) === JSON.stringify(golden.top3),
      `${postcode} three nearest names: expected ${JSON.stringify(golden.top3)}, got ${JSON.stringify(top3.map((m) => m.setting.name))}`,
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
  // This loader takes no positional arguments — it files the
  // whole register. Anything unrecognised fails loudly here
  // rather than being silently dropped (the per-postcode
  // loaders' bare-invocation trap cannot exist in this shape).
  const known = new Set(["--verify-only", "--file"]);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--file") {
      i += 1;
      continue;
    }
    if (!known.has(args[i])) throw new Error(`unrecognised argument: ${args[i]}`);
  }
  if (fixtureMode && !fixtureDir) throw new Error("--file needs a directory");
  // BUG-265: one logger for the run — the build tally and the
  // filing tally below.
  const progress = createProgressLogger({ name: "load-nurseries" });

  let text;
  let asAt;
  let positionOf;
  let client = null;
  let settings;
  let stats;
  try {
    progress.stage("reading the Ofsted childcare register");
    if (fixtureMode) {
      const meta = JSON.parse(await readFile(join(fixtureDir, "fixture.json"), "utf8"));
      text = await readFile(join(fixtureDir, meta.providerFile), "utf8");
      asAt = meta.registerAsAt;
      const postcodes = JSON.parse(await readFile(join(fixtureDir, "postcodes.json"), "utf8"));
      positionOf = (pc) => postcodes[(pc ?? "").trim().toUpperCase()] ?? null;
      if (!verifyOnly) {
        if (!process.env.DATABASE_URL)
          throw new Error("DATABASE_URL is not set — filing requires a database");
        client = new pg.Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();
      }
    } else {
      ({ text, asAt: asAt } = await discoverRegister());
      if (!process.env.DATABASE_URL)
        throw new Error(
          "DATABASE_URL is not set — nursery points are positioned from the postcode directory, so a database is required",
        );
      client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      const res = await client.query(
        "SELECT postcode, latitude, longitude FROM postcode_cache WHERE latitude IS NOT NULL",
      );
      const directory = new Map(
        res.rows.map((r) => [r.postcode, { lat: r.latitude, lng: r.longitude }]),
      );
      positionOf = (pc) => directory.get((pc ?? "").trim().toUpperCase()) ?? null;
    }

    const { records, asAt: fileAsAt } = parseRegister(text);
    if (fileAsAt !== asAt)
      throw new Error(
        `the file's own as-at date (${fileAsAt}) does not match the discovered edition (${asAt})`,
      );
    ({ settings, stats } = buildSettings(records, positionOf, { progress }));

    // Contract sanity. Frozen counts belong to fixture mode; live
    // mode checks bands, like the other loaders.
    if (fixtureMode) {
      if (settings.length === 0) throw new Error("the fixture filed no settings");
    } else {
      if (records.length < 40000 || records.length > 80000)
        throw new Error(
          `sanity failure: ${records.length} register rows is outside the expected band`,
        );
      if (settings.length < 15000 || settings.length > 25000)
        throw new Error(
          `sanity failure: ${settings.length} filed group settings is outside the expected band`,
        );
      if (stats.unresolvedPostcode > 200)
        throw new Error(
          `sanity failure: ${stats.unresolvedPostcode} group settings have a postcode outside the directory`,
        );
    }
    checkGolden(settings, fixtureMode);
  } catch (error) {
    // BUG-265: the read, the build and the golden checks all
    // fail before anything is filed.
    progress.failed({
      stage: "read",
      filed: 0,
      error,
      resume: "re-run the loader from the start (nothing is filed until the swap)",
    });
    throw error;
  }

  const summary = () =>
    `load-nurseries · Ofsted childcare register as at ${asAt} · ${formatCount(settings.length)} group settings filed ` +
    `(${formatCount(settings.filter((s) => s.settingType === "Full day care").length)} full day care, ` +
    `${formatCount(settings.filter((s) => s.settingType === "Sessional day care").length)} sessional day care) · ` +
    `of ${formatCount(stats.total)} register rows: ${formatCount(stats.childminderTypes)} childminder-type never filed, ` +
    `${formatCount(stats.domesticPremises)} on domestic premises (published redacted, never filed), ` +
    `${formatCount(stats.outOfSchool)} out-of-school day care not filed, ${formatCount(stats.blankSubtype)} blank subtype not filed, ` +
    `${formatCount(stats.otherSubtype)} other subtype not filed, ${formatCount(stats.notOnEarlyYearsRegister)} not on the Early Years Register not filed, ${formatCount(stats.notActive)} not active, ${formatCount(stats.otherType)} other type, ` +
    `${formatCount(stats.duplicateUrns)} duplicate URNs, ${formatCount(stats.unresolvedPostcode)} unresolved postcodes not filed`;

  if (verifyOnly) {
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    if (client) await client.end();
    return;
  }

  try {
    await client.query("BEGIN");
    await client.query(
      `CREATE TEMP TABLE nurseries_stage (LIKE nurseries INCLUDING DEFAULTS) ON COMMIT DROP`,
    );
    // BUG-265: the filing is the run's second long loop — one
    // INSERT per setting, ~20,000 live — so a tally lands every
    // 1,000 settings, a heartbeat every 10,000, and a
    // 1,000-setting chunk that takes more than 3x the recent
    // average earns a warning.
    progress.stage(`filing ${formatCount(settings.length)} settings`);
    const fileTally = progress.tally({
      label: "file",
      total: settings.length,
      every: 1000,
      unit: "settings",
    });
    const fileWatch = createBatchWatch();
    let filedSettings = 0;
    let chunkStarted = Date.now();
    for (const s of settings) {
      await client.query(
        `INSERT INTO nurseries_stage (urn, name, setting_type, address, postcode, latitude, longitude,
           source_name, source_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [s.urn, s.name, s.settingType, s.address, s.postcode, s.lat, s.lng, SOURCE_NAME, asAt],
      );
      filedSettings += 1;
      fileTally.tick(filedSettings);
      progress.heartbeat({
        stage: "filing",
        done: filedSettings,
        total: settings.length,
        every: 10_000,
      });
      if (filedSettings % 1000 === 0) {
        const { tookMs, averageMs, slow } = fileWatch.observe(Date.now() - chunkStarted);
        if (slow) {
          progress.warning({
            what: "filing chunk duration",
            value: `chunk ending at setting ${formatCount(filedSettings)} took ${formatDuration(tookMs)}`,
            threshold: `3x recent average ${formatDuration(averageMs)}`,
          });
        }
        chunkStarted = Date.now();
      }
    }
    fileTally.finish(filedSettings);
    const staged = await client.query("SELECT count(*)::int AS n FROM nurseries_stage");
    if (staged.rows[0].n !== settings.length)
      throw new Error("the staged setting count does not match — rolling back");
    await client.query("DELETE FROM nurseries");
    await client.query(
      `INSERT INTO nurseries (urn, name, setting_type, address, postcode, latitude, longitude,
         source_name, source_date, loaded_at)
       SELECT urn, name, setting_type, address, postcode, latitude, longitude,
         source_name, source_date, loaded_at FROM nurseries_stage`,
    );
    const filed = await client.query("SELECT count(*)::int AS n FROM nurseries");
    if (filed.rows[0].n !== settings.length)
      throw new Error("the filed setting count does not match — rolling back");
    await client.query("COMMIT");
  } catch (error) {
    // BUG-265: the filing is one transaction — on a rollback
    // the live table is untouched.
    progress.failed({
      stage: "filing",
      filed: 0,
      total: settings.length,
      error,
      resume:
        "re-run the loader from the start (the filing rolled back, the live table is untouched)",
    });
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

main().catch((error) => {
  console.error(`load-nurseries FAILED: ${error.message}`);
  process.exitCode = 1;
});
