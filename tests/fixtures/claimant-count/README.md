# Claimant Count fixture (plan step M5.16)

Two CSVs, each a VERBATIM response of the Nomis API for
dataset NM_162_1 (Claimant Count), captured live during the
M5.16 build on 13 Nov 2026:

- `claimant-count-latest.csv` — `date=latest`, the three
  golden LSOAs × measures 1 (count) and 2 (published % of
  residents aged 16–64). It resolved to **September 2026**:
  Birkdale (E01021395) 15 / 1.6%, Exeter Road (E01003511)
  120 / 8.6%, Minerva House (E01030396) 20 / 1.2% — the
  golden figures the M5.16 prep locked and the loader's
  golden checks assert exactly.
- `claimant-count-latestminus1.csv` — `date=latestMINUS1`,
  the same areas for **August 2026** (15 / 1.7%, 120 / 8.4%,
  20 / 1.2%): the revised-previous-month half of every run's
  filing set, captured so the fixture exercises the
  two-month shape the live loader files.

Query (guest, no key):
`https://www.nomisweb.co.uk/api/v01/dataset/NM_162_1.data.csv?geography=E01021395,E01003511,E01030396&date=<selector>&gender=0&age=0&measure=1,2&measures=20100`

Only the golden LSOAs are kept, as with the other loaders'
fixtures; the live national pull pages `geography=TYPE151`
in 25,000-row guest-cap steps (the prep's sizing, verified
at the build).
