import ErrorPage from "../components/ErrorPage";

// The unmatched-route page (error-page build,
// 19 Nov 2026): an address this site does not hold
// serves the site's single error page (Final Sample
// Master view 26) — the same face as a failed check or
// a route error, because to the visitor they are all
// the same moment (founder ruling: one page for every
// visitor-facing failure). Next serves it with the 404
// status; the root layout wraps it in the unified
// header and footer. No pre-fill: an unmatched route
// carries no home the visitor was checking, so the
// box starts empty and the kept note does not render.
// No metadata export, deliberately: the layout carries
// none by design (M7.8), the error boundary can carry
// none either, and an error face is never an indexable
// page — the pair stays consistent across the faces.

export default function NotFound() {
  return <ErrorPage />;
}
