// Universal Credit loader — DWP Stat-Xplore Open Data API
// (plan step M5.16; founder rulings Q1/Q6, 13 Nov 2026).
//
// Files both Universal Credit series for every LSOA in
// England and Wales into benefits_stats (migration 0013):
// 'uc_people' from the UC_Monthly database ("People on
// Universal Credit" — every person on UC at the count date,
// all conditionality regimes, INCLUDING people in work;
// wherever an UC figure is served it is described that way)
// and 'uc_households' from UC_Households ("Households on
// Universal Credit"). One half of the M5.16 benefits step;
// the Claimant Count half is load-claimant-count.mjs, a
// separate loader under the same step (the flood
// precedent), so this loader's key dependency can never
// stall the keyless series — and vice versa.
//
// ============================================================
// FIRST PULL — DONE, 13 Nov 2026, from the founder's own
// browser. DWP's gateway refuses every Muse-side network:
// the sandbox and the connector surrogate both drew
// HTTP 401 {"message":"Error authenticating API
// key.","errorType":"AUTHENTICATION"} for the original key
// AND a freshly reset one, in every documented
// presentation — while the SAME key, in the founder's home
// Chrome (YARC), returned 200 on /info with the rate-limit
// counter decrementing per call. The key and the account
// were never at fault; an earlier build of this file called
// the refusal "account-side", and that reading is corrected
// here. So the first pull ran as founder-run captures
// (schema nodes level by level, then the two golden table
// queries), and it reconciled everything the build had
// written against documentation alone:
//   - the schema is served ONE LEVEL at a time — discovery
//     now assembles the tree node by node (below);
//   - the /table grammar is recodes + dimensions-as-field-
//     arrays, and the response is {fields, cubes} — the
//     query builder and parser below are the real shapes,
//     proven against the captures;
//   - both count measures are confirmed from DWP's own
//     schema (people V_F_UC_CASELOAD_FULL; households
//     V_F_UC_HOUSEHOLDS — asserted in DATABASES now);
//   - the golden values are locked (GOLDEN_VALUES below);
//   - one gap: the Households table engine does not hold
//     Newham 036A (E01003511) — its schema value node
//     exists, correctly labelled, but a recode naming it is
//     refused RECODE_FIELD_VALUE_NOT_FOUND. Encoded as
//     HOUSEHOLDS_MISSING_LSOAS; the golden checks never
//     demand it for that series.
// What stays unverified until a keyed call answers from a
// network DWP accepts (the Hetzner VPS test at M12): the
// assembled live pull end-to-end, and the national
// Households LSOA count against the filing band — the
// first production pull is where that number is learned,
// not estimated here.
// ============================================================
//
// Cadence — read this before calling anything here
// "monthly": the loader RUNS monthly (the runner's 25-day
// class), but UC data points are PUBLISHED QUARTERLY — the
// release lands on the second Tuesday of February, May,
// August and November and adds up to three monthly points
// at once (the methodology's 12 May 2026 changelog records
// the frequency change). Each series has its OWN latest
// month (households runs behind people — it needs completed
// assessment periods), read from the API per series, never
// assumed shared. A UC figure is therefore between ~3 and
// ~6 months old at all times; serving prints each figure's
// own month and never the words "currently" or "now". A
// monthly run that finds no new UC month is a healthy
// no-op for that series, not a failure.
//
// Disclosure control: Stat-Xplore UC values are NOT
// rounded to the nearest 5 (that phrase belongs to a
// legacy DWP series and to the quarterly bulletin's
// commentary tables). DWP applies INTRODUCED RANDOM ERROR
// to these tables — every cell is randomly adjusted a
// little so no individual can be identified, and DWP warns
// that no reliance should be placed on small cells. The
// counts file exactly as returned; the serving wording is
// "as published by DWP; DWP adjusts small figures to protect confidentiality, so small-area counts are approximate".
// Within one data vintage the same query returns the same
// adjusted values, so a golden locked at the first pull is
// stable until the next quarterly release re-publishes
// (and may slightly move) that month.
//
// Geography: the residence-based geography field, LSOA
// level. From 14 Oct 2025 the UC statistics use Census
// Output Area 2021 geographies, so the LSOAs returned are
// the 2021 set our directory carries (the first pull
// confirmed the golden 2021 codes resolve in the field —
// with the one Households exception named below). No pct
// is ever filed for UC: DWP publishes no LSOA percentage,
// and the households share the report prints is a
// serve-time calculation on the Census base in lsoa_bases.
//
// Access: the Open Data API
// (https://stat-xplore.dwp.gov.uk/webapi/rest/v1) requires
// the K22 key in an APIKey header on every request — no
// guest route exists (a keyless request returns 401,
// proven at the prep). Server rate limit 2,000 requests
// per hour; one run makes a handful. The credential routes
// mirror the EV loader (Key K17's pattern): STATXPLORE_API_KEY
// in the environment on the real server, or the connector
// helper (custom.stat-xplore), which receives the
// vault-held key through the surrogate exchange. Terms:
// OGL; serving attribution "Source: Department for Work
// and Pensions — Universal Credit statistics
// (Stat-Xplore)", the month on every figure.
//
// BUG-195 (streaming conversion): a pull no longer builds
// the whole row set before filing. Each table response is
// iterated cell by cell (iterateTableRows — the parse
// judgement lives there alone; parseTableResponse is its
// collecting form) and handed on in batches of at most
// 5,000 rows: the golden judgement runs as a tally over
// the stream (createUcGoldenTally, composing goldenChecks'
// failures in its own order) and a filing run stages each
// batch into the swap transaction as it lands. The swap
// stays atomic per run, so a failure rolls everything
// back and a re-run files the pull whole. The one
// per-response structure is the duplicate-cell key set —
// the response is the API's unit, and the guard's scope
// is exactly one response, as before.

import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { formatCount } from "./progress.mjs";

const { Pool } = pg;

export const API_BASE = "https://stat-xplore.dwp.gov.uk/webapi/rest/v1";
export const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";

// The two databases, and each series' own source stamp.
// Both count measure ids are confirmed from DWP's own
// schema at the first pull (13 Nov 2026); discovery finds
// each database's count measure in its own tree and asserts
// it against the id recorded here.
export const DATABASES = [
  {
    series: "uc_people",
    database: "str:database:UC_Monthly",
    documentedMeasure: "str:count:UC_Monthly:V_F_UC_CASELOAD_FULL",
    sourceName: "DWP Stat-Xplore — People on Universal Credit",
  },
  {
    series: "uc_households",
    database: "str:database:UC_Households",
    documentedMeasure: "str:count:UC_Households:V_F_UC_HOUSEHOLDS",
    sourceName: "DWP Stat-Xplore — Households on Universal Credit",
  },
];

