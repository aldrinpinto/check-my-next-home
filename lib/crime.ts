import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { AddressQueryable, AddressResolution } from "./address";

// Crime (plan step M6.4, decision D24).
//
// The brain's recorded-crime answer: for a resolved postcode,
// the counts the M4.3 loader has already filed into that
// postcode's cached answers (postcode_cache.answers, key
// "crime") — the Police.uk API's own counts of street-level
// crimes recorded within the API's 1-mile radius of the postcode
// point, over a rolling 12-month window. There is no crime
// table and no spatial query: the answer is one read of the
// filed artefact, served as published.
//
// The ruled shape (D24):
//   - The answer is the 12-month total plus the FULL published
//     category breakdown — the publisher's own category names,
//     never renamed, merged or softened; a category with no
//     recorded count in the window is not listed. Anti-social
//     behaviour stays inside the headline total and appears as
//     its own line, like every other category.
//   - The 12 monthly counts travel as dated facts. The brain
//     computes NO trend and uses no direction language: twelve
//     monthly counts are facts, a direction word over them
//     would be an interpretation, and interpretation of crime
//     is the verdict this product refuses to sell.
//   - NO ranking, percentile or verdict, ever — and no
//     "rate": the word is banned in this section's served
//     text. What D39 (15 Nov 2026, amending D24) adds is two
//     calibration figures, computed only from filed fields:
//     a per-head figure (recorded crimes per 1,000 residents)
//     on the population the loader files inside the artefact
//     — Basis B, the founder's ruling: the Census 2021
//     residents of the LSOAs containing the postcodes within
//     the same 1 mile, counted whole — and that figure set
//     against the England figure for the same window,
//     computed the same way from the same data. Both figures
//     always travel together, as a multiple, never a lone
//     percentage and never a verdict adjective. An artefact
//     filed before M6.20 carries neither population field,
//     and serves its counts exactly as before with the
//     calibration absent — never back-computed, never
//     estimated.
//   - Staleness: when the filed window's end is more than
//     CRIME_STALE_AFTER_MONTHS months behind today — the loader
//     freshness guard's own threshold, shared, not forked —
//     the last-good window serves WITH the named stale line.
//     Counts are never suppressed for staleness: the loader
//     deliberately keeps the old answer serving and alerts
//     behind the scenes; the stale line is the reader-facing
//     half of that design.
//   - A zero total is served as the count it is, with its
//     window and basis named — recorded is not occurred, and
//     the answer is never worded "no crime" and never padded
//     with a wider radius.
//   - A covered postcode with no filed artefact is loaded on
//     first check through the loader path (M6.9, decision
//     D30 — the D23 pattern the sold-prices and EPC brains
//     already use). Not-filed is served only when that load
//     was attempted and failed, in the EPC brain's "could
//     not be loaded" form: the state names a failed load,
//     never a postcode nobody tried to load.
//
// The ladder contract: the count is a POSTCODE answer, counted
// from the postcode point over incidents the police themselves
// anonymise to street points — it never attaches to a home.
// Rung 1 and rung 2 therefore serve the identical answer,
// worded "recorded within 1 mile of this postcode" (never
// "near this home", never "at this address"). Rung 3 serves no
// figure: crime exists only as per-postcode answers for loaded
// postcodes, and averaging those into a district figure would
// present a self-selected sample as an area statistic — the
// rung carries the named state instead. Rung 4: nothing.
// Scotland and Northern Ireland get the named not-covered
// state (Police.uk publishes street-level data for England and
// Wales forces plus the British Transport Police). Force-level
// gaps inside England and Wales are invisible in the filed
// data — the guard is national — so they are a named limitation
// in the How-we-check copy, not a brain feature.

export const CRIME_SOURCE_NAME = "Police.uk street-level crime";

// The staleness threshold, in months: the loader's freshness
// guard (MAX_LAG_MONTHS in loaders/load-crime.mjs) fails a load
// whose newest published month is more than this many months
// behind today, and the monthly canary trips on the same line.
// The brain serves the stale line past the same threshold, so
// loader, canary and brain never disagree about which windows
// are old. A unit test pins this constant to the loader's.
export const CRIME_STALE_AFTER_MONTHS = 3;

export const CRIME_EXPLAINER =
  "Counts of crimes the police recorded within 1 mile of the point on the map for this postcode, over the 12 months named. The circle covers the streets around the postcode, not only this street.";

