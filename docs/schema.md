# The database shelves — schema notes

The fact store is PostgreSQL + PostGIS — the project's only database.
This page is the plain-words map of what lives where, and the record
of the physical decisions the Technical Plan left to the build.

## The shelves

The table list is the Technical Plan's Section 2 list, verbatim —
20 tables. Core:

1. **postcode_cache** — saved answers per postcode, with source +
   dates. Holds the postcode geocode (latitude/longitude, council,
   ward, region, LSOA code and — since migration 0002 — MSOA code)
   and, in its `answers` JSON, the cached
   answers for the checks the Technical Plan gives no table of their
   own — broadband, crime counts and EPC — each answer stamped inside
   with its source name and data date. Since plan step M5.9 the
   answers also carry a `mobile` key: Ofcom publishes mobile
   coverage at local-authority level only, so that answer is the
   postcode's own council area's figures with the grain named
   inside it — never presented as a postcode measurement. Since
   plan step M6.3 the answers also carry a `soldPricesLoad`
   stamp — the file edition and timestamp of the check's own
   on-demand sold-prices load. It is the durable proof that
   separates "loaded, with no sales recorded" from "never
   loaded": a load that files no sales leaves no price_paid
   rows, so the rows alone cannot tell the two states apart. Since
   migration 0017 (plan step M6.1) an expression index on the
   outward code — `split_part(postcode, ' ', 1)` — serves the
   brain's wider-area district count, which a sequential scan of
   the full directory made the one slow path in address resolution.
2. **price_paid** — Land Registry sales, loaded on demand per
   postcode and kept forever. Each row carries the Registry's
   transaction id (migration 0003) so the monthly update file can
   amend or delete it later. Sold prices are never called a
   valuation anywhere in the product. The brain's sold-price
   answers (plan step M6.3, decision D23) compute from these
   rows at answer time: the postcode median over category-A
   sales only, the count and date span named beside it; a
   home's own history includes its category-B sales,
   unlabelled, because the register does not say which
   category-B reason applies to a row.
3. **reports** — paid-report records: delivery email, report ID,
   status, payment reference (provider-neutral while the payments
   decision D3 is parked).
4. **licence_keys** — licence codes once payments start. Only the
   code's hash is stored, never the code itself.

Family:

5. **schools** — GIAS schools (name, URN, type, phase, age range,
   address, coordinates, plus the register detail the product uses:
   admissions policy — the selective flag — faith character, local
   authority, gender, sixth form, website, pupil count, and a flag
   where the position is the school's postcode position because the
   register gives no coordinates). Facts only.
6. **ofsted_outcomes** — the last graded Ofsted rating and its date,
   the newest inspection event of any kind, the ungraded outcome
   where that is the newest evidence, the report-card judgements
   where the newest inspection is one, and the report link, joined
   to schools on URN.
7. **nurseries** — Ofsted childcare, group settings only.
   Filed by `load-nurseries.mjs` (plan step M5.17) from
   Ofsted's childcare register management information
   (published twice a year, as at 30 June and 31 December;
   the loader runs quarterly in the runner): Provider type
   "Childcare on non-domestic premises" in the Full day care
   and Sessional day care subtypes only — childminders are
   never points (decision D5), the domestic-premises rows
   Ofsted publishes REDACTED hold no position to file, and
   out-of-school day care is not nursery provision. Each
   setting sits at its own postcode's position from the
   postcode directory; the subtype files verbatim as
   `setting_type`, and the register's as-at date is the
   rows' `source_date`. Migration 0018's geography index
   covers this table, so the brain's distance reads use it
   like every other point table.
