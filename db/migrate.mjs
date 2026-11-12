// Check My Next Home — the migration runner (plan step M3.5).
//
// Applies every not-yet-applied file in db/migrations, in number
// order, each inside its own transaction, and records it in the
// schema_migrations table. Running it again is a no-op. An applied
// migration is never edited — a change to the shelves is a new file.
//
// Usage:
//   npm run db:migrate           apply pending migrations
//   npm run db:migrate -- --status   list applied / pending only
//
// The connection string comes from DATABASE_URL (see .env.example,
// Key K6). Locally that is .env.local; in CI it is the workflow's
// throwaway test database.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

function listMigrations() {
  const seen = new Set();
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => {
      const match = FILE_PATTERN.exec(file);
      if (!match) {
        throw new Error(`Migration file "${file}" must be named NNNN_snake_case.sql`);
      }
      const version = Number.parseInt(match[1], 10);
      if (seen.has(version)) {
        throw new Error(`Duplicate migration number ${match[1]}`);
      }
      seen.add(version);
      return { version, file };
    })
    .sort((a, b) => a.version - b.version);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set — see .env.example (Key K6).");
  process.exit(1);
}

const statusOnly = process.argv.includes("--status");
const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await client.query("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.version));

  for (const migration of listMigrations()) {
    if (applied.has(migration.version)) {
      console.log(`${migration.file} — already applied`);
      continue;
    }
    if (statusOnly) {
      console.log(`${migration.file} — PENDING`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, migration.file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [
        migration.version,
        migration.file,
      ]);
      await client.query("COMMIT");
      console.log(`${migration.file} — applied`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
