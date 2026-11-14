# Nearby brain fixture (plan step M6.2)

`health-points.json` — the `health_points` rows exactly as the
health loader files them, captured so the brain tests
(`tests/nearby.test.ts`) can build their source from filed truth
without re-deriving the loader's CQC ratings aggregation inline
(that pipeline is the loader's own, proven by
`tests/load-health.test.ts`).

Provenance: generated 14 Nov 2026 by running the loader in
fixture mode against the local PGlite rehearsal database and
dumping the filed table:

```
node db/migrate.mjs
node loaders/load-health.mjs --file tests/fixtures/health
SELECT service_type, ods_code, name, parent_ods_code,
       has_emergency_department, latitude, longitude
FROM health_points ORDER BY service_type, ods_code
```

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
