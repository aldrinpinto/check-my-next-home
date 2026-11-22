// POST /api/payments/intent — start a report payment
// (plan steps M9.4 and M9.5). A thin adapter over the
// factored seam (lib/server/payment-intent.ts): the
// browser posts the postcode, the home key, the
// delivery email and the digital-content consent
// (tick + timestamp, M9.5 — a request without it is
// refused); the server re-resolves the home itself and
// the translator (lib/server/payments.ts) creates the
// payment for the one price. The answer is the client
// secret the embedded card element confirms against —
// no amount, no address and no card detail ever
// travels this route, and nothing is delivered from
// here: fulfilment is M9.6's webhook path.
//
// Failure answers are the seam's reason codes with the
// payment page's own human lines beside them — provider
// error text is never relayed.

import { NextResponse } from "next/server";

import { homeKeyOf } from "../../../../lib/bundle-cache";
import {
  PAYMENT_HOME_NOT_FOUND_LINE,
  PAYMENT_START_FAILED_LINE,
} from "../../../../lib/report-payment";
import { getPayments } from "../../../../lib/server/payments";
import {
  startReportPayment,
  type ResolvedPaymentHome,
} from "../../../../lib/server/payment-intent";
import { resolutionForRoute } from "../../../../lib/server/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The serve layer's resolution, in the payment seam's
// terms — the door page's own ladder, including its
// stale-key fallback (a key the directory no longer
// holds falls back to the postcode's form, never a
// guessed home).
async function resolvePaymentHome(
  postcode: string,
  homeKey: string | null,
): Promise<ResolvedPaymentHome | null> {
  let resolution = await resolutionForRoute(postcode, homeKey);
  if (!resolution && homeKey) {
    resolution = await resolutionForRoute(postcode, null);
  }
  if (!resolution) return null;
  if (resolution.rung === 1) {
    return { postcode: resolution.address.postcode, homeKey: homeKeyOf(resolution) };
  }
  if (resolution.rung === 2) {
    return { postcode: resolution.directory.postcode, homeKey: null };
  }
  return null;
}

const STATUS_BY_REASON = {
  "bad-request": 400,
  email: 400,
  consent: 400,
  "home-not-found": 404,
  "not-configured": 503,
  unavailable: 502,
} as const;

export async function POST(request: Request) {
  let body: { postcode?: unknown; homeKey?: unknown; email?: unknown; consent?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad-request", message: PAYMENT_START_FAILED_LINE },
      { status: 400 },
    );
  }

  const result = await startReportPayment(
    { payments: getPayments(), resolve: resolvePaymentHome },
    body,
  );
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.reason,
        message:
          result.reason === "home-not-found"
            ? PAYMENT_HOME_NOT_FOUND_LINE
            : PAYMENT_START_FAILED_LINE,
      },
      { status: STATUS_BY_REASON[result.reason] },
    );
  }
  return NextResponse.json({ intentId: result.intentId, clientSecret: result.clientSecret });
}
