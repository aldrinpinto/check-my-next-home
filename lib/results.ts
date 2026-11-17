import type { AddressResolution } from "./address";
import type { AreaBundle } from "./area-bundle";
import type { CrimeBundle } from "./crime";
import type { FloodBundle, FloodLiveWarnings } from "./flood";
import type { CategoryAnswer, NearbyBundle, NearbyPlace } from "./nearby";
import type { ShortBundle, ShortSections } from "./short-bundle";
import type { SoldPricesBundle } from "./sold-prices";

// The free results page's derivations (plan step M7.4).
//
// Everything the page renders is derived here, purely, from
// the five frozen brain bundles plus the short bundle the
// serve layer derives from them on read (D29): the summary
// strip's four pills (the Final Design's pill logic E2), the
// section-to-tab placement (the Final Design's Section 6
// tables), the per-group display counts and truncation lines
// (ruling 2 of the step's gap check), the live-warnings
// strip forms (ruling 1), and the rung scope labels
// (ruling 3). The component (components/ResultsPage.tsx) is
// a mechanical renderer of this view model, so every
// decision the page makes is pinned in tests/results.test.ts
// without a DOM.
//
// Depth discipline (D66): this module reads headline picks
// only. The report-depth material the bundles also carry —
// crime's category table and monthly counts, flood's
// defences and climate blocks, the area bundle's AQMA /
// charging-zones / census / IMD / benefits / solar / mobile
// / building-safety / EPC-construction material, nearby's
// destinations blocks — is never read here, so it can never
// render on this page.

// The detailed report's route, pinned at this step for
// M7.6 to adopt: every truncation line on the free page
// links here from this build. M7.6 builds the page this
// route serves; until then it is the same labelled dead end
// the sample-report route was at M7.2.
export const REPORT_ROUTE = "/report";

// ------------------------------------------------------------------
// Small formatters
// ------------------------------------------------------------------

// Miles as the design's pills and rows state them: at most
// two decimals, trailing zeros trimmed ("0.44", "5.89",
// "0.1"). The brains serve miles rounded to three decimals;
// the page's display precision is two.
export function formatMiles(miles: number): string {
  return String(Number(miles.toFixed(2)));
}

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

// "2023-06-15" → "15 June 2023". An unparseable value is
// served raw rather than hidden — the page never invents a
// date and never drops one.
export function formatFiledDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const month = MONTH_NAMES[Number(match[2]) - 1];
  if (!month) return iso;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

export function formatPounds(value: number): string {
  return `£${value.toLocaleString("en-GB")}`;
}

// ------------------------------------------------------------------
// Distance colour (Final Design, Section 6): green / orange /
// red on the miles figure only, per group family. The kit's
// pill colours its figure uniformly; the thresholds are the
// design's and live here with the page that applies them.
// ------------------------------------------------------------------

export type DistanceBand = "green" | "orange" | "red";
export type DistanceFamily = "school" | "everyday" | "hospital";

export function distanceBand(family: DistanceFamily, miles: number): DistanceBand {
  if (family === "school") return miles <= 1 ? "green" : miles <= 2 ? "orange" : "red";
  if (family === "hospital") return miles <= 5 ? "green" : miles <= 10 ? "orange" : "red";
  return miles <= 0.5 ? "green" : miles <= 1.5 ? "orange" : "red";
}

// ------------------------------------------------------------------
// Scope labels (ruling 3 of the gap check)
// ------------------------------------------------------------------

// The results page's header scope label. Rung 1 is the
// picked address with its postcode (M7.3's form). Rung 2 is
// the gap check's pinned form — "Postcode area — <postcode>,
// not one exact home" — which supersedes M7.3's
// holding-page wording on this page. Rung 3 is the
// resolution's own label ("Wider area — E16, not this exact
// home").
export function resultsScopeLabel(resolution: AddressResolution): string {
  if (resolution.rung === 1) return `${resolution.address.label}, ${resolution.address.postcode}`;
  if (resolution.rung === 2)
    return `Postcode area — ${resolution.directory.postcode}, not one exact home`;
  if (resolution.rung === 3) return resolution.label;
  return "";
}

// Whether a this-home report may be offered for this
// resolution: only a rung-1 check identifies a home. Rung 2
// keeps its truncation links (the detailed report continues
// the postcode's lists for an identified home — the picker
// embedded at the head of the page is that identification
// step); rung 3 suppresses the link entirely (ruling 3: a
// partial-postcode visitor is never offered a this-home
// report), so its truncation lines render as plain count
// lines.
export function reportLinkable(rung: number): boolean {
  return rung === 1 || rung === 2;
}

// ------------------------------------------------------------------
// Truncation lines (ruling 2): the design's exact wording,
// N = the served within-2-miles count minus the number
// shown, per group. A group showing its full served list
// carries no line.
// ------------------------------------------------------------------

export interface TruncationView {
  n: number;
  text: string;
  href: string | null;
}

export function truncationFor(
  countWithin: number,
  shown: number,
  groupLabel: string,
  linkable: boolean,
): TruncationView | null {
  const n = countWithin - shown;
  if (n <= 0) return null;
  return {
    n,
    text: `Plus ${n} more ${groupLabel} in the detailed report — £4.99`,
    href: linkable ? REPORT_ROUTE : null,
  };
}

