import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// M7.3 E2E (D68) — the checker journey against the SERVED
// app + the seeded golden corpus (scripts/seed-golden.mjs).
//
// Smoke: the step's authored journey — full postcode →
// picker → checking → results — once per universal golden
// home. These gate the step in CI. Regression: everything
// else the step makes testable (outward codes,
// normalisation, the mistype classes, the nations, the
// empty picker, Back, the robot check, the whole-check
// failure, refresh). No Regression spec is promoted to
// Smoke (D68 clause 7).
//
// M7.4 re-pointed the holding-page assertions at the real
// results page (.results) that replaced it; M7.4's own
// specs live in e2e/results.e2e.ts.
//
// Test discipline (fold-in 9): only pre-filed golden
// postcodes; no spec depends on a cold load completing —
// Beaulieu's crime is a genuine first-check load, so its
// spec asserts the server-rendered states only.

async function searchFromHome(page: Page, text: string) {
  await page.goto("/");
  await page.locator("#postcode").fill(text);
  // Fidelity pass 2: the landing's bare box carries the
  // sample's Brass button, "Check this home" (the journey
  // surfaces' standard form keeps "Check a home").
  await page.getByRole("button", { name: "Check this home" }).click();
}

async function pickAndReachResults(page: Page, postcode: string, rowName: string) {
  await page.waitForURL(`**/search?postcode=${postcode.replace(" ", "+")}`);
  // D70 R6: the picker is select-then-confirm — tapping a
  // row selects it; the Ink button starts the check.
  await page.getByRole("button", { name: rowName, exact: true }).click();
  await page.getByRole("button", { name: "Check this address" }).click();
  await page.waitForURL(/\/search\/home\?postcode=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

test.describe("checker journey — smoke", () => {
  test(
    "Birkdale CM3 2JT: postcode → picker → checking → results",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await pickAndReachResults(page, "CM3 2JT", "19 Birkdale Rise");
      await expect(page.locator(".results-header h1")).toHaveText("19 Birkdale Rise");
      await expect(page.locator(".results-header__scope")).toHaveText("19 Birkdale Rise, CM3 2JT");
    },
  );

  test(
    "Exeter E16 1GN: postcode → picker → checking → results",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "E16 1GN");
      await pickAndReachResults(page, "E16 1GN", "6 Exeter Road");
      await expect(page.locator(".results-header h1")).toHaveText("6 Exeter Road");
      await expect(page.locator(".results-header__scope")).toHaveText("6 Exeter Road, E16 1GN");
    },
  );

  test(
    "Minerva KT17 1FH: postcode → picker → checking → results",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "KT17 1FH");
      await page.waitForURL("**/search?postcode=KT17+1FH");
      await page
        .getByRole("button", { name: /Flat 4, Minerva House/ })
        .first()
        .click();
      await page.getByRole("button", { name: "Check this address" }).click();
      await page.waitForURL(/\/search\/home\?postcode=KT17\+1FH&home=/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-header__scope")).toContainText("KT17 1FH");
    },
  );
});

