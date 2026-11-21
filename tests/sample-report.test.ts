import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SampleReportPage from "../app/sample-report/page";
import SampleReport from "../components/SampleReport";
import { SAMPLE_REPORT_PDF_PATH } from "../lib/report-pdf";

// Sample-report anonymisation (founder bug report, 18 Nov
// 2026): the /sample-report page must never present a real
// home. The worked example is an invented home with
// invented figures throughout. Dummy-home alignment
// (founder ruling, 18 Nov 2026): the one dummy home
// everywhere is the Final Sample Master's — 12 Willow
// Close, Millbrook, MB3 4QX — and this page's example and
// figures are the Master's worked example, transposed.
// These pins hold that: the served sample report contains
// the Master's dummy example, none of the real home's
// address, postcode or locality traces, and no trace of
// the retired first dummy (14 Bramblewood Lane, Ashmere,
// WM8 4QT).
describe("the served sample report (anonymised example home)", () => {
  const html = renderToString(createElement(SampleReport));

  it("presents the Master's invented example home, not a real one", () => {
    expect(html).toContain("12 Willow Close");
    expect(html).toContain("Millbrook, Kingsford, Kent MB3 4QX");
    expect(html).toContain("invented example");
  });

  it("carries the Master's worked-example figures for that home", () => {
    expect(html).toContain("£425,000");
    expect(html).toContain("22 Mar 2022");
    expect(html).toContain("over 29 counted");
    expect(html).toContain("0000-0000-0000-0000-0000");
  });

  it("contains neither the real street name nor the real postcode", () => {
    expect(html).not.toContain("Birkdale");
    expect(html).not.toContain("CM3 2JT");
  });

  it("contains no trace of the retired first dummy home", () => {
    for (const trace of ["Bramblewood", "Ashmere", "WM8 4QT", "425,750", "5031-2847"]) {
      expect(html, trace).not.toContain(trace);
    }
  });

  it("carries no other trace of the real locality", () => {
    // "River Brain" is deliberately NOT in this list: the
    // Master's worked example names a River Brain among its
    // invented flood-area rivers (through its fictional
    // Northbrook), so the string now appears as part of the
    // dummy example, carrying no reference to the real
    // home, street or postcode.
    for (const trace of [
      "Hatfield Peverel",
      "Witham",
      "River Chelmer",
      "River Ter",
      "Gleneagles Way",
      "Warren End",
      "Maldon Road",
      "St Andrew's",
      "Maltings",
      "KEGS",
      "Broomfield Hospital",
      "588,995",
    ]) {
      expect(html, trace).not.toContain(trace);
    }
  });

  it("uses no map image of a real place — the flood-map pictures are hand-drawn in the built dress (M8.3)", () => {
    expect(html).not.toContain("/sample-report/flood-map");
    expect(html).not.toContain("<img");
    // The M8.3 conform: the sample's Section 7 pictures are
    // hand-drawn flood maps in the report's own form — the
    // built titles, the attribution line, the clear-case
    // captions — not the retired "not flood maps" panels.
    expect(html).toContain("Flood zones for planning (rivers and the sea)");
    expect(html).toContain("Flooding from surface water");
    expect(html).toContain("hand-drawn for this sample in");
    expect(html).toContain("this home sits outside them");
    expect(html).toContain("OpenStreetMap contributors");
    expect(html).not.toContain("not flood maps");
  });

  it("keeps the report's sections, in the sample's order", () => {
    const headings = [
      "<h2>The short version</h2>",
      "<h2>Price &amp; this home</h2>",
      "<h2>Sold prices nearby</h2>",
      "<h2>Schools &amp; nurseries</h2>",
      "<h2>Health, air &amp; crime</h2>",
      "<h2>What&#x27;s nearby</h2>",
      "<h2>Home, costs &amp; risks</h2>",
      "<h2>Flood risk</h2>",
      "<h2>Questions to ask the seller</h2>",
      "<h2>Sources, notes &amp; disclaimers</h2>",
    ];
    let lastIndex = -1;
    for (const heading of headings) {
      const index = html.indexOf(heading);
      expect(index, heading).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });
});

// M8.8 — the served page: the route renders the standing
// component itself (the liveness pin), and carries the
// PDF download line. The sample is the report machinery's
// own worked example; it must never be swapped for a
// frozen copy that could go stale against the machinery
// it advertises.
describe("the served sample page (M8.8)", () => {
  const pageHtml = renderToString(createElement(SampleReportPage));

  it("renders the standing SampleReport component itself, not a copy", () => {
    // The page's served document contains the component's
    // own render, byte for byte: the route composes the
    // component, so what a visitor reads is always the
    // machinery's current document. A frozen transcription
    // pasted into the route would fail this the moment the
    // component moved — and the second pin below bars the
    // other frozen form, a static document asset.
    expect(pageHtml).toContain(renderToString(createElement(SampleReport)));
    expect(pageHtml).toContain("12 Willow Close");
  });

  it("keeps no static sample document among the public assets", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
      );
    const assets = walk(join(process.cwd(), "public"));
    const frozen = assets.filter((path) => /sample[^/]*\.(html|pdf)$/i.test(path));
    expect(frozen).toEqual([]);
  });

  it("carries the PDF download line, pointing at the sample PDF's path", () => {
    expect(SAMPLE_REPORT_PDF_PATH).toBe("/sample-report.pdf");
    expect(pageHtml).toContain(`href="${SAMPLE_REPORT_PDF_PATH}"`);
    expect(pageHtml).toContain("Download this sample report as a PDF");
    expect(pageHtml).toContain("marked SAMPLE on its cover");
    // The download line stands after the document it
    // downloads.
    expect(pageHtml.indexOf(`href="${SAMPLE_REPORT_PDF_PATH}"`)).toBeGreaterThan(
      pageHtml.indexOf("Sources, notes &amp; disclaimers"),
    );
  });
});
