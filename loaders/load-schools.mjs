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
import { formatCount } from "./progress.mjs";

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

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response;
}

async function fetchGias() {
  for (let back = 0; back < 7; back += 1) {
    const day = new Date(Date.now() - back * 86400000);
    const stamp = day.toISOString().slice(0, 10).replaceAll("-", "");
    const response = await fetch(GIAS_URL(stamp));
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        text: new TextDecoder("windows-1252").decode(buffer),
        edition: day.toISOString().slice(0, 10),
      };
    }
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

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;

  let giasText;
  let giasEdition;
  let ofstedText;
  let ofstedAsAt;
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
  checkGolden(schools, outcomes, fixtureMode);

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

  try {
    await client.query("BEGIN");
    await client.query(
      `CREATE TEMP TABLE schools_stage (LIKE schools INCLUDING DEFAULTS) ON COMMIT DROP`,
    );
    await client.query(
      `CREATE TEMP TABLE outcomes_stage (LIKE ofsted_outcomes INCLUDING DEFAULTS) ON COMMIT DROP`,
    );
    for (const s of schools) {
      await client.query(
        `INSERT INTO schools_stage (urn, name, school_type, phase, age_range_low, age_range_high,
           address, postcode, latitude, longitude, admissions_policy, religious_character,
           la_code, la_name, gender, sixth_form, website, number_of_pupils,
           position_approximate, source_name, source_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
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
        ],
      );
    }
    for (const [urn, o] of outcomes) {
      await client.query(
        `INSERT INTO outcomes_stage (urn, rating, inspection_date, report_url, latest_event_type,
           latest_event_date, ungraded_outcome, report_card, source_name, source_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
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
        ],
      );
    }
    const staged = await client.query("SELECT count(*)::int AS n FROM schools_stage");
    if (staged.rows[0].n !== schools.length)
      throw new Error("the staged school count does not match — rolling back");
    await client.query("DELETE FROM ofsted_outcomes");
    await client.query("DELETE FROM schools");
    await client.query(
      `INSERT INTO schools (urn, name, school_type, phase, age_range_low, age_range_high,
         address, postcode, latitude, longitude, admissions_policy, religious_character,
         la_code, la_name, gender, sixth_form, website, number_of_pupils,
         position_approximate, source_name, source_date, loaded_at)
       SELECT urn, name, school_type, phase, age_range_low, age_range_high,
         address, postcode, latitude, longitude, admissions_policy, religious_character,
         la_code, la_name, gender, sixth_form, website, number_of_pupils,
         position_approximate, source_name, source_date, loaded_at FROM schools_stage`,
    );
    await client.query(
      `INSERT INTO ofsted_outcomes (urn, rating, inspection_date, report_url, latest_event_type,
         latest_event_date, ungraded_outcome, report_card, source_name, source_date, loaded_at)
       SELECT urn, rating, inspection_date, report_url, latest_event_type,
         latest_event_date, ungraded_outcome, report_card, source_name, source_date, loaded_at
       FROM outcomes_stage`,
    );
    const filed = await client.query("SELECT count(*)::int AS n FROM schools");
    if (filed.rows[0].n !== schools.length)
      throw new Error("the filed school count does not match — rolling back");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
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
