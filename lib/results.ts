import type { AddressResolution } from "./address";
import type { AreaBundle } from "./area-bundle";
import type { CrimeBundle } from "./crime";
import { CHECK_PAGES } from "./check-pages";
import { FLOOD_BAND_DEFINITIONS, type FloodBundle, type FloodLiveWarnings } from "./flood";
import type { DistrictBundle, DistrictFloodBlock } from "./district";

type DistrictServed = Extract<DistrictBundle, { kind: "district" }>;
import {
  BEYOND_NEAREST_RADIUS_MILES,
  floodBandOf,
  formatFiledDate,
  formatMiles,
  formatPounds,
  homeRoute,
  nationName,
  nationOfLsoa,
  placeChoiceRoute,
  suppressFarBeyond,
  widerAreaRoute,
  type Nation,
} from "./journey";

// The small formatters (formatMiles, formatFiledDate,
// formatPounds) and the flood band mapping (floodBandOf)
// live in lib/journey.ts — the checking screen's
// derivations compose their finding lines with the same
// forms, and one mapping can never drift from another.
// They are re-exported here so this module's existing
// importers are untouched.
export { floodBandOf, formatFiledDate, formatMiles, formatPounds };
import {
  BROWNFIELD_RADIUS_MILES,
  RADIUS_MILES,
  SELECTIVE_LIST_SIZE,
  SELECTIVE_SEARCH_MILES,
  reportListSizeFor,
  type NearbyCategory,
} from "./nearby";
import type { CategoryAnswer, NearbyBundle, NearbyPlace } from "./nearby";
import { HOW_WE_CHECK_PATH, REPORT_PRICE_LABEL } from "./site";
import type { ShortBundle, ShortFlood, ShortPolygonLayer, ShortSections } from "./short-bundle";
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
// Distance colour (Final Design, Section 6): green / orange /
// red on the miles figure only, per group family. The kit's
// pill colours its figure uniformly; the thresholds are the
// design's and live here with the page that applies them.
// ------------------------------------------------------------------

export type DistanceBand = "green" | "orange" | "red";
export type DistanceFamily = "school" | "everyday" | "hospital" | "ev" | "concern";

