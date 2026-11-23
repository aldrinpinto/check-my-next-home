// The payment events log (plan step M9.6, founder
// amendment 22 Nov 2026; migration 0040) — the audit
// shelf behind the webhook receiver.
//
// One row for EVERY verified webhook event, written
// before anything else happens with the event: the
// event's type, the payment's provider reference, its
// status, the delivery facts the payment was created
// with (email, postcode, home key — read back from the
// verified event's own metadata, never from anything a
// client sent), the event's mode (livemode) and the
// order's TEST-lane flag. Failed payments are rows
// here exactly as successes are — the log is the
// record of what the provider reported, all of it, and
// together with the fulfilment claims
// (lib/server/fulfilment.ts) and report_deliveries it
// is the audit trail M9.10's order record builds on.
//
// The seam in the house pattern (lib/server/gifts.ts):
// an interface, a database implementation, and an
// in-memory implementation the tests run. Recording is
// a write that throws on a backend failure — the
// receiver answers the provider only once the event
// stands logged, so a failed write is a retry the
// provider makes, never a silently lost event.

import type { AddressQueryable } from "../address";
import { normaliseEmail } from "../gift";

export interface PaymentEventRecord {
  eventType: string;
  intentId: string | null;
  status: string | null;
  email: string | null;
  postcode: string | null;
  homeKey: string | null;
  livemode: boolean | null;
  testOrder: boolean;
  // The provider's own words for a failed payment
  // (migration 0044, M9.11): read off the verified
  // event's object by the translator and kept here so
  // the admin page's Needs a human panel can show what
  // the provider said. Null for every other event, and
  // for failures recorded before the column existed.
  failureReason: string | null;
  receivedAt: Date;
}

export interface PaymentEventLog {
  record(input: {
    eventType: string;
    intentId: string | null;
    status: string | null;
    email: string | null;
    postcode: string | null;
    homeKey: string | null;
    livemode: boolean | null;
    testOrder: boolean;
    failureReason?: string | null;
    now?: Date;
  }): Promise<PaymentEventRecord>;
  // How many events of a type stand against a payment
  // — the failed-payment email's once-per-intent
  // discipline (M9.10, prep gap 5) counts the failures
  // the log already holds, the current delivery
  // included (the log is written before the count).
  countEvents(filter: { eventType: string; intentId: string }): Promise<number>;
  // Every event standing against one payment, oldest
  // first (the admin page's order history, M9.11).
  listByIntent(intentId: string): Promise<PaymentEventRecord[]>;
  // Every event received inside a window, oldest first
  // (the admin page's period reads, M9.11).
  listInPeriod(filter: { from: Date; to: Date }): Promise<PaymentEventRecord[]>;
}

interface PaymentEventRow {
  event_type: string;
  intent_id: string | null;
  status: string | null;
  email: string | null;
  postcode: string | null;
  home_key: string | null;
  livemode: boolean | null;
  test_order: boolean;
  failure_reason: string | null;
  received_at: Date;
}

function toRecord(row: PaymentEventRow): PaymentEventRecord {
  return {
    eventType: row.event_type,
    intentId: row.intent_id,
    status: row.status,
    email: row.email,
    postcode: row.postcode,
    homeKey: row.home_key,
    livemode: row.livemode,
    testOrder: row.test_order,
    failureReason: row.failure_reason,
    receivedAt: new Date(row.received_at),
  };
}

const COLUMNS = `event_type, intent_id, status, email, postcode, home_key,
  livemode, test_order, failure_reason, received_at`;

export function createDbPaymentEventLog(db: AddressQueryable): PaymentEventLog {
  return {
    async record(input) {
      const record: PaymentEventRecord = {
        eventType: input.eventType,
        intentId: input.intentId,
        status: input.status,
        email: input.email ? normaliseEmail(input.email) : null,
        postcode: input.postcode,
        homeKey: input.homeKey,
        livemode: input.livemode,
        testOrder: input.testOrder,
        failureReason: input.failureReason ?? null,
        receivedAt: input.now ?? new Date(),
      };
      const { rows } = await db.query(
        `INSERT INTO payment_events (${COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${COLUMNS}`,
        [
          record.eventType,
          record.intentId,
          record.status,
          record.email,
          record.postcode,
          record.homeKey,
          record.livemode,
          record.testOrder,
          record.failureReason,
          record.receivedAt,
        ],
      );
      return toRecord((rows as unknown as PaymentEventRow[])[0]);
    },

    async countEvents(filter) {
      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM payment_events
          WHERE event_type = $1 AND intent_id = $2`,
        [filter.eventType, filter.intentId],
      );
      return Number((rows as unknown as { n: number }[])[0]?.n ?? 0);
    },

    async listByIntent(intentId) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM payment_events
          WHERE intent_id = $1 ORDER BY received_at ASC, id ASC`,
        [intentId],
      );
      return (rows as unknown as PaymentEventRow[]).map(toRecord);
    },

    async listInPeriod(filter) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM payment_events
          WHERE received_at >= $1 AND received_at < $2 ORDER BY received_at ASC, id ASC`,
        [filter.from, filter.to],
      );
      return (rows as unknown as PaymentEventRow[]).map(toRecord);
    },
  };
}

// The in-memory implementation the tests run.
export function createMemoryPaymentEventLog(): PaymentEventLog & {
  records: PaymentEventRecord[];
} {
  const records: PaymentEventRecord[] = [];
  return {
    records,
    async record(input) {
      const record: PaymentEventRecord = {
        eventType: input.eventType,
        intentId: input.intentId,
        status: input.status,
        email: input.email ? normaliseEmail(input.email) : null,
        postcode: input.postcode,
        homeKey: input.homeKey,
        livemode: input.livemode,
        testOrder: input.testOrder,
        failureReason: input.failureReason ?? null,
        receivedAt: input.now ?? new Date(),
      };
      records.push(record);
      return { ...record };
    },
    async countEvents(filter) {
      return records.filter(
        (record) => record.eventType === filter.eventType && record.intentId === filter.intentId,
      ).length;
    },
    async listByIntent(intentId) {
      return records
        .filter((record) => record.intentId === intentId)
        .map((record) => ({ ...record }));
    },
    async listInPeriod(filter) {
      return records
        .filter((record) => record.receivedAt >= filter.from && record.receivedAt < filter.to)
        .map((record) => ({ ...record }));
    },
  };
}
