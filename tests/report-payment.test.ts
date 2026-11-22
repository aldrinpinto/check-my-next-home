import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportPaymentPage from "../components/ReportPaymentPage";
import type { ReportDoorIdentity } from "../lib/report-door";
import {
  buildReportPaymentView,
  PAYMENT_EMAIL_ERROR,
  PAYMENT_EMAIL_HELP,
  PAYMENT_EMAIL_LABEL,
  PAYMENT_EMAIL_PLACEHOLDER,
} from "../lib/report-payment";
import { BUY_BAR_MYSTERY_EYEBROW, BUY_BAR_MYSTERY_LINE } from "../lib/results";

// M9.4 — the payment page (Final Sample Master, Sample
// 9), proven in its forced state: the door stays
// "holding" until M9.6, so the paid view is built and
// rendered directly here, the M8.9 company block's
// pattern. The page's copy is the Master's; its card
// panel mounts the provider's element; and the step's
// Check is pinned in its rendered half here — the email
// field is the ONLY input in our own DOM (the source
// half is tests/no-card-fields.test.ts).

const HOME: ReportDoorIdentity = {
  kind: "home",
  subject: "19 Birkdale Rise",
  subline: "Hatfield Peverel, CM3 2JT",
  postcode: "CM3 2JT",
  homeKey: "19||BIRKDALE RISE",
};

function renderPaid(identity: ReportDoorIdentity = HOME): string {
  return renderToStaticMarkup(
    createElement(ReportPaymentPage, {
      view: buildReportPaymentView(identity),
      publishableKey: "pk_test_throwaway",
      postcode: identity.kind === "generic" ? null : identity.postcode,
      homeKey: identity.kind === "home" ? identity.homeKey : null,
    }),
  );
}

describe("payment page — the view (Sample 9)", () => {
  it("names the home the way the sample does: street once in the heading, area beneath", () => {
    const view = buildReportPaymentView(HOME);
    expect(view.heading).toBe("The detailed report for 19 Birkdale Rise");
    expect(view.subline).toBe("Hatfield Peverel, CM3 2JT");
    expect(view.lede).toBe(
      "You've seen the headlines for this home, free. The detailed report goes through every one of them properly.",
    );
  });

  it("carries the Master's contents list verbatim, bold leads and the flood line's plain tail", () => {
    const view = buildReportPaymentView(HOME);
    expect(view.contentsHeading).toBe("What the detailed report adds");
    expect(view.contents).toEqual([
      { lead: "The breakdowns behind every headline", rest: null },
      { lead: "The flood findings in full", rest: ", with a location map for each check" },
      { lead: "The fuller EPC detail", rest: null },
      { lead: "Questions to ask the seller", rest: null },
      { lead: "One dated, print-ready document", rest: null },
    ]);
    expect(view.priceLine).toBe("One payment. No subscription, nothing further to pay.");
    expect(view.payLabel).toBe("Pay £4.99");
  });

  it("carries Sample 9's email block verbatim — label, help, placeholder, error", () => {
    const view = buildReportPaymentView(HOME);
    expect(view.emailLabel).toBe(PAYMENT_EMAIL_LABEL);
    expect(PAYMENT_EMAIL_LABEL).toBe("Email address for delivery");
    expect(view.emailHelp).toBe(PAYMENT_EMAIL_HELP);
    expect(PAYMENT_EMAIL_HELP).toBe(
      "Your report is delivered by email — there are no accounts and no passwords to remember.",
    );
    expect(view.emailPlaceholder).toBe(PAYMENT_EMAIL_PLACEHOLDER);
    expect(PAYMENT_EMAIL_PLACEHOLDER).toBe("you@example.co.uk");
    expect(view.emailError).toBe(PAYMENT_EMAIL_ERROR);
    expect(PAYMENT_EMAIL_ERROR).toBe(
      "That email address doesn't look quite right — check it and try again, so your report reaches you.",
    );
  });

  it("carries the mystery tease from its one shared source, and the sample's closing line", () => {
    const view = buildReportPaymentView(HOME);
    expect(view.teaseEyebrow).toBe(BUY_BAR_MYSTERY_EYEBROW);
    expect(view.teaseLine).toBe(BUY_BAR_MYSTERY_LINE);
    expect(view.cardTitle).toBe("Card payment");
    expect(view.closingLine).toBe(
      "Payment is handled securely by Stripe, and we never see your card details.",
    );
  });

  it("names a postcode-only arrival by its postcode, and a generic arrival by neither", () => {
    const postcode = buildReportPaymentView({
      kind: "postcode",
      postcode: "CM3 2JT",
      subline: null,
    });
    expect(postcode.heading).toBe("The detailed report for CM3 2JT");
    const generic = buildReportPaymentView({ kind: "generic" });
    expect(generic.heading).toBe("The detailed report");
    expect(generic.subline).toBeNull();
  });

  it("carries no M9.5 or M9.6 content: no tick-box, no consent, no success surface", () => {
    const view = buildReportPaymentView(HOME);
    const text = JSON.stringify(view).toLowerCase();
    expect(text).not.toContain("tick");
    expect(text).not.toContain("consent");
    expect(text).not.toContain("i agree");
    expect(text).not.toContain("payment received");
  });
});

describe("payment page — the rendered page (the step's Check, rendered half)", () => {
  it("renders Sample 9's structure: heading, lede, contents, email block, tease, card panel, Pay button", () => {
    const html = renderPaid();
    expect(html).toContain("The detailed report for 19 Birkdale Rise");
    expect(html).toContain("Hatfield Peverel, CM3 2JT");
    expect(html).toContain("What the detailed report adds");
    expect(html).toContain("<strong>The breakdowns behind every headline</strong>");
    expect(html).toContain(
      "<strong>The flood findings in full</strong>, with a location map for each check",
    );
    expect(html).toContain("Email address for delivery");
    expect(html).toContain("Required");
    expect(html).toContain(PAYMENT_EMAIL_HELP);
    expect(html).toContain(BUY_BAR_MYSTERY_LINE);
    expect(html).toContain("Card payment");
    expect(html).toContain("Powered by");
    expect(html).toContain("Pay £4.99");
    expect(html).toContain(
      "Payment is handled securely by Stripe, and we never see your card details.",
    );
  });

  it("the email field is the ONLY input in our own DOM — the card element is a mount point, not fields", () => {
    const html = renderPaid();
    const inputs = html.match(/<input/g) ?? [];
    expect(inputs).toHaveLength(1);
    expect(html).toContain('id="payment-email"');
    expect(html).toContain('name="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain('autoComplete="email"');
    // The provider's element mounts here; its card
    // fields live inside its own cross-origin iframes,
    // never in this markup.
    expect(html).toContain("data-payment-element-mount");
    expect(html).not.toContain("cc-number");
    expect(html).not.toContain("cc-exp");
    expect(html).not.toContain("cc-csc");
    expect(html).not.toContain("cardNumber");
  });

  it("renders no form around the email before a payment starts — the confirm form is the element's own", () => {
    // The pre-payment state carries the email block and
    // the start button only; the <form> that confirms a
    // payment renders inside the provider's Elements
    // tree once a payment exists, never around fields
    // of ours.
    const html = renderPaid();
    expect(html).not.toContain("<form");
  });
});
