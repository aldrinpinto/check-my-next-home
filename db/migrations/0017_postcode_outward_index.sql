-- Migration 0017 — an index for the wider-area (rung 3) district
-- count (plan steps M6.1 + M6.11; decision D6, ruling D20).
--
-- The brain's address resolver (lib/address.ts) answers a partial
-- postcode with the count of live postcodes in that outward district,
-- grouping postcode_cache by split_part(postcode, ' ', 1). Timed at
-- the M6.1 build against the full directory (1,810,363 live
-- postcodes, August 2026 edition, local PGlite rehearsal), that count
-- cost ~541 ms as a sequential scan — the one slow path in an
-- otherwise single-digit-millisecond resolution. This expression
-- index matches the resolver's grouping exactly, so the count reads
-- the district's index entries instead of the whole directory.
-- postcode_cache is reloaded quarterly by the M4.1 loader's upsert;
-- the index is maintained by the database like any other.

CREATE INDEX IF NOT EXISTS postcode_cache_outward_idx
  ON postcode_cache ((split_part(postcode, ' ', 1)));
