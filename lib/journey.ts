// Check My Next Home — the checker journey's shared shape
// (plan step M7.3; gap check 16 Nov 2026, founder adopted all
// five rulings and all ten fold-ins).
//
// Everything here is pure: routes, the checking screen's row
// set, the journey's pinned copy, and the derivations that
// turn the frozen brains' bundles into row states. The serve
// layer (lib/server/) and the pages both read from here, so
// the wording and the route family can never fork between
// surfaces. No bundle builder is touched by this file — the
// brains are frozen at their 48 contract pins (M6 closure);
// the journey calls them and renders what they serve.
//
// The route family (fold-in 1): one family, kept out of
// /check/… (M7.8's SEO landing namespace):
//   /search            — with ?postcode= it is the postcode
//                        form (picker / postcode-level
//                        state); with ?outward= it is the
//                        wider-area landing (rung 3). The
//                        BARE route serves nothing of its
//                        own: it redirects to the landing
//                        page carrying the unplaced notice
//                        (the standalone no-location page
//                        was retired by the founder's ruling
//                        of 18 Nov 2026 — an input that can't
//                        be placed returns to the landing
//                        page with a small notice at its
//                        search box, never a page of its
//                        own).
//   /search/home       — the home form: ?postcode= plus the
//                        URL-encoded home key (?home=) renders
//                        checking, then the holding results
//                        page; without ?home= it is the
//                        postcode-level check.
//   /search/failed     — the whole-check failure state
//                        (D44(7)), built once here and reused
//                        by M7.4 on the results route.
// The checking screen has no URL of its own: it renders on
// the home form and is replaced in place by the holding
// results view when every row reaches a terminal state.

import type { AddressResolution } from "./address";
import type { AreaBundle } from "./area-bundle";
import type { CrimeBundle } from "./crime";
import type { FloodBundle, ServedFloodLayer } from "./flood";
import type { CategoryAnswer, NearbyBundle, NearbyCategory } from "./nearby";
import type { SoldPricesBundle } from "./sold-prices";

// ------------------------------------------------------------------
// Nations — the brains' own detector: the first letter of the
// directory's filed area code (E England, W Wales, S Scotland
// data zones, N Northern Ireland super output areas). Outward
// postcode letters are never used (flood's D25 rule: areas
// straddle the Welsh border).
// ------------------------------------------------------------------

export type Nation = "england" | "wales" | "scotland" | "northern-ireland" | "unknown";

export function nationOfLsoa(lsoaCode: string | null): Nation {
  switch ((lsoaCode ?? "").charAt(0)) {
    case "E":
      return "england";
    case "W":
      return "wales";
    case "S":
      return "scotland";
    case "N":
      return "northern-ireland";
    default:
      return "unknown";
  }
}

export function isNotCoveredNation(nation: Nation): boolean {
  return nation === "scotland" || nation === "northern-ireland";
}

export function nationName(nation: Nation): string {
  switch (nation) {
    case "scotland":
      return "Scotland";
    case "northern-ireland":
      return "Northern Ireland";
    case "wales":
      return "Wales";
    case "england":
      return "England";
    default:
      return "This area";
  }
}

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------

export const SEARCH_ROUTE = "/search";
export const HOME_ROUTE = "/search/home";
export const FAILED_ROUTE = "/search/failed";

// The unplaced landing (founder ruling, 18 Nov 2026): an
// input that can't be placed — and any direct hit on the
// bare /search route — returns to the landing page with
// the notice flag in its query; the landing page renders
// the small notice line at its search box from it.
export const UNPLACED_NOTICE_PARAM = "notice";
export const UNPLACED_NOTICE_VALUE = "unplaced";
export const UNPLACED_NOTICE_URL = `/?${UNPLACED_NOTICE_PARAM}=${UNPLACED_NOTICE_VALUE}`;

// The place page (founder ruling, 19 Nov 2026, reversing
// the 18 Nov in-dropdown chooser): an input that exactly
// names a known place is a place pick, wherever it
// arrives — and a place pick NAVIGATES, like a street
// pick, to the place's own page on the search route,
// whose rows are the place's districts in the picker's
// list style (components/PlaceChoice.tsx). The parameter
// carries the DISPLAY form; the page normalises it
// against the place table. A place name is never an
// unplaced input and never a failure.
export const PLACE_CHOICE_PARAM = "place";

export function placeChoiceRoute(placeDisplay: string): string {
  const params = new URLSearchParams({ [PLACE_CHOICE_PARAM]: placeDisplay });
  return `${SEARCH_ROUTE}?${params.toString()}`;
}

export function postcodeRoute(
  postcode: string,
  narrowing?: { street?: string | null; building?: string | null; picked?: string | null },
): string {
  const params = new URLSearchParams({ postcode });
  if (narrowing?.street) params.set("street", narrowing.street);
  if (narrowing?.building) params.set("building", narrowing.building);
  if (narrowing?.picked) params.set("picked", narrowing.picked);
  return `${SEARCH_ROUTE}?${params.toString()}`;
}

export function homeRoute(postcode: string, homeKey?: string | null): string {
  const params = new URLSearchParams({ postcode });
  if (homeKey) params.set("home", homeKey);
  return `${HOME_ROUTE}?${params.toString()}`;
}

