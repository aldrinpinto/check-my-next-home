-- Migration 0044 — The admin page's counting shelves
-- (plan step M9.11; the adopted ADMIN-PAGE-PLAN, with
-- the founder's search-counting ruling of 22 Nov 2026).
--
-- Two additions, both in service of the owner-only
-- admin page:
--
-- 1. THE SEARCH COUNTING (the founder's ruling: full-
--    postcode grain, aggregate counts only, never tied
--    to a visitor, cookie or IP; raw search text is
--    never stored). The journey-events table cannot
--    carry this — its scan rejects full postcodes by
--    design, and that rule stands untouched — so the
--    counting keeps its own shelves, aggregate by
--    construction: there is no column here that could
--    hold a visitor, a session or a typed word.
--
--    search_counts — one row per (hour, counter,
--    search type, postcode, street) slice, counted up
--    in place. The grain is the hour (the instant
--    truncated), so every admin period — a London day,
--    a rolling 24 hours, a custom stretch — reads the
--    buckets it spans without a day-edge error:
--      counter     'check' | 'purchase' | 'purchase-test'
--                  (a test-lane purchase is counted
--                  apart, so the admin page's test
--                  toggle can keep the founder's own
--                  testing out of the bought numbers
--                  exactly as it does for orders;
--                  checks carry no test split — a check
--                  serve cannot know, the same stated
--                  limit the journey events carry).
--      search_type 'postcode' | 'street' | 'wider-area'
--                  — how the counted journey began.
--      postcode    the full postcode a check served or
--                  a purchase belongs to; '' where the
--                  slice has none (wider-area checks,
--                  street slices).
--      street_key  the normalised street a street
--                  search served (street + town, the
--                  street table's own normal form);
--                  '' where the slice is not a street.
--      street_label the street's display form, carried
--                  on the row so the panel never has to
--                  re-derive it; '' likewise.
--    A check serve counts once under its type, once
--    under its postcode, and — for a street search —
--    once under its street: three rows, one act. A
--    paid claim counts once as a purchase, under the
--    postcode it belongs to and the search type the
--    postcode's last counted check began with (the
--    last-touch shelf below; the standard entry is the
--    postcode box, so an untouched postcode attributes
--    to 'postcode').
--
--    search_last_type — the last-touch shelf: one row
--    per postcode naming how its most recent counted
--    check began. A postcode and a class — the same
--    grain the counting itself keeps, never a visitor.
--
-- 2. payment_events.failure_reason — the provider's
--    own words for a failed payment ("Your card was
--    declined."), read off the verified event's object
--    by the translator (M9.11 extends its verdict with
--    the failure message, the M9.8 pattern) and kept
--    on the audit row, so the admin page's Needs a
--    human panel can show what the provider said
--    (ADMIN-PAGE-PLAN panel (f)) without inventing a
--    reason. Null for every event that is not a failed
--    payment, and for failures recorded before this
--    migration — the panel composes its plain fallback
--    line for those.

CREATE TABLE search_counts (
  bucket timestamptz NOT NULL,
  counter text NOT NULL CHECK (counter IN ('check', 'purchase', 'purchase-test')),
  search_type text NOT NULL CHECK (search_type IN ('postcode', 'street', 'wider-area')),
  postcode text NOT NULL DEFAULT '',
  street_key text NOT NULL DEFAULT '',
  street_label text NOT NULL DEFAULT '',
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (bucket, counter, search_type, postcode, street_key)
);

CREATE INDEX search_counts_bucket_idx ON search_counts (bucket);

CREATE TABLE search_last_type (
  postcode text PRIMARY KEY,
  search_type text NOT NULL CHECK (search_type IN ('postcode', 'street', 'wider-area')),
  updated_at timestamptz NOT NULL
);

ALTER TABLE payment_events ADD COLUMN failure_reason text;
