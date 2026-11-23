// The admin page's resend route (M9.11) — the one
// write the page can make. It runs M9.10's owner
// re-send for the named order, with the order's own
// recorded email as the requester: the owner is
// behind the Access wall, and the engine sends only
// to that recorded address by construction, refusing
// a withdrawn (refunded) order itself. The attempt —
// sent, refused or failed — is written into the
// order's delivery log by the engine.

import { NextResponse } from "next/server";

import { getAdminDataDeps, resendAdminOrder } from "../../../lib/server/admin-data";
import { publicOriginOf } from "../../../lib/server/public-url";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { ref?: unknown } | null;
  const ref = typeof body?.ref === "string" ? body.ref : null;
  if (!ref) {
    return NextResponse.json({ ok: false, reason: "order-not-found" }, { status: 400 });
  }
  const result = await resendAdminOrder(getAdminDataDeps(), {
    ref,
    origin: publicOriginOf(request),
  });
  return NextResponse.json(result);
}
