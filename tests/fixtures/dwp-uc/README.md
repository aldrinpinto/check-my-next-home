# Universal Credit fixture (plan step M5.16) — REAL captures, 13 Nov 2026

**Every JSON file here is a real DWP Stat-Xplore response,
captured 13 Nov 2026 — nothing is synthetic.** They are the
first pull's own evidence: the golden table responses the
loader's golden values were locked from, and the schema
nodes its discovery assembles.

How they were captured: DWP's gateway refuses every
Muse-side network (HTTP 401 AUTHENTICATION from the
sandbox and the connector surrogate alike), while the same
K22 key answers 200 from the founder's home browser — so
the founder ran the calls himself in YARC on his own
connection and handed the responses over. The key and the
account were never at fault; the loader's header records
the full story (its FIRST_PULL note).

What the files are:

- `uc-people-table.json` — the real `/table` response for
  UC_Monthly ("People on Universal Credit"): the three
  golden LSOAs at March, April and May 2026. May 2026 was
  the series' latest month at capture; the golden values
  lock there: Birkdale 117, Exeter 383, Minerva 93.
- `uc-households-table.json` — the real `/table` response
  for UC_Households ("Households on Universal Credit"):
  February, March and April 2026 (the series runs a month
  behind people). April 2026 goldens: Birkdale 105,
  Minerva 83.
- `schema/` — one file per schema node, named
  `<database>-<role>.json`: the database node, the date
  field node, the date valueset (its first 100 values —
  the API caps a valueset response at 100 children, so the
  slice ends years before the latest month), the
  residence-geography group, the COA field, and the LSOA
  valueset (likewise its first 100 values). The loader's
  fixture routes serve exactly these nodes to the same
  assembly + probing + discovery code a live pull runs;
  the probing route answers months past the slice from the
  table captures' own month lists, which is what DWP had
  published for each series at capture time.

**The Households gap, stated plainly:** the households
table response holds only TWO golden LSOAs. Newham 036A
(E01003511, Exeter Road's LSOA) is absent from the
Households cube: its schema value node exists and is
correctly labelled, but a table recode naming it was
refused by DWP with RECODE_FIELD_VALUE_NOT_FOUND, while
the same code answers normally in UC_Monthly. There is
therefore no households golden value for Exeter, and the
loader's golden checks never demand one
(HOUSEHOLDS_MISSING_LSOAS in `loaders/load-dwp-uc.mjs`).

The counts in these files are DWP's published figures
exactly as returned — subject to Introduced Random Error,
as the loader's header describes — and the golden values
in the loader were locked from them, not the other way
round.
