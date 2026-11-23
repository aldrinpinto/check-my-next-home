import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// D66 no-render proofs (M7.15 follow-up, gap-check item
// 4b) — the parameterised served-page spec the step's
// adopted gap check calls for. All Regression (D68: the
// Smoke set is frozen as authored).
//
// T-WEB map (M7.15 citation tidy): no T-WEB row — this
// file discharges the D66 fold (1) exclusion list and the
// M7.4 gap additions at served-page level (the prep's
// J10). The strong proof remains the unit suite's
// planted-marker pins (tests/results.test.ts, "report-
// depth material never reaches the view (D66)"), which
// prove the free VIEW never reads the depth. This spec
// is the served-page tripwire behind them: on each
// universal golden home it walks all four tabs and
// asserts that no fragment of the report-depth blocks'
// own text appears anywhere in the served page's DOM,
// with a positive control per tab so the absences are
// never vacuous.
//
// The markers are distinctive fragments of the depth
// blocks' own served-at-report-depth wording, each
// checked against the free page's settled text that
// legitimately resembles it: the flood upsell's detail
// ("The defences near this home, and how the picture
// changes in the years ahead") names defences and the
// years ahead in prose, so the defences marker is the
// depth block's title and the climate markers are the
// scenario names (UKCP18 / RCP 8.5); the costs upsell
// names "the certificate's construction", so the
// construction marker is the depth block's basis-line
// fragment; the Air pill's figure legitimately reads
// "Above a UK legal limit" / "Within WHO guidelines",
// so the yardstick marker is the depth line's own form
// ("stricter WHO guideline"); and the census upsell
// NAMES the six depth tables in prose, so census depth
// is proven structurally — the census section renders
// its headline lines and its upsell and contains no
// table — alongside the benefits and IMD domain
// fragments, which have no free-page namesake.
//
// Honest limit, stated plainly: at served-page level
// this proves the depth text is absent from what the
// seeded corpus serves for these three homes; where a
// depth datum is not filed for a home at all, its
// absence here is necessary but not sufficient — the
// unit pins carry that half.

const GOLDEN_HOMES: { name: string; postcode: string; rowName: string }[] = [
  { name: "Birkdale", postcode: "CM3 2JT", rowName: "19 Birkdale Rise" },
  { name: "Exeter", postcode: "E16 1GN", rowName: "6 Exeter Road" },
  { name: "Minerva", postcode: "KT17 1FH", rowName: "Flat 4, Minerva House, 12 Ceres Crescent" },
];

const DEPTH_MARKERS: { label: string; pattern: RegExp }[] = [
  { label: "the AQMA section", pattern: /Air Quality Management Area/ },
  { label: "the charging-zones section", pattern: /areas where driving a vehicle/ },
  { label: "the industrial-sites section", pattern: /Pollution Inventory/ },
  {
    label: "the flood defences block",
    pattern: /Recorded flood defences near this postcode point/,
  },
  { label: "the flood climate outlook", pattern: /UKCP18|RCP 8\.5/ },
  {
    label: "the EPC construction block",
    pattern: /description of this home's construction/,
  },
  { label: "the benefits depth", pattern: /people on Universal Credit|Claimant Count/ },
  {
    label: "the IMD domain depth",
    pattern: /Barriers to Housing and Services|Health deprivation and disability/,
  },
  {
    label: "the school destinations block",
    pattern: /students who finished key stage 4|students who finished 16 to 19 study/,
  },
  { label: "the air-quality yardstick lines", pattern: /stricter WHO guideline/ },
];

async function searchFromHome(page: Page, query: string) {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill(query);
  await page.getByRole("button", { name: "Check this home" }).click();
}

async function reachResults(page: Page, postcode: string, rowName: string) {
  // The whole-postcode check's home dropdown carries the
  // postcode's homes (founder ruling, 20 Nov 2026 — the
  // list dump is gone); choosing one is the pick.
  await page.waitForURL(`**/search/home?postcode=${postcode.replace(" ", "+")}`);
  await page.locator(".picker__trigger").click();
  await page.locator(".picker__panel").getByRole("option", { name: rowName }).click();
  await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

async function expectNoDepth(page: Page, where: string) {
  const text = (await page.locator("main").textContent()) ?? "";
  for (const marker of DEPTH_MARKERS) {
    expect(text, `${where}: ${marker.label} must not render on the free page`).not.toMatch(
      marker.pattern,
    );
  }
}

test.describe("D66 no-render — regression", () => {
  for (const home of GOLDEN_HOMES) {
    test(
      `${home.name} ${home.postcode}: no report-depth material renders on any tab (D66)`,
      { tag: "@regression" },
      async ({ page }) => {
        await searchFromHome(page, home.postcode);
        await reachResults(page, home.postcode, home.rowName);

        // Family Checks (the default tab): the schools
        // section renders its rows; no depth anywhere.
        await expect(page.locator('[data-section="schools-primary"] .place-row')).not.toHaveCount(
          0,
        );
        await expectNoDepth(page, `${home.name} / Family Checks`);

        // The Neighbourhood: the census section renders
        // its headline form — its upsell naming the depth
        // is the settled free form — and holds no table.
        await page.getByRole("tab", { name: "The Neighbourhood" }).click();
        const census = page.locator('[data-section="census"]');
        await expect(census).toBeVisible();
        await expect(census).toContainText("Plus the full Census picture for this area");
        await expect(census.locator("table")).toHaveCount(0);
        await expectNoDepth(page, `${home.name} / The Neighbourhood`);

        // Home, Costs & Risks: the costs section renders.
        await page.getByRole("tab", { name: "Home, Costs & Risks" }).click();
        await expect(page.locator('[data-section="costs"]')).toBeVisible();
        await expectNoDepth(page, `${home.name} / Home, Costs & Risks`);

        // What's Nearby: the health section renders.
        await page.getByRole("tab", { name: "What's Nearby" }).click();
        await expect(page.locator('[data-section="health"]')).toBeVisible();
        await expectNoDepth(page, `${home.name} / What's Nearby`);
      },
    );
  }
});
