import { BUY_BAR_MYSTERY_EYEBROW, BUY_BAR_MYSTERY_LINE } from "./results";
import {
  REPORT_DOOR_CONTENTS_HEADING,
  REPORT_DOOR_PRICE_LINE,
  type ReportDoorIdentity,
} from "./report-door";
import { REPORT_PRICE_LABEL } from "./site";

// The payment page's view (plan steps M9.4 and M9.5;
// Final Sample Master, Sample 9 — the Payment view,
// carried in 17 Nov 2026). The page is the report
// door's paid state, built in full at these steps and
// rendered only when M9.6 flips REPORT_DOOR_STATE with
// fulfilment behind it; until then the door renders
// its holding form and this view is exercised by
// forced-state tests (the M8.9 company block's
// pattern).
//
// Sample 9's drawn card fields are a PICTURE of the
// payment company's embedded element, not fields this
// page builds (the step's Check: no card field exists
// anywhere in our pages — the card fields live inside
// the provider's own iframes). Everything else follows
// the sample: the heading form, the lede, the contents
// card with the Master's own list, the one-payment
// line, the email block's exact label, help and error
// lines, the mystery tease (permitted here — one of its
// two places, lib/results.ts), the card panel's head,
// the Pay button and the closing line.
//
// M9.5 adds the honest pre-payment screen on this same
// page, in the 17 Nov 2026 ruling's reading order —
// the buyer reads it, ticks the box, gives the
// delivery email and pays: the honesty area and the
// digital-content tick-box stand above the email
// block. As amended by the founder's Option A ruling
// (22 Nov 2026 — "one line, link and tick"), the
// honesty area is one line naming what the report is,
// with "Terms of service" a real link to the Terms
// page, then the price restated and the refund line;
// the as-built M9.5 form (a "What the report is not"
// heading over four not-lines) was replaced on the
// founder's judgement that the full list read as a
// laundry list on a payment page — the Terms page
// carries the full wording. Sample 9 rightly drew
// neither (the step's content postdates the sample);
// the Master was conformed in the same builds. The
// tick is captured
// with the payment itself — tick and timestamp ride in
// the payment's metadata (lib/server/payments.ts), so
// M9.10's order record can read the consent back
// (test T-PAY-06).
//
// NOT here, by the plan's own assignment: the success
// surface (Sample 10 is M9.6's), and the standalone
// Payment failed page (Sample 12 is M9.7's — a declined
// card is answered inline here, in the sample's
// error-line pattern).

export interface PaymentContentLine {
  lead: string;
  rest: string | null;
}

export interface ReportPaymentView {
  heading: string;
  subline: string | null;
  lede: string;
  contentsHeading: string;
  contents: PaymentContentLine[];
  priceLine: string;
  termsLineLead: string;
  termsLinkLabel: string;
  termsHref: string;
  honestyPriceLine: string;
  refundLine: string;
  consentLabel: string;
  emailLabel: string;
  emailHelp: string;
  emailPlaceholder: string;
  emailError: string;
  teaseEyebrow: string;
  teaseLine: string;
  cardTitle: string;
  payLabel: string;
  closingLine: string;
}

export const PAYMENT_LEDE =
  "You've seen the headlines for this home, free. The detailed report goes through every one of them properly.";

// The Master's list for the paid page (Sample 9),
// verbatim — lead-ins in the sample's bold, the flood
// line's tail in plain text. The holding page keeps its
// own pinned list (lib/report-door.ts) until M9.6's
// flip settles the page on one list; the two lists'
// drift is recorded in M9.4's prep (deviation 2).
export const PAYMENT_CONTENTS: PaymentContentLine[] = [
  { lead: "The breakdowns behind every headline", rest: null },
  { lead: "The flood findings in full", rest: ", with a location map for each check" },
  { lead: "The fuller EPC detail", rest: null },
  { lead: "Questions to ask the seller", rest: null },
  { lead: "One dated, print-ready document", rest: null },
];

// The honest pre-payment line (plan step M9.5, in the
// founder's Option A form, ruled 22 Nov 2026 — "one
// line, link and tick"). One line names what the
// report is and carries the buyer's agreement to the
// Terms, with "Terms of service" rendered as a real
// link to the Terms page, where the full wording
// lives (D9's wording and the "What the report is
// not" card, lib/site-pages.ts). The line is carried
// in parts so the link is rendered, never typed into
// the text: the lead, the link's label and target,
// and the composed line (the full stop stands after
// the link) for pinning. The founder approved these
// exact words in chat before this build is pushed
// (the M9.4 Terms precedent).
export const PAYMENT_TERMS_LINE_LEAD =
  "The report is information from official sources — not advice. By paying, you agree to our ";
export const PAYMENT_TERMS_LINK_LABEL = "Terms of service";
export const PAYMENT_TERMS_HREF = "/terms";
export const PAYMENT_TERMS_LINE = `${PAYMENT_TERMS_LINE_LEAD}${PAYMENT_TERMS_LINK_LABEL}.`;

// The price restated inside the honesty area (M9.5,
// gap 5): the tick is given against a stated price in
// the same eyeline, not only against the Pay button's
// label below the point where consent is given.
export const PAYMENT_HONESTY_PRICE_LINE = `${REPORT_PRICE_LABEL} — one payment, no subscription, nothing further to pay.`;

