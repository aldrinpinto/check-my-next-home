import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportSuccessPage from "../components/ReportSuccessPage";
import type { ReportDoorIdentity } from "../lib/report-door";
import {
  buildReportSuccessView,
  GIFT_APPLIED_BANNER_LINE,
  SUCCESS_BADGE_PAID,
  SUCCESS_MYSTERY_LINE,
  SUCCESS_SECTIONS_LINE,
} from "../lib/report-success";

// M9.6 — the success surface (Final Sample Master,
// Sample 10): the view the page renders, per order kind
// and fulfilment state, and the surface's viewing-only
// discipline as a rendered fact (named test (k)).

const HOME: ReportDoorIdentity = {
  kind: "home",
  subject: "19 Birkdale Rise",
  subline: "Hatfield Peverel, CM3 2JT",
  postcode: "CM3 2JT",
  homeKey: "19||BIRKDALE RISE",
};
const EMAIL = "buyer@example.co.uk";

// React's static renderer escapes apostrophes in text
// (&#x27;); the rendered assertions read the unescaped
// form, so they judge the words a browser shows (the
// download-page tests' pattern).
const text = (html: string) =>
  html.replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");

describe("buildReportSuccessView", () => {
  it("a ready PAID view carries the badge, the mystery extra and the ten-section line", () => {
    const view = buildReportSuccessView({
      state: "ready",
      kind: "paid",
      identity: HOME,
      email: EMAIL,
    });
    expect(view.badge).toBe(SUCCESS_BADGE_PAID);
    expect(view.heading).toBe("Your report is ready");
    expect(view.mysteryLine).toBe(SUCCESS_MYSTERY_LINE);
    expect(view.giftBannerLine).toBeNull();
    expect(view.sectionsLine).toBe(SUCCESS_SECTIONS_LINE);
    expect(view.sectionsLine).toContain("All ten sections are ready");
    expect(view.viewHref).toBe("/report/view?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE");
    expect(view.emailLead).toContain("We've sent");
  });

  it("the mystery extra is PAID-only: gifted and free views never carry it", () => {
    for (const kind of ["gifted", "free"] as const) {
      const view = buildReportSuccessView({ state: "ready", kind, identity: HOME, email: EMAIL });
      expect(view.mysteryEyebrow).toBeNull();
      expect(view.mysteryLine).toBeNull();
      expect(view.badge).toBeNull();
    }
  });

  it("a GIFTED view carries the gift-applied banner — and no other kind does", () => {
    const gifted = buildReportSuccessView({
      state: "ready",
      kind: "gifted",
      identity: HOME,
      email: EMAIL,
    });
    expect(gifted.giftBannerLine).toBe(GIFT_APPLIED_BANNER_LINE);
    for (const kind of ["paid", "free"] as const) {
      expect(
        buildReportSuccessView({ state: "ready", kind, identity: HOME, email: EMAIL })
          .giftBannerLine,
      ).toBeNull();
    }
  });

  it("a PREPARING view has no report card and no view link — the state is read from fulfilment", () => {
    const view = buildReportSuccessView({
      state: "preparing",
      kind: "paid",
      identity: HOME,
      email: EMAIL,
    });
    expect(view.heading).toBe("Your report is being prepared");
    expect(view.sectionsLine).toBeNull();
    expect(view.viewHref).toBeNull();
    expect(view.emailLead).toContain("We'll send");
  });
});

describe("the success surface — viewing only (named test (k))", () => {
  it("renders no download affordance and no share affordance, in either state", () => {
    for (const state of ["ready", "preparing"] as const) {
      const html = text(
        renderToStaticMarkup(
          createElement(ReportSuccessPage, {
            view: buildReportSuccessView({ state, kind: "paid", identity: HOME, email: EMAIL }),
          }),
        ),
      );
      // No link or control reaches the download route or
      // carries a download attribute, and nothing offers
      // to share. (The email card's own words name the
      // download LINK the email carries — Sample 10's
      // copy, not an affordance on this surface.)
      expect(html).not.toContain("/report/download");
      expect(html).not.toContain("download=");
      expect(html).not.toContain("Share");
      expect(html).not.toContain("navigator.share");
    }
  });

  it("the ready surface's one report action is the viewing link", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(ReportSuccessPage, {
          view: buildReportSuccessView({
            state: "ready",
            kind: "paid",
            identity: HOME,
            email: EMAIL,
          }),
        }),
      ),
    );
    expect(html).toContain("View your report");
    expect(html).toContain("/report/view?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE");
    expect(html).toContain("Payment received — thank you");
    expect(html).toContain(SUCCESS_MYSTERY_LINE);
  });

  it("the gifted surface shows the banner and never the mystery extra", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(ReportSuccessPage, {
          view: buildReportSuccessView({
            state: "ready",
            kind: "gifted",
            identity: HOME,
            email: EMAIL,
          }),
        }),
      ),
    );
    expect(html).toContain(GIFT_APPLIED_BANNER_LINE);
    expect(html).not.toContain(SUCCESS_MYSTERY_LINE);
    expect(html).not.toContain("Payment received");
  });
});
