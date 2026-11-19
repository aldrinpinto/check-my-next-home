// The wider-area checking derivation (lib/district-
// checking.ts): the district bundle in, the four groups'
// completion lines out. The pins here are the honesty
// contract of the wider-area checking screen — every
// line is a served finding in Master view 31's drawn
// form, or the bundle's own named-state line verbatim,
// and a group with a named state completes unavailable,
// never dressed as a finding.

import { describe, expect, it } from "vitest";

import type { DistrictBundle } from "../lib/district";
import {
  DISTRICT_CHECKING_FINAL_LINE,
  DISTRICT_CHECKING_READY_ANNOUNCEMENT,
  DISTRICT_CHECKING_READY_TICKER,
  DISTRICT_CHECKING_ROWS,
  DISTRICT_CHECKING_START_LINE,
  DISTRICT_CHECKING_STEP_DONE,
  DISTRICT_CHECKING_SWEEP_CAPTION,
  districtCheckingFailureOutcomes,
  districtCheckingPayload,
} from "../lib/district-checking";

// The district brain's own honest crime line (lib/
// district.ts's CRIME_NOT_FILED_LINE — module-private
// there; pinned here because the derivation must carry
// it verbatim while no district crime total is filed).
const CRIME_NOT_FILED_LINE =
  "Crime is counted around an exact postcode: Police.uk counts the crimes recorded within 1 mile of a postcode's point, and those circles overlap each other, so adding them across a district would count the same crimes again and again. There is no district crime total that does not double-count, so this page does not print one — check a full postcode in the district for its own crime answer.";

const FLOOD_NOT_COVERED_LINE =
  "Flood answers are not covered for Wales — the Environment Agency's flood maps cover England only, and flood maps for Wales are published by Natural Resources Wales.";

type Served = Extract<DistrictBundle, { kind: "district" }>;

// A fully served district in Master view 31's own
// figures (the CM3 drawing), so the derived lines can be
// pinned against the drawing's forms.
function servedBundle(): Served {
  return {
    kind: "district",
    outward: "CM3",
    head: {
      outward: "CM3",
      postcodeCount: 214,
      lsoaCount: 26,
      msoaCount: 5,
      councils: ["Braintree", "Maldon"],
      counties: ["Essex"],
      postTown: "Chelmsford",
      region: "East of England",
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
    },
    sections: {
      district: {
        state: "served",
        settlements: ["Hatfield Peverel"],
        settlementsCount: 1,
        homes: 18750,
        residents: 41850,
        households: 17400,
        sourceName: null,
        sourceDate: null,
        sourceLine: null,
      },
      census: {
        state: "served",
        line: null,
        msoaCount: 5,
        residentsTotal: 41850,
        householdsTotal: 17400,
        medianAge: null,
        socialRented: null,
        tables: [],
        ageYears: null,
        sourceName: null,
        sourceDate: null,
        sourceLine: null,
      },
      crime: {
        state: "served",
        line: null,
        total: 1842,
        windowLine: null,
        per1000: 44.0,
        england: { englandPer1000: 88.2, multiple: null, line: "" },
        categories: [],
        sourceName: null,
        sourceLine: null,
      },
      soldPrices: {
        state: "served",
        count: 612,
        median: 425000,
        fromDate: "1995-01-01",
        toDate: "2026-09-30",
        spanLine: null,
        types: [],
        foldedTypeCount: 0,
        sourceName: null,
        sourceDate: null,
        sourceLine: null,
      },
      deprivation: {
        state: "served",
        line: null,
        counts: [],
        areasCounted: 26,
        sourceName: null,
        sourceDate: null,
        sourceLine: null,
      },
      councilTax: {
        state: "served",
        councils: [
          {
            authorityName: "Braintree",
            taxYear: "2026/27",
            bandDAreaAveragePence: 214800,
            parishAveraged: true,
            sourceLine: null,
          },
          {
            authorityName: "Maldon",
            taxYear: "2026/27",
            bandDAreaAveragePence: 211200,
            parishAveraged: true,
            sourceLine: null,
          },
        ],
        unfiledCouncils: [],
      },
      connectivity: {
        state: "served",
        broadband: {
          postcodesCounted: 214,
          gigabitMeanPct: 71,
          superfastMeanPct: 96,
          snapshot: "",
        },
        mobile: null,
        sourceLine: null,
      },
      schools: {
        state: "served",
        counted: 21,
        primary: 18,
        secondary: 3,
        allThrough: 0,
        post16: 0,
        otherPhase: 0,
        grammar: 0,
        ofsted: [],
        notYetInspected: 0,
        sourceName: null,
        sourceDate: null,
        sourceLine: null,
      },
      everyday: {
        state: "served",
        gp: 6,
        dentists: 9,
        pharmacies: 11,
        stations: ["Hatfield Peverel", "Southminster", "Burnham-on-Crouch", "Althorne"],
      },
      flood: {
        state: "served",
        line: null,
        countedPostcodes: 214,
        riversSea: {
          layer: "rofrs",
          title: "Flood risk from rivers & the sea",
          counted: 214,
          buckets: [],
          sourceName: null,
          sourceDate: null,
          sourceLine: null,
        },
        surfaceWater: null,
        riversSeaNotCoveredLine: null,
        surfaceWaterNotCoveredLine:
          "Surface water flood answers are not filed for CM3's postcodes.",
        zones: { zone3Pct: 4, zone2Pct: 8 },
        watercourses: [],
        warnings: { state: "none", areas: [], line: "" },
        honestyLine: "",
      },
      air: {
        state: "served",
        squaresCounted: 40,
        year: 2024,
        no2: null,
        pm25: null,
        pm10: null,
        sourceName: null,
        sourceDate: null,
        sourceLine: null,
      },
      bridge: { postcodes: [], settlementPostcodes: [] },
    },
  };
}

