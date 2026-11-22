-- Migration 0041 — The journey catalogue gains
-- report_delivered (plan step M9.6; founder amendment,
-- 22 Nov 2026 — the payment-journey funnel).
--
-- Migration 0036 pinned the journey_events.event CHECK
-- to the catalogue as it stood at M7.14, with the note
-- that the two move together or not at all. M9.6
-- completes the payment funnel — door view →
-- checkout_started → checkout_paid → report_delivered —
-- and the catalogue in lib/journey-events.ts gains
-- report_delivered (server origin: a report was
-- delivered, recorded by the fulfilment path at
-- delivery, never from a browser beacon). This
-- migration moves the CHECK with it: the same twelve
-- names, plus the new one.
--
-- The constraint's name is the one Postgres gave the
-- unnamed column CHECK in 0036 (journey_events_event_
-- check); it is dropped and re-added under the same
-- name with the extended list.

ALTER TABLE journey_events
  DROP CONSTRAINT journey_events_event_check;

ALTER TABLE journey_events
  ADD CONSTRAINT journey_events_event_check
  CHECK (
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
      'page_error',
      'report_delivered'
    )
  );
