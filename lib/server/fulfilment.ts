// Fulfilment (plan step M9.6) — the exactly-once claim,
// the webhook's processing, and the worker that turns a
// claimed payment into a delivered report.
//
// THE SHAPE (ruling R2, 22 Nov 2026): the webhook
// receiver does almost nothing — verify, log, claim,
// answer. The heavy work lives in a worker OUTSIDE the
// web route graph, because the PDF generator
// (lib/server/report-pdf.ts) composes with
// react-dom/server, which the route graph bans, and
// because a cold postcode's composition takes
// seconds-to-minutes that must never sit on the
// provider's response clock. The worker runs the one
// rendering path the tests pin — checkReport →
// buildReportView → storeReportPdf → deliverReport —
// so a bought report can never drift from the twin the
// print-check batches verified. scripts/fulfil-
// reports.ts is its thin runner; this file is the
// machinery, factored for tests exactly as
// lib/server/payment-intent.ts factors the intent
// route's seam. The production wiring that assembles
// the worker (the rendering path included) lives in
// lib/server/fulfilment-worker.ts, apart from this
// file on purpose: the routes import this file's claim
// stores and webhook processing, and nothing in their
// graph may reach the PDF generator.
//
// THE CLAIM IS THE GUARANTEE (prep gap 2): a claim is
// taken BEFORE deliverReport can run, keyed by the
// fulfilment's own reference — the provider payment id
// for a paid order, the gift token for a gifted one, a
// generated id for a free-window one. deliverReport
// itself has no dedupe (it issues the gift first), so
// the claim is what makes the provider's routine
// redeliveries harmless: a second verified "paid" event
// finds its claim standing and does nothing — no
// second PDF, no second delivery record, no second
// gift, no second email. A buyer who pays twice through
// two separate payments has made two genuine payments:
// each fulfils exactly once, and the second is a
// refund case for M9.8, never silently merged here.
//
// THE LOG COMES FIRST (founder amendment, 22 Nov
// 2026): every verified event is written to
// payment_events (lib/server/payment-events.ts) before
// anything else happens with it — failed payments
// included. An unverifiable event is refused and never
// logged: the log is a record of what the provider
// genuinely reported, and a forgery is not that.

import { randomBytes } from "node:crypto";

import type { AddressResolution } from "../address";
import { getDbPool } from "./db";
import { recordJourneyEvent } from "./journey-events";
import { createDbPaymentEventLog, type PaymentEventLog } from "./payment-events";
import {
  PAYMENT_METADATA_EMAIL,
  PAYMENT_METADATA_HOME_KEY,
  PAYMENT_METADATA_POSTCODE,
  PAYMENT_METADATA_TEST,
  type PaymentsRouter,
} from "./payments";
import type { DeliverReportOutcome } from "./report-delivery";

// ----------------------------------------------------------------
// The claim store

export type FulfilmentKind = "paid" | "gifted" | "free";
export type FulfilmentStatus = "claimed" | "fulfilled" | "failed";

export interface FulfilmentClaim {
  ref: string;
  kind: FulfilmentKind;
  email: string;
  postcode: string;
  homeKey: string | null;
  giftToken: string | null;
  testOrder: boolean;
  status: FulfilmentStatus;
  deliveryId: string | null;
  mailSent: boolean | null;
  lastError: string | null;
  attempts: number;
  claimedAt: Date;
  fulfilledAt: Date | null;
}

export interface ClaimInput {
  ref: string;
  kind: FulfilmentKind;
  email: string;
  postcode: string;
  homeKey: string | null;
  giftToken?: string | null;
  testOrder?: boolean;
  now?: Date;
}

export interface FulfilmentClaimStore {
  // Take the claim if it stands untaken. Answers true
  // where THIS call took it — the primary key is the
  // dedupe, so a claim that already stands (in any
  // state) answers false and changes nothing.
  claim(input: ClaimInput): Promise<boolean>;
  getByRef(ref: string): Promise<FulfilmentClaim | null>;
  // What still waits for the worker: claimed and not
  // yet exhausted, oldest first.
  pending(limit: number): Promise<FulfilmentClaim[]>;
  markFulfilled(
    ref: string,
    input: { deliveryId: string; mailSent: boolean; now?: Date },
  ): Promise<void>;
  // Record a failed attempt: the error is kept, the
  // attempt counted, and the claim exhausts (status
  // "failed") once its attempts reach the bound — a
  // transient failure retries on a later worker run, a
  // persistent one stops and stays reasoned about.
  recordFailure(ref: string, input: { error: string; maxAttempts: number }): Promise<void>;
  // Retake a claim that stands FAILED (M9.7, gap 4 —
  // ruling R3): the claim returns to "claimed" so the
  // worker tries again, and its attempts and last error
  // STAY on the row — the record of the failure is not
  // wiped by the retake. Answers true where this call
  // reset a failed claim; a claim in any other state,
  // or none, answers false and changes nothing. Only
  // the gift road calls this (the door's gift
  // recognition, where the gift was never consumed);
  // a paid claim has no equivalent road by design.
  reclaimFailed(ref: string): Promise<boolean>;
  // The delivery email stands sent after all (M9.7,
  // gap 5): a buyer re-send of the standing delivery's
  // email succeeded, so the claim's mail_sent — which
  // the success surface reads to tell the truth about
  // the email — follows the fact. Only a fulfilled
  // claim's flag can move, and only to true.
  markMailSent(ref: string): Promise<void>;
}

