import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportPage from "../components/ReportPage";
import { buildReportView, epcChartBlock } from "../lib/report";
import { input } from "./fixtures/report-inputs";

// BUG-158: the EPC band chart in the real report. Until
// this stack the chart existed only as the sample
// report's static drawing; these pins hold (a) the
// block's composition from the served certificate —
// band, score, the highlighted home band, the sample's
// colours, widths and ranges; (b) its placement in
// Section 7 — at the head of the certificate's facts,
// after the rating line and details, before the
// estimated costs; and (c) its rendering in the one
// renderer both the on-screen view and the printed PDF
// twin share.

describe("BUG-158 — epcChartBlock composition", () => {
  it("draws the sample's five bands, the home's band outlined and labelled", () => {
    const block = epcChartBlock("B", 82);
    if (block.type !== "epc-chart") throw new Error("expected an epc-chart block");
    expect(block.ariaLabel).toBe("Energy rating scale, with this home at Band B, score 82");
    expect(block.bars.map((b) => b.band)).toEqual(["A", "B", "C", "D", "E"]);
    expect(block.bars.map((b) => b.range)).toEqual(["92+", "81–91", "69–80", "55–68", "39–54"]);
    expect(block.bars.map((b) => b.colour)).toEqual([
      "#00A651",
      "#19B459",
      "#8DCE46",
      "#E3C700",
      "#F0A35E",
    ]);
    expect(block.bars.map((b) => b.widthPct)).toEqual([46, 58, 66, 74, 82]);
    const here = block.bars.filter((b) => b.here);
    expect(here).toHaveLength(1);
    expect(here[0].band).toBe("B");
    expect(here[0].label).toBe("B — this home, 82");
    expect(block.bars.find((b) => b.band === "A")!.label).toBe("A");
    expect(block.bars.find((b) => b.band === "D")!.darkText).toBe(true);
  });

  it("a home below the drawn set extends the scale to its own band", () => {
    const f = epcChartBlock("F", 30);
    if (f.type !== "epc-chart") throw new Error("expected an epc-chart block");
    expect(f.bars.map((b) => b.band)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(f.bars.at(-1)!.here).toBe(true);
    const g = epcChartBlock("G", 12);
    if (g.type !== "epc-chart") throw new Error("expected an epc-chart block");
    expect(g.bars.map((b) => b.band)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(g.bars.at(-1)!.label).toBe("G — this home, 12");
  });
});

describe("BUG-158 — Section 7 placement and rendering", () => {
  const view = buildReportView(input());
  const section7 = view.sections[6];

  it("the chart stands in Section 7, after the certificate's rating facts, before its costs", () => {
    const chartAt = section7.blocks.findIndex((b) => b.type === "epc-chart");
    expect(chartAt).toBeGreaterThanOrEqual(0);
    const chart = section7.blocks[chartAt];
    if (chart.type !== "epc-chart") throw new Error("expected an epc-chart block");
    // The fixture's served certificate: Band B, score 85.
    expect(chart.bars.find((b) => b.here)?.label).toBe("B — this home, 85");
    // Before it: the certificate's own sub-heading and
    // its rating note. After it: the energy costs line.
    const before = section7.blocks.slice(0, chartAt);
    expect(before.some((b) => b.type === "sub" && b.text.includes("Birkdale Rise"))).toBe(true);
    const after = section7.blocks.slice(chartAt + 1);
    expect(after.some((b) => b.type === "line" && b.text.startsWith("Modelled energy costs"))).toBe(
      true,
    );
  });

  it("renders in the report's one renderer (screen and PDF twin)", () => {
    const html = renderToStaticMarkup(createElement(ReportPage, { view }));
    expect(html).toContain('class="epc"');
    expect(html).toContain('aria-label="Energy rating scale, with this home at Band B, score 85"');
    expect(html).toContain("B — this home, 85");
    expect(html).toContain('class="here"');
    expect(html).toContain("#19B459");
  });
});
