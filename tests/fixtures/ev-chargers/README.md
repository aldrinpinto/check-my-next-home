# EV chargers fixture (plan step M5.7)

`ocm-pois.json` — 901 Open Charge Map POI records, a trimmed
cut of the retained gate capture (`ocm-gb-capture.json`,
pulled 13 Nov 2026 through the custom.open-charge-map
connector with Key K17, openly-licensed records only). The
loader's source_date for fixture runs is that pull date
(`FIXTURE_PULL_DATE` in the loader).

## How it was cut

Radius windows around the eight golden homes (the same
windows the golden checks assert on):

- 3 miles around Birkdale, Exeter, Epsom, Ewell, City
  Island, Cardiff and Oxford — wide enough that every
  home's within-2-miles set is complete.
- 4 miles around Hilgay: its nearest charger stands
  3.538 mi away, so a 3-mile window would hold nothing at
  all and could not assert the honest sparse (zero within
  2 mi, nearest named and measured).

Each record is trimmed to exactly the fields the loader
consumes (ids, usage/status classes and their titles,
operator, data provider, NumberOfPoints,
DateLastStatusUpdate, the address fields, and each
connection's type / PowerKW / Quantity / StatusTypeID).
Bulky fields the loader never reads (media items, user
comments, operator contact blocks, metadata values) are
dropped — the loader's read path is identical either way.

## What the fixture exercises

901 read → 851 POIs file → 831 sites (20 records grouped
into their site). Present on purpose: membership-required
records (270 file, including Witham Leisure Centre itself),
Private – For Staff, Visitors or Customers (44 excluded),
Private – Restricted Access (3), (Unknown) (2), one Planned
status (excluded), and 396 records with no status recorded
at all — "not recorded" is a normal state in this dataset.

NOT present, because they do not exist near the golden
homes: UsageType 7 (Public – Notice Required — the nearest
to any golden home is 8.54 mi away, in Twickenham) and
UsageType 3. Their exclusions are covered by the unit tests
in `tests/load-ev-chargers.test.ts` instead; do not "fix"
the fixture by importing far-away records, which would
break the windows' honesty.
