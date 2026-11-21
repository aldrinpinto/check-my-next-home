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
// A delivery is written once and never updated: a
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
  };
}

const COLUMNS = `id, email, kind, pdf_key, file_name, home_title,
  home_address_line, gift_token, order_ref, created_at`;

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
      };
      await db.query(
        `INSERT INTO report_deliveries (${COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
      };
      records.set(record.id, record);
      return clone(record);
    },

    async getById(id) {
      const record = records.get(id);
      return record ? clone(record) : null;
    },
  };
}
