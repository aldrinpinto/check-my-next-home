import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AddressQueryable } from "../lib/address";
import { createDbGiftStore, createMemoryGiftStore, newConfirmToken } from "../lib/server/gifts";
import {
  recordJourneyEvent,
  recordPageError,
  whenJourneyAlertsSettled,
} from "../lib/server/journey-events";

// M7.14 — the recorder's pins: fire-and-forget (a failing
// store drops, never throws), the dedupe outcome, the
// error class's alert rules (first sighting, spike,
// never one email per error, a failed send stays
// unmarked), and the gift wiring at M7.13's named
// attachment points.

interface Call {
  text: string;
  params: readonly unknown[];
}

function fakeDb(handler: (call: Call) => { rows: Record<string, unknown>[] } | Error) {
  const calls: Call[] = [];
  const db: AddressQueryable = {
    async query(text, params = []) {
      const call = { text, params };
      calls.push(call);
      const result = handler(call);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { db, calls };
}

const insertOk = () => ({ rows: [{ id: 1 }] });

describe("recordJourneyEvent", () => {
  it("records a clean event with its stored shape", async () => {
    const { db, calls } = fakeDb(insertOk);
    const outcome = await recordJourneyEvent(db, {
      event: "check_completed",
      routePattern: "/search/home",
      rung: 1,
      nation: "england",
      sections: ["crime"],
      states: { crime: "served" },
      dedupeKey: "a-per-fire-random-key",
    });
    expect(outcome).toBe("recorded");
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("INSERT INTO journey_events");
    expect(calls[0].params[0]).toBe("check_completed");
    expect(calls[0].params[2]).toBe("/search/home");
  });

  it("answers duplicate when the dedupe claim finds the key already held", async () => {
    const { db } = fakeDb(() => ({ rows: [] }));
    await expect(
      recordJourneyEvent(db, { event: "page_view", dedupeKey: "same-key-twice" }),
    ).resolves.toBe("duplicate");
  });

  it("drops an unsafe payload without touching the store", async () => {
    const { db, calls } = fakeDb(insertOk);
    const outcome = await recordJourneyEvent(db, {
      event: "check_completed",
      states: { crime: "served at CM3 2JT" },
    });
    expect(outcome).toBe("dropped");
    expect(calls).toHaveLength(0);
  });

  it("never throws when the store itself fails — the journey is untouched", async () => {
    const { db } = fakeDb(() => new Error("database is down"));
    await expect(recordJourneyEvent(db, { event: "page_view" })).resolves.toBe("dropped");
  });
});

describe("recordPageError and the alert rules (D45)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let savedFrom: string | undefined;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    // EM-12: the alert's FROM is the placed internal
    // identity — the tests place it the way the server
    // does, and restore whatever stood before.
    savedFrom = process.env.CONTACT_NOTIFICATION_FROM;
    process.env.CONTACT_NOTIFICATION_FROM = "Check My Next Home <contact@checkmynexthome.co.uk>";
    fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    if (savedFrom === undefined) delete process.env.CONTACT_NOTIFICATION_FROM;
    else process.env.CONTACT_NOTIFICATION_FROM = savedFrom;
  });

  function errorDb({
    existing = null as { total_count: string; last_alert_at: Date | null } | null,
    hourCount = 1,
  } = {}) {
    return fakeDb((call) => {
      if (call.text.includes("INSERT INTO journey_events")) return insertOk();
      if (call.text.includes("SELECT total_count, last_alert_at")) {
        return { rows: existing ? [existing as unknown as Record<string, unknown>] : [] };
      }
      if (call.text.includes("SELECT count(*)::int AS n FROM journey_events")) {
        return { rows: [{ n: hourCount }] };
      }
      return { rows: [] };
    });
  }

  it("records the error and alerts on the first sighting of a fingerprint", async () => {
    const { db, calls } = errorDb();
    const outcome = await recordPageError(db, {
      errorName: "TypeError",
      errorMessage: "Cannot read properties of undefined",
      routePattern: "/search/home",
      userAgent: "Mozilla/5.0 Chrome/120.0",
    });
    expect(outcome).toBe("recorded");
    await whenJourneyAlertsSettled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as {
      subject: string;
      from: string;
      text: string;
      html: string;
    };
    expect(sent.subject).toContain("New page error");
    expect(sent.subject).toContain("TypeError");
    // EM-12 (founder ruling 23 Nov 2026): the alert sends
    // from the placed internal identity — never Resend's
    // sandbox sender — and wears the designed shell: the
    // forest-deep brand band over the alert's own words,
    // its facts as labelled lines.
    expect(sent.from).toBe("Check My Next Home <contact@checkmynexthome.co.uk>");
    expect(sent.from).not.toContain("onboarding@resend.dev");
    expect(sent.html).toContain("background-color:#1E402C");
    expect(sent.html).toContain("New page error");
    expect(sent.html).toContain("<strong>Error:</strong> TypeError");
    expect(sent.html).toContain("Cannot read properties of undefined");
    // The text part stands exactly as it stood before
    // the shell: the same words, undressed.
    expect(sent.text).toContain("A page error type has been seen for the first time.");
    expect(sent.text).toContain("Error: TypeError");
    const marked = calls.filter(
      (call) => call.text.includes("last_alert_at = now()") && call.text.includes("UPDATE"),
    );
    expect(marked).toHaveLength(1);
    expect(marked[0].params[1]).toBe("first-seen");
  });

  it("does not send at all while the alert's FROM is unplaced, and leaves the fingerprint unmarked (EM-12)", async () => {
    delete process.env.CONTACT_NOTIFICATION_FROM;
    const { db, calls } = errorDb();
    const outcome = await recordPageError(db, { errorName: "TypeError", routePattern: "/" });
    expect(outcome).toBe("recorded");
    await whenJourneyAlertsSettled();
    expect(fetchMock).not.toHaveBeenCalled();
    const marked = calls.filter((call) =>
      call.text.includes("UPDATE journey_event_alerts SET last_alert_at"),
    );
    expect(marked).toHaveLength(0);
  });

  it("does not alert again for a known fingerprint below the spike threshold", async () => {
    const { db } = errorDb({
      existing: { total_count: "3", last_alert_at: new Date() },
      hourCount: 3,
    });
    await recordPageError(db, { errorName: "TypeError", routePattern: "/" });
    await whenJourneyAlertsSettled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("alerts on a spike past the pinned threshold, once", async () => {
    const { db, calls } = errorDb({
      existing: { total_count: "9", last_alert_at: null },
      hourCount: 10,
    });
    await recordPageError(db, { errorName: "RangeError", routePattern: "/" });
    await whenJourneyAlertsSettled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as {
      subject: string;
    };
    expect(sent.subject).toContain("spike");
    const marked = calls.filter((call) =>
      call.text.includes("UPDATE journey_event_alerts SET last_alert_at"),
    );
    expect(marked[0].params[1]).toBe("spike");
  });

  it("leaves the fingerprint unmarked when the alert send fails, so a later error retries", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const { db, calls } = errorDb();
    const outcome = await recordPageError(db, { errorName: "TypeError", routePattern: "/" });
    expect(outcome).toBe("recorded");
    await whenJourneyAlertsSettled();
    const marked = calls.filter((call) =>
      call.text.includes("UPDATE journey_event_alerts SET last_alert_at"),
    );
    expect(marked).toHaveLength(0);
  });

  it("stores a message carrying an email as null — the error still records", async () => {
    const { db, calls } = errorDb();
    await recordPageError(db, {
      errorName: "Error",
      errorMessage: "failed for someone@example.co.uk",
      routePattern: "/",
    });
    const insert = calls.find((call) => call.text.includes("INSERT INTO journey_events"));
    expect(insert).toBeDefined();
    // error_message is the ninth stored field.
    expect(insert!.params[8]).toBeNull();
    expect(insert!.params[7]).toBe("Error");
  });
});

