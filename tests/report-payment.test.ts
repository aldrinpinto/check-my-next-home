import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportPaymentPage from "../components/ReportPaymentPage";
import type { ReportDoorIdentity } from "../lib/report-door";
import * as reportPayment from "../lib/report-payment";
import {
  buildReportPaymentView,
  liveStartedPayment,
  paymentElementKey,
  PAYMENT_CLOSING_LINE,
  PAYMENT_CONSENT_ERROR_LINE,
  PAYMENT_CONSENT_LABEL,
  PAYMENT_CONSENT_TAIL,
  PAYMENT_EMAIL_ERROR,
  PAYMENT_EMAIL_HELP,
  PAYMENT_EMAIL_LABEL,
  PAYMENT_EMAIL_PLACEHOLDER,
  PAYMENT_GIFT_LINE,
  PAYMENT_GIFT_TERMS_LINE_LEAD,
  PAYMENT_ONE_PAYMENT_LINE,
  PAYMENT_REFUND_LINE,
  PAYMENT_TERMS_HREF,
  PAYMENT_TERMS_LINE,
  PAYMENT_TERMS_LINE_LEAD,
  PAYMENT_TERMS_LINK_LABEL,
  type StartedPayment,
} from "../lib/report-payment";
import { GIFT_APPLIED_BANNER_LINE } from "../lib/report-success";
import {
  BUY_BAR_MYSTERY_EYEBROW,
  BUY_BAR_MYSTERY_LINE,
  GIFT_REPORT_BUTTON_LABEL,
} from "../lib/results";
import { TERMS_CARDS } from "../lib/site-pages";
import { GIFT_FRIEND } from "./fixtures/gift";

