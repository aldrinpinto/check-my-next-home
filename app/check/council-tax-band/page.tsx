import type { Metadata } from "next";

import { CheckPageView } from "../../../components/ContentPage";
import { CHECK_PAGES } from "../../../lib/check-pages";
import { PAGE_SEO, pageMetadata } from "../../../lib/seo";

// M7.8 — the /check/council-tax-band landing page: one of the SEO landing
// pages, rendered by the shared content-page template from
// its locked copy constant (lib/check-pages.ts) and its
// locked title/description pair (lib/seo.ts, consumed here
// — never re-written per page).
export const metadata: Metadata = pageMetadata({
  ...PAGE_SEO["/check/council-tax-band"],
  path: "/check/council-tax-band",
});

export default function CouncilTaxBandCheckPage() {
  return <CheckPageView page={CHECK_PAGES["/check/council-tax-band"]} />;
}