// The three universal golden homes' LSOAs (2021 codes and
// the names Nomis/Census publish for them). Presence of
// these codes is asserted on every pull from the build
// onwards; Stat-Xplore's own labels are read, not assumed,
// so name equality joins the golden checks only when the
// first pull locks the values.
export const GOLDEN_LSOAS = {
  E01021395: "Braintree 018C",
  E01003511: "Newham 036A",
  E01030396: "Epsom and Ewell 010D",
};

// The UC golden VALUES, locked at the first pull
// (13 Nov 2026) from DWP's real answers: three LSOAs × both
// series, each series' own latest month — people May 2026,
// households April 2026. Stable within a data vintage (see
// the disclosure-control note in the header): a later
// quarterly release may slightly move a locked month, and
// if it does the golden check fails loudly and the values
// are re-locked from the new capture, never edited to fit.
export const GOLDEN_VALUES = {
  uc_people: {
    "2026-05": { E01021395: 117, E01003511: 383, E01030396: 93 },
  },
  uc_households: {
    "2026-04": { E01021395: 105, E01030396: 83 },
  },
};

// The Households gap, measured at the first pull: Newham
// 036A's schema value node EXISTS in UC_Households
// (correctly labelled), but the database's table engine
// holds no such LSOA — a recode naming it is refused with
// RECODE_FIELD_VALUE_NOT_FOUND, while the same code
// answers normally in UC_Monthly. The Households cube
// therefore cannot serve this LSOA: the golden values
// above carry no households figure for it, the golden
// checks never demand its presence for uc_households, and
// the verify pull never selects it for that series. (The
// production pull selects no LSOAs at all — it files every
// area the cube returns — so the gap reaches serving only
// as an absent row, the named not-published state.)
export const HOUSEHOLDS_MISSING_LSOAS = ["E01003511"];

export const FIRST_PULL =
  "DONE 13 Nov 2026: the first keyed pull ran as founder-run browser captures " +
  "(DWP's gateway refuses every Muse-side network — HTTP 401 — while the same key " +
  "answers 200 from the founder's browser; the key was never at fault). It locked " +
  "the UC golden values for the three golden LSOAs (each series' own latest month: " +
  "people 2026-05, households 2026-04), confirmed the 2021-vintage golden codes " +
  "resolve in the geography field, and reconciled the schema assembly, the table " +
  "query grammar and the response parsing in this file against DWP's real answers. " +
  "One gap stands: E01003511 is absent from the Households cube " +
  "(HOUSEHOLDS_MISSING_LSOAS). Still unverified until a keyed call answers from a " +
  "network DWP accepts: the assembled live pull end-to-end, and the national " +
  "Households LSOA count against the filing band.";

// The published E&W LSOA count is 35,672; the band is the
// filing gate for a full month, as in the claimant loader.
export const LSOA_COUNT_BAND = { min: 35000, max: 36500 };
// Months of history the table keeps per series (the
// design's retention; pruning is enforced at filing).
export const RETAINED_MONTHS = 13;
// On a quarterly step the loader re-files the newest three
// monthly points (revisions land there); older filed
// months stand as published.
export const REFILE_MONTHS = 3;

// --- schema discovery -----------------------------------------
//
// The /schema/<database> tree is walked for the three
// things a table query needs: the count measure, the date
// field (whose items are the monthly points) and the
// residence geography field (whose items carry the LSOA
// codes). The API serves the schema ONE LEVEL at a time
// (measured at the first pull), so nothing hands this
// function a raw response: fetchDiscovery (below) assembles
// the tree node by node — database → date field → its
// valueset, database → geography group → COA field → its
// LSOA valueset — and completes the month list past the
// valueset response cap before discovery walks it.

const LSOA_IN_ID = /[EW]01\d{6}/;
const MONTH_IN_TEXT = /(\d{4})-(\d{2})/;
const MONTH_NAMES = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

export function monthFromText(text) {
  if (!text) return null;
  const iso = MONTH_IN_TEXT.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const named = /([A-Za-z]+)\s+(\d{4})/.exec(text);
  if (named && MONTH_NAMES[named[1].toLowerCase()])
    return `${named[2]}-${MONTH_NAMES[named[1].toLowerCase()]}`;
  return null;
}

function* walk(node) {
  if (!node || typeof node !== "object") return;
  yield node;
  for (const child of node.children ?? []) yield* walk(child);
  for (const item of node.items ?? []) yield* walk(item);
}

export function discoverSchema(schemaJson, databaseEntry) {
  const nodes = [...walk(schemaJson)];
  const measures = nodes.filter((n) => typeof n.id === "string" && n.id.startsWith("str:count:"));
  if (measures.length !== 1)
    throw new Error(
      `${databaseEntry.database}: the schema tree holds ${measures.length} count measures — expected exactly one (the shape changed)`,
    );
  const measure = measures[0].id;
  if (databaseEntry.documentedMeasure && measure !== databaseEntry.documentedMeasure)
    throw new Error(
      `${databaseEntry.database}: the discovered measure is ${measure} — the documented caseload measure is ${databaseEntry.documentedMeasure} (the shape changed)`,
    );
  // Fields: a date field carries month items; the geography
  // field carries LSOA-coded items.
  let dateField = null;
  let geographyField = null;
  for (const node of nodes) {
    if (typeof node.id !== "string" || !node.id.startsWith("str:field:")) continue;
    const descendants = [...walk(node)];
    const months = new Map();
    const geographies = new Map();
    for (const d of descendants) {
      if (typeof d.id !== "string") continue;
      const month = monthFromText(d.id) ?? monthFromText(d.label);
      if (month && d !== node) months.set(month, d.id);
      const lsoa = LSOA_IN_ID.exec(d.id);
      if (lsoa) geographies.set(lsoa[0], { itemId: d.id, label: d.label ?? null });
    }
    if (months.size > 0 && geographies.size === 0) {
      if (dateField)
        throw new Error(`${databaseEntry.database}: two date-like fields — ambiguous schema`);
      dateField = { id: node.id, months };
    }
    if (geographies.size > 0) {
      if (geographyField)
        throw new Error(`${databaseEntry.database}: two geography-like fields — ambiguous schema`);
      geographyField = { id: node.id, geographies };
    }
  }
  if (!dateField)
    throw new Error(
      `${databaseEntry.database}: no field with month items found in the schema tree`,
    );
  if (!geographyField)
    throw new Error(`${databaseEntry.database}: no field with LSOA items found in the schema tree`);
  return {
    measure,
    dateFieldId: dateField.id,
    geographyFieldId: geographyField.id,
    months: [...dateField.months.entries()]
      .map(([month, itemId]) => ({ month, itemId }))
      .sort((a, b) => (a.month < b.month ? -1 : 1)),
    geographies: geographyField.geographies,
  };
}

