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

// The cold pool (cold-check fix stack, 19 Nov 2026):
// the seed files the cold-pool fixture (directory and
// picking layers only — postcodes the corpus holds but
// no brain has ever filed) so e2e/cold.e2e.ts can run
// first checks against genuinely cold postcodes. The
// flag rides to the seed through serve-e2e's
// environment, like the seams above.
process.env.E2E_COLD_POOL = "1";

// The sample report's date pin (CI #308 fix, 23 Nov
// 2026): the sample is a real generated report
// (BUG-159), and its masthead Report date composes from
// the serving day — the visual guard's sample-report
// baselines were captured on 22 Nov 2026 and carry that
// date, so an unpinned harness fails the photograph on
// every later day with nothing having changed. The pin
// rides to the app through serve-e2e's environment,
// like the seams above, and the app honours it only for
// the sample's composition (lib/sample-report.ts's
// sampleReportNowFromEnv). Production never sets it —
// visitors keep the real date. Midday UTC on the
// capture day, so the Europe/London rendering is the
// captured "22 November 2026" whatever day the run —
// or a deliberate re-capture — happens on.
process.env.SAMPLE_REPORT_NOW = "2026-11-22T12:00:00.000Z";

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
// test site key (see e2e/serve-e2e.mjs). From M7.15 the CI
// browser job runs the Smoke set (--grep @smoke) as the
// push gate; the full suite runs on cadence in the
// scheduled workflow — Smoke nightly, Regression weekly,
// in the real-Turnstile form above. Every spec carries
// exactly one D68 tag, and the tag audit
// (scripts/audit-e2e-tags.mjs, wired into the prepush
// gate and the CI checks job) proves the partition.

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  // The visual guard's baselines decode from their
  // committed .b64 sources before any run (see
  // e2e/materialise-snapshots.mjs).
  globalSetup: "./e2e/materialise-snapshots.mjs",
  timeout: 60_000,
  // One retry, CI only (founder ruling, 17 Nov 2026): a
  // safety net for runner noise alongside the Turnstile
  // seams above. A test that passes only on retry reports
  // as flaky — visible in the run, never silently green.
  retries: process.env.CI ? 1 : 0,
  // The scheduled runs (M7.15) also write a JSON report,
  // which the emailed run report (scripts/e2e-report.mjs)
  // reads; the push gate keeps the plain list reporter.
  reporter:
    process.env.E2E_JSON_REPORT === "1"
      ? [["list"], ["json", { outputFile: "test-results/results.json" }]]
      : "list",
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
      // The forced-pending app (cold-check fix stack,
      // 19 Nov 2026): a second instance of the same app
      // on the same seeded database, whose sold-prices
      // wait is forced to zero — every cold load is
      // still running when its caller is told. The
      // forced-pending Smoke spec in e2e/cold.e2e.ts
      // runs against this instance alone (baseURL
      // override in that file); every other spec stays
      // on the warm instance above.
      command: "node e2e/serve-e2e.mjs",
      url: "http://127.0.0.1:4175",
      reuseExistingServer: true,
      timeout: 900_000,
      env: {
        E2E_APP_PORT: "4175",
        E2E_SKIP_SEED: "1",
        SOLD_PRICES_LOAD_WAIT_MS: "0",
      },
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
