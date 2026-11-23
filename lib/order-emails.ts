// The order emails' composition (plan step M9.10) —
// the pure half: every word the step sends, composed
// without a database, a clock on the wall or a mailer.
//
// FIVE emails stand here:
//
//   - failedPaymentEmail — Sample 40 of the Final
//     Sample Master, VERBATIM: the email sibling of
//     Sample 12's on-screen answer, for the buyer whose
//     payment did not go through and who never comes
//     back to the page. Sent from the webhook, once
//     per payment (lib/server/fulfilment.ts holds the
//     discipline; this file holds only the words).
//   - fulfilmentFailureEmail — Sample 41, VERBATIM:
//     a paid buyer's report could not be made. The
//     sample's refund line is the sample's own
//     paraphrase of the Terms sentence — the sample
//     governs the email, and it is NOT harmonised with
//     the verbatim form M9.7 pinned for the on-screen
//     failed state (the prep records the difference on
//     purpose).
//   - giftClaimedEmail — Sample 42, VERBATIM: the
//     buyer who gave a Check Together gift hears when
//     it is claimed. No button, no link beyond the
//     footer — as drawn.
//   - saleAlertEmail and ownerFailureAlertEmail — the
//     OWNER emails. No Master sample exists for either
//     (the prep's deviation 2): their words are the
//     M9.10 DRAFT samples (qa-cmnh/M910-DRAFT-SAMPLES
//     .html), drawn outside the Master under ruling R2
//     in the internal pattern Samples 37 and 39
//     establish — the designed shell, labelled fact
//     lines, the footer site line, and NO customer
//     sign-off. They fold into the Master only when
//     the founder approves the drafts.
//
// The three buyer emails wear the designed shell
// (lib/email-shell.ts, BUG-134) and close with the
// download emails' shared furniture — the sign-off,
// the questions line, the name-and-domain footer —
// exactly as their samples draw. Their FROM is the
// report mailer's own (reports@checkmynexthome.co.uk,
// the samples' drawn sender). The owner emails are
// sent by lib/server/owner-mailer.ts from the placed
// contact@ value to the project inbox.
//
// The composed prices ride REPORT_PRICE_LABEL, the
// same label the whole product composes — the
// samples' £4.99 is that label's launch value, and
// pins hold the composed lines equal to the samples'
// words (the payment-failed view's own discipline,
// lib/report-payment-failed.ts).

import {
  DOWNLOAD_EMAIL_FOOTER_LINE,
  DOWNLOAD_EMAIL_GREETING,
  DOWNLOAD_EMAIL_QUESTIONS_LINE,
  DOWNLOAD_EMAIL_SIGN_OFF,
  DOWNLOAD_EMAIL_TEAM_LINE,
  type ComposedEmail,
} from "./download";
import {
  EMAIL_SERIF,
  designedEmailHtml,
  emailFooterHtml,
  emailSignOffRowHtml,
  mailtoLineHtml,
} from "./email-shell";
import { CONTACT_EMAIL_ADDRESS } from "./site-pages";
import { REPORT_PRICE_LABEL } from "./site";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BODY_P = `font-size:15.5px;line-height:1.65;margin:0 0 15px;`;
const FOOTER_WRAP =
  "border-top:1px solid #E3DCC4;margin-top:18px;padding:16px 0 22px;font-size:13px;color:#4A5548;line-height:1.6;";

// The buyer emails' closing furniture — the delivery
// email's own (lib/download.ts): the sign-off row,
// then the questions line with its address standing
// as a mailto link, over the name-and-domain line.
function buyerClosing(): { signOffHtml: string; footerHtml: string } {
  return {
    signOffHtml: emailSignOffRowHtml(DOWNLOAD_EMAIL_SIGN_OFF, DOWNLOAD_EMAIL_TEAM_LINE),
    footerHtml: emailFooterHtml({
      linesHtml: mailtoLineHtml(
        DOWNLOAD_EMAIL_QUESTIONS_LINE,
        CONTACT_EMAIL_ADDRESS,
        "color:#4A5548;font-weight:600;",
      ),
      footerLine: DOWNLOAD_EMAIL_FOOTER_LINE,
      wrapStyle: FOOTER_WRAP,
    }),
  };
}

