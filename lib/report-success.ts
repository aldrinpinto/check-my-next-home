import type { DeliveryKind } from "./download";
import { reportViewRoute } from "./report";
import type { ReportDoorIdentity } from "./report-door";
import { PAYMENT_REFUND_LINE } from "./report-payment";

// The success surface (plan step M9.6; Final Sample
// Master, Sample 10 — the Success view, carried in
// 17 Nov 2026), built beside the fulfilment call as
// the step's prep pins it. One surface for all three
// completions — paid, free-window and gifted — in the
// sample's frame, with the differences the prep rules:
//
//   - VIEWING ONLY (the D21 amendment; named test
//     (k)): the report is read on screen through the
//     view route; the PDF is obtainable ONLY via the
//     delivery email's signed link. No download button
//     or link, no share buttons, anywhere on the
//     surface — the only sharing route is the gift
//     link in the paid email.
//   - TIMING: the buyer's screen can arrive before the
//     worker has finished (a cold home composes for
//     seconds-to-minutes), so the surface is built from
//     the fulfilment claim's state: "preparing" until
//     the claim stands fulfilled, then the full
//     surface. The delivery email remains the durable
//     copy either way.
//   - KIND: the "One more thing" mystery-extra block
//     is PAID-only, mirroring the email rule — a free
//     or gifted delivery's email carries no gift block,
//     so its success screen promises no extra. The
//     gifted completion carries the gift-applied banner
//     instead (the claim samples' promise, kept: "we'll
//     apply your free report for you, so there's
//     nothing to pay").
//
// The sample's report card counts "nine sections" —
// stale since the ten-section regrouping (21 Nov
// 2026); the line below is composed from the ten-
// section set, as the delivery email already composes
// it, and the Master is conformed in this step's stack
// (prep deviation 1).
//
// M9.7 completes the surface's honesty (its prep's
// gaps 3 and 5):
//   - FAILED: a claim the worker has given up on
//     renders a third state beside preparing and
//     ready — the plain fact, and for a paid claim the
//     Terms page's own Refunds sentence, verbatim
//     (PAYMENT_REFUND_LINE, pinned equal to the Terms
//     text) and nothing stronger: the refund's
//     mechanics are M9.8's, and this state promises
//     only what the Terms already promise. A failed
//     free or gifted claim gets the same state without
//     money words. Sample 10 draws no failed state —
//     this one is composed in its frame and Sample
//     12's manner, per the rule for surfaces with no
//     sample (prep deviation 2). The preparing state's
//     auto-reload does NOT run here: a failed claim
//     does not heal by refreshing.
//   - THE EMAIL CARD TELLS THE TRUTH: the ready state
//     reads the claim's mail_sent. Where the delivery
//     email did not send, the card stops claiming it
//     did — and the surface carries the buyer re-send
//     (ruling R1): a control that sends this order's
//     standing delivery email again, to the address
//     already on the order. It is neither M8.6's
//     re-issue (a fresh link for an expired one, from
//     the download page) nor M9.10's owner resend (any
//     order, support-side); the three never merge.
//
// M9.8 adds the fourth state — REFUNDED, read from the
// refund overlay before the claim's state (the
// order-state reading's overlay; the claim's own
// status is never rewritten): the surface stops
// presenting the report as ready — no sections line,
// no viewing route, no email card, no re-send, no
// mystery strip — and says the plain fact. For a
// gifted claim whose gift was voided, the same state
// carries the voided words for the claimant. The copy
// is DRAFT (the M9.8 draft samples, drawn outside the
// Final Sample Master per ruling R3): Sample 10's
// frame, in its manner; Sample 12 (the decline
// surface) is never borrowed for a refund.

export type ReportSuccessState = "preparing" | "ready" | "failed" | "refunded";

