-- Check My Next Home — migration 0024: recorded flood
-- defences (plan step M6.27, decisions D49 and D54).
--
-- The Environment Agency's AIMS Spatial Flood Defences
-- (Approval for Access product AfA345, Open Government
-- Licence): the register of flood defence ASSETS the Agency
-- owns, manages or inspects — embankments, walls, engineered
-- and natural high ground, gates and the rest. One row per
-- recorded asset, filed whole from the national GeoPackage
-- by load-flood-defences and swapped entire each edition:
-- the table is single-edition, like flood_layers, so a failed
-- load never overwrites the last good filing.
--
-- Properties of the source that decide the schema:
--
--   * Every feature is a MultiLineString in British National
--     Grid (EPSG:27700); the loader transforms to EPSG:4326
--     with the house proj4 definition (the towgs84 shift
--     applied per vertex) and files the line as published.
--     NO ST_MakeValid is applied — deliberately, and unlike
--     the flood polygon loaders: a line has no area semantics,
--     MakeValid can move or split a published line, and the
--     serving read needs only ST_Distance plus the GiST
--     index. Lines that fail ST_IsValid are counted in the
--     loader's log line, never dropped and never repaired.
--   * asset_id is the publisher's stable key (unique, never
--     null in the measured file) and files as text.
--   * asset_name is 'Not Available' on every measured row —
--     the column files as published; the brain maps the
--     placeholder to its named absence at serve time.
--   * The maintainer and operator columns are closed
--     publisher categories (10 and 9 values in the measured
--     file). The loader enforces them fail-closed: an
--     out-of-vocabulary value fails the run and files
--     nothing, so no person's name can ever be filed here —
--     the categories are all that can exist in this table.
--   * current_condition is the Agency's TEXT grade code
--     ('0'–'5'), with '' the dominant filed state (no grade
--     recorded) — '' is distinct from the recorded grade
--     '0' (Unchecked) and from NULL, and all three file as
--     published.
--   * design_sop is populated on most rows; current_sop on
--     very few (~3.4% measured). last_inspection_date files
--     (D54) but is NOT served in V1 — the brain's read port
--     does not carry it.

CREATE TABLE flood_defences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id text NOT NULL,
  asset_name text,
  asset_sub_type text,
  protection_type text,
  asset_maintainer text,
  asset_operator text,
  current_condition text,
  design_sop integer,
  design_sop_dqf text,
  current_sop integer,
  water_course_name text,
  last_inspection_date date,
  geom geometry(MultiLineString, 4326),
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flood_defences_geom_idx ON flood_defences USING gist (geom);
