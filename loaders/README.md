# loaders — the fact fetchers

One loader per data source (flood, crime, schools, sold prices, broadband and
so on). Each loader pulls its dataset on the plan's refresh cycle and loads it
into the database; the website itself only ever reads from the database.

Every loader follows the Milestone 4 pattern: fetch → check the file looks
sane → file it → write its log line → prove it with the golden homes. A loader
that fails its sanity check or its proof files nothing and exits non-zero.

## Postcode directory (plan step M4.1) — `load-postcodes.mjs`

The glue every other loader joins onto: every live UK postcode with its map
position and area codes (LSOA / MSOA / council, ward, region), from the ONS
Postcode Directory (Open Government Licence v3.0). ONSPD is published
quarterly; the loader resolves the newest edition itself on each run.

```bash
npm run load:postcodes                    # latest edition, into the database
npm run load:postcodes -- --verify-only   # parse + prove only, files nothing
npm run load:postcodes -- --file <path>   # a local ONSPD zip or folder
```

Filing upserts the directory columns of `postcode_cache` only — cached
answers stored per postcode are never touched — inside one transaction, and
the golden-home proof reads the filed rows back from the database before the
transaction commits. Terminated postcodes are skipped. CI runs the loader
against the small real-data fixture in `tests/fixtures/onspd` on every push.

## Sold prices (plan step M4.2) — `load-sold-prices.mjs`

HM Land Registry Price Paid sales, loaded on demand per postcode — the full
file (published monthly, about 5.5 GB) is streamed and filtered to the
postcodes asked for, never stored whole and never bulk-filed. The monthly
update file is merged over the full file by transaction id (an A or C row
replaces, a D row deletes), which is why `price_paid` stores the Registry's
transaction id (migration 0003). The Registry's publication date (the full
file's Last-Modified) becomes the rows' source date.

```bash
npm run load:sold-prices -- "CM3 2JT" "E16 1GN"          # into the database
npm run load:sold-prices -- --verify-only "CM3 2JT"     # parse + prove only
npm run load:sold-prices -- --file tests/fixtures/land-registry "CM3 2JT" "E16 1GN"
```

Filing swaps each requested postcode's whole set inside one transaction, and
the golden-home proof reads the filed rows back before commit: 19 Birkdale
Rise's only sale (£588,995, 15 Jun 2023), the street median of £610,875 over
the eight sales the approved report counts (the loader files all recorded
street sales — 31 at build time — and checks the median over the report's
eight, encoded by transaction id), and the E16 1GN postcode median of
£310,000 over all 9 sales. Sold prices are never called a valuation. CI runs
the loader against the real-data fixture in `tests/fixtures/land-registry`
on every push; the fixture's update file is synthetic (one amendment, one
deletion, both on category-B rows) so the merge itself is proved without
disturbing the golden figures.

## Crime counts (plan step M4.3) — `load-crime.mjs`

Police.uk street-level crime counts for the rolling 12 months ending at the
latest published month, filed into each postcode's cached answers
(`postcode_cache.answers`, key "crime") — counts only, never a score or a
verdict, and the merge touches only the crime key. The loader anchors to
Police.uk's availability endpoint on every run and applies the freshness
guard: Police.uk publishes with a lag of about two months, so if the newest
month is more than three months behind today the load fails, files nothing,
and the previous counts keep serving (step M4.8 turns that failure into an
alert email).

```bash
npm run load:crime -- "CM3 2JT" "E16 1GN"          # into the database
npm run load:crime -- --verify-only "CM3 2JT"     # count + prove only
npm run load:crime -- --file tests/fixtures/police-uk "CM3 2JT" "E16 1GN"
```

The plan's check is the maths, not a frozen number — the window rolls as
new months publish — but at build time the window Oct 2025 – Sep 2026
reproduces the approved reports exactly: 330 crimes for CM3 2JT and 10,722
for E16 1GN, summed from the API's own 1-mile responses. Those frozen
totals are asserted in fixture mode, where the fixture holds the captured
API responses; CI runs the fixture load on every push.

## Energy certificates (plan step M4.5) — `load-epc.mjs`

