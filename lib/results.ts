import type { AddressResolution } from "./address";
import type { AreaBundle } from "./area-bundle";
import type { CrimeBundle } from "./crime";
import type { FloodBundle, FloodLiveWarnings } from "./flood";
import { nationName, nationOfLsoa, type Nation } from "./journey";
import type { CategoryAnswer, NearbyBundle, NearbyPlace } from "./nearby";
import { REPORT_PRICE_LABEL } from "./site";
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

// The link contract for the door (plan step M7.6, ruling R3
// of its gap check): a link to the report carries the home's
// identity in the same shape the results URL itself uses
// (D44 addressability) — the postcode always, and the home
// key when a home is identified (rung 1). The door resolves
// the parameters when it can and names the home; with
// absent or unresolvable parameters it renders its generic
// form — never an error, never a guessed home. M9 inherits
// this contract unchanged, so the payment page knows which
// home the report is for.
export function reportRoute(postcode: string, homeKey?: string | null): string {
  const params = new URLSearchParams({ postcode });
  if (homeKey) params.set("home", homeKey);
  return `${REPORT_ROUTE}?${params.toString()}`;
}

// ------------------------------------------------------------------
// Small formatters
// ------------------------------------------------------------------

// Miles as the design's pills and rows state them: one
// decimal place, trailing zeros trimmed ("0.4", "5.9",
// "0.1"). The brains serve miles rounded to three decimals;
// the page's display precision is one — the finalised
// sample's form throughout. (CI #205 fix: the two-decimal
// form rendered the Schools pill's secondary figure as
// "1.88 mi" against the settled "1.8 mi".)
export function formatMiles(miles: number): string {
  return String(Number(miles.toFixed(1)));
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
  href: string = REPORT_ROUTE,
): TruncationView | null {
  const n = countWithin - shown;
  if (n <= 0) return null;
  return {
    n,
    text: `Plus ${n} more ${groupLabel} in the detailed report — ${REPORT_PRICE_LABEL}`,
    href: linkable ? href : null,
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
  href: string = REPORT_ROUTE,
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
        href,
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
  | { type: "subheading"; text: string }
  | { type: "upsell"; lead: string; detail: string | null }
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
// D76 (fold-in build): FOUR tabs in this fixed order —
// Family Checks, The Neighbourhood, Home, Costs & Risks,
// What's Nearby (always last). Tab state stays out of the
// URL; Family Checks opens by default; calculators sit
// below the tabs.
export const RESULTS_TABS: { id: string; label: string; sections: string[] }[] = [
  {
    id: "family",
    label: "Family Checks",
    sections: ["schools-primary", "schools-secondary", "catchment", "nurseries", "pets"],
  },
  {
    id: "neighbourhood",
    label: "The Neighbourhood",
    sections: ["census", "crime", "air-noise"],
  },
  {
    id: "home",
    label: "Home, Costs & Risks",
    sections: ["sold-prices", "costs", "flood", "planning-protection"],
  },
  {
    id: "nearby",
    label: "What's Nearby",
    sections: [
      "health",
      "hospitals",
      "parks",
      "shops",
      "transport",
      "food-and-drink",
      "leisure",
      "places-to-visit",
      "worship-libraries",
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
  // D75 (fold-in build): the full area bundle carries the
  // air, noise, IMD and broadband figures several pill
  // factors read. Optional so the pill builder stays
  // callable from the older unit fixtures; a factor whose
  // source is absent is simply "neither".
  area?: AreaBundle | null;
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

// The summary pill as label + figure (D70 R5): the pill
// family renders the label as the pill's text and the
// figure as the design's tinted .dist chip, coloured by
// the figure's own distance band. The composition is
// presentation only — pillText recomposes exactly the
// string the pill logic has always served, and the tests
// pin the recomposed strings byte-identical.
export interface SummaryPill {
  label: string;
  figure: string | null;
  band: DistanceBand | null;
  mark?: string;
}

export function pillText(pill: SummaryPill): string {
  if (!pill.figure) return pill.label;
  return `${pill.label} ${pill.figure}${pill.mark ? ` ${pill.mark}` : ""}`;
}

const milesPill = (label: string, family: DistanceFamily, miles: number): SummaryPill => ({
  label,
  figure: `${formatMiles(miles)} mi`,
  band: distanceBand(family, miles),
});

// D75 pill system (fold-in build, superseding pill logic
// E2): FIVE pills. Concerning facts first in priority
// order, up to three; good facts fill the remaining slots
// in priority order; fewer qualifying facts means fewer
// pills; a fact is concerning/good only across its real
// threshold, and "neither" facts never take a pill. The
// twelve factors in priority order: Flood, Crime, Schools
// (merged), A&E, Air quality, Noise, Deprivation, EPC,
// Vet, Broadband, Train station, Nurseries. Grammar-school
// distance and leisure/parks/shops are NOT pill-eligible.
type PillVerdict = "concerning" | "good" | "neither";
interface PillFactor {
  pill: SummaryPill;
  verdict: PillVerdict;
}

// Exported for one second consumer: the shortlist card's
// flood cell (lib/shortlist-card.ts) derives its two bands
// through this same mapping, so the absence states can
// never drift between the results page and the comparison.
export function floodBandOf(layer: {
  coveringLabel: string | null;
  pointState: string;
}): string | null {
  if (layer.coveringLabel) return layer.coveringLabel;
  // The absence states are all the Very-low case in the
  // flood brain's own framing: Flood Zone 1 (flood_zone),
  // no band published (rofrs), and below the lowest
  // mapped band (rofsw — the surface-water absence state).
  if (
    layer.pointState === "no-band-published" ||
    layer.pointState === "zone-1" ||
    layer.pointState === "below-lowest-band"
  )
    return "Very low";
  return null;
}

function noiseBandHigh(band: string | null, day: boolean): boolean {
  if (!band) return false;
  const nums = [...band.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (nums.length === 0) return false;
  const threshold = day ? 65 : 60;
  // A band is "high" when its range reaches the threshold:
  // its top (or only) figure is at or above it, or the band
  // is worded as that figure "or more".
  return Math.max(...nums) >= threshold;
}

function noiseBandLow(band: string | null, day: boolean): boolean {
  if (!band) return false;
  const limit = day ? 55 : 50;
  return new RegExp(`below ${limit}|<\\s*${limit}`, "i").test(band);
}

export function summaryPills(input: SummaryPillsInput): SummaryPill[] | null {
  const { nearby, crime, sections, area } = input;
  const areaSections = area && area.kind === "area-bundle" ? area.sections : null;
  const factors: PillFactor[] = [];
  const add = (verdict: PillVerdict, pill: SummaryPill) => {
    if (verdict !== "neither") factors.push({ pill, verdict });
  };

  // 1 Flood — concerning if either check (rivers & sea,
  // surface water) is Low or worse; good if both Very low.
  {
    let verdict: PillVerdict = "neither";
    let figure: string | null = null;
    if (sections.flood.state === "served") {
      const bands = sections.flood.layers
        .filter((layer) => layer.layer === "rofrs" || layer.layer === "rofsw")
        .map((layer) => floodBandOf(layer));
      if (bands.length === 2 && bands.every((band) => band !== null)) {
        const rank = (band: string) =>
          band === "High" ? 3 : band === "Medium" ? 2 : band === "Low" ? 1 : 0;
        const worst = bands.reduce((a, b) => (rank(a as string) >= rank(b as string) ? a : b));
        if (bands.some((band) => band !== "Very low")) verdict = "concerning";
        else verdict = "good";
        figure = worst;
      }
    }
    if (figure) add(verdict, { label: "Flood", figure, band: null });
  }

  // 2 Crime — concerning above the England per-1,000
  // figure; good below it.
  {
    const served = crime.kind === "crime" && crime.crime.state === "served" ? crime.crime : null;
    const per1000 = served?.perHead?.per1000 ?? null;
    const england = served?.englandFigure?.englandPer1000 ?? null;
    if (per1000 !== null && england !== null && per1000 !== england) {
      const concerning = per1000 > england;
      add(concerning ? "concerning" : "good", {
        label: "Crime",
        figure: concerning ? "Above England average" : "Below England average",
        band: null,
      });
    }
  }

  // 3 Schools (primary + secondary MERGED) — concerning if
  // nearest primary >1 mi OR nearest secondary >1.5 mi;
  // good only if primary <=0.5 AND secondary <=1.
  {
    const primary = nearestOf(categoryOf(nearby, "schools-primary"));
    const secondary = nearestOf(categoryOf(nearby, "schools-secondary"));
    if (primary && secondary) {
      const concerning = primary.miles > 1 || secondary.miles > 1.5;
      const good = !concerning && primary.miles <= 0.5 && secondary.miles <= 1;
      add(concerning ? "concerning" : good ? "good" : "neither", {
        label: "Schools",
        figure: `${formatMiles(primary.miles)} / ${formatMiles(secondary.miles)} mi`,
        band: concerning ? "red" : good ? "green" : "orange",
      });
    } else if (primary || secondary) {
      const only = (primary ?? secondary) as { miles: number };
      const breach = primary ? only.miles > 1 : only.miles > 1.5;
      if (breach)
        add("concerning", {
          label: "Schools",
          figure: `${formatMiles(only.miles)} mi`,
          band: "red",
        });
    }
  }

  // 4 A&E — concerning >7 mi; good <=5 mi.
  {
    const ae = nearestOf(categoryOf(nearby, "ae"));
    if (ae) {
      const verdict: PillVerdict = ae.miles > 7 ? "concerning" : ae.miles <= 5 ? "good" : "neither";
      add(verdict, milesPill("A&E", "hospital", ae.miles));
    }
  }

  // 5 Air quality — good if NO2, PM2.5 and PM10 ALL at or
  // under WHO 2021 (10/5/15); concerning if any breaks its
  // UK legal limit (NO2 40, PM2.5 20, PM10 40).
  {
    const air = areaSections?.air;
    if (
      air &&
      air.state === "served" &&
      air.no2 !== null &&
      air.pm25 !== null &&
      air.pm10 !== null
    ) {
      const concerning = air.no2 > 40 || air.pm25 > 20 || air.pm10 > 40;
      const good = !concerning && air.no2 <= 10 && air.pm25 <= 5 && air.pm10 <= 15;
      add(concerning ? "concerning" : good ? "good" : "neither", {
        label: "Air quality",
        figure: concerning ? "Above a UK legal limit" : "Within WHO guidelines",
        band: null,
      });
    }
  }

  // 6 Noise — good if road AND rail both in the lowest
  // modelled bands (day <55 dB, night <50 dB); concerning
  // if day >=65 or night >=60 on either.
  {
    const noise = areaSections?.noise;
    if (noise && noise.state === "served" && noise.bands.length > 0) {
      const concerning = noise.bands.some(
        (band) => noiseBandHigh(band.dayBand, true) || noiseBandHigh(band.nightBand, false),
      );
      const road = noise.bands.find((band) => band.sourceKind === "road");
      const rail = noise.bands.find((band) => band.sourceKind === "rail");
      const good =
        !concerning &&
        road !== undefined &&
        rail !== undefined &&
        noiseBandLow(road.dayBand, true) &&
        noiseBandLow(road.nightBand, false) &&
        noiseBandLow(rail.dayBand, true) &&
        noiseBandLow(rail.nightBand, false);
      add(concerning ? "concerning" : good ? "good" : "neither", {
        label: "Noise",
        figure: concerning ? "Noisy" : "Quiet",
        band: null,
      });
    }
  }

  // 7 Deprivation — good at IMD decile 8-10; concerning at
  // decile 1-3; the pill states the decile.
  {
    const decile = areaSections?.imd?.state === "served" ? areaSections.imd.decile : null;
    if (decile !== null && decile !== undefined) {
      const verdict: PillVerdict = decile >= 8 ? "good" : decile <= 3 ? "concerning" : "neither";
      add(verdict, { label: "Deprivation", figure: `${decile} of 10`, band: null });
    }
  }

  // 8 EPC — concerning at D or below; good at A or B; C
  // neither; only when the home has a certificate.
  {
    const band = sections.epc.headlineBand;
    if (band) {
      const verdict: PillVerdict =
        band === "A" || band === "B" ? "good" : band === "C" ? "neither" : "concerning";
      add(verdict, { label: "EPC", figure: band, band: null });
    }
  }

  // 9 Vet — good <=2 mi; concerning >5 mi.
  {
    const vet = nearestOf(categoryOf(nearby, "vets"));
    if (vet) {
      const verdict: PillVerdict =
        vet.miles > 5 ? "concerning" : vet.miles <= 2 ? "good" : "neither";
      add(verdict, milesPill("Vet", "everyday", vet.miles));
    }
  }

  // 10 Broadband — concerning if not even superfast is
  // available at the postcode; good if full fibre (the
  // gigabit-capable figure) is available.
  {
    const broadband = areaSections?.broadband;
    if (broadband && broadband.state === "served") {
      const concerning = broadband.superfast30Pct !== null && broadband.superfast30Pct <= 0;
      const good =
        !concerning && broadband.gigabitCapablePct !== null && broadband.gigabitCapablePct > 0;
      add(concerning ? "concerning" : good ? "good" : "neither", {
        label: "Broadband",
        figure: concerning ? "No superfast" : "Full fibre available",
        band: null,
      });
    } else if (
      sections.broadband.gigabitCapablePct !== null &&
      sections.broadband.gigabitCapablePct > 0
    ) {
      add("good", { label: "Broadband", figure: "Full fibre available", band: null });
    }
  }

  // 11 Train station — good <=1 mi; concerning >3 mi.
  {
    const station = nearestOf(categoryOf(nearby, "station"));
    if (station) {
      const verdict: PillVerdict =
        station.miles > 3 ? "concerning" : station.miles <= 1 ? "good" : "neither";
      add(verdict, milesPill("Train station", "everyday", station.miles));
    }
  }

  // 12 Nurseries — concerning >1 mi; good <=0.5 mi.
  {
    const nursery = nearestOf(categoryOf(nearby, "nurseries"));
    if (nursery) {
      const verdict: PillVerdict =
        nursery.miles > 1 ? "concerning" : nursery.miles <= 0.5 ? "good" : "neither";
      add(verdict, milesPill("Nurseries", "school", nursery.miles));
    }
  }

  const concerning = factors.filter((f) => f.verdict === "concerning").slice(0, 3);
  const good = factors.filter((f) => f.verdict === "good");
  const pills = [...concerning, ...good].slice(0, 5).map((f) => f.pill);
  return pills.length > 0 ? pills : null;
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
  // The resolved home's identity (the serve layer's cache
  // key), carried in so the report-door links can name the
  // home (M7.6 link contract). The view builder never
  // derives it — this module stays out of the bundle-cache
  // graph, which client components importing from here
  // depend on. Absent, the links degrade to the postcode
  // form; they never name a wrong home.
  homeKey?: string | null;
}

export const BUY_BAR_HEADING = "Get the full detailed report for this home";
// Founder ruling, 17 Nov 2026 (alignment fix F4, softened
// form adopted): the buy bar must NOT promise flood map
// pictures — location maps only.
export const BUY_BAR_LINE =
  "Everything behind the headlines — the breakdowns, the flood findings with location maps, the fuller EPC detail and the questions to ask the seller — in one dated, print-ready document. Or save this home and compare it first.";
// The mystery tease (D21 as amended, founder ruling
// 17 Nov 2026): a content-free line, permitted before
// purchase in exactly two places — this buy bar and the
// payment page. It names nothing about the extra (the
// Check Together gift stays a surprise until the delivery
// email), and it exists only in the paid journey: while
// the door is in its holding state the bar still carries
// it, because the bar is a paid-journey surface — the
// free launch window's own surfaces are M9.6's to pin,
// and gift tokens stay inactive there.
export const BUY_BAR_MYSTERY_LINE =
  "Every report comes with a mystery extra, on us — it arrives in your email with your report.";
export const BUY_BAR_MYSTERY_EYEBROW = "A mystery extra";
export const FLOOD_UPSELL_LEAD =
  "Plus the flood findings in full, with a location map for each check";
export const FLOOD_UPSELL_DETAIL =
  "The defences near this home, and how the picture changes in the years ahead.";
// D77(c) absence/failure copy, pinned.
export const COULD_NOT_PULL_LINE =
  "We couldn't pull this just now — the rest of your check is below. Try again in a little while.";
export function notCoveredLine(checkName: string, nation: Nation): string {
  return `${checkName} isn't part of this check in ${nationName(nation)} — the figures we use cover England and Wales.`;
}

// Nation gating (Scotland/NI gap check, fold-in workstream
// 6): the class (a) England-only-register categories, gated
// in this presentation layer only — zero brain changes, so
// zero contract pins and zero replay cells move.
export const NATION_GATED_CATEGORIES: Record<string, readonly string[]> = {
  scotland: [
    "schools-primary",
    "schools-secondary",
    "sixth-forms",
    "gp",
    "dentist",
    "pharmacy",
    "ae",
    "maternity",
    "nurseries",
  ],
  "northern-ireland": [
    "schools-primary",
    "schools-secondary",
    "sixth-forms",
    "gp",
    "dentist",
    "pharmacy",
    "ae",
    "maternity",
    "nurseries",
    "station",
    "bus-stop",
    "parks",
  ],
  wales: ["ae", "maternity"],
};

export interface ResultsView {
  pills: SummaryPill[] | null;
  // The door's link for this page, carrying the home's
  // identity under the M7.6 contract (reportRoute): the
  // buy bar's button and every section upsell read it.
  // Null on the wider-area view, which offers no report.
  reportHref: string | null;
  buyBar: { heading: string; line: string; mysteryLine: string; href: string } | null;
  calculators: { lastSalePrice: number | null };
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

// The beyond-nearest radius (CI #205 fix): a beyond row
// names the nearest essential service when none sits
// within 2 miles — a local pointer. Beyond this radius
// the named place is not a local fact in any useful
// sense, and on an excerpted filing it is exactly the
// Scotland defect's signature (an England-register
// nearest hundreds of miles away, served because the
// GB/UK-wide datasets — NaPTAN, OpenStreetMap, Open
// Charge Map — are not nation-gated). The results layer
// therefore serves the category's no-finding line
// instead of the row, in every nation: the transformation
// sits beside the nation gating and feeds the same two
// consumers (sections and pills). 25 miles stands well
// clear of every golden's legitimate beyond row — the
// corpus maximum is Cheam Fields Primary Academy at
// 14.671 miles (tests/nearby.test.ts) — and in
// production, with the national filing in place, those
// datasets serve real near rows for Scottish and NI
// homes, so the rule costs nothing there; it bites only
// on excerpt artefacts and genuinely remote pointers,
// where the named no-finding state is the D30-honest
// answer. Presentation only, like the gating: no brain
// output changes, so no contract pin or replay cell
// moves.
export const BEYOND_NEAREST_RADIUS_MILES = 25;

function farBeyondLine(category: CategoryAnswer): string {
  // The brain's own no-finding forms (lib/nearby.ts
  // emptyLine), mirrored from the served label: the
  // map-held supermarket category carries the map-gap
  // caveat; the rest carry the plain form.
  return category.category === "supermarket"
    ? `no ${category.label} recorded within 2 miles on the map data we hold — a gap in the map is not proof that none exists`
    : `no ${category.label} within 2 miles of the postcode point`;
}

function suppressFarBeyond(category: CategoryAnswer): CategoryAnswer {
  if (
    category.state !== "none-within" ||
    !category.beyondNearest ||
    category.beyondNearest.miles <= BEYOND_NEAREST_RADIUS_MILES
  )
    return category;
  return { ...category, beyondNearest: null, line: farBeyondLine(category) };
}

export function buildResultsView(input: ResultsInput): ResultsView {
  const { resolution, flood, crime, area, short } = input;
  const sections = short.sections;
  const linkable = reportLinkable(resolution.rung);
  // The one door link for this page (M7.6 link contract):
  // the postcode always, the home key at rung 1 — the same
  // identity the results URL itself carries.
  const reportHref = reportRoute(
    "directory" in resolution ? resolution.directory.postcode : "",
    resolution.rung === 1 ? (input.homeKey ?? null) : null,
  );
  const nation = nationOfLsoa("directory" in resolution ? resolution.directory.lsoaCode : null);
  const gated = new Set(NATION_GATED_CATEGORIES[nation] ?? []);
  const nearby = input.nearby.kind === "distances" ? input.nearby : null;
  // The gated categories are treated as absent everywhere
  // in this view — sections and pills alike (gap check
  // Section 3: one gate feeds both consumers). Beyond
  // rows past the sane radius are suppressed at the same
  // point, for the same reason (CI #205 fix).
  const effectiveNearby = nearby
    ? {
        ...nearby,
        categories: nearby.categories.filter((c) => !gated.has(c.category)).map(suppressFarBeyond),
      }
    : null;
  const categories = new Map<string, CategoryAnswer>(
    (effectiveNearby?.categories ?? []).map((category) => [category.category, category]),
  );
  const areaSections = area.kind === "area-bundle" ? area.sections : null;

  const group = (key: string, table: Record<string, CategoryPresentation>): ResultsSectionView => {
    const presentation = table[key];
    if (gated.has(key))
      return linesSection(key, presentation.heading, [
        { type: "line", text: notCoveredLine(presentation.heading, nation) },
      ]);
    const category = categories.get(key);
    if (!category)
      return linesSection(key, presentation.heading, [
        { type: "line", text: COULD_NOT_PULL_LINE },
        { type: "link", label: "Try again", url: "" },
      ]);
    return linesSection(key, presentation.heading, [
      { type: "places", group: placeGroupView(category, presentation, linkable, reportHref) },
    ]);
  };

  const withUpsell = (
    section: ResultsSectionView,
    lead: string | null,
    detail: string | null,
  ): ResultsSectionView => {
    if (lead) section.blocks.push({ type: "upsell", lead, detail });
    return section;
  };
  const placesUpsell = (
    key: string,
    table: Record<string, CategoryPresentation>,
    lead: string | null,
    detail: string | null,
  ): ResultsSectionView => withUpsell(group(key, table), lead, detail);
  // A schools-style upsell from the group's own truncation:
  // lead names the unshown count, detail the full count.
  const schoolsUpsell = (key: string, noun: string, detailTail: string): ResultsSectionView => {
    const section = group(key, FAMILY_CATEGORIES);
    const first = section.blocks[0];
    if (first && first.type === "places" && first.group.truncation) {
      const category = categories.get(key);
      const total = category?.countWithin ?? 0;
      section.blocks.push({
        type: "upsell",
        lead: `Plus ${first.group.truncation.n} more ${noun}`,
        detail: `All ${total}, with their Ofsted ratings and inspection dates${detailTail}`,
      });
    }
    return section;
  };

  // --- Family Checks --------------------------------------
  const familySections: ResultsSectionView[] = [];
  familySections.push(schoolsUpsell("schools-primary", "primary schools", ""));
  familySections.push(
    schoolsUpsell("schools-secondary", "secondary schools", ", and sixth-form provision"),
  );
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
  {
    const nurseries = group("nurseries", FAMILY_CATEGORIES);
    const category = categories.get("nurseries");
    if (category && category.state === "within")
      nurseries.blocks.push({
        type: "upsell",
        lead: "Plus more nurseries & pre-schools",
        detail: "The full list of nurseries and pre-schools near this home.",
      });
    familySections.push(nurseries);
  }
  // Pets (D76): vet, pet shops and pet boarding in one
  // section, the boarding as a subsection.
  {
    const blocks: SectionBlock[] = [];
    const vets = group("vets", NEARBY_CATEGORIES);
    blocks.push(...vets.blocks);
    const vetCategory = categories.get("vets");
    if (vetCategory && vetCategory.state === "within")
      blocks.push({
        type: "upsell",
        lead: "Plus dog-walking areas, pet shops & more vets",
        detail: null,
      });
    blocks.push({ type: "subheading", text: "Pet boarding — kennels & catteries" });
    blocks.push(...group("pet-boarding", NEARBY_CATEGORIES).blocks);
    blocks.push(...group("pet-shops", NEARBY_CATEGORIES).blocks);
    familySections.push(linesSection("pets", "Pets", blocks));
  }

  // --- The Neighbourhood ----------------------------------
  const neighbourhoodSections: ResultsSectionView[] = [];
  // The census headlines block (D77(e)): four labelled
  // lines composed from the served Census tables + the IMD
  // decile, with the finalized small print.
  {
    const blocks: SectionBlock[] = [];
    const census = areaSections?.census;
    const imd = areaSections?.imd;
    if (census && census.state === "served") {
      const table = (code: string) => census.tables.find((t) => t.code === code);
      const rowPct = (code: string, label: string) =>
        table(code)?.rows.find((r) => r.label === label)?.pct ?? null;
      const owned = rowPct("ts054", "Owned");
      const outright = rowPct("ts054", "Owned: Owns outright");
      const mortgage = rowPct("ts054", "Owned: Owns with a mortgage or loan");
      const social = census.socialRented?.pct ?? rowPct("ts054", "Social rented");
      const priv = rowPct("ts054", "Private rented");
      if (
        owned !== null &&
        outright !== null &&
        mortgage !== null &&
        social !== null &&
        priv !== null
      )
        blocks.push({
          type: "line",
          text: `Owning and renting — ${Math.round(owned / 10)} in 10 households own their home: ${Math.round(outright)}% outright and ${Math.round(mortgage)}% with a mortgage. ${Math.round(social)}% rent from a social landlord, ${Math.round(priv)}% rent privately.`,
        });
      const ethnic = table("ts021");
      const groups = [...(ethnic?.groups ?? [])].sort((a, b) => b.count - a.count);
      const white = groups.find((g) => g.label === "White");
      const others = groups.filter((g) => g.label !== "White").slice(0, 2);
      const shortGroup = (label: string) =>
        label.startsWith("Mixed")
          ? "Mixed"
          : label.startsWith("Asian")
            ? "Asian"
            : label.startsWith("Black")
              ? "Black"
              : "Other";
      const ageText = census.medianAge
        ? Number.isInteger(census.medianAge.value)
          ? String(census.medianAge.value)
          : census.medianAge.value.toFixed(1).endsWith(".5")
            ? `${Math.floor(census.medianAge.value)}½`
            : String(census.medianAge.value)
        : null;
      if (white && others.length === 2 && ageText)
        blocks.push({
          type: "line",
          text: `The people here — The typical age is ${ageText}. ${Math.round(white.pct)} in 100 residents are White; the next largest groups are ${shortGroup(others[0].label)} (${others[0].pct} in 100) and ${shortGroup(others[1].label)} (${others[1].pct} in 100).`,
        });
      const accom = table("ts044");
      if (accom) {
        const detSemi = accom.rows
          .filter((r) => r.label === "Detached" || r.label === "Semi-detached")
          .reduce((sum, r) => sum + r.pct, 0);
        const flat = accom.rows
          .filter((r) => /flat/i.test(r.label))
          .reduce((sum, r) => sum + r.pct, 0);
        if (detSemi > 0 && flat > 0)
          blocks.push({
            type: "line",
            text: `The homes themselves — Nearly ${Math.round(detSemi / 10)} in 10 are detached or semi-detached houses; about 1 in ${Math.round(100 / flat)} is a flat.`,
          });
      }
      if (imd && imd.state === "served" && imd.decile !== null)
        blocks.push({
          type: "line",
          text: `Deprivation — This postcode's immediate area sits in decile ${imd.decile} of 10, where 10 is the least deprived in England.`,
        });
      if (census.residentsTotal)
        blocks.push({
          type: "line",
          text: `Census 2021 figures cover the wider area around this home — about ${(Math.round(census.residentsTotal / 100) * 100).toLocaleString("en-GB")} residents. The deprivation decile covers the immediate area. Facts as published, in the Census's own words — no scores.`,
        });
      blocks.push({
        type: "upsell",
        lead: "Plus the full Census picture for this area",
        detail:
          "Six tables as published — age, ethnic group, religion, type of home, bedrooms and tenure, every count and percentage.",
      });
      neighbourhoodSections.push(
        linesSection("census", "The neighbourhood in numbers", blocks, census.sourceLine),
      );
    } else {
      blocks.push({
        type: "line",
        text: census?.line ?? "Census 2021 figures are not filed for this area.",
      });
      neighbourhoodSections.push(linesSection("census", "The neighbourhood in numbers", blocks));
    }
  }
  // Crime (D77(a)): the percentage form with the calibration
  // pair beneath; no crime types on the free page. Wales
  // serves counts with no calibration pair — the counts
  // render, the pair does not.
  {
    const crimeSection = sections.crime;
    const blocks: SectionBlock[] = [];
    let sourceLine: string | null = null;
    if (crimeSection.state === "served") {
      sourceLine = crimeSection.sourceLine;
      if (crimeSection.staleLine)
        blocks.push({ type: "notice", variant: "stale", text: crimeSection.staleLine });
      const servedCrime =
        crime.kind === "crime" && crime.crime.state === "served" ? crime.crime : null;
      const per1000 = servedCrime?.perHead?.per1000 ?? null;
      const england = servedCrime?.englandFigure?.englandPer1000 ?? null;
      if (per1000 !== null && england !== null && england > 0) {
        const pct = Math.round(Math.abs(1 - per1000 / england) * 100);
        const direction = per1000 < england ? "below" : per1000 > england ? "above" : "at";
        blocks.push({
          type: "line",
          text:
            direction === "at"
              ? `${crimeSection.total.toLocaleString("en-GB")} crimes recorded in the last 12 months — about the same as the England average.`
              : `${crimeSection.total.toLocaleString("en-GB")} crimes recorded in the last 12 months — about ${pct}% ${direction} the England average.`,
        });
        blocks.push({
          type: "line",
          text: `That's ${String(Number(per1000.toFixed(1)))} recorded crimes for every 1,000 residents here. Across England, the figure is ${String(Number(england.toFixed(1)))}.`,
        });
        blocks.push({
          type: "line",
          text: "Incidents are recorded against nearby streets, not against individual houses.",
        });
      } else {
        blocks.push({ type: "line", text: crimeSection.totalLine });
        blocks.push({ type: "line", text: crimeSection.windowLine });
      }
      blocks.push({
        type: "upsell",
        lead: "Plus crime month by month and by type",
        detail: "Twelve months, every recorded type, in a chart.",
      });
    } else {
      blocks.push({ type: "line", text: crimeSection.reason });
    }
    neighbourhoodSections.push(linesSection("crime", "Crime", blocks, sourceLine));
  }
  // Air quality & noise (D76: one combined section).
  {
    const blocks: SectionBlock[] = [];
    blocks.push({ type: "subheading", text: "Air quality" });
    const air = sections.air;
    if (air.headlineFigure) blocks.push({ type: "line", text: air.headlineFigure.line });
    if (air.line) blocks.push({ type: "line", text: air.line });
    if (blocks.length === 1)
      blocks.push({ type: "line", text: "Air quality is not covered for this postcode." });
    blocks.push({ type: "subheading", text: "Noise" });
    let noiseSource: string | null = null;
    if (areaSections?.noise) {
      const noise = areaSections.noise;
      noiseSource = noise.sourceLine;
      if (noise.state === "served") {
        for (const band of noise.bands) blocks.push({ type: "line", text: band.line });
        if (blocks.length === 3 && noise.line) blocks.push({ type: "line", text: noise.line });
      } else if (noise.line) {
        blocks.push({ type: "line", text: noise.line });
      }
    }
    if (blocks.length === 3)
      blocks.push({ type: "line", text: "Noise bands are not covered for this postcode." });
    let sourceLine: string | null = noiseSource;
    if (area.kind === "area-bundle" && area.sections.air.sourceLine)
      sourceLine = area.sections.air.sourceLine;
    neighbourhoodSections.push(
      linesSection("air-noise", "Air quality & noise", blocks, sourceLine),
    );
  }

  // --- Home, Costs & Risks --------------------------------
  const homeSections: ResultsSectionView[] = [];
  // Sold history (D23): the served headline facts only.
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
      blocks.push({
        type: "upsell",
        lead: "Plus the full sale-by-sale table & sold prices nearby",
        detail: "The median, the range and every sale counted.",
      });
      homeSections.push(linesSection("sold-prices", "Sold history", blocks, sold.sourceLine));
    } else {
      blocks.push({ type: "line", text: sold.reason });
      homeSections.push(linesSection("sold-prices", "Sold history", blocks));
    }
  }
  // Costs (D76/D77): council tax + EPC + EV + broadband &
  // mobile in one section, with the composed monthly lead
  // row where both halves serve (D33's never-sum rule: the
  // lead is a presentation of the two served lines, each
  // still stated in its own row below).
  {
    const blocks: SectionBlock[] = [];
    const tax = sections.councilTax;
    const epc = sections.epc;
    const taxFull = areaSections?.councilTax;
    const certCosts = areaSections?.epc?.certificates?.[0]?.energyCosts ?? null;
    if (
      tax.state === "served" &&
      taxFull?.bandDMonthlyPence != null &&
      taxFull?.bandDAveragePence != null &&
      certCosts
    ) {
      const money = (pence: number) =>
        pence % 100 === 0
          ? formatPounds(pence / 100)
          : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const totalMonthly = taxFull.bandDMonthlyPence + certCosts.currentMonthlyPence;
      blocks.push({
        type: "line",
        text: `About ${money(totalMonthly)} a month: council tax ${money(taxFull.bandDMonthlyPence)} a month (Band D average, ${money(taxFull.bandDAveragePence)} a year) + EPC estimated energy about ${money(certCosts.currentMonthlyPence)} a month (${money(certCosts.currentAnnualPence)} a year). Mortgage not included.`,
      });
    }
    blocks.push({ type: "subheading", text: "Council tax" });
    if (tax.line) blocks.push({ type: "line", text: tax.line });
    if (areaSections?.councilTax?.monthlyLine && tax.state === "served")
      blocks.push({ type: "line", text: areaSections.councilTax.monthlyLine });
    if (tax.line === null && blocks.length === 1)
      blocks.push({ type: "line", text: "Council tax is not covered for this postcode." });
    blocks.push({ type: "subheading", text: "EPC & energy" });
    if (epc.headlineAssessmentLabel)
      blocks.push({ type: "line", text: epc.headlineAssessmentLabel });
    if (epc.line) blocks.push({ type: "line", text: epc.line });
    if (certCosts) blocks.push({ type: "line", text: certCosts.line });
    blocks.push({ type: "subheading", text: "EV charging" });
    blocks.push(...group("ev-chargers", NEARBY_CATEGORIES).blocks);
    blocks.push({ type: "subheading", text: "Broadband & mobile" });
    const broadband = sections.broadband;
    if (broadband.line) blocks.push({ type: "line", text: broadband.line });
    if (areaSections?.mobile?.line) blocks.push({ type: "line", text: areaSections.mobile.line });
    if (!broadband.line && !areaSections?.mobile?.line)
      blocks.push({ type: "line", text: "Broadband answers are not covered for this postcode." });
    blocks.push({
      type: "upsell",
      lead: "Plus every council tax band and the full EPC certificate detail",
      detail:
        "Bands A to H for this council, a year and a month each — plus the certificate's construction, improvements, typical savings and solar figures.",
    });
    const sourceLine =
      area.kind === "area-bundle" ? (area.sections.councilTax?.sourceLine ?? null) : null;
    homeSections.push(linesSection("costs", "Costs", blocks, sourceLine));
  }
  // Flood: live warnings first, then the layers (never
  // merged, D25), then the D77/F4-softened upsell.
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
    blocks.push({ type: "upsell", lead: FLOOD_UPSELL_LEAD, detail: FLOOD_UPSELL_DETAIL });
    homeSections.push(linesSection("flood", "Flood", blocks));
  }
  // Planning, protection & ownership (D76): constraints,
  // nature, heritage and the D31 planning hand-off in one
  // section. The company-ownership line renders ONLY
  // from the served bundle key — absent while
  // COMPANY_OWNERSHIP_ENABLED is off (D77(d)) — and in
  // the founder's single-line form (M7.9, below).
  {
    const blocks: SectionBlock[] = [];
    blocks.push({ type: "subheading", text: "Planning constraints" });
    const constraints = sections.constraints;
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
    blocks.push({ type: "subheading", text: "Nature designations" });
    const nature = sections.nature;
    if (nature.coverageLine) blocks.push({ type: "line", text: nature.coverageLine });
    blocks.push({ type: "line", text: nature.placesLine });
    if (nature.designationsLine) blocks.push({ type: "line", text: nature.designationsLine });
    if (nature.beyondLine) blocks.push({ type: "line", text: nature.beyondLine });
    blocks.push({ type: "line", text: nature.ancientWoodland.line });
    blocks.push({ type: "line", text: nature.priorityHabitat.line });
    blocks.push({ type: "subheading", text: "Listed building & heritage" });
    const heritage = sections.heritage;
    blocks.push({ type: "line", text: heritage.listed.line });
    if (heritage.listed.beyondLine) blocks.push({ type: "line", text: heritage.listed.beyondLine });
    if (heritage.atPoint.state === "recorded")
      blocks.push({ type: "line", text: heritage.atPoint.line });
    else if (heritage.atPoint.state === "needs-exact-home")
      blocks.push({ type: "line", text: heritage.atPoint.reason });
    blocks.push({ type: "subheading", text: "Planning applications nearby" });
    const sourceLine: string | null = constraints.conservationArea.sourceLine;
    // The hand-off is read from the short bundle's pick
    // (M7.9), not the area bundle: one derivation feeds
    // this page and the Phase 2 extension, so both show
    // the same headline unchanged. The rendered page is
    // exactly as before — the area section's sourceLine
    // is null in every nation branch, so the source line
    // was always the constraints one it remains here.
    const planning = sections.planningApplications;
    if (planning) {
      blocks.push({ type: "line", text: planning.line });
      if (planning.link)
        blocks.push({ type: "link", label: planning.link.label, url: planning.link.url });
    }
    if (areaSections?.companyOwnership) {
      const ownership = areaSections.companyOwnership as {
        state?: string;
        line?: string | null;
      };
      blocks.push({ type: "subheading", text: "Company ownership" });
      // The founder's form ruling (17 Nov 2026, M7.9):
      // the free page's company line is the finalised
      // sample's single line — "Owned by a company: Yes."
      // / "Owned by a company: No." — wherever the
      // section serves its boolean answer. The named
      // states keep their honest served lines (no Yes/No
      // is invented where the boolean does not exist);
      // the fuller served sentence with its as-at date
      // remains the report-depth form and is not rendered
      // here.
      if (ownership.state === "served")
        blocks.push({ type: "line", text: "Owned by a company: Yes." });
      else if (ownership.state === "not-company-owned")
        blocks.push({ type: "line", text: "Owned by a company: No." });
      else if (ownership.line) blocks.push({ type: "line", text: ownership.line });
    }
    homeSections.push(
      linesSection("planning-protection", "Planning, protection & ownership", blocks, sourceLine),
    );
  }

  // --- What's Nearby --------------------------------------
  const nearbySections: ResultsSectionView[] = [];
  {
    const blocks: SectionBlock[] = [];
    blocks.push(...group("gp", FAMILY_CATEGORIES).blocks);
    blocks.push(...group("dentist", FAMILY_CATEGORIES).blocks);
    blocks.push(...group("pharmacy", FAMILY_CATEGORIES).blocks);
    blocks.push({ type: "upsell", lead: "Plus more GPs & dentists", detail: null });
    nearbySections.push(linesSection("health", "Health", blocks));
  }
  {
    const blocks: SectionBlock[] = [];
    blocks.push(...group("ae", FAMILY_CATEGORIES).blocks);
    blocks.push(...group("maternity", FAMILY_CATEGORIES).blocks);
    if (!gated.has("ae"))
      blocks.push({
        type: "upsell",
        lead: "Plus maternity, community hospital & more hospitals",
        detail:
          "Every one near this home — maternity with its own rating, and the next-nearest A&E as a fallback.",
      });
    nearbySections.push(linesSection("hospitals", "Hospitals", blocks));
  }
  nearbySections.push(
    placesUpsell("parks", NEARBY_CATEGORIES, "Plus playgrounds, playing fields & more parks", null),
  );
  {
    const shops = placesUpsell(
      "supermarket",
      NEARBY_CATEGORIES,
      "Plus convenience stores & more shops",
      null,
    );
    shops.key = "shops";
    shops.heading = "Shops";
    nearbySections.push(shops);
  }
  {
    const blocks: SectionBlock[] = [];
    blocks.push(...group("station", NEARBY_CATEGORIES).blocks);
    blocks.push(...group("bus-stop", NEARBY_CATEGORIES).blocks);
    nearbySections.push(linesSection("transport", "Transport", blocks));
  }
  nearbySections.push(group("food-and-drink", NEARBY_CATEGORIES));
  nearbySections.push(group("leisure", NEARBY_CATEGORIES));
  nearbySections.push(group("places-to-visit", NEARBY_CATEGORIES));
  {
    const blocks: SectionBlock[] = [];
    blocks.push(...group("places-of-worship", NEARBY_CATEGORIES).blocks);
    blocks.push(...group("libraries", NEARBY_CATEGORIES).blocks);
    blocks.push({
      type: "upsell",
      lead: "Plus the full Food & drink, Leisure, Places to visit, worship & library lists",
      detail: null,
    });
    nearbySections.push(linesSection("worship-libraries", "Places of worship & libraries", blocks));
  }

  const tabs: ResultsTabView[] = [
    { id: "family", label: "Family Checks", sections: familySections },
    { id: "neighbourhood", label: "The Neighbourhood", sections: neighbourhoodSections },
    { id: "home", label: "Home, Costs & Risks", sections: homeSections },
    { id: "nearby", label: "What's Nearby", sections: nearbySections },
  ];

  return {
    pills: effectiveNearby
      ? summaryPills({ nearby: effectiveNearby, flood, crime, sections, area })
      : null,
    reportHref,
    buyBar: {
      heading: BUY_BAR_HEADING,
      line: BUY_BAR_LINE,
      mysteryLine: BUY_BAR_MYSTERY_LINE,
      href: reportHref,
    },
    calculators: {
      lastSalePrice:
        sections.soldPrices.state === "served"
          ? (sections.soldPrices.ownLastSale?.price ?? null)
          : null,
    },
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
  { key: "nurseries", heading: "Nurseries & pre-schools", shortKey: "nearby" },
  { key: "pets", heading: "Pets", shortKey: "nearby" },
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
  const neighbourhood: ResultsSectionView[] = [
    section("census", "The neighbourhood in numbers", "nearby"),
    section("crime", "Crime", "crime"),
    section("air-noise", "Air quality & noise", "air"),
  ];
  const home: ResultsSectionView[] = [
    section("sold-prices", "Sold history", "soldPrices"),
    section("costs", "Costs", "councilTax"),
    section("flood", "Flood", "flood"),
    linesSection("planning-protection", "Planning, protection & ownership", [
      { type: "line", text: "planning applications need an exact postcode" },
    ]),
  ];
  const nearbyTab: ResultsSectionView[] = [
    section("health", "Health", "nearby"),
    section("hospitals", "Hospitals", "nearby"),
    section("parks", "Parks", "nearby"),
    section("shops", "Shops", "nearby"),
    section("transport", "Transport", "nearby"),
    section("food-and-drink", "Food & drink", "nearby"),
    section("leisure", "Leisure", "nearby"),
    section("places-to-visit", "Places to visit", "nearby"),
    section("worship-libraries", "Places of worship & libraries", "nearby"),
  ];
  return {
    pills: null,
    reportHref: null,
    buyBar: null,
    calculators: { lastSalePrice: null },
    warningsStrip: { kind: "none" },
    floodWarningsState: null,
    tabs: [
      { id: "family", label: "Family Checks", sections: family },
      { id: "neighbourhood", label: "The Neighbourhood", sections: neighbourhood },
      { id: "home", label: "Home, Costs & Risks", sections: home },
      { id: "nearby", label: "What's Nearby", sections: nearbyTab },
    ],
  };
}
