import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Stripe from "stripe";

import { DownloadRefundedCard } from "../components/DownloadLinkPage";
import { GiftClosedCard } from "../components/GiftClaimPage";
import ReportSuccessPage from "../components/ReportSuccessPage";

import type { AddressResolution } from "../lib/address";
import { decideReissue, downloadLandingView, type DeliveryRecord } from "../lib/download";
import { giftClaimPageView, giftServedState } from "../lib/gift";
import type { ReportDoorIdentity } from "../lib/report-door";
import { buildReportSuccessView } from "../lib/report-success";
import { REPORT_PRICE_PENCE } from "../lib/site";
import {
  createFulfilmentService,
  createMemoryFulfilmentClaimStore,
  processWebhookEvent,
  type WebhookDeps,
} from "../lib/server/fulfilment";
import { createMemoryGiftStore } from "../lib/server/gifts";
import { readOrderState } from "../lib/server/order-state";
import { createMemoryPaymentEventLog } from "../lib/server/payment-events";
import {
  createFakePayments,
  createPaymentsRouter,
  createStripePayments,
  FAKE_WEBHOOK_SECRET,
  type PaymentsLaneSet,
} from "../lib/server/payments";
import { DOWNLOAD_SECRET } from "./fixtures/download";
import { createMemoryDeliveryStore } from "../lib/server/report-deliveries";
import { createReportDeliveryService } from "../lib/server/report-delivery";
import type { ReportMailer } from "../lib/server/report-mailer";
import { createDownloadSigner } from "../lib/server/download-links";
import { resendOrderDelivery } from "../lib/server/report-resend";
import {
  createMemoryRefundStore,
  createRefundProcessing,
  refundTriggerMet,
} from "../lib/server/refunds";
import type { DeliverReportOutcome } from "../lib/server/report-delivery";

// M9.8 — refunds (the adopted prep; named tests
// T-PAY-07 and the refund leg of T-RPT-06).
//
// The founder refunds in the Stripe dashboard; this
// suite proves OUR side over the translator fake and
// the memory stores: the books are written as an
// overlay, the consequences of a completed FULL refund
// land exactly once and only then, the fulfilment race
// is tombstoned, the download link dies at every
// surface it can be exercised at, the gift lifecycle
// gains Voided, and a second genuine payment for the
// same home stands untouched. The live half — a real
// dashboard refund arriving through the webhook — is
// founder-gated (it needs the dashboard step that
// subscribes the destination to the refund events)
// and is NOT claimed by anything in this file.

const BUYER = "buyer@example.co.uk";
const FRIEND = "friend@example.co.uk";
const POSTCODE = "CM3 2JT";
const HOME_KEY = "19||BIRKDALE RISE";
const INTENT = "pi_refund_1";
const CHARGE = "ch_refund_1";
const NOW = new Date("2026-11-22T18:00:00.000Z");
const LATER = new Date("2026-11-22T19:00:00.000Z");
const LIVE_SECRET = FAKE_WEBHOOK_SECRET;
const SIGNING_SECRET = DOWNLOAD_SECRET;
const REFUND_CREATED_S = 1763836800; // the refund object's own "created"

const IDENTITY: ReportDoorIdentity = {
  kind: "home",
  subject: "19 Birkdale Rise",
  subline: "Hatfield Peverel, CM3 2JT",
  postcode: POSTCODE,
  homeKey: HOME_KEY,
};

function laneSet(payments: ReturnType<typeof createFakePayments>): PaymentsLaneSet {
  return { payments, webhookConfigured: true, publishableKey: "pk_x" };
}

function paymentSucceededPayload(intentId: string, email: string = BUYER): string {
  return JSON.stringify({
    type: "payment_intent.succeeded",
    livemode: true,
    data: {
      object: {
        id: intentId,
        object: "payment_intent",
        status: "succeeded",
        metadata: {
          email,
          postcode: POSTCODE,
          home_key: HOME_KEY,
          consent_tick: "true",
          consent_timestamp: "2026-11-22T17:00:00.000Z",
        },
      },
    },
  });
}

function refundPayload(input: {
  type?: string;
  eventId?: string;
  refundId: string;
  paymentRef?: string | null;
  amount?: number;
  status?: string;
  livemode?: boolean;
}): string {
  return JSON.stringify({
    id: input.eventId ?? `evt_${input.refundId}_1`,
    type: input.type ?? "refund.updated",
    livemode: input.livemode ?? true,
    data: {
      object: {
        id: input.refundId,
        object: "refund",
        payment_intent: input.paymentRef === undefined ? INTENT : input.paymentRef,
        charge: CHARGE,
        amount: input.amount ?? REPORT_PRICE_PENCE,
        currency: "gbp",
        status: input.status ?? "succeeded",
        created: REFUND_CREATED_S,
      },
    },
  });
}

