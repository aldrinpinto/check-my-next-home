import { createHmac } from "node:crypto";

import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import { REPORT_PRICE_PENCE } from "../lib/site";
import {
  createFakePayments,
  createStripePayments,
  createUnconfiguredPayments,
  getPayments,
  paymentPublishableKey,
  PAYMENT_CURRENCY,
  type Payments,
  type StripeClientSlice,
} from "../lib/server/payments";

// M9.4/M9.5 — the payments translator
// (lib/server/payments.ts): the seam's contract, proven
// against the fake and against the Stripe adapter. The
// adapter's intent calls run against a recording stub
// of the provider's client (no network, no key); its
// webhook verification runs against the REAL provider
// package — signature verification is local
// cryptography, proven with the provider's documented
// test-header generator and with a header built by hand
// from the documented scheme (an HMAC-SHA256 of
// "<timestamp>.<payload>"). M9.5's consent (tick +
// timestamp) rides through the same contract: created
// with the intent, carried in its metadata, read back
// from the verified event (T-PAY-06).
//
// No real key value appears anywhere in this suite: the
// keys below are throwaway strings, and the sandbox
// proof against the real service was the parent's
// API-level run, not this suite's.

const EMAIL = "buyer@example.co.uk";
const POSTCODE = "CM3 2JT";
const HOME_KEY = "19||BIRKDALE RISE";
const WEBHOOK_SECRET = "whsec_throwaway_test_secret";
const CONSENT = { ticked: true, timestamp: "2026-11-22T00:40:00.000Z" };

function succeededPayload(intentId: string): string {
  return JSON.stringify({
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: intentId,
        status: "succeeded",
        metadata: {
          email: EMAIL,
          postcode: POSTCODE,
          home_key: HOME_KEY,
          consent_tick: "true",
          consent_timestamp: CONSENT.timestamp,
        },
      },
    },
  });
}

// A recording stub of the provider's client slice: it
// answers the way the provider would and remembers
// every call, so the adapter's half of the contract —
// the amount, the currency, the metadata — is read back
// from what the adapter actually sent.
function stubClient() {
  const created: Record<string, unknown>[] = [];
  const client: StripeClientSlice = {
    paymentIntents: {
      async create(params) {
        created.push(params);
        return {
          id: "pi_stub_1",
          client_secret: "pi_stub_1_secret_stub",
          status: "requires_confirmation",
        };
      },
      async retrieve(id) {
        return { id, status: "succeeded" };
      },
    },
    webhooks: {
      constructEvent() {
        throw new Error("the stub never verifies — the real package does, below");
      },
    },
  };
  return { client, created };
}

describe("payments translator — the unconfigured seam", () => {
  it("answers not-configured on every method, never throws", async () => {
    const payments = createUnconfiguredPayments();
    await expect(
      payments.createReportIntent({
        email: EMAIL,
        postcode: POSTCODE,
        homeKey: HOME_KEY,
        consent: CONSENT,
      }),
    ).resolves.toEqual({ ok: false, reason: "not-configured" });
    await expect(payments.intentStatus("pi_anything")).resolves.toEqual({
      ok: false,
      reason: "not-configured",
    });
    expect(payments.verifyWebhookEvent({ payload: "{}", signature: "t=1,v1=x" })).toEqual({
      ok: false,
      reason: "not-configured",
    });
  });
});

describe("payments translator — the factory and the publishable key", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("selects the unconfigured seam when no payment key is placed", async () => {
    vi.stubEnv("PAYMENT_API_KEY", "");
    const payments = getPayments();
    await expect(payments.intentStatus("pi_anything")).resolves.toEqual({
      ok: false,
      reason: "not-configured",
    });
  });

  it("fails webhook verification closed when the key is placed but the webhook secret is not", () => {
    vi.stubEnv("PAYMENT_API_KEY", "sk_test_throwaway");
    vi.stubEnv("PAYMENT_WEBHOOK_SECRET", "");
    const payments = getPayments();
    expect(payments.verifyWebhookEvent({ payload: "{}", signature: "t=1,v1=x" })).toEqual({
      ok: false,
      reason: "not-configured",
    });
  });

  it("reads the publishable key from the environment, null when absent or empty", () => {
    expect(paymentPublishableKey({})).toBeNull();
    expect(paymentPublishableKey({ PAYMENT_PUBLISHABLE_KEY: "" })).toBeNull();
    expect(paymentPublishableKey({ PAYMENT_PUBLISHABLE_KEY: "pk_test_throwaway" })).toBe(
      "pk_test_throwaway",
    );
  });
});

