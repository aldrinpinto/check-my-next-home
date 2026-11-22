// The payments translator (plan step M9.4; decision D3 —
// plain Stripe, named only inside this file's adapter).
//
// The payment seam, in the report mailer's exact
// discipline (lib/server/report-mailer.ts): the rest of
// the product talks to this interface and never to the
// payment company; a failure is a value, never a throw —
// { ok: true, … } or { ok: false, reason } — and the
// caller decides what a failure means. Provider errors
// never escape the adapter: a caller (and therefore a
// buyer) only ever sees this file's reason codes, which
// the surfaces map to their own human lines.
//
// The interface is deliberately tiny — the three things
// the payment journey needs:
//   - createReportIntent — start a payment for the one
//     report price (REPORT_PRICE_PENCE, lib/site.ts),
//     carrying the delivery email and the home's identity
//     in the payment's metadata, where M9.6's webhook
//     path reads them back to deliver the report.
//   - intentStatus — read a payment's status back.
//   - verifyWebhookEvent — verify a webhook delivery's
//     signature and read the event (M9.4 builds the
//     verification; the receiver route that acts on
//     events is M9.6's).
// There is NO free-window (£0) mode: the launch window
// never touches payments (M9.6 calls the delivery with
// kind "free"), so no £0 handling exists here to misuse.
//
// Three implementations:
//   - Stripe — the real adapter, used when the
//     environment carries the key (K12/K13 —
//     PAYMENT_API_KEY). Only this implementation's code
//     names the provider or its package.
//   - Unconfigured — answers not-configured. Until the
//     environment carries the key this is simply what
//     answers, and an intent request reports the fact
//     rather than pretending a payment was started.
//   - Fake — the tests' stand-in: an in-memory intent
//     store and a webhook signer/verifier pair following
//     the documented signature scheme's shape, so the
//     contract tests exercise the same promises the
//     adapter makes.

import { createHmac, timingSafeEqual } from "node:crypto";

import Stripe from "stripe";

import { REPORT_PRICE_PENCE } from "../site";

export type CreateIntentResult =
  | { ok: true; intentId: string; clientSecret: string; status: string }
  | { ok: false; reason: string };

export type IntentStatusResult =
  { ok: true; intentId: string; status: string } | { ok: false; reason: string };

export type WebhookEventResult =
  | {
      ok: true;
      type: string;
      intentId: string | null;
      status: string | null;
      metadata: Record<string, string>;
    }
  | { ok: false; reason: string };

export interface Payments {
  createReportIntent(input: {
    email: string;
    postcode: string;
    homeKey: string | null;
  }): Promise<CreateIntentResult>;
  intentStatus(intentId: string): Promise<IntentStatusResult>;
  verifyWebhookEvent(input: { payload: string; signature: string }): WebhookEventResult;
}

// The metadata keys every report intent carries. M9.6's
// webhook path delivers from these and nothing else —
// the amount and the address are never read back from
// anything a client sent.
export const PAYMENT_METADATA_EMAIL = "email";
export const PAYMENT_METADATA_POSTCODE = "postcode";
export const PAYMENT_METADATA_HOME_KEY = "home_key";

// The one currency the report is sold in.
export const PAYMENT_CURRENCY = "gbp";

// ----------------------------------------------------------------
// Unconfigured

export function createUnconfiguredPayments(): Payments {
  return {
    createReportIntent: async () => ({ ok: false, reason: "not-configured" }),
    intentStatus: async () => ({ ok: false, reason: "not-configured" }),
    verifyWebhookEvent: () => ({ ok: false, reason: "not-configured" }),
  };
}

// ----------------------------------------------------------------
// Stripe — the only implementation that names the provider.

// The slice of the provider's client this adapter uses,
// stated structurally so tests can stand a recording stub
// in for it. The real client satisfies far more than
// this; nothing outside this file touches it.
export interface StripeClientSlice {
  paymentIntents: {
    create(params: Record<string, unknown>): Promise<{
      id: string;
      client_secret: string | null;
      status: string;
    }>;
    retrieve(id: string): Promise<{ id: string; status: string }>;
  };
  webhooks: {
    constructEvent(
      payload: string,
      signature: string,
      secret: string,
    ): {
      type: string;
      data: { object: Record<string, unknown> };
    };
  };
}

export function createStripePayments(config: {
  apiKey: string;
  webhookSecret: string;
  client?: StripeClientSlice;
}): Payments {
  const client: StripeClientSlice =
    config.client ?? (new Stripe(config.apiKey) as unknown as StripeClientSlice);
  return {
    async createReportIntent(input) {
      try {
        const metadata: Record<string, string> = {
          [PAYMENT_METADATA_EMAIL]: input.email,
          [PAYMENT_METADATA_POSTCODE]: input.postcode,
        };
        if (input.homeKey) metadata[PAYMENT_METADATA_HOME_KEY] = input.homeKey;
        const intent = await client.paymentIntents.create({
          amount: REPORT_PRICE_PENCE,
          currency: PAYMENT_CURRENCY,
          receipt_email: input.email,
          metadata,
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        });
        if (!intent.client_secret) return { ok: false, reason: "provider-error" };
        return {
          ok: true,
          intentId: intent.id,
          clientSecret: intent.client_secret,
          status: intent.status,
        };
      } catch {
        return { ok: false, reason: "provider-error" };
      }
    },
    async intentStatus(intentId) {
      try {
        const intent = await client.paymentIntents.retrieve(intentId);
        return { ok: true, intentId: intent.id, status: intent.status };
      } catch {
        return { ok: false, reason: "provider-error" };
      }
    },
    verifyWebhookEvent(input) {
      // No secret placed yet: verification fails closed,
      // exactly as an unconfigured seam answers.
      if (!config.webhookSecret) return { ok: false, reason: "not-configured" };
      try {
        const event = client.webhooks.constructEvent(
          input.payload,
          input.signature,
          config.webhookSecret,
        );
        const object = event.data.object ?? {};
        const rawMetadata =
          typeof object.metadata === "object" && object.metadata !== null
            ? (object.metadata as Record<string, unknown>)
            : {};
        const metadata: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawMetadata)) {
          if (typeof value === "string") metadata[key] = value;
        }
        return {
          ok: true,
          type: event.type,
          intentId: typeof object.id === "string" ? object.id : null,
          status: typeof object.status === "string" ? object.status : null,
          metadata,
        };
      } catch {
        return { ok: false, reason: "bad-signature" };
      }
    },
  };
}

