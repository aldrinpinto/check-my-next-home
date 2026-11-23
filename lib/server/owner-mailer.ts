// The owner mailer (plan step M9.10; the adopted
// prep, gap 4 and ruling R2) — the sending seam for
// the business's own two emails: the SALE ALERT (at
// fulfilment, with the buyer's stored report PDF
// attached) and the fulfilment-failure ALERT. Their
// words are lib/order-emails.ts's compositions,
// dressed to the M9.10 draft samples; this file
// decides nothing about them, it only carries them.
//
// THE ATTACHMENT IS THIS SEAM'S NEW CAPABILITY: no
// mailer in the tree could send one before this step.
// Resend takes the file as base64 content; the bytes
// the caller passes are the stored PDF's own, read
// back by the delivery's key — never a regeneration.
//
// Sender and recipient (ruling R2, needing NO new
// founder-placed value):
//   - FROM takes the already-placed
//     CONTACT_NOTIFICATION_FROM value (the contact@
//     family Sample 37 draws for internal
//     notification). A send whose FROM is unplaced
//     answers not-configured while the buyer mail
//     still sends — the per-send discipline the
//     contact mailer established.
//   - TO is the project inbox, carried by
//     SALE_ALERT_TO, whose code default is
//     checkmynexthome@gmail.com — an unplaced name
//     still delivers, and the inbox can move without
//     a code change.
// The sandbox sender onboarding@resend.dev is NOT
// used: a sale alert is the business's own bell, and
// EM-12's wart is not this step's to copy. (Whether
// the page-error alert also moves off the sandbox
// sender is ruling R2's optional half — NOT ruled,
// and untouched here.)
//
// The discipline is the house one: sending is a
// value, never a throw — { sent: true } or
// { sent: false, reason } — and the caller decides
// what a failed send means (for these alarms: the
// marker stays unset and a later pass retries).

import type { ComposedEmail } from "../download";
import { envValue } from "./env";

export type OwnerMailResult = { sent: true } | { sent: false; reason: string };

export interface OwnerMailer {
  // The sale alert: the composed email plus the
  // stored report PDF, attached under the file name
  // generation gave it.
  sendSaleAlert(input: {
    email: ComposedEmail;
    attachment: { fileName: string; bytes: Uint8Array };
  }): Promise<OwnerMailResult>;
  // The fulfilment-failure alert: the composed email,
  // no attachment.
  sendFailureAlert(input: { email: ComposedEmail }): Promise<OwnerMailResult>;
}

// The recipient's code default (ruling R2): the
// project inbox, the alert path's established default
// (lib/server/journey-events.ts's ALERT_EMAIL_TO
// falls back to the same address).
export const SALE_ALERT_TO_DEFAULT = "checkmynexthome@gmail.com";

export function createUnconfiguredOwnerMailer(): OwnerMailer {
  const send = async (): Promise<OwnerMailResult> => ({ sent: false, reason: "not-configured" });
  return { sendSaleAlert: send, sendFailureAlert: send };
}

export function createResendOwnerMailer(config: {
  apiKey: string;
  // The FROM value (the placed contact@ value) — a
  // mailer built without one answers not-configured
  // per send, exactly as the contact mailer does.
  from?: string;
  to: string;
  fetchImpl?: typeof fetch;
}): OwnerMailer {
  const fetchImpl = config.fetchImpl ?? fetch;
  const post = async (body: Record<string, unknown>): Promise<OwnerMailResult> => {
    if (!config.from) return { sent: false, reason: "not-configured" };
    try {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: config.from, to: config.to, ...body }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { sent: false, reason: `resend-${response.status}` };
      return { sent: true };
    } catch {
      return { sent: false, reason: "send-failed" };
    }
  };
  return {
    sendSaleAlert: (input) =>
      post({
        subject: input.email.subject,
        text: input.email.text,
        html: input.email.html,
        attachments: [
          {
            filename: input.attachment.fileName,
            content: Buffer.from(input.attachment.bytes).toString("base64"),
          },
        ],
      }),
    sendFailureAlert: (input) =>
      post({
        subject: input.email.subject,
        text: input.email.text,
        html: input.email.html,
      }),
  };
}

// The factory the wiring calls. Selection is by
// environment: a configured Resend (the key present —
// each send then stands or falls on its FROM name),
// else unconfigured. Every name reads through
// envValue (BUG-148): a name the compose file passes
// empty counts as unplaced.
export function getOwnerMailer(): OwnerMailer {
  const apiKey = envValue("RESEND_API_KEY");
  if (!apiKey) return createUnconfiguredOwnerMailer();
  return createResendOwnerMailer({
    apiKey,
    from: envValue("CONTACT_NOTIFICATION_FROM"),
    to: envValue("SALE_ALERT_TO") ?? SALE_ALERT_TO_DEFAULT,
  });
}
