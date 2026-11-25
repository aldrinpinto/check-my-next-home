import { canonicalEmail, isEmailShape, normaliseEmail, type GiftGoneReason } from "./gift";
import {
  BUY_BAR_MYSTERY_EYEBROW,
  BUY_BAR_MYSTERY_LINE,
  GIFT_PILL_LABEL,
  GIFT_REPORT_BUTTON_LABEL,
} from "./results";
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
// BUG-215 (founder ruling, 24 Nov 2026) supersedes
// BUG-145's block: the card is now a SINGLE checkbox
// line in small print — the one line naming what the
// report is with its Terms link, followed by the
// change-of-mind sentence. The "Make my report now"
// tick label, the separate small-print paragraph, the
// Required pill and the bold price line are all gone;
// the price stands on the Pay button alone. The tick
// is captured
// with the payment itself — tick and timestamp ride in
// the payment's metadata (lib/server/payments.ts), so
// M9.10's order record can read the consent back
// (test T-PAY-06).
//
// Sample 2 "Checkout alongside" (founder, 24 Nov
// 2026) re-forms the page's LAYOUT, not its copy:
// the selling points (mystery tease + contents card)
// stand on the left and a single sticky checkout card
// on the right (desktop); on phones the checkout card
// stacks first, straight after the address. The
// checkout card carries, in order: the "Detailed
// report" head with no price, the plain one-payment
// line (below, no £4.99 prefix — the price shows only
// on the Pay button), the BUG-215 single-line consent,
// the email block, and the payment panel; the Card and
// Revolut Pay method rows stand visible from the
// start. The founder's two changes on the sample: no
// hint line under the Pay button, and no bold £4.99 at
// the top right of the checkout box (the real page
// never had the hint; the closing line under the
// button stays).
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
  consentTail: string;
  consentLabel: string;
  onePaymentLine: string;
  emailLabel: string;
  emailHelp: string;
  emailPlaceholder: string;
  emailError: string;
  teaseEyebrow: string;
  teaseLine: string;
  cardTitle: string;
  payLabel: string;
  // BUG-267: the paid form's label, carried alongside
  // payLabel so the button can follow the page's
  // actual state: payLabel is the gift variant's label
  // ("Get my free report") on a gift visit and the
  // paid label otherwise, while paidPayLabel is always
  // the paid label ("Pay £4.99"). The component picks
  // between them with effectivePayLabel (below) — a
  // gift visit whose email has been edited away from
  // the bound address shows the paid form (card rows,
  // "Powered by Stripe") and must show the paid
  // label, not the free one.
  paidPayLabel: string;
  closingLine: string;
  // BUG-223: the visit's claimed gift — the email the
  // gift is bound to, and the gift-applied line. All
  // three null on the ordinary paid page. The component
  // pre-fills the email with giftEmail and shows
  // giftLine; the gift applies while the entered email
  // still matches it — editing away reverts the page
  // to its paid form, because the gift is tied to that
  // email (Sample 22's promise) and no other.
  // BUG-347: giftPill carries the founder-chosen pill
  // "Your full report is free" (GIFT_PILL_LABEL, the
  // free-page header pill) — the payment page renders
  // it alongside the banner. Null on the paid page.
  giftEmail: string | null;
  giftLine: string | null;
  giftPill: string | null;
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
  // BUG-214 (founder ruling 24 Nov 2026): the flood
  // line's tail is trimmed — the lead stands alone.
  // (HCR-03, BUG-153, had named the mapped layers in
  // the tail; the founder has now removed the tail.)
  { lead: "The flood findings in full", rest: null },
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

