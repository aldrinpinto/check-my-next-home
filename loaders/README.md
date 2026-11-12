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
