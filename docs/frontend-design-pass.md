# D70 — Design-alignment pass (build note)

Built in the draft tree `check-my-next-home-d70-draft` (content of main at
302f3e6 plus this pass). Nothing pushed, nothing deployed, no plan files
edited. No brain files touched (the 48 contract pins stand), the golden
replay untouched, no M7.6 build (no buy-bar page, no /report — only the
pill buttons and the buy-bar panel pinned as kit blocks), no Scotland/NI
serving changes, no entry-point data changes.

Gate, all on the finished tree:

- `npm run prepush` green (format, lint — 0 errors, typecheck, tests,
  build).
- Full Vitest: 1,677 passed, 26 skipped (the golden replay skips locally
  without its database env, exactly as at baseline; CI runs it).
- Full Playwright (local seams harness, Turnstile seams on): 47 passed,
  twice in a row.

## What was built, per ruling

**R1 — Fonts.** Newsreader (display: h1/h2, brand name, manifesto head;
600/700) and DM Sans (text/UI; 400/600/700/800/900) are self-hosted as
latin-subset woff2 from the Fontsource npm packages (@fontsource/newsreader
and @fontsource/dm-sans, 5.3.0, SIL OFL 1.1). The seven woff2 files ride
the repo's binary-asset pattern: `.woff2.b64` sources in `public/fonts/`,
materialised by `scripts/materialise-binary-assets.mjs`, the decoded files
gitignored. `font-display: swap`; the system stack survives as fallback
only. Fluid scale: h1 `clamp(2.4rem, …, 3.2rem)`, h2 `clamp(1.9rem, …,
2.2rem)`, heading line-height 1.15. No Google Fonts hot-link anywhere.

**R2 — Hero.** Decided order: kicker (the manifesto line) → headline (D44)
→ sub-line → three captioned line-illustration panels → postcode box with
the example-check action → audience cards. The hero tagline line is
dropped (D20). Panels: "Moving-in day / Boxes in the hall, kettle on",
"Keys in hand / The first morning in the new home", "A dog at the door /
Pets are family too", reusing the existing card illustrations. The
example action is the design's white-outline "See an example check" beside
the box, pointing at the existing `/sample-report` route (D14).

**R3 — Cards + manifesto.** Audience cards are text-only: title + intro +
a four-item family-language check list, on `#fffdf9` with the soft
green-grey `#d6e2dc` border, design padding. The section heading and sub
are the decided landing page's ("Moving looks different for every family"
/ "Whoever is moving with you, we lead with the checks that matter to your
family's life there."). Manifesto: dark forest panel, left-aligned,
Newsreader head "A house is bricks. A home is family.", the manifesto line
in brass pale, and the why line verbatim from the chosen homepage frame:
"Every check on this page exists because a family will live with the
answer — the school run, the dog walk, the monthly bills, the street after
dark — long after the listing is forgotten."

**R4 — Family names.** The famNames panel is restored on the landing
(dashed brass border on `#fff8e1`): lead "On the homepage, checks speak
family language:", the six family phrases, and the muted note "Homepage
only — the panel and report keep their plain names." The "What it checks"
list is re-based on the plain check names (see judgement call 3).

**R5 — Pills, chips, tiles, tabs, pill buttons.** The summary strip gets
its band (`#fff3d6`, 1px `#e6d9a8`, radius 10px) with white pills. The pill
model changed from a plain string to label + figure: `summaryPills` in
lib/results.ts now returns `SummaryPill[]` (`{label, figure, band,
mark?}`), the figure renders as the tinted `.dist` chip coloured by its
own distance band, and `pillText` recomposes the served string — the
tests prove every composed string byte-identical to what the logic has
always served. Distance chips: `.place-row__miles` becomes the tinted
pill, class names `--green/--orange/--red` kept; orange corrected to
`#7a3a00` on `#ffe3b3` (F3). Stat tiles take the design's form (`#fffdf9`,
`#e2ddd3` border, uppercase letter-spaced muted label, 1.18rem weight-900
value). Pill tabs: cream-tinted bar, 1px `#ddd` on `#f4f4f0`, radius 999,
weight 800, active = ink fill + white text — CSS only, Tabs behaviour
unchanged. Pinned as kit blocks in the kitchen sink: the report pill
button, the shortlist pill button (white; saved state green tint
`#dff3e6`/`#14532d`, D16), the remove button, and the buy-bar panel form
(warm panel, brass-pale report pill + white shortlist pill) — blocks only;
the bar itself is M7.6's build.

**R6 — Picker.** Select-then-confirm: rows are buttons (not links), the
chosen row carries a ✓ tick and the selected tint, and a full-width ink
button "Check this address →" starts the check. The design's explainer
sits under the heading (adapted to address the visitor): "Schools and
flood are address-sensitive, so pick your exact house before anything is
checked." The build's count line (M7.3 fold-in) is kept. Hairline row
chrome. A returning visitor's pick is pre-selected, keeps `aria-current`,
and takes focus on return, as before (D44(5)(iii)).

**R7 — Grid.** Composed pages (landing, /search, /search/home, /shortlist)
take the wide container `--container-wide: 72rem` via `main--wide`; text
pages keep the reading measure `--container-reading: 44rem`. The
no-location fix route deliberately keeps the reading measure.

