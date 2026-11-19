# The entry point — the hybrid (build note, 18 Nov 2026)

Decision D72, adopted in full on 18 Nov 2026 (the plan's
"Entry-point rebuild gap check — ADOPTED in full"
paragraph). This note is the build's record: what was
built, the logging guide, and the scenario table the
founder asked to have somewhere permanent.

## What the hybrid is

One search, three layers, in order:

1. **Local, as filed.** Suggestions and the picker list
   come first from what the loaders have already filed —
   the postcode directory (the full ONSPD in
   `postcode_cache`), the filed sale addresses
   (`price_paid`), and — since M7.15B — the national
   picking index (`picking_index`, migration 0030): the
   union of the filed sales and the index, deduped by
   the home key with the filed rows winning, is the
   local tier (`lib/server/picking-index.ts`). "As
   filed" is the ruling: the search path never waits on
   a cold load; the check's own cold loads still run
   inside the check, as before.
2. **Postio, the backstop.** When the local list at a
   full postcode is short (fewer than
   `POSTIO_SUPPLEMENT_BELOW = 5` distinct local homes),
   Postio's exhaustive postcode list supplements it.
   The floor was 25 until M7.15B: with the picking
   index loaded, a postcode the local tier names fewer
   than five homes for is genuinely thin — brand-new or
   mostly non-residential — while at 25 the supplement
   kept paying to re-list homes the index already
   names. The merged list dedupes by normalised parts;
   a home both filed and in PAF appears once, as the
   local row. Picking a Postio row is the one billable
   moment.
3. **The postcode-level fallback.** If both layers fail —
   Postio slow (hard 1,500ms timeout), erroring, out of
   credit (HTTP 402), or not configured — the journey
   lands on the whole-postcode check. From a pick, it
   carries the one-line notice (below); before any pick,
   it stays silent.

The frozen brains and M7.3's ladder did not change. The
hybrid is a serve-layer resolution source beside them
(`lib/server/hybrid.ts`), wired in `lib/server/serve.ts`.

## The pieces

| Piece                                           | Where                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Local suggestion read model                     | `lib/server/suggestions.ts`                                                                 |
| Suggestions endpoint (local only, rate-limited) | `app/api/suggest/route.ts`                                                                  |
| Dropdown completion (keyboard, aria, picks)     | `components/PostcodeBox.tsx`, `components/kit.tsx` (`SuggestionShell`)                      |
| Postio client + fake                            | `lib/server/postio.ts`                                                                      |
| The hybrid brain (list merge, pick, promotion)  | `lib/server/hybrid.ts`                                                                      |
| Transient resolve records                       | `lib/server/resolve-records.ts`, migration `0029`                                           |
| Pick endpoint                                   | `app/api/pick/route.ts`                                                                     |
| Picker pages (merge wired)                      | `app/search/page.tsx`, `app/search/home/page.tsx`                                           |
| Decision log                                    | `lib/server/entry-log.ts`                                                                   |
| Rate limiter                                    | `lib/server/rate-limit.ts`                                                                  |
| Balance/health probe                            | `loaders/canary-postio.mjs` (item `postio` in `loaders/canary.mjs`)                         |
| Scenario fixtures + specs                       | `tests/fixtures/entry-point.ts`, `tests/entry-point.test.ts`, `tests/canary-postio.test.ts` |

## Rules the build holds

- **A keystroke never reaches Postio.** Suggestions are
  local-only: Postio's free search endpoint is
  abuse-monitored (searches without matching resolves
  can suspend the key). The client's `searchAddresses`
  exists for word filtering at pick/list time and for
  Phase 2's listing strings — never per keystroke.
- **The suggestions endpoint is a named exception to the
  robot check** (D72 item 4): local, open data only,
  rate-limited at 120 requests/minute per caller, nothing
  paid behind it. Turnstile stays on the typed-submit
  path (`/api/resolve`) only. Dropdown picks navigate
  straight to their route, as ruled.
- **Speed budgets:** suggestions target under 100ms
  server time (prefix/index reads), ~140ms client
  debounce, stale responses dropped; Postio calls carry
  the hard 1,500ms timeout, after which the fallback
  fires.
- **Postio results are never stored** — except the one
  founder-ruled exception: the **transient resolve
  record**. A picked Postio-only home has no filed row,
  so refresh, sharing and the checking screen's calls
  could not re-derive it. The record (migration 0029)
  holds the resolved parts under a random token carried
  in the URL where `home=` sits, with a **24-hour TTL
  and automatic expiry** (enforced on read; swept on
  write). Lists and suggestions are never recorded —
  only an actual pick writes a record.
- **Promotion:** once a Postio pick's own check has
  cold-loaded the postcode's filings and the home is
  among them, the results page redirects to the
  canonical home key and the record is deleted. The
  no-store exposure shrinks to homes with no sale since
  1995 and no EPC.
- **Scotland / NI:** the picker never renders there
  (ruling 4 stands); a Postio-picked Scottish/NI home
  would land on the not-covered results form exactly as
  a local pick does.
- **EPC-derived pickable homes** — NOT in the M7.15A
  build (they waited on written clearance for using the
  register's address fields as a picking index, D72
  item 5). **Superseded by M7.15B (18 Nov 2026):** the
  founder lifted the gate by executive decision and the
  certificate addresses now file into the picking index
  under a strict parser, structurally separable — see
  the M7.15B build note at the end of this document.

## Configuration

Server env only (see `.env.example`):

- `POSTIO_API_KEY` — the founder-placed key. **Absent
  (local dev, CI), the client is the no-key client:**
  every call answers `no-key` without touching the
  network, and the hybrid degrades to local + fallback.
  The founder is adding this line to the play server's
  `.env.local` ahead of the build landing; once it is
  there and the build is deployed, the backstop is live
  with no code change.
- `POSTIO_API_BASE_URL` — optional override (default
  `https://api.postio.co.uk/v1`); a test-rig setting.

## The list memory — and the warm-path bug of 18 Nov 2026