8. **health_points** — service points: GP practices and their
   branch surgeries (with the parent practice's code), pharmacies
   and dental practices from the NHS organisation service, and
   hospitals from the CQC directory, each with its emergency-
   department flag (yes / no / no data — three states, never
   collapsed) and, for hospitals, its CQC service types and
   provider. Migration 0023 adds the hospital's CQC ratings
   population groups, filed from the ratings file's own
   "Service / Population Group" column: the directory's
   service types carry no maternity value, and the maternity
   units are selected from these groups. A hospital with no
   ratings rows files NULL groups — nothing is inferred.
   Every point sits at its postcode's position; no
   health source publishes coordinates.
9. **cqc_ratings** — CQC rating, publication date and report link,
   joined to a health point by the exact code the ratings file
   carries (the practice/site code) — never by name. Pharmacies,
   dentists and Welsh points have no CQC rating by design.
10. **greenspace_points** — OS Open Greenspace park points
    (plan step M5.6): one centre row and one row per access
    point (`point_role`) for the three park-serving functions
    only — Public Park Or Garden, Playing Field and Play
    Space; the Exeter golden ground is a Playing Field site,
    so a public-park-only cut would file nothing there. The
    outline shape is deliberately never stored; a centre is
    the site's area centroid, computed in EPSG:27700 (the
    centre-point convention the park distances are served
    under, accepted knowingly for V1). `osm_id` is NULL on
    every row: the product's site and access ids are UUID
    strings and the column is bigint, so site↔access linkage
    is by the shared site name each access row carries. The
    product updates twice a year (April and October editions)
    under the Open Government Licence; the loader verifies
    each edition against the Downloads API listing's md5 and
    treats an unchanged version+md5 as a healthy no-op.
    Attribution: Contains OS data © Crown Copyright and
    database rights 2026.
11. **osm_points** — OpenStreetMap places (plan step M5.6):
    the What's Nearby points — `vet`, `pet_shop`,
    `pet_boarding`, `supermarket`, `food_and_drink` (any sort
    of food option: restaurant, pub, cafe, fast food, bar),
    `leisure`, `visit`, `worship`, `library` and `park` — one
    row per place under exactly one primary group (priority:
    visit, worship, leisure, library, food & drink, then the
    care and shop groups, parks last). The point is the
    element's representative point: a node's position, a way's
    node-average centre, a multipolygon relation's member
    average — the same convention for every group, so
    distances compare. Named and unnamed rows both file
    (serving shows named places and counts the rest). Since
    migration 0009 a row also carries `detail`: for worship,
    the religion exactly as recorded (multi-value strings
    verbatim, never normalised or inferred; no tag, NULL) and
    nothing for any other type. The same place mapped twice
    files once (same group + normalised name + points under
    30 m, preferring relation over way over node); a name
    alone never merges two places. `osm_id` holds the
    element's numeric id only — nodes, ways and relations
    share one number space, so it is a reference back to the
    map, not a unique key. Data © OpenStreetMap contributors
    under the ODbL: the table is a derivative database, stays
    private, and only facts (names, distances) are served.
12. **transport_stops** — NaPTAN stops and stations (plan step
    M5.5): one row per ATCO code (the table's key — the Bus
    Open Data Service joins on it later), name and stop-type
    code filed verbatim, exact coordinates. Active rows only,
    nine stop families (BCT, BCS, BST, RLY, MET, TMU, FER,
    FBT, FTD — never entrances, platforms or taxi ranks:
    a station files as its station-level points, and grouping
    them into one "station" is a read-time concern). 31,417
    active stops publish no coordinates, only OS grid
    references — including every Elizabeth line rail station —
    so the loader converts Easting/Northing (EPSG:27700) to
    latitude/longitude before filing (the columns are NOT
    NULL) and counts the conversions in its log line. The
    stop-type code is the source's vocabulary, not a mode
    claim: MET and TMU include heritage railways outside
    London, and NaPTAN carries no line or route data, so no
    line attribution can come from this table. No locality,
    street or indicator is held — the name, type and distance
    are the transport answer's substance in V1.
13. **air_grid** — Defra modelled air quality, one row per 1 km
    square per year (NO2, PM2.5, PM10). Filed by load-air-quality
    (plan step M5.9) from the PCM background maps: concentrations
    as published at full precision, year-stamped, served labelled
    modelled — no band is computed or stored.
