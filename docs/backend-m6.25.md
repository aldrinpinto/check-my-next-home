# Backend report — M6.25 CQC ratings served on health rows (founder ruling at M6.23)

M6.25 serves the CQC ratings that have been filed since
M4.7 (the cqc_ratings table, migration 0005) but that no
brain served — the M6.23 sweep's "as served" premise for
the M7.4 and M8.1 CQC pins was wrong, found at M6.24's
first check. The nearby answer's health places — GP
surgeries, A&E hospitals and maternity units — now carry
the location's overall CQC rating, joined from the filed
ratings as filed. Those M7.4 and M8.1 pins now stand on
served truth.

## The first check — the join exists on filed data

The step's mandatory first check established, from the
loader code, the migrations and a live fixture filing,
exactly how a filed health point joins to its filed
rating:

1. **The filed link is the loader's own.**
   loaders/load-health.mjs inserts each health point
   `RETURNING id, ods_code`, builds an ods_code → id map,
   and files every rating with that point's id
   (cqc_ratings.health_point_id, the foreign key
   migration 0001 declares). No serving code needed to
   invent a key.
2. **The loader's source-side match is exact-code,
   never name.** Ratings rows are indexed by Location ID
   and by Location ODS Code. NHS hospital points key on
   their Location ID (the directory's ODS code IS the
   ratings Location ID), GP points on their ODS code
   (the practice code is the ratings file's Location ODS
   Code), and independent-sector hospitals match on
   either identifier. No name-matching exists anywhere
   in the filing path.
3. **At most one rating row files per point.** The
   loader keeps the single latest overall rating per
   location; same-day conflicting overall ratings are
   withheld and logged as ties, never resolved by
   picking one.
4. **The filing proof.** Running the real loader over
   the fixture corpus into the local rehearsal database
   filed 499 ratings: 499 of 499 carry a non-null
   health_point_id (0 unjoined), 0 same-day ties
   withheld. Coverage: 494 on GP practice points (of
   522), 5 on hospital points, 0 on branch surgeries, 0
   on dentists, 0 on pharmacies, 0 on Welsh-postcode
   points. Filed values: Good 457, Requires improvement
   30, Outstanding 9, Inadequate 2, Not Rated 1.

One naming fact the check surfaced, stated plainly: the
filed rating_date is CQC's **Publication Date** for the
rating — the ratings file's own date column (column
"Publication Date"), as the loader's header has always
said. The step text's "inspection date" is therefore
served as what is actually filed: the rating's
publication date. No inspection date is held anywhere
in the filed data, and none is claimed. The one "Not
Rated" row (NOVUM HEALTH PARTNERSHIP) files no date at
all, so the served date is nullable by the data, not by
choice.

## What was built

1. **The brain (lib/nearby.ts).** The GP, A&E and
   maternity category queries LEFT JOIN cqc_ratings on
   the filed link and select the rating plus the date
   cast to text in the query itself (the sold-prices
   pattern: the served string is the filed date, never
   a parsed Date reformatted under a local timezone).
   The join cannot multiply a place — the loader files
   at most one rating per point — and the filedCount
   subquery still counts places. Served places in those
   three categories carry `cqcRating`: the rating object
   `{ rating, date }` where one files, null where none
   does — the named absence, never an inferred or
   neighbouring rating. The category set is gated in one
   place (RATED_CATEGORIES), so dentists, pharmacies and
   every other category serve exactly as before, with no
   rating field, whatever a source hands over. A
   maternity row carries the location's OVERALL rating,
   never a maternity-specific one. The beyond-radius
   pointer stays { name, miles } — the established
   reduced shape, as for every other filed fact.
2. **The short bundle does not change.** Ratings are
   full-check depth; the derivation never reads the
   field. Proven by an identity test in the M6.24
   pattern: the short bundle derived from a nearby
   bundle whose health places carry ratings is
   deep-equal to the one derived without them, and the
   serialised short bundle contains no rating field.
3. **Cache contract.** The nearby bundle's stored-shape
   check extends in the established pattern: every place
   in the GP, A&E and maternity answers must carry the
   cqcRating key, so a pre-M6.25 entry degrades to a
   recompute rather than serving ratingless health rows
   as current. Proven by test, against a source serving
   a rated GP point.
