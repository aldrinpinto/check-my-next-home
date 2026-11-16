# Heritage fixture (plan step M5.2)

Real rows captured on 12 Nov 2026 from the planning.data.gov.uk
bulk files the loader uses live (listed-building,
scheduled-monument) — Historic England's National Heritage List
republished, so references are NHLE entry numbers.

Four more datasets were added at M6.21 (decision D41), cut from
the live files on 16 Nov 2026: world-heritage-site (references
1000092, 1000096, 1000103, 1000104 — the last is Liverpool,
delisted and ended in both its entries), world-heritage-site-
buffer-zone (1000096, 1000102, 1466112),
battlefield (1000001, 1000017, 1000019) and protected-wreck-
site (1000045, 1000088, plus the ended 1000047). The world
heritage and battlefield files double every site — a geometry
row and a nameless geometry-less stub sharing the reference —
so their cuts hold both rows of each chosen reference. Golden
facts: no golden home is inside any of the four layers or
within 2 miles of one's edge; the Bath witness point (51.3811,
-2.3590) falls inside the City of Bath world heritage site
(1000103). Only 9 buffer zones are published nationally, and
Bath has none — the buffer-zone absence at Bath is a
publication fact, not a capture gap.

Selection: listed buildings whose point falls within 2.05 miles
of a golden home (any status), the file's one anomalous "NL"
grade row (Barton Hill Engine Sheds, 1495697), one known
delisted building (1338507, ended 2023-07-27) and two current
buildings with no published point; scheduled monuments whose
point falls within 3.5 miles of a golden home, plus one ended
monument (1002166).

Golden facts these rows must reproduce: listed buildings
within 2 miles — Birkdale 102 (nearest White Hart Cottage,
1123430, Grade II, 0.19 miles), Exeter 215 (nearest 1406622,
0.32 miles), Epsom 315 (nearest Pit House, 1214537, 0.17
miles). The counts are on the prep's haversine basis (earth
radius 3956 miles): NHLE 1289552 sits at 2.000–2.001 miles
from the Exeter home, so the basis decides whether it counts —
with the locked basis it does. Monuments: no golden home
inside any; nearest Hatfield Priory (1002150) 0.49 miles from
Birkdale, the Beckton gun emplacements (1003473) 0.92 from
Exeter, and for the flat the church tower (1003721) at 0.44
with Nonsuch Palace (1017998) at 0.45.
