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

## Flood zones loader (plan step M5.1)

`load-flood-zones.mjs` files the Environment Agency's Flood
Map for Planning zones (Flood Zones 2 and 3) into
`flood_layers` as `layer_type` `flood_zone`, labels FZ2/FZ3
exactly as published. The zones are a planning instrument
computed as if flood defences did not exist — the opposite
convention from the rivers & sea bands below, and the two are
never merged (gap L1). Each shape's `detail` carries its
published flood source and origin ("river and sea · modelled
and recorded"). The OGC service silently ignores property
filters, so every count is computed from the fetched data and
the unfiltered service count is the only oracle (gap L5).
Shapes file exactly as published — no buffering, snapping or
simplifying. Zone 1 is never filed: it is absence, computed
against the proven count. Golden proof: Birkdale inside no
zone, Exeter inside Zone 3. Modes: `--verify-only`,
`--file tests/fixtures/flood-zones`.

## Rivers & sea flood loader (plan step M5.1)

`load-flood-rivers-sea.mjs` files the Risk of Flooding from
Rivers and Sea likelihood bands (the chance of flooding
deeper than 0 m, taking defences and their condition into
account) into `flood_layers` as `layer_type` `rofrs`, bands
High / Medium / Low / Very low verbatim, with the depth basis
">0 m" in `detail`. Absence is a different fact from a filed
band, and never interchangeable with one: Birkdale and Epsom
have no shape at their points (nearest Low 0.84 / 0.40 miles),
while Exeter has a filed Very low polygon covering its point
— the pair (Zone 3 above, Very low here) is the step's own
check, and both rows coexist under their own layer types.
Modes: `--verify-only`, `--file tests/fixtures/flood-rivers-sea`.

## Surface water flood loader (plan step M5.1)

`load-flood-surface-water.mjs` files the Risk of Flooding
from Surface Water bands into `flood_layers` as `layer_type`
`rofsw`. The product publishes three bands only — High /
Medium / Low — so a "Very low" arrival fails the contract
outright, and absence means "below the Low threshold",
nothing more. The geometries are the heaviest the stack
files (dissolved multipolygons, individually hundreds of KB)
and some arrive self-intersecting: every geometry is
validated, made valid where needed and the invalid count
rides in the log line — never silently dropped, never
simplified. Point answers in this product are near-miss
fragile (Exeter's point sits in no polygon, with Low about
9 metres away), so the golden proof pins the proximity facts
— point band plus nearest band and distance per home — as
assertions. Modes: `--verify-only`,
`--file tests/fixtures/flood-surface-water`.

## Transport loader (plan step M5.5)

`load-transport.mjs` files NaPTAN stops and stations from the
Department for Transport's NaPTAN API (the whole of GB as one
CSV, no key) into `transport_stops`. Built to the user-seat
gap check of 13 Nov 2026: active rows only — the `Status`
field is the currency filter and `Modification` is a decoy —
in exactly nine stop families (BCT, BCS, BST, RLY, MET, TMU,
FER, FBT, FTD), never entrances, platforms or taxi ranks, so
a station files as its station-level points under their own
ATCO codes. 31,417 active stops publish no coordinates, only
OS grid references — every Elizabeth line rail station among
them, and all 7 bus stops within 2 miles of the Hilgay golden
home — so grid references are converted to coordinates
(EPSG:27700 → EPSG:4326) as a counted filing step: without
it that home's nearest bus stop reads 7.965 miles instead of
0.044. Names and stop-type codes file verbatim (MET/TMU
include heritage railways outside London; NaPTAN carries no
line or route data, so no line attribution comes from this
table). The Bus Open Data Service (Key K10, step M5.4) gates
nothing here — it holds timetables, fares and live locations,
and the step stores positions only ("live times are never
stored — links out only"); a future routes layer would join
on the ATCO codes filed here. Modes: `--verify-only`,
`--file tests/fixtures/transport`.

## Nearby places loader (plan step M5.6)

`load-osm-places.mjs` files the What's Nearby places from
OpenStreetMap — vets, pet shops and boarding, supermarkets,
food & drink (any sort of food option: restaurant, pub, cafe,
fast food, bar), leisure, places to visit, places of worship,
libraries and parks — into `osm_points`, from Geofabrik's
country extracts (England, Wales, Scotland). Each extract is
downloaded whole and verified against the md5 Geofabrik
publishes for it — a mismatch refuses the run — then cut to
the elements carrying an amenity, shop, leisure or tourism
key by `osm-extract.py`, a small pyosmium cutter riding
libosmium's C++ filters (a naive per-object parse of a
country file is unusably slow; the prep measured both). The
loader therefore needs python3 with pyosmium
(`pip install osmium`) wherever it runs, fixture mode
included. Built to the user-seat gap check of 13 Nov 2026:
one primary group per place (visit, worship, leisure,
library, food & drink, then the care and shop groups, parks
last); the point is the element's representative point (node
position, way node-average centre), so distances compare
across groups; named and unnamed rows both file (serving
shows named places and counts the rest — an unnamed pool
polygon never poses as a named centre); a worship row's
`detail` (migration 0009) carries the religion exactly as
recorded, multi-value strings verbatim, never inferred; the
same place mapped twice files once (same group + name +
under 30 m, relation over way over node) while a shared name
alone never merges two real places; and an empty group at a
home is a fact about the map, never about the ground —
Birkdale files zero vets, and serving says so in those words.
Data © OpenStreetMap contributors (ODbL): the filed table
stays private; only facts are served. Modes: default (live
download), `--verify-only`, `--pbf-dir <dir>` (verify and
read local extracts instead of downloading), `--file
tests/fixtures/osm-places`.