// --- schema assembly ------------------------------------------
//
// The API serves the schema one level at a time: a node's
// response lists its children as stubs (id / label /
// location / type, no grandchildren). fetchDiscovery walks
// the levels the queries need and stitches the fetched
// nodes into the single tree discoverSchema walks:
//
//   database node
//   ├─ date field node → its (single) valueset node
//   └─ "Geography (residence-based)" group node
//      └─ each field node → the LSOA valueset node, where
//         the field carries one (the COA field does)
//
// Everything else stays a listing stub — discovery only
// reads ids and labels there, and a stub carries both.
// The fetch routes are injected so the fixture captures
// drive this exact code in tests and in the runner's
// fixture pass: fetchNode(id) returns a node or throws;
// probeMonth("YYYY-MM") answers whether that month value
// exists (the live default probes the value's own schema
// address — a documented single-value GET, 200-verified
// at the first pull — and reads a 404 as "not published").

// Value ids are compositional (measured at the first
// pull): a valueset's values live under the same id with
// "str:valueset:" swapped for "str:value:", plus a suffix —
// ":YYYYMM" for a month, ":<LSOA code>" for an area.
const valueIdPrefix = (valuesetId) => valuesetId.replace(/^str:valueset:/, "str:value:");
export const monthItemId = (dateValuesetId, month) =>
  `${valueIdPrefix(dateValuesetId)}:${month.replace("-", "")}`;
export const lsoaItemId = (lsoaValuesetId, code) => `${valueIdPrefix(lsoaValuesetId)}:${code}`;

const MONTH_LABELS = Object.fromEntries(
  Object.entries(MONTH_NAMES).map(([name, num]) => [num, name[0].toUpperCase() + name.slice(1)]),
);
export const monthLabel = (month) => `${MONTH_LABELS[month.slice(5, 7)]} ${month.slice(0, 4)}`;

export function addMonths(month, count) {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + count;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
export const monthsBetween = (from, to) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
  (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));

async function assembleGeographyGroup(groupStub, fetchNode) {
  const groupNode = await fetchNode(groupStub.id);
  const fields = [];
  let lsoaAttached = false;
  for (const fieldStub of groupNode.children ?? []) {
    if (fieldStub.type !== "FIELD" || lsoaAttached) {
      fields.push(fieldStub);
      continue;
    }
    const fieldNode = await fetchNode(fieldStub.id);
    const lsoaStub = (fieldNode.children ?? []).find(
      (c) => c.type === "VALUESET" && c.id.endsWith("LSOA_TO_MSOA"),
    );
    if (!lsoaStub) {
      fields.push(fieldNode);
      continue;
    }
    const lsoaValuesetNode = await fetchNode(lsoaStub.id);
    fields.push({ ...fieldNode, children: [lsoaValuesetNode] });
    lsoaAttached = true;
  }
  return { ...groupNode, children: fields };
}

export async function assembleSchemaTree(databaseEntry, fetchNode) {
  const databaseNode = await fetchNode(databaseEntry.database);
  if (!databaseNode || databaseNode.id !== databaseEntry.database)
    throw new Error(
      `${databaseEntry.database}: the schema response is not that database's node (got ${databaseNode?.id ?? "nothing"})`,
    );
  let dateValuesetNode = null;
  const children = [];
  for (const child of databaseNode.children ?? []) {
    if (child.type === "FIELD" && !dateValuesetNode) {
      const fieldNode = await fetchNode(child.id);
      const valuesetStub = (fieldNode.children ?? []).find((c) => c.type === "VALUESET");
      if (valuesetStub) {
        const valuesetNode = await fetchNode(valuesetStub.id);
        const carriesMonths = (valuesetNode.children ?? []).some(
          (v) => monthFromText(v.label) ?? monthFromText(v.id),
        );
        if (carriesMonths) {
          dateValuesetNode = valuesetNode;
          children.push({ ...fieldNode, children: [valuesetNode] });
          continue;
        }
      }
      children.push(child);
      continue;
    }
    if (child.type === "GROUP" && /residence/i.test(child.label ?? "")) {
      children.push(await assembleGeographyGroup(child, fetchNode));
      continue;
    }
    children.push(child);
  }
  if (!dateValuesetNode)
    throw new Error(
      `${databaseEntry.database}: no top-level field's valueset carries month values — the schema shape changed`,
    );
  return { tree: { ...databaseNode, children }, dateValuesetNode };
}

// A valueset response is capped at 100 child values
// (DWP's Schema help: pagination is offered through a Link
// response header — a mechanism neither of this loader's
// access routes surfaces, and whose URL form the help does
// not document, so it is NOT the route used here). The date
// valueset's first 100 values end years before the latest
// month, so the list is completed by probing: single-value
// schema GETs are documented and were 200-verified at the
// first pull. The search strides six months at a time to a
// first miss, then binary-searches the bracket — the whole
// search is bounded at MAX_MONTH_PROBES probes. UC months
// are a continuous monthly series (the returned slice is
// contiguous, May 2013 onwards), so once the latest month
// is bracketed, every month in between is constructed
// compositionally; if one were ever missing at DWP, its
// table recode would fail loudly at pull time.
export const MAX_MONTH_PROBES = 30;

