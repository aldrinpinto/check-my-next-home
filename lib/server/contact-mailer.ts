// The contact mailer (BUG-028 fix; founder ruling
// 19 Nov 2026; the acknowledgement added at GAP-1,
// founder ruling 22 Nov 2026).
//
// The Contact form sends TWO emails once a message is
// STORED (lib/server/contact.ts — storage is what
// "received" means):
//
//   - The NOTIFICATION carries the message to the
//     contact inbox so a human reads and answers it.
//     It goes TO the site's own contact address
//     (lib/site-pages.ts's CONTACT_EMAIL_ADDRESS — the
//     same address the page offers as its mailto
//     route), with reply-to set to the VISITOR's
//     address, so answering the notification answers
//     the visitor. Its subject names it a website
//     contact message, with the visitor's name
//     composed after (the pinned words are
//     lib/site-pages.ts's CONTACT_NOTIFICATION_SUBJECT).
//
//   - The ACKNOWLEDGEMENT goes back TO THE SENDER on
//     the same submission. Until GAP-1 nothing at all
//     was emailed to the person who wrote in — the
//     on-screen thanks was the whole answer. Its words
//     are Sample 38 of the Final Sample Master
//     (founder-approved 22 Nov 2026, held in
//     lib/site-pages.ts), dressed in the designed
//     email shell (lib/email-shell.ts — the delivery
//     email's dress, BUG-134).
//
// The seam is the gift mailer's (lib/server/
// gift-mailer.ts), in its exact discipline: sending is
// a value, never a throw — { sent: true } or
// { sent: false, reason } — and a failed or impossible
// send NEVER un-receives a stored message: the submit
// flow logs the failure server-side and the visitor
// still sees the thanks, because the message was
// received. Only a storage failure may show the
// visitor the failure state.
//
// Configuration is PER SEND: each email carries its
// own FROM name (CONTACT_NOTIFICATION_FROM,
// CONTACT_ACKNOWLEDGEMENT_FROM), so either can be live
// without the other — a send whose FROM is unplaced
// answers not-configured while its sibling sends. The
// Resend key (RESEND_API_KEY) is placed in the
// server's .env.local and reaches the app container
// through docker-compose.yml (the EM-14 wiring fix,
// 22 Nov 2026); Resend is the project's sender (D8;
// the Privacy policy names it).
//
// Two implementations (no capture seam — the tests
// inject fakes at the interface, and no e2e exercises
// these emails):
//   - Resend — the real sends, selected when the
//     environment carries the key.
//   - Unconfigured — answers not-configured.

import type { ContactInput } from "../contact";
import {
  DOWNLOAD_EMAIL_FOOTER_LINE,
  DOWNLOAD_EMAIL_GREETING,
  DOWNLOAD_EMAIL_QUESTIONS_LINE,
  DOWNLOAD_EMAIL_SIGN_OFF,
  DOWNLOAD_EMAIL_TEAM_LINE,
} from "../download";
import {
  EMAIL_SERIF,
  designedEmailHtml,
  emailFooterHtml,
  emailSignOffRowHtml,
  mailtoLineHtml,
} from "../email-shell";
import { SITE_NAME } from "../site";
import {
  CONTACT_ACKNOWLEDGEMENT_BODY,
  CONTACT_ACKNOWLEDGEMENT_CLOSING_LINE,
  CONTACT_ACKNOWLEDGEMENT_HEADING,
  CONTACT_ACKNOWLEDGEMENT_SUBJECT,
  CONTACT_EMAIL_ADDRESS,
  CONTACT_NOTIFICATION_SUBJECT,
} from "../site-pages";

export type ContactMailResult = { sent: true } | { sent: false; reason: string };

export interface ContactMailer {
  sendContactNotification(input: ContactInput): Promise<ContactMailResult>;
  sendContactAcknowledgement(input: ContactInput): Promise<ContactMailResult>;
}

