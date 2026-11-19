// The E2E serve path (plan step M7.3): the specs run
// against the SERVED app and a seeded database — the
// production architecture in miniature, not the old static
// export. This script seeds the golden corpus
// (scripts/seed-golden.mjs) unless E2E_SKIP_SEED=1, then
// starts the built app on the harness's port.
//
// The caller provides:
//   DATABASE_URL          — the seeded database (K6 shape);
//   TURNSTILE_SECRET_KEY  — Cloudflare's published test
//                           secret in local/CI (fold-in 8);
// and the app must have been built with
// NEXT_PUBLIC_TURNSTILE_SITE_KEY set to the published test
// site key (NEXT_PUBLIC_ values inline at build time).
//
// Turnstile seams (playwright.config.ts sets
// E2E_TURNSTILE_SEAMS=1 unless E2E_REAL_TURNSTILE=1 —
// founder ruling, 17 Nov 2026, after CI #199): this script
// then runs a local stand-in for Cloudflare's siteverify
// endpoint and points the app at it through
// TURNSTILE_SITEVERIFY_URL, the server-config env the
// verify logic already honours. The stand-in mimics the
// published test keys' semantics: success when the test
// secret arrives with a response token.
//
// Gift mailer seam (M7.13; playwright.config.ts sets
// E2E_GIFT_MAILER_SEAMS=1 on every harness run): this
// script then runs a local capture server for the claim
// flow's confirmation emails (127.0.0.1:4182) and points
// the app at it through GIFT_MAILER_CAPTURE_URL — the
// specs read the captured link back and follow it.
//
// Cold-load seams (cold-check fix stack, 19 Nov 2026):
// the app is pointed at the fixture Price Paid file
// through SOLD_PRICES_FILE_DIR, so a cold postcode's
// sold-prices load — which in production downloads and
// streams the live 5.54 GB file — reads the small
// fixture file instead, files nothing for a cold
// postcode, stamps it, and lands fast; the cold specs
// (e2e/cold.e2e.ts) stand on that. A second instance of
// this script serves the forced-pending app on
// E2E_APP_PORT (playwright.config.ts): same database,
// no re-seed (E2E_SKIP_SEED=1), and
// SOLD_PRICES_LOAD_WAIT_MS=0 in its environment, so its
// cold loads are always still running when the caller
// is told — the permanent regression form of the
// 19 Nov 2026 cold-check failure. The seam stand-ins
// below listen tolerantly: the second instance finds
// the first instance's already listening and reuses
// them (the URLs it sets are the same).
//
// Run locally: npm run build, then npm run test:e2e (which
// starts this script through playwright.config.ts).

import { spawn, execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.DATABASE_URL) {
  console.error("serve-e2e: DATABASE_URL is not set — the served app needs its database.");
  process.exit(1);
}

if (process.env.E2E_SKIP_SEED !== "1") {
  console.log("serve-e2e: seeding the golden corpus…");
  await run(process.execPath, [join(REPO, "scripts/seed-golden.mjs")], {
    cwd: REPO,
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  console.log("serve-e2e: seeded.");
}

// Listen, tolerating a sibling harness instance's
// stand-in already holding the port (the forced-pending
// instance — see the header): the URLs are identical,
// so reuse is exact.
async function listenTolerantly(server, port, label) {
  await new Promise((resolve) => {
    server.once("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        console.log(`serve-e2e: ${label} stand-in already listening on ${port} — reusing it.`);
        resolve();
        return;
      }
      throw error;
    });
    server.listen(port, "127.0.0.1", resolve);
  });
}

if (process.env.E2E_TURNSTILE_SEAMS === "1") {
  const { createServer } = await import("node:http");
  // Cloudflare's published test secret, assembled from
  // parts so it is never a literal in the repo.
  const testSecret = "1x0000000000000000000000000000000" + "AA";
  const standin = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const ok = params.get("secret") === testSecret && Boolean(params.get("response"));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: ok }));
    });
  });
  await listenTolerantly(standin, 4180, "Turnstile");
  process.env.TURNSTILE_SITEVERIFY_URL = "http://127.0.0.1:4180";
  console.log(
    "serve-e2e: Turnstile seams on — verify pointed at the local stand-in (127.0.0.1:4180).",
  );
}

if (process.env.E2E_GIFT_MAILER_SEAMS === "1") {
  const { createServer } = await import("node:http");
  // The gift confirmation capture (M7.13): the app's
  // mailer posts each "sent" confirmation here; a spec
  // reads the latest one back by gift token and follows
  // its link, exactly as a claimant follows the email.
  const captured = new Map();
  const capture = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/send") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const payload = JSON.parse(body);
          if (payload && payload.giftToken) captured.set(payload.giftToken, payload);
          res.writeHead(200, { "content-type": "application/json" });
          res.end("{}");
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end("{}");
        }
      });
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/last")) {
      const token = new URL(req.url, "http://127.0.0.1:4182").searchParams.get("token");
      const payload = token ? captured.get(token) : undefined;
      res.writeHead(payload ? 200 : 404, { "content-type": "application/json" });
      res.end(JSON.stringify(payload ?? {}));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end("{}");
  });
  await listenTolerantly(capture, 4182, "gift mailer");
  process.env.GIFT_MAILER_CAPTURE_URL = "http://127.0.0.1:4182/send";
  console.log("serve-e2e: gift mailer seam on — confirmations captured at 127.0.0.1:4182.");
}

// The cold-load file seam (see the header): every
// harness instance's app reads its cold sold-prices
// loads from the fixture file.
process.env.SOLD_PRICES_FILE_DIR = join(REPO, "tests", "fixtures", "land-registry");

const appPort = process.env.E2E_APP_PORT ?? "4173";

const child = spawn(
  process.execPath,
  [join(REPO, "node_modules/next/dist/bin/next"), "start", "-p", appPort],
  {
    cwd: REPO,
    env: process.env,
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
