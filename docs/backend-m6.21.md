# Backend report — M6.21 missing layers filed and served (decision D41)

M6.21 filed and served the four layers earlier steps had
left unfiled, adopting the step's prep in full: brownfield
land as gated points, the ONS built-up areas as a polygon
layer, four more Historic England polygon datasets in the
heritage section, and the EPC register's suggested
improvement measures on the served certificate. Every
serving shape is one already proven — the listed buildings
points form, the green-belt polygon form, the monument
form, the per-certificate widening form — and no new
headline claim opened: the short bundle derives the two
new constraints sub-blocks under D28's rules, the heritage
layers take the scheduled monuments' place (full bundle
and headline projection, absent from the short skim), and
the measures are report depth by construction.

## What was built

1. **Brownfield** (`loaders/load-brownfield.mjs`,
   migration 0022, `lib/area-bundle.ts`): the unified
   national dataset from the planning.data.gov.uk files
   host (bulk CSV, OGL v3.0) files quarterly into
   `brownfield_sites` (points only — the register
   publishes no boundaries, and no served form claims
   anything about a home's plot) and `brownfield_publishers`
   (the supplier gate, filed in the same run from the
   same file). Ended rows are excluded and counted;
   current rows without a point are counted, never
   placed. Two dedupe rules, both newest-entry-kept and
   counted: republication (reference + organisation,
   entity fallback for an empty reference), then
   same-site collapse on (point to 4 decimal places,
   normalised site address) — the register records the
   same site twice, under two references from one
   council (Etwell House, "1" and "194") and under two
   organisations (45 Beckton Road, Newham and the GLA,
   points differing in the sixth decimal). Served per
   site: the address label, the distance, hectares, the
   register's own planning-permission status and the
   published minimum/maximum net dwellings, all exactly
   as published. The register's free-text notes are
   NEVER filed — the loader's contract check proves the
   column exists in the source file and nothing reads
   it further. The site-plan URL files; the brain's read
   port does not carry it, so it never serves. The
   source date is the platform retrieval date (the file
   carries no edition). Absence is gated on supply, the
   Article 4 pattern: "none found" (and the beyond line,
   which asserts the same absence) serves only for a
   council positively recorded in the gate; the brain's
   gate follows `article4Gate` exactly — it cannot yet
   answer true, because the gate is keyed by platform
   organisation entity and no filed table bridges the
   directory's council names to entities. That bridge
   is M12.10(b), the same filing job the Article 4 gate
   waits on; until it lands, production absences serve
   not-published, and the none-found branch is proven
   by unit tests against a gate that answers true.
2. **Built-up areas** (`loaders/load-built-up-areas.mjs`):
   the ONS Built Up Areas (December 2024) Boundaries EW
   BGG (V2) direct from the ONS ArcGIS service
   (FeatureServer `main_ONS_BUA_2024_EW_V2`, paged at
   its 2,000-record cap), filed as a static loader into
   `planning_layers` as type `built_up_area`, keyed by
   the ONS code (BUA24CD), named by BUA24NM. The
   platform's republished copy is England-only and an
   older edition — rejected at the prep, never read.
   The source date serves as the EDITION date
   (2024-12-01) in both modes: the edition is a
   property of the dataset, not of the retrieval.
   Attribution pinned from the ONS product itself:
   "Office for National Statistics — Built Up Areas
   (December 2024), licensed under the Open Government
   Licence v.3.0; contains OS data © Crown copyright
   and database right". Serving is the green-belt
   shape: inside names the filed polygon; England and
   Wales absences are proven nones; Scotland and
   Northern Ireland serve the coverage state.
3. **Heritage** (`loaders/load-heritage.mjs` extended):
   four datasets through the existing polygon path into
   `planning_layers` — world-heritage-site,
   battlefield, protected-wreck-site and
   world-heritage-site-buffer-zone, the buffer zone as
   its own layer with its own served line (a home
   inside a buffer zone but outside the site is a
   distinct fact, and the two inside lines say
   different things). Quarterly cadence unchanged; the
   heritage stamp already rides the area vector.
4. **EPC measures** (`loaders/load-epc.mjs` widened,
   `lib/epc-improvements.ts`, the brain's EPC serving):
   `minimise()` now files `suggested_improvements` per
   measure — sequence, type code, improvement number,
   category (filed, never served: its group labels
   differ across schema vintages), the typical saving
   GBP-guarded exactly as the cost fields are (a
   non-GBP saving files null, never a converted
   figure), the indicative cost string exactly as
   published, and both cumulative ratings. The measure
   names resolve in the brain from
   `lib/epc-improvements.ts`: the union of the register
   schemas' published improvement lists (RdSAP-Schema-
   21.0.1's 60 entries + SAP-Schema-19.2.0's 50, 65
   numbers in the union), transcribed from the
   register's own schema repository
   (communitiesuk/epb-data-warehouse,
   ExternalDefinitions.xml in both schemas) with the
   source cited in the module. An unknown number serves
   its figures with NO name line — a bare code or an
   invented name never reaches a reader — and the
   loader test fails loud if any fixture-corpus number
   stops resolving. Serving is report depth, rung 1
   only (the block lives on a served certificate, which
   exists only at rung 1, and the headline projection
   never picks it), in register sequence, under the
   block line naming them "the certificate's suggested
   improvements" — the register's modelled facts, never
   advice. Savings are never summed; the closing line
   carries only the final step's cumulative ratings.
5. **Cache and contracts** (`lib/bundle-cache.ts`,
   `lib/short-bundle.ts`): the area vector gains both
   new loaders' stamps plus a filed-count guard for
   `brownfield_sites` (its npm entry point bypasses the
   runner, the tribunal pattern); heritage rides its
   stamp; measures ride the EPC artefact's content
   hash. The shape contract gains presence checks for
   constraints.brownfield, constraints.builtUpArea,
   the four heritage sub-blocks and every served
   certificate's improvements key — a pre-step entry
   degrades to a recompute. The M6.19 contract freeze
   was deliberately re-pinned (eleven pins; recorded in
   tests/bundle-contracts.test.ts and the golden
   matrix). The explainer census gained rows 72–75
   (75 families, 43 hard): the improvements row is
   hard, its figures carried inside each step's own
   line; the brownfield, built-up-area and heritage
   rows are self with their lines embedded, on the
   listed-count precedent.

## Goldens pinned

- **Brownfield** (live file at capture, 16 Nov 2026:
  40,229 rows, 32,352 current, 306 supplying
  organisations; fixture cut 520 rows / 464 current /
  56 ended, filing 334 sites from 16 organisations):
  Birkdale **2** within 2 miles, nearest Universal
  Garage, The Street, Hatfield Peverel, **0.252 mi**,
  permissioned, 0.22 ha, 9/9 dwellings. Exeter **97**,
  nearest 45 Beckton Road (below). Minerva **30**,
  nearest Etwell House and former coach, Station
  Approach, **0.227 mi**, not-permissioned, 0.19 ha,
  10/10. Live goldens assert as floors (the platform
  re-collects); the fixture asserts exactly, in the
  loader, in tests/load-brownfield.test.ts (an
  independent re-derivation from the raw rows) and in
  the golden replay through PostGIS.
- **Built-up areas**: Birkdale inside **Hatfield
  Peverel** (E63011486), Exeter inside **Newham**
  (E63012003), Minerva inside **Ewell** (E63012408),
  the Bath witness inside **Bath** (E63012364) — pinned
  from the filed polygons in the loader, in
  tests/load-built-up-areas.test.ts (an independent
  point-in-polygon) and in the golden replay.
- **Heritage**: post-exclusion filed counts from the
  live files — world heritage sites **19**,
  battlefields **47**, protected wrecks **57**, buffer
  zones **9**. All three homes serve the absence lines
  for all four layers; the Bath witness point falls
  inside the City of Bath world heritage site
  (1000103).
- **EPC measures**: Birkdale exactly 2 steps — step 1,
  improvement 19 (Solar water heating), saving £34,
  cost "£4,000 - £6,000", ratings after 86/87; step 2,
  improvement 34 (Solar photovoltaic panels, 2.5 kWp),
  saving £383, cost "£3,500 - £5,500", ratings after
  93/94; closing line carries 93/94 only. Exeter's two
  certificates and Minerva Flat 4's publish no
  measures — the named no-measures state. The Birkdale
  sample report's "save about £34 a year" line remains
  barred as a golden: £34 is step 1 alone.

## Divergences from the prep, and how they were settled

1. **Exeter's brownfield nearest is not the prep's.**
   The prep's entity-API sampling named 117–125
   Freemasons Road nearest at ~0.27 mi, permissioned,
   with 101–103 Hermit Road second at ~0.39. The filed
   bulk data — the build's source of truth — puts **45
   Beckton Road at 0.163 mi** (permissioned) first: its
   rows carry 2018/2021 entry-dates and were missed by
   the sampling. Freemasons Road is second at **0.267
   mi** with status **pending-decision** (not
   permissioned), and Hermit Road is 0.570 mi. The
   goldens pin the filed data.
2. **The heritage files double their sites.** Every
   world heritage site and battlefield appears twice in
   its published file — a geometry row and a nameless,
   geometry-less stub entity sharing the reference
   (38 current world-heritage rows = 19 sites + 19
   stubs). The polygon path counts the stubs
   geometry-less and dedupe keeps the geometry rows,
   so the filed counts are the site counts (19 / 47).
3. **Only 9 buffer zones exist.** The buffer-zone
   dataset publishes nine zones nationally; Bath —
   the natural positive witness — has none, so the
   buffer layer's positive case is proven by unit test
   (a synthetic covering) and its absence at Bath is a
   publication fact. The Maritime Greenwich buffer edge
   is ~2.26 mi from the Exeter home, outside the
   2-mile radius, so no golden home can witness it.
4. **The published name list supersedes the prep's
   wording.** The prep named improvement 58 "Solid
   floor insulation"; the register's published list
   says "Floor insulation (solid floor)". The
   transcription follows the published list throughout
   (the two schema vintages conflict only at numbers 8
   and 45, where the union holds the newer RdSAP-21
   wording; every fixture-corpus number reads
   identically across vintages 16.2–21.x).

## Sandbox items closed at first contact

The four items the prep could not verify from the
sandbox are closed, each from the live source on
16 Nov 2026: the brownfield bulk CSV's header row (31
columns, `notes` and `site-plan-url` among them — the
contract the loader now checks); the December 2024
built-up-area feature count (**7,775**, read from the
FeatureServer, whose layer supports no query endpoint
on the MapServer view — the loader pages the
FeatureServer layer); the exact post-exclusion
heritage counts (19 / 47 / 57 / 9, above); and the ONS
attribution wording (pinned from the service's own
licenseInfo and product description, above).

