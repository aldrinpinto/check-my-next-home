# Flood rivers & sea fixture (plan step M5.1)

Real features captured on 12 Nov 2026 from the Environment
Agency's Risk of Flooding from Rivers and Sea — the likelihood
of flooding deeper than 0 m, taking flood defences into
account — read through the Defra Data Services Platform OGC
API Features service (collection `rofrs_4band`, dataset
96ab4342-82c1-4095-87f1-0082e8d84ef1). Open Government
Licence; © Environment Agency copyright and/or database
right. The filed edition is the one the service was built
from on capture day: revised 3 Nov 2026 (the WMS build layer
is `rofrs_4band_03_11_2026`).

Selection: every feature intersecting a box around a golden
home — Birkdale ±0.03°, Exeter ±0.02°, Epsom ±0.02° —
deduplicated by feature id. 143 features: High 41, Low 41,
Medium 33, Very low 28. The capture is held as two numbered
parts whose feature arrays concatenate to the whole, in
order — the loader and the tests read them that way.

Golden facts these features must reproduce (recomputed from
this capture with exact point-in-polygon; they agree with
the M5.1 prep's figures):

- Exeter (E16 1GN): a filed "Very low" polygon covers the
  point — the defences-counted half of the step's Exeter
  composition (Flood Zone 3 in the zones layer, Very low
  here, same point, both true). The nearest other polygon is
  High at 0.159 miles.
- Birkdale (CM3 2JT): NO shape at the point; the nearest is
  Low at 0.84 miles. This absence is a different fact from
  Exeter's filed "Very low" and must never be served as if
  it were the same (gap L6) — the loader files no synthetic
  absence polygon for it.
- Epsom (KT17 1FH): no shape at the point; nearest Low at
  0.40 miles.
