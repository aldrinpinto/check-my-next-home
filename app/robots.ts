import type { MetadataRoute } from "next";

import { SITE_URL, isProductionEnv } from "../lib/site";

// Required with the static-export build: the file is generated once at
// build time, when the environment name is read.
export const dynamic = "force-static";

// M2.11 — robots.txt generator (plan, SEO appendix card D). Play/test
// environments: nothing may be crawled — a third layer on top of the
// noindex page metadata and the X-Robots-Tag header (M2.7). Production:
// indexable pages are crawlable, the journey and utility route family
// is disallowed, and the sitemap is declared.
//
// M7.8 alignment: the disallow list now names the route family as it
// exists — /search (the picker and postcode results), /search/home
// (the results page), /search/failed, /report (the report door),
// /shortlist (the visitor's own saved homes), /kitchen-sink (the
// internal component gallery) and /api (the check endpoints) — each
// of which also carries explicit noindex metadata. It previously
// named /results, /checkout and /account, routes that have never
// existed.
//
// M7.13: /gift joins the set — the Check Together claim flow is
// reached only via the private gift link in a paid report's delivery
// email, and is never an indexed page.
//
// M8.8: /sample-report/print joins the set — the sample PDF's
// internal print view, noindexed in its own metadata and never
// a crawl destination. The sample page itself is not named
// here: its gate is its metadata and the sitemap, not this
// file.
//
// M9.11: /admin joins the set — the owner page sits behind
// the Access wall and is never a crawl destination either.
export default function robots(): MetadataRoute.Robots {
  if (!isProductionEnv()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/search",
        "/search/home",
        "/search/failed",
        "/report",
        "/shortlist",
        "/gift",
        "/sample-report/print",
        "/kitchen-sink",
        "/admin",
        "/api",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
