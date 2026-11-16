-- Migration 0021 — England crime totals by month (plan step
-- M6.20, decision D39).
--
-- The numerator of the crime answer's England calibration
-- figure. D39 sets this circle's per-head figure against
-- England's for the same 12-month window, computed the same
-- way from the same data — and no England total was filed
-- anywhere: the crime loader files only the postcodes
-- somebody checks, and Police.uk publishes no API total.
-- The honest source is Police.uk's own monthly archive
-- (the same street-level dataset the API serves, one zip
-- per month), stream-counted on the E01 LSOA prefix —
-- geographically consistent with the denominator, the
-- Census 2021 residents summed over the E01 rows of
-- lsoa_bases (migration 0013): 56,490,108.
--
-- One row per published month, counted once, ever, from
-- its archive: the filed rows ARE the backfill's resume
-- state (the loader counts only months with no row, so a
-- 12-month first fill interrupted at month 7 resumes at
-- month 8). The loader is load-crime-national (monthly
-- class, D19 family). It also embeds the window figure
-- into filed crime artefacts (postcode_cache.answers ->
-- "crime" -> "national") once every month of an artefact's
-- window is on file here; the brain itself never reads
-- this table — it stays a pure artefact read (D24's
-- architecture), and the artefact-md5 cache guard (D29)
-- busts a bundle when an embedding lands.
--
-- england_total counts street-level records whose LSOA
-- code begins E01 (England's 2021 LSOAs), British
-- Transport Police records included — the same species of
-- count as the circles'. Rows are never updated: a month
-- is counted from the archive as published; Police.uk's
-- later corrections arrive inside later months' files,
-- not as rewrites of closed ones.

CREATE TABLE crime_national_months (
  month text PRIMARY KEY,
  england_total integer NOT NULL,
  source_name text NOT NULL,
  source_date text NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
