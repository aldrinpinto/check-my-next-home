import { describe, expect, it } from "vitest";

import type { AddressResolution } from "../lib/address";
import {
  createFakePayments,
  createPaymentsRouter,
  type FakePayments,
  type PaymentsLaneSet,
} from "../lib/server/payments";
import { createMemoryPaymentEventLog } from "../lib/server/payment-events";
import {
  createFulfilmentService,
  createMemoryFulfilmentClaimStore,
  processWebhookEvent,
  type WebhookDeps,
} from "../lib/server/fulfilment";
import type { DeliverReportOutcome } from "../lib/server/report-delivery";

// M9.6 — fulfilment: the webhook receiver's processing
// (verify → log → claim, Amendment A's order), the
// claim's exactly-once promise, and the worker's
// fulfilment of a claim end to end — over memory stores,
// a capture delivery step and a stub PDF step, the
// prep's provable-without-the-founder evidence. The live
// half (a genuine provider event through the Access
// bypass, a real inbox) is founder-gated and is NOT
// claimed by anything in this file.

const EMAIL = "buyer@example.co.uk";
const POSTCODE = "CM3 2JT";
const HOME_KEY = "19||BIRKDALE RISE";
const LIVE_SECRET = "whsec_live_throwaway";
const TEST_SECRET = "whsec_test_throwaway";

function eventPayload(input: {
  type: string;
  intentId: string;
  status: string;
  livemode?: boolean;
  test?: boolean;
  email?: string;
}): string {
  return JSON.stringify({
    type: input.type,
    ...(input.livemode === undefined ? {} : { livemode: input.livemode }),
    data: {
      object: {
        id: input.intentId,
        status: input.status,
        metadata: {
          email: input.email ?? EMAIL,
          postcode: POSTCODE,
          home_key: HOME_KEY,
          consent_tick: "true",
          consent_timestamp: "2026-11-22T00:40:00.000Z",
          ...(input.test ? { test: "true" } : {}),
        },
      },
    },
  });
}

function laneSet(payments: FakePayments): PaymentsLaneSet {
  return { payments, webhookConfigured: true, publishableKey: "pk_x" };
}

function webhookHarness(opts?: { testSet?: boolean }) {
  const live = createFakePayments({ webhookSecret: LIVE_SECRET });
  const test = createFakePayments({ webhookSecret: TEST_SECRET });
  const router = createPaymentsRouter({
    live: laneSet(live),
    test: opts?.testSet ? laneSet(test) : null,
    testEmails: [],
  });
  const log = createMemoryPaymentEventLog();
  const claims = createMemoryFulfilmentClaimStore();
  const paidEvents: string[] = [];
  const deps: WebhookDeps = {
    payments: router,
    log,
    claims,
    recordCheckoutPaid: () => {
      paidEvents.push("checkout_paid");
    },
  };
  return { live, test, log, claims, paidEvents, deps };
}