// A free-window claim's reference: no payment and no
// gift keys it, so it carries its own generated id —
// the delivery id's standard (24 random bytes).
export function newFreeClaimRef(): string {
  return `free_${randomBytes(24).toString("base64url")}`;
}

interface ClaimRow {
  ref: string;
  kind: FulfilmentKind;
  email: string;
  postcode: string;
  home_key: string | null;
  gift_token: string | null;
  test_order: boolean;
  status: FulfilmentStatus;
  delivery_id: string | null;
  mail_sent: boolean | null;
  last_error: string | null;
  attempts: number;
  claimed_at: Date;
  fulfilled_at: Date | null;
}

function toClaim(row: ClaimRow): FulfilmentClaim {
  return {
    ref: row.ref,
    kind: row.kind,
    email: row.email,
    postcode: row.postcode,
    homeKey: row.home_key,
    giftToken: row.gift_token,
    testOrder: row.test_order,
    status: row.status,
    deliveryId: row.delivery_id,
    mailSent: row.mail_sent,
    lastError: row.last_error,
    attempts: row.attempts,
    claimedAt: new Date(row.claimed_at),
    fulfilledAt: row.fulfilled_at ? new Date(row.fulfilled_at) : null,
  };
}

const CLAIM_COLUMNS = `ref, kind, email, postcode, home_key, gift_token,
  test_order, status, delivery_id, mail_sent, last_error, attempts,
  claimed_at, fulfilled_at`;

export function createDbFulfilmentClaimStore(db: {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}): FulfilmentClaimStore {
  return {
    async claim(input) {
      const { rows } = await db.query(
        `INSERT INTO fulfilment_claims (${CLAIM_COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'claimed', NULL, NULL, NULL, 0, $8, NULL)
         ON CONFLICT (ref) DO NOTHING
         RETURNING ref`,
        [
          input.ref,
          input.kind,
          input.email,
          input.postcode,
          input.homeKey,
          input.giftToken ?? null,
          input.testOrder ?? false,
          input.now ?? new Date(),
        ],
      );
      return rows.length > 0;
    },

    async getByRef(ref) {
      const { rows } = await db.query(
        `SELECT ${CLAIM_COLUMNS} FROM fulfilment_claims WHERE ref = $1`,
        [ref],
      );
      const row = (rows as unknown as ClaimRow[])[0];
      return row ? toClaim(row) : null;
    },

    async pending(limit) {
      const { rows } = await db.query(
        `SELECT ${CLAIM_COLUMNS} FROM fulfilment_claims
          WHERE status = 'claimed'
          ORDER BY claimed_at ASC
          LIMIT $1`,
        [limit],
      );
      return (rows as unknown as ClaimRow[]).map(toClaim);
    },

    async markFulfilled(ref, input) {
      await db.query(
        `UPDATE fulfilment_claims
            SET status = 'fulfilled', delivery_id = $2, mail_sent = $3, fulfilled_at = $4
          WHERE ref = $1 AND status = 'claimed'`,
        [ref, input.deliveryId, input.mailSent, input.now ?? new Date()],
      );
    },

    async recordFailure(ref, input) {
      await db.query(
        `UPDATE fulfilment_claims
            SET attempts = attempts + 1,
                last_error = $2,
                status = CASE WHEN attempts + 1 >= $3 THEN 'failed' ELSE 'claimed' END
          WHERE ref = $1 AND status = 'claimed'`,
        [ref, input.error, input.maxAttempts],
      );
    },

    async reclaimFailed(ref) {
      const { rows } = await db.query(
        `UPDATE fulfilment_claims
            SET status = 'claimed'
          WHERE ref = $1 AND status = 'failed'
          RETURNING ref`,
        [ref],
      );
      return rows.length > 0;
    },

    async markMailSent(ref) {
      await db.query(
        `UPDATE fulfilment_claims
            SET mail_sent = true
          WHERE ref = $1 AND status = 'fulfilled'`,
        [ref],
      );
    },
  };
}

