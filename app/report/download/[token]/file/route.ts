// GET /report/download/<token>/file — the stored
// report PDF itself (plan step M8.6, Key K16).
//
// The landing page redirects a genuine, in-date link
// here; this route verifies again (verification is
// stateless, so the second check costs no read) and
// serves the STORED file through the storage seam —
// the exact bytes generation stored, never a
// regeneration (lib/server/report-storage.ts) — under
// the file name the delivery record carries, which is
// the name generation gave it (lib/report-pdf.ts's
// reportPdfFileName).
//
// Anything else lands back on the landing page, which
// serves the state that stands: an expired link its
// expired card, a link that is not genuine the error
// page. A genuine link whose delivery or file cannot
// be found is a store failure, not a visitor state —
// the bytes were stored before the link was minted —
// so it answers a plain 404 rather than inventing a
// face for it; it cannot occur while the shelf and
// the store agree.

import { downloadContentDisposition, downloadPath } from "../../../../../lib/download";
import { getDbPool } from "../../../../../lib/server/db";
import { getDownloadSigner } from "../../../../../lib/server/download-links";
import { redirectRelative } from "../../../../../lib/server/public-url";
import { createDbDeliveryStore } from "../../../../../lib/server/report-deliveries";
import { getReportPdfStore } from "../../../../../lib/server/report-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const signer = getDownloadSigner();
  const verification = signer?.verify(token, new Date()) ?? { kind: "invalid" as const };
  if (verification.kind !== "ok") return redirectRelative(downloadPath(token));

  const deliveries = createDbDeliveryStore(getDbPool());
  const delivery = await deliveries.getById(verification.deliveryId);
  if (!delivery) return new Response("Not found", { status: 404 });
  const bytes = await getReportPdfStore().get(delivery.pdfKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": downloadContentDisposition(delivery.fileName),
      // A private document behind an un-guessable link:
      // no search engine is ever invited to it.
      "x-robots-tag": "noindex",
    },
  });
}
