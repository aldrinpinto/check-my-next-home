import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// M7.10 E2E (G6) — the results-page calculators against
// the SERVED app + the seeded golden corpus. All
// Regression (D68: no Regression spec is promoted).
//
// Coverage, against the harness's seeded postcodes:
//   - pre-fill from the home's last sale: Birkdale
//     CM3 2JT, rung 1 through the postcode check's home
//     list (19 Birkdale Rise, last sale £588,995).
//   - buyer-choice switching changing the stamp duty
//     result, and editing clearing a card's result (G4):
//     the same Birkdale page, at a typed £300,000 where
//     the three buyer kinds give three different figures
//     (£5,000 moving / £0 first home / £20,000 additional).
//   - the no-sale empty start and the empty-calculate
//     prompt (G4): Beaulieu CM1 6ER at postcode level —
//     the harness seeds no rung-1 home without a recorded
//     sale (every golden home has one), so the empty
//     start is proven where the view's lastSalePrice is
//     null, exactly the state the no-sale home serves;
//     the framing and pre-fill derivations are also
//     unit-pinned in tests/calculators.test.ts and
//     tests/results.test.ts.
//   - the Scotland named-line form (G1): Edinburgh
//     EH1 1AD, the seeded not-covered postcode; Wales
//     (Cardiff CF11 8AA) rides beside it.
//   - the wider-area view showing no calculators (G2):
//     E16, the seeded rung-3 outward code.
//
// These specs first execute in CI: the local harness has
// no DATABASE_URL, so the served app cannot stand up here
// (the M7.3 harness discipline).
//
// T-WEB map (M7.15 citation tidy):
//   T-WEB-12 (calculators website-only) — all six specs;
//     the row is registered from M7.10's adopted G6, not
//     re-decided at M7.15.

const EMPTY_PROMPT = "Enter the price you're considering.";

async function searchFromHome(page: Page, text: string) {
  await page.goto("/");
  await page.locator("#postcode").fill(text);
  await page.getByRole("button", { name: "Check this home" }).click();
}

async function reachBirkdaleResults(page: Page) {
  await searchFromHome(page, "CM3 2JT");
  // Picker removed (18 Nov 2026): the submit lands on the
  // whole-postcode check; its home dropdown carries the
  // postcode's homes (founder ruling, 20 Nov 2026 — the
  // list dump is gone), and choosing one is the pick.
  await page.waitForURL("**/search/home?postcode=CM3+2JT");
  await page.locator(".picker__trigger").click();
  await page.locator(".picker__panel").getByRole("option", { name: "19 Birkdale Rise" }).click();
  await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
  await page.locator(".calculators").scrollIntoViewIfNeeded();
}

function mortgageCard(page: Page) {
  return page.locator(".calculator-card").filter({ hasText: "Mortgage calculator" });
}

function stampDutyCard(page: Page) {
  return page.locator(".calculator-card").filter({ hasText: "Stamp duty calculator" });
}

