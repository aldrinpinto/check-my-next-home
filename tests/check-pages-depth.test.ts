import { describe, expect, it } from "vitest";

import { CHECK_PAGES } from "../lib/check-pages";

// M7.12 — the depth pins for the sixteen /check/ pages
// (the sixteenth, building safety, joined in the
// follow-up stack, BUG-128).
//
// M7.8 built the pages as search landers at summary depth;
// M7.12 deepens each one to the step's full depth: every
// page must cover, in its own sections, the publisher, the
// method (how the figure is derived), the geography it is
// served at, a snapshot date or edition (or the recorded
// "as published" form where the repo names no edition),
// and the known limits — plus the step's named payloads in
// full on the crime, air-quality and flood pages.

function pageText(path: string): string {
  const page = CHECK_PAGES[path];
  if (!page) throw new Error(`no check page at ${path}`);
  return [
    page.lead,
    page.sources,
    ...page.sections.flatMap((section) => [section.heading, ...section.paragraphs]),
  ].join("\n");
}

function sectionText(path: string, heading: string): string {
  const page = CHECK_PAGES[path];
  const section = page?.sections.find((s) => s.heading === heading);
  if (!section) throw new Error(`no "${heading}" section on ${path}`);
  return section.paragraphs.join("\n");
}

const PUBLISHERS: Record<string, string[]> = {
  "/check/flood-risk": ["Environment Agency"],
  "/check/crime": ["Police.uk", "Office for National Statistics"],
  "/check/sold-prices": ["HM Land Registry"],
  "/check/schools": ["Department for Education", "Ofsted"],
  "/check/epc": ["Ministry of Housing, Communities and Local Government"],
  "/check/council-tax-band": ["Ministry of Housing, Communities and Local Government"],
  "/check/planning-constraints": ["planning.data.gov.uk", "Historic England"],
  "/check/ev-charging": ["Open Charge Map"],
  "/check/broadband": ["Ofcom"],
  "/check/public-transport": ["Department for Transport", "NaPTAN"],
  "/check/family-essentials": ["Department for Education", "NHS", "Care Quality Commission"],
  "/check/noise": ["Defra"],
  "/check/air-quality": ["Defra", "Environment Agency"],
  "/check/solar-potential": ["PVGIS", "Joint Research Centre"],
  "/check/mobile-coverage": ["Ofcom"],
  "/check/building-safety": ["First-tier Tribunal", "Building Safety Regulator"],
};

const GEOGRAPHY: Record<string, string> = {
  "/check/flood-risk": "postcode point",
  "/check/crime": "about a mile",
  "/check/sold-prices": "postcode",
  "/check/schools": "postcode",
  "/check/epc": "postcode",
  "/check/council-tax-band": "billing authority",
  "/check/planning-constraints": "home's point",
  "/check/ev-charging": "postcode",
  "/check/broadband": "postcode",
  "/check/public-transport": "postcode",
  "/check/family-essentials": "postcode",
  "/check/noise": "postcode",
  "/check/air-quality": "kilometre square",
  "/check/solar-potential": "postcode",
  "/check/mobile-coverage": "council-wide",
  "/check/building-safety": "postcode",
};

// An edition or snapshot marker the repo itself names, or
// the recorded "as published" form where it names none.
const EDITION_MARKER =
  /Census 2021|since 1995|January 2026|Round 4|2024|PVGIS-SARAH3|December 2024|tax year named|12 months named|as published/;

describe("check pages at M7.12 depth — every page", () => {
  it("covers all sixteen check pages", () => {
    expect(Object.keys(CHECK_PAGES).sort()).toEqual(Object.keys(PUBLISHERS).sort());
  });

  for (const path of Object.keys(PUBLISHERS)) {
    it(`${path} carries publisher, method, geography, snapshot and limits sections`, () => {
      const page = CHECK_PAGES[path];
      const headings = page.sections.map((s) => s.heading);
      expect(headings, path).toContain("How the figure is produced");
      expect(headings, path).toContain("Where the data comes from");
      expect(headings, path).toContain("Known limits");

      const text = pageText(path);
      // Publisher, named in the deepened sections.
      for (const publisher of PUBLISHERS[path]) expect(text, path).toContain(publisher);
      // Method: the production section is a real account,
      // not a stub.
      expect(sectionText(path, "How the figure is produced").length, path).toBeGreaterThan(200);
      // Geography the figure is served at.
      expect(text, path).toContain(GEOGRAPHY[path]);
      // Snapshot date / edition, or the "as published" form.
      expect(text, path).toMatch(EDITION_MARKER);
      // Known limits, stated on the page.
      expect(sectionText(path, "Known limits").length, path).toBeGreaterThan(120);
      // The official source is named in the sources line
      // and in the provenance section.
      expect(page.sources.length, path).toBeGreaterThan(20);
      expect(sectionText(path, "Where the data comes from").length, path).toBeGreaterThan(80);
    });
  }
});

