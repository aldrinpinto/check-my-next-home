# Fixture — OS Open Greenspace, plan step M5.6

A radius-trimmed subset of the OS Open Greenspace 2026-10
edition, captured 2026-11-13 (`fixture.json`):

- `opgrsp_gb.gpkg.b64` — the subset GeoPackage, base64-
  encoded (the repo's push channel carries text only; the
  loader decodes it in fixture mode and reads the real
  GeoPackage from there): every site of the three filed
  functions (Public Park Or Garden, Playing Field, Play
  Space) whose area centroid falls within a golden home's
  file radius (5,000 m urban; 16,093 m for Hilgay), with
  the full product geometry, plus every access point
  belonging to those sites. 1,335 sites, 3,673 access
  points. Cut from the full product file (58,957,224 bytes,
  md5 `3d0c0c5e92c5dbf1d23d71b18530c962` — the Downloads API
  listing's own hash for the edition).
- `product.json` — the product record as the Downloads API
  served it (version `2026-10`).
- `downloads.json` — the GB entries of the downloads listing,
  verbatim (the GB GeoPackage entry carries the edition's
  md5 and size — the loader's oracle, T2).

The loader's fixture mode reads these exactly as the live
mode reads the API and the national file, so the golden
figures (Canning Town Recreation Ground centre 0.316 mi,
Fisher Street Open Space 0.275 mi, Strutt Memorial
Recreation Ground 0.219 mi, Sevenoaks Park 0.099 mi) must
reproduce from the subset — and do, in
`tests/load-os-greenspace.test.ts` and in the loader's own
golden checks on a fixture run.

Contains OS data © Crown Copyright and database rights 2026
(Open Government Licence).
