import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The PDF footer template's own font (BUG-149(1),
// 22 Nov 2026): the Chromium header/footer template
// renders outside the printed page, so the page's
// inlined fonts never reach it and the footer's
// 'DM Sans' fell back to a system sans. The footer
// carries the report's DM Sans (400 — the footer's
// only weight) as its own @font-face data URI, read
// the same way reportPrintCss reads the fonts (the
// .b64 stored form on a clean checkout). An unreadable
// font answers "" — the footer renders in its fallback
// stack rather than failing the report.
//
// This helper stands alone (fs and path only) because
// its two callers live in different module graphs: the
// bought report's generator may import react-dom/server,
// the sample's may not.
export async function reportFooterFontCss(rootDir: string = process.cwd()): Promise<string> {
  const ref = "/fonts/dm-sans-latin-400-normal.woff2";
  try {
    let bytes: Buffer;
    try {
      bytes = await readFile(join(rootDir, "public", ref));
    } catch {
      const wrapped = await readFile(join(rootDir, "public", `${ref}.b64`), "utf8");
      bytes = Buffer.from(wrapped.replace(/\s+/g, ""), "base64");
    }
    return (
      `<style>@font-face { font-family: 'DM Sans'; ` +
      `src: url("data:font/woff2;base64,${bytes.toString("base64")}") format("woff2"); ` +
      `font-weight: 400; font-style: normal; }</style>`
    );
  } catch {
    return "";
  }
}