// The whole books, wired the way production wires
// them: webhook deps with the refund processing over
// memory stores.
function books() {
  const live = createFakePayments({ webhookSecret: LIVE_SECRET });
  const router = createPaymentsRouter({ live: laneSet(live), test: null, testEmails: [] });
  const log = createMemoryPaymentEventLog();
  const claims = createMemoryFulfilmentClaimStore();
  const gifts = createMemoryGiftStore(() => NOW);
  const deliveries = createMemoryDeliveryStore(() => NOW);
  const refunds = createMemoryRefundStore();
  const processing = createRefundProcessing({ refunds, claims, deliveries, gifts });
  const deps: WebhookDeps = {
    payments: router,
    log,
    claims,
    recordCheckoutPaid: () => {},
    refunds: processing,
    now: () => NOW,
  };
  const send = (payload: string) =>
    processWebhookEvent(deps, { payload, signature: live.signWebhook(payload) });
  return { live, router, log, claims, gifts, deliveries, refunds, processing, deps, send };
}

// A paid order, delivered: the success event claimed
// it, the delivery service's acts are replayed against
// the same stores (gift issued on the paid delivery,
// delivery recorded, claim fulfilled).
async function deliverPaidOrder(
  h: ReturnType<typeof books>,
  intentId: string = INTENT,
  email: string = BUYER,
) {
  await h.send(paymentSucceededPayload(intentId, email));
  const gift = await h.gifts.issue({ buyerEmail: email, orderRef: intentId, now: NOW });
  const delivery = await h.deliveries.record({
    email,
    kind: "paid",
    pdfKey: "reports/MB34QX/key.pdf",
    fileName: "Check My Next Home — 19 Birkdale Rise CM3 2JT.pdf",
    homeTitle: "19 Birkdale Rise",
    homeAddressLine: "19 Birkdale Rise, Hatfield Peverel CM3 2JT",
    gift,
    orderRef: intentId,
    now: NOW,
  });
  await h.claims.markFulfilled(intentId, { deliveryId: delivery.id, mailSent: true, now: NOW });
  return { gift, delivery };
}

async function claimGift(h: ReturnType<typeof books>, token: string) {
  await h.gifts.setPending(token, FRIEND, "pending_tok_1", NOW);
  return h.gifts.bindByConfirm(token, "pending_tok_1", NOW);
}

// A gifted order, delivered against a claimed gift:
// the gifted claim, its delivery (keyed by the gift
// token, as the worker's delivery is), the redemption.
async function deliverGiftedOrder(h: ReturnType<typeof books>, token: string) {
  await h.claims.claim({
    ref: token,
    kind: "gifted",
    email: FRIEND,
    postcode: POSTCODE,
    homeKey: HOME_KEY,
    giftToken: token,
    now: NOW,
  });
  const delivery = await h.deliveries.record({
    email: FRIEND,
    kind: "gifted",
    pdfKey: "reports/MB34QX/gifted.pdf",
    fileName: "Check My Next Home — 19 Birkdale Rise CM3 2JT.pdf",
    homeTitle: "19 Birkdale Rise",
    homeAddressLine: "19 Birkdale Rise, Hatfield Peverel CM3 2JT",
    orderRef: token,
    now: NOW,
  });
  await h.gifts.markRedeemed(token, NOW);
  await h.claims.markFulfilled(token, { deliveryId: delivery.id, mailSent: true, now: NOW });
  return delivery;
}

// The delivery service over the same stores, with a
// capture mailer — the re-issue and re-send surfaces'
// own seam.
function deliveryService(h: ReturnType<typeof books>) {
  const sent: string[] = [];
  const mailer: ReportMailer = {
    sendDeliveryEmail: async () => {
      sent.push("delivery");
      return { sent: true };
    },
    sendReissueEmail: async () => {
      sent.push("reissue");
      return { sent: true };
    },
  };
  const signer = createDownloadSigner(SIGNING_SECRET);
  const service = createReportDeliveryService({
    deliveries: h.deliveries,
    gifts: h.gifts,
    mailer,
    signer,
  });
  return { service, signer, sent };
}

const RESOLUTION = { rung: 2, kind: "address-list" } as unknown as AddressResolution;

// The worker, wired with the production stop rule
// (fulfilment-worker.ts's own shape).
function worker(h: ReturnType<typeof books>) {
  const calls: string[] = [];
  const service = createFulfilmentService({
    claims: h.claims,
    resolve: async () => RESOLUTION,
    buildPdf: async () => ({
      pdfKey: "reports/key.pdf",
      fileName: "file.pdf",
      homeTitle: "19 Birkdale Rise",
      homeAddressLine: "19 Birkdale Rise, Hatfield Peverel CM3 2JT",
    }),
    deliver: async (input) => {
      calls.push(input.orderRef);
      return {
        delivery: { id: `delivery_${calls.length}` },
        downloadUrl: "https://example.test/download",
        mail: { sent: true },
      } as unknown as DeliverReportOutcome;
    },
    redeemGift: async () => {},
    recordDelivered: () => {},
    stopCheck: async (claim) => {
      if (claim.kind === "paid") {
        return (await h.processing.completedFullRefund(claim.ref)) ? "refunded" : null;
      }
      if (claim.kind === "gifted" && claim.giftToken) {
        const gift = await h.gifts.getByToken(claim.giftToken);
        return gift?.status === "voided" ? "refunded" : null;
      }
      return null;
    },
    origin: "https://play.example.test",
  });
  return { service, calls };
}

