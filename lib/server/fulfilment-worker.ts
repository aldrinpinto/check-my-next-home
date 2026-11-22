// The fulfilment worker's production wiring (plan step
// M9.6) — the ONE place the worker's heavy machinery is
// assembled: the database claim store, the door's
// resolution ladder, the twin's rendering path
// (checkReport → buildReportView → storeReportPdf) and
// M8.6's delivery service.
//
// This module lives apart from lib/server/fulfilment.ts
// on purpose: it imports lib/server/report-pdf.ts,
// which composes with react-dom/server — banned from
// the web route graph, as the build itself enforces.
// The routes import only the claim stores, the webhook
// processing and the seam factories from fulfilment.ts;
// this wiring is imported solely by
// scripts/fulfil-reports.ts, the worker's runner, which
// runs outside the app entirely (ruling R2).

import type { AddressResolution } from "../address";
import { buildReportView, type ReportView } from "../report";
import { SITE_URL } from "../site";
import { getDbPool } from "./db";
import {
  createDbFulfilmentClaimStore,
  createFulfilmentService,
  type FulfilmentClaim,
} from "./fulfilment";
import { createDbGiftStore } from "./gifts";
import { recordJourneyEvent } from "./journey-events";
import { getReportDeliveryService } from "./report-delivery";
import { storeReportPdf } from "./report-pdf";
import { checkReport, resolutionForRoute } from "./serve";

// The door's own resolution ladder, shared with the
// payment seam: a key the directory no longer holds
// falls back to the postcode's form, never a guessed
// home.
async function resolveForFulfilment(
  postcode: string,
  homeKey: string | null,
): Promise<AddressResolution | null> {
  let resolution = await resolutionForRoute(postcode, homeKey).catch(() => null);
  if (!resolution && homeKey) {
    resolution = await resolutionForRoute(postcode, null).catch(() => null);
  }
  if (!resolution || (resolution.rung !== 1 && resolution.rung !== 2)) return null;
  return resolution;
}

// Compose and store one report for a claim — the twin's
// own path, exactly as the tests pin storeReportPdf.
async function buildPdfForClaim(
  resolution: AddressResolution,
  claim: FulfilmentClaim,
): Promise<{ pdfKey: string; fileName: string; homeTitle: string; homeAddressLine: string }> {
  const bundles = await checkReport(resolution);
  const view: ReportView = buildReportView({ resolution, ...bundles, now: new Date() });
  const stored = await storeReportPdf(view, claim.postcode, claim.homeKey);
  if (!stored.stored) throw new Error(`pdf-not-stored: ${stored.reason ?? "unknown"}`);
  return {
    pdfKey: stored.key,
    fileName: stored.fileName,
    homeTitle: view.masthead.title,
    homeAddressLine: view.masthead.addressLine ?? view.masthead.title,
  };
}

export function getFulfilmentService(): ReturnType<typeof createFulfilmentService> {
  const pool = getDbPool();
  const claims = createDbFulfilmentClaimStore(pool);
  const deliveryService = getReportDeliveryService();
  const gifts = createDbGiftStore(pool);
  return createFulfilmentService({
    claims,
    resolve: resolveForFulfilment,
    buildPdf: buildPdfForClaim,
    deliver: deliveryService ? (input) => deliveryService.deliverReport(input) : null,
    redeemGift: (token, at) => gifts.markRedeemed(token, at),
    recordDelivered: () => {
      void recordJourneyEvent(pool, { event: "report_delivered", routePattern: "/report" });
    },
    origin: process.env.APP_ORIGIN ?? SITE_URL,
  });
}
