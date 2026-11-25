// The place read model (plan step M7.15D, 18 Nov
// 2026; the founder's place-search ruling the same day).
//
// Places come from HELD data only, in two halves:
//
//   * The NAMES are the picking index's town-as-filed —
//     the post towns the two registers carry (the Price
//     Paid town, the EPC register's post town filed as
//     the town) — derived into the place table
//     (migration 0032; the derivation corrected by
//     migration 0033 — the district is the postcode's
//     outward under the canonical grammar, and a pair
//     is filed only where the index holds more than
//     one home under the name, never on a single
//     record's say-so) by the same filing machinery
//     that derives the street table, at the grain
//     (place, district): a place is suggestible exactly
//     where we hold homes filed under its name, as a
//     street is
//     suggestible exactly where we hold homes on it.
//     (The postcode directory as filed carries no post
//     town — ONSPD has none to file; its part below is
//     the districts themselves.)
//   * The DISTRICTS a place offers are the districts
//     the district page actually serves in its own form.
//     The test is the district bundle's own (lib/
//     district.ts): a district stands in the served form
//     when its filed postcodes in the directory carry an
//     England or Wales LSOA code; a district whose codes
//     are Scotland / Northern Ireland only keeps the
//     not-covered rung-3 form (Phase 3 owns those
//     nations' coverage), so the place flow never offers
//     it. A place with no served district is not offered
//     at all — the plan's honesty rule, and the streets'
//     pattern: the index's sources are England & Wales,
//     so a Scottish place name is never filed in the
//     first place; this rule is the guard that keeps the
//     promise even at the borders.
//
// Two tiers, in the streets' order:
//   1. EXACT — the typed words prefix-match the place's
//      words, in order ("Chelms" finds CHELMSFORD).
//      Deterministic, explainable, no statistics.
//   2. FUZZY — Postgres pg_trgm similarity, offered
//      ONLY when the exact tier found nothing or nearly
//      nothing, and only ever AS A CHOICE: the visitor
//      picks the real place from the list, which takes
//      them to that place's page. Submitting a search
//      never applies a fuzzy match silently, and nothing
//      anywhere says "did you mean".
//
// The threshold is the streets' pinned 0.4, witnessed
// for places against the real function before the
// build (PGlite's pg_trgm, the same extension CI's
// database job proves against real Postgres in
// db/prove.mjs): the plan's witness pair CHLEMSFORD /
// CHELMSFORD — a transposition of two letters — scores
// 0.4667, while the nearest unrelated real town
// (CHELMSFORD ~ CHELTENHAM) scores 0.2222. 0.4 sits
// between them with room on both sides; it moves only
// on a witnessed case, never on a hunch.
//
// A place suggestion is the place itself: its filed
// name, and the districts it serves. Picking a place
// never lands on a home: it navigates to the place
// page, which lists the districts in full (founder
// ruling, 19 Nov 2026 — see lib/server/suggestions.ts).

import type { Pool } from "pg";

import { displayText } from "../address";
import { cleanSettlements } from "../district";

// The place source needs a pooled client for the fuzzy
// tier's transaction (set_limit is session state), so
// it takes the pool's query + connect — the same shape
// as the street source's.
export type PlaceQueryable = Pick<Pool, "query" | "connect">;

// The pinned pg_trgm similarity threshold (see the
// header for its witnesses). Exported so the database
// proof (db/prove.mjs) and this read model can never
// drift apart silently — the proof re-states the value
// it was written against and fails if they differ. It
// is deliberately the same value the street read model
// pins (STREET_FUZZY_THRESHOLD): one witnessed threshold
// for the dropdown's fuzzy choices, each tier carrying
// its own witness pair.
export const PLACE_FUZZY_THRESHOLD = 0.4;

// One place suggestion: a filed place name with the
// districts it serves (the district page's own form —
// see the header), in district order. `place` is the
// FILED form (upper case, as the sources file it);
// display casing happens at the presentation edge.
export interface PlaceSuggestion {
  place: string;
  districts: string[];
}

// One district's area facts for the place page (fix
// batch, 19 Nov 2026 — BUG-026/BUG-027): its cleaned
// settlements (the district bundle's own cleaning, so
// the two pages name the same neighbourhoods) and one
// filed postcode in it, the bridge block's example.
// BUG-317: postTown — the district's own post town,
// its most-filed town across the sales register and
// the picking index (the district head's rule, so the
// row names the district's town, never the place's).
export interface PlaceDistrictArea {
  outward: string;
  settlements: string[];
  examplePostcode: string | null;
  postTown: string | null;
}

