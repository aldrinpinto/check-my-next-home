# M7.5 — Shortlist (browser only)

Status: built in the draft tree (`check-my-next-home-m73-draft`) on top
of M7.4, gated locally, NOT integrated. It integrates in the same
post-VPS operation as M7.3 and M7.4 and ticks then (99 of 160). The
main tree and remote main are untouched; nothing was pushed and no
workflow file was edited. No brain file was modified — this step is
presentation plus browser storage only (the changed-file set is
lib/shortlist.ts, lib/shortlist-card.ts, three new components, the
SiteHeader wiring, the two results routes, app/shortlist/, globals.css,
and the new test/E2E files).

Built to D40 as scoped by the gap check of 17 Nov 2026 (four founder
rulings + eight fold-ins, all adopted): the free tier only — 3 homes,
headline comparison, add-a-4th panel.

## What was built

**The storage contract (fold-in 1 — pinned here and in
tests/shortlist.test.ts as the Phase 2 contract).** One versioned
localStorage key on the site origin: `cmnh-shortlist-v1`. The record
is `{ v: 1, cards: [...] }` in saved order; each card is:

- identity: `id` (`r1:<postcode>:<homeKey>` at rung 1,
  `r3:<outward>` at rung 3), `postcode` (the outward code at rung 3),
  `homeKey` (rung 1 only, else null), `rung` (1 or 3), `scopeLabel`;
- snapshot display facts: `addressLine`, `lastSale`
  (`{ price, date, typeLabel, tenureLabel }`, rung 1 only, else null),
  `factsLine`;
- `comparison`: one cell per row of the comparison's row set — a
  distance cell `{ kind: "distance", name, miles }`, a named-state
  line cell `{ kind: "line", text }`, or a pointer cell
  `{ kind: "pointer" }` (flood and crime at rung 1);
- `savedAt`: the save moment (ISO), stamped by the control that
  writes the card.

localStorage is the only mechanism consistent with the design's
privacy line ("nothing about which homes someone is considering is
stored on any server") — cookies are transmitted to the server with
every request; localStorage never is. **Phase 2 position, recorded:**
D40's "same list" is a user-truth, not a storage-truth — an extension
working on portal origins cannot read this origin's localStorage, so
Phase 2 sharing is an extension-brokered sync against this record
shape, never literal shared storage. Parsing is tolerant in one
direction: another version or a malformed record reads as the empty
list; a malformed card inside a v1 record is dropped, the rest
survive. The limit is soft (D40): remove-and-re-add is allowed and
harmless; nothing hardens it.

**The add control** (`components/ShortlistButton.tsx`): "Shortlist
this home", two unmistakable states (primary/unsaved;
quiet/"Shortlisted — tap to remove" with `aria-pressed`). The
server-rendered results page embeds the card record in the control at
render (fold-in 8 — assembled by `lib/shortlist-card.ts` from exactly
the derivation that rendered the page: the same bundles, no new brain
call, no new API), so the snapshot saved is provably the facts the
visitor saw. Facts are a snapshot at save, never re-derived on view
(ruling 3). Placement (fold-in 3): rung 1 — the first row of the
results block, directly under the page header (the record exists only
once the derivation has run, so the control renders with the results,
not in the static page header); rung 3 — beside the scope-label
heading. No control at rung 2 (ruling 4) and none on the Scotland/NI
not-covered page.

**The add-a-4th panel** (fold-in 4): tapping add with 3 saved opens
the panel in place — it states the free shortlist holds 3, lists the
saved homes with remove buttons (removing frees the slot in place;
the panel's own "Shortlist this home" then completes the save), and
offers the detailed report on a saved home via `/report` (the route
M7.4 pinned, M7.6 owns). No free-window wording on any surface.

**The header count** (fold-in 2): `components/ShortlistCountBadge.tsx`,
a client island inside the header's Shortlist link, rendering through
the existing `.shortlist-count` markup (the header's `shortlistCount`
prop path still renders directly when a count is passed). It reads
the list on mount and stays current on the cross-tab `storage` event
plus the same-tab signal (`cmnh:shortlist-updated`) every write
through lib/shortlist.ts fires. The badge shows only at 1 or more;
the nav item is unchanged on every page.

**The /shortlist page** (fold-in 6): the server renders the shell and
page furniture only; cards, comparison and named lines resolve
client-side from storage — no serve call, so the page works while the
play server is down and is exact under the second-context absence
check. Cards render in saved order: address line; the home's own last
sale as filed in the design's card form ("£588,995 • Last sale, Jun
2023 • Detached, freehold"); the facts line; a remove control; its
own report button ("Get the full report" → `/report`). Under the
cards, the "kept only in this browser" line. The comparison sits on
the same page (from 2 saved homes): one column per home, stacking
into one block per home on a phone; the row set transcribed from the
Final Design's Section 5 mock and pinned in tests — Nearest primary,
Nearest secondary, Grammar school nearby, Nursery, Flood, Crime —
12-month total, GP, Hospital with A&E, Station, Nearest vet, Council
tax. Flood and crime cells are pointers reading "See this home's
check" — never figures, never a single-word verdict (ruling 2).
Distances colour the miles figure only, on the M7.4 thresholds
(lib/results.ts). A fact a rung does not serve renders its named
state, never a borrowed figure (fold-in 7): rung-3 columns carry the
wider-area named states per row and no last-sale header. No winner,
score or ranking exists anywhere in the comparison's shape (pinned
by test); demographics are never a column. Each column keeps its own
"Report for this home" button.