// The in-memory implementation the tests run.
export function createMemoryFulfilmentClaimStore(): FulfilmentClaimStore & {
  claims: Map<string, FulfilmentClaim>;
} {
  const claims = new Map<string, FulfilmentClaim>();
  const clone = (claim: FulfilmentClaim): FulfilmentClaim => ({ ...claim });
  return {
    claims,
    async claim(input) {
      if (claims.has(input.ref)) return false;
      claims.set(input.ref, {
        ref: input.ref,
        kind: input.kind,
        email: input.email,
        postcode: input.postcode,
        homeKey: input.homeKey,
        giftToken: input.giftToken ?? null,
        testOrder: input.testOrder ?? false,
        status: "claimed",
        deliveryId: null,
        mailSent: null,
        lastError: null,
        attempts: 0,
        claimedAt: input.now ?? new Date(),
        fulfilledAt: null,
      });
      return true;
    },
    async getByRef(ref) {
      const claim = claims.get(ref);
      return claim ? clone(claim) : null;
    },
    async pending(limit) {
      return [...claims.values()]
        .filter((claim) => claim.status === "claimed")
        .sort((a, b) => a.claimedAt.getTime() - b.claimedAt.getTime())
        .slice(0, limit)
        .map(clone);
    },
    async markFulfilled(ref, input) {
      const claim = claims.get(ref);
      if (!claim || claim.status !== "claimed") return;
      claim.status = "fulfilled";
      claim.deliveryId = input.deliveryId;
      claim.mailSent = input.mailSent;
      claim.fulfilledAt = input.now ?? new Date();
    },
    async recordFailure(ref, input) {
      const claim = claims.get(ref);
      if (!claim || claim.status !== "claimed") return;
      claim.attempts += 1;
      claim.lastError = input.error;
      if (claim.attempts >= input.maxAttempts) claim.status = "failed";
    },
    async reclaimFailed(ref) {
      const claim = claims.get(ref);
      if (!claim || claim.status !== "failed") return false;
      claim.status = "claimed";
      return true;
    },
    async markMailSent(ref) {
      const claim = claims.get(ref);
      if (!claim || claim.status !== "fulfilled") return;
      claim.mailSent = true;
    },
  };
}

// ----------------------------------------------------------------
// The webhook's processing: verify, log, claim, answer.

export interface WebhookDeps {
  payments: PaymentsRouter;
  log: PaymentEventLog;
  claims: FulfilmentClaimStore;
  // checkout_paid, recorded server-side at the claim —
  // never from a browser beacon, copying no order
  // fields (M7.14). Fire-and-forget by contract.
  recordCheckoutPaid: () => void;
  now?: () => Date;
}

export type WebhookOutcome =
  // The event could not be verified: refused, unlogged.
  | { kind: "refused"; reason: string }
  // Verified and logged; nothing to fulfil (every
  // event that is not a succeeded payment, and a
  // succeeded event that is not one of ours to fulfil).
  | { kind: "logged" }
  // Verified, logged, and the fulfilment claimed.
  | { kind: "claimed" }
  // Verified and logged; the claim already stood — the
  // redelivery changed nothing.
  | { kind: "duplicate" };

export async function processWebhookEvent(
  deps: WebhookDeps,
  input: { payload: string; signature: string },
): Promise<WebhookOutcome> {
  const verdict = deps.payments.verifyWebhookEvent(input);
  if (!verdict.ok) return { kind: "refused", reason: verdict.reason };

  const now = deps.now ? deps.now() : new Date();
  const email = verdict.metadata[PAYMENT_METADATA_EMAIL] ?? null;
  const postcode = verdict.metadata[PAYMENT_METADATA_POSTCODE] ?? null;
  const homeKey = verdict.metadata[PAYMENT_METADATA_HOME_KEY] ?? null;
  const testOrder = verdict.metadata[PAYMENT_METADATA_TEST] === "true";

  // The log comes first — every verified event,
  // whatever happens next (founder amendment).
  await deps.log.record({
    eventType: verdict.type,
    intentId: verdict.intentId,
    status: verdict.status,
    email,
    postcode,
    homeKey,
    livemode: verdict.livemode,
    testOrder,
    now,
  });

  const isSucceededPayment =
    verdict.type === "payment_intent.succeeded" && verdict.status === "succeeded";
  if (!isSucceededPayment || !verdict.intentId || !email || !postcode) {
    return { kind: "logged" };
  }

  // The claim is taken BEFORE any delivery machinery
  // can run — the worker fulfils claims, never events.
  const claimed = await deps.claims.claim({
    ref: verdict.intentId,
    kind: "paid",
    email,
    postcode,
    homeKey,
    testOrder,
    now,
  });
  if (!claimed) return { kind: "duplicate" };
  deps.recordCheckoutPaid();
  return { kind: "claimed" };
}

