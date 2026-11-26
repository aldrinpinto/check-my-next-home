// School destinations loader (plan step M6.34, decisions
// D51 and D65).
//
// Files where each school's leavers went next, from the
// Department for Education's two Explore Education
// Statistics destination publications, under the GOV.UK
// umbrella "Destinations of key stage 4 and 5 students":
//
//   npm run load:school-destinations
//   npm run load:school-destinations -- --verify-only
//   npm run load:school-destinations -- --file tests/fixtures/school-destinations
//
// What the M6.34 prep settled, and where it lives in this
// file:
//
//   - TWO publications, ONE loader, ONE filing. "Key
//     stage 4 destination measures" (KS4 leavers) and
//     "16-19 destination measures" (16 to 19 study
//     leavers). The loader files BOTH files or NEITHER:
//     the two discoveries must agree on the release (same
//     release label, same publication date, same newest
//     cohort) or the run refuses — destinations never
//     serve half a release.
//   - Discovery, never a hardcoded data-set ID. Data-set
//     IDs are per-release; publication IDs are stable.
//     Each run reads the publication's data-catalogue page
//     and takes the institution-level data set tagged
//     "This is the latest data" — exactly one, titled as
//     expected, or the run refuses. The CSV then downloads
//     from the catalogue's stable per-data-set URL.
//   - The headline row only: breakdown_topic "Total",
//     breakdown "Total", data type "Percentage" (the KS5
//     file additionally cohort_level_group "Total" and
//     cohort_level "Total" — the all-students headline
//     Total D65 settled, never the Level 3 cut). Only the
//     NEWEST cohort in each file files; the older cohorts
//     the release carries are validated and dropped.
//   - Consortium URNs. Twelve URNs in the 2023/24 KS5
//     headline set carry several rows — sixth-form
//     consortia whose member schools' leavers file under
//     the consortium's URN (the prep's URN-keyed
//     extraction could not see them; the build's premise
//     check found them). The consortium's own row is
//     arithmetically identifiable, and the filing rule is
//     fail-closed: one row files as itself; a group whose
//     rows all carry identical figures files one; a group
//     with exactly one row whose cohort equals the sum of
//     the others files that combined row; anything else
//     refuses the load. The consortium URNs are GIAS
//     "Sixth form centres", which never serve (D64 ruling
//     8), and their member schools hold their own URNs —
//     under the step's exact-URN join a member school has
//     no KS5 row of its own and takes the no-row state.
//   - The filed field set is D65's and no more: cohort
//     count, overall sustained, education, apprenticeships
//     and employment shares, plus the higher-education
//     share at KS5. The release's not-sustained and
//     not-captured remainders are NEVER filed — no column
//     can hold them (migration 0028). No national figure
//     files; the KS5 file carries no Russell Group column
//     at all, so that exclusion cannot leak from here.
//   - "low" and "c". A share cell is numeric, "low" (a
//     positive share under 0.5% — files as the share NULL
//     with its low flag set, never a zero) or "c" (the
//     release suppresses every share where the cohort was
//     under six leavers — the row files as state
//     'suppressed' with its cohort count, every share
//     NULL). Suppression is all-or-nothing in the release;
//     a row mixing numeric and "c" shares is a shape
//     change and refuses. Any other cell value refuses
//     (the flood fail-closed vocabulary pattern).
//   - Fail-closed bands, LIVE filings only (a fixture is
//     a cut, judged by the golden checks — the AQMA
//     precedent): headline counts within ±10% of the
//     measured snapshots (KS4 4,551 schools; KS5 2,740
//     institutions, 2023/24 cohort), and at least 90% of
//     each stage's filed URNs joining the filed schools
//     table (measured 91.5% / 96.8%) — a collapse means a
//     wrong file or a GIAS break. The newest cohort must
//     also be the expected leaver year for the release's
//     publication year (two or three years back: the
//     October release publishes the cohort that left two
//     summers earlier), or the file is stale and refuses.
//   - Edition detection. The filing is keyed by (cohort
//     year, version, publication date) per stage: a run
//     whose edition already stands files nothing and says
//     so; the spring Revised edition of the same cohort
//     supersedes the October Provisional; a Provisional
//     never supersedes a Revised, and an older cohort
//     never supersedes a newer one. Cadence quarterly —
//     it catches the October provisional and the spring
//     revision without a new cadence kind.
//   - The files are the registry's largest downloads
//     (~127 MB of CSV to file ~7,300 headline rows); the
//     parse streams and retains headline rows only.
//   - The loader files EVERY institution in the release,
//     including the 16-plus providers the serving never
//     shows (D65 ruling 5), so a future serving step
//     needs no re-filing. Licence: Open Government
//     Licence (both publications).

import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createLoaderResume } from "./loader-resume.mjs";
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";

export const SOURCE_NAME = "Department for Education — Explore Education Statistics";
const EES_BASE = "https://explore-education-statistics.service.gov.uk";

