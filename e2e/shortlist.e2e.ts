import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Page } from "@playwright/test";

import { SHORTLIST_STORAGE_KEY, type ShortlistCard } from "../lib/shortlist";
import { expect, test } from "./fixtures";

// M7.5 E2E (D68) — the shortlist against the SERVED app +
// the seeded golden corpus.
//
// Smoke: T-WEB-04 exactly as authored — a home added to the
// shortlist is still there after the browser restarts, and
// absent in a second browser context. The restart half uses
// a persistent Chromium context relaunched on the same
// profile directory (a real browser restart: the process
// and context close, the profile — and its localStorage —
// persists); the absence half uses the fixture page, a
// separate context whose storage is its own.
//
// Regression: the five authored behaviours (remove; the
// headline comparison side by side with no winner declared;
// the add-a-4th panel's remove-one or £4.99-report choice;
// the rung-3 card with wider-area facts under the scope
// label counting toward the 3; the storage-unavailable
// named line) plus the gap check's two adopted additions
// (the header count updating after add/remove without a
// manual reload; the empty state on a fresh context). Where
// a spec needs a full list it seeds storage directly with
// records in the pinned shape (lib/shortlist.ts) rather
// than clicking through three saves. No promotions to Smoke
// (D68 clause 7).

const BASE_URL = "http://127.0.0.1:4173";

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