describe("processWebhookEvent — log first, claim once (Amendment A)", () => {
  it("refuses an unverifiable event and records nothing", async () => {
    const { deps, log, claims } = webhookHarness();
    const payload = eventPayload({
      type: "payment_intent.succeeded",
      intentId: "pi_1",
      status: "succeeded",
    });
    const outcome = await processWebhookEvent(deps, { payload, signature: "t=1,v1=deadbeef" });
    expect(outcome.kind).toBe("refused");
    expect(log.records).toHaveLength(0);
    expect(claims.claims.size).toBe(0);
  });

  it("logs a failed payment and claims nothing — failed payments are in the audit trail", async () => {
    const { deps, live, log, claims, paidEvents } = webhookHarness();
    const payload = eventPayload({
      type: "payment_intent.payment_failed",
      intentId: "pi_failed_1",
      status: "requires_payment_method",
      livemode: false,
    });
    const outcome = await processWebhookEvent(deps, {
      payload,
      signature: live.signWebhook(payload),
    });
    expect(outcome).toEqual({ kind: "logged" });
    expect(log.records).toEqual([
      expect.objectContaining({
        eventType: "payment_intent.payment_failed",
        intentId: "pi_failed_1",
        status: "requires_payment_method",
        email: EMAIL,
        postcode: POSTCODE,
        homeKey: HOME_KEY,
        livemode: false,
        // BUG-290 — a test-mode failure is a test order's
        // failure even where the payment carries no TEST
        // flag: the event's mode decides, not the metadata.
        testOrder: true,
      }),
    ]);
    expect(log.records[0]?.receivedAt).toBeInstanceOf(Date);
    expect(claims.claims.size).toBe(0);
    expect(paidEvents).toHaveLength(0);
  });

  it("claims a succeeded payment exactly once: a redelivery logs again but never re-claims", async () => {
    const { deps, live, log, claims, paidEvents } = webhookHarness();
    const payload = eventPayload({
      type: "payment_intent.succeeded",
      intentId: "pi_once_1",
      status: "succeeded",
      livemode: true,
    });
    const signature = live.signWebhook(payload);
    await expect(processWebhookEvent(deps, { payload, signature })).resolves.toEqual({
      kind: "claimed",
    });
    await expect(processWebhookEvent(deps, { payload, signature })).resolves.toEqual({
      kind: "duplicate",
    });
    // Every verified event is logged — both deliveries…
    expect(log.records).toHaveLength(2);
    // …but the claim, and the funnel's paid step, stand once.
    expect(claims.claims.size).toBe(1);
    expect(claims.claims.get("pi_once_1")).toEqual(
      expect.objectContaining({
        ref: "pi_once_1",
        kind: "paid",
        email: EMAIL,
        postcode: POSTCODE,
        homeKey: HOME_KEY,
        testOrder: false,
        status: "claimed",
      }),
    );
    expect(paidEvents).toEqual(["checkout_paid"]);
  });

  it("carries a test-mode event's mode and TEST flag into the log and the claim", async () => {
    const { deps, test, log, claims } = webhookHarness({ testSet: true });
    const payload = eventPayload({
      type: "payment_intent.succeeded",
      intentId: "pi_test_1",
      status: "succeeded",
      livemode: false,
      test: true,
      email: "tester@example.co.uk",
    });
    const outcome = await processWebhookEvent(deps, {
      payload,
      signature: test.signWebhook(payload),
    });
    expect(outcome).toEqual({ kind: "claimed" });
    expect(log.records[0]).toEqual(expect.objectContaining({ livemode: false, testOrder: true }));
    expect(claims.claims.get("pi_test_1")).toEqual(
      expect.objectContaining({ kind: "paid", testOrder: true }),
    );
  });

  it("a test-mode event without the TEST flag still reads as a test order (BUG-290)", async () => {
    // The defect itself: a buyer who is not on the
    // allowlist, paying on the sandbox keys, used to
    // read as a REAL order — the metadata carries no
    // TEST flag for them. The event's mode is the
    // provider's own statement, and it decides.
    const { deps, live, log, claims } = webhookHarness();
    const payload = eventPayload({
      type: "payment_intent.succeeded",
      intentId: "pi_test_unflagged_1",
      status: "succeeded",
      livemode: false,
      email: "buyer@example.co.uk",
    });
    const outcome = await processWebhookEvent(deps, {
      payload,
      signature: live.signWebhook(payload),
    });
    expect(outcome).toEqual({ kind: "claimed" });
    expect(log.records[0]).toEqual(expect.objectContaining({ livemode: false, testOrder: true }));
    expect(claims.claims.get("pi_test_unflagged_1")).toEqual(
      expect.objectContaining({ kind: "paid", testOrder: true }),
    );
  });

  it("a live-mode event carrying the TEST flag reads as a real order (BUG-290)", async () => {
    // Where the two signals disagree the money wins: a
    // live-mode payment is real money, whatever flag the
    // creation carried. (In production the two cannot
    // disagree — an allowlisted buyer always lands on
    // the test lane — but the rule must not depend on
    // that.)
    const { deps, live, log, claims } = webhookHarness();
    const payload = eventPayload({
      type: "payment_intent.succeeded",
      intentId: "pi_live_flagged_1",
      status: "succeeded",
      livemode: true,
      test: true,
      email: "tester@example.co.uk",
    });
    const outcome = await processWebhookEvent(deps, {
      payload,
      signature: live.signWebhook(payload),
    });
    expect(outcome).toEqual({ kind: "claimed" });
    expect(log.records[0]).toEqual(expect.objectContaining({ livemode: true, testOrder: false }));
    expect(claims.claims.get("pi_live_flagged_1")).toEqual(
      expect.objectContaining({ kind: "paid", testOrder: false }),
    );
  });

  it("an event without a mode falls back to the TEST flag (BUG-290)", async () => {
    // The provider always sets livemode; the fallback
    // exists only for an event that carries none.
    const { deps, live, log, claims } = webhookHarness();
    const flagged = eventPayload({
      type: "payment_intent.succeeded",
      intentId: "pi_nomode_flagged_1",
      status: "succeeded",
      test: true,
      email: "tester@example.co.uk",
    });
    await expect(
      processWebhookEvent(deps, { payload: flagged, signature: live.signWebhook(flagged) }),
    ).resolves.toEqual({ kind: "claimed" });
    expect(log.records[0]).toEqual(expect.objectContaining({ livemode: null, testOrder: true }));
    expect(claims.claims.get("pi_nomode_flagged_1")).toEqual(
      expect.objectContaining({ kind: "paid", testOrder: true }),
    );
    const unflagged = eventPayload({
      type: "payment_intent.succeeded",
      intentId: "pi_nomode_plain_1",
      status: "succeeded",
      email: "buyer@example.co.uk",
    });
    await expect(
      processWebhookEvent(deps, { payload: unflagged, signature: live.signWebhook(unflagged) }),
    ).resolves.toEqual({ kind: "claimed" });
    expect(log.records[1]).toEqual(expect.objectContaining({ livemode: null, testOrder: false }));
    expect(claims.claims.get("pi_nomode_plain_1")).toEqual(
      expect.objectContaining({ kind: "paid", testOrder: false }),
    );
  });

  it("a succeeded TYPE with an un-succeeded status claims nothing", async () => {
    const { deps, live, claims } = webhookHarness();
    const payload = eventPayload({
      type: "payment_intent.succeeded",
      intentId: "pi_odd_1",
      status: "processing",
    });
    const outcome = await processWebhookEvent(deps, {
      payload,
      signature: live.signWebhook(payload),
    });
    expect(outcome).toEqual({ kind: "logged" });
    expect(claims.claims.size).toBe(0);
  });
});

