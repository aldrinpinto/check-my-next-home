# Mobile fixture (plan step M5.9) — REAL HEADER SHAPE, INVENTED VALUES

`202601_mobile_coverage_laua_r01.csv` reproduces the header shape
of Ofcom's Connected Nations Spring 2026 mobile file at **local
authority level** (Ofcom publishes no postcode-level mobile file),
as proven by the founder's live run on 13 Nov 2026: the three
golden homes' authorities with the full published column set —
2G, 3G, 4G and Voice (operator counts to 3 for 2G and Voice, to 4
for 3G and 4G) plus the four 5G families (ordinary and Standalone,
high and very high confidence; premises-outdoor and geographic
columns only). The Spring 2026 file has **no `Data_*` columns** —
the aggregate Data service in older Ofcom documentation is gone —
and the 5G SA four-operator columns are present but empty, as
published. All coverage values are invented for the fixture.

No figure here is a measured Ofcom figure. The header contract
was corrected against the real file after the founder's run; the
corrected loader's own live-pull proof remains outstanding behind
Ofcom's 403 to the build sandbox. The laua codes (E07000067
Braintree, E09000025 Newham, E07000071 Epsom and Ewell) are
genuine ONS codes — directory facts, not coverage data.

The CSV ends with an empty row spanning all 155 columns, as the
real file does (the founder's second live run, 13 Nov 2026, failed
on exactly that row before the parser learned to skip all-empty
records). Do not tidy it away: the fixture tests pin that a
trailing all-empty record is skipped, while a row carrying values
but no authority code or name still fails the load.
