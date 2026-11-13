# Census 2021 fixture (plan step M5.8)

Seven mini CSVs — one per Census 2021 bulk dataset the loader
reads (TS007A, TS007, TS021, TS030, TS044, TS052, TS054) — each
holding the header row plus exactly three MSOA rows, cut
VERBATIM from the live bulk files. The loader reads them by
their published file name (`census2021-<code>-msoa.csv`), in
the bulk files' own shape, so the fixture exercises the real
parse path, header contract included.

## Provenance

- Pulled live from the ONS bulk downloads via Nomis
  (`https://www.nomisweb.co.uk/output/census/2021/census2021-<code>.zip`)
  during the M5.8 build, 13 Nov 2026 — the build sandbox could
  reach Nomis, so no founder-machine download was needed and
  every figure here is measured from the published files, not
  transcribed.
- The three rows are the plan's universal golden MSOAs:
  Braintree 018 (`E02004463`, Birkdale Rise), Newham 036
  (`E02000749`, Exeter Road) and Epsom and Ewell 010
  (`E02006837`, Minerva House). The Braintree and Newham rows
  were verified cell-by-cell against the founder-approved
  sample area reports during the M5.8 prep
  (`~/workspace/scratch-census/PREP-REPORT.md`) — every count
  matches the approved samples exactly. The Epsom row is the
  first-pull measurement the prep said would fix at first
  load; it did, and its TS021 total (11,787 usual residents)
  is one of the canary probe's three exact-match baselines.
- Only the three golden MSOAs are kept; the other 7,261 areas
  of each bulk file are trimmed. TS054's "Social rented" —
  469 (Braintree 018), 1,631 (Newham 036), 241 (Epsom and
  Ewell 010) — is the filed fact the loader's golden checks
  and the CI practice assertions read.
