import { sampleReportPdfCover } from "../lib/report-pdf";
import type { ReportView } from "../lib/report";
import SampleReportDocument from "./SampleReportDocument";

// BUG-159: the sample PDF's print composition — the SAMPLE
// cover (lib/report-pdf.ts) followed by the generated,
// anonymised sample document. The composition is a plain
// component taking the view, so tests render the exact
// composition the PDF is printed from; the route
// (app/sample-report/print) resolves the view and renders
// this. The wrapper's class suppresses the report view's
// own print cover (the SAMPLE cover stands in its place —
// see app/globals.css).
export default function SampleReportPrintDocument({ view }: { view: ReportView }) {
  const cover = sampleReportPdfCover();
  return (
    <div className="sample-print-doc">
      <div className="rpt-cover">
        <span className="sample-pill">{cover.mark}</span>
        <p className="rpt-brand">{cover.brandLine}</p>
        <p className="rpt-cover-tag">{cover.taglineLine}</p>
        <h1>{cover.title}</h1>
        <p className="rpt-addr">{cover.addressLine}</p>
        <p className="rpt-cover-date">{cover.exampleLine}</p>
      </div>
      <SampleReportDocument view={view} />
    </div>
  );
}
