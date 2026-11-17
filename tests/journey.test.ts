import { afterEach, describe, expect, it, vi } from "vitest";

import type { AddressResolution, DirectoryPostcode } from "../lib/address";
import type { AreaBundle } from "../lib/area-bundle";
import type { CrimeBundle } from "../lib/crime";
import type { FloodBundle } from "../lib/flood";
import {
  CHECKING_ROWS,
  EMPTY_PICKER_LINE,
  FAILED_ROUTE,
  HOLDING_LINE,
  HOME_ROUTE,
  NO_LOCATION_HEADING,
  NOT_COVERED_INTRO,
  OWNERSHIP_NOT_PART_LINE,
  PICKER_CONFIRM_LABEL,
  PICKER_EXPLAINER,
  SEARCH_ROUTE,
  TURNSTILE_BLOCK_LINE,
  WHOLE_CHECK_FAILURE_HEADING,
  floodRowResult,
  historyRowResult,
  homeRoute,
  journeyDestination,
  nationOfLsoa,
  nearbyRowResults,
  notCoveredHeading,
  notCoveredSectionLines,
  pickerCountLine,
  postcodeNotFoundLine,
  postcodeRoute,
  rowFailureLine,
  scopeLabelFor,
  widerAreaRoute,
} from "../lib/journey";
import type { NearbyBundle } from "../lib/nearby";
import { verifyTurnstileToken } from "../lib/server/turnstile";
import type { SoldPricesBundle } from "../lib/sold-prices";

// M7.3 — the journey's own logic: the single routing table
// (fold-in 1), the pinned copy, the checking-screen row
// derivations (fold-in 5), the not-covered section lines
// (ruling 4) and the robot check's closed failure direction
// (ruling 5). The ladder itself is pinned by its own suite;
// the resolutions here are fabricated at its shapes.

const directory = (postcode: string, lsoaCode: string): DirectoryPostcode => ({
  postcode,
  latitude: 51.7,
  longitude: 0.6,
  council: null,
  ward: null,
  region: null,
  lsoaCode,
  msoaCode: null,
});

const birkdale: AddressResolution = {
  rung: 1,
  kind: "home",
  address: {
    postcode: "CM3 2JT",
    paon: "19",
    saon: null,
    street: "BIRKDALE RISE",
    locality: null,
    town: "CHELMSFORD",
    label: "19 Birkdale Rise",
  },
  directory: directory("CM3 2JT", "E01021395"),
};

const birkdaleList: AddressResolution = {
  rung: 2,
  kind: "address-list",
  directory: directory("CM3 2JT", "E01021395"),
  street: "BIRKDALE RISE",
  building: null,
  addresses: [birkdale.address],
};

const edinburghList: AddressResolution = {
  rung: 2,
  kind: "address-list",
  directory: directory("EH1 1AD", "S01014710"),
  street: null,
  building: null,
  addresses: [],
};

const widerCm3: AddressResolution = {
  rung: 3,
  kind: "wider-area",
  outward: "CM3",
  label: "Wider area — CM3, not this exact home",
  postcodeCount: 120,
};

describe("the route family (fold-in 1)", () => {
  it("builds the three route shapes, URL-encoding the home key", () => {
    expect(postcodeRoute("CM3 2JT")).toBe("/search?postcode=CM3+2JT");
    expect(postcodeRoute("KT17 1FH", { building: "Minerva House" })).toBe(
      "/search?postcode=KT17+1FH&building=Minerva+House",
    );
    expect(postcodeRoute("CM3 2JT", { picked: "19||birkdale rise" })).toBe(
      "/search?postcode=CM3+2JT&picked=19%7C%7Cbirkdale+rise",
    );
    expect(homeRoute("CM3 2JT")).toBe("/search/home?postcode=CM3+2JT");
    expect(homeRoute("CM3 2JT", "19||birkdale rise")).toBe(
      "/search/home?postcode=CM3+2JT&home=19%7C%7Cbirkdale+rise",
    );
    expect(widerAreaRoute("CM3")).toBe("/search?outward=CM3");
    expect(widerAreaRoute("CM3", "CM3 2JA")).toBe("/search?outward=CM3&notfound=CM3+2JA");
    expect(SEARCH_ROUTE).toBe("/search");
    expect(HOME_ROUTE).toBe("/search/home");
    expect(FAILED_ROUTE).toBe("/search/failed");
  });
});

