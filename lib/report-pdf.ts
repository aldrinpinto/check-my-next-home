import type { ReportView } from "./report";
import { SITE_NAME, SITE_URL } from "./site";

// The PDF twin (plan step M8.4) — the pure half: every
// string the PDF carries that is not already in the
// ReportView snapshot is derived here, from the snapshot
// and the report's identity, and pinned by
// tests/report-pdf.test.ts. The server half — printing
// the real report page through Chromium and storing the
// file — is lib/server/report-pdf.ts and
// lib/server/report-storage.ts.
//
// The adopted shape (founder, 20 Nov 2026, all seven
// points): the PDF prints the REAL report page (the same
// ReportView snapshot the page renders; nothing is
// re-derived or recomputed), under a print stylesheet
// (app/globals.css) that keeps cards, charts and the
// flood pictures whole across pages, drops the cream
// ground to white, and prints each Sources link's URL
// beside its name. A cover page carries the home's
// address and the facts date; every page's footer
// carries the address, "Page X of Y" and the standing
// line below. The file is named for the home.

// The footer's standing line, verbatim (prep point 3).
export const REPORT_PDF_FOOTER_LINE = "Facts, not scores";

// The postcode in its display form ("cm3  2jt" →
// "CM3 2JT") — the form the masthead and the file name
// both carry.
export function displayPostcode(postcode: string): string {
  return postcode.toUpperCase().replace(/\s+/g, " ").trim();
}

// The postcode in its compact form ("CM3 2JT" →
// "CM32JT") — the storage key's directory form.
export function compactPostcode(postcode: string): string {
  return displayPostcode(postcode).replace(/ /g, "");
}

// A file-name-safe form of a snapshot string: the
// characters Windows and macOS forbid in file names
// become dashes, and runs of space collapse. The golden
// names need none of this; it exists so a filed label
// can never break the download's name.
function fileNameSafe(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// The downloaded file's name (prep point 6), e.g.
// "Check My Next Home — 19 Birkdale Rise CM3 2JT.pdf".
// A whole-postcode report (rung 2) is titled by its
// postcode already, so the postcode is not repeated.
export function reportPdfFileName(view: ReportView, postcode: string): string {
  const pc = displayPostcode(postcode);
  const title = fileNameSafe(view.masthead.title);
  if (title.toUpperCase() === pc) return `${SITE_NAME} — ${pc}.pdf`;
  return `${SITE_NAME} — ${title} ${pc}.pdf`;
}

// The stored file's key — the address a re-send serves
// (M8.6/M9 read back through the same key). One report
// per home identity: the postcode's directory, then the
// home key (lib/bundle-cache.ts's homeKeyOf) in slug
// form, or "postcode" for a whole-postcode report.
export function reportPdfKey(postcode: string, homeKey: string | null): string {
  const home = homeKey
    ? homeKey
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : "";
  return `reports/${compactPostcode(postcode)}/${home || "postcode"}.pdf`;
}

// The cover page's content (prep point 3): the home's
// address and the facts date, taken from the masthead
// exactly as the snapshot carries them — the prepared
// line IS the report's facts date (the day the facts
// were prepared and checked), never re-derived here.
export interface ReportPdfCover {
  brandLine: string;
  title: string;
  addressLine: string | null;
  preparedLine: string;
}

export function reportPdfCover(view: ReportView): ReportPdfCover {
  const { masthead } = view;
  return {
    brandLine: masthead.brandLine,
    title: masthead.title,
    addressLine: masthead.addressLine,
    preparedLine: masthead.preparedLine,
  };
}

// The footer's address form: the home's name and
// postcode ("19 Birkdale Rise · CM3 2JT"); a
// whole-postcode report's title is its postcode, which
// stands alone.
export function reportPdfFooterAddress(view: ReportView, postcode: string): string {
  const pc = displayPostcode(postcode);
  const title = view.masthead.title;
  if (title.toUpperCase() === pc) return pc;
  return `${title} · ${pc}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The Chromium footer template (prep point 3): the
// address at the left, "Page X of Y" at the centre, the
// standing line at the right, on every page. Chromium
// fills the pageNumber/totalPages spans itself; the
// template must carry its own styling (it renders
// outside the page's CSS), in the report's muted ink.
export function reportPdfFooterHtml(view: ReportView, postcode: string): string {
  const address = escapeHtml(reportPdfFooterAddress(view, postcode));
  return (
    `<div style="width: 100%; padding: 0 14mm; display: flex; ` +
    `justify-content: space-between; align-items: baseline; ` +
    `font-family: 'DM Sans', Arial, sans-serif; font-size: 8pt; color: #5c6b60; ` +
    `-webkit-print-color-adjust: exact;">` +
    `<span>${address}</span>` +
    `<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>` +
    `<span>${REPORT_PDF_FOOTER_LINE}</span>` +
    `</div>`
  );
}

// The absolute form of a report link's URL for the
// printed Sources section (prep point 4): the web page
// keeps its linked names; the PDF prints the URL beside
// each name. External URLs stand as they are; the
// site's own paths gain the site's address (SITE_URL),
// so a reader with the paper copy can type the whole
// thing.
export function reportPrintUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `${SITE_URL}${href}`;
  return href;
}
