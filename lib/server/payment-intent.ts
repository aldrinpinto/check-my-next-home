// Starting a report payment (plan step M9.4): the
// orchestration behind POST /api/payments/intent,
// factored out of the route so the seam is testable
// without a server (the reportViewGate precedent in
// lib/report.ts).
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

import { isEmailShape, normaliseEmail } from "../gift";
import type { Payments } from "./payments";

// What the resolver answers: the home's canonical
// identity as the serve layer resolved it — never the
// client's strings.
export type ResolvedPaymentHome = { postcode: string; homeKey: string | null };

export type PaymentResolver = (
  postcode: string,
  homeKey: string | null,
) => Promise<ResolvedPaymentHome | null>;

export type StartReportPaymentResult =
  | { ok: true; intentId: string; clientSecret: string }
  | {
      ok: false;
      reason: "bad-request" | "email" | "home-not-found" | "not-configured" | "unavailable";
    };

export async function startReportPayment(
  deps: { payments: Payments; resolve: PaymentResolver },
  // The request body, untrusted: the three fields the
  // seam reads are named; anything else a client sends
  // (an amount, an address) is carried past unread —
  // that is the route's safety property, stated in the
  // type.
  input: { postcode?: unknown; homeKey?: unknown; email?: unknown; [key: string]: unknown },
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

  const intent = await deps.payments.createReportIntent({
    email,
    postcode: resolved.postcode,
    homeKey: resolved.homeKey,
  });
  if (!intent.ok) {
    return {
      ok: false,
      reason: intent.reason === "not-configured" ? "not-configured" : "unavailable",
    };
  }
  return { ok: true, intentId: intent.intentId, clientSecret: intent.clientSecret };
}
