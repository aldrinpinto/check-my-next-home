import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  displayText,
  labelForAddressParts,
  parsePaon,
  type AddressQueryable,
  type AddressResolution,
} from "./address";

// Sold prices (plan step M6.3, decision D23).
//
// The brain's sold-price answers: for a resolved home, its own
// recorded sale history; for its postcode, a median of recorded
// sales and the most recent recorded sales. Facts only, from the
// price_paid table the M4.2 loader files on demand per postcode
// (HM Land Registry Price Paid, England and Wales).
//
// The ruled shape (D23):
//   - The served median is the postcode median over all
//     category-A recorded sales, with the counted number and the
//     counted date span named beside it. Category-B sales never
//     count toward a median — the register's additional entries
//     mix transfers whose prices need not be market prices — but
//     a category-B sale of the home itself DOES appear in the
//     home's own history, unlabelled: the register does not say
//     which reason applies to a row, so no label can be honest.
//   - A median is served only when the counted set holds at
//     least MEDIAN_MIN_COUNT sales; below that the sales
//     themselves are listed under the named too-few state.
//   - All recorded years count (the register starts in 1995);
//     no time window, no index adjustment — each sale's date
//     rides with its price.
//   - A flat's answer adds its building's category-A sales,
//     count and median on the same basis: the building is the
//     comparison set a flat buyer means, and a postcode median
//     can blend several buildings.
//   - The brain NEVER computes a gap, a percentage or a
//     comparative adjective between a home's price and any
//     median, and sold prices are never called a valuation.
//     The figures are separate facts; the reader compares.
//
// The ladder contract (M6.1/D6): own-home facts attach at rung 1
// only — the rung-2 bundle has no own-history payload by
// construction. Rung 3 serves no sold-price figures (loading is
// per postcode by design, so a wider-area figure would be
// invented, not computed) and rung 4 nothing: both carry the
// named state instead.
//
// Loaded states: price_paid holds only postcodes that have been
// loaded. Rows present prove a load; a load that filed nothing
// leaves no rows, so the check stamps its load (edition +
// timestamp) into the postcode's cached answers under
// "soldPricesLoad" — that stamp is what proves "loaded, with
// none recorded" apart from "never loaded". A postcode the
// check has never loaded is loaded first, through the existing
// loader path; no answer is ever read from emptiness.
//
// The fourth outcome (Part A of the cold-check fix,
// founder's authorisation, 19 Nov 2026): a load that is
// still running when the caller's bounded wait expires —
// or a load, or a read, that fails — answers in the
// rung-1/2 unavailable variant ({state:"unavailable"}),
// never as a rejection. Before Part A the rejection
// escaped into the check assembly (serve.ts's
// Promise.all), where it failed the WHOLE check for any
// postcode whose only fault was being checked first.
// The variant carries no figures and no stamp is written
// for it: the background run still files and stamps, and
// the next check serves the filed answer.

export const SOLD_PRICES_SOURCE_NAME = "HM Land Registry Price Paid";
export const MEDIAN_MIN_COUNT = 5;
export const RECENT_LIST_SIZE = 10;

export const MEDIAN_EXPLAINER =
  "The middle recorded sale price in this postcode — half sold for more, half for less. It is not a valuation of this home.";
export const BUILDING_MEDIAN_EXPLAINER =
  "The middle recorded sale price in this building — half sold for more, half for less. It is not a valuation of this home.";
export const HISTORY_EXPLAINER =
  "Every sale of this home in the Land Registry record since 1995, newest first, exactly as filed.";
export const NO_SALE_RECORDED_LINE = "No sale recorded for this postcode since 1995";
export const NO_HOME_SALE_LINE = "No sale recorded for this home since 1995";
export const RECENT_SALES_LABEL = "recent recorded sales in this postcode";

const UNAVAILABLE_REASON = "sold prices need an exact postcode";