export function distanceBand(family: DistanceFamily, miles: number): DistanceBand {
  if (family === "school") return miles <= 1 ? "green" : miles <= 2 ? "orange" : "red";
  if (family === "hospital") return miles <= 5 ? "green" : miles <= 10 ? "orange" : "red";
  // The EV family (BUG-123, founder ruling 22 Nov 2026):
  // a public charger's usefulness is a driver's reach —
  // green within a mile, orange to three miles, red
  // beyond — on the report and the free results pages
  // alike.
  if (family === "ev") return miles <= 1 ? "green" : miles <= 3 ? "orange" : "red";
  // The concern family (BUG-126, founder ruling
  // 22 Nov 2026): the industrial-sites inversion as a
  // named family — nearness is the concern, so red
  // within a mile, orange to three, green beyond.
  if (family === "concern") return miles <= 1 ? "red" : miles <= 3 ? "orange" : "green";
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
// The Price Paid property-type and tenure codes, in the
// display forms the Master's sold-prices property line
// uses (parity fix batch, item 20). The same maps live in
// lib/shortlist-card.ts for the shortlist cards; that
// module imports this one, so the maps are replicated
// here rather than imported — keep the two in step.
const PROPERTY_TYPE_LABELS: Record<string, string> = {
  D: "Detached",
  S: "Semi-detached",
  T: "Terraced",
  F: "Flat or maisonette",
  O: "Other",
};
const TENURE_LABELS: Record<string, string> = {
  F: "Freehold",
  L: "Leasehold",
};

// A signed pounds figure for the Change tile: "+£12,500",
// "-£3,000", "£0".
function signedPounds(diff: number): string {
  if (diff > 0) return `+${formatPounds(diff)}`;
  if (diff < 0) return `-${formatPounds(-diff)}`;
  return formatPounds(0);
}

// The planning rows' compact facts (parity fix batch,
// item 26; BUG-212): the grouped constraints rows take
// each layer's short fact — "Not in a conservation area •
// Not in the green belt • Inside the Millbrook built-up
// area" — composed here from each layer's state and inside
// name. A state with no compact fact (not published,
// sparse coverage, not filed) returns null and the caller
// falls back to the layer's own line. Shared by the free
// page and the paid report (the full bundle's polygon
// layers carry the same three fields).
export function polygonFact(
  layer: Pick<ShortPolygonLayer, "layer" | "state" | "insideName">,
): string | null {
  const inside = layer.insideName;
  switch (layer.layer) {
    case "conservation_area":
      if (layer.state === "inside")
        return inside ? `In the ${inside} conservation area` : "In a conservation area";
      if (layer.state === "none-found") return "Not in a conservation area";
      return null;
    case "green_belt":
      if (layer.state === "inside")
        return inside ? `In the ${inside} green belt` : "In the green belt";
      if (layer.state === "none-found") return "Not in the green belt";
      return null;
    case "built_up_area":
      if (layer.state === "inside")
        return inside ? `Inside the ${inside} built-up area` : "Inside a built-up area";
      if (layer.state === "none-found") return "Outside any built-up area";
      return null;
    case "article_4_area":
      if (layer.state === "inside")
        return inside ? `In the ${inside} Article 4 area` : "In an Article 4 area";
      if (layer.state === "none-found") return "Not in an Article 4 area";
      return null;
    default:
      return null;
  }
}

// A beyond-nearest line in the item-26 form: it names
// what the feature is the nearest OF and carries the
// uniform 1-decimal miles (the brain's own beyond lines
// carry raw floats — "2.887 miles" — and unnamed
// features; both are presentation faults this recomposes
// from the same served facts).
function beyondNearestLine(feature: string, name: string, miles: number): string {
  return `The nearest ${feature} is ${name}, ${formatMiles(miles)} miles away.`;
}

export const POLYGON_FEATURE_NAMES: Record<string, string> = {
  conservation_area: "conservation area",
  article_4_area: "Article 4 area",
  green_belt: "green belt",
  // BUG-212: built-up areas need their own feature name —
  // the fallback "area" would read "the nearest area is
  // Newham", which names nothing.
  built_up_area: "built-up area",
  ancient_woodland: "ancient woodland",
};

// An EPC certificate's validity end: certificates are
// valid for ten years from registration (the register's
// own rule), so the Master's "valid until 14 May 2032"
// is the registration date plus ten years, human-formed.
// A 29 February registration lands on 28 February in the
// non-leap tenth year.
function epcValidUntil(registrationDate: string): string {
  const [year, month, day] = registrationDate.split("-").map(Number);
  const safeDay = month === 2 && day === 29 ? 28 : day;
  const iso = `${year + 10}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
  return formatFiledDate(iso);
}

// The Held tile's duration, in the plain form: "3 years 4
// months", "1 year", "4 months", "Less than a month".
function heldDuration(fromIso: string, toIso: string): string {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  if (months <= 0) return "Less than a month";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (rest > 0) parts.push(`${rest} month${rest === 1 ? "" : "s"}`);
  return parts.join(" ");
}

export function reportLinkable(rung: number): boolean {
  return rung === 1 || rung === 2;
}

// ------------------------------------------------------------------
// Truncation lines (ruling 2): the design's exact wording,
// per group. A group showing its full served list carries
// no line. OBS-012 (structural remedy, adopted 22 Nov
// 2026): the numeral is capped AT THIS SEAM against the
// one serving table — N = min(filed count, the report's
// depth for the category) minus the number shown — so no
// call site can quote a number the report does not give.
// (The pre-remedy formula named the raw filed total; the
// REGRESSION-DEEP-DIVE records that it was born uncapped
// and never capped until this stack.)
// ------------------------------------------------------------------

// The composition boundary's sentence discipline
// (BUG-088, extended by HCR-08 / NB-08 in the BUG-153 /
// BUG-155 stacks): brain lines are composed as fragments
// (they sit mid-sentence on other surfaces), so a line
// that stands alone on this page takes the report's own
// treatment — lib/report.ts's sentenceLine — applied
// ONCE, in the normalisation pass at the end of
// buildResultsView, never per-line in the brains.
// sentenceStart capitalises only; sentenceLine also
// assures the full stop.
export function sentenceStart(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function sentenceLine(text: string): string {
  const composed = sentenceStart(text);
  return /[.!?]$/.test(composed) ? composed : `${composed}.`;
}

// BUG-250 (24 Nov 2026): a register name filed in all
// caps ("CHURCH OF ST LUKE") reads as shouting in a
// sentence or a row — the display title-cases it. Only
// an all-caps name is touched, so a name the register
// already files in mixed case stands exactly as filed;
// small words (of, the, and…) stay lowercase, and the
// rest of each word lowers ("ST" reads "St"). The report
// (lib/report.ts) imports this helper; the brain
// (lib/area-bundle.ts) carries its own copy, as the
// codebase's small helpers are duplicated per module.
const TITLE_CASE_SMALL = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
  "by",
  "with",
]);

export function titleCaseName(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0 || letters !== letters.toUpperCase()) return name;
  return name
    .split(" ")
    .map((word, index) =>
      index > 0 && TITLE_CASE_SMALL.has(word.toLowerCase())
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

// ------------------------------------------------------------------
// BUG-212 — the planning-constraints grouping (Sample 2
// "Grouped by answer", founder pick 24 Nov 2026), shared by
// the free page (lib/results.ts) and the paid report
// (lib/report.ts) so both surfaces draw the same groups in
// the same order from the same facts. A finding is a layer
// that answered (inside, none-found, served); an
// uncheckable layer is one the data could not answer
// (not-published, sparse-coverage, not-filed). The findings
// group is headed "Nothing found" when every finding is a
// proven none, else "Findings"; the uncheckable group
// always sits last, and Article 4 sits last inside it (the
// founder's pick names the Article 4 entry the section's
// last entry). Distances are one-decimal pills on the
// concern band (nearness is the concern, BUG-126); the
// "(straight-line distance from the postcode point)"
// parenthetical never appears here (BUG-211 owns that
// wording; How We Check carries it once).
// ------------------------------------------------------------------

// The Article 4 uncheckable entry, in Sample 2's exact
// wording (founder-approved copy). It carries NO link —
// founder correction 24 Nov ~11:04: "lets not give
// council link... its a wrong link". The planning-
// applications link the check carries is a different
// destination (applications asked for, not directions in
// force), so it must not stand here.
export const ARTICLE4_UNCHECKABLE_TEXT =
  "This council does not publish its Article 4 directions to the national dataset, so no finding can be made from the data — this is a gap in the data, not a clear result. The answer lives on the council's own planning register.";

export interface PlanningConstraintInput {
  key: "conservation" | "article4" | "greenBelt" | "builtUp" | "brownfield";
  label: string;
  feature: string;
  state: "inside" | "none-found" | "served" | "not-published" | "sparse-coverage" | "not-filed";
  fact: string | null;
  line: string;
  nearestName: string | null;
  nearestMiles: number | null;
  beyond: boolean;
  radiusMiles: number;
  radiusInLine: boolean;
}

export interface PlanningConstraintRow {
  label: string;
  text: string;
  tag: "Clear" | "Can't be checked" | null;
  tagTone: "g" | "grey" | null;
  miles: number | null;
}

export interface PlanningConstraintGroups {
  findingsHead: "Nothing found" | "Findings" | null;
  findings: PlanningConstraintRow[];
  uncheckable: PlanningConstraintRow[];
}

const PLANNING_UNCHECKABLE_STATES = new Set(["not-published", "sparse-coverage", "not-filed"]);

export function groupPlanningConstraints(
  inputs: PlanningConstraintInput[],
): PlanningConstraintGroups {
  const findings: PlanningConstraintRow[] = [];
  const uncheckableInputs = inputs.filter((input) => PLANNING_UNCHECKABLE_STATES.has(input.state));
  // Article 4 last inside the uncheckable group (the
  // founder's pick names it the section's last entry);
  // the rest keep their layer order.
  const orderedUncheckable = [
    ...uncheckableInputs.filter((input) => input.key !== "article4"),
    ...uncheckableInputs.filter((input) => input.key === "article4"),
  ];
  const uncheckable: PlanningConstraintRow[] = orderedUncheckable.map((input) => ({
    label: input.label,
    text:
      input.key === "article4" && input.state === "not-published"
        ? ARTICLE4_UNCHECKABLE_TEXT
        : sentenceLine(input.line),
    tag: "Can't be checked",
    tagTone: "grey",
    miles: null,
  }));
  for (const input of inputs) {
    if (PLANNING_UNCHECKABLE_STATES.has(input.state)) continue;
    // A finding: the fact, then the named nearest where
    // one serves. An inside finding names no nearest (the
    // home is in the designation; the nearest is the
    // designation itself). The beyond clause frames the
    // radius only where the fact does not already state it
    // (brownfield's line carries its 5 miles); the miles
    // themselves ride the pill, never the text.
    const showNearest =
      input.nearestName !== null && (input.state === "none-found" || input.state === "served");
    const fact = input.fact ?? sentenceLine(input.line).replace(/\.$/, "");
    let clause = "";
    if (showNearest) {
      const radius =
        input.beyond && !input.radiusInLine ? `, and none within ${input.radiusMiles} miles` : "";
      clause = `${radius} — the nearest ${input.feature} is ${input.nearestName}`;
    }
    findings.push({
      label: input.label,
      text: sentenceLine(`${fact}${clause}`),
      tag: input.state === "none-found" ? "Clear" : null,
      tagTone: input.state === "none-found" ? "g" : null,
      miles: showNearest ? input.nearestMiles : null,
    });
  }
  const findingsHead =
    findings.length === 0
      ? null
      : findings.every((finding) => finding.tag === "Clear")
        ? "Nothing found"
        : "Findings";
  return { findingsHead, findings, uncheckable };
}

export interface TruncationView {
  n: number;
  // The served total the lead counts towards (OBS-012):
  // the filed count capped at the report's depth for the
  // category — the schools detail's "All T" names this,
  // never the raw filed total.
  total: number;
  // The row's lead, in the Master's truncRow form (parity
  // fix batch, 18 Nov 2026): "Plus 3 more primary schools"
  // — the price is the row's own chip, never part of the
  // lead's text (the pre-batch form carried "… in the
  // detailed report — £4.99" inside the text; the sample's
  // row carries the lead, an optional detail line, the
  // £4.99 chip and the "Get the full report →" arrow as
  // separate parts).
  lead: string;
  detail: string | null;
  href: string | null;
}

// BUG-254 (24 Nov 2026): the truncation lead's group
// label is plural ("Plus 3 more primary schools") —
// where exactly one item remains the lead must read
// singular ("Plus 1 more primary school"). The map
// covers every groupLabel the two category tables file;
// a label with no entry keeps its plural form rather
// than guessing — a rule-based strip would mangle
// "nurseries" ("nurserie"), "places to visit" and
// "places of worship" (no trailing "s" to strip) and
// "sixth forms and colleges" ("sixth forms and
// college").
const SINGULAR_GROUP_LABELS: Record<string, string> = {
  "primary schools": "primary school",
  "secondary schools": "secondary school",
  "sixth forms and colleges": "sixth form or college",
  nurseries: "nursery",
  "GP surgeries": "GP surgery",
  "NHS dentists": "NHS dentist",
  pharmacies: "pharmacy",
  "A&E hospitals": "A&E hospital",
  "maternity units": "maternity unit",
  stations: "station",
  "bus stops": "bus stop",
  supermarkets: "supermarket",
  "food and drink places": "food and drink place",
  "parks and greenspace": "park or greenspace",
  vets: "vet",
  "pet shops": "pet shop",
  "pet boarding places": "pet boarding place",
  "EV chargers": "EV charger",
  "leisure places": "leisure place",
  "places to visit": "place to visit",
  "places of worship": "place of worship",
  libraries: "library",
};

export function truncationFor(
  countWithin: number,
  shown: number,
  groupLabel: string,
  linkable: boolean,
  category: string,
  href: string = REPORT_ROUTE,
  detail: string | null = null,
): TruncationView | null {
  const total = Math.min(countWithin, reportListSizeFor(category));
  const n = total - shown;
  if (n <= 0) return null;
  // BUG-254: n === 1 reads singular; n >= 2 keeps the
  // plural form exactly as the Master shows it.
  const label = n === 1 ? (SINGULAR_GROUP_LABELS[groupLabel] ?? groupLabel) : groupLabel;
  return {
    n,
    total,
    lead: `Plus ${n} more ${label}`,
    detail,
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
  // The row's detail line, in the Final Sample Master's
  // composed form (parity fix batch, 18 Nov 2026): the
  // filed detail (a school's ages/address/Ofsted line, a
  // health point's address), then the CQC part where the
  // place carries a rating, then a secondary school's
  // sixth-form part — joined with " • ", as the sample's
  // rows join them. The parts were separate spans before
  // this batch (ratingLine / sixthFormLine); the sample
  // carries one detail line per row, so the view now
  // composes one.
  detail: string | null;
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
  // Schools-secondary only (parity fix batch): the
  // grammar row in the Master's form — the nearest
  // selective school's name and distance, rendered as the
  // sample's row--grammar with its SELECTIVE — TEST ENTRY
  // badge. Null where no selective school serves (the
  // brain's fact, out to its grammar search radius).
  grammar: { name: string; milesText: string; band: DistanceBand } | null;
  // BUG-108: every selective secondary within the
  // grammar search, nearest first — the list form the
  // grammar row renders from; grammar above stays the
  // nearest entry for single-fact consumers.
  // BUG-140: the rendered list caps at the nearest
  // five (SELECTIVE_LIST_SIZE); grammarCountLine
  // states the true total where the cap cuts, and is
  // null wherever the whole set shows.
  grammarSchools: { name: string; milesText: string; band: DistanceBand }[];
  grammarCountLine: string | null;
}

interface CategoryPresentation {
  heading: string;
  groupLabel: string;
  display: number;
  family: DistanceFamily;
  // The Master's row-name form for the kinds that share a
  // section with other kinds (parity fix batch): the
  // Health rows lead "GP — ", "NHS dentist — ",
  // "Pharmacy — "; worship and library rows lead with
  // their kind the same way; the A&E row carries its
  // department as a suffix ("… — A&E department").
  namePrefix?: string;
  nameSuffix?: string;
  // places-of-worship only: the filed detail is a raw OSM
  // religion tag and renders through worshipDetailDisplay
  // (item 30) — never as the tag itself.
  detailDisplay?: "worship";
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
    // Heading conformed to the Final Sample Master (parity
    // fix batch, 18 Nov 2026): "Nurseries", not "Nurseries
    // & pre-schools".
    heading: "Nurseries",
    groupLabel: "nurseries",
    display: 1,
    family: "school",
  },
  gp: {
    heading: "GP surgeries",
    groupLabel: "GP surgeries",
    display: 1,
    family: "everyday",
    namePrefix: "GP",
  },
  dentist: {
    heading: "NHS dentists",
    groupLabel: "NHS dentists",
    display: 1,
    family: "everyday",
    namePrefix: "NHS dentist",
  },
  pharmacy: {
    heading: "Pharmacies",
    groupLabel: "pharmacies",
    display: 1,
    family: "everyday",
    namePrefix: "Pharmacy",
  },
  ae: {
    heading: "A&E hospitals",
    groupLabel: "A&E hospitals",
    display: 1,
    family: "hospital",
    nameSuffix: " — A&E department",
  },
  maternity: {
    heading: "Maternity units",
    groupLabel: "maternity units",
    display: 1,
    family: "hospital",
  },
};

export const NEARBY_CATEGORIES: Record<string, CategoryPresentation> = {
  station: { heading: "Stations", groupLabel: "stations", display: 1, family: "everyday" },
  "bus-stop": {
    heading: "Bus stops",
    groupLabel: "bus stops",
    display: 1,
    family: "everyday",
    namePrefix: "Bus stop",
  },
  supermarket: {
    heading: "Supermarkets & food shops",
    groupLabel: "supermarkets",
    display: 1,
    family: "everyday",
    namePrefix: "Supermarket",
  },
  "food-and-drink": {
    heading: "Food & drink",
    groupLabel: "food and drink places",
    display: 1,
    family: "everyday",
  },
  parks: {
    // Heading conformed to the Master (parity fix batch):
    // "Parks", not "Parks & greenspace".
    heading: "Parks",
    groupLabel: "parks and greenspace",
    display: 1,
    family: "everyday",
  },
  vets: { heading: "Vets", groupLabel: "vets", display: 1, family: "everyday" },
  "pet-shops": { heading: "Pet shops", groupLabel: "pet shops", display: 1, family: "everyday" },
  "pet-boarding": {
    // BUG-149(3) (22 Nov 2026): the one settled label.
    heading: "Pet boarding (kennels & catteries)",
    groupLabel: "pet boarding places",
    display: 1,
    family: "everyday",
  },
  "ev-chargers": {
    heading: "EV chargers",
    groupLabel: "EV chargers",
    display: 1,
    // BUG-123: charger pills colour on the EV family
    // (1 / 3 miles), here as in the report.
    family: "ev",
  },
  leisure: {
    // Heading conformed to the Master (parity fix batch):
    // "Leisure", not "Leisure & gyms".
    heading: "Leisure",
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
    namePrefix: "Place of worship",
    detailDisplay: "worship",
  },
  libraries: {
    heading: "Libraries",
    groupLabel: "libraries",
    display: 1,
    family: "everyday",
    namePrefix: "Library",
  },
};

// The place-of-worship detail's display form (parity fix
// batch, item 30): the filed detail is the OSM religion
// tag verbatim ("christian") — a raw tag never renders.
// The display form is the properly capitalised religion.
// The Master's "Church of England" is a DENOMINATION: the
// denomination tag is not filed by the OSM loader (only
// religion is), so no denomination can be stated from the
// data held — the capitalised religion is the honest form
// until the filing widens.
const WORSHIP_DETAIL_DISPLAY: Record<string, string> = {
  christian: "Christian",
  muslim: "Muslim",
  jewish: "Jewish",
  hindu: "Hindu",
  sikh: "Sikh",
  buddhist: "Buddhist",
  bahai: "Baháʼí",
  jain: "Jain",
  shinto: "Shinto",
  taoist: "Taoist",
  zoroastrian: "Zoroastrian",
  pagan: "Pagan",
  animist: "Animist",
  multifaith: "Multifaith",
  none: "No religion",
};

export function worshipDetailDisplay(detail: string): string {
  const key = detail.trim().toLowerCase();
  return WORSHIP_DETAIL_DISPLAY[key] ?? detail.charAt(0).toUpperCase() + detail.slice(1);
}

function placeRow(
  place: NearbyPlace,
  family: DistanceFamily,
  presentation: CategoryPresentation,
): PlaceRow {
  // The detail line's parts, in the Master's order: the
  // filed detail, the CQC part, the sixth-form part.
  const parts: string[] = [];
  if (place.detail)
    parts.push(
      presentation.detailDisplay === "worship" ? worshipDetailDisplay(place.detail) : place.detail,
    );
  // The CQC overall rating (M6.25), as a detail part in
  // the sample's form — "CQC overall rating: Good". The
  // rating's publication date stays at report depth; the
  // sample's row does not carry it.
  if (place.cqcRating != null) parts.push(`CQC overall rating: ${place.cqcRating.rating}`);
  // The secondary rows' filed sixth-form flags (M6.33) as
  // the detail's last part. The yes form is the sample's
  // plain words (M7.11 O-3, founder adopted 18 Nov 2026);
  // the no form drops the internal ", as filed" (BUG-250
  // item 24, 24 Nov 2026) — a consumer-facing line never
  // carries filing language.
  if (place.sixthForm === true) parts.push("Sixth form at the school");
  else if (place.sixthForm === false) parts.push("sixth form: no");
  else if (place.sixthForm === null && "sixthForm" in place) parts.push("sixth form: not recorded");
  return {
    name: `${presentation.namePrefix ? `${presentation.namePrefix} — ` : ""}${place.name}${presentation.nameSuffix ?? ""}`,
    milesText: `${formatMiles(place.miles)} mi`,
    band: distanceBand(family, place.miles),
    detail: parts.length > 0 ? parts.join(" • ") : null,
  };
}

// The beyond-nearest line, recomposed at this layer
// (BUG-014 residual, founder ruling 20 Nov 2026): the
// brain composes its line with the miles at three
// decimals (lib/nearby.ts), and serving it verbatim
// put "14.671 miles away" on the results page while
// every other miles figure the site serves is the
// uniform one decimal (formatMiles). The sentence is
export function placeGroupView(
  category: CategoryAnswer,
  presentation: CategoryPresentation,
  linkable: boolean,
  href: string = REPORT_ROUTE,
  truncationDetail: string | null = null,
): PlaceGroupView {
  // BUG-140: the selective set this group carries —
  // the brain's full list where it serves, else the
  // nearest alone — capped for display at the nearest
  // five, with the count line composed beside the cap.
  const selectiveSet =
    category.category === "schools-secondary"
      ? category.selectiveSchools && category.selectiveSchools.length > 0
        ? category.selectiveSchools
        : category.nearestSelective
          ? [category.nearestSelective]
          : []
      : [];
  const grammarCountLine =
    selectiveSet.length > SELECTIVE_LIST_SIZE
      ? `There are ${selectiveSet.length} selective schools within ${SELECTIVE_SEARCH_MILES} miles — the ${SELECTIVE_LIST_SIZE} nearest are shown.`
      : null;
  const base: PlaceGroupView = {
    key: category.category,
    heading: presentation.heading,
    rows: [],
    line: null,
    truncation: null,
    // The grammar row (parity fix batch): the brain's
    // nearest selective fact, in the Master's row form.
    grammar:
      category.category === "schools-secondary" && category.nearestSelective
        ? {
            name: category.nearestSelective.name,
            milesText: `${formatMiles(category.nearestSelective.miles)} mi`,
            band: distanceBand("school", category.nearestSelective.miles),
          }
        : null,
    grammarSchools: selectiveSet.slice(0, SELECTIVE_LIST_SIZE).map((school) => ({
      name: school.name,
      milesText: `${formatMiles(school.miles)} mi`,
      band: distanceBand("school", school.miles),
    })),
    grammarCountLine,
  };
  if (category.state === "within") {
    const shown = category.places.slice(0, presentation.display);
    return {
      ...base,
      rows: shown.map((place) => placeRow(place, presentation.family, presentation)),
      truncation: truncationFor(
        category.countWithin,
        shown.length,
        presentation.groupLabel,
        linkable,
        category.category,
        href,
        truncationDetail,
      ),
    };
  }
  if (category.state === "none-within" && category.beyondNearest) {
    // BUG-213: the row alone carries the nearest — no
    // "None within" preamble line above it. The sample
    // shows the named entry with its distance pill and
    // no preamble (Sample 3 Tabs 1 and 4; View 7
    // Section 5), even for a beyond-radius nearest
    // (the sample's hospital at 5.8 mi, its vet at
    // 2.3 mi). The preamble said the same place at
    // the same distance as the row below it. The
    // brain's line itself is untouched (the bundle
    // contract pins and the golden replay stand), and
    // the report keeps its own named none-within
    // sentences — this is the free page's row form
    // only. Where no row carries the nearest (no
    // beyond-nearest was filed at all), the
    // fall-through below keeps the line as the sole
    // statement — the far-beyond guard's null no
    // longer lands here: the display layer restores
    // the suppressed nearest upstream (BUG-213 ruling),
    // so it renders as a named row with its red pill.
    return {
      ...base,
      rows: [
        placeRow(
          {
            name: category.beyondNearest.name,
            miles: category.beyondNearest.miles,
            detail: null,
            latitude: category.beyondNearest.latitude,
            longitude: category.beyondNearest.longitude,
          },
          presentation.family,
          presentation,
        ),
      ],
    };
  }
  return { ...base, line: category.line };
}

// The catchment honesty block that stood here (M6.23)
// is RETIRED (FC-06, BUG-154, founder ruling 22 Nov
// 2026): its substance stands verbatim in the page's
// closing disclaimers, and the sample's Family Checks
// tab never carried the block. The catchment honesty
// itself is untouched — it lives in the disclaimers and
// in the report's Section 10. The block's LINK constant
// survives: the report's Section 10 and the outside-
// links list still carry it beside the disclaimer.
export const CATCHMENT_LINK = {
  label: "School admissions on GOV.UK",
  url: "https://www.gov.uk/schools-admissions",
};

// ------------------------------------------------------------------
// Section view model
// ------------------------------------------------------------------

export type SectionBlock =
  | { type: "line"; text: string }
  // An explainer or coverage line in the small-print
  // dress (NB-01 / HCR-19, BUG-155/BUG-153): the sample's
  // .fineprint form — small, muted, line-free, standing
  // after the data it explains.
  | { type: "small-line"; text: string }
  // A findings list (BUG-156, the BUG-136..142 bullet
  // treatment extended to this page): one fact per item,
  // an optional bold lead-in per item (the census
  // headlines' labelled form), no line of its own.
  // BUG-206: `sub` marks a detail bullet — one level
  // under its group bullet, indented one step in.
  | { type: "list"; items: { lead?: string; text: string; sub?: boolean }[] }
  | { type: "subheading"; text: string }
  | { type: "upsell"; lead: string; detail: string | null }
  | { type: "notice"; variant: "warning" | "stale" | "gap"; text: string }
  | { type: "places"; group: PlaceGroupView }
  | { type: "link"; label: string; url: string }
  // The Master's stat tiles (parity fix batch): label,
  // value, and the small sub-line beneath the value ("22
  // Mar 2022 • Land Registry").
  | { type: "tiles"; tiles: { label: string; value: string; sub?: string | null }[] }
  // The Master's row form (parity fix batch): a bold lead,
  // one or more small text lines, an optional fineprint
  // line, and an optional badge at the right — the Costs
  // rows (BAND + £/YR, EPC, COVERAGE, £ / MONTH), the air
  // and noise rows (MODELLED) and the planning rows
  // (FACTS) all render in this one form.
  | {
      type: "tagged-line";
      lead?: string;
      texts: string[];
      // Findings bullets under the row's headline text
      // (BUG-156 / HCR-18): fact lines take bullets as one
      // list beneath the prose headline, never stacked
      // prose.
      bullets?: string[];
      fineprint?: string | null;
      tag?: string;
      tagTone?: "a" | "g" | "grey";
      // A distance chip at the row's right, in the place
      // rows' dress (HCR-05: the brownfield row's restored
      // pill — colour by the concern family, nearness is
      // the concern).
      miles?: { text: string; band: DistanceBand };
    }
  // The flood verdict row (parity fix batch, item 25): a
  // bold check name, its verdict-led text, the CHECK badge,
  // and — on the rivers & sea row only — the no-warnings
  // sentence as a second line when no warning is in force.
  | {
      type: "verdict";
      name: string;
      text: string;
      tag: string;
      note?: string | null;
    }
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
    }
  // District-page forms (18 Nov 2026): a label/value table
  // (sold types, crime categories, council tax), the
  // deprivation decile spread, a stacked share bar (the
  // flood roll-up) and paired comparison bars (crime
  // calibration). Only district views carry these.
  | { type: "table"; rows: { label: string; value: string; detail?: string | null }[] }
  | { type: "deciles"; counts: number[]; partial?: boolean }
  | {
      type: "stackbar";
      segments: {
        label: string;
        pct: number;
        tone: "high" | "medium" | "low" | "very-low" | "none";
      }[];
    }
  | { type: "bars"; rows: { label: string; text: string; pctOfMax: number }[] }
  // The district page's settlement pills and its method
  // box (founder fix batch, 19 Nov 2026): the sample's
  // .pills dress for the district's settlements, and the
  // .infobox dress for the flood roll-up's "How the
  // roll-up is built" box. District views only.
  | { type: "pills"; items: string[] }
  | { type: "infobox"; text: string; lead?: string | null }
  // Sample 28 forms (BUG-160 as corrected by the
  // wider-area audit, WA-01..15): the district row (bold
  // lead, small detail beneath, dashed rule under — the
  // district page's fact form, never bullets), the crime
  // comparison panel, the flood card grid, the warnings
  // strip and the honesty bandbox. District views only.
  | { type: "row"; lead: string; detail?: string | null; value?: string | null }
  | {
      type: "bar-compare";
      heading: string;
      rows: { label: string; text: string; pctOfMax: number; england?: boolean }[];
      note?: string | null;
    }
  | {
      type: "flood-grid";
      cards: {
        title: string;
        sub: string;
        segments: {
          label: string;
          pct: number;
          tone: "high" | "medium" | "low" | "very-low" | "none";
        }[];
        definitions?: string | null;
        narrative?: { lead: string; text: string } | null;
      }[];
    }
  | { type: "warn-strip"; line: string; areas: string[] }
  | { type: "bandbox"; lead: string; text: string };

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

// ------------------------------------------------------------------
// "About these checks" links (M7.12, results side): one
// link per check to its /check/ page, derived from the
// sections the view actually carries — the pill strip at
// the foot of the results page is the ONLY home for these
// links (no per-section link lines anywhere). Labels are
// the check pages' own names from lib/check-pages.ts,
// never a second hard-coded copy. Sections with no check
// page (parks, shops, food, leisure, visits, worship &
// libraries) contribute nothing; the Costs section
// carries five checks in its subsections (council tax,
// EPC, EV, broadband, mobile), and air-noise carries two
// (air quality and noise).
//
// NB-09, settled in BUG-143's pill rebuild (22 Nov
// 2026): the census section has no check page of its
// own, but the sample's list carries it — "The
// neighbourhood in numbers", the section's own heading
// — pointing at the How-we-check hub, where its card
// stands. The district view's hard-coded list already
// carries exactly this entry; the derived list now
// does too (SECTION_HUB_LINKS below).
// ------------------------------------------------------------------

// Sections whose About link is the How-we-check hub
// rather than a check page, labelled with the section's
// own heading (NB-09).
export const SECTION_HUB_LINKS: Record<string, string> = {
  census: "The neighbourhood in numbers",
};

export const SECTION_CHECK_LINKS: Record<string, string[]> = {
  "schools-primary": ["/check/schools"],
  "schools-secondary": ["/check/schools"],
  nurseries: ["/check/family-essentials"],
  pets: ["/check/family-essentials"],
  crime: ["/check/crime"],
  "air-noise": ["/check/air-quality", "/check/noise"],
  // District-page sections (18 Nov 2026): the district page's
  // own section keys map to the same check pages. The
  // district page's About expander no longer derives from
  // this map at all (founder fix batch, 19 Nov 2026: it
  // carries the sample's eleven links, named for the
  // page's own sections — see buildDistrictResultsView);
  // these entries remain for completeness of the map.
  schools: ["/check/schools"],
  air: ["/check/air-quality"],
  everyday: ["/check/family-essentials", "/check/public-transport"],
  "council-tax": ["/check/council-tax-band"],
  connectivity: ["/check/broadband", "/check/mobile-coverage"],
  "sold-prices": ["/check/sold-prices"],
  costs: [
    "/check/council-tax-band",
    "/check/epc",
    "/check/ev-charging",
    "/check/broadband",
    "/check/mobile-coverage",
  ],
  flood: ["/check/flood-risk"],
  "planning-protection": ["/check/planning-constraints"],
  health: ["/check/family-essentials"],
  hospitals: ["/check/family-essentials"],
  transport: ["/check/public-transport"],
};

export interface CheckLink {
  label: string;
  href: string;
}

// Tab order, then section order, then the mapping's own
// order; duplicates collapse to their first occurrence.
// A section's hub link (NB-09) dedupes by href AND
// label, the district list's own rule: the hub is one
// page several sections may name differently.
export function checkLinksForTabs(tabs: ResultsTabView[]): CheckLink[] {
  const seen = new Set<string>();
  const links: CheckLink[] = [];
  for (const tab of tabs) {
    for (const section of tab.sections) {
      const hubLabel = SECTION_HUB_LINKS[section.key];
      if (hubLabel && !seen.has(`${HOW_WE_CHECK_PATH}|${hubLabel}`)) {
        seen.add(`${HOW_WE_CHECK_PATH}|${hubLabel}`);
        links.push({ label: hubLabel, href: HOW_WE_CHECK_PATH });
      }
      for (const href of SECTION_CHECK_LINKS[section.key] ?? []) {
        if (seen.has(href)) continue;
        seen.add(href);
        links.push({ label: CHECK_PAGES[href].name, href });
      }
    }
  }
  return links;
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
    sections: ["schools-primary", "schools-secondary", "nurseries", "pets"],
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
  // The Master's one-pill form (parity fix batch, item
  // 7): label and figure joined by " · " inside the one
  // white pill — "Schools · 0.3 / 1.8 mi".
  return `${pill.label} · ${pill.figure}${pill.mark ? ` ${pill.mark}` : ""}`;
}

// BUG-151 (founder ruling, 22 Nov 2026): a pill's colour
// is wired to its VERDICT, on every factor — a concerning
// fact paints amber or red, a good fact paints green, and
// no factor keeps the renderer's default pale green while
// standing concerning (the pre-fix state: the non-distance
// factors carried band null, which the kit renders green,
// and the distance factors' family bands disagreed with
// their verdict thresholds — a vet at 1.2 miles read
// "good" on an orange chip). Distance factors therefore
// take their chip from the verdict, not the family band;
// the family bands still govern the place ROWS, where
// distance itself is the fact.
const verdictBand = (verdict: PillVerdict, concerning: DistanceBand = "red"): DistanceBand =>
  verdict === "concerning" ? concerning : "green";

const verdictMilesPill = (label: string, verdict: PillVerdict, miles: number): SummaryPill => ({
  label,
  figure: `${formatMiles(miles)} mi`,
  band: verdictBand(verdict),
});

// The flood pill's band, as one export (BUG-163): the
// shortlist table colours its flood cell by the same
// verdict the pill takes, so the two surfaces can never
// disagree about what a flood fact means. The logic is
// summaryPills' own, lifted whole: concerning when any
// served likelihood layer is Low or worse (the worst
// band paints orange at Low, red above it), good only
// when both checks serve Very low, and the planning
// zone heard over the likelihood (BUG-151 ruling 3) —
// Zone 3 red on its own, Zone 2 amber where the
// likelihood does not already say worse. Null where the
// pill itself would not speak: nothing served, no band
// and no zone, or a single Very low that proves nothing
// about the other check.
export function floodPillBand(flood: ShortFlood): DistanceBand | null {
  if (flood.state !== "served") return null;
  const bands = flood.layers
    .filter((layer) => layer.layer === "rofrs" || layer.layer === "rofsw")
    .map((layer) => floodBandOf(layer))
    .filter((band): band is string => band !== null);
  const zone = flood.layers.find((layer) => layer.layer === "flood_zone");
  const zoneLabel = zone && zone.pointState === "inside" ? (zone.coveringLabel ?? null) : null;
  let verdict: PillVerdict = "neither";
  let band: DistanceBand | null = null;
  if (bands.length > 0) {
    const rank = (value: string) =>
      value === "High" ? 3 : value === "Medium" ? 2 : value === "Low" ? 1 : 0;
    const worst = bands.reduce((a, b) => (rank(a) >= rank(b) ? a : b));
    if (bands.some((value) => value !== "Very low")) verdict = "concerning";
    else if (bands.length === 2) verdict = "good";
    if (verdict === "concerning") band = worst === "Low" ? "orange" : "red";
    else if (verdict === "good") band = "green";
  }
  if (zoneLabel === "Flood Zone 3") band = "red";
  else if (zoneLabel === "Flood Zone 2" && verdict !== "concerning") band = "orange";
  return band;
}

// The crime pill's band, as one export (BUG-163): the
// graduated England-rate verdict (BUG-151 ruling 2) over
// the calibration pair — the local rate per 1,000
// residents against the England figure for the same
// months. Below the England figure paints green; above
// it by up to a quarter paints orange; more than a
// quarter above paints red. Null where the pill itself
// would not speak: either figure missing (a
// pre-calibration artefact), or the two exactly equal.
export function crimePillBand(per1000: number | null, england: number | null): DistanceBand | null {
  if (per1000 == null || england == null || per1000 === england) return null;
  if (per1000 < england) return "green";
  return per1000 > england * 1.25 ? "red" : "orange";
}

// The air quality pill's band, as one export (BUG-164):
// concerning — any pollutant over its UK legal limit
// (NO2 40, PM2.5 20, PM10 40) — paints red; good — all
// three at or under the WHO 2021 guidelines (10/5/15) —
// paints green; a served set between the two yardsticks
// is neither, and the pill does not speak, so the band
// is null, as it is wherever the modelled values are not
// all filed.
export function airPillBand(air: {
  state: string;
  no2: number | null;
  pm25: number | null;
  pm10: number | null;
}): DistanceBand | null {
  if (air.state !== "served" || air.no2 === null || air.pm25 === null || air.pm10 === null)
    return null;
  if (air.no2 > 40 || air.pm25 > 20 || air.pm10 > 40) return "red";
  if (air.no2 <= 10 && air.pm25 <= 5 && air.pm10 <= 15) return "green";
  return null;
}

// D75 pill system (fold-in build, superseding pill logic
// E2): FIVE pills. Concerning facts first in priority
// order, up to three; good facts fill the remaining slots
// in priority order; fewer qualifying facts means fewer
// pills; a fact is concerning/good only across its real
// threshold, and "neither" facts never take a pill. The
// twelve factors in priority order: Flood, Crime, Air
// quality, Schools (merged), A&E, Noise, Deprivation,
// EPC, Vet, Broadband, Train station, Nurseries.
// (BUG-164, founder ruling 22 Nov 2026: Air quality's
// rank moves to immediately after Crime; it stood fifth,
// after A&E, until then.) Grammar-school distance and
// leisure/parks/shops are NOT pill-eligible.
type PillVerdict = "concerning" | "good" | "neither";
interface PillFactor {
  pill: SummaryPill;
  verdict: PillVerdict;
}

// Exported for one second consumer: the shortlist card's
// flood cell (lib/shortlist-card.ts) derives its two bands
// through this same mapping, so the absence states can
// never drift between the results page and the comparison.
// The noise single line (parity fix batch, item 24): the
// Master's form joins the filed bands into one sentence —
// "Road noise day below 55 dB and night below 50 dB; rail
// noise day below 55 dB". Composed from the brain's filed
// band texts: a "Below X dB" band reads "below X dB"; a
// range band ("55–59 dB") reads as filed; a source with no
// filed band contributes no clause (the section's fallback
// line covers it). Source order is road, rail, airport.
const NOISE_SOURCE_ORDER = ["road", "rail", "airport"];

function noiseBandPhrase(band: string): string {
  return band.startsWith("Below ") ? `below ${band.slice("Below ".length)}` : band;
}

export function noiseSingleLine(
  bands: { sourceKind: string; label: string; dayBand: string | null; nightBand: string | null }[],
): string | null {
  const ordered = [...bands].sort(
    (a, b) => NOISE_SOURCE_ORDER.indexOf(a.sourceKind) - NOISE_SOURCE_ORDER.indexOf(b.sourceKind),
  );
  const clauses: string[] = [];
  for (const band of ordered) {
    const label = `${band.label.charAt(0).toUpperCase()}${band.label.slice(1)}`;
    if (band.dayBand && band.dayBand.startsWith("No modelled")) {
      clauses.push(`${label} — no modelled noise`);
      continue;
    }
    if (!band.dayBand) continue;
    let clause = `${label} day ${noiseBandPhrase(band.dayBand)}`;
    if (band.nightBand && !band.nightBand.startsWith("No modelled"))
      clause += ` and night ${noiseBandPhrase(band.nightBand)}`;
    clauses.push(clause);
  }
  return clauses.length > 0 ? `${clauses.join("; ")}.` : null;
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
  // The publisher's lowest state of all: no modelled
  // source at the point. The loader's bandFor files a
  // grid value of 0 (below the mapping floor) or nodata
  // as "No modelled … noise" — no contribution modelled
  // is quieter than a real below-range value, so it
  // satisfies the low test. Without this the Noise pill
  // could only ever read "good" beside a quiet railway
  // and never where there is no railway noise at all —
  // the opposite of the D75 worked example, whose golden
  // rail state is exactly this one (CI #207).
  if (/^no modelled/i.test(band)) return true;
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
  // Fix batch, 19 Nov 2026 — BUG-007: the verdict used to
  // require BOTH layers filed with bands before it would
  // speak at all, so a postcode serving a single layer at
  // Low or worse — one check is enough for "concerning"
  // under D75's "either check" — got no Flood pill while
  // a two-layer postcode at the same risk did. The
  // verdict now reads the served layers: concerning when
  // any served layer is Low or worse; good only when
  // both checks serve and both are Very low (one Very
  // low alone proves nothing about the other check, so
  // it stays "neither"); the figure is the worst served
  // band.
  {
    let verdict: PillVerdict = "neither";
    let figure: string | null = null;
    if (sections.flood.state === "served") {
      const bands = sections.flood.layers
        .filter((layer) => layer.layer === "rofrs" || layer.layer === "rofsw")
        .map((layer) => floodBandOf(layer))
        .filter((band): band is string => band !== null);
      // BUG-151 ruling 3: the pill hears the PLANNING
      // ZONE. The likelihood layers are drawn with the
      // defences counted; the zone map is drawn as if
      // they were not there — a home inside Flood Zone 3
      // is a concerning fact however low the likelihood
      // bands read, and the pill may not stand a plain
      // green "Very low" over it. Zone 3 paints red on
      // its own figure; Zone 2 is concerning at amber
      // where the likelihood bands do not already say
      // worse.
      const zone = sections.flood.layers.find((layer) => layer.layer === "flood_zone");
      const zoneLabel = zone && zone.pointState === "inside" ? (zone.coveringLabel ?? null) : null;
      if (bands.length > 0) {
        const rank = (band: string) =>
          band === "High" ? 3 : band === "Medium" ? 2 : band === "Low" ? 1 : 0;
        const worst = bands.reduce((a, b) => (rank(a) >= rank(b) ? a : b));
        if (bands.some((band) => band !== "Very low")) verdict = "concerning";
        else if (bands.length === 2) verdict = "good";
        figure = worst;
      }
      if (zoneLabel === "Flood Zone 3") {
        verdict = "concerning";
        figure = zoneLabel;
      } else if (zoneLabel === "Flood Zone 2" && verdict !== "concerning") {
        verdict = "concerning";
        figure = zoneLabel;
      }
    }
    // The band is floodPillBand's — the one computation
    // the shortlist table also colours by (BUG-163).
    if (figure) add(verdict, { label: "Flood", figure, band: floodPillBand(sections.flood) });
  }

  // 2 Crime — concerning above the England per-1,000
  // figure; good below it. BUG-151 ruling 2: the single
  // binary line graduates — above the England figure by
  // up to a quarter paints amber ("Above England
  // average"); more than a quarter above paints red
  // ("Well above England average").
  {
    const served = crime.kind === "crime" && crime.crime.state === "served" ? crime.crime : null;
    const per1000 = served?.perHead?.per1000 ?? null;
    const england = served?.englandFigure?.englandPer1000 ?? null;
    if (per1000 !== null && england !== null && per1000 !== england) {
      const concerning = per1000 > england;
      const wellAbove = concerning && per1000 > england * 1.25;
      add(concerning ? "concerning" : "good", {
        label: "Crime",
        figure: concerning
          ? wellAbove
            ? "Well above England average"
            : "Above England average"
          : "Below England average",
        // The band is crimePillBand's — the one
        // computation the shortlist table also colours
        // by (BUG-163).
        band: crimePillBand(per1000, england),
      });
    }
  }

  // 3 Air quality — good if NO2, PM2.5 and PM10 ALL at or
  // under WHO 2021 (10/5/15); concerning if any breaks its
  // UK legal limit (NO2 40, PM2.5 20, PM10 40). BUG-164
  // (founder ruling, 22 Nov 2026): Air's priority rank
  // moves to immediately after Crime — it fills ahead of
  // the merged Schools pill, A&E and everything below
  // Crime; the concerning-first selection is unchanged,
  // and the band is airPillBand's, the one computation
  // the shortlist table also colours by.
  {
    const air = areaSections?.air;
    const band = air ? airPillBand(air) : null;
    if (air && band) {
      add(band === "red" ? "concerning" : "good", {
        label: "Air quality",
        figure: band === "red" ? "Above a UK legal limit" : "Within WHO guidelines",
        band,
      });
    }
  }

  // 4 Schools (primary + secondary MERGED) — concerning if
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

  // 5 A&E — concerning >7 mi; good <=5 mi.
  {
    const ae = nearestOf(categoryOf(nearby, "ae"));
    if (ae) {
      const verdict: PillVerdict = ae.miles > 7 ? "concerning" : ae.miles <= 5 ? "good" : "neither";
      add(verdict, verdictMilesPill("A&E", verdict, ae.miles));
    }
  }

  // 6 Noise — good if road, rail AND airport are all in
  // the lowest modelled bands (day <55 dB, night <50 dB —
  // the below-range band, or "No modelled … noise", the
  // no-contribution state noiseBandLow also accepts);
  // concerning if day >=65 or night >=60 on any filed
  // band. The founder ruled (18 Nov 2026) that airport
  // counts toward the pill like road and rail: the
  // concerning scan already read every filed band, and
  // the good test now reads the airport band too — a
  // filed airport band that is not low blocks the
  // "Quiet" pill. Where no airport band is filed the
  // airport leg passes (the loader files absence itself
  // as a "No modelled airport noise" band, which is
  // low); road and rail stay required, as before.
  {
    const noise = areaSections?.noise;
    if (noise && noise.state === "served" && noise.bands.length > 0) {
      const concerning = noise.bands.some(
        (band) => noiseBandHigh(band.dayBand, true) || noiseBandHigh(band.nightBand, false),
      );
      const road = noise.bands.find((band) => band.sourceKind === "road");
      const rail = noise.bands.find((band) => band.sourceKind === "rail");
      const airport = noise.bands.find((band) => band.sourceKind === "airport");
      const airportLow =
        airport === undefined ||
        (noiseBandLow(airport.dayBand, true) && noiseBandLow(airport.nightBand, false));
      const good =
        !concerning &&
        road !== undefined &&
        rail !== undefined &&
        noiseBandLow(road.dayBand, true) &&
        noiseBandLow(road.nightBand, false) &&
        noiseBandLow(rail.dayBand, true) &&
        noiseBandLow(rail.nightBand, false) &&
        airportLow;
      add(concerning ? "concerning" : good ? "good" : "neither", {
        label: "Noise",
        figure: concerning ? "Noisy" : "Quiet",
        band: concerning ? "orange" : "green",
      });
    }
  }

  // 7 Deprivation — good at IMD decile 8-10; concerning at
  // decile 1-3; the pill states the decile.
  {
    const decile = areaSections?.imd?.state === "served" ? areaSections.imd.decile : null;
    if (decile !== null && decile !== undefined) {
      const verdict: PillVerdict = decile >= 8 ? "good" : decile <= 3 ? "concerning" : "neither";
      add(verdict, {
        label: "Deprivation",
        figure: `${decile} of 10`,
        // BUG-151: the concerning band graduates with the
        // decile — the two most deprived tenths paint red,
        // the third amber.
        band: verdict === "concerning" ? (decile <= 2 ? "red" : "orange") : "green",
      });
    }
  }

  // 8 EPC — concerning at D or below; good at A or B; C
  // neither; only when the home has a certificate.
  {
    const band = sections.epc.headlineBand;
    if (band) {
      const verdict: PillVerdict =
        band === "A" || band === "B" ? "good" : band === "C" ? "neither" : "concerning";
      add(verdict, {
        label: "EPC",
        figure: band,
        // BUG-151: D paints amber; E and below paint red.
        band: verdict === "concerning" ? (band === "D" ? "orange" : "red") : "green",
      });
    }
  }

  // 9 Vet — good <=2 mi; concerning >5 mi.
  {
    const vet = nearestOf(categoryOf(nearby, "vets"));
    // The pill's qualifying basis is the pre-BUG-079 one.
    // The vets category is not essential, so before the
    // second-pass batch it served places only inside the
    // list radius and never carried a beyond-nearest: a
    // pill fact existed only when the nearest vet stood
    // within RADIUS_MILES. BUG-079 widened the SERVED LIST
    // to the two nearest at any distance — the What's
    // Nearby lists' rule, which the founder ruled on; he
    // never ruled on pill thresholds — so the factor now
    // stays silent past the list radius, exactly as
    // before. A vet 29.7 miles away is not a concerning
    // fact about this home, and the lists keep their two
    // nearest untouched: only this factor's fact is bound.
    if (vet && vet.miles <= RADIUS_MILES) {
      const verdict: PillVerdict =
        vet.miles > 5 ? "concerning" : vet.miles <= 2 ? "good" : "neither";
      // BUG-151: the latent mismatch closes here — a vet
      // at 1.2 miles is "good" by verdict, and its chip
      // now paints the verdict's green, not the everyday
      // family band's orange.
      add(verdict, verdictMilesPill("Vet", verdict, vet.miles));
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
        band: concerning ? "red" : "green",
      });
    } else if (
      sections.broadband.gigabitCapablePct !== null &&
      sections.broadband.gigabitCapablePct > 0
    ) {
      add("good", { label: "Broadband", figure: "Full fibre available", band: "green" });
    }
  }

  // 11 Train station — good <=1 mi; concerning >3 mi.
  {
    const station = nearestOf(categoryOf(nearby, "station"));
    if (station) {
      const verdict: PillVerdict =
        station.miles > 3 ? "concerning" : station.miles <= 1 ? "good" : "neither";
      add(verdict, verdictMilesPill("Train station", verdict, station.miles));
    }
  }

  // 12 Nurseries — concerning >1 mi; good <=0.5 mi.
  {
    const nursery = nearestOf(categoryOf(nearby, "nurseries"));
    if (nursery) {
      const verdict: PillVerdict =
        nursery.miles > 1 ? "concerning" : nursery.miles <= 0.5 ? "good" : "neither";
      add(verdict, verdictMilesPill("Nurseries", verdict, nursery.miles));
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
  // BUG-247: the home's place-page name — its filed town,
  // as the place table files it — resolved by the page
  // and passed in, so this builder stays pure and never
  // reads the database. Absent, no place link is drawn,
  // never a dead one.
  placeName?: string | null;
}

export const BUY_BAR_HEADING = "Get the full detailed report for this home";
// BUG-223 — the gift-applied state's words on the free
// page (approved Screen B, DRAFT lines 2–5, verbatim):
// the header button and the trunc rows' price chip
// share "Free with your gift" (lines 2 and 4); the
// buy-bar button is "Get my free report" (line 5);
// the gift strip above the pills is line 3. The
// chip names the gift, so the state can never read
// as the free launch window's. The gift's promise
// itself ("we'll apply your free report for you, so
// there's nothing to pay", Sample 22) stands behind
// the buttons — the payment page's gift line carries
// it in full.
export const GIFT_REPORT_BUTTON_LABEL = "Get my free report";
export const GIFT_FREE_LABEL = "Free with your gift";
export const GIFT_STRIP_LINE =
  "Your free report gift is ready to use on this home — order the full report and there's nothing to pay.";
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
// HCR-03 (BUG-153, founder ruling): corrected
// sample→product — the report draws location maps for
// the flood-zone and surface-water checks only; the
// rivers & sea check has none, so "for each check" is
// out and the mapped layers are named instead. The
// Master conforms; the door and payment pages read this
// same constant. BUG-214 (founder ruling 24 Nov 2026):
// the mapped-layers tail is trimmed — the lead stands
// as "Plus the flood findings in full" alone.
export const FLOOD_UPSELL_LEAD = "Plus the flood findings in full";
export const FLOOD_UPSELL_DETAIL =
  "The defences near this home, and how the picture changes in the years ahead.";
// D77(c) absence/failure copy, pinned.
export const COULD_NOT_PULL_LINE =
  "We couldn't pull this just now — the rest of your check is below. Try again in a little while.";
export function notCoveredLine(checkName: string, nation: Nation): string {
  return `${checkName} isn't part of this check in ${nationName(nation)} — the figures we use cover England and Wales.`;
}

// The broadband caveat (M7.11 D-1): the sample's words,
// appended to the broadband line in the Costs section.
export const BROADBAND_CAVEAT = "the exact package at this home varies by provider";

// The flood absence-state explanations (M7.11 D-2): the
// rivers & sea form is built from the publisher's own
// Very-low definition (lib/flood.ts's pinned table, never
// retyped); the surface-water form is the sample's — the
// postcode appears only in the extreme 1-in-1,000-year
// picture, the same annual chance in the sample's words.
export const FLOOD_ROFRS_ABSENCE_LINE = `The Very low band means ${FLOOD_BAND_DEFINITIONS["Very low"]}.`;
export const FLOOD_ROFSW_ABSENCE_LINE =
  "This postcode appears only in the extreme 1-in-1,000-year surface-water picture.";

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
  // Null on the wider-area view (M7.10 G2): there is no
  // home there, so the home-specific calculators are
  // suppressed like the buy bar. The nation rides with the
  // view so the stamp duty card can take its Scotland /
  // Wales named-line form (M7.10 G1).
  calculators: { lastSalePrice: number | null; nation: Nation } | null;
  // The "About these checks" expander's links (M7.12),
  // derived from the sections this view carries.
  checkLinks: CheckLink[];
  warningsStrip: WarningsStripView;
  // The flood section's live-warnings state as served, so
  // the page (and its tests) can name the state the flood
  // section renders: "warnings" | "none" | "unavailable",
  // or null where flood does not serve (not covered, wider
  // area).
  floodWarningsState: "warnings" | "none" | "unavailable" | null;
  tabs: ResultsTabView[];
  // The district page's bridge (founder ruling, 18 Nov
  // 2026): the ONLY forward path on the wider-area page —
  // into a full-postcode check. No buy bar, no report link
  // and no upsell anywhere at rung 3. Present only on the
  // district view; every other view leaves it unset.
  bridge?: {
    heading: string;
    line: string;
    // The named-area postcode links (founder fix batch,
    // 19 Nov 2026): "POSTCODE · Settlement" labels landing
    // on that settlement's filed postcode check.
    links: { label: string; href: string }[];
    outward: string;
  } | null;
}

