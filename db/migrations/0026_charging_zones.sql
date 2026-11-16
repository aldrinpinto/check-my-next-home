-- Check My Next Home — migration 0026: charging zones
-- (plan step M6.31, decisions D50, D61 and D63).
--
-- The filed boundaries of the charging zones in force in
-- the UK: the seven Clean Air Zones, the London Ultra Low
-- Emission Zone and the four Scottish Low Emission Zones —
-- twelve schemes in the register the loader carries. Each
-- scheme files as ONE row: its boundary unioned to a
-- single MultiPolygon, keyed on the loader's scheme_key.
--
-- A DEDICATED table, not rows in planning_layers:
--
--   * A scheme's identity is a register entry, not a
--     polygon: its operator, vehicle class, charging
--     start date and vehicle-checker landing are register
--     facts the brain serves beside the boundary, and
--     planning_layers carries none of them.
--   * The completeness gate is a property of the SET —
--     all twelve scheme_keys filed, the oldest filing no
--     more than 120 days old — computed at answer time
--     from these rows and their loaded_at stamps. The
--     loader files the whole set in one transaction (one
--     swap: stage all, validate all, delete all, insert
--     all), so the set's stamps share one instant and a
--     failed run files nothing — the last good set keeps
--     serving.
--   * The zones are pairwise disjoint (verified against
--     the published boundaries at build); the loader
--     asserts it over the staged set at every filing, so
--     a future overlap is a filing refusal, never a
--     serving ambiguity.
--
-- Charging AMOUNTS are never filed (decision D50): no
-- column here can hold one. Portsmouth's Clean Air Zone
-- is in the loader's register but files no row until the
-- council publishes a boundary (decision D63): its
-- absence from this table is exactly what the brain's
-- named-gap outside line reports.
--
-- in_force_date is the date the scheme's charges — or,
-- for the Scottish zones, its penalties — began (decision
-- D61), uniformly: the date a driver first had to comply.
-- source_date is the publisher's own edition date for the
-- boundary where the source states one; null where it
-- does not — the provenance words ride in source_name
-- and terms_note instead. terms_note records the basis
-- the boundary files on, per scheme, as published (the
-- licence where the publisher states one; the recorded
-- position where a service carries no licence text).

CREATE TABLE charging_zones (
  scheme_key text PRIMARY KEY,
  name text NOT NULL,
  family text NOT NULL,
  class text,
  operator text NOT NULL,
  in_force_date date NOT NULL,
  checker_url text NOT NULL,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  source_name text,
  source_date date,
  terms_note text,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX charging_zones_geom_idx ON charging_zones USING gist (geom);
