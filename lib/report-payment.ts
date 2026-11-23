import { BUY_BAR_MYSTERY_EYEBROW, BUY_BAR_MYSTERY_LINE } from "./results";
import { REPORT_DOOR_CONTENTS_HEADING, type ReportDoorIdentity } from "./report-door";
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
// the sample: the heading form, the contents
// card with the Master's own list, the email block's exact label, help and error
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
// payment-flow parity stack (22 Nov 2026) then took
// the one-payment line OUT of the contents card
// (BUG-131: the honesty block below is the single
// money statement — the view no longer carries a
// price line at all), moved the mystery tease to
// directly under the intro (BUG-133), and gave the
// consent tick its Required tag and its own error
// line (BUG-132). BUG-145 (founder, 22 Nov 2026, as
// amended) then re-formed the block itself: the
// consent tick stands FIRST, in the founder's own
// re-dictated words; below it, as small print, the
// one line naming what the report is with its Terms
// link, then the bold price line; the refund line is
// removed from the block entirely (it stands in the
// Terms, and on the success surface's failed state).
// The tick is captured
// with the payment itself — tick and timestamp ride in
// the payment's metadata (lib/server/payments.ts), so
// M9.10's order record can read the consent back
// (test T-PAY-06).
//
// NOT here, by the plan's own assignment: the
// standalone Payment failed page (Sample 12 is M9.7's
// — a declined card is answered inline here, in the
// sample's error-line pattern). The success surface
// (Sample 10) is M9.6's, built beside the fulfilment
// call in lib/report-success.ts: a confirmed payment
// leaves this page for it.

export interface PaymentContentLine {
  lead: string;
  rest: string | null;
}

export interface ReportPaymentView {
  heading: string;
  subline: string | null;
  contentsHeading: string;
  contents: PaymentContentLine[];
  termsLineLead: string;
  termsLinkLabel: string;
  termsHref: string;
  honestyPriceLine: string;
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

// BUG-174 (founder, 23 Nov 2026): the page's lede —
// "You've seen the headlines for this home, free…" —
// is removed entirely, at the founder's instruction.
// The page opens with its heading and goes straight
// to the tease and the contents. The two similar door
// lines in lib/report-door.ts are different sentences
// and stand untouched.

// The Master's list for the paid page (Sample 9),
// verbatim — lead-ins in the sample's bold, the flood
// line's tail in plain text. The holding page keeps its
// own pinned list (lib/report-door.ts) until M9.6's
// flip settles the page on one list; the two lists'
// drift is recorded in M9.4's prep (deviation 2).
export const PAYMENT_CONTENTS: PaymentContentLine[] = [
  { lead: "The breakdowns behind every headline", rest: null },
  // HCR-03 (BUG-153): the same correction as the results
  // strip — maps exist for the flood zones and surface
  // water only, never "for each check".
  {
    lead: "The flood findings in full",
    rest: ", with location maps for the flood zones and surface water",
  },
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

// The refund reassurance — the Terms page's own
// sentence, verbatim (the Refunds card in
// lib/site-pages.ts); a test pins the two copies equal
// so they can never drift apart. It stood on this
// page's payment block until BUG-145's amendment
// (founder, 22 Nov 2026): the line is REMOVED from the
// payment block entirely — the promise itself is
// unchanged and stands in the Terms. The constant now
// serves only the success surface's failed state
// (lib/report-success.ts), where the same sentence
// answers a fulfilment failure.
export const PAYMENT_REFUND_LINE =
  "If we cannot deliver your report, we refund the £4.99 in full, to the card you paid with — you do not need to ask.";

// The digital-content tick-box's label. The M9.5 plan
// text's wording stood until the founder re-dictated
// the block (BUG-145, 22 Nov 2026): the tick now leads
// the block and carries his exact words. The tick is
// the buyer's agreement that the report is made and
// delivered straight away and that the usual 14-day
// change-of-mind right ends once it is delivered
// (test T-PAY-06).
export const PAYMENT_CONSENT_LABEL =
  "Make my report now — I understand the 14-day change-of-mind right ends when it's delivered.";

// The consent error (BUG-132, payment-flow parity
// stack, 22 Nov 2026): shown directly under the tick
// line when the buyer tries to pay without ticking —
// the disabled button alone never said why. New copy,
// composed in the site's plain voice for the founder's
// review: it names the action and ties it to what the
// tick means, in the tick label's own terms.
export const PAYMENT_CONSENT_ERROR_LINE =
  "Tick this box to continue — it confirms you understand the report is made for you straight away, and that the 14-day change-of-mind right ends once it is delivered.";

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

// M9.6: the interim line above is REPLACED — a confirmed
// payment (and a gift-applied order) moves the buyer to
// the success surface (lib/report-success.ts, Sample
// 10), which reads the fulfilment state server-side.
// The constant stands only for the brief moment between
// the provider's confirmation and that navigation.

// The free-window form's failure line (M9.6), in the
// payment page's error-line manner: name the failure,
// invite a retry. Nothing was charged — there is
// nothing to charge — so the line says nothing about
// money.
export const WINDOW_START_FAILED_LINE =
  "We couldn't start your free report just now. Please try again.";

export function buildReportPaymentView(identity: ReportDoorIdentity): ReportPaymentView {
  const base = {
    contentsHeading: REPORT_DOOR_CONTENTS_HEADING,
    contents: PAYMENT_CONTENTS,
    termsLineLead: PAYMENT_TERMS_LINE_LEAD,
    termsLinkLabel: PAYMENT_TERMS_LINK_LABEL,
    termsHref: PAYMENT_TERMS_HREF,
    honestyPriceLine: PAYMENT_HONESTY_PRICE_LINE,
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
// timestamp it carries in its metadata (M9.5) — plus
// the publishable key of the lane that created it
// (M9.6, the test lane): the card element initialises
// from the SAME key set that created the payment, or
// its confirmation would be spoken to the wrong
// account. M9.7 adds the payment's own id: it is the
// order's reference — the success surface's key, and
// the reference the return landing's address carries
// (the confirm call's return_url names it, so a
// bank-approval detour returns to the order's own
// landing whatever the provider appends).
export interface StartedPayment {
  clientSecret: string;
  email: string;
  consentAt: string;
  publishableKey: string | null;
  intentId: string;
}

// The key the card element initialises from: the
// started payment's own lane key where the intent
// answer carried one, else the page's key (the default
// set's, handed down as page data). On a one-key-set
// server the two are the same key; on the live site a
// tester's element must initialise from the TEST key
// or it cannot confirm a test payment.
export function paymentElementKey(
  started: StartedPayment | null,
  pageKey: string | null,
): string | null {
  return started?.publishableKey ?? pageKey;
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