function linesSection(
  key: string,
  heading: string,
  blocks: SectionBlock[],
  sourceLine: string | null = null,
): ResultsSectionView {
  return { key, heading, blocks, sourceLine };
}

// The beyond-nearest radius guard (BEYOND_NEAREST_RADIUS_MILES,
// farBeyondLine, suppressFarBeyond) lives in lib/journey.ts
// since the fix batch of 19 Nov 2026 (BUG-002): the checking
// screen's feed derivation applies it, and the results layer
// applies it to the bundle the summary pills read — so no
// pill is ever struck from a far pointer. It is imported
// above and re-exported here so this module's existing
// importers are untouched.
//
// BUG-213 far-beyond ruling (founder, 24 Nov 2026): the
// free page's GROUPS do not suppress the far-beyond
// nearest — they name it. The guard itself is untouched
// (its function, and the checking feed that derives
// through it in lib/journey.ts's nearbyCheckingGroups,
// keep the unnamed line); only this display layer
// restores the suppressed pointer, so placeGroupView
// renders it as a named row and the distance pill
// colours by the group's own family band (GP "everyday":
// red past 1.5 miles, so red at 30). The split is
// deliberate: pills keep the guard, groups name the
// nearest.
export { BEYOND_NEAREST_RADIUS_MILES, suppressFarBeyond };

