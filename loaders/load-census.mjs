// Census 2021 loader — ONS via Nomis bulk downloads
// (plan step M5.8).
//
// Files Census 2021 counts for every MSOA in England and
// Wales into census_stats — a ONE-OFF, static load (the
// runner's static class: due exactly once, watched by the
// nomis-census canary, refreshed only by a manual re-run if
// Nomis ever republishes). The consumers are the paid
// report's demographics section (M8.1/M8.2): the age chart,
// the five sample charts (tenure, housing type, ethnic
// group, religion, bedroom occupancy) and the social-rented
// share as its own line. Nothing census reaches the free
// panel, headlines or shortlist.
//
// The source (prep + gap reports, 13 Nov 2026): Nomis
// publishes every Census 2021 topic-summary dataset as one
// KEYLESS bulk zip (Open Government Licence v3.0) — no
// registration, no API key, no K number (founder ruling
// Q4). The API is paged and capped (25,000 rows guest); one
// dataset at MSOA grain is 7,264 areas × up to 25 categories
// ≈ 182,000 rows filed long-form, versus one zip. Each zip
// holds one CSV per geography; this loader reads only the
// MSOA file.
//
// Founder rulings baked in (13 Nov 2026):
//   Q1 — TS007A (age by five-year bands) is a SIXTH dataset:
//     M8.1(a) promises the age chart, and plain "TS007" is
//     single-year ages, not the chart's table (gap G1).
//   Q2 — MSOA grain, into the new census_stats table
//     (migration 0011); neighbourhood_stats stays LSOA-keyed
//     for M5.9's IMD (gap G2).
//   Q3 — TS007 (single year) files too, and the report's
//     median age is COMPUTED from those published counts
//     (medianAge below, labelled as calculated wherever it
//     is served) — never interpolated from five-year bands
//     (gap G4). The formula reproduces the approved Birkdale
//     sample's 46.5 exactly from the real vector (46.450…).
//   Q5 — DWP claimant counts are NOT this step: monthly,
//     volatile, their own step later (gap G5).
//   Q6 — the static runner class (see run-loaders.mjs).
//
// Filing rules: COUNTS ONLY — Nomis publishes counts and
// every percentage in the approved samples is calculated
// from them, each against its own table's total (gap G3:
// disclosure control makes totals differ slightly between
// tables — Birkdale is 8,138 residents in TS021, 8,141 in
// TS007A; households 3,397/3,398/3,399 across the household
// tables — so no shared "population" is ever filed or
// implied). The FULL published category list files per
// dataset, under the published labels: the samples' chart
// groupings are presentation for the report layer, never a
// load-time merge (gap G6). Scotland and Northern Ireland
// file nothing and need nothing: their postcodes carry no
// MSOA code, so no census row can match them, and the
// served not-covered state is M8's named line (gap G7).
//
// All-or-nothing: every dataset is downloaded, parsed and
// validated before anything files, and the swap itself is
// one transaction — a partial census (five datasets filed,
// one missing) is impossible by construction.
//
// The header is the contract: each dataset's column set is
// asserted EXACTLY against the published lists below
// (measured from the bulk files at the first pull, 13 Nov
// 2026) — a silent re-issue with renamed or dropped
// categories fails the load loudly, naming the difference.
// One measured correction to the prep: the bulk TS007A tops
// out at "Aged 85 years and over", so it carries 18 bands,
// not the 19 the dataset page's category count suggests
// (19 is the count of count-columns including the total —
// the same reading that gives TS021 25, TS030 10, TS044 9,
// TS052 6, TS054 13 and TS007 its 101 single years + total).
// TS007's file also carries band-aggregate columns beside
// the single years; they are shape-asserted and not filed
// (the years vector is the fact; the aggregates are
// derivable from it, perturbation aside).
//
// Reachability: the prep sandbox could not reach Nomis at
// all (7 of 7 connection resets — the M5.3/PHI pattern), but
// the build's first pull from this sandbox SUCCEEDED (13 Nov
// 2026: seven zips, 28.6 MB in total, ~68 s end to end, the
// slowest single file TS021 at ~37 s). The --verify-only
// timings in the build report are that pull, run through
// this loader. The founder-machine fallback stands anyway:
// download the seven zips by hand into one folder and run
// with --file <folder> (loose MSOA CSVs in the same folder
// are read directly — that is the fixture's layout).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import yauzl from "yauzl";

const { Pool } = pg;