// The contract, run against both implementations: start
// a payment for the one price with the home's identity
// and the delivery email attached; read its status back;
// verify a properly signed success event; refuse a
// tampered one.
function contractSuite(
  name: string,
  make: () => { payments: Payments; sign: (payload: string) => string },
) {
  describe(`payments translator — the contract (${name})`, () => {
    it("creates a payment for the one price and reads its status back", async () => {
      const { payments } = make();
      const created = await payments.createReportIntent({
        email: EMAIL,
        postcode: POSTCODE,
        homeKey: HOME_KEY,
        consent: CONSENT,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.clientSecret).toContain(created.intentId);
      const status = await payments.intentStatus(created.intentId);
      expect(status).toEqual({
        ok: true,
        intentId: created.intentId,
        status: expect.any(String),
        // M9.7: the read-back carries the payment's
        // metadata too — the order-state reading decides
        // from it. The exact bag is implementation
        // territory (the stub holds none, the fake
        // composes the creation's), pinned exactly in
        // the fake's own suite below.
        metadata: expect.any(Object),
      });
    });

    it("verifies a properly signed success event and reads its identity back", async () => {
      const { payments, sign } = make();
      const created = await payments.createReportIntent({
        email: EMAIL,
        postcode: POSTCODE,
        homeKey: HOME_KEY,
        consent: CONSENT,
      });
      if (!created.ok) throw new Error("creation failed inside the contract");
      const payload = succeededPayload(created.intentId);
      const verdict = payments.verifyWebhookEvent({ payload, signature: sign(payload) });
      expect(verdict).toEqual({
        ok: true,
        type: "payment_intent.succeeded",
        intentId: created.intentId,
        status: "succeeded",
        livemode: null,
        metadata: {
          email: EMAIL,
          postcode: POSTCODE,
          home_key: HOME_KEY,
          consent_tick: "true",
          consent_timestamp: CONSENT.timestamp,
        },
      });
    });

    it("refuses a tampered payload and a signature under the wrong secret", async () => {
      const { payments, sign } = make();
      const payload = succeededPayload("pi_contract_1");
      const signature = sign(payload);
      const tampered = payload.replace("succeeded", "requires_payment_method");
      expect(payments.verifyWebhookEvent({ payload: tampered, signature }).ok).toBe(false);
      expect(payments.verifyWebhookEvent({ payload, signature: "t=1,v1=deadbeef" }).ok).toBe(false);
    });
  });
}

contractSuite("fake", () => {
  const fake = createFakePayments({ webhookSecret: WEBHOOK_SECRET });
  return { payments: fake, sign: (payload) => fake.signWebhook(payload) };
});

// The real package's constructEvent, narrowed to the
// slice the adapter consumes.
function realConstructEvent(real: Stripe) {
  return (payload: string, signature: string, secret: string) =>
    real.webhooks.constructEvent(payload, signature, secret) as unknown as {
      type: string;
      data: { object: Record<string, unknown> };
    };
}

contractSuite("Stripe adapter", () => {
  const { client } = stubClient();
  // The real provider package verifies: constructEvent
  // is the SDK's own, only the network half is stubbed.
  const real = new Stripe("sk_test_throwaway");
  const payments = createStripePayments({
    apiKey: "sk_test_throwaway",
    webhookSecret: WEBHOOK_SECRET,
    client: {
      paymentIntents: client.paymentIntents,
      webhooks: { constructEvent: realConstructEvent(real) },
    },
  });
  return {
    payments,
    sign: (payload) => real.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }),
  };
});

