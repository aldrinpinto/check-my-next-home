-- Check My Next Home — migration 0036: the journey events
-- store (plan step M7.14, "Measure the journeys"; founder's
-- ruling 15 Nov 2026, error class D45 16 Nov 2026).
--
-- First-party counting ONLY: our own events on our own
-- stack. No analytics vendor, no cookies, no
-- fingerprinting, nothing third-party. The catalogue is
-- pinned in lib/journey-events.ts and mirrored in the
-- CHECK below — the two move together or not at all.
--
-- The no-address rule is structural here, not a promise:
-- there is no column that could hold an address, a full
-- postcode or an email. route_pattern holds the route
-- PATTERN ("/gift", "/search/home", "/check/[slug]"),
-- never a raw URL — results and claim URLs carry the
-- postcode, the address key and the gift token. The
-- payload scan in lib/journey-events.ts proves the rule
-- over everything that is stored, error messages
-- included.
--
-- dedupe_key carries the client's per-fire random key:
-- the partial unique index makes a retried post a no-op,
-- so browser counts stay honestly near-exact (M7.14
-- gap-check fold-in). Page-error rows carry no dedupe
-- key — each occurrence is a row, so the digest's error
-- counts are true counts; the ALERT is what is deduped
-- (journey_event_alerts below).
--
-- Retention: raw events are kept 13 months
-- (scripts/prune-journey-events.mjs is the named prune
-- job); aggregates — the digest's numbers and the alert
-- table — are kept indefinitely.

CREATE TABLE journey_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL CHECK (
    event IN (
      'page_view',
      'check_started',
      'check_completed',
      'shortlist_add',
      'shortlist_remove',
      'comparison_opened',
      'report_clicked',
      'checkout_started',
      'checkout_paid',
      'gift_claimed',
      'gift_redeemed',
      'page_error'
    )
  ),
  -- Phase 2's extension emits the same event class to the
  -- same endpoint; the surface column is the side-by-side
  -- split the digest reports. Only 'website' is written
  -- in Phase 1.
  surface text NOT NULL DEFAULT 'website' CHECK (surface IN ('website', 'extension')),
  route_pattern text,
  rung smallint CHECK (rung IS NULL OR rung BETWEEN 1 AND 4),
  nation text CHECK (
    nation IS NULL OR nation IN ('england', 'wales', 'scotland', 'northern-ireland', 'unknown')
  ),
  -- The check sections served (short-bundle section keys)
  -- and each section's named state as served — classes
  -- and state names only, never a figure or a line.
  sections text[],
  states jsonb,
  -- The page-error class (D45): the error's name and its
  -- message truncated to 300 characters (and scanned —
  -- a message that itself carries an address, a full
  -- postcode or an email is stored as NULL; the name,
  -- the pattern and the count still record the error).
  error_name text,
  error_message text,
  browser_class text,
  dedupe_key text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX journey_events_dedupe_key
  ON journey_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX journey_events_event_time ON journey_events (event, occurred_at);
CREATE INDEX journey_events_time ON journey_events (occurred_at);

-- The error-alert memory (D45): one row per error
-- fingerprint (event + error name + route pattern). The
-- first sighting of a fingerprint alerts at once; a spike
-- past the pinned threshold inside a rolling hour alerts
-- again, at most once an hour per fingerprint — never one
-- email per error. total_count is the all-time count for
-- the fingerprint; the digest reads counts from
-- journey_events itself.
CREATE TABLE journey_event_alerts (
  fingerprint text PRIMARY KEY,
  event text NOT NULL,
  error_name text,
  route_pattern text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  total_count bigint NOT NULL DEFAULT 0,
  last_alert_at timestamptz,
  last_alert_reason text
);