// ------------------------------------------------------------------
// Place groups
// ------------------------------------------------------------------

export interface PlaceRow {
  name: string;
  milesText: string;
  band: DistanceBand;
  detail: string | null;
  ratingLine: string | null;
  sixthFormLine: string | null;
}

export interface PlaceGroupView {
  key: string;
  heading: string;
  rows: PlaceRow[];
  // The category's own ruled sentence for its non-within
  // states (and for none-within, where it names the beyond
  // nearest the rows also carry). Null while places serve.
  line: string | null;
  truncation: TruncationView | null;
  // Schools-secondary only: the brain's nearest-selective
  // sentence, verbatim.
  selectiveLine: string | null;
}

interface CategoryPresentation {
  heading: string;
  groupLabel: string;
  display: number;
  family: DistanceFamily;
}

// The per-tab display counts (Final Design, Section 6):
// Family Checks shows the nearest 2 primary + 2 secondary
// schools, the nearest 3 sixth forms and colleges (the step
// text's pinned form for that group), the nearest nursery
// and the nearest 1 of each health kind; What's Nearby
// shows the nearest 1 of each kind. The served lists hold
// at most 3 named places (the brain's LIST_SIZE), so a
// display count above 3 could never show more than served.
export const FAMILY_CATEGORIES: Record<string, CategoryPresentation> = {
  "schools-primary": {
    heading: "Primary schools",
    groupLabel: "primary schools",
    display: 2,
    family: "school",
  },
  "schools-secondary": {
    heading: "Secondary schools",
    groupLabel: "secondary schools",
    display: 2,
    family: "school",
  },
  "sixth-forms": {
    heading: "Sixth forms and colleges",
    groupLabel: "sixth forms and colleges",
    display: 3,
    family: "school",
  },
  nurseries: {
    heading: "Nurseries & pre-schools",
    groupLabel: "nurseries",
    display: 1,
    family: "school",
  },
  gp: { heading: "GP surgeries", groupLabel: "GP surgeries", display: 1, family: "everyday" },
  dentist: { heading: "NHS dentists", groupLabel: "NHS dentists", display: 1, family: "everyday" },
  pharmacy: { heading: "Pharmacies", groupLabel: "pharmacies", display: 1, family: "everyday" },
  ae: { heading: "A&E hospitals", groupLabel: "A&E hospitals", display: 1, family: "hospital" },
  maternity: {
    heading: "Maternity units",
    groupLabel: "maternity units",
    display: 1,
    family: "hospital",
  },
};

export const NEARBY_CATEGORIES: Record<string, CategoryPresentation> = {
  station: { heading: "Stations", groupLabel: "stations", display: 1, family: "everyday" },
  "bus-stop": { heading: "Bus stops", groupLabel: "bus stops", display: 1, family: "everyday" },
  supermarket: {
    heading: "Supermarkets & food shops",
    groupLabel: "supermarkets",
    display: 1,
    family: "everyday",
  },
  "food-and-drink": {
    heading: "Food & drink",
    groupLabel: "food and drink places",
    display: 1,
    family: "everyday",
  },
  parks: {
    heading: "Parks & greenspace",
    groupLabel: "parks and greenspace",
    display: 1,
    family: "everyday",
  },
  vets: { heading: "Vets", groupLabel: "vets", display: 1, family: "everyday" },
  "pet-shops": { heading: "Pet shops", groupLabel: "pet shops", display: 1, family: "everyday" },
  "pet-boarding": {
    heading: "Pet boarding & kennels",
    groupLabel: "pet boarding places",
    display: 1,
    family: "everyday",
  },
  "ev-chargers": {
    heading: "EV chargers",
    groupLabel: "EV chargers",
    display: 1,
    family: "everyday",
  },
  leisure: {
    heading: "Leisure & gyms",
    groupLabel: "leisure places",
    display: 1,
    family: "everyday",
  },
  "places-to-visit": {
    heading: "Places to visit",
    groupLabel: "places to visit",
    display: 1,
    family: "everyday",
  },
  "places-of-worship": {
    heading: "Places of worship",
    groupLabel: "places of worship",
    display: 1,
    family: "everyday",
  },
  libraries: { heading: "Libraries", groupLabel: "libraries", display: 1, family: "everyday" },
};

function placeRow(place: NearbyPlace, family: DistanceFamily): PlaceRow {
  return {
    name: place.name,
    milesText: `${formatMiles(place.miles)} mi`,
    band: distanceBand(family, place.miles),
    detail: place.detail ?? null,
    // The CQC overall rating with its publication date
    // (M6.25): England health rows only, never worded as an
    // inspection date; an unrated row (null) stays bare.
    ratingLine:
      place.cqcRating != null
        ? `CQC overall rating: ${place.cqcRating.rating}${
            place.cqcRating.date ? ` (published ${formatFiledDate(place.cqcRating.date)})` : ""
          }`
        : null,
    // The secondary rows' filed sixth-form flags (M6.33),
    // as filed: yes, no, or not recorded.
    sixthFormLine:
      place.sixthForm === undefined
        ? null
        : place.sixthForm === true
          ? "sixth form: yes, as filed"
          : place.sixthForm === false
            ? "sixth form: no, as filed"
            : "sixth form: not recorded",
  };
}

