import ErrorPage from "./ErrorPage";

// The whole-check failure state (D44(7)): where the
// serve layer cannot resolve or build a check at all,
// the journey lands here. Since the error-page build
// (19 Nov 2026, founder ruling: one page for every
// visitor-facing failure) this state wears the site's
// single error page (Final Sample Master view 26) —
// the same face as the route error boundary, unmatched
// routes and /search/failed. The caller hands in the
// postcode or address the visitor was checking, and
// the page's search box arrives holding it, under the
// kept note; the old retry link is retired — pressing
// the box's button with the kept value IS the retry,
// and it can aim at a different home instead. Per-brain
// failures never land here; they stay per-row named
// states on the results page (D44(5)(ii)).

export default function WholeCheckFailure({ initialValue = "" }: { initialValue?: string }) {
  return <ErrorPage initialValue={initialValue} />;
}
