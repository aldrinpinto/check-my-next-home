# Flood rivers & sea — climate scenario fixture (plan step M6.28)

Real features captured on 16 Nov 2026 from the Environment
Agency's Risk of Flooding from Rivers and Sea – Climate
Change 1 — the likelihood of flooding deeper than 0 m under
ONE published climate scenario (UKCP18, RCP 8.5), taking
flood defences into account — read through the Defra Data
Services Platform OGC API Features service (collection
`rofrs_cc01_4band`, dataset
de4079f2-3569-45b2-8009-a00bccc520a1). Open Government
Licence; © Environment Agency copyright and/or database
right. The filed edition is the one the service was built
from on capture day: revised 3 Nov 2026 (the WMS build
layer is `rofrs_cc01_4band_03_11_2026`). The service's
unfiltered count on capture day was 252,932.

Selection: every feature intersecting a ±0.01° box around a
golden home (Birkdale, Exeter, Epsom), in fetch order. 37
features: Low 11, Very low 9, Medium 9, High 8. The capture
is a single file — the loader and the tests read numbered
parts too, should a recapture outgrow one file.

Golden facts these features must reproduce (recomputed from
this capture with exact point-in-polygon; they agree with
the M6.28 prep's live reads):

- Exeter (E16 1GN): a filed "Low" polygon covers the point
  under the scenario. Present day serves "Very low" at the
  same point — the two are facts of two different maps and
  are never served as a comparison; this fixture locks the
  scenario fact only.
- Birkdale (CM3 2JT): NO shape at the point — and no
  feature in the whole box. Under the scenario this product
  publishes no band for that ground; absence is not a band
  and no synthetic polygon is filed for it.
- Epsom (KT17 1FH): no shape at the point (six features in
  the box, none covering). Absence here, as at Birkdale, is
  the state "no band published", never an inferred band.
