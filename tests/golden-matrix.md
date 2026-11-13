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
| Genuine "none" for conservation areas, proven two ways         | Birkdale (                                                      |
| ...[truncated 9113 chars]                                      |

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