// ---------------------------------------------------------------

describe("T-PAY-07 — the translator names a refund by its payment linkage (gap 2)", () => {
  it("the fake reads a refund event's full shape: event id, kind, payment, charge, amount, currency, provider time", () => {
    const fake = createFakePayments({ webhookSecret: LIVE_SECRET });
    const payload = refundPayload({ type: "refund.created", refundId: "re_1", status: "pending" });
    const verdict = fake.verifyWebhookEvent({ payload, signature: fake.signWebhook(payload) });
    expect(verdict).toEqual({
      ok: true,
      type: "refund.created",
      intentId: "re_1",
      status: "pending",
      metadata: {},
      livemode: true,
      eventId: "evt_re_1_1",
      objectKind: "refund",
      paymentIntentId: INTENT,
      chargeId: CHARGE,
      refundId: "re_1",
      amount: REPORT_PRICE_PENCE,
      amountRefunded: null,
      currency: "gbp",
      providerCreatedAt: new Date(REFUND_CREATED_S * 1000),
      // M9.11: the provider's failure message rides the
      // verdict too — a refund object carries no payment
      // error, so it reads null here.
      failureMessage: null,
    });
  });

  it("the Stripe adapter reads the same shape from a genuinely signed refund event", () => {
    const real = new Stripe("sk_test_throwaway");
    const payments = createStripePayments({
      apiKey: "unused",
      webhookSecret: LIVE_SECRET,
      client: {
        paymentIntents: {
          create: async () => {
            throw new Error("unused");
          },
          retrieve: async () => {
            throw new Error("unused");
          },
        },
        webhooks: {
          constructEvent: (payload: string, signature: string, secret: string) =>
            real.webhooks.constructEvent(payload, signature, secret) as unknown as {
              id?: unknown;
              type: string;
              livemode?: unknown;
              data: { object: Record<string, unknown> };
            },
        },
      },
    });
    const payload = refundPayload({
      type: "refund.created",
      refundId: "re_9",
      status: "succeeded",
    });
    const signature = real.webhooks.generateTestHeaderString({ payload, secret: LIVE_SECRET });
    const verdict = payments.verifyWebhookEvent({ payload, signature });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.refundId).toBe("re_9");
    expect(verdict.paymentIntentId).toBe(INTENT);
    expect(verdict.chargeId).toBe(CHARGE);
    expect(verdict.amount).toBe(REPORT_PRICE_PENCE);
    expect(verdict.currency).toBe("gbp");
    expect(verdict.eventId).toBe("evt_re_9_1");
    expect(verdict.providerCreatedAt).toEqual(new Date(REFUND_CREATED_S * 1000));
  });

  it("a charge object names its payment and its refunded total as corroboration — and no refund id", () => {
    const fake = createFakePayments({ webhookSecret: LIVE_SECRET });
    const payload = JSON.stringify({
      id: "evt_charge_1",
      type: "charge.refunded",
      livemode: true,
      data: {
        object: {
          id: CHARGE,
          object: "charge",
          payment_intent: INTENT,
          amount: REPORT_PRICE_PENCE,
          amount_refunded: REPORT_PRICE_PENCE,
          currency: "gbp",
          refunded: true,
          created: REFUND_CREATED_S,
        },
      },
    });
    const verdict = fake.verifyWebhookEvent({ payload, signature: fake.signWebhook(payload) });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.objectKind).toBe("charge");
    expect(verdict.paymentIntentId).toBe(INTENT);
    expect(verdict.chargeId).toBe(CHARGE);
    expect(verdict.refundId).toBeNull();
    expect(verdict.amountRefunded).toBe(REPORT_PRICE_PENCE);
  });
});

// ---------------------------------------------------------------

