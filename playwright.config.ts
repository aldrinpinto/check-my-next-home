import { defineConfig, devices } from "@playwright/test";

// Turnstile in the harness (founder ruling, 17 Nov 2026,
// after CI #199): the gate runs on the harness's own seams
// by default — e2e/fixtures.ts serves a stand-in widget
// script and e2e/serve-e2e.mjs points the app's verify
// call at a local stand-in endpoint — because whether the
// real check completes depends on the runner's network,
// not on this code. In #199 Cloudflare's check failed to
// complete for 7 of ~17 submissions from GitHub's
// datacenter runners; the app blocked each one exactly as
// designed (ruling 5) and the gate failed for
// environmental reasons. The seams keep the full flow —
// token requested, verified server-side, search blocked
// when no token arrives — with only the third-party
// service replaced. A real-path run (the real widget and
// the published test keys against the real verify
// endpoint) is one env var: E2E_REAL_TURNSTILE=1 — the
// form the play server's test round exercises with the
// real K5 keys, and the form the scheduled suite carries
// from M7.15.
if (process.env.E2E_REAL_TURNSTILE !== "1") {
  process.env.E2E_TURNSTILE_STUB = "1";
  process.env.E2E_TURNSTILE_SEAMS = "1";
}

// The gift mailer seam (M7.13): the claim flow sends a
// real confirmation email through the mailer seam
// (lib/server/gift-mailer.ts), and the harness has no
// mailbox — so serve-e2e runs a local capture server
// and points the app at it, on every harness run
// (independent of the Turnstile seams: even a
// real-Turnstile scheduled run captures the gift email
// locally and follows its link). The flow stays whole —
// pending written, "send" attempted, link followed —
// with only the delivery replaced.
process.env.E2E_GIFT_MAILER_SEAMS = "1";

// The Playwright harness (stood up at M7.1 alongside the
// look & feel kit). Specs live in e2e/ and are named
// *.e2e.ts so Vitest — whose default patterns match
// *.test.ts and *.spec.ts — never picks them up; the unit
// suite stays in tests/ as before.
//
// M7.3 — specs run against the SERVED app (the production
// architecture in miniature) backed by the seeded golden
// corpus: e2e/serve-e2e.mjs seeds the database and starts
// the built app. The caller provides DATABASE_URL and the
// Turnstile test secret; the build carries the Turnstile
// test site key (see e2e/serve-e2e.mjs). Until M7.15 the CI
// browser job runs the full suite; the Smoke set gates each
// step, the Regression set runs on cadence from M7.15
// (D68). Every spec carries exactly one D68 tag.

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  // One retry, CI only (founder ruling, 17 Nov 2026): a
  // safety net for runner noise alongside the Turnstile
  // seams above. A test that passes only on retry reports
  // as flaky — visible in the run, never silently green.
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node e2e/serve-e2e.mjs",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      // Seeding the corpus takes minutes on a cold database.
      timeout: 900_000,
    },
    {
      // The warm-up gate: only answers once the journey's
      // heavy first builds have been exercised (see
      // e2e/warm-gate.mjs), so specs measure the warm app.
      command: "node e2e/warm-gate.mjs",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: false,
      timeout: 900_000,
    },
  ],
});
