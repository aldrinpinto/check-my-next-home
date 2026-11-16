import type { AddressQueryable, AddressResolution } from "./address";
import { INDUSTRIAL_SITES_ENABLED } from "./site";

// Distances and What's Nearby (plan step M6.2, decision D22).
//
// The brain's distance answers: for a resolved home, the nearest
// filed places in each category, measured as straight-line miles
// from the POSTCODE POINT — never from a building, never as
// walking or driving time. The arithmetic is one haversine with
// earth radius 3,956 miles — the M5.2/M5.5 basis — so those
// loaders' locked figures reproduce here exactly. (Two loaders
// measured their own goldens with slightly different radii —
// EV 3,959, schools/health 3,958.7613 — so their figures can
// sit up to ~0.003 mi from the brain's at three decimals, while
// reproducing at the roundings the prep stated them. The brain
// serves one basis throughout: a report must not mix radii.)
//
// The ladder contract (M6.1/D6): distances attach at rungs 1 and
// 2 only, both measured from the postcode point, and the bundle
// states the postcode it serves. A wider area (rung 3) gets NO
// distance payload — a named state instead — because a distance
// to "somewhere in CM3" would be a false fact about a home.
//
// School application deadlines (M6.22, decision D42) ride in
// this bundle as one line per check, attached to the schools
// answers: 31 October (secondary) and 15 January (primary)
// are the statutory national closing dates in the School
// Admissions Code for England — they do not vary by council,
// which is what makes a single national pair honest. The
// line carries the one real caveat beside the dates: some
// schools ask for a supplementary form, which can have its
// own deadline. Wales serves a named line pointing to the
// council's own published dates (Welsh admissions run under
// the Welsh code, with council-set dates — the English dates
// must not serve there); Scotland and Northern Ireland serve
// nothing. The nation is read from the resolution's filed
// area code, the flood brain's precedent — never outward
// letters. The dates are constants below, kept current by
// the plan's annual ops check, which verifies the pair
// against the current Code before they can go stale.
//
// Maternity units (M6.24, founder ruling at M6.23): a
// twenty-first category, selected from the health points'
// filed ratings population groups (migration 0023). The
// CQC directory's "Service types" column carries no
// maternity value at all — its vocabulary is organisational
// (Hospital, Clinic, Dentist…) — while the ratings file's
// "Service / Population Group" column names "Maternity"
// for the units that have one; the loader files those
// groups on the hospital row, and this category selects on
// them. The category mirrors A&E exactly: an essential
// health service (the single nearest is named beyond the
// radius), absence stated as a ground fact. It is NOT a
// headline category — the short bundle's six (D28) are
// unchanged.
//
// CQC ratings on health rows (M6.25, founder ruling at
// M6.23): the places the GP, A&E and maternity categories
// serve carry the location's overall CQC rating, joined
// from the filed cqc_ratings table (filed since M4.7).
// The join is the loader's own filed link —
// cqc_ratings.health_point_id to health_points.id, which
// the loader populates for every rating it files (its
// source-side match is by exact code, never by name; at
// most one rating row files per point). The rating serves
// exactly as published and never recomputed; a maternity
// row carries the location's OVERALL rating, never a
// maternity-specific one. A health place with no filed
// rating serves the rating field as null — the named
// absence — never an inferred or neighbouring rating.
// Dentists and pharmacies carry no rating field at all:
// no ratings file for them (pharmacies answer to a
// different regulator; dentists are registered, not
// rated). Welsh points are never rated (CQC covers
// England only), so a Welsh health place serves the null
// absence like any unrated place. Ratings are full-check
// depth only: the short bundle's derivation never reads
// them (D28).
//
// Industrial sites (M6.32, decisions D50, D60 and D62): at
// the END of this bundle — the report's What's Nearby
// section, never the air section — the regulated
// industrial sites the Environment Agency's Pollution
// Inventory holds within the same two miles, each serving
// its filed address (the source carries no site name),
// its operator, its PERMIT REFERENCE, and the releases to
// air its operator reported for the latest filed year.
// A below-reporting-threshold return is a fact of its own
// kind — the operator reported the substance, no quantity
// was published — and serves as a name on a labelled line,
// never as 0 and never beside a number; a quantified
// return of 0 is a different filed fact and serves as 0.
// Nothing is totalled and nothing is ranked across
// substances: substances are incommensurable, and the
// block's shape holds no total for a renderer to print by
// accident. The block serves behind INDUSTRIAL_SITES_ENABLED
// (lib/site.ts, D60): while the flag is off the key is
// ABSENT from the bundle entirely — the D32 absence
// property — and the source is never read. The Inventory
// covers England only; Welsh, Scottish and Northern Irish
// homes serve the named not-covered state, each naming the
// inventory that covers them (the Welsh Emissions
// Inventory, the Scottish Pollutant Release Inventory, the
// Northern Ireland Pollution Inventory) — the D30/D31
// named-gap pattern, never a false none. Report depth
// only: the short bundle's derivation never reads the
// block, so the short answer is byte-identical with the
// flag on or off.
//
// Sixth-form serving (M6.33, decisions D51 and D64): a
// twenty-second category, "sixth forms and colleges",
// read from the SAME schools filing as the school lists —
// no new loader, no new table. Its selection is the
// register's own sixth-form evidence, mainstream only:
// every "16 plus" phase row (further education colleges,
// 16-19 academies and free schools) plus the rows of any
// other phase except Secondary whose filed sixth-form
// flag reads "Has a sixth form" (all-through schools
// among them) — special-sector types are out (D64),
// independent types are out, Welsh establishments are
// out, and the 'Sixth form centres' and 'Special post 16
// institution' types are out at V1. Places serve name,
// the type as filed, and distance — no Ofsted element
// (the filed join carries almost none for 16-plus
// provision). The within list never repeats a school the
// secondary list serves; the category's beyond-nearest,
// alone in the brain, may draw on flagged secondaries
// (D64 ruling 4) — the nearest sixth-form evidence
// beyond the radius, named from the wider pool. The
// schools-secondary places themselves gain a marker:
// sixthForm, the filed flag as filed — true only on
// "Has a sixth form", false only on "Does not have a
// sixth form", null where the register files neither —
// never derived from age ranges (the register contradicts
// its own age ranges in a minority of rows, and the flag
// is the fact). Report depth only: the short bundle's
// six headline categories (D28) are unchanged, and its
// derivation never reads the marker or the category.
//
// Leavers' destinations (M6.34, D51/D65) ride on the
// secondary places themselves: each carries its URN (the
// register's own key, the only safe join — the
// destinations file carries schools under earlier names)
// and a destinations block holding the two stages' answers
// as DfE published them — key stage 4 for every served
// secondary, 16 to 19 additionally where the school's
// marker is exactly "has a sixth form". The shares serve
// verbatim with their cohort year and the sustained
// definition beside them; the not-sustained and
// not-captured remainders never serve, no national figure
// stands beside a school's, and 16-plus providers never
// serve destinations (their rows file anyway). Report
// depth only: the short bundle's derivation never reads
// the block.

export const DISTANCE_BASIS_LABEL = "straight-line distance from the postcode point";
export const RADIUS_MILES = 2;
export const LIST_SIZE = 3;

const EARTH_RADIUS_MILES = 3956;

// The loaders' haversine, verbatim in form (load-transport.mjs
// and siblings): the locked goldens were computed with exactly
// this arithmetic.
export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}

function round3(miles: number): number {
  return Math.round(miles * 1000) / 1000;
}

