# Schools fixture (plan step M4.6)

Real rows captured on 12 Nov 2026 from the two official files the
loader uses live — the GIAS extract of 12 Nov 2026 (Windows-1252,
kept in its real encoding so the decoder is exercised) and Ofsted's
management-information "latest inspections" file as at 31 Oct 2026.

The GIAS rows are the union of: the 17 open secondaries in Newham;
the five nearest selective secondaries to E16 1GN; the six golden
schools nearest CM3 2JT; three selective examples (Barnet, Bromley,
Enfield); every open school within 2 miles of KT17 1FH (35 schools —
the flat's set, including its Catholic primary and the girls'
grammar 1.25 miles away); three open schools with no coordinates
of their own but a UK postcode; and one Welsh nursery school
(Estyn territory — no Ofsted row exists for it, by design).

The Ofsted rows are the same schools' rows where the state-funded
file has one (61 of 70 — independent and Welsh schools are absent
from that file, which the loader must treat as normal).

Golden facts these rows must reproduce: Newham 17 secondaries,
0 selective, 2 with no recorded admissions policy; Lift Maltings
with a 2023 grade of Requires improvement AND its March 2026
report card; Hatfield Peverel Infant with no grade but an ungraded
"School remains Good"; Blenheim High with no grade but "Standards
maintained".