export const SOURCE_NAME = "ONS Census 2021 via Nomis (bulk download)";
// Census Day — the reference date of every figure.
export const SOURCE_DATE = "2021-03-21";
export const BULK_BASE = "https://www.nomisweb.co.uk/output/census/2021";
export const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";
export const MSOA_COUNT = 7264;

// --- the contracted category lists (the header contract) ---

export const AGE_BANDS = [
  "Aged 4 years and under",
  "Aged 5 to 9 years",
  "Aged 10 to 14 years",
  "Aged 15 to 19 years",
  "Aged 20 to 24 years",
  "Aged 25 to 29 years",
  "Aged 30 to 34 years",
  "Aged 35 to 39 years",
  "Aged 40 to 44 years",
  "Aged 45 to 49 years",
  "Aged 50 to 54 years",
  "Aged 55 to 59 years",
  "Aged 60 to 64 years",
  "Aged 65 to 69 years",
  "Aged 70 to 74 years",
  "Aged 75 to 79 years",
  "Aged 80 to 84 years",
  "Aged 85 years and over",
];

// TS007's band aggregates, published beside the single
// years (shape-asserted, never filed — see the header).
export const AGE_AGGREGATES = [
  "Aged 4 years and under",
  "Aged 5 to 9 years",
  "Aged 10 to 15 years",
  "Aged 16 to 19 years",
  "Aged 20 to 24 years",
  "Aged 25 to 34 years",
  "Aged 35 to 49 years",
  "Aged 50 to 64 years",
  "Aged 65 to 74 years",
  "Aged 75 to 84 years",
  "Aged 85 years and over",
];

export const ETHNIC_GROUPS = [
  "Asian, Asian British or Asian Welsh",
  "Black, Black British, Black Welsh, Caribbean or African",
  "Mixed or Multiple ethnic groups",
  "White",
  "Other ethnic group",
];

export const ETHNIC_CATEGORIES = [
  "Asian, Asian British or Asian Welsh: Bangladeshi",
  "Asian, Asian British or Asian Welsh: Chinese",
  "Asian, Asian British or Asian Welsh: Indian",
  "Asian, Asian British or Asian Welsh: Pakistani",
  "Asian, Asian British or Asian Welsh: Other Asian",
  "Black, Black British, Black Welsh, Caribbean or African: African",
  "Black, Black British, Black Welsh, Caribbean or African: Caribbean",
  "Black, Black British, Black Welsh, Caribbean or African: Other Black",
  "Mixed or Multiple ethnic groups: White and Asian",
  "Mixed or Multiple ethnic groups: White and Black African",
  "Mixed or Multiple ethnic groups: White and Black Caribbean",
  "Mixed or Multiple ethnic groups: Other Mixed or Multiple ethnic groups",
  "White: English, Welsh, Scottish, Northern Irish or British",
  "White: Irish",
  "White: Gypsy or Irish Traveller",
  "White: Roma",
  "White: Other White",
  "Other ethnic group: Arab",
  "Other ethnic group: Any other ethnic group",
];

export const RELIGION_CATEGORIES = [
  "No religion",
  "Christian",
  "Buddhist",
  "Hindu",
  "Jewish",
  "Muslim",
  "Sikh",
  "Other religion",
  "Not answered",
];

export const ACCOMMODATION_CATEGORIES = [
  "Detached",
  "Semi-detached",
  "Terraced",
  "In a purpose-built block of flats or tenement",
  "Part of a converted or shared house, including bedsits",
  "Part of another converted building, for example, former school, church or warehouse",
  "In a commercial building, for example, in an office building, hotel or over a shop",
  "A caravan or other mobile or temporary structure",
];

// The published header repeats the dimension ("Occupancy
// rating of bedrooms: +2 or more"); the filed key is the
// rating itself.
export const OCCUPANCY_CATEGORIES = [
  { head: "Occupancy rating of bedrooms: +2 or more", key: "+2 or more" },
  { head: "Occupancy rating of bedrooms: +1", key: "+1" },
  { head: "Occupancy rating of bedrooms: 0", key: "0" },
  { head: "Occupancy rating of bedrooms: -1", key: "-1" },
  { head: "Occupancy rating of bedrooms: -2 or less", key: "-2 or less" },
];

