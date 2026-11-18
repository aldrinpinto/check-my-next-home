// M7.1 — binary site assets are carried in the repository as
// base64 text (.b64), because the project's push route moves text
// files only — the same convention the data fixtures use (for
// example tests/fixtures/os-greenspace/opgrsp_gb.gpkg.b64, which
// its loader decodes when it runs). Site binaries have no loader,
// so the build decodes them instead: this script runs as the
// "prebuild" (and "predev") npm hook and writes each real binary
// next to its .b64 source, where Next.js and the static export
// expect it. The decoded files are build artefacts — .gitignore
// lists them, and only the .b64 sources are ever committed.
//
// The manifest is exported so the kit's tests
// (tests/look-feel-kit.test.ts) can hold every pair honest:
// each .b64 must exist, decode, and carry the right file magic.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const BINARY_ASSETS = [
  // The classic favicon (Next.js app/ file convention).
  { source: "app/favicon.ico.b64", target: "app/favicon.ico" },
  // The PNG icon (the pack's 48px favicon) beside app/icon.svg.
  { source: "app/icon.png.b64", target: "app/icon.png" },
  // The Apple touch icon (the pack's 180px icon; iOS reads PNG only).
  { source: "app/apple-icon.png.b64", target: "app/apple-icon.png" },
  // The Open Graph card (1200x630, composed at M7.1 from the pack).
  { source: "public/og-image.png.b64", target: "public/og-image.png" },
  // The Sample report's two location maps (M7.8) were
  // removed 18 Nov 2026 with the sample-report
  // anonymisation: the maps depicted a real locality, so
  // the page now draws neutral schematic panels instead
  // and the image assets are no longer carried or served.
  // The self-hosted typefaces (D70, R1): Newsreader (display)
  // and DM Sans (text/UI), latin subsets from the Fontsource
  // packages (@fontsource/newsreader, @fontsource/dm-sans —
  // both SIL Open Font License 1.1), decoded to public/fonts/
  // where app/globals.css's @font-face rules point.
  {
    source: "public/fonts/newsreader-latin-600-normal.woff2.b64",
    target: "public/fonts/newsreader-latin-600-normal.woff2",
  },
  {
    source: "public/fonts/newsreader-latin-700-normal.woff2.b64",
    target: "public/fonts/newsreader-latin-700-normal.woff2",
  },
  {
    source: "public/fonts/dm-sans-latin-400-normal.woff2.b64",
    target: "public/fonts/dm-sans-latin-400-normal.woff2",
  },
  {
    source: "public/fonts/dm-sans-latin-600-normal.woff2.b64",
    target: "public/fonts/dm-sans-latin-600-normal.woff2",
  },
  {
    source: "public/fonts/dm-sans-latin-700-normal.woff2.b64",
    target: "public/fonts/dm-sans-latin-700-normal.woff2",
  },
  {
    source: "public/fonts/dm-sans-latin-800-normal.woff2.b64",
    target: "public/fonts/dm-sans-latin-800-normal.woff2",
  },
  {
    source: "public/fonts/dm-sans-latin-900-normal.woff2.b64",
    target: "public/fonts/dm-sans-latin-900-normal.woff2",
  },
];

export function decodeBase64Text(text) {
  return Buffer.from(text.replace(/\s+/g, ""), "base64");
}

export function materialiseBinaryAssets(root = REPO_ROOT) {
  const written = [];
  for (const { source, target } of BINARY_ASSETS) {
    const bytes = decodeBase64Text(readFileSync(join(root, source), "utf8"));
    writeFileSync(join(root, target), bytes);
    written.push(target);
  }
  return written;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  for (const target of materialiseBinaryAssets()) {
    console.log(`materialised ${target}`);
  }
}
