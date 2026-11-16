# Brownfield fixture (plan step M6.21)

Real rows captured on 16 Nov 2026 from the planning.data.gov.uk
bulk file the loader uses live (brownfield-land.csv, the unified
national dataset built from councils' own brownfield registers,
Open Government Licence v3.0).

Selection: every row — current or ended — whose published point
falls within 3 miles of a golden home (Birkdale CM3 2JT, Exeter
E16 1GN, Minerva KT17 1FH), cut from the live file of 40,229
rows (32,352 current nationally at capture). 520 rows: 464
current, 56 ended.

Golden facts these rows must reproduce, under the loader's
filing rules (ended excluded; republication dedupe on
reference + organisation; same-site collapse on point to 4dp +
normalised address, newest entry kept): 334 sites filed, 16
supplying organisations. Within 2 miles (haversine, earth
radius 3956 miles) — Birkdale 2 (nearest Universal Garage, The
Street, Hatfield Peverel, 0.252 miles, permissioned, 0.22
hectares, 9/9 net dwellings), Exeter 97 (nearest 45 Beckton
Road, Canning Town, London, E16 4EA, 0.163 miles — recorded by
both Newham and the Greater London Authority and collapsed to
one site), Minerva 30 (nearest Etwell House and former coach,
Station Approach, 0.227 miles — recorded by Epsom and Ewell
under two references, "1" and "194", and collapsed to one
site).