14. **noise_summary** — one pre-summarised daytime + night-time
    noise band pair per area PER SOURCE. Designed road-only in
    migration 0001; the founder ruled rail and airport noise
    into V1 (plan step M5.9), so migration 0012 adds
    `source_kind` ('road', 'rail' or 'airport') with one row per
    (area, source) — area is the postcode, the point its
    directory point. Bands are the publisher's 5 dB presentation
    ranges (day from 55 dB, night from 50 dB), with below-range
    ("Below 55 dB") and no-modelled-source ("No modelled road
    noise" — grid 0 or nodata) as distinct filed states; a grid
    value of 0 is never stored as "0 dB". The raw 10 m grid
    never enters the database: load-noise samples it loader-side
    and files bands only.
15. **flood_layers** — Environment Agency flood shapes. Three
    layers in one table, told apart by `layer_type` and never
    merged: `flood_zone` (the planning Flood Zones 2 and 3,
    which ignore flood defences), `rofrs` (the rivers & sea
    likelihood bands, which count defences) and `rofsw` (the
    surface water likelihood bands — it has no Very low band).
    Since migration 0008 each shape also carries a `detail`
    field: for a zone, its flood source and origin as published
    ("river and sea · modelled and recorded"); for the band
    products, the depth basis (">0 m"). Each product's own
    revision date is stamped on the shapes it files — the three
    revise independently, so one load can stamp three different
    dates. Absence is never filed: there are no synthetic
    Zone 1 or "Very low" shapes, so an empty answer is always
    computed against the filed counts.
16. **planning_layers** — planning constraint shapes (conservation
    areas, Article 4 areas, green belt, scheduled monuments, and
    the nature layers: SSSI, SAC, SPA, Ramsar, ancient woodland
    and priority habitat). Air Quality Management Areas file
    here too (M6.30, `constraint_type` 'aqma'): the area's name,
    its declaring authority in the organisation field, the
    declared pollutant codes in the detail field and the
    publisher's AQMA_REF in the source reference — the
    publisher's file carries no per-area dates, so the dataset
    edition date is the only date the answers serve. Since migration 0007 each shape also
    carries its source reference, the supplying organisation's
    platform entity number and the source quality flag, plus a
    detail field (for an Article 4 area, the
    permitted-development rights it removes, as published).
    Green-belt shapes are named by the belt itself ("London"),
    never by the district that compiled the piece. Ancient
    woodland files as ONE merged layer from Natural England's
    two inventories — the revised inventory wins where they
    overlap, and the detail field records which inventory each
    shape came from, because the inventories are provisional
    and the absence answer is "recorded in the inventory",
    never "there is none". Nature rows carry no quality flag —
    Natural England publishes none per row, so the field stays
    NULL rather than inventing one.
17. **listed_buildings** — listed buildings (NHLE): name, grade,
    position.
18. **neighbourhood_stats** — the Index of Multiple Deprivation,
    one row per LSOA, no shapes: deprivation decile, score and
    rank, served only to the paid depth — never to the panel,
    hooks or shortlist. This table was once described as also
    holding Census 2021; it does not — the Census is keyed by
    MSOA and lives in **census_stats** (24). The M5.9 loader
    (load-imd) files IoD2025 here: the overall score, rank and
    decile in their columns (summary line rendered from the
    decile at load), and the seven domain deciles inside
    `stats`. England only — the Welsh and Scottish indices are
    separate publications on their own scales and are never
    filed into this table.
19. **ev_points** — public EV charging SITES from Open Charge
    Map (plan step M5.7; the National Chargepoint Registry the
    table was designed for was decommissioned in November
    2024, and `registry_id` now holds the Open Charge Map
    site id — the representative record's POI id). One row
    per SITE, not per device: records group before filing
    (same operator + same normalised title + points within
    30 m), and device/connector counts are facts about the
    site. Only explicitly-public usage classes file — Public,
    Public – Pay At Location, and Public – Membership
    Required under the founder's re-rule of 13 Nov 2026 —
    each site's class carried in `detail` EXACTLY as
    recorded, the site's served class being the most
    restrictive among its records; every exclusion (other
    classes, unrecorded access, Planned/Removed statuses,
    Northern Ireland) is counted per run, never silent.
    `operator` is a column; `detail` (migration 0010) carries
    the recorded facts: usage class(es), status + its
    recorded date (both NULL when unrecorded — 37% of
    records; a dated record, never a live availability
    claim), the per-record data provider(s) (attribution is
    load-bearing: 42% of the GB data is the dead registry's
    own Dec 2023 import), device count, merged-record count,
    the full connector list (type + kW + quantity) and the
    fastest published power (`max_kw`, NULL when the source
    publishes none), and the address as recorded. The legacy
    `connector_types` / `charging_speed` columns are written
    as summaries of the detail (the type list; "up to X kW").
    Attribution for serving: "Open Charge Map" plus the
    record's own data provider, per record.
20. **council_tax_charges** — the billing authorities'
    average Band D council tax (migration 0014, plan step
    M5.10), one row per billing authority per tax year,
    superseding this list's original **council_tax_rates**
    placeholder (migration 0001: name-keyed, one row per
    council for all years, a pounds figure with no
    components — dropped by 0014; nothing ever filed it
    from a real source). `band_d_area_average_pence` is
    the publisher's AREA Band D in whole pence (MHCLG
    Table 9 for England; the StatsWales total for Wales)
    — an area average, with parish (England) and
    community (Wales) precepts averaged into it wherever
    `parish_averaged` is set. The component split is six
    fixed nullable pence columns — billing authority (its
    own element excluding parish precepts), county,
    police, fire, GLA, combined authority — chosen over a
    JSON breakdown because the precept stack is a closed
    statutory list of six roles that does not grow, and
    columns keep the pence arithmetic, the CHECK
    discipline and serve-time maths in SQL. A role folded
    into another body's charge is NULL (fire inside a
    county or unitary element), never a borrowed figure;
    there is no parish column — the parish element is the
    difference between the area figure and the components'
    sum. Nation-scoped CHECKs keep the nations apart (a
    Welsh row can never carry a county, GLA or combined-
    authority element; a GLA element can only sit on a
    London borough code), and no band column beyond Band
    D exists: the other bands are statutory ratios of
    Band D (England A 6/9 to H 18/9; Wales A 6/9 to I
    21/9 on 2003 values), computed at answer time, never
    filed. An authority with no row for a year is the
    honest "not filed" state (renamed at M6.9/D30 from
    "not published" — MHCLG has published the charges;
    the gap is our filing backlog) — the seed files the
    verified authorities only (see
    loaders/council-tax-spot-check.md) and the spring
    pass extends coverage; Scotland and Northern Ireland
    have no rows (different systems), served as named
    not-covered states.