4. **Contracts.** One bundle-shape pin moved:
   nearby.served (the health places' variants gain the
   rating object and the null form). Dentists,
   pharmacies and the short bundle are untouched, so no
   other pin moved; all 46 pins stand, with the re-pin
   record in tests/bundle-contracts.test.ts. The
   contracts fake now serves a rated and an unrated
   health point so both place variants pin.
5. **Census.** Row 79, nearby.cqc-rating, hardness
   "self": the rating word is the regulator's own
   published label, filed and served verbatim — a filed
   fact, not a score of ours (D9 bars our scores, never
   a regulator's published word). The census stands at
   79 families / 46 hard. The census test's nearby source
   serves a rated GP point so the fail-closed leaf walk
   exercises the registration; the rating's date leaf is
   covered by the existing date allowance.
6. **The fixture capture** gains
   tests/fixtures/nearby/health-ratings.json — the 499
   filed ratings from the same loader filing as the
   points capture, keyed by the point's ODS code (the
   portable form of the filed id link), with the dump
   recipe added to the fixture README. The nearby tests
   file their fake's ratings from it, and a fixture
   integrity test pins the join: every captured rating
   resolves to a filed point, on GP-practice and
   hospital points only.
7. **Golden replay.** One new cell (the sixteenth):
   the ratings serve through the REAL database source —
   Exeter's A&E and maternity rows carry Newham's
   Requires improvement, Minerva's carry Epsom General's
   Good, Birkdale's GP list splits branch-null and
   Douglas Grove's Good, Exeter's dentists carry no
   rating field, and every Cardiff health place serves
   the null absence.

## Goldens pinned

Computed from the filed fixture data through the real
code, and locked in tests/nearby.test.ts:

1. **19 Birkdale Rise CM3 2JT** — GP: SYDNEY HOUSE
   SURGERY (the Sidney House branch) unrated; DOUGLAS
   GROVE SURGERY Good, 2026-07-17. A&E and maternity
   serve no places (Broomfield Hospital is the
   beyond-radius nearest for both, and the pointer
   carries no rating).
2. **6 Exeter Road E16 1GN** — A&E and maternity:
   Newham University Hospital, Requires improvement,
   2026-07-17. GP: CUSTOM HOUSE SURGERY Good,
   2026-06-01; CUMBERLAND MEDICAL CENTRE unrated;
   CARPENTERS PRACTICE - ST LUKE'S PRACTICE SITE
   unrated.
3. **Flat 4, Minerva House KT17 1FH** — A&E and
   maternity: Epsom General Hospital, Good, 2026-06-11.
   GP: FOUNTAIN PRACTICE unrated; SPRING STREET SURGERY
   Good, 2020-08-20.

## Scotland and Northern Ireland

No health points file for Scotland or Northern Ireland
at all — the ODS and CQC sources are England-and-Wales
registers and the loader files no points there — so the
health categories serve their existing absence states
there, unchanged by this step. Welsh points file (ODS
covers Wales) but are never rated: CQC covers England
only, the loader files no rating row for a Welsh point,
and a Welsh health place serves the null absence like
any unrated place.

## Divergences from the brief, and how they were settled

1. **"Inspection date" is the filed Publication Date.**
   The brief (following the step text) names the date
   an inspection date; the filed data holds CQC's
   Publication Date for the rating and no inspection
   date exists in it. The served date is the filed one,
   named as what it is in the code comments, the census
   note and this report. Nothing was renamed in the
   served shape to pretend otherwise.
2. **Brain-only, as the brief expected.** The join
   exists on filed data, so no loader or migration
   change was needed and no scoped rehearsal was owed.
   The real loader was run once over the fixture corpus
   into the local rehearsal database — to prove the
   join on filed data and to capture the ratings
   fixture — and that filing is the first check's
   evidence, not a build change.

## Gate

- `npm run prepush` green before the push: format,
  lint, typecheck, tests and build in CI's order —
  1,219 tests passed / 16 skipped locally (the golden
  replay's 16 cells run in CI's database job, the new
  M6.25 cell among them).
- CI and the practice runs for this push are read by
  the parent from the Actions page, as at every prior
  step.
