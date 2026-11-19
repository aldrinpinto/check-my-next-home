// The journey events prune (plan step M7.14) — the named
// retention job: raw journey events are kept 13 months
// and no longer; aggregates (the digests, the alert
// memory) are kept indefinitely and are NOT touched
// here.
//
// The predicate below is the retention line, word for
// word the one db/prove.mjs proves against the table:
// an event is pruned when its moment is older than
// 13 months. Run monthly at launch operations (M12);
// safe to run at any time — a second run deletes
// nothing the first one left behind.
//
// Usage:
//   node scripts/prune-journey-events.mjs             prune
//   node scripts/prune-journey-events.mjs --dry-run   count only
//
// Environment: DATABASE_URL (process, or .env.local /
// .env beside the repo root when unset).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const PRUNE_PREDICATE = "occurred_at < now() - interval '13 months'";

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

async function main() {
  loadEnvLocal();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("prune-journey-events: DATABASE_URL is not set — see .env.local (Key K6).");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const pool = new pg.Pool({ connectionString });
  try {
    if (dryRun) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM journey_events WHERE ${PRUNE_PREDICATE}`,
      );
      console.log(
        `prune-journey-events: dry run — ${rows[0].n} events sit past the 13-month line; nothing deleted.`,
      );
      return;
    }
    const result = await pool.query(`DELETE FROM journey_events WHERE ${PRUNE_PREDICATE}`);
    console.log(
      `prune-journey-events: deleted ${result.rowCount ?? 0} events past the 13-month line.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`prune-journey-events: failed — ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