// The narrowed home route (M7.15C, 18 Nov 2026): the
// whole-postcode check carrying a street (or building)
// narrowing, so a street pick lands on that street's
// homes — the ladder re-derives the narrowed list from
// the route's own parameters, exactly as the postcode
// form's resolution does.
export function narrowedHomeRoute(
  postcode: string,
  narrowing: { street?: string | null; building?: string | null },
): string {
  const params = new URLSearchParams({ postcode });
  if (narrowing.street) params.set("street", narrowing.street);
  if (narrowing.building) params.set("building", narrowing.building);
  return `${HOME_ROUTE}?${params.toString()}`;
}

// The street choice route (M7.15C, 18 Nov 2026): a
// street that spans postcodes is picked from the
// dropdown as (street, town); this route renders the
// short postcode choice in the picker's list style, and
// each choice opens that street's homes in that
// postcode. The parameters carry the DISPLAY forms; the
// page normalises them against the street table. A
// street pick never lands on a home directly.
export function streetChoiceRoute(street: string, town: string | null): string {
  const params = new URLSearchParams({ street });
  if (town) params.set("town", town);
  return `${SEARCH_ROUTE}?${params.toString()}`;
}

export function widerAreaRoute(outward: string, notFoundPostcode?: string | null): string {
  const params = new URLSearchParams({ outward });
  if (notFoundPostcode) params.set("notfound", notFoundPostcode);
  return `${SEARCH_ROUTE}?${params.toString()}`;
}

// ------------------------------------------------------------------
// The journey plan — where a resolution sends the visitor.
// Decided once, here, from the resolution and what was typed:
// the serve layer's /api/resolve and the unit tests both read
// it, so the routing can never fork.
// ------------------------------------------------------------------

export type JourneyDestination =
  | { kind: "home"; url: string }
  | { kind: "postcode-results"; url: string }
  | { kind: "not-covered"; url: string }
  | { kind: "wider-area"; url: string }
  | { kind: "no-location"; url: string }
  // A bare input that exactly names a known place
  // (founder fix batch): the serve layer substitutes
  // this destination for the rung-4 no-location one when
  // the place check succeeds — journeyDestination itself
  // stays resolution-driven and never returns it.
  | { kind: "place"; url: string };

export function journeyDestination(
  resolution: AddressResolution,
  typed: { postcode: string | null },
  homeKey: string | null,
): JourneyDestination {
  switch (resolution.rung) {
    case 4:
      // No usable location — including a bare street or place
      // name (ruling 2: the narrowed search scope lands it
      // here). Since the founder's ruling of 18 Nov 2026 the
      // destination is the landing page with the unplaced
      // notice at its search box — the standalone
      // no-location page is retired. The kind keeps its name:
      // it names the resolution state, not a page.
      return { kind: "no-location", url: UNPLACED_NOTICE_URL };
    case 3:
      // A partial postcode is a wider area, never an error.
      // A full postcode the directory does not hold degrades
      // here too, carrying the typed postcode so the landing
      // can name it as not found (fold-in 2).
      return {
        kind: "wider-area",
        url: widerAreaRoute(resolution.outward, typed.postcode),
      };
    case 2: {
      const postcode = resolution.directory.postcode;
      if (isNotCoveredNation(nationOfLsoa(resolution.directory.lsoaCode))) {
        // Ruling 4: Scotland / NI skip the picker — straight
        // to the not-covered results page.
        return { kind: "not-covered", url: homeRoute(postcode) };
      }
      // Founder ruling, 18 Nov 2026 (parity fix batch): the
      // picker page is REMOVED. A full postcode with no home
      // picked goes straight to the whole-postcode check,
      // which now carries the postcode's full home list
      // itself (the picker's list, moved). The old picker
      // route redirects to the same destination (see
      // app/search/page.tsx).
      return { kind: "postcode-results", url: homeRoute(postcode) };
    }
    case 1: {
      const postcode = resolution.directory.postcode;
      if (isNotCoveredNation(nationOfLsoa(resolution.directory.lsoaCode))) {
        return { kind: "not-covered", url: homeRoute(postcode, homeKey) };
      }
      return { kind: "home", url: homeRoute(postcode, homeKey) };
    }
  }
}

// ------------------------------------------------------------------
// Pinned copy — the journey's own words, in one place. Every
// string here is asserted verbatim by tests/journey.test.ts
// or the step's E2E specs; pages and components render these
// constants and never retype them.
// ------------------------------------------------------------------

// The checking screen — the founder-chosen design (ruling
// 19 Nov 2026): Sample 7, "The Recommendation, Combined",
// drawn as Final Sample Master view 2. A rotating headline
// sentence names the group in flight; the evidence feed's
// five rows each complete with a FINDING line derived from
// the real served data (never a bare "Done"); a
// five-segment seal stamps CHECKED when the last group
// lands, as the final beat before the reveal. The
// mechanics are D73's, unchanged: the advance still waits
// for the three /api/check part calls to settle, group
// completion is driven by those settlements (the pacing
// below is smoothing over them, never a substitute), and
// the reveal behaviour is untouched. A group whose part
// serves a not-filed, not-covered or failure state
// completes with that honest named state instead of a
// finding. This supersedes the D73 visual form (fold-in
// build, 17 Nov 2026: a pure graphic on its own clock with
// no completion states). The per-group derivation lives at
// the foot of this file (the checking-group derivation).
export const CHECKING_HEADING_HOME = "Your check is under way";
export const CHECKING_HEADING_POSTCODE = "Your check is under way";
export const CHECKING_HEADING = "Your check is under way";
export const CHECKING_INTRO = "We present the facts — the decision is yours.";

