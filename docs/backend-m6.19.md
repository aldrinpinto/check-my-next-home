# Backend report — M6.19 consolidation and test-gap closure

The last step of M6. Every content step (M6.1–M6.18) was built
against fake sources plus one-off scoped rehearsals in scratch
folders. M6.19 audited the finished backend against the golden
matrix (tests/golden-matrix.md) and the state census
(tests/state-matrix.test.ts), plugged the gaps the audit found,
and converted the rehearsal proofs into committed tests that
run in CI from now on. No new features, no wording changes, no
new migration. `COMPANY_OWNERSHIP_ENABLED` in lib/site.ts is
untouched and still false (line 91; the flag-off shape is also
pinned by the new contract tests).

## What was added

1. **Golden replay** — tests/golden-replay.test.ts. Every
   golden home through every brain (address resolution,
   nearby, sold prices, crime, flood, the area bundle) plus
   the short bundle, through the REAL database sources
   (createAddressSource / createNearbySource /
   createSoldPricesSource / createCrimeSource /
   createFloodSource / createAreaSource) against the fixture
   corpus the CI database job files. It is wired to run in
   CI's database job as one added step after the greenspace
   filing (the wiring action below), gated on GOLDEN_REPLAY=1
   so the checks job and local `npm test` skip it. Its
   beforeAll performs the setup filings described in the
   file's header (real ONSPD Aug 2026 directory seeds from
   tests/fixtures/replay/directory-rows.json; the sold, crime
   and EPC loaders run through their real fixture paths for
   the homes the CI steps do not reach; the sold load stamps
   and the crime fixture shim that keep the loop hermetic;
   the two zero-crimes witness artefacts filed in the
   loader's write shape).
2. **Bundle-shape contracts** — tests/bundle-contracts.test.ts
   with tests/fixtures/replay/bundle-shapes.json. 43 pinned
   shapes across every bundle the website consumes: the four
   resolution rungs; nearby (served, beyond-only,
   none-anywhere, not-filed, rungs 3–4); sold prices (house,
   flat with building line, rung 2, too-few, loaded-none,
   not-covered, rungs 3–4); crime (served, served-stale —
   differing only in staleLine, as D29 requires — not-filed,
   not-covered, rungs 3–4); flood (mixed served layers,
   not-covered, rungs 3–4); the area bundle (richest rung 1,
   rung 2, the empty-source not-filed form of every section,
   Scotland rung 1, rungs 3–4, the tribunal-served form, and
   the three flag-on company-ownership forms); the short
   bundle at every rung plus Scotland. A shape change in M7
   fails here first, deliberately.
3. **The golden-set count, tidied.** The plan labels the set
   "14 homes"; the matrix's own recommendation says "12" while
   enumerating 13. The enumerated list is the authority and
   totals **15 homes**: the 3 universal (CM3 2JT, E16 1GN,
   KT17 1FH) + C1–C10 + KT22 8QA + the E16 1EG EPC guard. The
   replay carries those 15 plus five further witnesses:
   Cardiff doubles as C8 and the Welsh witness; EH1 1AD
   (Scotland — EH1 1AA was terminated in ONSPD in December
   1996 and never enters the filed directory; EH1 1AD is a
   live postcode in the same data zone, S01014710), BT1 1AA
   and BT45 6EB (Northern Ireland, the second carrying the
   Mid Ulster planning exception), CA20 1EX and LD5 4AD (the
   zero-crimes witnesses).

## The one remaining wiring action (parent, web editor)

