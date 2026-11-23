import type { DeliveryRecord } from "../../lib/download";

// Download-link fixtures (plan step M8.6) — the
// throwaway signing secret (never a real value: K16's
// real secret lives only in the server's secret file,
// and nothing in this suite reads or needs it), the
// fixed clock the link maths runs against, and one
// delivery per kind, built the way the store writes
// them: email normalised, the dummy home's identity in
// the samples' forms (12 Willow Close, Millbrook
// MB3 4QX — the Final Sample Master's invented
// example, the same home the delivery email sample is
// drawn on).

export const DOWNLOAD_SECRET = "test-download-signing-secret-not-real";
export const DOWNLOAD_OTHER_SECRET = "test-download-signing-secret-other-one";

// The mailer suite's fixture fake for K11 — a made-up
// value, named as one; the real key lives only in the
// server's secret file and nothing here reads it.
export const RESEND_FIXTURE_KEY = "test-resend-key";

export const DOWNLOAD_NOW = new Date("2026-11-21T12:00:00.000Z");
export const DOWNLOAD_BUYER = "buyer@example.co.uk";
export const DOWNLOAD_ORIGIN = "https://play.checkmynexthome.co.uk";

export const DOWNLOAD_HOME_TITLE = "12 Willow Close";
export const DOWNLOAD_HOME_ADDRESS_LINE = "12 Willow Close, Millbrook MB3 4QX";
export const DOWNLOAD_PDF_KEY = "reports/MB34QX/12-willow-close.pdf";
export const DOWNLOAD_FILE_NAME = "Check My Next Home — 12 Willow Close MB3 4QX.pdf";

export function deliveryRecord(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
    email: DOWNLOAD_BUYER,
    kind: "paid",
    pdfKey: DOWNLOAD_PDF_KEY,
    fileName: DOWNLOAD_FILE_NAME,
    homeTitle: DOWNLOAD_HOME_TITLE,
    homeAddressLine: DOWNLOAD_HOME_ADDRESS_LINE,
    giftToken: null,
    orderRef: "order-fixture-1",
    createdAt: DOWNLOAD_NOW,
    withdrawnAt: null,
    withdrawnRefundId: null,
    ...overrides,
  };
}