A fetched Postio list is held in a short in-process memory
(5 minutes, `POSTIO_LIST_MEMORY_MS`), so back-and-forth
navigation inside a few minutes never pays twice, and a
pick that arrives while the list is warm resolves from it
(`via=memory`) instead of paying for a UDPRN call.

**The bug (found live, 18 Nov 2026):** the play server's
entry log showed a `picker.list` for KT17 1FH served
`postioFrom=live` at 10:56:17 and a pick for one of its
rows (UDPRN 55174696) at 10:57:10 — 53 seconds later,
inside the TTL — resolving `via=udprn-call`. It paid. The
logic was correct and fully pinned in
`tests/entry-point.test.ts`, but the tests run list + pick
in ONE module instance by construction; the live miss
means the serving runtime did not share one populated Map
across the /search render and the /api/pick route — a
module-instance split in the production bundle, each
instance holding its own empty memory, which no
single-instance test can detect.

**The fix (same day, in the M7.10–M7.12 stacked build):**
the memory is anchored to `globalThis` (the standard
Next.js pattern for state shared across bundle instances),
so every instance of `lib/server/hybrid.ts` reads and
writes the ONE memory; the TTL semantics are unchanged
(anchored to the live fetch). The memory key is also
normalised with the project's `normalisePostcode` on both
write and read, so "KT171FH" and "KT17 1FH" share one
entry. The pin is strengthened two ways: the warm-pick
scenario now asserts `via=memory` on the pick's own log
line explicitly (not merely the absence of a second call),
and a new scenario simulates the split — the module is
re-imported fresh (`vi.resetModules`) between the list and
the pick, and the pick still resolves from the shared
memory with no second billable call. The deploy
verification (a through-the-page pick on the play server)
remains the end-to-end proof.

## The decision log

Every layer decision writes one structured line to
stdout (`lib/server/entry-log.ts`), prefixed `entry`,
carrying the request id. **To follow one request:**

```
grep "entry req=<request-id>" <server log>
```

