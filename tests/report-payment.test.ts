import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportPaymentPage from "../components/ReportPaymentPage";
import type { ReportDoorIdentity } from "../lib/report-door";
import {
  buildReportPaymentView,
  liveStartedPayment,
  PAYMENT_CONSENT_LABEL,
  PAYMENT_EMAIL_ERROR,
  PAYMENT_EMAIL_HELP,
  PAYMENT_EMAIL_LABEL,
  PAYMENT_EMAIL_PLACEHOLDER,
  PAYMENT_HONESTY_PRICE_LINE,
  PAYMENT_REFUND_LINE,
  PAYMENT_TERMS_HREF,
  PAYMENT_TERMS_LINE,
  PAYMENT_TERMS_LINE_LEAD,
  PAYMENT_TERMS_LINK_LABEL,
  type StartedPayment,
} from "../lib/report-payment";
import { BUY_BAR_MYSTERY_EYEBROW, BUY_BAR_MYSTERY_LINE } from "../lib/results";
import { TERMS_CARDS } from "../lib/site-pages";

// M9.4/M9.5 — the payment page (Final Sample Master,
// Sample 9), proven in its forced state: the door stays
// "holding" until M9.6, so the paid view is built and
// rendered directly here, the M8.9 company block's
// pattern. The page's copy is the Master's; its card
// panel mounts the provider's element; M9.4's Check is
// pinned in its rendered half here — the email field
// and the consent tick-box (M9.5) are the ONLY inputs
// in our own DOM (the source half is
// tests/no-card-fields.test.ts). M9.5's Check is
// T-PAY-06, pinned below and in
// tests/payment-intent.test.ts.

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

  it("carries no M9.6 content: no success surface", () => {
    const view = buildReportPaymentView(HOME);
    const text = JSON.stringify(view).toLowerCase();
    expect(text).not.toContain("payment received");
  });
});

