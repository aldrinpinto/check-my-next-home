# Land Registry fixture (plan step M4.2)

Real HM Land Registry Price Paid rows, extracted from the full file
(pp-complete.csv, published 28 Oct 2026) for the two golden postcodes:

- `pp-complete.csv` — all 40 recorded sales for CM3 2JT (31) and
  E16 1GN (9), in the Registry's own format (no header row, every
  field quoted).
- `pp-monthly-update.csv` — SYNTHETIC, written by hand for this
  fixture to prove the loader's update merge: one "C" (change) row
  amending the price of the No. 32 Birkdale Rise category-B
  transaction from £651,439 to £651,440, and one "D" (delete) row
  removing the No. 39 Birkdale Rise category-B transaction. After the
  merge, CM3 2JT holds 30 rows, No. 32 reads £651,440, No. 39 is
  gone — and the golden figures are untouched, because all three are
  computed from category-A sales.

Golden expectations proved from this fixture (the plan's M4.2 check):

- 19 Birkdale Rise's latest (and only) sale: £588,995, 15 Jun 2023.
- Street median £610,875 — the median of the eight sales the
  approved Birkdale report lists as "every sale counted" (Nos. 8,
  11, 15, 16, 19, 23, 26 and 28 Birkdale Rise; the loader encodes
  those eight transaction ids). The loader files ALL 31 recorded
  street sales; the median is checked over the report's eight.
- E16 1GN postcode median £310,000 over all 9 recorded sales.