// The rung-1/2 cold-load degrade's reason (Part A of the
// cold-check fix, founder's authorisation, 19 Nov 2026),
// in the brain's reason register — the UNAVAILABLE_REASON
// family above: lowercase, the section's own words, no
// trailing period. It is honest for both failures the
// variant covers: a load still running (it files in the
// background) and a load that failed (the next check
// retries it) — in both, the prices are still being
// gathered and a later check is the remedy it names.
export const STILL_GATHERING_REASON =
  "sold prices are still being gathered for this postcode — check again shortly";

// ------------------------------------------------------------------
// Filed-data shapes
// ------------------------------------------------------------------

// One row of price_paid, as filed by the M4.2 loader. `category`
// is the register's own A/B as filed; it steers which rows count
// toward a median and never reaches a served object.
export interface SoldPriceRow {
  transactionId: string | null;
  price: number;
  saleDate: string;
  postcode: string;
  propertyType: string | null;
  newBuild: boolean | null;
  tenure: string | null;
  paon: string | null;
  saon: string | null;
  street: string | null;
  locality: string | null;
  town: string | null;
  category: string | null;
  sourceName: string;
  sourceDate: string;
}

// The brain's read/write port over the filed table — the same
// pattern as lib/address.ts and lib/nearby.ts: tests drive a
// fake implementing the loader's contract; createSoldPricesSource
// below is the only database implementation.
export interface SoldPricesDataSource {
  salesInPostcode(postcode: string): Promise<SoldPriceRow[]>;
  // The edition the check's own load filed for this postcode, or
  // null when the check has never loaded it.
  loadEdition(postcode: string): Promise<string | null>;
  // Load the postcode's set through the existing loader path
  // (loaders/load-sold-prices.mjs). Files the set — possibly
  // empty — and stamps the load.
  loadPostcode(postcode: string): Promise<void>;
}

// ------------------------------------------------------------------
// Served shapes
// ------------------------------------------------------------------

// One served sale: price, date, and the property facts as filed,
// plus the display label of the home the sale belongs to. There
// is deliberately no category on this shape.
export interface ServedSale {
  price: number;
  date: string;
  propertyType: string | null;
  tenure: string | null;
  newBuild: boolean | null;
  address: string;
}

export interface MedianAnswer {
  state: "served" | "too-few" | "none-recorded";
  value: number | null;
  // The counted set: the category-A sales the median is (or
  // would be) computed over.
  counted: number;
  spanFrom: string | null;
  spanTo: string | null;
  line: string | null;
  explainer: string;
}

export interface BuildingSalesAnswer {
  building: string;
  // The building's category-A sales, newest first.
  sales: ServedSale[];
  counted: number;
  median: MedianAnswer;
}

interface PostcodeFigures {
  postcode: string;
  loadState: "found" | "loaded-none";
  // Every recorded sale filed for the postcode, both categories.
  recordedCount: number;
  sourceName: string;
  // The filed file edition the figures come from.
  edition: string | null;
  sourceLine: string;
  // The zero-sales sentence when loadState is "loaded-none".
  stateLine: string | null;
  median: MedianAnswer;
  // EVERY counted sale (the full category-A set the median
  // is drawn from), newest first — recentSales is its
  // 10-newest slice. The report's dot plot (M8.2) plots
  // this set: one dot per counted sale, the same sales the
  // median beside it is computed over, with no chart-only
  // cap (founder ruling, 20 Nov 2026). Widened deliberately
  // at M8.2 under the re-pin ceremony — the record stands
  // in tests/bundle-contracts.test.ts and
  // docs/frontend-design-pass.md.
  countedSales: ServedSale[];
  recentSales: ServedSale[];
  recentLabel: string;
  building: BuildingSalesAnswer | null;
}