// ----------------------------------------------------------------
// The worker: claims in, delivered reports out.

export interface FulfilmentDeps {
  claims: FulfilmentClaimStore;
  // Resolve the claim's home the serve layer's way.
  resolve: (postcode: string, homeKey: string | null) => Promise<AddressResolution | null>;
  // Compose the report and store its PDF — the one
  // rendering path (see the header). Answers the stored
  // file's key and name and the delivery's titles, all
  // from the composed view itself.
  buildPdf: (
    resolution: AddressResolution,
    claim: FulfilmentClaim,
  ) => Promise<{
    pdfKey: string;
    fileName: string;
    homeTitle: string;
    homeAddressLine: string;
  }>;
  // The delivery service (M8.6), or null where the
  // environment cannot deliver (no signing secret) —
  // a claim that meets null fails honestly, never
  // half-delivers.
  deliver:
    | ((input: {
        email: string;
        kind: FulfilmentKind;
        pdfKey: string;
        fileName: string;
        homeTitle: string;
        homeAddressLine: string;
        orderRef: string;
        origin: string;
      }) => Promise<DeliverReportOutcome>)
    | null;
  // Consume a gift at delivery (gifted claims only) —
  // the gift store's markRedeemed, which records
  // gift_redeemed at the same moment.
  redeemGift: (token: string, now: Date) => Promise<unknown>;
  // report_delivered, recorded server-side at delivery
  // — the payment funnel's last step (Amendment B).
  recordDelivered: () => void;
  // The public origin the delivery email's links are
  // built on (the worker has no request to read it
  // from: APP_ORIGIN, else the site's own URL).
  origin: string;
  maxAttempts?: number;
  now?: () => Date;
}

export type FulfilOneOutcome = { outcome: "fulfilled" } | { outcome: "failed"; error: string };

const DEFAULT_MAX_ATTEMPTS = 3;

export function createFulfilmentService(deps: FulfilmentDeps) {
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const now = () => (deps.now ? deps.now() : new Date());

  async function fulfilClaim(claim: FulfilmentClaim): Promise<FulfilOneOutcome> {
    try {
      if (!deps.deliver) throw new Error("delivery-not-configured");
      const resolution = await deps.resolve(claim.postcode, claim.homeKey);
      if (!resolution) throw new Error("home-not-resolved");
      const pdf = await deps.buildPdf(resolution, claim);
      const outcome = await deps.deliver({
        email: claim.email,
        kind: claim.kind,
        pdfKey: pdf.pdfKey,
        fileName: pdf.fileName,
        homeTitle: pdf.homeTitle,
        homeAddressLine: pdf.homeAddressLine,
        orderRef: claim.ref,
        origin: deps.origin,
      });
      // Consumption at delivery, not before (the gift
      // lifecycle's rule): the gifted delivery and the
      // redemption land together, so an abandoned or
      // failed gifted order burns nothing.
      if (claim.kind === "gifted" && claim.giftToken) {
        await deps.redeemGift(claim.giftToken, now());
      }
      await deps.claims.markFulfilled(claim.ref, {
        deliveryId: outcome.delivery.id,
        mailSent: outcome.mail.sent,
        now: now(),
      });
      deps.recordDelivered();
      return { outcome: "fulfilled" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "fulfilment-failed";
      await deps.claims.recordFailure(claim.ref, { error: message, maxAttempts });
      return { outcome: "failed", error: message };
    }
  }

  return {
    fulfilClaim,
    // One worker pass: every waiting claim, oldest
    // first, up to the bound. A claim that fails does
    // not stop the pass — its error is on its own row.
    async runPending(
      limit = 10,
    ): Promise<{ processed: number; fulfilled: number; failed: number }> {
      const waiting = await deps.claims.pending(limit);
      let fulfilled = 0;
      let failed = 0;
      for (const claim of waiting) {
        const result = await fulfilClaim(claim);
        if (result.outcome === "fulfilled") fulfilled += 1;
        else failed += 1;
      }
      return { processed: waiting.length, fulfilled, failed };
    },
  };
}

export function getWebhookDeps(router: PaymentsRouter): WebhookDeps {
  const pool = getDbPool();
  return {
    payments: router,
    log: createDbPaymentEventLog(pool),
    claims: createDbFulfilmentClaimStore(pool),
    recordCheckoutPaid: () => {
      void recordJourneyEvent(pool, { event: "checkout_paid", routePattern: "/report" });
    },
  };
}
