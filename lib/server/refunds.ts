// Refunds (plan step M9.8; the adopted M9.8 prep) —
// the refund record, and the one consequence
// transition a completed full refund fires.
//
// THE SHAPE: refunds are made by the founder in the
// Stripe dashboard (no site trigger, no refund API
// call, no refund email from us). This side LEARNS:
// the webhook receiver hands every verified refund
// event (refund.created / refund.updated /
// refund.failed) to this module, which keeps the
// books in payment_refunds (migration 0042) — one row
// per provider refund, keyed by the refund's own id —
// and, when the news completes a FULL refund, applies
// its consequences exactly once.
//
// THE RECORD IS AN OVERLAY, not the audit log: the
// payment_events trail (lib/server/payment-events.ts)
// stays the raw record of what the provider said, and
// a claim's own status is never rewritten to
// "refunded" as a history edit — the refund's truth
// lives here, beside the order's records, carrying
// everything the admin page (M9.11) reads back:
// status, amount, date, the gift consequence and the
// consequences-applied state.
//
// THE TRIGGER: consequences fire ONLY when the
// SUCCEEDED refunds against one payment sum to the
// report's full price — REPORT_PRICE_PENCE, the
// payments seam's single price source (lib/site.ts),
// never a second hard-coded figure. A pending or
// requires_action refund is recorded and changes
// nothing visible; a failed or canceled one is
// recorded and clears the way back to no-refund; a
// partial refund is recorded as partial and withdraws
// nothing. A later refund that completes the total
// fires the consequences then.
//
// THE TRANSITION is one idempotent act, guarded by
// the record's consequences-applied state: duplicate
// and out-of-order deliveries converge on the same
// end state, a stale pending or failed notice after
// completion never un-applies anything, and if
// applying fails partway the caller answers the
// provider with failure so the event retries and the
// retry finishes the same transition (every step
// below is safe to run twice). Everything is keyed to
// the ONE refunded payment reference — the claim, the
// deliveries and the gift that payment's order owns —
// never to a buyer email or a home, so a second
// genuine payment for the same home stands untouched.
//
// Disputes and chargebacks are out of scope entirely:
// not subscribed, not acted on, never renamed refunds.

import type { AddressQueryable } from "../address";
import { REPORT_PRICE_PENCE } from "../site";
import type { FulfilmentClaimStore } from "./fulfilment";
import type { GiftStore } from "./gifts";
import { PAYMENT_CURRENCY } from "./payments";
import type { DeliveryStore } from "./report-deliveries";

// ----------------------------------------------------------------
// The refund record

export interface PaymentRefund {
  // The provider refund's own id — the row's key.
  refundId: string;
  // The PaymentIntent the refund belongs to, read
  // from the refund object's own payment linkage —
  // the order's key everywhere else in the books.
  // Null only where the event named no payment.
  paymentRef: string | null;
  chargeRef: string | null;
  // Minor units, as the provider reported them.
  amount: number;
  currency: string;
  // The refund's current status as the provider last
  // reported it (pending / requires_action / succeeded
  // / failed / canceled) — under the monotonic rules
  // recordEvent keeps (see below).
  status: string;
  livemode: boolean | null;
  testOrder: boolean;
  // No order of ours stands behind this refund.
  unmatched: boolean;
  // The completed-full-refund consequences have been
  // applied for this payment. Set once, never unset.
  consequencesApplied: boolean;
  consequencesAppliedAt: Date | null;
  // What the transition did to the order's gift:
  // "voided" | "voided-claimed" | "redeemed-stood" |
  // "none"; null until applied.
  giftConsequence: string | null;
  // A failure notice arrived for a refund whose
  // standing already says the money went back:
  // recorded for the owner's eye, never acted on.
  needsAttention: boolean;
  providerCreatedAt: Date | null;
  firstHeardAt: Date;
  updatedAt: Date;
}

export interface RefundEventInput {
  refundId: string;
  paymentRef: string | null;
  chargeRef: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  livemode: boolean | null;
  providerCreatedAt: Date | null;
  // Whether the order behind the payment is a TEST
  // order — resolved by the caller from the order's
  // own records where they stand (the claim), never
  // guessed from the refund object, which carries no
  // metadata of ours.
  testOrder: boolean;
  now: Date;
}

