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
// Regression: the authored behaviours (remove; the
// headline comparison side by side with no winner declared;
// the full shortlist's simple message in place of the add
// button — no panel (founder's ruling, 17 Nov 2026); the
// facts table from one saved home, with the kept line
// closing the page; the rung-3 card with wider-area facts
// under the scope label counting toward the 3; the
// storage-unavailable named line) plus the gap check's two
// adopted additions (the header count updating after
// add/remove without a manual reload; the empty state on a
// fresh context). Where a spec needs a full list it seeds
// storage directly with records in the pinned shape
// (lib/shortlist.ts) rather than clicking through three
// saves. The seeded flood/crime cells use the LEGACY
// pointer shape — cards saved before the same ruling —
// except where a spec overrides them with the real lines.
// No promotions to Smoke (D68 clause 7).
//
// T-WEB map (M7.15 citation tidy):
//   T-WEB-04 (shortlist) — the Smoke (cited in its title:
//     survives a restart, absent in a second context) and
//     the Regression specs, which discharge the row's
//     remaining halves: add/remove, the headline
//     comparison with no winner declared, and the privacy
//     line's served forms (the full message, the facts
//     table, the storage-unavailable line).

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

async function reachResults(page: Page, postcode: string, rowName: string) {
  // The retired picker route redirects to the
  // whole-postcode check (picker removed, 18 Nov 2026);
  // its home dropdown carries the postcode's homes
  // (founder ruling, 20 Nov 2026 — the list dump is
  // gone), and choosing one is the pick.
  await page.goto(`/search?postcode=${postcode.replace(" ", "+")}`);
  await page.waitForURL(/\/search\/home\?postcode=/);
  await page.locator(".picker__select").selectOption({ label: rowName });
  await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
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
        await persistent.waitForURL(/\/search\/home\?postcode=/);
        await persistent.locator(".picker__select").selectOption({ label: "19 Birkdale Rise" });
        await persistent.waitForURL(/\/search\/home\?postcode=.*&home=/);
        await expect(persistent.locator(".results")).toBeVisible({ timeout: 30_000 });
        // Two shortlist controls render on a rung-1 page
        // (results head + buy bar, item 6) — either saves.
        await persistent.getByRole("button", { name: "Shortlist this home" }).first().click();
        await expect(
          persistent.getByRole("button", { name: "Shortlisted — tap to remove" }).first(),
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
      // Two controls render on a rung-1 page (results head
      // + buy bar, item 6); they stay in sync, so the first
      // drives both assertions.
      await page.getByRole("button", { name: "Shortlist this home" }).first().click();
      await expect(page.locator(".shortlist-count")).toHaveText("1");
      await page.getByRole("button", { name: "Shortlisted — tap to remove" }).first().click();
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
      // Sample parity (18 Nov 2026): a saved state carries
      // the lead's one sentence, whatever the count.
      await expect(page.locator(".shortlist-lead")).toHaveText(
        "Nothing about which homes you are considering is stored on any server.",
      );
      // A rung-1 card carries no facts line and no report
      // link (17 Nov 2026 ruling) — Remove is its only action.
      const firstCard = page.locator(".shortlist-card").first();
      await expect(firstCard.locator(".shortlist-card__facts")).toHaveCount(0);
      await expect(firstCard.locator(".report-btn")).toHaveCount(0);
      await expect(firstCard.getByRole("button", { name: /Remove / })).toHaveCount(1);
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
      const minervaSeed = specCard({
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
      // Minerva carries the post-ruling real cells (its
      // surface water is Low, as served); Birkdale and
      // Exeter keep the legacy pointer shape.
      const minerva: ShortlistCard = {
        ...minervaSeed,
        comparison: {
          ...minervaSeed.comparison,
          flood: { kind: "line", text: "Rivers & sea: Very low · Surface water: Low" },
          crime: { kind: "line", text: "1,956 crimes" },
        },
      };
      await seedShortlist(page, [BIRKDALE_CARD, EXETER_CARD, minerva]);
      await page.goto("/shortlist");

      const compare = page.locator(".shortlist-compare");
      // Sample parity (views 15–16; 18 Nov 2026): the saved
      // state carries the lead as the sample's one sentence,
      // no search card, and the three-across cards run at
      // the frame's full width, past the 820px column.
      await expect(page.locator(".shortlist-lead")).toHaveText(
        "Nothing about which homes you are considering is stored on any server.",
      );
      await expect(page.locator(".shortlist-search-card")).toHaveCount(0);
      const cardsBox = await page.locator(".shortlist-cards--three").boundingBox();
      expect(cardsBox?.width ?? 0).toBeGreaterThan(820);
      // D70 D17: on a wide screen the comparison is the
      // design's shared-label table — the first column names
      // each check once, one column per home. (The phone
      // block stacking is unchanged.)
      await expect(compare.locator(".compare-table thead th")).toHaveCount(4);
      // The first header cell is visually blank (its
      // "Check" is screen-reader text), and a column header
      // is the address alone — no sale line under it (the
      // cards above keep theirs).
      await expect(
        compare.locator(".compare-table thead th").first().locator(".visually-hidden"),
      ).toHaveText("Check");
      await expect(compare.locator(".compare-table thead")).not.toContainText("£");
      // The row order is the D75 pill priority: Flood leads.
      await expect(compare.locator(".compare-table tbody tr").first()).toHaveAttribute(
        "data-compare-row",
        "flood",
      );
      const primaryRow = compare.locator('.compare-table [data-compare-row="primary"]');
      await expect(primaryRow.locator("td").first()).toContainText("Birkdale Primary School");
      // Item 43 (parity fix batch) set the comparison
      // miles as plain bold Forest text; BUG-163 (founder
      // ruling, 22 Nov 2026) supersedes it: the miles take
      // the reports' colour coding in the pills' figure
      // dress — Birkdale's primary at 0.42 mi is the
      // school band's green — while the rows the product
      // never colours (GP) keep the plain .compare-mi form.
      await expect(primaryRow.locator("td").first()).toContainText(
        "Birkdale Primary School · 0.4 mi",
      );
      await expect(primaryRow.locator(".pill__figure--green").first()).toHaveText("0.4 mi");
      await expect(
        compare.locator('.compare-table [data-compare-row="gp"] .compare-mi').first(),
      ).toHaveText("1.9 mi");
      // Legacy pointer cells still render their pointer;
      // the real cells render their lines.
      for (const rowKey of ["flood", "crime"]) {
        const cells = compare.locator(`.compare-table [data-compare-row="${rowKey}"] td`);
        await expect(cells).toHaveCount(3);
        await expect(cells.nth(0)).toHaveText("See this home's check");
        await expect(cells.nth(1)).toHaveText("See this home's check");
      }
      await expect(
        compare.locator('.compare-table [data-compare-row="flood"] td').nth(2),
      ).toHaveText("Rivers & sea: Very low · Surface water: Low");
      await expect(
        compare.locator('.compare-table [data-compare-row="crime"] td').nth(2),
      ).toHaveText("1,956 crimes");
      // Exactly one buy button per column, in the ruled words.
      const reportLinks = compare.locator(".compare-table tfoot .report-btn");
      await expect(reportLinks).toHaveCount(3);
      // M7.6 link contract: a rung-1 column's button carries
      // the card's identity (postcode + home key) so the
      // report door resolves the home from it.
      const expectedHrefs = [
        "/report?postcode=CM3+2JT&home=key",
        "/report?postcode=E16+1GN&home=seed-exeter",
        "/report?postcode=KT17+1FH&home=seed-minerva",
      ];
      for (const [index, link] of (await reportLinks.all()).entries()) {
        await expect(link).toHaveAttribute("href", expectedHrefs[index]);
        await expect(link).toHaveText("Get the full report — £4.99");
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
    "at 3 saved, tapping add shows the full message in place — no panel — and freeing a slot lets the save through",
    { tag: "@regression" },
    async ({ page }) => {
      await seedShortlist(page, [BIRKDALE_CARD, EXETER_CARD, WIDER_AREA_CARD]);
      await reachResults(page, "KT17 1FH", "Flat 4, Minerva House, 12 Ceres Crescent");
      await page.getByRole("button", { name: "Shortlist this home" }).first().click();

      // The simple message stands where the button was
      // (founder's ruling, 17 Nov 2026): the full line, a
      // link to the shortlist, and no panel anywhere. A
      // rung-1 page carries TWO control instances (results
      // head + buy bar, item 6); each carries its own
      // notice state, so the tapped instance shows the
      // message while the other still offers its button —
      // and tapping that one shows the message there too,
      // saving nothing either time.
      const full = page.locator(".shortlist-full-line").first();
      await expect(full).toBeVisible();
      await expect(full).toContainText("Your shortlist is full — it holds 3 homes.");
      await expect(full.getByRole("link", { name: "See your shortlist" })).toHaveAttribute(
        "href",
        "/shortlist",
      );
      await expect(page.locator(".shortlist-panel")).toHaveCount(0);
      const other = page.getByRole("button", { name: "Shortlist this home" });
      await expect(other).toHaveCount(1);
      await other.click();
      await expect(page.locator(".shortlist-full-line")).toHaveCount(2);
      await expect(page.getByRole("button", { name: "Shortlist this home" })).toHaveCount(0);
      // Nothing was saved by either tap.
      await expect(page.locator(".shortlist-count")).toHaveText("3");

      // Free a slot on the shortlist page, via the message's
      // own link, and the same home then saves.
      await full.getByRole("link", { name: "See your shortlist" }).click();
      await page.waitForURL(/\/shortlist$/);
      await page.getByRole("button", { name: "Remove 6 Exeter Road, E16 1GN" }).click();
      await expect(page.locator(".shortlist-card")).toHaveCount(2);
      await reachResults(page, "KT17 1FH", "Flat 4, Minerva House, 12 Ceres Crescent");
      await page.getByRole("button", { name: "Shortlist this home" }).first().click();
      await expect(
        page.getByRole("button", { name: "Shortlisted — tap to remove" }).first(),
      ).toBeVisible();
      await expect(page.locator(".shortlist-count")).toHaveText("3");
      await page.goto("/shortlist");
      await expect(page.locator(".shortlist-card")).toHaveCount(3);
      await expect(page.locator(".shortlist-card").nth(2)).toContainText("Minerva House");
    },
  );

  test(
    "one saved home renders its facts table under its own heading, and the kept line closes the page",
    { tag: "@regression" },
    async ({ page }) => {
      await seedShortlist(page, [BIRKDALE_CARD]);
      await page.goto("/shortlist");
      await expect(page.locator(".shortlist-card")).toHaveCount(1);

      const compare = page.locator(".shortlist-compare");
      await expect(compare.locator("h2")).toHaveText("The facts for this home");
      await expect(compare.locator(".compare-table thead th")).toHaveCount(2);
      const reportLink = compare.locator(".compare-table tfoot .report-btn");
      await expect(reportLink).toHaveCount(1);
      await expect(reportLink).toHaveText("Get the full report — £4.99");
      // M7.6 link contract: postcode + the card's home key.
      await expect(reportLink).toHaveAttribute("href", "/report?postcode=CM3+2JT&home=key");

      // The kept line is the page's last word: small print
      // below the table, after it in the document order.
      await expect(page.locator(".shortlist-kept-line")).toHaveText(
        "Homes you save are kept only in this browser.",
      );
      const keptAfterTable = await page.evaluate(() => {
        const table = document.querySelector(".shortlist-compare");
        const kept = document.querySelector(".shortlist-kept-line");
        if (!table || !kept) return false;
        return Boolean(table.compareDocumentPosition(kept) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(keptAfterTable).toBe(true);
    },
  );

  test(
    "a shortlisted wider-area card shows its wider-area facts under the scope label and counts toward the 3 — and the district page itself offers no shortlist control",
    { tag: "@regression" },
    async ({ page }) => {
      // The wider-area card is seeded directly (founder
      // fix batch, 19 Nov 2026): the district page no
      // longer carries the shortlist button the founder
      // flagged — the sample carries no shortlist control
      // and the bridge is the page's only forward path.
      // Cards filed before the removal (and the Scotland /
      // not-covered page's own control) still render.
      await seedShortlist(page, [BIRKDALE_CARD, EXETER_CARD, WIDER_AREA_CARD]);
      await page.goto("/search?outward=E16");
      // Held reveal (the wider-area checking screen,
      // 19 Nov 2026): the heading arrives with the results.
      await expect(page.getByRole("heading", { name: "Wider area — E16" })).toHaveText(
        "Wider area — E16",
        { timeout: 30_000 },
      );
      await expect(page.getByRole("button", { name: "Shortlist this home" })).toHaveCount(0);
      await expect(page.locator("[data-shortlist-toggle]")).toHaveCount(0);

      await page.goto("/shortlist");
      const areaCard = page.locator('.shortlist-card[data-rung="3"]');
      await expect(areaCard).toHaveCount(1);
      await expect(areaCard).toContainText("Wider area — E16, not this exact home");
      // The rung-3 card KEEPS its facts line — its named
      // states explain missing data rather than duplicating
      // the table (the rung-1 cards dropped theirs).
      await expect(areaCard.locator(".shortlist-card__facts")).toContainText(
        "sold prices need an exact postcode",
      );
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

      // And in place of the add control on a results page —
      // inside the buy bar since M7.6 moved the control.
      await reachResults(page, "CM3 2JT", "19 Birkdale Rise");
      await expect(page.locator(".buy-bar .shortlist-unavailable")).toBeVisible();
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
      // Sample parity (view 14; 18 Nov 2026): the empty
      // state carries no lead, and the sample's search card
      // sits under the empty card.
      await expect(page.locator(".shortlist-lead")).toHaveCount(0);
      const searchCard = page.locator(".shortlist-search-card");
      await expect(searchCard).toBeVisible();
      await expect(searchCard.locator("h2")).toHaveText("Check a home");
      await expect(
        searchCard.getByPlaceholder("Enter a postcode, street or town — e.g. SW1A 1AA"),
      ).toBeVisible();
      await expect(searchCard.getByRole("button", { name: "Check this home" })).toBeVisible();
    },
  );
});
