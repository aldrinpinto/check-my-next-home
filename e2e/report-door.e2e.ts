import { expect, test } from "./fixtures";

// M7.6 E2E (D68) — the report door against the SERVED app
// + the seeded golden corpus: the buy bar on the results
// page (the shortlist control inside it — the M7.5 control
// moved, not duplicated — the D21 mystery tease, and the
// /report?postcode=&home= link contract on the bar's
// button and the truncation lines) and the /report holding
// page in its identity forms (a resolved home named, a
// postcode-only arrival, a cold visit's generic form).
// All Regression — D68: no Smoke is authored for M7.6.

const BIRKDALE_DOOR_HREF = "/report?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE";

async function reachResults(
  page: import("@playwright/test").Page,
  postcode: string,
  rowName: string,
) {
  await page.goto(`/search?postcode=${postcode.replace(" ", "+")}`);
  await page.getByRole("button", { name: rowName }).first().click();
  await page.getByRole("button", { name: "Check this address" }).click();
  await page.waitForURL(/\/search\/home\?postcode=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

test.describe("report door — regression", () => {
  test(
    "the buy bar carries the moved control, the tease and the contract; its button opens the holding page naming the home",
    { tag: "@regression" },
    async ({ page }) => {
      await reachResults(page, "CM3 2JT", "19 Birkdale Rise");

      const bar = page.locator(".buy-bar");
      await expect(bar).toBeVisible();
      // The shortlist control lives inside the bar, and
      // nowhere else on the page (F6: moved, not copied).
      await expect(bar.locator("[data-shortlist-toggle]")).toHaveCount(1);
      await expect(page.locator("[data-shortlist-toggle]")).toHaveCount(1);
      await expect(page.locator(".results-actions")).toHaveCount(0);
      // The mystery tease rides in the bar, naming nothing.
      await expect(bar.locator(".buy-bar__mystery")).toContainText(
        "Every report comes with a mystery extra, on us",
      );
      // The bar's button: the priced form, contract href.
      const button = bar.locator(".report-btn");
      await expect(button).toHaveText("Get the full report — £4.99");
      await expect(button).toHaveAttribute("href", BIRKDALE_DOOR_HREF);
      // A truncation line carries the same contract.
      await expect(page.locator(".truncation-line a").first()).toHaveAttribute(
        "href",
        BIRKDALE_DOOR_HREF,
      );

      await button.click();
      await page.waitForURL("**/report?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE");
      await expect(page.locator("h1")).toHaveText("The detailed report for 19 Birkdale Rise");
      await expect(page.locator(".type-lead")).toHaveText("Hatfield Peverel, CM3 2JT");
      await expect(page.locator(".report-door__card h2")).toHaveText(
        "What the detailed report adds",
      );
      await expect(page.locator(".report-door__card")).toContainText(
        "Plus the flood findings in full, with a location map for each check",
      );
      await expect(page.locator(".report-door__price")).toHaveText(
        "One payment. No subscription, nothing further to pay.",
      );
      await expect(page.locator(".report-door__state")).toContainText("£4.99");
      await expect(page.locator(".report-door__state")).toContainText("coming in the next stage");
      // The holding page takes no email and runs no form.
      await expect(page.locator("input")).toHaveCount(0);
      await expect(page.locator("form")).toHaveCount(0);
      // Out again: the sample, and the way back to the
      // free check for this home.
      await expect(page.getByRole("link", { name: "See a SAMPLE report" })).toHaveAttribute(
        "href",
        "/sample-report",
      );
      await expect(page.getByRole("link", { name: "Back to your free check" })).toHaveAttribute(
        "href",
        "/search/home?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE",
      );
    },
  );

  test(
    "a postcode-only arrival names the postcode and guesses no home",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/report?postcode=CM3+2JT");
      await expect(page.locator("h1")).toHaveText("The detailed report for CM3 2JT");
      await expect(page.locator("input")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Back to your free check" })).toHaveAttribute(
        "href",
        "/search/home?postcode=CM3+2JT",
      );
    },
  );

  test(
    "a cold visit to /report renders the generic holding page",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/report");
      await expect(page.locator("h1")).toHaveText("The detailed report");
      await expect(page.locator(".report-door__card h2")).toHaveText(
        "What the detailed report adds",
      );
      await expect(page.locator("input")).toHaveCount(0);
      await expect(page.locator("form")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Back to the home page" })).toHaveAttribute(
        "href",
        "/",
      );
    },
  );
});
