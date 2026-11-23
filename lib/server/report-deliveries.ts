// The delivery store (plan step M8.6, Key K16; the
// safe download links' shelf).
//
// The seam the delivery service runs on, in the house
// pattern (lib/server/gifts.ts): an interface, a
// database implementation over migration 0039's table,
// and an in-memory implementation the tests run. The
// decisions themselves — whether a re-issue sends, what
// the emails say — are pure and live in lib/download.ts;
// this file owns only the shelf and the writes.
//
// THE M9 WIRING POINT, named so M9 picks it up by name:
//   - record()  — the delivery service calls this once
//                 per delivered report, at delivery.
//                 M9's payment trigger calls the
//                 service, never the store directly.
//
// A delivery is written once and never updated — with
// ONE exception (M9.8): the WITHDRAWN standing. When
// the order behind a delivery is refunded in full, the
// refund transition sets withdrawn_at (with the refund
// as its reason); the row and its stored PDF are kept,
// and every reader checks the standing at serve time.
// Nothing else about a delivery ever changes: a
// re-issue mints a new signed token over the same row
// (the token is stateless — lib/server/download-links.ts),
// so there is no link state to keep in step.

import { randomBytes } from "node:crypto";

import type { AddressQueryable } from "../address";
import { normaliseEmail, type GiftRecord } from "../gift";
import type { DeliveryRecord } from "../download";

// A delivery id is 24 random bytes — 32 base64url
// characters of randomness: the link payload's public
// half, un-guessable in its own right before the
// signature is even considered (the gift token's
// standard).
export function newDeliveryId(): string {
  return randomBytes(24).toString("base64url");
}

export interface DeliveryStore {
  // Write a delivery. The email is normalised here as
  // at every write. `now` is injectable for tests;
  // production passes nothing. The gift token, where
  // the delivery issued one, is the issued gift
  // record's token.
  record(input: {
    email: string;
    kind: DeliveryRecord["kind"];
    pdfKey: string;
    fileName: string;
    homeTitle: string;
    homeAddressLine: string;
    gift?: GiftRecord | null;
    orderRef?: string | null;
    now?: Date;
  }): Promise<DeliveryRecord>;
  getById(id: string): Promise<DeliveryRecord | null>;
  // The delivery an order produced, if any (M9.8): the
  // refund transition finds an order's deliveries by
  // the order's own reference — the buyer's delivery by
  // the payment reference, a gifted delivery by the
  // gift token its order reference carries — never by
  // email or home, so a second genuine order for the
  // same home stands untouched by the first's refund.
  listByOrderRef(orderRef: string): Promise<DeliveryRecord[]>;
  // Set the withdrawn standing (M9.8): idempotent — a
  // delivery already withdrawn keeps its first
  // standing and its first reason. Answers the record
  // as it stands after the call, or null where no such
  // delivery stands.
  withdraw(id: string, refundId: string, now: Date): Promise<DeliveryRecord | null>;
  // Every delivery made inside a window, oldest first
  // (the admin page's period reads, M9.11).
  listInPeriod(filter: { from: Date; to: Date }): Promise<DeliveryRecord[]>;
}

interface DeliveryRow {
  id: string;
  email: string;
  kind: DeliveryRecord["kind"];
  pdf_key: string;
  file_name: string;
  home_title: string;
  home_address_line: string;
  gift_token: string | null;
  order_ref: string | null;
  created_at: Date;
  withdrawn_at: Date | null;
  withdrawn_refund_id: string | null;
}

function toRecord(row: DeliveryRow): DeliveryRecord {
  return {
    id: row.id,
    email: row.email,
    kind: row.kind,
    pdfKey: row.pdf_key,
    fileName: row.file_name,
    homeTitle: row.home_title,
    homeAddressLine: row.home_address_line,
    giftToken: row.gift_token,
    orderRef: row.order_ref,
    createdAt: new Date(row.created_at),
    withdrawnAt: row.withdrawn_at ? new Date(row.withdrawn_at) : null,
    withdrawnRefundId: row.withdrawn_refund_id,
  };
}

const COLUMNS = `id, email, kind, pdf_key, file_name, home_title,
  home_address_line, gift_token, order_ref, created_at,
  withdrawn_at, withdrawn_refund_id`;