describe("the routing table (journeyDestination)", () => {
  it("sends no-location to the bare fix route", () => {
    expect(journeyDestination({ rung: 4, kind: "no-location" }, { postcode: null }, null)).toEqual({
      kind: "no-location",
      url: "/search",
    });
  });

  it("sends a typed outward code to the wider-area landing without a not-found line", () => {
    expect(journeyDestination(widerCm3, { postcode: null }, null)).toEqual({
      kind: "wider-area",
      url: "/search?outward=CM3",
    });
  });

  it("sends a typed full postcode the directory does not hold to the wider area, naming it", () => {
    expect(journeyDestination(widerCm3, { postcode: "CM3 2JA" }, null)).toEqual({
      kind: "wider-area",
      url: "/search?outward=CM3&notfound=CM3+2JA",
    });
  });

  it("sends an England/Wales list to the picker, carrying the narrowing", () => {
    expect(journeyDestination(birkdaleList, { postcode: "CM3 2JT" }, null)).toEqual({
      kind: "picker",
      url: "/search?postcode=CM3+2JT&street=BIRKDALE+RISE",
    });
  });

  it("sends a picked home to the home form with its key", () => {
    expect(journeyDestination(birkdale, { postcode: "CM3 2JT" }, "19||birkdale rise")).toEqual({
      kind: "home",
      url: "/search/home?postcode=CM3+2JT&home=19%7C%7Cbirkdale+rise",
    });
  });

  it("sends Scotland straight to the not-covered page — never the picker (ruling 4)", () => {
    expect(journeyDestination(edinburghList, { postcode: "EH1 1AD" }, null)).toEqual({
      kind: "not-covered",
      url: "/search/home?postcode=EH1+1AD",
    });
  });
});

describe("nations from the filed area code", () => {
  it("reads the first letter, the brains' own detector", () => {
    expect(nationOfLsoa("E01021395")).toBe("england");
    expect(nationOfLsoa("W01000001")).toBe("wales");
    expect(nationOfLsoa("S01014710")).toBe("scotland");
    expect(nationOfLsoa("N09000001")).toBe("northern-ireland");
    expect(nationOfLsoa(null)).toBe("unknown");
    expect(notCoveredHeading("EH1 1AD", "scotland")).toBe("EH1 1AD is in Scotland");
  });
});

describe("pinned journey copy", () => {
  it("pins the named states verbatim", () => {
    expect(EMPTY_PICKER_LINE).toBe("No addresses we can list for this postcode yet.");
    expect(NO_LOCATION_HEADING).toBe("We couldn't place that");
    expect(WHOLE_CHECK_FAILURE_HEADING).toBe("This check couldn't be completed");
    expect(HOLDING_LINE).toBe("The check is complete. This home's full results open on this page.");
    expect(TURNSTILE_BLOCK_LINE).toBe(
      "The robot check couldn't run, so your search hasn't been sent. Please try again.",
    );
    expect(OWNERSHIP_NOT_PART_LINE).toBe(
      "Ownership — the ownership check is not part of this result.",
    );
    expect(NOT_COVERED_INTRO).toContain("covers England and Wales");
    expect(pickerCountLine(1)).toBe("1 address");
    expect(pickerCountLine(29)).toBe("29 addresses");
    expect(postcodeNotFoundLine("CM3 2JA")).toBe(
      "CM3 2JA isn't a postcode we hold — this is the wider area it points to instead.",
    );
    expect(rowFailureLine("Flood")).toBe(
      "Flood couldn't be checked just now — the rest of the check still opens.",
    );
    // D73 (fold-in build): the checking screen is five
    // grouped rows with pinned qualifiers, under the pinned
    // heading and facts line.
    expect(CHECKING_ROWS).toHaveLength(5);
    expect(CHECKING_ROWS.map((row) => row.label)).toEqual([
      "Schools & nurseries",
      "Health & the everyday",
      "Safety & surroundings",
      "Costs & connections",
      "Past sales & prices",
    ]);
    expect(CHECKING_ROWS.map((row) => row.qualifier)).toEqual([
      "Primaries, secondaries, sixth forms and childcare near here.",
      "GP, dentist, pharmacy, hospital, shops and stations near here.",
      "Crime, flood risk and air quality around here.",
      "Council tax, energy, broadband and mobile for this postcode.",
      "Recorded sale prices, from the Land Registry.",
    ]);
    expect(PICKER_EXPLAINER).toBe(
      "Schools and flood are address-sensitive, so pick your exact house before anything is checked.",
    );
    expect(PICKER_CONFIRM_LABEL).toBe("Check this address →");
    expect(scopeLabelFor(birkdale)).toBe("19 Birkdale Rise, CM3 2JT");
    expect(scopeLabelFor(birkdaleList)).toBe("CM3 2JT — the whole postcode, not one home");
  });
});