// ---------------------------------------------------------------

interface DeliveryCall {
  kind: string;
  email: string;
  orderRef: string;
}

const RESOLUTION = { rung: 2, kind: "address-list" } as unknown as AddressResolution;

function serviceHarness(opts?: { buildPdfFails?: boolean }) {
  const claims = createMemoryFulfilmentClaimStore();
  const calls: DeliveryCall[] = [];
  const redeemed: string[] = [];
  const deliveredEvents: string[] = [];
  const service = createFulfilmentService({
    claims,
    resolve: async () => RESOLUTION,
    buildPdf: async () => {
      if (opts?.buildPdfFails) throw new Error("printer down");
      return {
        pdfKey: "reports/key.pdf",
        fileName: "Check My Next Home — 19 Birkdale Rise CM3 2JT.pdf",
        homeTitle: "19 Birkdale Rise",
        homeAddressLine: "19 Birkdale Rise, Hatfield Peverel CM3 2JT",
      };
    },
    deliver: async (input) => {
      calls.push({ kind: input.kind, email: input.email, orderRef: input.orderRef });
      return {
        delivery: { id: `delivery_${calls.length}` },
        downloadUrl: "https://example.test/download",
        mail: { sent: true },
      } as unknown as DeliverReportOutcome;
    },
    redeemGift: async (token) => {
      redeemed.push(token);
    },
    recordDelivered: () => {
      deliveredEvents.push("report_delivered");
    },
    origin: "https://play.example.test",
  });
  return { claims, calls, redeemed, deliveredEvents, service };
}

