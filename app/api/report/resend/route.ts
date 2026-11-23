import { NextResponse } from "next/server";

import { createDbFulfilmentClaimStore } from "../../../../lib/server/fulfilment";
import { getDbPool } from "../../../../lib/server/db";
import { createDbOrderStore } from "../../../../lib/server/orders";
import { publicOriginOf } from "../../../../lib/server/public-url";
import { rateLimitOk } from "../../../../lib/server/rate-limit";
import { getReportDeliveryService } from "../../../../lib/server/report-delivery";
import { resendOrderDelivery } from "../../../../lib/server/report-resend";

// POST /api/report/resend — the buyer re-send (plan
// step M9.7, ruling R1). A thin adapter over
// lib/server/report-resend.ts: the body names ONE order
// reference — the buyer's own, from their success
// surface — and the standing delivery's email goes out
// again to the address already on that order. No
// address is taken from the client, and no other order
// can be aimed: an unknown or unfulfilled reference
// answers the same 404 either way, so the endpoint
// cannot be used to probe which references exist.
// Rate-limited per caller on the house limiter, like
// the intent route — the control is a courtesy, not a
// mail cannon.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  if (!rateLimitOk(`report-resend:${clientIp(request)}`, 10, 60_000)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const order =
    typeof body === "object" && body !== null && "order" in body
      ? (body as { order: unknown }).order
      : null;
  if (typeof order !== "string" || order.trim() === "") {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const pool = getDbPool();
  const claims = createDbFulfilmentClaimStore(pool);
  const orders = createDbOrderStore(pool);
  const result = await resendOrderDelivery(
    {
      claims,
      delivery: getReportDeliveryService(),
      // The delivery log (M9.10): the buyer's re-send
      // stands in the order's log beside its delivery.
      logResend: (entry) =>
        orders.logDelivery({ ...entry, kind: "buyer-resend" }).then(() => undefined),
    },
    { ref: order.trim(), origin: publicOriginOf(request) },
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "not-configured" ? 503 : 404 },
    );
  }
  return NextResponse.json({ sent: result.sent });
}
