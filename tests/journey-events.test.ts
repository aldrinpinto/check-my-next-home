import { describe, expect, it } from "vitest";

import {
  assertJourneyEventSafe,
  browserClassOf,
  errorFingerprint,
  JOURNEY_EVENT_CATALOGUE,
  JOURNEY_EVENT_NAMES,
  routePatternOf,
  sanitiseErrorMessage,
  sanitiseErrorName,
  sectionsAndStatesOf,
  stepOfRoutePattern,
  type JourneyEventInput,
} from "../lib/journey-events";

// M7.14 — Measure the journeys: the pure core's pins.
// The catalogue is the step's fixed list; the payload
// scan is the step's test-first proof that no event can
// carry an address, a full postcode or an email.

describe("the pinned catalogue", () => {
  it("is exactly the step's list of measured moments, plus the error class", () => {
    expect(new Set(JOURNEY_EVENT_NAMES)).toEqual(
      new Set([
        "page_view",
        "check_started",
        "check_completed",
        "shortlist_add",
        "shortlist_remove",
        "comparison_opened",
        "report_clicked",
        "checkout_started",
        "checkout_paid",
        "gift_claimed",
        "gift_redeemed",
        "page_error",
      ]),
    );
  });

  it("keeps the money and gift facts server-origin only", () => {
    const serverOnly = JOURNEY_EVENT_CATALOGUE.filter((spec) => spec.origin === "server").map(
      (spec) => spec.name,
    );
    expect(new Set(serverOnly)).toEqual(
      new Set(["checkout_paid", "gift_claimed", "gift_redeemed"]),
    );
  });
});

describe("the payload scan (no address, no full postcode, no email)", () => {
  const clean: JourneyEventInput = {
    event: "check_completed",
    routePattern: "/search/home",
    rung: 1,
    nation: "england",
    sections: ["soldPrices", "crime"],
    states: { soldPrices: "served", crime: "served" },
    details: { step: "check" },
  };

  it("passes a clean payload untouched", () => {
    expect(assertJourneyEventSafe(clean)).toBe(clean);
  });

  it("passes an outward code — a district class is not a full postcode", () => {
    expect(() =>
      assertJourneyEventSafe({ event: "page_view", details: { outward: "CM3" } }),
    ).not.toThrow();
  });

  it("rejects a full postcode in a details value", () => {
    expect(() =>
      assertJourneyEventSafe({ event: "page_view", details: { note: "checked CM3 2JT" } }),
    ).toThrow(/full postcode/);
  });

  it("rejects a full postcode hiding in a states value", () => {
    expect(() =>
      assertJourneyEventSafe({
        event: "check_completed",
        states: { crime: "served at CM3 2JT" },
      }),
    ).toThrow(/full postcode/);
  });

  it("rejects an email anywhere, nested or not", () => {
    expect(() =>
      assertJourneyEventSafe({
        event: "gift_claimed",
        details: { nested: { who: "someone@example.co.uk" } },
      }),
    ).toThrow(/email/);
  });

  it("rejects the forbidden keys outright, at any depth", () => {
    for (const key of ["address", "postcode", "email", "token", "home", "url"]) {
      expect(() => assertJourneyEventSafe({ event: "page_view", details: { [key]: "x" } })).toThrow(
        /forbidden key/,
      );
    }
  });

  it("rejects an error message carrying an email (the scan covers message content)", () => {
    expect(() =>
      assertJourneyEventSafe({
        event: "page_error",
        errorName: "TypeError",
        errorMessage: "failed for user someone@example.co.uk",
      }),
    ).toThrow(/email/);
  });

  it("rejects a route value that is not a pattern", () => {
    expect(() =>
      assertJourneyEventSafe({ event: "page_view", routePattern: "/search?postcode=CM3 2JT" }),
    ).toThrow(/route pattern/);
    expect(() =>
      assertJourneyEventSafe({ event: "page_view", routePattern: "search/home" }),
    ).toThrow(/route pattern/);
  });

  it("rejects an event the plan never pinned", () => {
    const unpinned = { event: "hovered_over_a_photo" } as unknown as JourneyEventInput;
    expect(() => assertJourneyEventSafe(unpinned)).toThrow(/unknown journey event/);
  });
});

