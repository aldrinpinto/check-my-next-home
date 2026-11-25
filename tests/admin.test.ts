import { describe, expect, it } from "vitest";

import {
  ADMIN_STATUS_FILTER_KEYS,
  ADMIN_STATUS_LABELS,
  EMPTY_COUNTING,
  adminCaption,
  adminDemand,
  adminFunnel,
  adminGiftCounts,
  adminGlance,
  adminNeedsHuman,
  adminOrderDetail,
  adminOrderRows,
  attachPageErrorDetail,
  failedPayments,
  resolveAdminPeriod,
  type AdminSlice,
} from "../lib/admin";
import type { DeliveryRecord } from "../lib/download";
import type { GiftRecord } from "../lib/gift";
import type { FulfilmentClaim } from "../lib/server/fulfilment";
import type { OrderRecord } from "../lib/server/orders";
import type { PaymentEventRecord } from "../lib/server/payment-events";
import type { PaymentRefund } from "../lib/server/refunds";

// The admin page's composition (M9.11; Sample 36 is
// the design authority, ADMIN-PAGE-PLAN.md the content
// authority). The seam reads the shelves; everything
// the owner sees is composed here, so the panels are
// pinned here — periods and the caption, the glance
// cards and their deltas, the funnel and its re-base,
// the orders table's rows and statuses, the demand
// panel, the needs-a-human list, the gift counts, and
// the order detail with its refund record and resend
// standing.

const NOW = new Date("2026-11-23T12:00:00.000Z"); // a Monday, London = GMT
const AT = (iso: string) => new Date(iso);

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    ref: "pi_1",
    kind: "paid",
    email: "sarah.m@example.co.uk",
    postcode: "CM3 2JT",
    homeKey: "19||BIRKDALE RISE",
    amount: 499,
    currency: "gbp",
    providerRef: null,
    consentTick: true,
    consentTimestamp: "2026-11-23T09:12:00.000Z",
    deliveryId: null,
    refundStatus: "none",
    testOrder: false,
    saleAlertSentAt: null,
    failureNoticeSentAt: null,
    createdAt: AT("2026-11-23T09:12:00.000Z"),
    updatedAt: AT("2026-11-23T09:12:00.000Z"),
    ...overrides,
  };
}

function claim(overrides: Partial<FulfilmentClaim> = {}): FulfilmentClaim {
  return {
    ref: "pi_1",
    kind: "paid",
    email: "sarah.m@example.co.uk",
    postcode: "CM3 2JT",
    homeKey: "19||BIRKDALE RISE",
    giftToken: null,
    testOrder: false,
    status: "fulfilled",
    deliveryId: "d1",
    mailSent: true,
    lastError: null,
    attempts: 1,
    claimedAt: AT("2026-11-23T09:12:00.000Z"),
    fulfilledAt: AT("2026-11-23T09:13:00.000Z"),
    ...overrides,
  };
}

function delivery(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    id: "d1",
    email: "sarah.m@example.co.uk",
    kind: "paid",
    pdfKey: "reports/pi_1.pdf",
    fileName: "19 Birkdale Rise report.pdf",
    homeTitle: "19 Birkdale Rise",
    homeAddressLine: "19 Birkdale Rise, Hatfield Peverel CM3 2JT",
    giftToken: null,
    orderRef: "pi_1",
    createdAt: AT("2026-11-23T09:13:00.000Z"),
    withdrawnAt: null,
    withdrawnRefundId: null,
    ...overrides,
  };
}

function gift(overrides: Partial<GiftRecord> = {}): GiftRecord {
  return {
    token: "tok_1",
    buyerEmail: "sarah.m@example.co.uk",
    claimantEmail: null,
    status: "issued",
    orderRef: "pi_1",
    issuedAt: AT("2026-11-23T09:13:00.000Z"),
    expiresAt: AT("2026-12-23T09:13:00.000Z"),
    claimedAt: null,
    redeemedAt: null,
    voidedAt: null,
    pendingEmail: null,
    pendingToken: null,
    pendingSentAt: null,
    ...overrides,
  };
}

