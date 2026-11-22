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
// Usage: npx -y tsx scripts/fulfil-reports.ts [--limit N]
// Environment: the server's own .env.local / .env
// (DATABASE_URL, the signing secret, the mailer and
// storage configuration — the delivery service's own
// environment), plus APP_ORIGIN for the delivery
// email's links (default the site's own URL).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getFulfilmentService } from "../lib/server/fulfilment-worker";

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

loadEnvLocal();

const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number.parseInt(process.argv[limitArg + 1] ?? "10", 10) : 10;

const service = getFulfilmentService();
const result = await service.runPending(Number.isFinite(limit) && limit > 0 ? limit : 10);
console.log(
  `fulfil-reports: processed ${result.processed}, fulfilled ${result.fulfilled}, failed ${result.failed}`,
);
process.exit(0);