// The calibration figures' standing basis text (D39/D13):
// served with every served answer in the FLOOD_HOW_WE_CHECK
// precedent, so the How we check page and both surfaces
// render the same words. It states the method, both of
// Basis B's known biases, and what a per-head figure is
// not. The full working lives on the How we check page
// (M7's surface); this is the beside-figure form.
export const CRIME_CALIBRATION_EXPLAINER =
  "Per-head figures divide the recorded count by the Census 2021 residents of the small areas that contain the postcodes inside the circle, each area counted whole. The areas reach beyond the circle, so the population is larger than the circle's own, and an area the circle only clips, holding no postcode inside the mile, is missed. The England figure is worked out the same way over the same 12 months, from the same published data. A per-head figure counts recorded crimes against residents — it is not a measure of any one person's risk, and crimes recorded in the circle include those involving people passing through.";

const UNAVAILABLE_REASON = "crime counts need an exact postcode";
const NOT_FILED_REASON =
  "crime counts could not be loaded for this postcode, so no crime answer can be given";
// The still-gathering reason (fix batch, 19 Nov 2026 —
// BUG-003): the named state a check serves when the
// postcode's cold load is still running past the bounded
// wait below. The sold-prices brain's form, restated for
// crime (its STILL_GATHERING_REASON): the load files in
// the background and a later check serves the filed
// answer.
export const CRIME_STILL_GATHERING_REASON =
  "crime counts are still being gathered for this postcode — check again shortly";

// ------------------------------------------------------------------
// Filed-data shapes
// ------------------------------------------------------------------

// The artefact the M4.3 loader files, verbatim: the counted
// answer for one postcode. `categories` maps the publisher's
// category slug to its count in the window (a record with no
// category files under "unknown"); only categories with a
// count appear. `sourceDate` is the window's end month, as
// filed ("2026-09").
export interface FiledCrimeAnswer {
  total: number;
  windowFrom: string;
  windowTo: string;
  months: { month: string; count: number }[];
  categories: Record<string, number>;
  basis: string;
  sourceName: string;
  sourceDate: string;
  loadedAt: string;
  // The calibration populations (M6.20, decision D39),
  // filed by the loader at the same moment as the counts
  // so numerator and denominator age together. Both are
  // ABSENT on artefacts filed before M6.20 — absence is a
  // named state in the served shape (calibration null),
  // never a prompt to estimate.
  // Basis B: the Census 2021 residents of the LSOAs
  // containing the postcodes within the same 1 mile,
  // counted whole (loader-computed at file time; a pinned
  // fixture value in fixture mode).
  basisResidents?: number;
  // The England window figure, embedded by the national
  // loader (load-crime-national) once every month of this
  // artefact's window is filed: the window's England total
  // (Police.uk archives, E01 LSOA prefix) over England's
  // Census 2021 residents (the lsoa_bases E01 sum,
  // 56,490,108). Null while any month is unfilled.
  national?: { total: number; residents: number } | null;
}

// The brain's read port over the filed artefact — the same
// pattern as lib/address.ts and lib/sold-prices.ts: tests drive
// a fake; createCrimeSource below is the only database
// implementation.
export interface CrimeDataSource {
  crimeAnswer(postcode: string): Promise<FiledCrimeAnswer | null>;
  // Load the postcode through the existing loader path
  // (loaders/load-crime.mjs), the D23 pattern: a covered
  // postcode with no filed artefact is loaded on first
  // check (D30), so not-filed means the load was attempted
  // and failed — never that nobody looked.
  loadPostcode(postcode: string): Promise<void>;
}

// ------------------------------------------------------------------
// Served shapes
// ------------------------------------------------------------------

// The per-head calibration (D39): the filed count read
// against the filed Basis B population. `per1000` is the
// figure to one decimal; `line` is its served sentence;
// `basisLine` is the figure's own basis, travelling with
// it (D13) — the residents count it names is this
// circle's own.
export interface ServedCrimePerHead {
  residents: number;
  per1000: number;
  line: string;
  basisLine: string;
}