describe("T-PAY-07 — a completed full refund on a delivered order (gap 12 a, c, h)", () => {
  it("(a) gift unclaimed: the link dies at every surface, the gift is voided, the books agree", async () => {
    const h = books();
    const { gift, delivery } = await deliverPaidOrder(h);
    const outcome = await h.send(
      refundPayload({ type: "refund.created", refundId: "re_a", status: "succeeded" }),
    );
    expect(outcome).toEqual({ kind: "refund" });

    // The refund record: the overlay, carrying what
    // M9.11's admin page reads.
    const rows = await h.refunds.listByPayment(INTENT);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        refundId: "re_a",
        paymentRef: INTENT,
        chargeRef: CHARGE,
        amount: REPORT_PRICE_PENCE,
        currency: "gbp",
        status: "succeeded",
        unmatched: false,
        consequencesApplied: true,
        giftConsequence: "voided",
        providerCreatedAt: new Date(REFUND_CREATED_S * 1000),
      }),
    );
    expect(rows[0]?.consequencesAppliedAt).toEqual(NOW);

    // The audit log filed the refund under the PAYMENT
    // reference, not the refund's own id (gap 4).
    expect(h.log.records.map((r) => [r.eventType, r.intentId])).toEqual([
      ["payment_intent.succeeded", INTENT],
      ["refund.created", INTENT],
    ]);

    // The claim's history is untouched — fulfilled
    // stands; the refund is an overlay beside it.
    expect(h.claims.claims.get(INTENT)?.status).toBe("fulfilled");

    // The delivery stands withdrawn, row and reason
    // kept.
    const withdrawn = await h.deliveries.getById(delivery.id);
    expect(withdrawn?.withdrawnAt).toEqual(NOW);
    expect(withdrawn?.withdrawnRefundId).toBe("re_a");

    // The link dies at the landing — in date and
    // expired alike, never the expired card.
    const genuine = { kind: "ok" as const, deliveryId: delivery.id, expiresAt: LATER };
    const stale = { kind: "expired" as const, deliveryId: delivery.id, expiresAt: NOW };
    expect(downloadLandingView(genuine, { withdrawn: true })).toEqual({ kind: "refunded" });
    expect(downloadLandingView(stale, { withdrawn: true })).toEqual({ kind: "refunded" });
    expect(downloadLandingView(stale, { withdrawn: true, sent: true })).toEqual({
      kind: "refunded",
    });

    // …at re-issue: the decision refuses, and the
    // service answers without sending.
    expect(decideReissue(withdrawn, BUYER)).toBe("no-send");
    const { service, signer, sent } = deliveryService(h);
    const { token } = signer.mint(delivery.id, NOW);
    await expect(
      service.reissueDownloadLink({ token, email: BUYER, origin: "https://play.example.test" }),
    ).resolves.toEqual({ kind: "answered", sent: false });
    expect(sent).toEqual([]);

    // …and at the buyer re-send: the service refuses,
    // so the re-send seam answers not-found.
    await expect(
      service.resendDeliveryEmail({ deliveryId: delivery.id, origin: "x" }),
    ).resolves.toBeNull();
    await expect(
      resendOrderDelivery({ claims: h.claims, delivery: service }, { ref: INTENT, origin: "x" }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });

    // The gift is voided — terminally: it serves the
    // voided state (never expired, even past day 30),
    // and the auto-apply lookup can never find it.
    const voided = await h.gifts.getByToken(gift.token);
    expect(voided?.status).toBe("voided");
    expect(voided?.voidedAt).toEqual(NOW);
    expect(giftServedState(voided, LATER)).toBe("voided");
    expect(giftServedState(voided, new Date(NOW.getTime() + 31 * 24 * 3600 * 1000))).toBe("voided");
    expect(giftClaimPageView(voided, LATER, {})).toEqual({ kind: "closed", variant: "voided" });
    expect(await h.gifts.findClaimedByEmail(BUYER, LATER)).toBeNull();

    // The success surface reads the overlay BEFORE the
    // claim's fulfilled state.
    const reading = await readOrderState(
      { claims: h.claims, payments: h.router, refunds: h.processing },
      INTENT,
    );
    expect(reading.kind).toBe("refunded");
    const view = buildReportSuccessView({
      state: "refunded",
      kind: "paid",
      identity: IDENTITY,
      email: BUYER,
      orderRef: INTENT,
    });
    expect(view.heading).toBe("This order was refunded");
    expect(view.viewHref).toBeNull();
    expect(view.sectionsLine).toBeNull();
    expect(view.resendRef).toBeNull();
    expect(view.emailHeading).toBeNull();
    expect(view.badge).toBeNull();
  });

  it("(c) gift redeemed: the buyer's link dies, the gifted report stands untouched", async () => {
    const h = books();
    const { gift, delivery } = await deliverPaidOrder(h);
    await claimGift(h, gift.token);
    const giftedDelivery = await deliverGiftedOrder(h, gift.token);
    expect((await h.gifts.getByToken(gift.token))?.status).toBe("redeemed");

    await h.send(refundPayload({ refundId: "re_c" }));

    expect((await h.deliveries.getById(delivery.id))?.withdrawnAt).toEqual(NOW);
    expect((await h.deliveries.getById(giftedDelivery.id))?.withdrawnAt).toBeNull();
    const standing = await h.gifts.getByToken(gift.token);
    expect(standing?.status).toBe("redeemed");
    expect(standing?.voidedAt).toBeNull();
    expect((await h.refunds.listByPayment(INTENT))[0]?.giftConsequence).toBe("redeemed-stood");
    // The gifted claim and its surface stand too.
    expect(h.claims.claims.get(gift.token)?.status).toBe("fulfilled");
    const giftedReading = await readOrderState(
      { claims: h.claims, payments: h.router, refunds: h.processing },
      gift.token,
    );
    expect(giftedReading.kind).toBe("claim");
  });

  it("(h) a second genuine payment for the same home, refund the first: the second stands untouched", async () => {
    const h = books();
    const first = await deliverPaidOrder(h, INTENT);
    const SECOND = "pi_refund_2";
    const second = await deliverPaidOrder(h, SECOND);

    await h.send(refundPayload({ refundId: "re_h", paymentRef: INTENT }));

    expect((await h.deliveries.getById(first.delivery.id))?.withdrawnAt).toEqual(NOW);
    expect((await h.gifts.getByToken(first.gift.token))?.status).toBe("voided");
    expect((await h.deliveries.getById(second.delivery.id))?.withdrawnAt).toBeNull();
    expect((await h.gifts.getByToken(second.gift.token))?.status).toBe("issued");
    expect(h.claims.claims.get(SECOND)?.status).toBe("fulfilled");
    expect(await h.refunds.listByPayment(SECOND)).toEqual([]);
    const reading = await readOrderState(
      { claims: h.claims, payments: h.router, refunds: h.processing },
      SECOND,
    );
    expect(reading.kind).toBe("claim");
  });
});

