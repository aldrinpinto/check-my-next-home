import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TermsPage from "../app/terms/page";
import { REPORT_DISCLAIMER_D9 } from "../lib/report";
import { PAGE_SEO } from "../lib/seo";
import { TERMS_CARDS, TERMS_D9_WORDING } from "../lib/site-pages";

// M9.4 — the Terms of service page: the words the site
// must carry before the first paid report is sold (the
// 18 Nov 2026 adoption). The page is the full-wording
// home of the D9 standing disclaimer, pinned here
// against the report's own copy so the two homes can
// never drift; the purchase, delivery and refund words
// are the adoption's, pinned by their load-bearing
// sentences. The founder approves the exact words
// before the push — these pins are the build's draft,
// and his approval is what settles them.

describe("terms of service — the D9 wording's second home", () => {
  it("carries D9's full standing wording verbatim, identical to the report's copy", () => {
    expect(TERMS_D9_WORDING).toBe(REPORT_DISCLAIMER_D9);
    expect(TERMS_D9_WORDING).toContain(
      "We present official data as it is published, with its source and date.",
    );
    expect(TERMS_D9_WORDING).toContain("We do not score, rate or recommend homes or areas");
  });
});

describe("terms of service — the page", () => {
  // React escapes apostrophes in static markup; the
  // assertions read the page's words, so the escape is
  // folded back before they run.
  const html = renderToStaticMarkup(createElement(TermsPage)).replaceAll("&#x27;", "'");

  it("renders the six cards of the adopted outline", () => {
    expect(html).toContain("Terms of service");
    expect(html).toContain("This version: 22 November 2026");
    expect(TERMS_CARDS.map((card) => card.heading)).toEqual([
      "What the report is",
      "What the report is not",
      "Buying a report",
      "The Check Together gift",
      "Refunds",
      "Changes to these terms",
    ]);
    for (const heading of TERMS_CARDS.map((card) => card.heading)) {
      expect(html).toContain(heading);
    }
  });

  it("states the purchase and delivery terms: one payment, email delivery, the seven-day link, no website storage", () => {
    expect(html).toContain("£4.99");
    expect(html).toContain("one payment");
    expect(html).toContain("Delivery is by email.");
    expect(html).toContain("The link works for seven days");
    expect(html).toContain("a fresh link can be sent to the same email address, free");
    expect(html).toContain("the report itself does not expire");
    expect(html).toContain("Reports are not stored on the website");
    expect(html).toContain("there is no account to sign in to");
    expect(html).toContain("we never see or store them");
  });

  it("states the refund rules the adoption fixed: failure refunds in full, a refund voids the gift, a redeemed gift stands", () => {
    expect(html).toContain("If we cannot deliver your report, we refund the £4.99 in full");
    expect(html).toContain("A refund voids the report's gift.");
    expect(html).toContain("If the gift has not been claimed, it stops working.");
    expect(html).toContain(
      "If it has been claimed but the gifted report has not been used, the gifted report is withdrawn.",
    );
    expect(html).toContain("A gift that has already been redeemed");
    expect(html).toContain("stands, and is not affected by the refund");
  });

  it("states the gift's own shape: one free report, 30 days, a different email, none of its own", () => {
    expect(html).toContain("one detailed report of their own, free");
    expect(html).toContain("within 30 days");
    expect(html).toContain("an email address different from the buyer's");
    expect(html).toContain("carries no gift of its own");
  });

  it("has its locked SEO pair, figure-free like every pair (D38)", () => {
    expect(PAGE_SEO["/terms"].title).toBe("Terms of service | Check My Next Home");
    expect(PAGE_SEO["/terms"].description).not.toMatch(/[0-9£]/);
  });
});
