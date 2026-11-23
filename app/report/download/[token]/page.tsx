import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  DownloadExpiredCard,
  DownloadPageShell,
  DownloadRefundedCard,
  DownloadSentCard,
} from "../../../../components/DownloadLinkPage";
import { downloadFilePath, downloadLandingView } from "../../../../lib/download";
import { pageMetadata } from "../../../../lib/seo";
import { getDbPool } from "../../../../lib/server/db";
import { getDownloadSigner } from "../../../../lib/server/download-links";
import { createDbDeliveryStore } from "../../../../lib/server/report-deliveries";

// The download link's landing page (plan step M8.6,
// Key K16) — the URL every delivery and re-issue email
// carries. It serves by the link's verified state,
// always (lib/download.ts's downloadLandingView):
//
//   genuine, in date  → straight to the file route:
//                       the PDF opens in the browser,
//                       as the email promises.
//   genuine, expired  → the expired card (Master view
//                       32) with the re-issue form; or,
//                       after a re-issue request
//                       (?sent=1), the uniform sent
//                       card (view 33) over the same
//                       form.
//   not genuine       → the site's plain error page
//                       (view 35), via notFound — the
//                       same face as an unmatched
//                       route, confirming nothing: a
//                       made-up link, a mistyped one
//                       and a tampered one get exactly
//                       the same answer.
//   genuine, but the
//   delivery stands
//   WITHDRAWN (M9.8)  → the refunded card, in date or
//                       expired alike: the order was
//                       refunded in full, so the link
//                       is closed — never the file, and
//                       never the expired card, whose
//                       re-issue form would promise a
//                       recovery that must not happen.
//
// Verification is stateless (the signature carries the
// expiry). A link that is not genuine still spends no
// database read at all; a genuine one now spends one —
// the delivery read that carries the withdrawn
// standing (M9.8). Journey-page conventions: explicit
// noindex metadata in every environment (the M7.8
// pattern — the route family already stands in the
// robots disallow set under /report), no sitemap
// entry.

export const metadata: Metadata = pageMetadata({
  title: "Your report download | Check My Next Home",
  description: "Download the detailed report you bought from Check My Next Home.",
  path: "/report/download",
  noindex: true,
});

export const dynamic = "force-dynamic";

export default async function DownloadLandingRoute({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { token } = await params;
  const { sent } = await searchParams;
  const signer = getDownloadSigner();
  const verification = signer?.verify(token, new Date()) ?? { kind: "invalid" as const };
  // The withdrawn standing (M9.8): read only once the
  // link has proven genuine — a forged link still
  // learns nothing and spends nothing.
  let withdrawn = false;
  if (verification.kind !== "invalid") {
    const deliveries = createDbDeliveryStore(getDbPool());
    const delivery = await deliveries.getById(verification.deliveryId).catch(() => null);
    withdrawn = delivery?.withdrawnAt != null;
  }
  const view = downloadLandingView(verification, { sent: sent === "1", withdrawn });
  if (view.kind === "not-recognised") notFound();
  if (view.kind === "serve") redirect(downloadFilePath(token));
  return (
    <DownloadPageShell>
      {view.kind === "refunded" ? (
        <DownloadRefundedCard />
      ) : view.kind === "sent" ? (
        <DownloadSentCard token={token} />
      ) : (
        <DownloadExpiredCard token={token} />
      )}
    </DownloadPageShell>
  );
}
