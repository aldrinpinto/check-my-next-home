# Backend M6.33 — Sixth forms and colleges, and the sixth-form marker

Plan step M6.33 (decisions D51 and D64; prep
`~/workspace/scratch-m633/FINDINGS-HOLD.md`). The nearby
bundle gains a twenty-second category, "sixth forms and
colleges", immediately after schools-secondary, read
from the SAME schools filing as the school lists — no
new loader, no migration, no new table — and the
schools-secondary places gain a marker, `sixthForm`:
the register's filed sixth-form flag as filed, true
only on "Has a sixth form", false only on "Does not
have a sixth form", null where the register files
neither, never derived from age ranges. The category's
selection is mainstream only (D64): every "16 plus"
phase row plus the flagged rows of every other phase
except Secondary, minus special-sector types,
independent types, British schools overseas and Welsh
establishments; 'Sixth form centres' and 'Special post
16 institution' are out at V1. Category places serve
name, the type as filed, and distance — the Ofsted
element is dropped (D64 ruling 5: the filed join
carries almost no Ofsted row for 16-plus provision).
The within list never repeats a school the secondary
list serves; the category's beyond-nearest, alone in
the brain, may draw on flagged secondaries (ruling 4),
and only strictly beyond the radius. Report depth
only: the short bundle's six headline categories are
unchanged and its derivation never reads the marker or
the category. This step was drafted in an isolated copy
under the D58 overlap model, taken from the main tree
at M6.32's integrated head (`61e4804`); the pin and
census states below are the draft's, to be re-verified
at integration against the true tree.

## The first check

The prep's load-bearing premises were re-verified from
the prep's own evidence base — the full live GIAS
extract of 16 Nov 2026
(`~/workspace/scratch-m633/edubasealldata20261116.csv`,
27,159 open establishments, exactly the filed count) —
before any code was written, with the brain's own basis
(proj4 EPSG:27700 with the towgs84 shift; haversine
R=3956):

- **NESCOT confirmed.** URN 130822, North East Surrey
  College of Technology: type "Further education",
  phase "16 plus", flag "Not applicable", 0.174 miles
  from Minerva KT17 1FH. It enters the category ONLY
  via the phase clause — the flag clause cannot take
  it — which is why the selection is phase-or-flag,
  never flag alone.
- **The D64 outcomes reproduce exactly.** Minerva's
  category = NESCOT alone (1 within). Exeter's = eight
  within, the served three East London Arts & Music
  (1.445), New City College (1.692), Oasis School 21
  (1.758, all-through, flag clause). Birkdale's beyond
  name under ruling 4 = Lift New Rickstones at 3.212
  miles (a flagged secondary), NOT the pure category
  rule's Beaulieu Park School at 4.664. (The register
  files the name as "Lift New Rickstones" — the served
  name is as filed; "Academy" is the chain's older
  styling, as with "Lift Maltings".) Cardiff's beyond
  on the national basis = Weston College at 12.084
  miles, an English FE college — Welsh establishments
  are out of the selection, so Welsh homes are served
  by distance from the same pool, never by a Welsh
  named-gap state (the category is register-wide, not
  England-only).
- **Flag counts confirmed, with one correction.**
  Secondaries: 3,173, of which "Has a sixth form"
  1,890 (59.6%), "Does not have a sixth form" 1,193,
  blank 2 — and "Not applicable" **88**, not the 82
  the brief's ruling-7 parenthetical carried. The 82
  is the 16-plus sector's own flag-Has count in the
  same enumeration (the prep's Section 1: "16 plus 82
  of 289"); the ruling itself is per-value and
  unaffected. Recorded here as the draft's one
  correction to the brief.
- **The selection as built counts 410 rows
  nationally.** The prep's mainstream variant (the
  drafted rule minus special-sector types, independent
  types and British schools overseas) reproduces at
  456; D64 ruling 6 (Welsh establishments out) removes
  its 46 Welsh rows, leaving 410. Composition: 207
  further education colleges; 82 further "16 plus" rows
  (16-19 academies and free schools among them); 95
  flagged all-through schools; 26 flagged rows in other
  phases (alternative provision academies and pupil
  referral units among them — they ride the flag
  clause exactly as the prep's counted variant held
  them; D64 named no exclusion for them, and the
  ruling-2 special exclusion does not reach their
  types). 'Sixth form centres' (14 rows) and 'Special
  post 16 institution' (165 rows) contribute zero:
  ruling 8 holds by construction — the centres file
  phase and flag both "Not applicable", and the
  special post-16 type names "special", so the
  special-type exclusion takes it; both facts are
  asserted in the premise script's counts.
- **No independent school serves anywhere.** No
  independent-type row files a Primary or Secondary
  phase (independents file phase "Not applicable"), so
  none appears in the primary or secondary lists today,
  and the category's independent exclusion keeps them
  out of the new list — the founder's uniform position,
  confirmed on the extract.
