import type { MetadataRoute } from "next";

import { SITE_URL, isProductionEnv } from "../lib/site";

// Required with the static-export build: the file is generated once at
// build time, when the environment name is read.
export const dynamic = "force-static";

// M2.11 — sitemap generator (plan, SEO appendix card D: "staging/test
// hosts are … never in the sitemap"; production lists indexable pages
// only). The environment name decides at build time: play/test builds
// produce an empty sitemap. As public pages are built, each is added
// here — a page only belongs on this list if it has a row on the SEO
// intent map (docs/seo-intent-map.md, M2.10).
export default function sitemap(): MetadataRoute.Sitemap {
  if (!isProductionEnv()) return [];
  return [{ url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 }];
}
