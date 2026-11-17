# M7.3 — Postcode search + address picker (the checker journey)

Status: built in the draft tree (`check-my-next-home-m73-draft`), gated
locally, NOT integrated. Integration is one finishing operation after the
founder orders the VPS — see the runbook at the end of this note. The main
tree and remote main (at M7.2, `06a823d`) are untouched; nothing was pushed
and no workflow file was edited.

## What was built

**The serve layer (ruling 1).** The app is no longer a static export:
`next.config.ts` drops `output: "export"` and the one Next codebase serves
pages plus API route handlers that call the frozen brains — nothing
re-implements a brain, and no brain file was modified (the 48 contract
pins stand). `lib/server/db.ts` holds the pg Pool (DATABASE_URL, K6);
`lib/server/serve.ts` turns typed input and route parameters back into
ladder resolutions and calls the D29 cached brain set plus the
sold-prices builder. `Dockerfile` + an `app` service in
`docker-compose.yml` run the same stack locally, in CI and on the server.

**Routes (fold-in 1)** — one family, kept out of `/check/…`:

| Route                                | Renders                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/resolve`                  | Verifies the Turnstile token first, then resolves and returns the destination URL (403 = robot-check block; 500 = whole-check failure) |
| `GET /api/check/nearby\|flood\|area` | The checking screen's brain calls; row states derived in `lib/journey.ts`                                                              |
| `/search` (bare)                     | The no-location fix route only (T-WEB-09)                                                                                              |
| `/search?postcode=…`                 | The picker / postcode-level state (narrowing rides as `street=` / `building=` and the brain re-decides the list)                       |
| `/search?outward=…`                  | The wider-area landing (rung 3), with `notfound=` naming a typed full postcode the directory does not hold                             |
| `/search/home?postcode=…&home=…`     | Checking → holding results; Scotland/NI render the not-covered page here                                                               |
| `/search/failed`                     | The whole-check failure state (D44(7))                                                                                                 |

The checking screen has no URL — it renders on the home form and is
replaced in place. A stale home key returns to that postcode's picker;
a refresh on a results URL re-derives the resolution and serves from
the D29 cache.

**The journey.** The M7.2 `PostcodeBox` is wired in place (the one
component every surface uses): submit → Turnstile token → `/api/resolve`
→ navigate. The box's label/hint are re-pinned verbatim for the wider
input (fold-in 7) — label "Postcode or address", hint "For example,
CM3 2JT — or the full address, with its postcode."; the button stays
"Check a home". Search scope is the brain's truth (ruling 2): a bare
street/place name lands on the no-location route asking for the
postcode. The picker is a reusable component (fold-in 3) — heading
names the narrowing, brain order, 44px rows, count line, no cap,
natural tab order, Back-from-checking retains the pick marked with
focus returned. The empty picker is one named state (fold-in 4). The
checking screen (fold-in 5) fires the three brain calls in parallel —
no simulated staggering — and advances only when all nine rows are
terminal (done / named-unavailable / named-failure); row 9's ownership
element states the ownership check is not part of this result while
the flag is off (fold-in 6). The holding results page (ruling 3)
renders the picked address + scope label in the header and no bundle
content; M7.4 replaces it wholesale. Scotland/NI skip the picker
(ruling 4) and render the not-covered page with each section's served
line. Turnstile failure or unavailability blocks with a friendly retry
(ruling 5) — the verify fails closed in every direction (missing
secret, missing token, rejected token, verify call down). The
whole-check failure state is built once in `WholeCheckFailure` for
M7.4 to reuse (fold-in 10).

**Seeding.** `scripts/seed-golden.mjs` files exactly what CI's
database job files plus exactly what the golden replay's setup files
on top — the corpus the brains are pinned against. `e2e/serve-e2e.mjs`
seeds (unless `E2E_SKIP_SEED=1`) and starts the app for Playwright;
`e2e/static-server.mjs` is retired.

## Founder test list (on the play server, after integration)

1. Type **CM3 2JT** → the Birkdale Rise address list → tap **19 Birkdale
   Rise** → the nine checks tick off → the page settles on "The check is
   complete" with **19 Birkdale Rise, CM3 2JT** at the top. (The full
   results page itself is M7.4 — this step ends at the holding page.)
2. Same for **E16 1GN** (6 Exeter Road) and **KT17 1FH** (Flat 4,
   Minerva House).
3. Type **E16** on its own → the wider-area page ("Wider area — E16,
   not this exact home") with the "Know the full postcode?" banner.
4. Type **EH1 1AD** → NO address list: straight to "EH1 1AD is in
   Scotland", each check carrying its own not-covered line.
   (Edinburgh's testable postcode is EH1 1AD — EH1 1AA left the
   directory in 1996, so a typed EH1 1AA lands on the EH1 wider-area
   page, the ladder's answer for any unheld postcode.)
5. Type **CM1 6ER** → "No addresses we can list for this postcode
   yet." → "See the check for the whole postcode" still runs the
   postcode-level check.
6. Type **Birkdale Rise** (no postcode) → "We couldn't place that" —
   the search asks for the postcode; a street name alone is never
   guessed at.
7. On a results page, use Back from the checking screen: the list
   returns with your pick marked and selected.
8. Refresh a finished check's page: it re-serves the same check.

## Deviations and judgement calls

1. **Edinburgh seeds as EH1 1AD, not EH1 1AA** (data-forced): EH1 1AA
   was terminated in ONSPD in December 1996; the postcodes loader skips
   terminated postcodes and it never enters the filed directory. The
   M6.19 replay made the same substitution (same data zone S01014710).
2. **The checking screen's advance beat**: rows complete the moment
   their answers arrive (no simulated progress anywhere); once every
   row is terminal the screen holds for ~800ms so the last row's end
   state is visible before the holding page replaces it. Recorded
   against the honesty rule, which targets simulated progress in the
   checks themselves.
3. **Box copy** (fold-in 7 left the words to the build): label
   "Postcode or address", hint "For example, CM3 2JT — or the full
   address, with its postcode." Pinned in `lib/home.ts` and
   `tests/home-page.test.ts`.
4. **Turnstile block presentation**: the blocking line renders through
   the kit field's error slot (announced, tied to the box) — it is the
   robot check that failed, never the postcode; the input is never
   marked invalid for what was typed.
5. **Beaulieu's crime** stays a genuine first-check load, as in
   production and the replay corpus (the fixture corpus holds no
   Beaulieu crime point): no E2E spec depends on it completing, and
   the seeded environment files no invented artefact for it.
6. **Cardiff's EPC** serves its named not-filed state in the fixture
   environment (no EPC token), exactly as in the replay.

## Gate (draft tree)

- `npm run prepush` — GREEN (format, lint with 0 errors, typecheck,
  build). Vitest: **1,619 passed / 26 skipped** (M7.2's 1,601 plus this
  step's 18 journey tests).
- Playwright, full suite against the served app + seeded corpus:
  **28 passed / 0 failed**, twice consecutively — Smoke 4 (the three
  golden-home journeys + the home-page smoke), Regression 24. The
  Smoke set is exactly the step's authored journey; nothing was
  promoted (D68 clause 7).

Local database note: this VM has no Docker, so the local gate ran
against the repo's PGlite rehearsal engine (PostgreSQL 18.6 + PostGIS
3.6.2 over the wire protocol) — the same engine the pre-push rehearsal
uses. What remains unproven until CI: the real PostGIS 17 service
under the browser job, and the Docker Compose stack itself (first run
is the server stand-up in the runbook).

## Local-gate seams (sandbox artifacts, all recorded)

7. **Flood-geometry loaders scoped out of the LOCAL seed only.** The
   runner pass wedged on `load-flood-zones` under the WASM engine
   (blocked 10 minutes at ~0% CPU — the known PGlite flood-wedge
   class). The local corpus was completed by filing the remaining
   loaders individually, skipping the six flood-geometry loaders;
   flood tables are therefore empty locally and the flood row
   completes on the brain's named states. The canonical
   `scripts/seed-golden.mjs` is unchanged and files everything;
   CI's real PostGIS is the full proof, as with every rehearsal
   scoping before it.
8. **Turnstile's two sandbox blocks.** This sandbox's egress cannot
   POST to siteverify (the call hangs) and its browser proxy refuses
   the widget tunnel (`ERR_TUNNEL_CONNECTION_FAILED`) — the app
   correctly blocked with the friendly line in both cases, which is
   ruling 5 working. For the local gate only: verification was
   pointed at a local stand-in via the server-config env
   `TURNSTILE_SITEVERIFY_URL` (the verify logic itself is pinned by
   unit tests with a mocked fetch), and the harness served a
   stand-in widget script under `E2E_TURNSTILE_STUB=1`
   (`e2e/fixtures.ts`; the blocked-check spec's own route overrides
   it). CI sets neither: GitHub's runners reach Cloudflare, the real
   widget runs and the published test keys verify for real.
9. **Pool serialisation locally.** The single-threaded engine
   intermittently dropped queries under the app's default pool
   concurrency (two first-hit throws, each green on retry, each
   landing on the journey's own named failure states). `PG_POOL_MAX`
   now sizes the pool where an environment says so (db.ts); the
   local gate ran with 1. Unset, pg's default stands — production
   is unchanged. A warm-up gate (`e2e/warm-gate.mjs`) exercises the
   heavy first builds before any spec runs, in every environment.
10. **The E2E build must carry the test site key.** NEXT_PUBLIC_
    values inline at build time; a build made without
    `NEXT_PUBLIC_TURNSTILE_SITE_KEY` produces a box that correctly
    refuses to search. The CI job sets it in the job env;
    `e2e/serve-e2e.mjs`'s header says so for local runs.

## Integration runbook

### 1. The founder's Hetzner order (M12.1, pulled forward)

In your own Hetzner account (the M0 account): **Create server →
Germany (Nuremberg or Falkenstein) → CX22 → add your login key (K3) →
switch on Hetzner's own backups (+20%)** — about £5/month starts from
the order. Check afterwards: the invoice shows ONE CX22 only, and you
can log in with the key and not with a password.

### 2. Ordered integration checklist

1. Founder orders the VPS (above). Nothing before this — the Pages
   play site stays on the verified M7.2 landing until step 6.
2. Push the draft tree to main (one grouped push; the draft's
   `ci.yml` is NOT pushed over the remote's — the remote workflow
   keeps its M7.1 browser job until step 3 replaces it).
3. Apply the CI browser job v2 (`~/workspace/scratch-m73/ci-browser-job-v2.yml`)
   through the GitHub web editor, replacing the whole `browser:` job;
   parent byte-checks the committed file (indentation counted
   programmatically, YAML parsed) before trusting it.
4. CI gate: all four jobs green, the browser job running the full
   Playwright suite against the seeded PostGIS service.
5. Server stand-up (M12.2, pulled forward): run the hardening recipe
   (key-only login, firewall — only the front door open, automatic
   security updates, Docker as non-admin), then `docker compose
