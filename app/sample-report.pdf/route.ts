import { sampleReportPdfContentDisposition } from "../../lib/report-pdf";
import { readBakedSampleReportPdf } from "../../lib/server/sample-pdf-baked";
import { SAMPLE_REPORT_INDEXABLE } from "../../lib/seo";

// M8.8 — the sample report's PDF download
// (lib/report-pdf.ts's SAMPLE_REPORT_PDF_PATH,
// "/sample-report.pdf"), linked from the sample page
// itself. The file is printed ONCE per deploy, host-side,
// by scripts/bake-sample-report-pdf.ts — the same print
// view, the same document, marked SAMPLE on its cover —
// and this route serves that baked file
// (lib/server/sample-pdf-baked.ts). It is the same
// document for every visitor, so nothing per-request is
// derived, stored or signed — the sample is public by
// design, and the only public report file there is.
//
// BUG-270: the route used to print on first request
// from the app's own print view (lib/server/
// sample-pdf.ts), which needs a Chromium beside the
// app — and the app container has none (OBS-011), so
// every click failed with an empty 500 and Chrome
// showed "Site wasn't available". The route no longer
// prints at all: if the baked file is missing (the
// print step has not run yet, or the deploy is
// mid-flight), it answers 503 in plain text — never a
// live print, never an empty failure. OBS-011 stays
// open for the M9 in-container purchase-trigger path.
//
// The file follows the sample's go-live gate like the
// page and the sitemap do: while SAMPLE_REPORT_INDEXABLE
// is false the response carries X-Robots-Tag: noindex,
// so the downloadable copy stays as unindexed as the
// page until the one flip at go-live.
export async function GET() {
  const bytes = await readBakedSampleReportPdf();
  if (!bytes) {
    return new Response(
      "The sample report PDF is not baked yet — it is printed once per deploy, after the app answers; try again in a moment.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  const headers = new Headers({
    "content-type": "application/pdf",
    "content-disposition": sampleReportPdfContentDisposition(),
  });
  if (!SAMPLE_REPORT_INDEXABLE) headers.set("x-robots-tag", "noindex");
  return new Response(Buffer.from(bytes), { headers });
}
