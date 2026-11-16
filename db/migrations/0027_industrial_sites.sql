-- Check My Next Home — migration 0027: industrial sites
-- (plan step M6.32, decisions D50, D60 and D62).
--
-- The Environment Agency's Pollution Inventory for
-- England: the sites the Agency permits for large
-- industrial activities (Part A(1) under the Environmental
-- Permitting Regulations), and the releases to air their
-- operators reported for the latest published year.
--
-- Two tables, one vintage held at a time:
--
--   * industrial_sites — one row per permit in the
--     published register (the Substances sheet's permits:
--     2,870 in the 2024 vintage). The workbook carries NO
--     site-name field and NO regulator column (decision
--     D62): the filed SITE ADDRESS serves verbatim as the
--     site's identity, the operator is named separately,
--     and "Environment Agency" is a block-level fact the
--     brain states once, never a column. EA AREA NAME is
--     deliberately not filed — it is the Agency's internal
--     geographic team, not a regulator. Fourteen sites in
--     the 2024 vintage publish no easting/northing: they
--     file with NULL coordinates and a NULL point, and can
--     never serve spatially. The waste-transfer-only and
--     radioactive-only permits are out of scope (D62) —
--     they are not in the Substances register and file no
--     row here.
--
--   * industrial_site_releases — one row per filed
--     AIR-route return (the only route that files; water,
--     wastewater and land returns are out of scope). A
--     below-reporting-threshold return files as
--     quantity_kg NULL with below_threshold true — a
--     return was made, no quantity was published — which
--     is a different fact from a quantified return of 0,
--     and both differ from no row at all. Rows, not JSONB:
--     the serving read is per site, and rows make the
--     no-aggregation rule structural — no total over
--     substances can be computed from a shape that never
--     holds one.
--
-- The loader swaps the whole vintage in one transaction
-- (stage, check, delete both tables, insert, count), so a
-- failed load never overwrites the last good vintage, and
-- the deletion path the licence position may one day need
-- (D60/D62) is two DELETEs the flip procedure names.
-- Serving sits behind INDUSTRIAL_SITES_ENABLED (lib/site.ts,
-- decision D60): the flag governs serving only — filing
-- proceeds while it is off, exactly as company ownership
-- files behind its flag (D18/D32).

CREATE TABLE industrial_sites (
  permit_id text PRIMARY KEY,
  operator text NOT NULL,
  site_address text NOT NULL,
  site_postcode text,
  activity_description text,
  sector text,
  sub_sector text,
  easting double precision,
  northing double precision,
  latitude double precision,
  longitude double precision,
  geom geography(Point, 4326),
  data_year integer NOT NULL,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX industrial_sites_geom_idx ON industrial_sites USING gist (geom);

CREATE TABLE industrial_site_releases (
  permit_id text NOT NULL REFERENCES industrial_sites (permit_id) ON DELETE CASCADE,
  substance text NOT NULL,
  threshold_kg double precision NOT NULL,
  quantity_kg double precision,
  below_threshold boolean NOT NULL DEFAULT false,
  data_year integer NOT NULL,
  PRIMARY KEY (permit_id, substance)
);
CREATE INDEX industrial_site_releases_permit_idx ON industrial_site_releases (permit_id);
