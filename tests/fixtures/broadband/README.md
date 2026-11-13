# Broadband fixture (plan step M5.9) — REAL PATH SHAPE, INVENTED VALUES

The founder's live run on 13 Nov 2026 proved the real Connected
Nations Spring 2026 structure. The fixed-broadband release ZIP is
named `202601_fixed_broadband_coverage_and_full_fibre_take-up-r1.zip`.
Inside its `202601_fixed_broadband_coverage_and_full_fibre_take-up (v2)`
folder, the all-premises postcode files are held at:

`202601_fixed_pc_coverage/postcode_files_r2/202601_fixed_pc_coverage_r2_<AREA>.csv`

This fixture reproduces that path and basename shape for CM, E and
KT, carrying the documented column headers. The release snapshot is
2026-01 and the all-premises revision is r2.

The same release also contains a separate residential series at
`202601_fixed_pc_coverage/postcode_res_files_r1/202601_fixed_pc_coverage_res_r1_<AREA>.csv`.
That r1 series is deliberately **not** filed: Check My Next Home
files the all-premises series only.

Every value in these CSVs is **illustrative and invented for the
fixture**. In particular, CM3 2JT's invented gigabit value is used
by the remote practice assertion to prove the filing path; it is
not a measured Ofcom figure. Do not quote these numbers anywhere.

Speed-band definition (Ofcom, "About this data — fixed broadband
coverage and full fibre take-up 2026", v2): each band is the
percentage of ALL premises in the postcode whose maximum download
speed falls in that range. Premises that could not be matched to
a provider record with a non-zero predicted speed are
unclassified — they count in the denominator but sit in no band —
so the six bands legitimately sum to **less** than 100, the
shortfall is the postcode's unclassified share, and a sum of
exactly 0 is legitimate. Two fixture rows pin this: CM9 9AA's
bands sum to 88.9 (an 11.1 unclassified share) and CM8 8AA's
bands are all zero. Only a sum over 100 fails the load.
