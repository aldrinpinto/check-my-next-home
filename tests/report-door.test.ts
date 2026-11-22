import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportDoorPage from "../components/ReportDoorPage";
import { SAMPLE_REPORT_PATH } from "../lib/home";
import { homeRoute } from "../lib/journey";
import { reportViewGate } from "../lib/report";
import {
  buildReportDoorView,
  buildReportWindowView,
  effectiveReportDoorState,
  REPORT_DOOR_WINDOW_STATE_LINE,
  REPORT_WINDOW_BUTTON_LABEL,
  REPORT_WINDOW_EMAIL_ERROR,
  REPORT_WINDOW_EMAIL_HELP,
  REPORT_WINDOW_EMAIL_LABEL,
  REPORT_WINDOW_EMAIL_PLACEHOLDER,
  type ReportDoorIdentity,
} from "../lib/report-door";
import {
  PAYMENT_EMAIL_ERROR,
  PAYMENT_EMAIL_HELP,
  PAYMENT_EMAIL_LABEL,
  PAYMENT_EMAIL_PLACEHOLDER,
} from "../lib/report-payment";
import { FLOOD_UPSELL_LEAD } from "../lib/results";
import { REPORT_DOOR_STATE, REPORT_PRICE_LABEL } from "../lib/site";

// M7.6 — the report door's holding page: the state seam
// (ruling R1), the pinned contents (ruling R5), the
// F4-softened flood wording, and the negative pins — no
// window wording on the holding surface, no email
// capture, no gift mention.
//
// M9.6 — the door lands on "paid" with fulfilment
// behind it, and the deferred free-window test arrives
// in its flag-forced unit form (the prep's gap 8,
// following M9.4's state-branch pattern): the window
// view's lines are pinned here against the builder —
// the free offer, £4.99 as the normal price, no gift
// wording — and the window surface renders only in its
// own state, exactly as the holding surface did in its.

const HOME: ReportDoorIdentity = {
  kind: "home",
  subject: "19 Birkdale Rise",
  subline: "Hatfield Peverel, CM3 2JT",
  postcode: "CM3 2JT",
  homeKey: "19||BIRKDALE RISE",
};

