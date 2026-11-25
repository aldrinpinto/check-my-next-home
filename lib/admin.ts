// The admin page's composition (plan step M9.11; the
// adopted ADMIN-PAGE-PLAN and Sample 36, the design
// authority). Everything the owner sees is composed
// here, in pure functions over plain data — the data
// seam (lib/server/admin-data.ts) reads the shelves,
// this module decides what the numbers ARE, and the
// page (app/admin/page.tsx) only renders. The split is
// the house pattern (the order lookup's factoring,
// M9.10): behaviour is testable without a database or
// a terminal.
//
// The rules that shape the composition, from the plan:
//   - One control bar, every panel: the period, kind
//     and test-order slice recomputes every figure.
//   - Previous period means the equal-length stretch
//     before, aligned the plan's own way: Today compares
//     with yesterday up to the same clock time; the
//     calendar presets generalise that alignment (the
//     previous window is this window shifted back by
//     its calendar span); a custom range compares with
//     the equal-length stretch immediately before it.
//   - Revenue counts PAID orders only, at the order
//     record's own amounts (M9.10's fields, as the plan
//     directs now that the record has landed) — and
//     never a fully-refunded order (BUG-349).
//   - The funnel counts journeys, not people, and says
//     so on the panel; its first five steps read the
//     journey events, which carry no kind and no test
//     flag — the plan's stated limit — while its Paid
//     and Delivered steps always re-base onto the order
//     tables (plan section 3.3; BUG-351: the events are
//     a larger set than the tables).
//   - Refunds are read from M9.8's refund record, the
//     single source; this module invents no refund
//     facts of its own.

import type { DeliveryRecord } from "./download";
import type { GiftRecord } from "./gift";
import { giftServedState } from "./gift";
import type { FulfilmentClaim } from "./server/fulfilment";
import type { OrderRecord } from "./server/orders";
import type { PaymentEventRecord } from "./server/payment-events";
import type { PaymentRefund } from "./server/refunds";
import { REPORT_PRICE_PENCE } from "./site";

// ------------------------------------------------------------------
// The slice: period, kind, test toggle
// ------------------------------------------------------------------

export type AdminRangeKey = "today" | "h24" | "d7" | "d30" | "custom";
export type AdminKindKey = "all" | "paid" | "free" | "gifted" | "free-ni";

export const ADMIN_RANGE_LABELS: Record<AdminRangeKey, string> = {
  today: "Today",
  h24: "Last 24 hours",
  d7: "Last 7 days",
  d30: "Last 30 days",
  custom: "Custom range",
};

export const ADMIN_KIND_LABELS: Record<AdminKindKey, string> = {
  all: "All kinds",
  paid: "Paid",
  free: "Free window",
  gifted: "Gifted",
  "free-ni": "Free NI",
};

// The kind an order carries, in the filter's own keys.
// The order record's kind is the fulfilment kind (paid
// / gifted / free); the filter's "Free NI" names the
// Northern Ireland free kind the nation programme
// (M14) lands — no order carries it yet, so that slice
// is honestly empty until then.
export function adminKindOf(order: OrderRecord): AdminKindKey {
  return order.kind === "paid" ? "paid" : order.kind === "gifted" ? "gifted" : "free";
}

export interface AdminPeriod {
  from: Date;
  to: Date;
  // The previous period, present only when comparison
  // is on.
  previous: { from: Date; to: Date } | null;
  compareLabel: string | null;
  // The noun the word-form deltas name ("yesterday",
  // "the previous 7 days").
  compareNoun: string;
}

const LONDON = "Europe/London";

interface LondonParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function londonParts(date: Date): LondonParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

// The instant of a London wall-clock time. London is
// UTC or UTC+1, so the offset is found by two passes:
// guess UTC, read back what London says, correct.
function londonInstant(parts: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}): Date {
  const guess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  const readback = londonParts(new Date(guess));
  const readbackUtc = Date.UTC(
    readback.year,
    readback.month - 1,
    readback.day,
    readback.hour,
    readback.minute,
    readback.second,
  );
  return new Date(guess - (readbackUtc - guess));
}

function londonMidnight(date: Date): Date {
  const parts = londonParts(date);
  return londonInstant({ year: parts.year, month: parts.month, day: parts.day });
}