// ----------------------------------------------------------------
// Fake — the tests' stand-in.

export const FAKE_WEBHOOK_SECRET = "whsec_fake_test_only";

export interface FakePayments extends Payments {
  // Every intent the fake has created, in creation
  // order, with the exact inputs it was created from —
  // the contract tests read the seam's promises back
  // from here.
  created: {
    intentId: string;
    email: string;
    postcode: string;
    homeKey: string | null;
    amount: number;
    currency: string;
    status: string;
  }[];
  // Sign a webhook payload the way the fake's verifier
  // expects — the documented scheme's shape: a
  // timestamp and an HMAC-SHA256 of "<timestamp>.<payload>"
  // under the webhook secret.
  signWebhook(payload: string, timestampSeconds?: number): string;
  // Move a created intent to a new status (a succeeded
  // payment, a failed one) so status read-backs can be
  // exercised.
  setStatus(intentId: string, status: string): void;
}

export function createFakePayments(config?: { webhookSecret?: string }): FakePayments {
  const webhookSecret = config?.webhookSecret ?? FAKE_WEBHOOK_SECRET;
  const created: FakePayments["created"] = [];
  let counter = 0;

  const sign = (payload: string, timestampSeconds: number): string => {
    const signed = createHmac("sha256", webhookSecret)
      .update(`${timestampSeconds}.${payload}`)
      .digest("hex");
    return `t=${timestampSeconds},v1=${signed}`;
  };

  return {
    created,
    signWebhook: (payload, timestampSeconds) =>
      sign(payload, timestampSeconds ?? Math.floor(Date.now() / 1000)),
    setStatus(intentId, status) {
      const record = created.find((entry) => entry.intentId === intentId);
      if (record) record.status = status;
    },
    async createReportIntent(input) {
      counter += 1;
      const intentId = `pi_fake_${counter}`;
      const record = {
        intentId,
        email: input.email,
        postcode: input.postcode,
        homeKey: input.homeKey,
        amount: REPORT_PRICE_PENCE,
        currency: PAYMENT_CURRENCY,
        status: "requires_confirmation",
      };
      created.push(record);
      return {
        ok: true,
        intentId,
        clientSecret: `${intentId}_secret_fake`,
        status: record.status,
      };
    },
    async intentStatus(intentId) {
      const record = created.find((entry) => entry.intentId === intentId);
      if (!record) return { ok: false, reason: "unknown-intent" };
      return { ok: true, intentId, status: record.status };
    },
    verifyWebhookEvent(input) {
      const parts = new Map(
        input.signature.split(",").map((part) => {
          const at = part.indexOf("=");
          return [part.slice(0, at).trim(), part.slice(at + 1).trim()] as const;
        }),
      );
      const timestamp = parts.get("t");
      const signature = parts.get("v1");
      if (!timestamp || !signature) return { ok: false, reason: "bad-signature" };
      const expected = createHmac("sha256", webhookSecret)
        .update(`${timestamp}.${input.payload}`)
        .digest("hex");
      const given = Buffer.from(signature);
      const wanted = Buffer.from(expected);
      if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
        return { ok: false, reason: "bad-signature" };
      }
      try {
        const event = JSON.parse(input.payload) as {
          type?: unknown;
          data?: { object?: Record<string, unknown> };
        };
        const object = event.data?.object ?? {};
        const rawMetadata =
          typeof object.metadata === "object" && object.metadata !== null
            ? (object.metadata as Record<string, unknown>)
            : {};
        const metadata: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawMetadata)) {
          if (typeof value === "string") metadata[key] = value;
        }
        return {
          ok: true,
          type: typeof event.type === "string" ? event.type : "",
          intentId: typeof object.id === "string" ? object.id : null,
          status: typeof object.status === "string" ? object.status : null,
          metadata,
        };
      } catch {
        return { ok: false, reason: "bad-payload" };
      }
    },
  };
}

// ----------------------------------------------------------------
// The factory the routes call. Selection is by
// environment: a placed payment key selects the real
// adapter; anything else is the unconfigured seam, which
// answers plainly rather than pretending.
export function getPayments(): Payments {
  const apiKey = process.env.PAYMENT_API_KEY;
  if (apiKey) {
    return createStripePayments({
      apiKey,
      webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? "",
    });
  }
  return createUnconfiguredPayments();
}

// The publishable key is read on the server and handed
// to the payment page as data (plan step M9.4, gap 2) —
// never baked in as a build-time public variable, so the
// play site and the real site each serve the key their
// own secret file carries.
export function paymentPublishableKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const key = env.PAYMENT_PUBLISHABLE_KEY;
  return key ? key : null;
}