export function placeGroupView(
  category: CategoryAnswer,
  presentation: CategoryPresentation,
  linkable: boolean,
): PlaceGroupView {
  const base: PlaceGroupView = {
    key: category.category,
    heading: presentation.heading,
    rows: [],
    line: null,
    truncation: null,
    selectiveLine:
      category.category === "schools-secondary" ? (category.nearestSelectiveLine ?? null) : null,
  };
  if (category.state === "within") {
    const shown = category.places.slice(0, presentation.display);
    return {
      ...base,
      rows: shown.map((place) => placeRow(place, presentation.family)),
      truncation: truncationFor(
        category.countWithin,
        shown.length,
        presentation.groupLabel,
        linkable,
      ),
    };
  }
  if (category.state === "none-within" && category.beyondNearest) {
    // The essential-services form: the ruled line names the
    // beyond nearest, and the row carries it with its miles.
    return {
      ...base,
      line: category.line,
      rows: [
        placeRow(
          { name: category.beyondNearest.name, miles: category.beyondNearest.miles, detail: null },
          presentation.family,
        ),
      ],
    };
  }
  return { ...base, line: category.line };
}

// ------------------------------------------------------------------
// The catchment honesty block (M6.23 sweep, B5 split — built
// here and at M8.1): a fixed hand-written block. It states
// that we hold no catchment boundaries and cannot say
// whether this home is in or out for any school, and points
// at the GOV.UK school admissions route — the real answer
// lives with the council and the school. (The sweep's
// "each listed school's own website as filed" cannot render
// at this step: the frozen nearby brain serves no website
// field at headline depth — see the build note.)
// ------------------------------------------------------------------

export const CATCHMENT_BLOCK_HEADING = "School places & catchments";
export const CATCHMENT_BLOCK_LINE =
  "We hold no catchment boundaries, so we cannot say whether this home is in or out for any school. The real answer lives with the council and the school — check the school's own admissions pages and your council's school admissions information before you rely on a place.";
export const CATCHMENT_LINK = {
  label: "School admissions on GOV.UK",
  url: "https://www.gov.uk/schools-admissions",
};

// ------------------------------------------------------------------
// Section view model
// ------------------------------------------------------------------

export type SectionBlock =
  | { type: "line"; text: string }
  | { type: "notice"; variant: "warning" | "stale" | "gap"; text: string }
  | { type: "places"; group: PlaceGroupView }
  | { type: "link"; label: string; url: string }
  | { type: "tiles"; tiles: { label: string; value: string }[] }
  | {
      type: "flood-warnings";
      warnings: {
        severity: string;
        areaDescription: string;
        message: string;
        raisedLine: string;
      }[];
      overflowLine: string | null;
      attributionLine: string;
      link: { label: string; url: string };
    };

export interface ResultsSectionView {
  key: string;
  heading: string;
  blocks: SectionBlock[];
  sourceLine: string | null;
}

export interface ResultsTabView {
  id: string;
  label: string;
  sections: ResultsSectionView[];
}

// The section-to-tab placement, transcribed from the Final
// Design's Section 6 contents tables (Family Checks =
// schools, nurseries, health, air/noise/crime headlines;
// What's Nearby = the everyday kinds; Home, Costs & Risks =
// sold prices, council tax, EPC, flood, planning,
// constraints, heritage, nature, broadband). Pinned by
// tests/results.test.ts.
export const RESULTS_TABS: { id: string; label: string; sections: string[] }[] = [
  {
    id: "family",
    label: "Family Checks",
    sections: [
      "schools-primary",
      "schools-secondary",
      "sixth-forms",
      "catchment",
      "nurseries",
      "gp",
      "dentist",
      "pharmacy",
      "ae",
      "maternity",
      "air",
      "noise",
      "crime",
    ],
  },
  {
    id: "nearby",
    label: "What's Nearby",
    sections: [
      "station",
      "bus-stop",
      "supermarket",
      "food-and-drink",
      "parks",
      "vets",
      "pet-shops",
      "pet-boarding",
      "ev-chargers",
      "leisure",
      "places-to-visit",
      "places-of-worship",
      "libraries",
    ],
  },
  {
    id: "home",
    label: "Home, Costs & Risks",
    sections: [
      "sold-prices",
      "council-tax",
      "epc",
      "flood",
      "planning",
      "constraints",
      "heritage",
      "nature",
      "broadband",
    ],
  },
];

// ------------------------------------------------------------------
// The summary strip — pill logic E2 (Final Design)
//
// Slot 1 is schools, always: the nearest primary, unless a
// grammar (selective) school sits within 2 miles, when the
// grammar takes the slot. Slots 2–3 are the strongest
// worth-knowing facts in the design's ranking, each behind
// its threshold: (1) flood — either flood check in its
// higher band; (2) crime — the 12-month count at 1.5× the
// national average or more (the design's test, read on the
// brain's served multiple, which D39 computes on unrounded
// figures); (3) distance — the nearest A&E over 10 miles,
// or the nearest GP over 1.5 miles. Slots that no threshold
// fills fall back to fixed facts in the design's order —
// flood's two checks, the crime count, the council tax
// figure — so they are never empty. Slot 4 is the nearest
// everyday positive: the nearest of vet, park or GP.
// A pill only ever states a fact traceable to a check
// inside; there is no colour and no verdict wording.
// ------------------------------------------------------------------

