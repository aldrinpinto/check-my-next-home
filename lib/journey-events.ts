// Measure the journeys (plan step M7.14; founder's ruling
// 15 Nov 2026, error class D45 16 Nov 2026) — the pure core.
//
// First-party counting ONLY: our own events, recorded by
// our own endpoint into our own Postgres (migration 0036).
// No analytics vendor, no cookies for counting, no
// fingerprinting, nothing third-party. Cloudflare Web
// Analytics (M10.7) stays the traffic-level view and
// Sentry the error deep-dive; this module is the queryable
// record of the journeys themselves.
//
// THE CATALOGUE IS PINNED. A fixed list of measured
// moments and nothing free-form — a new event is a plan
// change, not a code whim. The list below is the step's:
//
//   page_view          a page was entered — EVERY page
//                      type emits it (landing, results,
//                      guides, legal pages, the claim
//                      page, the checkout pages when they
//                      exist), carrying the route PATTERN
//                      only.
//   check_started      the checking screen began a check
//                      (rungs 1–2; rung from the journey).
//   check_completed    the results were served — rung,
//                      nation, the sections served and
//                      each section's named state, derived
//                      server-side from the served bundle.
//   shortlist_add      a home was added to the shortlist
//                      (the fact only — never which home).
//   shortlist_remove   a home was removed (the fact only).
//   comparison_opened  the shortlist comparison was shown.
//   report_clicked     a "Get the full report" button was
//                      clicked (results head, buy bar,
//                      truncation rows, shortlist columns).
//   checkout_started   checkout began — wired at M9.6 on
//                      the payment page (the moment a
//                      payment stands started for the
//                      page's email and consent).
//   checkout_paid      a payment completed — recorded
//                      SERVER-SIDE at M9.6 from the
//                      verified payment confirmation, at
//                      the fulfilment claim, never from a
//                      browser beacon (gap check item 4),
//                      copying no order fields.
//   report_delivered   a report was delivered — recorded
//                      SERVER-SIDE at M9.6 by the
//                      fulfilment path at the moment of
//                      delivery (paid, free-window and
//                      gifted deliveries alike). The
//                      payment funnel's last step
//                      (founder amendment, 22 Nov 2026):
//                      door view (page_view on /report) →
//                      checkout_started → checkout_paid →
//                      report_delivered, so the drop-off
//                      between paying and receiving is as
//                      visible as every other step.
//   gift_claimed       a gift was bound to its claimant —
//                      wired at the gift store's
//                      bindByConfirm (M7.13's named
//                      attachment point). The fact only:
//                      never the token, never an email.
//   gift_redeemed      a gift was consumed on delivery —
//                      wired at the store's markRedeemed.
//   page_error         the error class (D45): every
//                      uncaught page error and every failed
//                      check request — error name, message
//                      truncated (and scanned, see below),
//                      route pattern, journey step, browser
//                      class.
//
// THE NO-ADDRESS RULE, IN FULL: no event ever carries an
// address, a full postcode or an email — not in a named
// field, not nested in details, and not inside an error
// message. assertJourneyEventSafe below is the proof the
// step's tests run: it walks the whole payload, rejects
// the forbidden keys outright, and scans every string
// (error messages included) for a full UK postcode or an
// email shape. Route patterns only, never raw URLs:
// results URLs carry the postcode and the address key,
// claim URLs carry the gift token.
//
// Phase 2 carry-over (recorded in the step): the browser
// extension emits the same event class to the same
// endpoint under the identical rule, with surface
// 'extension'; the digest reports the two surfaces side
// by side. Nothing in Phase 1 writes 'extension'.

import { CHECK_PAGE_PATHS, GUIDE_PATHS } from "./check-pages";
import type { Nation } from "./journey";

export type JourneyEventName =
  | "page_view"
  | "check_started"
  | "check_completed"
  | "shortlist_add"
  | "shortlist_remove"
  | "comparison_opened"
  | "report_clicked"
  | "checkout_started"
  | "checkout_paid"
  | "report_delivered"
  | "gift_claimed"
  | "gift_redeemed"
  | "page_error";

// Who may originate an event. "client" events arrive
// through POST /api/events; "server" events are recorded
// only by server code (the gift store's transitions, and
// at M9.6 the payment confirmation) — the endpoint refuses
// them, so a browser can never forge the money facts.
export type JourneyEventOrigin = "client" | "server";

export interface JourneyEventSpec {
  name: JourneyEventName;
  origin: JourneyEventOrigin;
  moment: string;
}

