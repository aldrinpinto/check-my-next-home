// POST /api/payments/intent — start a report payment
// (plan steps M9.4, M9.5 and M9.6). A thin adapter over
// the factored seam (lib/server/payment-intent.ts): the
// browser posts the postcode, the home key, the
// delivery email and the digital-content consent
// (tick + timestamp, M9.5 — a request without it is
// refused); the server re-resolves the home itself and
// the translator (lib/server/payments.ts) creates the
// payment for the one price, in the lane the router
// selects for the email (the test lane, M9.6). The
// answer is the client secret the embedded card element
// confirms against, plus the lane's publishable key the
// element initialises from — no amount, no address and
// no card detail ever travels this route, and nothing
// is delivered from here: fulfilment is M9.6's webhook
// path and worker.
//
// GIFT RECOGNITION (M9.6): an email holding a bound,
// unredeemed gift creates no payment at all — the seam
// claims a gifted fulfilment instead and the answer
// says so ({ gifted: true, ref }), so the page can show
// the gift-applied banner and move to the success
// surface. The gift is consumed only at delivery.
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
import { getDbPool } from "../../../../lib/server/db";
import { createDbFulfilmentClaimStore } from "../../../../lib/server/fulfilment";
import { createDbGiftStore } from "../../../../lib/server/gifts";
import { getPaymentsRouter } from "../../../../lib/server/payments";
import {
  startReportPayment,
  type ResolvedPaymentHome,
} from "../../../../lib/server/payment-intent";
import { rateLimitOk } from "../../../../lib/server/rate-limit";
import { resolutionForRoute } from "../../../../lib/server/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The house rate limiter (the gift-claim pattern),
// added at M9.6 (prep gap 12) in the same change that
// flips the door to "paid": this route creates a
// provider object per call, so it does not go public
// unguarded. Turnstile is explicitly NOT added here —
// card-testing abuse aims at the provider's confirm
// step, which is the provider's own surface with its
// own defences, and this route alone cannot charge
// anything; if junk creation ever shows in the logs,
// Turnstile (infrastructure already live at K5) is a
// one-route addition.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

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
  const caller =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  if (!rateLimitOk(`payment-intent:${caller}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json(
      { error: "rate-limited", message: PAYMENT_START_FAILED_LINE },
      { status: 429 },
    );
  }

  let body: { postcode?: unknown; homeKey?: unknown; email?: unknown; consent?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad-request", message: PAYMENT_START_FAILED_LINE },
      { status: 400 },
    );
  }

  const pool = getDbPool();
  const gifts = createDbGiftStore(pool);
  const claims = createDbFulfilmentClaimStore(pool);
  const result = await startReportPayment(
    {
      payments: getPaymentsRouter(),
      resolve: resolvePaymentHome,
      giftFor: async (email) => {
        const gift = await gifts.findClaimedByEmail(email, new Date());
        return gift ? { token: gift.token } : null;
      },
      claimGifted: (input) =>
        claims.claim({
          ref: input.ref,
          kind: "gifted",
          email: input.email,
          postcode: input.postcode,
          homeKey: input.homeKey,
          giftToken: input.giftToken,
        }),
    },
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
  if ("gifted" in result) {
    return NextResponse.json({ gifted: true, ref: result.ref });
  }
  return NextResponse.json({
    intentId: result.intentId,
    clientSecret: result.clientSecret,
    publishableKey: result.publishableKey,
  });
}
