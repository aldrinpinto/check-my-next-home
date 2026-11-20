// The contact notification mailer (BUG-028 fix;
// founder ruling 19 Nov 2026).
//
// The Contact form's second step: once a message is
// STORED (lib/server/contact.ts — storage is what
// "received" means), a notification email carries it
// to the contact inbox so a human reads and answers
// it. The seam is the gift mailer's (lib/server/
// gift-mailer.ts), in its exact discipline: sending is
// a value, never a throw — { sent: true } or
// { sent: false, reason } — and a failed or impossible
// notification NEVER un-receives a stored message: the
// submit flow logs the failure server-side and the
// visitor still sees the thanks, because the message
// was received. Only a storage failure may show the
// visitor the failure state.
//
// Two implementations (no capture seam — the tests
// inject fakes at the interface, and no e2e exercises
// this email):
//   - Resend — the real send, used when the environment
//     carries the key and the from address. Resend is
//     the project's sender (D8; the Privacy policy
//     names it). The play server carries NO
//     RESEND_API_KEY today, so there this implementation
//     is simply never selected and every stored message's
//     notification answers not-configured — logged, and
//     the message still received, honestly: the inbox
//     email is a courtesy copy of a stored fact, not
//     the fact itself.
//   - Unconfigured — answers not-configured.
//
// The notification goes TO the site's own contact
// address (lib/site-pages.ts's CONTACT_EMAIL_ADDRESS —
// the same address the page offers as its mailto
// route), with reply-to set to the VISITOR's address,
// so answering the notification answers the visitor.
// Its subject names it a website contact message, with
// the visitor's name composed after (the pinned words
// are lib/site-pages.ts's CONTACT_NOTIFICATION_SUBJECT).

import type { ContactInput } from "../contact";
import { SITE_NAME } from "../site";
import { CONTACT_EMAIL_ADDRESS, CONTACT_NOTIFICATION_SUBJECT } from "../site-pages";

export type ContactMailResult = { sent: true } | { sent: false; reason: string };

export interface ContactMailer {
  sendContactNotification(input: ContactInput): Promise<ContactMailResult>;
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

export function createUnconfiguredContactMailer(): ContactMailer {
  return {
    async sendContactNotification() {
      return { sent: false, reason: "not-configured" };
    },
  };
}

export function createResendContactMailer(config: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): ContactMailer {
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async sendContactNotification(input) {
      const { text, html } = notificationBodies(input);
      try {
        const response = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: config.from,
            to: CONTACT_EMAIL_ADDRESS,
            reply_to: input.email,
            subject: contactNotificationSubject(input.name),
            text,
            html,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return { sent: false, reason: `resend-${response.status}` };
        return { sent: true };
      } catch {
        return { sent: false, reason: "send-failed" };
      }
    },
  };
}

// The factory the route calls. Selection is by
// environment: a configured Resend, else unconfigured.
export function getContactMailer(): ContactMailer {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_NOTIFICATION_FROM;
  if (apiKey && from) return createResendContactMailer({ apiKey, from });
  return createUnconfiguredContactMailer();
}
