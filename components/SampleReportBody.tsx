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
// function of the view and forPdf — no headers, cookies or
// search params — so a pre-rendered copy is identical to
// the live one in the same forPdf form, byte for byte
// (pinned in tests/sample-report-baked.test.ts).
//
// BUG-364: forPdf exists so the baked body can leave the
// check-another-home box out — the box is interactive
// (PostcodeBox), and a box baked into static HTML never
// hydrates, so typing in it searches nothing. The page
// renders the live box itself, after the body, in both
// branches; the print document passes forPdf through
// SampleReportDocument and never sees the box either way.
export default function SampleReportBody({
  view,
  // Passed through to SampleReportDocument: the bake and
  // the page's live branch both render forPdf, so the box
  // lives only in the page's live slot below the body.
  forPdf = false,
}: {
  view: ReportView;
  forPdf?: boolean;
}) {
  return (
    <>
      <BreadcrumbLd name="Sample report" path="/sample-report" />
      <SampleReportDocument view={view} forPdf={forPdf} />
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