// The live line above the seal: the starting sentence, the
// per-group rotating sentences (on CHECKING_ROWS below),
// the ready sentence the line settles on, the closing line
// under the feed once every group has landed, and the
// live-region announcement of the final beat.
export const CHECKING_START_LINE = "Starting your check…";
export const CHECKING_READY_TICKER = "Your check is ready — five areas, every figure sourced.";
export const CHECKING_FINAL_LINE =
  "Your check is ready — five areas, every figure sourced, seal stamped.";
export const CHECKING_READY_ANNOUNCEMENT = "Your check is ready. Five of five checks complete.";
export const CHECKING_SEAL_CAPTION = "Five checks · one seal";

// The step line under the progress bar: the running word
// while groups land, the completed sentence, and the word
// a row carries while it waits for its turn.
export const CHECKING_STEP_RUNNING = "Checking…";
export const CHECKING_STEP_DONE = "All five areas checked";
export const CHECKING_WAITING_LINE = "Waiting";

// The five groups, in feed order. Each carries the source
// line the row always shows, the doing line it carries
// while it is the group in flight, and the ticker sentence
// the live line rotates to while it is in flight.
export const CHECKING_ROWS = [
  {
    key: "schools",
    label: "Schools & nurseries",
    source: "Ofsted",
    doing: "Checking Ofsted ratings near this home…",
    ticker: "Now checking schools & nurseries near this home…",
  },
  {
    key: "health",
    label: "Health & the everyday",
    source: "NHS & local data",
    doing: "Finding GP, dentist, pharmacy, shops and stations…",
    ticker: "Now finding the GP, dentist, pharmacy and station…",
  },
  {
    key: "safety",
    label: "Safety & surroundings",
    source: "Police.uk · Environment Agency",
    doing: "Counting recorded crime and checking flood maps…",
    ticker: "Now checking crime, flood maps and air quality…",
  },
  {
    key: "costs",
    label: "Costs & connections",
    source: "Council & providers",
    doing: "Looking up council tax, energy, broadband and mobile…",
    ticker: "Now looking up council tax, broadband and mobile…",
  },
  {
    key: "history",
    label: "Past sales & prices",
    source: "HM Land Registry",
    doing: "Pulling recorded sale prices for this postcode…",
    ticker: "Now pulling recorded sale prices from the Land Registry…",
  },
] as const;

// The pacing (the D73 mechanics, unchanged): groups
// complete no faster than ~720ms apart — smoothing over
// the real settlements, never a timer chain that can
// outrun or lag the data; the advance happens ~600ms
// after the fifth group AND once the real check data is
// ready, whichever is later.
export const CHECKING_ROW_MS = 720;
export const CHECKING_ADVANCE_MS = 600;

export type CheckingRowKey = (typeof CHECKING_ROWS)[number]["key"];

// Row 9's ownership element while the company-ownership flag
// is off (fold-in 6): the row states the position — it is
// never silently shortened.
export const OWNERSHIP_NOT_PART_LINE =
  "Ownership — the ownership check is not part of this result.";

// A row that errors outright shows its named failure state
// and the results still open (D44(5)(ii)).
export function rowFailureLine(rowLabel: string): string {
  return `${rowLabel} couldn't be checked just now — the rest of the check still opens.`;
}

// The home list on the whole-postcode check (fold-in 3's
// picker list, moved by the founder's ruling of 18 Nov
// 2026: the picker page is removed and its list lives on
// the postcode check itself). The explainer is the
// design's own line (Stop W2), addressed to the visitor.
export const PICKER_EXPLAINER =
  "Schools and flood are address-sensitive, so pick your exact house before anything is checked.";
export function pickerCountLine(count: number): string {
  return count === 1 ? "1 address" : `${count} addresses`;
}

// The empty list (fold-in 4): a valid England/Wales full
// postcode with zero filed addresses. One named state, one
// meaning — Scotland/NI never reach it (ruling 4).
export const EMPTY_PICKER_LINE = "No addresses we can list for this postcode yet.";

// The street choice page (M7.15C, 18 Nov 2026): a street
// spanning postcodes offers one row per postcode on it,
// in the picker's list style. The line is build-drafted
// in the site's plain voice and pinned here so any change
// is deliberate; the founder finalises copy at UAT, as
// with the unplaced notice.
export const STREET_CHOICE_LINE =
  "This street covers more than one postcode — pick yours to see its homes.";
export function streetChoiceCountLine(count: number): string {
  return count === 1 ? "1 postcode" : `${count} postcodes`;
}

// The place page (founder ruling, 19 Nov 2026): a place
// spanning districts offers one row per district on it,
// in the picker's list style — the street choice page's
// form with the place's own words. The line is
// build-drafted in the site's plain voice and pinned
// here so any change is deliberate; the founder
// finalises copy at UAT, as with the street line.
export const PLACE_CHOICE_LINE =
  "This place covers more than one postcode district — pick yours to see the wider area.";
export function placeChoiceCountLine(count: number): string {
  return count === 1 ? "1 district" : `${count} districts`;
}

// The mid-pick fallback notice (entry-point build, 18 Nov
// 2026; D72 item 3, gap item 5): a visitor who picked an
// exact home from the list and lands on the whole-postcode
// check — because the backstop could not resolve the pick
// just then — is told so in one line, carried on the route
// as ?notfound=pick. Degradation before any pick stays
// silent; this line exists only where a pick was made.
// PENDING the founder's final copy approval (the build's
// terminal report flags it).
export const PICK_FALLBACK_LINE =
  "We couldn't load that exact home just now — here's the check for the whole postcode instead.";
