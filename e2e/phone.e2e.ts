import type { Locator, Page } from "@playwright/test";

import { SHORTLIST_STORAGE_KEY, type ShortlistCard } from "../lib/shortlist";
import { expect, test } from "./fixtures";

// M7.7 E2E (D68) — T-WEB-01's viewport assertions: at
// phone width, nothing scrolls sideways on any page built
// so far, tap targets measure at the kit's 44px, and
// tables take their stacked forms. All Regression — the
// step authors no Smoke, and no Regression spec is
// promoted (D68 clause 7).
//
// The gap check's rulings, as built (founder adopted,
// 17 Nov 2026):
//   R1 — the step text's table clause is discharged at
//   kit level: the kit DataTable's stacked form is proven
//   by e2e/kitchen-sink.e2e.ts's 360px spec, cited here
//   as its witness and not duplicated. This file pins the
//   product side of the position: at 360px no surface in
//   the enumerated set renders a table at all. (The
//   shortlist comparison's shared-label table is
//   desktop-only markup — ShortlistPage swaps it for the
//   block stacking below 48rem — so its phone form is
//   asserted as stacked blocks, not as a table.)
//   R2 — the results tabs' phone form is the WRAP: the
//   tab list wraps, every tab stays visible and tappable,
//   and no tab bar scrolls sideways. A scrolling tab bar
//   and label-shrinking are both rejected in the ruling.
//   R3 — there is no global overflow safety net, here or
//   in the kit: these assertions are the only enforcement
//   of the no-sideways-scroll guarantee, so nothing can
//   mask a block silently cut off.
//   R4 — the surface set is enumerated, never crawled:
//   the landing; the postcode check with its home
//   dropdown (the picker's list, moved there when the
//   picker page was removed, 18 Nov 2026; re-formed as
//   one dropdown by the founder's ruling of 20 Nov 2026);
//   the checking screen; rung-1 results with each of the
//   four tabs opened in turn; rung-2 results with the
//   home dropdown at their head; the rung-3 wider area; the Scotland
//   not-covered results; the unplaced landing (the bare
//   /search redirect); the
//   whole-check failure; /shortlist empty, with one home
//   and with the three-home comparison; the /report
//   holding page; the buy bar's full-shortlist state; and
//   the gift claim flow's form, claimed page and a closed
//   state (M7.13 — its fold-in extends the phone checks
//   over the claim states).
//   (/report and the buy bar are in the set because M7.6
//   landed before this step built — R4's own condition.)
//
// Fold-ins: F1 — one phone viewport, 360×740 (the
// kitchen-sink spec's), the widest reachable state per
// surface, re-asserted after layout-changing interactions
// (each tab opened; the add control tapped at a full
// shortlist). F2 — tap targets measured by bounding box
// over the block set as it now stands: the header's five
// nav links, the postcode input and its submit, the
// home-list rows, the four tabs,
// the buy bar's report and shortlist pills, the
// shortlist cards' Remove buttons and the comparison
// blocks' report buttons, the calculators' five inputs
// and two Calculate buttons (M7.10 G3), and — the
// adopted exception,
// whose element changed when the add-a-4th panel was
// ruled out — the full message's "See your shortlist"
// link, which carries the kit's tap target as invisible
// height under M7.7 (app/globals.css). Inline prose links
// stay exempt, per the kit's standing reading. F3 — the
// postcode input's computed font-size is pinned at 16px,
// so no type-scale change can silently bring back iOS
// focus-zoom. F5 — fixes land at kit level only. F6 —
// the header is asserted once, on the landing; the
// results specs re-assert no-scroll with the shell
// present rather than duplicating the shell assertions.
//
// Measurements carry a half-pixel tolerance (tap
// heights) and a one-pixel tolerance (scroll widths) for
// Chromium's fractional box rounding — a real failure is
// never that small. These specs first execute in CI: the
// local harness has no DATABASE_URL, so the served app
// cannot stand up here (the M7.3 harness discipline).
//
// T-WEB map (M7.15 citation tidy):
//   T-WEB-01 (the full free journey at phone width) —
//   every spec in this file; the describes carry the ID
//   in their names.

