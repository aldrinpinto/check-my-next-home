import type { Metadata } from "next";

import { GuidePageView } from "../../../components/ContentPage";
import { GUIDES } from "../../../lib/check-pages";
import { PAGE_SEO, pageMetadata } from "../../../lib/seo";

// M7.8 — the /guides/buying-a-leasehold-flat guide: an SEO lander, reached from the
// check pages' internal links and the sitemap (the guides
// sit in no header, and in the footer only through the
// /guides hub link — the founder's ruling of 18 Nov 2026,
// superseding the M7.8 landers-only ruling for the footer).
// Rendered by the shared content-page template from its
// locked copy constant (lib/check-pages.ts) and its locked
// pair (lib/seo.ts).
export const metadata: Metadata = pageMetadata({
  ...PAGE_SEO["/guides/buying-a-leasehold-flat"],
  path: "/guides/buying-a-leasehold-flat",
});

export default function LeaseholdFlatGuidePage() {
  return <GuidePageView guide={GUIDES["/guides/buying-a-leasehold-flat"]} />;
}
