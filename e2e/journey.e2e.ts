import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// M7.3 E2E (D68) — the checker journey against the SERVED
// app + the seeded golden corpus (scripts/seed-golden.mjs).
//
// Smoke: the step's authored journey — full postcode →
// postcode check (carrying the full home list) → checking
// → results — once per universal golden home. These gate
// the step in CI. Regression: everything else the step
// makes testable (outward codes, normalisation, the
// mistype classes, the nations, the empty home list, the
// standalone checking screen, the robot check, the
// whole-check failure, refresh). No Regression spec is
// promoted to Smoke (D68 clause 7).
//
// Picker removal (founder ruling, 18 Nov 2026, parity fix
// batch): the picker page is retired — a button press with
// a full postcode lands on the whole-postcode check, whose
// home list links straight to each home's check, and
// /search?postcode= redirects there.
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
  // The submit lands on the whole-postcode check (the
  // /search?postcode= route redirects there); its home
  // list's rows are links straight to each home's check.
  await page.waitForURL(`**/search/home?postcode=${postcode.replace(" ", "+")}`);
  await page.getByRole("link", { name: rowName, exact: true }).click();
  await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

test.describe("checker journey — smoke", () => {
  test(
    "Birkdale CM3 2JT: postcode → home list → checking → results",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await pickAndReachResults(page, "CM3 2JT", "19 Birkdale Rise");
      // Item 5 (parity fix batch): the H1 carries the
      // postcode, in the Master's form.
      await expect(page.locator(".results-head h1")).toHaveText("19 Birkdale Rise, CM3 2JT");
    },
  );

  test(
    "Exeter E16 1GN: postcode → home list → checking → results",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "E16 1GN");
      await pickAndReachResults(page, "E16 1GN", "6 Exeter Road");
      await expect(page.locator(".results-head h1")).toHaveText("6 Exeter Road, E16 1GN");
    },
  );

  test(
    "Minerva KT17 1FH: postcode → home list → checking → results",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "KT17 1FH");
      await page.waitForURL("**/search/home?postcode=KT17+1FH");
      await page
        .getByRole("link", { name: /Flat 4, Minerva House/ })
        .first()
        .click();
      await page.waitForURL(/\/search\/home\?postcode=KT17\+1FH&home=/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-head h1")).toContainText("KT17 1FH");
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
      await page.waitForURL("**/search/home?postcode=CM3+2JT");
      await page.getByRole("link", { name: "19 Birkdale Rise", exact: true }).click();

      await expect(page.locator(".checking .page-title")).toHaveText("Your check is under way");
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
    "the checking screen stands alone: no results shell, no back link, no status line (items 2–4)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.route("**/api/check/**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        await route.continue();
      });
      await searchFromHome(page, "CM3 2JT");
      await page.waitForURL("**/search/home?postcode=CM3+2JT");
      await page.getByRole("link", { name: "19 Birkdale Rise", exact: true }).click();
      await expect(page.locator(".checking__row")).toHaveCount(5);

      // Item 2: the screen is NOT inside the results shell
      // — no results H1, no manifesto, no results block.
      await expect(page.locator(".results")).toHaveCount(0);
      await expect(page.locator(".results-head")).toHaveCount(0);
      // The only address reference is the slim eyebrow.
      await expect(page.locator(".checking .addr-line")).toContainText("19 Birkdale Rise");
      await expect(page.locator(".checking .addr-line")).toContainText("CM3 2JT");
      // Item 3: no "Back to the address list" link.
      await expect(page.getByRole("link", { name: "Back to the address list" })).toHaveCount(0);
      // Item 4: no visible status line.
      await expect(page.locator(".checking")).not.toContainText("Checks are running.");
      await expect(page.locator(".checking")).not.toContainText("Every check has finished.");
    },
  );

  test(
    "an outward code lands on the district page: scope label, four tabs and the bridge (T-WEB-07)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "E16");
      await page.waitForURL("**/search?outward=E16");
      await expect(page.locator("h1")).toHaveText("Wider area — E16, not this exact home");
      // The district page (founder ruling, 18 Nov 2026)
      // supersedes the unlock banner: the results page's
      // four tabs carry the district sections, and the
      // bridge is the only forward path.
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("tab")).toHaveCount(4);
      await expect(page.locator(".unlock-banner")).toHaveCount(0);
      await expect(page.locator(".district-bridge__heading")).toHaveText(
        "Checking one home in E16?",
      );
    },
  );

  test(
    "normalisation: 'e161gn' and ' cm3 2jt ' reach the same home lists as the tidy forms",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "e161gn");
      await page.waitForURL("**/search/home?postcode=E16+1GN");
      await expect(page.getByRole("link", { name: "6 Exeter Road", exact: true })).toBeVisible();

      await searchFromHome(page, " cm3 2jt ");
      await page.waitForURL("**/search/home?postcode=CM3+2JT");
      await expect(page.getByRole("link", { name: "19 Birkdale Rise", exact: true })).toBeVisible();
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
    "the postcode check carries the full home list — a home pick goes straight to that home's check (T-WEB-08, picker removed)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      // Rung 2's results-page scope label (M7.4, ruling 3).
      await expect(page.locator(".results-head h1")).toHaveText(
        "Postcode area — CM3 2JT, not one exact home",
      );
      await page
        .locator(".picker")
        .getByRole("link", { name: "19 Birkdale Rise", exact: true })
        .click();
      await page.waitForURL(/\/search\/home\?postcode=CM3\+2JT&home=/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-head h1")).toHaveText("19 Birkdale Rise, CM3 2JT");
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
        "We couldn't place that. Try a full postcode — for example SW1A 1AA — or start typing a street name and pick it from the list.",
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
      // visitor-facing copy) serves in the district
      // page's bridge box (18 Nov 2026: the bridge
      // replaced the unlock banner as the forward path).
      await expect(page.locator(".district-bridge .field__label")).toHaveText(
        "Postcode or address",
      );
      await expect(page.locator(".district-bridge .field__hint")).toHaveText(
        "For example, SW1A 1AA — or the full address, with its postcode.",
      );

      await searchFromHome(page, "ZZ1 1ZZ");
      await page.waitForURL(/\/\?notice=unplaced/);
      await expect(page.locator(".unplaced-notice")).toBeVisible();
    },
  );

  test(
    "Edinburgh EH1 1AD goes straight to the not-covered page (ruling 4)",
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
    "Beaulieu CM1 6ER: the postcode check lists the picking index's homes (M7.15B)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM1 6ER");
      // The submit redirects to the whole-postcode check,
      // which carries the list (picker removed).
      await page.waitForURL("**/search/home?postcode=CM1+6ER");
      // M7.15B: the harness seed's fixture pass files the
      // EPC half of the picking index, and Beaulieu's 49
      // certificate homes (the odd numbers on George Heard
      // Crescent) are exactly what the union serves here —
      // the empty list this spec asserted before the
      // preload is gone by design (CI #215).
      await expect(page.locator(".picker__empty-line")).toHaveCount(0);
      await expect(page.locator(".picker__count")).toHaveText("49 addresses");
      await expect(
        page.getByRole("link", { name: "49 George Heard Crescent", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".results-head h1")).toHaveText(
        "Postcode area — CM1 6ER, not one exact home",
      );
    },
  );

  test(
    "Beaulieu CM1 6ER: an index-only home links through its durable home key, never a token (M7.15B)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM1 6ER");
      await page.waitForURL("**/search/home?postcode=CM1+6ER");
      await page.getByRole("link", { name: "49 George Heard Crescent", exact: true }).click();
      // The row's link carries the home's durable key —
      // the same key a filed sale would carry — so the
      // pick lands on the canonical home route, not on a
      // transient resolve token.
      await page.waitForURL(
        /\/search\/home\?postcode=CM1\+6ER&home=49%7C%7CGEORGE\+HEARD\+CRESCENT/,
      );
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-head h1")).toHaveText(
        "49 George Heard Crescent, CM1 6ER",
      );
    },
  );

  test(
    "Southminster CM0 7AA: the empty home list is one named state on the postcode check",
    { tag: "@regression" },
    async ({ page }) => {
      // The neither-source witness (the entry-point unit
      // scenarios' own postcode): the directory fixture
      // holds CM0 7AA, but no seeded fixture files a sale,
      // a certificate or an index row for it, so the union
      // is empty and the named empty state is the served
      // truth. (Before M7.15B this spec ran on Beaulieu,
      // whose list the preload deliberately filled.)
      await searchFromHome(page, "CM0 7AA");
      await page.waitForURL("**/search/home?postcode=CM0+7AA");
      await expect(page.locator(".picker__empty-line")).toHaveText(
        "No addresses we can list for this postcode yet.",
      );
      await expect(page.locator(".results-head h1")).toHaveText(
        "Postcode area — CM0 7AA, not one exact home",
      );
    },
  );

  test(
    "a stale home key returns to that postcode's check, never a guessed home (fold-in 1)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT&home=no-such%7C%7Ckey");
      await page.waitForURL("**/search/home?postcode=CM3+2JT");
      await expect(page.getByRole("link", { name: "19 Birkdale Rise", exact: true })).toBeVisible();
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
      await expect(page.locator(".results-head h1")).toHaveText("19 Birkdale Rise, CM3 2JT");
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
      await page.waitForURL("**/search/home?postcode=E16+1GN");
      await expect(page.getByRole("link", { name: "6 Exeter Road", exact: true })).toBeVisible();
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
