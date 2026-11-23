// The notice mailer (plan step M9.10) — the sending
// seam for the step's three BUYER emails: the
// failed-payment email (Sample 40), the
// fulfilment-failure email (Sample 41) and the
// gift-claimed email (Sample 42). Their words are
// lib/order-emails.ts's compositions; this file
// decides nothing about them, it only carries them.
//
// The seam is the report mailer's exact discipline
// (lib/server/report-mailer.ts): sending is a value,
// never a throw — { sent: true } or
// { sent: false, reason } — and the caller decides
// what a failed send means. All three emails draw
// reports@checkmynexthome.co.uk as their FROM in
// their samples, which is the report mailer's own
// fixed default — so this mailer shares the report
// mailer's FROM (REPORT_DELIVERY_FROM overrides it
// where an environment must) and its Reply-To, and
// needs NO new FROM name and no founder placement
// (prep evidence point 12).
//
// Three implementations, as the report mailer's:
//   - Resend — the real send, used when the
//     environment carries the key (K11).
//   - Unconfigured — answers not-configured.
//   - Capture — the E2E harness's seam: the same
//     REPORT_MAILER_CAPTURE_URL the report mailer
//     posts to, with this family's own kind names, so
//     a spec can read these emails back the way it
//     reads a delivery.

import type { ComposedEmail } from "../download";
import { envValue } from "./env";
import { REPORT_EMAIL_FROM, REPORT_EMAIL_REPLY_TO, type ReportMailResult } from "./report-mailer";

export type NoticeMailResult = ReportMailResult;

export type NoticeEmailKind = "payment-failed" | "fulfilment-failure" | "gift-claimed";

export interface NoticeMailer {
  sendPaymentFailedEmail(input: { to: string; email: ComposedEmail }): Promise<NoticeMailResult>;
  sendFulfilmentFailureEmail(input: {
    to: string;
    email: ComposedEmail;
  }): Promise<NoticeMailResult>;
  sendGiftClaimedEmail(input: { to: string; email: ComposedEmail }): Promise<NoticeMailResult>;
}

export function createUnconfiguredNoticeMailer(): NoticeMailer {
  const send = async (): Promise<NoticeMailResult> => ({ sent: false, reason: "not-configured" });
  return {
    sendPaymentFailedEmail: send,
    sendFulfilmentFailureEmail: send,
    sendGiftClaimedEmail: send,
  };
}

export function createResendNoticeMailer(config: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): NoticeMailer {
  const fetchImpl = config.fetchImpl ?? fetch;
  const send = async (input: { to: string; email: ComposedEmail }): Promise<NoticeMailResult> => {
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
    sendPaymentFailedEmail: (input) => send(input),
    sendFulfilmentFailureEmail: (input) => send(input),
    sendGiftClaimedEmail: (input) => send(input),
  };
}

export function createCaptureNoticeMailer(config: {
  captureUrl: string;
  fetchImpl?: typeof fetch;
}): NoticeMailer {
  const fetchImpl = config.fetchImpl ?? fetch;
  const send =
    (kind: NoticeEmailKind) =>
    async (input: { to: string; email: ComposedEmail }): Promise<NoticeMailResult> => {
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
  return {
    sendPaymentFailedEmail: send("payment-failed"),
    sendFulfilmentFailureEmail: send("fulfilment-failure"),
    sendGiftClaimedEmail: send("gift-claimed"),
  };
}

// The factory the wiring calls. Selection is by
// environment, in the report mailer's order: the
// harness's capture seam, then a configured Resend,
// then unconfigured. Every name reads through
// envValue (BUG-148): a name the compose file passes
// empty counts as unset.
export function getNoticeMailer(): NoticeMailer {
  const captureUrl = envValue("REPORT_MAILER_CAPTURE_URL");
  if (captureUrl) return createCaptureNoticeMailer({ captureUrl });
  const apiKey = envValue("RESEND_API_KEY");
  if (apiKey) {
    return createResendNoticeMailer({
      apiKey,
      from: envValue("REPORT_DELIVERY_FROM") ?? REPORT_EMAIL_FROM,
    });
  }
  return createUnconfiguredNoticeMailer();
}
