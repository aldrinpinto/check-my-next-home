# Fixture — council tax, 2026-27 (the live year)

Trimmed cuts of the REAL releases the council-tax
loader files from, taken at the M5.10 build (13 Nov
2026). Same sheets, same rows, same values — only the
rows the loader's tests and the runner's fixture pass
need are kept, so the set stays small.

- `Tables_1-9.ods` — MHCLG, *Council Tax levels set by
  local authorities in England 2026 to 2027* (GOV.UK
  statistics release, 25 Mar 2026): sheets Table_8a,
  8b, 8c, 8d, 8e, 8f and Table_9, trimmed to the 13 seed
  authorities plus the GLA witnesses (Camden and the
  City of London), one unfiled district (Reigate and
  Banstead) and their precepting bodies.
- `Table_10.ods` — the same release's Table 10
  (Data_Billing), trimmed to the same billing
  authorities.

  Both ODS files are stored base64-encoded
  (`Tables_1-9.ods.b64`, `Table_10.ods.b64`) for the
  repo's text-only push channel — the OS Greenspace
  precedent; the loader decodes them, and a plain .ods
  beside its .b64 wins locally.
- `wales-composition.csv` — Welsh Government via
  StatsWales, *Composition of average Band D council
  tax by billing authority* (dataset last updated
  24 Mar 2026), the full history for Cardiff, Swansea
  and Newport verbatim; the loader reads the filed
  year out of it.

The loader's golden checks assert the 13 seeds'
figures penny-exact from these files; a regeneration
from a revised release must re-verify them first (see
loaders/council-tax-spot-check.md).
