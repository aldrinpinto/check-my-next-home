// The order notices (plan step M9.10) — the firing
// discipline behind every email this step sends,
// gathered in one module so each firing point stays
// thin:
//
//   delivered()      — the worker fulfilled a claim:
//                      the order record names its
//                      delivery, and the delivery log
//                      gains its 'delivery' row.
//   saleAlert()      — the SALE ALERT (ruling R1):
//                      fires at fulfilment of a PAID
//                      claim, exactly once, with the
//                      stored PDF attached — the bytes
//                      read back by the delivery's key,
//                      never a regeneration.
//   failureNotices() — the failure PAIR (gap 6): at a
//                      claim's terminal failure, the
//                      owner alert (every kind) and —
//                      paid claims only, because
//                      Sample 41 speaks of a payment —
//                      the buyer's Sample 41 email. The
//                      marker is written only when the
//                      required sends succeed; a failed
//                      send leaves it unset and the
//                      sweep retries the pair.
//   sweep()          — a worker pass's retry road:
//                      terminally failed claims whose
//                      pair never landed, and fulfilled
//                      paid orders whose sale alert
//                      never landed, are retried under
//                      their markers' guards.
//   failedPayment()  — Sample 40, fired by the webhook
//                      under its own discipline (once
//                      per intent, never after a
//                      same-intent success — that
//                      decision lives in
//                      lib/server/fulfilment.ts, which
//                      owns the log and the claim).
//   giftClaimed()    — Sample 42, fired by the gift
//                      confirm route at the bind
//                      (gap 7): a courtesy notice — a
//                      failed send changes nothing
//                      about the claim, is logged
//                      server-side, and has no retry
//                      machinery, by the prep's design.
//
// NO METHOD HERE THROWS. These are side records of
// journeys owned by other modules (the worker, the
// webhook, the claim route); a notice's failure is
// logged in the entry-log style and the journey
// stands. The markers are what make the silence
// recoverable: an unsent notice is a visible gap on
// the order record, and the sweep is its road back.

import type { GiftRecord } from "../gift";
import {
  failedPaymentEmail,
  fulfilmentFailureEmail,
  giftClaimedEmail,
  ownerFailureAlertEmail,
  saleAlertEmail,
} from "../order-emails";
import type { ReportDoorIdentity } from "../report-door";
import { reportRoute } from "../results";
import { REPORT_PRICE_PENCE, SITE_URL } from "../site";
import { getDbPool } from "./db";
import type { FulfilmentClaim, FulfilmentClaimStore } from "./fulfilment";
import { createDbFulfilmentClaimStore } from "./fulfilment";
import { getNoticeMailer, type NoticeMailer } from "./notice-mailer";
import { createDbOrderStore, type OrderRecord, type OrderStore } from "./orders";
import { getOwnerMailer, type OwnerMailer } from "./owner-mailer";
import { PAYMENT_CURRENCY } from "./payments";
import { createDbDeliveryStore, type DeliveryStore } from "./report-deliveries";
import { identityForOrder } from "./report-identity";
import { getReportPdfStore, type ReportPdfStore } from "./report-storage";

export interface OrderNoticesDeps {
  orders: OrderStore;
  claims: FulfilmentClaimStore;
  deliveries: DeliveryStore;
  pdfStore: ReportPdfStore;
  ownerMailer: OwnerMailer;
  noticeMailer: NoticeMailer;
  // Name a home the way the order surfaces name it
  // (lib/server/report-identity.ts) — the failed-
  // payment and failure emails name title + postcode
  // from it, never from client-sent strings.
  resolveIdentity: (postcode: string, homeKey: string | null) => Promise<ReportDoorIdentity>;
  // The public origin the failed-payment email's
  // try-again link is built on.
  origin: string;
  now?: () => Date;
}

export interface OrderNotices {
  delivered(
    claim: FulfilmentClaim,
    outcome: { deliveryId: string; mailSent: boolean },
  ): Promise<void>;
  saleAlert(claim: FulfilmentClaim): Promise<void>;
  failureNotices(claim: FulfilmentClaim): Promise<void>;
  sweep(limit?: number): Promise<void>;
  failedPayment(input: { email: string; postcode: string; homeKey: string | null }): Promise<void>;
  giftClaimed(gift: GiftRecord): Promise<void>;
}