describe("the wider-area checking screen's pinned copy", () => {
  it("pins the four rows in D76 tab order, with Master view 31's sources", () => {
    expect(DISTRICT_CHECKING_ROWS.map((row) => [row.key, row.label, row.source])).toEqual([
      ["family", "Family Checks", "DfE Get Information About Schools · Ofsted"],
      ["neighbourhood", "The Neighbourhood", "ONS · Census 2021 · Police.uk"],
      ["home", "Home, Costs & Risks", "HM Land Registry · Councils · Environment Agency"],
      ["nearby", "What's Nearby", "NHS service finder · OSM places"],
    ]);
  });

  it("pins the doing lines and the rotating sentences", () => {
    expect(DISTRICT_CHECKING_ROWS.map((row) => row.doing)).toEqual([
      "Checking schools across the district…",
      "Reading the census picture & deprivation for every neighbourhood…",
      "Checking sold prices, council tax, flood maps & broadband across the district…",
      "Counting GP practices, dentists, pharmacies & stations across the district…",
    ]);
    expect(DISTRICT_CHECKING_ROWS.map((row) => row.ticker("CM3"))).toEqual([
      "Now checking family checks across CM3…",
      "Now reading the neighbourhood picture for CM3…",
      "Now checking home, costs & risks across CM3…",
      "Now checking what's nearby in CM3…",
    ]);
  });

  it("pins the frame's sentences verbatim", () => {
    expect(DISTRICT_CHECKING_START_LINE).toBe("Starting your area check…");
    expect(DISTRICT_CHECKING_READY_TICKER).toBe(
      "Your area picture is ready — four groups, every figure sourced.",
    );
    expect(DISTRICT_CHECKING_FINAL_LINE).toBe(
      "Your area picture is ready — four groups, every figure sourced, district stamp landed.",
    );
    expect(DISTRICT_CHECKING_READY_ANNOUNCEMENT).toBe(
      "Your area picture is ready. Four of four groups complete.",
    );
    expect(DISTRICT_CHECKING_STEP_DONE).toBe("All four groups checked");
    expect(DISTRICT_CHECKING_SWEEP_CAPTION).toBe(
      "A sketch of the district, not a map — the shapes fill in as each group lands.",
    );
  });
});

describe("the fully served district — Master view 31's forms from real figures", () => {
  it("derives the four drawn lines from the bundle's own figures", () => {
    const payload = districtCheckingPayload(servedBundle());
    expect(payload.kind).toBe("district");
    if (payload.kind !== "district") return;
    expect(payload.groups.family).toEqual({
      state: "done",
      line: "DfE & Ofsted — 18 primary schools and 3 secondary schools found across CM3 — and no grammar school filed in the district",
    });
    expect(payload.groups.neighbourhood).toEqual({
      state: "done",
      line: "ONS & Police.uk — 41,850 residents across 26 small areas; Police.uk — 1,842 recorded crimes in the last 12 months, 44.0 per 1,000 residents against England's 88.2",
    });
    expect(payload.groups.home).toEqual({
      state: "unavailable",
      line: "HM Land Registry — median sold price £425,000 across 612 sales; council tax Band D £2,148.00 in Braintree and £2,112.00 in Maldon; 88% of postcodes outside the mapped river & sea flood bands; Surface water flood answers are not filed for CM3's postcodes.",
    });
    expect(payload.groups.nearby).toEqual({
      state: "done",
      line: "NHS & local data — 6 GP practices, 9 dentists and 11 pharmacies across CM3; 4 rail stations, from Hatfield Peverel to Althorne",
    });
  });

  it("carries the stamp's place: the filed post town, and the county only when single", () => {
    const payload = districtCheckingPayload(servedBundle());
    if (payload.kind !== "district") throw new Error("expected a district payload");
    expect(payload.postTown).toBe("Chelmsford");
    expect(payload.county).toBe("Essex");

    const straddling = servedBundle();
    straddling.head.counties = ["Essex", "Suffolk"];
    const second = districtCheckingPayload(straddling);
    if (second.kind !== "district") throw new Error("expected a district payload");
    expect(second.county).toBeNull();
  });
});