export const TENURE_CATEGORIES = [
  "Owned",
  "Owned: Owns outright",
  "Owned: Owns with a mortgage or loan",
  "Shared ownership",
  "Shared ownership: Shared ownership",
  "Social rented",
  "Social rented: Rents from council or Local Authority",
  "Social rented: Other social rented",
  "Private rented",
  "Private rented: Private landlord or letting agency",
  "Private rented: Other private rented",
  "Lives rent free",
];

export const DATASETS = [
  { code: "ts007a", kind: "bands", title: "Age by five-year age bands" },
  { code: "ts007", kind: "years", title: "Age by single year" },
  { code: "ts021", kind: "ethnic", title: "Ethnic group" },
  { code: "ts030", kind: "labelled", title: "Religion", categories: RELIGION_CATEGORIES },
  {
    code: "ts044",
    kind: "labelled",
    title: "Accommodation type",
    categories: ACCOMMODATION_CATEGORIES,
  },
  { code: "ts052", kind: "occupancy", title: "Occupancy rating for bedrooms" },
  { code: "ts054", kind: "labelled", title: "Tenure", categories: TENURE_CATEGORIES },
];

// --- golden figures -----------------------------------------
//
// The three universal golden homes' MSOAs. Birkdale and
// Exeter are the approved sample reports' areas (prep
// Section 5) — every figure the samples itemise was verified
// cell-by-cell against the bulk files at the first pull and
// matched exactly. Epsom and Ewell 010 had no approved
// sample; its row is the first pull's measured row, locked
// here so the parent can lift it into the golden matrix at
// the tick.

const ETHNIC_ASIAN = "Asian, Asian British or Asian Welsh";
const ETHNIC_BLACK = "Black, Black British, Black Welsh, Caribbean or African";
const ETHNIC_MIXED = "Mixed or Multiple ethnic groups";

export const GOLDEN = {
  E02004463: {
    name: "Braintree 018",
    totals: {
      ts007a: 8141,
      ts007: 8136,
      ts021: 8138,
      ts030: 8138,
      ts044: 3398,
      ts052: 3399,
      ts054: 3397,
    },
    socialRented: 469,
    medianAge: 46.5,
    ts021: {
      groups: {
        [ETHNIC_ASIAN]: 115,
        [ETHNIC_BLACK]: 82,
        [ETHNIC_MIXED]: 131,
        White: 7772,
        "Other ethnic group": 38,
      },
      categories: {
        [`${ETHNIC_ASIAN}: Bangladeshi`]: 3,
        [`${ETHNIC_ASIAN}: Chinese`]: 9,
        [`${ETHNIC_ASIAN}: Indian`]: 43,
        [`${ETHNIC_ASIAN}: Pakistani`]: 22,
        [`${ETHNIC_ASIAN}: Other Asian`]: 38,
        [`${ETHNIC_BLACK}: African`]: 58,
        [`${ETHNIC_BLACK}: Caribbean`]: 17,
        [`${ETHNIC_BLACK}: Other Black`]: 7,
        [`${ETHNIC_MIXED}: White and Asian`]: 43,
        [`${ETHNIC_MIXED}: White and Black African`]: 21,
        [`${ETHNIC_MIXED}: White and Black Caribbean`]: 29,
        [`${ETHNIC_MIXED}: Other Mixed or Multiple ethnic groups`]: 38,
        "White: English, Welsh, Scottish, Northern Irish or British": 7528,
        "White: Irish": 57,
        "White: Gypsy or Irish Traveller": 15,
        "White: Roma": 0,
        "White: Other White": 172,
        "Other ethnic group: Arab": 4,
        "Other ethnic group: Any other ethnic group": 34,
      },
    },
  },
  E02000749: {
    name: "Newham 036",
    totals: {
      ts007a: 9552,
      ts007: 9547,
      ts021: 9552,
      ts030: 9550,
      ts044: 3329,
      ts052: 3330,
      ts054: 3330,
    },
    socialRented: 1631,
    ts021: {
      groups: {
        [ETHNIC_ASIAN]: 1637,
        [ETHNIC_BLACK]: 2940,
        [ETHNIC_MIXED]: 596,
        White: 3969,
        "Other ethnic group": 410,
      },
      categories: {
        [`${ETHNIC_ASIAN}: Bangladeshi`]: 808,
        [`${ETHNIC_ASIAN}: Chinese`]: 150,
        [`${ETHNIC_ASIAN}: Indian`]: 215,
        [`${ETHNIC_ASIAN}: Pakistani`]: 201,
        [`${ETHNIC_ASIAN}: Other Asian`]: 263,
        [`${ETHNIC_BLACK}: African`]: 2126,
        [`${ETHNIC_BLACK}: Caribbean`]: 466,
        [`${ETHNIC_BLACK}: Other Black`]: 348,
        [`${ETHNIC_MIXED}: White and Asian`]: 74,
        [`${ETHNIC_MIXED}: White and Black African`]: 148,
        [`${ETHNIC_MIXED}: White and Black Caribbean`]: 195,
        [`${ETHNIC_MIXED}: Other Mixed or Multiple ethnic groups`]: 179,
        "White: English, Welsh, Scottish, Northern Irish or British": 2269,
        "White: Irish": 56,
        "White: Gypsy or Irish Traveller": 25,
        "White: Roma": 133,
        "White: Other White": 1486,
        "Other ethnic group: Arab": 90,
        "Other ethnic group: Any other ethnic group": 320,
      },
    },
  },
  E02006837: {
    name: "Epsom and Ewell 010",
    totals: {
      ts007a: 11788,
      ts007: 11784,
      ts021: 11787,
      ts030: 11785,
      ts044: 4439,
      ts052: 4438,
      ts054: 4440,
    },
    socialRented: 241,
    ts021: {
      groups: {
        [ETHNIC_ASIAN]: 1546,
        [ETHNIC_BLACK]: 158,
        [ETHNIC_MIXED]: 528,
        White: 9270,
        "Other ethnic group": 285,
      },
      categories: {
        [`${ETHNIC_ASIAN}: Bangladeshi`]: 55,
        [`${ETHNIC_ASIAN}: Chinese`]: 238,
        [`${ETHNIC_ASIAN}: Indian`]: 719,
        [`${ETHNIC_ASIAN}: Pakistani`]: 253,
        [`${ETHNIC_ASIAN}: Other Asian`]: 281,
        [`${ETHNIC_BLACK}: African`]: 108,
        [`${ETHNIC_BLACK}: Caribbean`]: 30,
        [`${ETHNIC_BLACK}: Other Black`]: 20,
        [`${ETHNIC_MIXED}: White and Asian`]: 225,
        [`${ETHNIC_MIXED}: White and Black African`]: 61,
        [`${ETHNIC_MIXED}: White and Black Caribbean`]: 59,
        [`${ETHNIC_MIXED}: Other Mixed or Multiple ethnic groups`]: 183,
        "White: English, Welsh, Scottish, Northern Irish or British": 8225,
        "White: Irish": 183,
        "White: Gypsy or Irish Traveller": 8,
        "White: Roma": 15,
        "White: Other White": 839,
        "Other ethnic group: Arab": 84,
        "Other ethnic group: Any other ethnic group": 201,
      },
    },
  },
};