.github/workflows/* cannot be pushed (the integration token
lacks workflow scope — the standing rule). The replay suite is
committed and proven locally against the scratch corpus — 11
of its 12 tests pass there; the flood test's fixture filings
are the one thing the local WASM engine cannot perform (the
standing flood wedge), so that test discharges in CI's PostGIS
job. The suite starts running in CI the moment one step is
added to ci.yml's database job, after the greenspace step:

```yaml
- name: Golden replay — every golden home through every brain (plan step M6.19)
  env:
    GOLDEN_REPLAY: "1"
  run: npx vitest run tests/golden-replay.test.ts
```

Until that step lands, the suite runs wherever GOLDEN_REPLAY=1
and DATABASE_URL are set (the local rehearsal pattern).

## Coverage map

Every cell below is asserted by the golden replay through the
real database sources, unless a basis is named. Local proof:
11 of the replay's 12 tests pass against the locally built
corpus (an 18-second run); the flood cells are the exception,
named at the end.

1. **Resolution** — rung 1 for the three universal homes
   (Minerva's Flat 4 resolving to the register's filed PAON
   "MINERVA HOUSE, 12", not a sibling building), rung 2 for
   every postcode-only home, rung 3 for the CM3 wider area.
2. **Crime** — the artefact locks reproduce exactly:
   Birkdale 330, Exeter 10,722, Minerva 1,956 (with category
   and monthly detail), Ewell Village 2,361, Hilgay 7, and
   Cardiff 7,287 from the M6.19 live capture. The zero
   witnesses (CA20 1EX, LD5 4AD) serve genuine zeroes, as
   counts. Scotland and Northern Ireland serve not-covered.
3. **Sold prices** — the universal locks reproduce on the
   fixture corpus: Birkdale £588,995 (15 Jun 2023), median
   £588,995 over 29 counted; Exeter £270,000 (17 Jan 2014),
   median £310,000 over 9; Minerva £420,000 (3 Dec 2019) with
   the postcode median in its too-few state on the excerpt
   (the full-register lock, £399,999 over 27, stands from
   M6.3). Beaulieu serves the loaded-none state.
4. **Area bundle** — council tax Band D reproduces to the
   penny (Braintree £2,280.34 with its £190.03 monthly line,
   Newham £1,944.23, Epsom and Ewell £2,530.84, Cardiff
   £2,013.18 with the Welsh Band I present); census median
   ages reproduce as the served calculated-figure object
   (46.5 / 33.4 / 44.5); EPC counts and spreads reproduce
   (Birkdale 42 = 38 predicted + 4 assessed, Exeter 12,
   Minerva 25 all predicted, Beaulieu 49 all predicted). The
   regional combinations serve as designed: Scotland and
   Northern Ireland take the not-covered section forms with
   their planning hand-offs (the NI register link present,
   Mid Ulster's exception linkless and named), Wales takes
   the GOV.UK hand-off with council tax served.
5. **Short bundle** — 12 sections at headline depth; the
   crime totals and the council-tax lines (with the
   "not this home's bill" correction inside the line)
   reproduce for the universal homes, and the not-covered
   states carry through for Scotland.
6. **Flood — asserted in the suite, discharged in CI.** The
   replay locks the three layers' distinct fixture-basis
   facts (Exeter FZ3 inside with RoFRS Very low inside and
   surface water below-low with Low under 0.02 miles away;
   Birkdale's three distinct absence states with their
   nearest edges; Epsom's FZ2 edge at 0.40 miles with
   surface-water Low at the point). The local corpus cannot
   file the flood fixtures — the flood loaders wedge the
   local WASM engine (the standing local limit) — so
   locally this one test serves not-filed where CI's corpus
   serves the filed facts. CI's PostGIS database job, which
   files all three flood fixtures in its steps, is the
   discharge route once the wiring step below lands.

## Gaps found and plugged

1. **No committed end-to-end replay existed.** The brains
   were proven against fake sources plus one-off scratch
   rehearsals that ran once and were gone. Plugged by
   tests/golden-replay.test.ts (item 1 above).
2. **No frozen bundle-shape contract for M7.** A renamed
   key or a dropped field would have reached the website
   silently. Plugged by tests/bundle-contracts.test.ts with
   its 43 pinned shapes (item 2 above).
3. **The replay's first assembly was not hermetic** — the
   brains loop triggered the brains' production first-check
   loads against live sources. Recorded as a bug below;
   plugged in the setup (load stamps; the crime fixture
   shim).
4. **The matrix's Scotland witness could never be served.**
   EH1 1AA was terminated in ONSPD in December 1996 and
   never enters the filed directory, so any real-source
   proof naming it was vacuous. The replay's Scottish
   witness is EH1 1AD, a live postcode in the same data
   zone (S01014710); the matrix is annotated.
5. **The golden-set count was tangled** — the plan's "14",
   the matrix recommendation's "12" over an enumeration of
   13, and the true 15. The enumerated list is declared the
   authority in the matrix and in this report.
6. **The crime fixture's points map was incomplete.** The
   Epsom, Ewell Village and Hilgay monthly captures already
   sat in the police-uk fixture but no point mapped to
   them, so no real-source run could file their artefacts.
   The replay's setup assembles them into its fixture copy.
7. **No Welsh served-crime golden existed.** Cardiff's
   artefact was captured live through the real loader at
   M6.19 (7,287, Oct 2025 – Sep 2026) and filed as a
   fixture in the loader's own write shape.
8. **Juno House is not a replay home — a named corpus
   limit.** The address fixture's Juno row carries blank
   sale fields by provenance design (no Juno sale is among
   the locked facts), and the sold loader's id-keyed merge
   cannot file two blank-id rows, so the corpus honestly
   holds no Juno row. The three-Flat-4s distinctness stays
   pinned where it was proven: M6.1's address tests over
   the fixture's address parts and the full-data rehearsal.
9. **The fake directories masked a real defect.** The unit
   suites' Scotland/NI directory fakes carry null MSOA
   codes; genuine ONSPD rows carry the nations' own
   intermediate-zone codes there. Every fake-based suite
   therefore exercised a directory form production never
   files — the seam the census bug below lived in. The
   replay's genuine directory rows are the standing guard.

## Bugs found

1. **Census served the wrong state for every real
   Scottish and Northern Ireland home (product — fixed).**
   buildCensus keyed its not-covered state on the MSOA code
   being null; genuine directory rows for Scotland and
   Northern Ireland carry S/N intermediate-zone codes in
   that field, so those homes served "not-filed" ("Census
   2021 figures are not filed for this area") instead of
   the designed nation-named "not-covered". Fixed in
   lib/area-bundle.ts: the not-covered state is keyed on
   the nation, the pattern IMD, benefits and council tax
   already used. The served shape is unchanged (no contract
   re-pin was needed), the unit suites stay green, and the
   replay's Scotland/NI cells prove the fix end-to-end.
2. **The replay would have cold-loaded live data (test —
   fixed).** The brains load a covered postcode on first
   check (the designed D23/D30 production behaviour). As
   first assembled, the setup left postcodes in the
   never-loaded state, so the loop fired those loads
   against the live register and Police.uk — the sold
   loads worst, because the standalone loader never writes
   the brain's load stamp (the brain's own on-demand load
   writes it in production). Fixed in the setup: every
   seeded England/Wales postcode the fixture file held no
   sales for is stamped in the brain's own stamp shape, and
   the crime source's loader path is pointed at the
   replay's fixture shim, so a first-check crime load runs
   the real loader over the assembled fixture dir and fails
   there — serving not-filed — for postcodes the fixture
   does not cover. No product code changed for this one.
3. **Two replay assertions misstated the served truth
   (test — fixed).** The census median age was asserted as
   a bare number; the served D37 shape is the calculated-
   figure object ({value, calculated, line}), and the
   assertions now read its value. Minerva's PAON was
   asserted in display form; the served part is the
   register's filed form, "MINERVA HOUSE, 12".
4. **Explained, not bugs.** Birkdale's recorded count is
   30 on the fixture corpus against the matrix's 31: the
   monthly update's deletion row removes No 39's
   category-B transfer, exactly as the loader's merge is
   documented to apply it (the counted median over 29 is
   unchanged). Minerva's postcode median stands in its
   too-few state on the excerpt corpus, which holds only
   the two golden KT17 rows; the full-register lock stands
   from M6.3. Both distinctions are asserted with their
   reasons in the test, not absorbed.
5. No other product bugs were found. The only product code
   changed in this step is the census fix in item 1.

## Still owed to M12 (this step does not close these)

1. National-volume and production timing proofs: the flood
   layers' full-national filing timing (M6.5), the PHI
   national-volume timing re-proof (M6.6), M6.1/M6.2/M6.6
   production timings from the VPS.
2. The Article 4 gate bridge — the platform organisation
   register filing (M12.10(b)); until it lands every council
   serves the not-published form through the real source too.
3. First national filings: the noise and priority-habitats
   operator passes, the PVGIS national sampling pass
   (M12.10(a)).
4. The four M6.17 Ofcom golden gaps (M12.10(c)): no sub-100
   gigabit golden, no poor-coverage mobile council, no
   non-England mobile/broadband golden, the five unrecorded
   mobile service sets.
5. The Stat-Xplore first national UC pull with its LSOA
   count-band check (35,000–36,500), from the VPS (M12).
6. The council-tax spring pass for the ~305 unfiled councils
   (M12.10(e)).
7. The company-ownership exposure decision on HMLR's written
   clause-3.2 answer plus the founder's go (M12.10(f)) — the
   flag stays off.
