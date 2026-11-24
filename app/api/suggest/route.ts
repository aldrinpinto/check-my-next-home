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
// "Streets", "Properties" (M7.15C), then "Places"
// (M7.15D), then "Districts" (founder ruling, 20 Nov
// 2026 — BUG-009: one wider-area line, only when the
// typed input is exactly a district the directory
// knows): Postcodes complete to the defensive ceiling
// (the E161G fix — the grouped cap of 5 is a render
// window in the panel's CSS, never a served cut),
// Streets, Properties and Places capped at 5 each. A
// full-postcode-shaped input that resolves to nothing
// serves a settled empty response (BUG-010, same
// ruling) rather than its outward's fragments.
//
// A Places item carries { label, href, place }: the
// href is the place page's route (a single-district
// place's one district's wider-area route instead), and
// `place` is the filed place name, which the client's
// submit path uses to recognise a field holding exactly
// a place name. As built at M7.15D the item carried
// href: null and its pick expanded the place's
// districts inside the panel; the founder's ruling of
// 19 Nov 2026 reversed that — every pick navigates.
// Every other item kind keeps { label, href } exactly
// as before.

import { NextResponse } from "next/server";

import { getDbPool } from "../../../lib/server/db";
import { logEntry, newRequestId } from "../../../lib/server/entry-log";
import { postioSupplementEnabled } from "../../../lib/server/hybrid";
import { rateLimitOk } from "../../../lib/server/rate-limit";
import { createBoundedSuggestionSource, suggestionsFor } from "../../../lib/server/suggestions";

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
    // The bounded source (BUG-194): one dedicated
    // session per request, its statements under a
    // timeout, and the request's own signal wired to
    // cancel the database work when the caller goes
    // away — a superseded keystroke must not leave
    // its scan running against the shared pool.
    const bounded = await createBoundedSuggestionSource(getDbPool(), request.signal);
    try {
      const { groups, postcodeList } = await suggestionsFor(q, bounded.source, req);
      // BUG-185: when the answer is one postcode's own list,
      // the response also names that postcode and whether
      // the wider-list row may be offered (the kill switch,
      // read per request so flipping the env needs no
      // rebuild). The groups contract above is unchanged.
      if (postcodeList) {
        return NextResponse.json({
          groups,
          postcodeList,
          supplementEnabled: postioSupplementEnabled(),
        });
      }
      return NextResponse.json({ groups });
    } finally {
      await bounded.close();
    }
  } catch (error) {
    // BUG-203 (24 Nov 2026): this catch used to return
    // the 500 in silence — a failed suggest left no
    // trace at all, so the deploy's startup 500s and
    // the vanishing panel were both undiagnosable.
    // The failure is logged with the query's length
    // and the error (never the typed words — the
    // entry log's rule), so a 500 can be followed to
    // its cause.
    logEntry(req, "suggestions.failed", {
      layer: "local",
      reason: "suggest-failed",
      qlen: q.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "suggest-failed" }, { status: 500 });
  }
}
