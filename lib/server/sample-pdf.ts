import { chromium } from "@playwright/test";

import { sampleReportPdfFileName, sampleReportPdfFooterHtml } from "../report-pdf";
import { reportFooterFontCss } from "./footer-font";

// The sample report's PDF generator (plan step M8.8):
// the sample, printed. Where the bought twin
// (lib/server/report-pdf.ts) prints a ReportView
// snapshot composed to a string, the sample's PDF is
// printed from the app's own print view of the sample
// page — app/sample-report/print, a Server Component
// composing the sample cover (the SAMPLE marking, the
// name and tagline paired, the example home, the
// invented-example line) ahead of the sample page's own
// document — for two reasons of architecture:
//
//   - A route handler's module graph cannot render
//     markup to a string in this codebase's Next/
//     Turbopack setup (react-dom/server is banned
//     there); composition belongs to a Server
//     Component, and this generator only prints.
//   - The document printed is therefore the very
//     composition the site serves — the PDF can never
//     drift from the sample page it downloads from.
//
// The print view is fetched over the app's own loopback
// address (127.0.0.1 on the app's port): the request
// never leaves the process's host, so it takes no
// public-edge round trip and meets no access wall (the
// play site's Cloudflare Access guards the public name,
// not the loopback). The print itself runs under the
// bought twin's settings — A4, backgrounds printed, the
// footer's template on every page.
//
// The sample never changes between requests, so the
// generated file is cached in memory per origin after
// the first print; a failed print is not cached, so the
// next attempt tries again. (Printing needs a Chromium
// beside the app: where none is installed — the app
// container today, OBS-011 — a print fails plainly
// rather than serving anything lesser.)
//
// BUG-270: the route no longer calls this generator on
// a visitor's request — the container has no Chromium,
// so every click failed with an empty 500. The file is
// printed ONCE per deploy, host-side, by
// scripts/bake-sample-report-pdf.ts (which prints the
// same print view with the host's Chromium and copies
// the file into the container), and the route serves
// that baked file (lib/server/sample-pdf-baked.ts).
// This module stays the printer — the script calls
// generateSampleReportPdf — and OBS-011 stays open
// for the M9 in-container purchase-trigger path.

export interface GeneratedSamplePdf {
  fileName: string;
  bytes: Uint8Array;
}

// The print view's address on the app's own loopback:
// the port the app itself listens on (PORT, else the
// Next default the image runs).
export function samplePrintUrl(origin?: string): string {
  const base = origin ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
  return `${base}/sample-report/print`;
}

async function printSampleReportPdf(origin?: string): Promise<GeneratedSamplePdf> {
  const footerFont = await reportFooterFontCss();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(samplePrintUrl(origin), { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: sampleReportPdfFooterHtml(footerFont),
      margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
    });
    return { fileName: sampleReportPdfFileName(), bytes: new Uint8Array(pdf) };
  } finally {
    await browser.close();
  }
}

const cache = new Map<string, Promise<GeneratedSamplePdf>>();

export function generateSampleReportPdf(origin?: string): Promise<GeneratedSamplePdf> {
  const key = samplePrintUrl(origin);
  let printing = cache.get(key);
  if (!printing) {
    printing = printSampleReportPdf(origin).catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, printing);
  }
  return printing;
}
