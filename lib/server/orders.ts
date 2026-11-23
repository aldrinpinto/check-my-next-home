// The order record (plan step M9.10; the adopted
// M9.10 prep, gaps 2, 3 and 9) — the business record
// of an order's whole life, assembled over the three
// shelves migration 0040 built for it (payment_events,
// fulfilment_claims, report_deliveries) and kept in
// its own tables (migration 0043): orders, and the
// order_delivery_log beside it.
//
// THE SHAPE, in the house pattern (lib/server/gifts
// .ts): an interface, a database implementation, and
// an in-memory implementation the tests run. Rows are
// written where claims are taken — a paid order in
// webhook processing from the VERIFIED event (its
// consent pair threaded from the payment's metadata),
// gifted and free orders at their own claim sites
// with the money fields honestly null — and the write
// is insert-or-nothing: the claim's primary key
// already guarantees one claim per order, and the
// record inherits that guarantee rather than
// re-inventing it (prep point 14).
//
// The record carries the step's two exactly-once
// notice markers (the sale alert, the failure-notice
// pair): each marker is claimed by a guarded write
// that answers whether THIS caller won it, so a
// re-run, a restart or a redelivery can never produce
// a second notice — and a notice whose send failed is
// never marked, so a later pass retries it (the
// failure pair's discipline, prep gap 6).
//
// refund_status stands on the row from birth ('none')
// — created here for the refund mechanics per prep
// gap 9, with the reconciliation migration 0043's
// header records: M9.8's built truth lives in
// payment_refunds and is read live; this column is
// the record's own standing, not that authority.

import type { AddressQueryable } from "../address";
import { normaliseEmail } from "../gift";
import type { FulfilmentKind } from "./fulfilment";

