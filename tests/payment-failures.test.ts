import { describe, expect, it } from "vitest";

import type { AddressResolution } from "../lib/address";
import { buildReportSuccessView } from "../lib/report-success";
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
  type FulfilmentClaimStore,
  type WebhookDeps,
} from "../lib/server/fulfilment";
import { startReportPayment } from "../lib/server/payment-intent";
import type { DeliverReportOutcome, ReportDeliveryService } from "../lib/server/report-delivery";
import { resendOrderDelivery } from "../lib/server/report-resend";

// T-PAY-02 to T-PAY-05 (plan step M9.7, its prep's
// gap 7): the failure-side pins of the payment
// contract, in the house pattern — memory stores, the
// fake translator, a capture delivery step. Their
// LIVE counterparts (a real decline card, the
// bank-approval detour walked and abandoned, the
// worker stopped and restarted, the mailer forced to
// fail against a real inbox) are rehearsals that wait
// on the founder-side live-proof preconditions, exactly
// as M9.6's did; nothing in this file claims them.

const EMAIL = "buyer@example.co.uk";
const POSTCODE = "CM3 2JT";
const HOME_KEY = "19||BIRKDALE RISE";
// (Assembled, not literal: the value is a throwaway
// test secret in the house pattern.)
const LIVE_SECRET = ["whsec", "live", "throwaway"].join("_");
const CONSENT = { ticked: true, timestamp: "2026-11-22T00:40:00.000Z" };
const RESOLUTION = { rung: 2, kind: "address-list" } as unknown as AddressResolution;

function eventPayload(input: {
  type: string;
  intentId: string;
  status: string;
  email?: string;
  // BUG-330 — the event's amount and currency are part
  // of the payload under test: the webhook refuses a
  // succeeded payment whose amount is not £4.99 in GBP.
  // The default is the genuine £4.99 payment the intent
  // route creates, so the existing pins keep the shape
  // they were written against.
  amount?: number | null;
  currency?: string | null;
}): string {
  return JSON.stringify({
    type: input.type,
    livemode: false,
    data: {
      object: {
        id: input.intentId,
        status: input.status,
        ...(input.amount === null ? {} : { amount: input.amount ?? 499 }),
        ...(input.currency === null ? {} : { currency: input.currency ?? "gbp" }),
        metadata: {
          email: input.email ?? EMAIL,
          postcode: POSTCODE,
          home_key: HOME_KEY,
          consent_tick: "true",
          consent_timestamp: CONSENT.timestamp,
        },
      },
    },
  });
}

function laneSet(payments: FakePayments): PaymentsLaneSet {
  return { payments, webhookConfigured: true, publishableKey: "pk_x" };
}

function webhookHarness() {
  const live = createFakePayments({ webhookSecret: LIVE_SECRET });
  const router = createPaymentsRouter({ live: laneSet(live), test: null, testEmails: [] });
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
  return { live, router, log, claims, paidEvents, deps };
}

// The worker over a given claim store, with a capture
// delivery step whose mail answer the case chooses.
function workerFor(claims: FulfilmentClaimStore, opts?: { mailSent?: boolean }) {
  const calls: { kind: string; email: string; orderRef: string | null }[] = [];
  const redeemed: string[] = [];
  const service = createFulfilmentService({
    claims,
    resolve: async () => RESOLUTION,
    buildPdf: async () => ({
      pdfKey: "reports/key.pdf",
      fileName: "Check My Next Home — 19 Birkdale Rise CM3 2JT.pdf",
      homeTitle: "19 Birkdale Rise",
      homeAddressLine: "19 Birkdale Rise, Hatfield Peverel CM3 2JT",
    }),
    deliver: async (input) => {
      calls.push({ kind: input.kind, email: input.email, orderRef: input.orderRef });
      return {
        delivery: { id: `delivery_${calls.length}` },
        downloadUrl: "https://example.test/download",
        mail: { sent: opts?.mailSent ?? true },
      } as unknown as DeliverReportOutcome;
    },
    redeemGift: async (token) => {
      redeemed.push(token);
    },
    recordDelivered: () => {},
    origin: "https://play.example.test",
  });
  return { service, calls, redeemed };
}