export async function extendMonthList(dateValuesetNode, probeMonth) {
  const present = (dateValuesetNode.children ?? [])
    .map((v) => monthFromText(v.label) ?? monthFromText(v.id))
    .filter(Boolean)
    .sort();
  if (present.length === 0)
    throw new Error("the date valueset carries no month values — the schema shape changed");
  const sliceLast = present.at(-1);
  let probes = 0;
  const probe = async (month) => {
    probes += 1;
    if (probes > MAX_MONTH_PROBES)
      throw new Error(
        `month probing exceeded ${MAX_MONTH_PROBES} probes past ${sliceLast} — refusing to guess the latest month`,
      );
    return probeMonth(month);
  };
  let lastPresent = sliceLast;
  let firstMissing = null;
  for (let step = 6; ; step += 6) {
    const candidate = addMonths(sliceLast, step);
    if (await probe(candidate)) {
      lastPresent = candidate;
      continue;
    }
    firstMissing = candidate;
    break;
  }
  while (monthsBetween(lastPresent, firstMissing) > 1) {
    const mid = addMonths(lastPresent, Math.floor(monthsBetween(lastPresent, firstMissing) / 2));
    if (await probe(mid)) lastPresent = mid;
    else firstMissing = mid;
  }
  const known = new Set((dateValuesetNode.children ?? []).map((v) => v.id));
  const additions = [];
  for (let m = addMonths(sliceLast, 1); m <= lastPresent; m = addMonths(m, 1)) {
    const id = monthItemId(dateValuesetNode.id, m);
    if (!known.has(id)) additions.push({ id, label: monthLabel(m), type: "VALUE" });
  }
  dateValuesetNode.children = [...(dateValuesetNode.children ?? []), ...additions];
  return lastPresent;
}

// Assemble the tree, complete the month list, then run the
// proven discovery walk over the result. The live default
// probe composes each candidate month's value address from
// the assembled valueset id and reads a 404 as "not
// published" (any other failure — a 401 included — throws).
export async function fetchDiscovery(databaseEntry, routes = {}) {
  const fetchNode = routes.fetchNode ?? ((id) => callStatXplore("schema", id));
  const { tree, dateValuesetNode } = await assembleSchemaTree(databaseEntry, fetchNode);
  const probeMonth =
    routes.probeMonth ??
    (async (month) =>
      (await fetchSchemaNodeOrNull(monthItemId(dateValuesetNode.id, month))) !== null);
  await extendMonthList(dateValuesetNode, probeMonth);
  return discoverSchema(tree, databaseEntry);
}

// One LSOA's item id in a query: the discovered item when
// the fetched valueset slice holds the code, otherwise the
// compositional construction (the slice is capped at 100
// values; the construction is the measured grammar — the
// golden codes themselves sit past the slice and resolve
// exactly this way, proven by the first pull's captures).
export function resolveLsoaItemId(discovery, code, databaseEntry) {
  const found = discovery.geographies.get(code);
  if (found) return found.itemId;
  const sample = discovery.geographies.values().next().value;
  if (!sample)
    throw new Error(
      `${databaseEntry.database}: the geography field holds no LSOA items to construct item ids from`,
    );
  return sample.itemId.replace(/:[EW]01\d{6}$/, `:${code}`);
}

// Which months a run files: every month newer than the
// latest filed, plus the newest REFILE_MONTHS (revisions),
// never reaching back past the newest RETAINED_MONTHS of
// the published series. A run that finds no new month
// files only the re-file window — the healthy quarterly
// no-op the design describes.
export function monthsToFile(publishedMonths, latestFiledMonth) {
  const sorted = [...publishedMonths].sort();
  const retained = new Set(sorted.slice(-RETAINED_MONTHS));
  const refile = new Set(sorted.slice(-REFILE_MONTHS));
  return sorted.filter(
    (m) => retained.has(m) && (refile.has(m) || !latestFiledMonth || m > latestFiledMonth),
  );
}

// --- the table query and its response ---------------------------
//
// The real grammar (DWP's Table help page, proven against
// the first pull's captures — NOT the {id, items} dimension
// objects an earlier build assumed): item selection lives
// ONLY in "recodes" — a per-field "map" of one-element
// arrays, one per value to return — and "dimensions" is an
// array of field-id arrays, one array per axis. Production
// recodes the date field only: the geography axis is left
// unrecoded, so the response carries every area the cube
// holds. The verify pull recodes both fields, down to the
// golden areas.

export function buildTableQuery(discovery, databaseEntry, { months, lsoaCodes }) {
  const recodes = {
    [discovery.dateFieldId]: {
      map: months.map((m) => {
        const found = discovery.months.find((x) => x.month === m);
        if (!found)
          throw new Error(
            `${databaseEntry.database}: month ${m} is not in the schema's month list`,
          );
        return [found.itemId];
      }),
    },
  };
  if (lsoaCodes) {
    recodes[discovery.geographyFieldId] = {
      map: lsoaCodes.map((code) => [resolveLsoaItemId(discovery, code, databaseEntry)]),
    };
  }
  return {
    database: databaseEntry.database,
    measures: [discovery.measure],
    recodes,
    dimensions: [[discovery.dateFieldId], [discovery.geographyFieldId]],
  };
}

