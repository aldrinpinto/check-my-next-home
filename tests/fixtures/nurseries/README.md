# Nurseries fixture (plan step M5.17)

Real rows captured on 14 Nov 2026 from the live source the loader
uses: Ofsted's childcare provider data as at 30 June 2026 (the
"Childcare providers and inspections: management information"
release, GOV.UK). The cut holds every group setting (Provider
type "Childcare on non-domestic premises", subtypes "Full day
care" and "Sessional day care", status Active) within 3 miles of
a golden home — 336 settings — plus one row of each class the
loader must never file: an out-of-school day care setting, a
blank-subtype group row, a Childminder, a Home childcarer and a
Childcare on domestic premises row. The last three are REDACTED
in the published file itself (name and postcode), exactly as
captured. Rows are re-serialised from the parsed register with
minimal quoting (the repository's push route carries text only);
every value is the published value.

`postcodes.json` holds the ONSPD August 2026 centroids for every
real postcode in the cut — the loader positions settings from it
in fixture mode, exactly as it uses the postcode directory table
live.

Golden facts these rows must reproduce (the same figures the
first filed national load locked — the 3-mile cut covers each
home's 2-mile answer in full): Birkdale's nearest nursery is
Shining Stars at 0.110 miles, 5 within 2 miles; Exeter's is
Cribs Day Nursery at 0.088 miles, 96 within 2 miles; the
Minerva House flat's is Nestots Day Nursery at 0.174 miles, 39
within 2 miles — all on the brain's 3,956 earth-radius basis.