// ---------------------------------------------------------------

describe("T-PAY-07 — the gift's three fates (gap 12 b)", () => {
  it("(b) gift claimed but unused: voided, its waiting claim stopped, its unredeemed delivery withdrawn", async () => {
    const h = books();
    const { gift } = await deliverPaidOrder(h);
    await claimGift(h, gift.token);
    // The claimant has started their order: a gifted
    // claim waits for the worker, and a gifted delivery
    // already stands (delivered, but the redemption
    // write never landed — the prep's own edge).
    await h.claims.claim({
      ref: gift.token,
      kind: "gifted",
      email: FRIEND,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      giftToken: gift.token,
      now: NOW,
    });
    const giftedDelivery = await h.deliveries.record({
      email: FRIEND,
      kind: "gifted",
      pdfKey: "reports/MB34QX/gifted.pdf",
      fileName: "file.pdf",
      homeTitle: "19 Birkdale Rise",
      homeAddressLine: "19 Birkdale Rise, Hatfield Peverel CM3 2JT",
      orderRef: gift.token,
      now: NOW,
    });

    await h.send(refundPayload({ refundId: "re_b" }));

    const voided = await h.gifts.getByToken(gift.token);
    expect(voided?.status).toBe("voided");
    expect((await h.refunds.listByPayment(INTENT))[0]?.giftConsequence).toBe("voided-claimed");
    // The waiting gifted claim is retired as refunded —
    // the claimant never waits on a "preparing" forever.
    expect(h.claims.claims.get(gift.token)?.status).toBe("refunded");
    // The unredeemed gifted delivery is withdrawn.
    expect((await h.deliveries.getById(giftedDelivery.id))?.withdrawnAt).toEqual(NOW);
    // The claimant's surfaces read the voided state:
    // the claim page serves it, and the order-state
    // reading carries the voided-gift overlay.
    expect(giftClaimPageView(voided, LATER, {})).toEqual({ kind: "closed", variant: "voided" });
    const reading = await readOrderState(
      {
        claims: h.claims,
        payments: h.router,
        refunds: h.processing,
        giftVoided: async (token) => (await h.gifts.getByToken(token))?.status === "voided",
      },
      gift.token,
    );
    expect(reading.kind).toBe("voided-gift");
    const view = buildReportSuccessView({
      state: "refunded",
      kind: "gifted",
      identity: IDENTITY,
      email: FRIEND,
      orderRef: gift.token,
    });
    expect(view.heading).toBe("This gift was voided");
    expect(view.viewHref).toBeNull();
    // And the voided gift can never start a new order:
    // the auto-apply lookup finds only claimed gifts.
    expect(await h.gifts.findClaimedByEmail(FRIEND, LATER)).toBeNull();
  });

  it("a pending confirmation dies with the void: the confirmation link binds nothing afterwards", async () => {
    const h = books();
    const { gift } = await deliverPaidOrder(h);
    await h.gifts.setPending(gift.token, FRIEND, "pending_tok_9", NOW);
    await h.send(refundPayload({ refundId: "re_b2" }));
    const voided = await h.gifts.getByToken(gift.token);
    expect(voided?.status).toBe("voided");
    expect(voided?.pendingEmail).toBeNull();
    expect(voided?.pendingToken).toBeNull();
    expect(await h.gifts.bindByConfirm(gift.token, "pending_tok_9", LATER)).toBeNull();
    expect((await h.gifts.getByToken(gift.token))?.status).toBe("voided");
  });
});

