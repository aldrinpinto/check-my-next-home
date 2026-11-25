import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ReportPaymentPage from "../components/ReportPaymentPage";
import { decideClaimAttempt, canonicalEmail, normaliseEmail } from "../lib/gift";
import { createPaymentsRouter, testBuyerEmails, createFakePayments } from "../lib/server/payments";
import { createMemoryGiftStore, newConfirmToken } from "../lib/server/gifts";
import { createMemoryFulfilmentClaimStore } from "../lib/server/fulfilment";
import { createMemoryOrderStore } from "../lib/server/orders";
import { startReportPayment, type PaymentResolver } from "../lib/server/payment-intent";
import { decideReissue } from "../lib/download";
import {
  buildReportPaymentView,
  effectivePayLabel,
  paymentGiftLockedNote,
  PAYMENT_GIFT_USE_DIFFERENT_EMAIL,
} from "../lib/report-payment";
import type { ReportDoorIdentity } from "../lib/report-door";
import { GIFT_BUYER, GIFT_FRIEND, GIFT_NOW, giftRecord } from "./fixtures/gift";
import { deliveryRecord } from "./fixtures/download";

// BUG-267 (25 Nov 2026, founder's live session): the
// gift was recognised only on an EXACT email match, so
// a Gmail variant of the claimed address (+2222, dots,
// capitals, googlemail.com) was treated as a stranger —
// the variant order never became a gifted order, the
// gift was never spent, and the holder was charged
// £4.99 for a report the gift should have covered,
// while every paid order minted a fresh gift (the
// "endless stream"). The fix: one canonical mailbox
// identity (canonicalEmail, lib/gift.ts), used the same
// way at every comparison — claim, order-time gift
// lookup, spend lookup, order and delivery lookups,
// the test allowlist. Delivery still goes to the TYPED
// address: normaliseEmail (trim + lowercase) is the
// storage normaliser and is deliberately unchanged.

const CLAIMANT = "arodrigues2385@gmail.com";
const PLUS = "arodrigues2385+2222@gmail.com";
const DOTTED = "a.rodrigues2385@gmail.com";
const CAPPED = "ARODRIGUES2385@Gmail.com";
const GOOGLEMAIL = "arodrigues2385@googlemail.com";
const COMBINED = "A.Rodrigues2385+Work@GoogleMail.com";
// An underscore is a literal character, NOT an alias —
// the investigation's correction: the _1111 order was
// a genuinely different mailbox, never a plus-alias.
const UNDERSCORE = "arodrigues2385_1111@gmail.com";

const HOME: ReportDoorIdentity = {
  kind: "home",
  subject: "19 Birkdale Rise",
  subline: "Hatfield Peverel, CM3 2JT",
  postcode: "CM3 2JT",
  homeKey: "19||BIRKDALE RISE",
};

describe("canonicalEmail — one mailbox, however it is spelled (BUG-267)", () => {
  it("collapses the five Gmail variant classes onto the base address", () => {
    expect(canonicalEmail(PLUS)).toBe(CLAIMANT);
    expect(canonicalEmail(DOTTED)).toBe(CLAIMANT);
    expect(canonicalEmail(CAPPED)).toBe(CLAIMANT);
    expect(canonicalEmail(GOOGLEMAIL)).toBe(CLAIMANT);
    expect(canonicalEmail(COMBINED)).toBe(CLAIMANT);
    expect(canonicalEmail(`  ${PLUS} `)).toBe(CLAIMANT);
  });

  it("keeps dots meaningful everywhere except Gmail — and the +tag strip global", () => {
    // Dots are part of the mailbox at Yahoo, Outlook
    // and the rest: stripping them there would conflate
    // two different people's mail.
    expect(canonicalEmail("first.last@yahoo.com")).toBe("first.last@yahoo.com");
    expect(canonicalEmail("first.last@outlook.com")).toBe("first.last@outlook.com");
    expect(canonicalEmail("b.uyer@example.co.uk")).toBe("b.uyer@example.co.uk");
    // Plus-tags are subaddressing (RFC 5233) at every
    // major consumer provider, so the tag strips
    // globally — Gmail-only stripping would leave the
    // same hole open for Outlook, iCloud and Yahoo.
    expect(canonicalEmail("user+tag@outlook.com")).toBe("user@outlook.com");
    expect(canonicalEmail("user+tag@yahoo.com")).toBe("user@yahoo.com");
    expect(canonicalEmail("user+tag@example.co.uk")).toBe("user@example.co.uk");
  });

  it("does not collapse a genuinely different mailbox", () => {
    expect(canonicalEmail(UNDERSCORE)).toBe(UNDERSCORE);
    expect(canonicalEmail(UNDERSCORE)).not.toBe(CLAIMANT);
    expect(canonicalEmail("someone-else@example.co.uk")).toBe("someone-else@example.co.uk");
  });

  it("is idempotent, and safe on an already-normalised address", () => {
    expect(canonicalEmail(canonicalEmail(COMBINED))).toBe(CLAIMANT);
    expect(canonicalEmail("friend@example.co.uk")).toBe("friend@example.co.uk");
  });

  it("normaliseEmail is unchanged — storage keeps the typed address for delivery", () => {
    // The split is deliberate: the report and every
    // email go to the address the visitor typed, never
    // rewritten to canonical form. Only comparisons
    // canonicalise.
    expect(normaliseEmail("  A.Rodrigues2385+2222@Gmail.com ")).toBe(
      "a.rodrigues2385+2222@gmail.com",
    );
    expect(normaliseEmail("  Friend@Example.CO.UK ")).toBe("friend@example.co.uk");
  });
});

