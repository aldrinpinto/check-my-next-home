-- Migration 0039 — Delivered reports (plan step M8.6,
-- Key K16; the safe download links' shelf).
--
-- One row per DELIVERED report: the record a signed
-- download link resolves against. A delivery is
-- written by the delivery service (lib/server/
-- report-delivery.ts) at the moment a report is
-- delivered to an inbox — M9's payment trigger is that
-- moment for a bought report, and the free launch
-- window's delivery for a free one — and read back in
-- exactly two places: the download's file route (the
-- stored PDF's key and the file's name) and the
-- re-issue decision (the entered address against the
-- delivery's own address — a fresh link goes to the
-- original inbox only).
--
-- The link itself is NOT stored: it is a signed token
-- (lib/server/download-links.ts) whose payload is this
-- row's id plus its own expiry, so links are minted
-- and verified statelessly, a re-issue needs no write
-- here, and no column has to be flipped when a link
-- dies on its seventh day. The REPORT never expires —
-- this row stands for as long as the report does, and
-- a fresh link can always be minted over it.
--
-- kind is the delivery's basis, and it decides the
-- one paid-only element (decision D21): a 'paid'
-- delivery's email carries the Check Together gift
-- block, so its row carries the issued gift's token;
-- 'free' (the launch window) and 'gifted' (a report
-- delivered against a claimed gift) rows never carry
-- one — the step's named tests pin all three.
--
-- Emails are stored NORMALISED (trimmed, lower-cased
-- — the comparison rule, fold-in G9); every write path
-- normalises on the way in.
--
-- order_ref carries M9's order record id so a delivery
-- can be traced to (and, at refund, reasoned about
-- with) its order. It is null until M9 wires delivery.

CREATE TABLE report_deliveries (
  id text PRIMARY KEY,
  email text NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('free', 'paid', 'gifted')),
  pdf_key text NOT NULL,
  file_name text NOT NULL,
  home_title text NOT NULL,
  home_address_line text NOT NULL,
  gift_token text,
  order_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The by-email reads (a buyer's deliveries, for the
-- support and M9 surfaces that reason per inbox). The
-- built flow itself reads by id alone.
CREATE INDEX report_deliveries_email_idx
  ON report_deliveries (email);
