import type { Page } from "@playwright/test";

import { SHORTLIST_STORAGE_KEY, type ShortlistCard } from "../lib/shortlist";
import { expect, test } from "./fixtures";

// The visual guard (founder-approved step, 19 Nov 2026,
// built after the combined fix batch, before M8.2).
//
// Why it exists: every gate this repo runs tests words
// and data, never pixels — 2,215 tests passed while the
// checking screen rendered on the wrong background
// (BUG-001). These specs photograph the served pages and
// hold the photographs: a look change that nobody
// approved fails the run.
//
// The shape (the founder's ruling, 19 Nov 2026):
//   - Baselines are Playwright snapshots, committed
//     under e2e/visual.e2e.ts-snapshots/. They are
//     captured from the CI browser job's own rendering —
//     the harness cannot stand in a local sandbox (no
//     DATABASE_URL; the M7.3 discipline every spec file
//     here records), and a photograph taken anywhere
//     else would not be the gate's own truth.
//   - The CORE set below is authored @smoke: it runs on
//     every push inside the browser gate, and nothing
//     deploys unless it is green. The remainder is
//     authored @regression and runs in the scheduled
//     cadence (nightly Smoke, weekly Regression). These
//     are authored tags, not promotions (D68 clause 7
//     governs promoting specs authored as Regression).
//   - The baselines landed 20 Nov 2026, captured by
//     the "Visual baseline capture" workflow's first
//     run against the verified pages and committed as
//     .b64 sources under e2e/visual.e2e.ts-snapshots/
//     (they decode at setup — see
//     e2e/materialise-snapshots.mjs). Until they landed,
//     every spec in this file was staged @regression so
//     the push gate never met a screenshot spec with no
//     committed baseline; the core set's tags flipped
//     to @smoke in the commit that completed the set.
//   - A baseline is re-approved DELIBERATELY, never
//     automatically: no run updates snapshots; a look
//     change lands by re-capturing in CI and committing
//     the new photographs as its own reviewed act.
//
// Determinism, per state:
//   - The seeded golden corpus only (the harness's own
//     data); specs assert the corpus's served truths
//     before photographing, in the house idiom.
//   - Fonts settle (document.fonts.ready) and images
//     complete before every shot; CSS animations are
//     disabled by the screenshot itself, so spinners and
//     pulses freeze at a fixed frame.
//   - The checking screen is pinned at a settled beat by
//     holding ONE check part at the network (below) —
//     never by waiting a hopeful interval.
//   - The one genuinely live region on a photographed
//     page — the flood-warnings line, composed fresh
//     from the Environment Agency feed at serve time
//     (D42, never filed) — is MASKED, and only when it
//     is present (see shoot()). Masking is the
//     screenshot's own mechanism; no product code hides
//     anything for these specs.
//   - The sample report's Report date is the harness's
//     pinned day, not the serving day: the sample is a
//     real generated report (BUG-159), so unpinned its
//     masthead date rots the photograph daily (CI #308).
//     playwright.config.ts sets SAMPLE_REPORT_NOW to
//     the baselines' capture day (22 Nov 2026); the
//     page is otherwise photographed and asserted whole.
//   - Full-page photographs where the page is the unit
//     (landing, district, place, shortlist, gift, error,
//     the content pages, the checking screen — one
//     screen by design, taller than one viewport);
//     viewport photographs where the state lives at the
//     head of a very long page (the two suggestion
//     states, the sample report — whose section ORDER
//     is guarded harder by e2e/look.e2e.ts).
//
// These specs first execute in CI, like every spec in
// this harness.

const PHONE = { width: 360, height: 740 };

const GIFT_ISSUED = "seed-gift-issued-one-0000000000001";
const GIFT_CLAIMED = "seed-gift-claimed-0000000000000003";
const GIFT_EXPIRED = "seed-gift-expired-0000000000000005";

// Fonts and images settle before a photograph: a late
// face swap or a still-loading image is the one layout
// change that can land after first paint (the phone
// specs' standing observation).
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
      ),
    ),
  );
}

// One photograph. The flood-warnings line is the only
// live-data region on any photographed page (composed
// from the EA feed at serve time, so its text is the
// day's weather, not the build's look): it is masked
// when — and only when — the page actually serves it.
async function shoot(page: Page, name: string, fullPage: boolean) {
  await settle(page);
  const warnings = page.locator(".flood-warnings");
  const mask = (await warnings.count()) > 0 ? [warnings] : [];
  await expect(page).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    fullPage,
    mask,
  });
}

