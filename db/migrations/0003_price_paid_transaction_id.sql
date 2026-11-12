-- Migration 0003 — price_paid gains the Land Registry transaction id.
--
-- Step M4.2 (sold-prices loader): the monthly update file amends and
-- deletes transactions by their unique id, so the loader needs to store
-- it. Rows filed before this migration (the M3.6 seed) simply have no
-- id; the unique index therefore only covers rows that carry one.

ALTER TABLE price_paid ADD COLUMN IF NOT EXISTS transaction_id text;

CREATE UNIQUE INDEX IF NOT EXISTS price_paid_transaction_id_idx
  ON price_paid (transaction_id)
  WHERE transaction_id IS NOT NULL;
