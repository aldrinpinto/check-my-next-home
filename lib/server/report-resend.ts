// The buyer re-send's seam (plan step M9.7, gap 5 —
// ruling R1): the success surface's "send the email
// again" control, factored out of its route the way
// the payment start is factored out of the intent
// route, so the behaviour is testable without HTTP.
//
// The re-send is strictly THIS order's: the claim the
// reference names must stand FULFILLED with a delivery
// behind it, and what goes out is that delivery's own
// email, to the address the order already carries —
// the control takes no address and no other order's
// reference can be aimed elsewhere. A successful send
// is recorded on the claim (mail_sent follows the
// fact, so the success surface's email card tells the
// truth afterwards). Nothing new is created anywhere:
// no delivery record, no gift, no link record.
//
// It is NOT M8.6's re-issue (an expired link renewed
// from the download page). M9.10's owner resend (any
// order, support-side, from the ops script) drives
// THIS seam rather than merging with the buyer's
// flow: the script adds its own requester
// verification in front, and inherits this seam's
// guards — the three flows never merge.

import type { FulfilmentClaimStore } from "./fulfilment";
import type { ReportDeliveryService } from "./report-delivery";

export interface ReportResendDeps {
  claims: FulfilmentClaimStore;
  // The environment's delivery service, or null where
  // it cannot be built (no signing secret): the
  // re-send is then not-configured, exactly as the
  // payment start reads an unconfigured translator.
  delivery: ReportDeliveryService | null;
  // The delivery log (M9.10): every re-send this seam
  // actually attempts is written to the order's
  // delivery log — the caller names the kind by the
  // closure it passes (this route's buyer re-send;
  // the owner ops script's support re-send, which
  // drives this same seam so the withdrawal refusal
  // and the fulfilled-only guard are inherited, never
  // re-implemented). A withdrawn delivery never
  // reaches the log: the service answers null for it
  // before any send, and that refusal is the answer,
  // not a send. Optional in the type so older test
  // harnesses stand unchanged; both production
  // callers wire it. A failed log write never changes
  // the re-send's own answer.
  logResend?: (entry: {
    orderRef: string;
    deliveryId: string;
    sent: boolean;
    detail?: string | null;
  }) => Promise<void>;
}

export type ReportResendResult =
  { ok: true; sent: boolean } | { ok: false; reason: "not-found" | "not-configured" };

export async function resendOrderDelivery(
  deps: ReportResendDeps,
  input: { ref: string; origin: string },
): Promise<ReportResendResult> {
  const claim = await deps.claims.getByRef(input.ref).catch(() => null);
  if (!claim || claim.status !== "fulfilled" || !claim.deliveryId) {
    return { ok: false, reason: "not-found" };
  }
  if (!deps.delivery) return { ok: false, reason: "not-configured" };
  const mail = await deps.delivery.resendDeliveryEmail({
    deliveryId: claim.deliveryId,
    origin: input.origin,
  });
  if (!mail) return { ok: false, reason: "not-found" };
  // The re-send stands attempted: the order's delivery
  // log gains its row, sent or failed alike (M9.10).
  if (deps.logResend) {
    await deps
      .logResend({
        orderRef: input.ref,
        deliveryId: claim.deliveryId,
        sent: mail.sent,
        detail: mail.sent ? null : mail.reason,
      })
      .catch(() => {});
  }
  if (mail.sent) {
    // The email stands sent: the claim's record follows
    // the fact, so the surface stops showing the unsent
    // wording on the buyer's next look.
    await deps.claims.markMailSent(input.ref).catch(() => {});
  }
  return { ok: true, sent: mail.sent };
}
