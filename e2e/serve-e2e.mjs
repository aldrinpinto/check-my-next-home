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
