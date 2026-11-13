# IMD fixture (plan step M5.9)

`iod2025-file7.csv` is the published header plus three rows cut
verbatim from **File 7 of the English Indices of Deprivation 2025**
(MHCLG, published 30 October 2025; the v2 re-issue after the ONS
lookup correction), taken from the live download on 13 November 2026
during the M5.9 build's verify-only pull:

| LSOA | Area | IMD score | rank | decile |
| --- | --- | --- | --- | --- |
| E01021395 | Braintree 018C (19 Birkdale Rise) | 9.497 | 25,570 | 8 |
| E01003511 | Newham 036A (6 Exeter Road) | 29.212 | 8,676 | 3 |
| E01030396 | Epsom and Ewell 010D (Minerva House) | 2.986 | 32,740 | 10 |

The full published file carries 33,755 LSOA rows and 56 columns; the
fixture keeps every column so the loader's header contract is tested
against the real shape, including the two headers that wrap across
lines inside quotes. Figures are as published — scores, ranks and
deciles are never recomputed.
