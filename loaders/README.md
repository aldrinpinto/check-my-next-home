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
filed postcodes uses the API's deltas feed, wired with the loader runner
in step M4.8.

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
