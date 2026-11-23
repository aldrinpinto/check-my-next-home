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
//
// T-WEB map (M7.15 citation tidy):
//   T-WEB-11 (search accepts more than a postcode), in
//     part — the street legs ("Birkdale Rise: the Streets
//     group offers the street", the Bugdale fuzzy-choice
//     spec, "the Properties group names the street's
//     homes") and the place legs ("typing the town offers
//     the place alone; picking it lands on the place
//     page", "picking the place from a part-typed name",
//     the misspelt-town spec); the full-address leg is in
//     e2e/journey.e2e.ts.
//   T-WEB-07, in part — "E16: a partial postcode in a
//     two-digit district suggests its postcodes" is the
//     dropdown leg; the journey leg (the outward landing
//     on the district page) is in e2e/journey.e2e.ts.
//   No T-WEB row: the full-postcode dropdown specs (the
//     complete home list, the below-the-fold pick) —
//     D71/D72 entry-point scope.
//   No T-WEB row: the place-page specs (founder ruling,
//     19 Nov 2026, reversing the 18 Nov in-dropdown
//     chooser and replacing the same morning's fix-batch
//     specs) — the place pick's navigation, the place-name
//     submit spec, and the two place-arrival specs (the
//     place page's own URL and the /search bare-name
//     route).

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
      // retrying form: a one-shot count() can land in the
      // beat between the fill clearing the "E161" pair
      // (BUG-033: the old list drops the moment the text
      // changes) and the debounced "E161G" response
      // repainting the panel with the narrowed set — the
      // served set was always correct, as the unit pins
      // in tests/entry-point.test.ts prove against this
      // same two-postcode directory. (CI #218's lesson,
      // whose stale-pair mechanism — the panel holding
      // the old pair until the new response landed —
      // BUG-033 has since removed.)
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
      // The street's homes stand as the dropdown's options
      // (founder ruling, 20 Nov 2026 — the list dump is gone).
      await page.locator(".picker__trigger").click();
      await expect(
        page.locator(".picker__panel").getByRole("option", { name: "19 Birkdale Rise" }),
      ).toBeAttached();
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

  // M7.15D — place search (18 Nov 2026); the pick's
  // behaviour ruled again 19 Nov 2026 (the place page,
  // reversing the in-dropdown chooser these specs
  // originally pinned — the founder, live-testing
  // Liverpool, found the reveal confusing and unlike
  // streets: picking a place now goes straight to a
  // dedicated page listing ALL its districts, as a
  // street spanning postcodes goes to the street choice
  // page). The seeded corpus files Chelmsford in two
  // districts (the EPC fixture's CM1 6ER and the sales
  // fixture's CM3 2JT), so the place page lists CM1 and
  // CM3 — the seeded world holds no CM2 Chelmsford row,
  // and the page must not invent one.
  //
  // The field is reached by its label, "Postcode or
  // address" — the bare box's visually-hidden label and
  // accessible name (POSTCODE_BOX_LABEL). "Enter a
  // postcode" is the field's PLACEHOLDER, which
  // getByLabel never matches: CI #228's first form of
  // these specs timed out on fill at this locator,
  // resolving to no element on attempt and retry alike,
  // while every sibling spec reached the same input by
  // #postcode. The label genuinely differs from the
  // placeholder; the specs locate by the label.
  test(
    "typing the town offers the place alone; picking it lands on the place page, whose districts land on the wider-area page",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      const input = page.getByLabel("Postcode or address");
      await input.fill("Chelmsford");
      await page.waitForTimeout(400);
      // The panel holds the place and nothing beneath
      // it — no districts group rides the dropdown any
      // more, typed in full or not.
      const groups = await page.locator(".suggest__group-label").allTextContents();
      expect(groups).toEqual(["Places"]);
      await expect(page.getByRole("option", { name: "Chelmsford", exact: true })).toBeVisible();
      await expect(page.getByRole("option", { name: "CM1 — Chelmsford" })).toHaveCount(0);
      await page.getByRole("option", { name: "Chelmsford", exact: true }).click();
      // The place page: the place as the heading, every
      // district the seeded world holds as a row — and
      // no CM2, which it does not hold.
      await page.waitForURL("**/search?place=Chelmsford");
      await expect(page.getByRole("heading", { name: "Chelmsford" })).toHaveText("Chelmsford");
      await expect(page.getByRole("link", { name: "CM1 — Chelmsford" })).toBeVisible();
      await expect(page.getByRole("link", { name: "CM3 — Chelmsford" })).toBeVisible();
      await expect(page.getByRole("link", { name: "CM2 — Chelmsford" })).toHaveCount(0);
      await page.getByRole("link", { name: "CM3 — Chelmsford" }).click();
      await page.waitForURL("**/search?outward=CM3");
      // Held reveal (the wider-area checking screen,
      // 19 Nov 2026): the heading arrives with the results.
      await expect(page.getByRole("heading", { name: "Wider area — CM3" })).toHaveText(
        "Wider area — CM3",
        { timeout: 30_000 },
      );
    },
  );

  test(
    "picking the place from a part-typed name lands on the place page",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      const input = page.getByLabel("Postcode or address");
      await input.fill("Chelms");
      await page.waitForTimeout(400);
      // The place is offered from the part-word; the
      // panel carries no districts at any point.
      await expect(page.getByRole("option", { name: "Chelmsford", exact: true })).toBeVisible();
      expect(await page.locator(".suggest__group-label").allTextContents()).toEqual(["Places"]);
      await page.getByRole("option", { name: "Chelmsford", exact: true }).click();
      await page.waitForURL("**/search?place=Chelmsford");
      await expect(page.getByRole("heading", { name: "Chelmsford" })).toHaveText("Chelmsford");
      await page.getByRole("link", { name: "CM1 — Chelmsford" }).click();
      await page.waitForURL("**/search?outward=CM1");
      // Held reveal (the wider-area checking screen,
      // 19 Nov 2026): the heading arrives with the results.
      await expect(page.getByRole("heading", { name: "Wider area — CM1" })).toHaveText(
        "Wider area — CM1",
        { timeout: 30_000 },
      );
    },
  );

  test(
    "a misspelt town is offered the real place as a choice — and expands nothing unpicked",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      const input = page.getByLabel("Postcode or address");
      await input.fill("Chlemsford");
      await page.waitForTimeout(400);
      await expect(page.getByRole("option", { name: "Chelmsford", exact: true })).toBeVisible();
      expect(await page.locator(".suggest__group-label").allTextContents()).toEqual(["Places"]);
    },
  );

  // A place name in the field is the place pick wherever
  // the name arrives from — typed in full and submitted,
  // the place page's own URL, or a bare name sent to
  // /search. The founder's twice-reported failure-page
  // landing from a place name is the regression these
  // pin (founder fix batch, 19 Nov 2026; the destination
  // is the place page since the same day's later ruling).
  test(
    "pressing Check this home with a place name in the field goes to the place page",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      const input = page.getByLabel("Postcode or address");
      await input.fill("Chelmsford");
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: "Check this home", exact: true }).click();
      await page.waitForURL("**/search?place=Chelmsford");
      await expect(page.getByRole("heading", { name: "Chelmsford" })).toHaveText("Chelmsford");
      await expect(page.getByRole("link", { name: "CM1 — Chelmsford" })).toBeVisible();
      await expect(page.getByRole("link", { name: "CM3 — Chelmsford" })).toBeVisible();
    },
  );

  test(
    "arriving at the place page's URL directly lists the place's districts",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search?place=Chelmsford");
      await expect(page.getByRole("heading", { name: "Chelmsford" })).toHaveText("Chelmsford");
      await expect(page.getByRole("link", { name: "CM1 — Chelmsford" })).toBeVisible();
      await expect(page.getByRole("link", { name: "CM3 — Chelmsford" })).toBeVisible();
      await expect(page.getByRole("link", { name: "CM2 — Chelmsford" })).toHaveCount(0);
    },
  );

  test(
    "a bare place name sent to /search is routed to the place page — never the failure page",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search?postcode=Chelmsford");
      await page.waitForURL("**/search?place=Chelmsford");
      await expect(page.getByRole("heading", { name: "Chelmsford" })).toHaveText("Chelmsford");
      await expect(page.getByRole("link", { name: "CM3 — Chelmsford" })).toBeVisible();
    },
  );

  test(
    "BUG-032: a full postcode with no filed homes still offers itself",
    { tag: "@regression" },
    async ({ page }) => {
      // CM0 7AA is the corpus's neither-source witness:
      // it stands in the postcode directory, and neither
      // the filed sales nor the picking index hold a
      // single home for it. Before the fix the
      // full-postcode branch served an empty response
      // and the panel never opened (proven live on
      // E16 1AF); the branch now serves the postcode
      // itself, and picking it lands on its whole-
      // postcode check.
      await page.goto("/");
      const box = page.locator("#postcode");
      await box.fill("CM0 7AA");

      const panel = page.locator("#postcode-suggestions");
      await expect(panel).toBeVisible();
      await expect(panel.locator(".suggest__group-label")).toHaveText("Postcodes");
      const self = panel.getByRole("option", { name: "CM0 7AA", exact: true });
      await expect(self).toBeVisible();

      await self.click();
      await page.waitForURL(/\/search\/home\?postcode=CM0\+7AA/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
    },
  );

  test(
    "BUG-008: a typed string with no matches shows the no-suggestions line",
    { tag: "@regression" },
    async ({ page }) => {
      // Before the fix the panel simply never opened for
      // a no-match string — the visitor could not tell a
      // settled empty answer from a box still loading.
      // The panel now opens on the pinned line.
      await page.goto("/");
      const box = page.locator("#postcode");
      await box.fill("xqzww");

      const panel = page.locator("#postcode-suggestions");
      await expect(panel).toBeVisible();
      await expect(panel.locator(".suggest__empty")).toHaveText(
        "No suggestions for that — check the spelling, or use the button to search anyway.",
      );
    },
  );

  test(
    "BUG-033: editing the text drops the old suggestions at once — nothing stale renders mid-flight",
    { tag: "@regression" },
    async ({ page }) => {
      // Founder-found live (20 Nov 2026): type CM3, then
      // backspace and retype CO1 — the CM3 list stayed
      // on screen for a few seconds under a field
      // reading CO1, its rows clickable, so a tap could
      // pick a CM3 home while aiming at CO1. The box
      // now clears the served list the moment the text
      // changes. The spec holds the CO1 response at the
      // network so the mid-flight state is observed
      // deterministically: with the response still
      // outstanding, no CM3 row exists — and the
      // no-suggestions line has NOT appeared either,
      // because it belongs to a settled empty answer
      // only (BUG-008). When the held response lands —
      // CO1 names nothing in the seeded corpus — the
      // line appears, on the settle.
      await page.goto("/");
      const box = page.locator("#postcode");
      const panel = page.locator("#postcode-suggestions");
      await box.fill("CM3");
      await expect(panel.getByRole("option", { name: "CM3 2JT", exact: true })).toBeVisible();

      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(/\/api\/suggest\?q=CO1$/, async (route) => {
        await held;
        await route.continue();
      });
      await box.fill("CO1");

      // Mid-flight: the old list is already gone, and
      // nothing has taken its place yet.
      await expect(panel.getByRole("option")).toHaveCount(0);
      await expect(panel.locator(".suggest__empty")).toHaveCount(0);

      release();
      await expect(panel.locator(".suggest__empty")).toHaveText(
        "No suggestions for that — check the spelling, or use the button to search anyway.",
      );
    },
  );

  test(
    "BUG-185: a full postcode's panel ends with the full-address-list row",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      const box = page.locator("#postcode");
      await box.fill("CM3 2JT");
      const panel = page.locator("#postcode-suggestions");
      await expect(panel).toBeVisible();
      await expect(panel.locator(".suggest__group-label")).toHaveText("Homes");
      // The row stands under the homes, whatever the
      // list's size — the panel's pinned footer.
      const row = panel.locator("button.postio-row");
      await expect(row).toBeVisible();
      await expect(row).toContainText("Don't see your home? Search the full address list");
    },
  );

  test(
    "BUG-185: a street search shows no full-address-list row",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      const box = page.locator("#postcode");
      const panel = page.locator("#postcode-suggestions");
      await box.fill("Birkdale Rise");
      await expect(panel).toBeVisible();
      await expect(
        panel.getByRole("listbox", { name: "Streets" }).getByRole("option").first(),
      ).toBeAttached();
      // The row belongs to one postcode's home list only.
      await expect(panel.locator(".postio-row")).toHaveCount(0);
    },
  );

  test(
    "BUG-185: clicking the row settles to the done line over the standing list",
    { tag: "@regression" },
    async ({ page }) => {
      // The harness carries no Postio key, so the click's
      // one call fails — which is exactly the ruled
      // silent path: spinner, then the done line over
      // whatever list stands, no failure state anywhere.
      await page.goto("/");
      const box = page.locator("#postcode");
      await box.fill("CM3 2JT");
      const panel = page.locator("#postcode-suggestions");
      await expect(panel).toBeVisible();
      const before = await panel.getByRole("option").count();
      expect(before).toBeGreaterThan(8);
      await panel.locator("button.postio-row").click();
      const done = panel.locator(".postio-row--done");
      await expect(done).toBeVisible({ timeout: 15_000 });
      await expect(done).toContainText("Showing every address we can find for CM3 2JT");
      // The list stands unchanged, and the row cannot be
      // charged again — it is no longer a button.
      await expect(panel.getByRole("option")).toHaveCount(before);
      await expect(panel.locator("button.postio-row")).toHaveCount(0);
    },
  );

  test(
    "BUG-185: the picker dropdown carries the same row as its last item",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await page.locator(".picker__trigger").click();
      const panel = page.locator(".picker__panel");
      await expect(panel).toBeVisible();
      const row = panel.locator("button.postio-row");
      await expect(row).toBeVisible();
      await expect(row).toContainText("Don't see your home? Search the full address list");
      // Last item in the panel — after the homes group.
      await expect(panel.locator(":scope > :last-child")).toHaveClass(/postio-row/);
    },
  );
});
