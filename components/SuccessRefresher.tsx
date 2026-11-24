"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { startSuccessRefresh, SUCCESS_REFRESH_MS } from "../lib/success-refresh";

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

export default function SuccessRefresher({ delayMs = SUCCESS_REFRESH_MS }: { delayMs?: number }) {
  const router = useAppRouter();
  useEffect(() => {
    if (!router) return;
    return startSuccessRefresh(() => router.refresh(), delayMs);
  }, [router, delayMs]);
  return null;
}