// Parse one /table response into filing rows for its
// series. The real response shape (first pull's captures):
// "fields" — one entry per dimension, in dimension order,
// each {uri, items: [{uris: [one value id], labels:
// [label]}]} — and "cubes", keyed by measure uri, whose
// "values" are rows over the FIRST field's items and
// columns over the SECOND's. Fields are resolved by uri
// against the discovery, a month reads from its value id's
// :YYYYMM suffix, an area from its value id's LSOA code.
// Anything outside this shape fails loudly — a failed parse
// files nothing.
// The streaming form (BUG-195): the same validation and
// cell judgement, yielding one filing row per cube cell as
// it is read — a response is never first built into a
// whole rows array by the filing path. The duplicate-cell
// guard's key set lives for exactly one response, the
// unit the API answers in.
export function* iterateTableRows(json, databaseEntry, discovery) {
  if (
    !json ||
    !Array.isArray(json.fields) ||
    json.fields.length !== 2 ||
    typeof json.cubes !== "object" ||
    json.cubes === null
  )
    throw new Error(
      `${databaseEntry.database}: the table response is not the real {fields, cubes} shape — do not file`,
    );
  const cube = json.cubes[discovery.measure];
  if (!cube || !Array.isArray(cube.values))
    throw new Error(
      `${databaseEntry.database}: the response holds no cube for the discovered measure ${discovery.measure} — do not file`,
    );
  const resolved = json.fields.map((field) => {
    if (field.uri === discovery.dateFieldId) return { kind: "date", field };
    if (field.uri === discovery.geographyFieldId) return { kind: "geo", field };
    throw new Error(
      `${databaseEntry.database}: the response field ${field.uri} is neither the discovered date field nor the discovered geography field — do not file`,
    );
  });
  const itemsOf = (field, kind) =>
    (field.items ?? []).map((item) => {
      const uris = item.uris ?? [];
      if (uris.length !== 1)
        throw new Error(
          `${databaseEntry.database}: a ${kind} item carries ${uris.length} value ids — combined recode groups are never requested, so the shape changed`,
        );
      return { uri: uris[0], label: item.labels?.[0] ?? null };
    });
  const monthOf = (item) => {
    const suffix = /:(\d{4})(\d{2})$/.exec(item.uri);
    if (!suffix)
      throw new Error(
        `${databaseEntry.database}: the date item ${item.uri} does not end in a YYYYMM month`,
      );
    const month = `${suffix[1]}-${suffix[2]}`;
    const labelled = monthFromText(item.label);
    if (labelled && labelled !== month)
      throw new Error(
        `${databaseEntry.database}: the date item ${item.uri} is labelled "${item.label}" — id and label disagree on the month`,
      );
    return month;
  };
  const geoOf = (item) => {
    const code = LSOA_IN_ID.exec(item.uri)?.[0] ?? null;
    if (!code)
      throw new Error(
        `${databaseEntry.database}: the geography item ${item.uri} carries no LSOA code — only LSOA-level areas file`,
      );
    return { code, label: item.label };
  };
  const axes = resolved.map(({ kind, field }) =>
    itemsOf(field, kind).map((item) => (kind === "date" ? { month: monthOf(item) } : geoOf(item))),
  );
  if (resolved.filter((r) => r.kind === "date").length !== 1)
    throw new Error(
      `${databaseEntry.database}: the response fields do not resolve to exactly one date field and one geography field — do not file`,
    );
  const [rowAxis, colAxis] = axes;
  const rowIsDate = resolved[0].kind === "date";
  if (cube.values.length !== rowAxis.length)
    throw new Error(
      `${databaseEntry.database}: the cube holds ${cube.values.length} rows for ${rowAxis.length} first-field items — the shape changed`,
    );
  const seen = new Set();
  for (let i = 0; i < cube.values.length; i++) {
    const line = cube.values[i];
    if (!Array.isArray(line) || line.length !== colAxis.length)
      throw new Error(
        `${databaseEntry.database}: cube row ${i} holds ${Array.isArray(line) ? line.length : "a non-array"} values for ${colAxis.length} second-field items — the shape changed`,
      );
    for (let j = 0; j < line.length; j++) {
      const value = line[j];
      const month = rowIsDate ? rowAxis[i].month : colAxis[j].month;
      const geo = rowIsDate ? colAxis[j] : rowAxis[i];
      if (!Number.isInteger(value) || value < 0)
        throw new Error(
          `${databaseEntry.database}: the cell for ${geo.code} (${month}) is ${JSON.stringify(value)} — not a published non-negative integer count`,
        );
      const key = `${geo.code}|${month}`;
      if (seen.has(key))
        throw new Error(
          `${databaseEntry.database}: ${geo.code} (${month}) arrived twice in one response`,
        );
      seen.add(key);
      yield {
        lsoaCode: geo.code,
        lsoaName: geo.label ?? GOLDEN_LSOAS[geo.code] ?? geo.code,
        series: databaseEntry.series,
        sourceName: databaseEntry.sourceName,
        month,
        count: value,
      };
    }
  }
}

// The collecting form over the iterated parse: the whole
// response's rows, sorted by month then LSOA — the shape
// this step was built with, kept for small inputs and
// tests. The filing run streams.
export function parseTableResponse(json, databaseEntry, discovery) {
  const rows = [...iterateTableRows(json, databaseEntry, discovery)];
  return rows.sort((a, b) =>
    a.month === b.month ? (a.lsoaCode < b.lsoaCode ? -1 : 1) : a.month < b.month ? -1 : 1,
  );
}

export function goldenChecks(rows, { full }) {
  const failures = [];
  for (const row of rows) {
    if (!Number.isInteger(row.count) || row.count < 0)
      failures.push(
        `${row.lsoaCode} (${row.series}, ${row.month}): count ${row.count} is not a non-negative integer`,
      );
  }
  const pairs = new Set(rows.map((r) => `${r.series}|${r.month}`));
  for (const pair of pairs) {
    const [series, month] = pair.split("|");
    const inPair = rows.filter((r) => r.series === series && r.month === month);
    for (const code of Object.keys(GOLDEN_LSOAS)) {
      // The Households cube does not hold every golden
      // LSOA (HOUSEHOLDS_MISSING_LSOAS) — its absence there
      // is the measured gap, never a check failure.
      if (series === "uc_households" && HOUSEHOLDS_MISSING_LSOAS.includes(code)) continue;
      if (!inPair.some((r) => r.lsoaCode === code))
        failures.push(`${code} is missing from the ${series} rows for ${month}`);
    }
    if (full && (inPair.length < LSOA_COUNT_BAND.min || inPair.length > LSOA_COUNT_BAND.max))
      failures.push(
        `the ${series} pull for ${month} holds ${inPair.length} LSOAs — outside the ${LSOA_COUNT_BAND.min}–${LSOA_COUNT_BAND.max} band around the published 35,672`,
      );
  }
  // Exact-value goldens, locked at the first pull
  // (GOLDEN_VALUES). A locked month a later quarterly
  // release re-publishes with slightly moved values (the
  // Introduced Random Error vintage changes) fails here
  // loudly, and the values are re-locked from the new
  // capture — never edited to fit.
  if (GOLDEN_VALUES) {
    for (const row of rows) {
      const expected = GOLDEN_VALUES[row.series]?.[row.month]?.[row.lsoaCode];
      if (expected !== undefined && row.count !== expected)
        failures.push(
          `${row.lsoaCode} (${row.series}, ${row.month}): count is ${row.count}, expected the golden ${expected} locked at the first pull (13 Nov 2026)`,
        );
    }
  }
  return failures;
}

