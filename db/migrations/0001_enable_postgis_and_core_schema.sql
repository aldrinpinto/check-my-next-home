-- Check My Next Home — migration 0001: PostGIS on + the core schema.
--
-- Plan steps M3.3 (build the shelves), M3.4 (switch on the map brain)
-- and M3.5 (version every change). The table list is the Technical
-- Plan's Section 2 list, verbatim — 20 tables. Field detail follows
-- the Technical Plan's Section 4 source notes where it gives any.
--
-- Physical decisions (the Technical Plan specifies the logical model
-- only; these are recorded here and in docs/schema.md):
--   * Everything geographic is stored in EPSG:4326 (latitude/longitude),
--     the system every source publishes in.
--   * Point tables carry latitude + longitude columns and a generated
--     PostGIS point built from them, so the two can never disagree.
--   * Shape tables (flood, planning) hold MultiPolygons in 4326;
--     loaders wrap incoming polygons with ST_Multi on load.
--   * Every geometry column gets a GiST spatial index.
--   * Every loaded dataset carries its stamp: source_name, source_date
--     and loaded_at (the load-stamp-then-swap rule, Technical Plan
--     Section 4D). Loaders load into staging and swap; these are the
--     live shelves.
--   * Points, not shapes, for places (Technical Plan Section 3): flood
--     shapes are the one shapes table, plus planning constraints.
--
-- Never stored (Technical Plan Section 2): browsing history, which
-- listings a named person viewed, portal logins, precise user location.
-- The shortlist lives in the visitor's browser only — no table.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ------------------------------------------------------------------
-- Core tables
-- ------------------------------------------------------------------

-- Saved answers per postcode, with source + dates. Also holds the
-- Postcodes.io geocode (cached forever) and, inside `answers`, the
-- cached per-postcode answers for the checks the Technical Plan gives
-- no table of their own (broadband, crime, EPC) — each answer carries
-- its own source name and data date inside the JSON.
CREATE TABLE postcode_cache (
  postcode text PRIMARY KEY,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    END
  ) STORED,
  council text,
  ward text,
  region text,
  lsoa_code text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_name text,
  source_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX postcode_cache_geom_idx ON postcode_cache USING gist (geom);
CREATE INDEX postcode_cache_lsoa_idx ON postcode_cache (lsoa_code);

-- Land Registry sales, loaded on demand per postcode (never the full
-- history file). Sold prices are kept forever; they are never called
-- a valuation anywhere in the product.
CREATE TABLE price_paid (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  postcode text NOT NULL,
  price integer NOT NULL,
  sale_date date NOT NULL,
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
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_paid_postcode_idx ON price_paid (postcode);

-- Paid-report records: delivery email, report ID, payment record.
-- The payment reference stays provider-neutral while decision D3
-- (payments) is parked.
CREATE TABLE reports (
  report_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivery_email text NOT NULL,
  postcode text NOT NULL,
  address_label text,
  status text NOT NULL DEFAULT 'pending',
  payment_reference text,
  paid_at timestamptz,
  delivered_at timestamptz
);

-- Licence keys, once payments start: a long random code is sent in
-- the payment receipt. Only the code's hash is ever stored.
CREATE TABLE licence_keys (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  report_id uuid REFERENCES reports (report_id),
  used_at timestamptz
);

-- ------------------------------------------------------------------
-- Family tables
-- ------------------------------------------------------------------

-- GIAS schools: name, URN, type, phase, age range, address,
-- coordinates. Facts only — no judgement is stored or served.
CREATE TABLE schools (
  urn text PRIMARY KEY,
  name text NOT NULL,
  school_type text,
  phase text,
  age_range_low integer,
  age_range_high integer,
  address text,
  postcode text,
  latitude double precision,
  longitude double precision,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    END
  ) STORED,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schools_geom_idx ON schools USING gist (geom);

-- Ofsted outcomes, joined to schools on URN.
CREATE TABLE ofsted_outcomes (
  urn text PRIMARY KEY REFERENCES schools (urn),
  rating text,
  inspection_date date,
  report_url text,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

-- Ofsted childcare: group settings only (childminders excluded).
CREATE TABLE nurseries (
  urn text PRIMARY KEY,
  name text NOT NULL,
  setting_type text,
  address text,
  postcode text,
  latitude double precision,
  longitude double precision,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    END
  ) STORED,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nurseries_geom_idx ON nurseries USING gist (geom);

-- NHS ODS points: GPs, dentists, pharmacies, hospitals.
CREATE TABLE health_points (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ods_code text UNIQUE,
  name text NOT NULL,
  service_type text NOT NULL,
  address text,
  postcode text,
  latitude double precision,
  longitude double precision,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    END
  ) STORED,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX health_points_geom_idx ON health_points USING gist (geom);

-- CQC ratings, matched to health points (there is no clean ODS to CQC
-- key in the sources, so the match is made by a matching pass and the
-- link can be empty until it is).
CREATE TABLE cqc_ratings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  health_point_id bigint REFERENCES health_points (id),
  cqc_location_id text,
  rating text,
  rating_date date,
  report_url text,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cqc_ratings_health_point_idx ON cqc_ratings (health_point_id);

-- Green space: centre point + access points only. The park's outline
-- shape is deliberately never stored (Technical Plan Section 3).
CREATE TABLE greenspace_points (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  osm_id bigint,
  name text,
  point_role text NOT NULL,
  latitude double precision,
  longitude double precision,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    END
  ) STORED,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX greenspace_points_geom_idx ON greenspace_points USING gist (geom);

-- OpenStreetMap places (supermarkets, vets, playgrounds, dog parks,
-- parks as a supplement): name, type, latitude and longitude only.
CREATE TABLE osm_points (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  osm_id bigint,
  name text,
  place_type text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    END
  ) STORED,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX osm_points_geom_idx ON osm_points USING gist (geom);
CREATE INDEX osm_points_type_idx ON osm_points (place_type);

-- NaPTAN stops: bus, rail, tube, tram and ferry points, each with its
-- unique AtcoCode, name, type and exact coordinates. The bus routes
-- serving each stop arrive with the BODS loader (Milestone 5).
CREATE TABLE transport_stops (
  atco_code text PRIMARY KEY,
  name text,
  stop_type text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    END
  ) STORED,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transport_stops_geom_idx ON transport_stops USING gist (geom);

-- Defra modelled air quality: one row per 1 km square per year.
CREATE TABLE air_grid (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grid_ref text NOT NULL,
  year integer NOT NULL,
  no2 numeric,
  pm25 numeric,
  pm10 numeric,
  latitude double precision,
  longitude double precision,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    END
  ) STORED,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grid_ref, year)
);
CREATE INDEX air_grid_geom_idx ON air_grid USING gist (geom);

