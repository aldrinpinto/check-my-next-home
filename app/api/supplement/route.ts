// GET /api/supplement?postcode=…[&street=…][&building=…]
// — the ONE deliberate Postio call of the entry point
// (BUG-185, founder-ruled 23 Nov 2026, superseding the
// automatic floor-of-5 supplement of D72's first form).
//
// Nothing in the product calls Postio on a page load or a
// keystroke any more. This endpoint answers the visitor's
// click on the "Don't see your home? Search the full
// address list" row inside a dropdown that lists one
// postcode's homes — the search box's panel or the check
// page's picker, identically. It rebuilds the local list
// exactly as the surface built it (the ladder's narrowing
// re-run, the picking union over it), fetches Postio's
// list for the postcode once (the 5-minute in-process
// list memory may answer — re-listing re-charges), merges
// and dedupes by home identity, and returns the rows in
// the picker's own shape: a local row carries its home
// key, a Postio row its UDPRN for /api/pick.
//
// The kill switch (POSTIO_SUPPLEMENT_ENABLED) is read in
// the serve layer on every call: off, this endpoint
// returns the local list unsupplemented and no Postio
// call is made — the row the visitor clicked cannot be
// rendered while the switch is off, and this is the
// backstop that keeps that true even for a stale page.
//
// Failure discipline: a Postio failure is not an error
// response — the serve layer returns the local list
// standing, and the client settles the row to its done
// state over it, exactly as it does on success. Only a
// malformed request (no valid full postcode) or a
// serve-layer fault answers an error status, and the
// client treats those the same silent way. Like
// /api/suggest, the endpoint is rate-limited per caller
// rather than robot-checked: it is a click, not a form
// submit, and /api/pick — the billable moment it feeds —
// carries no robot check either.

import { NextResponse } from "next/server";

import { normalisePostcode } from "../../../lib/address";
import { logEntry, newRequestId } from "../../../lib/server/entry-log";
import { rateLimitOk } from "../../../lib/server/rate-limit";
import { supplementForRoute } from "../../../lib/server/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

export async function GET(request: Request) {
  const req = newRequestId();
  const caller = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimitOk(`supplement:${caller}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    logEntry(req, "supplement.limited", { layer: "local", reason: "rate-limit" });
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }
  const url = new URL(request.url);
  const postcode = normalisePostcode(url.searchParams.get("postcode") ?? "");
  if (!postcode) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const narrowing = {
    street: url.searchParams.get("street"),
    building: url.searchParams.get("building"),
  };
  try {
    const rows = await supplementForRoute(postcode, narrowing, req);
    return NextResponse.json({ postcode, rows });
  } catch {
    return NextResponse.json({ error: "supplement-failed" }, { status: 500 });
  }
}