describe("decideClaimAttempt — variants of the bound address are the holder (BUG-267)", () => {
  it("resumes a claimed gift for any variant of the bound address", () => {
    const bound = giftRecord({ status: "claimed", claimantEmail: CLAIMANT });
    for (const variant of [CLAIMANT, PLUS, DOTTED, CAPPED, GOOGLEMAIL, COMBINED]) {
      expect(decideClaimAttempt(bound, variant, GIFT_NOW)).toEqual({ kind: "resume" });
    }
    expect(decideClaimAttempt(bound, UNDERSCORE, GIFT_NOW)).toEqual({
      kind: "refused-claimed",
    });
    expect(decideClaimAttempt(bound, "someone-else@example.co.uk", GIFT_NOW)).toEqual({
      kind: "refused-claimed",
    });
  });

  it("refuses the buyer's own address under any of its variants — and only those", () => {
    const issued = giftRecord({ buyerEmail: GIFT_BUYER });
    expect(decideClaimAttempt(issued, GIFT_BUYER, GIFT_NOW)).toEqual({ kind: "same-email" });
    expect(decideClaimAttempt(issued, "buyer+tag@example.co.uk", GIFT_NOW)).toEqual({
      kind: "same-email",
    });
    // Dots are meaningful at example.co.uk, so a
    // dotted buyer address is a different mailbox and
    // may still claim.
    expect(decideClaimAttempt(issued, "b.uyer@example.co.uk", GIFT_NOW)).toEqual({
      kind: "send-confirmation",
      email: "b.uyer@example.co.uk",
    });
  });
});

describe("findClaimedByEmail — the order-time gift lookup finds variants (BUG-267)", () => {
  async function claimedStore(pendingEmail: string) {
    const store = createMemoryGiftStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, now: GIFT_NOW });
    const pending = newConfirmToken();
    await store.setPending(gift.token, pendingEmail, pending, GIFT_NOW);
    await store.bindByConfirm(gift.token, pending, GIFT_NOW);
    return { store, gift };
  }

  it("finds the bound gift for every variant of the claimed address", async () => {
    const { store, gift } = await claimedStore(CLAIMANT);
    for (const variant of [CLAIMANT, PLUS, DOTTED, CAPPED, GOOGLEMAIL, COMBINED]) {
      expect((await store.findClaimedByEmail(variant, GIFT_NOW))?.token).toBe(gift.token);
    }
    expect(await store.findClaimedByEmail(UNDERSCORE, GIFT_NOW)).toBeNull();
    expect(await store.findClaimedByEmail("someone-else@example.co.uk", GIFT_NOW)).toBeNull();
  });

  it("finds it when the claim itself was bound under a variant spelling", async () => {
    const { store, gift } = await claimedStore(COMBINED);
    // The stored claimant address keeps its typed form;
    // the lookup canonicalises both sides at read time.
    expect((await store.getByToken(gift.token))?.claimantEmail).toBe(
      "a.rodrigues2385+work@googlemail.com",
    );
    expect((await store.findClaimedByEmail(CLAIMANT, GIFT_NOW))?.token).toBe(gift.token);
    expect((await store.findClaimedByEmail(PLUS, GIFT_NOW))?.token).toBe(gift.token);
  });
});

describe("findByEmail — an admin search finds the same person's variant orders (BUG-267)", () => {
  it("matches orders across variants, and only across variants", async () => {
    const orders = createMemoryOrderStore();
    await orders.recordClaim({
      ref: "order-variant-1",
      kind: "paid",
      email: PLUS,
      postcode: "OX11 7XF",
      homeKey: "20||EXE CLOSE",
    });
    await orders.recordClaim({
      ref: "order-other-1",
      kind: "paid",
      email: "someone-else@example.co.uk",
      postcode: "CM3 2JT",
      homeKey: "19||BIRKDALE RISE",
    });
    // The stored order email keeps its typed form.
    expect((await orders.getByRef("order-variant-1"))?.email).toBe(PLUS);
    for (const variant of [CLAIMANT, PLUS, DOTTED, GOOGLEMAIL]) {
      expect((await orders.findByEmail(variant)).map((o) => o.ref)).toEqual(["order-variant-1"]);
    }
    expect(await orders.findByEmail(UNDERSCORE)).toEqual([]);
    expect((await orders.findByEmail("someone-else@example.co.uk")).map((o) => o.ref)).toEqual([
      "order-other-1",
    ]);
  });
});