export type NearbyCategory =
  | "schools-primary"
  | "schools-secondary"
  | "sixth-forms"
  | "nurseries"
  | "gp"
  | "dentist"
  | "pharmacy"
  | "ae"
  | "maternity"
  | "station"
  | "bus-stop"
  | "ev-chargers"
  | "supermarket"
  | "food-and-drink"
  | "leisure"
  | "places-to-visit"
  | "places-of-worship"
  | "libraries"
  | "vets"
  | "pet-shops"
  | "pet-boarding"
  | "parks";

// A location's overall CQC rating, exactly as filed in
// cqc_ratings (M6.25): the rating word is CQC's own
// published value ("Outstanding", "Good",
// "Requires improvement", "Inadequate", or "Not Rated"
// where CQC files that), and the date is the rating's
// Publication Date in CQC's file, filed as what it is —
// null where the file carries no date for the rating
// (the fixture's one "Not Rated" row files none). Never
// recomputed, never a service- or population-specific
// rating: the overall, always.
export type CqcRating = {
  rating: string;
  date: string | null;
};

// One filed destinations share (M6.34): the value as
// published, or null exactly when low is true — the
// release's "low" marker, a positive share under 0.5%,
// filed as a flagged value and never as a zero.
export type DestinationShareFact = {
  value: number | null;
  low: boolean;
};

// One institution's filed destinations row for one
// stage, as the loader filed it (M6.34): the latest
// published cohort's count, version and state, and the
// D65 field set. state "suppressed" carries every share
// null — the release suppresses all of a small cohort's
// shares together. higherEducation is null-valued on a
// KS4 row (the KS4 file carries no such column).
export type DestinationRowFact = {
  cohortYear: string;
  version: string;
  cohortCount: number;
  state: "served" | "suppressed";
  overall: DestinationShareFact;
  education: DestinationShareFact;
  higherEducation: DestinationShareFact;
  apprenticeships: DestinationShareFact;
  employment: DestinationShareFact;
};

// The destinations release as filed, table-wide (M6.34):
// the count the not-filed state stands on, and each
// stage's cohort and publication date — the release
// facts the absence lines and the cohort lines are
// composed from. Both stages file together or neither
// does, so a filed table always carries both entries.
export type DestinationsReleaseFacts = {
  filedCount: number;
  ks4: { cohortYear: string; sourceDate: string } | null;
  ks5: { cohortYear: string; sourceDate: string } | null;
};

export type NearbyPoint = {
  name: string | null;
  latitude: number;
  longitude: number;
  // A filed fact served beside the name where the category has
  // one: the EV access class, the recorded religion for a place
  // of worship. Never an inference.
  detail?: string | null;
  // Schools only: the register's own admissions-policy fact.
  selective?: boolean;
  // Health points only (GP, A&E, maternity): the location's
  // filed overall CQC rating, or null where no rating is
  // filed for the point. Absent entirely on every other
  // category's points — dentists and pharmacies file no
  // ratings, so their points never carry the field.
  cqcRating?: CqcRating | null;
  // Secondary schools only (M6.33, D51/D64): the filed
  // sixth-form flag as filed — true on "Has a sixth
  // form", false on "Does not have a sixth form", null
  // where the register files neither. Absent entirely on
  // every other category's points.
  sixthForm?: boolean | null;
  // Secondary schools only (M6.34, D51/D65): the
  // register's URN for the school — the key the
  // destinations join stands on — and the school's filed
  // destinations rows, one per stage, null where the
  // release files no row for the school. Absent entirely
  // on every other category's points.
  urn?: string;
  destinations?: { ks4: DestinationRowFact | null; ks5: DestinationRowFact | null };
};

// The brain's read port over the filed point tables — the same
// pattern as lib/address.ts: tests drive a fake built from the
// loaders' fixture filings; createNearbySource below is the
// only database reader.
export interface NearbyDataSource {
  pointsWithin(
    category: NearbyCategory,
    latitude: number,
    longitude: number,
    radiusMiles: number,
  ): Promise<NearbyPoint[]>;
  nearestPoint(
    category: NearbyCategory,
    latitude: number,
    longitude: number,
  ): Promise<NearbyPoint | null>;
  // The category's filed point count, table-wide — the
  // guard every absence in this bundle stands on (M6.9,
  // decision D30, the flood form): a category whose table
  // holds nothing serves its not-filed state, never an
  // absence read from an empty table.
  filedCount(category: NearbyCategory): Promise<number>;
  // The Pollution Inventory facts (M6.32): the filed
  // register's placeable count (the guard the none state
  // stands on), the filed vintage and its provenance, and
  // the filed sites near the point with their air releases
  // as filed — the brain applies the exact haversine cut
  // and the serving rules. Read only for an English home
  // while INDUSTRIAL_SITES_ENABLED is on.
  industrialSiteFacts(latitude: number, longitude: number): Promise<IndustrialSitesFacts>;
  // The destinations release facts (M6.34): the filed
  // count and each stage's cohort and publication date,
  // table-wide — read once per bundle and composed
  // against the secondary places' filed rows.
  destinationsRelease(): Promise<DestinationsReleaseFacts>;
}

// One filed site near the point, with its releases to air
// as filed (M6.32): a release's quantityKg is null exactly
// when belowThreshold is true — the operator reported the
// substance and no quantity was published.
export type IndustrialSiteFact = {
  permitId: string;
  operator: string;
  siteAddress: string;
  sitePostcode: string | null;
  activityDescription: string | null;
  sector: string | null;
  subSector: string | null;
  latitude: number;
  longitude: number;
  releases: {
    substance: string;
    quantityKg: number | null;
    thresholdKg: number;
    belowThreshold: boolean;
  }[];
};

export type IndustrialSitesFacts = {
  // Placeable filed sites (a filed point exists) — the
  // count the none state stands on. The register also
  // files sites with no published point; they can never
  // serve and never count here.
  filedCount: number;
  dataYear: number | null;
  sourceName: string | null;
  sourceDate: string | null;
  sites: IndustrialSiteFact[];
};

// One stage's served destinations answer (M6.34, D65).
// A served stage carries the published shares verbatim
// under two lines that travel with them: the cohort line
// (who these leavers are, how many, and that this is the
// most recent cohort DfE has published, with the
// publication month — the lag stays visible) and the
// sustained line (the definition every share stands
// under). higherEducation is the KS5 stage's fifth
// share; it is null on a KS4 stage, whose file carries
// no such column. The suppressed and no-row stages carry
// the prep's adopted wordings (D65 ruling 7), pinned
// verbatim in the tests; the not-filed stage is the
// house D30 form. No state carries the release's
// not-sustained or not-captured remainders, and no
// national figure ever stands beside a school's.
export type DestinationsStageAnswer =
  | {
      state: "served";
      cohortYear: string;
      cohortCount: number;
      cohortLine: string;
      sustainedLine: string;
      overall: DestinationShareFact;
      education: DestinationShareFact;
      higherEducation: DestinationShareFact | null;
      apprenticeships: DestinationShareFact;
      employment: DestinationShareFact;
    }
  | { state: "suppressed"; cohortYear: string; line: string }
  | { state: "no-row"; cohortYear: string; line: string }
  | { state: "not-filed"; line: string };

// A secondary place's destinations block (M6.34): the
// KS4 stage always; the KS5 stage only where the
// school's sixth-form marker is exactly true — a school
// whose register entry files neither value, or "does
// not have", carries ks5 null, never a guessed block.
export type PlaceDestinations = {
  ks4: DestinationsStageAnswer;
  ks5: DestinationsStageAnswer | null;
};