export function contactNotificationSubject(name: string): string {
  return `${CONTACT_NOTIFICATION_SUBJECT} from ${name}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function notificationBodies(input: ContactInput): { text: string; html: string } {
  const text = [
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    "",
    input.message,
    "",
    SITE_NAME,
  ].join("\n");
  const html = [
    `<p><strong>Name:</strong> ${escapeHtml(input.name)}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(input.email)}</p>`,
    `<p>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p>`,
    `<p>${SITE_NAME}</p>`,
  ].join("\n");
  return { text, html };
}

// The acknowledgement's composition (GAP-1): Sample
// 38's words verbatim — heading, greeting, the two
// body lines — then the shared sign-off and the
// footer furniture exactly as the delivery email
// closes (the questions line with its mailto, over
// the name-and-domain line), in the designed shell.
// Nothing of the visitor's own words is echoed back;
// the email confirms receipt, it does not quote.
function acknowledgementBodies(): { subject: string; text: string; html: string } {
  const text = [
    CONTACT_ACKNOWLEDGEMENT_HEADING,
    "",
    DOWNLOAD_EMAIL_GREETING,
    "",
    CONTACT_ACKNOWLEDGEMENT_BODY,
    "",
    CONTACT_ACKNOWLEDGEMENT_CLOSING_LINE,
    "",
    DOWNLOAD_EMAIL_SIGN_OFF,
    DOWNLOAD_EMAIL_TEAM_LINE,
    "",
    DOWNLOAD_EMAIL_QUESTIONS_LINE,
    "",
    DOWNLOAD_EMAIL_FOOTER_LINE,
  ].join("\n");
  const bodyP = `font-size:15.5px;line-height:1.65;margin:0 0 15px;`;
  const html = designedEmailHtml({
    contentHtml: [
      `<h2 style="font-family:${EMAIL_SERIF};font-size:24px;font-weight:600;color:#1E402C;margin:0 0 12px;line-height:1.3;">${CONTACT_ACKNOWLEDGEMENT_HEADING}</h2>`,
      `<p style="${bodyP}">${DOWNLOAD_EMAIL_GREETING}</p>`,
      `<p style="${bodyP}">${CONTACT_ACKNOWLEDGEMENT_BODY}</p>`,
      `<p style="${bodyP}">${CONTACT_ACKNOWLEDGEMENT_CLOSING_LINE}</p>`,
    ],
    signOffHtml: emailSignOffRowHtml(DOWNLOAD_EMAIL_SIGN_OFF, DOWNLOAD_EMAIL_TEAM_LINE),
    footerHtml: emailFooterHtml({
      linesHtml: mailtoLineHtml(
        DOWNLOAD_EMAIL_QUESTIONS_LINE,
        CONTACT_EMAIL_ADDRESS,
        "color:#4A5548;font-weight:600;",
      ),
      footerLine: DOWNLOAD_EMAIL_FOOTER_LINE,
      wrapStyle:
        "border-top:1px solid #E3DCC4;margin-top:18px;padding:16px 0 22px;font-size:13px;color:#4A5548;line-height:1.6;",
    }),
  });
  return { subject: CONTACT_ACKNOWLEDGEMENT_SUBJECT, text, html };
}

export function createUnconfiguredContactMailer(): ContactMailer {
  return {
    async sendContactNotification() {
      return { sent: false, reason: "not-configured" };
    },
    async sendContactAcknowledgement() {
      return { sent: false, reason: "not-configured" };
    },
  };
}

export function createResendContactMailer(config: {
  apiKey: string;
  from?: string;
  acknowledgementFrom?: string;
  fetchImpl?: typeof fetch;
}): ContactMailer {
  const fetchImpl = config.fetchImpl ?? fetch;
  const post = async (body: Record<string, string>): Promise<ContactMailResult> => {
    try {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { sent: false, reason: `resend-${response.status}` };
      return { sent: true };
    } catch {
      return { sent: false, reason: "send-failed" };
    }
  };
  return {
    async sendContactNotification(input) {
      if (!config.from) return { sent: false, reason: "not-configured" };
      const { text, html } = notificationBodies(input);
      return post({
        from: config.from,
        to: CONTACT_EMAIL_ADDRESS,
        reply_to: input.email,
        subject: contactNotificationSubject(input.name),
        text,
        html,
      });
    },
    async sendContactAcknowledgement(input) {
      if (!config.acknowledgementFrom) return { sent: false, reason: "not-configured" };
      const { subject, text, html } = acknowledgementBodies();
      return post({
        from: config.acknowledgementFrom,
        to: input.email,
        subject,
        text,
        html,
      });
    },
  };
}

// The factory the route calls. Selection is by
// environment: a configured Resend (the key present —
// each send then stands or falls on its own FROM
// name), else unconfigured.
export function getContactMailer(): ContactMailer {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return createUnconfiguredContactMailer();
  return createResendContactMailer({
    apiKey,
    from: process.env.CONTACT_NOTIFICATION_FROM,
    acknowledgementFrom: process.env.CONTACT_ACKNOWLEDGEMENT_FROM,
  });
}