export interface ReportSuccessView {
  state: ReportSuccessState;
  kind: DeliveryKind;
  // The sample's badge, paid completions only: the
  // tick is the component's mark; this is its words.
  badge: string | null;
  heading: string;
  homeSubject: string;
  homeSubline: string | null;
  lede: string;
  // The report card (ready only): the ten-section line
  // and the viewing route's button.
  sectionsLine: string | null;
  viewHref: string | null;
  viewLabel: string;
  // The email block: the sample's card, with the
  // buyer's own address echoed where the sample echoes
  // it (Sample 11's convention). Null in the failed
  // state — no email is coming, and the card does not
  // pretend otherwise.
  emailHeading: string | null;
  emailLead: string | null;
  email: string;
  emailTail: string | null;
  // The failed state's own lines (M9.7): for a paid
  // claim, the Terms Refunds sentence verbatim; for a
  // gifted claim, the gift-unconsumed line and its
  // road back; for a free claim, the road back alone.
  // Null outside the failed state.
  refundLine: string | null;
  failedGiftLine: string | null;
  failedRetryLine: string | null;
  // The buyer re-send (M9.7, ruling R1): the order's
  // reference the re-send posts, ready state only —
  // the standing delivery's email can only be sent
  // again once a delivery stands. The answer lines ride
  // the view too: the re-send control is a client
  // component and takes its words as props, so this
  // module never enters the browser's module graph.
  resendRef: string | null;
  resendLabel: string | null;
  resendSentLine: string | null;
  resendFailedLine: string | null;
  // Paid-only (see the header): the mystery extra.
  mysteryEyebrow: string | null;
  mysteryLine: string | null;
  // Gifted-only: the gift-applied banner's line.
  giftBannerLine: string | null;
  // BUG-337 (25 Nov 2026): the ready state's receipt
  // line — the order reference, the amount paid and
  // the card used, so the buyer has something to quote
  // if the report or the email goes missing. Ready +
  // paid only: a gifted or free claim paid nothing, and
  // no other state has a payment to receipt. Null
  // everywhere else, including a ready paid view whose
  // receipt was never passed in.
  receiptLine: string | null;
  shortlistHref: string;
  shortlistLabel: string;
}

export const SUCCESS_BADGE_PAID = "Payment received — thank you";
export const SUCCESS_HEADING_READY = "Your report is ready";
export const SUCCESS_HEADING_PREPARING = "Your report is being prepared";
// Softened at the payment-flow parity stack (22 Nov
// 2026, repetitions R-6/R-7): the lede no longer
// announces the email — the email card below carries
// that fact (and the re-send), and the mystery strip
// points at the same email; the sample said it three
// times over. Sample 10 is conformed in the same
// stack.
export const SUCCESS_LEDE_READY =
  "Your detailed report for this home is finished. You can read it on screen right now, and the PDF is yours to keep.";
export const SUCCESS_LEDE_PREPARING =
  "We're putting your detailed report together now. This page will show it as soon as it's ready.";
// Sample 10's card line, composed from the ten-section
// set (see the header): the sections in their order,
// in the sample's compressed style.
export const SUCCESS_SECTIONS_LINE =
  "All ten sections are ready — price and this home, sold prices, schools and nurseries, health, air and crime, what's nearby, the neighbourhood, home, costs and risks, flood risk, and the questions to ask the seller, with the sources and notes at the end.";
export const SUCCESS_VIEW_LABEL = "View your report";
export const SUCCESS_EMAIL_HEADING = "Your PDF is coming by email";
export const SUCCESS_EMAIL_LEAD_READY = "We've sent an email with your download link to ";
export const SUCCESS_EMAIL_LEAD_PREPARING = "We'll send an email with your download link to ";
export const SUCCESS_EMAIL_TAIL =
  ". It should arrive within a few minutes — if it isn't there, have a quick look in your spam or junk folder, as first emails from us sometimes land there.";
// The ready state where the delivery email did NOT
// send (M9.7, gap 5): the card tells the truth in the
// sample's own plain manner — the report is ready, the
// email didn't go out, and the re-send below is the
// road. Composed as lead + address + tail, like the
// sent form it replaces.
export const SUCCESS_EMAIL_HEADING_UNSENT = "The email didn't go out";
export const SUCCESS_EMAIL_LEAD_UNSENT = "We tried to send the email with your download link to ";
export const SUCCESS_EMAIL_TAIL_UNSENT =
  ", but it didn't go out. Send it again with the button below — it goes to this same address.";
// The buyer re-send's words (M9.7, ruling R1): the
// button, and the two answers it can give. The sent
// answer names the wait the email card already names;
// the failed answer invites a retry and promises
// nothing it cannot keep.
export const SUCCESS_RESEND_LABEL = "Send the email again";
export const SUCCESS_RESEND_SENT_LINE = "Sent — it should arrive within a few minutes.";
export const SUCCESS_RESEND_FAILED_LINE =
  "We couldn't send it just now — please try again in a moment.";
