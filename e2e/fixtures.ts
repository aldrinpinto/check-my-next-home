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
// CI does NOT set the flag: GitHub's runners reach
// Cloudflare, the real widget runs, and the published test
// keys verify against the real endpoint — that is
// T-WEB-05's proof. The flag changes nothing in the app;
// it only swaps a third-party script the environment
// cannot fetch. A spec that registers its own route for
// the widget host (the blocked-check spec) overrides this
// stand-in, because Playwright applies routes in reverse
// registration order.

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