// The route flag that carries the notice: ?notfound=pick.
export const PICK_FALLBACK_FLAG = "pick";

// The wider-area landing (rung 3): the scope label is the
// resolution's own ("Wider area — CM3, not this exact home");
// the unlock banner is the ladder's named banner.
export const WIDER_AREA_BANNER_HEADING = "Know the full postcode?";
export const WIDER_AREA_BANNER_LINE =
  "A full postcode gives you the checks for one exact home — schools, flood and sold history at the front door, not the district.";
export function postcodeNotFoundLine(postcode: string): string {
  return `${postcode} isn't a postcode we hold — this is the wider area it points to instead.`;
}

// The unplaced notice (founder ruling, 18 Nov 2026): the
// small line the landing page shows at its search box when
// an input couldn't be placed. It replaces the retired
// no-location page (T-WEB-09's old fix route). The example
// stays the neutral SW1A 1AA (fidelity pass 2: the
// founder's own postcode never appears in visitor-facing
// copy). The founder reviews the copy at UAT.
//
// M7.15C (18 Nov 2026): the line is REPLACED with the
// street step's adopted working text. The old line's
// claim — "a street or place name on its own isn't
// enough" — became false the day street names became
// pickable from the list; the new line says what now
// works. Submitting without a pick still lands here: a
// fuzzy match is never applied on submit, ever.
export const UNPLACED_NOTICE_LINE =
  "We couldn't place that. Try a full postcode — for example SW1A 1AA — or start typing a street name and pick it from the list.";

// The not-covered page (ruling 4): the check is never
// refused; every section carries its served not-covered
// line, in place.
export function notCoveredHeading(postcode: string, nation: Nation): string {
  return `${postcode} is in ${nationName(nation)}`;
}
export const NOT_COVERED_INTRO =
  "Check My Next Home covers England and Wales. For this postcode each check below carries its own not-covered line, exactly as the data serves it — nothing is filled in or guessed.";

// The holding results page (ruling 3): the picked address
// and scope label in the header, no bundle rendering — M7.4
// replaces this page wholesale.
export const HOLDING_LINE = "The check is complete. This home's full results open on this page.";
export const HOLDING_POSTCODE_LINE =
  "The check is complete. The full results for this postcode open on this page.";
export function scopeLabelFor(resolution: AddressResolution): string {
  if (resolution.rung === 1) return `${resolution.address.label}, ${resolution.directory.postcode}`;
  if (resolution.rung === 2)
    return `${resolution.directory.postcode} — the whole postcode, not one home`;
  if (resolution.rung === 3) return resolution.label;
  return "No location";
}

// The not-covered page's section lines (ruling 4): every
// section that serves a named not-covered / not-published /
// not-filed state contributes its own line, in place, in the
// words the bundle serves. Sections that serve normally
// contribute nothing here — the holding page renders no
// bundle content (ruling 3); M7.4's results page renders
// every section in full, each not-covered line in place
// (D66).
const AREA_SECTION_NAMES: Record<string, string> = {
  constraints: "Planning constraints",
  heritage: "Heritage",
  nature: "Nature",
  epc: "Energy certificates (EPC)",
  councilTax: "Council tax",
  planningApplications: "Planning applications",
  buildingSafety: "Building safety",
  census: "Census",
  imd: "Deprivation (IMD)",
  air: "Air quality",
  noise: "Noise",
  benefits: "Benefits",
  solar: "Solar potential",
  broadband: "Broadband",
  mobile: "Mobile coverage",
  chargingZones: "Charging zones",
  companyOwnership: "Company ownership",
};

export function notCoveredSectionLines(bundles: {
  nearby: NearbyBundle;
  flood: FloodBundle;
  area: AreaBundle;
  sold: SoldPricesBundle;
  crime: CrimeBundle;
}): { name: string; line: string }[] {
  const out: { name: string; line: string }[] = [];
  const { nearby, flood, area, sold, crime } = bundles;

  if (sold.kind === "not-covered") out.push({ name: "Sold prices", line: sold.soldPrices.reason });
  if (crime.kind === "not-covered") out.push({ name: "Crime", line: crime.crime.reason });
  else if (crime.kind === "crime" && crime.crime.state === "not-filed")
    out.push({ name: "Crime", line: crime.crime.reason });
  if (flood.kind === "not-covered") out.push({ name: "Flood", line: flood.flood.reason });
  if (nearby.kind === "distances") {
    for (const category of nearby.categories) {
      if (category.state === "not-filed" && category.line)
        out.push({ name: category.label, line: category.line });
    }
  }

  if (area.kind === "area-bundle") {
    for (const [key, name] of Object.entries(AREA_SECTION_NAMES)) {
      const section = (area.sections as unknown as Record<string, unknown>)[key];
      const state = sectionState(section);
      if (state !== null && state !== "served") {
        const line = sectionLine(section);
        if (line) out.push({ name, line });
      }
    }
  }

  return out;
}

// The single error page (Final Sample Master view 26;
// founder ruling 19 Nov 2026): ONE face for every
// visitor-facing failure — a check that could not be
// completed (the D44(7) whole-check failure state, whose
// earlier wording this copy retires), an unmatched route,
// a route error. The failure kinds stay distinct in the
// counting (D45's page_error classes); only the face is
// one. No error codes, no technical words. The page's way
// forward is the search box itself: where the attempted
// postcode or address is known it arrives kept in the
// box, under the kept note; the closing line is the
// Contact fallback.
export const ERROR_PAGE_HEADING = "Well — that wasn't supposed to happen";
export const ERROR_PAGE_LINE =
  "Something on our side stumbled. Give it a few seconds, then search below — most hiccups clear on the second try.";
