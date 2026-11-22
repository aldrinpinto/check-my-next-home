// The gift confirmation mailer (plan step M7.13,
// decision D21; the claim shell).
//
// The claim's one email: the confirmation round-trip
// that binds a gift (adopted gap check item 1). The
// seam is the Postio pattern — sending is a value, never
// a throw: { sent: true } or { sent: false, reason },
// and the claim flow treats a failed send as "nothing
// has been claimed" (the pending is rolled back, the
// visitor is told plainly, and they can try again).
//
// Three implementations:
//   - Resend — the real send, used when the environment
//     carries the key and the from address. Resend is
//     the project's sender (D8; the Privacy policy names
//     it). Until the environment is configured, this
//     implementation is simply never selected.
//   - Unconfigured — answers not-configured. The shell
//     on an unconfigured server can show every state
//     but cannot complete a claim, and says so through
//     the flow's send-failure line rather than
//     pretending an email went out.
//   - Capture — the E2E harness's seam (the Turnstile
//     precedent: the third-party service is replaced,
//     the flow stays whole). serve-e2e points
//     GIFT_MAILER_CAPTURE_URL at a local capture server;
//     the "send" posts the confirmation payload there
//     and the spec reads the link back. Never set
//     outside the harness.
//
// The email's words are lib/gift.ts's GIFT_CONFIRM_*
// constants — founder-approved on 19 Nov 2026 and pinned
// by the Master as view 21 (Gift claim — Confirmation
// email); its HTML dress is view 21's own, conformed at
// BUG-134 (see confirmationBodies below).

import {
  GIFT_CONFIRM_BUTTON,
  GIFT_CONFIRM_FALLBACK,
  GIFT_CONFIRM_IGNORE,
  GIFT_CONFIRM_INTRO,
  GIFT_CONFIRM_SUBJECT,
} from "../gift";
import { SITE_NAME } from "../site";
import { envValue } from "./env";

export type GiftMailResult = { sent: true } | { sent: false; reason: string };

export interface GiftMailer {
  sendClaimConfirmation(input: {
    to: string;
    giftToken: string;
    // The absolute confirmation URL, built by the route
    // from the request's own origin + giftConfirmPath —
    // so the link in a real inbox points at the host the
    // visitor is actually claiming on.
    confirmUrl: string;
  }): Promise<GiftMailResult>;
}

// View 21's drawn dress for the HTML part (BUG-134):
// Sample 21 arranges this email differently from the
// delivery email — no brand band, no footer furniture;
// the body stands in a white bordered frame as plain
// paragraphs, the confirmation as a forest button
// standing in the text, and the bare link in a pale
// box under its fallback line. Email-safe construction
// throughout: a table skeleton, every style inline.
// The text part is untouched. The site name's closing
// line (composed copy both parts already carried) is
// kept, in the sample's meta grey.
const CONFIRM_SANS_STACK = `'Public Sans', Arial, Helvetica, sans-serif`;

function confirmationBodies(confirmUrl: string): { text: string; html: string } {
  const text = [GIFT_CONFIRM_INTRO, "", confirmUrl, "", GIFT_CONFIRM_IGNORE, "", SITE_NAME].join(
    "\n",
  );
  const bodyP = `font-size:16px;line-height:1.65;color:#4A5546;margin:0 0 16px;`;
  const html = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background-color:#FFFFFF;">`,
    `<tr><td align="center" style="padding:10px 12px 18px;">`,
    `<table role="presentation" width="660" cellpadding="0" cellspacing="0" style="width:100%;max-width:660px;background-color:#FFFFFF;border:1px solid #E3DCC4;border-radius:16px;font-family:${CONFIRM_SANS_STACK};color:#22301F;">`,
    `<tr><td style="padding:20px 22px 24px;">`,
    `<p style="${bodyP}">${GIFT_CONFIRM_INTRO}</p>`,
    `<a href="${confirmUrl}" style="display:inline-block;background-color:#2F5D3E;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15.5px;border-radius:12px;padding:13px 22px;margin:2px 0 20px;">${GIFT_CONFIRM_BUTTON}</a>`,
    `<p style="${bodyP}">${GIFT_CONFIRM_FALLBACK}</p>`,
    `<span style="display:block;background-color:#FBF7E9;border:1px solid #E3DCC4;border-radius:10px;padding:11px 13px;font-size:13.5px;line-height:1.55;word-break:break-all;color:#2F5D3E;margin:0 0 16px;">${confirmUrl}</span>`,
    `<p style="${bodyP}">${GIFT_CONFIRM_IGNORE}</p>`,
    `<p style="font-size:13.5px;line-height:1.6;color:#7A7E6E;margin:0;">${SITE_NAME}</p>`,
    `</td></tr>`,
    `</table>`,
    `</td></tr>`,
    `</table>`,
  ].join("\n");
  return { text, html };
}

export function createUnconfiguredGiftMailer(): GiftMailer {
  return {
    async sendClaimConfirmation() {
      return { sent: false, reason: "not-configured" };
    },
  };
}

export function createResendGiftMailer(config: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): GiftMailer {
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async sendClaimConfirmation(input) {
      const { text, html } = confirmationBodies(input.confirmUrl);
      try {
        const response = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: config.from,
            to: input.to,
            subject: GIFT_CONFIRM_SUBJECT,
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

export function createCaptureGiftMailer(config: {
  captureUrl: string;
  fetchImpl?: typeof fetch;
}): GiftMailer {
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async sendClaimConfirmation(input) {
      try {
        const response = await fetchImpl(config.captureUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: input.to,
            giftToken: input.giftToken,
            confirmUrl: input.confirmUrl,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return { sent: false, reason: `capture-${response.status}` };
        return { sent: true };
      } catch {
        return { sent: false, reason: "send-failed" };
      }
    },
  };
}

// The factory the routes call. Selection is by
// environment, in this order: the harness's capture
// seam, then a configured Resend, then unconfigured.
export function getGiftMailer(): GiftMailer {
  // Every name reads through envValue (BUG-148): a
  // name the compose file passes empty counts as
  // unset, so an unplaced FROM leaves this mailer
  // unconfigured instead of sending with a blank From.
  const captureUrl = envValue("GIFT_MAILER_CAPTURE_URL");
  if (captureUrl) return createCaptureGiftMailer({ captureUrl });
  const apiKey = envValue("RESEND_API_KEY");
  const from = envValue("GIFT_CONFIRMATION_FROM");
  if (apiKey && from) return createResendGiftMailer({ apiKey, from });
  return createUnconfiguredGiftMailer();
}
