// The sample report's bake (BUG-170): generate the
// sample view ONCE per deploy and write it where the
// serving seam reads it (lib/server/sample-report.ts's
// BAKED_SAMPLE_REPORT_PATH), so /sample-report serves
// a finished view instead of regenerating the merged
// bundles live on the first hit after every restart —
// the live generation was 28.7 MB of page and ~13 s of
// wait, measured on the play server, 23 Nov 2026.
//
// WHY AT CONTAINER START, NOT IMAGE BUILD: generation
// reads the filed data through the real pipeline, and
// the image build has no database (CI builds without
// one). The Dockerfile's start command runs this bake
// first and starts the server regardless of its
// outcome: a failed bake leaves the seam on live
// generation — today's behaviour — never a down site.
//
// The printed date on the baked page is the bake's own
// day (the generation composes at the real moment, as
// it always did); the founder accepted that
// consequence with the fix (23 Nov 2026). The
// SAMPLE_REPORT_NOW seam is untouched: the seam never
// reads the bake while the pin is set, and the e2e
// harness never runs this script.
//
// THE ENTRY'S SHAPE (BUG-107): the run lives inside
// main() and the module runs it ONLY when executed
// directly — never on import — for the same reason
// scripts/fulfil-reports.ts does (tsx transforms this
// entry to CommonJS; a top-level await would die
// before anything ran).
//
// Usage: npx -y tsx scripts/bake-sample-report.ts
// Environment: the server's own .env.local / .env
// (DATABASE_URL and the serving pipeline's own
// configuration).

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function loadEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const path = join(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

export async function main(): Promise<number> {
  loadEnvLocal();

  const { generateSampleReportView, BAKED_SAMPLE_REPORT_PATH } =
    await import("../lib/server/sample-report");
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const view = await generateSampleReportView();
  const json = JSON.stringify(view);
  await mkdir(dirname(BAKED_SAMPLE_REPORT_PATH), { recursive: true });
  await writeFile(BAKED_SAMPLE_REPORT_PATH, json);
  console.log(
    `bake-sample-report: wrote the sample view (${json.length} chars) to ${BAKED_SAMPLE_REPORT_PATH}`,
  );
  return 0;
}

// Executed directly (the container's start command, a
// hand run) the module bakes; imported (a test, a
// tool) it does nothing at all.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(
        `bake-sample-report: ${error instanceof Error ? error.message : "the bake failed"}`,
      );
      process.exit(1);
    },
  );
}
