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
