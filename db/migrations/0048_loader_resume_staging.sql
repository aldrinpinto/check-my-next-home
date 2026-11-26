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
--   (first four, BUG-368); then the rest (BUG-368 second half):
--   health_stage, nurseries_stage (health);
--   picking_sales_stage / picking_epc_stage gain seq (migration
--   0030 created them), built_up_area_stage (picking);
--   air_stage, noise_stage, company_titles_stage,
--   company_snapshots_stage, osm_places_stage, uc_stage,
--   benefits_stage, tribunal_building_safety_stage,
--   industrial_sites_stage, industrial_site_releases_stage
--   (streamer set 2); transport_stage, schools_stage,
--   outcomes_stage, school_destinations_stage, lsoa_bases_stage,
--   imd_stage, mobile_stage, solar_stage,
--   council_tax_charges_stage (streamer set 1 — the schools,
--   outcomes and council-tax tables are spelled out explicitly
--   because the contracts test's DDL parser does not expand
--   LIKE); epc_stage, crime_stage, crime_national_stage,
--   street_lines_stage, sold_prices_legacy_stage (design);
--   phi_stage, nature_stage, heritage_listed_stage,
--   heritage_polygon_stage, greenspace_stage, ev_stage,
--   brownfield_stage, brownfield_gate_stage, planning_areas_stage,
--   article4_gate_stage, green_belt_stage, cz_stage (planning).
--   Gate tables (brownfield_gate_stage, article4_gate_stage)
--   carry no seq — the gate is re-staged fresh on every run,
--   never resumed.

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

-- BUG-368 second half: health + nurseries.
CREATE TABLE IF NOT EXISTS health_stage (
  ods_code text,
  name text,
  service_type text,
  address text,
  postcode text,
  latitude double precision,
  longitude double precision,
  parent_ods_code text,
  has_emergency_department boolean,
  cqc_service_types text,
  cqc_population_groups text,
  provider_name text,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL,
  UNIQUE (seq)
);

CREATE TABLE IF NOT EXISTS nurseries_stage (
  urn text,
  name text,
  setting_type text,
  address text,
  postcode text,
  latitude double precision,
  longitude double precision,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL,
  UNIQUE (seq)
);

-- BUG-368 second half: picking / epc-index.
-- picking_sales_stage / picking_epc_stage already exist (migration 0030,
-- UNLOGGED, no seq). The stage is scratch: its rows are already filed
-- into the extracts (or belong to a killed run that the next prepare()
-- would discard anyway), so truncate first and add the column NOT NULL.
TRUNCATE picking_sales_stage;
TRUNCATE picking_epc_stage;
ALTER TABLE picking_sales_stage ADD COLUMN seq bigint NOT NULL;
ALTER TABLE picking_epc_stage ADD COLUMN seq bigint NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS picking_sales_stage_seq_idx ON picking_sales_stage (seq);
CREATE UNIQUE INDEX IF NOT EXISTS picking_epc_stage_seq_idx ON picking_epc_stage (seq);