describe("payments translator — the Stripe adapter's half of the contract", () => {
  it("sends the one price, the currency, the receipt email and the identity metadata", async () => {
    const { client, created } = stubClient();
    const payments = createStripePayments({
      apiKey: "sk_test_throwaway",
      webhookSecret: WEBHOOK_SECRET,
      client,
    });
    const result = await payments.createReportIntent({
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      consent: CONSENT,
    });
    expect(result).toEqual({
      ok: true,
      intentId: "pi_stub_1",
      clientSecret: "pi_stub_1_secret_stub",
      status: "requires_confirmation",
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      amount: REPORT_PRICE_PENCE,
      currency: PAYMENT_CURRENCY,
      receipt_email: EMAIL,
      metadata: {
        email: EMAIL,
        postcode: POSTCODE,
        home_key: HOME_KEY,
        consent_tick: "true",
        consent_timestamp: CONSENT.timestamp,
      },
    });
    expect(REPORT_PRICE_PENCE).toBe(499);
    expect(PAYMENT_CURRENCY).toBe("gbp");
  });

  it("omits the home key from the metadata for a postcode-level payment", async () => {
    const { client, created } = stubClient();
    const payments = createStripePayments({
      apiKey: "sk_test_throwaway",
      webhookSecret: WEBHOOK_SECRET,
      client,
    });
    await payments.createReportIntent({
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: null,
      consent: CONSENT,
    });
    expect(created[0]?.metadata).toEqual({
      email: EMAIL,
      postcode: POSTCODE,
      consent_tick: "true",
      consent_timestamp: CONSENT.timestamp,
    });
  });

  it("maps a provider failure to a reason code — the provider's own words never escape", async () => {
    const failing: StripeClientSlice = {
      paymentIntents: {
        async create() {
          throw new Error("raw provider wording that must never surface");
        },
        async retrieve() {
          throw new Error("raw provider wording that must never surface");
        },
      },
      webhooks: {
        constructEvent() {
          throw new Error("raw provider wording that must never surface");
        },
      },
    };
    const payments = createStripePayments({
      apiKey: "sk_test_throwaway",
      webhookSecret: WEBHOOK_SECRET,
      client: failing,
    });
    const created = await payments.createReportIntent({
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      consent: CONSENT,
    });
    expect(created).toEqual({ ok: false, reason: "provider-error" });
    await expect(payments.intentStatus("pi_stub_1")).resolves.toEqual({
      ok: false,
      reason: "provider-error",
    });
    expect(JSON.stringify(created)).not.toContain("raw provider wording");
  });

  it("verifies a header built by hand from the documented signature scheme", () => {
    // Stripe's documented scheme: the header carries a
    // timestamp and v1 = HMAC-SHA256(webhook secret,
    // "<timestamp>.<payload>"). A header built by hand
    // to that scheme must verify against the real
    // package — the known-answer check that the adapter
    // is verifying the provider's signatures and not
    // some lookalike.
    const real = new Stripe("sk_test_throwaway");
    const payments = createStripePayments({
      apiKey: "sk_test_throwaway",
      webhookSecret: WEBHOOK_SECRET,
      client: {
        paymentIntents: stubClient().client.paymentIntents,
        webhooks: { constructEvent: realConstructEvent(real) },
      },
    });
    const payload = succeededPayload("pi_vector_1");
    // A current timestamp: the verifier enforces the
    // scheme's tolerance window as well as the HMAC.
    const timestamp = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest("hex");
    const verdict = payments.verifyWebhookEvent({
      payload,
      signature: `t=${timestamp},v1=${v1}`,
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.type).toBe("payment_intent.succeeded");
      expect(verdict.intentId).toBe("pi_vector_1");
      expect(verdict.metadata.email).toBe(EMAIL);
    }
  });
});

