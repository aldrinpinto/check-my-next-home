import type { Metadata } from "next";

import { GuidesHubView } from "../../components/ContentPage";
import { PAGE_SEO, pageMetadata } from "../../lib/seo";

// 18 Nov 2026 — the /guides hub: a simple index of the
// three guides, created by the founder's ruling of 18 Nov
// as the destination of the footer's new Guides link
// (footer only — the header carries no Guides, and no
// individual guide is linked from the chrome). Rendered by
// the shared content-page template from the GUIDES record
// (lib/check-pages.ts) and its locked pair (lib/seo.ts);
// the sitemap derives from PAGE_SEO, so the hub is listed
// by construction.
export const metadata: Metadata = pageMetadata({
  ...PAGE_SEO["/guides"],
  path: "/guides",
});

export default function GuidesHubPage() {
  return <GuidesHubView />;
}
