# Backend report — M6.20 crime calibration (decision D39)

M6.20 amended the crime answer (D24) with the calibration
figures the founder ruled in D39: a per-head figure —
recorded crimes per 1,000 residents — and an England
comparison for the same 12-month window, under the
guardrails that both figures always show together, the
comparison is a multiple and never a lone percentage, no
verdict adjective is ever attached, and the word "rate" is
never used. The population basis is the founder's pinned
Basis B: the Census 2021 residents of the LSOAs containing
the postcodes within the same 1 mile, counted whole.

## What was added

1. **The brain** (`lib/crime.ts`): the served crime shape
   gains `perHead` ({residents, per1000, line, basisLine}),
   `englandFigure` ({englandPer1000, multiple, line}) and
   `calibrationExplainer` — the D13 basis line travels with
   the figure and the full working serves in the explainer
   (the How-we-check content the brain serves). Calibration
   is a pure function of the filed artefact fields, so it
   freezes into the D29 cache entry like the total line;
   the stale line is still recomputed at serve, and
   calibration travels unchanged into a stale window. The
   cache's crime shape guard gained a calibration-presence
   check (a pre-step entry degrades to a recompute; the
   artefact md5 guard cannot see the difference). The
   short bundle derives two new lines, `perHeadLine` and
   `englandLine`, from the full bundle — D28's derivation
   rule unchanged. Served keys are `englandFigure`, not
   the prep's draft `comparison`: the crime suite's key
   scan bans /compar/ in served keys (pinned at M6.4), and
   the register ids in the census keep the longer name
   (register ids are not served keys).
2. **The basis, filed at file time** (`loaders/load-crime.mjs`):
   the loader computes Basis B from the filed directory +
   `lsoa_bases` (haversine, R=3956, the loaders' own form,
   over a degree-box pre-filter) and files `basisResidents`
   inside the artefact. It returns the named absence (no
   field) when any in-set LSOA lacks a bases row or the set
   is empty — a partial sum is never filed. Fixture mode
   takes the pin from the fixture and never computes (the
   named trap, below). The loader also embeds `national`
   when a database client exists and the window is fully
   counted.
3. **The England numerator** (`loaders/load-crime-national.mjs`,
   migration 0021 `crime_national_months`): a monthly
   loader stream-counting Police.uk's data archive —
   the records whose LSOA code begins E01 inside the
   counted month's own folder (the archive is
   cumulative; see Bug 1); outcomes files are never
   counted. A filed month is never recounted (the rows
   are the resume state; the first fill is the 12-month
   backfill). One download of the latest archive serves
   every unfiled month in its window. The freshness
   guard is load-crime's, shared. After counting, it
   embeds {total, residents} into every filed crime
   artefact whose window is fully counted, skipping any
   artefact already carrying the computed figure (the
   skip is load-bearing for the practice break-crime
   proof, which diffs crime answers across a scenario
   run). The denominator is the `lsoa_bases` E01 sum —
   56,490,108 on the full filing, the same filed source
   as every circle's basis. Registered monthly in the
   runner's schedule and placed late in the live plan
   (its embed pass reads whatever the run's crime load
   filed); in the runner's fixture pass it runs after
   `load-lsoa-bases`, so the practice snapshot already
   carries the embedding.
4. **Edge rules, as built**: at zero counts the per-head
   figure serves as 0 and the comparison carries both
   figures with no multiple; a multiple that rounds to
   0.0 for a nonzero count is likewise withheld (the
   figures only — "about 0.0 times" would be a falsehood
   in the settled form). Welsh homes compare against the
   England figure D39 names. Scotland and Northern
   Ireland stay named not-covered with no calibration. A
   pre-M6.20 artefact serves its counts with calibration
   absent — never estimated.

## Coverage map

1. **Brain arithmetic + lines** (tests/crime.test.ts): the
   measured goldens serve through the brain — Birkdale
   51.7 over 6,380, Exeter 122.5 over 87,519, Minerva 49.0
   over 39,926; the England line's form (both figures,
   multiple from the unrounded figures); the zero
   witnesses on their measured populations (Wasdale Head
   1,328, Llanwrtyd Wells 1,767); the withheld-multiple
   edge; the Welsh treatment; stale travel; the pre-step
   absence. The suite's banned-wording and key scans run
   over the new lines and keys.
2. **Loader paths** (tests/load-crime.test.ts,
   tests/load-crime-national.test.ts): the fixture pins
   asserted; `computeBasisResidents` driven through a fake
   pool (multi-LSOA whole sum; null on a missing bases
   row; the own-LSOA degradation explicitly excluded);
   `nationalForWindow` (all-12-months gate; denominator
   null while bases are unfiled); the archive counter
   (E01-only, header-as-contract, quoted fields, CRLF,
   loud failure on a missing column or an empty file)
   and the month-folder rule over a hand-built two-month
   zip (the whole-zip count would return 19 where the
   folder count returns 7).
3. **Contracts** (tests/bundle-contracts.test.ts +
   bundle-shapes.json): the authorised re-pin — 44 pins;
   crime.served / crime.served-stale widened,
   short.rung1 / short.rung2 widened, and a new
   crime.served-pre-calibration pin holding the pre-step
   shape.
