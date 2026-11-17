import { defineConfig, devices } from "@playwright/test";

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