// The failed state (M9.7, gap 3): the heading and the
// plain fact, per kind. The paid fact names the
// payment because the buyer is owed the refund the
// Terms promise; the free and gifted fact needs no
// money words — nothing was paid.
export const SUCCESS_HEADING_FAILED = "We couldn't make your report";
export const SUCCESS_FAILED_FACT_PAID =
  "Your payment went through, but something on our side stopped us making this report.";
export const SUCCESS_FAILED_FACT = "Something on our side stopped us making this report.";
// A failed gifted claim's gift was never consumed —
// consumption happens only at a delivery that actually
// happens — so the gift stands, and the road back is
// the door, where the returning buyer re-takes the
// claim (gap 4).
export const SUCCESS_FAILED_GIFT_LINE =
  "Your gift has not been used — it is still yours. Start again from the report page for this home, and we will set the report going.";
export const SUCCESS_FAILED_RETRY_LINE =
  "Start again from the report page for this home, and we will set the report going.";
// The refunded state (M9.8) — DRAFT copy from the
// M9.8 draft samples: the heading and the plain fact,
// per kind. The paid fact names the closure and where
// the money went; the gifted fact is the voided gift's
// own truth for the claimant — nothing was used up by
// them, and no report will be made.
export const SUCCESS_HEADING_REFUNDED = "This order was refunded";
export const SUCCESS_REFUNDED_FACT_PAID =
  "This report was refunded in full, so it has been closed — its download link no longer works, and the report is no longer available to view. The money went back to the card that paid for it.";
export const SUCCESS_HEADING_VOIDED_GIFT = "This gift was voided";
export const SUCCESS_REFUNDED_FACT_GIFTED =
  "The report this gift came with was refunded, and a refund ends the gift that came with it — so this free report won't be made. Nothing was used up by you.";
export const SUCCESS_MYSTERY_EYEBROW = "One more thing";
export const SUCCESS_MYSTERY_LINE = "There's a little extra waiting in that email, on us.";
// The gift-applied banner (the claim samples' approved
// promise, in banner form): the gift was applied, and
// there is nothing to pay.
export const GIFT_APPLIED_BANNER_LINE =
  "Your free report gift has been applied — there's nothing to pay for this report.";

// BUG-337 (25 Nov 2026): the receipt — what the ready
// paid view quotes back. The order reference is the
// payment's own reference; the amount is the one price
// in pence; the card is the brand and last 4 digits
// read back from the payment (lib/server/payments.ts's
// intentStatus card), null where the payment carries
// no card to name (a wallet payment, or a read-back
// that could not reach the card) — the line then quotes
// the reference and the amount alone, never a guessed
// card. NEW WORDING, not a sample's: Sample 10 draws
// no receipt, so the Master is conformed in this
// stack.
export interface ReportReceipt {
  orderRef: string;
  amountPence: number;
  cardBrand: string | null;
  cardLast4: string | null;
}

const RECEIPT_CARD_BRAND_NAMES: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
};

export function formatReceiptLine(receipt: ReportReceipt): string {
  const amount = `£${(receipt.amountPence / 100).toFixed(2)}`;
  const card =
    receipt.cardBrand && receipt.cardLast4
      ? ` with ${RECEIPT_CARD_BRAND_NAMES[receipt.cardBrand.toLowerCase()] ?? receipt.cardBrand.charAt(0).toUpperCase() + receipt.cardBrand.slice(1)} ending in ${receipt.cardLast4}`
      : "";
  return `Order ${receipt.orderRef} — ${amount} paid${card}.`;
}

export const SUCCESS_SHORTLIST_LABEL = "See your shortlist";