21. **loader_runs** — one row per loader-runner invocation: kind,
    environment, status, and the alert's own status and error, so
    a failed alert is recorded, never swallowed.
22. **loader_run_items** — one row per loader or canary probe in
    a run: status, the verbatim log line, the full error, and the
    source edition seen — what ran, when, with what result.
23. **article4_publishers** — the Article 4 publication gate
    (migration 0007): one row per organisation that demonstrably
    supplies current Article 4 areas to the national dataset,
    recorded by the planning-areas loader on every run. Article 4
    data is a pilot — most councils publish nothing — so "none
    found" may only be served for a council present here;
    everywhere else the recorded state is "not published by the
    council to the national dataset", never "none".
24. **census_stats** — Census 2021 (migration 0011, plan step
    M5.8), one row per MSOA, no shapes. `stats` JSONB holds one
    object per published table — TS007A age bands, TS007 single
    years of age, TS021 ethnic group, TS030 religion, TS044
    accommodation type, TS052 bedroom occupancy, TS054 tenure —
    and every value is an integer COUNT exactly as ONS
    published it: percentages are always computed at serve
    time from the filed counts, each table on its own total,
    and are never filed. What an area in numbers means for a
    family, in the Census's exact words and the ONS tables,
    served only to the paid report's demographics depth —
    never to the panel, hooks or shortlist, and never a
    verdict on who lives somewhere. Filed once by
    `loaders/load-census.mjs` from the ONS bulk downloads via
    Nomis (keyless; OGL v3 licences ship inside each zip);
    `source_date` is Census Day, 21 March 2021. Brought up to
    date on a Census-decennial rhythm, not a refresh cycle —
    the `nomis-census` canary probe watches for a
    republication.