export const JOURNEY_EVENT_CATALOGUE: JourneyEventSpec[] = [
  { name: "page_view", origin: "client", moment: "a page was entered (every page type)" },
  { name: "check_started", origin: "client", moment: "the checking screen began a check" },
  {
    name: "check_completed",
    origin: "client",
    moment: "the results were served (payload derived server-side)",
  },
  { name: "shortlist_add", origin: "client", moment: "a home was added to the shortlist" },
  { name: "shortlist_remove", origin: "client", moment: "a home was removed from the shortlist" },
  { name: "comparison_opened", origin: "client", moment: "the shortlist comparison was shown" },
  { name: "report_clicked", origin: "client", moment: "a report button was clicked" },
  { name: "checkout_started", origin: "client", moment: "checkout began (wired at M9.6)" },
  {
    name: "checkout_paid",
    origin: "server",
    moment: "a payment completed (recorded server-side at M9.6)",
  },
  {
    name: "report_delivered",
    origin: "server",
    moment: "a report was delivered (recorded server-side at M9.6)",
  },
  {
    name: "gift_claimed",
    origin: "server",
    moment: "a gift was bound (the gift store's bindByConfirm)",
  },
  {
    name: "gift_redeemed",
    origin: "server",
    moment: "a gift was consumed on delivery (the store's markRedeemed)",
  },
  {
    name: "page_error",
    origin: "client",
    moment: "an uncaught page error or a failed check request",
  },
];

export const JOURNEY_EVENT_NAMES: JourneyEventName[] = JOURNEY_EVENT_CATALOGUE.map(
  (spec) => spec.name,
);

export function journeyEventSpec(name: string): JourneyEventSpec | null {
  return JOURNEY_EVENT_CATALOGUE.find((spec) => spec.name === name) ?? null;
}

// The stored shape (migration 0036's columns). Every
// field is a class, a count or a named state — the shape
// itself has nowhere to put an address, a full postcode
// or an email, and the scan below proves the free fields
// (states, details, the error message) stay that way.
export interface JourneyEventInput {
  event: JourneyEventName;
  surface?: "website" | "extension";
  routePattern?: string | null;
  rung?: number | null;
  nation?: Nation | null;
  sections?: string[] | null;
  states?: Record<string, string> | null;
  errorName?: string | null;
  errorMessage?: string | null;
  browserClass?: string | null;
  dedupeKey?: string | null;
  details?: Record<string, unknown>;
}

// ------------------------------------------------------------------
// The payload scan (the step's test-first proof)
// ------------------------------------------------------------------

// Keys that may never appear anywhere in a payload, at
// any depth: each names a thing the rule forbids.
const FORBIDDEN_KEYS = new Set([
  "address",
  "postcode",
  "email",
  "token",
  "home",
  "homekey",
  "home_key",
  "url",
  "href",
  "query",
  "search",
]);

// A full UK postcode: outward + inward, spaced or not.
// (An outward code alone — "CM3" — is a district class,
// not a postcode, and is allowed: rung-3 counting keys on
// nothing finer than the route pattern in any case.)
const FULL_POSTCODE_PATTERN = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export const ERROR_MESSAGE_MAX = 300;

