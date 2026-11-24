import { describe, expect, it } from "vitest";

import {
  DOWNLOAD_EMAIL_FOOTER_LINE,
  DOWNLOAD_EMAIL_GREETING,
  DOWNLOAD_EMAIL_QUESTIONS_LINE,
  DOWNLOAD_EMAIL_SIGN_OFF,
  DOWNLOAD_EMAIL_TEAM_LINE,
} from "../lib/download";
import {
  GIFT_CONFIRM_BUTTON,
  GIFT_CONFIRM_FALLBACK,
  GIFT_CONFIRM_IGNORE,
  GIFT_CONFIRM_INTRO,
  GIFT_CONFIRM_SUBJECT,
} from "../lib/gift";
import { createResendGiftMailer, createUnconfiguredGiftMailer } from "../lib/server/gift-mailer";
import { GIFT_FRIEND } from "./fixtures/gift";

// M7.13 — the confirmation email as sent (Master view
// 21; the conform pass of 19 Nov 2026). The mailer seam's
// capture implementation carries only the payload (to /
// token / URL), so the email's own words are pinned
// here, at the Resend implementation's injectable fetch:
// subject, intro, the button's words, the fallback line
// and the ignore line — the sample's text, verbatim.

const CONFIRM_URL = "https://play.checkmynexthome.co.uk/gift/tok/confirm/pen";

describe("the confirmation email (view 21)", () => {
  it("sends the sample's words: subject, intro, button, fallback, ignore", async () => {
    let payload: Record<string, string> | null = null;
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      payload = JSON.parse(init.body) as Record<string, string>;
      return { ok: true, status: 200 };
    }) as unknown as typeof fetch;
    const mailer = createResendGiftMailer({
      apiKey: "test-key",
      from: "Check My Next Home <hello@checkmynexthome.co.uk>",
      fetchImpl,
    });
    const result = await mailer.sendClaimConfirmation({
      to: GIFT_FRIEND,
      giftToken: "tok",
      confirmUrl: CONFIRM_URL,
    });
    expect(result).toEqual({ sent: true });
    expect(payload).not.toBeNull();
    const sent = payload as unknown as Record<string, string>;
    expect(sent.to).toBe(GIFT_FRIEND);
    expect(sent.subject).toBe(GIFT_CONFIRM_SUBJECT);
    expect(sent.subject).toBe("Confirm your free report gift");
    // The HTML body carries every line of the sample.
    expect(sent.html).toContain(GIFT_CONFIRM_INTRO);
    expect(sent.html).toContain(`>${GIFT_CONFIRM_BUTTON}</a>`);
    expect(sent.html).toContain("Confirm and finish claiming");
    expect(sent.html).toContain(GIFT_CONFIRM_FALLBACK);
    expect(sent.html).toContain(CONFIRM_URL);
    expect(sent.html).toContain(GIFT_CONFIRM_IGNORE);
    // View 21's dress (BUG-221): the house shell — the
    // forest-deep brand band, the brass button, the
    // dashed cream link box, the sign-off row and the
    // hairline footer — the delivery email's own dress.
    // The sample's old dress (a forest button, a pale
    // box, no band, no sign-off, no footer) is gone.
    expect(sent.html).toContain("background-color:#1E402C");
    expect(sent.html).toContain("background-color:#C29A3B");
    expect(sent.html).toContain("background-color:#FBF3D9");
    expect(sent.html).toContain("border:1px dashed #C29A3B");
    expect(sent.html).toContain(DOWNLOAD_EMAIL_SIGN_OFF);
    expect(sent.html).toContain(DOWNLOAD_EMAIL_TEAM_LINE);
    expect(sent.html).toContain("mailto:contact@checkmynexthome.co.uk");
    expect(sent.html).toContain(DOWNLOAD_EMAIL_FOOTER_LINE);
    expect(sent.html).not.toContain("background-color:#2F5D3E");
    expect(sent.html).not.toContain("background-color:#FBF7E9");
    expect(sent.html).toContain(`href="${CONFIRM_URL}"`);
    // The text body carries the same words around the
    // bare link (the fallback label belongs to the
    // button's presentation; the link itself stands),
    // with the house furniture — greeting, sign-off,
    // team line, questions line, footer line — the old
    // text part carried none of it.
    expect(sent.text).toContain(GIFT_CONFIRM_INTRO);
    expect(sent.text).toContain(CONFIRM_URL);
    expect(sent.text).toContain(GIFT_CONFIRM_IGNORE);
    expect(sent.text).toContain(DOWNLOAD_EMAIL_GREETING);
    expect(sent.text).toContain(DOWNLOAD_EMAIL_SIGN_OFF);
    expect(sent.text).toContain(DOWNLOAD_EMAIL_TEAM_LINE);
    expect(sent.text).toContain(DOWNLOAD_EMAIL_QUESTIONS_LINE);
    expect(sent.text).toContain(DOWNLOAD_EMAIL_FOOTER_LINE);
  });

  it("a failed send is a value, never a throw", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    const mailer = createResendGiftMailer({ apiKey: "test-key", from: "a@b.co", fetchImpl });
    await expect(
      mailer.sendClaimConfirmation({ to: GIFT_FRIEND, giftToken: "tok", confirmUrl: CONFIRM_URL }),
    ).resolves.toEqual({ sent: false, reason: "resend-500" });
  });

  it("the unconfigured mailer answers not-configured", async () => {
    const mailer = createUnconfiguredGiftMailer();
    await expect(
      mailer.sendClaimConfirmation({ to: GIFT_FRIEND, giftToken: "tok", confirmUrl: CONFIRM_URL }),
    ).resolves.toEqual({ sent: false, reason: "not-configured" });
  });
});
