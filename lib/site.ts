// The site's identity, in one place. Pages and tests both read from here,
// so the name and tagline can never drift apart.

export const SITE_NAME = "Check My Next Home";

// The decided tagline (D12, 13 Nov 2026; reconciled into the code
// at M6.10 under D38). The homepage title leads with it (lib/seo.ts,
// PAGE_SEO). Until M6.10 the code still carried the superseded M3
// family headline as a site-wide strapline while D12's tagline
// existed nowhere in the product — that drift is what this
// reconciliation closes.
export const SITE_TAGLINE = "Check the house. Choose the home.";

// The manifesto (D12): the hero kicker ONLY — never in the header,
// never in a title or a meta description.
export const SITE_MANIFESTO = "For the family who'll live there — not just the buyer.";

// The homepage hero headline (D44, founder ruling 16 Nov 2026;
// corrected at M7.2). The M3 family headline this constant used
// to carry was kept as hero copy by D38; D44 retired it from
// the hero entirely, and this correction is the retirement
// landing in the code — the M3 line survives nowhere in the
// product now. This line is homepage hero copy only: it is not
// a site-wide strapline, and nothing else may consume it.
export const HOME_HERO_HEADLINE = "You're not buying a house. You're choosing your family's home.";

// The homepage's meta description (M6.10, D38): descriptive voice
// with the as-published frame — what is checked and from what,
// never a mover-addressed question, never an outcome promise, and
// no figures (D38's snippet-risk lock: no figure in any title or
// meta, ever). PAGE_SEO in lib/seo.ts carries it as the homepage
// entry; this constant is its single source.
export const SITE_DESCRIPTION =
  "The checks to run before buying a home — schools, flooding, crime counts, sold prices, broadband and more, from one postcode. Official data as published, with its source and date.";

// The D9 short form — the disclaimer wording that sits beside the
// website results (D9: the full standing wording lives in the
// Terms and About the data pages and in every report's closing
// block; those surfaces are M8/M10 work). Written at M6.10 under
// D38 from D9's own opening words, verbatim, and pinned by exact
// test: M7 renders this string beside the results, it does not
// invent one. It never appears in a title or a meta — it is a
// beside-results frame, not a search promise.
export const DISCLAIMER_SHORT_FORM =
  "We present official data as it is published, with its source and date. We do not score, rate or recommend homes or areas.";

// The one canonical host (plan, SEO appendix card D): canonical tags,
// the sitemap and the structured data all point here. The .com domain
// and www 301-redirect to it (redirect set up in M1.3).
export const SITE_URL = "https://checkmynexthome.co.uk";

// The environment name drives the play-site behaviours (the TEST banner,
// the search-engine lockout, the sitemap). Only "production" is the real
// site; everything else — the play site, local builds — is a test
// environment. The setting is documented in .env.example.
export function isProductionEnv(
  env: string | undefined = process.env.NEXT_PUBLIC_SITE_ENV,
): boolean {
  return env === "production";
}

// M2.8 — the TEST banner. Every page on the play site carries this strip.
// It is tied to the environment name, never hand-edited per site: the
// banner shows on every environment EXCEPT the real one. The play site
// (and local builds) leave NEXT_PUBLIC_SITE_ENV unset or set to "play";
// the real server sets it to "production" at launch (M12/M13), which is
// the only value that hides the banner. The setting is documented in
// .env.example.
export const TEST_BANNER_TEXT = "TEST SITE — not the real service";

export function showTestBanner(
  env: string | undefined = process.env.NEXT_PUBLIC_SITE_ENV,
): boolean {
  return !isProductionEnv(env);
}

// M5.13 / decisions D15 + D18 — the company-ownership feature flag.
// The loader files HM Land Registry's CCOD/OCOD company-ownership
// datasets and the Companies House snapshots (migration 0016), but
// filing is preparation only: while this flag is false, nothing
// user-facing may read those tables or surface anything they hold.
// It defaults to false and stays false until BOTH gates open:
//   1. HM Land Registry Data Services' written answer on clause 3.2
//      of the CCOD/OCOD licence permits this use (a per-property
//      answer showing company facts only, the datasets' address text
//      never displayed); and
//   2. the founder's own go.
// If the written answer is no, the founder alone decides whether the
// feature is killed — it is never enabled, disabled or deleted on
// the assistant's initiative. The flag is deliberately a checked-in
// constant, not an environment variable: enabling it is a reviewed
// code change, visible in the commit history, never a runtime flip.
export const COMPANY_OWNERSHIP_ENABLED = false;

// INDUSTRIAL_SITES_ENABLED (plan step M6.32, decision D60):
// whether a detailed report's What's Nearby section serves
// the regulated industrial sites the Environment Agency's
// Pollution Inventory holds within two miles — the sites,
// their operators, their permit references, and the
// releases to air their operators reported for the latest
// filed year. Unlike company ownership above, this flag
// ships ON: the founder's ruling of 16 November 2026 is
// "serve it now — switch off if the EA objects", taken with
// the dataset's position in view (the EA Conditional Licence
// permits commercial and non-commercial exploitation "by
// including it in your own product or application"; the
// dataset page's Special Conditions speak of internal or
// personal use and a one-year permitted-use period, and the
// Agency's written answer to the project's direct question
// — asked 16 November 2026, answered with a pointer the
// same day, followed up the same day — is outstanding).
// The serving it gates was designed for the flip: while the
// flag is off the bundle's industrialSites key is ABSENT
// entirely (the D32 pattern — a consumer cannot tell
// whether the data is filed, unfiled or switched off), the
// filed data stays in place unserved, and the bundle cache
// needs NO purge — its shape rule holds the flag's state
// and the bundle's key in agreement, so a flip simply
// rebuilds on the next check (proven by the flip drill in
// tests/industrial-sites.test.ts). An EA objection in any
// form flips this constant off immediately; it is never
// flipped back on the assistant's initiative — re-enabling
// takes the founder's word plus the Agency's written
// clearance. If the Agency's answer ever requires the filed
// data itself to go, the deletion path is
// deletePollutionInventory in
// loaders/load-pollution-inventory.mjs plus removing the
// loader from the runner's schedule, in the same commit
// (docs/backend-m6.32.md).
export const INDUSTRIAL_SITES_ENABLED = true;
