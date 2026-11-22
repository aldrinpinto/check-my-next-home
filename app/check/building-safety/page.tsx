import type { Metadata } from "next";

import { CheckPageView } from "../../../components/ContentPage";
import { CHECK_PAGES } from "../../../lib/check-pages";
import { PAGE_SEO, pageMetadata } from "../../../lib/seo";

// The /check/building-safety landing page (follow-up
// stack, BUG-128): rendered by the shared content-page
// template from its locked copy constant
// (lib/check-pages.ts) and its locked title/description
// pair (lib/seo.ts, consumed here — never re-written
// per page). The page carries the building-safety
// block's full explanation, which the report itself no
// longer prints at length.
export const metadata: Metadata = pageMetadata({
  ...PAGE_SEO["/check/building-safety"],
  path: "/check/building-safety",
});

export default function BuildingSafetyCheckPage() {
  return <CheckPageView page={CHECK_PAGES["/check/building-safety"]} />;
}