-- Road noise: one pre-summarised daytime + night-time band per area.
-- The raw 10 m grid never enters the database.
CREATE TABLE noise_summary (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  area_ref text NOT NULL,
  day_band text,
  night_band text,
  latitude double precision,
  longitude double precision,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    END
  ) STORED,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX noise_summary_geom_idx ON noise_summary USING gist (geom);

-- Environment Agency flood shapes — the shapes table. Two layers,
-- kept separate and never merged: rivers & sea flood zones, and
-- surface water. The layer's own date is stamped on every load.
CREATE TABLE flood_layers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  layer_type text NOT NULL,
  risk_label text,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  layer_date date,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX flood_layers_geom_idx ON flood_layers USING gist (geom);
CREATE INDEX flood_layers_type_idx ON flood_layers (layer_type);

-- Planning constraints (planning.data.gov.uk) and the Section 4C
-- layers that share these tables: nature and heritage designations,
-- brownfield entries, built-up areas.
CREATE TABLE planning_layers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  constraint_type text NOT NULL,
  name text,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX planning_layers_geom_idx ON planning_layers USING gist (geom);
CREATE INDEX planning_layers_type_idx ON planning_layers (constraint_type);

-- Listed buildings (NHLE): status and grade, served on a confident
-- match only.
CREATE TABLE listed_buildings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  list_entry_id text UNIQUE,
  name text,
  grade text,
  address text,
  postcode text,
  latitude double precision,
  longitude double precision,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    END
  ) STORED,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listed_buildings_geom_idx ON listed_buildings USING gist (geom);

-- Census 2021 + IMD, one row per LSOA, no shapes. The stats JSON
-- holds counts and shares with their published base, ONS categories
-- verbatim (tenure, households with children, ethnicity, religion
-- including the not-stated share); suppressed counts stay suppressed.
-- Ethnicity and religion are served only to the paid report's
-- demographics depth — never to the panel, hooks or shortlist.
CREATE TABLE neighbourhood_stats (
  lsoa_code text PRIMARY KEY,
  lsoa_name text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  imd_decile integer,
  imd_summary text,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

-- National Chargepoint Registry points, trimmed to name, type and
-- position; connector and speed kept where the registry publishes
-- them.
CREATE TABLE ev_points (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  registry_id text UNIQUE,
  name text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    END
  ) STORED,
  connector_types text,
  charging_speed text,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ev_points_geom_idx ON ev_points USING gist (geom);

-- Each council's Band D charge, for the council tax estimate (the
-- estimated bill is the Band D charge times the band's fixed
-- fraction — the band itself comes from the check, not this table).
CREATE TABLE council_tax_rates (
  council_name text PRIMARY KEY,
  band_d_charge numeric(10, 2) NOT NULL,
  tax_year text NOT NULL,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