describe("the fulfilment worker — claim to delivered report", () => {
  it("fulfils a paid claim end to end, exactly once", async () => {
    const { claims, calls, deliveredEvents, service } = serviceHarness();
    await claims.claim({
      ref: "pi_paid_1",
      kind: "paid",
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
    });
    await expect(service.runPending()).resolves.toEqual({
      processed: 1,
      fulfilled: 1,
      failed: 0,
    });
    expect(calls).toEqual([{ kind: "paid", email: EMAIL, orderRef: "pi_paid_1" }]);
    expect(claims.claims.get("pi_paid_1")).toEqual(
      expect.objectContaining({ status: "fulfilled", deliveryId: "delivery_1", mailSent: true }),
    );
    expect(deliveredEvents).toEqual(["report_delivered"]);
    // A second pass finds nothing waiting: no second
    // PDF, record, gift or email can follow.
    await expect(service.runPending()).resolves.toEqual({
      processed: 0,
      fulfilled: 0,
      failed: 0,
    });
    expect(calls).toHaveLength(1);
  });

  it("redeems a gifted claim's token at delivery — and only then", async () => {
    const { claims, redeemed, service } = serviceHarness();
    await claims.claim({
      ref: "gift_tok_1",
      kind: "gifted",
      email: "friend@example.co.uk",
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      giftToken: "gift_tok_1",
    });
    await service.runPending();
    expect(redeemed).toEqual(["gift_tok_1"]);
    expect(claims.claims.get("gift_tok_1")?.status).toBe("fulfilled");
  });

  it("fulfils a free-window claim through the same path", async () => {
    const { claims, calls, service } = serviceHarness();
    await claims.claim({
      ref: "free_abc",
      kind: "free",
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: null,
    });
    await service.runPending();
    expect(calls[0]?.kind).toBe("free");
    expect(claims.claims.get("free_abc")?.status).toBe("fulfilled");
  });

  it("records a failure with its reason and retries — until the attempt bound retires the claim", async () => {
    const { claims, service } = serviceHarness({ buildPdfFails: true });
    await claims.claim({
      ref: "pi_fail_1",
      kind: "paid",
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
    });
    await service.runPending();
    expect(claims.claims.get("pi_fail_1")).toEqual(
      expect.objectContaining({ status: "claimed", attempts: 1, lastError: "printer down" }),
    );
    await service.runPending();
    await service.runPending();
    expect(claims.claims.get("pi_fail_1")).toEqual(
      expect.objectContaining({ status: "failed", attempts: 3 }),
    );
    // Exhausted: no fourth attempt is ever listed.
    await expect(service.runPending()).resolves.toEqual({
      processed: 0,
      fulfilled: 0,
      failed: 0,
    });
  });
});

describe("the claim store — the retake and the mail flag (M9.7)", () => {
  it("reclaimFailed resets a FAILED claim to claimed, keeping its attempts and its last error", async () => {
    const { claims, service } = serviceHarness({ buildPdfFails: true });
    await claims.claim({
      ref: "gift_fail_1",
      kind: "gifted",
      email: "friend@example.co.uk",
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      giftToken: "gift_fail_1",
    });
    await service.runPending();
    await service.runPending();
    await service.runPending();
    expect(claims.claims.get("gift_fail_1")).toEqual(
      expect.objectContaining({ status: "failed", attempts: 3, lastError: "printer down" }),
    );

    await expect(claims.reclaimFailed("gift_fail_1")).resolves.toBe(true);
    // Back in the worker's queue — with the failure's
    // record intact on the row, not wiped by the retake.
    expect(claims.claims.get("gift_fail_1")).toEqual(
      expect.objectContaining({ status: "claimed", attempts: 3, lastError: "printer down" }),
    );
    const pending = await claims.pending(10);
    expect(pending.map((claim) => claim.ref)).toContain("gift_fail_1");
  });

  it("reclaimFailed answers false and changes nothing for a claim in any other state, or none", async () => {
    const { claims } = serviceHarness();
    await claims.claim({
      ref: "pi_live_1",
      kind: "paid",
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
    });
    await expect(claims.reclaimFailed("pi_live_1")).resolves.toBe(false);
    expect(claims.claims.get("pi_live_1")?.status).toBe("claimed");
    await expect(claims.reclaimFailed("no_such_ref")).resolves.toBe(false);
  });

  it("markMailSent moves a fulfilled claim's flag to true — and no other claim's", async () => {
    const { claims } = serviceHarness();
    await claims.claim({
      ref: "pi_done_1",
      kind: "paid",
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
    });
    await claims.markFulfilled("pi_done_1", { deliveryId: "delivery_1", mailSent: false });
    expect(claims.claims.get("pi_done_1")?.mailSent).toBe(false);
    await claims.markMailSent("pi_done_1");
    expect(claims.claims.get("pi_done_1")?.mailSent).toBe(true);

    await claims.claim({
      ref: "pi_waiting_1",
      kind: "paid",
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
    });
    await claims.markMailSent("pi_waiting_1");
    expect(claims.claims.get("pi_waiting_1")?.mailSent).toBeNull();
  });
});
