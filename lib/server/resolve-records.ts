// Transient resolve records (entry-point build, 18 Nov
// 2026; decision D72, gap-check item 3 — the founder's
// ruling is recorded in migration 0029's header).
//
// A Postio-only home is carried through its check by one of
// these records: a random token in the URL where home=
// sits, the resolved parts as payload, a 24-hour TTL with
// automatic expiry. The store is an interface so tests run
// it in memory; the database implementation is
// createDbResolveRecordStore over migration 0029's table.
//
// Expiry is a read-side act: get() on an expired record
// deletes it, logs transient.expired, and answers null —
// the route then does exactly what it does for any stale
// key (back to the picker, never a guessed home). create()
// sweeps already-expired rows opportunistically so the
// table cannot grow on abandoned picks. Promotion (the
// home becoming filed locally) deletes the record early —
// that decision and its log line live in the hybrid
// (lib/server/hybrid.ts), which owns the journey's logic;
// this file owns only the shelf.

import { randomBytes } from "node:crypto";

import type { AddressQueryable, LoadedAddressParts } from "../address";
import { logEntry } from "./entry-log";

// The founder-ruled lifetime: 24 hours from the pick.
export const RESOLVE_RECORD_TTL_MS = 24 * 60 * 60 * 1000;

export interface ResolveRecord {
  token: string;
  postcode: string;
  parts: LoadedAddressParts;
  udprn: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface ResolveRecordStore {
  create(input: {
    postcode: string;
    parts: LoadedAddressParts;
    udprn: string | null;
  }): Promise<ResolveRecord>;
  // The live record for a token, or null when there is none
  // or its TTL has run out (an expired record is deleted
  // and logged before null comes back).
  get(token: string, req?: string): Promise<ResolveRecord | null>;
  delete(token: string): Promise<void>;
}

// A token is 24 base64url characters of randomness: long
// and un-guessable (the Check Together token rule), and it
// never contains the "|" a home key always carries — that
// is how a route tells a token from a home key at a glance.
export function newResolveToken(): string {
  return randomBytes(18).toString("base64url");
}

export function isResolveToken(candidate: string): boolean {
  return !candidate.includes("|");
}

export function createDbResolveRecordStore(db: AddressQueryable): ResolveRecordStore {
  return {
    async create(input) {
      const token = newResolveToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + RESOLVE_RECORD_TTL_MS);
      // The opportunistic sweep: abandoned picks from a day
      // ago leave with this write.
      await db.query("DELETE FROM resolve_records WHERE expires_at <= now()");
      await db.query(
        "INSERT INTO resolve_records (token, postcode, parts, udprn, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [token, input.postcode, JSON.stringify(input.parts), input.udprn, now, expiresAt],
      );
      return {
        token,
        postcode: input.postcode,
        parts: input.parts,
        udprn: input.udprn,
        createdAt: now,
        expiresAt,
      };
    },
    async get(token, req) {
      const { rows } = await db.query(
        "SELECT token, postcode, parts, udprn, created_at, expires_at FROM resolve_records WHERE token = $1",
        [token],
      );
      const row = rows[0];
      if (!row) return null;
      const expiresAt = new Date(row.expires_at as string);
      if (expiresAt.getTime() <= Date.now()) {
        await db.query("DELETE FROM resolve_records WHERE token = $1", [token]);
        if (req) {
          logEntry(req, "transient.expired", {
            layer: "transient",
            reason: "ttl",
            postcode: row.postcode as string,
          });
        }
        return null;
      }
      return {
        token: row.token as string,
        postcode: row.postcode as string,
        parts: row.parts as LoadedAddressParts,
        udprn: (row.udprn as string | null) ?? null,
        createdAt: new Date(row.created_at as string),
        expiresAt,
      };
    },
    async delete(token) {
      await db.query("DELETE FROM resolve_records WHERE token = $1", [token]);
    },
  };
}

// The in-memory store — the test double, with a settable
// clock so a scenario can age a record past its TTL.
export function createMemoryResolveRecordStore(
  now: () => number = () => Date.now(),
): ResolveRecordStore & { size: () => number } {
  const records = new Map<string, ResolveRecord>();
  return {
    size: () => records.size,
    async create(input) {
      const token = newResolveToken();
      const createdAt = new Date(now());
      const record: ResolveRecord = {
        token,
        postcode: input.postcode,
        parts: input.parts,
        udprn: input.udprn,
        createdAt,
        expiresAt: new Date(now() + RESOLVE_RECORD_TTL_MS),
      };
      records.set(token, record);
      return record;
    },
    async get(token, req) {
      const record = records.get(token);
      if (!record) return null;
      if (record.expiresAt.getTime() <= now()) {
        records.delete(token);
        if (req) {
          logEntry(req, "transient.expired", {
            layer: "transient",
            reason: "ttl",
            postcode: record.postcode,
          });
        }
        return null;
      }
      return record;
    },
    async delete(token) {
      records.delete(token);
    },
  };
}