4. **Census** (tests/explainer-census.ts/.test.ts): rows
   68–71 registered (71 families, 42 hard), with path
   patterns for the new numeric leaves and hard-line
   accessors at both depths.
5. **State matrix + short bundle + cache**: the new
   served/null calibration states join the crime rows;
   the short lines asserted from the derivation, null on
   a pre-step artefact; the cache shape-guard degradation
   proven.
6. **Golden replay** (tests/golden-replay.test.ts): the
   setup adds Minerva's basis pin to the assembled crime
   fixture and runs the real national loader in fixture
   mode after the crime filings; assertions pin the three
   per-head goldens, the embedding's arithmetic identity
   on the excerpted bases (5,899 residents — the real
   England figure is the matrix's backfill lock, never
   the excerpt's), and calibration-absent for Cardiff and
   the zero witnesses.
7. **Scoped rehearsal** (local PGlite corpus): migration
   0021 applied twice (second a no-op);
   `computeBasisResidents` proven against the real SQL on
   a seeded synthetic multi-LSOA directory (3,000 = A
   1,000 + B 2,000, C outside the mile; seeds removed
   after); the national loader's fixture cycle filed 12
   months and embedded 17 artefacts, and a second run was
   a perfect no-op; the crime bundles built through the
   real database source served 51.7 / 122.5 / 49.0 with
   the excerpt England identity. The full local replay
   then ran to completion: 12 of 13 cells pass, including
   the new crime-calibration cell; the single failure is
   the flood cell — the same local-corpus-only failure
   as at M6.19 (the local flood filing wedged then; CI's
   PostGIS job is its discharge route, green at CI
   #159/#160). An earlier local replay attempt died on a
   dropped connection in the area bundle under heavy
   concurrent download load; the completed run above is
   the one that stands.

## Bugs found

1. **The "monthly" archive is cumulative — the counter
   summed 37 months** (product bug, caught by the
   backfill's own sanity check): Police.uk's archive zip
   named for a month is the archive AS OF that month,
   holding one folder per month over a rolling multi-year
   window (the 2026-09 archive holds 2023-10..2026-09,
   4,475 files). The prep had verified the URL pattern
   live but never opened an archive. The first backfill
   count of "September" returned 16,220,417 — roughly
   37 × a plausible month — which the twice-identical
   proof reproduced faithfully (the counting was
   deterministic; the unit was wrong). Fixed:
   `countArchiveEnglandTotal(zipPath, month)` counts only
   the month's own folder, resolves null when the folder
   is absent (the loader then falls back to that month's
   own archive), and rejects when a present folder holds
   no street CSVs. A hand-built two-month zip pins the
   folder rule in tests/load-crime-national.test.ts. The
   loader's live path now downloads the latest archive
   once and counts every unfiled month from it. Had this
   shipped uncaught, production would have filed a
   ~37×-overstated England total for the first month and
   every window figure with it.
2. **A null-LSOA directory row poisons the basis set** —
   caught by the fake-pool test during the build: a
   postcode with no LSOA (terminated and large-user
   postcodes carry none) must contribute no area; the
   loader's SQL filters `lsoa_code IS NOT NULL` (the
   prep's verification query did the same), and the test
   fake was corrected to emulate the filter faithfully.
   No production behaviour changed — the guard was
   already in the SQL; the test now proves the set logic
   end to end.
3. **Two archive downloads truncated silently** (build
   scratch, not product): the first downloads of
   2026-09.zip and 2025-10.zip arrived short of their
   Content-Lengths with no central directory, their
   curls having exited as if complete. The counter
   refused both loudly, as designed; September was
   re-downloaded with resume + stall detection and
   verified byte-exact against its Content-Length
   before counting. (The episode is also why the
   backfill's counts are only ever taken from archives
   the counter itself has read end to end.)

## The England figure

The backfill counted the window from the verified
2026-09 cumulative archive (per-month folders — see Bug
1), through the loader's own counter, and filed the 12
months into the local rehearsal corpus: 2025-10 457,065;
2025-11 432,011; 2025-12 416,388; 2026-01 401,765;
2026-02 387,961; 2026-03 447,342; 2026-04 439,606;
2026-05 468,361; 2026-06 468,246; 2026-07 503,213;
2026-08 473,619; 2026-09 443,069 — the last counted
twice, identical, before the set was trusted. **England
12-month total: 5,338,646 recorded crimes; over the
denominator 56,490,108 that is 94.5 per 1,000 residents.**
The universal homes' served multiples: Birkdale 0.5
times the England figure, Exeter 1.3 times, Minerva 0.5
times. The prep's illustrative 94.0 was a draft
placeholder and was never asserted anywhere; the counted
figure replaces it as the golden matrix's lock. The
production first fill runs the same code from the VPS
under the runner's monthly schedule.

## Still owed to M12 (this step does not close these)

Unchanged from M6.19's list: national-volume and
production timing proofs; the Article 4 gate bridge
(M12.10(b)); first national filings for noise, priority
habitats and PVGIS (M12.10(a)); the four Ofcom gaps
(M12.10(c)); the Stat-Xplore national pull and count-band
check (M12.10(g)); the council-tax spring pass
(M12.10(e)); the company-ownership exposure decision
(M12.10(f)). The national crime loader's first production
run joins the M12 first passes in spirit: its backfill is
proven locally at this step, and the production filing
runs from the VPS under the runner's monthly schedule.
