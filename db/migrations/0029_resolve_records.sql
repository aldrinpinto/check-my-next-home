-- Migration 0029 — transient resolve records (entry-point
-- build, 18 Nov 2026; decision D72, gap-check item 3).
--
-- A home resolved only through Postio (the hybrid's
-- backstop) has no filed row, so the product's identity
-- system — which re-derives every home from filed data on
-- every request — cannot carry it: a refresh, a shared
-- link or the checking screen's own calls would bounce to
-- the picker. The founder ruled the answer on 18 Nov 2026:
-- a TRANSIENT resolve record — a random token carried in
-- the URL where home= sits, holding the resolved address
-- parts, with a 24-hour TTL and automatic expiry. The
-- founder rules explicitly that this short-lived,
-- single-purpose, self-deleting record sits INSIDE the
-- "Postio results are never stored in our database" line:
-- that line bars an address database or file, not a
-- resolve record that exists only to carry one visitor's
-- pick through their check and deletes itself a day later.
--
-- One row per pick, written only when a visitor actually
-- picks a Postio-only home (never for a list, never for a
-- suggestion — lists are served and forgotten). `parts`
-- holds exactly the filed-parts shape (postcode, paon,
-- saon, street, locality, town) so the record's home is
-- interchangeable with a filed home everywhere downstream;
-- `udprn` is Postio's own delivery-point id, kept so the
-- record can be traced back to the call that made it.
-- Expiry is enforced on read (an expired row is deleted on
-- sight and the route falls back to its honest stale-key
-- behaviour) and swept opportunistically on write; the
-- expires_at index serves both. When the picked home is
-- later filed locally (the check's own cold loads), the
-- record is deleted early — promotion — and the canonical
-- home key takes over the URL.

CREATE TABLE resolve_records (
  token text PRIMARY KEY,
  postcode text NOT NULL,
  parts jsonb NOT NULL,
  udprn text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX resolve_records_expires_at_idx ON resolve_records (expires_at);
