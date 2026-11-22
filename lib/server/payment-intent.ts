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

import { isEmailShape, normaliseEmail } from "../gift";
import type { Payments, ReportPaymentConsent } from "./payments";

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

export async function startReportPayment(
  deps: { payments: Payments; resolve: PaymentResolver },
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

  const intent = await deps.payments.createReportIntent({
    email,
    postcode: resolved.postcode,
    homeKey: resolved.homeKey,
    consent,
  });
  if (!intent.ok) {
    return {
      ok: false,
      reason: intent.reason === "not-configured" ? "not-configured" : "unavailable",
    };
  }
  return { ok: true, intentId: intent.intentId, clientSecret: intent.clientSecret };
}