describe("error field sanitising", () => {
  it("truncates a message at 300 characters", () => {
    const long = "x".repeat(450);
    expect(sanitiseErrorMessage(long)).toHaveLength(300);
  });

  it("stores a message carrying an email or a postcode as null — the error still records", () => {
    expect(sanitiseErrorMessage("fetch to /api/check?postcode=CM3 2JT failed")).toBeNull();
    expect(sanitiseErrorMessage("boom for someone@example.co.uk")).toBeNull();
    expect(sanitiseErrorMessage("Cannot read properties of undefined")).toBe(
      "Cannot read properties of undefined",
    );
    expect(sanitiseErrorMessage("")).toBeNull();
    expect(sanitiseErrorMessage(undefined)).toBeNull();
  });

  it("keeps a real error name and refuses a sentence", () => {
    expect(sanitiseErrorName("TypeError")).toBe("TypeError");
    expect(sanitiseErrorName("CheckRequestFailed")).toBe("CheckRequestFailed");
    expect(sanitiseErrorName("a whole sentence about CM3 2JT")).toBeNull();
    expect(sanitiseErrorName("x".repeat(90))).toBeNull();
  });
});

describe("route patterns", () => {
  it("keeps the pages whose path is their pattern", () => {
    expect(routePatternOf("/")).toBe("/");
    expect(routePatternOf("/search/home")).toBe("/search/home");
    expect(routePatternOf("/privacy")).toBe("/privacy");
    expect(routePatternOf("/shortlist")).toBe("/shortlist");
  });

  it("strips a query string before patterning", () => {
    expect(routePatternOf("/search?postcode=CM3")).toBe("/search");
  });

  it("drops the gift token segment wholesale", () => {
    expect(routePatternOf("/gift")).toBe("/gift");
    expect(routePatternOf("/gift/a-very-secret-token-value")).toBe("/gift");
    expect(routePatternOf("/gift/a-token/claimed")).toBe("/gift");
  });

  it("keeps known check and guide slugs, brackets the unknown", () => {
    expect(routePatternOf("/check/schools")).toBe("/check/schools");
    expect(routePatternOf("/check/not-a-real-page")).toBe("/check/[slug]");
    expect(routePatternOf("/guides/is-this-area-good-for-families")).toBe(
      "/guides/is-this-area-good-for-families",
    );
    expect(routePatternOf("/guides/something-new")).toBe("/guides/[slug]");
  });

  it("collapses anything unrecognised to /other", () => {
    expect(routePatternOf("/wp-admin")).toBe("/other");
    expect(routePatternOf("/api/check/nearby")).toBe("/api");
  });

  it("derives the journey step from the pattern", () => {
    expect(stepOfRoutePattern("/")).toBe("landing");
    expect(stepOfRoutePattern("/search/home")).toBe("check");
    expect(stepOfRoutePattern("/gift")).toBe("claim");
    expect(stepOfRoutePattern("/shortlist")).toBe("shortlist");
    expect(stepOfRoutePattern("/check/schools")).toBe("guide");
    expect(stepOfRoutePattern(null)).toBe("page");
  });
});

describe("browser class", () => {
  it("classes the common browsers and never keeps the string", () => {
    expect(
      browserClassOf("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"),
    ).toBe("chrome");
    expect(
      browserClassOf(
        "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0",
      ),
    ).toBe("edge");
    expect(browserClassOf("Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Firefox/121.0")).toBe(
      "firefox",
    );
    expect(
      browserClassOf(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 Version/17.2 Safari/605.1.15",
      ),
    ).toBe("safari");
    expect(browserClassOf(null)).toBeNull();
    expect(browserClassOf("something-exotic")).toBe("other");
  });
});

describe("fingerprints and the completion derivation", () => {
  it("fingerprints are stable and separate by name and page", () => {
    const a = errorFingerprint({ event: "page_error", errorName: "TypeError", routePattern: "/" });
    const b = errorFingerprint({ event: "page_error", errorName: "TypeError", routePattern: "/" });
    const c = errorFingerprint({
      event: "page_error",
      errorName: "TypeError",
      routePattern: "/gift",
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("derives sections and states from a served bundle's sections", () => {
    const derived = sectionsAndStatesOf({
      soldPrices: { state: "served" },
      crime: { state: "not-filed" },
      nearby: { rows: [] },
    });
    expect(derived.sections).toEqual(["soldPrices", "crime", "nearby"]);
    expect(derived.states).toEqual({ soldPrices: "served", crime: "not-filed" });
  });
});