describe("named states — a group completes on its brain's own words", () => {
  it("crime not filed (today's production truth): the neighbourhood completes unavailable on the verbatim line", () => {
    const bundle = servedBundle();
    bundle.sections.crime = {
      state: "not-filed",
      line: CRIME_NOT_FILED_LINE,
      total: null,
      windowLine: null,
      per1000: null,
      england: null,
      categories: [],
      sourceName: null,
      sourceLine: null,
    };
    bundle.sections.flood.surfaceWaterNotCoveredLine = null;
    const payload = districtCheckingPayload(bundle);
    if (payload.kind !== "district") throw new Error("expected a district payload");
    expect(payload.groups.neighbourhood).toEqual({
      state: "unavailable",
      line: `ONS & Police.uk — 41,850 residents across 26 small areas; Police.uk — ${CRIME_NOT_FILED_LINE}`,
    });
    // And with the surface-water caveat lifted, Home completes done.
    expect(payload.groups.home.state).toBe("done");
  });

  it("schools not filed completes Family Checks unavailable on the results view's sentence", () => {
    const bundle = servedBundle();
    bundle.sections.schools.state = "not-filed";
    const payload = districtCheckingPayload(bundle);
    if (payload.kind !== "district") throw new Error("expected a district payload");
    expect(payload.groups.family).toEqual({
      state: "unavailable",
      line: "Schools are not filed for this district yet.",
    });
  });

  it("a Welsh district's flood section names its boundary and Home completes unavailable", () => {
    const bundle = servedBundle();
    bundle.sections.flood = {
      ...bundle.sections.flood,
      state: "not-covered",
      line: FLOOD_NOT_COVERED_LINE,
      riversSea: null,
      zones: null,
      surfaceWaterNotCoveredLine: null,
    };
    const payload = districtCheckingPayload(bundle);
    if (payload.kind !== "district") throw new Error("expected a district payload");
    expect(payload.groups.home.state).toBe("unavailable");
    expect(payload.groups.home.line.endsWith(FLOOD_NOT_COVERED_LINE)).toBe(true);
  });

  it("an unfiled council names itself inside Home, Costs & Risks", () => {
    const bundle = servedBundle();
    bundle.sections.councilTax.councils = bundle.sections.councilTax.councils.slice(0, 1);
    bundle.sections.councilTax.unfiledCouncils = ["Maldon"];
    bundle.sections.flood.surfaceWaterNotCoveredLine = null;
    const payload = districtCheckingPayload(bundle);
    if (payload.kind !== "district") throw new Error("expected a district payload");
    expect(payload.groups.home).toEqual({
      state: "unavailable",
      line: "HM Land Registry — median sold price £425,000 across 612 sales; council tax Band D £2,148.00 in Braintree; Maldon — its council tax charges are not filed yet.; 88% of postcodes outside the mapped river & sea flood bands",
    });
  });

  it("everyday counts not filed completes What's Nearby unavailable", () => {
    const bundle = servedBundle();
    bundle.sections.everyday.state = "not-filed";
    const payload = districtCheckingPayload(bundle);
    if (payload.kind !== "district") throw new Error("expected a district payload");
    expect(payload.groups.nearby).toEqual({
      state: "unavailable",
      line: "Everyday counts are not filed for this district yet.",
    });
  });

  it("air not filed names itself under Defra in The Neighbourhood", () => {
    const bundle = servedBundle();
    bundle.sections.air.state = "not-filed";
    const payload = districtCheckingPayload(bundle);
    if (payload.kind !== "district") throw new Error("expected a district payload");
    expect(payload.groups.neighbourhood.state).toBe("unavailable");
    expect(payload.groups.neighbourhood.line).toContain(
      "Defra — Modelled air quality is not filed for this district's postcodes yet.",
    );
  });
});

