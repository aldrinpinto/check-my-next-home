// GET /gift/<token>/confirm/<pending> — the
// confirmation link from the claim email (plan step
// M7.13, decision D21; the adopted email-confirmation
// step, gap check item 1).
//
// Clicking it is the one act that binds a gift: the
// store binds only while the gift is still Issued, the
// pending token still matches (a later claim attempt
// replaces it, so an older link is inert), and the
// gift is in date — a click after day 30 binds nothing
// and lands on the claim route, which serves Text 1.
// On a bind, the gift cookie is set for the visit and
// the answer is the dedicated claimed page.
//
// Every other outcome — a superseded link, a second
// click on a spent link, a made-up link — lands on the
// claim route and lets it serve the state that
// actually stands (the guard screen for the bound
// holder, the claim form for an unclaimed gift). The
// link confirms nothing about any state it doesn't
// bind.
//
// Every redirect here is a RELATIVE Location
// (lib/server/public-url.ts's first rule; Regression
// run 44535680408 follow-up): request.url's origin is
// the server's listen host, and an absolute redirect
// built from it sends the claimant's browser to the
// server's own loopback.

import {
  GIFT_COOKIE_NAME,
  giftClaimedPath,
  giftClaimPath,
  isGiftTokenForm,
} from "../../../../../lib/gift";
import { getDbPool } from "../../../../../lib/server/db";
import { createDbGiftStore } from "../../../../../lib/server/gifts";
import { redirectRelative } from "../../../../../lib/server/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; pending: string }> },
) {
  const { token, pending } = await params;
  const backToClaim = () => redirectRelative(giftClaimPath(token));
  if (!isGiftTokenForm(token) || !isGiftTokenForm(pending)) {
    return backToClaim();
  }

  const store = createDbGiftStore(getDbPool());
  const now = new Date();
  const record = await store.getByToken(token);
  // Expiry is checked here, not left to the store: the
  // binding must not land in the gap between the read
  // and the write on day 30's edge — the record's own
  // expiresAt is the clock the state machine reads.
  if (!record || now.getTime() > record.expiresAt.getTime()) {
    return backToClaim();
  }

  const bound = await store.bindByConfirm(token, pending, now);
  if (!bound) return backToClaim();

  const response = redirectRelative(giftClaimedPath(token));
  response.cookies.set(GIFT_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