// National sums of each dataset's Total column at the first
// pull (13 Nov 2026) — cliff bands, not exact locks: a
// republication may legitimately move them a little (the
// canary's golden arm is the exact tripwire); a broken feed
// or a wrong-geography file moves them by orders of
// magnitude.
export const NATIONAL_TOTAL_BANDS = {
  ts021: { measured: 59597771, slack: 5000 },
  ts054: { measured: 24783284, slack: 5000 },
};

// --- median age (Q3) ----------------------------------------
//
// The grouped-interpolation median over single-year counts:
// each age a is the interval [a, a+1); the median is where
// the cumulative count crosses N/2 inside its interval.
// Exported for the report layer (M8) and tested here. From
// the real Birkdale vector this yields 46.450… — the
// approved sample's printed 46.5 at one decimal place.

export function medianAge(years) {
  const total = years.reduce((sum, n) => sum + n, 0);
  if (total <= 0) throw new Error("median age needs a non-empty single-year vector");
  const half = total / 2;
  let cum = 0;
  for (let age = 0; age < years.length; age += 1) {
    const f = years[age] ?? 0;
    if (f > 0 && cum + f >= half) return age + (half - cum) / f;
    cum += f;
  }
  throw new Error("median age walked off the end of the vector");
}

// --- CSV parsing ----------------------------------------------

// Quote-aware CSV → rows of string fields. The bulk files
// quote any field containing a comma (most category
// headers); values are plain integers.
export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\ufeff/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

// A raw header → the label the contract speaks: the measure
// suffix ("; measures: Value", which TS007's file carries
// and the others do not) is dropped, then the dataset
// prefix ("Ethnic group: ", "Age: ", …) is stripped once.
function headerLabel(rawHeader) {
  const noMeasure = rawHeader.replace(/;\s*measures:.*$/i, "").trim();
  const at = noMeasure.indexOf(": ");
  return at === -1 ? noMeasure : noMeasure.slice(at + 2).trim();
}

