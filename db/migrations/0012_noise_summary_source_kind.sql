-- M5.9: noise grows from road-only to the three modelled sources.
--
-- Migration 0001 designed noise_summary road-only: one day band and
-- one night band per area, no column saying which source the bands
-- describe. The founder ruled on 13 November 2026 that rail and
-- airport noise are in V1 alongside road (plan M5.9, gaps G2/G3), so
-- the table gains the source dimension the design was missing:
--
--   source_kind — 'road', 'rail' or 'airport'; every row's bands are
--   that source's published Lday/Lnight bands at the row's point.
--
-- Existing rows are road rows by construction (the column defaults
-- to 'road', which backfills them truthfully). One row per area per
-- source is the invariant the loader files to, so it is stated as a
-- unique constraint. The loader for this table is load-noise.mjs;
-- the summary design is otherwise unchanged — bands only, the raw
-- 10 m grids never enter the database.
ALTER TABLE noise_summary
  ADD COLUMN source_kind text NOT NULL DEFAULT 'road';

ALTER TABLE noise_summary
  ADD CONSTRAINT noise_summary_area_source_key UNIQUE (area_ref, source_kind);
