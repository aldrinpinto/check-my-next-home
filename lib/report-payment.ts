import { BUY_BAR_MYSTERY_EYEBROW, BUY_BAR_MYSTERY_LINE } from "./results";
import {
  REPORT_DOOR_CONTENTS_HEADING,
  REPORT_DOOR_PRICE_LINE,
  type ReportDoorIdentity,
} from "./report-door";
import { REPORT_PRICE_LABEL } from "./site";

// The payment page's view (plan step M9.4; Final Sample
// Master, Sample 9 — the Payment view, carried in
// 17 Nov 2026). The page is the report door's paid
// state, built in full at this step and rendered only
// when M9.6 flips REPORT_DOOR_STATE with fulfilment
// behind it; until then the door renders its holding
// form and this view is exercised by forced-state tests
// (the M8.9 company block's pattern).
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
// NOT here, by the plan's own assignment: the honest
// pre-payment wording and tick-box (M9.5's content on
// this same page — Sample 9 rightly shows neither), the
// success surface (Sample 10 is M9.6's), and the
// standalone Payment failed page (Sample 12 is M9.7's —
// a declined card is answered inline here, in the
// sample's error-line pattern).

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
