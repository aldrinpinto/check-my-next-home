# Backend M6.31 — Charging zones serve as their own area section

Plan step M6.31 (decisions D50, D61 and D63; prep
`~/workspace/scratch-m631/FINDINGS-HOLD.md`). The area
bundle gains a seventeenth, top-level section,
`chargingZones`, at report depth: whether the postcode
point is inside a charging zone (a Clean Air Zone, the
London Ultra Low Emission Zone, or a Scottish Low
Emission Zone), outside every zone in force, or
not-covered. The boundaries file into a dedicated table,
`charging_zones` (migration 0026) — not `planning_layers`:
a scheme's identity is a register entry (operator,
vehicle class, charging-start date, vehicle-checker
landing), and the completeness gate is a property of the
whole filed set. The section is its own section, not part
of the air section, on the prep's reasoning: its
not-covered state must be able to serve while the air
section serves normally and vice versa, and a charging
zone is never dressed as an air measurement. The headline
and the short bundle are unchanged by construction and
proven so by identity tests. This step was drafted in an
isolated copy under the D58 overlap model; the copy was
taken from the main tree with M6.30's integration already
in it (head d9887a6 plus M6.30's port), so the hunks below
are written against the post-M6.30 tree — the pin and
census states are the draft's, to be re-verified at
integration against the true tree.

## The first check

The prep's load-bearing premises were re-verified live
before any code was written (16 Nov 2026):

- **All eleven boundary endpoints answered** and the
  downloads match the prep's evidence byte-for-byte in
  size. Measured areas (EPSG:27700, of the unioned
  boundaries) agree with the prep: Birmingham 7.657 km2,
  Bradford 21.985, Bristol 3.258, Glasgow 3.062,
  Edinburgh 3.036 (three features), Dundee 0.459,
  Aberdeen 0.857, ULEZ 1,528.357 (22 features; the file's
  coordinates are EPSG:27700 despite its label, as the
  prep established). Bath measures 3.203 km2, Sheffield
  2.371 and Tyneside 2.294 — the three figures the prep
  left for the build to measure. These eleven figures
  are the loader's pinned reference areas.
- **Bristol files from the council's production layer**
  (layer 61), whose feature carries STATUS "In force" —
  confirmed on the live download.
- **Aberdeen's identity is confirmed**: the ArcGIS layer
  itself carries copyrightText "Will Hekelaar, Aberdeen
  City Council", and its geometry is Aberdeen city centre
  at the prep's measured area. The service carries no
  licence text; its terms note records exactly that.
- **Edinburgh's item licence** is pinned in full: "This
  information is supplied under the Open Government
  License v3.0" (the prep had captured the opening only).
  Its three features are all still named "Proposed Low
  Emission Zone"; the geometry is the in-force zone.
- **The eleven filed polygons are pairwise disjoint**
  (no positive-area overlap), and the goldens hold on the
  live geometry: Exeter inside the ULEZ only; EH1 1AA and
  EH1 1AD (the replay witness) inside the Edinburgh LEZ
  only; Birkdale, Minerva and Cardiff inside nothing.
  Minerva's distance to the ULEZ boundary measures 2,192 m
  = **1.362 miles** — recorded here, and never served:
  the section has no nearest state, by design.
- **GOV.UK's guidance** ("Driving in a clean air zone")
  still lists exactly seven CAZs with the register's
  classes (Bath C, Birmingham D, Bradford C, Bristol D,
  Portsmouth B, Sheffield C, Tyneside C) and the class
  table verbatim; **lowemissionzones.scot** still states
  four LEZs, the Penalty Charge Notice model and "You
  cannot prepay to avoid a fine". The TfL checker landing
  is pinned from GOV.UK's own outlink:
  `https://tfl.gov.uk/modes/driving/check-your-vehicle/`
  (TfL refuses this sandbox's fetches with a 403, as the
  prep recorded; the URL is the address GOV.UK sends
  London drivers to).

## What was built

1. **The table** (migration 0026): `charging_zones`, one
   row per scheme keyed on `scheme_key`, holding the
   register facts (name, family, class, operator,
   in_force_date, checker_url), the boundary as a single
   MultiPolygon (unioned, made valid at filing), and the
   provenance (source_name, source_date, terms_note,
   loaded_at). Charging amounts are never filed — no
   column can hold one (D50). `source_date` files null for
   every scheme at this build: no source states a clean
   edition date for its boundary itself (Bath states a
   month — April 2024 — and Bristol a local-time version
   stamp; both ride in their terms notes instead of an
   invented day).
2. **The loader** (`loaders/load-charging-zones.mjs`,
   quarterly): a twelve-scheme register; eleven schemes
   file, each from its operator's own published boundary
   (nine ArcGIS query endpoints requested in EPSG:4326,
   the Bath hub GeoJSON, and the London Datastore ULEZ
   file, whose EPSG:27700 coordinates are detected on the
   data — never on the file's CRS label — and transformed
   with the loaders' proj4 basis). Portsmouth's entry
   carries `source: null`: the pending scheme (D63). Its
   register facts (Class B, 29 Nov 2021) are recorded for
   the day it files; the run reports it pending and files
   the eleven. Per-scheme contracts: at least one feature,
   no error envelope, no truncated response, usable
   geometry — and for Bristol, STATUS "In force" on every
   feature, the assertion that refuses the WECA hosted
   copy (STATUS "Proposed"; the fixture
   `bristol-weca.geojson` is its test input) forever.
3. **The filing** is one transaction over the whole set:
   stage every scheme (geometry through
   ST_MakeValid + polygon extraction), validate the staged
   rows (validity; measured area within ±25% of the pinned
   reference, naming the scheme), assert pairwise
   disjointness over the staged set (interiors
   intersecting refuses the filing; a shared edge or point
   is a touch, not an overlap), then delete-all +
   insert-all + count check + COMMIT. A failed run files
   nothing and the last good set keeps serving; the swap
   means the set's stamps share one instant.
4. **Registration** (`loaders/run-loaders.mjs`,
   `package.json`, `loaders/canary.mjs`): the schedule
   gains `load-charging-zones` at quarterly cadence with
   the established 30-minute timeout, friendly names for
   the loader and the two canary keys, the fixture pass
   wired after `load-aqma`, a shortDetail case ("11
   charging-zone schemes filed"), and an
   `npm run load:charging-zones` script. Two register
   canaries in the established pattern: `govuk-caz` reads
   GOV.UK's cities table and `scotland-lez` reads
   lowemissionzones.scot's count sentence and city names;
   both WARN (never fail) when a scheme appears or
   vanishes, and fail only when the page does not answer
   or its shape is gone.
5. **The served section** (`lib/area-bundle.ts`, a
   self-contained block: facts types beside `AqmaFacts`,
   the builder beside `buildAir`, plus four wiring points
   — the `chargingZonesFacts` port method, the
   `AreaSections` key, the rung-3 reason, the
   `createAreaSource` read): states `inside` (the covering
   scheme's name, operator, class line composed from
   GOV.UK's class vehicle lists verbatim, the cars line
   for classes A/B/C only, the date line — "Charges in
   this zone began on …", for the ULEZ "Charges in this
   zone, at this boundary, began on 29 August 2023.", for
   an LEZ "Penalties in this zone began on …" with the
   penalty-model class line — and the family checker
   landing with its label), `outside` in two forms, and
   `not-covered`. Every filed state carries the D13 basis
   line (what a charging zone is; the vehicle, not the
   home; the date is the date charges or penalties began).
   The **completeness gate** is computed in the builder at
   answer time from the filed set: the full outside line —
   "not inside any Clean Air Zone, the London Ultra Low
   Emission Zone, or any Scottish Low Emission Zone in
   force on {set date}", the set date being the set's
   oldest loaded_at date — serves ONLY when all twelve
   register schemes are filed AND that date is no more
   than 120 days old. While the set is incomplete, the
   outside answer is the named-gap line (the exact wording
   is pinned in the serving tests and flagged for
   integration confirmation): "This postcode point is not
   inside any charging zone whose boundary is published.
   The Portsmouth Clean Air Zone is in force, but its
   boundary is not published, so it cannot be checked
   here." A complete-but-stale set serves `not-covered`
   ("…the charging zone data on file is out of date…"),
   and an empty table serves the D30 two-part line. The
   brain's register (keys + names) is pinned against the
   loader's by the step's tests, field for field. One
   recorded judgment: the section is a sibling of `air`,
   not a block inside it — the brief's "air section"
   phrasing yields to the prep's served shape (section 6),
   which is the design authority.
6. **The cache** (`lib/bundle-cache.ts`):
   `BRAIN_DEPENDENCIES.area` gains `load-charging-zones`;
   `GUARDS.area` gains `chargingZonesFiled` (the live
   count) and `chargingZonesGate` (the gate's own value,
   computed at guard time — all 12 filed and the oldest
   filing within 120 days — because the gate can flip on
   the passage of time alone, with no filing); `shapeOk`
   gains the M6.25-pattern presence rule for the
   `chargingZones` key. A pre-step entry degrades to a
   recompute; a cached full outside line never survives
   the day the set goes stale, and a cached named-gap line
   never survives the filing that completes the set.
7. **Census** (`tests/explainer-census.ts`): new row 87
   (draft state — M6.30's row 86 lands first)
   `area.charging-zones`, hard, line-embedded at
   `sections.chargingZones`: the basis line discharges the
   family's figures. The fail-closed walk gains the
   figure-path pattern for the section's numeric leaves
   (filedCount / setDate → row 87) and a not-a-figure entry
   for the scheme's register facts (class, family,
   operator, checker URL and label — classification
   identifiers, a name, and an address; the scheme's dates
   serve only inside its date line). Register in the
   draft: 87 families / 54 hard.

## Goldens pinned

Exeter E16 1GN — inside the London ULEZ (date line 29
August 2023, "at this boundary"). Edinburgh EH1 1AA —
inside the Edinburgh LEZ (penalties from 1 June 2024);
the replay witness is EH1 1AD, verified inside the same
boundary. Minerva KT17 1FH and Birkdale CM3 2JT — outside
every filed zone, serving the named-gap line while
Portsmouth is unfiled (Minerva's 1.362-mile distance to
the ULEZ boundary is recorded above and asserted NOWHERE
in any served shape). Cardiff CF11 8AA — outside, named-gap
form. Every filed scheme also carries a synthetic inside
witness (a point on its own boundary's surface) in the
loader suite, proving each scheme's inside state
individually. The golden replay's area cell gains the
charging-zones states on the fixture filing (Exeter
inside ULEZ, Edinburgh inside LEZ, Birkdale/Minerva/
Cardiff outside in named-gap form, filedCount 11).

## Contract pins and proofs

- **Pins**: exactly nine area pins moved —
  area.flag-on-building, area.flag-on-no-match,
  area.flag-on-own-title, area.rung1-empty,
  area.rung1-rich, area.rung1-scotland, area.rung2,
  area.tribunal-served (each differing by exactly the
  added `sections.chargingZones` key in its not-covered
  form; the contracts fake files no charging zones) PLUS
  area.rung3, whose sections record gains the section's
  named-state stub ("charging zones need an exact
  postcode"). The rung-3 pin did not move at M6.29/M6.30
  because those blocks live inside the air section, whose
  rung-3 stub carries no body; a top-level section's stub
  is the record itself. **No short pin moved**; no pin
  added or lost (48 total). Verified leaf-by-leaf against
  the pre-step shapes before the re-pin was written. A
  re-pin record comment rides in
  tests/bundle-contracts.test.ts, marked draft state.
- **Headline/short identity**: the short suite builds
  Exeter's bundles with the section inside the ULEZ and
  with it in its not-covered form and deep-equals the two
  short bundles; serialised scans find no "Charging
  zones", "Ultra Low Emission Zone" or "ULEZ" in the
  short bundle or the headline projection, which carries
  no chargingZones key. The serving suite proves the same
  identity at the projection level directly.
- **Wording**: the section's lines are scanned in the
  serving suite against the shared banned-wording union
  with the filed scheme names stripped first — the scan
  proves "clean air" survives only inside zone names (the
  outside line's family names are stripped as names too).
  The model words never cross: CAZ/ULEZ lines carry no
  "penalty"; LEZ lines carry the penalty model and never
  present a charge to enter. No served string contains a
  charging amount or a £ sign (D50).
- **State matrix**: the rung-3 counts move 15 → 16 base
  reasons (17 with the company flag on), updated in
  tests/state-matrix.test.ts and tests/area-bundle.test.ts
  with the chargingZones reason asserted verbatim.

## Gate

Draft state (D58): built and proven in the isolated copy
only — nothing pushed, no plan edit. Integration
re-verifies the pin set and the census row number against
the true tree, confirms the named-gap line's wording,
then the step takes the usual gate (prepush, CI, practice
×3) in queue order. First filings for any scheme that
arrives later — Portsmouth's boundary above all — join
M12.10(h); when a file arrives, filing is a routine load
and the gate opens automatically (D63).