**The two named lines, kept distinct** (fold-in 5): storage
unavailable (private mode, disabled, quota) renders "Your shortlist
is kept in this browser, but this browser is not allowing storage
right now — so saved homes can't be kept or shown here." where the
shortlist would be — on /shortlist and in place of the add control;
storage working but empty renders the design's Section 4B empty state
verbatim ("Your shortlist is empty — No homes have been saved yet, so
there is nothing to compare. Homes you save are kept only in this
browser. Next step: …"). A cleared list is indistinguishable from a
never-saved one, so the empty state is its named line.

## Named deferral (ruling 1)

**The full comparison for report-holders (up to 10 homes) is deferred
to M9.6.** Nothing is built for it at this step — no view, no
entitlement record. Reason: no browser can be a report-holder before
M9 creates purchases and gift claims (V1 has no accounts; gift tokens
issue only on paid orders and are inactive in the free launch
window), so the full comparison is unbuildable-to-test here, and its
entitlement shape — bought and gifted holders differ — is M9.6's to
pin. The step's own Check and authored E2E scope the free tier only.
The deferral is recorded in the step text in the plan; the comparison
machinery built here (columns, rows, honesty rules) is shared with
the full comparison when M9.6 builds it.

## For M7.6 to adopt

**The add control moves into the buy bar.** At this step it sits in
the results header area because M7.6's buy bar does not exist yet.
When M7.6 builds the buy bar, the control joins it beside the report
button per the Final Design (Section 5: "on the website result it
sits beside the report button in the buy bar") — one control, moved
deliberately, never duplicated.

## Founder test list (on the play server, after integration)

1. Check **CM3 2JT**, pick **19 Birkdale Rise**, tap **Shortlist this
   home** — the header's Shortlist count shows **1** without
   reloading. Restart the browser, open **Shortlist**: the Birkdale
   card is there with its last-sale line (£588,995, Jun 2023) and
   facts line.
2. Save **6 Exeter Road (E16 1GN)** and **Flat 4, Minerva House
   (KT17 1FH)** the same way, then open **Shortlist**: three cards in
   the order saved, and the side-by-side comparison under them — the
   flood and crime rows read "See this home's check" in every column,
   and no home is declared a winner anywhere.
3. Try to save a fourth home (any other golden): the panel says the
   free shortlist holds 3 and offers the three saved homes with
   Remove buttons, or the detailed report on a saved home. Remove
   one, then tap the panel's **Shortlist this home** — the new home
   is saved and the count is still 3.
4. Search **E16** on its own and shortlist the wider-area result: its
   card reads "Wider area — E16, not this exact home" with the
   wider-area facts under it (sold prices and crime "need an exact
   postcode"), and it counts toward the 3.
5. Open the site in a second browser or profile: the shortlist is
   empty there — the Section 4B line says the homes are kept only in
   this browser.
6. On a results page, tap a saved home's **Shortlisted — tap to
   remove**, then remove a card from the Shortlist page instead: both
   surfaces agree, and the header count follows without a reload.

## Deviations and judgement calls

1. **The card's last-sale type/tenure words.** The design's card form
   carries the home's own last sale with its type and tenure ("…
   Maisonette, leasehold"). The short bundle's own-sale pick carries
   price and date only; the full sold bundle — already fetched for
   the page's own derivation — serves the register's codes as filed
   (D/S/T/F/O; F/L). Assembly therefore reads the newest own-history
   sale from that same bundle and renders the codes as the register's
   category names (F → "Flat or maisonette", the register's own
   category wording, since the filed code cannot distinguish a flat
   from a maisonette). An unrecognised or absent code omits the
   segment rather than inventing a word (pinned by test). No new
   brain call and no new data are involved.
2. **Add-control placement at rung 1** is the first row of the
   results block, directly beneath the page header — not inside the
   static `<header>` element — because fold-in 8's record is
   assembled from the results derivation, which resolves after the
   page header paints (the checking screen occupies the interval).
   At rung 3 the derivation completes before render, so the control
   sits beside the scope-label heading itself. The M7.6 buy-bar move
   (above) supersedes both placements.
3. **Rung-3 flood and crime cells carry the wider-area named states,
   not the pointer.** Ruling 2's pointer ("See this home's check")
   governs the free comparison's home columns; a rung-3 column has no
   home whose check could be pointed at, and fold-in 7 pins rung-3
   cells to the wider-area facts — the sections' own named reasons
   ("flood answers need an exact postcode"). No figure or verdict is
   carried either way.
4. **The rung-3 card's facts line** joins the sold-prices and crime
   named states — the two headline families a wider-area visitor came
   for; every other row's named state is carried in the card's
   comparison record and shown in the comparison.
5. **The card facts line's form** follows the design mock's texture:
   the primary in category form ("Nearest primary 0.42 mi", as the
   summary pill states it), then the nearest named everyday place
   (station first, as the mock pairs them; supermarket, then GP, as
   fallbacks) — the first two facts that serve.
6. **The comparison renders from 2 saved homes.** With one saved home
   there is nothing to compare side by side; the cards and the
   kept-in-browser line render alone. D40's comparison is of the
   shortlist's homes, and two is the smallest set it can mean.
7. **The panel's flow after a removal:** removing a saved home in the
   panel frees the slot in place and the panel then offers its own
   "Shortlist this home" to complete the original save — the report
   choice stays on offer throughout. Nothing is saved by merely
   opening the panel (pinned by E2E).
8. **Wording composed at this step** (no design text exists for it):
   the storage-unavailable line, the panel's lines, the saved-state
   button label ("Shortlisted — tap to remove"), the comparison's
   heading ("Your saved homes, side by side") and the /shortlist
   page's lead (which carries the design's privacy line verbatim in
   substance: "Nothing about which homes you are considering is
   stored on any server"). All are pinned in lib/shortlist.ts or the
   components and by tests.
9. **No metadata for /shortlist**: like the M7.3 journey routes, the
   page exports no metadata of its own (PAGE_SEO is D38-locked and
   carries no shortlist entry; adding one is an SEO decision outside
   this step). The route is a visitor utility, linked from the
   header on every page.

## Gate (draft tree)

- `npm run prepush` — GREEN (format, lint with 0 errors, typecheck,
  build). Vitest: **1,674 passed / 26 skipped** (M7.4's 1,647 plus
  this step's 27 shortlist tests: the contract pins, record logic,
  serialisation, storage access through fakes, display composition,
  comparison construction, card assembly, header wiring).
- Playwright, full suite against the served app + seeded corpus:
  **47 passed / 0 failed**, twice consecutively — Smoke 8 (the seven
  before plus T-WEB-04: persistent-context restart persistence +
  second-context absence), Regression 39 (the 32 before plus remove,
  the no-winner comparison, the add-a-4th panel, the rung-3 card,
  the storage-unavailable line, the header-count update, the fresh
  empty state). No Regression spec was promoted to Smoke (D68
  clause 7).
- Local-gate seams: the M7.3 set, unchanged (PGlite engine on the
  M7.4-seeded corpus with `E2E_SKIP_SEED=1`, the siteverify stand-in,
  `E2E_TURNSTILE_STUB=1`, `PG_POOL_MAX=1`; runner at
  `~/workspace/scratch-m75/run-e2e-m75.sh`). CI sets none of them.

## Unproven until CI / integration

1. The CI browser job (v2) running this suite against real PostGIS 17
   — including T-WEB-04's persistent-context restart under the CI
   runner's Chromium.
2. The Docker Compose stack serving /shortlist and the wired results
   pages (first run is the server stand-up).
3. The real Turnstile widget + siteverify on the journey that leads
   to a save (locally stubbed, as at M7.3/M7.4).
4. The play-server founder test list above.
5. Cross-tab badge updates in a real second tab (the `storage` event
   path is implemented and unit-shaped; the E2E proves the same-tab
   signal and the second-context absence, not a live two-tab race).
