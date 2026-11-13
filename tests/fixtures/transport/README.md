# Transport fixture (plan step M5.5)

Real rows captured on 13 Nov 2026 from the NaPTAN national
file (Department for Transport, via the NaPTAN API — the whole
of GB as one CSV, 435,812 rows, Open Government Licence v3.0),
held here as `naptan.csv` with the source's full 43-column
header and every row byte-for-byte as published.

Selection: every row whose position (published coordinates, or
the OS grid reference converted) falls within a radius of a
golden home — 1.7 mi of 6 Exeter Road E16 1GN, 2.7 mi of
19 Birkdale Rise CM3 2JT, 1.5 mi of Flat 4 Minerva House
KT17 1FH, 1.1 mi of CF11 8AA (Cardiff, C8), 5.1 mi of CB6 1EH
(Hilgay, C9) and 5.1 mi of CM5 0DR (High Laver, C3) — plus the
eleven grid-only Elizabeth line rail rows by ATCO code,
wherever they sit. 1,706 rows in all; all statuses and stop
types are carried, so the loader's own filters do the work in
fixture mode exactly as live.

Under the loader's rules the capture files 1,481 stops across
8 of the nine families (BCT 1354, TMU 45, RLY 25, MET 24,
BCS 13, FBT 9, FER 8, FTD 3 — no BST row falls in the capture
radii), 97 of them converted from grid references, with 153
inactive rows carried in the capture and excluded.

Golden facts these rows must reproduce: the step's check —
the Custom House station point 4900ZZDLCUS1 at 0.440 mi from
the Exeter home, with the whole station family around it
(MET 0.448, platform 0.460, entrance 0.470, the grid-only rail
row 0.488, second point 0.504) and Royal Victoria's nearer
point (0.414) present as the honesty counterexample; Canning
Town's Underground station point at 0.564 and its closed rail
station 9100CNTN inactive in the capture, never filed; West
Ham's superseded 9100WHAM excluded, live 9100WHAMHL filed;
the Hilgay grid-only bus pair (0500ELITP026 / 0500ELITP036)
at 0.044 mi — all 7 bus stops within 2 miles of that home are
grid-only rows — with Littleport station at 3.208 and 86 bus
stops within 5 miles; Birkdale's Hatfield Peverel at 0.563,
the New Road pair at 0.124/0.126 and 13 bus stops within half
a mile; the Epsom flat's station Ewell East at 0.246 (Ewell
West 0.570, Epsom 1.170) and Hazel Mead bus stop at 0.128;
Cardiff's Grangetown at 0.136 and Penarth Road at 0.077,
filed from the same capture as the English rows; High
Laver's Harlow Mill at 4.531 with Mill Lane bus stop at
0.243; and all eleven Elizabeth line rail rows grid-only in
the source, filed converted.