export interface SummaryPillsInput {
  nearby: Extract<NearbyBundle, { kind: "distances" }>;
  flood: FloodBundle;
  crime: CrimeBundle;
  sections: ShortSections;
}

function categoryOf(
  nearby: Extract<NearbyBundle, { kind: "distances" }>,
  key: string,
): CategoryAnswer | undefined {
  return nearby.categories.find((category) => category.category === key);
}

function nearestOf(category: CategoryAnswer | undefined): { name: string; miles: number } | null {
  if (!category) return null;
  if (category.places.length > 0)
    return { name: category.places[0].name, miles: category.places[0].miles };
  return category.beyondNearest ?? null;
}

// "Higher band" for the flood threshold: a covering label of
// High or Medium on either of the two likelihood checks
// (rivers & sea, surface water). The planning flood zone is
// not one of the two checks and never fires this pill.
function floodHigherBand(
  sections: ShortSections,
): { layer: "rofrs" | "rofsw"; label: string } | null {
  const flood = sections.flood;
  if (flood.state !== "served") return null;
  for (const layer of flood.layers) {
    if (layer.layer === "flood_zone") continue;
    if (
      layer.pointState === "inside" &&
      (layer.coveringLabel === "High" || layer.coveringLabel === "Medium")
    )
      return { layer: layer.layer, label: layer.coveringLabel };
  }
  return null;
}

export function summaryPills(input: SummaryPillsInput): string[] | null {
  const { nearby, crime, sections } = input;

  // Slot 1 — schools.
  const secondary = categoryOf(nearby, "schools-secondary");
  const primary = categoryOf(nearby, "schools-primary");
  let slot1: string | null = null;
  if (secondary?.nearestSelective)
    slot1 = `Grammar school ${formatMiles(secondary.nearestSelective.miles)} mi ★`;
  else {
    const nearestPrimary = nearestOf(primary);
    if (nearestPrimary) slot1 = `Nearest primary ${formatMiles(nearestPrimary.miles)} mi`;
    else {
      const nearestSecondary = nearestOf(secondary);
      if (nearestSecondary) slot1 = `Nearest secondary ${formatMiles(nearestSecondary.miles)} mi`;
    }
  }

  // Slots 2–3 — ranked threshold candidates, then the fixed
  // fallbacks in the design's order; each subject at most
  // once, and a subject whose data cannot serve a fact at
  // all (flood not filed / not covered, crime not covered)
  // is skipped rather than stated.
  const candidates: { subject: string; text: string }[] = [];
  const higher = floodHigherBand(sections);
  if (higher)
    candidates.push({
      subject: "flood",
      text:
        higher.layer === "rofsw"
          ? "Surface-water flood band: higher for this street"
          : "River & sea flood band: higher for this street",
    });
  const servedCrime = crime.kind === "crime" && crime.crime.state === "served" ? crime.crime : null;
  if (servedCrime?.englandFigure?.multiple != null && servedCrime.englandFigure.multiple >= 1.5)
    candidates.push({
      subject: "crime",
      text: `Crime: ${servedCrime.total.toLocaleString("en-GB")} recorded in 12 months`,
    });
  const ae = nearestOf(categoryOf(nearby, "ae"));
  const gp = nearestOf(categoryOf(nearby, "gp"));
  if (ae && ae.miles > 10)
    candidates.push({ subject: "distance", text: `Nearest A&E ${formatMiles(ae.miles)} mi` });
  else if (gp && gp.miles > 1.5)
    candidates.push({ subject: "distance", text: `Nearest GP ${formatMiles(gp.miles)} mi` });
  if (sections.flood.state === "served")
    candidates.push({ subject: "flood", text: "Flood: 2 separate checks" });
  if (sections.crime.state === "served")
    candidates.push({ subject: "crime", text: "Crime: 12-month counts" });
  if (sections.councilTax.state === "served" && sections.councilTax.bandDAverageLabel)
    candidates.push({
      subject: "council-tax",
      text: `Council tax: Band D averages ${sections.councilTax.bandDAverageLabel} a year`,
    });
  const seen = new Set<string>();
  const middle: string[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.subject)) continue;
    seen.add(candidate.subject);
    middle.push(candidate.text);
    if (middle.length === 2) break;
  }

  // Slot 4 — the nearest everyday positive.
  const everyday: { label: string; nearest: { name: string; miles: number } | null }[] = [
    { label: "Vet", nearest: nearestOf(categoryOf(nearby, "vets")) },
    { label: "Park", nearest: nearestOf(categoryOf(nearby, "parks")) },
    { label: "GP", nearest: gp },
  ];
  let slot4: string | null = null;
  let best: { label: string; miles: number } | null = null;
  for (const entry of everyday) {
    if (entry.nearest && (!best || entry.nearest.miles < best.miles))
      best = { label: entry.label, miles: entry.nearest.miles };
  }
  if (best) slot4 = `${best.label} ${formatMiles(best.miles)} mi`;
  else {
    const station = nearestOf(categoryOf(nearby, "station"));
    const supermarket = nearestOf(categoryOf(nearby, "supermarket"));
    const fallback = [
      { label: "Station", nearest: station },
      { label: "Supermarket", nearest: supermarket },
    ]
      .filter((entry) => entry.nearest !== null)
      .sort((a, b) => (a.nearest?.miles ?? 0) - (b.nearest?.miles ?? 0))[0];
    if (fallback?.nearest) slot4 = `${fallback.label} ${formatMiles(fallback.nearest.miles)} mi`;
  }

  const pills = [slot1, ...middle, slot4].filter((pill): pill is string => pill !== null);
  // The strip is the four-pill form. A check that cannot
  // fill the schools slot and at least the two middle slots
  // (Scotland / NI, where flood and crime do not cover)
  // renders no strip rather than a partial one.
  if (slot1 === null || middle.length < 2) return null;
  return pills;
}

