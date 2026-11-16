# Backend M6.28 — climate outlook serves in the flood answer

Plan step M6.28 (decisions D49 and D55; prep
`~/workspace/scratch-m628/FINDINGS-HOLD.md`). The flood answer
gains a second sibling block: the Environment Agency's two
Climate Change 1 scenario likelihoods — Risk of Flooding from
Rivers and Sea – Climate Change 1 and Risk of Flooding from
Surface Water – Climate Change 1 — served as the point state
only, each source's scenario basis named every time in its
own epochs, never set against the present-day answer. Report
depth only; the short bundle is proven free of it. The loader
half was drafted in an isolated copy against M6.27's in-flight
tree and integrated onto the landed tree at this step; the
brain half was built here.

## The first check

The prep's load-bearing claims were verified live at the
draft and held: the OGC route serves both products from the
DSP (the CKAN package route 404s, measured); RoFRS CC1 is
collection `rofrs_cc01_4band`, 252,932 features, edition
2026-11-03 read from the WMS dated layer; RoFSW CC1 is
collection `rofsw_cc01`, 406,734 features, edition 2026-11-10.
The scenario bands and thresholds are identical to the
present-day products, so the pinned band-definition table
applies unchanged; the RoFRS CC vocabulary is {High, Medium,
Low, Very low} in the features' own casing; the RoFSW CC
vocabulary is {High, Medium, Low} and its features carry no
`confidence` field (the schema is the present-day collection's
minus confidence). The integration re-diffed every shared
file against the landed M6.27 tree: exactly one divergence —
M6.27's landed canary freshness early-return, which the draft
had already replaced with a warnings-array merge; the merge
keeps the three existing products' output strings
byte-identical when only the freshness warning fires
(verified by construction and by the canary suites).

## What was built

1. **Migration 0025** — `flood_climate_layers`, column for
   column a mirror of `flood_layers` (layer_type, risk_label,
   detail, geom, source_name, source_date), so no scenario
   shape can ever be read as a present-day fact and the
   present-day guard's meaning is untouched. Schema doc entry
   36.
2. **Loaders** `load-flood-rivers-sea-climate.mjs` and
   `load-flood-surface-water-climate.mjs` — cloned from their
   present-day parents onto the OGC paged read, the staged
   single-edition swap, the ±10% sanity band and the
   fail-closed vocabulary contract, filing into
   `flood_climate_layers` under layer types `rofrs_cc` /
   `rofsw_cc`. Rivers & sea pages at 250 (smaller pages
   desync this collection's `numberMatched`); surface water
   at 100 (page 1,000 times out). Both quarterly on the
   runner (30-minute timeouts), with canary probes: the
   rivers & sea probe rides the shared flood-product probe
   (Exeter Low anchor, exactly-one-edition, unexpected
   collections warn-only); the surface water probe is bespoke
   — its Exeter fact is presence, not a band, and its
   positive anchor is Minerva Low.
3. **Brain** (`lib/flood.ts`) — the served flood state gains
   `climate`: heading, the fence line (one published
   scenario — not a forecast, and not a prediction about any
   home), the EA caveat line (likelihood is hard to predict,
   especially further into the future; the modelled
   likelihood could turn out bigger or smaller; the models
   cannot say when within the period), and the two sources,
   rivers & sea then surface water. Per source: title,
   scenarioLine, pointState (`inside` / `no-band-published` /
   `not-filed`), band or null (label, display label and the
   publisher's definition from the pinned table), the point
   line, and the source stamp. The scenario lines carry
   D55's per-half epochs and nothing else serves: rivers
   UKCP18 / RCP 8.5 / Central, 2040–2069; the sea Higher
   Central, 2036–2065 with cumulative sea level rise to
   2065; surface water Central, 2040–2060. The blended span
   ("between 2036 and 2069") never serves; no 2080s horizon
   serves; no proximity is read for the block. The block is
   composed from the climate facts alone — structural
   independence from the present-day layers, proven both
   ways in the flood suite — so no present-vs-scenario
   comparison is servable, and Exeter's present-day Very low
   is never set beside its scenario Low. England rungs 1–2
   only: rung 3, rung 4 and the not-covered nations carry no
   climate key; the block never enters `layers[]`.
4. **Cache** (`lib/bundle-cache.ts`) — the flood dependency
   vector gains both climate loaders; the flood guard gains
   per-source counts (`rofrsCc`, `rofswCc`) read live from
   `flood_climate_layers`, so a scenario re-filing busts the
   entry and a first filing busts a cached per-source
   not-filed state; the shape contract extends with the
   climate key in the M6.22 pattern (a pre-M6.28 entry
   degrades to a recompute; the stored form keeps the block
   whole — it is filed data, unlike the live warnings).
5. **Census** — rows 83 (`flood.climate`, hard,
   dedicated-field, the fence line) and 84
   (`flood.climate-scenario`, hard, line-embedded, the
   scenario lines) appended; the register stands at 84
   families / 51 hard. The band display label rides the
   existing `flood.label` family.

## Goldens pinned

Serving basis (the prep's golden table, locked in the flood
suite's fake-facts goldens and the replay cell, and read back
at the build's local rehearsal through the real covering
query over the real fixture filings): rivers & sea —
Birkdale no band published, Exeter **Low**, Minerva no band
published; surface water — Birkdale no band, Exeter no band,
Minerva **Low**. Editions 2026-11-03 (rivers & sea) and
2026-11-10 (surface water). Exeter's scenario Low is locked
as a scenario fact only; its present-day Very low serves in
its own layer and the two are never juxtaposed in any served
line or test name.

## Contract pins and proofs

Exactly two bundle-shape pins moved — flood.served-mixed and
flood.served-warnings, each gaining the climate block in its
not-filed form (the contracts fake files no climate layers)
— and two pins are new: flood.climate-mixed (rivers & sea
inside Low, surface water filed with no band) and
flood.climate-inside (both sources inside). All 44 other
pins stand, including every short.* pin — verified
pin-by-pin against the re-pin output before merging, not
assumed. All 48 pins stand, with the record comment in
tests/bundle-contracts.test.ts. The prep's 13 checks exist
as tests: the two loader suites (25 and 26 tests — fixture
reads, vocabulary contracts, golden locks, bands, split
fixtures), the loader-contracts suite over the integrated
runner, the brain suite (the block's presence and absence
per rung and nation, the three states per source, scenario
naming in every state, the no-delta scan, the no-2080 scan,
structural independence both ways, the shared banned-wording
scan over every climate string, the golden homes, the DB
source port incl. its unfiled short-circuit and the
no-proximity read), the short-bundle identity proof, the
cache suite (dependency pin, stored form keeps the block,
pre-step entries recompute, the guard bust), the canary
probe suites (both probes' happy paths and failure modes),
the census in both directions, and the replay cell.

## Gate

- `npm run prepush` green on the integrated tree before the
  push: format, lint, typecheck, 1,351 tests and build
  (counts in the build's closing report).
- Local rehearsal (scoped, per the standing flood
  ST_MakeValid wedge): migrations applied twice against the
  local PostGIS engine with 0025 in sequence; both climate
  fixtures filed through the real loaders (37 and 69
  features, editions 2026-11-03 / 2026-11-10) and the three
  golden homes read back through the brain's own covering
  query — the golden states above, exactly. The full runner
  fixture pass and the replay's other cells are CI-only
  proofs, as at M6.5; CI's database job is the filing proof
  for the full pass.
- CI and the practice runs for this push are read by the
  parent from the Actions page, as at every prior step.