## Parks loader (plan step M5.6)

`load-os-greenspace.mjs` files OS Open Greenspace into
`greenspace_points`: a centre row (the site's area centroid,
computed in EPSG:27700 — the centre-point convention the
park distances are served under) plus one row per access
point, for Public Park Or Garden, Playing Field and Play
Space sites only — the Exeter golden ground is a Playing
Field, so the function mix is load-bearing. The Downloads
API needs no account or key; its listing entry for the GB
GeoPackage (md5 + size) is the loader's oracle: an unchanged
version+md5 is a healthy no-op run (the product updates only
twice a year, in April and October), a changed md5 inside a
version fails loudly, a new version downloads, verifies and
files. The product's site ids are UUID strings and the
table's id column is bigint, so `osm_id` stays NULL and
access rows link to their site by its recorded name. The
loader reads the GeoPackage with Node's built-in SQLite —
no new dependency. Contains OS data © Crown Copyright and
database rights 2026 (Open Government Licence). Modes:
default (live), `--verify-only`, `--file
tests/fixtures/os-greenspace`.

## EV chargers loader (plan step M5.7)

`load-ev-chargers.mjs` files public EV charging sites into
`ev_points` from Open Charge Map — the step's original
source, the National Chargepoint Registry, was
decommissioned on 28 November 2024 (Zapmap sells access;
OpenStreetMap alone was measured wrong at Birkdale). The
unit of filing is the site, not the device: records group
(same operator + same normalised title + within 30 m)
before filing, and device/connector counts file as facts
about the site. Only explicitly-public usage classes file —
Public, Public – Pay At Location, and Public – Membership
Required under the founder's re-rule of 13 Nov 2026, each
filed with its class EXACTLY as recorded (a merged site's
served class is its most restrictive member class); every
exclusion — other classes, unrecorded access, Planned /
Removed statuses, Northern Ireland — is counted in the log
line, never silent. Status files as a dated record, never
a live-availability claim, and unrecorded status (37% of
records) files as NULL, a normal state. Per-record data
provider attribution rides in every row's detail (42% of
the GB data is the dead registry's own Dec 2023 import).
The pull is bounding-box tiles with adaptive subdivision
(a capped tile splits into quadrants), openly-licensed
records only. Key K17: `OPEN_CHARGE_MAP_API_KEY` when set,
else the custom.open-charge-map connector helper (the key
never appears in the repo, the logs or a fixture). Modes:
default (live), `--verify-only`, `--file
tests/fixtures/ev-chargers`. The report's EV block (M8)
must carry the attribution: "Open Charge Map" plus each
record's own data provider, per record — and membership-
required sites must be labelled with their recorded class
wherever they are served.

