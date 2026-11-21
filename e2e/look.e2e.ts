import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// The visual guard's hard look assertions (founder-
// approved step, 19 Nov 2026) — the companion to
// e2e/visual.e2e.ts's photographs. Where the photographs
// hold a page's whole look, these specs name the four
// look facts that must never move again, as plain
// assertions that fail with a reason:
//
//   1. The ground is the cream. BUG-001 shipped a page
//      on the wrong background under 2,215 green tests
//      because nothing asserted the computed colour.
//      The token is --cmnh-cream (#fdf8e8) in
//      app/globals.css; the assertion reads the body's
//      COMPUTED background, so a dropped or overridden
//      body rule fails here even where a photograph
//      might be waved through.
//   2. The page does not overflow sideways (the phone
//      specs' measurement, kept to their one-pixel
//      tolerance for Chromium's fractional rounding).
//   3. Exactly ONE site header and ONE site footer —
//      the chrome unification (founder rulings, 18 Nov
//      2026). The assertion counts the chrome elements
//      (header.site-header / footer.site-footer): pages
//      also carry their own in-page <header> elements
//      (the results head, the report masthead), which
//      are content, not chrome, and are not counted.
//   4. Sections stand in the format order: the results
//      and district pages carry the four D76 tabs in
//      their order, and the sample report carries its
//      sections in the report format's order.
//
// All @smoke, authored so by the step's ruling (the
// core set runs on every push): each spec is one page
// load and a handful of DOM reads, so the gate pays
// seconds for them. These specs first execute in CI,
// like every spec in this harness.

const PHONE = { width: 360, height: 740 };

// --cmnh-cream: #fdf8e8 (app/globals.css), as the
// computed style reports it.
const CREAM_RGB = "rgb(253, 248, 232)";

// The four tabs, in D76 order — the results page and
// the district page carry the same four.
const TAB_ORDER = ["Family Checks", "The Neighbourhood", "Home, Costs & Risks", "What's Nearby"];

// The sample report page's sections in order: the
// short version, then the report format's nine. The
// fourth title is the sample page's own ("Health, air
// & crime") — the recorded carve-out against the live
// report's v12 title stands; this asserts the page as
// it is published.
const REPORT_SECTION_ORDER = [
  "The short version",
  "Price & this home",
  "Sold prices nearby",
  "Schools & nurseries",
  "Health, air & crime",
  "What's nearby",
  "Home, costs & risks",
  "Flood risk",
  "Questions to ask the seller",
  "Sources, notes & disclaimers",
];

async function expectCreamGround(page: Page) {
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background, "the body's computed background is the cream token colour").toBe(CREAM_RGB);
}

async function expectSingleChrome(page: Page) {
  await expect(page.locator("header.site-header"), "exactly one site header").toHaveCount(1);
  await expect(page.locator("footer.site-footer"), "exactly one site footer").toHaveCount(1);
}

// The phone specs' measurement, verbatim in form:
// fonts settle first, then the document's scroll width
// against its client width, one pixel of tolerance.
async function expectNoSidewaysScroll(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const excess = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(excess, "the document must not scroll sideways").toBeLessThanOrEqual(1);
}

async function expectTabOrder(page: Page) {
  const names = await page
    .getByRole("tab")
    .evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));
  expect(names, "the four tabs stand in the D76 order").toEqual(TAB_ORDER);
}

async function openHomeResults(page: Page) {
  await page.goto("/");
  await page.locator("#postcode").fill("CM3 2JT");
  await page.getByRole("button", { name: "Check this home" }).click();
  await page.waitForURL("**/search/home?postcode=CM3+2JT");
  await page.locator(".picker__select").selectOption({ label: "19 Birkdale Rise" });
  await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

test.describe("look assertions — smoke", () => {
  test(
    "landing: cream ground, one header, one footer, no sideways scroll",
    { tag: "@smoke" },
    async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("#postcode")).toBeVisible();
      await expectCreamGround(page);
      await expectSingleChrome(page);
      await expectNoSidewaysScroll(page);
    },
  );

  test(
    "landing at phone width: cream ground, one header, one footer, no sideways scroll",
    { tag: "@smoke" },
    async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto("/");
      await expect(page.locator("#postcode")).toBeVisible();
      await expectCreamGround(page);
      await expectSingleChrome(page);
      await expectNoSidewaysScroll(page);
    },
  );

  test(
    "a completed home check: cream ground, one header, one footer, no sideways scroll, tabs in the D76 order",
    { tag: "@smoke" },
    async ({ page }) => {
      await openHomeResults(page);
      await expectCreamGround(page);
      await expectSingleChrome(page);
      await expectNoSidewaysScroll(page);
      await expectTabOrder(page);
    },
  );

  test(
    "the district page: cream ground, one header, one footer, tabs in the D76 order",
    { tag: "@smoke" },
    async ({ page }) => {
      await page.goto("/search?outward=CM3");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expectCreamGround(page);
      await expectSingleChrome(page);
      await expectTabOrder(page);
    },
  );

  test(
    "the sample report: its sections stand in the format order",
    { tag: "@smoke" },
    async ({ page }) => {
      await page.goto("/sample-report");
      await expect(page.locator(".rpt-section").first()).toBeVisible();
      const titles = await page
        .locator(".rpt-section h2")
        .evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));
      expect(titles, "the sample report's sections stand in the format order").toEqual(
        REPORT_SECTION_ORDER,
      );
    },
  );

  test(
    "the shortlist: cream ground, one header, one footer, no sideways scroll",
    { tag: "@smoke" },
    async ({ page }) => {
      await page.goto("/shortlist");
      await expect(page.locator("h1")).toBeVisible();
      await expectCreamGround(page);
      await expectSingleChrome(page);
      await expectNoSidewaysScroll(page);
    },
  );
});