describe("crime page — the D39 calibration working in full", () => {
  const text = pageText("/check/crime");

  it("states how the per-1,000 figure is built", () => {
    expect(text).toContain("recorded crimes within about a mile over the 12 months named");
    expect(text).toContain("Census 2021 residents of the small areas");
    expect(text).toContain("each LSOA counted whole");
    expect(text).toContain("divided by that population and multiplied by 1,000");
    // Both Basis B workings are named, not hidden.
    expect(text).toContain("the population is larger than the circle's own");
    expect(text).toContain("holding no postcode inside the mile, is missed");
  });

  it("states how the England figure is built, and how the comparison is worded", () => {
    expect(text).toContain("England's national recorded total");
    expect(text).toContain("England's Census 2021 population");
    expect(text).toContain("about X% below the England average");
    expect(text).toContain("not a measure of any one person's chance");
  });
});

describe("air quality page — the D50 limits material in full", () => {
  const text = pageText("/check/air-quality");

  it("no longer defers the limits material to another page", () => {
    expect(text).not.toContain("live on the How we check page");
    expect(text).toContain("lives on this page");
  });

  it("carries the six limit and guideline values with their instruments", () => {
    expect(text).toContain("Air Quality Standards Regulations 2010");
    expect(text).toContain("NO2 40 µg/m³");
    expect(text).toContain("PM10 40 µg/m³");
    expect(text).toContain("PM2.5 20 µg/m³");
    expect(text).toContain("WHO global air quality guidelines 2021");
    expect(text).toContain("NO2 10 µg/m³");
    expect(text).toContain("PM2.5 5 µg/m³");
    expect(text).toContain("PM10 15 µg/m³");
    expect(text).toContain("annual mean");
  });

  it("states why a modelled square is not a compliance determination, and the yardstick wording", () => {
    expect(text).toContain("not a compliance determination");
    expect(text).toContain("decided for whole zones, from monitoring and modelling together");
    expect(text).toContain("as comparisons of the modelled figure");
    expect(text).toContain("never a pass or fail for the home");
  });

  it("carries the AQMA and charging-schemes explainer (D50)", () => {
    expect(text).toContain("Air Quality Management Area");
    expect(text).toContain("under the Environment Act 1995");
    expect(text).toContain("action plan");
    expect(text).toContain("Clean-Air Zones are run by their councils, with Defra");
    expect(text).toContain("Transport for London");
    expect(text).toContain("No charge amounts are ever printed");
    expect(text).toContain("Amounts change");
    expect(text).toContain("depends on the vehicle");
    const section = CHECK_PAGES["/check/air-quality"].sections.find(
      (s) => s.heading === "Charging zones and declared areas",
    );
    const hrefs = (section?.links ?? []).map((link) => link.href);
    expect(hrefs).toContain("https://www.gov.uk/clean-air-zones");
    expect(hrefs).toContain("https://tfl.gov.uk/modes/driving/check-your-vehicle/");
  });

  it("carries the regulated industrial sites explainer (D66), as the product serves it", () => {
    expect(text).toContain("Environment Agency's Pollution Inventory");
    expect(text).toContain("2024 vintage, published in November 2025");
    expect(text).toContain("within five miles of the postcode point");
    expect(text).toContain("its operator, its permit reference");
    expect(text).toContain("releases to air the operator reported for that year");
    expect(text).toContain("below its threshold was still released");
    expect(text).toContain("covers England only");
  });
});

describe("flood page — the D49 payload in full", () => {
  const text = pageText("/check/flood-risk");

  it("states the defences record's coverage limit", () => {
    expect(text).toContain("covers only the Environment Agency's own assets");
    expect(text).toContain("owns, manages or inspects");
    expect(text).toContain("defences on smaller watercourses, are not in it");
  });

  it("states the climate scenario basis in full, with the EA caveats", () => {
    expect(text).toContain("UKCP18");
    expect(text).toContain("RCP 8.5");
    expect(text).toContain("Central allowance for rivers, covering 2040–2069");
    expect(text).toContain("Higher Central allowance for the sea, covering 2036–2065");
    expect(text).toContain("sea level rise to 2065");
    expect(text).toContain("2040–2060");
    expect(text).toContain("scenarios for planning, not predictions for a home");
    expect(text).toContain("the modelled likelihood could turn out bigger or smaller");
    expect(text).toContain("cannot say when within the period");
  });
});

describe("the step's named known-limits examples", () => {
  it("mobile is council-wide, not per-house, on the mobile page", () => {
    expect(pageText("/check/mobile-coverage")).toContain("council-wide, not per-house");
  });

  it("the broadband bands and 5G standalone limits sit on the broadband page", () => {
    const text = pageText("/check/broadband");
    expect(text).toContain("broadband speed bands may sum below 100 by the unclassified share");
    expect(text).toContain("5G standalone all-operator figures are not published by Ofcom");
  });

  it("the 5G standalone limit also sits on the mobile page, in its own context", () => {
    expect(pageText("/check/mobile-coverage")).toContain(
      "5G standalone all-operator figures are not published by Ofcom",
    );
  });
});
