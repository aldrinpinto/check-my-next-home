// Loader runner (plan step M4.8). One entry point that runs the
// contract canary probes and the due dataset loads, records the
// whole run in the loader_runs tables, sends ONE email per run
// (an alert on failure, a short OK heartbeat on success — so a
// missing email is itself visible), and exits non-zero on any
// failure, including the email failing.
//
//   npm run load:all                        live run (due datasets)
//   npm run load:all -- --canary-only       probes only
//   npm run load:all -- --timers            print the schedule registry and exit
//   npm run load:all -- --file tests/fixtures --kind practice-break --env ci
//
// Design rules (M4.8 gap check, 12 Nov 2026):
//   - Canary first; a failed probe alerts but never blocks a
//     load — the loaders' own validation is the filing authority.
//   - Continue on failure: one broken source never blocks the
//     rest of the month. The one exception: with no postcode
//     directory at all, downstream loads are skipped, because
//     they have nothing to join onto.
//   - The runner is the only writer of the run record; if the
//     database is down it falls back to a JSON-lines file and
//     still sends the email from memory — alerting never depends
//     on the log being writable.
//   - "Within an hour" means what it can honestly mean: the
//     email is sent as the runner's last act, within an hour of
//     the run that detected the failure finishing.

import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { runCanaryProbes } from "./canary.mjs";

const GOLDEN_POSTCODES = ["CM3 2JT", "E16 1GN", "KT17 1FH"];
const ALERT_TO = process.env.ALERT_EMAIL_TO ?? "checkmynexthome@gmail.com";
const DAY = 86400000;

// The static class (plan step M5.8): a dataset that loads
// exactly once. dueDecision with a ~100-year threshold says
// "due" only when the loader has never succeeded — the
// runner's one due-ness mechanism, no new machinery. The
// dataset's canary probe watches for a republication; a
// re-file after one is a manual operator re-run (the M5.10
// council-tax seed precedent), matching the plan's cadence
// table: "Load once… Once; re-checked rarely".
export const STATIC_THRESHOLD_DAYS = 36500;

// --- the schedule registry (plan step M5.15, decision D19) ---------
//
// The one table that says when each loader runs and how long it
// may take. The live plan in main() reads its due-ness thresholds
// and timeouts from here, and --timers prints from here, so the
// print can never drift from the behaviour (the M5.15 check:
// "the timer list printed from the system matches the plan").
//
// Cadences, judged from the last SUCCESS, as before:
//   monthly   25 days — in practice files in every monthly run
//   quarterly 70 days — in practice every third monthly run,
//             the Jan/Apr/Jul/Oct rhythm (the postcode directory
//             rides this class: its 70-day threshold is unchanged)
//   static    the ~100-year threshold above — loads exactly once
//   operator  NO threshold and NO timeout: the timed runner
//             never runs these. Noise (an hours-long national
//             pass) and priority habitats (an 818k-patch mirror
//             with no resume — a mid-pass kill restarts at page
//             0) cannot be shown to fit a timed window, so they
//             are named operator jobs: an operator runs them by
//             hand, and every timed run's record and email lists
//             them as SKIPPED with the date they last filed. The
//             canary freshness probes are the stale-data guard.
//
// Timeouts: a per-loader map, 30 minutes for every timed loader
// today — no loader has a measured duration yet, so none gets
// headroom (D19: headroom only where measured). When a loader
// is killed by its timeout the item is recorded and emailed as
// "TIMED OUT after N minutes" (see formatTimeout), the run
// continues with the next loader, and the run fails.
export const DEFAULT_TIMEOUT_MINUTES = 30;