25. **benefits_stats** — DWP benefits statistics (migration
    0013, plan step M5.16), one row per LSOA (2021) per
    series per reference month. Three series, filed by two
    loaders and NEVER merged or summed — there is no
    published figure called "people on benefits" and this
    table cannot express one: `uc_people` (People on
    Universal Credit — everyone on UC, including people in
    work), `uc_households` (Households on Universal
    Credit), and `claimant_count` (the Claimant Count —
    ONS's count of claimants of unemployment-related
    benefits, never shortened to "unemployment"). Each row
    carries its own series' own month (the Claimant Count
    publishes monthly; Universal Credit data points publish
    quarterly, and the two UC series do not share a latest
    month), its own source stamp, the published `count`,
    and a `pct` ONLY where the source publishes one (the
    Claimant Count's percentage of residents aged 16–64 —
    itself NULL where Nomis suppresses it for a very small
    figure; always NULL for UC — DWP publishes no LSOA percentage,
    and the households share serving prints is computed at
    serve time on the Census base in **lsoa_bases** (26)).
    UC counts file exactly as Stat-Xplore returns them:
    DWP applies Introduced Random Error to small cells (it
    does not round them to the nearest 5), so small-area UC
    counts are approximate by the publisher's own design
    and serving says so. Newest 13 months kept per series.
    England & Wales only — Scotland and Northern Ireland
    publish on other geographies, so their homes have no
    row and serving prints the named not-covered state.
    Served only to the paid report's benefits block —
    never headlines, the panel, the shortlist, the landing
    page or marketing.
26. **lsoa_bases** — the LSOA Census base totals
    (migration 0013, plan step M5.16): each LSOA's
    residents (TS021 total) and households (TS054 total)
    from Census 2021, filed once by `load-lsoa-bases.mjs`
    from the same Nomis bulk zips as the Census. They are
    the stated size of the small area in the benefits
    block's header and the bases its shares divide by —
    the Census itself filed at MSOA grain (24), so these
    two LSOA totals are filed separately rather than
    derived from it. `source_date` is Census Day,
    21 March 2021.
