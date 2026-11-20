import { afterEach, describe, expect, it } from "vitest";

import type { ContactInput } from "../lib/contact";
import { CONTACT_EMAIL_ADDRESS, CONTACT_NOTIFICATION_SUBJECT } from "../lib/site-pages";
import {
  contactNotificationSubject,
  createResendContactMailer,
  createUnconfiguredContactMailer,
  getContactMailer,
} from "../lib/server/contact-mailer";

// BUG-028 fix (founder ruling 19 Nov 2026) — the
// notification email as sent: it goes to the site's own
// contact inbox, its reply-to is the VISITOR (answering
// the notification answers them), and its subject names
// it a website contact message. Pinned here at the
// Resend implementation's injectable fetch, in the gift
// mailer's test manner. No live call is made anywhere
// in this file.

const INPUT: ContactInput = {
  name: "Alex Morgan",
  email: "alex@example.co.uk",
  message: "The flood line on my check looks wrong.",
};

function capturingFetch(status = 200) {
  let payload: Record<string, string> | null = null;
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    payload = JSON.parse(init.body) as Record<string, string>;
    return { ok: status >= 200 && status < 300, status };
  }) as unknown as typeof fetch;
  return {
    fetchImpl,
    sent: () => payload as unknown as Record<string, string>,
  };
}

describe("the notification email", () => {
  it("goes to the contact inbox, reply-to the visitor, subject naming it a website contact message", async () => {
    const { fetchImpl, sent } = capturingFetch();
    const mailer = createResendContactMailer({
      apiKey: "test-key",
      from: "Check My Next Home <hello@checkmynexthome.co.uk>",
      fetchImpl,
    });
    const result = await mailer.sendContactNotification(INPUT);
    expect(result).toEqual({ sent: true });
    const payload = sent();
    expect(payload.to).toBe(CONTACT_EMAIL_ADDRESS);
    expect(payload.to).toBe("contact@checkmynexthome.co.uk");
    expect(payload.reply_to).toBe(INPUT.email);
    expect(payload.subject).toBe(contactNotificationSubject(INPUT.name));
    expect(payload.subject).toBe(`${CONTACT_NOTIFICATION_SUBJECT} from Alex Morgan`);
    expect(payload.subject).toContain("Website contact message");
    expect(payload.text).toContain(INPUT.name);
    expect(payload.text).toContain(INPUT.email);
    expect(payload.text).toContain(INPUT.message);
    expect(payload.html).toContain(INPUT.message);
  });

  it("escapes the visitor's words in the HTML body", async () => {
    const { fetchImpl, sent } = capturingFetch();
    const mailer = createResendContactMailer({ apiKey: "k", from: "f@example.co.uk", fetchImpl });
    await mailer.sendContactNotification({
      name: "A <b>Bold</b>",
      email: "a@b.co.uk",
      message: "x <script>alert(1)</script> y",
    });
    expect(sent().html).not.toContain("<script>");
    expect(sent().html).toContain("&lt;script&gt;");
    expect(sent().html).not.toContain("<b>Bold</b>");
  });

  it("answers failures as values, never throws", async () => {
    const { fetchImpl } = capturingFetch(500);
    const mailer = createResendContactMailer({ apiKey: "k", from: "f@example.co.uk", fetchImpl });
    await expect(mailer.sendContactNotification(INPUT)).resolves.toEqual({
      sent: false,
      reason: "resend-500",
    });
    const throwing = createResendContactMailer({
      apiKey: "k",
      from: "f@example.co.uk",
      fetchImpl: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });
    await expect(throwing.sendContactNotification(INPUT)).resolves.toEqual({
      sent: false,
      reason: "send-failed",
    });
  });
});

describe("the unconfigured mailer and the factory", () => {
  const savedKey = process.env.RESEND_API_KEY;
  const savedFrom = process.env.CONTACT_NOTIFICATION_FROM;

  afterEach(() => {
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;
    if (savedFrom === undefined) delete process.env.CONTACT_NOTIFICATION_FROM;
    else process.env.CONTACT_NOTIFICATION_FROM = savedFrom;
  });

  it("the unconfigured implementation answers not-configured", async () => {
    await expect(createUnconfiguredContactMailer().sendContactNotification(INPUT)).resolves.toEqual(
      { sent: false, reason: "not-configured" },
    );
  });

  it("with no Resend env the factory selects the unconfigured mailer (the play server's state)", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.CONTACT_NOTIFICATION_FROM;
    await expect(getContactMailer().sendContactNotification(INPUT)).resolves.toEqual({
      sent: false,
      reason: "not-configured",
    });
  });

  it("a key without a from address is still unconfigured — both halves are required", async () => {
    process.env.RESEND_API_KEY = "k";
    delete process.env.CONTACT_NOTIFICATION_FROM;
    await expect(getContactMailer().sendContactNotification(INPUT)).resolves.toEqual({
      sent: false,
      reason: "not-configured",
    });
  });
});
