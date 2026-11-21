// POST /report/download/<token>/reissue — the expired
// page's form (plan step M8.6, Key K16; Master views
// 32–33).
//
// THE UNIFORM ANSWER is the route's whole design: once
// the presented link is verified genuine (in date or
// expired — a still-live link may be re-issued too),
// every submission is answered with the same redirect
// to the landing page's sent presentation, whether the
// entered address matched the delivery's own address
// or not, whether an email actually went out or not,
// and whether the machinery behind it succeeded or
// failed. The page therefore never reveals who bought
// what (the samples' journey rule). The decision —
// send only on a match — is lib/download.ts's
// decideReissue, executed by the delivery service;
// its outcome is the server's log line, never the
// visitor's answer.
//
// A link that is NOT genuine never reaches the
// uniform answer: it bounces to the landing page,
// which serves the site's error page for it (view
// 35) — a made-up or tampered link is refused, not
// answered.
//
// Abuse shape: the endpoint can send email, so it is
// rate-limited per caller (the claim route's limiter
// and numbers). The limit's bite is on the SEND, not
// the answer: a caller over the limit still gets the
// uniform redirect, just no email — the blast radius
// is bounded by the decision itself (a send goes only
// to a delivery's own inbox, and only on its own
// address entered against its own link).
//
// URLs follow lib/server/public-url.ts's two rules:
// the redirect is a RELATIVE Location, and the
// re-issue email's link takes its origin from the
// forwarded headers.

import { downloadPath } from "../../../../../lib/download";
import { getDownloadSigner } from "../../../../../lib/server/download-links";
import { publicOriginOf, redirectRelative } from "../../../../../lib/server/public-url";
import { rateLimitOk } from "../../../../../lib/server/rate-limit";
import { getReportDeliveryService } from "../../../../../lib/server/report-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const signer = getDownloadSigner();
  const verification = signer?.verify(token, new Date()) ?? { kind: "invalid" as const };
  if (verification.kind === "invalid") return redirectRelative(downloadPath(token));

  const caller = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (rateLimitOk(`download-reissue:${caller}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    try {
      const form = await request.formData();
      const email = String(form.get("email") ?? "");
      const service = getReportDeliveryService();
      if (service) {
        await service.reissueDownloadLink({
          token,
          email,
          origin: publicOriginOf(request),
        });
      }
    } catch {
      // Deliberately swallowed — the one place in the
      // flow where a failure must not surface: the
      // uniform answer stands whether the machinery
      // behind it succeeded or not, and a surfaced
      // difference would itself be the leak the design
      // exists to prevent. (A failed send on a genuine
      // match costs the buyer nothing they cannot redo:
      // the form stands again on the sent page.)
    }
  }
  return redirectRelative(`${downloadPath(token)}?sent=1`);
}
