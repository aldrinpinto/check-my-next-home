-- Migration 0014 — council tax charges (plan step M5.10;
-- founder rulings Q1–Q6 of the M5.10 gap check, 13 Nov
-- 2026, recorded as decision D16).
--
-- One row per billing authority per tax year:
--   band_d_area_average_pence is the publisher's AREA
--   Band D — the all-in average charge for the authority's
--   area (MHCLG's Table 9 Band D for England; the
--   StatsWales total for Wales), in whole pence exactly as
--   published. It is an area AVERAGE: parish (England) and
--   community (Wales) precepts are averaged into it, which
--   the parish_averaged flag states on every row it
--   touches. Serving words it "the council's average
--   Band D", never "your council tax".
--   The component columns are the precept stack — the
--   Band D element of each body whose charge makes up the
--   area figure: the billing authority itself (its own
--   element EXCLUDING parish precepts), county, police,
--   fire, GLA, combined authority. Fixed nullable columns,
--   not a JSON breakdown: the stack is a closed statutory
--   list of six roles that does not grow, and columns keep
--   the pence arithmetic, the CHECK discipline below and
--   serve-time maths in SQL. A role a body folds into
--   another's charge files as NULL (fire inside a county
--   or unitary charge; the City of London's police inside
--   the City's own), never as a borrowed figure.
--   There is deliberately NO parish component column: the
--   parish element is the difference between the area
--   figure and the components' sum, and filing it would
--   file a derived number as if published. The loader
--   asserts the identity components + parish element =
--   area Band D to the penny for every authority it files.
--   NO band columns beyond Band D exist: the other bands
--   are statutory ratios of Band D (England A 6/9 … H
--   18/9; Wales A 6/9 … I 21/9 on 2003 values), computed
--   at answer time in the brain (M6), never filed — a
--   filed ratio could drift from the filed Band D.
--   Nation is a column, not a naming convention, and the
--   CHECKs keep the nations' assumptions apart: a Welsh
--   row can never carry a county, GLA or combined-
--   authority element (Wales is unitary; there is no
--   GLA), and a GLA element can only sit on a London
--   borough code. Scotland has no rows (a different
--   system, water charges bundled into the bill) and
--   Northern Ireland has no rows (domestic rates, not
--   council tax) — serving prints their named not-covered
--   states, never a zero.
--   An authority with no row for a year is the step's
--   honest "not published" state: the seed files the
--   verified authorities only, and the once-a-year spring
--   pass extends coverage — absence is a filing fact, not
--   a data gap to paper over.
--
-- This table SUPERSEDES council_tax_rates (migration
-- 0001): an M3 placeholder keyed by council NAME, one row
-- per council for all years, a pounds-numeric charge and
-- no components, no nation, no parish flag — the wrong
-- grain for everything the check serves. Nothing ever
-- filed it from a real source (its only rows were the
-- practice seed's invented figures), so it is dropped
-- here and the seed/prove lists move with it.

CREATE TABLE council_tax_charges (
  billing_authority_ons_code text NOT NULL,
  authority_name text NOT NULL,
  nation text NOT NULL CHECK (nation IN ('england', 'wales')),
  tax_year text NOT NULL CHECK (tax_year ~ '^[0-9]{4}-[0-9]{2}$'),
  band_d_area_average_pence integer NOT NULL CHECK (band_d_area_average_pence > 0),
  parish_averaged boolean NOT NULL,
  billing_authority_component_pence integer
    CHECK (billing_authority_component_pence >= 0),
  county_component_pence integer CHECK (county_component_pence >= 0),
  police_component_pence integer CHECK (police_component_pence >= 0),
  fire_component_pence integer CHECK (fire_component_pence >= 0),
  gla_component_pence integer CHECK (gla_component_pence >= 0),
  combined_authority_component_pence integer
    CHECK (combined_authority_component_pence >= 0),
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (billing_authority_ons_code, tax_year),
  -- A Welsh row carries none of the English tier roles.
  CHECK (
    nation = 'england'
    OR (
      county_component_pence IS NULL
      AND gla_component_pence IS NULL
      AND combined_authority_component_pence IS NULL
    )
  ),
  -- The GLA precepts only on London boroughs (E09000…,
  -- the City of London included).
  CHECK (
    gla_component_pence IS NULL
    OR billing_authority_ons_code LIKE 'E09000%'
  ),
  -- The filed components never exceed the area figure:
  -- what is left over is the parish/community element.
  -- One penny of tolerance for the publishers' rounding.
  CHECK (
    COALESCE(billing_authority_component_pence, 0)
      + COALESCE(county_component_pence, 0)
      + COALESCE(police_component_pence, 0)
      + COALESCE(fire_component_pence, 0)
      + COALESCE(gla_component_pence, 0)
      + COALESCE(combined_authority_component_pence, 0)
    <= band_d_area_average_pence + 1
  )
);

DROP TABLE council_tax_rates;