// The golden checks' streaming form (BUG-195): the three
// failure classes accumulate separately as rows stream
// past — per-row integer failures and locked-value
// failures in arrival order, per-pair presence and counts
// keyed by series-month in first-appearance order — and
// failures() concatenates them in goldenChecks' own
// order, with the same strings. The filing run feeds the
// tally in pull order (series by series, response by
// response), the order loadUcRows concatenates in, so the
// composed failures match the collecting form's.
export function createUcGoldenTally() {
  const integerFailures = [];
  const valueFailures = [];
  const pairs = new Map();
  return {
    offer(row) {
      if (!Number.isInteger(row.count) || row.count < 0)
        integerFailures.push(
          `${row.lsoaCode} (${row.series}, ${row.month}): count ${row.count} is not a non-negative integer`,
        );
      const key = `${row.series}|${row.month}`;
      let pair = pairs.get(key);
      if (!pair) {
        pair = { series: row.series, month: row.month, count: 0, present: new Set() };
        pairs.set(key, pair);
      }
      pair.count += 1;
      if (Object.hasOwn(GOLDEN_LSOAS, row.lsoaCode)) pair.present.add(row.lsoaCode);
      if (GOLDEN_VALUES) {
        const expected = GOLDEN_VALUES[row.series]?.[row.month]?.[row.lsoaCode];
        if (expected !== undefined && row.count !== expected)
          valueFailures.push(
            `${row.lsoaCode} (${row.series}, ${row.month}): count is ${row.count}, expected the golden ${expected} locked at the first pull (13 Nov 2026)`,
          );
      }
    },
    failures({ full }) {
      const failures = [...integerFailures];
      for (const pair of pairs.values()) {
        for (const code of Object.keys(GOLDEN_LSOAS)) {
          // The Households cube does not hold every golden
          // LSOA (HOUSEHOLDS_MISSING_LSOAS) — its absence there
          // is the measured gap, never a check failure.
          if (pair.series === "uc_households" && HOUSEHOLDS_MISSING_LSOAS.includes(code)) continue;
          if (!pair.present.has(code))
            failures.push(`${code} is missing from the ${pair.series} rows for ${pair.month}`);
        }
        if (full && (pair.count < LSOA_COUNT_BAND.min || pair.count > LSOA_COUNT_BAND.max))
          failures.push(
            `the ${pair.series} pull for ${pair.month} holds ${pair.count} LSOAs — outside the ${LSOA_COUNT_BAND.min}–${LSOA_COUNT_BAND.max} band around the published 35,672`,
          );
      }
      failures.push(...valueFailures);
      return failures;
    },
  };
}

// --- filing -----------------------------------------------------
//
// Per series-month stage-and-swap inside one transaction —
// the house pattern (BEGIN before the ON COMMIT DROP stage
// create; column names are migration 0013's own, pinned by
// the schema-contract tests). pct is filed NULL for UC —
// DWP publishes no LSOA percentage — and the prune keeps
// each series' newest 13 months (the series' clocks
// differ, so pruning is per series).
//
// The streaming form (BUG-195): createUcFiler opens the
// transaction and the stage, stageRows buffers rows into
// the same 500-row inserts and accumulates the
// series-month pair set as they pass, and finishFiling
// runs the per-pair swaps and the prunes. The swap stays
// atomic per run — a failure anywhere rolls the whole
// filing back and a re-run files it whole.

export async function createUcFiler(pool, retrievedAt) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TEMP TABLE uc_stage (
      lsoa_code text, lsoa_name text, series text, reference_month date,
      count integer, source_name text
    ) ON COMMIT DROP`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    throw err;
  }
  const values = [];
  const params = [];
  const pairsSeen = new Set();
  const flush = async () => {
    if (values.length === 0) return;
    await client.query(
      `INSERT INTO uc_stage (lsoa_code, lsoa_name, series, reference_month, count, source_name) VALUES ${values.join(", ")}`,
      params,
    );
    values.length = 0;
    params.length = 0;
  };
  return {
    async stageRows(rows) {
      for (const row of rows) {
        pairsSeen.add(`${row.series}|${row.month}`);
        const base = params.length;
        values.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
        );
        params.push(
          row.lsoaCode,
          row.lsoaName,
          row.series,
          `${row.month}-01`,
          row.count,
          row.sourceName,
        );
        if (values.length >= 500) await flush();
      }
    },
    async finishFiling() {
      await flush();
      const pairs = [...pairsSeen].sort();
      for (const pair of pairs) {
        const [series, month] = pair.split("|");
        await client.query(
          `DELETE FROM benefits_stats WHERE series = $1 AND reference_month = $2`,
          [series, `${month}-01`],
        );
        await client.query(
          `INSERT INTO benefits_stats (lsoa_code, series, reference_month, lsoa_name, count, pct, source_name, source_date, loaded_at)
           SELECT lsoa_code, series, reference_month, lsoa_name, count, NULL, source_name, reference_month, $2
           FROM uc_stage WHERE series = $1 AND reference_month = $3`,
          [series, retrievedAt, `${month}-01`],
        );
      }
      for (const { series } of DATABASES) {
        await client.query(
          `DELETE FROM benefits_stats
           WHERE series = $1
             AND reference_month NOT IN (
               SELECT DISTINCT reference_month FROM benefits_stats
               WHERE series = $1 ORDER BY reference_month DESC LIMIT 13
             )`,
          [series],
        );
      }
      await client.query("COMMIT");
      client.release();
    },
    async abortFiling() {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    },
  };
}

// The collecting form over the streaming filer: the whole
// row set staged, then the swaps — the shape this step was
// built with, kept for small inputs and tests. On any
// failure the transaction rolls back and the client is
// released, exactly as the one-shot filer did.
export async function fileUc(pool, rows, retrievedAt) {
  const filer = await createUcFiler(pool, retrievedAt);
  try {
    await filer.stageRows(rows);
    await filer.finishFiling();
  } catch (err) {
    await filer.abortFiling();
    throw err;
  }
}

// --- API access ---------------------------------------------------
//
// Two routes to the same call (the EV loader's pattern):
// the env key directly, or the connector helper, which
// receives the vault-held key through the surrogate
// exchange. The helper's stdout can be megabytes, so it is
// captured to a temp file, never a pipe buffer.

export function helperPath() {
  return (
    process.env.STATXPLORE_HELPER_PATH ??
    join(homedir(), "workspace/custom-connectors/custom.stat-xplore/bin/statxplore.py")
  );
}

function callStatXploreViaHelper(command, arg, bodyJson) {
  return new Promise((resolve, reject) => {
    const workDir = mkdtempSync(join(tmpdir(), "cmnh-statxplore-"));
    const outPath = join(workDir, "response.json");
    const out = createWriteStream(outPath);
    const child = spawn("python3", [helperPath(), command, ...(arg ? [arg] : [])]);
    const timer = setTimeout(() => child.kill("SIGKILL"), 600_000);
    child.stdout.pipe(out);
    let stderr = "";
    child.stderr.on("data", (c) => {
      stderr = (stderr + c).slice(-2000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      rmSync(workDir, { recursive: true, force: true });
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      out.end(() => {
        try {
          if (code !== 0)
            return reject(new Error(`Stat-Xplore helper failed (${code}): ${stderr.slice(-400)}`));
          resolve(JSON.parse(readFileSync(outPath, "utf8")));
        } catch (err) {
          reject(new Error(`Stat-Xplore helper returned unparseable JSON: ${err.message}`));
        } finally {
          rmSync(workDir, { recursive: true, force: true });
        }
      });
    });
    if (bodyJson) {
      child.stdin.write(bodyJson);
      child.stdin.end();
    }
  });
}

async function callStatXploreDirect(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      APIKey: process.env.STATXPLORE_API_KEY,
    },
    body,
  });
  if (!response.ok)
    throw new Error(
      `Stat-Xplore ${path} returned HTTP ${response.status} — with the key sent as the APIKey header (a 401 from a Muse-side network is the known DWP refusal: the same key answers 200 from the founder's browser)`,
    );
  return response.json();
}