// The digital-content tick-box's label (BUG-215,
// founder ruling 24 Nov 2026): the consent IS a
// single line in small print — the one line naming
// what the report is with its Terms link, followed by
// the change-of-mind sentence. The BUG-145 tick label
// ("Make my report now — …") is retired, with the
// separate small-print paragraph, the Required pill
// and the bold price line. The line is carried in
// parts so the link is rendered, never typed into the
// text: the terms lead, the link's label and target,
// the tail sentence, and the composed line for
// pinning. The tick is the buyer's agreement that the
// report is made and delivered straight away and that
// the usual 14-day change-of-mind right ends once it
// is delivered (test T-PAY-06).
export const PAYMENT_CONSENT_TAIL =
  " I understand the 14-day change-of-mind right ends when it's delivered.";
export const PAYMENT_CONSENT_LABEL = `${PAYMENT_TERMS_LINE}${PAYMENT_CONSENT_TAIL}`;

// The plain one-payment line (Sample 2, founder
// 24 Nov 2026): the checkout card's money line, with
// no £4.99 prefix — the price shows only on the Pay
// button. It is the same sentence the old bold price
// line carried, without the price.
export const PAYMENT_ONE_PAYMENT_LINE = "One payment, no subscription, nothing further to pay.";

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

// BUG-327 (25 Nov 2026): a blank field is told it is
// empty, not that it "doesn't look quite right" — the
// one line above answers only a mistyped address. New
// copy, in the site's plain voice, for the founder's
// review: it names the empty field and what the
// address is for.
export const PAYMENT_EMAIL_EMPTY_ERROR = "Enter the email address you want the report sent to.";

// BUG-327: the email error as the page now stands —
// one derivation for the start handler, the blur check
// and the tests, so a blank field and a mistyped one
// can never share a line again. Blank first: a field
// with nothing in it is empty, whatever its shape.
export function emailErrorFor(email: string): string | null {
  if (email.trim() === "") return PAYMENT_EMAIL_EMPTY_ERROR;
  if (!isEmailShape(normaliseEmail(email))) return PAYMENT_EMAIL_ERROR;
  return null;
}

// BUG-334: the gift applies while the entered email
// still matches the email the gift is bound to — the
// value-driven rule, factored here so it is pinnable
// without a browser. "Matches" is the canonical match
// (BUG-267): a variant of the bound address (+tag,
// dots, googlemail.com) is the same mailbox, so the
// gift still applies; only a genuinely different
// address leaves it. The page's gift state follows
// this value and nothing else — no click, no flag, no
// page-load finality: re-entering the bound email
// revives the gift form on the same page load.
export function giftEmailMatches(boundEmail: string | null, enteredEmail: string): boolean {
  return (
    boundEmail !== null &&
    canonicalEmail(normaliseEmail(enteredEmail)) === canonicalEmail(boundEmail)
  );
}

export const PAYMENT_CARD_TITLE = "Card payment";
export const PAYMENT_CLOSING_LINE =
  "Payment is handled securely by Stripe, and we never see your card details.";

// BUG-223 — the gift variant's words (approved Screen
// C, DRAFT lines 6–7, verbatim). The gift line is the
// success surface's gift-applied banner
// (GIFT_APPLIED_BANNER_LINE, lib/report-success.ts),
// in twin form here — the banner lives in the success
// module and this module already feeds it the refund
// line, so the twin keeps the import one-way; a test
// pins the two equal so they can never drift apart.
// The consent lead keeps the paid line's first
// sentence and swaps only the paying word for the
// ordering word (line 7: "By ordering, you agree to
// our " + the Terms link + the paid tail). The button
// starts the gifted order, never a payment (line 6).
// BUG-333 (25 Nov 2026): the panel keeps the paid
// page's own head — "Card payment" — for a gift
// holder too. Screen C's "Detailed report" panel head
// repeated the checkout card's own head above it, so
// the phrase stood twice on the page; the panel
// heading beside "Powered by Stripe" carries its own
// name instead. The gift variant therefore overrides
// no panel title: cardTitle stays PAYMENT_CARD_TITLE.
export const PAYMENT_GIFT_LINE =
  "Your free report gift has been applied — there's nothing to pay for this report.";
export const PAYMENT_GIFT_TERMS_LINE_LEAD =
  "The report is information from official sources — not advice. By ordering, you agree to our ";

