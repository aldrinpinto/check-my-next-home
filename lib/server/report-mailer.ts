// The report mailer (plan step M8.6; decision D8).
//
// The delivery and re-issue emails' sending seam, in
// the gift mailer's exact discipline (lib/server/
// gift-mailer.ts): sending is a value, never a throw —
// { sent: true } or { sent: false, reason } — and the
// caller decides what a failed send means. The words
// are lib/download.ts's compositions; this file decides
// nothing about them, it only carries them.
//
// Three implementations:
//   - Resend — the real send, used when the environment
//     carries the key (K11 — RESEND_API_KEY). Resend is
//     the project's sender (D8; the Privacy policy names
//     it). The from address is the delivery email's own
//     (Master view 11: reports@checkmynexthome.co.uk,
//     under the site's name) — a fixed product address,
//     not a secret, so unlike the gift and contact
//     mailers' per-flow from values it carries a default
//     and the key alone selects this implementation;
//     REPORT_DELIVERY_FROM overrides it where an
//     environment must. Machine mail carries Reply-To:
//     support@checkmynexthome.co.uk (D8), so a buyer's
//     reply reaches a person, not the sending address.
//   - Unconfigured — answers not-configured. Until the
//     environment carries the key this implementation
//     is simply what answers, and a delivery's send
//     reports the fact rather than pretending an email
//     went out.
//   - Capture — the E2E harness's seam (the gift
//     mailer's precedent): serve-e2e points
//     REPORT_MAILER_CAPTURE_URL at a local capture
//     server; the "send" posts the whole composed email
//     there and the spec reads the link (and, on a paid
//     delivery, the gift link) back. Never set outside
//     the harness.

import type { ComposedEmail } from "../download";
import { GIFT_SUPPORT_EMAIL } from "../gift";
import { SITE_NAME } from "../site";

export type ReportMailResult = { sent: true } | { sent: false; reason: string };

export type ReportEmailKind = "delivery" | "reissue";

export interface ReportMailer {
  sendDeliveryEmail(input: { to: string; email: ComposedEmail }): Promise<ReportMailResult>;
  sendReissueEmail(input: { to: string; email: ComposedEmail }): Promise<ReportMailResult>;
}

// The delivery email's from, in the inbox form the
// sample draws ("Check My Next Home
// <reports@checkmynexthome.co.uk>").
export const REPORT_EMAIL_FROM = `${SITE_NAME} <reports@checkmynexthome.co.uk>`;

// Reply-To on every report email (D8): the support
// address the gift flow's copy already names.
export const REPORT_EMAIL_REPLY_TO = GIFT_SUPPORT_EMAIL;

export function createUnconfiguredReportMailer(): ReportMailer {
  const send = async (): Promise<ReportMailResult> => ({ sent: false, reason: "not-configured" });
  return { sendDeliveryEmail: send, sendReissueEmail: send };
}

export function createResendReportMailer(config: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): ReportMailer {
  const fetchImpl = config.fetchImpl ?? fetch;
  const send = async (input: { to: string; email: ComposedEmail }): Promise<ReportMailResult> => {
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
          reply_to: REPORT_EMAIL_REPLY_TO,
          subject: input.email.subject,
          text: input.email.text,
          html: input.email.html,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return { sent: false, reason: `resend-${response.status}` };
      return { sent: true };
    } catch {
      return { sent: false, reason: "send-failed" };
    }
  };
  return {
    sendDeliveryEmail: (input) => send(input),
    sendReissueEmail: (input) => send(input),
  };
}

export function createCaptureReportMailer(config: {
  captureUrl: string;
  fetchImpl?: typeof fetch;
}): ReportMailer {
  const fetchImpl = config.fetchImpl ?? fetch;
  const send =
    (kind: ReportEmailKind) =>
    async (input: { to: string; email: ComposedEmail }): Promise<ReportMailResult> => {
      try {
        const response = await fetchImpl(config.captureUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            to: input.to,
            subject: input.email.subject,
            text: input.email.text,
            html: input.email.html,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return { sent: false, reason: `capture-${response.status}` };
        return { sent: true };
      } catch {
        return { sent: false, reason: "send-failed" };
      }
    };
  return { sendDeliveryEmail: send("delivery"), sendReissueEmail: send("reissue") };
}

// The factory the service calls. Selection is by
// environment, in this order: the harness's capture
// seam, then a configured Resend, then unconfigured.
export function getReportMailer(): ReportMailer {
  const captureUrl = process.env.REPORT_MAILER_CAPTURE_URL;
  if (captureUrl) return createCaptureReportMailer({ captureUrl });
  const { RESEND_API_KEY: apiKey } = process.env;
  if (apiKey) {
    return createResendReportMailer({
      apiKey,
      from: process.env.REPORT_DELIVERY_FROM ?? REPORT_EMAIL_FROM,
    });
  }
  return createUnconfiguredReportMailer();
}
