// Starting a report payment (plan steps M9.4 and
// M9.5): the orchestration behind POST
// /api/payments/intent, factored out of the route so
// the seam is testable without a server (the
// reportViewGate precedent in lib/report.ts).
//
// The route's one safety property lives here: the home
// is RE-RESOLVED on the server from the postcode and
// home key the browser sends, and the payment is
// created for the RESOLVED identity — a client-sent
// address is never trusted, and a client-sent amount
// does not exist in the input at all: the amount is
// the translator's own (REPORT_PRICE_PENCE, via
// lib/server/payments.ts). The delivery email is
// normalised by the gift flow's rules (lib/gift.ts)
// and shape-checked before anything is created.
//
// M9.5 adds the consent gate: no payment exists
// without the buyer's digital-content consent. The
// request must carry the tick (ticked, exactly true)
// and the ISO timestamp of the moment it was given;
// anything else is refused before the home is even
// resolved, and the consent rides into the payment's
// metadata, where the order record reads it back
// (test T-PAY-06).
//
// M9.6 adds two things beside the creation:
//   - THE TEST LANE: the router answers the lane for
//     the delivery email (allowlisted testers create
//     with the TEST key set where one is configured)
//     and whether the order is flagged TEST; the flag
//     rides into the payment's metadata, and the answer
//     carries the LANE's publishable key, so the page
//     initialises its card element from the same set
//     that created the payment.
//   - GIFT RECOGNITION: an email holding a bound,
//     unredeemed Check Together gift never reaches
//     creation at all — the order is claimed as a
//     gifted fulfilment instead (the claim store takes
//     it from here; the worker delivers it and consumes
//     the gift at delivery), and the answer says so, so
//     the page can show the gift-applied banner. The
//     check runs on the RESOLVED home, so a gifted
//     order is claimed for the home the server resolved,
//     never for a client-sent address.

import { isEmailShape, normaliseEmail } from "../gift";
import type { PaymentsRouter, ReportPaymentConsent } from "./payments";

// What the resolver answers: the home's canonical
// identity as the serve layer resolved it — never the
// client's strings.
export type ResolvedPaymentHome = { postcode: string; homeKey: string | null };

export type PaymentResolver = (
  postcode: string,
  homeKey: string | null,
) => Promise<ResolvedPaymentHome | null>;

export type StartReportPaymentResult =
  | { ok: true; intentId: string; clientSecret: string; publishableKey: string | null }
  // The email holds a bound gift: no payment was
  // created; a gifted fulfilment stands claimed under
  // this reference instead.
  | { ok: true; gifted: true; ref: string }
  | {
      ok: false;
      reason:
        "bad-request" | "email" | "consent" | "home-not-found" | "not-configured" | "unavailable";
    };

// An ISO 8601 timestamp of the form the page sends
// (Date.toISOString's shape, with or without the
// milliseconds) that also parses as a real moment.
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

function readConsent(raw: unknown): ReportPaymentConsent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as { ticked?: unknown; timestamp?: unknown };
  if (candidate.ticked !== true) return null;
  if (typeof candidate.timestamp !== "string") return null;
  if (!ISO_TIMESTAMP.test(candidate.timestamp)) return null;
  if (Number.isNaN(Date.parse(candidate.timestamp))) return null;
  return { ticked: true, timestamp: candidate.timestamp };
}

export interface StartReportPaymentDeps {
  payments: PaymentsRouter;
  resolve: PaymentResolver;
  // Gift recognition (M9.6): the live claimed gift
  // bound to an email, if any (the gift store's
  // findClaimedByEmail), and the claim that takes a
  // gifted order (the fulfilment claim store's claim,
  // keyed by the gift token). Optional in the type so
  // the seam's older tests construct without them; the
  // route always wires both.
  giftFor?: (email: string) => Promise<{ token: string } | null>;
  claimGifted?: (input: {
    ref: string;
    email: string;
    postcode: string;
    homeKey: string | null;
    giftToken: string;
  }) => Promise<boolean>;
}

export async function startReportPayment(
  deps: StartReportPaymentDeps,
  // The request body, untrusted: the four fields the
  // seam reads are named; anything else a client sends
  // (an amount, an address) is carried past unread —
  // that is the route's safety property, stated in the
  // type.
  input: {
    postcode?: unknown;
    homeKey?: unknown;
    email?: unknown;
    consent?: unknown;
    [key: string]: unknown;
  },
): Promise<StartReportPaymentResult> {
  if (typeof input.postcode !== "string" || input.postcode.trim() === "") {
    return { ok: false, reason: "bad-request" };
  }
  if (input.homeKey !== undefined && input.homeKey !== null && typeof input.homeKey !== "string") {
    return { ok: false, reason: "bad-request" };
  }
  if (typeof input.email !== "string") return { ok: false, reason: "bad-request" };

  const email = normaliseEmail(input.email);
  if (!isEmailShape(email)) return { ok: false, reason: "email" };

  // No consent, no payment — refused before the home
  // is resolved or anything is created (T-PAY-06).
  const consent = readConsent(input.consent);
  if (!consent) return { ok: false, reason: "consent" };

  let resolved: ResolvedPaymentHome | null;
  try {
    resolved = await deps.resolve(
      input.postcode,
      typeof input.homeKey === "string" ? input.homeKey : null,
    );
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!resolved) return { ok: false, reason: "home-not-found" };

  // Gift recognition, before any charge: a bound,
  // unredeemed gift makes this order a gifted
  // fulfilment — no payment is created, and the gift
  // is consumed only when the worker delivers.
  if (deps.giftFor && deps.claimGifted) {
    let gift: { token: string } | null;
    try {
      gift = await deps.giftFor(email);
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    if (gift) {
      try {
        await deps.claimGifted({
          ref: gift.token,
          email,
          postcode: resolved.postcode,
          homeKey: resolved.homeKey,
          giftToken: gift.token,
        });
      } catch {
        return { ok: false, reason: "unavailable" };
      }
      return { ok: true, gifted: true, ref: gift.token };
    }
  }

  // The lane is the router's answer for this email —
  // the test set for an allowlisted tester where one
  // is configured, the default set for everyone else —
  // and the TEST flag rides into the metadata either
  // way the allowlist answers.
  const lane = deps.payments.laneFor(email);
  const intent = await deps.payments.forLane(lane).createReportIntent({
    email,
    postcode: resolved.postcode,
    homeKey: resolved.homeKey,
    consent,
    testOrder: deps.payments.isTestOrder(email),
  });
  if (!intent.ok) {
    return {
      ok: false,
      reason: intent.reason === "not-configured" ? "not-configured" : "unavailable",
    };
  }
  return {
    ok: true,
    intentId: intent.intentId,
    clientSecret: intent.clientSecret,
    publishableKey: deps.payments.publishableKeyFor(lane),
  };
}
