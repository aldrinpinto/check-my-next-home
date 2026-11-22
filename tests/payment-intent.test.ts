import { describe, expect, it } from "vitest";

import { REPORT_PRICE_PENCE } from "../lib/site";
import {
  createFakePayments,
  createPaymentsRouter,
  createUnconfiguredPayments,
  type FakePayments,
  type Payments,
  type PaymentsRouter,
} from "../lib/server/payments";
import { startReportPayment, type PaymentResolver } from "../lib/server/payment-intent";

// M9.4/M9.5 — starting a report payment (the
// orchestration behind POST /api/payments/intent): the
// home is re-resolved on the server and the payment is
// created for the RESOLVED identity at the one price —
// a client-sent address is never trusted and a
// client-sent amount is never even read. M9.5 adds the
// consent gate (T-PAY-06's capture half): no consent,
// no payment — and a given consent rides into the
// payment's metadata beside the email.
//
// M9.6 — the seam speaks to the payments ROUTER: the
// lane is selected by delivery email (the test lane),
// the TEST flag rides into the metadata, the answer
// carries the lane's publishable key, and an email
// holding a bound gift is recognised before any charge
// — no payment is created for it at all.

const HOME: PaymentResolver = async () => ({
  postcode: "CM3 2JT",
  homeKey: "19||BIRKDALE RISE",
});

const CONSENT = { ticked: true, timestamp: "2026-11-22T00:40:00.000Z" };
const TESTER = "tester@example.co.uk";

// A router over fakes: the default set, and a test set
// where the case configures one.
function routerFor(
  live: Payments,
  opts?: { test?: FakePayments; testEmails?: string[] },
): PaymentsRouter {
  return createPaymentsRouter({
    live: { payments: live, webhookConfigured: true, publishableKey: "pk_default" },
    test: opts?.test
      ? { payments: opts.test, webhookConfigured: true, publishableKey: "pk_test_lane" }
      : null,
    testEmails: opts?.testEmails ?? [],
  });
}