test.describe("calculators — regression (M7.10)", () => {
  test(
    "pre-fill from the home's last sale: both price boxes and the 25% deposit, the framing line, and both calculations",
    { tag: "@regression" },
    async ({ page }) => {
      await reachBirkdaleResults(page);

      // Both cards pre-fill from the last recorded sale —
      // never an asking price (premise 2 of the prep).
      await expect(page.locator("#calc-price")).toHaveValue("588995");
      await expect(page.locator("#calc-deposit")).toHaveValue("147249");
      await expect(page.locator("#calc-sd-price")).toHaveValue("588995");
      // G5: the deposit's share rides beside the £ box.
      await expect(mortgageCard(page)).toContainText("25% of the price");
      // The framing line, computed on the last sale.
      await expect(stampDutyCard(page)).toContainText(
        "On the price this home last sold for, the stamp duty would be £19,450",
      );

      await stampDutyCard(page).getByRole("button", { name: "Calculate stamp duty" }).click();
      await expect(stampDutyCard(page).locator(".calculator-card__result")).toHaveText(
        "£19,450 on top of the price.",
      );

      await mortgageCard(page).getByRole("button", { name: "Calculate monthly payment" }).click();
      await expect(mortgageCard(page).locator(".calculator-card__result")).toContainText(
        "£2,455 a month, repayment.",
      );
    },
  );

  test(
    "buyer-choice switching changes the stamp duty result, and editing any input clears the card's result first (G4)",
    { tag: "@regression" },
    async ({ page }) => {
      await reachBirkdaleResults(page);
      const card = stampDutyCard(page);
      const result = card.locator(".calculator-card__result");

      await page.locator("#calc-sd-price").fill("300000");
      await card.getByRole("button", { name: "Calculate stamp duty" }).click();
      await expect(result).toHaveText("£5,000 on top of the price.");

      // Editing the price clears the standing result —
      // the page never announces a figure the boxes no
      // longer produce.
      await page.locator("#calc-sd-price").fill("300001");
      await expect(result).toHaveCount(0);
      await page.locator("#calc-sd-price").fill("300000");
      await card.getByRole("button", { name: "Calculate stamp duty" }).click();
      await expect(result).toHaveText("£5,000 on top of the price.");

      // Switching the buyer choice clears too, then the
      // new choice's figure replaces it: first-time relief
      // takes £300,000 to £0; the additional-home rates
      // take it to £20,000.
      await card.getByRole("radio", { name: "Our first home" }).click();
      await expect(result).toHaveCount(0);
      await card.getByRole("button", { name: "Calculate stamp duty" }).click();
      await expect(result).toHaveText("£0 on top of the price.");

      await card.getByRole("radio", { name: "Buying another home as well" }).click();
      await expect(result).toHaveCount(0);
      await card.getByRole("button", { name: "Calculate stamp duty" }).click();
      await expect(result).toHaveText("£20,000 on top of the price.");
    },
  );

  test(
    "the no-sale start: every box empty, and Calculate with no price shows the prompt as the result on both cards (G4)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM1+6ER");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await page.locator(".calculators").scrollIntoViewIfNeeded();

      await expect(page.locator("#calc-price")).toHaveValue("");
      await expect(page.locator("#calc-deposit")).toHaveValue("");
      await expect(page.locator("#calc-sd-price")).toHaveValue("");
      // No deposit share shows while nothing is positive.
      await expect(page.locator(".calculators")).not.toContainText("of the price");
      // The framing line is the prompt itself.
      await expect(stampDutyCard(page)).toContainText(EMPTY_PROMPT);

      await stampDutyCard(page).getByRole("button", { name: "Calculate stamp duty" }).click();
      await expect(stampDutyCard(page).locator(".calculator-card__result")).toHaveText(
        EMPTY_PROMPT,
      );

      await mortgageCard(page).getByRole("button", { name: "Calculate monthly payment" }).click();
      await expect(mortgageCard(page).locator(".calculator-card__result")).toHaveText(EMPTY_PROMPT);
    },
  );

  test(
    "Scotland: the stamp duty card is the LBTT named line with the Revenue Scotland link — no calculation, no figures (G1)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=EH1+1AD");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("h1")).toHaveText("EH1 1AD is in Scotland");
      await page.locator(".calculators").scrollIntoViewIfNeeded();

      const card = stampDutyCard(page);
      await expect(card).toContainText(
        "Scotland charges Land and Buildings Transaction Tax instead — this calculator covers England & Northern Ireland.",
      );
      await expect(card.getByRole("link", { name: /Revenue Scotland/ })).toHaveAttribute(
        "href",
        "https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property",
      );
      await expect(page.getByRole("button", { name: "Calculate stamp duty" })).toHaveCount(0);
      // The mortgage card is unchanged for every nation.
      await expect(
        mortgageCard(page).getByRole("button", { name: "Calculate monthly payment" }),
      ).toBeVisible();
    },
  );

  test(
    "Wales: the stamp duty card is the LTT named line with the GOV.WALES link (G1)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CF11+8AA");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await page.locator(".calculators").scrollIntoViewIfNeeded();

      const card = stampDutyCard(page);
      await expect(card).toContainText(
        "Wales charges Land Transaction Tax instead — this calculator covers England & Northern Ireland.",
      );
      await expect(card.getByRole("link", { name: /GOV\.WALES/ })).toHaveAttribute(
        "href",
        "https://www.gov.wales/land-transaction-tax-guide",
      );
      await expect(page.getByRole("button", { name: "Calculate stamp duty" })).toHaveCount(0);
    },
  );

  test(
    "the wider-area view shows no calculators at all (G2)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search?outward=E16");
      // Held reveal (the wider-area checking screen,
      // 19 Nov 2026): the heading arrives with the results.
      await expect(page.getByRole("heading", { name: "Wider area — E16" })).toHaveText(
        "Wider area — E16",
        { timeout: 30_000 },
      );
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".calculators")).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText("Could this home fit your life?");
    },
  );
});
