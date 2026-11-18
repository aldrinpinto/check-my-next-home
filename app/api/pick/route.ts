// POST /api/pick { postcode, udprn } — a pick of a
// Postio-supplied picker row (entry-point build, 18 Nov
// 2026; decision D72).
//
// The pick is the hybrid's one billable moment: the row's
// parts come from the picker's warm list memory when it
// holds them, or from Postio's UDPRN resolve when it does
// not, and are written into a transient resolve record
// (24-hour TTL, founder-ruled). The answer is the URL the
// client navigates to — the home route carrying the
// record's token where home= sits.
//
// A pick that cannot resolve (Postio timed out, errored,
// refused for zero balance, or is not configured) is NOT
// an error response: the answer is the fallback — the
// whole-postcode check carrying the mid-pick notice flag
// (?notfound=pick) — because the journey must never dead-
// end on a backstop failure (D72 item 3). The decision is
// logged either way (pick.resolved), so one request id
// shows which layer carried the pick, or why none could.

import { NextResponse } from "next/server";

import { getDbPool } from "../../../lib/server/db";
import { newRequestId } from "../../../lib/server/entry-log";
import { pickFallbackUrl, resolvePick } from "../../../lib/server/hybrid";
import { getPostioClient } from "../../../lib/server/postio";
import { createDbResolveRecordStore } from "../../../lib/server/resolve-records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const req = newRequestId();
  let postcode = "";
  let udprn = "";
  try {
    const body = (await request.json()) as { postcode?: unknown; udprn?: unknown };
    if (typeof body.postcode === "string") postcode = body.postcode;
    if (typeof body.udprn === "string") udprn = body.udprn;
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  if (!postcode || !udprn) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  try {
    const result = await resolvePick({
      postio: getPostioClient(),
      store: createDbResolveRecordStore(getDbPool()),
      postcode,
      udprn,
      req,
    });
    return NextResponse.json({ url: result.url, kind: result.kind });
  } catch {
    // Even the fallback machinery failing must not dead-end
    // the journey: the plain postcode-level check, without
    // the notice (nothing was resolved enough to promise
    // one), is the floor.
    return NextResponse.json({ url: pickFallbackUrl(postcode), kind: "fallback" });
  }
}