export interface RefundStore {
  // Record one refund event's news: insert the row on
  // first hearing, fold later news into it under the
  // monotonic rules — a succeeded standing is never
  // rewritten downwards by a stale pending notice, a
  // failure notice against a succeeded or applied
  // refund raises needsAttention instead of rewriting
  // the standing, and the consequences-applied state
  // is never unset here.
  recordEvent(input: RefundEventInput): Promise<PaymentRefund>;
  listByPayment(paymentRef: string): Promise<PaymentRefund[]>;
  // Every refund standing against any of a set of
  // payments, in one read (the admin page's period
  // assembly, M9.11 — the orders on screen name their
  // payments, and each order's refunds are read from
  // this one source).
  listByPayments(paymentRefs: string[]): Promise<PaymentRefund[]>;
  getByRefundId(refundId: string): Promise<PaymentRefund | null>;
  // Mark the transition applied: every succeeded
  // refund of the payment takes the applied state, the
  // moment and the gift consequence together.
  markConsequencesApplied(
    paymentRef: string,
    input: { giftConsequence: string; now: Date },
  ): Promise<void>;
}

// Whether a set of refund rows completes the full
// price: the succeeded ones, in the sale currency,
// summing to REPORT_PRICE_PENCE. The one trigger
// computation — the transition, the claim path's
// tombstone reading, the worker's guard and the
// success surface's overlay all read it from here.
export function refundTriggerMet(refunds: readonly PaymentRefund[]): boolean {
  const total = refunds
    .filter((refund) => refund.status === "succeeded" && refund.currency === PAYMENT_CURRENCY)
    .reduce((sum, refund) => sum + refund.amount, 0);
  return total >= REPORT_PRICE_PENCE;
}

function consequencesAppliedFor(refunds: readonly PaymentRefund[]): boolean {
  return refunds.some((refund) => refund.consequencesApplied);
}

const FAILURE_STATUSES = new Set(["failed", "canceled"]);

// The status a row takes when new news arrives, under
// the monotonic rules the prep pins: news may move a
// refund forward (pending → succeeded, pending →
// failed) but never backwards past a succeeded
// standing, and never anywhere once consequences
// stand applied. A failure notice that cannot move
// the status raises the attention flag instead.
function foldStatus(
  existing: PaymentRefund,
  incoming: string,
): { status: string; needsAttention: boolean } {
  let needsAttention = existing.needsAttention;
  if (existing.consequencesApplied) {
    if (FAILURE_STATUSES.has(incoming)) needsAttention = true;
    return { status: existing.status, needsAttention };
  }
  if (existing.status === "succeeded") {
    if (FAILURE_STATUSES.has(incoming)) needsAttention = true;
    return { status: existing.status, needsAttention };
  }
  return { status: incoming, needsAttention };
}

function foldEvent(existing: PaymentRefund | null, input: RefundEventInput): PaymentRefund {
  if (!existing) {
    return {
      refundId: input.refundId,
      paymentRef: input.paymentRef,
      chargeRef: input.chargeRef,
      amount: input.amount ?? 0,
      currency: input.currency ?? "",
      status: input.status ?? "pending",
      livemode: input.livemode,
      testOrder: input.testOrder,
      unmatched: input.paymentRef === null,
      consequencesApplied: false,
      consequencesAppliedAt: null,
      giftConsequence: null,
      needsAttention: false,
      providerCreatedAt: input.providerCreatedAt,
      firstHeardAt: input.now,
      updatedAt: input.now,
    };
  }
  const folded = foldStatus(existing, input.status ?? existing.status);
  const paymentRef = existing.paymentRef ?? input.paymentRef;
  return {
    ...existing,
    paymentRef,
    chargeRef: input.chargeRef ?? existing.chargeRef,
    amount: input.amount ?? existing.amount,
    currency: input.currency ?? existing.currency,
    status: folded.status,
    livemode: input.livemode ?? existing.livemode,
    testOrder: input.testOrder,
    unmatched: paymentRef === null,
    needsAttention: folded.needsAttention,
    providerCreatedAt: input.providerCreatedAt ?? existing.providerCreatedAt,
    updatedAt: input.now,
  };
}

// ----------------------------------------------------------------
// The database store (migration 0042's table)

interface RefundRow {
  refund_id: string;
  payment_ref: string | null;
  charge_ref: string | null;
  amount: number;
  currency: string;
  status: string;
  livemode: boolean | null;
  test_order: boolean;
  unmatched: boolean;
  consequences_applied: boolean;
  consequences_applied_at: Date | null;
  gift_consequence: string | null;
  needs_attention: boolean;
  provider_created_at: Date | null;
  first_heard_at: Date;
  updated_at: Date;
}

