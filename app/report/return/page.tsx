import type { Metadata } from "next";
import { redirect } from "next/navigation";

import ReportPaymentFailedPage from "../../../components/ReportPaymentFailedPage";
import { buildReportPaymentFailedView } from "../../../lib/report-payment-failed";
import { pageMetadata } from "../../../lib/seo";
import { getDbPool } from "../../../lib/server/db";
import { createDbFulfilmentClaimStore } from "../../../lib/server/fulfilment";
import { createDbGiftStore } from "../../../lib/server/gifts";
import { readOrderState } from "../../../lib/server/order-state";
import { getPaymentsRouter } from "../../../lib/server/payments";
import { createDbRefundStore, refundTriggerMet } from "../../../lib/server/refunds";
import { identityForOrder } from "../../../lib/server/report-identity";

// The payment's return landing (plan step M9.7, gap
// 1): the ONE address handed to the payment provider
// as the payment's return_url — where a buyer lands
// when the payment itself sends them back, above all
// the bank-approval detour (the bank's own page, then
// straight back here). The landing renders nothing of
// its own judgement: it reads the order's true state
// server-side through the one order-state reading
// (lib/server/order-state.ts) and routes by it —
//
//   - paid, or still settling: on to the success
//     surface, which renders the order's state itself
//     (the preparing frame while the claim races in);
//   - not paid: Sample 12, the payment-failed page,
//     rendered here with the home the payment's own
//     metadata names;
//   - nothing behind the reference at all: the report
//     door, the surfaces' standing fallback.
//
// The reference arrives as ?order= (the address this
// build hands over) or ?payment_intent= (the parameter
// the provider appends on its own returns); both name
// the same order.

export const metadata: Metadata = pageMetadata({
  title: "Your payment | Check My Next Home",
  description: "Where a completed or attempted payment lands.",
  path: "/report/return",
  noindex: true,
});

export const dynamic = "force-dynamic";

export default async function ReportReturnRoute({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; payment_intent?: string }>;
}) {
  const params = await searchParams;
  const ref = params.order ?? params.payment_intent ?? null;
  if (!ref) redirect("/report");
  const pool = getDbPool();
  const claims = createDbFulfilmentClaimStore(pool);
  const gifts = createDbGiftStore(pool);
  const refundStore = createDbRefundStore(pool);
  const reading = await readOrderState(
    {
      claims,
      payments: getPaymentsRouter(),
      refunds: {
        completedFullRefund: async (paymentRef) =>
          refundTriggerMet(await refundStore.listByPayment(paymentRef)),
      },
      giftVoided: async (token) => (await gifts.getByToken(token))?.status === "voided",
    },
    ref,
  );

  // A refunded order (M9.8) belongs on the success
  // surface, which renders the refunded state — never
  // on Sample 12: the payment did not fail.
  if (reading.kind === "refunded" || reading.kind === "voided-gift") {
    redirect(`/report/success?order=${encodeURIComponent(ref)}`);
  }
  if (reading.kind === "claim") {
    redirect(`/report/success?order=${encodeURIComponent(ref)}`);
  }
  if (reading.kind === "payment") {
    if (reading.state === "preparing") {
      redirect(`/report/success?order=${encodeURIComponent(ref)}`);
    }
    const identity = await identityForOrder(reading.postcode, reading.homeKey);
    return <ReportPaymentFailedPage view={buildReportPaymentFailedView({ identity })} />;
  }
  redirect("/report");
}
