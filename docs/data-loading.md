# Where the data lives — filed, live, and handed off

A home check reads almost everything from our own database. Data reaches
that database four ways: filed in bulk ahead of time, filed the first time
a postcode is checked, fetched live at the moment of the check (one item
only), or not held at all (handed off to the official source). A fifth
thing happens at check time — arithmetic on filed data (medians,
percentages, band tables, the per-head crime figure) — which is
calculation, not a data source. Computed answers are also cached per
postcode and refreshed whenever a loader files new data.

Cadences below are as registered in the loader schedule
(`LOADER_SCHEDULE` in `loaders/run-loaders.mjs`, 45 loaders) on
18 November 2026.

## 1. Held in our database, filed in bulk ahead of time

### Refreshed monthly

| Dataset                                      | Source                      | Notes                                                                                                                                                                                                                                                 |
| -------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sold prices                                  | HM Land Registry Price Paid | Also loads on first touch (Section 2)                                                                                                                                                                                                                 |
| Crime counts around a postcode               | Police.uk                   | Also loads on first touch (Section 2)                                                                                                                                                                                                                 |
| England crime totals (the comparison figure) | Police.uk monthly archives  | Filed one row per month, never overwritten                                                                                                                                                                                                            |
| Energy certificates (EPC)                    | The EPC register            | Also loads on first touch (Section 2)                                                                                                                                                                                                                 |
| Schools                                      | Department for Education    |                                                                                                                                                                                                                                                       |
| Health — GP surgeries and hospitals          | NHS sources                 |                                                                                                                                                                                                                                                       |
| EV chargers                                  | Open Charge Map             |                                                                                                                                                                                                                                                       |
| Claimant Count                               | DWP, via Nomis              |                                                                                                                                                                                                                                                       |
| Universal Credit — people and households     | DWP Stat-Xplore             | The data itself publishes quarterly; the loader checks monthly                                                                                                                                                                                        |
| Company ownership titles                     | HM Land Registry            | Held behind an off switch until written licence clearance arrives                                                                                                                                                                                     |
| Picking index — sales address parts          | HM Land Registry Price Paid | Address parts only (postcode, PAON, SAON, street, town), streamed from the complete file in a monthly full re-extract; the picker's identity index (plan step M7.15B) — never evidence, and `price_paid` itself is NOT filled nationally by this pass |

### Refreshed quarterly

