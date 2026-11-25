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
      await page.locator(".picker__trigger").click();
      await expect(
        page.locator(".picker__panel").getByRole("option", { name: "19 Birkdale Rise" }),
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

// BUG-186 (24 Nov 2026): a redirecting journey URL
// loaded directly — a refresh, a shared link, a
// bookmark — served the error page instead of its
// destination. The route's loading boundary flushes
// the shell with HTTP 200 before the page's async
// resolution completes, so a redirect() thrown from
// the page cannot produce an HTTP 307 for a plain
// load; the throw lands on the error boundary. A
// client-side navigation still got the 307, which is
// why the fault hid: every pick worked, every direct
// load of a redirecting URL did not. The fix renders
// a client-side navigation to the same URL for plain
// loads (lib/redirect-or-render.tsx). These specs pin
// the plain-load landing on both journey routes that
// redirect — the home check and the postcode form.
//
// The witness shape is a pick the directory does not
// hold: live, AL10 0AR's Aragon House — a terminated
// postcode, its sale filed, its directory row skipped
// by the loader's rule — whose pick resolves to
// nothing. The fixture database holds no such
// postcode, so the specs use a postcode the directory
// cannot hold at all: the same null resolution, the
// same redirect branch, and the landing — never the
// error page — is what they pin. (Whether the
// terminated postcode's home itself serves is the
// founder's ruling on the directory data, not this
// fix: the home cannot serve until that is decided.)
test.describe("BUG-186 — a redirecting journey URL loaded directly lands, never the error page", () => {
  test(
    "a full page load of a pick the directory does not hold lands on the landing, never the error page",
    { tag: "@regression" },
    async ({ page }) => {
      // A home key for a postcode the directory does
      // not file: the resolution is null, the page
      // redirects — first to the postcode's own check,
      // then, the postcode itself unplaceable, to the
      // landing with the unplaced notice. (BUG-186,
      // closed: the redirect carries ?notice=unplaced.)
      await page.goto("/search/home?postcode=ZZ9+9ZZ&home=FOO");
      await page.waitForURL("**/?notice=unplaced");
      await expect(page.locator("h1")).not.toHaveText(HEADLINE);
      await expect(page.getByText(LINE)).toHaveCount(0);
      // The landing's search box is the way forward,
      // and it holds nothing of the failed pick.
      await expect(page.locator("#postcode")).toHaveValue("");
    },
  );

  test(
    "a full page load of an unplaceable postcode on the postcode form lands the same way",
    { tag: "@regression" },
    async ({ page }) => {
      // The same trap in the postcode form's own
      // redirect (rung 4 — unplaceable): a direct load
      // used to serve the error page here too.
      await page.goto("/search?postcode=ZZ9+9ZZ");
      await page.waitForURL("**/?notice=unplaced");
      await expect(page.locator("h1")).not.toHaveText(HEADLINE);
      await expect(page.getByText(LINE)).toHaveCount(0);
      await expect(page.locator("#postcode")).toHaveValue("");
    },
  );
});