function countValue(raw, dataset, label, code) {
  if (!/^\d+$/.test(raw ?? ""))
    throw new Error(
      `${dataset}: the ${label} count for ${code} is "${raw}" — not a published non-negative integer`,
    );
  return Number(raw);
}

// Split one parsed CSV into its header contract + per-area
// raw counts, validating the column SET exactly.
function splitCsv(text, dataset) {
  const rows = parseCsvText(text);
  if (rows.length < 2) throw new Error(`${dataset.code}: the MSOA CSV is empty`);
  const header = rows[0].map((h) => h.trim());
  const nameAt = header.indexOf("geography");
  const codeAt = header.indexOf("geography code");
  if (nameAt === -1 || codeAt === -1)
    throw new Error(`${dataset.code}: the MSOA CSV has no geography / geography code columns`);
  const columns = new Map(); // filed label → column index
  let totalAt = -1;
  header.forEach((raw, i) => {
    if (i === nameAt || i === codeAt || raw === "date") return;
    const label = headerLabel(raw);
    if (label === "Total" || label.startsWith("Total:")) {
      if (totalAt !== -1) throw new Error(`${dataset.code}: two Total columns — the shape changed`);
      totalAt = i;
      return;
    }
    if (columns.has(label)) throw new Error(`${dataset.code}: the column "${label}" appears twice`);
    columns.set(label, i);
  });
  if (totalAt === -1) throw new Error(`${dataset.code}: no Total column — the shape changed`);
  const areas = new Map();
  for (const row of rows.slice(1)) {
    const code = (row[codeAt] ?? "").trim();
    if (!/^[EW]02\d{6}$/.test(code))
      throw new Error(
        `${dataset.code}: a row's geography code is "${code}" — not a 2021 MSOA code`,
      );
    if (areas.has(code)) throw new Error(`${dataset.code}: ${code} appears twice`);
    const counts = new Map();
    for (const [label, i] of columns)
      counts.set(label, countValue(row[i], dataset.code, label, code));
    areas.set(code, {
      name: (row[nameAt] ?? "").trim(),
      total: countValue(row[totalAt], dataset.code, "Total", code),
      counts,
    });
  }
  return areas;
}

function expectLabels(dataset, areas, expected, what) {
  const seen = new Set();
  for (const area of areas.values()) for (const label of area.counts.keys()) seen.add(label);
  const missing = expected.filter((l) => !seen.has(l));
  const extra = [...seen].filter((l) => !expected.includes(l));
  if (missing.length > 0 || extra.length > 0)
    throw new Error(
      `${dataset.code}: the ${what} columns do not match the published list — missing: ${missing.join(" | ") || "none"}; unexpected: ${extra.join(" | ") || "none"} (the header is the contract; a re-issue that renames categories must fail here, not file)`,
    );
}

