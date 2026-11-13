# LSOA Census base totals fixture (plan step M5.16, gap G5)

Two mini CSVs — `census2021-ts021-lsoa.csv` and
`census2021-ts054-lsoa.csv` — each holding the header row
plus exactly three LSOA rows, cut VERBATIM from the LSOA
files inside the live Nomis bulk zips during the M5.16
build, 13 Nov 2026 (the same zips the census fixture was
cut from in M5.8; the loader reads them by their published
file names, so the fixture exercises the real parse path).

The three rows are the universal golden homes' LSOAs, and
their Total columns are the loader's goldens:

| LSOA | Area | TS021 residents | TS054 households |
| --- | --- | --- | --- |
| E01021395 | Braintree 018C | 1,489 | 625 |
| E01003511 | Newham 036A | 1,923 | 671 |
| E01030396 | Epsom and Ewell 010D | 2,487 | 852 |

These are the bases the benefits report block states and
divides by (the LSOA's size in its header, and the
households-on-Universal-Credit share). The live files hold
all 35,672 England & Wales LSOAs; only the golden three are
kept here.
