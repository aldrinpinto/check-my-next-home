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
    now?: Date;
  }): Promise<PaymentEventRecord>;
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
    receivedAt: new Date(row.received_at),
  };
}

const COLUMNS = `event_type, intent_id, status, email, postcode, home_key,
  livemode, test_order, received_at`;

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
        receivedAt: input.now ?? new Date(),
      };
      const { rows } = await db.query(
        `INSERT INTO payment_events (${COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
          record.receivedAt,
        ],
      );
      return toRecord((rows as unknown as PaymentEventRow[])[0]);
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
        receivedAt: input.now ?? new Date(),
      };
      records.push(record);
      return { ...record };
    },
  };
}
