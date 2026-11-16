# Flood surface water — climate scenario fixture (plan step M6.28)

Real features captured on 16 Nov 2026 from the Environment
Agency's Risk of Flooding from Surface Water – Climate
Change 1 — the likelihood of flooding deeper than 0 m under
ONE published climate scenario (UKCP18, RCP 8.5; Central
allowance for the 2050s epoch) — read through the Defra
Data Services Platform OGC API Features service (collection
`rofsw_cc01`, dataset e5b38de2-99b3-44ee-b10c-b244926878ef).
Open Government Licence; © Environment Agency copyright
and/or database right. The filed edition is the one the
service was built from on capture day: revised 10 Nov 2026
(the WMS build layer is `rofsw_cc01_10_11_2026`). The
service's unfiltered count on capture day was 406,734.

Selection: every feature intersecting a ±0.01° box around a
golden home (Birkdale, Exeter, Epsom), in fetch order. 69
features: High 23, Medium 23, Low 23. The features carry
`risk_band`, `shape_length` and `shape_area` — this product
publishes NO `confidence` field (its present-day sibling
does; nothing consumes it in either loader). The capture is
held as six numbered parts whose feature arrays concatenate
to the whole, in order — the loader and the tests read them
that way. Surface water geometry is heavy (about 749,000
vertices in this capture); the parts exist for that reason.

Golden facts these features must reproduce (recomputed from
this capture with exact point-in-polygon; they agree with
the M6.28 prep's live reads):

- Epsom (KT17 1FH): a filed "Low" polygon covers the point
  under the scenario — the one covering fact in this
  product's golden set.
- Birkdale (CM3 2JT): NO shape at the point (18 features in
  the box, none covering).
- Exeter (E16 1GN): NO shape at the point (27 features in
  the box, none covering).

At all three homes the covering state is the whole golden
fact: this scenario product's absence state is "no band
published for this point under the scenario" — not the
present-day surface water product's below-the-lowest-band
reading, and never an inferred band.