function nameFarBeyondForDisplay(category: CategoryAnswer): CategoryAnswer {
  const suppressed = suppressFarBeyond(category);
  // The guard nulled a beyond-nearest this category
  // carried: restore it for the free page's groups, so
  // the row names the place and its pill. Where the
  // guard did not suppress (within radius, or no
  // beyond-nearest at all), the category passes through
  // unchanged.
  if (suppressed.beyondNearest === null && category.beyondNearest)
    return { ...suppressed, beyondNearest: category.beyondNearest };
  return suppressed;
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
  // Section 3: one gate feeds both consumers). The guard
  // runs on the bundle the summary pills read
  // (effectiveNearby), so no pill is ever struck from a far
  // pointer (CI #205 fix); the groups read the display
  // map below, where the far-beyond nearest is restored
  // and named (BUG-213 ruling).
  const effectiveNearby = nearby
    ? {
        ...nearby,
        categories: nearby.categories.filter((c) => !gated.has(c.category)).map(suppressFarBeyond),
      }
    : null;
  const categories = new Map<string, CategoryAnswer>(
    (nearby?.categories ?? [])
      .filter((c) => !gated.has(c.category))
      .map((category) => [category.category, nameFarBeyondForDisplay(category)]),
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
  // A section's strip, in the Master's form: the group's
  // own section plus the one plain or merged truncRow the
  // section declares (the placesUpsell form, kept).
  const placesUpsell = (
    key: string,
    table: Record<string, CategoryPresentation>,
    lead: string | null,
    detail: string | null,
  ): ResultsSectionView => withUpsell(group(key, table), lead, detail);
  // A schools group's truncation detail (parity fix
  // batch, item 14): the Master's truncRow is ONE row —
  // the count lead and the detail together (the pre-batch
  // page carried the count row AND a separate upsell panel
  // for the same group). OBS-012: the detail names the
  // total AS CAPPED at the seam (truncation.total) — the
  // sample's "All 5" form, true at any density (WN-09:
  // the pre-fix detail named the raw filed total, "All
  // 61" where the report serves five).
  const schoolsUpsell = (key: string, detailTail: string): ResultsSectionView => {
    const section = group(key, FAMILY_CATEGORIES);
    const first = section.blocks[0];
    if (first && first.type === "places" && first.group.truncation) {
      const total = first.group.truncation.total;
      first.group.truncation.detail = `All ${total}, with their Ofsted ratings and inspection dates${detailTail}.`;
    }
    return section;
  };
  // OBS-012 (structural remedy): suppression is a
  // per-SECTION declaration, applied here as one closing
  // pass — not an opt-out at each call site (the item-14
  // suppressTruncation wrappers retire with this stack;
  // the deep dive records that the opt-out form is what
  // let seven groups keep their raw count lines). The
  // declaration: a section that carries its own upsell
  // block has declared its strip, and no group ABOVE the
  // strip also speaks — the strip speaks for the groups
  // it follows. Groups below a strip stand under their
  // own subheadings as their own sub-parts and keep
  // their capped strips (the Pets section's boarding and
  // pet-shops strips, under the vets strip, are the
  // standing case). On the What's Nearby tab a section
  // with no declared strip carries none at all (the
  // closing combined strip speaks for the tab's tail
  // groups, as the sample's does). What survives is
  // exactly the sample's strip set: the schools rows
  // (their own sections, capped at the seam), the
  // nurseries merged row, the pets sub-strips, and every
  // section's declared upsell.
  const declareSectionStrips = (tab: ResultsTabView): void => {
    for (const section of tab.sections) {
      const above: { group: PlaceGroupView }[] = [];
      let declared = false;
      for (const block of section.blocks) {
        if (block.type === "upsell") {
          declared = true;
          break;
        }
        if (block.type === "places") above.push(block);
      }
      if (declared) {
        for (const block of above) block.group.truncation = null;
      } else if (tab.id === "nearby") {
        for (const block of section.blocks) {
          if (block.type === "places") block.group.truncation = null;
        }
      }
    }
  };
  // The composition boundary's sentence pass (HCR-08 /
  // NB-08): every standalone line this view renders from
  // a brain line takes the report's sentence-casing, once,
  // here — line blocks, tagged-line texts and bullets,
  // notices, and place groups' ruled lines. Composed
  // lines already capitalised pass through untouched;
  // row details (parts of a composed line, some ruled
  // "as filed") are not standalone lines and stay as
  // composed.
  const sentencePass = (tab: ResultsTabView): void => {
    for (const section of tab.sections) {
      for (const block of section.blocks) {
        if (block.type === "line" || block.type === "small-line")
          block.text = sentenceStart(block.text);
        else if (block.type === "list")
          block.items = block.items.map((item) => ({ ...item, text: sentenceStart(item.text) }));
        else if (block.type === "notice") block.text = sentenceStart(block.text);
        else if (block.type === "tagged-line") {
          block.texts = block.texts.map(sentenceStart);
          if (block.bullets) block.bullets = block.bullets.map(sentenceStart);
        } else if (block.type === "places" && block.group.line)
          block.group.line = sentenceStart(block.group.line);
      }
    }
  };

  // --- Family Checks --------------------------------------
  const familySections: ResultsSectionView[] = [];
  familySections.push(schoolsUpsell("schools-primary", ""));
  familySections.push(schoolsUpsell("schools-secondary", ", and sixth-form provision"));
  // FC-05 (BUG-154): the selective schools stand in their
  // OWN section, headed "Selective schools", after the
  // secondary group — the sample's form. The grammar list
  // is lifted out of the secondary group (which keeps its
  // rows and its strip) into a group of its own carrying
  // only the grammar rows and the BUG-140 count line. The
  // section stands only where selective schools serve.
  {
    const secondary = familySections[familySections.length - 1];
    const first = secondary.blocks[0];
    if (first && first.type === "places" && first.group.grammarSchools.length > 0) {
      const grammarGroup: PlaceGroupView = {
        ...first.group,
        rows: [],
        line: null,
        truncation: null,
      };
      first.group.grammar = null;
      first.group.grammarSchools = [];
      first.group.grammarCountLine = null;
      familySections.push(
        linesSection("selective", "Selective schools", [{ type: "places", group: grammarGroup }]),
      );
    }
  }
  // FC-06 (BUG-154, founder ruling 22 Nov 2026): the
  // catchment block is RETIRED — it restated, in fuller
  // prose, the catchment and deadline substance the page
  // already carries verbatim in its closing disclaimers,
  // and the sample's tab never carried it. The block, its
  // constants and the deadlines line it rode on are gone;
  // the disclaimers stand as the single statement.
  {
    const nurseries = group("nurseries", FAMILY_CATEGORIES);
    const category = categories.get("nurseries");
    if (category && category.state === "within") {
      // The merged truncRow (item 14): the Master's
      // nurseries row carries the "plus more" lead and its
      // detail as ONE row, replacing both the group's count
      // row and the old separate panel. BUG-152 ruling: the
      // detail names the NEAREST set — the report serves
      // the nearest three, and "the full list" was one of
      // the three false wordings corrected sample→product.
      const first = nurseries.blocks[0];
      if (first && first.type === "places") {
        first.group.truncation = {
          // The seam's cap applies here too (OBS-012):
          // the merged row's count is min(filed, report
          // depth) − shown, never the raw filed count.
          n: Math.max(
            0,
            Math.min(category.countWithin, reportListSizeFor("nurseries")) -
              first.group.rows.length,
          ),
          total: Math.min(category.countWithin, reportListSizeFor("nurseries")),
          lead: "Plus more nurseries & pre-schools",
          detail: "The nearest nurseries and pre-schools to this home, with their details.",
          href: linkable ? reportHref : null,
        };
      }
    }
    familySections.push(nurseries);
  }
  // Pets (D76): vet, pet shops and pet boarding in one
  // section, each kind under its own subheading (FC-03).
  {
    const blocks: SectionBlock[] = [];
    const vets = group("vets", NEARBY_CATEGORIES);
    // BUG-205: the vets kind takes its own subheading
    // like the other two kinds — FC-03's rule is each
    // kind under its own subheading, and the report's
    // own form already carries "Vets" (BUG-079). The
    // push was never made, so the vet rows stood bare
    // under the section heading. The Master itself
    // carries no "Vets" subheading (Sample 3 names the
    // kind inside the row, "Vet — ..."; View 7 names
    // "Vets" as a row) — the subheading is restored
    // per the product's own settled form, dressed per
    // the sample's subheading treatment.
    blocks.push({ type: "subheading", text: "Vets" });
    blocks.push(...vets.blocks);
    const vetCategory = categories.get("vets");
    if (vetCategory && vetCategory.state === "within")
      blocks.push({
        type: "upsell",
        // FC-01 (BUG-154): the lead names only what the
        // report serves — vets, pet shops, pet boarding.
        // "Dog-walking areas" promised a class of content
        // the product does not hold anywhere; it is out,
        // and the Master conforms.
        lead: "Plus pet shops & more vets",
        detail: null,
      });
    blocks.push({ type: "subheading", text: "Pet boarding (kennels & catteries)" });
    blocks.push(...group("pet-boarding", NEARBY_CATEGORIES).blocks);
    // FC-03: pet shops take their own subheading (the
    // report's own sub-heading for the kind), so their
    // rows can no longer read as boarding rows.
    blocks.push({ type: "subheading", text: "Pet shops" });
    blocks.push(...group("pet-shops", NEARBY_CATEGORIES).blocks);
    familySections.push(linesSection("pets", "Pets", blocks));
  }

  // --- The Neighbourhood ----------------------------------
  const neighbourhoodSections: ResultsSectionView[] = [];
  // The census headlines block (D77(e)): the labelled
  // facts composed from the served Census tables + the
  // IMD decile, with the finalized small print. BUG-156 /
  // NB-02 / NB-03 (BUG-155): the headlines take the
  // bullet treatment — one fact per bullet under the
  // sample's bold lead-ins, split line by line per the
  // audit's inventory (the pre-fix form packed five and
  // four facts into single prose sentences and flattened
  // the lead-ins away). The coverage line stays prose, in
  // the small-print dress (NB-01), after the data.
  {
    const blocks: SectionBlock[] = [];
    const census = areaSections?.census;
    const imd = areaSections?.imd;
    // BUG-247 (founder ruling, 24 Nov 2026): the free
    // page links on to its district page and its place
    // page, at the foot of this section — the one that
    // talks about the wider area around the home. The
    // district link needs only the outward, derived here
    // from the resolution; the place link needs the
    // home's filed town as a place-page name, resolved
    // by the page and passed in as placeName. Rung 1
    // only: the address list and the wider-area view
    // carry no single home whose town this could name.
    const widerLinks: SectionBlock[] = [];
    if (resolution.rung === 1) {
      const outward = resolution.directory.postcode.split(" ")[0];
      widerLinks.push({
        type: "link",
        label: `Wider area — ${outward}`,
        url: widerAreaRoute(outward),
      });
      if (input.placeName) {
        widerLinks.push({
          type: "link",
          label: input.placeName,
          url: placeChoiceRoute(input.placeName),
        });
      }
    }
    if (census && census.state === "served") {
      const items: { lead?: string; text: string; sub?: boolean }[] = [];
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
      ) {
        items.push(
          {
            lead: "Owning and renting",
            text: `${Math.round(owned / 10)} in 10 households own their home.`,
          },
          // BUG-206: the four detail bullets sit one level
          // in under their group bullet.
          { text: `${Math.round(outright)}% own outright.`, sub: true },
          { text: `${Math.round(mortgage)}% own with a mortgage.`, sub: true },
          { text: `${Math.round(social)}% rent from a social landlord.`, sub: true },
          { text: `${Math.round(priv)}% rent privately.`, sub: true },
        );
      }
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
      // NB-11: a partially filed ethnic table serves the
      // people line in a reduced named form rather than
      // vanishing silently — the age stands alone, or
      // with however many of the group facts are filed.
      if (ageText) {
        const people: { lead?: string; text: string; sub?: boolean }[] = [
          { lead: "The people here", text: `The typical age is ${ageText}.` },
        ];
        if (white)
          people.push({
            text: `${Math.round(white.pct)} in 100 residents are White.`,
            sub: true,
          });
        if (white && others.length === 2)
          people.push({
            text: `The next largest groups are ${shortGroup(others[0].label)} (${others[0].pct} in 100) and ${shortGroup(others[1].label)} (${others[1].pct} in 100).`,
            sub: true,
          });
        else if (white && others.length === 1)
          people.push({
            text: `The next largest group is ${shortGroup(others[0].label)} (${others[0].pct} in 100).`,
            sub: true,
          });
        items.push(...people);
      }
      const accom = table("ts044");
      if (accom) {
        const detSemi = accom.rows
          .filter((r) => r.label === "Detached" || r.label === "Semi-detached")
          .reduce((sum, r) => sum + r.pct, 0);
        const flat = accom.rows
          .filter((r) => /flat/i.test(r.label))
          .reduce((sum, r) => sum + r.pct, 0);
        if (detSemi > 0 && flat > 0)
          items.push(
            {
              lead: "The homes themselves",
              text: `Nearly ${Math.round(detSemi / 10)} in 10 are detached or semi-detached houses.`,
            },
            // BUG-206: the flat detail sits one level in
            // under its group bullet.
            { text: `About 1 in ${Math.round(100 / flat)} is a flat.`, sub: true },
          );
      }
      // NB-07: deprivation is served in its position in
      // EVERY state — the named line the report serves
      // (its own sentence form) — never a silent vanishing
      // under small print that still asserts the coverage.
      if (imd && imd.state === "served" && imd.decile !== null)
        items.push({
          lead: "Deprivation",
          text: `This postcode's immediate area sits in decile ${imd.decile} of 10, where 10 is the least deprived in England.`,
        });
      else if (imd && imd.line) items.push({ lead: "Deprivation", text: sentenceLine(imd.line) });
      if (items.length > 0) blocks.push({ type: "list", items });
      if (census.residentsTotal) {
        // The decile clause stands only when the decile
        // line stands (NB-07); the median-age clause is
        // the report's own caption words (NB-12).
        const decileClause =
          imd && imd.state === "served" && imd.decile !== null
            ? " The deprivation decile covers the immediate area."
            : "";
        blocks.push({
          type: "small-line",
          text: `Census 2021 figures cover the wider area around this home — about ${(Math.round(census.residentsTotal / 100) * 100).toLocaleString("en-GB")} residents.${decileClause} Facts as published, in the Census's own words — no scores. The typical age is calculated from the Census's single years of age.`,
        });
      }
      // NB-15: the strip's table count is composed from
      // the tables actually served — six is the full
      // filing's form; a partial filing drops the numeral
      // claim rather than promising tables not held.
      const tableCount = census.tables.length;
      blocks.push({
        type: "upsell",
        lead: "Plus the full Census picture for this area",
        detail:
          tableCount >= 6
            ? "Six tables as published — age, ethnic group, religion, type of home, bedrooms and tenure, every count and percentage."
            : "The Census tables as published for this area — every count and percentage.",
      });
      blocks.push(...widerLinks);
      neighbourhoodSections.push(
        linesSection("census", "The neighbourhood in numbers", blocks, census.sourceLine),
      );
    } else {
      blocks.push({
        type: "line",
        // NB-14: the brain's fragment takes the full
        // sentence form here, as the district view's
        // equivalent state carries.
        text: census?.line
          ? sentenceLine(census.line)
          : "Census 2021 figures are not filed for this area.",
      });
      blocks.push(...widerLinks);
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
        // BUG-156 / NB-03: the crime facts take the
        // report's own list form (BUG-078's split) — the
        // total as one bullet, the rate as its own, the
        // England figure as a labelled third. One decimal,
        // always (parity fix batch, item 9): the pair
        // states both figures in the same form — "51.7"
        // and "94.5" — never a stripped whole ("94") and
        // never a raw float. The streets sentence is an
        // explainer: prose, in the small-print dress,
        // after the data (NB-01).
        blocks.push({
          type: "list",
          items: [
            {
              text:
                direction === "at"
                  ? `${crimeSection.total.toLocaleString("en-GB")} crimes recorded in the last 12 months — about the same as the England average.`
                  : `${crimeSection.total.toLocaleString("en-GB")} crimes recorded in the last 12 months — about ${pct}% ${direction} the England average.`,
            },
            {
              text: `${per1000 === 0 ? "0" : per1000.toFixed(1)} recorded crimes for every 1,000 residents here.`,
            },
            {
              // The report's own labelled form: the
              // label carries its colon, as Section 4's
              // "Across England:" bullet stands.
              lead: "Across England:",
              text: `${england === 0 ? "0" : england.toFixed(1)} recorded crimes for every 1,000 residents.`,
            },
          ],
        });
        blocks.push({
          type: "small-line",
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
  // Air quality & noise (D76: one combined section). The
  // Master's form (parity fix batch, items 23/24): two
  // MODELLED rows — the air row carries all three
  // pollutants at two decimals with the Defra fineprint;
  // the noise row carries the single joined band line
  // with its fineprint. The pre-batch form led with the
  // brain's headline-figure and per-band lines.
  {
    const blocks: SectionBlock[] = [];
    const air = sections.air;
    // The three pollutant values live on the area bundle's
    // full air section (the short projection carries only
    // the headline figure).
    const airFull = areaSections?.air ?? null;
    if (
      airFull &&
      airFull.state === "served" &&
      airFull.no2 != null &&
      airFull.pm25 != null &&
      airFull.pm10 != null &&
      airFull.year != null
    ) {
      blocks.push({
        type: "tagged-line",
        lead: "Air quality",
        texts: [],
        // BUG-156 (NB audit §5.5, items 11–12, on the
        // BUG-142 precedent): the three pollutant figures
        // take one bullet each under the row's lead, as
        // the report's Section 4 bullets its air lines —
        // not one semicolon-joined sentence.
        bullets: [
          `Nitrogen dioxide (NO2) ${airFull.no2.toFixed(2)} µg/m³ a year.`,
          `PM2.5 ${airFull.pm25.toFixed(2)} µg/m³.`,
          `PM10 ${airFull.pm10.toFixed(2)} µg/m³.`,
        ],
        fineprint: `Defra modelled background for this postcode, ${airFull.year}. This is a modelled estimate, not a measurement at this address.`,
        tag: "MODELLED",
        tagTone: "grey",
      });
    } else {
      if (air.headlineFigure) blocks.push({ type: "line", text: air.headlineFigure.line });
      if (air.line) blocks.push({ type: "line", text: air.line });
      if (blocks.length === 0)
        blocks.push({ type: "line", text: "Air quality is not covered for this postcode." });
    }
    let noisePushed = false;
    if (areaSections?.noise) {
      const noise = areaSections.noise;
      if (noise.state === "served") {
        const single = noiseSingleLine(noise.bands);
        if (single) {
          blocks.push({
            type: "tagged-line",
            lead: "Noise",
            texts: [],
            // BUG-156 (NB §5.5 item 12): one bullet per
            // source — the joined line's own clauses,
            // each standing as its own sentence, as the
            // report serves noise per source.
            bullets: single
              .replace(/\.$/, "")
              .split("; ")
              .map((clause) => `${sentenceStart(clause)}.`),
            fineprint: "Defra modelled bands.",
            tag: "MODELLED",
            tagTone: "grey",
          });
          noisePushed = true;
        } else if (noise.line) {
          blocks.push({ type: "line", text: noise.line });
          noisePushed = true;
        }
      } else if (noise.line) {
        blocks.push({ type: "line", text: noise.line });
        noisePushed = true;
      }
    }
    if (!noisePushed)
      blocks.push({ type: "line", text: "Noise bands are not covered for this postcode." });
    let sourceLine: string | null = null;
    if (areaSections?.noise) sourceLine = areaSections.noise.sourceLine;
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
      // The Master's four stat tiles (parity fix batch,
      // item 20), composed from the home's own recorded
      // sales: Last sale, Times sold, Change since prev.,
      // Held by last owner — every date in the human form,
      // never an ISO date. Below them, the property-type
      // line ending in the not-a-valuation sentence.
      const ownSales = sold.ownSales ?? [];
      if (ownSales.length > 0) {
        const last = ownSales[ownSales.length - 1];
        const prev = ownSales.length >= 2 ? ownSales[ownSales.length - 2] : null;
        blocks.push({
          type: "tiles",
          tiles: [
            {
              label: "Last sale",
              value: formatPounds(last.price),
              sub: `${formatFiledDate(last.date)} • Land Registry`,
            },
            {
              label: "Times sold",
              value: String(ownSales.length),
              sub:
                ownSales.length === 1
                  ? "Only recorded sale found"
                  : `${ownSales.length} recorded sales found`,
            },
            prev
              ? {
                  label: "Change since prev.",
                  value: signedPounds(last.price - prev.price),
                  sub: `Previous sale ${formatPounds(prev.price)} — ${formatFiledDate(prev.date)}`,
                }
              : { label: "Change since prev.", value: "—", sub: "First recorded sale" },
            prev
              ? {
                  label: "Held by last owner",
                  value: heldDuration(prev.date, last.date),
                  sub: `Bought ${formatFiledDate(prev.date)} — sold ${formatFiledDate(last.date)}`,
                }
              : {
                  label: "Held by last owner",
                  value: "—",
                  sub: last.newBuild
                    ? `New build — the ${last.date.slice(0, 4)} sale was its first`
                    : "First recorded sale",
                },
          ],
        });
        const typeLabel = last.propertyType
          ? (PROPERTY_TYPE_LABELS[last.propertyType] ?? null)
          : null;
        if (typeLabel) {
          const tenure = last.tenure ? TENURE_LABELS[last.tenure] : undefined;
          const parts = [
            typeLabel,
            tenure ? tenure.toLowerCase() : null,
            last.newBuild ? "new build" : null,
          ].filter((part): part is string => part !== null);
          // HCR-19: the not-a-valuation explainer wears
          // the small-print dress, as the sample wears
          // this whole line small — never body size.
          blocks.push({
            type: "small-line",
            text: `${parts.join(", ")}. These figures describe recorded sales only — they are not a valuation of this home.`,
          });
        }
      } else {
        const tiles: { label: string; value: string }[] = [];
        if (sold.ownLastSale)
          tiles.push({
            label: "Last sale of this home",
            value: `${formatPounds(sold.ownLastSale.price)} — ${formatFiledDate(sold.ownLastSale.date)}`,
          });
        // HCR-12: no "Postcode median" tile — the median
        // line directly beneath stated the same figure a
        // second time; the line carries figure, count and
        // span, and stands alone.
        if (tiles.length > 0) blocks.push({ type: "tiles", tiles });
        if (sold.ownLine) blocks.push({ type: "line", text: sold.ownLine });
      }
      // The median lines, human-dated (item 20): the
      // brain's own lines carry ISO spans ("2013-09-20 to
      // 2024-01-31"); the served form composes the same
      // facts with human dates. Non-served states keep the
      // brain's line (the below-threshold and not-filed
      // forms carry no span).
      if (
        sold.median.state === "served" &&
        sold.median.value != null &&
        sold.median.spanFrom &&
        sold.median.spanTo
      )
        blocks.push({
          type: "line",
          text: `Postcode median ${formatPounds(sold.median.value)} — counted over ${sold.median.counted} recorded sales, ${formatFiledDate(sold.median.spanFrom)} to ${formatFiledDate(sold.median.spanTo)}.`,
        });
      // Fix batch, 19 Nov 2026 — BUG-013: a loaded-none
      // postcode's median line IS its state line (the
      // brain composes "No sale recorded for this
      // postcode since 1995" in both slots — the load
      // state's line and the median answer's line), and
      // the section above already pushed the state line,
      // so the sentence rendered twice on the same tab.
      // The median line serves only when it says
      // something the state line has not already said.
      else if (sold.median.line && sold.median.line !== sold.stateLine)
        blocks.push({ type: "line", text: sold.median.line });
      if (sold.buildingMedian) {
        const building = sold.buildingMedian;
        if (
          building.state === "served" &&
          building.value != null &&
          building.spanFrom &&
          building.spanTo
        )
          blocks.push({
            type: "line",
            text: `${building.building} median ${formatPounds(building.value)} — counted over ${building.counted} recorded sales of the building, ${formatFiledDate(building.spanFrom)} to ${formatFiledDate(building.spanTo)}.`,
          });
        else if (building.line) blocks.push({ type: "line", text: building.line });
      }
      blocks.push({
        type: "upsell",
        // HCR-02 (BUG-153, founder ruling): corrected
        // sample→product — Section 2's table is capped at
        // the 10 most recent category A sales, so "full"
        // and "the range" (a figure Section 2 never
        // states) are out; the strip states what the
        // report gives. The Master conforms.
        lead: "Plus the sale-by-sale table & sold prices nearby",
        detail: "The median, the count, and the 10 most recent sales in a table.",
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
    const money = (pence: number) =>
      pence % 100 === 0
        ? formatPounds(pence / 100)
        : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (
      tax.state === "served" &&
      taxFull?.bandDMonthlyPence != null &&
      taxFull?.bandDAveragePence != null &&
      certCosts
    ) {
      const totalMonthly = taxFull.bandDMonthlyPence + certCosts.currentMonthlyPence;
      // The Master's monthly row (parity fix batch): the
      // £ / MONTH badge row; the year's figures ride in
      // the brain's own pence-true labels (the tax year
      // figure is the filed Band D label, the energy year
      // figure the certificate's own label).
      blocks.push({
        type: "tagged-line",
        texts: [
          `About ${money(totalMonthly)} a month: council tax ${money(taxFull.bandDMonthlyPence)} a month (Band D average, ${taxFull.bandDAverageLabel} a year) + EPC estimated energy about ${money(certCosts.currentMonthlyPence)} a month (${certCosts.currentAnnualLabel} a year). Mortgage not included.`,
        ],
        tag: "£ / MONTH",
        tagTone: "grey",
      });
    }
    // Council tax, stated ONCE (item 22): the Master's
    // single Band D line — yearly, monthly, and the
    // average/own-band sentence. The pre-batch page stated
    // the tax twice (the section line and the brain's
    // monthly line). The named states (not filed, not
    // covered) keep the section's own line, plainly.
    if (
      tax.state === "served" &&
      taxFull?.authority &&
      taxFull?.bandDAverageLabel &&
      taxFull?.bandDMonthlyLabel
    ) {
      blocks.push({
        type: "tagged-line",
        lead: "Council tax",
        texts: [
          `Band D — ${taxFull.authority}: ${taxFull.bandDAverageLabel} a year, ${taxFull.bandDMonthlyLabel} a month. That is the authority's Band D average; this home's own band isn't published.`,
        ],
        tag: "BAND + £/YR",
        tagTone: "a",
      });
    } else {
      if (tax.line) blocks.push({ type: "line", text: tax.line });
      if (tax.line === null)
        blocks.push({ type: "line", text: "Council tax is not covered for this postcode." });
    }
    // EPC & energy (item 21): the rating leads, in the
    // Master's form, composed from the home's filed
    // certificate — band, score, potential band and score,
    // validity — before the modelled-cost sentence. Rung 1
    // only: the certificate is THIS home's. Where no
    // matched certificate serves, the section's own lines
    // stand as before.
    const cert = areaSections?.epc?.certificates?.[0] ?? null;
    if (resolution.rung === 1 && cert && cert.band && cert.rating != null) {
      let text = `Rating ${cert.band} — score ${cert.rating} out of 100`;
      if (cert.potentialBand)
        text += `, with potential to reach ${cert.potentialBand}${cert.potentialRating != null ? ` (${cert.potentialRating})` : ""}`;
      text += ".";
      if (cert.registrationDate)
        text += ` Certificate for this home, valid until ${epcValidUntil(cert.registrationDate)}.`;
      if (cert.energyCosts)
        text += ` Estimated energy cost about ${cert.energyCosts.currentAnnualLabel} a year at the certificate's prices.`;
      blocks.push({
        type: "tagged-line",
        lead: "EPC & energy",
        texts: [text],
        tag: "EPC",
        tagTone: "g",
      });
    } else {
      blocks.push({ type: "subheading", text: "EPC & energy" });
      if (epc.headlineAssessmentLabel)
        blocks.push({ type: "line", text: epc.headlineAssessmentLabel });
      if (epc.line) blocks.push({ type: "line", text: epc.line });
      if (certCosts) blocks.push({ type: "line", text: certCosts.line });
    }
    // HCR-07 (BUG-153): EV charging and Broadband &
    // mobile are ROWS among the Costs rows, as the sample
    // draws them — the two subheadings the sample doesn't
    // draw are gone. The EV group's own count line is
    // retired by the section's strip declaration (the
    // OBS-012 pass): the sample's EV row stands alone.
    // BUG-209: the EV row is composed here, not taken
    // from the group — the group's none-within form
    // emits BOTH its "None within 5 miles — nearest
    // is ..." line and the beyond row, and the line
    // duplicates the entry below it. The sample's
    // Costs row is one row with the bold "EV charging"
    // lead: "Nearest public charge point — <name>."
    // with the distance pill (Sample 3, Costs). The
    // entry stays in Costs — the Master puts it there,
    // as a row among the Costs rows, never under the
    // "EPC & energy" subheading above. Where no nearest
    // serves, the group's own blocks stand unchanged
    // (the empty line, or the could-not-pull line).
    {
      const evCategory = categories.get("ev-chargers");
      const evNearest =
        evCategory?.state === "within"
          ? (evCategory.places[0] ?? null)
          : evCategory?.state === "none-within"
            ? evCategory.beyondNearest
            : null;
      if (evNearest) {
        blocks.push({
          type: "tagged-line",
          lead: "EV charging",
          texts: [`Nearest public charge point — ${evNearest.name}.`],
          miles: {
            text: `${formatMiles(evNearest.miles)} mi`,
            band: distanceBand("ev", evNearest.miles),
          },
        });
      } else {
        blocks.push(...group("ev-chargers", NEARBY_CATEGORIES).blocks);
      }
    }
    const broadband = sections.broadband;
    // The sample's broadband row: the broadband fact and
    // the mobile fact joined in one row under the
    // COVERAGE badge (HCR-07 — the badge the product had
    // dropped). D-1 (M7.11, founder adopted 18 Nov
    // 2026): the caveat rides on the broadband line
    // itself, so the postcode share can never be misread
    // as a promise about this home's package.
    {
      const texts: string[] = [];
      if (broadband.line) texts.push(`${broadband.line} — ${BROADBAND_CAVEAT}`);
      if (areaSections?.mobile?.line) texts.push(areaSections.mobile.line);
      if (texts.length > 0)
        blocks.push({
          type: "tagged-line",
          lead: "Broadband & mobile",
          texts,
          tag: "COVERAGE",
          tagTone: "grey",
        });
      else
        blocks.push({ type: "line", text: "Broadband answers are not covered for this postcode." });
    }
    // HCR-11: the strip's EPC promise is gated on a
    // certificate being filed for the home — beside a
    // fallback EPC row, "the full EPC certificate detail"
    // promises what no report can give for this home.
    if (cert)
      blocks.push({
        type: "upsell",
        lead: "Plus every council tax band and the full EPC certificate detail",
        detail:
          "Bands A to H for this council, a year and a month each — plus the certificate's construction, improvements, typical savings and solar figures.",
      });
    else
      blocks.push({
        type: "upsell",
        lead: "Plus every council tax band in full",
        detail: "Bands A to H for this council, a year and a month each.",
      });
    const sourceLine =
      area.kind === "area-bundle" ? (area.sections.councilTax?.sourceLine ?? null) : null;
    homeSections.push(linesSection("costs", "Costs", blocks, sourceLine));
  }
  // Flood: the Master's verdict-led form (parity fix
  // batch, item 25) — two verdict rows with CHECK tags,
  // Rivers & sea then Surface water, each leading with
  // its band and the band's own definition; the
  // no-warnings sentence rides inside the rivers row when
  // no warning is in force. Live warnings, when any are
  // in force, keep their block above the rows. HCR-04
  // (BUG-153, with BUG-151 ruling 3): the Rivers & sea
  // row also carries the PLANNING ZONE fact, in the
  // sample's clause form — the brain's own zone sentence,
  // sentence-cased — so a home inside Flood Zone 3 never
  // reads as a bare "Very low" on this tab either.
  {
    const blocks: SectionBlock[] = [];
    let floodServed = false;
    if (flood.kind === "flood" && flood.flood.state === "served") {
      const live = flood.flood.liveWarnings;
      if (live && live.state === "warnings") blocks.push(floodWarningsBlock(live));
      if (live && live.state === "unavailable" && live.line)
        blocks.push({ type: "line", text: live.line });
      const shortFlood = sections.flood;
      if (shortFlood.state === "served") {
        floodServed = true;
        const zoneLayer = shortFlood.layers.find((entry) => entry.layer === "flood_zone");
        const zoneClause = zoneLayer ? sentenceLine(zoneLayer.line) : null;
        const verdictFor = (layerKind: "rofrs" | "rofsw", name: string): SectionBlock | null => {
          const layer = shortFlood.layers.find((entry) => entry.layer === layerKind);
          if (!layer) return null;
          let text: string;
          if (layer.pointState === "inside" && layer.coveringLabel) {
            const definition = layer.coveringDefinition ?? "";
            text = `${layer.coveringLabel} — ${definition}${definition.endsWith(".") ? "" : "."}`;
          } else if (layer.pointState === "no-band-published") {
            text = `Very low — ${FLOOD_BAND_DEFINITIONS["Very low"]}.`;
          } else if (layer.pointState === "below-lowest-band") {
            text = `Very low — ${FLOOD_ROFSW_ABSENCE_LINE.charAt(0).toLowerCase()}${FLOOD_ROFSW_ABSENCE_LINE.slice(1)}`;
          } else {
            text = layer.line;
          }
          if (layerKind === "rofrs" && zoneClause) text = `${text} ${zoneClause}`;
          return {
            type: "verdict",
            name,
            text,
            tag: "CHECK",
            note:
              layerKind === "rofrs" && live?.state === "none"
                ? "No live flood warnings are in force for this area just now."
                : null,
          };
        };
        const rivers = verdictFor("rofrs", "Rivers & sea");
        if (rivers) blocks.push(rivers);
        const surface = verdictFor("rofsw", "Surface water");
        if (surface) blocks.push(surface);
      }
    } else if (flood.kind === "not-covered") {
      blocks.push({ type: "line", text: flood.flood.reason });
    }
    if (blocks.length === 0)
      blocks.push({ type: "line", text: "Flood answers are not covered for this postcode." });
    // HCR-11: the strip stands only where flood findings
    // actually serve — beside a not-covered line it would
    // promise findings "in full" that do not exist.
    if (floodServed)
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
    const constraints = sections.constraints;
    // BUG-212 (Sample 2 "Grouped by answer", founder pick
    // 24 Nov 2026): the constraints group — the four
    // polygon layers and brownfield, grouped by answer.
    // Findings first (each its own named row with its tag
    // and distance pill), then anything the data could not
    // check, Article 4 last. The joined compact facts and
    // the separate brownfield row are gone; the FACTS badge
    // is replaced by the per-row tags.
    {
      const keyByLayer: Record<string, PlanningConstraintInput["key"]> = {
        conservation_area: "conservation",
        article_4_area: "article4",
        green_belt: "greenBelt",
        built_up_area: "builtUp",
      };
      const inputs: PlanningConstraintInput[] = [
        constraints.conservationArea,
        constraints.article4,
        constraints.greenBelt,
        constraints.builtUpArea,
      ].map((layer) => ({
        key: keyByLayer[layer.layer] ?? "conservation",
        label: layer.label,
        feature: POLYGON_FEATURE_NAMES[layer.layer] ?? "area",
        state: layer.state,
        fact: polygonFact(layer),
        line: layer.line,
        nearestName: layer.nearest?.name ?? null,
        nearestMiles: layer.nearest ? layer.nearest.miles : null,
        beyond: layer.beyondLine !== null,
        radiusMiles: RADIUS_MILES,
        radiusInLine: false,
      }));
      const brownfield = constraints.brownfield;
      inputs.push({
        key: "brownfield",
        label: "Brownfield land",
        feature: "recorded brownfield site",
        state: brownfield.state,
        fact: brownfield.line,
        line: brownfield.line,
        nearestName: brownfield.nearest?.label ?? null,
        nearestMiles: brownfield.nearest ? brownfield.nearest.miles : null,
        beyond: brownfield.beyondLine !== null,
        radiusMiles: BROWNFIELD_RADIUS_MILES,
        radiusInLine: true,
      });
      const groups = groupPlanningConstraints(inputs);
      blocks.push({ type: "subheading", text: "Planning constraints" });
      if (groups.findingsHead) {
        blocks.push({ type: "subheading", text: groups.findingsHead });
        for (const finding of groups.findings) {
          blocks.push({
            type: "tagged-line",
            lead: finding.label,
            texts: [finding.text],
            tag: finding.tag ?? undefined,
            tagTone: finding.tagTone ?? undefined,
            miles:
              finding.miles !== null
                ? {
                    text: `${formatMiles(finding.miles)} mi`,
                    band: distanceBand("concern", finding.miles),
                  }
                : undefined,
          });
        }
      }
      if (groups.uncheckable.length > 0) {
        blocks.push({ type: "subheading", text: "Could not be checked" });
        for (const entry of groups.uncheckable) {
          blocks.push({
            type: "tagged-line",
            lead: entry.label,
            texts: [entry.text],
            tag: entry.tag ?? undefined,
            tagTone: entry.tagTone ?? undefined,
          });
        }
      }
    }
    {
      const nature = sections.nature;
      // HCR-18 / HCR-10 (BUG-156): the three fact lines
      // take bullets as one list — designations (kinds
      // named, in the designations line the brain
      // serves), woodland, habitat — with any
      // beyond-nearest facts following as further
      // bullets; the fineprint stands after the list,
      // line-free.
      const bullets: string[] = [];
      const placesText = nature.designationsLine
        ? `${nature.placesLine} — ${nature.designationsLine}`
        : nature.placesLine;
      bullets.push(placesText);
      const nearestPlace = nature.nearestPlace;
      if (nature.beyondLine && nearestPlace && nearestPlace.name)
        bullets.push(
          beyondNearestLine("designated nature site", nearestPlace.name, nearestPlace.miles),
        );
      else if (nature.beyondLine) bullets.push(nature.beyondLine);
      const woodlandFact = polygonFact(nature.ancientWoodland);
      bullets.push(
        woodlandFact
          ? `Ancient woodland: ${woodlandFact.charAt(0).toLowerCase()}${woodlandFact.slice(1)}`
          : nature.ancientWoodland.line,
      );
      const woodlandNearest = nature.ancientWoodland.nearest;
      if (
        nature.ancientWoodland.beyondLine &&
        woodlandNearest &&
        woodlandNearest.name &&
        nature.ancientWoodland.state !== "inside"
      )
        bullets.push(
          beyondNearestLine("ancient woodland", woodlandNearest.name, woodlandNearest.miles),
        );
      bullets.push(nature.priorityHabitat.line);
      blocks.push({
        type: "tagged-line",
        lead: "Nature designations",
        texts: [],
        bullets,
        fineprint: nature.coverageLine ?? "In the datasets checked.",
        tag: "FACTS",
        tagTone: "grey",
      });
    }
    {
      const heritage = sections.heritage;
      const texts: string[] = [heritage.listed.line];
      const listedNearest = heritage.listed.nearest;
      // HCR-06 (BUG-153): the nearest is named in BOTH
      // states — the within list's first entry where any
      // stand within 2 miles (the bundle already files
      // it; the pre-fix composition gated the name on
      // the none-within beyond line, so the common state
      // named none).
      if (listedNearest && listedNearest.name)
        texts.push(
          `The nearest listed building is ${titleCaseName(listedNearest.name)} (Grade ${listedNearest.grade}), ${formatMiles(listedNearest.miles)} miles away.`,
        );
      else if (heritage.listed.beyondLine) texts.push(heritage.listed.beyondLine);
      if (heritage.atPoint.state === "recorded") texts.push(heritage.atPoint.line);
      else if (heritage.atPoint.state === "needs-exact-home") texts.push(heritage.atPoint.reason);
      // HCR-18: two or more fact lines bullet as one
      // list; a single line stands as the row's text.
      blocks.push(
        texts.length >= 2
          ? {
              type: "tagged-line",
              lead: "Listed building & heritage",
              texts: [],
              bullets: texts,
              tag: "FACTS",
              tagTone: "grey",
            }
          : {
              type: "tagged-line",
              lead: "Listed building & heritage",
              texts,
              tag: "FACTS",
              tagTone: "grey",
            },
      );
    }
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
      // The Master's applications row carries no badge.
      blocks.push({
        type: "tagged-line",
        lead: "Planning applications nearby",
        texts: [planning.line],
      });
      if (planning.link)
        // HCR-09 (BUG-153): this page's link label is the
        // sample's — "Check planning applications near
        // this home". The override stands HERE, at this
        // composition only: the shared bundle label
        // (lib/area-bundle.ts) is the report's too, and
        // the report keeps its own.
        blocks.push({
          type: "link",
          label: "Check planning applications near this home",
          url: planning.link.url,
        });
    }
    if (areaSections?.companyOwnership) {
      const ownership = areaSections.companyOwnership as {
        state?: string;
        line?: string | null;
      };
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
        blocks.push({
          type: "tagged-line",
          lead: "Company ownership",
          texts: ["Owned by a company: Yes."],
        });
      else if (ownership.state === "not-company-owned")
        blocks.push({
          type: "tagged-line",
          lead: "Company ownership",
          texts: ["Owned by a company: No."],
        });
      else if (ownership.line)
        blocks.push({ type: "tagged-line", lead: "Company ownership", texts: [ownership.line] });
    }
    homeSections.push(
      linesSection("planning-protection", "Planning, protection & ownership", blocks, sourceLine),
    );
  }

  // --- What's Nearby --------------------------------------
  const nearbySections: ResultsSectionView[] = [];
  {
    const blocks: SectionBlock[] = [];
    // The GP group's own count row is cleared by the
    // section's strip declaration (OBS-012): the
    // section's one plain truncRow below speaks for the
    // health groups together, as the Master's Health
    // section carries the one row.
    blocks.push(...group("gp", FAMILY_CATEGORIES).blocks);
    blocks.push(...group("dentist", FAMILY_CATEGORIES).blocks);
    blocks.push(...group("pharmacy", FAMILY_CATEGORIES).blocks);
    blocks.push({ type: "upsell", lead: "Plus more GPs & dentists", detail: null });
    nearbySections.push(linesSection("health", "Health", blocks));
  }
  {
    const blocks: SectionBlock[] = [];
    // BUG-213 ruling (founder, 24 Nov 2026): the maternity
    // group never renders as visible rows on the free
    // page — it sits behind the section's strip in every
    // case, as the Master's Hospitals section shows the
    // A&E row only with "Plus maternity, community
    // hospital & more hospitals" below it. This retires
    // item 28's dedup (the maternity group was suppressed
    // only when its lead place WAS the A&E lead place, so
    // a different nearest maternity unit served as a
    // second visible row). The A&E group leads (it is the
    // section's headline fact). The A&E group's count row
    // is likewise cleared by the section's strip
    // declaration (OBS-012) — the section's merged
    // truncRow below is its one upsell. Where the nation
    // gates A&E (Wales, Scotland, NI) the strip is
    // skipped as before and the section carries the
    // A&E not-covered line alone.
    blocks.push(...group("ae", FAMILY_CATEGORIES).blocks);
    if (!gated.has("ae"))
      blocks.push({
        type: "upsell",
        lead: "Plus maternity, community hospital & more hospitals",
        // BUG-152 ruling: "Every one near this home" was
        // one of the three false wordings — the report
        // serves the NEAREST entries; the detail says so.
        detail:
          "The nearest maternity unit with its own rating, and the next-nearest A&E as a fallback.",
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
    // The two groups' own count rows are cleared by the
    // section's strip declaration (OBS-012) — the
    // section's one plain truncRow below speaks for the
    // combined lists, as the Master's does. BUG-152
    // ruling: "the full … lists" was a false wording —
    // the report serves the nearest entries with
    // distances; the lead drops "full".
    blocks.push(...group("places-of-worship", NEARBY_CATEGORIES).blocks);
    blocks.push(...group("libraries", NEARBY_CATEGORIES).blocks);
    blocks.push({
      type: "upsell",
      lead: "Plus the Food & drink, Leisure, Places to visit, worship & library lists",
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

  // The two closing passes (OBS-012 + HCR-08/NB-08):
  // strip declarations first (they only remove blocks'
  // truncations), then the sentence pass over what
  // stands.
  for (const tab of tabs) {
    declareSectionStrips(tab);
    sentencePass(tab);
  }

  return {
    pills: effectiveNearby
      ? summaryPills({ nearby: effectiveNearby, flood, crime, sections, area })
      : null,
    reportHref,
    // The buy bar is a HOME-scope surface (fix batch,
    // 19 Nov 2026 — BUG-004): the Master draws it only on
    // the one-home results page — there is no
    // postcode-scope buy bar at all — and its copy speaks
    // of "this home" throughout (the report for this
    // home, save this home, the mystery extra in the
    // report). At rung 2 the page is about a whole
    // postcode, not one home, so the bar does not serve:
    // the postcode page's real actions are picking a home
    // from its list and shortlisting the postcode beside
    // the scope heading. Serving the rung-1 bar verbatim
    // at rung 2 invited a purchase for a home the visitor
    // had not picked.
    buyBar:
      resolution.rung === 1
        ? {
            heading: BUY_BAR_HEADING,
            line: BUY_BAR_LINE,
            mysteryLine: BUY_BAR_MYSTERY_LINE,
            href: reportHref,
          }
        : null,
    calculators: {
      lastSalePrice:
        sections.soldPrices.state === "served"
          ? (sections.soldPrices.ownLastSale?.price ?? null)
          : null,
      nation,
    },
    checkLinks: checkLinksForTabs(tabs),
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
  { key: "nurseries", heading: "Nurseries", shortKey: "nearby" },
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
  const tabs: ResultsTabView[] = [
    { id: "family", label: "Family Checks", sections: family },
    { id: "neighbourhood", label: "The Neighbourhood", sections: neighbourhood },
    { id: "home", label: "Home, Costs & Risks", sections: home },
    { id: "nearby", label: "What's Nearby", sections: nearbyTab },
  ];
  return {
    pills: null,
    reportHref: null,
    buyBar: null,
    // G2 (M7.10): no calculators on the wider-area view —
    // there is no home here for them to be about.
    calculators: null,
    // The wider-area view carries the "About these checks"
    // expander too (M7.12): its sections map the same way.
    checkLinks: checkLinksForTabs(tabs),
    warningsStrip: { kind: "none" },
    floodWarningsState: null,
    tabs,
  };
}

// ------------------------------------------------------------------
// The district view (founder ruling, 18 Nov 2026)
//
// The wider-area page renders through THIS layout system —
// the same shell, heading block, section presentation and
// four D76 tabs as the results page — with the district
// sections distributed across the tabs in the groupings the
// results page uses for the corresponding checks:
//
//   Family Checks:        Schools
//   The Neighbourhood:    The district itself · The
//                         neighbourhood in numbers · Crime ·
//                         Deprivation · Air quality
//   Home, Costs & Risks:  Sold prices · Council tax ·
//                         Connectivity · Flood
//   What's Nearby:        Everyday counts
//
// NO UPSELL anywhere at rung 3: no buy bar, no report link,
// no truncation lines, no summary pills. The only forward
// path is the bridge into a full-postcode check, rendered
// after the tabs. Every figure carries its district grain
// in its own line; section source lines ride in the view
// model as they do on the results page.
// ------------------------------------------------------------------

function districtCount(value: number): string {
  return value.toLocaleString("en-GB");
}

// BUG-258 (24 Nov 2026): the "Counts in …" tiles' labels,
// singular at a count of 1 — "1 Rail station", never
// "1 Rail stations". The same family as BUG-254's "Plus 1
// more" strips. Exported for the pin test; the view calls
// it with the section's own counts.
export function everydayTiles(everyday: {
  gp: number;
  dentists: number;
  pharmacies: number;
  stations: string[];
}): { label: string; value: string }[] {
  return [
    {
      label: everyday.gp === 1 ? "GP surgery" : "GP surgeries",
      value: districtCount(everyday.gp),
    },
    {
      label: everyday.dentists === 1 ? "Dentist" : "Dentists",
      value: districtCount(everyday.dentists),
    },
    {
      label: everyday.pharmacies === 1 ? "Pharmacy" : "Pharmacies",
      value: districtCount(everyday.pharmacies),
    },
    {
      label: everyday.stations.length === 1 ? "Rail station" : "Rail stations",
      value: districtCount(everyday.stations.length),
    },
  ];
}

function districtJoinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function districtAgeText(value: number): string {
  const whole = Math.floor(value);
  return value - whole === 0.5 ? `${whole}½` : `${Math.round(value)}`;
}

function districtShortGroup(label: string): string {
  return label
    .replace(/^Asian, Asian British or Asian Welsh$/, "Asian")
    .replace(/^Black, Black British, Black Welsh, Caribbean or African$/, "Black")
    .replace(/^Mixed or Multiple ethnic groups$/, "Mixed or multiple groups");
}

function districtPence(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function districtAirValue(value: number): string {
  return `${Number(value.toFixed(2))}`;
}

function districtCensusSection(bundle: DistrictServed): ResultsSectionView {
  const census = bundle.sections.census;
  const outward = bundle.outward;
  if (census.state !== "served") {
    return linesSection(
      "census",
      "The neighbourhood in numbers",
      [
        {
          type: "line",
          text: census.line ?? "Census 2021 figures are not filed for this district's areas yet.",
        },
      ],
      null,
    );
  }
  // Sample 28's row form (WA-03, as corrected): each
  // census headline is a row — bold lead, the facts as
  // its small detail — never a bullet. The words are
  // unchanged, only split at the lead.
  const rows: SectionBlock[] = [];
  const blocks: SectionBlock[] = [];
  if (census.ageYears) {
    let under18 = 0;
    let workingAge = 0;
    let over65 = 0;
    let ageTotal = 0;
    census.ageYears.forEach((count, age) => {
      ageTotal += count;
      if (age < 18) under18 += count;
      else if (age < 65) workingAge += count;
      else over65 += count;
    });
    if (ageTotal > 0) {
      const share = (n: number) => Math.round((n / ageTotal) * 100);
      rows.push({
        type: "row",
        lead: "Age mix",
        detail:
          `Under 18: ${share(under18)}% · 18–64: ${share(workingAge)}% · ` +
          `65 and over: ${share(over65)}%.` +
          (census.medianAge != null
            ? ` The typical (median) age is ${districtAgeText(census.medianAge.value)}.`
            : ""),
      });
    }
  }
  // Coverage (fix batch, 19 Nov 2026 — BUG-016): the
  // census roll-up sums the FILED Census areas only.
  // While filing is partial the section names its
  // coverage — the filed count of the district's true
  // Census-area count (the head's) — so a part-filed
  // sum never reads as the whole district beside the
  // header's whole-district residents tile.
  const censusPartial = census.msoaCount < bundle.head.msoaCount;
  if (
    census.householdsTotal != null &&
    census.residentsTotal != null &&
    census.householdsTotal > 0
  ) {
    rows.push({
      type: "row",
      lead: "Households",
      detail:
        `${districtCount(census.householdsTotal)} households and ` +
        `${districtCount(census.residentsTotal)} residents across ` +
        (censusPartial
          ? `the ${districtCount(census.msoaCount)} of the district's ` +
            `${districtCount(bundle.head.msoaCount)} Census areas filed so far`
          : `the district's Census areas`) +
        ` — ${(census.residentsTotal / census.householdsTotal).toFixed(1)} ` +
        `people per household on average.`,
    });
  }
  const tableByCode = (code: string) => census.tables.find((table) => table.code === code);
  const tenureTable = tableByCode("ts054");
  const tenureRow = (label: string) =>
    tenureTable?.rows.find((row) => row.label === label) ??
    tenureTable?.groups?.find((row) => row.label === label);
  const owned = tenureRow("Owned");
  const outright = tenureRow("Owned: Owns outright");
  const mortgage = tenureRow("Owned: Owns with a mortgage or loan");
  const privateRented = tenureRow("Private rented");
  const socialPct = census.socialRented?.pct ?? tenureRow("Social rented")?.pct;
  if (owned && outright && mortgage && socialPct != null && privateRented) {
    rows.push({
      type: "row",
      lead: "Owning and renting",
      detail:
        `${Math.round(owned.pct / 10)} in 10 households across ` +
        `${outward} own their home: ${Math.round(outright.pct)}% outright and ` +
        `${Math.round(mortgage.pct)}% with a mortgage. ${Math.round(socialPct)}% rent ` +
        `from a social landlord, ${Math.round(privateRented.pct)}% rent privately.`,
    });
  }
  const ethnicGroups = tableByCode("ts021")?.groups ?? [];
  const white = ethnicGroups.find((group) => group.label === "White");
  const otherGroups = ethnicGroups
    .filter((group) => group.label !== "White")
    .sort((a, b) => b.pct - a.pct);
  if (white && otherGroups.length >= 2) {
    rows.push({
      type: "row",
      lead: "The people here",
      detail:
        `${Math.round(white.pct)} in 100 residents are White; the ` +
        `next largest groups are ${districtShortGroup(otherGroups[0].label)} ` +
        `(${Math.round(otherGroups[0].pct)} in 100) and ` +
        `${districtShortGroup(otherGroups[1].label)} (${Math.round(otherGroups[1].pct)} in 100).`,
    });
  }
  // The Religion headline in the sample's form (founder
  // fix batch, 19 Nov 2026 — audit item 7): the two
  // largest groups named, the remaining named religions
  // combined into one share, and the not-answered share
  // last under the sample's "Not stated" name — never
  // the first four rows as filed. The filed not-answered
  // label is the census loader's own ("Not answered",
  // RELIGION_CATEGORIES in loaders/load-census.mjs).
  const religionTable = tableByCode("ts030");
  if (religionTable && religionTable.rows.length > 0) {
    const notStated = religionTable.rows.find((row) => row.label === "Not answered");
    const named = religionTable.rows
      .filter((row) => row.label !== "Not answered")
      .sort((a, b) => b.count - a.count);
    const parts: string[] = [];
    for (const row of named.slice(0, 2)) {
      parts.push(`${row.label}: ${Math.round(row.pct)}%`);
    }
    const rest = named.slice(2).filter((row) => row.count > 0);
    if (rest.length > 0) {
      const combined = rest.reduce((sum, row) => sum + row.pct, 0);
      parts.push(`Other religions combined: ${Math.round(combined)}%`);
    }
    if (notStated) parts.push(`Not stated: ${Math.round(notStated.pct)}%`);
    if (parts.length > 0) {
      rows.push({ type: "row", lead: "Religion", detail: `${parts.join(" · ")}.` });
    }
  }
  blocks.push(...rows);
  // The homes-themselves headline (the ts044 summary) is
  // retired (audit item 7): the sample carries Family
  // make-up in its place — one-person households,
  // couples, lone parents — and no household-composition
  // table is filed anywhere (the census loader files
  // ts007a, ts007, ts021, ts030, ts044, ts052, ts054
  // only), so the replacement line cannot be composed
  // from filed data and is NOT invented. The headline
  // simply goes; ts044 stays in the bundle's depth
  // tables. Recorded in docs/frontend-design-pass.md as
  // blocked on a household-composition filing.
  // The coverage line wears the small-print dress after
  // the facts it describes (BUG-160, as NB-01 on the home
  // tabs).
  blocks.push({
    type: "small-line",
    text: censusPartial
      ? `Census 2021 figures summed across the ${districtCount(census.msoaCount)} of the ` +
        `district's ${districtCount(bundle.head.msoaCount)} Census areas filed so far. ` +
        `Facts as published, in the Census's own words — no scores.`
      : `Census 2021 figures summed across the ${census.msoaCount} Census areas this ` +
        `district's postcodes fall in. Facts as published, in the Census's own words — no scores.`,
  });
  return linesSection("census", "The neighbourhood in numbers", blocks, census.sourceLine);
}

function districtCrimeSection(bundle: DistrictServed): ResultsSectionView {
  const crime = bundle.sections.crime;
  const outward = bundle.outward;
  if (crime.state !== "served" || crime.total == null || crime.per1000 == null) {
    return linesSection(
      "crime",
      "Crime",
      [
        {
          type: "line",
          text: crime.line ?? "Crime is not filed for this district yet.",
        },
      ],
      null,
    );
  }
  // Sample 28's tile contents (WA-07): the counts, the
  // two rates, and the window itself as a tile — the
  // window's span in the sample's short-month form.
  const tiles: { label: string; value: string }[] = [
    { label: "recorded crimes in 12 months", value: districtCount(crime.total) },
    { label: `per 1,000 residents — ${outward}`, value: crime.per1000.toFixed(1) },
  ];
  if (crime.england) {
    tiles.push({ label: "per 1,000 — England", value: crime.england.englandPer1000.toFixed(1) });
  }
  if (crime.windowLine) {
    const span = crime.windowLine
      .split(" to ")
      .map((part) => {
        const [month, year] = part.split(" ");
        return month && year ? `${month.slice(0, 3)} ${year}` : part;
      })
      .join(" – ");
    tiles.push({ label: span, value: "12 mo" });
  }
  const blocks: SectionBlock[] = [{ type: "tiles", tiles }];
  if (crime.england) {
    // WA-08: the comparison panel — heading, label over
    // track, England in brass, the calibration note
    // inside the panel.
    const max = Math.max(crime.per1000, crime.england.englandPer1000);
    blocks.push({
      type: "bar-compare",
      heading: "Rate per 1,000 residents",
      rows: [
        {
          label: outward,
          text: `${outward} — ${crime.per1000.toFixed(1)}`,
          pctOfMax: max > 0 ? (crime.per1000 / max) * 100 : 0,
        },
        {
          label: "England",
          text: `England — ${crime.england.englandPer1000.toFixed(1)}`,
          pctOfMax: max > 0 ? (crime.england.englandPer1000 / max) * 100 : 0,
          england: true,
        },
      ],
      note: crime.england.line,
    });
  }
  // WA-15: the categories as rows, the tail folded into
  // "All other categories" as Sample 28 draws them.
  const named = crime.categories.slice(0, 5);
  for (const category of named) {
    blocks.push({ type: "row", lead: category.label, value: districtCount(category.count) });
  }
  if (crime.categories.length > named.length) {
    const rest = crime.categories.slice(named.length);
    blocks.push({
      type: "row",
      lead: "All other categories",
      value: districtCount(rest.reduce((sum, category) => sum + category.count, 0)),
    });
  }
  return linesSection("crime", "Crime", blocks, crime.sourceLine);
}

// WA-05/WA-06: one flood layer's card — serif title,
// the share sub-line, the stackbar, its legend (the
// shares live in the legend now, keeping the product's
// honest "No band published" segment), the band
// definitions as small print inside the card.
function districtFloodCard(
  block: DistrictFloodBlock,
  outward: string,
): Extract<SectionBlock, { type: "flood-grid" }>["cards"][number] {
  const tones: Record<string, "high" | "medium" | "low" | "very-low" | "none"> = {
    High: "high",
    Medium: "medium",
    Low: "low",
    "Very low": "very-low",
    "No band published": "none",
  };
  const definitions = block.buckets.filter((bucket) => bucket.definition != null);
  return {
    title: block.title,
    sub: `Share of ${outward} postcodes in a mapped flood band`,
    segments: block.buckets.map((bucket) => ({
      label: bucket.label,
      pct: bucket.pct,
      tone: tones[bucket.label] ?? "none",
    })),
    definitions:
      definitions.length > 0
        ? definitions.map((bucket) => `${bucket.label}: ${bucket.definition}`).join(". ") + "."
        : null,
    narrative: null,
  };
}

function districtFloodSection(bundle: DistrictServed): ResultsSectionView {
  const flood = bundle.sections.flood;
  const outward = bundle.outward;
  if (flood.state !== "served") {
    return linesSection(
      "flood",
      "Flood",
      [{ type: "line", text: flood.line ?? "Flood answers are not filed for this district yet." }],
      null,
    );
  }
  const blocks: SectionBlock[] = [];
  if (flood.warnings.state === "unavailable") {
    // WA-12: the strip form is for the served states;
    // the unavailable state keeps its notice (the
    // audit leaves its form open).
    blocks.push({ type: "notice", variant: "gap", text: flood.warnings.line });
  } else {
    blocks.push({
      type: "warn-strip",
      line: flood.warnings.line,
      areas: flood.warnings.areas.map((area) => `${area.severity} — ${area.description}`),
    });
  }
  // WA-05: the two layers as cards in one grid. The
  // rivers & sea card carries the sample's per-card
  // narrative, filled from the only corridor names the
  // filed data holds: the watercourses of the filed
  // flood defences within the standard 2-mile serving
  // radius. The surface water card carries none — no
  // filed data names where surface water pools in a
  // district.
  const cards: Extract<SectionBlock, { type: "flood-grid" }>["cards"] = [];
  if (flood.riversSea) {
    const card = districtFloodCard(flood.riversSea, outward);
    if (flood.watercourses.length > 0) {
      card.narrative = {
        lead: `Where it touches ${outward}:`,
        text: `flood defences are recorded along the ${districtJoinNames(flood.watercourses)} within 2 miles of the district's postcodes.`,
      };
    }
    cards.push(card);
  }
  if (flood.surfaceWater) cards.push(districtFloodCard(flood.surfaceWater, outward));
  if (cards.length > 0) blocks.push({ type: "flood-grid", cards });
  if (!flood.riversSea && flood.riversSeaNotCoveredLine) {
    // The layer is filed but does not cover this district
    // (audit item 14): its own not-filed line stands in
    // its card's place — never a computed share.
    blocks.push({ type: "line", text: flood.riversSeaNotCoveredLine });
  }
  if (!flood.surfaceWater && flood.surfaceWaterNotCoveredLine) {
    blocks.push({ type: "line", text: flood.surfaceWaterNotCoveredLine });
  }
  if (flood.zones) {
    blocks.push({
      type: "line",
      text:
        `Planning flood zones (drawn as if defences were not there): ` +
        `${flood.zones.zone3Pct}% of counted postcodes fall in Flood Zone 3 ` +
        `and ${flood.zones.zone2Pct}% in Flood Zone 2.`,
    });
  }
  blocks.push({
    type: "small-line",
    text: `Counted over the ${districtCount(flood.countedPostcodes)} English postcodes filed in the district — each postcode's point read against the Environment Agency's published maps.`,
  });
  // The sample's method box (audit item 10), in the
  // product's own honest terms: the product counts
  // postcode points (the sample's dummy text counts
  // homes), and the no-single-verdict reasoning is the
  // product's standing rule, not sample colour. WA-14:
  // the box's lead stands bold, split at its colon.
  blocks.push({
    type: "infobox",
    lead: "How the roll-up is built:",
    text:
      `a one-home check looks up that home's own point. ` +
      `The district roll-up reads every postcode point filed in ${outward} against both ` +
      `Environment Agency flood maps, counts each postcode once per map, and publishes ` +
      `the shares above. Same source maps, one extra counting step — and no single ` +
      `district flood verdict, because the split share informs where a single figure ` +
      `would mislead.`,
  });
  // WA-14: the honesty line in the sample's bandbox,
  // under the sample's standing lead.
  blocks.push({ type: "bandbox", lead: "The standing honesty line:", text: flood.honestyLine });
  return linesSection("flood", "Flood", blocks, null);
}

// Council tax and Connectivity are their own sections
// again (founder fix batch, 19 Nov 2026 — audit item 8):
// the sample never merged them into a Costs section, and
// the merged form was a build departure. Each section
// carries its own heading now, so the in-section
// subheadings the merged form needed go with it.
function districtCouncilTaxSection(bundle: DistrictServed): ResultsSectionView {
  const tax = bundle.sections.councilTax;
  const blocks: SectionBlock[] = [];
  if (tax.councils.length === 0 && tax.unfiledCouncils.length === 0) {
    blocks.push({
      type: "line",
      text: "Council tax is not filed for this district's councils yet.",
    });
  }
  // WA-03: Sample 28's row form — the council as the
  // bold lead, its Band D line as the small detail.
  for (const council of tax.councils) {
    blocks.push({
      type: "row",
      lead: council.authorityName,
      detail: `Band D ${districtPence(council.bandDAreaAveragePence)} a year — the council's average Band D for ${council.taxYear}${council.parishAveraged ? ", parish precepts averaged in" : ""}.`,
    });
  }
  for (const name of tax.unfiledCouncils) {
    blocks.push({
      type: "line",
      text: `${name} — its council tax charges are not filed yet.`,
    });
  }
  return linesSection("council-tax", "Council tax", blocks, null);
}

function districtConnectivitySection(bundle: DistrictServed): ResultsSectionView {
  const connectivity = bundle.sections.connectivity;
  const outward = bundle.outward;
  const blocks: SectionBlock[] = [];
  // WA-03: Sample 28's rows — the measure as the bold
  // lead, its share as the small detail; the averaging
  // basis as small print after the rows.
  if (connectivity.state !== "served" || connectivity.broadband == null) {
    blocks.push({
      type: "line",
      text: "Broadband answers are not filed for this district's postcodes yet.",
    });
  } else {
    blocks.push({
      type: "row",
      lead: "Gigabit-capable",
      detail: `${connectivity.broadband.gigabitMeanPct}% of premises on average`,
    });
    blocks.push({
      type: "row",
      lead: "Superfast (30 Mbps or more)",
      detail: `${connectivity.broadband.superfastMeanPct}% of premises on average`,
    });
    blocks.push({
      type: "small-line",
      text: `Each figure is the average of each postcode's own filed share, across the ${districtCount(connectivity.broadband.postcodesCounted)} ${outward} postcodes with a filed answer (${connectivity.broadband.snapshot}).`,
    });
  }
  if (connectivity.state !== "served" || connectivity.mobile == null) {
    blocks.push({
      type: "line",
      text: "Mobile coverage is not filed for this district's postcodes yet.",
    });
  } else {
    for (const area of connectivity.mobile.areas) {
      blocks.push({
        type: "row",
        lead: area.lauaName,
        detail:
          area.fourGOutdoorAtLeastOnePct != null
            ? `4G outdoors from at least one network covers ${area.fourGOutdoorAtLeastOnePct}% of the area`
            : "Ofcom does not publish a 4G outdoor figure for this area",
      });
    }
  }
  return linesSection("connectivity", "Connectivity", blocks, connectivity.sourceLine);
}

export function buildDistrictResultsView(bundle: DistrictServed): ResultsView {
  const { outward, head, sections } = bundle;

  const districtTiles: { label: string; value: string }[] = [];
  if (sections.district.homes != null) {
    districtTiles.push({
      label: "homes (addresses)",
      value: districtCount(sections.district.homes),
    });
  }
  if (sections.district.residents != null) {
    districtTiles.push({
      label: "residents",
      value: districtCount(sections.district.residents),
    });
  }
  districtTiles.push({ label: "live postcodes", value: districtCount(head.postcodeCount) });
  districtTiles.push({ label: "small areas (LSOAs)", value: districtCount(head.lsoaCount) });
  const districtBlocks: SectionBlock[] = [];
  if (sections.district.settlements.length > 0) {
    // The settlements as the sample's clean pills
    // (founder fix batch, audit item 9) — the set is
    // already cleaned at the derivation in the brain.
    // The sample shows its settlements whole; the pill
    // set caps at twelve with a count line for the rest,
    // as the joined line used to.
    const shown = sections.district.settlements.slice(0, 12);
    const more = sections.district.settlementsCount - shown.length;
    districtBlocks.push({ type: "pills", items: shown });
    if (more > 0) {
      districtBlocks.push({
        type: "line",
        text: `And ${districtCount(more)} more settlements filed across ${outward}.`,
      });
    }
  }
  if (districtTiles.length > 0) {
    districtBlocks.push({ type: "tiles", tiles: districtTiles });
  }

  const deprivationBlocks: SectionBlock[] =
    sections.deprivation.state === "served"
      ? [
          {
            // Sample 28's order (WA-09): the explainer
            // stands BEFORE the strip, at body size — it
            // limits what the strip claims, so it never
            // shrinks to small print. Coverage (fix batch,
            // 19 Nov 2026 — BUG-016): the spread counts
            // the FILED small areas; while any of the
            // district's small areas (the head's LSOA
            // count) are unfiled, the line names the
            // coverage instead of presenting the filed
            // subset as the district's whole spread.
            type: "line",
            text:
              `England splits every small area into ten bands (deciles) — 1 is among the ` +
              `most deprived in England, 10 among the least. Here is where ` +
              (sections.deprivation.areasCounted < head.lsoaCount
                ? `the ${districtCount(sections.deprivation.areasCounted)} of ${outward}'s ` +
                  `${districtCount(head.lsoaCount)} small areas filed so far`
                : `${outward}'s ${districtCount(sections.deprivation.areasCounted)} small areas`) +
              ` fall. Shown as a spread, never collapsed into one number.`,
          },
          {
            type: "deciles",
            counts: sections.deprivation.counts,
            partial: sections.deprivation.areasCounted < head.lsoaCount,
          },
        ]
      : [
          {
            type: "line",
            text:
              sections.deprivation.line ??
              "Deprivation is not filed for this district's small areas yet.",
          },
        ];

  const soldBlocks: SectionBlock[] = [];
  if (sections.soldPrices.state !== "served") {
    soldBlocks.push({
      type: "line",
      text: "No sales are filed for this district's postcodes yet.",
    });
  } else {
    // WA-07: Sample 28's tiles — the median, the count,
    // and the span as its own tile (the span's length
    // derived from the served from/to dates, its dates
    // as the tile's description).
    const soldTiles: { label: string; value: string; sub?: string | null }[] = [];
    if (sections.soldPrices.median != null) {
      soldTiles.push({
        label: "median sold price",
        value: formatPounds(sections.soldPrices.median),
      });
    }
    soldTiles.push({
      label: "sales counted",
      value: districtCount(sections.soldPrices.count),
    });
    if (sections.soldPrices.fromDate && sections.soldPrices.toDate) {
      const from = new Date(`${sections.soldPrices.fromDate}T00:00:00Z`);
      const to = new Date(`${sections.soldPrices.toDate}T00:00:00Z`);
      const months = Math.max(
        1,
        (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
          (to.getUTCMonth() - from.getUTCMonth()),
      );
      soldTiles.push({
        label: (sections.soldPrices.spanLine ?? "").replace(" to ", " – "),
        value:
          months >= 18
            ? `${Math.round(months / 12)} year${Math.round(months / 12) === 1 ? "" : "s"}`
            : `${months} month${months === 1 ? "" : "s"}`,
      });
    }
    soldBlocks.push({ type: "tiles", tiles: soldTiles });
    if (sections.soldPrices.median == null && sections.soldPrices.count > 0) {
      soldBlocks.push({
        type: "line",
        text: "Too few sales are filed to state a district median — a median is stated from five sales.",
      });
    }
    if (sections.soldPrices.types.length > 0) {
      // Sample 28 draws the types directly under the
      // tiles — no subheading stands over its rows.
      soldBlocks.push({
        type: "table",
        rows: sections.soldPrices.types.map((typeRow) => ({
          label: typeRow.label,
          value: formatPounds(typeRow.median),
          detail: `${districtCount(typeRow.count)} sales`,
        })),
      });
    }
    if (sections.soldPrices.foldedTypeCount > 0) {
      soldBlocks.push({
        type: "line",
        text: `Plus ${districtCount(sections.soldPrices.foldedTypeCount)} sales of other types — fewer than five of each type, so no median is stated for them.`,
      });
    }
    // Coverage (fix batch, 19 Nov 2026 — BUG-016): the
    // roll-up aggregates the postcodes whose sales are
    // filed. While that is fewer than the district's
    // postcodes, the closing line names the coverage —
    // one postcode's figures are never presented as the
    // district's. At full coverage the district-wide
    // form stands.
    if (sections.soldPrices.postcodesCovered < head.postcodeCount) {
      soldBlocks.push({
        // A line that LIMITS a figure keeps body size
        // (wider-area audit item 13) — never small print.
        type: "line",
        text:
          `Sales are filed for ${districtCount(sections.soldPrices.postcodesCovered)} of the ` +
          `district's ${districtCount(head.postcodeCount)} postcodes so far — these figures ` +
          `cover those postcodes only, and they do not value any one home.`,
      });
    } else {
      soldBlocks.push({
        type: "line",
        text: `The district median across ${outward} as a whole — it does not value any one home.`,
      });
    }
  }

  const schoolsBlocks: SectionBlock[] = [];
  if (sections.schools.state !== "served") {
    schoolsBlocks.push({
      type: "line",
      text: "Schools are not filed for this district yet.",
    });
  } else {
    schoolsBlocks.push({
      type: "line",
      text: `${districtCount(sections.schools.counted)} schools are filed inside ${outward}.`,
    });
    // WA-15: the phases as rows — bold label, the count
    // at the right — in Sample 28's form, the grammar
    // count riding as its own row (its "selective, test
    // entry" nature as the row's detail; at zero the
    // sample's "0 in CM3" count form).
    const phases = [
      { label: "Primary", count: sections.schools.primary },
      { label: "Secondary", count: sections.schools.secondary },
      { label: "All-through", count: sections.schools.allThrough },
      { label: "16 plus", count: sections.schools.post16 },
      { label: "Other", count: sections.schools.otherPhase },
    ].filter((phase) => phase.count > 0);
    for (const phase of phases) {
      schoolsBlocks.push({
        type: "row",
        lead: phase.label,
        value: districtCount(phase.count),
      });
    }
    schoolsBlocks.push({
      type: "row",
      lead: "Grammar schools",
      detail: sections.schools.grammar > 0 ? "selective, test entry" : null,
      value:
        sections.schools.grammar > 0 ? districtCount(sections.schools.grammar) : `0 in ${outward}`,
    });
    // WA-15: Ofsted as ONE body line — the grades in the
    // sample's order of words, the not-yet-inspected
    // count folded into the same line.
    if (sections.schools.ofsted.length > 0 || sections.schools.notYetInspected > 0) {
      const parts = sections.schools.ofsted.map(
        (row) => `${row.rating} ${districtCount(row.count)}`,
      );
      if (sections.schools.notYetInspected > 0) {
        parts.push(`Not yet inspected ${districtCount(sections.schools.notYetInspected)}`);
      }
      schoolsBlocks.push({
        type: "line",
        text: `Ofsted (of those inspected): ${parts.join(" · ")}.`,
      });
    }
  }

  const everydayBlocks: SectionBlock[] = [];
  if (sections.everyday.state !== "served") {
    everydayBlocks.push({
      type: "line",
      text: "Everyday counts are not filed for this district yet.",
    });
  } else {
    everydayBlocks.push({
      type: "tiles",
      tiles: everydayTiles(sections.everyday),
    });
    if (sections.everyday.stations.length > 0) {
      everydayBlocks.push({
        type: "line",
        text: `Stations: ${sections.everyday.stations.join(" · ")}.`,
      });
    }
    everydayBlocks.push({
      type: "small-line",
      text: "GPs, dentists and pharmacies are counted by their filed postcodes inside the district; stations are counted by their nearest filed postcode.",
    });
  }

  const airRanges: string[] = [];
  if (sections.air.no2) {
    airRanges.push(
      `NO₂ ${districtAirValue(sections.air.no2.min)}–${districtAirValue(sections.air.no2.max)} µg/m³`,
    );
  }
  if (sections.air.pm25) {
    airRanges.push(
      `PM2.5 ${districtAirValue(sections.air.pm25.min)}–${districtAirValue(sections.air.pm25.max)} µg/m³`,
    );
  }
  if (sections.air.pm10) {
    airRanges.push(
      `PM10 ${districtAirValue(sections.air.pm10.min)}–${districtAirValue(sections.air.pm10.max)} µg/m³`,
    );
  }
  const airBlocks: SectionBlock[] =
    sections.air.state !== "served" || airRanges.length === 0
      ? [
          {
            type: "line",
            text: "Modelled air quality is not filed for this district's postcodes yet.",
          },
        ]
      : [
          // Sample 28's form (WA-03): the ranges as one
          // body-text paragraph — no subheading, no
          // bullets on the district page — and the basis
          // as small print after it.
          {
            type: "line",
            text: `Across ${outward}'s modelled 1 km squares: ${airRanges.join(" · ")}.`,
          },
          {
            type: "small-line",
            text: `The range across the ${districtCount(sections.air.squaresCounted)} modelled 1 km squares the district's postcodes fall in${sections.air.year != null ? `, ${sections.air.year}` : ""}. Modelled — not a measurement at any one home.`,
          },
        ];

  const tabs: ResultsTabView[] = [
    {
      id: "family",
      label: "Family Checks",
      sections: [linesSection("schools", "Schools", schoolsBlocks, sections.schools.sourceLine)],
    },
    {
      id: "neighbourhood",
      label: "The Neighbourhood",
      sections: [
        linesSection(
          "district",
          "The district itself",
          districtBlocks,
          sections.district.sourceLine,
        ),
        districtCensusSection(bundle),
        districtCrimeSection(bundle),
        linesSection(
          "deprivation",
          "Deprivation",
          deprivationBlocks,
          sections.deprivation.sourceLine,
        ),
        linesSection("air", "Air quality", airBlocks, sections.air.sourceLine),
      ],
    },
    {
      id: "home",
      label: "Home, Costs & Risks",
      sections: [
        linesSection("sold-prices", "Sold prices", soldBlocks, sections.soldPrices.sourceLine),
        districtCouncilTaxSection(bundle),
        districtConnectivitySection(bundle),
        districtFloodSection(bundle),
      ],
    },
    {
      id: "nearby",
      label: "What's Nearby",
      sections: [linesSection("everyday", "Everyday counts", everydayBlocks, null)],
    },
  ];

  return {
    pills: null,
    reportHref: null,
    buyBar: null,
    calculators: null,
    // The About-these-checks expander on THIS page names
    // the page's own sections — the sample's eleven
    // (founder fix batch, 19 Nov 2026 — audit item 6),
    // not the generic check-page list the other views
    // derive from their sections. Three of the eleven
    // have no check page of their own (the district
    // itself, the neighbourhood in numbers, deprivation)
    // and link to the How-we-check page, where their
    // methods are documented; the rest link to their
    // check pages. "Counts in …" names the district, as
    // the sample's own link does.
    checkLinks: [
      { label: "The district itself", href: HOW_WE_CHECK_PATH },
      { label: "The neighbourhood in numbers", href: HOW_WE_CHECK_PATH },
      { label: "Crime", href: "/check/crime" },
      { label: "Sold prices", href: "/check/sold-prices" },
      { label: "Deprivation", href: HOW_WE_CHECK_PATH },
      { label: "Council tax", href: "/check/council-tax-band" },
      { label: "Broadband & mobile", href: "/check/broadband" },
      { label: "Schools", href: "/check/schools" },
      { label: `Counts in ${outward}`, href: "/check/family-essentials" },
      { label: "Flood", href: "/check/flood-risk" },
      { label: "Air quality", href: "/check/air-quality" },
    ],
    warningsStrip: { kind: "none" },
    floodWarningsState: sections.flood.state === "served" ? sections.flood.warnings.state : null,
    tabs,
    bridge: {
      heading: `Checking one home in ${outward}?`,
      line: "The district tells you about the area. A full postcode tells you about the home — its flood point, its nearest schools, its street's crime and its sold history.",
      // The sample's named-area links (audit item 5):
      // the district's cleaned settlements, each landing
      // on a filed postcode in that settlement, capped at
      // the sample's four. A settlement no sales row files
      // a postcode for carries no link — the form above
      // still reaches every home in the district.
      links: sections.bridge.settlementPostcodes.slice(0, 4).map((row) => ({
        label: `${row.postcode} · ${row.name}`,
        href: homeRoute(row.postcode),
      })),
      outward,
    },
  };
}