function toRefund(row: RefundRow): PaymentRefund {
  return {
    refundId: row.refund_id,
    paymentRef: row.payment_ref,
    chargeRef: row.charge_ref,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    livemode: row.livemode,
    testOrder: row.test_order,
    unmatched: row.unmatched,
    consequencesApplied: row.consequences_applied,
    consequencesAppliedAt: row.consequences_applied_at
      ? new Date(row.consequences_applied_at)
      : null,
    giftConsequence: row.gift_consequence,
    needsAttention: row.needs_attention,
    providerCreatedAt: row.provider_created_at ? new Date(row.provider_created_at) : null,
    firstHeardAt: new Date(row.first_heard_at),
    updatedAt: new Date(row.updated_at),
  };
}

const REFUND_COLUMNS = `refund_id, payment_ref, charge_ref, amount, currency,
  status, livemode, test_order, unmatched, consequences_applied,
  consequences_applied_at, gift_consequence, needs_attention,
  provider_created_at, first_heard_at, updated_at`;

export function createDbRefundStore(db: AddressQueryable): RefundStore {
  async function getByRefundId(refundId: string): Promise<PaymentRefund | null> {
    const { rows } = await db.query(
      `SELECT ${REFUND_COLUMNS} FROM payment_refunds WHERE refund_id = $1`,
      [refundId],
    );
    const row = (rows as unknown as RefundRow[])[0];
    return row ? toRefund(row) : null;
  }

  return {
    async recordEvent(input) {
      const existing = await getByRefundId(input.refundId);
      const record = foldEvent(existing, input);
      if (!existing) {
        await db.query(
          `INSERT INTO payment_refunds (${REFUND_COLUMNS})
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            record.refundId,
            record.paymentRef,
            record.chargeRef,
            record.amount,
            record.currency,
            record.status,
            record.livemode,
            record.testOrder,
            record.unmatched,
            record.consequencesApplied,
            record.consequencesAppliedAt,
            record.giftConsequence,
            record.needsAttention,
            record.providerCreatedAt,
            record.firstHeardAt,
            record.updatedAt,
          ],
        );
        return record;
      }
      await db.query(
        `UPDATE payment_refunds
            SET payment_ref = $2, charge_ref = $3, amount = $4, currency = $5,
                status = $6, livemode = $7, test_order = $8, unmatched = $9,
                needs_attention = $10, provider_created_at = $11, updated_at = $12
          WHERE refund_id = $1`,
        [
          record.refundId,
          record.paymentRef,
          record.chargeRef,
          record.amount,
          record.currency,
          record.status,
          record.livemode,
          record.testOrder,
          record.unmatched,
          record.needsAttention,
          record.providerCreatedAt,
          record.updatedAt,
        ],
      );
      return record;
    },

    async listByPayment(paymentRef) {
      const { rows } = await db.query(
        `SELECT ${REFUND_COLUMNS} FROM payment_refunds
          WHERE payment_ref = $1 ORDER BY first_heard_at ASC`,
        [paymentRef],
      );
      return (rows as unknown as RefundRow[]).map(toRefund);
    },

    async listByPayments(paymentRefs) {
      if (paymentRefs.length === 0) return [];
      const { rows } = await db.query(
        `SELECT ${REFUND_COLUMNS} FROM payment_refunds
          WHERE payment_ref = ANY($1) ORDER BY first_heard_at ASC`,
        [paymentRefs],
      );
      return (rows as unknown as RefundRow[]).map(toRefund);
    },

    getByRefundId,

    async markConsequencesApplied(paymentRef, input) {
      await db.query(
        `UPDATE payment_refunds
            SET consequences_applied = true, consequences_applied_at = $2,
                gift_consequence = $3
          WHERE payment_ref = $1 AND status = 'succeeded' AND consequences_applied = false`,
        [paymentRef, input.now, input.giftConsequence],
      );
    },
  };
}

// The in-memory implementation the tests run.
export function createMemoryRefundStore(): RefundStore & {
  refunds: Map<string, PaymentRefund>;
} {
  const refunds = new Map<string, PaymentRefund>();
  const clone = (record: PaymentRefund): PaymentRefund => ({ ...record });
  return {
    refunds,
    async recordEvent(input) {
      const existing = refunds.get(input.refundId) ?? null;
      const record = foldEvent(existing ? clone(existing) : null, input);
      refunds.set(record.refundId, record);
      return clone(record);
    },
    async listByPayment(paymentRef) {
      return [...refunds.values()]
        .filter((refund) => refund.paymentRef === paymentRef)
        .sort((a, b) => a.firstHeardAt.getTime() - b.firstHeardAt.getTime())
        .map(clone);
    },
    async listByPayments(paymentRefs) {
      const wanted = new Set(paymentRefs);
      return [...refunds.values()]
        .filter((refund) => refund.paymentRef !== null && wanted.has(refund.paymentRef))
        .sort((a, b) => a.firstHeardAt.getTime() - b.firstHeardAt.getTime())
        .map(clone);
    },
    async getByRefundId(refundId) {
      const record = refunds.get(refundId);
      return record ? clone(record) : null;
    },
    async markConsequencesApplied(paymentRef, input) {
      for (const record of refunds.values()) {
        if (
          record.paymentRef === paymentRef &&
          record.status === "succeeded" &&
          !record.consequencesApplied
        ) {
          record.consequencesApplied = true;
          record.consequencesAppliedAt = input.now;
          record.giftConsequence = input.giftConsequence;
        }
      }
    },
  };
}

// ----------------------------------------------------------------
// The consequence transition

export interface RefundProcessing {
  // Record one verified refund event and, where it
  // completes a full refund, apply the consequences.
  // Throws where applying fails partway — the webhook
  // receiver answers the provider with failure so the
  // event retries and finishes the same transition.
  handleRefundEvent(input: RefundEventInput): Promise<{ applied: boolean }>;
  // Whether a completed full refund stands for this
  // payment — the tombstone reading the claim path,
  // the worker's guard and the success surface's
  // overlay all share.
  completedFullRefund(paymentRef: string): Promise<boolean>;
}

export function createRefundProcessing(deps: {
  refunds: RefundStore;
  claims: FulfilmentClaimStore;
  deliveries: DeliveryStore;
  gifts: GiftStore;
}): RefundProcessing {
  // The one transition, step by step; every step is
  // idempotent, so a retry after a partway failure
  // converges on the same end state. Answers the gift
  // consequence the books record.
  async function applyConsequences(
    paymentRef: string,
    refundId: string,
    now: Date,
  ): Promise<string> {
    // The claim: a still-waiting claim is retired as
    // refunded — never fulfilled, never issued a gift.
    // A fulfilled claim KEEPS its status (the refund
    // stands beside it as an overlay); a failed claim
    // stays failed — a refund opens no retake road.
    const claim = await deps.claims.getByRef(paymentRef);
    if (claim && claim.status === "claimed") {
      await deps.claims.markRefunded(paymentRef);
    }

    // The buyer's own deliveries — found by the order
    // reference the delivery itself carries, so the
    // withdrawal lands even where the claim's link to
    // its delivery is not the reader's path.
    for (const delivery of await deps.deliveries.listByOrderRef(paymentRef)) {
      await deps.deliveries.withdraw(delivery.id, refundId, now);
    }

    // The gift the order issued, keyed by the order
    // reference: Issued voids, Claimed voids (and its
    // waiting claim stops, its unredeemed delivery
    // withdraws), Redeemed stands untouched.
    const gift = await deps.gifts.voidByOrderRef(paymentRef, now);
    if (!gift) return "none";
    if (gift.status === "redeemed") return "redeemed-stood";
    if (gift.status !== "voided") return "none";
    if (!gift.claimedAt) return "voided";
    const giftedClaim = await deps.claims.getByRef(gift.token);
    if (giftedClaim && giftedClaim.status === "claimed") {
      await deps.claims.markRefunded(gift.token);
    }
    for (const delivery of await deps.deliveries.listByOrderRef(gift.token)) {
      await deps.deliveries.withdraw(delivery.id, refundId, now);
    }
    return "voided-claimed";
  }

  return {
    async handleRefundEvent(input) {
      await deps.refunds.recordEvent(input);
      if (!input.paymentRef) return { applied: false };
      const all = await deps.refunds.listByPayment(input.paymentRef);
      if (!refundTriggerMet(all)) return { applied: false };
      if (consequencesAppliedFor(all)) return { applied: false };
      const giftConsequence = await applyConsequences(input.paymentRef, input.refundId, input.now);
      await deps.refunds.markConsequencesApplied(input.paymentRef, {
        giftConsequence,
        now: input.now,
      });
      return { applied: true };
    },

    async completedFullRefund(paymentRef) {
      return refundTriggerMet(await deps.refunds.listByPayment(paymentRef));
    },
  };
}