export const ERROR_PAGE_KEPT_NOTE =
  "We've kept the home you were checking in the box — just press the button to run it again, or type a different home.";
export const ERROR_PAGE_CLOSING_BEFORE = "If it keeps happening, let us know via the";
export const ERROR_PAGE_CLOSING_LINK = "Contact page";
export const ERROR_PAGE_CLOSING_AFTER = "and we'll look into it.";

// The robot check (ruling 5): a failed or unavailable
// Turnstile blocks the search with a friendly retry — never
// a crash, never a silent pass.
export const TURNSTILE_BLOCK_LINE =
  "The robot check couldn't run, so your search hasn't been sent. Please try again.";

// ------------------------------------------------------------------
// Checking-group derivation — the part bundles in, the five
// groups' completion lines out. A group outcome is:
//   "done"        — its parts answered and the line is a
//                   finding composed from the served facts;
//   "unavailable" — a part answered with a named state
//                   (not filed, not covered): the line
//                   carries that state in the bundle's own
//                   words;
//   "failed"      — a part request itself failed (marked
//                   by assembleCheckingOutcomes from the
//                   client's part settlements; the per-part
//                   derivations never produce it).
//
// A composed line is segments joined "; ". The first
// segment carries the row's source prefix ("{source} — ")
// unless the segment carries its own prefix (the safety
// group's per-source clauses). A segment flagged named is
// a bundle's own named-state line, served verbatim; a
// group is unavailable when any of its segments is named.
// A line that is one brain-served sentence standing for
// the whole group (a not-filed reason, a failure line)
// serves verbatim, without a prefix.
//
// The drawn finding (Master view 2) carries each group's
// LEAD facts: schools & nurseries counts, the three core
// health distances, crime and flood for safety, council
// tax and broadband for costs, the home's own last sale
// and the postcode's recorded-sales count for history. A
// non-lead dataset (air quality in safety, the EPC in
// costs) contributes a segment only when it serves a
// named state — a named state never passes silently, and
// a served one is the results page's to carry. Mobile
// never contributes (decision D36: mobile never
// headlines).
// ------------------------------------------------------------------

export interface CheckingSegment {
  text: string;
  prefix?: string;
  named: boolean;
}

export type CheckingGroupState = "done" | "unavailable" | "failed";
export interface CheckingGroupResult {
  state: CheckingGroupState;
  line: string;
}

// One part's settlement as the client reports it: the
// bundle the part returned, or the failure mark.
export type CheckingPart<T> = { ok: true; value: T } | { ok: false };

// The named lines for a part that failed outright: the
// flood half of the safety group and its crime/air half
// complete separately, so each half names its own failure.
export const CHECKING_FLOOD_FAILED_LINE = "Flood couldn't be checked just now";
export const CHECKING_CRIME_AIR_FAILED_LINE = "Crime and air quality couldn't be checked just now";

// Miles as the site serves them: one decimal place,
// trailing zeros trimmed ("0.4", "5.9", "0.1"). The brains
// serve miles rounded to three decimals; the display
// precision is one — the finalised sample's form
// throughout. (CI #205 fix: the two-decimal form rendered
// a pill figure as "1.88 mi" against the settled "1.8 mi".)
export function formatMiles(miles: number): string {
  return String(Number(miles.toFixed(1)));
}

