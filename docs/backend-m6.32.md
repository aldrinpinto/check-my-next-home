# Backend M6.32 — Industrial sites from the Pollution Inventory

Plan step M6.32 (decisions D50, D60 and D62; prep
`~/workspace/scratch-m632/FINDINGS-HOLD.md`). The nearby
bundle gains the `industrialSites` block at report depth,
at the END of What's Nearby — never in the air section:
the regulated industrial sites in the Environment
Agency's Pollution Inventory within two miles of the
postcode point, each serving its filed address (the
source carries no site name), its operator, its permit
reference, and the releases to air its operator reported
for the latest filed year. The block serves behind
`INDUSTRIAL_SITES_ENABLED` (lib/site.ts, decision D60),
defaulting ON — the founder's ruling is "serve it now,
switch off if the EA objects" — with the D32 absence
property: while the flag is off the key is absent from
the bundle entirely and the source is never read. A
below-reporting-threshold return files as quantity NULL
plus the flag and serves as a name on a labelled line —
never 0, never a number — structurally distinct from a
quantified return of 0 and from no air rows at all.
Nothing is totalled and nothing is ranked across
substances. This step was drafted in an isolated copy
under the D58 overlap model, taken from the main tree at
M6.31's integrated head (`7cd4388`); the pin and census
states below are the draft's, to be re-verified at
integration against the true tree.

## The first check

The prep's load-bearing premises were re-verified from
the source data itself before any code was written
(16 Nov 2026), against the real published 2024 file (the
DSP download, 5,507,231 bytes; workbook member dated
20 Nov 2025):

- **The register is the Substances sheet's permits:
  2,870.** The header row is found by its first cell
  (`AUTHORISATION ID / PERMIT ID`) at row 9 — the prep's
  prose said row 10; the design finds the header by
  content, so the off-by-one has no impact and is
  recorded here as the draft's one correction to the
  prep. 31,384 data rows; 17,907 Air-route rows; **2,720
  permits report to air** in some form; 12,841 BRT air
  rows; 4,957 quantified-positive and 109 quantified-zero
  air rows; 14 permits with no easting/northing; 40 with
  a blank postcode; 1,870 sites with at least one
  quantified air return; 850 BRT-only for air; 150 with
  no air rows at all; 70 distinct air substances; routes
  Air 17,907 / Controlled Waters 6,890 / Wastewater 6,560
  / Land 27; every (permit, route, substance) triple
  unique; the identity columns (operator, address,
  postcode, coordinates, activity, sector) are identical
  across all rows of every permit — the loader asserts
  this and would refuse a vintage that stopped repeating
  them.
- **The goldens reproduce exactly** on the house basis
  (proj4 EPSG:27700 with the towgs84 shift; haversine
  R=3956): Birkdale CM3 2JT → one site, YP3432XR at 1.328
  miles (Ammonia 3,128 kg over a 1,000 kg threshold; PM10
  3,066 kg over 1,000; NOx below threshold). Exeter
  E16 1GN → six sites (SP3237JU 0.998, BP3530YR 1.141,
  FP3839YQ 1.161, EP3507SL 1.203, MP3530HZ 1.465,
  DP3906BE 1.956). Minerva KT17 1FH → none. Filed
  substance names govern over the prep's shorthand (the
  register files "Sulphur oxides (SO2 and SO3) as SO2",
  not "SOx"). EP3507SL carries the threshold-0 case
  (renewable CO2, 670 kg, threshold 0); MP3530HZ is the
  Thames Refinery (T & L Sugars Limited; carbon dioxide
  88,988,870 kg over a 10,000,000 threshold); DP3906BE
  is below-threshold only, ten substances. Site addresses
  serve verbatim as filed — commas exactly as in the
  file, the postcode a separate column.
- **The source record**: CKAN dataset
  `cfd94301-a2f2-48a2-9915-e477ca6d8b7e`, twelve yearly
  ZIPs (2013–2024) behind one DSP file dataset id; the
  record's created/modified dates are platform migration
  artefacts, so the vintage's publication date derives
  from the downloaded ZIP's workbook member timestamp —
  **2025-11-20** for the 2024 vintage — read from the DOS
  date field directly, never through a timezone.

## What was built

