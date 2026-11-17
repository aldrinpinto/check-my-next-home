import { expect, test } from "@playwright/test";

// M7.2 E2E (D68) — the home page. Smoke: the landing page
// serves with the hero (manifesto kicker, H1, sub-line, the
// bare postcode box and the small line together) —
// the first leg of the critical check journey. At M7.2
// "usable" was pinned by the founder's ruling as renders-and-
// accepts-input with an inert submit; M7.3 wires the real
// journey into the same box (e2e/journey.e2e.ts owns the
// wired flows). Everything else this step makes testable is
// Regression.
// Fidelity pass 2 re-pins (17 Nov 2026): the hero is the
// decided sample page's — the imagery panels and the
// example-check action are retired, the box is the sample's
// bare form, and the small line closes the hero.

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
      // D70 R2/D20: the hero tagline line is dropped.
      // Fidelity pass 2: the panels and the example-check
      // action are dropped too — the sample goes from the
      // sub-line straight to the search row.
      await expect(page.locator(".hero__tagline")).toHaveCount(0);
      await expect(page.locator(".hero__panel")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "See an example check" })).toHaveCount(0);

      // The hero's pinned order, top to bottom — the same order
      // the phone stacks in, since it is the document order.
      const tops = await page.evaluate(() => {
        const pick = (selector: string) =>
          document.querySelector(selector)?.getBoundingClientRect().top ?? Number.NaN;
        return {
          kicker: pick(".hero__kicker"),
          headline: pick("h1"),
          subline: pick(".hero .type-lead"),
          box: pick("#postcode"),
          small: pick(".hero__small"),
        };
      });
      expect(tops.kicker).toBeLessThan(tops.headline);
      expect(tops.headline).toBeLessThan(tops.subline);
      expect(tops.subline).toBeLessThan(tops.box);
      expect(tops.box).toBeLessThan(tops.small);

      // The sample's small line closes the hero.
      await expect(page.locator(".hero__small")).toHaveText(
        "Free headlines for every home, from named official sources. Detailed report £4.99 — one home, no account, no subscription.",
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
    "the wired postcode box is the sample's bare form on the landing, with no client-side validation",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      const box = page.locator("#postcode");

      // Fidelity pass 2: the landing's box is bare — no
      // visible label or hint (the label survives, visually
      // hidden, as the field's accessible name), the
      // sample's placeholder in the field, and the Brass
      // button in the sample's words. The labelled form
      // (M7.3's re-pin for the wider input) serves the
      // journey's retry surfaces — its label and hint are
      // asserted on the no-location route in
      // e2e/journey.e2e.ts.
      await expect(page.locator(".field__hint")).toHaveCount(0);
      await expect(page.locator(".postcode-box .visually-hidden")).toHaveText(
        "Postcode or address",
      );
      await expect(box).toHaveAttribute("placeholder", "Enter a postcode — e.g. SW1A 1AA");
      await expect(page.getByRole("button", { name: "Check this home" })).toBeVisible();

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
      // button, no artwork.
      const firstCard = page.locator(".audience-cards .card").first();
      await expect(firstCard.locator(".card__checks li")).toHaveCount(4);
      await expect(firstCard.locator(".card__checks")).toContainText(
        "Trains and buses for the commute",
      );
      await expect(firstCard.getByRole("button")).toHaveCount(0);
      await expect(firstCard.locator("img")).toHaveCount(0);
    },
  );

  // Retired at fidelity pass 2: the "what it checks" spec —
  // the ruled list leaves the landing (the tile grid is the
  // page's only tour of the checks, as in the sample).

  test(
    "the manifesto block appears once, mid-page, and the removed example section stays removed",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".manifesto-block__headline")).toHaveText(
        "A house is bricks. A home is family.",
      );
      await expect(page.locator(".manifesto-block")).toHaveCount(1);

      // The "See a full example" section — the home of the
      // "See a SAMPLE report" link — was removed by the
      // founder's ruling and the fold-in (CI #205 fix: this
      // spec still expected the link). The report band's
      // own CTA, "See a sample report", is a different
      // label and stays; the exact-case locator keeps the
      // two apart.
      await expect(
        page.getByRole("link", { name: "See a SAMPLE report", exact: true }),
      ).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText("See a full example");
      await expect(page.locator("main")).not.toContainText("Coming soon");
    },
  );

  test(
    "the decided page's sections render: tile grid, steps, report band, centred manifesto (founder follow-on)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/");

      // The nine tiles, in the sample's order.
      await expect(page.locator(".check-tile")).toHaveCount(9);
      await expect(page.locator(".check-tile__title")).toHaveText([
        "Schools, nurseries & childminders",
        "Doctors, dentists & vets",
        "Food, leisure & everyday life",
        "Safety around the home",
        "Your neighbours & the area",
        "Plans that could change the street",
        "Flood risk",
        "The cost of living",
        "What homes here actually sold for",
      ]);

      // The four steps, numbered in their circles.
      await expect(page.locator(".how-step")).toHaveCount(4);
      await expect(page.locator(".how-step__n")).toHaveText(["1", "2", "3", "4"]);
      await expect(page.locator(".how-step__title")).toHaveText([
        "Enter the postcode",
        "Pick your home",
        "Read the free headlines",
        "Go deeper for £4.99",
      ]);

      // The band: heading, price block, and the sample action.
      await expect(page.locator(".report-band__heading")).toHaveText("The detailed report");
      await expect(page.locator(".report-band__price")).toHaveText("£4.99");
      await expect(
        page.locator(".report-band").getByRole("link", { name: "See a sample report" }),
      ).toHaveAttribute("href", "/sample-report");

      // The manifesto in the sample's centred form: its why
      // line is the sample's, centred in the block.
      const why = page.locator(".manifesto-block__why");
      await expect(why).toHaveText(
        "Behind every check is a family's daily life — the school run, the walk to the park, the monthly bills. That's why we check what the listing doesn't tell you.",
      );
      await expect(why).toHaveCSS("text-align", "center");
    },
  );
});
