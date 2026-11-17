# M7.4 — Free results page (Design A tabs): build note

Built in the draft tree (`~/workspace/check-my-next-home-m73-draft`) on
top of M7.3, per D58. Nothing pushed; no brain file modified (the 48
contract pins stand); `.github/workflows/` untouched; the plan
untouched. Integration folds into the M7.3 integration operation
(VPS order → grouped push → CI browser job v2 → server stand-up →
play-server switch), after which this step's founder test list runs
on the play server and M7.4 ticks.

## What was built

- **Results derivation (serve layer)** — `checkResults(resolution)`
  in `lib/server/serve.ts`: the five bundles from the D29 cached
  brains (plus uncached sold prices, as before) and the SHORT bundle
  derived on read by the frozen `lib/short-bundle.ts`. No client
  bundle fetch exists; the results HTML is server-rendered from this
  derivation. `checkResultsWider(resolution)` builds the rung-3
  named-state short bundle through the plain brain builders (a
  rung-3 resolution never touches their sources).
- **View model** — `lib/results.ts` (pure, fully unit-tested):
  pill logic E2, the section-to-tab placement, per-group display
  counts and truncation lines, the warnings strip forms, the rung
  scope labels, the catchment honesty block text. Every decision
  the page makes is made here.
- **Renderer** — `components/ResultsPage.tsx`: summary strip,
  warnings slim line, the D9 short form verbatim, the three tabs
  through the kit's Tabs block, the closing disclaimer block at the
  very bottom. Plus the results styles in `app/globals.css`.
- **Routes rewired** — `app/search/home/page.tsx`: the checking
  screen's children are now a Suspense-streamed async server
  component rendering the picker (rung 2, at the head of the page
  under the label) + the results page; a derivation failure renders
  M7.3's WholeCheckFailure on the results route (D44(7)).
  Scotland/NI render the same results page under the not-covered
  heading + intro. `app/search/page.tsx`: the outward route renders
  the rung-3 form of the same page below the unlock banner.
  M7.3's holding rendering is gone (its constants remain in
  `lib/journey.ts` as that step's record; nothing renders them).

## Page structure and placement (as built)

Header (picked address, or the scope label) → summary strip →
live-warnings slim line (only when active; see ruling 1) → D9
short form → tabs → closing disclaimer block.

Tabs (fixed order) and sections, transcribed from the Final
Design's Section 6 tables and pinned in `tests/results.test.ts`:

1. **Family Checks** — Primary schools (nearest 2), Secondary
   schools (nearest 2, selective line, sixth-form flags),
   Sixth forms and colleges (nearest 3), School places &
   catchments (honesty block + GOV.UK link + served deadlines
   line), Nurseries & pre-schools (nearest 1), GP surgeries (1,
   CQC), NHS dentists (1), Pharmacies (1), A&E hospitals (1,
   CQC), Maternity units (1, CQC, beyond-nearest form), Air
   quality (NO2 headline), Noise (publisher bands, day and
   night), Crime (count + window + D39 calibration pair +
   basis line).
2. **What's Nearby** — nearest 1 of each kind: Stations, Bus
   stops, Supermarkets & food shops, Food & drink, Parks &
   greenspace, Vets, Pet shops, Pet boarding & kennels, EV
   chargers, Leisure & gyms, Places to visit, Places of
   worship, Libraries.
3. **Home, Costs & Risks** — Sold prices, Council tax, Energy
   (EPC), Flood risk, Planning applications (D31 hand-off),
   Planning constraints, Heritage, Nature & green space,
   Broadband (gigabit headline only).

