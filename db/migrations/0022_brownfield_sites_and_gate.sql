-- Check My Next Home — migration 0022: brownfield sites and
-- their supplier gate (plan step M6.21, decision D41).
--
-- Brownfield land is the platform's unified national dataset
-- (planning.data.gov.uk, built from councils' own brownfield
-- registers, Open Government Licence v3.0). Two properties of
-- the source decide the schema:
--
--   * The dataset publishes POINTS only — a representative
--     point per recorded site, no site boundary — so sites
--     file as points, in the listed_buildings shape (latitude
--     + longitude + a generated PostGIS point that can never
--     disagree with them), and the brain serves them in the
--     listed-building points shape: nearest sites plus the
--     count within 2 miles. No row here can ever support a
--     "this plot is / is not on the register" claim, and none
--     is shaped to.
--   * Absence is only meaningful for a council that supplies
--     the dataset. The supplier gate (brownfield_publishers)
--     is filed by the same run, from the same file, in the
--     article4_publishers shape: one row per organisation
--     entity with at least one current site in the file. A
--     council with no row has published nothing the absence
--     could rest on.
--
-- Filed per site: the register's own reference and supplying
-- organisation entity (numbers only — the files publish no
-- name list), the site-address label exactly as published,
-- hectares, the register's own planning-permission status,
-- the published minimum/maximum net dwellings, and the
-- site-plan URL (filed, never served — the brain's read port
-- does not carry it). The register's free-text notes are
-- NEVER filed: they are unstructured council prose, and
-- nothing unstructured reaches a reader (D41).

CREATE TABLE brownfield_sites (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The register's own reference for the site, as published
  -- ("15/01103/OUT", "UPRN:10008994946"). References are only
  -- unique within a supplying organisation, so the pair
  -- (reference, organisation_entity) is the record key the
  -- loader dedupes on.
  reference text,
  organisation_entity text,
  site_address text,
  hectares double precision,
  planning_permission_status text,
  minimum_net_dwellings integer,
  maximum_net_dwellings integer,
  site_plan_url text,
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
CREATE INDEX brownfield_sites_geom_idx ON brownfield_sites USING gist (geom);
CREATE INDEX brownfield_sites_org_idx ON brownfield_sites (organisation_entity);

-- The supplier gate: one row per organisation entity with at
-- least one current site in the filed file, with that
-- organisation's current-site count. Presence is the only
-- licence for a "none found" absence (the article4_publishers
-- pattern, migration 0007).
CREATE TABLE brownfield_publishers (
  organisation_entity text PRIMARY KEY,
  current_sites integer NOT NULL,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