// ---------------------------------------------------------------

describe("T-PAY-07 — the fulfilment race: the tombstone (gap 12 d, e)", () => {
  it("(d) refund while the paid claim waits: the worker never delivers it", async () => {
    const h = books();
    await h.send(paymentSucceededPayload(INTENT));
    expect(h.claims.claims.get(INTENT)?.status).toBe("claimed");

    await h.send(refundPayload({ refundId: "re_d" }));
    // The transition itself retires the waiting claim.
    expect(h.claims.claims.get(INTENT)?.status).toBe("refunded");

    const { service, calls } = worker(h);
    await expect(service.runPending()).resolves.toEqual({ processed: 0, fulfilled: 0, failed: 0 });
    expect(calls).toEqual([]);
    // No gift was ever issued for the order.
    expect(await h.gifts.getByOrderRef(INTENT)).toBeNull();
  });

  it("(d2) the worker's own guard stops a claim the transition has not reached", async () => {
    const h = books();
    await h.send(paymentSucceededPayload(INTENT));
    // The refund record stands (written directly, as a
    // refund processed while the receiver was mid-flight
    // would leave it) but no transition has run.
    await h.refunds.recordEvent({
      refundId: "re_d2",
      paymentRef: INTENT,
      chargeRef: CHARGE,
      amount: REPORT_PRICE_PENCE,
      currency: "gbp",
      status: "succeeded",
      livemode: true,
      providerCreatedAt: NOW,
      testOrder: false,
      now: NOW,
    });
    const { service, calls } = worker(h);
    const claim = h.claims.claims.get(INTENT)!;
    await expect(service.fulfilClaim(claim)).resolves.toEqual({ outcome: "refunded" });
    expect(calls).toEqual([]);
    expect(h.claims.claims.get(INTENT)?.status).toBe("refunded");
    expect(h.claims.claims.get(INTENT)?.attempts).toBe(0);
  });

  it("(d3) refund after the claim failed: it stays failed — no retake road opens", async () => {
    const h = books();
    await h.send(paymentSucceededPayload(INTENT));
    for (let i = 0; i < 3; i += 1) {
      await h.claims.recordFailure(INTENT, { error: "printer down", maxAttempts: 3 });
    }
    expect(h.claims.claims.get(INTENT)?.status).toBe("failed");
    await h.send(refundPayload({ refundId: "re_d3" }));
    expect(h.claims.claims.get(INTENT)?.status).toBe("failed");
    expect((await h.refunds.listByPayment(INTENT))[0]?.consequencesApplied).toBe(true);
  });

  it("(e) refund BEFORE the success claim: the claim is born refunded and never fulfilled", async () => {
    const h = books();
    const outcome = await h.send(refundPayload({ refundId: "re_e" }));
    expect(outcome).toEqual({ kind: "refund" });
    // The record stands keyed by the payment reference
    // with no order behind it yet — matched, not
    // unmatched: the payment linkage names the order.
    const rows = await h.refunds.listByPayment(INTENT);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.unmatched).toBe(false);
    expect(rows[0]?.consequencesApplied).toBe(true);

    const claimed = await h.send(paymentSucceededPayload(INTENT));
    expect(claimed).toEqual({ kind: "claimed" });
    expect(h.claims.claims.get(INTENT)?.status).toBe("refunded");

    const { service, calls } = worker(h);
    await expect(service.runPending()).resolves.toEqual({ processed: 0, fulfilled: 0, failed: 0 });
    expect(calls).toEqual([]);
  });

  it("a refund naming no payment at all is recorded unmatched and applies nothing", async () => {
    const h = books();
    const outcome = await h.send(refundPayload({ refundId: "re_x", paymentRef: null }));
    expect(outcome).toEqual({ kind: "refund" });
    const record = await h.refunds.getByRefundId("re_x");
    expect(record?.unmatched).toBe(true);
    expect(record?.paymentRef).toBeNull();
    expect(record?.consequencesApplied).toBe(false);
  });
});

// ---------------------------------------------------------------

