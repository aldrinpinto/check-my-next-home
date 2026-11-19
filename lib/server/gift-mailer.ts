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
//     it); the report delivery email's full template
//     machinery is M8.6's, and this email's minimal
//     dress is conformed there. Until the environment
//     is configured, this implementation is simply
//     never selected.
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
// email); minimal and functional in dress until M8.6's
// template machinery conforms it.

import {
  GIFT_CONFIRM_BUTTON,
  GIFT_CONFIRM_FALLBACK,
  GIFT_CONFIRM_IGNORE,
  GIFT_CONFIRM_INTRO,
  GIFT_CONFIRM_SUBJECT,
} from "../gift";
import { SITE_NAME } from "../site";

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

function confirmationBodies(confirmUrl: string): { text: string; html: string } {
  const text = [GIFT_CONFIRM_INTRO, "", confirmUrl, "", GIFT_CONFIRM_IGNORE, "", SITE_NAME].join(
    "\n",
  );
  const html = [
    `<p>${GIFT_CONFIRM_INTRO}</p>`,
    `<p><a href="${confirmUrl}">${GIFT_CONFIRM_BUTTON}</a></p>`,
    `<p>${GIFT_CONFIRM_FALLBACK}<br>${confirmUrl}</p>`,
    `<p>${GIFT_CONFIRM_IGNORE}</p>`,
    `<p>${SITE_NAME}</p>`,
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
  const captureUrl = process.env.GIFT_MAILER_CAPTURE_URL;
  if (captureUrl) return createCaptureGiftMailer({ captureUrl });
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.GIFT_CONFIRMATION_FROM;
  if (apiKey && from) return createResendGiftMailer({ apiKey, from });
  return createUnconfiguredGiftMailer();
}
