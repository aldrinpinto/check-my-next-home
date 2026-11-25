import type { Metadata } from "next";
import { redirect } from "next/navigation";

import ReportSuccessPage from "../../../components/ReportSuccessPage";
import { buildReportSuccessView } from "../../../lib/report-success";
import { pageMetadata } from "../../../lib/seo";
import { REPORT_PRICE_PENCE } from "../../../lib/site";
import { getDbPool } from "../../../lib/server/db";
import { createDbFulfilmentClaimStore } from "../../../lib/server/fulfilment";
import { createDbGiftStore } from "../../../lib/server/gifts";
import { readOrderState } from "../../../lib/server/order-state";
import {
  PAYMENT_METADATA_EMAIL,
  PAYMENT_METADATA_HOME_KEY,
  PAYMENT_METADATA_POSTCODE,
  getPaymentsRouter,
} from "../../../lib/server/payments";
import { createDbRefundStore, refundTriggerMet } from "../../../lib/server/refunds";
import { identityForOrder } from "../../../lib/server/report-identity";
import { reportViewTokenForOrder } from "../../../lib/server/report-view-access";

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
// M9.8 adds the refund overlay, read through the same
// reading: a completed full refund renders the
// refunded state whatever the claim's own status says
// (no report opening, no re-send), and a gifted claim
// whose gift stands voided renders the voided words
// for its claimant.
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
  const pool = getDbPool();
  const claims = createDbFulfilmentClaimStore(pool);
  const gifts = createDbGiftStore(pool);
  const refundStore = createDbRefundStore(pool);
  const payments = getPaymentsRouter();
  const reading = await readOrderState(
    {
      claims,
      payments,
      refunds: {
        completedFullRefund: async (paymentRef) =>
          refundTriggerMet(await refundStore.listByPayment(paymentRef)),
      },
      giftVoided: async (token) => (await gifts.getByToken(token))?.status === "voided",
    },
    ref,
  );

  if (reading.kind === "refunded" || reading.kind === "voided-gift") {
    const claim = reading.claim;
    if (claim) {
      const identity = await identityForOrder(claim.postcode, claim.homeKey);
      const view = buildReportSuccessView({
        state: "refunded",
        kind: claim.kind,
        identity,
        email: claim.email,
        orderRef: ref,
      });
      return <ReportSuccessPage view={view} />;
    }
    // Refunded before any claim stands: the payment
    // itself names the home and the inbox.
    const status = await payments.intentStatus(ref).catch(() => null);
    const email = status?.ok ? (status.metadata[PAYMENT_METADATA_EMAIL] ?? null) : null;
    const postcode = status?.ok ? (status.metadata[PAYMENT_METADATA_POSTCODE] ?? null) : null;
    if (!email || !postcode) redirect("/report");
    const identity = await identityForOrder(
      postcode,
      status?.ok ? (status.metadata[PAYMENT_METADATA_HOME_KEY] ?? null) : null,
    );
    const view = buildReportSuccessView({
      state: "refunded",
      kind: "paid",
      identity,
      email,
      orderRef: ref,
    });
    return <ReportSuccessPage view={view} />;
  }

  if (reading.kind === "claim") {
    const claim = reading.claim;
    const identity = await identityForOrder(claim.postcode, claim.homeKey);
    // BUG-324: the "View your report" button carries the
    // delivery email's signed download token, minted over
    // this order's standing delivery, so the view route's
    // gate can tell this buyer from a typed URL. Only a
    // fulfilled claim has a delivery to mint over — a
    // preparing or failed claim mints nothing, and a
    // mint that cannot be read fails closed to the plain
    // link (the gate sends the buyer to the door, where
    // the emailed link still opens the report).
    const viewToken =
      claim.status === "fulfilled" ? await reportViewTokenForOrder(ref).catch(() => null) : null;
    // BUG-337: the receipt for a ready PAID claim — the
    // order reference, the one price, and the card off
    // the payment's intent status. The reference and the
    // amount are known even where the status read fails
    // or names no card, so the line still quotes those
    // two; only the card clause drops. Gifted and free
    // claims paid nothing and get no receipt.
    const receipt =
      claim.status === "fulfilled" && claim.kind === "paid"
        ? await payments
            .intentStatus(ref)
            .then((status) => ({
              orderRef: ref,
              amountPence: REPORT_PRICE_PENCE,
              cardBrand: status.ok ? (status.card?.brand ?? null) : null,
              cardLast4: status.ok ? (status.card?.last4 ?? null) : null,
            }))
            .catch(() => ({
              orderRef: ref,
              amountPence: REPORT_PRICE_PENCE,
              cardBrand: null,
              cardLast4: null,
            }))
        : null;
    const view = buildReportSuccessView({
      state:
        claim.status === "fulfilled"
          ? "ready"
          : claim.status === "failed"
            ? "failed"
            : claim.status === "refunded"
              ? "refunded"
              : "preparing",
      kind: claim.kind,
      identity,
      email: claim.email,
      mailSent: claim.mailSent,
      orderRef: ref,
      viewToken,
      receipt,
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