function refund(overrides: Partial<PaymentRefund> = {}): PaymentRefund {
  return {
    refundId: "re_1",
    paymentRef: "pi_1",
    chargeRef: "ch_1",
    amount: 499,
    currency: "gbp",
    status: "succeeded",
    livemode: true,
    testOrder: false,
    unmatched: false,
    consequencesApplied: true,
    consequencesAppliedAt: AT("2026-11-23T10:00:00.000Z"),
    giftConsequence: "voided",
    needsAttention: false,
    providerCreatedAt: AT("2026-11-23T09:58:00.000Z"),
    firstHeardAt: AT("2026-11-23T09:59:00.000Z"),
    updatedAt: AT("2026-11-23T10:00:00.000Z"),
    ...overrides,
  };
}

function paymentEvent(overrides: Partial<PaymentEventRecord> = {}): PaymentEventRecord {
  return {
    eventType: "payment_intent.payment_failed",
    intentId: "pi_failed",
    status: "requires_payment_method",
    email: "m.davies@example.co.uk",
    postcode: "CM3 2JT",
    homeKey: "7||BIRKDALE RISE",
    livemode: true,
    testOrder: false,
    failureReason: "Your card was declined.",
    receivedAt: AT("2026-11-22T21:44:00.000Z"),
    ...overrides,
  };
}

function slice(overrides: Partial<AdminSlice> = {}): AdminSlice {
  return {
    events: {
      pageViews: 0,
      reportPageViews: 0,
      checkStarted: 0,
      checkCompleted: 0,
      checkoutStarted: 0,
      checkoutPaid: 0,
      reportDelivered: 0,
      failedSearches: 0,
    },
    orders: [],
    claims: [],
    deliveries: [],
    paymentEvents: [],
    gifts: [],
    refundsByPayment: new Map(),
    refundedInFull: new Set(),
    giftByOrder: new Map(),
    purchaseTypeByOrder: new Map(),
    giftTestByToken: new Map(),
    counting: EMPTY_COUNTING,
    checksByNationRung: [],
    pageErrors: [],
    ...overrides,
  };
}

const ALL = { range: "d7" as const, kind: "all" as const, testExcluded: true };

describe("admin — periods and the caption", () => {
  it("today runs from London midnight to now and compares with yesterday", () => {
    const period = resolveAdminPeriod({
      range: "today",
      customFrom: null,
      customTo: null,
      compare: true,
      now: NOW,
    });
    expect(period.from.toISOString()).toBe("2026-11-23T00:00:00.000Z");
    expect(period.to).toBe(NOW);
    expect(period.previous).toEqual({
      from: new Date("2026-11-22T00:00:00.000Z"),
      to: new Date("2026-11-22T12:00:00.000Z"),
    });
    expect(period.compareNoun).toBe("yesterday");
  });

  it("the caption states the slice in the sample's form", () => {
    const period = resolveAdminPeriod({
      range: "d7",
      customFrom: null,
      customTo: null,
      compare: true,
      now: NOW,
    });
    expect(adminCaption({ range: "d7", kind: "all", testExcluded: true, period })).toBe(
      "Showing: Last 7 days · Kind: All kinds · Test orders excluded · Compared with the previous 7 days",
    );
  });

  it("a custom range closes at the end of its last day", () => {
    const period = resolveAdminPeriod({
      range: "custom",
      customFrom: "2026-11-10",
      customTo: "2026-11-12",
      compare: true,
      now: NOW,
    });
    expect(period.from.toISOString()).toBe("2026-11-10T00:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-11-13T00:00:00.000Z");
    expect(period.compareNoun).toBe("the previous 3 days");
  });
});

