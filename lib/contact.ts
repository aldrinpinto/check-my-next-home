// The Contact form's brain (BUG-028 fix; founder
// ruling 19 Nov 2026 — real delivery wired behind the
// form, CONTACT_THANKS kept word for word).
//
// Pure, like lib/gift.ts's claim decisions: what a
// submission MEANS is decided here — the field rules,
// the error tokens the page renders, the entry flash's
// shape — while lib/server/contact.ts owns the shelf
// (migration 0037's table) and the notification, and
// app/contact/send/route.ts only executes.
//
// The email rule is the site's one rule: the gift
// form's normaliseEmail + isEmailShape, imported, never
// re-implemented — one judge of an address everywhere,
// and the error line (lib/site-pages.ts's
// CONTACT_EMAIL_ERROR) is word for word the claim
// form's.

import { isEmailShape, normaliseEmail } from "./gift";

// The field caps. The message cap is named in the
// too-long error line itself; the table's CHECKs
// (migration 0037) mirror all three — the two move
// together or not at all.
export const CONTACT_NAME_MAX = 100;
export const CONTACT_EMAIL_MAX = 254;
export const CONTACT_MESSAGE_MAX = 5000;

// The error tokens the send route carries back to the
// page (?error=name,email,…). Each names the field
// whose line stands under it; "message-long" is the
// message field carrying its too-long line instead of
// its empty line.
export type ContactErrorField = "name" | "email" | "message" | "message-long";

export const CONTACT_ERROR_FIELDS: readonly ContactErrorField[] = [
  "name",
  "email",
  "message",
  "message-long",
];

export interface ContactInput {
  name: string;
  email: string;
  message: string;
}

export type ContactValidation =
  { ok: true; value: ContactInput } | { ok: false; errors: ContactErrorField[] };

// Judge one submission's raw fields. The value that
// passes is the value that is stored: name and message
// trimmed, the email normalised by the site's rule.
// A field earns at most one token; the tokens come
// back in the form's own field order.
export function validateContactInput(raw: ContactInput): ContactValidation {
  const name = raw.name.trim();
  const email = normaliseEmail(raw.email);
  const message = raw.message.trim();

  const errors: ContactErrorField[] = [];
  if (name.length === 0 || name.length > CONTACT_NAME_MAX) errors.push("name");
  if (!isEmailShape(email)) errors.push("email");
  if (message.length === 0) errors.push("message");
  else if (message.length > CONTACT_MESSAGE_MAX) errors.push("message-long");

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { name, email, message } };
}

// The form's paths. The page is /contact; its one
// server call is the sibling route, in the claim
// form's placement (the POST route beside the page it
// serves).
export function contactPath(): string {
  return "/contact";
}

export function contactSendPath(): string {
  return "/contact/send";
}

// The entry flash (the gift form's BUG-029 pattern,
// carried whole): when a submission is refused — a
// field error, or the save failing — the typed values
// ride a one-shot cookie back to the page, so the
// re-served form stands filled under the error or
// failure line and a transient failure never costs the
// visitor their typed message. The values ride ONLY
// the cookie (never the URL), are read by the page
// only alongside an error or failure flag, are never
// logged and never counted, and retire on the next
// successful send. Only an entry short enough to be
// worth correcting is carried — the cap below; a
// longer paste gets the bare error, as the claim
// form's past-the-cap paste does.
export const CONTACT_ENTRY_COOKIE_NAME = "cmnh-contact-entry";
export const CONTACT_ENTRY_COOKIE_MAX_AGE_S = 300;
export const CONTACT_ENTRY_MAX = 3800;

export function encodeContactEntry(input: ContactInput): string | null {
  const encoded = JSON.stringify(input);
  return encoded.length <= CONTACT_ENTRY_MAX ? encoded : null;
}

export function decodeContactEntry(raw: string | undefined): ContactInput | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const { name, email, message } = parsed as Record<string, unknown>;
    if (typeof name !== "string" || typeof email !== "string" || typeof message !== "string") {
      return undefined;
    }
    return { name, email, message };
  } catch {
    return undefined;
  }
}
