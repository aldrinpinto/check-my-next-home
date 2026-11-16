# Check My Next Home

Check the house. Choose the home.

A one-page property checker for UK home movers: enter a postcode and get the
facts a listing leaves out — schools, flooding, crime counts, sold prices,
broadband, leasehold basics and more — with a detailed report per home.

## Layout

- `app/` — the pages (Next.js App Router)
- `lib/` — the brain: shared check logic
- `loaders/` — the fact fetchers: one per data source, loading the database
- `tests/` — automated checks, including the golden test homes

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Database (local)

The fact store is PostgreSQL + PostGIS, run from the recipe in
`docker-compose.yml` (plan step M3.1):

1. Put the database settings in `.env.local` (see `.env.example`, Key K6).
2. Start it: `docker compose --env-file .env.local up -d db`
3. Stop it: `docker compose --env-file .env.local down`

It listens on localhost only, and its data survives restarts in a named
volume.

The shelves themselves are versioned migrations in `db/migrations/`:
`npm run db:migrate` builds them (PostGIS included), and
`npm run db:prove` proves the map brain works. See `db/README.md` and
`docs/schema.md`.

## House rules

- No scraping of property portals, ever. The future browser extension reads
  only the listing page its user already has open.
- Secrets never live in this repo: real values go in `.env.local` (see
  `.env.example` for the shopping list, blanks only).