describe("admin — at a glance", () => {
  it("reads the five cards off the shelves, with previous-period deltas", () => {
    const current = slice({
      events: {
        pageViews: 40,
        reportPageViews: 12,
        checkStarted: 30,
        checkCompleted: 25,
        checkoutStarted: 9,
        checkoutPaid: 5,
        reportDelivered: 5,
        failedSearches: 2,
      },
      orders: [order()],
      claims: [claim()],
      deliveries: [delivery()],
      paymentEvents: [paymentEvent()],
    });
    const previous = slice({
      events: {
        pageViews: 30,
        reportPageViews: 9,
        checkStarted: 22,
        checkCompleted: 20,
        checkoutStarted: 7,
        checkoutPaid: 4,
        reportDelivered: 4,
        failedSearches: 1,
      },
      paymentEvents: [
        paymentEvent({ intentId: "pi_old_1" }),
        paymentEvent({ intentId: "pi_old_2" }),
      ],
    });
    const cards = adminGlance({
      current,
      previous,
      slice: ALL,
      compareNoun: "the previous 7 days",
    });
    expect(cards.map((card) => card.label)).toEqual([
      "Checks completed",
      "Reports delivered",
      "Revenue",
      "Check → paid conversion",
      "Failed payments",
    ]);
    expect(cards[0].value).toBe("25");
    expect(cards[1].value).toBe("1");
    expect(cards[2].value).toBe("£4.99");
    // With test orders excluded the conversion re-bases
    // onto the claims shelf (the checkout_paid events
    // carry no test flag): 1 paid claim over 25 checks.
    expect(cards[3].value).toBe("4.0%");
    expect(cards[4].value).toBe("1");
    expect(cards[4].delta?.text).toBe("1 fewer than the previous 7 days");
    expect(cards[4].delta?.tone).toBe("good");
  });

  it("the conversion card reads — where the slice has no paid path", () => {
    const cards = adminGlance({
      current: slice(),
      previous: null,
      slice: { ...ALL, kind: "gifted" },
      compareNoun: "the previous 7 days",
    });
    expect(cards[3].value).toBe("—");
    expect(cards[0].delta).toBeNull();
  });

  it("a fully-refunded order leaves the revenue and delivered figures", () => {
    const cards = adminGlance({
      current: slice({
        events: {
          pageViews: 0,
          reportPageViews: 0,
          checkStarted: 0,
          checkCompleted: 1,
          checkoutStarted: 0,
          checkoutPaid: 1,
          reportDelivered: 1,
          failedSearches: 0,
        },
        orders: [order()],
        claims: [claim()],
        deliveries: [delivery()],
        refundedInFull: new Set(["pi_1"]),
      }),
      previous: null,
      slice: ALL,
      compareNoun: "the previous 7 days",
    });
    // The events say 1 delivered and 1 paid, but the
    // order stands refunded — the tables win (BUG-349,
    // BUG-351): no delivered order, no revenue.
    expect(cards[1].value).toBe("0");
    expect(cards[2].value).toBe("£0.00");
  });
});

describe("admin — failed payments", () => {
  it("a failed intent with no claim and no success stands, with the provider's reason", () => {
    const failures = failedPayments(slice({ paymentEvents: [paymentEvent()] }), ALL);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe("Your card was declined.");
    expect(failures[0].email).toBe("m.davies@example.co.uk");
  });

  it("an intent that later succeeded in the period does not stand", () => {
    const failures = failedPayments(
      slice({
        paymentEvents: [
          paymentEvent(),
          paymentEvent({
            eventType: "payment_intent.succeeded",
            status: "succeeded",
            failureReason: null,
            receivedAt: AT("2026-11-22T21:50:00.000Z"),
          }),
        ],
      }),
      ALL,
    );
    expect(failures).toHaveLength(0);
  });

  it("a test failure is left out while test orders are excluded", () => {
    const data = slice({ paymentEvents: [paymentEvent({ testOrder: true })] });
    expect(failedPayments(data, ALL)).toHaveLength(0);
    expect(failedPayments(data, { ...ALL, testExcluded: false })).toHaveLength(1);
  });
});