export function buildReportSuccessView(input: {
  state: ReportSuccessState;
  kind: DeliveryKind;
  identity: ReportDoorIdentity;
  email: string;
  // The claim's mail_sent, where a claim stands behind
  // the view (M9.7): false makes the ready state's
  // email card tell the truth. Absent or null — a
  // claim not yet fulfilled, a payment still racing
  // its claim — the card keeps the sample's words.
  mailSent?: boolean | null;
  // The order's own reference, where one stands
  // (M9.7): the re-send posts it. Ready state only —
  // the builder nulls it in every other state.
  orderRef?: string | null;
  // The view token, where one was minted for this order
  // (BUG-324): the delivery email's signed download
  // token, carried on the "View your report" link so
  // the view route's gate can tell this buyer from a
  // typed URL. Ready state only, like the reference —
  // and absent where no delivery stands, in which case
  // the plain view link stands (the gate sends the
  // buyer to the door, where the emailed link still
  // opens the report).
  viewToken?: string | null;
  // BUG-337: the receipt, where one was read back for
  // this order (the success route reads it from the
  // payment's intent status for ready paid claims).
  // The builder renders it only for ready + paid —
  // a receipt passed in for any other state or kind is
  // ignored, like the token above.
  receipt?: ReportReceipt | null;
}): ReportSuccessView {
  const ready = input.state === "ready";
  const failed = input.state === "failed";
  const refunded = input.state === "refunded";
  const identity = input.identity;
  const emailUnsent = ready && input.mailSent === false;
  return {
    state: input.state,
    kind: input.kind,
    badge: refunded ? null : input.kind === "paid" ? SUCCESS_BADGE_PAID : null,
    heading: ready
      ? SUCCESS_HEADING_READY
      : failed
        ? SUCCESS_HEADING_FAILED
        : refunded
          ? input.kind === "gifted"
            ? SUCCESS_HEADING_VOIDED_GIFT
            : SUCCESS_HEADING_REFUNDED
          : SUCCESS_HEADING_PREPARING,
    homeSubject:
      identity.kind === "home"
        ? identity.subject
        : identity.kind === "postcode"
          ? identity.postcode
          : "Your home",
    homeSubline: identity.kind === "generic" ? null : identity.subline,
    lede: ready
      ? SUCCESS_LEDE_READY
      : failed
        ? input.kind === "paid"
          ? SUCCESS_FAILED_FACT_PAID
          : SUCCESS_FAILED_FACT
        : refunded
          ? input.kind === "gifted"
            ? SUCCESS_REFUNDED_FACT_GIFTED
            : SUCCESS_REFUNDED_FACT_PAID
          : SUCCESS_LEDE_PREPARING,
    sectionsLine: ready ? SUCCESS_SECTIONS_LINE : null,
    viewHref: ready
      ? reportViewRoute(
          identity.kind === "generic" ? "" : identity.postcode,
          identity.kind === "home" ? identity.homeKey : null,
          input.viewToken ?? null,
        )
      : null,
    viewLabel: SUCCESS_VIEW_LABEL,
    emailHeading:
      failed || refunded
        ? null
        : emailUnsent
          ? SUCCESS_EMAIL_HEADING_UNSENT
          : SUCCESS_EMAIL_HEADING,
    emailLead:
      failed || refunded
        ? null
        : emailUnsent
          ? SUCCESS_EMAIL_LEAD_UNSENT
          : ready
            ? SUCCESS_EMAIL_LEAD_READY
            : SUCCESS_EMAIL_LEAD_PREPARING,
    email: input.email,
    emailTail:
      failed || refunded ? null : emailUnsent ? SUCCESS_EMAIL_TAIL_UNSENT : SUCCESS_EMAIL_TAIL,
    refundLine: failed && input.kind === "paid" ? PAYMENT_REFUND_LINE : null,
    failedGiftLine: failed && input.kind === "gifted" ? SUCCESS_FAILED_GIFT_LINE : null,
    failedRetryLine: failed && input.kind === "free" ? SUCCESS_FAILED_RETRY_LINE : null,
    resendRef: ready ? (input.orderRef ?? null) : null,
    resendLabel: ready ? SUCCESS_RESEND_LABEL : null,
    resendSentLine: ready ? SUCCESS_RESEND_SENT_LINE : null,
    resendFailedLine: ready ? SUCCESS_RESEND_FAILED_LINE : null,
    mysteryEyebrow: !failed && !refunded && input.kind === "paid" ? SUCCESS_MYSTERY_EYEBROW : null,
    mysteryLine: !failed && !refunded && input.kind === "paid" ? SUCCESS_MYSTERY_LINE : null,
    giftBannerLine:
      !failed && !refunded && input.kind === "gifted" ? GIFT_APPLIED_BANNER_LINE : null,
    receiptLine:
      ready && input.kind === "paid" && input.receipt ? formatReceiptLine(input.receipt) : null,
    shortlistHref: "/shortlist",
    shortlistLabel: SUCCESS_SHORTLIST_LABEL,
  };
}
