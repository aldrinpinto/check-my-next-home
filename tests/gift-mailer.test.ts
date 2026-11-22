import { describe, expect, it } from "vitest";

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
    // View 21's dress (BUG-134): the button in forest,
    // the bare link standing in its pale box.
    expect(sent.html).toContain("background-color:#2F5D3E");
    expect(sent.html).toContain("background-color:#FBF7E9");
    expect(sent.html).toContain(`href="${CONFIRM_URL}"`);
    // The text body carries the same words around the
    // bare link (the fallback label belongs to the
    // button's presentation; the link itself stands).
    expect(sent.text).toContain(GIFT_CONFIRM_INTRO);
    expect(sent.text).toContain(CONFIRM_URL);
    expect(sent.text).toContain(GIFT_CONFIRM_IGNORE);
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