describe("T-PAY-02 — a payment that fails", () => {
  it("is logged, claims nothing, and a fresh start for the same home creates a new payment", async () => {
    const { live, router, log, claims, paidEvents, deps } = webhookHarness();
    const payload = eventPayload({
      type: "payment_intent.payment_failed",
      intentId: "pi_declined_1",
      status: "requires_payment_method",
    });
    const outcome = await processWebhookEvent(deps, {
      payload,
      signature: live.signWebhook(payload),
    });
    // Logged in the audit trail — and nothing else
    // moved: no claim, no funnel step.
    expect(outcome).toEqual({ kind: "logged" });
    expect(log.records).toEqual([
      expect.objectContaining({
        eventType: "payment_intent.payment_failed",
        intentId: "pi_declined_1",
      }),
    ]);
    expect(claims.claims.size).toBe(0);
    expect(paidEvents).toEqual([]);

    // The retry: a fresh start for the same home and
    // email creates a brand-new payment — the failure
    // left nothing behind that could block or confuse
    // it.
    const start = await startReportPayment(
      {
        payments: router,
        resolve: async () => ({ postcode: POSTCODE, homeKey: HOME_KEY, nation: "england" }),
      },
      { postcode: POSTCODE, homeKey: HOME_KEY, email: EMAIL, consent: CONSENT },
    );
    expect(start.ok).toBe(true);
    if (start.ok && "intentId" in start) {
      expect(start.intentId).toBe("pi_fake_1");
      expect(start.intentId).not.toBe("pi_declined_1");
    }
    expect(live.created).toHaveLength(1);
  });
});

describe("T-PAY-03 — two payments, both succeed", () => {
  it("makes two claims, and each fulfils exactly once", async () => {
    const { live, log, claims, deps } = webhookHarness();
    for (const intentId of ["pi_first", "pi_second"]) {
      const payload = eventPayload({
        type: "payment_intent.succeeded",
        intentId,
        status: "succeeded",
      });
      const outcome = await processWebhookEvent(deps, {
        payload,
        signature: live.signWebhook(payload),
      });
      expect(outcome).toEqual({ kind: "claimed" });
    }
    expect(claims.claims.size).toBe(2);
    expect(log.records).toHaveLength(2);

    const { service, calls } = workerFor(claims);
    await expect(service.runPending()).resolves.toEqual({
      processed: 2,
      fulfilled: 2,
      failed: 0,
    });
    expect(calls.map((call) => call.orderRef).sort()).toEqual(["pi_first", "pi_second"]);
    expect(claims.claims.get("pi_first")?.status).toBe("fulfilled");
    expect(claims.claims.get("pi_second")?.status).toBe("fulfilled");
    // Exactly once each: a second pass delivers nothing
    // more for either order.
    await expect(service.runPending()).resolves.toEqual({
      processed: 0,
      fulfilled: 0,
      failed: 0,
    });
    expect(calls).toHaveLength(2);
  });
});

