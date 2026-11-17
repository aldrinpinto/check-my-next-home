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