- **SQL/JS parity.** No selected row files a NULL
  school_type (all 410 carry a type), so the SQL
  `school_type <> '…'` exclusions and the test mirrors'
  null-tolerant comparisons agree row for row.

## What was built

1. **The marker** (lib/nearby.ts). The
   schools-secondary base query gains a CASE over the
   filed `sixth_form` column — 'Has a sixth form' →
   true, 'Does not have a sixth form' → false, anything
   else (including NULL) → NULL — yielded as
   `sixth_form`; `toPoint` maps it onto
   `NearbyPoint.sixthForm` only when the column is
   present (the cqcRating pattern: every other
   category's query does not select it, so the field
   stays absent there by construction). `buildCategory`
   sets `place.sixthForm = point.sixthForm ?? null` for
   the schools-secondary category only — present on
   every place it serves, never set for any other
   category whatever the source hands over.
2. **The category** (lib/nearby.ts). Key
   `"sixth-forms"`, label "sixth forms and colleges",
   essential, emptyKind "ground", in the CATEGORIES
   order immediately after schools-secondary. Its base
   query selects from `schools` where `(phase =
'16 plus' OR (sixth_form = 'Has a sixth form' AND
phase IS DISTINCT FROM 'Secondary'))`, under the
   D64 type exclusions (`school_type NOT ILIKE
'%special%'`, `NOT ILIKE '%independent%'`, `<> 'British schools overseas'`,
   `<> 'Welsh establishment'`, `geom IS NOT NULL`),
   yielding `school_type AS detail` — the served detail
   is the type as filed (ruling 5). The category's
   filedCount guard counts this selection (410 on the
   current filing), so its not-filed state stands on
   its own filing (D30).
