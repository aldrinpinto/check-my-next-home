import { describe, expect, it } from "vitest";

import type { AddressResolution } from "../lib/address";
import type { GiftRecord } from "../lib/gift";
import {
  createFulfilmentService,
  createMemoryFulfilmentClaimStore,
  processWebhookEvent,
  type FulfilmentClaimStore,
  type WebhookDeps,
} from "../lib/server/fulfilment";
import type { NoticeMailer } from "../lib/server/notice-mailer";
import { findOrders, ownerResendOrder, type OrderAdminDeps } from "../lib/server/order-admin";
import { createOrderNotices } from "../lib/server/order-notices";
import { createMemoryOrderStore } from "../lib/server/orders";
import type { OwnerMailer } from "../lib/server/owner-mailer";
import { createMemoryPaymentEventLog } from "../lib/server/payment-events";
import {
  createFakePayments,
  createPaymentsRouter,
  type FakePayments,
  type PaymentsLaneSet,
} from "../lib/server/payments";
import { createMemoryDeliveryStore } from "../lib/server/report-deliveries";
import type { DeliverReportOutcome, ReportDeliveryService } from "../lib/server/report-delivery";
import { createMemoryRefundStore } from "../lib/server/refunds";
import type { ReportPdfStore } from "../lib/server/report-storage";

// M9.10 — order emails and records: the order record
// written at the claim (the consent pair threaded from
// the verified event — T-PAY-06 extended from metadata
// to record), the sale alert at fulfilment (exactly
// once, the stored PDF attached), the failed-payment
// email (Sample 40, once per intent, never after a
// same-intent success), the terminal-failure pair
// (Sample 41 to paid buyers only, the owner alert for
// every kind, retried after a notice-send failure),
// the gift-claimed email at the bind (Sample 42), and
// the owner lookup-and-resend (verification recorded,
// the withdrawal refusal inherited). Memory stores,
// capture mailers, the fake translator — the house
// pattern. The LIVE half (a real test-lane purchase
// producing a real sale alert in the project inbox)
// runs after deploy, as M9.8's live proof did, and is
// NOT claimed by anything in this file.

const EMAIL = "buyer@example.co.uk";
const POSTCODE = "CM3 2JT";
const HOME_KEY = "19||BIRKDALE RISE";
const HOME_TITLE = "19 Birkdale Rise";
const ADDRESS_LINE = "19 Birkdale Rise, Hatfield Peverel CM3 2JT";
const FILE_NAME = "Check My Next Home — 19 Birkdale Rise CM3 2JT.pdf";
const ORIGIN = "https://play.example.test";
const LIVE_SECRET = ["whsec", "live", "throwaway"].join("_");
const CONSENT_TIMESTAMP = "2026-11-22T00:40:00.000Z";
const RESOLUTION = { rung: 2, kind: "address-list" } as unknown as AddressResolution;
const PDF_BYTES = new TextEncoder().encode("%PDF-the-stored-report");

function eventPayload(input: {
  type: string;
  intentId: string;
  status: string;
  test?: boolean;
  // BUG-290 — the event's mode is part of the payload
  // under test: a test order's event is test-mode. The
  // default stays live, so the existing pins keep the
  // shape they were written against.
  livemode?: boolean;
}): string {
  return JSON.stringify({
    type: input.type,
    livemode: input.livemode ?? true,
    data: {
      object: {
        id: input.intentId,
        status: input.status,
        metadata: {
          email: EMAIL,
          postcode: POSTCODE,
          home_key: HOME_KEY,
          consent_tick: "true",
          consent_timestamp: CONSENT_TIMESTAMP,
          ...(input.test ? { test: "true" } : {}),
        },
      },
    },
  });
}

function laneSet(payments: FakePayments): PaymentsLaneSet {
  return { payments, webhookConfigured: true, publishableKey: "pk_x" };
}

// ------------------------------------------------------------
// Capture mailers

function captureOwnerMailer() {
  const saleAlerts: { subject: string; text: string; fileName: string; bytes: Uint8Array }[] = [];
  const failureAlerts: { subject: string; text: string }[] = [];
  const state = { failSale: false, failFailure: false };
  const mailer: OwnerMailer = {
    sendSaleAlert: async (input) => {
      if (state.failSale) return { sent: false, reason: "resend-500" };
      saleAlerts.push({
        subject: input.email.subject,
        text: input.email.text,
        fileName: input.attachment.fileName,
        bytes: input.attachment.bytes,
      });
      return { sent: true };
    },
    sendFailureAlert: async (input) => {
      if (state.failFailure) return { sent: false, reason: "resend-500" };
      failureAlerts.push({ subject: input.email.subject, text: input.email.text });
      return { sent: true };
    },
  };
  return { mailer, saleAlerts, failureAlerts, state };
}