// The England calibration (D39): this circle's per-head
// figure set against England's for the same window, both
// figures always in the line together. `multiple` is the
// circle's figure divided by England's, one decimal —
// null at a zero count (and where the multiple rounds to
// zero for a nonzero count), where the line carries the
// two figures only: a multiple that cannot be stated
// honestly at one decimal is not stated.
export interface ServedCrimeEnglandFigure {
  englandPer1000: number;
  multiple: number | null;
  line: string;
}

export interface ServedCrime {
  state: "served";
  total: number;
  // The headline sentence: the count, the basis in words and
  // the window — "330 recorded crimes within 1 mile of this
  // postcode, October 2025 to September 2026".
  totalLine: string;
  windowFrom: string;
  windowTo: string;
  windowLine: string;
  // Every filed category with a count, in count order (largest
  // first, slug order on ties) under its published slug.
  categories: { slug: string; count: number }[];
  // The 12 monthly counts, exactly as filed — dated facts, no
  // direction computed over them.
  months: { month: string; count: number }[];
  // The filed basis string, verbatim.
  basis: string;
  sourceName: string;
  sourceLine: string;
  explainer: string;
  // The calibration (M6.20, decision D39). perHead is
  // null when the artefact predates the step (no basis
  // residents filed); englandFigure is null while the
  // window's England total is unembedded. The explainer
  // serves either way — it is the figures' standing
  // basis text, and its presence is part of the shape.
  perHead: ServedCrimePerHead | null;
  englandFigure: ServedCrimeEnglandFigure | null;
  calibrationExplainer: string;
  // The named stale line when the filed window's end is more
  // than CRIME_STALE_AFTER_MONTHS months behind today; null
  // while the window is inside the guard's tolerance.
  staleLine: string | null;
}

export type CrimeBundle =
  | {
      rung: 1 | 2;
      kind: "crime";
      postcode: string;
      crime: ServedCrime;
    }
  | {
      rung: 1 | 2;
      kind: "crime";
      postcode: string;
      crime: { state: "not-filed"; reason: string };
    }
  | {
      rung: 3;
      kind: "wider-area";
      crime: { state: "unavailable"; reason: string };
    }
  | {
      rung: 4;
      kind: "no-location";
      crime: { state: "unavailable"; reason: string };
    }
  | {
      rung: 1 | 2;
      kind: "not-covered";
      postcode: string;
      crime: { state: "not-covered"; reason: string };
    };

// ------------------------------------------------------------------
// Coverage — Police.uk street-level data is England and Wales
// (plus the British Transport Police); the same outward-area
// split the sold-prices brain uses for its England-and-Wales
// register.
// ------------------------------------------------------------------

const SCOTLAND_AREAS = new Set([
  "AB",
  "DD",
  "DG",
  "EH",
  "FK",
  "G",
  "HS",
  "IV",
  "KA",
  "KY",
  "ML",
  "PA",
  "PH",
  "TD",
  "ZE",
]);

function coverageOf(postcode: string): "covered" | "scotland" | "northern-ireland" {
  const outward = postcode.split(" ")[0] ?? "";
  const area = /^[A-Z]+/.exec(outward)?.[0] ?? "";
  if (area === "BT") return "northern-ireland";
  if (SCOTLAND_AREAS.has(area)) return "scotland";
  return "covered";
}

// ------------------------------------------------------------------
// Months — the filed "2026-09" form, its display name, and the
// month arithmetic the stale check shares with the loader.
// ------------------------------------------------------------------

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

