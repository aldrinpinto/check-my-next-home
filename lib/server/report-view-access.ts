// The report view's access check (BUG-324, 25 Nov
// 2026) — the paid report's on-screen gate.
//
// The view route served the full report to anyone who
// knew the address: its only gate was the door state,
// and the door stands "paid". The PDF never had this
// hole — only the delivery email's signed link opens
// it — so the on-screen report takes the SAME standing,
// not a weaker one: the view route accepts the delivery
// email's signed download token as its view token, and
// serves only when all four of these hold:
//
//   1. The door state is not "holding" — enforced by
//      reportViewGate in lib/report.ts (the page passes
//      it the verification's answer); this module does
//      not read the door state, whose nation-dependent
//      effective value the page already computes.
//   2. The token verifies with the K16 download signer
//      (getDownloadSigner().verify) — invalid or
//      expired goes to the door, never an error page.
//   3. The delivery the token names stands — NOT
//      withdrawn. A refunded order's delivery never
//      opens the report, mirroring lib/download.ts's
//      downloadLandingView withdrawn rule: the token
//      dies with the delivery, with no token
//      bookkeeping.
//   4. The delivery's order stands fulfilled for THIS
//      identity — the claim read through readOrderState
//      (delivery.orderRef) must be a fulfilled claim
//      whose postcode and homeKey match the requested
//      ones. Whole-postcode orders carry homeKey null,
//      and that null matches too — a null is an
//      identity, not an absence. The refund overlay
//      rides inside the reading, so a completed full
//      refund denies here as well as at check 3.
//
// Everyone else goes to the report door
// (reportRoute), never an error page — the /report
// pattern. The success page mints the token with
// reportViewTokenForOrder (the delivery email's own
// token, freshly minted over the order's standing
// delivery) and carries it on the "View your report"
// button; the delivery email itself needs no change,
// since its signed link IS a view token.
//
// The two functions take their shelves as an optional
// trailing argument: production calls them bare and
// they wire the environment (the pool, the K16 signer,
// the payments router, the refund and gift overlays);
// the tests pass memory stores and a throwaway signer
// through it. The signatures without it are the
// production shape.

import { normalisePostcode } from "../address";
import { getDbPool } from "./db";
import { getDownloadSigner, type DownloadSigner } from "./download-links";
import { createDbFulfilmentClaimStore, type FulfilmentClaimStore } from "./fulfilment";
import { createDbGiftStore } from "./gifts";
import { readOrderState } from "./order-state";
import { getPaymentsRouter, type PaymentsRouter } from "./payments";
import { createDbRefundStore, refundTriggerMet } from "./refunds";
import { createDbDeliveryStore, type DeliveryStore } from "./report-deliveries";

export interface ReportViewAccessDeps {
  // The K16 signer, or null where the environment
  // carries no signing secret — no token can be minted
  // and none verifies, so every reader takes the door.
  signer: DownloadSigner | null;
  deliveries: DeliveryStore;
  claims: FulfilmentClaimStore;
  payments: PaymentsRouter;
  // The refund overlay, as the success page wires it:
  // whether a completed full refund stands for a
  // payment reference.
  completedFullRefund: (ref: string) => Promise<boolean>;
  // The gift overlay, as the success page wires it:
  // whether the gift behind a gifted claim stands
  // voided, by its token.
  giftVoided: (giftToken: string) => Promise<boolean>;
  now?: () => Date;
}

// The environment's wiring, mirroring the success
// page's own (app/report/success/page.tsx): the pool's
// stores, the K16 signer, the payments router, and the
// two overlays read off the refund and gift stores.
function defaultDeps(): ReportViewAccessDeps {
  const pool = getDbPool();
  const refundStore = createDbRefundStore(pool);
  const gifts = createDbGiftStore(pool);
  return {
    signer: getDownloadSigner(),
    deliveries: createDbDeliveryStore(pool),
    claims: createDbFulfilmentClaimStore(pool),
    payments: getPaymentsRouter(),
    completedFullRefund: async (ref) => refundTriggerMet(await refundStore.listByPayment(ref)),
    giftVoided: async (token) => (await gifts.getByToken(token))?.status === "voided",
  };
}

// A postcode match tolerant of case and spacing only —
// the claim's filed postcode against the requested one.
// A value that is not a full postcode on either side
// falls back to the exact comparison, so an odd string
// never matches by normalisation.
function samePostcode(a: string, b: string): boolean {
  const normA = normalisePostcode(a);
  const normB = normalisePostcode(b);
  if (normA && normB) return normA === normB;
  return a === b;
}

// Mint the view token for an order: the delivery
// email's signed download token, freshly minted over
// the order's standing delivery. Null when no delivery
// stands for the order (none recorded, or every one
// withdrawn) or when there is no signer — the success
// page then renders its plain view link, and the gate
// sends the buyer to the door, where the emailed link
// still opens the report.
export async function reportViewTokenForOrder(
  orderRef: string,
  deps: ReportViewAccessDeps = defaultDeps(),
): Promise<string | null> {
  const signer = deps.signer;
  if (!signer) return null;
  const deliveries = await deps.deliveries.listByOrderRef(orderRef).catch(() => []);
  const delivery = deliveries.find((candidate) => !candidate.withdrawnAt) ?? null;
  if (!delivery) return null;
  const now = deps.now ? deps.now() : new Date();
  return signer.mint(delivery.id, now).token;
}

// The view route's access check: the token verifies,
// the delivery it names stands, and the delivery's
// order stands fulfilled for this identity. Anything
// else — no signer, a bad or spent token, no delivery,
// a withdrawn delivery, no claim, a claim that is not
// fulfilled, a refunded or voided order, a claim for
// another home — is false, and the caller sends the
// reader to the door. Fail-closed throughout: a shelf
// that cannot be read denies, never serves.
export async function verifyReportViewAccess(
  token: string,
  postcode: string,
  homeKey: string | null,
  deps: ReportViewAccessDeps = defaultDeps(),
): Promise<boolean> {
  const signer = deps.signer;
  if (!signer) return false;
  const now = deps.now ? deps.now() : new Date();
  const verification = signer.verify(token, now);
  if (verification.kind !== "ok") return false;
  const delivery = await deps.deliveries.getById(verification.deliveryId).catch(() => null);
  if (!delivery) return false;
  // The withdrawn rule, as lib/download.ts reads it:
  // a refunded order's delivery never opens the report.
  if (delivery.withdrawnAt) return false;
  if (!delivery.orderRef) return false;
  const reading = await readOrderState(
    {
      claims: deps.claims,
      payments: deps.payments,
      refunds: { completedFullRefund: deps.completedFullRefund },
      giftVoided: deps.giftVoided,
    },
    delivery.orderRef,
  ).catch(() => null);
  if (!reading || reading.kind !== "claim") return false;
  const claim = reading.claim;
  if (claim.status !== "fulfilled") return false;
  if (!samePostcode(claim.postcode, postcode)) return false;
  if (claim.homeKey !== homeKey) return false;
  return true;
}
