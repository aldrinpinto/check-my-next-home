// Schools loader (plan step M4.6). Files every open establishment
// from the DfE register (GIAS) plus the latest Ofsted position per
// school, following the user-seat gap check of 12 Nov 2026:
//
//   npm run load:schools
//   npm run load:schools -- --verify-only
//   npm run load:schools -- --file tests/fixtures/schools
//
// What the gap check changed, and where it lives in this file:
//   - The selective flag is the register's own AdmissionsPolicy
//     value, filed raw. Blank stays NULL — it means "not recorded",
//     never "non-selective" — so every selective count the product
//     states is a count of recorded values.
//   - Ofsted outcomes file the newest inspection truthfully: the
//     last graded (OEIF) word and ITS date, the newest inspection
//     event of any framework, the ungraded outcome where that is
//     the newest evidence, and the report-card area judgements
//     where the newest inspection is a report card (no overall
//     grade exists for those, and none is invented).
//   - Schools with no coordinates in the register are filed at
//     their own postcode's position (from the M4.1 directory) with
//     position_approximate set — a school must never silently
//     vanish from a nearest list. Only schools whose postcode is
//     not in the directory either are skipped, and counted.
//   - Every open establishment is filed, whatever its phase —
//     filtering by phase at load time would erase most special
//     schools and sixth forms. Grouping is a display choice.
//   - Catchments are NOT filed: no national dataset exists. The
//     product answers with distances and links out by local
//     authority, so each school's LA code and name are filed.
//
// Sources: GIAS daily extract (date-stamped URL, GET only — HEAD
// returns 500; Windows-1252 encoding; columns chosen by header
// name because DfE warns the order can change) and Ofsted's
// monthly management-information "latest inspections" CSV (its
// asset link changes each release, so it is discovered from the
// gov.uk data-set page every run). Both Open Government Licence
// v3.0. Coordinates arrive as Easting/Northing (EPSG:27700) and
// are converted to WGS84 here (proj4); distances are haversine
// miles, the same basis as the approved reports.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import proj4 from "proj4";
import {
  clearCheckpoint,
  clearStaging,
  createLoaderResume,
  stagingCount,
} from "./loader-resume.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
  withFilingPulse,
} from "./progress.mjs";

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
    "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);
const toLatLng = (easting, northing) => {
  const [lng, lat] = proj4("EPSG:27700", "EPSG:4326", [easting, northing]);
  return { lat, lng };
};

const GIAS_URL = (yyyymmdd) =>
  `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${yyyymmdd}.csv`;
const OFSTED_PAGE =
  "https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes";
const SOURCE_SCHOOLS = "Get Information About Schools (DfE)";
const SOURCE_OFSTED = "Ofsted management information (state-funded schools)";

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};
const GRADE_WORDS = { 1: "Outstanding", 2: "Good", 3: "Requires improvement", 4: "Inadequate" };
const REPORT_CARD_AREAS = [
  "Safeguarding standards",
  "Inclusion",
  "Curriculum and teaching",
  "Achievement",
  "Attendance and behaviour",
  "Personal development and wellbeing",
  "Early years (where applicable)",
  "Post-16 provision (where applicable)",
  "Leadership and governance",
];

