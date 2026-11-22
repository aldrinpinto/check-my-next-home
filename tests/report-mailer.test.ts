import { afterEach, describe, expect, it, vi } from "vitest";

import { deliveryEmail } from "../lib/download";
import {
  REPORT_EMAIL_FROM,
  REPORT_EMAIL_REPLY_TO,
  createCaptureReportMailer,
  createResendReportMailer,
  createUnconfiguredReportMailer,
  getReportMailer,
} from "../lib/server/report-mailer";
import { DOWNLOAD_BUYER, RESEND_FIXTURE_KEY as resendFixture } from "./fixtures/download";

// M8.6 — the report mailer seam: the Resend
// implementation's payload (the delivery email's from,
// Reply-To, subject and bodies, carried untouched from
// lib/download.ts's composition), the capture
// implementation's harness payload, and the factory's
// environment selection. Sending is a value, never a
// throw, in every implementation.

const EMAIL = deliveryEmail({
  homeTitle: "12 Willow Close",
  homeAddressLine: "12 Willow Close, Millbrook MB3 4QX",
  downloadUrl: "https://play.checkmynexthome.co.uk/report/download/some-token",
  giftClaimUrl: null,
});

type FetchCall = { url: string; body: Record<string, unknown> };

function recordingFetch(calls: FetchCall[], ok = true): typeof fetch {
  return (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    return { ok, status: ok ? 200 : 500 };
  }) as unknown as typeof fetch;
}

describe("the Resend implementation", () => {
  it("sends the delivery email from reports@, Reply-To support@, words untouched", async () => {
    const calls: FetchCall[] = [];
    const mailer = createResendReportMailer({
      apiKey: resendFixture,
      from: REPORT_EMAIL_FROM,
      fetchImpl: recordingFetch(calls),
    });
    await expect(mailer.sendDeliveryEmail({ to: DOWNLOAD_BUYER, email: EMAIL })).resolves.toEqual({
      sent: true,
    });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.resend.com/emails");
    expect(call.body.from).toBe("Check My Next Home <reports@checkmynexthome.co.uk>");
    expect(call.body.to).toBe(DOWNLOAD_BUYER);
    expect(call.body.reply_to).toBe("support@checkmynexthome.co.uk");
    expect(call.body.reply_to).toBe(REPORT_EMAIL_REPLY_TO);
    expect(call.body.subject).toBe("Your detailed report for 12 Willow Close");
    expect(call.body.text).toBe(EMAIL.text);
    expect(call.body.html).toBe(EMAIL.html);
  });

  it("a failed send is a value, never a throw — for both emails", async () => {
    const mailer = createResendReportMailer({
      apiKey: resendFixture,
      from: REPORT_EMAIL_FROM,
      fetchImpl: recordingFetch([], false),
    });
    await expect(mailer.sendDeliveryEmail({ to: DOWNLOAD_BUYER, email: EMAIL })).resolves.toEqual({
      sent: false,
      reason: "resend-500",
    });
    await expect(mailer.sendReissueEmail({ to: DOWNLOAD_BUYER, email: EMAIL })).resolves.toEqual({
      sent: false,
      reason: "resend-500",
    });
  });
});

describe("the capture implementation (the harness seam)", () => {
  it("posts the whole composed email, tagged with its kind", async () => {
    const calls: FetchCall[] = [];
    const mailer = createCaptureReportMailer({
      captureUrl: "http://127.0.0.1:9/capture",
      fetchImpl: recordingFetch(calls),
    });
    await mailer.sendDeliveryEmail({ to: DOWNLOAD_BUYER, email: EMAIL });
    await mailer.sendReissueEmail({ to: DOWNLOAD_BUYER, email: EMAIL });
    expect(calls.map((c) => c.body.kind)).toEqual(["delivery", "reissue"]);
    expect(calls[0]!.body.to).toBe(DOWNLOAD_BUYER);
    expect(calls[0]!.body.subject).toBe(EMAIL.subject);
    expect(calls[0]!.body.text).toBe(EMAIL.text);
    expect(calls[0]!.body.html).toBe(EMAIL.html);
  });
});

describe("the unconfigured implementation and the factory", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers not-configured for both emails", async () => {
    const mailer = createUnconfiguredReportMailer();
    await expect(mailer.sendDeliveryEmail({ to: DOWNLOAD_BUYER, email: EMAIL })).resolves.toEqual({
      sent: false,
      reason: "not-configured",
    });
    await expect(mailer.sendReissueEmail({ to: DOWNLOAD_BUYER, email: EMAIL })).resolves.toEqual({
      sent: false,
      reason: "not-configured",
    });
  });

  it("selects unconfigured with no key, and the capture seam above a key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("REPORT_MAILER_CAPTURE_URL", "");
    await expect(
      getReportMailer().sendDeliveryEmail({ to: DOWNLOAD_BUYER, email: EMAIL }),
    ).resolves.toEqual({ sent: false, reason: "not-configured" });

    // With a key AND the capture seam set, capture wins:
    // the factory's send fails against the dead capture
    // port with the capture implementation's own reason
    // — not Resend's, and not not-configured.
    vi.stubEnv("RESEND_API_KEY", resendFixture);
    vi.stubEnv("REPORT_MAILER_CAPTURE_URL", "http://127.0.0.1:9/capture");
    await expect(
      getReportMailer().sendDeliveryEmail({ to: DOWNLOAD_BUYER, email: EMAIL }),
    ).resolves.toEqual({ sent: false, reason: "send-failed" });
  });

  it("treats an empty or blank REPORT_DELIVERY_FROM as unset — the fallback From sends (BUG-148)", async () => {
    // The compose file passes the name as ${NAME:-}:
    // unplaced, it arrives present but empty, and the
    // old ?? fallback never engaged — the send went
    // out with an empty From and the sender refused
    // it. Through the factory, both the empty and the
    // blank form must send from the fallback.
    vi.stubEnv("RESEND_API_KEY", resendFixture);
    vi.stubEnv("REPORT_MAILER_CAPTURE_URL", "");
    const calls: FetchCall[] = [];
    vi.stubGlobal("fetch", recordingFetch(calls));
    try {
      for (const blank of ["", "   "]) {
        vi.stubEnv("REPORT_DELIVERY_FROM", blank);
        await expect(
          getReportMailer().sendDeliveryEmail({ to: DOWNLOAD_BUYER, email: EMAIL }),
        ).resolves.toEqual({ sent: true });
      }
    } finally {
      vi.unstubAllGlobals();
    }
    expect(calls.map((c) => c.body.from)).toEqual([REPORT_EMAIL_FROM, REPORT_EMAIL_FROM]);
  });
});
