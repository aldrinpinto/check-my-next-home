# PVGIS fixture (plan step M5.18)

`responses.json` holds the PVGIS PVcalc API responses for the
three golden cells, captured verbatim from
`https://re.jrc.ec.europa.eu/api/v5_3/PVcalc` on 15 November
2026 at the loader's standard basis (1 kWp, slope 35°,
azimuth 0° = south, building-integrated, crystalline silicon,
system loss 14%, PVGIS-SARAH3 2005–2023):

| cell (centre)         | contains               | yield (kWh/kWp/yr) | in-plane irradiation (kWh/m²/yr) |
| --------------------- | ---------------------- | ------------------ | -------------------------------- |
| 51.75, 0.65           | 19 Birkdale Rise CM3 2JT | 1057.65          | 1336.65                          |
| 51.55, 0.05           | 6 Exeter Road E16 1GN    | 1009.96          | 1289.44                          |
| 51.35, -0.25          | Minerva House KT17 1FH   | 991.49           | 1264.87                          |

The same API at the golden POSTCODE points (not the cell
centres) returns 1049.85 / 1004.16 / 991.41 kWh per kWp — the
cell values differ by +7.8 / +5.8 / +0.1, the honest size of
the 0.1° grain, named in the golden matrix. The fixture proves
the parse, the basis contract and the golden cells, not a
national sampling pass.
