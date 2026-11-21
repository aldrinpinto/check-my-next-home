import { expect, test } from "./fixtures";

// The single error page (Final Sample Master view 26;
// error-page build, 19 Nov 2026) — ONE face for every
// visitor-facing failure, per the founder's ruling: a
// failed check, an unmatched route and a route error
// are all just error states to the person looking at
// them, so they share one page — the headline, the
// line, the site's own search box as the way forward,
// the kept note where a home was being checked, and
// the Contact closing line. The failure kinds stay
// distinct in the counting (D45); only the face is one.
//
// T-WEB map: no T-WEB row — the page is the D44(7)
// whole-check failure state's face (its landing spec
// lives in journey.e2e.ts) extended to every failure
// surface by the founder's 19 Nov 2026 ruling; these
// specs prove the two faces the journey specs do not
// already cover: the unmatched route and the failure
// landing read directly, with and without the carried
// postcode.
//
// All Regression: the Smoke set is frozen as authored
// (D68); no promotions.

const HEADLINE = "Well — that wasn't supposed to happen";
const LINE =
  "Something on our side stumbled. Give it a few seconds, then search below — most hiccups clear on the second try.";
const KEPT_NOTE =
  "We've kept the home you were checking in the box — just press the button to run it again, or type a different home.";

test.describe("the single error page — regression", () => {
  test(
    "an unmatched route serves the error page, and its search box runs a check",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/no-such-page-here");
      await expect(page.locator("h1")).toHaveText(HEADLINE);
      await expect(page.getByText(LINE)).toBeVisible();
      // No home was being checked, so nothing is kept:
      // the box starts empty and the kept note is absent.
      await expect(page.locator("#postcode")).toHaveValue("");
      await expect(page.getByText(KEPT_NOTE)).toHaveCount(0);
      // The box is the site's own, working: a check run
      // from it lands on the postcode's check, its home
      // dropdown carrying the postcode's homes.
      await page.getByLabel("Postcode or address").fill("CM3 2JT");
      await page.getByRole("button", { name: "Check this home" }).click();
      await page.waitForURL("**/search/home?postcode=CM3+2JT");
      await expect(
        page.locator(".picker__select option", { hasText: "19 Birkdale Rise" }),
      ).toBeAttached();
    },
  );

  test(
    "/search/failed serves the same page, the attempted postcode kept in the box",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/failed?postcode=CM3%202JT");
      await expect(page.locator("h1")).toHaveText(HEADLINE);
      await expect(page.getByText(LINE)).toBeVisible();
      await expect(page.locator("#postcode")).toHaveValue("CM3 2JT");
      await expect(page.getByText(KEPT_NOTE)).toBeVisible();
      await expect(page.getByRole("link", { name: "Contact page" })).toHaveAttribute(
        "href",
        "/contact",
      );
    },
  );

  test(
    "/search/failed without a carried postcode serves the same page with an empty box",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/failed");
      await expect(page.locator("h1")).toHaveText(HEADLINE);
      await expect(page.getByText(LINE)).toBeVisible();
      await expect(page.locator("#postcode")).toHaveValue("");
      await expect(page.getByText(KEPT_NOTE)).toHaveCount(0);
    },
  );
});
