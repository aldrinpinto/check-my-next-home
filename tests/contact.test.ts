import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ContactForm from "../components/ContactForm";
import {
  CONTACT_ENTRY_MAX,
  decodeContactEntry,
  encodeContactEntry,
  validateContactInput,
  type ContactInput,
} from "../lib/contact";
import {
  CONTACT_SEND_FAILED_LINE,
  CONTACT_THANKS,
  CONTACT_EMAIL_ERROR,
  CONTACT_MESSAGE_ERROR,
  CONTACT_MESSAGE_TOO_LONG_ERROR,
  CONTACT_NAME_ERROR,
} from "../lib/site-pages";
import {
  createMemoryContactStore,
  submitContactMessage,
  type ContactStore,
} from "../lib/server/contact";
import type { ContactMailer } from "../lib/server/contact-mailer";

// BUG-028 fix (founder ruling 19 Nov 2026) — the Contact
// form's wired delivery: the validation judge, the
// store-before-notify order, the honesty rules (a
// stored message earns the thanks whatever the mailer
// does; a failed save never does), and the form's
// rendered states. The words themselves are pinned
// verbatim here, including the one the ruling kept:
// CONTACT_THANKS, character for character.
//
// React's static renderer escapes apostrophes in text
// (&#x27;); the assertions read the unescaped form, so
// they judge the words a browser shows.
const text = (html: string) =>
  html.replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");

const VALID: ContactInput = {
  name: "Alex Morgan",
  email: "alex@example.co.uk",
  message: "The flood line on my check looks wrong.",
};

describe("the kept words (the ruling's condition)", () => {
  it("CONTACT_THANKS stands exactly as it stood before the wiring", () => {
    expect(CONTACT_THANKS).toBe(
      "Thank you for writing to us — we've got your message. We reply within two working days.",
    );
  });
});

describe("the validation judge (lib/contact.ts)", () => {
  it("passes a sound submission, trimmed and with the email normalised", () => {
    const result = validateContactInput({
      name: "  Alex Morgan  ",
      email: "  Alex@Example.co.uk ",
      message: "  Hello there. ",
    });
    expect(result).toEqual({
      ok: true,
      value: { name: "Alex Morgan", email: "alex@example.co.uk", message: "Hello there." },
    });
  });

  it("refuses an empty name, an empty message and a whitespace-only pair", () => {
    expect(validateContactInput({ name: " ", email: "a@b.co.uk", message: "x" })).toEqual({
      ok: false,
      errors: ["name"],
    });
    expect(validateContactInput({ name: "A", email: "a@b.co.uk", message: "  " })).toEqual({
      ok: false,
      errors: ["message"],
    });
  });

  it("judges the email by the site's one shape rule (the gift form's)", () => {
    // The claim form's own mistyped witness (view 18).
    expect(validateContactInput({ name: "A", email: "name@exampl", message: "x" })).toEqual({
      ok: false,
      errors: ["email"],
    });
    expect(validateContactInput({ name: "A", email: "plain-text", message: "x" }).ok).toBe(false);
    expect(validateContactInput({ name: "A", email: "a@b", message: "x" }).ok).toBe(false);
  });

  it("returns every refused field, in the form's own order", () => {
    expect(validateContactInput({ name: "", email: "nope", message: "" })).toEqual({
      ok: false,
      errors: ["name", "email", "message"],
    });
  });

  it("names an over-long message with its own token, not the empty one", () => {
    const result = validateContactInput({
      name: "A",
      email: "a@b.co.uk",
      message: "x".repeat(5001),
    });
    expect(result).toEqual({ ok: false, errors: ["message-long"] });
    expect(
      validateContactInput({ name: "A", email: "a@b.co.uk", message: "x".repeat(5000) }).ok,
    ).toBe(true);
  });
});

describe("the entry flash (the BUG-029 pattern)", () => {
  it("round-trips the typed values", () => {
    const encoded = encodeContactEntry(VALID);
    expect(encoded).not.toBeNull();
    expect(decodeContactEntry(encoded as string)).toEqual(VALID);
  });

  it("carries nothing past its cap, and decodes foreign values to nothing", () => {
    const long: ContactInput = { ...VALID, message: "x".repeat(CONTACT_ENTRY_MAX) };
    expect(encodeContactEntry(long)).toBeNull();
    expect(decodeContactEntry("not json")).toBeUndefined();
    expect(decodeContactEntry('{"name":1}')).toBeUndefined();
    expect(decodeContactEntry(undefined)).toBeUndefined();
  });
});

