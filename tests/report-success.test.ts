import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportSuccessPage from "../components/ReportSuccessPage";
import { PAYMENT_REFUND_LINE } from "../lib/report-payment";
import type { ReportDoorIdentity } from "../lib/report-door";
import {
  buildReportSuccessView,
  GIFT_APPLIED_BANNER_LINE,
  SUCCESS_BADGE_PAID,
  SUCCESS_EMAIL_HEADING_UNSENT,
  SUCCESS_FAILED_FACT,
  SUCCESS_FAILED_FACT_PAID,
  SUCCESS_FAILED_GIFT_LINE,
  SUCCESS_FAILED_RETRY_LINE,
  SUCCESS_HEADING_FAILED,
  SUCCESS_MYSTERY_LINE,
  SUCCESS_RESEND_LABEL,
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

describe("buildReportSuccessView — the failed state and the email truth (M9.7)", () => {
  it("a FAILED paid view states the plain fact and carries the Terms refund sentence, verbatim", () => {
    const view = buildReportSuccessView({
      state: "failed",
      kind: "paid",
      identity: HOME,
      email: EMAIL,
    });
    expect(view.heading).toBe(SUCCESS_HEADING_FAILED);
    expect(view.lede).toBe(SUCCESS_FAILED_FACT_PAID);
    // The refund words are the Terms page's own
    // sentence — the constant the payment page also
    // carries, pinned equal to the Terms text in
    // tests/report-payment.test.ts — and nothing
    // stronger: the mechanics are M9.8's.
    expect(view.refundLine).toBe(PAYMENT_REFUND_LINE);
    // No email card, no report card, no mystery strip,
    // no re-send: nothing is coming, and the surface
    // does not pretend otherwise. The state is not
    // "preparing", so the page's auto-reload — mounted
    // only in that state — does not run.
    expect(view.emailHeading).toBeNull();
    expect(view.emailLead).toBeNull();
    expect(view.emailTail).toBeNull();
    expect(view.sectionsLine).toBeNull();
    expect(view.viewHref).toBeNull();
    expect(view.mysteryLine).toBeNull();
    expect(view.resendRef).toBeNull();
    expect(view.state).toBe("failed");
  });

  it("a FAILED gifted view carries the unconsumed-gift line and no money words", () => {
    const view = buildReportSuccessView({
      state: "failed",
      kind: "gifted",
      identity: HOME,
      email: EMAIL,
    });
    expect(view.heading).toBe(SUCCESS_HEADING_FAILED);
    expect(view.lede).toBe(SUCCESS_FAILED_FACT);
    expect(view.lede).not.toContain("£");
    expect(view.refundLine).toBeNull();
    expect(view.failedGiftLine).toBe(SUCCESS_FAILED_GIFT_LINE);
    expect(view.failedRetryLine).toBeNull();
    expect(view.giftBannerLine).toBeNull();
  });

  it("a FAILED free view carries the road back and no money words", () => {
    const view = buildReportSuccessView({
      state: "failed",
      kind: "free",
      identity: HOME,
      email: EMAIL,
    });
    expect(view.lede).toBe(SUCCESS_FAILED_FACT);
    expect(view.refundLine).toBeNull();
    expect(view.failedGiftLine).toBeNull();
    expect(view.failedRetryLine).toBe(SUCCESS_FAILED_RETRY_LINE);
  });

  it("a READY view whose delivery email did not send stops claiming it did — and offers the re-send", () => {
    const view = buildReportSuccessView({
      state: "ready",
      kind: "paid",
      identity: HOME,
      email: EMAIL,
      mailSent: false,
      orderRef: "pi_1",
    });
    expect(view.emailHeading).toBe(SUCCESS_EMAIL_HEADING_UNSENT);
    expect(view.emailLead).not.toContain("We've sent");
    expect(view.emailTail).toContain("didn't go out");
    expect(view.resendRef).toBe("pi_1");
    expect(view.resendLabel).toBe(SUCCESS_RESEND_LABEL);
    // The report itself is unaffected: ready is ready.
    expect(view.sectionsLine).toBe(SUCCESS_SECTIONS_LINE);
    expect(view.viewHref).not.toBeNull();
  });

  it("a READY view with the email sent keeps the sample's words; the re-send still stands", () => {
    const view = buildReportSuccessView({
      state: "ready",
      kind: "paid",
      identity: HOME,
      email: EMAIL,
      mailSent: true,
      orderRef: "pi_1",
    });
    expect(view.emailLead).toContain("We've sent");
    expect(view.resendRef).toBe("pi_1");
  });

  it("the failed surface renders its lines — and no email card", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(ReportSuccessPage, {
          view: buildReportSuccessView({
            state: "failed",
            kind: "paid",
            identity: HOME,
            email: EMAIL,
          }),
        }),
      ),
    );
    expect(html).toContain(SUCCESS_HEADING_FAILED);
    expect(html).toContain("19 Birkdale Rise");
    expect(html).toContain(SUCCESS_FAILED_FACT_PAID);
    expect(html).toContain(PAYMENT_REFUND_LINE);
    expect(html).not.toContain("Your report by email");
    expect(html).not.toContain("We've sent");
  });
});

describe("the success surface — viewing only (named test (k))", () => {
  it("renders no download affordance and no share affordance, in any state", () => {
    for (const state of ["ready", "preparing", "failed"] as const) {
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
    // BUG-271: the report opens in a new tab, with the
    // small hint under the button so it is never a
    // surprise. Same button, same copy, same destination.
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain("Opens in a new tab.");
    expect(html).toContain("Payment received — thank you");
    expect(html).toContain(SUCCESS_MYSTERY_LINE);
  });

  it("the preparing surface still carries the check-another-home box (BUG-216)", () => {
    // The refresher's beat runs in this state, so the
    // box must be present here — and stay usable across
    // the beat (the e2e spec pins the staying-usable
    // half against the served app).
    const html = text(
      renderToStaticMarkup(
        createElement(ReportSuccessPage, {
          view: buildReportSuccessView({
            state: "preparing",
            kind: "paid",
            identity: HOME,
            email: EMAIL,
          }),
        }),
      ),
    );
    expect(html).toContain("Check another home");
    expect(html).toContain('id="postcode"');
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