// ------------------------------------------------------------------
// The live-warnings strip (ruling 1): the SHORT form renders
// as a slim line directly under the summary strip, only when
// a warning is active — severity, area, the official link.
// The failure line travels with it (D42: silence in the
// headline during a flood would read as "no warning"); the
// no-warning line does not travel, so the none state renders
// nothing here. Named empty states render only in the flood
// section.
// ------------------------------------------------------------------

export type WarningsStripView =
  | {
      kind: "warnings";
      items: { severity: string; areaDescription: string }[];
      link: { label: string; url: string };
    }
  | { kind: "unavailable"; line: string }
  | { kind: "none" };

export function warningsStrip(flood: FloodBundle): WarningsStripView {
  if (flood.kind !== "flood" || flood.flood.state !== "served") return { kind: "none" };
  const warnings = flood.flood.liveWarnings;
  if (!warnings) return { kind: "none" };
  if (warnings.state === "warnings")
    return {
      kind: "warnings",
      items: warnings.warnings.map((warning) => ({
        severity: warning.severity,
        areaDescription: warning.areaDescription,
      })),
      link: warnings.link,
    };
  // Both named states carry their line by construction
  // (lib/flood.ts's composition); the type admits null for
  // the warnings state, which is handled above.
  if (warnings.state === "unavailable") return { kind: "unavailable", line: warnings.line ?? "" };
  return { kind: "none" };
}

// The flood section's live-warnings block, in FULL form
// (the step text): severity, area description, the EA
// message in full, the raised stamp, attribution and the
// official link — or one of the two named empty states
// (the no-warning line; the could-not-check line).
export function floodWarningsBlock(warnings: FloodLiveWarnings): SectionBlock {
  if (warnings.state === "warnings")
    return {
      type: "flood-warnings",
      warnings: warnings.warnings.map((warning) => ({
        severity: warning.severity,
        areaDescription: warning.areaDescription,
        message: warning.message,
        raisedLine: warning.raisedLine,
      })),
      overflowLine: warnings.overflowLine,
      attributionLine: warnings.attributionLine,
      link: warnings.link,
    };
  return { type: "notice", variant: "warning", text: warnings.line ?? "" };
}

// ------------------------------------------------------------------
// The results view — rungs 1 and 2 (and Scotland / NI, whose
// bundles serve their not-covered states in place)
// ------------------------------------------------------------------

export interface ResultsInput {
  resolution: AddressResolution;
  nearby: NearbyBundle;
  flood: FloodBundle;
  crime: CrimeBundle;
  sold: SoldPricesBundle;
  area: AreaBundle;
  short: Extract<ShortBundle, { kind: "short-bundle" }>;
}

export interface ResultsView {
  pills: string[] | null;
  warningsStrip: WarningsStripView;
  // The flood section's live-warnings state as served, so
  // the page (and its tests) can name the state the flood
  // section renders: "warnings" | "none" | "unavailable",
  // or null where flood does not serve (not covered, wider
  // area).
  floodWarningsState: "warnings" | "none" | "unavailable" | null;
  tabs: ResultsTabView[];
}

function linesSection(
  key: string,
  heading: string,
  blocks: SectionBlock[],
  sourceLine: string | null = null,
): ResultsSectionView {
  return { key, heading, blocks, sourceLine };
}