function captureNoticeMailer() {
  const paymentFailed: { to: string; subject: string; text: string }[] = [];
  const fulfilmentFailure: { to: string; subject: string; text: string }[] = [];
  const giftClaimed: { to: string; subject: string; text: string }[] = [];
  const state = { failAll: false };
  const record =
    (list: { to: string; subject: string; text: string }[]) =>
    async (input: { to: string; email: { subject: string; text: string } }) => {
      if (state.failAll) return { sent: false, reason: "resend-500" };
      list.push({ to: input.to, subject: input.email.subject, text: input.email.text });
      return { sent: true } as const;
    };
  const mailer: NoticeMailer = {
    sendPaymentFailedEmail: record(paymentFailed),
    sendFulfilmentFailureEmail: record(fulfilmentFailure),
    sendGiftClaimedEmail: record(giftClaimed),
  };
  return { mailer, paymentFailed, fulfilmentFailure, giftClaimed, state };
}

// ------------------------------------------------------------
// The world: one set of shelves, the webhook over them,
// the worker over them, the notices joining both.

function orderWorld() {
  const live = createFakePayments({ webhookSecret: LIVE_SECRET });
  const router = createPaymentsRouter({ live: laneSet(live), test: null, testEmails: [] });
  const log = createMemoryPaymentEventLog();
  const claims = createMemoryFulfilmentClaimStore();
  const orders = createMemoryOrderStore();
  const deliveries = createMemoryDeliveryStore();
  const owner = captureOwnerMailer();
  const notice = captureNoticeMailer();
  const pdfStore: ReportPdfStore = {
    put: async () => ({ stored: true }),
    get: async (key) => (key === "reports/key.pdf" ? PDF_BYTES : null),
  };
  const notices = createOrderNotices({
    orders,
    claims,
    deliveries,
    pdfStore,
    ownerMailer: owner.mailer,
    noticeMailer: notice.mailer,
    resolveIdentity: async () => ({
      kind: "home",
      subject: HOME_TITLE,
      subline: "Hatfield Peverel, CM3 2JT",
      postcode: POSTCODE,
      homeKey: HOME_KEY,
    }),
    origin: ORIGIN,
  });
  const webhookDeps: WebhookDeps = {
    payments: router,
    log,
    claims,
    recordCheckoutPaid: () => {},
    orders,
    failedPaymentNotice: (input) => notices.failedPayment(input),
  };

  function makeWorker(opts?: {
    failBuild?: boolean;
    maxAttempts?: number;
    stopRefunded?: boolean;
  }) {
    return createFulfilmentService({
      claims,
      resolve: async () => RESOLUTION,
      buildPdf: async () => {
        if (opts?.failBuild) throw new Error("compose-broken");
        return {
          pdfKey: "reports/key.pdf",
          fileName: FILE_NAME,
          homeTitle: HOME_TITLE,
          homeAddressLine: ADDRESS_LINE,
        };
      },
      deliver: async (input) => {
        const delivery = await deliveries.record({
          email: input.email,
          kind: input.kind,
          pdfKey: input.pdfKey,
          fileName: input.fileName,
          homeTitle: input.homeTitle,
          homeAddressLine: input.homeAddressLine,
          orderRef: input.orderRef,
        });
        return {
          delivery,
          downloadUrl: "https://example.test/download",
          mail: { sent: true },
        } as DeliverReportOutcome;
      },
      redeemGift: async () => {},
      stopCheck: opts?.stopRefunded ? async () => "refunded" : undefined,
      recordDelivered: () => {},
      orderNotices: notices,
      maxAttempts: opts?.maxAttempts,
      origin: ORIGIN,
    });
  }

  return { live, log, claims, orders, deliveries, owner, notice, notices, webhookDeps, makeWorker };
}

async function succeeded(
  world: ReturnType<typeof orderWorld>,
  intentId: string,
  test?: boolean,
  livemode?: boolean,
) {
  const payload = eventPayload({
    type: "payment_intent.succeeded",
    intentId,
    status: "succeeded",
    test,
    livemode,
  });
  return processWebhookEvent(world.webhookDeps, {
    payload,
    signature: world.live.signWebhook(payload),
  });
}

