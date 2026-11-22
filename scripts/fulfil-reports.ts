// The fulfilment worker's runner (plan step M9.6;
// ruling R2, 22 Nov 2026) — the thin shell over
// lib/server/fulfilment.ts's service.
//
// WHY A SEPARATE PROCESS: the PDF generator composes
// the report with react-dom/server, which the web
// route graph bans, and the app container carries no
// Chromium to print with (OBS-011) — the server HOST
// has one, and every proof PDF to date was printed on
// the host through this same code. So fulfilment runs
// here, outside the app: the webhook receiver claims,
// this worker fulfils — compose (checkReport →
// buildReportView), print and store (storeReportPdf,
// the one pinned rendering path), deliver
// (deliverReport), redeem the gift where the claim is
// a gifted one, and record the delivery in the journey
// counting. One pass drains the waiting claims (oldest
// first, bounded); schedule it as often as the queue
// deserves — a systemd timer or a cron line every
// minute is the standing shape:
//
//   * * * * * cd ~/check-my-next-home && npx -y tsx scripts/fulfil-reports.ts
//
// It runs under tsx, the same runner the door-check
// proof generation uses on the host, because it imports
// the app's TypeScript (and its TSX) directly — there
// is deliberately no second, compiled copy of the
// fulfilment path for this script to drift from.
//
// THE ENTRY'S SHAPE (BUG-107, found at the M9.6
// deploy): the run lives inside main() and the module
// runs it ONLY when the file is executed directly —
// never on import. The first cut's top-level await
// died under tsx before anything ran: the repo carries
// no "type": "module", so tsx transforms this entry to
// CommonJS, whose output format has no top-level
// await. The wrap costs nothing and the guard test
// (tests/fulfil-reports-entry.test.ts) holds both
// halves: importing this module is side-effect-free,
// and the direct invocation starts like a normal
// program. The worker wiring itself is imported
// dynamically inside main() for the same reason — an
// import of this module must not drag the PDF
// machinery (react-dom/server and all) behind it.
//
// Usage: npx -y tsx scripts/fulfil-reports.ts [--limit N]
// Environment: the server's own .env.local / .env
// (DATABASE_URL, the signing secret, the mailer and
// storage configuration — the delivery service's own
// environment), plus APP_ORIGIN for the delivery
// email's links (default the site's own URL).

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

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  loadEnvLocal();

  const limitArg = argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number.parseInt(argv[limitArg + 1] ?? "10", 10) : 10;

  const { getFulfilmentService } = await import("../lib/server/fulfilment-worker");
  const service = getFulfilmentService();
  const result = await service.runPending(Number.isFinite(limit) && limit > 0 ? limit : 10);
  console.log(
    `fulfil-reports: processed ${result.processed}, fulfilled ${result.fulfilled}, failed ${result.failed}`,
  );
  return 0;
}

// Executed directly (the cron line, the timer, a hand
// run) the module runs its pass; imported (a test, a
// tool) it does nothing at all.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(
        `fulfil-reports: ${error instanceof Error ? error.message : "the worker run failed"}`,
      );
      process.exit(1);
    },
  );
}