export function formatPounds(value: number): string {
  return `£${value.toLocaleString("en-GB")}`;
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

// The flood band word for one filed layer, in the flood
// brain's own framing — THE mapping (the shortlist card
// and the results page read it from here; a second mapping
// would drift, the CI #206 lesson): the covering label
// where one covers the point; the absence states are all
// the Very-low case (Flood Zone 1, no band published,
// below the lowest mapped band); anything else has no
// band word and the layer's own line speaks instead.
export function floodBandOf(layer: {
  coveringLabel: string | null;
  pointState: string;
}): string | null {
  if (layer.coveringLabel) return layer.coveringLabel;
  if (
    layer.pointState === "no-band-published" ||
    layer.pointState === "zone-1" ||
    layer.pointState === "below-lowest-band"
  )
    return "Very low";
  return null;
}

// A served section's named line, wherever the section keeps
// it — the sections are frozen shapes with their own field
// names (line / reason / stateLine); the derivation reads
// them defensively and never invents wording.
function sectionLine(section: unknown): string | null {
  if (typeof section !== "object" || section === null) return null;
  const s = section as Record<string, unknown>;
  for (const key of ["line", "reason", "stateLine"]) {
    if (typeof s[key] === "string" && (s[key] as string).length > 0) return s[key] as string;
  }
  return null;
}

function sectionState(section: unknown): string | null {
  if (typeof section !== "object" || section === null) return null;
  const state = (section as Record<string, unknown>).state;
  return typeof state === "string" ? state : null;
}

function rowSource(key: CheckingRowKey): string {
  return CHECKING_ROWS.find((row) => row.key === key)?.source ?? "";
}

// The segment machinery is shared: the wider-area
// checking derivation (lib/district-checking.ts) composes
// its four groups' lines through the same join and the
// same named-state rule, so the two checking screens can
// never drift in how a line is built.
export function joinSegments(source: string, segments: CheckingSegment[]): string {
  return segments
    .map((segment, index) => {
      const prefix = segment.prefix ?? (index === 0 ? source : undefined);
      return prefix ? `${prefix} — ${segment.text}` : segment.text;
    })
    .join("; ");
}

export function groupResult(source: string, segments: CheckingSegment[]): CheckingGroupResult {
  return {
    state: segments.some((segment) => segment.named) ? "unavailable" : "done",
    line: joinSegments(source, segments),
  };
}

// ------------------------------------------------------------------
// The nearby part — the schools and health groups.
// ------------------------------------------------------------------

// The schools group's categories, in line order. The
// counts are served per category and are NEVER summed:
// the category selections overlap (a primary-phase school
// with a sixth form files in both the primary and the
// sixth-form selections — lib/nearby.ts's CATEGORY_SQL),
// so a combined "schools & nurseries" total would
// double-count and state a figure no brain serves. The
// line names each category's own filed count instead.
const SCHOOLS_GROUP_CATEGORIES = [
  "schools-primary",
  "schools-secondary",
  "sixth-forms",
  "nurseries",
] as const;

const SCHOOL_COUNT_LABELS: Record<string, [string, string]> = {
  "schools-primary": ["primary school", "primary schools"],
  "schools-secondary": ["secondary school", "secondary schools"],
  "sixth-forms": ["sixth form", "sixth forms"],
  nurseries: ["nursery", "nurseries"],
};

// The nearby brain's filed radius (lib/nearby.ts
// RADIUS_MILES), named in the schools line's own words.
const CHECKING_NEARBY_RADIUS_MILES = 2;

// The health group's core three — the drawn finding's
// exact scope; the wider everyday categories (hospital,
// shops, stations) are the results page's depth.
const HEALTH_GROUP_CATEGORIES = ["gp", "dentist", "pharmacy"] as const;
const HEALTH_GROUP_LABELS: Record<string, string> = {
  gp: "GP",
  dentist: "dentist",
  pharmacy: "pharmacy",
};

function schoolsGroupResult(byCategory: Map<NearbyCategory, CategoryAnswer>): CheckingGroupResult {
  const answers = SCHOOLS_GROUP_CATEGORIES.map((key) => byCategory.get(key));
  const notFiled = answers.find((answer) => answer?.state === "not-filed");
  if (notFiled?.line) return { state: "unavailable", line: notFiled.line };
  const present = SCHOOLS_GROUP_CATEGORIES.map((key, index) => ({
    key,
    count: answers[index]?.countWithin ?? 0,
  })).filter((entry) => entry.count > 0);
  if (present.length === 0) {
    // Nothing filed within the radius in any of the four
    // categories: the primary category's own served line
    // speaks for the group — it names the nearest beyond
    // the radius where one is filed. A recorded zero with
    // no such line is served as the count line over zero
    // categories rather than left wordless.
    const primaryLine = answers[0]?.line;
    if (primaryLine) return { state: "done", line: primaryLine };
    return groupResult(rowSource("schools"), [
      {
        text: `No schools or nurseries within ${CHECKING_NEARBY_RADIUS_MILES} miles`,
        named: false,
      },
    ]);
  }
  const parts = present.map(({ key, count }) => {
    const [singular, plural] = SCHOOL_COUNT_LABELS[key] ?? [key, key];
    return `${count.toLocaleString("en-GB")} ${count === 1 ? singular : plural}`;
  });
  return groupResult(rowSource("schools"), [
    {
      text: `Within ${CHECKING_NEARBY_RADIUS_MILES} miles: ${parts.join(" · ")}`,
      named: false,
    },
  ]);
}

function healthGroupResult(byCategory: Map<NearbyCategory, CategoryAnswer>): CheckingGroupResult {
  const answers = HEALTH_GROUP_CATEGORIES.map((key) => byCategory.get(key));
  const notFiledIndex = answers.findIndex((answer) => answer?.state === "not-filed");
  if (notFiledIndex >= 0 && answers[notFiledIndex]?.line)
    return { state: "unavailable", line: answers[notFiledIndex]!.line };
  const nearest = answers.map((answer) => answer?.places[0] ?? answer?.beyondNearest ?? null);
  const missingIndex = nearest.findIndex((place) => place === null);
  if (missingIndex >= 0) {
    // A core service with nothing filed at any distance:
    // its own served line names the position. (Every
    // non-"within" category state serves its line; the
    // failure line is the unreachable defensive form.)
    const line = answers[missingIndex]?.line;
    return line
      ? { state: "unavailable", line }
      : { state: "failed", line: rowFailureLine("Health & the everyday") };
  }
  const miles = nearest.map((place) => place!.miles);
  if (miles.every((value) => value <= 1)) {
    return groupResult(rowSource("health"), [
      { text: "GP, dentist & pharmacy within a mile", named: false },
    ]);
  }
  const parts = HEALTH_GROUP_CATEGORIES.map((key, index) => {
    const formatted = formatMiles(miles[index]);
    return `${HEALTH_GROUP_LABELS[key]} ${formatted} ${formatted === "1" ? "mile" : "miles"}`;
  });
  return groupResult(rowSource("health"), [{ text: parts.join(" · "), named: false }]);
}

export function nearbyCheckingGroups(
  bundle: NearbyBundle,
): Record<"schools" | "health", CheckingGroupResult> {
  if (bundle.kind !== "distances") {
    // The defensive form (the checking screen only ever
    // runs on an exact postcode): the bundle's own reason
    // stands for both groups.
    const reason =
      "distances" in bundle ? bundle.distances.reason : "These checks need an exact postcode.";
    return {
      schools: { state: "unavailable", line: reason },
      health: { state: "unavailable", line: reason },
    };
  }
  const byCategory = new Map(bundle.categories.map((c) => [c.category, c]));
  return {
    schools: schoolsGroupResult(byCategory),
    health: healthGroupResult(byCategory),
  };
}

// ------------------------------------------------------------------
// The flood part — the safety group's flood segments.
// ------------------------------------------------------------------

function floodBandSegment(layers: ServedFloodLayer[]): CheckingSegment | null {
  const bandOf = (layer: ServedFloodLayer | undefined): string | null =>
    layer
      ? floodBandOf({
          coveringLabel: layer.covering?.displayLabel ?? null,
          pointState: layer.pointState,
        })
      : null;
  const rivers = layers.find((layer) => layer.layer === "rofrs");
  const surface = layers.find((layer) => layer.layer === "rofsw");
  const riversBand = bandOf(rivers);
  const surfaceBand = bandOf(surface);
  if (riversBand !== null && surfaceBand !== null) {
    // The drawn form: one band word where both layers read
    // the same, the two named bands where they differ —
    // never one layer's band standing for both.
    return {
      text:
        riversBand === surfaceBand
          ? `flood risk ${riversBand.toLowerCase()}`
          : `flood risk: rivers & sea ${riversBand.toLowerCase()}, surface water ${surfaceBand.toLowerCase()}`,
      prefix: "Environment Agency",
      named: false,
    };
  }
  const bandless = [rivers, surface].find((layer) => layer !== undefined && bandOf(layer) === null);
  const speaker = bandless ?? layers[0];
  if (!speaker) return null;
  return {
    text: speaker.line,
    prefix: "Environment Agency",
    named: speaker.pointState === "not-filed",
  };
}

export function floodCheckingSegments(bundle: FloodBundle): CheckingSegment[] {
  if (bundle.kind !== "flood") {
    // Not covered (and the defensive other kinds): the
    // brain's own reason, as a named segment.
    return [{ text: bundle.flood.reason, prefix: "Environment Agency", named: true }];
  }
  const segments: CheckingSegment[] = [];
  const warnings = bundle.flood.liveWarnings;
  // Live warnings serve first (decision D42): a live flood
  // warning outranks the filed maps, so it leads the
  // group's flood half.
  if (warnings?.state === "warnings") {
    for (const warning of warnings.warnings) segments.push({ text: warning.line, named: false });
    if (warnings.overflowLine) segments.push({ text: warnings.overflowLine, named: false });
  }
  const band = floodBandSegment(bundle.flood.layers);
  if (band) segments.push(band);
  // A live feed that could not answer carries its named
  // line after the filed answer — the filed answer stands
  // (the row is not unavailable for it).
  if (warnings?.state === "unavailable" && warnings.line)
    segments.push({ text: warnings.line, named: false });
  return segments;
}

// ------------------------------------------------------------------
// The area part — the safety group's crime and air
// segments, the costs group and the history group.
// ------------------------------------------------------------------

function crimeCheckingSegment(crime: CrimeBundle): CheckingSegment {
  if (crime.kind === "not-covered")
    return { text: crime.crime.reason, prefix: "Police.uk", named: true };
  if (crime.kind !== "crime")
    return { text: "Crime counts need an exact postcode.", prefix: "Police.uk", named: true };
  if (crime.crime.state !== "served") {
    return {
      text: sectionLine(crime.crime) ?? "Crime counts need an exact postcode.",
      prefix: "Police.uk",
      named: true,
    };
  }
  // The drawn form of the brain's total line: the count
  // over the brain's own window, which is always exactly
  // twelve months (lib/crime.ts). The count is read out of
  // the served line; a line of any other shape serves
  // verbatim rather than lose the fact.
  const match = /^([\d,]+) recorded crimes? within 1 mile of this postcode,/.exec(
    crime.crime.totalLine,
  );
  return {
    text: match ? `${match[1]} recorded crimes in the last 12 months` : crime.crime.totalLine,
    prefix: "Police.uk",
    named: false,
  };
}

function airCheckingSegment(area: AreaBundle): CheckingSegment | null {
  if (area.kind !== "area-bundle")
    return { text: "Air quality needs an exact postcode.", prefix: "Defra", named: true };
  const air = area.sections.air;
  // A served air answer contributes no segment (the drawn
  // finding carries crime and flood); a named state must
  // never pass silently.
  if (sectionState(air) === "served") return null;
  const line = sectionLine(air);
  return line ? { text: line, prefix: "Defra", named: true } : null;
}

function costsGroupResult(area: AreaBundle): CheckingGroupResult {
  if (area.kind !== "area-bundle") {
    return { state: "unavailable", line: "Council tax needs an exact postcode." };
  }
  const segments: CheckingSegment[] = [];
  const councilTax = area.sections.councilTax;
  if (sectionState(councilTax) === "served") {
    const label = (councilTax as { bandDAverageLabel?: unknown }).bandDAverageLabel;
    segments.push({
      text:
        typeof label === "string" && label.length > 0
          ? `Council tax Band D average ${label}`
          : (sectionLine(councilTax) ?? "Council tax"),
      named: false,
    });
  } else {
    const line = sectionLine(councilTax);
    if (line) segments.push({ text: line, named: true });
  }
  const broadband = area.sections.broadband;
  const broadbandLine = sectionLine(broadband);
  if (sectionState(broadband) === "served") {
    if (broadbandLine) segments.push({ text: broadbandLine, named: false });
  } else if (broadbandLine) {
    segments.push({ text: broadbandLine, named: true });
  }
  // The EPC contributes only a named state (see the
  // section head): a served band is the results page's
  // headline; a not-filed or unmatched state names itself.
  const epc = area.sections.epc;
  if (sectionState(epc) !== "served") {
    const line = sectionLine(epc);
    if (line) segments.push({ text: line, named: true });
  }
  if (segments.length === 0)
    return { state: "failed", line: rowFailureLine("Costs & connections") };
  return groupResult(rowSource("costs"), segments);
}

function historyGroupResult(sold: SoldPricesBundle): CheckingGroupResult {
  if (sold.kind === "not-covered") return { state: "unavailable", line: sold.soldPrices.reason };
  if (sold.kind !== "sold-prices") return { state: "unavailable", line: sold.soldPrices.reason };
  // The cold-load degrade variant (Part A of the
  // cold-check fix, 19 Nov 2026): kind "sold-prices" but
  // no figures — the load has not landed. This branch
  // stands BEFORE the figures path below: the variant
  // has no loadState or ownHistory to read. Its reason
  // is the group's named-state line, exactly as
  // not-covered's reason is above.
  if ("soldPrices" in sold) return { state: "unavailable", line: sold.soldPrices.reason };
  // The rung 1/2 variants ARE the postcode's figures (the
  // fields sit on the bundle itself).
  const figures = sold;
  if (figures.loadState === "loaded-none") {
    // A filed zero is a fact, not a gap: the brain's own
    // no-sale sentence completes the group as done. (The
    // count form is the defensive fallback — recordedCount
    // is itself a served figure.)
    return {
      state: "done",
      line:
        figures.stateLine ??
        `${figures.recordedCount.toLocaleString("en-GB")} recorded sales in this postcode`,
    };
  }
  const segments: CheckingSegment[] = [];
  // Rung 1 only: the home's own most recent recorded sale
  // (ownHistory is newest first) leads, in the drawn form.
  if (sold.rung === 1 && sold.ownHistory.length > 0) {
    const latest = sold.ownHistory[0];
    segments.push({
      text: `This home sold for ${formatPounds(latest.price)} on ${formatFiledDate(latest.date)}`,
      named: false,
    });
  }
  segments.push({
    text: `${figures.recordedCount.toLocaleString("en-GB")} recorded sales in this postcode`,
    named: false,
  });
  return groupResult(rowSource("history"), segments);
}

export function areaCheckingGroups(
  area: AreaBundle,
  sold: SoldPricesBundle,
  crime: CrimeBundle,
): {
  safetyCrime: CheckingSegment;
  safetyAir: CheckingSegment | null;
  costs: CheckingGroupResult;
  history: CheckingGroupResult;
} {
  return {
    safetyCrime: crimeCheckingSegment(crime),
    safetyAir: airCheckingSegment(area),
    costs: costsGroupResult(area),
    history: historyGroupResult(sold),
  };
}

// ------------------------------------------------------------------
// Assembly — the three parts' derived payloads in (as the
// /api/check routes serve them and the client holds them),
// the five groups' outcomes out. A group whose parts have
// not settled yet reads null. Group-to-part wiring:
// schools and health settle with the nearby part; safety
// with the flood part and the area part together (crime
// and air ride the area part, its segments interleaved
// around the flood part's: crime, flood, air); costs and
// history with the area part. A failed part completes its
// groups with their named failure lines.
// ------------------------------------------------------------------

export interface CheckingNearbyPayload {
  schools: CheckingGroupResult;
  health: CheckingGroupResult;
}

export interface CheckingAreaPayload {
  safety: { crime: CheckingSegment; air: CheckingSegment | null };
  groups: { costs: CheckingGroupResult; history: CheckingGroupResult };
}

export function assembleCheckingOutcomes(parts: {
  nearby?: CheckingPart<CheckingNearbyPayload>;
  flood?: CheckingPart<CheckingSegment[]>;
  area?: CheckingPart<CheckingAreaPayload>;
}): Record<CheckingRowKey, CheckingGroupResult | null> {
  const failed = (label: string): CheckingGroupResult => ({
    state: "failed",
    line: rowFailureLine(label),
  });

  let safety: CheckingGroupResult | null = null;
  if (parts.flood !== undefined && parts.area !== undefined) {
    const segments: CheckingSegment[] = [];
    if (parts.area.ok) segments.push(parts.area.value.safety.crime);
    else
      segments.push({
        text: CHECKING_CRIME_AIR_FAILED_LINE,
        prefix: "Police.uk",
        named: true,
      });
    if (parts.flood.ok) segments.push(...parts.flood.value);
    else
      segments.push({
        text: CHECKING_FLOOD_FAILED_LINE,
        prefix: "Environment Agency",
        named: true,
      });
    if (parts.area.ok && parts.area.value.safety.air) segments.push(parts.area.value.safety.air);
    safety = groupResult(rowSource("safety"), segments);
  }

  return {
    schools:
      parts.nearby === undefined
        ? null
        : parts.nearby.ok
          ? parts.nearby.value.schools
          : failed("Schools & nurseries"),
    health:
      parts.nearby === undefined
        ? null
        : parts.nearby.ok
          ? parts.nearby.value.health
          : failed("Health & the everyday"),
    safety,
    costs:
      parts.area === undefined
        ? null
        : parts.area.ok
          ? parts.area.value.groups.costs
          : failed("Costs & connections"),
    history:
      parts.area === undefined
        ? null
        : parts.area.ok
          ? parts.area.value.groups.history
          : failed("Past sales & prices"),
  };
}
