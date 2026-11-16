# Backend M6.30 — Air Quality Management Areas serve in the air section

Plan step M6.30 (decisions D50 and D59; prep
`~/workspace/scratch-m630/FINDINGS-HOLD.md`). The area
bundle's air section gains an `aqma` block at report
depth: whether the postcode point is inside a declared
Air Quality Management Area, the nearest declared area
within 2 miles (boundary distance), a filed-set "none"
when no area lies within 2 miles, or the named not-filed
state. The areas file into the existing `planning_layers`
table as `constraint_type='aqma'` — no migration. The
headline and the short bundle are unchanged by
construction and proven so by an identity test. This step
was drafted in an isolated copy under the D58 overlap
model (against main head d9887a6, post-M6.29); the pin
and census states below are the draft's, to be
re-verified at integration against the true tree.

## The first check

The prep's load-bearing premises were verified live
before any code was written:

- The service (Ricardo's ArcGIS MapServer for Defra
  UK-AIR, layer 0 "All pollutants") answered count **374**
  and service description "Published: 2026_10_20" —
  edition **2026-10-20**, exactly the prep's figures. No
  drift.
- The fixture cut was taken from the prep's full
  download: 72 features (England 62, Wales 5, Scotland 4,
  Northern Ireland 1) within 2.3 miles of the five golden
  postcodes, coordinates rounded to 6dp (1.6 MB). A
  second cut without Sutton AQMA (ref 1545) is the
  revocation witness.
- The goldens were re-verified against the fixture on
  the prep's stated basis (longitude-scaled plane,
  distances in miles): Birkdale none within 2 miles
  (nearest MDC AQMA No.1 at 4.301); Exeter inside
  "Newham AQMA (No. 2)"; Minerva nearest Sutton AQMA at
  0.929 (Kingston upon Thames AQMA second at 1.999 —
  inside the radius, but only the nearest serves);
  Cardiff nearest Cardiff City Centre AQMA at 0.883;
  Edinburgh EH1 1AA inside "AQMA No. 1 City Centre"
  (ref 69, Edinburgh City Council) — the Scottish inside
  witness the prep asked the build to pin.

## What was built

