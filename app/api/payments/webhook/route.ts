// POST /api/payments/webhook — the payment provider's
// receiver (plan step M9.6). Deliberately thin, fast
// and deaf to almost everything: read the RAW body
// (signature verification needs the exact bytes the
// provider signed), verify through the translator's
// router (the secret is selected by the event's mode —
// the test lane), then hand the verified event to
// lib/server/fulfilment.ts's processing: log it (every
// verified event, failed payments included — the
// founder's audit amendment), claim the fulfilment
// where it is a succeeded payment, and answer.
//
// The answers are the contract the provider retries
// against: a verified event answers 200 whatever it
// was — a non-2xx would only buy a redelivery, and the
// claim makes redelivery harmless by design. An
// UNVERIFIABLE event answers 400 and is never logged:
// the log records what the provider genuinely
// reported, and a forgery is not that. A processing
// failure (the log or claim write itself) answers 500,
// so the provider's retry becomes the recovery — the
// event is not acknowledged until it stands logged and
// claimed.
//
// No rate limit here, on purpose: the provider's
// retries are legitimate traffic, and the signature is
// the gate. On the play site this path is the one
// opening in the Cloudflare Access wall (ruling R3) —
// the signature check is what stands behind it, by
// design, exactly as production will run it.

import { NextResponse } from "next/server";

import { getDbPool } from "../../../../lib/server/db";
import { getWebhookDeps, processWebhookEvent } from "../../../../lib/server/fulfilment";
import { getOrderNotices } from "../../../../lib/server/order-notices";
import { createDbOrderStore } from "../../../../lib/server/orders";
import { getPaymentsRouter } from "../../../../lib/server/payments";
import { publicOriginOf } from "../../../../lib/server/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  try {
    // The order record and the failed-payment email
    // (M9.10): the record's store, and the notices
    // module built on THIS request's public origin —
    // the failed-payment email's try-again link is
    // built on it, by the public-url discipline, never
    // on the server's listen address.
    const notices = getOrderNotices(publicOriginOf(request));
    const outcome = await processWebhookEvent(
      getWebhookDeps(getPaymentsRouter(), {
        orders: createDbOrderStore(getDbPool()),
        failedPaymentNotice: (input) => notices.failedPayment(input),
      }),
      {
        payload,
        signature,
      },
    );
    if (outcome.kind === "refused") {
      return NextResponse.json({ error: outcome.reason }, { status: 400 });
    }
    return NextResponse.json({ received: true, outcome: outcome.kind });
  } catch {
    return NextResponse.json({ error: "processing-failed" }, { status: 500 });
  }
}