export type NearbyPlace = {
  name: string;
  miles: number;
  detail: string | null;
  selective?: boolean;
  // GP, A&E and maternity places only (M6.25): the
  // location's overall CQC rating as filed, present on
  // every place those categories serve — the rating
  // object where one is filed, null where none is (the
  // named absence). Never present on any other
  // category's places: dentists and pharmacies serve
  // exactly as they did before the step.
  cqcRating?: CqcRating | null;
  // Secondary schools only (M6.33, D51/D64): the filed
  // sixth-form flag as filed, present on every place the
  // secondary category serves — true, false, or null
  // where the register files neither value. Never
  // present on any other category's places.
  sixthForm?: boolean | null;
  // Secondary schools only (M6.34, D51/D65): the
  // register's URN and the school's destinations block,
  // present on every place the secondary category
  // serves. Never present on any other category's
  // places — 16-plus providers serve in the sixth-forms
  // category and carry neither (D65 ruling 5).
  urn?: string;
  destinations?: PlaceDestinations;
};

export type CategoryState = "within" | "none-within" | "empty-map" | "empty" | "not-filed";

export type CategoryAnswer = {
  category: NearbyCategory;
  label: string;
  basisLabel: string;
  state: CategoryState;
  // The nearest named places within the radius, distance order,
  // at most LIST_SIZE. Unnamed points count towards countWithin
  // but can never be listed — a served line never leads with a
  // nameless place.
  places: NearbyPlace[];
  // Every filed point within the radius, named or not. For bus
  // stops this is the filed-rows count (D22's locked basis).
  countWithin: number;
  // Essential services only: when nothing files within the
  // radius, the single nearest beyond it, always named.
  beyondNearest: { name: string; miles: number } | null;
  // The ruled sentence for the non-"within" states; null when
  // the places speak for themselves.
  line: string | null;
  // schools-secondary only: the nearest selective secondary
  // within the radius, as a per-school fact (never an area
  // inference); null when none files there.
  nearestSelective?: { name: string; miles: number } | null;
  // schools-secondary only (M6.18, decision D37): the
  // selective fact's own gloss, served beside it — a family
  // cannot tell from the word alone that "selective" means
  // admission by entrance test (the register's own
  // admissions-policy fact). Null where no selective school
  // files within the radius: no figure, no line.
  nearestSelectiveLine?: string | null;
};

// The school application deadlines line (M6.22, D42): one
// per check, not per school. England serves the statutory
// dates; Wales serves the named council line; Scotland and
// Northern Ireland serve nothing (the bundle field is null).
export interface SchoolDeadlines {
  state: "england" | "wales";
  line: string;
}

// The statutory national closing dates in the School
// Admissions Code for England (the mandatory code under the
// School Standards and Framework Act 1998), restated by
// councils as "national closing date (statutory)" and
// unchanged year to year. Kept current by the plan's annual
// ops check, which verifies this pair against the current
// Code / GOV.UK admissions guidance once a year.
export const SCHOOL_DEADLINE_SECONDARY = "31 October";
export const SCHOOL_DEADLINE_PRIMARY = "15 January";

export const SCHOOL_DEADLINES_ENGLAND_LINE = `School application deadlines in England: ${SCHOOL_DEADLINE_SECONDARY} for secondary places and ${SCHOOL_DEADLINE_PRIMARY} for primary places — the national closing dates set in the School Admissions Code, for a place the following September. Some schools also ask for a supplementary form, which can have its own deadline.`;

export const SCHOOL_DEADLINES_WALES_LINE =
  "School application deadlines in Wales are set by each council — check the council's own admissions pages for this year's dates.";

// The nation, read from the resolution's own filed fact —
// the first letter of the directory's lsoa_code (E… England,
// W… Wales, S… Scotland, N… Northern Ireland) — never from
// outward postcode letters, which straddle the Welsh border
// (the flood brain's coverage rule, D25).
function schoolDeadlinesFor(lsoaCode: string | null): SchoolDeadlines | null {
  switch ((lsoaCode ?? "").charAt(0)) {
    case "E":
      return { state: "england", line: SCHOOL_DEADLINES_ENGLAND_LINE };
    case "W":
      return { state: "wales", line: SCHOOL_DEADLINES_WALES_LINE };
    default:
      return null;
  }
}

// --- industrial sites (M6.32, D50/D60/D62) ----------------

// The block's source name, as filed by the loader: the
// block states it once, for the whole block — the source
// carries no per-site regulator (D62).
export const INDUSTRIAL_SITES_SOURCE_NAME = "Environment Agency Pollution Inventory";

// The not-filed sentence (the D30 form, the planning
// brain's register-not-filed pattern): an absence read
// from an empty register is never served as a none.
export const INDUSTRIAL_SITES_NOT_FILED_LINE =
  "The Pollution Inventory is not filed yet, so regulated industrial sites cannot be shown for this check.";

// The not-covered sentences (D30/D31's named-gap pattern):
// the generic line travels as the block's basis, and the
// served line names the inventory that covers the home's
// nation. The names are the inventories' own published
// names, verified against the publishers' pages at build.
export const INDUSTRIAL_SITES_NOT_COVERED_BASIS =
  "The Pollution Inventory covers England only. Wales, Scotland and Northern Ireland keep their own inventories, which are not filed here.";
export const INDUSTRIAL_SITES_NOT_COVERED_WALES_LINE =
  "Wales keeps its own register, the Welsh Emissions Inventory, published by Natural Resources Wales. It is not filed here, so regulated industrial sites cannot be shown for this Welsh home.";
export const INDUSTRIAL_SITES_NOT_COVERED_SCOTLAND_LINE =
  "Scotland keeps its own register, the Scottish Pollutant Release Inventory, published by the Scottish Environment Protection Agency. It is not filed here, so regulated industrial sites cannot be shown for this Scottish home.";
export const INDUSTRIAL_SITES_NOT_COVERED_NORTHERN_IRELAND_LINE =
  "Northern Ireland keeps its own register, the Northern Ireland Pollution Inventory, published by the Northern Ireland Environment Agency. It is not filed here, so regulated industrial sites cannot be shown for this Northern Irish home.";

export type IndustrialSiteRelease = {
  substance: string;
  quantityKg: number;
  thresholdKg: number;
};

export type IndustrialSite = {
  // The permit reference serves with each site (D62).
  permitId: string;
  operator: string;
  // The filed SITE ADDRESS, verbatim — the source carries
  // no site name, so the address IS the site's identity.
  siteAddress: string;
  sitePostcode: string | null;
  activityDescription: string | null;
  sector: string | null;
  subSector: string | null;
  miles: number;
  // The quantified releases to air, largest first (the
  // site's own returns in the order a reader meets a
  // table — never a ranking across substances or sites).
  releases: IndustrialSiteRelease[];
  // The below-threshold returns' substance names,
  // alphabetical — names only, on their own labelled line.
  belowThreshold: string[];
  belowThresholdLine: string | null;
  // The site filed no air-route rows at all for the year:
  // a third state, distinct from both lists above.
  noAirReturns: boolean;
  noAirReturnsLine: string | null;
};

export type IndustrialSitesBlock = {
  state: "served" | "none-within-2-miles" | "not-filed" | "not-covered";
  dataYear: number | null;
  sourceName: string;
  sourceDate: string | null;
  // The block's basis sentence (D13): what the register
  // is, in the year form while filed; the England-only
  // sentence while not covered; null while not filed.
  basisLine: string | null;
  // The D50 labelling pair, filed states only: every
  // figure is the operator's own report, and the
  // threshold line states what below-threshold means —
  // the explainer census registers the threshold line as
  // this family's hard figure-carrying line.
  reportedLine: string | null;
  thresholdLine: string | null;
  line: string;
  sites: IndustrialSite[];
};

