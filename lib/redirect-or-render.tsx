import { headers } from "next/headers";
import { redirect } from "next/navigation";

import RedirectTo from "../components/RedirectTo";

// The redirect that survives a plain page load
// (BUG-186, 24 Nov 2026). A journey route's loading
// boundary flushes the shell with HTTP 200 before the
// page's async resolution completes, so a redirect()
// thrown from the page cannot produce an HTTP 307 for
// a plain load — the throw surfaces through the route
// error boundary instead, and the visitor gets the
// error page (proven on the live server: a bogus key
// on CM3 2JT serves the error page on a full load,
// and the 307 on a client-side navigation; proven
// again in a minimal Next 16.4.6 probe: the same
// redirect 307s with no loading boundary, and 200s
// onto the error boundary with one). A client-side
// (RSC) navigation still gets the 307 — redirect()
// works there — so this helper redirects for RSC
// navigations and renders a client-side navigation to
// the same URL for plain loads, under the page's own
// short line. The destination is unchanged in every
// branch; only the mechanism differs by request kind.
// The RSC check reads the headers the router itself
// sends on a client navigation (RSC: 1, and the
// router state tree alongside it).
//
// Both journey pages that redirect — the home check
// (app/search/home/page.tsx) and the postcode form
// (app/search/page.tsx) — route every redirect
// through here: the trap is one mechanism, and the
// second route's redirects are the same fault in a
// second surface, not a second bug.
export async function redirectOrRender(url: string) {
  const h = await headers();
  const isRsc = h.get("rsc") === "1" || h.has("next-router-state-tree");
  if (isRsc) redirect(url);
  return (
    <main className="journey-page main--wide">
      <p className="results-loading">Opening your check…</p>
      <RedirectTo to={url} />
    </main>
  );
}
