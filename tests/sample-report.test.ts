import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SampleReportDocument from "../components/SampleReportDocument";
import SampleReportPrintDocument from "../components/SampleReportPrintDocument";
import { buildReportView } from "../lib/report";
import {
  anonymiseSampleView,
  mergeSampleBundles,
  sampleReportInput,
  suppressSampleNames,
  type SampleCandidate,
  type SampleHomeIdentity,
} from "../lib/sample-report";
import { baseNearby, birkdale, crimeServed, floodServed, input } from "./fixtures/report-inputs";

// BUG-159 — the sample report is the REAL generated report.
//
// What is pinned here:
//   (1) the anonymisation: the generated view for the
//       fixture home (Birkdale-shaped) is passed through
//       the anonymiser with the fixture's identity, and
//       the rendered document wears the fiction — 12
//       Willow Close, MB3 4QX, the fiction certificate
//       number, £425,000, 22 March 2022 — while the
//       pipeline's own content stands (the ten sections
//       in order, the served facts, the BUG-158 chart);
//   (2) the LEAK GUARD: no real identifier of any
//       contributing home appears in the rendered view
//       or the print composition — "Birkdale", the real
//       postcode, the real certificate number, the own
//       sale's price and date in every composed form;
//   (3) the per-section merge: each section group is
//       taken whole from the candidate that serves it
//       fullest, the primary wins ties, and the sold
//       bundle is always the primary's.
//
// The page itself (app/sample-report) resolves the real
// golden homes through the pipeline and renders this
// composition; its furniture (the PDF download line, the
// indexability gate) is pinned by the e2e suites. The
// print composition's PDF is pinned in
// tests/report-pdf.test.ts.

const FIXTURE_IDENTITY: SampleHomeIdentity = {
  label: "19 Birkdale Rise",
  street: "Birkdale Rise",
  postcode: "CM3 2JT",
  certificateNumbers: ["0000-0000-0000-0000-0001"],
  ownSales: [{ price: 588995, dateIso: "2023-06-15" }],
};

// The guard bans every identity-bearing form: the home's
// label and street (both cases), its postcode, its
// certificate number, its own sale's price and date in
// every composed form — AND the bare street name itself,
// in every case form (founder ruling, 22 Nov 2026: the
// BUG-159 carve-out is closed — "no 'Birkdale' anywhere
// in the sample"). The name is never renamed out of a
// genuine place name (that would fabricate a fact):
// instead the anonymised fixture below runs the same
// suppression the server seam runs — any served entry
// whose name carries the banned name is dropped from the
// sample's lists before composition, as if unfiled.
const LEAKS = [
  "19 Birkdale",
  "Birkdale Rise",
  "BIRKDALE RISE",
  "Birkdale",
  "birkdale",
  "BIRKDALE",
  "CM3 2JT",
  "0000-0000-0000-0000-0001",
  "588,995",
  "£588,995",
  "15 June 2023",
  "15 Jun 2023",
  "2023-06-15",
];

function anonymisedFixtureView() {
  const fixture = input();
  const bundles = suppressSampleNames(
    {
      nearby: fixture.nearby,
      flood: fixture.flood,
      area: fixture.area,
      sold: fixture.sold,
      crime: fixture.crime,
    },
    [FIXTURE_IDENTITY],
  );
  return anonymiseSampleView(buildReportView({ ...fixture, ...bundles }), [FIXTURE_IDENTITY]);
}

