// POST /gift/<token>/claim — the claim form's one
// server call (plan step M7.13, decision D21).
//
// The decision is lib/gift.ts's decideClaimAttempt —
// this handler only executes it:
//   same-email        → back to the claim page with
//                       ?refused=same-email (Text 4 over
//                       the form). NOTHING is written:
//                       the link stays valid, and a
//                       pending confirmation for another
//                       address survives untouched.
//   send-confirmation → the pending is (re)written and
//                       the confirmation email sent via
//                       the mailer seam. Sent: back with
//                       ?sent=1 (the pending screen) —
//                       or ?resent=1 (BUG-271) when the
//                       submitted address is the one the
//                       record's pending already carries,
//                       so the screen confirms the fresh
//                       link went out. Failed: the
//                       pending is rolled back — a failed
//                       send leaves nothing half-claimed
//                       — and the page carries
//                       ?sendfailed=1.
//   resume            → the bound holder is recognised:
//                       the gift cookie is set for the
//                       visit and the answer is the
//                       dedicated claimed page.
//   refused-claimed / → back to the claim page, which
//   closed              serves the state that stands
//                       (Text 3's guard screen, or the
//                       closed state's own screen).
//
// A rate-limited attempt (BUG-346) is answered, not
// swallowed: back with ?error=rate-limited, and the
// claim form carries the plain line. The limit itself
// (10/min per caller) is unchanged.
//
// A malformed address is refused before any decision:
// back with ?error=email, nothing written to the store.
// The address just typed rides the one-shot entry
// cookie instead (lib/gift.ts's GIFT_ENTRY_COOKIE_NAME
// — never the URL), so the re-served form stands with
// the entry in the field under the error line (view
// 18). Any attempt that passes the shape check clears
// that cookie on its way out, whichever way it lands —
// with one exception (fix batch, 19 Nov 2026 —
// BUG-029): a send failure re-arms the cookie with the
// just-typed address, so the form under the failure
// line (view 19) stands filled exactly as the form
// under the format error does; a transient failure
// never costs the visitor their typed address.
//
// Abuse shape: the endpoint sends email, so it is
// rate-limited per caller (the suggestions endpoint's
// limiter), and the state machine itself bounds the
// blast radius — one live pending per gift, replaced
// not accumulated, and a send only ever goes to the
// address just entered on a live, unclaimed gift.
//
// URLs minted here follow lib/server/public-url.ts's
// two rules (Regression run 44535680408 follow-up):
// every redirect is a RELATIVE Location — request.url's
// origin is the server's listen host, not the visitor's
// — and the confirmation email's link takes its origin
// from the forwarded headers.

import { NextResponse } from "next/server";

import {
  GIFT_COOKIE_NAME,
  GIFT_ENTRY_COOKIE_MAX_AGE_S,
  GIFT_ENTRY_COOKIE_NAME,
  decideClaimAttempt,
  giftClaimedPath,
  giftClaimPath,
  giftConfirmPath,
  isEmailShape,
  isGiftTokenForm,
  normaliseEmail,
} from "../../../../lib/gift";
import { getDbPool } from "../../../../lib/server/db";
import { getGiftMailer } from "../../../../lib/server/gift-mailer";
import { createDbGiftStore, newConfirmToken } from "../../../../lib/server/gifts";
import { publicOriginOf, redirectRelative } from "../../../../lib/server/public-url";
import { rateLimitOk } from "../../../../lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function back(token: string, query = ""): NextResponse {
  return redirectRelative(`${giftClaimPath(token)}${query}`);
}

// The entry cookie's shape, shared by its set and its
// clearing: httpOnly, scoped to the gift's own pages
// (the claim page and this route sit under the path).
function entryCookie(token: string) {
  return { httpOnly: true, sameSite: "lax" as const, path: giftClaimPath(token) };
}