export type SoldPricesBundle =
  | (PostcodeFigures & {
      rung: 1;
      kind: "sold-prices";
      // ALL of the home's recorded sales, newest first —
      // category-B sales included, unlabelled.
      ownHistory: ServedSale[];
      // The named state when the home itself has no recorded
      // sale; null when it has.
      ownLine: string | null;
      ownExplainer: string;
    })
  | (PostcodeFigures & { rung: 2; kind: "sold-prices" })
  | {
      rung: 3;
      kind: "wider-area";
      soldPrices: { state: "unavailable"; reason: string };
    }
  | {
      rung: 4;
      kind: "no-location";
      soldPrices: { state: "unavailable"; reason: string };
    }
  | {
      rung: 1 | 2;
      kind: "sold-prices";
      postcode: string;
      // The cold-load degrade (Part A of the cold-check
      // fix, founder's authorisation, 19 Nov 2026): the
      // postcode's load has not landed — still running
      // past the bounded wait, or failed — so there are
      // no figures to serve and the variant carries the
      // named state alone, mirroring the rung-3/4 form
      // on the same kind. "loaded-none" would be a faked
      // state here (it asserts a completed load), and
      // "not-covered" is keyed to the nations; neither
      // may stand in for a load in flight.
      soldPrices: { state: "unavailable"; reason: string };
    }
  | {
      rung: 1 | 2;
      kind: "not-covered";
      postcode: string;
      soldPrices: { state: "not-covered"; reason: string };
    };

// ------------------------------------------------------------------
// Coverage — Price Paid is England and Wales only
// ------------------------------------------------------------------

// Postcode areas (the letters of the outward code) that are
// Scotland's; BT is Northern Ireland's single area. Everything
// else in the directory is England or Wales, which the register
// covers.
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
// The arithmetic — one median, the loader's own form
// ------------------------------------------------------------------

