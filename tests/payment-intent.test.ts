import { describe, expect, it } from "vitest";

import { REPORT_PRICE_PENCE } from "../lib/site";
import { createFakePayments, createUnconfiguredPayments } from "../lib/server/payments";
import { startReportPayment, type PaymentResolver } from "../lib/server/payment-intent";

// M9.4 — starting a report payment (the orchestration
// behind POST /api/payments/intent): the home is
// re-resolved on the server and the payment is created
// for the RESOLVED identity at the one price — a
// client-sent address is never trusted and a
// client-sent amount is never even read.

const HOME: PaymentResolver = async () => ({
  postcode: "CM3 2JT",
  homeKey: "19||BIRKDALE RISE",
});

describe("startReportPayment", () => {
  it("creates the payment for the resolved identity, the normalised email and the one price", async () => {
    const fake = createFakePayments();
    const result = await startReportPayment(
      { payments: fake, resolve: HOME },
      {
        // The client's own strings are NOT the identity:
        // a lowercase postcode, a stray amount and an
        // invented address all arrive — and none of them
        // is used.
        postcode: "cm3 2jt",
        homeKey: "19||BIRKDALE RISE",
        email: "  Buyer@Example.co.uk ",
        amount: 1,
        address: "1 Forged Street",
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.clientSecret).toContain(result.intentId);
    expect(fake.created).toEqual([
      {
        intentId: result.intentId,
        email: "buyer@example.co.uk",
        postcode: "CM3 2JT",
        homeKey: "19||BIRKDALE RISE",
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
      { payments: createFakePayments(), resolve },
      { postcode: "cm3 2jt", homeKey: "19||BIRKDALE RISE", email: "buyer@example.co.uk" },
    );
    expect(seen).toEqual([["cm3 2jt", "19||BIRKDALE RISE"]]);
  });

  it("creates a postcode-level payment when the resolution carries no home", async () => {
    const fake = createFakePayments();
    const result = await startReportPayment(
      {
        payments: fake,
        resolve: async () => ({ postcode: "CM3 2JT", homeKey: null }),
      },
      { postcode: "CM3 2JT", email: "buyer@example.co.uk" },
    );
    expect(result.ok).toBe(true);
    expect(fake.created[0]?.homeKey).toBeNull();
  });

  it("refuses a misshapen email before anything is created", async () => {
    const fake = createFakePayments();
    const result = await startReportPayment(
      { payments: fake, resolve: HOME },
      { postcode: "CM3 2JT", email: "not-an-email" },
    );
    expect(result).toEqual({ ok: false, reason: "email" });
    expect(fake.created).toHaveLength(0);
  });

  it("refuses a missing postcode or email as a bad request", async () => {
    const deps = { payments: createFakePayments(), resolve: HOME };
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
      { payments: createFakePayments(), resolve: async () => null },
      { postcode: "CM3 2JT", email: "buyer@example.co.uk" },
    );
    expect(result).toEqual({ ok: false, reason: "home-not-found" });
  });

  it("answers unavailable when the resolver itself fails", async () => {
    const result = await startReportPayment(
      {
        payments: createFakePayments(),
        resolve: async () => {
          throw new Error("directory down");
        },
      },
      { postcode: "CM3 2JT", email: "buyer@example.co.uk" },
    );
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("carries the unconfigured seam's answer through as not-configured", async () => {
    const result = await startReportPayment(
      { payments: createUnconfiguredPayments(), resolve: HOME },
      { postcode: "CM3 2JT", email: "buyer@example.co.uk" },
    );
    expect(result).toEqual({ ok: false, reason: "not-configured" });
  });
});
