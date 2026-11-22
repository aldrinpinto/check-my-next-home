// POST /api/payments/window — start a free-window
// report (plan step M9.6; the launch window, D44).
//
// The window door's fulfilment form posts the postcode,
// the home key and the delivery email; the server
// re-resolves the home itself (the payment seam's own
// ladder — a client-sent address is never trusted),
// takes a FREE fulfilment claim under a generated
// reference, and answers that reference, so the page
// can move to the success surface. The worker
// (lib/server/fulfilment.ts) delivers from the claim:
// no payment, no gift — gift tokens are inactive in
// the window, and the delivery's kind is "free".
//
// The route answers only while the door stands in its
// window state: the checked-in constant governs, so a
// direct post in any other state is refused — the free
// path cannot be opened by anything but the reviewed
// flip that opens the window itself.

import { NextResponse } from "next/server";

import { homeKeyOf } from "../../../../lib/bundle-cache";
import { isEmailShape, normaliseEmail } from "../../../../lib/gift";
import {
  PAYMENT_HOME_NOT_FOUND_LINE,
  WINDOW_START_FAILED_LINE,
} from "../../../../lib/report-payment";
import { isScotlandOrNorthernIrelandPostcode } from "../../../../lib/nation";
import { REPORT_DOOR_STATE } from "../../../../lib/site";
import { getDbPool } from "../../../../lib/server/db";
import { createDbFulfilmentClaimStore, newFreeClaimRef } from "../../../../lib/server/fulfilment";
import { rateLimitOk } from "../../../../lib/server/rate-limit";
import { resolutionForRoute } from "../../../../lib/server/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The house rate limiter, as on the intent route: a
// post here creates server state (a claim and, in due
// course, a report and an email), so it is guarded the
// same way.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const caller =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  if (!rateLimitOk(`payment-window:${caller}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json(
      { error: "rate-limited", message: WINDOW_START_FAILED_LINE },
      { status: 429 },
    );
  }

  let body: { postcode?: unknown; homeKey?: unknown; email?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad-request", message: WINDOW_START_FAILED_LINE },
      { status: 400 },
    );
  }
  if (
    typeof body.postcode !== "string" ||
    body.postcode.trim() === "" ||
    typeof body.email !== "string" ||
    (body.homeKey !== undefined && body.homeKey !== null && typeof body.homeKey !== "string")
  ) {
    return NextResponse.json(
      { error: "bad-request", message: WINDOW_START_FAILED_LINE },
      { status: 400 },
    );
  }
  const email = normaliseEmail(body.email);
  if (!isEmailShape(email)) {
    return NextResponse.json(
      { error: "email", message: WINDOW_START_FAILED_LINE },
      { status: 400 },
    );
  }

  let resolution = await resolutionForRoute(
    body.postcode,
    typeof body.homeKey === "string" ? body.homeKey : null,
  ).catch(() => null);
  if (!resolution && typeof body.homeKey === "string") {
    resolution = await resolutionForRoute(body.postcode, null).catch(() => null);
  }
  if (!resolution || (resolution.rung !== 1 && resolution.rung !== 2)) {
    return NextResponse.json(
      { error: "home-not-found", message: PAYMENT_HOME_NOT_FOUND_LINE },
      { status: 404 },
    );
  }
  // The route answers in the window state — and, since
  // the BUG-106 stack, for a Scotland or Northern
  // Ireland home in ANY door state: those nations are
  // served the report free (the interim-free door), and
  // this route is their fulfilment route, guarded by
  // the same house rate limiter above. An England &
  // Wales home outside the window state is refused, as
  // before. The claim kind is "free" — never "paid" —
  // so no gift issues from a nation delivery.
  const freeNation = isScotlandOrNorthernIrelandPostcode(
    resolution.rung === 1 ? resolution.address.postcode : resolution.directory.postcode,
  );
  if (REPORT_DOOR_STATE !== "window" && !freeNation) {
    return NextResponse.json({ error: "not-available" }, { status: 404 });
  }
  const postcode =
    resolution.rung === 1 ? resolution.address.postcode : resolution.directory.postcode;
  const homeKey = resolution.rung === 1 ? homeKeyOf(resolution) : null;

  const ref = newFreeClaimRef();
  try {
    await createDbFulfilmentClaimStore(getDbPool()).claim({
      ref,
      kind: "free",
      email,
      postcode,
      homeKey,
    });
  } catch {
    return NextResponse.json(
      { error: "unavailable", message: WINDOW_START_FAILED_LINE },
      { status: 502 },
    );
  }
  return NextResponse.json({ ref });
}
