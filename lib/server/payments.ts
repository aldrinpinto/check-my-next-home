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
//     carrying the delivery email, the home's identity
//     and the buyer's digital-content consent (tick +
//     timestamp, plan step M9.5) in the payment's
//     metadata, where M9.6's webhook path reads them
//     back to deliver the report and M9.10's order
//     record reads the consent from (test T-PAY-06).
//   - intentStatus — read a payment's status and
//     metadata back (the metadata half is M9.7's: the
//     order-state reading behind the post-payment
//     surfaces).
//   - verifyWebhookEvent — verify a webhook delivery's
//     signature and read the event (M9.4 builds the
//     verification; the receiver route that acts on
//     events is M9.6's).
// There is NO free-window (£0) mode: the launch window
// never touches payments (M9.6 calls the delivery with
// kind "free"), so no £0 handling exists here to misuse.
//
// THE TEST LANE (M9.6, founder-approved 22 Nov 2026):
// the founder and named testers run the whole journey
// on the live site with dummy money while real buyers
// are untouched. A second, TEST key set
// (PAYMENT_TEST_*) stands beside the default set, and a
// tester allowlist (TEST_BUYER_EMAILS, in the server
// environment only — no admin UI, no buyer-facing
// surface) decides the lane BY DELIVERY EMAIL at intent
// creation: an allowlisted email creates its payment
// with the TEST keys where a test set is configured,
// and its order is flagged TEST in the payment's
// metadata either way (on a server carrying only one
// key set — the play server today, whose only keys are
// the sandbox ones — the default set is used and the
// order is still flagged). Any other email always takes
// the default set, and the lane is invisible to it.
// Test orders fulfil identically — real PDF, real
// delivery email, real gift rules; only the money is
// dummy — and the flag rides the metadata into M9.6's
// audit log and fulfilment claim, so M9.10's order
// record can separate test orders from real sales.
// Webhook verification selects its secret by the
// event's own mode (livemode) once both secrets exist;
// with only one configured, the configured secret
// verifies everything, exactly as the single-set seam
// always behaved — verification still gates every
// event, so an unverified mode hint gains nothing.
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

import { normaliseEmail } from "../gift";
import { REPORT_PRICE_PENCE } from "../site";

export type CreateIntentResult =
  | { ok: true; intentId: string; clientSecret: string; status: string }
  | { ok: false; reason: string };

export type IntentStatusResult =
  | {
      ok: true;
      intentId: string;
      status: string;
      // The payment's metadata, read back with its
      // status (M9.7): the order-state reading behind
      // the success surface and the payment return
      // landing decides from these whether a payment
      // with no fulfilment claim yet is OURS — and
      // names its home and delivery email from them —
      // never from anything a client sent.
      metadata: Record<string, string>;
    }
  | { ok: false; reason: string };

export type WebhookEventResult =
  | {
      ok: true;
      type: string;
      intentId: string | null;
      status: string | null;
      metadata: Record<string, string>;
      // The event's own mode, from the verified event:
      // true for a live-mode event, false for a
      // test-mode one, null where the event carries no
      // mode (the fake's unsigned-shape payloads in old
      // tests). M9.6's audit log records it beside the
      // order's TEST flag.
      livemode: boolean | null;
    }
  | { ok: false; reason: string };

// The buyer's digital-content consent (plan step
// M9.5): the tick itself and the ISO timestamp of the
// moment it was given on the payment page. It travels
// with the payment — never only in the browser — so
// the consent is provable afterwards from the order
// record (T-PAY-06).
export interface ReportPaymentConsent {
  ticked: boolean;
  timestamp: string;
}

export interface Payments {
  createReportIntent(input: {
    email: string;
    postcode: string;
    homeKey: string | null;
    consent: ReportPaymentConsent;
    // The order's TEST-lane flag (the test lane,
    // M9.6): set by the caller from the allowlist, and
    // carried in the payment's metadata when true —
    // absent entirely for a real buyer's payment, so a
    // real order's metadata is byte-for-byte what it
    // was before the lane existed.
    testOrder?: boolean;
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
export const PAYMENT_METADATA_CONSENT_TICK = "consent_tick";
export const PAYMENT_METADATA_CONSENT_TIMESTAMP = "consent_timestamp";
// The TEST-lane flag (M9.6): present as "true" on a
// test order's payment, absent on a real one. M9.6's
// webhook path reads it into the audit log and the
// fulfilment claim; M9.10's order record separates
// test orders from real sales by it.
export const PAYMENT_METADATA_TEST = "test";

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
// A provider metadata bag, in this seam's terms: only
// its string entries exist — the rest of the product
// reads metadata as strings or not at all.
function stringMetadata(raw: unknown): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (typeof raw === "object" && raw !== null) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string") metadata[key] = value;
    }
  }
  return metadata;
}