export interface PlaceSource {
  placesByPrefix(words: string[], limit: number): Promise<PlaceSuggestion[]>;
  placesByFuzzy(words: string[], limit: number): Promise<PlaceSuggestion[]>;
  placeDistricts(placeNorm: string): Promise<string[]>;
  // The one place an exact normalised name files, with
  // its served districts — or null where the name files
  // no place, or the place's districts are all
  // not-covered. The serve layer's bare-place-name route
  // (founder fix batch): an exact name is a place pick,
  // never a fuzzy guess, so this read is exact-norm
  // equality only.
  placeByNorm(placeNorm: string): Promise<PlaceSuggestion | null>;
  // The place page's per-district area facts for a set
  // of districts, in one pass (three set reads over the
  // sales register and the picking index — the same
  // filed names the district bundle's places() read
  // composes its settlements from, at set grain so a
  // place spanning twenty districts costs one pass,
  // not twenty district builds).
  districtAreas(outwards: string[]): Promise<PlaceDistrictArea[]>;
}

// The home key's normalisation (normKeyPart in the
// filing machinery), restated for the read side: upper
// case, punctuation to spaces, runs collapsed. The
// place table's norm column is built with the same
// recipe in SQL.
export function placeNormOf(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// The served-district predicate, as SQL over one
// district (an outward code bound as a parameter): the
// district's filed postcodes in the directory carry an
// England or Wales LSOA code — the district bundle's
// own test for serving its district form. Membership
// is outward equality on the postcode's first token —
// migration 0017's expression, the same one the
// resolver's district count uses (lib/address.ts) —
// and it rides that migration's index
// (postcode_cache_outward_idx): each candidate
// district's test is a short index scan that stops at
// the first England-or-Wales row.
//
// The form this replaces — postcode LIKE outward ||
// ' %' — could never be served by any index: a LIKE
// pattern built from the row itself has no constant
// prefix for a planner to bound a scan with, so every
// candidate district paid a full sequential scan of
// the directory, its cost set by where in the heap
// the district's postcodes happen to sit (measured
// 19 Nov 2026: the same 'CHELMS%' read at 2,576 ms
// and 4,821 ms on two runs — the erratic place
// timings in the dropdown). The two forms agree on
// every row the directory can hold: an outward is
// spaceless and free of LIKE metacharacters (the
// canonical grammar, migration 0033), so first-token
// equality and the spaced-prefix LIKE can differ
// only on a postcode carrying no space at all — and
// the directory files none (census 19 Nov 2026: zero
// spaceless rows in postcode_cache; the served-
// outward sets under both forms diffed empty in both
// directions over the live directory). Measured with
// the equality form: the 'CHELMS%' read runs at
// 3.4 ms, a named place's districts at 0.6 ms,
// deterministically.
const SERVED_DISTRICT_SQL = `EXISTS (
  SELECT 1 FROM postcode_cache
   WHERE split_part(postcode, ' ', 1) = picking_places.outward
     AND (lsoa_code LIKE 'E%' OR lsoa_code LIKE 'W%')
)`;

interface PlaceUnitRow {
  place_norm: string;
  place_display: string;
  districts: string[];
}

function toUnit(row: PlaceUnitRow, counties: string[]): PlaceSuggestion {
  return {
    place: commaCountyDisplay(row.place_display, counties),
    districts: [...row.districts].sort(),
  };
}

// BUG-323: the place display's county join. The place
// table files town + county space-joined ("London
// Greater London"); the product's place form joins them
// with a comma ("London, Greater London"). The rewrite
// applies only where the display's trailing words are a
// filed county and the remainder is non-empty — longest
// county first, so "Greater London" wins over "London",
// and a town that merely ends in a county's words is
// never rewritten. A display that IS the county alone
// has no remainder and stands as filed.
function commaCountyDisplay(display: string, counties: string[]): string {
  const upper = display.toUpperCase();
  const ranked = [...counties].sort((a, b) => b.length - a.length);
  for (const county of ranked) {
    const suffix = ` ${county.toUpperCase()}`;
    if (upper.endsWith(suffix) && upper.length > suffix.length) {
      return `${display.slice(0, display.length - suffix.length)}, ${county}`;
    }
  }
  return display;
}

// The unit columns shared by both tiers: the place's
// display form and its SERVED districts only — the
// served predicate sits in each query's WHERE, so a row
// whose district is not-covered contributes nothing, a
// place left with no served district forms no group,
// and an unofferable place is never served by either
// tier.
const UNIT_COLUMNS = `
  place_norm,
  min(place_display) AS place_display,
  array_agg(outward ORDER BY outward) AS districts`;

// Every county filed anywhere in the sales register
// (BUG-034 residual, 20 Nov 2026): the shared
// settlement filter (lib/district.ts's
// cleanSettlements) drops county forms by the set it
// is handed, and districtAreas used to hand it only
// the district's own filed counties — where a
// district's sales rows file no county, the set was
// empty and the county stood as a settlement wherever
// the picking index had filed it as a town (the live
// CM11 row named "Essex" among its settlements). The
// set handed over is the district's own UNION this
// register-wide set, so a county is dropped even where
// the district itself never files it. The set is small
// and closed (the register's county column holds a
// fixed vocabulary), and price_paid carries no index
// on county, so the DISTINCT read is a register scan:
// it runs once per pool per process and is cached —
// anchored to globalThis (the sold-prices loads
// pattern) because the serving runtime does not share
// one module instance between routes, keyed by the
// pool in a WeakMap so the entry lives exactly as long
// as its pool, and a failed read evicts itself, so a
// transient failure never poisons the process.
const placeCountiesGlobal = globalThis as typeof globalThis & {
  __cmnhPlaceAllCounties?: WeakMap<PlaceQueryable, Promise<string[]>>;
};

function everyFiledCounty(db: PlaceQueryable): Promise<string[]> {
  const cache = (placeCountiesGlobal.__cmnhPlaceAllCounties ??= new WeakMap<
    PlaceQueryable,
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

export function createPlaceSource(db: PlaceQueryable): PlaceSource {
  return {
    async placesByPrefix(words, limit) {
      // The prefix pattern anchors at the place's first
      // word: each typed word must prefix-match the
      // place word in its position ("CHELMS%" matches
      // CHELMSFORD; "MILTON% KEY%" matches MILTON
      // KEYNES). The pattern is built from the
      // normalised words only — alphanumerics and
      // spaces — so no LIKE metacharacter can arrive
      // from the keyboard. The pattern index (migration
      // 0032) rides the leading literal.
      const pattern = words.map((word) => `${word}%`).join(" ");
      const counties = await everyFiledCounty(db);
      const { rows } = await db.query(
        `SELECT ${UNIT_COLUMNS}
           FROM picking_places
          WHERE ${SERVED_DISTRICT_SQL}
            AND place_norm LIKE $1
          GROUP BY place_norm
          ORDER BY place_norm
          LIMIT $2`,
        [pattern, limit],
      );
      return (rows as unknown as PlaceUnitRow[]).map((row) => toUnit(row, counties));
    },

    async placesByFuzzy(words, limit) {
      // set_limit is transaction-local state on a pooled
      // connection, so the threshold is set and the read
      // taken inside one explicit transaction — the value
      // can never leak into, or be leaked from, another
      // request's session. The % operator is the GIN
      // index's similarity predicate at the set limit;
      // the ORDER BY ranks by the same measure.
      const typed = words.join(" ");
      const counties = await everyFiledCounty(db);
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_limit($1)", [PLACE_FUZZY_THRESHOLD]);
        const { rows } = await client.query(
          `SELECT ${UNIT_COLUMNS}, similarity(place_norm, $1) AS score
             FROM picking_places
            WHERE ${SERVED_DISTRICT_SQL}
              AND place_norm % $1
            GROUP BY place_norm
            ORDER BY score DESC, place_norm
            LIMIT $2`,
          [typed, limit],
        );
        await client.query("COMMIT");
        return (rows as unknown as PlaceUnitRow[]).map((row) => toUnit(row, counties));
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async placeDistricts(placeNorm) {
      // The named place's served districts, in district
      // order. The same served test as the tiers: a
      // district the district page would answer in its
      // not-covered form is not offered.
      const { rows } = await db.query(
        `SELECT outward
           FROM picking_places
          WHERE place_norm = $1
            AND ${SERVED_DISTRICT_SQL}
          ORDER BY outward`,
        [placeNorm],
      );
      return rows.map((row) => row.outward as string);
    },

    async placeByNorm(placeNorm) {
      // The exact-name read behind the serve layer's
      // place route: the same unit columns and the same
      // served predicate as the tiers, at exact-norm
      // equality. A place left with no served district
      // forms no row here either — it is not a place the
      // product can land a visitor on.
      const counties = await everyFiledCounty(db);
      const { rows } = await db.query(
        `SELECT ${UNIT_COLUMNS}
           FROM picking_places
          WHERE ${SERVED_DISTRICT_SQL}
            AND place_norm = $1
          GROUP BY place_norm`,
        [placeNorm],
      );
      const row = (rows as unknown as PlaceUnitRow[])[0];
      return row ? toUnit(row, counties) : null;
    },

    async districtAreas(outwards) {
      if (outwards.length === 0) return [];
      // The district bundle's places() composition:
      // localities and towns as filed in the sales
      // register, towns topped up from the picking
      // index, each name carrying its filing count (the
      // shared settlement filter keeps the most-filed
      // form of a name — BUG-034), and one filed
      // postcode per locality (the smallest,
      // deterministically) for the bridge line's
      // example.
      const { rows: localityRows } = await db.query(
        `SELECT split_part(postcode, ' ', 1) AS outward, locality, count(*)::int AS filings
           FROM price_paid
          WHERE split_part(postcode, ' ', 1) = ANY($1) AND locality IS NOT NULL
          GROUP BY split_part(postcode, ' ', 1), locality`,
        [outwards],
      );
      const { rows: townRows } = await db.query(
        `SELECT split_part(postcode, ' ', 1) AS outward, town, count(*)::int AS filings
           FROM price_paid
          WHERE split_part(postcode, ' ', 1) = ANY($1) AND town IS NOT NULL
          GROUP BY split_part(postcode, ' ', 1), town`,
        [outwards],
      );
      const { rows: indexRows } = await db.query(
        `SELECT split_part(postcode, ' ', 1) AS outward, town, count(*)::int AS filings
           FROM picking_index
          WHERE split_part(postcode, ' ', 1) = ANY($1) AND town IS NOT NULL
          GROUP BY split_part(postcode, ' ', 1), town`,
        [outwards],
      );
      const { rows: exampleRows } = await db.query(
        `SELECT split_part(postcode, ' ', 1) AS outward, min(postcode) AS postcode
           FROM price_paid
          WHERE split_part(postcode, ' ', 1) = ANY($1) AND locality IS NOT NULL
          GROUP BY split_part(postcode, ' ', 1)`,
        [outwards],
      );
      // The districts' filed counties (the same rows'
      // county column): the shared settlement filter
      // drops county names and their fragments from the
      // settlement set (BUG-034), and it can only do so
      // when the caller names the counties. The set
      // handed over is each district's own UNION every
      // county filed anywhere in the register
      // (everyFiledCounty above): a district whose rows
      // file no county must not let the county through
      // (BUG-034 residual).
      const { rows: countyRows } = await db.query(
        `SELECT DISTINCT split_part(postcode, ' ', 1) AS outward, county
           FROM price_paid
          WHERE split_part(postcode, ' ', 1) = ANY($1) AND county IS NOT NULL`,
        [outwards],
      );
      const nationalCounties = await everyFiledCounty(db);
      const localities = new Map<string, Map<string, number>>();
      const towns = new Map<string, Map<string, number>>();
      const counties = new Map<string, Set<string>>();
      const addCounted = (
        map: Map<string, Map<string, number>>,
        outward: string,
        name: string | null,
        filings: number,
      ) => {
        if (!name) return;
        const byName = map.get(outward) ?? new Map<string, number>();
        byName.set(name, (byName.get(name) ?? 0) + filings);
        map.set(outward, byName);
      };
      const addTo = (map: Map<string, Set<string>>, outward: string, name: string | null) => {
        if (!name) return;
        const set = map.get(outward) ?? new Set<string>();
        set.add(name);
        map.set(outward, set);
      };
      for (const row of localityRows as unknown as {
        outward: string;
        locality: string;
        filings: number;
      }[]) {
        addCounted(localities, row.outward, row.locality, Number(row.filings));
      }
      for (const row of townRows as unknown as {
        outward: string;
        town: string;
        filings: number;
      }[]) {
        addCounted(towns, row.outward, row.town, Number(row.filings));
      }
      for (const row of indexRows as unknown as {
        outward: string;
        town: string;
        filings: number;
      }[]) {
        addCounted(towns, row.outward, row.town, Number(row.filings));
      }
      for (const row of countyRows as unknown as { outward: string; county: string | null }[]) {
        addTo(counties, row.outward, row.county);
      }
      const examples = new Map(
        (exampleRows as unknown as { outward: string; postcode: string }[]).map((row) => [
          row.outward,
          row.postcode,
        ]),
      );
      const counted = (byName: Map<string, number> | undefined) =>
        [...(byName ?? [])].map(([name, filings]) => ({ name, filings }));
      return outwards.map((outward) => {
        const local = counted(localities.get(outward));
        const settlements = cleanSettlements(
          local.length > 0 ? local : counted(towns.get(outward)),
          [...new Set([...(counties.get(outward) ?? []), ...nationalCounties])],
        );
        // BUG-317: the district's post town — its
        // most-filed town across both registers (the
        // district head's own rule), display-cased;
        // null where no town is filed at all.
        const townEntries = [...(towns.get(outward) ?? [])].sort(
          (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
        );
        const postTown = townEntries.length > 0 ? displayText(townEntries[0][0]) : null;
        return { outward, settlements, examplePostcode: examples.get(outward) ?? null, postTown };
      });
    },
  };
}
