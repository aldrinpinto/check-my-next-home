# School destinations fixtures (plan step M6.34, decisions D51/D65)

Cut on 16 November 2026 from the real DfE Explore Education
Statistics release files the M6.34 prep downloaded (the
2024/25 release, published 15 October 2026; headline cohort
2023/24 leavers, version Provisional):

- `ks4.csv` — every row for the chosen URNs from the "Key
  stage 4 institution level destination measures" file
  (57,012,410 bytes, 188,180 rows nationally).
- `ks5.csv` — every row for the chosen URNs from the "16-19
  study leavers institution level destinations" file
  (70,162,148 bytes, 224,328 rows nationally).

The chosen URNs are: every URN in the schools fixture
(`tests/fixtures/schools/edubase.csv` — the golden frame's
filed schools, including Plashet School 152267, the genuine
KS4 no-row witness); New City College 130418; URN 130531,
whose headline-breakdown row carries the release's `low`
marker in its (unserved) `other_edu` cell; the twelve KS5
consortium URNs whose headline sets carry several member
rows (132951, 132838, 135416, 134820, 140604, 135469,
136509, 132913, 150214, 132942, 135589, 132916); and one
suppressed headline witness per stage (KS4 105602, KS5
106004 — cohort of 1, every share the marker `c`). All
breakdowns, all three cohorts and both data types are kept
for those URNs, so the loader's headline filter, its KS5
cohort-level filter and its consortium resolution are all
exercised against real rows. Filed from this cut: 36 KS4
rows and 39 KS5 rows (the KS5 cut's 83 headline rows
resolve to 39 URNs).

- `catalogue-ks5.html` — the two data-set summary blocks of
  the real 16-19 publication catalogue page, captured by
  the prep on 16 November 2026 (the institution-level data
  set 1cf3fa31-8773-484c-a5f9-5cb2d7906882 and the
  all-levels data set 09dcdbfb-ed7f-403a-803d-1fe28b535e7c,
  both tagged "This is the latest data"), wrapped in a
  minimal page shell.
- `catalogue-ks4.html` — MODELLED on the KS5 page's shape:
  no KS4 catalogue page was captured in the prep. Its first
  block carries the KS4 release's real values (data set
  ecbafe39-f3d4-44b2-9d0b-2e686308da1f, "Key stage 4
  institution level destination measures", release
  "Academic year 2024/25", published 15 Oct 2026); its
  second block is an invented differently-titled latest
  data set (id 11111111-2222-4333-8444-555555555555) so
  discovery's title discrimination is exercised on both
  pages. The discovery parse is proven against the real
  KS5 page; the KS4 page's shape is an assumption the
  first live filing re-verifies (the two publications'
  catalogue pages are rendered by the same service).