test.describe("checker journey — regression", () => {
  test(
    "the checking screen (D73) shows the five grouped rows ticking on the graphic's own clock, then advances",
    { tag: "@regression" },
    async ({ page }) => {
      // Hold the brain calls so the screen is observable:
      // the graphic ticks on its own clock regardless, and
      // the advance waits for the data as well as the
      // graphic (the D73 wiring reconciliation). No failure
      // state ever appears on this screen.
      await page.route("**/api/check/**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        await route.continue();
      });
      await searchFromHome(page, "CM3 2JT");
      await page.waitForURL("**/search?postcode=CM3+2JT");
      await page.getByRole("button", { name: "19 Birkdale Rise", exact: true }).click();
      await page.getByRole("button", { name: "Check this address" }).click();

      await expect(page.locator(".checking h2")).toHaveText("Your check is under way");
      const rows = page.locator(".checking__row");
      await expect(rows).toHaveCount(5);
      await expect(page.locator(".checking__row-label")).toHaveText([
        "Schools & nurseries",
        "Health & the everyday",
        "Safety & surroundings",
        "Costs & connections",
        "Past sales & prices",
      ]);
      await expect(page.locator(".checking__row-qualifier")).toHaveText([
        "Primaries, secondaries, sixth forms and childcare near here.",
        "GP, dentist, pharmacy, hospital, shops and stations near here.",
        "Crime, flood risk and air quality around here.",
        "Council tax, energy, broadband and mobile for this postcode.",
        "Recorded sale prices, from the Land Registry.",
      ]);
      await expect(page.locator(".checking__intro")).toHaveText(
        "We present the facts — the decision is yours.",
      );
      // The progress bar advances 20% per completed row.
      await expect(page.locator(".checking__progress")).toHaveAttribute("aria-valuenow", "100", {
        timeout: 15_000,
      });
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
    },
  );

  test(
    "Back from checking returns to the picker with the pick retained and focused",
    { tag: "@regression" },
    async ({ page }) => {
      await page.route("**/api/check/**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        await route.continue();
      });
      await searchFromHome(page, "CM3 2JT");
      await page.waitForURL("**/search?postcode=CM3+2JT");
      await page.getByRole("button", { name: "19 Birkdale Rise", exact: true }).click();
      await page.getByRole("button", { name: "Check this address" }).click();
      await expect(page.locator(".checking__row")).toHaveCount(5);

      await page.getByRole("link", { name: "Back to the address list" }).click();
      await page.waitForURL(/\/search\?postcode=CM3\+2JT&picked=/);
      // D70 R6: the retained pick is the selected row —
      // pressed, current, and focused.
      const picked = page.getByRole("button", { name: "19 Birkdale Rise", exact: true });
      await expect(picked).toHaveAttribute("aria-pressed", "true");
      await expect(picked).toHaveAttribute("aria-current", "true");
      await expect(picked).toBeFocused();
    },
  );

  test(
    "an outward code lands on the wider-area page with the unlock banner (T-WEB-07)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "E16");
      await page.waitForURL("**/search?outward=E16");
      await expect(page.locator("h1")).toHaveText("Wider area — E16, not this exact home");
      await expect(page.locator(".unlock-banner h2")).toHaveText("Know the full postcode?");
    },
  );

  test(
    "normalisation: 'e161gn' and ' cm3 2jt ' reach the same pickers as the tidy forms",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "e161gn");
      await page.waitForURL("**/search?postcode=E16+1GN");
      await expect(page.getByRole("button", { name: "6 Exeter Road", exact: true })).toBeVisible();

      await searchFromHome(page, " cm3 2jt ");
      await page.waitForURL("**/search?postcode=CM3+2JT");
      await expect(
        page.getByRole("button", { name: "19 Birkdale Rise", exact: true }),
      ).toBeVisible();
    },
  );

  test(
    "a full address carrying its postcode resolves straight to the home (rung 1)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "19 Birkdale Rise, Hatfield Peverel CM3 2JT");
      await page.waitForURL(/\/search\/home\?postcode=CM3\+2JT&home=/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
    },
  );

  test(
    "the postcode-level results embed the picker — picking a home upgrades in place (T-WEB-08)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      // Rung 2's results-page scope label (M7.4, ruling 3).
      await expect(page.locator(".results-header h1")).toHaveText(
        "Postcode area — CM3 2JT, not one exact home",
      );
      await page
        .locator(".picker")
        .getByRole("button", { name: "19 Birkdale Rise", exact: true })
        .click();
      await page.locator(".picker").getByRole("button", { name: "Check this address" }).click();
      await page.waitForURL(/\/search\/home\?postcode=CM3\+2JT&home=/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-header h1")).toHaveText("19 Birkdale Rise");
    },
  );

  test(
    "the bare route redirects to the landing page with the unplaced notice, and a bare street name lands there too (18 Nov 2026)",
    { tag: "@regression" },
    async ({ page }) => {
      // The standalone no-location page is retired (founder
      // ruling, 18 Nov 2026): a direct hit on the bare
      // route returns to the landing page — its own
      // headline, no separate page served — with the small
      // notice at the search box.
      await page.goto("/search");
      await page.waitForURL(/\/\?notice=unplaced/);
      await expect(page.locator("h1")).toHaveText(
        "You're not buying a house. You're choosing your family's home.",
      );
      await expect(page.locator(".unplaced-notice")).toHaveText(
        "We couldn't place that — try a full postcode, for example SW1A 1AA, or a full address with its postcode. A street or place name on its own isn't enough.",
      );
      await expect(page.locator("#postcode")).toBeVisible();

      // A bare street name submitted from the landing box
      // lands back on the landing page the same way.
      await searchFromHome(page, "Birkdale Rise");
      await page.waitForURL(/\/\?notice=unplaced/);
      await expect(page.locator(".unplaced-notice")).toBeVisible();
    },
  );

  test(
    "mistypes land on their named states: unheld full postcode → wider area naming it; unknown outward → the landing page with the unplaced notice",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JA");
      await page.waitForURL("**/search?outward=CM3&notfound=CM3+2JA");
      await expect(page.locator("h1")).toHaveText("Wider area — CM3, not this exact home");
      await expect(page.locator(".journey-notice")).toHaveText(
        "CM3 2JA isn't a postcode we hold — this is the wider area it points to instead.",
      );
      // The labelled form of the box (M7.3's label and
      // hint, the hint's example the neutral SW1A 1AA —
      // the founder's own postcode never appears in
      // visitor-facing copy) serves on the wider-area
      // banner's retry box.
      await expect(page.locator(".unlock-banner .field__label")).toHaveText("Postcode or address");
      await expect(page.locator(".unlock-banner .field__hint")).toHaveText(
        "For example, SW1A 1AA — or the full address, with its postcode.",
      );

      await searchFromHome(page, "ZZ1 1ZZ");
      await page.waitForURL(/\/\?notice=unplaced/);
      await expect(page.locator(".unplaced-notice")).toBeVisible();
    },
  );

  test(
    "Edinburgh EH1 1AD skips the picker — straight to the not-covered page (ruling 4)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "EH1 1AD");
      await page.waitForURL("**/search/home?postcode=EH1+1AD");
      await expect(page.locator("h1")).toHaveText("EH1 1AD is in Scotland");
      // M7.4: the not-covered page is the results page —
      // the four tabs (D76) render with each section's
      // served not-covered line in place.
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("tab")).toHaveCount(4);
      await expect(page.locator('[data-section="flood"]')).toContainText(/not covered/i);
      await expect(page.locator(".picker")).toHaveCount(0);
      // Scotland gating (fold-in workstream 6, gap check
      // extension): the class (a) register sections carry
      // the D77(c) not-covered line, and no three-digit-mile
      // figure appears anywhere on the page — the assertion
      // that would have caught the defect on the seed corpus.
      await expect(page.locator('[data-section="schools-primary"]')).toContainText(
        "isn't part of this check in Scotland",
      );
      await expect(page.locator('[data-section="nurseries"]')).toContainText(
        "isn't part of this check in Scotland",
      );
      await page.getByRole("tab", { name: "What's Nearby" }).click();
      await expect(page.locator('[data-section="health"]')).toContainText(
        "isn't part of this check in Scotland",
      );
      await expect(page.locator('[data-section="hospitals"]')).toContainText(
        "isn't part of this check in Scotland",
      );
      const bodyText = await page.locator("main").innerText();
      expect(bodyText).not.toMatch(/\d{3}\.\d+ mi/);
    },
  );

  test(
    "Beaulieu CM1 6ER: the empty picker is one named state, proceeding to postcode-level results",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM1 6ER");
      await page.waitForURL("**/search?postcode=CM1+6ER");
      await expect(page.locator(".picker__empty-line")).toHaveText(
        "No addresses we can list for this postcode yet.",
      );
      await page.getByRole("link", { name: "See the check for the whole postcode" }).click();
      await page.waitForURL("**/search/home?postcode=CM1+6ER");
      await expect(page.locator(".results-header h1")).toHaveText(
        "Postcode area — CM1 6ER, not one exact home",
      );
    },
  );

  test(
    "a stale home key returns to that postcode's picker, never a guessed home (fold-in 1)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT&home=no-such%7C%7Ckey");
      await page.waitForURL("**/search?postcode=CM3+2JT");
      await expect(
        page.getByRole("button", { name: "19 Birkdale Rise", exact: true }),
      ).toBeVisible();
    },
  );

  test(
    "refresh on a results URL re-derives and serves the same results page",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await pickAndReachResults(page, "CM3 2JT", "19 Birkdale Rise");
      await page.reload();
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-header h1")).toHaveText("19 Birkdale Rise");
    },
  );

  test(
    "T-WEB-05: a normal search completes end to end with the robot check active (test keys)",
    { tag: "@regression" },
    async ({ page }) => {
      // This spec is T-WEB-05's authored home (fold-in 8):
      // the search is verified server-side and completes.
      // The suite runs on the harness's Turnstile seams by
      // default (founder ruling, 17 Nov 2026, after CI
      // #199); under E2E_REAL_TURNSTILE=1 this same spec is
      // the real-path proof — Cloudflare's published test
      // keys against the real widget and verify endpoint.
      await searchFromHome(page, "E16 1GN");
      await page.waitForURL("**/search?postcode=E16+1GN");
      await expect(page.getByRole("button", { name: "6 Exeter Road", exact: true })).toBeVisible();
    },
  );

  test(
    "a robot check that cannot run blocks the search with a friendly retry — nothing is sent (ruling 5)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.route("**/challenges.cloudflare.com/**", (route) => route.abort());
      await page.goto("/");
      await page.locator("#postcode").fill("CM3 2JT");
      await page.getByRole("button", { name: "Check this home" }).click();
      await expect(page.locator(".field__message")).toHaveText(
        "The robot check couldn't run, so your search hasn't been sent. Please try again.",
      );
      expect(page.url()).toBe("http://127.0.0.1:4173/");
      await expect(page.locator("#postcode")).toHaveValue("CM3 2JT");
    },
  );

  test(
    "a resolution that fails outright lands on the whole-check failure state (D44(7))",
    { tag: "@regression" },
    async ({ page }) => {
      await page.route("**/api/resolve", (route) =>
        route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
      );
      await searchFromHome(page, "CM3 2JT");
      await page.waitForURL("**/search/failed");
      await expect(page.locator("h1")).toHaveText("This check couldn't be completed");
      await expect(page.getByRole("link", { name: "See a SAMPLE report" })).toHaveAttribute(
        "href",
        "/sample-report",
      );
    },
  );
});
