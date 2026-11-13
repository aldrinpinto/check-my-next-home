-- Migration 0013 — DWP benefits statistics + LSOA Census
-- base totals (plan step M5.16; founder rulings Q1/Q4/Q5 of
-- the M5.16 gap check, 13 Nov 2026).
--
-- benefits_stats is the series' OWN table, deliberately not
-- inside neighbourhood_stats (migration 0001): the design
-- decided it (Technical Plan Section 4E), and two measured
-- facts force the shape. The series move monthly while IMD
-- is a multi-year edition, and one filing carries TWO
-- sources with TWO different reference months (at the prep:
-- Claimant Count September 2026 beside Universal Credit
-- May 2026) — one snapshot row per LSOA with one source_date
-- cannot state both. The census precedent (migration 0011)
-- is the same rule: different cadence or different source
-- ⇒ own table.
--
-- One row per (lsoa_code, series, reference_month):
--   series ∈ uc_people | uc_households | claimant_count —
--   a closed vocabulary (the CHECK below), the three series
--   stored side by side and NEVER merged, summed or
--   combined anywhere: there is no published figure called
--   "people on benefits" and this schema cannot express one.
--   reference_month is the first of the series' own month:
--   the Claimant Count is published monthly; Universal
--   Credit data points are published QUARTERLY (second
--   Tuesday of Feb/May/Aug/Nov) and each UC series reads
--   its own latest month — the two UC series are not
--   assumed to share one.
--   count is the published count. For UC it is the figure
--   exactly as Stat-Xplore returns it: DWP applies
--   Introduced Random Error to small cells (it does NOT
--   round them to the nearest 5), so small-area UC counts
--   are approximate by the publisher's own design, and the
--   serving wording must say so.
--   pct is filed ONLY where the source publishes one: the
--   Claimant Count's percentage of residents aged 16–64,
--   to one decimal place as published. It stays NULL for
--   both UC series — DWP publishes no LSOA percentage for
--   them, and the households share the report prints is a
--   serve-time calculation on the Census base in
--   lsoa_bases below, never a filed figure. A Claimant
--   Count percentage Nomis suppresses (it withholds the
--   percentage where the underlying value is 1 or 2) also
--   files as NULL — never back-calculated.
--   The Claimant Count is never shortened to
--   "unemployment" in any label this data feeds: it is
--   ONS's count of claimants of unemployment-related
--   benefits (Jobseeker's Allowance plus Universal Credit
--   claimants required to seek work), and ONS states the
--   series is no longer a reliable indicator of the labour
--   market.
--
-- Grain is the 2021 LSOA (both publishers now publish on
-- 2021 geographies — DWP from 14 Oct 2025, Nomis from the
-- January 2026 release), England and Wales only: Scotland
-- publishes by Data Zone and Northern Ireland separately,
-- so a Scottish or NI home simply has no row and serving
-- prints the named not-covered state — never a zero.
-- Retention: the newest 13 months PER SERIES (the series'
-- clocks differ, so pruning is per series, enforced by the
-- loaders at filing time). No geometry: the join is by code
-- (postcode_cache.lsoa_code), consistent with census_stats.

CREATE TABLE benefits_stats (
  lsoa_code text NOT NULL,
  series text NOT NULL
    CHECK (series IN ('uc_people', 'uc_households', 'claimant_count')),
  reference_month date NOT NULL,
  lsoa_name text NOT NULL,
  count integer NOT NULL,
  pct numeric,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lsoa_code, series, reference_month)
);

-- lsoa_bases — the report block's stated area size (gap
-- G5): the M5.16 block names its small area AND sizes it,
-- and two of its shares divide by these bases, but the
-- Census filed at MSOA grain (migration 0011), so no loader
-- held LSOA totals until now. residents is the TS021
-- total (all usual residents) and households the TS054
-- total (all households) for the LSOA, extracted from the
-- same keyless Nomis bulk zips the census loader already
-- downloads — a static, one-off filing (Census Day,
-- 2021-03-21, is the source_date of every row).

CREATE TABLE lsoa_bases (
  lsoa_code text PRIMARY KEY,
  lsoa_name text NOT NULL,
  residents integer NOT NULL,
  households integer NOT NULL,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
