// The contact message store and the submit flow
// (BUG-028 fix; founder ruling 19 Nov 2026).
//
// The seam in the house pattern (lib/server/gifts.ts):
// an interface, a database implementation over
// migration 0037's table, and an in-memory
// implementation the tests run. The validation
// decisions are pure and live in lib/contact.ts; this
// file owns the shelf, the writes, and the ORDER the
// ruling pins:
//
//   1. STORAGE FIRST. A message counts as received
//      when — and only when — its row is stored. The
//      visitor's thanks (CONTACT_THANKS, kept word for
//      word) is served only on a stored outcome.
//   2. NOTIFICATION SECOND. The notification email to
//      the contact inbox (lib/server/contact-mailer.ts)
//      is attempted only after a successful store. Its
//      failure — unconfigured mailer included — is
//      logged server-side and changes nothing for the
//      visitor: the message was received, so the thanks
//      stands.
//   3. ACKNOWLEDGEMENT THIRD (GAP-1; founder ruling
//      22 Nov 2026). The acknowledgement email back to
//      the sender is attempted after the notification,
//      independently of its outcome — the two sends
//      carry different FROM names and either can be
//      configured without the other. Its failure is
//      logged and changes nothing, on the
//      notification's own discipline: the thanks the
//      visitor saw already made this email's promise.
//   4. A STORAGE FAILURE is the one honest failure the
//      visitor sees: the outcome is storage-failed, the
//      mailer is never called, and the route answers
//      with the designed failure state — nothing was
//      received, and the page says so.
//
// The logs name the failure class only — never the
// visitor's address, name or message.

import type { AddressQueryable } from "../address";
import type { ContactInput } from "../contact";
import type { ContactMailer } from "./contact-mailer";

export interface ContactStore {
  insert(input: ContactInput): Promise<{ id: number; createdAt: Date }>;
}

export function createDbContactStore(db: AddressQueryable): ContactStore {
  return {
    async insert(input) {
      const { rows } = await db.query(
        `INSERT INTO contact_messages (name, email, message)
         VALUES ($1, $2, $3)
         RETURNING id, created_at`,
        [input.name, input.email, input.message],
      );
      const row = rows[0];
      if (!row) throw new Error("contact insert returned no row");
      return { id: Number(row.id), createdAt: new Date(row.created_at as string) };
    },
  };
}

export function createMemoryContactStore(): ContactStore & { rows: ContactInput[] } {
  const rows: ContactInput[] = [];
  return {
    rows,
    async insert(input) {
      rows.push(input);
      return { id: rows.length, createdAt: new Date() };
    },
  };
}

export type ContactSubmitOutcome =
  { kind: "stored"; notification: "sent" | "failed" } | { kind: "storage-failed" };

export type ContactLog = (line: string) => void;

const defaultLog: ContactLog = (line) => {
  console.error(line);
};

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown-error";
}

// Store, then notify, then acknowledge — the ruling's
// order, executed once per valid submission. Every
// failure is a value on the outcome; nothing here
// throws.
export async function submitContactMessage(
  deps: { store: ContactStore; mailer: ContactMailer; log?: ContactLog },
  input: ContactInput,
): Promise<ContactSubmitOutcome> {
  const log = deps.log ?? defaultLog;

  try {
    await deps.store.insert(input);
  } catch (error) {
    log(`contact: storage failed (${errorName(error)}) — nothing was received`);
    return { kind: "storage-failed" };
  }

  let notification: "sent" | "failed";
  try {
    const result = await deps.mailer.sendContactNotification(input);
    notification = result.sent ? "sent" : "failed";
    if (!result.sent) log(`contact: notification failed (${result.reason}) — message is stored`);
  } catch {
    notification = "failed";
    log("contact: notification failed (send-failed) — message is stored");
  }

  try {
    const result = await deps.mailer.sendContactAcknowledgement(input);
    if (!result.sent) log(`contact: acknowledgement failed (${result.reason}) — message is stored`);
  } catch {
    log("contact: acknowledgement failed (send-failed) — message is stored");
  }
  return { kind: "stored", notification };
}
