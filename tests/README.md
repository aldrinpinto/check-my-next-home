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
   PAON + SAON pair identifies the right flat. Crime facts, locked
   12 Nov 2026 from the Police.uk API on the same basis as the other
   golden homes: 1,956 crimes in the 12 months October 2025 to
   September 2026 within 1 mile of the flat's position. EPC facts,
   locked 12 Nov 2026 from the energy-certificate API: 25 certificates
   at the postcode, all band B, addressed as "Flat N <Building> House";
   Flat 4 Minerva House's own certificate (8401-7039-6529-6723-9906,
   registered 7 Nov 2019, SAP assessment) is band B, 70 square metres,
   mid-floor flat. Juno House and Jupiter House each have a "Flat 4"
   certificate too — the three-way same-number trap again. Planning and
   heritage facts, locked 12 Nov 2026 from the planning.data.gov.uk
   files (step M5.2): no golden home falls inside a conservation area,
   Article 4 area, green belt piece or scheduled monument. Birkdale —
   nearest conservation area Chelmer and Blackwater Navigation 1.47
   miles; nearest monument Hatfield Priory (NHLE 1002150) 0.49; 102
   listed buildings within 2 miles, nearest White Hart Cottage
   (1123430, II) at 0.19; no green belt piece for Braintree district
   and no edge within 5 miles; Braintree (organisation 56) publishes
   no Article 4 areas, so its Article 4 state is "not published".
   Exeter — nearest conservation area Naval Row 1.13 miles; nearest
   monument the Beckton gun emplacements (1003473) 0.92; 215 listed
   buildings within 2 miles on the prep's haversine basis (earth
   radius 3956 miles — NHLE 1289552 sits at 2.000–2.001 miles and
   counts), nearest 1406622 at 0.32; Newham (246) publishes no
   Article 4 areas despite its borough-wide direction in force
   since 2013 — the gate state is "not published", never "none".
   Epsom — Ewell Village conservation area and its Article 4 area
   both 0.099 miles away (rights "1A;1C;1D;1F;2A;2B"); the London
   green belt edge 0.101 miles away; nearest monument the Ewell
   church tower (1003721) 0.44, Nonsuch Palace (1017998) 0.45; 315
   listed buildings within 2 miles, nearest Pit House (1214537) at
   0.17. Nature facts, locked 12 Nov 2026 from Natural England's
   services (step M5.3): no golden home falls inside an SSSI, SAC,
   SPA, Ramsar site, ancient woodland or a priority habitat patch.
   Birkdale — nearest SSSI Woodham Walter Common 2.88 miles; the
   Essex Estuaries SAC and the Blackwater Estuary SPA and Ramsar
   all at 4.36 (one estuary, several designations); nearest
   recorded ancient woodland 0.39 — an unnamed polygon from the
   revised inventory, where the original alone would say 0.85;
   nearest priority habitat a traditional orchard at 0.25, with 33
   patches within a mile. Exeter — nearest SSSI Gilbert's Pit
   (Charlton) 1.90; Epping Forest SAC 4.07; Lee Valley SPA and
   Ramsar both 5.19; nearest ancient woodland Greenwich Park
   (revised) 2.51, the original alone saying 3.38; 38 priority
   habitat patches within a mile, nearest 0.14. Epsom — Stones
   Road Pond SSSI 0.67 and Epsom and Ashtead Commons 1.79; Mole
   Gap to Reigate Escarpment SAC 5.00; South West London
   Waterbodies SPA and Ramsar both 7.05; nearest ancient woodland
   1.41 — an unnamed polygon from the ORIGINAL inventory, where
   the revision alone (Surrey is not a completed county) would
   say 2.11; 57 priority habitat patches within a mile, nearest
   0.18.

The M3.6 practice seed and the M4.1 postcode proof were built before home 3
was added and cover homes 1 and 2 only.
