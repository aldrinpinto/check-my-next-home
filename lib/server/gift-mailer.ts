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
// email). Its HTML dress was view 21's own minimal form,
// conformed at BUG-134; BUG-221 (founder, 24 Nov 2026)
// re-dresses it in the house shell — see
// confirmationBodies below.

import {
  DOWNLOAD_EMAIL_FOOTER_LINE,
  DOWNLOAD_EMAIL_GREETING,
  DOWNLOAD_EMAIL_QUESTIONS_LINE,
  DOWNLOAD_EMAIL_SIGN_OFF,
  DOWNLOAD_EMAIL_TEAM_LINE,
} from "../download";
import {
  designedEmailHtml,
  emailFooterHtml,
  emailSignOffRowHtml,
  EMAIL_SERIF,
  mailtoLineHtml,
} from "../email-shell";
import {
  GIFT_CONFIRM_BUTTON,
  GIFT_CONFIRM_FALLBACK,
  GIFT_CONFIRM_IGNORE,
  GIFT_CONFIRM_INTRO,
  GIFT_CONFIRM_SUBJECT,
} from "../gift";
import { CONTACT_EMAIL_ADDRESS } from "../site-pages";
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

// The confirmation email wears the house designed
// shell (lib/email-shell.ts, Master view 11; BUG-221).
// Sample 21's deliberately minimal dress — no brand
// band, no footer furniture, the body in a white
// bordered frame, the confirmation as a forest button,
// the bare link in a pale box — was conformed at
// BUG-134, but the founder's testing of the gift flow
// found the bare email unlike the house emails, and
// ruled on 24 Nov 2026: "Sort this email template to
// be like the one we generally get from
// checkmynexthome." That ruling supersedes Sample 21's
// minimal dress; Sample 21 is redrawn in the house
// dress in the Master in the same stack. The words
// are unchanged: the intro, button, fallback and
// ignore lines are lib/gift.ts's GIFT_CONFIRM_*
// constants, and the heading reuses the subject's own
// words — no new copy. The bare link stands in the
// house dashed box (the delivery email's gift block's
// treatment), its display text without the scheme, the
// href whole. The text part carries the same furniture
// as the house emails' text parts. The confirm URL is
// caller-derived (request origin + token), so it is
// escaped in the HTML, as the delivery email escapes
// its URLs; the gift constants are fixed known-safe
// words and stand raw, as before.
const BODY_P = `font-size:15.5px;line-height:1.65;margin:0 0 15px;`;
const FOOTER_WRAP =
  "border-top:1px solid #E3DCC4;margin-top:18px;padding:16px 0 22px;font-size:13px;color:#4A5548;line-height:1.6;";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function confirmationBodies(confirmUrl: string): { text: string; html: string } {
  const heading = GIFT_CONFIRM_SUBJECT;
  const text = [
    heading,
    "",
    DOWNLOAD_EMAIL_GREETING,
    "",
    GIFT_CONFIRM_INTRO,
    "",
    confirmUrl,
    "",
    GIFT_CONFIRM_IGNORE,
    "",
    DOWNLOAD_EMAIL_SIGN_OFF,
    DOWNLOAD_EMAIL_TEAM_LINE,
    "",
    DOWNLOAD_EMAIL_QUESTIONS_LINE,
    "",
    DOWNLOAD_EMAIL_FOOTER_LINE,
  ].join("\n");
  // The sample draws a bare link's text without its
  // scheme; the href keeps the full confirmation URL,
  // and the text part above keeps it whole too.
  const displayUrl = confirmUrl.replace(/^https?:\/\//, "");
  const html = designedEmailHtml({
    contentHtml: [
      `<h2 style="font-family:${EMAIL_SERIF};font-size:24px;font-weight:600;color:#1E402C;margin:0 0 12px;line-height:1.3;">${escapeHtml(heading)}</h2>`,
      `<p style="${BODY_P}">${DOWNLOAD_EMAIL_GREETING}</p>`,
      `<p style="${BODY_P}">${GIFT_CONFIRM_INTRO}</p>`,
      `<a href="${escapeHtml(confirmUrl)}" style="display:block;text-align:center;background-color:#C29A3B;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:16.5px;padding:15px 20px;border-radius:11px;margin:20px 0 14px;">${GIFT_CONFIRM_BUTTON}</a>`,
      `<p style="${BODY_P}">${GIFT_CONFIRM_FALLBACK}</p>`,
      `<a href="${escapeHtml(confirmUrl)}" style="display:block;background-color:#FBF3D9;border:1px dashed #C29A3B;border-radius:9px;padding:12px 14px;font-size:14px;word-break:break-all;color:#2F5D3E;font-weight:600;text-decoration:none;text-align:center;margin-bottom:12px;">${escapeHtml(displayUrl)}</a>`,
      `<p style="${BODY_P}">${GIFT_CONFIRM_IGNORE}</p>`,
    ],
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
  });
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
