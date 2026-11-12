-- Migration 0002 — the postcode directory carries an MSOA code too.
--
-- Plan step M4.1 loads every postcode with its area codes (LSOA /
-- MSOA / council); the 0001 shelves gave postcode_cache an LSOA code
-- but no MSOA column. This adds it. Existing rows are untouched
-- (the column starts empty and the M4.1 loader fills it).

ALTER TABLE postcode_cache ADD COLUMN IF NOT EXISTS msoa_code text;
