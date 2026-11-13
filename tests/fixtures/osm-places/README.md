# Fixture — nearby places (OpenStreetMap), plan step M5.6

Per-home `.osm` XML captures (Birkdale, Exeter, Epsom, Oxford,
Hilgay, Cardiff, London City Island), cut from the prep's
verified Geofabrik country extracts — `england-261112.osm.pbf`
(md5 `d2e0ec318af8a4f6139e9de3f7b60fbb`, verified against
Geofabrik's published hash) and `wales-261112.osm.pbf` —
captured 2026-11-13 (`fixture.json`).

An element is in a home's capture when its representative
point (node position; way node-average centre; multipolygon
relation member average) falls within the prep's file radius
of the home: 5,000 m for the urban homes, 16,093 m (10 mi)
for Hilgay — except London City Island, trimmed to 1,200 m:
its loader checks sit at 0.075 and 0.041 mi, and a 5,000 m
capture of that part of London is 4.6 MB of data no check
reads. Ways are stored with their full node geometry, so
the loader's extract step computes the same points from the
capture as from the country files. Elements the loader does
not file (a garden centre, a playground) are in the captures
too — the filing rules, not the capture, exclude them.

The tests (`tests/load-osm-places.test.ts`) recompute the
filed rows from these captures independently and check them
against the prep's verified reads (golden-reads.json). The
figures for the Overpass-sourced homes in those reads
(Birkdale, Epsom, Oxford) were measured on bbox centres, so
they agree with this PBF basis to a few metres, not exactly;
the PBF homes (Exeter, Hilgay, Cardiff, City Island) agree to
the metre.

Data © OpenStreetMap contributors (ODbL) — a test fixture
cut from the same extracts the loader files, held to the
same attribution as the table it feeds.
