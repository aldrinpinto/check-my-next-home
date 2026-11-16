# Backend M6.27 — recorded flood defences serve in the flood answer

Plan step M6.27 (decisions D49 as amended by D54; prep
`~/workspace/scratch-m627/FINDINGS-HOLD.md`). The flood answer
gains a sibling block: the Environment Agency's AIMS register
of recorded flood defences near the postcode point — the
nearest 25 in full, an overflow line with the true total,
filed by a new quarterly loader under a fail-closed
vocabulary contract. Report depth only; the short bundle is
proven free of it.

## The first check

The prep's load-bearing claims were verified against the
real GeoPackage (the 13 Nov 2026 build) and the repo before
any code was written, and all held: 141,458 features; every
feature a MultiLineString; `asset_name` uniformly
'Not Available'; `asset_id` unique and never null; the
maintainer vocabulary exactly the prep's 10 values
(including 'Network Rail ' with its trailing space, 1 row);
the operator vocabulary 9 values; condition '' on 104,447
rows distinct from '0' (140) and NULL (90); the 14
asset_sub_types as listed. Two premise refinements, neither
load-bearing against the prep: `last_inspection_date` is
plain DD/MM/YYYY text throughout (the quote characters in
early probes were a rendering artefact of the probe, not
file content), and the loader converts it strictly — a real
calendar date or the run fails.

## What was built

1. **Migration 0024** — `flood_defences` exactly as the
   prep drafted it (schema.md entry 35), plus
   `last_inspection_date date` (D54(3): filed, not served —
   the brain's read port does not carry the column). GiST
   index on the geometry. NO ST_MakeValid, deliberately: a
   line has no area semantics and serving needs only
   distance to it; invalid lines are counted in the
   loader's summary line, filed as published, never
   dropped or repaired.
2. **Loader** `loaders/load-flood-defences.mjs` — the
   national GeoPackage downloads whole from the DSP file
   endpoint (there is no OGC collection for this product;
   the M5.1 pattern 404s, measured by the prep). The
   edition stamp is the zip member's own DOS date, read
   from the zip directory without inflating 123 MB — the
   CKAN record's modified date is the metadata's, never
   the data's. Transform follows load-os-greenspace.mjs
   (node:sqlite + the hand-rolled WKB reader extended to
   geometry types 2/5, LineString normalised to a
   one-member MultiLineString; house proj4 definition WITH
   the towgs84 shift per vertex). Filing is the flood
   loaders' staged single-edition DELETE+INSERT swap in
   one transaction, reconciled against the source count.
   Guards: the ±10% sanity band against the prep's 141,458
   (127,312–155,604), and the FAIL-CLOSED vocabulary
   contract — maintainer (10 values), operator (9),
   condition ('' / '0'–'5' / NULL), asset sub-type (14),
   protection type (5 + NULL), design-SoP quality flag (6
   - NULL); maintainer and operator are trimmed before
     matching ('Network Rail ' files as 'Network Rail'), and
     any other value fails the run and files nothing, so no
     person's name can ever be filed as a maintainer.
     Registered quarterly in LOADER_SCHEDULE after
     load-flood-surface-water; `load:flood-defences` script;
     the runner's fixture pass files the golden fixture.
3. **Fixture** `tests/fixtures/flood-defences/` — every
   feature within 2.5 BNG-plane miles of the three golden
   homes cut from the real file (834 rows: Birkdale 45,
   Exeter 709, Epsom 80 — so each home's within-2-miles set
   is complete in the fixture), rows and geometry blobs
   verbatim, stored as aims.gpkg + aims.gpkg.b64 in the
   greenspace idiom, with fixture.json (edition 2026-11-13)
   and a README.
4. **Brain** (lib/flood.ts) — `FloodDataSource` gains
   `defencesNear(lat, lon)`; the served flood bundle gains
   a non-null `defences` sibling block on the served state
   (England, rungs 1–2) only. The block: the pinned title,
   the pinned structural caveat, the RoFRS bridge line
   (served only where the filed RoFRS facts exist — the
   D49 no-double-count rule), up to the nearest 25
   defences in full (D54(1); the cap is a list-length
   judgment, recorded here: 25 covers the dense urban case
   in one screen while the overflow line always carries
   the true total), the overflow line "and N more recorded
   defences within two miles" where the total exceeds the
   list, and the source line. Each defence serves: type as
   filed, watercourse where filed ('' serves as absent),
   the maintainer category verbatim with 'Unknown' and
   missing serving as the named absence "no maintainer is
   recorded for this defence", the condition in EA grade
   words from the pinned code table ('' and NULL serve as
   "no condition grade is recorded"; '0' serves as
   "Unchecked", never conflated with ''), the design
   standard where filed with its pinned D13 explainer and
   the filed quality flag, and the current standard where
   filed (3.4% nationally) with its twin explainer —
   otherwise the named absence. Named states: served /
   none-within-radius (the pinned line carrying the
   coverage limit) / not-filed. Distances are the serving
   basis (PostGIS geography over the filed lines, D22).
   One serving field beyond the prep's sketch:
   `currentSopExplainer`, the current-standard twin of the
   pinned design explainer, so the current figure explains
   itself under D13 exactly as the design figure does.
5. **Short bundle** — shortFlood picks named fields, so
   the block cannot leak; an identity test proves the
   short bundle built from a flood bundle WITH a served
   defences block deep-equals the one built from the
   not-filed block, and the serialised short bundle
   contains none of the block's title, register name,
   asset ids or SoP wording.
6. **Cache** (D29) — BRAIN_DEPENDENCIES.flood gains
   "load-flood-defences"; GUARDS.flood gains the
   `floodDefences` filed count; the flood shape check now
   requires the `defences` key alongside `liveWarnings`,
   so pre-M6.27 stored entries recompute. The stored form
   KEEPS the block (it is filed data; only live warnings
   strip, per M6.22).
7. **Canary** — `loaders/canary-flood-defences.mjs` probes
   the CKAN record's shape (record name, the AfA345
   licence note, the gpkg.zip resource on the file-download
   pattern), wired into canary.mjs as `flood-defences`
   after flood-surface-water. HEAD on the download endpoint
   is 405 and the record's modified date is not a freshness
   oracle (both measured by the prep); the loader's ±10%
   band is the real content guard.
