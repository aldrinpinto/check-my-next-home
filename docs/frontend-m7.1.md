# Website M7.1 — Look & feel kit

The kit every later front-end step builds from: the brand
applied to the site, the tokens and scales pinned, the blocks
built once, the header and footer shells in the layout, a
hidden kitchen-sink page that shows it all, and the Playwright
harness stood up beside it. Built under D67 (real back end —
this step is presentation only, so what it wires is the site's
own shells and metadata) and D68 (its E2E contribution is a
Regression-tagged render spec; the step makes no visitor flow
testable). The founder adopted the pre-build gap check in full
— all ten gaps and Option A, the harness landing with this
step — on 16 Nov 2026; the gap folds are named where they
landed below.

## Tokens and scales (app/globals.css)

One stylesheet for the whole product — the website now, the
M8 report later — as plain CSS custom properties and classes,
no framework, so the report can carry the same kit. The
palette is the brand's five (docs/brand.md) plus **Ink
#17201E** as the text colour: the Final Design record named
it and no brand source carried it, so the sweep's R1 put it
in this step's text and the kit takes it from there — the kit
never invents a grey.

Pinned here, so no page picks its own:

- **Type scale** on the existing system stack (no download
  against the performance budget, no licence): caption
  0.8125rem, small 0.875rem, body 1rem, lead 1.125rem, H3
  1.25rem, H2 1.5rem, H1 2rem; line heights 1.5 body, 1.2
  headings. **[Superseded by D70 R1, 17 Nov 2026: the kit
  now self-hosts Newsreader (display) and DM Sans (text/UI)
  with a fluid display scale, the system stack kept as
  fallback only — see docs/frontend-design-pass.md. This
  bullet stands as the M7.1 record.]**
- **Spacing scale:** 0.25 / 0.5 / 0.75 / 1 / 1.25 / 1.5 / 2 /
  3 / 4rem (`--space-1` to `--space-9`).
