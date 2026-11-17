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

const nextConfig: NextConfig = {};

export default nextConfig;
