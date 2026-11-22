import type { Metadata } from "next";

import BreadcrumbLd from "../../components/BreadcrumbLd";
import SampleReportDocument from "../../components/SampleReportDocument";
import { getSampleReportView } from "../../lib/server/sample-report";
import { SAMPLE_REPORT_PDF_PATH } from "../../lib/report-pdf";
import { PAGE_SEO, pageMetadata, SAMPLE_REPORT_INDEXABLE } from "../../lib/seo";

// M7.8 — the Sample report (Final Sample Master view 7):
// the detailed report's web preview the header and footer
// already link.
//
// BUG-159 — the sample stops being hand-built: the
// document is the REAL generated report, assembled per
// section from the golden homes' served bundles and
// anonymised (lib/server/sample-report.ts), rendered by
// the report's own page component. What a visitor reads
// here is the product's own output wearing the fiction
// home's identity.
//
// M8.8 — the sample as an SEO asset: the locked pair now
// carries the example intent (lib/seo.ts), and the page's
// indexability reads the step's one gate
// (SAMPLE_REPORT_INDEXABLE): while the gate is shut the
// robots lock is passed explicitly, so the page stays
// noindexed in EVERY environment — the production name
// included, where the environment rule alone would
// otherwise open it. The flip at go-live is that one
// constant. Under the document stands its PDF download
// line: the same document as one file
// (SAMPLE_REPORT_PDF_PATH), printed from the sample's
// own print view (app/sample-report/print) with the
// SAMPLE marking on its cover.
export const metadata: Metadata = pageMetadata({
  ...PAGE_SEO["/sample-report"],
  path: "/sample-report",
  noindex: !SAMPLE_REPORT_INDEXABLE,
});

// The sample is generated from the filed data at request
// time (cached per process by its seam), like the bought
// report's own view.
export const dynamic = "force-dynamic";

export default async function SampleReportPage() {
  const view = await getSampleReportView();
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <BreadcrumbLd name="Sample report" path="/sample-report" />
        <SampleReportDocument view={view} />
        <p className="sample-download">
          Prefer it as one file?{" "}
          <a href={SAMPLE_REPORT_PDF_PATH} download>
            Download this sample report as a PDF
          </a>{" "}
          — the same document, marked SAMPLE on its cover.
        </p>
      </div>
    </main>
  );
}
