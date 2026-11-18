-- Migration 0032 — place search (plan step M7.15D,
-- 18 Nov 2026; the founder's place-search ruling the
-- same day).
--
-- picking_places — the derived place table: one row
-- per (place, district) the picking index holds homes
-- under a filed town in, carrying the place's display
-- form and the count of distinct postcodes held. It is
-- a BUILD PRODUCT of the picking index, never a
-- source: the shared filing machinery
-- (loaders/picking-index-filing.mjs) rebuilds it inside
-- every union rebuild, kill switch included, so it can
-- never name a place the served index does not hold.
-- This migration runs the same build once, over the
-- index as filed, so a database that already carries
-- the national preload serves places the moment the
-- migration lands; on a fresh database the index is
-- empty, the table is empty, and the first filing pass
-- builds it.
--
-- The grain carries the step's honesty rules in its
-- shape: a place appears only where we hold homes
-- filed under its name (the picking index's
-- town-as-filed — the post towns the Price Paid and
-- EPC registers carry; the postcode directory files no
-- post town, ONSPD having none). Whether a district is
-- OFFERED is not stored here: it is read live from the
-- directory's LSOA letters by the place read model,
-- under the district bundle's own test, so the offer
-- can never drift from the page it leads to.
--
-- place_norm is the home key's own normalisation
-- (upper case, punctuation to spaces, runs collapsed —
-- normKeyPart in the filing machinery), so the prefix
-- tier and the trigram tier speak one form. The
-- district is the postcode's outward code
-- (split_part(postcode, ' ', 1)), the same derivation
-- the wider-area resolver groups by. place_display is
-- the town form its homes file most (ties break by
-- name) — a filed fact, never a guess. The fuzzy
-- tier's extension (pg_trgm) already stands from
-- migration 0031; the CREATE is restated so this
-- migration is self-contained.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE picking_places (
  place_norm text NOT NULL,
  place_display text NOT NULL,
  outward text NOT NULL,
  postcode_count integer NOT NULL,
  PRIMARY KEY (place_norm, outward)
);

-- The prefix tier rides a pattern index (LIKE with a
-- leading literal does not use the primary key's
-- collation-ordered btree); the fuzzy tier rides the
-- trigram GIN index.
CREATE INDEX picking_places_norm_prefix_idx
  ON picking_places (place_norm text_pattern_ops);
CREATE INDEX picking_places_norm_trgm_idx
  ON picking_places USING gin (place_norm gin_trgm_ops);

-- The initial build — the same SELECT the filing
-- machinery's rebuild runs (picking-index-filing.mjs);
-- the two are kept in step by the loader suites, which
-- exercise the rebuild, and by db/prove.mjs, which
-- exercises this shape against a real database.
WITH per_place_town AS (
  SELECT btrim(regexp_replace(regexp_replace(upper(town), '[^A-Z0-9]+', ' ', 'g'), ' +', ' ', 'g')) AS place_norm,
         split_part(postcode, ' ', 1) AS outward,
         town,
         count(DISTINCT postcode)::int AS postcodes
    FROM picking_index
   WHERE town IS NOT NULL
   GROUP BY 1, 2, 3
),
per_place AS (
  SELECT place_norm,
         outward,
         (array_agg(town ORDER BY postcodes DESC, town))[1] AS place_display,
         sum(postcodes)::int AS postcode_count
    FROM per_place_town
   GROUP BY place_norm, outward
)
INSERT INTO picking_places (place_norm, place_display, outward, postcode_count)
SELECT place_norm, place_display, outward, postcode_count
  FROM per_place
 WHERE place_norm <> '';
