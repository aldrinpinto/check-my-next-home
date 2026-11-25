import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PlaceChoice from "../components/PlaceChoice";
import { classifyAddressInput } from "../lib/address";
import { districtOutcomesAllSettled } from "../lib/district-checking";
import type { CheckingGroupResult } from "../lib/journey";

// BUG-286 — the place link's checking screens.
//
// Hop 1: the picker must render without the district
// checking frame, so the place page streams its area
// furniture in behind it. The Suspense fallback is the
// bare-rows form (no settlement descriptions, bridge
// without its example postcode) — the accepted degraded
// state on failure, now also the state while the read
// runs. The settled form carries the descriptions and
// the bridge example, as before.
//
// Hop 2: when every district part has already settled,
// the checking screen completes at data speed instead
// of spacing the completions 720ms apart.

const done: CheckingGroupResult = { state: "done", line: "Done." };
const failed: CheckingGroupResult = { state: "failed", line: "Failed." };

describe("BUG-286 — the streamed picker's bare-rows fallback", () => {
  it("bare districts render rows with their links, no descriptions, bridge without example", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceChoice, {
        place: "Chelmsford",
        districts: [
          { outward: "CM1", settlements: [], examplePostcode: null },
          { outward: "CM3", settlements: [], examplePostcode: null },
        ],
      }),
    );
    expect(html).toContain('href="/search?outward=CM1"');
    expect(html).toContain('href="/search?outward=CM3"');
    expect(html).toContain("CM1 — Chelmsford");
    expect(html).toContain("CM3 — Chelmsford");
    expect(html).toContain("2 postcode districts");
    expect(html).not.toContain("district-place__detail");
    expect(html).toContain(
      "Checking one home in Chelmsford instead? Type its full postcode and the check goes straight to that home.",
    );
  });

  it("settled districts render descriptions and the bridge example", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceChoice, {
        place: "Chelmsford",
        districts: [
          { outward: "CM1", settlements: ["Chelmsford"], examplePostcode: null },
          {
            outward: "CM3",
            settlements: ["Danbury", "Hatfield Peverel"],
            examplePostcode: "CM3 2JT",
          },
        ],
      }),
    );
    expect(html).toContain("district-place__detail");
    expect(html).toContain("Danbury, Hatfield Peverel");
    expect(html).toContain(
      "Checking one home in Chelmsford instead? Type its full postcode — e.g. CM3 2JT — and the check goes straight to that home.",
    );
  });
});

describe("BUG-286 — the pacing collapse rule", () => {
  it("all four outcomes present collapses the spacing", () => {
    expect(
      districtOutcomesAllSettled({
        family: done,
        neighbourhood: done,
        home: done,
        nearby: done,
      }),
    ).toBe(true);
  });

  it("a failed outcome still counts as settled — the group completes with its failure line", () => {
    expect(
      districtOutcomesAllSettled({
        family: done,
        neighbourhood: done,
        home: failed,
        nearby: done,
      }),
    ).toBe(true);
  });

  it("one outcome still missing keeps the pacing", () => {
    expect(
      districtOutcomesAllSettled({
        family: done,
        neighbourhood: done,
        home: done,
        nearby: null,
      }),
    ).toBe(false);
  });

  it("nothing settled keeps the pacing", () => {
    expect(
      districtOutcomesAllSettled({
        family: null,
        neighbourhood: null,
        home: null,
        nearby: null,
      }),
    ).toBe(false);
  });
});

describe("BUG-286 — the outward branch's fold seam (classification is pure)", () => {
  it("an outward code classifies to itself, any casing", () => {
    expect(classifyAddressInput("MK10").outward).toBe("MK10");
    expect(classifyAddressInput("mk10").outward).toBe("MK10");
  });

  it("a full postcode in the outward slot classifies to its outward", () => {
    expect(classifyAddressInput("CM3 2JT").outward).toBe("CM3");
  });

  it("a place name carries no outward — the streamed child resolves it", () => {
    expect(classifyAddressInput("Chelmsford").outward).toBeNull();
  });
});
