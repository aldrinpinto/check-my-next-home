// The place read model (plan step M7.15D, 18 Nov
// 2026; the founder's place-search ruling the same day).
//
// Places come from HELD data only, in two halves:
//
//   * The NAMES are the picking index's town-as-filed —
//     the post towns the two registers carry (the Price
//     Paid town, the EPC register's post town filed as
//     the town) — derived into the place table
//     (migration 0032) by the same filing machinery that
//     derives the street table, at the grain (place,
//     district): a place is suggestible exactly where we
//     hold homes filed under its name, as a street is
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
//      picks the real place from the list, which files
//      its name into the field; the districts then
//      expand from the real name. Submitting a search
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
// name, and (for the expansion test in the suggestions
// read model) the districts it serves. Picking a place
// never lands on a home and never leaves the dropdown:
// the districts ride the same panel (see
// lib/server/suggestions.ts).

import type { Pool } from "pg";

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

export interface PlaceSource {
  placesByPrefix(words: string[], limit: number): Promise<PlaceSuggestion[]>;
  placesByFuzzy(words: string[], limit: number): Promise<PlaceSuggestion[]>;
  placeDistricts(placeNorm: string): Promise<string[]>;
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
// own test for serving its district form. The postcode
// prefix rides the directory's primary key.
const SERVED_DISTRICT_SQL = `EXISTS (
  SELECT 1 FROM postcode_cache
   WHERE postcode LIKE picking_places.outward || ' %'
     AND (lsoa_code LIKE 'E%' OR lsoa_code LIKE 'W%')
)`;

interface PlaceUnitRow {
  place_norm: string;
  place_display: string;
  districts: string[];
}

function toUnit(row: PlaceUnitRow): PlaceSuggestion {
  return { place: row.place_display, districts: [...row.districts].sort() };
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
      return (rows as unknown as PlaceUnitRow[]).map(toUnit);
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
        return (rows as unknown as PlaceUnitRow[]).map(toUnit);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async placeDistricts(placeNorm) {
      // The named place's served districts, in district
      // order — the expansion the dropdown shows under
      // "Districts in <Place>". The same served test as
      // the tiers: a district the district page would
      // answer in its not-covered form is not offered.
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
  };
}