27. **tribunal_building_safety_decisions** — the
    published First-tier Tribunal (Property Chamber)
    decisions in the Building Safety Act remediation
    case series (migration 0015, plan step M5.14), one
    row per CASE whose reference carries /BSA/ (a
    section 123 remediation-order application) or /BSB/
    (a section 124 remediation-contribution-order
    application), filed quarterly by
    `loaders/load-tribunal-building-safety.mjs` from the
    decisions' own PDF headers via GOV.UK. `property_text`
    is the decision's Property line exactly as printed;
    `postcode` is the full postcode parsed from it and
    is NULL where the decision prints none (a district
    only, or a multi-building set) — a NULL row can
    never be served for a postcode. `building_key` is
    the normalised building stem for matching within a
    postcode; `is_single_flat` marks decisions naming
    specific flats, which surface for those flats only,
    not as a block headline. `order_kind` comes from the
    decision's own type line or the order document's
    heading (falling back to the reference's series) —
    never from GOV.UK's sub-category tagging, which
    republishes one document under two sub-categories.
    A case published as several documents files once,
    spoken for by its order document. There is no
    Building Safety Register table, deliberately: no
    building-level register extract exists (the register
    is a postcode lookup by design), so the register
    half of the step is a serving-time hand-off watched
    by the bsr-register canary — and a row here records
    only that a decision or order was published for a
    case, never a verdict on a building. Serving
    (M6.16, decision D35): the area bundle's
    `buildingSafety` section reads this table by
    postcode through `createAreaSource.tribunalFacts` —
    every filed row for the postcode serves, grouped by
    `building_key`, with `is_single_flat` rows serving
    only at their own flats' rung-1 checks; the table's
    own count and latest `retrieved_at` are read
    independently of the slice, so an unfiled table
    serves the not-filed state rather than an empty
    answer. The section's second half is the register
    hand-off, which reads no table at all.
28. **company_titles** — HM Land Registry's
    company-ownership datasets, CCOD (UK companies) and
    OCOD (overseas companies), filed whole every month
    by `loaders/load-company-ownership.mjs` (migration
    0016, plan step M5.13; decisions D15 + D18). One row
    per title: tenure, the register's property address
    fields exactly as filed — match keys only, never
    surfaced in any answer (the licence's clause 3.2
    restricts them; the address on screen is always the
    buyer's own input) — the lead proprietor's name,
    company number where the register records one (NULL
    where it does not — most overseas proprietors), the
    OCOD country of incorporation, and the dataset
    edition month as `source_date` (the register lags,
    and no answer may present the data as more current
    than its month). Each dataset's rows are replaced
    wholesale per pass, so a title that leaves the
    datasets drops out. These tables sit behind
    COMPANY_OWNERSHIP_ENABLED (lib/site.ts), which
    defaults to false: filing is preparation, and
    while the flag is false the brain never reads
    them — the M6.13 serving code (the area bundle's
    company-ownership section, decision D32) exists
    behind the flag, structurally absent from every
    served shape while it is off, and exposure still
    waits for the written clause-3.2 answer to be
    yes and the founder to give the go.
29. **company_snapshots** — the Companies House
    snapshot for the company numbers company_titles
    carries, from the Free Company Data Product (bulk,
    OGL v3.0): name, status, incorporation date, SIC
    codes, registered office as published. The product
    holds live companies only, so a filed number can
    honestly have NO row here — a dissolved proprietor,
    or a number the product keys in a different form —
    and that missing-snapshot state is named at serving,
    never filled by name-matching or invention. There
    are no officers, no persons with significant
    control, no parent companies and no charges in
    either table — decision D15's depth boundary; the
    £7 title register stays the hand-off for those.
30. **solar_grid** — PVGIS modelled solar yield for the
    location (migration 0019, plan step M5.18), one row
    per 0.1° cell whose centre the loader sampled from
    the PVGIS PVcalc API (European Commission Joint
    Research Centre; radiation database PVGIS-SARAH3,
    2005–2023). PVGIS publishes no downloadable yield
    grid — the JRC downloads are the superseded
    PVGIS-SARAH irradiance grids only — so the grid is
    sampled, not downloaded: one API call per populated
    cell (the cell set is derived from the postcode
    directory), never one per postcode. Each row files
    the annual PV yield per kWp and the annual in-plane
    irradiation it derives from, at the API's published
    precision, plus the whole standard basis per row —
    1 kWp, slope 35°, azimuth 0° (south), system loss
    14%, building-integrated mounting, crystalline
    silicon — so serving (M6.6, decision D26) names the
    basis from filed data alone. The cell is a location
    fact at a named 0.1° grain: it is never the home's
    roof, its orientation or its yield, and no finer
    precision is claimed than the filed cell holds.
31. **bundle_cache** — the brain's computed answers,
    cached (migration 0020, plan step M6.8, decision
    D29). One row per bundle for the crime, flood,
    nearby and area brains, keyed (postcode, brain,
    rung, home_key): the rung is part of the key so a
    rung-1 entry can never serve a rung-2 reader, and
    the home key carries the resolved home at rung 1
    and the narrowing at rung 2 (the postcode-point
    brains file under the empty home key; rungs 3 and
    4 are never cached). Sold prices has no entries —
    its warm read is one indexed query and its cold
    load is already paid once per postcode by design.
    Each row's `version` is the invalidation vector:
    the last-success stamps (from loader_run_items) of
    the loader items the brain's answer depends on,
    plus the filed guard counts for the filings that
    can move no stamp — the hand-run operator jobs
    (noise, priority habitats) and the brain-invoked
    cold loads, whose artefacts are guarded by content
    hash. A read recomputes the vector and compares;
    any difference is a miss and a recompute. There is
    no TTL: an entry can never serve a superseded
    edition as current (D9). The table is owned by the
    brain alone — no loader reads or writes it, which
    is why the entries do not live in
    postcode_cache.answers. Crime's stale line is
    never stored (it is recomputed at serve from the
    cached window end), and bundles carrying a
    load-failure state (crime not-filed; an area
    bundle whose EPC cold load failed) are never
    written, so a failed load can never be frozen into
    an entry.
32. **crime_national_months** — England's monthly
    recorded-crime totals (migration 0021, plan step
    M6.20, decision D39): one row per published month
    (`month` text, `england_total` integer, plus the
    source name/date the count came from and the load
    time). The numerator of the crime answer's England
    calibration figure, counted by load-crime-national
    from Police.uk's own monthly archives — every
    street-level record whose LSOA code begins E01,
    counted once, ever: rows are never updated, and the
    filed rows are the loader's resume state. The
    denominator is not stored here — it is computed at
    embed time as the sum over lsoa_bases' E01 rows
    (Census 2021 residents, 56,490,108 on the full
    filing), the same filed source as every circle's
    own basis. The window figure {total, residents} is
    embedded into each filed crime artefact
    (postcode_cache.answers → crime.national) once all
    12 months of its window are counted; the crime
    artefact also gains `basisResidents`, filed by
    load-crime at file time — the Census 2021 residents
    of the LSOAs containing the postcodes within the
    same 1 mile, counted whole (Basis B).
33. **brownfield_sites** — the recorded brownfield
    sites of the unified national register (migration
    0022, plan step M6.21, decision D41), one row per
    current site: the register's reference and supplying
    organisation entity, the published site address,
    hectares, planning-permission status and minimum /
    maximum net dwellings, the site-plan URL (filed,
    never served — the brain's read port does not carry
    it), and the site's published point (lat/lng plus a
    generated PostGIS point, GiST-indexed on the
    geography cast like the other point tables). Points
    only: the register publishes no boundaries, and no
    row is ever a finding about a home's plot. The
    register's free-text notes are NEVER filed — the
    column is proven present in the source file by the
    loader's contract check and read no further. Ended
    rows are excluded at load; republications and
    same-site double recordings collapse under the
    loader's two dedupe rules (reference + organisation,
    then point-to-4dp + normalised address, newest entry
    kept). Quarterly loader (load-brownfield); the
    source date is the platform retrieval date — the
    file carries no edition.
