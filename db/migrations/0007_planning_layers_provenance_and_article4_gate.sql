-- Migration 0007 — planning layers: provenance, the Article 4
-- publication gate, and published detail
-- (plan step M5.2; added after the user-seat gap check of
-- 12 Nov 2026).
--
-- planning_layers could hold the shapes from day one, but not
-- hold them HONESTLY: it had no column for the source reference
-- (needed to dedupe and to join a shape back to its register
-- entry), none for the supplying organisation (needed for the
-- Article 4 coverage gate below), and none for the source
-- quality flag the platform publishes (authoritative / some).
-- The platform's bulk files publish only the organisation's
-- entity NUMBER — no name list is published on the files host —
-- so `organisation` files that number, exactly as published.
--
-- `detail` carries the one piece of published detail the product
-- must not drop at load: for an Article 4 area, the permitted-
-- development rights the direction removes, in the platform's
-- own codes (e.g. "1A;1C;1D;1F;2A;2B"), so the detailed report
-- can translate them into plain words later.
--
-- article4_publishers is the gate evidence for gap L1. The
-- platform's Article 4 data is a pilot fed by a small group of
-- councils (116 supply current areas in the 12 Nov 2026
-- snapshot); Newham has a borough-wide direction in force in
-- law and supplies NONE, so a data-driven "no Article 4" answer
-- there would be wrong. The planning-areas loader records, per
-- run, every organisation that demonstrably supplies current
-- Article 4 areas. Presence in this table is the only licence
-- to serve "none found" for Article 4; absence records the
-- state "not published by the council to the national dataset"
-- — never "none".

ALTER TABLE planning_layers
  ADD COLUMN source_reference text,
  ADD COLUMN organisation text,
  ADD COLUMN quality text,
  ADD COLUMN detail text;

CREATE TABLE article4_publishers (
  organisation_entity text PRIMARY KEY,
  current_areas integer NOT NULL,
  areas_with_geometry integer NOT NULL,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