// M9.4/M9.5 — the payment page (Final Sample Master,
// Sample 9), proven in its forced state: built and
// rendered directly here, the M8.9 company block's
// pattern (M9.6 has since landed the door on "paid";
// the forced-state proofs stand as the page's own). The page's copy is the Master's; its card
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
    // BUG-174 re-pin: the lede the founder removed
    // (23 Nov 2026) — the view no longer carries one.
    expect("lede" in view).toBe(false);
  });

  it("carries the Master's contents list verbatim, bold leads and the flood line's plain tail", () => {
    const view = buildReportPaymentView(HOME);
    expect(view.contentsHeading).toBe("What the detailed report adds");
    expect(view.contents).toEqual([
      { lead: "The breakdowns behind every headline", rest: null },
      // Re-pinned (BUG-214, founder ruling 24 Nov 2026):
      // the flood line's tail is trimmed — the lead
      // stands alone. (HCR-03, BUG-153, had named the
      // mapped layers in the tail.)
      { lead: "The flood findings in full", rest: null },
      { lead: "The fuller EPC detail", rest: null },
      { lead: "Questions to ask the seller", rest: null },
      { lead: "One dated, print-ready document", rest: null },
    ]);
    // BUG-131 (payment-flow parity stack, 22 Nov
    // 2026): the view no longer carries a price line
    // at all — the honesty block is the page's single
    // money statement. The rendered absence is pinned
    // in the structure test below.
    expect(view.payLabel).toBe("Pay £4.99");
  });

  it("carries the checkout card's plain one-payment line (Sample 2, founder 24 Nov 2026) — no £4.99 prefix", () => {
    const view = buildReportPaymentView(HOME);
    expect(view.onePaymentLine).toBe(PAYMENT_ONE_PAYMENT_LINE);
    expect(PAYMENT_ONE_PAYMENT_LINE).toBe("One payment, no subscription, nothing further to pay.");
    // The price shows only on the Pay button: no
    // bold price line anywhere in the view.
    expect(JSON.stringify(view)).not.toContain("£4.99 — one payment");
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
  it("carries the single-line consent in small print: the one line with its Terms link, the change-of-mind tail — and no price line, no refund line (BUG-215 supersedes BUG-145)", () => {
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
    // BUG-215: the change-of-mind sentence is the
    // consent line's tail, and the composed consent
    // label is the whole single line.
    expect(view.consentTail).toBe(PAYMENT_CONSENT_TAIL);
    expect(PAYMENT_CONSENT_TAIL).toBe(
      " I understand the 14-day change-of-mind right ends when it's delivered.",
    );
    expect(view.consentLabel).toBe(PAYMENT_CONSENT_LABEL);
    expect(PAYMENT_CONSENT_LABEL).toBe(
      "The report is information from official sources — not advice. By paying, you agree to our Terms of service. I understand the 14-day change-of-mind right ends when it's delivered.",
    );
    // BUG-215: the bold price line is gone from the
    // card — the view no longer carries it. The price
    // stands on the Pay button alone.
    expect("honestyPriceLine" in view).toBe(false);
    // BUG-145 (as amended, founder 22 Nov 2026): the
    // refund line is removed from the payment block
    // entirely — the view no longer carries it. The
    // constant stands for the success surface's
    // failed state, still the Terms sentence verbatim.
    expect("refundLine" in view).toBe(false);
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

  it("the consent label IS the single line (BUG-215), the old tick label and price line are gone, and it never names the gift", () => {
    const view = buildReportPaymentView(HOME);
    expect(view.consentLabel).toBe(PAYMENT_CONSENT_LABEL);
    expect(PAYMENT_CONSENT_LABEL).toBe(
      "The report is information from official sources — not advice. By paying, you agree to our Terms of service. I understand the 14-day change-of-mind right ends when it's delivered.",
    );
    // BUG-215 retires the BUG-145 tick label and the
    // bold price line — neither stands anywhere in
    // the view.
    const text = JSON.stringify(view);
    expect(text).not.toContain("Make my report now");
    expect(text).not.toContain("one payment, no subscription");
    // D21: the gift is a surprise until the delivery
    // email — no honest-screen content may name it.
    // The assertion runs over the view's VALUES, the
    // words a payer can see: the view now carries the
    // gift fields (giftEmail, giftLine) for the gift
    // variant, and they ride null on the paid page —
    // their KEY names carry the word by design, and
    // no value on the paid page names it.
    expect(JSON.stringify(Object.values(view)).toLowerCase()).not.toContain("gift");
  });

  it("renders the consent as one checkbox line — the terms line and the change-of-mind tail inside the tick label, above the email block, with no price line in the card (BUG-215)", () => {
    const html = renderPaid();
    // The label renders in parts (lead, link, tail),
    // so the composed line never stands contiguously
    // in the HTML — pin its parts in order, inside
    // the tick label (after the checkbox, before the
    // email block). The tail carries an apostrophe,
    // which the server renderer escapes — search in
    // the rendered form.
    const boxAt = html.indexOf('id="payment-consent"');
    const leadAt = html.indexOf(PAYMENT_TERMS_LINE_LEAD);
    const linkAt = html.indexOf(`<a href="${PAYMENT_TERMS_HREF}">${PAYMENT_TERMS_LINK_LABEL}</a>.`);
    const tailAt = html.indexOf(PAYMENT_CONSENT_TAIL.replaceAll("'", "&#x27;"));
    const emailAt = html.indexOf("Email address for delivery");
    expect(boxAt).toBeGreaterThan(-1);
    expect(leadAt).toBeGreaterThan(boxAt);
    expect(linkAt).toBeGreaterThan(leadAt);
    expect(tailAt).toBeGreaterThan(linkAt);
    expect(emailAt).toBeGreaterThan(tailAt);
    // The old BUG-145 block is gone: no "Make my
    // report now" label, no bold price line, no
    // separate small-print paragraph or price element
    // in the card — and no Required pill on the tick
    // (the email field keeps its own). Sample 2
    // restores the plain one-payment line in the
    // checkout card (no £4.99 prefix — the price
    // shows only on the Pay button), so the
    // absence pin is the bold price line, not the
    // sentence itself.
    expect(html).not.toContain("Make my report now");
    expect(html).not.toContain("£4.99 — one payment");
    expect(html).toContain("One payment, no subscription, nothing further to pay.");
    expect(html).not.toContain("report-payment__honesty-line");
    expect(html).not.toContain("report-payment__honesty-price");
    // BUG-145 (as amended): the refund line stands
    // nowhere on the payment page — it lives in the
    // Terms (and on the success surface's failed
    // state), not in this block.
    expect(html).not.toContain(PAYMENT_REFUND_LINE.replaceAll("'", "&#x27;"));
    // BUG-133 (payment-flow parity stack, 22 Nov
    // 2026): the mystery tease no longer stands below
    // the email block — it stands directly under the
    // page intro, above the contents card.
    const headingAt = html.indexOf("The detailed report for 19 Birkdale Rise");
    const teaseAt = html.indexOf(BUY_BAR_MYSTERY_LINE);
    const contentsAt = html.indexOf("What the detailed report adds");
    expect(teaseAt).toBeGreaterThan(headingAt);
    expect(contentsAt).toBeGreaterThan(teaseAt);
    // The line's Terms link is real: the label stands
    // inside an anchor on /terms, the full stop after
    // it — the composed line, exactly as ruled.
    expect(html).toContain(`<a href="${PAYMENT_TERMS_HREF}">${PAYMENT_TERMS_LINK_LABEL}</a>.`);
  });

  it("renders the tick-box unticked, and the start button in its disabled dress while it stands unticked", () => {
    const html = renderPaid();
    const box = html.match(/<input[^>]*id="payment-consent"[^>]*>/);
    expect(box).not.toBeNull();
    expect(box?.[0]).toContain('type="checkbox"');
    expect(box?.[0]).not.toContain("checked");
    // BUG-132 (payment-flow parity stack, 22 Nov
    // 2026): the button is no longer hard-disabled
    // while unticked — it wears the disabled dress
    // (aria-disabled, no disabled attribute) so an
    // attempt can be answered with the consent error
    // under the tick line instead of silence. Unticked
    // still = cannot pay: the start effect requires
    // the consent to stand (pinned by the
    // liveStartedPayment proofs below and the intent
    // route's own tests).
    const startButton = html.match(/<button[^>]*class="btn btn--brass report-payment__pay"[^>]*>/);
    expect(startButton).not.toBeNull();
    expect(startButton?.[0]).toContain('aria-disabled="true"');
    expect(startButton?.[0]).not.toMatch(/(?:^|\s)disabled(?:\s|=|>)/);
    // The consent error line is the pinned new copy
    // (it renders only on an unticked attempt, a
    // client-side state the static render cannot
    // reach; its wording is pinned here).
    expect(PAYMENT_CONSENT_ERROR_LINE).toBe(
      "Tick this box to continue — it confirms you understand the report is made for you straight away, and that the 14-day change-of-mind right ends once it is delivered.",
    );
  });

  it("a started payment lives only while its email and its consent still stand", () => {
    const started: StartedPayment = {
      clientSecret: "pi_1_secret_x",
      email: "buyer@example.co.uk",
      consentAt: "2026-11-22T00:40:00.000Z",
      publishableKey: "pk_default",
      intentId: "pi_1",
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
  it("renders the page's Sample 2 structure: heading, tease, contents on the left; checkout card on the right with the one-payment line, consent, email block, method rows and Pay button", () => {
    const html = renderPaid();
    // Sample 2 (founder, 24 Nov 2026): the plain
    // one-payment line stands in the checkout card
    // (no £4.99 prefix — the price shows only on the
    // Pay button). BUG-215's bold price line stays
    // gone, as does the old "Make my report now"
    // tick label. No hint line under the Pay button.
    expect(html).toContain("One payment, no subscription, nothing further to pay.");
    expect(html).not.toContain("£4.99 — one payment");
    expect(html).not.toContain("Tick the box and add your email to pay.");
    expect(html).not.toContain("Tick the box to pay.");
    expect(html).not.toContain("Make my report now");
    expect(html).toContain("The detailed report for 19 Birkdale Rise");
    expect(html).toContain("Hatfield Peverel, CM3 2JT");
    expect(html).toContain("What the detailed report adds");
    expect(html).toContain("<strong>The breakdowns behind every headline</strong>");
    expect(html).toContain("<strong>The flood findings in full</strong>");
    expect(html).not.toContain("with location maps for the flood zones and surface water");
    expect(html).toContain(PAYMENT_TERMS_LINE_LEAD);
    expect(html).toContain(`<a href="${PAYMENT_TERMS_HREF}">${PAYMENT_TERMS_LINK_LABEL}</a>.`);
    // BUG-215: the change-of-mind tail stands inside
    // the tick label (apostrophe escaped by the
    // server renderer).
    expect(html).toContain(
      "I understand the 14-day change-of-mind right ends when it&#x27;s delivered.",
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
    // Sample 2: the two-column layout, the checkout
    // card and the method rows stand in the markup,
    // in order — tease, contents, checkout head,
    // one-payment line, tick, email, methods, Pay.
    expect(html).toContain("report-payment__layout");
    expect(html).toContain("report-payment__checkout-card");
    expect(html).toContain("report-payment__methods");
    const teaseAt = html.indexOf(BUY_BAR_MYSTERY_LINE);
    const contentsAt = html.indexOf("What the detailed report adds");
    const headAt = html.indexOf("Detailed report</h2>");
    const onePaymentAt = html.indexOf("One payment, no subscription, nothing further to pay.");
    const boxAt = html.indexOf('id="payment-consent"');
    const emailAt = html.indexOf("Email address for delivery");
    const methodsAt = html.indexOf("report-payment__methods");
    const payAt = html.indexOf("Pay £4.99");
    expect(teaseAt).toBeGreaterThan(-1);
    expect(contentsAt).toBeGreaterThan(teaseAt);
    expect(headAt).toBeGreaterThan(contentsAt);
    expect(onePaymentAt).toBeGreaterThan(headAt);
    expect(boxAt).toBeGreaterThan(onePaymentAt);
    expect(emailAt).toBeGreaterThan(boxAt);
    expect(methodsAt).toBeGreaterThan(emailAt);
    expect(payAt).toBeGreaterThan(methodsAt);
    // The method rows are visible before any input:
    // Card first, Revolut Pay second — the label span
    // carries each row's text (the brand marks' svg
    // wordmarks stand beside it, not in it).
    const cardAt = html.indexOf(">Card</span>");
    const revolutAt = html.indexOf(">Revolut Pay</span>");
    expect(cardAt).toBeGreaterThan(methodsAt);
    expect(revolutAt).toBeGreaterThan(cardAt);
    // The accepted-brand marks stand on the rows from
    // the start too (founder, 25 Nov 2026): the four
    // card brands on the Card row, the Revolut mark on
    // the Revolut Pay row — before any email or
    // consent input (this render has neither).
    const visaAt = html.indexOf('data-brand="visa"');
    const mastercardAt = html.indexOf('data-brand="mastercard"');
    const amexAt = html.indexOf('data-brand="amex"');
    const discoverAt = html.indexOf('data-brand="discover"');
    const revolutMarkAt = html.indexOf('data-brand="revolut"');
    expect(visaAt).toBeGreaterThan(cardAt);
    expect(mastercardAt).toBeGreaterThan(visaAt);
    expect(amexAt).toBeGreaterThan(mastercardAt);
    expect(discoverAt).toBeGreaterThan(amexAt);
    expect(revolutMarkAt).toBeGreaterThan(revolutAt);
    // The email field's Required is the page's only
    // one (BUG-215 removed the tick's).
    expect(html.match(/Required/g)?.length).toBe(1);
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

describe("the payment element's key — the test lane (M9.6)", () => {
  it("a started payment's own lane key wins; the page's default key stands otherwise", () => {
    const started: StartedPayment = {
      clientSecret: "pi_1_secret_x",
      email: "tester@example.co.uk",
      consentAt: "2026-11-22T00:40:00.000Z",
      publishableKey: "pk_test_lane",
      intentId: "pi_1",
    };
    // The element initialises from the set that created
    // the payment — a test-lane payment under the test
    // key, never the page's default.
    expect(paymentElementKey(started, "pk_default")).toBe("pk_test_lane");
    expect(paymentElementKey({ ...started, publishableKey: null }, "pk_default")).toBe(
      "pk_default",
    );
    expect(paymentElementKey(null, "pk_default")).toBe("pk_default");
    expect(paymentElementKey(null, null)).toBeNull();
  });
});

describe("no interim screen between Pay and the success page (BUG-217)", () => {
  // The founder's report (24 Nov 2026): between the
  // payment screen and "Your report is being prepared"
  // an intermediate screen flashed for a fraction of a
  // second. The cause was the PAYMENT_TAKEN_LINE interim
  // render — onPaid set paid, React re-rendered the
  // taken line, and only then did the navigation to
  // /report/success commit. The fix removes the interim
  // state entirely: a confirmed payment navigates
  // straight from the payment screen.
  //
  // Note on the proof: this repo's unit harness has no
  // DOM environment (no jsdom, happy-dom or
  // testing-library installed), so no test here can
  // click Pay against a mocked confirmPayment. What is
  // pinned instead is the invariant that makes the
  // flash impossible: the taken line and the paid branch
  // no longer exist anywhere the page can render them,
  // and the direct navigation stands.
  const ROOT = process.cwd();
  const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
  const TAKEN_LINE = "Payment taken — your report will arrive by email.";

  it("the rendered payment page never contains the taken line or its element", () => {
    const html = renderPaid();
    expect(html).not.toContain(TAKEN_LINE);
    expect(html).not.toContain("report-payment__taken");
  });

  it("the component carries no interim paid state at all — no taken line, no paid flag, no paid branch", () => {
    const source = read("components/ReportPaymentPage.tsx");
    expect(source).not.toContain("PAYMENT_TAKEN_LINE");
    expect(source).not.toContain(TAKEN_LINE);
    expect(source).not.toContain("setPaid");
    expect(source).not.toContain("{paid ?");
    expect(source).not.toContain("report-payment__taken");
  });

  it("lib/report-payment.ts no longer exports the taken line", () => {
    expect("PAYMENT_TAKEN_LINE" in reportPayment).toBe(false);
    expect(read("lib/report-payment.ts")).not.toContain("PAYMENT_TAKEN_LINE");
  });

  it("a confirmed payment still navigates straight to the success surface — the navigation is untouched", () => {
    const source = read("components/ReportPaymentPage.tsx");
    expect(source).toContain("window.location.assign(");
    expect(source).toContain("`/report/success?order=${encodeURIComponent(startedRef.current)}`");
  });
});

// BUG-223 — the gift-applied order step (approved
// Screen C, DRAFT lines 6–7, verbatim). A visit
// holding a claimed, unspent gift sees no card form
// and no price: the gift banner, the bound email
// pre-filled, the consent tick standing ticked, and
// the "Get my free report" button. The order starts
// only when the claimant clicks that button — the
// tick alone never places it (the start effect stays
// gated on the button for a gift holder).
describe("payment page — the gift variant (BUG-223, approved Screen C)", () => {
  function renderGift(identity: ReportDoorIdentity = HOME): string {
    return renderToStaticMarkup(
      createElement(ReportPaymentPage, {
        view: buildReportPaymentView(identity, { email: GIFT_FRIEND }),
        // A gift order creates no payment at all, so the
        // page renders with no publishable key — the
        // gift must not depend on payment configuration.
        publishableKey: null,
        postcode: identity.kind === "generic" ? null : identity.postcode,
        homeKey: identity.kind === "home" ? identity.homeKey : null,
      }),
    );
  }

  it("the gift view speaks of the free report, never of paying (DRAFT lines 6–7)", () => {
    const view = buildReportPaymentView(HOME, { email: GIFT_FRIEND });
    expect(view.payLabel).toBe(GIFT_REPORT_BUTTON_LABEL);
    expect(view.payLabel).toBe("Get my free report");
    expect(view.termsLineLead).toBe(PAYMENT_GIFT_TERMS_LINE_LEAD);
    expect(view.termsLineLead).toContain("By ordering, you agree to our ");
    expect(view.termsLineLead).not.toContain("By paying");
    expect(view.termsLineLead).not.toContain("By claiming");
    // Screen C draws no closing line under the button,
    // and the panel keeps its "Detailed report" title.
    expect(view.closingLine).toBe("");
    expect(view.cardTitle).toBe("Detailed report");
    expect(view.giftEmail).toBe(GIFT_FRIEND);
    expect(view.giftLine).toBe(PAYMENT_GIFT_LINE);
    // The heading, contents card and tease are the paid
    // page's own and stand unchanged.
    expect(view.heading).toBe("The detailed report for 19 Birkdale Rise");
    expect(view.teaseEyebrow).toBe(BUY_BAR_MYSTERY_EYEBROW);
    expect(view.teaseLine).toBe(BUY_BAR_MYSTERY_LINE);
  });

  it("the gift line is the success surface's gift-applied banner, in twin form", () => {
    expect(PAYMENT_GIFT_LINE).toBe(GIFT_APPLIED_BANNER_LINE);
    expect(PAYMENT_GIFT_LINE).toBe(
      "Your free report gift has been applied — there's nothing to pay for this report.",
    );
  });

  it("the paid view carries no gift state", () => {
    const view = buildReportPaymentView(HOME);
    expect(view.giftEmail).toBeNull();
    expect(view.giftLine).toBeNull();
    expect(view.payLabel).toBe("Pay £4.99");
    expect(view.closingLine).toBe(PAYMENT_CLOSING_LINE);
    expect(view.cardTitle).toBe("Card payment");
  });

  it("renders the gift step: banner, pre-filled email, ticked consent, gift button — no card form, no price", () => {
    const html = renderGift();
    // The server renderer escapes the apostrophe.
    expect(html).toContain(PAYMENT_GIFT_LINE.replaceAll("'", "&#x27;"));
    expect(html).toContain(`value="${GIFT_FRIEND}"`);
    // The consent tick stands ticked on arrival
    // (Screen C as drawn).
    expect(html).toContain('id="payment-consent"');
    expect(html).toContain('checked=""');
    expect(html).toContain("By ordering, you agree to our ");
    expect(html).toContain(`<a href="${PAYMENT_TERMS_HREF}">${PAYMENT_TERMS_LINK_LABEL}</a>.`);
    expect(html).toContain("Get my free report");
    expect(html).toContain("A mystery extra");
    expect(html).toContain(BUY_BAR_MYSTERY_LINE);
    expect(html).not.toContain("Pay £4.99");
    expect(html).not.toContain("Card payment");
    expect(html).not.toContain("Powered by");
    expect(html).not.toContain("Payment is handled securely by Stripe");
    expect(html).not.toContain("report-payment__smallprint");
  });

  it("the paid render still starts unticked, email empty, Pay button standing", () => {
    const html = renderPaid();
    expect(html).not.toContain('checked=""');
    expect(html).toContain('value=""');
    expect(html).toContain("Pay £4.99");
    expect(html).toContain("Powered by");
  });
});
