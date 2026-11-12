import { describe, expect, it } from "vitest";

import { SITE_NAME, SITE_STRAPLINE } from "../lib/site";

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
