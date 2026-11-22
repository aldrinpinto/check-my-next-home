// GET /api/check/<part>?postcode=…&home=… — the checking
// screen's brain calls (plan step M7.3). Four parts, one
// per settlement the screen's five groups wait on:
//   nearby — the schools and health groups (the nearby
//            brain answers both together);
//   flood  — the safety group's flood segments (the flood
//            brain, its live warnings composed at serve
//            inside the D42 budget by the cached builder);
//   crime  — the safety group's crime segment and its air
//            rider (the crime bundle plus the area bundle
//            the air fact derives from);
//   area   — the costs group and the history group (the
//            area bundle plus the sold-prices answer).
// BUG-144 (founder ruling, 22 Nov 2026): the safety
// group's two halves are their own parts — flood and
// crime — fired first by the screen and running in
// parallel; until this stack the crime answer rode the
// area part, so the slowest group waited on sold prices
// it does not read.
// The handlers call the frozen brains through the serve
// layer and derive the groups' completion lines through
// lib/journey.ts — the derivation runs here, server-side,
// because the bundles are server contracts and are never
// shipped to the browser. A part that throws answers 500 —
// the client completes the affected groups with their
// named failure lines and the results still open
// (D44(5)(ii)).
//
// The wire contract (CI #247 fix, 19 Nov 2026): each part
// answers with the payload object itself, in exactly the
// shape of lib/journey.ts's payload interfaces — nearby
// answers the {schools, health} groups object, flood
// answers the bare segments array, crime answers
// {crime, air}, area answers {groups}. The first cut of this route wrapped
// nearby in {groups: …} and flood in {safety: …}; the
// client's assembly read the groups as absent (the screen
// never advanced) and spread the flood object as if it
// were the array (a render throw) — every journey through
// the checking screen timed out in the browser suite
// while every unit test stayed green, because each side
// had only ever been tested against its own assumption.
// The client now also validates each part's body against
// the contract (parseCheckingPartValue) and completes the
// affected groups with their failure lines on a mismatch,
// so a future wire break degrades instead of stalling.
//
// A fourth part serves the wider-area checking screen
// (founder ruling, 19 Nov 2026):
//   district — GET /api/check/district?outward=… answers
//            the four district groups' completion lines,
//            derived server-side from the district bundle
//            through lib/district-checking.ts (plus the
//            stamp's place and the nation's not-covered
//            kind). The district serve is the page's own
//            (checkDistrictWider, through the D29-pattern
//            district cache), and concurrent calls share
//            one build with the page's streamed results —
//            the screen's lines and the results behind it
//            derive from the same bundle.

import { NextResponse } from "next/server";

import { resolveAddressInput, createAddressSource } from "../../../../lib/address";
import { districtCheckingPayload } from "../../../../lib/district-checking";
import {
  areaCheckingGroups,
  floodCheckingSegments,
  nearbyCheckingGroups,
  safetyCheckingSegments,
} from "../../../../lib/journey";
import { newRequestId } from "../../../../lib/server/entry-log";
import { getDbPool } from "../../../../lib/server/db";
import {
  checkArea,
  checkCrime,
  checkDistrictBundleOnly,
  checkFlood,
  checkNearby,
  resolutionForRoute,
} from "../../../../lib/server/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ part: string }> }) {
  const { part } = await params;
  if (
    part !== "nearby" &&
    part !== "flood" &&
    part !== "crime" &&
    part !== "area" &&
    part !== "district"
  ) {
    return NextResponse.json({ error: "unknown-part" }, { status: 404 });
  }
  const url = new URL(request.url);

  if (part === "district") {
    const outward = url.searchParams.get("outward");
    if (!outward) return NextResponse.json({ error: "bad-request" }, { status: 400 });
    try {
      const resolution = await resolveAddressInput(outward, createAddressSource(getDbPool()));
      if (resolution.rung !== 3)
        return NextResponse.json({ error: "no-resolution" }, { status: 404 });
      // The payload settles on the district bundle alone
      // (fix batch, 19 Nov 2026 — BUG-017): a Scotland /
      // NI outward answers not-covered from one directory
      // query, and the screen completes on that settlement
      // without playing — it never waits for the page's
      // five-bundle short derivation.
      const district = await checkDistrictBundleOnly(resolution);
      return NextResponse.json(districtCheckingPayload(district));
    } catch {
      return NextResponse.json({ error: "check-failed" }, { status: 500 });
    }
  }

  const postcode = url.searchParams.get("postcode");
  const home = url.searchParams.get("home");
  if (!postcode) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  try {
    const resolution = await resolutionForRoute(postcode, home, newRequestId());
    if (!resolution) return NextResponse.json({ error: "no-resolution" }, { status: 404 });
    if (part === "nearby") {
      const bundle = await checkNearby(resolution);
      return NextResponse.json(nearbyCheckingGroups(bundle));
    }
    if (part === "flood") {
      const bundle = await checkFlood(resolution);
      return NextResponse.json(floodCheckingSegments(bundle));
    }
    if (part === "crime") {
      const { crime, area } = await checkCrime(resolution);
      return NextResponse.json(safetyCheckingSegments(crime, area));
    }
    const { area, sold } = await checkArea(resolution);
    const groups = areaCheckingGroups(area, sold);
    return NextResponse.json({
      groups: { costs: groups.costs, history: groups.history },
    });
  } catch {
    return NextResponse.json({ error: "check-failed" }, { status: 500 });
  }
}