function buyerText(parts: string[]): string {
  return [
    ...parts,
    "",
    DOWNLOAD_EMAIL_SIGN_OFF,
    DOWNLOAD_EMAIL_TEAM_LINE,
    "",
    DOWNLOAD_EMAIL_QUESTIONS_LINE,
    "",
    DOWNLOAD_EMAIL_FOOTER_LINE,
  ].join("\n");
}

function headingHtml(heading: string): string {
  return `<h2 style="font-family:${EMAIL_SERIF};font-size:24px;font-weight:600;color:#1E402C;margin:0 0 12px;line-height:1.3;">${escapeHtml(heading)}</h2>`;
}

// ----------------------------------------------------------------
// Sample 40 — the failed-payment email.

export const PAYMENT_FAILED_EMAIL_SUBJECT = "Your payment didn't go through";
export const PAYMENT_FAILED_EMAIL_HEADING = PAYMENT_FAILED_EMAIL_SUBJECT;
export const PAYMENT_FAILED_EMAIL_BUTTON = "Try the payment again";
export const PAYMENT_FAILED_EMAIL_FINE_PRINT =
  "The link takes you back to the payment page for this home.";

export function failedPaymentEmail(input: {
  // The home's full address line ("12 Willow Close,
  // Millbrook MB3 4QX") — title plus postcode, the
  // form the sample's not-charged line names.
  homeAddressLine: string;
  // The absolute URL of the home's payment page (the
  // door), built on the request's public origin.
  paymentUrl: string;
}): ComposedEmail {
  const notCharged =
    `Don't worry — this happens, and nothing is lost. You have not been charged, ` +
    `and no report has been ordered for ${input.homeAddressLine}.`;
  const tryAgain =
    `It usually sorts itself out with a quick check with your bank, a different ` +
    `card, or a second look at the card details. Whenever you're ready, you can ` +
    `try again — the report is still ${REPORT_PRICE_LABEL}, and your free check ` +
    `is exactly as you left it.`;
  const text = buyerText([
    PAYMENT_FAILED_EMAIL_HEADING,
    "",
    DOWNLOAD_EMAIL_GREETING,
    "",
    notCharged,
    "",
    tryAgain,
    "",
    `${PAYMENT_FAILED_EMAIL_BUTTON}: ${input.paymentUrl}`,
    "",
    PAYMENT_FAILED_EMAIL_FINE_PRINT,
  ]);
  const { signOffHtml, footerHtml } = buyerClosing();
  const html = designedEmailHtml({
    contentHtml: [
      headingHtml(PAYMENT_FAILED_EMAIL_HEADING),
      `<p style="${BODY_P}">${DOWNLOAD_EMAIL_GREETING}</p>`,
      // The sample's one emphasis: "You have not been
      // charged" stands strong, as Sample 12's lede
      // carries it on screen.
      `<p style="${BODY_P}">${escapeHtml(notCharged).replace(
        "You have not been charged",
        "<strong>You have not been charged</strong>",
      )}</p>`,
      `<p style="${BODY_P}">${escapeHtml(tryAgain)}</p>`,
      `<a href="${escapeHtml(input.paymentUrl)}" style="display:block;text-align:center;background-color:#C29A3B;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:16.5px;padding:15px 20px;border-radius:11px;margin:20px 0 14px;">${PAYMENT_FAILED_EMAIL_BUTTON}</a>`,
      `<p style="font-size:13.5px;color:#4A5548;line-height:1.6;text-align:center;margin:10px 0 4px;">${PAYMENT_FAILED_EMAIL_FINE_PRINT}</p>`,
    ],
    signOffHtml,
    footerHtml,
  });
  return { subject: PAYMENT_FAILED_EMAIL_SUBJECT, text, html };
}

// ----------------------------------------------------------------
// Sample 41 — the fulfilment-failure email (paid
// buyers only: the words speak of a payment).

