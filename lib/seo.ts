import type { Metadata } from "next";

import { SITE_NAME, SITE_URL, isProductionEnv } from "./site";

// M2.11 — technical SEO skeleton (plan, SEO appendix card D).
//
// The metadata helper: every page builds its metadata through
// pageMetadata() so each page gets its OWN title, description and
// canonical URL — there are deliberately no shared defaults that could
// duplicate across pages. Canonicals resolve against the canonical host
// (metadataBase), checkmynexthome.co.uk.
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string; // the page's own path, e.g. "/" or "/check/flood-risk"
}): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: path },
    // Play/test environments stay out of search engines (M2.7 — also
    // enforced by the X-Robots-Tag header in public/_headers). Only the
    // real site (environment name "production") is indexable.
    robots: isProductionEnv() ? undefined : { index: false, follow: false },
  };
}

// Structured data, sitewide (card D: "Structured data only where
// honest"). Organization + WebSite only, and only facts that are true
// today: no logo (not finalised), no search action (no live site search
// to point at yet). Rendered by app/JsonLd.tsx.
export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
} as const;

export const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  inLanguage: "en-GB",
} as const;
