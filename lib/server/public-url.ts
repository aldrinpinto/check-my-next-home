// Browser-facing URLs minted by route handlers
// (Regression run 44535680408 follow-up, 19 Nov 2026).
//
// A route handler's request.url carries the LISTEN
// origin under `next start` — the server's own host
// name for its port ("localhost:3000" on the play
// server), not the public origin the visitor used:
// Cloudflare's tunnel forwards the public Host and
// X-Forwarded-Host, and Next still builds request.url
// from the listen address. An absolute URL minted from
// request.url therefore sends the browser to the
// server's own loopback — the gift claim flow's
// redirects did exactly that, stranding the one-shot
// entry cookie on the request's host while the browser
// navigated to the listen host, and the confirmation
// email carried a loopback link. Proven on the play
// server: a claim POST with the tunnel's Host and
// X-Forwarded-Host headers still answered
// "Location: https://localhost:3000/gift/…".
//
// The two rules that close the class:
//
//   * REDIRECTS ARE RELATIVE. A redirect's Location is
//     the path (plus query) alone; the browser resolves
//     it against the URL it actually requested, which
//     is the public origin by construction. (Next's
//     NextResponse.redirect refuses relative URLs, so
//     the response is built directly.)
//   * AN ABSOLUTE URL THAT LEAVES THE SERVER (the
//     confirmation email's link) takes its origin from
//     the forwarded headers — X-Forwarded-Host, falling
//     back to Host — with the forwarded proto. The
//     listen origin in request.url never contributes
//     its host; only its scheme survives as the last
//     fallback for a request that arrived with no
//     forwarding headers at all (a direct local hit,
//     where the scheme is the listener's own and right).

import { NextResponse } from "next/server";

// A 303 whose Location is the path alone — see the
// header. 303 is the claim flow's standing form (a POST
// answered by a GET of the claim page).
export function redirectRelative(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function firstValue(header: string | null): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim();
  return first ? first : null;
}

// The public origin a request arrived on:
// "<proto>://<host>" from the forwarded headers, per
// the header's second rule.
export function publicOriginOf(request: Request): string {
  const host =
    firstValue(request.headers.get("x-forwarded-host")) ??
    firstValue(request.headers.get("host")) ??
    new URL(request.url).host;
  const proto =
    firstValue(request.headers.get("x-forwarded-proto")) ??
    new URL(request.url).protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}
