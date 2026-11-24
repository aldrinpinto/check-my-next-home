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
//
// T-WEB map (M7.15 citation tidy):
//   T-WEB-06 (sample report honesty) — the "sample report
//     honesty" describe at the foot of this file (the
//     M7.15 follow-up's item 4c); the PAGE_SEO loop above
//     also serves the row's route metadata.
//   No T-WEB row: the remaining specs discharge M7.8's
//   adopted scope (locked metadata, the robots lock,
//   related checks, the guides hub, the chrome pages).

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
    "the guides are listed in the footer's Guides group — never the header",
    { tag: "@regression" },
    async ({ page }) => {
      // BUG-230 (founder-approved prep, 24 Nov 2026)
      // supersedes the 18 Nov 2026 ruling that the footer
      // carry ONE Guides link: the footer's Guides group
      // lists the three guides individually under a
      // "Guides" heading that links to the /guides hub.
      // The header carries no guides link at all.
      await page.goto("/");
      await expect(page.locator('header a[href^="/guides"]')).toHaveCount(0);
      await expect(page.locator('footer a[href="/guides"]')).toHaveCount(1);
      await expect(page.locator('footer a[href^="/guides/"]')).toHaveCount(3);
      await page.goto("/check/crime");
      await expect(page.locator('header a[href^="/guides"]')).toHaveCount(0);
      await expect(page.locator('footer a[href="/guides"]')).toHaveCount(1);
      await expect(page.locator('footer a[href^="/guides/"]')).toHaveCount(3);
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
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("12 Willow Close");
      await page.goto("/contact");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contact");
      await page.goto("/privacy");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy policy");
    },
  );

  // The parity guards (D1/D1a, parity fix stack,
  // 18 Nov 2026): the site pages once rendered squeezed
  // into the reading column and About's cards stacked —
  // copy-correct, layout-wrong, and nothing caught it.
  // These assertions measure the layout itself, so the
  // divergence cannot return silently: the main is not
  // width-capped, and About's cards sit in a real grid.
  // (The D2 chrome-family part of the guard is superseded
  // by the unified-chrome test below: the founder retired
  // the content chrome on 18 Nov 2026.)
  test(
    "the site pages keep the sample's measure and About's card grid",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/about");
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
    },
  );

  // Chrome unification (founder ruling, 18 Nov 2026): ONE
  // header and ONE footer on every page — the landing
  // (app) forms. The same unified chrome must render on
  // the landing route, a content route, /shortlist and a
  // results route: the Roof-Tick header with the brand
  // block as one home link, and the app footer with the
  // Privacy policy link and its bottom row — the sources
  // line that stood at the row's extreme bottom-right
  // is removed (BUG-197, founder-directed 23 Nov 2026).
  test(
    "every surface renders the one unified header and footer",
    { tag: "@regression" },
    async ({ page }) => {
      for (const path of ["/", "/about", "/shortlist", "/search/home?postcode=CM3%202JT"]) {
        await page.goto(path);
        // No trace of the retired content chrome.
        await expect(page.locator("header.site-header--content")).toHaveCount(0);
        await expect(page.locator("footer.site-footer--content")).toHaveCount(0);
        // The unified header, with the brand block as one
        // Link home carrying the Roof-Tick mark.
        await expect(page.locator("header.site-header")).toHaveCount(1);
        const brand = page.locator('header.site-header a.brand[href="/"]');
        await expect(brand).toHaveCount(1);
        await expect(brand.locator('img[src="/brand/logo-mark.svg"]')).toHaveCount(1);
        await expect(brand.locator(".brand__name")).toHaveText("Check My Next Home");
        // The unified footer, with Privacy policy in its
        // link row.
        await expect(page.locator("footer.site-footer")).toHaveCount(1);
        await expect(page.locator('footer a[href="/privacy"]')).toHaveCount(1);
        await expect(page.locator('footer a[href="/privacy"]')).toHaveText("Privacy policy");
        // The sources line is gone (BUG-197): no element
        // carries it on any surface, and the sentence
        // stands nowhere in the footer. The bottom row
        // still stands below the main footer row, holding
        // the © line at the small-print measure.
        await expect(page.locator("footer .site-footer__sources")).toHaveCount(0);
        await expect(page.locator("footer.site-footer")).not.toContainText(
          "Data from named official sources. Facts, not scores.",
        );
        const geometry = await page.locator("footer.site-footer").evaluate((footer) => {
          const bottomEl = footer.querySelector(".site-footer__bottom")!;
          const innerEl = footer.querySelector(".site-footer__inner")!;
          const copyrightEl = footer.querySelector(".site-footer__copyright")!;
          const bottomBox = bottomEl.getBoundingClientRect();
          const innerBox = innerEl.getBoundingClientRect();
          return {
            copyrightFontSize: parseFloat(getComputedStyle(copyrightEl).fontSize),
            innerFontSize: parseFloat(getComputedStyle(innerEl).fontSize),
            bottomBelowInner: bottomBox.top >= innerBox.bottom - 1,
          };
        });
        expect(geometry.copyrightFontSize).toBeLessThan(geometry.innerFontSize);
        expect(geometry.bottomBelowInner).toBe(true);
      }
    },
  );
});

