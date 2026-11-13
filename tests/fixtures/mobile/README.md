# Mobile fixture (plan step M5.9) — REAL HEADER SHAPE, INVENTED VALUES

`202601_mobile_coverage_laua_r01.csv` reproduces the header shape
of Ofcom's Connected Nations Spring 2026 mobile file at **local
authority level** (Ofcom publishes no postcode-level mobile file),
as proven by the founder's live run on 13 Nov 2026: the three
golden homes' authorities with the full published column set —
2G, 3G, 4G and Voice (operator counts to 3 for 2G, to 4 for 3G,
4G and Voice — the real file publishes `Voice_prem_out_4` with
values; an earlier fixture revision stopped Voice at 3 on a
mis-reading) plus the four 5G families (ordinary and Standalone,
high and very high confidence; premises-outdoor and geographic
columns only). The Spring 2026 file has **no `Data_*` columns** —
the aggregate Data service in older Ofcom documentation is gone —
and the 5G SA four-operator columns are present but empty, as
published. All coverage values are invented for the fixture.

**The empty-cell convention is reproduced, not tidied away.**
Ofcom writes an exact zero as an empty cell in the
operator-count percentage columns — proven by the founder's v6
live run (13 Nov 2026), whose printed raw rows show Braintree's
real `4G_prem_out_0` empty with `_1`..`_4` summing to exactly
100, and Newham's `_0`..`_3` empty beside `_4 = 100`. A column
empty in *every* row is a different thing: an unpublished
combination (the About-this-data documents all 3G columns for
2/3/4 operators and all 5G SA columns for 4 operators as empty
file-wide) and files as null. So Braintree here carries empty
`_0` cells whose siblings carry the full 100; Newham is the
full-coverage shape (`_4 = 100`, siblings empty, 5G SA
all-operators still null); Epsom and Ewell is all-numeric — and
carries a numeric cell in every consumed `_0` column, which in
a three-row excerpt is what keeps those columns "live" rather
than file-wide empty. The tests pin each filed shape.

No figure here is a measured Ofcom figure. The header contract
was corrected against the real file after the founder's runs,
and the v6 run passed end-to-end against the real release; its
raw rows exposed the empty-cell mis-reading the loader and this
fixture now embody. The laua codes (E07000067
Braintree, E09000025 Newham, E07000071 Epsom and Ewell) are
genuine ONS codes — directory facts, not coverage data.

The CSV ends with an empty row spanning all 161 columns, as the
real file does (the founder's second live run, 13 Nov 2026, failed
on exactly that row before the parser learned to skip all-empty
records). Do not tidy it away: the fixture tests pin that a
trailing all-empty record is skipped, while a row carrying values
but no authority code or name still fails the load.