EPC facts per postcode from the Get energy performance of buildings data
API (the service that replaced the retired EPC open data site in 2026).
Option A, decided 12 Nov 2026: per-postcode lookups — a paged search plus
one fetch per certificate — and NO bulk full-load ingest. The refresh of
filed postcodes re-runs the search per filed postcode via the loader
runner (step M4.8); the API's deltas feed is probed by the canary in
warning-only mode until characterised, and files nothing.

```bash
npm run load:epc -- "CM3 2JT" "E16 1GN"          # into the database
npm run load:epc -- --verify-only "E16 1GN"     # fetch + prove only
npm run load:epc -- --file tests/fixtures/epc "CM3 2JT" "E16 1GN"
```

Each certificate is minimised to the fields the product shows before
filing (address-level EPC data is personal data — we hold only what the
site uses) and filed into the postcode's answers under the key "epc".
Every certificate is kept: 6 Exeter Road's two band B certificates
disagree on floor area (71 and 91 square metres) and both are filed,
because the disagreement is itself a fact a buyer needs. Live mode reads
the token from EPC_API_TOKEN (Key K9) and never logs it. Certificate
facts are Crown copyright under the Open Government Licence v3.0; the
address fields are Ordnance Survey and Royal Mail copyright, used under
the service's permitted energy-performance purposes.

## Schools loader (plan step M4.6)

`npm run load:schools` files every open establishment from the DfE
register (GIAS daily extract) with its Ofsted position (the monthly
management-information latest-inspections file, discovered from the
gov.uk page each run). Modes mirror the other loaders:
`--verify-only`, and `--file tests/fixtures/schools` for the
captured real rows.

Built to the user-seat gap check of 12 Nov 2026: the selective flag
is the register's own admissions-policy value (blank files as NULL —
not recorded, never non-selective); schools with no coordinates are
filed at their own postcode's position, flagged approximate;
Ofsted outcomes keep the last graded word with its own date, the
newest inspection event, ungraded outcomes, and report-card area
judgements as separate facts; every open establishment is filed
whatever its phase; and each school carries its local authority —
catchments are not filed (no national dataset exists), so the
product links out by LA instead.

## Health loader

`load-health.mjs` (plan step M4.7) files GP practices and their
branch surgeries, pharmacies and dental practices from the NHS
Organisation Data Service's DSE reports, and hospitals from the
CQC directory, with CQC ratings and the emergency-department flag
overlaid from CQC's monthly ratings file (its content.xml is
around 1.1 GB, so it is streamed, never loaded whole).

Register recipes: practices are ACTIVE rows holding the RO76
role; branches have no status, so openness is read from their
dates, with COVID vaccination leftovers removed by name and both
removals counted in the log; pharmacies and dentists are the
ACTIVE rows of their reports. Rows whose postcode sits outside
England and Wales are filtered out. A tiny reviewed exclusion
list inside the loader removes register rows that hold a GP
prescribing code but are not registerable practices; practices
with CLINIC in their name are counted in the log for human
review. Ratings join by exact code under both identifiers the
file uses (Location ID and Location ODS Code), never by name;
two different ratings published the same day are both withheld
and logged. The emergency-department flag is three-state (see
migration 0005). Points are positioned from the postcode
directory — no health source publishes coordinates.

## Planning areas loader (plan step M5.2)

`load-planning-areas.mjs` files conservation areas and Article
4 direction areas from planning.data.gov.uk's bulk CSVs into
`planning_layers`, and the Article 4 publication gate into
`article4_publishers`, in one transaction. Modes mirror the
other loaders: `--verify-only`, and
`--file tests/fixtures/planning-areas` for the captured real
rows.

Built to the user-seat gap check of 12 Nov 2026: the platform's
Article 4 data is a pilot (116 councils supply current areas),
and Newham's borough-wide direction exists in law but not in
the data — so the loader records which organisations
demonstrably publish, and "none found" may only ever be served
behind that gate; everywhere else the state is "not published
by the council to the national dataset". Ended designations are
excluded and counted; the ~9% of conservation areas with no
geometry are counted, never silently dropped; the removed-
rights codes are filed with each Article 4 area. The Article 4
direction records are validated and counted (proving the file
was read) but not filed — the rights live on the area rows, and
the direction records hold no further fact the shelves keep.
Every count rides in the log line, so an empty answer is
provable against a layer that demonstrably loaded.

