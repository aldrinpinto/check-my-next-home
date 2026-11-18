# Picking index (EPC parts) — fixture slice

`certificates.csv` is the register's bulk-file shape
(header row + one row per certificate) carrying the
address lines of the four witnessed certificate sets
the per-postcode EPC loader's fixtures hold
(`tests/fixtures/epc/search-*.json` — real register
responses, minimised):

- CM1 6ER — 49 certificates, all "number / George Heard
  Crescent": the Beaulieu acceptance witness (no filed
  sales; 49 distinct homes).
- KT17 1FH — 25 certificates over Juno House, Minerva
  House and Jupiter House on Ceres Crescent: the flat
  witnesses ("Flat 8 Juno House" / "16, Ceres
  Crescent"), 25 distinct homes, no merges.
- CM3 2JT — 42 certificates on and around Birkdale
  Rise, in the number + street shape, with the post
  town filed both as "HATFIELD PEVEREL" and as
  "Chelmsford", as the register files it.
- E16 1GN — 12 certificates over 10 distinct Exeter
  Road homes (two homes hold two certificates each).

Only the columns the loader reads are carried (plus
LMK_KEY, to prove the column mapping is by name). The
runner's fixture pass files it through
`loaders/load-epc-index.mjs --file`, and
`tests/load-epc-index.test.ts` drives the same file.
