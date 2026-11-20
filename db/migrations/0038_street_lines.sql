-- Migration 0038 — street lines (plan step M8.3,
-- genuine flood maps; founder ruling 20 Nov 2026
-- preponing the national street-lines filing from
-- M12 into M8.3).
--
-- The flood maps are drawn from our own loaded EA
-- shapes over open street data we hold — and until
-- this step we held no street geometry anywhere:
-- the OSM places filing (migration 0001's osm_points)
-- holds places as points only. This table holds the
-- street lines themselves: one row per OpenStreetMap
-- highway way, its name as mapped (NULL where the
-- way is unnamed), its highway class verbatim, and
-- its line geometry in SRID 4326.
--
-- Filed by loaders/load-streets.mjs from Geofabrik's
-- England and Wales extracts (OpenStreetMap data,
-- © OpenStreetMap contributors, ODbL — the filed
-- table is a derivative database and stays private;
-- only drawn facts are served, with the attribution
-- line the flood-map pictures carry).
--
-- osm_id is the way's numeric id in OpenStreetMap —
-- a reference back to the map, the primary key here
-- because a way files exactly once (a border way
-- appearing in both country extracts files once, the
-- loader dedupes on this key).

CREATE TABLE street_lines (
  osm_id bigint PRIMARY KEY,
  name text,
  highway text NOT NULL,
  geom geometry(LineString, 4326) NOT NULL,
  source_name text NOT NULL,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX street_lines_geom_idx ON street_lines USING gist (geom);
CREATE INDEX street_lines_name_idx ON street_lines (lower(name));