describe("startReportPayment", () => {
  it("creates the payment for the resolved identity, the normalised email and the one price", async () => {
    const fake = createFakePayments();
    const result = await startReportPayment(
      { payments: routerFor(fake), resolve: HOME },
      {
        // The client's own strings are NOT the identity:
        // a lowercase postcode, a stray amount and an
        // invented address all arrive — and none of them
        // is used.
        postcode: "cm3 2jt",
        homeKey: "19||BIRKDALE RISE",
        email: "  Buyer@Example.co.uk ",
        consent: CONSENT,
        amount: 1,
        address: "1 Forged Street",
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok || "gifted" in result) return;
    expect(result.clientSecret).toContain(result.intentId);
    expect(result.publishableKey).toBe("pk_default");
    expect(fake.created).toEqual([
      {
        intentId: result.intentId,
        email: "buyer@example.co.uk",
        postcode: "CM3 2JT",
        homeKey: "19||BIRKDALE RISE",
        consentTick: true,
        consentTimestamp: CONSENT.timestamp,
        testOrder: false,
        amount: REPORT_PRICE_PENCE,
        currency: "gbp",
        status: "requires_confirmation",
      },
    ]);
  });

  it("passes the client's postcode and home key to the resolver, and only those", async () => {
    const seen: [string, string | null][] = [];
    const resolve: PaymentResolver = async (postcode, homeKey) => {
      seen.push([postcode, homeKey]);
      return { postcode: "CM3 2JT", homeKey: "19||BIRKDALE RISE" };
    };
    await startReportPayment(
      { payments: routerFor(createFakePayments()), resolve },
      {
        postcode: "cm3 2jt",
        homeKey: "19||BIRKDALE RISE",
        email: "buyer@example.co.uk",
        consent: CONSENT,
      },
    );
    expect(seen).toEqual([["cm3 2jt", "19||BIRKDALE RISE"]]);
  });

  it("creates a postcode-level payment when the resolution carries no home", async () => {
    const fake = createFakePayments();
    const result = await startReportPayment(
      {
        payments: routerFor(fake),
        resolve: async () => ({ postcode: "CM3 2JT", homeKey: null }),
      },
      { postcode: "CM3 2JT", email: "buyer@example.co.uk", consent: CONSENT },
    );
    expect(result.ok).toBe(true);
    expect(fake.created[0]?.homeKey).toBeNull();
  });

  it("refuses a start with no consent at all — nothing is created (T-PAY-06)", async () => {
    const fake = createFakePayments();
    const result = await startReportPayment(
      { payments: routerFor(fake), resolve: HOME },
      { postcode: "CM3 2JT", email: "buyer@example.co.uk" },
    );
    expect(result).toEqual({ ok: false, reason: "consent" });
    expect(fake.created).toHaveLength(0);
  });

  it("refuses an unticked, mistimed or misshapen consent — nothing is created (T-PAY-06)", async () => {
    const fake = createFakePayments();
    const deps = { payments: routerFor(fake), resolve: HOME };
    const base = { postcode: "CM3 2JT", email: "buyer@example.co.uk" };
    await expect(
      startReportPayment(deps, {
        ...base,
        consent: { ticked: false, timestamp: CONSENT.timestamp },
      }),
    ).resolves.toEqual({ ok: false, reason: "consent" });
    await expect(
      startReportPayment(deps, { ...base, consent: { ticked: true, timestamp: "just now" } }),
    ).resolves.toEqual({ ok: false, reason: "consent" });
    await expect(startReportPayment(deps, { ...base, consent: { ticked: true } })).resolves.toEqual(
      { ok: false, reason: "consent" },
    );
    await expect(startReportPayment(deps, { ...base, consent: "yes" })).resolves.toEqual({
      ok: false,
      reason: "consent",
    });
    expect(fake.created).toHaveLength(0);
  });

  it("refuses a misshapen email before anything is created", async () => {
    const fake = createFakePayments();
    const result = await startReportPayment(
      { payments: routerFor(fake), resolve: HOME },
      { postcode: "CM3 2JT", email: "not-an-email", consent: CONSENT },
    );
    expect(result).toEqual({ ok: false, reason: "email" });
    expect(fake.created).toHaveLength(0);
  });

  it("refuses a missing postcode or email as a bad request", async () => {
    const deps = { payments: routerFor(createFakePayments()), resolve: HOME };
    await expect(startReportPayment(deps, { email: "buyer@example.co.uk" })).resolves.toEqual({
      ok: false,
      reason: "bad-request",
    });
    await expect(startReportPayment(deps, { postcode: "CM3 2JT" })).resolves.toEqual({
      ok: false,
      reason: "bad-request",
    });
    await expect(
      startReportPayment(deps, { postcode: "CM3 2JT", email: "buyer@example.co.uk", homeKey: 42 }),
    ).resolves.toEqual({ ok: false, reason: "bad-request" });
  });

  it("answers home-not-found when the resolver cannot resolve the home", async () => {
    const result = await startReportPayment(
      { payments: routerFor(createFakePayments()), resolve: async () => null },
      { postcode: "CM3 2JT", email: "buyer@example.co.uk", consent: CONSENT },
    );
    expect(result).toEqual({ ok: false, reason: "home-not-found" });
  });

  it("answers unavailable when the resolver itself fails", async () => {
    const result = await startReportPayment(
      {
        payments: routerFor(createFakePayments()),
        resolve: async () => {
          throw new Error("directory down");
        },
      },
      { postcode: "CM3 2JT", email: "buyer@example.co.uk", consent: CONSENT },
    );
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("carries the unconfigured seam's answer through as not-configured", async () => {
    const result = await startReportPayment(
      { payments: routerFor(createUnconfiguredPayments()), resolve: HOME },
      { postcode: "CM3 2JT", email: "buyer@example.co.uk", consent: CONSENT },
    );
    expect(result).toEqual({ ok: false, reason: "not-configured" });
  });
});

describe("startReportPayment — the test lane (M9.6)", () => {
  it("an allowlisted email with a test set configured creates on the TEST set, flagged, with the test publishable key", async () => {
    const live = createFakePayments();
    const test = createFakePayments();
    const result = await startReportPayment(
      {
        payments: routerFor(live, { test, testEmails: [TESTER] }),
        resolve: HOME,
      },
      { postcode: "CM3 2JT", email: ` ${TESTER.toUpperCase()} `, consent: CONSENT },
    );
    expect(result.ok).toBe(true);
    if (!result.ok || "gifted" in result) return;
    expect(result.publishableKey).toBe("pk_test_lane");
    expect(live.created).toHaveLength(0);
    expect(test.created).toHaveLength(1);
    expect(test.created[0]?.testOrder).toBe(true);
    expect(test.created[0]?.email).toBe(TESTER);
  });

  it("an allowlisted email with NO test set configured creates on the default set — and is still flagged TEST", async () => {
    const live = createFakePayments();
    const result = await startReportPayment(
      { payments: routerFor(live, { testEmails: [TESTER] }), resolve: HOME },
      { postcode: "CM3 2JT", email: TESTER, consent: CONSENT },
    );
    expect(result.ok).toBe(true);
    if (!result.ok || "gifted" in result) return;
    expect(result.publishableKey).toBe("pk_default");
    expect(live.created).toHaveLength(1);
    expect(live.created[0]?.testOrder).toBe(true);
  });

  it("an unlisted email can never reach the test set, and is never flagged (the negative pin)", async () => {
    const live = createFakePayments();
    const test = createFakePayments();
    const result = await startReportPayment(
      {
        payments: routerFor(live, { test, testEmails: [TESTER] }),
        resolve: HOME,
      },
      { postcode: "CM3 2JT", email: "buyer@example.co.uk", consent: CONSENT },
    );
    expect(result.ok).toBe(true);
    expect(test.created).toHaveLength(0);
    expect(live.created).toHaveLength(1);
    expect(live.created[0]?.testOrder).toBe(false);
  });
});

describe("startReportPayment — gift recognition (M9.6)", () => {
  it("a bound gift email creates NO payment: the order is claimed gifted, for the resolved home", async () => {
    const fake = createFakePayments();
    const claims: unknown[] = [];
    const result = await startReportPayment(
      {
        payments: routerFor(fake),
        resolve: HOME,
        giftFor: async (email) => (email === "friend@example.co.uk" ? { token: "gift-tok" } : null),
        claimGifted: async (input) => {
          claims.push(input);
          return true;
        },
      },
      { postcode: "cm3 2jt", email: " Friend@Example.co.uk ", consent: CONSENT },
    );
    expect(result).toEqual({ ok: true, gifted: true, ref: "gift-tok" });
    expect(fake.created).toHaveLength(0);
    expect(claims).toEqual([
      {
        ref: "gift-tok",
        email: "friend@example.co.uk",
        postcode: "CM3 2JT",
        homeKey: "19||BIRKDALE RISE",
        giftToken: "gift-tok",
      },
    ]);
  });

  it("an email with no bound gift pays as normal", async () => {
    const fake = createFakePayments();
    const result = await startReportPayment(
      {
        payments: routerFor(fake),
        resolve: HOME,
        giftFor: async () => null,
        claimGifted: async () => {
          throw new Error("must not be called");
        },
      },
      { postcode: "CM3 2JT", email: "buyer@example.co.uk", consent: CONSENT },
    );
    expect(result.ok).toBe(true);
    expect(fake.created).toHaveLength(1);
  });
});
