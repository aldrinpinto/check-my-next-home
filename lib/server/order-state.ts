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
//
// THE REFUND OVERLAY (M9.8, gap 9) reads BEFORE the
// claim's state: where a completed full refund stands
// for the reference, the order reads REFUNDED whatever
// its claim says — a fulfilled claim keeps its status
// in the books, but its surfaces stop presenting the
// report as ready, stop offering its opening and stop
// offering the re-send. A gifted claim reads its own
// overlay: where the gift behind it stands voided, the
// claimant's surface reads the voided state rather
// than a claim that waits forever. Both overlays are
// optional deps in the type; both production surfaces
// wire them.

import {
  PAYMENT_METADATA_EMAIL,
  PAYMENT_METADATA_HOME_KEY,
  PAYMENT_METADATA_POSTCODE,
  type PaymentsRouter,
} from "./payments";
import type { FulfilmentClaim, FulfilmentClaimStore } from "./fulfilment";
import type { RefundProcessing } from "./refunds";

export type OrderReading =
  // A completed full refund stands for this reference
  // (M9.8): the overlay answer, read before the
  // claim's own state. The claim rides along where one
  // stands — the surface still needs its kind, its
  // email and its home.
  | { kind: "refunded"; claim: FulfilmentClaim | null }
  // A gifted claim whose gift stands voided (M9.8):
  // the claimant's own overlay.
  | { kind: "voided-gift"; claim: FulfilmentClaim }
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
  // The refund overlay (M9.8): whether a completed
  // full refund stands for a payment reference.
  refunds?: Pick<RefundProcessing, "completedFullRefund">;
  // The gift overlay (M9.8): whether the gift behind a
  // gifted claim stands voided, by its token.
  giftVoided?: (giftToken: string) => Promise<boolean>;
}

export async function readOrderState(deps: OrderStateDeps, ref: string): Promise<OrderReading> {
  // The refund overlay first (M9.8): a completed full
  // refund outranks the claim's own state — including
  // the no-claim-yet race, where a refund heard before
  // the success still ends the order's surfaces.
  if (deps.refunds) {
    const refunded = await deps.refunds.completedFullRefund(ref).catch(() => false);
    if (refunded) {
      const claim = await deps.claims.getByRef(ref).catch(() => null);
      return { kind: "refunded", claim };
    }
  }

  const claim = await deps.claims.getByRef(ref).catch(() => null);
  if (claim) {
    if (claim.kind === "gifted" && claim.giftToken && deps.giftVoided) {
      const voided = await deps.giftVoided(claim.giftToken).catch(() => false);
      if (voided) return { kind: "voided-gift", claim };
    }
    return { kind: "claim", claim };
  }

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
