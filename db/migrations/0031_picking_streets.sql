-- Migration 0031 — street suggestions (plan step
-- M7.15C, 18 Nov 2026; the street-suggestions prep
-- adopted in full the same day).
--
-- Two things, both in service of the search box's
-- Streets group:
--
--   1. pg_trgm — the fuzzy tier. A misspelled street
--      ("Bugdale Rise") is offered the real street as a
--      CHOICE, never a silent substitution. pg_trgm is a
--      standard contrib extension shipped in the
--      Postgres 17 image the VPS and CI both run; the
--      similarity threshold the read model pins (0.4)
--      was witnessed against the real function before
--      this build: BUGDALE RISE vs BIRKDALE RISE scores
--      0.5000, the highest unrelated pair witnessed
--      (BUGDALE RISE vs BIRKDALE ROAD) 0.2273.
--
--   2. picking_streets — the derived street table: one
--      row per (street, postcode) the picking index
--      holds homes on, with the street's town and its
--      home count. It is a BUILD PRODUCT of the picking
--      index, never a source: the shared filing
--      machinery (loaders/picking-index-filing.mjs)
--      rebuilds it inside every union rebuild, kill
--      switch included, so it can never name a street
--      the served index does not hold. This migration
--      runs the same build once, over the index as
--      filed, so a database that already carries the
--      national preload serves streets the moment the
--      migration lands; on a fresh database the index
--      is empty, the table is empty, and the first
--      filing pass builds it.
--
-- The grain carries the suggestion's honesty rules in
-- its shape: a street appears only if we hold homes on
-- it; the town rides with it because same-named streets
-- in different towns are different suggestions; a
-- street whose rows file no town carries town NULL and
-- its suggestion label falls back to the postcode.
--
-- street_norm is the home key's own normalisation
-- (upper case, punctuation to spaces, runs collapsed —
-- normKeyPart in the filing machinery), so the prefix
-- tier, the trigram tier and the ladder's street
-- matching all speak one form. town_norm is the same
-- normalisation of the town ('' when no town is filed),
-- so a (street, town) unit groups deterministically.
-- The town a (street, postcode) row carries is the
-- town its homes file most (ties break by name) — a
-- filed fact, never a guess.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE picking_streets (
  street_norm text NOT NULL,
  street_display text NOT NULL,
  town text,
  town_norm text NOT NULL,
  postcode text NOT NULL,
  home_count integer NOT NULL,
  PRIMARY KEY (street_norm, postcode)
);

-- The prefix tier rides a pattern index (LIKE with a
-- leading literal does not use the primary key's
-- collation-ordered btree); the fuzzy tier rides the
-- trigram GIN index.
CREATE INDEX picking_streets_norm_prefix_idx
  ON picking_streets (street_norm text_pattern_ops);
CREATE INDEX picking_streets_norm_trgm_idx
  ON picking_streets USING gin (street_norm gin_trgm_ops);

-- The initial build — the same SELECT the filing
-- machinery's rebuild runs (picking-index-filing.mjs);
-- the two are kept in step by the loader suites, which
-- exercise the rebuild, and by db/prove.mjs, which
-- exercises this shape against a real database.
WITH per_town AS (
  SELECT btrim(regexp_replace(regexp_replace(upper(street), '[^A-Z0-9]+', ' ', 'g'), ' +', ' ', 'g')) AS street_norm,
         postcode,
         town,
         count(*)::int AS homes,
         min(street) AS street_display
    FROM picking_index
   WHERE street IS NOT NULL
   GROUP BY 1, 2, 3
),
per_street AS (
  SELECT street_norm,
         postcode,
         min(street_display) AS street_display,
         (array_agg(town ORDER BY homes DESC, town IS NULL, town))[1] AS town,
         sum(homes)::int AS home_count
    FROM per_town
   GROUP BY street_norm, postcode
)
INSERT INTO picking_streets (street_norm, street_display, town, town_norm, postcode, home_count)
SELECT street_norm,
       street_display,
       town,
       CASE WHEN town IS NULL THEN ''
            ELSE btrim(regexp_replace(regexp_replace(upper(town), '[^A-Z0-9]+', ' ', 'g'), ' +', ' ', 'g'))
       END,
       postcode,
       home_count
  FROM per_street
 WHERE street_norm <> '';
