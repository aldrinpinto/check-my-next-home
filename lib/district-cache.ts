import type { AddressQueryable } from "./address";
import {
  composeDistrictWarnings,
  DISTRICT_WARNINGS_UNAVAILABLE,
  startDistrictBuild,
  type DistrictBuild,
  type DistrictBundle,
  type DistrictBundleOptions,
  type DistrictDataSource,
} from "./district";

// The district bundle cache (founder fix batch, 19 Nov
// 2026 — audit Part 3, the district latency item).
//
// The district page measured 12–14s a view, repeats no
// faster: every serve rebuilt the whole district bundle
// from its filed rows. District facts change only on
// re-filing, so the bundle takes the D29 pattern — the
// same discipline lib/bundle-cache.ts runs for the four
// postcode brains, keyed by outward instead of postcode:
//
//   - The key is (outward, brain "district", rung 3, the
//     empty home key) in migration 0020's bundle_cache
//     table — the brain column is unconstrained text, so
//     no migration is needed. The rung is 3 because the
//     district page IS the rung-3 serve; a rung-1/2 entry
//     can never collide with it.
//   - Invalidation is a VERSION VECTOR, never a TTL: the
//     last-success stamps (loader_run_items) of the
//     loader items the district bundle reads, plus
//     district-scoped GUARD COUNTS for the filings that
//     can move no stamp — hand-run loaders, and the
//     Ofcom answers' content hashes (the M6.17 operator
//     trap in its exact shape: load-broadband and
//     load-mobile file into postcode_cache.answers from
//     entry points that bypass the runner).
//   - A miss is exactly the plain builder. Absent entry,
//     moved version, shape-disagreeing entry, missing
//     cache table — every failure path lands on
//     buildDistrictBundle unchanged, and a failed cache
//     write never fails the page.
//   - Live flood warnings are NEVER stored (the flood
//     brain's D42 rule): the entry holds the bundle with
//     its warnings stripped to the unavailable
//     placeholder, and every serve — hit or miss path's
//     stored copy aside — composes the warnings fresh
//     through composeDistrictWarnings. The refresh reads
//     the district's postcode rows once (an indexed read)
//     for the spread; everything else in the bundle is
//     served from the entry untouched.
//   - The version is read BEFORE the compute, exactly as
//     in the D29 serve path: an entry written from it can
//     only vouch for data at most as new as the bundle it
//     sits beside.

// The loader items the district bundle's answer depends
// on — the stamps half of the version vector, following
// the reads createDistrictSource actually makes (the
// directory, sales, census and its bases, IMD, council
// tax, schools, health points, transport stops, the two
// Ofcom filings, the three flood layers and the
// defences, air, and the picking index with the EPC
// index its rows derive from). Pinned by test against
// LOADER_SCHEDULE (loaders/run-loaders.mjs), in the D29
// pattern: renaming a loader item fails the test loudly
// instead of silently un-invalidating the district page.
export const DISTRICT_DEPENDENCIES: readonly string[] = [
  "load-postcodes",
  "load-sold-prices",
  "load-census",
  "load-lsoa-bases",
  "load-imd",
  "load-council-tax",
  "load-schools",
  "load-health",
  "load-transport",
  "load-broadband",
  "load-mobile",
  "load-flood-zones",
  "load-flood-rivers-sea",
  "load-flood-surface-water",
  "load-flood-defences",
  "load-air-quality",
  "load-picking-index",
  "load-epc-index",
];

// ------------------------------------------------------------------
// The version vector (the D29 forms, restated for the
// outward key — bundle-cache.ts's copies are keyed by
// resolution and are not shared)
// ------------------------------------------------------------------

export interface DistrictVersion {
  stamps: Record<string, string | null>;
  guards: Record<string, number | string | null>;
}

// Canonical serialisation for version comparison: JSONB
// does not preserve key order, so both sides are compared
// through a key-sorted form.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

