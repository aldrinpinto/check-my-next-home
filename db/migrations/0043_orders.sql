-- Migration 0043 — The order record and its delivery
-- log (plan step M9.10; the adopted M9.10 prep, gaps
-- 2, 3 and 9).
--
-- Until now an order existed only as three shelves
-- that were built for this record (migration 0040's
-- header names them): payment_events (what the
-- provider reported), fulfilment_claims (what we
-- undertook to fulfil) and report_deliveries (what
-- the buyer received). This step assembles the
-- business record that reads across all three:
--
-- orders — one row per order, keyed by the claim's
-- own reference (the provider payment reference for a
-- paid order, the gift token for a gifted one, the
-- generated id for a free-window one), written where
-- the claim is taken:
--   - a PAID order is written in webhook processing,
--     from the VERIFIED event's metadata — the buyer
--     email, the postcode, the address key, the TEST
--     flag, and the consent pair (the tick and its
--     timestamp, carried in the payment's metadata
--     since M9.5 and read back here, extending
--     T-PAY-06's proof from metadata to record). The
--     amount is pinned from the ONE price
--     (REPORT_PRICE_PENCE, GBP) at claim time — true
--     for every order the site can currently take.
--     The recorded limit (prep gap 3): if pricing
--     ever varies, the translator's verdict must be
--     extended to read the amount off the verified
--     event BEFORE the variation ships, because a
--     constant-pinned record cannot tell two prices
--     apart after the fact.
--   - GIFTED and FREE orders are written at their own
--     claim sites with amount, currency, provider
--     reference and consent honestly NULL — nothing
--     was paid and no tick was given.
--
-- The row carries the two notice markers the step's
-- exactly-once promises hang from (the sale alert at
-- fulfilment, the failure-notice pair at terminal
-- failure): each is set once, with its send, and a
-- notice whose send failed leaves its marker unset so
-- a later pass retries it.
--
-- refund_status is born here (prep gap 9) — 'none'
-- until a refund completes. RECONCILIATION, recorded:
-- the prep designed this field for M9.8's mechanics
-- to write, but M9.8 built FIRST and keeps the
-- refund's truth in its own overlay (payment_refunds,
-- migration 0042), read live by the surfaces through
-- the refund processing's completed-full-refund
-- reading. This column is therefore the record's own
-- standing as this step creates it — present, with
-- room for M9.8's states ('refunded'), and never the
-- authority over payment_refunds where the two could
-- be compared. The admin page (M9.11) reads the
-- refund record from payment_refunds and the order's
-- life from here, as the founder's rider settles.
--
-- order_delivery_log — the delivery and re-send log
-- the plan pins, as rows (not a text field) so the
-- admin page and any support surface can read them:
-- one row per delivery or re-send — when, which kind
-- (the original delivery, the buyer's own re-send
-- from the success surface, the owner's support
-- re-send), whether it was sent, and a detail (the
-- owner re-send's verification fact rides there).
-- The buyer's download-page re-issue is NOT a row
-- here: it answers an expired link, not a delivery,
-- and its uniform answer is its own record.
--
-- Emails are stored NORMALISED (trimmed, lower-cased
-- — the comparison rule, fold-in G9); every write
-- path normalises on the way in.

CREATE TABLE orders (
  -- The claim's reference — the order's key
  -- everywhere in the books.
  ref text PRIMARY KEY,
  -- 'paid' | 'gifted' | 'free' — the claim's own kind.
  kind text NOT NULL,
  email text NOT NULL,
  postcode text NOT NULL,
  home_key text,
  -- The amount the order was taken at, in minor
  -- units, and its currency. Paid orders only; NULL
  -- for gifted and free orders (nothing was paid).
  amount integer,
  currency text,
  -- The provider's reference for the payment (a paid
  -- order's own ref IS its payment reference; the
  -- column stands so the record names it in terms).
  -- NULL for gifted and free orders.
  provider_ref text,
  -- The buyer's digital-content consent (M9.5): the
  -- tick and the ISO timestamp of the moment it was
  -- given, threaded from the verified event's
  -- metadata. Paid orders only; NULL otherwise (no
  -- tick was given).
  consent_tick boolean,
  consent_timestamp text,
  -- The stored report's delivery (report_deliveries'
  -- id) once fulfilled; NULL until then.
  delivery_id text,
  -- 'none' until a refund completes; see the header
  -- for this column's standing beside payment_refunds.
  refund_status text NOT NULL DEFAULT 'none',
  test_order boolean NOT NULL DEFAULT false,
  -- The notice markers (set once, with their sends):
  -- the owner sale alert at fulfilment, and the
  -- failure-notice pair at terminal failure.
  sale_alert_sent_at timestamptz,
  failure_notice_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_email_idx ON orders (email);
CREATE INDEX orders_postcode_idx ON orders (postcode);

CREATE TABLE order_delivery_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_ref text NOT NULL,
  -- The delivery the row is about, where one stands.
  delivery_id text,
  -- 'delivery' | 'buyer-resend' | 'owner-resend'.
  kind text NOT NULL,
  -- Whether the email actually went out.
  sent boolean NOT NULL,
  -- A fact worth keeping with the row — for an owner
  -- re-send, the requester-verification fact.
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_delivery_log_order_ref_idx
  ON order_delivery_log (order_ref, created_at);
