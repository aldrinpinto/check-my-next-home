# Flood surface water fixture (plan step M5.1)

Real features captured on 12 Nov 2026 from the Environment
Agency's Risk of Flooding from Surface Water — the likelihood
of flooding deeper than 0 m from rainwater that does not
drain away — read through the Defra Data Services Platform
OGC API Features service (collection `rofsw`, dataset
b5aaa28d-6eb9-460e-8d6f-43caa71fbe0e). Open Government
Licence; © Environment Agency copyright and/or database
right. The filed edition is the one the service was built
from on capture day: revised 10 Nov 2026 (the WMS build
layer is `rofsw_10_11_2026`).

Selection: every feature intersecting a ±0.02° box around a
golden home, deduplicated by feature id. 204 features: High
68, Medium 68, Low 68 — and no "Very low", because this
product has only three bands: absence here means "below the
Low threshold", a different statement from the rivers & sea
product's filed "Very low" (gap L6). The capture is held as
eleven numbered parts whose feature arrays concatenate to
the whole, in order — these are dissolved, vertex-heavy
multipolygons (the whole capture is ~34 MB), and the loader
and the tests read the parts that way. The other published
fields (`confidence`, `shape_length`, `shape_area`) are null
throughout the golden boxes and are not consumed.

Golden facts these features must reproduce (recomputed from
this capture with exact point-in-polygon; they agree with
the M5.1 prep's figures). Surface water at a point is a
near-miss science, so the pins are proximity facts — nearest
band plus distance — not bare bands (gap L3):

- Epsom (KT17 1FH): the point band is Low; Medium is mapped
  0.007 miles away and High 0.028.
- Exeter (E16 1GN): NO shape at the point; Low is mapped
  0.005 miles away (≈9 metres), High 0.016, Medium 0.017.
  (The EA WMS's pixel sampling answers "Low" at this point;
  the published polygons say no shape covers it. Both are
  recorded in the prep — the loader files the polygons
  exactly as published and the serving rule is M6's.)
- Birkdale (CM3 2JT): no shape at the point; Low 0.030
  miles, Medium 0.031, High 0.079.
