// The district brain (wider-area build, 18 Nov 2026 — the
// founder's ruling superseding the rung-3 "no figures"
// treatment for the sections below).
//
// The rung-3 page used to serve four tabs of named states
// ("crime counts need an exact postcode", …) because the
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
  rows: { price: number; saleDate: string; propertyType: string | null }[];
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
  // towns from its sales rows and its picking index, the
  // counties its sales rows file (Price Paid's own county
  // column — the head chip's data, founder fix batch,
  // audit item 4), and one filed postcode per locality
  // (the bridge's named-area links land on it).
  places(outward: string): Promise<{
    localities: string[];
    towns: string[];
    counties: string[];
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
const DISTRICT_WARNING_TIMEOUT_MS = 2000;

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

function crimeCategoryLabel(slug: string): string {
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

// The district's cleaned settlement set: display form,
// fragments filtered, deduped, sorted — the one set the
// district section's pills and the bridge's named links
// both read, so the two surfaces can never disagree
// about what the district's settlements are.
function cleanSettlements(rawNames: string[]): string[] {
  return [...new Set(rawNames.map((name) => displayText(name)).filter(isSettlementName))].sort();
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

export async function buildDistrictBundle(
  outward: string,
  source: DistrictDataSource,
  options: DistrictBundleOptions = {},
): Promise<DistrictBundle> {
  const postcodes = await source.postcodes(outward);
  const letters = new Set(postcodes.map((row) => nationLetterOf(row.lsoaCode)));
  const hasEnglish = letters.has("E");
  const hasWelsh = letters.has("W");

  // Scotland / Northern Ireland districts: the old rung-3
  // behaviour stands whole (Phase 3 owns their coverage).
  if (!hasEnglish && !hasWelsh && (letters.has("S") || letters.has("N"))) {
    return {
      kind: "not-covered",
      outward,
      nation: letters.has("S") ? "scotland" : "northern-ireland",
    };
  }

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
  const regions = [...new Set(postcodes.map((row) => row.region).filter((c): c is string => !!c))];
  const stamp = postcodes.find((row) => row.sourceName) ?? null;

  const [
    bases,
    censusFactsRows,
    imd,
    sold,
    broadband,
    mobile,
    schoolsFacts,
    health,
    stationNames,
    homes,
    places,
    crime,
    rofrsFacts,
    rofswFacts,
    zoneFacts,
    watercourses,
    airFacts,
    councilTaxRows,
  ] = await Promise.all([
    source.lsoaBases(lsoaCodes),
    source.censusRows(msoaCodes),
    source.imdDeciles(englishLsoaCodes),
    source.soldFacts(outward),
    source.broadbandAnswers(outward),
    source.mobileAnswers(outward),
    source.schools(outward),
    source.healthCounts(outward),
    source.stations(outward),
    source.pickingHomes(outward),
    source.places(outward),
    source.crimeFacts(outward),
    hasEnglish
      ? source.floodFacts(
          "rofrs",
          englishPostcodes.map((row) => row.postcode),
        )
      : Promise.resolve(null),
    hasEnglish
      ? source.floodFacts(
          "rofsw",
          englishPostcodes.map((row) => row.postcode),
        )
      : Promise.resolve(null),
    hasEnglish
      ? source.floodFacts(
          "flood_zone",
          englishPostcodes.map((row) => row.postcode),
        )
      : Promise.resolve(null),
    hasEnglish
      ? source.defenceWatercourses(englishPostcodes.map((row) => row.postcode))
      : Promise.resolve([] as string[]),
    source.airSquares(postcodes.map((row) => row.postcode)),
    Promise.all(
      councils.map(async (council) => ({ council, facts: await source.councilTax(council) })),
    ),
  ]);

  const head: DistrictHead = {
    outward,
    postcodeCount: postcodes.length,
    lsoaCount: lsoaCodes.length,
    msoaCount: msoaCodes.length,
    councils,
    counties: [...new Set(places.counties.map((name) => displayText(name)))].sort(),
    postTown: places.towns[0] ? displayText(places.towns[0]) : null,
    region: regions[0] ?? null,
    sourceName: stamp?.sourceName ?? null,
    sourceDate: stamp?.sourceDate ?? null,
    sourceLine: sourceLineOf(stamp?.sourceName ?? null, stamp?.sourceDate ?? null),
  };

  // 1 — The district itself.
  const settlementsRaw = places.localities.length > 0 ? places.localities : places.towns;
  const settlements = cleanSettlements(settlementsRaw);
  // The bridge's named links ride the same cleaned set:
  // one filed postcode per settlement, from the sales
  // rows that filed the locality.
  const settlementPostcodes = settlements
    .map((name) => {
      const filed = places.settlementPostcodes.find((row) => displayText(row.locality) === name);
      return filed ? { name, postcode: filed.postcode } : null;
    })
    .filter((row): row is { name: string; postcode: string } => row !== null);
  const residents = bases.length > 0 ? bases.reduce((sum, row) => sum + row.residents, 0) : null;
  const households = bases.length > 0 ? bases.reduce((sum, row) => sum + row.households, 0) : null;
  const district: DistrictItselfSection = {
    state: settlements.length > 0 || residents !== null ? "served" : "not-filed",
    settlements,
    settlementsCount: settlements.length,
    homes: homes > 0 ? homes : null,
    residents,
    households,
    sourceName: head.sourceName,
    sourceDate: head.sourceDate,
    sourceLine: head.sourceLine,
  };

  // 2 — Census, summed across the district's MSOAs.
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

  // 3 — Crime (premise-checked: no district total is
  // filed today; the served form stands ready for one).
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

  // 4 — Sold prices (category A only, D23).
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

  // 5 — Deprivation: the spread of the district's English
  // small areas across the deciles. A spread, never a score.
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

  // 6 — Council tax: every council the district straddles.
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
    unfiledCouncils: councilTaxRows.filter((row) => row.facts === null).map((row) => row.council),
  };

  // 7 — Broadband & mobile.
  const broadbandSection =
    broadband.length > 0
      ? {
          postcodesCounted: broadband.length,
          gigabitMeanPct: round1(
            broadband.reduce((sum, answer) => sum + answer.gigabitCapablePct, 0) / broadband.length,
          ),
          superfastMeanPct: round1(
            broadband.reduce((sum, answer) => sum + answer.superfast30Pct, 0) / broadband.length,
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

  // 8 — Schools.
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

  // 9 — Everyday counts.
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

  // 10 — Flood: the district roll-up.
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
      if (assignment.label) byLabel.set(assignment.label, (byLabel.get(assignment.label) ?? 0) + 1);
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

  // 11 — Air: the range across the district's squares.
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

  return {
    kind: "district",
    outward,
    head,
    sections: {
      district,
      census,
      crime: crimeSection,
      soldPrices,
      deprivation,
      councilTax,
      connectivity,
      schools,
      everyday,
      flood,
      air,
      bridge: {
        postcodes: postcodes.map((row) => row.postcode),
        settlementPostcodes,
      },
    },
  };
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
        `SELECT price, sale_date::text AS sale_date, property_type, source_name,
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
      const { rows } = await db.query(
        `SELECT DISTINCT locality, town FROM price_paid WHERE starts_with(postcode, $1)`,
        [prefixOf(outward)],
      );
      const { rows: indexRows } = await db.query(
        `SELECT DISTINCT town FROM picking_index WHERE starts_with(postcode, $1)`,
        [prefixOf(outward)],
      );
      // The counties the district's sales rows file
      // (Price Paid's own county column) and one filed
      // postcode per locality — the head chip's data and
      // the bridge links' landings (founder fix batch).
      const { rows: countyRows } = await db.query(
        `SELECT DISTINCT county FROM price_paid WHERE starts_with(postcode, $1) AND county IS NOT NULL`,
        [prefixOf(outward)],
      );
      const { rows: settlementRows } = await db.query(
        `SELECT locality, min(postcode) AS postcode FROM price_paid
         WHERE starts_with(postcode, $1) AND locality IS NOT NULL
         GROUP BY locality`,
        [prefixOf(outward)],
      );
      const localities = new Set<string>();
      const towns = new Set<string>();
      for (const row of rows) {
        if (row.locality) localities.add(row.locality as string);
        if (row.town) towns.add(row.town as string);
      }
      for (const row of indexRows) {
        if (row.town) towns.add(row.town as string);
      }
      return {
        localities: [...localities],
        towns: [...towns],
        counties: countyRows.map((row) => row.county as string),
        settlementPostcodes: settlementRows.map((row) => ({
          locality: row.locality as string,
          postcode: row.postcode as string,
        })),
      };
    },

    async floodFacts(layer, postcodes) {
      const { rows: countRows } = await db.query(
        "SELECT count(*)::int AS n FROM flood_layers WHERE layer_type = $1",
        [layer],
      );
      const filedCount = Number(countRows[0]?.n ?? 0);
      const { rows: stampRows } = await db.query(
        "SELECT source_name, source_date::text AS source_date FROM flood_layers WHERE layer_type = $1 LIMIT 1",
        [layer],
      );
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
      // The GiST index serves the intersects test.
      const { rows: coverageRows } = await db.query(
        `WITH hull AS (
           SELECT ST_Buffer(ST_ConvexHull(ST_Collect(geom))::geography, 1000)::geometry AS g
           FROM postcode_cache WHERE postcode = ANY($2)
         )
         SELECT EXISTS (
           SELECT 1 FROM flood_layers fl, hull
           WHERE fl.layer_type = $1 AND hull.g IS NOT NULL AND ST_Intersects(fl.geom, hull.g)
         ) AS covered`,
        [layer, postcodes],
      );
      const covered = Boolean(coverageRows[0]?.covered);
      // One read per postcode point: the label of the
      // filed shape covering it (the products are dissolved
      // per label and mutually exclusive — the flood
      // brain's own premise), or null where none does.
      const { rows } = await db.query(
        `SELECT pc.postcode,
                (SELECT fl.risk_label FROM flood_layers fl
                 WHERE fl.layer_type = $1 AND ST_Covers(fl.geom, pc.geom)
                 LIMIT 1) AS label
         FROM postcode_cache pc WHERE pc.postcode = ANY($2)`,
        [layer, postcodes],
      );
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
