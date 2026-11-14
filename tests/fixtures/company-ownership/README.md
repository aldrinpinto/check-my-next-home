# Fixture — company ownership (plan step M5.13)

Real extracts, pulled live at the build on 14 Nov 2026 — not
hand-written data:

- `ccod.csv` — every row of HM Land Registry's CCOD FULL file,
  November 2026 edition (published 3 Nov 2026; 4,485,124 rows
  nationally), whose Postcode is one of the three golden
  postcodes: CM3 2JT (2 rows), E16 1GN (0 rows), KT17 1FH
  (6 rows). The header is the file's own.
- `ocod.csv` — the same slice of the OCOD FULL file, November
  2026 edition (90,950 rows nationally): CM3 2JT (0), E16 1GN
  (0), KT17 1FH (3 rows).
- `companies-house.csv` — the rows of Companies House's Free
  Company Data Product, 1 Nov 2026 snapshot (5,711,780 live
  companies), for the company numbers the slices carry that
  the product holds: 11217910 (SAGE HOMES RP LIMITED) and
  13678133 (SOMY RESIDENTIAL LIMITED). The header is the
  product's own, leading spaces and all.
- `manifest.json` — the editions the extracts came from; the
  loader reads its source dates from here in --file mode.

What the slices prove (locked at the build; the loader's
golden checks assert exactly this):

- 19 Birkdale Rise, CM3 2JT is in NEITHER dataset — a clean
  No, proven against a non-empty CM3 2JT slice (the street's
  other company titles, SAGE HOMES RP LIMITED's, are here).
- 6 Exeter Road, E16 1GN has no row in either dataset at its
  postcode (a street-name search of the full files found
  company titles only at 8 Exeter Road, E16 1GP — a different
  building) — a No on the own title and at building level.
- Flat 4, Minerva House, KT17 1FH has no own-title row in
  either dataset — a No — while the building's freehold
  title SY876459 ("Flats 1-9 Minerva House, 12 Ceres
  Crescent") is held by ADRIATIC LAND 11 LIMITED,
  incorporated in Guernsey, with no company number recorded:
  the building-level line, and the no-number-recorded
  snapshot state, from real data.
- CLARION HOUSING ASSOCIATION LIMITED's Juno House titles
  carry company number 7686 as filed; the Companies House
  bulk product keys that society as RS007686 and holds no
  row under 7686 — so its snapshot state is the named
  number-not-in-the-snapshot state, again from real data.
  The loader never repairs the join by name-matching.

Licence caveat: CCOD/OCOD are HM Land Registry data under
the datasets' bespoke licence (not OGL) — these extracts
are the project's own licensed copies, held for testing
under the same terms as the filed data (feature flag off;
see decision D18). The Companies House product is OGL
v3.0. The register address text in these files is match
material only — nothing in the product displays it.
