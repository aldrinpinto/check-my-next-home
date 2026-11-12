import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The play site (Cloudflare Pages) serves a fully static export for now:
  // the skeleton has no server features. Revisit when a later milestone
  // needs server behaviour on the play site (production runs on Hetzner).
  output: "export",
};

export default nextConfig;