export async function callStatXplore(command, arg, bodyObject) {
  const attempt = () => {
    if (process.env.STATXPLORE_API_KEY) {
      if (command === "schema")
        return callStatXploreDirect(`/schema${arg ? `/${encodeURIComponent(arg)}` : ""}`);
      return callStatXploreDirect("/table", {
        method: "POST",
        body: JSON.stringify(bodyObject),
      });
    }
    if (!existsSync(helperPath()))
      throw new Error(
        "no Stat-Xplore credential route: STATXPLORE_API_KEY is not set and the connector helper was not found (Key K22 lives in the Secure Vault — see .env.example)",
      );
    return callStatXploreViaHelper(command, arg, bodyObject ? JSON.stringify(bodyObject) : null);
  };
  try {
    return await attempt();
  } catch {
    await new Promise((r) => setTimeout(r, 3000));
    return attempt();
  }
}

// One schema node, or null when DWP answers 404 — the
// month-probing route (a value that does not exist yet is
// a normal answer there, not a failure). Both credential
// routes carry the status in their error text (the direct
// route's "returned HTTP 404"; the helper's stderr relay),
// so the status is read back from the message; any other
// failure — a 401 included — rethrows.
export async function fetchSchemaNodeOrNull(id) {
  try {
    return await callStatXplore("schema", id);
  } catch (err) {
    if (/HTTP 404/.test(err.message)) return null;
    throw err;
  }
}

// --- pulls --------------------------------------------------------

// One series' filing rows for the given months. With
// lsoaCodes set (the verify pull) the query is restricted
// to those areas.
export async function pullUcSeries(databaseEntry, { months, lsoaCodes, discovery }) {
  const disc = discovery ?? (await fetchDiscovery(databaseEntry));
  const query = buildTableQuery(disc, databaseEntry, { months, lsoaCodes });
  const json = await callStatXplore("table", null, query);
  return { rows: parseTableResponse(json, databaseEntry, disc), discovery: disc };
}

// The fixture routes: the first pull's real schema
// captures, filed under the fixture dir's schema/ folder
// as one JSON per node (database, date field, date
// valueset, geography group, COA field, LSOA valueset).
// fetchNode serves exactly those nodes; probeMonth answers
// from the captured table response's own month list (what
// DWP had published for the series at capture time). The
// runner's fixture pass and the tests therefore drive the
// same assembly, probing and discovery code as a live pull.
const FIXTURE_SCHEMA_FILES = [
  "database",
  "date-field",
  "date-valueset",
  "geography-group",
  "coa-field",
  "lsoa-valueset",
];

export function fixtureRoutes(dir, databaseEntry, tableJson) {
  const stem = databaseEntry.database.replace("str:database:", "").toLowerCase().replace("_", "-");
  const byId = new Map();
  for (const role of FIXTURE_SCHEMA_FILES) {
    const node = JSON.parse(readFileSync(join(dir, "schema", `${stem}-${role}.json`), "utf8"));
    byId.set(node.id, node);
  }
  const publishedMonths = (tableJson.fields ?? [])
    .flatMap((f) => f.items ?? [])
    .map((item) => /:(\d{4})(\d{2})$/.exec(item.uris?.[0] ?? ""))
    .filter(Boolean)
    .map((m) => `${m[1]}-${m[2]}`);
  const latestCaptured = publishedMonths.sort().at(-1);
  return {
    fetchNode: async (id) => {
      const node = byId.get(id);
      if (!node) throw new Error(`HTTP 404 — the fixture holds no schema node for ${id}`);
      return structuredClone(node);
    },
    probeMonth: async (month) => month <= latestCaptured,
  };
}

export async function loadUcRows(source, { latestFiledBySeries = {} } = {}) {
  if (source.kind === "dir") {
    const rows = [];
    for (const entry of DATABASES) {
      const file = join(source.dir, `${entry.series.replace("_", "-")}-table.json`);
      if (!existsSync(file))
        throw new Error(`${file} is missing — the fixture holds one response per UC series`);
      const tableJson = JSON.parse(readFileSync(file, "utf8"));
      const discovery = await fetchDiscovery(entry, fixtureRoutes(source.dir, entry, tableJson));
      rows.push(...parseTableResponse(tableJson, entry, discovery));
    }
    return { rows };
  }
  const rows = [];
  for (const entry of DATABASES) {
    const discovery = await fetchDiscovery(entry);
    const months = monthsToFile(
      discovery.months.map((m) => m.month),
      latestFiledBySeries[entry.series] ?? null,
    );
    if (source.codes) {
      const latest = discovery.months.at(-1).month;
      // The verify pull selects the golden areas — except
      // the ones the series' cube does not hold (the
      // Households gap): selecting one would fail the
      // whole query at DWP, and its absence is checked
      // for, not queried for.
      const wanted = source.codes.filter(
        (code) => !(entry.series === "uc_households" && HOUSEHOLDS_MISSING_LSOAS.includes(code)),
      );
      const { rows: goldenRows } = await pullUcSeries(entry, {
        months: [latest],
        lsoaCodes: wanted,
        discovery,
      });
      rows.push(...goldenRows);
      continue;
    }
    if (months.length === 0) continue;
    const { rows: seriesRows } = await pullUcSeries(entry, { months, discovery });
    rows.push(...seriesRows);
  }
  return { rows };
}