function addDays(date: Date, days: number): Date {
  const parts = londonParts(date);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return londonInstant({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveAdminPeriod(input: {
  range: AdminRangeKey;
  customFrom: string | null;
  customTo: string | null;
  compare: boolean;
  now: Date;
}): AdminPeriod {
  const { now } = input;
  let from: Date;
  let to: Date = now;
  let spanMs: number;
  let compareLabel: string;
  let compareNoun: string;

  switch (input.range) {
    case "today": {
      from = londonMidnight(now);
      spanMs = DAY_MS;
      compareLabel = "Compared with yesterday";
      compareNoun = "yesterday";
      break;
    }
    case "h24": {
      from = new Date(now.getTime() - DAY_MS);
      spanMs = DAY_MS;
      compareLabel = "Compared with the previous 24 hours";
      compareNoun = "the previous 24 hours";
      break;
    }
    case "d7": {
      from = addDays(londonMidnight(now), -6);
      spanMs = 7 * DAY_MS;
      compareLabel = "Compared with the previous 7 days";
      compareNoun = "the previous 7 days";
      break;
    }
    case "d30": {
      from = addDays(londonMidnight(now), -29);
      spanMs = 30 * DAY_MS;
      compareLabel = "Compared with the previous 30 days";
      compareNoun = "the previous 30 days";
      break;
    }
    case "custom": {
      const fromParts = parseDateInput(input.customFrom);
      const toParts = parseDateInput(input.customTo);
      if (fromParts && toParts) {
        from = londonInstant(fromParts);
        // The end date is inclusive: the window closes
        // at the midnight that ends it.
        const end = londonInstant(toParts);
        to = addDays(end, 1);
        spanMs = to.getTime() - from.getTime();
        const days = Math.round(spanMs / DAY_MS);
        compareLabel =
          days === 1 ? "Compared with the previous day" : `Compared with the previous ${days} days`;
        compareNoun = days === 1 ? "the previous day" : `the previous ${days} days`;
      } else {
        // An incomplete custom range reads as the
        // sample's default slice.
        from = addDays(londonMidnight(now), -6);
        spanMs = 7 * DAY_MS;
        compareLabel = "Compared with the previous 7 days";
        compareNoun = "the previous 7 days";
      }
      break;
    }
  }

  const previous = input.compare
    ? { from: new Date(from.getTime() - spanMs), to: new Date(to.getTime() - spanMs) }
    : null;
  return { from, to, previous, compareLabel: input.compare ? compareLabel : null, compareNoun };
}

function parseDateInput(value: string | null): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

// The caption under the control bar (Sample 36's form):
// it always states what is being shown.
export function adminCaption(input: {
  range: AdminRangeKey;
  kind: AdminKindKey;
  testExcluded: boolean;
  period: AdminPeriod;
}): string {
  const parts = [
    `Showing: ${ADMIN_RANGE_LABELS[input.range]}`,
    `Kind: ${ADMIN_KIND_LABELS[input.kind]}`,
    `Test orders ${input.testExcluded ? "excluded" : "included"}`,
  ];
  if (input.period.compareLabel) parts.push(input.period.compareLabel);
  return parts.join(" · ");
}

// ------------------------------------------------------------------
// Formatting (Sample 36's forms)
// ------------------------------------------------------------------

export function formatCount(n: number): string {
  return n.toLocaleString("en-GB");
}

export function formatMoney(minor: number, currency: string | null): string {
  const major = minor / 100;
  const body = major.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency && currency.toLowerCase() !== "gbp"
    ? `${currency.toUpperCase()} ${body}`
    : `£${body}`;
}

export function formatPercent(value: number): string {
  if (value === 0) return "0%";
  return `${value.toFixed(1)}%`;
}

// "Today 09:12", "Yesterday 21:44", "Mon 09:48" — the
// sample's time forms, in London time; older than a
// week, the date names itself.
export function adminTimeLabel(date: Date, now: Date): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  const day = londonMidnight(date).getTime();
  const today = londonMidnight(now).getTime();
  if (day === today) return `Today ${time}`;
  if (day === addDays(new Date(today), -1).getTime()) return `Yesterday ${time}`;
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, weekday: "short" }).format(
    date,
  );
  if (today - day < 7 * DAY_MS) return `${weekday} ${time}`;
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    day: "numeric",
    month: "short",
  }).format(date);
  return `${dateLabel} ${time}`;
}