34. **brownfield_publishers** — the brownfield
    supplier gate (migration 0022, same step): one row
    per organisation entity with at least one current
    filed site, with its current-site count and the
    run's stamps, filed by the same loader run from the
    same file. The gate is the evidence a brownfield
    absence rests on: "none found" may serve only for a
    council positively recorded as supplying the
    register. It is keyed by the platform's organisation
    entity; the brain's gate additionally waits on the
    name-to-entity bridge (M12.10(b)) before it can
    answer true — until then absences serve the
    not-published state, the Article 4 pattern.
35. **flood_defences** — the Environment Agency's AIMS
    register of recorded flood defences (migration 0024,
    plan step M6.27, decisions D49/D54): one row per
    recorded asset — its publisher key, type, protection
    type, maintainer and operator categories, condition
    grade code, design and current standards of
    protection, watercourse and inspection date — with
    the asset's line (a MultiLineString, GiST-indexed).
    Lines file as published: no ST_MakeValid is applied
    (a line has no area semantics and serving needs only
    distance), and invalid lines are counted in the
    loader's log, never dropped or repaired. The table is
    single-edition, swapped entire by the quarterly
    loader (load-flood-defences), whose fail-closed
    vocabulary contract guarantees the maintainer and
    operator columns can only ever hold the publisher's
    categories — never a person's name. The brain serves
    the register at report depth as the flood answer's
    sibling block; last_inspection_date files but is
    never served in V1 — the brain's read port does not
    carry it.
36. **flood_climate_layers** — Environment Agency flood
    shapes under ONE published climate scenario (migration
    0025, plan step M6.28, decision D49). A mirror of
    **flood_layers** (15) column-for-column, holding two
    layers told apart by `layer_type` and never merged:
    `rofrs_cc` (the rivers & sea likelihood bands under the
    scenario — UKCP18, RCP 8.5; Central allowance for
    rivers, Higher Central for the sea) and `rofsw_cc` (the
    surface water likelihood bands under the scenario —
    Central allowance; it has no Very low band). Since
    migration 0008's column rides along, each shape carries
    the bands' depth basis in `detail` (">0 m"), and each
    product's own revision date is stamped on the shapes it
    files. The table is separate from flood_layers on
    purpose: that table's contract is the three present-day
    products, and keeping scenario shapes out of it makes
    it structurally impossible for a present-day answer to
    serve a scenario shape as a present-day fact, or the
    reverse — the two maps are never read against each
    other, and no change or comparison between them is
    computed anywhere. Absence is never filed: there are no
    synthetic "no band" shapes, so a point no polygon
    covers under the scenario is computed against the filed
    counts at serve time and serves as the named state "no
    band published", never as an inferred band. Filed
    quarterly by load-flood-rivers-sea-climate and
    load-flood-surface-water-climate, each swapping its own
    layer's rows in one transaction.