describe("admin — the funnel", () => {
  it("reads the first five steps off the events and re-bases Paid and Delivered onto the order tables, and names the deliveries that skip payment", () => {
    const funnel = adminFunnel({
      current: slice({
        events: {
          pageViews: 100,
          reportPageViews: 30,
          checkStarted: 60,
          checkCompleted: 50,
          checkoutStarted: 20,
          checkoutPaid: 8,
          reportDelivered: 10,
          failedSearches: 0,
        },
        orders: [order()],
        claims: [claim()],
        deliveries: [delivery(), delivery({ id: "d2", kind: "free", orderRef: null })],
      }),
      slice: { ...ALL, testExcluded: false },
    });
    // The events say 8 paid and 10 delivered, but the
    // order tables carry 1 paid claim and 1 delivered
    // order — the tables win (BUG-351).
    expect(funnel.steps.map((step) => step.count)).toEqual([100, 60, 50, 30, 20, 1, 1]);
    expect(funnel.extraLine).toBe("Plus 1 free-window delivery that skipped the payment steps.");
  });

  it("a gifted slice re-bases Paid to zero and Delivered onto the delivered orders", () => {
    const funnel = adminFunnel({
      current: slice({
        deliveries: [delivery({ kind: "gifted" })],
        orders: [order({ kind: "gifted" })],
        claims: [claim({ kind: "gifted" })],
      }),
      slice: { ...ALL, kind: "gifted" },
    });
    expect(funnel.steps[5].count).toBe(0);
    expect(funnel.steps[6].count).toBe(1);
    expect(funnel.extraLine).toBeNull();
  });

  it("a refunded order's delivery does not count as delivered", () => {
    const funnel = adminFunnel({
      current: slice({
        orders: [order()],
        claims: [claim()],
        deliveries: [delivery()],
        refundedInFull: new Set(["pi_1"]),
      }),
      slice: ALL,
    });
    expect(funnel.steps[6].count).toBe(0);
  });
});

describe("admin — the orders table", () => {
  it("a delivered paid order reads in the sample's forms", () => {
    const rows = adminOrderRows({
      data: slice({
        orders: [order()],
        claims: [claim()],
        deliveries: [delivery()],
        giftByOrder: new Map([["pi_1", gift()]]),
      }),
      slice: ALL,
      status: "all",
      search: "",
      now: NOW,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      homeLabel: "CM3 2JT — 19 Birkdale Rise, Hatfield Peverel",
      kindLabel: "Paid",
      amountLabel: "£4.99",
      statusLabel: "Delivered",
      deliveredLabel: "Yes",
      giftLabel: "Gift issued",
      isOrder: true,
    });
  });

  it("a refunded order reads Refunded, and its gift reads voided by the refund", () => {
    const rows = adminOrderRows({
      data: slice({
        orders: [order()],
        claims: [claim()],
        deliveries: [delivery()],
        refundsByPayment: new Map([["pi_1", [refund()]]]),
        refundedInFull: new Set(["pi_1"]),
        giftByOrder: new Map([["pi_1", gift({ status: "voided", voidedAt: NOW })]]),
      }),
      slice: ALL,
      status: "all",
      search: "",
      now: NOW,
    });
    expect(rows[0].statusLabel).toBe("Refunded");
    expect(rows[0].giftLabel).toBe("Gift voided by the refund");
  });

  it("a failed payment stands as its own row, with no order behind it", () => {
    const rows = adminOrderRows({
      data: slice({ paymentEvents: [paymentEvent()] }),
      slice: ALL,
      status: "all",
      search: "",
      now: NOW,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      homeLabel: "CM3 2JT — 7, Birkdale Rise",
      statusLabel: "Payment failed",
      deliveredLabel: "—",
      giftLabel: "—",
      isOrder: false,
    });
  });

  it("the status filter and the search narrow the rows; a test order is out by default", () => {
    const data = slice({
      orders: [order(), order({ ref: "pi_2", testOrder: true, email: "testlane@example.co.uk" })],
      claims: [claim(), claim({ ref: "pi_2", testOrder: true })],
      deliveries: [delivery(), delivery({ id: "d2", orderRef: "pi_2" })],
    });
    const base = { data, slice: ALL, now: NOW };
    expect(adminOrderRows({ ...base, status: "all", search: "" })).toHaveLength(1);
    expect(adminOrderRows({ ...base, status: "refunded", search: "" })).toHaveLength(0);
    expect(adminOrderRows({ ...base, status: "all", search: "sarah" })).toHaveLength(1);
    expect(adminOrderRows({ ...base, status: "all", search: "e16" })).toHaveLength(0);
    expect(
      adminOrderRows({
        ...base,
        slice: { ...ALL, testExcluded: false },
        status: "all",
        search: "",
      }),
    ).toHaveLength(2);
  });

  it("orders sharing a timestamp sort deterministically by reference", () => {
    const rows = adminOrderRows({
      data: slice({
        orders: [order({ ref: "pi_2" }), order()],
        claims: [claim({ ref: "pi_2" }), claim()],
        deliveries: [delivery({ id: "d2", orderRef: "pi_2" }), delivery()],
      }),
      slice: ALL,
      status: "all",
      search: "",
      now: NOW,
    });
    expect(rows.map((row) => row.ref)).toEqual(["pi_2", "pi_1"]);
  });
});