test.describe("sample report honesty — regression", () => {
  test(
    "T-WEB-06: the sample is watermarked, banners its invented home, and names no real home",
    { tag: "@regression" },
    async ({ page }) => {
      // M7.15 follow-up, gap-check item 4c: T-WEB-06's
      // served-page assertions — the watermark, the
      // invented-example banner, the fiction home.
      // BUG-159: the sample is now the generated report
      // (assembled per section from the golden homes,
      // anonymised), so the banner discloses the
      // combination, the flood pictures are the pipeline's
      // own maps, and the leak guard is asserted at
      // browser level: no contributing home is named.
      await page.goto("/sample-report");

      // The banner: the SAMPLE pill and the invented-
      // example paragraph, verbatim.
      await expect(page.locator(".sample-pill")).toHaveText("SAMPLE");
      await expect(page.locator(".sample-banner")).toContainText(
        "This is a sample report, so you can see exactly what a detailed report looks like before you ever pay for one. The home in this sample is an invented example — its facts are drawn from real checks of real homes, combined section by section and anonymised — and the document below follows the format every detailed report follows.",
      );

      // The watermark: eight SAMPLE marks over the page.
      const marks = page.locator(".watermark span");
      await expect(marks).toHaveCount(8);
      for (let i = 0; i < 8; i++) await expect(marks.nth(i)).toHaveText("SAMPLE");

      // The dummy home, in the Master's settled form.
      await expect(page.locator("h1")).toHaveText("12 Willow Close");
      await expect(page.locator("main")).toContainText("Millbrook, Kingsford, Kent MB3 4QX");

      // The leak guard at browser level: the generated
      // document is the pipeline's own (its Flood risk
      // section stands) and no contributing home's
      // identity appears.
      await expect(page.locator("main")).toContainText("Flood risk");
      await expect(page.locator("main")).not.toContainText("Birkdale Rise");
      // The founder's suppression ruling (22 Nov 2026):
      // the bare street name appears nowhere either, in
      // any case form — a banned-named entry (a dentist
      // trading as "Birkdale Dental") is dropped from the
      // sample's lists whole, never renamed.
      await expect(page.locator("main")).not.toContainText("Birkdale");
      await expect(page.locator("main")).not.toContainText("birkdale");
      await expect(page.locator("main")).not.toContainText("CM3 2JT");
      await expect(page.locator("main")).not.toContainText("E16 1AS");
      await expect(page.locator("main")).not.toContainText("E16 1GN");
      await expect(page.locator("main")).not.toContainText("KT17 1FH");
    },
  );
});
