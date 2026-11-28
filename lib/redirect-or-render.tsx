import { headers } from "next/headers";
import { redirect } from "next/navigation";

import HomeLoading from "../app/search/home/loading";
import SearchLoading from "../app/search/loading";
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
// the same URL for plain loads. The destination is
// unchanged in every branch; only the mechanism
// differs by request kind. The RSC check reads the
// headers the router itself sends on a client
// navigation (RSC: 1, and the router state tree
// alongside it).
//
// BUG-396 (27 Nov 2026): the plain-load branch used
// to render a one-line interstitial beside the
// client-side navigation — an intermittent page
// between the search and the checking page, showing
// for as long as the resolution and the navigation
// took, and for nothing on a fast client-side hop.
// The line is gone. The branch now renders the
// destination's own checking frame at rest beside the
// navigation — the same frame the route's loading
// boundary showed a moment before, and the same frame
// the destination shows on arrival — so the visitor
// sees the checking screen throughout and no page of
// its own in between. A destination that opens no
// check (the unplaced landing) carries no frame: the
// navigation alone, and nothing invented beside it.
//
// Both journey pages that redirect — the home check
// (app/search/home/page.tsx) and the postcode form
// (app/search/page.tsx) — route every redirect
// through here: the trap is one mechanism, and the
// second route's redirects are the same fault in a
// second surface, not a second bug.

// The checking frame the plain-load branch renders
// beside the client-side navigation, picked by the
// destination: the home check's frame for a home
// route, the wider-area frame for any other /search
// route. Anything else opens no check and carries no
// frame.
export function redirectFrameKind(url: string): "home" | "district" | null {
  if (url.startsWith("/search/home")) return "home";
  if (url.startsWith("/search")) return "district";
  return null;
}

export async function redirectOrRender(url: string) {
  const h = await headers();
  const isRsc = h.get("rsc") === "1" || h.has("next-router-state-tree");
  if (isRsc) redirect(url);
  const frame = redirectFrameKind(url);
  return (
    <>
      {frame === "home" ? <HomeLoading /> : frame === "district" ? <SearchLoading /> : null}
      <RedirectTo to={url} />
    </>
  );
}