const category = (name: string, state: string, line: string | null = null) =>
  ({
    category: name,
    label: name,
    basisLabel: "basis",
    state,
    places: [],
    countWithin: 0,
    beyondNearest: null,
    line,
  }) as unknown as NearbyBundle extends { categories: (infer C)[] } ? C : never;

describe("nearby row derivation (fold-in 5)", () => {
  it("completes rows from their own categories; a not-filed category names its row", () => {
    const bundle = {
      rung: 1,
      kind: "distances",
      postcode: "CM3 2JT",
      basisLabel: "basis",
      categories: [
        category("schools-primary", "within"),
        category("schools-secondary", "within"),
        category("sixth-forms", "none-within"),
        category("nurseries", "not-filed", "Nurseries are not filed for this area yet."),
        category("gp", "within"),
        category("dentist", "within"),
        category("pharmacy", "within"),
        category("ae", "within"),
        category("maternity", "within"),
        category("parks", "within"),
        category("vets", "within"),
        category("pet-shops", "within"),
        category("pet-boarding", "within"),
        category("supermarket", "within"),
        category("station", "within"),
        category("bus-stop", "within"),
        category("ev-chargers", "within"),
        category("food-and-drink", "within"),
        category("leisure", "within"),
        category("places-to-visit", "within"),
        category("places-of-worship", "within"),
        category("libraries", "within"),
      ],
      schoolDeadlines: null,
    } as unknown as NearbyBundle;
    const rows = nearbyRowResults(bundle);
    expect(rows.schools).toEqual({ state: "done", line: null });
    expect(rows.nurseries).toEqual({
      state: "unavailable",
      line: "Nurseries are not filed for this area yet.",
    });
    expect(rows.food.state).toBe("done");
  });
});

describe("flood row derivation", () => {
  it("carries the not-covered reason, and the live-warnings line when the feed could not answer", () => {
    const notCovered = {
      rung: 1,
      kind: "not-covered",
      postcode: "EH1 1AD",
      flood: { state: "not-covered", reason: "Flood data covers England only." },
    } as unknown as FloodBundle;
    expect(floodRowResult(notCovered)).toEqual({
      state: "unavailable",
      line: "Flood data covers England only.",
    });

    const served = {
      rung: 1,
      kind: "flood",
      postcode: "CM3 2JT",
      flood: {
        state: "served",
        liveWarnings: { state: "unavailable", line: "Live flood warnings could not be loaded." },
        layers: [],
      },
    } as unknown as FloodBundle;
    expect(floodRowResult(served)).toEqual({
      state: "done",
      line: "Live flood warnings could not be loaded.",
    });
  });
});