describe("T-PAY-07 — duplicates and out-of-order news converge (gap 12 f)", () => {
  it("(f) the same news twice, then stale news: one transition, nothing twice, nothing resurrected", async () => {
    const h = books();
    const { gift, delivery } = await deliverPaidOrder(h);
    await h.send(refundPayload({ type: "refund.created", refundId: "re_f", status: "pending" }));
    await h.send(refundPayload({ type: "refund.updated", refundId: "re_f", status: "succeeded" }));
    const appliedAt = (await h.refunds.listByPayment(INTENT))[0]?.consequencesAppliedAt;
    expect(appliedAt).toEqual(NOW);
    expect((await h.gifts.getByToken(gift.token))?.status).toBe("voided");

    // The duplicate delivery of the same event, and a
    // stale pending notice after completion.
    await h.send(refundPayload({ type: "refund.updated", refundId: "re_f", status: "succeeded" }));
    await h.send(refundPayload({ type: "refund.updated", refundId: "re_f", status: "pending" }));
    const rows = await h.refunds.listByPayment(INTENT);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("succeeded");
    expect(rows[0]?.consequencesApplied).toBe(true);
    expect(rows[0]?.consequencesAppliedAt).toEqual(appliedAt);
    expect((await h.deliveries.getById(delivery.id))?.withdrawnAt).toEqual(NOW);
    expect((await h.gifts.getByToken(gift.token))?.status).toBe("voided");

    // A failure notice for the applied refund: recorded
    // and flagged for the owner's eye — the link stays
    // dead and the gift stays voided.
    await h.send(refundPayload({ type: "refund.failed", refundId: "re_f", status: "failed" }));
    const flagged = await h.refunds.getByRefundId("re_f");
    expect(flagged?.needsAttention).toBe(true);
    expect(flagged?.status).toBe("succeeded");
    expect(flagged?.consequencesApplied).toBe(true);
    expect((await h.deliveries.getById(delivery.id))?.withdrawnAt).toEqual(NOW);
    expect((await h.gifts.getByToken(gift.token))?.status).toBe("voided");
  });

  it("charge.refunded is corroboration only: logged under the payment, never a trigger", async () => {
    const h = books();
    const { delivery } = await deliverPaidOrder(h);
    const payload = JSON.stringify({
      id: "evt_charge_2",
      type: "charge.refunded",
      livemode: true,
      data: {
        object: {
          id: CHARGE,
          object: "charge",
          payment_intent: INTENT,
          amount: REPORT_PRICE_PENCE,
          amount_refunded: REPORT_PRICE_PENCE,
          currency: "gbp",
          refunded: true,
          created: REFUND_CREATED_S,
        },
      },
    });
    const outcome = await h.send(payload);
    expect(outcome).toEqual({ kind: "logged" });
    expect(await h.refunds.listByPayment(INTENT)).toEqual([]);
    expect((await h.deliveries.getById(delivery.id))?.withdrawnAt).toBeNull();
    expect(h.log.records.at(-1)).toEqual(
      expect.objectContaining({ eventType: "charge.refunded", intentId: INTENT }),
    );
  });
});

// ---------------------------------------------------------------

describe("T-PAY-07 — only a completed FULL refund fires consequences (gap 12 g)", () => {
  it("(g) a partial refund withdraws nothing; the completing refund fires everything", async () => {
    const h = books();
    const { gift, delivery } = await deliverPaidOrder(h);
    await h.send(refundPayload({ refundId: "re_g1", amount: 200, status: "succeeded" }));
    expect((await h.deliveries.getById(delivery.id))?.withdrawnAt).toBeNull();
    expect((await h.gifts.getByToken(gift.token))?.status).toBe("issued");
    expect(h.claims.claims.get(INTENT)?.status).toBe("fulfilled");
    expect((await h.refunds.listByPayment(INTENT))[0]?.consequencesApplied).toBe(false);
    expect(await h.processing.completedFullRefund(INTENT)).toBe(false);

    await h.send(
      refundPayload({ refundId: "re_g2", amount: REPORT_PRICE_PENCE - 200, status: "succeeded" }),
    );
    expect(await h.processing.completedFullRefund(INTENT)).toBe(true);
    expect((await h.deliveries.getById(delivery.id))?.withdrawnAt).toEqual(NOW);
    expect((await h.deliveries.getById(delivery.id))?.withdrawnRefundId).toBe("re_g2");
    expect((await h.gifts.getByToken(gift.token))?.status).toBe("voided");
    const rows = await h.refunds.listByPayment(INTENT);
    expect(rows.map((r) => r.consequencesApplied)).toEqual([true, true]);
  });

  it("a pending full refund changes nothing visible until it succeeds", async () => {
    const h = books();
    const { gift, delivery } = await deliverPaidOrder(h);
    await h.send(refundPayload({ type: "refund.created", refundId: "re_p", status: "pending" }));
    expect((await h.deliveries.getById(delivery.id))?.withdrawnAt).toBeNull();
    expect((await h.gifts.getByToken(gift.token))?.status).toBe("issued");
    await h.send(refundPayload({ type: "refund.updated", refundId: "re_p", status: "succeeded" }));
    expect((await h.deliveries.getById(delivery.id))?.withdrawnAt).toEqual(NOW);
    expect((await h.gifts.getByToken(gift.token))?.status).toBe("voided");
  });

  it("a failed refund is recorded, clears to no-refund, and withdraws nothing", async () => {
    const h = books();
    const { gift, delivery } = await deliverPaidOrder(h);
    await h.send(refundPayload({ type: "refund.created", refundId: "re_x1", status: "pending" }));
    const outcome = await h.send(
      refundPayload({ type: "refund.failed", refundId: "re_x1", status: "failed" }),
    );
    expect(outcome).toEqual({ kind: "refund" });
    const record = await h.refunds.getByRefundId("re_x1");
    expect(record?.status).toBe("failed");
    expect(record?.consequencesApplied).toBe(false);
    expect((await h.deliveries.getById(delivery.id))?.withdrawnAt).toBeNull();
    expect((await h.gifts.getByToken(gift.token))?.status).toBe("issued");
    expect(refundTriggerMet(await h.refunds.listByPayment(INTENT))).toBe(false);
  });
});

