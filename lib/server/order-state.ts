// The order-state reading (plan step M9.7, gap 2) —
// how the post-payment surfaces answer "where does
// this order stand?" in two questions, claim first:
//
//   1. Is there a fulfilment claim under the
//      reference? A claim is the order's own record —
//      its state (claimed, fulfilled, failed) is the
//      answer, whole.
//   2. If not, does the payment itself exist and stand
//      OURS? The reference the buyer arrives with is
//      the payment's own id; the translator reads its
//      status and metadata back, and a payment is ours
//      only where its metadata carries the identity
//      our creation put there (the delivery email and
//      the postcode). A succeeded or processing payment
//      with no claim yet is the webhook race — the
//      buyer navigated the instant their card
//      confirmed, seconds ahead of the "paid" message
//      that makes the claim — and it reads as
//      PREPARING, never as a bounce back to the payment
//      page that could trick them into paying twice.
//      A payment that stands unpaid (a declined or
//      abandoned bank-approval detour) reads as UNPAID
//      — the return landing's Sample 12 case.
//   3. Neither: the reference is a stale tab, a typed
//      URL, a made-up string — the surfaces fall back
//      to the report door, never to an error page (the
//      M9.6 pin, kept).
//
// Both post-payment surfaces read through here — the
// success surface and the payment return landing — so
// the two can never disagree about an order's state.

import {
  PAYMENT_METADATA_EMAIL,
  PAYMENT_METADATA_HOME_KEY,
  PAYMENT_METADATA_POSTCODE,
  type PaymentsRouter,
} from "./payments";
import type { FulfilmentClaim, FulfilmentClaimStore } from "./fulfilment";

export type OrderReading =
  | { kind: "claim"; claim: FulfilmentClaim }
  | {
      kind: "payment";
      // "preparing" — paid (or settling) but not yet
      // claimed; "unpaid" — the payment stands, and it
      // was never paid.
      state: "preparing" | "unpaid";
      email: string;
      postcode: string;
      homeKey: string | null;
    }
  | { kind: "none" };

export interface OrderStateDeps {
  claims: FulfilmentClaimStore;
  payments: PaymentsRouter;
}

export async function readOrderState(deps: OrderStateDeps, ref: string): Promise<OrderReading> {
  const claim = await deps.claims.getByRef(ref).catch(() => null);
  if (claim) return { kind: "claim", claim };

  const status = await deps.payments.intentStatus(ref).catch(() => null);
  if (!status || !status.ok) return { kind: "none" };
  const email = status.metadata[PAYMENT_METADATA_EMAIL] ?? null;
  const postcode = status.metadata[PAYMENT_METADATA_POSTCODE] ?? null;
  // Ours, or not ours: a payment our creation made
  // carries the delivery email and the postcode in its
  // metadata. Anything else behind this reference is
  // not an order of ours to read.
  if (!email || !postcode) return { kind: "none" };
  const homeKey = status.metadata[PAYMENT_METADATA_HOME_KEY] ?? null;
  if (status.status === "succeeded" || status.status === "processing") {
    return { kind: "payment", state: "preparing", email, postcode, homeKey };
  }
  return { kind: "payment", state: "unpaid", email, postcode, homeKey };
}
