import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import SampleReportBody from "../components/SampleReportBody";
import { renderSampleReportBody } from "../lib/server/sample-report-render";
import { buildReportView } from "../lib/report";
import {
  anonymiseSampleView,
  fictioniseSampleOwnSale,
  suppressSampleNames,
  type SampleHomeIdentity,
} from "../lib/sample-report";
import { input } from "./fixtures/report-inputs";

// BUG-219 — the sample report's pre-rendered body.
//
// What is pinned here:
//   (1) the served page is byte-identical whether the body
//       comes from the bake or the live render — that is
//       the whole point of the bake, and what keeps the
//       visual guard's baselines true without recapture;
//   (2) the seam's two bypasses: the SAMPLE_REPORT_NOW pin
//       reads nothing even with a bake file standing, and
//       an absent bake file falls back to the live render;
//   (3) a standing bake file is served verbatim.
//
// The fixture view is the anonymised Birkdale-shaped view
// tests/sample-report.test.ts builds (the same identity,
// the same suppression), so the rendered body wears the
// fiction — 12 Willow Close, MB3 4QX — and the leak guard
// there already covers the content.

const FIXTURE_IDENTITY: SampleHomeIdentity = {
  label: "19 Birkdale Rise",
  street: "Birkdale Rise",
  postcode: "CM3 2JT",
  certificateNumbers: ["0000-0000-0000-0000-0001"],
  ownSales: [{ price: 588995, dateIso: "2023-06-15" }],
};

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

describe("the baked sample body (BUG-219)", () => {
  it("the served page is byte-identical whether the body comes from the bake or the live render", () => {
    const view = anonymisedFixtureView();
    const baked = renderSampleReportBody(view);
    // The page's shell, both ways: the live branch renders
    // the fragment as JSX; the baked branch injects the
    // pre-rendered string.
    const live = renderToStaticMarkup(
      createElement(
        "main",
        { className: "site-pages" },
        createElement(
          "div",
          { className: "site-pages__inner" },
          createElement(SampleReportBody, { view }),
        ),
      ),
    );
    const served = renderToStaticMarkup(
      createElement(
        "main",
        { className: "site-pages" },
        createElement("div", {
          className: "site-pages__inner",
          dangerouslySetInnerHTML: { __html: baked },
        }),
      ),
    );
    expect(served).toBe(live);
    // The body itself carries the sample's furniture.
    expect(baked).toContain("This is a sample report");
    expect(baked).toContain("Download this sample report as a PDF");
    expect(baked).toContain("12 Willow Close");
  });
});

describe("the baked-body seam (BUG-219)", () => {
  afterEach(() => {
    delete process.env.SAMPLE_REPORT_NOW;
    vi.resetModules();
  });

  it("the pin bypass: SAMPLE_REPORT_NOW set reads nothing, even with a bake file standing", async () => {
    vi.resetModules();
    const mod = await import("../lib/server/sample-report-html");
    const path = mod.BAKED_SAMPLE_REPORT_HTML_PATH;
    expect(existsSync(path)).toBe(false);
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, "<p>marker</p>");
      process.env.SAMPLE_REPORT_NOW = "2026-11-22T12:00:00.000Z";
      await expect(mod.getSampleReportBody()).resolves.toBeNull();
    } finally {
      await rm(path, { force: true });
      await rm(dirname(path), { recursive: true, force: true });
    }
  });

  it("an absent bake file falls back to the live render", async () => {
    vi.resetModules();
    const mod = await import("../lib/server/sample-report-html");
    expect(existsSync(mod.BAKED_SAMPLE_REPORT_HTML_PATH)).toBe(false);
    await expect(mod.getSampleReportBody()).resolves.toBeNull();
  });

  it("a standing bake file is served verbatim", async () => {
    vi.resetModules();
    const mod = await import("../lib/server/sample-report-html");
    const path = mod.BAKED_SAMPLE_REPORT_HTML_PATH;
    expect(existsSync(path)).toBe(false);
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, "<p>marker</p>");
      await expect(mod.getSampleReportBody()).resolves.toBe("<p>marker</p>");
    } finally {
      await rm(path, { force: true });
      await rm(dirname(path), { recursive: true, force: true });
    }
  });
});
