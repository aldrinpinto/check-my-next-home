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
import { createLoaderResume } from "./loader-resume.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
  withFilingPulse,
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

async function fetchText(url, opts = {}) {
  return (await fetchResponse(url, url, opts)).text();
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

// --- filing ------------------------------------------------------------
// Stage, count, swap — with resume support (BUG-368): staging is
// a PERSISTENT table now (migration 0048), and a
// loader_checkpoint row records the last fully staged chunk, so
// a killed run resumes instead of restarting. The build still
// runs whole and in memory — it is deterministic for a given
// edition — but the filing loop skips the settings the checkpoint
// already covers, so the re-run stages only the tail. The
// single-edition swap's atomicity is unchanged: the live table
// changes ONLY in finishFiling's transaction, on a complete,
// verified staged set; staging + checkpoint are dropped by
// resume.clear() after a successful swap, and stay put on a
// failure, as the next run's resume point.
//
// THE RESUME UNITS. The settings array is the read, in order, so
// the resume point is the count of settings staged (nextStartIndex
// == filed count == the index the resumed run stages from). A
// checkpoint is written after every 1,000 staged settings and once
// more for the tail, so a kill loses at most the chunk in flight
// — and the interrupted chunk's flushed rows are trimmed by
// prepare(), then re-staged with the same seqs. The edition is
// the register's own as-at date: a republication invalidates the
// checkpoint.
/**
 * Open the filing run's database client and resume handle
 * (BUG-368). The client is injectable so the resume tests
 * can file against a fake database; production passes none
 * and a real client is opened as before.
 *
 * @param {import("./progress.mjs").ProgressLogger | null} [progress]
 * @param {{ restart?: boolean, client?: any }} [options]
 */
export async function beginFiling(
  progress = null,
  { restart = false, client: injectedClient = null } = {},
) {
  const client = injectedClient ?? new pg.Client({ connectionString: process.env.DATABASE_URL });
  const ownsClient = !injectedClient;
  if (ownsClient) await client.connect();
  let clientClosed = false;
  async function closeClient() {
    if (ownsClient && !clientClosed) {
      clientClosed = true;
      await client.end().catch(() => {});
    }
  }
  try {
    // The stage table is spelled out, not copied with LIKE:
    // the live table's generated geom column must never be a
    // staging target, and staging carries no index beyond the
    // UNIQUE (seq) the resume proof needs.
    await client.query(
      `CREATE TABLE IF NOT EXISTS nurseries_stage (
         urn text, name text, setting_type text, address text, postcode text,
         latitude double precision, longitude double precision,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now(),
         seq bigint NOT NULL, UNIQUE (seq)
       )`,
    );
  } catch (error) {
    await closeClient();
    throw error;
  }
  const resume = createLoaderResume(client, {
    loader: "load-nurseries",
    stageTable: "nurseries_stage",
    progress,
    restart,
  });
  const CHUNK = 1000;
  let edition = null;
  let expected = null;
  let startIndex = 0;
  let staged = 0;
  let checkpointed = 0;
  /** @type {{ resumed: boolean, reason?: string, checkpoint?: any, prefix?: boolean }} */
  let resumePrep = { resumed: false };
  async function checkpointNow() {
    await resume.checkpoint({
      edition,
      expected,
      nextStartIndex: staged,
      read: staged,
      filed: staged,
      unit: "settings",
    });
    checkpointed = staged;
  }
  return {
    stagedCount: () => staged,
    startIndex: () => startIndex,
    resumePrep: () => resumePrep,
    resumeNote: () => resume.resumeNote(),
    // Decide, from the edition and the staged rows, whether
    // this run resumes or starts from zero. Called once the
    // build has fixed the edition and the expected count.
    async prepareResume(ed, exp) {
      edition = ed;
      expected = exp ?? null;
      resumePrep = await resume.prepare({ edition, expected });
      if (resumePrep.resumed) {
        const cp = resumePrep.checkpoint;
        startIndex = cp.next_start_index;
        staged = cp.filed_count;
        checkpointed = staged;
      }
      return resumePrep;
    },
    // Stage the settings from the resume point on, one INSERT
    // per setting as before, checkpointing every 1,000 staged
    // settings (and once more for the tail) — one BUG-204
    // progress line per committed chunk, never per row.
    async stageSettings(settings, asAt) {
      if (edition === null) throw new Error("prepareResume must be called before stageSettings");
      // BUG-265: the filing is the run's second long loop — one
      // INSERT per setting, ~20,000 live — so a tally lands every
      // 1,000 settings, a heartbeat every 10,000, and a
      // 1,000-setting chunk that takes more than 3x the recent
      // average earns a warning.
      const fileTally = progress?.tally({
        label: "file",
        total: settings.length,
        every: 1000,
        unit: "settings",
      });
      const fileWatch = createBatchWatch();
      let chunkStarted = Date.now();
      for (let i = startIndex; i < settings.length; i += 1) {
        const s = settings[i];
        await client.query(
          `INSERT INTO nurseries_stage (urn, name, setting_type, address, postcode, latitude, longitude,
             source_name, source_date, seq)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            s.urn,
            s.name,
            s.settingType,
            s.address,
            s.postcode,
            s.lat,
            s.lng,
            SOURCE_NAME,
            asAt,
            staged,
          ],
        );
        staged += 1;
        fileTally?.tick(staged);
        progress?.heartbeat({
          stage: "filing",
          done: staged,
          total: settings.length,
          every: 10_000,
        });
        if (staged % CHUNK === 0) {
          const { tookMs, averageMs, slow } = fileWatch.observe(Date.now() - chunkStarted);
          if (slow) {
            progress?.warning({
              what: "filing chunk duration",
              value: `chunk ending at setting ${formatCount(staged)} took ${formatDuration(tookMs)}`,
              threshold: `3x recent average ${formatDuration(averageMs)}`,
            });
          }
          chunkStarted = Date.now();
          await checkpointNow();
        }
      }
      if (staged > checkpointed) await checkpointNow();
      fileTally?.finish(staged);
    },
    // Count-check the staged set, then swap it into the live
    // table in one transaction. A successful swap clears
    // staging + checkpoint.
    async finishFiling(settings) {
      try {
        const stagedRes = await client.query("SELECT count(*)::int AS n FROM nurseries_stage");
        if (stagedRes.rows[0].n !== settings.length)
          throw new Error("the staged setting count does not match — rolling back");
        // BUG-390: one progress line per sub-step — the
        // filing previously printed one line and then went
        // silent while the single INSERT...SELECT ran.
        progress?.stage(
          `filing · staged count verified · ${formatCount(settings.length)} settings`,
        );
        await client.query("BEGIN");
        try {
          await client.query("DELETE FROM nurseries");
          progress?.stage("filing · live rows deleted");
          progress?.stage(
            `filing · copying ${formatCount(settings.length)} settings into nurseries`,
          );
          await withFilingPulse(
            progress,
            {
              stage: `filing · copying ${formatCount(settings.length)} settings into nurseries`,
            },
            () =>
              client.query(
                `INSERT INTO nurseries (urn, name, setting_type, address, postcode, latitude, longitude,
             source_name, source_date, loaded_at)
           SELECT urn, name, setting_type, address, postcode, latitude, longitude,
             source_name, source_date, loaded_at FROM nurseries_stage`,
              ),
          );
          progress?.stage(`filing · copy done · ${formatCount(settings.length)} settings`);
          const filed = await client.query("SELECT count(*)::int AS n FROM nurseries");
          if (filed.rows[0].n !== settings.length)
            throw new Error("the filed setting count does not match — rolling back");
          progress?.stage(
            `filing · filed count verified · ${formatCount(settings.length)} settings`,
          );
          await client.query("COMMIT");
          progress?.stage(
            `filing · swap committed · ${formatCount(settings.length)} settings live`,
          );
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        }
        // The run is complete: staging + checkpoint go together,
        // so nothing is left behind for the next edition.
        await resume.clear();
      } finally {
        await closeClient();
      }
    },
    async abortFiling() {
      // The staging + checkpoint STAY: they are the next run's
      // resume point. A run that never prepared leaves whatever
      // a previous run left, and the next run's prepare()
      // validates or discards it.
      await closeClient();
    },
  };
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last checkpointed chunk instead of
  // restarting; with no checkpoint this is a fresh start.
  const restart = args.includes("--restart");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;
  // This loader takes no positional arguments — it files the
  // whole register. Anything unrecognised fails loudly here
  // rather than being silently dropped (the per-postcode
  // loaders' bare-invocation trap cannot exist in this shape).
  const known = new Set(["--verify-only", "--file", "--restart"]);
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
  // BUG-368: the filer opens ahead of the read, so a failure
  // anywhere in the run can name its resume point; the resume
  // decision itself waits until the build has fixed the edition
  // and the expected count. A filing run fails before fetching
  // when there is no database to file into.
  let filer = null;
  if (!verifyOnly) {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL is not set — filing requires a database");
    filer = await beginFiling(progress, { restart });
  }

  let text;
  let asAt;
  let positionOf;
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
      // Filing needs a database even in fixture mode (CI files the
      // fixture into its throwaway PostGIS); positions still come
      // from the fixture's own postcode list. The filer above
      // already opened it — nothing more to connect here.
    } else {
      ({ text, asAt: asAt } = await discoverRegister());
      if (!process.env.DATABASE_URL)
        throw new Error(
          "DATABASE_URL is not set — nursery points are positioned from the postcode directory, so a database is required",
        );
      // The postcode directory is read on its own short-lived
      // client: the filer owns the filing connection, and this
      // read closes as soon as the directory is built.
      const directoryClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await directoryClient.connect();
      try {
        const res = await directoryClient.query(
          "SELECT postcode, latitude, longitude FROM postcode_cache WHERE latitude IS NOT NULL",
        );
        const directory = new Map(
          res.rows.map((r) => [r.postcode, { lat: r.latitude, lng: r.longitude }]),
        );
        positionOf = (pc) => directory.get((pc ?? "").trim().toUpperCase()) ?? null;
      } finally {
        await directoryClient.end();
      }
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
      resume: filer
        ? filer.resumeNote()
        : "re-run the loader from the start (nothing is filed until the swap)",
    });
    if (filer) await filer.abortFiling();
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
    return;
  }

  // BUG-368: the edition is the register's own as-at date, and
  // the build has fixed the expected count, so the resume
  // decision lands here, before any staging: resume from the
  // checkpoint, or start from zero.
  await filer.prepareResume(asAt, settings.length);

  // BUG-265: the filing is the run's second long loop — one
  // INSERT per setting, ~20,000 live — checkpointed every 1,000
  // settings inside stageSettings, so a kill resumes instead of
  // restarting. The swap itself is finishFiling's own
  // transaction, as before.
  progress.stage(`filing ${formatCount(settings.length)} settings`);
  const activeFiler = filer;
  filer = null;
  try {
    await activeFiler.stageSettings(settings, asAt);
    await activeFiler.finishFiling(settings);
  } catch (error) {
    // BUG-368: the staging + checkpoint stay put, so the next
    // run resumes where this one stopped; the live table is
    // untouched (the swap is one transaction — a rollback there
    // leaves the last good filing serving).
    progress.failed({
      stage: "filing",
      filed: 0,
      total: settings.length,
      error,
      resume: activeFiler.resumeNote(),
    });
    await activeFiler.abortFiling();
    throw error;
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

main().catch((error) => {
  console.error(`load-nurseries FAILED: ${error.message}`);
  process.exitCode = 1;
});
