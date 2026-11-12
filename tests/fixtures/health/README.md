# Health fixture (plan step M4.7)

Real data captured on 12 Nov 2026 from the live sources the loader
uses: the four ODS Data Search and Export reports (rows within
7 miles of a golden home, plus named extras — a Welsh practice and
pharmacy, a DORMANT practice, a Scottish row, a closed branch and
an undated COVID branch), the CQC directory of 4 Nov 2026
(Hospital-type rows near the homes plus the named golden
hospitals), plus the Locations rows of CQC's real 02 Nov 2026 ratings file
for the fixture's locations.

`postcodes.json` holds the ONSPD August 2026 centroids for every
postcode used — the loader positions points from it in fixture
mode, exactly as it uses the postcode directory table live. The
ratings rows ship as `cqc-ratings.csv`, the verbatim Locations
rows of CQC's real 02 Nov 2026 ratings file for the fixture's
locations, converted from the original spreadsheet because the
repository's push route carries text only; the loader's fixture
mode feeds them through the same row aggregation the live
streaming parser uses.

Golden facts these rows must reproduce: the nearest GP point to
CM3 2JT is the Sidney House branch (F81149002, of The Laurels
F81149) at 0.37 mi, never the Witham main site; St Luke's exists
only as branch F84749002 of Carpenters Practice; the dermatology
clinic F84750 is in the raw register and must be excluded; the
three emergency-flag states sit around CM3 (St Peter's no data,
Springfield false, Broomfield true); Newham's flag is true with
Requires improvement published 17 Jul 2026; Epsom's flag is true
with Good published 11 Jun 2026; the two KT17 practices tie at
0.46 mi; and no pharmacy, dentist or Welsh point carries a rating.