// Parse + validate one dataset's MSOA CSV into its stats
// fragment per area. Pure — the tests run this on the
// fixture.
export function parseDatasetCsv(text, dataset) {
  const areas = splitCsv(text, dataset);
  const out = new Map();
  if (dataset.kind === "bands") {
    expectLabels(dataset, areas, AGE_BANDS, "age band");
    for (const [code, area] of areas) {
      const bands = {};
      for (const band of AGE_BANDS) bands[band] = area.counts.get(band);
      out.set(code, { name: area.name, fragment: { total: area.total, bands } });
    }
  } else if (dataset.kind === "years") {
    const yearAt = new Map();
    const aggregates = new Set();
    for (const area of areas.values()) {
      for (const label of area.counts.keys()) {
        const single = /^Aged (under 1 year|1 year|\d+ years|100 years and over)$/.exec(label);
        if (single) {
          const age =
            single[1] === "under 1 year"
              ? 0
              : single[1] === "100 years and over"
                ? 100
                : Number.parseInt(single[1], 10);
          if (yearAt.has(age) && yearAt.get(age) !== label)
            throw new Error(`${dataset.code}: two columns claim age ${age}`);
          yearAt.set(age, label);
        } else aggregates.add(label);
      }
    }
    if (yearAt.size !== 101)
      throw new Error(
        `${dataset.code}: ${yearAt.size} single-year columns — expected 101 (ages 0–100)`,
      );
    expectLabels(dataset, areas, [...AGE_AGGREGATES, ...yearAt.values()], "age");
    void aggregates;
    for (const [code, area] of areas) {
      const years = new Array(101).fill(0);
      for (const [age, label] of yearAt) years[age] = area.counts.get(label);
      out.set(code, { name: area.name, fragment: { total: area.total, years } });
    }
  } else if (dataset.kind === "ethnic") {
    expectLabels(dataset, areas, [...ETHNIC_GROUPS, ...ETHNIC_CATEGORIES], "ethnic group");
    for (const [code, area] of areas) {
      const groups = {};
      const categories = {};
      for (const g of ETHNIC_GROUPS) groups[g] = area.counts.get(g);
      for (const c of ETHNIC_CATEGORIES) categories[c] = area.counts.get(c);
      out.set(code, { name: area.name, fragment: { total: area.total, groups, categories } });
    }
  } else if (dataset.kind === "occupancy") {
    expectLabels(
      dataset,
      areas,
      OCCUPANCY_CATEGORIES.map((c) => c.head),
      "occupancy rating",
    );
    for (const [code, area] of areas) {
      const categories = {};
      for (const c of OCCUPANCY_CATEGORIES) categories[c.key] = area.counts.get(c.head);
      out.set(code, { name: area.name, fragment: { total: area.total, categories } });
    }
  } else {
    expectLabels(dataset, areas, dataset.categories, dataset.code);
    for (const [code, area] of areas) {
      const categories = {};
      for (const c of dataset.categories) categories[c] = area.counts.get(c);
      const fragment = { total: area.total, categories };
      if (dataset.code === "ts054") fragment.social_rented = area.counts.get("Social rented");
      out.set(code, { name: area.name, fragment });
    }
  }
  return out;
}

// Merge the seven parsed datasets into filing rows. Every
// dataset must cover exactly the same areas (a dataset
// short of areas fails the whole load — the all-or-nothing
// rule), and the published area name must agree across
// datasets.
export function buildRows(parsedByCode) {
  const datasets = DATASETS.map((d) => d.code);
  let reference = null;
  for (const code of datasets) {
    const areas = parsedByCode.get(code);
    if (!areas) throw new Error(`the ${code} dataset was not parsed`);
    if (reference === null) reference = areas;
    else if (areas.size !== reference.size)
      throw new Error(
        `the datasets disagree on coverage: ${code} holds ${areas.size} areas, ts007a holds ${reference.size} — a partial census must never file`,
      );
    for (const codeKey of areas.keys())
      if (!reference.has(codeKey))
        throw new Error(
          `the datasets disagree on coverage: ${codeKey} is in ${code} but not in ts007a`,
        );
  }
  const rows = [];
  for (const [msoaCode, first] of parsedByCode.get("ts007a")) {
    const stats = {};
    for (const code of datasets) {
      const area = parsedByCode.get(code).get(msoaCode);
      if (area.name !== first.name)
        throw new Error(
          `${msoaCode}: the area name disagrees between datasets ("${first.name}" vs "${area.name}" in ${code})`,
        );
      stats[code] = area.fragment;
    }
    rows.push({ msoaCode, msoaName: first.name, stats });
  }
  return rows.sort((a, b) => (a.msoaCode < b.msoaCode ? -1 : 1));
}

// --- golden checks --------------------------------------------

const sumValues = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

