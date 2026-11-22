// The payment-failed view (plan step M9.7, gap 1;
// Final Sample Master, Sample 12 — "Your payment
// didn't go through"): what the payment's return
// landing renders when the payment stands unpaid — a
// declined card, a closed page, an abandoned
// bank-approval detour. The sample is built VERBATIM:
// its heading, its lede (with "You have not been
// charged" in the sample's own emphasis), its three
// reasons, its still-the-same-price line and its road
// back. The one composed word is the price, from the
// same label the whole product composes — the sample's
// £4.99 is that label's launch value, and a pin holds
// the composed line equal to the sample's words.
//
// Beside it, the sample's "Check another home" card —
// the same card the door and the success surface
// carry, in the same words — and the link row: back to
// the free check, which is still saved, and the
// shortlist.
//
// Pure copy and shape, in the brains layer beside the
// success view: the landing route reads the order's
// state (lib/server/order-state.ts) and hands the
// identity here; this module never touches the network
// or the database.

import { homeRoute } from "./journey";
import type { ReportDoorIdentity } from "./report-door";
import { REPORT_PRICE_LABEL } from "./site";

export interface ReportPaymentFailedView {
  heading: string;
  homeSubject: string;
  homeSubline: string | null;
  ledeLead: string;
  ledeStrong: string;
  ledeTail: string;
  reasonsHeading: string;
  reasons: string[];
  stillLine: string;
  checkAnotherHeading: string;
  checkAnotherLine: string;
  backHref: string;
  backLabel: string;
  shortlistHref: string;
  shortlistLabel: string;
}

export const PAYMENT_FAILED_HEADING = "Your payment didn't go through";
export const PAYMENT_FAILED_LEDE_LEAD = "Don't worry — this happens, and nothing is lost. ";
export const PAYMENT_FAILED_LEDE_STRONG = "You have not been charged";
export const PAYMENT_FAILED_LEDE_TAIL = ", and no report has been ordered.";
export const PAYMENT_FAILED_REASONS_HEADING = "Why this usually happens";
export const PAYMENT_FAILED_REASONS: string[] = [
  "Your bank declined the card — sometimes a quick check with them, or a different card, sorts it.",
  "The payment page was closed or left unfinished before the payment went through.",
  "A detail was mistyped — the card number, expiry date or the code on the back.",
];
export const PAYMENT_FAILED_STILL_LINE = `Whenever you're ready — the report for this home is still ${REPORT_PRICE_LABEL}, and your free check is exactly as you left it.`;
export const PAYMENT_FAILED_CHECK_ANOTHER_HEADING = "Check another home";
export const PAYMENT_FAILED_CHECK_ANOTHER_LINE =
  "The headlines are always free — check the next home you're considering.";
export const PAYMENT_FAILED_BACK_LABEL = "Back to your free check — it's still saved";
export const PAYMENT_FAILED_SHORTLIST_LABEL = "See your shortlist";

export function buildReportPaymentFailedView(input: {
  identity: ReportDoorIdentity;
}): ReportPaymentFailedView {
  const identity = input.identity;
  return {
    heading: PAYMENT_FAILED_HEADING,
    homeSubject:
      identity.kind === "home"
        ? identity.subject
        : identity.kind === "postcode"
          ? identity.postcode
          : "Your home",
    homeSubline: identity.kind === "generic" ? null : identity.subline,
    ledeLead: PAYMENT_FAILED_LEDE_LEAD,
    ledeStrong: PAYMENT_FAILED_LEDE_STRONG,
    ledeTail: PAYMENT_FAILED_LEDE_TAIL,
    reasonsHeading: PAYMENT_FAILED_REASONS_HEADING,
    reasons: [...PAYMENT_FAILED_REASONS],
    stillLine: PAYMENT_FAILED_STILL_LINE,
    checkAnotherHeading: PAYMENT_FAILED_CHECK_ANOTHER_HEADING,
    checkAnotherLine: PAYMENT_FAILED_CHECK_ANOTHER_LINE,
    backHref: homeRoute(
      identity.kind === "generic" ? "" : identity.postcode,
      identity.kind === "home" ? identity.homeKey : null,
    ),
    backLabel: PAYMENT_FAILED_BACK_LABEL,
    shortlistHref: "/shortlist",
    shortlistLabel: PAYMENT_FAILED_SHORTLIST_LABEL,
  };
}
