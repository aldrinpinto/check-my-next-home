import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportDoorPage from "../components/ReportDoorPage";
import { SAMPLE_REPORT_PATH } from "../lib/home";
import { homeRoute } from "../lib/journey";
import { buildReportDoorView, type ReportDoorIdentity } from "../lib/report-door";
import { FLOOD_UPSELL_LEAD } from "../lib/results";
import { REPORT_DOOR_STATE, REPORT_PRICE_LABEL } from "../lib/site";

// M7.6 — the report door's holding page: the state seam
// (ruling R1), the pinned contents (ruling R5), the
// F4-softened flood wording, and the negative pins — no
// window wording while the state is "holding" (the
// deferred free-window test is M9.6's, where its lines
// are pinned), no email capture, no gift mention.

const HOME: ReportDoorIdentity = {
  kind: "home",
  subject: "19 Birkdale Rise",
  subline: "Hatfield Peverel, CM3 2JT",
  postcode: "CM3 2JT",
  homeKey: "19||BIRKDALE RISE",
};

describe("report door — the state seam (R1)", () => {
  it("the door state is a checked-in constant and sits at holding", () => {
    expect(REPORT_DOOR_STATE).toBe("holding");
  });

  it("no surface renders free-window wording while the state is holding (P5 negative pin)", () => {
    for (const identity of [
      HOME,
      { kind: "postcode", postcode: "CM3 2JT", subline: null },
      { kind: "generic" },
    ] as ReportDoorIdentity[]) {
      const text = JSON.stringify(buildReportDoorView(identity)).toLowerCase();
      expect(text).not.toContain("free report");
      expect(text).not.toContain("report free");
      expect(text).not.toContain("launch window");
      expect(text).not.toContain("check together");
      expect(text).not.toContain("gift");
    }
  });
});

describe("report door — the holding page's contents (R5)", () => {
  it("a resolved home is named in the payment page's form: street once in the heading, area beneath", () => {
    const view = buildReportDoorView(HOME);
    expect(view.heading).toBe("The detailed report for 19 Birkdale Rise");
    expect(view.subline).toBe("Hatfield Peverel, CM3 2JT");
    expect(view.backHref).toBe(homeRoute("CM3 2JT", "19||BIRKDALE RISE"));
    expect(view.backLabel).toBe("Back to your free check");
  });

  it("a postcode-only arrival names the postcode; no home is guessed", () => {
    const view = buildReportDoorView({
      kind: "postcode",
      postcode: "CM3 2JT",
      subline: "Postcode area — CM3 2JT, not one exact home",
    });
    expect(view.heading).toBe("The detailed report for CM3 2JT");
    expect(view.subline).toBe("Postcode area — CM3 2JT, not one exact home");
    expect(view.backHref).toBe(homeRoute("CM3 2JT"));
  });

  it("the generic form names no home and routes back to the home page", () => {
    const view = buildReportDoorView({ kind: "generic" });
    expect(view.heading).toBe("The detailed report");
    expect(view.subline).toBeNull();
    expect(view.backHref).toBe("/");
  });

  it("the contents list carries the report's real depth, with the F4-softened flood lead verbatim", () => {
    const view = buildReportDoorView(HOME);
    expect(view.contentsHeading).toBe("What the detailed report adds");
    expect(view.contents).toContain(FLOOD_UPSELL_LEAD);
    expect(FLOOD_UPSELL_LEAD).toBe(
      "Plus the flood findings in full, with a location map for each check",
    );
    const text = JSON.stringify(view);
    expect(text).not.toContain("flood map pictures");
    expect(text).toContain("month by month");
    expect(text).toContain("questions to ask the seller");
  });

  it("the price is shown as the normal price, with the one-payment line", () => {
    const view = buildReportDoorView(HOME);
    expect(REPORT_PRICE_LABEL).toBe("£4.99");
    expect(view.priceLine).toBe("One payment. No subscription, nothing further to pay.");
    expect(view.stateLine).toContain("£4.99");
    expect(view.stateLine).toContain("coming in the next stage");
    expect(view.stateLine).toContain("the free check stays free in full");
  });

  it("the sample-report route is carried, labelled as the existing surfaces label it", () => {
    const view = buildReportDoorView(HOME);
    expect(view.sampleHref).toBe(SAMPLE_REPORT_PATH);
    expect(view.sampleLabel).toBe("See a SAMPLE report");
  });

  it("the rendered page has no form and no email capture of any kind", () => {
    const html = renderToStaticMarkup(
      createElement(ReportDoorPage, { view: buildReportDoorView(HOME) }),
    );
    expect(html).toContain("The detailed report for 19 Birkdale Rise");
    expect(html).toContain("What the detailed report adds");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("email");
  });
});
