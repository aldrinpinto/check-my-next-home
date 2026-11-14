# Address-resolution fixtures (plan steps M6.1 + M6.11 classifier)

`kt17-1fh.csv` holds Price Paid-shaped rows (the Registry's 16-column
layout) for the third golden home's postcode, KT17 1FH — the repo's
`tests/fixtures/land-registry/pp-complete.csv` excerpt covers CM3 2JT
and E16 1GN but not this postcode, so the flat trap it guards needs
its own rows.

Provenance — every row traces to the locked facts in `tests/README.md`
("Land Registry facts, locked 12 Nov 2026"):

- **Minerva House, Flat 4** — verbatim: PAON "MINERVA HOUSE, 12",
  SAON "FLAT 4", £420,000 on 3 Dec 2019, new-build leasehold,
  transaction AE4D86D4-69D9-4619-E053-6C04A8C03CD0.
- **Jupiter House, Flat 4** — £341,000 on 10 Sep 2019 (the trap row:
  the same flat number in the neighbouring block). Its transaction id
  is not among the locked facts, so that field is left blank rather
  than invented.
- **Juno House, Flat 4** — address parts only. The locked EPC facts
  record that Juno House has a "Flat 4" certificate; no Juno sale is
  among the locked facts, so price, date and transaction fields are
  blank. The row exists so the matcher must keep the three buildings'
  Flat 4s distinct.

The address resolver consumes only the address columns (postcode,
PAON, SAON, street, locality, town); blank sale fields in a fixture
row claim no sale.
