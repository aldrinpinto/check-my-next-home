# Nature designations fixture (plan step M5.3)

Real features captured on 12 Nov 2026 from Natural England's
ArcGIS services — the six datasets the designations loader uses
live (SSSI, SAC, SPA, Ramsar, and the two Ancient Woodland
inventories, original and revised).

Selection: every feature intersecting the prep's 6-mile-square
box around a golden home (the same boxes the M5.3 prep read),
deduplicated by OBJECTID across the three boxes. Counts:
SSSI 29, SAC 18, SPA 18, Ramsar 18, ancient woodland (original)
498, ancient woodland (revised) 540. The boxes hold designated
SAC features only — the 36 candidate features (6 sites) sit
outside them and their exclusion is proven by the loader's live
run record, not by this fixture.

Two captures are held as numbered parts (sssi-1/-2 and
ancient-woodland-revised-1/-2): the files exceed the GitHub
connector's request-size limit, and the parts' feature arrays
concatenate to the capture, in order — the loader and the
tests read them that way.

Golden facts these features must reproduce: no golden home
inside any of the six layers; SSSI nearests — Woodham Walter
Common 2.88 miles (Birkdale), Gilbert's Pit (Charlton) 1.90
(Exeter), Stones Road Pond 0.67 and Epsom and Ashtead Commons
1.79 (Epsom); SAC nearests — Essex Estuaries 4.36, Epping
Forest 4.07, Mole Gap to Reigate Escarpment 5.00; the Blackwater
stack at Birkdale — SPA and Ramsar the same named ground at the
same 4.36 miles with areas equal to five decimal places, filed
as two designations of one place; and the ancient-woodland pair
each single-inventory load gets wrong — Birkdale's nearest
original is Titbeech Wood at 0.85 while the revision's unnamed
polygon sits at 0.39, Epsom's nearest original is an unnamed
polygon at 1.41 while the revision alone would say Castle Hill
Wood at 2.11. In the fixture merge, 167 of the 498 originals
intersect a revised polygon (Titbeech Wood among them) and are
replaced, filing 871 woodland polygons.
