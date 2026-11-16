# Backend M6.29 — air yardstick lines serve at report depth

Plan step M6.29 (decisions D50 and D57, amending D26; prep
`~/workspace/scratch-m629/FINDINGS-HOLD.md`). The air section
gains a yardstick block: each of the three modelled
concentrations now carries, at report depth only, its
position against two named yardsticks — the UK legal limit
and the World Health Organization's 2021 guideline — with
the block's basis line stating that the position is a scale
for reading the figure, never a compliance finding. The
headline NO2 stays bare and the short bundle is proven free
of the block. Brain-only: no loader change, no migration,
no version-vector change. This step was drafted in an
isolated copy under the D58 overlap model (against main
head 061e36f, post-M6.28); the pin and census states below
are the draft's, to be re-verified at integration against
the true tree.

## The first check

The prep's load-bearing premise was verified from the
tree's own artefacts before any case test was written:
the filed PCM 2024 triples for the three golden homes,
read from the air loader's GOLDEN table (extracted live
from the published CSVs at M5.9) and from the fixture
README — two independent in-tree sources, in agreement:

- Birkdale (square 751310): NO2 8.150298, PM2.5 7.124671,
  PM10 12.54823 µg/m³.
- Exeter (square 771971): NO2 21.71409, PM2.5 9.939679,
  PM10 16.97423 µg/m³.
- Minerva (square 785063): NO2 12.49256, PM2.5 7.868347,
  PM10 12.10357 µg/m³.

All three match the M6.6 lock exactly. The golden cases
follow from the case logic on the raw figures: Birkdale
below-both / between / below-both; Exeter between ×3;
Minerva between / between / below-both (below-both ×3,
between ×6, above ×0 — the above case has no golden
witness and is fixtured synthetically in the tests).

## What was built

