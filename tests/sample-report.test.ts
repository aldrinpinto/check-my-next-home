import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SampleReportDocument from "../components/SampleReportDocument";
import SampleReportPrintDocument from "../components/SampleReportPrintDocument";
import { defaultDeposit, mortgageMonthly, stampDuty } from "../lib/calculators";
import { buildReportView } from "../lib/report";
import {
  anonymiseSampleView,
  fictioniseSampleOwnSale,
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
//       sale's date in every composed form. The own
//       sale's PRICE is not in the guard: the postcode
//       median equals it (£588,995), so the median
//       legitimately reads £588,995 — the guard is
//       median-aware (BUG-241), and the fiction-own-sale
//       tests below pin the median contexts against the
//       own-sale contexts instead;
//   (3) the per-section merge: each section group is
//       taken whole from the candidate that serves it
//       fullest, the primary wins ties, and the sold
//       bundle is always the primary's;
//   (4) the fiction own sale (BUG-234/235/236, BUG-241):
//       the primary's own sale is rewritten to the
//       fiction price and date at the bundle layer,
//       before composition — so Section 7's loan,
//       deposit and duty, the dot plot's brass dot and
//       the first-sale year all recompute from
//       £425,000 / 22 March 2022, while the postcode
//       median keeps its real £588,995.
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
// certificate number, and its own sale's DATE in every
// composed form — AND the bare street name itself, in
// every case form (founder ruling, 22 Nov 2026: the
// BUG-159 carve-out is closed — "no 'Birkdale' anywhere
// in the sample"). The name is never renamed out of a
// genuine place name (that would fabricate a fact):
// instead the anonymised fixture below runs the same
// suppression the server seam runs — any served entry
// whose name carries the banned name is dropped from the
// sample's lists before composition, as if unfiled.
//
// The own sale's PRICE is deliberately NOT in this list
// (BUG-241): the postcode median equals it (£588,995
// over 29 counted), so the median legitimately reads
// £588,995 in the Section 1 bullet, the short-version
// price bullet, the dot-plot caption and median line,
// and the median tile. A blanket ban on "£588,995"
// would ban the true median. The fiction-own-sale
// tests below pin the two apart: the median contexts
// read £588,995, the own-sale contexts read £425,000.
const LEAKS = [
  "19 Birkdale",
  "Birkdale Rise",
  "BIRKDALE RISE",
  "Birkdale",
  "birkdale",
  "BIRKDALE",
  "CM3 2JT",
  "0000-0000-0000-0000-0001",
  "15 June 2023",
  "15 Jun 2023",
  "2023-06-15",
];

function anonymisedFixtureView() {
  const fixture = input();
  const bundles = fictioniseSampleOwnSale(
    suppressSampleNames(
      {
        nearby: fixture.nearby,
        flood: fixture.flood,
        area: fixture.area,
        sold: fixture.sold,
        crime: fixture.crime,
      },
      [FIXTURE_IDENTITY],
    ),
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

describe("the fiction own sale (BUG-234/235/236; BUG-241)", () => {
  const view = anonymisedFixtureView();
  const section = (n: number) => view.sections.find((s) => s.number === n)!;
  const serialised = JSON.stringify(view);

  it("Section 7 recomputes from the fiction price — loan, deposit, duty and the monthly figure", () => {
    // BUG-234: the loan sentence used to read "On a loan
    // of £441,746 (£425,000 price less £147,249
    // deposit)" — the real price's loan and deposit
    // against the fiction price label — and the duty
    // £16,950, the real price's duty. The builder now
    // computes from £425,000 throughout.
    const s7 = section(7);
    const list = s7.blocks.find(
      (b) => b.type === "list" && b.items.some((item) => item.startsWith("On a loan of")),
    );
    if (!list || list.type !== "list") throw new Error("expected the mortgage findings list");
    const expected = mortgageMonthly(425000, defaultDeposit(425000), 4.5, 25);
    expect(list.items[0]).toBe(expected.sentence);
    expect(list.items[0]).toContain("£318,750");
    expect(list.items[0]).toContain("£106,250");
    expect(list.items[1]).toBe(
      `Stamp duty on that price would be £${stampDuty(425000, "moving").toLocaleString("en-GB")} at the standard rates for a buyer moving from their own home.`,
    );
    expect(list.items[1]).toContain("£8,750");
    const basis = s7.blocks.find(
      (b) =>
        b.type === "line" && b.text.startsWith("Worked on this home's last recorded sale price"),
    );
    if (!basis || basis.type !== "line") throw new Error("expected the mortgage basis line");
    expect(basis.text).toContain("£425,000 on 22 March 2022");
    // The real price's figures appear nowhere in the
    // view — not in Section 7, not anywhere else.
    for (const stale of ["£441,746", "£147,249", "£16,950"]) {
      expect(serialised, stale).not.toContain(stale);
    }
  });

  it("the first-sale year is 2022 everywhere — the sale date and the year agree (BUG-235)", () => {
    const s1 = section(1);
    const tiles = s1.blocks.find((b) => b.type === "tiles");
    if (!tiles || tiles.type !== "tiles") throw new Error("expected the Section 1 tiles");
    const held = tiles.tiles.find((tile) => tile.label === "Held by last owner");
    expect(held?.sub).toBe("New build — the 2022 sale was its first");
    const rich = s1.blocks.filter((b) => b.type === "richList");
    const richText = rich
      .flatMap((b) => (b.type === "richList" ? b.items : []))
      .map((item) => item.map((segment) => segment.text).join(""))
      .join(" | ");
    expect(richText).toContain("Built: new build, first sold in 2022.");
    expect(serialised).not.toContain("the 2023 sale was its first");
    expect(serialised).not.toContain("first sold in 2023");
    expect(view.masthead.meta.find((m) => m.label === "Last sale")?.value).toBe("£425,000");
    expect(view.masthead.meta.find((m) => m.label === "Sale date")?.value).toBe("22 Mar 2022");
  });

  it("the dot plot puts the brass dot at £425,000 and keeps the median at £588,995 (BUG-236, BUG-241)", () => {
    const s2 = section(2);
    const plotBlock = s2.blocks.find((b) => b.type === "dotPlot");
    if (!plotBlock || plotBlock.type !== "dotPlot") throw new Error("expected the dot plot");
    const plot = plotBlock.plot;
    if (!plot.home) throw new Error("expected the home dot");
    expect(plot.home.label).toBe("This home — £425,000");
    // The fixture's axis runs £200k–£1m in £200k steps:
    // the brass dot sits just right of the £400k tick,
    // well left of the £600k tick — not over £600k.
    const tick400 = plot.ticks.find((t) => t.label === "£400k");
    const tick600 = plot.ticks.find((t) => t.label === "£600k");
    if (!tick400 || !tick600) throw new Error("expected the £400k and £600k ticks");
    expect(plot.home.x).toBeGreaterThan(tick400.x);
    expect(plot.home.x).toBeLessThan(tick600.x);
    // The median line stands apart from the brass dot,
    // at the real median — and the caption says so.
    expect(plot.median.x).not.toBe(plot.home.x);
    expect(plot.median.x).toBeGreaterThan(plot.home.x);
    expect(plot.medianLine).toContain("Median value £588,995");
    expect(plot.caption).toContain("The dashed line is the postcode median, £588,995");
    expect(plot.caption).toContain("This home's sale is the brass dot.");
    expect(plot.caption).not.toContain("sits on the median line");
    expect(plot.ariaLabel).toContain("The dashed line is the postcode median, £588,995");
    // The home's real sale stays in the counted set as
    // an unlabelled grey dot at the median's position —
    // the rewrite moves the brass dot, never the data.
    expect(plot.dots.some((dot) => dot.x === plot.median.x)).toBe(true);
    // The tiles agree: the median tile is real, the
    // home tile is fiction.
    const tiles = s2.blocks.find((b) => b.type === "tiles");
    if (!tiles || tiles.type !== "tiles") throw new Error("expected the Section 2 tiles");
    expect(tiles.tiles.find((tile) => tile.label === "Postcode median")?.value).toBe("£588,995");
    expect(tiles.tiles.find((tile) => tile.label === "This home")?.value).toBe("£425,000");
  });

  it("the own-history and recent-sales rows wear the fiction sale", () => {
    const s1 = section(1);
    const ownTable = s1.blocks.find((b) => b.type === "table");
    if (!ownTable || ownTable.type !== "table") throw new Error("expected the own-history table");
    expect(ownTable.rows).toEqual([
      ["22 Mar 2022", "£425,000", "— first recorded sale (new build)", "", ""],
    ]);
    const s2 = section(2);
    const recentTable = s2.blocks.find((b) => b.type === "table");
    if (!recentTable || recentTable.type !== "table")
      throw new Error("expected the recent-sales table");
    expect(recentTable.rows).toEqual([
      ["12 Willow Close", "22 March 2022", "£425,000", "Detached", "Freehold", "Yes"],
    ]);
  });

  it("the short version's price bullet keeps the real median beside the fiction sale", () => {
    if (!view.shortVersion) throw new Error("expected the short version");
    const price = view.shortVersion.groups.find((g) => g.heading === "Price & sold history");
    if (!price) throw new Error("expected the short-version price group");
    const lines = price.lines.map((line) => line.map((segment) => segment.text).join(""));
    expect(lines).toContain(
      "Last sold for £425,000 on 22 March 2022 — its first recorded sale as a new build.",
    );
    expect(lines).toContain(
      "Postcode median (category A sales): £588,995, over 29 counted sales spanning 20 Dec 1996 to 20 Jul 2026.",
    );
  });

  it("the fiction rewrite is pure, and touches only the own sale", () => {
    const fixture = input();
    const bundles = {
      nearby: fixture.nearby,
      flood: fixture.flood,
      area: fixture.area,
      sold: fixture.sold,
      crime: fixture.crime,
    };
    const rewritten = fictioniseSampleOwnSale(bundles, [FIXTURE_IDENTITY]);
    const sold =
      rewritten.sold.kind === "sold-prices" && "ownHistory" in rewritten.sold
        ? rewritten.sold
        : null;
    if (!sold) throw new Error("expected a rung-1 sold bundle");
    expect(sold.ownHistory[0].price).toBe(425000);
    expect(sold.ownHistory[0].date).toBe("2022-03-22");
    expect(sold.recentSales[0].price).toBe(425000);
    expect(sold.recentSales[0].date).toBe("2022-03-22");
    // The input is untouched, and the data the rewrite
    // must never move — the median and the counted set —
    // rides through by reference.
    const inputSold =
      bundles.sold.kind === "sold-prices" && "ownHistory" in bundles.sold ? bundles.sold : null;
    if (!inputSold) throw new Error("expected a rung-1 sold bundle");
    expect(inputSold.ownHistory[0].price).toBe(588995);
    expect(inputSold.recentSales[0].price).toBe(588995);
    expect(sold.median).toBe(inputSold.median);
    expect(sold.countedSales).toBe(inputSold.countedSales);
    expect(sold.countedSales[14].price).toBe(588995);
  });
});

describe("Section 3 counts come from the lists they head (BUG-240)", () => {
  it("every 'nearest N' heading lists exactly N rows", () => {
    const view = anonymisedFixtureView();
    const s3 = view.sections.find((s) => s.number === 3)!;
    let checked = 0;
    for (let i = 0; i < s3.blocks.length; i++) {
      const block = s3.blocks[i];
      if (block.type !== "sub") continue;
      const match = /^(.+) — nearest (\d+)$/.exec(block.text);
      if (!match) continue;
      const rows = s3.blocks[i + 1];
      if (!rows || rows.type !== "rows") throw new Error(`expected rows after ${block.text}`);
      expect(rows.rows, block.text).toHaveLength(Number(match[2]));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
