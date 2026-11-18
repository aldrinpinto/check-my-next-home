import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// M7.4 E2E (D68) — the free results page against the SERVED
// app + the seeded golden corpus.
//
// Smoke: a completed check renders all three tabs with the
// bundle's figures for each universal golden home; the
// summary strip's four pills render label + tinted figure
// chip (D70 R5 — the colour rides on the figure only); the
// D9 short form appears verbatim beside the
// results. Regression: the rung-3 wider-area page, refresh
// and Back, the flood-warnings forms, the D39 calibration
// pair, the noise states, the catchment block and deadlines
// line, rung 2's label with the picker embedded, and the
// nations. No Regression spec is promoted to Smoke (D68
// clause 7).
//
// Two authored lines are proven where the environment can
// prove them honestly (recorded in docs/frontend-m7.4.md):
// the live flood warnings are composed fresh from the EA
// feed at serve time (D42, never filed), so the warnings
// spec branches on the state the page actually serves; and
// the noise not-filed line cannot occur on a golden page
// because the fixture corpus files noise — the not-filed
// rendering is pinned in tests/results.test.ts, and this
// suite proves the served bands (Birkdale) and the Welsh
// not-covered line (Cardiff) on real pages.
//
// The whole-check failure state with retry and the
// sample-report route is M7.3's spec in e2e/journey.e2e.ts,
// reused unchanged (the step authors it by reference).

const DISCLAIMER_SHORT_FORM =
  "We present official data as it is published, with its source and date. We do not score, rate or recommend homes or areas.";

async function searchFromHome(page: Page, text: string) {
  await page.goto("/");
  await page.locator("#postcode").fill(text);
  // Fidelity pass 2: the landing's bare box carries the
  // sample's Brass button, "Check this home".
  await page.getByRole("button", { name: "Check this home" }).click();
}

async function reachResults(page: Page, postcode: string, rowName: string | RegExp) {
  await page.waitForURL(`**/search?postcode=${postcode.replace(" ", "+")}`);
  // D70 R6: the picker is select-then-confirm.
  await page.getByRole("button", { name: rowName }).first().click();
  await page.getByRole("button", { name: "Check this address" }).click();
  await page.waitForURL(/\/search\/home\?postcode=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

async function openTab(page: Page, name: string) {
  await page.getByRole("tab", { name }).click();
}

test.describe("results page — smoke", () => {
  test(
    "Birkdale CM3 2JT: four tabs (D76), the five D75 pills, the D9 form",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await reachResults(page, "CM3 2JT", "19 Birkdale Rise");

      // The D75 summary strip on the served corpus: the
      // only concerning fact is Schools (secondary 1.8 mi),
      // so the strip reads Schools · Flood · Crime · Noise ·
      // Deprivation — the sample's worked example.
      const pills = page.locator(".results-strip .pill--summary");
      await expect(pills).toHaveCount(5);
      await expect(pills.nth(0)).toContainText("Schools");
      await expect(pills.nth(0).locator(".pill__figure")).toHaveText("0.3 / 1.9 mi");
      await expect(pills.nth(1)).toContainText("Flood");
      await expect(pills.nth(1)).toContainText("Very low");
      await expect(pills.nth(2)).toContainText("Crime");
      await expect(pills.nth(2)).toContainText("Below England average");
      await expect(pills.nth(3)).toContainText("Noise");
      await expect(pills.nth(4)).toContainText("Deprivation");
      await expect(pills.nth(4)).toContainText("8 of 10");
      await expect(page.locator(".results-strip .place-row__miles")).toHaveCount(0);

      // The D9 short form, verbatim, beside the results.
      await expect(page.locator(".results-disclaimer-short")).toHaveText(DISCLAIMER_SHORT_FORM);

      // Family Checks opens by default.
      await expect(page.getByRole("tab", { name: "Family Checks" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.locator('[data-section="schools-primary"] .place-row')).not.toHaveCount(0);

      // The Neighbourhood: crime in the D77(a) percentage
      // form with the calibration pair beneath. The local
      // figure is the corpus's locked golden (51.7); the
      // England figure is pinned in form only — on this
      // excerpted corpus the served England figure is the
      // fixture total's arithmetic on the excerpt's filed
      // residents (the golden replay asserts it as an
      // identity, not the production value), and the
      // production pair (51.7 against 94.5, about 45%
      // below) is pinned at unit level (CI #205 fix).
      await openTab(page, "The Neighbourhood");
      const crime = page.locator('[data-section="crime"]');
      await expect(crime).toContainText("330 crimes recorded in the last 12 months");
      await expect(crime).toContainText(/about \d+% below the England average/);
      await expect(crime).toContainText(
        "That's 51.7 recorded crimes for every 1,000 residents here. Across England, the figure is",
      );

      // What's Nearby: nearest 1 of each kind.
      await openTab(page, "What's Nearby");
      await expect(page.locator('[data-section="parks"] .place-row')).not.toHaveCount(0);

      // Home, Costs & Risks: the golden sold figures, and
      // Costs carrying council tax and broadband together.
      await openTab(page, "Home, Costs & Risks");
      await expect(page.locator('[data-section="sold-prices"]')).toContainText("£588,995");
      await expect(page.locator('[data-section="costs"]')).toContainText("£2,280.34");
      await expect(page.locator('[data-section="costs"]')).toContainText("£190.03 a month");
      await expect(page.locator('[data-section="costs"]')).toContainText("gigabit");
    },
  );

  test(
    "Exeter E16 1GN: four tabs with the bundle's figures",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "E16 1GN");
      await reachResults(page, "E16 1GN", "6 Exeter Road");
      await expect(page.getByRole("tab")).toHaveCount(4);
      await openTab(page, "The Neighbourhood");
      await expect(page.locator('[data-section="crime"]')).toContainText("10,722");
      await openTab(page, "Home, Costs & Risks");
      const sold = page.locator('[data-section="sold-prices"]');
      await expect(sold).toContainText("£270,000");
      await expect(sold).toContainText("£310,000");
    },
  );

  test(
    "Minerva KT17 1FH: four tabs with the bundle's figures",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "KT17 1FH");
      await reachResults(page, "KT17 1FH", /Flat 4, Minerva House/);
      await expect(page.getByRole("tab")).toHaveCount(4);
      await openTab(page, "The Neighbourhood");
      await expect(page.locator('[data-section="crime"]')).toContainText("1,956");
      await openTab(page, "Home, Costs & Risks");
      const sold = page.locator('[data-section="sold-prices"]');
      await expect(sold).toContainText("£420,000");
      // The fixture cut holds 2 sales for this postcode, so
      // the median serves its too-few named state (D23's
      // floor of 5); the full-file median (£399,999 over 27)
      // is the replay's production-corpus pin, not this
      // corpus's served answer.
      await expect(sold).toContainText("too few for a median");
    },
  );
});

