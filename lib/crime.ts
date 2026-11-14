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
//   - NO rate, ranking, percentile or comparison, ever. A
//     per-capita rate is not honestly computable (the 1-mile
//     circle is not a filed area and holds no filed population),
//     and every comparative device is the rejected crime score
//     arriving by instalments (D5).
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

const UNAVAILABLE_REASON = "crime counts need an exact postcode";
const NOT_FILED_REASON = "crime counts are not filed for this postcode yet";

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
}

// The brain's read port over the filed artefact — the same
// pattern as lib/address.ts and lib/sold-prices.ts: tests drive
// a fake; createCrimeSource below is the only database
// implementation.
export interface CrimeDataSource {
  crimeAnswer(postcode: string): Promise<FiledCrimeAnswer | null>;
}

// ------------------------------------------------------------------
// Served shapes
// ------------------------------------------------------------------

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

function staleLineFor(filed: FiledCrimeAnswer, now: Date): string | null {
  const todayMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lag = monthIndex(todayMonth) - monthIndex(filed.windowTo);
  if (lag <= CRIME_STALE_AFTER_MONTHS) return null;
  return `the latest month we hold is ${monthLabel(filed.windowTo)} — Police.uk has not published newer data we can file`;
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
    const place = coverage === "scotland" ? "Scotland" : "Northern Ireland";
    return {
      rung: resolution.rung,
      kind: "not-covered",
      postcode,
      crime: {
        state: "not-covered",
        reason: `crime counts are not covered for ${place} — Police.uk publishes street-level data for England and Wales forces only`,
      },
    };
  }

  const filed = await source.crimeAnswer(postcode);
  if (!filed) {
    // No artefact filed for this postcode: the honest answer is
    // the named state, never an invented zero.
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
      staleLine: staleLineFor(filed, now),
    },
  };
}

// ------------------------------------------------------------------
// The database source
// ------------------------------------------------------------------

export function createCrimeSource(db: AddressQueryable): CrimeDataSource {
  return {
    async crimeAnswer(postcode) {
      const { rows } = await db.query(
        "SELECT answers -> 'crime' AS crime FROM postcode_cache WHERE postcode = $1",
        [postcode],
      );
      return (rows[0]?.crime as FiledCrimeAnswer | null) ?? null;
    },
  };
}
