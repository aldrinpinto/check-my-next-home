-- Migration 0004 — schools detail + Ofsted report-card shape
-- (plan step M4.6; added after the user-seat gap check of 12 Nov 2026).
--
-- The M3 schema could not hold step M4.6's own headline fact: the
-- schools shelf had no admissions-policy column, so the selective
-- flag had nowhere to live. It also lacked the register fields the
-- product filters and links on (faith character, local authority,
-- gender, sixth form, website, pupil count) and a flag for schools
-- filed at their postcode's position because the register gives
-- them no coordinates of their own.
--
-- The Ofsted shelf held exactly one rating word and one date. Since
-- November 2025 the newest inspection is often a report card (area
-- judgements, no overall grade), so the shelf now also carries the
-- newest inspection event (any framework), the ungraded outcome
-- where that is the newest evidence, and the report-card judgements
-- as published. The original rating/date columns keep their
-- meaning: the last graded (OEIF) overall effectiveness and its
-- inspection date.

ALTER TABLE schools
  ADD COLUMN admissions_policy text,
  ADD COLUMN religious_character text,
  ADD COLUMN la_code text,
  ADD COLUMN la_name text,
  ADD COLUMN gender text,
  ADD COLUMN sixth_form text,
  ADD COLUMN website text,
  ADD COLUMN number_of_pupils integer,
  ADD COLUMN position_approximate boolean NOT NULL DEFAULT false;

ALTER TABLE ofsted_outcomes
  ADD COLUMN latest_event_type text,
  ADD COLUMN latest_event_date date,
  ADD COLUMN ungraded_outcome text,
  ADD COLUMN report_card jsonb;
