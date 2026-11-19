-- Migration 0033 — the place derivation, corrected
-- (M7.15D deploy follow-up, 19 Nov 2026).
--
-- Migration 0032's initial build derived the place
-- table's districts as split_part(postcode, ' ', 1) —
-- whatever token precedes the first space — and filed
-- a (place, district) pair on any single record's
-- say-so. The play server's national filing showed
-- both faults:
--
--   * One Price Paid deed files the postcode
--     'CM92 1LX' — a postcode the directory itself
--     places in Harlow (18 live CM92 postcodes,
--     LSOA E01021840) — under the post town
--     CHELMSFORD. The pair (CHELMSFORD, CM92) was
--     offered in the dropdown as a district choice
--     for Chelmsford, leading to a district page
--     aggregating Harlow's postcodes. The district
--     has genuine directory standing and the
--     postcode satisfies the canonical grammar, so
--     neither the read model's standing test nor a
--     grammar test can see the pairing is false.
--   * Mis-keyed first tokens were filed as districts
--     in their own right ('CRO' for CR0, 'HRW',
--     'NNR6'), as was the literal postcode 'UNKNOWN'
--     one deed carries as its own district.
--
-- The corrected derivation — the one the filing
-- machinery (loaders/picking-index-filing.mjs,
-- rebuildPickingPlaces) now runs at every refresh —
-- guards both:
--
--   * The district is the outward code under the
--     canonical UK postcode grammar (the classifier's
--     own, lib/address.ts normalisePostcode): the
--     compact form must parse as outward + inward;
--     a postcode that does not parse contributes no
--     pair.
--   * A pair is filed only where the index holds
--     more than one home under the place's name in
--     the district — no single-record pairings. The
--     home itself stays in the index; only the
--     pairing is withheld.
--
-- This migration re-derives the table with the
-- corrected derivation on databases where 0032's
-- original build already ran; on a fresh database it
-- simply derives the same table twice. 0032's own
-- SQL stands as the record of the table's creation;
-- this rebuild supersedes its derivation, exactly as
-- the filing machinery's rebuild supersedes it at
-- every refresh.

DELETE FROM picking_places;

WITH per_place_town AS (
  SELECT btrim(regexp_replace(regexp_replace(upper(town), '[^A-Z0-9]+', ' ', 'g'), ' +', ' ', 'g')) AS place_norm,
         substring(regexp_replace(upper(postcode), '[^A-Z0-9]', '', 'g') from '^([A-Z]{1,2}[0-9][A-Z0-9]?)[0-9][A-Z]{2}$') AS outward,
         town,
         count(DISTINCT postcode)::int AS postcodes,
         count(*)::int AS homes
    FROM picking_index
   WHERE town IS NOT NULL
   GROUP BY 1, 2, 3
),
per_place AS (
  SELECT place_norm,
         outward,
         (array_agg(town ORDER BY postcodes DESC, town))[1] AS place_display,
         sum(postcodes)::int AS postcode_count,
         sum(homes)::int AS home_count
    FROM per_place_town
   WHERE outward IS NOT NULL
   GROUP BY place_norm, outward
)
INSERT INTO picking_places (place_norm, place_display, outward, postcode_count)
SELECT place_norm, place_display, outward, postcode_count
  FROM per_place
 WHERE place_norm <> ''
   AND home_count >= 2;
