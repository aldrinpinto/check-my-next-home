// Order lookup and the owner re-send (plan step
// M9.10, prep gap 10) — the support machinery behind
// scripts/order-lookup.ts, factored out of the script
// the way the payment start is factored out of its
// route, so the behaviour is testable without a
// terminal. The admin PAGE's version of this surface
// is M9.11 (the founder's rider); this step's is the
// ops script only.
//
// THE LOOKUP reads across the shelves the order
// record assembles: the order row itself, its claim,
// its deliveries, its refunds — read LIVE from
// payment_refunds (M9.8's overlay, the refund truth;
// the order row's own refund_status column is never
// the authority, per migration 0043's recorded
// reconciliation) — and its delivery log.
//
// THE OWNER RE-SEND is verification-first and
// address-less BY CONSTRUCTION:
//   - There is NO destination-address input anywhere
//     in this module or the script over it. The email
//     goes where the order's delivery already goes —
//     the seam (lib/server/report-resend.ts) reads the
//     address off the order itself.
//   - The requester must BE the order's buyer: the
//     requester's email is compared (normalised, the
//     comparison rule) against the order's recorded
//     email, and a mismatch is refused BEFORE any send
//     is attempted — and the refusal itself is written
//     to the delivery log, with the verification fact
//     as its detail. Support verifies the requester
//     out-of-band (they are writing from, or can prove
//     control of, the buyer's inbox); the log is the
//     record that the check was made.
//   - What goes out is the STANDING delivery's email
//     over the identical stored PDF — the seam drives
//     the delivery service's re-send of the delivery
//     itself, never a regeneration.
//   - M9.8's withdrawal refusal is INHERITED, not
//     re-implemented: a refunded order's delivery is
//     withdrawn, the delivery service answers null for
//     it, and the seam answers not-found — the re-send
//     cannot resurrect a refunded report.
//   - EVERY outcome lands in the delivery log: the
//     verification refusal (above), the seam's refusal
//     (unfulfilled, withdrawn, unconfigured), and the
//     send itself, sent or failed (the seam writes
//     that row through the logResend this module hands
//     it, under the owner-resend kind).

import type { DeliveryRecord } from "../download";
import { normaliseEmail } from "../gift";
import type { FulfilmentClaim, FulfilmentClaimStore } from "./fulfilment";
import type { DeliveryLogEntry, OrderRecord, OrderStore } from "./orders";
import type { DeliveryStore } from "./report-deliveries";
import type { ReportDeliveryService } from "./report-delivery";
import { resendOrderDelivery } from "./report-resend";
import type { PaymentRefund, RefundStore } from "./refunds";

export interface OrderSummary {
  order: OrderRecord;
  claim: FulfilmentClaim | null;
  deliveries: DeliveryRecord[];
  // The order's refunds, read live from M9.8's
  // overlay (paid orders only — a gifted or free order
  // has no payment to refund).
  refunds: PaymentRefund[];
  // Whether a completed FULL refund stands for the
  // order's payment (the refund processing's own
  // reading of the overlay).
  refundedInFull: boolean;
  log: DeliveryLogEntry[];
}

export interface OrderAdminDeps {
  orders: OrderStore;
  claims: FulfilmentClaimStore;
  deliveries: DeliveryStore;
  refunds: RefundStore;
  refundCheck: { completedFullRefund(paymentRef: string): Promise<boolean> };
  // The environment's delivery service, or null where
  // it cannot be built — a re-send then answers
  // not-configured, exactly as the buyer re-send does.
  delivery: ReportDeliveryService | null;
}

async function summariseOrder(deps: OrderAdminDeps, order: OrderRecord): Promise<OrderSummary> {
  const [claim, deliveries, refunds, log] = await Promise.all([
    deps.claims.getByRef(order.ref),
    deps.deliveries.listByOrderRef(order.ref),
    order.kind === "paid" ? deps.refunds.listByPayment(order.ref) : Promise.resolve([]),
    deps.orders.listDeliveryLog(order.ref),
  ]);
  const refundedInFull =
    order.kind === "paid" ? await deps.refundCheck.completedFullRefund(order.ref) : false;
  return { order, claim, deliveries, refunds, refundedInFull, log };
}

export async function findOrders(
  deps: OrderAdminDeps,
  query: { email: string } | { postcode: string } | { ref: string },
): Promise<OrderSummary[]> {
  const found =
    "email" in query
      ? await deps.orders.findByEmail(query.email)
      : "postcode" in query
        ? await deps.orders.findByPostcode(query.postcode)
        : [await deps.orders.getByRef(query.ref)].filter(
            (order): order is OrderRecord => order !== null,
          );
  const summaries: OrderSummary[] = [];
  for (const order of found) summaries.push(await summariseOrder(deps, order));
  return summaries;
}

export type OwnerResendResult =
  | { ok: true; sent: boolean }
  | {
      ok: false;
      reason: "order-not-found" | "requester-not-verified" | "not-found" | "not-configured";
    };

export async function ownerResendOrder(
  deps: OrderAdminDeps,
  input: { ref: string; requesterEmail: string; origin: string },
): Promise<OwnerResendResult> {
  const order = await deps.orders.getByRef(input.ref);
  if (!order) return { ok: false, reason: "order-not-found" };

  // The verification: the requester must be the
  // order's own buyer. A mismatch is refused before
  // any send — and the refusal is logged with the
  // verification fact, so the record shows the check
  // was made and how it answered.
  if (normaliseEmail(input.requesterEmail) !== order.email) {
    await deps.orders
      .logDelivery({
        orderRef: order.ref,
        deliveryId: order.deliveryId,
        kind: "owner-resend",
        sent: false,
        detail: "requester-not-verified",
      })
      .catch(() => {});
    return { ok: false, reason: "requester-not-verified" };
  }

  // The send itself is the buyer re-send's seam,
  // driven with the owner kind: it guards (fulfilled,
  // standing delivery), inherits the withdrawal
  // refusal, sends the standing delivery's email over
  // the identical stored PDF to the order's own
  // address, and writes the attempt to the log.
  const result = await resendOrderDelivery(
    {
      claims: deps.claims,
      delivery: deps.delivery,
      logResend: (entry) =>
        deps.orders.logDelivery({ ...entry, kind: "owner-resend" }).then(() => undefined),
    },
    { ref: input.ref, origin: input.origin },
  );
  if (!result.ok) {
    // The seam refused before any send (unfulfilled,
    // or the delivery withdrawn by a completed refund):
    // the attempt stands in the log too, with the
    // seam's reason as its detail.
    await deps.orders
      .logDelivery({
        orderRef: order.ref,
        deliveryId: order.deliveryId,
        kind: "owner-resend",
        sent: false,
        detail: result.reason,
      })
      .catch(() => {});
    return { ok: false, reason: result.reason };
  }
  return { ok: true, sent: result.sent };
}