export function fulfilmentFailureEmail(input: {
  homeTitle: string;
  homeAddressLine: string;
}): ComposedEmail {
  const subject = `We're sorry — we couldn't make your report for ${input.homeTitle}`;
  const heading = "We're sorry — your report couldn't be made";
  const wentThrough =
    `Your payment of ${REPORT_PRICE_LABEL} went through, but something on our ` +
    `side stopped us making your detailed report for ${input.homeAddressLine}. ` +
    `We're sorry — that's ours to put right.`;
  const whatNext =
    `Here's what happens next: we're already looking into it, and when your ` +
    `report is ready it will arrive in this inbox, like any other. You don't ` +
    `need to do anything.`;
  const refundLine =
    `And if we can't put it right, we'll refund the ${REPORT_PRICE_LABEL} in ` +
    `full, to the card you paid with — you won't need to ask.`;
  const text = buyerText([
    heading,
    "",
    DOWNLOAD_EMAIL_GREETING,
    "",
    wentThrough,
    "",
    whatNext,
    "",
    refundLine,
  ]);
  const { signOffHtml, footerHtml } = buyerClosing();
  const html = designedEmailHtml({
    contentHtml: [
      headingHtml(heading),
      `<p style="${BODY_P}">${DOWNLOAD_EMAIL_GREETING}</p>`,
      `<p style="${BODY_P}">${escapeHtml(wentThrough)}</p>`,
      `<p style="${BODY_P}">${escapeHtml(whatNext)}</p>`,
      `<p style="${BODY_P}">${escapeHtml(refundLine)}</p>`,
    ],
    signOffHtml,
    footerHtml,
  });
  return { subject, text, html };
}

// ----------------------------------------------------------------
// Sample 42 — the gift-claimed email.

export const GIFT_CLAIMED_EMAIL_SUBJECT = "Your Check Together gift has been claimed";
export const GIFT_CLAIMED_EMAIL_HEADING = "Good news — your gift has been claimed";

export function giftClaimedEmail(input: { homeTitle: string }): ComposedEmail {
  const claimed =
    `The free detailed report that came with your report for ${input.homeTitle} ` +
    `has been claimed — the person you shared it with is now checking a home of ` +
    `their own, on us.`;
  const nothingChanges =
    `Nothing changes for you: your own report is yours to keep, exactly as ` +
    `before. We just thought you'd like to know your gift found its home.`;
  const text = buyerText([
    GIFT_CLAIMED_EMAIL_HEADING,
    "",
    DOWNLOAD_EMAIL_GREETING,
    "",
    claimed,
    "",
    nothingChanges,
  ]);
  const { signOffHtml, footerHtml } = buyerClosing();
  const html = designedEmailHtml({
    contentHtml: [
      headingHtml(GIFT_CLAIMED_EMAIL_HEADING),
      `<p style="${BODY_P}">${DOWNLOAD_EMAIL_GREETING}</p>`,
      `<p style="${BODY_P}">${escapeHtml(claimed)}</p>`,
      `<p style="${BODY_P}">${escapeHtml(nothingChanges)}</p>`,
    ],
    signOffHtml,
    footerHtml,
  });
  return { subject: GIFT_CLAIMED_EMAIL_SUBJECT, text, html };
}

// ----------------------------------------------------------------
// The owner emails (the M9.10 draft samples — see the
// header). Labelled fact lines in the designed shell,
// the footer site line, no customer sign-off.

// The order kind as the owner emails name it — with a
// test order marked plainly (ruling R6).
export function orderKindLabel(kind: "paid" | "gifted" | "free", testOrder: boolean): string {
  const base = kind === "paid" ? "Paid order" : kind === "gifted" ? "Gifted order" : "Free order";
  return testOrder ? `${base} — TEST` : base;
}

// The moment an order was taken, in the owner's own
// terms and timezone: "23 November 2026 at 08:15".
export function orderDateTimeLabel(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")} at ${part("hour")}:${part("minute")}`;
}