const PHONE = { width: 360, height: 740 };

async function expectNoSidewaysScroll(page: Page) {
  // Fonts settle first: a late face swap is the one
  // layout change that can land after first paint.
  await page.evaluate(() => document.fonts.ready);
  const excess = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(excess, "the document must not scroll sideways").toBeLessThanOrEqual(1);
}

async function expectTapTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label}: expected a bounding box`).not.toBeNull();
  expect(box!.height, `${label}: tap target at least 44px tall`).toBeGreaterThanOrEqual(43.5);
}

async function expectInsideViewport(locator: Locator, width: number, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label}: expected a bounding box`).not.toBeNull();
  expect(box!.x, `${label}: starts inside the viewport`).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width, `${label}: ends inside the viewport`).toBeLessThanOrEqual(
    width + 0.5,
  );
}

async function expectNoTable(page: Page) {
  // R1's product-side pin: no unstacked table exists on
  // a phone-width product surface.
  await expect(page.locator("table")).toHaveCount(0);
}

async function searchFromHome(page: Page, text: string) {
  await page.goto("/");
  await page.locator("#postcode").fill(text);
  await page.getByRole("button", { name: "Check this home" }).click();
}

async function pickAndReachResults(page: Page, rowName: string | RegExp) {
  // Picker removed (18 Nov 2026): the postcode check's
  // home list rows are links straight to each home.
  await page.getByRole("link", { name: rowName }).first().click();
  await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

// The shortlist seeds, in lib/shortlist.ts's pinned shape
// (the same factory discipline as e2e/shortlist.e2e.ts):
// specs seed storage directly rather than clicking
// through three saves.
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
const MINERVA_SEED = specCard({
  id: "r1:KT17 1FH:seed-minerva",
  postcode: "KT17 1FH",
  homeKey: "seed-minerva",
  scopeLabel: "Flat 4, Minerva House, KT17 1FH",
  addressLine: "Flat 4, Minerva House, KT17 1FH",
  lastSale: {
    price: 420000,
    date: "2021-09-03",
    typeLabel: "Flat or maisonette",
    tenureLabel: "Leasehold",
  },
});
const MINERVA_CARD: ShortlistCard = {
  ...MINERVA_SEED,
  comparison: {
    ...MINERVA_SEED.comparison,
    flood: { kind: "line", text: "Rivers & sea: Very low · Surface water: Low" },
    crime: { kind: "line", text: "1,956 crimes" },
  },
};
const WIDER_AREA_CARD = specCard({
  id: "r3:E16",
  postcode: "E16",
  homeKey: null,
  rung: 3,
  scopeLabel: "Wider area — E16, not this exact home",
  addressLine: "Wider area — E16, not this exact home",
  lastSale: null,
  factsLine: "sold prices need an exact postcode • crime counts need an exact postcode",
});

async function seedShortlist(page: Page, cards: ShortlistCard[]) {
  await page.goto("/shortlist");
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
    SHORTLIST_STORAGE_KEY,
    JSON.stringify({ v: 1, cards }),
  ] as const);
}