describe("decideReissue — a fresh link belongs to the same mailbox under any spelling (BUG-267)", () => {
  it("sends to a variant of the delivery address, and to nothing else", () => {
    const delivery = deliveryRecord();
    expect(decideReissue(delivery, "buyer@example.co.uk")).toBe("send");
    expect(decideReissue(delivery, "buyer+tag@example.co.uk")).toBe("send");
    expect(decideReissue(delivery, "BUYER@Example.CO.UK")).toBe("send");
    // Dots are meaningful at example.co.uk.
    expect(decideReissue(delivery, "b.uyer@example.co.uk")).toBe("no-send");
    expect(decideReissue(delivery, "someone-else@example.co.uk")).toBe("no-send");
  });
});

describe("the test allowlist — a tester ordering with a variant is still a tester (BUG-267)", () => {
  it("canonicalises the allowlist entries and the order email the same way", () => {
    expect(
      testBuyerEmails({ TEST_BUYER_EMAILS: " Tester+tag@Gmail.com, first.last@yahoo.com " }),
    ).toEqual(["tester@gmail.com", "first.last@yahoo.com"]);
    const router = createPaymentsRouter({
      live: { payments: createFakePayments(), webhookConfigured: true, publishableKey: "pk_live" },
      test: { payments: createFakePayments(), webhookConfigured: true, publishableKey: "pk_test" },
      testEmails: ["tester@gmail.com"],
    });
    expect(router.isTestOrder("tester@gmail.com")).toBe(true);
    expect(router.isTestOrder("tester+2222@gmail.com")).toBe(true);
    expect(router.isTestOrder("t.ester@gmail.com")).toBe(true);
    expect(router.isTestOrder("tester@googlemail.com")).toBe(true);
    expect(router.isTestOrder("tester_1@gmail.com")).toBe(false);
    expect(router.isTestOrder("someone-else@example.co.uk")).toBe(false);
  });
});

describe("the pay button follows the page's actual state (BUG-267)", () => {
  it("the gift view still carries the paid label alongside the gift label", () => {
    const paid = buildReportPaymentView(HOME);
    expect(paid.payLabel).toBe("Pay £4.99");
    expect(paid.paidPayLabel).toBe("Pay £4.99");
    const gifted = buildReportPaymentView(HOME, { email: CLAIMANT });
    expect(gifted.payLabel).toBe("Get my free report");
    expect(gifted.paidPayLabel).toBe("Pay £4.99");
    expect(gifted.giftEmail).toBe(CLAIMANT);
  });

  it("effectivePayLabel: gift label only while the gift applies and no payment stands", () => {
    const paid = buildReportPaymentView(HOME);
    const gifted = buildReportPaymentView(HOME, { email: CLAIMANT });
    // The gift holder, email standing on the bound
    // address, no payment started: the free label.
    expect(effectivePayLabel(gifted, true, false)).toBe("Get my free report");
    // The email edited away from the bound address —
    // the page shows the paid form, so the button must
    // say so, even on a gift visit.
    expect(effectivePayLabel(gifted, false, false)).toBe("Pay £4.99");
    // A payment stands: proof of the paid form (a gift
    // order never creates one), so the stale-view race
    // — a gift redeemed elsewhere between page load and
    // click — still reads paid.
    expect(effectivePayLabel(gifted, true, true)).toBe("Pay £4.99");
    // The ordinary paid page: the paid label, payment
    // or none.
    expect(effectivePayLabel(paid, false, false)).toBe("Pay £4.99");
    expect(effectivePayLabel(paid, false, true)).toBe("Pay £4.99");
  });
});

// BUG-287 (25 Nov 2026, founder's proposal): on the
// FREE (gift-claimed) flow the delivery email field is
// locked to the claimant email — no variant and no
// different email can be typed at all — with an
// explicit "Use a different email" escape that
// abandons the gift for this order. The lock is a UI
// lock, not a trust boundary: the server still
// enforces the match, and a gifted order delivers to
// the claimant email only.

