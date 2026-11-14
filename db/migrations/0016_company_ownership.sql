-- Migration 0016 — company ownership: HM Land Registry
-- CCOD/OCOD titles + Companies House snapshots (plan
-- step M5.13; founder rulings Q1–Q7 of the M5.13 gap
-- check, 13 Nov 2026, recorded as decision D15; the
-- build-ahead-of-the-written-answer direction and the
-- feature flag are decision D18, 14 Nov 2026).
--
-- THE FLAG GOVERNS THESE TABLES' REACH. The loader
-- (loaders/load-company-ownership.mjs) files this data
-- as preparation, but COMPANY_OWNERSHIP_ENABLED
-- (lib/site.ts) defaults to false and stays false until
-- HM Land Registry Data Services' written clause-3.2
-- answer is yes AND the founder gives the go: while it
-- is false, nothing user-facing may read these tables
-- or surface anything they hold. If the written answer
-- is no, the founder alone decides whether the feature
-- — and this data — is killed (the licence requires
-- deletion within 48 hours of a termination; the tables
-- are full-replacement, so a kill is a drop, not a
-- clean-up).
--
-- company_titles — one row per filed title, exactly as
-- the datasets publish it:
--   dataset is ccod (UK companies that own property in
--   England and Wales) or ocod (overseas companies);
--   both are monthly FULL snapshots under HM Land
--   Registry's bespoke licence (not OGL), and the
--   loader replaces each dataset's rows wholesale on
--   every pass — a title sold to an individual drops
--   out instead of lingering.
--   The property address fields (property_address,
--   district, county, region, postcode) are the
--   register's text AS FILED. They are match keys only:
--   clause 3.2 of the licence restricts their use, and
--   no answer ever displays them — the address on
--   screen is always the buyer's own input. postcode is
--   the dataset's own Postcode column, normalised
--   (upper-case, single space) and NULLABLE: titles
--   whose file row carries no postcode, or one not in
--   UK form, file with NULL and can never be served for
--   a postcode.
--   The proprietor columns carry PROPRIETOR (1) — the
--   title's lead registered proprietor — with
--   additional_proprietor_indicator holding the file's
--   own flag where further proprietors exist or kinds
--   the dataset does not list sit alongside: the
--   defensible sentence is "a registered proprietor is
--   a company", never "the owner is a company" without
--   that flag read. company_number is NULLABLE on
--   purpose: the register records it "where available"
--   — older titles, and most overseas proprietors,
--   carry none — and a NULL number's snapshot state is
--   named, never back-filled by name-matching.
--   country_incorporated is OCOD's own field (NULL for
--   every CCOD row): the register fact a report may
--   state, and no more — never a beneficial owner,
--   never a parent (decision D15's depth boundary: no
--   officers, no PSC, no parent-company inference, no
--   charges in anything this step feeds).
--   price_paid is the register's price where recorded
--   (it is not a valuation of anything). tenure is the
--   title's own Freehold/Leasehold — part of the fact,
--   because a flat's own leasehold title and its
--   building's freehold title are different titles with
--   different proprietors (decision D15: the headline
--   answers the home's OWN title; a company-held
--   building freehold is a separate labelled line in
--   report depth only).
--   source_date is the dataset edition's month (the
--   November 2026 edition files 2026-11-01): the
--   register lags — a transfer appears only after
--   registration completes and the next monthly file
--   lands — and the licence forbids presenting
--   out-of-date information as current, so every answer
--   this data feeds carries its dataset month.
--
-- company_snapshots — one row per company number, the
-- step's five published fields from Companies House's
-- Free Company Data Product (monthly bulk snapshot,
-- OGL v3.0, no key): name, status, incorporation date,
-- SIC codes, registered office as published (assembled
-- from the product's own address parts, in their
-- published order — the product publishes parts, not a
-- single string). The product holds LIVE companies
-- only: a filed company number absent from it — a
-- dissolved or struck-off proprietor, or a number whose
-- filed form the product keys differently (a registered
-- society's) — gets NO row here, and serving names that
-- missing-snapshot state rather than inventing a profile
-- (the Companies House API key K24 is not taken; decision
-- D15 as built). source_date is the snapshot's month.
--
-- What is deliberately NOT here:
--   No charity-owned titles can ever appear: both
--   datasets exclude charities by category, so a "not
--   company-owned" answer rests on data with that named
--   hole, alongside unregistered land (roughly a tenth
--   of England and Wales has no registered title at
--   all) and the registration lag above — the No's
--   explainer carries those holes (decision D15), and
--   this schema stores nothing that could paper over
--   them.
--   Scotland and Northern Ireland have no rows: the
--   datasets are England and Wales only, and serving
--   prints the named not-covered state — never a zero,
--   never a No.

CREATE TABLE company_titles (
  title_number text NOT NULL,
  dataset text NOT NULL CHECK (dataset IN ('ccod', 'ocod')),
  tenure text NOT NULL CHECK (tenure IN ('Freehold', 'Leasehold')),
  property_address text NOT NULL,
  district text,
  county text,
  region text,
  postcode text CHECK (
    postcode IS NULL
    OR postcode ~ '^[A-Z]{1,2}[0-9][0-9A-Z]? [0-9][A-Z]{2}$'
  ),
  multiple_address_indicator boolean NOT NULL,
  price_paid numeric,
  proprietor_name text NOT NULL,
  company_number text,
  proprietorship_category text,
  country_incorporated text,
  date_proprietor_added date,
  additional_proprietor_indicator boolean NOT NULL,
  source_name text,
  source_date date,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset, title_number)
);

CREATE INDEX company_titles_postcode_idx ON company_titles (postcode);
CREATE INDEX company_titles_company_number_idx ON company_titles (company_number);

CREATE TABLE company_snapshots (
  company_number text PRIMARY KEY,
  company_name text NOT NULL,
  status text,
  incorporation_date date,
  sic_codes text[] NOT NULL DEFAULT '{}',
  registered_office text,
  source_name text,
  source_date date,
  retrieved_at timestamptz NOT NULL DEFAULT now()
);