export interface StripeClientSlice {
  paymentIntents: {
    create(params: Record<string, unknown>): Promise<{
      id: string;
      client_secret: string | null;
      status: string;
    }>;
    retrieve(id: string): Promise<{
      id: string;
      status: string;
      metadata?: Record<string, unknown>;
    }>;
  };
  webhooks: {
    constructEvent(
      payload: string,
      signature: string,
      secret: string,
    ): {
      type: string;
      livemode?: unknown;
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
          [PAYMENT_METADATA_CONSENT_TICK]: input.consent.ticked ? "true" : "false",
          [PAYMENT_METADATA_CONSENT_TIMESTAMP]: input.consent.timestamp,
        };
        if (input.homeKey) metadata[PAYMENT_METADATA_HOME_KEY] = input.homeKey;
        if (input.testOrder) metadata[PAYMENT_METADATA_TEST] = "true";
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
        return {
          ok: true,
          intentId: intent.id,
          status: intent.status,
          metadata: stringMetadata(intent.metadata),
        };
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
        return {
          ok: true,
          type: event.type,
          intentId: typeof object.id === "string" ? object.id : null,
          status: typeof object.status === "string" ? object.status : null,
          metadata: stringMetadata(object.metadata),
          livemode: typeof event.livemode === "boolean" ? event.livemode : null,
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
    consentTick: boolean;
    consentTimestamp: string;
    // The TEST-lane flag the creation carried (M9.6) —
    // the metadata's "test" key, read back here.
    testOrder: boolean;
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
        consentTick: input.consent.ticked,
        consentTimestamp: input.consent.timestamp,
        testOrder: input.testOrder === true,
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
      // The metadata the creation carried, composed the
      // way the adapter composes it — the read-back
      // exercises the same promises the seam makes.
      const metadata: Record<string, string> = {
        [PAYMENT_METADATA_EMAIL]: record.email,
        [PAYMENT_METADATA_POSTCODE]: record.postcode,
        [PAYMENT_METADATA_CONSENT_TICK]: record.consentTick ? "true" : "false",
        [PAYMENT_METADATA_CONSENT_TIMESTAMP]: record.consentTimestamp,
      };
      if (record.homeKey) metadata[PAYMENT_METADATA_HOME_KEY] = record.homeKey;
      if (record.testOrder) metadata[PAYMENT_METADATA_TEST] = "true";
      return { ok: true, intentId, status: record.status, metadata };
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
          livemode?: unknown;
          data?: { object?: Record<string, unknown> };
        };
        const object = event.data?.object ?? {};
        return {
          ok: true,
          type: typeof event.type === "string" ? event.type : "",
          intentId: typeof object.id === "string" ? object.id : null,
          status: typeof object.status === "string" ? object.status : null,
          metadata: stringMetadata(object.metadata),
          livemode: typeof event.livemode === "boolean" ? event.livemode : null,
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

// ----------------------------------------------------------------
// The lanes (M9.6, the test lane): the router the routes
// actually call. It holds the two key sets as lane sets
// and answers the lane questions — which set creates
// this email's payment, whether the order is a TEST
// order, which publishable key the page initialises its
// card element from, and which set verifies a webhook.

export type PaymentLane = "live" | "test";

export interface PaymentsLaneSet {
  payments: Payments;
  // Whether this set can verify a webhook (its secret
  // is placed). Mode selection routes an event only to
  // a set that can actually verify it; a set without a
  // secret answers not-configured, exactly as the
  // single-set seam did.
  webhookConfigured: boolean;
  publishableKey: string | null;
}

export interface PaymentsRouter {
  // The lane an order for this delivery email runs in:
  // the test lane only where the email is allowlisted
  // AND a test set is configured; the default ("live")
  // set otherwise — an unlisted email can never reach
  // the test set.
  laneFor(email: string): PaymentLane;
  // Whether an order for this email is flagged TEST:
  // allowlist membership alone decides it, configured
  // test set or not (the one-key-set server still flags
  // its testers' orders).
  isTestOrder(email: string): boolean;
  forLane(lane: PaymentLane): Payments;
  publishableKeyFor(lane: PaymentLane): string | null;
  // Read a payment back (M9.7's order-state reading):
  // whichever lane set holds it answers — a payment
  // lives under exactly one set's keys, and the other
  // set's read fails, so the first ok answer is the
  // payment's own set talking. Where neither answers,
  // the default set's failure stands.
  intentStatus(intentId: string): Promise<IntentStatusResult>;
  // Verify a webhook, selecting the secret by the
  // event's mode once both secrets exist (see the
  // header's test-lane note).
  verifyWebhookEvent(input: { payload: string; signature: string }): WebhookEventResult;
}

// The tester allowlist (TEST_BUYER_EMAILS): a
// comma-separated list in the server environment,
// matched under the codebase's email normalisation
// (lib/gift.ts). Founder-controlled; nothing else in
// the product reads it, and no surface renders it.
export function testBuyerEmails(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.TEST_BUYER_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => normaliseEmail(entry))
    .filter((entry) => entry !== "");
}

// The mode a webhook payload CLAIMS, read from its
// unverified JSON. A hint, never a trust: it only
// chooses which secret verifies the event, and a
// forged hint still has to pass that secret's
// signature check — the same posture the provider's
// own endpoint-per-mode setup assumes.
function livemodeHint(payload: string): boolean | null {
  try {
    const parsed = JSON.parse(payload) as { livemode?: unknown };
    return typeof parsed?.livemode === "boolean" ? parsed.livemode : null;
  } catch {
    return null;
  }
}

export function createPaymentsRouter(config: {
  live: PaymentsLaneSet;
  test: PaymentsLaneSet | null;
  testEmails: readonly string[];
}): PaymentsRouter {
  const allowlist = new Set(config.testEmails.map((entry) => normaliseEmail(entry)));
  const isTestOrder = (email: string) => allowlist.has(normaliseEmail(email));
  return {
    isTestOrder,
    laneFor(email) {
      return isTestOrder(email) && config.test ? "test" : "live";
    },
    forLane(lane) {
      return lane === "test" && config.test ? config.test.payments : config.live.payments;
    },
    publishableKeyFor(lane) {
      return lane === "test" && config.test
        ? config.test.publishableKey
        : config.live.publishableKey;
    },
    async intentStatus(intentId) {
      const live = await config.live.payments.intentStatus(intentId);
      if (live.ok || !config.test) return live;
      const test = await config.test.payments.intentStatus(intentId);
      return test.ok ? test : live;
    },
    verifyWebhookEvent(input) {
      // Once both secrets exist, the event's own mode
      // picks its secret: a test-mode event verifies
      // against the test set, a live event against the
      // default set. With only one secret configured,
      // that secret verifies everything — the single-set
      // seam's exact behaviour. With none, the default
      // set answers, and fails closed.
      const hint = livemodeHint(input.payload);
      const first = hint === false ? config.test : config.live;
      const second = hint === false ? config.live : config.test;
      for (const set of [first, second]) {
        if (set && set.webhookConfigured) return set.payments.verifyWebhookEvent(input);
      }
      return config.live.payments.verifyWebhookEvent(input);
    },
  };
}

// One lane set from its environment names, in the
// provider-neutral style .env.example carries: the
// default set is PAYMENT_*, the test set PAYMENT_TEST_*.
function laneSetFromEnv(
  env: Record<string, string | undefined>,
  names: { apiKey: string; webhookSecret: string; publishableKey: string },
): PaymentsLaneSet {
  const apiKey = env[names.apiKey];
  const webhookSecret = env[names.webhookSecret] ?? "";
  const publishableKey = env[names.publishableKey];
  return {
    payments: apiKey
      ? createStripePayments({ apiKey, webhookSecret })
      : createUnconfiguredPayments(),
    webhookConfigured: Boolean(apiKey && webhookSecret),
    publishableKey: publishableKey ? publishableKey : null,
  };
}

// The environment's router: the default set exactly as
// getPayments() builds it, the test set where its key
// is placed, and the allowlist from TEST_BUYER_EMAILS.
export function getPaymentsRouter(
  env: Record<string, string | undefined> = process.env,
): PaymentsRouter {
  const live = laneSetFromEnv(env, {
    apiKey: "PAYMENT_API_KEY",
    webhookSecret: "PAYMENT_WEBHOOK_SECRET",
    publishableKey: "PAYMENT_PUBLISHABLE_KEY",
  });
  const test = env.PAYMENT_TEST_API_KEY
    ? laneSetFromEnv(env, {
        apiKey: "PAYMENT_TEST_API_KEY",
        webhookSecret: "PAYMENT_TEST_WEBHOOK_SECRET",
        publishableKey: "PAYMENT_TEST_PUBLISHABLE_KEY",
      })
    : null;
  return createPaymentsRouter({ live, test, testEmails: testBuyerEmails(env) });
}