// T-PAY-06 — digital-content consent (plan step M9.5):
// cannot pay with the tick-box unticked; the tick +
// timestamp are recorded with the order. The page half
// is pinned here; the capture half — the consent rides
// into the payment's metadata and a consentless start
// is refused — is tests/payment-intent.test.ts and
// tests/payments.test.ts.
describe("payment page — the honest pre-payment screen (M9.5, T-PAY-06)", () => {
  it("carries the honesty area in its Option A form: the one line verbatim with its Terms link, the price restated, the refund line", () => {
    const view = buildReportPaymentView(HOME);
    expect(view.termsLineLead).toBe(PAYMENT_TERMS_LINE_LEAD);
    expect(PAYMENT_TERMS_LINE_LEAD).toBe(
      "The report is information from official sources — not advice. By paying, you agree to our ",
    );
    expect(view.termsLinkLabel).toBe(PAYMENT_TERMS_LINK_LABEL);
    expect(PAYMENT_TERMS_LINK_LABEL).toBe("Terms of service");
    expect(view.termsHref).toBe(PAYMENT_TERMS_HREF);
    expect(PAYMENT_TERMS_HREF).toBe("/terms");
    // The composed line: lead, link label, full stop.
    expect(PAYMENT_TERMS_LINE).toBe(
      "The report is information from official sources — not advice. By paying, you agree to our Terms of service.",
    );
    expect(view.honestyPriceLine).toBe(PAYMENT_HONESTY_PRICE_LINE);
    expect(PAYMENT_HONESTY_PRICE_LINE).toBe(
      "£4.99 — one payment, no subscription, nothing further to pay.",
    );
    expect(view.refundLine).toBe(PAYMENT_REFUND_LINE);
    expect(PAYMENT_REFUND_LINE).toBe(
      "If we cannot deliver your report, we refund the £4.99 in full, to the card you paid with — you do not need to ask.",
    );
  });

  it("no longer carries the as-built M9.5 block: no 'What the report is not' heading, none of the four not-lines", () => {
    // The Option A ruling (22 Nov 2026) retired the
    // heading and the not-lines from the page's copy —
    // in the view and in the rendered page alike. (The
    // Terms page keeps its own "What the report is
    // not" card; that is lib/site-pages.ts, not this
    // page, and is pinned by tests/terms.test.ts.)
    const view = buildReportPaymentView(HOME);
    const text = JSON.stringify(view);
    const html = renderPaid();
    const retired = [
      "What the report is not",
      "The report is information, not advice — official data as published, with its source and date.",
      "We do not score, rate or recommend homes or areas, and we do not interpret the data for you.",
      "It is not a survey, not a valuation, and not a substitute for your solicitor's searches and enquiries.",
      "It does not tell you whether to buy a home — that judgement is yours.",
    ];
    for (const line of retired) {
      expect(text).not.toContain(line);
      // React's server renderer escapes apostrophes in
      // text (&#x27;) — assert in the rendered form.
      expect(html).not.toContain(line.replaceAll("'", "&#x27;"));
    }
  });

  it("the refund line is the Terms page's own sentence — the two copies can never drift", () => {
    const termsText = TERMS_CARDS.flatMap((card) => card.blocks)
      .map((block) => (block.kind === "p" ? block.text : block.items.join("\n")))
      .join("\n");
    expect(termsText).toContain(PAYMENT_REFUND_LINE);
  });

  it("carries the tick-box label verbatim from the plan, and never names the gift", () => {
    const view = buildReportPaymentView(HOME);
    expect(view.consentLabel).toBe(PAYMENT_CONSENT_LABEL);
    expect(PAYMENT_CONSENT_LABEL).toBe(
      "Make my report now — I understand I lose the 14-day change-of-mind right once it is delivered.",
    );
    // D21: the gift is a surprise until the delivery
    // email — no honest-screen content may name it.
    const text = JSON.stringify(view).toLowerCase();
    expect(text).not.toContain("gift");
  });

  it("renders the honesty area and tick above the email block, in the ruling's reading order", () => {
    const html = renderPaid();
    const lineAt = html.indexOf(PAYMENT_TERMS_LINE_LEAD);
    const priceAt = html.indexOf(PAYMENT_HONESTY_PRICE_LINE);
    const refundAt = html.indexOf(PAYMENT_REFUND_LINE);
    const tickAt = html.indexOf(PAYMENT_CONSENT_LABEL);
    const emailAt = html.indexOf("Email address for delivery");
    const teaseAt = html.indexOf(BUY_BAR_MYSTERY_LINE);
    expect(lineAt).toBeGreaterThan(-1);
    expect(priceAt).toBeGreaterThan(lineAt);
    expect(refundAt).toBeGreaterThan(priceAt);
    expect(tickAt).toBeGreaterThan(refundAt);
    expect(emailAt).toBeGreaterThan(tickAt);
    expect(teaseAt).toBeGreaterThan(emailAt);
    // The line's Terms link is real: the label stands
    // inside an anchor on /terms, the full stop after
    // it — the composed line, exactly as ruled.
    expect(html).toContain(`<a href="${PAYMENT_TERMS_HREF}">${PAYMENT_TERMS_LINK_LABEL}</a>.`);
  });

  it("renders the tick-box unticked, and the start button disabled while it stands unticked", () => {
    const html = renderPaid();
    const box = html.match(/<input[^>]*id="payment-consent"[^>]*>/);
    expect(box).not.toBeNull();
    expect(box?.[0]).toContain('type="checkbox"');
    expect(box?.[0]).not.toContain("checked");
    // Unticked = cannot pay: the only Pay button the
    // pre-payment state renders stands disabled.
    const startButton = html.match(/<button[^>]*class="btn btn--brass report-payment__pay"[^>]*>/);
    expect(startButton).not.toBeNull();
    expect(startButton?.[0]).toContain("disabled");
  });

  it("a started payment lives only while its email and its consent still stand", () => {
    const started: StartedPayment = {
      clientSecret: "pi_1_secret_x",
      email: "buyer@example.co.uk",
      consentAt: "2026-11-22T00:40:00.000Z",
    };
    const standing = { emailValid: true, email: "buyer@example.co.uk" };
    expect(liveStartedPayment(started, { ...standing, consentAt: started.consentAt })).toBe(
      started,
    );
    // Unticked: the payment is retired — nothing
    // confirmable stands.
    expect(liveStartedPayment(started, { ...standing, consentAt: null })).toBeNull();
    // Re-ticked: a new consent, a new moment — the old
    // payment was created under a consent that no
    // longer stands.
    expect(
      liveStartedPayment(started, { ...standing, consentAt: "2026-11-22T00:41:00.000Z" }),
    ).toBeNull();
    // Email edited after ticking: the old payment is
    // retired; the replacement is created from the
    // consent as it stands.
    expect(
      liveStartedPayment(started, {
        emailValid: true,
        email: "other@example.co.uk",
        consentAt: started.consentAt,
      }),
    ).toBeNull();
    // A misshapen email retires it too, and nothing
    // started is nothing live.
    expect(
      liveStartedPayment(started, {
        emailValid: false,
        email: "buyer@example.co.uk",
        consentAt: started.consentAt,
      }),
    ).toBeNull();
    expect(liveStartedPayment(null, { ...standing, consentAt: started.consentAt })).toBeNull();
  });
});

describe("payment page — the rendered page (the step's Check, rendered half)", () => {
  it("renders the page's structure: heading, lede, contents, honesty area, email block, tease, card panel, Pay button", () => {
    const html = renderPaid();
    expect(html).toContain("The detailed report for 19 Birkdale Rise");
    expect(html).toContain("Hatfield Peverel, CM3 2JT");
    expect(html).toContain("What the detailed report adds");
    expect(html).toContain("<strong>The breakdowns behind every headline</strong>");
    expect(html).toContain(
      "<strong>The flood findings in full</strong>, with a location map for each check",
    );
    expect(html).toContain(PAYMENT_TERMS_LINE_LEAD);
    expect(html).toContain(`<a href="${PAYMENT_TERMS_HREF}">${PAYMENT_TERMS_LINK_LABEL}</a>.`);
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

  it("the email field and the consent tick-box are the ONLY inputs in our own DOM — the card element is a mount point, not fields", () => {
    const html = renderPaid();
    const inputs = html.match(/<input/g) ?? [];
    expect(inputs).toHaveLength(2);
    expect(html).toContain('id="payment-email"');
    expect(html).toContain('name="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('id="payment-consent"');
    expect(html).toContain('name="consent"');
    expect(html).toContain('type="checkbox"');
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
