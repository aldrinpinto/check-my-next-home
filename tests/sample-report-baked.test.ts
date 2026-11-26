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
//   (1) the baked body is byte-identical to the live body
//       rendered in the same forPdf form — that is the
//       whole point of the bake, and what keeps the
//       visual guard's baselines true without recapture;
//   (2) BUG-364: the baked body carries no
//       check-another-home box — the box is interactive
//       and a baked copy never hydrates — while the
//       default live body still carries it (the page
//       renders the live box itself, after the body, in
//       both branches);
//   (3) the seam's two bypasses: the SAMPLE_REPORT_NOW pin
//       reads nothing even with a bake file standing, and
//       an absent bake file falls back to the live render;
//   (4) a standing bake file is served verbatim.
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
  it("the baked body matches the live body in the same forPdf form, and carries no box", () => {
    const view = anonymisedFixtureView();
    const baked = renderSampleReportBody(view);
    // The live body in the same forPdf form: the page's
    // live branch renders this exact fragment, then the
    // live box after it.
    const liveForPdf = renderToStaticMarkup(
      createElement(SampleReportBody, { view, forPdf: true }),
    );
    expect(baked).toBe(liveForPdf);
    // BUG-364: no box in the baked body — a baked
    // PostcodeBox never hydrates and searches nothing.
    expect(baked).not.toContain("Done with this home?");
    // The body itself carries the sample's furniture.
    expect(baked).toContain("This is a sample report");
    expect(baked).toContain("Download this sample report as a PDF");
    expect(baked).toContain("12 Willow Close");
    // The default live body still carries the box — the
    // ReportPage wiring it comes from is unchanged.
    const liveDefault = renderToStaticMarkup(createElement(SampleReportBody, { view }));
    expect(liveDefault).toContain("Done with this home?");
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