export function goldenChecks(rows, { full }) {
  const failures = [];
  const byCode = new Map(rows.map((r) => [r.msoaCode, r]));
  for (const [code, golden] of Object.entries(GOLDEN)) {
    const row = byCode.get(code);
    if (!row) {
      failures.push(`${code} (${golden.name}) is missing from the load`);
      continue;
    }
    if (row.msoaName !== golden.name)
      failures.push(`${code}: filed name "${row.msoaName}", expected "${golden.name}"`);
    for (const [dataset, total] of Object.entries(golden.totals)) {
      if (row.stats[dataset].total !== total)
        failures.push(
          `${golden.name}: ${dataset} total is ${row.stats[dataset].total}, expected ${total}`,
        );
    }
    // The full TS021 vectors, exactly as published.
    for (const section of ["groups", "categories"]) {
      for (const [label, value] of Object.entries(golden.ts021[section])) {
        if (row.stats.ts021[section][label] !== value)
          failures.push(
            `${golden.name}: TS021 ${label} is ${row.stats.ts021[section][label]}, expected ${value}`,
          );
      }
    }
    if (row.stats.ts054.social_rented !== golden.socialRented)
      failures.push(
        `${golden.name}: TS054 social rented is ${row.stats.ts054.social_rented}, expected ${golden.socialRented}`,
      );
    // Additivity inside the golden rows (measured exact at
    // the first pull): groups sum to the total; each group's
    // detailed categories sum to the group.
    const ts021 = row.stats.ts021;
    if (sumValues(ts021.groups) !== ts021.total)
      failures.push(`${golden.name}: TS021 groups do not sum to its total`);
    for (const group of ETHNIC_GROUPS) {
      const children = ETHNIC_CATEGORIES.filter((c) => c.startsWith(`${group}: `));
      if (children.reduce((sum, c) => sum + ts021.categories[c], 0) !== ts021.groups[group])
        failures.push(`${golden.name}: TS021 ${group} categories do not sum to the group`);
    }
    const ts054 = row.stats.ts054.categories;
    if (
      ts054["Owned"] !==
      ts054["Owned: Owns outright"] + ts054["Owned: Owns with a mortgage or loan"]
    )
      failures.push(`${golden.name}: TS054 Owned does not equal outright + mortgage`);
    if (
      ts054["Social rented"] !==
      ts054["Social rented: Rents from council or Local Authority"] +
        ts054["Social rented: Other social rented"]
    )
      failures.push(`${golden.name}: TS054 Social rented does not equal council + other social`);
    if (
      ts054["Private rented"] !==
      ts054["Private rented: Private landlord or letting agency"] +
        ts054["Private rented: Other private rented"]
    )
      failures.push(`${golden.name}: TS054 Private rented does not equal landlord/agency + other`);
    if (
      row.stats.ts054.total !==
      ts054["Owned"] +
        ts054["Shared ownership"] +
        ts054["Social rented"] +
        ts054["Private rented"] +
        ts054["Lives rent free"]
    )
      failures.push(`${golden.name}: TS054 tenure groups do not sum to its total`);
    for (const dataset of ["ts030", "ts044", "ts052"]) {
      if (sumValues(row.stats[dataset].categories) !== row.stats[dataset].total)
        failures.push(`${golden.name}: ${dataset} categories do not sum to its total`);
    }
    if (sumValues(row.stats.ts007a.bands) !== row.stats.ts007a.total)
      failures.push(`${golden.name}: TS007A bands do not sum to its total`);
    if (row.stats.ts007.years.reduce((a, b) => a + b, 0) !== row.stats.ts007.total)
      failures.push(`${golden.name}: TS007 single years do not sum to its total`);
    if (golden.medianAge !== undefined) {
      const median = medianAge(row.stats.ts007.years);
      if (Math.round(median * 10) / 10 !== golden.medianAge)
        failures.push(
          `${golden.name}: computed median age is ${median.toFixed(2)}, expected the approved sample's ${golden.medianAge} at one decimal place`,
        );
    }
  }
  if (full) {
    if (rows.length !== MSOA_COUNT)
      failures.push(`the load holds ${rows.length} areas, expected exactly ${MSOA_COUNT} MSOAs`);
    for (const [dataset, band] of Object.entries(NATIONAL_TOTAL_BANDS)) {
      const sum = rows.reduce((acc, r) => acc + r.stats[dataset].total, 0);
      if (Math.abs(sum - band.measured) > band.slack)
        failures.push(
          `the national ${dataset} total is ${sum} — outside ±${band.slack} of the first pull's ${band.measured} (a cliff means a broken feed or the wrong geography file, not growth)`,
        );
    }
  }
  return failures;
}

// --- filing -----------------------------------------------------
//
// Stage-table swap — the house pattern, one transaction for
// the whole census (BEGIN before the ON COMMIT DROP stage
// create: outside a transaction each statement is its own
// commit and the stage would drop itself — CI run 98's
// lesson; the column names are migration 0011's own, pinned
// by the schema-contract tests — CI run 99's lesson).

