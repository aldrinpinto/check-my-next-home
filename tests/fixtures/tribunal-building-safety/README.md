# Fixture — tribunal building-safety decisions (M5.14)

Trimmed cuts of REAL GOV.UK residential-property-
tribunal decisions, captured 14 Nov 2026 at the M5.14
build. Each PDF is the decision's first two pages
(Ridley House: first page only) — the header block the
loader parses lives there — and `manifest.json`
mirrors the live enumeration for the same items: the
GOV.UK link and title plus the content item's
tribunal_decision_decision_date and
tribunal_decision_sub_category metadata. Values
verbatim; nothing is invented, and the one document
that cannot be read is kept unreadable on purpose.

- `oyster-bay.pdf` — the control golden: remediation
  order, HAV/00HQ/BSA/2025/0002, 10 April 2026,
  "1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN".
- `planetree-path.pdf` — a remediation contribution
  order (BSB), LON/00BH/BSB/2024/0500.
- `thanet-lodge.pdf` — one decision, three BSA case
  references in full; its Property line names the
  building (the GOV.UK title names the flats — the
  document is the authority, so it files block-level).
- `purbeck-house.pdf` — short-form references
  ("0001 and 0002") and a corrected decision: the
  decision is dated 8 May 2025, corrected 16 May 2025;
  the filed date is the decision's.
- `east-village.pdf` — a Regulation 3 appeal carrying
  two BSA references: other-building-safety, and its
  Property prints only the postcode district (E20), so
  its rows file with no postcode.
- `hillside.pdf` — a corrected decision (decided
  5 September 2025, corrected 16 September 2025).
- `empire-square-decision.pdf` +
  `empire-square-rco.pdf` — one case published as a
  combined decision (HYI + BSB references, both
  applications) and the remediation contribution
  order document itself: the order document speaks
  for the BSB case; the HYI case files nothing.
- `ridley-house.pdf` — a scanned decision: no
  extractable text. The parse-failure case — counted
  by name, never filed.

The PDFs are stored base64-encoded (`.pdf.b64`)
alongside the plain files, for the repo's text-only
push channel — the council-tax ODS precedent. The
loader's fixture reader takes the plain `.pdf` when
present and decodes the `.b64` otherwise.
