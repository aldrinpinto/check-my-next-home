import { sampleReportPdfContentDisposition } from "../../lib/report-pdf";
import { generateSampleReportPdf } from "../../lib/server/sample-pdf";
import { SAMPLE_REPORT_INDEXABLE } from "../../lib/seo";

// M8.8 — the sample report's PDF download
// (lib/report-pdf.ts's SAMPLE_REPORT_PDF_PATH,
// "/sample-report.pdf"), linked from the sample page
// itself. The file is printed on first request from the
// app's own print view of the sample page (lib/server/
// sample-pdf.ts) and cached in memory: it is the same
// document for every visitor, so nothing per-request is
// derived, stored or signed — the sample is public by
// design, and the only public report file there is.
//
// The file follows the sample's go-live gate like the
// page and the sitemap do: while SAMPLE_REPORT_INDEXABLE
// is false the response carries X-Robots-Tag: noindex,
// so the downloadable copy stays as unindexed as the
// page until the one flip at go-live.
export async function GET() {
  const { bytes } = await generateSampleReportPdf();
  const headers = new Headers({
    "content-type": "application/pdf",
    "content-disposition": sampleReportPdfContentDisposition(),
  });
  if (!SAMPLE_REPORT_INDEXABLE) headers.set("x-robots-tag", "noindex");
  return new Response(Buffer.from(bytes), { headers });
}
