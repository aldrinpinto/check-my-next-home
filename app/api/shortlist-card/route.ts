// GET /api/shortlist-card — one shortlist card, derived
// fresh from the current check data (BUG-318 + BUG-309).
//
// Two shapes, one endpoint:
//   ?outward=CM3            — the rung-3 card for a
//                             postcode district (the
//                             district Save buttons on
//                             the place pages).
//   ?postcode=CM3%202JT&home=<home key>
//                           — the rung-1 card for a home
//                             (the shortlist page's refresh
//                             of a stale saved snapshot).
// The two shapes are exclusive: both, or neither, is a
// bad request.
//
// The card is derived through the same derivation the
// results page renders (checkResults / checkResultsWider
// + buildShortlistCard), so a saved card and a fresh one
// are the same facts — never a second assembly. The
// response is { card } — the card's savedAt stands empty
// from the assembly; the caller stamps it on save, and a
// refresh keeps the stored savedAt.
//
// This is NOT a check for M9.11 counting: it fires no
// check_started event and touches no counting — it is a
// re-serve of facts the visitor already checked.
//
// Rate-limited per caller (120/minute — the suggest
// endpoint's discipline, the other client-fired read):
// a scripted card harvest is not a use the product
// offers.
//
// Answers:
//   400 — bad parameters (both shapes, neither shape,
//         or a parameter that is not what it claims).
//   404 — the outward names no district, the home no
//         longer resolves, or no card assembles.
//   429 — rate-limited.
//   500 — the derivation threw (logged; the client
//         keeps the stored card and tries again).

import { NextResponse } from "next/server";

import {
  classifyAddressInput,
  createAddressSource,
  resolveAddressInput,
} from "../../../lib/address";
import { getDbPool } from "../../../lib/server/db";
import { logEntry, newRequestId } from "../../../lib/server/entry-log";
import { rateLimitOk } from "../../../lib/server/rate-limit";
import { checkResults, checkResultsWider, resolutionForRoute } from "../../../lib/server/serve";
import { buildShortlistCard } from "../../../lib/shortlist-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

// A bare outward and nothing else ("CM3") — the
// district the param claims, in the classifier's own
// grammar. A partial postcode with a sector ("CM3 2"),
// a place name, or a full postcode all fail: the
// outward shape answers the district alone.
function isOutwardParam(value: string): boolean {
  const classified = classifyAddressInput(value);
  return (
    classified.partialOnly && classified.outward !== null && classified.text === classified.outward
  );
}

// A full postcode and nothing else ("CM3 2JT") — the
// home is named by the home param, never by text in
// this one.
function isFullPostcodeParam(value: string): boolean {
  const classified = classifyAddressInput(value);
  return classified.postcode !== null && classified.text === "";
}

export async function GET(request: Request) {
  const req = newRequestId();
  const caller = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimitOk(`shortlist-card:${caller}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    logEntry(req, "shortlist-card.limited", { layer: "local", reason: "rate-limit" });
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }
  const url = new URL(request.url);
  const outward = url.searchParams.get("outward");
  const postcode = url.searchParams.get("postcode");
  const home = url.searchParams.get("home");

  // The two shapes are exclusive, and each parameter
  // must be what it claims.
  const rung3 = outward !== null && postcode === null && home === null && isOutwardParam(outward);
  const rung1 =
    outward === null &&
    postcode !== null &&
    home !== null &&
    home.length > 0 &&
    isFullPostcodeParam(postcode);
  if (!rung3 && !rung1) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  try {
    if (rung3) {
      const resolution = await resolveAddressInput(
        outward as string,
        createAddressSource(getDbPool()),
      );
      if (resolution.rung !== 3) {
        return NextResponse.json({ error: "not-found" }, { status: 404 });
      }
      const results = await checkResultsWider(resolution);
      const card = buildShortlistCard({ resolution, short: results.short });
      if (!card) return NextResponse.json({ error: "not-found" }, { status: 404 });
      return NextResponse.json({ card });
    }
    const resolution = await resolutionForRoute(postcode as string, home as string, req);
    if (!resolution || resolution.rung !== 1) {
      return NextResponse.json({ error: "not-found" }, { status: 404 });
    }
    const results = await checkResults(resolution);
    const card = buildShortlistCard({
      resolution,
      nearby: results.nearby,
      sold: results.sold,
      area: results.area,
      short: results.short,
      routeKey: home,
    });
    if (!card) return NextResponse.json({ error: "not-found" }, { status: 404 });
    return NextResponse.json({ card });
  } catch (error) {
    // A derivation failure is the serve layer's fault,
    // logged with its reason — the client keeps the
    // stored card and the visitor can try again.
    logEntry(req, "shortlist-card.failed", {
      layer: "local",
      reason: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "card-failed" }, { status: 500 });
  }
}