function scanValue(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (FULL_POSTCODE_PATTERN.test(value)) {
      throw new Error(`journey event payload carries a full postcode at ${path}`);
    }
    if (EMAIL_PATTERN.test(value)) {
      throw new Error(`journey event payload carries an email at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        throw new Error(`journey event payload carries the forbidden key "${key}" at ${path}`);
      }
      scanValue(item, `${path}.${key}`);
    }
  }
}

// Throws on any breach; returns the input unchanged for
// chaining. Applied by the endpoint to everything a
// client sends and by the server recorder to everything
// server code records — the rule has no side door.
export function assertJourneyEventSafe(input: JourneyEventInput): JourneyEventInput {
  if (!journeyEventSpec(input.event)) {
    throw new Error(`unknown journey event "${String(input.event)}"`);
  }
  if (input.routePattern !== undefined && input.routePattern !== null) {
    if (
      typeof input.routePattern !== "string" ||
      !input.routePattern.startsWith("/") ||
      input.routePattern.includes("?") ||
      input.routePattern.includes("#")
    ) {
      throw new Error("journey event route_pattern is not a route pattern");
    }
  }
  scanValue(
    {
      routePattern: input.routePattern ?? null,
      nation: input.nation ?? null,
      sections: input.sections ?? null,
      states: input.states ?? null,
      errorName: input.errorName ?? null,
      errorMessage: input.errorMessage ?? null,
      browserClass: input.browserClass ?? null,
      details: input.details ?? {},
    },
    "payload",
  );
  return input;
}

// An error message is stored truncated — and only if the
// truncated form itself is clean. A message that embeds
// an address, a full postcode or an email (a fetch error
// quoting its URL is the standing example) is stored as
// NULL: the error's name, pattern and count still record
// it, and the rule bends for no one.
export function sanitiseErrorMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const truncated = raw.slice(0, ERROR_MESSAGE_MAX).trim();
  if (truncated === "") return null;
  if (FULL_POSTCODE_PATTERN.test(truncated) || EMAIL_PATTERN.test(truncated)) return null;
  return truncated;
}

// An error name is a class ("TypeError", "CheckRequestFailed")
// — short, spaceless, and never a sentence. Anything longer
// or carrying whitespace is not a name and is not stored.
export function sanitiseErrorName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name === "" || name.length > 80 || /\s/.test(name)) return null;
  if (FULL_POSTCODE_PATTERN.test(name) || EMAIL_PATTERN.test(name)) return null;
  return name;
}

// ------------------------------------------------------------------
// Route patterns (route-pattern-only discipline, gap item 5)
// ------------------------------------------------------------------

// Pages whose path IS their pattern — no segment of them
// can carry a visitor's data.
const STATIC_PATTERNS = new Set([
  "/",
  "/about",
  "/contact",
  "/privacy",
  "/sample-report",
  "/how-we-check",
  "/shortlist",
  "/report",
  "/search",
  "/search/home",
  "/search/failed",
]);

const CHECK_PATTERNS = new Set(CHECK_PAGE_PATHS);
const GUIDE_PATTERNS = new Set(GUIDE_PATHS);

// Map a raw pathname to the pattern the events store may
// hold. The gift token segment is dropped wholesale (the
// claim routes are one pattern, "/gift"); an unknown
// check/guide slug collapses to its bracket form; anything
// unrecognised is "/other" — a new page earns its pattern
// by being added here, never by leaking its path.
export function routePatternOf(pathname: string): string {
  const path = (pathname ?? "").split("?")[0].split("#")[0];
  if (STATIC_PATTERNS.has(path)) return path;
  if (CHECK_PATTERNS.has(path)) return path;
  if (GUIDE_PATTERNS.has(path)) return path;
  if (path === "/gift" || path.startsWith("/gift/")) return "/gift";
  if (path.startsWith("/check/")) return "/check/[slug]";
  if (path.startsWith("/guides/")) return "/guides/[slug]";
  if (path.startsWith("/api/")) return "/api";
  return "/other";
}

// The journey step an error belongs to, derived from its
// route pattern (D45's "journey step" field) — a label,
// never a URL.
export function stepOfRoutePattern(routePattern: string | null): string {
  switch (routePattern) {
    case "/":
      return "landing";
    case "/search":
    case "/search/home":
    case "/search/failed":
      return "check";
    case "/shortlist":
      return "shortlist";
    case "/report":
      return "report";
    case "/gift":
      return "claim";
    default:
      if (routePattern?.startsWith("/check/") || routePattern?.startsWith("/guides/"))
        return "guide";
      return "page";
  }
}

// ------------------------------------------------------------------
// Browser class (D45) — a class from the user agent, never
// the agent string itself.
// ------------------------------------------------------------------

export function browserClassOf(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  if (/Edg\//.test(userAgent)) return "edge";
  if (/SamsungBrowser\//.test(userAgent)) return "samsung";
  if (/OPR\/|Opera/.test(userAgent)) return "opera";
  if (/Chrome\/|Chromium\//.test(userAgent)) return "chrome";
  if (/Firefox\//.test(userAgent)) return "firefox";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
}

// ------------------------------------------------------------------
// Error fingerprints and the spike rule (D45 alerting)
// ------------------------------------------------------------------

// One fingerprint per (event, error name, route pattern):
// the alert memory's key and the digest's error grouping.
export function errorFingerprint(input: {
  event: string;
  errorName?: string | null;
  routePattern?: string | null;
}): string {
  return `${input.event}|${input.errorName ?? ""}|${input.routePattern ?? ""}`;
}

// The spike rule, pinned (M7.14 gap-check fold-in): an
// error fingerprint seen this many times inside the
// rolling window alerts, at most once per window per
// fingerprint (the alerts table's last_alert_at is the
// gate). First sightings always alert, spike or not.
export const ERROR_SPIKE_THRESHOLD = 10;
export const ERROR_SPIKE_WINDOW_MS = 3_600_000;

// ------------------------------------------------------------------
// The completion payload's derivation
// ------------------------------------------------------------------

// From a served short bundle's sections: the section keys
// served, and each section's named state where the
// section carries one. Classes and state names only —
// the scan above runs over the result before it is
// stored, like every other payload.
export function sectionsAndStatesOf(sections: Record<string, unknown>): {
  sections: string[];
  states: Record<string, string>;
} {
  const keys: string[] = [];
  const states: Record<string, string> = {};
  for (const [key, value] of Object.entries(sections)) {
    keys.push(key);
    if (typeof value === "object" && value !== null) {
      const state = (value as { state?: unknown }).state;
      if (typeof state === "string") states[key] = state;
    }
  }
  return { sections: keys, states };
}
