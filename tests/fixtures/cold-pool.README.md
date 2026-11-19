# Cold pool fixture (cold-check fix stack, 19 Nov 2026)

`cold-pool.json` is the E2E harness's pool of COLD
targets: real UK postcodes the test app holds in its
directory and picking layers — `postcode_cache`,
`picking_index`, `picking_streets`, `picking_places` —
with NO brain data filed for any of them (no sales, no
crime artefact, no EPC, no load stamp). A first check
on one is a genuine first check: the sold-prices brain
cold-loads it (in the harness, from the small fixture
Price Paid file — see e2e/serve-e2e.mjs), crime
cold-loads it, and every other section serves its
not-filed state. e2e/cold.e2e.ts draws its cases from
this pool with a seeded random pick per run.

Provenance: the postcodes, street names, house names
and coordinates are real, drawn from the repo's own
evidenced data — the OSM address fixtures
(tests/fixtures/osm-places: captured addresses for
Cardiff, London, the Surrey fringe, Oxford, the
Hilgay/Diss area and Chelmsford), the ONSPD fixture
excerpts (tests/fixtures/onspd), the golden directory
rows, and db/prove.mjs's Scotland witness (EH9 9ZZ).
Golden postcodes and golden districts are excluded, so
the pool can never shadow a golden assertion. The
directory rows' LSOA/MSOA/council/ward fields are a
declared fixture pairing — the geographically nearest
golden row's codes for the same town or outward area —
because no assertion reads them back: the behavioural
specs assert states, never values. Regenerate by
re-running the assembly over those sources; the file
is data, not code.

Contents at filing: 177 directory postcodes across 40
districts (London, Surrey, Oxfordshire, Essex,
Cambridgeshire/Norfolk/Suffolk, Cardiff and Penarth,
plus one Scotland and one Northern Ireland postcode),
628 picking homes (153 of them house-name entries with
no street number), 191 streets — Montfichet Road,
London spans nine of the pool's postcodes — and 22
place rows over 13 towns (Cardiff over five districts,
Oxford over four, and eleven further towns).

The seed (scripts/seed-golden.mjs) files the pool ONLY
when E2E_COLD_POOL=1 — playwright.config.ts sets it for
every harness run — so a play-server seed never sees
it. Every insert is conflict-guarded: a pool row that
meets a golden row leaves the golden row standing.
