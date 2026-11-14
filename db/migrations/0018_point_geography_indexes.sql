-- Migration 0018 — geography indexes for the brain's distance
-- reads (plan step M6.2; decision D22).
--
-- lib/nearby.ts finds the filed places around a postcode point
-- with ST_DWithin over geom::geography (spheroid metres, the
-- honest cut before the module's own haversine pass). The GiST
-- indexes from 0001 are on the geometry column, and the cast to
-- geography cannot use them: measured at the M6.2 rehearsal
-- (local PGlite, national filings), the Exeter bus-stop read
-- cost ~1,121 ms as a sequential scan over 381,640 transport
-- stops and the Epsom greenspace-centres read ~297 ms over
-- 317,730 rows. With the expression indexes below, the same
-- reads plan as bitmap index scans (~19 ms and ~5 ms in the
-- same rehearsal). One index per point table the brain reads;
-- the loaders' stage-swap filings maintain them like any other
-- index.

CREATE INDEX IF NOT EXISTS schools_geog_idx
  ON schools USING gist ((geom::geography));

CREATE INDEX IF NOT EXISTS nurseries_geog_idx
  ON nurseries USING gist ((geom::geography));

CREATE INDEX IF NOT EXISTS health_points_geog_idx
  ON health_points USING gist ((geom::geography));

CREATE INDEX IF NOT EXISTS transport_stops_geog_idx
  ON transport_stops USING gist ((geom::geography));

CREATE INDEX IF NOT EXISTS ev_points_geog_idx
  ON ev_points USING gist ((geom::geography));

CREATE INDEX IF NOT EXISTS osm_points_geog_idx
  ON osm_points USING gist ((geom::geography));

CREATE INDEX IF NOT EXISTS greenspace_points_geog_idx
  ON greenspace_points USING gist ((geom::geography));
