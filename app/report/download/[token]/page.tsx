import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  DownloadExpiredCard,
  DownloadPageShell,
  DownloadSentCard,
} from "../../../../components/DownloadLinkPage";
import { downloadFilePath, downloadLandingView } from "../../../../lib/download";
import { pageMetadata } from "../../../../lib/seo";
import { getDownloadSigner } from "../../../../lib/server/download-links";

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
//
// Verification is stateless (the signature carries the
// expiry), so this page spends no database read at
// all. Journey-page conventions: explicit noindex
// metadata in every environment (the M7.8 pattern —
// the route family already stands in the robots
// disallow set under /report), no sitemap entry.

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
  const view = downloadLandingView(verification, { sent: sent === "1" });
  if (view.kind === "not-recognised") notFound();
  if (view.kind === "serve") redirect(downloadFilePath(token));
  return (
    <DownloadPageShell>
      {view.kind === "sent" ? (
        <DownloadSentCard token={token} />
      ) : (
        <DownloadExpiredCard token={token} />
      )}
    </DownloadPageShell>
  );
}
