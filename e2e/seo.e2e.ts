import { PAGE_SEO } from "../lib/seo";
import { expect, test } from "./fixtures";

// M7.8 E2E (D68) — the SEO landing pages, the chrome pages
// and the indexing behaviour, against the SERVED app.
// Regression only: no Smoke is authored by this step, and
// no promotions happen until the M12 go-live review (D68).
//
// What a browser can honestly prove here, per the step's
// adopted gap check: each indexable route serves its locked
// title and meta description (title and description are
// environment-independent — the pairs are constants), and
// the journey routes carry their robots lock in the served
// head. What it cannot prove is production indexing itself
// — the harness server runs under a non-production name,
// where everything is noindexed by design — so the
// production assertions live at metadata level in
// tests/seo-pages.test.ts, and this spec asserts presence,
// not the production distinction.

test.describe("SEO pages — regression", () => {
  for (const [path, pair] of Object.entries(PAGE_SEO)) {
    test(
      `${path} serves its locked title and description`,
      { tag: "@regression" },
      async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveTitle(pair.title);
        await expect(page.locator('meta[name="description"]')).toHaveAttribute(
          "content",
          pair.description,
        );
      },
    );
  }

  test(
    "the journey routes carry the robots lock in the served head",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search?postcode=CM3%202JT");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await page.goto("/search/home?postcode=CM3%202JT");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    },
  );

  test(
    "a check page carries its related checks, its guide and the checker",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/check/flood-risk");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Flood risk for a postcode, from the published maps",
      );
      // The mapping's flood row: noise + air quality, and
      // the checks-before-buying guide.
      await expect(page.locator('a[href="/check/noise"]')).toBeVisible();
      await expect(page.locator('a[href="/check/air-quality"]')).toBeVisible();
      await expect(page.locator('a[href="/guides/checks-before-buying-a-house"]')).toBeVisible();
      // The checker closes the page.
      await expect(page.locator("#postcode")).toBeVisible();
    },
  );

  test(
    "the guides are reached from the footer's hub link only — never the header, never individually",
    { tag: "@regression" },
    async ({ page }) => {
      // The founder's ruling of 18 Nov 2026 supersedes the
      // M7.8 landers-only form for the footer only: the
      // footer carries ONE Guides link, to the /guides hub;
      // no individual guide is linked from the chrome, and
      // the header carries no guides link at all.
      await page.goto("/");
      await expect(page.locator('header a[href^="/guides"]')).toHaveCount(0);
      await expect(page.locator('footer a[href="/guides"]')).toHaveCount(1);
      await expect(page.locator('footer a[href^="/guides/"]')).toHaveCount(0);
      await page.goto("/check/crime");
      await expect(page.locator('header a[href^="/guides"]')).toHaveCount(0);
      await expect(page.locator('footer a[href="/guides"]')).toHaveCount(1);
      await expect(page.locator('footer a[href^="/guides/"]')).toHaveCount(0);
    },
  );

  test(
    "the guides hub lists all three guides and closes with the checker",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/guides");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Guides");
      for (const href of [
        "/guides/checks-before-buying-a-house",
        "/guides/buying-a-leasehold-flat",
        "/guides/is-this-area-good-for-families",
      ]) {
        await expect(page.locator(`a[href="${href}"]`)).toBeVisible();
      }
      await expect(page.locator("#postcode")).toBeVisible();
    },
  );

  test("the homepage tiles link to their check pages", { tag: "@regression" }, async ({ page }) => {
    await page.goto("/");
    for (const href of [
      "/check/schools",
      "/check/family-essentials",
      "/check/crime",
      "/check/planning-constraints",
      "/check/flood-risk",
      "/check/council-tax-band",
      "/check/sold-prices",
    ]) {
      await expect(page.locator(`.check-tiles a[href="${href}"]`)).toHaveCount(1);
    }
  });

  test(
    "the chrome pages render their finalised headings",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/how-we-check");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Where every fact comes from",
      );
      await page.goto("/about");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "A house is bricks. A home is family.",
      );
      await page.goto("/sample-report");
      await expect(page.getByText("This is a sample report")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("19 Birkdale Rise");
      await page.goto("/contact");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contact");
      await page.goto("/privacy");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy policy");
    },
  );

  // The parity guards (D1/D1a/D2, parity fix stack,
  // 18 Nov 2026): the site pages once rendered squeezed
  // into the reading column, About's cards stacked, under
  // the wrong chrome family — copy-correct, layout-wrong,
  // and nothing caught it. These assertions measure the
  // layout itself, so the divergence cannot return
  // silently: the content chrome is present, the main is
  // not width-capped, and About's cards sit in a real grid.
  test(
    "the site pages wear the content chrome at the sample's measure",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/about");
      await expect(page.locator("header.site-header--content")).toHaveCount(1);
      await expect(page.locator("footer.site-footer--content")).toHaveCount(1);
      const innerWidth = await page
        .locator(".site-pages__inner")
        .evaluate((element) => element.getBoundingClientRect().width);
      // The sample's 1080px measure at the desktop
      // viewport — the reading cap would give ~704px.
      expect(innerWidth).toBeGreaterThan(1000);
      const grid = page.locator(".about-grid");
      await expect(grid).toHaveCount(1);
      const columns = await grid.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
      );
      expect(columns).toBeGreaterThanOrEqual(2);
      // The footer sits flush under the cream main — the
      // closed band: no top margin on the content footer.
      const footerMarginTop = await page
        .locator("footer.site-footer--content")
        .evaluate((element) => parseFloat(getComputedStyle(element).marginTop));
      expect(footerMarginTop).toBe(0);
    },
  );

  test("the app pages keep the app chrome", { tag: "@regression" }, async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header.site-header--content")).toHaveCount(0);
    await expect(page.locator("footer.site-footer--content")).toHaveCount(0);
    await page.goto("/shortlist");
    await expect(page.locator("header.site-header--content")).toHaveCount(0);
  });
});