function versionsEqual(a: DistrictVersion, b: DistrictVersion): boolean {
  return canonical(a) === canonical(b);
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function readStamps(
  db: AddressQueryable,
  items: readonly string[],
): Promise<Record<string, string | null>> {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (item) item, finished_at
     FROM loader_run_items
     WHERE item = ANY($1) AND status = 'succeeded' AND finished_at IS NOT NULL
     ORDER BY item, finished_at DESC`,
    [items],
  );
  const latest = new Map(rows.map((row) => [row.item as string, toIso(row.finished_at)]));
  const stamps: Record<string, string | null> = {};
  for (const item of items) stamps[item] = latest.get(item) ?? null;
  return stamps;
}

async function countOf(
  db: AddressQueryable,
  sql: string,
  params: readonly unknown[] = [],
): Promise<number> {
  const { rows } = await db.query(sql, params);
  return Number(rows[0]?.n ?? 0);
}

async function artefactHashOf(
  db: AddressQueryable,
  sql: string,
  params: readonly unknown[] = [],
): Promise<string | null> {
  const { rows } = await db.query(sql, params);
  return (rows[0]?.h as string | null) ?? null;
}

// The guards half: district-scoped filed counts and
// content hashes whose movement can change the district
// bundle without moving a runner stamp. The reads are
// independent of one another, so they run together
// (BUG-171): the version read stands in front of every
// district serve, hit or miss, and its serial form cost
// a dozen round trips end to end on a warm district.
async function districtGuards(
  db: AddressQueryable,
  outward: string,
): Promise<DistrictVersion["guards"]> {
  const prefix = `${outward} `;
  const [
    layerRowsResult,
    districtPostcodes,
    districtSales,
    pickingHomes,
    districtSchools,
    censusRows,
    lsoaBases,
    floodDefences,
    broadbandAnswers,
    mobileAnswers,
  ] = await Promise.all([
    db.query("SELECT layer_type, count(*)::int AS n FROM flood_layers GROUP BY layer_type"),
    // The district's own membership: a directory re-file
    // that adds or moves the district's postcodes moves
    // this count (and the load-postcodes stamp).
    countOf(db, "SELECT count(*)::int AS n FROM postcode_cache WHERE starts_with(postcode, $1)", [
      prefix,
    ]),
    countOf(db, "SELECT count(*)::int AS n FROM price_paid WHERE starts_with(postcode, $1)", [
      prefix,
    ]),
    countOf(db, "SELECT count(*)::int AS n FROM picking_index WHERE starts_with(postcode, $1)", [
      prefix,
    ]),
    countOf(db, "SELECT count(*)::int AS n FROM schools WHERE starts_with(postcode, $1)", [prefix]),
    countOf(
      db,
      `SELECT count(*)::int AS n FROM census_stats
       WHERE msoa_code IN (
         SELECT DISTINCT msoa_code FROM postcode_cache
         WHERE starts_with(postcode, $1) AND msoa_code IS NOT NULL
       )`,
      [prefix],
    ),
    countOf(
      db,
      `SELECT count(*)::int AS n FROM lsoa_bases
       WHERE lsoa_code IN (
         SELECT DISTINCT lsoa_code FROM postcode_cache
         WHERE starts_with(postcode, $1) AND lsoa_code IS NOT NULL
       )`,
      [prefix],
    ),
    countOf(db, "SELECT count(*)::int AS n FROM flood_defences"),
    // The Ofcom answers filed inside the district's
    // postcode rows: both loaders are directly runnable
    // outside the runner, moving no stamp, so the filed
    // answers' content hashes are the guards that move.
    artefactHashOf(
      db,
      `SELECT md5(coalesce(string_agg((answers -> 'broadband')::text, ',' ORDER BY postcode), '')) AS h
       FROM postcode_cache WHERE starts_with(postcode, $1) AND answers ? 'broadband'`,
      [prefix],
    ),
    artefactHashOf(
      db,
      `SELECT md5(coalesce(string_agg((answers -> 'mobile')::text, ',' ORDER BY postcode), '')) AS h
       FROM postcode_cache WHERE starts_with(postcode, $1) AND answers ? 'mobile'`,
      [prefix],
    ),
  ]);
  const byLayer = new Map(
    layerRowsResult.rows.map((row) => [row.layer_type as string, Number(row.n)]),
  );
  return {
    districtPostcodes,
    districtSales,
    pickingHomes,
    districtSchools,
    censusRows,
    lsoaBases,
    // The per-layer filed counts the flood source itself
    // reads — a layer's first filing (0 -> N) busts a
    // cached per-layer not-filed state, whoever ran it;
    // the defences count rides the same way (the D29
    // flood guard's own reasoning).
    floodZone: byLayer.get("flood_zone") ?? 0,
    rofrs: byLayer.get("rofrs") ?? 0,
    rofsw: byLayer.get("rofsw") ?? 0,
    floodDefences,
    broadbandAnswers,
    mobileAnswers,
  };
}

// ------------------------------------------------------------------
// The store
// ------------------------------------------------------------------

export interface DistrictCache {
  // The current version vector for an outward, or null
  // when the cache's own reads fail: the cache then steps
  // aside and the builder answers exactly as it does
  // without the cache.
  versionFor(outward: string): Promise<DistrictVersion | null>;
  readEntry(outward: string): Promise<{ version: DistrictVersion; bundle: unknown } | null>;
  // Best-effort by design: a failed write never surfaces.
  writeEntry(outward: string, version: DistrictVersion, bundle: unknown): Promise<void>;
}

const DISTRICT_BRAIN = "district";
const DISTRICT_RUNG = 3;

export function createDistrictCache(db: AddressQueryable): DistrictCache {
  return {
    async versionFor(outward) {
      try {
        // The stamps and the guards are independent
        // reads; together, not one after the other
        // (BUG-171).
        const [stamps, guards] = await Promise.all([
          readStamps(db, DISTRICT_DEPENDENCIES),
          districtGuards(db, outward),
        ]);
        return { stamps, guards };
      } catch {
        return null;
      }
    },

    async readEntry(outward) {
      try {
        const { rows } = await db.query(
          "SELECT version, bundle FROM bundle_cache WHERE postcode = $1 AND brain = $2 AND rung = $3 AND home_key = $4",
          [outward, DISTRICT_BRAIN, DISTRICT_RUNG, ""],
        );
        const row = rows[0];
        if (!row) return null;
        return { version: row.version as DistrictVersion, bundle: row.bundle };
      } catch {
        return null;
      }
    },

    async writeEntry(outward, version, bundle) {
      try {
        await db.query(
          `INSERT INTO bundle_cache (postcode, brain, rung, home_key, version, bundle)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (postcode, brain, rung, home_key)
           DO UPDATE SET version = EXCLUDED.version, bundle = EXCLUDED.bundle, computed_at = now()`,
          [
            outward,
            DISTRICT_BRAIN,
            DISTRICT_RUNG,
            "",
            JSON.stringify(version),
            JSON.stringify(bundle),
          ],
        );
      } catch {
        // Best-effort: a failed cache write must never
        // fail the page.
      }
    },
  };
}

// ------------------------------------------------------------------
// The serve path
// ------------------------------------------------------------------

// The stored bundle must agree with its own key before
// anything is served from it, and with this build's shape
// contract: the head's counties key and the flood
// section's per-layer coverage lines are this build's
// additions, so an entry written before it lacks them
// and degrades to a recompute rather than serving their
// absence as current (the D29 presence rule).
function shapeOk(bundle: unknown, outward: string): bundle is DistrictBundle {
  if (typeof bundle !== "object" || bundle === null) return false;
  const b = bundle as { kind?: unknown; outward?: unknown };
  if (b.outward !== outward) return false;
  if (b.kind === "not-covered") return true;
  if (b.kind !== "district") return false;
  const head = (bundle as { head?: unknown }).head;
  if (typeof head !== "object" || head === null || !("counties" in head)) return false;
  const sections = (bundle as { sections?: unknown }).sections;
  if (typeof sections !== "object" || sections === null) return false;
  const flood = (sections as { flood?: unknown }).flood;
  if (typeof flood !== "object" || flood === null) return false;
  if (!("riversSeaNotCoveredLine" in flood && "surfaceWaterNotCoveredLine" in flood)) return false;
  // Fix batch, 19 Nov 2026 — BUG-016: the sold section
  // gained its postcodesCovered count; an entry filed
  // before the field existed shape-disagrees and must
  // rebuild rather than serve an undefined coverage.
  const sold = (sections as { soldPrices?: unknown }).soldPrices;
  if (typeof sold !== "object" || sold === null) return false;
  return typeof (sold as { postcodesCovered?: unknown }).postcodesCovered === "number";
}

// The form stored in the entry: the filed bundle with
// its live-warnings block stripped to the unavailable
// placeholder — the block is composed fresh on every
// serve and is never in the entry at all.
function storable(bundle: DistrictBundle): DistrictBundle {
  if (bundle.kind !== "district") return bundle;
  return {
    ...bundle,
    sections: {
      ...bundle.sections,
      flood: { ...bundle.sections.flood, warnings: DISTRICT_WARNINGS_UNAVAILABLE },
    },
  };
}

// Concurrent serves of one district share one build
// (the wider-area checking build, 19 Nov 2026): the
// district page's streamed results and the checking
// screen's payload call arrive together, and on a cold
// district each would otherwise run the same 12–14s
// build for the same bundle. The registry is anchored
// to globalThis (the sold-prices loads pattern in
// lib/sold-prices.ts) because the serving runtime does
// not share one module instance between routes. A
// caller joins the in-flight build and receives the
// very bundle the first caller computes — so the
// checking screen's lines and the results behind it
// are derived from one bundle, never two builds of it.
// The entry evicts itself when the build settles,
// success or failure alike: the next serve takes the
// ordinary cache path, and a failed build is retried
// by the next serve exactly as before. One softening,
// stated plainly: the live flood warnings are composed
// inside the shared build, so two serves that join one
// build share that composition — the cache-hit path
// still refreshes the warnings on every serve, and a
// shared build is by definition one serve moment.
const districtBuildsGlobal = globalThis as typeof globalThis & {
  __cmnhDistrictBuilds?: Map<string, DistrictBuild>;
};

function districtBuildsInFlight(): Map<string, DistrictBuild> {
  districtBuildsGlobal.__cmnhDistrictBuilds ??= new Map();
  return districtBuildsGlobal.__cmnhDistrictBuilds;
}

// The staged build behind the cache (BUG-171): the
// registry now holds the build itself, not just its
// bundle, so the checking screen's per-group parts join
// the same single flight as the streamed results and
// settle section by section. Joining callers receive
// the very build the first caller started — the same
// one-bundle guarantee the promise registry gave, one
// level down.
export function districtBuildFor(
  outward: string,
  source: DistrictDataSource,
  cache: DistrictCache,
  options: DistrictBundleOptions = {},
): DistrictBuild {
  const inFlight = districtBuildsInFlight();
  const existing = inFlight.get(outward);
  if (existing) return existing;
  const build = startDistrictBuildCached(outward, source, cache, options);
  inFlight.set(outward, build);
  const evict = () => {
    if (inFlight.get(outward) === build) inFlight.delete(outward);
  };
  void build.bundle.then(evict, evict);
  return build;
}

export async function buildDistrictBundleCached(
  outward: string,
  source: DistrictDataSource,
  cache: DistrictCache,
  options: DistrictBundleOptions = {},
): Promise<DistrictBundle> {
  return districtBuildFor(outward, source, cache, options).bundle;
}

// A build whose every promise derives from one settled
// bundle (the cache-hit path): the settlement is the
// bundle's own kind, and each section is the bundle's.
function districtBuildFromBundle(bundle: DistrictBundle): DistrictBuild {
  if (bundle.kind === "not-covered") {
    const rejected = <T>(): Promise<T> => {
      const promise = Promise.reject<T>(
        new Error(`District ${bundle.outward} is not covered — it has no sections to settle`),
      );
      void promise.catch(() => {});
      return promise;
    };
    return {
      settlement: Promise.resolve({ kind: "not-covered", nation: bundle.nation }),
      head: rejected(),
      sections: {
        district: rejected(),
        census: rejected(),
        crime: rejected(),
        soldPrices: rejected(),
        deprivation: rejected(),
        councilTax: rejected(),
        connectivity: rejected(),
        schools: rejected(),
        everyday: rejected(),
        flood: rejected(),
        air: rejected(),
        bridge: rejected(),
      },
      bundle: Promise.resolve(bundle),
    };
  }
  return {
    settlement: Promise.resolve({ kind: "district" }),
    head: Promise.resolve(bundle.head),
    sections: {
      district: Promise.resolve(bundle.sections.district),
      census: Promise.resolve(bundle.sections.census),
      crime: Promise.resolve(bundle.sections.crime),
      soldPrices: Promise.resolve(bundle.sections.soldPrices),
      deprivation: Promise.resolve(bundle.sections.deprivation),
      councilTax: Promise.resolve(bundle.sections.councilTax),
      connectivity: Promise.resolve(bundle.sections.connectivity),
      schools: Promise.resolve(bundle.sections.schools),
      everyday: Promise.resolve(bundle.sections.everyday),
      flood: Promise.resolve(bundle.sections.flood),
      air: Promise.resolve(bundle.sections.air),
      bridge: Promise.resolve(bundle.sections.bridge),
    },
    bundle: Promise.resolve(bundle),
  };
}

// The cache probe stands in front of the build (the
// version is read BEFORE the compute, the D29
// discipline: a filing that lands during the compute
// moves the next read's version and busts the entry),
// so the returned build's promises derive from an inner
// build that resolves once the probe answers: a hit
// serves the stored bundle's sections (its warnings
// composed fresh, as ever); a miss starts the staged
// build and chains the cache write onto its bundle
// exactly as the once-path wrote it.
function startDistrictBuildCached(
  outward: string,
  source: DistrictDataSource,
  cache: DistrictCache,
  options: DistrictBundleOptions = {},
): DistrictBuild {
  const inner: Promise<DistrictBuild> = (async () => {
    const version = await cache.versionFor(outward);
    if (version !== null) {
      const entry = await cache.readEntry(outward);
      if (entry && versionsEqual(entry.version, version) && shapeOk(entry.bundle, outward)) {
        const stored = entry.bundle;
        if (stored.kind === "district" && options.warningSource) {
          // The warnings refresh: one indexed read of the
          // district's rows for the spread, then the fresh
          // composition over the stored bundle. A district
          // with no English postcodes has no warnings
          // composition at all (its flood section is the
          // not-covered form) — the stored bundle serves
          // as it stands.
          const postcodes = await source.postcodes(outward);
          const englishPostcodes = postcodes.filter((row) => (row.lsoaCode ?? "").startsWith("E"));
          if (englishPostcodes.length === 0) return districtBuildFromBundle(stored);
          return districtBuildFromBundle({
            ...stored,
            sections: {
              ...stored.sections,
              flood: {
                ...stored.sections.flood,
                warnings: await composeDistrictWarnings(
                  outward,
                  englishPostcodes,
                  options.warningSource,
                ),
              },
            },
          });
        }
        return districtBuildFromBundle(stored);
      }
    }

    const fresh = startDistrictBuild(outward, source, options);
    const bundle = fresh.bundle.then(async (built) => {
      if (version !== null) {
        await cache.writeEntry(outward, version, storable(built));
      }
      return built;
    });
    return { settlement: fresh.settlement, head: fresh.head, sections: fresh.sections, bundle };
  })();

  const derive = <T>(pick: (build: DistrictBuild) => Promise<T>): Promise<T> => {
    const promise = inner.then(pick);
    void promise.catch(() => {});
    return promise;
  };
  return {
    settlement: derive((build) => build.settlement),
    head: derive((build) => build.head),
    sections: {
      district: derive((build) => build.sections.district),
      census: derive((build) => build.sections.census),
      crime: derive((build) => build.sections.crime),
      soldPrices: derive((build) => build.sections.soldPrices),
      deprivation: derive((build) => build.sections.deprivation),
      councilTax: derive((build) => build.sections.councilTax),
      connectivity: derive((build) => build.sections.connectivity),
      schools: derive((build) => build.sections.schools),
      everyday: derive((build) => build.sections.everyday),
      flood: derive((build) => build.sections.flood),
      air: derive((build) => build.sections.air),
      bridge: derive((build) => build.sections.bridge),
    },
    bundle: derive((build) => build.bundle),
  };
}
