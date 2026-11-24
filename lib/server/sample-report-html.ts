// BUG-219: the sample report's pre-rendered body. The
// bake (scripts/bake-sample-report.ts) renders the page's
// body once per deploy from the baked view and writes it
// beside the view JSON; the page then serves that HTML
// verbatim instead of re-rendering the whole 10-section
// document on every hit. The body is the children of
// div.site-pages__inner only — the layout, header, footer
// and head still render per hit, exactly as today — so the
// served document is byte-identical to the live render
// (pinned in tests/sample-report-baked.test.ts), and the
// visual guard photographs the same page either way.
//
// The render itself lives in lib/server/sample-report-render.ts,
// NOT here: the render imports react-dom/server, and
// Next's bundler refuses react-dom/server anywhere in a
// Server Component's import graph (the build fails with
// "You're importing a component that imports
// react-dom/server"). This module is the page-facing seam
// only — file reads, no rendering — so the page can
// import it safely.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The baked body's home, beside the baked view's
// (BAKED_SAMPLE_REPORT_PATH, lib/server/sample-report.ts).
// The directory is gitignored — the bake is a deploy
// artefact, never a committed one.
export const BAKED_SAMPLE_REPORT_HTML_PATH = join(
  process.cwd(),
  "baked",
  "sample-report-body.html",
);

// The baked body, when one stands. Two cases never read
// it — the same two as the view seam: the harness's
// SAMPLE_REPORT_NOW seam is set (the pinned moment must
// be composed live, exactly as the seam has always worked
// — the e2e harness never bakes, and even a stray bake
// file must not shadow the pin), and any read failure (a
// half-written or absent file falls back to the live
// render rather than failing the page; the next deploy's
// bake replaces it). The pin is checked on every call,
// before the cached read: the environment never changes
// under a running process, but a stale pin must never
// serve a baked body. The file itself never changes
// under a running process (the bake runs once per deploy,
// before the server starts), so the read is cached per
// process.
let cached: Promise<string | null> | null = null;

export function getSampleReportBody(): Promise<string | null> {
  if (process.env.SAMPLE_REPORT_NOW) return Promise.resolve(null);
  if (!cached) {
    cached = (async () => {
      try {
        return await readFile(BAKED_SAMPLE_REPORT_HTML_PATH, "utf8");
      } catch {
        return null;
      }
    })();
  }
  return cached;
}
