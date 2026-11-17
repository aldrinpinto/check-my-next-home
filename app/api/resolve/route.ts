// POST /api/resolve — the search box's one server call
// (plan step M7.3). The robot check verifies FIRST (ruling
// 5: a failed or unavailable Turnstile blocks the search —
// the resolution never runs unverified), then the frozen
// ladder resolves the typed input from loaded data only,
// and the journey's destination comes from lib/journey.ts's
// single routing table. The client navigates to the
// destination; a resolution that throws is the whole-check
// failure (D44(7)) and the client lands on /search/failed.

import { NextResponse } from "next/server";

import { resolveTypedInput } from "../../../lib/server/serve";
import { verifyTurnstileToken } from "../../../lib/server/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let input = "";
  let token: string | null = null;
  try {
    const body = (await request.json()) as { input?: unknown; token?: unknown };
    if (typeof body.input === "string") input = body.input;
    if (typeof body.token === "string") token = body.token;
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const verdict = await verifyTurnstileToken(token);
  if (!verdict.ok) {
    return NextResponse.json({ error: "robot-check", reason: verdict.reason }, { status: 403 });
  }

  try {
    const { destination } = await resolveTypedInput(input);
    return NextResponse.json({ destination: destination.url, kind: destination.kind });
  } catch {
    return NextResponse.json({ error: "whole-check" }, { status: 500 });
  }
}
