// GET /api/suggest?q=… — the search box's suggestions
// (entry-point build, 18 Nov 2026; decisions D71 + D72).
//
// LOCAL FILED DATA ONLY. A keystroke never reaches Postio:
// Postio's free search endpoint is abuse-monitored (a high
// search volume with no matching resolves can suspend the
// key), and nothing paid may sit behind a keystroke. The
// suggestions are the filed postcode directory and the
// filed sale addresses — the postcode list is open data
// (ONSPD, OGL) in any case.
//
// This endpoint is therefore a DELIBERATE, NAMED EXCEPTION
// to the per-submit robot check that guards /api/resolve
// (D72 item 4, adopted in full): a per-keystroke Turnstile
// verification is impossible (the widget's token wait alone
// has an 8-second path) and would kill the instant feel the
// entry point is ruled to have. In exchange the endpoint
// is rate-limited per caller (120/minute — far above
// typing, far below a script) and serves nothing that is
// not already public. Turnstile stays exactly where the
// ruling puts it: on the typed-submit path, /api/resolve.
//
// The response shape is a contract (pinned by
// tests/entry-point.test.ts): { groups: [{ label, items:
// [{ label, href }] }] } — and every item's href is the
// route a pick navigates to. A full postcode serves the
// "Homes" group alone, carrying that postcode's COMPLETE
// home list (D71 amendment, founder ruling 18 Nov 2026 —
// the client renders it scrollable). Fragment shapes
// serve the groups in the ruling's order — "Postcodes",
// "Streets", "Properties" (M7.15C), then "Places" and
// the named place's "Districts in <Place>" (M7.15D):
// Postcodes complete to the defensive ceiling (the
// E161G fix — the grouped cap of 5 is a render window in
// the panel's CSS, never a served cut), Streets,
// Properties and Places capped at 5 each.
//
// M7.15D extends the item contract in one place, by
// necessity of the founder's ruling that the town
// chooser lives inside the picker: a Places item
// carries { label, href: null, place } — its pick does
// not navigate; the client files the filed place name
// into the search field, and the next response expands
// that place's districts in the same panel. Every other
// item kind keeps { label, href } exactly as before.

import { NextResponse } from "next/server";

import { getDbPool } from "../../../lib/server/db";
import { logEntry, newRequestId } from "../../../lib/server/entry-log";
import { rateLimitOk } from "../../../lib/server/rate-limit";
import { createSuggestionSource, suggestionsFor } from "../../../lib/server/suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

export async function GET(request: Request) {
  const req = newRequestId();
  const caller = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimitOk(`suggest:${caller}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    logEntry(req, "suggestions.limited", { layer: "local", reason: "rate-limit" });
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  try {
    const source = createSuggestionSource(getDbPool());
    const { groups } = await suggestionsFor(q, source, req);
    return NextResponse.json({ groups });
  } catch {
    return NextResponse.json({ error: "suggest-failed" }, { status: 500 });
  }
}
