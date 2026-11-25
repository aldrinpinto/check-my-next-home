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
import { REPORT_PRICE_PENCE } from "../site";
import { getDbPool } from "./db";
import { recordJourneyEvent } from "./journey-events";
import type { OrderStore } from "./orders";
import { createDbPaymentEventLog, type PaymentEventLog } from "./payment-events";
import {
  PAYMENT_CURRENCY,
  PAYMENT_METADATA_CONSENT_TICK,
  PAYMENT_METADATA_CONSENT_TIMESTAMP,
  PAYMENT_METADATA_EMAIL,
  PAYMENT_METADATA_HOME_KEY,
  PAYMENT_METADATA_POSTCODE,
  PAYMENT_METADATA_TEST,
  type PaymentsRouter,
} from "./payments";
import type { DeliverReportOutcome } from "./report-delivery";
import type { RefundEventInput, RefundProcessing } from "./refunds";
import { createDbRefundStore, createRefundProcessing } from "./refunds";
import { createDbGiftStore } from "./gifts";
import { createDbDeliveryStore } from "./report-deliveries";
import { createDbSearchCountingStore, type SearchCountingStore } from "./search-counting";

// ----------------------------------------------------------------
// The claim store

export type FulfilmentKind = "paid" | "gifted" | "free";
export type FulfilmentStatus = "claimed" | "fulfilled" | "failed" | "refunded";

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
  // Every claim taken inside a window, oldest first
  // (the admin page's period reads, M9.11).
  listInPeriod(filter: { from: Date; to: Date }): Promise<FulfilmentClaim[]>;
  // Retire a still-waiting claim as REFUNDED (M9.8):
  // a completed full refund stands for its payment (or
  // its gift was voided), so the claim will never be
  // fulfilled and never issue a gift. Only a claim
  // still standing "claimed" moves; a fulfilled claim
  // keeps its status (the refund is an overlay beside
  // it) and a failed claim stays failed. The reason is
  // kept on the row.
  markRefunded(ref: string): Promise<void>;
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

    async markRefunded(ref) {
      await db.query(
        `UPDATE fulfilment_claims
            SET status = 'refunded', last_error = 'refunded'
          WHERE ref = $1 AND status = 'claimed'`,
        [ref],
      );
    },

    async listInPeriod(filter) {
      const { rows } = await db.query(
        `SELECT ${CLAIM_COLUMNS} FROM fulfilment_claims
          WHERE claimed_at >= $1 AND claimed_at < $2 ORDER BY claimed_at ASC`,
        [filter.from, filter.to],
      );
      return (rows as unknown as ClaimRow[]).map(toClaim);
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
    async markRefunded(ref) {
      const claim = claims.get(ref);
      if (!claim || claim.status !== "claimed") return;
      claim.status = "refunded";
      claim.lastError = "refunded";
    },
    async listInPeriod(filter) {
      return [...claims.values()]
        .filter((claim) => claim.claimedAt >= filter.from && claim.claimedAt < filter.to)
        .sort((a, b) => a.claimedAt.getTime() - b.claimedAt.getTime())
        .map(clone);
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
  // The refund machinery (M9.8): refund events are
  // recorded against the refund record and their
  // consequences applied here; the claim path reads
  // the same processing for its tombstone. Optional in
  // the type so older test harnesses stand unchanged;
  // the production wiring always provides it.
  refunds?: RefundProcessing;
  // The order record (M9.10): written where the paid
  // claim is taken, from the verified event. Optional
  // in the type so older test harnesses stand
  // unchanged; the production wiring always provides
  // it. A failed record write never un-takes a claim
  // that stands — the worker's notices backfill the
  // record at delivery (lib/server/order-notices.ts).
  orders?: OrderStore;
  // The failed-payment email (M9.10, prep gap 5 —
  // Sample 40), fired from here under the once-per-
  // intent discipline the event log and the claim
  // shelf together prove. Optional like the order
  // record; the production wiring always provides it.
  failedPaymentNotice?: (input: {
    email: string;
    postcode: string;
    homeKey: string | null;
  }) => Promise<void>;
  // The search counting (M9.11; the founder's ruling
  // of 22 Nov 2026): a paid claim counts as one
  // purchase under its postcode, attributed to the
  // search type that postcode's last counted check
  // began with — aggregate only, the counting store's
  // own shelves. Optional like the order record; the
  // production wiring always provides it. A failed
  // count never un-takes a claim that stands.
  searchCounting?: SearchCountingStore;
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
  | { kind: "duplicate" }
  // Verified, logged, and recorded against the refund
  // record (M9.8) — its consequences applied where the
  // refund completed in full.
  | { kind: "refund" };

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
  // BUG-290 — the TEST flag is the payment's own mode, not
  // the buyer's allowlist standing. The old reading took it
  // from the payment metadata's "test" key alone, which the
  // start writes only for allowlisted testers
  // (lib/server/payment-intent.ts) — every other buyer on
  // the sandbox keys read as a REAL order, and the admin
  // page's test toggle could not hide them (17 of 31
  // orders on the play site). The verified event's livemode
  // is the provider's own statement of the payment's mode:
  // test keys mean a test order, live keys mean a real one,
  // whatever the buyer. The metadata flag survives only as
  // the fallback for an event that carries no mode at all —
  // in production the provider always sets it — and where
  // the two disagree the money wins over the flag: a
  // live-mode payment carrying the TEST flag is real.
  const testOrder =
    verdict.livemode === false
      ? true
      : verdict.livemode === true
        ? false
        : verdict.metadata[PAYMENT_METADATA_TEST] === "true";

  // The log comes first — every verified event,
  // whatever happens next (founder amendment). An
  // event whose object names its payment (a refund, a
  // charge) is filed under that PaymentIntent
  // reference, so the order's event history joins up;
  // a payment event files under its own id, exactly as
  // before (M9.8, gap 4 — a refund filed under the
  // refund's own id would strand the order's trail).
  await deps.log.record({
    eventType: verdict.type,
    intentId: verdict.paymentIntentId ?? verdict.intentId,
    status: verdict.status,
    email,
    postcode,
    homeKey,
    livemode: verdict.livemode,
    testOrder,
    // The provider's own words for a failed payment
    // (M9.11), kept on the audit row for the admin
    // page's Needs a human panel.
    failureReason: verdict.failureMessage,
    now,
  });

  // Refund events (M9.8): recorded against the refund
  // record, with the consequences of a completed full
  // refund applied by the one transition. The Refund
  // object is the authority — charge.refunded is not
  // in this set and stays a logged event only. A
  // failure while applying propagates, so the route
  // answers the provider with failure and the event
  // retries into the same transition.
  if (
    verdict.type === "refund.created" ||
    verdict.type === "refund.updated" ||
    verdict.type === "refund.failed"
  ) {
    if (!deps.refunds || !verdict.refundId) return { kind: "logged" };
    const paymentRef = verdict.paymentIntentId;
    const orderClaim = paymentRef ? await deps.claims.getByRef(paymentRef) : null;
    const refundInput: RefundEventInput = {
      refundId: verdict.refundId,
      paymentRef,
      chargeRef: verdict.chargeId,
      amount: verdict.amount,
      currency: verdict.currency,
      status: verdict.status,
      livemode: verdict.livemode,
      providerCreatedAt: verdict.providerCreatedAt,
      // The order's own TEST flag where its claim
      // stands; else the event's mode (a test-mode
      // refund is a test order's refund).
      testOrder: orderClaim?.testOrder ?? verdict.livemode === false,
      now,
    };
    await deps.refunds.handleRefundEvent(refundInput);
    return { kind: "refund" };
  }

  // The failed-payment email (M9.10, prep gap 5 —
  // Sample 40): the buyer whose payment did not go
  // through hears so by email, once. The discipline
  // is proven from the shelves, not from a new flag:
  // the event log (written above, before this point)
  // counts the failures already standing against this
  // payment — the email fires only on the FIRST — and
  // no email fires at all where a claim already stands
  // for the payment (a success landed first; the
  // failure is a later chapter of a paid order, not a
  // lost sale). Stripe may deliver the same failure
  // twice and a buyer may fail repeatedly on one
  // payment (a mistyped number, then a decline): the
  // log's count absorbs both. The notice is a
  // courtesy beside the audit trail — its failure is
  // logged and swallowed, never a 500 the provider
  // would retry into a second email.
  if (
    verdict.type === "payment_intent.payment_failed" &&
    verdict.intentId &&
    email &&
    postcode &&
    deps.failedPaymentNotice
  ) {
    try {
      const failures = await deps.log.countEvents({
        eventType: verdict.type,
        intentId: verdict.intentId,
      });
      const claim = await deps.claims.getByRef(verdict.intentId);
      if (failures <= 1 && !claim) {
        await deps.failedPaymentNotice({ email, postcode, homeKey });
      }
    } catch (error) {
      console.warn(
        `failed-payment notice outcome=dropped payment=${verdict.intentId} reason=${
          error instanceof Error ? error.message.slice(0, 120) : "unknown"
        }`,
      );
    }
  }

  const isSucceededPayment =
    verdict.type === "payment_intent.succeeded" && verdict.status === "succeeded";
  if (!isSucceededPayment || !verdict.intentId || !email || !postcode) {
    return { kind: "logged" };
  }

  // BUG-330 — the price is the order's own: a succeeded
  // payment for any other amount, in any other currency,
  // is not a £4.99 report sale. The translator's verdict
  // carries the amount and the currency off the event
  // (lib/server/payments.ts's webhookObjectFields), so
  // the comparison is made here, before any claim is
  // taken: a mismatch — or an amount the event does not
  // carry at all — is logged and refused, and the
  // payment fulfils nothing. The refusal is visible in
  // the event log (written above, before this point)
  // and in this warning, rather than silently fulfilled.
  if (verdict.amount !== REPORT_PRICE_PENCE || verdict.currency !== PAYMENT_CURRENCY) {
    console.warn(
      `webhook amount-mismatch outcome=refused payment=${verdict.intentId} amount=${verdict.amount} currency=${verdict.currency}`,
    );
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
  if (claimed) deps.recordCheckoutPaid();

  // The search counting's purchase (M9.11): one paid
  // claim, one purchase counted under its postcode —
  // beside the claim, exactly where the order record
  // is written, and swallowed the same way: a dropped
  // count is a gap in a chart, never a lost order.
  if (claimed && deps.searchCounting) {
    try {
      await deps.searchCounting.notePurchase({ postcode, testOrder, now });
    } catch (error) {
      console.warn(
        `search counting outcome=dropped order=${verdict.intentId} reason=${
          error instanceof Error ? error.message.slice(0, 120) : "unknown"
        }`,
      );
    }
  }

  // The order record (M9.10, prep gaps 2 and 3):
  // written where the claim is taken, from the
  // VERIFIED event — the buyer, the home, the TEST
  // flag, and the consent pair threaded from the
  // payment's metadata (extending T-PAY-06's proof
  // from metadata to record). The amount is pinned
  // from the one price (REPORT_PRICE_PENCE, GBP) — and
  // BUG-330 has already read the event's own amount and
  // currency above and refused any mismatch, so the
  // pinned price is the verified price, not an
  // assumption. A varying price would still need the
  // record to carry the event's amount rather than the
  // pin (the prep's recorded limit stands in migration
  // 0043's header). Insert-or-nothing, so a redelivery's
  // record attempt is a no-op; a failed write is
  // logged and swallowed — the claim stands, and the
  // worker's notices backfill the record at delivery.
  if (deps.orders) {
    try {
      await deps.orders.recordClaim({
        ref: verdict.intentId,
        kind: "paid",
        email,
        postcode,
        homeKey,
        amount: REPORT_PRICE_PENCE,
        currency: PAYMENT_CURRENCY,
        providerRef: verdict.intentId,
        consentTick:
          verdict.metadata[PAYMENT_METADATA_CONSENT_TICK] === "true"
            ? true
            : verdict.metadata[PAYMENT_METADATA_CONSENT_TICK] === "false"
              ? false
              : null,
        consentTimestamp: verdict.metadata[PAYMENT_METADATA_CONSENT_TIMESTAMP] ?? null,
        testOrder,
        now,
      });
    } catch (error) {
      console.warn(
        `order record outcome=dropped order=${verdict.intentId} reason=${
          error instanceof Error ? error.message.slice(0, 120) : "unknown"
        }`,
      );
    }
  }

  // The tombstone (M9.8, gap 6): where a completed full
  // refund already stands for this payment — the refund
  // was heard before the success — the claim is born
  // refunded: retired at once, never fulfilled, never
  // issued a gift. The worker's own guard covers the
  // races on either side of this moment.
  if (deps.refunds && (await deps.refunds.completedFullRefund(verdict.intentId))) {
    await deps.claims.markRefunded(verdict.intentId);
  }
  return claimed ? { kind: "claimed" } : { kind: "duplicate" };
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
  // The refund stop (M9.8, gap 6): asked whether this
  // claim must never be fulfilled — a completed full
  // refund stands for a paid claim's payment, or a
  // gifted claim's gift has been voided. Consulted
  // before any work, and again immediately before the
  // delivery call (the irreversible moment — the
  // delivery issues the gift inside itself, so this
  // one check guards both). A claim it stops is
  // retired as refunded, never failed. Optional in the
  // type; the production wiring always provides it.
  stopCheck?: (claim: FulfilmentClaim) => Promise<"refunded" | null>;
  // The order notices (M9.10): the order record's
  // delivery entry and log row at fulfilment, the
  // sale alert, the terminal-failure pair, and the
  // retry sweep each worker pass opens with — all
  // lib/server/order-notices.ts's module, whose
  // contract is that NO method throws: a notice's
  // failure is a logged gap on the order record (its
  // marker unset, the sweep its road back), never a
  // reason to unpick a delivery that stands or spend
  // a claim's attempts. Optional in the type so older
  // test harnesses stand unchanged; the production
  // wiring always provides it. Stated structurally
  // here so this file never imports the notices
  // module (which itself assembles from this file's
  // claim store).
  orderNotices?: {
    delivered(
      claim: FulfilmentClaim,
      outcome: { deliveryId: string; mailSent: boolean },
    ): Promise<void>;
    saleAlert(claim: FulfilmentClaim): Promise<void>;
    failureNotices(claim: FulfilmentClaim): Promise<void>;
    sweep(): Promise<void>;
  };
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

export type FulfilOneOutcome =
  | { outcome: "fulfilled" }
  | { outcome: "failed"; error: string }
  // Stopped by the refund guard (M9.8): the claim was
  // retired as refunded — not a failure, and its
  // attempts were not spent.
  | { outcome: "refunded" };

const DEFAULT_MAX_ATTEMPTS = 3;

export function createFulfilmentService(deps: FulfilmentDeps) {
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const now = () => (deps.now ? deps.now() : new Date());

  async function fulfilClaim(claim: FulfilmentClaim): Promise<FulfilOneOutcome> {
    try {
      if (!deps.deliver) throw new Error("delivery-not-configured");
      // The refund stop, before any work (M9.8): a
      // claim under a completed refund — or a gifted
      // claim whose gift was voided — is retired as
      // refunded and never reaches the rendering path.
      // The check lives inside the guarded stretch on
      // purpose: where the check itself cannot be read,
      // the claim fails an attempt and is retried,
      // rather than delivering on an unproven standing.
      if (deps.stopCheck && (await deps.stopCheck(claim)) === "refunded") {
        await deps.claims.markRefunded(claim.ref);
        return { outcome: "refunded" };
      }
      const resolution = await deps.resolve(claim.postcode, claim.homeKey);
      if (!resolution) throw new Error("home-not-resolved");
      const pdf = await deps.buildPdf(resolution, claim);
      // And again immediately before delivering: a
      // refund that completed while this claim composed
      // still stops it — the delivery call below is the
      // irreversible moment (it issues the gift inside
      // itself), so this check guards the gift too.
      if (deps.stopCheck && (await deps.stopCheck(claim)) === "refunded") {
        await deps.claims.markRefunded(claim.ref);
        return { outcome: "refunded" };
      }
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
      // The order record and the sale alert (M9.10):
      // the record names its delivery and the delivery
      // log gains its row; a PAID claim's sale alert
      // fires here — at fulfilment (ruling R1), under
      // its marker's exactly-once guard, with the
      // stored PDF attached. The notices never throw,
      // so nothing here can unpick the delivery.
      if (deps.orderNotices) {
        await deps.orderNotices.delivered(claim, {
          deliveryId: outcome.delivery.id,
          mailSent: outcome.mail.sent,
        });
        if (claim.kind === "paid") await deps.orderNotices.saleAlert(claim);
      }
      return { outcome: "fulfilled" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "fulfilment-failed";
      await deps.claims.recordFailure(claim.ref, { error: message, maxAttempts });
      // The failure pair (M9.10, prep gap 6): only a
      // TERMINAL failure speaks — a claim with attempts
      // left retries in silence. Where this failure
      // exhausted the claim, the pair fires (the owner
      // alert for every kind; Sample 41 to paid buyers
      // only), under the order record's marker.
      if (deps.orderNotices) {
        const after = await deps.claims.getByRef(claim.ref).catch(() => null);
        if (after && after.status === "failed") {
          await deps.orderNotices.failureNotices(after);
        }
      }
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
      // The notices sweep (M9.10) opens the pass: an
      // earlier pass's unsent failure pair or sale
      // alert is retried before new work — under the
      // markers' guards, so nothing already sent is
      // ever sent again.
      if (deps.orderNotices) await deps.orderNotices.sweep();
      const waiting = await deps.claims.pending(limit);
      let fulfilled = 0;
      let failed = 0;
      for (const claim of waiting) {
        const result = await fulfilClaim(claim);
        if (result.outcome === "fulfilled") fulfilled += 1;
        else if (result.outcome === "failed") failed += 1;
        // A refunded claim counts in neither column:
        // it was processed, and it did not fail.
      }
      return { processed: waiting.length, fulfilled, failed };
    },
  };
}

export function getWebhookDeps(
  router: PaymentsRouter,
  options: {
    // The order record and the failed-payment email
    // (M9.10): the route builds them (the email's
    // try-again link is built on the request's public
    // origin, which only the route can see) and passes
    // them in, keeping this file's wiring free of the
    // notices module the worker's wiring assembles.
    orders?: OrderStore;
    failedPaymentNotice?: WebhookDeps["failedPaymentNotice"];
  } = {},
): WebhookDeps {
  const pool = getDbPool();
  const claims = createDbFulfilmentClaimStore(pool);
  return {
    payments: router,
    log: createDbPaymentEventLog(pool),
    claims,
    recordCheckoutPaid: () => {
      void recordJourneyEvent(pool, { event: "checkout_paid", routePattern: "/report" });
    },
    refunds: createRefundProcessing({
      refunds: createDbRefundStore(pool),
      claims,
      deliveries: createDbDeliveryStore(pool),
      gifts: createDbGiftStore(pool),
    }),
    orders: options.orders,
    failedPaymentNotice: options.failedPaymentNotice,
    searchCounting: createDbSearchCountingStore(pool),
  };
}
