// The serve layer's database handle (plan step M7.3).
//
// One pg Pool for the whole served app, built from
// DATABASE_URL (Key K6 — the server's secret file in
// production, .env.local in development; never a value in
// the repo). The brains take the pool structurally through
// their AddressQueryable interface, exactly as the golden
// replay hands them a pool in tests.

import { Pool } from "pg";

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set — the serve layer cannot answer checks.");
    }
    // PG_POOL_MAX sizes the pool where an environment needs
    // it said out loud (the local PGlite rehearsal engine is
    // single-threaded and serves one connection at a time;
    // the local gate sets 1). Unset, pg's own default stands
    // — production on real PostgreSQL is unchanged.
    const max = Number(process.env.PG_POOL_MAX);
    pool = new Pool({
      connectionString,
      ...(Number.isInteger(max) && max > 0 ? { max } : {}),
    });
  }
  return pool;
}