// The streaming form of the pull (BUG-195): the same
// branches as loadUcRows — fixture dir, verify pull,
// months-to-file pull — but each response's rows are
// iterated cell by cell and handed to onRows in bounded
// batches of at most 5,000, so no whole-pull row set is
// ever built. Rows arrive in cube order within a response
// (the collecting form sorts each response's rows; the
// golden tally and the filer are order-insensitive in
// what they assert and file, and the summary counts from
// the same stream).
export async function streamUcRows(source, { latestFiledBySeries = {} } = {}, onRows) {
  let pending = [];
  const flush = async () => {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    await onRows(batch);
  };
  const drain = async (json, entry, discovery) => {
    for (const row of iterateTableRows(json, entry, discovery)) {
      pending.push(row);
      if (pending.length >= 5000) await flush();
    }
  };
  if (source.kind === "dir") {
    for (const entry of DATABASES) {
      const file = join(source.dir, `${entry.series.replace("_", "-")}-table.json`);
      if (!existsSync(file))
        throw new Error(`${file} is missing — the fixture holds one response per UC series`);
      const tableJson = JSON.parse(readFileSync(file, "utf8"));
      const discovery = await fetchDiscovery(entry, fixtureRoutes(source.dir, entry, tableJson));
      await drain(tableJson, entry, discovery);
    }
    await flush();
    return;
  }
  for (const entry of DATABASES) {
    const discovery = await fetchDiscovery(entry);
    const months = monthsToFile(
      discovery.months.map((m) => m.month),
      latestFiledBySeries[entry.series] ?? null,
    );
    if (source.codes) {
      const latest = discovery.months.at(-1).month;
      // The verify pull selects the golden areas — except
      // the ones the series' cube does not hold (the
      // Households gap): selecting one would fail the
      // whole query at DWP, and its absence is checked
      // for, not queried for.
      const wanted = source.codes.filter(
        (code) => !(entry.series === "uc_households" && HOUSEHOLDS_MISSING_LSOAS.includes(code)),
      );
      const json = await callStatXplore(
        "table",
        null,
        buildTableQuery(discovery, entry, { months: [latest], lsoaCodes: wanted }),
      );
      await drain(json, entry, discovery);
      continue;
    }
    if (months.length === 0) continue;
    const json = await callStatXplore("table", null, buildTableQuery(discovery, entry, { months }));
    await drain(json, entry, discovery);
  }
  await flush();
}

// The summary line's streaming form: per-series counts and
// month sets accumulated from the same batches the tally
// and the filer consume, composed by summaryLineFromStats
// into the identical line summaryLine builds from rows.
export function createRunStats() {
  const bySeries = new Map(
    DATABASES.map(({ series }) => [series, { count: 0, months: new Set() }]),
  );
  return {
    addRows(rows) {
      for (const row of rows) {
        const stats = bySeries.get(row.series);
        if (!stats) continue;
        stats.count += 1;
        stats.months.add(row.month);
      }
    },
    summary(filed) {
      const bits = DATABASES.map(({ series }) => {
        const stats = bySeries.get(series);
        const months = [...stats.months].sort();
        return `${series}: ${formatCount(stats.count)} areas for ${months.join(", ") || "no new month"}`;
      });
      return `load-dwp-uc · Universal Credit (people + households, as published by DWP) · ${bits.join(" · ")} · ${filed ? "filed" : "would file"}`;
    },
  };
}

function summaryLine(rows, filed) {
  const bits = DATABASES.map(({ series }) => {
    const inSeries = rows.filter((r) => r.series === series);
    const months = [...new Set(inSeries.map((r) => r.month))].sort();
    return `${series}: ${formatCount(inSeries.length)} areas for ${months.join(", ") || "no new month"}`;
  });
  return `load-dwp-uc · Universal Credit (people + households, as published by DWP) · ${bits.join(" · ")} · ${filed ? "filed" : "would file"}`;
}

const DEFAULT_FIXTURE_DIR = fileURLToPath(new URL("../../tests/fixtures/dwp-uc/", import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const fixtureMode = fileArg !== null;
  const verifyOnly = args.includes("--verify-only");
  const source = fixtureMode
    ? { kind: "dir", dir: fileArg ?? DEFAULT_FIXTURE_DIR }
    : verifyOnly
      ? { kind: "live", codes: Object.keys(GOLDEN_LSOAS) }
      : { kind: "live" };
  let latestFiledBySeries = {};
  let pool = null;
  if (source.kind === "live" && !verifyOnly) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const res = await pool.query(
      `SELECT series, max(reference_month) AS latest FROM benefits_stats
       WHERE series IN ('uc_people', 'uc_households') GROUP BY series`,
    );
    latestFiledBySeries = Object.fromEntries(
      res.rows.map((r) => [r.series, r.latest ? r.latest.toISOString().slice(0, 7) : null]),
    );
  }
  try {
    // The pull streams (BUG-195): each batch passes the
    // golden tally and the run stats and, on a filing run,
    // stages into the swap transaction as it lands. A
    // golden failure aborts the filing — nothing files,
    // exactly as when the checks ran ahead of the one-shot
    // filer.
    const tally = createUcGoldenTally();
    const stats = createRunStats();
    let filer = null;
    if (!verifyOnly) {
      if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
      filer = await createUcFiler(pool, new Date().toISOString());
    }
    try {
      await streamUcRows(source, { latestFiledBySeries }, async (batch) => {
        for (const row of batch) tally.offer(row);
        stats.addRows(batch);
        if (filer) await filer.stageRows(batch);
      });
      const golden = tally.failures({ full: source.kind === "live" && !source.codes });
      if (golden.length > 0) throw new Error(`golden checks failed: ${golden.join("; ")}`);
    } catch (err) {
      if (filer) await filer.abortFiling();
      throw err;
    }
    if (verifyOnly) {
      console.log(
        `${stats.summary(false)} — golden areas verified against the locked values (verify-only: nothing filed)`,
      );
      console.log(FIRST_PULL);
      return;
    }
    try {
      await filer.finishFiling();
    } catch (err) {
      await filer.abortFiling();
      throw err;
    }
    console.log(`${stats.summary(true)} — golden areas present`);
  } finally {
    if (pool) await pool.end();
  }
}

// Run only as a script (run-loaders / npm), never on import.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(`load-dwp-uc FAILED: ${err.message}`);
    process.exit(1);
  });
}
