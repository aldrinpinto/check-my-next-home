# Mobile fixture (plan step M5.9) — FORMAT-FAITHFUL, NOT MEASURED

`202601_mobile_coverage_laua_r1.csv` reproduces the documented
shape of Ofcom's Connected Nations mobile file at **local authority
level** (Ofcom publishes no postcode-level mobile file): the three
golden homes' authorities with the loader's consumed columns
(`<Service>_prem_<in|out>_<0|4>` percentages), plus illustrative
values invented for the fixture.

No figure here is a measured Ofcom figure. As with broadband, the
live-pull proof is outstanding behind Ofcom's 403 to the build
sandbox; the header contract is validated on the first real pull.
The laua codes (E07000067 Braintree, E09000025 Newham, E07000071
Epsom and Ewell) are genuine ONS codes — directory facts, not
coverage data.