export function buildResultsView(input: ResultsInput): ResultsView {
  const { resolution, flood, crime, area, short } = input;
  const sections = short.sections;
  const linkable = reportLinkable(resolution.rung);
  const nearby = input.nearby.kind === "distances" ? input.nearby : null;
  const categories = new Map<string, CategoryAnswer>(
    (nearby?.categories ?? []).map((category) => [category.category, category]),
  );
  const group = (key: string, table: Record<string, CategoryPresentation>): ResultsSectionView => {
    const presentation = table[key];
    const category = categories.get(key);
    if (!category)
      return linesSection(key, presentation.heading, [
        { type: "line", text: "This check is not covered for this postcode." },
      ]);
    return linesSection(key, presentation.heading, [
      { type: "places", group: placeGroupView(category, presentation, linkable) },
    ]);
  };

  // --- Family Checks --------------------------------------
  const familySections: ResultsSectionView[] = [];
  familySections.push(group("schools-primary", FAMILY_CATEGORIES));
  familySections.push(group("schools-secondary", FAMILY_CATEGORIES));
  familySections.push(group("sixth-forms", FAMILY_CATEGORIES));
  // The catchment honesty block and the served school
  // deadlines line ride together: both are England / Wales
  // schools-admin content, present exactly when the brain
  // serves a deadlines line (never for Scotland / NI).
  const deadlines = nearby?.schoolDeadlines ?? null;
  if (deadlines) {
    familySections.push(
      linesSection("catchment", CATCHMENT_BLOCK_HEADING, [
        { type: "line", text: CATCHMENT_BLOCK_LINE },
        { type: "link", label: CATCHMENT_LINK.label, url: CATCHMENT_LINK.url },
        { type: "line", text: deadlines.line },
      ]),
    );
  }
  familySections.push(group("nurseries", FAMILY_CATEGORIES));
  familySections.push(group("gp", FAMILY_CATEGORIES));
  familySections.push(group("dentist", FAMILY_CATEGORIES));
  familySections.push(group("pharmacy", FAMILY_CATEGORIES));
  familySections.push(group("ae", FAMILY_CATEGORIES));
  familySections.push(group("maternity", FAMILY_CATEGORIES));

  // Air quality: the headline NO2 figure and the section's
  // own line. The yardsticks are report depth and are never
  // read here.
  {
    const air = sections.air;
    const blocks: SectionBlock[] = [];
    if (air.headlineFigure) blocks.push({ type: "line", text: air.headlineFigure.line });
    if (air.line) blocks.push({ type: "line", text: air.line });
    if (blocks.length === 0)
      blocks.push({ type: "line", text: "Air quality is not covered for this postcode." });
    const sourceLine = area.kind === "area-bundle" ? area.sections.air.sourceLine : null;
    familySections.push(linesSection("air", "Air quality", blocks, sourceLine));
  }

  // Noise beside air (Final Design placement), from the
  // full area section: the publisher's band text verbatim,
  // day and night, per mapped source — or the section's
  // named not-filed / not-covered line, which is the
  // expected default until a national filing exists.
  {
    const blocks: SectionBlock[] = [];
    let sourceLine: string | null = null;
    if (area.kind === "area-bundle") {
      const noise = area.sections.noise;
      sourceLine = noise.sourceLine;
      if (noise.state === "served") {
        for (const band of noise.bands) blocks.push({ type: "line", text: band.line });
        if (blocks.length === 0 && noise.line) blocks.push({ type: "line", text: noise.line });
      } else if (noise.line) {
        blocks.push({ type: "line", text: noise.line });
      }
    }
    if (blocks.length === 0)
      blocks.push({ type: "line", text: "Noise bands are not covered for this postcode." });
    familySections.push(linesSection("noise", "Noise", blocks, sourceLine));
  }

  // Crime: the count and window, then the D39 calibration
  // pair together with their basis line, under the same
  // stale line when the counts serve stale. Wales serves
  // counts with no calibration pair (both figures null) —
  // the counts render, the pair does not.
  {
    const crimeSection = sections.crime;
    const blocks: SectionBlock[] = [];
    let sourceLine: string | null = null;
    if (crimeSection.state === "served") {
      sourceLine = crimeSection.sourceLine;
      if (crimeSection.staleLine)
        blocks.push({ type: "notice", variant: "stale", text: crimeSection.staleLine });
      blocks.push({ type: "line", text: crimeSection.totalLine });
      blocks.push({ type: "line", text: crimeSection.windowLine });
      if (crimeSection.perHeadLine) blocks.push({ type: "line", text: crimeSection.perHeadLine });
      if (crimeSection.englandLine) blocks.push({ type: "line", text: crimeSection.englandLine });
      const basisLine =
        crime.kind === "crime" && crime.crime.state === "served"
          ? crime.crime.perHead?.basisLine
          : undefined;
      if (crimeSection.perHeadLine && basisLine) blocks.push({ type: "line", text: basisLine });
    } else {
      blocks.push({ type: "line", text: crimeSection.reason });
    }
    familySections.push(linesSection("crime", "Crime", blocks, sourceLine));
  }

  // --- What's Nearby --------------------------------------
  const nearbySections = Object.keys(NEARBY_CATEGORIES).map((key) => group(key, NEARBY_CATEGORIES));

  // --- Home, Costs & Risks --------------------------------
  const homeSections: ResultsSectionView[] = [];

  // Sold prices (D23): the served headline facts only — the
  // home's last sale and the postcode median with its count
  // and span. The design's computed tiles (change since the
  // previous sale, time held, annual growth) are DROPPED by
  // the M6.23 sweep (B7) under D23: nothing is computed
  // here, ever.
  {
    const sold = sections.soldPrices;
    const blocks: SectionBlock[] = [];
    if (sold.state === "served") {
      if (sold.stateLine) blocks.push({ type: "line", text: sold.stateLine });
      const tiles: { label: string; value: string }[] = [];
      if (sold.ownLastSale)
        tiles.push({
          label: "Last sale of this home",
          value: `${formatPounds(sold.ownLastSale.price)} — ${formatFiledDate(sold.ownLastSale.date)}`,
        });
      if (sold.median.state === "served" && sold.median.value !== null)
        tiles.push({ label: "Postcode median", value: formatPounds(sold.median.value) });
      if (tiles.length > 0) blocks.push({ type: "tiles", tiles });
      if (sold.ownLine) blocks.push({ type: "line", text: sold.ownLine });
      if (sold.median.line) blocks.push({ type: "line", text: sold.median.line });
      if (sold.buildingMedian?.line) blocks.push({ type: "line", text: sold.buildingMedian.line });
      homeSections.push(linesSection("sold-prices", "Sold prices", blocks, sold.sourceLine));
    } else {
      blocks.push({ type: "line", text: sold.reason });
      homeSections.push(linesSection("sold-prices", "Sold prices", blocks));
    }
  }

  // Council tax: the short bundle's composed correction
  // line (the authority's Band D average, never this home's
  // bill), with the D33 monthly line beside it.
  {
    const tax = sections.councilTax;
    const blocks: SectionBlock[] = [];
    if (tax.line) blocks.push({ type: "line", text: tax.line });
    let sourceLine: string | null = null;
    if (area.kind === "area-bundle") {
      sourceLine = area.sections.councilTax.sourceLine;
      const monthly = area.sections.councilTax.monthlyLine;
      if (tax.state === "served" && monthly) blocks.push({ type: "line", text: monthly });
    }
    if (blocks.length === 0)
      blocks.push({ type: "line", text: "Council tax is not covered for this postcode." });
    homeSections.push(linesSection("council-tax", "Council tax", blocks, sourceLine));
  }

  // EPC: the headline assessment only — the construction
  // block and the certificate spread are report depth.
  {
    const epc = sections.epc;
    const blocks: SectionBlock[] = [];
    if (epc.headlineAssessmentLabel)
      blocks.push({ type: "line", text: epc.headlineAssessmentLabel });
    if (epc.line) blocks.push({ type: "line", text: epc.line });
    if (blocks.length === 0)
      blocks.push({ type: "line", text: "Energy certificates are not covered for this postcode." });
    const sourceLine = area.kind === "area-bundle" ? area.sections.epc.sourceLine : null;
    homeSections.push(linesSection("epc", "Energy (EPC)", blocks, sourceLine));
  }

  // Flood: the live-warnings block FIRST, in full form,
  // then the three layers' headline lines (never merged,
  // D25). Defences and the climate outlook are report
  // depth and are never read here.
  {
    const blocks: SectionBlock[] = [];
    if (flood.kind === "flood" && flood.flood.state === "served") {
      if (flood.flood.liveWarnings) blocks.push(floodWarningsBlock(flood.flood.liveWarnings));
      const shortFlood = sections.flood;
      if (shortFlood.state === "served") {
        for (const layer of shortFlood.layers) {
          blocks.push({ type: "line", text: layer.line });
          if (layer.coveringDefinition)
            blocks.push({ type: "line", text: layer.coveringDefinition });
          if (layer.sourceLine) blocks.push({ type: "line", text: layer.sourceLine });
        }
      }
    } else if (flood.kind === "not-covered") {
      blocks.push({ type: "line", text: flood.flood.reason });
    }
    if (blocks.length === 0)
      blocks.push({ type: "line", text: "Flood answers are not covered for this postcode." });
    homeSections.push(linesSection("flood", "Flood risk", blocks));
  }

  // Planning applications (D31): the hand-off — the
  // section's own line and its official register link. No
  // applications data is held or scraped, ever.
  {
    const blocks: SectionBlock[] = [];
    let sourceLine: string | null = null;
    if (area.kind === "area-bundle") {
      const planning = area.sections.planningApplications;
      sourceLine = planning.sourceLine;
      blocks.push({ type: "line", text: planning.line });
      if (planning.link)
        blocks.push({ type: "link", label: planning.link.label, url: planning.link.url });
    }
    if (blocks.length === 0)
      blocks.push({
        type: "line",
        text: "Planning applications are not covered for this postcode.",
      });
    homeSections.push(linesSection("planning", "Planning applications", blocks, sourceLine));
  }

  // Constraints: the short bundle's polygon layers only
  // (conservation area, Article 4, green belt, built-up
  // area) and the brownfield line. Article 4's filed codes
  // stay at report depth — the short layer carries none.
  {
    const constraints = sections.constraints;
    const blocks: SectionBlock[] = [];
    for (const layer of [
      constraints.conservationArea,
      constraints.article4,
      constraints.greenBelt,
      constraints.builtUpArea,
    ]) {
      blocks.push({ type: "line", text: layer.line });
      if (layer.beyondLine) blocks.push({ type: "line", text: layer.beyondLine });
    }
    blocks.push({ type: "line", text: constraints.brownfield.line });
    if (constraints.brownfield.beyondLine)
      blocks.push({ type: "line", text: constraints.brownfield.beyondLine });
    homeSections.push(
      linesSection(
        "constraints",
        "Planning constraints",
        blocks,
        constraints.conservationArea.sourceLine,
      ),
    );
  }

  // Heritage: the listed-buildings count line and the
  // home's own at-point state, as served.
  {
    const heritage = sections.heritage;
    const blocks: SectionBlock[] = [{ type: "line", text: heritage.listed.line }];
    if (heritage.listed.beyondLine) blocks.push({ type: "line", text: heritage.listed.beyondLine });
    if (heritage.atPoint.state === "recorded")
      blocks.push({ type: "line", text: heritage.atPoint.line });
    else if (heritage.atPoint.state === "needs-exact-home")
      blocks.push({ type: "line", text: heritage.atPoint.reason });
    homeSections.push(linesSection("heritage", "Heritage", blocks, heritage.sourceLine));
  }

  // Nature: the served lines only — designations, places,
  // ancient woodland, priority habitat.
  {
    const nature = sections.nature;
    const blocks: SectionBlock[] = [];
    if (nature.coverageLine) blocks.push({ type: "line", text: nature.coverageLine });
    blocks.push({ type: "line", text: nature.placesLine });
    if (nature.designationsLine) blocks.push({ type: "line", text: nature.designationsLine });
    if (nature.beyondLine) blocks.push({ type: "line", text: nature.beyondLine });
    blocks.push({ type: "line", text: nature.ancientWoodland.line });
    blocks.push({ type: "line", text: nature.priorityHabitat.line });
    homeSections.push(linesSection("nature", "Nature & green space", blocks, nature.sourceLine));
  }

  // Broadband: the gigabit headline only (D36) — no other
  // connectivity figures on this page.
  {
    const broadband = sections.broadband;
    const blocks: SectionBlock[] = [];
    if (broadband.line) blocks.push({ type: "line", text: broadband.line });
    if (blocks.length === 0)
      blocks.push({ type: "line", text: "Broadband answers are not covered for this postcode." });
    homeSections.push(linesSection("broadband", "Broadband", blocks));
  }

  const tabs: ResultsTabView[] = [
    { id: "family", label: "Family Checks", sections: familySections },
    { id: "nearby", label: "What's Nearby", sections: nearbySections },
    { id: "home", label: "Home, Costs & Risks", sections: homeSections },
  ];

  return {
    pills: nearby ? summaryPills({ nearby, flood, crime, sections }) : null,
    warningsStrip: warningsStrip(flood),
    floodWarningsState:
      flood.kind === "flood" && flood.flood.state === "served" && flood.flood.liveWarnings
        ? flood.flood.liveWarnings.state
        : null,
    tabs,
  };
}

