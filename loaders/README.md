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

## Deprivation, air, noise, broadband and mobile loaders (plan step M5.9)

Five loaders, one per source (the flood precedent — never
merged), all in the runner's STATIC class (due exactly once,
then operator re-runs on a canary's word):

`npm run load:imd` files the English Indices of Deprivation
2025 (MHCLG File 7, GOV.UK asset server, OGL v3, keyless) into
`neighbourhood_stats`: overall score, rank and decile plus the
seven domain deciles per 2021 LSOA, and `imd_summary` rendered
at load time from the decile in the Final Design's words.
England only — Scotland and Wales publish separate indices on
their own scales and get no rows. IDACI/IDAOPI are never read.
The `govuk-iod` canary watches the release page (File 7 was
re-issued once as v2).

`npm run load:air-quality` files Defra's PCM background maps
(UK-AIR datastore, OGL v3) into `air_grid`: the 2024 vintage's
NO2, PM2.5 and PM10 annual means for all 254,905 1 km squares,
at full published precision, centres converted on the
schools/transport proj4 basis. Concentrations as published —
no band is computed. The 2025 maps exist only as shapefiles
under a new model and are not filed; the `defra-pcm` canary
watches for the 2025 CSVs.

`npm run load:noise` files Defra's strategic noise mapping,
England Round 4, into `noise_summary` (migration 0012 added
`source_kind`): road, rail and airport rows per postcode, each
carrying the publisher's 5 dB Lday/Lnight presentation bands,
with "Below 55/50 dB" (a real value under the first band) and
"No modelled … noise" (grid 0 or nodata) as distinct states —
0 is never filed as "0 dB". The loader samples the 10 m grids
loader-side through the publisher's WCS (20 km GeoTIFF tiles,
resumable per-tile sample files in `NOISE_WORK_DIR`): a
national first pass is an operator-run job measured in hours,
and the loader exits non-zero until sampling completes, so
the runner keeps it due and every pass resumes. `--verify-only`
re-samples the golden points through the WMS instead (the
`defra-noise` canary does the same monthly for one point).

