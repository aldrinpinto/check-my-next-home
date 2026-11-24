import BreadcrumbLd from "./BreadcrumbLd";
import SampleReportDocument from "./SampleReportDocument";
import type { ReportView } from "../lib/report";
import { SAMPLE_REPORT_PDF_PATH } from "../lib/report-pdf";

// BUG-219: the sample page's body — the children of
// div.site-pages__inner in app/sample-report/page.tsx,
// shared by the live render and the baked-HTML render so
// the two can never drift: the bake renders this exact
// fragment once per deploy (lib/server/sample-report-html.ts)
// and the page serves it verbatim. The fragment is a pure
// function of the view — no headers, cookies or search
// params — so a pre-rendered copy is identical to the
// live one, byte for byte (pinned in
// tests/sample-report-baked.test.ts).
export default function SampleReportBody({ view }: { view: ReportView }) {
  return (
    <>
      <BreadcrumbLd name="Sample report" path="/sample-report" />
      <SampleReportDocument view={view} />
      <p className="sample-download">
        Prefer it as one file?{" "}
        <a href={SAMPLE_REPORT_PDF_PATH} download>
          Download this sample report as a PDF
        </a>{" "}
        — the same document, marked SAMPLE on its cover.
      </p>
    </>
  );
}
