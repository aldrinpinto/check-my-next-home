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
   `postcode_cache`) and the filed sale addresses
   (`price_paid`). "As filed" is the ruling: the search
   path never waits on a cold load; the check's own cold
   loads still run inside the check, as before.
2. **Postio, the backstop.** When the local list at a
   full postcode is short (fewer than
   `POSTIO_SUPPLEMENT_BELOW = 25` distinct filed homes —
   a build judgement: a postcode typically carries 15–30
   delivery points and filed sales are only the homes
   sold since 1995, so a short filed list is a partial
   list), Postio's exhaustive postcode list supplements
   it. The merged list dedupes by normalised parts; a
   home both filed and in PAF appears once, as the local
   row. Picking a Postio row is the one billable moment.
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
- **EPC-derived pickable homes are NOT in this build** —
  they wait on written clearance for using the register's
  address fields as a picking index (D72 item 5).

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

| Event                 | Meaning                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suggestions.served`  | The local suggestions behind one keystroke pause: `shape=` (partial-postcode / full-postcode / text), counts, `ms=`. Layer is always `local`.                                                         |
| `suggestions.limited` | A suggestions call refused by the rate limit.                                                                                                                                                         |
| `picker.list`         | The picker list's composition: `local=` `postio=` `deduped=` counts, `postioFrom=` (live / memory / failed / not-called), `reason=` (`local-complete`, `merged`, `postio-<failure>`).                 |
| `postio.call`         | One Postio call: `op=` (postcode / search / udprn / connect), `reason=` (`ok`, `timeout`, `error`, `zero-balance`, `no-key`, `refused`), `ms=`, and Postio's own `postioRequestId=` when it answered. |
| `pick.resolved`       | A pick's outcome: `layer=local` never occurs (local picks navigate directly); `layer=postio reason=resolved via=memory                                                                                | udprn-call`, or `layer=fallback reason=postio-<failure>`. |
| `transient.created`   | A resolve record was written for a pick.                                                                                                                                                              |
| `transient.served`    | A route re-derived a home from a record.                                                                                                                                                              |
| `transient.promoted`  | The home is now filed locally; the canonical key took over and the record lapsed.                                                                                                                     |
| `transient.expired`   | A record outlived its 24 hours and was deleted on sight.                                                                                                                                              |
| `fallback.notice`     | The mid-pick fallback notice was served on the postcode-level page.                                                                                                                                   |

The typed query itself is never logged — only its
classified shape and the counts it produced.

## The scenarios (founder's test data)

Fixtures: `tests/fixtures/entry-point.ts`. Specs:
`tests/entry-point.test.ts`. Each scenario is keyed by
its postcode, and each asserts the log path as well as
the outcome.

| Scenario        | Postcode                                 | What happens                                                                                                                                                                                     | Which layer answers | What the logs show                                                                                                            |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| (a) Local only  | **CM3 2JT** (Birkdale)                   | 30 filed sale addresses — a complete local list; suggestions and the picker serve from the filing; the fake Postio knows the street and is never asked                                           | Local               | `picker.list layer=local reason=local-complete local=30`; zero `postio.call` lines                                            |
| (b) Postio only | **KT17 1FH** (Minerva House)             | Nothing filed; Postio returns Flats 3–9 as separate delivery points; Flat 4's pick resolves from the warm list memory into a transient record                                                    | Postio              | `postio.call op=postcode reason=ok`; `picker.list layer=hybrid`; `transient.created`; `pick.resolved layer=postio via=memory` |
| (c) Fallback    | **CM1 6ER** (Beaulieu — the D72 witness) | Local empty; Postio scripted to fail in turn (error / timeout / zero-balance / empty). The list degrades silently; a pick lands on the whole-postcode check with `?notfound=pick` and the notice | Fallback            | `picker.list reason=postio-error`; `pick.resolved layer=fallback reason=postio-error` (or `-timeout`, `-zero-balance`)        |
| (d) Combination | **EX1 1AA** (fixture High Street)        | 2 homes filed locally; Postio returns those 2 plus 2 more — merged list of 4, deduped 2, local first. The pick of 3 High Street starts transient, then **promotes** to `3                        |                     | HIGH STREET` once its sale is filed (the cold load landing) and the record lapses                                             | Hybrid, then local | `picker.list layer=hybrid local=2 postio=4 deduped=2`; `transient.created`; (in production) `transient.promoted` |

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
- **EPC-derived pickable homes** — gated on written
  clearance (above).
- **The Postio backstop's go-live** still waits on the
  providers' written use-case confirmations (D72 item
  9). The code degrades safely without the key; the gate
  is about switching it on, not about building it.
