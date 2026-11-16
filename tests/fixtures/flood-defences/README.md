# Flood defences fixture (plan step M6.27)

A subset of the Environment Agency's AIMS Spatial Flood
Defences GeoPackage (AfA345, Open Government Licence),
captured for the loader and brain tests:

- `aims.gpkg.b64` — the subset GeoPackage, base64-encoded
  (the OS Greenspace idiom: the loader decodes it into its
  workdir; a plain `aims.gpkg` beside it wins if present).
  834 features: every published defence whose line comes
  within 2.5 miles (British National Grid plane) of one of
  the three golden homes, so the within-2-miles sets are
  complete — Birkdale 26, Exeter 443, Minerva 52, the
  counts the loader's golden checks and the brain's golden
  tests lock. Rows are verbatim copies of the published
  file, geometry blobs included.
- `fixture.json` — the capture stamp: the edition is the
  downloaded zip's member date (2026-11-13), the date the
  loader files as the source date in fixture mode.

The full national file (141,458 features, 123 MB) is never
committed; the live loader downloads it from the Data
Sharing Platform file endpoint named in the loader.
