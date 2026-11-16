import type { AddressQueryable, AddressResolution } from "./address";

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
}

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

async function buildCategory(
  key: NearbyCategory,
  spec: CategorySpec,
  latitude: number,
  longitude: number,
  source: NearbyDataSource,
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

export async function buildNearbyBundle(
  resolution: AddressResolution,
  source: NearbyDataSource,
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
  for (const { key, spec } of CATEGORIES)
    categories.push(await buildCategory(key, spec, latitude, longitude, source));
  return {
    rung: resolution.rung,
    kind: "distances",
    postcode: resolution.directory.postcode,
    basisLabel: DISTANCE_BASIS_LABEL,
    categories,
    schoolDeadlines: schoolDeadlinesFor(resolution.directory.lsoaCode),
  };
}

// --- the database source ----------------------------------------

// One base SELECT per category over the filed tables (the
// loaders own the filing rules; this is only the read shape).
// Every query yields name / latitude / longitude / detail /
// selective so the mapping below is uniform. The three
// health queries (gp, ae, maternity) additionally yield the
// location's filed CQC rating pair (M6.25) through a LEFT
// JOIN on the loader's own filed link — cqc_ratings files
// at most one row per point (the loader files the single
// latest overall rating, or none), so the join never
// multiplies a place, and the filedCount subquery counts
// places, not ratings. The rating date casts to text in
// the query itself, so the served string is the filed
// date exactly (the sold-prices pattern) — never a parsed
// Date reformatted under a local timezone.
const CATEGORY_SQL: Record<NearbyCategory, string> = {
  "schools-primary": `SELECT name, latitude, longitude, NULL::text AS detail,
      (admissions_policy = 'Selective') AS selective
    FROM schools WHERE phase = 'Primary' AND geom IS NOT NULL`,
  "schools-secondary": `SELECT name, latitude, longitude, NULL::text AS detail,
      (admissions_policy = 'Selective') AS selective
    FROM schools WHERE phase = 'Secondary' AND geom IS NOT NULL`,
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
      const result = await db.query(
        `${CATEGORY_SQL[category]}
         ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
         LIMIT 8`,
        [longitude, latitude],
      );
      let best: NearbyPoint | null = null;
      let bestMiles = Infinity;
      for (const row of result.rows) {
        const point = toPoint(row);
        const miles = haversineMiles(latitude, longitude, point.latitude, point.longitude);
        if (miles < bestMiles) {
          bestMiles = miles;
          best = point;
        }
      }
      return best;
    },
  };
}