// ------------------------------------------------------------------
// The rung-3 view: every section is its named state — the
// reason the short bundle serves — under its own heading in
// the same three tabs. No figures exist at this rung, no
// summary strip, and no truncation link (ruling 3).
// ------------------------------------------------------------------

const RUNG3_FAMILY: { key: string; heading: string; shortKey: keyof ShortSections | "nearby" }[] = [
  { key: "schools-primary", heading: "Primary schools", shortKey: "nearby" },
  { key: "schools-secondary", heading: "Secondary schools", shortKey: "nearby" },
  { key: "sixth-forms", heading: "Sixth forms and colleges", shortKey: "nearby" },
  { key: "nurseries", heading: "Nurseries & pre-schools", shortKey: "nearby" },
  { key: "gp", heading: "GP surgeries", shortKey: "nearby" },
  { key: "dentist", heading: "NHS dentists", shortKey: "nearby" },
  { key: "pharmacy", heading: "Pharmacies", shortKey: "nearby" },
  { key: "ae", heading: "A&E hospitals", shortKey: "nearby" },
  { key: "maternity", heading: "Maternity units", shortKey: "nearby" },
  { key: "air", heading: "Air quality", shortKey: "air" },
  { key: "noise", heading: "Noise", shortKey: "noise" },
  { key: "crime", heading: "Crime", shortKey: "crime" },
];

