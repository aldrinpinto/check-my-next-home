import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// The consolidated chain (M7.15 follow-up, gap-check
// item 4e; the prep's J23) — D68's named chain walked in
// ONE browser session: landing → search → the postcode
// check's home list → the checking screen → results →
// shortlist → claim. All Regression (D68: the Smoke set
// is frozen as authored; no promotions).
//
// T-WEB map (M7.15 citation tidy): no single T-WEB row —
// the chain composes legs other files prove in
// isolation (the journey legs of journey.e2e.ts, T-WEB-
// 04's add in shortlist.e2e.ts, the D21 claim in
// gift.e2e.ts) and proves they hold together end to end
// in one session, which is the claim no per-leg spec
// makes.
//
// The claim leg spends the chain's own seeded gift
// (scripts/seed-golden.mjs section 4 — the token literal
// below is duplicated there; change both together),
// never one of gift.e2e.ts's six: the claim flow's
// state is mutable, and specs never share mutable gift
// state. The claimant is likewise the chain's own
// address. The confirmation email is captured by the
// harness's mailer seam (e2e/serve-e2e.mjs,
// 127.0.0.1:4182), exactly as in gift.e2e.ts.

const CHAIN_GIFT = "seed-gift-issued-chain-00000000007";
const CHAIN_CLAIMANT = "gift.chain@example.co.uk";

async function capturedConfirmation(token: string) {
  const response = await fetch(`http://127.0.0.1:4182/last?token=${token}`);
  expect(response.ok).toBe(true);
  return (await response.json()) as { confirmUrl: string };
}

async function searchFromHome(page: Page, query: string) {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill(query);
  await page.getByRole("button", { name: "Check this home" }).click();
}

test.describe("consolidated chain — regression", () => {
  test(
    "landing → search → home list → checking → results → shortlist → claim, in one session",
    { tag: "@regression" },
    async ({ page }) => {
      // Landing → search → the postcode check's home dropdown.
      await searchFromHome(page, "CM3 2JT");
      await page.waitForURL("**/search/home?postcode=CM3+2JT");

      // Home dropdown → checking → results.
      await page.locator(".picker__trigger").click();
      await page
        .locator(".picker__panel")
        .getByRole("option", { name: "19 Birkdale Rise" })
        .click();
      await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-head h1")).toHaveText("19 Birkdale Rise, CM3 2JT");

      // Results → shortlist: add the home, then see it on
      // the shortlist page in the same session.
      await page.getByRole("button", { name: "Shortlist this home" }).first().click();
      await expect(
        page.getByRole("button", { name: "Shortlisted — tap to remove" }).first(),
      ).toBeVisible();
      await page.goto("/shortlist");
      await expect(page.locator("main")).toContainText("19 Birkdale Rise, CM3 2JT");

      // Shortlist → claim: the Check Together leg, spent
      // on the chain's own gift — claim, confirm by email,
      // land on the claimed page, whose own search block
      // closes the chain on a working start page.
      await page.goto(`/gift/${CHAIN_GIFT}`);
      await expect(
        page.getByRole("heading", { name: "You've been given a free home check" }),
      ).toBeVisible();
      await page.getByLabel("Your email address").fill(CHAIN_CLAIMANT);
      await page.getByRole("button", { name: "Claim my free report" }).click();
      await expect(
        page.getByRole("heading", { name: "Check your email to finish claiming" }),
      ).toBeVisible();

      const { confirmUrl } = await capturedConfirmation(CHAIN_GIFT);
      await page.goto(confirmUrl);
      await expect(
        page.getByRole("heading", { name: "Your free report is claimed" }),
      ).toBeVisible();
      await expect(page.getByText("Gift saved to your email address")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Check a home now" })).toBeVisible();
      const cookies = await page.context().cookies();
      expect(cookies.some((c) => c.name === "cmnh-gift" && c.value === CHAIN_GIFT)).toBe(true);
    },
  );
});