function monthIndex(yyyyMm: string): number {
  const [y, m] = yyyyMm.split("-").map(Number);
  return y * 12 + (m - 1);
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

const numberFormat = new Intl.NumberFormat("en-GB");

// The stale line for a filed window's end month, judged on
// `now`. Exported for the bundle cache (plan step M6.8): the
// cache stores the window, never this line, and recomputes
// the line at serve time — it flips on a calendar boundary
// with no data change, so a frozen copy would serve a stale
// window as fresh (or a fresh one as stale).
export function crimeStaleLineForWindow(windowTo: string, now: Date): string | null {
  const todayMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lag = monthIndex(todayMonth) - monthIndex(windowTo);
  if (lag <= CRIME_STALE_AFTER_MONTHS) return null;
  return `the latest month we hold is ${monthLabel(windowTo)} — Police.uk has not published newer data we can file`;
}

function staleLineFor(filed: FiledCrimeAnswer, now: Date): string | null {
  return crimeStaleLineForWindow(filed.windowTo, now);
}

// ------------------------------------------------------------------
// Calibration (M6.20, decision D39) — pure functions of the
// filed fields and the window; never of `now`, so the lines
// freeze into the cached bundle exactly like totalLine and
// only the stale line is recomputed at serve.
// ------------------------------------------------------------------

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// A per-head figure prints to one decimal — except zero,
// which prints as the count it is ("0 recorded crimes per
// 1,000 residents", the prep's locked zero line).
function per1000Text(value: number): string {
  return value === 0 ? "0" : value.toFixed(1);
}

function perHeadFor(filed: FiledCrimeAnswer): ServedCrimePerHead | null {
  const residents = filed.basisResidents;
  if (typeof residents !== "number" || residents <= 0) return null;
  const per1000 = round1((filed.total / residents) * 1000);
  return {
    residents,
    per1000,
    line: `${per1000Text(per1000)} recorded crimes per 1,000 residents`,
    basisLine: `worked out from the Census 2021 residents of the small areas that contain the postcodes within the same mile, counted whole — ${numberFormat.format(residents)} residents for this circle`,
  };
}

// The credibility floor for a filed national base (parity
// fix batch, 18 Nov 2026): an artefact embedded by a loader
// running over a partial lsoa_bases filing carries that
// partial base in its national.residents — the play server's
// held 5,899 residents under the whole country's crime
// total, which served an England figure of 933,039 per
// 1,000. England's Census 2021 population is 56,490,108;
// no genuine national filing sits anywhere near this floor,
// and no 1-mile circle basis (tens of thousands at most)
// approaches it either — so a base below the floor is not
// a national base, and the England figure is withheld (the
// brain's honest form: the local rate serves alone) until
// the artefact is re-filed over the national bases. The
// loader guards the same line at filing time
// (loaders/load-crime.mjs, ENGLAND_BASE_MIN_AREAS).
export const ENGLAND_BASE_MIN_RESIDENTS = 30_000_000;

function englandFigureFor(
  filed: FiledCrimeAnswer,
  perHead: ServedCrimePerHead,
): ServedCrimeEnglandFigure | null {
  const national = filed.national;
  if (!national || national.residents < ENGLAND_BASE_MIN_RESIDENTS) return null;
  const englandExact = (national.total / national.residents) * 1000;
  const englandPer1000 = round1(englandExact);
  // The multiple is computed on the unrounded figures and
  // stated to one decimal with "about". At a zero count —
  // and where a nonzero count's multiple rounds to 0.0 —
  // it is withheld: the line then carries both figures
  // only (D39's zero rule, and its honest extension).
  let multiple: number | null = null;
  if (filed.total > 0 && englandExact > 0) {
    const circleExact = (filed.total / perHead.residents) * 1000;
    const candidate = round1(circleExact / englandExact);
    if (candidate >= 0.1) multiple = candidate;
  }
  const head = `the England figure for the same 12 months is ${per1000Text(englandPer1000)} recorded crimes per 1,000 residents`;
  return {
    englandPer1000,
    multiple,
    line:
      multiple === null
        ? head
        : `${head} — this circle's figure is about ${multiple.toFixed(1)} times the England figure`,
  };
}

// ------------------------------------------------------------------
// The bundle
// ------------------------------------------------------------------

export interface CrimeBundleOptions {
  // The date the answer is served on; tests pin it so the
  // stale branch is provable against a frozen filed window.
  // Defaults to today.
  now?: Date;
}

export async function buildCrimeBundle(
  resolution: AddressResolution,
  source: CrimeDataSource,
  options: CrimeBundleOptions = {},
): Promise<CrimeBundle> {
  if (resolution.rung === 3)
    return {
      rung: 3,
      kind: "wider-area",
      crime: { state: "unavailable", reason: UNAVAILABLE_REASON },
    };
  if (resolution.rung === 4)
    return {
      rung: 4,
      kind: "no-location",
      crime: { state: "unavailable", reason: UNAVAILABLE_REASON },
    };

  const postcode = resolution.directory.postcode;
  const coverage = coverageOf(postcode);
  if (coverage !== "covered") {
    // Where the nation publishes its own recorded crime,
    // the line names it (D30 — flood's NRW/SEPA form).
    const reason =
      coverage === "scotland"
        ? "crime counts are not covered for Scotland — Police.uk publishes street-level data for England and Wales forces only; recorded crime in Scotland is published by Police Scotland"
        : "crime counts are not covered for Northern Ireland — Police.uk publishes street-level data for England and Wales forces only; recorded crime in Northern Ireland is published by the Police Service of Northern Ireland";
    return {
      rung: resolution.rung,
      kind: "not-covered",
      postcode,
      crime: { state: "not-covered", reason },
    };
  }

  let filed = await source.crimeAnswer(postcode);
  if (!filed) {
    // D30 (the D23 pattern): a covered postcode with no
    // filed artefact is loaded on first check. The loader
    // files the artefact into the postcode's cached
    // answers, so re-read after the load. A load that
    // throws serves not-filed below — the only path to
    // that state. A load still running past the source's
    // bounded wait (CrimeLoadPendingError — the BUG-003
    // bound, fix batch 19 Nov 2026) serves the
    // still-gathering named state instead: the check
    // completes, the load files in the background, and
    // the next check serves the filed answer.
    try {
      await source.loadPostcode(postcode);
      filed = await source.crimeAnswer(postcode);
    } catch (error) {
      if (error instanceof CrimeLoadPendingError) {
        return {
          rung: resolution.rung,
          kind: "crime",
          postcode,
          crime: { state: "not-filed", reason: CRIME_STILL_GATHERING_REASON },
        };
      }
      filed = null;
    }
  }
  if (!filed) {
    // The load was attempted and failed (or filed nothing):
    // the honest answer is the named state, never an
    // invented zero.
    return {
      rung: resolution.rung,
      kind: "crime",
      postcode,
      crime: { state: "not-filed", reason: NOT_FILED_REASON },
    };
  }

  const now = options.now ?? new Date();
  const windowLine = `${monthLabel(filed.windowFrom)} to ${monthLabel(filed.windowTo)}`;
  const categories = Object.entries(filed.categories)
    .filter(([, count]) => count > 0)
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  // Calibration follows the counts exactly (D39): a stale
  // window's calibration describes the same last-good
  // window, served beside the stale line unchanged.
  const perHead = perHeadFor(filed);
  const englandFigure = perHead ? englandFigureFor(filed, perHead) : null;

  return {
    rung: resolution.rung,
    kind: "crime",
    postcode,
    crime: {
      state: "served",
      total: filed.total,
      totalLine: `${numberFormat.format(filed.total)} recorded crime${filed.total === 1 ? "" : "s"} within 1 mile of this postcode, ${windowLine}`,
      windowFrom: filed.windowFrom,
      windowTo: filed.windowTo,
      windowLine,
      categories,
      months: filed.months,
      basis: filed.basis,
      sourceName: filed.sourceName,
      sourceLine: `${filed.sourceName} — data to ${monthLabel(filed.sourceDate)}`,
      explainer: CRIME_EXPLAINER,
      perHead,
      englandFigure,
      calibrationExplainer: CRIME_CALIBRATION_EXPLAINER,
      staleLine: staleLineFor(filed, now),
    },
  };
}

// ------------------------------------------------------------------
// The database source
// ------------------------------------------------------------------

export interface CrimeSourceOptions {
  // The connection the loader child process files through;
  // defaults to the environment's DATABASE_URL (Key K6).
  databaseUrl?: string;
  // The loader's path; defaults to this repo's own loader.
  crimeLoaderPath?: string;
  // How long one caller waits for a cold load before it is
  // told the load is still running (see loadPostcode);
  // defaults to CRIME_LOAD_WAIT_MS. A test seam.
  loadWaitMs?: number;
}

const execFileAsync = promisify(execFile);

// ------------------------------------------------------------------
// The cold load, bounded (fix batch, 19 Nov 2026 — BUG-003)
// ------------------------------------------------------------------
//
// The founder's ruling of 19 Nov 2026 (21:50): bound EVERY
// checking part the way sold prices is bounded, so the
// screen never sticks. The crime cold load was the proven
// unbounded case — measured at ~95 seconds on the play
// server (the loader works through the Police.uk archive
// months for the postcode's circle) while the checking
// screen sat at "2 of 5". The mechanism is the sold-
// prices brain's own (lib/sold-prices.ts), restated:
//   - One load per postcode at a time: callers join the
//     in-flight run instead of spawning another pass.
//     The registry is anchored to globalThis (the hybrid
//     list-memory pattern) because the serving runtime
//     does not share one module instance between routes.
//   - The run itself always goes to completion in the
//     background: the loader files the artefact exactly
//     as before, so the next check serves the filed
//     answer.
//   - A caller waits at most CRIME_LOAD_WAIT_MS. A load
//     that lands inside the wait resolves exactly as it
//     always did. A caller whose wait expires is told
//     the load is still running (CrimeLoadPendingError)
//     — buildCrimeBundle serves the still-gathering
//     named state for it, and the check completes.
export const CRIME_LOAD_WAIT_MS = 10_000;

// The wait's test-rig override, on the sold-prices
// pattern: the server-config env CRIME_LOAD_WAIT_MS,
// when it carries a non-negative number, replaces the
// pinned wait at source creation. TEST-ONLY: production
// never sets it, and an unset, unparsable or negative
// value leaves the pinned wait standing.
export function crimeLoadWaitMsFromEnv(env: Record<string, string | undefined>): number {
  const raw = env.CRIME_LOAD_WAIT_MS;
  if (raw === undefined) return CRIME_LOAD_WAIT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : CRIME_LOAD_WAIT_MS;
}

export class CrimeLoadPendingError extends Error {
  constructor(postcode: string, waitMs: number) {
    super(
      `the crime load for ${postcode} is still running after ${waitMs}ms — it files in the background and the next check serves it`,
    );
    this.name = "CrimeLoadPendingError";
  }
}

const crimeGlobal = globalThis as typeof globalThis & {
  __cmnhCrimeLoads?: Map<string, Promise<void>>;
};

function crimeLoadsInFlight(): Map<string, Promise<void>> {
  crimeGlobal.__cmnhCrimeLoads ??= new Map();
  return crimeGlobal.__cmnhCrimeLoads;
}

// One caller's bounded wait on the shared run: the run's
// own outcome reaches every caller still waiting; a
// caller whose wait expires hears "still running"
// instead, and the run carries on without it.
function awaitCrimeLoad(run: Promise<void>, postcode: string, waitMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CrimeLoadPendingError(postcode, waitMs)), waitMs);
    run.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export function createCrimeSource(
  db: AddressQueryable,
  options: CrimeSourceOptions = {},
): CrimeDataSource {
  // The caller's wait, settled once at creation: the
  // explicit option wins, then the test-rig env
  // override, then the pinned bound.
  const loadWaitMs = options.loadWaitMs ?? crimeLoadWaitMsFromEnv(process.env);
  return {
    async crimeAnswer(postcode) {
      const { rows } = await db.query(
        "SELECT answers -> 'crime' AS crime FROM postcode_cache WHERE postcode = $1",
        [postcode],
      );
      return (rows[0]?.crime as FiledCrimeAnswer | null) ?? null;
    },

    async loadPostcode(postcode) {
      const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
      if (!databaseUrl)
        throw new Error(
          "DATABASE_URL is not set (see .env.example, Key K6) — cannot load a postcode",
        );
      const loaderPath =
        options.crimeLoaderPath ??
        fileURLToPath(new URL("../loaders/load-crime.mjs", import.meta.url));
      // Join the postcode's load if one is already
      // running; otherwise start it (see the section
      // header). The run is the load exactly as it always
      // was — the loader child, detached from any one
      // caller's patience — and it evicts itself from the
      // registry when it settles, success or failure
      // alike (a failed load is retried by the next
      // check, as before).
      const inFlight = crimeLoadsInFlight();
      let run = inFlight.get(postcode);
      if (!run) {
        run = (async () => {
          // The loader takes its postcodes after a "--" separator
          // (its own usage line: load-crime -- "CM3 2JT"); its
          // argument filter drops the slot the separator occupies,
          // so without it the first — here the only — postcode is
          // silently never loaded. Pinned by a test, as in the
          // sold-prices brain.
          await execFileAsync(process.execPath, [loaderPath, "--", postcode], {
            env: { ...process.env, DATABASE_URL: databaseUrl },
            maxBuffer: 16 * 1024 * 1024,
          });
        })();
        inFlight.set(postcode, run);
        const evict = () => {
          if (inFlight.get(postcode) === run) inFlight.delete(postcode);
        };
        void run.then(evict, evict);
      }
      await awaitCrimeLoad(run, postcode, loadWaitMs);
    },
  };
}
