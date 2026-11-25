// The sample report PDF's bake (BUG-270): print the
// sample PDF ONCE per deploy, host-side, and place the
// file where the container's route serves it
// (lib/server/sample-pdf-baked.ts's
// BAKED_SAMPLE_REPORT_PDF_PATH).
//
// WHY HOST-SIDE, NOT IN THE CONTAINER: the print needs
// Chromium, and the app container has none (OBS-011) —
// the play server HOST has one (the fulfilment worker
// prints with it every minute), so this script runs on
// the host, after the app container answers, as a step
// of the deploy sequence — right after the deploy's
// app-answers check. It prints the app's own print
// view (/sample-report/print) over the loopback
// address, exactly as the old live route did, and
// copies the file into the container (docker cp to a
// temp name, then an atomic rename inside the
// container), so a concurrent read never sees a
// half-written file. It also writes the same file to
// the checkout's own baked/ directory (gitignored):
// that copy is what a local dev server serves, and a
// record of the last printed file on the host.
//
// The container-start bake (scripts/bake-sample-report.ts)
// still writes the view and the body; this script runs
// after it, once the server is up — the print view is
// a page the server serves, so the server must be
// answering before this script can print it. If the
// print view never answers, or the print or the copy
// fails, the script exits non-zero and the route keeps
// answering 503 until the step is re-run — never a
// half-baked file, never a silent live print.
//
// Usage (on the play server, from the checkout, after
// the app answers):
//   set -a; source /home/ubuntu/check-my-next-home/.env.local; set +a
//   npx -y tsx scripts/bake-sample-report-pdf.ts
// Local dev (no container): the same command with
// --local prints and writes the checkout's baked/
// copy only, and skips the docker copy.
// Environment: the server's own .env.local / .env
// (PORT, else 3000); the container name from
// CMNH_APP_CONTAINER, else cmnh-app.
//
// THE ENTRY'S SHAPE (BUG-107): the run lives inside
// main() and the module runs it ONLY when executed
// directly — never on import — for the same reason
// scripts/fulfil-reports.ts does (tsx transforms this
// entry to CommonJS; a top-level await would die
// before anything ran).

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

const CONTAINER = process.env.CMNH_APP_CONTAINER ?? "cmnh-app";
// The baked file's path as the container sees it: it
// must match BAKED_SAMPLE_REPORT_PDF_PATH
// (lib/server/sample-pdf-baked.ts) with the image's
// WORKDIR (/app) as the process's working directory.
const CONTAINER_BAKED_PDF_PATH = "/app/baked/sample-report.pdf";
const PRINT_WAIT_MS = 5 * 60_000;
const PRINT_POLL_MS = 5_000;

async function waitForPrintView(url: string): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not up yet — keep waiting until the cap.
    }
    if (Date.now() - started > PRINT_WAIT_MS) {
      throw new Error(
        `bake-sample-report-pdf: ${url} did not answer OK within ${PRINT_WAIT_MS / 1000}s`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, PRINT_POLL_MS));
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  loadEnvLocal();
  const localOnly = argv.includes("--local");

  const { generateSampleReportPdf, samplePrintUrl } = await import("../lib/server/sample-pdf");
  const { BAKED_SAMPLE_REPORT_PDF_PATH } = await import("../lib/server/sample-pdf-baked");

  const printUrl = samplePrintUrl();
  await waitForPrintView(printUrl);
  const { bytes } = await generateSampleReportPdf();

  // The checkout's own copy (gitignored): what a local
  // dev server serves, and the host's record of the
  // last printed file.
  await mkdir(dirname(BAKED_SAMPLE_REPORT_PDF_PATH), { recursive: true });
  await writeFile(BAKED_SAMPLE_REPORT_PDF_PATH, bytes);
  console.log(
    `bake-sample-report-pdf: wrote the sample PDF (${bytes.length} bytes) to ${BAKED_SAMPLE_REPORT_PDF_PATH}`,
  );

  if (!localOnly) {
    // Into the container, via a temp name and an atomic
    // rename, so the route never reads a half-written
    // file.
    const dir = await mkdtemp(join(tmpdir(), "sample-report-pdf-"));
    try {
      const tmpPdf = join(dir, "sample-report.pdf");
      await writeFile(tmpPdf, bytes);
      const tmpName = `.${basename(BAKED_SAMPLE_REPORT_PDF_PATH)}.tmp`;
      await execFileAsync("docker", ["cp", tmpPdf, `${CONTAINER}:/app/baked/${tmpName}`]);
      await execFileAsync("docker", [
        "exec",
        CONTAINER,
        "mv",
        `/app/baked/${tmpName}`,
        CONTAINER_BAKED_PDF_PATH,
      ]);
      console.log(
        `bake-sample-report-pdf: copied the sample PDF into ${CONTAINER}:${CONTAINER_BAKED_PDF_PATH}`,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  return 0;
}

// Executed directly (the deploy sequence, a hand run)
// the module bakes; imported (a test, a tool) it does
// nothing at all.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(
        `bake-sample-report-pdf: ${error instanceof Error ? error.message : "the bake failed"}`,
      );
      process.exit(1);
    },
  );
}