export const LOADER_SCHEDULE = [
  { item: "load-postcodes", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-sold-prices", cadence: "monthly", timeoutMinutes: 30 },
  { item: "load-crime", cadence: "monthly", timeoutMinutes: 30 },
  { item: "load-crime-national", cadence: "monthly", timeoutMinutes: 30 },
  { item: "load-epc", cadence: "monthly", timeoutMinutes: 30 },
  { item: "load-schools", cadence: "monthly", timeoutMinutes: 30 },
  { item: "load-health", cadence: "monthly", timeoutMinutes: 30 },
  { item: "load-nurseries", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-planning-areas", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-green-belt", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-heritage", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-brownfield", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-built-up-areas", cadence: "static", timeoutMinutes: 30 },
  { item: "load-aqma", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-charging-zones", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-nature-designations", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-priority-habitats", cadence: "operator" },
  { item: "load-flood-zones", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-flood-rivers-sea", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-flood-surface-water", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-flood-defences", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-flood-rivers-sea-climate", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-flood-surface-water-climate", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-transport", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-osm-places", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-os-greenspace", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-ev-chargers", cadence: "monthly", timeoutMinutes: 30 },
  { item: "load-tribunal-building-safety", cadence: "quarterly", timeoutMinutes: 30 },
  { item: "load-census", cadence: "static", timeoutMinutes: 30 },
  { item: "load-lsoa-bases", cadence: "static", timeoutMinutes: 30 },
  { item: "load-council-tax", cadence: "static", timeoutMinutes: 30 },
  { item: "load-claimant-count", cadence: "monthly", timeoutMinutes: 30 },
  { item: "load-dwp-uc", cadence: "monthly", timeoutMinutes: 30 },
  { item: "load-company-ownership", cadence: "monthly", timeoutMinutes: 30 },
  { item: "load-imd", cadence: "static", timeoutMinutes: 30 },
  { item: "load-air-quality", cadence: "static", timeoutMinutes: 30 },
  { item: "load-pvgis", cadence: "static", timeoutMinutes: 30 },
  { item: "load-noise", cadence: "operator" },
  { item: "load-broadband", cadence: "static", timeoutMinutes: 30 },
  { item: "load-mobile", cadence: "static", timeoutMinutes: 30 },
];

const SCHEDULE_BY_ITEM = new Map(LOADER_SCHEDULE.map((e) => [e.item, e]));

const CLASS_THRESHOLDS_DAYS = {
  monthly: 25,
  quarterly: 70,
  static: STATIC_THRESHOLD_DAYS,
  operator: null,
};

export function scheduleFor(item) {
  const entry = SCHEDULE_BY_ITEM.get(item);
  if (!entry) throw new Error(`no schedule entry for ${item}`);
  return entry;
}

export function isOperatorJob(item) {
  return scheduleFor(item).cadence === "operator";
}

// The due-ness threshold the timed runner judges this loader by,
// or null for an operator job (never judged, never run).
export function thresholdDaysFor(item) {
  return CLASS_THRESHOLDS_DAYS[scheduleFor(item).cadence];
}

// The loader's timeout in minutes, or null for an operator job
// (the timer never runs it, so nothing times it out).
export function timeoutMinutesFor(item) {
  const entry = scheduleFor(item);
  return entry.cadence === "operator" ? null : entry.timeoutMinutes;
}

export function timeoutMsFor(item) {
  const minutes = timeoutMinutesFor(item);
  return minutes === null ? null : minutes * 60 * 1000;
}

// The words a timeout is recorded and emailed in (D19: the
// reason is stated, never left as raw stderr). Configured
// timeouts are whole minutes, so that is the wording that
// ships; a sub-minute timeout (the test-suite drill) is
// labelled in seconds rather than as a fraction of a minute.
export function formatTimeout(timeoutMs) {
  if (timeoutMs % 60000 === 0) {
    const minutes = timeoutMs / 60000;
    return `TIMED OUT after ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  return `TIMED OUT after ${seconds} second${seconds === 1 ? "" : "s"}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// The run-record and email line for an operator job in a timed
// run: SKIPPED, what it is, and the date it last filed — the
// operator's stale-data prompt between the canary probes.
export function operatorSkipLine(item, lastSuccess) {
  void item;
  if (!lastSuccess) return "skipped — operator job, run by hand; never filed yet";
  const d = new Date(lastSuccess);
  const when = `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `skipped — operator job, run by hand; last filed ${when}`;
}

// The --timers print: every registered loader, grouped by class,
// in the plan's own terms. Printed from LOADER_SCHEDULE — the
// same table the live plan reads — so the two cannot drift.
export function formatTimers() {
  const byClass = (cadence) => LOADER_SCHEDULE.filter((e) => e.cadence === cadence);
  const timed = (e) => `  ${e.item} — timeout ${e.timeoutMinutes} minutes`;
  const lines = [
    "Loader timers — Check My Next Home",
    "One run a month, on the 5th. In each run a loader files only when its class says it is due;",
    "due-ness is judged from the loader's last successful run.",
    "",
    "MONTHLY — due when the last success was 25 or more days ago, so in practice these file in every monthly run:",
    ...byClass("monthly").map(timed),
    "",
    "QUARTERLY — due when the last success was 70 or more days ago, so in practice every third monthly run (the Jan/Apr/Jul/Oct rhythm):",
    ...byClass("quarterly").map(timed),
    "",
    "STATIC — loads once, when it has never loaded; after that a re-file is a manual operator re-run when its canary reports a republication:",
    ...byClass("static").map(timed),
    "",
    "OPERATOR JOBS — never run by the timer and never timed out; an operator runs them by hand, and every run's record and email lists them as SKIPPED with the date they last filed:",
    ...byClass("operator").map((e) => `  ${e.item} — operator job, no timeout`),
  ];
  return lines.join("\n");
}

// --- pure core (unit-tested) --------------------------------------

export function dueDecision(lastSuccessIso, thresholdDays, now = new Date()) {
  if (!lastSuccessIso) return { due: true, reason: "never loaded successfully" };
  const age = (now.getTime() - new Date(lastSuccessIso).getTime()) / DAY;
  return age >= thresholdDays
    ? { due: true, reason: `last success ${Math.floor(age)} days ago` }
    : { due: false, reason: `not due — last success ${Math.floor(age)} days ago` };
}

// The one line of a failed loader's captured output that the
// summaries, the console and the alert email show. A child
// loader's stderr OPENS with Node's own runtime warnings on
// Node 22 — "(node:…) ExperimentalWarning: SQLite is an
// experimental feature…" from every loader that imports
// node:sqlite — so the first line is the warning, not the
// failure: it hid the greenspace loader's real error in CI
// runs 98 and 99 behind a sqlite warning. Prefer the loader's
// own "FAILED:" line (every loader's main prints one, carrying
// its error); fall back to the last line that is not Node
// runtime noise.
export function errorHeadline(errorMessage) {
  const lines = (errorMessage ?? "unknown error")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  if (lines.length === 0) return "unknown error";
  const own = lines.filter((l) => !l.startsWith("(node:") && !l.startsWith("(Use `node "));
  const pool = own.length > 0 ? own : lines;
  // A timeout label (M5.15) is the runner's own authoritative
  // reason and outranks anything the killed loader managed to
  // print before it died.
  const timedOut = pool.find((l) => l.startsWith("TIMED OUT"));
  if (timedOut) return timedOut;
  return pool.find((l) => l.includes("FAILED:")) ?? pool[pool.length - 1];
}

export function summariseRun(kind, items) {
  const failed = items.filter((i) => i.status === "failed");
  const counted = items.filter((i) => i.status !== "warning");
  const status = failed.length > 0 ? "failed" : "succeeded";
  const label = kind === "canary" ? "Canary" : "Loader run";
  const subject =
    status === "failed"
      ? `[Check My Next Home] ${label} FAILED — ${failed.map((i) => i.item).join(", ")} (${failed.length} of ${counted.length})`
      : `[Check My Next Home] ${label === "Canary" ? "Canary" : "Loaders"} OK`;
  const lines = items.map((i) => {
    if (i.status === "succeeded") return `OK      ${i.item} — ${i.logLine ?? ""}`;
    if (i.status === "skipped") return `SKIPPED ${i.item} — ${i.logLine ?? ""}`;
    if (i.status === "warning") return `WARNING ${i.item} — ${i.logLine ?? ""}`;
    return `FAILED  ${i.item} — ${errorHeadline(i.errorMessage)}`;
  });
  if (status === "failed") {
    lines.push("", "Each failed loader filed nothing; the previous data is still serving.");
  }
  return { status, subject, lines };
}

export function decideExitCode({ items, alertStatus, noEmail }) {
  if (items.some((i) => i.status === "failed")) return 1;
  if (!noEmail && alertStatus !== "sent") return 1;
  return 0;
}

// --- the email a person reads --------------------------------------
//
// The run record keeps the loaders' verbatim log lines; the email
// does not lead with them. It opens with what happened and what
// (if anything) the operator needs to do, in plain words, then
// lists each collector as one human sentence, and only then the
// technical detail. The gap check's test for this email: one
// person, no dashboard habit, thirty seconds — what broke, what
// is still serving, what do I have to do?

export const FRIENDLY_NAMES = {
  "load-postcodes": "Postcode directory",
  "load-sold-prices": "Sold prices",
  "load-crime": "Crime",
  "load-crime-national": "Crime — England totals for the per-head comparison",
  "load-epc": "Energy certificates (EPC)",
  "load-schools": "Schools",
  "load-health": "Health — GPs, pharmacies, dentists, hospitals",
  "load-nurseries": "Nurseries — Ofsted childcare register, group settings only",
  "load-planning-areas": "Planning areas — conservation areas and Article 4",
  "load-green-belt": "Green belt",
  "load-heritage": "Heritage — listed buildings and monuments",
  "load-brownfield": "Brownfield land — recorded sites and the councils that supply them",
  "load-built-up-areas": "Built-up areas — the ONS December 2024 boundaries",
  "load-aqma": "Air Quality Management Areas — Defra UK-AIR's declared areas",
  "load-charging-zones":
    "Charging zones — Clean Air Zones, the London ULEZ and the Scottish Low Emission Zones",
  "load-nature-designations": "Nature designations — SSSI, SAC, SPA, Ramsar, ancient woodland",
  "load-priority-habitats": "Priority habitats",
  "load-flood-zones": "Flood zones — the planning map, defences ignored",
  "load-flood-rivers-sea": "Flood likelihood — rivers and sea, defences counted",
  "load-flood-surface-water": "Flood likelihood — surface water",
  "load-flood-defences": "Flood defences — the EA's recorded defences (AIMS)",
  "load-flood-rivers-sea-climate": "Flood climate outlook — rivers and sea, one published scenario",
  "load-flood-surface-water-climate":
    "Flood climate outlook — surface water, one published scenario",
  "load-transport": "Transport — bus stops and stations",
  "load-osm-places": "Nearby places — vets, shops, eating places, parks and more",
  "load-os-greenspace": "Parks — official green spaces",
  "load-ev-chargers": "EV chargers — public charging points",
  "load-census": "Census 2021 — the area in numbers",
  "load-lsoa-bases": "Area sizes — Census residents and households by small area",
  "load-claimant-count": "Benefits figures — Claimant Count",
  "load-dwp-uc": "Benefits figures — Universal Credit",
  "load-imd": "Deprivation — Indices of Deprivation 2025",
  "load-air-quality": "Air quality — Defra modelled background",
  "load-pvgis": "Solar — PVGIS modelled yield for the location",
  "load-noise": "Noise — Defra modelled road, rail and airport",
  "load-broadband": "Broadband — Ofcom coverage by postcode",
  "load-mobile": "Mobile — Ofcom coverage by local authority",
  "load-council-tax": "Council tax — the councils' average Band D charges",
  "load-tribunal-building-safety":
    "Building safety orders — published tribunal decisions in the BSA/BSB case series",
  "load-company-ownership":
    "Company ownership — Land Registry company-owned titles, Companies House snapshots",
  onspd: "Postcode directory source (canary)",
  ppd: "Sold prices source (canary)",
  police: "Crime source (canary)",
  epc: "EPC source (canary)",
  "epc-deltas": "EPC changes feed (canary)",
  gias: "Schools register (canary)",
  ofsted: "Ofsted source (canary)",
  ods: "NHS lists source (canary)",
  "cqc-directory": "CQC directory (canary)",
  "cqc-ratings": "CQC ratings (canary)",
  "conservation-area": "Conservation areas source (canary)",
  "article-4-direction-area": "Article 4 areas source (canary)",
  "green-belt": "Green belt source (canary)",
  "listed-building": "Listed buildings source (canary)",
  "scheduled-monument": "Scheduled monuments source (canary)",
  sssi: "SSSI source (canary)",
  sac: "SAC source (canary)",
  spa: "SPA source (canary)",
  ramsar: "Ramsar source (canary)",
  "ancient-woodland": "Ancient woodland source (canary)",
  "ancient-woodland-revised": "Ancient woodland, revised (canary)",
  "priority-habitats": "Priority habitats source (canary)",
  "flood-zones": "Flood zones source (canary)",
  "flood-rivers-sea": "Rivers & sea flood source (canary)",
  "flood-surface-water": "Surface water flood source (canary)",
  "flood-rivers-sea-climate": "Rivers & sea flood source — climate scenario (canary)",
  "flood-surface-water-climate": "Surface water flood source — climate scenario (canary)",
  naptan: "Transport stops source (canary)",
  geofabrik: "Places map source (canary)",
  "os-greenspace": "Parks source (canary)",
  "open-charge-map": "EV chargers source (canary)",
  "nomis-census": "Census source (canary)",
  "nomis-claimant": "Claimant Count source (canary)",
  "stat-xplore-uc": "Universal Credit source (canary)",
  "govuk-iod": "Deprivation source (canary)",
  "defra-pcm": "Air quality source (canary)",
  aqma: "Air Quality Management Areas source (canary)",
  "govuk-caz": "Clean Air Zone register — GOV.UK's published list (canary)",
  "scotland-lez": "Low Emission Zone register — Scotland's published count (canary)",
  "defra-noise": "Noise source (canary)",
  "ofcom-broadband": "Broadband source (canary)",
  "ofcom-mobile": "Mobile source (canary)",
  "mhclg-council-tax": "Council tax source (canary)",
  "bsr-register": "Building Safety Register (canary)",
};

function shortDetail(item) {
  const line = item.logLine ?? "";
  const pick = (re) => line.match(re)?.[1]?.trim();
  switch (item.item) {
    case "load-postcodes": {
      const edition = pick(/edition ([^·(]+)/);
      return edition ? `edition ${edition}` : "updated";
    }
    case "load-crime": {
      const window = pick(/window ([^·]+)/);
      return window ? `data window ${window.replace("..", " to ")}` : "updated";
    }
    case "load-crime-national": {
      const total = pick(/England 12-month total ([\d,]+)/);
      return total ? `England 12-month total ${total}` : "updated";
    }
    case "load-schools": {
      const gias = pick(/GIAS (\d{4}-\d{2}-\d{2})/);
      return gias ? `register dated ${gias}` : "updated";
    }
    case "load-sold-prices": {
      const edition = pick(/edition (\d{4})-(\d{2})-(\d{2})/);
      if (!edition) return "updated";
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      const parts = line.match(/edition (\d{4})-(\d{2})-(\d{2})/);
      return `sales file dated ${Number(parts[3])} ${months[Number(parts[2]) - 1]} ${parts[1]}`;
    }
    case "load-epc": {
      const counts = [...line.matchAll(/(\d+) certificates/g)].map((m) => Number(m[1]));
      return counts.length
        ? `${counts.reduce((a, b) => a + b, 0)} certificates checked`
        : "updated";
    }
    case "load-health": {
      const ods = pick(/ODS (\d{4}-\d{2}-\d{2})/);
      return ods ? `lists dated ${ods}` : "updated";
    }
    case "load-nurseries": {
      const filed = pick(/(\d+) group settings filed/);
      return filed ? `${filed} nurseries filed` : "updated";
    }
    case "load-planning-areas": {
      const areas = pick(/conservation areas: (\d+) filed/);
      return areas ? `${areas} conservation areas filed` : "updated";
    }
    case "load-green-belt": {
      const pieces = pick(/(\d+) pieces filed/);
      return pieces ? `${pieces} green belt pieces` : "updated";
    }
    case "load-heritage": {
      const buildings = pick(/listed buildings: (\d+) filed/);
      return buildings ? `${buildings} listed buildings` : "updated";
    }
    case "load-nature-designations": {
      const sssi = pick(/SSSI: (\d+) features filed/);
      return sssi ? `${sssi} SSSIs filed` : "updated";
    }
    case "load-priority-habitats": {
      const patches = pick(/(\d+) patches filed/);
      return patches ? `${patches} habitat patches` : "updated";
    }
    case "load-flood-zones": {
      const filed = pick(/(\d+) features filed/);
      return filed ? `${filed} flood zone shapes filed` : "updated";
    }
    case "load-flood-rivers-sea": {
      const filed = pick(/(\d+) features filed/);
      return filed ? `${filed} rivers & sea shapes filed` : "updated";
    }
    case "load-flood-surface-water": {
      const filed = pick(/(\d+) features filed/);
      return filed ? `${filed} surface water shapes filed` : "updated";
    }
    case "load-flood-defences": {
      const filed = pick(/(\d+) features filed/);
      return filed ? `${filed} flood defences filed` : "updated";
    }
    case "load-flood-rivers-sea-climate": {
      const filed = pick(/(\d+) features filed/);
      return filed ? `${filed} rivers & sea climate shapes filed` : "updated";
    }
    case "load-flood-surface-water-climate": {
      const filed = pick(/(\d+) features filed/);
      return filed ? `${filed} surface water climate shapes filed` : "updated";
    }
    case "load-transport": {
      const filed = pick(/(\d+) transport stops filed/);
      return filed ? `${filed} transport stops filed` : "updated";
    }
    case "load-osm-places": {
      const filed = pick(/(\d+) places filed/);
      return filed ? `${filed} places filed` : "updated";
    }
    case "load-os-greenspace": {
      const filed = pick(/(\d+) points filed/);
      if (filed) return `${filed} park points filed`;
      const unchanged = pick(/edition (\S+) is unchanged/);
      return unchanged ? `edition ${unchanged} unchanged` : "updated";
    }
    case "load-ev-chargers": {
      const filed = pick(/(\d+) charging sites filed/);
      return filed ? `${filed} charging sites filed` : "updated";
    }
    case "load-census": {
      const filed = pick(/(\d+) areas filed/);
      return filed ? `${filed} areas filed` : "updated";
    }
    case "load-lsoa-bases": {
      const filed = pick(/(\d+) areas filed/);
      return filed ? `${filed} small areas sized` : "updated";
    }
    case "load-claimant-count": {
      const filed = pick(/(\d+) area-months filed/);
      return filed ? `${filed} area-months filed` : "updated";
    }
    case "load-dwp-uc": {
      const filed = pick(/uc_people: (\d+) areas/);
      return filed ? `${filed} areas filed for people on Universal Credit` : "updated";
    }
    case "load-council-tax": {
      const filed = pick(/(\d+) authorities filed/);
      return filed ? `${filed} councils' charges filed` : "updated";
    }
    case "load-tribunal-building-safety": {
      const filed = pick(/(\d+) cases filed/);
      const failures = pick(/parse failures: (\d+)/);
      if (!filed) return "updated";
      return failures && Number(failures) > 0
        ? `${filed} building-safety cases filed · ${failures} published documents could not be read (named in the run record)`
        : `${filed} building-safety cases filed`;
    }
    case "load-pvgis": {
      const filed = pick(/([\d,]+) cells filed/);
      return filed ? `${filed} solar cells filed` : "updated";
    }
    case "load-company-ownership": {
      const filed = pick(/(\d+) company-owned titles filed/);
      return filed ? `${filed} company-owned titles filed` : "updated";
    }
    case "load-charging-zones": {
      const filed = pick(/(\d+) schemes filed/);
      return filed ? `${filed} charging-zone schemes filed` : "updated";
    }
    default:
      return "updated";
  }
}

export function humanLine(item) {
  const name = FRIENDLY_NAMES[item.item] ?? item.item;
  if (item.status === "succeeded")
    return { icon: "OK", text: `${name} — updated fine (${shortDetail(item)}).` };
  if (item.status === "skipped")
    return {
      icon: "SKIP",
      text: `${name} — skipped: ${(item.logLine ?? "").replace(/^skipped — /, "")}`,
    };
  if (item.status === "warning")
    return { icon: "WARN", text: `${name} — noted, not alerting: ${item.logLine ?? ""}` };
  const reason = errorHeadline(item.errorMessage).slice(0, 160);
  if (item.mode === "probe") {
    return {
      icon: "FAIL",
      text: `${name} — early warning: this source changed shape or went stale, so the next real load may fail. Reason: ${reason}`,
    };
  }
  return {
    icon: "FAIL",
    text: `${name} — FAILED. Nothing was filed, so the site keeps showing the previous figures. Reason: ${reason}`,
  };
}

export function buildEmailBodies(run, items, recordNote) {
  const loads = items.filter((i) => i.mode !== "probe");
  const failed = items.filter((i) => i.status === "failed");
  const failedLoads = failed.filter((i) => i.mode !== "probe");
  const skipped = items.filter((i) => i.status === "skipped");
  const human = items.map(humanLine);

  let happened;
  if (failedLoads.length > 0) {
    happened = `${failedLoads.length} of ${loads.length} fact collectors failed (${failedLoads.map((i) => FRIENDLY_NAMES[i.item] ?? i.item).join(", ")}). The rest updated normally.`;
  } else if (failed.length > 0) {
    happened = `All ${loads.length} fact collectors updated normally, but ${failed.length} early-warning check(s) failed.`;
  } else {
    happened = `All ${loads.length} fact collectors updated normally${skipped.length > 0 ? ` (${skipped.length} not due and skipped)` : ""}.`;
  }

  let needsYou;
  if (failedLoads.length > 0) {
    needsYou =
      "Nothing urgent — the site is serving the last good figures for anything that failed. When convenient, raise it in the Property Checker implementation chat; the full failure record is in the loader_runs tables (reference below).";
  } else if (failed.length > 0) {
    needsYou =
      "Nothing is broken yet. A source has changed shape or gone stale, which may break the next monthly load — worth raising in the Property Checker implementation chat.";
  } else {
    needsYou = "Nothing. This is the regular confirmation that the facts refreshed.";
  }

  const reference = `Reference: run ${run.id} · ${run.kind} · ${run.environment} · started ${run.startedAt.toISOString()} · ${recordNote ?? "full record in the loader_runs tables."}`;
  const detailLines = items.map(
    (i) =>
      `${i.status.toUpperCase().padEnd(9)} ${i.item} — ${i.logLine ?? (i.errorMessage ? errorHeadline(i.errorMessage) : "")}`,
  );

  const text = [
    "WHAT HAPPENED",
    happened,
    "",
    "WHAT YOU NEED TO DO",
    needsYou,
    "",
    "COLLECTOR BY COLLECTOR",
    ...human.map((h) => `${h.icon.padEnd(4)} ${h.text}`),
    "",
    "TECHNICAL DETAIL (the collectors' own log lines)",
    ...detailLines,
    "",
    reference,
  ].join("\n");

  const esc = (t) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const colour = { OK: "#1a7f37", SKIP: "#6e7781", WARN: "#bf8700", FAIL: "#cf222e" };
  const rows = human
    .map(
      (h) =>
        `<tr><td style="padding:6px 10px 6px 0;font-weight:bold;color:${colour[h.icon]}">${h.icon}</td><td style="padding:6px 0">${esc(h.text)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2328;line-height:1.5">
<h2 style="font-size:18px;margin:0 0 4px">What happened</h2>
<p style="margin:0 0 16px">${esc(happened)}</p>
<h2 style="font-size:18px;margin:0 0 4px">What you need to do</h2>
<p style="margin:0 0 16px">${esc(needsYou)}</p>
<h2 style="font-size:18px;margin:0 0 4px">Collector by collector</h2>
<table style="border-collapse:collapse;margin:0 0 16px">${rows}</table>
<h2 style="font-size:15px;margin:0 0 4px;color:#57606a">Technical detail</h2>
<pre style="white-space:pre-wrap;font-size:12px;color:#57606a;background:#f6f8fa;padding:12px;border-radius:6px">${esc(detailLines.join("\n"))}</pre>
<p style="font-size:12px;color:#6e7781">${esc(reference)}</p>
</div>`;
  return { text, html };
}

// --- email ----------------------------------------------------------

async function sendRunEmail(subject, text, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "failed", error: "RESEND_API_KEY is not set" };
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Check My Next Home <onboarding@resend.dev>",
          to: [ALERT_TO],
          subject,
          text,
          html,
        }),
      });
      if (!response.ok)
        throw new Error(`Resend HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      return { status: "sent", error: null };
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 5000));
    }
  }
  return { status: "failed", error: lastError?.message ?? "unknown send error" };
}

// --- loader execution -------------------------------------------------

export function runLoader(name, args, timeoutMs = DEFAULT_TIMEOUT_MINUTES * 60 * 1000) {
  return new Promise((resolve) => {
    const startedAt = new Date();
    execFile(
      process.execPath,
      [join(process.cwd(), "loaders", `${name}.mjs`), ...args],
      { maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs },
      (error, stdout, stderr) => {
        const finishedAt = new Date();
        const outLines = (stdout ?? "").split("\n").filter((l) => l.trim() !== "");
        const logLine =
          [...outLines].reverse().find((l) => l.startsWith("load-")) ?? outLines.at(-1) ?? null;
        // execFile kills a child that overruns its timeout and
        // reports it with killed set — that kill is the one
        // failure whose reason the loader cannot state itself,
        // so the runner states it, in the label's own words,
        // ahead of whatever output survived (D19).
        const timedOut = Boolean(error && error.killed);
        const rawError = error ? stderr || error.message : null;
        const errorMessage = !error
          ? null
          : timedOut
            ? `${formatTimeout(timeoutMs)}\n${rawError.slice(-3000)}`
            : rawError.slice(-4000);
        resolve({
          item: name,
          mode: args.includes("--file") ? "fixture" : "live",
          status: error ? "failed" : "succeeded",
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          logLine: error ? null : logLine,
          errorMessage,
          exitCode: error ? (typeof error.code === "number" ? error.code : 1) : 0,
        });
      },
    );
  });
}

// --- run record -------------------------------------------------------

async function openRecord(run) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(
    `INSERT INTO loader_runs (id, kind, environment, trigger_source, status, started_at)
     VALUES ($1,$2,$3,$4,'running',$5)`,
    [run.id, run.kind, run.environment, run.trigger, run.startedAt],
  );
  return client;
}

async function recordItems(client, runId, items) {
  for (const i of items) {
    await client.query(
      `INSERT INTO loader_run_items (run_id, item, mode, status, started_at, finished_at, duration_ms, source_name, source_date, log_line, error_message, exit_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        runId,
        i.item,
        i.mode,
        i.status,
        i.startedAt ?? null,
        i.finishedAt ?? null,
        i.durationMs ?? null,
        i.sourceName ?? null,
        i.sourceDate ?? null,
        i.logLine ?? null,
        i.errorMessage ?? null,
        i.exitCode ?? null,
      ],
    );
  }
}

async function closeRecord(client, run, items, alert) {
  const { status, subject } = summariseRun(run.kind, items);
  await client.query(
    `UPDATE loader_runs SET status = $2, finished_at = $3, alert_status = $4, alert_sent_at = $5, alert_error = $6, summary = $7 WHERE id = $1`,
    [
      run.id,
      status,
      new Date(),
      alert.status,
      alert.status === "sent" ? new Date() : null,
      alert.error ?? null,
      subject,
    ],
  );
}

// --- main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const canaryOnly = args.includes("--canary-only");
  const noEmail = args.includes("--no-email");
  const noCanary = args.includes("--no-canary");
  const fileAt = args.indexOf("--file");
  const fixtureRoot = fileAt !== -1 ? args[fileAt + 1] : null;
  const kindAt = args.indexOf("--kind");
  const run = {
    id: randomUUID(),
    kind: canaryOnly ? "canary" : kindAt !== -1 ? args[kindAt + 1] : "load",
    environment: process.env.RUNNER_ENV ?? (fixtureRoot ? "local" : "local"),
    trigger: process.env.RUNNER_TRIGGER ?? "manual",
    startedAt: new Date(),
  };
  const items = [];

  // --timers prints the schedule registry and exits: no probes,
  // no loads, no record, no email (plan step M5.15).
  if (args.includes("--timers")) {
    console.log(formatTimers());
    return;
  }

  if (!noCanary || canaryOnly) {
    const probes = await runCanaryProbes();
    items.push(...probes);
    for (const p of probes) console.log(p.logLine ?? `canary ${p.item} FAILED — ${p.errorMessage}`);
  }

  let client = null;
  let recordNote = null;
  try {
    client = await openRecord(run);
  } catch (error) {
    recordNote = `run record fell back to file (${error.message})`;
  }

  if (!canaryOnly) {
    if (fixtureRoot) {
      const fx = (name) => join(fixtureRoot, name);
      const runAndLog = async (name, loaderArgs) => {
        const outcome = await runLoader(name, loaderArgs);
        console.log(
          outcome.logLine ?? `${outcome.item} FAILED — ${errorHeadline(outcome.errorMessage)}`,
        );
        items.push(outcome);
      };
      await runAndLog("load-postcodes", ["--file", fx("onspd")]);
      await runAndLog("load-sold-prices", ["--file", fx("land-registry"), ...GOLDEN_POSTCODES]);
      // The crime fixture was captured for the two original
      // golden postcodes, so its fixture run takes those two;
      // sold prices tolerates all three. The EPC fixture also
      // covers KT17 1FH (captured at M6.14), but the practice
      // directory excerpt holds CM and E areas only — there is
      // no KT17 row for the loader to file against — so its
      // fixture run takes the original two as well.
      await runAndLog("load-crime", ["--file", fx("police-uk"), "CM3 2JT", "E16 1GN"]);
      await runAndLog("load-epc", ["--file", fx("epc"), "CM3 2JT", "E16 1GN"]);
      await runAndLog("load-schools", ["--file", fx("schools")]);
      await runAndLog("load-health", ["--file", fx("health")]);
      await runAndLog("load-nurseries", ["--file", fx("nurseries")]);
      await runAndLog("load-planning-areas", ["--file", fx("planning-areas")]);
      await runAndLog("load-green-belt", ["--file", fx("green-belt")]);
      await runAndLog("load-heritage", ["--file", fx("heritage")]);
      await runAndLog("load-brownfield", ["--file", fx("brownfield")]);
      await runAndLog("load-built-up-areas", ["--file", fx("built-up-areas")]);
      await runAndLog("load-aqma", ["--file", fx("aqma")]);
      await runAndLog("load-charging-zones", ["--file", fx("charging-zones")]);
      await runAndLog("load-nature-designations", ["--file", fx("nature-designations")]);
      await runAndLog("load-priority-habitats", ["--file", fx("priority-habitats")]);
      await runAndLog("load-flood-zones", ["--file", fx("flood-zones")]);
      await runAndLog("load-flood-rivers-sea", ["--file", fx("flood-rivers-sea")]);
      await runAndLog("load-flood-surface-water", ["--file", fx("flood-surface-water")]);
      await runAndLog("load-flood-defences", ["--file", fx("flood-defences")]);
      await runAndLog("load-flood-rivers-sea-climate", ["--file", fx("flood-rivers-sea-climate")]);
      await runAndLog("load-flood-surface-water-climate", [
        "--file",
        fx("flood-surface-water-climate"),
      ]);
      await runAndLog("load-transport", ["--file", fx("transport")]);
      await runAndLog("load-osm-places", ["--file", fx("osm-places")]);
      await runAndLog("load-os-greenspace", ["--file", fx("os-greenspace")]);
      await runAndLog("load-ev-chargers", ["--file", fx("ev-chargers")]);
      await runAndLog("load-census", ["--file", fx("census")]);
      await runAndLog("load-lsoa-bases", ["--file", fx("lsoa-bases")]);
      // The England crime totals (M6.20) run AFTER the LSOA
      // bases in the fixture pass, deliberately: the national
      // loader embeds the window figure into the crime
      // artefacts the earlier crime run filed, and the
      // embedding needs the bases filed for its denominator.
      // Embedded in this first pass, the figure is part of
      // the practice snapshot — and the loader's
      // embed-only-on-change rule keeps a later pass from
      // moving the artefacts again (the break-crime proof
      // diffs the crime answers across its scenario run).
      await runAndLog("load-crime-national", ["--file", fx("police-uk-national")]);
      await runAndLog("load-claimant-count", ["--file", fx("claimant-count")]);
      await runAndLog("load-dwp-uc", ["--file", fx("dwp-uc")]);
      await runAndLog("load-imd", ["--file", fx("imd")]);
      await runAndLog("load-air-quality", ["--file", fx("air")]);
      await runAndLog("load-pvgis", ["--file", fx("pvgis")]);
      await runAndLog("load-noise", ["--file", fx("noise")]);
      await runAndLog("load-broadband", ["--file", fx("broadband")]);
      await runAndLog("load-mobile", ["--file", fx("mobile")]);
      await runAndLog("load-council-tax", ["--file", fx("council-tax")]);
      await runAndLog("load-tribunal-building-safety", ["--file", fx("tribunal-building-safety")]);
      await runAndLog("load-company-ownership", ["--file", fx("company-ownership")]);
    } else {
      if (!client) throw new Error("a live run needs the run-record database (DATABASE_URL)");
      const lastSuccess = async (item) => {
        const res = await client.query(
          `SELECT max(finished_at) AS last FROM loader_run_items WHERE item = $1 AND status = 'succeeded'`,
          [item],
        );
        return res.rows[0].last;
      };
      const directoryCount = await client.query("SELECT count(*)::int AS n FROM postcode_cache");
      const hasDirectory = directoryCount.rows[0].n > 0;

      const plan = [];
      const postcodesDue = dueDecision(
        await lastSuccess("load-postcodes"),
        thresholdDaysFor("load-postcodes"),
      );
      plan.push({ item: "load-postcodes", due: postcodesDue, args: [] });

      const targets = { sold: new Set(), crime: new Set(), epc: new Set() };
      const soldRows = await client.query("SELECT DISTINCT postcode FROM price_paid");
      soldRows.rows.forEach((r) => targets.sold.add(r.postcode));
      const answerRows = await client.query(
        "SELECT postcode, answers FROM postcode_cache WHERE answers IS NOT NULL",
      );
      for (const row of answerRows.rows) {
        if (row.answers && "crime" in row.answers) targets.crime.add(row.postcode);
        if (row.answers && "epc" in row.answers) targets.epc.add(row.postcode);
      }
      if (targets.sold.size === 0 && targets.crime.size === 0 && targets.epc.size === 0) {
        GOLDEN_POSTCODES.forEach((pc) => {
          targets.sold.add(pc);
          targets.crime.add(pc);
          targets.epc.add(pc);
        });
      }
      for (const [item, set, loaderArgs] of [
        ["load-sold-prices", targets.sold, [...targets.sold]],
        ["load-crime", targets.crime, [...targets.crime]],
        ["load-epc", targets.epc, [...targets.epc]],
      ]) {
        void set;
        plan.push({
          item,
          due: dueDecision(await lastSuccess(item), thresholdDaysFor(item)),
          args: loaderArgs,
        });
      }
      plan.push({
        item: "load-schools",
        due: dueDecision(await lastSuccess("load-schools"), thresholdDaysFor("load-schools")),
        args: [],
      });
      plan.push({
        item: "load-health",
        due: dueDecision(await lastSuccess("load-health"), thresholdDaysFor("load-health")),
        args: [],
      });
      // Nurseries (plan step M5.17) are quarterly: Ofsted's
      // childcare register publishes twice a year (as at
      // 30 June and 31 December), so the quarterly class is
      // the coarsest timed class that still discovers each
      // new edition within one cycle — the OS Greenspace
      // twice-a-year precedent. The loader positions settings
      // from the postcode directory, so like schools and
      // health it is NOT directory-free: the empty-directory
      // skip below applies to it.
      plan.push({
        item: "load-nurseries",
        due: dueDecision(await lastSuccess("load-nurseries"), thresholdDaysFor("load-nurseries")),
        args: [],
      });
      // The M5.1 flood datasets, the M5.2 planning and heritage
      // datasets, the M5.3 nature designations, the M5.5
      // transport stops and the M5.6 nearby places are
      // quarterly, on the postcode directory's 70-day rhythm —
      // they file shapes and points from their own files and
      // never join onto the directory, so the empty-directory
      // skip below does not apply to them. The M5.14 tribunal
      // building-safety decisions join them: a small corpus
      // re-read whole each pass from GOV.UK, filing by case
      // reference. Two former members of this loop left it at
      // M5.15 (decision D19): the EV chargers moved to the
      // monthly class below (Open Charge Map changes daily),
      // and priority habitats left the timed runs entirely —
      // it is an operator job now, planned as one just after
      // this loop.
      for (const item of [
        "load-planning-areas",
        "load-green-belt",
        "load-heritage",
        "load-nature-designations",
        "load-flood-zones",
        "load-flood-rivers-sea",
        "load-flood-surface-water",
        "load-flood-defences",
        "load-flood-rivers-sea-climate",
        "load-flood-surface-water-climate",
        "load-transport",
        "load-osm-places",
        "load-os-greenspace",
        "load-tribunal-building-safety",
      ]) {
        plan.push({
          item,
          due: dueDecision(await lastSuccess(item), thresholdDaysFor(item)),
          args: [],
        });
      }
      // Priority habitats (M5.3) is an operator job (M5.15 /
      // D19): the mirror pages 818,225 patches with no resume,
      // so a timed kill would restart it at page 0 and no
      // duration measurement shows it fitting the window. The
      // timed runner never runs it; the plan entry exists so
      // every run's record and email lists it as SKIPPED with
      // the date it last filed.
      plan.push({ item: "load-priority-habitats", operator: true, args: [] });
      // EV chargers (M5.7) are monthly since M5.15 (D19): Open
      // Charge Map changes daily, so the quarterly rhythm was
      // the one cadence that did not match its publisher.
      plan.push({
        item: "load-ev-chargers",
        due: dueDecision(
          await lastSuccess("load-ev-chargers"),
          thresholdDaysFor("load-ev-chargers"),
        ),
        args: [],
      });
      // Census 2021 (plan step M5.8) is the static class:
      // due exactly once, when it has never loaded, and
      // never automatically again — the nomis-census canary
      // watches for a republication, and a re-file after one
      // is a manual operator re-run. It files by MSOA code
      // from its own files, so it is directory-free too.
      plan.push({
        item: "load-census",
        due: dueDecision(await lastSuccess("load-census"), thresholdDaysFor("load-census")),
        args: [],
      });
      // The M5.16 LSOA Census base totals are the static
      // class too (a Census-Day filing, like the census
      // itself), and directory-free: they file by LSOA code
      // from the same bulk zips.
      plan.push({
        item: "load-lsoa-bases",
        due: dueDecision(await lastSuccess("load-lsoa-bases"), thresholdDaysFor("load-lsoa-bases")),
        args: [],
      });
      // Council tax (plan step M5.10) is the manual class
      // the static pattern was named for: a seed filed by
      // hand from the publishers' annual releases, due
      // exactly once and never automatically again — the
      // operator re-runs it each spring when the new year's
      // releases land, and the mhclg-council-tax canary
      // watches for both the new release and a revision of
      // the filed one. It files by billing-authority code
      // from its own sources, so it is directory-free.
      plan.push({
        item: "load-council-tax",
        due: dueDecision(
          await lastSuccess("load-council-tax"),
          thresholdDaysFor("load-council-tax"),
        ),
        args: [],
      });
      // The M5.16 benefits loaders are the monthly class
      // (25 days, like crime and sold prices): the Claimant
      // Count publishes monthly; Universal Credit data
      // points publish quarterly, so most monthly UC runs
      // file only the re-file window. Two separate items
      // under the one step (the flood precedent): the UC
      // loader's Stat-Xplore key dependency must never
      // stall the keyless claimant filing. Both file by
      // LSOA from their own sources — directory-free.
      plan.push({
        item: "load-claimant-count",
        due: dueDecision(
          await lastSuccess("load-claimant-count"),
          thresholdDaysFor("load-claimant-count"),
        ),
        args: [],
      });
      plan.push({
        item: "load-dwp-uc",
        due: dueDecision(await lastSuccess("load-dwp-uc"), thresholdDaysFor("load-dwp-uc")),
        args: [],
      });
      // Company ownership (plan step M5.13) is the monthly
      // class too: CCOD/OCOD republish monthly and the
      // Companies House snapshot with them, and each pass
      // replaces both datasets wholesale. It files its own
      // tables from its own sources — directory-free. (The
      // data files as preparation only: the
      // COMPANY_OWNERSHIP_ENABLED flag gates everything
      // user-facing, per decision D18.)
      plan.push({
        item: "load-company-ownership",
        due: dueDecision(
          await lastSuccess("load-company-ownership"),
          thresholdDaysFor("load-company-ownership"),
        ),
        args: [],
      });
      // England crime totals (plan step M6.20, decision D39)
      // are the monthly class: Police.uk publishes a new
      // month on the same rhythm as the crime counts, and
      // each run counts only the months with no filed row
      // (the first fill is the 12-month backfill; the filed
      // rows are the resume state). The entry sits late in
      // the plan deliberately: its second job is embedding
      // the window figure into filed crime artefacts, and
      // that pass reads whatever this run's crime load (and
      // every earlier run) filed. It files its own table —
      // directory-free.
      plan.push({
        item: "load-crime-national",
        due: dueDecision(
          await lastSuccess("load-crime-national"),
          thresholdDaysFor("load-crime-national"),
        ),
        args: [],
      });
      // The M5.9 datasets are the static class too: IMD is a
      // decennial-style index watched by the govuk-iod canary,
      // PCM air is republished on a multi-year cycle watched by
      // its canary, and the Ofcom releases land twice a year,
      // watched by the ofcom canaries — each files exactly
      // once, then only on an operator re-run. IMD and air
      // file their own tables and are directory-free; broadband
      // and mobile merge into the postcode directory's answers,
      // so the empty-directory skip applies to them. Noise,
      // the fifth M5.9 dataset, is NOT here: since M5.15 (D19)
      // it is an operator job, planned as one just below.
      // Solar (plan step M5.18) joins the static class here:
      // PVGIS radiation databases revise on a multi-year cycle,
      // so the sampled grid files exactly once and a new
      // vintage is an operator re-run. Its cell set is derived
      // from the postcode directory, so it is NOT directory-free
      // either — the empty-directory skip applies to it too.
      for (const item of [
        "load-imd",
        "load-air-quality",
        "load-broadband",
        "load-mobile",
        "load-pvgis",
      ]) {
        plan.push({
          item,
          due: dueDecision(await lastSuccess(item), thresholdDaysFor(item)),
          args: [],
        });
      }
      // Noise (M5.9) is an operator job (M5.15 / D19): the
      // national Round 4 pass samples WCS tiles for hours, far
      // outside any timed window, and as a static-class loader
      // that had never succeeded it was due on EVERY run —
      // each monthly run would have burned its full timeout on
      // it, recorded FAILED and failed the whole run, for a job
      // progressing exactly as designed. The plan entry exists
      // so every run's record and email lists it as SKIPPED
      // with the date it last filed.
      plan.push({ item: "load-noise", operator: true, args: [] });
      const DIRECTORY_FREE = new Set([
        "load-planning-areas",
        "load-green-belt",
        "load-heritage",
        "load-nature-designations",
        "load-priority-habitats",
        "load-flood-zones",
        "load-flood-rivers-sea",
        "load-flood-surface-water",
        "load-flood-defences",
        "load-flood-rivers-sea-climate",
        "load-flood-surface-water-climate",
        "load-transport",
        "load-osm-places",
        "load-os-greenspace",
        "load-ev-chargers",
        "load-census",
        "load-lsoa-bases",
        "load-claimant-count",
        "load-dwp-uc",
        "load-imd",
        "load-air-quality",
        "load-noise",
        "load-council-tax",
        "load-tribunal-building-safety",
        "load-company-ownership",
        "load-crime-national",
      ]);

      for (const step of plan) {
        // Operator jobs (M5.15 / D19) are never run by the
        // timer: the item is recorded and emailed as SKIPPED,
        // with the date the loader last filed, and nothing else
        // about the run depends on them.
        if (step.operator) {
          items.push({
            item: step.item,
            mode: "live",
            status: "skipped",
            logLine: operatorSkipLine(step.item, await lastSuccess(step.item)),
            durationMs: 0,
          });
          continue;
        }
        if (!step.due.due) {
          items.push({
            item: step.item,
            mode: "live",
            status: "skipped",
            logLine: `skipped — ${step.due.reason}`,
            durationMs: 0,
          });
          continue;
        }
        if (step.item !== "load-postcodes" && !DIRECTORY_FREE.has(step.item) && !hasDirectory) {
          items.push({
            item: step.item,
            mode: "live",
            status: "skipped",
            logLine: "skipped — no postcode directory to join onto",
            durationMs: 0,
          });
          continue;
        }
        const outcome = await runLoader(step.item, step.args, timeoutMsFor(step.item));
        console.log(
          outcome.logLine ?? `${outcome.item} FAILED — ${errorHeadline(outcome.errorMessage)}`,
        );
        items.push(outcome);
      }
    }
  }

  const { status, subject } = summariseRun(run.kind, items);
  const bodies = buildEmailBodies(run, items, recordNote);
  const alert = noEmail
    ? { status: "not_required", error: null }
    : await sendRunEmail(subject, bodies.text, bodies.html);
  if (!noEmail && alert.status !== "sent") console.error(`ALERT FAILED: ${alert.error}`);

  if (client) {
    try {
      await recordItems(client, run.id, items);
      await closeRecord(client, run, items, alert);
    } catch (error) {
      recordNote = `run record fell back to file (${error.message})`;
      client = null;
    }
  }
  if (!client) {
    await appendFile(
      join(process.cwd(), "loader-runs-fallback.jsonl"),
      `${JSON.stringify({ run, items, alert, status, subject })}\n`,
    ).catch(() => {});
    if (recordNote) console.error(recordNote);
  }
  if (client) await client.end();

  console.log(subject.replace(/^\[Check My Next Home\] /, ""));
  process.exitCode = decideExitCode({ items, alertStatus: alert.status, noEmail });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`run-loaders FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