function warn(what: string, error: unknown): void {
  console.warn(
    `order-notice ${what} outcome=dropped reason=${
      error instanceof Error ? error.message.slice(0, 120) : "unknown"
    }`,
  );
}

// The home's names in the forms the emails carry: the
// title for subjects, the full address line for
// bodies — each the bare postcode where the home does
// not resolve to a single address. The identity's
// subline is "Locality, POSTCODE"; the samples' line
// (and the report masthead's own address line) drops
// that comma — "19 Birkdale Rise, Hatfield Peverel
// CM3 2JT" — so the join drops it too.
function identityNames(
  identity: ReportDoorIdentity,
  postcode: string,
): { title: string; addressLine: string } {
  if (identity.kind === "home") {
    return {
      title: identity.subject,
      addressLine: identity.subline
        ? `${identity.subject}, ${identity.subline.replace(", ", " ")}`
        : identity.subject,
    };
  }
  return { title: postcode, addressLine: postcode };
}

export function createOrderNotices(deps: OrderNoticesDeps): OrderNotices {
  const now = () => (deps.now ? deps.now() : new Date());

  // The order record for a claim, written on the spot
  // where it does not stand — the road for claims
  // taken before this step existed (their money facts
  // are the claim's own; a legacy paid order's consent
  // pair is unrecoverable here and stands null, as a
  // gifted order's honestly does).
  async function ensureOrder(claim: FulfilmentClaim): Promise<OrderRecord> {
    const existing = await deps.orders.getByRef(claim.ref);
    if (existing) return existing;
    return deps.orders.recordClaim({
      ref: claim.ref,
      kind: claim.kind,
      email: claim.email,
      postcode: claim.postcode,
      homeKey: claim.homeKey,
      amount: claim.kind === "paid" ? REPORT_PRICE_PENCE : null,
      currency: claim.kind === "paid" ? PAYMENT_CURRENCY : null,
      providerRef: claim.kind === "paid" ? claim.ref : null,
      testOrder: claim.testOrder,
      now: claim.claimedAt,
    });
  }

  async function namesFor(
    postcode: string,
    homeKey: string | null,
  ): Promise<{ title: string; addressLine: string }> {
    const identity = await deps.resolveIdentity(postcode, homeKey).catch(() => null);
    return identity
      ? identityNames(identity, postcode)
      : { title: postcode, addressLine: postcode };
  }

  const notices: OrderNotices = {
    async delivered(claim, outcome) {
      try {
        await ensureOrder(claim);
        await deps.orders.markDelivered(claim.ref, outcome.deliveryId, now());
        await deps.orders.logDelivery({
          orderRef: claim.ref,
          deliveryId: outcome.deliveryId,
          kind: "delivery",
          sent: outcome.mailSent,
          now: now(),
        });
      } catch (error) {
        warn(`delivered order=${claim.ref}`, error);
      }
    },

    async saleAlert(claim) {
      try {
        if (claim.kind !== "paid") return;
        const order = await ensureOrder(claim);
        if (order.saleAlertSentAt) return;
        const deliveryId = claim.deliveryId ?? order.deliveryId;
        if (!deliveryId) return;
        const delivery = await deps.deliveries.getById(deliveryId);
        if (!delivery) return;
        const bytes = await deps.pdfStore.get(delivery.pdfKey);
        if (!bytes) {
          warn(`sale-alert order=${claim.ref}`, new Error("stored-pdf-missing"));
          return;
        }
        const result = await deps.ownerMailer.sendSaleAlert({
          email: saleAlertEmail({
            orderedAt: order.createdAt,
            buyerEmail: order.email,
            homeAddressLine: delivery.homeAddressLine,
            homeTitle: delivery.homeTitle,
            orderRef: order.ref,
            testOrder: order.testOrder,
            giftIssued: delivery.giftToken !== null,
          }),
          attachment: { fileName: delivery.fileName, bytes },
        });
        if (result.sent) {
          await deps.orders.markSaleAlertSent(order.ref, now());
        } else {
          warn(`sale-alert order=${claim.ref}`, new Error(result.reason));
        }
      } catch (error) {
        warn(`sale-alert order=${claim.ref}`, error);
      }
    },

    async failureNotices(claim) {
      try {
        const order = await ensureOrder(claim);
        if (order.failureNoticeSentAt) return;
        const names = await namesFor(claim.postcode, claim.homeKey);
        // The owner alert goes FIRST: it is the alarm,
        // and if the pair must be retried after a
        // partway failure, a second internal alert is
        // the tolerable duplicate — a second buyer
        // email is not (see the header of
        // lib/order-emails.ts's pair discipline in the
        // prep, gap 6).
        const ownerResult = await deps.ownerMailer.sendFailureAlert({
          email: ownerFailureAlertEmail({
            orderRef: claim.ref,
            homeTitle: names.title,
            homeAddressLine: names.addressLine,
            buyerEmail: claim.email,
            kind: claim.kind,
            testOrder: claim.testOrder,
            attempts: claim.attempts,
            reason: claim.lastError ?? "fulfilment-failed",
          }),
        });
        if (!ownerResult.sent) {
          warn(`failure-alert order=${claim.ref}`, new Error(ownerResult.reason));
          return;
        }
        if (claim.kind === "paid") {
          const buyerResult = await deps.noticeMailer.sendFulfilmentFailureEmail({
            to: claim.email,
            email: fulfilmentFailureEmail({
              homeTitle: names.title,
              homeAddressLine: names.addressLine,
            }),
          });
          if (!buyerResult.sent) {
            warn(`failure-buyer-email order=${claim.ref}`, new Error(buyerResult.reason));
            return;
          }
        }
        await deps.orders.markFailureNoticeSent(claim.ref, now());
      } catch (error) {
        warn(`failure-notices order=${claim.ref}`, error);
      }
    },

    async sweep(limit = 10) {
      try {
        for (const order of await deps.orders.listFailureNoticePending(limit)) {
          const claim = await deps.claims.getByRef(order.ref).catch(() => null);
          if (claim && claim.status === "failed") await notices.failureNotices(claim);
        }
        for (const order of await deps.orders.listSaleAlertPending(limit)) {
          const claim = await deps.claims.getByRef(order.ref).catch(() => null);
          if (claim && claim.status === "fulfilled") await notices.saleAlert(claim);
        }
      } catch (error) {
        warn("sweep", error);
      }
    },

    async failedPayment(input) {
      try {
        const names = await namesFor(input.postcode, input.homeKey);
        const result = await deps.noticeMailer.sendPaymentFailedEmail({
          to: input.email,
          email: failedPaymentEmail({
            homeAddressLine: names.addressLine,
            // BUG-331: the button is "Try the payment
            // again", so it opens the payment page for
            // this home (reportRoute) — not the free
            // results page (homeRoute), which made the
            // buyer find the buy bar and click through
            // themselves.
            paymentUrl: `${deps.origin}${reportRoute(input.postcode, input.homeKey)}`,
          }),
        });
        if (!result.sent) warn("failed-payment-email", new Error(result.reason));
      } catch (error) {
        warn("failed-payment-email", error);
      }
    },

    async giftClaimed(gift) {
      try {
        if (!gift.orderRef) return;
        const deliveries = await deps.deliveries.listByOrderRef(gift.orderRef);
        const delivery = deliveries[0];
        if (!delivery) {
          warn(`gift-claimed order=${gift.orderRef}`, new Error("issuing-delivery-missing"));
          return;
        }
        const result = await deps.noticeMailer.sendGiftClaimedEmail({
          to: gift.buyerEmail,
          email: giftClaimedEmail({ homeTitle: delivery.homeTitle }),
        });
        if (!result.sent) warn(`gift-claimed order=${gift.orderRef}`, new Error(result.reason));
      } catch (error) {
        warn(`gift-claimed order=${gift.orderRef ?? "unknown"}`, error);
      }
    },
  };
  return notices;
}

// The environment's notices: the database stores, the
// environment's mailers, the door's identity ladder
// and the stored-PDF shelf. Origin follows the
// worker's own rule (APP_ORIGIN, else the site's URL)
// unless a caller passes the request's — the webhook
// passes its request's public origin, the public-url
// discipline (prep gap 5).
export function getOrderNotices(origin?: string): OrderNotices {
  const pool = getDbPool();
  return createOrderNotices({
    orders: createDbOrderStore(pool),
    claims: createDbFulfilmentClaimStore(pool),
    deliveries: createDbDeliveryStore(pool),
    pdfStore: getReportPdfStore(),
    ownerMailer: getOwnerMailer(),
    noticeMailer: getNoticeMailer(),
    resolveIdentity: identityForOrder,
    origin: origin ?? process.env.APP_ORIGIN ?? SITE_URL,
  });
}
