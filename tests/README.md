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

The targeted golden homes — added 12 Nov 2026 (decision D10). Each
guards only the datasets named in its entry; the combination matrix for
the whole set is tests/golden-matrix.md. Adoption rule for every home
below: figures fixed from official data at first load for its guarded
datasets, then locked.

1. KT17 1DR — Ewell Village, Epsom. Guards planning areas: the point is
   INSIDE the Ewell Village conservation area and INSIDE its Article 4
   area, and Epsom and Ewell (organisation 129) publishes — the paired
   contrast with home 3, which sits 0.099 miles OUTSIDE the same two
   areas. Also guards transport and noise: West Ewell station (also the
   nearest listed building, grade II) is 0.021 miles away — a station
   effectively at the door on a rail-adjacent street.
2. E14 0BZ — London City Island, Leamouth, London. Guards planning
   areas: INSIDE the "London City Island" Article 4 area (ref
   LBTH_Art4_22), and Tower Hamlets (350) publishes. Also guards flood:
   INSIDE Flood Zone 3 with the rivers/sea likelihood defended at
   "Very low" — the second defended instance, in new-build flats; and
   London terminal-zone transport and central-urban air quality.
3. CM5 0DR — High Laver, Essex. Guards green belt: INSIDE the Epping
   Forest piece of the London green belt, the deepest-inside live Essex
   postcode found, about 2.5 miles from the piece edge. Guards heritage:
   the listed house "SAWYERS" (NHLE 1337547, grade II) at 0.008 miles —
   the residential listed-at-the-point case. Also guards flood boundary
   behaviour (the point is inside no zone, but the Flood Zone 2 edge is
   0.001 miles away and the rivers/sea likelihood is "Low") and the
   least-deprived end of the deprivation index.
4. KT13 8NB — Oatlands, Weybridge. Guards heritage: the postcode point
   is INSIDE the Oatlands Palace scheduled monument (the neighbouring
   postcodes KT13 8NP and 8NR are inside too), with the monument's
   listed entrance gates and walls (1191628, grade II) at 0.024 miles —
   monument and listing telling one story at one address.
5. KT21 1AG — Ashtead Common edge, Ashtead. Guards nature: the point is
   INSIDE the Epsom and Ashtead Commons SSSI, standing alone (no SAC,
   SPA or Ramsar at the point — the one-designation counting case), with
   priority habitat 0.008 miles away and ancient woodland at 0.018. Also
   guards green belt: INSIDE the Mole Valley piece — two inside answers
   at one address, rendered without double-counting.
6. OX1 1HD — Osney / St Thomas, Oxford. Guards flood: INSIDE Flood
   Zone 3 with the rivers/sea likelihood UNDEFENDED at "Medium", read
   at the exact point — the direct contrast with Exeter's defended
   "Very low" in the same zone; surface water "Low". Also guards
   planning areas (INSIDE the Oxford Central conservation area and the
   Houses in Multiple Occupation Article 4 Direction; Oxford (251)
   publishes), heritage (1,087 listed buildings within 2 miles, the set
   maximum) and dense-urban nearby places.
7. CF11 8AA — Grangetown, Cardiff. Guards the Wales honesty states:
   schools (Welsh schools filed with no Ofsted row — Estyn territory),
   health (Welsh points filed but never CQC-rated), census
   (Wales-specific outputs, Welsh language), deprivation (the Welsh
   index is a SEPARATE index — scores must not be compared across the
   border) and council tax (Welsh bands rest on a 2003 valuation
   basis). Its planning and flood answers are coverage-honesty states,
   not proven nones: the national planning files hold Welsh rows but
   return nothing within 2 miles of this point — sparse coverage, not
   a clean none — and the EA flood-planning service returns nothing
   for Wales, because Welsh flood planning maps are a Natural
   Resources Wales product.
8. CB6 1EH — Hilgay, Norfolk fens. Guards the near-empty case —
   labelled NEAR-empty, never "empty": the planning and heritage
   layers genuinely answer none at once (nearest conservation area
   3.57 miles, monuments 4.47, Article 4 areas 7.64, zero listed
   buildings within 2 miles, no green-belt piece within 5 miles —
   nearest 17.22), statutory nature NONE within 2 miles, while
   priority habitat is present at 0.123 miles and is reported as
   present, and the point is INSIDE Flood Zone 3 (fen floodplain; its
   rivers/sea band is fixed at first load). Its crime and schools
   counts are expected to be tiny or none and are verified at first
   load, not assumed.
9. CM1 6ER — Beaulieu, Chelmsford (postcode introduced July 2024).
   Guards EPC: 49 certificates at the postcode, ALL predicted (SAP
   schema), ALL band B — the new-build certificate case. Guards sold
   prices on the new-build branch: the monthly Price Paid file holds
   zero rows for this postcode, a weak signal only — the exact sales
   count is fixed at first load from pp-complete, the same adoption
   pattern as home 3. Also guards new-development nearby places and
   new-build council-tax banding (band newly set, or the property not
   yet banded at first sale).
10. KT1 1JS — Market Place, Kingston upon Thames. A display and
    geometry guard only: the postcode point IS the listed building —
    "MARKET HOUSE" (NHLE 1358428, grade II*) at 0.000 miles — and the
    point is INSIDE the Kingston Old Town conservation area and a
    Kingston Article 4 area (Kingston (188) publishes), and INSIDE
    Flood Zone 2. Honest flag: the Market House is a civic building,
    not a home, so this home guards rendering and geometry, never a
    buyer journey; the residential version of the branch is CM5 0DR.
11. KT22 8QA — Headley, Mole Valley. A counting guard: INSIDE the Mole
    Valley green-belt piece and INSIDE an (unnamed) Ancient Woodland
    Inventory polygon, with the Mole Gap to Reigate Escarpment SSSI
    and SAC both at 0.416 miles — the same ground carrying two
    designations, which must never be counted as two places.

EPC-only guard: E16 1EG — Canning Town, Newham (postcode introduced
October 2025). ZERO energy certificates at the postcode, verified
against the register (E16 1DP is the same); asserted by the EPC loader
only, as the no-certificates branch. It is also the set's candidate for
a verified zero-sales postcode — its sales count is unverified and is
not relied on until checked.