describe("report door — the state seam (R1)", () => {
  it("the door state is a checked-in constant and sits at paid (M9.6's landing)", () => {
    expect(REPORT_DOOR_STATE).toBe("paid");
  });

  it("the holding view never renders free-window wording (P5 negative pin, reworked at M9.6)", () => {
    // M7.6's pin guarded the live door: while the state
    // was "holding", no surface could speak of the
    // window. At "paid" the holding surface is simply
    // unrendered — and the pin keeps its edge on the
    // view itself: the holding form never carries
    // window wording in ANY state, because each state's
    // lines live on their own surface.
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

describe("report door — the free launch window's lines (M9.6; the deferred M7.6 test)", () => {
  it("offers the report free, with £4.99 standing as the normal price", () => {
    const view = buildReportWindowView(HOME);
    expect(view.stateLine).toBe(REPORT_DOOR_WINDOW_STATE_LINE);
    expect(view.stateLine).toContain("free during the launch window");
    expect(view.stateLine).toContain(`normal price is ${REPORT_PRICE_LABEL}`);
    expect(view.buttonLabel).toBe(REPORT_WINDOW_BUTTON_LABEL);
    expect(view.buttonLabel).toBe("Send my free report");
    // The window sells nothing and hides nothing: the
    // full contents list stands, as on every door state.
    expect(view.contents).toEqual(buildReportDoorView(HOME).contents);
  });

  it("never names the gift or Check Together — window deliveries issue no gift token", () => {
    for (const identity of [
      HOME,
      { kind: "postcode", postcode: "CM3 2JT", subline: null },
      { kind: "generic" },
    ] as ReportDoorIdentity[]) {
      const text = JSON.stringify(buildReportWindowView(identity)).toLowerCase();
      expect(text).not.toContain("check together");
      expect(text).not.toContain("gift");
    }
  });

  it("words its email block exactly as the payment page words its own", () => {
    expect(REPORT_WINDOW_EMAIL_LABEL).toBe(PAYMENT_EMAIL_LABEL);
    expect(REPORT_WINDOW_EMAIL_HELP).toBe(PAYMENT_EMAIL_HELP);
    expect(REPORT_WINDOW_EMAIL_PLACEHOLDER).toBe(PAYMENT_EMAIL_PLACEHOLDER);
    expect(REPORT_WINDOW_EMAIL_ERROR).toBe(PAYMENT_EMAIL_ERROR);
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

describe("report door — the nation hold (Road B, M9.6)", () => {
  // Founder ruling, 22 Nov 2026, superseding this step's
  // original R1: Scotland and Northern Ireland do NOT
  // flip with the door. Their homes render the holding
  // form — no payment, no free-window fulfilment — until
  // their own later milestone lands their data.
  const SCOTLAND_HOME: ReportDoorIdentity = {
    kind: "home",
    subject: "10 George Street",
    subline: "Edinburgh, EH2 2PF",
    postcode: "EH2 2PF",
    homeKey: "10||GEORGE STREET",
  };
  const NI_HOME: ReportDoorIdentity = {
    kind: "home",
    subject: "5 Donegall Square",
    subline: "Belfast, BT1 5GS",
    postcode: "BT1 5GS",
    homeKey: "5||DONEGALL SQUARE",
  };

  it("Scotland and Northern Ireland are served free (window) in every checked-in state — the BUG-106 interim-free door", () => {
    for (const nation of ["scotland", "northern-ireland"] as const) {
      expect(effectiveReportDoorState(nation, "paid")).toBe("window");
      expect(effectiveReportDoorState(nation, "window")).toBe("window");
      expect(effectiveReportDoorState(nation, "holding")).toBe("window");
      // The default is the checked-in state itself —
      // which stands at "paid" — and the free door wins.
      expect(effectiveReportDoorState(nation)).toBe("window");
    }
  });

  it("England, Wales and an unknown nation follow the state exactly", () => {
    for (const nation of ["england", "wales", "unknown"] as const) {
      expect(effectiveReportDoorState(nation, "paid")).toBe("paid");
      expect(effectiveReportDoorState(nation, "window")).toBe("window");
      expect(effectiveReportDoorState(nation, "holding")).toBe("holding");
      expect(effectiveReportDoorState(nation)).toBe(REPORT_DOOR_STATE);
    }
  });

  it("a Scottish home renders the holding form: no form, no input, no email, the holding state line", () => {
    const html = renderToStaticMarkup(
      createElement(ReportDoorPage, { view: buildReportDoorView(SCOTLAND_HOME) }),
    );
    expect(html).toContain("The detailed report for 10 George Street");
    expect(html).toContain("coming in the next stage");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("email");
    expect(html).not.toContain("launch window");
  });

  it("a Northern Ireland home renders the holding form the same way", () => {
    const html = renderToStaticMarkup(
      createElement(ReportDoorPage, { view: buildReportDoorView(NI_HOME) }),
    );
    expect(html).toContain("The detailed report for 5 Donegall Square");
    expect(html).toContain("coming in the next stage");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("email");
    expect(html).not.toContain("launch window");
  });

  it("the view gate follows the same effective state: a free nation's report serves (BUG-106 interim-free door)", () => {
    expect(reportViewGate("EH2 2PF", null, effectiveReportDoorState("scotland"))).toEqual({
      action: "serve",
    });
    expect(reportViewGate("BT1 5GS", null, effectiveReportDoorState("northern-ireland"))).toEqual({
      action: "serve",
    });
    expect(reportViewGate("CM3 2JT", null, effectiveReportDoorState("england"))).toEqual({
      action: "serve",
    });
  });
});