describe("the gift wiring at M7.13's attachment points", () => {
  it("fires gift_claimed on the binding transition and gift_redeemed on delivery — each exactly once", async () => {
    const fired: string[] = [];
    const store = createMemoryGiftStore(undefined, (event) => fired.push(event));
    const now = new Date("2026-11-19T10:00:00Z");
    const gift = await store.issue({ buyerEmail: "buyer@example.co.uk", now });
    const pending = newConfirmToken();
    await store.setPending(gift.token, "claimant@example.co.uk", pending, now);

    const bound = await store.bindByConfirm(gift.token, pending, now);
    expect(bound?.status).toBe("claimed");
    expect(fired).toEqual(["gift_claimed"]);

    // A repeated bind attempt is refused and records nothing.
    expect(await store.bindByConfirm(gift.token, pending, now)).toBeNull();
    expect(fired).toEqual(["gift_claimed"]);

    await store.markRedeemed(gift.token, now);
    expect(fired).toEqual(["gift_claimed", "gift_redeemed"]);

    // Redeeming a redeemed gift is a no-op and records nothing.
    await store.markRedeemed(gift.token, now);
    expect(fired).toEqual(["gift_claimed", "gift_redeemed"]);
  });

  it("records nothing for a refused bind (wrong confirmation token)", async () => {
    const fired: string[] = [];
    const store = createMemoryGiftStore(undefined, (event) => fired.push(event));
    const now = new Date("2026-11-19T10:00:00Z");
    const gift = await store.issue({ buyerEmail: "buyer@example.co.uk", now });
    await store.setPending(gift.token, "claimant@example.co.uk", newConfirmToken(), now);
    expect(await store.bindByConfirm(gift.token, "not-the-token", now)).toBeNull();
    expect(fired).toEqual([]);
  });

  it("the database store fires through its sink on the transition rows only", async () => {
    const fired: string[] = [];
    const giftRow = {
      token: "tok",
      buyer_email: "buyer@example.co.uk",
      claimant_email: "claimant@example.co.uk",
      status: "claimed",
      order_ref: null,
      issued_at: new Date("2026-11-19T09:00:00Z"),
      expires_at: new Date("2026-12-19T09:00:00Z"),
      claimed_at: new Date("2026-11-19T10:00:00Z"),
      redeemed_at: null,
      pending_email: null,
      pending_token: null,
      pending_sent_at: null,
    };
    const { db } = fakeDb((call) => {
      if (call.text.includes("SET status = 'claimed',")) {
        return { rows: [giftRow as unknown as Record<string, unknown>] };
      }
      if (call.text.includes("SET status = 'redeemed',")) {
        return { rows: [] }; // no transition — already redeemed
      }
      if (call.text.includes("SELECT") && call.text.includes("FROM gift_tokens")) {
        return {
          rows: [{ ...giftRow, status: "redeemed" } as unknown as Record<string, unknown>],
        };
      }
      return { rows: [] };
    });
    const store = createDbGiftStore(db, (event) => fired.push(event));
    const now = new Date("2026-11-19T10:00:00Z");
    await store.bindByConfirm("tok", "pending", now);
    expect(fired).toEqual(["gift_claimed"]);
    await store.markRedeemed("tok", now);
    expect(fired).toEqual(["gift_claimed"]); // no transition, no event
  });
});
