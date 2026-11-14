import { describe, expect, it } from "vitest";

import {
  COMPANY_OWNERSHIP_ENABLED,
  SITE_NAME,
  SITE_STRAPLINE,
  TEST_BANNER_TEXT,
  showTestBanner,
} from "../lib/site";

describe("site identity", () => {
  it("uses the decided name", () => {
    expect(SITE_NAME).toBe("Check My Next Home");
  });

  it("uses the agreed family strapline", () => {
    expect(SITE_STRAPLINE).toBe(
      "Your family's next home — check what the listing doesn't tell you.",
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