test.describe("phone-first — 360×740 (T-WEB-01)", () => {
  test.use({ viewport: PHONE });

  test(
    "the landing: nothing scrolls sideways, the header wraps with all five nav links tappable, the postcode input is 16px (F2/F3/F6)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("main h1")).toHaveText(
        "You're not buying a house. You're choosing your family's home.",
      );
      await expectNoSidewaysScroll(page);
      await expectNoTable(page);

      // F6: the shell asserted once, here — the nav wraps
      // (the five links cannot share one row at 360px) and
      // every link is a full-height target inside the
      // viewport.
      const links = page.locator(".site-nav__link");
      await expect(links).toHaveCount(5);
      const tops: number[] = [];
      for (const link of await links.all()) {
        await expectTapTarget(link, "a header nav link");
        await expectInsideViewport(link, PHONE.width, "a header nav link");
        const box = await link.boundingBox();
        tops.push(box!.y);
      }
      expect(
        Math.max(...tops) - Math.min(...tops),
        "the nav wraps to more than one row",
      ).toBeGreaterThanOrEqual(40);

      // F3 + F2 on the journey's first screen: the input
      // computes to 16px (no iOS focus-zoom) and both
      // halves of the box are 44px targets. Below the
      // small breakpoint the box stacks, so both are full
      // width.
      const input = page.locator("#postcode");
      const fontSize = await input.evaluate((element) => getComputedStyle(element).fontSize);
      expect(fontSize, "the postcode input computes to 16px").toBe("16px");
      await expectTapTarget(input, "the postcode input");
      await expectTapTarget(
        page.getByRole("button", { name: "Check this home" }),
        "the landing's submit button",
      );
    },
  );

  test(
    "the home dropdown on the postcode check: one 44px target carrying the postcode's homes, nothing scrolls sideways (F1/F2)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await page.waitForURL("**/search/home?postcode=CM3+2JT");
      const select = page.locator(".picker__select");
      // The dropdown renders inside the results, behind the
      // checking screen's advance — wait for it before
      // measuring (an immediate read races the advance).
      // Since the founder's ruling of 20 Nov 2026 the homes
      // stand as the dropdown's options behind one 44px
      // target, not as a list of rows.
      await expect(select).toBeVisible({ timeout: 30_000 });
      expect(
        await select.locator("option").count(),
        "the dropdown carries the postcode's homes",
      ).toBeGreaterThan(1);
      await expectTapTarget(select, "the home dropdown");
      await expectInsideViewport(select, PHONE.width, "the home dropdown");
      await expectNoSidewaysScroll(page);
      await expectNoTable(page);
    },
  );

  test(
    "the checking screen: nothing scrolls sideways while the check runs, nor on the results it advances to (F1)",
    { tag: "@regression" },
    async ({ page }) => {
      // Hold the brain calls so the screen is observable
      // (the journey spec's own device): group completion
      // waits for the parts' real settlements, paced, and
      // the advance waits for all five groups.
      await page.route("**/api/check/**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        await route.continue();
      });
      await searchFromHome(page, "CM3 2JT");
      await page.waitForURL("**/search/home?postcode=CM3+2JT");
      await page.getByRole("link", { name: "19 Birkdale Rise", exact: true }).click();
      await expect(page.locator(".checking .page-title")).toHaveText("Your check is under way");
      await expect(page.locator(".checking__row")).toHaveCount(5);
      await expectNoSidewaysScroll(page);

      // The longest finding line on the screen — the
      // safety group's, carrying the seeded corpus's crime
      // count — wraps inside the phone's width: the row
      // completes with it and nothing scrolls sideways.
      await expect(
        page.locator('.checking__row[data-row="safety"] .checking__row-state'),
      ).toContainText("recorded crimes in the last 12 months", { timeout: 15_000 });
      await expectNoSidewaysScroll(page);

      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expectNoSidewaysScroll(page);
    },
  );

  test(
    "rung-1 results: the four tabs wrap (R2), every panel opens without sideways scroll, the buy bar's pills are 44px targets (F1/F2)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await pickAndReachResults(page, "19 Birkdale Rise");
      await expectNoSidewaysScroll(page);
      await expectNoTable(page);

      const tabs = page.getByRole("tab");
      await expect(tabs).toHaveCount(4);
      const tops: number[] = [];
      for (const tab of await tabs.all()) {
        await expectTapTarget(tab, "a results tab");
        await expectInsideViewport(tab, PHONE.width, "a results tab");
        const box = await tab.boundingBox();
        tops.push(box!.y);
      }
      // R2's wrap, measured: the four tabs occupy more
      // than one row, and the list itself does not scroll
      // internally — a scrolling tab bar is the sideways
      // pattern the step bans.
      expect(Math.max(...tops) - Math.min(...tops), "the tab list wraps").toBeGreaterThanOrEqual(
        40,
      );
      const listOverflow = await page
        .locator(".tabs__list")
        .evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(listOverflow, "the tab list does not scroll internally").toBeLessThanOrEqual(1);

      // F1: re-assert after each layout-changing
      // interaction — every panel opened in turn.
      for (const name of [
        "Family Checks",
        "The Neighbourhood",
        "Home, Costs & Risks",
        "What's Nearby",
      ]) {
        const tab = page.getByRole("tab", { name });
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await expectNoSidewaysScroll(page);
        await expectNoTable(page);
      }

      // The buy bar (M7.6): both pills measure at the
      // tap target, and the mystery strip rides in the bar.
      const bar = page.locator(".buy-bar");
      await expect(bar).toBeVisible();
      await expect(bar.locator(".buy-bar__mystery")).toContainText("mystery extra");
      await expectTapTarget(bar.locator(".report-btn"), "the buy bar's report button");
      await expectTapTarget(
        bar.locator("[data-shortlist-toggle]"),
        "the buy bar's shortlist toggle",
      );
    },
  );

  test(
    "rung-1 results, the calculators: every input computes to 16px and every input and Calculate button is a 44px target (M7.10 G3, F2/F3)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await pickAndReachResults(page, "19 Birkdale Rise");
      const calculators = page.locator(".calculators");
      await calculators.scrollIntoViewIfNeeded();
      await expect(calculators).toBeVisible();

      // G3: the five labelled inputs render through the
      // kit's field block — 16px text (no iOS focus-zoom)
      // and the 44px tap-target floor on each.
      const inputs = calculators.locator(".field__input");
      await expect(inputs).toHaveCount(5);
      for (const input of await inputs.all()) {
        const fontSize = await input.evaluate((element) => getComputedStyle(element).fontSize);
        expect(fontSize, "a calculator input computes to 16px").toBe("16px");
        await expectTapTarget(input, "a calculator input");
        await expectInsideViewport(input, PHONE.width, "a calculator input");
      }
      await expectTapTarget(
        calculators.getByRole("button", { name: "Calculate monthly payment" }),
        "the mortgage Calculate button",
      );
      await expectTapTarget(
        calculators.getByRole("button", { name: "Calculate stamp duty" }),
        "the stamp duty Calculate button",
      );
      await expectNoSidewaysScroll(page);
      await expectNoTable(page);
    },
  );

  test(
    "rung-2 results: the home dropdown is a 44px target and nothing scrolls sideways (F1/F2)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-head h1")).toHaveText(
        "Postcode area — CM3 2JT, not one exact home",
      );
      const select = page.locator(".picker__select");
      await expect(select).toBeVisible();
      expect(
        await select.locator("option").count(),
        "the home dropdown sits at the head of the page",
      ).toBeGreaterThan(1);
      await expectTapTarget(select, "the home dropdown");
      await expectNoSidewaysScroll(page);
      await expectNoTable(page);
    },
  );

  test(
    "the rung-3 district page: nothing scrolls sideways; no shortlist control in the head and the bridge's input holds its phone form (F2/F3)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search?outward=E16");
      // Held reveal (the wider-area checking screen,
      // 19 Nov 2026): the heading arrives with the results.
      await expect(page.getByRole("heading", { name: "Wider area — E16" })).toHaveText(
        "Wider area — E16",
        { timeout: 30_000 },
      );
      // The district page head carries no shortlist
      // control (founder fix batch, 19 Nov 2026): the
      // sample carries none and the founder flagged it —
      // the bridge is the only forward path on this page.
      await expect(page.locator("[data-shortlist-toggle]")).toHaveCount(0);
      // The bridge replaced the unlock banner as the
      // forward path; its postcode input keeps the 16px
      // phone form. The district page legitimately carries
      // tables (sold types, crime categories, council
      // tax), so the no-table check does not apply here —
      // the tables must fit the screen instead, which the
      // sideways-scroll check below covers.
      const bridgeInput = page.locator(".district-bridge__input");
      const fontSize = await bridgeInput.evaluate((element) => getComputedStyle(element).fontSize);
      expect(fontSize, "the bridge's postcode input computes to 16px").toBe("16px");
      await expectNoSidewaysScroll(page);
    },
  );

  test(
    "the Scotland not-covered results: nothing scrolls sideways, with a second tab opened (F1)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=EH1+1AD");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("h1")).toHaveText("EH1 1AD is in Scotland");
      await expectNoSidewaysScroll(page);
      await page.getByRole("tab", { name: "What's Nearby" }).click();
      await expectNoSidewaysScroll(page);
      await expectNoTable(page);
    },
  );

  test(
    "the unplaced landing (the retired no-location route): nothing scrolls sideways and the hero box is 16px (F3)",
    { tag: "@regression" },
    async ({ page }) => {
      // Since 18 Nov 2026 the bare route redirects to the
      // landing page with the unplaced notice; the F3
      // property (a 16px input, so a phone never zooms)
      // now rides on the landing's hero box.
      await page.goto("/search");
      await page.waitForURL(/\/\?notice=unplaced/);
      await expect(page.locator(".unplaced-notice")).toBeVisible();
      const fontSize = await page
        .locator("#postcode")
        .evaluate((element) => getComputedStyle(element).fontSize);
      expect(fontSize, "the hero box's input computes to 16px").toBe("16px");
      await expectNoSidewaysScroll(page);
      await expectNoTable(page);
    },
  );

  test(
    "the whole-check failure: nothing scrolls sideways (F1)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/failed");
      await expect(page.locator("h1")).toHaveText("Well — that wasn't supposed to happen");
      await expectNoSidewaysScroll(page);
      await expectNoTable(page);
    },
  );

  test(
    "the report door: the holding page for a named home scrolls nowhere sideways (F1)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/report?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE");
      await expect(page.locator("h1")).toHaveText("The detailed report for 19 Birkdale Rise");
      await expect(page.locator(".report-door__card")).toBeVisible();
      await expectNoSidewaysScroll(page);
      await expectNoTable(page);
    },
  );

  test(
    "the shortlist, empty: nothing scrolls sideways (F1)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/shortlist");
      await expect(page.locator(".shortlist-empty")).toBeVisible();
      await expectNoSidewaysScroll(page);
      await expectNoTable(page);
    },
  );

  test(
    "the shortlist with one home: the facts render as one full-width block; its buttons are 44px targets (P2/F2)",
    { tag: "@regression" },
    async ({ page }) => {
      await seedShortlist(page, [BIRKDALE_CARD]);
      await page.goto("/shortlist");
      await expect(page.locator(".shortlist-card")).toHaveCount(1);
      // The phone form: no table — one stacked block.
      await expectNoTable(page);
      const grid = page.locator(".shortlist-compare__grid");
      const column = page.locator(".shortlist-compare__column");
      await expect(column).toHaveCount(1);
      const gridBox = await grid.boundingBox();
      const columnBox = await column.boundingBox();
      expect(gridBox, "the comparison grid has a box").not.toBeNull();
      expect(columnBox, "the home's block has a box").not.toBeNull();
      expect(
        Math.abs(columnBox!.width - gridBox!.width),
        "the block takes the comparison's full width",
      ).toBeLessThanOrEqual(2);
      await expectTapTarget(
        page.getByRole("button", { name: "Remove 19 Birkdale Rise, CM3 2JT" }),
        "the card's Remove button",
      );
      await expectTapTarget(
        page.locator(".shortlist-compare__actions .report-btn"),
        "the block's report button",
      );
      await expectNoSidewaysScroll(page);
    },
  );

  test(
    "the shortlist with three homes: the comparison stacks one block per home, in saved order (P2)",
    { tag: "@regression" },
    async ({ page }) => {
      await seedShortlist(page, [BIRKDALE_CARD, EXETER_CARD, MINERVA_CARD]);
      await page.goto("/shortlist");
      await expect(page.locator(".shortlist-card")).toHaveCount(3);
      await expectNoTable(page);
      await expect(page.locator(".shortlist-compare__address")).toHaveText([
        "19 Birkdale Rise, CM3 2JT",
        "6 Exeter Road, E16 1GN",
        "Flat 4, Minerva House, KT17 1FH",
      ]);
      const columns = page.locator(".shortlist-compare__column");
      await expect(columns).toHaveCount(3);
      const boxes = [];
      for (const column of await columns.all()) boxes.push(await column.boundingBox());
      for (let index = 1; index < boxes.length; index += 1) {
        const previous = boxes[index - 1]!;
        const current = boxes[index]!;
        expect(current.y, "each home's block stacks below the previous one").toBeGreaterThanOrEqual(
          previous.y + previous.height - 1,
        );
        expect(
          Math.abs(current.x - boxes[0]!.x),
          "the blocks share one left edge",
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(current.width - boxes[0]!.width),
          "the blocks share the full width",
        ).toBeLessThanOrEqual(2);
      }
      const reportButtons = page.locator(".shortlist-compare__actions .report-btn");
      await expect(reportButtons).toHaveCount(3);
      for (const button of await reportButtons.all()) {
        await expectTapTarget(button, "a comparison block's report button");
      }
      for (const remove of await page.locator(".remove-btn").all()) {
        await expectTapTarget(remove, "a card's Remove button");
      }
      await expectNoSidewaysScroll(page);
    },
  );

  test(
    "a full shortlist: the message replaces the button in the buy bar, its link is a 44px target, nothing scrolls sideways (F1/F2)",
    { tag: "@regression" },
    async ({ page }) => {
      await seedShortlist(page, [BIRKDALE_CARD, EXETER_CARD, WIDER_AREA_CARD]);
      await page.goto("/search?postcode=KT17+1FH");
      await pickAndReachResults(page, /Flat 4, Minerva House/);
      await page.getByRole("button", { name: "Shortlist this home" }).first().click();

      // The simple message stands where the button was
      // (founder's ruling, 17 Nov 2026) — no panel — and
      // its link, the only way forward from that state,
      // measures at the tap target under its kit
      // treatment (M7.7, F2 as reconciled). Both control
      // places carry it (item 6); the first stands for both.
      const full = page.locator(".shortlist-full-line").first();
      await expect(full).toBeVisible();
      await expect(full).toContainText("Your shortlist is full — it holds 3 homes.");
      await expectTapTarget(
        full.getByRole("link", { name: "See your shortlist" }),
        "the full message's shortlist link",
      );
      await expect(page.locator(".shortlist-panel")).toHaveCount(0);
      await expectNoSidewaysScroll(page);
    },
  );

  test(
    "the gift claim flow (M7.13): the guard form, the claimed page and a closed state — nothing scrolls sideways, the field and buttons are 44px targets",
    { tag: "@regression" },
    async ({ page }) => {
      // The seeded CLAIMED gift's guard screen carries the
      // flow's form (read-only here — nothing is
      // submitted): the email field and the Continue
      // button at phone width.
      await page.goto("/gift/seed-gift-claimed-0000000000000003");
      await expect(
        page.getByRole("heading", { name: "This gift is already claimed" }),
      ).toBeVisible();
      await expectNoSidewaysScroll(page);
      await expectNoTable(page);
      await expectTapTarget(page.getByLabel("Your email address"), "the claim email field");
      await expectTapTarget(
        page.getByRole("button", { name: "Continue" }),
        "the claim Continue button",
      );

      // The dedicated claimed page: the chip, the message
      // and its own postcode search field.
      await page.goto("/gift/seed-gift-claimed-0000000000000003/claimed");
      await expect(
        page.getByRole("heading", { name: "Your free report is claimed" }),
      ).toBeVisible();
      await expect(page.getByText("Gift saved to your email address")).toBeVisible();
      await expectNoSidewaysScroll(page);
      await expectTapTarget(
        page.getByRole("button", { name: "Check this home" }),
        "the claimed page's search button",
      );

      // A closed state: the expired screen and its search
      // block.
      await page.goto("/gift/seed-gift-expired-0000000000000005");
      await expect(page.getByRole("heading", { name: "This gift link has expired" })).toBeVisible();
      await expectNoSidewaysScroll(page);
    },
  );

  test(
    "the report document at phone width: the nine-section report reads without sideways scroll (M8.1)",
    { tag: "@regression" },
    async ({ page }) => {
      // The live report page is door-held until M8.7, so
      // the phone proof stands on the report DOCUMENT:
      // the sample report page renders the identical
      // rpt-* document (the format both render from), and
      // the live renderer is class-parity-pinned to it in
      // tests/report.test.ts. What is asserted here is the
      // format at 360px: no sideways scroll anywhere in a
      // nine-section document with tables, tiles, bar
      // charts and place rows, and every section heading
      // reachable in order. The live page's own phone
      // proof rides with M8.7's unlock, when the door
      // first opens.
      await page.goto("/sample-report");
      await expect(page.locator(".rpt-doc")).toBeVisible();
      const headings = page.locator(".rpt-section .rpt-secHead h2");
      await expect(headings).toHaveCount(10);
      await expect(headings.nth(0)).toHaveText("The short version");
      const expected = [
        "Price & this home",
        "Sold prices nearby",
        "Schools & nurseries",
        // The sample page's Section 4 title, as the Master
        // drew it. The live report carries the format
        // authority's title ("Health, air, noise & crime",
        // v12) — pinned in tests/report.test.ts; the
        // divergence is itemised in the M8.1 record.
        "Health, air & crime",
        "What's nearby",
        "Home, costs & risks",
        "Flood risk",
        "Questions to ask the seller",
        "Sources, notes & disclaimers",
      ];
      for (let i = 0; i < expected.length; i++) {
        await expect(headings.nth(i + 1)).toHaveText(expected[i]);
      }
      await expectNoSidewaysScroll(page);
      // The document's widest furniture at this width:
      // the stat tiles, a data table and the chart cards
      // all stay inside the viewport.
      for (const selector of [".rpt-tiles", ".rpt-doc table", ".rpt-chartCard"]) {
        const element = page.locator(selector).first();
        if ((await element.count()) > 0) {
          await expectInsideViewport(element, PHONE.width, selector);
        }
      }
      await expectNoSidewaysScroll(page);
    },
  );
});

