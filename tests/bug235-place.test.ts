import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SampleReportDocument from "../components/SampleReportDocument";
import { buildReportView } from "../lib/report";
import {
  anonymiseSampleView,
  sampleAreaSubstitutions,
  suppressSampleNames,
  type SampleHomeIdentity,
} from "../lib/sample-report";
import { areaWith, birkdale, input } from "./fixtures/report-inputs";

// BUG-235 (place half) — the generated sample names real
// Essex geography under the fiction identity ("12 Willow
// Close, Millbrook, Kingsford, Kent"): the census MSOA,
// the deprivation LSOA, the ward, the district council,
// the postal town, and the village + county in the filed
// industrial-site address. The founder's ruling (24 Nov
// 2026, option (a)): keep the fiction identity and swap
// every real Essex place name for matching fiction
// geography. The substitution is derived from the
// primary's resolution and the merged bundles at
// generation time (lib/sample-report.ts), and applied by
// the anonymisation walk.
//
// The pins below use the LIVE shapes, not only the
// fixture's: the live ward ("Hatfield Peverel &
// Terling"), the live LSOA name ("Braintree 018C"),
// and the live industrial site (the Stuart Davis
// poultry unit at Ulting — filed address verified
// against the live register 24 Nov 2026).

const FIXTURE_IDENTITY: SampleHomeIdentity = {
  label: "19 Birkdale Rise",
  street: "Birkdale Rise",
  postcode: "CM3 2JT",
  certificateNumbers: ["0000-0000-0000-0000-0001"],
  ownSales: [{ price: 588995, dateIso: "2023-06-15" }],
};

// The four named in the defect, in their live forms.
const NAMED_REAL = [
  "Braintree 018",
  "Braintree 018C",
  "Hatfield Peverel & Terling",
  "Braintree District Council",
];

// Every real Essex name the audit found the generated
// sample surfacing (fixture dump + live DB, 24 Nov 2026).
const NO_REAL_ESSEX = [
  ...NAMED_REAL,
  "Braintree",
  "Hatfield Peverel",
  "Terling",
  "Ulting",
  "Essex",
  "Chelmsford",
  "Witham",
  "East Of England",
  "East of England",
];

// The fiction geography that must stand in their place.
const FICTION_PRESENT = [
  "Millbrook 018",
  "Millbrook 018C",
  "Millbrook & Kingsford",
  "Kingsford District Council",
  "Millbrook Station",
  "12 Willow Close, Millbrook",
  "Kingsford College",
  "Crouchmans Farm Road Millbrook Kent",
];

function liveShapedParts() {
  const fixture = input();
  if (fixture.nearby.kind !== "distances" || !fixture.nearby.industrialSites) {
    throw new Error("fixture: no industrial sites to shape");
  }
  if (fixture.area.kind !== "area-bundle") throw new Error("fixture: no area bundle to shape");
  const liveResolution = {
    ...birkdale,
    directory: { ...birkdale.directory, ward: "Hatfield Peverel & Terling" },
  };
  const liveArea = {
    ...fixture.area,
    sections: {
      ...fixture.area.sections,
      imd: {
        ...fixture.area.sections.imd,
        lsoaName: "Braintree 018C",
        line: "Among the less deprived 30 percent of areas in England — the Braintree 018C area",
      },
    },
  };
  const liveNearby = {
    ...fixture.nearby,
    industrialSites: {
      ...fixture.nearby.industrialSites,
      sites: [
        {
          ...fixture.nearby.industrialSites.sites[0],
          permitId: "YP3432XR",
          operator: "Stuart Davis Limited",
          siteAddress: "Fairwinds Farm Poultry Unit Crouchmans Farm Road Ulting Essex",
          sitePostcode: "CM9 6QS",
        },
      ],
    },
  };
  return { fixture, liveResolution, liveArea, liveNearby };
}

function liveShapedView() {
  const { fixture, liveResolution, liveArea, liveNearby } = liveShapedParts();
  const bundles = suppressSampleNames(
    {
      nearby: liveNearby,
      flood: fixture.flood,
      area: liveArea,
      sold: fixture.sold,
      crime: fixture.crime,
    },
    [FIXTURE_IDENTITY],
  );
  const areaSubs = sampleAreaSubstitutions(liveResolution, liveArea);
  return anonymiseSampleView(
    buildReportView({ ...fixture, resolution: liveResolution, ...bundles }),
    [FIXTURE_IDENTITY],
    areaSubs,
  );
}

describe("the generated sample — fiction-area substitution (BUG-235)", () => {
  it("the four named real names are absent from the view and the document", () => {
    const view = liveShapedView();
    const serialised = JSON.stringify(view);
    for (const real of NAMED_REAL) {
      expect(serialised, real).not.toContain(real);
    }
    const html = renderToStaticMarkup(createElement(SampleReportDocument, { view }));
    for (const real of NAMED_REAL) {
      expect(html, real).not.toContain(real);
    }
  });

  it("no real Essex name survives anywhere in the serialised view", () => {
    const serialised = JSON.stringify(liveShapedView());
    for (const real of NO_REAL_ESSEX) {
      expect(serialised, real).not.toContain(real);
    }
  });

  it("the fiction geography stands in their place", () => {
    const serialised = JSON.stringify(liveShapedView());
    for (const fiction of FICTION_PRESENT) {
      expect(serialised, fiction).toContain(fiction);
    }
  });

  it("the derivation maps the live names by role", () => {
    const { liveResolution, liveArea } = liveShapedParts();
    const subs = sampleAreaSubstitutions(liveResolution, liveArea);
    const mapped = new Map(subs.map((sub) => [sub.from, sub.to]));
    expect(mapped.get("Braintree 018")).toBe("Millbrook 018");
    expect(mapped.get("Braintree 018C")).toBe("Millbrook 018C");
    expect(mapped.get("Hatfield Peverel & Terling")).toBe("Millbrook & Kingsford");
    expect(mapped.get("Braintree")).toBe("Kingsford");
    expect(mapped.get("Hatfield Peverel")).toBe("Millbrook");
    expect(mapped.get("Terling")).toBe("Kingsford");
    expect(mapped.get("Chelmsford")).toBe("Kingsford");
    expect(mapped.get("Essex")).toBe("Kent");
    expect(mapped.get("Ulting")).toBe("Millbrook");
    expect(mapped.get("East Of England")).toBe("South East");
  });

  it("the derivation also maps the fixture's own shaped names", () => {
    const fixture = input();
    if (fixture.area.kind !== "area-bundle") throw new Error("fixture: no area bundle");
    const subs = sampleAreaSubstitutions(fixture.resolution, fixture.area);
    const mapped = new Map(subs.map((sub) => [sub.from, sub.to]));
    // The fixture's ward is the shaped "Witham South";
    // the fixture's LSOA name is the plain village name.
    expect(mapped.get("Witham South")).toBe("Millbrook");
    expect(mapped.get("Hatfield Peverel")).toBe("Millbrook");
    expect(mapped.get("Braintree 018")).toBe("Millbrook 018");
  });
});
