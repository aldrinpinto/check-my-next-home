import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import {
  createBoundedSuggestionSource,
  SUGGEST_STATEMENT_TIMEOUT_MS,
} from "../lib/server/suggestions";

// The bounded suggest source (BUG-194, 23 Nov 2026):
// the /api/suggest route's per-request bounds — a
// statement timeout on the request's own database
// session, and pg_cancel_backend when the caller
// goes away — tested against a fake pool at the seam
// (the live proof against a real database is CI's
// database job and the play server's timings; the
// PGlite rehearsal engine is not used here).
//
// The fake records every statement on the request's
// client and on the pool separately, so the tests can
// prove the read model's statements ride the bounded
// session — never the bare pool — and that the fuzzy
// tiers' connect() is served by that same session.

interface RecordedQuery {
  text: string;
  params?: readonly unknown[];
}

function createFakePool() {
  const clientQueries: RecordedQuery[] = [];
  const poolQueries: RecordedQuery[] = [];
  let releaseCount = 0;
  const client = {
    query: (text: string, params?: readonly unknown[]) => {
      clientQueries.push({ text, params });
      if (text === "SELECT pg_backend_pid() AS pid") {
        return Promise.resolve({ rows: [{ pid: 4242 }] });
      }
      return Promise.resolve({ rows: [] });
    },
    release: () => {
      releaseCount += 1;
    },
  };
  const pool = {
    connect: () => Promise.resolve(client),
    query: (text: string, params?: readonly unknown[]) => {
      poolQueries.push({ text, params });
      return Promise.resolve({ rows: [] });
    },
  };
  return {
    pool: pool as unknown as Pool,
    clientQueries,
    poolQueries,
    releaseCount: () => releaseCount,
  };
}

describe("the bounded suggest source (BUG-194)", () => {
  it("sets the statement timeout on the request's own session, before any read", async () => {
    const fake = createFakePool();
    const bounded = await createBoundedSuggestionSource(fake.pool);
    expect(fake.clientQueries.map((q) => q.text)).toEqual([
      "SELECT pg_backend_pid() AS pid",
      `SET statement_timeout = ${SUGGEST_STATEMENT_TIMEOUT_MS}`,
    ]);
    expect(SUGGEST_STATEMENT_TIMEOUT_MS).toBe(3_000);
    await bounded.close();
  });

  it("serves the read model's statements on the bounded session, never the bare pool", async () => {
    const fake = createFakePool();
    const bounded = await createBoundedSuggestionSource(fake.pool);
    await bounded.source.postcodesByPrefix("CM3", 5);
    const texts = fake.clientQueries.map((q) => q.text);
    expect(texts.some((text) => text.includes("FROM postcode_cache"))).toBe(true);
    expect(fake.poolQueries).toHaveLength(0);
    await bounded.close();
  });

  it("cancels the request's backend through the pool when the caller goes away", async () => {
    const fake = createFakePool();
    const abort = new AbortController();
    const bounded = await createBoundedSuggestionSource(fake.pool, abort.signal);
    abort.abort();
    expect(fake.poolQueries).toEqual([{ text: "SELECT pg_cancel_backend($1)", params: [4242] }]);
    await bounded.close();
  });

  it("an already-aborted signal cancels as soon as the session is bound", async () => {
    const fake = createFakePool();
    const abort = new AbortController();
    abort.abort();
    const bounded = await createBoundedSuggestionSource(fake.pool, abort.signal);
    expect(fake.poolQueries).toEqual([{ text: "SELECT pg_cancel_backend($1)", params: [4242] }]);
    await bounded.close();
  });

  it("serves the fuzzy tiers' connect() from the same bounded session; its release is a no-op", async () => {
    const fake = createFakePool();
    const bounded = await createBoundedSuggestionSource(fake.pool);
    // The streets fuzzy tier takes a client from the
    // source, runs BEGIN / set_limit / read / COMMIT
    // on it and releases it — every statement must
    // land on the bounded session (so the timeout
    // covers the tier's transaction), and the tier's
    // release must not return the session early.
    await bounded.source.streetsByFuzzy(["BUGDALE RISE"], 4);
    const texts = fake.clientQueries.map((q) => q.text);
    expect(texts).toContain("BEGIN");
    expect(texts.some((text) => text.startsWith("SELECT set_limit"))).toBe(true);
    expect(texts).toContain("COMMIT");
    expect(fake.releaseCount()).toBe(0);
    await bounded.close();
    expect(fake.releaseCount()).toBe(1);
  });

  it("close() resets the timeout and releases the session exactly once", async () => {
    const fake = createFakePool();
    const bounded = await createBoundedSuggestionSource(fake.pool);
    await bounded.close();
    const texts = fake.clientQueries.map((q) => q.text);
    expect(texts[texts.length - 1]).toBe("RESET statement_timeout");
    expect(fake.releaseCount()).toBe(1);
  });
});
