import { expect, test } from "@playwright/test";

// M7.2 E2E (D68) — the home page. Smoke: the landing page
// serves with the hero (manifesto kicker, H1, sub-line, the
// three captioned panels and the postcode box together) —
// the first leg of the critical check journey. At M7.2
// "usable" was pinned by the founder's ruling as renders-and-
// accepts-input with an inert submit; M7.3 wires the real
// journey into the same box (e2e/journey.e2e.ts owns the
// wired flows). Everything else this step makes testable is
// Regression.

test.describe("home page — smoke", () => {
  test(
    "the landing serves with the hero together and the postcode box usable",
    { tag: "@smoke" },
    async ({ page }) => {
      await page.goto("/");

      const kicker = page.locator(".hero__kicker");
      await expect(kicker).toHaveText("For the family who'll live there — not just the buyer.");
      await expect(page.locator("h1")).toHaveText(
        "You're not buying a house. You're choosing your family's home.",
      );
      await expect(page.locator(".hero .type-lead")).toContainText(
        "We check what the listing doesn't tell you",
      );
      // D70 R2/D20: the hero tagline line is dropped, and the
      // three captioned panels sit between the sub-line and
      // the box.
      await expect(page.locator(".hero__tagline")).toHaveCount(0);
      await expect(page.locator(".hero__panel")).toHaveCount(3);
      await expect(page.locator(".hero__panel-title").first()).toHaveText("Moving-in day");

      // The hero's pinned order, top to bottom — the same order
      // the phone stacks in, since it is the document order.
      const tops = await page.evaluate(() => {
        const pick = (selector: string) =>
          document.querySelector(selector)?.getBoundingClientRect().top ?? Number.NaN;
        return {
          kicker: pick(".hero__kicker"),
          headline: pick("h1"),
          subline: pick(".hero .type-lead"),
          panels: pick(".hero__panels"),
          box: pick("#postcode"),
        };
      });
      expect(tops.kicker).toBeLessThan(tops.headline);
      expect(tops.headline).toBeLessThan(tops.subline);
      expect(tops.subline).toBeLessThan(tops.panels);
      expect(tops.panels).toBeLessThan(tops.box);

      // The example-check action beside the box (D70 R2).
      await expect(page.getByRole("link", { name: "See an example check" })).toHaveAttribute(
        "href",
        "/sample-report",
      );

      // Usable, as pinned: renders and accepts input.
      const box = page.locator("#postcode");
      await expect(box).toBeVisible();
      await box.fill("CM3 2JT");
      await expect(box).toHaveValue("CM3 2JT");
    },
  );
});

test.describe("home page — regression", () => {
  test(
    "the wired postcode box carries the re-pinned label and hint, with no client-side validation",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      const box = page.locator("#postcode");

      // M7.3's re-pin for the wider input (fold-in 7).
      await expect(page.locator(".field__label")).toHaveText("Postcode or address");
      await expect(page.locator(".field__hint")).toHaveText(
        "For example, CM3 2JT — or the full address, with its postcode.",
      );

      // The box itself still does no tidying or validation:
      // a partial postcode is a valid search on the ladder,
      // never an error the landing marks.
      await box.fill("E16");
      await expect(box).toHaveValue("E16");
      await expect(box).not.toHaveAttribute("aria-invalid", "true");
      await expect(page.locator(".field__message")).toHaveCount(0);
    },
  );

  test(
    "the three audience cards render as text-only cards with their check lists (D70 R3)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".audience-cards .card__title")).toHaveText([
        "Moving as a couple",
        "Moving with kids",
        "Moving with pets",
      ]);

      // The design's card is title + intro + check list: no
      // button, no artwork (the art lives in the hero strip).
      const firstCard = page.locator(".audience-cards .card").first();
      await expect(firstCard.locator(".card__checks li")).toHaveCount(4);
      await expect(firstCard.locator(".card__checks")).toContainText(
        "Trains and buses for the commute",
      );
      await expect(firstCard.getByRole("button")).toHaveCount(0);
      await expect(firstCard.locator("img")).toHaveCount(0);
    },
  );

  test(
    "what it checks lists the nine checks under their plain names, with no links",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      const items = page.locator(".checks-list li");
      await expect(items).toHaveCount(9);
      // D70 R4: the list is re-based on the plain check names
      // (the checking rows' labels, qualifiers included).
      await expect(page.locator(".checks-list__name")).toHaveText([
        "Schools — nearest primary & secondary, with Ofsted",
        "Nurseries & pre-schools",
        "GP, NHS dentist & pharmacy",
        "Hospitals, A&E & maternity",
        "Parks, vets & dog-walking areas",
        "Shops & transport — supermarkets, bus stops, stations",
        "Food & drink, leisure & gyms, places to visit, worship & libraries",
        "Flood — rivers & sea, and surface water",
        "Sold history, council tax, EPC, planning applications & constraints, ownership",
      ]);
      await expect(page.locator(".checks-list a")).toHaveCount(0);
    },
  );

  test(
    "the manifesto block appears once, mid-page, and the SAMPLE link is labelled",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".manifesto-block__headline")).toHaveText(
        "A house is bricks. A home is family.",
      );
      await expect(page.locator(".manifesto-block")).toHaveCount(1);

      const sample = page.getByRole("link", { name: "See a SAMPLE report" });
      await expect(sample).toHaveAttribute("href", "/sample-report");
      await expect(page.locator("main")).not.toContainText("Coming soon");
    },
  );
});
