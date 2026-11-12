# Check My Next Home

Your family's next home — check what the listing doesn't tell you.

A one-page property checker for UK home movers: enter a postcode and get the
facts a listing leaves out — schools, flooding, crime counts, sold prices,
broadband, leasehold basics and more — with a detailed report per home.

## Layout

- `app/` — the pages (Next.js App Router)
- `lib/` — the brain: shared check logic
- `loaders/` — the fact fetchers: one per data source, loading the database
- `tests/` — automated checks, including the two golden test homes

## Run it locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## House rules

- No scraping of property portals, ever. The future browser extension reads
  only the listing page its user already has open.
- Secrets never live in this repo: real values go in `.env.local` (see
  `.env.example` for the shopping list, blanks only).
