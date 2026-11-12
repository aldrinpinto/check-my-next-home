import type { MetadataRoute } from "next";

import { SITE_URL, isProductionEnv } from "../lib/site";

// Required with the static-export build: the file is generated once at
// build time, when the environment name is read.
export const dynamic = "force-static";

// M2.11 — robots.txt generator (plan, SEO appendix card D). Play/test
// environments: nothing may be crawled — a third layer on top of the
// noindex page metadata and the X-Robots-Tag header (M2.7). Production:
// indexable pages are crawlable, the results/checkout/account paths are
// disallowed, and the sitemap is declared.
export default function robots(): MetadataRoute.Robots {
  if (!isProductionEnv()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/results", "/checkout", "/account"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