## Census 2021 loader (plan step M5.8)

`npm run load:census` files Census 2021 for every MSOA in
England & Wales (7,264 areas) into `census_stats` (migration
0011). The source is the ONS bulk download via Nomis — seven
keyless zips (no key, no registration; OGL v3 licences ship
inside them): TS007A (age bands), TS007 (single years of
age), TS021 (ethnic group), TS030 (religion), TS044
(accommodation type), TS052 (bedroom occupancy) and TS054
(tenure). Every value filed is an integer COUNT exactly as
published — percentages are never filed; serving code
computes them from the counts, each table on its own total
(the published tables do not share one total: ONS perturbs
each table independently, by design). Categories file in
full, unmerged — the Census's own words — and TS054's
"Social rented" files BOTH as a category inside the tenure
table and as its own filed fact, because the plan's
cost-of-ownership step reads the subtotal, not its parts.
TS007's single years file as a 101-value vector from which
consumers compute the median age (the loader never files a
median). The header contract is exact: a bulk re-issue that
renames, drops or adds a category fails the load loudly
rather than misfiling a column.

The loader is a one-off, not a refresh: the runner registers
it in the STATIC class (due exactly once, when it has never
loaded), and the monthly `nomis-census` canary probe watches
the source for a republication — TS021 was corrected once
already (29 Nov 2022) — comparing the three universal MSOAs'
TS021 totals EXACTLY against the filed baselines; a
difference means a manual re-run of this loader. The whole
load is all-or-nothing: all seven datasets parse, validate
against the golden MSOAs and stage inside one transaction
before anything becomes live, so a failed load never
overwrites the last good copy.

```text
npm run load:census                                          # live download → file
node loaders/load-census.mjs --verify-only                   # live download; validate and report; nothing filed
node loaders/load-census.mjs --file tests/fixtures/census    # file the 3-MSOA fixture (CI)
node loaders/load-census.mjs --file ~/Downloads/census-zips  # file (or, with --verify-only, validate) a folder of founder-downloaded zips
```

## Loader runner + canary

`run-loaders.mjs` (plan step M4.8; `npm run load:all`) runs the
contract canary probes (`canary.mjs` — one cheap shape/freshness
probe per source, filing nothing) and then the due dataset
loads, records the run in the `loader_runs` tables, and sends
one email per run: an alert on failure, a short OK heartbeat on
success. Due-ness: the postcode directory and the M5.1 flood, M5.2
planning and heritage, M5.3 nature, M5.5 transport, M5.6
nearby and M5.7 EV chargers datasets quarterly (70 days — their sources move
slowly; and those loaders never join onto the directory, so an
empty directory does not skip them), the Census 2021 dataset
(plan step M5.8) in the static class — due exactly once, when
it has never loaded, and never automatically again — the
other datasets monthly, judged from the last successful run items;
per-postcode loaders take their targets from what is already
filed (the golden three when nothing is). A failed probe alerts
but never blocks a load. If the database is down the record
falls back to a JSON-lines file and the email still goes out.
`npm run canary` runs the probes only.

## Before any push

Run `npm run prepush` and do not push unless it is green. It
runs the local gates in CI's order — format check, lint,
typecheck, the full test suite, build — so a failure CI would
have caught is caught here first, without spending a CI run on
it (three M5 loader defects reached CI in Nov 2026 before this
gate existed; each cost a red run and a fix round).

One part of the suite matters most for loader work:
`tests/loader-contracts.test.ts` is the guard for filing SQL.
It discovers every loader registered in `run-loaders.mjs` and
checks, for each one, that every live-table INSERT names only
columns the migrations define (and never a generated column),
that BEGIN is issued before any `CREATE TEMP TABLE ... ON
COMMIT DROP` stage create, and that the loader's fixture
wiring is coherent. New loaders are covered automatically
once they are registered in the runner — no list to update —
and the per-loader fake-pool tests remain the gold standard
each new loader should still bring for its own filer.
