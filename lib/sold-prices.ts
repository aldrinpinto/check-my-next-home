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
  let rows = await source.salesInPostcode(postcode);
  let stampEdition = rows.length > 0 ? null : await source.loadEdition(postcode);
  if (rows.length === 0 && stampEdition === null) {
    await source.loadPostcode(postcode);
    rows = await source.salesInPostcode(postcode);
    stampEdition = rows.length > 0 ? null : await source.loadEdition(postcode);
  }
  const loadState = rows.length > 0 ? "found" : "loaded-none";
  const sourceName = rows[0]?.sourceName ?? SOLD_PRICES_SOURCE_NAME;
  const edition = rows[0]?.sourceDate ?? stampEdition;
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
}

const execFileAsync = promisify(execFile);

export function createSoldPricesSource(
  db: AddressQueryable,
  options: SoldPricesSourceOptions = {},
): SoldPricesDataSource {
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
      // The loader takes its postcodes after a "--" separator
      // (its own usage line: load-sold-prices -- "CM3 2JT"); its
      // argument filter drops the slot the separator occupies,
      // so without it the first — here the only — postcode is
      // silently never loaded. Pinned by a test.
      const { stdout } = await execFileAsync(process.execPath, [loaderPath, "--", postcode], {
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
    },
  };
}