test.describe("phone-first — 480px, the small breakpoint's upper edge (P6)", () => {
  test.use({ viewport: { width: 480, height: 740 } });

  test(
    "rung-1 results at 480px: nothing scrolls sideways, with a second tab opened",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await pickAndReachResults(page, "19 Birkdale Rise");
      await expectNoSidewaysScroll(page);
      await page.getByRole("tab", { name: "Home, Costs & Risks" }).click();
      await expectNoSidewaysScroll(page);
      await expectNoTable(page);
    },
  );

  test(
    "the three-home comparison at 480px: the blocks still stack and nothing scrolls sideways",
    { tag: "@regression" },
    async ({ page }) => {
      await seedShortlist(page, [BIRKDALE_CARD, EXETER_CARD, MINERVA_CARD]);
      await page.goto("/shortlist");
      await expect(page.locator(".shortlist-compare__column")).toHaveCount(3);
      // 480px is still below the desktop breakpoint: the
      // block form, not the table.
      await expectNoTable(page);
      const boxes = [];
      for (const column of await page.locator(".shortlist-compare__column").all()) {
        boxes.push(await column.boundingBox());
      }
      for (let index = 1; index < boxes.length; index += 1) {
        expect(boxes[index]!.y).toBeGreaterThanOrEqual(
          boxes[index - 1]!.y + boxes[index - 1]!.height - 1,
        );
      }
      await expectNoSidewaysScroll(page);
    },
  );
});