Distances are colour-coded on the miles figure only, per group
family (schools/nurseries: green ≤1 mi, orange 1–2, red >2;
everyday: ≤0.5 / 0.5–1.5 / >1.5; hospitals: ≤5 / 5–10 / >10).
The design's green/red text colours are used (#14532d / #7f1d1d);
the orange is a readable amber in the same register (#9a6200) —
the kit's pill colours its figure uniformly and carries no
threshold form, so the thresholds live with this page.

## Pill logic E2 (as implemented)

- Slot 1: "Nearest primary {miles} mi" — unless a grammar
  (selective) school sits within 2 miles, when the grammar takes
  the slot: "Grammar school {miles} mi ★". (Fallback if no
  primary serves: the nearest secondary; the strip is omitted
  when the schools slot cannot be filled at all.)
- Slots 2–3, ranked: (1) flood — a covering High or Medium band
  on either likelihood check (rivers & sea / surface water; the
  planning flood zone never fires it): "Surface-water flood
  band: higher for this street" / "River & sea flood band:
  higher for this street"; (2) crime — the brain's served D39
  multiple ≥ 1.5: "Crime: {total} recorded in 12 months";
  (3) distance — nearest A&E over 10 miles, else nearest GP
  over 1.5 miles. Unfilled slots fall back in the design's
  order — "Flood: 2 separate checks", "Crime: 12-month
  counts", "Council tax: Band D averages {label} a year" —
  each subject at most once, and a subject whose data cannot
  serve the fact (flood/crime not covered or not filed) is
  skipped, which is the only path by which the council-tax
  fallback can fire.
- Slot 4: the nearest of vet, park or GP ("Park 0.32 mi");
  if none of the three serves any nearest, the nearest station
  or supermarket fills it.
- No colour on the pills (the kit's FactPill), no verdict
  wording, the asking price never a pill. Scotland/NI render
  no strip (flood and crime do not cover, so the middle slots
  cannot be honestly filled).

## The report route pinned for M7.6

**`/report`** (`REPORT_ROUTE` in `lib/results.ts`). Every
truncation line on the free page links here from this build, in
the design's exact wording — "Plus N more {group} in the
detailed report — £4.99", N = the served within-2-miles count
minus the number shown, per group; a group showing its full
served list carries no line. M7.6 adopts this route for the
report page; until then it is a labelled dead end of the same
kind the sample-report route was at M7.2. Rung 3 renders its
truncation lines as plain count lines with no link and no
£4.99 line at all (ruling 3: a partial-postcode visitor is
never offered a this-home report); rung 2 keeps the link (the
picker embedded at the head of its page is the identification
step the report continues from).

## Rulings as built

1. **Warnings short form** — a slim line directly under the
   summary strip, only when a warning is active (severity,
   area, official Check for flooding link). The D42 failure
   line ("Live flood warnings could not be checked just now")
   travels to the same slot in its own form; the no-warning
   line never leaves the flood section. In the flood section
   the block renders FIRST, in full form (severity, area, the
   EA message in full, raised stamp, attribution, official
   link), or as one of the two named empty states.
2. **Truncation lines** — as above; `/report` pinned.
3. **Rung 2 / rung 3** — rung 2's results header is the pinned
   "Postcode area — <postcode>, not one exact home" with the
   AddressPicker embedded at the head of the page under the
   label; rung 3 keeps "Wider area — E16, not this exact
   home". Below rung 1, address-level panels show the brains'
   "needs the full address" states (EPC, heritage at-point) in
   place of figures. No this-home report is offered for an
   unidentified home: rung-3 address-level panels carry no
   report link, and rung-3 area-level truncations render as
   plain count lines (in fact the rung-3 view renders no
   truncation lines at all — its lists are named states, so
   there is nothing to truncate).

## Gate (draft tree)

- `npm run prepush` — GREEN (format, lint 0 errors, typecheck,
  build). Vitest: **1,647 passed / 26 skipped** (M7.3's 1,619
  plus this step's 28 results tests).
- Playwright, full suite against the served app + seeded
  corpus: **39 passed / 0 failed, twice consecutively** —
  Smoke 7 (the home-page smoke, M7.3's three golden journeys
  re-pointed at the results page, this step's three golden
  results specs), Regression 32 (M7.3's 24, re-pointed where
  they named the holding page, plus this step's 8). No
  Regression spec was promoted (D68 clause 7).

## Local-gate seams (sandbox artifacts, all recorded)

M7.3's seams stand unchanged (flood-geometry loaders scoped out
of the local seed; Turnstile via the local stand-ins; PG_POOL_MAX
= 1; the E2E build carries the test site key). The local corpus
was reused as seeded at M7.3 (this step changes no schema or
data). New at this step:

1. **Noise not-filed E2E.** The authored Regression line "noise
   renders the named not-filed line" cannot pass on a golden
   page in any seeded environment: the fixture corpus files
   noise for the golden postcodes (the runner fixture pass
   files `load-noise` over `tests/fixtures/noise`), so golden
   pages serve bands. The not-filed rendering is proven
   instead in `tests/results.test.ts` through the same view
   model the page renders (and the Welsh not-covered line is
   proven on Cardiff's real page; Birkdale's page proves the
   served day/night bands). CI's corpus is the same fixture
   corpus, so this is a property of the authored line, not of
   the sandbox.
2. **Flood-warnings determinism.** Live warnings are composed
   fresh from the EA feed at every serve (D42) through the
   frozen brains — there is no fixture seam, and none was
   added (adding one would mean touching frozen code). The
   deterministic active-state proof lives in
   `tests/results.test.ts` (full form in the flood section
   with the EA message; short form as the strip, without it;
   absence when none). The E2E spec branches on the state the
   page actually serves (`data-warnings-state` on the flood
   section) and asserts the two forms agree with it. Locally
   the sandbox's egress cannot reach the EA feed, so the
   local run exercises the "unavailable" branch; CI will
   exercise whichever state is live.

## Deviations and judgement calls

1. **Sold-history tiles (B7 governs).** The brief's "four
   compact stat tiles" are the Final Design's tiles, but two
   of them (change since previous sale, time held) are the
   computed tiles the M6.23 sweep DROPPED (B7, folded as
   D43(7)/D69) under D23 — "none built on any surface". The
   step text's own check rule ("where the Final Design and a
   decision differ, the decision governs") resolves it: the
   sold section renders the short bundle's served facts only,
   in tile form — last sale (price + date, rung 1) and the
   postcode median (value, with its count-and-span line
   beneath) — and never computes a change, a hold period or
   a growth figure.
2. **Rung-2 scope label.** The results page header at rung 2
   uses ruling 3's pinned form ("Postcode area — CM3 2JT, not
   one exact home"), superseding M7.3's holding-page wording
   ("CM3 2JT — the whole postcode, not one home") on this
   page; `lib/journey.ts`'s `scopeLabelFor` is untouched and
   the M7.3 E2E assertions that named the old wording were
   re-pointed. The checking screen's own heading is
   unchanged.
3. **Disclaimer block variant.** The Final Design carries
   two website forms of the closing block; the pinned
   constant (`DISCLAIMER_CLOSING_BLOCK` in `lib/site.ts`) is
   the Stop W4 walkthrough form — the primary website
   journey's results page — transcribed verbatim, with its
   final sentence rendered as text + the "How we check" link
   (`/how-we-check`). The compressed step-3 mock variant was
   not used.
4. **School websites in the catchment block.** The sweep's
   block carries "each listed school's own website as
   filed", but the frozen nearby brain serves no website
   field at headline depth (school places carry no detail at
   this depth by design), so the block as built carries the
   honesty text and the GOV.UK school admissions link only.
   The same fold-in at M8.1(q) will need the report's own
   read of the filed websites.
5. **Nurseries display count is 1** (the Final Design's
   locked contents sentence: "the nearest nursery"), although
   the design's walkthrough mock illustrates two rows; the
   locked text governs, and the truncation line carries the
   rest.
6. **Noise renders from the full area section's bands** (the
   publisher's band text verbatim, day and night, per mapped
   source), per the step text — the short bundle's noise pick
   carries only the road day band, so the section reads the
   full section's own served lines, which are headline facts
   of the same section, not report depth.
7. **Flood section reads the full bundle for the warnings
   block** (the short projection deliberately drops the EA
   message); the layer lines render from the short bundle's
   picks. Crime likewise takes its calibration basis line
   from the full bundle's per-head block — the short section
   carries the pair but not their basis.
8. **Planning renders from the full area bundle's hand-off
   section** (line + official register link): the short
   bundle holds no planning key, and the hand-off is a
   headline-depth state by design (D31), carrying no data.
9. **Section explainers and source lines.** Each section
   renders its served lines plus its source line where the
   short shape (or the full section's meta) carries one; the
   long explainers are not rendered on the free page (they
   live on How we check and in the report).
10. **Suspense fallback** while the results derivation
    streams in behind the checking screen: one line, "Opening
    your results…". The checking screen still carries cold
    waits; the fallback shows only if the derivation outlasts
    the rows.
11. **Scotland/NI summary strip omitted** (see pill logic
    above), and the catchment block renders only where the
    brain serves a school deadlines line (England and Wales).
12. **Council-tax fallback pill wording** is composed from
    the short section's served Band D average label; the
    design names the fallback ("the council tax band") but
    shows no example pill for it.
13. **Crime threshold pill wording**: "Crime: {total}
    recorded in 12 months" — the design's rule is that the
    pill "states the count itself"; no example wording is
    shown for the crossed case.

## Founder test list (post-integration, on the play server)

1. **Birkdale CM3 2JT** (pick 19 Birkdale Rise): four pills
   (Nearest primary / Flood: 2 separate checks / Crime:
   12-month counts / nearest of Park-Vet-GP); Family Checks —
   2 primary + 2 secondary schools with green/orange miles,
   catchment block + deadlines line, GP with its CQC rating,
   crime 330 with the calibration pair; What's Nearby — one
   of each kind; Home tab — £588,995 last sale and median,
   council tax with the £190.03 monthly line, flood layers,
   gigabit headline.
2. **Exeter E16 1GN** (6 Exeter Road): crime 10,722 (1.3× —
   no crime pill fires; slots fall back), sold £270,000 /
   median £310,000, maternity Newham University Hospital
   inside 2 miles.
3. **Minerva KT17 1FH** (Flat 4, Minerva House): crime
   1,956, sold £420,000 last sale; on the seeded corpus the
   median serves its "too few for a median" line (the seed
   cut holds 2 sales for the postcode — the full-file
   median, £399,999 over 27, appears after a national Price
   Paid filing), NESCOT in Sixth forms and colleges.
4. **A golden with a higher flood band** — none of the three
   universal goldens crosses the flood pill threshold
   (Birkdale and Exeter have no band at the point; Minerva's
   surface-water band is Low), so the flood pill and the
   active-warnings forms are proven by unit tests with
   synthetic bundles, not by a golden journey. If a live
   flood warning is ever in force near a golden during
   testing, the slim line under the strip and the full block
   at the head of the flood section are the two forms to
   check.
5. **E16 wider area** (type "E16"): scope label, unlock
   banner, every section a named "needs an exact postcode"
   state, no £ figures from Exeter's home, no £4.99 lines,
   no /report links.
6. **CM1 6ER (Beaulieu)**: "Postcode area — CM1 6ER, not one
   exact home" with the empty picker embedded at the head of
   the results; CM3 2JT's postcode-level page shows the same
   label with the full picker — picking 19 Birkdale Rise
   upgrades in place.
7. **Cardiff CF11 8AA**: serves normally — Welsh deadlines
   line in the catchment block, noise "not covered" line,
   crime counts with no England calibration pair.
8. **Edinburgh EH1 1AD**: straight to "EH1 1AD is in
   Scotland" — the three tabs render with not-covered lines
   in place; no picker, no summary strip. (A typed EH1 1AA
   lands on the EH1 wider-area page — that postcode was
   terminated in 1996 and can never be filed.)
9. **Phone layout**: tabs wrap, place rows stack name /
   miles / rating lines, tiles stack, the strip wraps.
10. **Refresh + Back**: refresh on any results URL restores
    the same check; browser Back from a picked home returns
    to the picker with the pick retained and focused.