async function failed(world: ReturnType<typeof orderWorld>, intentId: string) {
  const payload = eventPayload({
    type: "payment_intent.payment_failed",
    intentId,
    status: "requires_payment_method",
  });
  return processWebhookEvent(world.webhookDeps, {
    payload,
    signature: world.live.signWebhook(payload),
  });
}

// ------------------------------------------------------------

describe("the order record — written at the claim, from the verified event", () => {
  it("carries the consent pair, the pinned amount and the order's facts (T-PAY-06, extended)", async () => {
    const world = orderWorld();
    await expect(succeeded(world, "pi_record_1")).resolves.toEqual({ kind: "claimed" });
    const order = await world.orders.getByRef("pi_record_1");
    expect(order).toEqual(
      expect.objectContaining({
        ref: "pi_record_1",
        kind: "paid",
        email: EMAIL,
        postcode: POSTCODE,
        homeKey: HOME_KEY,
        amount: 499,
        currency: "gbp",
        providerRef: "pi_record_1",
        consentTick: true,
        consentTimestamp: CONSENT_TIMESTAMP,
        deliveryId: null,
        refundStatus: "none",
        testOrder: false,
        saleAlertSentAt: null,
        failureNoticeSentAt: null,
      }),
    );
  });

  it("marks a test-lane order as a test order, so test sales never read as real ones (R6)", async () => {
    const world = orderWorld();
    // BUG-290 — the old payload was an impossible
    // combination (a live-mode event carrying the TEST
    // flag); a test order's event is test-mode, so the
    // payload carries livemode false, as the provider
    // would send it.
    await succeeded(world, "pi_record_test", true, false);
    expect((await world.orders.getByRef("pi_record_test"))?.testOrder).toBe(true);
  });

  it("a redelivered success leaves the one record standing, unchanged", async () => {
    const world = orderWorld();
    await succeeded(world, "pi_record_2");
    await expect(succeeded(world, "pi_record_2")).resolves.toEqual({ kind: "duplicate" });
    expect(await world.orders.findByEmail(EMAIL)).toHaveLength(1);
  });

  it("gifted and free records stand with their money fields honestly empty", async () => {
    const world = orderWorld();
    const gifted = await world.orders.recordClaim({
      ref: "gift_token_1",
      kind: "gifted",
      email: "friend@example.co.uk",
      postcode: POSTCODE,
      homeKey: HOME_KEY,
    });
    expect(gifted).toEqual(
      expect.objectContaining({
        amount: null,
        currency: null,
        providerRef: null,
        consentTick: null,
      }),
    );
    const free = await world.orders.recordClaim({
      ref: "free_1",
      kind: "free",
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: null,
    });
    expect(free.amount).toBeNull();
    // The lookups the ops tool runs: by email
    // (normalised) and by postcode (either case).
    expect((await world.orders.findByEmail("  BUYER@example.co.uk ")).map((o) => o.ref)).toEqual([
      "free_1",
    ]);
    expect((await world.orders.findByEmail("friend@example.co.uk")).map((o) => o.ref)).toEqual([
      "gift_token_1",
    ]);
    expect((await world.orders.findByPostcode("cm3 2jt")).map((o) => o.ref).sort()).toEqual([
      "free_1",
      "gift_token_1",
    ]);
  });
});

