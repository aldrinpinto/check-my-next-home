import type { Metadata } from "next";

import SampleReportBody from "../../components/SampleReportBody";
import { getSampleReportView } from "../../lib/server/sample-report";
import { getSampleReportBody } from "../../lib/server/sample-report-html";
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
//
// BUG-219: the page stays force-dynamic — removing it
// would make Next statically generate the page at build
// time, and the build has no database (the view seam
// would live-generate and the build would fail). What
// changes is the body: when the bake has written the
// pre-rendered body (lib/server/sample-report-html.ts),
// the page serves it verbatim inside the same shell
// instead of re-rendering the whole document per hit.
// The layout, header, footer and head still render per
// hit, exactly as today — so the served document is
// identical either way, and the visual guard photographs
// the same page.
export const dynamic = "force-dynamic";

export default async function SampleReportPage() {
  const body = await getSampleReportBody();
  if (body !== null) {
    return (
      <main className="site-pages">
        <div className="site-pages__inner" dangerouslySetInnerHTML={{ __html: body }} />
      </main>
    );
  }
  const view = await getSampleReportView();
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <SampleReportBody view={view} />
      </div>
    </main>
  );
}
