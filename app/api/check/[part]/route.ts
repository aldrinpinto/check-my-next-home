// GET /api/check/<part>?postcode=…&home=… — the checking
// screen's brain calls (plan step M7.3). Three parts:
//   nearby — rows 1–7 (the nearby brain completes them
//            together; each row's named state is its own);
//   flood  — row 8 (the flood brain, its live-warnings
//            element composed at serve inside the 2-second
//            D42 budget by the cached builder);
//   area   — row 9 (the area bundle plus the sold-prices
//            and crime answers).
// The handlers call the frozen brains through the serve
// layer and derive row states through lib/journey.ts. A
// part that throws answers 500 — the client marks those
// rows with their named failure state and the results
// still open (D44(5)(ii)).

import { NextResponse } from "next/server";

import { floodRowResult, historyRowResult, nearbyRowResults } from "../../../../lib/journey";
import { newRequestId } from "../../../../lib/server/entry-log";
import {
  checkArea,
  checkFlood,
  checkNearby,
  resolutionForRoute,
} from "../../../../lib/server/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ part: string }> }) {
  const { part } = await params;
  if (part !== "nearby" && part !== "flood" && part !== "area") {
    return NextResponse.json({ error: "unknown-part" }, { status: 404 });
  }
  const url = new URL(request.url);
  const postcode = url.searchParams.get("postcode");
  const home = url.searchParams.get("home");
  if (!postcode) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  try {
    const resolution = await resolutionForRoute(postcode, home, newRequestId());
    if (!resolution) return NextResponse.json({ error: "no-resolution" }, { status: 404 });
    if (part === "nearby") {
      const bundle = await checkNearby(resolution);
      return NextResponse.json({ rows: nearbyRowResults(bundle) });
    }
    if (part === "flood") {
      const bundle = await checkFlood(resolution);
      return NextResponse.json({ row: floodRowResult(bundle) });
    }
    const { area, sold, crime } = await checkArea(resolution);
    return NextResponse.json({ row: historyRowResult(area, sold, crime) });
  } catch {
    return NextResponse.json({ error: "check-failed" }, { status: 500 });
  }
}