37. **charging_zones** — charging-zone boundaries and
    their register facts (migration 0026, plan step
    M6.31, decisions D50, D61 and D63). One row per
    scheme, keyed on `scheme_key` (the register key:
    bath, birmingham, bradford, bristol, sheffield,
    tyneside, ulez, glasgow, edinburgh, dundee,
    aberdeen, and portsmouth when it files): `name`,
    `family` ('caz', 'ulez' or 'lez'), `class` (the
    GOV.UK charge class for a CAZ; NULL otherwise),
    `operator`, `in_force_date` (the date the scheme's
    charges — or its penalties — began; the only date
    the section serves), `checker_url` (the family's
    vehicle-checker landing), `geom` (the boundary as
    one MultiPolygon, unioned and made valid at filing),
    `source_name`, `source_date` (NULL at M6.31: no
    source states a clean edition date for its boundary;
    provenance words ride in `source_name` and
    `terms_note` instead), `terms_note` and `loaded_at`.
    The table is dedicated, not a planning layer: the
    completeness gate is a property of the whole filed
    set (all twelve register schemes present AND the
    oldest `loaded_at` no more than 120 days old,
    computed at answer time), and the filed sets are
    pairwise disjoint by loader contract — an overlap
    refuses the filing. Charging amounts are never
    filed: no column can hold one. Filed quarterly by
    load-charging-zones, which files the whole sourced
    set in one transaction (stage → validate → swap), so
    a failed run keeps the last good set and the set's
    stamps share one instant; a scheme with no published
    boundary (Portsmouth at M6.31) files no row, and the
    serving layer names the gap instead.

## Physical decisions (recorded at build, M3.3)

The Technical Plan specifies the logical model; these physical
choices were made when the schema was built and are recorded in the
migration file itself:

1. Everything geographic is stored in **EPSG:4326**
   (latitude/longitude) — the system every source publishes in.
2. Point tables carry latitude + longitude columns plus a
   **generated** PostGIS point built from them, so the two can never
   disagree.
3. Shape tables hold **MultiPolygons**; loaders wrap incoming
   polygons with `ST_Multi` on load.
4. Every geometry column has a **GiST spatial index**. Since
   migration 0018 (plan step M6.2) the point tables the brain
   reads (schools, nurseries, health_points, transport_stops,
   ev_points, osm_points, greenspace_points) also carry a GiST
   index on the **geography cast** of the point, because the
   brain's distance reads run ST_DWithin over geography and the
   geometry index cannot serve a cast — without them those reads
   sequential-scan the national tables.
5. Every loaded dataset carries its stamp — `source_name`,
   `source_date`, `loaded_at` — and loaders follow the Technical
   Plan's load-stamp-then-swap rule: validate the new copy, stamp
   it, swap it in; a failed load never overwrites the last good
   copy.

## Rules the schema enforces by design

1. **Points, not shapes** for places — flood and planning are the
   only shape tables.
2. **Never stored:** browsing history, which listings a named person
   viewed, portal logins, precise user location. The visitor's
   shortlist lives in their browser only — there is no table for it.
3. **No scores or verdicts** are stored for crime or demographics —
   plain counts only, exactly as published.

## Changing the shelves (M3.5)

Schema changes are versioned migrations in `db/migrations/`, applied
by `npm run db:migrate` and recorded in the `schema_migrations`
table. An applied migration is never edited — a change is a new
numbered file. See `db/README.md` for the commands, and
`db/prove.mjs` for the PostGIS proof that runs in CI on every push
(M3.4).