async function searchFromHome(page: Page, text: string) {
  await page.goto("/");
  await page.locator("#postcode").fill(text);
  await page.getByRole("button", { name: "Check this home" }).click();
}

// The single-home results (rung 1): the journey the
// results specs walk — submit the postcode, then pick
// the home from the whole-postcode page's dropdown
// (founder ruling, 20 Nov 2026 — the list dump is gone).
async function openHomeResults(page: Page) {
  await searchFromHome(page, "CM3 2JT");
  await page.waitForURL("**/search/home?postcode=CM3+2JT");
  await page.locator(".picker__select").selectOption({ label: "19 Birkdale Rise" });
  await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

// The whole-postcode results (rung 2): the submit lands
// on the check page, the home dropdown at its head.
async function openAreaResults(page: Page) {
  await page.goto("/search?postcode=CM3+2JT");
  await page.waitForURL("**/search/home?postcode=CM3+2JT");
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

async function openDistrict(page: Page) {
  await page.goto("/search?outward=CM3");
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
  // The wider-area checking screen has fully handed
  // over (the journey specs' reveal form).
  await expect(page.locator('section[aria-label="Checking the wider area"]')).toHaveCount(0);
}

// The checking screen, pinned at a settled beat. The
// screen's five groups complete in row order, each gated
// on its own parts (lib/journey.ts's assembly): schools
// and health read the nearby part; costs and history
// read area alone; safety — last in the feed since
// BUG-144 — reads flood AND crime. Holding the area part
// at the network therefore freezes the screen at one
// exact, data-derived beat forever: two groups complete
// with their finding lines, costs the active row,
// history and safety waiting, the seal at two of five
// segments and the step line reading "2 of 5". Nothing
// on the screen can move from there — the timer is the
// floor, the data is the gate, and the data never
// comes. (The BUG-033 spec's held-response mechanism,
// held for the whole test instead of released: the
// browser context closes with the request still
// pending.)
async function reachHeldCheckingScreen(page: Page) {
  await page.route(
    /\/api\/check\/area\?/,
    () =>
      new Promise<never>(() => {
        // Held open on purpose: this promise never
        // settles, so the area part never lands.
      }),
  );
  await page.goto("/search/home?postcode=CM3+2JT");
  await expect(page.locator('[data-row="costs"]')).toHaveAttribute("data-state", "active", {
    timeout: 30_000,
  });
  await expect(page.locator(".checking__stepline b")).toHaveText("2 of 5");
  await expect(page.locator('.checking__seal-seg[data-on="true"]')).toHaveCount(2);
}

// The shortlist cards, in the pinned storage shape —
// the shortlist specs' own factory and golden pair,
// copied so this file seeds exactly what they seed.
function specCard(overrides: Partial<ShortlistCard> & { id: string }): ShortlistCard {
  const line = (text: string): ShortlistCard["comparison"]["primary"] => ({ kind: "line", text });
  return {
    postcode: "CM3 2JT",
    homeKey: "key",
    rung: 1,
    scopeLabel: "19 Birkdale Rise, CM3 2JT",
    addressLine: "19 Birkdale Rise, CM3 2JT",
    lastSale: {
      price: 588995,
      date: "2023-06-15",
      typeLabel: "Detached",
      tenureLabel: "Freehold",
    },
    factsLine: "Nearest primary 0.4 mi • Chelmsford 2.3 mi",
    savedAt: "2026-11-17T08:00:00.000Z",
    comparison: {
      primary: { kind: "distance", name: "Birkdale Primary School", miles: 0.42 },
      secondary: { kind: "distance", name: "The Boswells School", miles: 1.1 },
      grammar: line("No — none in Braintree"),
      nursery: line("no nursery filed near"),
      flood: { kind: "pointer" },
      crime: { kind: "pointer" },
      air: line("NO2 8.15 µg/m³ a year · PM2.5 7.12 µg/m³ · PM10 12.55 µg/m³"),
      gp: { kind: "distance", name: "Birkdale Surgery", miles: 1.9 },
      ae: { kind: "distance", name: "Broomfield Hospital", miles: 5.89 },
      station: { kind: "distance", name: "Chelmsford", miles: 2.31 },
      vet: { kind: "distance", name: "Birkdale Vets", miles: 0.87 },
      councilTax: line("Band D averages £2,280.36 a year"),
    },
    ...overrides,
  };
}

const BIRKDALE_CARD = specCard({ id: "r1:CM3 2JT:seed-birkdale" });
const EXETER_CARD = specCard({
  id: "r1:E16 1GN:seed-exeter",
  postcode: "E16 1GN",
  homeKey: "seed-exeter",
  scopeLabel: "6 Exeter Road, E16 1GN",
  addressLine: "6 Exeter Road, E16 1GN",
  lastSale: {
    price: 270000,
    date: "2014-01-20",
    typeLabel: "Flat or maisonette",
    tenureLabel: "Leasehold",
  },
});

async function seedShortlist(page: Page, cards: ShortlistCard[]) {
  await page.goto("/shortlist");
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
    SHORTLIST_STORAGE_KEY,
    JSON.stringify({ v: 1, cards }),
  ] as const);
  await page.reload();
  await expect(page.getByText("19 Birkdale Rise, CM3 2JT").first()).toBeVisible();
}