function haversineMiles(aLat, aLng, bLat, bLng) {
  const R = 3958.7613;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// One CSV parser for both files: quote-aware, header-keyed. The
// register file is decoded from Windows-1252 by the caller.
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

const blank = (v) => (v === undefined || v === "" || v === "NULL" ? null : v);
function ukDate(v) {
  const s = blank(v);
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
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
  const response = await fetchResponse(url, url, opts);
  return response;
}

async function fetchGias(opts = {}) {
  for (let back = 0; back < 7; back += 1) {
    const day = new Date(Date.now() - back * 86400000);
    const stamp = day.toISOString().slice(0, 10).replaceAll("-", "");
    let response;
    try {
      // BUG-385: a 404 is the day's file not being
      // published yet — walk back a day, as before. Any
      // other failure (a transient past its budget, or a
      // non-transient status) fails the run instead of
      // silently filing an older extract.
      response = await fetchResponse(GIAS_URL(stamp), GIAS_URL(stamp), opts);
    } catch (error) {
      if (error?.status === 404) continue;
      throw error;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      text: new TextDecoder("windows-1252").decode(buffer),
      edition: day.toISOString().slice(0, 10),
    };
  }
  throw new Error("no GIAS extract found for the last 7 days");
}

async function fetchOfsted() {
  const page = await (await fetchText(OFSTED_PAGE)).text();
  const links = [
    ...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"']+\.csv/g),
  ].map((m) => m[0]);
  // The page carries the whole archive back to 2017 — hundreds of
  // links — so "latest inspections" files are compared by the
  // as-at date in their filename and the newest wins. Mistaking an
  // old release for the current one is exactly the failure this
  // guards against.
  const months = {
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
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Sept: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const candidates = [];
  for (const url of links) {
    if (!/latest_inspections/i.test(url)) continue;
    const m = url.match(/(?:as_at|at)_(\d{1,2})_([A-Za-z]+)_(\d{4})/);
    if (!m || !months[m[2]]) continue;
    candidates.push({ url, asAt: `${m[3]}-${months[m[2]]}-${m[1].padStart(2, "0")}` });
  }
  candidates.sort((a, b) => (a.asAt < b.asAt ? 1 : -1));
  const newest = candidates[0];
  if (!newest)
    throw new Error("could not find a dated latest-inspections CSV on the Ofsted data-set page");
  const ageDays = (Date.now() - new Date(`${newest.asAt}T00:00:00Z`).getTime()) / 86400000;
  if (ageDays > 100)
    throw new Error(
      `the newest latest-inspections file findable is as at ${newest.asAt} — too old to trust`,
    );
  const buffer = Buffer.from(await (await fetchText(newest.url)).arrayBuffer());
  return { text: new TextDecoder("utf-8").decode(buffer), asAt: newest.asAt };
}

function buildOutcome(row) {
  if (!row) return null;
  const rating = GRADE_WORDS[blank(row["Latest OEIF overall effectiveness"]) ?? ""] ?? null;
  const inspectionDate = ukDate(row["Inspection start date of latest OEIF graded inspection"]);
  const fullType = blank(row["Inspection type"]);
  const fullDate = ukDate(row["Inspection start date"]);
  const ungradedDate = ukDate(row["Date of latest ungraded inspection"]);
  let eventType;
  let eventDate;
  if (fullDate && (!ungradedDate || fullDate >= ungradedDate)) {
    eventType = fullType;
    eventDate = fullDate;
  } else if (ungradedDate) {
    eventType = "Ungraded inspection";
    eventDate = ungradedDate;
  } else {
    eventType = blank(row["Inspection type of latest OEIF graded inspection"]);
    eventDate = inspectionDate;
  }
  let reportCard = null;
  if (eventType === fullType && eventDate === fullDate && fullDate) {
    const areas = {};
    for (const area of REPORT_CARD_AREAS) {
      const value = blank(row[area]);
      if (value && value !== "Not applicable") areas[area] = value;
    }
    if (Object.keys(areas).length > 0) reportCard = areas;
  }
  return {
    rating,
    inspectionDate,
    latestEventType: eventType,
    latestEventDate: eventDate,
    ungradedOutcome: blank(row["Ungraded inspection overall outcome"]),
    reportCard,
    reportUrl: blank(row["Web Link"]),
  };
}

// -------------------------------------------------------------------

function buildSchool(row, resolvePostcode) {
  const easting = Number.parseInt(row["Easting"] ?? "", 10);
  const northing = Number.parseInt(row["Northing"] ?? "", 10);
  let lat = null;
  let lng = null;
  let approximate = false;
  if (Number.isFinite(easting) && Number.isFinite(northing) && (easting !== 0 || northing !== 0)) {
    ({ lat, lng } = toLatLng(easting, northing));
  } else {
    const fallback = resolvePostcode((row["Postcode"] ?? "").trim().toUpperCase());
    if (fallback) {
      lat = fallback.lat;
      lng = fallback.lng;
      approximate = true;
    }
  }
  const address = [row["Street"], row["Locality"], row["Town"]]
    .map((part) => (part ?? "").trim())
    .filter((part) => part !== "")
    .join(", ");
  const pupils = Number.parseInt(row["NumberOfPupils"] ?? "", 10);
  return {
    urn: (row["URN"] ?? "").trim(),
    name: (row["EstablishmentName"] ?? "").trim(),
    type: blank(row["TypeOfEstablishment (name)"]),
    phase: blank(row["PhaseOfEducation (name)"]),
    ageLow: Number.parseInt(row["StatutoryLowAge"] ?? "", 10) || null,
    ageHigh: Number.parseInt(row["StatutoryHighAge"] ?? "", 10) || null,
    address: address === "" ? null : address,
    postcode: (row["Postcode"] ?? "").trim().toUpperCase() || null,
    lat,
    lng,
    admissionsPolicy: blank(row["AdmissionsPolicy (name)"]),
    religiousCharacter: blank(row["ReligiousCharacter (name)"]),
    laCode: blank(row["LA (code)"]),
    laName: blank(row["LA (name)"]),
    gender: blank(row["Gender (name)"]),
    sixthForm: blank(row["OfficialSixthForm (name)"]),
    website: blank(row["SchoolWebsite"]),
    numberOfPupils: Number.isFinite(pupils) ? pupils : null,
    positionApproximate: approximate,
  };
}

function nearest(list, home, predicate, count) {
  return list
    .filter((s) => s.lat !== null && predicate(s))
    .map((s) => ({ school: s, miles: haversineMiles(home.lat, home.lng, s.lat, s.lng) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, count);
}

function checkGolden(schools, outcomes, fixtureMode) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  const byUrn = new Map(schools.map((s) => [s.urn, s]));

  // The plan's check: no selective secondary in Newham, purely from
  // data — and the two blank-policy schools filed as not recorded.
  const newhamSecondaries = schools.filter((s) => s.laName === "Newham" && s.phase === "Secondary");
  expect(
    newhamSecondaries.filter((s) => s.admissionsPolicy === "Selective").length === 0,
    "a selective secondary is filed in Newham — the 'no grammar school in Newham' claim needs review",
  );
  if (fixtureMode) {
    expect(
      newhamSecondaries.length === 17,
      `fixture: expected 17 Newham secondaries, got ${newhamSecondaries.length}`,
    );
  }
  for (const urn of ["142903", "149431"]) {
    if (byUrn.has(urn)) {
      expect(
        byUrn.get(urn).admissionsPolicy === null,
        `${byUrn.get(urn).name}: a blank admissions policy must file as NULL, never as non-selective`,
      );
    }
  }

  // Nearest selective secondaries sit across the borough border.
  const e16 = nearest(
    schools,
    HOMES["E16 1GN"],
    (s) => s.phase === "Secondary" && s.admissionsPolicy === "Selective",
    3,
  );
  const expectedE16 = [
    ["Bexley Grammar School", 5.49],
    ["Ilford County High School", 5.82],
    ["Woodford County High School", 6.36],
  ];
  expectedE16.forEach(([name, miles], i) => {
    expect(
      e16[i] && e16[i].school.name === name && Math.abs(e16[i].miles - miles) <= 0.06,
      `E16 1GN selective #${i + 1}: expected ${name} at ${miles} mi, got ${e16[i] ? `${e16[i].school.name} at ${e16[i].miles.toFixed(2)} mi` : "none"}`,
    );
  });

  // The flat's nearest selective is close — selectivity is a
  // per-school fact, never an area inference.
  const ktSelective = nearest(
    schools,
    HOMES["KT17 1FH"],
    (s) => s.admissionsPolicy === "Selective",
    1,
  );
  expect(
    ktSelective[0] &&
      ktSelective[0].school.name === "Nonsuch High School for Girls" &&
      Math.abs(ktSelective[0].miles - 1.25) <= 0.06,
    `KT17 1FH nearest selective: expected Nonsuch High School for Girls at 1.25 mi, got ${ktSelective[0] ? `${ktSelective[0].school.name} at ${ktSelective[0].miles.toFixed(2)} mi` : "none"}`,
  );

  // The two Hatfield Peverel primaries share one site: a tie.
  const cm3Primary = nearest(schools, HOMES["CM3 2JT"], (s) => s.phase === "Primary", 2);
  expect(
    cm3Primary.length === 2 &&
      Math.abs(cm3Primary[0].miles - 0.29) <= 0.03 &&
      Math.abs(cm3Primary[1].miles - cm3Primary[0].miles) < 0.005,
    "CM3 2JT: the two nearest primaries should be the Hatfield Peverel pair tied at 0.29 mi",
  );

  // Ofsted truthfulness on the golden schools.
  const maltings = outcomes.get("135653");
  expect(
    maltings &&
      maltings.rating === "Requires improvement" &&
      maltings.inspectionDate === "2023-09-19" &&
      maltings.reportCard &&
      maltings.reportCard["Curriculum and teaching"] === "Expected standard" &&
      maltings.reportCard["Achievement"] === "Needs attention" &&
      maltings.latestEventDate === "2026-03-24",
    "Lift Maltings must file its 2023 grade AND its March 2026 report card",
  );
  const plume = outcomes.get("137790");
  expect(
    plume && plume.rating === "Good" && plume.reportCard === null,
    "Plume School must file its plain Good grade with no report card",
  );
  const infant = outcomes.get("114974");
  expect(
    infant && infant.rating === null && infant.ungradedOutcome === "School remains Good",
    "Hatfield Peverel Infant must file 'no grade on record, ungraded: School remains Good'",
  );
  const blenheimSchool = schools.find((s) => s.name === "Blenheim High School");
  const blenheim = blenheimSchool ? outcomes.get(blenheimSchool.urn) : undefined;
  if (blenheimSchool) {
    expect(
      blenheim && blenheim.rating === null && blenheim.ungradedOutcome === "Standards maintained",
      "Blenheim High must file 'no grade on record, ungraded: Standards maintained'",
    );
  }
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

// --- filing ------------------------------------------------------------
//
// Stage, count, swap — with resume support (BUG-368): staging is
// a pair of PERSISTENT tables now (migration 0048), and a
// loader_checkpoint row records the last fully staged chunk, so a
// killed run resumes instead of restarting. beginSchoolsFiling
// opens the staging tables; stageSchools / stageOutcomes insert
// row by row as before, checkpointing every 200 rows; finishFiling
// runs the counts and the swap exactly as the one-shot filer did,
// in its own transaction. The swap replaces the whole schools and
// ofsted_outcomes tables in one transaction, so a failed run leaves
// the last good filing serving untouched.
//
// THE RESUME UNITS. One checkpoint row carries both tables: its
// filed_count is the schools staged (the handle's staged-prefix
// proof runs on schools_stage), its next_start_index is the
// schools + outcomes staged, and its state carries the two counts
// separately. Outcomes stage only after every school is staged,
// so a resumed run skips the staged schools, then the staged
// outcomes, re-staging nothing. The outcomes prefix is validated
// by hand in prepareResume (the handle proves schools_stage
// only): a gap there discards both tables and starts from zero.
// The edition is the GIAS extract date plus the Ofsted as-at date.
const CHECKPOINT_EVERY = 200;

/**
 * Open the filing run's resume handle (BUG-368). The client is
 * injectable so the resume tests can file against a fake
 * database; production passes the directory client main() already
 * opened. The filer never owns the client — main() closes it.
 *
 * @param {import("./progress.mjs").ProgressLogger | null} [progress]
 * @param {{ restart?: boolean, client?: any, giasEdition?: string | null, ofstedAsAt?: string | null }} [options]
 */
export async function beginSchoolsFiling(
  progress = null,
  { restart = false, client, giasEdition = null, ofstedAsAt = null } = {},
) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schools_stage (LIKE schools INCLUDING DEFAULTS, seq bigint NOT NULL, UNIQUE (seq))`,
  );
  await client.query(
    `CREATE TABLE IF NOT EXISTS outcomes_stage (LIKE ofsted_outcomes INCLUDING DEFAULTS, seq bigint NOT NULL, UNIQUE (seq))`,
  );
  const resume = createLoaderResume(client, {
    loader: "load-schools",
    stageTable: "schools_stage",
    progress,
    restart,
  });
  let edition = null;
  let schoolsTotal = 0;
  let outcomesTotal = 0;
  let schoolsFiled = 0;
  let outcomesFiled = 0;
  let outcomeSeqNext = 0;
  /** @type {{ resumed: boolean, reason?: string, checkpoint?: any, prefix?: boolean }} */
  let resumePrep = { resumed: false };
  async function checkpoint() {
    await resume.checkpoint({
      edition,
      expected: schoolsTotal + outcomesTotal,
      nextStartIndex: schoolsFiled + outcomesFiled,
      read: schoolsFiled + outcomesFiled,
      filed: schoolsFiled,
      state: { schoolsFiled, outcomesFiled },
      unit: "rows",
    });
  }
  async function discardAll(reason) {
    await clearStaging(client, "schools_stage");
    await clearStaging(client, "outcomes_stage");
    await clearCheckpoint(client, "load-schools");
    schoolsFiled = 0;
    outcomesFiled = 0;
    outcomeSeqNext = 0;
    progress?.stage(`discarding stale checkpoint · ${reason} · starting from 0`);
  }
  return {
    stagedCount: () => schoolsFiled + outcomesFiled,
    resumePrep: () => resumePrep,
    resumeNote: () => resume.resumeNote(),
    // Decide, from the edition and the staged rows, whether this
    // run resumes or starts from zero. Called once the read has
    // resolved the edition and the counts, before the first
    // school is staged.
    async prepareResume(ed, schoolsN, outcomesN) {
      edition = ed;
      schoolsTotal = schoolsN;
      outcomesTotal = outcomesN;
      resumePrep = await resume.prepare({
        edition,
        expected: schoolsTotal + outcomesTotal,
      });
      if (!resumePrep.resumed) return resumePrep;
      const cp = resumePrep.checkpoint;
      schoolsFiled = cp.filed_count;
      outcomesFiled = cp.state?.outcomesFiled ?? 0;
      // Outcomes stage only after every school is staged: a
      // checkpoint claiming outcomes with schools outstanding
      // is inconsistent, not a resume point.
      if (outcomesFiled > 0 && schoolsFiled !== schoolsTotal) {
        await discardAll(
          `the checkpoint claims ${outcomesFiled} staged outcomes with only ${schoolsFiled} of ${schoolsTotal} schools staged`,
        );
        return { resumed: false, reason: "inconsistent checkpoint" };
      }
      // The handle proved schools_stage; prove outcomes_stage
      // by hand the same way, and trim its interrupted tail —
      // the tail is trimmed even when no outcome checkpoint
      // exists yet (a kill mid-chunk leaves flushed rows
      // past a zero count, and the resumed run re-stages them).
      const stagedOut = await stagingCount(client, "outcomes_stage");
      if (outcomesFiled > 0) {
        const prefixSum = (outcomesFiled * (outcomesFiled - 1)) / 2;
        if (stagedOut.count < outcomesFiled || stagedOut.sum !== prefixSum) {
          await discardAll(
            `staged ${stagedOut.count} outcomes with a gap in their seqs — the staged prefix is not contiguous`,
          );
          return { resumed: false, reason: "outcomes prefix not contiguous" };
        }
      }
      if (stagedOut.count > outcomesFiled)
        await client.query("DELETE FROM outcomes_stage WHERE seq >= $1", [outcomesFiled]);
      outcomeSeqNext = outcomesFiled;
      return resumePrep;
    },
    async stageSchools(schools) {
      // BUG-265: the filing is the run's long phase — one
      // insert per school, so a tally over the schools (a real
      // percentage: the count is known), a heartbeat and a
      // slow-insert warning.
      progress?.stage(`filing ${formatCount(schools.length)} schools into the stage table`);
      const schoolTally = progress?.tally({
        label: "filing",
        total: schools.length,
        every: Math.max(1, Math.ceil(schools.length / 20)),
        unit: "schools",
      });
      const schoolWatch = createBatchWatch();
      // The heartbeat stays coarse on a run of tens of
      // thousands of inserts: every twentieth of the run.
      const heartbeatEvery = Math.max(1, Math.ceil(schools.length / 20));
      for (let i = schoolsFiled; i < schools.length; i += 1) {
        const s = schools[i];
        const started = Date.now();
        await client.query(
          `INSERT INTO schools_stage (urn, name, school_type, phase, age_range_low, age_range_high,
             address, postcode, latitude, longitude, admissions_policy, religious_character,
             la_code, la_name, gender, sixth_form, website, number_of_pupils,
             position_approximate, source_name, source_date, seq)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
          [
            s.urn,
            s.name,
            s.type,
            s.phase,
            s.ageLow,
            s.ageHigh,
            s.address,
            s.postcode,
            s.lat,
            s.lng,
            s.admissionsPolicy,
            s.religiousCharacter,
            s.laCode,
            s.laName,
            s.gender,
            s.sixthForm,
            s.website,
            s.numberOfPupils,
            s.positionApproximate,
            SOURCE_SCHOOLS,
            giasEdition,
            resume.takeSeq(1),
          ],
        );
        schoolsFiled += 1;
        const { tookMs, averageMs, slow } = schoolWatch.observe(Date.now() - started);
        schoolTally?.tick(schoolsFiled);
        progress?.heartbeat({
          stage: "filing",
          done: schoolsFiled,
          total: schools.length,
          every: heartbeatEvery,
        });
        if (slow) {
          progress?.warning({
            what: "school insert duration",
            value: `school ${s.urn} took ${formatDuration(tookMs)}`,
            threshold: `3x recent average ${formatDuration(averageMs)}`,
          });
        }
        if (schoolsFiled % CHECKPOINT_EVERY === 0) await checkpoint();
      }
      // The tail under a full checkpoint interval is staged
      // too — checkpoint it, so a kill after the last school
      // resumes at the outcomes, not at the last boundary.
      if (schoolsFiled % CHECKPOINT_EVERY !== 0) await checkpoint();
      schoolTally?.finish(schoolsFiled);
    },
    async stageOutcomes(outcomes) {
      progress?.stage(`filing ${formatCount(outcomes.size)} Ofsted outcomes into the stage table`);
      const outcomeTally = progress?.tally({
        label: "filing outcomes",
        total: outcomes.size,
        every: Math.max(1, Math.ceil(outcomes.size / 20)),
        unit: "outcomes",
      });
      const outcomeWatch = createBatchWatch();
      const outcomeHeartbeatEvery = Math.max(1, Math.ceil(outcomes.size / 20));
      const entries = [...outcomes.entries()];
      for (let i = outcomesFiled; i < entries.length; i += 1) {
        const [urn, o] = entries[i];
        const started = Date.now();
        await client.query(
          `INSERT INTO outcomes_stage (urn, rating, inspection_date, report_url, latest_event_type,
             latest_event_date, ungraded_outcome, report_card, source_name, source_date, seq)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            urn,
            o.rating,
            o.inspectionDate,
            o.reportUrl,
            o.latestEventType,
            o.latestEventDate,
            o.ungradedOutcome,
            o.reportCard ? JSON.stringify(o.reportCard) : null,
            SOURCE_OFSTED,
            ofstedAsAt,
            outcomeSeqNext,
          ],
        );
        outcomeSeqNext += 1;
        outcomesFiled += 1;
        const { tookMs, averageMs, slow } = outcomeWatch.observe(Date.now() - started);
        outcomeTally?.tick(outcomesFiled);
        progress?.heartbeat({
          stage: "filing outcomes",
          done: outcomesFiled,
          total: outcomes.size,
          every: outcomeHeartbeatEvery,
        });
        if (slow) {
          progress?.warning({
            what: "outcome insert duration",
            value: `outcome ${urn} took ${formatDuration(tookMs)}`,
            threshold: `3x recent average ${formatDuration(averageMs)}`,
          });
        }
        if (outcomesFiled % CHECKPOINT_EVERY === 0) await checkpoint();
      }
      if (outcomesFiled % CHECKPOINT_EVERY !== 0) await checkpoint();
      outcomeTally?.finish(outcomesFiled);
    },
    async finishFiling(schoolsLength, outcomesSize) {
      progress?.stage("swap started — replacing the filed schools and outcomes");
      const staged = await client.query("SELECT count(*)::int AS n FROM schools_stage");
      if (staged.rows[0].n !== schoolsLength)
        throw new Error("the staged school count does not match — rolling back");
      const stagedOutcomes = await client.query("SELECT count(*)::int AS n FROM outcomes_stage");
      if (stagedOutcomes.rows[0].n !== outcomesSize)
        throw new Error("the staged outcome count does not match — rolling back");
      // BUG-390: one progress line per sub-step — the
      // filing previously printed one line and then went
      // silent while the single INSERT...SELECT ran.
      progress?.stage(
        `filing · staged counts verified · ${formatCount(schoolsLength)} schools, ${formatCount(outcomesSize)} outcomes`,
      );
      await client.query("BEGIN");
      try {
        await client.query("DELETE FROM ofsted_outcomes");
        await client.query("DELETE FROM schools");
        progress?.stage("filing · live rows deleted");
        progress?.stage(`filing · copying ${formatCount(schoolsLength)} schools into schools`);
        await withFilingPulse(
          progress,
          {
            stage: `filing · copying ${formatCount(schoolsLength)} schools into schools`,
          },
          () =>
            client.query(
              `INSERT INTO schools (urn, name, school_type, phase, age_range_low, age_range_high,
             address, postcode, latitude, longitude, admissions_policy, religious_character,
             la_code, la_name, gender, sixth_form, website, number_of_pupils,
             position_approximate, source_name, source_date, loaded_at)
           SELECT urn, name, school_type, phase, age_range_low, age_range_high,
             address, postcode, latitude, longitude, admissions_policy, religious_character,
             la_code, la_name, gender, sixth_form, website, number_of_pupils,
             position_approximate, source_name, source_date, loaded_at FROM schools_stage`,
            ),
        );
        progress?.stage(`filing · copy done · ${formatCount(schoolsLength)} schools`);
        progress?.stage(
          `filing · copying ${formatCount(outcomesSize)} outcomes into ofsted_outcomes`,
        );
        await withFilingPulse(
          progress,
          {
            stage: `filing · copying ${formatCount(outcomesSize)} outcomes into ofsted_outcomes`,
          },
          () =>
            client.query(
              `INSERT INTO ofsted_outcomes (urn, rating, inspection_date, report_url, latest_event_type,
             latest_event_date, ungraded_outcome, report_card, source_name, source_date, loaded_at)
           SELECT urn, rating, inspection_date, report_url, latest_event_type,
             latest_event_date, ungraded_outcome, report_card, source_name, source_date, loaded_at
           FROM outcomes_stage`,
            ),
        );
        progress?.stage(`filing · copy done · ${formatCount(outcomesSize)} outcomes`);
        const filed = await client.query("SELECT count(*)::int AS n FROM schools");
        if (filed.rows[0].n !== schoolsLength)
          throw new Error("the filed school count does not match — rolling back");
        progress?.stage(`filing · filed count verified · ${formatCount(schoolsLength)} schools`);
        // The outcomes stage is emptied inside the swap
        // transaction, so it can never survive a committed swap.
        await client.query("DELETE FROM outcomes_stage");
        await client.query("COMMIT");
        progress?.stage(
          `filing · swap committed · ${formatCount(schoolsLength)} schools, ${formatCount(outcomesSize)} outcomes live`,
        );
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
      // The run is complete: schools staging + checkpoint go
      // together, so nothing is left behind for the next edition.
      await resume.clear();
    },
    async abortFiling() {
      // The staging + checkpoint STAY: they are the next run's
      // resume point.
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

  // BUG-265: one logger for the run — the read marker and
  // parsed count here, the filing tallies in the filing
  // block below, and the failure lines at each phase.
  const progress = createProgressLogger({ name: "load-schools" });
  progress.stage("reading the GIAS register and the Ofsted file");

  let giasText;
  let giasEdition;
  let ofstedText;
  let ofstedAsAt;
  try {
    if (fixtureMode) {
      const meta = JSON.parse(await readFile(join(fixtureDir, "fixture.json"), "utf8"));
      giasText = new TextDecoder("windows-1252").decode(
        await readFile(join(fixtureDir, meta.giasFile)),
      );
      ofstedText = await readFile(join(fixtureDir, meta.ofstedFile), "utf8");
      giasEdition = meta.giasExtractDate;
      ofstedAsAt = meta.ofstedAsAt;
    } else {
      ({ text: giasText, edition: giasEdition } = await fetchGias());
      ({ text: ofstedText, asAt: ofstedAsAt } = await fetchOfsted());
    }
  } catch (err) {
    // BUG-265: the fetch or fixture read failed before
    // anything was parsed or filed.
    progress.failed({
      stage: "reading",
      filed: 0,
      error: err,
      resume: "re-run from scratch (nothing is filed until the swap)",
    });
    throw err;
  }

  const giasRows = parseCsv(giasText);
  const requiredHeaders = [
    "URN",
    "EstablishmentName",
    "EstablishmentStatus (name)",
    "AdmissionsPolicy (name)",
    "Easting",
    "Northing",
  ];
  for (const header of requiredHeaders) {
    if (!(header in giasRows[0]))
      throw new Error(`contract failure: the GIAS file no longer carries the "${header}" column`);
  }
  const openRows = giasRows.filter((r) => r["EstablishmentStatus (name)"] === "Open");
  const closedCount = giasRows.length - openRows.length;

  const ofstedRows = parseCsv(ofstedText);
  const ofstedByUrn = new Map();
  for (const row of ofstedRows) {
    const urn = (row["URN"] ?? "").trim();
    if (urn) ofstedByUrn.set(urn, row);
  }

  // Resolve postcode positions only when filing (the directory is
  // the M4.1 loader's table); verify-only counts instead.
  let client = null;
  const directory = new Map();
  if (!verifyOnly) {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const res = await client.query(
      "SELECT postcode, latitude, longitude FROM postcode_cache WHERE latitude IS NOT NULL",
    );
    for (const row of res.rows)
      directory.set(row.postcode, { lat: row.latitude, lng: row.longitude });
  }
  const resolvePostcode = (postcode) => directory.get(postcode) ?? null;

  const schools = openRows.map((row) => buildSchool(row, resolvePostcode));
  const noPosition = schools.filter((s) => s.lat === null);
  const approximate = schools.filter((s) => s.positionApproximate);
  const outcomes = new Map();
  for (const school of schools) {
    const outcome = buildOutcome(ofstedByUrn.get(school.urn));
    if (outcome) outcomes.set(school.urn, outcome);
  }
  let policyMismatches = 0;
  for (const school of schools) {
    const ofstedPolicy = blank(ofstedByUrn.get(school.urn)?.["Admissions policy"]);
    if (ofstedPolicy && school.admissionsPolicy && ofstedPolicy !== school.admissionsPolicy)
      policyMismatches += 1;
  }
  const welshWithoutOutcome = schools.filter(
    (s) => s.laName && WELSH_LAS.has(s.laName) && !outcomes.has(s.urn),
  ).length;

  // Contract sanity. Frozen counts belong to fixture mode; live
  // mode checks bands and the maths, like the other loaders.
  if (fixtureMode) {
    if (schools.length === 0) throw new Error("the fixture filed no schools");
  } else {
    if (schools.length < 24000 || schools.length > 30000)
      throw new Error(
        `sanity failure: ${schools.length} open establishments is outside the expected band`,
      );
    const selectiveSecondaries = schools.filter(
      (s) => s.phase === "Secondary" && s.admissionsPolicy === "Selective",
    ).length;
    if (selectiveSecondaries < 140 || selectiveSecondaries > 190)
      throw new Error(
        `sanity failure: ${selectiveSecondaries} selective secondaries is outside the expected band`,
      );
    // Two tripwires, both about the register changing shape: 630
    // schools have blank coordinates and 85 more carry 0/0 (the
    // Channel Islands and Isle of Man sit outside the National
    // Grid) — 715 have no position of their own, and most pick one
    // up from their postcode when filing. 329 have no postcode
    // either and can never be positioned at all.
    const unpositionable = schools.filter((s) => s.lat === null && !s.postcode).length;
    if (unpositionable > 400)
      throw new Error(
        `sanity failure: ${unpositionable} schools have neither coordinates nor a postcode`,
      );
    if (noPosition.length > 1200)
      throw new Error(
        `sanity failure: ${noPosition.length} schools have no coordinates of their own`,
      );
  }
  try {
    checkGolden(schools, outcomes, fixtureMode);
  } catch (err) {
    // BUG-265: the golden checks fail before anything is
    // filed.
    progress.failed({
      stage: "checks",
      filed: 0,
      error: err,
      resume: "re-run from scratch (nothing is filed until the swap)",
    });
    throw err;
  }
  // BUG-265: the parsed count — no percentage, the register
  // carries no total of its own to read against.
  progress.count({
    label: "parsed",
    done: schools.length,
    unit: "schools",
    extra: `${formatCount(outcomes.size)} Ofsted outcomes joined`,
  });

  const summary = () =>
    `load-schools · GIAS ${giasEdition} · Ofsted as at ${ofstedAsAt} · ${formatCount(schools.length)} open schools · ` +
    `${formatCount(closedCount)} closed skipped · ${formatCount(approximate.length + noPosition.length)} without coordinates ` +
    `(${formatCount(approximate.length)} at postcode position, ${formatCount(noPosition.length)} unfiled) · ` +
    `${formatCount(schools.filter((s) => s.phase === "Secondary" && s.admissionsPolicy === "Selective").length)} selective secondaries · ` +
    `${formatCount(outcomes.size)} Ofsted outcomes joined · ${formatCount(policyMismatches)} admissions-policy mismatches logged · ` +
    `${formatCount(welshWithoutOutcome)} Welsh schools without an Ofsted row (Estyn territory, expected)`;

  if (verifyOnly) {
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    if (client) await client.end();
    return;
  }

  // BUG-368: the filing streams through the resume filer —
  // staging is persistent and checkpointed, so a killed run
  // resumes instead of restarting. The filer reuses the
  // directory client main() already opened; main() closes it.
  const filer = await beginSchoolsFiling(progress, {
    restart,
    client,
    giasEdition,
    ofstedAsAt,
  });
  try {
    await filer.prepareResume(`${giasEdition}/${ofstedAsAt}`, schools.length, outcomes.size);
    await filer.stageSchools(schools);
    await filer.stageOutcomes(outcomes);
    await filer.finishFiling(schools.length, outcomes.size);
  } catch (error) {
    // BUG-265: the failure line names the filing stage and
    // how many rows were staged — the swap rolled back, so
    // the live tables are untouched. BUG-368: the resume
    // note names the point the next run resumes from.
    progress.failed({
      stage: "filing",
      filed: filer.stagedCount(),
      total: schools.length + outcomes.size,
      error,
      resume: filer.resumeNote(),
    });
    await filer.abortFiling();
    throw error;
  } finally {
    await client.end();
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

const WELSH_LAS = new Set([
  "Isle of Anglesey",
  "Gwynedd",
  "Conwy",
  "Denbighshire",
  "Flintshire",
  "Wrexham",
  "Powys",
  "Ceredigion",
  "Pembrokeshire",
  "Carmarthenshire",
  "Swansea",
  "Neath Port Talbot",
  "Bridgend",
  "Vale of Glamorgan",
  "Cardiff",
  "Rhondda Cynon Taf",
  "Merthyr Tydfil",
  "Caerphilly",
  "Blaenau Gwent",
  "Torfaen",
  "Monmouthshire",
  "Newport",
]);

main().catch((error) => {
  console.error(`load-schools FAILED: ${error.message}`);
  process.exitCode = 1;
});
