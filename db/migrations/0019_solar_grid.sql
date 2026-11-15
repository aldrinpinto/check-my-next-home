-- Migration 0019 — PVGIS solar grid (plan step M5.18; the
-- filing behind decision D26's solar section in M6.6).
--
-- PVGIS (European Commission Joint Research Centre) publishes
-- no downloadable PV-yield grid: the JRC geospatial downloads
-- are the first-generation PVGIS-SARAH long-term-average
-- irradiance grids (2005–2016, ESRI ascii), and the current
-- database, PVGIS-SARAH3 (2005–2023), is served only through
-- the PVGIS calculation API, one point at a time. Calling
-- that API once per postcode (~1.8M) is not a national route.
-- So the loader builds the grid the source supports: it
-- samples the PVGIS PVcalc API once per 0.1° cell that the
-- filed postcode directory actually populates, at the cell
-- centre, on ONE named standard basis, and files the cells
-- here — the air_grid pattern (migration 0001) applied to a
-- sampled grid instead of a published one. Serving (M6.6)
-- reads the cell containing the postcode point and names the
-- grain: a location fact, never the home's roof or yield.
--
-- One row per cell. The standard basis is filed PER ROW, from
-- the API response itself — peak power, system loss, slope,
-- azimuth, mounting, module technology, the radiation
-- database name and its year span — so the served words can
-- name the basis from filed data alone, and a future basis
-- change files as visibly different rows, never as a silent
-- reinterpretation of old ones.
--
-- yield_kwh_per_kwp is the API's annual total E_y for a
-- 1 kWp system (kWh per kWp per year); irradiation_kwh_m2
-- is H(i)_y, the annual in-plane irradiation on the standard
-- basis's plane that the yield derives from (kWh/m² per
-- year). Values file at the API's published precision.
--
-- source_date is the radiation vintage's last year end
-- (PVGIS-SARAH3 spans 2005–2023, so 2023-12-31) — the stamp
-- pattern the air grid uses for its modelled year.

CREATE TABLE solar_grid (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cell_ref text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  yield_kwh_per_kwp numeric NOT NULL,
  irradiation_kwh_m2 numeric NOT NULL,
  peak_power_kwp numeric NOT NULL,
  system_loss_pct numeric NOT NULL,
  slope_deg numeric NOT NULL,
  azimuth_deg numeric NOT NULL,
  mounting text NOT NULL,
  pv_technology text NOT NULL,
  radiation_db text NOT NULL,
  year_min integer NOT NULL,
  year_max integer NOT NULL,
  geom geometry(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NULL OR longitude IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    END
  ) STORED,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cell_ref)
);
CREATE INDEX solar_grid_geom_idx ON solar_grid USING gist (geom);
CREATE INDEX solar_grid_geog_idx ON solar_grid USING gist ((geom::geography));