// The refund reassurance (founder ruling, M9.5 prep
// item 2: IN) — the Terms page's own sentence, verbatim
// (the Refunds card in lib/site-pages.ts); a test pins
// the two copies equal so they can never drift apart.
export const PAYMENT_REFUND_LINE =
  "If we cannot deliver your report, we refund the £4.99 in full, to the card you paid with — you do not need to ask.";

// The digital-content tick-box's label, verbatim from
// the plan's M9.5 step text — locked, never reworded.
// The tick is the buyer's agreement that the report is
// made and delivered straight away and that the usual
// 14-day change-of-mind right is lost once it is
// delivered (test T-PAY-06).
export const PAYMENT_CONSENT_LABEL =
  "Make my report now — I understand I lose the 14-day change-of-mind right once it is delivered.";

// Sample 9's email block, verbatim: the label (its
// "Required" tag is rendered by the component), the
// help line under it, the placeholder and the one
// error line a mistyped address is answered with.
export const PAYMENT_EMAIL_LABEL = "Email address for delivery";
export const PAYMENT_EMAIL_HELP =
  "Your report is delivered by email — there are no accounts and no passwords to remember.";
export const PAYMENT_EMAIL_PLACEHOLDER = "you@example.co.uk";
export const PAYMENT_EMAIL_ERROR =
  "That email address doesn't look quite right — check it and try again, so your report reaches you.";

export const PAYMENT_CARD_TITLE = "Card payment";
export const PAYMENT_CLOSING_LINE =
  "Payment is handled securely by Stripe, and we never see your card details.";

// The page's own failure lines (this build's copy, in
// Sample 9's error-line manner: name the failure, state
// plainly that nothing was charged, invite a retry).
// Provider error text never reaches the page — the
// translator answers in reason codes and these are the
// only lines a failure can surface as.
export const PAYMENT_START_FAILED_LINE =
  "We couldn't start the payment just now — nothing has been charged. Please try again.";
export const PAYMENT_HOME_NOT_FOUND_LINE =
  "We couldn't find that home — go back to your free check and start again from there.";
export const PAYMENT_DECLINED_FALLBACK_LINE =
  "Your payment didn't go through — check the card details and try again.";

// The interim completion line: shown when a payment
// confirms, until M9.6 builds Sample 10's success
// surface beside the fulfilment call and replaces it.
// The page is unreachable in the holding state, so no
// visitor can meet this line before M9.6 settles it.
export const PAYMENT_TAKEN_LINE = "Payment taken — your report will arrive by email.";

export function buildReportPaymentView(identity: ReportDoorIdentity): ReportPaymentView {
  const base = {
    lede: PAYMENT_LEDE,
    contentsHeading: REPORT_DOOR_CONTENTS_HEADING,
    contents: PAYMENT_CONTENTS,
    priceLine: REPORT_DOOR_PRICE_LINE,
    termsLineLead: PAYMENT_TERMS_LINE_LEAD,
    termsLinkLabel: PAYMENT_TERMS_LINK_LABEL,
    termsHref: PAYMENT_TERMS_HREF,
    honestyPriceLine: PAYMENT_HONESTY_PRICE_LINE,
    refundLine: PAYMENT_REFUND_LINE,
    consentLabel: PAYMENT_CONSENT_LABEL,
    emailLabel: PAYMENT_EMAIL_LABEL,
    emailHelp: PAYMENT_EMAIL_HELP,
    emailPlaceholder: PAYMENT_EMAIL_PLACEHOLDER,
    emailError: PAYMENT_EMAIL_ERROR,
    teaseEyebrow: BUY_BAR_MYSTERY_EYEBROW,
    teaseLine: BUY_BAR_MYSTERY_LINE,
    cardTitle: PAYMENT_CARD_TITLE,
    payLabel: `Pay ${REPORT_PRICE_LABEL}`,
    closingLine: PAYMENT_CLOSING_LINE,
  };
  switch (identity.kind) {
    case "home":
      return {
        ...base,
        heading: `The detailed report for ${identity.subject}`,
        subline: identity.subline,
      };
    case "postcode":
      return {
        ...base,
        heading: `The detailed report for ${identity.postcode}`,
        subline: identity.subline,
      };
    case "generic":
      return { ...base, heading: "The detailed report", subline: null };
  }
}

// A payment the server has started for this page: its
// client secret, and the exact page state it was
// started for — the delivery email and the consent
// timestamp it carries in its metadata (M9.5).
export interface StartedPayment {
  clientSecret: string;
  email: string;
  consentAt: string;
}

// The started payment that belongs to the page as it
// now stands — the component's one derivation, factored
// here so T-PAY-06's untick/edit behaviour is pinnable
// without a browser. A started payment counts only
// while the email it was created for still stands,
// shape-valid, AND the consent it was created under
// still stands: unticking (consentAt null) retires it,
// editing the email retires it, and re-ticking starts
// the count again from the new consent — so no
// confirmable payment can outlive a withdrawn tick.
export function liveStartedPayment(
  started: StartedPayment | null,
  current: { emailValid: boolean; email: string; consentAt: string | null },
): StartedPayment | null {
  if (!started || !current.emailValid || current.consentAt === null) return null;
  if (started.email !== current.email || started.consentAt !== current.consentAt) return null;
  return started;
}
