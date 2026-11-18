import type { MetadataRoute } from "next";

import { PAGE_SEO } from "../lib/seo";
import { SITE_URL, isProductionEnv } from "../lib/site";

// Required with the static-export build: the file is generated once at
// build time, when the environment name is read.
export const dynamic = "force-static";

// M2.11 — sitemap generator (plan, SEO appendix card D: "staging/test
// hosts are … never in the sitemap"; production lists indexable pages
// only). The environment name decides at build time: play/test builds
// produce an empty sitemap.
//
// Completed at M7.8: the rule is that a page belongs here only if it
// is an indexable page — a row of the SEO intent map
// (docs/seo-intent-map.md) or one of the trust and chrome pages whose
// pairs PAGE_SEO locks. M7.8 made PAGE_SEO exactly that set (the
// homepage, the /check/ landing pages, the launch guides, the trust
// and chrome pages), so the sitemap is the record's keys, in its
// order, homepage first. The journey routes (/search, /search/home,
// /search/failed, /report, /shortlist) and /kitchen-sink are never
// here: noindex by metadata and declared non-indexable (M7.8).
export default function sitemap(): MetadataRoute.Sitemap {
  if (!isProductionEnv()) return [];
  return Object.keys(PAGE_SEO).map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.8,
  }));
}