// The two publications. Publication IDs are stable
// across releases; the data-set IDs are discovered per
// release from the catalogue page and never appear here.
export const PUBLICATIONS = {
  ks4: {
    stage: "ks4",
    publicationId: "b70e71fa-5767-4fb5-c9bf-08d82a49a1d0",
    dataSetTitle: "Key stage 4 institution level destination measures",
  },
  ks5: {
    stage: "ks5",
    publicationId: "657a20f6-13ef-494f-c9c0-08d82a49a1d0",
    dataSetTitle: "16-19 study leavers institution level destinations",
  },
};

export const catalogueUrl = (publicationId) =>
  `${EES_BASE}/data-catalogue?publicationId=${publicationId}`;
export const csvUrl = (dataSetId) => `${EES_BASE}/data-catalogue/data-set/${dataSetId}/csv`;

// The measured snapshots (the 2024/25 release, published
// 15 October 2026, headline cohort 2023/24 leavers) and
// their ±10% bands, rounded toward the snapshot.
export const KS4_SNAPSHOT = 4551;
export const KS5_SNAPSHOT = 2740;
export const bandFor = (snapshot) => ({
  low: Math.ceil(snapshot * 0.9),
  high: Math.floor(snapshot * 1.1),
});
// The URN join floor against the filed schools table
// (measured: KS4 4,162 of 4,551 = 91.5%; KS5 2,653 of
// 2,740 = 96.8%).
export const JOIN_FLOOR = 0.9;

// The indicator columns each stage files, mapped to the
// table's fields. The KS4 file's education split
// (fe/ssf/sfc) and both files' not-sustained /
// not-captured remainders are deliberately absent — D65
// files none of them.
export const STAGE_FIELDS = {
  ks4: [
    ["overall", "overall"],
    ["education", "education"],
    ["appren", "apprenticeships"],
    ["all_work", "employment"],
  ],
  ks5: [
    ["overall", "overall"],
    ["education", "education"],
    ["he", "higher_education"],
    ["appren", "apprenticeships"],
    ["all_work", "employment"],
  ],
};
const SHARE_FIELDS = ["overall", "education", "higher_education", "apprenticeships", "employment"];

// The golden facts, measured from the release files at
// the M6.34 build (16 Nov 2026) — the prep's per-URN
// extraction, re-verified against the downloaded files.
// Keyed by cohort year: a cohort's entry is written when
// its October Provisional is first measured. The exact
// values are asserted on a Provisional filing; on the
// spring Revised filing of the same cohort each share
// must sit within REVISED_TOLERANCE of the measured
// value — a correction guard against a wrong file, not
// an exactness claim on DfE's corrections.
export const REVISED_TOLERANCE = 1.0;
export const MEASURED_RELEASES = {
  "2023/24": {
    ks4: {
      // Birkdale's only secondary within 2 miles. The
      // file carries its earlier name "Maltings Academy"
      // where GIAS files "Lift Maltings" — the URN is
      // the only safe key.
      135653: {
        cohort: 171,
        overall: 84.8,
        education: 72.5,
        apprenticeships: 5.3,
        employment: 7.0,
      },
      148901: { cohort: 146, overall: 90.4, education: 90.4, apprenticeships: 0, employment: 0 },
      145410: { cohort: 168, overall: 82.1, education: 81.5, apprenticeships: 0.6, employment: 0 },
      145113: { cohort: 297, overall: 88.6, education: 88.2, apprenticeships: 0, employment: 0.3 },
      136534: {
        cohort: 251,
        overall: 96.4,
        education: 88.0,
        apprenticeships: 7.2,
        employment: 1.2,
      },
      137906: {
        cohort: 205,
        overall: 95.6,
        education: 93.7,
        apprenticeships: 1.5,
        employment: 0.5,
      },
      136795: { cohort: 209, overall: 97.1, education: 95.2, apprenticeships: 0, employment: 1.9 },
    },
    ks5: {
      136534: {
        cohort: 253,
        overall: 87.4,
        education: 63.2,
        he: 61.7,
        apprenticeships: 4.0,
        employment: 20.2,
      },
      137906: {
        cohort: 93,
        overall: 81.7,
        education: 57.0,
        he: 53.8,
        apprenticeships: 2.2,
        employment: 22.6,
      },
      136795: {
        cohort: 230,
        overall: 92.2,
        education: 83.5,
        he: 82.6,
        apprenticeships: 2.2,
        employment: 6.5,
      },
      136669: {
        cohort: 422,
        overall: 92.9,
        education: 85.1,
        he: 83.6,
        apprenticeships: 4.0,
        employment: 3.8,
      },
      135651: {
        cohort: 50,
        overall: 86.0,
        education: 32.0,
        he: 30.0,
        apprenticeships: 10.0,
        employment: 44.0,
      },
      137790: {
        cohort: 113,
        overall: 87.6,
        education: 34.5,
        he: 34.5,
        apprenticeships: 12.4,
        employment: 40.7,
      },
      // NESCOT: filed, never served (D65 ruling 5).
      130822: {
        cohort: 953,
        overall: 70.4,
        education: 28.3,
        he: 11.1,
        apprenticeships: 7.5,
        employment: 34.6,
      },
    },
  },
};
// The KS4 no-row witness: Plashet School files in GIAS
// (the schools fixture carries it) but has no 2023/24
// headline row in the release — the golden absence.
export const NO_ROW_WITNESS_URN = "152267";

