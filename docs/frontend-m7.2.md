# Website M7.2 — Home page

Built 16 Nov 2026. The placeholder homepage is replaced by the real landing page, family-first as designed (D12) and as ruled at this step's gap check (founder, 16 Nov 2026: both rulings and all six fold-ins adopted). The page is built from the M7.1 kit and the copy constants in `lib/home.ts`; its metadata is the locked `PAGE_SEO["/"]` entry, unchanged. The plan step is ticked by the parent agent once this step's gate (CI on the pushed commit) is green — this note records the build, not the tick.

## What the page is (app/page.tsx)

In page order:

1. **Hero, in its pinned order** — the manifesto as kicker (`SITE_MANIFESTO`, its only permitted home besides the block below), the D44 headline as H1 (`HOME_HERO_HEADLINE`, corrected this step — see below), the sub-line pinned verbatim by the step text, the postcode box as the main action, and the tagline closing the hero. The order is the document order, so it is identical on mobile with no reordering rules. The hero closes with this step's moving-in illustration.
2. **The three audience cards, directly under the hero** — "Moving as a couple", "Moving with kids", "Moving with pets", each naming the checks that matter to that move in family language. Each card's button scrolls to the one postcode box and moves keyboard focus into it. No card creates state and none implies a different check set: there is no audience mode, and the results are the same for everyone.
3. **"What it checks"** — one item per row of the checking screen's nine rows (M7.3's step text), translated into family language and pinned verbatim in `tests/home-page.test.ts`. The items carry no links at this step; M7.11 wires them to the /check pages.
4. **The manifesto block, once, mid-page** — "A house is bricks. A home is family.", the manifesto line, and one short line on why every check exists.
5. **The SAMPLE report section** — a heading, one line saying plainly that the sample is a worked example marked SAMPLE, and the link "See a SAMPLE report".

