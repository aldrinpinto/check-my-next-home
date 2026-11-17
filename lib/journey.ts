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
//   /search            — the bare route: the no-location fix
//                        route only (T-WEB-09). With
//                        ?postcode= it is the postcode form
//                        (picker / postcode-level state);
//                        with ?outward= it is the wider-area
//                        landing (rung 3).
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
import type { FloodBundle } from "./flood";
import type { NearbyBundle, NearbyCategory } from "./nearby";
import { COMPANY_OWNERSHIP_ENABLED } from "./site";
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
  | { kind: "picker"; url: string }
  | { kind: "home"; url: string }
  | { kind: "postcode-results"; url: string }
  | { kind: "not-covered"; url: string }
  | { kind: "wider-area"; url: string }
  | { kind: "no-location"; url: string };

export function journeyDestination(
  resolution: AddressResolution,
  typed: { postcode: string | null },
  homeKey: string | null,
): JourneyDestination {
  switch (resolution.rung) {
    case 4:
      // No usable location — including a bare street or place
      // name (ruling 2: the narrowed search scope lands it
      // here, asking for the postcode).
      return { kind: "no-location", url: SEARCH_ROUTE };
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
      return {
        kind: "picker",
        url: postcodeRoute(postcode, {
          street: resolution.street,
          building: resolution.building,
        }),
      };
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

// The checking screen — D73 (fold-in build, 17 Nov 2026):
// a pure graphic with a purposeful delay, NOT synced to the
// backend, with no failure or not-completed states ever
// (the Results page carries any "couldn't pull" states).
// Exactly five grouped rows, in this order, with the
// pinned heading and sub-line. This supersedes the M7.3/D70
// truthful-ticking presentation (nine rows completing as
// the brains resolved) and the 2,000ms readable hold.
export const CHECKING_HEADING_HOME = "Your check is under way";
export const CHECKING_HEADING_POSTCODE = "Your check is under way";
export const CHECKING_HEADING = "Your check is under way";
export const CHECKING_INTRO = "We present the facts — the decision is yours.";

export const CHECKING_ROWS = [
  {
    key: "schools",
    label: "Schools & nurseries",
    qualifier: "Primaries, secondaries, sixth forms and childcare near here.",
  },
  {
    key: "health",
    label: "Health & the everyday",
    qualifier: "GP, dentist, pharmacy, hospital, shops and stations near here.",
  },
  {
    key: "safety",
    label: "Safety & surroundings",
    qualifier: "Crime, flood risk and air quality around here.",
  },
  {
    key: "costs",
    label: "Costs & connections",
    qualifier: "Council tax, energy, broadband and mobile for this postcode.",
  },
  {
    key: "history",
    label: "Past sales & prices",
    qualifier: "Recorded sale prices, from the Land Registry.",
  },
] as const;

// D73 timing: rows complete ~720ms apart on the graphic's
// own clock; the progress bar advances 20% per row; the
// advance happens ~600ms after the fifth row AND once the
// real resolution/check data is ready, whichever is later.
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

// The picker (fold-in 3). The explainer is the design's own
// line (Stop W2), addressed to the visitor; the confirm is
// the design's button (D70 R6: select-then-confirm).
export const PICKER_EXPLAINER =
  "Schools and flood are address-sensitive, so pick your exact house before anything is checked.";
export const PICKER_CONFIRM_LABEL = "Check this address →";
export function pickerCountLine(count: number): string {
  return count === 1 ? "1 address" : `${count} addresses`;
}

// The empty picker (fold-in 4): a valid England/Wales full
// postcode with zero filed addresses. One named state, one
// meaning — Scotland/NI never reach it (ruling 4).
export const EMPTY_PICKER_LINE = "No addresses we can list for this postcode yet.";
export const POSTCODE_LEVEL_LINK = "See the check for the whole postcode";

// The wider-area landing (rung 3): the scope label is the
// resolution's own ("Wider area — CM3, not this exact home");
// the unlock banner is the ladder's named banner.
export const WIDER_AREA_BANNER_HEADING = "Know the full postcode?";
export const WIDER_AREA_BANNER_LINE =
  "A full postcode gives you the checks for one exact home — schools, flood and sold history at the front door, not the district.";
export function postcodeNotFoundLine(postcode: string): string {
  return `${postcode} isn't a postcode we hold — this is the wider area it points to instead.`;
}

// The no-location route (T-WEB-09): a bare street or place
// name lands here too (ruling 2), asking for the postcode.
export const NO_LOCATION_HEADING = "We couldn't place that";
// Fidelity pass 2 (founder, 17 Nov 2026): the example is the
// neutral SW1A 1AA — the founder's own postcode never appears
// in visitor-facing copy.
export const NO_LOCATION_LINE =
  "Try a full postcode — for example SW1A 1AA — or a full address with its postcode. A street or place name on its own isn't enough: every town has a street with the same name.";

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

// The whole-check failure state (D44(7)) — plain wording, a
// retry, and the sample-report route.
export const WHOLE_CHECK_FAILURE_HEADING = "This check couldn't be completed";
export const WHOLE_CHECK_FAILURE_LINE =
  "Something went wrong at our end. Trying again usually fixes it — or take a look at a finished example instead.";
export const WHOLE_CHECK_FAILURE_RETRY = "Try again";
export const WHOLE_CHECK_FAILURE_SAMPLE = "See a SAMPLE report";

// The robot check (ruling 5): a failed or unavailable
// Turnstile blocks the search with a friendly retry — never
// a crash, never a silent pass.
export const TURNSTILE_BLOCK_LINE =
  "The robot check couldn't run, so your search hasn't been sent. Please try again.";

// ------------------------------------------------------------------
// Row-state derivation — bundles in, row states out. A row is:
//   "done"        — its brain answered;
//   "unavailable" — its brain answered with a named state
//                   (the line the bundle itself serves);
//   "failed"      — the request itself failed (the client
//                   marks this; the derivations never do).
// ------------------------------------------------------------------

export type RowState = "done" | "unavailable";
export interface RowResult {
  state: RowState;
  line: string | null;
  elements?: RowElement[];
}

// Which nearby categories stand behind each of rows 1–7. The
// nearby brain completes rows 1–7 together (one bundle), but
// each row's named state is read from its own categories.
export const ROW_CATEGORIES: Record<string, readonly NearbyCategory[]> = {
  schools: ["schools-primary", "schools-secondary", "sixth-forms"],
  nurseries: ["nurseries"],
  health: ["gp", "dentist", "pharmacy"],
  hospitals: ["ae", "maternity"],
  parks: ["parks", "vets", "pet-shops", "pet-boarding"],
  shops: ["supermarket", "station", "bus-stop", "ev-chargers"],
  food: ["food-and-drink", "leisure", "places-to-visit", "places-of-worship", "libraries"],
};

export function nearbyRowResults(bundle: NearbyBundle): Record<string, RowResult> {
  const out: Record<string, RowResult> = {};
  if (bundle.kind !== "distances") {
    // Rungs 3–4 never reach the checking screen; a bundle of
    // any other kind means every nearby row is unavailable
    // with the bundle's own reason.
    const reason =
      "distances" in bundle ? bundle.distances.reason : "These checks need an exact postcode.";
    for (const key of Object.keys(ROW_CATEGORIES))
      out[key] = { state: "unavailable", line: reason };
    return out;
  }
  const byCategory = new Map(bundle.categories.map((c) => [c.category, c]));
  for (const [key, categories] of Object.entries(ROW_CATEGORIES)) {
    const notFiled = categories
      .map((c) => byCategory.get(c))
      .find((answer) => answer?.state === "not-filed");
    out[key] = notFiled
      ? { state: "unavailable", line: notFiled.line }
      : { state: "done", line: null };
  }
  return out;
}

export function floodRowResult(bundle: FloodBundle): RowResult {
  if (bundle.kind === "not-covered") return { state: "unavailable", line: bundle.flood.reason };
  if (bundle.kind !== "flood") return { state: "unavailable", line: bundle.flood.reason };
  // The filed answer served. The live-warnings element rides
  // the row: when the live feed could not answer, its named
  // line (D42) shows on the row — the row itself is done,
  // because the filed answer stands.
  const warnings = bundle.flood.liveWarnings;
  return {
    state: "done",
    line: warnings && warnings.state === "unavailable" ? warnings.line : null,
  };
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

export interface RowElement {
  label: string;
  state: RowState;
  line: string | null;
}

function elementResult(label: string, section: unknown): RowElement {
  const state = sectionState(section);
  if (state === null || state === "served") return { label, state: "done", line: null };
  return { label, state: "unavailable", line: sectionLine(section) };
}

// Row 9 completes with the area bundle and the sold-prices /
// crime answers (fold-in 5). Its elements complete
// individually; the row is unavailable when any element is.
export function historyRowResult(
  area: AreaBundle,
  sold: SoldPricesBundle,
  crime: CrimeBundle,
): RowResult {
  const elements: { label: string; state: RowState; line: string | null }[] = [];

  if (sold.kind === "not-covered") {
    elements.push({ label: "Sold history", state: "unavailable", line: sold.soldPrices.reason });
  } else if (sold.kind === "sold-prices") {
    elements.push({ label: "Sold history", state: "done", line: null });
  } else {
    elements.push({
      label: "Sold history",
      state: "unavailable",
      line: "Sold history needs an exact postcode.",
    });
  }

  // Crime rides row 9's completion (fold-in 5) though the
  // row's label does not name it.
  if (crime.kind === "not-covered") {
    elements.push({ label: "Crime", state: "unavailable", line: crime.crime.reason });
  } else if (crime.kind === "crime") {
    elements.push(
      crime.crime.state === "served"
        ? { label: "Crime", state: "done", line: null }
        : { label: "Crime", state: "unavailable", line: sectionLine(crime.crime) },
    );
  } else {
    elements.push({
      label: "Crime",
      state: "unavailable",
      line: "Crime counts need an exact postcode.",
    });
  }

  if (area.kind === "area-bundle") {
    elements.push(elementResult("Council tax", area.sections.councilTax));
    elements.push(elementResult("EPC", area.sections.epc));
    elements.push(elementResult("Planning applications", area.sections.planningApplications));
    elements.push(elementResult("Constraints", area.sections.constraints));
  } else {
    for (const label of ["Council tax", "EPC", "Planning applications", "Constraints"]) {
      elements.push({ label, state: "unavailable", line: `${label} needs an exact postcode.` });
    }
  }

  // The ownership element (fold-in 6): while the flag is off
  // it states the position on the row — never silently
  // shortened. While on, it reads the served section.
  if (!COMPANY_OWNERSHIP_ENABLED) {
    elements.push({ label: "Ownership", state: "unavailable", line: OWNERSHIP_NOT_PART_LINE });
  } else if (area.kind === "area-bundle" && area.sections.companyOwnership) {
    elements.push(elementResult("Ownership", area.sections.companyOwnership));
  } else {
    elements.push({ label: "Ownership", state: "unavailable", line: OWNERSHIP_NOT_PART_LINE });
  }

  const anyUnavailable = elements.some((e) => e.state === "unavailable");
  return { state: anyUnavailable ? "unavailable" : "done", line: null, elements };
}
