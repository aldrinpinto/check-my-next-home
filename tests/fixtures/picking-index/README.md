# Picking index (sales parts) — fixture slice

`pp-complete.csv` is the same witnessed Price Paid slice
the sold-prices loader's fixture carries
(`tests/fixtures/land-registry/pp-complete.csv`): the
golden postcode CM3 2JT (31 transactions over 27
distinct homes — repeat sales included, so the pass's
SQL dedupe is exercised by real rows) and E16 1GN
(9 transactions over 7 distinct homes).

The runner's fixture pass files it through
`loaders/load-picking-index.mjs --file`, and
`tests/load-picking-index.test.ts` drives the same
file. The flat-in-a-building dedupe witnesses for the
sales grammar are generated in the test itself (a
district-sized slice), not committed here.