function industrialSitesBlock(
  facts: IndustrialSitesFacts,
  nation: string,
  latitude: number,
  longitude: number,
): IndustrialSitesBlock {
  if (nation !== "E") {
    const line =
      nation === "W"
        ? INDUSTRIAL_SITES_NOT_COVERED_WALES_LINE
        : nation === "S"
          ? INDUSTRIAL_SITES_NOT_COVERED_SCOTLAND_LINE
          : nation === "N"
            ? INDUSTRIAL_SITES_NOT_COVERED_NORTHERN_IRELAND_LINE
            : INDUSTRIAL_SITES_NOT_COVERED_BASIS;
    return {
      state: "not-covered",
      dataYear: null,
      sourceName: INDUSTRIAL_SITES_SOURCE_NAME,
      sourceDate: null,
      basisLine: INDUSTRIAL_SITES_NOT_COVERED_BASIS,
      reportedLine: null,
      thresholdLine: null,
      line,
      sites: [],
    };
  }
  if (facts.filedCount === 0 || facts.dataYear === null) {
    return {
      state: "not-filed",
      dataYear: null,
      sourceName: INDUSTRIAL_SITES_SOURCE_NAME,
      sourceDate: null,
      basisLine: null,
      reportedLine: null,
      thresholdLine: null,
      line: INDUSTRIAL_SITES_NOT_FILED_LINE,
      sites: [],
    };
  }
  const year = facts.dataYear;
  const measured = facts.sites
    .map((site) => ({
      site,
      miles: round3(haversineMiles(latitude, longitude, site.latitude, site.longitude)),
    }))
    .filter((entry) => entry.miles <= RADIUS_MILES)
    .sort((a, b) => a.miles - b.miles || a.site.permitId.localeCompare(b.site.permitId));
  const sites: IndustrialSite[] = measured.map(({ site, miles }) => {
    const releases = site.releases
      .filter((r) => !r.belowThreshold && r.quantityKg !== null)
      .map((r) => ({
        substance: r.substance,
        quantityKg: r.quantityKg as number,
        thresholdKg: r.thresholdKg,
      }))
      .sort((a, b) => b.quantityKg - a.quantityKg || a.substance.localeCompare(b.substance));
    const belowThreshold = site.releases
      .filter((r) => r.belowThreshold)
      .map((r) => r.substance)
      .sort();
    const noAirReturns = site.releases.length === 0;
    return {
      permitId: site.permitId,
      operator: site.operator,
      siteAddress: site.siteAddress,
      sitePostcode: site.sitePostcode,
      activityDescription: site.activityDescription,
      sector: site.sector,
      subSector: site.subSector,
      miles,
      releases,
      belowThreshold,
      // Semicolons between the names: the substance names
      // themselves contain commas.
      belowThresholdLine:
        belowThreshold.length > 0
          ? `Also reported for ${year}, below the reporting threshold: ${belowThreshold.join("; ")}.`
          : null,
      noAirReturns,
      noAirReturnsLine: noAirReturns
        ? `No releases to air were reported for this site for ${year}.`
        : null,
    };
  });
  return {
    state: sites.length > 0 ? "served" : "none-within-2-miles",
    dataYear: year,
    sourceName: facts.sourceName ?? INDUSTRIAL_SITES_SOURCE_NAME,
    sourceDate: facts.sourceDate,
    basisLine: `Regulated industrial sites from the Environment Agency's Pollution Inventory for ${year}: the sites the Agency permits for large industrial activities, and the releases to air their operators reported for that year.`,
    reportedLine: `Every figure is the quantity the operator reported to the Environment Agency for ${year}.`,
    thresholdLine: `Each substance also shows the reporting threshold for ${year} — the level at or above which a quantity must be reported. A substance reported below its threshold was still released; below the reporting threshold is not a measurement of zero.`,
    line:
      sites.length > 0
        ? "The regulated industrial sites recorded within two miles of this postcode point are listed below, nearest first."
        : `No regulated industrial site in the Environment Agency's Pollution Inventory for ${year} is recorded within two miles of this postcode point.`,
    sites,
  };
}

export type NearbyBundle =
  | {
      rung: 1 | 2;
      kind: "distances";
      postcode: string;
      basisLabel: string;
      categories: CategoryAnswer[];
      // One deadlines line per check (M6.22, D42), carried
      // in the full bundle only — the short bundle's school
      // headlines stay nearest-plus-count (D28). The report
      // renders this same line in its closing notes (M8).
      schoolDeadlines: SchoolDeadlines | null;
      // The industrial sites block (M6.32, D60/D62):
      // present only while INDUSTRIAL_SITES_ENABLED is on —
      // while the flag is off the key is ABSENT entirely,
      // never null (the D32 absence property).
      industrialSites?: IndustrialSitesBlock;
    }
  | {
      rung: 3;
      kind: "wider-area";
      distances: { state: "unavailable"; reason: string };
    }
  | {
      rung: 4;
      kind: "no-location";
      distances: { state: "unavailable"; reason: string };
    };

// The categories whose served places carry the location's
// overall CQC rating (M6.25): the three health categories
// the filed ratings cover. Dentists and pharmacies are
// deliberately absent — no ratings file for them.
const RATED_CATEGORIES: ReadonlySet<NearbyCategory> = new Set(["gp", "ae", "maternity"]);

type CategorySpec = {
  label: string;
  // Essential services always name the single nearest beyond
  // the radius; the What's Nearby groups and nurseries stop at
  // the radius (D22).
  essential: boolean;
  // How an empty answer is stated: an empty map group is a fact
  // about the map; an empty register extract is a fact about
  // the register. Parks are a curated national dataset, so an
  // empty parks answer is stated as a ground fact.
  emptyKind: "map" | "register" | "ground";
};

const CATEGORIES: { key: NearbyCategory; spec: CategorySpec }[] = [
  {
    key: "schools-primary",
    spec: { label: "primary schools", essential: true, emptyKind: "ground" },
  },
  {
    key: "schools-secondary",
    spec: { label: "secondary schools", essential: true, emptyKind: "ground" },
  },
  {
    key: "sixth-forms",
    // Sixth forms and colleges (M6.33, D51/D64): an
    // essential education answer in the secondary
    // family's slot — absence stated as a ground fact,
    // with the single nearest named beyond the radius
    // from the category's wider beyond pool (see
    // CATEGORY_NEAREST_SQL).
    spec: { label: "sixth forms and colleges", essential: true, emptyKind: "ground" },
  },
  { key: "nurseries", spec: { label: "nurseries", essential: false, emptyKind: "register" } },
  { key: "gp", spec: { label: "GP surgeries", essential: true, emptyKind: "ground" } },
  { key: "dentist", spec: { label: "dentists", essential: true, emptyKind: "ground" } },
  { key: "pharmacy", spec: { label: "pharmacies", essential: true, emptyKind: "ground" } },
  { key: "ae", spec: { label: "A&E hospitals", essential: true, emptyKind: "ground" } },
  { key: "maternity", spec: { label: "maternity units", essential: true, emptyKind: "ground" } },
  { key: "station", spec: { label: "stations", essential: true, emptyKind: "ground" } },
  { key: "bus-stop", spec: { label: "bus stops", essential: true, emptyKind: "ground" } },
  { key: "ev-chargers", spec: { label: "EV chargers", essential: true, emptyKind: "ground" } },
  // Supermarkets file from the same OpenStreetMap table as
  // the What's Nearby groups, so their empty answer takes
  // the map wording (M6.9, decision D30): a gap in the map
  // is not proof that none exists. The ground-truth form
  // this category carried before D30 claimed more than
  // the data holds.
  { key: "supermarket", spec: { label: "supermarkets", essential: true, emptyKind: "map" } },
  {
    key: "food-and-drink",
    spec: { label: "food and drink places", essential: false, emptyKind: "map" },
  },
  { key: "leisure", spec: { label: "leisure places", essential: false, emptyKind: "map" } },
  {
    key: "places-to-visit",
    spec: { label: "places to visit", essential: false, emptyKind: "map" },
  },
  {
    key: "places-of-worship",
    spec: { label: "places of worship", essential: false, emptyKind: "map" },
  },
  { key: "libraries", spec: { label: "libraries", essential: false, emptyKind: "map" } },
  { key: "vets", spec: { label: "vets", essential: false, emptyKind: "map" } },
  { key: "pet-shops", spec: { label: "pet shops", essential: false, emptyKind: "map" } },
  { key: "pet-boarding", spec: { label: "pet boarding", essential: false, emptyKind: "map" } },
  { key: "parks", spec: { label: "parks and greenspace", essential: false, emptyKind: "ground" } },
];