describe("admin — where people are looking", () => {
  it("derives bought by search type from the order tables, and ignores the counting shelf's bought figures", () => {
    const data = slice({
      orders: [order(), order({ ref: "pi_2", testOrder: true })],
      purchaseTypeByOrder: new Map([
        ["pi_1", "postcode"],
        ["pi_2", "postcode"],
      ]),
      counting: {
        checksByPostcode: [{ postcode: "CM3 2JT", checks: 4 }],
        checksByStreet: [{ label: "Birkdale Rise, Hatfield Peverel", checks: 3 }],
        checksByType: { postcode: 10, street: 3, "wider-area": 2 },
        // Deliberately wrong: the panel must not read
        // these (BUG-352 — the shelf carries historical
        // rows flagged before BUG-290's livemode rule).
        purchasesByType: { postcode: 9, street: 4, "wider-area": 0 },
        purchasesByTypeTest: { postcode: 7, street: 0, "wider-area": 0 },
      },
      checksByNationRung: [{ nation: "england", rung: 1, checks: 7 }],
      events: {
        pageViews: 0,
        reportPageViews: 0,
        checkStarted: 0,
        checkCompleted: 0,
        checkoutStarted: 0,
        checkoutPaid: 0,
        reportDelivered: 0,
        failedSearches: 5,
      },
    });
    const demand = adminDemand({ data, slice: ALL });
    expect(demand.postcodes).toEqual([
      { postcode: "CM3 2JT", checks: 4, bought: 1, conversion: "25.0%" },
    ]);
    expect(demand.searchTypes[0]).toEqual({
      label: "Postcode search",
      searches: 10,
      bought: 1,
      conversion: "10.0%",
    });
    expect(demand.nationRungs).toEqual([{ label: "England · Exact home", checks: 7 }]);
    expect(demand.failedSearches).toBe(5);
    const withTest = adminDemand({ data, slice: { ...ALL, testExcluded: false } });
    expect(withTest.searchTypes[0].bought).toBe(2);
  });
});

describe("admin — needs a human", () => {
  it("carries the failed payment's reason, the delivery failure's kept error, and the unsent email", () => {
    const items = adminNeedsHuman({
      data: slice({
        orders: [
          order(),
          order({ ref: "pi_2", email: "j.okafor@example.co.uk", postcode: "E16 1AS" }),
        ],
        claims: [
          claim({ status: "fulfilled", mailSent: false }),
          claim({
            ref: "pi_2",
            email: "j.okafor@example.co.uk",
            postcode: "E16 1AS",
            status: "failed",
            lastError: "The report file could not be created.",
          }),
        ],
        paymentEvents: [paymentEvent()],
      }),
      slice: ALL,
      now: NOW,
    });
    const reasons = items.map((item) => item.reason);
    expect(reasons).toContain("Your card was declined. No money was taken.");
    expect(reasons).toContain(
      "Payment taken, but the report could not be delivered: The report file could not be created.",
    );
    expect(reasons).toContain(
      "Payment taken and the report is ready, but the delivery email has not gone out yet.",
    );
  });

  it("a claim still standing after an hour is stuck", () => {
    const items = adminNeedsHuman({
      data: slice({
        orders: [order()],
        claims: [
          claim({ status: "claimed", claimedAt: AT("2026-11-23T09:00:00.000Z"), attempts: 3 }),
        ],
      }),
      slice: ALL,
      now: NOW,
    });
    expect(items).toHaveLength(1);
    expect(items[0].statusLabel).toBe("Stuck — still preparing");
    expect(items[0].reason).toContain("over an hour, across 3 attempts");
  });
});

