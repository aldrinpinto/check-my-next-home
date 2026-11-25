// BUG-285 — the on-demand cold loaders' missing sibling.
//
// The three on-demand loader children (load-sold-prices,
// load-crime, load-epc) are spawned by their brains from
// `new URL("../loaders/load-*.mjs", import.meta.url)`.
// In the built app the bundler emits each loader as a raw
// asset under .next/server/assets/ — but it does NOT emit
// the sibling ./progress.mjs the loaders import, so the
// bundled child crashes on ERR_MODULE_NOT_FOUND and a
// cold postcode's sold prices (and crime, and EPC) stay
// "still being gathered" forever, with no stamp ever
// written. The scheduled/bulk jobs run the source files
// and are unaffected.
//
// This script runs as the "postbuild" npm hook: after
// `next build` it copies loaders/progress.mjs next to the
// emitted loader assets, under the exact name the loaders
// import (./progress.mjs — no hash). One copy serves all
// three loaders, because all three children run from the
// same assets directory.
//
// The script fails loudly when the assets directory or
// any of the three loader assets is missing, so a future
// bundler change breaks the build instead of silently
// re-breaking cold loads.
//
// progress.mjs stays the single source of truth — the
// copy is a build artefact, never a second source.

import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The on-demand loaders whose bundled assets need the
// sibling beside them (names without the hash the
// bundler appends).
export const ON_DEMAND_LOADERS = ["load-sold-prices", "load-crime", "load-epc"];

// The sibling every on-demand loader imports, under the
// exact name the import spells (no hash).
export const LOADER_SIBLING = "progress.mjs";

export function loaderAssetsDir(root = REPO_ROOT) {
  return join(root, ".next", "server", "assets");
}

export function copyLoaderSiblings(root = REPO_ROOT) {
  const assetsDir = loaderAssetsDir(root);
  if (!existsSync(assetsDir)) {
    throw new Error(
      `BUG-285: the on-demand loader assets directory is missing (${assetsDir}) — the build did not emit the loader children; refusing to guess where they went`,
    );
  }
  const emitted = readdirSync(assetsDir);
  const missing = ON_DEMAND_LOADERS.filter(
    (name) => !emitted.some((file) => file.startsWith(`${name}.`) && file.endsWith(".mjs")),
  );
  if (missing.length > 0) {
    throw new Error(
      `BUG-285: the build did not emit these on-demand loader assets in ${assetsDir}: ${missing.join(", ")} — refusing to copy the sibling beside assets that are not there`,
    );
  }
  const source = join(root, "loaders", LOADER_SIBLING);
  const target = join(assetsDir, LOADER_SIBLING);
  copyFileSync(source, target);
  return target;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const target = copyLoaderSiblings();
  console.log(`copied loaders/${LOADER_SIBLING} to ${target}`);
}
