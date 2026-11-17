import { test as base } from "@playwright/test";

// The shared E2E test object. Its one job: in environments
// whose network cannot reach Cloudflare's widget host at
// all (this build sandbox's browser proxy refuses the
// tunnel), E2E_TURNSTILE_STUB=1 serves a minimal stand-in
// for the Turnstile script so the journey can be exercised
// end to end — the box still asks the stand-in for a token,
// the server still verifies it (against the test
// environment's verify endpoint), and the search still
// blocks when no token arrives.
//
// Since the founder ruling of 17 Nov 2026 (after CI
// #199, where Cloudflare's check failed to complete for
// 7 of ~17 submissions from GitHub's datacenter runners
// and the app blocked each one as designed),
// playwright.config.ts sets the flag by default for every
// harness run, local and CI alike; the verify side is
// seamed the same way in e2e/serve-e2e.mjs. A real-path
// run — the real widget, the published test keys, the
// real verify endpoint, T-WEB-05's original form — is
// E2E_REAL_TURNSTILE=1. The flag changes nothing in the
// app; it only swaps a third-party script. A spec that
// registers its own route for the widget host (the
// blocked-check spec) overrides this stand-in, because
// Playwright applies routes in reverse registration
// order.

const TURNSTILE_STUB_SCRIPT = `
window.turnstile = {
  render: function (container, options) {
    window.__turnstileOptions = options;
    return "stub-widget";
  },
  execute: function () {
    setTimeout(function () {
      if (window.__turnstileOptions && window.__turnstileOptions.callback) {
        window.__turnstileOptions.callback("stub-test-token");
      }
    }, 10);
  },
  reset: function () {},
  getResponse: function () { return ""; },
};
`;

export const test = base.extend({
  // Playwright's fixture callback, renamed locally — the
  // react-hooks lint rule reads a bare `use` as a Hook.
  page: async ({ page }, provide) => {
    if (process.env.E2E_TURNSTILE_STUB === "1") {
      await page.route("**/challenges.cloudflare.com/**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: TURNSTILE_STUB_SCRIPT,
        }),
      );
    }
    await provide(page);
  },
});

export { expect } from "@playwright/test";
