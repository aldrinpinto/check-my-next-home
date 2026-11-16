# Backend M6.34 — School destinations (where leavers went next)

DRAFT STATE. This step was built under the D58 overlap
model in the draft tree `check-my-next-home-m634-draft`,
a copy of main at `86d65fa` (M6.33 integrated), while
M6.33's gate ran. Nothing here is on main yet; the
integration checklist at the end names every shared-file
hunk the serial port must carry, and the snapshot facts
(the pin leaf-diff, the census rows) were verified in
the draft and are re-verified at integration.

The step serves DfE leavers' destinations on the nearby
brain's school lists, at report depth: for each served
secondary school, where its most recent published
cohort of leavers went next — the share who stayed in
education, an apprenticeship or employment for at least
six months of the following school year. Two stages:
key stage 4 leavers on every served secondary, and 16
to 19 study leavers where the school has a sixth form
(D65 ruling 1 — a KS5-only scope would have left
Birkdale's and Exeter's served lists with no
destinations at all, since none of their secondaries
has a sixth form). Attainment and exam results stay out
permanently (D51); this step serves destinations only.

## The first check

Every load-bearing claim in the prep
(`scratch-m634/FINDINGS-HOLD.md`) was re-measured
against the prep's own downloaded release files before
any code was written (`scratch-m634-build/
premise-check.py`). All premises pass:

- The headline cohort is the **2023/24 leavers**
  (time_period `202324`), destinations measured in
  2024/25 — about a 27-month lag behind the school
  year. Both files' newest cohort version is
  **Provisional** (the October release); the older
  cohorts in the files are Revised.
- Headline counts: **KS4 4,551** schools; **KS5 2,740
  distinct URNs** over 2,784 headline rows (the
  consortium finding below). The fail-closed bands are
  ±10%: KS4 4096–5006, KS5 2466–3014.
- The URN join against the schools loader's own GIAS
  open filter (27,159 establishments) lands at **KS4
  4,162 of 4,551 (91.5%)** and **KS5 2,653 of 2,740
  (96.8%)** — the loader's floor is 90% per stage.
  `schools.urn` is text and the release's `school_urn`
  joins it exactly; the files carry an earlier name for
  some schools ("Maltings Academy" where GIAS now files
  "Lift Maltings"), so the URN is the only safe key and
  no name is filed.
- All seven served secondaries have full unsuppressed
  KS4 rows; Maltings Academy (URN 135653) reads cohort
  171, 84.8% overall sustained, 72.5% education, 5.3%
  apprenticeships, 7.0% employment — the brief's
  figures exactly. The KS5 goldens read exactly too:
  Glyn 87.4% of 253 (HE 61.7%), Nonsuch 92.2% of 230
  (HE 82.6%), Brampton Manor 92.9% of 422 (HE 83.6%),
  and NESCOT (URN 130822) cohort 953, 70.4% overall,
  HE 11.1% — filed, never served (ruling 5).
- Suppression is only the marker `c`, rule "cohorts
  less than 6, all data suppressed", and it is
  perfectly regular: KS4 164 of 4,551 rows (3.6%), KS5
  82 of 2,740 (3.0%), every suppressed row's cohort
  under 6, no partial suppression anywhere, and
  `cohort_count` numeric on every headline row.

Three refinements the build adds to the prep's account:

1. **Shares file as whole numbers without decimals**
   where the value is whole ("7" for 7.0). No design
   impact; the loader parses numerically.
2. **`low` never appears in a D65 field in the current
   cohort.** The prep counted 5 `low` cells nationally;
   all 5 sit in `other_edu`, a field D65 neither files
   nor serves (four in Total/Total breakdown rows — one
   of them, URN 130531, in the current 2023/24 headline
   cohort — and one in a Sex breakdown row). The loader
   still accepts `low` in any headline indicator cell
   and files it as a flagged null (never zero): a
   future release may put one in a served field, and
   the filing rule must not need rebuilding when it
   does.
