# Police.uk fixture (plan step M4.3)

Real Police.uk API responses, captured 12 Nov 2026:

- `crimes-street-dates.json` — the availability endpoint's response.
  Its newest month is 2026-09 (September 2026): Police.uk publishes
  with a lag of about two months.
- `birkdale-YYYY-MM.json` / `exeter-YYYY-MM.json` — the street-crime
  responses (all crime, 1-mile radius) for the two golden points, one
  file per month for the 12-month window Oct 2025 – Sep 2026.
- `fixture.json` — the two points (the golden postcodes' directory
  positions from step M4.1) and the "today" the freshness guard is
  tested against (2026-11-12), so the guard's maths is stable in CI.

Golden expectations proved from this fixture (the plan's M4.3 check):
the 12-month totals are **330** crimes for CM3 2JT and **10,722**
for E16 1GN — the approved reports' figures, reproduced exactly by
summing the monthly responses. Counts only: the product never turns
crime counts into a score or a verdict.

First-load captures added 14 Nov 2026 (plan step M6.4), same window
(Oct 2025 – Sep 2026), captured the day the real loader filed the
same postcodes live; an independent tally of these files matched
the loader's filed artefacts exactly:

- `epsom-YYYY-MM.json` — KT17 1FH (Minerva House): **1,956**.
- `ewell-YYYY-MM.json` — KT17 1DR (Ewell Village): **2,361**.
- `hilgay-YYYY-MM.json` — CB6 1EH (Hilgay): **7**.

These three points are NOT in `fixture.json`: the loader's fixture
mode still covers the two M4.3 points only. The brain's suite
(`tests/crime.test.ts`) derives its filed artefacts from all five
points' captures.