1. **The constants** (`lib/area-bundle.ts`, exported as
   `AIR_YARDSTICKS` beside buildAir, served at answer
   time and never filed — the D16 pattern): UK legal
   limits, annual mean, from the Air Quality Standards
   Regulations 2010 (SI 2010/1001) Schedule 2 as amended
   — NO2 40, PM10 40, PM2.5 20 µg/m³ (the 20 is the
   stage-2 value in force since 1 January 2020; Schedule
   3's target value of 25 and the 10-by-2040 target under
   the Environmental Targets (Fine Particulate Matter)
   (England) Regulations 2023 are never yardsticks) — and
   WHO 2021 guidelines, annual mean: NO2 10, PM10 15,
   PM2.5 5 µg/m³. WHO is always a "guideline", never a
   limit. Both yardsticks are annual-mean statistics,
   matching the filed PCM annual-mean background figures
   exactly. A unit test deep-equals the exported block
   against this pinned table and guards PM2.5's limit at
   20 (no pollutant's limit is 10).
2. **The served block** — `AirSection.yardsticks`, present
   always: the block on a served section, `null` in the
   not-filed state. Per pollutant (order NO2, PM2.5,
   PM10): the filed value, both yardstick values, the
   position, the yardstick line (both yardsticks named
   with owner and statistic; the figure itself is never
   embedded in the prose) and the summary line. Case
   logic on the raw filed figure: above the limit →
   `above-uk-limit`; else above the guideline →
   `between`; else `below-both`. Boundary semantics
   (D57): a figure exactly at the limit reads "within";
   exactly at the guideline takes the below family's "at"
   form ("within the UK legal limit, and at the stricter
   WHO guideline"). The between summary is D50's pinned
   line verbatim; the above summary ("above the UK legal
   limit, and above the stricter WHO guideline") always
   travels with the block's basis line, which serves once
   with the block in every case.
3. **buildAir's header comment rewritten in-step**: the
   D26 no-comparison statement is superseded at report
   depth by D50/D57; the filed figures and the modelled
   explainer stand unchanged, and the M6.6 test's
   assertions on the section `line` and `explainer`
   (neither contains "limit") stand verbatim — only its
   comment was re-scoped.
4. **The cache presence rule** (`lib/bundle-cache.ts`):
   the area version vector has no air component and the
   static air loader's stamp does not move at this step,
   so the area `shapeOk` gains the M6.25-pattern rule —
   the air section must carry its `yardsticks` key. A
   pre-step entry degrades to a recompute on first read;
   a current-shape entry (key present, value null in the
   not-filed state) serves from the cache. Proven by a
   stale-entry test in the cache suite.
5. **Census** (`tests/explainer-census.ts`): row 46
   (`area.air.concentrations`) re-pointed — its note now
   records the joint discharge of the M6.18 dependency:
   in the answer at report depth by the yardstick lines,
   and in full on the air How-we-check page at M7.12 with
   their instruments (D52/R8); the register's header
   comment records the same. New row 85 (this draft's
   next free number) `area.air.yardsticks`, hard,
   line-embedded at
   `sections.air.yardsticks.pollutants[].yardstickLine`.
   The fail-closed walk gains the figure-path pattern for
   the block's numeric leaves (value / ukLimit /
   whoGuideline → row 85) and a not-a-figure entry for
   the `position` case label. Register in the draft:
   85 families / 52 hard.
6. **The golden-matrix air lock rewritten**: the triples
   stand; the "no comparison to statutory limits" clause
   is replaced by the yardstick lock (the positions above,
   the pinned between summary, the bare headline, no
   short-bundle reach).

## Goldens pinned

From the locked triples, computed on the raw figures and
asserted verbatim in the area suite: Birkdale — NO2
below-both, PM2.5 between, PM10 below-both; Exeter — all
three between; Minerva — NO2 between, PM2.5 between,
PM10 below-both. The three yardstick lines are asserted
character-for-character (NO2's in full in the suite; the
family is generated from the one pinned template and the
constants test pins the values each line names). The
synthetic fixtures cover what no golden home exercises:
the above-limit case (NO2 45.5 / PM2.5 20.5 / PM10 41,
all three `above-uk-limit` with the basis line riding)
and the boundary cases (value == limit reads within;
value == guideline takes the at form; a marginal step
across either threshold flips the case).

## Contract pins and proofs

- **Pins**: exactly the eight expected area pins moved —
  area.flag-on-building, area.flag-on-no-match,
  area.flag-on-own-title, area.rung1-empty (yardsticks:
  null there), area.rung1-rich, area.rung1-scotland,
  area.rung2, area.tribunal-served. The re-pin was
  spliced mechanically from the suite's own printed
  shapes after a comparison proved no other pin of the
  48 differed. **No short pin moved** — the leak alarm
  stayed silent; the rung-3/4 pins did not move (their
  air entries are state stubs). A re-pin record comment
  rides in tests/bundle-contracts.test.ts.
- **Headline/short identity**: the headline projection
  picks air as exactly {state, headlineFigure, line};
  a test deep-equals the short bundles derived with the
  block served and with it in its null form, scans both
  the short bundle and the projection serialised for
  "yardstick" / "WHO guideline" / "legal limit" (none),
  and asserts the NO2 headline line byte-identical to
  its pre-step form.
- **Golden replay**: no change — the replay contains no
  air-specific assertions and exercises air only through
  the shared shape pins and bundle builds (confirmed by
  grep, as the prep recorded).
- **Wording**: the yardstick lines join the served-string
  banned-wording scans automatically; the prep's
  mechanical run had all eight drafted lines clean
  against the 49-term union, and the suite's scans pass
  over the verbatim strings the golden tests pin.

## Gate

Draft state (D58): built and proven in the isolated copy
only — nothing pushed, no plan edit. Integration
re-verifies the pin set and the census row number
against the true tree, then the step takes the usual
gate (prepush, CI, practice ×3) in queue order.