## Named follow-ups (not built here)

- **Canary probes** for the four new heritage datasets,
  the brownfield file and the BUA service were NOT
  added to the monthly canary at this step; the
  loaders' own golden checks and sanity bands are the
  drift defence until a canary step extends its probe
  set.
- **Production first fills** ride the runner schedule
  from the VPS at M12 (brownfield quarterly, built-up
  areas static, heritage quarterly, EPC monthly — the
  widened EPC filing reaches a postcode on its next
  scheduled or cold load; until then its certificates
  serve with no improvements block, the pre-widening
  form).
- **The gate bridge** (M12.10(b)) is the one filing
  that turns both the Article 4 and brownfield gates
  live; nothing at this step pre-empts it.

## Gate

- `npm run prepush` fully green before the push:
  format, lint (4 pre-existing warnings, none new),
  typecheck, **1,172 tests passed / 14 skipped** (the
  golden replay's 14 run in CI's database job), build.
- Scoped local rehearsal (PGlite, 16 Nov 2026):
  migrations applied twice (the second a no-op —
  migration 0022 proven), every direct fixture step
  PASS, and the runner fixture pass filed the extended
  heritage loader (all four new layers, goldens OK),
  load-brownfield (334 sites, gate 16 organisations,
  goldens OK) and load-built-up-areas (7 areas, the
  homes inside Hatfield Peverel, Newham and Ewell)
  against the local PostGIS before the pass reached
  the flood loaders, where the documented WASM engine
  limitation stalls it — the rehearsal was stopped
  there deliberately; the flood steps are untouched by
  this step and remain CI-proven.
- CI: the run for this push is read by the parent from
  the Actions page, as at every prior step.
