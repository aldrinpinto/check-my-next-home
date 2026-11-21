import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { chromium } from "@playwright/test";

import ReportPage from "../../components/ReportPage";
import { reportPdfFileName, reportPdfFooterHtml, reportPdfKey } from "../report-pdf";
import type { ReportView } from "../report";
import { SITE_URL } from "../site";
import { getReportPdfStore, type ReportPdfStore } from "./report-storage";

// The PDF twin's generator (plan step M8.4, prep points
// 1 and 7): the real report page, printed. The document
// below is the served page's own composition — the
// ReportPage component rendering the same ReportView
// snapshot, inside the site-pages wrapper the Sample
// report page uses, under the app's own stylesheet
// (app/globals.css, whose @media print rules are the
// twin's print stylesheet) — handed to Chromium's
// print-to-PDF, the same engine the e2e suite drives.
// Nothing is re-derived here: the view arrives whole,
// and this module only prints and names it.
//
// The purchase trigger that calls this is M9's wiring;
// M8.6's download links will serve the stored file this
// module writes. Generation launches a fresh browser
// per call — a bought report is a rare, deliberate
// event, and the seam is this function, not the browser.

export interface GeneratedReportPdf {
  fileName: string;
  bytes: Uint8Array;
}

export interface StoredReportPdf extends GeneratedReportPdf {
  key: string;
  stored: boolean;
  reason: string | null;
}

// The print stylesheet for a standalone document: the
// app's globals.css with its self-hosted fonts inlined
// as data URIs, so the printed document carries the
// report's own typefaces without a server to fetch
// them from. A font file that cannot be read keeps its
// URL (the print falls back to the page's serif/sans
// stack) — a missing typeface must never fail a report.
export async function reportPrintCss(rootDir: string = process.cwd()): Promise<string> {
  const css = await readFile(join(rootDir, "app", "globals.css"), "utf8");
  const fontRefs = new Set([...css.matchAll(/url\("(\/fonts\/[^"]+)"\)/g)].map((m) => m[1]));
  let out = css;
  for (const ref of fontRefs) {
    try {
      let bytes: Buffer;
      try {
        bytes = await readFile(join(rootDir, "public", ref));
      } catch {
        // The repository stores the fonts base64-wrapped
        // (public/fonts/*.woff2.b64, decoded at build time by
        // scripts/materialise-binary-assets.mjs); a clean
        // checkout — CI's test run, a fresh clone — has only
        // that stored form, so decode it here rather than
        // silently serving the URL form.
        const wrapped = await readFile(join(rootDir, "public", `${ref}.b64`), "utf8");
        bytes = Buffer.from(wrapped.replace(/\s+/g, ""), "base64");
      }
      out = out
        .split(`url("${ref}")`)
        .join(`url("data:font/woff2;base64,${bytes.toString("base64")}")`);
    } catch {
      // Keep the URL form; see the header.
    }
  }
  return out;
}

// The full printed document for a view: the page the
// buyer would see, composed exactly as app/sample-
// report/page.tsx composes its document — the chrome
// (header/footer) is the layout's, not the page's, and
// the print stylesheet removes it in any case.
export function reportPrintDocument(view: ReportView, css: string): string {
  const markup = renderToStaticMarkup(createElement(ReportPage, { view }));
  return (
    `<!doctype html>\n<html lang="en-GB"><head><meta charset="utf-8">` +
    // The document's base (BUG-103): the printed report
    // is handed to Chromium as a string with no URL of
    // its own, so the report's own links (the How-we-
    // check pages, the Sources records) would resolve
    // against nothing and print as dead text. The base
    // makes every relative href absolute against the
    // site's own address, so Chromium emits real link
    // annotations for the label anchors and for the
    // printed URLs beside them.
    `<base href="${SITE_URL}/">` +
    `<title>${view.masthead.brandLine} — ${view.masthead.title}</title>` +
    `<style>${css}</style></head><body>` +
    `<main class="site-pages"><div class="site-pages__inner">${markup}</div></main>` +
    `</body></html>`
  );
}

// Print one report view to a PDF file's bytes, named
// for the home. A4, the @page margins the print
// stylesheet declares, backgrounds printed (the brand
// and chart colours are content), and the M8.4 footer
// on every page.
export async function generateReportPdf(
  view: ReportView,
  postcode: string,
): Promise<GeneratedReportPdf> {
  const css = await reportPrintCss();
  const html = reportPrintDocument(view, css);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: reportPdfFooterHtml(view, postcode),
      margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
    });
    return { fileName: reportPdfFileName(view, postcode), bytes: new Uint8Array(pdf) };
  } finally {
    await browser.close();
  }
}

// Generate and store one report: the file the delivery
// and re-send paths serve. A storage failure answers
// stored: false with its reason — the generated bytes
// still return, so the caller can say honestly what
// exists and what does not.
export async function storeReportPdf(
  view: ReportView,
  postcode: string,
  homeKey: string | null,
  store: ReportPdfStore = getReportPdfStore(),
): Promise<StoredReportPdf> {
  const generated = await generateReportPdf(view, postcode);
  const key = reportPdfKey(postcode, homeKey);
  const result = await store.put(key, generated.bytes);
  return {
    ...generated,
    key,
    stored: result.stored,
    reason: result.stored ? null : result.reason,
  };
}