export function adminClock(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

// ------------------------------------------------------------------
// Deltas
// ------------------------------------------------------------------

export interface AdminDelta {
  text: string;
  tone: "good" | "bad";
}

// A count's change against the previous period, in the
// sample's forms: a percentage with an arrow where the
// base supports one, the word form ("1 fewer than
// yesterday") where the numbers are small or the base
// is zero. `downIsGood` is the failed-payments card's
// direction; every other card reads up as good.
export function countDelta(input: {
  current: number;
  previous: number | null;
  compareNoun: string;
  downIsGood?: boolean;
}): AdminDelta | null {
  const { current, previous } = input;
  if (previous === null) return null;
  const good = input.downIsGood ? current <= previous : current >= previous;
  const tone = good ? "good" : "bad";
  if (current === previous) return { text: `The same as ${input.compareNoun}`, tone: "good" };
  if (previous === 0) {
    return {
      text: `${formatCount(current)} more than ${input.compareNoun}`,
      tone,
    };
  }
  if (current < 10 && previous < 10) {
    const diff = Math.abs(current - previous);
    return {
      text:
        current > previous
          ? `${diff} more than ${input.compareNoun}`
          : `${diff} fewer than ${input.compareNoun}`,
      tone,
    };
  }
  const pct = ((current - previous) / previous) * 100;
  const arrow = pct >= 0 ? "▲" : "▼";
  return { text: `${arrow}${Math.abs(pct).toFixed(1)}%`, tone };
}

// A rate's change, in points (the conversion card).
export function pointsDelta(input: {
  current: number;
  previous: number | null;
}): AdminDelta | null {
  if (input.previous === null) return null;
  const diff = input.current - input.previous;
  if (Math.abs(diff) < 0.05) return { text: "No change", tone: "good" };
  return {
    text: `${diff > 0 ? "▲" : "▼"}${Math.abs(diff).toFixed(1)} pts`,
    tone: diff > 0 ? "good" : "bad",
  };
}

// ------------------------------------------------------------------
// The data the seam reads (plain shapes; the seam maps
// its rows onto these)
// ------------------------------------------------------------------

export interface AdminEventCounts {
  pageViews: number;
  reportPageViews: number;
  checkStarted: number;
  checkCompleted: number;
  checkoutStarted: number;
  checkoutPaid: number;
  reportDelivered: number;
  failedSearches: number;
}

// A search type, as the demand panel names it. Defined
// here (not imported from lib/server/search-counting.ts)
// because that module imports AdminCounting from this
// one — an import the other way would be a type cycle.
export type AdminPurchaseType = "postcode" | "street" | "wider-area";

// One page error in the period: its count, plus the
// route and time of its latest occurrence (BUG-356),
// so the panel can say where it happened instead of
// pointing at an unwired Sentry.
export interface AdminPageError {
  name: string;
  count: number;
  route: string | null;
  lastAt: Date | null;
}

export interface AdminSlice {
  events: AdminEventCounts;
  // Every order standing in the period, unsliced — the
  // composition applies the kind and test filters, so
  // one read feeds every panel (the plan's one query
  // set per load).
  orders: OrderRecord[];
  claims: FulfilmentClaim[];
  deliveries: DeliveryRecord[];
  paymentEvents: PaymentEventRecord[];
  // Gifts issued in the period.
  gifts: GiftRecord[];
  // The refund record, by payment reference (M9.8's
  // overlay — the single source for refund facts).
  refundsByPayment: Map<string, PaymentRefund[]>;
  // The orders a completed FULL refund stands for,
  // read through the refund processing's own trigger
  // (the seam computes it; the composition trusts it).
  refundedInFull: Set<string>;
  // Each order's gift, where one stands.
  giftByOrder: Map<string, GiftRecord | null>;
  // Each paid order's search type, read from the
  // purchase rows in search_counts (BUG-352): the
  // counting shelf's bought figures carry historical
  // rows flagged before BUG-290's livemode rule, so
  // the demand panel derives bought from the order
  // tables through this map instead.
  purchaseTypeByOrder: Map<string, AdminPurchaseType>;
  // Each gift's source order test standing, for gifts
  // whose order stands outside the period (BUG-353):
  // the orphan branch of adminGiftCounts reads this
  // map so the toggle applies there too.
  giftTestByToken: Map<string, boolean>;
  // The search counting (migration 0044), read for the
  // same window.
  counting: AdminCounting;
  // Check completions split by nation and rung (the
  // plan's demand split, from the journey events).
  checksByNationRung: { nation: string; rung: number | null; checks: number }[];
  // Page errors in the period, by error name — each
  // with the route and time of its latest occurrence
  // (BUG-356), so the panel can say where it happened
  // instead of pointing at an unwired Sentry.
  pageErrors: AdminPageError[];
}

export interface AdminCounting {
  checksByPostcode: { postcode: string; checks: number }[];
  checksByStreet: { label: string; checks: number }[];
  checksByType: Record<"postcode" | "street" | "wider-area", number>;
  // The shelf's bought figures are NOT the demand
  // panel's source (BUG-352): historical purchase rows
  // were flagged before BUG-290's livemode rule, so
  // the "How people searched" bought column derives
  // from the order tables (purchaseTypeByOrder) instead.
  // The shelf still returns them, and
  // tests/search-counting.test.ts pins them.
  purchasesByType: Record<"postcode" | "street" | "wider-area", number>;
  purchasesByTypeTest: Record<"postcode" | "street" | "wider-area", number>;
}

export const EMPTY_COUNTING: AdminCounting = {
  checksByPostcode: [],
  checksByStreet: [],
  checksByType: { postcode: 0, street: 0, "wider-area": 0 },
  purchasesByType: { postcode: 0, street: 0, "wider-area": 0 },
  purchasesByTypeTest: { postcode: 0, street: 0, "wider-area": 0 },
};

// Join error counts to their latest occurrences (the
// seam's second page_error read). A count with no
// latest occurrence reads nulls, never a guess.
export function attachPageErrorDetail(
  counts: { name: string; count: number }[],
  latestByName: Map<string, { route: string | null; lastAt: Date | null }>,
): AdminPageError[] {
  return counts.map((error) => {
    const latest = latestByName.get(error.name);
    return {
      name: error.name,
      count: error.count,
      route: latest?.route ?? null,
      lastAt: latest?.lastAt ?? null,
    };
  });
}

export interface AdminSliceInput {
  range: AdminRangeKey;
  kind: AdminKindKey;
  testExcluded: boolean;
}

// Does an order stand inside the slice?
export function orderInSlice(order: OrderRecord, input: AdminSliceInput): boolean {
  if (input.testExcluded && order.testOrder) return false;
  if (input.kind !== "all" && adminKindOf(order) !== input.kind) return false;
  return true;
}

function claimInSlice(
  claim: FulfilmentClaim,
  ordersByRef: Map<string, OrderRecord>,
  input: AdminSliceInput,
): boolean {
  if (input.testExcluded && claim.testOrder) return false;
  if (input.kind !== "all") {
    const order = ordersByRef.get(claim.ref);
    const kind = order ? adminKindOf(order) : claim.kind;
    if (kind !== input.kind) return false;
  }
  return true;
}

// A delivery's slice standing: its kind names itself;
// its test standing rides on its order (a delivery the
// books cannot tie to an order counts as a real one).
// A withdrawn delivery never stands (BUG-349): the
// refund withdrew it, so it is not a delivery the
// owner still holds.
function deliveryInSlice(
  delivery: DeliveryRecord,
  ordersByRef: Map<string, OrderRecord>,
  input: AdminSliceInput,
): boolean {
  if (delivery.withdrawnAt !== null) return false;
  if (input.kind !== "all" && delivery.kind !== input.kind) return false;
  if (input.testExcluded && delivery.orderRef) {
    const order = ordersByRef.get(delivery.orderRef);
    if (order?.testOrder) return false;
  }
  return true;
}

// How many of the slice's orders stand delivered: the
// order tables are the one reading for the glance
// "Reports delivered" card and the funnel's Delivered
// step (BUG-351). Delivery records cannot be the
// reading — they include deliveries whose orders
// predate the window (and so carry no test standing
// the slice can see), and the journey events are a
// larger set than the order tables. A refunded order
// reads "refunded", never "delivered", so this also
// carries BUG-349's withdrawn-delivery half for both
// figures.
function deliveredOrdersInSlice(data: AdminSlice, slice: AdminSliceInput): number {
  const claimsByRef = new Map(data.claims.map((claim) => [claim.ref, claim]));
  return data.orders.filter((order) => {
    if (!orderInSlice(order, slice)) return false;
    const claim = claimsByRef.get(order.ref) ?? null;
    return (
      orderStatusOf({
        order,
        claim,
        refundedInFull: data.refundedInFull.has(order.ref),
      }) === "delivered"
    );
  }).length;
}

// ------------------------------------------------------------------
// At a glance
// ------------------------------------------------------------------

export interface AdminGlanceCard {
  label: string;
  value: string;
  delta: AdminDelta | null;
}

export function adminGlance(input: {
  current: AdminSlice;
  previous: AdminSlice | null;
  slice: AdminSliceInput;
  compareNoun: string;
}): AdminGlanceCard[] {
  const { current, previous, slice } = input;
  const curOrders = current.orders.filter((order) => orderInSlice(order, slice));
  const prevOrders = previous
    ? previous.orders.filter((order) => orderInSlice(order, slice))
    : null;

  const checks = current.events.checkCompleted;
  const prevChecks = previous ? previous.events.checkCompleted : null;

  const delivered = deliveredOrdersInSlice(current, slice);
  const prevDelivered = previous ? deliveredOrdersInSlice(previous, slice) : null;

  // Revenue counts PAID orders only, at the order
  // record's own amounts — and never a fully-refunded
  // order (BUG-349): the money went back, so it is
  // not revenue the owner still holds.
  const revenueOf = (orders: OrderRecord[], refunded: Set<string>) =>
    orders
      .filter((order) => order.kind === "paid" && !refunded.has(order.ref))
      .reduce((sum, order) => sum + (order.amount ?? 0), 0);
  const revenue = revenueOf(curOrders, current.refundedInFull);
  const prevRevenue =
    previous && prevOrders ? revenueOf(prevOrders, previous.refundedInFull) : null;

  // Conversion: paid completions over completed checks.
  // The numerator is the funnel's Paid step, read the
  // same way it is read there (adminPaidCount). A kind
  // with no payment step (gifted, free) has no
  // conversion to show.
  const paidCount =
    slice.kind === "gifted" || slice.kind === "free" || slice.kind === "free-ni"
      ? null
      : adminPaidCount(current, slice);
  const prevPaidCount =
    previous === null || paidCount === null ? null : adminPaidCount(previous, slice);
  const conversion = paidCount === null || checks === 0 ? null : (paidCount / checks) * 100;
  const prevConversion =
    prevPaidCount === null || prevChecks === null || prevChecks === 0
      ? null
      : (prevPaidCount / prevChecks) * 100;

  const failed = failedPayments(current, slice).length;
  const prevFailed = previous ? failedPayments(previous, slice).length : null;

  return [
    {
      label: "Checks completed",
      value: formatCount(checks),
      delta: countDelta({ current: checks, previous: prevChecks, compareNoun: input.compareNoun }),
    },
    {
      label: "Reports delivered",
      value: formatCount(delivered),
      delta: countDelta({
        current: delivered,
        previous: prevDelivered,
        compareNoun: input.compareNoun,
      }),
    },
    {
      label: "Revenue",
      value: formatMoney(revenue, "gbp"),
      delta: countDelta({
        current: revenue,
        previous: prevRevenue,
        compareNoun: input.compareNoun,
      }),
    },
    {
      label: "Check → paid conversion",
      value: conversion === null ? "—" : formatPercent(conversion),
      delta: pointsDelta({ current: conversion ?? 0, previous: prevConversion }),
    },
    {
      label: "Failed payments",
      value: formatCount(failed),
      delta: countDelta({
        current: failed,
        previous: prevFailed,
        compareNoun: input.compareNoun,
        downIsGood: true,
      }),
    },
  ];
}

// The period's failed payments: a payment the provider
// reported failed, which no claim ever stood for (a
// payment that later succeeded is a recovered payment,
// not a failed one), one per payment however many
// failure notices arrived. The latest failure notice
// is the row's fact.
export interface FailedPayment {
  intentId: string;
  email: string | null;
  postcode: string | null;
  homeKey: string | null;
  testOrder: boolean;
  reason: string | null;
  at: Date;
}

export function failedPayments(sliceData: AdminSlice, slice: AdminSliceInput): FailedPayment[] {
  const claimed = new Set(sliceData.claims.map((claim) => claim.ref));
  const succeeded = new Set(
    sliceData.paymentEvents
      .filter((event) => event.eventType === "payment_intent.succeeded" && event.intentId)
      .map((event) => event.intentId as string),
  );
  const latest = new Map<string, PaymentEventRecord>();
  for (const event of sliceData.paymentEvents) {
    if (event.eventType !== "payment_intent.payment_failed" || !event.intentId) continue;
    if (slice.testExcluded && event.testOrder) continue;
    if (claimed.has(event.intentId) || succeeded.has(event.intentId)) continue;
    const standing = latest.get(event.intentId);
    if (!standing || event.receivedAt > standing.receivedAt) latest.set(event.intentId, event);
  }
  return [...latest.values()]
    .map((event) => ({
      intentId: event.intentId as string,
      email: event.email,
      postcode: event.postcode,
      homeKey: event.homeKey,
      testOrder: event.testOrder,
      reason: event.failureReason,
      at: event.receivedAt,
    }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

// ------------------------------------------------------------------
// The funnel
// ------------------------------------------------------------------

export interface AdminFunnelStep {
  label: string;
  count: number;
}

export interface AdminFunnel {
  steps: AdminFunnelStep[];
  // The deliveries that skip the payment steps (the
  // sample's line under the funnel), or null where the
  // slice leaves none to explain.
  extraLine: string | null;
}

// The funnel's Paid step, and the conversion card's
// numerator — one reading, shared. Paid always
// re-bases onto the claims table, the only shelf that
// knows an order's kind and test standing (plan
// section 3.3): the checkout_paid events are a larger
// set than the paid claims, so reading them inflates
// Paid whenever test orders are included (BUG-351).
export function adminPaidCount(data: AdminSlice, slice: AdminSliceInput): number {
  const ordersByRef = new Map(data.orders.map((order) => [order.ref, order]));
  return data.claims.filter(
    (claim) => claim.kind === "paid" && claimInSlice(claim, ordersByRef, slice),
  ).length;
}

const FUNNEL_LABELS = [
  "Viewed",
  "Check started",
  "Check completed",
  "Payment page viewed",
  "Checkout started",
  "Paid",
  "Delivered",
];

export function adminFunnel(input: { current: AdminSlice; slice: AdminSliceInput }): AdminFunnel {
  const { current, slice } = input;
  const ordersByRef = new Map(current.orders.map((order) => [order.ref, order]));
  const events = current.events;

  // The first five steps read the journey events (the
  // plan's stated limit — the events carry neither a
  // kind nor a test flag). The last two always re-base
  // onto the order tables (plan section 3.3): Paid
  // onto the paid claims, Delivered onto the delivered
  // orders — the events are a larger set than either
  // table (BUG-351). A kind with no payment step has
  // no Paid to show.
  const paid =
    slice.kind === "gifted" || slice.kind === "free" || slice.kind === "free-ni"
      ? 0
      : adminPaidCount(current, slice);
  const delivered = deliveredOrdersInSlice(current, slice);

  const counts = [
    events.pageViews,
    events.checkStarted,
    events.checkCompleted,
    events.reportPageViews,
    events.checkoutStarted,
    paid,
    delivered,
  ];

  let extraLine: string | null = null;
  if (slice.kind === "all") {
    const freeCount = current.deliveries.filter(
      (delivery) => delivery.kind === "free" && deliveryInSlice(delivery, ordersByRef, slice),
    ).length;
    const giftedCount = current.deliveries.filter(
      (delivery) => delivery.kind === "gifted" && deliveryInSlice(delivery, ordersByRef, slice),
    ).length;
    const total = freeCount + giftedCount;
    if (total === 1) {
      extraLine = `Plus 1 ${freeCount === 1 ? "free-window" : "gifted"} delivery that skipped the payment steps.`;
    } else if (total > 1) {
      const parts: string[] = [];
      if (freeCount > 0) parts.push(`${freeCount} free-window`);
      if (giftedCount > 0) parts.push(`${giftedCount} gifted`);
      extraLine = `Plus ${total} deliveries that skip the payment steps: ${parts.join(" and ")}.`;
    }
  }

  return {
    steps: FUNNEL_LABELS.map((label, index) => ({ label, count: counts[index] })),
    extraLine,
  };
}

// The drop-off between a step and the one before it,
// in the sample's form ("−5.0%", "—" for the first).
export function funnelDrop(current: number, previous: number): string {
  if (previous <= 0) return "—";
  if (current >= previous) return "0.0%";
  return `−${(((previous - current) / previous) * 100).toFixed(1)}%`;
}

// ------------------------------------------------------------------
// Orders
// ------------------------------------------------------------------

export type AdminOrderStatusKey =
  "delivered" | "payment-failed" | "delivery-failed" | "refunded" | "email-not-sent" | "preparing";

export const ADMIN_STATUS_LABELS: Record<AdminOrderStatusKey, string> = {
  delivered: "Delivered",
  "payment-failed": "Payment failed",
  "delivery-failed": "Delivery failed",
  refunded: "Refunded",
  "email-not-sent": "Paid — email not sent",
  preparing: "Preparing",
};

// The one status list the filter offers (BUG-350):
// the page and the component both read this, so a
// status can never again exist in the table without
// appearing in the filter. Every key of
// ADMIN_STATUS_LABELS, in table order.
export const ADMIN_STATUS_FILTER_KEYS: AdminOrderStatusKey[] = [
  "delivered",
  "payment-failed",
  "delivery-failed",
  "refunded",
  "email-not-sent",
  "preparing",
];

export const ADMIN_STATUS_TONES: Record<AdminOrderStatusKey, "green" | "red" | "amber" | "grey"> = {
  delivered: "green",
  "payment-failed": "red",
  "delivery-failed": "red",
  refunded: "grey",
  "email-not-sent": "amber",
  preparing: "grey",
};

export interface AdminOrderRow {
  // The order's reference (the claim's key); a failed
  // payment's row carries its payment reference.
  ref: string;
  at: Date;
  // "CM3 2JT — 19 Birkdale Rise, Hatfield Peverel": the
  // postcode, then the delivery record's address line
  // where one stands.
  homeLabel: string;
  email: string;
  kindLabel: string;
  amountLabel: string;
  statusKey: AdminOrderStatusKey;
  statusLabel: string;
  deliveredLabel: string;
  giftLabel: string;
  testOrder: boolean;
  // Whether this row is a real order (its detail and
  // resend exist) or a failed payment standing in the
  // table (no order was ever taken for it).
  isOrder: boolean;
}

export function orderStatusOf(input: {
  order: OrderRecord;
  claim: FulfilmentClaim | null;
  refundedInFull: boolean;
}): AdminOrderStatusKey {
  const { order, claim, refundedInFull } = input;
  if (refundedInFull) return "refunded";
  if (!claim) return "preparing";
  if (claim.status === "failed") return "delivery-failed";
  if (claim.status === "refunded") return "refunded";
  if (claim.status === "fulfilled") {
    return claim.mailSent === false ? "email-not-sent" : "delivered";
  }
  return "preparing";
}

export function giftLabelOf(input: {
  order: OrderRecord;
  gift: GiftRecord | null;
  refundGiftConsequence: string | null;
  delivered: boolean;
  now: Date;
}): string {
  const { order, gift, refundGiftConsequence, delivered, now } = input;
  if (order.kind === "gifted") {
    return delivered ? "This report is a redeemed gift" : "Gift claimed for this report";
  }
  if (order.kind === "free") return "No gift (free reports carry none)";
  if (refundGiftConsequence === "voided" || refundGiftConsequence === "voided-claimed") {
    return "Gift voided by the refund";
  }
  if (!gift) return "—";
  const state = giftServedState(gift, now);
  if (state === "already-used") return "Gift redeemed";
  if (state === "voided") return "Gift voided by the refund";
  if (state === "expired") return "Gift expired";
  if (state === "claimed-guard") return "Gift claimed";
  return "Gift issued";
}

// An address line with its trailing postcode removed
// (the delivery record's line carries it; the orders
// table leads with the postcode itself).
export function addressLineWithoutPostcode(line: string, postcode: string): string {
  const trimmed = line.trim();
  const wanted = postcode.trim().toUpperCase();
  if (trimmed.toUpperCase().endsWith(wanted)) {
    return trimmed.slice(0, trimmed.length - wanted.length).replace(/[,\s]+$/, "");
  }
  return trimmed;
}

// The home label from a home key, for a failed payment
// (no delivery record exists to name the home): the
// key's own parts, in display form — the street part
// of "19||BIRKDALE RISE", the whole of a flat key.
export function homeLabelFromKey(homeKey: string | null): string | null {
  if (!homeKey) return null;
  const parts = homeKey
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  const titled = parts.map((part) =>
    part
      .toLowerCase()
      .replace(
        /(^|\s|-)(\p{L})/gu,
        (_m, lead: string, letter: string) => lead + letter.toUpperCase(),
      ),
  );
  return titled.join(", ");
}

export function adminOrderRows(input: {
  data: AdminSlice;
  slice: AdminSliceInput;
  status: AdminOrderStatusKey | "all";
  search: string;
  now: Date;
}): AdminOrderRow[] {
  const { data, slice, now } = input;
  const claimsByRef = new Map(data.claims.map((claim) => [claim.ref, claim]));
  const deliveriesByOrder = new Map<string, DeliveryRecord>();
  for (const delivery of data.deliveries) {
    if (delivery.orderRef && !deliveriesByOrder.has(delivery.orderRef)) {
      deliveriesByOrder.set(delivery.orderRef, delivery);
    }
  }
  const query = input.search.trim().toLowerCase();

  const rows: AdminOrderRow[] = [];
  for (const order of data.orders) {
    if (!orderInSlice(order, slice)) continue;
    const claim = claimsByRef.get(order.ref) ?? null;
    const refunds = data.refundsByPayment.get(order.ref) ?? [];
    const refundedInFull = data.refundedInFull.has(order.ref);
    const statusKey = orderStatusOf({ order, claim, refundedInFull });
    const delivery = deliveriesByOrder.get(order.ref) ?? null;
    const gift = data.giftByOrder.get(order.ref) ?? null;
    const refundGiftConsequence =
      refunds.find((refund) => refund.giftConsequence)?.giftConsequence ?? null;
    // The delivery's address line ends with the
    // postcode itself; the sample's cell leads with the
    // postcode, so the line's own copy comes off.
    const homeLabel = delivery
      ? `${order.postcode} — ${addressLineWithoutPostcode(delivery.homeAddressLine, order.postcode)}`
      : order.postcode;
    const row: AdminOrderRow = {
      ref: order.ref,
      at: order.createdAt,
      homeLabel,
      email: order.email,
      kindLabel: ADMIN_KIND_LABELS[adminKindOf(order)],
      amountLabel: order.kind === "paid" ? formatMoney(order.amount ?? 0, order.currency) : "£0.00",
      statusKey,
      statusLabel:
        statusKey === "email-not-sent" && order.kind !== "paid"
          ? "Email not sent"
          : ADMIN_STATUS_LABELS[statusKey],
      deliveredLabel:
        statusKey === "payment-failed"
          ? "—"
          : claim?.status === "fulfilled"
            ? claim.mailSent === false
              ? "No"
              : "Yes"
            : claim?.status === "failed"
              ? "No"
              : "—",
      giftLabel: giftLabelOf({
        order,
        gift,
        refundGiftConsequence,
        delivered: claim?.status === "fulfilled",
        now,
      }),
      testOrder: order.testOrder,
      isOrder: true,
    };
    rows.push(row);
  }

  // Failed payments stand in the table as their own
  // rows (Sample 36 draws them there): no order was
  // ever taken for them, so they carry no detail and
  // no resend.
  if (slice.kind === "all" || slice.kind === "paid") {
    for (const failure of failedPayments(data, slice)) {
      const home = homeLabelFromKey(failure.homeKey);
      rows.push({
        ref: failure.intentId,
        at: failure.at,
        homeLabel: failure.postcode
          ? home
            ? `${failure.postcode} — ${home}`
            : failure.postcode
          : "—",
        email: failure.email ?? "—",
        kindLabel: "Paid",
        amountLabel: formatMoney(REPORT_PRICE_PENCE, "gbp"),
        statusKey: "payment-failed",
        statusLabel: "Payment failed",
        deliveredLabel: "—",
        giftLabel: "—",
        testOrder: failure.testOrder,
        isOrder: false,
      });
    }
  }

  return (
    rows
      .filter((row) => input.status === "all" || row.statusKey === input.status)
      .filter(
        (row) =>
          query.length === 0 ||
          row.homeLabel.toLowerCase().includes(query) ||
          row.email.toLowerCase().includes(query),
      )
      // Newest first; same-second rows fall back to the
      // reference, so the page order is deterministic
      // between loads (BUG-354: the sort alone let ties
      // shuffle with the database's own order).
      .sort((a, b) => b.at.getTime() - a.at.getTime() || b.ref.localeCompare(a.ref))
  );
}

// ------------------------------------------------------------------
// Where people are looking
// ------------------------------------------------------------------

export interface AdminDemand {
  postcodes: { postcode: string; checks: number; bought: number; conversion: string }[];
  streets: { label: string; checks: number }[];
  searchTypes: { label: string; searches: number; bought: number; conversion: string }[];
  nationRungs: { label: string; checks: number }[];
  failedSearches: number;
}

const SEARCH_TYPE_ROWS: { key: "postcode" | "street" | "wider-area"; label: string }[] = [
  { key: "postcode", label: "Postcode search" },
  { key: "street", label: "Street search" },
  { key: "wider-area", label: "Wider-area search" },
];

const NATION_LABELS: Record<string, string> = {
  england: "England",
  wales: "Wales",
  scotland: "Scotland",
  "northern-ireland": "Northern Ireland",
  unknown: "Unknown",
};

const RUNG_LABELS: Record<number, string> = {
  1: "Exact home",
  2: "Whole postcode",
  3: "Wider area",
  4: "No location",
};

export function adminDemand(input: { data: AdminSlice; slice: AdminSliceInput }): AdminDemand {
  const { data, slice } = input;
  const boughtByPostcode = new Map<string, number>();
  for (const order of data.orders) {
    if (order.kind !== "paid") continue;
    if (!orderInSlice(order, slice)) continue;
    const key = order.postcode.trim().toUpperCase();
    boughtByPostcode.set(key, (boughtByPostcode.get(key) ?? 0) + 1);
  }
  const postcodes = data.counting.checksByPostcode.slice(0, 5).map((row) => {
    const bought = boughtByPostcode.get(row.postcode.trim().toUpperCase()) ?? 0;
    return {
      postcode: row.postcode,
      checks: row.checks,
      bought,
      conversion: row.checks === 0 ? "0%" : formatPercent((bought / row.checks) * 100),
    };
  });
  // Bought by search type reads the order tables, never
  // the counting shelf (BUG-352): the shelf's purchase
  // counters carry historical rows flagged before
  // BUG-290's livemode rule, so its bought figures
  // cannot be trusted. Each paid order in the slice
  // contributes one purchase under the search type its
  // own purchase row carries; an order with no purchase
  // row counts under no type — the bought total can
  // sit below the paid orders, by design, and is never
  // topped up from the shelf.
  const purchases: Record<"postcode" | "street" | "wider-area", number> = {
    postcode: 0,
    street: 0,
    "wider-area": 0,
  };
  for (const order of data.orders) {
    if (order.kind !== "paid") continue;
    if (!orderInSlice(order, slice)) continue;
    const type = data.purchaseTypeByOrder.get(order.ref);
    if (type) purchases[type] += 1;
  }
  const searchTypes = SEARCH_TYPE_ROWS.map((row) => {
    const searches = data.counting.checksByType[row.key];
    const bought = purchases[row.key];
    return {
      label: row.label,
      searches,
      bought,
      conversion: searches === 0 ? "0%" : formatPercent((bought / searches) * 100),
    };
  });
  const nationRungs = data.checksByNationRung
    .filter((row) => row.checks > 0)
    .map((row) => ({
      label: `${NATION_LABELS[row.nation] ?? row.nation} · ${row.rung !== null ? (RUNG_LABELS[row.rung] ?? `Rung ${row.rung}`) : "Rung not recorded"}`,
      checks: row.checks,
    }))
    .sort((a, b) => b.checks - a.checks);
  return {
    postcodes,
    streets: data.counting.checksByStreet.slice(0, 5),
    searchTypes,
    nationRungs,
    failedSearches: data.events.failedSearches,
  };
}

// ------------------------------------------------------------------
// Needs a human
// ------------------------------------------------------------------

export interface AdminHumanItem {
  statusKey: AdminOrderStatusKey;
  statusLabel: string;
  meta: string;
  reason: string;
  at: Date;
}

// A claim still standing "claimed" past this age is
// stuck: the worker's attempts run minutes apart, so
// an hour at claimed means nobody is coming for it
// without help.
export const STUCK_CLAIM_AGE_MS = 60 * 60 * 1000;

export function adminNeedsHuman(input: {
  data: AdminSlice;
  slice: AdminSliceInput;
  now: Date;
}): AdminHumanItem[] {
  const { data, slice, now } = input;
  const ordersByRef = new Map(data.orders.map((order) => [order.ref, order]));
  const items: AdminHumanItem[] = [];

  for (const failure of failedPayments(data, slice)) {
    items.push({
      statusKey: "payment-failed",
      statusLabel: "Payment failed",
      meta: `${adminTimeLabel(failure.at, now)} · ${failure.postcode ?? "—"} · ${failure.email ?? "—"}`,
      reason: failure.reason
        ? `${failure.reason} No money was taken.`
        : "The payment failed. No money was taken.",
      at: failure.at,
    });
  }

  for (const claim of data.claims) {
    if (!claimInSlice(claim, ordersByRef, slice)) continue;
    const order = ordersByRef.get(claim.ref);
    const where = `${order?.postcode ?? claim.postcode} · ${claim.email}`;
    if (claim.status === "failed") {
      items.push({
        statusKey: "delivery-failed",
        statusLabel: "Delivery failed",
        meta: `${adminTimeLabel(claim.claimedAt, now)} · ${where}`,
        reason: claim.lastError
          ? `Payment taken, but the report could not be delivered: ${claim.lastError}`
          : "Payment taken, but the report could not be delivered.",
        at: claim.claimedAt,
      });
    } else if (claim.status === "fulfilled" && claim.mailSent === false) {
      items.push({
        statusKey: "email-not-sent",
        statusLabel: "Email not sent",
        meta: `${adminTimeLabel(claim.claimedAt, now)} · ${where}`,
        reason:
          "Payment taken and the report is ready, but the delivery email has not gone out yet.",
        at: claim.claimedAt,
      });
    } else if (
      claim.status === "claimed" &&
      now.getTime() - claim.claimedAt.getTime() > STUCK_CLAIM_AGE_MS
    ) {
      items.push({
        statusKey: "preparing",
        statusLabel: "Stuck — still preparing",
        meta: `${adminTimeLabel(claim.claimedAt, now)} · ${where}`,
        reason: `This order has been waiting to be made for over an hour, across ${claim.attempts} ${claim.attempts === 1 ? "attempt" : "attempts"}.`,
        at: claim.claimedAt,
      });
    }
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

// ------------------------------------------------------------------
// Gifts
// ------------------------------------------------------------------

export interface AdminGiftCounts {
  issued: number;
  claimed: number;
  redeemed: number;
  expired: number;
}

export function adminGiftCounts(input: {
  data: AdminSlice;
  slice: AdminSliceInput;
  now: Date;
}): AdminGiftCounts {
  const { data, slice, now } = input;
  const ordersByRef = new Map(data.orders.map((order) => [order.ref, order]));
  const counts: AdminGiftCounts = { issued: 0, claimed: 0, redeemed: 0, expired: 0 };
  for (const gift of data.gifts) {
    // The gift's slice standing rides on its issuing
    // order, where the books carry one; a gift no order
    // in the period names (an older or seeded row)
    // counts under the all-kinds and paid slices only —
    // gifts are a paid order's creature — and, while
    // test orders are excluded, only where its source
    // order is not a test order (BUG-353: the toggle
    // applies to the orphan branch too, through
    // giftTestByToken; a gift whose source cannot be
    // resolved reads as real, per the BUG-290 rule).
    const order = gift.orderRef ? ordersByRef.get(gift.orderRef) : undefined;
    if (order) {
      if (!orderInSlice(order, slice)) continue;
    } else {
      if (slice.kind !== "all" && slice.kind !== "paid") continue;
      if (slice.testExcluded && (data.giftTestByToken.get(gift.token) ?? false)) continue;
    }
    if (gift.status === "voided") continue;
    const state = giftServedState(gift, now);
    if (gift.status === "redeemed") counts.redeemed += 1;
    else if (state === "expired") counts.expired += 1;
    else if (gift.status === "claimed") counts.claimed += 1;
    else counts.issued += 1;
  }
  return counts;
}

// ------------------------------------------------------------------
// The order detail (plan panel (d): a row opens its
// full read-only history)
// ------------------------------------------------------------------

export interface AdminDetailLine {
  label: string;
  value: string;
}

export interface AdminOrderDetail {
  ref: string;
  heading: string;
  statusLabel: string;
  facts: AdminDetailLine[];
  refunds: {
    heading: string;
    lines: AdminDetailLine[];
  }[];
  paymentEvents: AdminDetailLine[];
  claimLines: AdminDetailLine[];
  deliveryLines: AdminDetailLine[];
  giftLines: AdminDetailLine[];
  logLines: AdminDetailLine[];
  // The resend control stands only where a delivery
  // stands to be re-sent; the engine refuses the rest
  // itself, and the panel says why in plain words.
  resend: { available: boolean; note: string | null };
}

const GIFT_CONSEQUENCE_LINES: Record<string, string> = {
  voided: "The gift was voided before it was claimed.",
  "voided-claimed": "The gift had been claimed, and was voided.",
  "redeemed-stood": "The gift had already been redeemed, so that report stands.",
  none: "No gift was affected.",
};

const LOG_KIND_LABELS: Record<string, string> = {
  delivery: "Delivery email",
  "buyer-resend": "Buyer re-send",
  "owner-resend": "Owner re-send",
};

function whenLabel(date: Date | null, now: Date): string {
  return date ? adminTimeLabel(date, now) : "—";
}

export function adminOrderDetail(input: {
  order: OrderRecord;
  claim: FulfilmentClaim | null;
  deliveries: DeliveryRecord[];
  refunds: PaymentRefund[];
  refundedInFull: boolean;
  gift: GiftRecord | null;
  paymentEvents: PaymentEventRecord[];
  log: { kind: string; sent: boolean; detail: string | null; createdAt: Date }[];
  now: Date;
}): AdminOrderDetail {
  const { order, claim, now } = input;
  const statusKey = orderStatusOf({ order, claim, refundedInFull: input.refundedInFull });
  const delivery = input.deliveries[0] ?? null;

  const facts: AdminDetailLine[] = [
    { label: "Order reference", value: order.ref },
    { label: "Kind", value: ADMIN_KIND_LABELS[adminKindOf(order)] },
    { label: "Status", value: ADMIN_STATUS_LABELS[statusKey] },
    { label: "Buyer email", value: order.email },
    { label: "Postcode", value: order.postcode },
    ...(delivery
      ? [{ label: "Home", value: delivery.homeAddressLine }]
      : order.homeKey
        ? [{ label: "Home", value: homeLabelFromKey(order.homeKey) ?? order.postcode }]
        : []),
    ...(order.kind === "paid"
      ? [
          { label: "Amount", value: formatMoney(order.amount ?? 0, order.currency) },
          {
            label: "Consent",
            value:
              order.consentTick === null
                ? "Not recorded"
                : `${order.consentTick ? "Ticked" : "Not ticked"}${order.consentTimestamp ? ` at ${whenLabel(new Date(order.consentTimestamp), now)}` : ""}`,
          },
        ]
      : []),
    ...(order.testOrder ? [{ label: "Test order", value: "Yes — a test-lane order" }] : []),
    { label: "Order taken", value: whenLabel(order.createdAt, now) },
  ];

  const refunds = input.refunds.map((refund) => ({
    heading: `Refund — ${formatMoney(refund.amount, refund.currency)} (${refund.status})`,
    lines: [
      { label: "Amount", value: formatMoney(refund.amount, refund.currency) },
      { label: "Provider status", value: refund.status },
      {
        label: "When Stripe says it happened",
        value: whenLabel(refund.providerCreatedAt, now),
      },
      { label: "When we heard", value: whenLabel(refund.firstHeardAt, now) },
      {
        label: "Gift consequence",
        value:
          refund.giftConsequence !== null
            ? (GIFT_CONSEQUENCE_LINES[refund.giftConsequence] ?? refund.giftConsequence)
            : "Not yet decided",
      },
      {
        label: "Consequences applied",
        value: refund.consequencesApplied
          ? `Yes${refund.consequencesAppliedAt ? ` — ${whenLabel(refund.consequencesAppliedAt, now)}` : ""}`
          : "No",
      },
      ...(refund.needsAttention
        ? [
            {
              label: "Needs attention",
              value: "A failure notice arrived for a refund that already stands.",
            },
          ]
        : []),
    ] as AdminDetailLine[],
  }));

  const paymentEvents = input.paymentEvents
    .slice()
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
    .map((event) => ({
      label: whenLabel(event.receivedAt, now),
      value: `${event.eventType}${event.status ? ` — ${event.status}` : ""}${event.failureReason ? ` — ${event.failureReason}` : ""}`,
    }));

  const claimLines: AdminDetailLine[] = claim
    ? [
        { label: "Claim status", value: claim.status },
        { label: "Claimed", value: whenLabel(claim.claimedAt, now) },
        { label: "Fulfilled", value: whenLabel(claim.fulfilledAt, now) },
        { label: "Attempts", value: formatCount(claim.attempts) },
        {
          label: "Delivery email sent",
          value: claim.mailSent === null ? "Not recorded" : claim.mailSent ? "Yes" : "No",
        },
        ...(claim.lastError ? [{ label: "Last error", value: claim.lastError }] : []),
      ]
    : [{ label: "Claim", value: "No claim stands for this order" }];

  const deliveryLines: AdminDetailLine[] =
    input.deliveries.length > 0
      ? input.deliveries.flatMap((record) => [
          { label: "Delivered", value: whenLabel(record.createdAt, now) },
          { label: "Report file", value: record.fileName },
          ...(record.withdrawnAt
            ? [
                {
                  label: "Withdrawn",
                  value: `Withdrawn ${whenLabel(record.withdrawnAt, now)} — the order was refunded`,
                },
              ]
            : []),
        ])
      : [{ label: "Delivery", value: "No delivery stands for this order" }];

  const giftLines: AdminDetailLine[] = input.gift
    ? [
        { label: "Gift status", value: input.gift.status },
        { label: "Issued", value: whenLabel(input.gift.issuedAt, now) },
        { label: "Claimed", value: whenLabel(input.gift.claimedAt, now) },
        { label: "Redeemed", value: whenLabel(input.gift.redeemedAt, now) },
        ...(input.gift.voidedAt
          ? [{ label: "Voided", value: whenLabel(input.gift.voidedAt, now) }]
          : []),
        { label: "Expires", value: whenLabel(input.gift.expiresAt, now) },
      ]
    : [{ label: "Gift", value: "No gift stands for this order" }];

  const logLines: AdminDetailLine[] = input.log.map((entry) => ({
    label: whenLabel(entry.createdAt, now),
    value: `${LOG_KIND_LABELS[entry.kind] ?? entry.kind} — ${entry.sent ? "sent" : "not sent"}${entry.detail ? ` (${entry.detail})` : ""}`,
  }));

  const standingDelivery =
    claim?.status === "fulfilled" && delivery !== null && delivery.withdrawnAt === null;
  const resend = input.refundedInFull
    ? {
        available: false,
        note: "This order was refunded — its delivery stands withdrawn, so there is nothing to re-send.",
      }
    : standingDelivery
      ? { available: true, note: null }
      : {
          available: false,
          note: "No standing delivery to re-send yet.",
        };

  return {
    ref: order.ref,
    heading: `Order — ${delivery ? delivery.homeAddressLine : order.postcode}`,
    statusLabel: ADMIN_STATUS_LABELS[statusKey],
    facts,
    refunds,
    paymentEvents,
    claimLines,
    deliveryLines,
    giftLines,
    logLines,
    resend,
  };
}
