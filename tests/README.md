# tests

Automated checks live here, including the golden test homes from the plan,
whose expected results are fixed so any change that alters them shows up here
first.

The golden homes:

1. 19 Birkdale Rise, Hatfield Peverel CM3 2JT — a house; its expected results
   come from its approved sample report.
2. 6 Exeter Road, London E16 1GN — a house; its expected results come from its
   approved sample report.
3. Flat 4, Minerva House, 12 Ceres Crescent, Epsom KT17 1FH — a flat, added
   12 Nov 2026 from step M4.2 onwards. It covers the flat cases the two houses
   cannot: a flat inside a building (the Land Registry's secondary-address
   field) and building-level certificates. No approved sample report exists
   for it, so its expected results are fixed from the official data at first
   load and locked from then on. Directory facts (ONS Postcode Directory,
   August 2026): Epsom and Ewell council, Nonsuch ward, LSOA E01030396, MSOA
   E02006837, position 51.344571, -0.247104. Land Registry facts, locked
   12 Nov 2026 from the full Price Paid file: the postcode holds 31
   recorded sales (27 category A) across three blocks on Ceres Crescent
   (Jupiter House 10, Minerva House 12, Juno House 16), all flats; the
   category A median is £399,999 and the latest sale is 6 Jul 2026
   (£390,000, Jupiter House). The flat itself — PAON "MINERVA HOUSE, 12",
   SAON "FLAT 4" — has exactly one recorded sale: £420,000 on 3 Dec 2019,
   new-build leasehold (transaction
   AE4D86D4-69D9-4619-E053-6C04A8C03CD0). Note the trap it guards:
   Jupiter House also has a "FLAT 4" (£341,000, 10 Sep 2019) — only the
   PAON + SAON pair identifies the right flat.

The M3.6 practice seed and the M4.1 postcode proof were built before home 3
was added and cover homes 1 and 2 only.
