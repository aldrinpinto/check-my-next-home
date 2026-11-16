# Golden-set matrix — per-dataset combination coverage and E2E journeys

This is the project's standing test-data document, adopted 12 Nov 2026 as
decision D10 alongside the golden-set extension. The three core homes stay
UNIVERSAL (every loader asserts against them). Each targeted home guards
only the datasets it was chosen for — targeted status is what keeps
fixture capture and quarterly re-proof proportional, and universal status
must not be extended beyond the original three. Adoption rule for every
targeted home: its figures are fixed from official data at first load
for its guarded datasets, then locked.

Core homes (locked facts from `tests/README.md`, the fixture READMEs and
the loaders' golden assertions — not re-derived):

- **Birkdale** — 19 Birkdale Rise, Hatfield Peverel CM3 2JT (house, Essex)
- **Exeter** — 6 Exeter Road, London E16 1GN (house, inner London)
- **Epsom** — Flat 4, Minerva House, 12 Ceres Crescent, Epsom KT17 1FH (flat)

Targeted homes (each home's verified combination is summarised in its
entry in `tests/README.md`; the full research file behind the set is
CANDIDATES.md in `~/workspace/scratch-golden`, 12 Nov 2026):

- **C1** — KT17 1DR, Ewell Village, Epsom (inside a conservation area and
  its Article 4 area, publishing council)
- **C2** — E14 0BZ, London City Island, Leamouth (inside an Article 4
  area, publishing council; defended flood)
- **C3** — CM5 0DR, High Laver, Essex (inside the green belt; listed
  building at the point)
- **C4** — KT1 1JS, Market Place, Kingston upon Thames (grade II* listed
  building at the point — display/geometry guard; the building is civic,
  not a home)
- **C5** — KT13 8NB, Oatlands, Weybridge (postcode point inside a
  scheduled monument)
- **C6** — KT21 1AG, Ashtead Common edge, Ashtead (inside an SSSI alone;
  inside the green belt)
- **C7** — OX1 1HD, Osney / St Thomas, Oxford (undefended flood;
  conservation area and Article 4 inside)
- **C8** — CF11 8AA, Grangetown, Cardiff (Wales honesty states)
- **C9** — CB6 1EH, Hilgay, Norfolk fens (the near-empty case — labelled
  NEAR-empty, never "empty")
- **C10** — CM1 6ER, Beaulieu, Chelmsford (new-build; all-predicted EPCs)
- **KT22 8QA** — Headley, Mole Valley (inside the green belt and an
  ancient woodland polygon; SSSI/SAC same-ground counting guard)
- **E16 1EG** — Canning Town, Newham (EPC-only guard: zero certificates)

Honesty flags, kept exactly as verified: C9 is a NEAR-empty case, never
an "empty" one (priority habitat is present at 0.123 mi and the point
sits inside Flood Zone 3). The Welsh planning coverage at C8 is sparse —
the national planning files do hold Welsh rows, so the nothing-returned
result there is sparse coverage at that point, not a proven "none"; and
the EA flood-planning service returns nothing for Wales because Welsh
flood planning maps are a Natural Resources Wales product, not an EA one.

## Per-dataset combination table

### Postcode directory (M4.1)

| Combination                                 | Covered by                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| House, England (East / London / South East) | Birkdale / Exeter / Epsom (locked directory facts)                             |
| Flat inside a building (secondary address)  | Epsom                                                                          |
| Welsh postcode                              | C8 (Cardiff, Wales — postcodes.io confirmed)                                   |
| Very new postcode (introduced 2024 / 2025)  | C10 (Jul 2024), E16 1EG (Oct 2025)                                             |
| Terminated postcode / Scottish postcode     | GAP — out of V1 serving scope; add only if the directory loader's scope widens |

### Sold prices (M4.2)

| Combination                                                                    | Covered by                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The home itself has exactly one recorded sale                                  | Birkdale (£588,995, 15 Jun 2023, its only sale)                                                                                                                                                                                    |
| Street median over a defined report set; category-B rows present on the street | Birkdale (median £610,875 over the report's eight; 31 recorded street sales incl. category-B rows) — the figure the brain serves under D23 differs; see "Sold prices in the brain (M6.3)"                                          |
| Postcode median over few sales                                                 | Exeter (£310,000 over 9 sales)                                                                                                                                                                                                     |
| Many sales, mixed category A/B; same flat number in sibling buildings          | Epsom (31 sales, 27 category A; Flat 4 exists in Jupiter, Minerva and Juno Houses — only PAON+SAON identifies the right one)                                                                                                       |
| New-build: no or almost no recorded sales                                      | C10 — count fixed at first load in the M6.3 rehearsal: exactly 0 recorded sales (edition 28 Oct 2026)                                                                                                                              |
| Postcode with zero recorded sales of any kind                                  | C10 (CM1 6ER) — loaded at first ask in the M6.3 rehearsal, no sale recorded. E16 1EG was the expected fill and is not one: it holds one recorded sale (Flat 24, Crawford Point, £148,000, 5 Jun 2009) and serves the too-few state |

### Crime (M4.3) — counts only, never a score

| Combination                 | Covered by                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Very low count, semi-rural  | Birkdale (330 in 12 months to Sep 2026, 1 mi)                                                                                                                                                                                                     |
| Very high count, inner city | Exeter (10,722, same window)                                                                                                                                                                                                                      |
| Mid count, suburban flat    | Epsom (1,956, same window)                                                                                                                                                                                                                        |
| Genuinely tiny rural count  | C9 (Hilgay) — counted at first load, M6.4: 7 in the same window                                                                                                                                                                                   |
| Zero crimes in window       | CLOSED at M6.9 (D30/Q3 hunt): CA20 1EX (Wasdale Head) and LD5 4AD (Llanwrtyd Wells) filed genuine zeros live on 15 Nov 2026 — artefacts locked as fixtures and served as counts in the state matrix (see 'Empty answers, made deliberate (M6.9)') |

### EPC (M4.5)

| Combination                                                                            | Covered by                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One certificate for the home, band B, measured (RdSAP-era)                             | Birkdale (band B, 141 sq m, registered 7 Oct 2022)                                                                                                                                                                                                                                                                                             |
| Two certificates for the SAME address with disagreeing floor areas — both must survive | Exeter (71 sq m 2013 and 91 sq m 2023, both band B)                                                                                                                                                                                                                                                                                            |
| Building-level certificates; all one band; same flat number in three buildings         | Epsom (25 certs, all band B; Flat 4 cert in each of the three Houses; the flat's own is SAP, 70 sq m)                                                                                                                                                                                                                                          |
| Predicted-only (SAP) certificates, new-build                                           | C10 (49 certs, all SAP, all band B)                                                                                                                                                                                                                                                                                                            |
| ZERO certificates at the postcode                                                      | E16 1EG (verified zero via the EPC register; E16 1DP the same) — EPC-only guard                                                                                                                                                                                                                                                                |
| Mixed bands at one postcode incl. a poor band (F/G)                                    | GAP for a real postcode — but the per-band rendering and percentage maths beyond the goldens' B–D range are proven at M6.15 by a labelled synthetic artefact in the state matrix (bands A–G plus the no-band form). Kind of postcode that fills the golden gap: an older unrenovated street (pre-1919 terraces) in any of the existing regions |

### Schools (M4.6)

| Combination                                           | Covered by                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Borough with NO selective secondaries                 | Exeter (Newham: 17 secondaries, 0 selective, 2 with no recorded admissions policy)                                                         |
| Selective school genuinely near                       | Epsom (Nonsuch High School, selective girls' grammar, 1.25 mi; nearest primary Ewell Grove 0.29 mi; nearest secondary Glyn School 0.39 mi) |
| School with no headline grade but an ungraded outcome | Birkdale set (Hatfield Peverel Infant — "School remains Good"; Blenheim High — "Standards maintained")                                     |
| Inspected school with a poor grade on record          | Exeter set (Lift Maltings — Requires improvement 2023, plus its March 2026 report card)                                                    |
| Welsh school — no Ofsted row exists (Estyn)           | C8 (branch proven in the M4.6 live run: 1,567 Welsh schools filed, none with Ofsted)                                                       |
| No school within the serving radius                   | GAP — C9 is the likely fill; unverified until the schools loader asserts it                                                                |

### Health (M4.7)

| Combination                                                          | Covered by                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Nearest GP point is a BRANCH, not the main site                      | Birkdale (Sidney House branch F81149002 of F81149 at 0.37 mi — never the Witham main site)     |
| Two practices tied at the same distance                              | Epsom (two KT17 practices tie at 0.46 mi)                                                      |
| Emergency-care flag in all three states (no data / false / true)     | Birkdale set (St Peter's no data, Springfield false, Broomfield true)                          |
| Hospital rated Requires improvement                                  | Exeter (Newham University Hospital — flag true, RI published 17 Jul 2026; nearest A&E 0.78 mi) |
| Hospital rated Good                                                  | Epsom set (flag true, Good published 11 Jun 2026)                                              |
| Welsh point — filed but NEVER CQC-rated; pharmacies/dentists unrated | C8 (branch proven on the M4.7 fixture's Welsh practice and pharmacy rows)                      |
| Excludable non-service row in the raw register                       | Birkdale/Exeter sets (dermatology clinic F84750 must be excluded)                              |

### Flood (M5.1)

| Combination                                                        | Covered by                                                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Inside FZ3, likelihood DEFENDED "Very low"                         | Exeter (locked)                                                                                                                                 |
| Inside FZ3, likelihood UNDEFENDED "Medium" at the exact point      | C7 (Oxford; backup TW18 3BU, Staines — also FZ3 + exact-point Medium)                                                                           |
| Inside FZ3, defended "Very low", second instance (new-build flats) | C2                                                                                                                                              |
| Inside FZ2, likelihood "Low"                                       | C4                                                                                                                                              |
| Point effectively ON the FZ2 boundary (edge 0.001 mi), RoFRS "Low" | C3                                                                                                                                              |
| Rural inside-FZ3 (fen)                                             | C9 — zone verified; its RoFRS band is a GAP to read at first load                                                                               |
| Wales: EA planning-flood service returns nothing                   | C8 — coverage honesty state, NOT a "no flood zone" fact (Welsh flood planning maps are an NRW product)                                          |
| Surface-water "High" at the point                                  | GAP — kind of postcode: a known surface-water hotspot street (e.g. a steep urban catchment in Sheffield or Bristol); C7 covers RoFSW "Low" only |

### Planning areas (M5.2)

| Combination                                                    | Covered by                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| Inside a conservation area                                     | C1 (Ewell Village), C4 (Kingston Old Town), C7 (Oxford Central) |
| Near but OUTSIDE a conservation area (the 0.099 mi knife-edge) | Epsom (Ewell Village CA at 0.099 mi)                            |
| Genuine "none" for conservation areas, proven two ways         | Birkdale (nearest 1.47 mi; Braintree's "none" proven genuine)   |
| Inside an Article 4 area, council PUBLISHES                    | C1 (Epsom and Ewell 129), C2 (Tower Hamlets 350)                |
| Inside an Article 4 area, council PUBLISHES                    | C7 (Oxford 251)                                                 |
| Article 4 answer "not published by the council"                | Birkdale (Braintree 56; Silver End direction also absent)       |
| Article 4 answer "not published by the council"                | Exeter (Newham 246; borough-wide direction since 2013 absent)   |
| Published council, no area covers the point, one near          | Epsom (A4 at 0.099 mi)                                          |
| Published council, no area covers the point, one near          | C10 (nearest A4 0.762 mi; Chelmsford 81 publishes)              |
| Empty-result across all planning layers at once                | C9 (nearest CA 3.57 mi, A4 7.64 mi)                             |

### Green belt (M5.2)

| Combination                                              | Covered by                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| INSIDE a green-belt piece                                | C3 (Epping Forest piece, deepest-inside Essex postcode found), C6 (Mole Valley piece) |
| Near the edge but outside                                | Epsom (London belt edge 0.101 mi)                                                     |
| No piece and no edge within 5 miles                      | Birkdale                                                                              |
| Piece filed under the belt's core name, not the district | All inside cases (loader files 181 pieces under names like "London")                  |

### Heritage (M5.2)

| Combination                                                                                    | Covered by                                                                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Listed building AT the postcode point (0.000 mi), grade II*                                    | C4 (Market House, Kingston, NHLE 1358428)                                                      |
| Listed building effectively at the point, residential (0.008 mi), grade II                     | C3 (SAWYERS, NHLE 1337547)                                                                     |
| Very large listed count within 2 mi                                                            | C7 (1,087)                                                                                     |
| Boundary-count sensitivity (a building at 2.000–2.001 mi counts, on the R=3956 heritage basis) | Exeter (215 within 2 mi incl. NHLE 1289552 on the boundary)                                    |
| Zero listed buildings within 2 mi                                                              | C9 (nearest 3.26 mi)                                                                           |
| Postcode point INSIDE a scheduled monument                                                     | C5 (Oatlands Palace; also KT13 8NP / 8NR)                                                      |
| Monument near but outside                                                                      | Birkdale (Hatfield Priory 0.49 mi), C7 (Oxford Castle 0.033 mi), C4 (Clattern Bridge 0.077 mi) |

### Nature (M5.3)

| Combination                                                                | Covered by                                                                                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INSIDE an SSSI (standing alone, not stacked)                               | C6 (Epsom and Ashtead Commons SSSI)                                                                                                                         |
| SSSI and SAC on the SAME ground (must not be double-counted as two places) | KT22 8QA (Mole Gap to Reigate Escarpment SSSI and SAC, both 0.416 mi)                                                                                       |
| SAC and SPA on the same ground                                             | C8 (Severn Estuary SAC and SPA, both 1.837 mi)                                                                                                              |
| INSIDE ancient woodland (provisional inventory — completeness caveat)      | KT22 8QA (inside an AWI polygon)                                                                                                                            |
| Priority habitat very near (non-statutory inventory, publisher caveats)    | C6 (0.008 mi), C9 (0.123 mi — present where everything statutory is absent)                                                                                 |
| Statutory nature: genuine NONE within 2 mi                                 | C9; Exeter separately guards the urban no-inside case                                                                                                       |
| INSIDE a SAC / SPA / Ramsar site                                           | GAP — kind of postcode: a residential postcode inside the Thames Estuary, Minsmere or a Solent designation; none of the current candidates lands inside one |

### Transport (M5.5)

NaPTAN (Department for Transport), figures locked 13 Nov 2026 from the
national file (435,812 rows; 381,640 active stops in the nine filed
families). Two standing rules behind every figure below. The
station-point rule: a station files as a family of rows (station
points, entrances, platforms), and only station-level points
(RLY / MET / TMU) speak for the station — entrances and platforms are
never filed; around Custom House one station's rows span
0.440–0.504 mi, thirty times the spread between distance
conventions, so the point rule, not the earth radius, decides the
figures. The grid-only note: 31,417 active stops publish no
coordinates, only OS grid references, and file converted
(EPSG:27700 → EPSG:4326) — including every Elizabeth line rail
station and all 7 bus stops within 2 miles of C9. Distances are
haversine miles on the filed points from the postcode point
(house basis, earth radius 3956).

| Combination                                                                                                                     | Covered by                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The step's check: a named station point at its locked distance                                                                  | Exeter (universal) — Custom House station point 4900ZZDLCUS1 at 0.440 mi; Canning Town Underground station point 0.564 in the same run                                                                                                        |
| Nearest station point is a DIFFERENT station than the report's headline (ordering was a service judgement, not a distance fact) | Exeter — Royal Victoria's point at 0.414 is nearer than Custom House's 0.440; only the Custom House figure is locked, never a "nearest" claim for it                                                                                          |
| Grid-only stops decide the answer (conversion or a confident wrong answer)                                                      | C9 — the Black Horse Drove bus pair (0500ELITP026 / 0500ELITP036), both grid-only, at 0.044 mi; unconverted the same computation answers 7.965 mi. Exeter too: the Custom House rail row (9100CUSTMHS) is grid-only, filed converted at 0.488 |
| Closed / superseded stations present in the source, excluded by status                                                          | Exeter — Canning Town Rail Station (9100CNTN, inactive) never files; West Ham's superseded rail row (9100WHAM, inactive, 0.025 mi nearer than the live one) excluded, live row 9100WHAMHL filed                                               |
| Paired bus stops (two rows, one stop pair — counts of rows are not counts of places)                                            | Birkdale (universal) — New Road 0.124 / 0.126; C9 — the 0.044 pair; Exeter — Canning Town Recreation Ground 0.172 / 0.186                                                                                                                     |
| The flat's station is not the town's name station                                                                               | Epsom (universal) — Ewell East 0.246 (Ewell West 0.570, Epsom 1.170); nearest bus stop Hazel Mead 0.128                                                                                                                                       |
| Semi-rural house: station walkable, bus stop at the road                                                                        | Birkdale (universal) — Hatfield Peverel 0.563 (the sample report's 0.6 reproduces); 13 bus stops within 0.5 mi                                                                                                                                |
| Wales files identically — no Welsh exception in this dataset                                                                    | C8 — Grangetown (Cardiff) Rail Station 0.136, Penarth Road bus stop 0.077, Taffs Mead waterbus stop (FER) 0.653, all from the same file and run as the English rows                                                                           |
| Far-station rural: the station answer is a fact with a distance, never an absence                                               | C3 — Harlow Mill Rail Station 4.531 with Mill Lane bus stop at 0.243 (Epping Underground 5.773); C9 — Littleport Rail Station 3.208, 7 bus stops within 2 mi, 86 within 5 mi                                                                  |
| Mode cannot be read off the stop-type code (loader files codes verbatim; labelling is M6's)                                     | C8 — Cardiff's nearest MET/TMU rows are a Somerset heritage steam railway 20.6 mi away; the same codes are Tube/DLR in London                                                                                                                 |

### Nearby places (M5.6, planned)

| Combination                                      | Covered by                                       |
| ------------------------------------------------ | ------------------------------------------------ |
| Dense urban: many places in every category       | C7 (Oxford centre), C4 (Kingston centre), Exeter |
| Sparse rural: categories genuinely empty         | C9                                               |
| New development: places still arriving / missing | C10, C2                                          |

### EV chargers (M5.7)

Source: Open Charge Map (opendata records only), filed by site with the
access class shown exactly as recorded. The National Chargepoint
Registry was decommissioned on 28 Nov 2024 and is not a source.

| Combination                                                                                                   | Covered by                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Nearest charger is "Public - Membership Required" — filed, with its access class shown, not hidden            | Birkdale (universal) — Witham Leisure Centre at 1.864 mi, 22 kW; the only fileable site within 2 mi                                            |
| Membership-required nearest at other golden homes                                                             | Epsom — Wilsons of Epsom Nissan (POD Point) 0.579 mi; Cardiff — MFG Texaco Ninian 0.168 mi, 50 kW; Oxford — Worcester Street Car Park 0.120 mi |
| Nearest charger is "Public - Pay At Location"                                                                 | Exeter (universal) — 0.277 mi                                                                                                                  |
| Nearest charger is unrestricted "Public"                                                                      | London City Island — 0.312 mi                                                                                                                  |
| No charger within radius — stated as none within 2 mi with the nearest distance given, never as "no chargers" | Hilgay (C9) — nearest 3.535 mi, none within 2 mi                                                                                               |

**RESOLVED (founder ruling, 14 Nov 2026) — one distance basis for the whole product, and the locks above are re-stated on it.** Every served distance in the product is haversine miles on earth radius 3,956 (the M5.2/M5.5 basis the brain serves under D22), and the locks in this section now stand on that basis: Witham Leisure Centre 1.864, Wilsons of Epsom Nissan 0.579, The Coach House At Lodge Farm 3.535; Exeter's 0.277 is the same on both bases. The figures were originally fixed by the M5.7 gate on the EV loader's own haversine, earth radius 3,959 (the basis recorded in the loader's header) — a filing-layer artefact that does not govern served figures, so the loader's own filing proof stands unchanged on its own basis. The M6.2 build proved the radius was the whole cause of the difference: the fixture filing and the national filing place all four sites at identical coordinates (0.0 m apart — each is a single-record site), the brain's arithmetic at radius 3,959 reproduces the original locks (1.866 / 0.580 / 3.538) exactly, and the difference was never more than 0.003 mi. `tests/nearby.test.ts` asserts the re-stated values exactly, each pinned within 0.005 of the lock.

### Census (M5.8, planned)

| Combination                                                                                                | Covered by          |
| ---------------------------------------------------------------------------------------------------------- | ------------------- |
| High-diversity inner-London area (ethnicity + religion per the V1 decision, ONS Census 2021, no inference) | Exeter              |
| Predominantly White British suburban / rural areas                                                         | Epsom, Birkdale, C9 |
| Wales — Welsh-language and Wales-specific census outputs                                                   | C8                  |
| Very small-population rural output area (suppression / rounding sensitivity)                               | C9                  |

### IMD / air / noise / broadband (M5.9, planned)

| Combination                                                                          | Covered by                                                                                     |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| IMD: most-deprived end                                                               | Exeter (Newham)                                                                                |
| IMD: least-deprived end                                                              | Epsom, C3                                                                                      |
| Wales: Welsh IMD is a SEPARATE index — scores must not be compared across the border | C8                                                                                             |
| Air quality: central-urban, near major roads                                         | C2, C4, C7                                                                                     |
| Noise: rail-adjacent                                                                 | C1 (station 0.021 mi)                                                                          |
| Noise: flight-path                                                                   | GAP — kind of postcode: a residential postcode under the Heathrow approach (e.g. TW / UB area) |
| Broadband: rural, likely slow / no full fibre                                        | C9                                                                                             |
| Broadband: new-build full fibre                                                      | C10, C2                                                                                        |

### Council tax (M5.10)

| Combination                                                                                                | Covered by                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard banded house / flat                                                                               | Birkdale, Exeter, Epsom                                                                                                                                                                                                                                                                                                     |
| Wales: Welsh bands rest on a different (2003) valuation basis — must not be presented as the English scale | C8                                                                                                                                                                                                                                                                                                                          |
| New-build: band newly set, or property not yet banded at first sale — honesty state                        | C10                                                                                                                                                                                                                                                                                                                         |
| Top band (H) property                                                                                      | GAP — kind of postcode: a large detached house postcode in Epsom / Weybridge (C5's street is the likely hunting ground)                                                                                                                                                                                                     |
| Seeded Band D filed and penny-verified — live year 2026-27 (loader goldens, asserted in tests)             | Braintree £2,280.34 (components £2,215.80 + £64.54 parish average) · Newham £1,944.23 (own £1,433.72 + GLA £510.51) · Epsom and Ewell £2,530.84 (own £239.85 + Surrey £1,938.42 + Surrey Police £352.57; no fire element — inside the county's) · plus the 10-authority spot-check set in loaders/council-tax-spot-check.md |
| Rehearsal goldens — the fully verified 2025-26 release                                                     | Newham £1,855.96 exact · Braintree asserted on components £2,133.54 pre-parish (area £2,194.67 with the £61.13 parish average) · Epsom and Ewell £2,416.84 as the revised release prints it (the prep's £2,416.39 came from council minutes — Surrey Police 45p lower; the release files) · Cardiff £1,926.18               |
| Welsh unitary filed with its composition (no county/GLA elements — nation held in the data)                | Cardiff £2,013.18 for 2026-27 (unitary £1,603.72 + police £405.14 + community average £4.32) · Swansea £2,238.29                                                                                                                                                                                                            |
| Authority parsed but unfiled — the "not filed" state (renamed at M6.9/D30 from "not published")            | Reigate and Banstead + Newport sit in the fixtures as witnesses; 305 of 318 authorities parsed for 2026-27 are unfiled until the spring pass                                                                                                                                                                                |
| Scotland / NI home: no council-tax row, named not-covered state at serving                                 | By construction — Scotland is a different system (water bundled into the bill); Northern Ireland levies domestic rates, not council tax                                                                                                                                                                                     |

### Benefits (M5.16)

| Combination                                                                                            | Covered by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claimant Count filed for the home's LSOA (count + published % of residents aged 16–64, September 2026) | Birkdale LSOA E01021395: 15 / 1.6% · Exeter LSOA E01003511: 120 / 8.6% · Minerva LSOA E01030396: 20 / 1.2% — locked at the prep, re-verified live at the build                                                                                                                                                                                                                                                                                                                                                 |
| LSOA Census bases filed (TS021 residents / TS054 households)                                           | Birkdale 1,489 / 625 · Exeter 1,923 / 671 · Minerva 2,487 / 852                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Universal Credit (people + households)                                                                 | Locked at the first pull, 13 Nov 2026 (founder-run browser captures — DWP refuses Muse-side networks): people, May 2026 — Birkdale 117 · Exeter 383 · Minerva 93; households, April 2026 — Birkdale 105 · Minerva 83. Exeter's LSOA (E01003511) is absent from the Households cube — its schema value node exists, correctly labelled, but the table engine rejects it (RECODE_FIELD_VALUE_NOT_FOUND) — so households goldens carry no Exeter value and the checks never demand one (HOUSEHOLDS_MISSING_LSOAS) |
| Scotland / NI home: no benefits row, named not-covered state at serving                                | By construction — both series file England & Wales LSOAs only                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Building safety (M5.14)

| Combination                                                                                | Covered by                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Control golden — a remediation order filed exact, returned by its postcode                 | Oyster Bay: HAV/00HQ/BSA/2025/0002, "1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN", remediation order, 10 April 2026 — asserted in the loader before anything files, fixture and live alike                                                                                        |
| Remediation contribution order (the BSB series)                                            | Planetree Path: LON/00BH/BSB/2024/0500, 10 June 2025                                                                                                                                                                                                                                     |
| One case published as several documents — the order document speaks for the case           | Empire Square: LON/00BE/BSB/2024/0602 files as a remediation contribution order dated 5 June 2025 from the order document, over the combined decision that also decided it; the HYI-series remediation-order case published alongside files nothing (out of the slice)                   |
| One decision, several case references — full, short-form and range shapes                  | Thanet Lodge (LON/00AE/BSA/2024/0007, 0500 & 0502 in full) · Purbeck House (HAV/00HN/BSA/2024/0001 and 0002 in short form; decision 8 May 2025, the 16 May correction never displaces it) · Urban Splash (MAN/00BN/BSB/2024/0001-0007 as a range — live corpus only)                     |
| A building-safety decision that is neither order, and a Property printing no full postcode | East Village: LON/00BB/BSA/2025/0002 + 0003 (a Regulation 3 appeal) file as other-building-safety with a NULL postcode ("London E20"); the same NULL state covers Canary Riverside (E14) and Hallings Wharf (its Property line ends at E15) — live corpus                                |
| A decision naming specific flats files flat-specific                                       | By the is_single_flat rule (the property text leads with the flat(s)); pinned by unit tests — no readable decision in the 14 Nov 2026 corpus prints a flat-lead Property line (the Thanet Lodge document's own Property names the building, so it files block-level, exactly as printed) |
| Parse failures counted by name, never silently dropped                                     | Live pull 14 Nov 2026: 3 of 24 documents — Ridley House (scanned PDF), the Prince Park Apartments order document and 5 Praed Street (CID-encoded text); the Prince Park case (LON/00AG/BSA/2024/0009) still files from its variation decision, the Ridley and Praed cases file nothing   |
| The Building Safety Register: no dataset exists to file                                    | By construction — the register is a postcode lookup only; the report hands off to the official search service (M6.16 states), watched by the bsr-register canary (healthy at build: guidance + search service live, data.gov.uk holds no building-level register dataset)                |

### Company ownership (M5.13)

Sample-checked against the real November 2026 files at the build (14 Nov 2026) — the prep could only state expectations, because the downloads are account-gated; what the register actually says is now the locked record, asserted by the loader's golden checks (fixture and live alike) and proven in SQL at the rehearsal.

| Combination                                                                     | Covered by                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not company-owned, proven against a non-empty slice (the negative control)      | 19 Birkdale Rise, CM3 2JT is in NEITHER dataset; its CCOD postcode slice holds 2 titles (AA53500, AA53502 — SAGE HOMES RP LIMITED, 11217910, over other Birkdale Rise houses) and OCOD holds none, so the No rests on a lookup that provably ran                                                                    |
| Not company-owned at the postcode, own title and building level                 | 6 Exeter Road, E16 1GN: 0 rows in either dataset at the postcode; a street-name search of both full files found company titles only at 8 Exeter Road (Evan House, E16 1GP — a different building)                                                                                                                   |
| A flat's own title No, with the building's freehold held by an overseas company | Flat 4, Minerva House, KT17 1FH: no own-title row in either dataset; OCOD title SY876459 ("Flats 1-9 Minerva House, 12 Ceres Crescent", Freehold) is held by ADRIATIC LAND 11 LIMITED, incorporated in GUERNSEY, company number NOT recorded — the building line is separate report depth, never the headline       |
| A snapshot exactly as Companies House publishes it                              | 11217910 SAGE HOMES RP LIMITED (Active, incorporated 21 Feb 2018, SIC 68201) and 13678133 SOMY RESIDENTIAL LIMITED (Active, 13 Oct 2021, SIC 68209), from the bulk product's 1 Nov 2026 snapshot                                                                                                                    |
| The missing-snapshot states, from real data                                     | 7686 (CLARION HOUSING ASSOCIATION LIMITED, as filed on five Juno House titles) is absent from the bulk product, which keys that society RS007686 — the number-not-in-the-snapshot state; the three Adriatic titles carry no number at all — the no-number-recorded state. Neither is ever repaired by name-matching |
| Full-replacement idempotency                                                    | The fixture pass files 11 titles (8 CCOD + 3 OCOD) and 2 snapshots; a second pass files the identical state (rehearsal-verified in SQL)                                                                                                                                                                             |

### Solar (M5.18)

Source: PVGIS (European Commission Joint Research Centre), PVcalc API, radiation database PVGIS-SARAH3 (2005–2023), at the standard basis — 1 kWp, slope 35°, azimuth 0° (south), building-integrated, crystalline silicon, system loss 14%. PVGIS publishes no downloadable yield grid, so the loader samples the API once per populated 0.1° cell (cells derived from the postcode directory) and files the grid; the locks below are the CELL values from the first live sampling, 15 Nov 2026.

| Combination                                                           | Covered by                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Golden cell containing the home — yield + in-plane irradiation locked | Birkdale cell 51.75,0.65: **1057.65 kWh/kWp/yr**, 1336.65 kWh/m²/yr · Exeter cell 51.55,0.05: **1009.96**, 1289.44 · Minerva cell 51.35,-0.25: **991.49**, 1264.87                                                                                                                    |
| The grain's honest size — the same API at the postcode POINTS         | 1049.85 (Birkdale) · 1004.16 (Exeter) · 991.41 (Minerva) — the cell values differ by +7.8 / +5.8 / +0.1 kWh per kWp; serving names the 0.1° cell grain (D26: a location fact, never the home's roof or yield)                                                                         |
| National live sampling pass                                           | NOT YET RUN — the first live pass (a few thousand populated cells at ~0.5 s per call, three concurrent) is an M12-era first filing; the build proved the route live on the golden cells plus a throughput sample, and the fixture pass files the three captured golden-cell responses |

### Address resolution (M6.1 + the M6.11 classifier)

The brain's front door, built 14 Nov 2026 (ruling D20: M6.1 together with M6.11's classifier, test-first). Resolution reads loaded data only — the postcode directory and the filed Price Paid address parts — and ambiguity always lands on the honest lower rung. Asserted in `tests/address.test.ts` against the repo's real fixture rows, and proven against a full-size database at the scoped rehearsal (full ONSPD, 1,810,363 live postcodes).

| Combination                                                                | Covered by                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A postcode returns its street's address list from loaded data              | CM3 2JT returns the 27 distinct Birkdale Rise addresses filed at the postcode (31 sales rows), including 19 Birkdale Rise                                                                                                                                                                                                                                                                     |
| A mixed street list keeps every golden number                              | E16 1GN's list includes Nos. 5, 6, 7 and 10 Exeter Road among its 7 distinct addresses                                                                                                                                                                                                                                                                                                        |
| The three-way flat trap: same flat number, three buildings, one postcode   | Flat 4 resolves to its own building at KT17 1FH — Minerva House (PAON "MINERVA HOUSE, 12"), Jupiter House ("JUPITER HOUSE, 10") and Juno House ("JUNO HOUSE, 16") kept distinct by the PAON + SAON pair, never by flat number alone                                                                                                                                                           |
| A flat number with no building name can never identify a home              | "Flat 4, KT17 1FH" lands on rung 2 (the postcode's list), not rung 1                                                                                                                                                                                                                                                                                                                          |
| A building identified by its street number still counts as building + flat | "Flat 4, 12 Ceres Crescent, KT17 1FH" resolves to Minerva House's Flat 4 (rung 1)                                                                                                                                                                                                                                                                                                             |
| A flat that is not loaded, a house number that is not loaded               | Both fall honestly: "Flat 99, Minerva House" returns the building's list; "99 Birkdale Rise" returns the street's list — never a guessed home                                                                                                                                                                                                                                                 |
| Partial postcode: the wider-area rung carries no address-level payload     | "CM3" returns rung 3 labelled "Wider area — CM3, not this exact home" with the district's postcode count (1,588 in the full directory); the result type has no address fields by construction                                                                                                                                                                                                 |
| No location, street without postcode, unknown district                     | All land on rung 4 (no-location): a street name alone cannot be placed from loaded data — every town has an Exeter Road                                                                                                                                                                                                                                                                       |
| Classifier tolerance                                                       | Case and spacing in postcodes ("cm32jt", "e16 1gn"), pasted listing-style strings, cut-off inward parts ("CM3 2" is partial), flat keywords (Flat / Apartment / Unit)                                                                                                                                                                                                                         |
| Scale timing, full directory (D20's folded-in proof)                       | Rehearsal, 14 Nov 2026, PGlite: rung-1 resolutions mean 1.75 ms (Birkdale), 2.05 ms (Exeter), 2.74 ms (Minerva) over 25 runs; the rung-3 district count cost ~541 ms as a sequential scan until migration 0017's outward-code expression index brought it to 0.87 ms mean. price_paid holds 43 fixture rows — it is loaded per postcode by design, so the directory is the scale that matters |

### Distances and What's Nearby (M6.2)

The brain's distance answers (`lib/nearby.ts`, ruling D22), built 14 Nov 2026. Straight-line miles from the postcode point, haversine on earth radius 3,956 (the M5.2/M5.5 basis), every figure labelled "straight-line distance from the postcode point". List shape: nearest 3 named places within 2 miles in distance order, plus the count within 2 miles; essential services always name the single nearest beyond the radius ("none within 2 miles — nearest is …"); the What's Nearby groups and nurseries stop at the radius. Asserted in `tests/nearby.test.ts` against the loaders' own fixture filings, and proven again at the full-size rehearsal (PGlite, 14 Nov 2026) on national filings: postcode directory 1,810,363; schools 27,159; transport stops 381,640; greenspace 317,730 rows (89,280 centres); EV 24,697 sites; health at its fixture filing (2,322 rows — no national health filing exists). Two named limits on that proof: OSM was NOT filed in the rehearsal (the loader refused the local Geofabrik extract — its md5 did not match the published hash — and the fallback extract run lacked its Python dependency), so the OSM groups below are locked on the M5.6 fixture basis and their national proof is outstanding; and at that build the nurseries table had no loader, so no filed rows existed to lock figures from (since filed at M5.17 — see the nurseries row).

| Combination                                                                                        | Covered by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locked station figures reproduce in the brain, in pure distance order                              | Birkdale — Hatfield Peverel Rail Station 0.563. Exeter — Royal Victoria Station 0.414 listed first; the Custom House POINT fact (0.440) is asserted at the source, never as a "nearest station" claim (national proof PASS). Epsom — Ewell East 0.246, Ewell West 0.570, Epsom 1.170. Hilgay — Littleport beyond the radius at 3.208 (national proof PASS)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Bus stops are their own line; paired stops count as filed rows                                     | Birkdale — New Road pair 0.124 / 0.126 (63 rows within 2 miles on the fixture cut; 13 within 0.5 miles per M5.5). Exeter — Canning Town Recreation Ground pair 0.172 / 0.186; 540 bus rows and 101 station points within 2 miles on the national filing. Epsom — Hazel Mead 0.128 twice over. Hilgay — Railway Cottages pair 0.044 (both grid-only rows), 7 within 2 miles (national proof PASS)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| The nearest GP point is a branch surgery where the branch is nearer — the branch is the fact       | Birkdale — SYDNEY HOUSE SURGERY 0.369 (the branch), never the Witham main site; DOUGLAS GROVE SURGERY 1.976 (national proof PASS on the top point). Exeter — CUSTOM HOUSE SURGERY 0.240, CUMBERLAND MEDICAL CENTRE 0.383, and the St Luke's branch as its own point at 0.396. Epsom — the locked tie holds at three decimals: FOUNTAIN PRACTICE 0.459 and SPRING STREET SURGERY 0.459                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| A&E means the nearest emergency-flag-YES hospital only; distances fixed at this build              | Exeter — Newham University Hospital 0.782 (the locked 0.78; national proof PASS). Epsom — Epsom General Hospital 1.732 (fixed at this build; national proof PASS). Birkdale — none within 2 miles; Broomfield Hospital named beyond at 5.89, in the ruled words (fixed at this build; national proof PASS)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Nearest dentist and pharmacy, fixed at this build                                                  | Birkdale — ARUNDEL HOUSE 0.250 and HATFIELD PEVEREL DENTAL SURGERY 0.250 (both contracts on the shared postcode); BOOTS 0.415. Exeter — APPLEBY CENTRE 0.265; DAY LEWIS PHARMACY 0.361. Epsom — BOURNE HALL DENTAL PRACTICE 0.459; EWELL HOUSE PHARMACY & TRAVEL CLINIC 0.235                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Schools for Birkdale and Exeter, fixed at this build                                               | Birkdale primary — the tied pair Hatfield Peverel Infant and Nursery School 0.289 / Hatfield Peverel St Andrew's Junior School 0.289 (national proof PASS), then Chipping Hill Primary School 1.291; secondary — Lift Maltings 1.884, the only one within 2 miles, none selective. Exeter primary (national filing; the GIAS fixture cut holds no E16 primary) — Keir Hardie Primary School 0.095, Hallsville Primary School 0.233, Rosetta Primary School 0.266; 61 within 2 miles. Exeter secondary — Rokeby School 0.333, Royal Docks Academy 0.660, Cumberland Community School 0.696; 13 within 2 miles on the fixture cut, 16 on the national filing, none selective on either                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Epsom's locked school figures reproduce at three decimals                                          | Primary — Ewell Grove Primary and Nursery School 0.292 (the locked 0.29); also St Clement's Catholic Primary School 0.582, Wallace Fields Junior School 0.589; 24 within 2 miles nationally. Secondary — Glyn School 0.385 (the locked 0.39), Blenheim High School 0.746, Nonsuch High School for Girls 1.250; the nearest selective secondary is Nonsuch at 1.25 (national proof PASS)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Hilgay schools — the prep's open GAP, closed by assertion at this build                            | On the national filing, Hilgay has NO primary and NO secondary school within 2 miles; the named nearest beyond the radius: Southery Academy (primary) 2.486, Vista Academy Littleport (secondary) 3.473                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| EV chargers — locks re-stated on the single basis (see the resolved note under EV chargers (M5.7)) | The brain serves Witham Leisure Centre 1.864 (only site within 2 miles, class "Public - Membership Required" shown), Exeter 0.277 ("Public - Pay At Location"), Wilsons of Epsom Nissan 0.579 (three distinct Wilsons sites file at 0.579 / 0.622 / 0.668 — a name never merges them), and Hilgay's nearest beyond the radius, The Coach House At Lodge Farm, at 3.535. `tests/nearby.test.ts` asserts these values exactly, each also pinned within 0.005 of the re-stated lock                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| What's Nearby groups and supermarkets (locked on the M5.6 fixture basis — see the headnote)        | Birkdale — supermarket The Co-operative Food 0.258, ALDI 1.140, Lidl 1.941; food and drink Hatfield Tandori 0.109, D's Cafe Diner 0.158, Duke of Wellington 0.218 (14 within 2 miles); library Hatfield Peverel Library 0.463; leisure 10 within (Club House 1.846 leads the named); pet boarding Latneys Boarding Kennelsl and Cattery 0.770 (name as filed); vets, pet shops and places to visit honestly empty — the line says a gap in the map is not proof that none exists. Exeter — supermarket Local Express 0.392, Lidl 0.463 twice; places of worship Keir Hardie Methodist Church 0.079; library Custom House Library 0.437; vets Goddard Vets Plaistow 1.169; pet boarding Ponyo's House 0.517. Epsom — supermarket Sainsbury's 0.510; food and drink The Famous Green Man 0.236; library Bourne Hall 0.463; vets Goddard Veterinary Group 0.929, The Bridge Veterinary Surgery 1.452; pet boarding empty on the map                                                                                                                                                                                                                                                                                                                                                                                                       |
| Parks from OS Greenspace CENTRE rows only, as distinct sites                                       | Birkdale — Strutt Memorial Recreation Ground 0.218; 22 centres within 2 miles (national proof PASS). Exeter — Fisher Street Open Space 0.275 (263 centres within 2 miles nationally), Canning Town Recreation Ground 0.315 — a Playing Field site, so a public-parks-only cut would miss it. Epsom — Gibraltar Recreation Ground 0.493; 55 centres nationally. Hilgay — 2 centres within 2 miles, neither named: the line says "no named greenspace site within 2 miles" rather than inventing a name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Nurseries: figures locked at M5.17 from the first filed load                                       | The nurseries loader (M5.17) filed the Ofsted childcare register as at 30 June 2026 on 14 Nov 2026 — 19,672 group settings (Provider type "Childcare on non-domestic premises", Full day care and Sessional day care subtypes only; childminders never file per D5). Locked from that load, on the 3,956 basis, and asserted by the loader in both live and fixture modes (the fixture cut covers each home's 2-mile answer in full): Birkdale — nearest Shining Stars 0.110, then The Little Bears Nursery 0.184, Gershwin Park Day Nursery School 1.106; 5 within 2 miles. Exeter — nearest Cribs Day Nursery 0.088, then Moksliukas 0.265, Clever Cloggs Day Nursery 0.291; 96 within 2 miles. Minerva — nearest Nestots Day Nursery 0.174, then Lynton House Day Nursery 0.355, Little Nick Nursery and Pre-School 0.516; 39 within 2 miles. `tests/nearby.test.ts` still asserts the category's behaviour on synthetic rows (lists within 2 miles in distance order, never names a beyond-radius nearest, and the register-empty wording "no nursery within 2 miles of the postcode point in the childcare register we hold" for a postcode point with no filed setting near it); the served answers on the filed register were proven at the M5.17 rehearsal, where all three homes return state "within" with the figures above |
| The ladder: rungs 1 and 2 share one measurement point; rung 3 carries no distance payload          | Rung-1 and rung-2 bundles for CM3 2JT return identical station lists (asserted). Rung 3 ("CM3") returns only the named state "distances need an exact postcode" — a structural test proves the bundle contains no categories, no place names and no miles. Rung 4 returns the no-location state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Performance at national volume (D22's proof; migration 0018)                                       | Before migration 0018 the brain's geography reads sequential-scanned the national tables (full-bundle means 1,660–1,779 ms per home; Exeter's bus-stop read 1,121 ms alone). Migration 0018 adds GiST indexes on the geography cast of each point table; with them, the same rehearsal's full-bundle means are Birkdale 54.1 ms, Exeter 43.4 ms, Minerva 33.7 ms, Hilgay 32.9 ms (5 runs each), and Exeter's worst category read is parks at 4.7 ms. Plans verified with EXPLAIN ANALYZE on the brain's own query shapes: bitmap/index scans on the 0018 indexes for the within-radius reads; the nearest-A&E KNN read sequential-scans the 2,322-row health table (the planner's choice at that size). WASM-engine numbers as ever — production timings are M12's confirmation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Sold prices in the brain (M6.3)

Proved twice over: `tests/sold-prices.test.ts` against the
loader's own fixture filings, and the local PostgreSQL
rehearsal at first load (real loaders, Price Paid edition
28 October 2026), which also recomputed every served figure
independently from the filed table. The rule is decision
D23: the served median is the postcode median over
category-A recorded sales only, the counted number and the
counted date span named beside it; a median is served only
at five counted sales or more; the home's own history is
all its recorded sales as filed, category-B included and
never labelled; a flat also gets its building's category-A
list, count and median. The brain never computes a gap, a
percentage or a comparative adjective against any median,
and sold prices are never called a valuation.

| Check                             | Figure                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Birkdale own history              | one sale: £588,995, 15 Jun 2023, detached, freehold, new-build                                                                                 |
| Birkdale postcode median (served) | £588,995 over 29 counted category-A sales, 20 Dec 1996 to 20 Jul 2026; 31 recorded in the postcode                                             |
| Exeter own history                | one sale: £270,000, 17 Jan 2014, filed as flat-type, leasehold, new-build — served as filed, never "corrected"                                 |
| Exeter postcode median            | £310,000 over 9 counted sales, 20 Sep 2013 to 31 Jan 2024                                                                                      |
| Exeter No 10 repeat pair          | £260,000 on 18 Dec 2013, then £410,000 on 24 Feb 2023, both in its history in that order                                                       |
| Minerva Flat 4 own history        | one sale: £420,000, 3 Dec 2019                                                                                                                 |
| Minerva postcode median           | £399,999 over 27 counted category-A sales of 31 recorded, 30 Aug 2019 to 6 Jul 2026                                                            |
| Minerva House building            | 12 category-A sales, median £392,499.50, 29 Nov 2019 to 18 Sep 2024                                                                            |
| The Flat 4 trap                   | Jupiter House Flat 4 (£341,000, 10 Sep 2019) is not Minerva's Flat 4; Juno House Flat 4 has no price or date in the register and is not a sale |

Recent category-A sales (newest first, the brain's order):

| Postcode | Most recent sales                                                                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CM3 2JT  | £630,000 on 20 Jul 2026 (16 Birkdale Rise); £628,000 on 17 Jul 2026 (8); £540,966 on 9 Feb 2024 (28) and £593,750 the same day (26) — a shared date serves in price order; £499,995 on 8 Dec 2023 (11)                                             |
| E16 1GN  | £571,000 on 31 Jan 2024 (5 Exeter Road); £410,000 on 24 Feb 2023 (10); £136,500 on 13 May 2022 (14); £270,000 on 17 Jan 2014 (6); £260,000 on 18 Dec 2013 (10); then the four 20 Sep 2013 sales                                                    |
| KT17 1FH | £390,000 on 6 Jul 2026 (Flat 5, Jupiter House); £307,500 on 23 Jan 2026 (Flat 7, Jupiter House); £405,000 on 14 Mar 2025 (Flat 1, Jupiter House); £304,000 on 18 Sep 2024 (Flat 2, Minerva House); £385,000 on 14 Aug 2024 (Flat 1, Minerva House) |

**Divergence, recorded openly.** The Birkdale figure the
M4.2 loader proof reproduces from the sample report — a
£610,875 average over eight named transactions — counts
eight transactions the report's author chose; it is not a
rule and nothing in the register defines it. Under the
product's one rule (above) Birkdale serves £588,995 over
29 counted sales of 31 recorded. The loader proof stands,
as a statement about the sample report; the served figure
follows D23.

**The three loaded states** are proven separately in the
unit suite and again in the rehearsal: sales found (the
three universal homes); loaded with none recorded —
CM1 6ER (Beaulieu, targeted home C10): the check loaded it
through the loader at first ask and the register holds no
sale for it, so it serves "No sale recorded for this
postcode since 1995" under the 28 October 2026 edition,
its recorded-sales count at first load exactly 0; not yet
loaded — a cold postcode is never answered from emptiness:
the check loads it first (Birkdale's own first rehearsal
check arrived cold and loaded before answering, resolving
the home itself only once its sales were filed; warm
postcodes are not reloaded). E16 1EG — the candidate for
targeted home E15's zero-sales row — is NOT a zero-sales
postcode: loaded at first ask in the same rehearsal, it
holds exactly one recorded sale (Flat 24, Crawford Point,
£148,000, 5 Jun 2009), so it serves the too-few-for-a-
median state instead; the zero-sales row above belongs to
CM1 6ER. Scotland and Northern Ireland postcodes get the
named not-covered state and are never loaded (EH1 1YZ
proven in the rehearsal).

**Rehearsal finding, pinned.** The sold-prices loader
takes its postcodes after a `--` separator (its own usage
line); without one, its argument filter silently drops
the first postcode — the rehearsal's first warm batch lost
CM3 2JT exactly that way, and the loader's golden check
passed over the remaining postcodes without naming the
loss. The brain invokes the loader with the separator,
and a unit test pins the invocation against a stub loader.

### Crime in the brain (M6.4)

Proved twice over: `tests/crime.test.ts` against the raw
Police.uk captures, re-derived with the loader's counting
rules; and the first load itself — on 14 Nov 2026 the real
loader filed KT17 1FH, KT17 1DR and CB6 1EH live (latest
published month 2026-09, so the filed window is the locked
Oct 2025 – Sep 2026) against a local PostGIS, and an
independent re-count from the saved raw responses matched
the filed artefacts exactly: totals, all 12 monthly counts
and every category tally. The rule is decision D24: the
answer is the filed artefact served as published — the
12-month total, the full category breakdown under the
publisher's own slugs, and the monthly counts as dated
facts. No trend is computed, no rate, ranking or comparison
exists, and no served string calls any place safe or
unsafe. Rung 1 and rung 2 serve the identical answer,
worded "recorded within 1 mile of this postcode"; rung 3
carries only the named state "crime counts need an exact
postcode"; Scotland and Northern Ireland carry the named
not-covered state.

| Check                                                     | Figure                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Birkdale total                                            | 330 recorded crimes within 1 mile of the postcode point, Oct 2025 – Sep 2026                                                                                                                                                                                                                                         |
| Birkdale split (all 14 published categories have a count) | violent-crime 133; anti-social-behaviour 65; robbery 29; criminal-damage-arson 20; other-theft 19; vehicle-crime 16; public-order 14; drugs 9; burglary 7; other-crime 6; shoplifting 6; possession-of-weapons 4; bicycle-theft 1; theft-from-the-person 1                                                           |
| Exeter total                                              | 10,722, same window and basis                                                                                                                                                                                                                                                                                        |
| Exeter split (all 14)                                     | violent-crime 2,893; anti-social-behaviour 1,852; vehicle-crime 1,266; other-theft 1,042; shoplifting 706; theft-from-the-person 654; drugs 487; public-order 477; burglary 432; robbery 351; criminal-damage-arson 283; bicycle-theft 105; other-crime 98; possession-of-weapons 76                                 |
| Minerva total                                             | 1,956, same window and basis — asserted as a served answer for the first time at this step                                                                                                                                                                                                                           |
| Minerva split (all 14)                                    | violent-crime 591; anti-social-behaviour 332; public-order 175; criminal-damage-arson 169; shoplifting 162; other-theft 132; vehicle-crime 122; burglary 88; drugs 73; other-crime 44; bicycle-theft 23; robbery 20; possession-of-weapons 14; theft-from-the-person 11                                              |
| Ewell Village KT17 1DR (fixed at first load)              | 2,361, same window and basis; split (all 14): violent-crime 769; anti-social-behaviour 383; criminal-damage-arson 206; vehicle-crime 198; public-order 191; shoplifting 167; other-theft 160; burglary 91; drugs 67; other-crime 52; bicycle-theft 30; robbery 22; possession-of-weapons 16; theft-from-the-person 9 |
| Hilgay CB6 1EH (fixed at first load)                      | 7 — the genuinely tiny rural count; only five categories have a count: violent-crime 3; criminal-damage-arson 1; other-theft 1; public-order 1; vehicle-crime 1. The nine absent slugs are not printed as measured zeros                                                                                             |
| Zero crimes in window                                     | CLOSED at M6.9: Hilgay counted 7, not 0 — but the D30/Q3 hunt filed two genuine zeros (CA20 1EX, LD5 4AD; see 'Empty answers, made deliberate (M6.9)'). The zero branch ("0 recorded crimes within 1 mile of this postcode, [window]") is now proven on real filed answers, locked as fixtures                       |

Monthly counts (the brain's order, oldest first — served
as dated facts, asserted exactly in the suite):

| Postcode | Oct 2025 – Sep 2026                                          |
| -------- | ------------------------------------------------------------ |
| CM3 2JT  | 22, 47, 28, 26, 14, 28, 37, 33, 34, 23, 26, 12               |
| E16 1GN  | 970, 891, 828, 810, 714, 901, 946, 1,024, 943, 940, 902, 853 |
| KT17 1FH | 180, 169, 155, 132, 123, 176, 165, 160, 179, 162, 168, 187   |
| KT17 1DR | 214, 197, 172, 145, 156, 185, 197, 213, 244, 212, 209, 217   |
| CB6 1EH  | 0, 0, 0, 2, 1, 0, 0, 1, 2, 1, 0, 0                           |

**The stale window, proven.** The brain's staleness
threshold is the loader guard's own: `CRIME_STALE_AFTER_MONTHS`
in `lib/crime.ts` is pinned by a unit test to the loader's
`MAX_LAG_MONTHS` (3), so loader, canary and brain trip on
the same line. Against the frozen Sep 2026 window the suite
proves the boundary both ways: served on 31 Dec 2026
(exactly 3 months behind) there is no stale line; served on
15 Jan 2027 (4 months behind) the answer carries "the
latest month we hold is September 2026 — Police.uk has not
published newer data we can file" with the totals, split
and months byte-identical to the fresh answer — the
last-good window serves in full, never suppressed.

**Loader finding, recorded.** The crime loader's argument
filter drops the slot its `--file` value would occupy, so
invoked bare in live mode the FIRST postcode is silently
never loaded — the same trap M6.3 pinned for the
sold-prices loader. The first load above was invoked with
a leading `--`, and all three postcodes filed. The loader
itself is untouched by this step.

### Flood in the brain (M6.5)

Proved in the local rehearsal on 14–15 Nov 2026 under the
standing scoped gate for flood work: the three EA layers
were read live from the EA services and filed into a local
PostGIS as a SCOPED filing — the filed shapes in a box
around each golden point (the 2-mile serving circle's
bounding square plus margin: 5,354 zone shapes, 1,990
rivers & sea shapes, 3,040 surface water shapes, deduped by
the service's feature id), at the same editions production
holds (zones 2026-10-21, rivers & sea 2026-11-03, surface
water 2026-11-10, each re-read from the services' own build
stamps on the night). Every golden point's 2-mile
neighbourhood is complete in that filing by construction,
so the served facts below are exact, and each was
cross-checked against an independent per-label formulation
of the same questions (separate queries, plain box
prefilter, no DISTINCT ON): all 12 layer cross-checks for
the universal three plus C7 agreed to the served
millimetre. The rule is decision D25: three products,
never merged, each with its own basis line and its own
source line carrying its own edition; every statement
about the postcode point on the published map, never the
home; rung 1 and rung 2 identical; rung 3 the named state
only; Wales, Scotland and Northern Ireland the named
not-covered state, detected from the filed lsoa_code's
first letter — never outward letters (proven on C8 Cardiff
W01001759 and Edinburgh S01014710, the Welsh answer
additionally asserted NOT to be any layer's absence state;
a real English SY postcode, SY1 1AD E01035061, serves).
All distances below are PostGIS geography distances from
the filed shapes — the serving basis.

| Check                         | Figure                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Birkdale zones                | point not in FZ2/FZ3 (Zone 1 remainder); nearest edges FZ2 0.841 (river · direct rainfall model), FZ3 0.845                                                                                                                                                                                                               |
| Birkdale rivers & sea         | no likelihood band published for the point; nearest Low 0.841, High 0.845, Medium 0.845, Very low 1.307                                                                                                                                                                                                                   |
| Birkdale surface water        | no band reaches the point; nearest Low 0.030, Medium 0.032, High 0.079 (the pinned ≤ 0.1 mi holds)                                                                                                                                                                                                                        |
| Exeter zones                  | FZ3 covers the point, covering detail exactly "river and sea · modelled"; FZ2 edge 0.138                                                                                                                                                                                                                                  |
| Exeter rivers & sea           | a FILED "Very low" polygon covers the point; nearest other bands High 0.159, Low 0.497, Medium 0.741                                                                                                                                                                                                                      |
| Exeter surface water          | no band reaches the point; nearest Low 0.005 (about 9 m — the EA WMS pixel sampling disagrees at this point; the polygon filing is what we serve), High 0.016, Medium 0.017                                                                                                                                               |
| Epsom zones                   | point not in FZ2/FZ3; nearest FZ2 0.404, FZ3 0.412                                                                                                                                                                                                                                                                        |
| Epsom rivers & sea            | no band published; nearest Low 0.404, High 0.412, Medium 0.412                                                                                                                                                                                                                                                            |
| Epsom surface water           | Low AT the point; Medium 0.007, High 0.028                                                                                                                                                                                                                                                                                |
| C7 Oxford OX1 1HD             | FZ3 covers + rivers & sea Medium covers; surface water NO band at the point — Low edge 0.002 away (see the correction note below)                                                                                                                                                                                         |
| C2 City Island E14 0BZ        | FZ3 covers (detail "river and sea · modelled and recorded"); rivers & sea NO band at the point — Very low edge 0.001 away (see the correction note below)                                                                                                                                                                 |
| C4 Kingston KT1 1JS           | FZ2 covers + rivers & sea Low covers                                                                                                                                                                                                                                                                                      |
| C3 High Laver CM5 0DR         | boundary case: under the serving query (ST_Covers) the point lands OUTSIDE both polygons — zones remainder state with the FZ2 edge 0.001 away, rivers & sea absence with the Low edge 0.001 away                                                                                                                          |
| C9 Hilgay CB6 1EH             | FZ3 covers; rivers & sea **Low** covers — the GAP left open at M5.1 ("band to read at first load") is closed by this read; surface water no band, Low 0.003                                                                                                                                                               |
| Surface-water High at a point | no golden point has one; the branch is proven on a point chosen from the filing itself — the point-on-surface (51.517107, 0.018839) of the filed High polygon nearest the Exeter point (its edge is the 0.016 mi proximity above): through the serving source it is covered by High, with Low and Medium edges 0.001 away |

**Three absences, three wordings** — Birkdale carries all
three on one home and the suite asserts them as three
distinct states with three distinct lines: zones "the
postcode point is not in Flood Zone 2 or Flood Zone 3"
(Zone 1 named only as the EA's name for the remainder);
rivers & sea "no likelihood band is published for this
point"; surface water "no surface-water band reaches this
point — below the lowest band this product publishes".
No served string says "no flood risk", and the
banned-wording scan (safe, flood-proof, will/won't flood,
at risk as a verdict, score/rating language, any
insurability or lending claim) covers every served string
and key.

**Definitions, as verified against the EA's own product
pages at build time** (each zone and band travels with
one): FZ3 "land having a 1 in 100 or greater annual
probability of river flooding, or a 1 in 200 or greater
annual probability of sea flooding"; FZ2 "land having
between a 1 in 100 and a 1 in 1,000 annual probability of
river flooding, or between a 1 in 200 and a 1 in 1,000
annual probability of sea flooding"; Zone 1 "land having
a less than 1 in 1,000 annual probability of river or sea
flooding"; High "a 1 in 30 or greater chance of flooding
in any given year"; Medium "a chance of flooding in any
given year between 1 in 100 and 1 in 30"; Low "a chance of
flooding in any given year between 1 in 1,000 and 1 in
100"; Very low "a chance of flooding in any given year of
less than 1 in 1,000".

**Divergences from the loaders' planar pins, named** (the
pins are degrees of latitude × 69.05; the brain serves
geography miles): Birkdale FZ2 pin 0.84 → served 0.841;
Birkdale FZ3 pin 0.84 → 0.845; Epsom FZ2 pin 0.40 → 0.404;
Epsom FZ3 pin 0.41 → 0.412; Epsom rivers & sea Low pin
0.40 → 0.404. The Exeter pins and the surface-water pins
agree with the serving basis at the printed precision
(High 0.159; Low 0.005 / High 0.016 / Medium 0.017;
Epsom Medium 0.007 / High 0.028; Birkdale Low 0.030 /
Medium 0.032 / High 0.079).

**Two prep expectations corrected by the filing.** The
M5.1 prep's WMS sampling put a surface-water Low AT the
C7 Oxford point and a filed Very low covering C2 City
Island; on the filed polygons both points sit just
outside — Oxford's Low edge 0.002 mi away, City Island's
Very low edge 0.001 mi (about 2 m) away. The served
answers above are the polygon truth, asserted as served;
the backup home TW18 3BU (Staines) was also read and does
carry the FZ3 + Medium pairing.

**Timing and index proof (scoped filing), and what is
owed.** EXPLAIN ANALYZE on the scoped filing shows both
serving query shapes — the ST_Covers covering read and
the radius-bounded ST_DWithin per-label nearest read —
using flood_layers_geom_idx. Full-bundle times on the
scoped filing in the local WASM engine (25 runs, means):
Birkdale 7,380 ms, Exeter 19,710 ms, Epsom 10,056 ms,
Oxford 10,399 ms — seconds, not the milliseconds of the
point-data brains, because the engine evaluates spheroid
distances over the EA's very high-vertex dissolved
polygons (the surface-water cuts alone carry 30 million
points). **The full-national-filing timing proof is OWED
TO CI**: the EA geoservice degraded through the build
night (Azure 504s, multi-minute page times) and the local
engine's ST_MakeValid wedged on the zones' invalid shapes
(see below), so the national filing could not be completed
locally; the timing that matters is native PostGIS at
national volume, which CI and the M12 production pass
must confirm.

**Filing notes from the rehearsal.** (1) The scoped
filing holds the shapes AS PUBLISHED: 665 of the 5,354
zone shapes are invalid as published (the band products'
shapes are all valid); the production loader repairs at
file time with ST_CollectionExtract(ST_MakeValid(...)),
which the local WASM engine could not complete over these
shapes (~77 rows in 2 hours before the run was stopped).
Every covering shape behind a golden answer above is
valid as published EXCEPT Oxford's FZ3 — and that shape,
repaired in isolation, still covers the point, so no
golden figure above depends on the repair either way.
(2) **Loader finding, recorded:** tonight's live zones
service carries features whose flood_source is "unknown"
(origin "local evidence", FZ2 and FZ3 — 7 seen in the
first 29,500 features read). The zones loader's contract
admits only {river, sea, river and sea}, so the loader as
shipped FAILS its live read against the current service
(it filed cleanly on 12 Nov 2026 — the collection changed
in place under the same edition stamp and the same
415,408 count). The rehearsal filed those features with
their detail verbatim ("unknown · local evidence"); none
of them touches a golden point's answer. Whether
"unknown" joins the published vocabulary is a founder
decision for a later step — M6.5 does not touch the
loaders. (3) A layer with no filing serves a per-layer
not-filed state ("this flood map is not filed yet, so no
answer can be given from it") rather than an absence read
from an empty table — the same judgment call M6.4 flagged
for crime, applied per layer here.

**D27 — "unknown" admitted (15 Nov 2026, step M5.19).**
The founder ruled on finding (2) above: "unknown" joins
the zones loader's published source vocabulary — filed
and served as published. The loader's SOURCES is now
{river, sea, river and sea, unknown} and its contract
error names all four; the flood How-we-check copy gains
the plain-English sentence "A small number of the
Environment Agency's flood-zone shapes do not state
whether the flooding is from rivers, the sea or another
source." The other two flood loaders gate bands, not
sources, and needed no change (checked at build). Proof:
a scoped live read on 15 Nov 2026 found the service
unchanged in count (numberMatched 415,408) and still
serving the word — the page at startIndex 1,000 carries
four unknown features (FZ2 and FZ3, origin "local
evidence"). One of them, feature
Flood_Zones_2_3_Rivers_and_Sea.1070 (FZ2, detail
"unknown · local evidence", a small polygon on the south
Cornish coast), is held verbatim as part 4 of the zones
fixture — byte-identical to the live feature served the
same day — taking the fixture to 463 features (FZ2 124,
FZ3 339). Before the change, the loader's fixture
verify-only run failed on that fixture with the contract
error in finding (2); after it, the run passes (463 read,
golden homes OK). The brain serves a filed
unknown-source row end-to-end with the detail verbatim
(tests/flood.test.ts, the D27 describe — lib/flood.ts
carried no detail vocabulary lock to extend). Migrations
twice PASS in the local rehearsal. The fixture's filing
into a database remains CI's proof, as it has always
been for this loader: the local WASM engine's
ST_MakeValid swap wedged on the fixture's dissolved
shapes (10 minutes, no completion — the same wedge as
the national filing above), so the local rehearsal
stopped at the scoped gate and the filing itself is
owed to CI's database job.

### Constraints & area in the brain (M6.6)

Proved in the local rehearsal on 15 Nov 2026: a fresh
PGlite PostGIS filed with the fullest local filing — the
national planning, heritage and green-belt files (the M5.2
builds' own 12 Nov 2026 downloads: 9,798 conservation
areas, 7,521 Article 4 areas, the 116-organisation gate,
181 green-belt pieces, 379,169 listed buildings, 20,007
monuments), the full ONSPD August 2026 directory
(1,810,363 postcodes, extracted from the project's own
zip), the national IMD File 7 (33,755 LSOAs) and PCM 2024
air file (254,905 squares), and the repo fixtures for
Census (the three golden MSOAs), council tax (13
authorities), benefits, noise (12 rows), priority habitats
(1,716 patches), PVGIS (3 cells) and nature designations
(the golden cuts of the Natural England services). EPC
artefacts were filed by the loader's own fixture path for
CM3 2JT (42 certificates) and E16 1GN (12), and for
KT17 1FH from the M4.5 live captures (25 certificates; the
certificate documents were re-fetched through the EPC
connector helper for the rehearsal only). Every fact below
was read back through the real database source
(`createAreaSource`) and the real bundle builder. The rule
is decision D26: one bundle of per-dataset sections, each
with its own facts or named state, its own source line
with that dataset's own edition, its grain named in its
words, and depth encoded — IMD, Census, benefits and
solar are report-depth; the headline projection
(`projectHeadline`) carries constraints, heritage, nature,
the EPC band, the council-tax authority figure, the NO2
figure and the road day band only, and is a projection of
the bundle, never a second read. All distances are
PostGIS geography distances from the postcode point.

Locks on the serving basis. Constraints: Birkdale —
conservation area none-found in the national data (nearest
Chelmer and Blackwater Navigation, 1.473 miles), Article 4
not published (nearest filed area West Bowers Farm,
Woodham Walter, 1.584), green belt none-found (nearest
London belt edge 5.831 miles in the beyond form). Exeter —
Article 4 not published (nearest London City Island,
0.617). The Epsom flat — Ewell Village conservation area
and Article 4 area both 0.099 miles away, green belt
(London) 0.101. C1 is inside both Ewell Village areas, its
Article 4 detail the codes 1A;1C;1D;1F;2A;2B, translated at
report depth (1A "extensions and other alterations to a
house", 2B "a new or altered access to a road"; an unknown
code serves untranslated, never invented). C2 is inside
the London City Island Article 4 area. C4 is inside the
KINGSTON OLD TOWN CONSERVATION AREA (filed name verbatim)
and a Kingston Article 4 area whose detail is filed as
prose, not codes — prose serves as its own words. C7 is
inside Oxford's "Central" conservation area and its
"Houses in Multiple Occupation Article 4 Direction"
(detail 3L, "changes of use (Part 3 Class L)"). Heritage:
listed counts within 2 miles — Birkdale 102 (nearest
White Hart Cottage, 1123430, II, 0.187), Exeter 213
(nearest the Chapel of St George and St Helena, 1406622,
II, 0.322), the Epsom flat 315 (nearest PIT HOUSE,
1214537, II, 0.169), Oxford 1,087. C4's point IS the
listed MARKET HOUSE (1358428, II*, 0.000 miles) and C3's
SAWYERS (1337547, II) sits 0.008 away: both serve the
at-the-point "check the NHLE entry" line, never "this
home is listed". C5's point falls inside the Oatlands
Palace monument; its listed gates (1191628) are 0.024
away. Hilgay: zero listed within 2 miles (beyond form:
Apes Hall, Littleport, 2.532), nearest conservation area
Littleport 3.572, nearest monument 4.475. Nature, grouped
by place: Exeter's Gilbert's Pit (Charlton) SSSI at 1.902;
the Epsom flat's Stones Road Pond SSSI at 0.673; C6
stands inside Epsom and Ashtead Commons SSSI and the
London green belt; KT22 8QA's Mole Gap to Reigate
Escarpment SSSI and SAC over the same ground at 0.393
serve as ONE place ("SSSI · part of Mole Gap to Reigate
Escarpment SAC"), and the point is inside a filed ancient
woodland polygon and the green belt; C3's beyond place is
"Epping Forest SSSI — SSSI · part of Epping Forest SAC"
(4.019). Ancient woodland absence is "no ancient woodland
recorded in the inventory" (Birkdale's nearest unnamed
shape 0.387, the Epsom flat's 1.41). EPC: Birkdale's one
certificate serves (2490-1633-0432-1002-3023, band B,
141 sq m, 2022-10-07, SAP — predicted, as filed); Exeter's
two both serve, newest first (91 sq m 2023 RdSAP, then
71 sq m 2013 SAP) with the disagreement named; at
KT17 1FH the three Flat 4s separate exactly — Flat 4
Minerva House matches only 8401-7039-6529-6723-9906
(band B, 70 sq m, 2019-11-07, SAP) of the 25 filed.
Council tax joins on the directory's council name for all
four golden councils: Braintree £2,280.34 (parish average
£64.54), Newham £1,944.23 (GLA £510.51), Epsom and Ewell
£2,530.84, Cardiff £2,013.18 (community council average
£4.32); Tower Hamlets (C2) £1,837.78 also joins. Census:
the three MSOAs reproduce on their own per-table totals
(Birkdale totals 8,141/8,136/8,138/8,138/3,398/3,399/
3,397 across the seven tables), median ages calculated
from the single years — Birkdale 46.5, Exeter 33.4, the
Epsom flat's MSOA 44.5 (computed and locked at this
build) — social-rented 469 of 3,397, 1,631 of 3,330
(49.0 percent), 241 of 4,440. IMD deciles 8 / 3 / 10 with
Exeter's Barriers to Housing domain decile 1; the served
summary is the FILED summary string, character for
character (pinned by test against the loader's own
renderer); the score and rank are never served, asserted
absent at serialisation. Air reproduces the locked PCM
2024 triples exactly (Birkdale NO2 8.150298, Exeter
21.71409, the Epsom flat 12.49256 µg/m³), NO2 the one
headline figure. At report depth each figure carries
its yardstick lines (M6.29, D50/D57): the positions
computed from the locked triples are Birkdale below
both / between / below both, Exeter between ×3, the
Epsom flat between / between / below both — below-both
×3, between ×6 (each between carrying the pinned
summary "within the UK legal limit, but above the
stricter WHO guideline" verbatim), above ×0. The
headline NO2 stays bare, and no yardstick content
reaches the short bundle. Noise (fixture filing): Birkdale
road Below 55 / Below 50, rail and airport no-modelled;
Exeter road 55–59 / Below 50, airport Below 55 by day and
no-modelled by night (the two states distinct); C1's rail
pair is a real below-range pair (Below 55 / Below 50).
Benefits, three series separate: Claimant Count Sep 2026
15 / 1.6 percent, 120 / 8.6, 20 / 1.2; UC people May 2026
117 / 383 / 93; UC households Apr 2026 105 / 83, and
Exeter's LSOA absent from the Households cube serves
not-published-for-this-area, never a zero. Solar (fixture
cells): yields 1,057.65 / 1,009.96 / 991.49 kWh/kWp on the
filed standard basis, worded as facts about the location;
a point whose cell is not filed (C3) serves "not filed
for this area yet", distinct from an empty grid's
not-filed state. Priority habitats (fixture filing of
1,716 patches): Birkdale's nearest a traditional orchard
at 0.249 with five types within 2 miles, aggregated
only — never patch counts, never "protected".

Divergences from the prep-era pins, named. (1) Exeter's
listed count is 213 on the serving basis, not the prep's
215 (the prep counted on a mixed basis). (2) Several prep
distances were 2-decimal roundings of the geography
figures now locked at 3 decimals (1.473, 0.617, 0.322,
0.169, 2.887, 0.393 and the rest above), and several
filed names carry their register suffixes ("Gilbert's
Pit (Charlton) SSSI", "PIT HOUSE", "MARKET HOUSE"). (3)
Article 4's "none found" cannot yet be served for ANY
council through the real source: the gate table
(migration 0007) is keyed by the platform's organisation
ENTITY number and no filed table bridges the directory's
council NAME to that number (the planning files publish
the number only; the platform's organisation register is
not filed). The source's gate therefore answers false —
fail-safe: Birkdale and Exeter serve "not published" as
ruled, and a publishing council's absence (the Epsom
flat) also serves "not published" until the bridge is
filed. The gated branch is proven by unit test against a
gate answering true. Filing the bridge is an M5-class
job, named for M12. (4) The EPC section's solar facts:
the M4.5 loader's minimisation drops the register's solar
fields, so no filed certificate carries them and no EPC
solar fact can serve in V1; the brain passes them through
if a future filing keeps them. (5) Exeter's ancient
woodland beyond form (Greenwich Park, 2.51 in the prep's
live read) and Hilgay's priority habitat at 0.123 (the
prep's live read) do not reproduce on the fixture
filings — those shapes sit outside the cuts filed; the
brain's beyond and aggregated paths are proven on the
shapes that are filed, and both facts await the national
filings at M12. (6) E16 1EG's filed-zero EPC state is
proven at unit level and by the loader's own golden; in
this rehearsal no artefact was filed for it (filing needs
the register token, which never enters this environment),
so the real source serves the cold path's not-filed after
the load attempt fails — the honest token-less behaviour.
(7) Welsh coverage rulings taken at this build: green
belt absence in Wales is sparse coverage (the filed belts
are England's designation layer), and the listed section
serves sparse coverage with NO count outside England
(the filed list is England's NHLE; a Welsh zero would be
a false figure) — Cardiff's conservation-area absence
was already ruled sparse coverage in D26. (8) The
rehearsal's first postcode filing carried the fixture's
cut-down Documents lookups, under which Epsom and
Cardiff's directory rows held LAD codes instead of names
and their tax joins served not-published; with the full
ONSPD Documents both joins serve (above). The brain's
behaviour under a code-carrying directory row is the
named mismatch state working as designed — never a
borrowed figure.

Timing (local PGlite WASM engine; native production
timing is M12's confirmation, as for M6.1/M6.2/M6.5):
full-bundle means over 10 runs — CM3 2JT 1,098 ms,
E16 1GN 899 ms, KT17 1FH 692 ms, KT21 1AG (inside an
SSSI) 685 ms, OX1 1HD (1,087 listed) 1,104 ms, CB6 1EH
(near-empty) 1,696 ms. The profile shows the cost is the
beyond-step walks (5/10/20/40 miles) over near-empty
layers — designation facts 470–1,026 ms and priority
habitats 210–514 ms per point on this engine, against
1–53 ms for a single planning layer and ~1 ms for air.
EXPLAIN ANALYZE proves every nearest query is
radius-bounded and index-driven: Bitmap Index Scan on
planning_layers_geom_idx for planning nearest, Index Scan
on listed_buildings_geom_idx for listed points, and the
designation overlap self-join on planning_layers_geom_idx
— no full-layer distance sorts. Priority-habitat timing
is fixture-volume only (1,716 patches); its national
re-proof is owed at M12, as are the noise and solar
first-pass filings that lift those sections' guards.

### The short version (M6.7)

`lib/short-bundle.ts` — `buildShortBundle({ nearby,
soldPrices, crime, flood, area })`, one pure derivation
over the five full bundles (decision D28): no data
source, no clock, no database handle in its signature,
so the same inputs always derive the same short bundle
(proven by mutation: changing a source behind an
already-built bundle changes nothing; rebuilding the
bundle changes the output). The five inputs must share
one rung — mixed rungs are refused — and at rungs 1–2
one postcode. Section order: sold prices, flood, crime,
EPC, council tax, constraints, heritage, nature, air,
noise, nearby essentials. The area input is read only
through `projectHeadline`, the area bundle's own
headline path; the slimming beyond it happens over the
projection's output.

Headline goldens, proven twice — in the unit suite
(tests/short-bundle.test.ts, fake sources carrying the
locked figures) and against rehearsal-built REAL
bundles (each brain's own rehearsal database: M6.2
nearby, M6.3 sold prices + address, M6.4/M5.19-gate
crime, M6.5 flood cuts, M6.6 area; the temporary prove
suite was deleted after passing, per the M6.6 pattern):

- Sold prices: Birkdale own £588,995 (15 Jun 2023) and
  median £588,995 over 29 (1996-12-20 to 2026-07-20);
  Exeter own £270,000 (17 Jan 2014), median £310,000
  over 9; Minerva Flat 4 own £420,000 (3 Dec 2019),
  median £399,999 over 27, building median £392,499.50
  over 12 — each with its counted/span line and the
  not-a-valuation explainer, never compared. The other
  Flat 4's £341,000 appears nowhere in Minerva's short
  bundle. At rung 2 the own-sale keys are ABSENT (not
  null) and Exeter's £270,000 / 2014-01-17 appear
  nowhere.
- Crime: totals 330 / 10,722 / 1,956 with ASB as its
  own line (65 / 1,852 / 332), stale line null on the
  current window and verbatim ("the latest month we
  hold is September 2026 — …") when the same filing is
  read in January 2027.
- Flood: all three layer lines per home, never merged,
  each with its own source line; Birkdale's three
  absences keep their three distinct states (zone-1,
  no-band-published, below-lowest-band); Exeter's zones
  disagreement (Flood Zone 3 covering, "river and sea ·
  modelled", against a filed "Very low" likelihood
  band); Minerva surface water inside Low. No EA
  definition is carried — definitions stay at report
  depth.
- Nearby: six categories only. Nearest + count proven
  against the real filings: primary schools (Birkdale
  Hatfield Peverel Infant and Nursery School 0.289;
  Minerva Ewell Grove 0.292), stations (0.563 / Royal
  Victoria 0.414 / Ewell East 0.246), nurseries from
  the M5.17 register extract (Shining Stars 0.110, 5
  within; Cribs Day Nursery 0.088, 96 within; Nestots
  0.174, 39 within).
- Area: EPC headline band B for all three; the council
  tax figure inside its correction line ("Band D
  averages £2,280.34 a year in Braintree (the council's
  scale — not this home's bill)"; £1,944.23 Newham;
  £2,530.84 Epsom and Ewell); listed counts 102 / 213 /
  315 with the single nearest (White Hart Cottage
  0.187; Chapel of St George and St Helena 0.322; PIT
  HOUSE 0.169); air NO2 as the one headline figure
  (8.150298 / 21.71409 / 12.49256); road day band
  (Below 55 dB / 55–59 dB / 55–59 dB). Article 4 serves
  its plain inside line only (Ewell Village, KT17 1DR,
  inside both the conservation area and the direction):
  the filed codes "1A;1C;…" and their translations
  appear nowhere in the short bundle; Braintree and
  Newham serve the not-published line verbatim.

Named-state witnesses at headline depth: Crawford
Point E16 1EG (EPC filed-zero with no band, crime
not-filed, the too-few median over 1 sale); Beaulieu
CM1 6ER (loaded-none sold prices — "No sale recorded
for this postcode since 1995" with the 2026-10-28
edition line — and the surface-water layer not-filed);
Scotland EH1 1AA (not-covered across sold prices,
crime, flood, council tax and noise; heritage
sparse-coverage with a NULL count, never 0).

Structural proofs: rung 3 carries all eleven sections
as their brains' named states with a deep figure-freedom
scan (every leaf a string, no figure-named key below
the section level); rung 4 the same shape from the
no-location bundles; the depth lock (no census / IMD /
benefits / solar key or payload anywhere in the short
shape, asserted against a full bundle that provably
contains them — Birkdale's 7,772, the UC counts, the
solar yields); the banned-wording union scan (the
D23/D24/D25/D26 lists) over nine short bundles; no "%"
in any served string; no comparison-named key.

Divergences found by the rehearsal, named plainly:
(1) the prep's pin of 2 primary schools within 2 miles
of Birkdale is wrong against the national schools
filing, which serves 6 (nearest exact at 0.289) — the
derivation projects the bundle's count faithfully, so
the pin, not the code, is corrected here. (2) The
M6.2 rehearsal filing's name forms differ from the
prep's pins in two places (the GP files as "SYDNEY
HOUSE SURGERY"; Hatfield Peverel's station files with
a "Rail Station" suffix) — names travel verbatim from
the bundle, so both surfaces inherit the filed form.
(3) Exeter's station count in that filing is 101 filed
stop points of the rail types the category reads —
the full bundle's own countWithin, projected
faithfully; the nearest (Royal Victoria Station,
0.414) is exact.

No broadband slot exists in the short shape: M6.17
extends the derivation when its brain exists.

### Caching the brain's answers (M6.8)

`lib/bundle-cache.ts` — the cached builders
(`buildCrimeBundleCached`, `buildFloodBundleCached`,
`buildNearbyBundleCached`, `buildAreaBundleCached`,
and `createCachedBrains(db)` wiring the real sources),
decision D29. One entry per brain bundle in
migration 0020's `bundle_cache`, keyed (postcode,
brain, rung, home key); sold prices has NO cache path
(asserted: the dependency map and the wired set carry
exactly the four cached brains). Invalidation is the
per-brain version vector — the dependency loader
items' last-success stamps from `loader_run_items`
(the mapping is pinned by test against
LOADER_SCHEDULE) plus the filed guard counts for the
filings that move no stamp: flood's per-layer counts;
the area bundle's noise totals (table-wide and for
the postcode), priority-habitat count, listed count,
solar-grid count and council-tax charges count; the
crime and EPC artefacts' content hashes (the
cold-load guard); and the directory's serving fields,
taken from the fresh resolution itself.

Proven in the unit suite (tests/bundle-cache.test.ts,
23 tests, the cache's database port faked at the
AddressQueryable seam) and against the real engine in
the step's scoped rehearsal (PGlite PostGIS,
migrations twice including 0020; the full local
runner pass is not the gate — CI's database job is):

- A second identical check serves from the entry,
  deep-equal to the first, with zero further
  builder-source calls — for all four brains.
- Crime's stale line is never stored: the stored
  entry's line is null, and serving the same entry
  either side of the 3-month boundary (window to
  September 2026; now November 2026 vs January 2027)
  flips the line to the named stale line with no
  re-file and no cache write between.
- A filing that moves a stamp (crime re-filed, total
  330 -> 331, new load-crime success recorded) busts
  the entry and the stored version moves with it; a
  filing that moves only a guard count (a flood
  layer's count) busts it too; a moved directory
  point busts every entry for the postcode; an EPC
  cold load's artefact rewrite busts the area entry
  through its content hash with no stamp moving.
- The operator-job trap, closed: noise rows inserted
  directly with NO runner record bust a cached area
  bundle whose noise section was not-filed, and a
  flood layer's first filing busts its cached
  not-filed state the same way.
- Rung and home separation is structural: a rung-1
  Minerva entry misses at rung 2 (the rung-2 bundle
  carries no certificate number anywhere), two
  Flat 4s in one postcode (Minerva House, Jupiter
  House) hold separate entries and serve only their
  own certificates, and crime entries are rung-keyed
  too.
- Write-skip: a crime not-filed bundle and an area
  bundle whose EPC cold load failed are never
  written — the next check retries inside the
  builder and serves, so a failed load is never
  frozen into an entry (the M6.9 prep's handover
  requirement).
- Poison and absence: an entry whose bundle
  disagrees with its key, and a non-object stored
  bundle, both degrade to recompute and are
  overwritten; with the cache table dropped, checks
  serve computed with no error surfacing.

### Empty answers, made deliberate (M6.9, decision D30)

The prep's census — 71 state slots across the six
brains, 30 distinct state strings — is now a test
(tests/state-matrix.test.ts, 70 tests): every brain,
every state in the census, served through the real
builder against a fake source and asserted, wording
included. What D30 changed:

- Crime cold load (Q1): a covered postcode with no
  filed artefact is loaded on first check through the
  loader path — the brain invokes load-crime.mjs with
  the postcode after `--` (the argument-filter trap,
  pinned by a stub-loader test) — and then serves.
  Not-filed remains only for load-attempted-and-failed,
  its reason in EPC's form: "crime counts could not be
  loaded for this postcode, so no crime answer can be
  given". Cache interplay proven with the cold load
  live: the failure state is still write-skipped, and
  because the version vector is read before compute, a
  successful cold load's own filing busts the
  just-written entry exactly once via the artefact
  content hash, then the entry serves.
- The zero-crimes hunt (Q3) — GAP CLOSED. Candidate
  set (remote, crime-covered postcodes, coordinates
  verified via postcodes.io), each loaded live through
  the loader path on 15 November 2026, window October
  2025 – September 2026, 1-mile basis: CA20 1EX
  (Wasdale Head, Cumberland) **0**; NE48 1AA (Falstone,
  Kielder, Northumberland) 6; CA9 3JH (Alston Moor,
  Cumbria) 100; LD5 4AD (Llanwrtyd Wells, Powys) **0**;
  SY25 6QT (Tregaron, Ceredigion) 7; LL48 6AA
  (Penrhyndeudraeth, Gwynedd) 181. Two genuine zeros:
  their filed artefacts are locked verbatim as
  tests/fixtures/police-uk/zero-witness-ca20-1ex.json
  and zero-witness-ld5-4ad.json, and the matrix serves
  both as counts ("0 recorded crimes within 1 mile of
  this postcode, October 2025 to September 2026",
  breakdown empty). CA20 1EX's zero was itself served
  through the new cold load in the scoped rehearsal.
- Council tax (Q4): the state and line moved from the
  not-published family to not-filed — "this council's
  council tax charges are not filed yet — most
  councils are filed in the spring pass, and until
  then no figure can be given". MHCLG has published
  the charges; the gap is our filing backlog. Article
  4's not-published and DWP's
  not-published-for-this-area did NOT change.
- Supermarkets (Q5): the empty answer takes the What's
  Nearby map wording (the same OSM table, the same
  honesty); the ground-truth form is retired
  everywhere, short bundle included.
- Short-bundle lines (Q6): the headline projection now
  carries each section's own line for EPC, council tax,
  air and noise, and the short bundle serves them
  verbatim in the named states (the served council-tax
  headline keeps its D28 composed line); the nature
  designations line travels too.
- Settled fixes: nature designations and nearby
  categories gained filed-count guards in the flood
  form (a designation type with no filing names itself
  and withholds only its own absence; rows filed under
  an unfiled type are never served); the essential-
  category silence (measured zero, no named nearest)
  now serves the category's empty line; the
  sold-prices median's none-recorded line speaks of
  the counted set when other sales are recorded ("no
  recorded sales in this postcode count toward a
  median"); one polygon absence template ("no X covers
  this postcode point in the national data" — green
  belt joined Article 4 and monuments); one two-part
  not-filed sentence form; not-covered lines name the
  nation's own publisher where one exists (crime names
  Police Scotland and the Police Service of Northern
  Ireland; sold prices name Registers of Scotland) and
  Census's not-covered line names the nation; Article
  4's not-published line names the council's own
  planning register as where the answer lives. Flood's
  per-layer not-filed is unchanged in meaning (Q2),
  asserted in the matrix.
- Scoped rehearsal (PGlite, fresh migrated database):
  the cold load served CA20 1EX's zero through
  createCrimeSource; on the empty point tables every
  nearby category served not-filed through
  createNearbySource, one filed supermarket point
  restored that category to within, and GP stayed
  guarded; through createAreaSource the nature guard
  named all four designation types, and council tax,
  noise and solar served their not-filed states. No
  migration in this step.

### Planning applications — the hand-off (M6.12, decision D31)

D14's deliverable, built: the area bundle gains a twelfth
section, `planningApplications`, serving the new state
family **handed-off** — the data exists and is public,
and is deliberately not held, so the answer is a pointer.
One correction to D14 rides with it: the "Planning Portal
postcode search" the decision named does not exist (the
Portal is the submission service and runs no applications
search); the signpost is GOV.UK's "Search the register of
planning decisions", which covers England and Wales in
one target. Report depth only — the short bundle is
unchanged (D28's eleven sections stand), and the headline
projection cannot carry it.

- The council is named from `resolution.directory.council`
  — the same filed string the council-tax section joins
  on (Braintree £2,280.34, Newham £1,944.23, Epsom and
  Ewell £2,530.84 above); no second naming source, and no
  LPA code exists in the filed data. Where the directory
  name is null the section serves its unnamed form. One
  named limit: the directory names the council, not
  always the planning authority (national-park authorities
  and the two London development corporations are the LPA
  for their areas) — the signpost resolves the correct
  authority from the postcode the family types, and the
  line never claims the council decides every application.
- Witnesses (state handed-off throughout; asserted in
  tests/area-bundle.test.ts and the state matrix):
  Birkdale CM3 2JT → Braintree, GOV.UK link; Exeter Road
  E16 1GN → Newham, GOV.UK link; Minerva KT17 1FH →
  Epsom and Ewell, GOV.UK link; Cardiff CF11 8AA →
  Cardiff, GOV.UK link (the Wales form); Edinburgh
  EH1 1AA → City of Edinburgh, **no link** (Scotland has
  no national register; viewing is per-council); Belfast
  BT1 1AA → Belfast, the Northern Ireland Public
  Register link — the one link that lands on a real
  register; Mid Ulster (BT45 6EB directory fixture, the
  filed name "Mid Ulster") → the exception line naming
  its own portal, no link. An unknown-nation resolution
  names the council and carries no link; rung 1 serves
  the section identically at rung 2; rung 3 carries it
  only as its named unavailable reason ("planning
  applications need an exact postcode" — the twelfth
  per-section reason in the state matrix, which now
  asserts the handed-off family in all its forms).
- Every link is a plain landing page, asserted
  character-for-character with no network: no deep-link
  pattern is verified for any of these form-driven
  services, and the postcode appears in no URL we emit.
  Nothing is framed, embedded or fetched. The explainer
  the section carries is the How-we-check text for
  planning, with D14's guardrail in the section itself:
  an application is a proposal, not a decision, and
  permission does not mean anything has been built. The
  NI register's own caveat rides here: nidirect states
  the full official Planning Register is not available
  online — the link is to its public face.
- The canary contract (loaders/README states it in
  full): a `planning-application` warning changes nothing
  the brain serves — the handed-off state, its lines and
  its links stay byte-identical until a filing step is
  built, gated and shipped. Re-open path: canary warning
  → founder decision → new filing step on the M5.12
  prep's field mapping (Section 1.3) → the handed-off
  state is replaced by filed sections only in that step.
  The canary's one stale string was corrected in this
  step: its warning named migration 0014, taken by
  council tax at M5.10 — it now names no fixed number
  ("the next free migration number"), in the warning line
  and the module header.
- Cache position: the section derives from the
  resolution alone and rides inside the cached area
  bundle; the D29 version vector's directory guard
  carries the council and area-code strings, so a
  re-filed directory row busts the entry by construction
  — proven in the unit suite (a cached Braintree entry
  serves unchanged; the same postcode re-filed as
  Uttlesford recomputes and names Uttlesford) and again
  in the scoped rehearsal against the real table.
- Scoped rehearsal (PGlite, fresh database, migrations
  applied twice, newest still 0020): the seven witnesses
  filed as directory rows with one address each, resolved
  through the real address source and built through the
  real database source — every nation form served as
  ruled; the cache then served Birkdale's second check
  from the real bundle_cache entry (deep-equal; JSONB
  does not preserve key order, the M6.8 finding) and a
  council re-file busted the entry. No migration in this
  step; docs/schema.md needs no new entry (no table).

### Company ownership — the answer behind the flag (M6.13, decision D32)

The area bundle's thirteenth section, and the only
flag-gated one: `COMPANY_OWNERSHIP_ENABLED` in
lib/site.ts stays false in the shipped code, so while
the flag is off the section's key is ABSENT from every
served shape — not null, not a named state — the brain
never reads the two tables, the D28 short bundle is
untouched (eleven sections, no company key in either
flag position), and exposure still waits for HM Land
Registry's written clause-3.2 answer and the founder's
go. Tests force the flag on through an injected build
option (the house seam pattern); shipped call sites
pass nothing. The section sits at report depth, so the
headline projection can never carry it.

**Witnesses** (real filed fixtures,
tests/fixtures/company-ownership/ — November 2026
extracts; the standing witnesses above):

- **19 Birkdale Rise, CM3 2JT** — the clean No over a
  non-empty slice: CCOD AA53500 "39, 41 and, 49
  Birkdale Rise" and AA53502 "35, 37, 43, 45, 47 And
  32 To 44 (inclusive), Birkdale Rise", both SAGE
  HOMES RP LIMITED. The line: "this home's title is
  not in HM Land Registry's company-ownership data as
  at November 2026" — dated by the EARLIER of the two
  dataset editions, the lookup being only as complete
  as its least current dataset. The No's three holes
  (charities excluded from both datasets by category;
  unregistered land invisible; registration lag) sit
  in the explainer, never in the line.
- **6 Exeter Road, E16 1GN** — the No at own-title AND
  building level: the postcode slice is empty because
  the company titles sit at 8 Exeter Road, E16 1GP, a
  different postcode. **The standing limit: matching
  is keyed to the home's exact postcode** (the
  datasets' only index); a company title one postcode
  away is invisible, and the answer is the plain No.
- **Flat 4, Minerva House, KT17 1FH** — own-title No
  plus the building line: OCOD SY876459 "Flats 1-9
  Minerva House, 12 Ceres Crescent", Freehold,
  ADRIATIC LAND 11 LIMITED, GUERNSEY, no company
  number (`no-number-recorded`). The section's state
  is the own-title answer (not-company-owned); the
  building line serves alongside it, naming the
  proprietor as filed.
- **Flat 4, Juno House, KT17 1FH** — own-title Yes:
  CCOD SY857898 "4 Juno House", Leasehold, CLARION
  HOUSING ASSOCIATION LIMITED, company number **7686
  as filed** — no Companies House snapshot is held
  under it (`number-not-in-the-snapshot`); the
  snapshot's RS007686 is never repaired in and never
  appears in served output. Plus the Adriatic
  building line OCOD SY874424 "Flats 1 To 8
  (inclusive), Juno House". The lead: "a registered
  proprietor of this home's title is a company".
- Supporting forms: Flat 2, Juno House (CCOD SY873488
  SOMY RESIDENTIAL LIMITED, 13678133, snapshot served:
  Active, incorporated 2021-10-13, SIC as filed);
  Flat 4, Jupiter House (bare-building building line,
  OCOD SY874425 "Jupiter House, 10 Ceres Crescent").

**The trap set** (all sprung in tests, on the filed
fixtures): multi-house titles match by NUMERIC
MEMBERSHIP, never substring — 19 matches neither SAGE
title, house 4 and house 9 match nothing (the "49"
substring and "44"/"9" digit traps), 39 matches BOTH
SAGE titles (enumerated in one, inside the other's
range) and serves both whole, 44 matches only the
range title; "Flats 1-9" range forms and bare-building
forms are the BUILDING's title, never the flat's own;
a flat number inside a range owns nothing;
`multiple_address_indicator` (N on every filed row)
is never used. Form decides own-title vs building
line; the register's address text itself never serves
— only the parsed facts do.

**Served content rules**: the Land Registry title
number serves with every matched title (it makes the
£7 title-register hand-off in the explainer
actionable); `price_paid` and `date_proprietor_added`
NEVER serve (the facts type does not carry them);
snapshot facts serve only as D15 allows (name,
number, status, incorporation date, SIC — no
officers, PSC, parents, charges, no registered
office); per-dataset source lines carry "Information
produced by HM Land Registry © Crown copyright
{edition year}", the year bound to each dataset's own
edition. States: served / not-company-owned /
needs-exact-home (rung 2, the D26 ladder) /
not-covered (Scotland and Northern Ireland name their
own registers — Registers of Scotland, Land &
Property Services — never a No) / not-filed
(per-dataset guard: either dataset's table empty →
not-filed, never a No).

**The two M6.8 cache obligations** (proven in
tests/bundle-cache.test.ts and in the rehearsal
against the real bundle_cache table): (a) the area
version vector carries `load-company-ownership`'s
stamp PLUS per-dataset filed-count guards
(company_titles per dataset, company_snapshots), so a
hand-run re-filing that moves no stamp still busts;
(b) the cached area bundle's shape contract includes
the company key's PRESENCE matching the current flag
position — an entry written flag-off degrades to a
recompute on a flag-on read, and vice versa, both
ways proven. The section's own not-filed state is not
a cache write-skip: the guard counts bust it on the
first filing.

**Rehearsal record** (scoped PGlite pass, 15 Nov
2026): migrations applied twice, newest still 0020 —
no new migration in this step; the loader filed the
fixture slices (11 titles: 8 CCOD, 3 OCOD; 2 snapshots
of 3 filed numbers; golden areas OK); the four goldens
above served through the REAL database source with
the flag forced on, the section absent flag-off, and
both cache obligations proven against the real
bundle_cache table (a flag-off entry recomputed on a
flag-on read; deleting the Minerva building title
busted the cached entry through the OCOD guard count
and the building line disappeared). The temporary
prove suite was deleted after passing; CI's database
job is the final word.

## Monthly cost — two derived lines, never a total (M6.14, decision D33)

D33 adds NO section and NO total: two derived lines inside their
existing sections of the area bundle, each derived at build time
from a fact already filed — nothing new is filed for either line
except the EPC loader's widened minimisation below. A total field
may not exist anywhere in any served shape, and the refusal is
structural, not wording: tests scan the built bundles' keys for
anything total-shaped (`/total|sum|combined|overall/i`) and the
served strings for the banned monthly phrases ("your monthly
cost", "cost of living", "you will pay", "typical monthly bill",
"monthly total", "combined monthly"). The headline projection
serves neither line (Q4): the short bundle's council-tax line
stays the D28 annual line, and the EPC headline stays the band —
the monthly lines are report depth, like the band table.

Council-tax monthly line (D16 inside the line — the council's
scale, never this home's bill). The line is the authority's filed
Band D area average divided by 12, penny-rounded, labelled
"spread evenly over 12 months"; each band row gains the same
division; the section's explainer carries the 10-instalment fact
("most councils bill over 10 monthly instalments, so each
instalment is higher than the spread figure"):

| Home                                    | Filed Band D average | Monthly line figure |
| --------------------------------------- | -------------------- | ------------------- |
| 19 Birkdale Rise (Braintree)            | £2,280.34            | £190.03 a month     |
| 6 Exeter Road (Newham)                  | £1,944.23            | £162.02 a month     |
| Flat 4, Minerva House (Epsom and Ewell) | £2,530.84            | £210.90 a month     |

Birkdale's line, verbatim: "Braintree's average Band D council
tax spread evenly over 12 months is £190.03 a month — the
council's scale, not this home's bill". A derivation test pins
the arithmetic itself (a variant filing of £999.99 serves £83.33
a month), so the line is proven derived, not filed twice. States:
the section's not-filed state carries NO monthly line (monthly
fields null, bands empty, no monthly figure anywhere in the
section); not-covered likewise; rung 2 serves the line as at
rung 1 (an area fact) while the EPC serves needs-exact-home.

EPC cost line (D26 per certificate, disagreements whole and
unranked). The M4.5 loader's minimisation is widened to file the
register's six modelled energy-cost fields (heating, hot water
and lighting, current and potential — annual pounds as
published, GBP only). The section sums each certificate's three
components (all three or the side serves nothing), divides by
12, and serves the register's own basis in the line: "the
register models this home's energy costs at £40.75 a month
(£489.00 a year) on a standard occupancy pattern, priced at the
assessment date — a model, not a bill", with the potential side
as its own line ("with the improvements this certificate
recommends, the same model gives £37.92 a month (£455.00 a
year)").

| Certificate                       | Filed annual costs (current / potential) | Monthly (current / potential) |
| --------------------------------- | ---------------------------------------- | ----------------------------- |
| 19 Birkdale Rise (2022, RdSAP)    | £489 / £455                              | £40.75 / £37.92               |
| 6 Exeter Road (2023, RdSAP)       | £1,104 / £1,104                          | £92.00 / £92.00               |
| 6 Exeter Road (2013, SAP)         | £351 / £351                              | £29.25 / £29.25               |
| Flat 4, Minerva House (2019, SAP) | £278 / £278                              | £23.17 / £23.17               |

Exeter's two certificates BOTH serve — £92.00 and £29.25 a month
side by side, unmerged and unranked; the 2013 certificate's £0
hot-water cost is a modelling artefact of that vintage, served
as filed. Minerva's raw register documents were captured for
this step (15 Nov 2026, through the project's EPC connector):
25 certificates for KT17 1FH fixtured in the established
pattern; Flat 4's certificate (8401-7039-6529-6723-9906, band B,
rating 85, 70 square metres, SAP, registered 7 Nov 2019) files
heating £144 + hot water £73 + lighting £61 = £278 a year on
both sides. Artefacts filed before the widening carry no cost
fields: the section serves exactly as before, cost line absent,
no error (a partial filing — some components missing — likewise
serves no line for that side).

Cache (D29): both lines ride inside the cached area bundle. The
widening needed NO shape predicate: the area version vector's
EPC artefact guard is the content hash of the whole artefact,
so a re-filed widened artefact busts a pre-widening entry on
its own — proven in the unit tests (entry serves costless,
re-file recomputes, cost lines appear, no stamp moved) and in
the scoped rehearsal below, both directions.

Scoped rehearsal (15 Nov 2026, local PGlite engine, PostgreSQL
18.6 + PostGIS 3.6.2): fresh database, migrations applied twice
(newest still 0020 — no new migration in this step); directory
rows seeded for the three universal postcodes; the REAL loader
filed all three EPC fixtures (42 + 12 + 25 certificates, golden
homes OK including the new cost goldens); council-tax rows
inserted as filed at M5.10. Through the real address source,
the real area source and the real cache table, all three homes
served both lines verbatim (Birkdale £190.03 + £40.75/£37.92;
Exeter £162.02 + £92.00 and £29.25; Minerva £210.90 + £23.17).
Cache cycle on the real table: the widened entry served; the
artefact was then stripped of its cost keys (pre-widening
shape, no stamp moved) and the next build recomputed to no
cost line; the real loader re-filed CM3 2JT and the cost lines
returned, the entry holding the restored bundle. Temporary
prove suites deleted after passing; CI's database job is the
final word.

## The postcode's EPC spread (M6.15, decision D34)

D34: the spread of recorded certificates across bands at the whole postcode, served as a sub-block (`spread`) inside the EPC section at report depth. It shares the section's artefact read, source line and D29 cache guard (the EPC artefact hash) — no new cache entry, no new vector component; the headline projection cannot carry it and the D28 short bundle is untouched (both asserted).

**The counting rule — certificates, never homes.** The counting unit is the filed certificate. A homes count would need a latest-per-home pick, and picking a winner among a home's disagreeing certificates is the ranking D26 forbids. The standing example is in the Exeter filing: 10 Exeter Road holds a predicted band B (2013, SAP) and an assessed band C (2025, RdSAP); a homes count silently picks one, the certificates count serves both. The block's own explainer says the rest of the rule in plain words: a home assessed more than once appears more than once, and most homes in a postcode have no certificate at all.

**The split rule — predicted and assessed never combine.** Predicted (SAP) and assessed (RdSAP) certificates serve as separate rows, each on its own base, the base always named in the row's line; percentages are computed at serve time from the filed counts (the D26 Census pattern). Birkdale is the proof of why: combined, its 42 certificates would read 90.5 percent band B — but every B is a new-build prediction and all four assessed homes rate C or D. A row with zero certificates does not serve.

**The claim boundary.** The spread speaks of filed certificates only — never of the postcode's homes — and no comparison between the checked home's own band and the spread is computed, phrased or laid out: the block is a pure function of the artefact and references the home's certificates not at all (proven by serving two Birkdale homes of different bands and asserting identical spreads, and by the block's closed key shape). Area energy verdicts ("efficient area", "well-insulated postcode" and kin) are in the state matrix's banned scan.

**The golden spreads** (asserted verbatim in the unit suite against the fixtured register documents, and served verbatim through the real sources in the M6.15 scoped rehearsal):

| Postcode          | Certificates | Predicted (SAP) row | Assessed (RdSAP) row |
| ----------------- | ------------ | ------------------- | -------------------- |
| CM3 2JT Birkdale  | 42           | 38 — B 38           | 4 — C 1, D 3         |
| E16 1GN Exeter Rd | 12           | 10 — B 10           | 2 — B 1, C 1         |
| KT17 1FH Minerva  | 25           | 25 — B 25           | — (no row serves)    |
| CM1 6ER Beaulieu  | 49           | 49 — B 49           | — (no row serves)    |

Birkdale's rows serve verbatim as: "of the 38 predicted (SAP) certificates recorded for this postcode, 38 are band B (100 percent)" and "of the 4 assessments of existing homes (RdSAP) recorded for this postcode, 1 is band C (25 percent) and 3 are band D (75 percent)". Exeter's assessed row: "of the 2 assessments of existing homes (RdSAP) recorded for this postcode, 1 is band B (50 percent) and 1 is band C (50 percent)".

**The Beaulieu capture.** Before this step, Beaulieu's "49 certificates, all predicted, all band B" existed only as a locked sentence in this matrix — no register document was in the repo. At M6.15 the postcode was captured through the project's EPC connector in the established fixture pattern (search response plus all 49 certificate documents, minimised and verified exactly as the loader minimises: 49 SAP, all band B, all postcode CM1 6ER, no missing bands), and the spread above is locked from the captured documents. The fixture directory now holds 128 certificate documents across four postcodes.

**States and rungs.** The spread serves wherever the postcode's artefact holds certificates — rungs 1 and 2 alike (it is a postcode fact), including beside the none-matching state (the home has no certificate; the postcode's spread still serves whole) and beside needs-exact-home at rung 2. Filed-with-zero (E16 1EG) and not-filed serve no spread: one artefact, one zero, one line — the section's own state line already says it. Rung 3 carries the section's shared reason; rung 4 nothing. The per-band rendering beyond the goldens' B–D range (E/F/G bands, the no-band form, fractional percentages) is proven by a labelled synthetic artefact in the state matrix.

**Rehearsal record.** Scoped rehearsal at M6.15 on the local PGlite engine (PostgreSQL 18.6, PostGIS 3.6.2): migrations applied twice (newest still 0020 — this step needs no migration); the REAL loader filed the four fixture postcodes (42 / 12 / 25 / 49 certificates, its golden check passing); resolutions through the REAL address source and bundles through the REAL area source served all four golden spreads verbatim; rung 2 served the same spread; the spread survived a round trip through the REAL bundle_cache table unchanged. CI's database job is the final word.

## Building safety — the tribunal decisions and the register hand-off (M6.16, decision D35)

D35: one combined `buildingSafety` section in the area bundle (its fourteenth), at report depth, with two sub-blocks keeping separate states and source lines — the filed tribunal decisions (`tribunal`) and the Building Safety Regulator register hand-off (`register`). Combined, so the tribunal's empty line is always read beside the register hand-off that corrects it: silence never sits alone where it could be read as "safe". The D28 short bundle is untouched (no `buildingSafety` key; its eleven sections stand, asserted). No new migration — migration 0015's table is the filed half.

**The tribunal half — group-and-label, fail-open.** Every decision filed for the postcode serves, grouped by the filed `building_key`, the checked home's group labelled (`isHomeBuilding`) and sorted first, nothing ever filtered out — a building-name mismatch must never print a false empty answer. A decision about a single flat (`is_single_flat`) serves only at that flat's own rung-1 check. The count line's noun is honest: orders where the served rows are orders, decisions where they are all of the other kind, "decisions and orders" where they mix. The states: served / none-filed (the locked D17 form, "no published building-safety orders naming this postcode, as at {filing date}" — the date is the filing currency, the table's latest `retrieved_at`) / not-filed (an unfiled table, proven by the table-wide guard count read independently of the slice — an absence is only computed over a proven filing) / not-covered (Scotland, Wales, Northern Ireland and the unknown nation, each naming the nation's own position). The explainer carries the completeness caveats in full: publication is selective, other series are not indexed, a small number of published documents cannot be read by the filing process and file nothing, and some published decisions name no full postcode so cannot be matched to any postcode. Publication is never stated to be complete, and neither half ever supports a safety verdict — the state matrix scans the section against D35's banned list (safe, unsafe, cladding-free, "no cladding problem", compliant, passed, cleared, and kin), the dataset's own name excused.

**The register half — a hand-off, never an answer.** England: the hand-off state, linking to the register's own search service — the URL is the bsr-register canary's probe target (`https://www.register-high-rise-building.service.gov.uk/public-register/search`), a plain landing with no postcode in it; the line instructs the reader to enter the postcode there. One home-scoped exception: at rung 1, for a clear single house only (no SAON, and a PAON that parses to a bare house number — the filed data can prove a flat, never a house), the scope line serves instead, with no link. Scotland's Cladding Assurance Register is named WITHOUT a link (no verified landing exists in the record; D31's rule is a link only where it lands on the real search); Wales names the Welsh Government's building safety route; Northern Ireland names that it has no equivalent register.

**The golden corpus** (the M5.14 fixture set — 11 cases filed from 9 documents, 1 named parse failure, asserted verbatim in the unit suite against the loader's own parse of the fixture PDFs, and served through the real sources in the scoped rehearsal):

| Postcode      | Filed decisions                                                                                                            | Served form                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| BH15 2FN      | Oyster Bay — remediation order HAV/00HQ/BSA/2025/0002, 10 April 2026, "1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN" | The positive control: one group, labelled for a flat in the building, beside the register hand-off  |
| E17 7FW       | Planetree Path — remediation contribution order LON/00BH/BSB/2024/0500, 10 June 2025                                       | Serves with the section 124 kind line                                                               |
| NW2 4JA       | Thanet Lodge — three remediation orders (LON/00AE/BSA/2024/0007, 0500, 0502), 18 February 2025                             | ONE group of three, in filing order                                                                 |
| BH8 8ES       | Purbeck House — two remediation orders (HAV/00HN/BSA/2024/0001, 0002), 8 May 2025                                          | One group of two                                                                                    |
| SE1 4NH       | Empire Square — remediation contribution order LON/00BE/BSB/2024/0602, 5 June 2025                                         | Serves at rung 2 with no home label                                                                 |
| (no postcode) | East Village — two other-kind decisions (LON/00BB/BSA/2025/0002, 0003)                                                     | Filed with a NULL postcode: serve at NO postcode — the standing witness for the completeness caveat |

**The universal three** (CM3 2JT, E16 1GN, KT17 1FH) serve the empty-tribunal form beside their register forms — verified against the filed corpus: no filed decision names any of them. Birkdale and Exeter Road (clear single houses) take the register scope line; Flat 4, Minerva House takes the hand-off. **Named gaps:** no `is_single_flat` row and no postcode-bearing other-kind row exist in the readable corpus (Hillside's document names the building, not a flat; the East Village pair names no postcode) — both serving paths are proven on labelled synthetic source rows in the unit suite and the state matrix, and a real witness joins when a readable decision of either kind is published. The founder's optional manual BSR lookup for Minerva House remains his to do or skip; the build neither does it nor waits on it, and the register service is never scraped.

**Cache (D29 pattern, extended).** The area version vector gains the tribunal loader's stamp (`load-tribunal-building-safety`) PLUS a filed-count guard on `tribunal_building_safety_decisions` — required because the loader's direct entry point (`npm run load:tribunal-building-safety`) bypasses the runner and moves no stamp, so a hand-run re-file busts a cached not-filed on the count alone (proven). The cached shape contract requires the `buildingSafety` key's presence, so an entry written before this step degrades to a recompute rather than serving sectionless (proven). Named residual, in the flood counts' own form: a same-count content change from a hand run moves neither stamp nor count; the timed runner's stamp closes it on the primary path.

**Rehearsal record.** Scoped rehearsal at M6.16 on the local PGlite engine (PostgreSQL 18.6, PostGIS 3.6.2): migrations applied twice (newest still 0020 — this step needs no migration); the REAL loader's `--file` path filed the fixture corpus (11 cases — 7 remediation orders, 2 remediation contribution orders, 2 other — from 9 documents, 1 named parse failure, 2 cases naming no full postcode); seeded directory rows and filed sales let the REAL address source resolve Oyster Bay and the universal three at rung 1; bundles served through the REAL area source and the REAL `bundle_cache` table — Oyster Bay's positive control verbatim with its group labelled, the universal three's empty form beside their register forms, and the Oyster bundle surviving a cache round trip unchanged. The prove suite and seed script were deleted after passing, per the standing pattern. CI's database job is the final word.

## Broadband & mobile — the Ofcom answers (M6.17, decision D36)

Two sections in the area bundle, each at its own grain with its own state, source line and grain line: `broadband` at postcode-premises grain (depth: headline — it joins the short bundle as the TWELFTH section, gigabit line only) and `mobile` at named-council grain (depth: report; it NEVER headlines — no mobile key exists in the short bundle, asserted). Both read the answers the M5.9 loaders filed into `postcode_cache.answers` (`broadband` / `mobile` keys); no new table, no new migration. The cache's area version vector gains both loaders' stamps (STATIC class) PLUS content-hash guards on both answer keys — both loaders are directly runnable outside the runner and file moving no stamp (the D29 operator trap in its exact shape) — and the cached shape contract requires both new keys.

**The capture warning, stated first.** The repo's test fixtures for both Ofcom answers carry INVENTED values (both fixture READMEs say so) and were NOT used as goldens. The real Connected Nations files are NOT in this workspace: the M5.9 sandbox download was refused by Ofcom's Cloudflare layer, and the file saved under the harness directory is that challenge page, not the release. What IS locked below is exactly what the founder's own harness verified live against the real Spring 2026 release on 13 Nov 2026 (the M5.9 proof): the broadband gigabit figure at the three universal postcodes, and the mobile triples it recorded for the three councils. Everything else the sections serve is proven as RENDERING on labelled synthetic witnesses, and the gaps are named at the end — no invented value is locked anywhere.

**Broadband — the locked figure.** Gigabit-capable = **100%** of premises at all three universal postcodes (CM3 2JT, E16 1GN, KT17 1FH), snapshot 2026-01, basis "All premises". The served headline line, locked verbatim in the area-bundle and short-bundle suites: "gigabit-capable broadband (at least 1 Gbit/s) is available to 100% of premises in this postcode", under the source line "Ofcom Connected Nations — fixed broadband coverage — data to January 2026" and the grain line "the premises in this postcode". The harness record also carries superfast / ultrafast / 300+ at 100% for the same postcodes (consistent with gigabit 100); those fields serve in the fake sources at that shape but are NOT asserted as goldens — their rendering, and the speed bands', is proven on the synthetic witness below. The filed-but-unserved fields (the NGA percentage, the whole unable family) carry distinctive fake values and a test proves none of them ever serves; the filed answer carries no full-fibre figure at postcode level at all (the loader pins its absence).

**Broadband — the synthetic witness (labelled).** A synthetic postcode answer (gigabit 87.4, superfast 96.2, ultrafast-100 91.5, ultrafast-300 88.9; bands 0.4 / 0.8 / 1.6 / 4.3 / 12.5 / 69.3) proves the report-depth rendering: all four category lines verbatim, all six band lines with Ofcom's ranges as labels, and the UNCLASSIFIED share derived and named — the bands sum to 88.9, so the section serves "11.1% of premises in this postcode could not be matched to a provider record with a predicted speed, so they appear in no speed band". The shortfall is never absorbed or rounded away; when the bands sum to 100 no unclassified line serves.

**Mobile — the locked sets.** Each service leads with ONE figure, the at-least-one-operator share; the all-operators share serves beside it; the no-operator share stays in the filed data (the at-least-one share is Ofcom's own derivation from it). Only 4G files an indoor set; all 5G is outdoor-only, as filed. Locked verbatim (council, service, set: at-least-one / all-operators):

- **Braintree** (CM3 2JT): voice outdoor 100 / 99.29; 4G outdoor 100 / 99.04; 4G indoor 99 / 84.64; 5G high-confidence outdoor 97.9 / 42.45.
- **Newham** (E16 1GN): voice outdoor 100 / 100; 4G outdoor 100 / 100; 4G indoor 100 / 98.89; 5G high-confidence outdoor 100 / 100; 5G very-high outdoor 100 / 99.33; 5G standalone high-confidence outdoor 100 / NOT PUBLISHED.
- **Epsom and Ewell** (KT17 1FH): voice outdoor 100 / 100; 4G outdoor 100 / 100; 4G indoor 100 / 96.85; 5G high-confidence outdoor 100 / 98.42; 5G very-high outdoor 100 / 67.31; 5G standalone very-high outdoor 98.8 / NOT PUBLISHED.

**The unpublished discipline, locked.** A filed column empty in EVERY row of the release is unpublished (null) — never 0. Newham's standalone-5G all-operators share and Epsom and Ewell's SA very-high all-operators share serve the line "the share of premises in {council} where all four mobile networks have outdoor coverage is not published for this service", with the lead figure still serving. A service whose whole set is unpublished serves its own not-published state ("{label} coverage is not published by Ofcom in this release") — proven on a labelled synthetic council, since no golden council files one. The section line names the council ("modelled mobile coverage for the {council} council area"); the source line is "Ofcom Connected Nations — mobile coverage (local authority level) — data to January 2026".

**Carried but NOT asserted.** The harness recorded no values for: Braintree's 5G very-high and both standalone sets; Newham's 5G standalone very-high set; Epsom and Ewell's 5G standalone high-confidence set. In the test fakes those sets carry explicitly marked filler values so the six-service shape renders; no assertion touches them, and this matrix locks nothing for them.

**States.** Broadband: served / not-filed ("broadband coverage is not filed for this postcode yet"). Mobile: served / not-filed ("mobile coverage is not filed for this postcode's council area yet"), plus the per-service not-published state above. Rungs 1–2 serve both sections identically; rung 3 names "broadband answers need an exact postcode" and "mobile answers need an exact postcode" (fifteen per-section reasons shipped, sixteen with the company flag on); rung 4 nothing. Banned as our verdicts, scanned in the suites: "you will get", guaranteed-speed phrasing, "poor coverage", "great coverage", "best network", "fastest", and "fast" / "slow" as place adjectives (Ofcom's own category names superfast / ultrafast serve as labels, exactly as filed). Shares are availability, never a speed a home will get and never take-up; mobile figures are council-wide and modelled, never a claim about signal inside the home; no provider names serve (none are filed). The short bundle's standing no-% sweep gains one named exception: the gigabit line's own figure, stripped in its exact shape by the scan — D36's headline IS a percentage.

**Named gaps (not filled, not substituted).** (1) No sub-100 gigabit golden: Hilgay CB6 1EH is the matrix's named rural witness, but no verified figure for it exists anywhere in the record — the real release files are absent from the workspace (above), so the sub-100 rendering rests on the labelled synthetic witness until a filing with the real files can lock one. (2) No poor-coverage mobile council is locked: every recorded council sits at or near 100% at-least-one; a low-coverage council's rendering is proven only on the synthetic witness. (3) No non-England golden: Cardiff's figures exist nowhere in the repo (the mobile loader's Welsh handling is proven at loader level only). (4) The unrecorded mobile sets listed above. All four close the same way: a Connected Nations release filed through the loaders' `--file` route from the real files (the M12 first-filing pass owns the live pull), after which the harness figures for those postcodes and councils can be locked here.

**Rehearsal record.** Scoped rehearsal at M6.17 on the local PGlite engine (PostgreSQL 18.6, PostGIS 3.6.2): migrations applied twice (newest still 0020 — this step needs no migration); a local release folder carrying the VERIFIED figures in the loaders' real formats (broadband area CSVs for CM / E / KT with gigabit 100 at the three postcodes; a mobile laua CSV with the recorded triples for Braintree, Newham and Epsom and Ewell, its 5G SA all-operators columns empty in every row) was filed through the REAL loaders' `--file` routes (3 broadband answers, 3 mobile answers); seeded directory rows and minimal filed sales let the REAL address source resolve the universal three at rung 1; the REAL area source served the gigabit line verbatim at all three, the recorded mobile lead and all-operators lines per council, and Newham's SA not-published line — the null discipline holding end to end, from empty CSV column to served line; and the Birkdale bundle survived a round trip through the REAL `bundle_cache` table unchanged. The prove suite and seed script were deleted after passing, per the standing pattern. CI's database job is the final word.

## Per-figure explainers — the census and its enforcement (M6.18, decision D37)

D37: explainers stay inside each section's served shape — no central registry serves text. The census register is a test artefact (`tests/explainer-census.ts`, enforced by `tests/explainer-census.test.ts`): 67 figure families enumerated (55 in the full bundles, 7 headline-depth deltas, 5 prospective rows for the M6.16/M6.17 sections — re-verified against the built shapes at this step, no row contradicted), 38 hard, 9 naked fixed plus 1 latent (company SIC codes), 3 partials (council-tax bands derivation — fixed by a served line; short EPC predicted/assessed label — restored; air — compliant only through the How-we-check page's statutory-limits material, recorded in the register as M7's obligation, not built here), and 0 over-noted (the three candidates examined — council-tax correction per surface, crime's filed basis string, flood definitions per label occurrence — are cleared in the register, not manufactured into findings). The register's ids are the stable anchor list for M7's How-we-check page and M6.19's contract tests; the pointer is the section key, and no served anchor field was added.

**The fixes, as served.** Nearby's selective fact gains `nearestSelectiveLine` ("the nearest selective secondary school is {name} — selective means admission by entrance test"). The heritage explainer gains the grade gloss in the publisher's terms (Grade I exceptional interest; Grade II* particularly important, more than special interest; Grade II special interest). The nature explainer expands the four designations in the served data (SSSI a Site of Special Scientific Interest, SAC a Special Area of Conservation, SPA a Special Protection Area, Ramsar a wetland of international importance under the Ramsar Convention), and `ANCIENT_WOODLAND_INVENTORY_LINE` — a constant served nowhere before this step — is wired in as the nature section's `ancientWoodlandInventoryLine`. Each EPC certificate gains `ratingLine` ("this number is the register's energy-efficiency measure for this home — the certificate's band derives from it" — worded without "score"/"rating", both banned verdict words in the state matrix's scan; the census's content, in the scan's vocabulary). The Census explainer gains the own-total line (each table's percentages are of that table's own total; totals differ because the Census applies disclosure control). The Claimant Count series gains `pctLine` ("{pct} percent of the working-age population"); the benefits section gains `basesLine` (the small area's Census 2021 residents and households, filed as the series' context). Council tax gains `bandsLine` (the other bands are set from Band D by fixed statutory ratios, in ninths of Band D). The company snapshot gains `sicCodesLine` (the SIC codes are Companies House's standard industrial classification codes, served as filed) — the flag stays OFF and `lib/site.ts` is untouched. At headline depth, `ShortFloodLayer` gains `coveringDefinition` (the covering label's EA definition only — a narrow D28 amendment) and the EPC headline pick gains `headlineAssessmentLabel` (the newest certificate's predicted/assessed label, restoring D7).

**The enforcement.** Direction one asserts every hard family's named line on real golden bundles at both depths (38 extractors, verbatim for the fixes). Direction two asserts no note field on self-explanatory figure objects. The fail-closed leaf walk requires every numeric or labelled leaf of a served bundle to match a census figure-path pattern or the explicit not-a-figure allowlist (dates, identifiers, names, postcodes, coordinates, structural labels, and the filed-artefact strings the prep cleared); a deliberately unregistered figure (`short.sections.epc.secretFigure`) is demonstrated failing the walk naming its path, in the suite. The walker's allowlist is part of this record: FIGURE_PATH_PATTERNS carries ~90 path patterns each naming its census ids; NOT_A_FIGURE_ALLOWLIST carries the date/identifier/name/line patterns in `tests/explainer-census.ts`.

**Cache (D29 pattern, extended in step).** The area `shapeOk` now also requires the nature inventory line to be a string, the `bandsLine`/`basesLine` keys present, every certificate's `ratingLine` key present, and (where the company section is present) every snapshot's `sicCodesLine` key. Nearby gains its first `shapeOk`: the secondary category must carry the `nearestSelectiveLine` key. Both stale-entry degradations are proven in the bundle-cache suite: a pre-M6.18 entry recomputes and is rewritten in the new shape.

**Docs correction.** `loaders/README.md`'s council-tax passage quoted a superseded pre-build line ending "so treat this as a close estimate, not the bill itself" — wording D16 forbids and the brain has never served. It now quotes what the brain serves ("[Council]'s average Band D council tax for [year] is £… — an area average, not this home's bill") and records the drift.

**Rehearsal record.** Scoped rehearsal at M6.18 on the local PGlite engine (PostgreSQL 18.6, PostGIS 3.6.2): migrations applied twice (newest still 0020 — no new migration); the REAL loaders filed the fixture postcodes with their golden checks passing (postcodes; sold prices CM3 2JT 30 / E16 1GN 9; crime 330 / 10,722; EPC 42 / 12 / 25 certificates; schools 70 with 9 selective secondaries; heritage 652 listed buildings; nature designations and 871 ancient-woodland features), with KT17 1FH's directory row and one HMLR-shaped sale seeded by hand (the ONSPD fixture files no KT17 row, and the police fixture's point map covers no KT17 postcode, so Minerva's crime serves its not-filed state). Resolutions through the REAL address source and bundles through the REAL sources and the REAL `bundle_cache` table served the census's new lines at the universal three — the EPC rating line and the short headline assessment label at all three, the selective-school gloss at the one home whose nearest secondary is selective, the heritage and nature explainers — and the register's leaf walk passed over the real-source bundles at both depths, after the walk caught and the register completed two genuine gaps the fakes never served (nature's beyond-place designation miles; the sold building line's sale leaves and counted count). One gap in the rehearsal itself, recorded plainly: the flood-zones fixture filing wedged repeatedly on the local engine (the loader and engine both stalled at near-zero CPU), so the flood layers served their not-filed state and the short Flood Zone 3 covering definition — proven verbatim in the committed suite — was not witnessed through the real sources at this step. The prove suite was deleted after passing, per the standing pattern. CI's database job is the final word.

## SEO wording — the locked strings, the map deltas and the lint (M6.10, decision D38)

D38 reconciles the wording layer to D12 and locks the site's search wording before M7 builds the pages. The homepage title leads with the D12 tagline — "Check My Next Home — Check the house. Choose the home." `lib/site.ts` gains `SITE_TAGLINE` ("Check the house. Choose the home.") and `SITE_MANIFESTO` ("For the family who'll live there — not just the buyer.", hero kicker only — a test keeps it out of every title and meta), and the M3 family headline survives only as `HOME_HERO_HEADLINE` (homepage hero copy); `SITE_STRAPLINE` is deleted, and `tests/site.test.ts`'s "agreed family strapline" pin is amended deliberately — the test change is the decision record, and a namespace assertion pins the constant's absence. `docs/brand.md`'s strapline entry is corrected to D12 the same way, with the M3 headline recorded as superseded. `SITE_DESCRIPTION` is rewritten in the descriptive, as-published voice and is the homepage meta's single source.

**The locked set.** `PAGE_SEO` in `lib/seo.ts` holds the title and meta description for all 21 public pages (19 intent-map pages plus the How we check and About the data trust pages), one source M7's pages consume. Titles are per-page by construction — the record holds no defaults, every entry carries its own title and description, and uniqueness of every title and every description is asserted. The root layout consumes the homepage entry (its title now leads with the tagline); M7 performs the move of metadata into the pages. Rules locked with the set: no figures in any title or meta, ever (the only digits in the set are the names/basis phrases "Article 4" and "the 12 months named"); metas descriptive with the as-published frame, never mover-addressed, never outcome promises; a title may carry the searcher's question verbatim, never our answer (the families guide's "Is this area good for families? | Check My Next Home" is the one interrogative title, pinned exactly). `pageMetadata` gains the Open Graph fields locked by D38 — og:title, og:description, og:type=website, og:url, all derived from the same per-page title/description/canonical — and deliberately NO og:image (the image lands at M7.1 from the brand pack; a test pins its absence). No SearchAction, no FAQ/HowTo schema, no ratings schema, no per-home structured data (pinned by test). Sitemap and robots are unchanged.

**The D9 short form** is written into the wording layer as `DISCLAIMER_SHORT_FORM` in `lib/site.ts` and pinned verbatim: "We present official data as it is published, with its source and date. We do not score, rate or recommend homes or areas." D9 fixed its content and its beside-results placement; the string is D9's own opening words verbatim (the full standing wording's Terms / About the data / report surfaces remain M8/M10 work). M7 renders this string beside the results; it appears in no title or meta.

**The shared lint.** The banned-wording union is lifted out of `tests/short-bundle.test.ts` into ONE shared module, `tests/banned-wording.ts` (`BANNED_WORDING`, plus the two ruled exceptions `VALUATION_DISCLAIMER` and `GIGABIT_FIGURE`); the short bundle's scan and the new SEO scan (`tests/seo.test.ts`) both import it. The SEO scan runs the union — plus the no-figure, no-"%", no-"£", no-portal-name and no-gift-wording rules — over every PAGE_SEO title and meta, the D9 short form, and the tagline/manifesto/hero/description constants. Ruled exceptions, in the existing scans' pattern: the sold-prices meta's D23 disclaimer sentence is stripped before the "valuation" check; the D9 short form's negation sentence is stripped before the union scan (it states the absence of scoring in D9's own words); interrogative titles are the searcher's words and are sheltered from the union only — never from the figure/portal/gift scans — and the shelter is pinned to the families guide's path alone.

**The intent-map deltas** (docs/seo-intent-map.md, same build): rows 3 and 4 record the phrase-targeting honesty (flood's "has this house ever flooded" answered with "we hold no record of past flooding"; crime's "crime rates" answered with counts, never a rate); row 6 rewritten to the nearest-schools intent (no catchment data is held; catchment-shaped searches answered with the nearest facts and the plain statement); row 7 gains the postcode's recorded-certificate spread (M6.15); row 8 rewritten — the page chases the band query and answers with the council's scale plus the correction line, the old promise text ("Band plus the local charge for that band") removed; row 9 survives GUIDE-ONLY, renamed "Guide: What to check when buying a leasehold flat" at /guides/buying-a-leasehold-flat, so it can never be mistaken for a check; row 10 records the planning-applications hand-off (D14/D31); row 12 rewritten to the postcode-share basis (no exact-address speeds); row 13's "walking distances" becomes straight-line; new rows 17 (noise), 18 (air quality), 19 (solar — location wording only, roof-shaped queries never targeted) and 20 (mobile coverage, council grain, recorded from the gap the M6.17 build closed); the never-targeted list is written into the map as an explicit section (the gift, benefits/deprivation verdicts, company ownership while the flag is off, building-safety register lookups, per-home bands, catchment verdicts, "is it safe" as our wording); the no-town-pages rule is recorded in the map's introduction; and the coverage check is re-run and re-stated — all 19 check/guide types covered, none unconfirmed.

**Boundaries held.** `app/page.tsx` stays the placeholder (its one-line change consumes the renamed hero constant; the rendered output is identical). No brain string was changed by this step, and no served brain line failed the extended lint — the scan's surfaces are the locked SEO strings and identity constants, which all pass. `lib/site.ts`'s `COMPANY_OWNERSHIP_ENABLED` block is byte-identical before and after (md5 of the block unchanged); the flag stays false. No migration (newest remains 0020).

## E2E journeys each candidate unlocks (Playwright, QA phase)

| Candidate            | Journey it unlocks                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 KT17 1DR          | "Buy a report for a home inside a conservation area" — inside-CA and inside-A4 answers, removed-rights text shown; contrast run against Epsom (0.099 mi outside the same areas)             |
| C2 E14 0BZ           | "Search a flat inside an Article 4 area in a publishing council" — direction details rendered; plus the defended-FZ3 display (zone shown, likelihood "Very low")                            |
| C3 CM5 0DR           | "Search a rural house inside the green belt" — inside-GB answer; listed-building-at-the-address line (0.008 mi); flood-boundary display (point on the FZ2 edge)                             |
| C4 KT1 1JS           | "Listed building at this exact address" — 0.000 mi, grade II* rendering; flagged non-residential, so a display test only, not a buyer journey                                               |
| C5 KT13 8NB          | "Buy a report for a home inside a scheduled monument" — monument-inside answer with the listed gates at the same address                                                                    |
| C6 KT21 1AG          | "Search a home inside an SSSI" — nature-inside answer; two stacked inside answers at one address (SSSI + green belt) rendered without double-counting                                       |
| C7 OX1 1HD           | "Buy a report with undefended flood risk" — FZ3 + "Medium" likelihood display; largest heritage count in the set (performance and truncation behaviour); second-city CA + A4 inside answers |
| C8 CF11 8AA          | "Search a Welsh postcode and see the honesty states" — schools with no Ofsted wording, health with no ratings wording, planning/flood coverage wording (never fake "nones")                 |
| C9 CB6 1EH           | "The mostly-empty report" — five layers honestly answering none at once, priority habitat still reported, and a rural FZ3 answer; the report that must never pad itself                     |
| C10 CM1 6ER          | "The new-build report" (D7 honesty) — predicted EPCs labelled as predicted, thin/absent sales history stated plainly                                                                        |
| E16 1EG (guard only) | "Search a postcode with no EPC certificates" — the EPC section's empty state                                                                                                                |

## Recommendation on set size

1. Adopt 12 homes: the 3 universal core homes + C1, C2, C3, C5, C6, C7, C8, C9, C10 — each targeted to the datasets above — plus E16 1EG as an EPC-only guard. Optional extras, only if wanted: C4 (exact-zero II*) and KT22 8QA (ancient-woodland-inside; SSSI/SAC same-ground counting).
2. Remaining GAPs to fill later, only when their milestone's gap check runs: mixed/poor EPC bands at one postcode; surface-water "High" at the point; inside a SAC/SPA/Ramsar; flight-path noise; council-tax band H; schools-none-within-radius (filled at M6.2: C9 has no primary or secondary school within 2 miles on the national filing — see Distances and What's Nearby).
3. Cost discipline: targeted homes assert only their own datasets, so fixture capture and quarterly re-proof stay proportional. Universal status must not be extended beyond the original three.

## Consolidation — the replay, the contracts, the count (M6.19)

M6.19 audited the finished backend against this matrix and the
state census (tests/state-matrix.test.ts) and converted the
one-off scoped rehearsals into committed proofs:

1. **Golden replay** (tests/golden-replay.test.ts, gated on
   GOLDEN_REPLAY=1, running in CI's database job): every golden
   home through every brain plus the short bundle, through the
   real database sources against the filed fixture corpus. Its
   setup filings seed the homes' real ONSPD Aug 2026 directory
   rows (tests/fixtures/replay/directory-rows.json) and run the
   sold-prices, crime and EPC loaders through their real
   fixture paths for the homes the CI steps do not reach.
2. **Bundle-shape contracts** (tests/bundle-contracts.test.ts +
   tests/fixtures/replay/bundle-shapes.json): 43 pinned shapes
   covering every bundle the website consumes, at every rung
   and in every key-changing state variant — the frozen M7
   front-end contract.
3. **The set count, tidied.** The plan labels this set "14
   homes" and the recommendation above says "12" while
   enumerating 13; the enumerated list is the authority and
   totals **15 homes** — the 3 universal + C1–C10 + KT22 8QA +
   E16 1EG. The replay carries all 15 plus five further
   witnesses: Cardiff doubles as C8 and the Welsh witness;
   EH1 1AD for Scotland (EH1 1AA, named above as the short-
   bundle witness, was terminated in ONSPD in December 1996
   and never enters the filed directory — EH1 1AD is a live
   postcode in the same data zone, S01014710); BT1 1AA and
   BT45 6EB for Northern Ireland (the second carries the Mid
   Ulster planning exception on its real directory row); and
   the zero-crimes witnesses CA20 1EX and LD5 4AD.
4. **Fixture-basis note.** The replay's spatial figures
   (nearby, constraints, heritage, nature, flood edges) are
   locked on the fixture cuts, which are excerpts; where they
   differ from this matrix's national-basis locks, the matrix
   lock stands as the national truth and the replay lock is
   the fixture-corpus truth — the M6.19 backend report
   (docs/backend-m6.19.md) carries the cell-by-cell coverage
   map and names each basis. Corpus-independent locks (crime
   artefacts, the universal sold medians over the excerpt's
   complete postcode sets, EPC artefacts and spreads, Census,
   council tax) reproduce identically in the replay.
5. **Not closed here** (M12-owed, restated in the backend
   report): national-volume and production timing proofs, the
   Article 4 gate bridge filing, the first national filings
   (noise, priority habitats, PVGIS), the four Ofcom golden
   gaps, the Stat-Xplore national pull with its count-band
   check, the council-tax spring pass, and the
   company-ownership exposure decision.

## Crime calibration — per-head figures and the England comparison (M6.20, decision D39)

D39 amended D24: the crime answer gains a per-head figure
(recorded crimes per 1,000 residents) and an England
comparison, under the guardrails that both figures always
show together, the comparison is a multiple never a lone
percentage, no verdict adjective is ever attached, and the
word "rate" is never used. The basis is Basis B: the crime
loader files, inside the artefact, the Census 2021 residents
of the LSOAs containing the postcodes within the same 1
mile, counted whole; the brain stays a pure artefact read
and the D29 cache vector is unchanged (the cache's crime
shape guard gained a calibration-presence check instead).

1. **Per-head goldens** (measured at the step's prep on the
   full filed directory + the full TS021 file; served
   through the real loader's fixture pins and asserted in
   tests/crime.test.ts and the golden replay): Birkdale
   330 over 6,380 residents = **51.7** per 1,000; Exeter
   10,722 over 87,519 = **122.5**; Minerva 1,956 over
   39,926 = **49.0**. The rejected bases are recorded so
   they are never re-proposed: own-LSOA (Exeter 5,575.7),
   own-MSOA (1,122.0), filed-boundary intersection,
   area-apportionment.
2. **The England figure** (locked at this step's backfill,
   counted from the verified 2026-09 cumulative archive —
   see the backend report for the archive discovery):
   the 12 window months count 457,065 (2025-10), 432,011,
   416,388, 401,765, 387,961, 447,342, 439,606, 468,361,
   468,246, 503,213, 473,619 and 443,069 (2026-09, counted
   twice, identical) — a 12-month England total of
   **5,338,646** recorded crimes over the denominator
   56,490,108 = **94.5 per 1,000 residents**. The served
   multiples on the universal homes: Birkdale **0.5 times**
   the England figure, Exeter **1.3 times**, Minerva
   **0.5 times**. (The prep's illustrative 94.0 was a draft
   placeholder; the counted figure is 94.5, and no test
   asserts it — the brain's arithmetic is pinned on
   synthetic figures, the served value on this lock.)
3. **Zero witnesses.** CA20 1EX (Wasdale Head; basis 1,328
   residents — its circle is its own LSOA) and LD5 4AD
   (Llanwrtyd Wells; 1,767) serve per-head 0 with the
   comparison carrying both figures and no multiple,
   pinned in tests/crime.test.ts. Their committed replay
   artefacts predate the step and carry no basis, so the
   replay asserts calibration-absent for them — never
   estimated. A multiple that rounds to 0.0 for a nonzero
   count is likewise withheld (the figures only).
4. **Contract re-pin (authorised).** The M6.19 freeze was
   deliberately re-pinned for this step: crime.served and
   crime.served-stale gained perHead, englandFigure and
   calibrationExplainer; short.rung1/short.rung2 gained
   perHeadLine and englandLine; a new pin,
   crime.served-pre-calibration, holds the pre-step shape
   (counts served, calibration null). 44 pins in total.
   The explainer census gained rows 68–71 for the new
   figures (71 families, 42 hard).
5. **Named trap, pinned.** CI's lsoa_bases fixture holds
   only the three golden LSOA rows; the loader's fixture
   mode reads basis residents from the fixture pin
   (6,380 / 87,519 / 39,926) and never computes, and a
   fake-pool test pins the live computation's multi-LSOA
   sum against the own-LSOA degradation.

## Missing layers — brownfield, built-up areas, heritage layers, EPC measures (M6.21, decision D41)

D41 filed and served the four layers the earlier steps had
left unfiled. Serving follows the shapes already proven:
brownfield as gated points (the listed buildings form,
absence licensed by supply), built-up areas as a polygon
layer in planning_layers, the four heritage datasets as
monument-shape layers with the buffer zone's own line, and
EPC improvement measures on the served certificate at
report depth, rung 1 only, never summed.

1. **Brownfield goldens** (from the live bulk file,
   40,229 rows / 32,352 current at capture on 16 Nov
   2026; the fixture cut holds every row within 3 miles
   of the homes — 520 rows, 464 current, 56 ended —
   filing 334 sites after the two dedupe rules, from 16
   supplying organisations): Birkdale **2** within
   2 miles, nearest Universal Garage, The Street,
   Hatfield Peverel at **0.252 mi** (permissioned,
   0.22 ha, 9/9 dwellings — the prep's pin, confirmed);
   Exeter **97**, nearest **45 Beckton Road, Canning
   Town, London, E16 4EA at 0.163 mi** (permissioned) —
   DIVERGES from the prep, whose entity-API sampling
   missed the Beckton rows (entry-dates 2018/2021) and
   named Freemasons Road nearest at 0.27; the filed data
   puts 117–125 Freemasons Road second at **0.267 mi**
   with status **pending-decision** (the prep said
   permissioned), and 101–103 Hermit Road at 0.570 mi
   (the prep said ~0.39); Minerva **30**, nearest
   **Etwell House and former coach, Station Approach at
   0.227 mi** (not-permissioned, 0.19 ha, 10/10 —
   recorded under two references and collapsed). Live
   goldens assert as floors (the platform re-collects);
   the fixture asserts exactly. The notes column is
   proven present in the source and never filed; the
   site-plan URL files, never serves. Absence is gated:
   the brain's gate follows the Article 4 pattern and
   waits on the same M12.10(b) bridge, so production
   absences serve not-published until it lands; the
   none-found branch is unit-proven against a gate that
   answers true.
2. **Built-up area goldens** (ONS December 2024 edition
   direct — 7,775 features; the platform's republished
   copy is England-only and older, rejected): Birkdale
   inside **Hatfield Peverel** (E63011486), Exeter
   inside **Newham** (E63012003 — the Greater London
   borough rule), Minerva inside **Ewell** (E63012408),
   the Bath witness inside **Bath** (E63012364). The
   source date serves as the edition date (2024-12-01)
   in both modes — the edition is a property of the
   dataset, not of the retrieval. Attribution as pinned
   from the ONS product: OGL v.3.0, "contains OS data
   © Crown copyright and database right".
3. **Heritage goldens** (post-exclusion filed counts
   from the live files): world heritage sites **19**,
   battlefields **47**, protected wrecks **57**, buffer
   zones **9** — the published files double every world
   heritage site and battlefield (a geometry row plus a
   nameless geometry-less stub sharing the reference;
   38 current world-heritage rows = 19 + 19). Only 9
   buffer zones are published at all, and Bath has
   none. All three homes serve the absence lines for
   all four layers (nearest world heritage edge to
   Exeter is Maritime Greenwich at ~2.73 mi point
   basis; its buffer edge ~2.26 mi — outside the
   2-mile radius on both); the Bath witness point falls
   inside the City of Bath world heritage site
   (1000103).
4. **EPC measure goldens**: Birkdale's certificate
   files exactly 2 steps — step 1 improvement 19 (Solar
   water heating), saving **£34**, cost "£4,000 -
   £6,000", ratings after 86/87; step 2 improvement 34
   (Solar photovoltaic panels, 2.5 kWp), saving
   **£383**, cost "£3,500 - £5,500", ratings after
   93/94; the served closing line carries only the
   final ratings (93/94). Exeter's two certificates and
   Minerva Flat 4's publish no measures (the named
   no-measures state). The name lookup is the union of
   the register schemas' published lists (RdSAP 21.0.1
   - SAP 19.2.0 = **65 numbers**), transcribed into
     lib/epc-improvements.ts with the source cited; every
     fixture-corpus number {5, 6, 14, 19, 34, 35, 58}
     resolves, and an unknown number serves its figures
     with no name. The prep's "58 Solid floor insulation"
     is superseded by the published wording "Floor
     insulation (solid floor)" — the published list
     governs. The Birkdale sample report's "save about
     £34 a year" line remains barred as a golden (the
     £34 is step 1 alone).
5. **Contract re-pin (authorised).** The M6.19 freeze
   was deliberately re-pinned for this step: the area
   pins gained constraints.brownfield + builtUpArea,
   the four heritage sub-blocks and certificates'
   improvements; the short pins gained the brownfield
   skim and builtUpArea. Eleven pins moved
   (area.rung1-rich, area.rung2, area.rung1-empty,
   area.rung1-scotland, the three flag-on pins,
   area.tribunal-served, short.rung1, short.rung2,
   short.scotland). The explainer census gained rows
   72–75 (75 families, 43 hard; improvements hard, the
   rest self with their lines embedded). The cache
   vector gained both loaders' stamps and the
   brownfield filed-count guard; the shape contract
   gained presence checks for every new sub-block and
   the improvements key. No new headline claim opened:
   the short bundle derives the two constraints
   sub-blocks under D28's rules and the heritage layers
   take the monuments' place (full bundle only).

## Live flood warnings + school deadlines (M6.22, decision D42)

D42 adds the one live element to an otherwise filed
product: flood warnings are fetched from the Environment
Agency's flood-monitoring API at serve time and composed
into the flood bundle — never filed, never stored — and
the schools answer gains the statutory application
deadlines. Nothing in this section is a filed golden: the
warning goldens are the two alerts captured live at the
step's first contact (16 Nov 2026, ~07:01), replayed
through a fake source in the unit suites and the golden
replay alike.

1. **The dist finding (the prep's one unverified point,
   closed at first contact).** The EA reference
   documentation's parameter table states dist is in
   kilometres, measured to the flood area ("warnings
   applying to flood areas which are within r km of the
   given latitude/longitude"), possibly approximated by a
   bounding box. Proven live with two points: Ledbury
   (52.034, −2.424), inside the River Leadon flood area,
   matched at dist 0 and every larger value tried; a
   point ~14.9 km east of the area envelope's east edge
   returned nothing at dist 6 and dist 14, and the
   warning at dist 16, 20 and 25 — a crossover at the
   envelope distance, not the centroid distance (~24 km).
   The chosen value is **dist = 3.22 km**, the product's
   2-mile proximity radius (D22), measured to the EA's
   area exactly as served wording requires (a warning is
   attributed to the EA's named area, never to the
   postcode point). min-severity=3 was verified live to
   return severity levels ≤ 3; the 1–3 filter is still
   applied client-side, never delegated.
2. **Warning goldens** (the captured pair, verbatim):
   **River Leadon catchment** (flood area 031WAF213,
   "Flood alert", severity level 3, riverOrSea "Leadon,
   Glynch", raised 2026-11-15T16:35:59) and **The tidal
   Rivers Bure, Ant and Thurne** (054WATBT1, "Flood
   alert", level 3, "Bure, Ant, Thurne", raised
   2026-11-15T09:00:34). Composed order is severity,
   then earliest raised: Bure before Leadon. The full
   bundle carries each message in full; the short bundle
   carries severity, area, raised line and the official
   link — no message field by construction. Severity
   level 4 never serves (proven against a synthetic
   lapsed item in the documented label "Warning no
   longer in force"; no level-4 item was live at
   capture). The block caps at 5 with a named overflow
   line. Attribution verbatim: "this uses Environment
   Agency flood and river level data from the real-time
   data API (Beta)"; the link is the official Check for
   flooding service (https://www.gov.uk/check-flooding).
3. **The two named empty states.** Success with none:
   "No flood warning in force for this area — checked at
   [time]" with the Europe/London stamp ("06:54 on 16
   November 2026" at the fixture instant; a BST instant
   renders BST). Failure: "Live flood warnings could not
   be checked just now". At headline depth the
   no-warning line does not travel (the block names its
   state and stamp only); the failure line does — a
   silent headline would read as "no warning". Neither
   state, nor any warning, is stored: the bundle cache
   strips the block to null in the stored entry and
   recomposes it per serve through the onServe hook (the
   crime stale-line pattern), proven by tests where a
   warning raised after caching serves on the next read
   and a lapsed one disappears, the stored entry
   byte-identical throughout.
4. **School deadline goldens.** England: "School
   application deadlines in England: 31 October for
   secondary places and 15 January for primary places —
   the national closing dates set in the School
   Admissions Code, for a place the following September.
   Some schools also ask for a supplementary form, which
   can have its own deadline." — served in the nearby
   bundle at the universal homes (the line also rides
   the report's closing notes at M8, from this same
   served shape). Wales (Cardiff CF11 8AA): "School
   application deadlines in Wales are set by each
   council — check the council's own admissions pages
   for this year's dates." Scotland (Edinburgh) and
   Northern Ireland: nothing served. The nation is read
   from the filed LSOA code's first letter (the flood
   brain's precedent); an unreadable code serves
   nothing — the failure direction is always away from
   serving the English dates. The dates are constants
   citing the Code in code; the plan's annual ops check
   keeps them current (there is no code mechanism to
   wire into — the check is the plan's ops row).
5. **Contract re-pin (authorised).** The served flood
   shape gained the liveWarnings key (null uncomposed),
   the short flood section the same, and the nearby
   distances shape the schoolDeadlines key; two pins
   were added (flood.served-warnings,
   short.flood-warnings). Seven pins moved
   (flood.served-mixed, short.rung1, short.rung2,
   nearby.served, nearby.beyond-only,
   nearby.none-anywhere, nearby.not-filed) and two were
   added. The explainer census gained rows 76–78 (78
   families, 46 hard: the severity level and overflow
   count registered hard at both depths; the deadline
   dates hard with the Code named in their own line).
   The cache's stored-shape contract gained presence
   checks for both new keys, in the established
   degrade-to-recompute pattern.

## Maternity units (M6.24, founder ruling at M6.23)

The founder's M6.23 ruling built the maternity category
(B3) on the second attempt's re-scoped signal: the first
build premise — that the filed CQC service types could
select maternity units — was proven false by the first
check, and the step was re-scoped before any code shipped.

1. **The signal finding (proven at the first check, pinned
   in tests).** The CQC directory's "Service types" column
   is an organisational vocabulary (Hospital, Clinic,
   Dentist, Ambulances, Hospice…): the word "Maternity"
   appears nowhere in the filed directory fixture, and the
   hospitals that are maternity units file there as plain
   "Hospital". The signal is the CQC ratings file's
   "Service / Population Group" column, whose literal value
   "Maternity" the fixture carries for exactly four
   locations: R1HNH (Newham University Hospital), RAJ32
   (Broomfield Hospital), RVR05 (St Helier) and RVR50
   (Epsom General). The health loader already parsed that
   column row by row — for the emergency-department flag
   and the overall rating — and discarded the groups;
   M6.24 files them (migration 0023). Both fixture facts
   are pinned in tests/load-health.test.ts.
2. **Filing rules.** Hospitals only. The groups file
   pipe-joined in the cqc_service_types style, in the
   published case, first-seen order, deduped — except
   "Overall", which is the overall rating's own marker in
   that column and already files as the rating in
   cqc_ratings. A hospital with no ratings rows files
   NULL: never an empty string dressed as knowledge,
   never an inferred group. The loader's own golden
   checks pin the four maternity hospitals, St Peter's
   (RAJ1K, no ratings rows) filing none, and the
   hospitals-only invariant across the whole filed set.
3. **The category.** "maternity" (label "maternity
   units") mirrors the A&E category exactly: essential,
   so the single nearest is named beyond the 2-mile
   radius in the ruled words; absence is a ground fact;
   the answer serves in the existing D22 shape. It sits
   immediately after A&E in the served order — the nearby
   bundle now serves twenty-one categories. Selection is
   a filed-data membership test on the pipe-joined
   groups, exact by construction. It is NOT a headline
   category: the short bundle's six (D28) are unchanged,
   proven by an identity test (the short bundle derived
   from the twenty-one-category bundle equals, field for
   field, the short bundle derived with the maternity
   answer removed). No CQC rating field joins any served
   shape — serving the filed ratings is M6.25's step.
4. **Goldens** (computed from the filed fixture data
   through the real code; the nearby fixture capture was
   regenerated by its README recipe and the diff verified
   — every pre-existing field identical, only the new
   column added, five hospitals filing any groups, the
   four above filing Maternity):
   - **19 Birkdale Rise CM3 2JT** — none-within: places
     empty, countWithin 0, beyondNearest Broomfield
     Hospital at 5.89 miles, line "none within 2 miles —
     nearest is Broomfield Hospital, 5.89 miles away
     (straight-line distance from the postcode point)".
     The honest beyond answer IS the golden: no maternity
     unit stands within the radius of this home.
   - **6 Exeter Road E16 1GN** — within: Newham
     University Hospital at 0.782 miles, countWithin 1.
   - **Flat 4, Minerva House KT17 1FH** — within: Epsom
     General Hospital at 1.732 miles, countWithin 1 (St
     Helier, the fixture's other nearby maternity
     hospital, sits beyond the radius).
5. **Contracts.** No bundle-shape pin moved: the
   category's answer is the established category shape,
   the pins are category-name-agnostic, and all 46 pins
   stand (a no-re-pin record sits in
   tests/bundle-contracts.test.ts). The explainer census
   is unchanged at 78 families / 46 hard — the category's
   figures (place miles, countWithin, beyondNearest
   miles) fall under the existing category-generic
   families. The cache's stored-shape contract gained a
   maternity presence check in the established pattern:
   a pre-M6.24 entry (twenty categories) degrades to a
   recompute, proven by test.

## CQC ratings on health rows (M6.25, founder ruling at M6.23)

The ratings have been filed since M4.7 (the cqc_ratings
table) but no brain served them — the M6.23 sweep's "as
served" premise was wrong, found at M6.24's first check.
This step serves them on the nearby answer's health rows.

1. **The join (proven at the first check, before any
   serving code).** The loader files every rating with
   the health point's own id — cqc_ratings.health_point_id
   to health_points.id — having matched the ratings file
   to the point by exact code (Location ID, or the
   Location ODS Code), never by name. At most one rating
   row files per point: the latest overall rating, with
   same-day conflicting ratings withheld and logged (the
   loader's tie rule). The fixture filing proves the link
   complete: 499 ratings filed, 0 with a null point link —
   494 on GP practice points, 5 on hospital points, none
   on branch surgeries, dentists or pharmacies, none on a
   Welsh point (CQC covers England only). The brain joins
   on that filed link; no key was invented.
2. **The served field.** Every place the GP, A&E and
   maternity categories serve carries cqcRating: the
   location's overall rating exactly as filed — the
   rating word ("Good", "Requires improvement",
   "Outstanding", "Inadequate", or "Not Rated" where CQC
   files that) and the rating's Publication Date as CQC's
   file carries it (the filed rating_date is that
   publication date; the one "Not Rated" row files no
   date, and serves null). A maternity row carries the
   location's OVERALL rating, never a maternity-specific
   one. A health place with no filed rating serves
   cqcRating null — the named absence, never an inferred
   or neighbouring rating. Dentists and pharmacies carry
   no rating field at all (no ratings file for them), and
   the beyond-radius pointer stays name-and-miles, as it
   does for every filed fact. Ratings are full-check
   depth: the short bundle's derivation never reads the
   field, proven by an identity test.
3. **Goldens** (computed from the filed fixture data
   through the real code; locked in tests/nearby.test.ts,
   and through the real database source in the golden
   replay's M6.25 cell):
   - **19 Birkdale Rise CM3 2JT** — GP: SYDNEY HOUSE
     SURGERY (the Sidney House branch) unrated — branches
     are never the rated location; DOUGLAS GROVE SURGERY
     Good, 2026-07-17. A&E and maternity serve no places
     (Broomfield is the beyond-radius nearest for both).
   - **6 Exeter Road E16 1GN** — A&E and maternity:
     Newham University Hospital, Requires improvement,
     2026-07-17. GP: CUSTOM HOUSE SURGERY Good,
     2026-06-01; CUMBERLAND MEDICAL CENTRE unrated;
     CARPENTERS PRACTICE - ST LUKE'S PRACTICE SITE
     unrated.
   - **Flat 4, Minerva House KT17 1FH** — A&E and
     maternity: Epsom General Hospital, Good, 2026-06-11.
     GP: FOUNTAIN PRACTICE unrated; SPRING STREET SURGERY
     Good, 2020-08-20.
4. **Contracts.** One bundle-shape pin moved:
   nearby.served (the health places' variants gain the
   rating object and the null form); all 46 pins stand,
   with the re-pin record in tests/bundle-contracts
   .test.ts. The explainer census gains row 79
   (nearby.cqc-rating, self — the regulator's published
   word is its own explanation): 79 families / 46 hard.
   The cache's stored-shape contract extends in the
   established pattern: a pre-M6.25 entry whose health
   places lack the rating key degrades to a recompute,
   proven by test.

## EPC construction block (M6.26, decision D48)

The EPC answers gain each certificate's recorded
construction descriptions — the register's own words for
how the home is built, in the seven element groups
(walls, roofs, floors, windows, lighting, main heating,
hot water) — as a per-certificate block at report depth.

1. **The filing (the first check's corpus, pinned).** The
   fixture corpus's 128 certificate documents all carry
   the seven groups; windows alone is absent, on exactly
   6 of 128. Each entry holds a description — a plain
   string on some vintages, a { value, language } object
   on others — plus the group's per-element 0–5 energy
   and environmental efficiency ratings. The loader's
   minimisation (loaders/load-epc.mjs, constructionOf)
   files the descriptions only, normalised per entry
   exactly as dwelling_type is; the ratings are dropped
   at filing and never held (the recorded judgment: 0
   means not applicable on the register's own scale, and
   the numbers are verdict-shaped). A group the register
   does not publish files null. No migration — the
   artefact is JSONB in postcode_cache.answers. The
   loader's own golden check pins the filed shape for
   the four golden certificates by deep equality, so a
   rating number filed anywhere in a group fails the
   load.
2. **The served block.** Inside each certificate's own
   serving, under its assessment label: the seven groups
   in register order, descriptions verbatim — RdSAP
   "(assumed)" markers kept, disagreements between a
   home's certificates standing whole, an absent group
   serving the named line "not recorded on this
   certificate" and never a borrowed value. The block
   carries the pinned basis line (the certificate's own
   description, recorded at the assessment; "(assumed)"
   means the assessor could not inspect that part), and
   the pinned U-value line serves only where a
   transmittance description appears. A U-value exists
   solely as text inside a description: no numeric
   U-value field exists anywhere in the served shape
   (a shape test walks the whole EPC section; the sole
   key the scan allows is uValueLine, the D13 line
   itself, a string). The headline and the short bundle
   gain nothing — proven by an identity test, and the
   short contract pins did not move.
3. **Goldens** (computed from the filed fixture data
   through the real code; locked in
   tests/area-bundle.test.ts, and through the real
   loader and database source in the golden replay's
   M6.26 cell):
   - **19 Birkdale Rise CM3 2JT** — the SAP set: walls
     "Average thermal transmittance 0.27 W/m²K", roofs
     0.11, floors 0.15; windows "High performance
     glazing"; lighting "Low energy lighting in all
     fixed outlets"; main heating "Boiler and radiators,
     mains gas"; hot water "From main system, waste
     water heat recovery". The U-value line serves.
   - **6 Exeter Road E16 1GN** — the two certificates
     disagree whole. 2023 RdSAP: walls "Cavity wall, as
     built, insulated (assumed)", roofs "(another
     dwelling above)", floors "Solid, insulated
     (assumed)", windows not recorded, main heating and
     hot water "Community scheme"; no U-value line. 2013
     SAP: transmittance 0.28 / 0.2 / 0.21, windows "Fully
     double glazed", hot water "Community scheme with
     CHP"; the U-value line serves.
   - **Flat 4, Minerva House KT17 1FH** — walls 0.18;
     roofs "(other premises above)"; floors "(other
     premises below)"; main heating "Boiler& underfloor,
     mains gas" — the register's own ampersand, served
     as recorded.
4. **Contracts.** Three bundle-shape pins moved
   (area.rung1-rich, area.flag-on-no-match,
   area.tribunal-served — the pins whose bundles serve a
   certificate); all 46 pins stand, with the re-pin
   record in tests/bundle-contracts.test.ts. The
   explainer census gains row 80 (area.epc.construction,
   hard — the U-value's beside-figure line): 80 families
   / 47 hard. The cache is unchanged by design (D48):
   the D29 area version vector carries the EPC
   artefact's hash, so the monthly re-file that first
   files construction busts every stored entry for the
   postcode; the brain always emits the construction
   key on a served certificate (the block, or null for
   a pre-widening artefact).

## Air Quality Management Areas (M6.30, decision D59)

The air section gains the `aqma` block at report depth:
the declared Air Quality Management Areas from Defra
UK-AIR (Ricardo's service, edition 2026-10-20 — 374 areas
UK-wide: England 310, Wales 32, Scotland 14, Northern
Ireland 18), filed into `planning_layers` as
`constraint_type='aqma'` by the quarterly `load-aqma`.
The file publishes no per-area dates, so the block's
source line carries the dataset edition date and nothing
else is dated. Distances are boundary distances on the
D22 basis; only the nearest area within 2 miles is ever
named.

1. **The filing (pinned).** Keyed on AQMA_REF; name,
   declaring authority and the declared pollutant codes
   (register order NO2, PM10, SO2, BENZENE) filed per
   area; the nation derives from the first letter of
   LA_ONS_ID. The fail-closed contract: total within
   ±10% of the 374 snapshot (337–411) and nation floors
   England ≥200, Wales ≥10, Scotland ≥5, Northern
   Ireland ≥5, plus per-feature checks — a breach
   refuses the filing and keeps the last good copy.
   Filing is a single-edition swap, so a revoked area
   leaves the table (witnessed by the edition-B fixture
   cut without Sutton AQMA, ref 1545).
2. **The goldens (edition 2026-10-20).** Birkdale —
   none within 2 miles (nearest MDC AQMA No.1 at
   4.301); Exeter — inside "Newham AQMA (No. 2)",
   London Borough of Newham, nitrogen dioxide (NO2)
   and particulate matter (PM10); Minerva — nearest
   Sutton AQMA (London Borough of Sutton) at 0.929 on
   the golden-check basis (Kingston upon Thames AQMA
   second at 1.999, inside the radius, never served);
   Cardiff — nearest Cardiff City Centre AQMA at 0.883;
   Edinburgh EH1 1AA — inside "AQMA No. 1 City Centre"
   (ref 69, Edinburgh City Council), the Scottish inside
   witness. Where several areas cover the point, only
   the first by covering order is named.
3. **Contracts.** Eight area pins moved (the added
   `sections.air.aqma` key, not-filed form); no short
   pin moved; 48 pins stand, with the re-pin record in
   tests/bundle-contracts.test.ts. The explainer census
   gains row 86 (area.air.aqma, hard): 86 families / 53
   hard. The cache gains the `load-aqma` dependency and
   the `aqmaFiled` guard (the priorityHabitats
   pattern), plus the M6.25-pattern shapeOk presence
   rule for the `aqma` key — the area version vector
   has no planning component. The headline and the
   short bundle are unchanged, proven by an identity
   test (Exeter inside vs not-filed deep-equal).

## Charging zones (M6.31, decisions D50, D61 and D63)

The area bundle gains its own `chargingZones` section at
report depth: the charging-zone boundaries published by
the zone operators (the seven English Clean Air Zones,
the London ULEZ, the four Scottish Low Emission Zones),
filed into the dedicated `charging_zones` table
(migration 0026) by the quarterly `load-charging-zones`.
Charging amounts are never filed or served. The full
outside line serves only behind the completeness gate —
all twelve register schemes filed and the oldest filing
no more than 120 days old, computed at answer time;
while the set is incomplete, outside answers carry the
named-gap line naming the scheme whose boundary is not
published.

1. **The filing (pinned).** Eleven schemes file from
   their operators' published boundaries; Portsmouth
   files no row (no boundary published — decision D63;
   its register facts, Class B and 29 Nov 2021, are
   recorded for the day it files). Pinned reference
   areas (EPSG:27700, measured on the live downloads
   16 Nov 2026): Bath 3.203 km2, Birmingham 7.657,
   Bradford 21.985, Bristol 3.258, Sheffield 2.371,
   Tyneside 2.294, ULEZ 1,528.357, Glasgow 3.062,
   Edinburgh 3.036, Dundee 0.459, Aberdeen 0.857. The
   filing contract refuses (keeping the last good set):
   any scheme outside ±25% of its reference area, any
   invalid geometry, any positive-area overlap between
   two filed boundaries (the register is pairwise
   disjoint), and Bristol's WECA hosted copy (STATUS
   "Proposed" — the council's production layer, STATUS
   "In force", is the only Bristol source). The ULEZ
   file's coordinates are EPSG:27700 despite its label;
   the loader detects the CRS on the coordinates and
   transforms. `source_date` files NULL for every
   scheme: no source states a clean edition date for
   its boundary (Bath's April 2024 edition and Bristol's
   version stamp ride in their terms notes).
2. **The goldens.** Exeter — inside the London ULEZ
   ("Charges in this zone, at this boundary, began on
   29 August 2023"); Edinburgh EH1 1AA — inside the
   Edinburgh Low Emission Zone (penalties from 1 June
   2024; the replay witness is EH1 1AD, inside the same
   boundary); Minerva — outside every filed zone,
   named-gap form (its distance to the ULEZ boundary,
   1.362 miles, is recorded in docs/backend-m6.31.md
   and served NOWHERE — the section has no nearest
   state); Birkdale and Cardiff — outside, named-gap
   form. The named-gap line, pinned verbatim in the
   serving tests: "This postcode point is not inside
   any charging zone whose boundary is published. The
   Portsmouth Clean Air Zone is in force, but its
   boundary is not published, so it cannot be checked
   here."
3. **Contracts.** Nine area pins moved (the added
   `sections.chargingZones` key, not-covered form —
   plus area.rung3's named-state stub); no short pin
   moved; 48 pins stand, with the re-pin record in
   tests/bundle-contracts.test.ts. The explainer census
   gains row 87 (area.charging-zones, hard — draft
   state at this step): 87 families / 54 hard. The
   cache gains the `load-charging-zones` dependency,
   the `chargingZonesFiled` count guard and the
   `chargingZonesGate` guard (the gate's value, which
   can flip on time alone), plus the M6.25-pattern
   shapeOk presence rule for the `chargingZones` key.
   The headline and the short bundle are unchanged,
   proven by identity tests (Exeter inside-ULEZ vs
   not-covered deep-equal). Two register canaries watch
   GOV.UK's CAZ list and the Scottish LEZ count,
   warning if a scheme appears or vanishes.

## Industrial sites (M6.32, decisions D50, D60 and D62)

The nearby bundle gains the `industrialSites` block at
report depth, at the end of What's Nearby: the regulated
industrial sites in the Environment Agency's Pollution
Inventory within two miles, filed into `industrial_sites`

- `industrial_site_releases` (migration 0027) by the
  annual `load-pollution-inventory`. The block serves
  behind `INDUSTRIAL_SITES_ENABLED` (default ON, decision
  D60): while the flag is off the key is absent entirely
  and the source is never read. Each site serves its filed
  address verbatim (the source carries no site name), its
  operator, its permit reference and its releases to air
  for the filed year; a below-reporting-threshold return
  files quantity NULL + the flag and serves as a name on a
  labelled line — never 0, never a number — distinct from
  a quantified return of 0 and from no air rows at all.
  Nothing is totalled or ranked across substances.

1. **The filing (pinned).** The register is the
   Substances sheet's permits: 2,870 in the 2024 vintage
   (published 20 Nov 2025, the workbook member's own
   stored date), 2,720 of them reporting to air in some
   form, 17,907 air-route rows, 12,841 of those the
   below-threshold marker; 2,856 sites file a point (14
   publish no easting/northing and can never serve). The
   loader resolves the latest year on the dataset record
   and files only a vintage whose counts are pinned in
   its MEASURED_VINTAGES (bands ±10%); a newer year
   refuses until measured and pinned, and the
   `ea-pollution-inventory` canary warns the day it
   lands. The swap is one transaction; the deletion path
   (D60/D62) is the loader's exported
   `deletePollutionInventory`.
2. **The goldens.** Birkdale — one site: YP3432XR
   (Fairwinds Farm Poultry Unit; Stuart Davis Limited),
   1.328 miles, Ammonia 3,128 kg (threshold 1,000), PM10
   3,066 kg (threshold 1,000), NOx below threshold.
   Exeter — six sites in distance order: SP3237JU 0.998,
   BP3530YR 1.141, FP3839YQ 1.161, EP3507SL 1.203 (its
   renewable-CO2 return carries threshold 0), MP3530HZ
   1.465 (Thames Refinery, T & L Sugars Limited: carbon
   dioxide 88,988,870 kg), DP3906BE 1.956 (below
   threshold only, ten substances). Minerva — none within
   two miles, the 2024 none line. Cardiff, Edinburgh and
   Belfast serve the named not-covered state (the Welsh
   Emissions Inventory, the Scottish Pollutant Release
   Inventory, the Northern Ireland Pollution
   Inventory). The replay asserts all of it through the
   real source on the fixture filing — the published
   2024 ZIP cut to the seven golden permits plus one
   no-air-rows permit (PP3936YU) and one coordinate-less
   permit (CP3140QU), both far from every golden home.
3. **Contracts.** Four nearby pins moved (the added
   `industrialSites` key: served form for
   nearby.served / nearby.beyond-only, none form for
   nearby.none-anywhere, not-filed form for
   nearby.not-filed); nearby.rung3 and nearby.rung4 did
   NOT move, no other brain's pins moved, and no short
   pin moved — the short bundle is byte-identical with
   the flag on or off, proven in the replay. 48 pins
   stand, with the re-pin record in
   tests/bundle-contracts.test.ts. The explainer census
   gains row 88 (nearby.industrial-sites.releases, hard —
   draft state at this step): 88 families / 55 hard. The
   cache gains the `load-pollution-inventory` dependency
   (the nearby guard set stays directory-only — the
   loader is a runner class whose stamp moves) and the
   shapeOk presence rule tying the key to the flag
   position, which is what makes the D60 flip purge-free
   (the flip drill is proven in the cache suite).

## Sixth forms (M6.33, decisions D51 and D64)

The nearby bundle gains a twenty-second category,
"sixth forms and colleges", immediately after
schools-secondary, read from the same schools filing as
the school lists — no new loader, no new table — and
the schools-secondary places gain the `sixthForm`
marker: the register's filed flag as filed, true only
on "Has a sixth form", false only on "Does not have a
sixth form", null where the register files neither
(never derived from age ranges). The category's
selection is mainstream only (D64): every "16 plus"
phase row (further education colleges, 16-19 academies
and free schools) plus the flagged rows of every other
phase except Secondary — special-sector types out,
independent types out, British schools overseas out,
Welsh establishments out, and 'Sixth form centres' /
'Special post 16 institution' out at V1 (the first by
construction: phase and flag both file "Not
applicable"). Places serve name, the type as filed and
distance — no Ofsted element (D64 ruling 5). The
within list never repeats a school the secondary list
serves; the category's beyond-nearest alone may draw
on flagged secondaries (ruling 4), and only strictly
beyond the radius.

1. **The selection (pinned).** Measured on the full
   live GIAS extract of 16 Nov 2026 (27,159 open
   establishments — exactly the filed count): the D64
   selection holds 410 rows nationally (the prep's
   mainstream variant counted 456; D64's Welsh clause
   removes its 46 Welsh rows). Composition: 207 FE
   colleges, 82 further 16-plus rows (16-19 academies
   and free schools among them), 95 flagged all-through
   schools, and a tail of 26 flagged rows in other
   phases (alternative provision and pupil referral
   units among them — they ride the flag clause as the
   prep's counted variant held them; D64 named no
   exclusion for them). Secondaries file the flag
   "Has" 1,890 of 3,173; the marker's null values file
   as 88 "Not applicable" and 2 blank among secondaries
   (the figure 82 sometimes quoted is the 16-plus
   sector's own flag-Has count in the same enumeration).
   No independent-type row files a Primary or Secondary
   phase, so no independent school appears in any served
   school list before or after the step.
2. **The goldens (national, from the live extract).**
   Minerva KT17 1FH — the category serves NESCOT alone:
   North East Surrey College of Technology (URN
   130822), type "Further education", phase "16 plus",
   flag "Not applicable", 0.174 miles — it enters on the
   phase clause alone. Exeter E16 1GN — eight within,
   the served three East London Arts & Music (1.445),
   New City College (1.692), Oasis School 21 (1.758, an
   all-through school on the flag clause). Birkdale
   CM3 2JT — none within; the beyond name is Lift New
   Rickstones, a flagged secondary at 3.212 miles under
   ruling 4 (the pure category rule would have named
   Beaulieu Park School at 4.664). Markers: Minerva's
   served secondaries all true (Glyn, Blenheim,
   Nonsuch); Exeter's all false (Rokeby, Royal Docks,
   Cumberland); Birkdale's Lift Maltings false.
3. **The replay (fixture filing).** The schools fixture
   cut holds one within-selection row (NESCOT), so the
   replay asserts Minerva's category verbatim, the
   markers true at Minerva and false at Exeter and
   Birkdale, Birkdale's beyond name (Lift New
   Rickstones, 3.212 — the fixture cut includes it, so
   the national golden reproduces), Exeter's beyond
   name on the fixture basis (Bexley Grammar School,
   5.484 — the national three are not in the cut), and a
   second ruling-4 witness at City Island (St
   Bonaventure's RC School, 2.088). The marker's null
   value has no witness among the fixture's served
   secondaries; it is pinned in tests/sixth-forms
   .test.ts and in the contracts pin (the null variant
   on the fake's second secondary place).
4. **Contracts.** One pin moved (nearby.served),
   differing by exactly the marker's two variants on the
   secondary places; the new category's answer shape
   already stood among the distinct category shapes, so
   nearby.beyond-only, nearby.none-anywhere and
   nearby.not-filed did not move, nor did the rung pins
   or any short pin — the short bundle is identical with
   the category removed and the marker stripped, proven
   in the short-bundle suite. 48 pins stand, with the
   re-pin record in tests/bundle-contracts.test.ts. The
   explainer census gains no family — the marker's field
   name joins the not-a-figure allowlist beside
   `selective`, the distances ride
   nearby.distance-miles and the type-as-filed detail
   the names group: 88 families / 55 hard stand. The
   cache gains the `schoolsFiled` guard on the nearby
   version vector (D64 ruling 9 — a hand-run
   `load:schools` moves no runner stamp; the count
   closes the hole, the M6.30 pattern) and the shapeOk
   presence rules for the category and the marker key.

## School destinations (M6.34, decisions D51 and D65)

The destinations outcomes
below are on the fixture basis: the runner's fixture
pass files the cut-down real release files (the 2023/24
cohort, Provisional, published 15 October 2026), and the
replay asserts through the real source. The national
goldens stand in the loader suite, measured on the full
release files at the step's first checks.

1. **Birkdale.** The one served secondary, Lift
   Maltings (URN 135653 — the release file's name for it
   is "Maltings Academy"; the URN is the join), carries
   its KS4 block exact: cohort 171, 84.8% overall
   sustained, 72.5% education, 5.3% apprenticeships,
   7.0% employment. No KS5 block — the school's
   sixth-form marker is false.
2. **Exeter.** All three served secondaries carry KS4
   blocks exact (Rokeby: 146 leavers, 90.4 / 90.4 / 1.4
   / 2.7; Royal Docks Academy: 168, 82.1 / 81.5 / 0.6 /
   8.3; Cumberland Community School: 297, 88.6 / 88.2 /
   0.7 / 4.7) and no KS5 blocks — all three markers are
   false, so Exeter's served list would have carried no
   destinations at all under a KS5-only scope (D65
   ruling 1).
3. **Minerva.** Both stages on all three sixth-form
   secondaries, exact, including the KS5 higher
   education shares (Glyn: KS4 251 leavers, 96.4 / 88.0
   / 7.2 / 1.2; KS5 253, 87.4 overall, 61.7% HE.
   Blenheim: KS4 205, 95.6 / 93.7 / 1.5 / 0.5; KS5 93,
   81.7, 53.8% HE. Nonsuch: KS4 209, 97.1 / 95.2 / 0 /
   1.9; KS5 230, 92.2, 82.6% HE). NESCOT's KS5 row is in
   the filing (cohort 953, 70.4% overall, 11.1% HE) and
   its sixth-forms place carries neither a destinations
   block nor a URN (ruling 5).
4. **States.** The suppressed state (a filed row whose
   shares the source suppressed — cohorts under six)
   and the no-row state (Plashet School, URN 152267, a
   fixture secondary with no KS4 headline row in the
   release) are pinned in the serving and loader suites
   on the prep's adopted wordings, verbatim; the
   suppressed SERVING state has no golden-replay witness
   (no served secondary in the golden set is suppressed
   nationally) and is proven in the brain suite, the
   M6.33 marker-null precedent. The not-filed state
   serves from the release read, never from an empty
   table.
5. **Contracts.** One pin moved (nearby.served),
   differing by exactly the destinations blocks and the
   URN key on the secondary places — proven by leaf
   diff: the new shape with those keys stripped is the
   old shape, and no other pin moved. No short pin
   moved: destinations are report depth only (ruling
   4), proven by short-bundle identity with the blocks
   stripped. The explainer census gains six hard
   families (rows 89–94: the cohort count and the five
   served shares), 94 families / 61 hard; each stage's
   cohort line carries the cohort figure's beside-figure
   line and the sustained line carries the shares'. The
   cache gains the loader in the nearby brain's
   dependencies, the `destinationsFiled` guard (a
   hand-run filing busts on the count alone) and the
   shapeOk presence rule for the destinations key.
