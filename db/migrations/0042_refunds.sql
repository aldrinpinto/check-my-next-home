-- Migration 0042 — Refunds (plan step M9.8; the
-- adopted M9.8 prep, gaps 4, 6, 7 and 8).
--
-- A refund is made by the founder in the Stripe
-- dashboard; this site LEARNS of it from the refund
-- events the webhook receives (refund.created /
-- refund.updated / refund.failed) and keeps its own
-- books in payment_refunds: one row per provider
-- refund, keyed by the refund's own id, carrying the
-- payment it belongs to (the PaymentIntent reference
-- read from the refund object's own payment linkage),
-- its charge, its amount and currency, its CURRENT
-- status as the provider reports it, when the
-- provider says it happened and when we first heard,
-- whether it stands unmatched to any order, and
-- whether the consequences of a completed FULL refund
-- have been applied. The row is an OVERLAY beside the
-- order's own records: a claim's status and the raw
-- payment_events trail are never rewritten by a
-- refund; this table is where the refund's truth
-- lives, and it carries everything the admin page
-- (M9.11) reads back — status, amount, date, the gift
-- consequence and the consequences-applied state.
--
-- Consequences fire ONLY when the succeeded refunds
-- against one payment sum to the report's full price:
-- a pending or partial refund is recorded here and
-- changes nothing visible. The consequences-applied
-- state is the transition's guard — it is set once,
-- never unset, and a later stale or failing notice for
-- an applied refund is recorded (needs_attention)
-- rather than acted on.
--
-- The same step's standing changes ride here too:
--   - report_deliveries gains the WITHDRAWN standing
--     (withdrawn_at + the refund that is its reason).
--     The delivery row and its stored PDF are kept;
--     the standing is read at serve time, so every
--     token over the delivery dies at once.
--   - gift_tokens gains the terminal VOIDED state
--     (the refund of the order that issued the gift)
--     and its voided_at. Redeemed is never voided.
--   - fulfilment_claims gains REFUNDED: a paid claim
--     a completed refund retires before fulfilment
--     (the tombstone — claimed as refunded, never
--     fulfilled, never issued a gift). A fulfilled
--     claim keeps its status; the refund stands
--     beside it in payment_refunds.
--
-- The constraint names below are the ones Postgres
-- gave the unnamed column CHECKs in 0034 and 0040
-- (the 0041 pattern: drop and re-add under the same
-- name with the extended list).

CREATE TABLE payment_refunds (
  refund_id text PRIMARY KEY,
  -- The PaymentIntent the refund belongs to — the
  -- order's own key everywhere else in the books.
  -- Null only where the event named no payment at
  -- all (such a row stands unmatched by construction).
  payment_ref text,
  charge_ref text,
  amount integer NOT NULL,
  currency text NOT NULL,
  -- The refund's status as the provider last reported
  -- it (pending / requires_action / succeeded /
  -- failed / canceled). No CHECK: the provider's
  -- vocabulary is theirs to extend, and the books
  -- record what was said.
  status text NOT NULL,
  livemode boolean,
  -- The order was a TEST order (the test-mode lane):
  -- read from the order's claim where one stands,
  -- else from the event's own mode.
  test_order boolean NOT NULL DEFAULT false,
  -- No order of ours stands behind this refund (the
  -- event named no payment we can tie it to).
  unmatched boolean NOT NULL DEFAULT false,
  -- The completed-full-refund consequences have been
  -- applied for this payment (set on every succeeded
  -- refund of the payment when the transition runs).
  consequences_applied boolean NOT NULL DEFAULT false,
  consequences_applied_at timestamptz,
  -- What the transition did to the order's Check
  -- Together gift: 'voided' (an issued gift),
  -- 'voided-claimed' (a claimed gift — its waiting
  -- claim stopped, its unredeemed delivery withdrawn),
  -- 'redeemed-stood' (a redeemed gift stands), 'none'
  -- (the order carried no gift). Null until applied.
  gift_consequence text,
  -- A failure notice arrived for a refund whose
  -- consequences already stand applied: recorded for
  -- the owner's eye, never acted on.
  needs_attention boolean NOT NULL DEFAULT false,
  -- When the provider says the refund happened (the
  -- refund object's own creation time) and when we
  -- first recorded it.
  provider_created_at timestamptz,
  first_heard_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_refunds_payment_ref_idx
  ON payment_refunds (payment_ref);

ALTER TABLE report_deliveries
  ADD COLUMN withdrawn_at timestamptz,
  ADD COLUMN withdrawn_refund_id text;

ALTER TABLE gift_tokens
  DROP CONSTRAINT gift_tokens_status_check;

ALTER TABLE gift_tokens
  ADD CONSTRAINT gift_tokens_status_check
  CHECK (status IN ('issued', 'claimed', 'redeemed', 'voided'));

ALTER TABLE gift_tokens
  ADD COLUMN voided_at timestamptz;

ALTER TABLE fulfilment_claims
  DROP CONSTRAINT fulfilment_claims_status_check;

ALTER TABLE fulfilment_claims
  ADD CONSTRAINT fulfilment_claims_status_check
  CHECK (status IN ('claimed', 'fulfilled', 'failed', 'refunded'));