function medianOf(prices: number[]): number {
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Newest first; same-day sales order by price, then address, so
// every list the brain serves is deterministic.
function byNewest(a: SoldPriceRow, b: SoldPriceRow): number {
  if (a.saleDate !== b.saleDate) return a.saleDate < b.saleDate ? 1 : -1;
  if (a.price !== b.price) return a.price - b.price;
  return labelForAddressParts(a).localeCompare(labelForAddressParts(b));
}

function toServed(row: SoldPriceRow): ServedSale {
  return {
    price: row.price,
    date: row.saleDate,
    propertyType: row.propertyType,
    tenure: row.tenure,
    newBuild: row.newBuild,
    address: labelForAddressParts(row),
  };
}

function medianAnswer(
  countedRows: SoldPriceRow[],
  where: "postcode" | "building",
  explainer: string,
  // How many sales are recorded in the whole set (both
  // categories). When it is above zero but nothing counts
  // toward a median, the none-recorded line must speak of
  // the counted set — the "No sale recorded … since 1995"
  // sentence is true only of a set with nothing recorded
  // at all (M6.9, decision D30).
  recordedInSet: number,
): MedianAnswer {
  const counted = countedRows.length;
  if (counted === 0) {
    return {
      state: "none-recorded",
      value: null,
      counted: 0,
      spanFrom: null,
      spanTo: null,
      line:
        recordedInSet > 0
          ? `no recorded sales in this ${where} count toward a median`
          : NO_SALE_RECORDED_LINE,
      explainer,
    };
  }
  const dates = countedRows.map((r) => r.saleDate).sort();
  const spanFrom = dates[0];
  const spanTo = dates[dates.length - 1];
  if (counted < MEDIAN_MIN_COUNT) {
    return {
      state: "too-few",
      value: null,
      counted,
      spanFrom,
      spanTo,
      line: `only ${counted} recorded sale${counted === 1 ? "" : "s"} in this ${where} — too few for a median`,
      explainer,
    };
  }
  return {
    state: "served",
    value: medianOf(countedRows.map((r) => r.price)),
    counted,
    spanFrom,
    spanTo,
    line: `counted over ${counted} recorded sales, ${spanFrom} to ${spanTo}`,
    explainer,
  };
}

// The building cut for a set of filed PAONs (a flat's own
// building at rung 1; the narrowed building at rung 2).
function buildingAnswer(rows: SoldPriceRow[], paons: Set<string>): BuildingSalesAnswer | null {
  const buildingRows = rows.filter((r) => r.paon !== null && paons.has(r.paon));
  if (buildingRows.length === 0) return null;
  const counted = buildingRows.filter((r) => r.category === "A").sort(byNewest);
  const name = parsePaon(buildingRows[0].paon).name;
  return {
    building: name ? displayText(name) : (buildingRows[0].paon as string),
    sales: counted.map(toServed),
    counted: counted.length,
    median: medianAnswer(counted, "building", BUILDING_MEDIAN_EXPLAINER, buildingRows.length),
  };
}

// ------------------------------------------------------------------
// The bundle
// ------------------------------------------------------------------

export async function buildSoldPricesBundle(
  resolution: AddressResolution,
  source: SoldPricesDataSource,
): Promise<SoldPricesBundle> {
  if (resolution.rung === 3)
    return {
      rung: 3,
      kind: "wider-area",
      soldPrices: { state: "unavailable", reason: UNAVAILABLE_REASON },
    };
  if (resolution.rung === 4)
    return {
      rung: 4,
      kind: "no-location",
      soldPrices: { state: "unavailable", reason: UNAVAILABLE_REASON },
    };

  const postcode = resolution.directory.postcode;
  const coverage = coverageOf(postcode);
  if (coverage !== "covered") {
    // Scotland's own register is named (D30 — the
    // not-covered form: the boundary, plus where the
    // nation's own answer lives, where one exists).
    const reason =
      coverage === "scotland"
        ? "sold prices are not covered for Scotland — HM Land Registry publishes Price Paid for England and Wales only; property sales in Scotland are recorded by Registers of Scotland"
        : "sold prices are not covered for Northern Ireland — HM Land Registry publishes Price Paid for England and Wales only";
    return {
      rung: resolution.rung,
      kind: "not-covered",
      postcode,
      soldPrices: { state: "not-covered", reason },
    };
  }

  // The three loaded states: rows prove a load; the check's own
  // load stamp proves a load that filed none; neither means the
  // postcode has never been loaded, so load it now — an answer
  // is never read from emptiness.
  // Part A of the cold-check fix (founder's
  // authorisation, 19 Nov 2026): the whole read/load
  // sequence runs under this one catch. A load still
  // running when the caller's bounded wait expires
  // (SoldPricesLoadPendingError, raised by the source), a
  // failed load, or a failed read degrades THIS brain to
  // its unavailable variant — it never rejects into the
  // check assembly, where one rejection used to fail the
  // whole check. The load itself is untouched: the
  // source's run files and stamps in the background, and
  // the next check serves the filed answer.
  try {
    let rows = await source.salesInPostcode(postcode);
    let stampEdition = rows.length > 0 ? null : await source.loadEdition(postcode);
    if (rows.length === 0 && stampEdition === null) {
      await source.loadPostcode(postcode);
      rows = await source.salesInPostcode(postcode);
      stampEdition = rows.length > 0 ? null : await source.loadEdition(postcode);
    }
    const loadState = rows.length > 0 ? "found" : "loaded-none";
    const sourceName = rows[0]?.sourceName ?? SOLD_PRICES_SOURCE_NAME;
    // The figures' edition is the NEWEST source_date among the
    // postcode's rows (Price Paid national step, gap 6): whole-
    // postcode loads stamp every row alike, but the monthly
    // update mode upserts single sales under the update file's
    // own edition, so a postcode's rows legitimately span
    // editions — the served source line names the newest file
    // any of its figures came from, never whichever row the
    // read happened to return first.
    const edition =
      rows.length > 0
        ? rows.reduce((max, r) => (r.sourceDate > max ? r.sourceDate : max), rows[0].sourceDate)
        : stampEdition;
    const sourceLine = edition
      ? `${sourceName} — file edition ${edition}`
      : `${sourceName} — the filed edition for this postcode is not recorded`;

    const counted = rows.filter((r) => r.category === "A").sort(byNewest);
    const figures: PostcodeFigures = {
      postcode,
      loadState,
      recordedCount: rows.length,
      sourceName,
      edition,
      sourceLine,
      stateLine: loadState === "loaded-none" ? NO_SALE_RECORDED_LINE : null,
      median: medianAnswer(counted, "postcode", MEDIAN_EXPLAINER, rows.length),
      countedSales: counted.map(toServed),
      recentSales: counted.slice(0, RECENT_LIST_SIZE).map(toServed),
      recentLabel: RECENT_SALES_LABEL,
      building: null,
    };

    if (resolution.rung === 2) {
      // A list narrowed to one building may show that building's
      // sales as list facts — derived from the list's own filed
      // PAONs. No sale is singled out as any home's: the rung-2
      // bundle carries no own-history payload by construction.
      if (resolution.building !== null) {
        const paons = new Set(
          resolution.addresses.map((a) => a.paon).filter((p): p is string => p !== null),
        );
        figures.building = buildingAnswer(rows, paons);
      }
      return { rung: 2, kind: "sold-prices", ...figures };
    }

    // Rung 1: the home's own sales, matched filed-to-filed on the
    // parts the resolver handed over — PAON + SAON together for a
    // flat (the M6.1 flat rule), never the flat number alone.
    const home = resolution.address;
    const own = rows
      .filter(
        (r) =>
          r.paon === home.paon &&
          (r.saon ?? null) === (home.saon ?? null) &&
          r.street === home.street,
      )
      .sort(byNewest);
    if (home.saon) figures.building = buildingAnswer(rows, new Set([home.paon as string]));
    return {
      rung: 1,
      kind: "sold-prices",
      ...figures,
      ownHistory: own.map(toServed),
      ownLine: own.length === 0 ? NO_HOME_SALE_LINE : null,
      ownExplainer: HISTORY_EXPLAINER,
    };
  } catch {
    return {
      rung: resolution.rung,
      kind: "sold-prices",
      postcode,
      soldPrices: { state: "unavailable", reason: STILL_GATHERING_REASON },
    };
  }
}

// ------------------------------------------------------------------
// The database source
// ------------------------------------------------------------------

export interface SoldPricesSourceOptions {
  // The connection the loader child process files through;
  // defaults to the environment's DATABASE_URL (Key K6).
  databaseUrl?: string;
  // The loader's path; defaults to this repo's own loader.
  loaderPath?: string;
  // How long one caller waits for a cold load before it is
  // told the load is still running (see loadPostcode);
  // defaults to SOLD_PRICES_LOAD_WAIT_MS. A test seam.
  loadWaitMs?: number;
  // The directory the loader reads its Price Paid files
  // from (its --file argument); defaults to the
  // environment's SOLD_PRICES_FILE_DIR, and to the
  // loader's own live download when neither is set. A
  // test-rig seam (the E2E harness points it at the
  // fixture file so a cold load is small and lands
  // fast); production never sets it.
  fileDir?: string;
}

const execFileAsync = promisify(execFile);

// ------------------------------------------------------------------
// The cold load, bounded (the area-part hang fix, 19 Nov 2026)
// ------------------------------------------------------------------
//
// The loader streams the WHOLE Price Paid full file —
// 5,541,566,049 bytes, ~31.7M lines — and filters it to the
// one postcode. Measured on the play server through the
// loader's own fetch + readline pipeline: ~67,000 lines a
// second, so one cold load runs about eight minutes, flat
// out on one core, doing no database work until the final
// filing transaction. Before this fix, loadPostcode awaited
// the child to completion, so the first check of any
// unfiled postcode waited the whole stream: the checking
// screen's area part never settled (the screen advances
// only when all three parts settle), and every concurrent
// caller — the part call, the results derivation, a retry —
// spawned its OWN full stream (three were observed running
// at once for one postcode, BL2 2NX).
//
// The fix bounds the WAITING, never the load, and invents
// nothing:
//   - One load per postcode at a time: callers join the
//     in-flight run instead of spawning another stream.
//     The registry is anchored to globalThis (the hybrid
//     list-memory pattern) because the serving runtime does
//     not share one module instance between routes.
//   - The run itself always goes to completion in the
//     background: the loader files the postcode's set and
//     the run stamps the load exactly as before, so the
//     next check serves the filed answer.
//   - A caller waits at most SOLD_PRICES_LOAD_WAIT_MS for
//     the run. A load that lands inside the wait resolves
//     exactly as it always did (the fixture loads of the
//     test suite, and any genuinely fast load). A caller
//     whose wait expires is told the load is still running
//     (SoldPricesLoadPendingError) — it propagates exactly
//     where a failed load propagates today: the part
//     answers its named failure, the results derivation
//     renders its whole-check failure with the retry, and
//     the retry serves the filed data once the run lands.
//     (Part A of the cold-check fix, 19 Nov 2026,
//     supersedes that propagation: the error still
//     leaves the SOURCE exactly as described, but the
//     BRAIN catches it — buildSoldPricesBundle answers
//     the rung-1/2 unavailable variant, the rest of the
//     check renders whole, and a later check serves the
//     filed data once the run lands.)
//   - No state is faked on the way: the stamp is written
//     only by a completed run, so "loaded, none recorded"
//     can never be served for a postcode whose load is
//     still streaming, and no figure is ever read from a
//     half-filed set (the loader files in one transaction).
export const SOLD_PRICES_LOAD_WAIT_MS = 10_000;

// The wait's test-rig override (cold-check fix stack,
// 19 Nov 2026): the server-config env
// SOLD_PRICES_LOAD_WAIT_MS, when it carries a
// non-negative number, replaces the pinned wait at
// source creation — the E2E harness's forced-pending
// instance runs with it at 0, so a cold load is always
// still running when the caller is told. TEST-ONLY:
// production never sets it, and an unset, unparsable
// or negative value leaves the pinned wait standing.
export function soldPricesLoadWaitMsFromEnv(env: Record<string, string | undefined>): number {
  const raw = env.SOLD_PRICES_LOAD_WAIT_MS;
  if (raw === undefined) return SOLD_PRICES_LOAD_WAIT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : SOLD_PRICES_LOAD_WAIT_MS;
}

export class SoldPricesLoadPendingError extends Error {
  constructor(postcode: string, waitMs: number) {
    super(
      `the sold-prices load for ${postcode} is still running after ${waitMs}ms — it files in the background and the next check serves it`,
    );
    this.name = "SoldPricesLoadPendingError";
  }
}

const soldPricesGlobal = globalThis as typeof globalThis & {
  __cmnhSoldPricesLoads?: Map<string, Promise<void>>;
};

function soldPricesLoadsInFlight(): Map<string, Promise<void>> {
  soldPricesGlobal.__cmnhSoldPricesLoads ??= new Map();
  return soldPricesGlobal.__cmnhSoldPricesLoads;
}

// One caller's bounded wait on the shared run: the run's
// own outcome (success, or the loader's real failure)
// reaches every caller still waiting; a caller whose wait
// expires hears "still running" instead, and the run
// carries on without it.
function awaitSoldPricesLoad(run: Promise<void>, postcode: string, waitMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new SoldPricesLoadPendingError(postcode, waitMs)),
      waitMs,
    );
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

