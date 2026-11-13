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
   with its source name and data date.
2. **price_paid** — Land Registry sales, loaded on demand per
   postcode and kept forever. Each row carries the Registry's
   transaction id (migration 0003) so the monthly update file can
   amend or delete it later. Sold prices are never called a
   valuation anywhere in the product.
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
8. **health_points** — service points: GP practices and their
   branch surgeries (with the parent practice's code), pharmacies
   and dental practices from the NHS organisation service, and
   hospitals from the CQC directory, each with its emergency-
   department flag (yes / no / no data — three states, never
   collapsed) and, for hospitals, its CQC service types and
   provider. Every point sits at its postcode's position; no
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
    square per year (NO2, PM2.5, PM10).
14. **noise_summary** — one pre-summarised daytime + night-time road
    noise band per area. The raw 10 m grid never enters the database.
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
    and priority habitat). Since migration 0007 each shape also
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
    files the IMD here.
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
20. **council_tax_rates** — each council's Band D charge, for the
    council tax estimate.
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
4. Every geometry column has a **GiST spatial index**.
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
