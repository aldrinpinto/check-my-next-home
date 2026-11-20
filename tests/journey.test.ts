import { afterEach, describe, expect, it, vi } from "vitest";

import type { AddressResolution, DirectoryPostcode } from "../lib/address";
import type { AreaBundle } from "../lib/area-bundle";
import type { CrimeBundle } from "../lib/crime";
import type { FloodBundle } from "../lib/flood";
import {
  CHECKING_CRIME_AIR_FAILED_LINE,
  CHECKING_FINAL_LINE,
  CHECKING_FLOOD_FAILED_LINE,
  CHECKING_READY_ANNOUNCEMENT,
  CHECKING_READY_TICKER,
  CHECKING_ROWS,
  CHECKING_SEAL_CAPTION,
  CHECKING_START_LINE,
  CHECKING_STEP_DONE,
  CHECKING_STEP_RUNNING,
  CHECKING_WAITING_LINE,
  EMPTY_PICKER_LINE,
  ERROR_PAGE_CLOSING_AFTER,
  ERROR_PAGE_CLOSING_BEFORE,
  ERROR_PAGE_CLOSING_LINK,
  ERROR_PAGE_HEADING,
  ERROR_PAGE_KEPT_NOTE,
  ERROR_PAGE_LINE,
  FAILED_ROUTE,
  HOLDING_LINE,
  HOME_ROUTE,
  NOT_COVERED_INTRO,
  OWNERSHIP_NOT_PART_LINE,
  PICKER_EXPLAINER,
  PICKER_SELECT_PROMPT,
  SEARCH_ROUTE,
  TURNSTILE_BLOCK_LINE,
  UNPLACED_NOTICE_LINE,
  UNPLACED_NOTICE_URL,
  STREET_CHOICE_LINE,
  areaCheckingGroups,
  assembleCheckingOutcomes,
  floodCheckingSegments,
  homeRoute,
  journeyDestination,
  narrowedHomeRoute,
  nationOfLsoa,
  nearbyCheckingGroups,
  notCoveredHeading,
  notCoveredSectionLines,
  parseCheckingPartValue,
  placeBridgeLine,
  placeChoiceCountLine,
  placeDistrictDescription,
  postcodeNotFoundLine,
  postcodeRoute,
  rowFailureLine,
  scopeLabelFor,
  streetChoiceCountLine,
  streetChoiceRoute,
  widerAreaRoute,
} from "../lib/journey";
import type { NearbyBundle } from "../lib/nearby";
import { verifyTurnstileToken } from "../lib/server/turnstile";
import type { SoldPricesBundle } from "../lib/sold-prices";

// M7.3 — the journey's own logic: the single routing table
// (fold-in 1), the pinned copy, the checking screen's
// group derivations (the founder-chosen design, 19 Nov
// 2026), the not-covered section lines (ruling 4) and the
// robot check's closed failure direction (ruling 5). The
// ladder itself is pinned by its own suite; the
// resolutions here are fabricated at its shapes.

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

  it("builds the M7.15C street routes: the choice, and the narrowed home route", () => {
    expect(streetChoiceRoute("Birkdale Rise", "Chelmsford")).toBe(
      "/search?street=Birkdale+Rise&town=Chelmsford",
    );
    expect(streetChoiceRoute("Birkdale Rise", null)).toBe("/search?street=Birkdale+Rise");
    expect(narrowedHomeRoute("CM3 2JT", { street: "BIRKDALE RISE" })).toBe(
      "/search/home?postcode=CM3+2JT&street=BIRKDALE+RISE",
    );
    expect(narrowedHomeRoute("CM3 2JT", {})).toBe("/search/home?postcode=CM3+2JT");
    expect(STREET_CHOICE_LINE).toBe(
      "This street covers more than one postcode — pick yours to see its homes.",
    );
    expect(streetChoiceCountLine(1)).toBe("1 postcode");
    expect(streetChoiceCountLine(3)).toBe("3 postcodes");
  });
});

