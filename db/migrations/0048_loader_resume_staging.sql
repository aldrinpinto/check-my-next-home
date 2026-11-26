-- Migration 0048 — persistent staging and the resume checkpoint for the
-- non-flood loaders (BUG-368).
--
-- THE DEFECT (BUG-368, 26 Nov 2026): BUG-366 gave the five flood loaders
-- persistent staging + a checkpoint; every other long loader still
-- staged into a TEMP table inside one transaction spanning the whole
-- run, so a kill anywhere lost the run's progress outright and the
-- re-run started from zero.
--
-- THE FIX is the tables a resumable run needs, nothing else:
--   loader_checkpoint: one row per loader — the resume point
--     (next_start_index), the running totals, and the edition the
--     staged rows belong to, plus a state jsonb for the loader's
--     own counters (goldens seen, per-label tallies, phase).
--     expected is nullable: loaders whose total is genuinely
--     unknown until the read ends (broadband, postcodes,
--     sold-prices) resume on edition + staged-prefix alone.
--     A resume is only valid for the same edition (and the same
--     expected count, when known), with the staged rows matching
--     the checkpoint exactly; anything else is discarded and the
--     run starts from zero. The validation lives in
--     loaders/loader-resume.mjs (validateCheckpoint).
--   <loader>_stage tables: the persistent form of each wired
--     loader's TEMP table — the same columns, plus seq, the
--     row's ordinal in the staged set, dense from 0 (or 1 for
--     the sold-prices identity column). seq is what proves the
--     staged rows are the read's contiguous prefix (count n
--     with seqs summing to n(2b+n-1)/2 is exactly {b..b+n-1}).
--     Each table carries a UNIQUE (seq) unless its seq is a
--     GENERATED ALWAYS AS IDENTITY column, which is distinct
--     by construction.
--
-- BUG-248 ATOMICITY IS UNCHANGED: the live tables still change only
-- on a complete, verified swap. The swap runs in its own transaction
-- at the end of a run; a successful swap deletes the staging rows
-- and the checkpoint, so nothing is left behind. Staging is never
-- visible to the site. The staging tables hold the same rows the
-- TEMP tables held — same data, same disk — and the checkpoint is
-- one small row per loader. Staging carries no indexes beyond the
-- UNIQUE (seq) the resume proof needs: indexes are built after
-- the swap, never on staging during intake.
--
-- STAGING TABLES ADDED BY THIS MIGRATION (one per wired loader):
--   broadband_stage, price_paid_stage, onspd_stage, aqma_stage
--   (further loaders add their tables here as they are wired).

CREATE TABLE IF NOT EXISTS loader_checkpoint (
  loader text PRIMARY KEY,
  edition text NOT NULL,
  expected integer,
  next_start_index integer NOT NULL,
  read_count integer NOT NULL,
  filed_count integer NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broadband_stage (
  postcode text PRIMARY KEY,
  answer jsonb NOT NULL,
  merged boolean NOT NULL DEFAULT false,
  seq bigint NOT NULL,
  UNIQUE (seq)
);

CREATE TABLE IF NOT EXISTS price_paid_stage (
  seq bigint GENERATED ALWAYS AS IDENTITY,
  transaction_id text,
  postcode text,
  price integer,
  sale_date date,
  property_type text,
  new_build boolean,
  tenure text,
  paon text,
  saon text,
  street text,
  locality text,
  town text,
  county text,
  ppd_category text,
  record_status text,
  source_name text,
  source_date date
);

CREATE TABLE IF NOT EXISTS onspd_stage (
  postcode text PRIMARY KEY,
  latitude double precision,
  longitude double precision,
  council text,
  ward text,
  region text,
  lsoa_code text,
  msoa_code text,
  seq bigint NOT NULL,
  UNIQUE (seq)
);

CREATE TABLE IF NOT EXISTS aqma_stage (
  constraint_type text,
  name text,
  geom geometry(MultiPolygon, 4326),
  source_reference text,
  organisation text,
  quality text,
  detail text,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL,
  UNIQUE (seq)
);