function emptyLine(key: NearbyCategory, spec: CategorySpec, countWithin: number): string {
  if (spec.emptyKind === "map")
    return `no ${spec.label} recorded within ${RADIUS_MILES} miles on the map data we hold — a gap in the map is not proof that none exists`;
  if (spec.emptyKind === "register")
    return `no nursery within ${RADIUS_MILES} miles of the postcode point in the childcare register we hold`;
  if (key === "parks")
    return countWithin > 0
      ? `no named greenspace site within ${RADIUS_MILES} miles of the postcode point`
      : `no greenspace site within ${RADIUS_MILES} miles of the postcode point`;
  return `no ${spec.label} within ${RADIUS_MILES} miles of the postcode point`;
}

// --- leavers' destinations (M6.34, D51/D65) --------------

// The not-filed line, in the house D30 form: the data is
// not filed yet, so the answer cannot be shown.
export const DESTINATIONS_NOT_FILED_LINE =
  "The destinations data is not filed yet, so leavers' destinations cannot be shown for this check.";
// The sustained definition (the step's pinned phrase):
// the D13 line every served share stands under.
export const DESTINATIONS_SUSTAINED_LINE =
  "Sustained means the student stayed in the destination for at least six months of the following school year.";

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

// "2023/24" names the cohort that finished in 2024.
function leaverYearOf(cohortYear: string): number {
  return Number(cohortYear.slice(0, 4)) + 1;
}

