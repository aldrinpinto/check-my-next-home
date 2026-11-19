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
//                       ?sent=1 (the pending screen).
//                       Failed: the pending is rolled
//                       back — a failed send leaves
//                       nothing half-claimed — and the
//                       page carries ?sendfailed=1.
//   resume            → the bound holder is recognised:
//                       the gift cookie is set for the
//                       visit and the answer is the
//                       dedicated claimed page.
//   refused-claimed / → back to the claim page, which
//   closed              serves the state that stands
//                       (Text 3's guard screen, or the
//                       closed state's own screen).
//
// A malformed address is refused before any decision:
// back with ?error=email, nothing written to the store.
// The address just typed rides the one-shot entry
// cookie instead (lib/gift.ts's GIFT_ENTRY_COOKIE_NAME
// — never the URL), so the re-served form stands with
// the entry in the field under the error line (view
// 18). Any attempt that passes the shape check clears
// that cookie on its way out, whichever way it lands.
//
// Abuse shape: the endpoint sends email, so it is
// rate-limited per caller (the suggestions endpoint's
// limiter), and the state machine itself bounds the
// blast radius — one live pending per gift, replaced
// not accumulated, and a send only ever goes to the
// address just entered on a live, unclaimed gift.

import { NextResponse } from "next/server";

import {
  GIFT_COOKIE_NAME,
  GIFT_ENTRY_COOKIE_MAX_AGE_S,
  GIFT_ENTRY_COOKIE_NAME,
  decideClaimAttempt,
  giftClaimedPath,
  giftClaimPath,
  isEmailShape,
  isGiftTokenForm,
  normaliseEmail,
} from "../../../../lib/gift";
import { getDbPool } from "../../../../lib/server/db";
import { getGiftMailer } from "../../../../lib/server/gift-mailer";
import { createDbGiftStore, newConfirmToken } from "../../../../lib/server/gifts";
import { rateLimitOk } from "../../../../lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function back(request: Request, token: string, query = ""): NextResponse {
  return NextResponse.redirect(new URL(`${giftClaimPath(token)}${query}`, request.url), 303);
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
function backWithEntry(request: Request, token: string, entry: string): NextResponse {
  const response = back(request, token, "?error=email");
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

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isGiftTokenForm(token)) return back(request, token);

  const caller =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  if (!rateLimitOk(`gift-claim:${caller}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return back(request, token);
  }

  let email = "";
  try {
    const form = await request.formData();
    const value = form.get("email");
    if (typeof value === "string") email = normaliseEmail(value);
  } catch {
    return back(request, token, "?error=email");
  }
  if (!isEmailShape(email)) return backWithEntry(request, token, email);

  const store = createDbGiftStore(getDbPool());
  const record = await store.getByToken(token);
  if (!record) return cleared(back(request, token), token);

  const now = new Date();
  const attempt = decideClaimAttempt(record, email, now);

  let response: NextResponse;
  switch (attempt.kind) {
    case "same-email":
      response = back(request, token, "?refused=same-email");
      break;
    case "resume": {
      response = NextResponse.redirect(new URL(giftClaimedPath(token), request.url), 303);
      response.cookies.set(GIFT_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      break;
    }
    case "send-confirmation": {
      const pendingToken = newConfirmToken();
      await store.setPending(token, email, pendingToken, now);
      const confirmUrl = new URL(`/gift/${token}/confirm/${pendingToken}`, request.url).toString();
      const result = await getGiftMailer().sendClaimConfirmation({
        to: email,
        giftToken: token,
        confirmUrl,
      });
      if (!result.sent) {
        await store.clearPending(token);
        response = back(request, token, "?sendfailed=1");
      } else {
        response = back(request, token, "?sent=1");
      }
      break;
    }
    default:
      // refused-claimed, closed: the claim page serves
      // the state that stands.
      response = back(request, token);
  }
  return cleared(response, token);
}