test.describe("results page — regression", () => {
  test(
    "the rung-3 wider-area page: scope label, named states, no this-home figures, no this-home report",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "E16");
      await page.waitForURL("**/search?outward=E16");
      await expect(page.locator("h1")).toHaveText("Wider area — E16, not this exact home");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("tab")).toHaveCount(4);
      await expect(page.locator('[data-section="crime"]')).toContainText(
        "crime counts need an exact postcode",
      );
      const body = await page.locator("main").innerText();
      expect(body).not.toContain("£270,000");
      expect(body).not.toContain("£310,000");
      expect(body).not.toContain("£4.99");
      // No report link in any form — the bare route or the
      // M7.6 contract form (href^= catches both).
      await expect(page.locator('a[href^="/report"]')).toHaveCount(0);
      await expect(page.locator(".results-strip")).toHaveCount(0);
    },
  );

  test(
    "refresh restores the same check, and Back returns to the picker",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await reachResults(page, "CM3 2JT", "19 Birkdale Rise");
      await page.reload();
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-section="crime"]')).toContainText(
        "330 crimes recorded in the last 12 months",
      );
      await page.goBack();
      await page.waitForURL(/\/search\?postcode=CM3\+2JT/);
      await expect(
        page.getByRole("button", { name: "19 Birkdale Rise", exact: true }),
      ).toBeVisible();
    },
  );

  test(
    "flood warnings: the served state renders consistently — full form first in the section, slim line only when active",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await openTab(page, "Home, Costs & Risks");
      const flood = page.locator('[data-section="flood"]');
      const state = await flood.getAttribute("data-warnings-state");
      if (state === "warnings") {
        // The slim line sits under the strip, and the full
        // form (with the EA message) is the flood section's
        // first block.
        await expect(page.locator('.results-warnings-strip[data-state="warnings"]')).toBeVisible();
        await expect(flood.locator(".flood-warnings")).toBeVisible();
        await expect(flood.locator(".flood-warning__message")).not.toHaveCount(0);
      } else if (state === "unavailable") {
        await expect(page.locator('.results-warnings-strip[data-state="warnings"]')).toHaveCount(0);
        await expect(
          page.locator('.results-warnings-strip[data-state="unavailable"]'),
        ).toContainText("could not be checked");
        await expect(flood).toContainText("could not be checked");
      } else {
        // No warning active: no slim line of either form,
        // and the section carries the named no-warning line.
        await expect(page.locator(".results-warnings-strip")).toHaveCount(0);
        await expect(flood).toContainText("No flood warning in force");
      }
    },
  );

  test(
    "the D77(a) calibration pair renders in its settled form (Birkdale)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await openTab(page, "The Neighbourhood");
      const crime = page.locator('[data-section="crime"]');
      // The pair together, in the D77(a) form that
      // superseded D39's multiple form on the results
      // page (CI #205 fix: this spec still asserted the
      // D39 line and its basis line, neither of which the
      // settled form renders). The local figure is exact
      // — it is the corpus's locked golden; the England
      // figure is pinned in form only, as the D39 spec
      // pinned it: on this excerpted corpus the served
      // England figure is the fixture total's arithmetic
      // on the excerpt (asserted by the golden replay as
      // an identity), and the production pair (51.7
      // against 94.5, about 45% below) is pinned at unit
      // level.
      await expect(crime).toContainText(
        "That's 51.7 recorded crimes for every 1,000 residents here. Across England, the figure is",
      );
      await expect(crime).toContainText(/about \d+% below the England average/);
      await expect(crime).toContainText(
        "Incidents are recorded against nearby streets, not against individual houses.",
      );
    },
  );

  test(
    "air quality & noise: the combined section renders the served publisher bands, day and night (Birkdale)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await openTab(page, "The Neighbourhood");
      // D76 combined the standalone noise section into
      // "Air quality & noise" in The Neighbourhood tab
      // (CI #205 fix: this spec still looked for the old
      // [data-section="noise"]).
      const airNoise = page.locator('[data-section="air-noise"]');
      await expect(airNoise).toContainText("by day");
      await expect(airNoise).toContainText("by night");
    },
  );

  test(
    "the catchment honesty block and the served school deadlines line render as supplied (Birkdale)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      const catchment = page.locator('[data-section="catchment"]');
      await expect(catchment).toContainText("We hold no catchment boundaries");
      await expect(catchment).toContainText("School application deadlines in England:");
      await expect(
        catchment.getByRole("link", { name: "School admissions on GOV.UK" }),
      ).toHaveAttribute("href", "https://www.gov.uk/schools-admissions");
    },
  );

  test(
    "rung 2 at Beaulieu CM1 6ER: the pinned label with the picking index's homes embedded at the head of the page (M7.15B)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM1+6ER");
      await expect(page.locator(".results-header h1")).toHaveText(
        "Postcode area — CM1 6ER, not one exact home",
      );
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      // M7.15B: the embedded picker reads the same union
      // as the rung-1 picker, so Beaulieu's 49 index homes
      // are listed here too — the empty line this spec
      // asserted before the preload is gone by design
      // (CI #215). The empty embedded picker is pinned on
      // CM0 7AA in the next spec.
      await expect(page.locator(".picker__empty-line")).toHaveCount(0);
      await expect(page.locator(".picker__count")).toHaveText("49 addresses");
      await expect(
        page.getByRole("button", { name: "49 George Heard Crescent", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("tab")).toHaveCount(4);
    },
  );

  test(
    "rung 2 at Southminster CM0 7AA: the pinned label with the empty picker embedded at the head of the page",
    { tag: "@regression" },
    async ({ page }) => {
      // CM0 7AA is the neither-source witness: held in the
      // directory fixture, with no sale, certificate or
      // index row in any seeded fixture — its union is
      // empty, so the embedded picker serves the named
      // empty state.
      await page.goto("/search/home?postcode=CM0+7AA");
      await expect(page.locator(".results-header h1")).toHaveText(
        "Postcode area — CM0 7AA, not one exact home",
      );
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".picker__empty-line")).toHaveText(
        "No addresses we can list for this postcode yet.",
      );
      await expect(page.getByRole("tab")).toHaveCount(4);
    },
  );

  test(
    "Cardiff CF11 8AA serves normally: Welsh lines in place, no calibration pair, noise not covered",
    { tag: "@regression" },
    async ({ page }) => {
      // The postcode-level results route directly (the
      // journey's own rung-2 form): Cardiff serves normally
      // through the same page.
      await page.goto("/search/home?postcode=CF11+8AA");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-section="catchment"]')).toContainText(
        "School application deadlines in Wales",
      );
      await openTab(page, "The Neighbourhood");
      await expect(page.locator('[data-section="air-noise"]')).toContainText("not covered");
      const crimeText = await page.locator('[data-section="crime"]').innerText();
      expect(crimeText).toContain("recorded crimes");
      expect(crimeText).not.toContain("England's figure");
      // Wales gating (fold-in workstream 6, gap check
      // extension): A&E and maternity are gated (CQC is
      // England-only); Welsh schools/GP keep serving.
      await openTab(page, "What's Nearby");
      await expect(page.locator('[data-section="hospitals"]')).toContainText(
        "isn't part of this check in Wales",
      );
    },
  );
});
