import type { Metadata } from "next";

import SampleReportPrintDocument from "../../../components/SampleReportPrintDocument";
import { getSampleReportView } from "../../../lib/server/sample-report";
import { pageMetadata } from "../../../lib/seo";

// The sample report's print view (plan step M8.8;
// BUG-159): the composition the sample PDF is printed
// from — the sample cover (lib/report-pdf.ts's
// sampleReportPdfCover: the SAMPLE marking, the name and
// tagline paired, the example home, the invented-example
// line) followed by the generated, anonymised sample
// document (components/SampleReportPrintDocument.tsx).
//
// It exists as a page, not a string built in a route
// handler, because the app's route graphs cannot render
// markup to a string (Next/Turbopack bans react-dom/
// server there) — composition belongs to a Server
// Component, and lib/server/sample-pdf.ts prints THIS
// page with Chromium, over the app's own loopback
// address. The cover is print furniture: the stylesheet
// holds .rpt-cover back on screen and shows it only
// under @media print, exactly as the bought reports'
// cover behaves inside ReportPage.
//
// Internal by construction: noindex in every
// environment (the metadata below), disallowed in the
// production robots file, unlinked from every surface,
// and absent from PAGE_SEO and the sitemap. What it
// shows is only the fiction home's anonymised sample.
export const metadata: Metadata = pageMetadata({
  title: "Sample report — print view | Check My Next Home",
  description: "The sample report's print view — the composition its PDF is printed from.",
  path: "/sample-report/print",
  noindex: true,
});

export const dynamic = "force-dynamic";

export default async function SampleReportPrintPage() {
  const view = await getSampleReportView();
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <SampleReportPrintDocument view={view} />
      </div>
    </main>
  );
}
