# Pollution Inventory fixture (plan step M6.32)

`2024 Pollution Inventory Dataset.zip.b64` is the base64 encoding
(the aims.gpkg.b64 pattern of load-flood-defences; the loader
decodes it in memory) of the Environment Agency's real published
2024 ZIP (Defra Data Services Platform, dataset
`cfd94301-a2f2-48a2-9915-e477ca6d8b7e`), cut down for the test suite:

- The workbook member keeps its real name and its real stored
  timestamp (20 November 2025 — the day the EA published the 2024
  vintage), so the loader's source-date derivation runs on the
  fixture exactly as it runs live.
- The `2024 Substances` sheet keeps its nine preamble rows and its
  header row, plus EVERY row (all routes) for nine permits: the
  seven golden permits of the step's prep (YP3432XR, SP3237JU,
  BP3530YR, FP3839YQ, EP3507SL, MP3530HZ, DP3906BE), one permit
  that files no air-route rows at all (PP3936YU — the
  no-air-returns state), and one permit with no published
  easting/northing (CP3140QU — files a NULL point and can never
  serve). The shared-strings table is kept whole.
- The Waste Transfers and Radioactive Wastes sheets keep their
  preamble rows only — the loader never opens them (out of scope,
  decisions D50/D62).
- The two extra permits sit far from every golden-replay home, so
  the replay's answers are unaffected by their presence.

Rebuild: filter the published workbook's Substances sheet to the
same nine permits, trim the other two sheets to their preamble
rows, and re-zip with the member timestamp set to the vintage's
publication date.