// The format-failure answer: back with ?error=email,
// the just-typed address riding the entry cookie so
// the re-served form stands with the entry in the
// field (view 18). Only an entry short enough to be an
// address worth correcting is carried — the shape
// check's own cap; a longer paste gets the bare error.
function backWithEntry(token: string, entry: string): NextResponse {
  const response = back(token, "?error=email");
  if (entry.length > 0 && entry.length <= 254) {
    response.cookies.set(GIFT_ENTRY_COOKIE_NAME, entry, {
      ...entryCookie(token),
      maxAge: GIFT_ENTRY_COOKIE_MAX_AGE_S,
    });
  }
  return response;
}

// An attempt that passed the shape check retires the
// entry flash on its way out, whichever way it lands.
function cleared(response: NextResponse, token: string): NextResponse {
  response.cookies.set(GIFT_ENTRY_COOKIE_NAME, "", { ...entryCookie(token), maxAge: 0 });
  return response;
}

// The send-failure answer's cookie (BUG-029): the
// just-typed address re-armed under the same shape and
// cap as the format-failure answer's, so the page can
// stand it in the field under the failure line. An
// entry past the cap is not carried — the bare failure
// line answers, as a past-the-cap paste does on the
// format path.
function withEntry(response: NextResponse, token: string, entry: string): NextResponse {
  if (entry.length > 0 && entry.length <= 254) {
    response.cookies.set(GIFT_ENTRY_COOKIE_NAME, entry, {
      ...entryCookie(token),
      maxAge: GIFT_ENTRY_COOKIE_MAX_AGE_S,
    });
  }
  return response;
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isGiftTokenForm(token)) return back(token);

  const caller =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  // BUG-346: a rate-limited attempt is answered, not
  // swallowed — back with ?error=rate-limited, so the
  // claim form carries the plain line and the visitor
  // knows the click was heard. The limit itself is
  // unchanged (10/min per caller).
  if (!rateLimitOk(`gift-claim:${caller}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return back(token, "?error=rate-limited");
  }

  let email = "";
  try {
    const form = await request.formData();
    const value = form.get("email");
    if (typeof value === "string") email = normaliseEmail(value);
  } catch {
    return back(token, "?error=email");
  }
  if (!isEmailShape(email)) return backWithEntry(token, email);

  const store = createDbGiftStore(getDbPool());
  const record = await store.getByToken(token);
  if (!record) return cleared(back(token), token);

  const now = new Date();
  const attempt = decideClaimAttempt(record, email, now);

  let response: NextResponse;
  // Set only by the send-failure answer: its response
  // carries the entry cookie (BUG-029), so the shared
  // clearing at the foot must not retire it.
  let retainEntry = false;
  switch (attempt.kind) {
    case "same-email":
      response = back(token, "?refused=same-email");
      break;
    case "resume": {
      response = redirectRelative(giftClaimedPath(token));
      response.cookies.set(GIFT_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      break;
    }
    case "send-confirmation": {
      // BUG-271: a resend is a POST of the address the
      // record's pending already carries — the visitor
      // used the pending screen's resend link. It
      // answers ?resent=1 so the screen confirms the
      // fresh link went out; a new address (or no
      // pending standing) answers ?sent=1 as before.
      // The pending is rewritten either way, so only
      // the latest link works.
      const isResend = record.pendingEmail === email;
      const pendingToken = newConfirmToken();
      await store.setPending(token, email, pendingToken, now);
      // The link leaves the server in an email, so it is
      // absolute — on the request's PUBLIC origin (the
      // forwarded headers), never request.url's listen
      // origin (lib/server/public-url.ts).
      const confirmUrl = `${publicOriginOf(request)}${giftConfirmPath(token, pendingToken)}`;
      const result = await getGiftMailer().sendClaimConfirmation({
        to: email,
        giftToken: token,
        confirmUrl,
      });
      if (!result.sent) {
        await store.clearPending(token);
        response = withEntry(back(token, "?sendfailed=1"), token, email);
        retainEntry = true;
      } else {
        response = back(token, isResend ? "?resent=1" : "?sent=1");
      }
      break;
    }
    default:
      // refused-claimed, closed: the claim page serves
      // the state that stands.
      response = back(token);
  }
  return retainEntry ? response : cleared(response, token);
}