3. **KS5 consortium URNs (not in the prep).** Twelve
   URNs carry several headline member rows,
   distinguished by `school_laestab`, with DIFFERENT
   figures per member: sixth-form consortia and
   federations (132951 Sleaford, 132838 LaSWAP, 135416
   Harris Federation Post 16, 134820 PGW, 140604
   Central Learning Partnership, 135469 Harrow, 136509
   RR6, 132913 St Aidan's / St John Fisher, 150214
   JMF6, 132942 Sydenham & Forest Hill, 135589 North
   Bristol, 132916 Didcot). Filing two rows for one
   (URN, stage) is impossible and picking one silently
   would file a member's figures as the institution's.
   The resolution rule, verified against the real file:
   identical filed figures file one row (132913); else
   the row whose `cohort_count` equals the sum of the
   others' is the combined institution row the
   publisher intends (the other eleven — Harris
   Federation's combined row is cohort 1112); anything
   else REFUSES the load. All twelve are GIAS
   establishments of type "Sixth form centres" — the
   type D64 ruling 8 keeps out of serving — so they
   file but never serve, like NESCOT; their member
   schools hold their own GIAS URNs and take the no-row
   state under the exact-URN join. The KS4 headline has
   no multi-row URNs; the rule applies uniformly.

One witness gap, named plainly: the schools fixture's
secondaries all have KS4 headline rows except **Plashet
School (URN 152267)** — the genuine no-row witness — and
none is suppressed nationally, so the suppressed
SERVING state has no golden-replay witness. It is
proven in the serving suite over a fake source (the
M6.33 marker-null precedent) and its filing side is
pinned on two real suppressed rows carried in the
fixture cut (URNs 105602 at KS4, 106004 at KS5).

## What was built

**Migration 0028** — one table, `school_destinations`,
keyed (urn, stage), holding the latest cohort per
stage: cohort year and version, cohort count, the D65
shares (overall, education, higher_education at KS5,
apprenticeships, employment) each nullable with a
`<share>_low` flag, the state ('served' / 'suppressed'),
source name and date, loaded_at. No column can hold
the not-sustained or not-captured remainders, a
national figure or a Russell Group figure — the
never-serve rules are structural (docs/schema.md entry
39).

**One loader, two sources** —
`loaders/load-school-destinations.mjs`. It discovers
each release's data-set ID from the EES catalogue pages
(the publication IDs are stable and held in the loader;
data-set IDs are per-release and never hardcoded —
discovery picks exactly the latest data set carrying
the publication's institution-level title, and refuses
on zero or two matches). It then files BOTH files or
NEITHER: the two must agree on release label, published
date and newest cohort before anything files, and the
whole release swaps in one transaction. Fail-closed
throughout: headline counts inside the ±10% bands
(live filings only — the fixture cut is judged by its
goldens); the URN join against the filed schools at
least 90% per stage, inside the transaction; the
staleness window (the newest cohort's leaver year is
the publication year minus 2 or 3); the cell vocabulary
(numeric 0–100, `c`, `low` — anything else refuses; a
row mixing numeric and `c` shares refuses); the
consortium resolution above; and the golden checks —
the measured 2023/24 values exact on a Provisional
filing, and on a Revised filing of that cohort each
golden share within one point (a wrong-file guard, not
an equality claim — see the judgment calls). Edition
detection no-ops a pull whose (stage, cohort_year,
version, source_date) already stands; an older cohort
never supersedes a newer filing, and a Provisional
never supersedes a filed Revised. Registered quarterly
in the runner (October's Provisional and spring's
Revised both land), with its fixture pass, npm script
(`load:school-destinations`) and a canary probe that
warns the day either publication's latest release moves
off the measured pin (release "Academic year 2024/25",
published 2026-10-15, cohort 2023/24) — the signal to
re-run and re-measure. Loader count 41 → 42.

The filed field set is the D65 set only. The prep's
table sketch also carried the KS4 education split
(SSf/SFC/FE) and `all_dest`; D65 ruling 3 fixes the
served set at overall / education / apprenticeships /
employment (+ HE at KS5), so the split is not filed —
there is no served or planned use for it, and filing
unserved columns is how remainders creep in. Judgment
call, flagged for the founder.

**Serving** — `lib/nearby.ts`. The URN rides the
schools-secondary point shape through to the place (the
M6.25 CQC precedent: set by the brain for that category
only, never for any other, whatever the source hands
over — 16-plus places carry neither a URN nor a block,
proven in the serving suite against a source that hands
facts over on every category). The secondary query LEFT
JOINs the destinations table twice on its primary key
(once per stage — the joins can never multiply a place
or move `filedCount`). The brain composes
`place.destinations = { ks4, ks5 }`: KS4 from the filed
row or the named absence states; KS5 the same but only
where the place's sixth-form marker is exactly `true`
(false and null carry `ks5: null` — an unfiled flag is
not evidence of a sixth form, D64's discipline carried
over). One release read per bundle
(`destinationsRelease()`) carries the filed count and
each stage's cohort year and source date: an unfiled
table serves the not-filed state from that read, never
an absence inferred per school, and the no-row wording
takes its cohort year from the release, not from a row
that does not exist. Report depth only — no short pin
moves (ruling 4), proven by short-bundle identity.

**Cache** — the nearby brain's dependency list gains
`load-school-destinations`; its guard set gains
`destinationsFiled` (the live count of
school_destinations — a hand-run filing busts a cached
entry on the count alone, the M6.30/M6.33 pattern); and
the nearby shape contract now requires every
schools-secondary place to carry the `destinations`
key, so a pre-M6.34 entry degrades to a recompute.

**Census** — six new hard families, rows 89–94 in
`tests/explainer-census.ts` (marked draft state):
`nearby.destinations.cohort`, `.overall`, `.education`,
`.he`, `.apprenticeships`, `.employment` — one per
served share per the step text, plus the cohort count
counted as its own family because the prep's
enumeration lists it ("the cohort count and five
percentages each need the line") although the brief's
summary said one per share; flagged as a judgment call.
Totals 94 families / 61 hard. Each stage's block carries
exactly two lines, and they divide the families between
them: the cohort line carries the cohort figure, and
the sustained line — the D13 line the step text
requires to travel with the figures — carries all five
share families. The shares have no per-share line
fields; if a future design wants per-share lines, that
is a shape change with its own pin move. Judgment call,
flagged.

**Fixtures** — `tests/fixtures/school-destinations/`:
cuts of the prep's real release files holding every row
for the chosen URNs (all 70 schools-fixture URNs, New
City College, the `low` witness URN, the twelve
consortium URNs, and one suppressed witness per stage),
the KS5 catalogue page's two real data-set blocks from
the prep's capture, and a KS4 catalogue page MODELLED
on the KS5 page's shape carrying the KS4 release's real
values — no KS4 catalogue capture exists in the prep,
so that page is flagged as modelled in the fixture
README; the live KS4 discovery path is proven only by
the parser's shape, and the first live run (M12.10(h))
is its real proof. Plain CSV/HTML text, no .b64 (the
house pattern needs it only for binary fixtures).

## Served states, verbatim

Served stage (both stages; KS5's `higherEducation`
carries the HE share, KS4's is null):

- cohort line: "The {cohortCount} students who finished
  {key stage 4 | 16 to 19 study} in {leaverYear} are the
  most recent cohort the Department for Education has
  published (published {Month Year})." — e.g. "The 251
  students who finished key stage 4 in 2024 are the most
  recent cohort the Department for Education has
  published (published October 2026)."
- sustained line (the D13 line, identical at both
  stages): "Sustained means the student stayed in the
  destination for at least six months of the following
  school year."
- a `low` share serves as `{ value: null, low: true }` —
  the interface renders the flag; the value is never a
  zero and never a rounded 0.5.

Suppressed (the prep's Q7 wording, adopted by D65
ruling 7, pinned verbatim): "DfE does not publish
destination shares for this school's {leaverYear}
leavers — the cohort was too small to publish (fewer
than six leavers)".

No row in the release (adopted verbatim): "DfE
publishes no destinations row for this school for the
{cohortYear} leavers".

Not filed (the house form): "The destinations data is
not filed yet, so leavers' destinations cannot be shown
for this check."

A wording tension for M8.1, flagged not resolved: the
plan's M8.1(q) text says "each listed secondary and
sixth-form row carries its destinations block", but D65
ruling 5 keeps 16-plus providers out of serving — the
bundle is the authority (sixth-form CATEGORY rows carry
no block; secondary rows with a sixth form carry both
stages), and M8.1's drafting should follow the bundle
when it is written.

## Goldens pinned

National (loader suite, over the fixture cut whose rows
are the release's own): KS4 files 36 rows, KS5 files 39
(twelve consortium groups resolved — Harris Federation
files its combined row, cohort 1112; St Aidan's / St
John Fisher files one of its identical rows, cohort
531, 89.3%). Maltings exact (171 / 84.8 / 72.5 / 5.3 /
7.0); the Minerva three exact at both stages including
HE (Glyn 61.7%, Blenheim 53.8%, Nonsuch 82.6%);
Brampton Manor KS5 exact (422 / 92.9 / HE 83.6%);
NESCOT filed exact (953 / 70.4 / education 28.3 / HE
11.1 / apprenticeships 7.5 / employment 34.6) and never
served; Plashet absent at KS4 (the no-row witness); the
suppressed witnesses file suppressed with cohort 1.

Replay (fixture basis, through the real source): the
core three's blocks as in tests/golden-matrix.md's
M6.34 section; every served secondary place at every
golden home carries the destinations key; NESCOT's
sixth-forms place carries neither block nor URN. Replay
count 22 → 23.

## Contract pins and proofs

Exactly ONE pin moved — `nearby.served` — proven two
ways: a leaf diff (every added leaf path is a
destinations or urn path) and a set-canonical strip
proof (the new shape with those keys deleted is the old
shape). All other 47 pins byte-identical; NO short pin
moved. The re-pin record in tests/bundle-contracts
.test.ts is marked draft state. The state matrix gains
the release read on its nearby fake (its secondary
points already carried the marker; the destinations
states are per-place and live in the serving suite).
Suite counts at draft: full suite 1,556 passed / 24
skipped locally (the replay suite is among the skipped
without GOLDEN_REPLAY); the new suites carry 26 loader
tests and 9 serving tests; typecheck and format:check
clean; `npm run prepush` exit 0 in the draft tree.

## Integration checklist (for the serial port onto main)

Base: main at `86d65fa` (M6.33 integrated). The port is
one grouped push; expect ONE approval card.

New files (copy as-is):

1. `db/migrations/0028_school_destinations.sql`
2. `loaders/load-school-destinations.mjs`
3. `tests/load-school-destinations.test.ts`
4. `tests/school-destinations.test.ts`
5. `tests/fixtures/school-destinations/ks4.csv`,
   `ks5.csv`, `catalogue-ks4.html`,
   `catalogue-ks5.html`, `README.md`
6. `docs/backend-m6.34.md` (this file — its Gate section
   is completed at integration)

Shared files (port the named hunks; each file's diff
against `86d65fa` in the draft is exactly these hunks):

7. `lib/nearby.ts` — the destinations types and
   `NearbyDataSource.destinationsRelease()`; `urn` /
   `destinations` on NearbyPoint and NearbyPlace; the
   secondary CATEGORY_SQL (urn column + the two stage
   joins); toPoint's conditional mapping; buildCategory
   / buildNearbyBundle composition; the Pg source's
   destinationsRelease read; the composed-shape types
   and the three line constants.
8. `lib/bundle-cache.ts` — `"load-school-destinations"`
   in BRAIN_DEPENDENCIES.nearby; the `destinationsFiled`
   guard; the shapeOk destinations-key clause.
9. `loaders/run-loaders.mjs` — the LOADER_SCHEDULE entry
   (quarterly, after load-pollution-inventory), the
   FRIENDLY_NAMES entry, the canary friendly name, the
   shortDetail case, and the fixture invocation after
   the pollution-inventory one.
10. `loaders/canary.mjs` — the loader import, the
    `probeDestinations` probe and its run line.
11. `package.json` — the `load:school-destinations`
    script (one line).
12. `tests/explainer-census.ts` — census rows 89–94
    (VERIFY the numbering against main at integration:
    M6.32's row 88 and M6.33's no-row stand; if main's
    census has moved, renumber and update the totals to
    match), the FIGURE_PATH_PATTERNS destinations
    entries, the NOT_A_FIGURE additions (`low`,
    `cohortYear`, the urn path pattern).
13. `tests/explainer-census.test.ts` — the 94/61
    enumeration, the six HARD_LINES entries and helper,
    the census source's destinations facts and release
    read.
14. `tests/nearby.test.ts` — the destinations mirror,
    the secondary map's urn/destinations, the fake
    source's destinationsRelease.
15. `tests/bundle-contracts.test.ts` — the fake's
    destinations facts and release read; the re-pin
    record comment (drop its "draft state" wording on
    the port).
16. `tests/fixtures/replay/bundle-shapes.json` — the
    regenerated nearby.served pin ONLY (verify by leaf
    diff against main's file at integration: every other
    pin byte-identical, no short pin moved).
17. `tests/state-matrix.test.ts`,
    `tests/short-bundle.test.ts` (fake release read +
    the M6.34 identity test), `tests/bundle-cache
.test.ts` (FakeDb count + dispatch, the two fakes'
    release reads, the M6.34 describe block),
    `tests/industrial-sites.test.ts` and
    `tests/sixth-forms.test.ts` (fake release reads).
18. `tests/golden-replay.test.ts` — the M6.34 replay
    test after the sixth-forms test.
19. `tests/golden-matrix.md` — the M6.34 section (drop
    its draft-state note on the port).
20. `docs/schema.md` — entry 39. `docs/data-loading.md`
    — the header count 41 → 42 and the quarterly-table
    row.

Then: the scoped local rehearsal on main (migration
0028 twice; the loader's fixture pass files 36 + 39;
the real source serves the core three's blocks), the
full suite, `npm run prepush`, ONE grouped push, and
the gate (CI plus the three practice scenarios) before
the tick. Do NOT port `node_modules` or
`tsconfig.tsbuildinfo` from the draft tree, and do not
touch `COMPANY_OWNERSHIP_ENABLED` or
`INDUSTRIAL_SITES_ENABLED`.

## Gate

Runs at integration (see the checklist). The draft
tree's own finish line: full suite green, typecheck
clean, format:check clean, `npm run prepush` exit 0,
and the scoped rehearsal below — all in the copy.

Scoped rehearsal (PGlite, the flood-wedge discipline):
migrations 0001–0028 apply in order and 0028 re-applies
as a no-op; the loader files the fixture cut into the
rehearsal database (36 KS4 + 39 KS5, the suppressed
witnesses suppressed, one source_date) and a second
filing no-ops on edition detection; the brain's join is
proven in SQL on the house basis against that filing
(Maltings and Rokeby join at KS4; Glyn joins at both
stages, 96.4 / 87.4 — the Minerva directory row seeded
from the replay's directory rows, since the ONSPD
fixture excerpt carries no KT17 row). The TypeScript
serving proof is the golden replay in CI plus
tests/nearby.test.ts locally. Rehearsal verdict at
draft: 21 of 21 checks PASS.
