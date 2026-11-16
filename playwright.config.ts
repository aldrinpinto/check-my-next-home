import { defineConfig, devices } from "@playwright/test";

// M7.1 — the Playwright harness, stood up alongside the look &
// feel kit (the commission sits in M7.15's text: the harness
// and the CI browser job are wired alongside M7.1). Specs live
// in e2e/ and are named *.e2e.ts so Vitest — whose default
// patterns match *.test.ts and *.spec.ts — never picks them
// up; the unit suite stays in tests/ as before.
//
// Specs run against the static export (out/), served by
// e2e/static-server.mjs — the same build the play site
// serves. Run locally: npm run build, then npm run test:e2e.
// Every spec carries its D68 tag (Smoke or Regression) in its
// test options; this step's only spec is Regression — M7.1
// makes no visitor flow testable, and the Smoke set starts at
// M7.2.

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
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
  webServer: {
    command: "node e2e/static-server.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