test.describe("visual guard — core set", () => {
  test("landing, desktop", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#postcode")).toBeVisible();
    await shoot(page, "landing.png", true);
  });

  test("landing, phone", { tag: "@smoke" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await expect(page.locator("#postcode")).toBeVisible();
    await shoot(page, "landing-phone.png", true);
  });

  test(
    "landing with suggestions open: the Districts group under the typed district (BUG-009), desktop",
    { tag: "@smoke" },
    async ({ page }) => {
      await page.goto("/");
      const box = page.locator("#postcode");
      await box.fill("CM3");
      const panel = page.locator("#postcode-suggestions");
      await expect(panel.getByRole("option", { name: "CM3 — the wider area" })).toBeVisible();
      await shoot(page, "landing-suggestions-districts.png", false);
    },
  );

  test(
    "landing with the no-suggestions line settled (BUG-008), desktop",
    { tag: "@smoke" },
    async ({ page }) => {
      await page.goto("/");
      const box = page.locator("#postcode");
      await box.fill("xqzww");
      const panel = page.locator("#postcode-suggestions");
      await expect(panel.locator(".suggest__empty")).toHaveText(
        "No suggestions for that — check the spelling, or use the button to search anyway.",
      );
      await shoot(page, "landing-no-suggestions.png", false);
    },
  );

  test("checking screen at its held beat, desktop", { tag: "@smoke" }, async ({ page }) => {
    await reachHeldCheckingScreen(page);
    await shoot(page, "checking-held.png", true);
  });

  test("whole-postcode results for CM3 2JT, desktop", { tag: "@smoke" }, async ({ page }) => {
    await openAreaResults(page);
    await shoot(page, "results-area.png", true);
  });

  test("whole-postcode results for CM3 2JT, phone", { tag: "@smoke" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openAreaResults(page);
    await shoot(page, "results-area-phone.png", false);
  });

  test("19 Birkdale Rise's own results, desktop", { tag: "@smoke" }, async ({ page }) => {
    await openHomeResults(page);
    await shoot(page, "results-home.png", true);
  });

  test("19 Birkdale Rise's own results, phone", { tag: "@smoke" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openHomeResults(page);
    await shoot(page, "results-home-phone.png", false);
  });

  test("the CM3 district page, desktop", { tag: "@smoke" }, async ({ page }) => {
    await openDistrict(page);
    await shoot(page, "district.png", true);
  });

  test("the Chelmsford place page, desktop", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/search?place=Chelmsford");
    // WA-10: the place page wears Sample 29's dress —
    // its rows list is the readiness marker now.
    await expect(page.locator(".district-place__list")).toBeVisible();
    await shoot(page, "place.png", true);
  });

  test("the shortlist with two saved homes, desktop", { tag: "@smoke" }, async ({ page }) => {
    await seedShortlist(page, [BIRKDALE_CARD, EXETER_CARD]);
    await shoot(page, "shortlist-populated.png", true);
  });

  test("the error page, desktop", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/no-such-page-here");
    await expect(page.locator("h1")).toHaveText("Well — that wasn't supposed to happen");
    await shoot(page, "error.png", true);
  });

  test("the sample report's head, desktop", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/sample-report");
    await expect(page.locator(".rpt-section").first()).toBeVisible();
    await shoot(page, "sample-report.png", false);
  });

  test("How we check, desktop", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/how-we-check");
    await expect(page.locator("h1")).toBeVisible();
    await shoot(page, "how-we-check.png", true);
  });
});

