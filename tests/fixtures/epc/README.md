# EPC fixture (plan step M4.5)

Real responses from the Get energy performance of buildings data API,
captured 12 Nov 2026 with the project's own API token:

- `search-cm3-2jt.json` / `search-e16-1gn.json` — the domestic search
  results for the two golden postcodes (42 and 12 certificate stubs).
- `certs/<certificate-number>.json` — the full certificate document
  for every stub in those searches (54 documents).
- `fixture.json` — which search file belongs to which postcode.

Licence: the certificate facts (bands, floor areas, dates) are Crown
copyright, Open Government Licence v3.0. The address fields are
Ordnance Survey and Royal Mail copyright, published by MHCLG with
their consent for energy-performance purposes — see the service's
Licensing restrictions page.

Golden expectations proved from this fixture (the plan's M4.5 check):
6 Exeter Road, E16 1GN holds TWO certificates, both band B, whose
floor areas disagree — 71 square metres (2013) and 91 square metres
(2023) — and both must survive loading. 19 Birkdale Rise, CM3 2JT
holds a band B certificate (registered 7 Oct 2022) with a floor area
of 141 square metres.
