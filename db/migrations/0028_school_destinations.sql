-- Check My Next Home — migration 0028: school destinations
-- (plan step M6.34, decisions D51 and D65).
--
-- Where a school's leavers went next, as the Department
-- for Education publishes it in the two Explore Education
-- Statistics destination measures (under the GOV.UK
-- umbrella "Destinations of key stage 4 and 5 students"):
-- key stage 4 leavers (the KS4 file) and 16 to 19 study
-- leavers (the 16-19 file). One row per institution per
-- stage, holding the LATEST published cohort only — the
-- product serves one cohort per school, and each new
-- release carries the older cohorts again if a future
-- step wants depth.
--
-- The row holds exactly the field set decision D65
-- settled, and no column can hold more:
--
--   * cohort_count — the leavers in the cohort, filed
--     even where every share is suppressed (the release
--     publishes it for suppressed rows).
--   * overall / education / apprenticeships / employment
--     — the sustained shares, verbatim as published (one
--     decimal). Sustained means the student stayed in
--     the destination for at least six months of the
--     following school year.
--   * higher_education — the KS5 file's higher-education
--     share; NULL on every KS4 row (the KS4 file carries
--     no such column).
--   * one `<share>_low` boolean per share: the release's
--     "low" marker (a positive share under 0.5%) files as
--     the share NULL with its flag true — a flagged
--     value, never a zero (the migration-0027
--     below-threshold pattern).
--   * state — 'served' or 'suppressed'. Where the cohort
--     was under six leavers the release suppresses every
--     share (the marker "c"); the row files as
--     'suppressed' with its cohort count and every share
--     NULL. There is no partial suppression in the
--     release, so no row mixes the two.
--
-- The release's not-sustained and not-captured remainder
-- shares are NOT filed: they are arithmetic leftovers
-- whose only readable meaning is a failure rate, and no
-- column exists that could hold one (D65). No national
-- figure and no Russell Group figure files either — the
-- 16-19 file carries no Russell Group column at all.
--
-- A school absent from a release files NOTHING: absence
-- is a serving state the brain derives from the join,
-- exactly like Ofsted's. The loader files every
-- institution in the release, including the 16-plus
-- providers the serving never shows (D65 ruling 5), and
-- swaps the whole table in one transaction (stage,
-- check, delete, insert, count), so a failed load never
-- overwrites the last good filing and the two stages
-- never serve half a release.
--
-- cohort_year is the leaver cohort as the release labels
-- it ("2023/24"); version is the cohort's version as
-- filed ("Provisional" for an October cohort, "Revised"
-- after the spring update supersedes it); source_date
-- is the release's publication date, which the serving
-- names so the publication lag stays visible.

CREATE TABLE school_destinations (
  urn text NOT NULL,
  stage text NOT NULL,
  cohort_year text NOT NULL,
  version text NOT NULL,
  cohort_count integer NOT NULL,
  overall double precision,
  overall_low boolean NOT NULL DEFAULT false,
  education double precision,
  education_low boolean NOT NULL DEFAULT false,
  higher_education double precision,
  higher_education_low boolean NOT NULL DEFAULT false,
  apprenticeships double precision,
  apprenticeships_low boolean NOT NULL DEFAULT false,
  employment double precision,
  employment_low boolean NOT NULL DEFAULT false,
  state text NOT NULL,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (urn, stage)
);