describe("history row derivation (row 9)", () => {
  const areaServed = {
    rung: 2,
    kind: "area-bundle",
    postcode: "CM3 2JT",
    sections: {
      councilTax: { state: "served" },
      epc: { state: "served" },
      planningApplications: { state: "served" },
      constraints: { state: "served" },
    },
  } as unknown as AreaBundle;
  const soldServed = { rung: 2, kind: "sold-prices" } as unknown as SoldPricesBundle;
  const crimeServed = {
    rung: 2,
    kind: "crime",
    crime: { state: "served" },
  } as unknown as CrimeBundle;

  it("states the ownership position while the flag is off — the row is never silently shortened", () => {
    const row = historyRowResult(areaServed, soldServed, crimeServed);
    const ownership = row.elements?.find((e) => e.label === "Ownership");
    expect(ownership).toEqual({
      label: "Ownership",
      state: "unavailable",
      line: OWNERSHIP_NOT_PART_LINE,
    });
    expect(row.elements?.map((e) => e.label)).toEqual([
      "Sold history",
      "Crime",
      "Council tax",
      "EPC",
      "Planning applications",
      "Constraints",
      "Ownership",
    ]);
  });

  it("carries a not-covered sold-prices reason as its element's line", () => {
    const soldNotCovered = {
      rung: 2,
      kind: "not-covered",
      postcode: "EH1 1AD",
      soldPrices: { state: "not-covered", reason: "Sold prices cover England and Wales only." },
    } as unknown as SoldPricesBundle;
    const row = historyRowResult(areaServed, soldNotCovered, crimeServed);
    expect(row.elements?.[0]).toEqual({
      label: "Sold history",
      state: "unavailable",
      line: "Sold prices cover England and Wales only.",
    });
    expect(row.state).toBe("unavailable");
  });
});

describe("not-covered section lines (ruling 4)", () => {
  it("collects each bundle's served not-covered line, in place", () => {
    const lines = notCoveredSectionLines({
      nearby: { rung: 2, kind: "wider-area" } as unknown as NearbyBundle,
      flood: {
        rung: 2,
        kind: "not-covered",
        flood: { state: "not-covered", reason: "Flood reason." },
      } as unknown as FloodBundle,
      area: {
        rung: 2,
        kind: "area-bundle",
        postcode: "EH1 1AD",
        sections: {
          census: { state: "not-covered", line: "Census line." },
          councilTax: { state: "served" },
        },
      } as unknown as AreaBundle,
      sold: {
        rung: 2,
        kind: "not-covered",
        soldPrices: { state: "not-covered", reason: "Sold reason." },
      } as unknown as SoldPricesBundle,
      crime: {
        rung: 2,
        kind: "not-covered",
        crime: { state: "not-covered", reason: "Crime reason." },
      } as unknown as CrimeBundle,
    });
    expect(lines).toContainEqual({ name: "Sold prices", line: "Sold reason." });
    expect(lines).toContainEqual({ name: "Crime", line: "Crime reason." });
    expect(lines).toContainEqual({ name: "Flood", line: "Flood reason." });
    expect(lines).toContainEqual({ name: "Census", line: "Census line." });
    expect(lines.find((l) => l.name === "Council tax")).toBeUndefined();
  });
});

describe("the robot check's closed failure direction (ruling 5)", () => {
  const saved = process.env.TURNSTILE_SECRET_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = saved;
  });

  const fetchReturning = (body: unknown, ok = true) =>
    vi.fn(async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it("verifies a good token", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    await expect(verifyTurnstileToken("token", fetchReturning({ success: true }))).resolves.toEqual(
      { ok: true },
    );
  });

  it("refuses a rejected token", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    await expect(
      verifyTurnstileToken("token", fetchReturning({ success: false })),
    ).resolves.toEqual({ ok: false, reason: "rejected" });
  });

  it("refuses when the verify call itself fails — never a silent pass", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const throwing = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(verifyTurnstileToken("token", throwing)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("refuses with no secret configured and with no token", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    await expect(verifyTurnstileToken("token", fetchReturning({ success: true }))).resolves.toEqual(
      { ok: false, reason: "unavailable" },
    );
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    await expect(verifyTurnstileToken(null, fetchReturning({ success: true }))).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});
