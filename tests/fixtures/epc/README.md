# EPC fixture (plan step M4.5)

Real responses from the Get energy performance of buildings data API,
captured 12 Nov 2026 with the project's own API token:

- `search-cm3-2jt.json` / `search-e16-1gn.json` — the domestic search
  results for the two golden postcodes (42 and 12 certificate stubs).
- `certs/<certificate-number>.json` — the full certificate document
  for every stub in those searches (54 documents).
- `fixture.json` — which search file belongs to which postcode.

KT17 1FH was captured the same way on 15 Nov 2026 for M6.14 (its raw
register documents were never fixtured before then): the search
(25 stubs) as `search-kt17-1fh.json` and all 25 certificate documents
in `certs/`. CM1 6ER was captured the same way on 15 Nov 2026 for
M6.15: the search (49 stubs) as `search-cm1-6er.json` and all 49
certificate documents in `certs/` — 128 documents in the directory
in total. All 49 Beaulieu certificates are SAP (predicted) and
band B, as the golden matrix locks. The practice
directory excerpt (the ONSPD fixture) holds CM and E areas only, so
the runner's fixture pass still files the two original postcodes;
the KT17 set locks the loader's Minerva goldens and serves wherever
a directory row for the postcode exists.

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

Modelled energy costs (the M6.14 widening, decision D33): the
register's annual heating + hot water + lighting costs, current and
potential, are golden at the same addresses — 19 Birkdale Rise £489
current / £455 potential; 6 Exeter Road £351 (2013) and £1,104
(2023) on both sides; Flat 4, Minerva House, KT17 1FH £278 on both
sides (certificate 8401-7039-6529-6723-9906, band B, 70 square
metres, SAP, registered 7 Nov 2019).