test.describe("visual guard — regression", () => {
  test("checking screen at its held beat, phone", { tag: "@regression" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await reachHeldCheckingScreen(page);
    await shoot(page, "checking-held-phone.png", true);
  });

  test(
    "landing with suggestions open: the Districts group, phone",
    { tag: "@regression" },
    async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto("/");
      const box = page.locator("#postcode");
      await box.fill("CM3");
      const panel = page.locator("#postcode-suggestions");
      await expect(panel.getByRole("option", { name: "CM3 — the wider area" })).toBeVisible();
      await shoot(page, "landing-suggestions-districts-phone.png", false);
    },
  );

  test("the CM3 district page, phone", { tag: "@regression" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openDistrict(page);
    await shoot(page, "district-phone.png", false);
  });

  test("the Chelmsford place page, phone", { tag: "@regression" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/search?place=Chelmsford");
    // WA-10: the place page wears Sample 29's dress —
    // its rows list is the readiness marker now.
    await expect(page.locator(".district-place__list")).toBeVisible();
    await shoot(page, "place-phone.png", true);
  });

  test(
    "the shortlist before anything is saved, desktop",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/shortlist");
      await expect(page.locator("h1")).toBeVisible();
      await shoot(page, "shortlist-empty.png", true);
    },
  );

  test(
    "the shortlist before anything is saved, phone",
    { tag: "@regression" },
    async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto("/shortlist");
      await expect(page.locator("h1")).toBeVisible();
      await shoot(page, "shortlist-empty-phone.png", true);
    },
  );

  test("the shortlist with two saved homes, phone", { tag: "@regression" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seedShortlist(page, [BIRKDALE_CARD, EXETER_CARD]);
    await shoot(page, "shortlist-populated-phone.png", true);
  });

  test("the error page, phone", { tag: "@regression" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/no-such-page-here");
    await expect(page.locator("h1")).toHaveText("Well — that wasn't supposed to happen");
    await shoot(page, "error-phone.png", true);
  });

  test("the sample report's head, phone", { tag: "@regression" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/sample-report");
    await expect(page.locator(".rpt-section").first()).toBeVisible();
    await shoot(page, "sample-report-phone.png", false);
  });

  test("How we check, phone", { tag: "@regression" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/how-we-check");
    await expect(page.locator("h1")).toBeVisible();
    await shoot(page, "how-we-check-phone.png", true);
  });

  test("About, desktop", { tag: "@regression" }, async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator("h1")).toBeVisible();
    await shoot(page, "about.png", true);
  });

  test("About, phone", { tag: "@regression" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/about");
    await expect(page.locator("h1")).toBeVisible();
    await shoot(page, "about-phone.png", true);
  });

  test("Contact, desktop", { tag: "@regression" }, async ({ page }) => {
    await page.goto("/contact");
    await expect(page.locator("h1")).toBeVisible();
    await shoot(page, "contact.png", true);
  });

  test("Contact, phone", { tag: "@regression" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/contact");
    await expect(page.locator("h1")).toBeVisible();
    await shoot(page, "contact-phone.png", true);
  });

  test("Privacy, desktop", { tag: "@regression" }, async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("h1")).toBeVisible();
    await shoot(page, "privacy.png", true);
  });

  test("Privacy, phone", { tag: "@regression" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/privacy");
    await expect(page.locator("h1")).toBeVisible();
    await shoot(page, "privacy-phone.png", true);
  });

  test(
    "the gift claim form on an issued gift, desktop",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto(`/gift/${GIFT_ISSUED}`);
      await expect(page.getByRole("button", { name: "Claim my free report" })).toBeVisible();
      await shoot(page, "gift-claim-form.png", true);
    },
  );

  test("the gift claim form on an issued gift, phone", { tag: "@regression" }, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`/gift/${GIFT_ISSUED}`);
    await expect(page.getByRole("button", { name: "Claim my free report" })).toBeVisible();
    await shoot(page, "gift-claim-form-phone.png", true);
  });

  test("a gift already claimed, desktop", { tag: "@regression" }, async ({ page }) => {
    await page.goto(`/gift/${GIFT_CLAIMED}`);
    await expect(page.getByRole("heading", { name: "This gift is already claimed" })).toBeVisible();
    await shoot(page, "gift-claimed.png", true);
  });

  test("a gift link expired, desktop", { tag: "@regression" }, async ({ page }) => {
    await page.goto(`/gift/${GIFT_EXPIRED}`);
    await expect(page.getByRole("heading", { name: "This gift link has expired" })).toBeVisible();
    await shoot(page, "gift-expired.png", true);
  });

  test("the report door's payment page, desktop", { tag: "@regression" }, async ({ page }) => {
    await page.goto("/report");
    await expect(page.locator("h1")).toBeVisible();
    await shoot(page, "report-door.png", true);
  });

  test(
    "the landing carrying the unplaced notice, desktop",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/?notice=unplaced");
      await expect(page.locator(".unplaced-notice")).toBeVisible();
      await shoot(page, "landing-unplaced.png", false);
    },
  );
});
