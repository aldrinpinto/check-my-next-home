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
