"use client";

import { useEffect } from "react";

// The preparing state's quiet pulse (plan step M9.6):
// while the worker is still composing the report, the
// success page reloads itself on a short beat until
// the claim stands fulfilled and the full surface
// renders. Client-only and effect-only — it renders
// nothing, and a visitor with scripting off simply
// reloads by hand; the delivery email is the durable
// copy either way.
export default function SuccessRefresher({ delayMs = 5000 }: { delayMs?: number }) {
  useEffect(() => {
    const timer = setTimeout(() => window.location.reload(), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return null;
}