8. **Census** — rows 81 (`flood.defences`, hard, dedicated
   field: the block's caveat) and 82 (`flood.defences-sop`,
   hard, line-embedded: the design-standard explainer). 82
   families, 49 hard. The figure register routes the
   defences' miles to flood.proximity-miles, the totals and
   filed-word fields to flood.defences, and the standards
   of protection to flood.defences-sop; maintainerRecorded,
   assetId, protectionType, watercourse and the two
   explainer lines are classified not-a-figure with their
   reasons.
9. **Golden replay** — the 18th cell: the three homes'
   defences blocks as filed by the fixture in the database
   job (totals, served counts, overflow lines, first
   defences in full).

## Goldens pinned

Loader basis (BNG-plane, the prep's cross-check, locked in
the loader's golden check and its test): Birkdale 26 within
2 miles, nearest asset 73925 (Natural High Ground, River
Ter, 0.851 mi); Exeter 443, nearest asset 14473 (Wall,
River Lea or Lee, 0.579 mi — an exact distance tie with
asset 8140, broken by asset id); Minerva 52, nearest asset
80375 (Natural High Ground, Hogsmill River, 0.429 mi).

Serving basis (PostGIS geography over the filed lines,
measured at the build's local rehearsal against the fixture
filing and locked in the replay cell): Birkdale 26 total,
25 served, overflow "and 1 more recorded defences within
two miles", first 73925 at 0.851 mi (Environment Agency,
condition Fair, design standard 10, no quality flag filed,
no current standard); Exeter 443 total, 25 served, overflow
"and 418 more…", first 14473 at 0.579 mi (Wall, Tidal,
private maintainer category, no condition grade recorded,
design standard 1000); Minerva 52 total, 25 served,
overflow "and 27 more…", first 80375 at 0.429 mi (Natural
High Ground, Hogsmill River, private maintainer category,
design standard 25). The serving figures agree with the
prep's BNG-plane cross-checks at the locked precision — no
material difference to report.

## The first filing's invalid lines

Zero. The fixture filing through the loader's own staged
swap filed 834 lines with 0 invalid, and the whole national
file measured the same way the loader files it (its own
reader and transform, the filed WKTs inserted in batches):
141,458 geometries, 0 invalid under ST_IsValid. The
loader's summary line carries the count on every filing, so
a future edition that arrives with invalid lines names them
there rather than dropping them. (The loader's own
single-transaction national filing was not completed on
the local WASM engine — the bridge fails inside very long
transactions, the standing local limitation the flood
polygon loaders already established; the staged swap itself
is proven locally at fixture scale and in CI's database
job, and the first production filing is M12.10(h)'s.)

## Contract pins and proofs

Exactly two bundle-shape pins moved — flood.served-mixed
and flood.served-warnings, each gaining the defences block
in its not-filed form (the contracts fake files no
defences) — re-pinned at this step with the record comment
in tests/bundle-contracts.test.ts; all 44 other pins stand,
including every short.* pin. The prep's 13 checks exist as
tests: the loader suite (fixture read, golden row, the
vocabulary contract incl. the "J Smith" maintainer AND
operator rows failing the run, the '' / '0' / NULL condition
distinctions, the golden locks, the band), the brain suite
(served-in-full with bridge and caveat, the cap and
overflow lines, both bridge arms, none-within-radius,
not-filed, the named absences, the no-protection wording
scan over every served line, rung 3 and Wales carrying no
defences key, the DB source port), the short-bundle
identity proof, the cache suite (dependency pin, stored
form keeps the block, pre-step entries recompute, the
guard bust), the canary suite, and the replay cell.

Live proof at build time: the loader's `--verify-only`
against the real DSP download verified all 141,458 features
against the vocabulary contract and the golden locks,
edition 2026-11-13, filing nothing. The first production
filing is M12.10(h)'s, as for every late-M6 loader.

## Gate

- `npm run prepush` green before the push: format, lint,
  typecheck, tests and build in CI's order (counts in the
  build's closing report).
- Local rehearsal (scoped, per the standing flood
  finding): migrations applied twice against the local
  PostGIS engine with 0024 in sequence; the defences
  fixture filed through the real loader and the three
  golden homes read back through the real database source
  (the serving-basis figures above); the national validity
  measurement in the previous section. The full runner
  fixture pass and the replay's flood cells are CI-only
  proofs, as at M6.5.
- CI and the practice runs for this push are read by the
  parent from the Actions page, as at every prior step.