describe("payments translator — the fake's own promises", () => {
  it("records every creation with the one price and the consent it was given, for the contract's other readers", async () => {
    const fake = createFakePayments();
    await fake.createReportIntent({
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      consent: CONSENT,
    });
    expect(fake.created).toEqual([
      {
        intentId: "pi_fake_1",
        email: EMAIL,
        postcode: POSTCODE,
        homeKey: HOME_KEY,
        consentTick: true,
        consentTimestamp: CONSENT.timestamp,
        testOrder: false,
        amount: REPORT_PRICE_PENCE,
        currency: PAYMENT_CURRENCY,
        status: "requires_confirmation",
      },
    ]);
    fake.setStatus("pi_fake_1", "succeeded");
    await expect(fake.intentStatus("pi_fake_1")).resolves.toEqual({
      ok: true,
      intentId: "pi_fake_1",
      status: "succeeded",
      // The metadata the creation carried, read back
      // whole (M9.7): the order-state reading names the
      // order's home and delivery email from exactly
      // this bag.
      metadata: {
        email: EMAIL,
        postcode: POSTCODE,
        home_key: HOME_KEY,
        consent_tick: "true",
        consent_timestamp: CONSENT.timestamp,
      },
    });
    await expect(fake.intentStatus("pi_fake_99")).resolves.toEqual({
      ok: false,
      reason: "unknown-intent",
    });
  });
});

// ----------------------------------------------------------------
// M9.6 — the test lane at the translator: the allowlist
// parsing, the lane decision, the TEST flag read back
// from a verified event, and webhook secret selection
// by the event's mode.

import {
  createPaymentsRouter,
  testBuyerEmails,
  type PaymentsLaneSet,
} from "../lib/server/payments";

const TEST_SECRET = "whsec_test_lane_throwaway";
const TESTER = "tester@example.co.uk";

function laneSet(payments: Payments, publishableKey: string): PaymentsLaneSet {
  return { payments, webhookConfigured: true, publishableKey };
}

function modePayload(intentId: string, livemode: boolean, testFlag: boolean): string {
  return JSON.stringify({
    type: "payment_intent.succeeded",
    livemode,
    data: {
      object: {
        id: intentId,
        status: "succeeded",
        metadata: {
          email: EMAIL,
          postcode: POSTCODE,
          home_key: HOME_KEY,
          consent_tick: "true",
          consent_timestamp: CONSENT.timestamp,
          ...(testFlag ? { test: "true" } : {}),
        },
      },
    },
  });
}