export function createSoldPricesSource(
  db: AddressQueryable,
  options: SoldPricesSourceOptions = {},
): SoldPricesDataSource {
  // The caller's wait, settled once at creation: the
  // explicit option wins, then the test-rig env
  // override, then the pinned bound.
  const loadWaitMs = options.loadWaitMs ?? soldPricesLoadWaitMsFromEnv(process.env);
  return {
    async salesInPostcode(postcode) {
      const { rows } = await db.query(
        `SELECT transaction_id, price, sale_date::text AS sale_date, postcode,
                property_type, new_build, tenure, paon, saon, street, locality,
                town, ppd_category, source_name, source_date::text AS source_date
           FROM price_paid WHERE postcode = $1`,
        [postcode],
      );
      return rows.map((row) => ({
        transactionId: (row.transaction_id as string | null) ?? null,
        price: row.price as number,
        saleDate: row.sale_date as string,
        postcode: row.postcode as string,
        propertyType: (row.property_type as string | null) ?? null,
        newBuild: (row.new_build as boolean | null) ?? null,
        tenure: (row.tenure as string | null) ?? null,
        paon: (row.paon as string | null) ?? null,
        saon: (row.saon as string | null) ?? null,
        street: (row.street as string | null) ?? null,
        locality: (row.locality as string | null) ?? null,
        town: (row.town as string | null) ?? null,
        category: (row.ppd_category as string | null) ?? null,
        sourceName: row.source_name as string,
        sourceDate: row.source_date as string,
      }));
    },

    async loadEdition(postcode) {
      const { rows } = await db.query(
        "SELECT answers -> 'soldPricesLoad' ->> 'edition' AS edition FROM postcode_cache WHERE postcode = $1",
        [postcode],
      );
      return (rows[0]?.edition as string | null) ?? null;
    },

    async loadPostcode(postcode) {
      const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
      if (!databaseUrl)
        throw new Error(
          "DATABASE_URL is not set (see .env.example, Key K6) — cannot load a postcode",
        );
      const loaderPath =
        options.loaderPath ??
        fileURLToPath(new URL("../loaders/load-sold-prices.mjs", import.meta.url));

      // Join the postcode's load if one is already running;
      // otherwise start it. The run is the load exactly as it
      // always was — the loader child, the edition read off
      // its output, the stamp — detached from any one
      // caller's patience, so a caller who stops waiting
      // never cancels the filing the next check depends on.
      // The run is registered before it can settle and
      // evicts itself when it settles (success or failure
      // alike: a failed load is retried by the next check,
      // as before). The settle handler also keeps a run
      // every caller has stopped waiting on from surfacing
      // as an unhandled rejection.
      const inFlight = soldPricesLoadsInFlight();
      let run = inFlight.get(postcode);
      if (!run) {
        run = (async () => {
          // The loader takes its postcodes after a "--" separator
          // (its own usage line: load-sold-prices -- "CM3 2JT"); its
          // argument filter drops the slot the separator occupies,
          // so without it the first — here the only — postcode is
          // silently never loaded. Pinned by a test.
          //
          // The --file directory, when one is configured
          // (options.fileDir, or the SOLD_PRICES_FILE_DIR
          // server-config env — the test rig's seam, see
          // SoldPricesSourceOptions), rides BEFORE the
          // separator, in the loader's own argument shape;
          // unconfigured, the loader downloads the live
          // file exactly as it always has.
          const fileDir = options.fileDir ?? process.env.SOLD_PRICES_FILE_DIR;
          const loaderArgs = fileDir
            ? [loaderPath, "--file", fileDir, "--", postcode]
            : [loaderPath, "--", postcode];
          const { stdout } = await execFileAsync(process.execPath, loaderArgs, {
            env: { ...process.env, DATABASE_URL: databaseUrl },
            maxBuffer: 16 * 1024 * 1024,
          });
          const edition = /edition (\d{4}-\d{2}-\d{2})/.exec(stdout)?.[1] ?? null;
          if (!edition)
            throw new Error(`the sold-prices load for ${postcode} did not report its file edition`);
          // Stamp the load on the postcode's cached answers — the
          // durable proof that this postcode's set was loaded, which
          // is what separates "loaded, none recorded" from "never
          // loaded" when the load filed no rows.
          const stamp = JSON.stringify({ edition, loadedAt: new Date().toISOString() });
          const { rows } = await db.query(
            `UPDATE postcode_cache
                SET answers = jsonb_set(answers, '{soldPricesLoad}', $2::jsonb, true),
                    updated_at = now()
              WHERE postcode = $1
              RETURNING postcode`,
            [postcode, stamp],
          );
          if (rows.length === 0)
            throw new Error(
              `cannot stamp the sold-prices load for ${postcode}: the postcode is not in the directory`,
            );
        })();
        inFlight.set(postcode, run);
        const evict = () => {
          if (inFlight.get(postcode) === run) inFlight.delete(postcode);
        };
        void run.then(evict, evict);
      }

      // This caller's wait is bounded (see the section
      // header): a load that lands inside the wait resolves
      // as it always did; past it, the caller is told the
      // load is still running and the run carries on.
      await awaitSoldPricesLoad(run, postcode, loadWaitMs);
    },
  };
}
