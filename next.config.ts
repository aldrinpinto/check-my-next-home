import type { NextConfig } from "next";

// M7.3 — the served architecture. M7.1 shipped a static
// export (output: "export") because the play site was a
// static host and no page needed a server; the checker
// journey needs the frozen brains at request time, so the
// app now runs as the production architecture in miniature:
// one Next codebase serving the pages and the API route
// handlers that call the brains (plan step M7.3, ruling 1).
// The play site moves to the Hetzner server at this step's
// integration; production is the same codebase at M12.

const nextConfig: NextConfig = {
  // BUG-219: the sample report's served HTML is identical
  // for every visitor and changes only on a deploy (the
  // baked body is written once per container start), so a
  // repeat visit within the hour may reuse it; a deploy's
  // fresh body is picked up within the hour. The header
  // rides on the page response itself — the public/_headers
  // file is a Cloudflare Pages leftover the real site does
  // not use.
  async headers() {
    return [
      {
        source: "/sample-report",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
