# Universal Credit fixture (plan step M5.16) — SYNTHETIC

**These two JSON files are hand-built, not captured.** They
exist so the UC loader's parser, golden checks and filing
path can be exercised end-to-end in CI while the live pull
is blocked — and they must be replaced by real captures the
moment the block lifts.

Why synthetic: the K22 Stat-Xplore key is refused
account-side at DWP (HTTP 401 AUTHENTICATION on every
documented presentation, including a brand-new reset key,
13 Nov 2026), so no real Stat-Xplore response exists to
capture. The loader's one remaining step is the
PENDING_FIRST_PULL named in `loaders/load-dwp-uc.mjs`.

What the files are: one `/table` response per UC series
(`uc-people-table.json` for UC_Monthly, `uc-households-table.json`
for UC_Households), written in the API's DOCUMENTED
response shape — a `fields` array (a date field and a
geography field, each with `items`) and a `cells` array
whose `coordinates` index into those items — covering the
three golden LSOAs at one illustrative month each (people
May 2026, the prep's measured latest people month;
households April 2026, illustrating that the households
series runs behind). **The counts (300 / 2,400 / 410 and
140 / 1,050 / 190) are invented round numbers for shape
testing only — they are not DWP figures, must never be
quoted as such, and assert nothing in the golden checks
beyond presence and sanity.** The real golden values are
locked by the first keyed verify-only pull, at which point
this fixture is re-cut from that pull's real responses.
