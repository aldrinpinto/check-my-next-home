import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContactInput } from "../lib/contact";
import {
  CONTACT_ACKNOWLEDGEMENT_BODY,
  CONTACT_ACKNOWLEDGEMENT_CLOSING_LINE,
  CONTACT_ACKNOWLEDGEMENT_HEADING,
  CONTACT_ACKNOWLEDGEMENT_SUBJECT,
  CONTACT_EMAIL_ADDRESS,
  CONTACT_NOTIFICATION_SUBJECT,
} from "../lib/site-pages";
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

// GAP-1 (founder ruling 22 Nov 2026) — the acknowledgement
// email as sent: it goes TO THE SENDER, its words are
// Sample 38's verbatim (founder-approved the same day), and it wears the designed
// email shell (the delivery email's dress, BUG-134). Its
// configuration is its own FROM name, independent of the
// notification's.
describe("the acknowledgement email (GAP-1)", () => {
  const ACK_FROM = "Check My Next Home <contact@checkmynexthome.co.uk>";

  it("goes to the sender, from the acknowledgement sender, with the thanks' own words", async () => {
    const { fetchImpl, sent } = capturingFetch();
    const mailer = createResendContactMailer({
      apiKey: "test-key",
      from: "Check My Next Home <hello@checkmynexthome.co.uk>",
      acknowledgementFrom: ACK_FROM,
      fetchImpl,
    });
    const result = await mailer.sendContactAcknowledgement(INPUT);
    expect(result).toEqual({ sent: true });
    const payload = sent();
    expect(payload.to).toBe(INPUT.email);
    expect(payload.from).toBe(ACK_FROM);
    expect(payload.reply_to).toBeUndefined();
    expect(payload.subject).toBe(CONTACT_ACKNOWLEDGEMENT_SUBJECT);
    expect(payload.subject).toBe("We've got your message");
    expect(payload.text).toContain(CONTACT_ACKNOWLEDGEMENT_HEADING);
    expect(payload.text).toContain("Hello,");
    // Sample 38's body, verbatim (founder-approved 22 Nov 2026).
    expect(payload.text).toContain(CONTACT_ACKNOWLEDGEMENT_BODY);
    expect(payload.text).toContain(
      "Thank you for writing to us — we've got your message. It's with a real person, and we'll reply within two working days.",
    );
    expect(payload.text).toContain(CONTACT_ACKNOWLEDGEMENT_CLOSING_LINE);
    expect(payload.text).toContain(
      "You don't need to do anything else — this email is just to let you know your message arrived safely.",
    );
    expect(payload.text).toContain("Happy Home Hunting,");
    expect(payload.text).toContain("The Check My Next Home team");
    expect(payload.text).toContain(
      "Questions about your report? Write to us any time at contact@checkmynexthome.co.uk — a real person will reply.",
    );
    expect(payload.text).toContain("Check My Next Home · checkmynexthome.co.uk");
    // It confirms receipt; it never echoes the visitor's own words back.
    expect(payload.text).not.toContain(INPUT.message);
    expect(payload.html).not.toContain(INPUT.message);
  });

  it("wears the designed shell — brand band, cream sheet, serif heading, hairline footer", async () => {
    const { fetchImpl, sent } = capturingFetch();
    const mailer = createResendContactMailer({
      apiKey: "k",
      acknowledgementFrom: ACK_FROM,
      fetchImpl,
    });
    await mailer.sendContactAcknowledgement(INPUT);
    const html = sent().html;
    // The forest-deep brand band with the wordmark.
    expect(html).toContain("background-color:#1E402C");
    expect(html).toContain("Check My <span");
    // The cream sheet.
    expect(html).toContain("background-color:#FDF8E8");
    expect(html).toContain("max-width:600px");
    // The serif heading stack and the heading itself.
    expect(html).toContain("Newsreader");
    expect(html).toContain(CONTACT_ACKNOWLEDGEMENT_HEADING);
    // The sign-off with the team line in bold.
    expect(html).toContain("<strong>The Check My Next Home team</strong>");
    // The hairline footer carrying the name-and-domain line.
    expect(html).toContain("border-top:1px solid #E3DCC4");
    expect(html).toContain("Check My Next Home · checkmynexthome.co.uk");
    // The footer's questions line, its address standing as a mailto —
    // the delivery email's own closing furniture, as Sample 38 draws it.
    expect(html).toContain('href="mailto:contact@checkmynexthome.co.uk"');
    // The body lines stand in the HTML as they stand in the sample.
    expect(html).toContain(CONTACT_ACKNOWLEDGEMENT_BODY);
    expect(html).toContain(CONTACT_ACKNOWLEDGEMENT_CLOSING_LINE);
  });

  it("answers failures as values, never throws", async () => {
    const { fetchImpl } = capturingFetch(500);
    const mailer = createResendContactMailer({
      apiKey: "k",
      acknowledgementFrom: ACK_FROM,
      fetchImpl,
    });
    await expect(mailer.sendContactAcknowledgement(INPUT)).resolves.toEqual({
      sent: false,
      reason: "resend-500",
    });
    const throwing = createResendContactMailer({
      apiKey: "k",
      acknowledgementFrom: ACK_FROM,
      fetchImpl: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });
    await expect(throwing.sendContactAcknowledgement(INPUT)).resolves.toEqual({
      sent: false,
      reason: "send-failed",
    });
  });

  it("each send stands on its own FROM — one unplaced leaves only its own send unconfigured", async () => {
    // Notification FROM placed, acknowledgement FROM missing.
    const noAck = capturingFetch();
    const mailerA = createResendContactMailer({
      apiKey: "k",
      from: "Check My Next Home <hello@checkmynexthome.co.uk>",
      fetchImpl: noAck.fetchImpl,
    });
    await expect(mailerA.sendContactAcknowledgement(INPUT)).resolves.toEqual({
      sent: false,
      reason: "not-configured",
    });
    await expect(mailerA.sendContactNotification(INPUT)).resolves.toEqual({ sent: true });

    // Acknowledgement FROM placed, notification FROM missing.
    const noNotify = capturingFetch();
    const mailerB = createResendContactMailer({
      apiKey: "k",
      acknowledgementFrom: ACK_FROM,
      fetchImpl: noNotify.fetchImpl,
    });
    await expect(mailerB.sendContactNotification(INPUT)).resolves.toEqual({
      sent: false,
      reason: "not-configured",
    });
    await expect(mailerB.sendContactAcknowledgement(INPUT)).resolves.toEqual({ sent: true });
    expect(noNotify.sent().to).toBe(INPUT.email);
  });

  it("the unconfigured implementation answers not-configured for the acknowledgement too", async () => {
    await expect(
      createUnconfiguredContactMailer().sendContactAcknowledgement(INPUT),
    ).resolves.toEqual({ sent: false, reason: "not-configured" });
  });
});