| Event                 | Meaning                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suggestions.served`  | The local suggestions behind one keystroke pause: `shape=` (partial-postcode / full-postcode / text), the group counts (`postcodes=` `streets=` `homes=` `places=` `districts=` — `homes=` is the Homes count on a full postcode, the Properties count on a fragment; `places=`/`districts=` are the M7.15D group counts, 0 on a full postcode), `ms=`. Layer is always `local`. |
| `suggestions.limited` | A suggestions call refused by the rate limit.                                                                                                                                                                                                                                                                                                                                    |
| `suggestions.ceiling` | A served list ran past the defensive ceiling of 1,000: a full postcode's home list (D71 amendment, `homes=` the true count) or a fragment's postcode matches (M7.15C, `postcodes=` the true count), `ceiling=` the bound served. A truncation is logged, never silent.                                                                                                           |
| `picker.list`         | The picker list's composition: `local=` `postio=` `deduped=` counts, `postioFrom=` (live / memory / failed / not-called), `reason=` (`local-complete`, `merged`, `postio-<failure>`).                                                                                                                                                                                            |
| `postio.call`         | One Postio call: `op=` (postcode / search / udprn / connect), `reason=` (`ok`, `timeout`, `error`, `zero-balance`, `no-key`, `refused`), `ms=`, and Postio's own `postioRequestId=` when it answered.                                                                                                                                                                            |
| `pick.resolved`       | A pick's outcome: `layer=local` never occurs (local picks navigate directly); `layer=postio reason=resolved via=memory                                                                                                                                                                                                                                                           | udprn-call`, or `layer=fallback reason=postio-<failure>`. |
| `transient.created`   | A resolve record was written for a pick.                                                                                                                                                                                                                                                                                                                                         |
| `transient.served`    | A route re-derived a home from a record.                                                                                                                                                                                                                                                                                                                                         |
| `transient.promoted`  | The home is now filed locally; the canonical key took over and the record lapsed.                                                                                                                                                                                                                                                                                                |
| `transient.expired`   | A record outlived its 24 hours and was deleted on sight.                                                                                                                                                                                                                                                                                                                         |
| `fallback.notice`     | The mid-pick fallback notice was served on the postcode-level page.                                                                                                                                                                                                                                                                                                              |

The typed query itself is never logged — only its
classified shape and the counts it produced.

## The scenarios (founder's test data)

Fixtures: `tests/fixtures/entry-point.ts`. Specs:
`tests/entry-point.test.ts`. Each scenario is keyed by
its postcode, and each asserts the log path as well as
the outcome.

| Scenario        | Postcode                                        | What happens                                                                                                                                                                                                                                                                                                                                                                      | Which layer answers | What the logs show                                                                                                            |
| --------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| (a) Local only  | **CM3 2JT** (Birkdale)                          | 30 filed sale addresses — a complete local list; suggestions and the picker serve from the filing; the fake Postio knows the street and is never asked                                                                                                                                                                                                                            | Local               | `picker.list layer=local reason=local-complete local=30`; zero `postio.call` lines                                            |
| (b) Postio only | **KT17 1FH** (Minerva House)                    | Nothing filed; Postio returns Flats 3–9 as separate delivery points; Flat 4's pick resolves from the warm list memory into a transient record                                                                                                                                                                                                                                     | Postio              | `postio.call op=postcode reason=ok`; `picker.list layer=hybrid`; `transient.created`; `pick.resolved layer=postio via=memory` |
| (c) Fallback    | **CM0 7AA** (Southminster — the M7.15B witness) | Neither source knows a home there (it stands in the ONSPD excerpt; no filed sales, no index rows from either source — the witness CM1 6ER carried until the preload flipped it). Local empty; Postio scripted to fail in turn (error / timeout / zero-balance / empty). The list degrades silently; a pick lands on the whole-postcode check with `?notfound=pick` and the notice | Fallback            | `picker.list reason=postio-error`; `pick.resolved layer=fallback reason=postio-error` (or `-timeout`, `-zero-balance`)        |
| (e) EPC-covered | **CM1 6ER** (Beaulieu — the D72 witness)        | No filed sales; the picking index holds its 49 certificate homes. The union serves the picker locally; the fake Postio is never asked; the rows carry durable home keys, not tokens                                                                                                                                                                                               | Local (index)       | `picker.list layer=local reason=local-complete local=49`; zero `postio.call` lines                                            |
| (d) Combination | **EX1 1AA** (fixture High Street)               | 2 homes filed locally; Postio returns those 2 plus 2 more — merged list of 4, deduped 2, served in natural address order (the layers decide membership, never display grouping — founder fix, 18 Nov 2026). The pick of 3 High Street starts transient, then **promotes** to `3                                                                                                   |                     | HIGH STREET` once its sale is filed (the cold load landing) and the record lapses                                             | Hybrid, then local | `picker.list layer=hybrid local=2 postio=4 deduped=2`; `transient.created`; (in production) `transient.promoted` |

## The balance probe — and its one honest limit

`loaders/canary-postio.mjs` (canary item `postio`) runs
with the monthly canary family. It reads `POSTIO_API_KEY`
from the runner's env:

- **No key** → a skip in its own words ("not wired on
  this server yet") — never a failure.
- **Key rejected / service down** → warning (key) or
  skip (unreachable, per the canary house rule).
- **Low balance** → a warning that rides the canary
  run's report and its Resend alert email, at under
  `POSTIO_LOW_BALANCE_LOOKUPS = 100` lookups remaining
  (≈ £2.60; a £10 top-up ≈ 384 lookups and never
  expires).

**The limit:** Postio publishes **no balance endpoint**
(checked against its OpenAPI spec, 18 Nov 2026 — `/connect`
is a free key/health probe and returns no balance). The
probe's account read therefore goes through a seam
(`fetchPostioAccount`): the live implementation reports
key health and `lookupsRemaining: null`, and the verdict
says so plainly. The low-balance branch is fully built
and tested against the seam with fakes
(`tests/canary-postio.test.ts`); the day a balance read
exists, the seam returns it and the warning starts
firing with no further change. Until then, a zero
balance still surfaces live — as `postio.call
reason=zero-balance` and `pick.resolved layer=fallback`
lines in the decision log.

## Copy pending the founder's final approval

1. **The mid-pick fallback line** (pinned in
   `lib/journey.ts` as `PICK_FALLBACK_LINE`, asserted
   verbatim in the specs so any change is deliberate):
   "We couldn't load that exact home just now — here's
   the check for the whole postcode instead."
2. **The suggestion group labels** — "Postcodes" and
   "Homes" (adopted wording, D72 item 6; the sample's
   exact placeholder — "Enter a postcode — e.g. SW1A
   1AA" — is kept unchanged, as ruled).

## Not done here, by design

- **The one live Postio proof call** (the exhaustive
  postcode endpoint for KT17 1FH, settling the
  shared-delivery-point question) happens founder-side
  once the key is on the server — this build made no
  live Postio calls anywhere, and CI never will (the
  fake client stands in).
- **EPC-derived pickable homes** — built by M7.15B
  (below); the national EPC run itself happens after
  deploy, when the founder's bulk download is filed.
- **The Postio backstop's go-live** still waits on the
  providers' written use-case confirmations (D72 item
  9). The code degrades safely without the key; the gate
  is about switching it on, not about building it.

## M7.15B — the national preload (build note, 18 Nov 2026)

The preload files the nation's address PARTS into a
slim picking index so the local tier can name a
postcode's homes from day one. Adopted in full by the
founder on 18 Nov 2026, including the town amendment
(the index carries each home's post town as filed —
street suggestions, M7.15C, are only honest with the
town attached).

**Storage (migration 0030).** `picking_index` (postcode,
PAON, SAON, street, town, home key, source tags, source
editions) is BUILT from two retained per-source
extracts — `picking_sales_extract` and
`picking_epc_extract` — each refreshed by its own
loader pass through an unlogged staging table, deduped
in SQL on (postcode, home key). `price_paid` is NOT
filled nationally and no brain reads the index: it is
identity for picking, never evidence. The editions
table (`picking_index_editions`) holds each source's
filed edition and the DISTINCT counts its pass printed
as proof.

**The two passes.** `loaders/load-picking-index.mjs`
streams the Price Paid complete file (~5.3GB) line by
line — never accumulating beyond one batch — and files
parts only. `loaders/load-epc-index.mjs` files the
register's bulk domestic certificate file (a
founder-side download; the loader takes `--file`)
under a STRICT witnessed-shape parser: flat designator
with an anchor → SAON; number + street; a named
building in the register's PAON form; ambiguity files
nothing and is counted as a refusal, by reason; there
is no fuzzy pass, ever. On a collision the sales parts
win and the EPC provenance is retained in the source
tags. Separability is structural: the kill switch
(`load-epc-index.mjs --kill-switch`) rebuilds the
served index from the sales extract alone — tested as
a deliverable (EPC-only rows gone, merged rows keep
their sales parts, sales rows byte-identical).

**The read model.** Suggestions and the picker read
the UNION (filed price_paid + index, filed winning);
an index-only home resolves by its durable home key
through the serve layer exactly as a filed home does —
no token, no TTL, no Postio call. The Postio
supplement floor recalibrated 25 → 5 (above).

**Freshness.** The sales pass is a monthly FULL
re-extract under its own schedule entry and a measured
180-minute timeout (the file alone streams ~35 minutes
at the measured ~2.6MB/s — the named exception to the
30-minute default, pinned in tests/run-loaders.test.ts);
the EPC pass repeats monthly from a fresh download and
rides the schedule as an operator entry (the timer
cannot fetch a file behind the register's sign-in; its
SKIPPED line with its last-filed date is the monthly
prompt). Every pass's proof is its DISTINCT counts
(postcodes, homes, streets-with-town, printed in the
run record); a re-extract whose distinct home count
moves beyond 2% against the filed edition is refused
before anything swaps, the refusal is recorded on the
editions row, and the canary item `picking-index`
ages both editions and reports refusals.

**Witnesses.** Beaulieu CM1 6ER (0 sales, 49
certificates) is the EPC acceptance witness and flips
to EPC-covered when the EPC half loads — scenario (e).
The fallback scenario moved to the new neither-source
witness, CM0 7AA (Southminster): present in the ONSPD
excerpt the directory fixture carries, absent from
both sources' fixture data. The invariant the step
carries: a golden home's served bundle is
byte-identical with the index present vs absent
(tests/picking-index.test.ts) — the index cannot
change an answer, only name more homes.

**The runs are not this build.** The national sales
run happens on the VPS after deploy, supervised; the
EPC run when the founder's bulk file arrives. Until a
pass files, the index reads as empty and the picker
behaves exactly as it did before the preload.

## D71 amendment — the full-postcode dropdown (build note, 18 Nov 2026)

**The ruling.** The founder, testing the play server
against Royal Mail's address finder, found the
dropdown's cap of 8 hiding homes: at CM3 2JT the served
eight stopped at 18 Birkdale Rise and his own **19
Birkdale Rise** — filed, with its sale, in data the site
holds in full — sat past the cut. He ruled the same day:
for a FULL postcode, the dropdown carries that
postcode's COMPLETE home list, scrollable, in natural
address order. This build is that amendment.

**What changed.**

- **Server** (`lib/server/suggestions.ts`): the
  full-postcode branch of `suggestionsFor` no longer
  breaks at `SUGGEST_TOTAL_CAP`. The Homes group is the
  postcode's full union list (the picking-index union,
  naturally ordered), and address words typed alongside
  the postcode filter within that full list — the
  filtered result is uncapped too. The Postio supplement
  behaviour for short local lists is untouched (a
  keystroke still never reaches Postio; the supplement
  lives on the picker path, as before).
- **The fragment cap stands, exactly.** Partial
  postcodes (the Postcodes group), fragments and mixed
  groups still cap at 8 in total (`SUGGEST_TOTAL_CAP`).
  M7.15C's future Streets group will live under that
  same fragment cap when it lands; nothing about the
  fragment shapes changed here.
- **One bound remains, defensive only:**
  `SUGGEST_FULL_POSTCODE_CEILING` = 1,000. A postcode's
  homes number in the hundreds at most, so no real list
  reaches it; if one ever did, the serve logs
  `suggestions.ceiling` with the true count and serves
  the first 1,000 in natural order — a truncation is
  never silent, and nothing below the ceiling is ever
  truncated. No pagination: the list is naturally
  bounded and the picker page remains the full surface.
- **Client** (`components/PostcodeBox.tsx`,
  `components/kit.tsx`, `app/globals.css`): the shell
  and group labels ("Postcodes" / "Homes") are
  unchanged; a group's list is now a scrollable region
  (height capped at roughly eight rows, never more than
  60% of the viewport) under its pinned label. Keyboard
  up/down traverse the FULL list and the active row is
  scrolled into view as it moves
  (`scrollIntoView({ block: "nearest" })`); Enter picks
  it; a mouse pick works for every row, below the fold
  included. Short lists never reach the region's cap and
  render exactly as before.

**Evidence and pins.** The CM3 2JT case is pinned at
both levels: tests/entry-point.test.ts — scenario (a)
now asserts all 30 filed Birkdale homes served in
natural order (19 among them), scenario (e) all 49
Beaulieu certificate homes, plus a dedicated describe
for the amendment's bounds (a partial postcode still
caps at 8; a synthetic 27-home postcode serves all 27
in natural order; address words narrow within the full
list; the ceiling truncates at 1,000 and logs). The two
specs that asserted the old cap on a full-postcode query
— scenario (a)'s and scenario (e)'s suggestion specs —
were updated to the new rule. e2e/suggest.e2e.ts runs
the founder's own case against the served app: the
CM3 2JT dropdown holds more than 8 homes including
19 Birkdale Rise, the region scrolls, the keyboard
walks to 19 (scrolled into view) and Enter lands in its
check; a second spec picks the last home by mouse.

## Two-digit districts — the partial-suggest bug (fix note, 18 Nov 2026)

**The finding.** The founder, testing the play server
against Royal Mail's finder, typed a partial postcode
in a two-digit district — E16 — and got NO
autosuggestions at all: `/api/suggest?q=E16`, `q=E161`
and `q=E161G` all returned `{"groups":[]}`, while CM3
and CM32 correctly returned CM3 2JT. Every partial in
every two-digit district in the country (E16, SE15,
EH12, B24, LS12…) was silently dead; one-digit districts
worked, which is why the golden-corpus testing (CM3,
KT17) never showed it.

**The cause — two halves, one assumption.** Both halves
encoded an outward code as letters + ONE digit + an
optional letter:

- `spacedPrefixOf` (`lib/server/suggestions.ts`) parsed
  the outward with `^([A-Z]{1,2}[0-9][A-Z]?)(…)$`, so
  "E161G" parsed as outward "E1" + rest "61G" and
  produced the prefix "E1 61G" — a string no filed
  postcode starts with.
- The classifier's `OUTWARD_RE` (`lib/address.ts`)
  ended in `\b`, which can never match mid-token, so a
  compact partial whose inward had begun ("E161",
  "E161G", "SW1A1") classified as carrying NO outward
  at all — and the suggestions gate (`prefix &&