describe("payments translator — the test lane (M9.6)", () => {
  it("reads the tester allowlist with the codebase's email normalisation", () => {
    expect(
      testBuyerEmails({ TEST_BUYER_EMAILS: " Tester@Example.co.uk , other@example.co.uk " }),
    ).toEqual(["tester@example.co.uk", "other@example.co.uk"]);
    expect(testBuyerEmails({})).toEqual([]);
    expect(testBuyerEmails({ TEST_BUYER_EMAILS: "  " })).toEqual([]);
  });

  it("selects the lane by email and configuration: test set only for an allowlisted email with a set configured", () => {
    const live = createFakePayments();
    const test = createFakePayments();
    const withSet = createPaymentsRouter({
      live: laneSet(live, "pk_live"),
      test: laneSet(test, "pk_test"),
      testEmails: [TESTER],
    });
    expect(withSet.laneFor(TESTER)).toBe("test");
    expect(withSet.isTestOrder(` ${TESTER.toUpperCase()} `)).toBe(true);
    expect(withSet.laneFor(EMAIL)).toBe("live");
    expect(withSet.isTestOrder(EMAIL)).toBe(false);
    expect(withSet.forLane("test")).toBe(test);
    expect(withSet.publishableKeyFor("test")).toBe("pk_test");

    const withoutSet = createPaymentsRouter({
      live: laneSet(live, "pk_live"),
      test: null,
      testEmails: [TESTER],
    });
    // No test set configured: the default set creates the
    // payment, but the order is STILL a test order.
    expect(withoutSet.laneFor(TESTER)).toBe("live");
    expect(withoutSet.isTestOrder(TESTER)).toBe(true);
  });

  it("reads a payment back through the router: whichever lane set holds it answers (M9.7)", async () => {
    const live = createFakePayments();
    const test = createFakePayments();
    const router = createPaymentsRouter({
      live: laneSet(live, "pk_live"),
      test: laneSet(test, "pk_test"),
      testEmails: [TESTER],
    });
    const liveCreated = await live.createReportIntent({
      email: EMAIL,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      consent: CONSENT,
    });
    // A throwaway first: both fakes number their
    // payments from pi_fake_1, and the fall-through
    // below needs an id the live set does NOT hold.
    await test.createReportIntent({
      email: TESTER,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      consent: CONSENT,
      testOrder: true,
    });
    const testCreated = await test.createReportIntent({
      email: TESTER,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      consent: CONSENT,
      testOrder: true,
    });
    if (!liveCreated.ok || !testCreated.ok) throw new Error("creation failed");
    // The live set's payment answers from the live set…
    const liveStatus = await router.intentStatus(liveCreated.intentId);
    expect(liveStatus.ok).toBe(true);
    if (liveStatus.ok) expect(liveStatus.metadata.email).toBe(EMAIL);
    // …and a payment only the test set holds falls
    // through to it — the success surface reads a
    // tester's order exactly as it reads a buyer's.
    const testStatus = await router.intentStatus(testCreated.intentId);
    expect(testStatus.ok).toBe(true);
    if (testStatus.ok) {
      expect(testStatus.metadata.email).toBe(TESTER);
      expect(testStatus.metadata.test).toBe("true");
    }
    // A payment neither set holds: the default set's
    // failure stands.
    await expect(router.intentStatus("pi_fake_99")).resolves.toEqual({
      ok: false,
      reason: "unknown-intent",
    });
  });

  it("reads the TEST flag back from a verified event's metadata", async () => {
    const fake = createFakePayments({ webhookSecret: WEBHOOK_SECRET });
    const created = await fake.createReportIntent({
      email: TESTER,
      postcode: POSTCODE,
      homeKey: HOME_KEY,
      consent: CONSENT,
      testOrder: true,
    });
    if (!created.ok) throw new Error("creation failed");
    const payload = modePayload(created.intentId, false, true);
    const verdict = fake.verifyWebhookEvent({ payload, signature: fake.signWebhook(payload) });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.metadata?.test).toBe("true");
    expect(verdict.livemode).toBe(false);
  });

  it("verifies a webhook against the secret of the event's own mode — and refuses the other mode's secret", () => {
    const live = createFakePayments({ webhookSecret: WEBHOOK_SECRET });
    const test = createFakePayments({ webhookSecret: TEST_SECRET });
    const router = createPaymentsRouter({
      live: laneSet(live, "pk_live"),
      test: laneSet(test, "pk_test"),
      testEmails: [TESTER],
    });

    const testPayload = modePayload("pi_lane_1", false, true);
    const livePayload = modePayload("pi_lane_2", true, false);

    // Each mode verifies under its own secret…
    expect(
      router.verifyWebhookEvent({ payload: testPayload, signature: test.signWebhook(testPayload) })
        .ok,
    ).toBe(true);
    expect(
      router.verifyWebhookEvent({ payload: livePayload, signature: live.signWebhook(livePayload) })
        .ok,
    ).toBe(true);
    // …and refuses the other mode's secret.
    expect(
      router.verifyWebhookEvent({ payload: testPayload, signature: live.signWebhook(testPayload) })
        .ok,
    ).toBe(false);
    expect(
      router.verifyWebhookEvent({ payload: livePayload, signature: test.signWebhook(livePayload) })
        .ok,
    ).toBe(false);
  });

  it("with only one secret configured, verification behaves exactly as before — any mode against the one set", () => {
    const live = createFakePayments({ webhookSecret: WEBHOOK_SECRET });
    const router = createPaymentsRouter({
      live: laneSet(live, "pk_live"),
      test: null,
      testEmails: [TESTER],
    });
    const testPayload = modePayload("pi_lane_3", false, true);
    const verdict = router.verifyWebhookEvent({
      payload: testPayload,
      signature: live.signWebhook(testPayload),
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.livemode).toBe(false);
    expect(verdict.metadata?.test).toBe("true");
  });
});