CREATE TABLE IF NOT EXISTS built_up_area_stage (
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

-- BUG-368 second half: streamer set 2.
CREATE TABLE IF NOT EXISTS air_stage (
  grid_ref text, year integer, no2 numeric, pm25 numeric, pm10 numeric,
  latitude double precision, longitude double precision,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE IF NOT EXISTS noise_stage (
  area_ref text, source_kind text, day_band text, night_band text,
  latitude double precision, longitude double precision,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE IF NOT EXISTS company_titles_stage (
  title_number text, dataset text, tenure text, property_address text,
  district text, county text, region text, postcode text,
  multiple_address_indicator boolean, price_paid numeric,
  proprietor_name text, company_number text, proprietorship_category text,
  country_incorporated text, date_proprietor_added date,
  additional_proprietor_indicator boolean,
  source_name text, source_date date, retrieved_at timestamptz,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE IF NOT EXISTS company_snapshots_stage (
  company_number text, company_name text, status text, incorporation_date date,
  sic_codes text[], registered_office text,
  source_name text, source_date date, retrieved_at timestamptz,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE IF NOT EXISTS osm_places_stage (
  osm_id bigint, name text, place_type text, detail text,
  latitude double precision, longitude double precision,
  source_name text, source_date date,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE IF NOT EXISTS uc_stage (
  lsoa_code text, lsoa_name text, series text, reference_month date,
  count integer, source_name text,
  seq bigint NOT NULL, UNIQUE (series, seq)
);
CREATE TABLE IF NOT EXISTS benefits_stage (
  lsoa_code text, lsoa_name text, reference_month date,
  count integer, pct numeric,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE IF NOT EXISTS tribunal_building_safety_stage (
  case_ref text, decision_date date, order_kind text, property_text text,
  postcode text, building_key text, is_single_flat boolean,
  source_url text, source_name text, source_date date,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE IF NOT EXISTS industrial_sites_stage (
  permit_id text, operator text, site_address text, site_postcode text,
  activity_description text, sector text, sub_sector text,
  easting double precision, northing double precision,
  latitude double precision, longitude double precision,
  data_year integer, source_name text, source_date date,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE IF NOT EXISTS industrial_site_releases_stage (
  permit_id text, substance text, threshold_kg double precision,
  quantity_kg double precision, below_threshold boolean, data_year integer,
  seq bigint NOT NULL, UNIQUE (seq)
);

-- BUG-368 second half: streamer set 1.
CREATE TABLE IF NOT EXISTS transport_stage (
  atco_code text, name text, stop_type text,
  latitude double precision, longitude double precision,
  source_name text, source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL, UNIQUE (seq)
);

CREATE TABLE IF NOT EXISTS school_destinations_stage (
  urn text, stage text, cohort_year text, version text, cohort_count integer,
  overall double precision, overall_low boolean, education double precision, education_low boolean,
  higher_education double precision, higher_education_low boolean,
  apprenticeships double precision, apprenticeships_low boolean,
  employment double precision, employment_low boolean,
  state text, source_name text, source_date date,
  seq bigint NOT NULL, UNIQUE (seq)
);

CREATE TABLE IF NOT EXISTS lsoa_bases_stage (
  lsoa_code text, lsoa_name text, residents integer, households integer,
  source_name text, source_date date,
  seq bigint NOT NULL, UNIQUE (seq)
);

CREATE TABLE IF NOT EXISTS imd_stage (
  lsoa_code text, lsoa_name text, stats jsonb, imd_decile integer,
  imd_summary text, source_name text, source_date date,
  seq bigint NOT NULL, UNIQUE (seq)
);

CREATE TABLE IF NOT EXISTS mobile_stage (
  laua_name text, laua_norm text PRIMARY KEY, answer jsonb,
  seq bigint NOT NULL, UNIQUE (seq)
);

CREATE TABLE IF NOT EXISTS solar_stage (
  cell_ref text, latitude double precision, longitude double precision,
  yield_kwh_per_kwp numeric, irradiation_kwh_m2 numeric,
  peak_power_kwp numeric, system_loss_pct numeric,
  slope_deg numeric, azimuth_deg numeric,
  mounting text, pv_technology text, radiation_db text,
  year_min integer, year_max integer,
  seq bigint NOT NULL, UNIQUE (seq)
);

-- The three LIKE stage tables, spelled out explicitly: the
-- contracts test's DDL parser does not expand LIKE, so a
-- LIKE-form entry here would still fail every INSERT column
-- check. These match the loaders' LIKE creates exactly
-- (INCLUDING DEFAULTS copies no PK/FK/CHECK; INCLUDING ALL
-- copies all of them — see the council-tax table below).
CREATE TABLE IF NOT EXISTS schools_stage (
  urn text, name text, school_type text, phase text,
  age_range_low integer, age_range_high integer,
  address text, postcode text,
  latitude double precision, longitude double precision,
  admissions_policy text, religious_character text,
  la_code text, la_name text, gender text, sixth_form text,
  website text, number_of_pupils integer,
  position_approximate boolean NOT NULL DEFAULT false,
  source_name text, source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL, UNIQUE (seq)
);

CREATE TABLE IF NOT EXISTS outcomes_stage (
  urn text, rating text, inspection_date date, report_url text,
  latest_event_type text, latest_event_date date,
  ungraded_outcome text, report_card jsonb,
  source_name text, source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL, UNIQUE (seq)
);

CREATE TABLE IF NOT EXISTS council_tax_charges_stage (
  billing_authority_ons_code text NOT NULL,
  authority_name text NOT NULL,
  nation text NOT NULL CHECK (nation IN ('england', 'wales')),
  tax_year text NOT NULL CHECK (tax_year ~ '^[0-9]{4}-[0-9]{2}$'),
  band_d_area_average_pence integer NOT NULL CHECK (band_d_area_average_pence > 0),
  parish_averaged boolean NOT NULL,
  billing_authority_component_pence integer CHECK (billing_authority_component_pence >= 0),
  county_component_pence integer CHECK (county_component_pence >= 0),
  police_component_pence integer CHECK (police_component_pence >= 0),
  fire_component_pence integer CHECK (fire_component_pence >= 0),
  gla_component_pence integer CHECK (gla_component_pence >= 0),
  combined_authority_component_pence integer CHECK (combined_authority_component_pence >= 0),
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL, UNIQUE (seq),
  PRIMARY KEY (billing_authority_ons_code, tax_year),
  CHECK (
    nation = 'england'
    OR (
      county_component_pence IS NULL
      AND gla_component_pence IS NULL
      AND combined_authority_component_pence IS NULL
    )
  ),
  CHECK (
    gla_component_pence IS NULL
    OR billing_authority_ons_code LIKE 'E09000%'
  ),
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

-- BUG-368 second half: design (epc, crime, streets, sold-prices legacy).
CREATE TABLE IF NOT EXISTS epc_stage (
  postcode text, answer jsonb NOT NULL, skipped integer NOT NULL DEFAULT 0,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE IF NOT EXISTS crime_stage (
  postcode text, answer jsonb NOT NULL,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE IF NOT EXISTS crime_national_stage (
  month text, england_total integer,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE IF NOT EXISTS street_lines_stage (
  osm_id bigint PRIMARY KEY, name text, highway text NOT NULL,
  geom geometry(LineString, 4326) NOT NULL,
  source_name text NOT NULL, source_date date,
  seq bigint NOT NULL, UNIQUE (seq)
);
-- Tables left by pre-resume streets runs have no seq.
ALTER TABLE street_lines_stage ADD COLUMN IF NOT EXISTS seq bigint;
CREATE TABLE IF NOT EXISTS sold_prices_legacy_stage (
  seq bigint NOT NULL, transaction_id text, postcode text, price integer,
  sale_date date, property_type text, new_build boolean, tenure text,
  paon text, saon text, street text, locality text, town text, county text,
  ppd_category text, record_status text, source_name text, source_date date,
  UNIQUE (seq)
);

-- BUG-368 second half: planning family.
CREATE TABLE phi_stage (
  constraint_type text, name text, geom geometry(MultiPolygon, 4326),
  source_reference text, organisation text, quality text, detail text,
  source_name text, source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE nature_stage (
  layer text NOT NULL,
  constraint_type text, name text, geom geometry(MultiPolygon, 4326),
  source_reference text, organisation text, quality text, detail text,
  source_name text, source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL, UNIQUE (layer, seq)
);
CREATE TABLE heritage_listed_stage (
  list_entry_id text, name text, grade text, address text, postcode text,
  latitude double precision, longitude double precision,
  source_name text, source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE heritage_polygon_stage (
  constraint_type text, name text, geom geometry(MultiPolygon, 4326),
  source_reference text, organisation text, quality text, detail text,
  source_name text, source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE greenspace_stage (
  osm_id bigint, name text, point_role text,
  latitude double precision, longitude double precision,
  source_name text, source_date date,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE ev_stage (
  registry_id text, name text, lat double precision, lon double precision,
  operator text, connector_types text, charging_speed text, detail jsonb,
  source_name text, source_date date,
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE brownfield_stage (
  reference text, organisation_entity text, site_address text,
  hectares double precision, planning_permission_status text,
  minimum_net_dwellings integer, maximum_net_dwellings integer,
  site_plan_url text, latitude double precision, longitude double precision,
  source_name text, source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE brownfield_gate_stage (
  organisation_entity text, current_sites integer,
  source_name text, source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE planning_areas_stage (
  constraint_type text, name text, geom geometry(MultiPolygon, 4326),
  source_reference text, organisation text, quality text, detail text,
  source_name text, source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE article4_gate_stage (
  organisation_entity text, current_areas integer, areas_with_geometry integer,
  source_name text, source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE green_belt_stage (
  constraint_type text, name text, geom geometry(MultiPolygon, 4326),
  source_reference text, organisation text, quality text, detail text,
  source_name text, source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL, UNIQUE (seq)
);
CREATE TABLE cz_stage (
  scheme_key text PRIMARY KEY, name text, family text, class text,
  operator text, in_force_date date, checker_url text,
  geom geometry(MultiPolygon, 4326),
  source_name text, source_date date, terms_note text,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  geom_hash text,
  seq bigint NOT NULL, UNIQUE (seq)
);