// ---------------------------------------------------------------

describe("T-RPT-06 — the download link life cycle: a refunded purchase's link is dead", () => {
  it("before the refund the link serves; after it, every token over the delivery is dead at once", async () => {
    const h = books();
    const { delivery } = await deliverPaidOrder(h);
    const { service, signer } = deliveryService(h);
    const first = signer.mint(delivery.id, NOW);
    const second = signer.mint(delivery.id, LATER);
    const verify = (token: string) => signer.verify(token, LATER);
    expect(verify(first.token).kind).toBe("ok");
    expect(decideReissue(delivery, BUYER)).toBe("send");

    await h.send(refundPayload({ refundId: "re_t6" }));

    // Both tokens still VERIFY — the signature and the
    // seventh day are untouched — and both are dead,
    // because the standing is read at serve time from
    // the delivery, not from the token.
    const withdrawn = await h.deliveries.getById(delivery.id);
    for (const token of [first.token, second.token]) {
      const verification = verify(token);
      expect(verification.kind).toBe("ok");
      if (verification.kind !== "ok") continue;
      expect(
        downloadLandingView(verification, { withdrawn: withdrawn?.withdrawnAt != null }),
      ).toEqual({ kind: "refunded" });
    }
    expect(decideReissue(withdrawn, BUYER)).toBe("no-send");
    await expect(
      service.resendDeliveryEmail({ deliveryId: delivery.id, origin: "x" }),
    ).resolves.toBeNull();
    // The delivery row and its record stand — only the
    // standing changed.
    expect(withdrawn?.pdfKey).toBe(delivery.pdfKey);
    expect(withdrawn?.withdrawnRefundId).toBe("re_t6");
  });

  it("a withdrawn standing is idempotent: a second withdrawal keeps the first reason", async () => {
    const h = books();
    const { delivery } = await deliverPaidOrder(h);
    await h.deliveries.withdraw(delivery.id, "re_first", NOW);
    const again = await h.deliveries.withdraw(delivery.id, "re_second", LATER);
    expect(again?.withdrawnAt).toEqual(NOW);
    expect(again?.withdrawnRefundId).toBe("re_first");
    const record: DeliveryRecord | null = await h.deliveries.getById(delivery.id);
    expect(record?.withdrawnRefundId).toBe("re_first");
  });
});

// ---------------------------------------------------------------

describe("the new surface states, rendered (M9.8 draft samples)", () => {
  // React's static renderer escapes apostrophes in
  // text (&#x27;); the assertions read the unescaped
  // form, so they judge the words a browser shows.
  const text = (html: string) => html.replaceAll("&#x27;", "'");

  it("the withdrawn download landing is the refunded card — no form, no fresh-link promise", () => {
    const html = text(renderToStaticMarkup(createElement(DownloadRefundedCard)));
    expect(html).toContain("This report was refunded");
    expect(html).toContain("The order behind this link was refunded in full");
    expect(html).not.toContain("Send me a fresh link");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("This link has expired");
  });

  it("the voided gift card carries its own words — never expired, never used, never not-recognised", () => {
    const html = text(renderToStaticMarkup(createElement(GiftClosedCard, { variant: "voided" })));
    expect(html).toContain("This gift was voided");
    expect(html).toContain("a refund ends the gift that came with it");
    expect(html).toContain("Nothing was used up by you");
    expect(html).not.toContain("This gift link has expired");
    expect(html).not.toContain("already been used");
    expect(html).not.toContain("doesn't work");
  });

  it("the refunded success surface offers no report opening and no re-send", () => {
    const view = buildReportSuccessView({
      state: "refunded",
      kind: "paid",
      identity: IDENTITY,
      email: BUYER,
      orderRef: INTENT,
    });
    const html = text(renderToStaticMarkup(createElement(ReportSuccessPage, { view })));
    expect(html).toContain("This order was refunded");
    expect(html).toContain("The money went back to the card that paid for it.");
    expect(html).not.toContain("View your report");
    expect(html).not.toContain("Send the email again");
    expect(html).not.toContain("Payment received");
  });
});
