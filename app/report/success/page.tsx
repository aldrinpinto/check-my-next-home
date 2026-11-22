import type { Metadata } from "next";
import { redirect } from "next/navigation";

import ReportSuccessPage from "../../../components/ReportSuccessPage";
import { buildReportSuccessView } from "../../../lib/report-success";
import { pageMetadata } from "../../../lib/seo";
import { getDbPool } from "../../../lib/server/db";
import { createDbFulfilmentClaimStore } from "../../../lib/server/fulfilment";
import { readOrderState } from "../../../lib/server/order-state";
import { getPaymentsRouter } from "../../../lib/server/payments";
import { identityForOrder } from "../../../lib/server/report-identity";

// The success surface's route (plan steps M9.6 and
// M9.7; Sample 10): /report/success?order=<the order's
// reference>. The page reads the order's state
// SERVER-SIDE through the one order-state reading
// (lib/server/order-state.ts — claim first, then the
// payment itself) and renders by it:
//
//   - a claim standing fulfilled renders the full
//     surface; standing claimed, the preparing frame;
//     standing FAILED, the failed state (M9.7, gap 3) —
//     the plain fact and, for a paid claim, the Terms
//     Refunds sentence, with the preparing frame's
//     auto-reload stopped;
//   - a payment with no claim yet that stands
//     succeeded or processing renders the preparing
//     frame (M9.7, gap 2): the buyer confirmed seconds
//     ahead of the "paid" message that makes the claim,
//     and is never bounced to the payment page, where a
//     second payment could be taken for the same home;
//   - a reference with neither a claim nor one of our
//     payments behind it — a stale tab, a typed URL, a
//     revisit after the trail has gone — falls back to
//     the report door, never to an error page (the M9.6
//     pin, kept).
//
// The reference is the only key: a payment id, a gift
// token or a free-window id, each unguessable in its
// own right. The surface is viewing-only: the report
// itself is read through /report/view, and the PDF
// only ever through the delivery email's signed link
// (named test (k) pins the absence of any download or
// share affordance).

export const metadata: Metadata = pageMetadata({
  title: "Your report | Check My Next Home",
  description: "Your detailed report — its delivery state and the on-screen copy.",
  path: "/report/success",
  noindex: true,
});

export const dynamic = "force-dynamic";

export default async function ReportSuccessRoute({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const params = await searchParams;
  const ref = params.order ?? null;
  if (!ref) redirect("/report");
  const claims = createDbFulfilmentClaimStore(getDbPool());
  const reading = await readOrderState({ claims, payments: getPaymentsRouter() }, ref);

  if (reading.kind === "claim") {
    const claim = reading.claim;
    const identity = await identityForOrder(claim.postcode, claim.homeKey);
    const view = buildReportSuccessView({
      state:
        claim.status === "fulfilled" ? "ready" : claim.status === "failed" ? "failed" : "preparing",
      kind: claim.kind,
      identity,
      email: claim.email,
      mailSent: claim.mailSent,
      orderRef: ref,
    });
    return <ReportSuccessPage view={view} />;
  }

  if (reading.kind === "payment" && reading.state === "preparing") {
    const identity = await identityForOrder(reading.postcode, reading.homeKey);
    const view = buildReportSuccessView({
      state: "preparing",
      kind: "paid",
      identity,
      email: reading.email,
      orderRef: ref,
    });
    return <ReportSuccessPage view={view} />;
  }

  redirect("/report");
}
