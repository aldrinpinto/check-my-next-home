// The report delivery service (plan step M8.6, Key
// K16) — the one service that runs the safe download
// link flow end to end, over the step's seams:
//
//   deliverReport()       — write the delivery record,
//                           issue the Check Together
//                           gift on a PAID delivery
//                           (exactly one; never on a
//                           free or gifted delivery —
//                           D21's named tests), mint the
//                           signed link and send the
//                           delivery email.
//   reissueDownloadLink() — the expired page's form:
//                           verify the presented link,
//                           read its delivery, apply
//                           lib/download.ts's decision,
//                           and on a match mint a FRESH
//                           link (the old one is
//                           untouched — it dies on its
//                           own seventh day) and send
//                           the re-issue email, which
//                           never carries a gift block.
//
// THE M9 WIRING POINT, named plainly: this step builds
// the machinery, the pages and the templates — nothing
// in the live app calls deliverReport yet. At M9, the
// payment webhook's confirmed-payment path calls
// deliverReport exactly once per fulfilled order (kind
// "paid", with the order's ref), the free launch
// window's fulfilment calls it with kind "free", and
// the gift-redemption delivery (M9.6, alongside
// gifts.ts's markRedeemed) with kind "gifted" — in
// each case with the stored PDF's key and file name
// from lib/server/report-pdf.ts's generation, and the
// request's public origin (lib/server/public-url.ts)
// so the emailed links point at the host the buyer
// used. The success page's on-screen report (the plan's
// M8.6 scope note) is M9's surface to wire beside the
// same call. Until then getReportDeliveryService()
// stands ready and uncalled, exactly as M8.4's PDF
// machinery stood before its trigger existed.
//
// Failure discipline: the seams answer values, never
// throws, for expected failures (the mailers), and a
// backend failure throws (the stores) — a delivery
// whose email failed to send is still a delivery (the
// buyer can always re-issue; the report never
// expires), so deliverReport returns the mail result
// for M9's caller to log and act on rather than
// un-delivering anything.

import {
  decideReissue,
  deliveryEmail,
  downloadPath,
  reissueEmail,
  type DeliveryKind,
  type DeliveryRecord,
} from "../download";
import { giftClaimPath, normaliseEmail } from "../gift";
import { getDbPool } from "./db";
import { getDownloadSigner, type DownloadSigner } from "./download-links";
import { createDbGiftStore, type GiftStore } from "./gifts";
import { createDbDeliveryStore, type DeliveryStore } from "./report-deliveries";
import { getReportMailer, type ReportMailResult, type ReportMailer } from "./report-mailer";

export interface ReportDeliveryDeps {
  deliveries: DeliveryStore;
  gifts: GiftStore;
  mailer: ReportMailer;
  signer: DownloadSigner;
}

export interface DeliverReportInput {
  email: string;
  kind: DeliveryKind;
  // The stored PDF (lib/server/report-storage.ts), by
  // the key and file name generation gave it.
  pdfKey: string;
  fileName: string;
  homeTitle: string;
  homeAddressLine: string;
  orderRef?: string | null;
  // The public origin the emailed links are built on
  // (lib/server/public-url.ts's publicOriginOf).
  origin: string;
  now?: Date;
}

export interface DeliverReportOutcome {
  delivery: DeliveryRecord;
  downloadUrl: string;
  mail: ReportMailResult;
}

export type ReissueOutcome =
  // The presented link was never genuine: the caller
  // serves the error page, and no other answer exists.
  | { kind: "invalid" }
  // The request has been answered. `sent` says whether
  // a fresh link actually went out (the entered address
  // was the delivery's own and the mailer sent it) —
  // the route's on-screen answer is the uniform sent
  // page either way, so this distinction never reaches
  // the visitor; it is the caller's log line.
  | { kind: "answered"; sent: boolean };

export interface ReportDeliveryService {
  deliverReport(input: DeliverReportInput): Promise<DeliverReportOutcome>;
  reissueDownloadLink(input: {
    token: string;
    email: string;
    origin: string;
    now?: Date;
  }): Promise<ReissueOutcome>;
}

export function createReportDeliveryService(deps: ReportDeliveryDeps): ReportDeliveryService {
  return {
    async deliverReport(input) {
      const now = input.now ?? new Date();
      // D21: the gift is issued on a PAID delivery
      // alone, exactly once, at delivery — a free
      // window delivery and a gifted delivery issue
      // nothing, and their emails carry no gift block.
      const gift =
        input.kind === "paid"
          ? await deps.gifts.issue({
              buyerEmail: input.email,
              orderRef: input.orderRef ?? null,
              now,
            })
          : null;
      const delivery = await deps.deliveries.record({
        email: input.email,
        kind: input.kind,
        pdfKey: input.pdfKey,
        fileName: input.fileName,
        homeTitle: input.homeTitle,
        homeAddressLine: input.homeAddressLine,
        gift,
        orderRef: input.orderRef ?? null,
        now,
      });
      const { token } = deps.signer.mint(delivery.id, now);
      const downloadUrl = `${input.origin}${downloadPath(token)}`;
      const email = deliveryEmail({
        homeTitle: delivery.homeTitle,
        homeAddressLine: delivery.homeAddressLine,
        downloadUrl,
        giftClaimUrl: gift ? `${input.origin}${giftClaimPath(gift.token)}` : null,
      });
      const mail = await deps.mailer.sendDeliveryEmail({ to: delivery.email, email });
      return { delivery, downloadUrl, mail };
    },

    async reissueDownloadLink(input) {
      const now = input.now ?? new Date();
      const verification = deps.signer.verify(input.token, now);
      if (verification.kind === "invalid") return { kind: "invalid" };
      const delivery = await deps.deliveries.getById(verification.deliveryId);
      if (decideReissue(delivery, normaliseEmail(input.email)) !== "send" || !delivery) {
        return { kind: "answered", sent: false };
      }
      // A fresh token over the same delivery: the old
      // link is not revoked, shortened or extended — it
      // dies on its own seventh day, and this one starts
      // its own seven days now. The report behind both
      // never expires, so a delivery of any age can be
      // re-issued, any number of times.
      const { token } = deps.signer.mint(delivery.id, now);
      const email = reissueEmail({
        homeTitle: delivery.homeTitle,
        homeAddressLine: delivery.homeAddressLine,
        downloadUrl: `${input.origin}${downloadPath(token)}`,
      });
      const mail = await deps.mailer.sendReissueEmail({ to: delivery.email, email });
      return { kind: "answered", sent: mail.sent };
    },
  };
}

// The environment's service: the database stores, the
// environment's mailer, and K16's signer. Without the
// signing secret there is no service — no link can be
// minted or verified — and the factory answers null,
// which the routes read as "every link is
// not-recognised" and M9 will read as not-configured.
export function getReportDeliveryService(): ReportDeliveryService | null {
  const signer = getDownloadSigner();
  if (!signer) return null;
  const pool = getDbPool();
  return createReportDeliveryService({
    deliveries: createDbDeliveryStore(pool),
    gifts: createDbGiftStore(pool),
    mailer: getReportMailer(),
    signer,
  });
}
