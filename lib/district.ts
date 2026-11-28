// The district brain (wider-area build, 18 Nov 2026 — the
// founder's ruling superseding the rung-3 "no figures"
// treatment for the sections below).
//
// The rung-3 page used to serve four tabs of named states
// ("Crime counts need an exact postcode", …) because the
// ladder's contract (M6.6/D26) holds no area codes and no
// point at rung 3, so no brain could aggregate. The founder
// has ruled the district page a real page: the postcode
// DISTRICT (the outward code, e.g. CM3) gets its own facts,
// aggregated from filed data at district grain, in the
// twelve sections the district-page design samples carry.
// This brain is that aggregation. It reads NOTHING through
// the five frozen brains and changes none of their shapes:
// it has its own port, its own source, and its own bundle,
// derived from the district's filed postcode rows — a
// postcode's district is its outward code, so membership is
// the filed rows themselves, never an invented boundary.
//
// Premise check (recorded before building, per section —
// the filed data as the loaders actually file it):
//   - District membership: postcode_cache rows whose
//     postcode starts with the outward code. Each row
//     carries its LSOA and MSOA codes and its point.
//   - Census: census_stats files fragments per MSOA
//     (integer counts, one per published table). Fragments
//     SUM exactly across the district's MSOAs — totals,
//     category counts, single years of age — so the
//     district section is buildCensus's own served shape
//     over summed fragments (the summing is done here;
//     the table and median arithmetic is area-bundle's,
//     reused, not forked).
//   - Crime: NO district figure can be filed honestly
//     today. Police.uk crime is filed only as per-postcode
//     artefacts — counts within 1 mile of a postcode point,
//     for postcodes somebody has checked (lib/crime.ts) —
//     plus England monthly totals (crime_national_months).
//     The circles overlap, so summing them across a
//     district would count the same crimes many times
//     over a self-selected sample. The section therefore
//     serves its own honest line (below), and the builder
//     supports the served form — total, per-1,000 figure
//     and the D77(a) England pair under the SAME coverage
//     guard as the home page (ENGLAND_BASE_MIN_RESIDENTS,
//     imported from lib/crime.ts, not forked) — for the
//     day an LSOA-grain filing exists to feed the port.
//     The port's database implementation returns null and
//     says why; that is a data finding, not a placeholder.
//   - Sold prices: price_paid rows for the district's
//     postcodes, category A only (D23 — category B never
//     enters a median), median stated from five sales.
//   - Deprivation: neighbourhood_stats.imd_decile per
//     LSOA — the district's English LSOAs counted per
//     decile. A spread, never collapsed to one figure.
//   - Council tax: the district's distinct filed councils
//     (postcode_cache.council) joined to
//     council_tax_charges exactly as the area brain joins
//     them (authority_name, latest tax year).
//   - Broadband/mobile: the Ofcom answers filed inside
//     postcode_cache.answers. Broadband's filed figure is
//     a share of premises PER POSTCODE, so the district
//     form is the mean of the filed shares across the
//     district's postcodes, worded as exactly that —
//     never dressed as a share of the district's premises.
//     Mobile is filed per council area (LAUA); the
//     district serves each of its areas' own 4G outdoor
//     at-least-one-operator figure under the area's name.
//   - Schools: schools rows whose filed postcode sits in
//     the district; grammar = admissions_policy
//     'Selective' (the nearby brain's own test); Ofsted
//     grades from ofsted_outcomes, unrated schools counted
//     as not yet inspected.
//   - Everyday counts: health_points rows by filed
//     postcode (exact); stations have no filed postcode,
//     so a station belongs to the district of its NEAREST
//     filed postcode — a derivation from filed rows,
//     stated in the section's source line.
//   - Flood: the roll-up. For each layer separately
//     (rofrs, then rofsw — never merged), every district
//     postcode point is read against the filed shapes:
//     the share of the district's postcodes whose point
//     falls in each published band. The planning zones
//     (flood_zone) ride inside the rivers & sea block as
//     their own line (Zones 3 and 2, drawn without
//     defences — a different product, never blended into
//     the likelihood shares). The filed layers carry no
//     area names, so the corridors a block can name are
//     the watercourses of the filed flood defences within
//     the product's standard 2-mile serving radius of the
//     district's postcode points — the only filed names
//     that touch the district. Live warnings are composed
//     at serve time from the EA feed, geo-filtered on the
//     district's own spread: the centroid of its filed
//     postcode points and the farthest point's distance,
//     both computed from the filed rows. Flood is an
//     England product: only the district's English
//     postcodes (LSOA E…) are counted, and a district with
//     none serves the not-covered form.
//   - Air: each district postcode's own modelled square
//     (the area brain's airSquare read — nearest square
//     within 1 km), the range across the distinct squares
//     those postcodes resolve to, labelled modelled.
//
// Scotland and Northern Ireland districts keep the old
// rung-3 behaviour whole: the bundle answers not-covered
// and the page renders the named-states view exactly as
// before (Phase 3 owns those nations' coverage). A Welsh
// district gets the district page, with per-section
// not-covered states where a dataset is England-only
// (flood, the IMD spread).
//
// Every figure carries its grain in its words and its
// source line. No scores, no rankings, no verdicts.

import { displayText, type AddressQueryable } from "./address";
import { censusRows, medianAgeOf, type CensusFacts, type CensusTableServed } from "./area-bundle";
import { ENGLAND_BASE_MIN_RESIDENTS } from "./crime";
import { FLOOD_BAND_DEFINITIONS, type FloodLayerType } from "./flood";

// ------------------------------------------------------------------
// Small helpers (the house forms, kept local as in every brain)
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

function dateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function sourceLineOf(sourceName: string | null, sourceDate: string | null): string | null {
  return sourceName && sourceDate ? `${sourceName} — data to ${dateLabel(sourceDate)}` : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// The haversine distance in kilometres between two filed
// points — the district spread the live-warnings read is
// geo-filtered on. Computed from the filed rows, never
// from a boundary the product does not hold.
function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ------------------------------------------------------------------
// Filed-data shapes — the brain's read port. Tests drive a
// fake; createDistrictSource below is the only database
// implementation. Every read is keyed by the outward code
// or by code lists the builder derives from the district's
// own filed postcode rows.
// ------------------------------------------------------------------

export interface DistrictPostcodeRow {
  postcode: string;
  latitude: number;
  longitude: number;
  council: string | null;
  region: string | null;
  lsoaCode: string | null;
  msoaCode: string | null;
  sourceName: string | null;
  sourceDate: string | null;
}

export interface DistrictBaseRow {
  lsoaCode: string;
  residents: number;
  households: number;
}

export interface DistrictSoldFacts {
  // The district's counted sales: category A only (D23),
  // as filed. The median arithmetic is the builder's.
  // Each row carries its postcode so the section can
  // name its coverage — how many of the district's
  // postcodes the filed sales actually span (fix batch,
  // 19 Nov 2026 — BUG-016).
  rows: { price: number; saleDate: string; propertyType: string | null; postcode: string }[];
  sourceName: string | null;
  sourceDate: string | null;
}

export interface DistrictCouncilTaxFacts {
  authorityName: string;
  nation: "england" | "wales";
  taxYear: string;
  bandDAreaAveragePence: number;
  parishAveraged: boolean;
  sourceName: string | null;
  sourceDate: string | null;
}

export interface DistrictSchoolRow {
  phase: string | null;
  selective: boolean;
  ofstedRating: string | null;
}

export interface DistrictFloodFacts {
  // The layer's filed shape count — the guard. An unfiled
  // layer serves its not-filed state, never a share.
  filedCount: number;
  // Whether the filed shapes cover THIS district at all
  // (founder fix batch, 19 Nov 2026 — audit item 14). The
  // layers file nationally in name but the golden filings
  // cover one extent; a district outside it read every
  // assignment null and the old guard — the layer table
  // is non-empty — printed a computed "No band published
  // 100%". Coverage is a fact about the district, read
  // from the filed shapes against the district's own
  // spread: an uncovered district serves the not-filed
  // form, exactly as an unfiled layer does.
  covered: boolean;
  // One entry per counted postcode: the label of the filed
  // shape covering its point, or null where no shape does.
  assignments: { postcode: string; label: string | null }[];
  sourceName: string | null;
  sourceDate: string | null;
}

export interface DistrictAirSquare {
  year: number;
  no2: number;
  pm25: number;
  pm10: number;
}

// The district crime facts the port would carry if an
// LSOA-grain filing existed: a true district total (each
// incident counted once, in the LSOA it was recorded in),
// its window, its category counts, the district's Census
// residents and the window's England base — the D39 pair's
// ingredients, judged by the same guard as the home page.
// The database source returns null today (see the header).
export interface DistrictCrimeFacts {
  total: number;
  windowFrom: string;
  windowTo: string;
  categories: Record<string, number>;
  residents: number;
  national: { total: number; residents: number } | null;
  sourceName: string;
  sourceDate: string;
}

export interface DistrictDataSource {
  postcodes(outward: string): Promise<DistrictPostcodeRow[]>;
  lsoaBases(lsoaCodes: string[]): Promise<DistrictBaseRow[]>;
  censusRows(msoaCodes: string[]): Promise<CensusFacts[]>;
  // The district LSOAs' filed IMD deciles (England's index;
  // Welsh and Scottish LSOAs file no decile here).
  imdDeciles(lsoaCodes: string[]): Promise<{
    deciles: { lsoaCode: string; decile: number }[];
    sourceName: string | null;
    sourceDate: string | null;
  }>;
  councilTax(council: string): Promise<DistrictCouncilTaxFacts | null>;
  soldFacts(outward: string): Promise<DistrictSoldFacts>;
  broadbandAnswers(outward: string): Promise<BroadbandAnswerPort[]>;
  mobileAnswers(outward: string): Promise<MobileAnswerPort[]>;
  schools(
    outward: string,
  ): Promise<{ rows: DistrictSchoolRow[]; sourceName: string | null; sourceDate: string | null }>;
  healthCounts(outward: string): Promise<{ serviceType: string; count: number }[]>;
  // Station names whose nearest filed postcode sits in
  // the district (see the header for the derivation).
  stations(outward: string): Promise<string[]>;
  // Homes in the picking index for the district (the
  // national preload's distinct homes, M7.15B).
  pickingHomes(outward: string): Promise<number>;
  // The district's filed place names: localities and post
  // towns from its sales rows and its picking index,
  // each with its filing count (the settlement filter
  // keeps the most-filed form of a name — BUG-034), the
  // counties its sales rows file (Price Paid's own county
  // column — the head chip's data, founder fix batch,
  // audit item 4), the county set the settlement filter
  // drops by (settlementCounties: the district's own
  // UNION every county filed anywhere in the register —
  // BUG-034 residual; counties above stays the district's
  // own alone, because the head chip names the district's
  // counties, not the nation's), and one filed postcode
  // per locality (the bridge's named-area links land on
  // it).
  places(outward: string): Promise<{
    localities: FiledPlaceName[];
    towns: FiledPlaceName[];
    counties: string[];
    settlementCounties: string[];
    settlementPostcodes: { locality: string; postcode: string }[];
  }>;
  floodFacts(layer: FloodLayerType, postcodes: string[]): Promise<DistrictFloodFacts>;
  // The distinct watercourses of filed flood defences
  // within the standard serving radius of the given
  // postcodes' points — the only filed corridor names.
  defenceWatercourses(postcodes: string[]): Promise<string[]>;
  // The distinct modelled air squares the given postcodes
  // resolve to (each postcode's nearest square within
  // 1 km — the area brain's own read), with the filing's
  // stamp.
  airSquares(postcodes: string[]): Promise<{
    squares: DistrictAirSquare[];
    sourceName: string | null;
    sourceDate: string | null;
  }>;
  crimeFacts(outward: string): Promise<DistrictCrimeFacts | null>;
}

// The Ofcom answer shapes, re-declared at the port so this
// brain does not reach into the area bundle's internals:
// the filed JSON's own fields the district forms read.
export interface BroadbandAnswerPort {
  basis: string;
  snapshot: string;
  gigabitCapablePct: number;
  superfast30Pct: number;
}

export interface MobileAnswerPort {
  lauaName: string;
  snapshot: string;
  // The 4G outdoor at-least-one-operator share for the
  // area, or null where Ofcom does not publish it.
  fourGOutdoorAtLeastOnePct: number | null;
}

// ------------------------------------------------------------------
// Live warnings — composed at serve time, never filed.
// The district read of the EA feed: one geo-filtered call
// on the district's own spread (see the header), parsed
// with the flood brain's discipline — severity levels
// 1–3 only, level 4 never serves (D42).
// ------------------------------------------------------------------

export interface DistrictWarningItem {
  severity: string;
  severityLevel: number;
  // The flood area's published description — the name the
  // warning serves under.
  description: string;
  riverOrSea: string | null;
  // The flood area's own filed point in the feed, when it
  // carries one: the district filter keeps a warning whose
  // area point falls inside the district's spread, and
  // keeps a warning with no point (a warning is never
  // dropped for a missing coordinate — the fail direction
  // is toward showing it).
  latitude: number | null;
  longitude: number | null;
}

export interface DistrictWarningSource {
  warningsNear(latitude: number, longitude: number, distKm: number): Promise<DistrictWarningItem[]>;
}

// The EA flood-monitoring endpoint — the same one
// lib/flood.ts reads (FLOOD_WARNINGS_URL there); the two
// readers are pinned to the same service by the docs.
const DISTRICT_WARNINGS_URL = "https://environment.data.gov.uk/flood-monitoring/id/floods";
// The same cap as the flood brain's (FLOOD_WARNING_TIMEOUT_MS
// in lib/flood.ts), raised from 2s by the same fix batch
// (19 Nov 2026 — BUG-006): the EA API's first-hit latency
// runs past 2 seconds, so a 2-second cap aborted the
// lookup on effectively every first check. Raised with
// it to the full 10-second bound (founder ruling, 22 Nov
// 2026 — the measurement stands in lib/flood.ts).
const DISTRICT_WARNING_TIMEOUT_MS = 10000;

export function parseDistrictWarningItems(body: unknown): DistrictWarningItem[] {
  if (typeof body !== "object" || body === null)
    throw new Error("flood warnings response is not an object");
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) throw new Error("flood warnings response has no items list");
  return items.map((raw, index) => {
    if (typeof raw !== "object" || raw === null)
      throw new Error(`flood warning ${index} is not an object`);
    const item = raw as Record<string, unknown>;
    const floodArea =
      typeof item.floodArea === "object" && item.floodArea !== null
        ? (item.floodArea as Record<string, unknown>)
        : {};
    const { severity, severityLevel, description } = item;
    if (
      typeof severity !== "string" ||
      typeof severityLevel !== "number" ||
      typeof description !== "string"
    )
      throw new Error(`flood warning ${index} is missing a required field`);
    return {
      severity,
      severityLevel,
      description,
      riverOrSea: typeof floodArea.riverOrSea === "string" ? floodArea.riverOrSea : null,
      latitude: typeof floodArea.lat === "number" ? floodArea.lat : null,
      longitude: typeof floodArea.long === "number" ? floodArea.long : null,
    };
  });
}

