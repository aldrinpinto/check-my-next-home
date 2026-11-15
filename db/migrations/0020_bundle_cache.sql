-- Migration 0020 — the brain's bundle cache (plan step M6.8,
-- decision D29).
--
-- One row per computed brain bundle: crime, flood, nearby and
-- the area bundle (sold prices is deliberately not cached — its
-- warm read is one indexed query and its one real cost, the
-- cold load, is already paid once per postcode by design).
-- The cache is owned by the brain alone: no loader ever reads
-- or writes this table, which is why the entries do not live
-- in postcode_cache.answers — that column's keys are
-- loader-owned artefacts that four loaders merge into
-- carefully, and computed bundles are a different ownership.
--
-- The key is (postcode, brain, rung, home_key): the rung is
-- part of the key so a rung-1 entry can never serve a rung-2
-- reader (the ladder's structural honesty), and the home key
-- carries the resolved home's identity at rung 1 (PAON | SAON
-- | street, in matching normal form) and the narrowing
-- (street | building) at rung 2. The postcode-point brains
-- (crime, flood, nearby) have no home dimension and file
-- under the empty home key. Rungs 3 and 4 are never cached:
-- they are constant named states, and a frozen reason string
-- is a liability, not an asset.
--
-- Invalidation is a version vector, never a TTL. `version`
-- holds, per entry, the last-success stamps (from
-- loader_run_items) of the loader items the brain's answer
-- depends on, plus the filed guard counts for the filings
-- that can move no stamp — the hand-run operator jobs (noise,
-- priority habitats) and the brain-invoked cold loads, whose
-- artefacts are guarded by content hash. A read recomputes
-- the current vector and compares: any difference is a miss,
-- and the bundle is recomputed and the entry overwritten. A
-- TTL could serve a superseded edition as current between a
-- filing and its expiry; the version rule cannot (D9: every
-- served figure keeps its source and date).
--
-- Writes are best-effort: a failed cache write must never
-- fail the check, the same rule migration 0006 set for the
-- run record. Entries are never deleted by the loaders or
-- the runner; a stale entry is inert weight until its key is
-- next requested and overwritten.

CREATE TABLE bundle_cache (
  postcode text NOT NULL,
  brain text NOT NULL,
  rung integer NOT NULL,
  home_key text NOT NULL DEFAULT '',
  version jsonb NOT NULL,
  bundle jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (postcode, brain, rung, home_key)
);