- **Breakpoints** (custom properties cannot drive media
  queries in plain CSS, so the values are pinned in the
  stylesheet's header comment and used literally): small at
  30rem (480px — stacked forms, covering the 360px phone
  width the checks assert at), desktop at 48rem (768px).
- **Containers:** the reading column at 44rem — the measure
  the skeleton already used, now named — and a wide container
  at 72rem for results and tables.
- **Tap target:** 44px minimum (`--tap-target: 2.75rem`) on
  every interactive block.
- **Colour roles** follow the brand sheet's table: Forest
  headings and buttons, Deep forest dark surfaces and the
  footer, Brass the tick, rules and highlights, Brass pale
  on dark, Cream the light background.

**The focus style is one pinned style** (D44): a 3px solid
outline with a 2px offset on `:focus-visible`, its colour
token swapping by surface — Forest on light, Brass pale on
dark. Contrast, computed at this build: Forest on Cream
**7.17:1**, Forest on white **7.62:1**, Brass pale on Deep
forest **7.50:1** — all well past the 3:1 a focus indicator
needs. Ink body text measures 16.64:1 on white and 15.67:1
on Cream; the primary button's white on Forest 7.62:1; the
footer's Cream on Deep forest 10.83:1.

Two colour judgements, recorded:

- **Error red is a functional colour, not a brand colour.**
  The palette has no carrier for form errors, and error
  states may not be invented per page (gap 1). The kit pins
  one — `#B3261E`, 6.54:1 on white — in the same spirit as
  the TEST strip's amber, which the codebase already keeps
  deliberately outside the brand. Success needs no new
  colour: Forest carries it. Error and success are always
  wording as well as colour, never colour alone.
- **The header tagline sits in Brass** (2.63:1 on white) —
  the header/hero Option 1 lockup's own design, carried by
  M7.2's text ("the tagline small in brass beneath it"). The
  lockup is the brand's logotype; the name beside it, in
  Forest at 7.62:1, carries the identification.

## Blocks (components/)

Built once, in `components/`, each a thin wrapper over the
kit's classes carrying the markup pattern so no page
re-decides it:

- **SiteHeader / SiteFooter** — the shells, now rendered by
  the root layout on every page. Header: white, the Roof-Tick
  mark plus the name and tagline as **live text from
  lib/site.ts** — never a baked lockup image, so the wording
  cannot drift from the one source (gap 9; the brand sheet in
  the asset pack still carries the superseded M3 strapline,
  and nothing in the build reads wording from it). Nav is the
  V1 set (D44): How we check, Guides, Sample report,
  Shortlist — dead-end links this step are expected. The
  Shortlist count badge's styling is defined; the count
  arrives at M7.5 (gap 6's header half). Footer: Deep Forest,
  the reversed mark, name + tagline; its link list fills in
  as pages land (gap 6's footer half — no step had
  commissioned a footer at all).
- **Button** (primary, quiet, disabled), **TextField** (label,
  hint, input, inline error/success messages wired with
  aria-describedby and aria-invalid — gap 1: the postcode
  box, the calculators' inputs and the claim form all render
  through it), link styles with hover, focus-visible,
  disabled and error states across the interactive blocks
  (gap 5's visible focus is the pinned style above).
- **Card**, **SourceLine** (the caption/source line), and
  **one pill family in two variants** (gap 3): the distance
  pill, colour on the miles figure only, and the fact pill —
  no colour — that M7.4's summary strip uses.
- **DataTable** — every cell carries its column name as
  `data-label`, which the 360px stacked-row form prints
  beside the value (gap 4). **Notice** — warning, stale and
  named-gap variants, each with its label as wording (gap 4).
- **Tabs** — the standard pattern D44 pins: arrow keys move,
  Home and End jump, activation is automatic, roving
  tabindex. Client component; M7.4's three tabs render
  through it.

## Brand assets and their destinations (gap 10)

The destinations are fixed; no later step rearranges them:

- `public/brand/` — the SVG masters (mark, reversed,
  on-cream, mono-forest, lockup), served paths. The header
  uses `/brand/logo-mark.svg`, the footer
  `/brand/logo-mark-reversed.svg`. (The pack's PNG renders
  stay in the plan's asset pack — the site serves the
  scalable masters; nothing in the product needs the
  raster exports.)
- `app/icon.svg` — the master mark as the scalable icon;
  `app/favicon.ico`, `app/icon.png` (the pack's 48px),
  `app/apple-icon.png` (the pack's 180px) by the app/ file
  conventions. The built page head carries all of them.
- **Binary assets ride as `.b64`.** The project's push route
  moves text only — the convention the data fixtures already
  use — so each binary is committed as base64 text beside its
  target and `scripts/materialise-binary-assets.mjs` decodes
  it on every build and dev run (the `prebuild`/`predev`
  hooks). The decoded files are gitignored build artefacts;
  the manifest is exported so the kit's tests hold every pair
  honest (existence, magic bytes, dimensions).
- **Organization JSON-LD logo** (lib/seo.ts): the canonical
  URL of the served mark,
  `https://checkmynexthome.co.uk/brand/logo-mark.svg` — the
  absence M2.11 shipped because the logo was not final.
- **Open Graph image** (gap 8): composed at this step as a
  proper 1200×630 card — the Roof-Tick lockup on Cream, the
  name (with "Next" in Brass, as the lockup draws it) and
  the D12 tagline, in a Brass frame — because the pack held
  only the square social avatar, which platforms crop
  unpredictably and which does not pair name + tagline as the
  social-card rule requires. Served as `/og-image.png`,
  wired through `pageMetadata`'s `openGraph.images` with its
  dimensions and alt text; the composition source is
  `~/workspace/scratch-m71/og-card.svg`, rendered with the
  project's own Chromium.

## The kitchen-sink page (gap 7)

`/kitchen-sink` shows every block, the six swatches and the
type scale, in light mode only. Hidden by construction:
unlinked from the navigation, noindexed, absent from
PAGE_SEO (the locked set is unchanged — 21 entries), and
rendered only when the environment is not production — the
same `isProductionEnv` gate as the TEST strip. Verified at
this build: a production build answers the route with the
not-found page and carries no TEST strip. (Its `<title>`
metadata still names the page in the 404's payload — the
gallery's content is what the gate protects, and none of it
is in the production output.)

## Tests

- **Vitest** (tests/look-feel-kit.test.ts, 26 tests, the
  repo's node-environment style — components rendered with
  `renderToStaticMarkup`, no new test dependencies): the
  token pins, the asset pairs, the shells' D12 wording and
  nav order, the badge's absence until a count is passed,
  every block's wiring, the kitchen-sink render and its
  production gate, PAGE_SEO unchanged. Two pins in
  tests/seo.test.ts changed in place — the og:image absence
  and the JSON-LD logo absence both named M7.1 as their
  change point, and the pin change is the record.
- **Playwright** (e2e/kitchen-sink.e2e.ts, 5 tests, all
  tagged **Regression** per D68 and M7.1's E2E line): every
  block renders on the built export with header and footer;
  the tabs' arrow-key pattern; the table's stacked form at
  360px; the kit stays light under a dark OS preference; the
  homepage carries the shells, the favicon set and the
  og:image meta. The harness: `@playwright/test` 1.65,
  `playwright.config.ts`, specs named `*.e2e.ts` so Vitest
  never picks them up, run against the static export served
  by `e2e/static-server.mjs` (no new dependency — Node's http
  module). Run locally: `npm run build`, then
  `npm run test:e2e`. All 5 pass.
- Full gate: prepush green — format, lint (0 errors),
  typecheck, **1,584 tests passed / 26 skipped** (baseline
  1,558 at the parent commit + 26 new), build clean. No
  loader, migration or runner is touched, so no database
  rehearsal is owed.

## Hand-offs and open items

- **The CI browser job is the parent's web-editor session.**
  Workflow files cannot be pushed (403); the exact job YAML,
  in ci.yml's own style, is at
  `~/workspace/scratch-m71/ci-browser-job.yml`, with its D68
  note: the job runs the whole suite for now because the
  Smoke set is empty at M7.1 and an empty `--grep @smoke`
  exits 1 (measured); M7.15's scheduled cadence is where the
  gate job narrows to Smoke and Regression moves to the
  schedule. This step does not tick until that job is in and
  the full gate, including it, is green.
- **The play-site deploy route is not determinable from the
  repo.** No deploy script, wrangler configuration, Pages
  workflow or doc in the repository states how the play site
  is updated (the workflows are CI, canary and practice
  only). Per the brief, no route was invented: if the
  Cloudflare Pages project is Git-connected, the push to main
  is itself the deploy and the founder test list below is
  checkable on the play site directly; otherwise the parent
  names the route and the built export (`out/`, from the
  green build) is what deploys.

## Founder test list (D67)

1. Open the play site: the amber TEST strip, then the new
   white header — Roof-Tick logo, "Check My Next Home", and
   "Check the house. Choose the home." small in brass beneath
   the name; nav on the right: How we check, Guides, Sample
   report, Shortlist. Those pages do not exist yet — dead-end
   links this step are expected.
2. Open the kitchen-sink page (play site address +
   `/kitchen-sink`): every block on one page, light mode
   only — the six colour swatches (Forest, Deep forest,
   Brass, Brass pale, Cream, Ink), the type sizes, buttons, a
   postcode-style input box with its error and success
   states, a card, both pill kinds (distance pill with colour
   on the miles figure; plain fact pill), tabs, a table, the
   three notice lines, and the small source line.
3. Tab through that page with the keyboard: every button,
   link, input and tab shows the same clear focus outline,
   and the tabs move with the arrow keys.
4. Open it on a phone (or shrink the browser to phone
   width): nothing scrolls sideways, tap targets are
   comfortably big, and the table stacks into labelled rows.
5. Look at the browser tab: the favicon is the Roof-Tick,
   not a default icon.
6. The homepage itself is still the plain placeholder —
   that is expected; it is built next step (M7.2). Judge
   this step by the header, the footer and the kitchen-sink
   page only.