describe("the factory and the acknowledgement's own env name", () => {
  const savedKey = process.env.RESEND_API_KEY;
  const savedFrom = process.env.CONTACT_NOTIFICATION_FROM;
  const savedAckFrom = process.env.CONTACT_ACKNOWLEDGEMENT_FROM;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;
    if (savedFrom === undefined) delete process.env.CONTACT_NOTIFICATION_FROM;
    else process.env.CONTACT_NOTIFICATION_FROM = savedFrom;
    if (savedAckFrom === undefined) delete process.env.CONTACT_ACKNOWLEDGEMENT_FROM;
    else process.env.CONTACT_ACKNOWLEDGEMENT_FROM = savedAckFrom;
  });

  it("with no Resend env the factory's acknowledgement answers not-configured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.CONTACT_NOTIFICATION_FROM;
    delete process.env.CONTACT_ACKNOWLEDGEMENT_FROM;
    await expect(getContactMailer().sendContactAcknowledgement(INPUT)).resolves.toEqual({
      sent: false,
      reason: "not-configured",
    });
  });

  it("a key with only CONTACT_ACKNOWLEDGEMENT_FROM placed sends the acknowledgement — and not the notification", async () => {
    process.env.RESEND_API_KEY = "k";
    delete process.env.CONTACT_NOTIFICATION_FROM;
    process.env.CONTACT_ACKNOWLEDGEMENT_FROM = "Check My Next Home <contact@checkmynexthome.co.uk>";
    let payload: Record<string, string> | null = null;
    vi.stubGlobal("fetch", (async (_url: string, init: { body: string }) => {
      payload = JSON.parse(init.body) as Record<string, string>;
      return { ok: true, status: 200 };
    }) as unknown as typeof fetch);
    const mailer = getContactMailer();
    await expect(mailer.sendContactNotification(INPUT)).resolves.toEqual({
      sent: false,
      reason: "not-configured",
    });
    expect(payload).toBeNull();
    await expect(mailer.sendContactAcknowledgement(INPUT)).resolves.toEqual({ sent: true });
    expect((payload as unknown as Record<string, string>).to).toBe(INPUT.email);
    expect((payload as unknown as Record<string, string>).subject).toBe(
      CONTACT_ACKNOWLEDGEMENT_SUBJECT,
    );
  });
});
