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
10. **greenspace_points** — park centre points and access points
    only; the outline shape is deliberately never stored.
11. **osm_points** — OpenStreetMap places (supermarkets, vets,
    playgrounds, dog parks, parks as a supplement): name, type,
    latitude and longitude, nothing more.
12. **transport_stops** — NaPTAN stops (bus, rail, tube, tram,
    ferry): AtcoCode, name, type, exact coordinates.
13. **air_grid** — Defra modelled air quality, one row per 1 km
    square per year (NO2, PM2.5, PM10).
14. **noise_summary** — one pre-summarised daytime + night-time road
    noise band per area. The raw 10 m grid never enters the database.
15. **flood_layers** — Environment Agency flood shapes. Two layers
    in one table, told apart by `layer_type` and never merged:
    rivers & sea zones, and surface water. The layer's own date is
    stamped on every load.
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
18. **neighbourhood_stats** — Census 2021 + IMD, one row per LSOA,
    no shapes. Ethnicity and religion breakdowns live here and are
    served only to the paid report's demographics depth — never to
    the panel, hooks or shortlist.
19. **ev_points** — National Chargepoint Registry points: name,
    position, connector and speed where published.
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