describe("admin — gifts", () => {
  it("counts the period's cohort by the standing at read time; a voided gift counts nowhere", () => {
    const counts = adminGiftCounts({
      data: slice({
        orders: [order()],
        gifts: [
          gift(),
          gift({ token: "tok_2", status: "claimed", claimedAt: NOW }),
          gift({ token: "tok_3", status: "redeemed", redeemedAt: NOW }),
          gift({
            token: "tok_4",
            issuedAt: AT("2026-11-20T09:00:00.000Z"),
            expiresAt: AT("2026-11-22T09:00:00.000Z"),
          }),
          gift({ token: "tok_5", status: "voided", voidedAt: NOW }),
        ],
      }),
      slice: ALL,
      now: NOW,
    });
    expect(counts).toEqual({ issued: 1, claimed: 1, redeemed: 1, expired: 1 });
  });

  it("an orphan gift from a test order is out while test orders are excluded; an unresolvable source still counts", () => {
    const data = slice({
      gifts: [
        gift({ token: "tok_orphan", orderRef: "pi_old" }),
        gift({ token: "tok_ghost", orderRef: "pi_gone" }),
      ],
      giftTestByToken: new Map([["tok_orphan", true]]),
    });
    expect(adminGiftCounts({ data, slice: ALL, now: NOW })).toEqual({
      issued: 1,
      claimed: 0,
      redeemed: 0,
      expired: 0,
    });
    expect(adminGiftCounts({ data, slice: { ...ALL, testExcluded: false }, now: NOW })).toEqual({
      issued: 2,
      claimed: 0,
      redeemed: 0,
      expired: 0,
    });
  });
});

describe("admin — the order detail", () => {
  it("shows the refund record in full: Stripe's time and ours, the gift consequence, the applied standing", () => {
    const detail = adminOrderDetail({
      order: order(),
      claim: claim(),
      deliveries: [delivery()],
      refunds: [refund()],
      refundedInFull: true,
      gift: gift({ status: "voided", voidedAt: NOW }),
      paymentEvents: [],
      log: [],
      now: NOW,
    });
    expect(detail.statusLabel).toBe("Refunded");
    expect(detail.refunds).toHaveLength(1);
    const lines = Object.fromEntries(
      detail.refunds[0].lines.map((line) => [line.label, line.value]),
    );
    expect(lines["Amount"]).toBe("£4.99");
    expect(lines["When Stripe says it happened"]).toBe("Today 09:58");
    expect(lines["When we heard"]).toBe("Today 09:59");
    expect(lines["Gift consequence"]).toBe("The gift was voided before it was claimed.");
    expect(lines["Consequences applied"]).toContain("Yes");
    // The consent time reads in the page's friendly form,
    // not the stored ISO stamp (BUG-357).
    const facts = Object.fromEntries(detail.facts.map((line) => [line.label, line.value]));
    expect(facts["Consent"]).toBe("Ticked at Today 09:12");
    // A refunded order's delivery stands withdrawn: no resend.
    expect(detail.resend.available).toBe(false);
    expect(detail.resend.note).toContain("refunded");
  });

  it("the resend stands where a delivery stands unw withdrawn", () => {
    const detail = adminOrderDetail({
      order: order(),
      claim: claim(),
      deliveries: [delivery()],
      refunds: [],
      refundedInFull: false,
      gift: gift(),
      paymentEvents: [],
      log: [{ kind: "delivery", sent: true, detail: null, createdAt: NOW }],
      now: NOW,
    });
    expect(detail.resend).toEqual({ available: true, note: null });
    expect(detail.logLines[0].value).toBe("Delivery email — sent");
  });
});

describe("admin — the status filter", () => {
  it("lists every order status, so no status can go missing from the filter again", () => {
    expect([...ADMIN_STATUS_FILTER_KEYS].sort()).toEqual(Object.keys(ADMIN_STATUS_LABELS).sort());
    expect(ADMIN_STATUS_FILTER_KEYS).toContain("preparing");
  });
});

describe("admin — page errors", () => {
  it("joins error counts to their latest occurrence; a missing latest reads null", () => {
    expect(
      attachPageErrorDetail(
        [
          { name: "CheckRequestFailed", count: 11 },
          { name: "OtherError", count: 2 },
        ],
        new Map([
          ["CheckRequestFailed", { route: "/search", lastAt: AT("2026-11-23T10:41:00.000Z") }],
        ]),
      ),
    ).toEqual([
      {
        name: "CheckRequestFailed",
        count: 11,
        route: "/search",
        lastAt: AT("2026-11-23T10:41:00.000Z"),
      },
      { name: "OtherError", count: 2, route: null, lastAt: null },
    ]);
  });
});