input.outward`) stayed shut whatever the prefix was.
  The same gate fronts rung 3, so a submitted "E161"
  also landed on the no-location rung instead of the
  E16 wider area; it now resolves as the partial it is,
  exactly as the spaced "CM3 2" always has.

The full-postcode shapes were never affected: the
classifier's full-postcode regex and `normalisePostcode`
carry `[A-Z0-9]?` as the outward's fourth character,
which covers a second digit as readily as a letter
(E16 1GN's homes served throughout). A sweep of the
repo found no other site holding the one-digit
assumption: the loaders' postcode validators are
full-postcode shapes with the same `[0-9A-Z]?` fourth
character, and the area derivations (crime, sold
prices, health) take the letters of an already-spaced
filed postcode, district-shape agnostic.

**The fix.** The outward grammar is now the real one —
1–2 letters + 1–2 digits, or 1–2 letters + a digit + a
letter. `spacedPrefixOf` returns the best of
`spacedPrefixCandidatesOf`'s parses (an explicit
space's split first — "CM3 2" is unambiguous — then the
longest district), and `suggestionsFor` walks the
candidates, serving the first the filed directory
answers. The walk is what resolves the one genuinely
ambiguous shape: "CM32" is CM3 with the inward's "2"
(the behaviour the site has always had for it) and
"SE15" is the district SE15 — the same string shape,
settled only by which prefix the directory holds.
`OUTWARD_RE`'s trailing `\b` is now `(?![A-Z])`: the
outward may end where a digit follows (the inward
beginning), never immediately before a letter.

**Pins.** tests/entry-point.test.ts: the parse pins
(E16/E161/E161G, EH12, B24, SE15, LS12, W12, W1A,
SW1A, SW1A1, EC1V, CM3) and the served pins against a
witness directory (E16 1GN + E16 1EG + CM3 2JT): "E16"
serves both E16 postcodes; "E161" serves both (only
the inward's first digit is typed); "E161G" narrows to
E16 1GN; "CM3"/"CM32"/"CM3 2" all serve CM3 2JT.
tests/address.test.ts: the classifier pins for compact
partials. e2e/suggest.e2e.ts: "E161" and "E161G"
against the served app suggest E16 1GN, the seeded
corpus's one E16 postcode.

## The picker page is removed (founder ruling, 18 Nov 2026)

**The ruling.** The address picker page — the
`/search?postcode=` page that listed a full postcode's
homes behind a select-then-confirm step — is REMOVED
entirely. A button press with a full postcode and no
home picked now goes straight to the WHOLE-POSTCODE
CHECK (rung 2), the destination the picker's "See the
check for the whole postcode" link used to lead to.

**The list moved, not deleted.** The whole-postcode
check page now carries the postcode's FULL home list at
its head: the same union read model (filed sales +
filed certificates + the picking index), in natural
address order, uncapped as the dropdown's full-postcode
list is, each home a link straight to its own check.
The hybrid supplement machinery re-points to this list:
`pickerList` (local union + the Postio supplement below
the floor, with its warm list memory and transient
records) serves the list on the postcode check exactly
as it served the picker page, so no behaviour is lost —
without the list, a button-presser could never reach a
home check at all. A Postio-served row still resolves
through `/api/pick` into its transient record; a local
row is a plain link carrying the home's durable key.
Zero-home postcodes keep the named fallback line ("No
addresses we can list for this postcode yet.") on the
postcode check.

**The route retires as a redirect.** `/search?postcode=
<full postcode>` redirects to the whole-postcode check,
so old links and bookmarks never 404. The dropdown's
Postcodes group now links straight to the check (the
redirect remains for anything already published).
Picking a home in the dropdown still goes straight to
the home check, unchanged. Scotland/NI routing is
untouched — the not-covered page renders no list, as
before. The D71 amendment's line "the picker page
remains the full surface" is superseded by this ruling:
the postcode check is now the full surface, list
included.

**What was deleted.** `components/AddressPicker.tsx`
(the select-then-confirm island), the picker's confirm
label and its postcode-level link, and the picker's
slot in the journey routing table (`journeyDestination`
now returns the postcode-results destination for a
covered full postcode). The checking screen's "Back to
the address list" link went with the page it pointed
at.

**Specs reworked.** tests/journey.test.ts (the routing
table and the pinned copy), tests/entry-point.test.ts
(the Postcodes group's hrefs), and the e2e journey
family — journey, results, headlines, calculators,
report-door, shortlist, phone, suggest — now assert the
new journey: button press → postcode check carrying the
full list; a home pick from that list → the home check.

## M7.15C — street suggestions, the three-group dropdown, and the E161G fix (build note, 18 Nov 2026)

**The step.** The dropdown package, in the founder's
rulings of 18 Nov 2026: street suggestions adopted in
full (the street prep), the dropdown expanded to three
groups — Postcodes / Streets / Properties, each capped
at 5 — and the fragment fix found in that evening's
deploy round. Everything below is local data only, as
the whole entry point is: a keystroke still never
reaches Postio, the rate limit and the entry logging
are unchanged, and no brain reads the picking index
(the suggestions read it directly, as the picker does —
it is a read model, not a brain input).

**The street table.** Migration 0031 files
`picking_streets`: one row per (street, postcode) the
picking index holds homes on, carrying the street's
display form, the town its homes file most (ties by
name) and its home count. It is a build product of the
index, never a source: the shared filing machinery
rebuilds it inside every union rebuild — both loader
passes and the EPC kill switch — so it can never name
a street the served index does not hold. The migration
also runs the same build once over the index as filed,
so the already-loaded play server serves streets the
moment the migration lands. A street is suggestible
exactly when we hold homes on it; the index holds
England & Wales data only, so Scotland/NI streets
honestly return nothing — no group, no near-miss from
another nation.

**The two tiers.** Exact first: the typed words
prefix-match the street's words in order ("Birkdale"
finds BIRKDALE RISE), deterministic, riding the
pattern index. Fuzzy second, only when exact found
nothing or nearly nothing (at most one): Postgres
pg_trgm similarity at the pinned threshold of **0.4**,
offered AS CHOICES ONLY, below the exact rows,
deduplicated, at most 4 rows inside the group's cap of 5. The threshold was witnessed against the real
function before the build: BUGDALE RISE ~ BIRKDALE
RISE scores **0.5000** (the prep's witness pair), the
highest unrelated pair witnessed (BUGDALE RISE ~
BIRKDALE ROAD) **0.2273**; db/prove.mjs re-proves both
against real Postgres in CI's database job. Submitting
a search NEVER applies a fuzzy match silently — a
submit without a pick resolves exactly as it did
before this step, fuzzy or not — and no copy anywhere
says "did you mean": the real street is simply in the
list, under its own name.

**A street pick.** A suggestion is a (street, town)
unit — same-named streets in different towns are
different suggestions. One postcode behind it: the
pick goes straight to that postcode's check, its home
list narrowed to the street (the postcode route
carries the street; the search route's rung-2 redirect
now preserves the narrowing onto the home route, and
the home route re-derives the narrowed resolution from
its own parameters). Several postcodes: the short
postcode choice (components/StreetChoice.tsx) in the
picker's list style, rows biggest-first, each opening
that postcode's check narrowed the same way. A street
pick never lands on a home directly. A street whose
homes file no town labels by its postcode where it has
exactly one; the choice page's rows always carry the
postcode.

**Properties.** The union's homes inside the typed
bound — the fragment's winning postcode prefix and/or
the served streets' (street, postcode) pairs — narrowed
by every typed address word (the full-postcode branch's
whole-token rule), deduped by home key with the filed
form winning, ordered by postcode then natural address
order, capped at 5. Each item is the home's full
address line (picker label, town, postcode) and picks
straight into that home's check. With neither bound —
a bare word, no fragment, no street — there is no
Properties group: a word never scans the nation's
homes.

**The E161G fix, and the cap conflict's resolution.**
Against the complete directory, the fragment "E161G"
matches 20 live E16 1G\* postcodes, and the fragment
list's old cap of 8 cut E16 1GN out alphabetically — a
typed fragment making a real postcode unreachable.
Fragment postcode results now ride the D71 pattern the
full-postcode list uses: the complete matching set,
scrollable, bounded only by the same defensive ceiling
(1,000), a truncation logging `suggestions.ceiling`
with the true count. The grouped ruling's "Postcodes
capped at 5" is resolved as the brief directed and is
recorded here as the standing reading: **the cap
governs how many rows render before scrolling, never
how many matches exist** — the panel's CSS shows about
five rows per group in the grouped form
(`app/globals.css`, the `:has(.suggest__group +
.suggest__group)` rule), the served set is complete,
and the full set stays reachable by scrolling, exactly
as the home list behaves. The witness is pinned in
tests/street-suggestions.test.ts: all twenty E16 1G\*
postcodes serve for "E161G", E16 1GN among them.

**The couldn't-place notice.** Replaced with the
prep's adopted working text — "We couldn't place that.
Try a full postcode — for example SW1A 1AA — or start
typing a street name and pick it from the list." The
old line's claim (a street name on its own isn't
enough) became false the day street names became
pickable. The founder finalises the wording at UAT, as
with the street choice page's line ("This street
covers more than one postcode — pick yours to see its
homes."), which is build-drafted in the site's plain
voice and pinned in lib/journey.ts.

**Coverage.** tests/street-suggestions.test.ts (the
witness world: the twenty E16 1G\* postcodes, the
multi-postcode Birkdale, the scripted fuzzy pair — the
fixture style this document's scenarios established);
the entry-point fixture's source grew the three new
reads over its own union; the loader suites pin the
street table's rebuild on a sales filing, an EPC
filing and the kill switch; db/prove.mjs proves the
extension, the threshold witnesses and the rebuild
grain against real Postgres; e2e/suggest.e2e.ts gains
the street, fuzzy and properties journeys against the
seeded corpus (whose picking-index pass files BIRKDALE
RISE and EXETER ROAD into the street table). The
multi-postcode choice page has no e2e witness — the
seeded corpus holds no street spanning postcodes; it
is unit- and render-pinned, and its first live exercise
is the play server.

## M7.15D — place search (build note, 18 Nov 2026)

The dropdown's fourth group, on the founder's ruling
of 18 Nov 2026: typing a town or place name offers the
place under **Places** (capped at 5, like Streets and
Properties); a place whose name stands typed in full —
or picked, which files the name — offers its postcode
districts in the same panel under **Districts in
\<Place\>**; a district leads to that district's
wider-area page. The town chooser lives inside the
picker (Final Sample Master view 25); there is no town
page, and a place pick never lands on a home. The
group order is Postcodes, Streets, Properties, Places,
Districts — the plan names Places "a fourth group";
view 25 shows Places and Districts alone together (no
other group co-occurs in it), so the order among the
groups follows the plan's enumeration, and the
Districts group rides immediately behind its place.
The grouped panel's CSS needed no change: the render
window's `:has()` rule is already generic over group
count, and the panel scrolls.

**Where places come from — a premise, refined.** The
step text says places derive from "post towns in the
national postcode directory and the picking index's
town-as-filed". The directory as filed carries no post
town: the postcode loader files ONSPD's columns
(postcode, coordinates, council, ward, region, LSOA,
MSOA), and ONSPD has no post town to file. The held
post towns are the picking index's town-as-filed — the
Price Paid town and the EPC register's post town, the
same union the district brain's places read draws on.
Places therefore derive wholly from held data, no new
source, Postio no part — the substance of the premise
holds; the directory's part is the districts
themselves and their standing, below.

**The place table.** Migration 0032 derives
`picking_places` from the picking index — one row per
(place, district), the place's display form and its
distinct postcode count — rebuilt inside every union
rebuild (both filing passes and the EPC kill switch)
by `rebuildPickingPlaces` in the shared filing
machinery, the streets' pattern exactly. A place is
suggestible exactly where we hold homes filed under
its name. The read model is lib/server/places.ts, the
street read model's sibling: exact word-prefix tier,
then the pg_trgm fuzzy tier under the same discipline
(threshold set inside one transaction; offered only
when the exact tier found at most one place; at most
four rows, below the exact ones, inside the cap).

**The threshold, witnessed for places.** The streets'
pinned 0.4 carries, on its own witnesses, measured
against the real function before the build (PGlite's
pg_trgm; db/prove.mjs re-proves the pair against real
Postgres): the plan's witness, the transposition
CHLEMSFORD ~ CHELMSFORD, scores **0.4667**; the
nearest unrelated real town, CHELMSFORD ~ CHELTENHAM,
scores **0.2222**. Fuzzy stays a choice only: the
typed misspelling is never served back, a fuzzy place
expands nothing unpicked (expansion is the exact
name's alone), and submitting never applies a fuzzy
match — there is no code path from a suggestion to a
submission. No "did you mean" wording anywhere.

**The honesty rule.** A district is offered iff the
district page serves it in its own form — the district
bundle's own test: the district's filed postcodes in
the directory carry an England or Wales LSOA code. A
Scotland / NI district keeps the not-covered form, so
the place flow never offers it, and a place with no
served district is not offered at all. The read model
applies the test live against the directory (an EXISTS
over the district's postcodes), so the offer cannot
drift from the page it leads to. By construction the
index's England & Wales sources file no Scottish
towns — as with streets, the rule is the guard, pinned
by a fixture Scottish place in the unit tests and by
the predicate's proof in db/prove.mjs. It is a guard
with no e2e witness in the seeded corpus (which files
no Scottish towns) — the same position as M7.15C's
multi-postcode street choice: unit-pinned, first live
exercise on the play server.

**The one wire-contract extension.** A place pick
cannot navigate — the ruling puts the chooser inside
the picker — so a Places item is the dropdown's one
non-navigating item: `{ label, href: null, place }`.
The client files the filed name into the search field;
the ordinary debounced fetch then serves that place
exactly, with its Districts group — the state view 25
depicts. Every other item kind keeps `{ label, href }`
exactly; the full-postcode Homes branch is untouched,
as are the street flows and every bundle shape.

**Coverage.** tests/place-suggestions.test.ts (its own
witness world: Chelmsford over CM1/CM2/CM3, the
scripted transposition, a seven-place cap family, a
Scottish place) plus witnesses against the shared
entry-point fixture, whose source grew the three place
reads over its own union — its Chelmsford honestly
serves CM1 and CM3 only, no CM2 being filed there. The
loader suites pin the place table's rebuild on a sales
filing, an EPC filing and the kill switch.
db/prove.mjs proves the threshold witnesses, the
rebuild grain and the served-district predicate
against real Postgres. e2e/suggest.e2e.ts gains the
place journeys against the seeded corpus: the town
typed in full (Places + Districts, CM1 and CM3 — the
seeded world files no CM2 Chelmsford row, and a spec
pins its absence), the place picked from a part-typed
name expanding in place, and the misspelling offered
as a choice only. Playwright cannot run locally; CI is
their first execution.

**Deploy follow-up — the CM92 phantom district
(19 Nov 2026).** The step's deploy verification found
one row in the play server's place table that should
not be offered: (CHELMSFORD, CM92), postcode_count 1,
serving a "CM92 — Chelmsford" district choice whose
page aggregates by the CM92 prefix. Diagnosis, from
the server's own rows:

- The source record is a single Price Paid deed:
  SANDRINGHAM HOUSE, SANDRINGHAM AVENUE, filed under
  postcode CM92 1LX and post town CHELMSFORD (sales
  extract and index agree; the EPC extract holds no
  CM92 row). It is the only CM92 record in the index.
- The outward derivation was faithful:
  split_part(postcode, ' ', 1) on "CM92 1LX" yields
  CM92, exactly as filed. No other derivation in the
  codebase shares even that much exposure — the
  classifier (lib/address.ts) only accepts postcodes
  matching the canonical grammar and takes the
  outward from the normalised form; the district
  bundle never derives an outward from an index
  postcode at all (membership is the directory's rows
  under a prefix); crime reads the area letters off a
  served postcode.
- The served-district guard did not fail: it tests
  the district's directory standing, and CM92 has
  it. The directory as filed from ONSPD's pcds column
  (verbatim, loaders/load-postcodes.mjs) holds 18
  live CM92 postcodes (1LA–1LY) in Harlow — council
  Harlow, ward Great Parndon, LSOA E01021840. The
  guard passed the pair legitimately; what is false
  is the PAIRING (Chelmsford does not contain CM92),
  and no standing test can see that. Nor can a
  grammar test: "CM92 1LX" satisfies the canonical
  grammar the classifier itself applies
  ([A-Z]{1,2}[0-9][A-Z0-9]? + [0-9][A-Z]{2}).
- The wider class, measured on the server: 415 of
  the table's 24,603 rows pair a place with an
  outward the directory does not hold at all
  (ABERTILLERY under NP3, BANBURY under OC16,
  BARNSLEY under LS75 — deed mis-keyings; the guard
  already suppresses every one), and exactly 4 rows
  carry an outward that fails the grammar outright
  (CRO, HRW, NNR6, and UNKNOWN — the last from the
  index's single spaceless postcode, the literal
  string "UNKNOWN" one deed carries). CM92 is the
  one witnessed pairing that is both served and
  false: a single-record pairing whose district
  happens to have standing.

**The fix — the derivation, at both its homes**
(loaders/picking-index-filing.mjs
rebuildPickingPlaces, and migration 0033, which
re-derives the table on databases 0032 already
built; 0032's SQL stands as the creation record):

1. The district is the outward code under the
   canonical grammar — the classifier's own recipe
   (normalisePostcode): the compact form must parse
   as outward + inward, and the outward is its
   leading group. A postcode that does not parse
   contributes no pair (kills CRO / HRW / NNR6 /
   UNKNOWN and their whole family).
2. A pair is filed only where the index holds more
   than one home under the place's name in the
   district — no single-record pairings (kills
   CM92—Chelmsford and every pairing of its shape,
   including false pairings whose districts have
   standing, which no guard at the read layer can
   ever see). The home itself stays in the index;
   only the pairing is withheld. A genuine pairing
   in a 25M-home index rests on many homes; the
   fixture worlds' genuine pairs hold 7–49 homes in
   a single postcode, so the floor is on HOMES, not
   on the table's distinct-postcode count.

The read model (lib/server/places.ts) is unchanged —
the guard remains as the second line of defence.
Witnesses: tests/load-picking-index.test.ts files
the real CM92 shape (one home; grammar-valid, so
only the floor can withhold it) and two-home CRO /
UNKNOWN pairings (so only the grammar can withhold
them), and pins that the records themselves stay in
the index; db/prove.mjs files the same phantoms
against real Postgres and asserts neither pairing is
derived; a scoped PGlite rehearsal of migration
0033's verbatim SQL passes (twelve grammar
spot-checks, the table deriving exactly the genuine
pairs). Both loader passes and the EPC kill switch
share the one filing function, so every refresh
holds the corrected derivation. Deploy note: the
play server's table is corrected by migration 0033
at the next migrate; no loader re-run is needed.

## The suggest latency fix — pattern indexes and the served-district predicate (fix note, 19 Nov 2026)

The founder, testing on his phone, felt the dropdown
lag; measured on the play server (localhost, quiet
box), GET /api/suggest for partial postcodes took
~5.5–6.3 seconds — E16 ≈ 5.8–6.2 s, E161 ≈ 6.2 s,
E161G ≈ 5.6 s, CM3 ≈ 6.0 s, consistent across runs —
against D72 item 4's under-100 ms server budget.
Street fragments were fast (Birkdale ≈ 60 ms warm);
place fragments were erratic (Chelms 0.04–3.5 s,
Chlemsford 0.2–3.5 s). Diagnosis by EXPLAIN
(ANALYZE, BUFFERS) against the live database found
three slow nodes, all in the fragment path, none in
the served logic:

1. THE PROPERTIES READ (the dominant cost).
   propertiesMatching's picking_index side —
   `postcode LIKE '<prefix>%'` — ran a Parallel Seq
   Scan over all 25.1M rows (9,047 MB): 6,088 ms
   for 'E16 1G%', 6,485 ms for 'E16%'. That one node
   is the endpoint's ~6 s. (E161G's response is
   2 KB; the cost was never the payload.)
2. THE DIRECTORY READ. postcodesByPrefix — the
   same LIKE shape over postcode_cache — seq-
   scanned 1.81M rows: 269 ms ('E16 1G%'), 183 ms
   ('E16%').
3. THE PLACES SERVED-DISTRICT TEST. The EXISTS in
   lib/server/places.ts tested membership as
   `postcode LIKE outward || ' %'` — a LIKE pattern
   built from the row itself. Postgres can bound an
   index scan only from a CONSTANT pattern prefix,
   so no index could ever serve it: every candidate
   district paid a full sequential scan of the
   directory, and the semi-join stopped wherever in
   the heap the district's first England-or-Wales
   postcode happened to sit. The same 'CHELMS%'
   read measured 2,576 ms and 4,821 ms on two
   identical runs — the roulette IS the erratic
   place timings.

The root cause of 1 and 2 is the one migration 0031
already records for streets: the database collation
is en_US.utf8, under which a LIKE prefix rides only
a text_pattern_ops index. Streets (0031) and places
(0032) received theirs at their builds; the two
postcode columns never did — their reads were
per-postcode equalities until the fragment shapes
arrived, and equality rides any btree, so nothing
looked missing.

The fix, in the same order:

- Migration 0035 adds the two pattern indexes —
  picking_index (postcode text_pattern_ops) and
  postcode_cache (postcode text_pattern_ops). The
  queries are untouched; the index changes only
  how matching rows are found, so served results
  are identical by construction. Sizes/build at
  the live proof: 201 MB / ~23 s and 46 MB /
  ~1.3 s. Both tables are maintained in place by
  their loaders (the picking rebuild is DELETE +
  INSERT), so the indexes persist across filing
  passes.
- The places predicate is rewritten to outward
  equality — split_part(postcode, ' ', 1) =
  outward — riding migration 0017's
  postcode_cache_outward_idx, the expression the
  resolver's district count already uses
  (lib/address.ts). Identity with the LIKE form is
  proved, not assumed: the two can differ only on
  a postcode carrying no space at all (an outward
  is spaceless and metachar-free under the
  canonical grammar); the live directory holds
  ZERO spaceless postcodes, and the served-outward
  sets computed under both forms over the whole
  directory diffed empty in both directions.
  Chelmsford's served districts are the same six
  under both forms (CM1, CM11, CM2, CM3, CM4,
  CM6). db/prove.mjs's restated witness of the
  predicate was aligned to the new form (its
  assertion — England offered, Scotland withheld —
  is unchanged).

Proof (before → after, EXPLAIN ANALYZE totals on
the live database; the index plans were proven
inside rolled-back transactions — proof indexes
verified gone afterwards, nothing permanent
created on the server):

- picking_index 'E16 1G%': 6,088 ms → 2.5 ms warm
  (99.7 ms on the first cold run).
- picking_index 'E16%': 6,485 ms → ~50 ms warm
  (26,928 matching homes; a first-ever cold run
  costs ~2.1 s of heap reads, then the district's
  pages stay warm — CM3's 21,533-home shape:
  1,248 ms cold → 62 ms warm).
- postcode_cache 'E16 1G%': 269 ms → 0.2 ms;
  'E16%': 183 ms → 1.0 ms.
- places 'CHELMS%': 2,576–4,821 ms → 3.4 ms,
  deterministically (index scan per candidate);
  placeDistricts('CHELMSFORD'): → 0.6 ms.

So a partial-postcode keystroke's database work
lands at single-digit milliseconds for an inward
fragment and ~50–60 ms warm for a bare outward —
inside the D72 budget — with groups, caps, the
complete-postcode-set rule (E161G still serves all
20), orderings and witnesses exactly as before: no
query's results changed, and no test was re-pinned.
End-to-end timings on the play server follow at the
deploy of migration 0035 (the migration's index
builds run then; the app picks the new places
predicate up with the same deploy).
