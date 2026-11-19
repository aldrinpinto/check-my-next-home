// The gift-token store (plan step M7.13, decision D21;
// the claim shell).
//
// The seam the claim flow runs on, in the house pattern
// (lib/server/resolve-records.ts): an interface, a
// database implementation over migration 0034's table,
// and an in-memory implementation the tests run. The
// lifecycle decisions themselves — which state a record
// serves, what a claim attempt means — are pure and
// live in lib/gift.ts; this file owns only the shelf
// and the writes.
//
// THE M9 WIRING POINTS, named so M9.6/M9.8 pick them up
// by name:
//   - issue()          — M9.6 calls this on a PAID order
//                        record, exactly once per order
//                        (never on a free-window or
//                        gifted order; inactive until
//                        the first paid report). The
//                        delivery email's gift block
//                        (M8.6) carries giftClaimPath(
//                        record.token).
//   - findClaimedByEmail() — M9.6's payment flow calls
//                        this at order time so a bound
//                        gift auto-applies (test (i)).
//   - markRedeemed()   — the delivery path calls this
//                        when the gifted report is
//                        DELIVERED to the bound email —
//                        only delivery consumes the gift.
//   - A refund voids the order's gift while Issued or
//     Claimed (M9.8, carried from M7.13): that
//     transition is M9.8's to add; a Redeemed gift
//     stands.
//
// The gift claimed/redeemed measurement events (M7.14)
// attach at bindByConfirm() and markRedeemed() — the two
// transitions, each a single named operation here —
// when M7.14 builds its events table; M7.14's adoption
// names that wiring as its own completion.

import { randomBytes } from "node:crypto";

import { GIFT_VALIDITY_MS, normaliseEmail, type GiftRecord } from "../gift";
import type { AddressQueryable } from "../address";

// A token is 24 random bytes — 32 base64url characters
// of randomness: long and un-guessable (the Check
// Together token rule, M8.6's standard). The
// confirmation credential is the same shape: the
// emailed link is a bearer credential for exactly one
// binding.
export function newGiftToken(): string {
  return randomBytes(24).toString("base64url");
}

export function newConfirmToken(): string {
  return randomBytes(24).toString("base64url");
}

export interface GiftStore {
  // Create an Issued gift for a buyer. Emails are
  // normalised here as at every write. `now` is
  // injectable for tests; production passes nothing.
  issue(input: { buyerEmail: string; orderRef?: string | null; now?: Date }): Promise<GiftRecord>;
  getByToken(token: string): Promise<GiftRecord | null>;
  // (Re)start the pending confirmation: replaces any
  // earlier pending wholesale, so only the latest
  // emailed link can bind.
  setPending(token: string, pendingEmail: string, pendingToken: string, now: Date): Promise<void>;
  // Drop the pending without binding (the send failed —
  // a failed send leaves nothing half-claimed).
  clearPending(token: string): Promise<void>;
  // Bind by confirmation: if the record is still
  // Issued, still in date, and carries this pending
  // token, bind its pending email and clear the
  // pending. Answers the bound record, or null when the
  // link no longer matches (superseded, already bound,
  // expired, or never pending).
  bindByConfirm(token: string, pendingToken: string, now: Date): Promise<GiftRecord | null>;
  // Consume the gift on delivery to the bound email.
  // Idempotent in effect: redeeming a redeemed gift
  // answers the record unchanged.
  markRedeemed(token: string, now: Date): Promise<GiftRecord | null>;
  // The live claimed gift bound to this email, if any:
  // claimed, unconsumed, unexpired (test (i)'s lookup).
  findClaimedByEmail(email: string, now: Date): Promise<GiftRecord | null>;
}

interface GiftRow {
  token: string;
  buyer_email: string;
  claimant_email: string | null;
  status: GiftRecord["status"];
  order_ref: string | null;
  issued_at: Date;
  expires_at: Date;
  claimed_at: Date | null;
  redeemed_at: Date | null;
  pending_email: string | null;
  pending_token: string | null;
  pending_sent_at: Date | null;
}

function toRecord(row: GiftRow): GiftRecord {
  return {
    token: row.token,
    buyerEmail: row.buyer_email,
    claimantEmail: row.claimant_email,
    status: row.status,
    orderRef: row.order_ref,
    issuedAt: new Date(row.issued_at),
    expiresAt: new Date(row.expires_at),
    claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
    redeemedAt: row.redeemed_at ? new Date(row.redeemed_at) : null,
    pendingEmail: row.pending_email,
    pendingToken: row.pending_token,
    pendingSentAt: row.pending_sent_at ? new Date(row.pending_sent_at) : null,
  };
}

const COLUMNS = `token, buyer_email, claimant_email, status, order_ref,
  issued_at, expires_at, claimed_at, redeemed_at,
  pending_email, pending_token, pending_sent_at`;

