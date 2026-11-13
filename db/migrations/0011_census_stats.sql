-- Migration 0011 — Census 2021 area statistics (plan step
-- M5.8; added after the user-seat gap check of 13 Nov 2026,
-- gaps G1/G2 — before the first census load, on purpose).
--
-- Census 2021 gets its OWN table, keyed by MSOA. Migration
-- 0001's neighbourhood_stats is "Census 2021 + IMD, one row
-- per LSOA" — but the plan step, both founder-approved sample
-- reports and the small-count evidence all say census files
-- at MSOA (7,264 areas, ≈8,200 residents each): at LSOA
-- grain (≈1,670 residents) the very groups the report prints
-- fall to counts of 0–3, the same size as the ONS's own
-- disclosure-control adjustments, so the report would print
-- perturbation as fact. Filing MSOA codes into a column
-- named lsoa_code would also mix two grains in one keyspace
-- and hand the confusion to M5.9's IMD load, which is
-- genuinely LSOA-only and keeps neighbourhood_stats exactly
-- as designed. The grain is confirmed by founder ruling Q2
-- (13 Nov 2026); docs/schema.md is corrected to match.
--
-- One row per MSOA (2021 boundaries, E02… / W02… codes —
-- Census 2021 covers England and Wales only; a Scottish or
-- Northern Irish postcode has no MSOA code in the postcode
-- directory, so no row can ever match it and the served
-- state is the named not-covered one, never a zero).
--
-- `stats` holds one object per dataset, COUNTS ONLY —
-- Nomis publishes counts; every percentage in the report is
-- calculated at serve time against that table's own total
-- (disclosure control makes the totals differ slightly
-- between tables: Birkdale is 8,138 residents in TS021 but
-- 8,141 in TS007A; households are 3,397 / 3,398 / 3,399
-- across TS054 / TS044 / TS052). Category keys are the
-- published labels exactly as the bulk files print them,
-- and the full published category list is filed — the
-- samples' chart groupings are presentation, applied at
-- serve time, never at load (gap G6):
--   ts007a — { total, bands: { "Aged 4 years and under": n,
--     … 18 bands … "Aged 85 years and over": n } }
--     (the age chart's table — founder ruling Q1; plain
--     TS007 is single-year ages, a different table)
--   ts007 — { total, years: [101 counts, ages 0 … 100] }
--     (single year, filed so the report's median age is
--     COMPUTED from published counts — founder ruling Q3 —
--     never interpolated from five-year bands)
--   ts021 — { total, groups: {5 group subtotals},
--     categories: {19 detailed categories} }
--   ts030 — { total, categories: {9} } ("Not answered" is a
--     published category of the voluntary religion question
--     and is filed like any other)
--   ts044 — { total, categories: {8} } (households)
--   ts052 — { total, categories: { "+2 or more": n, "+1": n,
--     "0": n, "-1": n, "-2 or less": n } } (households; the
--     bedroom occupancy rating is the ONS's own published
--     measure, not an inference)
--   ts054 — { total, categories: {12}, social_rented: n }
--     (households; social_rented duplicates the published
--     "Social rented" subtotal so the report's own-line
--     figure (M8.1(d)) is a filed fact, not a serve-time sum)
--
-- source_date is Census Day itself, 2021-03-21 — the
-- reference date of every figure, and what makes the
-- report's per-chart source/date captions true (gap G8.1).
-- No geometry: the join is by code (postcode_cache.msoa_code,
-- migration 0002), so no shapes are needed, consistent with
-- neighbourhood_stats.

CREATE TABLE census_stats (
  msoa_code text PRIMARY KEY,
  msoa_name text NOT NULL,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
