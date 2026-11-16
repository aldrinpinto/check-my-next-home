# Backend report — M6.22 live flood warnings + school deadlines (decision D42)

M6.22 adds the product's one live element and one
statutory line, adopting the step's prep in full as D42.
Flood warnings are fetched from the Environment Agency's
flood-monitoring API at serve time and composed into the
flood bundle — never filed, never stored in the bundle
cache, never memoised — and the nearby bundle's schools
answer gains the national application deadlines. No
loader, no migration, no cache-shape change for stored
bundles: the stored form of a flood entry is the filed
answer with the live block stripped to null, and the
block is recomposed on every serve through the cache's
onServe hook, the crime stale-line pattern (D29).

## What was built

1. **Live flood warnings** (`lib/flood.ts`,
   `lib/bundle-cache.ts`, `lib/short-bundle.ts`). The
   flood bundle's served form gains a `liveWarnings`
   block ahead of the filed layers: the warnings in
   force (severity, the EA's area description, river or
   sea names, the EA's message, the raised stamp), the
   named empty states, the OGL attribution and the link
   to the official Check for flooding service. The
   warning source is a port with one real implementation
   — a single GET to `/id/floods` with the documented
   lat/long geo-filter (`dist=3.22`, `min-severity=3`),
   an AbortController enforcing the 2,000 ms limit, one
   attempt — and the composer never throws: any failure
   (network, timeout, non-200, malformed body) degrades
   to the failure line over the intact filed answer.
   Severity levels 1–3 only serve; level 4 (warnings no
   longer in force) never does. The query passes
   min-severity=3, but the 1–3 filter is also applied
   client-side — it is never delegated to the API. Order is
   severity, then earliest raised; the block caps at
   five warnings with a named overflow line. Composition
   happens only for the served England state at rungs
   1–2 with a warning source present: the not-covered
   and rung 3/4 forms never fetch, and the plain builder
   without a source serves the block as null, so every
   pre-step caller and fixture keeps its shape.
   `createCachedBrains` wires the real source into every
   cached flood build. In the cache, `serveCached`'s
   onServe hook is generalised to allow an asynchronous
   recomposition (crime's synchronous stale-line hook is
   unaffected); the stored flood entry strips the block
   to null, the stored-shape check requires the key's
   presence (a pre-M6.22 entry degrades to a recompute,
   the established pattern), and tests prove a warning
   raised after caching serves on the next read and a
   lapsed one disappears, the stored entry
   byte-identical throughout — nothing about the live
   feed is ever written. The short bundle projects the
   block ahead of the layer skim with severity, area,
   raised line, attribution and link — and no message
   field by construction; the EA's text is report depth
   only.
2. **School deadlines** (`lib/nearby.ts`). The nearby
   bundle's distances form gains `schoolDeadlines`: for
   England, the one national line naming 31 October
   (secondary) and 15 January (primary) as the School
   Admissions Code's national closing dates, with the
   supplementary-form caveat; for Wales, the named line
   pointing to the council's own admissions pages; for
   Scotland, Northern Ireland and an unreadable area
   code, nothing (null) — the failure direction is
   always away from serving the English dates. The
   nation is read from the filed LSOA code's first
   letter, the flood brain's precedent. The dates are
   constants with the Code cited in code. The same
   served line is what the report's closing notes will
   carry at M8; only the served shape is built here.
3. **Contracts and census.** The frozen shapes were
   re-pinned deliberately under D42 (the record is in
   tests/bundle-contracts.test.ts): the served flood
   and short flood shapes gained `liveWarnings`, the
   nearby distances shape gained `schoolDeadlines`, and
   two composed pins were added (flood.served-warnings,
   short.flood-warnings). Seven pins moved, two were
   added, nothing else. The explainer census gained
   rows 76–78 (78 families, 46 hard): the severity
   level and the overflow count registered hard at both
   depths, their basis the warning's own line carrying
   the EA's label and area name under the attribution;
   the deadline dates hard, their basis line the line
   itself, which names the Code beside the dates. The
   checked-at and raised stamps and the EA's quoted
   fields (severity label, area, river names, message)
   are allowlisted as dates and publisher wording.

## Goldens pinned

- **The captured pair** (the national list held exactly
  two live items at first contact, both level 3):
  River Leadon catchment (031WAF213, raised
  2026-11-15T16:35:59) and The tidal Rivers Bure, Ant
  and Thurne (054WATBT1, raised 2026-11-15T09:00:34),
  captured verbatim from geo-filtered responses into
  tests/fixtures/flood-warnings/ and replayed through a
  fake source in the flood suite, the cache suite, the
  short-bundle suite, the state matrix, the contracts
  and the golden replay's new cell. Composed order:
  Bure before Leadon (same severity, earlier raised).
- **The named states**: "No flood warning in force for
  this area — checked at 06:54 on 16 November 2026" at
  the fixture instant (a BST instant renders in BST);
  "Live flood warnings could not be checked just now"
  on any failure. At headline depth the no-warning line
  does not travel; the failure line does.
- **The deadline lines**, verbatim in the golden matrix
  and asserted at Birkdale (England), Cardiff (Wales)
  and Edinburgh (nothing) in the replay.

## First contact — the dist parameter, closed

The prep's one unverified point. The EA reference
documentation's parameter table states dist is in
**kilometres, measured to the flood area** ("warnings
applying to flood areas which are within r km of the
given latitude/longitude"), possibly approximated by a
bounding box. Proven live: a point inside the River
Leadon area matched at dist 0; a point ~14.9 km east of
the area envelope's east edge matched nothing at dist 6
or 14 and the warning at 16, 20 and 25 — the envelope
distance, not the centroid's (~24 km). The chosen value
is **3.22 km**, the product's 2-mile proximity radius
(D22); served wording attributes every warning to the
EA's named area regardless. Also verified live:
min-severity=3 returns severity levels ≤ 3; the
documented level-4 label is "Warning no longer in
force"; the attribution sentence is the API
documentation's own ("this uses Environment Agency
flood and river level data from the real-time data API
(Beta)").

One operational observation: the sandbox-to-EA network
was flaky during the step (several connection failures,
and one geo-filtered response measured at 2.36 s —
above the 2-second budget). The budget stands as D42
set it; the named failure line is the designed
degradation, and the production timing from the VPS is
an M12 confirmation, as with the other live timings.

## Divergences from the prep, and how they were settled

- **The no-warning line at headline depth.** D42's
  "shows first in the short headline, never truncated"
  governs a live warning. For the empty states the prep
  pinned both named lines without splitting depths; as
  built, the no-warning line stays at report depth (the
  headline block names its state and stamp only) while
  the failure line travels — a silent headline on a
  failed check would read as "no warning", and a
  checked-at line on every headline would date-stamp
  the whole short bundle. Recorded here and in the
  golden matrix.
- **Timestamp rendering.** The EA's `dateTime` values
  are naive Europe/London wall times; the raised line
  is rendered from the timestamp's own components,
  never through a Date, so no conversion can shift it.
  The checked-at stamp is the one true instant,
  formatted in Europe/London (GMT/BST proven by test).
- **The annual ops check.** The prep asked for the
  dates to be wired into the existing annual ops check
  "if the mechanism allows": there is no code mechanism
  — the check is a row in the plan's ops table, and the
  constants' code comment names it as the thing that
  keeps them current. Stated plainly, as the prep
  required either way.

## Named follow-ups (not built here)

- **Phase 2** carries the same live block onto the
  extension's flood surface; the carry-over is recorded
  in the plan at M6.23's sweep (audit item B2).
- **The report's closing notes** render the deadline
  line at M8 from this served shape; nothing renders
  yet.
- **Production timings** for the 2-second budget from
  the VPS join the M12 timing confirmations. The live
  feed is not a filed dataset, so no loader schedule
  and no canary probe apply; the serve-time failure
  line is the monitor.

## Gate

- `npm run prepush` fully green before the push:
  format, lint, typecheck, **1,206 tests passed / 15
  skipped** locally (the golden replay's 15, including
  the new M6.22 cell, run in CI's database job), build.
- No loader or migration changes — no local rehearsal
  applies; the replay's flood cell is CI-only by the
  standing wedge rule, as at every prior step.
- CI: the run for this push is read by the parent from
  the Actions page, as at every prior step.
