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
      await expect(page.locator(".results-head h1")).toHaveText("19 Birkdale Rise, CM3 2JT");
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
      // one-digit CM3 worked. The seeded directory holds
      // TWO E16 postcodes — E16 1GN (the golden home) and
      // E16 1EG (a replay directory row) — so "E161"
      // serves both, and "E161G" narrows by the spaced
      // prefix "E16 1G" to E16 1GN alone: E16 1EG's
      // inward begins 1E, not 1G.
      await page.goto("/");
      const box = page.locator("#postcode");
      const panel = page.locator("#postcode-suggestions");

      await box.fill("E161");
      await expect(panel).toBeVisible();
      // M7.15C re-pin: the panel now carries the three
      // groups, so the label assertion scopes to the
      // FIRST group — the ruling's order puts Postcodes
      // first — and the counts scope to the Postcodes
      // list itself (the Properties group adds options
      // of its own below).
      await expect(panel.locator(".suggest__group-label").first()).toHaveText("Postcodes");
      await expect(panel.getByRole("option", { name: "E16 1GN", exact: true })).toBeAttached();

      await box.fill("E161G");
      await expect(panel.getByRole("option", { name: "E16 1GN", exact: true })).toBeAttached();
      // The narrowed count is asserted with Playwright's
      // retrying form: the panel still shows the "E161"
      // pair until the debounced "E161G" response lands,
      // and a one-shot count() reads that stale pair
      // (CI #218: expected 1, got 2, on both attempts —
      // the served set was already correct, as the unit
      // pins in tests/entry-point.test.ts prove against
      // this same two-postcode directory).
      await expect(
        panel.getByRole("listbox", { name: "Postcodes" }).getByRole("option"),
      ).toHaveCount(1);
    },
  );

  test(
    "Birkdale Rise: the Streets group offers the street; the pick lands on the check narrowed to it",
    { tag: "@regression" },
    async ({ page }) => {
      // M7.15C: a street name suggests the street itself
      // (held data — the seeded picking index files
      // BIRKDALE RISE in CM3 2JT alone, so the pick goes
      // straight to that postcode's check with its home
      // list narrowed to the street, under the street's
      // name as the list's heading).
      await page.goto("/");
      const box = page.locator("#postcode");
      const panel = page.locator("#postcode-suggestions");
      await box.fill("Birkdale Rise");
      await expect(panel).toBeVisible();
      const street = panel
        .getByRole("listbox", { name: "Streets" })
        .getByRole("option", { name: "Birkdale Rise, Chelmsford", exact: true });
      await expect(street).toBeAttached();
      await street.click();
      await page.waitForURL(/\/search\/home\?postcode=CM3\+2JT&street=BIRKDALE\+RISE/);
      await expect(page.locator(".picker h2")).toHaveText("Birkdale Rise");
      await expect(page.locator(".picker__row", { hasText: "19 Birkdale Rise" })).toBeAttached();
    },
  );

  test(
    "Bugdale Rise: a misspelling is offered the real street as a choice — never applied silently",
    { tag: "@regression" },
    async ({ page }) => {
      // M7.15C's fuzzy tier (pg_trgm, threshold 0.4): the
      // seeded street table holds BIRKDALE RISE, whose
      // similarity to the typed BUGDALE RISE is 0.5000 —
      // the prep's witness pair. The real street is
      // offered as a choice; the typed misspelling is
      // never itself an option, and picking the choice
      // lands exactly where the correctly-spelled pick
      // lands.
      await page.goto("/");
      const box = page.locator("#postcode");
      const panel = page.locator("#postcode-suggestions");
      await box.fill("Bugdale Rise");
      await expect(panel).toBeVisible();
      const streets = panel.getByRole("listbox", { name: "Streets" });
      await expect(
        streets.getByRole("option", { name: "Birkdale Rise, Chelmsford", exact: true }),
      ).toBeAttached();
      await expect(streets.getByRole("option", { name: /Bugdale/ })).toHaveCount(0);
      await streets.getByRole("option", { name: "Birkdale Rise, Chelmsford", exact: true }).click();
      await page.waitForURL(/\/search\/home\?postcode=CM3\+2JT&street=BIRKDALE\+RISE/);
      await expect(page.locator(".picker h2")).toHaveText("Birkdale Rise");
    },
  );

  test(
    "Birkdale Rise: the Properties group names the street's homes; a pick lands in the home's check",
    { tag: "@regression" },
    async ({ page }) => {
      // M7.15C: the same keystrokes also serve the
      // street's own homes as Properties — full address
      // lines, a pick going straight to that home's
      // check (the results H1 is the line's own form:
      // address + postcode, the town riding only in the
      // suggestion).
      await page.goto("/");
      const box = page.locator("#postcode");
      const panel = page.locator("#postcode-suggestions");
      await box.fill("Birkdale Rise");
      await expect(panel).toBeVisible();
      const properties = panel.getByRole("listbox", { name: "Properties" });
      const first = properties.getByRole("option").first();
      await expect(first).toBeAttached();
      const label = (await first.textContent()) ?? "";
      expect(label).toMatch(/Birkdale Rise, Chelmsford, CM3 2JT$/);
      await first.click();
      await page.waitForURL(/\/search\/home\?postcode=CM3\+2JT&home=/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-head h1")).toHaveText(label.replace(", Chelmsford", ""));
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
      // Item 5 (parity fix batch): the H1 is the option's
      // own label form — address + postcode.
      await expect(page.locator(".results-head h1")).toHaveText(label ?? "");
    },
  );
});