export function createDistrictWarningSource(
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): DistrictWarningSource {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DISTRICT_WARNING_TIMEOUT_MS;
  return {
    async warningsNear(latitude, longitude, distKm) {
      const url = `${DISTRICT_WARNINGS_URL}?lat=${latitude}&long=${longitude}&dist=${distKm}&min-severity=3`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error(`flood warnings request failed: HTTP ${response.status}`);
        return parseDistrictWarningItems(await response.json());
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// ------------------------------------------------------------------
// Served shapes
// ------------------------------------------------------------------

export interface DistrictHead {
  outward: string;
  postcodeCount: number;
  lsoaCount: number;
  msoaCount: number;
  councils: string[];
  // The district's counties as filed in its sales rows
  // (display form, sorted) — the sample's first head chip
  // is the county (founder fix batch, audit item 4). The
  // region below stays: the journey counting collapses
  // the nation from it.
  counties: string[];
  postTown: string | null;
  region: string | null;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

export interface DistrictItselfSection {
  state: "served" | "not-filed";
  settlements: string[];
  settlementsCount: number;
  homes: number | null;
  residents: number | null;
  households: number | null;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

export interface DistrictCensusSection {
  state: "served" | "not-filed";
  line: string | null;
  msoaCount: number;
  residentsTotal: number | null;
  householdsTotal: number | null;
  medianAge: { value: number; calculated: true } | null;
  socialRented: { count: number; total: number; pct: number } | null;
  tables: CensusTableServed[];
  // The summed single years of age (ts007), the view's
  // age-mix line is composed from these.
  ageYears: number[] | null;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

export interface DistrictCrimeSection {
  state: "served" | "not-filed";
  // The section's own honest line when no district total
  // can be filed (see the header's premise check).
  line: string | null;
  total: number | null;
  windowLine: string | null;
  per1000: number | null;
  england: { englandPer1000: number; multiple: number | null; line: string } | null;
  categories: { slug: string; label: string; count: number }[];
  sourceName: string | null;
  sourceLine: string | null;
}

export interface DistrictSoldSection {
  state: "served" | "not-filed";
  count: number;
  // The distinct postcodes the counted sales span, of
  // the district's postcodeCount in the head: the view
  // names the coverage whenever it is partial, so one
  // postcode's sales are never presented as the
  // district's (fix batch, 19 Nov 2026 — BUG-016).
  postcodesCovered: number;
  median: number | null;
  fromDate: string | null;
  toDate: string | null;
  spanLine: string | null;
  types: { code: string; label: string; count: number; median: number }[];
  foldedTypeCount: number;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

export interface DistrictDeprivationSection {
  state: "served" | "not-filed" | "not-covered";
  line: string | null;
  // Areas counted per decile, index 0 = decile 1.
  counts: number[];
  areasCounted: number;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

export interface DistrictCouncilTaxSection {
  state: "served" | "not-filed";
  councils: {
    authorityName: string;
    taxYear: string;
    bandDAreaAveragePence: number;
    parishAveraged: boolean;
    sourceLine: string | null;
  }[];
  unfiledCouncils: string[];
}

export interface DistrictConnectivitySection {
  state: "served" | "not-filed";
  broadband: {
    postcodesCounted: number;
    gigabitMeanPct: number;
    superfastMeanPct: number;
    snapshot: string;
  } | null;
  mobile: { areas: { lauaName: string; fourGOutdoorAtLeastOnePct: number | null }[] } | null;
  sourceLine: string | null;
}

export interface DistrictSchoolsSection {
  state: "served" | "not-filed";
  counted: number;
  primary: number;
  secondary: number;
  allThrough: number;
  post16: number;
  otherPhase: number;
  grammar: number;
  ofsted: { rating: string; count: number }[];
  notYetInspected: number;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

export interface DistrictEverydaySection {
  state: "served" | "not-filed";
  gp: number;
  dentists: number;
  pharmacies: number;
  stations: string[];
}

export interface DistrictFloodBlock {
  layer: "rofrs" | "rofsw";
  title: string;
  counted: number;
  buckets: { label: string; definition: string | null; count: number; pct: number }[];
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

export interface DistrictFloodSection {
  state: "served" | "not-filed" | "not-covered";
  line: string | null;
  countedPostcodes: number;
  riversSea: DistrictFloodBlock | null;
  surfaceWater: DistrictFloodBlock | null;
  // A layer that is filed but does not cover this
  // district serves its own not-filed line in its block's
  // place (audit item 14) — present only in that case;
  // the block above is null then, and where both layers
  // are uncovered the whole section takes the not-filed
  // state with the district-scoped line.
  riversSeaNotCoveredLine: string | null;
  surfaceWaterNotCoveredLine: string | null;
  // The planning zones inside the rivers & sea block:
  // shares of the counted postcodes in Zone 3 / Zone 2.
  zones: { zone3Pct: number; zone2Pct: number } | null;
  watercourses: string[];
  warnings: {
    state: "warnings" | "none" | "unavailable";
    areas: { severity: string; description: string }[];
    line: string;
  };
  honestyLine: string;
}

export interface DistrictAirSection {
  state: "served" | "not-filed";
  squaresCounted: number;
  year: number | null;
  no2: { min: number; max: number } | null;
  pm25: { min: number; max: number } | null;
  pm10: { min: number; max: number } | null;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

export interface DistrictSections {
  district: DistrictItselfSection;
  census: DistrictCensusSection;
  crime: DistrictCrimeSection;
  soldPrices: DistrictSoldSection;
  deprivation: DistrictDeprivationSection;
  councilTax: DistrictCouncilTaxSection;
  connectivity: DistrictConnectivitySection;
  schools: DistrictSchoolsSection;
  everyday: DistrictEverydaySection;
  flood: DistrictFloodSection;
  air: DistrictAirSection;
  bridge: {
    postcodes: string[];
    // One filed postcode per cleaned settlement (the
    // bridge's named-area links, founder fix batch, audit
    // item 5): the settlement's display name and a filed
    // postcode that lands in it.
    settlementPostcodes: { name: string; postcode: string }[];
  };
}

export type DistrictBundle =
  | {
      kind: "district";
      outward: string;
      head: DistrictHead;
      sections: DistrictSections;
    }
  | {
      kind: "not-covered";
      outward: string;
      nation: "scotland" | "northern-ireland";
    };

// ------------------------------------------------------------------
// The builder
// ------------------------------------------------------------------

const CRIME_NOT_FILED_LINE =
  "Crime is counted around an exact postcode: Police.uk counts the crimes recorded within 1 mile of a postcode's point, and those circles overlap each other, so adding them across a district would count the same crimes again and again. There is no district crime total that does not double-count, so this page does not print one — check a full postcode in the district for its own crime answer.";

const FLOOD_HONESTY_LINE =
  "District shares describe the district — most postcodes in a district can sit outside the mapped bands while one street sits inside them. The exact home's own check is the one that decides for a home.";

const FLOOD_NOT_COVERED_LINE =
  "Flood answers are not covered for Wales — the Environment Agency's flood maps cover England only, and flood maps for Wales are published by Natural Resources Wales.";

const DEPRIVATION_NOT_COVERED_LINE =
  "The deprivation spread is England's index — the district's small areas sit outside its coverage, and Wales and Scotland publish their own indices on their own scales.";

// The canonical list of Police.uk's 14 published crime
// categories, in slug form — the set the report's
// by-category chart zero-fills to (M8.2, founder ruling:
// all 14 categories shown in full, zero counts served as
// recorded zeroes, D24). The fifteenth key in the label
// table below, "unknown", is NOT one of the 14: it is the
// loader's filing bucket for records with no published
// category, served only where it carries a count, and
// never zero-filled.
export const CRIME_CATEGORY_SLUGS: readonly string[] = [
  "anti-social-behaviour",
  "bicycle-theft",
  "burglary",
  "criminal-damage-arson",
  "drugs",
  "other-crime",
  "other-theft",
  "possession-of-weapons",
  "public-order",
  "robbery",
  "shoplifting",
  "theft-from-the-person",
  "vehicle-crime",
  "violent-crime",
];

// Police.uk's published category names for its slugs — the
// publisher's own vocabulary, as the home page's breakdown
// serves it. A slug the table does not hold serves in its
// title-cased slug form rather than not at all.
const CRIME_CATEGORY_LABELS: Record<string, string> = {
  "anti-social-behaviour": "Anti-social behaviour",
  "bicycle-theft": "Bicycle theft",
  burglary: "Burglary",
  "criminal-damage-arson": "Criminal damage and arson",
  drugs: "Drugs",
  "other-crime": "Other crime",
  "other-theft": "Other theft",
  "possession-of-weapons": "Possession of weapons",
  "public-order": "Public order",
  robbery: "Robbery",
  shoplifting: "Shoplifting",
  "theft-from-the-person": "Theft from the person",
  "vehicle-crime": "Vehicle crime",
  "violent-crime": "Violence and sexual offences",
  unknown: "Category not published",
};

export function crimeCategoryLabel(slug: string): string {
  return (
    CRIME_CATEGORY_LABELS[slug] ??
    slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  D: "Detached",
  S: "Semi-detached",
  T: "Terraced",
  F: "Flat / maisonette",
  O: "Other",
};

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

type NationLetter = "E" | "W" | "S" | "N" | null;

function nationLetterOf(lsoaCode: string | null): NationLetter {
  const letter = (lsoaCode ?? "").charAt(0);
  return letter === "E" || letter === "W" || letter === "S" || letter === "N" ? letter : null;
}

interface CensusFragmentShape {
  total: number;
  bands?: Record<string, number>;
  years?: number[];
  groups?: Record<string, number>;
  categories?: Record<string, number>;
  social_rented?: number;
}

// Sum census fragments across areas: every filed count is
// an integer count of people or households, so the sum is
// the district's own count — totals, per-label counts,
// single years of age and the social-rented count all sum
// the same way. A fragment an area does not file adds
// nothing; a table no area files stays absent.
function sumCensusStats(rows: CensusFacts[]): Record<string, CensusFragmentShape> {
  const summed: Record<string, CensusFragmentShape> = {};
  for (const row of rows) {
    const stats = row.stats as Record<string, CensusFragmentShape>;
    for (const [code, fragment] of Object.entries(stats)) {
      if (!fragment || typeof fragment.total !== "number") continue;
      const target = (summed[code] ??= { total: 0 });
      target.total += fragment.total;
      for (const key of ["bands", "groups", "categories"] as const) {
        const counts = fragment[key];
        if (!counts) continue;
        const into = (target[key] ??= {});
        for (const [label, count] of Object.entries(counts)) {
          if (typeof count === "number") into[label] = (into[label] ?? 0) + count;
        }
      }
      if (Array.isArray(fragment.years)) {
        const years = (target.years ??= []);
        fragment.years.forEach((count, age) => {
          if (typeof count === "number") years[age] = (years[age] ?? 0) + count;
        });
      }
      if (typeof fragment.social_rented === "number") {
        target.social_rented = (target.social_rented ?? 0) + fragment.social_rented;
      }
    }
  }
  return summed;
}

const CENSUS_TABLE_TITLES: Record<string, string> = {
  ts007a: "Age by five-year age bands",
  ts021: "Ethnic group",
  ts030: "Religion",
  ts044: "Accommodation type",
  ts052: "Occupancy rating for bedrooms",
  ts054: "Tenure",
};

// A filed locality that is not a settlement name (founder
// fix batch, 19 Nov 2026 — audit item 9). The sales
// filing's locality column carries fragments beside real
// settlements: a postcode filed as a locality (the
// audit's EX2 witness, "Ex2 7ub"), split-address
// fragments carrying their comma, and council authority
// names in their full form ("Braintree District
// Council"). Those are filtered at the derivation, here —
// the filed rows themselves are untouched. A settlement
// that merely shares its council's short name (Exeter,
// Maldon) is honestly a settlement and stays: the filter
// takes the mechanically identifiable fragments and the
// full authority forms, never a bare town name.
const SETTLEMENT_POSTCODE_RE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?(?:\s+\d[A-Za-z]{2})?$/;

export function isSettlementName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (trimmed.includes(",")) return false;
  if (SETTLEMENT_POSTCODE_RE.test(trimmed)) return false;
  if (/council$/i.test(trimmed)) return false;
  return true;
}

// The comparison form of a filed name: case, spacing
// and punctuation flattened, so two filings that differ
// only in dress ("BURNHAM-ON-CROUCH", "Burnham on
// Crouch") compare as the same name.
function settlementKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// A county is never a settlement, and neither is the
// truncated filing of one (BUG-034, founder ruling
// 20 Nov 2026): the register's locality column
// sometimes files the county itself among a district's
// settlements ("Essex" in CM1) or a cut-off form of it
// ("Ess"). The county set the caller passes — the
// district's own filed counties UNION every county
// filed anywhere in the register (BUG-034 residual:
// a district whose own rows file no county must not
// let the county through) — names what to drop: a
// name equal to a county, or a strict prefix of one,
// at least three letters long and at least two letters
// short of the whole (a fragment; a real name that
// merely opens the same way is longer than that or is
// the county's equal in full only where it truly is
// the county). The comparison runs on settlementKey
// forms on both sides, so the filed dress never
// matters: an upper-case "ESSEX" from the picking
// index drops against a title-case "Essex" from the
// register, and the reverse.
function isCountyForm(key: string, countyKeys: Set<string>): boolean {
  for (const county of countyKeys) {
    if (key === county) return true;
    if (key.length >= 3 && county.length - key.length >= 2 && county.startsWith(key)) return true;
  }
  return false;
}

// The edit distance between two comparison forms, with
// an adjacent transposition costing one edit — the
// register's misspellings are substitutions, dropped or
// added letters and swapped neighbours ("Chemlsford"
// is Chelmsford with two letters swapped).
function editDistance(a: string, b: string): number {
  const table: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) table[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      table[i][j] = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1, table[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        table[i][j] = Math.min(table[i][j], table[i - 2][j - 2] + 1);
      }
    }
  }
  return table[a.length][b.length];
}

// Two filed forms are spellings of one settlement when
// they are near-identical (BUG-034): same opening
// letter, close in length, and within a small edit
// distance — one edit for a short name, two for a
// longer one. The leash is deliberately tight: two
// edits in a short name is a different place, not a
// typo, and distinct settlements (Springfield and
// Broomfield; Great Baddow and Little Baddow) sit far
// outside it. When in doubt the filter keeps both.
function areSpellingVariants(a: string, b: string): boolean {
  if (a === b || a.length < 4 || b.length < 4) return false;
  if (a[0] !== b[0]) return false;
  if (Math.abs(a.length - b.length) > 2) return false;
  const distance = editDistance(a, b);
  return Math.min(a.length, b.length) < 8 ? distance <= 1 : distance <= 2;
}

// One filed place name and how many filings stand
// behind it (sales rows for a locality or post town;
// sales plus picking-index rows for a post town in the
// place page's read). The counts are what let the
// filter below keep the MOST-FILED form of a name, as
// the founder ruled — a misspelling is by construction
// the rarely-filed form.
export interface FiledPlaceName {
  name: string;
  filings: number;
}

// A variant cluster keeps ONE filed form (BUG-034,
// founder ruling 20 Nov 2026): the most-filed form —
// the spelling the register itself uses most — with
// deterministic tie-breaks that never depend on
// filing order (the form closest to the spellings it
// would absorb, then the longer form, then the first
// alphabetically). Each representative claims only
// the names that are variants of ITSELF, never of a
// fellow member — a chain of near-misses cannot walk
// the cluster into a different settlement.
function collapseSpellingVariants(
  entries: { display: string; key: string; filings: number }[],
): string[] {
  // Standing: a form's total edit distance to the
  // variants around it. The true spelling sits at the
  // cluster's centre (every typo is one edit from it,
  // and two from each other); a misspelling sits at
  // its edge.
  const standing = entries.map((entry, i) =>
    entries.reduce(
      (total, other, j) =>
        i !== j && areSpellingVariants(entry.key, other.key)
          ? total + editDistance(entry.key, other.key)
          : total,
      0,
    ),
  );
  const order = entries
    .map((_, i) => i)
    .sort(
      (x, y) =>
        entries[y].filings - entries[x].filings ||
        standing[x] - standing[y] ||
        entries[y].key.length - entries[x].key.length ||
        (entries[x].display < entries[y].display ? -1 : 1),
    );
  const claimed = new Set<number>();
  const kept: string[] = [];
  for (const i of order) {
    if (claimed.has(i)) continue;
    claimed.add(i);
    kept.push(entries[i].display);
    for (let j = 0; j < entries.length; j++) {
      if (!claimed.has(j) && areSpellingVariants(entries[i].key, entries[j].key)) claimed.add(j);
    }
  }
  return kept;
}

// The district's cleaned settlement set: display form,
// fragments filtered, county forms dropped, spelling
// variants collapsed to one filed form, deduped,
// sorted — the one set the district section's pills
// and the bridge's named links both read, so the two
// surfaces can never disagree about what the district's
// settlements are.
// Exported for one second consumer: the place page's
// per-district area descriptions (lib/server/places.ts)
// clean the same filed names through the same filter,
// so a settlement the district page would not name is
// never named on the place page either. The caller
// passes the county set to drop by: the district's own
// filed counties UNION every county filed anywhere in
// the register (BUG-034 residual).
export function cleanSettlements(filedNames: FiledPlaceName[], counties: string[] = []): string[] {
  const countyKeys = new Set(counties.map(settlementKey).filter((key) => key.length > 0));
  const byKey = new Map<string, { display: string; key: string; filings: number }>();
  for (const filed of filedNames) {
    const display = displayText(filed.name);
    if (!isSettlementName(display)) continue;
    const key = settlementKey(display);
    if (isCountyForm(key, countyKeys)) continue;
    // Two filings in different dress share a key: their
    // filings add up behind one name, and the
    // alphabetically first display stands, so the
    // choice never depends on filing order.
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, { display, key, filings: filed.filings });
    } else {
      existing.filings += filed.filings;
      if (display < existing.display) existing.display = display;
    }
  }
  return collapseSpellingVariants([...byKey.values()]).sort();
}

export interface DistrictBundleOptions {
  warningSource?: DistrictWarningSource;
}

// The live-warnings composition, lifted out of the
// builder (founder fix batch, 19 Nov 2026): the district
// cache stores the filed bundle with NO warnings in it —
// live warnings are never cached (the flood brain's D42
// rule) — so the composition has to be callable on its
// own, over a bundle the cache already holds, from the
// district's English postcode rows and a warnings source.
// The builder calls it the same way when it builds
// fresh. The filter is the district's own spread: the
// centroid of its English postcode points and the
// farthest point's distance from it, both computed from
// the filed rows.
export async function composeDistrictWarnings(
  outward: string,
  englishPostcodes: { latitude: number; longitude: number }[],
  warningSource: DistrictWarningSource,
): Promise<DistrictFloodSection["warnings"]> {
  const unavailable: DistrictFloodSection["warnings"] = {
    state: "unavailable",
    areas: [],
    line: "Live flood warnings could not be checked just now.",
  };
  if (englishPostcodes.length === 0) return unavailable;
  const centroid = {
    latitude:
      englishPostcodes.reduce((sum, row) => sum + row.latitude, 0) / englishPostcodes.length,
    longitude:
      englishPostcodes.reduce((sum, row) => sum + row.longitude, 0) / englishPostcodes.length,
  };
  const spreadKm = Math.max(0, ...englishPostcodes.map((row) => haversineKm(centroid, row)));
  const distKm = Math.max(5, Math.ceil(spreadKm) + 3);
  try {
    const items = await warningSource.warningsNear(centroid.latitude, centroid.longitude, distKm);
    const live = items
      .filter((item) => item.severityLevel >= 1 && item.severityLevel <= 3)
      .filter((item) => {
        // A warning with no filed point cannot be
        // distance-checked; it is kept (the EA item
        // carries no coordinates to exclude it by).
        if (item.latitude === null || item.longitude === null) return true;
        return (
          haversineKm(centroid, { latitude: item.latitude, longitude: item.longitude }) <=
          spreadKm + 5
        );
      })
      .sort(
        (a, b) => a.severityLevel - b.severityLevel || a.description.localeCompare(b.description),
      );
    const seen = new Set<string>();
    const areas: { severity: string; description: string }[] = [];
    for (const item of live) {
      if (seen.has(item.description)) continue;
      seen.add(item.description);
      areas.push({ severity: item.severity, description: item.description });
    }
    return areas.length > 0
      ? {
          state: "warnings",
          areas,
          line: `${areas.length} live flood ${areas.length === 1 ? "warning is" : "warnings are"} in force for areas in or around ${outward} just now.`,
        }
      : {
          state: "none",
          areas: [],
          line: `No live flood warnings are in force for areas in or around ${outward} just now.`,
        };
  } catch {
    return unavailable;
  }
}

// The warnings form a stored district bundle carries:
// the filed answer with the live block stripped to its
// unavailable placeholder (the district cache's stored
// form — see lib/district-cache.ts).
export const DISTRICT_WARNINGS_UNAVAILABLE: DistrictFloodSection["warnings"] = {
  state: "unavailable",
  areas: [],
  line: "Live flood warnings could not be checked just now.",
};

// BUG-171: the build, staged. startDistrictBuild fires
// the same reads buildDistrictBundle always fired, but
// each section composes as its own reads land and is
// exposed as a promise of its own, so the district
// checking screen's per-group parts can each settle on
// their own slice of the one build instead of every
// group waiting for the slowest read in the district.
// buildDistrictBundle (below) is the staged build's
// bundle promise: every existing caller sees exactly
// the bundle it always saw, from the same reads,
// composed by the same code in the same words.

export type DistrictSettlement =
  { kind: "district" } | { kind: "not-covered"; nation: "scotland" | "northern-ireland" };

// The staged build's working record: one composer
// promise per section, plus the head's.
interface DistrictWork {
  headP: Promise<DistrictHead>;
  districtP: Promise<{
    section: DistrictItselfSection;
    settlementPostcodes: { name: string; postcode: string }[];
  }>;
  censusP: Promise<DistrictCensusSection>;
  crimeP: Promise<DistrictCrimeSection>;
  soldPricesP: Promise<DistrictSoldSection>;
  deprivationP: Promise<DistrictDeprivationSection>;
  councilTaxP: Promise<DistrictCouncilTaxSection>;
  connectivityP: Promise<DistrictConnectivitySection>;
  schoolsP: Promise<DistrictSchoolsSection>;
  everydayP: Promise<DistrictEverydaySection>;
  floodP: Promise<DistrictFloodSection>;
  airP: Promise<DistrictAirSection>;
  bridgeP: Promise<DistrictSections["bridge"]>;
}

export interface DistrictBuild {
  // Resolves from the postcode-directory read alone:
  // the Scotland / Northern Ireland gate never waits
  // for the district's data reads (BUG-017's rule, kept).
  settlement: Promise<DistrictSettlement>;
  // The district branch's head and sections, each
  // settling as its own reads land. On the not-covered
  // branch these reject — a caller reads settlement
  // first, exactly as payload builders have always
  // branched on the bundle's kind before touching it.
  head: Promise<DistrictHead>;
  sections: { [K in keyof DistrictSections]: Promise<DistrictSections[K]> };
  bundle: Promise<DistrictBundle>;
}

// BUG-300: the Straddles chip's join — commas
// between the names, " & " before the last one, so
// three or more names never read "A & B & C". Two
// names keep the plain "A & B"; one name stands alone.
export function joinStraddlingNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function startDistrictBuild(
  outward: string,
  source: DistrictDataSource,
  options: DistrictBundleOptions = {},
): DistrictBuild {
  const gate = (async () => {
    const postcodes = await source.postcodes(outward);
    const letters = new Set(postcodes.map((row) => nationLetterOf(row.lsoaCode)));
    // Scotland / Northern Ireland districts: the old
    // rung-3 behaviour stands whole (Phase 3 owns their
    // coverage).
    const nation: "scotland" | "northern-ireland" | null =
      !letters.has("E") && !letters.has("W") && (letters.has("S") || letters.has("N"))
        ? letters.has("S")
          ? "scotland"
          : "northern-ireland"
        : null;
    return { postcodes, letters, nation };
  })();
  const settlement: Promise<DistrictSettlement> = gate.then(({ nation }) =>
    nation ? { kind: "not-covered", nation } : { kind: "district" },
  );

  // The working build, present only on the district
  // branch: the derived code lists, the reads (fired
  // together, exactly as the one Promise.all fired
  // them), and one composer promise per section.
  const work: Promise<DistrictWork | null> = gate.then(({ postcodes, letters, nation }) => {
    if (nation) return null;
    const hasEnglish = letters.has("E");

    const englishPostcodes = postcodes.filter((row) => nationLetterOf(row.lsoaCode) === "E");
    const ewPostcodes = postcodes.filter((row) => {
      const letter = nationLetterOf(row.lsoaCode);
      return letter === "E" || letter === "W";
    });
    const lsoaCodes = [
      ...new Set(postcodes.map((row) => row.lsoaCode).filter((c): c is string => !!c)),
    ];
    const englishLsoaCodes = [
      ...new Set(englishPostcodes.map((row) => row.lsoaCode).filter((c): c is string => !!c)),
    ];
    const msoaCodes = [
      ...new Set(ewPostcodes.map((row) => row.msoaCode).filter((c): c is string => !!c)),
    ];
    const councils = [
      ...new Set(postcodes.map((row) => row.council).filter((c): c is string => !!c)),
    ].sort();
    const regions = [
      ...new Set(postcodes.map((row) => row.region).filter((c): c is string => !!c)),
    ];
    const stamp = postcodes.find((row) => row.sourceName) ?? null;

    const basesR = source.lsoaBases(lsoaCodes);
    const censusRowsR = source.censusRows(msoaCodes);
    const imdR = source.imdDeciles(englishLsoaCodes);
    const soldR = source.soldFacts(outward);
    const broadbandR = source.broadbandAnswers(outward);
    const mobileR = source.mobileAnswers(outward);
    const schoolsFactsR = source.schools(outward);
    const healthR = source.healthCounts(outward);
    const stationNamesR = source.stations(outward);
    const homesR = source.pickingHomes(outward);
    const placesR = source.places(outward);
    const crimeR = source.crimeFacts(outward);
    const rofrsR = hasEnglish
      ? source.floodFacts(
          "rofrs",
          englishPostcodes.map((row) => row.postcode),
        )
      : Promise.resolve(null);
    const rofswR = hasEnglish
      ? source.floodFacts(
          "rofsw",
          englishPostcodes.map((row) => row.postcode),
        )
      : Promise.resolve(null);
    const zoneR = hasEnglish
      ? source.floodFacts(
          "flood_zone",
          englishPostcodes.map((row) => row.postcode),
        )
      : Promise.resolve(null);
    const watercoursesR = hasEnglish
      ? source.defenceWatercourses(englishPostcodes.map((row) => row.postcode))
      : Promise.resolve([] as string[]);
    const airFactsR = source.airSquares(postcodes.map((row) => row.postcode));
    const councilTaxRowsR = Promise.all(
      councils.map(async (council) => ({ council, facts: await source.councilTax(council) })),
    );

    const headP: Promise<DistrictHead> = (async () => {
      const places = await placesR;
      return {
        outward,
        postcodeCount: postcodes.length,
        lsoaCount: lsoaCodes.length,
        msoaCount: msoaCodes.length,
        councils,
        // BUG-307: the head's county is the district's
        // sales rows' majority vote — places.counties is
        // ranked most-filed first, and the head takes
        // only the first. Price Paid's county column is
        // unreliable row by row (CM3's rows file Luton,
        // Southend-on-sea, Thurrock and West Sussex
        // alongside Essex); naming them all in the chip
        // would name the wrong counties. The full union
        // still rides in settlementCounties for the
        // settlement filter — only the chip's county
        // narrows to the vote.
        counties: places.counties.length > 0 ? [displayText(places.counties[0])] : [],
        postTown: places.towns[0] ? displayText(places.towns[0].name) : null,
        region: regions[0] ?? null,
        sourceName: stamp?.sourceName ?? null,
        sourceDate: stamp?.sourceDate ?? null,
        sourceLine: sourceLineOf(stamp?.sourceName ?? null, stamp?.sourceDate ?? null),
      };
    })();

    // 1 — The district itself. The filter drops by the
    // union set (places.settlementCounties), never the
    // district's own counties alone (BUG-034 residual) —
    // the head above keeps only the most-filed county
    // for its chip (BUG-307). The composer also yields the
    // bridge's settlement postcodes, which ride its
    // result until the bundle assembles.
    const districtP: Promise<{
      section: DistrictItselfSection;
      settlementPostcodes: { name: string; postcode: string }[];
    }> = (async () => {
      const [places, bases, homes, head] = await Promise.all([placesR, basesR, homesR, headP]);
      const settlementsRaw = places.localities.length > 0 ? places.localities : places.towns;
      const settlements = cleanSettlements(settlementsRaw, places.settlementCounties);
      // The bridge's named links ride the same cleaned set:
      // one filed postcode per settlement, from the sales
      // rows that filed the locality.
      const settlementPostcodes = settlements
        .map((name) => {
          const filed = places.settlementPostcodes.find(
            (row) => displayText(row.locality) === name,
          );
          return filed ? { name, postcode: filed.postcode } : null;
        })
        .filter((row): row is { name: string; postcode: string } => row !== null);
      const residents =
        bases.length > 0 ? bases.reduce((sum, row) => sum + row.residents, 0) : null;
      const households =
        bases.length > 0 ? bases.reduce((sum, row) => sum + row.households, 0) : null;
      const district: DistrictItselfSection = {
        state: settlements.length > 0 || residents !== null ? "served" : "not-filed",
        settlements,
        settlementsCount: settlements.length,
        homes: homes > 0 ? homes : null,
        residents,
        households,
        sourceName: head.sourceName,
        sourceDate: head.sourceDate,
        // BUG-360: the head's stamp names the Postcode Directory,
        // but the section's residents are Census 2021 counts
        // reached via the Directory's postcode-to-area mapping —
        // name the Census in the section's basis line.
        sourceLine:
          stamp?.sourceName && stamp?.sourceDate
            ? `Census 2021, via the ${stamp.sourceName}'s postcode-to-area mapping — data to ${dateLabel(stamp.sourceDate)}`
            : head.sourceLine,
      };
      return { section: district, settlementPostcodes };
    })();

    // 2 — Census, summed across the district's MSOAs.
    const censusP: Promise<DistrictCensusSection> = (async () => {
      const censusFactsRows = await censusRowsR;
      let census: DistrictCensusSection;
      if (censusFactsRows.length === 0) {
        census = {
          state: "not-filed",
          line: "Census 2021 figures are not filed for this district's areas.",
          msoaCount: 0,
          residentsTotal: null,
          householdsTotal: null,
          medianAge: null,
          socialRented: null,
          tables: [],
          ageYears: null,
          sourceName: null,
          sourceDate: null,
          sourceLine: null,
        };
      } else {
        const stats = sumCensusStats(censusFactsRows);
        const tables: CensusTableServed[] = [];
        for (const code of Object.keys(CENSUS_TABLE_TITLES)) {
          const fragment = stats[code];
          if (!fragment) continue;
          const rowsSource = fragment.categories ?? fragment.bands ?? fragment.groups ?? {};
          tables.push({
            code,
            title: CENSUS_TABLE_TITLES[code],
            total: fragment.total,
            rows: censusRows(rowsSource, fragment.total),
            groups:
              fragment.groups && fragment.categories
                ? censusRows(fragment.groups, fragment.total)
                : null,
          });
        }
        const years = stats.ts007?.years;
        const tenure = stats.ts054;
        const first = censusFactsRows[0];
        census = {
          state: "served",
          line: null,
          msoaCount: censusFactsRows.length,
          residentsTotal: stats.ts007a?.total ?? null,
          householdsTotal: stats.ts044?.total ?? null,
          medianAge:
            Array.isArray(years) && years.length > 0
              ? { value: round1(medianAgeOf(years)), calculated: true as const }
              : null,
          socialRented:
            tenure && typeof tenure.social_rented === "number"
              ? {
                  count: tenure.social_rented,
                  total: tenure.total,
                  pct: round1((tenure.social_rented / tenure.total) * 100),
                }
              : null,
          tables,
          ageYears: Array.isArray(years) && years.length > 0 ? years : null,
          sourceName: first.sourceName,
          sourceDate: first.sourceDate,
          sourceLine: sourceLineOf(first.sourceName, first.sourceDate),
        };
      }

      return census;
    })();

    // 3 — Crime (premise-checked: no district total is
    // filed today; the served form stands ready for one).
    const crimeP: Promise<DistrictCrimeSection> = (async () => {
      const crime = await crimeR;
      let crimeSection: DistrictCrimeSection;
      if (crime === null) {
        crimeSection = {
          state: "not-filed",
          line: CRIME_NOT_FILED_LINE,
          total: null,
          windowLine: null,
          per1000: null,
          england: null,
          categories: [],
          sourceName: null,
          sourceLine: null,
        };
      } else {
        const per1000 = crime.residents > 0 ? round1((crime.total / crime.residents) * 1000) : null;
        let england: DistrictCrimeSection["england"] = null;
        if (
          per1000 !== null &&
          crime.national &&
          crime.national.residents >= ENGLAND_BASE_MIN_RESIDENTS
        ) {
          const englandExact = (crime.national.total / crime.national.residents) * 1000;
          const englandPer1000 = round1(englandExact);
          let multiple: number | null = null;
          if (crime.total > 0 && englandExact > 0) {
            const candidate = round1(((crime.total / crime.residents) * 1000) / englandExact);
            if (candidate >= 0.1) multiple = candidate;
          }
          england = {
            englandPer1000,
            multiple,
            line:
              multiple === null
                ? `the England figure for the same 12 months is ${englandPer1000.toFixed(1)} recorded crimes per 1,000 residents`
                : `the England figure for the same 12 months is ${englandPer1000.toFixed(1)} recorded crimes per 1,000 residents — this district's figure is about ${multiple.toFixed(1)} times the England figure`,
          };
        }
        crimeSection = {
          state: "served",
          line: null,
          total: crime.total,
          windowLine: `${monthLabel(crime.windowFrom)} to ${monthLabel(crime.windowTo)}`,
          per1000,
          england,
          categories: Object.entries(crime.categories)
            .filter(([, count]) => count > 0)
            .map(([slug, count]) => ({ slug, label: crimeCategoryLabel(slug), count }))
            .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug)),
          sourceName: crime.sourceName,
          sourceLine: sourceLineOf(crime.sourceName, crime.sourceDate),
        };
      }

      return crimeSection;
    })();

    // 4 — Sold prices (category A only, D23).
    const soldPricesP: Promise<DistrictSoldSection> = (async () => {
      const sold = await soldR;
      const soldPricesAll = sold.rows.map((row) => row.price);
      const soldByType = new Map<string, number[]>();
      for (const row of sold.rows) {
        const code = row.propertyType ?? "O";
        const list = soldByType.get(code) ?? [];
        list.push(row.price);
        soldByType.set(code, list);
      }
      const typeRows: DistrictSoldSection["types"] = [];
      let foldedTypeCount = 0;
      for (const [code, prices] of [...soldByType.entries()].sort(
        (a, b) => b[1].length - a[1].length,
      )) {
        if (prices.length >= 5) {
          typeRows.push({
            code,
            label: PROPERTY_TYPE_LABELS[code] ?? "Other",
            count: prices.length,
            median: medianOf(prices),
          });
        } else {
          foldedTypeCount += prices.length;
        }
      }
      const soldDates = sold.rows.map((row) => row.saleDate).sort();
      const soldPrices: DistrictSoldSection = {
        state: sold.rows.length > 0 ? "served" : "not-filed",
        count: sold.rows.length,
        postcodesCovered: new Set(sold.rows.map((row) => row.postcode)).size,
        median: sold.rows.length >= 5 ? medianOf(soldPricesAll) : null,
        fromDate: soldDates[0] ?? null,
        toDate: soldDates[soldDates.length - 1] ?? null,
        spanLine:
          soldDates.length > 0
            ? `${dateLabel(soldDates[0])} to ${dateLabel(soldDates[soldDates.length - 1])}`
            : null,
        types: typeRows,
        foldedTypeCount,
        sourceName: sold.sourceName,
        sourceDate: sold.sourceDate,
        sourceLine: sourceLineOf(sold.sourceName, sold.sourceDate),
      };

      return soldPrices;
    })();

    // 5 — Deprivation: the spread of the district's English
    // small areas across the deciles. A spread, never a score.
    const deprivationP: Promise<DistrictDeprivationSection> = (async () => {
      const imd = await imdR;
      const decileCounts = new Array<number>(10).fill(0);
      for (const { decile } of imd.deciles) {
        if (decile >= 1 && decile <= 10) decileCounts[decile - 1] += 1;
      }
      const deprivation: DistrictDeprivationSection = !hasEnglish
        ? {
            state: "not-covered",
            line: DEPRIVATION_NOT_COVERED_LINE,
            counts: decileCounts,
            areasCounted: 0,
            sourceName: null,
            sourceDate: null,
            sourceLine: null,
          }
        : imd.deciles.length === 0
          ? {
              state: "not-filed",
              line: "Deprivation figures are not filed for this district's small areas.",
              counts: decileCounts,
              areasCounted: 0,
              sourceName: null,
              sourceDate: null,
              sourceLine: null,
            }
          : {
              state: "served",
              line: null,
              counts: decileCounts,
              areasCounted: imd.deciles.length,
              sourceName: imd.sourceName,
              sourceDate: imd.sourceDate,
              sourceLine: sourceLineOf(imd.sourceName, imd.sourceDate),
            };

      return deprivation;
    })();

    // 6 — Council tax: every council the district straddles.
    const councilTaxP: Promise<DistrictCouncilTaxSection> = (async () => {
      const councilTaxRows = await councilTaxRowsR;
      const filedCouncils = councilTaxRows.filter((row) => row.facts !== null);
      const councilTax: DistrictCouncilTaxSection = {
        state: filedCouncils.length > 0 ? "served" : "not-filed",
        councils: filedCouncils.map((row) => ({
          authorityName: (row.facts as DistrictCouncilTaxFacts).authorityName,
          taxYear: (row.facts as DistrictCouncilTaxFacts).taxYear,
          bandDAreaAveragePence: (row.facts as DistrictCouncilTaxFacts).bandDAreaAveragePence,
          parishAveraged: (row.facts as DistrictCouncilTaxFacts).parishAveraged,
          sourceLine: sourceLineOf(
            (row.facts as DistrictCouncilTaxFacts).sourceName,
            (row.facts as DistrictCouncilTaxFacts).sourceDate,
          ),
        })),
        unfiledCouncils: councilTaxRows
          .filter((row) => row.facts === null)
          .map((row) => row.council),
      };

      return councilTax;
    })();

    // 7 — Broadband & mobile.
    const connectivityP: Promise<DistrictConnectivitySection> = (async () => {
      const [broadband, mobile] = await Promise.all([broadbandR, mobileR]);
      const broadbandSection =
        broadband.length > 0
          ? {
              postcodesCounted: broadband.length,
              gigabitMeanPct: round1(
                broadband.reduce((sum, answer) => sum + answer.gigabitCapablePct, 0) /
                  broadband.length,
              ),
              superfastMeanPct: round1(
                broadband.reduce((sum, answer) => sum + answer.superfast30Pct, 0) /
                  broadband.length,
              ),
              snapshot: broadband[0].snapshot,
            }
          : null;
      const mobileAreas = new Map<string, number | null>();
      for (const answer of mobile) {
        if (!mobileAreas.has(answer.lauaName)) {
          mobileAreas.set(answer.lauaName, answer.fourGOutdoorAtLeastOnePct);
        }
      }
      const connectivity: DistrictConnectivitySection = {
        state: broadbandSection || mobileAreas.size > 0 ? "served" : "not-filed",
        broadband: broadbandSection,
        mobile:
          mobileAreas.size > 0
            ? {
                areas: [...mobileAreas.entries()].map(([lauaName, pct]) => ({
                  lauaName,
                  fourGOutdoorAtLeastOnePct: pct,
                })),
              }
            : null,
        sourceLine: broadbandSection
          ? `Ofcom Connected Nations — snapshot ${broadbandSection.snapshot}`
          : null,
      };

      return connectivity;
    })();

    // 8 — Schools.
    const schoolsP: Promise<DistrictSchoolsSection> = (async () => {
      const schoolsFacts = await schoolsFactsR;
      const schoolRows = schoolsFacts.rows;
      const ofstedCounts = new Map<string, number>();
      let notYetInspected = 0;
      for (const row of schoolRows) {
        if (row.ofstedRating) {
          ofstedCounts.set(row.ofstedRating, (ofstedCounts.get(row.ofstedRating) ?? 0) + 1);
        } else {
          notYetInspected += 1;
        }
      }
      const OFSTED_ORDER = ["Outstanding", "Good", "Requires improvement", "Inadequate"];
      const schools: DistrictSchoolsSection = {
        state: schoolRows.length > 0 ? "served" : "not-filed",
        counted: schoolRows.length,
        primary: schoolRows.filter((row) => row.phase === "Primary").length,
        secondary: schoolRows.filter((row) => row.phase === "Secondary").length,
        allThrough: schoolRows.filter((row) => row.phase === "All-through").length,
        post16: schoolRows.filter((row) => row.phase === "16 plus").length,
        otherPhase: schoolRows.filter(
          (row) => !["Primary", "Secondary", "All-through", "16 plus"].includes(row.phase ?? ""),
        ).length,
        grammar: schoolRows.filter((row) => row.selective && row.phase === "Secondary").length,
        ofsted: [
          ...OFSTED_ORDER.filter((rating) => ofstedCounts.has(rating)).map((rating) => ({
            rating,
            count: ofstedCounts.get(rating) as number,
          })),
          ...[...ofstedCounts.entries()]
            .filter(([rating]) => !OFSTED_ORDER.includes(rating))
            .map(([rating, count]) => ({ rating, count })),
        ],
        notYetInspected,
        sourceName: schoolsFacts.sourceName,
        sourceDate: schoolsFacts.sourceDate,
        sourceLine: sourceLineOf(schoolsFacts.sourceName, schoolsFacts.sourceDate),
      };

      return schools;
    })();

    // 9 — Everyday counts.
    const everydayP: Promise<DistrictEverydaySection> = (async () => {
      const [health, stationNames] = await Promise.all([healthR, stationNamesR]);
      const healthCount = (types: string[]) =>
        health
          .filter((row) => types.includes(row.serviceType))
          .reduce((sum, row) => sum + row.count, 0);
      const everyday: DistrictEverydaySection = {
        state: health.length > 0 || stationNames.length > 0 ? "served" : "not-filed",
        gp: healthCount(["gp_practice", "gp_branch_surgery"]),
        dentists: healthCount(["dentist"]),
        pharmacies: healthCount(["pharmacy"]),
        stations: stationNames,
      };

      return everyday;
    })();

    // 10 — Flood: the district roll-up.
    const floodP: Promise<DistrictFloodSection> = (async () => {
      const [rofrsFacts, rofswFacts, zoneFacts, watercourses] = await Promise.all([
        rofrsR,
        rofswR,
        zoneR,
        watercoursesR,
      ]);
      const floodBlock = (
        layer: "rofrs" | "rofsw",
        title: string,
        facts: DistrictFloodFacts | null,
      ): DistrictFloodBlock | null => {
        // The coverage guard (audit item 14): a layer filed
        // somewhere but covering nothing of this district
        // serves no block — its assignments would read null
        // end to end and print a computed "No band published
        // 100%". The section carries the layer's own
        // not-filed line in its place (below).
        if (!facts || facts.filedCount <= 0 || !facts.covered || facts.assignments.length === 0)
          return null;
        const counted = facts.assignments.length;
        const byLabel = new Map<string, number>();
        let unbanded = 0;
        for (const assignment of facts.assignments) {
          if (assignment.label)
            byLabel.set(assignment.label, (byLabel.get(assignment.label) ?? 0) + 1);
          else unbanded += 1;
        }
        const bandOrder =
          layer === "rofrs" ? ["High", "Medium", "Low", "Very low"] : ["High", "Medium", "Low"];
        const buckets: DistrictFloodBlock["buckets"] = [];
        for (const label of bandOrder) {
          const count = byLabel.get(label) ?? 0;
          buckets.push({
            label,
            definition: FLOOD_BAND_DEFINITIONS[label] ?? null,
            count,
            pct: round1((count / counted) * 100),
          });
        }
        buckets.push({
          label: layer === "rofrs" ? "No band published" : "Below the lowest published band",
          definition: null,
          count: unbanded,
          pct: round1((unbanded / counted) * 100),
        });
        return {
          layer,
          title,
          counted,
          buckets,
          sourceName: facts.sourceName,
          sourceDate: facts.sourceDate,
          sourceLine: sourceLineOf(facts.sourceName, facts.sourceDate),
        };
      };

      let flood: DistrictFloodSection;
      if (!hasEnglish) {
        flood = {
          state: "not-covered",
          line: FLOOD_NOT_COVERED_LINE,
          countedPostcodes: 0,
          riversSea: null,
          surfaceWater: null,
          riversSeaNotCoveredLine: null,
          surfaceWaterNotCoveredLine: null,
          zones: null,
          watercourses: [],
          warnings: { state: "unavailable", areas: [], line: "" },
          honestyLine: FLOOD_HONESTY_LINE,
        };
      } else {
        const riversSea = floodBlock("rofrs", "Flooding from rivers and the sea", rofrsFacts);
        const surfaceWater = floodBlock(
          "rofsw",
          "Flooding from surface water (heavy rain)",
          rofswFacts,
        );
        // A filed layer that does not cover this district
        // names itself in its block's place (audit item 14).
        const riversSeaNotCoveredLine =
          !riversSea && rofrsFacts && rofrsFacts.filedCount > 0 && !rofrsFacts.covered
            ? "The rivers and sea flood map is not filed for this district yet."
            : null;
        const surfaceWaterNotCoveredLine =
          !surfaceWater && rofswFacts && rofswFacts.filedCount > 0 && !rofswFacts.covered
            ? "The surface water flood map is not filed for this district yet."
            : null;
        let zones: DistrictFloodSection["zones"] = null;
        if (
          zoneFacts &&
          zoneFacts.filedCount > 0 &&
          zoneFacts.covered &&
          zoneFacts.assignments.length > 0
        ) {
          const counted = zoneFacts.assignments.length;
          const inZone = (label: string) =>
            zoneFacts.assignments.filter((a) => a.label === label).length;
          zones = {
            zone3Pct: round1((inZone("FZ3") / counted) * 100),
            zone2Pct: round1((inZone("FZ2") / counted) * 100),
          };
        }

        // Live warnings over the district's own spread,
        // composed fresh at serve time — never filed, never
        // cached (see composeDistrictWarnings).
        const warnings = options.warningSource
          ? await composeDistrictWarnings(outward, englishPostcodes, options.warningSource)
          : DISTRICT_WARNINGS_UNAVAILABLE;

        // The section's own line where nothing serves: the
        // district-scoped not-filed form where a filed layer
        // simply does not reach this district, the plain
        // not-filed form where the maps are not filed at all.
        const anyUncovered = [rofrsFacts, rofswFacts, zoneFacts].some(
          (facts) => facts && facts.filedCount > 0 && !facts.covered,
        );
        flood = {
          state: riversSea || surfaceWater ? "served" : "not-filed",
          line:
            riversSea || surfaceWater
              ? null
              : anyUncovered
                ? "The flood maps are not filed for this district yet, so no district flood answer can be given yet."
                : "The flood maps are not filed yet, so no district flood answer can be given yet.",
          countedPostcodes: englishPostcodes.length,
          riversSea,
          surfaceWater,
          riversSeaNotCoveredLine,
          surfaceWaterNotCoveredLine,
          zones,
          watercourses,
          warnings,
          honestyLine: FLOOD_HONESTY_LINE,
        };
      }

      return flood;
    })();

    // 11 — Air: the range across the district's squares.
    const airP: Promise<DistrictAirSection> = (async () => {
      const airFacts = await airFactsR;
      let air: DistrictAirSection;
      if (airFacts.squares.length === 0) {
        air = {
          state: "not-filed",
          squaresCounted: 0,
          year: null,
          no2: null,
          pm25: null,
          pm10: null,
          sourceName: null,
          sourceDate: null,
          sourceLine: null,
        };
      } else {
        const year = Math.max(...airFacts.squares.map((square) => square.year));
        const squares = airFacts.squares.filter((square) => square.year === year);
        const range = (pick: (square: DistrictAirSquare) => number) => ({
          min: Math.min(...squares.map(pick)),
          max: Math.max(...squares.map(pick)),
        });
        air = {
          state: "served",
          squaresCounted: squares.length,
          year,
          no2: range((square) => square.no2),
          pm25: range((square) => square.pm25),
          pm10: range((square) => square.pm10),
          sourceName: airFacts.sourceName,
          sourceDate: airFacts.sourceDate,
          sourceLine: sourceLineOf(airFacts.sourceName, airFacts.sourceDate),
        };
      }

      return air;
    })();

    return {
      headP,
      districtP,
      censusP,
      crimeP,
      soldPricesP,
      deprivationP,
      councilTaxP,
      connectivityP,
      schoolsP,
      everydayP,
      floodP,
      airP,
      bridgeP: districtP.then(({ settlementPostcodes }) => ({
        postcodes: postcodes.map((row) => row.postcode),
        settlementPostcodes,
      })),
    };
  });

  const bundle: Promise<DistrictBundle> = (async () => {
    const { nation } = await gate;
    if (nation) return { kind: "not-covered", outward, nation };
    const w = await work;
    if (!w) throw new Error("district build: the working build vanished on the district branch");
    const [
      head,
      districtPart,
      census,
      crime,
      soldPrices,
      deprivation,
      councilTax,
      connectivity,
      schools,
      everyday,
      flood,
      air,
      bridge,
    ] = await Promise.all([
      w.headP,
      w.districtP,
      w.censusP,
      w.crimeP,
      w.soldPricesP,
      w.deprivationP,
      w.councilTaxP,
      w.connectivityP,
      w.schoolsP,
      w.everydayP,
      w.floodP,
      w.airP,
      w.bridgeP,
    ]);
    return {
      kind: "district",
      outward,
      head,
      sections: {
        district: districtPart.section,
        census,
        crime,
        soldPrices,
        deprivation,
        councilTax,
        connectivity,
        schools,
        everyday,
        flood,
        air,
        bridge,
      },
    };
  })();

  const notCovered = (): Error =>
    new Error(`District ${outward} is not covered — it has no sections to settle`);
  const head: Promise<DistrictHead> = (async () => {
    const w = await work;
    if (!w) throw notCovered();
    return w.headP;
  })();
  const sectionOf = <T>(pick: (w: DistrictWork) => Promise<T>): Promise<T> =>
    (async () => {
      const w = await work;
      if (!w) throw notCovered();
      return pick(w);
    })();
  const sections: DistrictBuild["sections"] = {
    district: sectionOf((w) => w.districtP.then((part) => part.section)),
    census: sectionOf((w) => w.censusP),
    crime: sectionOf((w) => w.crimeP),
    soldPrices: sectionOf((w) => w.soldPricesP),
    deprivation: sectionOf((w) => w.deprivationP),
    councilTax: sectionOf((w) => w.councilTaxP),
    connectivity: sectionOf((w) => w.connectivityP),
    schools: sectionOf((w) => w.schoolsP),
    everyday: sectionOf((w) => w.everydayP),
    flood: sectionOf((w) => w.floodP),
    air: sectionOf((w) => w.airP),
    bridge: sectionOf((w) => w.bridgeP),
  };

  // A section nobody awaits must never surface as an
  // unhandled rejection (a checking part reads only its
  // own group's sections; the bundle awaits them all,
  // but a caller of the build alone may not): every
  // promise the build hands out carries a handled
  // branch, and awaiting the promise itself still
  // delivers the rejection to its real consumer.
  for (const promise of [settlement, bundle, head, ...Object.values(sections)]) {
    void promise.catch(() => {});
  }

  return { settlement, head, sections, bundle };
}

export async function buildDistrictBundle(
  outward: string,
  source: DistrictDataSource,
  options: DistrictBundleOptions = {},
): Promise<DistrictBundle> {
  return startDistrictBuild(outward, source, options).bundle;
}

// ------------------------------------------------------------------
// The database source — every read keyed by the outward
// code (a postcode's district is its outward code, so
// starts_with(postcode, '<outward> ') IS the membership
// test) or by code lists derived from the district's own
// filed postcode rows.
// ------------------------------------------------------------------

// The defences corridor query (founder fix batch,
// 19 Nov 2026 — audit Part 3). The form this replaces ran
// the geography ST_DWithin inside an EXISTS over every
// district postcode for every one of the 834 filed
// defences — measured at 8–10s of the district page's
// 12–14s. The corridor is now read in two stages: the
// candidate defences are first restricted by the
// district's bounding box, expanded by 0.06 degrees and
// tested with the && box operator the GiST index
// (migration 0024) serves; only those candidates pay the
// exact geography test, which is unchanged. The box is a
// strict superset of the corridor at every UK latitude:
// 3,218.688 m is at most 0.029 degrees of latitude, and
// at most 0.056 degrees of longitude at 58.7°N, the
// northernmost district latitude — so no defence the old
// form could return is filtered out, and the EXISTS leg
// still excludes every candidate the radius does not
// reach. Proven against real PostGIS in db/prove.mjs
// (both forms over the same fixtures, the same set out);
// pinned as a constant so the unit suite can hold the
// source to the exact form the proof runs.
export const DEFENCE_WATERCOURSES_SQL = `SELECT DISTINCT fd.water_course_name AS name
 FROM flood_defences fd,
      (SELECT ST_Expand(ST_Extent(geom), 0.06) AS box
       FROM postcode_cache WHERE postcode = ANY($1)) AS district
 WHERE fd.water_course_name IS NOT NULL AND fd.water_course_name <> ''
   AND fd.geom && district.box
   AND EXISTS (
     SELECT 1 FROM postcode_cache pc
     WHERE pc.postcode = ANY($1)
       AND ST_DWithin(fd.geom::geography, pc.geom::geography, 3218.688)
   )
 ORDER BY fd.water_course_name`;

// Every county filed anywhere in the sales register
// (BUG-034 residual, 20 Nov 2026): the settlement
// filter drops county forms by the set it is handed,
// and a district whose own sales rows file no county
// (the column is nullable and often unfiled) left the
// set empty — the county then stood as a settlement
// wherever the picking index had filed it as a town
// ("Essex" in CM11's and CM2's rows, proven live). The
// founder's rule is categorical — a county name is
// never a settlement — so the filter's set is the
// district's own counties UNION this register-wide
// set, composed in places() below.
//
// The set is small and closed (the register's county
// column holds a fixed vocabulary; a new county cannot
// appear without a new filing of the register), and
// price_paid carries no index on county, so the
// DISTINCT read is a register scan: it runs once per
// pool per process and is cached. The cache is
// anchored to globalThis (the sold-prices loads
// pattern) because the serving runtime does not share
// one module instance between routes, and keyed by the
// pool in a WeakMap, so the entry lives exactly as
// long as its pool. A failed read evicts itself, so a
// transient failure never poisons the process.
const districtCountiesGlobal = globalThis as typeof globalThis & {
  __cmnhDistrictAllCounties?: WeakMap<AddressQueryable, Promise<string[]>>;
};

function everyFiledCounty(db: AddressQueryable): Promise<string[]> {
  const cache = (districtCountiesGlobal.__cmnhDistrictAllCounties ??= new WeakMap<
    AddressQueryable,
    Promise<string[]>
  >());
  let pending = cache.get(db);
  if (pending === undefined) {
    pending = db
      .query("SELECT DISTINCT county FROM price_paid WHERE county IS NOT NULL")
      .then((result) => result.rows.map((row) => row.county as string));
    cache.set(db, pending);
    pending.catch(() => {
      if (cache.get(db) === pending) cache.delete(db);
    });
  }
  return pending;
}

export function createDistrictSource(db: AddressQueryable): DistrictDataSource {
  const prefixOf = (outward: string) => `${outward} `;
  return {
    async postcodes(outward) {
      const { rows } = await db.query(
        `SELECT postcode, latitude, longitude, council, region, lsoa_code, msoa_code,
                source_name, source_date::text AS source_date
         FROM postcode_cache WHERE starts_with(postcode, $1) ORDER BY postcode`,
        [prefixOf(outward)],
      );
      return rows.map((row) => ({
        postcode: row.postcode as string,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        council: (row.council as string | null) ?? null,
        region: (row.region as string | null) ?? null,
        lsoaCode: (row.lsoa_code as string | null) ?? null,
        msoaCode: (row.msoa_code as string | null) ?? null,
        sourceName: (row.source_name as string | null) ?? null,
        sourceDate: (row.source_date as string | null) ?? null,
      }));
    },

    async lsoaBases(lsoaCodes) {
      if (lsoaCodes.length === 0) return [];
      const { rows } = await db.query(
        "SELECT lsoa_code, residents, households FROM lsoa_bases WHERE lsoa_code = ANY($1)",
        [lsoaCodes],
      );
      return rows.map((row) => ({
        lsoaCode: row.lsoa_code as string,
        residents: Number(row.residents),
        households: Number(row.households),
      }));
    },

    async censusRows(msoaCodes) {
      if (msoaCodes.length === 0) return [];
      const { rows } = await db.query(
        `SELECT msoa_code, msoa_name, stats, source_name, source_date::text AS source_date
         FROM census_stats WHERE msoa_code = ANY($1)`,
        [msoaCodes],
      );
      return rows.map((row) => ({
        msoaCode: row.msoa_code as string,
        msoaName: row.msoa_name as string,
        stats: row.stats as Record<string, unknown>,
        sourceName: (row.source_name as string | null) ?? null,
        sourceDate: (row.source_date as string | null) ?? null,
      }));
    },

    async imdDeciles(lsoaCodes) {
      if (lsoaCodes.length === 0) return { deciles: [], sourceName: null, sourceDate: null };
      const { rows } = await db.query(
        `SELECT lsoa_code, imd_decile, source_name, source_date::text AS source_date
         FROM neighbourhood_stats WHERE lsoa_code = ANY($1) AND imd_decile IS NOT NULL`,
        [lsoaCodes],
      );
      return {
        deciles: rows.map((row) => ({
          lsoaCode: row.lsoa_code as string,
          decile: Number(row.imd_decile),
        })),
        sourceName: (rows[0]?.source_name as string | null) ?? null,
        sourceDate: (rows[0]?.source_date as string | null) ?? null,
      };
    },

    async councilTax(council) {
      // The area brain's own join (council_tax_charges by
      // authority_name, latest tax year) — the district
      // reads the same row for each of its councils.
      const { rows } = await db.query(
        `SELECT authority_name, nation, tax_year, band_d_area_average_pence,
                parish_averaged, source_name, source_date::text AS source_date
         FROM council_tax_charges WHERE authority_name = $1
         ORDER BY tax_year DESC LIMIT 1`,
        [council],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        authorityName: row.authority_name as string,
        nation: row.nation as "england" | "wales",
        taxYear: row.tax_year as string,
        bandDAreaAveragePence: Number(row.band_d_area_average_pence),
        parishAveraged: Boolean(row.parish_averaged),
        sourceName: (row.source_name as string | null) ?? null,
        sourceDate: (row.source_date as string | null) ?? null,
      };
    },

    async soldFacts(outward) {
      const { rows } = await db.query(
        `SELECT price, sale_date::text AS sale_date, property_type, postcode, source_name,
                source_date::text AS source_date
         FROM price_paid
         WHERE starts_with(postcode, $1) AND ppd_category = 'A'
         ORDER BY sale_date`,
        [prefixOf(outward)],
      );
      return {
        rows: rows.map((row) => ({
          price: Number(row.price),
          saleDate: row.sale_date as string,
          propertyType: (row.property_type as string | null) ?? null,
          postcode: row.postcode as string,
        })),
        sourceName: (rows[0]?.source_name as string | null) ?? null,
        sourceDate: (rows[0]?.source_date as string | null) ?? null,
      };
    },

    async broadbandAnswers(outward) {
      const { rows } = await db.query(
        `SELECT answers -> 'broadband' AS broadband FROM postcode_cache
         WHERE starts_with(postcode, $1) AND answers ? 'broadband'`,
        [prefixOf(outward)],
      );
      const answers: BroadbandAnswerPort[] = [];
      for (const row of rows) {
        const filed = row.broadband as {
          basis: string;
          snapshot: string;
          gigabit_capable_pct: number;
          superfast_30_pct: number;
        } | null;
        if (!filed) continue;
        answers.push({
          basis: filed.basis,
          snapshot: filed.snapshot,
          gigabitCapablePct: filed.gigabit_capable_pct,
          superfast30Pct: filed.superfast_30_pct,
        });
      }
      return answers;
    },

    async mobileAnswers(outward) {
      const { rows } = await db.query(
        `SELECT answers -> 'mobile' AS mobile FROM postcode_cache
         WHERE starts_with(postcode, $1) AND answers ? 'mobile'`,
        [prefixOf(outward)],
      );
      const answers: MobileAnswerPort[] = [];
      for (const row of rows) {
        const filed = row.mobile as {
          snapshot: string;
          laua_name: string;
          services: Record<
            string,
            {
              outdoor: { at_least_one_operator_pct: number | null } | null;
            }
          >;
        } | null;
        if (!filed) continue;
        answers.push({
          lauaName: filed.laua_name,
          snapshot: filed.snapshot,
          fourGOutdoorAtLeastOnePct:
            filed.services?.["4g"]?.outdoor?.at_least_one_operator_pct ?? null,
        });
      }
      return answers;
    },

    async schools(outward) {
      const { rows } = await db.query(
        `SELECT s.phase, (s.admissions_policy = 'Selective') AS selective,
                oo.rating AS ofsted_rating, s.source_name,
                s.source_date::text AS source_date
         FROM schools s
         LEFT JOIN ofsted_outcomes oo ON oo.urn = s.urn
         WHERE starts_with(s.postcode, $1)`,
        [prefixOf(outward)],
      );
      return {
        rows: rows.map((row) => ({
          phase: (row.phase as string | null) ?? null,
          selective: Boolean(row.selective),
          ofstedRating: (row.ofsted_rating as string | null) ?? null,
        })),
        sourceName: (rows[0]?.source_name as string | null) ?? null,
        sourceDate: (rows[0]?.source_date as string | null) ?? null,
      };
    },

    async healthCounts(outward) {
      const { rows } = await db.query(
        `SELECT service_type, count(*)::int AS n FROM health_points
         WHERE starts_with(postcode, $1) GROUP BY service_type`,
        [prefixOf(outward)],
      );
      return rows.map((row) => ({
        serviceType: row.service_type as string,
        count: Number(row.n),
      }));
    },

    async stations(outward) {
      // A station files no postcode: it belongs to the
      // district of its nearest filed postcode (the KNN
      // read over the GiST index), a derivation from the
      // filed rows, stated in the section's source line.
      const { rows } = await db.query(
        `SELECT s.name FROM transport_stops s
         WHERE s.stop_type = 'RLY' AND s.name IS NOT NULL
           AND starts_with(
             (SELECT pc.postcode FROM postcode_cache pc
              WHERE pc.geom IS NOT NULL
              ORDER BY pc.geom <-> s.geom LIMIT 1),
             $1)
         ORDER BY s.name`,
        [prefixOf(outward)],
      );
      return rows.map((row) => row.name as string);
    },

    async pickingHomes(outward) {
      const { rows } = await db.query(
        "SELECT count(*)::int AS n FROM picking_index WHERE starts_with(postcode, $1)",
        [prefixOf(outward)],
      );
      return Number(rows[0]?.n ?? 0);
    },

    async places(outward) {
      // Filing counts ride with the names (BUG-034):
      // the settlement filter keeps the most-filed form
      // of a name, so these reads count rather than
      // dedupe. Post towns are counted across both
      // registers that file them and stand most-filed
      // first, so the head's post town is the district's
      // main one, deterministically.
      // The six reads are independent, so they run
      // together (BUG-171): serially they cost six round
      // trips end to end — several over price_paid, the
      // biggest table — in front of the district head,
      // and with it the neighbourhood checking group.
      const prefix = prefixOf(outward);
      const [
        { rows: localityRows },
        { rows: townRows },
        { rows: indexTownRows },
        { rows: countyRows },
        allCounties,
        { rows: settlementRows },
      ] = await Promise.all([
        db.query(
          `SELECT locality, count(*)::int AS filings FROM price_paid
          WHERE starts_with(postcode, $1) AND locality IS NOT NULL
          GROUP BY locality
          ORDER BY filings DESC, locality`,
          [prefix],
        ),
        db.query(
          `SELECT town, count(*)::int AS filings FROM price_paid
          WHERE starts_with(postcode, $1) AND town IS NOT NULL
          GROUP BY town`,
          [prefix],
        ),
        db.query(
          `SELECT town, count(*)::int AS filings FROM picking_index
          WHERE starts_with(postcode, $1) AND town IS NOT NULL
          GROUP BY town`,
          [prefix],
        ),
        // The counties the district's sales rows file
        // (Price Paid's own county column), ranked
        // most-filed first — BUG-307: the head's county
        // is the majority vote, not the whole spread of
        // a column that files stray counties row by row.
        // The settlement filter drops by a wider set: the
        // district's own UNION every county filed anywhere
        // in the register (everyFiledCounty above), because
        // a district whose rows file no county must not let
        // the county stand as a settlement (BUG-034
        // residual).
        db.query(
          `SELECT county, count(*)::int AS filings FROM price_paid
           WHERE starts_with(postcode, $1) AND county IS NOT NULL
           GROUP BY county
           ORDER BY filings DESC, county`,
          [prefix],
        ),
        everyFiledCounty(db),
        db.query(
          `SELECT locality, min(postcode) AS postcode FROM price_paid
         WHERE starts_with(postcode, $1) AND locality IS NOT NULL
         GROUP BY locality`,
          [prefix],
        ),
      ]);
      const townsByName = new Map<string, number>();
      for (const row of [...townRows, ...indexTownRows]) {
        const town = row.town as string;
        townsByName.set(town, (townsByName.get(town) ?? 0) + Number(row.filings));
      }
      const towns = [...townsByName.entries()]
        .map(([name, filings]) => ({ name, filings }))
        .sort((a, b) => b.filings - a.filings || (a.name < b.name ? -1 : 1));
      const districtCounties = countyRows.map((row) => row.county as string);
      return {
        localities: localityRows.map((row) => ({
          name: row.locality as string,
          filings: Number(row.filings),
        })),
        towns,
        counties: districtCounties,
        settlementCounties: [...new Set([...districtCounties, ...allCounties])],
        settlementPostcodes: settlementRows.map((row) => ({
          locality: row.locality as string,
          postcode: row.postcode as string,
        })),
      };
    },

    async floodFacts(layer, postcodes) {
      // The count and the stamp are independent reads;
      // together, not one after the other (BUG-171).
      const [{ rows: countRows }, { rows: stampRows }] = await Promise.all([
        db.query("SELECT count(*)::int AS n FROM flood_layers WHERE layer_type = $1", [layer]),
        db.query(
          "SELECT source_name, source_date::text AS source_date FROM flood_layers WHERE layer_type = $1 LIMIT 1",
          [layer],
        ),
      ]);
      const filedCount = Number(countRows[0]?.n ?? 0);
      if (filedCount <= 0 || postcodes.length === 0) {
        return {
          filedCount,
          covered: false,
          assignments: [],
          sourceName: (stampRows[0]?.source_name as string | null) ?? null,
          sourceDate: (stampRows[0]?.source_date as string | null) ?? null,
        };
      }
      // Coverage (audit item 14): does any filed shape of
      // this layer touch the district's own spread — the
      // hull of its postcode points, buffered by 1 km so
      // a shape falling between neighbouring points still
      // counts as covering the district it cuts across.
      // The GiST index serves the intersects test. The
      // coverage test and the per-point label read below
      // are independent, so they run together (BUG-171).
      const [{ rows: coverageRows }, { rows }] = await Promise.all([
        db.query(
          `WITH hull AS (
           SELECT ST_Buffer(ST_ConvexHull(ST_Collect(geom))::geography, 1000)::geometry AS g
           FROM postcode_cache WHERE postcode = ANY($2)
         )
         SELECT EXISTS (
           SELECT 1 FROM flood_layers fl, hull
           WHERE fl.layer_type = $1 AND hull.g IS NOT NULL AND ST_Intersects(fl.geom, hull.g)
         ) AS covered`,
          [layer, postcodes],
        ),
        // One read per postcode point: the label of the
        // filed shape covering it (the products are dissolved
        // per label and mutually exclusive — the flood
        // brain's own premise), or null where none does.
        db.query(
          `SELECT pc.postcode,
                (SELECT fl.risk_label FROM flood_layers fl
                 WHERE fl.layer_type = $1 AND ST_Covers(fl.geom, pc.geom)
                 LIMIT 1) AS label
         FROM postcode_cache pc WHERE pc.postcode = ANY($2)`,
          [layer, postcodes],
        ),
      ]);
      const covered = Boolean(coverageRows[0]?.covered);
      return {
        filedCount,
        covered,
        assignments: rows.map((row) => ({
          postcode: row.postcode as string,
          label: (row.label as string | null) ?? null,
        })),
        sourceName: (stampRows[0]?.source_name as string | null) ?? null,
        sourceDate: (stampRows[0]?.source_date as string | null) ?? null,
      };
    },

    async defenceWatercourses(postcodes) {
      if (postcodes.length === 0) return [];
      const { rows } = await db.query(DEFENCE_WATERCOURSES_SQL, [postcodes]);
      return rows.map((row) => row.name as string);
    },

    async airSquares(postcodes) {
      if (postcodes.length === 0) return { squares: [], sourceName: null, sourceDate: null };
      // Each postcode's own square, the area brain's read
      // (nearest square whose centre is within 1 km),
      // deduplicated to the distinct squares.
      const { rows } = await db.query(
        `SELECT DISTINCT ON (ag.grid_ref) ag.year, ag.no2, ag.pm25, ag.pm10,
                ag.source_name, ag.source_date::text AS source_date
         FROM postcode_cache pc
         JOIN LATERAL (
           SELECT * FROM air_grid g
           WHERE ST_DWithin(g.geom, pc.geom, 0.02)
             AND ST_Distance(g.geom::geography, pc.geom::geography) <= 1000
           ORDER BY ST_Distance(g.geom::geography, pc.geom::geography)
           LIMIT 1
         ) ag ON true
         WHERE pc.postcode = ANY($1)`,
        [postcodes],
      );
      return {
        squares: rows.map((row) => ({
          year: Number(row.year),
          no2: Number(row.no2),
          pm25: Number(row.pm25),
          pm10: Number(row.pm10),
        })),
        sourceName: (rows[0]?.source_name as string | null) ?? null,
        sourceDate: (rows[0]?.source_date as string | null) ?? null,
      };
    },

    async crimeFacts() {
      // No district crime total is filed anywhere: crime
      // is filed per postcode (1-mile circles, checked
      // postcodes only) plus England monthly totals, and
      // circles cannot be summed without double-counting
      // (see the header's premise check). The builder
      // serves the section's honest line on null.
      return null;
    },
  };
}