function publishedMonthYear(sourceDate: string): string {
  const [year, month] = sourceDate.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

function destinationsStage(
  stage: "ks4" | "ks5",
  fact: DestinationRowFact | null,
  releaseEntry: { cohortYear: string; sourceDate: string } | null,
): DestinationsStageAnswer {
  // A stage whose release entry is missing — the table
  // unfiled, or a filing that broke the loader's
  // both-or-neither contract — serves the not-filed
  // state, whatever row the join produced.
  if (releaseEntry === null) return { state: "not-filed", line: DESTINATIONS_NOT_FILED_LINE };
  if (fact === null)
    return {
      state: "no-row",
      cohortYear: releaseEntry.cohortYear,
      line: `DfE publishes no destinations row for this school for the ${releaseEntry.cohortYear} leavers`,
    };
  if (fact.state === "suppressed")
    return {
      state: "suppressed",
      cohortYear: fact.cohortYear,
      line: `DfE does not publish destination shares for this school's ${leaverYearOf(fact.cohortYear)} leavers — the cohort was too small to publish (fewer than six leavers)`,
    };
  const leaverYear = leaverYearOf(fact.cohortYear);
  return {
    state: "served",
    cohortYear: fact.cohortYear,
    cohortCount: fact.cohortCount,
    cohortLine: `The ${fact.cohortCount} students who finished ${stage === "ks4" ? "key stage 4" : "16 to 19 study"} in ${leaverYear} are the most recent cohort the Department for Education has published (published ${publishedMonthYear(releaseEntry.sourceDate)}).`,
    sustainedLine: DESTINATIONS_SUSTAINED_LINE,
    overall: fact.overall,
    education: fact.education,
    higherEducation: stage === "ks5" ? fact.higherEducation : null,
    apprenticeships: fact.apprenticeships,
    employment: fact.employment,
  };
}

function composeDestinations(
  point: NearbyPoint,
  release: DestinationsReleaseFacts,
): PlaceDestinations {
  const facts = point.destinations ?? { ks4: null, ks5: null };
  return {
    ks4: destinationsStage("ks4", facts.ks4, release.filedCount > 0 ? release.ks4 : null),
    // The KS5 stage serves only where the marker is
    // exactly true (D65 ruling 1): a false or null
    // marker carries no 16 to 19 block at all.
    ks5:
      point.sixthForm === true
        ? destinationsStage("ks5", facts.ks5, release.filedCount > 0 ? release.ks5 : null)
        : null,
  };
}

async function buildCategory(
  key: NearbyCategory,
  spec: CategorySpec,
  latitude: number,
  longitude: number,
  source: NearbyDataSource,
  destinationsRelease: DestinationsReleaseFacts,
): Promise<CategoryAnswer> {
  // The filed-count guard (D30, the flood form): absence
  // is only ever computed against a proven filing. A
  // category whose table holds nothing — its loader has
  // not filed yet — serves the not-filed state, never an
  // absence and never silence.
  if ((await source.filedCount(key)) <= 0) {
    const answer: CategoryAnswer = {
      category: key,
      label: spec.label,
      basisLabel: DISTANCE_BASIS_LABEL,
      state: "not-filed",
      places: [],
      countWithin: 0,
      beyondNearest: null,
      line: `the ${spec.label} data is not filed yet, so no ${spec.label} answer can be given yet`,
    };
    if (key === "schools-secondary") {
      answer.nearestSelective = null;
      answer.nearestSelectiveLine = null;
    }
    return answer;
  }
  const within = await source.pointsWithin(key, latitude, longitude, RADIUS_MILES);
  const measured = within
    .map((point) => ({
      point,
      raw: haversineMiles(latitude, longitude, point.latitude, point.longitude),
    }))
    .filter((m) => m.raw <= RADIUS_MILES)
    .sort((a, b) => a.raw - b.raw || (a.point.name ?? "").localeCompare(b.point.name ?? ""));
  const named = measured.filter((m) => m.point.name !== null && m.point.name !== "");
  const places: NearbyPlace[] = named.slice(0, LIST_SIZE).map((m) => {
    const place: NearbyPlace = {
      name: m.point.name as string,
      miles: round3(m.raw),
      detail: m.point.detail ?? null,
    };
    if (m.point.selective !== undefined) place.selective = m.point.selective;
    // The rating field is the health categories' own
    // (M6.25): present on every place they serve — the
    // filed rating, or null where none is filed — and
    // never set for any other category, whatever the
    // source hands over.
    if (RATED_CATEGORIES.has(key)) place.cqcRating = m.point.cqcRating ?? null;
    // The sixth-form marker is the secondary category's
    // own (M6.33, D51/D64): present on every place it
    // serves — the filed flag as filed (true, false, or
    // null) — and never set for any other category,
    // whatever the source hands over.
    if (key === "schools-secondary") {
      place.sixthForm = m.point.sixthForm ?? null;
      // The destinations block is the secondary
      // category's own (M6.34, D51/D65): the URN the
      // join stood on, and the composed block — present
      // on every place it serves, in every state
      // including not-filed — and never set for any
      // other category, whatever the source hands over.
      place.urn = m.point.urn;
      place.destinations = composeDestinations(m.point, destinationsRelease);
    }
    return place;
  });
  const answer: CategoryAnswer = {
    category: key,
    label: spec.label,
    basisLabel: DISTANCE_BASIS_LABEL,
    state: "within",
    places,
    countWithin: measured.length,
    beyondNearest: null,
    line: null,
  };
  if (key === "schools-secondary") {
    const selective = named.find((m) => m.point.selective === true);
    answer.nearestSelective = selective
      ? { name: selective.point.name as string, miles: round3(selective.raw) }
      : null;
    answer.nearestSelectiveLine = selective
      ? `the nearest selective secondary school is ${selective.point.name as string} — selective means admission by entrance test`
      : null;
  }
  if (places.length > 0) return answer;
  if (spec.essential) {
    answer.state = "none-within";
    const nearest = await source.nearestPoint(key, latitude, longitude);
    if (nearest && nearest.name !== null && nearest.name !== "") {
      const miles = round3(
        haversineMiles(latitude, longitude, nearest.latitude, nearest.longitude),
      );
      answer.beyondNearest = { name: nearest.name, miles };
      answer.line = `none within ${RADIUS_MILES} miles — nearest is ${nearest.name}, ${miles} miles away (${DISTANCE_BASIS_LABEL})`;
    } else {
      // No NAMED nearest exists to serve (the table holds
      // only unnamed points, or none near): the category
      // still owes the reader its sentence — the empty
      // line, in the category's own honesty form — never
      // silence (the prep's wordless case, closed by D30).
      answer.line = emptyLine(key, spec, measured.length);
    }
    return answer;
  }
  answer.state = spec.emptyKind === "map" ? "empty-map" : "empty";
  answer.line = emptyLine(key, spec, measured.length);
  return answer;
}

// The build's optional seams (M6.32): the industrial
// sites flag, passed explicitly by tests and the cache so
// a flip is provable without touching the checked-in
// constant. Absent, the constant in lib/site.ts governs —
// the shipped call sites pass nothing.
export interface NearbyBundleOptions {
  industrialSitesEnabled?: boolean;
}

export async function buildNearbyBundle(
  resolution: AddressResolution,
  source: NearbyDataSource,
  options: NearbyBundleOptions = {},
): Promise<NearbyBundle> {
  if (resolution.rung === 3)
    return {
      rung: 3,
      kind: "wider-area",
      distances: { state: "unavailable", reason: "distances need an exact postcode" },
    };
  if (resolution.rung === 4)
    return {
      rung: 4,
      kind: "no-location",
      distances: { state: "unavailable", reason: "distances need an exact postcode" },
    };
  const { latitude, longitude } = resolution.directory;
  const categories: CategoryAnswer[] = [];
  // The destinations release facts (M6.34) are read once
  // per bundle and composed against the secondary
  // places' filed rows inside buildCategory.
  const destinationsRelease = await source.destinationsRelease();
  for (const { key, spec } of CATEGORIES)
    categories.push(
      await buildCategory(key, spec, latitude, longitude, source, destinationsRelease),
    );
  const bundle: Extract<NearbyBundle, { kind: "distances" }> = {
    rung: resolution.rung,
    kind: "distances",
    postcode: resolution.directory.postcode,
    basisLabel: DISTANCE_BASIS_LABEL,
    categories,
    schoolDeadlines: schoolDeadlinesFor(resolution.directory.lsoaCode),
  };
  // The industrial sites block (M6.32): built only while
  // the flag is on — while it is off the key never exists
  // and the source is never read (D60/D62). The nation is
  // read from the resolution's filed area code, the
  // schoolDeadlinesFor pattern; the source is read only
  // for an English home.
  const industrialEnabled = options.industrialSitesEnabled ?? INDUSTRIAL_SITES_ENABLED;
  if (industrialEnabled) {
    const nation = (resolution.directory.lsoaCode ?? "").charAt(0);
    const facts: IndustrialSitesFacts =
      nation === "E"
        ? await source.industrialSiteFacts(latitude, longitude)
        : { filedCount: 0, dataYear: null, sourceName: null, sourceDate: null, sites: [] };
    bundle.industrialSites = industrialSitesBlock(facts, nation, latitude, longitude);
  }
  return bundle;
}

// --- the database source ----------------------------------------

// One base SELECT per category over the filed tables (the
// loaders own the filing rules; this is only the read shape).
// Every query yields name / latitude / longitude / detail /
// selective so the mapping below is uniform. The
// schools-secondary query additionally yields the filed
// sixth-form flag mapped to the marker's three values by
// a CASE over the flag's own words (M6.33, D64 ruling 7):
// any other filed value — "Not applicable", or no value
// at all — yields NULL, the marker's named absence. The three
// health queries (gp, ae, maternity) additionally yield the
// location's filed CQC rating pair (M6.25) through a LEFT
// JOIN on the loader's own filed link — cqc_ratings files
// at most one row per point (the loader files the single
// latest overall rating, or none), so the join never
// multiplies a place, and the filedCount subquery counts
// places, not ratings. The rating date casts to text in
// the query itself, so the served string is the filed
// date exactly (the sold-prices pattern) — never a parsed
// Date reformatted under a local timezone. The
// schools-secondary query additionally yields the URN and
// the school's filed destinations rows (M6.34) through two
// LEFT JOINs on school_destinations — keyed (urn, stage),
// so each join matches at most one row and never multiplies
// a place, and the filedCount subquery counts places, not
// destination rows.
const CATEGORY_SQL: Record<NearbyCategory, string> = {
  "schools-primary": `SELECT name, latitude, longitude, NULL::text AS detail,
      (admissions_policy = 'Selective') AS selective
    FROM schools WHERE phase = 'Primary' AND geom IS NOT NULL`,
  "schools-secondary": `SELECT s.name, s.latitude, s.longitude, NULL::text AS detail,
      (s.admissions_policy = 'Selective') AS selective,
      CASE s.sixth_form
        WHEN 'Has a sixth form' THEN true
        WHEN 'Does not have a sixth form' THEN false
      END AS sixth_form,
      s.urn AS urn,
      d4.cohort_year AS d4_cohort_year, d4.version AS d4_version,
      d4.cohort_count AS d4_cohort_count, d4.state AS d4_state,
      d4.overall AS d4_overall, d4.overall_low AS d4_overall_low,
      d4.education AS d4_education, d4.education_low AS d4_education_low,
      d4.higher_education AS d4_higher_education, d4.higher_education_low AS d4_higher_education_low,
      d4.apprenticeships AS d4_apprenticeships, d4.apprenticeships_low AS d4_apprenticeships_low,
      d4.employment AS d4_employment, d4.employment_low AS d4_employment_low,
      d5.cohort_year AS d5_cohort_year, d5.version AS d5_version,
      d5.cohort_count AS d5_cohort_count, d5.state AS d5_state,
      d5.overall AS d5_overall, d5.overall_low AS d5_overall_low,
      d5.education AS d5_education, d5.education_low AS d5_education_low,
      d5.higher_education AS d5_higher_education, d5.higher_education_low AS d5_higher_education_low,
      d5.apprenticeships AS d5_apprenticeships, d5.apprenticeships_low AS d5_apprenticeships_low,
      d5.employment AS d5_employment, d5.employment_low AS d5_employment_low
    FROM schools s
    LEFT JOIN school_destinations d4 ON d4.urn = s.urn AND d4.stage = 'ks4'
    LEFT JOIN school_destinations d5 ON d5.urn = s.urn AND d5.stage = 'ks5'
    WHERE s.phase = 'Secondary' AND s.geom IS NOT NULL`,
  // Sixth forms and colleges (M6.33, D51/D64): the
  // register's sixth-form evidence, mainstream only. The
  // phase clause takes every "16 plus" row — further
  // education colleges, 16-19 academies and free schools
  // (their flag mostly files "Not applicable": the phase
  // is the evidence, as NESCOT at the Minerva golden
  // proves); the flag clause takes the flagged rows of
  // every other phase except Secondary — all-through
  // schools among them — so a school the secondary list
  // serves never repeats here. The type exclusions are
  // D64's: no special-sector type (any type naming
  // "special", which also takes out 'Special post 16
  // institution'), no independent type, no British
  // schools overseas, no Welsh establishments; 'Sixth
  // form centres' file phase and flag both "Not
  // applicable", so the two clauses already leave them
  // out — ruling 8 holds by construction. The served
  // detail is the type as filed (D64 ruling 5).
  "sixth-forms": `SELECT name, latitude, longitude, school_type AS detail,
      NULL::boolean AS selective
    FROM schools
    WHERE (phase = '16 plus'
        OR (sixth_form = 'Has a sixth form' AND phase IS DISTINCT FROM 'Secondary'))
      AND school_type NOT ILIKE '%special%'
      AND school_type NOT ILIKE '%independent%'
      AND school_type <> 'British schools overseas'
      AND school_type <> 'Welsh establishment'
      AND geom IS NOT NULL`,
  nurseries: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM nurseries WHERE geom IS NOT NULL`,
  gp: `SELECT hp.name, hp.latitude, hp.longitude, NULL::text AS detail,
      NULL::boolean AS selective,
      cr.rating AS cqc_rating, cr.rating_date::text AS cqc_rating_date
    FROM health_points hp
    LEFT JOIN cqc_ratings cr ON cr.health_point_id = hp.id
    WHERE hp.service_type IN ('gp_practice', 'gp_branch_surgery') AND hp.geom IS NOT NULL`,
  dentist: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM health_points WHERE service_type = 'dentist' AND geom IS NOT NULL`,
  pharmacy: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM health_points WHERE service_type = 'pharmacy' AND geom IS NOT NULL`,
  // A&E is the nearest hospital whose emergency flag is YES —
  // the three-state flag: no-data hospitals (NULL) are never
  // counted either way (D22).
  ae: `SELECT hp.name, hp.latitude, hp.longitude, NULL::text AS detail,
      NULL::boolean AS selective,
      cr.rating AS cqc_rating, cr.rating_date::text AS cqc_rating_date
    FROM health_points hp
    LEFT JOIN cqc_ratings cr ON cr.health_point_id = hp.id
    WHERE hp.service_type = 'hospital' AND hp.has_emergency_department IS TRUE AND hp.geom IS NOT NULL`,
  // Maternity units are the hospitals whose filed ratings
  // population groups include Maternity (migration 0023) —
  // the directory's service types cannot select them. The
  // pipe-wrapping makes the membership test exact: a group
  // files only as a whole pipe-delimited member.
  maternity: `SELECT hp.name, hp.latitude, hp.longitude, NULL::text AS detail,
      NULL::boolean AS selective,
      cr.rating AS cqc_rating, cr.rating_date::text AS cqc_rating_date
    FROM health_points hp
    LEFT JOIN cqc_ratings cr ON cr.health_point_id = hp.id
    WHERE hp.service_type = 'hospital' AND hp.geom IS NOT NULL
      AND ('|' || hp.cqc_population_groups || '|') LIKE '%|Maternity|%'`,
  station: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM transport_stops WHERE stop_type IN ('RLY', 'MET', 'TMU') AND geom IS NOT NULL`,
  "bus-stop": `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM transport_stops WHERE stop_type IN ('BCT', 'BCS', 'BST') AND geom IS NOT NULL`,
  // EV answers are per SITE (the ev_points rows are sites), and
  // the site's access class is served beside its name wherever
  // it appears — a membership site is labelled, never hidden.
  "ev-chargers": `SELECT name, latitude, longitude, detail ->> 'usage_type' AS detail,
      NULL::boolean AS selective
    FROM ev_points WHERE geom IS NOT NULL`,
  supermarket: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM osm_points WHERE place_type = 'supermarket' AND geom IS NOT NULL`,
  "food-and-drink": `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM osm_points WHERE place_type = 'food_and_drink' AND geom IS NOT NULL`,
  leisure: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM osm_points WHERE place_type = 'leisure' AND geom IS NOT NULL`,
  "places-to-visit": `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM osm_points WHERE place_type = 'visit' AND geom IS NOT NULL`,
  "places-of-worship": `SELECT name, latitude, longitude, detail,
      NULL::boolean AS selective
    FROM osm_points WHERE place_type = 'worship' AND geom IS NOT NULL`,
  libraries: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM osm_points WHERE place_type = 'library' AND geom IS NOT NULL`,
  vets: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM osm_points WHERE place_type = 'vet' AND geom IS NOT NULL`,
  "pet-shops": `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM osm_points WHERE place_type = 'pet_shop' AND geom IS NOT NULL`,
  "pet-boarding": `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM osm_points WHERE place_type = 'pet_boarding' AND geom IS NOT NULL`,
  // Parks are OS Greenspace CENTRE rows only — distinct sites.
  // Access points are never served here, and neither is the OSM
  // park group (D22).
  parks: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM greenspace_points WHERE point_role = 'centre' AND geom IS NOT NULL`,
};

// Per-category overrides for the beyond read (nearestPoint),
// where the pool the beyond name may be drawn from is wider
// than the within selection. Only sixth-forms has one
// (M6.33, D64 ruling 4): the beyond pool is the within
// selection UNION the flagged secondaries — algebraically
// (phase = '16 plus' OR the flag reads "Has a sixth form"),
// under the same D64 type exclusions. The within list
// itself stays duplication-free: a flagged secondary
// serves in the secondary list and is named here only
// when it is the nearest sixth-form evidence beyond the
// radius and nothing in the within selection is.
const CATEGORY_NEAREST_SQL: Partial<Record<NearbyCategory, string>> = {
  "sixth-forms": `SELECT name, latitude, longitude, school_type AS detail,
      NULL::boolean AS selective
    FROM schools
    WHERE (phase = '16 plus' OR sixth_form = 'Has a sixth form')
      AND school_type NOT ILIKE '%special%'
      AND school_type NOT ILIKE '%independent%'
      AND school_type <> 'British schools overseas'
      AND school_type <> 'Welsh establishment'
      AND geom IS NOT NULL`,
};

function toPoint(row: Record<string, unknown>): NearbyPoint {
  const point: NearbyPoint = {
    name: typeof row.name === "string" ? row.name : null,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    detail: typeof row.detail === "string" ? row.detail : null,
  };
  if (typeof row.selective === "boolean") point.selective = row.selective;
  // The health queries yield the rating columns (null
  // across the LEFT JOIN where no rating files); every
  // other category's query does not select them, so the
  // field stays absent there by construction.
  if ("cqc_rating" in row) {
    point.cqcRating =
      typeof row.cqc_rating === "string" && row.cqc_rating !== ""
        ? {
            rating: row.cqc_rating,
            date: typeof row.cqc_rating_date === "string" ? row.cqc_rating_date : null,
          }
        : null;
  }
  // The secondary query yields the marker column (the
  // CASE's true, false, or NULL); every other category's
  // query does not select it, so the field stays absent
  // there by construction.
  if ("sixth_form" in row) {
    point.sixthForm = typeof row.sixth_form === "boolean" ? row.sixth_form : null;
  }
  // The secondary query also yields the URN and the two
  // destinations joins' columns (null across a LEFT JOIN
  // where the release files no row for the school); every
  // other category's query does not select them, so the
  // fields stay absent there by construction.
  if ("urn" in row) {
    point.urn = typeof row.urn === "string" ? row.urn : undefined;
    const share = (value: unknown, low: unknown): DestinationShareFact => ({
      value: typeof value === "number" ? value : null,
      low: low === true,
    });
    const fact = (prefix: "d4" | "d5"): DestinationRowFact | null => {
      if (typeof row[`${prefix}_state`] !== "string") return null;
      return {
        cohortYear: String(row[`${prefix}_cohort_year`]),
        version: String(row[`${prefix}_version`]),
        cohortCount: Number(row[`${prefix}_cohort_count`]),
        state: row[`${prefix}_state`] === "suppressed" ? "suppressed" : "served",
        overall: share(row[`${prefix}_overall`], row[`${prefix}_overall_low`]),
        education: share(row[`${prefix}_education`], row[`${prefix}_education_low`]),
        higherEducation: share(
          row[`${prefix}_higher_education`],
          row[`${prefix}_higher_education_low`],
        ),
        apprenticeships: share(
          row[`${prefix}_apprenticeships`],
          row[`${prefix}_apprenticeships_low`],
        ),
        employment: share(row[`${prefix}_employment`], row[`${prefix}_employment_low`]),
      };
    };
    point.destinations = { ks4: fact("d4"), ks5: fact("d5") };
  }
  return point;
}

const METRES_PER_MILE = 1609.344;

export function createNearbySource(db: AddressQueryable): NearbyDataSource {
  return {
    async filedCount(category) {
      // The count of the category's own base query — the
      // same rows pointsWithin reads, counted table-wide.
      const result = await db.query(
        `SELECT count(*)::int AS n FROM (${CATEGORY_SQL[category]}) AS category_rows`,
      );
      return Number(result.rows[0]?.n ?? 0);
    },
    async pointsWithin(category, latitude, longitude, radiusMiles) {
      // PostGIS geography distance and this module's haversine
      // (a spherical earth of radius 3,956) differ by well under
      // half a percent, so a slightly widened geography search
      // is a safe superset; the module then applies the exact
      // haversine cut itself, keeping one distance basis.
      const metres = Math.ceil(radiusMiles * METRES_PER_MILE * 1.03);
      const result = await db.query(
        `${CATEGORY_SQL[category]}
         AND ST_DWithin(geom::geography,
               ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`,
        [longitude, latitude, metres],
      );
      return result.rows.map(toPoint);
    },
    async nearestPoint(category, latitude, longitude) {
      // The sixth-forms beyond read (M6.33, D64 ruling 4)
      // draws on a wider pool than its within selection,
      // so its nearest overall can sit INSIDE the radius —
      // a flagged secondary the within list deliberately
      // does not repeat. A beyond name inside the radius
      // would contradict the line it rides on, so this
      // read takes a wider distance-ordered window and
      // keeps only points strictly beyond the radius on
      // the brain's own haversine basis.
      const beyondOnly = category === "sixth-forms";
      const result = await db.query(
        `${CATEGORY_NEAREST_SQL[category] ?? CATEGORY_SQL[category]}
         ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
         LIMIT ${beyondOnly ? 64 : 8}`,
        [longitude, latitude],
      );
      let best: NearbyPoint | null = null;
      let bestMiles = Infinity;
      for (const row of result.rows) {
        const point = toPoint(row);
        const miles = haversineMiles(latitude, longitude, point.latitude, point.longitude);
        if (beyondOnly && miles <= RADIUS_MILES) continue;
        if (miles < bestMiles) {
          bestMiles = miles;
          best = point;
        }
      }
      return best;
    },
    // The Pollution Inventory read (M6.32): the placeable
    // filed count guards the none state; the vintage and
    // its provenance ride on any filed row (one vintage is
    // held at a time — the loader swaps whole editions);
    // the sites near the point come back with their air
    // releases grouped per site, the exact haversine cut
    // applied by the brain over the widened geography
    // superset, the pointsWithin pattern. The source date
    // casts to text in the query — the filed date exactly.
    async industrialSiteFacts(latitude, longitude) {
      const filed = await db.query(
        "SELECT count(*)::int AS n FROM industrial_sites WHERE geom IS NOT NULL",
      );
      const filedCount = Number(filed.rows[0]?.n ?? 0);
      if (filedCount === 0)
        return { filedCount: 0, dataYear: null, sourceName: null, sourceDate: null, sites: [] };
      const meta = await db.query(
        "SELECT data_year, source_name, source_date::text AS source_date FROM industrial_sites LIMIT 1",
      );
      const metres = Math.ceil(RADIUS_MILES * METRES_PER_MILE * 1.03);
      const result = await db.query(
        `SELECT s.permit_id, s.operator, s.site_address, s.site_postcode,
                s.activity_description, s.sector, s.sub_sector,
                s.latitude, s.longitude,
                r.substance, r.threshold_kg, r.quantity_kg, r.below_threshold
         FROM industrial_sites s
         LEFT JOIN industrial_site_releases r ON r.permit_id = s.permit_id
         WHERE s.geom IS NOT NULL
           AND ST_DWithin(s.geom::geography,
                 ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         ORDER BY s.permit_id, r.substance`,
        [longitude, latitude, metres],
      );
      const byPermit = new Map<string, IndustrialSiteFact>();
      for (const row of result.rows) {
        const permitId = String(row.permit_id);
        let site = byPermit.get(permitId);
        if (!site) {
          site = {
            permitId,
            operator: String(row.operator),
            siteAddress: String(row.site_address),
            sitePostcode: typeof row.site_postcode === "string" ? row.site_postcode : null,
            activityDescription:
              typeof row.activity_description === "string" ? row.activity_description : null,
            sector: typeof row.sector === "string" ? row.sector : null,
            subSector: typeof row.sub_sector === "string" ? row.sub_sector : null,
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            releases: [],
          };
          byPermit.set(permitId, site);
        }
        if (typeof row.substance === "string")
          site.releases.push({
            substance: row.substance,
            quantityKg: row.quantity_kg === null ? null : Number(row.quantity_kg),
            thresholdKg: Number(row.threshold_kg),
            belowThreshold: row.below_threshold === true,
          });
      }
      return {
        filedCount,
        dataYear: typeof meta.rows[0]?.data_year === "number" ? meta.rows[0].data_year : null,
        sourceName: typeof meta.rows[0]?.source_name === "string" ? meta.rows[0].source_name : null,
        sourceDate: typeof meta.rows[0]?.source_date === "string" ? meta.rows[0].source_date : null,
        sites: [...byPermit.values()],
      };
    },
    // The destinations release read (M6.34): the filed
    // count the not-filed state stands on, and each
    // stage's cohort and publication date — the loader
    // files both stages in one swap, so a filed table
    // carries exactly one cohort per stage. The date
    // casts to text in the query — the filed date
    // exactly.
    async destinationsRelease() {
      const counted = await db.query("SELECT count(*)::int AS n FROM school_destinations");
      const filedCount = Number(counted.rows[0]?.n ?? 0);
      if (filedCount === 0) return { filedCount: 0, ks4: null, ks5: null };
      const meta = await db.query(
        `SELECT stage, cohort_year, source_date::text AS source_date
         FROM school_destinations GROUP BY stage, cohort_year, source_date`,
      );
      const facts: DestinationsReleaseFacts = { filedCount, ks4: null, ks5: null };
      for (const row of meta.rows) {
        const entry = {
          cohortYear: String(row.cohort_year),
          sourceDate: String(row.source_date),
        };
        if (row.stage === "ks4") facts.ks4 = entry;
        else if (row.stage === "ks5") facts.ks5 = entry;
      }
      return facts;
    },
  };
}
