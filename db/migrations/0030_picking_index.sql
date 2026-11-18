-- Migration 0030 — the national picking index (plan step
-- M7.15B, 18 Nov 2026; decision D72 as extended by the
-- step's adopted gap check).
--
-- A slim, parts-only index of the homes the picker may
-- name: postcode, PAON, SAON, street, town — the parts a
-- picking row needs, and nothing a brain could answer
-- from. It exists so the entry point's local tier can
-- name a postcode's homes from day one, instead of only
-- for postcodes a check has already filed.
--
-- The shape carries the step's two hard rules in its
-- structure:
--
--   1. NO BRAIN READS THE INDEX. price_paid is untouched
--      by this step and is NOT filled nationally: the
--      monthly sold-prices refresh derives its targets
--      from price_paid's postcodes, and rows-present in
--      price_paid is the sold-prices brain's proof of a
--      filing — a national fill would poison both. The
--      index is identity for picking, never evidence for
--      an answer.
--   2. EPC-DERIVED ROWS ARE SEPARABLE BY CONSTRUCTION.
--      The served index (picking_index) is BUILT from two
--      retained per-source extracts (picking_sales_extract,
--      picking_epc_extract), each refreshed by its own
--      loader pass. Removing every EPC-derived row is a
--      rebuild of the union from the sales extract alone —
--      a data operation, not a code change — and cannot
--      touch a sales-derived row. Every union row carries
--      its provenance as data (sources + per-source
--      editions): never displayed, held for audit and for
--      that kill switch. (Founder decision, 18 Nov 2026:
--      certificate addresses join the index without the
--      register's written clearance; the separability is
--      the recorded mitigation.)
--
-- The stage tables are UNLOGGED: a loader pass streams
-- the nation into its stage, dedupes in SQL into its
-- extract, and rebuilds the union, all inside one
-- transaction — a failed pass files nothing and the
-- previous edition keeps serving. The stage is scratch
-- by design and is truncated at the start of every pass.
--
-- home_key is the home key's own normalisation (postcode
-- is carried separately, as in the key's rung-1 form):
-- normKey(paon) | normKey(saon) | normKey(street), the
-- same key lib/bundle-cache.ts's homeKeyOf computes from
-- parts and lib/server/hybrid.ts's partsKey dedupes by —
-- one identity across the filed sales, the two extracts
-- and the union.
--
-- picking_index_editions is the one place the index's
-- freshness lives: per source, the edition filed, when
-- it was filed, and the DISTINCT counts the pass printed
-- as its proof (postcodes, homes, streets-with-town).
-- The picking-index canary item ages these rows; a
-- re-extract whose distinct home count moves beyond
-- tolerance against the filed edition is refused by the
-- loader's proof and recorded here (last_rejected_*) so
-- the canary can say so.

CREATE TABLE picking_sales_stage (
  postcode text NOT NULL,
  paon text,
  saon text,
  street text,
  town text,
  home_key text NOT NULL
);

CREATE TABLE picking_epc_stage (
  postcode text NOT NULL,
  paon text,
  saon text,
  street text,
  town text,
  home_key text NOT NULL
);

-- The stages are scratch: unlogged, so a national
-- stream does not pay WAL for rows nothing serves from.
ALTER TABLE picking_sales_stage SET UNLOGGED;
ALTER TABLE picking_epc_stage SET UNLOGGED;

CREATE TABLE picking_sales_extract (
  postcode text NOT NULL,
  paon text,
  saon text,
  street text,
  town text,
  home_key text NOT NULL,
  PRIMARY KEY (postcode, home_key)
);

CREATE TABLE picking_epc_extract (
  postcode text NOT NULL,
  paon text,
  saon text,
  street text,
  town text,
  home_key text NOT NULL,
  PRIMARY KEY (postcode, home_key)
);

CREATE TABLE picking_index (
  postcode text NOT NULL,
  paon text,
  saon text,
  street text,
  town text,
  home_key text NOT NULL,
  sources text[] NOT NULL,
  sales_edition text,
  epc_edition text,
  PRIMARY KEY (postcode, home_key)
);

CREATE INDEX picking_index_postcode_idx ON picking_index (postcode);

CREATE TABLE picking_index_editions (
  source text PRIMARY KEY,
  edition text,
  loaded_at timestamptz,
  postcodes integer,
  homes integer,
  streets integer,
  previous_homes integer,
  last_rejected_homes integer,
  last_rejected_at timestamptz
);

INSERT INTO picking_index_editions (source) VALUES ('sales'), ('epc');
