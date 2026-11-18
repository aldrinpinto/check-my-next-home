import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SampleReport from "../components/SampleReport";

// Sample-report anonymisation (founder bug report, 18 Nov
// 2026): the /sample-report page must never present a real
// home. The worked example is an invented home — 14
// Bramblewood Lane, Ashmere, WM8 4QT — with invented
// figures throughout. These pins hold that: the served
// sample report contains the dummy example, and none of
// the real home's address, postcode or locality traces.
describe("the served sample report (anonymised example home)", () => {
  const html = renderToString(createElement(SampleReport));

  it("presents the invented example home, not a real one", () => {
    expect(html).toContain("14 Bramblewood Lane");
    expect(html).toContain("Ashmere, Kingsmere, Westshire WM8 4QT");
    expect(html).toContain("invented example");
  });

  it("contains neither the real street name nor the real postcode", () => {
    expect(html).not.toContain("Birkdale");
    expect(html).not.toContain("CM3 2JT");
  });

  it("carries no other trace of the real locality", () => {
    for (const trace of [
      "Hatfield Peverel",
      "Witham",
      "River Brain",
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

  it("uses no map image of a real place — the location panels are schematic", () => {
    expect(html).not.toContain("/sample-report/flood-map");
    expect(html).not.toContain("<img");
    expect(html).toContain("Schematic location panel");
    expect(html).toContain("Bramblewood Lane close-up");
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
