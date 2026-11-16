# Backend report — M6.26 EPC construction block (decision D48)

M6.26 serves each EPC certificate's recorded construction
descriptions — the register's own words for how the home
is built, in the seven element groups (walls, roofs,
floors, windows, lighting, main heating, hot water) — as
a per-certificate block at report depth, inside the
certificate's own serving under its assessment label.
This is the third deliberate widening of the EPC loader's
filed set, after the modelled costs (M6.14, D33) and the
suggested improvements (M6.21, D41).

## The first check — the corpus carries the groups

The step's mandatory first check verified the premise
from the fixture corpus itself (tests/fixtures/epc/
certs/, 128 certificate documents), before any code:

1. **All seven groups are present as the brief stated.**
   Walls, roofs, floors, lighting, hot water and main
   heating are non-null on all 128 documents; windows is
   absent on exactly 6 of 128. Walls, roofs, floors and
   main heating arrive as arrays of entries; windows,
   lighting and hot water as single entries (nullable).
   No group is an empty array anywhere in the corpus.
2. **The two description shapes both occur.** An entry's
   description is a plain string on some vintages and a
   { value, language } object on others (54 of the 250
   sampled wall/window entries are the object form) —
   the same duality the loader already unwraps for
   dwelling_type.
3. **The golden certificates carry what the prep
   recorded.** Birkdale's 2490-1633-0432-1002-3023: walls
   "Average thermal transmittance 0.27 W/m²K", roofs
   0.11, floors 0.15, windows "High performance glazing",
   heating "Boiler and radiators, mains gas", hot water
   "From main system, waste water heat recovery".
   Exeter's pair disagrees exactly as recorded (2013 SAP
   transmittance set and "Fully double glazed" against
   2023 RdSAP "(assumed)" words, "Community scheme", and
   no windows group at all). Minerva's
   8401-7039-6529-6723-9906 carries "(other premises
   above)" / "(other premises below)" and "Boiler&
   underfloor, mains gas" — the register's own ampersand.

The premise held in full; the build proceeded as briefed.

## What was built

1. **The loader (loaders/load-epc.mjs).** minimise()
   gains constructionOf(doc): the seven groups normalised
   per entry to the recorded description only (the
   { value, language } unwrap mirrors dwelling_type). The
   groups' per-element 0–5 energy and environmental
   efficiency ratings are dropped at filing and never
   held — the recorded judgment call from the prep: the
   site serves the descriptions and nothing else from
   those groups (0 means not applicable on the register's
   own scale, and the numbers are verdict-shaped). A
   group the register does not publish files null. No
   migration: the artefact is JSONB in
   postcode_cache.answers, as at M6.14 and M6.21. The
   loader's golden check gains CONSTRUCTION_GOLDEN — the
   filed construction for the four golden certificates,
   pinned by deep equality, so a rating filed anywhere in
   a group, or a description altered by a character,
   fails the load loudly. The OS/Royal Mail notice is
   unaffected: construction descriptions are
   Crown-copyright certificate facts, not address data.
2. **The brain (lib/area-bundle.ts).** Each served
   certificate gains construction: the block, or null
   where the filed artefact predates the widening (the
   improvements pattern — the certificate then serves
   exactly as it did before, until the postcode is
   re-filed). The block serves the seven groups in
   register order, descriptions verbatim — "(assumed)"
   markers kept, the register's ampersand unescaped,
   disagreements between a home's certificates standing
   whole because each certificate serves its own block.
   An absent group serves no descriptions and the named
   line "not recorded on this certificate" — never a
   value borrowed from another certificate or group. The
   block's line is the pinned D13 basis line, verbatim:
   "the certificate's own description of this home's
   construction, recorded at the assessment; on an
   existing-home (RdSAP) certificate '(assumed)' means
   the assessor could not inspect that part and recorded
   the standard assumption for a home of its kind." The
   pinned U-value line serves only where a description
   carries a transmittance figure: "the U-value in a
   description is the register's measure of how fast
   heat passes through that part of the home, in watts
   per square metre for each degree of temperature
   difference — lower lets less heat escape."
3. **No numeric U-value exists in the served shape.** A
   U-value appears only as text inside a new-build SAP
   description, never extracted, computed or converted.
   A shape test walks the whole served EPC section: no
   key names a U-value field or an element efficiency
   rating (the sole key the scan allows is uValueLine —
   the D13 line itself, a string), the serialised
   section contains neither rating key name, and every
   leaf of every construction block is a string or null,
   so no rating number rides inside the block in any
   form. The loader suite proves the other side: the
   loader source names neither rating key anywhere.