interface FactLine {
  label: string;
  value: string;
}

function ownerEmail(input: {
  subject: string;
  heading: string;
  facts: FactLine[];
  closing: string;
}): ComposedEmail {
  const text = [
    input.heading,
    "",
    ...input.facts.map((fact) => `${fact.label}: ${fact.value}`),
    "",
    input.closing,
    "",
    DOWNLOAD_EMAIL_FOOTER_LINE,
  ].join("\n");
  const html = designedEmailHtml({
    contentHtml: [
      headingHtml(input.heading),
      ...input.facts.map(
        (fact) =>
          `<p style="font-size:15.5px;line-height:1.55;margin:0 0 6px;"><strong>${escapeHtml(fact.label)}:</strong> ${escapeHtml(fact.value)}</p>`,
      ),
      `<p style="${BODY_P}margin-top:14px;">${escapeHtml(input.closing)}</p>`,
    ],
    // Internal mail carries no customer sign-off
    // (Samples 37 and 39): the shell's sign-off row
    // stands empty.
    signOffHtml: "",
    footerHtml: emailFooterHtml({
      linesHtml: "",
      footerLine: DOWNLOAD_EMAIL_FOOTER_LINE,
      wrapStyle: FOOTER_WRAP,
    }),
  });
  return { subject: input.subject, text, html };
}

// Draft A — the sale alert. Fires at fulfilment
// (ruling R1), with the buyer's stored PDF attached
// by the caller (the attachment is the mailer's
// business, not the composition's).
export function saleAlertEmail(input: {
  // The moment the order was taken (the order
  // record's creation), the buyer's email, the home's
  // address line, the order's own reference, and
  // whether the order issued its Check Together gift.
  orderedAt: Date;
  buyerEmail: string;
  homeAddressLine: string;
  homeTitle: string;
  orderRef: string;
  testOrder: boolean;
  giftIssued: boolean;
}): ComposedEmail {
  return ownerEmail({
    subject: `New report sale — ${input.homeTitle}`,
    heading: "A report has sold",
    facts: [
      { label: "When", value: orderDateTimeLabel(input.orderedAt) },
      { label: "Buyer", value: input.buyerEmail },
      { label: "Home", value: input.homeAddressLine },
      { label: "Amount", value: REPORT_PRICE_LABEL },
      { label: "Order reference", value: input.orderRef },
      { label: "Kind", value: orderKindLabel("paid", input.testOrder) },
      { label: "Gift issued", value: input.giftIssued ? "Yes" : "No" },
    ],
    closing:
      "The buyer's report is attached — the exact PDF stored for this order, the same file the buyer was sent.",
  });
}

// Draft B — the owner fulfilment-failure alert. Fires
// at the same terminal moment as the buyer's Sample
// 41 email (paid orders) — and alone for gifted and
// free orders, whose buyers get no failure email.
export function ownerFailureAlertEmail(input: {
  orderRef: string;
  // The home's title (the subject's name for it) and
  // its full address line (the Home fact) — each the
  // bare postcode where the home does not resolve.
  homeTitle: string;
  homeAddressLine: string;
  buyerEmail: string;
  kind: "paid" | "gifted" | "free";
  testOrder: boolean;
  attempts: number;
  reason: string;
}): ComposedEmail {
  return ownerEmail({
    subject: `A report couldn't be made — ${input.homeTitle}`,
    heading: "A report couldn't be made",
    facts: [
      { label: "Order reference", value: input.orderRef },
      { label: "Home", value: input.homeAddressLine },
      { label: "Buyer", value: input.buyerEmail },
      { label: "Kind", value: orderKindLabel(input.kind, input.testOrder) },
      { label: "Attempts", value: String(input.attempts) },
      { label: "Reason", value: input.reason },
    ],
    closing:
      input.kind === "paid"
        ? "The buyer has been emailed — the message says the report couldn't be made, that we're looking into it, and that a full refund follows if it can't be put right."
        : "No email has gone to the buyer — the failure email speaks of a payment, so it is sent for paid orders only.",
  });
}