export function createDbDeliveryStore(db: AddressQueryable): DeliveryStore {
  return {
    async record(input) {
      const record: DeliveryRecord = {
        id: newDeliveryId(),
        email: normaliseEmail(input.email),
        kind: input.kind,
        pdfKey: input.pdfKey,
        fileName: input.fileName,
        homeTitle: input.homeTitle,
        homeAddressLine: input.homeAddressLine,
        giftToken: input.gift?.token ?? null,
        orderRef: input.orderRef ?? null,
        createdAt: input.now ?? new Date(),
        withdrawnAt: null,
        withdrawnRefundId: null,
      };
      await db.query(
        `INSERT INTO report_deliveries (${COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          record.id,
          record.email,
          record.kind,
          record.pdfKey,
          record.fileName,
          record.homeTitle,
          record.homeAddressLine,
          record.giftToken,
          record.orderRef,
          record.createdAt,
          record.withdrawnAt,
          record.withdrawnRefundId,
        ],
      );
      return record;
    },

    async getById(id) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM report_deliveries WHERE id = $1`, [
        id,
      ]);
      const row = (rows as unknown as DeliveryRow[])[0];
      return row ? toRecord(row) : null;
    },

    async listByOrderRef(orderRef) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM report_deliveries WHERE order_ref = $1 ORDER BY created_at ASC`,
        [orderRef],
      );
      return (rows as unknown as DeliveryRow[]).map(toRecord);
    },

    async withdraw(id, refundId, now) {
      const { rows } = await db.query(
        `UPDATE report_deliveries
            SET withdrawn_at = $2, withdrawn_refund_id = $3
          WHERE id = $1 AND withdrawn_at IS NULL
          RETURNING ${COLUMNS}`,
        [id, now, refundId],
      );
      const row = (rows as unknown as DeliveryRow[])[0];
      if (row) return toRecord(row);
      // Already withdrawn (or unknown): answer what
      // stands, so a repeated transition is a no-op.
      const { rows: standing } = await db.query(
        `SELECT ${COLUMNS} FROM report_deliveries WHERE id = $1`,
        [id],
      );
      const found = (standing as unknown as DeliveryRow[])[0];
      return found ? toRecord(found) : null;
    },

    async listInPeriod(filter) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM report_deliveries
          WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at ASC`,
        [filter.from, filter.to],
      );
      return (rows as unknown as DeliveryRow[]).map(toRecord);
    },
  };
}

// The in-memory implementation the tests run — the
// gifts pattern, with an injectable clock.
export function createMemoryDeliveryStore(now: () => Date = () => new Date()): DeliveryStore {
  const records = new Map<string, DeliveryRecord>();
  const clone = (record: DeliveryRecord): DeliveryRecord => ({ ...record });

  return {
    async record(input) {
      const record: DeliveryRecord = {
        id: newDeliveryId(),
        email: normaliseEmail(input.email),
        kind: input.kind,
        pdfKey: input.pdfKey,
        fileName: input.fileName,
        homeTitle: input.homeTitle,
        homeAddressLine: input.homeAddressLine,
        giftToken: input.gift?.token ?? null,
        orderRef: input.orderRef ?? null,
        createdAt: input.now ?? now(),
        withdrawnAt: null,
        withdrawnRefundId: null,
      };
      records.set(record.id, record);
      return clone(record);
    },

    async getById(id) {
      const record = records.get(id);
      return record ? clone(record) : null;
    },

    async listByOrderRef(orderRef) {
      const found: DeliveryRecord[] = [];
      for (const record of records.values()) {
        if (record.orderRef === orderRef) found.push(clone(record));
      }
      return found;
    },

    async withdraw(id, refundId, at) {
      const record = records.get(id);
      if (!record) return null;
      if (!record.withdrawnAt) {
        record.withdrawnAt = at;
        record.withdrawnRefundId = refundId;
      }
      return clone(record);
    },

    async listInPeriod(filter) {
      return [...records.values()]
        .filter((record) => record.createdAt >= filter.from && record.createdAt < filter.to)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(clone);
    },
  };
}
