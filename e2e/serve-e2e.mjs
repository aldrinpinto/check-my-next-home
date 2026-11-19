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
  await new Promise((resolve) => standin.listen(4180, "127.0.0.1", resolve));
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
  await new Promise((resolve) => capture.listen(4182, "127.0.0.1", resolve));
  process.env.GIFT_MAILER_CAPTURE_URL = "http://127.0.0.1:4182/send";
  console.log("serve-e2e: gift mailer seam on — confirmations captured at 127.0.0.1:4182.");
}

const child = spawn(
  process.execPath,
  [join(REPO, "node_modules/next/dist/bin/next"), "start", "-p", "4173"],
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
