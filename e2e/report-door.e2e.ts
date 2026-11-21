import { expect, test } from "./fixtures";

// M7.6 E2E (D68) — the report door against the SERVED app
// + the seeded golden corpus: the buy bar on the results
// page (the shortlist control inside it, the D21 mystery
// tease, and the /report?postcode=&home= link contract on
// the bar's button and the truncation lines) and the
// /report holding page in its identity forms (a resolved
// home named, a postcode-only arrival, a cold visit's
// generic form). All Regression — D68: no Smoke is
// authored for M7.6.
//
// Parity fix batch (18 Nov 2026): item 6 adds the second
// shortlist control and the priced report button level
// with the H1 in the results head; item 19 makes the
// bar's button the unpriced form.
//
// T-WEB map (M7.15 citation tidy):
//   No T-WEB row — the three specs discharge M7.6's
//   report door (the buy bar's contract and the holding
//   page's identity forms).

const BIRKDALE_DOOR_HREF = "/report?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE";

async function reachResults(
  page: import("@playwright/test").Page,
  postcode: string,
  rowName: string,
) {
  // The retired picker route redirects to the
  // whole-postcode check (picker removed, 18 Nov 2026);
  // its home dropdown carries the postcode's homes
  // (founder ruling, 20 Nov 2026 — the list dump is
  // gone), and choosing one is the pick.
  await page.goto(`/search?postcode=${postcode.replace(" ", "+")}`);
  await page.waitForURL(/\/search\/home\?postcode=/);
  await page.locator(".picker__select").selectOption({ label: rowName });
  await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

test.describe("report door — regression", () => {
  test(
    "the buy bar and the results head carry the controls, the tease and the contract; the bar's button opens the holding page naming the home",
    { tag: "@regression" },
    async ({ page }) => {
      await reachResults(page, "CM3 2JT", "19 Birkdale Rise");

      const bar = page.locator(".buy-bar");
      await expect(bar).toBeVisible();
      // Item 6 (parity fix batch): the shortlist control
      // now sits in TWO places — level with the H1 in the
      // results head and inside the buy bar — one control
      // per place, both instances of the same component.
      await expect(bar.locator("[data-shortlist-toggle]")).toHaveCount(1);
      await expect(page.locator("[data-shortlist-toggle]")).toHaveCount(2);
      await expect(page.locator(".results-actions [data-shortlist-toggle]")).toHaveCount(1);
      // The mystery tease rides in the bar, naming nothing.
      await expect(bar.locator(".buy-bar__mystery")).toContainText(
        "Every report comes with a mystery extra, on us",
      );
      // Item 19: the bar's button is the UNPRICED form on
      // the contract href; the priced form is the head's
      // button alone, on the same href.
      const button = bar.locator(".report-btn");
      await expect(button).toHaveText("Get the full report");
      await expect(button).toHaveAttribute("href", BIRKDALE_DOOR_HREF);
      const headButton = page.locator(".results-actions .report-btn");
      await expect(headButton).toHaveText("Get the full report — £4.99");
      await expect(headButton).toHaveAttribute("href", BIRKDALE_DOOR_HREF);
      // A truncation row carries the same contract (D3,
      // parity fix stack: the row is the sample's .truncRow
      // link itself now, not a link inside a line).
      await expect(page.locator("a.trunc-row").first()).toHaveAttribute("href", BIRKDALE_DOOR_HREF);

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
