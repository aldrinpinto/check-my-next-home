// The admin page's data seam (plan step M9.11) — the
// one query set per load the plan asks for. Every
// panel's raw material is read here, once, for the
// window the control bar names; the composition
// (lib/admin.ts) slices it. The reads run through the
// shelves' own stores wherever a store exists — the
// orders, claims, deliveries, gifts, refunds and
// payment-event shelves — and through two aggregate
// reads of the journey events, which have no store
// (their recorder is write-only by design; the weekly
// digest reads them the same way, scripts/journey-
// digest.mjs).
//
// The order detail and the resend run through M9.10's
// order-admin module, unchanged: the lookup's summary
// and the owner re-send are the same engine the ops
// script drives, with the same rules — the resend
// goes only to the order's recorded email (the page
// presents the order's own address as the requester,
// the owner being behind the Access wall; the check's
// purpose in the script's out-of-band flow is recorded
// in that module), and M9.8's withdrawal refusal is
// inherited, never re-implemented.

import type { Pool } from "pg";

import type { AdminEventCounts, AdminSlice } from "../admin";
import type { GiftRecord } from "../gift";
import { getDbPool } from "./db";
import { createDbFulfilmentClaimStore, type FulfilmentClaimStore } from "./fulfilment";
import { createDbGiftStore, type GiftStore } from "./gifts";
import {
  findOrders,
  ownerResendOrder,
  type OrderAdminDeps,
  type OrderSummary,
  type OwnerResendResult,
} from "./order-admin";
import { createDbOrderStore, type OrderStore } from "./orders";
import {
  createDbPaymentEventLog,
  type PaymentEventLog,
  type PaymentEventRecord,
} from "./payment-events";
import { createDbDeliveryStore, type DeliveryStore } from "./report-deliveries";
import { getReportDeliveryService } from "./report-delivery";
import { createDbRefundStore, createRefundProcessing, type RefundStore } from "./refunds";
import { createDbSearchCountingStore, type SearchCountingStore } from "./search-counting";

export interface AdminDataDeps {
  pool: Pool;
  orders: OrderStore;
  claims: FulfilmentClaimStore;
  deliveries: DeliveryStore;
  gifts: GiftStore;
  refunds: RefundStore;
  paymentEvents: PaymentEventLog;
  counting: SearchCountingStore;
}

export function getAdminDataDeps(): AdminDataDeps {
  const pool = getDbPool();
  return {
    pool,
    orders: createDbOrderStore(pool),
    claims: createDbFulfilmentClaimStore(pool),
    deliveries: createDbDeliveryStore(pool),
    gifts: createDbGiftStore(pool),
    refunds: createDbRefundStore(pool),
    paymentEvents: createDbPaymentEventLog(pool),
    counting: createDbSearchCountingStore(pool),
  };
}

interface EventRow {
  event: string;
  route_pattern: string | null;
  n: number;
}

async function readEventCounts(pool: Pool, from: Date, to: Date): Promise<AdminEventCounts> {
  const { rows } = await pool.query(
    `SELECT event, route_pattern, count(*)::int AS n FROM journey_events
      WHERE occurred_at >= $1 AND occurred_at < $2
      GROUP BY event, route_pattern`,
    [from, to],
  );
  const counts: AdminEventCounts = {
    pageViews: 0,
    reportPageViews: 0,
    checkStarted: 0,
    checkCompleted: 0,
    checkoutStarted: 0,
    checkoutPaid: 0,
    reportDelivered: 0,
    failedSearches: 0,
  };
  for (const row of rows as unknown as EventRow[]) {
    switch (row.event) {
      case "page_view":
        counts.pageViews += row.n;
        if (row.route_pattern === "/report") counts.reportPageViews += row.n;
        if (row.route_pattern === "/search/failed") counts.failedSearches += row.n;
        break;
      case "check_started":
        counts.checkStarted += row.n;
        break;
      case "check_completed":
        counts.checkCompleted += row.n;
        break;
      case "checkout_started":
        counts.checkoutStarted += row.n;
        break;
      case "checkout_paid":
        counts.checkoutPaid += row.n;
        break;
      case "report_delivered":
        counts.reportDelivered += row.n;
        break;
    }
  }
  return counts;
}

