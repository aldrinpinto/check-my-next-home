# Broadband fixture (plan step M5.9) — FORMAT-FAITHFUL, NOT MEASURED

The files here reproduce the documented shape of Ofcom's Connected
Nations Spring 2026 postcode release: a `release.json` plus
`postcode_files/<snapshot>_fixed_postcode_coverage_r2_<area>.csv`
files carrying the documented column headers, with **illustrative
values invented for the fixture** (each row's speed-band shares sum
to 100, as the published invariant requires).

No figure in this fixture is a measured Ofcom figure for any
postcode, and nothing in the test suite asserts one. Ofcom returns
HTTP 403 to the build sandbox, so the loader's live-pull proof is
outstanding: the first real pull (founder's machine, PHI precedent)
validates the header contract against the genuine file, and only
then do golden figures get fixed. Do not quote these numbers
anywhere.
