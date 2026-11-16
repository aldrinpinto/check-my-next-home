# Backend report — D53 closure pass: M6 closes

The closure pass D53 requires before M6 can be ticked
complete: not a numbered step, a gate on the milestone's
Definition of Done. It runs once, after the last M6 step
(M6.34, head 6f26b9b; the canary env-wiring commit
1181e35 on top touches no product code). Four parts:
the golden replay extended to every brain and golden
home, the bundle contracts frozen as one set, the
test-gap audit, and this report. If any step is added
to M6 after this pass, the closure re-opens and runs
again before the milestone can be ticked.

## Premises checked (the first check)

- The replay stood at 24 cells, green at CI #190 on
  head 6f26b9b. Every cell was read against the
  M6.20–M6.34 additions list before anything was
  extended.
- The explainer census stands at 94 families / 61 hard
  in the register itself (tests/explainer-census.ts;
  the enumeration assertion at
  tests/explainer-census.test.ts:818 — rows 89–94 are
  M6.34's six destinations families).
- The bundle contracts stand at 48 pins
  (tests/bundle-contracts.test.ts, its re-pin records
  current through M6.34).
- Every golden value asserted by the extensions below
  was premise-checked against the filed source data
  through the real code — never copied from a prep or
  a fake-source suite: a scoped PGlite rehearsal filed
  the fixture corpus (postcode directory, schools,
  health, air, school destinations, AQMA, charging
  zones, Pollution Inventory — the CI steps' and the
  runner fixture pass's own filings for those loaders)
  and read every golden home's served secondaries,
  maternity category and air section through the real
  sources. The dump is the extensions' evidence base;
  the M6.34 lesson (a premise check that verifies only
  some of a golden's fields lets wrong values into
  tests) was applied field by field.

## Part 1 — Golden replay coverage

Coverage as found, step by step: crime calibration
(M6.20, D39) — replayed (per-head goldens, the England
embedding as an arithmetic identity on the excerpt);
brownfield, built-up areas, the four heritage layers
and EPC measures (M6.21, D41) — replayed in the
missing-layers cell; live flood warnings composition
and school deadlines (M6.22, D42) — replayed; CQC
ratings on GP, A&E and maternity rows (M6.25) —
replayed; EPC construction block (M6.26, D48) —
replayed verbatim; flood defences (M6.27, D49/D54) —
replayed, capped, as filed; climate outlook (M6.28,
D49/D55) — replayed per source in its own epochs;
AQMA (M6.30, D59) — replayed in all three states
(none / inside / nearest); charging zones (M6.31,
D61/D63) — replayed inside (ULEZ, Edinburgh LEZ) and
outside in the named-gap form; industrial sites
(M6.32, D60/D62) — replayed served, none-within and
not-covered for the three devolved nations, with the
flag-off short-bundle identity proven in the cell;
sixth forms (M6.33, D51/D64) — replayed (category
within and none-within with beyond names, the marker
true and false on the served secondaries); school
destinations (M6.34, D51/D65) — replayed, both stages
exact on the core three, the 16-plus filed-but-never-
served rule proven on NESCOT's place.

Two gaps were real, and both are closed by extension
(the replay now stands at 26 cells):

1. **Air yardsticks (M6.29, D50/D57).** The replay
   carried no air-specific assertion — recorded at
   M6.29 itself ("the replay contains no air-specific
   assertions and exercises air only through the
   shared shape pins and bundle builds") — so the
   yardstick block, M6.29's whole serving addition,
   had no real-source proof. The new cell asserts for
   each universal home: the served section's PCM 2024
   triple exactly (Birkdale NO2 8.150298, PM2.5
   7.124671, PM10 12.54823; Exeter 21.71409 /
   9.939679 / 16.97423; Minerva 12.49256 / 7.868347 /
   12.10357 µg/m³ — the matrix's locked triples, read
   back through the real source from the filed
   fixture squares), the pollutant order, each
   figure's D57 position (Birkdale below-both /
   between / below-both; Exeter between ×3; Minerva
   between / between / below-both), the summary lines,
   the basis line verbatim, one yardstick line
   verbatim, and the no-figure-in-the-prose
   invariant. Above-limit stands at ×0 on the real
   triples, as locked at M6.29; the above arm itself
   remains fixtured synthetically in the serving
   suite, where M6.29 put it.
2. **Maternity units (M6.24).** The CQC cell read
   maternity places for their ratings, but the
   category's own states had no real-source proof —
   above all Birkdale's beyond-nearest golden, the
   honest answer for a home with no unit inside the
   radius. The new cell asserts it through the real
   source (state none-within, countWithin 0, places
   empty, beyondNearest Broomfield Hospital at 5.89
   miles, the category line verbatim) and the within
   arm at Exeter (Newham University Hospital, 0.782
   miles, countWithin 1) and Minerva (Epsom General
   Hospital, 1.732 miles, countWithin 1) — the
   matrix's M6.24 goldens, premise-checked through
   the real source at this pass.

One named witness gap, closed by citation rather than
extension — the suppressed and no-row destinations
SERVING states have no replay witness, and none can
be honestly constructed from the filed corpus. The
closure rehearsal verified this directly: the fixture
filing carries exactly two suppressed rows (URN
105602 at KS4, URN 106004 at KS5, each cohort 1), and
neither school is a served secondary at any golden
home; Plashet School (URN 152267), the schools
fixture's genuine no-row secondary, files no
destinations row but stands outside every golden
home's served three, so the no-row state never
surfaces in a replay bundle either. Both states are
pinned verbatim in the serving suite
(tests/school-destinations.test.ts — the suppressed
wording per stage and the no-row wording, on the
prep's adopted D65 texts) and their filing side is
pinned in the loader suite
(tests/load-school-destinations.test.ts — Plashet
absent from the filing; both witnesses file
suppressed with cohort 1; suppression is
all-or-nothing). The position is recorded in the
replay cell's own comment and in the matrix's D53
entry, so the absence is a checked fact. Nothing at
M12 changes it: it is a property of the golden set,
not of production data.

States deliberately not replayed, each a named
judgment with its proof home — the replay corpus
files the current data, so time-relative and
empty-table states cannot occur inside it: crime's
stale window (state matrix, served last-good with
the stale line under a controlled clock); the flood
warnings could-not-check arm (state matrix — the
replay composes the warnings and none arms over the
real flood source); charging zones' full outside
line behind the open completeness gate and the
stale-set and unfiled-table not-covered lines
(tests/charging-zones.test.ts — the corpus files 11
of 12 schemes, so the gate cannot open inside it);
the not-filed family for AQMA, destinations,
defences and climate (the serving suites; the
contracts pins carry both blocks' not-filed forms);
sixth forms' not-filed state (state matrix, on the
schoolsFiled guard).

## Part 2 — The contract freeze, verified

The freeze is a verification, not a refactor: nothing
about the contracts changed at this pass.

- **The 48 shape pins stand.** tests/bundle
  -contracts.test.ts is green in the full suite at
  this pass, unmodified; its re-pin records run
  through M6.34 (one pin moved there, nearby.served,
  on the founder's D65 ruling) and every earlier move
  carries its authorising decision. The set M7 builds
  against is this set, whole.
- **The explainer census stands at its final count:
  94 families / 61 hard.** The enumeration assertion
  and both enforcement directions (every hard family's
  line present; the fail-closed leaf walk over every
  served bundle) are green in the full suite,
  unmodified.
- **The short-bundle identity proofs stand.** The
  short bundle's derivation is proven blind to every
  report-depth addition M6 made after the freeze:
  maternity (M6.24) and the sixth-forms category and
  marker (M6.33) by shape-identity tests in
  tests/short-bundle.test.ts; destinations (M6.34)
  in its suite; the industrial-sites block (M6.32) by
  byte-identity inside the replay cell itself, with
  the flag on and off. The twelve headline sections
  are the frozen twelve.
- Full local suite at this pass: see the Gate
  section. The replay's 26 cells are CI's to run (the
  suite skips without GOLDEN_REPLAY, by design); the
  two new cells and their neighbours were proven
  locally by the scoped rehearsal described in the
  Gate section.

**The freeze does not forbid M8.1's map re-pin.**
Named here as D66's watch item requires: M8.1 owns a
planned change to the nearby contract — the Section 5
map gains filed coordinates on the nearby answer's
named places (decision D48), and that step re-pins
the bundle contract when it lands, with its own
re-pin record, exactly as the authorised re-pins
inside M6 were taken (M6.20–M6.34 each moved pins on
a named ruling and recorded the move). The freeze
fixes the contract as it stands at M6's close — the
contract M7 builds against — it is not a ban on the
one named change M8.1 already owns.

## Part 3 — The test-gap audit

### (a) Every D30-family absence state is exercised

Enumerated by family, with the exercising tests
(verified at this pass against the suites as they
stand):

- **not-filed** — the state matrix is the family's
  home: nearby categories on an empty table (never
  an absence read from silence), the polygon layers'
  two-part form, heritage, nature (per-type guards),
  EPC's "could not be loaded" form, council tax's
  renamed not-filed family (D30/Q4), Census / IMD /
  air / noise / benefits section lines, building
  safety, company ownership, broadband and mobile;
  sixth forms on the schoolsFiled guard (state
  matrix); AQMA (tests/area-bundle.test.ts);
  destinations from the release read, never an empty
  table (tests/school-destinations.test.ts); flood
  per-layer (state matrix) and the defences and
  climate blocks' unfiled short-circuits
  (tests/flood.test.ts); industrial sites
  (tests/industrial-sites.test.ts — the D30 line,
  never a none read from an empty register);
  charging zones' unfiled table serves its not-
  covered line (tests/charging-zones.test.ts).
- **not-covered** — the replay's regional witnesses
  (Scotland, Northern Ireland, Mid Ulster, Wales)
  across sold prices, crime, flood, census and
  council tax; the state matrix's per-brain forms
  (each nation's own publisher or register named);
  industrial sites naming the Welsh, Scottish and
  Northern Ireland inventories in the replay cell;
  company ownership naming the nations' own
  registers, never a No.
- **suppressed** — destinations only, by design:
  serving wording verbatim per stage
  (tests/school-destinations.test.ts) and the filing
  side (tests/load-school-destinations.test.ts —
  all-or-nothing suppression; the two real witnesses
  file suppressed with cohort 1). The replay position
  is Part 1's named gap.
- **no-row** — destinations: the serving wording
  verbatim (tests/school-destinations.test.ts) on
  the genuine witness's shape; the filing side pins
  Plashet's absence (tests/load-school
  -destinations.test.ts).
- **named-gap** — charging zones outside any filed
  scheme while Portsmouth is unfiled: the replay
  cell serves the line at three homes, and the
  serving suite pins it verbatim with the gate's
  arms (open at 12 of 12 filed and ≤120 days, shut
  at 121) in tests/charging-zones.test.ts.
- **flag-off-absent** — company ownership with the
  shipped flag off: the section key does not exist
  (state matrix); industrial sites with the flag
  off: the key absent, the source never read, no
  served string naming the Inventory, and the short
  bundle byte-identical (tests/industrial-sites
  .test.ts and the replay cell).
- **stale** — crime served last-good with the stale
  line, counts never suppressed (state matrix);
  charging zones' complete-but-stale set serves
  not-covered — a negative that old is not proof
  (tests/charging-zones.test.ts).
- **could-not-check** — the flood warnings
  unavailable arm: a failed fetch serves its named
  line, never silence, never read as "no warning"
  (state matrix), beside the warnings and none arms
  the replay composes.
- The family's satellite states stand exercised
  beside them: handed-off (planning, per nation,
  state matrix and replay), sparse-coverage (Welsh
  and Scottish absences as coverage facts, state
  matrix), not-published-for-this-area (benefits
  Households, state matrix), loaded-none and
  filed-zero (sold prices and EPC, state matrix and
  replay), guarded (nature's per-type withholding,
  state matrix).

No hole was found: every family member has at least
one exercising test, and the two states without a
replay witness (suppressed, no-row) are the named
gap of Part 1, not an audit hole — their exercising
tests exist and are cited there.

### (b) The banned-wording scan

One shared union list (tests/banned-wording.ts, 49
terms — the per-brain lists of D23, D24, D25, D26 and
their successors, with the two ruled exceptions for
the valuation disclaimer and the gigabit figure),
imported by every scan since M6.10 unified it: the
short bundle's inherited scan, the SEO wording scan,
and the per-brain scans in the sold-prices, crime,
flood, state-matrix, charging-zones,
industrial-sites and school-destinations suites
(the last scans every served destinations line; the
charging-zones scan strips filed scheme names first,
with a test proving "clean air" survives only inside
them). The full suite is green at this pass, so every
scan passes over every served line it covers —
including the lines the two new replay cells pin.
No served string in any M6 bundle carries a score,
a verdict, a ranking or a banned comparative.

### (c) Gaps carried to M12.10, by name and clause

Nothing named as deferred by an M6 build is closed
by this pass — closure verifies; it does not file
national data. Every named gap carries to M12.10
under the clause that already owns it:

- **(a)** First national passes for the operator
  jobs: noise and priority habitats; the PVGIS
  solar national sampling pass (M6.19's list, from
  M6.5/M6.6).
- **(b)** The Article 4 publication-gate bridge —
  the platform organisation register filing; the
  same filing turns brownfield's supplier gate live
  (M6.19, M6.21). Until it lands, every council
  serves the not-published form through the real
  source too.
- **(c)** The real Connected Nations filing, closing
  the four M6.17 Ofcom golden gaps: no sub-100
  gigabit golden, no poor-coverage mobile council,
  no non-England mobile/broadband golden, the five
  unrecorded mobile service sets (M6.19).
- **(d)** Flood and production timing proofs: the
  flood layers' full-national filing timing, the
  priority-habitats national-volume timing re-proof,
  the M6.1/M6.2/M6.6 production timings from the
  VPS, and the flood warnings 2-second budget's
  production confirmation (M6.19, M6.22).
- **(e)** The council-tax spring pass for the ~305
  unfiled councils (M6.19).
- **(f)** The company-ownership exposure decision —
  HMLR's written clause-3.2 answer plus the
  founder's go; the flag stays off until both
  (M6.19).
- **(g)** The Stat-Xplore first national UC pull
  with the same-day LSOA count-band check
  (35,000–36,500) and the rejected-LSOA report
  (M6.20).
- **(h)** The late-M6 first production filings, each
  proven on the golden postcodes before its answers
  serve: flood defences (M6.27 — including the
  loader's first single-transaction national filing,
  which the local engine could not complete);
  climate by the route its first check settled
  (M6.28); AQMA boundaries (M6.30); charging schemes
  scheme by scheme against the completeness gate,
  with Portsmouth's boundary the named outstanding
  filing (M6.31, D63 — Bath's item stands
  discharged); the Pollution Inventory's first live
  filing (M6.32); the first destinations filing from
  the current DfE releases (M6.34 — also the real
  proof of the KS4 catalogue discovery path, whose
  fixture page is modelled, judgment J5 of that
  step); and the crime-national first fill (M6.20).
- **(i)** The Pollution Inventory licence re-rule
  (M6.32, D60/D62): the position as it stands at
  this pass — the EA's pointer reply received, the
  follow-up sent in the founder's approved wording,
  no objection received, the flag ON — is re-ruled
  and confirmed at M12 beside clause (f).

Carried to the M12 window without a clause letter,
named so they are not lost: the monthly canary's
probe set does not yet cover the M6.21 datasets
(brownfield, built-up areas, heritage layers) — the
loaders' golden checks and sanity bands are the
drift defence until a canary step extends the probe
set (M6.21); the health loader's first national
filing of the M6.24 service groups rides the
production runner like every national first fill
(M6.24); and two fixture-cut shapes from the M6.6
rehearsal (Exeter's ancient-woodland beyond form,
Hilgay's priority-habitat patch at 0.123 miles) sit
outside the cuts filed and await the national
filings, the brains' paths proven on the shapes that
are filed.

Closed since they were named, for the record: M6.24's
named follow-up "M6.25 serves the filed CQC ratings"
was built and ticked as M6.25; it is not carried.

## Gate

- Scoped local rehearsal (PGlite, the flood-wedge
  discipline): migrations 0001–0028 apply; the
  fixture corpus subset above files clean; the
  filtered replay run against it — the two new cells
  plus the AQMA, charging-zones, industrial-sites,
  sixth-forms, destinations and CQC neighbours —
  passes, 8 cells green through the real sources.
  The full replay file is not proven locally: its
  corpus's flood steps wedge this engine, and its
  beforeAll runs at the edge of its own 900-second
  hook budget here (a first filtered attempt timed
  out inside beforeAll at 900 s; the second, over
  the by-then-filed corpus, completed at 934 s) —
  CI's database job, on native PostGIS, is the full
  replay's proof, as at every prior step. One
  anomaly named: the rehearsal driver's first
  pollution-inventory step failed with a
  fixture-path error that no code in the tree emits;
  the identical command, run manually against the
  same engine, filed the fixture's 9 sites with
  golden checks OK, and the filtered proof then ran
  against that filing. Recorded as an environment
  anomaly of the local harness, not a product
  finding.
- `npm run prepush` green before the push: format,
  lint, typecheck, **1,556 tests passed / 26
  skipped** (the replay's 26 cells skip locally
  without GOLDEN_REPLAY, by design — the passed
  count is unchanged from M6.34's gate and the two
  new cells account for the two extra skips), build.
- The push carries exactly: tests/golden-replay
  .test.ts (two cells added, one comment), tests/
  golden-matrix.md (the D53 entry) and this report.
  No pin moved, no census row changed, no product
  code touched.
- CI and the practice runs for this push are read by
  the parent from the Actions page, as at every
  prior step.
