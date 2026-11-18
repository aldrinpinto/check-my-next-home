import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// M7.9 E2E (D68) — the free headlines on the Home, Costs &
// Risks tab, against the SERVED app + the seeded golden
// corpus, on all three universal golden homes. Regression
// only: this step authors no Smoke, and no Regression spec
// is promoted to Smoke (D68 clause 7).
//
// The step's E2E paragraph, as adopted: the planning
// hand-off renders as served (council named, register
// named, the GOV.UK register search link), the brownfield
// headline in its served short form and the built-up-area
// line render as served, and the negatives hold page-wide
// — no planning-application count, no named planning list,
// no company name, and no standalone monthly
// cost-of-ownership headline. The composed Costs lead
// (the two D33 monthly figures in one line, each half
// restated inside its own section) is the settled form
// and is NOT a violation: the spec asserts the lead's
// composed shape and that it is the Costs section's only
// monthly total, rather than asserting its absence. With
// COMPANY_OWNERSHIP_ENABLED off (the shipped state) no
// company-ownership headline renders at all; the flag-on
// form is pinned at view level in tests/results.test.ts,
// because the harness serves the shipped flag position.
//
// The negatives are asserted on the sections that could
// carry them, with their tab open — the suite's
// established pattern (e2e/results.e2e.ts). That scoping
// is complete, not approximate: the view builder renders
// the planning hand-off, the company line and any monthly
// total nowhere else on the page (lib/results.ts), so a
// headline cannot hide in another tab.
//
// The "no named planning list" negative is carried by
// three facts asserted together: the hand-off line itself
// (which states no applications are listed), exactly one
// link in the section (the register search), and no
// application count anywhere in the section's text.

const GOV_UK_REGISTER_SEARCH = "https://www.gov.uk/search-register-planning-decisions";

const COMPOSED_LEAD =
  /About £[\d,.]+ a month: council tax £[\d,.]+ a month \(Band D average, £[\d,.]+ a year\) \+ EPC estimated energy about £[\d,.]+ a month \(£[\d,.]+ a year\)\. Mortgage not included\./;

async function searchFromHome(page: Page, text: string) {
  await page.goto("/");
  await page.locator("#postcode").fill(text);
  await page.getByRole("button", { name: "Check this home" }).click();
}

async function reachResults(page: Page, postcode: string, rowName: string | RegExp) {
  // Picker removed (18 Nov 2026): the submit lands on the
  // whole-postcode check; its home list's rows are links
  // straight to each home's check.
  await page.waitForURL(`**/search/home?postcode=${postcode.replace(" ", "+")}`);
  await page.getByRole("link", { name: rowName }).first().click();
  await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

async function openTab(page: Page, name: string) {
  await page.getByRole("tab", { name }).click();
}

interface GoldenHome {
  label: string;
  postcode: string;
  rowName: string | RegExp;
  council: string;
  brownfieldLine: string;
  builtUpLine: string;
}

const GOLDEN_HOMES: GoldenHome[] = [
  {
    label: "Birkdale CM3 2JT",
    postcode: "CM3 2JT",
    rowName: "19 Birkdale Rise",
    council: "Braintree",
    brownfieldLine: "2 recorded brownfield sites within 2 miles of the postcode point",
    builtUpLine: "the postcode point falls inside the Hatfield Peverel built-up area",
  },
  {
    label: "Exeter E16 1GN",
    postcode: "E16 1GN",
    rowName: "6 Exeter Road",
    council: "Newham",
    brownfieldLine: "97 recorded brownfield sites within 2 miles of the postcode point",
    builtUpLine: "the postcode point falls inside the Newham built-up area",
  },
  {
    label: "Minerva KT17 1FH",
    postcode: "KT17 1FH",
    rowName: /Flat 4, Minerva House/,
    council: "Epsom and Ewell",
    brownfieldLine: "30 recorded brownfield sites within 2 miles of the postcode point",
    builtUpLine: "the postcode point falls inside the Ewell built-up area",
  },
];

test.describe("M7.9 headlines — regression", () => {
  for (const home of GOLDEN_HOMES) {
    test(
      `${home.label}: the planning hand-off, brownfield and built-up headlines render as served; the negatives hold`,
      { tag: "@regression" },
      async ({ page }) => {
        await searchFromHome(page, home.postcode);
        await reachResults(page, home.postcode, home.rowName);
        await openTab(page, "Home, Costs & Risks");

        const planning = page.locator('[data-section="planning-protection"]');

        // The D31 hand-off, as served: the council named,
        // its planning register named, the GOV.UK register
        // search link — never a count, never a named list.
        await expect(planning).toContainText(
          `planning applications for this area are published on the planning register kept by ${home.council} — we do not hold a copy, so no applications are listed here; the link below takes you to the official search, where you enter the postcode`,
        );
        const registerLink = planning.getByRole("link", {
          name: "Search the register of planning decisions (GOV.UK)",
        });
        await expect(registerLink).toHaveAttribute("href", GOV_UK_REGISTER_SEARCH);
        // The register search is the section's only link —
        // a named list of applications would render here.
        await expect(planning.locator("a")).toHaveCount(1);
        // No planning-application count anywhere in the
        // section's text.
        await expect(planning).not.toContainText(/\d+\s+(?:planning\s+)?applications/i);

        // The brownfield headline in its served short form
        // and the built-up-area line, as served.
        await expect(planning).toContainText(home.brownfieldLine);
        await expect(planning).toContainText(home.builtUpLine);

        // No company-ownership headline at all while the
        // flag is off (the shipped state) — and so no
        // company name either.
        await expect(planning).not.toContainText("Owned by a company");
        await expect(planning).not.toContainText("Company ownership");

        // The Costs lead is the settled composed form: the
        // two D33 figures in one line, each half restated
        // in its own section below — present, shaped as
        // composed, and the section's only monthly total.
        const costs = page.locator('[data-section="costs"]');
        await expect(costs).toContainText(COMPOSED_LEAD);
        const costLines = await costs.locator(".results-line").allTextContents();
        const totals = costLines.filter((line) => /^About £[\d,.]+ a month:/.test(line.trim()));
        expect(totals).toHaveLength(1);
        expect(totals[0]).toMatch(COMPOSED_LEAD);

        // No standalone monthly cost-of-ownership headline:
        // the phrase exists in neither of the sections
        // that could carry a cost headline.
        await expect(costs).not.toContainText(/cost of ownership/i);
        await expect(planning).not.toContainText(/cost of ownership/i);
      },
    );
  }
});
