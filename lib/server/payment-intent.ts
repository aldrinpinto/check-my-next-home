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
// M9.7 adds the seam's own nation gate and the failed
// gift claim's retake: the nation the resolver computed
// rides the resolved-home answer, a held nation's start
// is refused before gift recognition and before any
// creation (gap 6, ruling R2), and a gifted claim that
// already stands FAILED is reset for the worker when
// its buyer returns (gap 4, ruling R3).
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
import { isNotCoveredNation, type Nation } from "../journey";
import type { PaymentsRouter, ReportPaymentConsent } from "./payments";

// What the resolver answers: the home's canonical
// identity as the serve layer resolved it — never the
// client's strings. M9.7 adds the nation, read by the
// resolver from the SAME evidence the door reads (the
// directory's filed area code for the postcode, via
// the brains' own detector), so this seam and the door
// can never disagree about which nation a home is in.
export type ResolvedPaymentHome = {
  postcode: string;
  homeKey: string | null;
  nation: Nation;
};

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
        | "bad-request"
        | "email"
        | "consent"
        | "home-not-found"
        | "held-nation"
        | "not-configured"
        | "unavailable";
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
  // The failed gift claim's retake (M9.7, gap 4 —
  // ruling R3): where the gifted claim already stands
  // but stands FAILED, reset it so the worker tries
  // again (the claim store's reclaimFailed, keyed by
  // the gift token). Optional like the pair above; the
  // route always wires it.
  reclaimFailedGifted?: (ref: string) => Promise<boolean>;
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

  // The nation hold, at the seam itself (M9.7, gap 6 —
  // ruling R2): the door page and the report view gate
  // Scotland and Northern Ireland by nation, and until
  // this step this route did not — a crafted start
  // naming a resolved Scottish home could create, and
  // on confirmation fulfil, the exact paid report the
  // founder's Road B ruling holds until the nation
  // milestone. The refusal stands BEFORE gift
  // recognition and before any payment is created, so
  // a held nation's start creates nothing anywhere.
  if (isNotCoveredNation(resolved.nation)) {
    return { ok: false, reason: "held-nation" };
  }

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
      let took: boolean;
      try {
        took = await deps.claimGifted({
          ref: gift.token,
          email,
          postcode: resolved.postcode,
          homeKey: resolved.homeKey,
          giftToken: gift.token,
        });
      } catch {
        return { ok: false, reason: "unavailable" };
      }
      // The claim already stood. Where it stands FAILED,
      // the buyer has come back — and the gift was never
      // consumed, so the failed claim is retaken and the
      // worker tries again (gap 4, ruling R3). Best
      // effort by design: the gifted answer does not
      // depend on the retake, and a claim in any other
      // state is left exactly as it stands.
      if (!took && deps.reclaimFailedGifted) {
        try {
          await deps.reclaimFailedGifted(gift.token);
        } catch {
          // The claim's state is what it is; the buyer
          // still belongs on the success surface, which
          // reads that state and tells the truth about it.
        }
      }
      return { ok: true, gifted: true, ref: gift.token };
    }
  }

  // FAIL-CLOSED (M9.9 prep gap 9, adopted; built with
  // M9.8): an allowlisted email whose test set is
  // absent or incomplete is refused HERE — not-configured,
  // nothing created — and never carried by the default
  // set flagged TEST. A test purchase must not be
  // capable of taking real money. The check stands
  // after gift recognition (a gifted order creates no
  // payment at all, in any lane) and before the lane is
  // consulted for money.
  if (deps.payments.isTestOrder(email) && !deps.payments.testLaneReady()) {
    return { ok: false, reason: "not-configured" };
  }

  // The lane is the router's answer for this email —
  // the test set for an allowlisted tester, the default
  // set for everyone else — and the TEST flag rides
  // into the metadata either way the allowlist answers.
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