1. **The tables** (migration 0027): `industrial_sites`
   (one row per permit: operator, site address verbatim,
   postcode, activity description, sector and sub-sector
   as filed, easting/northing, converted point, the
   vintage and its provenance) and
   `industrial_site_releases` (one row per air return,
   keyed (permit, substance): threshold, nullable
   quantity, below_threshold flag; cascade delete from
   the site). No site-name column (none exists in the
   source — D62), no regulator column ("Environment
   Agency" is a block-level fact), no EA AREA NAME (the
   Agency's internal team, not a regulator), no JSONB.
   One vintage is held at a time.
2. **The loader** (`loaders/load-pollution-inventory.mjs`,
   annual — registered `static`, the house class for an
   editioned annual file): resolves the latest year on
   the dataset record (never hardcoded), downloads the
   year's ZIP, and reads only the `<year> Substances`
   sheet through a minimal in-loader XLSX reader (yauzl +
   workbook rels + shared strings — no new dependency;
   the Waste Transfers and Radioactive sheets are never
   opened). Filing is one transaction — stage, check,
   swap both tables, assert counts, commit — so a failed
   load never overwrites the last good vintage. Fail-
   closed: the measured-count bands (±10% of sites
   2,870 / air sites 2,720 / air rows 17,907 / BRT air
   12,841) apply to a vintage pinned in
   `MEASURED_VINTAGES`; an unmeasured vintage refuses,
   naming the operator action. The golden permits'
   content is checked before anything files, on every
   pull. A quantity cell that is neither numeric nor the
   exact text "Below Reporting Threshold" fails the load.
   The deletion path the licence position may one day
   need is the exported `deletePollutionInventory` (both
   tables emptied in one transaction).
3. **Serving** (lib/nearby.ts): `NearbyDataSource` gains
   `industrialSiteFacts`; the rung 1/2 bundle gains the
   optional `industrialSites` key. The nation is read
   from the LSOA code's first letter (the
   schoolDeadlinesFor pattern): W/S/N serve the named
   not-covered state WITHOUT reading the source (Wales —
   the Welsh Emissions Inventory, Natural Resources
   Wales; Scotland — the Scottish Pollutant Release
   Inventory, SEPA; Northern Ireland — the Northern
   Ireland Pollution Inventory, NIEA); England reads the
   source only while the flag is on. States: served /
   none-within-2-miles / not-filed / not-covered. Sites
   serve nearest first (D22 haversine, three decimals);
   a site's quantified releases serve largest first
   (substance name breaks ties — presentation order
   within the site's own returns, never a ranking across
   substances or sites); below-threshold names serve
   alphabetically on their own line, joined with
   semicolons (the substance names contain commas). The
   block carries its basis line, the reported line
   ("Every figure is the quantity the operator reported
   to the Environment Agency for {year}.") and the
   threshold line (below-threshold "is not a measurement
   of zero" — the pinned D50 sense). Sites with no filed
   point never serve; a site with no air rows serves its
   own line ("No releases to air were reported for this
   site for {year}.").
4. **The flag** (lib/site.ts): `INDUSTRIAL_SITES_ENABLED
= true` with the D60 comment block — the ruling, the
   licence position in view, the flip procedure, and the
   rule that re-enabling after an objection takes the
   founder's word plus the EA's written clearance.
   `COMPANY_OWNERSHIP_ENABLED` is untouched.
5. **The cache** (lib/bundle-cache.ts):
   `BRAIN_DEPENDENCIES.nearby` gains
   `load-pollution-inventory` (a runner class — its stamp
   moves on every filing, so GUARDS.nearby stays
   directory-only and the first filing busts a cached
   not-filed block on the stamp alone);
   `buildNearbyBundleCached` takes the NearbyBundleOptions
   seam; shapeOk gains the presence-agreement clause —
   the bundle's `industrialSites` key must be present
   exactly when the flag position being built for is on.
   That clause is what makes the D60 flip purge-free,
   proven by the flip drill in the cache suite.
6. **Runner and canary**: LOADER_SCHEDULE gains
   `{ item: "load-pollution-inventory", cadence:
"static", timeoutMinutes: 30 }` after load-air-quality;
   FRIENDLY_NAMES gains the loader name and
   `"ea-pollution-inventory": "Industrial sites source
(canary)"`; shortDetail picks the sites-filed count;
   the fixture pass runs the loader on
   `tests/fixtures/pollution-inventory` after
   load-charging-zones; package.json gains
   `load:pollution-inventory`. The canary probe
   `ea-pollution-inventory` reads the dataset record with
   the loader's own resolver: healthy while the latest
   published year is the pinned vintage; WARNING when a
   newer year lands (naming the measure-and-pin action)
   or the year's ZIP leaves the 1–50 MB ballpark (the
   2024 ZIP is 5.5 MB). The loader is NOT added to the
   live plan loop — the M6.30/M6.31 precedent (the
   production runner is not live until M12).
7. **The fixture** (`tests/fixtures/pollution-inventory/`):
   the real published 2024 ZIP cut to nine permits — the
   seven goldens, PP3936YU (no air rows; the no-returns
   state) and CP3140QU (no published point; files NULL
   geometry), both verified more than two miles from
   every replay postcode — with the Substances sheet's
   preamble and header kept whole, the shared-strings
   table kept whole, the other two sheets trimmed to
   their preamble rows, and the workbook member's stored
   timestamp set to the publication date (2025-11-20) so
   the loader's date derivation runs on the fixture
   exactly as live. A README in the directory records the
   cut.

## Served states, verbatim

- basis (served / none): "Regulated industrial sites
  from the Environment Agency's Pollution Inventory for
  {year}: the sites the Agency permits for large
  industrial activities, and the releases to air their
  operators reported for that year."
- reported: "Every figure is the quantity the operator
  reported to the Environment Agency for {year}."
- threshold: "Each substance also shows the reporting
  threshold for {year} — the level at or above which a
  quantity must be reported. A substance reported below
  its threshold was still released; below the reporting
  threshold is not a measurement of zero."
- served line: "The regulated industrial sites recorded
  within two miles of this postcode point are listed
  below, nearest first."
- none line: "No regulated industrial site in the
  Environment Agency's Pollution Inventory for {year} is
  recorded within two miles of this postcode point."
- not-filed line: "The Pollution Inventory is not filed
  yet, so regulated industrial sites cannot be shown for
  this check."
- not-covered basis: "The Pollution Inventory covers
  England only. Wales, Scotland and Northern Ireland
  keep their own inventories, which are not filed here."
  — with the served line naming the Welsh Emissions
  Inventory (Natural Resources Wales), the Scottish
  Pollutant Release Inventory (Scottish Environment
  Protection Agency) or the Northern Ireland Pollution
  Inventory (Northern Ireland Environment Agency) for
  the home's nation.
- per-site below-threshold line: "Also reported for
  {year}, below the reporting threshold: {names joined
  '; '}."
- per-site no-returns line: "No releases to air were
  reported for this site for {year}."

All lines were pre-scanned against the 49-term banned
union (0 collisions) at prep; the serving suite re-scans
every state's strings against the union plus the step's
local additions ("polluter", "polluting",
"contamination").

## Goldens pinned

Birkdale CM3 2JT — one site (YP3432XR, 1.328 miles;
Ammonia 3,128 kg / threshold 1,000; PM10 3,066 kg /
1,000; NOx below threshold). Exeter E16 1GN — six sites
in distance order (SP3237JU 0.998, BP3530YR 1.141,
FP3839YQ 1.161, EP3507SL 1.203, MP3530HZ 1.465,
DP3906BE 1.956), including the threshold-0 renewable-CO2
return (670 kg, threshold 0) and the Thames Refinery's
carbon dioxide (88,988,870 kg). Minerva KT17 1FH — none
within two miles. Cardiff / Edinburgh / Belfast —
not-covered, naming WEI / SPRI / NIPI. The golden replay
asserts all of it through the real source on the fixture
filing; its first proof against a real PostGIS is CI's
database job at the gate, as with M6.31.

## Contract pins and proofs

- **Pins**: exactly four nearby pins moved —
  nearby.served, nearby.beyond-only (each differing by
  exactly the added `industrialSites` key in its served
  form; the contracts fake files one site near the home),
  nearby.none-anywhere (the none form) and
  nearby.not-filed (the not-filed form). Verified
  leaf-by-leaf against the pre-step shapes before the
  re-pin was written. **nearby.rung3 and nearby.rung4 did
  not move** (the block attaches at rungs 1 and 2 only),
  no other brain's pins moved, and **no short pin
  moved**; 48 pins stand. A re-pin record comment rides
  in tests/bundle-contracts.test.ts, marked draft state.
- **Census**: row 88 (draft state),
  `nearby.industrial-sites.releases`, hard, line-embedded
  at `industrialSites.thresholdLine`; the register stands
  at 88 families / 55 hard. FIGURE_PATH_PATTERNS gains
  the sites' miles (→ nearby.distance-miles) and the
  releases' quantityKg/thresholdKg (→ the new family);
  NOT_A_FIGURE gains specific entries for dataYear,
  permitId, sitePostcode, sector, subSector, siteAddress,
  activityDescription, the below-threshold names and the
  noAirReturns marker (filed register facts, identifiers
  and names — none is a figure).
- **Short identity**: the block is a sibling key the
  short bundle's derivation never reads — proven in the
  golden replay by deep-equality of the shorts built
  from the flag-on and flag-off nearby bundles, and by
  the serialised short carrying no "Pollution Inventory".
- **Cache**: the presence-agreement degradation (a
  pre-step entry recomputes), the first-filing stamp
  bust, and the D60 flip drill (on → off → on with no
  purge, the source unread while off) are proven in
  tests/bundle-cache.test.ts.
- **Loader contracts**: the loader-contracts suite
  auto-covers the new loader (file, friendly names,
  fixture invocation, fixture directory) — 128 tests
  green in the draft.

## Integration checklist (for the serial port onto main)

New files (copy as-is): db/migrations/0027_industrial_sites.sql;
loaders/load-pollution-inventory.mjs;
tests/load-pollution-inventory.test.ts;
tests/industrial-sites.test.ts;
tests/fixtures/pollution-inventory/ (the ZIP + README);
docs/backend-m6.32.md.

Shared files — apply these hunks onto the true tree:

- lib/site.ts — append the INDUSTRIAL_SITES_ENABLED
  block after COMPANY_OWNERSHIP_ENABLED (the company
  flag itself untouched).
- lib/nearby.ts — the INDUSTRIAL_SITES_ENABLED import;
  the header comment's industrial-sites paragraph;
  NearbyDataSource.industrialSiteFacts +
  IndustrialSiteFact / IndustrialSitesFacts types; the
  block types, line constants and industrialSitesBlock
  builder; the NearbyBundle rung 1/2 variant's optional
  industrialSites key; NearbyBundleOptions +
  buildNearbyBundle's options parameter and block wiring;
  createNearbySource.industrialSiteFacts.
- lib/bundle-cache.ts — the site import gains
  INDUSTRIAL_SITES_ENABLED; the nearby import gains the
  NearbyBundleOptions type; BRAIN_DEPENDENCIES.nearby
  gains "load-pollution-inventory";
  buildNearbyBundleCached gains the options parameter
  and the shapeOk presence clause.
- loaders/run-loaders.mjs — the LOADER_SCHEDULE entry
  after load-air-quality; the two FRIENDLY_NAMES entries;
  the shortDetail case; the fixture-pass line after
  load-charging-zones.
- loaders/canary.mjs — the loader import; probePollutionInventory
  after probeScotlandLez; the run line after scotland-lez.
- package.json — the load:pollution-inventory script.
- tests/fixtures/replay/bundle-shapes.json — the four
  re-pinned nearby shapes (leaf-verified above).
- tests/bundle-contracts.test.ts — the IndustrialSitesFacts
  import; FakeNearbySource.industrialSiteFacts; the M6.32
  re-pin record comment.
- tests/explainer-census.ts — row 88; the two
  FIGURE_PATH_PATTERNS entries; the NOT_A_FIGURE entries.
- tests/explainer-census.test.ts — the CensusNearbySource
  served facts; the HARD_LINES entry; the enumeration
  counts 87/54 → 88/55.
- tests/nearby.test.ts, tests/state-matrix.test.ts,
  tests/short-bundle.test.ts — each fake gains
  industrialSiteFacts (filed facts, no sites).
- tests/bundle-cache.test.ts — the IndustrialSitesFacts
  import; FakeNearbySource's settable industrialFacts +
  counter; RatedGpNearbySource.industrialSiteFacts; the
  M6.32 cache describe block.
- tests/golden-replay.test.ts — the industrial-sites
  test after the charging-zones test.
- tests/golden-matrix.md — the M6.32 section appended.
- docs/schema.md — entry 38 (0027 industrial_sites +
  industrial_site_releases).
- docs/data-loading.md — the Pollution Inventory row in
  the static table group; the header loader count
  40 → 41.

At integration: re-verify the pin set by leaf-diff
against the true tree's pre-step shapes (the draft's
diff was taken against M6.31's integrated head, so it
should reproduce exactly); re-verify the census row
number (88 assumes M6.31's row 87 landed first, as the
queue has it); never port tsconfig.tsbuildinfo from the
draft tree.

## Gate

Draft state (D58): built and proven in the isolated copy
only — nothing pushed, no plan edit. Integration ports
the hunks above in queue order after M6.31's gate, then
the step takes the usual gate (prepush, CI, practice ×3).
The EA licence position (D60) controls the flag only: an
objection in any form flips INDUSTRIAL_SITES_ENABLED off
immediately (the section key goes absent; the filed data
stays, unserved, unless the answer requires deletion —
the founder's call, with deletePollutionInventory as the
path); the formal re-rule stands at M12.10(i). The first
live filing joins M12.10(h) with the other late-M6 first
filings.
