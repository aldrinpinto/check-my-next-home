-- Migration 0046 — the test-order flag follows the payment's
-- mode (BUG-290, founder-found on the admin page 25 Nov 2026).
--
-- THE DEFECT. The flag keyed on the buyer email being on the
-- TEST_BUYER_EMAILS allowlist (lib/server/payments.ts's
-- isTestOrder), not on the payment's mode. The default key
-- set is still the sandbox set until M9.2 places live keys,
-- so every payment so far ran on test keys — but only the
-- allowlisted Yahoo address's orders carried the flag: 31
-- fulfilment_claims, 14 flagged test, 17 unflagged (10 paid,
-- 7 gifted); 26 orders, 16 unflagged; 29 payment_events, 13
-- unflagged. With test orders excluded the admin page's
-- orders list still showed the 17 as if real, and its
-- revenue, conversion and failed-payment counts counted
-- dummy money as sales.
--
-- THE FIX is the backfill for the rows the old rule wrote,
-- nothing else: the app code in this stack derives the flag
-- from the payment's livemode from here on
-- (lib/server/fulfilment.ts), and a gifted order inherits
-- its issuing order's standing
-- (lib/server/gifts.ts's giftSourceTestOrder), so no new
-- row can be written wrong. Five idempotent UPDATEs, each
-- guarded by test_order = false, so re-running the
-- migration is a no-op:
--   1. payment_events: the event's own livemode is the
--      truth — a test-mode event is a test order's event.
--   2. paid claims and paid orders: a payment that ran in
--      test mode, read off its own payment event.
--   3. gifted claims and gifted orders: a gift has no
--      payment of its own, so its standing is its issuing
--      order's payment's mode, read through gift_tokens'
--      order_ref. These two run AFTER the paid updates in
--      statement order — but they read the payment event,
--      not the order row, so they stand even where the
--      issuing order's own record was never written.
-- The counts the founder's question pinned: 13 events, 10
-- paid claims, 9 paid orders, 7 gifted claims, 7 gifted
-- orders — 46 rows. After this migration every row on the
-- play site reads test, as every payment so far ran on
-- test keys.
--
-- THE FORM is the house form, deliberately: plain UPDATEs
-- inside the migration runner's per-migration transaction,
-- exactly as the other data repairs run. No new columns,
-- no backfill script outside the migration — the repair
-- ships with the code that stops the defect recurring, and
-- deploys in the same step. The statements touch only
-- rows the old rule left unflagged, and only where a
-- test-mode payment event stands for the payment, so a
-- genuinely live payment (none exists yet — live keys
-- arrive at M9.2) could never be swept up by this file.

UPDATE payment_events
  SET test_order = true
  WHERE test_order = false AND livemode = false;

UPDATE fulfilment_claims
  SET test_order = true
  WHERE kind = 'paid' AND test_order = false
    AND EXISTS (
      SELECT 1 FROM payment_events e
        WHERE e.intent_id = fulfilment_claims.ref AND e.livemode = false
    );

UPDATE orders
  SET test_order = true
  WHERE kind = 'paid' AND test_order = false
    AND EXISTS (
      SELECT 1 FROM payment_events e
        WHERE e.intent_id = orders.ref AND e.livemode = false
    );

UPDATE fulfilment_claims
  SET test_order = true
  WHERE kind = 'gifted' AND test_order = false
    AND EXISTS (
      SELECT 1 FROM gift_tokens g
        JOIN payment_events e ON e.intent_id = g.order_ref
        WHERE g.token = fulfilment_claims.ref AND e.livemode = false
    );

UPDATE orders
  SET test_order = true
  WHERE kind = 'gifted' AND test_order = false
    AND EXISTS (
      SELECT 1 FROM gift_tokens g
        JOIN payment_events e ON e.intent_id = g.order_ref
        WHERE g.token = orders.ref AND e.livemode = false
    );
