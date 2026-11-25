// BUG-270: the sample report PDF's baked-file seam.
// The file is printed ONCE per deploy, host-side, by
// scripts/bake-sample-report-pdf.ts — the same print
// view the old live route printed, with the host's
// Chromium — and copied into the container's baked
// directory; the route serves that file. The bake
// writes it after the server starts (the print view is
// a page the server serves), so the route reads the
// file fresh on every request and never caches: a
// cached miss would stand until the next restart, and
// a fresh disk read of a file this size is cheap. A
// missing or unreadable file answers null — the route
// answers 503 plainly. It never falls back to a live
// print: there is no Chromium beside the app in the
// container (OBS-011), so a live print would fail
// identically, and the failure would be silent again.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The baked PDF's home, beside the baked view's
// (BAKED_SAMPLE_REPORT_PATH, lib/server/sample-report.ts)
// and the baked body's (BAKED_SAMPLE_REPORT_HTML_PATH,
// lib/server/sample-report-html.ts). The directory is
// gitignored — the bake is a deploy artefact, never a
// committed one.
export const BAKED_SAMPLE_REPORT_PDF_PATH = join(process.cwd(), "baked", "sample-report.pdf");

// The baked PDF, when one stands; null when none does.
export async function readBakedSampleReportPdf(): Promise<Buffer | null> {
  try {
    return await readFile(BAKED_SAMPLE_REPORT_PDF_PATH);
  } catch {
    return null;
  }
}