// BUG-287 (founder, 25 Nov 2026): the locked-field
// form's words. While a claimed gift applies the
// delivery email field is locked to the address the
// gift was claimed with — the note names whose gift it
// is — and the escape link abandons the gift for this
// order, switching the page to its paid form. New
// copy, composed in the site's plain voice for the
// founder's review: the note states the tie and the
// delivery, nothing more.
export function paymentGiftLockedNote(email: string): string {
  return `This gift is tied to ${email} — the report will be delivered to that address.`;
}
export const PAYMENT_GIFT_USE_DIFFERENT_EMAIL = "Use a different email";

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

// BUG-339 (25 Nov 2026): the ONE decline message, in
// the site's voice — the declined card is answered
// here, never by the provider's own line under the
// card field, so two messages can never stand at
// once. It names the decline, states plainly that
// nothing was charged, and gives the next step (try
// again, or a different card); the page renders a
// link back to the free check beside it. New copy,
// composed in the site's plain voice for the
// founder's review: the first sentence is the site's
// own decline line as the live pass recorded it, the
// next step is the audit's proposed wording.
export const PAYMENT_DECLINED_LINE =
  "Your card has been declined — nothing has been charged. Check the card details and try again, or use a different card.";

// BUG-326 (25 Nov 2026): the card panel could not
// load — the provider's script failed — so the page
// says so plainly instead of leaving a dead Pay
// button. The audit's proposed wording, verbatim; the
// retry button beside it re-runs the load.
export const PAYMENT_CARD_LOAD_FAILED_LINE =
  "The card panel couldn't load — check your connection and try again";

// BUG-325 (25 Nov 2026): the gift the visit arrived
// with is no longer available at intent time — the
// server answered a payment, not a gift — so the page
// reconciles to the paid form and says so plainly.
// New copy, composed in the site's plain voice for
// the founder's review. This line names both ways a
// gift can go (expired, or already used) and stands
// where the server's answer carries no reason; where
// it carries one, paymentGiftGoneLine below names the
// one that happened, in this line's own wording.
export const PAYMENT_GIFT_NO_LONGER_AVAILABLE_LINE =
  "Your free report gift is no longer available — it has expired or has already been used. This report costs £4.99, so tick the box to pay for it.";

// BUG-325 follow-up (25 Nov 2026): the intent answer
// carries the reason the gift was gone, so the line
// names the one that happened — the cause clause alone
// changes, everything else is the line above, verbatim.
export const PAYMENT_GIFT_GONE_EXPIRED_LINE =
  "Your free report gift is no longer available — it has expired. This report costs £4.99, so tick the box to pay for it.";
export const PAYMENT_GIFT_GONE_ALREADY_USED_LINE =
  "Your free report gift is no longer available — it has already been used. This report costs £4.99, so tick the box to pay for it.";

// The gift-gone line for the reason the server
// carried, or the both-causes line where it carried
// none (a voided gift, or a reason that could not be
// read — the page never claims a cause it was not
// given).
export function paymentGiftGoneLine(reason: GiftGoneReason | null | undefined): string {
  if (reason === "expired") return PAYMENT_GIFT_GONE_EXPIRED_LINE;
  if (reason === "already-used") return PAYMENT_GIFT_GONE_ALREADY_USED_LINE;
  return PAYMENT_GIFT_NO_LONGER_AVAILABLE_LINE;
}

// BUG-329 (25 Nov 2026): no home was named — the
// payment page renders no checkout for a generic
// visit. New copy, composed in the site's plain voice
// for the founder's review: it says what is missing
// and points at the postcode box that names one.
export const PAYMENT_NO_HOME_LINE =
  "No home was named for this report — enter a postcode below to start a check.";

// BUG-217 (founder ruling, 24 Nov 2026): there is no
// interim line between a confirmed payment and the
// success surface — the buyer navigates straight from
// the payment screen to /report/success
// (components/ReportPaymentPage.tsx, onPaid). The
// taken-line constant this comment replaces painted for
// a frame while the success route fetched server-side,
// so it is deleted outright, not moved.