--env-file .env.local up -d` brings up app + database. The real
   secret file (.env.local with K5's real keys, K6) is created ON the
   server — never through chat or GitHub. File the play server's
   data: the full loader suite as time allows; the minimum is
   `scripts/seed-golden.mjs` so the golden postcodes reproduce.
   Check (M12.2's own): from the internet only the website answers;
   the database port is silent.
6. Play-server switch: put the server address behind Cloudflare
   Access with the same "Only me" rule as the play site (M12.4's
   pattern — a private test address, password-locked like the play
   site, neither in Google). The founder's everyday QA home becomes
   the server address; the Pages play site stays frozen at M7.2 as
   the fallback and is retired at M12 go-live.
7. Play-server verification: the founder test list above, run
   against the server.
8. Tick M7.3 (97 of 160) in the plan.

## Addendum — 17 Nov 2026: the CI gate's Turnstile seams + one CI retry

The integration gate's first full run (CI #199 on the integrated
tree) passed checks, secrets and database (replay 26/26) and failed
the browser job 40/47 — all seven failures the identical shape: a
60-second waitForURL timeout after the postcode box was submitted,
and every failure snapshot in the run's Playwright artifact shows
the app displaying the block line ("The robot check couldn't run,
so your search hasn't been sent. Please try again."). Cloudflare's
real check failed to complete for 7 of ~17 submissions from
GitHub's datacenter runners (headless browser, datacenter IPs);
the app blocked each one exactly as ruling 5 designs. Item 8 above
("CI sets neither") is superseded by this addendum.

Founder ruling (17 Nov 2026): both remedies together.

1. **The harness seams are the default in every environment.**
   `playwright.config.ts` sets `E2E_TURNSTILE_STUB=1` (the
   fixtures stand-in widget) and `E2E_TURNSTILE_SEAMS=1` unless
   `E2E_REAL_TURNSTILE=1`; `e2e/serve-e2e.mjs` then runs the
   siteverify stand-in itself and points the app at it via
   `TURNSTILE_SITEVERIFY_URL`. The flow is unchanged — token
   requested, verified server-side, search blocked when no token
   arrives; only the third-party service is replaced, so the gate
   judges this code, not Cloudflare's treatment of a datacenter.
2. **One retry in CI** (`retries: process.env.CI ? 1 : 0`) as a
   safety net for runner noise. A test that passes only on retry
   reports as flaky — visible in the run, never silently green.

The real-path proof now lives where the network is
representative: the play server's founder test round (real K5
keys, a real browser), and real-path harness runs under
`E2E_REAL_TURNSTILE=1` — T-WEB-05's original form — which the
scheduled suite carries from M7.15.
