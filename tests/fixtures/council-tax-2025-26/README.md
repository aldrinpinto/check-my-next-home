# Fixture — council tax, 2025-26 (the rehearsal year)

Trimmed cuts of the REAL 2025-26 releases, in the same
shape as the 2026-27 set, taken at the M5.10 build
(13 Nov 2026). This is the fully verified rehearsal
year: the loader's tests assert its golden figures
(Newham £1,855.96 exact; Braintree on components,
£2,133.54 pre-parish; Epsom and Ewell £2,416.84 as the
release prints it) from these files.

- `Tables_1-9.ods` / `Table_10.ods` — MHCLG, *Council
  Tax levels set by local authorities in England 2025
  to 2026*, **the revised re-issue of 22 Apr 2026**
  (originally published 20 Mar 2025) — the revised
  tables are the ones that file. Trimmed to the same
  authorities as the 2026-27 set, and stored
  base64-encoded (`.ods.b64`) like that set.
- `wales-composition.csv` — the same StatsWales
  composition export as the 2026-27 set (it carries
  every year); the loader reads 2025-26 out of it.

One recorded discrepancy: the M5.10 prep pinned Epsom
and Ewell at £2,416.39 from the council's own minutes;
the revised MHCLG release prints £2,416.84 (a Surrey
Police element 45p higher). The release files. See
loaders/council-tax-spot-check.md.
