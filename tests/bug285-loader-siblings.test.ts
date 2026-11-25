import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { copyLoaderSiblings, loaderAssetsDir } from "../scripts/copy-loader-siblings.mjs";

// BUG-285 — the on-demand cold loaders' missing sibling.
//
// What is pinned here:
//   (1) the postbuild copy puts loaders/progress.mjs
//       beside the emitted loader assets, byte for byte,
//       under the exact name the loaders import;
//   (2) a missing assets directory fails loudly instead
//       of silently leaving the sibling out;
//   (3) a missing loader asset fails loudly, naming
//       which one the build did not emit.
// The real proof — the bundled loader running for a
// cold postcode and stamping it — is the cold e2e spec
// (e2e/cold.e2e.ts), which runs against the built app.

async function fakeRoot(emitted: string[]) {
  const root = await mkdtemp(join(tmpdir(), "bug285-"));
  await mkdir(join(root, "loaders"), { recursive: true });
  await writeFile(join(root, "loaders", "progress.mjs"), "export const MARKER = 1;\n");
  const assets = loaderAssetsDir(root);
  await mkdir(assets, { recursive: true });
  for (const name of emitted) {
    await writeFile(join(assets, `${name}.deadbeef.mjs`), "// emitted loader\n");
  }
  return root;
}

describe("the postbuild copy puts progress.mjs beside the emitted loader assets (BUG-285)", () => {
  it("copies the sibling next to all three emitted loaders", async () => {
    const root = await fakeRoot(["load-sold-prices", "load-crime", "load-epc"]);
    try {
      const target = copyLoaderSiblings(root);
      expect(target).toBe(join(loaderAssetsDir(root), "progress.mjs"));
      expect(existsSync(target)).toBe(true);
      expect(await readFile(target, "utf8")).toBe("export const MARKER = 1;\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails loudly when the assets directory is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "bug285-"));
    try {
      await mkdir(join(root, "loaders"), { recursive: true });
      await writeFile(join(root, "loaders", "progress.mjs"), "export const MARKER = 1;\n");
      expect(() => copyLoaderSiblings(root)).toThrow(/assets directory is missing/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails loudly when a loader asset is missing, naming it", async () => {
    const root = await fakeRoot(["load-sold-prices", "load-epc"]);
    try {
      expect(() => copyLoaderSiblings(root)).toThrow(/did not emit.*load-crime/);
      expect(existsSync(join(loaderAssetsDir(root), "progress.mjs"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
