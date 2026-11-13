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

| Combination                                                                    | Covered by                                                                                                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| The home itself has exactly one recorded sale                                  | Birkdale (£588,995, 15 Jun 2023, its only sale)                                                                              |
| Street median over a defined report set; category-B rows present on the street | Birkdale (median £610,875 over the report's eight; 31 recorded street sales incl. category-B rows)                           |
| Postcode median over few sales                                                 | Exeter (£310,000 over 9 sales)                                                                                               |
| Many sales, mixed category A/B; same flat number in sibling buildings          | Epsom (31 sales, 27 category A; Flat 4 exists in Jupiter, Minerva and Juno Houses — only PAON+SAON identifies the right one) |
| New-build: no or almost no recorded sales                                      | C10 — EPC side verified; the exact sales count is to be fixed at first load from pp-complete                                 |
| Postcode with zero recorded sales of any kind                                  | GAP — E16 1EG is the likely fill (introduced Oct 2025) but its sales count is unverified; verify before relying on it        |

### Crime (M4.3) — counts only, never a score

| Combination                 | Covered by                                              |
| --------------------------- | ------------------------------------------------------- |
| Very low count, semi-rural  | Birkdale (330 in 12 months to Sep 2026, 1 mi)           |
| Very high count, inner city | Exeter (10,722, same window)                            |
| Mid count, suburban flat    | Epsom (1,956, same window)                              |
| Genuinely tiny rural count  | C9 — expected but NOT yet counted; verify at first load |
| Zero crimes in window       | GAP — no verified candidate; a C9 count may land here   |

### EPC (M4.5)

| Combination                                                                            | Covered by                                                                                                           |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| One certificate for the home, band B, measured (RdSAP-era)                             | Birkdale (band B, 141 sq m, registered 7 Oct 2022)                                                                   |
| Two certificates for the SAME address with disagreeing floor areas — both must survive | Exeter (71 sq m 2013 and 91 sq m 2023, both band B)                                                                  |
| Building-level certificates; all one band; same flat number in three buildings         | Epsom (25 certs, all band B; Flat 4 cert in each of the three Houses; the flat's own is SAP, 70 sq m)                |
| Predicted-only (SAP) certificates, new-build                                           | C10 (49 certs, all SAP, all band B)                                                                                  |
| ZERO certificates at the postcode                                                      | E16 1EG (verified zero via the EPC register; E16 1DP the same) — EPC-only guard                                      |
| Mixed bands at one postcode incl. a poor band (F/G)                                    | GAP — kind of postcode that fills it: an older unrenovated street (pre-1919 terraces) in any of the existing regions |

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

### EV chargers (M5.7, planned)

| Combination                 | Covered by                        |
| --------------------------- | --------------------------------- |
| Urban chargers near         | Exeter, C2, C7                    |
| Zero chargers within radius | C9 — likely; verify at M5.7 build |
| Rapid-only vs mixed speeds  | GAP — decide at M5.7 gap check    |

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

### Council tax (M5.10, planned)

| Combination                                                                                                | Covered by                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Standard banded house / flat                                                                               | Birkdale, Exeter, Epsom                                                                                                 |
| Wales: Welsh bands rest on a different (2003) valuation basis — must not be presented as the English scale | C8                                                                                                                      |
| New-build: band newly set, or property not yet banded at first sale — honesty state                        | C10                                                                                                                     |
| Top band (H) property                                                                                      | GAP — kind of postcode: a large detached house postcode in Epsom / Weybridge (C5's street is the likely hunting ground) |

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
2. Remaining GAPs to fill later, only when their milestone's gap check runs: mixed/poor EPC bands at one postcode; surface-water "High" at the point; inside a SAC/SPA/Ramsar; flight-path noise; council-tax band H; schools-none-within-radius (C9 may fill it unverified).
3. Cost discipline: targeted homes assert only their own datasets, so fixture capture and quarterly re-proof stay proportional. Universal status must not be extended beyond the original three.
