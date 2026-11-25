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
// pair, the noise states, the retired catchment block's
// absence (FC-06), rung 2's label with the home list at its head,
// and the nations. No Regression spec is promoted to
// Smoke (D68 clause 7).
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
//
// T-WEB map (M7.15 citation tidy):
//   No T-WEB row directly — the three Smoke specs are the
//   results leg of D68's critical journey, and the
//   Regression specs discharge M7.4's own adopted scope
//   (the district page's form, refresh/Back, flood
//   warnings, the crime guard, air & noise, the retired
//   catchment block's absence, the rung-2 labels, Cardiff).

const DISCLAIMER_SHORT_FORM =
  "We present official data as it is published, with its source and date. We do not score, rate or recommend homes or areas.";

async function searchFromHome(page: Page, text: string) {
  await page.goto("/");
  await page.locator("#postcode").fill(text);
  // Fidelity pass 2: the landing's bare box carries the
  // sample's Brass button, "Check this home".
  await page.getByRole("button", { name: "Check this home" }).click();
}

async function reachResults(page: Page, postcode: string, rowName: string) {
  // Picker removed (18 Nov 2026): the submit lands on the
  // whole-postcode check; its home dropdown carries the
  // postcode's homes (founder ruling, 20 Nov 2026 — the
  // list dump is gone), and choosing one goes straight
  // to that home's check.
  await page.waitForURL(`**/search/home?postcode=${postcode.replace(" ", "+")}`);
  await page.locator(".picker__trigger").click();
  await page.locator(".picker__panel").getByRole("option", { name: rowName }).click();
  await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

async function openTab(page: Page, name: string) {
  await page.getByRole("tab", { name }).click();
}

test.describe("results page — smoke", () => {
  test(
    "Birkdale CM3 2JT: four tabs (D76), the D75 pills, the D9 form",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await reachResults(page, "CM3 2JT", "19 Birkdale Rise");

      // The D75 summary strip on the served corpus: the
      // only concerning fact is Schools (secondary 1.9 mi).
      // On a full England base the strip reads Schools ·
      // Flood · Crime · Noise · Deprivation (the sample's
      // worked example) — but this seeded corpus's England
      // base is thin, so the item-9 guard (parity fix
      // batch) withholds the England figure, and with no
      // England figure no Crime pill serves at all (item
      // 8's unit pins). The good facts then fill in D75
      // priority order — Flood, Air quality, Noise,
      // Deprivation, and EPC: this home's matched
      // certificate is band B, which is a good fact (the
      // unit suite's pill fixtures carry headlineBand C,
      // a "neither", which is why the unit pins never show
      // the EPC pill; the seeded corpus's band is B). The
      // air pill sits immediately after Crime in D75
      // priority order (founder ruling 25 Nov 2026,
      // UK-limit-only), so with Crime absent it follows
      // Flood — and the strip holds five, so EPC is
      // displaced. The strip here is therefore five pills:
      // Schools · Flood · Air quality · Noise ·
      // Deprivation. (CI #220 never observed the
      // count — it failed at nth(2) on the absent Crime
      // pill; the four-pill form pinned in the #220 fix
      // round was an inference from those unit fixtures,
      // corrected at CI #221 — the strip was five in both
      // runs, deterministically: every input is filed by
      // the seed before the server starts.)
      const pills = page.locator(".results-strip .pill--summary");
      await expect(pills).toHaveCount(5);
      await expect(pills.nth(0)).toContainText("Schools");
      await expect(pills.nth(0).locator(".pill__figure")).toHaveText("0.3 / 1.9 mi");
      await expect(pills.nth(1)).toContainText("Flood");
      await expect(pills.nth(1)).toContainText("Very low");
      await expect(pills.nth(2)).toContainText("Air quality");
      await expect(pills.nth(2).locator(".pill__figure")).toHaveText("Well within UK legal limits");
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

      // The Neighbourhood: crime. On a full England base
      // this serves the D77(a) percentage form with the
      // calibration pair beneath (the production pair —
      // 51.7 against 94.5, about 45% below — is pinned at
      // unit level). This seeded corpus's England base is
      // thin, so the item-9 guard (parity fix batch)
      // withholds the England figure and the section
      // serves the brain's local facts alone: the total
      // line and the window line, with no England
      // comparison anywhere.
      await openTab(page, "The Neighbourhood");
      const crime = page.locator('[data-section="crime"]');
      await expect(crime).toContainText(
        "330 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
      );
      await expect(crime).not.toContainText("England average");
      await expect(crime).not.toContainText("Across England");

      // What's Nearby: nearest 1 of each kind.
      await openTab(page, "What's Nearby");
      await expect(page.locator('[data-section="parks"] .place-row')).not.toHaveCount(0);

      // Home, Costs & Risks: the golden sold figures, and
      // Costs carrying council tax and broadband together.
      await openTab(page, "Home, Costs & Risks");
      await expect(page.locator('[data-section="sold-prices"]')).toContainText("£588,995");
      await expect(page.locator('[data-section="costs"]')).toContainText("£2,280.34");
      await expect(page.locator('[data-section="costs"]')).toContainText("£190.03 a month");
      await expect(page.locator('[data-section="costs"]')).toContainText("Gigabit");
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
      await reachResults(page, "KT17 1FH", "Flat 4, Minerva House, 12 Ceres Crescent");
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
    "the rung-3 district page: scope label, district sections in the four tabs, the crime honest line, no report, no upsell",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "E16");
      await page.waitForURL("**/search?outward=E16");
      // Held reveal (the wider-area checking screen,
      // 19 Nov 2026): the heading arrives with the results.
      await expect(page.getByRole("heading", { name: "Wider area — E16" })).toHaveText(
        "Wider area — E16",
        { timeout: 30_000 },
      );
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("tab")).toHaveCount(4);
      await expect(page.locator(".results-scope-line")).toContainText("district as a whole");
      // Crime at district grain serves its own honest line
      // (founder ruling, 18 Nov 2026): no district total
      // exists that does not double-count the per-postcode
      // 1-mile circles — the old rung-3 refusal wording is
      // gone from the page whole.
      await expect(page.locator('[data-section="crime"]')).toContainText(
        "no district crime total that does not double-count",
      );
      await openTab(page, "Home, Costs & Risks");
      await expect(page.locator('[data-section="flood"]')).toContainText(
        /District shares describe the district|flood maps are not filed/,
      );
      // The district median serves in the district's own
      // form, under its own caption.
      await expect(page.locator('[data-section="sold-prices"]')).toContainText(
        "The district median across E16 as a whole — it does not value any one home.",
      );
      const body = await page.locator("main").innerText();
      // The seeded home's own sale price never appears —
      // the district's figures are the district's own. The
      // district median is pinned in its own form above,
      // never banned by value: over the seeded corpus the
      // E16 district median legitimately computes to the
      // same £310,000 as one postcode's median (CI #225).
      expect(body).not.toContain("£270,000");
      expect(body).not.toContain("£4.99");
      expect(body).not.toContain("need an exact postcode");
      expect(body).not.toContain("needs an exact postcode");
      // No report link in any form — the bare route or the
      // M7.6 contract form (href^= catches both) — and no
      // upsell furniture anywhere at rung 3.
      await expect(page.locator('a[href^="/report"]')).toHaveCount(0);
      await expect(page.locator(".results-strip")).toHaveCount(0);
      await expect(page.locator(".buy-bar")).toHaveCount(0);
      await expect(page.locator(".unlock-banner")).toHaveCount(0);
      // The bridge is the page's only forward path.
      await expect(page.locator(".district-bridge__heading")).toHaveText(
        "Checking one home in E16?",
      );
    },
  );

  test(
    "refresh restores the same check, and Back returns to the postcode check with its home list",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await reachResults(page, "CM3 2JT", "19 Birkdale Rise");
      await page.reload();
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-section="crime"]')).toContainText(
        "330 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
      );
      await page.goBack();
      await page.waitForURL(/\/search\/home\?postcode=CM3\+2JT$/);
      await page.locator(".picker__trigger").click();
      await expect(
        page.locator(".picker__panel").getByRole("option", { name: "19 Birkdale Rise" }),
      ).toBeAttached();
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
        await expect(flood).toContainText(
          "No live flood warnings are in force for this area just now.",
        );
      }
    },
  );

  test(
    "crime under the item-9 guard: the local facts serve without the England figure (Birkdale)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await openTab(page, "The Neighbourhood");
      const crime = page.locator('[data-section="crime"]');
      // The D77(a) form — the percentage line with the
      // calibration pair beneath — serves only when the
      // filed England base clears the credibility floor
      // (ENGLAND_BASE_MIN_RESIDENTS; the parity fix
      // batch's item 9 guard). This seeded corpus's base
      // is the excerpt's thin base, so the guard withholds
      // the England figure and the section serves the
      // brain's local facts alone: the total line and the
      // window line — no percentage, no pair, no
      // incidents line (all three render only with the
      // England figure). The production pair (51.7 against
      // 94.5, about 45% below) remains pinned at unit
      // level (tests/results.test.ts).
      await expect(crime).toContainText(
        "330 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
      );
      await expect(crime).not.toContainText("Across England");
      await expect(crime).not.toContainText(/about \d+% (below|above) the England average/);
      await expect(crime).not.toContainText(
        "Incidents are recorded against nearby streets, not against individual houses.",
      );
    },
  );

  test(
    "air quality & noise: the combined section renders the Master's single noise line (Birkdale)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await openTab(page, "The Neighbourhood");
      // D76 combined the standalone noise section into
      // "Air quality & noise" in The Neighbourhood tab
      // (CI #205 fix: this spec still looked for the old
      // [data-section="noise"]). Item 24 (parity fix
      // batch): the noise serves as the Master's single
      // joined line — "Road noise day below 55 dB and
      // night below 50 dB" — with the Defra fineprint,
      // not the brain's per-band "by day / by night"
      // lines.
      const airNoise = page.locator('[data-section="air-noise"]');
      await expect(airNoise).toContainText("Road noise day below 55 dB and night below 50 dB");
      await expect(airNoise).toContainText("Defra modelled bands.");
      await expect(airNoise).not.toContainText("by day");
    },
  );

  test(
    "the catchment block is retired (FC-06): its substance stands in the closing disclaimer alone (Birkdale)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      // FC-06 (BUG-154): no catchment section stands on
      // the Family tab — the closing disclaimer is the
      // single statement of the catchment and deadline
      // substance.
      await expect(page.locator('[data-section="catchment"]')).toHaveCount(0);
      await expect(page.locator(".results-disclaimer-closing")).toContainText(
        "School places are never promised and catchments are not guaranteed",
      );
      await expect(page.locator(".results-disclaimer-closing")).toContainText(
        "apply by 31 Oct (secondary) / 15 Jan (primary)",
      );
    },
  );

  test(
    "rung 2 at Beaulieu CM1 6ER: the pinned label with the picking index's homes in the dropdown at the head of the page (M7.15B)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM1+6ER");
      await expect(page.locator(".results-head h1")).toHaveText(
        "Postcode area — CM1 6ER, not one exact home",
      );
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      // M7.15B: the home picker on the postcode check reads
      // the same union the picker read, so Beaulieu's 49
      // index homes stand here — the empty line this spec
      // asserted before the preload is gone by design
      // (CI #215). Since the founder's ruling of 20 Nov
      // 2026 they stand as the dropdown's rows (49 homes;
      // BUG-185: the custom dropdown's panel carries the
      // homes alone — the prompt lives on its closed
      // field), and the count line is gone with the list
      // dump. The empty list is pinned on
      // CM0 7AA in the next spec.
      await expect(page.locator(".picker__empty-line")).toHaveCount(0);
      await expect(page.locator(".picker__count")).toHaveCount(0);
      await page.locator(".picker__trigger").click();
      await expect(page.locator(".picker__panel .suggest__item")).toHaveCount(49);
      await expect(
        page.locator(".picker__panel").getByRole("option", { name: "49 George Heard Crescent" }),
      ).toBeAttached();
      await expect(page.getByRole("tab")).toHaveCount(4);
    },
  );

  test(
    "rung 2 at Southminster CM0 7AA: the pinned label with the empty home list at the head of the page",
    { tag: "@regression" },
    async ({ page }) => {
      // CM0 7AA is the neither-source witness: held in the
      // directory fixture, with no sale, certificate or
      // index row in any seeded fixture — its union is
      // empty, so the home list serves the named empty
      // state. Its results derivation settles from
      // filed data alone because the seed files its
      // sold-prices load stamp (loaded, none recorded —
      // the state a production postcode reaches after its
      // first check): an unstamped covered postcode would
      // be cold-loaded on this first check (D23), and the
      // live load streams the full Price Paid file, which
      // no assertion window can wait out (CI #216).
      await page.goto("/search/home?postcode=CM0+7AA");
      await expect(page.locator(".results-head h1")).toHaveText(
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
      // FC-06 (BUG-154): the catchment block is retired
      // in Wales too — no catchment section stands.
      await expect(page.locator('[data-section="catchment"]')).toHaveCount(0);
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
