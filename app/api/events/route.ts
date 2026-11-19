// POST /api/events — the journey counting endpoint
// (plan step M7.14; lib/journey-events.ts carries the
// pinned catalogue and the no-address rule).
//
// FIRST-PARTY ONLY: our own client posts our own pinned
// events to our own stack. No vendor, no cookies, no
// fingerprinting — the caller is identified by nothing
// but the rate-limit window, and the stored payload is
// built here from a per-event whitelist, never spread
// from the request body: a field the catalogue does not
// name for that event does not exist as far as the store
// is concerned.
//
// The client sends the raw pathname; the PATTERN is
// derived here (routePatternOf) — a raw URL never
// reaches the store, because results URLs carry the
// postcode and claim URLs carry the gift token. Server-
// origin events (checkout_paid, gift_claimed,
// gift_redeemed) are refused: a browser can never forge
// the money facts.
//
// Counting never breaks the journey: an accepted post
// answers 204 whether the event recorded, duplicated or
// was dropped by the safety scan; only a structurally
// malformed post (bad JSON, an unknown event, a wrong
// field shape) answers 400, and a rate-limited caller
// 429 — the suggest endpoint's discipline.

import { NextResponse } from "next/server";

import {
  browserClassOf,
  journeyEventSpec,
  routePatternOf,
  type JourneyEventInput,
  type JourneyEventName,
} from "../../../lib/journey-events";
import type { Nation } from "../../../lib/journey";
import { getDbPool } from "../../../lib/server/db";
import { recordJourneyEvent, recordPageError } from "../../../lib/server/journey-events";
import { rateLimitOk } from "../../../lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const BODY_MAX = 8192;

const NATIONS = new Set(["england", "wales", "scotland", "northern-ireland", "unknown"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

function rungOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4
    ? value
    : null;
}

// Build the stored input for one client post, or null
// when the post's shape is not the catalogue's.
function buildInput(body: Record<string, unknown>): JourneyEventInput | null {
  const event = body.event;
  if (typeof event !== "string") return null;
  const spec = journeyEventSpec(event);
  if (!spec || spec.origin !== "client") return null;
  const name = spec.name as JourneyEventName;

  const path = shortString(body.path, 200);
  if (path === null || !path.startsWith("/")) return null;
  const routePattern = routePatternOf(path);

  const dedupeRaw = body.dedupe_key;
  const dedupeKey =
    typeof dedupeRaw === "string" && dedupeRaw.length >= 8 && dedupeRaw.length <= 64
      ? dedupeRaw
      : null;

  const base: JourneyEventInput = { event: name, routePattern, dedupeKey };

  switch (name) {
    case "page_view":
    case "shortlist_add":
    case "shortlist_remove":
    case "comparison_opened":
    case "report_clicked":
    case "checkout_started":
      return base;
    case "check_started": {
      const rung = rungOf(body.rung);
      if (rung === null) return null;
      return { ...base, rung };
    }
    case "check_completed": {
      const rung = rungOf(body.rung);
      if (rung === null) return null;
      const nationRaw = body.nation;
      if (typeof nationRaw !== "string" || !NATIONS.has(nationRaw)) return null;
      const sectionsRaw = body.sections;
      if (!Array.isArray(sectionsRaw) || sectionsRaw.length > 24) return null;
      const sections: string[] = [];
      for (const item of sectionsRaw) {
        const section = shortString(item, 40);
        if (section === null) return null;
        sections.push(section);
      }
      const statesRaw = body.states;
      if (!isRecord(statesRaw) || Object.keys(statesRaw).length > 24) return null;
      const states: Record<string, string> = {};
      for (const [key, value] of Object.entries(statesRaw)) {
        const state = shortString(value, 40);
        if (key.length > 40 || state === null) return null;
        states[key] = state;
      }
      return { ...base, rung, nation: nationRaw as Nation, sections, states };
    }
    case "page_error":
      // Handled by the caller (recordPageError sanitises
      // and alerts); this arm exists for exhaustiveness.
      return base;
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const caller = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimitOk(`events:${caller}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }
  const text = await request.text();
  if (text.length > BODY_MAX) {
    return NextResponse.json({ error: "too-large" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const input = buildInput(body);
  if (!input) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const db = getDbPool();
  if (input.event === "page_error") {
    await recordPageError(db, {
      errorName: typeof body.error_name === "string" ? body.error_name : null,
      errorMessage: typeof body.error_message === "string" ? body.error_message : null,
      routePattern: input.routePattern,
      userAgent: request.headers.get("user-agent"),
      browserClass: browserClassOf(request.headers.get("user-agent")),
    });
  } else {
    await recordJourneyEvent(db, input);
  }
  return new NextResponse(null, { status: 204 });
}