1. **The loader** (`loaders/load-aqma.mjs`, quarterly):
   pulls the layer (paged, resultOffset/resultRecordCount
   with exceededTransferLimit checked), keys each area on
   `AQMA_REF` and files name (TITLE), organisation
   (LOCAL_AUTH), detail (the declared pollutant codes,
   "; "-joined in register order — NO2, PM10, SO2,
   BENZENE), source_reference (the ref as text) and
   source_name "Defra UK-AIR — Air Quality Management
   Areas" into `planning_layers` as
   `constraint_type='aqma'`. The nation derives from the
   first letter of LA_ONS_ID (the prep's method; the
   file's own nation field is never trusted). The
   edition parses from the service description's
   "Published: YYYY_MM_DD" and fails loud when absent.
   Filing is a single-edition swap (stage → DELETE the
   aqma rows → INSERT SELECT → count checks → COMMIT),
   so a revoked area leaves the table — proven by the
   edition-B witness test.
2. **The fail-closed contract**: a filing is refused,
   keeping the last good copy, unless the total sits
   within ±10% of the 374 snapshot (337–411) AND the
   nation floors hold (England ≥200, Wales ≥10,
   Scotland ≥5, Northern Ireland ≥5) AND every feature
   passes its per-feature checks (TITLE and LOCAL_AUTH
   present, a flag present and in {0,1}, no duplicate
   AQMA_REF, geometry present, a recognised nation
   letter). The floors are deliberately loose — they
   catch feed truncation and shape change, not legitimate
   change; the snapshot is a tripwire to re-baseline
   consciously, never a ceiling on the real world.
3. **Registration** (`loaders/run-loaders.mjs`,
   `package.json`, `loaders/canary.mjs`): the schedule
   gains `load-aqma` at quarterly cadence with the
   established 30-minute timeout, friendly names for the
   loader and the `aqma` canary key, the fixture pass
   wired after built-up areas, and an `npm run
load:aqma` script. The canary probe reads the live
   count, the edition and a per-nation census: it warns
   (never fails) when the edition is more than ~200 days
   old, the count leaves the loader's band, or a nation
   is missing; it fails only when the service does not
   answer or the edition cannot be parsed.
4. **The served block** (`lib/area-bundle.ts`):
   `AirSection.aqma`, present always in both section
   arms — the AQMA facts are independent of the PCM
   square, so the block serves in the not-filed air state
   too. States: `inside` (the containing area's name,
   authority and pollutant words; when several areas
   cover the point only the first by covering order is
   named), `nearest` (the same plus boundary miles to
   2dp, within 2 miles), `none` (no area within 2 miles —
   the line names the complete filed set and its edition)
   and `not-filed` (the layer absent — the D30 two-part
   line). Every state carries the basis line (an AQMA is
   a council's declaration about its area — a designation,
   never a verdict on a home) and a source line carrying
   the dataset edition date; the file publishes no
   per-area dates, so the edition is the only date served
   (D59). Distances are boundary distances on the D22
   basis (straight-line miles, haversine R=3956), read
   through the same `layerFacts` geometry predicates as
   the planning layers — inside answers from ST_Covers,
   distance from the polygon boundary, never a centroid.
   One wording judgment, recorded: the inside line
   follows the prep's template "declared by {authority}"
   with the authority verbatim as filed (the prep's
   Exeter instance carried an extra "the" the template
   does not; an authority such as "Buckinghamshire"
   takes no "the", so the template governs).
5. **The cache** (`lib/bundle-cache.ts`):
   `BRAIN_DEPENDENCIES.area` gains `load-aqma` (a reload
   bumps the area version vector and busts stored
   entries); `GUARDS.area` gains `aqmaFiled`, the live
   count of `planning_layers` rows with
   `constraint_type='aqma'` — the priorityHabitats
   precedent — so a first filing busts a stored not-filed
   answer and a revocation-shrink busts a stored served
   one. The area version vector has no planning
   component, so `shapeOk` also gains the M6.25-pattern
   presence rule: the air section must carry its `aqma`
   key, or a pre-step entry would serve its missing key
   forever. A pre-step entry degrades to a recompute on
   first read; a current-shape entry serves from the
   cache, the not-filed state included.
6. **Census** (`tests/explainer-census.ts`): new row 86
   (this draft's next free number) `area.air.aqma`, hard,
   line-embedded at `sections.air.aqma` — one family for
   the block: the basis line discharges the inside and
   nearest states' figures, the none line's own line
   carries its filed count and edition, and the not-filed
   line names its own absence. The fail-closed walk gains
   the figure-path pattern for the block's numeric leaves
   (miles / filedCount → row 86) and a not-a-figure entry
   for the pollutant words (names, like pollutant labels
   elsewhere). Register in the draft: 86 families / 53
   hard.

## Goldens pinned

Asserted verbatim in the area suite against the loader's
own fixture filing, and in the loader suite against the
fixture itself: Birkdale — none within 2 miles (nearest
MDC AQMA No.1 at 4.301, outside the radius; the none
line names the filed set and its edition); Exeter —
inside "Newham AQMA (No. 2)", declared by London
Borough of Newham, pollutants nitrogen dioxide (NO2)
and particulate matter (PM10); Minerva — nearest Sutton
AQMA (London Borough of Sutton) at 0.93 miles on the
golden-check basis, with Kingston upon Thames AQMA
inside the radius but never served (nearest only);
Cardiff — nearest Cardiff City Centre AQMA at 0.88;
Edinburgh — inside "AQMA No. 1 City Centre". The
distance basis is proven, not assumed: synthetic annulus
and long-rectangle constructions in the loader suite
distinguish boundary distance from centroid distance in
both directions. The golden replay's area cell gains the
three core states on the fixture filing (filedCount 72;
Minerva's PostGIS miles asserted within the band around
the golden-check figure, to be locked exactly on first
CI proof).

## Contract pins and proofs

- **Pins**: exactly the eight expected area pins moved —
  area.flag-on-building, area.flag-on-no-match,
  area.flag-on-own-title, area.rung1-empty,
  area.rung1-rich, area.rung1-scotland, area.rung2,
  area.tribunal-served — each differing only by the
  added `sections.air.aqma` key (the not-filed form; the
  contracts fake files no AQMA layer). **No short pin
  moved**; no pin added or lost (48 total). A re-pin
  record comment rides in tests/bundle-contracts.test.ts.
- **Headline/short identity**: a test builds Exeter's
  area bundle with the block in its inside state and
  with it in its not-filed form and deep-equals the two
  short bundles; serialised scans find no "Air Quality
  Management Area", "AQMA" or "Newham AQMA" in the short
  bundle or the headline projection, whose air keys are
  exactly {headlineFigure, line, state}.
- **Wording**: the block's lines join the served-string
  banned-wording scans automatically; the prep's
  mechanical run had all drafted lines clean against the
  61-term union, and the suite's scans pass over the
  verbatim strings the golden tests pin.

## Gate

Draft state (D58): built and proven in the isolated copy
only — nothing pushed, no plan edit. Integration
re-verifies the pin set and the census row number
against the true tree, then the step takes the usual
gate (prepush, CI, practice ×3) in queue order.