// The free-window form's failure line (M9.6), in the
// payment page's error-line manner: name the failure,
// invite a retry. Nothing was charged — there is
// nothing to charge — so the line says nothing about
// money.
export const WINDOW_START_FAILED_LINE =
  "We couldn't start your free report just now. Please try again.";

export function buildReportPaymentView(
  identity: ReportDoorIdentity,
  // BUG-223: the visit's claimed gift, resolved by the
  // route from the cmnh-gift cookie — the email the
  // gift is bound to. Absent on the ordinary paid page.
  gift?: { email: string } | null,
): ReportPaymentView {
  const base = {
    contentsHeading: REPORT_DOOR_CONTENTS_HEADING,
    contents: PAYMENT_CONTENTS,
    termsLineLead: PAYMENT_TERMS_LINE_LEAD,
    termsLinkLabel: PAYMENT_TERMS_LINK_LABEL,
    termsHref: PAYMENT_TERMS_HREF,
    consentTail: PAYMENT_CONSENT_TAIL,
    consentLabel: PAYMENT_CONSENT_LABEL,
    onePaymentLine: PAYMENT_ONE_PAYMENT_LINE,
    emailLabel: PAYMENT_EMAIL_LABEL,
    emailHelp: PAYMENT_EMAIL_HELP,
    emailPlaceholder: PAYMENT_EMAIL_PLACEHOLDER,
    emailError: PAYMENT_EMAIL_ERROR,
    teaseEyebrow: BUY_BAR_MYSTERY_EYEBROW,
    teaseLine: BUY_BAR_MYSTERY_LINE,
    cardTitle: PAYMENT_CARD_TITLE,
    payLabel: `Pay ${REPORT_PRICE_LABEL}`,
    paidPayLabel: `Pay ${REPORT_PRICE_LABEL}`,
    closingLine: PAYMENT_CLOSING_LINE,
    giftEmail: null as string | null,
    giftLine: null as string | null,
    giftPill: null as string | null,
  };
  // The gift variant: the button and the consent's
  // lead speak of the free report, never of paying —
  // and the closing line is empty, because Screen C
  // draws none. The heading, the contents card, the
  // tease and the consent's tail are the paid page's
  // own and stand unchanged; the panel head is the
  // paid page's own too ("Card payment", BUG-333).
  const gifted = gift
    ? {
        termsLineLead: PAYMENT_GIFT_TERMS_LINE_LEAD,
        payLabel: GIFT_REPORT_BUTTON_LABEL,
        closingLine: "",
        giftEmail: gift.email,
        giftLine: PAYMENT_GIFT_LINE,
        giftPill: GIFT_PILL_LABEL,
      }
    : {};
  const view = { ...base, ...gifted };
  switch (identity.kind) {
    case "home":
      return {
        ...view,
        heading: `The detailed report for ${identity.subject}`,
        subline: identity.subline,
      };
    case "postcode":
      return {
        ...view,
        heading: `The detailed report for ${identity.postcode}`,
        subline: identity.subline,
      };
    case "generic":
      return { ...view, heading: "The detailed report", subline: null };
  }
}

// The button's label as the page now stands — the
// component's one derivation, factored here so
// BUG-267's label switch is pinnable without a
// browser. The gift label stands only while the gift
// applies AND no payment stands: a standing payment
// is proof of the paid form (a gift order never
// creates one), so the stale-view race — a gift
// redeemed elsewhere between page load and click —
// still reads paid. Editing away from the bound
// address reverts the page to its paid form, and the
// button must say so.
export function effectivePayLabel(
  view: ReportPaymentView,
  giftApplies: boolean,
  hasActiveIntent: boolean,
): string {
  return giftApplies && !hasActiveIntent ? view.payLabel : view.paidPayLabel;
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