## Green belt loader (plan step M5.2)

`load-green-belt.mjs` files the 181 green belt pieces (an
annual MHCLG compilation from local authority returns, served
via planning.data.gov.uk) into `planning_layers`. Pieces are
named by the belt itself — the file's `green-belt-core` value,
e.g. "London" — never by the district that compiled the piece
(the file's own `name` is the district). Absence is
trustworthy here, unlike Article 4: MHCLG compiles every
authority, so a district with no piece (Braintree) genuinely
has no designated green belt. Modes: `--verify-only`,
`--file tests/fixtures/green-belt`.

## Heritage loader (plan step M5.2)

`load-heritage.mjs` files listed buildings as points into
`listed_buildings` and scheduled monuments as shapes into
`planning_layers`, in one transaction. The register of record
is Historic England's National Heritage List — the platform's
heritage datasets are that list republished, references are
NHLE entry numbers, and the source stamp says so. Grades are
filed exactly as published and validated against
{I, II*, II} — the file's one anomalous "NL" row is quarantined
and counted. Buildings are points by the source's own design
and no source publishes an address, so address fields file as
NULL: a building is identified by name + NHLE number + grade +
distance. Ended (delisted/descheduled) rows are excluded and
counted; current buildings with no published point are counted,
never placed at a guess. Building distances use the prep's
haversine basis (earth radius 3956 miles) — the locked golden
counts turn on it at one boundary building. Modes:
`--verify-only`, `--file tests/fixtures/heritage`.

## Nature designations loader (plan step M5.3)

`load-nature-designations.mjs` files SSSI, SAC, SPA and Ramsar
designations and the merged ancient woodland layer from Natural
England's ArcGIS services into `planning_layers`. Built to the
user-seat gap check of 12 Nov 2026: the four statutory layers are
complete registers and file grouped by site code, with features
AND distinct sites in the log line; candidate SACs (36 features,
6 sites) are excluded and counted, never served; SSSI Units are
never read. Ancient woodland is two provisional inventories
mid-revision, so the loader merges them under Natural England's
own precedence rule — revised polygons win on overlap, each
filed polygon's detail records which inventory it came from —
and the absence answer is "no ancient woodland recorded in the
inventory", never "there is none". Blank woodland names file as
published. Natural England publishes no per-row quality flag, so
`quality` stays NULL. The woodland services are slow at deep
offsets (60–70 seconds a page, measured live), so pages fetch
with retries and the woodland services page at 1,000. Modes:
`--verify-only`, `--file tests/fixtures/nature-designations`.

## Priority habitats loader (plan step M5.3)

`load-priority-habitats.mjs` files the Priority Habitat
Inventory — 818,225 unnamed habitat patches — into
`planning_layers` by UID with the habitat label verbatim,
mosaic classes included: nothing is filtered, so the filed
count reconciles to the service's own count exactly. PHI is a
compiled habitat map, not a register and not a protection, and
the log line stamps the run with the inventory's own version
(Sept_26 at build). The hosted bulk file is a 9.1 GB File
Geodatabase this stack cannot read, so the loader pages the
feature service in OBJECTID order, processing one page at a
time inside the filing transaction. Modes: `--verify-only`,
`--file tests/fixtures/priority-habitats`.

## Loader runner + canary

`run-loaders.mjs` (plan step M4.8; `npm run load:all`) runs the
contract canary probes (`canary.mjs` — one cheap shape/freshness
probe per source, filing nothing) and then the due dataset
loads, records the run in the `loader_runs` tables, and sends
one email per run: an alert on failure, a short OK heartbeat on
success. Due-ness: the postcode directory and the M5.2/M5.3 planning,
heritage and nature datasets quarterly (70 days — their sources
move slowly, and the planning and nature loaders never join onto
the directory, so an empty directory does not skip them), the
other datasets
monthly, judged from the last successful run items;
per-postcode loaders take their targets from what is already
filed (the golden three when nothing is). A failed probe alerts
but never blocks a load. If the database is down the record
falls back to a JSON-lines file and the email still goes out.
`npm run canary` runs the probes only.