function recordingMailer(
  order: string[],
  result: { sent: boolean; reason?: string },
): ContactMailer {
  return {
    async sendContactNotification() {
      order.push("notify");
      return result.sent ? { sent: true } : { sent: false, reason: result.reason ?? "failed" };
    },
    // The acknowledgement rides silently in these
    // notification-focused cases (its own flow cases
    // stand in the GAP-1 describe below): it answers
    // sent and records nothing, so the orders and log
    // counts pinned here stay the notification's alone.
    async sendContactAcknowledgement() {
      return { sent: true };
    },
  };
}

describe("the submit flow's order and honesty (lib/server/contact.ts)", () => {
  it("stores first, notifies second, and reports the pair", async () => {
    const order: string[] = [];
    const store = createMemoryContactStore();
    const insert = store.insert.bind(store);
    store.insert = async (input) => {
      order.push("store");
      return insert(input);
    };
    const outcome = await submitContactMessage(
      { store, mailer: recordingMailer(order, { sent: true }), log: () => {} },
      VALID,
    );
    expect(order).toEqual(["store", "notify"]);
    expect(outcome).toEqual({ kind: "stored", notification: "sent" });
    expect(store.rows).toEqual([VALID]);
  });

  it("mailer-absent still receives: stored, notification failed, the failure logged", async () => {
    const logs: string[] = [];
    const store = createMemoryContactStore();
    const outcome = await submitContactMessage(
      {
        store,
        mailer: recordingMailer([], { sent: false, reason: "not-configured" }),
        log: (line) => logs.push(line),
      },
      VALID,
    );
    // The play server's standing state: no RESEND_API_KEY,
    // so every notification answers not-configured — and
    // the message is still received, because it is stored.
    expect(outcome).toEqual({ kind: "stored", notification: "failed" });
    expect(store.rows).toEqual([VALID]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("not-configured");
    expect(logs[0]).not.toContain(VALID.email);
    expect(logs[0]).not.toContain(VALID.message);
  });

  it("a throwing mailer is a failed notification, never a failed receipt", async () => {
    const store = createMemoryContactStore();
    const outcome = await submitContactMessage(
      {
        store,
        mailer: {
          async sendContactNotification() {
            throw new Error("boom");
          },
          async sendContactAcknowledgement() {
            return { sent: true };
          },
        },
        log: () => {},
      },
      VALID,
    );
    expect(outcome).toEqual({ kind: "stored", notification: "failed" });
    expect(store.rows).toEqual([VALID]);
  });

  it("a storage failure is the one honest failure — and the mailer is never called", async () => {
    const order: string[] = [];
    const logs: string[] = [];
    const store: ContactStore = {
      async insert() {
        order.push("store");
        throw new Error("db down");
      },
    };
    const outcome = await submitContactMessage(
      { store, mailer: recordingMailer(order, { sent: true }), log: (line) => logs.push(line) },
      VALID,
    );
    expect(outcome).toEqual({ kind: "storage-failed" });
    expect(order).toEqual(["store"]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("nothing was received");
  });
});

describe("the acknowledgement in the submit flow (GAP-1)", () => {
  function twoSendMailer(
    order: string[],
    results: {
      notification: { sent: boolean; reason?: string };
      acknowledgement: { sent: boolean; reason?: string };
    },
  ): ContactMailer {
    const answer = (r: { sent: boolean; reason?: string }) =>
      r.sent ? { sent: true as const } : { sent: false as const, reason: r.reason ?? "failed" };
    return {
      async sendContactNotification() {
        order.push("notify");
        return answer(results.notification);
      },
      async sendContactAcknowledgement() {
        order.push("acknowledge");
        return answer(results.acknowledgement);
      },
    };
  }

  it("runs store, notify, acknowledge — in that order — and the outcome stays the notification's", async () => {
    const order: string[] = [];
    const store = createMemoryContactStore();
    const insert = store.insert.bind(store);
    store.insert = async (input) => {
      order.push("store");
      return insert(input);
    };
    const outcome = await submitContactMessage(
      {
        store,
        mailer: twoSendMailer(order, {
          notification: { sent: true },
          acknowledgement: { sent: true },
        }),
        log: () => {},
      },
      VALID,
    );
    expect(order).toEqual(["store", "notify", "acknowledge"]);
    expect(outcome).toEqual({ kind: "stored", notification: "sent" });
  });

  it("the acknowledgement is attempted even when the notification failed — the sends are independent", async () => {
    const order: string[] = [];
    const outcome = await submitContactMessage(
      {
        store: createMemoryContactStore(),
        mailer: twoSendMailer(order, {
          notification: { sent: false, reason: "not-configured" },
          acknowledgement: { sent: true },
        }),
        log: () => {},
      },
      VALID,
    );
    expect(order).toEqual(["notify", "acknowledge"]);
    expect(outcome).toEqual({ kind: "stored", notification: "failed" });
  });

  it("a failed acknowledgement changes nothing for the visitor — it is logged, without the visitor's words", async () => {
    const logs: string[] = [];
    const outcome = await submitContactMessage(
      {
        store: createMemoryContactStore(),
        mailer: twoSendMailer([], {
          notification: { sent: true },
          acknowledgement: { sent: false, reason: "not-configured" },
        }),
        log: (line) => logs.push(line),
      },
      VALID,
    );
    expect(outcome).toEqual({ kind: "stored", notification: "sent" });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("acknowledgement failed (not-configured)");
    expect(logs[0]).not.toContain(VALID.email);
    expect(logs[0]).not.toContain(VALID.message);
  });

  it("a throwing acknowledgement is a logged failure, never a failed receipt", async () => {
    const logs: string[] = [];
    const outcome = await submitContactMessage(
      {
        store: createMemoryContactStore(),
        mailer: {
          async sendContactNotification() {
            return { sent: true };
          },
          async sendContactAcknowledgement() {
            throw new Error("boom");
          },
        },
        log: (line) => logs.push(line),
      },
      VALID,
    );
    expect(outcome).toEqual({ kind: "stored", notification: "sent" });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("acknowledgement failed (send-failed)");
  });

  it("a storage failure calls neither send — nothing was received, so nothing is acknowledged", async () => {
    const order: string[] = [];
    const store: ContactStore = {
      async insert() {
        order.push("store");
        throw new Error("db down");
      },
    };
    const outcome = await submitContactMessage(
      {
        store,
        mailer: twoSendMailer(order, {
          notification: { sent: true },
          acknowledgement: { sent: true },
        }),
        log: () => {},
      },
      VALID,
    );
    expect(outcome).toEqual({ kind: "storage-failed" });
    expect(order).toEqual(["store"]);
  });
});

describe("the form as rendered (components/ContactForm.tsx)", () => {
  const render = (props: Parameters<typeof ContactForm>[0]) =>
    text(renderToStaticMarkup(createElement(ContactForm, props)));

  it("the plain form posts to the send route and shows no state lines", () => {
    const html = render({});
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/contact/send"');
    expect(html).toContain('name="name"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="message"');
    expect(html).not.toContain(CONTACT_THANKS);
    expect(html).not.toContain(CONTACT_SEND_FAILED_LINE);
  });

  it("the sent state — and only the sent state — carries the thanks", () => {
    const html = render({ sent: true });
    expect(html).toContain(CONTACT_THANKS);
    expect(html).toContain('class="thanks show"');
  });

  it("the failure state stands the failure line and the typed values — never the thanks", () => {
    const html = render({ sendFailed: true, values: VALID });
    expect(html).toContain(CONTACT_SEND_FAILED_LINE);
    expect(html).toContain("nothing has been received");
    expect(html).not.toContain(CONTACT_THANKS);
    expect(html).toContain('value="Alex Morgan"');
    expect(html).toContain('value="alex@example.co.uk"');
    expect(html).toContain("The flood line on my check looks wrong.");
  });

  it("a refused field stands its line under it, with the entry in the field", () => {
    const html = render({
      errors: ["email"],
      values: { name: "Alex Morgan", email: "name@exampl", message: "Hello." },
    });
    expect(html).toContain(CONTACT_EMAIL_ERROR);
    expect(html).toContain('value="name@exampl"');
    expect(html).not.toContain(CONTACT_NAME_ERROR);
    expect(html).not.toContain(CONTACT_MESSAGE_ERROR);
    expect(html).not.toContain(CONTACT_THANKS);
  });

  it("the too-long message carries its own line", () => {
    const html = render({ errors: ["message-long"], values: VALID });
    expect(html).toContain(CONTACT_MESSAGE_TOO_LONG_ERROR);
    expect(html).not.toContain(CONTACT_MESSAGE_ERROR);
  });
});
