import type { ReportView } from "../lib/report";
import ReportPage from "./ReportPage";

// BUG-159: the sample report's document — the generated,
// anonymised report view (lib/server/sample-report.ts)
// wearing the sample's banner and watermark. The hand-built
// sample document this replaces is retired: every block
// below the banner is the report builder's own output.
export const SAMPLE_BANNER_LINE =
  "This is a sample report, so you can see exactly what a detailed report looks like before you ever pay for one. The home in this sample is an invented example — its facts are drawn from real checks of real homes, combined section by section and anonymised — and the document below follows the format every detailed report follows.";

export default function SampleReportDocument({
  view,
  // Passed through to ReportPage: the print document
  // (SampleReportPrintDocument) renders for the PDF, so
  // the check-another box is left out there.
  forPdf = false,
}: {
  view: ReportView;
  forPdf?: boolean;
}) {
  return (
    <div className="sample-report-doc">
      <div className="watermark" aria-hidden="true">
        <span style={{ top: "2%", left: "-4%" }}>SAMPLE</span>
        <span style={{ top: "16%", left: "38%" }}>SAMPLE</span>
        <span style={{ top: "30%", left: "-8%" }}>SAMPLE</span>
        <span style={{ top: "44%", left: "34%" }}>SAMPLE</span>
        <span style={{ top: "58%", left: "-4%" }}>SAMPLE</span>
        <span style={{ top: "72%", left: "38%" }}>SAMPLE</span>
        <span style={{ top: "86%", left: "-8%" }}>SAMPLE</span>
        <span style={{ top: "98%", left: "34%" }}>SAMPLE</span>
      </div>
      <div className="sample-banner">
        <span className="sample-pill">SAMPLE</span>
        <p>{SAMPLE_BANNER_LINE}</p>
      </div>
      <ReportPage view={view} forPdf={forPdf} />
    </div>
  );
}
