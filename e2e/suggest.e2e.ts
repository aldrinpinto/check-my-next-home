import { expect, test } from "./fixtures";

// The suggestions dropdown (entry-point build, D71 + D72)
// against the SERVED app + the seeded golden corpus.
//
// D71 amendment (founder ruling, 18 Nov 2026): for a FULL
// postcode the dropdown carries that postcode's COMPLETE
// home list, scrollable, in natural address order. The
// founder's own play-server test found the old cap of 8
// hiding homes — at CM3 2JT the served eight stopped at
// 18 Birkdale Rise and his own 19 Birkdale Rise sat past
// the cut, on a street the site holds in full. This spec
// is that finding stated as a regression pin: the whole
// seeded list is in the panel, the list region scrolls,
// the keyboard walks to 19 Birkdale Rise (scrolling it
// into view), and Enter lands in its check.

test.describe("suggestions dropdown — regression", () => {
  test(
    "CM3 2JT: the full-postcode dropdown carries every home, scrollable; 19 Birkdale Rise picks into its check",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      const box = page.locator("#postcode");
      await box.fill("CM3 2JT");

      const panel = page.locator("#postcode-suggestions");
      await expect(panel).toBeVisible();
      await expect(panel.locator(".suggest__group-label")).toHaveText("Homes");

      // The complete list, not the old cap of 8 — and the
      // home the cap hid is among them.
      const options = panel.getByRole("option");
      expect(await options.count()).toBeGreaterThan(8);
      const target = panel.getByRole("option", {
        name: "19 Birkdale Rise, CM3 2JT",
        exact: true,
      });
      await expect(target).toBeAttached();

      // The list is a scrollable region: capped height,
      // overflow-y auto, content taller than the region.
      const list = panel.locator(".suggest__list");
      const metrics = await list.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        overflowY: getComputedStyle(el).overflowY,
      }));
      expect(metrics.overflowY).toBe("auto");
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

      // Keyboard: walk down the full list until 19
      // Birkdale Rise is the active row (the walk is
      // text-driven, so it holds whatever the corpus's
      // exact numbering is). The active row must sit
      // inside the region's visible box — scrolled into
      // view, not left below the fold.
      let activeText = "";
      for (let i = 0; i < 40 && activeText !== "19 Birkdale Rise, CM3 2JT"; i += 1) {
        await box.press("ArrowDown");
        activeText = await page.evaluate(() => {
          const id = document.querySelector("#postcode")?.getAttribute("aria-activedescendant");
          return id ? (document.getElementById(id)?.textContent ?? "") : "";
        });
      }
      expect(activeText).toBe("19 Birkdale Rise, CM3 2JT");
      const within = await page.evaluate(() => {
        const id = document.querySelector("#postcode")?.getAttribute("aria-activedescendant");
        const row = id ? document.getElementById(id) : null;
        const region = document.querySelector("#postcode-suggestions .suggest__list");
        if (!row || !region) return false;
        const r = row.getBoundingClientRect();
        const g = region.getBoundingClientRect();
        return r.top >= g.top - 1 && r.bottom <= g.bottom + 1;
      });
      expect(within).toBe(true);

      // Enter picks it: straight to the home's check.
      await box.press("Enter");
      await page.waitForURL(/\/search\/home\?postcode=CM3\+2JT&home=19%7C%7CBIRKDALE\+RISE/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-header h1")).toHaveText("19 Birkdale Rise");
    },
  );

  test(
    "E16: a partial postcode in a two-digit district suggests its postcodes",
    { tag: "@regression" },
    async ({ page }) => {
      // The founder-found bug (18 Nov 2026): the outward
      // parse allowed one digit only, so every partial in
      // a two-digit district — E16 typed at the play
      // server — returned no suggestions at all, while
      // one-digit CM3 worked. The seeded corpus holds
      // exactly one E16 postcode, E16 1GN.
      await page.goto("/");
      const box = page.locator("#postcode");
      const panel = page.locator("#postcode-suggestions");

      await box.fill("E161");
      await expect(panel).toBeVisible();
      await expect(panel.locator(".suggest__group-label")).toHaveText("Postcodes");
      await expect(panel.getByRole("option", { name: "E16 1GN", exact: true })).toBeAttached();

      await box.fill("E161G");
      await expect(panel.getByRole("option", { name: "E16 1GN", exact: true })).toBeAttached();
      expect(await panel.getByRole("option").count()).toBe(1);
    },
  );

  test(
    "CM3 2JT: a below-the-fold home picks by mouse",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      const box = page.locator("#postcode");
      await box.fill("CM3 2JT");
      const panel = page.locator("#postcode-suggestions");
      await expect(panel).toBeVisible();
      // The last home in natural order sits below the
      // scroll fold; Playwright scrolls it into view
      // inside the region to click it, as a visitor's
      // wheel would.
      const last = panel.getByRole("option").last();
      const label = await last.textContent();
      await last.click();
      await page.waitForURL(/\/search\/home\?postcode=CM3\+2JT&home=/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-header h1")).toHaveText(
        (label ?? "").replace(/, CM3 2JT$/, ""),
      );
    },
  );
});