describe("the sale alert — at fulfilment, exactly once, the stored PDF attached", () => {
  it("fires once across a duplicated webhook and worker re-runs, with the stored bytes", async () => {
    const world = orderWorld();
    await succeeded(world, "pi_sale_1");
    await succeeded(world, "pi_sale_1"); // the redelivery
    const worker = world.makeWorker();
    await worker.runPending();
    await worker.runPending(); // the re-run

    expect(world.owner.saleAlerts).toHaveLength(1);
    const alert = world.owner.saleAlerts[0];
    expect(alert?.subject).toBe(`New report sale — ${HOME_TITLE}`);
    expect(alert?.fileName).toBe(FILE_NAME);
    // The attachment is the STORED PDF's own bytes —
    // the very array the store holds, never a
    // regeneration.
    expect(alert?.bytes).toBe(PDF_BYTES);
    expect(alert?.text).toContain(EMAIL);
    expect(alert?.text).toContain("£4.99");
    expect(alert?.text).toContain("pi_sale_1");

    const order = await world.orders.getByRef("pi_sale_1");
    expect(order?.saleAlertSentAt).toBeInstanceOf(Date);
    expect(order?.deliveryId).not.toBeNull();
    // The delivery stands in the order's log.
    expect(await world.orders.listDeliveryLog("pi_sale_1")).toEqual([
      expect.objectContaining({ kind: "delivery", sent: true }),
    ]);
  });

  it("a failed alert send leaves the marker unset, and the next pass's sweep sends it — still once", async () => {
    const world = orderWorld();
    await succeeded(world, "pi_sale_2");
    const worker = world.makeWorker();
    world.owner.state.failSale = true;
    await worker.runPending();
    expect(world.owner.saleAlerts).toHaveLength(0);
    expect((await world.orders.getByRef("pi_sale_2"))?.saleAlertSentAt).toBeNull();

    world.owner.state.failSale = false;
    await worker.runPending();
    expect(world.owner.saleAlerts).toHaveLength(1);
    await worker.runPending();
    expect(world.owner.saleAlerts).toHaveLength(1);
  });

  it("never fires for a declined payment, a refused event, or a refund-stopped claim", async () => {
    const world = orderWorld();
    await failed(world, "pi_sale_declined");
    const payload = eventPayload({
      type: "payment_intent.succeeded",
      intentId: "pi_sale_forged",
      status: "succeeded",
    });
    await processWebhookEvent(world.webhookDeps, { payload, signature: "t=1,v1=deadbeef" });
    await succeeded(world, "pi_sale_refunded");
    const worker = world.makeWorker({ stopRefunded: true });
    await worker.runPending();
    expect(world.claims.claims.get("pi_sale_refunded")?.status).toBe("refunded");
    expect(world.owner.saleAlerts).toHaveLength(0);
  });

  it("a gifted fulfilment writes its record at delivery (the backfill) and sends no sale alert", async () => {
    const world = orderWorld();
    await world.claims.claim({
      ref: "gift_token_2",
      kind: "gifted",
      email: "friend@example.co.uk",
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      giftToken: "gift_token_2",
    });
    await world.makeWorker().runPending();
    const order = await world.orders.getByRef("gift_token_2");
    expect(order).toEqual(
      expect.objectContaining({ kind: "gifted", amount: null, deliveryId: expect.any(String) }),
    );
    expect(world.owner.saleAlerts).toHaveLength(0);
  });
});

describe("the failed-payment email — Sample 40, once per intent", () => {
  it("fires on the first failure only: redeliveries and repeat failures on one payment send nothing more", async () => {
    const world = orderWorld();
    await failed(world, "pi_fail_1");
    await failed(world, "pi_fail_1"); // the provider's redelivery
    await failed(world, "pi_fail_1"); // a second, distinct failure
    expect(world.notice.paymentFailed).toHaveLength(1);
    const email = world.notice.paymentFailed[0];
    expect(email?.to).toBe(EMAIL);
    expect(email?.subject).toBe("Your payment didn't go through");
    expect(email?.text).toContain("You have not been charged");
    expect(email?.text).toContain(ADDRESS_LINE);
    expect(email?.text).toContain(`${ORIGIN}/search/home?postcode=CM3`);
    // A different payment failing is a different lost
    // sale: it gets its own email.
    await failed(world, "pi_fail_2");
    expect(world.notice.paymentFailed).toHaveLength(2);
  });

  it("never fires after a success on the same payment — the failure is a paid order's later chapter", async () => {
    const world = orderWorld();
    await succeeded(world, "pi_fail_after_success");
    await failed(world, "pi_fail_after_success");
    expect(world.notice.paymentFailed).toHaveLength(0);
  });
});