describe("the generated sample — anonymisation and the leak guard (BUG-159)", () => {
  it("the document wears the fiction and keeps the pipeline's own content", () => {
    const html = renderToStaticMarkup(
      createElement(SampleReportDocument, { view: anonymisedFixtureView() }),
    );
    // The fiction identity.
    expect(html).toContain("12 Willow Close");
    expect(html).toContain("Millbrook, Kingsford, Kent MB3 4QX");
    expect(html).toContain("0000-0000-0000-0000-0000");
    expect(html).toContain("£425,000");
    expect(html).toContain("22 Mar 2022");
    // The pipeline's own content stands: the report's
    // ten sections in their order, the served crime
    // facts, and the BUG-158 band chart from the served
    // certificate.
    const titles = [
      "Price &amp; this home",
      "Sold prices nearby",
      "Schools &amp; nurseries",
      "Health, air &amp; crime",
      "What&#x27;s nearby",
      "The neighbourhood",
      "Home, costs &amp; risks",
      "Flood risk",
      "Questions to ask the seller",
      "Sources, notes &amp; disclaimers",
    ];
    let at = -1;
    for (const title of titles) {
      const next = html.indexOf(title, at + 1);
      expect(next, title).toBeGreaterThan(at);
      at = next;
    }
    expect(html).toContain("330 incidents");
    expect(html).toContain("51.7 recorded crimes for every 1,000 residents here");
    expect(html).toContain('aria-label="Energy rating scale, with this home at Band B, score 85"');
    // The banner says what the sample now is.
    expect(html).toContain("This is a sample report");
    expect(html).toContain("combined section by section and anonymised");
  });

  it("the leak guard: no real identifier appears in the rendered document", () => {
    const html = renderToStaticMarkup(
      createElement(SampleReportDocument, { view: anonymisedFixtureView() }),
    );
    for (const leak of LEAKS) {
      expect(html, leak).not.toContain(leak);
    }
  });

  it("the leak guard covers the print composition and the view's data models", () => {
    const view = anonymisedFixtureView();
    const html = renderToStaticMarkup(createElement(SampleReportPrintDocument, { view }));
    for (const leak of LEAKS) {
      expect(html, leak).not.toContain(leak);
    }
    // The view's serialised data (the price models, the
    // map models) carries no identifier either.
    const serialised = JSON.stringify(view);
    for (const leak of LEAKS) {
      expect(serialised, leak).not.toContain(leak);
    }
    // The print composition: the SAMPLE cover stands
    // before the document.
    expect(html.indexOf('class="rpt-cover"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="rpt-cover"')).toBeLessThan(html.indexOf('class="report-wrap"'));
    expect(html).toContain("Sample report — 12 Willow Close");
  });
});

describe("the name suppression (founder ruling, 22 Nov 2026)", () => {
  function suppressedBundles() {
    const fixture = input();
    return suppressSampleNames(
      {
        nearby: fixture.nearby,
        flood: fixture.flood,
        area: fixture.area,
        sold: fixture.sold,
        crime: fixture.crime,
      },
      [FIXTURE_IDENTITY],
    );
  }

  it("drops a banned-named entry whole, and the emptied category serves the builder's own empty form", () => {
    const bundles = suppressedBundles();
    if (bundles.nearby.kind !== "distances") throw new Error("fixture nearby is distances");
    const byKey = (key: string) =>
      bundles.nearby.kind === "distances"
        ? bundles.nearby.categories.find((c) => c.category === key)
        : undefined;
    // The fixture's only dentist is "Birkdale Dental":
    // dropped, never renamed — and the essential category
    // falls to the exact none-within form the builder
    // itself serves for an unfiled dentist, count and all.
    const dentist = byKey("dentist");
    expect(dentist?.places).toEqual([]);
    expect(dentist?.countWithin).toBe(0);
    expect(dentist?.state).toBe("none-within");
    expect(dentist?.line).toBe("no dentists within 2 miles of the postcode point");
    // The fixture's only park is "Birkdale Rise Green":
    // dropped; the non-essential category serves the
    // builder's own empty form for the reduced filing.
    const parks = byKey("parks");
    expect(parks?.places).toEqual([]);
    expect(parks?.countWithin).toBe(0);
    expect(parks?.state).toBe("empty");
    expect(parks?.line).toBe("no greenspace site within 2 miles of the postcode point");
    // An entry carrying no banned name is untouched,
    // count included — suppression adjusts nothing else.
    const supermarket = byKey("supermarket");
    expect(supermarket?.places.map((p) => p.name)).toEqual(["Co-op"]);
    expect(supermarket?.countWithin).toBe(2);
  });

  it("never mutates the bundles it is given", () => {
    suppressedBundles();
    const fixture = input();
    if (fixture.nearby.kind !== "distances") throw new Error("fixture nearby is distances");
    const dentist = fixture.nearby.categories.find((c) => c.category === "dentist");
    expect(dentist?.places.map((p) => p.name)).toEqual(["Birkdale Dental"]);
    expect(dentist?.countWithin).toBe(1);
  });
});