async function reachResults(page: Page, postcode: string, rowName: string | RegExp) {
  await page.goto(`/search?postcode=${postcode.replace(" ", "+")}`);
  // D70 R6: the picker is select-then-confirm.
  await page.getByRole("button", { name: rowName }).first().click();
  await page.getByRole("button", { name: "Check this address" }).click();
  await page.waitForURL(/\/search\/home\?postcode=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

test.describe("shortlist — smoke", () => {
  test(
    "T-WEB-04: a saved home survives a browser restart, and is absent in a second context",
    { tag: "@smoke" },
    async ({ page }) => {
      const profileDir = mkdtempSync(join(process.cwd(), "test-results", "shortlist-profile-"));
      const launch = () =>
        chromium.launchPersistentContext(profileDir, {
          baseURL: BASE_URL,
          viewport: { width: 1280, height: 800 },
        });
      try {
        let context = await launch();
        let persistent = context.pages()[0] ?? (await context.newPage());
        await persistent.goto("/search?postcode=CM3+2JT");
        await persistent.getByRole("button", { name: "19 Birkdale Rise" }).first().click();
        await persistent.getByRole("button", { name: "Check this address" }).click();
        await persistent.waitForURL(/\/search\/home\?postcode=/);
        await expect(persistent.locator(".results")).toBeVisible({ timeout: 30_000 });
        await persistent.getByRole("button", { name: "Shortlist this home" }).click();
        await expect(
          persistent.getByRole("button", { name: "Shortlisted — tap to remove" }),
        ).toBeVisible();
        await context.close();

        // The restart: same profile directory, new process.
        context = await launch();
        persistent = context.pages()[0] ?? (await context.newPage());
        await persistent.goto("/shortlist");
        await expect(persistent.locator(".shortlist-card")).toHaveCount(1);
        await expect(persistent.locator(".shortlist-card")).toContainText(
          "19 Birkdale Rise, CM3 2JT",
        );
        await expect(persistent.locator(".shortlist-card")).toContainText("£588,995");
        await context.close();
      } finally {
        rmSync(profileDir, { recursive: true, force: true });
      }

      // The second context: the fixture page's storage is
      // its own — the list does not exist there.
      await page.goto("/shortlist");
      await expect(page.locator(".shortlist-card")).toHaveCount(0);
      await expect(page.locator(".shortlist-empty")).toBeVisible();
    },
  );
});

test.describe("shortlist — regression", () => {
  test(
    "the header count updates after add and remove without a manual reload",
    { tag: "@regression" },
    async ({ page }) => {
      await reachResults(page, "CM3 2JT", "19 Birkdale Rise");
      await expect(page.locator(".shortlist-count")).toHaveCount(0);
      await page.getByRole("button", { name: "Shortlist this home" }).click();
      await expect(page.locator(".shortlist-count")).toHaveText("1");
      await page.getByRole("button", { name: "Shortlisted — tap to remove" }).click();
      await expect(page.locator(".shortlist-count")).toHaveCount(0);
    },
  );

  test(
    "remove a home: the card goes, and the removal persists across a reload",
    { tag: "@regression" },
    async ({ page }) => {
      await seedShortlist(page, [BIRKDALE_CARD, EXETER_CARD]);
      await page.goto("/shortlist");
      await expect(page.locator(".shortlist-card")).toHaveCount(2);
      await page.getByRole("button", { name: "Remove 19 Birkdale Rise, CM3 2JT" }).click();
      await expect(page.locator(".shortlist-card")).toHaveCount(1);
      await expect(page.locator(".shortlist-card")).toContainText("6 Exeter Road, E16 1GN");
      await page.reload();
      await expect(page.locator(".shortlist-card")).toHaveCount(1);
      await expect(page.locator(".shortlist-count")).toHaveText("1");
    },
  );

  test(
    "the headline comparison renders side by side with no winner declared",
    { tag: "@regression" },
    async ({ page }) => {
      const minerva = specCard({
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
      await seedShortlist(page, [BIRKDALE_CARD, EXETER_CARD, minerva]);
      await page.goto("/shortlist");

      const compare = page.locator(".shortlist-compare");
      // D70 D17: on a wide screen the comparison is the
      // design's shared-label table — the first column names
      // each check once, one column per home. (The phone
      // block stacking is unchanged.)
      await expect(compare.locator(".compare-table thead th")).toHaveCount(4);
      // The pinned row set leads with the primary row; the
      // flood and crime cells are pointers in every column.
      const primaryRow = compare.locator('.compare-table [data-compare-row="primary"]');
      await expect(primaryRow.locator("td").first()).toContainText("Birkdale Primary School");
      await expect(primaryRow.locator(".place-row__miles--green").first()).toHaveText("0.4 mi");
      for (const rowKey of ["flood", "crime"]) {
        const cells = compare.locator(`.compare-table [data-compare-row="${rowKey}"] td`);
        await expect(cells).toHaveCount(3);
        for (const cell of await cells.all()) {
          await expect(cell).toHaveText("See this home's check");
        }
      }
      const reportLinks = compare.locator(".compare-table tfoot .report-btn");
      await expect(reportLinks).toHaveCount(3);
      for (const link of await reportLinks.all()) {
        await expect(link).toHaveAttribute("href", "/report");
      }
      await expect(
        compare.locator('.compare-table [data-compare-row="councilTax"] td').first(),
      ).toContainText("Band D averages £2,280.36 a year");
      // No winner, score or ranking language anywhere in the
      // comparison (the D9 disclaimer's "recommend" sits
      // outside this section and is not a verdict).
      const compareText = (await compare.innerText()).toLowerCase();
      expect(compareText).not.toContain("winner");
      expect(compareText).not.toContain("best home");
      expect(compareText).not.toContain("top pick");
      expect(compareText).not.toContain("score");
    },
  );

  test(
    "the add-a-4th panel offers remove-one or the £4.99 report, and freeing a slot lets the save through",
    { tag: "@regression" },
    async ({ page }) => {
      await seedShortlist(page, [BIRKDALE_CARD, EXETER_CARD, WIDER_AREA_CARD]);
      await reachResults(page, "KT17 1FH", /Flat 4, Minerva House/);
      await page.getByRole("button", { name: "Shortlist this home" }).click();

      const panel = page.locator(".shortlist-panel");
      await expect(panel).toBeVisible();
      await expect(panel).toContainText(
        "Your shortlist is full — the free shortlist holds 3 homes.",
      );
      await expect(panel.getByRole("button", { name: /Remove / })).toHaveCount(3);
      await expect(
        panel.getByRole("link", { name: "Get the detailed report on a saved home — £4.99" }),
      ).toHaveAttribute("href", "/report");
      // Nothing was saved by opening the panel.
      await expect(page.locator(".shortlist-count")).toHaveText("3");

      await panel.getByRole("button", { name: "Remove 6 Exeter Road, E16 1GN" }).click();
      await panel.getByRole("button", { name: "Shortlist this home" }).click();
      await expect(panel).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Shortlisted — tap to remove" })).toBeVisible();
      await expect(page.locator(".shortlist-count")).toHaveText("3");
      await page.goto("/shortlist");
      await expect(page.locator(".shortlist-card")).toHaveCount(3);
      await expect(page.locator(".shortlist-card").nth(2)).toContainText("Minerva House");
    },
  );

  test(
    "a shortlisted wider-area card shows its wider-area facts under the scope label and counts toward the 3",
    { tag: "@regression" },
    async ({ page }) => {
      await seedShortlist(page, [BIRKDALE_CARD, EXETER_CARD]);
      await page.goto("/search?outward=E16");
      await expect(page.locator("h1")).toHaveText("Wider area — E16, not this exact home");
      await page.getByRole("button", { name: "Shortlist this home" }).click();
      await expect(page.locator(".shortlist-count")).toHaveText("3");

      await page.goto("/shortlist");
      const areaCard = page.locator('.shortlist-card[data-rung="3"]');
      await expect(areaCard).toHaveCount(1);
      await expect(areaCard).toContainText("Wider area — E16, not this exact home");
      await expect(areaCard).toContainText("sold prices need an exact postcode");
      await expect(areaCard).toContainText("crime counts need an exact postcode");
      await expect(page.locator(".shortlist-card")).toHaveCount(3);
    },
  );

  test(
    "with browser storage unavailable, the named line appears where the shortlist would be",
    { tag: "@regression" },
    async ({ page }) => {
      await page.addInitScript(() => {
        Storage.prototype.getItem = () => {
          throw new Error("storage unavailable in this spec");
        };
        Storage.prototype.setItem = () => {
          throw new Error("storage unavailable in this spec");
        };
      });
      await page.goto("/shortlist");
      await expect(page.locator(".shortlist-unavailable")).toContainText(
        "not allowing storage right now",
      );
      await expect(page.locator(".shortlist-card")).toHaveCount(0);

      // And in place of the add control on a results page.
      await reachResults(page, "CM3 2JT", "19 Birkdale Rise");
      await expect(page.locator(".results-actions .shortlist-unavailable")).toBeVisible();
      await expect(page.getByRole("button", { name: "Shortlist this home" })).toHaveCount(0);
    },
  );

  test(
    "the empty state renders the design's line on a fresh context",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/shortlist");
      const empty = page.locator(".shortlist-empty");
      await expect(empty).toBeVisible();
      await expect(empty.locator("h2")).toHaveText("Your shortlist is empty");
      await expect(empty).toContainText(
        "No homes have been saved yet, so there is nothing to compare.",
      );
      await expect(empty).toContainText("kept only in this browser");
      await expect(page.locator(".shortlist-count")).toHaveCount(0);
    },
  );
});