3. **The beyond pool** (lib/nearby.ts).
   `CATEGORY_NEAREST_SQL` — a new per-category override
   map for the beyond read, with one entry: the
   sixth-forms beyond selection, the within selection
   UNION the flagged secondaries (algebraically
   `phase = '16 plus' OR sixth_form = 'Has a sixth form'`,
   same exclusions). `createNearbySource.nearestPoint`
   uses the override where one exists and, for this
   category only, reads a wider distance-ordered window
   (LIMIT 64) and keeps only points strictly beyond
   RADIUS_MILES on the brain's own haversine — a
   flagged secondary inside the radius is never the
   beyond name, because the line it rides on ("none
   within 2 miles — nearest is …") would contradict
   itself. Every other category's nearestPoint is
   byte-identical to before.
4. **The cache guard** (lib/bundle-cache.ts, D64
   ruling 9). `GUARDS.nearby` gains `schoolsFiled`, the
   whole-table schools count, on the M6.30 pattern: the
   schools loader is a runner class whose stamp moves
   on runner runs, but a hand-run `load:schools` moves
   no stamp — the count closes that hole. (The guard
   previously returned the directory alone, with the
   "every nearby filing is a runner class" reasoning
   the ruling retires for schools.)
5. **The cache shape rules** (lib/bundle-cache.ts).
   The nearby `shapeOk` gains the M6.24/M6.25-pattern
   clauses: the categories must include a "sixth-forms"
   answer, and every place the secondary answer serves
   must carry the `sixthForm` key. No loader stamp in
   the version vector moves when the step deploys (the
   schools filing is unchanged), so only these presence
   rules stop a pre-step entry serving markerless
   secondary rows, or a bundle with no sixth-forms
   answer, as current.
6. **The census** (tests/explainer-census.ts). No new
   family: the totals stand at 88 families / 55 hard.
   The marker's field name `sixthForm` joins the
   structural-scalars group of NOT_A_FIGURE_ALLOWLIST
   beside `selective` (a filed boolean or its null
   absence — not a figure), with a draft-state comment;
   the category's distances ride
   `nearby.distance-miles` generically and its
   type-as-filed detail rides the allowlist's names
   group (`detail`/`type` already cleared). The census
   suite's fake secondary point now carries
   `sixthForm: true`, so the walk meets the leaf on a
   served place and the clearance is exercised, not
   just declared (the M6.25 pattern).
7. **The short bundle** (lib/short-bundle.ts). No code
   change — HEADLINE_NEARBY_CATEGORIES is unchanged;
   its comment's counts move fifteen/twenty-one →
   sixteen/twenty-two, noting M6.33 beside M6.24. The
   headline derivation projects `{name, miles}` only,
   so neither the category nor the marker can cross;
   an identity test in the short-bundle suite proves
   the short answer is field-for-field identical with
   the category removed and the marker stripped.
8. **Tests.** A dedicated suite
   (tests/sixth-forms.test.ts, 12 tests): the selection
   clause by clause (phase clause, flag clause, every
   D64 exclusion row by row, duplication-freedom), the
   marker's three values plus the blank-flag null,
   marker absence on every other category, the beyond
   rule (flagged secondary named; a within-radius
   flagged secondary never named; a within-selection
   row named when nearer; the unnamed-evidence empty
   line), the not-filed state, and a banned-wording
   scan over the whole bundle with filed names
   stripped. tests/nearby.test.ts: the fixture mirror
   gains the filed type and flag, the category table
   and the beyond pool; the order test moves to
   twenty-two categories; a new M6.33 block pins the
   fixture-basis outcomes (below). tests/state-matrix
   .test.ts: ALL_CATEGORIES gains the category; one row
   proves within / none-within / not-filed in the
   category's own words. tests/bundle-cache.test.ts:
   the FakeDb gains the schools count; four tests prove
   the guard's presence in the version vector, the
   hand-run bust on the count alone, and both pre-step
   degradations. tests/golden-replay.test.ts: the
   sixth-forms replay test (below). tests/golden-matrix
   .md: the M6.33 section appended.

## Served states, verbatim

The category serves through the generic category
machinery; its three states' words are the machinery's
own, with the label "sixth forms and colleges":

- within: `places` — up to three, distance order, each
  `{name, miles, detail}` with detail the type as
  filed (e.g. "Further education"); `countWithin` the
  full within count; `line` null.
- none-within: `places` empty; `beyondNearest` the
  single nearest from the beyond pool strictly beyond
  two miles; line "none within 2 miles — nearest is
  {name}, {miles} miles away (straight-line distance
  from the postcode point)"; where no nameable evidence
  exists, the ground empty line "no sixth forms and
  colleges within 2 miles of the postcode point".
- not-filed (the selection's filed count is zero):
  line "the sixth forms and colleges data is not filed
  yet, so no sixth forms and colleges answer can be
  given yet".

The marker serves on schools-secondary places as
`sixthForm: true | false | null` beside the existing
`selective` field; it carries no line of its own (it is
a filed fact on the place, D13-silent in the same way
`selective` is — the renderer words it at M7/M8).

## Goldens pinned

National (premise-verified on the live extract, brain
basis): Minerva — NESCOT alone, 0.174. Exeter — eight
within; served three East London Arts & Music 1.445,
New City College 1.692, Oasis School 21 1.758.
Birkdale — beyond Lift New Rickstones 3.212 (ruling
4). Markers: Minerva's served secondaries all true;
Exeter's all false; Birkdale's Lift Maltings false.

Fixture filing (the replay's world — the schools
fixture cut holds one within-selection row): Minerva's
category verbatim (NESCOT, "Further education", 0.174);
markers true at Minerva, false at Exeter and Birkdale;
Birkdale's beyond name reproduces the national golden
(Lift New Rickstones 3.212 — the cut includes it);
Exeter's beyond name on the fixture basis is Bexley
Grammar School 5.484 (the national three are not in
the cut); a second ruling-4 witness at City Island
(St Bonaventure's RC School 2.088). The marker's null
value has NO witness among the fixture's served
secondaries — every one files Has or Does-not — so it
is pinned in tests/sixth-forms.test.ts and in the
contracts pin instead; the replay asserts the key's
presence on every served secondary at every golden
home. The replay's first proof against a real PostGIS
is CI's database job at the gate, as with every step
since M6.19.

## Contract pins and proofs

- **Pins**: exactly ONE pin moved — nearby.served —
  differing by exactly the marker on the secondary
  category's places (the boolean variant on the
  contracts fake's nearest secondary place, the null
  variant on its second). Verified leaf-by-leaf against
  the pre-step shapes before the re-pin was written:
  the new category's own answer shape already stood
  among the distinct category shapes (its places carry
  name, miles and a filed detail string, as other
  categories' do), so nearby.beyond-only,
  nearby.none-anywhere and nearby.not-filed did NOT
  move (in those modes every category's places are
  empty and the answer shapes coincide), the rung-3/4
  pins did not move, and **no short pin moved**; 48
  pins stand. The brief's expectation of about four
  moving pins was the M6.32 pattern (a new top-level
  key); a category addition inside the existing
  categories array moves only the served shape. A
  re-pin record comment rides in
  tests/bundle-contracts.test.ts, marked draft state.
- **Census**: no new family — 88 families / 55 hard
  stand (the enumeration assertion in
  explainer-census.test.ts is untouched and green).
- **Short identity**: proven in the short-bundle suite
  (identity with the category removed and the marker
  stripped; the serialised short carries no
  "sixthForm").
- **Cache**: the guard vector, the hand-run bust and
  both pre-step degradations are proven in
  tests/bundle-cache.test.ts.
- **Loader contracts**: untouched — no loader is added
  or changed; the suite's auto-coverage is unaffected.
- **Suite**: the draft's full suite is green — 1,514
  passed / 23 skipped (the replay suite DB-gated among
  the skipped), `npm run prepush` exit 0 (format, lint,
  typecheck, tests, production build). Every touched
  file is Prettier-clean, proven by format:check inside
  prepush.

## Integration checklist (for the serial port onto main)

New files (copy as-is): tests/sixth-forms.test.ts;
docs/backend-m6.33.md.

Shared files — apply these hunks onto the true tree:

- lib/nearby.ts — the header comment's sixth-form
  paragraph (after the industrial-sites paragraph);
  `"sixth-forms"` in the NearbyCategory union after
  `"schools-secondary"`; NearbyPoint.sixthForm and
  NearbyPlace.sixthForm; the CATEGORIES entry after
  schools-secondary; the buildCategory marker carry;
  the CATEGORY_SQL comment's CASE sentence, the
  schools-secondary query's CASE column, and the new
  `"sixth-forms"` query; CATEGORY_NEAREST_SQL after
  CATEGORY_SQL; toPoint's sixth_form mapping;
  nearestPoint's override + strictly-beyond read.
- lib/bundle-cache.ts — GUARDS.nearby gains
  schoolsFiled (the `void db` goes); the nearby
  shapeOk comment's M6.33 paragraph and its two
  clauses (category presence; the marker-key loop).
- lib/short-bundle.ts — comment only: the
  HEADLINE_NEARBY_CATEGORIES counts (fifteen →
  sixteen, twenty-one → twenty-two) and the M6.33
  mention. No code change.
- tests/fixtures/replay/bundle-shapes.json — the one
  re-pinned shape (nearby.served; leaf-verified
  above).
- tests/bundle-contracts.test.ts — FakeNearbySource
  .pointsWithin gains the secondary marker pair; the
  M6.33 re-pin record comment after M6.32's.
- tests/explainer-census.ts — `sixthForm` in the
  structural-scalars allowlist group, with the
  draft-state comment.
- tests/explainer-census.test.ts — the
  CensusNearbySource secondary point gains
  `sixthForm: true`.
- tests/nearby.test.ts — the RADIUS_MILES import;
  SchoolRow gains type + sixthFormFlag and the row
  build fills them; TABLES gains the secondary marker
  mapping and the "sixth-forms" table; the
  SIXTH_FORMS_BEYOND pool and the fake nearestPoint's
  sixth-forms branch; the order test (twenty-two,
  "sixth-forms" inserted); the M6.33 describe block at
  the end.
- tests/state-matrix.test.ts — ALL_CATEGORIES gains
  "sixth-forms"; the M6.33 matrix row in the nearby
  describe.
- tests/bundle-cache.test.ts — the FakeDb schoolsCount
  field and its `FROM schools` branch; the M6.33 cache
  describe after the industrial-sites describe; the
  M6.24 test comment's "current twenty-one" →
  "current category set" (a count that went stale).
- tests/short-bundle.test.ts — the M6.24 identity
  test's comment drops its "twenty-one-category"
  wording; the M6.33 identity test after it.
- tests/golden-replay.test.ts — the sixth-forms test
  after the industrial-sites test.
- tests/golden-matrix.md — the M6.33 section appended.

Untouched, deliberately: docs/schema.md and
docs/data-loading.md (no migration, no loader — the
step reads the existing schools filing); loaders/
(nothing); package.json (no new script);
loaders/run-loaders.mjs and loaders/canary.mjs (no new
loader to schedule or probe — the schools loader's own
canary already watches the register).

At integration: re-verify the pin set by leaf-diff
against the true tree's pre-step shapes (the draft's
diff was taken against M6.32's integrated head, so it
should reproduce exactly — one pin, nearby.served);
re-verify the census position (no new family: the
totals stay 88/55, M6.32's row 88 having landed
first); never port tsconfig.tsbuildinfo from the
draft tree. The draft tree's `out/` directory was
rebuilt by its prepush run — build artefacts, not
source; do not port them.

## Gate

Draft state (D58): built and proven in the isolated
copy only — nothing pushed, no plan edit. Integration
ports the hunks above in queue order after M6.32's
gate, then the step takes the usual gate (prepush, CI
including the golden replay's database job, practice
×3 — the practice scenarios are untouched by this
step: no loader, runner or alert path changes). Two
judgment calls ride with the draft, flagged for the
integration report: (1) the marker rides
schools-secondary places only — D51's text names the
secondary list, and primary places carry no marker
even where a primary-phase row files the flag (the
register files zero such rows at Primary phase today);
(2) flagged alternative-provision and pupil-referral
rows ride the category's flag clause, as the prep's
counted mainstream variant held them — D64's
exclusions do not name their types, and removing them
would need a ruling the prep did not seek.
