// The visual guard's baselines (e2e/visual.e2e.ts) are
// carried in the repository as base64 text (.b64), like
// every binary in this project — the push route moves
// text files only (the same convention as
// scripts/materialise-binary-assets.mjs, whose hook is
// the site build; the snapshots' consumer is Playwright
// itself, so they decode here instead). This global
// setup runs before every Playwright invocation — the
// push gate, the scheduled cadence and a deliberate
// re-capture alike — and writes each real PNG next to
// its .b64 source when the decoded bytes differ from
// what is on disk. The decoded PNGs are artefacts:
// .gitignore lists them, and only the .b64 sources are
// ever committed. A baseline is re-approved deliberately,
// never automatically: re-capture in CI, review the
// photographs, commit the new .b64 sources.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SNAPSHOTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "visual.e2e.ts-snapshots");

export default async function materialiseSnapshots() {
  if (!existsSync(SNAPSHOTS_DIR)) return;
  for (const name of readdirSync(SNAPSHOTS_DIR)) {
    if (!name.endsWith(".png.b64")) continue;
    const bytes = Buffer.from(
      readFileSync(join(SNAPSHOTS_DIR, name), "utf8").replace(/\s+/g, ""),
      "base64",
    );
    const target = join(SNAPSHOTS_DIR, name.slice(0, -".b64".length));
    if (existsSync(target) && readFileSync(target).equals(bytes)) continue;
    writeFileSync(target, bytes);
  }
}