// The release the canary pins (the M6.21 pattern): the
// latest release measured and filed — the 2024/25
// release, published 15 October 2026, headline cohort
// 2023/24. Updated when a new release is measured and
// filed; the loader itself detects editions against the
// filed table and needs no pin.
export const MEASURED_RELEASE_PIN = {
  release: "Academic year 2024/25",
  published: "2026-10-15",
  cohortYear: "2023/24",
};

// ---------------------------------------------------------------------------
// Small streaming CSV reader (quoted fields, "" escapes, CRLF, BOM) — the
// postcodes loader's idiom; the release files are far too large to hold whole.
// ---------------------------------------------------------------------------
async function* parseCsvRows(stream) {
  const decoder = new StringDecoder("utf8");
  let field = "";
  let row = [];
  let inQuotes = false;
  let fieldStarted = false;
  let firstChunk = true;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };

  for await (const chunk of stream) {
    let text = decoder.write(chunk);
    if (firstChunk) {
      text = text.replace(/^﻿/, "");
      firstChunk = false;
    }
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"' && !fieldStarted) {
        inQuotes = true;
        fieldStarted = true;
      } else if (ch === ",") {
        endField();
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        endField();
        yield row;
        row = [];
      } else {
        field += ch;
        fieldStarted = true;
      }
    }
  }
  if (fieldStarted || row.length > 0) {
    endField();
    yield row;
  }
}

// Header-keyed rows over the streaming reader.
export async function* parseCsvObjects(stream) {
  let header = null;
  for await (const row of parseCsvRows(stream)) {
    if (header === null) {
      header = row.map((h) => h.trim());
      continue;
    }
    if (row.length === 1 && row[0] === "") continue;
    yield Object.fromEntries(header.map((h, i) => [h, (row[i] ?? "").trim()]));
  }
}

// ---------------------------------------------------------------------------
// Catalogue discovery. The catalogue page renders one summary block per data
// set; each block opens at its heading id and carries the data set's title,
// its status tags, its release label and its publication date. Discovery
// takes the block that is BOTH tagged "This is the latest data" AND titled
// as the publication's institution-level data set — exactly one, or refuse.
// ---------------------------------------------------------------------------
const MONTHS = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

export function parsePublishedDate(text) {
  const match = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec((text ?? "").trim());
  if (!match || !MONTHS[match[2]])
    throw new Error(`the catalogue's Published date "${text}" is not a parseable date`);
  return `${match[3]}-${MONTHS[match[2]]}-${match[1].padStart(2, "0")}`;
}