describe("the per-section merge (BUG-159)", () => {
  function candidate(id: string, mutate?: (c: SampleCandidate) => void): SampleCandidate {
    const base = input();
    const candidate: SampleCandidate = {
      id,
      resolution: birkdale,
      bundles: {
        nearby: base.nearby,
        flood: base.flood,
        area: base.area,
        sold: base.sold,
        crime: base.crime,
      },
    };
    mutate?.(candidate);
    return candidate;
  }

  it("ties go to the primary, and the sold bundle is always the primary's", () => {
    const primary = candidate("primary");
    const twin = candidate("twin");
    const merged = mergeSampleBundles([primary, twin]);
    for (const group of Object.values(merged.sources)) {
      expect(group).toBe("primary");
    }
    expect(merged.bundles.sold).toBe(primary.bundles.sold);
    // The merged input composes through the real builder.
    const view = buildReportView(sampleReportInput(primary, merged, new Date()));
    expect(view.sections).toHaveLength(10);
  });

  it("a section is taken whole from the home that serves it fullest", () => {
    const primary = candidate("primary");
    // The challenger stands inside Flood Zone 3 (the
    // Capital East case): its flood section is fuller
    // and is taken whole; its unserved crime loses to
    // the primary's served bundle.
    const challenger = candidate("challenger", (c) => {
      const flood = structuredClone(floodServed);
      const zones = flood.flood.layers.find((layer) => layer.layer === "flood_zone");
      if (zones) {
        zones.pointState = "inside";
        zones.covering = {
          label: "FZ3",
          displayLabel: "Flood Zone 3",
          definition: "Land with a high chance of flooding.",
          detail: null,
        } as (typeof zones)["covering"];
        zones.line = "This home is in Flood Zone 3.";
      }
      c.bundles.flood = flood;
      c.bundles.crime = { ...crimeServed, crime: { state: "not-filed", reason: "Not filed." } };
    });
    const merged = mergeSampleBundles([primary, challenger]);
    expect(merged.sources.flood).toBe("challenger");
    expect(merged.bundles.flood).toBe(challenger.bundles.flood);
    expect(merged.sources.crime).toBe("primary");
    expect(merged.bundles.crime).toBe(primary.bundles.crime);
    // The merged flood composes: Section 8 hears the
    // zone.
    const view = buildReportView(sampleReportInput(primary, merged, new Date()));
    const floodSection = view.sections.find((section) => section.title === "Flood risk");
    expect(JSON.stringify(floodSection)).toContain("Flood Zone 3");
  });

  it("a fuller schools group wins its categories whole", () => {
    const primary = candidate("primary", (c) => {
      const nearby = structuredClone(baseNearby);
      if (nearby.kind !== "distances") throw new Error("fixture nearby is a distances bundle");
      for (const answer of nearby.categories) {
        if (answer.category.startsWith("schools") || answer.category === "nurseries") {
          answer.state = "none-within";
          answer.places = [];
          answer.countWithin = 0;
          answer.beyondNearest = null;
          answer.line = "None filed.";
        }
      }
      c.bundles.nearby = nearby;
    });
    const challenger = candidate("challenger");
    const merged = mergeSampleBundles([primary, challenger]);
    expect(merged.sources.schools).toBe("challenger");
    if (merged.bundles.nearby.kind === "distances") {
      const primaryAnswer = merged.bundles.nearby.categories.find(
        (answer) => answer.category === "schools-primary",
      );
      expect(primaryAnswer?.state).toBe("within");
    } else {
      throw new Error("expected a distances bundle");
    }
  });
});
