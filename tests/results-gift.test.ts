import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ResultsPage from "../components/ResultsPage";
import {
  BUY_BAR_BUTTON_LABEL,
  BUY_BAR_HEADING,
  BUY_BAR_LINE,
  BUY_BAR_MYSTERY_LINE,
  BUY_BAR_ONE_PAYMENT_LINE,
  GIFT_FREE_LABEL,
  GIFT_PILL_LABEL,
  GIFT_REPORT_BUTTON_LABEL,
  GIFT_STRIP_LINE,
  type ResultsView,
} from "../lib/results";
import { REPORT_PRICE_LABEL } from "../lib/site";

// BUG-223 — the free page's gift state (approved Screen
// B, DRAFT lines 2–5, verbatim), proven on a minimal
// home view: one pills strip, one places group with a
// truncation row, one upsell row, and the buy bar. The
// gift state is a component prop (giftHeld), set by the
// route from the visit's claimed gift — the view model
// itself carries no gift, so the district and
// not-covered views (no buy prompts) can never show it.

const REPORT_HREF = "/report?postcode=CM3%202JT&home=19%7C%7CBIRKDALE%20RISE";

const VIEW: ResultsView = {
  pills: [{ label: "Schools", figure: "0.3 mi", band: "green" }],
  reportHref: REPORT_HREF,
  buyBar: {
    heading: BUY_BAR_HEADING,
    line: BUY_BAR_LINE,
    mysteryLine: BUY_BAR_MYSTERY_LINE,
    href: REPORT_HREF,
    // BUG-336: the priced button label and the
    // one-payment line ride the shape; the gift render
    // keeps its own button words and shows no payment
    // line (a gift holder pays nothing).
    buttonLabel: BUY_BAR_BUTTON_LABEL,
    onePaymentLine: BUY_BAR_ONE_PAYMENT_LINE,
  },
  calculators: null,
  checkLinks: [],
  warningsStrip: { kind: "none" },
  floodWarningsState: null,
  tabs: [
    {
      id: "family",
      label: "Family Checks",
      sections: [
        {
          key: "schools",
          heading: "Schools & nurseries",
          blocks: [
            {
              type: "places",
              group: {
                key: "primary",
                heading: "Primary schools",
                rows: [
                  {
                    name: "Ingatestone Infant School",
                    milesText: "0.3 mi",
                    band: "green",
                    detail: "Ages 4–7 · Fryerning Lane, Ingatestone",
                  },
                ],
                line: null,
                truncation: {
                  n: 2,
                  total: 4,
                  lead: "Plus 2 more primary schools",
                  detail: "All 4, with their Ofsted ratings and inspection dates.",
                  href: REPORT_HREF,
                },
                grammar: null,
                grammarSchools: [],
                grammarCountLine: null,
              },
            },
            { type: "upsell", lead: "Plus the fuller sold history", detail: null },
          ],
          sourceLine: null,
        },
      ],
    },
  ],
};

function render(giftHeld: boolean): string {
  return renderToStaticMarkup(createElement(ResultsPage, { view: VIEW, giftHeld }));
}

describe("free page — the gift state (BUG-223, approved Screen B)", () => {
  it("a gift holder sees no £4.99 anywhere: strip, free chip, free buy-bar button", () => {
    const html = render(true);
    // The server renderer escapes the apostrophe.
    expect(html).toContain(GIFT_STRIP_LINE.replaceAll("'", "&#x27;"));
    expect(html).toContain("results-gift-strip");
    expect(html).toContain(GIFT_FREE_LABEL);
    expect(html).toContain(GIFT_REPORT_BUTTON_LABEL);
    expect(html).toContain("Get my free report");
    expect(html).toContain("Plus 2 more primary schools");
    expect(html).toContain("Get the full report →");
    expect(html).not.toContain(REPORT_PRICE_LABEL);
    expect(html).not.toContain("£4.99");
    expect(html).not.toContain("Get the full report —");
  });

  it("the header pill is its own label (BUG-271): it is not the trunc-row price chip", () => {
    // The free-page header pill — the chip beside the
    // Shortlist button, rendered by the page, not this
    // component — reads "Your full report is free"
    // (founder's copy choice, 25 Nov 2026). The trunc
    // rows' price chip keeps GIFT_FREE_LABEL, pinned
    // above; the two labels are deliberately different
    // strings so one cannot drift into the other.
    expect(GIFT_PILL_LABEL).toBe("Your full report is free");
    expect(GIFT_PILL_LABEL).not.toBe(GIFT_FREE_LABEL);
  });

  it("without a gift the page is the ordinary £4.99 page: no strip, priced chip, priced buy-bar button (BUG-336)", () => {
    const html = render(false);
    expect(html).not.toContain("results-gift-strip");
    expect(html).not.toContain(GIFT_FREE_LABEL);
    expect(html).not.toContain(GIFT_REPORT_BUTTON_LABEL);
    expect(html).toContain(REPORT_PRICE_LABEL);
    expect(html).toContain("Plus 2 more primary schools");
    expect(html).toContain("Get the full report →");
    // BUG-336 supersedes the old unpriced buy-bar
    // button: the button carries the price, with the
    // one-payment line beneath it.
    expect(html).toContain(">Get the full report — £4.99</a>");
    expect(html).toContain("One payment, no subscription, nothing further to pay.");
  });

  it("the gift state is one home's (BUG-224): the same render without the gift is the £4.99 page", () => {
    // The route resolves the gift per request from the
    // live stores; once a gifted order stands for the
    // token the reader answers nothing and the route
    // passes giftHeld false — so the next home renders
    // exactly the ordinary page above, with no gift
    // state leaking across by session or navigation.
    // (The server renderer escapes the strip's
    // apostrophe.)
    expect(render(true)).toContain(GIFT_STRIP_LINE.replaceAll("'", "&#x27;"));
    expect(render(false)).not.toContain("results-gift-strip");
    expect(render(false)).toContain(REPORT_PRICE_LABEL);
  });

  it("the free page closes with the check-another box (founder addition, 25 Nov 2026)", () => {
    const html = render(false);
    expect(html).toContain("Done with this home? Check another one");
    expect(html).toContain("report-check-again");
  });
});
