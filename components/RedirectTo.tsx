"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The client-side half of a page redirect (BUG-186,
// 24 Nov 2026). A server redirect() cannot produce an
// HTTP 307 for a plain page load on a route whose
// loading boundary has already flushed the shell with
// 200 — the throw lands on the error boundary
// instead — while a client-side (RSC) navigation gets
// the 307. So a page that must redirect renders this
// for plain loads (its server half still calls
// redirect() for RSC navigations): on mount it
// replaces the URL with the destination, beside the
// destination's own checking frame — or nothing at
// all, where no check is opening (BUG-396).
// The replace keeps the failed URL out of the
// visitor's history — the back button returns to
// where they came from, never to this redirecting
// page.
export default function RedirectTo({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return null;
}
