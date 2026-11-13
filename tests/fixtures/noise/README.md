# Noise fixture (plan step M5.9)

`noise-samples.csv` holds the grid values at four golden postcodes,
measured by the M5.9 build on 13 November 2026 through Defra's own
WMS GetFeatureInfo (the publisher's point-sampling route — the same
values the loader's `--verify-only` re-checks live):

| Postcode | Source | Lday | Lnight | Filed bands |
| --- | --- | --- | --- | --- |
| CM3 2JT (Birkdale) | road | 49.39 | 42.53 | Below 55 dB / Below 50 dB |
| | rail | 0 | 0 | No modelled rail noise |
| | airport | nodata | nodata | No modelled airport noise |
| E16 1GN (Exeter Road) | road | 55.20 | 41.82 | 55–59 dB / Below 50 dB |
| | rail | 0 | 0 | No modelled rail noise |
| | airport | 45.20 | nodata | Below 55 dB / No modelled airport noise |
| KT17 1FH (Minerva House) | road | 57.60 | 49.08 | 55–59 dB / Below 50 dB |
| | rail | 0 | 0 | No modelled rail noise |
| | airport | nodata | nodata | No modelled airport noise |
| KT17 1DR (Ewell Village, C1) | road | 47.22 | 38.77 | Below 55 dB / Below 50 dB |
| | rail | 53.84 | 49.48 | Below 55 dB / Below 50 dB |
| | airport | nodata | nodata | No modelled airport noise |

Semantics, as published: a value of 0 means no contribution above
the mapping floor was modelled at the point (never "0 dB");
`nodata` means the point is outside the modelled extent. Exeter
Road's airport row is the London City Airport case — a real daytime
value below the first band, and no night model (the airport's night
operations are not modelled there). KT17 1DR is the rail-adjacent
golden (Ewell Village station, 0.021 mi): genuine below-range rail
values, not zeros.