**R8 — Finish.** Graduated radius scale: inputs/buttons 8px, tiles 10px,
cards/buy bar 12px, manifesto 14px, pills 999px (tokens `--radius`,
`--radius-tile`, `--radius-card`, `--radius-panel`). Principal empty/edge
states get panel treatment plus small line-illustration reuse, with no
copy changes (D19). Hero field: inline-row variant — input and button
side by side at ≥30rem, stacked below — with the border softened to 1.5px
`#cdbd8a` (the decided page's field border). The generic TextField keeps
its stacked form and 2px ink border.

**Checking screen (D11 + founder ruling, 17 Nov).** The done state reads
"Done ✓" (rows and element sub-rows; the tick is in the word, never colour
alone). Three row qualifiers restored in lib/journey.ts: "Schools —
nearest primary & secondary, with Ofsted", "Shops & transport —
supermarkets, bus stops, stations", "Flood — rivers & sea, and surface
water". Minimum readable hold: rows still complete truthfully as the
brains resolve (no simulated staggering); once all rows are done, the
finished screen holds before the results open — the advance beat is tuned
800ms → 2,000ms.

**Search box shell (founder ruling, 17 Nov).** The box is built in its
designed form ready to host the D71 autocomplete dropdown: PostcodeBox
accepts an optional `suggestions` prop and renders the kit's
`SuggestionShell` (grouped AREAS / PROPERTIES listbox markup, the
dropdown's visual shell and states) when given any. No caller passes
suggestions and no address-data source is wired — that decision is priced
separately.

**Comparison (D17).** On wide screens the shortlist comparison is the
design's shared-label table: first column names each check once, one
column per home, a report pill button per column foot; flood/crime cells
stay pointers ("See this home's check"). On phones the proven block
stacking is unchanged. A `matchMedia("(min-width: 48rem)")` switch in
ShortlistPage renders exactly one form.

**Fold-ins.** F1: button weight 800 kit-wide (`.btn`); hover/focus states
re-verified after the font swap, and the full 360px suite (no sideways
scroll, ≥44px tap boxes, 16px input font) passes — the tab labels do not
wrap at 360px in the pill form. F2: brand name in Newsreader at 1.5rem in
header and footer. F3: orange correction (above). F4: strip/panel padding
from the design's measures (strip 12/14, tiles 10/12, cards 12/14,
manifesto 18/20, picker rows on the space scale). F5: docs/brand.md gains
the typeface entry; docs/frontend-m7.1.md's system-stack record is
annotated as superseded by R1, not rewritten. F6: deviations are named
below.

## Re-pins (each deliberate, with its reason)

Unit tests:

1. `tests/look-feel-kit.test.ts` — the type test now pins the DM
   Sans/Newsreader stacks, both @font-face URLs, `font-display: swap` and
   the fluid clamp sizes (R1 supersedes the system-stack pin); a new test
   pins the graduated radius scale and the three `.dist` pairings incl.
   the corrected orange (R8/R5/F3); the binary-assets test expects 11
   materialised targets (4 original + 7 fonts) and asserts wOF2 magic on
   every font; the pill test asserts the SummaryPill figure and fact
   forms. One pin targets the font stack value rather than the full
   declaration because Prettier wraps the declaration at the repo's print
   width — the stack itself is unchanged.
2. `tests/home-page.test.ts` — hero order now kicker < headline <
   sub-line < panels < box < example action, and the tagline is asserted
   absent (R2/D20); new pins for the three panels, the cards' intros and
   check lists verbatim, and the famNames lead/names/note verbatim (R3/R4
   — copy per judgement call 1); "What it checks" names asserted equal to
   the checking rows' labels (judgement call 3); the manifesto why line
   re-pinned to the chosen-homepage line (R3); the audience-card test now
   pins the design form (no button, no artwork) instead of the removed
   per-card button.
3. `tests/results.test.ts` — the pill-logic expectations recompose via
   `pillText` and stay byte-identical, plus new split assertions (slot 1
   label/figure/band; the grammar pill's figure, orange band and ★ mark;
   the A&E fallback's figure and red band) (R5); the rendered-strip test
   now pins the label span + tinted figure chip markup instead of the old
   "no colour on the pills" form.
4. `tests/journey.test.ts` — additions only: the nine checking-row labels
   with the three qualifiers, the picker explainer and the confirm label
   pinned verbatim (D11/R6).

E2E specs:

5. `e2e/home.e2e.ts` — smoke: tagline assertion replaced by its absence +
   the panels in the order map + the example-check link (R2); cards test
   re-pinned from the removed per-card button to the check-list form (R3);
   "What it checks" names re-pinned to the plain row labels (R4).
6. `e2e/journey.e2e.ts` — every picker interaction is now select-then-
   confirm (row button, then "Check this address") in the helper and all
   inline sites (R6); checking-row labels carry the qualifiers (D11); the
   Back test asserts the picked row as a pressed button (`aria-pressed`,
   `aria-current` retained, focus retained).
7. `e2e/results.e2e.ts` — the picker helper follows R6; strip selectors
   `.pill--fact` → `.pill--summary`, with the first pill's figure chip
   pinned to the served corpus's figure, 0.29 mi (the unit fixtures'
   fabricated bundle carries 0.44 mi; the served strip has always
   composed 0.29 mi — only the split is new).
8. `e2e/shortlist.e2e.ts` — picker helpers follow R6; the comparison test
   re-pinned from per-home columns to the desktop table (header cells =
   homes + 1, per-row cells, report pill per tfoot cell) (D17). The phone
   stacking is untouched and still covered by the 360px specs.
9. `e2e/kitchen-sink.e2e.ts` — the pill figure is now the SummaryPill chip:
   text "0.4 mi", colour rgb(20, 83, 45) on tint rgb(223, 243, 230) (R5/F3).

One specimen fix, not a re-pin: the sink's frozen-open suggestions shell
is absolutely positioned below its box (`top: 100%`), so the specimen
stage reserves the painted space with a bottom margin — as first built it
painted over the Tabs section below and intercepted its clicks (the
arrow-key spec caught it).

One gate-environment note: the local Playwright harness serves the
existing build via `next start`, and the Turnstile test site key inlines
at build time — the local gate therefore builds once with
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` set to Cloudflare's published test site
key, exactly as the CI browser job does. A build without it starts the
widget failed by design and every search blocks (ruling 5); that was the
whole of the first local run's failures, proven by the same tests passing
unchanged in the untouched M7.3 tree and in this tree after the rebuild.

## Judgement calls

1. **Card copy is the decided landing page's.** Where the decided page
   (13 Nov) and the Final Design mock differ, the decided page governs
   the landing: the cards' intros and all twelve check-list lines are its
   words verbatim.
2. **Manifesto form follows the brief's scope bullet** — dark forest
   panel, left-aligned, chosen-homepage why line — over the decided
   page's centred cream manifesto with its own why line. The specific
   instruction beat the general governance clause; the tension is named
   here for the founder to reverse if he prefers the decided page's form.
3. **"What it checks" re-based on the plain names** (R4's second option):
   the list keeps its gloss lines unchanged but names the nine checks by
   the checking rows' own labels, cross-pinned in tests against
   lib/journey.ts so the two can never drift.
4. **Cards drop both the icon and the per-card button** — the design's
   card is text-only in both sources; the artwork moved to the hero
   strip. AudienceCards is a server component again.
5. **The live shortlist button keeps M7.5's pinned words** ("Shortlist
   this home" / "Shortlisted — tap to remove", pinned by e2e) and takes
   only the pill form; the design's exact "♡ Shortlist this home" /
   "✓ Shortlisted — saved in your browser" texts appear in the
   kitchen-sink specimen of the pinned kit block.
6. **Picker heading kept.** The build's H1 narrows from the page's own
   street/building/postcode data; the design's "{postcode} — which
   address?" heading was not adopted. The design's explainer was added
   under the kept heading.
7. **PostcodeBox renders the field markup itself** (the kit field's exact
   classes, ids and aria wiring) because the row layout needs input and
   button as siblings; TextField is unchanged for every other field.
8. **DistancePill and FactPill are replaced by one SummaryPill** in the
   kit (label + optional tinted figure chip + optional mark); the sink
   specimens follow.
9. **Pill banding is computed at composition** via the existing
   `distanceBand` (slot 1 as "school", A&E as "hospital", GP and the
   slot-4 place as "everyday"); figure-less facts (flood, crime, council
   tax) stay whole-string labels. All slot logic and thresholds are
   unchanged — only the split is new.
10. **Fonts shipped at the weights the design uses**: Newsreader latin
    600 + 700 only; DM Sans latin 400/600/700/800/900.

## Deviations kept, for the founder to confirm (F6)

1. **The "Queued" checking state is not rendered.** All three brain
   calls fire in parallel, so no row is ever truthfully queued; rendering
   the design's third state would mean simulating it. Rows show Checking
   then "Done ✓".
2. **CHECKING_INTRO kept verbatim** ("Each check completes as its answer
   arrives — there are no artificial delays."). It speaks of check
   completion, which stays true; the readable hold sits after completion,
   before the advance. Flagged in case the founder wants the wording to
   acknowledge the hold.
3. **Picker H1** — see judgement call 6.
4. **Shortlist button glyphs** — see judgement call 5.
5. **Manifesto form** — see judgement call 2.
6. **Not built, as outside D70's adopted scope**: the decided landing
   page's "What we check for you" nine-tile grid, its "How it works"
   steps and its £4.99 report band. The landing carries the sections D70
   names; whether those three sections join them is the founder's call.
7. The single-scene `hero-moving-in.svg` illustration is no longer
   referenced by the home page (the three panel drawings replace it);
   the file remains in `public/illustrations/`.

## Follow-on (founder ruling, 17 Nov 2026): the sample's remaining sections

After the pass above was pushed (2831957), the founder ruled that the
landing must look exactly like the decided sample page, and that the
three sections D70 left unbuilt (deviation 6 above) join the landing,
with the manifesto taking the sample's form. Built in the same draft
tree; nothing pushed. The sample
(`goals/side-hustle-search/files/landing-page/landing-page.html`, with
its copy-decisions.md) is the authority for all four elements — form,
order and copy.

**What changed, per element.**

1. **Manifesto — rebuilt to the sample's form.** The dark Forest
   left-aligned panel (R3) is replaced by the sample's centred block
   on Cream, full column width: Newsreader head, the manifesto line
   in Forest at 600, the why line muted, centred, measure-limited.
   The why line is now the sample's verbatim — "Behind every check
   is a family's daily life — the school run, the walk to the park,
   the monthly bills. That's why we check what the listing doesn't
   tell you." — superseding the chosen homepage's line R3 carried.
   This reverses judgement call 2 above, at the founder's word: the
   sample governs the landing, manifesto included. (The headline
   stays Newsreader — R1 names the manifesto head as the display
   face's job; the sample mock predates the font adoption.)
2. **"What we check for you" tile grid — added** (components/
   CheckTiles.tsx, copy in lib/home.ts): the sample's nine white
   tiles — Brass pale line, 3px Brass top rule, tile radius, the
   sample's soft shadow — three to a row at desktop with equal
   heights, stacked on a phone. Heading, sub and all nine
   title/line pairs verbatim from the sample (which carries
   copy-decisions changes 1–8 as applied).
3. **"How it works" steps — added** (components/HowItWorks.tsx):
   the sample's four steps as an ordered list — the number in its
   Forest circle, title, line — wrapping from four-across to
   one-per-row. Copy verbatim (step 4 carries change 9).
4. **The £4.99 report band — added** (components/ReportBand.tsx):
   the sample's dark Deep Forest band, full column width — the
   report's contents line, the brass "See a sample report" action
   (a link to /sample-report, the route the sample's action names),
   and the price block (£4.99 in Brass; "per home · one-off" /
   "no subscription"). The band is a landing element, not the buy
   bar: it takes no payment and sells nothing on the page; M7.6's
   buy bar is untouched. Its focus outline takes the on-dark
   colour, as the footer's does.

**Placement.** The page order now runs: hero → audience cards →
family-names panel → tile grid → "What it checks" list → "How it
works" → report band → manifesto → sample-report section. The four
scoped elements keep the sample's relative order (grid → steps →
band → manifesto, the band immediately before the manifesto, as in
the sample); the elements D70 placed keep theirs. The two full-width
blocks (band, manifesto) reach the main column's edges by negative
margins, as the sample's run to its site column's; no sideways
scroll at 360px or desktop (verified numerically and in the 360px
suite).

**Re-pins (each deliberate, with its reason).**

Unit (tests/home-page.test.ts):

1. The manifesto why-line pin re-pinned to the sample's line
   (founder ruling; supersedes R3's chosen-homepage line).
2. The M7.2 absence pin — "no price or 'free' lines" on the
   rendered page — is retired for this page: the sample carries
   the £4.99 band and the steps' free-headlines line, and the
   sample governs. The disclaimer and placeholder absences stand.
3. New pins: the nine tiles verbatim in order; the four steps
   verbatim; the band's heading, line, CTA, price and price lines
   verbatim; a rendered-order pin (cards < grid < steps < band <
   manifesto) with the band's CTA href.

E2E (e2e/home.e2e.ts):

4. New Regression spec: the tile grid (9 tiles, titles in order),
   the steps (4, numbered 1–4, titles), the band (heading, £4.99,
   sample CTA href) and the centred manifesto (the sample's why
   line, text-align center).
5. The existing SAMPLE-link locator gains `exact: true`: the
   band's "See a sample report" is the same accessible name up to
   case, and Playwright's default matching is case-insensitive —
   the pin is case-sensitive so it stays unique. (The new spec
   scopes its own locator to the band.)

**Gate, on the finished tree (follow-on included).**

- `npm run prepush` green (format, lint — 0 errors, typecheck,
  tests, build).
- Full Vitest: 1,681 passed, 26 skipped (baseline 1,677 + 4 new
  pins; the 26 skips are the golden replay, env-gated locally as
  at baseline).
- Full Playwright (local seams harness, app built with the
  published Turnstile test site key inlined): 48 passed, twice in
  a row (baseline 47 + the new home spec). Zero flaky.

**Sample comparison (done after building, section by section,
against the sample at desktop and 360px).** Hero: composition as
D70 left it (see flags). Audience cards: match. Tile grid: match —
form, order, copy. "How it works": match. Report band: match.
Manifesto: match — centred on Cream, the sample's three lines.
Footer: see flags. Section grounds: the sample alternates white
and cream section grounds; the build's page ground is white
throughout (the D70 language), so the tiles and steps sit on
white and Cream is carried by the manifesto block, as the
sample's own colour blocks are (band Deep Forest, manifesto on
the cream ground).

**Flagged for the founder — visible divergences outside this
follow-on's scope (recorded, not fixed).**

1. **Header.** The sample's header nav reads "How we check ·
   Sample report · About" with a "Check a home" button; the
   build's header (M7.1's) reads "How we check · Guides · Sample
   report · Shortlist" with no button.
2. **Hero furniture.** The sample's hero is the search row alone
   (brass "Check this home" button) over a small line — "Free
   headlines for every home, from named official sources.
   Detailed report £4.99 — one home, no account, no
   subscription." The build's hero carries D70 R2's three panels
   and M7.3's labelled box ("Check a home") with the
   example-check action, and no small line.
3. **Footer.** The sample's footer carries a third element —
   "Data from named official sources. Facts, not scores." — the
   build's footer (M7.1's) does not.
4. **Two check tours.** The landing now carries both the sample's
   tile grid and D70's "What it checks" plain-names contents list
   (kept unchurned, per this follow-on's scope). If the founder
   wants one tour, the list is the candidate to retire.
5. **Two sample doors.** The band's "See a sample report" and the
   pre-existing sample-report section both lead to /sample-report.

## Founder test list (play-server visual pass)

1. Landing on a phone and a desktop: font loading and swap (Newsreader
   headlines, DM Sans text), hero composition — kicker, headline,
   sub-line, the three panels with captions, box + "See an example
   check", cards.
2. Audience cards: intro + check lists read well; manifesto panel
   (dark, left-aligned) and the famNames panel sit comfortably in the
   page rhythm.
3. A full check (CM3 2JT, 19 Birkdale Rise): the picker — select a row
   (tick + tint), change your mind, then "Check this address →"; the
   checking screen — rows complete as answers arrive, "Done ✓", and the
   finished screen holds about two seconds before results open.
4. Results: the summary strip's cream band and white pills; miles
   figures as tinted chips (green/orange/red); pill tabs — ink active
   state, and at 360px the three tab labels on the cream bar.
5. Shortlist: the pill button's saved (green) state; on desktop the
   comparison table (check names down the side, report button under
   each home); on a phone the stacked blocks as before.
6. Empty states: a fresh shortlist (dog illustration panel), a postcode
   with no listable addresses, the wider-area page.
7. Kitchen sink: the new blocks — pill buttons + buy-bar panel, the
   suggestions shell specimen, the summary pill forms.

## TEST strip retired for a corner label (founder ruling, 17 Nov 2026)

The founder, evaluating the new design on the play server, ruled
the M2.8 TEST strip off the page: the amber bar ("TEST SITE — not
the real service") sat across the top of every page and spoiled
the look-and-feel pass. The gate is unchanged — the marker shows
on every environment except production, driven by
NEXT_PUBLIC_SITE_ENV exactly as before — but its form is now a
small black text label, "Test site", in the page's top-right
corner, and nothing more.

**What changed.** lib/site.ts: TEST_BANNER_TEXT / showTestBanner
renamed to TEST_LABEL_TEXT ("Test site") / showTestLabel, with the
ruling recorded at the constant. app/layout.tsx renders a
.test-label div under the same gate, first in the body as the
strip was. app/globals.css: the .test-banner block (amber
background, centred bold text, layout space) is replaced by
.test-label — position absolute at the document's top-right
corner (0.5rem / 0.75rem offsets), black, 0.75rem, pointer-events
none, so it takes no layout space, never intercepts a click, and
scrolls away with the page corner it marks. The functional-colours
comment in globals.css no longer cites the strip's amber, and the
one pattern reference in lib/area-bundle.ts's comments names
showTestLabel now. Historical build notes (docs/frontend-m7.1.md)
keep their strip prose untouched — they record their own time.

**Re-pins (each deliberate, with its reason).**

1. tests/site.test.ts — the M2.8 describe is re-pinned to the
   label: the wording pin now holds "Test site", the three gate
   pins call showTestLabel with unchanged expectations, and the
   block carries the ruling as its decision record (the D38/D44
   pattern). Reason: the pin change IS the ruling landing; the
   gate's behaviour did not change, only the marker's form.
2. e2e/kitchen-sink.e2e.ts — the render spec's strip assertion
   (.test-banner with the old text) is re-pinned to .test-label
   with "Test site", its comment updated to name the ruling.
   Reason: the spec proves the play build carries the marker and
   the site shells; the marker's selector and text are what the
   ruling changed.

## Fidelity pass 2 (founder, 17 Nov 2026): the sample, matched exactly

The founder compared the play site against the decided landing
sample (~/workspace/goals/side-hustle-search/files/landing-page/,
as updated by his rulings of the same day) section by section —
top, audience cards + tiles, how-it-works → footer — and produced
a 31-item fault list, look and feel only. This pass closes all
31 for the landing page and the shared header/footer, taking the
sample's ACTUAL CSS values (colours, measures, spacing, radii,
weights) from the file rather than by eye. Two founder rulings
ride with it: the header nav gains Shortlist and loses the
"Check a home" button IN THE SAMPLE FIRST (already applied
there), and the founder's own postcode/address never appears in
visitor-facing copy — the neutral example is SW1A 1AA.

**The 31 items, as closed.**

Top section:

1. Page background Cream — the home page's column and the page
   behind it are #FDF8E8 (body:has(.main--home)); the hero no
   longer sits on white.
2. Header rules — the 3px Brass bottom rule is gone; the header
   carries the sample's own edge: a 1px Brass pale line
   (#E4CF9A) with its soft shadow (0 1px 5px rgba(30,64,44,.08)).
   Nothing above the header.
3. Header nav — exactly "How we check · Sample report · About ·
   Shortlist", regular weight, Forest, 13.5px, 22px gaps; no
   "Check a home" button. The Shortlist link keeps its live
   count badge. Site-wide (shared header): D44's Guides item is
   superseded for the chrome — it returns when guide pages
   exist; the guides' SEO entries in lib/seo.ts are untouched.
4. Wordmark tagline — uppercase, letter-spaced (0.4px), Brass,
   semi-bold, 11.5px, in header and footer alike (the footer's
   at its 11px).
5. Eyebrow (hero kicker) — Brass, uppercase, tracked (0.096em,
   the sample's 1.2px at its size), 12.5px, weight 700. (D70 had
   set it Forest on a contrast argument; the sample sets it
   Brass on Cream and the sample governs.)
6. Hero headline colour — Deep Forest #1E402C.
7. Hero headline measure — max-width 600px, 34px, line-height
   1.18: it wraps as the sample's does, in the narrow column.
   The face stays Newsreader (the Final Design's display face;
   the mock's system stack is a mock artefact) at its heaviest
   loaded weight, 700 — the sample's 800 exists only in DM Sans.
8. The three story panels are REMOVED from the landing
   (components + styles + the HOME_HERO_PANELS constant). The
   illustrations stay in public/illustrations — the dog still
   serves the shortlist's empty state — and their stroke
   guard stays in the tests.
9. Hero search furniture removed — no visible "Postcode or
   address" label, no hint line, no "See an example check"
   button. PostcodeBox gains a `bare` prop (the hero's form);
   the label survives visually hidden as the field's
   accessible name. The standard form serves the journey's
   retry surfaces unchanged in structure.
10. The hero input starts EMPTY with the placeholder "Enter a
    postcode — e.g. SW1A 1AA" (the sample's words, at its
    14.5px and padding, placeholder in its faint tone #7A8272).
    Fully functional: entry, the autocomplete shell seam,
    Turnstile and submit are the same code path as before.
11. The hero button is BRASS (new kit variant .btn--brass /
    Button variant "brass") with the words "Check this home".
12. The small line is IN, verbatim, under the search row:
    "Free headlines for every home, from named official
    sources. Detailed report £4.99 — one home, no account, no
    subscription." (HOME_HERO_SMALL_LINE), 12.5px in #7A8272.
13. The landing's measure is the sample's throughout: the
    .main--home column is 63.75rem (the sample frame's
    1020px), sections padded 34px / 30px; on this page only,
    the header and footer inners take the same column (body:has
    rules) so the chrome aligns with the content as in the
    frame. Other pages keep the wide container.

Audience + tiles: 14. Section backgrounds alternate as the sample: the audience
section and "How it works" are white panels (Brass pale top
and bottom lines) over the Cream page; the tile grid sits
on Cream. .home-section--alt carries the panel form. 15. Section headings — DM Sans bold, Deep Forest, 22px, the
sample's 6px under-margin (scoped to the landing; the kit's
Newsreader h2 stands elsewhere). 16. Section intro lines — the sample's grey #5a6b5e at 14.5px /
1.5 with its 20px under-margin (new token --colour-sub). 17. Audience cards — Cream-filled, 1px Brass pale border, tile
radius (10px), 18px padding. 18. Audience card titles — Deep Forest, 16.5px, sans bold,
8px under-margin. 19. Card body — 13.5px / 1.55 in the sample's soft grey
#40513f (new token --colour-body-soft), bullets at the
sample's 17px indent with no per-item margins; card grid
gap 16px. 20. The family-names panel is REMOVED from the page entirely
(markup, styles, constants) — it rendered an internal
annotation as page content. The --colour-fam-bg token stays
in the palette block as a palette record. 21. The tile grid keeps its form (white tiles, Brass top edge)
on the Cream band with the corrected heading/intro; its gap
(14px) and line (12.5px in --colour-sub, title under-margin
5px) take the sample's values.

How it works → footer: 22. The "What it checks" ruled list is REMOVED (markup, styles,
constants, pins) — the tile grid is the landing's only tour
of the checks. The follow-on note above had flagged the two
tours and named the list the retirement candidate; the
founder's list settles it. 23. "How it works" heading — the landing's DM Sans Deep Forest
section form (item 15). 24. Step titles Deep Forest at 15.5px; step text 13.5px / 1.55
in #40513f; the section intro grey (item 16); the number
circle's under-margin is the sample's 9px. 25. Step columns — flex at the sample's 200px basis with its
16px gap: the steps wrap as the sample's do. 26. Report band heading — Cream DM Sans bold 22px (the landing
h2 rule carries face/size; the band's rule carries Cream). 27. Report band layout — the sample's proportions: text column
flex 2 (280px basis, its paragraph capped at 560px, 14.5px
/ 1.55), the price block flex 1 centred; band padding
36px / 30px, gap 26px; the action at the sample's padding,
15px and 12px top margin. 28. The band is INSET: the negative-margin bleed is gone — it
spans the page's own column with the Cream around it, as
the sample's band sits in its frame. 29. Manifesto — a full-width Cream band (the page's own Cream;
no panel of its own, no negative margins), centred, at the
sample's 44px / 30px padding. 30. Manifesto headline — DM Sans, 27px, weight 800, Deep
Forest; its line Forest semi-bold at 16.5px; the why line
14px / 1.55 in --colour-sub at the sample's 620px measure. 31. Footer — the sample's three-part row at its padding
(26px / 30px): the wordmark block (name Cream at the
sample's 14.5px; tagline uppercase, tracked, Brass at
11px), the middle links as one line — "How we check ·
Sample report · About · Contact" (the footer's own list
now, FOOTER_LINKS in components/SiteFooter.tsx; no
Shortlist there, per the sample) — and the right-hand
line "Data from named official sources. Facts, not
scores." (FOOTER_SOURCES_LINE), the row at 12.5px in Brass
pale on Deep Forest. The footer's top margin is zeroed on
the landing only, so the footer meets the page as the
sample's meets its manifesto.

**Postcode rule (founder, 17 Nov 2026).** CM3 2JT / Birkdale
Rise appear nowhere in visitor-facing copy. Changed: the box's
hint (lib/home.ts — "For example, SW1A 1AA — or the full
address, with its postcode."), the box's standard placeholder
("SW1A 1AA"; the bare placeholder is item 10), the no-location
line (lib/journey.ts NO_LOCATION_LINE — "for example SW1A
1AA"), and the kitchen-sink specimens (the field specimens and
the suggestions shell's specimen entries — Westminster /
Parliament Square forms). Internal test fixtures and the
golden corpus (seeded data the journey specs exercise) are
not copy and are untouched.

**Re-pins (each deliberate, with its reason).**

1. tests/home-page.test.ts — the box furniture pin (the hint's
   example; new pins for the bare placeholder and button);
   a new pin for HOME_HERO_SMALL_LINE; the hero-order pin
   (panels + example out, small line in, with absence
   assertions for both retirements and the two removed
   sections); the family-names and "what it checks" pins
   retired with their sections; the manifesto position pin
   re-anchored on the tile grid; a new bare-box render pin
   (visually-hidden label, no hint, Brass button); the
   illustrations guard re-based on the assets' literal paths
   (the panels constant it iterated is retired; the guard's
   subject — the kit's illustration language — is not).
   Reason: the pins change because the founder's list changes
   the page; each pin now holds the sample's form.
2. tests/look-feel-kit.test.ts — the navigation pin (the
   sample's set and hrefs; /guides asserted absent) and a new
   footer pin (middle links + the sources line). Reason: the
   chrome is the sample's now; D44's set is the superseded
   record, kept in the test's comment.
3. e2e/home.e2e.ts — the smoke spec (panels/example out; the
   order assertion re-based; the small line asserted) and the
   box regression spec (re-pinned to the bare form: no hint,
   visually-hidden label, the sample's placeholder, "Check
   this home"); the cards spec's comment (the art reference);
   the "what it checks" spec retired with its section.
   Reason: the specs prove the landing's served form, which
   is the sample's form now.
4. e2e/journey.e2e.ts — searchFromHome and the robot-check
   spec click "Check this home" (the landing button's new
   words); the no-location spec gains the standard form's
   label/hint assertions and the line's neutral example.
   Reason: the flows start from the landing's box; the
   standard form's pins move to the surface that serves it.
5. e2e/results.e2e.ts — searchFromHome clicks "Check this
   home". Same reason as 4.
6. e2e/kitchen-sink.e2e.ts — the nav text pin (the sample's
   set). Reason: the shell it proves is the changed chrome.

**Kept, deliberately (flagged for the founder, not silently
decided).**

- The hero headline's face is Newsreader 700, not the mock's
  system sans at 800: the mock's stack is a mock artefact, the
  Final Design's display face is Newsreader, and DM Sans 800
  is loaded if the founder wants the headline in the text
  face too — a one-line change either way.
- The header keeps a 1px Brass pale bottom line + soft shadow
  because the SAMPLE carries exactly that; the founder's item
  2 ("no brass hairlines") is closed against the 3px rule that
  was actually built, not against the sample's own edge.
- The sample's kicker drops the manifesto's full stop; the
  product renders the D12 manifesto constant (with its stop)
  as both kicker and manifesto line. Copy, not look — left as
  the constant pins it.
- The footer keeps the reversed Roof-Tick mark beside the
  wordmark; the sample's footer carries the wordmark alone.
  The mark is the M7.1 brand pairing, pinned as such; removing
  it was not in the 31.
- The closing sample-report section (M7.2's "See a full
  example") is not a sample element — the sample's sample door
  is the band's action — but it was not in the 31 either, and
  the follow-on note had already flagged the two doors for the
  founder's call. It stays until he rules.
- The TEST label (previous section) is untouched: it still
  rides at the page's top-right corner on non-production
  environments.

### Verification (measured, not eyeballed)

The built home page and the sample were rendered side by side
in the same Chromium at a 1400px viewport and probed for
computed styles and geometry. Colours, font sizes, weights,
paddings, radii, borders and shadows match the sample's values
throughout; the content column measures 1020px against the
sample column's 1018px (the sample carries a 1px frame border
each side). The report band measures 252px tall against the
sample's 251px — the remaining pixel is the CTA's 44px
tap-target floor against the sample's 43px button. The search
row measures 45px against the sample's 42px for the same
reason: the kit's 44px tap-target floor plus the field's 1.5px
borders, where the mock's controls are 42px. The header
measures 4px taller than the sample's for the same floor on
the nav links. Text wraps differ by a line here and there
inside the audience cards because the product's text face is
DM Sans and the mock's is the system stack — the mock's
geometry, not its typeface, is the authority carried into the
build.

## Fold-in build (17 Nov 2026) — D73 / D75 / D76 / D77, calculators, Scotland gating

One stacked build on top of fidelity pass 2 (083b640), matching
the finalized samples in the Final Sample Master (samples-first
rule), with the real wiring behind them. Seven workstreams:

1. **Checking screen → D73** (lib/journey.ts,
   components/CheckingScreen.tsx). The screen is now a pure
   graphic with a purposeful delay, NOT synced to the backend:
   exactly five grouped rows (Schools & nurseries · Health & the
   everyday · Safety & surroundings · Costs & connections · Past
   sales & prices) with the pinned qualifiers, under the pinned
   heading "Your check is under way" and the pinned sub-line
   "We present the facts — the decision is yours." Each row's
   spinner flips to "Done" on the graphic's own clock (~720ms
   apart); the progress bar at the top advances 20% per row;
   there is no button, no replay, no resting state, and no
   failure or not-completed state ever (the Results page carries
   any "couldn't pull" states). **D73 wiring reconciliation:**
   the graphic ticks on its own clock; the advance happens when
   the graphic has finished AND the real check calls have
   settled (the same three /api/check calls, which warm the D29
   cache the server-rendered results read), whichever is later,
   plus ~600ms after the fifth row. A failed call counts as
   settled — the visitor never sees a failure state here. This
   supersedes the M7.3/D70 truthful-ticking presentation (nine
   rows) and the 2,000ms readable hold.
2. **Results page → the finalized sample** (lib/results.ts,
   components/ResultsPage.tsx).
   - **D75 pill system** in summaryPills: five pills; concerning
     facts first in priority order (max three), good facts fill
     the remaining slots in priority order; "neither" facts
     never take a pill. The twelve factors in priority order:
     Flood (concerning if either check is Low or worse; good if
     both Very low) · Crime (vs the England per-1,000 figure) ·
     Schools merged (concerning if primary >1 mi or secondary
     > 1.5 mi; good only if primary ≤0.5 and secondary ≤1) ·
     > A&E (>7 / ≤5) · Air quality (WHO 2021 10/5/15 good; UK
     > legal limits 40/20/40 concerning) · Noise (both road and
     > rail in the lowest bands good; day ≥65 or night ≥60
     > concerning) · Deprivation (decile 8–10 good, 1–3
     > concerning, pill states the decile) · EPC (A/B good, D or
     > below concerning, C neither, only with a certificate) ·
     > Vet (≤2 / >5) · Broadband (no superfast concerning, full
     > fibre good) · Train station (≤1 / >3) · Nurseries (>1 /
     > ≤0.5). Grammar-school distance and leisure/parks/shops are
     > NOT pill-eligible. The Birkdale worked example holds in
     > tests: only Schools is concerning, so the strip reads
     > Schools · Flood · Crime · Noise · Deprivation.
   - **D76 four tabs**, fixed order: Family Checks (Primary
     schools · Secondary schools · Nurseries · Pets) · The
     Neighbourhood (The neighbourhood in numbers · Crime · Air
     quality & noise) · Home, Costs & Risks (Sold history ·
     Costs · Flood · Planning, protection & ownership) ·
     What's Nearby (Health · Hospitals · Parks · Shops ·
     Transport · Food & drink · Leisure · Places to visit ·
     Places of worship & libraries), always last. Tab state
     stays out of the URL; Family Checks opens by default;
     calculators sit below the tabs.
   - **D77 clauses.** (a) Crime serves the percentage form
     ("about 45% below the England average" style) with the
     calibration pair beneath; no crime types on the free
     page. (b) The line under the Results heading is the
     manifesto line "For the family who'll live there — not
     just the buyer." (c) Absence/failure copy: not-covered —
     "[Check] isn't part of this check in [nation] — the
     figures we use cover England and Wales."; couldn't-pull —
     the section keeps its heading with "We couldn't pull this
     just now — the rest of your check is below. Try again in
     a little while." plus a Try again link re-running the
     page (and so just that section's fetch); not-published
     states keep their existing named lines. (e) The census
     headlines block "The neighbourhood in numbers" sits in
     The Neighbourhood tab, its four labelled lines composed
     from the served Census tables + IMD decile, with the
     finalized small print. (d) The "Owned by a company" row
     renders ONLY from the served bundle key
     (area.sections.companyOwnership), which is absent while
     COMPANY_OWNERSHIP_ENABLED is off — asserted in tests both
     ways.
   - **Upsell trims (alignment F1/F3):** the schools upsells
     promise the schools with Ofsted ratings and inspection
     dates (and sixth-form provision for secondaries) — never
     "full Ofsted reports", "ERA detail" or "admissions
     deadlines"; the nurseries upsell promises the fuller
     nursery list — never "Ofsted outcomes and dates".
   - **Founder flood ruling (17 Nov 2026, alignment F4,
     softened form adopted):** the buy-bar line and the flood
     upsell do NOT promise flood map pictures. Buy bar:
     "Everything behind the headlines — the breakdowns, the
     flood findings with location maps, the fuller EPC detail
     and the questions to ask the seller — in one dated,
     print-ready document. Or save this home and compare it
     first." Flood upsell lead: "Plus the flood findings in
     full, with a location map for each check"; its detail line
     (defences, and how the picture changes in the years ahead)
     is unchanged, since defences and climate ARE served.
3. **Calculators (M7.10 as amended)** (lib/calculators.ts,
   components/Calculators.tsx): "Could this home fit your
   life?" below the tabs. Mortgage pre-fills from the home's
   own last recorded sale price with a 25% deposit (Birkdale:
   £588,995 / £147,249 / £2,455 a month on a £441,746 loan at
   4.5% over 25 years); stamp duty pre-fills the same price,
   framed "On the price this home last sold for, the stamp
   duty would be £X — put in the price you'd actually offer,
   and it moves with you."; buyer choices "Our first home ·
   Moving from our home (default) · Buying another home as
   well"; result "£X on top of the price."; rates line
   "England & Northern Ireland rates from 1 April 2025 —
   GOV.UK" in small print. No-sale homes: the box starts
   empty, framed "Enter the price you're considering." Always
   editable; nothing typed is stored; no asking price is ever
   read. Test T-WEB-12 in tests/calculators.test.ts.
4. **Header gains Contact** (D77(g)): nav is now How we
   check · Sample report · About · Shortlist · Contact. The
   footer set is unchanged.
5. **Landing:** the "See a full example" section is removed
   entirely (heading, line and "See a SAMPLE report" link).
   The report band's own sample door remains.
6. **Scotland/NI nation gating** (lib/results.ts only — the
   presentation layer, per the banked gap check): gated
   categories render the D77(c) not-covered line and are
   removed from the pill builder's category set, so one gate
   feeds both consumers. Zero brain files changed, so zero
   contract pins and zero replay cells move (verified in the
   gate). Gating table applied:

   | Nation           | Gated categories                                                                                                                                       |
   | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | Scotland         | primary schools, secondary schools, sixth forms (GIAS), GPs, NHS dentists, pharmacies (NHS ODS), A&E, maternity (CQC), nurseries (Ofsted England-only) |
   | Northern Ireland | the same nine, plus stations and bus stops (NaPTAN is GB-only), plus parks absence line corrected                                                      |
   | Wales            | A&E and maternity only (CQC England-only); Welsh schools/GP/dentist/pharmacy keep serving; sixth-forms cross-border behaviour (D64) unchanged          |

   Scotland's stations/bus stops/EV chargers/supermarkets are
   NOT gated (GB/UK-wide datasets). Tests: the gap check's
   five unit tests (tests/results.test.ts, nation-gating
   describe) and two E2E extensions (Edinburgh in
   e2e/journey.e2e.ts — gated sections carry the not-covered
   line and the page contains no three-digit-mile figure,
   /\d{3}\.\d+ mi/; Cardiff in e2e/results.e2e.ts — A&E +
   maternity not covered). Honest cost, carried forward by
   name: this is a presentation-layer fix — M8.1's report
   derivation must apply the same table, or the project takes
   the brain un-freeze then.

## CI #205 fix (17 Nov 2026) — the fold-in's browser job: 40 passed, 7 failed

CI #205 (commit c344f68) ran checks, secrets and database
green; the browser job failed 7 of 47 Playwright tests.
Each failure's class and fix:

1. STALE TEST — e2e/home.e2e.ts (the manifesto test)
   expected a "See a SAMPLE report" link (href
   /sample-report). That link lived in the "See a full
   example" section the founder ruled removed; the
   fold-in removed the section but not this expectation.
   The spec now keeps the manifesto assertions and pins
   the removal instead: the exact-case link's count is 0
   and main does not contain "See a full example". (The
   report band's own "See a sample report" CTA is a
   different label and stays; the unit suite already
   asserted the section's absence.)

2. STALE TEST — e2e/kitchen-sink.e2e.ts expected the
   header nav as four items. The fold-in added Contact
   as the fifth (D77(g)); the expected list is now the
   five items.

3. STALE TEST — e2e/results.e2e.ts (the old D39
   calibration test) asserted the substring "per 1,000
   residents" plus the D39 basis lines. D77(a)
   superseded the form; the spec now asserts the D77(a)
   pair in its settled form (see item 6 for why the
   England figure is pinned in form only).

4. STALE TEST — e2e/results.e2e.ts expected a standalone
   [data-section="noise"] holding "by day". D76 combined
   noise into "Air quality & noise" (key air-noise) in
   The Neighbourhood tab. The spec now opens that tab
   and asserts the combined section carries the served
   bands, "by day" and "by night".

5. PRODUCT BUG — distance precision. The Schools pill
   rendered its figure at two decimals ("0.29 / 1.88
   mi") because formatMiles (lib/results.ts) formatted
   to 2dp. The settled form is one decimal place
   uniformly — the finalised sample's displays are all
   1dp roundings of the served values. formatMiles now
   formats to 1dp, and every pin that stated a 2dp
   rendering was updated to the same fact at 1dp (the
   formatMiles unit test, the place-group and pill unit
   expectations, the shortlist unit and E2E
   expectations). Two honest notes. (a) The brief's
   quoted target for the pill, "0.29 / 1.8 mi", is not
   reachable from the served raw values under any
   uniform rule: the corpus serves primary in
   [0.285, 0.295) and secondary in [1.875, 1.885), so a
   uniform 1dp rule renders "0.3 / 1.9 mi" — the spec
   now expects exactly that; the sample's "1.8" is the
   production golden's own rounding (the fixture
   corpus's secondary value differs from production's,
   a documented fixture-vs-production divergence).
   (b) Brain-composed lines keep the brains' own
   three-decimal figures ("nearest is X, 14.671 miles
   away") — contract-pinned brain output, untouched;
   the 1dp rule governs the results layer's own
   formatting (rows, pills, shortlist cards).

6. CRIME PERCENTAGE — not a wiring bug. The brief
   supposed the renderer read the England figure from a
   raw-count field; it does not — lib/results.ts reads
   perHead.per1000 and englandFigure.englandPer1000,
   and on the production pair (51.7 against 94.5) it
   renders exactly the settled line, now pinned by a
   new unit test (51.7 vs 94.5 → "330 crimes recorded in
   the last 12 months — about 45% below the England
   average." with the calibration pair beneath). What
   CI served instead — "about 100% below", "figure is
   933039" — is the fixture corpus's England figure,
   933,039.0 per 1,000, which is correct arithmetic on
   the excerpt BY PINNED DESIGN: the golden replay
   asserts it as an identity (the fixture national
   total, 5,503,997, over the excerpt's 5,899 filed
   residents — only the three golden LSOAs are filed in
   lsoa_bases), while the golden matrix locks 94.5 for
   the FULL bases only. No honest E2E can assert
   45%/94.5 against this corpus without moving
   fixtures, replay cells or pins — all forbidden — so
   the E2E specs now pin the D77(a) FORM plus the
   corpus-true local figure (the main line, the local
   half of the pair, "Across England, the figure is"),
   the same form-not-value philosophy the old D39 spec
   used, and the computation itself is pinned at unit
   level on the production pair. The :178 failure was
   only the stale substring ("330 recorded crimes" for
   the settled "330 crimes recorded in the last 12
   months") and is aligned.

7. GATING GAP — the EH1 1AD page served beyond-nearest
   rows for the ungated GB/UK-wide categories from the
   excerpted corpus (station 279.26 mi, supermarket
   306.32 mi, bus stops 308.38 mi), tripping the
   page-level guard (no /\d{3}\.\d+ mi/ anywhere). The
   guard stands untouched. Mechanism (the brief's
   preferred): a results-layer radius rule in
   lib/results.ts — BEYOND_NEAREST_RADIUS_MILES = 25.
   A none-within category whose beyond-nearest sits
   past 25 miles serves its no-finding line instead of
   the row (the brain's own empty-line forms, mirrored
   from the served label; the supermarket category
   carries the map-gap caveat verbatim). The
   transformation sits beside the nation gating in
   buildResultsView and feeds the same two consumers,
   sections and pills, in every nation. Justification:
   the corpus's maximum legitimate beyond row is
   14.671 miles (Cheam Fields Primary Academy,
   tests/nearby.test.ts); the goldens' others run
   3.2–6 miles (Birkdale's A&E beyond at 5.89 among
   them), so 25 miles clears every legitimate row with
   ~70% headroom, while the defect's signature is
   279+ miles. Production trade-off, recorded: a
   genuinely remote home whose nearest essential
   service is past 25 miles (a Highlands A&E, say) now
   serves the no-finding line rather than a very
   distant pointer — the D30-honest answer at that
   distance; and for Scotland/NI the GB/UK-wide
   datasets serve real near rows once the national
   filing lands at M12, so the rule costs nothing
   there. The gating unit fixtures, whose beyond miles
   were 281–338 (excerpt artefacts in the same class),
   were re-based into the legitimate range so the
   England control isolates the gating alone, and a new
   unit test pins the radius rule under an England
   resolution (station, bus stop, supermarket and A&E
   fixtures at 279–324 miles all serve their no-finding
   lines; no three-digit-miles figure anywhere; no A&E
   pill). Observed and left alone, by scope: the
   shortlist card builder reads raw bundles with its
   own nearestOf — cards are save-time snapshots, the
   add control never renders on Scotland/NI pages, and
   the founder's guard is the results page.

Gate: npm run prepush exits 0 — Prettier clean, ESLint
0 errors, typecheck clean, Vitest 75 files / 1,721
tests (1,695 passed, 26 skipped — the pre-existing
golden-replay local skips, identical to base — 0
failed), next build succeeds. The 48 contract pins and
the 26 replay cells are untouched: no brain file, no
fixture and no replay/golden file was modified; the
changed files are lib/results.ts, tests/results.test.ts,
tests/shortlist.test.ts and the four E2E specs above.
Playwright was attempted locally and the harness still
refuses (serve-e2e: DATABASE_URL is not set) — CI is
the proof for the browser job, as with the fold-in.

## CI #206 fix (17 Nov 2026) — the CI #205 fix's browser job: 46 passed, 1 failed

CI #206 (commit ef1e9b1) ran checks, secrets and
database green; the browser job failed 1 of 47
Playwright tests: the Birkdale smoke test expected
the summary strip's second pill to be Flood, and the
served strip had Crime second — the Flood pill never
appeared. PRODUCT BUG, not a stale test, and not a
test-corpus artefact: it reproduces on production
data.

Diagnosis. summaryPills (lib/results.ts) rates Flood
good only when both layers' bands come back non-null,
via floodBandOf: a layer's coveringLabel if present,
else "Very low" for the absence point-states
"no-band-published" and "zone-1", else null. The
flood brain's absence states are per layer (D25):
flood_zone "zone-1", rofrs "no-band-published", rofsw
"below-lowest-band" — a surface-water point below the
lowest mapped band is the brain's own Very-low
framing. floodBandOf missed "below-lowest-band", so
the surface-water band came back null and the Flood
pill was dropped whole — for Birkdale (the golden
replay pins its real rofsw pointState as
"below-lowest-band") and for every home whose
surface-water point sits below the lowest mapped
band, in production exactly as in CI. The unit suite
missed it because the hand-built shortSections flood
fixture gave rofsw the "no-band-published" state,
which already mapped.

Fix. One line in floodBandOf: "below-lowest-band"
joins the absence states that map to "Very low",
with a comment naming the three states per layer.
No brain file changes — lib/flood.ts is untouched —
and floodBandOf's only caller is summaryPills (the
flood factor), so no other surface changes behaviour.

Coverage. A new unit test beside the D75 worked
example feeds summaryPills the GOLDEN flood shape —
rofrs "no-band-published", rofsw "below-lowest-band",
both coveringLabels null — and asserts the Flood
pill is present with figure "Very low" in the good
fill, and that the worked-example strip still reads
Schools · Flood · Crime · Noise · Deprivation under
those states. The test was proven against the bug:
with the fix line removed it fails; restored, it
passes. The existing worked-example test is untouched.

Gate: npm run prepush exits 0 — Prettier clean, ESLint
0 errors, typecheck clean, Vitest 75 files / 1,722
tests (1,696 passed, 26 skipped — the pre-existing
golden-replay local skips, identical to base — 0
failed), next build succeeds. The 48 contract pins
and the 26 replay cells are untouched: no brain file,
no fixture and no replay/golden file was modified;
the changed files are lib/results.ts,
tests/results.test.ts and this note. Playwright was
not attempted locally (the harness refuses:
DATABASE_URL is not set) — CI is the proof for the
browser job.

## Shortlist rulings build (17 Nov 2026) — the founder's evening rulings + the company-ownership free-page serve

Built on top of the CI #206 fix, in the same unpushed
stack, on the founder's rulings of the evening of
17 Nov 2026 (the four Shortlist samples were finalised
to these rulings the same evening). Nothing here is
pushed; the combined stack goes up on the founder's
morning approval.

1. Full = a simple message. The add-a-fourth panel is
   deleted — component, panel state, panel CSS and all.
   Tapping add with 3 saved replaces the button in
   place with SHORTLIST_FULL_LINE, now exactly "Your
   shortlist is full — it holds 3 homes.", plus a "See
   your shortlist" link to /shortlist. The message
   stands only while the stored list is in fact full:
   a removal elsewhere re-reads the record through the
   existing change subscription and the button returns.
   The old wording ("the free shortlist holds 3 homes")
   survives nowhere — the constant, the component and
   every test were moved together.

2. The shortlist page. (a) The facts table renders
   from ONE saved home: heading "The facts for this
   home" for one card, "Your saved homes, side by
   side" for two or more (the section's aria-label
   follows the heading). (b) Cards no longer render
   the facts line at rung 1 — the table below carries
   those facts as rows, so the card line duplicated
   them. SCOPING, recorded as ruled: a rung-3
   (wider-area) card KEEPS its facts line, because its
   named states explain missing data rather than
   duplicating the table; the card record itself is
   unchanged at every rung (factsLine is still
   snapshotted; only the rung-1 render dropped).
   (c) Cards lose their "Get the full report" link —
   Remove is the card's only action. (d) The kept line
   "Homes you save are kept only in this browser."
   moves to the bottom of the page, after the table,
   in the small print it already used.

3. Row order. COMPARISON_ROWS now follows the D75
   pill priority: Flood, Crime, Primary, Secondary,
   Grammar, A&E (Hospital with A&E), GP, Vet, Station,
   Nursery, Council tax. Grammar stays grouped with
   the schools (it is a row here though not a pill
   factor); council tax, not a pill factor, closes
   the table as a cost fact.

4. Real flood and crime cells. New rung-1 assembly
   derives both from the short bundle the card already
   snapshots. Flood: "Rivers & sea: {band} · Surface
   water: {band}", each band through floodBandOf —
   now exported from lib/results.ts for exactly this
   second consumer, so the absence-state mapping
   (rofrs "no-band-published", rofsw
   "below-lowest-band" → Very low; the CI #206 lesson)
   exists in ONE place and cannot drift. Where the
   section is not covered, the cell carries its named
   reason; where a layer serves no band (its data not
   filed), the cell carries that layer's own line —
   never an invented band. Crime: "{total} crimes"
   from the served 12-month count (en-GB grouping);
   the named states carry the brain's reason verbatim.
   STORED-CARD COMPATIBILITY: the pointer cell shape
   is retained in the type, the parser and the
   renderer, so cards saved before this ruling still
   render their pointer line ("See this home's
   check") and no saved list is dropped for its age;
   new assembly never produces a pointer.

5. Buy buttons. Exactly one report button per table
   column (the wide table's foot and the phone blocks
   alike), relabelled "Get the full report — £4.99",
   still linking to /report as today.

6. Company ownership at headline depth. The short
   bundle gains an OPTIONAL companyOwnership key,
   picked across from the area bundle's section
   whenever the input carries it: { state,
   ownedByCompany, line } — the boolean true only for
   the section's own-title match ("served"), false
   only for the filed-and-no-match state
   ("not-company-owned"), null in the named states,
   where no Yes/No exists to serve. The area bundle
   serves the section only while
   COMPANY_OWNERSHIP_ENABLED is on, so the gating is
   inherited, never re-decided: flag off, the key is
   absent from every short bundle exactly as before
   (the SECTION_ORDER and length-12 pins stand
   untouched); flag on, the free page's "Owned by a
   company: Yes/No" line has its boolean at headline
   depth. Report-depth serve is unchanged, and the
   results page's flag-gated row (which reads the
   area bundle) is untouched. SCOPING: the key is
   added at rungs 1–2 only — the rung-3/4 named-state
   shapes are unchanged. One stale comment is left
   standing deliberately: lib/area-bundle.ts's section
   header still says the short bundle is untouched by
   the section in either flag position; that file is a
   brain file and this build changes no brain file —
   the sentence is superseded by this note and by
   lib/short-bundle.ts's own header, and should be
   corrected the next time that file is legitimately
   open.

Tests. tests/shortlist.test.ts: the full line pinned
to the new words; the row-order pin rewritten to the
pill order; card assembly now expects the real cells
(Birkdale shape: both absence states → "Rivers & sea:
Very low · Surface water: Very low", "330 crimes"),
plus a Minerva-shaped case (surface water Low →
"Rivers & sea: Very low · Surface water: Low",
"1,956 crimes") and the named-state cases (not
covered, not filed, bandless layer); the pointer test
is reframed as the legacy-shape pin (parse + transpose
honour it). tests/short-bundle.test.ts: three new
tests pin the company key — absent with the flag off
even with filed facts behind it, the No with the flag
on, the Yes with the flag on (and only state/boolean/
line cross). DEVIATION from the brief's file list,
recorded: the company-ownership pins live in
tests/short-bundle.test.ts, not tests/results.test.ts
— buildShortBundle's suite and its full-bundle
machinery live there, and results.test.ts's
company-row test (the flag-gated render from the area
bundle, both ways) is unaffected and untouched.
tests/state-matrix.test.ts: the M6.13-era pin "the
section never reaches the short bundle, in either flag
position" is superseded by the same ruling and
rewritten — flag off keeps the key absent (12
sections); flag on carries the pick (13 sections, the
No over the matrix's filed slice). It is a behaviour
pin the founder's ruling deliberately changed, not
one of the 48 contract pins or the 26 replay cells,
which are untouched.
e2e/shortlist.e2e.ts: the panel regression is
rewritten as the full-message regression (message in
place, link followed, slot freed on the shortlist
page, save then succeeds); a new one-home regression
pins "The facts for this home", one £4.99 button, and
the kept line after the table in document order; the
comparison regression pins Flood as the first row,
the £4.99 button words, legacy pointer cells beside
real line cells; the remove regression pins the
rung-1 card without a facts line and without a report
link; the wider-area regression pins the rung-3 card
keeping its facts line.

Gate: npm run prepush exits 0 — Prettier clean, ESLint
0 errors, typecheck clean, Vitest 75 files / 1,727
tests (1,701 passed, 26 skipped — the pre-existing
golden-replay local skips, identical to base — 0
failed), next build succeeds. The 48 contract pins
and the 26 replay cells are untouched: no brain file
was modified (lib/area-bundle.ts included); the
changed files are lib/results.ts (the floodBandOf
export only, on top of the CI #206 fix already in
this tree), lib/shortlist.ts, lib/shortlist-card.ts,
lib/short-bundle.ts, components/ShortlistButton.tsx,
components/ShortlistPage.tsx, app/globals.css,
tests/shortlist.test.ts, tests/short-bundle.test.ts,
tests/state-matrix.test.ts, e2e/shortlist.e2e.ts and
this note. Playwright was not run locally
(DATABASE_URL is not set) — CI is the proof for the
browser job.

## M7.6 build (17 Nov 2026) — the report door: /report's holding page, the buy bar completed, the link contract

Built on main-at-ef1e9b1 + the CI #206 fix + the shortlist
rulings build (baseline Vitest 1,701 passed / 26 skipped).
The adopted M7.6 prep (21 premises, 7 contradictions, 6
rulings, 8 fold-ins) was premise-checked against this tree
before building; the tree had moved since the prep, and the
outcomes are recorded here because they shaped the build.

Premise-check outcomes:

- Premise 1 holds: REPORT_ROUTE = "/report" (lib/results.ts);
  premise 2 holds: no app/report route existed.
- Premise 3 is STALE in its inventory (the prep's link-site
  list predates two builds): the add-a-fourth panel link no
  longer exists (the panel was removed by the founder's
  ruling), the /shortlist card report action no longer
  exists (cards are Remove-only), and the comparison button
  already carries its priced label. One link site the prep
  did not list exists: the per-section upsell blocks the
  fold-in built (a hardcoded bare /report anchor). All sites
  now carry the contract: the buy bar, the upsell blocks,
  the truncation lines, and the comparison's per-column
  buttons (rung-1 cards carry postcode + home key; rung-3
  cards keep the bare route — their identity is an area).
- Premise 5 holds: rung 3 serves buyBar: null and keeps its
  unlock banner; its shortlist control stays beside the
  scope-label heading (ruling R2).
- Premise 7 NO LONGER HOLDS, and this is the build's one
  placement deviation: the fold-in had already built a buy
  bar to the finalised Results sample — below the four
  tabs, above the calculators — where the prep's R6 put
  the (then non-existent) bar above the tabs, a placement
  the prep itself flagged "could not verify" against the
  design. The Final Sample Master is the design authority
  (reconciliation 3), so M7.6 ADOPTS the existing bar and
  completes it in place: the contract href, the priced
  button label, the D21 mystery line, and the moved
  shortlist control. Placement is unchanged from the
  sample; nothing about the bar moved.
- Premise 11 holds (pre-build): the rung-1 control sat in
  .results-actions above the results page; the card is now
  handed to ResultsPage and the control renders inside the
  bar. Premise 17 partially stale: the BUY_BAR constants
  existed; the door-state constant is new.

What was built:

- lib/site.ts: REPORT_PRICE_LABEL ("£4.99", the normal
  price in every door state — the single source the door,
  the buy bar, the truncation lines, the upsells and the
  shortlist buttons now share) and REPORT_DOOR_STATE
  ("holding"; a checked-in constant in the
  COMPANY_OWNERSHIP_ENABLED pattern — "window"/"paid"
  arrive at M9.6, whose commit pins their lines; never a
  runtime flip, so a state a test does not pin cannot
  render).
- lib/results.ts: reportRoute(postcode, homeKey?) — the
  R3 link contract (postcode always; the home key only
  when a home is identified). buildResultsView computes
  the view's reportHref once and threads it to the
  truncation lines (which keep their default bare route
  for rung-3/unlinked callers), the upsell blocks and the
  buy bar; buildWiderAreaView serves reportHref: null.
  The buy bar gains mysteryLine (BUY_BAR_MYSTERY_LINE —
  the D21 tease verbatim, content-free; BUY_BAR_MYSTERY_
  EYEBAR "A mystery extra", uppercased by the kit's CSS)
  and the priced button. No brain file changed.
- lib/report-door.ts (new): the door's view derivation —
  three identity forms (home: "The detailed report for
  {street}" with the de-duplicated area+postcode subline;
  postcode: "The detailed report for {postcode}"; generic:
  "The detailed report"), the contents list ("What the
  detailed report adds": crime month by month, fuller
  school detail, fuller sold history, FLOOD_UPSELL_LEAD
  verbatim — the F4-softened wording, never "flood map
  pictures" — and the seller-questions/document line), the
  one-payment price line, the holding state line (names
  £4.99 as the normal price, the free check stays free in
  full), the sample-report route, and the route back
  (homeRoute with the identity; "/" for the generic form).
  The "window"/"paid" states render this same holding form
  until M9.6 pins their lines in the commit that flips the
  constant — a state is never silently unrendered.
- app/report/page.tsx (new): the route. Resolves the
  identity from ?postcode=&home= via resolutionForRoute
  (a stale home key falls back to the postcode form; rung
  3, an unfiled postcode or a failed derivation renders
  the generic form — the door never errors and never
  guesses a home). No email capture, no form, no gift
  mention; not in the sitemap, no metadata (the M7.2
  pattern).
- components/ReportDoorPage.tsx (new): the holding page in
  the Payment sample's structure and design language
  (Master view 9 minus the payment form M9 builds): the
  journey-page shell, the heading + lead subline, one card
  carrying the contents list, the price line and the state
  line, then the sample + back links.
- components/ResultsPage.tsx: the buy bar renders the
  mystery strip and the moved ShortlistButton (the card
  arrives as a prop; rung 2 and the not-covered branch
  pass none, so no control renders there); the upsell
  blocks link through the view's reportHref at the shared
  price label.
- app/search/home/page.tsx: the .results-actions block is
  gone; the rung-1 card is passed to ResultsPage.
  components/ShortlistButton.tsx: its M7.5 header note now
  records the discharged move. components/ShortlistPage
  .tsx: the comparison buttons (table foot + phone block)
  carry the contract href per card at the shared label.
  app/globals.css: .results-actions removed; the mystery
  strip and the door card styled in the kit's tokens.

Tests: tests/report-door.test.ts (new, 9 tests) pins the
state constant at "holding", the three identity forms,
the contents incl. FLOOD_UPSELL_LEAD verbatim, the price
and state lines, and the negative pins — no free-window
wording, no "flood map pictures", no form/input/email in
the rendered page. tests/results.test.ts gains the
reportRoute contract test, the buy-bar mystery + href
pins, the rung-2 postcode-only href pins, and the
rendered-page pin that exactly one shortlist control
exists and it sits inside .buy-bar (F6). The two pins the
contract superseded were updated to the contract form
(the rung-1 truncation anchor; the rung-2 truncation
href). e2e/report-door.e2e.ts (new, 3 Regression specs):
the bar's control/tease/contract against the served
golden corpus, the holding page naming the home with no
inputs, the postcode-only and generic forms.
e2e/shortlist.e2e.ts: the comparison href expectations
are now per-card contract hrefs, the one-home href
likewise, and the storage-unavailable locator re-pointed
from .results-actions to .buy-bar (re-pointed, not
weakened — F6). e2e/results.e2e.ts: the rung-3 no-report-
link assertion strengthened to a[href^="/report"] so it
catches the contract form too. No Smoke authored for
M7.6 (D68).

A2 deferral (recorded for the plan): the authored
free-window Regression test cannot be authored at M7.6 —
the window state's lines are pinned at M9.6 by ruling R1,
and a test written now could only pin a guess. It is
deferred to M9.6 under R1; the plan-text amendment to
M9.6 (naming the deferred test) is the parent's to make
via the artifact tools — flagged in this build's terminal
report as an open item.

One build catch, recorded because it shaped the shape:
the first prepush run's production build failed on
/shortlist — lib/results.ts's new import of homeKeyOf from
lib/bundle-cache pulled Node modules into the client
chunk (ShortlistPage imports from lib/results). The view
builder now never derives the home's identity:
ResultsInput carries homeKey in from the serve layer (the
route already holds it), absent which the door links
degrade to the postcode form. The unit tests were green
throughout; only the real build could see it — the gate
earning its keep.

Gate: npm run prepush exits 0 — Prettier clean, ESLint 0
errors, typecheck clean, Vitest 76 files / 1,739 tests
(1,713 passed, 26 skipped — the pre-existing
golden-replay local skips, identical to base — 0 failed),
next build succeeds (/report serves as a dynamic route).
The 48 contract pins and the 26 replay cells are
untouched: no brain file was modified; the changed files
are lib/site.ts, lib/results.ts, lib/report-door.ts
(new), components/ReportDoorPage.tsx (new),
components/ResultsPage.tsx, components/ShortlistButton
.tsx, components/ShortlistPage.tsx, app/report/page.tsx
(new), app/search/home/page.tsx, app/globals.css,
tests/results.test.ts, tests/report-door.test.ts (new),
e2e/report-door.e2e.ts (new), e2e/shortlist.e2e.ts,
e2e/results.e2e.ts, docs/frontend-m7.5.md and this note.
Playwright was not run locally (DATABASE_URL is not
set) — CI is the proof for the browser job.

## M7.7 build (17 Nov 2026) — phone-first: T-WEB-01's assertions across the enumerated set, the tabs' wrap pinned, one kit-level tap-target fix

Built on the adopted gap check (~/workspace/scratch-m77/FINDINGS-HOLD.md —
four rulings, six fold-ins, founder adopted 17 Nov 2026) on top of the
M7.6 build. The step is a proof step: its deliverable is the enumerated
Playwright set in e2e/phone.e2e.ts (16 specs, all Regression — no Smoke
authored for M7.7, no promotions, D68 clause 7) plus one kit-level fix
the new measurements exposed. No brain file was modified; the 48
contract pins and the 26 golden replay cells are untouched; no unit
test changed (this step's tests are browser specs, so the Vitest count
stands at the M7.6 gate's 1,713 passed / 26 skipped).

Premise checks against the current tree (the prep audited the M7.5-era
tree; what moved, and how the build reads it):

- HOLDS: the breakpoints are pinned in the globals.css header (small
  30rem, desktop 48rem); --tap-target (2.75rem) rides as min-height on
  .btn, .field__input, .tabs__tab, .site-nav__link, .report-btn,
  .shortlist-btn and .remove-btn, and .picker__row carries 2.75rem
  literally; the kit DataTable's stacked form and its kitchen-sink
  360px spec stand as the table clause's witness (R1); before this
  build the suite held exactly that one 360px assertion and no
  scrollWidth assertion anywhere (grep-verified); no overflow-x exists
  in the kit and none was added (R3 — grep-verified after the build:
  still zero occurrences); no viewport override exists in
  app/layout.tsx; the postcode input computes to 16px by construction
  (body 1rem, font: inherit), unpinned until this step's F3 specs.
- MOVED — four tabs, not three. D76 restructured the results page
  after the prep: Family Checks / The Neighbourhood / Home, Costs &
  Risks / What's Nearby. R2's wrap ruling is pinned over the four-tab
  list (the tabs CSS already recorded the wrap as "M7.7's pinned form"
  at the D70 pass; the specs now prove it: tops spanning more than one
  row, every tab visible and ≥44px, the list itself not scrolling).
- MOVED — five nav links, not four. D77(g) added Contact and Guides
  left the chrome at fidelity pass 2; F2/F6's header set is the five
  links as built, asserted once on the landing (F6).
- MOVED — picker rows are buttons. D70 R6 made the picker
  select-then-confirm after the prep: rows are <button class=
  "picker__row"> and the confirm is a kit Button. Both are in F2's
  measured set, on the picker page and in rung 2's embedded picker.
- MOVED — a product table now exists, at desktop only. The shortlist
  build put the comparison into a real <table class="compare-table">
  with a fixed layout for desktop widths; ShortlistPage swaps markup
  by matchMedia, so below 48rem the DOM holds the block stacking and
  no table. R1's pin therefore reads exactly as adopted at phone
  width — no enumerated product surface renders a table at 360px (or
  480px) — and the comparison's phone form is asserted as P2's stacked
  blocks: one per home, saved order, shared left edge and full width,
  one report button per block.
- MOVED — the add-a-4th panel no longer exists. The founder ruled it
  out the same evening the prep was adopted; the shortlist build
  deleted it. F2's adopted exception (an action sitting among buttons
  takes the tap-target treatment) lands on its successor: the
  full-shortlist message's "See your shortlist" link, a bare inline
  link standing in the buy bar where the button stood. It had no kit
  rule at all — the one genuine defect the new assertions exposed.
- MOVED — M7.6 landed first, so R4's condition is met: /report and
  the buy bar are IN the enumerated set as built.

The one fix (kit level only, F5): app/globals.css gains the
.shortlist-full-line rules — the paragraph's margin zeroed and its
link given display: inline-flex with min-height: var(--tap-target).
Deviation from F2's letter, recorded: the fold-in prescribed .btn
classes for the panel's report link; the element that exists now is a
text link inside the founder's ruled simple message, whose finalised
sample form is a small text link (Final Sample Master view 13), so
the treatment delivers F2's substance — a measured 44px target —
in the kit's own invisible-height idiom (the nav links' pattern)
without changing the message's visual form. The full-state spec in
e2e/phone.e2e.ts is its regression pin. No other CSS changed; the
desktop rendering is untouched by the rule (the message only ever
renders in the full state, in the bar, at any width — and there the
44px is tappable height, not visible form).

The enumerated spec set as built (e2e/phone.e2e.ts, 360×740 unless
noted; F1's widest states, re-asserted after layout-changing
interactions): (1) landing — no sideways scroll, no table, the header
wrap + five tappable links (F6), the input at 16px and 44px, the
submit at 44px (F2/F3); (2) picker — every row 44px and inside the
viewport, the confirm at 44px; (3) checking screen — no sideways
scroll while the check runs (brain calls held, the journey spec's
device) nor on the results it advances to; (4) rung-1 results — the
tabs wrap (R2), each of the four panels opened in turn with the
no-scroll and no-table assertions re-run, the buy bar's report and
shortlist pills at 44px with the mystery strip present; (5) rung-2
results — the embedded picker's rows at 44px; (6) rung-3 wider area —
the heading-side toggle at 44px, the banner input at 16px; (7)
Scotland not-covered — no sideways scroll with a second tab opened;
(8) no-location — the retry box at 16px; (9) whole-check failure;
(10) the /report holding page for a named home; (11) /shortlist
empty; (12) /shortlist with one home — one full-width block, Remove
and the block's report button at 44px; (13) /shortlist with three
homes — the stacking in saved order (P2), all Remove and report
buttons at 44px; (14) the full-shortlist state in the buy bar — the
message in place, its link at 44px, no panel anywhere; (15–16) the
P6 pair at 480px — rung-1 results and the three-home comparison,
still stacked, nothing sideways. Measurements carry a half-pixel
tolerance on tap heights and one pixel on scroll widths, for
Chromium's fractional box rounding; both tolerances are named in the
spec file's header.

The Check's two halves (F4, recorded so neither is quietly dropped):
the automated half is this spec set, gating in CI from the morning
run. The manual half is the step's Check verbatim — the founder
completes a full check on his own phone without pinching or zooming —
and it discharges at the founder's end-of-programme UAT (M7.16),
where the play-server test round now lives under the 17 Nov strategy
ruling. This step's code gates on the automated half, per D68 as
adapted.

Gate: npm run prepush exits 0 — Prettier clean, ESLint 0 errors,
typecheck clean, Vitest 1,713 passed / 26 skipped / 0 failed
(identical to the M7.6 baseline; this step adds no unit tests), next
build succeeds. Playwright was not executed locally — DATABASE_URL
is not set, so the served app cannot stand up in this sandbox; the
16 specs were verified collected and wired into the suite with
`npx playwright test --list` (16 tests in e2e/phone.e2e.ts), and
their first execution is the morning CI run, where a failure in any
one of them is attributable to this step by this note. Changed files:
e2e/phone.e2e.ts (new), app/globals.css (the full-line rules only),
and this note.

## M7.8 build (17 Nov 2026) — SEO for every public page: the check landers, the guides, the chrome pages built, production noindex created

Built on the founder-adopted gap check for this step (17 Nov 2026,
adopted in full with its two follow-up rulings: the chrome pairs
locked at their chrome paths with About re-locked at /about, and the
guides as landers only). Premise outcomes, checked against the tree
before building: PAGE_SEO already held pairs for the homepage, the
/check/ pages and the 3 guides — FIFTEEN check pairs, not the
fourteen the gap check's count said (flood, crime, sold-prices,
schools, epc, council-tax, planning, ev, broadband, transport,
family-essentials, noise, air, solar, mobile); all fifteen are
built. The production-noindex defect was real: pageMetadata
returned no robots lock on the production name, so /search and
/search/home would have been indexable in production. The chrome
routes did not exist while the header and footer linked them. No
/check/, /guides/ or chrome route existed; the layout applied the
homepage pair to every route; the sitemap listed only "/"; robots
disallowed three routes that have never existed (/results,
/checkout, /account).

What was built:

1. Production noindex, created and pinned. pageMetadata gained the
   unconditional lock for pages that pass noindex (the helper's
   object form already carried the flag; the journey pages now pass
   it): /search, /search/home, /search/failed, /report and
   /shortlist each export explicit metadata with robots
   {index:false, follow:false}, independent of environment.
   app/robots.ts's production disallow list is aligned to the real
   route family (/search, /search/home, /search/failed, /report,
   /shortlist, /kitchen-sink, /api), sitemap still declared.
   /kitchen-sink is declared non-indexable/outside the checklist,
   as ruled.
2. The chrome pairs locked under D38: /sample-report, /contact and
   /privacy are newly locked in PAGE_SEO (descriptive metas in the
   set's own frame — no figures, no questions, no banned wording;
   they pass the existing pair scan unchanged), and About's pair is
   re-locked at /about, superseding /about-the-data, which is
   removed from the set. PAGE_SEO is now 24 pairs.
3. The chrome pages built from the finalised Final Sample Master
   views 4–8, transcribed, not redesigned: /how-we-check (the nine
   source cards, the "What we never do" grid, the search block),
   /about (hero, six cards, the manifesto block, the search block),
   /sample-report (view 7 as the web preview — banner, watermark,
   masthead, short version and all nine sections, the worked
   example home and its figures exactly as the sample carries
   them; the sample's two location-map images carried in as binary
   assets under public/sample-report/, registered in
   BINARY_ASSETS), /contact (the form, the mailto route, the
   two-working-day promise) and /privacy (the eight cards, dated
   17 November 2026). Chrome copy is held as constants in
   lib/site-pages.ts; the report document is
   components/SampleReport.tsx. The pages' styles are a scoped
   port of the Master's own site-pages stylesheet (app/globals.css,
   .site-pages), variables mapped to the same hex values; the
   sample's browser/header/footer chrome is not ported — the
   product's chrome serves.
4. The check pages and guides: body copy drafted as locked
   constants in lib/check-pages.ts — all 15 check pages (lead
   answering the query, "What the check shows" / "What the check
   cannot tell you", the official source cited) and the 3 guides in
   full prose. One template (components/ContentPage.tsx) renders
   both families in the samples' card-and-heading language; the
   flood-risk page was built first as the template and the rest
   replicated through it. The banned-wording scan extends over the
   body strings (tests/seo.test.ts): the union, the valuation rule,
   the portals and the gift run; the no-figure and no-"free" rules
   do not (body copy legitimately carries bases and the
   free-headlines fact). The families guide never answers its
   title question — it sets out what the checks show and leaves
   the judgement to the reader.
5. The related-links mapping, hand-picked on brain affinities and
   held in lib/check-pages.ts (each check page: exactly 2 related
   checks + 1 guide; the checker is the search block closing every
   page): flood-risk → noise, air-quality (guide: checks);
   crime → family-essentials, public-transport (families);
   sold-prices → council-tax-band, planning-constraints (checks);
   schools → family-essentials, public-transport (families);
   epc → solar-potential, council-tax-band (checks);
   council-tax-band → sold-prices, epc (checks);
   planning-constraints → sold-prices, flood-risk (checks);
   ev-charging → public-transport, broadband (checks);
   broadband → mobile-coverage, ev-charging (checks);
   public-transport → ev-charging, family-essentials (families);
   family-essentials → schools, crime (families);
   noise → flood-risk, air-quality (checks);
   air-quality → noise, flood-risk (families);
   solar-potential → epc, air-quality (checks);
   mobile-coverage → broadband, ev-charging (checks).
   Completeness is pinned in tests/seo-pages.test.ts (2–3 related,
   all valid, never self; exactly one valid guide; every guide's
   checks real).
6. The homepage CheckTiles are wired to their /check/ pages —
   seven of the nine tiles own one (Schools → /check/schools;
   Doctors, dentists & vets → /check/family-essentials; Safety
   around the home → /check/crime; Plans that could change the
   street → /check/planning-constraints; Flood risk →
   /check/flood-risk; The cost of living → /check/council-tax-band;
   What homes here actually sold for → /check/sold-prices).
   "Food, leisure & everyday life" and "Your neighbours & the area"
   name families no single page owns and stay unlinked. This
   discharges M7.11's wiring premise, as the gap check ruled (the
   fold-in removed the landing section that step was written
   against).
7. BreadcrumbList structured data in the Home → page form
   (lib/seo.ts breadcrumbSchema; item only where a page exists —
   there is no /check or /guides index to name); no visible
   breadcrumb UI anywhere.
8. The sitemap lists every PAGE_SEO key on the production name
   (homepage first, priority 1), empty elsewhere, as before.
9. Per-page metadata moved into the pages: the layout exports no
   metadata at all now; every route exports its own through
   pageMetadata. The indexing assertions run at metadata level
   under a production environment name (tests/seo-pages.test.ts
   imports each route module with NEXT_PUBLIC_SITE_ENV=production
   set first); the browser spec (e2e/seo.e2e.ts, Regression only)
   asserts title/description presence per route, the journey
   robots lock in the served head, the related links on the flood
   page, no Guides item in header or footer, the tile wiring, and
   the chrome pages' headings. No Smoke authored, no promotions
   (D68).

Deviations and judgement calls, recorded: (a) the privacy route is
/privacy per the adopted scope ruling, although the sample's mock
URL bar shows /privacy-policy — pair, route and sitemap all use
/privacy. (b) The contact form has no delivery endpoint anywhere in
the product; it mirrors the sample's behaviour (the thank-you state
on submit) and sends nothing — the mailto route beside it is the
working route today, and wiring real delivery is a later step's
work, recorded here rather than hidden. (c) /search/failed,
/shortlist and /report also received noindex metadata (the brief
named /search and /search/home): with the layout's default gone,
leaving them title-less or accidentally indexable would have been
worse; this supersedes the M7.6 note's no-metadata convention for
/report, and the change is recorded in that file. (d) The
banned-wording scan's body extension covers the newly drafted
constants (lib/check-pages.ts); copy transcribed verbatim from the
finalised samples (the chrome pages, the sample report) is not
re-scanned — it carries ruled negations ("No scores. No
valuations.") under the same standing the D9 short form has in the
existing scans. (e) SampleReport.tsx carries two scoped
eslint-disables (img elements, as elsewhere in the kit; and
react/no-unescaped-entities, because the transcription keeps the
sample's own straight apostrophes rather than re-typing them as
entities). (f) The sample report's EPC scale and a handful of
report classes ride on the Master's own .rpt-*/.epc rules as
ported; the Master's stylesheet defines no rules for a few
classes its markup uses (they fall back to the document's base
rules there, and do here too).

Gate: npm run prepush exits 0 — Prettier clean, ESLint 0 errors,
typecheck clean, Vitest 1,727 passed / 26 skipped / 0 failed
(baseline 1,713 + 14 new: 3 in tests/seo.test.ts, 11 in
tests/seo-pages.test.ts), next build succeeds with all 24
indexable routes in the route table. The 48 contract pins and 26
golden replay cells are untouched; no brain files changed
(lib/seo.ts and the new content constants are the wording layer).
Playwright was not executed locally (DATABASE_URL unset); the new
spec was verified collected with `npx playwright test --list`
(29 tests in e2e/seo.e2e.ts) and its first execution is the
morning CI run.

Changed files: lib/seo.ts (chrome pairs, About re-lock,
breadcrumbSchema), lib/check-pages.ts (new), lib/site-pages.ts
(new), lib/home.ts (tile hrefs), components/ContentPage.tsx (new),
components/SearchBlock.tsx (new), components/BreadcrumbLd.tsx
(new), components/ContactForm.tsx (new), components/SampleReport.tsx
(new), components/CheckTiles.tsx (tile links), app/layout.tsx
(metadata removed), app/page.tsx (own pair), app/sitemap.ts,
app/robots.ts, app/how-we-check/page.tsx (new), app/about/page.tsx
(new), app/sample-report/page.tsx (new), app/contact/page.tsx
(new), app/privacy/page.tsx (new), app/check/_/page.tsx (15 new),
app/guides/_/page.tsx (3 new), app/search/page.tsx,
app/search/home/page.tsx, app/search/failed/page.tsx,
app/shortlist/page.tsx, app/report/page.tsx (noindex metadata),
app/globals.css (the .site-pages port + the tile-link rule),
public/sample-report/*.png.b64 (2 new), scripts/
materialise-binary-assets.mjs, .gitignore, tests/seo.test.ts,
tests/seo-pages.test.ts (new), tests/look-feel-kit.test.ts,
e2e/seo.e2e.ts (new), and this note.

## M7.9 build (18 Nov 2026) — the free headlines on the Home, Costs & Risks tab: items (b) and (c) built; item (a) built last, on the founder's re-pin authorisation

Built on the founder-adopted gap check for this step (17 Nov 2026,
adopted in full with its follow-up rulings: D41 stands for the
heritage layers, parks & gardens struck, the composed Costs lead
is the settled D33 form, and the company line takes the sample's
single-line form). A first builder verified the premises for all
three build items and stopped on item (a); the (b)+(c) build
completed those two items, and item (a) was built last, once the
founder had authorised the re-pin — the full stop-and-authorise
trail is recorded in the item (a) section below.

Coverage audit outcome — what the step named vs what already
stood when the gap check ran:

- The D31 planning hand-off (council named, register named, the
  GOV.UK register search link, never a count, never a named
  list) — already rendered on the built page by M7.4, from the
  M6.12 area-bundle section. Discharged before this build.
- The brownfield headline in its served short form and the
  built-up-area line — already rendered by M7.4, from the
  M6.21/D41 serves. Discharged before this build.
- Heritage on the free page — listed buildings + the at-point
  line already rendered by M7.4; scheduled monuments, World
  Heritage Sites, registered battlefields, protected wrecks
  and buffer zones stay at report depth under D41, and the
  step's text was amended to that settlement. Registered
  parks & gardens was struck from the step: no loader, filing
  or serve for it exists anywhere in the project.
- The company-ownership row — already rendered behind
  COMPANY_OWNERSHIP_ENABLED by the fold-in (F2), reading the
  area bundle; the 17 Nov shortlist build added the same
  headline to the short bundle for short-bundle consumers.
  What remained was the line's FORM — item (c) below.
- The composed Costs lead — already the settled form on the
  built page (the fold-in): the two D33 monthly figures in
  one line, each half restated inside its own section. The
  step's never-summed clause was amended to match; no
  standalone cost-of-ownership headline exists.

Item (b) — the Regression E2E, built. e2e/headlines.e2e.ts
(new): one Regression spec (D68; no Smoke, no promotions) per
universal golden home — Birkdale CM3 2JT, Exeter E16 1GN,
Minerva KT17 1FH — against the seeded corpus, exactly as the
step's E2E paragraph specifies. Per home, with the Home,
Costs & Risks tab open: the hand-off line renders as served
(the council as filed — Braintree / Newham / Epsom and
Ewell — the register named, the GOV.UK link's label and
href asserted); the section carries exactly one link (the
register search — a named list would render there) and no
application count in its text; the brownfield count line
(2 / 97 / 30 within 2 miles) and the built-up-area line
(Hatfield Peverel / Newham / Ewell) render as served; with
the flag off, neither "Owned by a company" nor "Company
ownership" appears; the Costs lead matches the composed
shape and is the section's only "About £… a month:" line;
and neither section carries the words "cost of ownership".
The negatives are asserted on the sections that could carry
them, tab open — the suite's established pattern
(e2e/results.e2e.ts) — and that scoping is complete by
construction: lib/results.ts renders the hand-off, the
company line and any monthly total nowhere else on the
page. The specs collect under `npx playwright test --list`
(99 tests in 9 files); they cannot execute locally
(DATABASE_URL unset) — CI is the proof, as with every step
in this stack.

Item (c) — the company line form, built. In
buildResultsView (lib/results.ts), behind the flag, the
subsection is now headed "Company ownership" and the line
takes the finalised sample's single-line form from the
section state: "served" renders "Owned by a company:
Yes."; "not-company-owned" renders "Owned by a company:
No.". The named states (needs-exact-home, not-covered,
not-filed) keep their honest served lines — no Yes/No is
invented where the boolean is null. The fuller served
sentence with its as-at date remains the report-depth
form: the area bundle and the report serve are unchanged,
and no brain file was touched. tests/results.test.ts pins
both flag positions (off: neither the heading nor the line
appears; on: the one-line form renders and the brain's
sentence does not) and all three state forms — the file's
earlier company test, which pinned the pre-ruling
subheading-plus-sentence form, was updated to the ruled
form (a behaviour pin the founder's ruling changed, not a
contract pin).

Item (a) — the short-bundle planning pick, built last, on
the founder's authorisation. The build: lib/short-bundle.ts
gains ShortPlanningApplications — a sibling pick beside
the twelve D28 sections, on the company-ownership pick's
pattern — carrying the area section's state, council,
line and link (null where the nation carries no link:
Scotland; Mid Ulster in Northern Ireland). buildShortBundle
populates it from area.sections.planningApplications,
which the area bundle builds unconditionally, so the pick
is present in every rung 1–2 bundle; ShortSectionKey is
NOT extended, so rungs 3–4 carry no trace of it. The
section's explainer and meta stay at report depth.
buildResultsView (lib/results.ts) now reads the hand-off
from sections.planningApplications, so the website and
the Phase 2 extension consume one derivation and show the
same headline unchanged; the rendered page is exactly as
before (the area section's sourceLine is null in every
nation branch, so the old `planning.sourceLine ??
sourceLine` fallback was a no-op, and the section's source
line remains the constraints one). lib/area-bundle.ts is
untouched — its buildPlanningApplications output is the
source, and lib/journey.ts still reads the hand-off from
the area bundle for the checking screen, outside this
item's scope.

The authorisation trail (contract pins move only on an
authorised re-pin — the M6.34/D65 precedent). The gap
check's adoption (17 Nov 2026) scoped this item but did
not foresee the pin conflict. A first premise sweep
stopped the build: the pick would move three of the 48
contract pins (short.rung1, short.rung2, short.scotland)
and two behaviour pins. The founder authorised the re-pin
in chat (18 Nov 2026: "M7.9 Authorised — Build the rest -
authorized"). A second sweep found five further count
assertions the first set had not named — among them a
golden replay cell's section count — and stopped again;
the founder extended the authorisation the same morning
("Extend the authorisation — build item (a) with all the
count updates, then the one push"). A third sweep found
one more contract pin, short.flood-warnings (filed with
the M6.22 flood work, a pin over a short bundle all the
same), and stopped a third time. The founder then gave
the authorisation as a class (18 Nov 2026: "Authorise the
full set — all four short-bundle pins plus the counts, no
more stops on this item"): every contract pin, behaviour
pin and count assertion that moves SOLELY because the
short bundle gains planningApplications as a thirteenth
key. On that authorisation the build proceeded, with the
stop rule narrowed to anything moving for any other
reason — a figure, a served line, the area bundle, or
another bundle's shape. Nothing did.

Every pin and count the build moved, enumerated:

- Contract pins, regenerated deliberately via the suite's
  PRINT_SHAPES path: short.rung1, short.rung2,
  short.scotland, short.flood-warnings in
  tests/fixtures/replay/bundle-shapes.json. Verified
  mechanically: all 48 shapes were printed and compared —
  exactly these four differ from their pins; the other 44
  (short.rung3 and short.rung4 among them) are
  byte-identical, so no unauthorised shape moved.
- tests/state-matrix.test.ts: the hand-off pin ("the
  hand-off never reaches the short bundle…") rewritten —
  the hand-off DOES reach the short bundle under this
  ruling, and the test now asserts the picked form in
  full (state, council, line, link). Counts: the company
  flag-off count 12 → 13 and flag-on count 13 → 14; the
  building-safety absence count 12 → 13; the
  broadband/mobile count 12 → 13.
- tests/short-bundle.test.ts: SECTION_ORDER itself is
  unchanged (it remains the twelve, and the exact key set
  of rungs 3–4, whose assertions stand untouched); the
  two rung 1–2 order assertions now expect
  [...SECTION_ORDER, "planningApplications"], and the
  broadband section count moves 12 → 13.
- tests/golden-replay.test.ts: the "universal headlines"
  cell's section count 12 → 13 — the count assertion
  only; every locked figure in the cell is byte-identical
  (the replay harness derives the bundle live through
  buildShortBundle, so the count holds by construction
  when the suite executes in CI).
- The banned-key scans (tests/short-bundle.test.ts, two
  sites): the key name "planningApplications" is exempted
  by name. It trips the scan's blunt "gap" substring
  across its camelCase hump ("planning|Applications"),
  but the name is the product's fixed vocabulary — the
  area bundle's section name since M6.12 — not a computed
  comparison; the scan's intent (no key computes a
  comparison) is preserved. Recorded here as part of the
  authorised class: the assertions moved solely because
  the thirteenth key exists.
- Fixture consequence (not a pin): tests/results.test.ts's
  hand-built shortSections() gained the pick in the picked
  form, so the fixture mirrors a real derivation now that
  buildResultsView reads the hand-off from the short
  bundle; the fixture's area-bundle section is unchanged.

Gate: for items (b) and (c), npm run prepush exited 0 —
Prettier clean, ESLint 0 errors, typecheck clean, Vitest
1,728 passed / 26 skipped / 0 failed (baseline 1,727 + 1
net new test in tests/results.test.ts), next build
succeeded. For item (a), npm run prepush again exits 0
with the same totals — 1,728 passed / 26 skipped / 0
failed (the build updated assertions in place and added
no net new tests; the named suites — bundle-contracts,
state-matrix, short-bundle, results — were also run
explicitly). The 26 skipped are the golden replay suite
(DATABASE_URL unset locally; it executes in CI's database
job, where the one count it carries for this step holds
by construction, the harness deriving the bundle live).
Of the 48 contract pins, exactly the four authorised
short-bundle pins were regenerated and the other 44
verified byte-identical; the remaining golden replay
cells are untouched. No brain files changed in any item
(lib/short-bundle.ts is the derivation layer,
lib/results.ts the presentation layer). Playwright was
not executed locally; the (b) specs were verified
collected with `npx playwright test --list` and their
first execution is the morning CI run.

Changed files: for items (b) and (c) — lib/results.ts
(the company line form), tests/results.test.ts (the
flag/form pins), e2e/headlines.e2e.ts (new). For item
(a) — lib/short-bundle.ts (the pick), lib/results.ts
(the hand-off read switched to the short bundle),
tests/fixtures/replay/bundle-shapes.json (the four
re-pinned shapes), tests/state-matrix.test.ts (the
hand-off pin rewritten; four counts),
tests/short-bundle.test.ts (two order assertions, one
count, the banned-key name exemption),
tests/golden-replay.test.ts (the one count),
tests/results.test.ts (the fixture pick). Plus this
note.

## Footer Guides build (18 Nov 2026) — the /guides hub and the footer's Guides link, on the founder's ruling

The founder reviewed the three M7.8 guides on the morning of
18 Nov 2026 and approved them with one change: a Guides link
in the FOOTER only (the header unchanged), pointing to a
simple /guides hub page listing all three. The Final Sample
Master was updated first — every footer's row now reads
How we check · Sample report · About · Guides · Contact —
and this build makes the product match it.

What was built:

- The hub (app/guides/page.tsx, rendered by GuidesHubView in
  components/ContentPage.tsx). No sample exists for this
  page, so it is built in the samples' own design language
  through the established content-page template: eyebrow ·
  H1 · lead · the brass rule · one card per guide · the
  checker search block at the foot. The cards are read from
  the GUIDES record in lib/check-pages.ts — each guide's
  name as the card heading, its own lead as the listing
  text, its path as the link — so nothing is listed that
  the record does not hold, and no copy exists beyond the
  page's own title and lead, written in the established
  voice. The hub carries the BreadcrumbList (Home → Guides)
  as structured data only, like every content page; the
  guides themselves keep the settled two-item breadcrumb
  form — the hub is a footer destination, not a breadcrumb
  parent (lib/seo.ts's note updated to say so).
- The locked pair (lib/seo.ts): "/guides" joins PAGE_SEO
  (24 → 25 pairs), titled "Guides | Check My Next Home",
  locked under the same D38 process as every pair. The
  sitemap derives from PAGE_SEO's keys, so the hub is
  listed by construction — verified by tests/seo.test.ts's
  sitemap assertion, which maps the record's keys in order.
- The footer (components/SiteFooter.tsx): FOOTER_LINKS
  gains { Guides, /guides } between About and Contact —
  the footer's own list, changed once. The header is
  untouched: its set stays How we check · Sample report ·
  About · Shortlist · Contact, and its existing pin (no
  /guides href in the header) now stands guard over this
  ruling's header half.

The ruling's place in the record: it SUPERSEDES the M7.8
adopted ruling that the guides stay out of the chrome
("landers only") FOR THE FOOTER ONLY — the header half of
that ruling stands. D77(g)'s footer set gains Guides and
is now: How we check · Sample report · About · Guides ·
Contact. The three guide pages' header comments, which
recorded the old ruling, were corrected to the new one.

Tests, test-first where a pin existed: tests/seo.test.ts's
locked key set gains "/guides"; tests/look-feel-kit.test.ts's
PAGE_SEO count moves 24 → 25 and its footer pin now asserts
the full five-link set IN ORDER, Guides between About and
Contact, with the /guides href present;
tests/seo-pages.test.ts gains the /guides route in its
metadata harness (the covers-every-pair assertion forced
it) plus a rendered-hub assertion (every guide in the
record named and linked, the checker present);
e2e/seo.e2e.ts's landers-only spec is rewritten to the new
ruling (header: no guides link at all; footer: exactly one
link, href="/guides", and no individual guide links), a
hub spec is added (all three guides listed, the checker
closing the page), and the PAGE_SEO loop adds the hub's
locked title/description spec by construction — the file
now collects 31 specs (was 29), first execution the
morning CI run, per the house pattern. No brain files
changed.

Changed files: app/guides/page.tsx (new),
components/ContentPage.tsx (GuidesHubView),
components/SiteFooter.tsx (the link), lib/seo.ts (the
pair; the breadcrumb note), app/guides/
checks-before-buying-a-house/page.tsx, app/guides/
buying-a-leasehold-flat/page.tsx, app/guides/
is-this-area-good-for-families/page.tsx (comment
corrections only), tests/seo.test.ts,
tests/seo-pages.test.ts, tests/look-feel-kit.test.ts,
e2e/seo.e2e.ts. Plus this note.

Gate: npm run prepush exits 0 — Prettier clean (one
formatting pass on the new hub view, applied in place),
ESLint 0 errors, typecheck clean, Vitest 1,729 passed /
26 skipped / 0 failed (baseline 1,728 + 1 net new test —
the rendered-hub assertion; the remaining test changes
amended pins in place), next build succeeded with /guides
prerendered as a static route. The 26 skipped are the
golden replay suite (DATABASE_URL unset locally; it
executes in CI's database job). Playwright was not
executed locally; e2e/seo.e2e.ts was verified collected
at 31 specs with `npx playwright test --list`, and their
first execution is the morning CI run.

## CI #207 fixes (18 Nov 2026) — the bare postcode field's phone size, and the Noise pill on the golden bands

Run 44261168879 (commit e714a79): checks, secrets and
database green; the browser job failed 2 of 101 on the
first full-suite execution of the overnight stack. Both
failures were product-side; no e2e spec, fixture, seed
or filed datum changed.

1. e2e/phone.e2e.ts — the landing postcode input
   computed to 14.5px, not 16px.

   Diagnosis. The landing hero's box is PostcodeBox's
   bare form (app/page.tsx; the same form closes every
   content page via SearchBlock). The shared
   .field__input carries `font: inherit` — 16px from
   the body's 1rem — but the bare form's own rule,
   transcribed from the sample at fidelity pass 2, sets
   `.postcode-box--bare .field__input` to 0.90625rem,
   and 0.90625 x 16 = 14.5px exactly: an absolute rem
   override, not a relative size against a scaled
   parent (the root is the default 16px; nothing scales
   it). The suite's other two 16px assertions — the
   wider-area banner and the no-location retry box,
   both the standard form — passed, which confines the
   defect to the bare form. The picker and the other
   /search surfaces use the standard form; the failure
   page and the report door render no postcode input of
   their own.

   Fix. One media block in app/globals.css beside the
   bare rules: at and below the existing stacking
   breakpoint (max-width: 30rem) the bare field
   computes to 1rem — M7.7's adopted 16px floor at
   phone width, so iOS does not zoom on focus. Desktop
   keeps the sample's 14.5px untouched; the button is
   unchanged (its size is asserted nowhere and its tap
   target comes from the kit).

2. e2e/results.e2e.ts (@smoke) — Birkdale's fourth
   pill served "Deprivation — 8 of 10", not "Noise".

   Diagnosis. The serve logic was wrong, on the golden
   data itself — the same masking pattern as CI #206.
   Birkdale's filed noise bands (tests/fixtures/noise:
   the M5.9 values measured through Defra's own WMS,
   filed by the real loader) are road "Below 55 dB" /
   "Below 50 dB", rail "No modelled rail noise" day and
   night (grid value 0 — below the mapping floor, no
   contribution modelled at the point), airport
   likewise. summaryPills' noise factor requires road
   AND rail low, and noiseBandLow accepted only the
   below-range wording, so the rail test failed on the
   state's real name, Noise fell to "neither", and the
   good fill ran Flood, Crime, Deprivation, EPC — in
   the corpus serve and in production alike, since both
   file the same measured values. The D75
   worked-example unit test masked it exactly as the
   flood fixture had in #206: its hand-built area
   fixture gives rail "Below 55 dB" / "Below 50 dB", a
   state Birkdale never serves.

   Fix. noiseBandLow in lib/results.ts now also
   accepts the no-modelled state: no contribution
   modelled at the point is the publisher's lowest
   state, quieter than a real below-range value, and
   D75's "lowest bands" test is a test about quiet,
   not about wording. The served section lines are
   untouched — "Below 55 dB" and "No modelled … noise"
   remain distinct filed states everywhere they are
   printed; only the pill's verdict derivation reads
   them together. noiseBandHigh already treats the
   state correctly (it carries no digits, so it is
   never high). No brain file, fixture, seed or
   replay pin changed.

   Coverage. Two unit tests beside the D75 worked
   example: (a) the golden noise shape — road
   below-range, rail and airport in the no-modelled
   states — asserting the Noise pill is present with
   figure "Quiet" and the strip still reads
   Schools · Flood · Crime · Noise · Deprivation;
   proven against the bug (with the fix line removed
   it fails; restored, it passes); (b) a rail band
   inside the published range (55–59 dB by day) still
   earns no Noise pill, pinning that "low" did not
   widen beyond the two lowest states. The existing
   worked-example test is untouched.

Gate: npm run prepush exits 0 — Prettier clean,
ESLint 0 errors, typecheck clean, Vitest 1,731 passed
/ 26 skipped / 0 failed (baseline 1,729 + 2 net new
tests; the 26 skipped are the golden replay suite,
which executes in CI's database job), next build
succeeds. Playwright was not executed locally (the
seeded stack runs in CI); the two failing specs are
expected to pass on the next run on the strength of
the cascade arithmetic above and the unit pins here.

Changed files: app/globals.css, lib/results.ts,
tests/results.test.ts and this note.

## Parity fix stack (18 Nov 2026) — the pages made exactly like their samples: the whole page, copy AND layout

The founder's ruling (18 Nov 2026), after his side-by-side
of the sample About page against the live one: "match the
samples exactly" means the whole page — copy AND the
entire layout (container width, grids, type scale,
spacing, card forms) — and the parity check is a QA step
Muse runs itself before calling any page done. A
read-only audit of every built page against the Final
Sample Master (papers: scratch-parity/FINDINGS-HOLD.md)
found the copy faithful everywhere and the layout
diverging in nine places. This stack fixes all nine; the
fixes were pre-authorised ("just go ahead and do the
changes"), so no adoption round preceded the build.

D1 — the systemic root cause. `main { max-width:
var(--container-reading) }` (44rem) capped every
`.site-pages` main, so the content pages squeezed into
~640px inside their own 1080px inner and the two paddings
stacked. `main.site-pages` is now exempt (full width, no
padding of its own); `.site-pages__inner` carries the
sample's 1080px measure and padding alone. Hits About,
How we check, Contact, Privacy, Sample report, the
guides and the check pages — everything through
components/ContentPage.tsx included.

D1a — About. The hero takes the sample's `.about-hero`
wrap (h1 2.9rem at an 18ch measure, 2.25rem at ≤720px)
and the six cards the sample's `.about-grid`
(`repeat(auto-fit, minmax(250px, 1fr))`, gap 1.1rem,
margin-top 1.8rem; card h2 1.4rem) in place of the
single stacked `.stack` column.

D2 — the second chrome family. The samples carry two
chromes; the product had one. SiteHeader/SiteFooter gain
a `variant="content"` render — the views 4–8 chrome:
1080px header, the 44px Forest-square mark (radius 12px,
the cream house SVG), the Newsreader wordmark (1.55rem,
Deep) with the tagline under it in plain case, the nav as
a second row under a hairline (dot separators, links
min-height 40px at .95rem/600 Forest, the current page a
Forest pill), and the stacked footer inside the 1080px
container (wordmark-only brand at Newsreader 1.3rem, the
tagline in Newsreader 1.02rem brass-pale, the nav row,
the small print at .84rem rgba(253,248,232,.65), max
70ch) with `margin-top: 0` — the white band between the
cream main and the footer is closed. A new client
wrapper, components/SiteChrome.tsx, applies the content
variant to the .site-pages routes only (/about,
/how-we-check, /contact, /privacy, /sample-report,
/guides, /check); the app chrome is byte-identical on
app pages and the landing remains a match. Two recorded
judgements: the content header nav keeps all five
primary items as live links, Shortlist with its count
badge included (the Master shows Shortlist as a muted
span only because its pages are static snapshots; the
audit's own D2 text describes the badge in this chrome),
and the content footer's small print is the Master's own
closing line for these pages, verbatim, in place of the
app footer's sources line (the default footer render —
which the kit test pins — is untouched). The black
corner TEST label is a recorded 17 Nov ruling and stays.

D3 — Results. The tabs take the sample's bordered panel:
the list gains the tile-line border on three sides
(padding 12px 12px 10px, gap 4px), the panel the border
completed, the white ground and the sample's padding
(6px 20px 16px; 6px 14px 12px at ≤640px). Section
headings take the sample's `.sect` form (.78rem, weight
900, uppercase, letter-spacing .08em, Forest, margin
18px 0 2px, first 6px) — the h3 elements and their
semantics stay; sections lose their own brass-pale rules
(they live only inside tab panels). Truncation rows take
the `.truncRow` form (flex, 1.5px dashed Forest border,
band ground, tile radius, padding 11px 12px, weight 900
at .92rem, hover #FFE9AD). The closing disclaimer takes
the tinted box (#F1F5F3 ground, 1px #DBE6DF border,
radius 10px, .72rem, padding 12px 14px).

D4 — Results rows. Place rows take the sample's `.row`
form: name (700, block) and the detail/rating/sixth-form
lines (.88rem, muted, block) stacked in a left block (a
new `.place-row__main` span in ResultsPage), the
distance chip at the right (align flex-start), the
dashed #E5E0D0 bottom border, 11px padding. Stat tiles
flex-grow (`flex: 1 1 10.5rem`, min-width 10.5rem,
padding 10px 14px, value 1.2rem). Calculator cards are
white with the tile-line border, not Cream/brass-pale.

D5 — Privacy and Contact. Privacy gains the sample's
`.privacy-wrap` (820px, left-aligned). Contact: the
audit brief said the form loses its card, but the Final
Sample Master itself (view 6) carries the form in a card
inside `.contact-wrap` — the Master wins, as it must:
the page (heading, card, email route) sits in the 720px
`.contact-wrap`, the form keeps its `.card`, and the
email route moves below the card as the sample's centred
block — the address in Newsreader 1.35rem/700 Forest (a
new `.addr` form) and the reply promise as a `.promise`
pill (wash ground, line border, radius 999). This
deviation from the brief's wording is recorded here
plainly: the sample is the authority, and its source
carries the card.

D6 — Checking. The checking state takes a 46rem centred
wrapper; its title the sample's clamp
(`clamp(1.9rem, 1.55rem + 1.5vw, 2.2rem)`, Forest, 700,
1.15); the loadbar track #E9E4D4 with margin 20px 0 6px;
row labels flex-basis 16rem; rows align center with the
first row's border-top; the state word 600 muted, done
Forest 800; the spinner 17px with a 3px border (#DBE6DF,
Forest top); the row line .88rem muted.

D7 — Sample report. `.rpt-meta` returns to the sample's
`repeat(4, 1fr)` for its five items; D1 fixes the rest of
that page.

D8 — Shortlist. The page takes the sample's shell: the
1080px frame at the sample's padding (30px 26px 42px;
24px 16px 34px at ≤720px), h1 2.4rem (2rem small), the
lead at 1.13rem, the brass rule. The cards take the
count-keyed grid (one column / two-across /
three-across, stacking at ≤720px), paper-white cards
(1px warm line, radius 16px, padding 1.4rem 1.5rem; card
h2 1.45rem, 1.28rem at three-across), the sale line as
the card's meta (margin-top .45rem, 600, Deep), the
remove button in the sample's `.btn-remove` form (white,
warm line, radius 999, min-height 40px, .9rem/600
Forest). The comparison takes the sample's dress:
margin-top 2.6rem, its h2 1.8rem; the table paper with
the 16px radius and outer border, `table-layout: fixed`,
row hairlines only, the head in Newsreader 1.12rem/600
Deep on the wash, body row heads .88rem uppercase muted,
the foot on the wash, the first column 30% for one home
and 19% for three (a `data-card-count` attribute carries
the count; two homes interpolate at the default share —
the sample has no two-home view). The phone form is one
paper block per home (radius 16px, padding 1.3rem
1.4rem) whose facts are label/value rows (hairline tops,
values right-aligned, block heading Newsreader 1.3rem),
the report button at each block's foot in the sample's
brass button form (also worn in the table foot). The
kept line takes the sample's values (.84rem, muted,
margin-top 2rem). The empty state is the sample's
dashed-brass paper card (radius 16px, padding 1.7rem
1.6rem, max-width 640px, h2 1.6rem) — and the dog
illustration is REMOVED: the sample has none, and the
founder's exact-parity ruling settles it (the asset file
stays in public/ — a unit test pins the illustration set
as the kit's language; only its use here goes).

D9 — Report door. The door centres in a 640px wrap
(`.report-door` on its main); its card is white with the
tile-line border at radius 14px. Dress only — the
holding page's structure and copy are unchanged.

Assertions updated (each moved TO the sample form, none
weakened to keep a divergence):

1. e2e/report-door.e2e.ts — the truncation contract
   locator `.truncation-line a` becomes `a.trunc-row`:
   the row is now the link itself, in the sample's form.
2. tests/results.test.ts — the truncation link-contract
   assertion expected the old bare `<a href>` markup; it
   now expects `<a class="trunc-row" href>` — same href,
   same words, the sample's form.
3. New gate coverage, e2e/seo.e2e.ts, in the suite's
   style: /about renders the content chrome
   (header/footer variants present), its inner measures
   over 1000px at the desktop viewport (the D1 cap would
   give ~704px), `.about-grid` computes at least two
   columns (D1a), and the content footer's top margin is
   0 (the closed band); plus the counter-guard that the
   landing and /shortlist keep the app chrome (no content
   variant), so the second family cannot leak.

One trade-off, recorded: the layout cannot know a
route's family server-side without losing static
prerendering, so SiteChrome switches the chrome on the
client from the pathname — the served HTML carries the
app chrome and the content chrome replaces it in the
same hydration commit. The alternative (rendering both
chromes and hiding one by CSS) was set aside because it
cannot mark the current page's pill, which the sample
shows on every content page; full parity after hydration
was preferred over a permanently missing pill.

One wording note, recorded under ruling 2 of the build:
the sample's truncation row carries richer merged copy
("…and 4 more primary schools — see all of them, plus
sixth forms and the map, in the detailed report —
£4.99"); the product's line is the D-ruled form from
lib/results.ts ("Plus N more … in the detailed report —
£4.99"). The row's DRESS follows the sample exactly; its
words stay the ruled ones — copy rulings outrank sample
transcription, and no D-rule was reopened by this stack.

## The M7.10–M7.12 stacked build (18 Nov 2026)

One stack, eight workstreams (A–H), built in the foldin
tree on 162d0dd and gated as one. The founder's rulings of
18 Nov govern throughout; where a ruling and a sample
conflicted, the ruling won and the Master was conformed in
the same stack.

A — M7.10 calculators. The calculators take the kit's
field classes throughout (16px inputs, 44px targets; the
phone spec now asserts the section at 360px) and a small
Regression E2E spec (e2e/calculators.e2e.ts). The nation
is threaded into the calculators view: for Scotland the
stamp-duty card serves the named LBTT line and for Wales
the named LTT line (each with its official link, no
figures, in the D30 named-line form); the mortgage card is
unchanged for every nation, and England, Northern Ireland
and unknown nations keep the SDLT card exactly. Both cards
are suppressed on the rung-3 wider-area view (the view's
calculators field is null there, like the buy bar). The
two cards keep their independent price boxes; the deposit
is also shown as a percentage, as the deposit field's hint,
derived live from the two figures (the kit's field pattern
has no beside-the-box slot — the placement is recorded
here as a build judgement). Editing any field clears that
card's result; Calculate with no valid price serves "Enter
the price you're considering." on both cards.

B — M7.11 figures in place. The Costs broadband line gains
the sample's caveat, "the exact package at this home
varies by provider". Flood absence states gain the plain
annual-chance explanation, composed at the presentation
layer in lib/results.ts from the served states and the
publisher's own band definitions in lib/flood.ts (no brain
or bundle-shape change): the rivers-and-sea no-band state
carries the Very low definition ("a chance of flooding in
any given year of less than 1 in 1,000"), the surface-water
below-lowest state names the extreme 1-in-1,000-year
picture it appears in. Of the prep's minor bundle, only
O-3 was folded: the sixth-form yes-form is now the
sample's plain line, "Sixth form at the school". The
"School places & catchments" duplication is kept, as
ruled (a deliberate deviation); the A&E row line and the
unrated-row silence stand.

C — M7.12 check pages. All fifteen /check/ pages are
deepened in lib/check-pages.ts to carry "How the figure is
produced", "Where the data comes from" and "Known limits"
sections, their existing copy preserved. The payloads: the
crime page carries the D39 calibration working in full
(the mile's recorded crimes over the Census 2021 residents
of the LSOAs containing the postcodes within that mile,
each LSOA counted whole; the England pair likewise); the
air-quality page carries D50 in full (the UK Air Quality
Standards Regulations 2010 annual means against the WHO
2021 guidelines, the modelled square named as not a
compliance determination), the AQMA and charging-zones
explainer and the regulated-industrial-sites explainer
(Environment Agency Pollution Inventory, 2024 vintage
published Nov 2025, England only, below-threshold returns
named never numbered); the flood page carries D49 in full
(the Agency's own defence assets only; UKCP18, RCP 8.5,
the Central and Higher Central allowances with their
epochs). The air page's live dead end is fixed: its limits
material now lives in its own limits section, not "on the
How we check page". Charging zones are written
"Clean-Air Zones" hyphenated throughout the new copy
because tests/banned-wording.ts bans the substring "clean
air". Editions are named only where the repo sources them;
eight pages (flood-risk, schools, epc, council-tax-band,
planning-constraints, ev-charging, public-transport,
family-essentials) honestly carry publisher + "as
published" with no edition. Results-side, the links to the
check pages live ONLY in the new 'About these checks'
expander — recorded plainly: the build brief called that
expander existing, and it was not, in the product or in
any of the Master's sixteen views; the founder's ruling
(links in the expander, no per-section lines) was
therefore built by CREATING it — a collapsed details block
in the kit's dress at the foot of the results page, after
the calculators and before the closing disclaimer, listing
one link per check present in the view in tab order,
labels taken from lib/check-pages.ts itself. The Master
was NOT given a matching expander (outside the briefed
Master edits); parity for it is the founder's call. The
How-we-check overview gains its tenth card, "Air quality &
noise", seventh in the order — drafted into the Master
first (the founder finalises its wording before the
sample change counts as final), then conformed into
lib/site-pages.ts with the Master's exact words.

D — Sample-report anonymisation (founder bug report,
18 Nov). The product's /sample-report presented the
founder's real home with its real figures; it now presents
an invented dummy throughout — 14 Bramblewood Lane,
Ashmere, Kingsmere, Westshire WM8 4QT (WM is not a real
postcode area, so it cannot resolve to a real home) — with
every figure rebuilt dummy and internally consistent, and
its banner says so. Both flood-map images depicted the
real locality, so their uses are replaced with neutral
inline-SVG schematic panels and the image files are
DELETED (public/sample-report/, both PNGs and their .b64
sources, with the materialise entries and the asset pin
removed — the push must express the deletions or the maps
return). A new test pins the served page free of
"Birkdale" and "CM3 2JT". The Master's own worked example
was anonymised in the same stack (see E) to a DIFFERENT
dummy — 12 Willow Close, Millbrook MB3 4QX — so the Master
and the product now carry two different invented sample
homes; aligning them on one dummy is an open point for the
founder, recorded here rather than silently picked.

E — Chrome unification (founder rulings, 18 Nov, under
D70). One header on every page: the landing form — one-line
Roof-Tick mark, brass capitalised tagline, single row, nav
right (How we check · Sample report · About · Shortlist ·
Contact, the count badge kept) — with the mark plus the
"Check My Next Home" title as ONE link home. One footer:
the landing form, its link row gaining "Privacy policy",
and "Data from named official sources. Facts, not scores."
very small at the extreme bottom-right. The content chrome
(square mark, second-row nav with pill, the long closing
line as footer small print) is retired in the product and
in the Master alike; the Master's views were conformed to
the unified chrome in the same stack (view 11, the email,
keeps no header or footer by design), and its worked
example was anonymised there (see D). Tests assert the
unified header and footer render identically across a
landing route, a content route, the shortlist and a
results route, and the retired forms are asserted absent.

F — The gift claim samples are folded into the Final
Sample Master as new views after the sixteen, taken
exactly from the check-together-gift-claim-flow-samples
artifact in their final approved forms (Claim; Claimed;
Same email as the buyer; Claimed with a different email;
Already used; Expired, the £4.99 clause included; Link not
recognised) — no rewording, none on the landing page, the
Master's unified chrome where a screen carries chrome.

G — The no-location page retired (founder finding, 18 Nov,
play-server review). The standalone "We couldn't place
that" page is gone: an input that can't be placed returns
the visitor to the LANDING page with a small notice at its
search box, and a direct hit on the bare /search route
redirects there the same way (the routing table's rung-4
destination is now the landing URL with the notice flag;
the /search route's own unplaceable exits redirect there
too; a full postcode arriving in the outward slot re-enters
through the postcode form). The notice, drafted from the
retired page's line and kept short for its seat, reads:
"We couldn't place that — try a full postcode, for example
SW1A 1AA, or a full address with its postcode. A street or
place name on its own isn't enough." It renders from a
small client island on the landing page, so the landing
stays static; the founder reviews the copy at UAT. The
in-context not-found line on the picker and wider-area
pages (postcodeNotFoundLine) is untouched — it was always
a small in-page line — and the whole-check failure state
is untouched: a failed check is not an unplaceable input.

H — The Postio warm-path fix (bug found live, 18 Nov; the
full evidence and reasoning are in docs/entry-point.md).
The list memory in lib/server/hybrid.ts is anchored to
globalThis, so the /search render and the /api/pick route
share the ONE memory even when the production bundle loads
the module more than once, and its key is normalised with
normalisePostcode on write and read alike. The warm-pick
pin now asserts via=memory explicitly, and a new scenario
simulates the instance split by re-importing the module
between the list and the pick. No other hybrid behaviour
moves.

Shortlist sample-parity fix (founder finding, 18 Nov 2026;
read-only parity check of Final Sample Master views 14–16
against the product /shortlist). Six divergences fixed,
nothing else moved:

1. The page surface is the sample's frame: .shortlist-page
   now sits on Cream with the sample's 1px warm border,
   18px radius and a soft shadow at the 1080px measure,
   scoped to this route alone — the paper-white cards,
   empty card, search card and compare table sit on the
   cream. Modest vertical margins let the frame read as a
   frame against the chrome.
2. The empty state gains the sample's "Check a home" card
   under the empty card, in the sample's exact card dress
   (paper, 1px solid warm line, 16px radius, 1.6rem/1.7rem
   padding, 640px, 1.8rem above it). Recorded implementation
   judgement: the card carries the product's own PostcodeBox
   in its bare form — suggestions dropdown and all — rather
   than the sample's plain form, so searching from here is
   the landing search exactly; the sample's row measures
   (52px field and button, 10px field radius) are applied
   inside this card only, and the row runs the card's full
   width. The box's accessible name stays its own label
   ("Postcode or address", visually hidden) where the
   sample's plain form used aria-label "Postcode".
3. The lead is state-shaped, as the sample's is: the empty
   state carries none; the saved states carry exactly
   "Nothing about which homes you are considering is stored
   on any server." (SHORTLIST_LEAD_LINE in lib/shortlist.ts).
   The old first sentence ("The homes you've saved, side by
   side.") is removed. Because only the client island knows
   the state, the page head (h1, lead, brass rule) now
   renders inside the island per state; the server shell
   renders the framed main and the island only. (The route's
   metadata description keeps its own wording — it is not
   the lead.)
4. Three-across cards take the frame's full width
   (.shortlist-cards--three max-width: none, ~1028px inside
   the frame); one/two-across keep the 820px column.
5. The compare table's first header cell is visually blank
   with sr-only "Check" text, as the sample.
6. Compare-table column headers are the address alone —
   the muted sale line under the address is removed from
   the table header (its CSS went with it); the cards keep
   their sale line, and the phone form keeps its own.

Kept deliberately, per the parity check: the distance
pills' tinted colours (D75), the 44px remove-button height
(M7.7), the product-wide Forest heading colour, and every
form the check verified as matching. Pins:
tests/shortlist.test.ts ("the sample-parity forms
(views 14–16)") covers
the frame, the lead per state at source level, the search
card's presence in the empty branch only, the three-across
width rule and the header forms; e2e/shortlist.e2e.ts
proves the lead and search card live in the empty, two-home
and three-home states and the header forms in the served
table.

## Stale sample-report expectation fix (18 Nov 2026)

CI run #213 on main 99f74d8 came back with three jobs green
and the browser job at 109 passed / 1 failed: the single
failure was e2e/seo.e2e.ts, "the chrome pages render their
finalised headings", which still expected the /sample-report
H1 to read "19 Birkdale Rise" — a leftover from before the
sample report's anonymisation. The anonymisation is correct
(the served H1 is the invented home, "14 Bramblewood Lane",
components/SampleReport.tsx), so the expectation was updated
to match it exactly. A sweep of e2e/ and tests/ for "19
Birkdale Rise", "Birkdale" and "CM3 2JT" found no other stale
expectation: every remaining hit concerns the golden-corpus
Birkdale home served through the results journey (picker,
results header, fixtures, replay and loader data), which is
legitimate and untouched, and tests/sample-report.test.ts
already pins the served sample page free of the real street
name and postcode.

## CI #215 fix (18 Nov 2026) — the two Beaulieu picker specs asserted the pre-preload world

CI run #215 on main 2cbc267 (the M7.15B national preload)
came back with checks, secrets and database green and the
browser job at 108 passed / 2 failed: e2e/journey.e2e.ts
"Beaulieu CM1 6ER: the empty picker is one named state…"
and e2e/results.e2e.ts "rung 2 at Beaulieu CM1 6ER: the
pinned label with the picker embedded…" both expected
`.picker__empty-line` ("No addresses we can list for this
postcode yet.") and the element was not found.

Diagnosis — stale specs, not a serve regression (the
CI #213 pattern). The browser harness seeds through
scripts/seed-golden.mjs, whose runner fixture pass now
files both halves of the picking index (run-loaders.mjs
runs load-picking-index and load-epc-index over
tests/fixtures), and the EPC fixture slice carries
Beaulieu's 49 certificates — the odd numbers on George
Heard Crescent. The union read model serves those 49
homes in the picker on both surfaces (the rung-1 picker
page and the rung-2 embedded picker share pickerRowsFor),
so the picker renders its list branch, not the empty
branch. The database job's green run over the identical
fixture pass proves the index files in this
configuration; had the index been empty in the seed, the
read model degrades to filed-only — and Beaulieu has no
filed sales, so the empty line would have rendered and
both specs would have passed. The failure is only
explicable by the picker being full, which is the
preload working as adopted.

The fix asserts the served world. Both Beaulieu specs
now pin the new truth: no empty line, the count line
"49 addresses", and the "49 George Heard Crescent" row
present; the journey spec keeps its postcode-level path
(the whole-postcode link through to the rung-2 label),
and a new journey spec pins the durable-key behaviour —
picking the index-only home confirms onto the canonical
home route (`home=49||GEORGE HEARD CRESCENT`), never a
transient token, and reaches its results. The
empty-picker coverage is re-homed, not deleted: new
journey and rung-2 specs run it on Southminster
CM0 7AA, the neither-source witness — the directory
fixture holds the postcode, and no seeded fixture files
a sale, a certificate or an index row for it (verified
across every fixture the seed files), so its union is
empty and the named empty state is its served truth.

Sweep: the only `.picker__empty-line` expectations in
the suite were the two fixed. The calculators spec's
Beaulieu premise (no filed sale, so the postcode-level
calculators start empty) is untouched by the index —
the index carries address parts only and no brain reads
it — and it passed #215 as it stands. The EPC index
fixture also covers CM3 2JT, E16 1GN and KT17 1FH, whose
picker specs (Birkdale, Exeter, Minerva) all passed
#215 against the union world; no other spec asserts a
picker count or an exhaustive picker list. The unit
suite was already aligned by the build itself
(tests/entry-point.test.ts scenario (e) asserts Beaulieu
EPC-covered; tests/picking-index.test.ts pins the union;
the invariant test proves a golden bundle byte-identical
with the index present) and the checks job was green.

Masking note: each changed spec now asserts the world
the seeded harness actually serves — Beaulieu's picker
full of the fixture's own certificate homes, CM0 7AA's
empty — and the proof is the seed chain itself
(serve-e2e → seed-golden → the runner's fixture pass →
the two loaders over the fixture slices whose contents
are enumerated above), not a fixture hand-built to make
the assertion pass.

## CI #216 fix (18 Nov 2026) — the CM0 7AA rung-2 spec asserted a settled page the harness leaves permanently cold

CI run #216 on main cbfe92d (the CI #215 fix) came back
with checks, secrets and database green and the browser
job at 112 passed / 1 failed: e2e/results.e2e.ts "rung 2
at Southminster CM0 7AA: the pinned label with the empty
picker embedded at the head of the page". The pinned
label assertion passed ("Postcode area — CM0 7AA, not
one exact home"), but the `.results` container never
appeared within 30s, so the spec never reached its
empty-picker assertion. Identical on retry. Every
Beaulieu spec passed, and the CM0 7AA journey spec
passed — but that spec only asserts the URL and the
heading after the whole-postcode click; it never waits
for `.results`, so it never proved the page settles.

Diagnosis — the spec asserted a state the seeded corpus
makes unreachable; the serve path behaved exactly as
designed. The chain:

1. The results page reveals `.results` only when the
   checking screen advances, which needs its three
   /api/check calls settled AND the server-rendered
   derivation (`checkResults`) complete. Both paths run
   `buildSoldPricesBundle` for the postcode.
2. CM0 7AA is held in the directory (its ONSPD fixture
   row) but has NOTHING else filed — and, crucially, no
   sold-prices load stamp. The seed stamps no-sale
   postcodes only for the golden set in
   tests/fixtures/replay/directory-rows.json (CM1 6ER
   among them); CM0 7AA arrived via the ONSPD directory
   fixture, outside that loop, so no stamp.
3. A covered postcode with no filed rows and no stamp
   is loaded on first check (D23: "an answer is never
   read from emptiness" — pinned in the sold-prices
   suite: the load precedes every figure, and
   loaded-none is served only after a load). The
   brain-invoked load spawns load-sold-prices.mjs with
   no fixture directory, which streams the full
   pp-complete.csv (5.3+ GB) from the Land Registry's
   public endpoint, with no timeout anywhere in the
   chain by design — a production first load takes as
   long as the stream takes, once per postcode, and the
   stamp makes every later check instant.
4. So every render and every /api/check/area call for
   CM0 7AA in the harness starts a fresh multi-GB
   stream that cannot finish inside a 30s assertion
   window; the stamp never lands, and `.results` never
   appears. The other brains are not the blocker: crime
   catches its cold-load failure into the not-filed
   state and its live load is Police.uk API calls (the
   same first-check load Beaulieu's passing specs ride
   on), the EPC cold load fails fast with no token in
   the harness, flood's live-warnings hook is budgeted
   at 2 seconds, and the embedded picker's Postio
   supplement is inert without a key. Beaulieu differs
   in exactly one load-bearing way: the seed stamps it,
   so its derivation settles from filed data alone.

The designed behaviour is not a defect: a brand-new
postcode's first check paying the one-time cold load —
checking screen up, no figures read from emptiness —
is the M6.3/D23 doctrine, unit-pinned, and the
whole-check failure page is the designed surface when
a load fails outright. What was wrong is the harness
corpus: the witness was left permanently cold, a state
no production postcode stays in after its first check.

The fix completes the corpus, and the spec keeps every
assertion. scripts/seed-golden.mjs now runs the
sold-prices loader over the assembled fixture dir for
CM0 7AA (the fixture file holds no CM0 rows — verified
by grep across the land-registry fixtures — so it
files none) and stamps it with the same guards as the
golden no-sale postcodes, recording the witness's
position in the seed's header: loaded, none recorded.
CM0 7AA's rung-2 page now settles exactly as a
production postcode's does after its first check —
picker empty, sold prices loaded-none, crime and EPC
not-filed — and the results spec's comment names the
stamp as the reason it can assert the settled page.
The spec's navigation (the direct rung-2 URL, the same
form as the Beaulieu and Birkdale specs) and all its
assertions are unchanged.

A local pin closes the masking gap the failure named —
every rung-2 postcode the unit suites composed before
now carried SOME filed data. A new test in
tests/short-bundle.test.ts ("a zero-filed postcode
settles") composes the exact derivation the results
route awaits — the five real builders over fake
sources in their zero states (sold stamped loaded-none,
crime's load failing into not-filed, flood's layers
unfiled, the area sections not-filed), the short
derivation and the results view — and asserts it
completes with the honest states, the pinned scope
label and the four tabs.

Sweep: every other postcode the e2e suite drives to a
results page is filed or stamped (CM3 2JT, E16 1GN,
KT17 1FH, CF11 8AA), not-covered (EH1 1AD — the
Scotland branch renders without the checking screen
and its builders short-circuit on coverage before any
load), a wider-area outward code (rung 3, whose
builders answer named states without touching their
sources), or unheld (ZZ1 1ZZ, CM3 2JA — the
couldn't-place and wider-area paths, no results
render). CM0 7AA was the only covered, unstamped,
zero-filed postcode at rung 2.

## Natural address order (18 Nov 2026) — founder-flagged fidelity fix

The founder's own play-server test (18 Nov 2026,
screenshots in the chat) compared the site's Homes
dropdown for E16 1GN against Royal Mail's address
finder. Royal Mail lists Exeter Road in natural number
order (1, 2, 3, 4, 5, 6, 7, 10, 12, 14); the site
listed the homes it holds as "1, 10, 14, 3, 5, 6, 7
Exeter Road" — string order, inherited from the filed
queries' ORDER BY street, paon, saon and from the
union's filed-then-index concatenation. (The two lists
also differ in membership — Royal Mail's is the full
PAF list; the site's is the homes the local layers
hold. That residue is the PAF backstop's known gap,
not this fix.) He asked for our lists sorted the
Royal Mail way.

The fix introduces ONE shared comparator,
compareAddressParts in lib/address.ts, and applies it
at every point a served home list is ordered:

- the picking union (lib/server/picking-index.ts) now
  serves filed + index-only rows as one merged list in
  natural order — the filed form still wins collisions
  at the dedupe, but precedence no longer groups the
  display;
- the suggestions dropdown (lib/server/suggestions.ts)
  applies the same comparator to the homes it serves,
  so the capped eight are the first eight in natural
  order;
- the picker's merged list (pickerList in
  lib/server/hybrid.ts) is sorted after the local +
  Postio merge and dedupe — a Postio row interleaves
  between local rows by address, never appended as a
  block;
- the resolver's own rung-2 list (sortAddresses in
  lib/address.ts) now delegates to the same comparator,
  so the degraded-picker fallback path and the narrowed
  lists read identically.

The comparator's key: street (case-folded); the
building part's number numerically, then its letter
suffix (535, 535A, 536); at the same street number, a
plain numbered house before a named building, named
buildings alphabetical by name; the flat/unit number
numerically, then its suffix (Flat 2 before Flat 10);
the display label as the final tiebreak.

Refinement (18 Nov 2026, the founder's E16 1GF
screenshots): a number the building part carries
anywhere — leading, trailing, or after a comma
("TILLY COURT, 29") — is the building's street number
for ordering, so a named building interleaves among
the numbered houses at that number: Royal Mail lists
"1, Tilly Court, 29 Hastings Road" and its neighbour
flat between 27 and 31 Hastings Road, and Minerva
House 12 sits at 12 on Ceres Crescent, not after the
street's numbered run. Only a building part with no
number at all (ROSE COTTAGE) still follows the whole
numbered run, alphabetical among the numberless.

Surfaces checked and deliberately left: the shortlist
renders in saved order and never re-sorts (the
visitor's own order, by design); the results and
nearby lists are ordered by distance, the sold-prices
history by date, the crime breakdown by count — none
is an address order, so none follows this rule.

Pins: tests/picking-index.test.ts gains a "natural
address order" describe — the Exeter witness (filed
1, 10, 14 + index 3, 5, 6, 7 merge to 1, 3, 5, 6, 7,
10, 14), the Beaulieu odd numbers (1, 3, 5 … 97, not
1, 11, 13 …), the Minerva flats (Flat 1 … Flat 12
across both sources; the witnessed house holds 1–9,
10–12 added so the pin discriminates natural from
string order), the suffix/named rules (535, 535A, 536;
MINERVA HOUSE, 12 interleaving at 12 between 10 and
14; ROSE COTTAGE, numberless, after the numbered
run), and the Tilly Court witness (27, the Tilly
Court flats at 29 in flat order, 31 — the founder's
E16 1GF screenshots). tests/entry-point.test.ts:
the (d) combination spec is retitled (it pinned "local
rows first"; its expectations stand, as on that fixture
the two orders coincide) and gains an interleave pin
(local 2 and 10, Postio 1 and 3 serve as 1, 2, 3, 10
with sources interleaved); the (e) Beaulieu specs now
assert the exact served order at the picker and at the
dropdown cap; the (b) Minerva spec asserts the flats'
exact order. docs/entry-point.md's scenario table is
updated to match.

## The full-postcode dropdown (18 Nov 2026) — D71 amendment

A second finding from the same play-server test round,
ruled by the founder the same day: the dropdown's cap
of 8 hid homes on a full postcode. At CM3 2JT the
served eight stopped at 18 Birkdale Rise; his own 19
Birkdale Rise — filed, with its sale — sat past the
cut, on a street the site holds in full. Natural order
alone could not cure it (in number order 19 is
thirteenth of the street's 27 served homes), so D71 is
amended: **for a full postcode, the dropdown carries
that postcode's complete home list**. The sentence in
the natural-order section above — "the capped eight
are the first eight in natural order" — is superseded
for the full-postcode shape by this section; the cap
of 8 still governs every fragment shape (partial
postcodes, fragments, mixed groups), and M7.15C's
Streets group will live under that fragment cap.

The dress, in the samples' design language (no sample
depicts the open dropdown — gap item S-1 — so this is
built in the shell's own language, as the dropdown
itself was): the panel, its shell and the "Postcodes" /
"Homes" group labels are unchanged. A group's list
becomes a scrollable region — its height capped at
roughly eight rows (19rem, and never more than 60% of
the viewport) with the group label pinned above it —
so a long list reads as one labelled, scrollable list,
exactly the shape of Royal Mail's finder the founder
compared against. A short list never reaches the cap
and renders pixel-identically to before.

Behaviour: the keyboard walks the FULL list (up/down
traverse every row, not just the visible ones) and the
active row is scrolled into view inside the region as
it moves; Enter picks it; the mouse picks any row,
below the fold included. Server side, the list is the
picking union complete and naturally ordered, address
words typed with the postcode filter within the full
list, and the one remaining bound is a defensive
ceiling of 1,000 that logs if ever hit (the build note
in docs/entry-point.md carries the detail).

Pins: tests/entry-point.test.ts — scenario (a) serves
all 30 Birkdale homes, scenario (e) all 49 Beaulieu
homes (both specs previously asserted the cap of 8 on
a full-postcode query and were updated to the new
rule), plus the amendment's bounds describe (fragment
cap kept; filtering within the full list; the ceiling
logs). e2e/suggest.e2e.ts pins the founder's own case
on the served app: the CM3 2JT dropdown contains
19 Birkdale Rise in a scrollable region, the keyboard
reaches it scrolled into view, Enter lands in its
check, and the last home picks by mouse.

## Parity fix batch (18 Nov 2026) — the audit items, the picker removal, and CI #218

The founder's parity audit of the play server against
the Final Sample Master (which governs every conflict,
copy AND layout) produced 45 numbered items across the
landing, checking, results, privacy and shortlist
surfaces; this batch builds the approved set, removes
the picker page on the founder's ruling of the same
day, and fixes CI #218. Excluded by ruling and NOT
touched: item 10 (play-server seed coverage — no code
change), 13/17/18 (rulings/open call), 27 (company
ownership, HMLR-gated), 32 (contact wiring), 34–38
(the wider-area page, founder decision pending), 42
(the 44px Remove stands), 33 (already fixed on the
Master).

**Landing.** Item 1: the hero kicker loses its full
stop (`SITE_KICKER`); the stopped form remains only in
the manifesto block (`SITE_MANIFESTO`).

**Checking screen.** Items 2–4: the screen renders
standalone — never inside the results shell — with the
Master's slim eyebrow as its only address reference
(`<b>street address</b> · town · <b>postcode</b>`; the
postcode alone at rung 2), its heading in the page-title
form, and neither the "Back to the address list" link
nor the visible status line.

**Results page.** Item 5: the H1 carries the postcode
("19 Birkdale Rise, CM3 2JT"). Item 6: "Shortlist this
home" and the priced "Get the full report — £4.99" sit
level with the H1 in the new `.results-head` flex row;
the buy bar stays below. Item 7: each summary pill is
ONE white pill — label, "·" separator, tinted figure
chip. Item 8: no pill-code change was needed — the
selection already implements D75; the live Exeter
departure traced to item 9's corrupt England figure
flipping Crime's band, and three pins now lock the
strip against the diagnosis (an Exeter-shaped pair, a
null England figure admitting no Crime pill, and the
corrupt 933,039 figure reading "Below England
average"). Item 9 (code half): the crime brain serves
the England comparison only from a credibly national
base — `ENGLAND_BASE_MIN_RESIDENTS` (30,000,000) in
lib/crime.ts and `ENGLAND_BASE_MIN_AREAS` (30,000) in
the loader — and the figure always formats to one
decimal; below the guard the local rate serves WITHOUT
the comparison. (The data half, the national LSOA load,
is a separate server operation.) Item 11: school rows
carry their composed detail (ages, road, Ofsted outcome
— the inspection date lives in the truncation line, as
the Master composes it). Item 12: the grammar line
exists — the nearest selective school is searched over
a 10-mile grammar radius when none is within the list,
and renders as the Master's starred row with its
SELECTIVE — TEST ENTRY badge (Birkdale's golden truth:
KEGS 6.1 mi). Item 14: exactly ONE truncation upsell
per truncated group, in the Master's merged truncRow
form (lead + detail + £4.99 chip + "Get the full report
→"); the section-level upsell panel is gone, its rows
now the same truncRow. Item 15: per-section source
lines no longer render on the results page (sources
live on the check pages and in the report). Item 16:
the short disclaimer line under the pills is removed.
Item 19: the buy-bar button is the unpriced "Get the
full report"; the priced form is only the head's.
Item 20: sold history is the Master's four stat tiles
(Last sale with its human date and "• Land Registry";
Times sold; Change since prev. with the previous sale
named; Held by last owner in the "4 years 3 months"
form) over a rung-1 own-sales projection on the short
bundle, plus the property-type line ending "These
figures describe recorded sales only — they are not a
valuation of this home."; every date on the section is
human-formatted. The D23 median line is retained,
human-dated — the audit did not call for its removal.
Item 21: the EPC row leads Costs in the Master's
certificate form (band, score, potential band + score
— the loader now files `ratingPotential` and the area
bundle serves it — and the validity date, registration

- 10 years). Item 22: council tax is stated ONCE, as
  the Master's single Band D line with its £/MONTH and
  BAND badges; the duplicate restatement is gone.
  Item 23: air quality is the Master's single MODELLED
  line — all three pollutants at two decimals — with the
  Defra fineprint. Item 24: noise is one MODELLED line
  (road, rail, airport in that order; "below X dB" forms;
  ranges as filed) with "Defra modelled bands."
  Item 25: flood is two verdict blocks with CHECK tags;
  no live warnings reads "No live flood warnings are in
  force for this area just now."; the timestamped warning
  block and the dataset-wording leads are gone, and the
  flood-zone layer moves to report depth. Item 26:
  planning lines are compact FACTS-tagged lines; every
  distance goes through the uniform 1-decimal
  `formatMiles`; beyond-nearest lines name what the
  feature is the nearest OF. Item 28: a hospital whose
  name leads both the A&E and maternity groups appears
  once (the maternity group yields). Item 29: place rows
  carry composed detail lines from filed data — schools,
  nurseries, GP, dentist, pharmacy, A&E and maternity
  from their filed addresses/ratings; the categories
  whose datasets file no detail fields (station, bus
  stop, supermarket, food-and-drink, leisure, parks,
  libraries, vets, the pet categories) cannot be composed
  and are recorded NOT FIXED in the batch report.
  Item 30: worship detail renders the capitalised
  religion display form, never the raw OSM tag; OSM files
  religion only, not denomination, so the Master's
  "Church of England" cannot be stated from held data —
  recorded PARTIAL. Item 31: headings conformed —
  "Parks", "Leisure", "Nurseries".

**Shortlist.** Item 39: the header count badge is
brass with deep-forest text at the Master's 22px.
Item 40: the add button takes the Master's form (white
pill, 48px, 0.98rem at 700); the saved state is the
pale green #DFF0E2 with its green-line border.
Item 41: the EMPTY state's search card is the sample's
plain form — a text input ("Enter a postcode — e.g.
SW1A 1AA") and a brass "Check this home" submit, no
suggestions and no picker behaviour; the saved states'
PostcodeBox is untouched. Item 43: comparison miles
are plain bold forest text after a "·" — the tinted
pills are gone. Item 44: the phone comparison form
drops its extra sale line. Item 45: the comparison
table's foot row opens with `<th scope="row">`
carrying the screen-reader-only "Reports" label.

**The picker removal (founder ruling, 18 Nov 2026).**
The picker-dress items raised from the founder's KT1
1JS screenshot were cancelled as moot the same day:
the page itself is removed. A full-postcode button
press goes to the whole-postcode check; that page
carries the full home list at its head (the union read
model, natural order, uncapped; the `pickerList` hybrid
— local union + Postio supplement below the floor —
re-points to it); `/search?postcode=` redirects to the
check; the dropdown's Postcodes group links straight
there; Scotland/NI routing is untouched. The full
ruling note lives in docs/entry-point.md.
`components/AddressPicker.tsx` is deleted; the list
lives in `components/HomeList.tsx`. Every earlier
section of this document that describes the picker as
a page (the D70/D73 journey descriptions, the CI #215
note) describes the pre-removal world — the list, its
union and its order are unchanged; only its home moved.

**CI #218.** The browser job's one failure was a spec
race, not a product defect: after typing "E161" the
panel correctly holds TWO options (the seeded corpus
legitimately holds E16 1GN and E16 1EG), and the spec's
one-shot count read that pair before the debounced
"E161G" response repainted. The unit pins prove the
served set for "E161G" is exactly ["E16 1GN"]. The
spec now asserts the narrowed count in Playwright's
retrying form, with the diagnosis recorded at the
assertion.

**Re-pins taken under the Master's authority** (each
recorded in the batch report): the bundle shapes for
`ServedCertificate.potentialRating` and
`ShortSoldPrices.ownSales` (five pins in
tests/fixtures/replay/bundle-shapes.json); the D37
figure register gains the ownSales leaves under the
existing "sold.own-sale" explainer; the results,
journey, entry-point, nearby (the Exeter grammar
re-pin: Bexley Grammar School, 5.484 mi), home-page and
shortlist expectations updated to the Master's forms
and the new journey. The golden-home bundle invariant
holds: a golden home's sold-prices bundle is
byte-identical with the picking index present or
absent — the own-sales projection derives from the
already-filed own history and adds no served figure to
the full bundle.

### Follow-up (18 Nov 2026) — CI #220: the specs catch up with the batch

CI #220 on the batch's HEAD passed checks and secrets;
the database job failed one test and the browser job
twelve specs. Every failure traced to a spec or fixture
still asserting the PRE-BATCH served form where the
batch deliberately changed the form under the founder's
approval. Each fix below was verified against the
serving code before the expectation moved; no product
code changed (the two candidate product bugs — the
phone home list and the two-instance shortlist control —
were verified as correct product behaviour; both
failures were spec-side).

**The golden-replay pin (database).** The replay's
crime-calibration test asserted the England figure as an
arithmetic identity on the excerpted corpus: the fixture
total 5,503,997 over the three golden LSOAs' 5,899
residents → 933,039 per 1,000. That pin had captured the
thin-base bug's own output — the very figure item 9's
guard exists to suppress. Under
`ENGLAND_BASE_MIN_RESIDENTS` the excerpt's base is not a
national base, so the served England figure is correctly
absent on the replay corpus and the pin now asserts
exactly that (`englandFigure` is null for the three
golden homes; their per-head goldens stand). Item 9's
guard supersedes the pin; the production pair (51.7
against 94.5) remains pinned at unit level.

**Browser specs.** e2e/headlines.e2e.ts: the built-up
line now pins item 26's compact form ("Inside the X
built-up area"). e2e/home.e2e.ts: the hero kicker pins
item 1's stop-less form. e2e/phone.e2e.ts: the home-list
spec now waits for the first `.picker__row` before
counting — the list renders inside the results behind
the checking screen's advance (components/HomeList.tsx
on the rung-2 results), and the one-shot count raced
the advance and read zero; the list itself renders as
designed. e2e/results.e2e.ts: the Birkdale strip pins
the guarded four pills (Schools · Flood · Noise ·
Deprivation — no Crime pill without an England figure,
per item 8's unit pins); the crime assertions in the
smoke, refresh and calibration specs pin the guarded
served text (the total line and window line, with the
England comparison asserted absent); the flood spec
pins item 25's "No live flood warnings are in force
for this area just now."; the air-noise spec pins item
24's single line ("Road noise day below 55 dB and
night below 50 dB" with the Defra fineprint).
e2e/shortlist.e2e.ts: the comparison miles pin item
43's plain form (`.compare-mi`, "name · 0.4 mi", no
tinted class); the at-3-saved spec now exercises BOTH
shortlist instances (item 6) — each carries its own
full-notice state, tapping either at full shows the
message in that place and saves nothing, and the saved
state stays in sync through the change subscription.

### Follow-up (18 Nov 2026) — CI #221: two diagnoses, both spec-side

CI #221 on the fix round's HEAD passed checks, secrets
and database in full (the golden-replay correction
held); the browser job passed 112 of 116. The four
failures sat in two clusters, each diagnosed to its
mechanism before any expectation moved. No product
code and no seed code changed in this round either.

**Cluster A — the headlines costs lead (3 specs).** The
specs filter the Costs section's line texts for the
composed monthly lead and found none. The lead was
never removed: the batch's Costs recomposition (items
21–22) changed its BLOCK TYPE from a plain `line` to a
`tagged-line` — the Master's own form, whose Costs
section carries the lead as a `.row` with the
£ / MONTH badge, verified in the sample file — and the
renderer maps `line` to `.results-line` but
`tagged-line` to `.results-row` (text in
`.results-row__text`). The spec enumerated only
`.results-line`, so the lead was invisible to the
filter while the section-level text assertion on the
same lead passed. Pre-batch (2a7e1c6) the lead was a
plain line and the filter saw it; in CI #220 the
assertion sat masked behind the built-up-area failure.
The lead's substance is unchanged and required: M7.9's
record settles the composed lead as the permitted D33
form (the two derived monthly figures in one line,
each half restated in its own section, "Mortgage not
included"); D33's never-sum rule binds the brains'
served shapes (no total-like field) and bars a
standalone cost-of-ownership headline — neither is
breached, and item 22's dedupe stands (the council-tax
fact is stated once, in its tagged row). Fix: the
spec's enumeration now covers both rendered line forms
(`.results-line, .results-row__text`); the
exactly-one-monthly-total assertion and the
COMPOSED_LEAD match are unchanged.

**Cluster B — the Birkdale pill count (1 spec), and a
correction to the CI #220 follow-up above.** That
follow-up's sentence "the Birkdale strip pins the
guarded four pills" records an inference, not an
observation: CI #220's smoke spec failed at nth(2)
(expected "Crime", received "Noise") before any count
was asserted, so the count was never observed in #220.
The inference was drawn from the unit pill fixtures —
whose `shortSections()` stub carries the EPC section
at headlineBand C, a "neither" fact under D75, so no
EPC pill can serve in those pins. The seeded corpus's
Birkdale home carries a band-B certificate: EPC is a
good fact, fourth in the good fill (Flood · Noise ·
Deprivation · EPC) behind the one concerning fact
(Schools), and the strip is FIVE pills —
Schools · Flood · Noise · Deprivation · EPC — in both
runs, deterministically. The pill logic reads the same
`englandFigure` the crime section reads, so the
strip and the section cannot disagree: the section
served the guarded form in #221 (the calibration spec
passed) because the seeded base can never pass the
guard — `nationalForWindow` needs every window month
filed in crime_national_months AND at least 30,000
E01 areas in lsoa_bases (the fixture holds the golden
rows only), so every seeded artefact's `national`
stays null. No run-to-run variance mechanism exists:
every Birkdale pill input is filed by the seed before
the server starts, and no cold load touches them.
Fix: the smoke spec pins the true five-pill strip
(count 5; nth(4) is EPC with figure "B"), with the
derivation in its comment; and a new unit pin beside
the item 8/9 pins runs the no-England-figure case with
headlineBand B, pinning the five-pill strip at unit
level so the seeded case stays executable where the
mis-inference came from.

### Follow-up (18 Nov 2026) — CI #222: item 16 reversed, the D9 short form restored

CI #222 on the CI #221 fix round's HEAD passed checks,
secrets and database; the browser job passed 115 of 116. The one failure was the Birkdale smoke spec at
its short-disclaimer assertion — masked in CI #220
and #221 by the earlier pill failures in the same
spec, so it had never run against the batch.

Mechanism: item 16 of the parity batch removed the
D9 short form from beside the results, judging by the
Final Sample Master's HTML, which does not show it
there. The governing record says otherwise: D66 with
M7.4's "Disclaimer (D9)" check line places the short
form verbatim under the results strip, above the
tabs. Where a finalised sample and a decision differ,
the decision governs — the same conformed-by-ruling
pattern as items 13 and 18, where rulings stood and
the Master was not conformed. Item 16 is therefore
REVERSED: the audit's premise was the sample's
omission, and an omission in the sample does not
repeal a decision. The closing disclaimer block at
the foot of the page is a separate instance and was
never touched.

Fix (product): the short form is restored in
components/ResultsPage.tsx in its ruled place, with
its dress in app/globals.css — the class the Master's
own stylesheet still carries. The unit pin that
asserted its absence is reversed: it now asserts the
short form's presence and position (after the strip,
before the tabs) and the closing block's separate
presence at the foot. No assertion was weakened; the
e2e smoke spec's expectation stands as written and
is the CI proof of the restoration.

## Source strip (18 Nov 2026) — the landing gains the "Powered by official UK data" band

The founder reviewed three strip samples (the
source-strip landing samples) and ruled (18 Nov 2026):
the landing page carries the strip in the samples'
Version B form — drawn greyscale lockups — over the
Version A text strip (names only) and over Version C
(the bodies' real official logos in colour). The
strip is a white band directly below the hero/search
block, headed "Powered by official UK data", carrying
eight lockups in one row at desktop width, wrapping
on phone widths: a drawn glyph beside each source's
short-form name, the multi-word names stacked on two
lines — "HM Land" over "Registry", "Environment"
over "Agency", "EPC" over "Register" — with the glyph
sized to the full height of the two stacked lines;
the one-word names (Police.uk, Ofcom, Defra, ONS,
DfE) sit on one line, vertically centred in the same
band, their glyphs at the same height.

Built as components/SourceStrip.tsx (the eight glyphs
drawn inline as SVG — no image files, no official
logos, no external assets), its copy pinned in
lib/home.ts (HOME_SOURCE_STRIP_HEADING,
HOME_SOURCE_STRIP_SOURCES) and its dress in
app/globals.css (.source-strip and the .source-lockup
classes, on three new tokens: --colour-lockup,
--colour-lockup-name, --colour-strip-head — the
sample's own greys). Scope is the strip only: no
footer change, no other page, no other copy.

Pins: tests/home-page.test.ts pins the heading and
the eight sources' lines verbatim and the rendered
strip's place under the hero; e2e/home.e2e.ts gains a
regression spec (eight lockups, inline SVG only, the
eleven name lines in order, the band between the
hero's small line and the audience cards). No
existing spec needed adjustment — no landing locator
collides with the strip's words. The strip carries
no figures, so the figure register is untouched.

The Final Sample Master's landing view (view 1) is
being conformed with the identical strip in the same
round, so the Master and the product stay in step.

## Noise pill ruling (18 Nov 2026) — airport counts, all three sources

The 18 Nov conformance audit of the D75 pills left
one judgement open: D75's text names road and rail
for the Noise pill, but the concerning scan in
lib/results.ts read every filed band, airport
included, while the good test read road and rail
only — so a filed airport band could make the pill
"Noisy" but could never stop it reading "Quiet".
The founder ruled (18 Nov 2026): the Noise pill
counts airport, road and rail — all three. The
audit's open judgement is closed.

The change is the smallest that makes the two sides
symmetric: the good test now also requires the
filed airport band to be low (day in the below-range
band or "No modelled airport noise", night the
same), alongside road and rail as before. Where no
airport band is filed the airport leg passes — the
loader files absence itself as a "No modelled
airport noise" band, which is low — and road and
rail stay required, exactly as they were. Concerning
behaviour, the thresholds (day >=65, night >=60 on
any filed band), the D75 factor order and every
other factor are untouched. No served golden shape
moves: Birkdale's airport band files as "No modelled
airport noise", and E16 1GN's as "Below 55 dB" by day
with no modelled noise by night — both low.

Pins (tests/results.test.ts, beside the existing
noise pins): a loud filed airport band (65–69 dB by
day) with road and rail quiet serves the concerning
pill with the "Noisy" figure; a filed airport band
inside the published range (55–59 dB by day) with
road and rail in the lowest bands now serves NO
Noise pill at all — before this change that shape
served "Quiet"; all three sources in the lowest
bands serve the good pill with the "Quiet" figure.

## Dummy-home alignment (18 Nov 2026) — one dummy home everywhere, the Master's

The site carried two invented example homes: the
Final Sample Master's sample report works 12 Willow
Close, Millbrook, MB3 4QX, and the product's
/sample-report worked 14 Bramblewood Lane, Ashmere,
WM8 4QT (the anonymisation build's dummy). The
founder ruled (18 Nov 2026): one dummy home
everywhere — the Master's. The product's sample
report is rebuilt on the Master's worked example,
transposed verbatim from the Master: the home, its
£425,000 sale of 22 Mar 2022, the £425,000 postcode
median over 29 counted sales (20 Dec 1996 – 20 Jul
2026), the fictional schools, surgery, hospital and
council, the derived A–H council-tax table from
Band D £2,145.00, the zero dummy EPC certificate
0000-0000-0000-0000-0000, and every figure that
belongs to the example. The report's format,
structure and section order do not change, and the
invented-example banner stands exactly as pinned.

Where the Master's example and the product's format
did not line up, resolved as follows. (1) The
Master contradicts itself on the median: its short
version says £412,500 while its Section 2 tiles,
dot plot, chart note and sources all say £425,000
over the same 29 sales — the product serves
£425,000, the Master's own consensus, with the
home's dot on the median line. (2) The Master's
seller question 4 reads "Broadband at No. 19", a
residual of the pre-anonymisation original; the
product serves "No. 12", matching its own masthead.
(3) Section 7: the Master carries real map images;
the product deliberately serves neutral schematic
SVG panels (pinned: no image, "Schematic location
panel") — the panels stay schematic, redrawn and
re-captioned for Willow Close (village Millbrook,
River Bourne; close-up streets Riverton Road,
Meadow Way, Orchard End, from the Master's own
close-up description). (4) The Master's stamp duty
£11,250 sits in its results view, not its report
view; the product report carries no stamp-duty
figure and none was transposed. (5) The Master's
flood text names a River Brain among its invented
rivers; the sample-report test's real-locality
sweep therefore no longer lists "River Brain" —
the string now appears only as part of the dummy
example, and every other real-locality trace stays
pinned absent.

Pins: tests/sample-report.test.ts presents the
Willow Close home and its figures, keeps the
standing "Birkdale"/"CM3 2JT" absence assertions,
and sweeps the retired dummy out of the served page
("Bramblewood", "Ashmere", "WM8 4QT", "425,750",
"5031-2847" all absent); the schematic-panel pin
reads "Willow Close close-up". The /sample-report
H1 expectation in e2e/seo.e2e.ts reads "12 Willow
Close". lib/seo.ts carries no example-home copy and
needed no change.

## Wider-area / district page build (18 Nov 2026) — the rung-3 page becomes the district page

Founder rulings of 18 Nov 2026: the wider-area page's contents were agreed
section by section, and — after the samples were first drawn as a page of
their own — the layout was ruled to follow the FINALISED RESULTS PAGE's
layout system: the same shell, heading block, section presentation and
four-tab structure (D76), with the district sections distributed across the
tabs in the groupings the results page uses for the corresponding checks.
NO UPSELL anywhere on the wider-area page: no buy bar, no report link, no
truncation lines, no summary pills (the standing rule — buy bar at rungs
1–2 only — applied whole). The only forward path is the bridge into a
full-postcode check. Scotland / NI rung-3 behaviour is unchanged: their
districts keep the M7.4 form (unlock banner over the named-state results
page) whole, and `buildWiderAreaView` still serves them.

### What was built

- `lib/district.ts` (new) — the district brain. District membership is
  derived from filed postcode rows only (a postcode's district is its
  outward code); no boundary is invented. `buildDistrictBundle(outward,
source, { warningSource })` returns `{ kind: "district", outward, head,
sections }` for England & Wales districts and `{ kind: "not-covered",
outward, nation }` for all-Scottish / all-NI districts.
  `createDistrictSource(db)` is the only database implementation;
  `createDistrictWarningSource()` reads the same EA flood-monitoring feed
  as `lib/flood.ts`. `lib/area-bundle.ts` gained two one-word changes:
  `censusRows` and `medianAgeOf` are exported so the district brain reuses
  the census arithmetic instead of forking it. No existing bundle shape
  changed; `tests/fixtures/replay/bundle-shapes.json` is untouched.
- `lib/results.ts` — `buildDistrictResultsView(bundle)` composes the
  district bundle into a `ResultsView` in the results layout system:
  Family Checks → Schools; The Neighbourhood → The district itself, The
  neighbourhood in numbers, Crime, Deprivation, Air quality; Home, Costs &
  Risks → Sold prices, Costs (council tax + broadband & mobile under the
  district's own `district-costs` key, so the expander never links the
  home page's EPC / EV check pages for content the district page does not
  carry), Flood; What's Nearby → Everyday counts. Four new section block
  forms (table, deciles, stackbar, bars) exist for district views only.
  The view carries `pills: null`, `buyBar: null`, `reportHref: null`,
  `calculators: null` and the new optional `bridge` — rendered by
  `components/ResultsPage.tsx` after the tabs, in the buy bar's position:
  the deep-forest panel with the postcode box and up to eight of the
  district's postcodes as links into their checks, plus a count of the
  rest. Per the results page's own discipline (item 15), per-section
  source lines ride in the view model unrendered; every figure's grain
  rides in its own line instead.
- `lib/server/serve.ts` — `checkDistrictWider(resolution)` returns the
  unchanged short bundle (it still feeds the rung-3 shortlist card) plus
  the district bundle, the warnings source wired in.
- `app/search/page.tsx` — the rung-3 branch renders the district page for
  England & Wales districts: the results page's `.results-head` heading
  block (scope-label H1, the district scope line, filed fact chips —
  region, post town, councils, grain — and the ShortlistButton), the
  not-found line where one applies, then `ResultsPage`. The unlock banner
  no longer renders on this path; the Scotland / NI path below it is
  byte-for-byte the old page.
- `app/globals.css` — the `.district-*` forms, the results table, deciles,
  stackbar and bars, in the kit's tokens.

### Per-section data source and derivation

1. **The district itself** — settlements from the district's filed sales
   localities (fallback: post towns), display-cased; homes = the picking
   index's row count for the district; residents / households = the filed
   LSOA bases (`lsoa_bases`) summed over the district's LSOAs; live
   postcodes and small areas counted from the district's `postcode_cache`
   rows.
2. **The neighbourhood in numbers (Census)** — `census_stats` fragments
   summed as integer counts across the district's MSOAs (the district's
   MSOAs are the distinct `msoa_code`s of its E+W postcode rows), then the
   rung-1 labelled-lines arithmetic (the area brain's own `censusRows` /
   `medianAgeOf`) at district grain. Audit item 37 closed on this page:
   the section speaks in its own words — no "need an exact postcode"
   wording anywhere on the district page (pinned in tests and e2e).
3. **Crime** — PREMISE CHECK FAILED, recorded plainly: the brief assumed
   crime is filed per LSOA. It is not. Crime is filed only as per-postcode
   artefacts (counts within 1 mile of a postcode's point, for postcodes
   somebody checked) plus England monthly totals; `lib/crime.ts`'s own
   header states rung 3 serves no figure for exactly this reason. Summing
   overlapping 1-mile circles across a district would double-count over a
   self-selected sample, so the section serves its own honest line
   (wording in `lib/district.ts`, `CRIME_NOT_FILED_LINE`). The port and
   the served form stand ready — district total, per-1,000, category
   breakdown, and the D77(a) England pair under the SAME guard as the home
   page (`ENGLAND_BASE_MIN_RESIDENTS = 30,000,000`, imported from
   `lib/crime.ts`) — for the day an LSOA-grain filing exists; the unit
   tests pin the served form and the guard through the port.
4. **Sold prices** — `price_paid`, category A only (D23), district-wide:
   the median stated only at five or more sales, the count and date span
   named; per-type medians only at five or more sales of that type, the
   rest folded into one counted line. Never a valuation.
5. **Deprivation** — `neighbourhood_stats.imd_decile` counted per decile
   over the district's English LSOAs: a spread, never a score. Welsh
   districts serve the not-covered line (Wales publishes its own index).
6. **Council tax** — every distinct council on the district's postcode
   rows, joined to `council_tax_charges` on the authority name (the area
   brain's own join), latest tax year, Band D area average with the
   parish-averaged flag carried; councils with no filed charges are named
   as not filed, never silently dropped.
7. **Broadband & mobile** — the filed per-postcode Ofcom answers in
   `postcode_cache.answers`: each figure is the MEAN of the filed
   per-postcode shares across the district's postcodes, worded as exactly
   that (the filed share is a share of premises, so a district share of
   premises cannot be derived without premise counts); mobile serves the
   4G outdoor at-least-one-operator share per local authority area.
8. **Schools** — `schools` rows whose postcode sits in the district:
   counts by phase, grammar = selective admissions among secondaries,
   Ofsted grades from `ofsted_outcomes` in their published order, schools
   without an outcome counted as not yet inspected.
9. **Everyday counts** — `health_points` by filed postcode (GP practices
   and branch surgeries together, dentists, pharmacies); stations file no
   postcode, so a station counts where its NEAREST filed postcode sits in
   the district (KNN over the filed points) — the derivation is stated in
   the section's own closing line.
10. **Flood roll-up** — new aggregation over the EXISTING EA layers, no
    new data source. Each English postcode's point is read against the
    filed layer geometries (`flood_layers`): rivers & sea from the
    risk-of-flooding-from-rivers-and-sea bands, surface water from its own
    layer — two blocks, never merged — each serving the share of counted
    postcodes in each band plus the "no band published" share; the
    planning flood zones (FZ3 / FZ2 shares) ride inside the rivers & sea
    block, drawn as if defences were not there. Named corridors are the
    watercourse names of filed flood defences within 2 miles of the
    district's postcode points (the layers' own `detail` field carries
    source/origin, never area names). Live warnings are composed over the
    district's own spread — one EA feed call on the centroid of its
    English postcode points, radius the farthest point plus headroom —
    filtered with the flood brain's discipline (severity levels 1–3 only,
    deduped by description, point-less warnings kept). The section closes
    with the honesty line: district shares describe the district; the
    exact home's own check decides for a home. Welsh districts serve the
    not-covered line (EA maps cover England; NRW publishes Wales's).
11. **Air quality** — `air_grid`: each postcode's nearest modelled square
    within 1 km (the area brain's own read), the range (min–max) over the
    distinct squares of the latest year present, labelled modelled.
12. **The bridge** — "Checking one home in CM3?" with the full postcode
    box and the district's postcodes as links into `/search/home`.

### Pins changed, each under the founder ruling of 18 Nov 2026

- `e2e/journey.e2e.ts` T-WEB-07 — was "lands on the wider-area page with
  the unlock banner" (asserted the banner's heading); now asserts the
  district page: scope-label H1 unchanged, four tabs, no unlock banner,
  the bridge heading "Checking one home in E16?". Reason: the ruling
  replaced the banner with the bridge as the only forward path.
- `e2e/journey.e2e.ts` mistypes spec — the labelled-box assertions moved
  from `.unlock-banner .field__label` / `.field__hint` to
  `.district-bridge .field__label` / `.field__hint`; the label and hint
  copy itself is unchanged. Reason: the box now lives in the bridge.
- `e2e/results.e2e.ts` rung-3 spec — rewritten: was scope label + the
  rung-3 refusal lines ("crime counts need an exact postcode") + no
  this-home figures; now scope label + district sections in the four tabs
  - the crime section's district honest line + the flood honesty line (or
    its not-filed line where the seeded layers do not file) + no £4.99, no
    /report link, no strip, no buy bar, no banner, and an explicit absence
    assertion for the refusal wording. The £270,000 / £310,000 absence
    assertions stand (they are the seeded home's own figures; the district's
    figures are its own). Reason: the ruling superseded the refusal-line
    treatment for England & Wales districts.
- `e2e/phone.e2e.ts` rung-3 spec — the shortlist toggle selector moved
  from `.results-header` to `.results-head` (the district page uses the
  results page's heading block); the 16px input assertion moved from
  `.unlock-banner #postcode` to `.district-bridge #postcode`;
  `expectNoTable` dropped — the district page legitimately carries tables
  (sold types, crime categories, council tax), which must instead fit the
  screen, covered by the kept no-sideways-scroll assertion. Reason: the
  layout ruling.
- No unit pins were changed: `buildWiderAreaView` and the rung-3 short
  bundle are untouched (Scotland / NI and the shortlist card still ride
  them), and no golden replay shape changed.

CI #225 follow-up (18 Nov 2026): the rung-3 district spec's blanket ban
on the string "£310,000" failed its first CI run — over the seeded
corpus the E16 district median legitimately computes to £310,000 (9
sales, terraced split £310,999, under the district caption), the same
figure as the E16 1GN postcode median. The product was right; the spec
had banned a value instead of a form. The ban is removed, the seeded
home's own £270,000 stays banned, and the district median is now pinned
positively in its own form (the sold-prices section carrying "The
district median across E16 as a whole — it does not value any one
home."). No product code changed.

## Dropdown package (18 Nov 2026) — M7.15C: street suggestions, the three groups, the E161G fix

The search box's dropdown grows from the entry point's
two shapes (a fragment's Postcodes, a full postcode's
Homes) to the founder's ruled fragment form: three
groups — Postcodes, Streets, Properties — in that
order, in the Master's dropdown language (the same
shell, group labels and row anatomy the picker dropdown
of Master view 25 shows; no finalised sample depicts
this open panel, so it is built in that language, not
against a sample). The full-postcode Homes form is
untouched, byte for byte.

What was built:

- **Streets** (lib/server/streets.ts over migration
  0031's derived street table): exact word-prefix
  matches first; pg_trgm fuzzy matches (threshold 0.4,
  witnessed: the Bugdale/Birkdale pair at 0.5000,
  unrelated pairs at 0.2273 and below) only when exact
  found at most one, below the exact rows, as choices
  only — a submit never applies one. A street pick
  leads to the street's homes: one postcode goes
  straight to its check narrowed to the street (the
  rung-2 redirect and the home route now carry the
  narrowing end to end); several postcodes render the
  new street choice page (components/StreetChoice.tsx)
  in the picker's list style — the HomeList shell, the
  pinned explainer/count forms, one plain link row per
  postcode, biggest first.
- **Properties**: the picking union's homes inside the
  typed bound (the fragment's postcode prefix and/or
  the served streets), each row the home's full address
  line, picking straight into that home's check.
- **The E161G fix**: the fragment's Postcodes serve
  their complete matching set (defensive ceiling
  1,000, truncations logged) — the old cap of 8 cut
  E16 1GN out of E161G's twenty live matches. The
  grouped cap of 5 is a render window: in the grouped
  panel each group's list shows about five rows before
  scrolling (app/globals.css, the `:has(.suggest__group
  - .suggest__group)` rule on .suggest\_\_list); the
    single-group panel keeps the D71 19rem form. The
    resolution — cap governs rendering, never the served
    set — is recorded in docs/entry-point.md's M7.15C
    note as the standing reading.
- **The couldn't-place notice** carries the adopted
  replacement text (street names are pickable now; the
  old line said they weren't enough). Founder finalises
  at UAT, with the choice page's drafted line.

Pins changed, each under the founder's 18 Nov 2026
rulings:

- tests/entry-point.test.ts, the D71 describe: "a
  partial postcode still caps at 8 in total" is
  re-pinned as "a partial postcode serves its complete
  matching set (the E161G fix, M7.15C)" — all twelve
  synthetic postcodes serve. Reason: the fragment cap
  the D71 amendment kept is the very cut the deploy
  round found hiding E16 1GN; the founder's fix
  supersedes it.
- tests/entry-point.test.ts, scenario (a): a "CM3 2J"
  fragment now serves two groups (Postcodes,
  Properties) where it served one. Reason: the
  three-group ruling — the fragment's own homes are
  part of its answer now.
- tests/journey.test.ts and e2e/journey.e2e.ts: the
  unplaced notice pinned verbatim in its new form.
  Reason: the M7.15C adopted replacement, above.
- e2e/suggest.e2e.ts, the E16 spec: the group-label
  assertion scopes to the first group and the narrowed
  count to the Postcodes listbox. Reason: the panel
  legitimately carries three groups now — the
  Properties group adds options below the postcodes,
  so a panel-wide count no longer names the postcode
  narrowing the spec exists to pin. New specs in the
  same file cover the street pick, the fuzzy choice
  and the properties pick against the seeded corpus;
  CI is their first execution (Playwright does not run
  on this VM).
- No bundle-shape pins moved: the short bundle, the
  replay shapes and buildWiderAreaView are untouched,
  and the full-postcode Homes branch is byte-identical.

Samples-deviation check: no finalised Master view
depicts the fragment dropdown open, and none depicts a
street choice page; both are built in the Master's
established forms (the dropdown shell and group anatomy
of view 25's picker dropdown; the picker list of the
whole-postcode check). No sample change is needed; if
the founder wants the choice page sampled, it joins the
Master at his word.

## Place search (18 Nov 2026) — M7.15D: the Places group and the in-picker district expansion

The build (docs/entry-point.md carries the build
note): a fourth group, Places, in the search dropdown,
and behind a fully named place its Districts group —
the town chooser inside the picker, per the founder's
ruling and Master view 25. Places derive from held
data only (the picking index's town-as-filed; migration
0032's derived place table), fuzzy matching is offered
as choices only at the streets' pinned threshold on
place witnesses, and a district pick lands on the
wider-area page. A place pick is the dropdown's one
non-navigating pick: it files the filed name into the
search field, and the districts expand in the same
panel.

Samples-deviation check — against Master view 25
("Town chooser, picker dropdown": the landing with
"Chelmsford" typed, the dropdown open on the Places
group and the Districts in Chelmsford group), walked
element by element:

- Group set: the view's two heads are the product's
  two group labels, verbatim — "Places" and "Districts
  in Chelmsford" (the product's label is the filed
  place's display form: "Districts in <Place>"). ✓
- Group order: the view shows Places first and
  Districts immediately behind it, but no other group
  co-occurs in the view, so it does not settle Places'
  position among Postcodes / Streets / Properties.
  The product follows the plan step's own enumeration
  — Places is "a fourth group" — and serves Postcodes,
  Streets, Properties, Places, then the Districts group
  immediately behind its place, preserving the view's
  one settled relation (Districts directly after
  Places). Recorded as a judgement, not a sample fact.
- The place row: the view draws a pin, the bold place
  name, and a sub-line ("Town in Essex · Covers
  districts CM1, CM2 and CM3 — pick a district below
  for the wider-area page"). The product serves the
  single-line name in the suggestion shell's established
  item form, as every group in the built dropdown does.
  Deviation, with its reason: the sub-line's county is
  not held data (no source files a place's county), and
  its district content is carried by the Districts group
  itself, directly below — the line would repeat the
  group it introduces. If the founder wants the richer
  row, it is a shell change across all groups, not a
  Places-only form.
- The district rows: the view draws a code chip, a
  bold "CM1 — <description>" and a settlements sub-line
  ("Chelmsford city centre, Springfield, Broomfield and
  Chelmer Village"). The product serves "CM1 —
  Chelmsford" as a single line. Deviation, with its
  reason: the view's descriptions and settlement lists
  are hand-written sample copy, not derivable from held
  data — no source files which settlements a district
  covers or a one-line characterisation of it, and the
  product states only filed facts. The row's leading
  form (code, dash, name) is the view's.
- The view's "Sample →" badge on the CM3 row is a
  shelf marker, not product furniture — not built, as
  with the other views' annotations.
- The view's footnote ("No separate town page. Typing
  a town simply expands this list…") and its note-grid
  are the shelf's commentary explaining the design to
  the reader, not product copy — not built. The
  behaviour they describe is the behaviour built: no
  town page exists; the expansion happens in this list.
- The grouped panel's render window: unchanged CSS —
  the M7.15C `:has()` rule is generic over group count,
  so the fourth and fifth groups scroll in the same
  window in the same spirit. No CSS change was needed;
  recorded here because the brief named it the one
  allowed interaction.

No bundle-shape pins moved: the short bundle, the
replay shapes and the district serve path are
untouched, and the full-postcode Homes branch is
byte-identical. No Master change is needed — view 25
already depicts this surface; the two row-form
deviations above are recorded for the founder's eye at
UAT (M7.16), where the dropdown is judged in use.

CI #228 follow-up (18 Nov 2026): the build's CI run
was green everywhere except the browser job, where
the three new place-search specs failed identically —
`input.fill(...)` timed out after 60s "waiting for
getByLabel('Enter a postcode')", on attempt and retry
alike, before any dropdown assertion ran. Diagnosis:
a spec bug, not a product bug. The specs located the
field by `getByLabel("Enter a postcode")`, but "Enter
a postcode — e.g. SW1A 1AA" is the field's placeholder
(POSTCODE_BOX_PLACEHOLDER_BARE); the field's label —
the bare box's visually-hidden label and accessible
name — is "Postcode or address" (POSTCODE_BOX_LABEL,
independently asserted by the passing e2e/home.e2e.ts).
`getByLabel` matches label text, never placeholder
text, so the locator resolved to no element and fill
waited out the timeout, deterministically. Proven
locally with Playwright's own engine against the bare
box's rendered label/input contract: the written
locator counts 0 elements and its fill times out with
the CI's exact waiting line; the corrected locator
counts 1 and fills. The M7.15D PostcodeBox change is
uninvolved — the failure sits at the specs' first
interaction, before any pick, and every sibling spec
reaching the same input by `#postcode` passed. Fix,
spec-side only: the three specs locate the field by
its genuine label, `getByLabel("Postcode or
address")`, with the reason recorded in the specs'
own comment; no assertion was weakened and no product
code changed. The suggest contract and behaviour are
unaffected, so docs/entry-point.md carries no change
for this fix.

**Deploy follow-up (19 Nov 2026) — the CM92 phantom
district.** The M7.15D deploy's live verification
found the dropdown offering "CM92 — Chelmsford" as a
district choice: the place table held one row pairing
Chelmsford with CM92, from a single Price Paid deed
that files a Harlow postcode (CM92 1LX — the
directory's own 18 CM92 postcodes sit in Harlow)
under the post town Chelmsford. The pairing is
false; neither the derivation (a faithful split_part
of the filed postcode) nor the served-district guard
(the district genuinely has directory standing, and
the postcode is grammatically valid) was at fault —
the derivation filed a place/district pairing on one
record's say-so, and a pairing's truth is the one
thing neither test can see. The fix sits in the
derivation (docs/entry-point.md carries the full
diagnosis and the measured class: 415 no-standing
pairings the guard already suppresses, 4
ungrammatical outwards): the district is now the
outward under the canonical grammar, and a pair is
filed only where the index holds more than one home
under the place's name in the district. Migration
0033 re-derives the table on already-built
databases; the filing machinery runs the same
derivation at every refresh. No served form changes:
the dropdown's groups, rows and routes are exactly
as this section records — the only difference is
that a false pairing is never derived, so it can
never be offered.

## Check Together claim flow (19 Nov 2026) — M7.13: the claim shell

**What stands.** The `/gift` claim surface serving all
seven states of Master views 17–23, wired to a real
gift-token store and state machine, with the payment
and issuance boundary stubbed only where M9 takes
over. Routes: `/gift/<token>` (the claim page — the
claim form, Text 4 over it after a same-email refusal,
Text 3's guard over it for a bound gift, and the
confirmation-pending screen), `/gift/<token>/claimed`
(the dedicated claimed page), `/gift` bare (the
not-recognised page), `POST /gift/<token>/claim` (the
form's one server call) and
`GET /gift/<token>/confirm/<pending>` (the emailed
confirmation link — the one act that binds). The
already-used and expired states serve as their own
screens in the same card pattern; no gift state
touches the landing page or any other surface (the
placement ruling, 18 Nov 2026), and the routes join
the no-index set both ways the site keeps it: explicit
noindex metadata in every environment (the M7.8 inline
pattern, pinned in tests/seo-pages.test.ts's journey
harness) and `/gift` in the production robots disallow
list.

**The machinery.** `lib/gift.ts` is the pure module:
the lifecycle (Issued → Claimed → Redeemed, with
Expired derived at read from the 30-day `expiresAt` —
never a stored status), the served-state precedence
(redemption is final, even past day 30; a
claimed-but-unused gift dies at day 30), the
claim-attempt decision (one function; the route only
executes it), the email rules (comparisons ignore case
and stray spaces; plus-addressing deliberately not
policed — the prep's accepted limit), the token form,
and every word of copy. `lib/server/gifts.ts` is the
store seam in the resolve-records pattern (interface,
database implementation over migration 0034's
`gift_tokens`, in-memory implementation for tests);
its header names the M9 wiring points — `issue()` for
M9.6 on paid orders only, `findClaimedByEmail()` for
the payment flow's auto-apply, `markRedeemed()` for
the delivery path (only delivery consumes). Tokens
and confirmation credentials are 24 random bytes (32
base64url characters); a token failing the form check
is answered without a database read, and a made-up
link confirms no state. The claim binds ONLY on the
confirmation click (adopted gap check item 1): a
claim attempt (re)writes a single pending
confirmation and sends the email through
`lib/server/gift-mailer.ts` (the Postio pattern —
sending is a value, never a throw; a real Resend send
when the environment carries the key and from
address, an honest not-configured otherwise, and the
harness's capture implementation under
`GIFT_MAILER_CAPTURE_URL`). A failed send rolls the
pending back — nothing is left half-claimed. Only the
latest emailed link can bind (a re-attempt replaces
the pending wholesale), and the binding write carries
its own conditions (still Issued, still in date,
pending token still live). On binding and on resume
the flow sets the strictly functional gift cookie
(`cmnh-gift`, httpOnly, session — T-LEG-02's 'gift
applied' banner cookie, set only during a gift
visit); the banner itself is M9's surface. The claim
endpoint is rate-limited per caller (the suggestions
limiter); Turnstile was NOT added to the claim form —
nothing pins it there, and the limiter plus the
one-live-pending rule is the proportionate guard for
a form whose only side effect is one email to the
address just entered.

**The samples-deviation walk (Master views 17–23).**
Copy: verbatim everywhere a sample speaks — all seven
states' headings, bodies, labels, buttons, fine print
and helper lines are pinned character-for-character in
tests/gift.test.ts, and Texts 1–4 match D44(14)'s
pinned texts in their founder-approved forms (Texts 3
and 4 the shorter 18 Nov versions). The samples'
shelf commentary ("In this sample…", "Sample only —
…") is not product copy and appears nowhere. Layout,
four ruled or recorded departures: (1) the claim form
is the kit's standard field block — label, input and
inline error stacked, the button below — not the
sample's side-by-side field-row: the plan's own
fold-in names the standard field block for the claim
form, and the stacked form is what holds the 44px
targets at phone width; (2) the search blocks reuse
the product's bare postcode box (the SearchBlock
precedent — hidden "Postcode or address" label, live
suggestions) under each sample's own search heading
and line, not the sample's plain visible-"Postcode"
form: one search box serves the whole site, and the
gift holder's next act is the same search every other
page offers; (3) heading levels follow the product's
page discipline (the card's heading is the page's h1,
the search heading its h2) where the sample's card
sits under a shelf heading; (4) the badges, the
claimed card's chip and the card pattern itself are
the samples' own, in the site's token colours. The
confirmation-pending screen has NO sample (the
adopted confirmation step created the state after the
samples were drawn): it is built in the claim card's
own furniture and the samples' voice, and its words
are build-drafted (below).

**Build-drafted copy — for the founder's approval
before the step ticks at M9.6.** (a) The
confirmation-pending screen: heading "Check your
email to finish claiming"; body "We've sent a
confirmation email to **{email}**. Click the link in
it and the gift is yours — it stays tied to that
address. The gift isn't claimed until you click, so
if the address looks wrong, enter it again below and
we'll send a fresh link." (b) The send-failure line:
"We couldn't send the confirmation email just now —
nothing has been claimed. Check the address and try
again." (c) The email-format error: "Enter an email
address, like you@example.co.uk". (d) The confirmation
email itself (subject "Confirm your free report
gift"; the intro, fallback and ignore lines in
lib/gift.ts) — minimal and functional; M8.6's email
machinery conforms its dress when it builds, and the
happy-path claim page's final wording pass (adopted
gap check item 2) is likewise a tick-time item at
M9.6.

**The Privacy wording gap — reported, not invented.**
D44(12) and test T-LEG-02 rule the SUBSTANCE: the
gift cookie is strictly functional, and the Privacy
page names it (and the shortlist's browser storage)
when this step builds. No exact founder-approved
sentence exists in the prep, the plan, or the tree
(all searched at this build), so — per the build
brief's own instruction — the Privacy copy is NOT
amended here. The cookie plumbing is built exactly as
T-LEG-02 describes. The founder approves the naming
line before or at the M9.6 tick; the amendment is
then a one-card change to lib/site-pages.ts's
"Cookies" card. (M7.14's Privacy amendments — the
analytics paragraph and the shortlist sentence — DO
carry approved forms in its prep, and land with that
step.)

**The M7.14 events reconciliation.** M7.13's gap
check (5) says the gift claimed/redeemed events are
"wired with this step's build"; M7.14's gap check (3)
names the same wiring as M7.14's own named completion,
and M7.14 builds after M7.13 with the events table in
its scope. Reconciled: the shell exposes the two
transitions as single named store operations —
`bindByConfirm` and `markRedeemed` — which are the
attachment points (named in the store's header); no
events table is built here. M7.14 wires its counting
at those operations.

**The M9 hand-offs, as the prep drew them.** Token
creation is M9.6's (paid orders only, exactly one per
paid order, inactive in the free window); the gift
BLOCK in the delivery email is M8.6's (its tests
(a)–(c)); the gifted report rides M8's renderer and
M9.6's machinery; auto-apply fires on M9's payment
surface via `findClaimedByEmail`, with the
gift-applied banner; the refund interaction is
M9.8's — a refund voids the order's gift while it is
Unclaimed or Claimed-but-unused, and a Redeemed gift
stands (recorded in the store's header and migration
0034's; no void transition is built here, and nothing
in the shell contradicts it). This step TICKS only
when the wiring lands at M9.6 (the plan's own rule).

**Tests.** Unit: the seven states' copy pinned
verbatim; the served-state and view-selection
precedence; the claim decision (named tests (d), (e),
(f), (g), (h), (j) at decision level); the store
lifecycle against the in-memory implementation —
including (e)'s no-burn proof at the write level (a
refused attempt leaves the record byte-identical, and
a later different-email claim binds), pending
replacement (only the latest link binds), bind-after-
day-30 refused, redemption idempotent; the rendered
cards per state; the noindex pins in both SEO
harnesses. The database proof (db/prove.mjs) carries
the table's own guarantees, including the status
CHECK refusing a stored 'expired'. Playwright
(e2e/gift.e2e.ts, all Regression per D68): the seven
states served from the seeded fixtures; the refusal
that does not burn, in the browser; the full happy
path through the captured confirmation link to the
dedicated claimed page, cookie included; resume and
refusal on a bound gift; and the phone assertions over
the claim states in e2e/phone.e2e.ts (the fold-in).
The specs' first execution is CI's — Playwright
cannot run on this VM.
