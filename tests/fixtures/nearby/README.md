# Nearby brain fixture (plan step M6.2)

`health-points.json` — the `health_points` rows exactly as the
health loader files them, captured so the brain tests
(`tests/nearby.test.ts`) can build their source from filed truth
without re-deriving the loader's CQC ratings aggregation inline
(that pipeline is the loader's own, proven by
`tests/load-health.test.ts`).

`health-ratings.json` — the `cqc_ratings` rows from the same
filing (added at M6.25, when the brain began serving them),
keyed by the rated point's ODS code: the portable form of the
loader's filed `health_point_id` link. One row per rated point
(499 in this capture: 494 on GP practice points, 5 on hospital
points; none on branch surgeries, dentists or pharmacies).

Provenance: generated 14 Nov 2026 by running the loader in
fixture mode against the local PGlite rehearsal database and
dumping the filed table:

```
node db/migrate.mjs
node loaders/load-health.mjs --file tests/fixtures/health
SELECT service_type, ods_code, name, parent_ods_code,
       has_emergency_department, cqc_population_groups,
       latitude, longitude
FROM health_points ORDER BY service_type, ods_code
SELECT hp.ods_code, cr.cqc_location_id, cr.rating,
       cr.rating_date::text AS rating_date, cr.report_url
FROM cqc_ratings cr JOIN health_points hp ON hp.id = cr.health_point_id
ORDER BY hp.ods_code
```

Regenerated 16 Nov 2026 for M6.24 with the same recipe: the
only change against the previous capture is the added
`cqc_population_groups` column (migration 0023) — every
pre-existing field is identical, and exactly the four
hospitals whose ratings rows carry a Maternity group
(R1HNH, RAJ32, RVR05, RVR50) file it.

The ratings capture was added 16 Nov 2026 for M6.25 from the
same filing (the loader reported 499 ratings joined, golden
homes OK): the points capture is unchanged.

The run filed 2,322 rows (522 practices, 133 branch surgeries,
834 pharmacies, 779 dentists, 54 hospitals) from the ODS
2026-11-12 / CQC directory 2026-11-04 / ratings 2026-11-02
captures in `tests/fixtures/health`, and its golden checks
passed ("golden homes OK"). Regenerate the same way if the
health fixture is ever recaptured.

There is deliberately NO nurseries capture here: no loader
files the `nurseries` table (it exists in migration 0001 and
the practice seed only). The brain serves the category from
whatever is filed; the M6.2 tests exercise its behaviour on
clearly-labelled synthetic rows and lock no nursery goldens.
