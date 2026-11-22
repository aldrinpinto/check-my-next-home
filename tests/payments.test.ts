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
    });
    await expect(fake.intentStatus("pi_fake_99")).resolves.toEqual({
      ok: false,
      reason: "unknown-intent",
    });
  });
});
