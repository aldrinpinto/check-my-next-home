# Flood zones fixture (plan step M5.1)

Real features captured on 12 Nov 2026 from the Environment
Agency's Flood Map for Planning — Flood Zones 2 and 3, read
through the Defra Data Services Platform OGC API Features
service (collection `Flood_Zones_2_3_Rivers_and_Sea`, dataset
04532375-a198-476e-985e-0579a0a11b47). Open Government
Licence; © Environment Agency copyright and/or database
right. The filed edition is the one the service was built
from on capture day: revised 21 Oct 2026 (the WMS build layer
is `Flood_Zones_2_3_Rivers_and_Sea_21_10_2026`).

Selection: every feature intersecting a box around a golden
home — Birkdale ±0.03°, Exeter ±0.02°, Epsom ±0.02° —
deduplicated by feature id. 462 features: 339 FZ3, 123 FZ2;
sources "river and sea" 242, "river" 119, "sea" 101. The
capture is held as three numbered parts whose feature arrays
concatenate to the whole, in order — the files exceed the
GitHub connector's request-size limit, and the loader and
the tests read them that way.

Golden facts these features must reproduce (recomputed from
this capture with exact point-in-polygon; the M5.1 prep's
figures agree except where noted):

- Birkdale (CM3 2JT): inside no zone; the nearest edge is an
  FZ2 (source "river") at 0.84 miles — the step's "outside
  every rivers/sea shape" check, zone half.
- Exeter (E16 1GN): inside exactly one zone polygon — FZ3,
  feature Flood_Zones_2_3_Rivers_and_Sea.155716, source
  "river and sea", origin "modelled". NOTE: the prep's
  golden-reads recorded the origin as "modelled and
  recorded"; that value belongs to a neighbouring FZ3
  feature, not the covering one — the covering feature says
  "modelled" in this capture and in the prep's own evidence
  file alike, and the loader's golden check pins "modelled".
- Epsom (KT17 1FH): inside no zone; nearest FZ2 (river) at
  0.40 miles, FZ3 at 0.41.
- No golden point is inside both an FZ2 and an FZ3 polygon.
