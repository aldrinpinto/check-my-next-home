# Air quality fixture (plan step M5.9)

The three files keep their published names and shapes — five
metadata lines, then `gridcode,x,y,<value>` — with only the three
golden 1 km squares retained, cut verbatim from Defra's PCM 2024
background-map CSVs (UK-AIR datastore) on 13 November 2026:

| gridcode | centre (EPSG:27700) | square containing | NO2 | PM2.5 | PM10 |
| --- | --- | --- | --- | --- | --- |
| 751310 | 579500, 211500 | 19 Birkdale Rise CM3 2JT | 8.150298 | 7.124671 | 12.54823 |
| 771971 | 540500, 181500 | 6 Exeter Road E16 1GN | 21.71409 | 9.939679 | 16.97423 |
| 785063 | 522500, 162500 | Minerva House KT17 1FH | 12.49256 | 7.868347 | 12.10357 |

Concentrations are annual means in µg/m³ at full published
precision. The full files carry 254,905 squares each; the fixture
proves the parse, the three-file join and the golden cells, not the
national count.
