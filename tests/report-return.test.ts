import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportPaymentFailedPage from "../components/ReportPaymentFailedPage";
import type { ReportDoorIdentity } from "../lib/report-door";
import {
  buildReportPaymentFailedView,
  PAYMENT_FAILED_REASONS,
  PAYMENT_FAILED_STILL_LINE,
} from "../lib/report-payment-failed";
import { createMemoryFulfilmentClaimStore } from "../lib/server/fulfilment";
import { readOrderState } from "../lib/server/order-state";
import {
  createFakePayments,
  createPaymentsRouter,
  type Payments,
  type PaymentsLaneSet,
} from "../lib/server/payments";

// M9.7 — the order-state reading (gap 2) and the
// payment-failed page (gap 1, Sample 12 verbatim). The
// reading is what the success surface and the return
// landing both decide from: claim first, then the
// payment itself, then nothing.

const EMAIL = "buyer@example.co.uk";
const POSTCODE = "CM3 2JT";
const HOME_KEY = "19||BIRKDALE RISE";
const CONSENT = { ticked: true, timestamp: "2026-11-22T00:40:00.000Z" };
const HOME: ReportDoorIdentity = {
  kind: "home",
  subject: "19 Birkdale Rise",
  subline: "Hatfield Peverel, CM3 2JT",
  postcode: "CM3 2JT",
  homeKey: "19||BIRKDALE RISE",
};

const text = (html: string) =>
  html.replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");

function laneSet(payments: Payments): PaymentsLaneSet {
  return { payments, webhookConfigured: true, publishableKey: "pk_x" };
}

describe("readOrderState — claim first, then the payment (M9.7, gap 2)", () => {
  it("a standing claim is the answer, whatever the payment says", async () => {
    const claims = createMemoryFulfilmentClaimStore();
    await claims.claim({
      ref: "pi_claimed",
      kind: "paid",
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
    });
    const fake = createFakePayments();
    const router = createPaymentsRouter({ live: laneSet(fake), test: null, testEmails: [] });
    const reading = await readOrderState({ claims, payments: router }, "pi_claimed");
    expect(reading.kind).toBe("claim");
    if (reading.kind === "claim") expect(reading.claim.status).toBe("claimed");
  });

  it("a succeeded payment with no claim yet reads PREPARING — the webhook race never bounces the buyer", async () => {
    const claims = createMemoryFulfilmentClaimStore();
    const fake = createFakePayments();
    const created = await fake.createReportIntent({
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      consent: CONSENT,
    });
    if (!created.ok) throw new Error("creation failed");
    fake.setStatus(created.intentId, "succeeded");
    const router = createPaymentsRouter({ live: laneSet(fake), test: null, testEmails: [] });
    const reading = await readOrderState({ claims, payments: router }, created.intentId);
    expect(reading).toEqual({
      kind: "payment",
      state: "preparing",
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
    });
  });

  it("a processing payment reads PREPARING too; an unpaid one reads UNPAID", async () => {
    const claims = createMemoryFulfilmentClaimStore();
    const fake = createFakePayments();
    const router = createPaymentsRouter({ live: laneSet(fake), test: null, testEmails: [] });
    const settling = await fake.createReportIntent({
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      consent: CONSENT,
    });
    const abandoned = await fake.createReportIntent({
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      consent: CONSENT,
    });
    if (!settling.ok || !abandoned.ok) throw new Error("creation failed");
    fake.setStatus(settling.intentId, "processing");
    fake.setStatus(abandoned.intentId, "requires_payment_method");
    await expect(readOrderState({ claims, payments: router }, settling.intentId)).resolves.toEqual(
      expect.objectContaining({ kind: "payment", state: "preparing" }),
    );
    await expect(readOrderState({ claims, payments: router }, abandoned.intentId)).resolves.toEqual(
      expect.objectContaining({ kind: "payment", state: "unpaid" }),
    );
  });

  it("a reference with neither claim nor payment reads NONE — the door fallback", async () => {
    const claims = createMemoryFulfilmentClaimStore();
    const fake = createFakePayments();
    const router = createPaymentsRouter({ live: laneSet(fake), test: null, testEmails: [] });
    await expect(readOrderState({ claims, payments: router }, "pi_made_up")).resolves.toEqual({
      kind: "none",
    });
  });

  it("a payment without our metadata is not ours to read — NONE, never a guess", async () => {
    const claims = createMemoryFulfilmentClaimStore();
    const foreign = {
      intentStatus: async (intentId: string) => ({
        ok: true as const,
        intentId,
        status: "succeeded",
        metadata: {},
      }),
    } as unknown as Payments;
    const router = createPaymentsRouter({ live: laneSet(foreign), test: null, testEmails: [] });
    await expect(readOrderState({ claims, payments: router }, "pi_foreign")).resolves.toEqual({
      kind: "none",
    });
  });
});

describe("the payment-failed view — Sample 12, verbatim (M9.7, gap 1)", () => {
  it("carries the sample's heading, lede, three reasons and still-the-same-price line, word for word", () => {
    const view = buildReportPaymentFailedView({ identity: HOME });
    expect(view.heading).toBe("Your payment didn't go through");
    expect(view.homeSubject).toBe("19 Birkdale Rise");
    expect(view.homeSubline).toBe("Hatfield Peverel, CM3 2JT");
    expect(`${view.ledeLead}${view.ledeStrong}${view.ledeTail}`).toBe(
      "Don't worry — this happens, and nothing is lost. You have not been charged, and no report has been ordered.",
    );
    expect(view.reasonsHeading).toBe("Why this usually happens");
    expect(view.reasons).toEqual([
      "Your bank declined the card — sometimes a quick check with them, or a different card, sorts it.",
      "The payment page was closed or left unfinished before the payment went through.",
      "A detail was mistyped — the card number, expiry date or the code on the back.",
    ]);
    expect(PAYMENT_FAILED_REASONS).toEqual(view.reasons);
    // The price in the still line is the composed label
    // — and at the launch price the composed line IS
    // the sample's line, character for character.
    expect(view.stillLine).toBe(
      "Whenever you're ready — the report for this home is still £4.99, and your free check is exactly as you left it.",
    );
    expect(PAYMENT_FAILED_STILL_LINE).toBe(view.stillLine);
    expect(view.backLabel).toBe("Back to your free check — it's still saved");
    expect(view.backHref).toBe("/search/home?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE");
    expect(view.shortlistHref).toBe("/shortlist");
  });

  it("renders the sample's page: the home named, the reasons, the road back", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(ReportPaymentFailedPage, {
          view: buildReportPaymentFailedView({ identity: HOME }),
        }),
      ),
    );
    expect(html).toContain("Your payment didn't go through");
    expect(html).toContain("<strong>19 Birkdale Rise</strong>, Hatfield Peverel, CM3 2JT");
    expect(html).toContain("You have not been charged");
    expect(html).toContain("Why this usually happens");
    expect(html).toContain("Your bank declined the card");
    expect(html).toContain("still £4.99");
    expect(html).toContain("← Back to your free check — it's still saved");
    expect(html).toContain("/search/home?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE");
    expect(html).toContain("Check another home");
    // BUG-139: the check-another card carries the one
    // postcode box — the success surface's BUG-135
    // treatment on its twin — not the hand-rolled
    // /search form that stood here (no suggestions, no
    // pick flow).
    expect(html).toContain("postcode-box postcode-box--bare");
    expect(html).not.toContain("failed-postcode");
    expect(html).not.toContain('action="/search"');
    expect(html).toContain("See your shortlist");
  });
});
