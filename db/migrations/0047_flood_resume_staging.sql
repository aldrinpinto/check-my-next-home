-- Migration 0047 — persistent flood staging and the resume checkpoint (BUG-366).
--
-- THE DEFECT (BUG-366, 26 Nov 2026): the flood-zones loader died at
-- 59% of a 5-hour read when the EA service closed the connection, and
-- the run's progress died with it. Staging was a TEMP table inside
-- one transaction spanning the whole run, so the 243,750 features
-- already read were never durable anywhere, and the re-run had to
-- start from zero. There was no checkpoint to resume from.
--
-- THE FIX is the tables a resumable run needs, nothing else:
--   flood_stage: the three OGC polygon loaders' staging (zones,
--     rivers & sea, surface water) — one table, layer_type
--     discriminates. seq is a staged row's ordinal in the read,
--     unique per layer, so re-staging a page the run already
--     flushed is a no-op (ON CONFLICT DO NOTHING).
--   flood_climate_stage: the two climate loaders' staging, the
--     same shape, filing into flood_climate_layers.
--   flood_defences_stage: the defences loader's staging, the same
--     columns its TEMP table carried, plus layer_type (the one
--     layer this table ever holds, 'flood_defences' — it lets the
--     shared resume helpers filter this table exactly as they
--     filter the other two) and seq (the row's ordinal in the
--     file stream).
--   flood_loader_checkpoint: one row per loader — the resume point
--     (next_start_index), the running totals, and the edition the
--     staged rows belong to. A resume is only valid for the same
--     edition and the same service count, with the staged rows
--     matching the checkpoint exactly; anything else is discarded
--     and the run starts from zero.
--
-- BUG-248 ATOMICITY IS UNCHANGED: the live tables still change only
-- on a complete, verified swap. The swap runs in its own transaction
-- at the end of a run; a successful swap deletes the staging rows
-- and the checkpoint, so nothing is left behind. Staging is never
-- visible to the site. The staging tables hold the same rows the
-- TEMP tables held — same data, same disk — and the checkpoint is
-- one small row per loader.

CREATE TABLE IF NOT EXISTS flood_stage (
  layer_type text NOT NULL,
  risk_label text,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  layer_date date,
  detail text,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL,
  UNIQUE (layer_type, seq)
);
CREATE INDEX IF NOT EXISTS flood_stage_layer_idx ON flood_stage (layer_type);

CREATE TABLE IF NOT EXISTS flood_climate_stage (
  layer_type text NOT NULL,
  risk_label text,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  layer_date date,
  detail text,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL,
  UNIQUE (layer_type, seq)
);
CREATE INDEX IF NOT EXISTS flood_climate_stage_layer_idx ON flood_climate_stage (layer_type);

CREATE TABLE IF NOT EXISTS flood_defences_stage (
  layer_type text NOT NULL,
  asset_id text,
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
  wkt text,
  seq bigint NOT NULL,
  UNIQUE (layer_type, seq)
);

CREATE TABLE IF NOT EXISTS flood_loader_checkpoint (
  loader text PRIMARY KEY,
  layer_type text NOT NULL,
  edition text NOT NULL,
  expected integer NOT NULL,
  next_start_index integer NOT NULL,
  read_count integer NOT NULL,
  filed_count integer NOT NULL,
  geoless_count integer NOT NULL,
  per_label jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