| Dataset                                                                                                                      | Source                                                  | Notes                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Postcode directory                                                                                                           | ONS (ONSPD)                                             | The address backbone every other dataset joins to                                                                                                                        |
| Nurseries                                                                                                                    | Ofsted childcare register                               | Group settings only; childminders not included — Ofsted publishes no location for them                                                                                   |
| Conservation areas and Article 4 directions                                                                                  | planning.data.gov.uk                                    |                                                                                                                                                                          |
| Green belt                                                                                                                   | planning.data.gov.uk                                    |                                                                                                                                                                          |
| Heritage — listed buildings, scheduled monuments, world heritage sites, battlefields, protected wreck sites and buffer zones | planning.data.gov.uk / Historic England                 |                                                                                                                                                                          |
| Brownfield sites, and which councils publish them                                                                            | planning.data.gov.uk                                    | "None found" is only ever said for a council that actually publishes                                                                                                     |
| Air Quality Management Areas                                                                                                 | Defra UK-AIR                                            | UK-wide declared areas; the dataset edition date is the served date — the file carries no per-area dates                                                                 |
| Charging zones — Clean Air Zones, the London ULEZ and the Scottish Low Emission Zones                                        | The zone operators                                      | Boundaries and register facts only; charging amounts are never held. A scheme with no published boundary (Portsmouth) files nothing and is named as a gap                |
| Nature designations — SSSI, SAC, SPA, Ramsar sites, ancient woodland                                                         | Natural England                                         |                                                                                                                                                                          |
| Flood zones (rivers and sea, ignoring defences)                                                                              | Environment Agency                                      |                                                                                                                                                                          |
| Flood risk from rivers and sea (with defences)                                                                               | Environment Agency                                      |                                                                                                                                                                          |
| Flood risk from surface water                                                                                                | Environment Agency                                      |                                                                                                                                                                          |
| Recorded flood defences                                                                                                      | Environment Agency (AIMS register)                      | The defences themselves, as recorded — maintainer category and condition as filed                                                                                        |
| Transport stops                                                                                                              | NaPTAN                                                  |                                                                                                                                                                          |
| What's Nearby places                                                                                                         | OpenStreetMap                                           |                                                                                                                                                                          |
| Street lines (the flood maps' streets)                                                                                       | OpenStreetMap                                           | Filed nationally for England & Wales at M8.3 (preponed from M12); the flood maps draw over these lines only                                                              |
| Parks and greenspace                                                                                                         | OS Greenspace                                           |                                                                                                                                                                          |
| Building-safety tribunal decisions                                                                                           | GOV.UK tribunal decisions                               |                                                                                                                                                                          |
| School destinations — where leavers went next                                                                                | Department for Education (Explore Education Statistics) | Latest cohort per school and stage (KS4 and 16 to 19); the October Provisional edition is superseded by the spring Revised; 16-plus providers are filed but never served |

### Filed once (static — re-filed only when the publisher issues a new edition)

| Dataset                            | Source                                 | Notes                                                                                                                       |
| ---------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Built-up areas                     | ONS, December 2024 edition             |                                                                                                                             |
| Census 2021 tables                 | ONS, via Nomis                         |                                                                                                                             |
| Small-area population bases        | ONS Census 2021                        | The residents and households figures other answers divide by                                                                |
| Council tax charges                | MHCLG                                  | Filed per tax year; the councils not yet filed arrive in a spring pass                                                      |
| Deprivation deciles                | MHCLG (Indices of Deprivation 2025)    | Served as a decile in words, never a score                                                                                  |
| Air quality modelled grid          | Defra (PCM 2024)                       |                                                                                                                             |
| Industrial sites                   | Environment Agency Pollution Inventory | Annual register (the 2024 vintage published Nov 2025); England only; served behind a flag that an EA objection switches off |
| Solar potential grid               | PVGIS (SARAH3)                         | A location model, never a judgement on a roof                                                                               |
| Broadband availability by postcode | Ofcom Connected Nations                |                                                                                                                             |
| Mobile coverage by council         | Ofcom Connected Nations                | Council-wide modelled coverage, never signal at the home                                                                    |

### Run by hand only (never on the automatic timer — the first pass takes hours)

| Dataset                                       | Source           | Notes                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Noise maps — road, rail and airport           | Defra            |                                                                                                                                                                                                                                                                                |
| Priority habitats inventory                   | Natural England  | 818,225 habitat patches                                                                                                                                                                                                                                                        |
| Picking index — EPC certificate address parts | The EPC register | The register's bulk domestic file sits behind its own sign-in, so the founder downloads it and the pass is run by hand, monthly (plan step M7.15B). Certificate addresses only, under a strict parser; held in their own extract, removable as one operation (the kill switch) |

## 2. Filed on first touch, then held

Crime counts, energy certificates, and sold prices. The first time anyone
checks a postcode nobody has checked before, the check itself loads just
that postcode and files the result; every later check reads the filed
copy, which the monthly cycle then keeps fresh. This exists because
filing these for all 1.8 million postcodes on day one is not practical.
The picking index (Section 1, plan step M7.15B) does not change this: it
holds address parts for picking only, and a postcode's first check still
files its evidence exactly as before.

## 3. Pulled live at the moment of the check, never stored

| Item                | Source                                      | Notes                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live flood warnings | Environment Agency flood-monitoring service | Fetched fresh on every check, shown first in the flood answer, in the Agency's own words; if the fetch fails, the check answers from the filed flood maps alone and says so. Nothing about a warning is ever written to the database. |

## 4. Never held and never pulled — handed off

| Item                             | What the user gets instead                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Planning applications            | A link to the GOV.UK register of planning decisions — no national dataset exists to file                                |
| The building-safety register     | A link to the official register lookup — the register cannot be downloaded, by design                                   |
| This home's own council tax band | No per-home data exists anywhere; we serve the council's full band scale instead and the family reads their band off it |

## When the loading happens

1. **Build stage (now):** the database holds test-scale filings only —
   the golden homes and fixture areas the tests prove against.
2. **First national fill (deployment, plan step M12):** when the server
   is set up, the timers are installed and every bulk dataset is filed
   nationally in one pass; the two hand-run datasets and the solar
   sampling run as supervised first passes, because they take hours.
   The M7.15B picking index does NOT discharge this step's promise: it
   is a parts-only index for picking, and the national filing of the
   full datasets themselves — `price_paid` included — still happens
   here, as described.
3. **Steady state:** a monthly run files whatever has fallen due
   (monthly datasets after about 25 days, quarterly after about 70
   days, one-off datasets once); on the 15th of each month a canary
   checks that every source is still publishing in the same shape and
   emails an alert if one has moved or stopped; first-touch loads fill
   any remaining postcode gaps on demand.
