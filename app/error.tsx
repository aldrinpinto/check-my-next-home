"use client";

import { useSyncExternalStore } from "react";

import ErrorPage from "../components/ErrorPage";

// The route error boundary (error-page build,
// 19 Nov 2026): an error thrown while a route renders
// lands on the site's single error page (Final Sample
// Master view 26), inside the unified header and footer
// the root layout wraps around this boundary. There is
// deliberately no reset button: the page's way forward
// is its search box, which can re-run the same check or
// start a different one — the founder's chosen form.
//
// The failed route's own URL is the context the
// boundary is given: a check's postcode (or a district's
// outward) rides in its query string, so the box
// arrives holding what the visitor was checking, under
// the kept note. The value is read through
// useSyncExternalStore — the server snapshot is the
// empty box (a server render knows no address bar), the
// client snapshot reads the address bar — so the box
// never paints empty and then fills, and no state is
// set from an effect. (The boundary's `reset` prop is
// accepted by Next's contract and deliberately not
// surfaced, for the reason above.)

function subscribeNoop() {
  return () => {};
}

function readAttemptedValue(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("postcode") ?? params.get("outward") ?? "";
}

export default function ErrorBoundary() {
  const initialValue = useSyncExternalStore(subscribeNoop, readAttemptedValue, () => "");
  return <ErrorPage initialValue={initialValue} />;
}