describe("the gift payment form locks the delivery email to the claimant (BUG-287)", () => {
  function renderGift(): string {
    return renderToStaticMarkup(
      createElement(ReportPaymentPage, {
        view: buildReportPaymentView(HOME, { email: GIFT_FRIEND }),
        // A gift order creates no payment at all, so the
        // page renders with no publishable key.
        publishableKey: null,
        postcode: "CM3 2JT",
        homeKey: "19||BIRKDALE RISE",
      }),
    );
  }

  function renderPaid(): string {
    return renderToStaticMarkup(
      createElement(ReportPaymentPage, {
        view: buildReportPaymentView(HOME),
        publishableKey: "pk_test_throwaway",
        postcode: "CM3 2JT",
        homeKey: "19||BIRKDALE RISE",
      }),
    );
  }

  it("renders the locked field: read-only, the claimant email, the note naming it, the escape", () => {
    const html = renderGift();
    expect(html).toContain(`value="${GIFT_FRIEND}"`);
    expect(html).toContain("readonly");
    expect(html).toContain(paymentGiftLockedNote(GIFT_FRIEND));
    expect(html).toContain(PAYMENT_GIFT_USE_DIFFERENT_EMAIL);
    expect(html).toContain("Use a different email");
    expect(html).toContain("Get my free report");
    expect(html).not.toContain("Pay £4.99");
  });

  it("the paid view has none of these: editable field, no note, no escape", () => {
    const html = renderPaid();
    expect(html).not.toContain("readonly");
    expect(html).not.toContain("This gift is tied to");
    expect(html).not.toContain("Use a different email");
    expect(html).toContain("Pay £4.99");
  });

  it("abandoning the gift is the paid form: the button honestly reads Pay £4.99", () => {
    // Abandonment is giftActive=false — the escape sets
    // giftAbandoned, and effectivePayLabel answers the
    // paid label for exactly that state (the same state
    // as an email edited away).
    const gifted = buildReportPaymentView(HOME, { email: GIFT_FRIEND });
    expect(effectivePayLabel(gifted, false, false)).toBe("Pay £4.99");
  });
});

describe("startReportPayment — a gifted order delivers to the claimant email only (BUG-287)", () => {
  const CONSENT = { ticked: true, timestamp: "2026-11-22T00:40:00.000Z" };
  const resolve: PaymentResolver = async () => ({
    postcode: "CM3 2JT",
    homeKey: "19||BIRKDALE RISE",
    nation: "england",
  });

  async function giftHarness() {
    const giftStore = createMemoryGiftStore();
    const claims = createMemoryFulfilmentClaimStore();
    const gift = await giftStore.issue({ buyerEmail: GIFT_BUYER, now: GIFT_NOW });
    const pending = newConfirmToken();
    await giftStore.setPending(gift.token, CLAIMANT, pending, GIFT_NOW);
    await giftStore.bindByConfirm(gift.token, pending, GIFT_NOW);
    const fake = createFakePayments();
    const deps = {
      payments: createPaymentsRouter({
        live: { payments: fake, webhookConfigured: true, publishableKey: "pk_default" },
        test: null,
        testEmails: [],
      }),
      resolve,
      giftFor: async (email: string) => {
        const found = await giftStore.findClaimedByEmail(email, GIFT_NOW);
        return found ? { token: found.token } : null;
      },
      claimGifted: async (input: {
        ref: string;
        email: string;
        postcode: string;
        homeKey: string | null;
        giftToken: string;
      }) =>
        claims.claim({
          ref: input.ref,
          kind: "gifted",
          email: input.email,
          postcode: input.postcode,
          homeKey: input.homeKey,
          giftToken: input.giftToken,
        }),
    };
    return { claims, gift, fake, deps };
  }

  it("a variant of the claimant email still gifts — and the claim carries the TYPED variant", async () => {
    const { claims, gift, fake, deps } = await giftHarness();
    const result = await startReportPayment(deps, {
      postcode: "CM3 2JT",
      homeKey: "19||BIRKDALE RISE",
      email: PLUS,
      consent: CONSENT,
    });
    expect(result).toEqual({ ok: true, gifted: true, ref: gift.token });
    // No payment was created for a gifted order.
    expect(fake.created).toEqual([]);
    // The claim — what the worker delivers to — carries
    // the address the visitor typed, normalised, never
    // rewritten to canonical form: the same mailbox, the
    // visitor's own spelling.
    expect((await claims.getByRef(gift.token))?.email).toBe(PLUS);
  });

  it("a genuinely different mailbox pays as normal — no gift, no gifted claim", async () => {
    const { claims, fake, deps } = await giftHarness();
    const result = await startReportPayment(deps, {
      postcode: "CM3 2JT",
      homeKey: "19||BIRKDALE RISE",
      email: UNDERSCORE,
      consent: CONSENT,
    });
    expect(result.ok).toBe(true);
    // Not gifted: the answer carries a payment, not a
    // gift ref — and a gifted answer here would be the
    // defect, so it is asserted, never returned past.
    expect("gifted" in result).toBe(false);
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]?.email).toBe(UNDERSCORE);
    expect(claims.claims.size).toBe(0);
  });
});
