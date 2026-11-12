# Database — migrations and proof

The fact store is PostgreSQL + PostGIS (see `docker-compose.yml` for
the recipe and `docs/schema.md` for what lives where).

## Apply the schema

```bash
npm run db:migrate
```

This runs every not-yet-applied file in `db/migrations/`, in number
order, each inside its own transaction, and records it in the
`schema_migrations` table. Running it again is a no-op. To see what
is applied and what is pending without changing anything:

```bash
npm run db:migrate -- --status
```

The connection string comes from `DATABASE_URL` (see `.env.example`,
Key K6). Locally that is the `.env.local` file; an applied migration
is never edited afterwards — a change to the shelves is a new file
named `NNNN_snake_case.sql` with the next number.

## Prove the map brain

```bash
npm run db:prove
```

Checks, against the real database: PostGIS is on, all 20 shelves
exist, a nearest-point query returns the right nearest point at a
sane distance, and a point-in-polygon query finds the flood shape
covering a point (and excludes one it should not). All test rows are
inserted inside a transaction that is rolled back, so the proof
leaves no trace. CI runs the migrations (twice — the second run must
be a no-op) and then this proof on every push, using a throwaway
test database whose password exists only inside that CI run. The
real database password (Key K6) is never used in CI.