export function createDbGiftStore(db: AddressQueryable): GiftStore {
  async function getByToken(token: string): Promise<GiftRecord | null> {
    const { rows } = await db.query(`SELECT ${COLUMNS} FROM gift_tokens WHERE token = $1`, [token]);
    const row = (rows as unknown as GiftRow[])[0];
    return row ? toRecord(row) : null;
  }

  return {
    async issue(input) {
      const now = input.now ?? new Date();
      const record: GiftRecord = {
        token: newGiftToken(),
        buyerEmail: normaliseEmail(input.buyerEmail),
        claimantEmail: null,
        status: "issued",
        orderRef: input.orderRef ?? null,
        issuedAt: now,
        expiresAt: new Date(now.getTime() + GIFT_VALIDITY_MS),
        claimedAt: null,
        redeemedAt: null,
        pendingEmail: null,
        pendingToken: null,
        pendingSentAt: null,
      };
      await db.query(
        `INSERT INTO gift_tokens (${COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          record.token,
          record.buyerEmail,
          record.claimantEmail,
          record.status,
          record.orderRef,
          record.issuedAt,
          record.expiresAt,
          record.claimedAt,
          record.redeemedAt,
          record.pendingEmail,
          record.pendingToken,
          record.pendingSentAt,
        ],
      );
      return record;
    },

    getByToken,

    async setPending(token, pendingEmail, pendingToken, now) {
      await db.query(
        `UPDATE gift_tokens
            SET pending_email = $2, pending_token = $3, pending_sent_at = $4
          WHERE token = $1 AND status = 'issued'`,
        [token, normaliseEmail(pendingEmail), pendingToken, now],
      );
    },

    async clearPending(token) {
      await db.query(
        `UPDATE gift_tokens
            SET pending_email = NULL, pending_token = NULL, pending_sent_at = NULL
          WHERE token = $1 AND status = 'issued'`,
        [token],
      );
    },

    async bindByConfirm(token, pendingToken, now) {
      // The conditions live in the write itself: still
      // Issued, the pending token still the live one,
      // and the gift still in date at the moment of
      // binding — a confirmation clicked after day 30
      // binds nothing.
      const { rows } = await db.query(
        `UPDATE gift_tokens
            SET status = 'claimed',
                claimant_email = pending_email,
                claimed_at = $3,
                pending_email = NULL, pending_token = NULL, pending_sent_at = NULL
          WHERE token = $1 AND status = 'issued' AND pending_token = $2 AND expires_at > $3
          RETURNING ${COLUMNS}`,
        [token, pendingToken, now],
      );
      const row = (rows as unknown as GiftRow[])[0];
      return row ? toRecord(row) : null;
    },

    async markRedeemed(token, now) {
      const { rows } = await db.query(
        `UPDATE gift_tokens
            SET status = 'redeemed', redeemed_at = $2
          WHERE token = $1 AND status = 'claimed'
          RETURNING ${COLUMNS}`,
        [token, now],
      );
      const row = (rows as unknown as GiftRow[])[0];
      if (row) return toRecord(row);
      // Already redeemed (or unknown): answer what
      // stands, so a duplicate delivery call is a
      // no-op, never an error.
      return getByToken(token);
    },

    async findClaimedByEmail(email, now) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM gift_tokens
          WHERE claimant_email = $1 AND status = 'claimed' AND expires_at > $2
          ORDER BY claimed_at ASC
          LIMIT 1`,
        [normaliseEmail(email), now],
      );
      const row = (rows as unknown as GiftRow[])[0];
      return row ? toRecord(row) : null;
    },
  };
}

// The in-memory implementation the tests run — the
// resolve-records pattern, with an injectable clock.
export function createMemoryGiftStore(now: () => Date = () => new Date()): GiftStore {
  const records = new Map<string, GiftRecord>();
  const clone = (record: GiftRecord): GiftRecord => ({ ...record });

  return {
    async issue(input) {
      const at = input.now ?? now();
      const record: GiftRecord = {
        token: newGiftToken(),
        buyerEmail: normaliseEmail(input.buyerEmail),
        claimantEmail: null,
        status: "issued",
        orderRef: input.orderRef ?? null,
        issuedAt: at,
        expiresAt: new Date(at.getTime() + GIFT_VALIDITY_MS),
        claimedAt: null,
        redeemedAt: null,
        pendingEmail: null,
        pendingToken: null,
        pendingSentAt: null,
      };
      records.set(record.token, record);
      return clone(record);
    },

    async getByToken(token) {
      const record = records.get(token);
      return record ? clone(record) : null;
    },

    async setPending(token, pendingEmail, pendingToken, at) {
      const record = records.get(token);
      if (!record || record.status !== "issued") return;
      record.pendingEmail = normaliseEmail(pendingEmail);
      record.pendingToken = pendingToken;
      record.pendingSentAt = at;
    },

    async clearPending(token) {
      const record = records.get(token);
      if (!record || record.status !== "issued") return;
      record.pendingEmail = null;
      record.pendingToken = null;
      record.pendingSentAt = null;
    },

    async bindByConfirm(token, pendingToken, at) {
      const record = records.get(token);
      if (!record || record.status !== "issued") return null;
      if (record.expiresAt.getTime() <= at.getTime()) return null;
      if (!record.pendingToken || record.pendingToken !== pendingToken) return null;
      record.status = "claimed";
      record.claimantEmail = record.pendingEmail;
      record.claimedAt = at;
      record.pendingEmail = null;
      record.pendingToken = null;
      record.pendingSentAt = null;
      return clone(record);
    },

    async markRedeemed(token, at) {
      const record = records.get(token);
      if (!record) return null;
      if (record.status !== "claimed") return clone(record);
      record.status = "redeemed";
      record.redeemedAt = at;
      return clone(record);
    },

    async findClaimedByEmail(email, at) {
      const wanted = normaliseEmail(email);
      for (const record of records.values()) {
        if (
          record.claimantEmail === wanted &&
          record.status === "claimed" &&
          record.expiresAt.getTime() > at.getTime()
        ) {
          return clone(record);
        }
      }
      return null;
    },
  };
}
