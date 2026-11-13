-- Migration 0009 — OSM points: recorded detail
-- (plan step M5.6; added after the user-seat gap check of
-- 13 Nov 2026, gap L8 — before the first nearby load, on
-- purpose).
--
-- osm_points could hold a place's name, type and position
-- from day one, but not the one recorded fact the What's
-- Nearby worship line exists to serve: the religion AS
-- RECORDED on the place (decision D5 — "with the religion as
-- recorded", a factual directory presentation). The tag is
-- present on 95–100% of places of worship at every golden
-- home the prep measured, but migration 0001 gave the table
-- nowhere to put it.
--
-- `detail` carries the source's own string, verbatim —
-- including multi-value strings like "pagan;christian" and
-- values like "multifaith" that no fixed vocabulary would
-- hold. It is written only from the source tag, never
-- normalised and never inferred: a place of worship with no
-- religion tag files with detail NULL, and no other place
-- type carries a detail in this step. This is the same
-- lesson migrations 0007 and 0008 recorded for the shape
-- tables: a published fact cannot be retrofitted, so the
-- column lands before the first load, not after it.

ALTER TABLE osm_points
  ADD COLUMN detail text;