describe("the failure pair — at terminal failure, Sample 41 to paid buyers only", () => {
  it("fires once for a paid order: the buyer email and the owner alert, under one marker", async () => {
    const world = orderWorld();
    await succeeded(world, "pi_broken_1");
    const worker = world.makeWorker({ failBuild: true, maxAttempts: 1 });
    await worker.runPending();
    expect(world.claims.claims.get("pi_broken_1")?.status).toBe("failed");

    expect(world.notice.fulfilmentFailure).toHaveLength(1);
    const buyerEmail = world.notice.fulfilmentFailure[0];
    expect(buyerEmail?.to).toBe(EMAIL);
    expect(buyerEmail?.subject).toBe(
      `We're sorry — we couldn't make your report for ${HOME_TITLE}`,
    );
    expect(buyerEmail?.text).toContain("Your payment of £4.99 went through");
    expect(buyerEmail?.text).toContain(ADDRESS_LINE);

    expect(world.owner.failureAlerts).toHaveLength(1);
    expect(world.owner.failureAlerts[0]?.subject).toBe(`A report couldn't be made — ${HOME_TITLE}`);
    expect(world.owner.failureAlerts[0]?.text).toContain("compose-broken");

    expect((await world.orders.getByRef("pi_broken_1"))?.failureNoticeSentAt).toBeInstanceOf(Date);
    // A later pass re-fires nothing.
    await worker.runPending();
    expect(world.notice.fulfilmentFailure).toHaveLength(1);
    expect(world.owner.failureAlerts).toHaveLength(1);
  });

  it("a gifted order's terminal failure alerts the owner and emails no buyer", async () => {
    const world = orderWorld();
    await world.claims.claim({
      ref: "gift_token_3",
      kind: "gifted",
      email: "friend@example.co.uk",
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      giftToken: "gift_token_3",
    });
    await world.makeWorker({ failBuild: true, maxAttempts: 1 }).runPending();
    expect(world.owner.failureAlerts).toHaveLength(1);
    expect(world.notice.fulfilmentFailure).toHaveLength(0);
    expect((await world.orders.getByRef("gift_token_3"))?.failureNoticeSentAt).toBeInstanceOf(Date);
  });

  it("a failure with attempts left is silent — only the terminal failure speaks", async () => {
    const world = orderWorld();
    await succeeded(world, "pi_broken_2");
    await world.makeWorker({ failBuild: true, maxAttempts: 3 }).runPending();
    expect(world.claims.claims.get("pi_broken_2")?.status).toBe("claimed");
    expect(world.owner.failureAlerts).toHaveLength(0);
    expect(world.notice.fulfilmentFailure).toHaveLength(0);
  });

  it("a notice-send failure leaves the marker unset; the sweep retries the pair", async () => {
    const world = orderWorld();
    await succeeded(world, "pi_broken_3");
    const worker = world.makeWorker({ failBuild: true, maxAttempts: 1 });
    world.owner.state.failFailure = true;
    await worker.runPending();
    // The owner alert failed, so the pair did not land:
    // no marker, and the buyer email (sent after the
    // owner alert) never went.
    expect(world.owner.failureAlerts).toHaveLength(0);
    expect(world.notice.fulfilmentFailure).toHaveLength(0);
    expect((await world.orders.getByRef("pi_broken_3"))?.failureNoticeSentAt).toBeNull();

    world.owner.state.failFailure = false;
    await worker.runPending();
    expect(world.owner.failureAlerts).toHaveLength(1);
    expect(world.notice.fulfilmentFailure).toHaveLength(1);
    expect((await world.orders.getByRef("pi_broken_3"))?.failureNoticeSentAt).toBeInstanceOf(Date);
  });
});

describe("the gift-claimed email — Sample 42, at the bind", () => {
  const GIFT = {
    token: "gift_token_9",
    buyerEmail: EMAIL,
    claimantEmail: "friend@example.co.uk",
    status: "claimed",
    orderRef: "pi_gift_issuer",
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    claimedAt: new Date(),
    redeemedAt: null,
    voidedAt: null,
    pendingEmail: null,
    pendingToken: null,
    pendingSentAt: null,
  } as unknown as GiftRecord;

  it("tells the buyer their gift was claimed, naming the issuing order's home", async () => {
    const world = orderWorld();
    await world.deliveries.record({
      email: EMAIL,
      kind: "paid",
      pdfKey: "reports/key.pdf",
      fileName: FILE_NAME,
      homeTitle: HOME_TITLE,
      homeAddressLine: ADDRESS_LINE,
      orderRef: "pi_gift_issuer",
    });
    await world.notices.giftClaimed(GIFT);
    expect(world.notice.giftClaimed).toHaveLength(1);
    const email = world.notice.giftClaimed[0];
    expect(email?.to).toBe(EMAIL);
    expect(email?.subject).toBe("Your Check Together gift has been claimed");
    expect(email?.text).toContain(HOME_TITLE);
  });

  it("a failed send changes nothing and throws nothing — a courtesy, with no retry machinery", async () => {
    const world = orderWorld();
    world.notice.state.failAll = true;
    await expect(world.notices.giftClaimed(GIFT)).resolves.toBeUndefined();
    // And a gift with no issuing order stands behind
    // it sends nothing at all.
    world.notice.state.failAll = false;
    await world.notices.giftClaimed({ ...GIFT, orderRef: null });
    expect(world.notice.giftClaimed).toHaveLength(0);
  });
});

