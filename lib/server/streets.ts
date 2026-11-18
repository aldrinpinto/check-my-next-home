// The street read model (plan step M7.15C, 18 Nov
// 2026; the street-suggestions prep adopted in full).
//
// Streets come from HELD data only: the derived street
// table (migration 0031), which the picking loaders
// rebuild from the picking index on every filing pass.
// A street is suggestible exactly when we hold homes on
// it — the suggestion can therefore never promise a
// check we cannot serve. The index holds England &
// Wales data only (the sales and EPC sources are
// England & Wales), so Scotland and Northern Ireland
// streets honestly return nothing: no group, no
// near-miss from another nation.
//
// Two tiers, in the prep's order:
//   1. EXACT — the typed words prefix-match the street's
//      words, in order ("Birkdale" finds BIRKDALE RISE;
//      "Birkdale Rise" finds it too). Deterministic,
//      explainable, no statistics.
//   2. FUZZY — Postgres pg_trgm similarity, offered
//      ONLY when the exact tier found nothing or nearly
//      nothing, and only ever AS A CHOICE: the visitor
//      picks the real street from the list. Submitting a
//      search never applies a fuzzy match silently, and
//      nothing anywhere says "did you mean".
//
// The threshold is pinned at 0.4, witnessed against the
// real function before the build (PGlite's pg_trgm, the
// same extension CI's database job proves against real
// Postgres in db/prove.mjs): the prep's witness pair
// BUGDALE RISE / BIRKDALE RISE scores 0.5000 — a
// one-letter substitution in a two-word street — while
// the highest unrelated pair witnessed (BUGDALE RISE /
// BIRKDALE ROAD) scores 0.2273. 0.4 sits between them
// with room on both sides; it moves only on a witnessed
// case, never on a hunch.
//
// A street suggestion is a (street, town) UNIT: the
// same street name in two towns is two suggestions.
// Behind a unit ride the postcodes it spans — one
// postcode routes straight to that postcode's check
// narrowed to the street; several route to the short
// postcode choice. A street pick never lands on a home.

import type { Pool } from "pg";

// The street source needs a pooled client for the
// fuzzy tier's transaction (set_limit is session
// state), so it takes the pool's query + connect — the
// callers pass the app's pool, as the suggestion
// source's composition does.
export type StreetQueryable = Pick<Pool, "query" | "connect">;

// The pinned pg_trgm similarity threshold (see the
// header for its witnesses). Exported so the database
// proof (db/prove.mjs) and this read model can never
// drift apart silently — the proof re-states the value
// it was written against and fails if they differ.
export const STREET_FUZZY_THRESHOLD = 0.4;

// One street suggestion unit: a street in a town, with
// every postcode it spans and its total home count.
// `street` and `town` are the FILED forms (upper case,
// as the sources file them); display casing happens at
// the presentation edge. `town` is null when no home on
// the street files one — the label then falls back to
// the postcode (the prep's rule).
export interface StreetSuggestion {
  street: string;
  town: string | null;
  postcodes: string[];
  homes: number;
}

// One postcode a street spans, with the street's town
// there and its home count — the choice page's rows,
// served biggest first (the street's centre of gravity
// leads), postcode order breaking ties.
export interface StreetPostcodeRow {
  postcode: string;
  town: string | null;
  street: string;
  homes: number;
}

export interface StreetSource {
  streetsByPrefix(words: string[], limit: number): Promise<StreetSuggestion[]>;
  streetsByFuzzy(words: string[], limit: number): Promise<StreetSuggestion[]>;
  streetPostcodes(streetNorm: string, townNorm: string): Promise<StreetPostcodeRow[]>;
}

// The home key's normalisation (normKeyPart in the
// filing machinery), restated for the read side: upper
// case, punctuation to spaces, runs collapsed. The
// street table's norm columns are built with the same
// recipe in SQL.
export function streetNormOf(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

interface StreetUnitRow {
  street_norm: string;
  street_display: string;
  town: string | null;
  town_norm: string;
  postcodes: string[];
  homes: number | string;
}

function toUnit(row: StreetUnitRow): StreetSuggestion {
  return {
    street: row.street_display,
    town: row.town,
    postcodes: [...row.postcodes].sort(),
    homes: Number(row.homes),
  };
}

const UNIT_COLUMNS = `
  street_norm,
  min(street_display) AS street_display,
  (array_agg(town ORDER BY home_count DESC, town IS NULL, town))[1] AS town,
  town_norm,
  array_agg(postcode ORDER BY postcode) AS postcodes,
  sum(home_count)::int AS homes`;

export function createStreetSource(db: StreetQueryable): StreetSource {
  return {
    async streetsByPrefix(words, limit) {
      // The prefix pattern anchors at the street's first
      // word: each typed word must prefix-match the
      // street word in its position ("BIRK% RI%" matches
      // BIRKDALE RISE). The pattern is built from the
      // normalised words only — alphanumerics and spaces
      // — so no LIKE metacharacter can arrive from the
      // keyboard. The pattern index (migration 0031)
      // rides the leading literal.
      const pattern = words.map((word) => `${word}%`).join(" ");
      const { rows } = await db.query(
        `SELECT ${UNIT_COLUMNS}
           FROM picking_streets
          WHERE street_norm LIKE $1
          GROUP BY street_norm, town_norm
          ORDER BY street_norm, town_norm
          LIMIT $2`,
        [pattern, limit],
      );
      return (rows as unknown as StreetUnitRow[]).map(toUnit);
    },

    async streetsByFuzzy(words, limit) {
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
        await client.query("SELECT set_limit($1)", [STREET_FUZZY_THRESHOLD]);
        const { rows } = await client.query(
          `SELECT ${UNIT_COLUMNS}, similarity(street_norm, $1) AS score
             FROM picking_streets
            WHERE street_norm % $1
            GROUP BY street_norm, town_norm
            ORDER BY score DESC, street_norm, town_norm
            LIMIT $2`,
          [typed, limit],
        );
        await client.query("COMMIT");
        return (rows as unknown as StreetUnitRow[]).map(toUnit);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async streetPostcodes(streetNorm, townNorm) {
      const { rows } = await db.query(
        `SELECT postcode, town, street_display AS street, home_count AS homes
           FROM picking_streets
          WHERE street_norm = $1 AND town_norm = $2
          ORDER BY home_count DESC, postcode
          LIMIT 50`,
        [streetNorm, townNorm],
      );
      return rows as unknown as StreetPostcodeRow[];
    },
  };
}