describe("T-PAY-04 — the same success, delivered again and again", () => {
  it("claims once and fulfils once: every redelivery answers duplicate", async () => {
    const { live, log, claims, paidEvents, deps } = webhookHarness();
    const payload = eventPayload({
      type: "payment_intent.succeeded",
      intentId: "pi_redelivered",
      status: "succeeded",
    });
    const signature = live.signWebhook(payload);
    await expect(processWebhookEvent(deps, { payload, signature })).resolves.toEqual({
      kind: "claimed",
    });
    await expect(processWebhookEvent(deps, { payload, signature })).resolves.toEqual({
      kind: "duplicate",
    });

    const { service, calls } = workerFor(claims);
    await service.runPending();
    expect(calls).toHaveLength(1);
    expect(claims.claims.get("pi_redelivered")?.status).toBe("fulfilled");

    // Even after fulfilment, a late redelivery of the
    // same event changes nothing: still a duplicate,
    // still one claim, one delivery (and so one gift
    // issued inside it), one funnel step. Every arrival
    // IS in the audit log — the log is the trail, the
    // claim is the guard.
    await expect(processWebhookEvent(deps, { payload, signature })).resolves.toEqual({
      kind: "duplicate",
    });
    await expect(service.runPending()).resolves.toEqual({
      processed: 0,
      fulfilled: 0,
      failed: 0,
    });
    expect(claims.claims.size).toBe(1);
    expect(calls).toHaveLength(1);
    expect(paidEvents).toEqual(["checkout_paid"]);
    expect(log.records).toHaveLength(3);
  });
});

describe("T-PAY-05 — the report is ready but the email fails", () => {
  it("the claim stands fulfilled with mail unsent, the surface says so, and the re-send sends it", async () => {
    const { claims } = webhookHarness();
    await claims.claim({
      ref: "pi_nomail",
      kind: "paid",
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
    });
    const { service } = workerFor(claims, { mailSent: false });
    await service.runPending();
    const claim = claims.claims.get("pi_nomail");
    // The delivery happened; the email did not. Both
    // facts stand on the claim.
    expect(claim?.status).toBe("fulfilled");
    expect(claim?.deliveryId).toBe("delivery_1");
    expect(claim?.mailSent).toBe(false);

    // The success surface reads that truth: the ready
    // state's email card does NOT claim the email was
    // sent.
    const unsent = buildReportSuccessView({
      state: "ready",
      kind: "paid",
      identity: { kind: "postcode", postcode: POSTCODE, subline: null },
      email: EMAIL,
      mailSent: claim?.mailSent,
      orderRef: "pi_nomail",
    });
    expect(unsent.emailHeading).toBe("The email didn't go out");
    expect(unsent.emailLead).not.toContain("We've sent");
    expect(unsent.resendRef).toBe("pi_nomail");

    // The buyer re-send: the standing delivery's email
    // goes out again — and the claim's record follows
    // the fact.
    const resends: { deliveryId: string; origin: string }[] = [];
    const delivery = {
      resendDeliveryEmail: async (input: { deliveryId: string; origin: string }) => {
        resends.push(input);
        return { sent: true } as const;
      },
    } as unknown as ReportDeliveryService;
    const result = await resendOrderDelivery(
      { claims, delivery },
      { ref: "pi_nomail", origin: "https://play.example.test" },
    );
    expect(result).toEqual({ ok: true, sent: true });
    expect(resends).toEqual([{ deliveryId: "delivery_1", origin: "https://play.example.test" }]);
    expect(claims.claims.get("pi_nomail")?.mailSent).toBe(true);

    // And the surface now carries the sent wording
    // again — the truth, both ways.
    const sent = buildReportSuccessView({
      state: "ready",
      kind: "paid",
      identity: { kind: "postcode", postcode: POSTCODE, subline: null },
      email: EMAIL,
      mailSent: claims.claims.get("pi_nomail")?.mailSent,
      orderRef: "pi_nomail",
    });
    expect(sent.emailLead).toContain("We've sent");
  });

  it("the re-send refuses an order with no fulfilled delivery behind it", async () => {
    const { claims } = webhookHarness();
    await claims.claim({
      ref: "pi_waiting",
      kind: "paid",
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
    });
    const delivery = {
      resendDeliveryEmail: async () => ({ sent: true }) as const,
    } as unknown as ReportDeliveryService;
    await expect(
      resendOrderDelivery({ claims, delivery }, { ref: "pi_waiting", origin: "https://x.test" }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
    await expect(
      resendOrderDelivery({ claims, delivery }, { ref: "pi_unknown", origin: "https://x.test" }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
  });
});