export async function fileCensus(pool, rows, retrievedAt) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE census_stage (
      msoa_code text, msoa_name text, stats jsonb,
      source_name text, source_date date
    ) ON COMMIT DROP`);
    const values = [];
    const params = [];
    const flush = async () => {
      if (values.length === 0) return;
      await client.query(
        `INSERT INTO census_stage (msoa_code, msoa_name, stats, source_name, source_date) VALUES ${values.join(", ")}`,
        params,
      );
      values.length = 0;
      params.length = 0;
    };
    for (const row of rows) {
      const base = params.length;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}::jsonb, $${base + 4}, $${base + 5})`);
      params.push(row.msoaCode, row.msoaName, JSON.stringify(row.stats), SOURCE_NAME, SOURCE_DATE);
      if (values.length >= 500) await flush();
    }
    await flush();
    await client.query("DELETE FROM census_stats");
    await client.query(
      `INSERT INTO census_stats (msoa_code, msoa_name, stats, source_name, source_date, loaded_at)
       SELECT msoa_code, msoa_name, stats, source_name, source_date, $1 FROM census_stage`,
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

// --- sources ----------------------------------------------------

export function zipUrl(code) {
  return `${BULK_BASE}/census2021-${code}.zip`;
}

async function fetchRetry(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (response.status >= 500 || response.status === 429)
        throw new Error(`HTTP ${response.status}`);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastError;
}

// The MSOA CSV out of one bulk zip buffer.
export function readMsoaCsvFromZip(buffer, code) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      let settled = false;
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (entry.fileName.split("/").pop()?.toLowerCase() !== `census2021-${code}-msoa.csv`)
          return zip.readEntry();
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const chunks = [];
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", () => {
            settled = true;
            resolve(Buffer.concat(chunks).toString("utf8"));
          });
          stream.on("error", reject);
        });
      });
      zip.on("error", reject);
      zip.on("end", () => {
        if (!settled)
          reject(new Error(`the ${code} bulk zip holds no census2021-${code}-msoa.csv entry`));
      });
    });
  });
}

async function downloadDatasetCsv(code) {
  const response = await fetchRetry(zipUrl(code));
  const buffer = Buffer.from(await response.arrayBuffer());
  return readMsoaCsvFromZip(buffer, code);
}

// One dataset from a local folder: the loose MSOA CSV (the
// fixture's layout), or the founder-downloaded bulk zip.
export function readDatasetFromDir(dir, code) {
  const csvPath = join(dir, `census2021-${code}-msoa.csv`);
  if (existsSync(csvPath)) return Promise.resolve(readFileSync(csvPath, "utf8"));
  const zipPath = join(dir, `census2021-${code}.zip`);
  if (existsSync(zipPath)) return readMsoaCsvFromZip(readFileSync(zipPath), code);
  return Promise.reject(
    new Error(
      `${dir} holds neither census2021-${code}-msoa.csv nor census2021-${code}.zip — all seven datasets must be present (the load is all-or-nothing)`,
    ),
  );
}

// Pull + parse + assemble everything, from the live bulk
// zips or from a local folder. Returns the filing rows and
// the per-dataset timings the build's verify pull reports.
export async function loadCensusRows(source) {
  const parsedByCode = new Map();
  const timings = [];
  for (const dataset of DATASETS) {
    const started = Date.now();
    const text =
      source.kind === "dir"
        ? await readDatasetFromDir(source.dir, dataset.code)
        : await downloadDatasetCsv(dataset.code);
    parsedByCode.set(dataset.code, parseDatasetCsv(text, dataset));
    timings.push({ code: dataset.code, ms: Date.now() - started });
  }
  return { rows: buildRows(parsedByCode), timings };
}

function summaryLine(rows, filed) {
  return (
    `load-census · 7 datasets · ${rows.length} areas ${filed ? "filed" : "would file"} ` +
    `(counts only; Census Day 21 March 2021)`
  );
}

const DEFAULT_FIXTURE_DIR = fileURLToPath(new URL("../../tests/fixtures/census/", import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const fixtureMode = fileArg !== null;
  const verifyOnly = args.includes("--verify-only");
  const source = fixtureMode
    ? { kind: "dir", dir: fileArg ?? DEFAULT_FIXTURE_DIR }
    : { kind: "live" };
  const { rows } = await loadCensusRows(source);
  const golden = goldenChecks(rows, { full: !fixtureMode });
  if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);
  if (verifyOnly) {
    console.log(`${summaryLine(rows, false)} — golden homes OK (verify-only: nothing filed)`);
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await fileCensus(pool, rows, new Date().toISOString());
  } finally {
    await pool.end();
  }
  console.log(`${summaryLine(rows, true)} — golden homes OK`);
}

// Run only as a script (run-loaders / npm), never on import.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(`load-census FAILED: ${err.message}`);
    process.exit(1);
  });
}
