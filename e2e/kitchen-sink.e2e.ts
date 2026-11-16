import { expect, test } from "@playwright/test";

// M7.1 E2E (D68) — the kitchen-sink render spec, tagged
// Regression: every block in the look & feel kit renders, in
// light mode only, on the built site. This step makes no
// visitor flow testable, so it contributes no Smoke test —
// the Smoke set starts at M7.2 with the landing page. Run
// against the static export: npm run build, then
// npm run test:e2e.

test.describe("kitchen sink — the M7.1 kit renders", () => {
  test(
    "every kit block renders, with the header and footer shells",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/kitchen-sink/");

      // The play build's TEST strip and the site shells.
      await expect(page.locator(".test-banner")).toHaveText("TEST SITE — not the real service");
      await expect(page.locator(".site-header .brand__name")).toHaveText("Check My Next Home");
      await expect(page.locator(".site-header .brand__tagline")).toHaveText(
        "Check the house. Choose the home.",
      );
      await expect(page.locator(".site-nav__link")).toHaveText([
        "How we check",
        "Guides",
        "Sample report",
        "Shortlist",
      ]);
      await expect(page.locator(".site-footer")).toBeVisible();
      await expect(page.locator(".site-footer .brand__name")).toHaveText("Check My Next Home");

      // All six colour swatches, Ink included.
      await expect(page.locator(".swatch")).toHaveCount(6);
      await expect(page.locator(".swatch__label")).toContainText([
        "#2F5D3E",
        "#1E402C",
        "#C29A3B",
        "#E4CF9A",
        "#FDF8E8",
        "#17201E",
      ]);

      // Buttons in their states, and the field block's states.
      await expect(page.getByRole("button", { name: "Primary button" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Quiet button" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Disabled button" })).toBeDisabled();
      const errorInput = page.locator("#ks-error");
      await expect(errorInput).toHaveAttribute("aria-invalid", "true");
      await expect(page.locator("#ks-error-message")).toContainText("full postcode");
      await expect(page.locator("#ks-success-message")).toContainText("works");

      // The pill family: the distance figure carries the colour.
      const figure = page.locator(".pill--distance .pill__figure");
      await expect(figure).toHaveText("0.4 miles");
      await expect(figure).toHaveCSS("color", "rgb(47, 93, 62)");
      await expect(page.locator(".pill--fact")).toBeVisible();

      // The table renders with its caption and rows.
      await expect(page.locator(".table caption")).toContainText("Example table");
      await expect(page.locator(".table tbody tr")).toHaveCount(3);

      // The three notice variants, labels carried as wording.
      await expect(page.locator(".notice--warning .notice__label")).toHaveText("Warning");
      await expect(page.locator(".notice--stale .notice__label")).toHaveText("Out of date");
      await expect(page.locator(".notice--gap .notice__label")).toHaveText(
        "Not in the data we hold",
      );
    },
  );

  test("the tabs follow the arrow-key pattern", { tag: "@regression" }, async ({ page }) => {
    await page.goto("/kitchen-sink/");
    const first = page.getByRole("tab", { name: "First tab" });
    const second = page.getByRole("tab", { name: "Second tab" });
    const third = page.getByRole("tab", { name: "Third tab" });

    await first.click();
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("first panel");

    await first.press("ArrowRight");
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("second panel");

    await second.press("End");
    await expect(third).toBeFocused();
    await expect(third).toHaveAttribute("aria-selected", "true");

    await third.press("Home");
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute("aria-selected", "true");
  });

  test(
    "at 360px the table takes its stacked-row form",
    { tag: "@regression" },
    async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
      const page = await context.newPage();
      await page.goto("/kitchen-sink/");
      const cellDisplay = await page
        .locator(".table tbody td")
        .first()
        .evaluate((element) => getComputedStyle(element).display);
      expect(cellDisplay).toBe("flex");
      const headerCellDisplay = await page
        .locator(".table thead")
        .evaluate((element) => getComputedStyle(element).position);
      expect(headerCellDisplay).toBe("absolute");
      await context.close();
    },
  );
});

test.describe("kitchen sink — with a dark OS preference", () => {
  test.use({ colorScheme: "dark" });

  test(
    "the kit stays light — there is no dark mode in V1 (D44)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/kitchen-sink/");
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(page.locator("body")).toHaveCSS("color", "rgb(23, 32, 30)");
    },
  );
});

test.describe("the built site shell", () => {
  test(
    "the homepage carries the header, the favicon set and the og:image",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".site-header .brand__name")).toHaveText("Check My Next Home");
      // The homepage itself is still the placeholder — M7.2
      // builds it. This step is judged by the shells and the
      // kitchen sink only.
      await expect(page.locator("main")).toContainText("Coming soon");

      const iconHrefs = await page
        .locator('link[rel="icon"]')
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      // Next appends a cache-busting query to each icon href.
      expect(iconHrefs.some((href) => href?.includes("/favicon.ico"))).toBe(true);
      expect(iconHrefs.some((href) => href?.includes("/icon.svg"))).toBe(true);
      expect(iconHrefs.some((href) => href?.includes("/icon.png"))).toBe(true);
      await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);

      const ogImage = page.locator('meta[property="og:image"]');
      await expect(ogImage).toHaveCount(1);
      await expect(ogImage).toHaveAttribute(
        "content",
        "https://checkmynexthome.co.uk/og-image.png",
      );
      await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
        "content",
        "1200",
      );
      await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute(
        "content",
        "630",
      );
    },
  );
});