4. **The short bundle does not change.** Construction is
   report depth; the headline projection picks band,
   assessment label and line only. Proven by an identity
   test in the M6.25 pattern: the short bundle derived
   from an area bundle whose certificates carry
   construction blocks is deep-equal to the one derived
   without them, and the serialised short bundle contains
   neither "construction" nor "thermal transmittance".
   The short contract pins did not move.
5. **Contracts.** Three bundle-shape pins moved
   (area.rung1-rich, area.flag-on-no-match,
   area.tribunal-served — the pins whose bundles serve a
   certificate); all 46 pins stand, with the re-pin
   record in tests/bundle-contracts.test.ts. The
   contracts fake's Birkdale certificate now files
   construction so the block's shape is pinned.
6. **Census.** Row 80, area.epc.construction, hardness
   "hard": the U-value is a hard figure whose
   beside-figure line is the block's U-value line; the
   row's note records the basis line beside it, the
   verbatim rule, and that the element ratings are not
   filed. The census stands at 80 families / 47 hard.
   The census suite's golden certificate files
   Birkdale's construction so the fail-closed leaf walk
   and direction one exercise the registration; the
   descriptions' paths are registered figure patterns.
7. **Golden replay.** One new cell (the seventeenth):
   the construction blocks serve through the REAL loader
   and the real database source — Birkdale's SAP set
   with its U-value line, Exeter's disagreement with the
   2023 windows absence served as its own named line,
   Minerva's other-premises pair and the ampersand — and
   no element rating appears in any served certificate.
8. **Cache: unchanged, by the step's recorded design
   (D48).** The D29 area version vector carries the EPC
   artefact's own hash (lib/bundle-cache.ts, artefactHash
   over the "epc" key), so the first re-file that files
   construction — load-epc is a monthly loader, and the
   runner re-files every filed postcode — changes the
   hash and busts every stored area entry for the
   postcode. The brain always emits the construction key
   on a served certificate (the block, or null for a
   pre-widening artefact), so no served shape can lack
   the key once computed under this code. No shapeOk
   extension was made: unlike M6.25's nearby rule, the
   step text records the hash as the mechanism, and the
   evidence above is why it suffices.

## Goldens pinned

Computed from the filed fixture data through the real
code, and locked in tests/area-bundle.test.ts and the
replay's M6.26 cell:

1. **19 Birkdale Rise CM3 2JT** — walls "Average thermal
   transmittance 0.27 W/m²K", roofs 0.11, floors 0.15;
   windows "High performance glazing"; lighting "Low
   energy lighting in all fixed outlets"; main heating
   "Boiler and radiators, mains gas"; hot water "From
   main system, waste water heat recovery". Both pinned
   lines serve (the U-value line because the
   transmittance descriptions appear).
2. **6 Exeter Road E16 1GN** — two certificates,
   newest first, disagreeing whole. 2023 RdSAP: walls
   "Cavity wall, as built, insulated (assumed)", roofs
   "(another dwelling above)", floors "Solid, insulated
   (assumed)", windows not recorded on this certificate,
   lighting as Birkdale's, main heating and hot water
   "Community scheme"; no U-value line. 2013 SAP:
   transmittance 0.28 / 0.2 / 0.21, windows "Fully double
   glazed", hot water "Community scheme with CHP"; the
   U-value line serves.
3. **Flat 4, Minerva House KT17 1FH** — walls 0.18;
   roofs "(other premises above)"; floors "(other
   premises below)"; windows "High performance glazing";
   main heating "Boiler& underfloor, mains gas"; hot
   water "From main system". The U-value line serves.

## Naming honesty

Descriptions are served exactly as recorded, including
the register's own "&" in "Boiler& underfloor, mains
gas" — the register's ampersand is not escaped, spaced
or corrected anywhere in the filing or serving path, and
the goldens pin it in that form. Likewise "(assumed)"
and the parenthesised other-premises descriptions are
the register's words, served as its words, with the
basis line explaining the one marker a reader could
misread.

## Gate

- `npm run prepush` green before the push: format, lint,
  typecheck, tests and build in CI's order (counts in
  the build's closing report).
- CI and the practice runs for this push are read by the
  parent from the Actions page, as at every prior step.
