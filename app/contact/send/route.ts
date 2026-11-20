// POST /contact/send — the Contact form's one server
// call (BUG-028 fix; founder ruling 19 Nov 2026: wire
// real delivery and keep the words).
//
// Until this fix the form showed CONTACT_THANKS
// client-side and sent nothing anywhere — the page
// promised a receipt and a reply nothing fulfilled.
// The handler now executes lib/server/contact.ts's
// pinned order: validate (lib/contact.ts), store
// (migration 0037), then notify the contact inbox
// through the mailer seam. The answers, in the gift
// claim route's forms:
//   invalid fields → back to /contact?error=<fields>,
//                    the typed values riding the
//                    one-shot entry cookie so the
//                    re-served form stands filled under
//                    the error lines (the BUG-029
//                    pattern, carried whole).
//   stored         → back with ?sent=1 — the ONLY
//                    answer that may show the thanks.
//                    A failed or unconfigured
//                    notification changes nothing here:
//                    the message was received (it is
//                    stored) and the failure is logged
//                    server-side by the submit flow.
//   storage failed → back with ?sendfailed=1 and the
//                    entry cookie re-armed, so the form
//                    stands filled under the failure
//                    line: nothing was received, and
//                    the page says so. The thanks is
//                    never served on this answer.
//   rate-limited   → the bare failure answer (nothing
//                    was received on this attempt
//                    either); the limiter is the events
//                    endpoint's — 120 per minute per
//                    caller (app/api/events' discipline,
//                    the endpoint that accepts posts).
//
// Redirects are RELATIVE Locations, per
// lib/server/public-url.ts's first rule — request.url's
// origin is the server's listen host, not the visitor's.

import { NextResponse } from "next/server";

import {
  CONTACT_ENTRY_COOKIE_MAX_AGE_S,
  CONTACT_ENTRY_COOKIE_NAME,
  contactPath,
  encodeContactEntry,
  validateContactInput,
  type ContactInput,
} from "../../../lib/contact";
import { createDbContactStore, submitContactMessage } from "../../../lib/server/contact";
import { getContactMailer } from "../../../lib/server/contact-mailer";
import { getDbPool } from "../../../lib/server/db";
import { redirectRelative } from "../../../lib/server/public-url";
import { rateLimitOk } from "../../../lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

function back(query = ""): NextResponse {
  return redirectRelative(`${contactPath()}${query}`);
}

// The entry cookie's shape, shared by its set and its
// clearing: httpOnly, scoped to the contact page and
// this route (both sit under /contact).
function entryCookie() {
  return { httpOnly: true, sameSite: "lax" as const, path: contactPath() };
}

// An answer that carries the typed values back: the
// entry cookie is armed when the entry is short enough
// to be worth correcting (lib/contact.ts's cap) and
// left unset past it — the flags alone answer then, as
// a past-the-cap paste is answered on the claim form.
function withEntry(response: NextResponse, raw: ContactInput): NextResponse {
  const encoded = encodeContactEntry(raw);
  if (encoded !== null) {
    response.cookies.set(CONTACT_ENTRY_COOKIE_NAME, encoded, {
      ...entryCookie(),
      maxAge: CONTACT_ENTRY_COOKIE_MAX_AGE_S,
    });
  }
  return response;
}

// An attempt that was stored retires the entry flash
// on its way out.
function cleared(response: NextResponse): NextResponse {
  response.cookies.set(CONTACT_ENTRY_COOKIE_NAME, "", { ...entryCookie(), maxAge: 0 });
  return response;
}

export async function POST(request: Request) {
  const caller = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimitOk(`contact:${caller}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return back("?sendfailed=1");
  }

  let raw: ContactInput = { name: "", email: "", message: "" };
  try {
    const form = await request.formData();
    const field = (name: string): string => {
      const value = form.get(name);
      return typeof value === "string" ? value : "";
    };
    raw = { name: field("name"), email: field("email"), message: field("message") };
  } catch {
    return back();
  }

  const validation = validateContactInput(raw);
  if (!validation.ok) {
    return withEntry(back(`?error=${validation.errors.join(",")}`), raw);
  }

  // The store factory itself can fail before any
  // storage is attempted (no DATABASE_URL — the pool
  // cannot be built): that is a storage failure too,
  // and earns the same honest answer.
  let outcome;
  try {
    outcome = await submitContactMessage(
      { store: createDbContactStore(getDbPool()), mailer: getContactMailer() },
      validation.value,
    );
  } catch {
    outcome = { kind: "storage-failed" as const };
  }

  if (outcome.kind === "storage-failed") {
    return withEntry(back("?sendfailed=1"), raw);
  }
  return cleared(back("?sent=1"));
}