export interface OrderRecord {
  // The claim's reference — the order's key.
  ref: string;
  kind: FulfilmentKind;
  email: string;
  postcode: string;
  homeKey: string | null;
  // Paid orders only; null for gifted and free.
  amount: number | null;
  currency: string | null;
  providerRef: string | null;
  // The consent pair (M9.5), threaded from the
  // verified event's metadata. Paid orders only.
  consentTick: boolean | null;
  consentTimestamp: string | null;
  // The stored report's delivery, once fulfilled.
  deliveryId: string | null;
  refundStatus: string;
  testOrder: boolean;
  saleAlertSentAt: Date | null;
  failureNoticeSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DeliveryLogKind = "delivery" | "buyer-resend" | "owner-resend";

export interface DeliveryLogEntry {
  id: number;
  orderRef: string;
  deliveryId: string | null;
  kind: DeliveryLogKind;
  sent: boolean;
  detail: string | null;
  createdAt: Date;
}

export interface OrderStore {
  // Write the record where the claim is taken.
  // Insert-or-nothing: a record that already stands is
  // answered unchanged (the duplicate-webhook case).
  recordClaim(input: {
    ref: string;
    kind: FulfilmentKind;
    email: string;
    postcode: string;
    homeKey: string | null;
    amount?: number | null;
    currency?: string | null;
    providerRef?: string | null;
    consentTick?: boolean | null;
    consentTimestamp?: string | null;
    testOrder?: boolean;
    now?: Date;
  }): Promise<OrderRecord>;
  getByRef(ref: string): Promise<OrderRecord | null>;
  // The lookup tool's searches (prep gap 10): every
  // order standing under a buyer email (stored
  // normalised; the search normalises the same way),
  // or under a postcode (compared in the directory's
  // own form — trimmed, upper-cased), newest first.
  findByEmail(email: string): Promise<OrderRecord[]>;
  findByPostcode(postcode: string): Promise<OrderRecord[]>;
  // The fulfilment landed: the record names its
  // delivery. Only an unfilled delivery slot moves.
  markDelivered(ref: string, deliveryId: string, now: Date): Promise<void>;
  // Write a notice marker WITH its send (prep gaps 1
  // and 6): called only after the send succeeded, and
  // answers true where THIS call set it — the guarded
  // write means a marker can only ever be set once,
  // so no second notice can be justified by it. A
  // send that failed is never marked, and a later
  // pass retries the notice.
  markSaleAlertSent(ref: string, now: Date): Promise<boolean>;
  markFailureNoticeSent(ref: string, now: Date): Promise<boolean>;
  // Orders whose claims stand terminally failed with
  // their failure notice still unsent — the worker
  // sweep's retry list (prep gap 6). The DB
  // implementation joins the claim shelf in SQL (only
  // a failed claim's order is a candidate); the memory
  // implementation cannot join, so it answers by the
  // marker alone and the sweep confirms the claim's
  // state before sending — one shape, both honest.
  listFailureNoticePending(limit: number): Promise<OrderRecord[]>;
  // Paid orders standing fulfilled (a delivery stands
  // against them) with their sale alert still unsent —
  // the same sweep's other list: a sale alert whose
  // send failed at fulfilment is retried from here,
  // under its marker's exactly-once guard.
  listSaleAlertPending(limit: number): Promise<OrderRecord[]>;
  // The refund standing, as this record carries it
  // (see the header): set by name, never unset back
  // past a refund.
  markRefundStatus(ref: string, status: string, now: Date): Promise<void>;
  // Every order taken inside a window, newest first
  // (the admin page's period reads, M9.11).
  listInPeriod(filter: { from: Date; to: Date }): Promise<OrderRecord[]>;
  // The delivery/resend log: one row per delivery or
  // re-send, written whether the send succeeded or
  // failed, with its outcome.
  logDelivery(input: {
    orderRef: string;
    deliveryId?: string | null;
    kind: DeliveryLogKind;
    sent: boolean;
    detail?: string | null;
    now?: Date;
  }): Promise<DeliveryLogEntry>;
  listDeliveryLog(orderRef: string): Promise<DeliveryLogEntry[]>;
}

interface OrderRow {
  ref: string;
  kind: FulfilmentKind;
  email: string;
  postcode: string;
  home_key: string | null;
  amount: number | null;
  currency: string | null;
  provider_ref: string | null;
  consent_tick: boolean | null;
  consent_timestamp: string | null;
  delivery_id: string | null;
  refund_status: string;
  test_order: boolean;
  sale_alert_sent_at: Date | null;
  failure_notice_sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toOrder(row: OrderRow): OrderRecord {
  return {
    ref: row.ref,
    kind: row.kind,
    email: row.email,
    postcode: row.postcode,
    homeKey: row.home_key,
    amount: row.amount,
    currency: row.currency,
    providerRef: row.provider_ref,
    consentTick: row.consent_tick,
    consentTimestamp: row.consent_timestamp,
    deliveryId: row.delivery_id,
    refundStatus: row.refund_status,
    testOrder: row.test_order,
    saleAlertSentAt: row.sale_alert_sent_at ? new Date(row.sale_alert_sent_at) : null,
    failureNoticeSentAt: row.failure_notice_sent_at ? new Date(row.failure_notice_sent_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const ORDER_COLUMNS = `ref, kind, email, postcode, home_key, amount, currency,
  provider_ref, consent_tick, consent_timestamp, delivery_id, refund_status,
  test_order, sale_alert_sent_at, failure_notice_sent_at, created_at, updated_at`;

interface LogRow {
  id: number;
  order_ref: string;
  delivery_id: string | null;
  kind: DeliveryLogKind;
  sent: boolean;
  detail: string | null;
  created_at: Date;
}

function toLogEntry(row: LogRow): DeliveryLogEntry {
  return {
    id: Number(row.id),
    orderRef: row.order_ref,
    deliveryId: row.delivery_id,
    kind: row.kind,
    sent: row.sent,
    detail: row.detail,
    createdAt: new Date(row.created_at),
  };
}

const LOG_COLUMNS = `id, order_ref, delivery_id, kind, sent, detail, created_at`;

function normalisePostcode(postcode: string): string {
  return postcode.trim().toUpperCase();
}

export function createDbOrderStore(db: AddressQueryable): OrderStore {
  async function getByRef(ref: string): Promise<OrderRecord | null> {
    const { rows } = await db.query(`SELECT ${ORDER_COLUMNS} FROM orders WHERE ref = $1`, [ref]);
    const row = (rows as unknown as OrderRow[])[0];
    return row ? toOrder(row) : null;
  }

  return {
    async recordClaim(input) {
      const now = input.now ?? new Date();
      await db.query(
        `INSERT INTO orders (${ORDER_COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, 'none', $11, NULL, NULL, $12, $12)
         ON CONFLICT (ref) DO NOTHING`,
        [
          input.ref,
          input.kind,
          normaliseEmail(input.email),
          input.postcode,
          input.homeKey,
          input.amount ?? null,
          input.currency ?? null,
          input.providerRef ?? null,
          input.consentTick ?? null,
          input.consentTimestamp ?? null,
          input.testOrder ?? false,
          now,
        ],
      );
      const record = await getByRef(input.ref);
      if (!record) throw new Error("order-record-lost");
      return record;
    },

    getByRef,

    async findByEmail(email) {
      const { rows } = await db.query(
        `SELECT ${ORDER_COLUMNS} FROM orders WHERE email = $1 ORDER BY created_at DESC`,
        [normaliseEmail(email)],
      );
      return (rows as unknown as OrderRow[]).map(toOrder);
    },

    async findByPostcode(postcode) {
      const { rows } = await db.query(
        `SELECT ${ORDER_COLUMNS} FROM orders
          WHERE upper(postcode) = $1 ORDER BY created_at DESC`,
        [normalisePostcode(postcode)],
      );
      return (rows as unknown as OrderRow[]).map(toOrder);
    },

    async markDelivered(ref, deliveryId, now) {
      await db.query(
        `UPDATE orders SET delivery_id = $2, updated_at = $3
          WHERE ref = $1 AND delivery_id IS NULL`,
        [ref, deliveryId, now],
      );
    },

    async markSaleAlertSent(ref, now) {
      const { rows } = await db.query(
        `UPDATE orders SET sale_alert_sent_at = $2, updated_at = $2
          WHERE ref = $1 AND sale_alert_sent_at IS NULL
          RETURNING ref`,
        [ref, now],
      );
      return rows.length > 0;
    },

    async markFailureNoticeSent(ref, now) {
      const { rows } = await db.query(
        `UPDATE orders SET failure_notice_sent_at = $2, updated_at = $2
          WHERE ref = $1 AND failure_notice_sent_at IS NULL
          RETURNING ref`,
        [ref, now],
      );
      return rows.length > 0;
    },

    async listFailureNoticePending(limit) {
      // Joined to the claim shelf: only a TERMINALLY
      // failed claim's order is a candidate. Without
      // the join, every ordinary fulfilled order (whose
      // failure marker rightly stands unset forever)
      // would crowd the sweep's bound and starve the
      // genuinely failed orders behind it.
      const { rows } = await db.query(
        `SELECT o.ref, o.kind, o.email, o.postcode, o.home_key, o.amount,
                o.currency, o.provider_ref, o.consent_tick, o.consent_timestamp,
                o.delivery_id, o.refund_status, o.test_order,
                o.sale_alert_sent_at, o.failure_notice_sent_at,
                o.created_at, o.updated_at
           FROM orders o
           JOIN fulfilment_claims c ON c.ref = o.ref
          WHERE o.failure_notice_sent_at IS NULL AND c.status = 'failed'
          ORDER BY o.created_at ASC
          LIMIT $1`,
        [limit],
      );
      return (rows as unknown as OrderRow[]).map(toOrder);
    },

    async listSaleAlertPending(limit) {
      const { rows } = await db.query(
        `SELECT ${ORDER_COLUMNS} FROM orders
          WHERE kind = 'paid' AND delivery_id IS NOT NULL AND sale_alert_sent_at IS NULL
          ORDER BY created_at ASC
          LIMIT $1`,
        [limit],
      );
      return (rows as unknown as OrderRow[]).map(toOrder);
    },

    async markRefundStatus(ref, status, now) {
      await db.query(`UPDATE orders SET refund_status = $2, updated_at = $3 WHERE ref = $1`, [
        ref,
        status,
        now,
      ]);
    },

    async listInPeriod(filter) {
      const { rows } = await db.query(
        `SELECT ${ORDER_COLUMNS} FROM orders
          WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at DESC`,
        [filter.from, filter.to],
      );
      return (rows as unknown as OrderRow[]).map(toOrder);
    },

    async logDelivery(input) {
      const { rows } = await db.query(
        `INSERT INTO order_delivery_log (order_ref, delivery_id, kind, sent, detail, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${LOG_COLUMNS}`,
        [
          input.orderRef,
          input.deliveryId ?? null,
          input.kind,
          input.sent,
          input.detail ?? null,
          input.now ?? new Date(),
        ],
      );
      return toLogEntry((rows as unknown as LogRow[])[0]);
    },

    async listDeliveryLog(orderRef) {
      const { rows } = await db.query(
        `SELECT ${LOG_COLUMNS} FROM order_delivery_log
          WHERE order_ref = $1 ORDER BY created_at ASC, id ASC`,
        [orderRef],
      );
      return (rows as unknown as LogRow[]).map(toLogEntry);
    },
  };
}

// The in-memory implementation the tests run.
export function createMemoryOrderStore(): OrderStore & {
  orders: Map<string, OrderRecord>;
  log: DeliveryLogEntry[];
} {
  const orders = new Map<string, OrderRecord>();
  const log: DeliveryLogEntry[] = [];
  let nextId = 1;
  const clone = (record: OrderRecord): OrderRecord => ({ ...record });

  return {
    orders,
    log,
    async recordClaim(input) {
      const existing = orders.get(input.ref);
      if (existing) return clone(existing);
      const now = input.now ?? new Date();
      const record: OrderRecord = {
        ref: input.ref,
        kind: input.kind,
        email: normaliseEmail(input.email),
        postcode: input.postcode,
        homeKey: input.homeKey,
        amount: input.amount ?? null,
        currency: input.currency ?? null,
        providerRef: input.providerRef ?? null,
        consentTick: input.consentTick ?? null,
        consentTimestamp: input.consentTimestamp ?? null,
        deliveryId: null,
        refundStatus: "none",
        testOrder: input.testOrder ?? false,
        saleAlertSentAt: null,
        failureNoticeSentAt: null,
        createdAt: now,
        updatedAt: now,
      };
      orders.set(record.ref, record);
      return clone(record);
    },
    async getByRef(ref) {
      const record = orders.get(ref);
      return record ? clone(record) : null;
    },
    async findByEmail(email) {
      const wanted = normaliseEmail(email);
      return [...orders.values()]
        .filter((record) => record.email === wanted)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(clone);
    },
    async findByPostcode(postcode) {
      const wanted = normalisePostcode(postcode);
      return [...orders.values()]
        .filter((record) => normalisePostcode(record.postcode) === wanted)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(clone);
    },
    async markDelivered(ref, deliveryId, now) {
      const record = orders.get(ref);
      if (!record || record.deliveryId) return;
      record.deliveryId = deliveryId;
      record.updatedAt = now;
    },
    async markSaleAlertSent(ref, now) {
      const record = orders.get(ref);
      if (!record || record.saleAlertSentAt) return false;
      record.saleAlertSentAt = now;
      record.updatedAt = now;
      return true;
    },
    async markFailureNoticeSent(ref, now) {
      const record = orders.get(ref);
      if (!record || record.failureNoticeSentAt) return false;
      record.failureNoticeSentAt = now;
      record.updatedAt = now;
      return true;
    },
    async listFailureNoticePending(limit) {
      return [...orders.values()]
        .filter((record) => !record.failureNoticeSentAt)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit)
        .map(clone);
    },
    async listSaleAlertPending(limit) {
      return [...orders.values()]
        .filter(
          (record) =>
            record.kind === "paid" && record.deliveryId !== null && !record.saleAlertSentAt,
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit)
        .map(clone);
    },
    async markRefundStatus(ref, status, now) {
      const record = orders.get(ref);
      if (!record) return;
      record.refundStatus = status;
      record.updatedAt = now;
    },
    async listInPeriod(filter) {
      return [...orders.values()]
        .filter((record) => record.createdAt >= filter.from && record.createdAt < filter.to)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(clone);
    },
    async logDelivery(input) {
      const entry: DeliveryLogEntry = {
        id: nextId++,
        orderRef: input.orderRef,
        deliveryId: input.deliveryId ?? null,
        kind: input.kind,
        sent: input.sent,
        detail: input.detail ?? null,
        createdAt: input.now ?? new Date(),
      };
      log.push(entry);
      return { ...entry };
    },
    async listDeliveryLog(orderRef) {
      return log.filter((entry) => entry.orderRef === orderRef).map((entry) => ({ ...entry }));
    },
  };
}
