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
}

export type NearbyPlace = {
  name: string;
  miles: number;
  detail: string | null;
  selective?: boolean;
};

export type CategoryState = "within" | "none-within" | "empty-map" | "empty";

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
};

export type NearbyBundle =
  | {
      rung: 1 | 2;
      kind: "distances";
      postcode: string;
      basisLabel: string;
      categories: CategoryAnswer[];
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
  { key: "station", spec: { label: "stations", essential: true, emptyKind: "ground" } },
  { key: "bus-stop", spec: { label: "bus stops", essential: true, emptyKind: "ground" } },
  { key: "ev-chargers", spec: { label: "EV chargers", essential: true, emptyKind: "ground" } },
  { key: "supermarket", spec: { label: "supermarkets", essential: true, emptyKind: "ground" } },
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
  };
}

// --- the database source ----------------------------------------

// One base SELECT per category over the filed tables (the
// loaders own the filing rules; this is only the read shape).
// Every query yields name / latitude / longitude / detail /
// selective so the mapping below is uniform.
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
  gp: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM health_points
    WHERE service_type IN ('gp_practice', 'gp_branch_surgery') AND geom IS NOT NULL`,
  dentist: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM health_points WHERE service_type = 'dentist' AND geom IS NOT NULL`,
  pharmacy: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM health_points WHERE service_type = 'pharmacy' AND geom IS NOT NULL`,
  // A&E is the nearest hospital whose emergency flag is YES —
  // the three-state flag: no-data hospitals (NULL) are never
  // counted either way (D22).
  ae: `SELECT name, latitude, longitude, NULL::text AS detail,
      NULL::boolean AS selective
    FROM health_points
    WHERE service_type = 'hospital' AND has_emergency_department IS TRUE AND geom IS NOT NULL`,
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
  return point;
}

const METRES_PER_MILE = 1609.344;

export function createNearbySource(db: AddressQueryable): NearbyDataSource {
  return {
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
