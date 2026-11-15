import { describe, expect, it } from "vitest";

import * as site from "../lib/site";
import {
  COMPANY_OWNERSHIP_ENABLED,
  DISCLAIMER_SHORT_FORM,
  HOME_HERO_HEADLINE,
  SITE_DESCRIPTION,
  SITE_MANIFESTO,
  SITE_NAME,
  SITE_TAGLINE,
  TEST_BANNER_TEXT,
  showTestBanner,
} from "../lib/site";

describe("site identity", () => {
  it("uses the decided name", () => {
    expect(SITE_NAME).toBe("Check My Next Home");
  });

  // D38 (M6.10) — this pin change IS the decision record. The
  // previous pin held SITE_STRAPLINE to the M3 family headline
  // as "the agreed family strapline"; D12 (13 Nov 2026) had
  // already superseded it with the tagline below, but neither
  // the code nor this test was ever updated, so the drift was
  // locked in by the test. The reconciliation: the tagline is
  // the site's line, the manifesto is the hero kicker, and the
  // family headline survives only as homepage hero copy.
  it("uses the decided tagline (D12)", () => {
    expect(SITE_TAGLINE).toBe("Check the house. Choose the home.");
  });

  it("uses the decided manifesto, as hero kicker only (D12)", () => {
    expect(SITE_MANIFESTO).toBe("For the family who'll live there — not just the buyer.");
  });

  it("keeps the family headline as homepage hero copy only (D38)", () => {
    expect(HOME_HERO_HEADLINE).toBe(
      "Your family's next home — check what the listing doesn't tell you.",
    );
  });

  it("no longer carries a site-wide strapline constant", () => {
    expect("SITE_STRAPLINE" in site).toBe(false);
  });

  it("uses the locked homepage meta description (D38)", () => {
    expect(SITE_DESCRIPTION).toBe(
      "The checks to run before buying a home — schools, flooding, crime counts, sold prices, broadband and more, from one postcode. Official data as published, with its source and date.",
    );
  });
});

describe("D9 short form (M6.10, D38)", () => {
  it("is pinned verbatim — M7 renders this string beside the results", () => {
    expect(DISCLAIMER_SHORT_FORM).toBe(
      "We present official data as it is published, with its source and date. We do not score, rate or recommend homes or areas.",
    );
  });
});

describe("TEST banner (M2.8)", () => {
  it("uses the agreed strip wording", () => {
    expect(TEST_BANNER_TEXT).toBe("TEST SITE — not the real service");
  });

  it("shows on the play environment", () => {
    expect(showTestBanner("play")).toBe(true);
  });

  it("shows when the environment name is unset", () => {
    expect(showTestBanner(undefined)).toBe(true);
  });

  it("never shows on the real site (production)", () => {
    expect(showTestBanner("production")).toBe(false);
  });
});

describe("company ownership flag (M5.13 / D18)", () => {
  it("defaults to OFF — the filed data must not surface anywhere user-facing", () => {
    // The flag opens only when HM Land Registry Data
    // Services' written clause-3.2 answer is yes AND the
    // founder gives the go. Flipping it is a deliberate,
    // reviewed code change — if this test fails because
    // the constant was changed, that change IS the
    // decision, and it must be the founder's.
    expect(COMPANY_OWNERSHIP_ENABLED).toBe(false);
  });
});