export function buildWiderAreaView(
  short: Extract<ShortBundle, { kind: "wider-area" }>,
): ResultsView {
  const named = (shortKey: keyof ShortSections | "nearby"): string =>
    short.sections[shortKey as keyof typeof short.sections].reason;
  const section = (
    key: string,
    heading: string,
    shortKey: keyof ShortSections | "nearby",
  ): ResultsSectionView => linesSection(key, heading, [{ type: "line", text: named(shortKey) }]);

  const family = RUNG3_FAMILY.map((entry) => section(entry.key, entry.heading, entry.shortKey));
  const nearbyTab = Object.entries(NEARBY_CATEGORIES).map(([key, presentation]) =>
    section(key, presentation.heading, "nearby"),
  );
  const home: ResultsSectionView[] = [
    section("sold-prices", "Sold prices", "soldPrices"),
    section("council-tax", "Council tax", "councilTax"),
    section("epc", "Energy (EPC)", "epc"),
    section("flood", "Flood risk", "flood"),
    // The planning hand-off at rung 3 carries the area
    // bundle's own named reason, which the short bundle
    // does not hold a key for; the sentence is the same
    // named-state form.
    linesSection("planning", "Planning applications", [
      { type: "line", text: "planning applications need an exact postcode" },
    ]),
    section("constraints", "Planning constraints", "constraints"),
    section("heritage", "Heritage", "heritage"),
    section("nature", "Nature & green space", "nature"),
    section("broadband", "Broadband", "broadband"),
  ];
  return {
    pills: null,
    warningsStrip: { kind: "none" },
    floodWarningsState: null,
    tabs: [
      { id: "family", label: "Family Checks", sections: family },
      { id: "nearby", label: "What's Nearby", sections: nearbyTab },
      { id: "home", label: "Home, Costs & Risks", sections: home },
    ],
  };
}