`npm run load:broadband` and `npm run load:mobile` file Ofcom
Connected Nations answers into `postcode_cache.answers` (the
crime/EPC pattern). Both DISCOVER the current release ZIP from
Ofcom's publication page on every run — never a hardcoded
filename (the Spring 2026 postcode files were re-issued r1→r2
mid-cycle). Broadband files the all-premises postcode
percentages as published — gigabit-capable is the headline;
Ofcom publishes no full-fibre percentage and no premise counts
at postcode level, and neither is invented. The maximum-speed
band shares are shares of all premises in the postcode (Ofcom,
"About this data — fixed broadband coverage and full fibre
take-up 2026"): premises that could not be matched to a
provider record with a non-zero predicted speed are
unclassified and sit in no band, so the six bands legitimately
sum to less than 100 — the shortfall is the postcode's
unclassified share — and a sum of exactly 0 is legitimate;
only a sum over 100 fails the load. Mobile is filed at
its TRUE grain: Ofcom publishes no postcode-level mobile file,
so each postcode gets its own local authority's published
percentages (joined on the directory's council), with the
grain named inside the answer and "at least one operator"
derived exactly as Ofcom's own notes prescribe. Ofcom writes
an exact zero as an empty cell in the operator-count columns
(proven by the founder's v6 raw rows: Braintree's real
`4G_prem_out_0` is empty while its siblings sum to 100), so
the loader reads an empty cell as 0 — except a column empty
in every row, which is an unpublished combination (all 3G
columns for 2/3/4 operators and all 5G SA columns for 4
operators, per the About-this-data) and files as null, never
as 0. Ofcom returns
HTTP 403 to some networks (including the build sandbox): from
one, the loaders fail with that named plainly, the
`ofcom-broadband`/`ofcom-mobile` canaries skip rather than
alarm, and `--file` mode files a release downloaded elsewhere.

```text
npm run load:imd / load:air-quality / load:noise / load:broadband / load:mobile
node loaders/load-imd.mjs --verify-only              # live pull; golden checks; nothing filed
node loaders/load-noise.mjs --verify-only            # golden points re-sampled live via WMS
node loaders/load-noise.mjs --file tests/fixtures/noise   # band + file the measured-values fixture (CI)
node loaders/load-broadband.mjs --file ~/Downloads/cn-release  # file a founder-downloaded release
```

## Benefits loaders + LSOA bases (plan step M5.16)

Three loaders under the one step, never merged (the flood
precedent — one broken source never blocks the others):
`load-claimant-count.mjs` (keyless, monthly),
`load-dwp-uc.mjs` (key-gated, monthly-run), and
`load-lsoa-bases.mjs` (static, Census-Day). All three file
by LSOA code from their own sources, into `benefits_stats`
and `lsoa_bases` (migration 0013), and all three are
directory-free in the runner. The data serves only the
paid report's benefits block — never headlines, the panel,
the shortlist, the landing page or marketing — and the
three series are never merged or summed anywhere: there
is no published figure called "people on benefits".

`load-claimant-count` files the Claimant Count (Nomis
dataset NM_162_1, guest — no key) for all 35,672 England &
Wales LSOAs: the published count plus the published
percentage of residents aged 16–64, filed exactly as
published and never computed. The series keeps its full
name everywhere — it is ONS's count of claimants of
unemployment-related benefits (Jobseeker's Allowance plus
Universal Credit claimants required to seek work), never
shortened to "unemployment"; ONS states it is no longer a
reliable indicator of the labour market. Each run files
the latest two months (each release revises the previous
month), paging `geography=TYPE151` in 25,000-row guest-cap
steps. Where an LSOA's figure is very small Nomis publishes
the count but suppresses the percentage (status M — the
underlying value is 1 or 2; 54 LSOAs in September 2026,
measured at the build): the suppressed percentage files
as NULL and is never back-calculated. Goldens, locked at the prep and re-verified live at
the build (September 2026): Birkdale 15 / 1.6%, Exeter
Road 120 / 8.6%, Minerva House 20 / 1.2%. The
`nomis-claimant` canary arms freshness (~75 days),
golden presence/sanity and the 2021-geography shape.

`load-dwp-uc` files both Universal Credit series from the
DWP Stat-Xplore Open Data API (Key K22, in an `APIKey`
header): People on UC (UC_Monthly) and Households on UC
(UC_Households), counts only — DWP publishes no LSOA
percentage. UC data points are published QUARTERLY
(Feb/May/Aug/Nov), three monthly points at a time, each
series with its own latest month; a monthly run that finds
no new month is a healthy no-op. The values file exactly
as returned: DWP applies Introduced Random Error to these
tables (NOT rounding to the nearest 5), so small-area
counts are approximate and serving says so. **First pull
DONE 13 Nov 2026, as founder-run browser captures: DWP's
gateway refuses every Muse-side network (HTTP 401) while
the same key answers 200 from the founder's browser — the
key was never at fault. The pull reconciled the loader to
DWP's real shapes: the schema is served one level at a
time (discovery assembles it node by node and completes
the month list past the 100-value valueset cap by
probing), the table grammar is recodes + field-array
dimensions, the response is {fields, cubes}, both count
measures are confirmed, and the golden values are locked
(people, May 2026: 117 / 383 / 93; households, April 2026:
105 / 83). One gap: the Households cube does not hold
Newham 036A (E01003511) — golden checks never demand it
for that series. The `stat-xplore-uc` canary now runs the
assembly + ~7-month freshness arms where calls answer,
and reports "not verified" in words where they do not.
Still unverified until a keyed call answers from a network
DWP accepts (M12's VPS test): the assembled live pull
end-to-end, and the national Households LSOA count against
the filing band.**

`load-lsoa-bases` files the two LSOA Census totals the
benefits block states and divides by — TS021 residents
and TS054 households per LSOA (goldens: Birkdale 1,489 /
625, Exeter Road 1,923 / 671, Minerva House 2,487 / 852) —
from the same keyless bulk zips as the census loader, in
the runner's static class.

```text
npm run load:claimant-count / load:dwp-uc / load:lsoa-bases
node loaders/load-claimant-count.mjs --verify-only        # live golden pull; nothing filed
node loaders/load-claimant-count.mjs --file tests/fixtures/claimant-count   # file the golden fixture (CI)
node loaders/load-dwp-uc.mjs --verify-only                # live golden pull (first pull DONE 13 Nov 2026 via founder captures — see above)
node loaders/load-dwp-uc.mjs --file tests/fixtures/dwp-uc # file the REAL captured fixture (CI)
node loaders/load-lsoa-bases.mjs --file tests/fixtures/lsoa-bases          # file the 3-LSOA fixture (CI)
```

## Council tax loader (plan step M5.10)

`load-council-tax.mjs` is the MANUAL class — the loader
the runner's static pattern was named for. There is no
feed: council tax is set once a year, so the loader is a
seed, filed by hand from the publishers' own summary
tables, due exactly once in the runner and never
automatically again. It files `council_tax_charges`
(migration 0014) — one row per billing authority per tax
year: the **area** Band D in whole pence exactly as
published, the component split (billing authority /
county / police / fire / GLA / combined authority, fixed
nullable pence columns — a closed statutory stack), and
the `parish_averaged` flag. No band beyond Band D is
ever filed: the other bands are statutory ratios applied
at answer time (M6) — England A 6/9 to H 18/9, Wales A
6/9 to I 21/9 on 2003 values — and the row's `nation`
column is what selects the ratio set. The served figure
is always an **average**: the D13 line beside it reads
"This is [Council]'s average Band D council tax for
[year], including county, police and fire charges; your
exact bill depends on your home's band and parish, so
treat this as a close estimate, not the bill itself"
(the parish clause drops for unparished and unitary
authorities).

Sources, both official and free. England: MHCLG's
_Council Tax levels set by local authorities in England_
(GOV.UK, late March) — Tables 1–9 ODS (Table 9's area
Band D; Tables 8a/8c own elements excluding/including
parish precepts; 8b counties; 8d police; 8e fire; 8f
combined authorities) and Table 10 ODS (the billing
authorities' revenue accounts). Wales: Welsh Government
via StatsWales, _Composition of average Band D council
tax by billing authority_ (unitary element excluding
community councils, the community average, the police
element, the total). **Every filed row is asserted
before filing**: components + the average parish or
community element = the published area Band D to the
penny; Table 10's arithmetic (requirement ÷ tax base)
agrees with Table 8's printed averages to the penny;
and across London, area minus own element is one uniform
GLA figure (the City of London excepted — its precept is
abated). A failure files nothing and says why. A body
whose charge folds into another's files as no component
(fire inside a county or unitary element; a combined
authority printing £0.00).

The seed (13 Nov 2026, tax year **2026-27**) files the
three golden councils penny-verified plus a spot-check
set of ten more, England and Wales mixed — the record,
with every figure and both reconciliations, is
`loaders/council-tax-spot-check.md`. **Every other
authority is deliberately unfiled**: absence from the
table is the named **"not published"** state at serving,
never a zero and never an estimate. Scotland and
Northern Ireland are likewise unfiled, permanently:
Scotland's is a different system (water charges bundled
into the bill) and Northern Ireland levies domestic
rates — serving names both as **not-covered** answer
states (M6); no rows are ever written for them.

**The spring pass (the once-a-year operator job).** When
the `mhclg-council-tax` canary warns that the new year's
release has landed (it also warns if the filed year is
revised — MHCLG re-issued the 2025-26 tables a year
after first publication — and the seed loader's upserts
make a re-seed safe at any time):

1. Run `npm run load:council-tax -- --verify-only` and
   read what it says: it discovers the new year's
   release, parses both nations in full and asserts the
   seed authorities against the golden registry.
2. Extend the loader as the pass requires: add the new
   year to `RELEASES` with its publication dates; roll
   the `GOLDENS` registry to the new year's verified
   seed figures; extend `AREA_PRECEPTORS` (the release
   prints no district-to-county membership, so membership
   is operator reference data — work county by county
   from the county set in Table 8b, with the identity
   assertion as the safety net) toward full coverage.
3. File the seed with `npm run load:council-tax`; when
   `AREA_PRECEPTORS` covers every billing authority in
   the release, file the whole nation with
   `npm run load:council-tax -- --all` (it refuses,
   listing the unmapped, until the map is complete).
4. Refresh the fixture cuts under
   `tests/fixtures/council-tax` from the new release and
   extend `loaders/council-tax-spot-check.md`.

```text
npm run load:council-tax                                  # live seed (upserts the seed authorities)
npm run load:council-tax -- --verify-only                 # parse + assert both nations; file nothing
npm run load:council-tax -- --all                         # the full national pass (refuses until the map is complete)
node loaders/load-council-tax.mjs --file tests/fixtures/council-tax        # file the 2026-27 fixture (CI)
node loaders/load-council-tax.mjs --file tests/fixtures/council-tax-2025-26 --verify-only   # the rehearsal year
```

## Tribunal building-safety decisions loader (plan step M5.14)

`load-tribunal-building-safety.mjs` is QUARTERLY (the
runner's 70-day class). Step M5.14 has two halves, and
only one of them is a loader.

**The register half is a hand-off, not a table.** There
is no Building Safety Register list to file: the
Building Safety Regulator's register of high-rise
residential buildings (England, buildings of 7+
storeys or 18m+ with 2+ residential units, registered
since 1 Oct 2023) is published only as a postcode
lookup — the register search service
(www.register-high-rise-building.service.gov.uk) —
expressly designed so the register is never released
as data, and MHCLG's cladding-remediation figures are
aggregate-only by stated public-safety policy. So no
row anywhere records register status, and a home's
absence from any list can never be read as a cladding
or safety verdict (see loaders/README's discipline and
migration 0015's). What the data layer owes the brain
(M6.16 builds the answers on these named states):

1. **Flat / block (England)** → the **hand-off state**:
   the report names the Building Safety Regulator's
   register and links the official search service for
   the reader to check the building themselves. A
   "not found" there has three honest meanings — the
   building is out of the register's scope, it is
   unregistered (itself an offence for an occupied
   higher-risk building), or it is registered under a
   different postcode — so the wording stays neutral
   and never converts any of them into a verdict.
2. **House** → the **scope line**: the register covers
   high-rise residential buildings; a house is outside
   what the register is for, stated plainly as scope,
   not as a finding about the house.
3. **Scotland / Wales / Northern Ireland** → the
   **not-covered states**, each naming the nation's own
   route: Scotland's Cladding Assurance Register (the
   Scottish Government's register of buildings assessed
   for cladding), the Welsh Government's building
   safety route for high-rise residential buildings,
   and Northern Ireland, which has no equivalent
   register. The remediation universe (buildings of
   11m+) is also wider than the register universe
   (18m+/7 storeys) — the hand-off wording keeps that
   gap visible rather than implying the lookup settles
   the question. EWS1 forms have no public register
   either, and are never implied.

The `bsr-register` canary (monthly, in `canary.mjs`)
watches the two changes that would break this design:
an official building-level extract appearing in the
data.gov.uk catalogue (warning — re-open the register
half as a filing step; the recorded baseline, 14 Nov
2026, is three service-performance datasets and
nothing else), and the GOV.UK guidance or the search
service changing shape (warning — re-check the
hand-off). An unreachable source is a skip, never read
as "no extract".

**The tribunal half files the BSA/BSB slice.**
`load-tribunal-building-safety.mjs` enumerates GOV.UK's
residential-property-tribunal-decisions finder under
HMCTS's own "Building Safety Act" category, selects the
documents carrying a case reference in the /BSA/
(section 123 remediation orders) or /BSB/ (section 124
remediation contribution orders) series, parses each
decision PDF's first-page header block (case
references, the Property line exactly as printed, the
type of application, the date) and files
`tribunal_building_safety_decisions` (migration 0015)
— one row per case, via a stage-swap, with the Oyster
Bay control golden asserted before filing (see
tests/golden-matrix.md). Kind comes from the
decision's own type line or the order document's
heading, falling back to the reference's series —
never from GOV.UK's sub-category tagging, which
publishes the same document under two different
sub-categories. The slice is deliberately NOT the
tribunal's general index: publication is selective,
other series (HYI included) are out of scope, and a
case's row records that a decision or order was
published — never a verdict on the building.

**Coverage wording (the only honest form, for
M6.16):** the served line counts "published
building-safety orders naming this postcode, as at
[date]". No wording anywhere may say or imply "no
tribunal decisions" without that qualification: no
row at a postcode can mean the case sits in another
series, the decision was never published, or its PDF
could not be read. A row whose property text names
specific flats files `is_single_flat` and surfaces
only for those flats' addresses, not as a block
headline; a row whose Property prints no full
postcode files with a NULL postcode and can never be
served for one.

**The parse-failure discipline.** Headers vary by
region and era, and some PDFs carry no extractable
text at all (scanned) or text in CID-encoded fonts:
such a document files NOTHING and is counted BY NAME
in the run output. The first live pull (14 Nov 2026)
filed **28 cases from 24 documents**, with 3 named
parse failures — Ridley House (BIR/00CN/BSA/2024/0601,
scanned), the Prince Park Apartments order document
and 5 Praed Street (both CID-encoded; the Prince Park
case still filed from its later variation decision) —
2 dates taken from GOV.UK metadata where an order
document's header carries none, and 12 rows whose
Property prints no full postcode. A run whose
parse-failure count RISES against the previous
recorded run fails loudly after filing: a silently
thinner index is the one outcome this step forbids.

```text
npm run load:tribunal-building-safety                     # live quarterly pass (stage-swap)
npm run load:tribunal-building-safety -- --verify-only    # enumerate + parse + assert the golden; file nothing
node loaders/load-tribunal-building-safety.mjs --file tests/fixtures/tribunal-building-safety   # the fixture corpus (CI)
```

## Company ownership loader (plan step M5.13)

`load-company-ownership.mjs` is MONTHLY (the runner's
25-day class). It files HM Land Registry's two
company-ownership datasets — CCOD (UK companies that
own property in England and Wales; November 2026:
4,485,124 titles) and OCOD (overseas companies;
90,950 titles) — into `company_titles` (migration
0016), and the Companies House snapshot for every
company number those titles carry into
`company_snapshots`, from the Free Company Data
Product (bulk, OGL v3.0, no key). Both datasets file
as FULL replacements on every pass — never the
change-only files — so a title sold to an individual
drops out instead of lingering. Validation is a full
pre-pass before anything files; the swap itself is a
stage-swap per dataset inside one transaction.

**THE FLAG COMES FIRST.** This data is filed as
preparation only. `COMPANY_OWNERSHIP_ENABLED`
(lib/site.ts) defaults to false, and while it is
false nothing user-facing may read these tables or
surface anything they hold. It stays off until both
gates open: HM Land Registry Data Services' written
answer on clause 3.2 of the CCOD/OCOD licence
permits this use, AND the founder gives the go
(decision D18). If the written answer is no, the
founder alone decides whether the feature is killed
— the loader never deletes on its own. (The licence
requires deletion within 48 hours of a termination;
the full-replacement tables make that a drop, not a
clean-up.)

**The licence shape (decision D15).** CCOD/OCOD are
free of charge but NOT open data — a bespoke,
revocable HM Land Registry licence, not OGL. Clause
3.2 restricts the datasets' address fields (Royal
Mail / Ordnance Survey derived; we hold no PSGA
licence), so the register address text in
`company_titles` is a MATCH KEY ONLY: never
displayed, never published, never served — the
address on screen is always the buyer's own input.
Attribution wherever the information is used:
"Information produced by HM Land Registry © Crown
copyright [year]". The licence's operating
obligations — End-User Records kept and open to
audit, the licence flowed down to end users,
deletion within 48 hours of a termination — are
accepted product requirements (D15). Depth boundary:
no officers, no persons with significant control, no
parent-company inference, no charges; the £7 title
register stays the hand-off for those.

**The answer shape this data feeds (M6.13 owns
serving).** The headline answers the home's OWN
title. A company-held building freehold is a
separate labelled line in report depth only — a
flat's own leasehold title and its building's
freehold are different titles with different
proprietors, and the wording never lets one stand
for the other. The served fact is "a registered
proprietor of this title is a company" (the
additional-proprietor indicator is the register's
own flag where further proprietors, or kinds the
dataset does not list, sit alongside). Every answer
carries its dataset month: the register lags — a
transfer appears only after registration completes
and the next monthly file lands — and the licence
forbids presenting out-of-date data as current.

**The caveat set the No must carry (for M6.13's
explainer and the How-we-check page, decision
D13/D15).** A "not company-owned" answer means:
this home's title is not in HM Land Registry's
company-ownership data as at [dataset month]. The
explainer names the holes, every time, in plain
words: (1) charities are excluded from both datasets
by category, so a charity-owned home returns this
same No; (2) roughly a tenth of land in England and
Wales is unregistered — no registered title exists
for the datasets to hold, so it is invisible to this
check; (3) a sale still in the registration gap has
not reached the data yet. Scotland and Northern
Ireland are never a No: the datasets cover England
and Wales only, and those homes return the named
not-covered state.

**Snapshot holes are named, never filled.** The
Companies House bulk product holds live companies
only, keyed by its own number forms. A filed number
absent from it files no snapshot row, and serving
names the state — measured at this build, not
hypothetical: CLARION HOUSING ASSOCIATION LIMITED's
titles carry number 7686 as filed, and the product
keys that society RS007686, so no snapshot files for
it. Titles whose register row records no company
number at all (most overseas proprietors) are the
second named state. The loader never repairs joins
by name-matching and never invents a profile; the
Companies House API key (K24) that could fetch
dissolved profiles is not taken.

**The golden sample-check (run at this build,
14 Nov 2026, from the real files — the prep could
not run it, being account-gated).** 19 Birkdale Rise
(CM3 2JT) is in neither dataset — a clean No against
a non-empty CCOD slice (SAGE HOMES RP LIMITED's
titles over other Birkdale Rise houses); 6 Exeter
Road (E16 1GN) holds no row in either dataset at its
postcode, and a street-name search of both full
files found company titles only at 8 Exeter Road
(E16 1GP); Flat 4, Minerva House (KT17 1FH) has no
own-title row, while its building's freehold
(SY876459, "Flats 1-9 Minerva House, 12 Ceres
Crescent") is held by ADRIATIC LAND 11 LIMITED,
incorporated in Guernsey, no number recorded. The
loader asserts this record exactly for the locked
edition (2026-11) and structurally thereafter.

**Parse discipline.** The header is the contract —
a renamed consumed column fails loudly, naming it.
Rows in the wrong shape (field count, tenure, price,
date) file nothing and are counted BY NAME in the
run output (measured: one malformed trailing record
in each November 2026 file); a reject rate past the
bound fails the load. A postcode not in UK form
files as NULL and is counted by class; the row's
address text remains the match material.

**Acquisition.** `--file` reads a local set (fixture
CSVs, or the downloaded ZIPs, or a mix; a
manifest.json names the editions). The live pass is
the operator mode: the Land Registry half shells to
the connector helper `lrdata.py` (CMNH_LRDATA_HELPER
overrides its path) — the only credential path; no
key ever appears in this repo, its fixtures, tests
or logs — and the Companies House snapshot downloads
from download.companieshouse.gov.uk (no key). Every
downloaded ZIP is verified against the published CSV
size before it may parse: the helper's
single-connection download can be cut short on a
constrained network (measured at this build,
repeated cuts at ~316 MB of the CCOD file from the
build sandbox; the build's pull used a resumable
chunked fetch through the same helper API), and a
truncated file fails the load — a partial edition
never files.

```text
npm run load:company-ownership                     # operator (live) monthly pass
npm run load:company-ownership -- --verify-only    # acquire + validate + assert the goldens; file nothing
node loaders/load-company-ownership.mjs --file tests/fixtures/company-ownership   # the fixture slices (CI)
```

## Loader runner + canary

`run-loaders.mjs` (plan step M4.8; `npm run load:all`) runs the
contract canary probes (`canary.mjs` — one cheap shape/freshness
probe per source, filing nothing) and then the due dataset
loads, records the run in the `loader_runs` tables, and sends
one email per run: an alert on failure, a short OK heartbeat on
success. Due-ness is read from the schedule registry in
`run-loaders.mjs` (plan step M5.15, decision D19) — the same
table `npm run load:timers` prints, so the print and the
behaviour cannot drift. Quarterly (70 days, judged from the
last successful run items): the postcode directory and the
M5.1 flood, M5.2 planning and heritage, M5.3 nature
designations, M5.5 transport and M5.6 nearby datasets and the
M5.14 tribunal building-safety decisions — those loaders never
join onto the directory, so an empty directory does not skip
them. Monthly (25 days): sold prices, crime, EPC, schools,
health, the M5.16 benefits loaders, the M5.13 company
ownership, and since M5.15 the M5.7 EV chargers (Open Charge
Map changes daily; quarterly was the one cadence that did not
match its publisher). Static — due exactly once, when they
have never loaded, and never automatically again: the Census
2021 dataset (plan step M5.8), the LSOA Census base totals and
four of the five M5.9 datasets (IMD, air quality, broadband,
mobile). Operator jobs — never run by the timer: noise and
priority habitats (see the next section). Per-postcode loaders
take their targets from what is already filed (the golden
three when nothing is). Each timed loader gets the timeout
its registry entry sets — 30 minutes for every loader today,
headroom only where a duration has been measured — and a
loader killed by its timeout is recorded and emailed as
"TIMED OUT after N minutes" while the run carries on with the
next loader. A failed probe alerts
but never blocks a load. If the database is down the record
falls back to a JSON-lines file and the email still goes out.
`npm run canary` runs the probes only.

## Timers and operator jobs (plan step M5.15)

The timers install at M12, when the Hetzner VPS exists — one
cron, on the 5th of each month. There is no second, quarterly
cron: the quarterly loaders fall due every third monthly run,
which lands them in January, April, July and October. The line
to install (05:15 on the 5th; adjust the path to where the
repo lives on the server):

```text
15 5 5 * *  cd ~/check-my-next-home && npm run load:all
```

The run's own email is the log-and-alert check that follows
each run: one email per run, an alert on any failure, so a
missing email is itself visible. To check the timers against
the plan at any time:

```text
npm run load:timers
```

which prints every registered loader's class and timeout from
the schedule registry in `run-loaders.mjs` — the step's check
is that the print matches the plan's Data Loaders table.

Two loaders are operator jobs (decision D19): `load-noise`
and `load-priority-habitats`. The timer never runs them and
nothing times them out; every timed run's record and email
lists them as SKIPPED, with the date they last filed, and
their canary probes are the stale-data guard. Their first
passes are explicit pre-launch operator jobs in the M12
window, run by hand before launch:

```text
npm run load:noise               # the national Round 4 sampling pass — hours long, resumable
npm run load:priority-habitats   # the full 818,225-patch mirror — no resume; run it in one sitting
```

After those first passes they are re-run by hand the same way
whenever their sources republish.

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