describe("served edges — the derivation never invents", () => {
  it("a grammar school present joins as an including clause; singulars hold", () => {
    const bundle = servedBundle();
    bundle.sections.schools.primary = 1;
    bundle.sections.schools.secondary = 1;
    bundle.sections.schools.grammar = 1;
    const payload = districtCheckingPayload(bundle);
    if (payload.kind !== "district") throw new Error("expected a district payload");
    expect(payload.groups.family.line).toBe(
      "DfE & Ofsted — 1 primary school and 1 secondary school found across CM3 — including 1 grammar school",
    );
  });

  it("no primary or secondary phases: the section's own headline stands for the group", () => {
    const bundle = servedBundle();
    bundle.sections.schools.primary = 0;
    bundle.sections.schools.secondary = 0;
    bundle.sections.schools.counted = 7;
    const payload = districtCheckingPayload(bundle);
    if (payload.kind !== "district") throw new Error("expected a district payload");
    expect(payload.groups.family).toEqual({
      state: "done",
      line: "7 schools are filed inside CM3.",
    });
    bundle.sections.schools.counted = 0;
    const zero = districtCheckingPayload(bundle);
    if (zero.kind !== "district") throw new Error("expected a district payload");
    expect(zero.groups.family).toEqual({ state: "done", line: "0 schools are filed inside CM3." });
  });

  it("too few sales for a median serves the count without a median; none serves the recorded zero", () => {
    const bundle = servedBundle();
    bundle.sections.soldPrices.median = null;
    bundle.sections.soldPrices.count = 3;
    const payload = districtCheckingPayload(bundle);
    if (payload.kind !== "district") throw new Error("expected a district payload");
    expect(payload.groups.home.line).toContain(
      "HM Land Registry — 3 recorded sales across CM3 — too few for a district median;",
    );
    bundle.sections.soldPrices.count = 0;
    const none = districtCheckingPayload(bundle);
    if (none.kind !== "district") throw new Error("expected a district payload");
    expect(none.groups.home.line).toContain("HM Land Registry — no recorded sales across CM3;");
  });

  it("live flood warnings lead the flood half; an unanswered live feed follows the filed answer", () => {
    const bundle = servedBundle();
    bundle.sections.flood.surfaceWaterNotCoveredLine = null;
    bundle.sections.flood.warnings = {
      state: "warnings",
      areas: [{ severity: "Flood warning", description: "River Chelmer" }],
      line: "1 live flood warning is in force for areas in or around CM3 just now.",
    };
    const payload = districtCheckingPayload(bundle);
    if (payload.kind !== "district") throw new Error("expected a district payload");
    expect(payload.groups.home.line).toContain(
      "; 1 live flood warning is in force for areas in or around CM3 just now.; 88% of postcodes outside",
    );
    bundle.sections.flood.warnings = {
      state: "unavailable",
      areas: [],
      line: "Live flood warnings could not be checked just now.",
    };
    const second = districtCheckingPayload(bundle);
    if (second.kind !== "district") throw new Error("expected a district payload");
    expect(
      second.groups.home.line.endsWith("Live flood warnings could not be checked just now."),
    ).toBe(true);
    expect(second.groups.home.state).toBe("done");
  });

  it("one station names itself; no stations adds no segment", () => {
    const bundle = servedBundle();
    bundle.sections.everyday.stations = ["Hatfield Peverel"];
    const payload = districtCheckingPayload(bundle);
    if (payload.kind !== "district") throw new Error("expected a district payload");
    expect(payload.groups.nearby.line).toBe(
      "NHS & local data — 6 GP practices, 9 dentists and 11 pharmacies across CM3; 1 rail station, Hatfield Peverel",
    );
    bundle.sections.everyday.stations = [];
    const none = districtCheckingPayload(bundle);
    if (none.kind !== "district") throw new Error("expected a district payload");
    expect(none.groups.nearby.line).toBe(
      "NHS & local data — 6 GP practices, 9 dentists and 11 pharmacies across CM3",
    );
  });
});

describe("the payload's other kind, and the failure outcomes", () => {
  it("a not-covered bundle answers the not-covered kind with its nation", () => {
    expect(
      districtCheckingPayload({ kind: "not-covered", outward: "EH9", nation: "scotland" }),
    ).toEqual({ kind: "not-covered", outward: "EH9", nation: "scotland" });
  });

  it("the failure outcomes complete every group failed with its named line", () => {
    expect(districtCheckingFailureOutcomes()).toEqual({
      family: {
        state: "failed",
        line: "Family Checks couldn't be checked just now — the rest of the check still opens.",
      },
      neighbourhood: {
        state: "failed",
        line: "The Neighbourhood couldn't be checked just now — the rest of the check still opens.",
      },
      home: {
        state: "failed",
        line: "Home, Costs & Risks couldn't be checked just now — the rest of the check still opens.",
      },
      nearby: {
        state: "failed",
        line: "What's Nearby couldn't be checked just now — the rest of the check still opens.",
      },
    });
  });
});
