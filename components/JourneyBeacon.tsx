"use client";

import { useEffect, useRef } from "react";

import type { JourneyEventName } from "../lib/journey-events";
import type { Nation } from "../lib/journey";

// The journey counting client (plan step M7.14;
// lib/journey-events.ts carries the pinned catalogue).
//
// fireJourneyEvent posts ONE pinned event to our own
// /api/events — first-party only, no cookies, no
// fingerprinting, nothing third-party. The post carries
// the raw pathname; the server derives the route PATTERN
// and stores nothing else about the visit. Delivery is
// best-effort by design: sendBeacon where available, a
// keepalive fetch otherwise, and every failure swallowed
// — counting never slows or breaks the journey it
// measures.

type JourneyFields = Record<string, unknown>;

export function fireJourneyEvent(event: JourneyEventName, fields: JourneyFields = {}): void {
  try {
    const body = JSON.stringify({
      event,
      path: window.location.pathname,
      dedupe_key: crypto.randomUUID(),
      ...fields,
    });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon(
        "/api/events",
        new Blob([body], { type: "application/json" }),
      );
      if (sent) return;
    }
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // A lost count is a gap in a chart, never a
      // visitor-facing failure.
    });
  } catch {
    // Same rule: the beacon's own failure is silent.
  }
}

// The entry event: every page type emits it (the step's
// coverage clause). Mounted once by the root layout; the
// ref guard keeps a StrictMode double-effect or a
// remount in the same mount cycle from double-counting
// the entry.
export function JourneyBeacon() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    fireJourneyEvent("page_view");
  }, []);
  return null;
}

// The completion event for a served check. Rendered by
// the server pages INSIDE the results, with the payload
// derived server-side from the served bundle (rung,
// nation, sections, states) — so it mounts, and fires,
// exactly when the results reach the visitor, and never
// on the checking screen before them.
export function CheckCompletedBeacon({
  rung,
  nation,
  sections,
  states,
}: {
  rung: number;
  nation: Nation;
  sections: string[];
  states: Record<string, string>;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    fireJourneyEvent("check_completed", { rung, nation, sections, states });
  }, [rung, nation, sections, states]);
  return null;
}

// The error class's ears (D45): every uncaught page
// error and every unhandled rejection posts a page_error
// event. Name and message only — the server truncates
// and scans the message, and stores it as NULL if the
// message itself carries an address, a full postcode or
// an email. Mounted once by the root layout.
export function JourneyErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      fireJourneyEvent("page_error", {
        error_name: event.error?.name ?? "Error",
        error_message: event.error?.message ?? event.message ?? "",
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      const name = reason instanceof Error ? reason.name : "UnhandledRejection";
      const message = reason instanceof Error ? reason.message : String(reason ?? "");
      fireJourneyEvent("page_error", { error_name: name, error_message: message });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