export async function readAdminSlice(
  deps: AdminDataDeps,
  window: { from: Date; to: Date },
): Promise<AdminSlice> {
  const [
    events,
    orders,
    claims,
    deliveries,
    paymentEvents,
    gifts,
    counting,
    nationRungRows,
    errorRows,
  ] = await Promise.all([
    readEventCounts(deps.pool, window.from, window.to),
    deps.orders.listInPeriod(window),
    deps.claims.listInPeriod(window),
    deps.deliveries.listInPeriod(window),
    deps.paymentEvents.listInPeriod(window),
    deps.gifts.listIssuedInPeriod(window),
    deps.counting.readPeriod(window),
    deps.pool.query(
      `SELECT nation, rung, count(*)::int AS n FROM journey_events
          WHERE event = 'check_completed' AND occurred_at >= $1 AND occurred_at < $2
          GROUP BY nation, rung`,
      [window.from, window.to],
    ),
    deps.pool.query(
      `SELECT error_name, count(*)::int AS n FROM journey_events
          WHERE event = 'page_error' AND occurred_at >= $1 AND occurred_at < $2
            AND error_name IS NOT NULL
          GROUP BY error_name ORDER BY n DESC LIMIT 3`,
      [window.from, window.to],
    ),
  ]);

  // The period's orders name their payments and their
  // gifts: one read each across the set, from the one
  // source for each fact.
  const paidRefs = orders.filter((order) => order.kind === "paid").map((order) => order.ref);
  const refundRows = await deps.refunds.listByPayments(paidRefs);
  const refundsByPayment = new Map<string, typeof refundRows>();
  for (const refund of refundRows) {
    if (!refund.paymentRef) continue;
    const standing = refundsByPayment.get(refund.paymentRef) ?? [];
    standing.push(refund);
    refundsByPayment.set(refund.paymentRef, standing);
  }
  const giftByOrder = new Map<string, GiftRecord | null>();
  for (const order of orders) {
    giftByOrder.set(order.ref, await deps.gifts.getByOrderRef(order.ref));
  }

  // The completed-full-refund standing, read through
  // the refund processing's own trigger — the same
  // computation the surfaces read.
  const processing = createRefundProcessing({
    refunds: deps.refunds,
    claims: deps.claims,
    deliveries: deps.deliveries,
    gifts: deps.gifts,
  });
  const refundedInFull = new Set<string>();
  for (const ref of paidRefs) {
    if (await processing.completedFullRefund(ref)) refundedInFull.add(ref);
  }

  return {
    events,
    orders,
    claims,
    deliveries,
    paymentEvents,
    gifts,
    refundsByPayment,
    giftByOrder,
    refundedInFull,
    counting,
    checksByNationRung: (
      nationRungRows.rows as unknown as { nation: string | null; rung: number | null; n: number }[]
    ).map((row) => ({ nation: row.nation ?? "unknown", rung: row.rung, checks: row.n })),
    pageErrors: (errorRows.rows as unknown as { error_name: string; n: number }[]).map((row) => ({
      name: row.error_name,
      count: row.n,
    })),
  };
}

// ------------------------------------------------------------------
// The order detail and the resend (M9.10's engine)
// ------------------------------------------------------------------

function orderAdminDeps(deps: AdminDataDeps): OrderAdminDeps {
  const processing = createRefundProcessing({
    refunds: deps.refunds,
    claims: deps.claims,
    deliveries: deps.deliveries,
    gifts: deps.gifts,
  });
  return {
    orders: deps.orders,
    claims: deps.claims,
    deliveries: deps.deliveries,
    refunds: deps.refunds,
    refundCheck: processing,
    delivery: getReportDeliveryService(),
  };
}

export interface AdminOrderDetailRead {
  summary: OrderSummary;
  paymentEvents: PaymentEventRecord[];
  gift: GiftRecord | null;
}

export async function readAdminOrderDetail(
  deps: AdminDataDeps,
  ref: string,
): Promise<AdminOrderDetailRead | null> {
  const summaries = await findOrders(orderAdminDeps(deps), { ref });
  const summary = summaries[0];
  if (!summary) return null;
  const [paymentEvents, gift] = await Promise.all([
    deps.paymentEvents.listByIntent(ref),
    deps.gifts.getByOrderRef(ref),
  ]);
  return { summary, paymentEvents, gift };
}

export async function resendAdminOrder(
  deps: AdminDataDeps,
  input: { ref: string; origin: string },
): Promise<OwnerResendResult> {
  const order = await deps.orders.getByRef(input.ref);
  if (!order) return { ok: false, reason: "order-not-found" };
  // The owner is behind the Access wall; the engine's
  // requester check is met with the order's own
  // recorded email — the only address a resend may
  // ever go to, by the engine's construction.
  return ownerResendOrder(orderAdminDeps(deps), {
    ref: input.ref,
    requesterEmail: order.email,
    origin: input.origin,
  });
}