describe("the routing table (journeyDestination)", () => {
  it("sends no-location back to the landing page with the unplaced notice (18 Nov 2026)", () => {
    // The standalone no-location page is retired: an
    // unplaceable input returns to the landing page, the
    // notice flag in its query — never a page of its own.
    expect(journeyDestination({ rung: 4, kind: "no-location" }, { postcode: null }, null)).toEqual({
      kind: "no-location",
      url: UNPLACED_NOTICE_URL,
    });
    expect(UNPLACED_NOTICE_URL).toBe("/?notice=unplaced");
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

  it("sends an England/Wales list straight to the whole-postcode check (picker removed, 18 Nov 2026)", () => {
    // Founder ruling (parity fix batch): the picker page
    // is removed — a full postcode with no home picked goes
    // to the whole-postcode check, which carries the full
    // home list itself. The narrowing no longer routes.
    expect(journeyDestination(birkdaleList, { postcode: "CM3 2JT" }, null)).toEqual({
      kind: "postcode-results",
      url: "/search/home?postcode=CM3+2JT",
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
    expect(UNPLACED_NOTICE_LINE).toBe(
      "We couldn't place that. Try a full postcode — for example SW1A 1AA — or start typing a street name and pick it from the list.",
    );
    expect(ERROR_PAGE_HEADING).toBe("Well — that wasn't supposed to happen");
    expect(ERROR_PAGE_LINE).toBe(
      "Something on our side stumbled. Give it a few seconds, then search below — most hiccups clear on the second try.",
    );
    expect(ERROR_PAGE_KEPT_NOTE).toBe(
      "We've kept the home you were checking in the box — just press the button to run it again, or type a different home.",
    );
    expect(ERROR_PAGE_CLOSING_BEFORE).toBe("If it keeps happening, let us know via the");
    expect(ERROR_PAGE_CLOSING_LINK).toBe("Contact page");
    expect(ERROR_PAGE_CLOSING_AFTER).toBe("and we'll look into it.");
    expect(HOLDING_LINE).toBe("The check is complete. This home's full results open on this page.");
    expect(TURNSTILE_BLOCK_LINE).toBe(
      "The robot check couldn't run, so your search hasn't been sent. Please try again.",
    );
    expect(OWNERSHIP_NOT_PART_LINE).toBe(
      "Ownership — the ownership check is not part of this result.",
    );
    expect(NOT_COVERED_INTRO).toContain("covers England and Wales");
    expect(postcodeNotFoundLine("CM3 2JA")).toBe(
      "CM3 2JA isn't a postcode we hold — this is the wider area it points to instead.",
    );
    expect(rowFailureLine("Flood")).toBe(
      "Flood couldn't be checked just now — the rest of the check still opens.",
    );
    // The checking screen (founder-chosen design, 19 Nov
    // 2026): five groups with pinned labels, sources, doing
    // lines and ticker sentences, under the pinned heading
    // and facts line; the live line's fixed sentences, the
    // seal caption and the step-line words are pinned too.
    expect(CHECKING_ROWS).toHaveLength(5);
    expect(CHECKING_ROWS.map((row) => row.label)).toEqual([
      "Schools & nurseries",
      "Health & the everyday",
      "Safety & surroundings",
      "Costs & connections",
      "Past sales & prices",
    ]);
    expect(CHECKING_ROWS.map((row) => row.source)).toEqual([
      "Ofsted",
      "NHS & local data",
      "Police.uk · Environment Agency",
      "Council & providers",
      "HM Land Registry",
    ]);
    expect(CHECKING_ROWS.map((row) => row.doing)).toEqual([
      "Checking Ofsted ratings near this home…",
      "Finding GP, dentist, pharmacy, shops and stations…",
      "Counting recorded crime and checking flood maps…",
      "Looking up council tax, energy, broadband and mobile…",
      "Pulling recorded sale prices for this postcode…",
    ]);
    expect(CHECKING_ROWS.map((row) => row.ticker)).toEqual([
      "Now checking schools & nurseries near this home…",
      "Now finding the GP, dentist, pharmacy and station…",
      "Now checking crime, flood maps and air quality…",
      "Now looking up council tax, broadband and mobile…",
      "Now pulling recorded sale prices from the Land Registry…",
    ]);
    expect(CHECKING_START_LINE).toBe("Starting your check…");
    expect(CHECKING_READY_TICKER).toBe("Your check is ready — five areas, every figure sourced.");
    expect(CHECKING_FINAL_LINE).toBe(
      "Your check is ready — five areas, every figure sourced, seal stamped.",
    );
    expect(CHECKING_READY_ANNOUNCEMENT).toBe("Your check is ready. Five of five checks complete.");
    expect(CHECKING_SEAL_CAPTION).toBe("Five checks · one seal");
    expect(CHECKING_STEP_RUNNING).toBe("Checking…");
    expect(CHECKING_STEP_DONE).toBe("All five areas checked");
    expect(CHECKING_WAITING_LINE).toBe("Waiting");
    expect(CHECKING_FLOOD_FAILED_LINE).toBe("Flood couldn't be checked just now");
    expect(CHECKING_CRIME_AIR_FAILED_LINE).toBe(
      "Crime and air quality couldn't be checked just now",
    );
    expect(PICKER_EXPLAINER).toBe(
      "Flood risk and school places can differ from one house to the next — pick your exact house for its own check.",
    );
    expect(PICKER_SELECT_PROMPT).toBe("Choose your exact house");
    // The picker's confirm label and postcode-level link
    // retired with the page (18 Nov 2026): the home picker
    // lives on the postcode check — since the founder's
    // ruling of 20 Nov 2026 as one dropdown under the
    // intro line, a choice going straight to that home's
    // check — no list dump, no count line, no confirm
    // step, no level link.
    expect(scopeLabelFor(birkdale)).toBe("19 Birkdale Rise, CM3 2JT");
    expect(scopeLabelFor(birkdaleList)).toBe("CM3 2JT — the whole postcode, not one home");
  });
});

type CategoryFixture = NearbyBundle extends { categories: (infer C)[] } ? C : never;

const category = (
  name: string,
  state: string,
  line: string | null = null,
  extra: {
    countWithin?: number;
    places?: { name: string; miles: number }[];
    beyondNearest?: { name: string; miles: number } | null;
  } = {},
) =>
  ({
    category: name,
    label: name,
    basisLabel: "basis",
    state,
    places: extra.places ?? [],
    countWithin: extra.countWithin ?? 0,
    beyondNearest: extra.beyondNearest ?? null,
    line,
  }) as unknown as CategoryFixture;

const nearbyBundle = (categories: CategoryFixture[]) =>
  ({
    rung: 1,
    kind: "distances",
    postcode: "CM3 2JT",
    basisLabel: "basis",
    categories,
    schoolDeadlines: null,
  }) as unknown as NearbyBundle;

describe("checking group derivation — the nearby part (schools & health)", () => {
  it("composes the schools line from the per-category filed counts, never a summed total", () => {
    const groups = nearbyCheckingGroups(
      nearbyBundle([
        category("schools-primary", "within", null, { countWithin: 3 }),
        category("schools-secondary", "within", null, { countWithin: 1 }),
        category("sixth-forms", "none-within"),
        category("nurseries", "within", null, { countWithin: 2 }),
        category("gp", "within", null, { places: [{ name: "GP", miles: 0.3 }] }),
        category("dentist", "within", null, { places: [{ name: "Dentist", miles: 0.8 }] }),
        category("pharmacy", "within", null, { places: [{ name: "Pharmacy", miles: 0.5 }] }),
      ]),
    );
    expect(groups.schools).toEqual({
      state: "done",
      line: "Ofsted — Within 2 miles: 3 primary schools · 1 secondary school · 2 nurseries",
    });
    expect(groups.health).toEqual({
      state: "done",
      line: "NHS & local data — GP, dentist & pharmacy within a mile",
    });
  });

  it("serves a not-filed category's own line as its group's named state", () => {
    const groups = nearbyCheckingGroups(
      nearbyBundle([
        category("schools-primary", "within", null, { countWithin: 3 }),
        category("schools-secondary", "within"),
        category("sixth-forms", "within"),
        category("nurseries", "not-filed", "Nurseries are not filed for this area yet."),
        category("gp", "within", null, { places: [{ name: "GP", miles: 0.3 }] }),
        category("dentist", "within", null, { places: [{ name: "Dentist", miles: 0.8 }] }),
        category("pharmacy", "within", null, { places: [{ name: "Pharmacy", miles: 0.5 }] }),
      ]),
    );
    expect(groups.schools).toEqual({
      state: "unavailable",
      line: "Nurseries are not filed for this area yet.",
    });
    expect(groups.health.state).toBe("done");
  });

  it("lets the primary category's served line speak when nothing files within the radius", () => {
    const groups = nearbyCheckingGroups(
      nearbyBundle([
        category(
          "schools-primary",
          "none-within",
          "no primary schools within 2 miles — nearest is St Andrew's, 6.1 miles away",
        ),
        category("schools-secondary", "none-within"),
        category("sixth-forms", "none-within"),
        category("nurseries", "none-within"),
        category("gp", "within", null, { places: [{ name: "GP", miles: 0.3 }] }),
        category("dentist", "within", null, { places: [{ name: "Dentist", miles: 0.8 }] }),
        category("pharmacy", "within", null, { places: [{ name: "Pharmacy", miles: 0.5 }] }),
      ]),
    );
    expect(groups.schools).toEqual({
      state: "done",
      line: "no primary schools within 2 miles — nearest is St Andrew's, 6.1 miles away",
    });
  });

  it("spells out the three health distances when they are not all within a mile", () => {
    const groups = nearbyCheckingGroups(
      nearbyBundle([
        category("schools-primary", "within", null, { countWithin: 1 }),
        category("schools-secondary", "within"),
        category("sixth-forms", "within"),
        category("nurseries", "within"),
        category("gp", "within", null, { places: [{ name: "GP", miles: 0.3 }] }),
        category("dentist", "within", null, { places: [{ name: "Dentist", miles: 2.4 }] }),
        category("pharmacy", "within", null, { places: [{ name: "Pharmacy", miles: 1 }] }),
      ]),
    );
    expect(groups.health).toEqual({
      state: "done",
      line: "NHS & local data — GP 0.3 miles · dentist 2.4 miles · pharmacy 1 mile",
    });
  });

  it("names the health group from a not-filed core service's own line", () => {
    const groups = nearbyCheckingGroups(
      nearbyBundle([
        category("schools-primary", "within", null, { countWithin: 1 }),
        category("schools-secondary", "within"),
        category("sixth-forms", "within"),
        category("nurseries", "within"),
        category("gp", "not-filed", "GP data is not filed for this area yet."),
        category("dentist", "within", null, { places: [{ name: "Dentist", miles: 0.8 }] }),
        category("pharmacy", "within", null, { places: [{ name: "Pharmacy", miles: 0.5 }] }),
      ]),
    );
    expect(groups.health).toEqual({
      state: "unavailable",
      line: "GP data is not filed for this area yet.",
    });
    expect(groups.schools.state).toBe("done");
  });

  it("BUG-002: a beyond-nearest past the 25-mile guard never names its place or distance in the feed", () => {
    // The TA21 0HG evidence: the seed corpus's nearest
    // filed primary sat 134.327 miles away and the feed
    // served the brain's line verbatim. The guard the
    // results layer applies (suppressFarBeyond) now runs
    // in the feed derivation too: the group lands on the
    // category's no-finding line, done.
    const groups = nearbyCheckingGroups(
      nearbyBundle([
        category(
          "schools-primary",
          "none-within",
          "none within 2 miles — nearest is Stamford Green Primary School and Nursery, 134.327 miles away (straight-line distance from the postcode point)",
          {
            beyondNearest: { name: "Stamford Green Primary School and Nursery", miles: 134.327 },
          },
        ),
        category("schools-secondary", "none-within"),
        category("sixth-forms", "none-within"),
        category("nurseries", "none-within"),
        category("gp", "none-within", null, { beyondNearest: { name: "GP", miles: 84.832 } }),
        category("dentist", "none-within", null, {
          beyondNearest: { name: "Dentist", miles: 129.541 },
        }),
        category("pharmacy", "none-within", null, {
          beyondNearest: { name: "Pharmacy", miles: 100.517 },
        }),
      ]),
    );
    expect(groups.schools.state).toBe("done");
    expect(groups.schools.line).toBe("no schools-primary within 2 miles of the postcode point");
    expect(groups.schools.line).not.toContain("Stamford");
    expect(groups.schools.line).not.toContain("134");
    expect(groups.health.state).toBe("done");
    expect(groups.health.line).toBe("no gp within 2 miles of the postcode point");
    expect(groups.health.line).not.toContain("84");
  });

  it("BUG-002: a beyond-nearest inside the guard serves in the uniform one-decimal form", () => {
    // The brain's composed line carries three decimals;
    // the feed recomposes the same sentence at the
    // display precision (the E16 1GN form: Cheam Fields
    // at a filed 14.671 miles serves as 14.7).
    const groups = nearbyCheckingGroups(
      nearbyBundle([
        category(
          "schools-primary",
          "none-within",
          "none within 2 miles — nearest is Cheam Fields Primary Academy, 14.671 miles away (straight-line distance from the postcode point)",
          { beyondNearest: { name: "Cheam Fields Primary Academy", miles: 14.671 } },
        ),
        category("schools-secondary", "none-within"),
        category("sixth-forms", "none-within"),
        category("nurseries", "none-within"),
        category("gp", "within", null, { places: [{ name: "GP", miles: 0.3 }] }),
        category("dentist", "within", null, { places: [{ name: "Dentist", miles: 0.8 }] }),
        category("pharmacy", "within", null, { places: [{ name: "Pharmacy", miles: 0.5 }] }),
      ]),
    );
    expect(groups.schools).toEqual({
      state: "done",
      line: "none within 2 miles — nearest is Cheam Fields Primary Academy, 14.7 miles away (straight-line distance from the postcode point)",
    });
  });

  it("stands both groups on the bundle's reason for a non-distances bundle", () => {
    const bundle = {
      rung: 3,
      kind: "wider-area",
      postcode: "CM3",
      distances: { state: "unavailable", reason: "These checks need an exact postcode." },
    } as unknown as NearbyBundle;
    const groups = nearbyCheckingGroups(bundle);
    expect(groups.schools).toEqual({
      state: "unavailable",
      line: "These checks need an exact postcode.",
    });
    expect(groups.health).toEqual({
      state: "unavailable",
      line: "These checks need an exact postcode.",
    });
  });
});

const floodLayer = (
  layer: string,
  pointState: string,
  coveringLabel: string | null,
  line: string,
) => ({
  layer,
  title: layer,
  basisLine: "basis",
  explainer: "explainer",
  pointState,
  line,
  covering: coveringLabel === null ? null : { label: coveringLabel, displayLabel: coveringLabel },
  remainder: null,
});

const floodBundle = (liveWarnings: unknown, layers: unknown[]) =>
  ({
    rung: 1,
    kind: "flood",
    postcode: "CM3 2JT",
    flood: { state: "served", liveWarnings, layers },
  }) as unknown as FloodBundle;

describe("checking group derivation — the flood part (safety segments)", () => {
  it("reads one band word where both layers agree, through the shared band mapping", () => {
    const segments = floodCheckingSegments(
      floodBundle(
        {
          state: "none",
          checkedAt: "now",
          line: "No live flood warnings.",
          warnings: [],
          overflowLine: null,
        },
        [
          floodLayer("rofrs", "no-band-published", null, "rivers line"),
          floodLayer("rofsw", "below-lowest-band", null, "surface line"),
        ],
      ),
    );
    expect(segments).toEqual([
      { text: "flood risk very low", prefix: "Environment Agency", named: false },
    ]);
  });

  it("names both bands where the layers differ — never one band standing for both", () => {
    const segments = floodCheckingSegments(
      floodBundle(null, [
        floodLayer("rofrs", "covered", "Low", "rivers line"),
        floodLayer("rofsw", "covered", "High", "surface line"),
      ]),
    );
    expect(segments).toEqual([
      {
        text: "flood risk: rivers & sea low, surface water high",
        prefix: "Environment Agency",
        named: false,
      },
    ]);
  });

  it("lets a bandless layer speak with its own line, named when it is not filed", () => {
    const segments = floodCheckingSegments(
      floodBundle(null, [
        floodLayer(
          "rofrs",
          "not-filed",
          null,
          "this flood map is not filed yet, so no answer can be given from it",
        ),
        floodLayer("rofsw", "below-lowest-band", null, "surface line"),
      ]),
    );
    expect(segments).toEqual([
      {
        text: "this flood map is not filed yet, so no answer can be given from it",
        prefix: "Environment Agency",
        named: true,
      },
    ]);
  });

  it("serves live warnings first, and the feed's named line after the filed answer", () => {
    const layers = [
      floodLayer("rofrs", "no-band-published", null, "rivers line"),
      floodLayer("rofsw", "below-lowest-band", null, "surface line"),
    ];
    const withWarnings = floodCheckingSegments(
      floodBundle(
        {
          state: "warnings",
          checkedAt: "now",
          line: null,
          warnings: [{ line: "A flood warning is in force for this area." }],
          overflowLine: "And 2 more warnings.",
        },
        layers,
      ),
    );
    expect(withWarnings.map((segment) => segment.text)).toEqual([
      "A flood warning is in force for this area.",
      "And 2 more warnings.",
      "flood risk very low",
    ]);
    const feedDown = floodCheckingSegments(
      floodBundle(
        {
          state: "unavailable",
          checkedAt: "now",
          line: "Live flood warnings could not be loaded.",
          warnings: [],
          overflowLine: null,
        },
        layers,
      ),
    );
    expect(feedDown).toEqual([
      { text: "flood risk very low", prefix: "Environment Agency", named: false },
      { text: "Live flood warnings could not be loaded.", named: false },
    ]);
  });

  it("carries the not-covered reason as a named segment", () => {
    const notCovered = {
      rung: 1,
      kind: "not-covered",
      postcode: "EH1 1AD",
      flood: { state: "not-covered", reason: "Flood data covers England only." },
    } as unknown as FloodBundle;
    expect(floodCheckingSegments(notCovered)).toEqual([
      { text: "Flood data covers England only.", prefix: "Environment Agency", named: true },
    ]);
  });
});

describe("checking group derivation — the area part (safety, costs, history)", () => {
  const areaServed = {
    rung: 1,
    kind: "area-bundle",
    postcode: "CM3 2JT",
    sections: {
      councilTax: {
        state: "served",
        line: "Braintree District Council's average Band D council tax for 2026/27 is £2,108.55 — an area average, not this home's bill",
        bandDAverageLabel: "£2,108.55",
      },
      broadband: {
        state: "served",
        line: "gigabit-capable broadband (at least 1 Gbit/s) is available to 100% of premises in this postcode",
      },
      epc: { state: "served", headlineBand: "B" },
      air: {
        state: "served",
        headlineFigure: {
          pollutant: "NO2",
          value: 8.15,
          line: "modelled NO2 8.15 µg/m³ (annual mean, 2024)",
        },
      },
    },
  } as unknown as AreaBundle;
  const soldServed = {
    rung: 1,
    kind: "sold-prices",
    postcode: "CM3 2JT",
    loadState: "found",
    recordedCount: 29,
    stateLine: null,
    ownHistory: [
      {
        price: 425000,
        date: "2022-03-22",
        propertyType: "Detached",
        tenure: "Freehold",
        newBuild: false,
        address: "12 Willow Close",
      },
    ],
  } as unknown as SoldPricesBundle;
  const crimeServed = {
    rung: 1,
    kind: "crime",
    crime: {
      state: "served",
      totalLine:
        "330 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
    },
  } as unknown as CrimeBundle;

  it("composes the drawn findings for the served Birkdale-shaped case", () => {
    const groups = areaCheckingGroups(areaServed, soldServed, crimeServed);
    expect(groups.safetyCrime).toEqual({
      text: "330 recorded crimes in the last 12 months",
      prefix: "Police.uk",
      named: false,
    });
    // A served air answer contributes no segment (the
    // drawn finding carries crime and flood).
    expect(groups.safetyAir).toBeNull();
    expect(groups.costs).toEqual({
      state: "done",
      line: "Council & providers — Council tax Band D average £2,108.55; gigabit-capable broadband (at least 1 Gbit/s) is available to 100% of premises in this postcode",
    });
    expect(groups.history).toEqual({
      state: "done",
      line: "HM Land Registry — This home sold for £425,000 on 22 March 2022; 29 recorded sales in this postcode",
    });
  });

  it("completes history as unavailable on the cold-load degrade variant — the reason is the line", () => {
    // Part A of the cold-check fix (19 Nov 2026): the
    // sold bundle is kind "sold-prices" with no figures —
    // the group completes unavailable carrying the
    // bundle's reason verbatim (a fixture sentence here;
    // the brain's own wording is pinned in the
    // sold-prices suite).
    const soldUnavailable = {
      rung: 1,
      kind: "sold-prices",
      postcode: "CM3 2JT",
      soldPrices: {
        state: "unavailable",
        reason: "Sold prices are still being gathered for this postcode.",
      },
    } as unknown as SoldPricesBundle;
    const groups = areaCheckingGroups(areaServed, soldUnavailable, crimeServed);
    expect(groups.history).toEqual({
      state: "unavailable",
      line: "Sold prices are still being gathered for this postcode.",
    });
  });

  it("BUG-012: the history count names the D23 counted set, not the both-categories total", () => {
    // Birkdale's filed set: 30 recorded sales across both
    // categories, 29 of them category A — the results
    // page counts the median over the 29, and the feed
    // said 30. The feed now counts the median's set.
    const soldBoth = {
      rung: 2,
      kind: "sold-prices",
      postcode: "CM3 2JT",
      loadState: "found",
      recordedCount: 30,
      stateLine: null,
      median: {
        state: "served",
        value: 588995,
        counted: 29,
        spanFrom: "1996-12-20",
        spanTo: "2026-07-20",
        line: "counted over 29 recorded sales, 1996-12-20 to 2026-07-20",
        explainer: "explainer",
      },
      ownHistory: [],
    } as unknown as SoldPricesBundle;
    const groups = areaCheckingGroups(areaServed, soldBoth, crimeServed);
    expect(groups.history).toEqual({
      state: "done",
      line: "HM Land Registry — 29 recorded sales in this postcode",
    });
  });

  it("BUG-012: a category-B-only postcode serves the median's own line, never a zero count", () => {
    const soldBOnly = {
      rung: 2,
      kind: "sold-prices",
      postcode: "CM3 2JT",
      loadState: "found",
      recordedCount: 2,
      stateLine: null,
      median: {
        state: "none-recorded",
        value: null,
        counted: 0,
        spanFrom: null,
        spanTo: null,
        line: "no recorded sales in this postcode count toward a median",
        explainer: "explainer",
      },
      ownHistory: [],
    } as unknown as SoldPricesBundle;
    const groups = areaCheckingGroups(areaServed, soldBOnly, crimeServed);
    expect(groups.history).toEqual({
      state: "done",
      line: "HM Land Registry — no recorded sales in this postcode count toward a median",
    });
  });

  it("BUG-020: the rung-2 costs line takes the sample's form and lands done", () => {
    // Master view 2's conformed costs row at postcode
    // scope: the Band D average with its "a year", the
    // broadband unquantified, and NO energy-certificates
    // pointer — and the group lands as a plain finding
    // although the rung-2 EPC section serves a named
    // state, because that state is not part of the drawn
    // finding at this scope.
    const areaRung2 = {
      rung: 2,
      kind: "area-bundle",
      postcode: "CM3 2JT",
      sections: {
        councilTax: {
          state: "served",
          line: "Braintree District Council's average Band D council tax for 2026/27 is £2,145.00 — an area average, not this home's bill",
          bandDAverageLabel: "£2,145.00",
        },
        broadband: {
          state: "served",
          line: "gigabit-capable broadband (at least 1 Gbit/s) is available to 100% of premises in this postcode",
          gigabitCapablePct: 100,
        },
        epc: { state: "not-filed", line: "Energy certificates are not filed for this postcode." },
        air: {
          state: "served",
          headlineFigure: {
            pollutant: "NO2",
            value: 8.15,
            line: "modelled NO2 8.15 µg/m³ (annual mean, 2024)",
          },
        },
      },
    } as unknown as AreaBundle;
    const groups = areaCheckingGroups(areaRung2, soldServed, crimeServed);
    expect(groups.costs).toEqual({
      state: "done",
      line: "Council & providers — Council tax Band D average £2,145.00 a year; gigabit-capable broadband is available at this postcode",
    });
  });

  it("completes history as done on a filed zero — the brain's own no-sale sentence", () => {
    const soldNone = {
      rung: 2,
      kind: "sold-prices",
      postcode: "CM1 6ER",
      loadState: "loaded-none",
      recordedCount: 0,
      stateLine: "No sale recorded for this postcode since 1995",
    } as unknown as SoldPricesBundle;
    const groups = areaCheckingGroups(areaServed, soldNone, crimeServed);
    expect(groups.history).toEqual({
      state: "done",
      line: "No sale recorded for this postcode since 1995",
    });
  });

  it("carries not-covered and not-filed states as the groups' named lines", () => {
    const soldNotCovered = {
      rung: 2,
      kind: "not-covered",
      postcode: "EH1 1AD",
      soldPrices: { state: "not-covered", reason: "Sold prices cover England and Wales only." },
    } as unknown as SoldPricesBundle;
    const crimeNotFiled = {
      rung: 1,
      kind: "crime",
      crime: { state: "not-filed", reason: "Crime counts are not filed for this postcode yet." },
    } as unknown as CrimeBundle;
    const groups = areaCheckingGroups(areaServed, soldNotCovered, crimeNotFiled);
    expect(groups.history).toEqual({
      state: "unavailable",
      line: "Sold prices cover England and Wales only.",
    });
    expect(groups.safetyCrime).toEqual({
      text: "Crime counts are not filed for this postcode yet.",
      prefix: "Police.uk",
      named: true,
    });
  });

  it("names the costs group from a not-filed council tax line and a named EPC state", () => {
    const areaNamed = {
      rung: 1,
      kind: "area-bundle",
      postcode: "CM3 2JT",
      sections: {
        councilTax: {
          state: "not-filed",
          line: "this council's council tax charges are not filed yet — most councils are filed in the spring pass, and until then no figure can be given",
        },
        broadband: {
          state: "served",
          line: "gigabit-capable broadband (at least 1 Gbit/s) is available to 100% of premises in this postcode",
        },
        epc: {
          state: "not-filed",
          line: "the energy register is not filed for this postcode yet, so no energy answer can be given yet",
        },
        air: { state: "served", headlineFigure: { pollutant: "NO2", value: 8.15, line: "x" } },
      },
    } as unknown as AreaBundle;
    const groups = areaCheckingGroups(areaNamed, soldServed, crimeServed);
    expect(groups.costs.state).toBe("unavailable");
    expect(groups.costs.line).toBe(
      "Council & providers — this council's council tax charges are not filed yet — most councils are filed in the spring pass, and until then no figure can be given; gigabit-capable broadband (at least 1 Gbit/s) is available to 100% of premises in this postcode; the energy register is not filed for this postcode yet, so no energy answer can be given yet",
    );
  });

  it("surfaces a not-filed air answer as a named Defra segment", () => {
    const areaAirNamed = {
      rung: 1,
      kind: "area-bundle",
      postcode: "CM3 2JT",
      sections: {
        councilTax: { state: "served", line: "x", bandDAverageLabel: "£1" },
        broadband: { state: "served", line: "y" },
        epc: { state: "served", headlineBand: "B" },
        air: { state: "not-filed", line: "no modelled air quality square is filed for this point" },
      },
    } as unknown as AreaBundle;
    const groups = areaCheckingGroups(areaAirNamed, soldServed, crimeServed);
    expect(groups.safetyAir).toEqual({
      text: "no modelled air quality square is filed for this point",
      prefix: "Defra",
      named: true,
    });
  });
});

describe("checking outcomes assembly", () => {
  const nearbyOk = {
    ok: true as const,
    value: {
      schools: { state: "done" as const, line: "Ofsted — Within 2 miles: 3 primary schools" },
      health: {
        state: "done" as const,
        line: "NHS & local data — GP, dentist & pharmacy within a mile",
      },
    },
  };
  const floodOk = {
    ok: true as const,
    value: [{ text: "flood risk very low", prefix: "Environment Agency", named: false }],
  };
  const areaOk = {
    ok: true as const,
    value: {
      safety: {
        crime: {
          text: "330 recorded crimes in the last 12 months",
          prefix: "Police.uk",
          named: false,
        },
        air: null,
      },
      groups: {
        costs: {
          state: "done" as const,
          line: "Council & providers — Council tax Band D average £2,108.55",
        },
        history: {
          state: "done" as const,
          line: "HM Land Registry — 29 recorded sales in this postcode",
        },
      },
    },
  };

  it("interleaves the safety segments crime, flood, air and passes the groups through", () => {
    const outcomes = assembleCheckingOutcomes({ nearby: nearbyOk, flood: floodOk, area: areaOk });
    expect(outcomes.safety).toEqual({
      state: "done",
      line: "Police.uk — 330 recorded crimes in the last 12 months; Environment Agency — flood risk very low",
    });
    expect(outcomes.schools).toEqual(nearbyOk.value.schools);
    expect(outcomes.history).toEqual(areaOk.value.groups.history);
  });

  it("reads null for groups whose parts have not settled", () => {
    const outcomes = assembleCheckingOutcomes({ nearby: nearbyOk });
    expect(outcomes.schools).toEqual(nearbyOk.value.schools);
    expect(outcomes.safety).toBeNull();
    expect(outcomes.costs).toBeNull();
    expect(outcomes.history).toBeNull();
  });

  it("completes a failed part's groups with their named failure lines", () => {
    const outcomes = assembleCheckingOutcomes({
      nearby: { ok: false },
      flood: { ok: false },
      area: areaOk,
    });
    expect(outcomes.schools).toEqual({
      state: "failed",
      line: "Schools & nurseries couldn't be checked just now — the rest of the check still opens.",
    });
    expect(outcomes.safety).toEqual({
      state: "unavailable",
      line: "Police.uk — 330 recorded crimes in the last 12 months; Environment Agency — Flood couldn't be checked just now",
    });
  });

  it("marks the whole safety group failed-named when the area part fails", () => {
    const outcomes = assembleCheckingOutcomes({
      nearby: nearbyOk,
      flood: floodOk,
      area: { ok: false },
    });
    expect(outcomes.costs).toEqual({
      state: "failed",
      line: "Costs & connections couldn't be checked just now — the rest of the check still opens.",
    });
    expect(outcomes.safety).toEqual({
      state: "unavailable",
      line: "Police.uk — Crime and air quality couldn't be checked just now; Environment Agency — flood risk very low",
    });
  });
});

describe("checking part wire contract (the /api/check shapes)", () => {
  // CI #247 (19 Nov 2026): the check-parts route wrapped
  // the nearby groups in {groups: …} and the flood
  // segments in {safety: …} while the client's assembly
  // reads the payload objects themselves. Each side was
  // unit-tested against its own assumption — the assembly
  // cases above hand-build the payloads — the wire itself
  // was tested by nothing below the browser suite, and
  // every journey through the checking screen timed out
  // there. These cases pin the wire at the seam both
  // sides share: the bodies are the REAL derivations'
  // outputs, composed exactly as the route composes them
  // (the payload object itself, JSON-round-tripped as the
  // client receives it), and the wrapped forms that broke
  // the run are rejected by the client's validation.
  const nearbyBody = nearbyCheckingGroups({
    rung: 2,
    kind: "not-covered",
    postcode: "EH1 1AD",
  } as unknown as NearbyBundle);
  const floodBody = floodCheckingSegments({
    rung: 1,
    kind: "not-covered",
    postcode: "EH1 1AD",
    flood: { state: "not-covered", reason: "Flood data covers England only." },
  } as unknown as FloodBundle);
  const areaGroups = areaCheckingGroups(
    {
      rung: 1,
      kind: "area-bundle",
      postcode: "CM3 2JT",
      sections: {
        councilTax: {
          state: "served",
          line: "Braintree District Council's average Band D council tax for 2026/27 is £2,108.55 — an area average, not this home's bill",
          bandDAverageLabel: "£2,108.55",
        },
        broadband: {
          state: "served",
          line: "gigabit-capable broadband (at least 1 Gbit/s) is available to 100% of premises in this postcode",
        },
        epc: { state: "served", headlineBand: "B" },
        air: {
          state: "served",
          headlineFigure: {
            pollutant: "NO2",
            value: 8.15,
            line: "modelled NO2 8.15 µg/m³ (annual mean, 2024)",
          },
        },
      },
    } as unknown as AreaBundle,
    {
      rung: 2,
      kind: "sold-prices",
      postcode: "CM1 6ER",
      loadState: "loaded-none",
      recordedCount: 0,
      stateLine: "No sale recorded for this postcode since 1995",
    } as unknown as SoldPricesBundle,
    {
      rung: 1,
      kind: "crime",
      crime: {
        state: "served",
        totalLine:
          "330 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
      },
    } as unknown as CrimeBundle,
  );
  const areaBody = {
    safety: { crime: areaGroups.safetyCrime, air: areaGroups.safetyAir },
    groups: { costs: areaGroups.costs, history: areaGroups.history },
  };
  const overTheWire = (body: unknown): unknown => JSON.parse(JSON.stringify(body));

  it("accepts each part's body in the shape the route serves it", () => {
    expect(parseCheckingPartValue("nearby", overTheWire(nearbyBody))).toEqual(nearbyBody);
    expect(parseCheckingPartValue("flood", overTheWire(floodBody))).toEqual(floodBody);
    expect(parseCheckingPartValue("area", overTheWire(areaBody))).toEqual(areaBody);
  });

  it("assembles five outcomes, none null, from the parsed wire bodies", () => {
    const outcomes = assembleCheckingOutcomes({
      nearby: { ok: true, value: parseCheckingPartValue("nearby", overTheWire(nearbyBody))! },
      flood: { ok: true, value: parseCheckingPartValue("flood", overTheWire(floodBody))! },
      area: { ok: true, value: parseCheckingPartValue("area", overTheWire(areaBody))! },
    });
    for (const key of ["schools", "health", "safety", "costs", "history"] as const) {
      expect(outcomes[key], `the ${key} outcome exists`).not.toBeNull();
    }
  });

  it("rejects the wrapped nearby body that broke CI #247", () => {
    expect(parseCheckingPartValue("nearby", overTheWire({ groups: nearbyBody }))).toBeNull();
  });

  it("rejects the wrapped flood body that broke CI #247", () => {
    expect(parseCheckingPartValue("flood", overTheWire({ safety: floodBody }))).toBeNull();
  });

  it("rejects a nearby body missing a group, and an area body missing its crime segment", () => {
    expect(
      parseCheckingPartValue("nearby", overTheWire({ schools: nearbyBody.schools })),
    ).toBeNull();
    expect(
      parseCheckingPartValue(
        "area",
        overTheWire({ safety: { air: null }, groups: areaBody.groups }),
      ),
    ).toBeNull();
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

describe("the place page's lines (fix batch — BUG-025/026/027; BUG-034/035)", () => {
  it("counts in full words: postcode districts, never the clipped form (BUG-025)", () => {
    expect(placeChoiceCountLine(1)).toBe("1 postcode district");
    expect(placeChoiceCountLine(3)).toBe("3 postcode districts");
    expect(placeChoiceCountLine(6)).toBe("6 postcode districts");
  });

  it("composes a district row's area description from its cleaned settlements (BUG-026)", () => {
    expect(placeDistrictDescription([])).toBeNull();
    expect(placeDistrictDescription(["Danbury"])).toBe("Danbury");
    expect(placeDistrictDescription(["Danbury", "Hatfield Peverel"])).toBe(
      "Danbury, Hatfield Peverel",
    );
    expect(placeDistrictDescription(["A", "B", "C", "D", "E", "F"])).toBe("A, B, C, D and 2 more");
  });

  it("joins an exactly-four list with the sample's final 'and', not a fourth comma (BUG-034)", () => {
    // The sample's own row (Master view 29's district
    // list, drawn clean): the last pair is joined by
    // "and".
    expect(
      placeDistrictDescription([
        "Chelmsford city centre",
        "Springfield",
        "Broomfield",
        "Chelmer Village",
      ]),
    ).toBe("Chelmsford city centre, Springfield, Broomfield and Chelmer Village");
  });

  it("the bridge is view 29's single line, its example the place's own filed postcode (BUG-035)", () => {
    // The sample's exact sentence for Chelmsford.
    expect(placeBridgeLine("Chelmsford", "CM3 2JT")).toBe(
      "Checking one home in Chelmsford instead? Type its full postcode — e.g. CM3 2JT — and the check goes straight to that home.",
    );
  });

  it("the bridge line stands without an example when the place files no postcode (BUG-035)", () => {
    expect(placeBridgeLine("Chelmsford", null)).toBe(
      "Checking one home in Chelmsford instead? Type its full postcode and the check goes straight to that home.",
    );
  });
});