Not on the page, by ruling: the D9 disclaimer (it sits beside the results at M7.4, never here), and any price or "free" line (the £4.99 model lives at M9's surfaces). Both absences are pinned by test.

## The inert postcode box (components/PostcodeBox.tsx)

Founder ruling 1: the box ships present and typeable with an **inert submit**. It renders with the kit's `TextField` + `Button` exactly as it will stay; the form carries no action, the input carries no validation (no `pattern`, no `required`, no error states, no normalisation), and a submit — button or Enter — is swallowed by the client component. M7.3 wires the real journey (tidying, the ladder, the picker, Turnstile, friendly errors) into this same box; nothing built here is anything that step has to unpick. "Usable" in this step's Smoke spec is pinned as _renders and accepts input_. A partial postcode such as "E16" is never marked invalid — the ladder treats an outward code as a valid search.

## The illustrations (public/illustrations/)

Founder ruling 2: the imagery is **one-line SVG illustrations drawn for this step in the Roof-Tick's own language** — single-weight strokes, round caps and joins, Forest `#2F5D3E` and Brass `#C29A3B` only, no fills painting shapes, no stock, no photographs, no raster images. Four scenes: the hero's house with boxes being carried in (its roofline repeats the mark's roof-and-tick), a key in a new door (couple card), moving boxes under a roof (kids card), and a dog waiting by the door (pets card). Each file is under 1 KB, so the landing stays light against the free check's performance budget.

Placement, justified: they live in `public/illustrations/`, **not** `public/brand/` — the brand folder holds the finalised asset pack exactly as delivered (the M7.1 test pins the mark unmodified), and these are page illustrations, not brand assets. They are plain-text SVGs like the brand SVGs, so no `.b64` materialisation is involved. A test pins the stroke language (brand strokes only, round caps, no `<image>`, no painted fills).

## The M3 correction (D44)

The retired M3 headline was corrected in all three places the gap check named, plus one further live carrier found by grep:

1. `app/page.tsx` — the placeholder that rendered it is replaced wholesale.
2. `lib/site.ts` — `HOME_HERO_HEADLINE` now carries the D44 line, and its comment records the retirement instead of the old "survives as hero copy" claim. `tests/site.test.ts`'s pin changed with it, in that file's own precedent (the pin change is the decision record).
3. `docs/brand.md` point 4 — now records the full retirement and names the D44 headline; the false "survives only as homepage hero copy" claim is gone.
4. `README.md` (judgement call, beyond the named three) — its strapline line carried the same stale claim in a live, product-facing file; it now carries the decided tagline. Leaving it would have kept the exact drift the correction exists to close.

After the correction, the M3 line survives in exactly one place in the repo: as the forbidden-string constant in `tests/home-page.test.ts`, where it exists only so the guards can assert its absence (the same pattern as the header guard in `tests/look-feel-kit.test.ts`). Historical build notes were not rewritten.

## Judgement calls

1. **The hero kicker is set in Forest, not Brass.** Brass on white is the header logotype's pairing (a recorded M7.1 judgement, at logotype contrast); the kicker is running text, so it takes the heading colour and keeps the kit's verified contrast. Recorded here for the founder's eye on the play site.
2. **The box's furniture**: label "Postcode", hint "For example, CM3 2JT." (the kit's own kitchen-sink precedent), button "Check a home". All pinned in `lib/home.ts`.
3. **The cards' button** reads "Start with a postcode" — a button, not a link, because its job is an action on this page (scroll + focus), not navigation.
4. **README.md** corrected alongside the named three (above).

## Hand-offs and open items

1. **M7.3** wires the journey into `components/PostcodeBox.tsx` — the inert handler is the seam; the box's markup and furniture stay.
2. **M8.9 — the watermark check is carried there.** This step ships the SAMPLE link clearly labelled, pointing at `/sample-report` (the route the header already names and M8.9 owns). The sample itself, its page and its visible watermarking are M8.9's build, and M7.2's "the sample is visibly watermarked" check is discharged there, where T-WEB-06 pins it. Until M8.9 lands, the link is a known dead end — the same standing as the header's Sample report item since M7.1.
3. **M7.11** wires the "what it checks" items to the /check pages; at this step they carry no links, by the fold-in.

## Tests

1. **Vitest** — `tests/home-page.test.ts`, 17 tests: every copy line pinned verbatim (sub-line, box furniture, the three cards, the nine checks, the manifesto block, the SAMPLE labelling); the rendered page's hero order, single manifesto block and ruled absences; the inert box's no-action/no-validation pins; the illustrations' stroke language; the M3 guards. `tests/site.test.ts`'s headline pin updated. Full suite at this build: **1,601 passed / 26 skipped** (70 files passed, 1 skipped) — up 17 from M7.1's 1,584.
2. **Playwright** — `e2e/home.e2e.ts`: the step's **Smoke** test (landing serves; kicker, H1, sub-line and tagline together, in order; the box renders and accepts input) and four **Regression** tests (the inert box — partial postcode, submit and Enter both inert, no error, no navigation; the cards leading to the one box, focus included; the nine checks linkless; the manifesto block once and the SAMPLE link labelled). No Regression test was promoted (D68 clause 7 hold stands). The M7.1 shell spec's placeholder assertion was updated to the real H1. Full suite locally: **10 passed** (1 Smoke, 9 Regression).
3. **Gate** — `npm run prepush` green (format, lint, types, full Vitest, production build). No loader, migration or runner was touched, so no database rehearsal was owed.

## Founder test list (D67)

The play site updates itself on push (proven at M7.1). Once this step's gate is green:

1. Open the play site: TEST strip, white header, then the hero in order — the manifesto line as the small kicker, the headline "You're not buying a house. You're choosing your family's home.", the sub-line about checking what the listing doesn't tell you, the postcode box, the tagline "Check the house. Choose the home.", and the line drawing of boxes being carried into a house. The old "Coming soon" placeholder is gone.
2. Directly under the hero, the three cards: "Moving as a couple", "Moving with kids", "Moving with pets" — each naming the checks that matter to that move. Tapping "Start with a postcode" on any card takes you back up to the postcode box, with the cursor in it.
3. Type in the postcode box — try "CM3 2JT" and "E16": both type in with no complaint (no error, no red outline). Pressing "Check a home" or Enter does nothing yet — that is this step's ruling; the real journey (picker, checking screen, results) is the next step, M7.3.
4. Scroll down: the "What it checks" list of nine checks in family language; the manifesto block once, mid-page — "A house is bricks. A home is family."; then "See a full example" with the "See a SAMPLE report" link, clearly labelled. The link is a dead end until M8.9 builds the sample page — expected, like the header's Sample report item.
5. Check the drawings against the direction: families moving in, Forest + Brass lines, no handshakes or suits, no photographs.
6. Footer: dark green, reversed logo, name + tagline.
7. On your phone: the hero stacks in the same order, the cards stack one per row, the box and button are comfortably tappable, and nothing scrolls sideways.
