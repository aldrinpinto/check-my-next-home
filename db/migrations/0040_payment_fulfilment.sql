-- Migration 0040 — Payment events and fulfilment claims
-- (plan step M9.6; the webhook's audit log and the
-- exactly-once fulfilment claim).
--
-- payment_events is the audit log (founder amendment,
-- 22 Nov 2026): one row for EVERY verified webhook
-- event, written before anything else happens with the
-- event — succeeded payments, failed payments and every
-- other verified event alike. Failed payments are in
-- the log, not just successes: the row is the record
-- that a payment was attempted and what the provider
-- said about it. The columns are the verified event's
-- own facts — its type, the payment's provider
-- reference, its status, and the delivery facts the
-- payment was created with (email, postcode, home key)
-- read back from its metadata — plus the event's mode
-- (livemode) and the order's TEST-lane flag (the test
-- lane, founder-approved 22 Nov 2026: an allowlisted
-- tester's order is flagged in its payment metadata, so
-- the flag is part of the verified event). Nothing here
-- is trusted from anywhere but the verified event.
--
-- fulfilment_claims is the step's exactly-once
-- guarantee: one row per fulfilment, claimed BEFORE
-- any report is made. ref is the claim's key — the
-- provider payment reference for a paid order, the
-- gift token for a gifted order (the token already keys
-- the gift's consumption), a generated id for a
-- free-window order. The primary key IS the dedupe: a
-- redelivered webhook (the provider retries for days,
-- as routine) finds its claim and does nothing — no
-- second PDF, no second delivery record, no second
-- gift, no second email. status walks claimed →
-- fulfilled (with the delivery it produced) or claimed
-- → failed (with the error kept, so a later run can be
-- reasoned about rather than guessed at); attempts
-- counts the worker's tries.
--
-- Together with report_deliveries (0039) these two
-- tables are the audit trail the order record (M9.10)
-- builds on: the log says what the provider reported,
-- the claim says what we undertook to fulfil, the
-- delivery says what the buyer received. test_order
-- rides on both so the order record can separate test
-- orders from real sales without a second ledger.
--
-- Emails are stored NORMALISED (trimmed, lower-cased —
-- the comparison rule, fold-in G9); every write path
-- normalises on the way in.

CREATE TABLE payment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL,
  intent_id text,
  status text,
  email text,
  postcode text,
  home_key text,
  livemode boolean,
  test_order boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- The by-payment reads (an order's whole event history,
-- for the order record and support surfaces).
CREATE INDEX payment_events_intent_idx
  ON payment_events (intent_id);

CREATE INDEX payment_events_received_idx
  ON payment_events (received_at);

CREATE TABLE fulfilment_claims (
  ref text PRIMARY KEY,
  kind text NOT NULL
    CHECK (kind IN ('paid', 'gifted', 'free')),
  email text NOT NULL,
  postcode text NOT NULL,
  home_key text,
  gift_token text,
  test_order boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'fulfilled', 'failed')),
  delivery_id text,
  mail_sent boolean,
  last_error text,
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz
);

-- The worker's read: what still waits, oldest first.
CREATE INDEX fulfilment_claims_pending_idx
  ON fulfilment_claims (status, claimed_at);
