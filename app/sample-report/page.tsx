import type { Metadata } from "next";

import BreadcrumbLd from "../../components/BreadcrumbLd";
import SampleReport from "../../components/SampleReport";
import { PAGE_SEO, pageMetadata } from "../../lib/seo";

// M7.8 — the Sample report (Final Sample Master view 7):
// the detailed report's web preview the header and footer
// already link. The document itself is
// components/SampleReport.tsx, transcribed from the
// finalised sample; its locked pair is newly locked at
// /sample-report under the adopted scope ruling.
export const metadata: Metadata = pageMetadata({
  ...PAGE_SEO["/sample-report"],
  path: "/sample-report",
});

export default function SampleReportPage() {
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <BreadcrumbLd name="Sample report" path="/sample-report" />
        <SampleReport />
      </div>
    </main>
  );
}