export function parseCatalogue(html, publication) {
  const headings = [...html.matchAll(/id="data-set-file-([0-9a-f-]{36})-heading"/g)];
  const blocks = headings.map((match, i) => ({
    dataSetId: match[1],
    text: html.slice(match.index, i + 1 < headings.length ? headings[i + 1].index : undefined),
  }));
  const candidates = blocks.filter((block) => {
    const title = /DataSetFileSummary_title[^"]*">([^<]+)</.exec(block.text)?.[1]?.trim();
    return title === publication.dataSetTitle && block.text.includes("This is the latest data");
  });
  if (candidates.length !== 1)
    throw new Error(
      `catalogue discovery for "${publication.dataSetTitle}" found ${candidates.length} latest data sets titled as expected (publication ${publication.publicationId}) — refusing to guess a data-set ID`,
    );
  const block = candidates[0];
  const release = /data-testid="Release-value"[^>]*>\s*<a[^>]*>([^<]+)</
    .exec(block.text)?.[1]
    ?.trim();
  const publishedText = /data-testid="Published-value"[^>]*>\s*<time>([^<]+)</.exec(
    block.text,
  )?.[1];
  if (!release || !publishedText)
    throw new Error(
      `the catalogue block for "${publication.dataSetTitle}" carries no Release label or Published date — refusing to file without provenance`,
    );
  return { dataSetId: block.dataSetId, release, published: parsePublishedDate(publishedText) };
}

// The two discoveries must agree on the release, or
// neither file files.
export function checkReleaseAgreement(ks4Discovery, ks5Discovery, ks4Newest, ks5Newest) {
  if (
    ks4Discovery.release !== ks5Discovery.release ||
    ks4Discovery.published !== ks5Discovery.published
  )
    throw new Error(
      `the two publications disagree on the release (KS4: "${ks4Discovery.release}", published ${ks4Discovery.published}; 16-19: "${ks5Discovery.release}", published ${ks5Discovery.published}) — filing neither`,
    );
  if (ks4Newest.period !== ks5Newest.period)
    throw new Error(
      `the two files' newest cohorts disagree (KS4 ${ks4Newest.cohortYear}, 16-19 ${ks5Newest.cohortYear}) — filing neither`,
    );
}

// The leaver cohort a period code names: "202324" is
// the 2023/24 academic year — the cohort that finished
// in 2024, labelled "2023/24".
export function cohortYearOf(period) {
  if (!/^\d{6}$/.test(period ?? ""))
    throw new Error(`time_period "${period}" is not a six-digit cohort code`);
  const startYear = Number(period.slice(0, 4));
  return { cohortYear: `${startYear}/${period.slice(4, 6)}`, leaverYear: startYear + 1 };
}

// ---------------------------------------------------------------------------
// The headline collection. Streams a release file and keeps its headline
// rows: the newest cohort files; every cohort's headline rows are
// vocabulary-validated on the way past.
// ---------------------------------------------------------------------------

function isHeadline(row, stage) {
  if (row.breakdown_topic !== "Total" || row.breakdown !== "Total") return false;
  if (row.data_type !== "Percentage") return false;
  if (stage === "ks5" && (row.cohort_level_group !== "Total" || row.cohort_level !== "Total"))
    return false;
  return true;
}

// One indicator cell: a number, "low" or "c" — anything
// else is outside the release's vocabulary and refuses.
function parseShareCell(cell, urn, column) {
  const value = (cell ?? "").trim();
  if (value === "c") return { suppressed: true };
  if (value === "low") return { value: null, low: true };
  const numeric = Number(value);
  if (value === "" || !Number.isFinite(numeric) || numeric < 0 || numeric > 100)
    throw new Error(
      `URN ${urn}: the ${column} cell "${cell}" is outside the destinations vocabulary (a number, "low" or "c") — refusing to file`,
    );
  return { value: numeric, low: false };
}

function parseCohortCount(cell, urn) {
  const numeric = Number((cell ?? "").trim());
  if (!Number.isInteger(numeric) || numeric < 0)
    throw new Error(`URN ${urn}: cohort_count "${cell}" is not a non-negative integer`);
  return numeric;
}

// A headline row -> its filed record (before consortium
// resolution). Suppression is all-or-nothing: every
// indicator "c" files the suppressed state; a mix of
// numeric and "c" refuses.
function rowToRecord(row, stage) {
  const urn = (row.school_urn ?? "").trim();
  if (!/^\d+$/.test(urn))
    throw new Error(`a headline row carries school_urn "${row.school_urn}" — not a URN`);
  const cohortCount = parseCohortCount(row.cohort_count, urn);
  const cells = STAGE_FIELDS[stage].map(([column, field]) => ({
    field,
    ...parseShareCell(row[column], urn, column),
  }));
  const suppressedCount = cells.filter((c) => c.suppressed).length;
  const record = {
    urn,
    stage,
    cohortCount,
    version: (row.version ?? "").trim(),
    state: "served",
    shares: {},
  };
  if (suppressedCount > 0) {
    if (suppressedCount !== cells.length)
      throw new Error(
        `URN ${urn}: a headline row mixes suppressed ("c") and published shares — the release suppresses all-or-nothing, so this is a shape change; refusing to file`,
      );
    record.state = "suppressed";
    for (const field of SHARE_FIELDS) record.shares[field] = { value: null, low: false };
    return record;
  }
  for (const field of SHARE_FIELDS) record.shares[field] = { value: null, low: false };
  for (const cell of cells) record.shares[cell.field] = { value: cell.value, low: cell.low };
  return record;
}

// The consortium resolution (see the header): a URN
// with several newest-cohort headline rows files its
// combined row — identified by identical figures, or by
// a cohort equal to the sum of the others' — or the
// load refuses.
export function resolveGroup(records, urn) {
  if (records.length === 1) return records[0];
  const signature = (r) =>
    JSON.stringify([
      r.cohortCount,
      r.state,
      ...SHARE_FIELDS.map((f) => [r.shares[f].value, r.shares[f].low]),
    ]);
  if (records.every((r) => signature(r) === signature(records[0]))) return records[0];
  const combined = records.filter(
    (r) => r.cohortCount === records.reduce((sum, o) => (o === r ? sum : sum + o.cohortCount), 0),
  );
  if (combined.length === 1) return combined[0];
  throw new Error(
    `URN ${urn}: ${records.length} headline rows for the newest cohort resolve neither to identical figures nor to one combined row — refusing to file`,
  );
}

/**
 * @param {AsyncIterable<any> | Iterable<any>} rowObjects
 * @param {string} stage
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export async function collectHeadline(rowObjects, stage, { progress = null } = {}) {
  const periods = new Set();
  const byPeriod = new Map(); // period -> Map<urn, record[]>
  // BUG-265: the parse streams ~127 MB of CSV and retains
  // headline rows only — a count every hundred thousand
  // rows and a heartbeat at the same cadence, so the log
  // moves while the file streams. No total, so no
  // percentage: the file carries no row count of its own.
  let rowsSeen = 0;
  try {
    for await (const row of rowObjects) {
      rowsSeen += 1;
      if (rowsSeen % 100_000 === 0) {
        progress?.count({ label: `read ${stage}`, done: rowsSeen, unit: "rows" });
        progress?.heartbeat({ stage: `reading ${stage}`, done: rowsSeen, every: 100_000 });
      }
      if (!isHeadline(row, stage)) continue;
      const period = (row.time_period ?? "").trim();
      periods.add(period);
      if (!byPeriod.has(period)) byPeriod.set(period, new Map());
      const record = rowToRecord(row, stage);
      const urnMap = byPeriod.get(period);
      if (!urnMap.has(record.urn)) urnMap.set(record.urn, []);
      urnMap.get(record.urn).push(record);
    }
  } catch (err) {
    // BUG-265: the failure line names the reading stage —
    // the parse failed before anything was filed.
    progress?.failed({
      stage: `reading ${stage}`,
      filed: 0,
      error: err,
      resume: "re-run from scratch (nothing is filed until the swap)",
    });
    throw err;
  }
  if (periods.size === 0)
    throw new Error(`the ${stage} file carries no headline rows at all — refusing to file`);
  const newestPeriod = [...periods].sort().at(-1);
  const { cohortYear, leaverYear } = cohortYearOf(newestPeriod);
  const filed = [];
  let consortiumGroups = 0;
  for (const [urn, records] of byPeriod.get(newestPeriod)) {
    if (records.length > 1) consortiumGroups += 1;
    filed.push(resolveGroup(records, urn));
  }
  const versions = new Set(filed.map((r) => r.version));
  if (versions.size !== 1 || [...versions][0] === "")
    throw new Error(
      `the ${stage} file's newest cohort carries versions {${[...versions].join(", ")}} — one cohort files at one version; refusing`,
    );
  filed.sort((a, b) => a.urn.localeCompare(b.urn));
  // BUG-265: the closing read line — the row total is known
  // only now that the file has streamed, and it is a count,
  // never a percentage against a guessed total.
  progress?.count({
    label: `read ${stage}`,
    done: rowsSeen,
    unit: "rows",
    extra: `${formatCount(filed.length)} headline rows kept`,
  });
  return {
    stage,
    period: newestPeriod,
    cohortYear,
    leaverYear,
    version: [...versions][0],
    filed,
    consortiumGroups,
  };
}

// The fail-closed band on a stage's headline count —
// live filings only (the AQMA precedent: a fixture is a
// cut, judged by the golden checks).
export function checkBand(collection, snapshot) {
  const { low, high } = bandFor(snapshot);
  const n = collection.filed.length;
  if (n < low || n > high)
    throw new Error(
      `coverage failure: ${n} ${collection.stage} headline institutions is outside the band ${low}–${high} (±10% of the ${snapshot} snapshot) — nothing filed`,
    );
}

// The staleness contract: the newest cohort's leavers
// finished two or three years before the release's
// publication year (the October release measures the
// cohort that left two summers earlier). Anything else
// is a stale or wrong file.
export function checkStaleness(collection, published) {
  const publishedYear = Number(published.slice(0, 4));
  const lag = publishedYear - collection.leaverYear;
  if (lag !== 2 && lag !== 3)
    throw new Error(
      `staleness failure: the ${collection.stage} file's newest cohort finished in ${collection.leaverYear} but the release published in ${publishedYear} — the destinations lag is two to three years, so this file is stale or wrong; nothing filed`,
    );
}

// ---------------------------------------------------------------------------
// Golden checks — run in BOTH modes before anything files. The structural
// facts hold for any filing of a measured cohort; the measured values are
// exact on a Provisional filing and a correction guard on a Revised one.
// ---------------------------------------------------------------------------
export function checkGolden(collections) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  for (const collection of collections) {
    const byUrn = new Map(collection.filed.map((r) => [r.urn, r]));
    const measured = MEASURED_RELEASES[collection.cohortYear]?.[collection.stage];
    if (measured) {
      for (const [urn, golden] of Object.entries(measured)) {
        const record = byUrn.get(urn);
        expect(record !== undefined, `${collection.stage} URN ${urn}: no headline row filed`);
        if (!record) continue;
        expect(
          record.state === "served",
          `${collection.stage} URN ${urn}: state ${record.state}, expected served`,
        );
        expect(
          record.cohortCount === golden.cohort,
          `${collection.stage} URN ${urn}: cohort ${record.cohortCount}, expected ${golden.cohort}`,
        );
        const fields = STAGE_FIELDS[collection.stage].map(([, field]) => field);
        for (const field of fields) {
          const goldenKey = field === "higher_education" ? "he" : field;
          const actual = record.shares[field].value;
          const wanted = golden[goldenKey];
          if (collection.version === "Provisional")
            expect(
              actual === wanted,
              `${collection.stage} URN ${urn}: ${field} ${actual}, expected ${wanted}`,
            );
          else
            expect(
              actual !== null && Math.abs(actual - wanted) <= REVISED_TOLERANCE,
              `${collection.stage} URN ${urn}: ${field} ${actual} moved more than ${REVISED_TOLERANCE} points from the measured Provisional ${wanted} — a wrong file, not a correction`,
            );
        }
      }
    }
    if (collection.stage === "ks4" && collection.cohortYear === "2023/24")
      expect(
        !byUrn.has(NO_ROW_WITNESS_URN),
        `KS4 URN ${NO_ROW_WITNESS_URN} (Plashet School) filed a headline row — the measured release carries none for it`,
      );
    // Suppression stays rare and small-cohort: every
    // suppressed row's cohort is under six, by the
    // release's own rule.
    for (const record of collection.filed)
      if (record.state === "suppressed")
        expect(
          record.cohortCount < 6,
          `${collection.stage} URN ${record.urn}: suppressed with a cohort of ${record.cohortCount} — the release suppresses only cohorts under six`,
        );
  }
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

// ---------------------------------------------------------------------------
// Filing. The whole table swaps in one transaction (stage → join check →
// supersede guards → delete → insert → count), so a failed run keeps the
// last good filing and the two stages never serve half a release.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Filing. The whole table swaps in one transaction (stage → join check →
// supersede guards → delete → insert → count), so a failed run keeps the
// last good filing and the two stages never serve half a release.
//
// With resume support (BUG-368) the stage is a PERSISTENT table
// (migration 0048) and a loader_checkpoint row records the last
// fully staged chunk: a killed run resumes instead of restarting.
// Without the resume option the filing is exactly the one-shot
// transaction above (a TEMP stage inside one BEGIN…COMMIT), so the
// existing filing tests keep passing unchanged. The edition is the
// cohort year, version and publication date the two stages agree
// on; the resume point is the count of rows staged, and a resumed
// run re-parses both files (the parse is the read; the staged rows
// are the resume) and stages only the rows past the checkpoint.
// ---------------------------------------------------------------------------
/**
 * @param {any} client
 * @param {any} filing
 * @param {{ enforceJoin: boolean, progress?: import("./progress.mjs").ProgressLogger | null, resume?: { restart?: boolean } | null }} [options]
 */
export async function fileDestinations(
  client,
  filing,
  { enforceJoin, progress = null, resume: resumeOpts = null } = {},
) {
  // BUG-265: the staging tally and the swap marker live
  // here; the failure line is in the catch below.
  const records = [...filing.collections.ks4.filed, ...filing.collections.ks5.filed];
  const CHUNK = 200;
  const chunks = Math.ceil(records.length / CHUNK);
  const stageTally = progress?.tally({
    label: "staging",
    total: chunks,
    every: Math.max(1, Math.ceil(chunks / 10)),
    unit: "chunks",
  });
  const stageWatch = createBatchWatch();
  // The tally counts absolute chunks, so a resumed run's
  // first tick lands at its true position.
  let chunksDone = 0;
  let stagedRows = 0;
  // BUG-368: the edition is the cohort year, version and
  // publication date the two stages agree on.
  const edition = `${filing.collections.ks4.cohortYear}/${filing.collections.ks4.version}/${filing.published}`;
  let resume = null;
  try {
    if (resumeOpts) {
      await client.query(`CREATE TABLE IF NOT EXISTS school_destinations_stage (
          urn text, stage text, cohort_year text, version text, cohort_count integer,
          overall double precision, overall_low boolean, education double precision, education_low boolean,
          higher_education double precision, higher_education_low boolean,
          apprenticeships double precision, apprenticeships_low boolean,
          employment double precision, employment_low boolean,
          state text, source_name text, source_date date,
          seq bigint NOT NULL, UNIQUE (seq)
        )`);
      resume = createLoaderResume(client, {
        loader: "load-school-destinations",
        stageTable: "school_destinations_stage",
        progress,
        restart: resumeOpts.restart ?? false,
      });
      const prep = await resume.prepare({ edition, expected: records.length });
      if (prep.resumed) {
        stagedRows = prep.checkpoint.filed_count;
        // Ceil, not floor: the last chunk may be partial, and a
        // fully staged resume must finish at total/total, not
        // one short (a kill during the swap resumes here).
        chunksDone = Math.ceil(stagedRows / CHUNK);
      }
    } else {
      await client.query("BEGIN");
      await client.query(`CREATE TEMP TABLE school_destinations_stage (
        urn text, stage text, cohort_year text, version text, cohort_count integer,
        overall double precision, overall_low boolean, education double precision, education_low boolean,
        higher_education double precision, higher_education_low boolean,
        apprenticeships double precision, apprenticeships_low boolean,
        employment double precision, employment_low boolean,
        state text, source_name text, source_date date
      ) ON COMMIT DROP`);
    }
    // Edition detection: the edition already standing
    // files nothing.
    const standing = await client.query(
      "SELECT stage, cohort_year, version, source_date::text AS source_date FROM school_destinations GROUP BY stage, cohort_year, version, source_date",
    );
    const standingByStage = new Map(standing.rows.map((r) => [r.stage, r]));
    const editionOf = (stage) => ({
      cohort_year: filing.collections[stage].cohortYear,
      version: filing.collections[stage].version,
      source_date: filing.published,
    });
    const unchanged = ["ks4", "ks5"].every((stage) => {
      const row = standingByStage.get(stage);
      if (!row) return false;
      const edition = editionOf(stage);
      return (
        row.cohort_year === edition.cohort_year &&
        row.version === edition.version &&
        row.source_date === edition.source_date
      );
    });
    if (unchanged) {
      // The live table already serves this edition: in
      // resume mode clear whatever a killed run left, so
      // nothing stale stands under the next edition.
      if (resume) await resume.clear();
      else await client.query("COMMIT");
      return { filed: false, reason: "edition unchanged" };
    }
    // Supersede guards: an older cohort never replaces a
    // newer one, and a Provisional never replaces a
    // Revised of the same cohort.
    for (const stage of ["ks4", "ks5"]) {
      const row = standingByStage.get(stage);
      if (!row) continue;
      const edition = editionOf(stage);
      if (row.cohort_year > edition.cohort_year)
        throw new Error(
          `${stage}: the filed cohort ${row.cohort_year} is newer than this file's ${edition.cohort_year} — refusing to file an older cohort over it`,
        );
      if (
        row.cohort_year === edition.cohort_year &&
        row.version === "Revised" &&
        edition.version === "Provisional"
      )
        throw new Error(
          `${stage}: the filed ${edition.cohort_year} cohort is already Revised — a Provisional pull never supersedes it`,
        );
    }
    progress?.stage(
      `staging ${formatCount(records.length)} destination rows (${formatCount(filing.collections.ks4.filed.length)} key stage 4, ${formatCount(filing.collections.ks5.filed.length)} 16-19)`,
    );
    for (let at = stagedRows; at < records.length; at += CHUNK) {
      const chunk = records.slice(at, at + CHUNK);
      const started = Date.now();
      const values = [];
      const params = [];
      const base = resume ? resume.takeSeq(chunk.length) : 0;
      chunk.forEach((record, i) => {
        const b = resume ? i * 19 : i * 18;
        values.push(
          resume
            ? `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17},$${b + 18},$${b + 19})`
            : `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17},$${b + 18})`,
        );
        const share = (field) => [record.shares[field].value, record.shares[field].low];
        params.push(
          record.urn,
          record.stage,
          filing.collections[record.stage].cohortYear,
          record.version,
          record.cohortCount,
          ...share("overall"),
          ...share("education"),
          ...share("higher_education"),
          ...share("apprenticeships"),
          ...share("employment"),
          record.state,
          SOURCE_NAME,
          filing.published,
        );
        if (resume) params.push(base + i);
      });
      await client.query(
        resume
          ? `INSERT INTO school_destinations_stage (urn, stage, cohort_year, version, cohort_count, overall, overall_low, education, education_low, higher_education, higher_education_low, apprenticeships, apprenticeships_low, employment, employment_low, state, source_name, source_date, seq) VALUES ${values.join(",")}`
          : `INSERT INTO school_destinations_stage (urn, stage, cohort_year, version, cohort_count, overall, overall_low, education, education_low, higher_education, higher_education_low, apprenticeships, apprenticeships_low, employment, employment_low, state, source_name, source_date) VALUES ${values.join(",")}`,
        params,
      );
      stagedRows += chunk.length;
      chunksDone += 1;
      const { tookMs, averageMs, slow } = stageWatch.observe(Date.now() - started);
      stageTally?.tick(chunksDone);
      progress?.heartbeat({ stage: "staging", done: chunksDone, total: chunks });
      if (slow) {
        progress?.warning({
          what: "stage chunk duration",
          value: `chunk ${chunksDone} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
      if (resume) {
        await resume.checkpoint({
          edition,
          expected: records.length,
          nextStartIndex: stagedRows,
          read: stagedRows,
          filed: stagedRows,
          unit: "rows",
        });
      }
    }
    stageTally?.finish(chunksDone, `${formatCount(records.length)} rows staged`);
    const staged = await client.query("SELECT count(*)::int AS n FROM school_destinations_stage");
    if (staged.rows[0].n !== records.length)
      throw new Error("the staged row count does not match — rolling back");
    // The URN join floor, live filings only: at least
    // 90% of each stage's filed URNs must join the filed
    // schools table.
    if (enforceJoin) {
      for (const stage of ["ks4", "ks5"]) {
        const joined = await client.query(
          `SELECT count(*)::int AS n FROM school_destinations_stage s
           JOIN schools sch ON sch.urn = s.urn WHERE s.stage = $1`,
          [stage],
        );
        const total = filing.collections[stage].filed.length;
        if (joined.rows[0].n < Math.floor(total * JOIN_FLOOR))
          throw new Error(
            `join failure: ${joined.rows[0].n} of ${total} ${stage} URNs join the filed schools table — below the ${JOIN_FLOOR * 100}% floor (a wrong file or a GIAS break); nothing filed`,
          );
      }
    }
    progress?.stage("swap started — replacing the filed destinations");
    if (resume) {
      await client.query("BEGIN");
      try {
        await client.query("DELETE FROM school_destinations");
        await client.query(
          `INSERT INTO school_destinations (urn, stage, cohort_year, version, cohort_count, overall, overall_low, education, education_low, higher_education, higher_education_low, apprenticeships, apprenticeships_low, employment, employment_low, state, source_name, source_date)
           SELECT urn, stage, cohort_year, version, cohort_count, overall, overall_low, education, education_low, higher_education, higher_education_low, apprenticeships, apprenticeships_low, employment, employment_low, state, source_name, source_date FROM school_destinations_stage`,
        );
        const filedCount = await client.query("SELECT count(*)::int AS n FROM school_destinations");
        if (filedCount.rows[0].n !== records.length)
          throw new Error("the filed row count does not match — rolling back");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
      // The run is complete: staging + checkpoint go together,
      // so nothing is left behind for the next edition.
      await resume.clear();
    } else {
      await client.query("DELETE FROM school_destinations");
      await client.query(
        `INSERT INTO school_destinations (urn, stage, cohort_year, version, cohort_count, overall, overall_low, education, education_low, higher_education, higher_education_low, apprenticeships, apprenticeships_low, employment, employment_low, state, source_name, source_date)
         SELECT urn, stage, cohort_year, version, cohort_count, overall, overall_low, education, education_low, higher_education, higher_education_low, apprenticeships, apprenticeships_low, employment, employment_low, state, source_name, source_date FROM school_destinations_stage`,
      );
      const filedCount = await client.query("SELECT count(*)::int AS n FROM school_destinations");
      if (filedCount.rows[0].n !== records.length)
        throw new Error("the filed row count does not match — rolling back");
      await client.query("COMMIT");
    }
    return { filed: true };
  } catch (error) {
    // BUG-265: the failure line names the filing stage and
    // how many rows were staged — the swap rolled back, so
    // the last good filing stands and a re-run starts over.
    // BUG-368: in resume mode the line names the point the
    // next run resumes from instead.
    progress?.failed({
      stage: "filing",
      filed: stagedRows,
      total: records.length,
      error,
      resume: resume
        ? resume.resumeNote()
        : "re-run from scratch (the swap rolled back, the last good filing stands)",
    });
    if (!resumeOpts) await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Sources and main.
// ---------------------------------------------------------------------------
async function fetchText(url, what) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${what}`);
  return response.text();
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

  const discoveries = {};
  const streams = {};
  // BUG-265: one logger for the run — a stage marker per
  // file read, the read counts inside collectHeadline, the
  // staging tally inside fileDestinations, and the checks
  // failure line below. (Discovery itself fails fast and
  // keeps the existing FAILED line; the read and filing
  // failure lines live where the long work is.)
  const progress = createProgressLogger({ name: "load-school-destinations" });
  if (fixtureMode) {
    for (const [key, publication] of Object.entries(PUBLICATIONS)) {
      const html = await readFile(join(fixtureDir, `catalogue-${key}.html`), "utf8");
      discoveries[key] = parseCatalogue(html, publication);
      streams[key] = createReadStream(join(fixtureDir, `${key}.csv`));
    }
  } else {
    for (const [key, publication] of Object.entries(PUBLICATIONS)) {
      const html = await fetchText(
        catalogueUrl(publication.publicationId),
        `the ${key} data catalogue page`,
      );
      discoveries[key] = parseCatalogue(html, publication);
      const response = await fetch(csvUrl(discoveries[key].dataSetId));
      if (!response.ok)
        throw new Error(`HTTP ${response.status} for the ${key} destinations CSV download`);
      streams[key] = Readable.fromWeb(response.body);
    }
  }

  const collections = {};
  for (const key of Object.keys(PUBLICATIONS)) {
    progress.stage(`reading the ${key === "ks4" ? "key stage 4" : "16-19"} destinations file`);
    collections[key] = await collectHeadline(parseCsvObjects(streams[key]), key, { progress });
  }
  try {
    checkReleaseAgreement(discoveries.ks4, discoveries.ks5, collections.ks4, collections.ks5);
    for (const key of Object.keys(PUBLICATIONS))
      checkStaleness(collections[key], discoveries[key].published);
    if (!fixtureMode) {
      checkBand(collections.ks4, KS4_SNAPSHOT);
      checkBand(collections.ks5, KS5_SNAPSHOT);
    }
    checkGolden([collections.ks4, collections.ks5]);
  } catch (err) {
    // BUG-265: the agreement, staleness, band and golden
    // checks all fail before anything is filed.
    progress.failed({
      stage: "checks",
      filed: 0,
      error: err,
      resume: "re-run from scratch (nothing is filed until the swap)",
    });
    throw err;
  }

  const filing = { collections, published: discoveries.ks4.published };
  const summary = () =>
    `load-school-destinations · ${SOURCE_NAME} · release "${discoveries.ks4.release}" published ${filing.published} · ` +
    `cohort ${collections.ks4.cohortYear} (${collections.ks4.version}) · ` +
    `KS4 ${formatCount(collections.ks4.filed.length)} institutions (${formatCount(collections.ks4.consortiumGroups)} consortium groups resolved) · ` +
    `KS5 ${formatCount(collections.ks5.filed.length)} institutions (${formatCount(collections.ks5.consortiumGroups)} consortium groups resolved)`;

  if (verifyOnly) {
    console.log(
      `${summary()} · golden checks OK (verify only, nothing filed; the URN join check runs in the filing path and was skipped)`,
    );
    return;
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not set — filing requires a database");

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let result;
  try {
    // BUG-368: stage resumably — a killed run's staging +
    // checkpoint survive, and the next run resumes from the
    // checkpoint instead of re-staging.
    result = await fileDestinations(client, filing, {
      enforceJoin: !fixtureMode,
      progress,
      resume: { restart },
    });
  } finally {
    await client.end();
  }
  console.log(
    result.filed
      ? `${summary()} · filed · golden checks OK · ${Math.round((Date.now() - startedAt) / 1000)}s`
      : `${summary()} · edition unchanged — nothing filed`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`load-school-destinations FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
