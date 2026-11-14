-- Migration 0015 — tribunal building-safety decisions
-- (plan step M5.14; founder rulings Q1–Q7 of the M5.14
-- gap check, 14 Nov 2026, recorded as decision D17).
--
-- One row per First-tier Tribunal (Property Chamber)
-- CASE in the Building Safety Act remediation series —
-- the cases whose references carry /BSA/ (a remediation
-- order application, section 123 of the Building Safety
-- Act 2022) or /BSB/ (a remediation contribution order
-- application, section 124). The loader
-- (loaders/load-tribunal-building-safety.mjs) enumerates
-- GOV.UK's residential-property-tribunal-decisions
-- finder under HMCTS's own "Building Safety Act"
-- category tagging, reads each selected decision PDF's
-- first-page header block, and files the case. A case
-- published as several documents (a decision, then the
-- order itself; a later variation) files as ONE row:
-- the order document speaks for the case where one
-- exists.
--
-- What a row is, and is not:
--   property_text is the Property (or Premises) line
--   exactly as the decision prints it — the tribunal's
--   own words for the building, never normalised into
--   an address and never matched against the postcode
--   directory. postcode is the full UK postcode parsed
--   out of that text and normalised, and it is NULLABLE
--   on purpose: real decisions name buildings with only
--   a postcode district ("London E14", "London E20") or
--   no postcode at all (a multi-building case whose
--   header names the buildings as a set). A NULL
--   postcode row can never be served for a postcode —
--   it exists so the filed corpus stays complete by
--   case and its gaps stay visible, not papered over.
--   building_key is the normalised building stem
--   (lower-cased, punctuation removed, any leading
--   flat list or number range removed, the postcode
--   removed) for matching WITHIN a postcode at answer
--   time: the postcode is the join, this is the
--   grouping. is_single_flat marks the decisions whose
--   property text names specific flats rather than the
--   building as a whole — the prep's match rule: such a
--   decision surfaces for the named flats' addresses,
--   not as a block-wide headline (M6.16 owns the
--   serving; this column is the fact it reads).
--   order_kind is the kind of order the case concerns,
--   from the decision's own type line (or the order
--   document's heading), falling back to the case
--   reference's own series (BSA = section 123, BSB =
--   section 124) where a combined decision names both
--   applications or the header carries no type line:
--   the publisher's sub-category tagging is NOT used —
--   GOV.UK publishes the same decision document twice
--   under two different sub-categories (the Canary
--   Riverside decision, 6 Jan 2026), so it cannot be
--   the authority. "other-building-safety" is the
--   honest remainder: Building Safety Act decisions in
--   the BSA/BSB series that are neither order — a
--   Regulation 3 appeal decision carrying BSA case
--   references is the live example.
--   decision_date is the decision's own date — the
--   header's Date of Decision / Date of Order where
--   the header carries one (a Date of Corrected
--   Decision never displaces it), else the GOV.UK
--   content item's tribunal_decision_decision_date.
--   source_url is the GOV.UK page of the document the
--   row was filed from; source_date repeats
--   decision_date (the document IS the source; its
--   date is the edition date of the fact);
--   retrieved_at stamps the quarterly pass that filed
--   the row.
--
-- What is deliberately NOT here:
--   No other tribunal series. HYI and the remaining
--   categories are outside the founder's slice (Q3):
--   a remediation order made under an HYI-series case
--   reference (the Empire Square order, HYI/2023/0013)
--   files nothing here, and the coverage wording says
--   the index is the published BSA/BSB series, never
--   "tribunal decisions" as a whole — publication is
--   selective and the general index was declined.
--   No Building Safety Regulator register data: no
--   building-level register extract exists to file
--   (the register is a postcode lookup by design,
--   expressly not published as data) — the register
--   half of M5.14 is a hand-off at serving time (M6.16)
--   watched by the bsr-register canary, never a table.
--   No verdict of any kind: a row records that a
--   decision or order was published for a case. It
--   says nothing about whether a building has cladding
--   or is safe, and no column here can express one.
--   A document whose header the loader cannot read
--   (scanned PDFs, and PDFs whose text is CID-encoded)
--   files NOTHING: it is counted by name in the run
--   output, and a run whose parse-failure count rises
--   against the previous run alerts after filing.

CREATE TABLE tribunal_building_safety_decisions (
  case_ref text PRIMARY KEY
    CHECK (case_ref ~ '^[A-Z]{3}/[0-9A-Z]{4}/(BSA|BSB)/[0-9]{4}/[0-9]{4}$'),
  decision_date date NOT NULL,
  order_kind text NOT NULL CHECK (
    order_kind IN (
      'remediation-order',
      'remediation-contribution-order',
      'other-building-safety'
    )
  ),
  property_text text NOT NULL,
  postcode text CHECK (
    postcode IS NULL
    OR postcode ~ '^[A-Z]{1,2}[0-9][0-9A-Z]? [0-9][A-Z]{2}$'
  ),
  building_key text NOT NULL,
  is_single_flat boolean NOT NULL,
  source_url text NOT NULL,
  source_name text,
  source_date date,
  retrieved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tribunal_building_safety_decisions_postcode_idx
  ON tribunal_building_safety_decisions (postcode);
