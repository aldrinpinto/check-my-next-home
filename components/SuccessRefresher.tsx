"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { fireJourneyEvent } from "./JourneyBeacon";
import {
  SUCCESS_PROGRESS_LINE,
  SUCCESS_REFRESH_MS,
  SUCCESS_STALL_AFTER_MS,
  SUCCESS_STALLED_LINE,
  startSuccessRefresh,
} from "../lib/success-refresh";

// The preparing state's quiet pulse (plan step M9.6):
// while the worker is still composing the report, the
// success page re-reads its server state on a short
// beat until the claim stands fulfilled and the full
// surface renders. Client-only and effect-only — it
// renders nothing, and a visitor with scripting off
// simply reloads by hand; the delivery email is the
// durable copy either way.
//
// BUG-216 (founder, 24 Nov 2026): the beat used to be
// a document reload (window.location.reload() every
// 5s), which destroyed the whole client tree on every
// tick — the "Check another home" box lost its typed
// text and its open suggestion panel, so suggestions
// appeared, then vanished, then appeared again on the
// next keystroke, for as long as the report was
// preparing. The beat is now the App Router's soft
// refresh (router.refresh()): the route's server
// components re-render in place while every client
// component keeps its state, so the box, its typed
// value and its open panel all survive the tick — and
// the ready flip, when it comes. The beat repeats on
// its own (setInterval, in lib/success-refresh.ts):
// the old one-shot timer relied on the reload to
// re-arm it, and a soft refresh never remounts this
// component, so it would otherwise fire exactly once.
// The route is force-dynamic and reads the order's
// live state per request, so the refresh always sees
// the claim's current standing.
//
// BUG-332 + BUG-345 (25 Nov 2026): the refresher owns
// the wait's words as well as its beat. While the
// report is being made it renders the honest progress
// line (BUG-345 — the wait estimate, never a staged
// step or percentage, per BUG-260). After five minutes
// of preparing the beat stops (lib/success-refresh.ts
// clears it) and this renders the stalled line instead
// (BUG-332) — and fires one page_error beacon so the
// stalled claim is logged for the owner. The beacon
// carries no order, address or email — the journey
// catalogue's no-address rule — only the fact and its
// name, so the owner queries error_name
// "SuccessStalled"; which claim stalled is read
// server-side from the claim still standing claimed.
// There is no re-send button on the stalled line:
// there is no delivery to re-send until the worker
// delivers. The soft refresh is untouched: the lines
// render beside the beat, and client state is still
// preserved across every tick.

// useRouter() throws where no App Router is mounted —
// the static renders (and any test) that render this
// page without one. The refresher is inert there by
// design: there is no router to refresh and no beat to
// keep. In the browser the router is always mounted,
// so the beat always runs. The hook itself is called
// unconditionally on every render; only its throw is
// caught, so the hook order never changes.
function useAppRouter(): ReturnType<typeof useRouter> | null {
  try {
    return useRouter();
  } catch {
    return null;
  }
}

export default function SuccessRefresher({
  delayMs = SUCCESS_REFRESH_MS,
  stallAfterMs = SUCCESS_STALL_AFTER_MS,
}: {
  delayMs?: number;
  stallAfterMs?: number;
}) {
  const router = useAppRouter();
  const [stalled, setStalled] = useState(false);
  // The stall beacon fires once per mount — a StrictMode
  // double-effect re-arms the beat, and the guard keeps
  // the log to one entry for one stalled wait.
  const stalledLogged = useRef(false);
  useEffect(() => {
    if (!router) return;
    return startSuccessRefresh(
      () => router.refresh(),
      delayMs,
      () => {
        setStalled(true);
        if (!stalledLogged.current) {
          stalledLogged.current = true;
          fireJourneyEvent("page_error", {
            error_name: "SuccessStalled",
            error_message:
              "The success page stayed preparing for five minutes — polling stopped and the buyer was told the report will arrive by email.",
          });
        }
      },
      stallAfterMs,
    );
  }, [router, delayMs, stallAfterMs]);
  return stalled ? (
    <p className="report-success__preparing-stalled" role="status">
      {SUCCESS_STALLED_LINE}
    </p>
  ) : (
    <p className="report-success__preparing-progress" role="status">
      {SUCCESS_PROGRESS_LINE}
    </p>
  );
}