describe("the owner lookup and re-send — verification recorded, refusal inherited", () => {
  async function deliveredWorld(opts?: { withdrawn?: boolean; mailSent?: boolean }) {
    const world = orderWorld();
    await succeeded(world, "pi_support_1");
    await world.makeWorker().runPending();
    const claim = world.claims.claims.get("pi_support_1");
    const resendCalls: { deliveryId: string; origin: string }[] = [];
    const delivery = {
      resendDeliveryEmail: async (input: { deliveryId: string; origin: string }) => {
        resendCalls.push(input);
        if (opts?.withdrawn) return null;
        return opts?.mailSent === false
          ? { sent: false, reason: "resend-500" }
          : { sent: true as const };
      },
    } as unknown as ReportDeliveryService;
    const deps: OrderAdminDeps = {
      orders: world.orders,
      claims: world.claims,
      deliveries: world.deliveries,
      refunds: createMemoryRefundStore(),
      refundCheck: { completedFullRefund: async () => false },
      delivery,
    };
    return { world, deps, claim, resendCalls };
  }

  it("the lookup reads the order's whole standing across the shelves", async () => {
    const { deps } = await deliveredWorld();
    const summaries = await findOrders(deps, { email: EMAIL });
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.order.ref).toBe("pi_support_1");
    expect(summaries[0]?.claim?.status).toBe("fulfilled");
    expect(summaries[0]?.deliveries).toHaveLength(1);
    expect(summaries[0]?.refundedInFull).toBe(false);
    expect(summaries[0]?.log).toEqual([expect.objectContaining({ kind: "delivery", sent: true })]);
  });

  it("a verified requester gets the standing delivery's email again — and the log shows it", async () => {
    const { world, deps, claim, resendCalls } = await deliveredWorld();
    const result = await ownerResendOrder(deps, {
      ref: "pi_support_1",
      requesterEmail: "  BUYER@example.co.uk ",
      origin: ORIGIN,
    });
    expect(result).toEqual({ ok: true, sent: true });
    // The seam was driven with the order's OWN
    // delivery — the identical stored report, to the
    // order's own address (the service reads it from
    // the delivery; this module took no address).
    expect(resendCalls).toEqual([{ deliveryId: claim?.deliveryId, origin: ORIGIN }]);
    const log = await world.orders.listDeliveryLog("pi_support_1");
    expect(log[log.length - 1]).toEqual(
      expect.objectContaining({ kind: "owner-resend", sent: true }),
    );
  });

  it("an unverified requester is refused before any send — and the refusal is logged", async () => {
    const { world, deps, resendCalls } = await deliveredWorld();
    const result = await ownerResendOrder(deps, {
      ref: "pi_support_1",
      requesterEmail: "someone-else@example.co.uk",
      origin: ORIGIN,
    });
    expect(result).toEqual({ ok: false, reason: "requester-not-verified" });
    expect(resendCalls).toHaveLength(0);
    const log = await world.orders.listDeliveryLog("pi_support_1");
    expect(log[log.length - 1]).toEqual(
      expect.objectContaining({
        kind: "owner-resend",
        sent: false,
        detail: "requester-not-verified",
      }),
    );
  });

  it("a refunded order's withdrawn delivery cannot be resent (M9.8's refusal, inherited)", async () => {
    const { world, deps } = await deliveredWorld({ withdrawn: true });
    const result = await ownerResendOrder(deps, {
      ref: "pi_support_1",
      requesterEmail: EMAIL,
      origin: ORIGIN,
    });
    expect(result).toEqual({ ok: false, reason: "not-found" });
    const log = await world.orders.listDeliveryLog("pi_support_1");
    expect(log[log.length - 1]).toEqual(
      expect.objectContaining({ kind: "owner-resend", sent: false, detail: "not-found" }),
    );
  });

  it("a failed send is answered and logged as failed; an unknown order is refused plainly", async () => {
    const { world, deps } = await deliveredWorld({ mailSent: false });
    await expect(
      ownerResendOrder(deps, { ref: "pi_support_1", requesterEmail: EMAIL, origin: ORIGIN }),
    ).resolves.toEqual({ ok: true, sent: false });
    const log = await world.orders.listDeliveryLog("pi_support_1");
    expect(log[log.length - 1]).toEqual(
      expect.objectContaining({ kind: "owner-resend", sent: false, detail: "resend-500" }),
    );
    await expect(
      ownerResendOrder(deps, { ref: "pi_missing", requesterEmail: EMAIL, origin: ORIGIN }),
    ).resolves.toEqual({ ok: false, reason: "order-not-found" });
  });
});
