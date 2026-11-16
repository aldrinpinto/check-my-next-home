import type { AddressQueryable, AddressResolution } from "./address";
import {
  buildAreaBundle,
  createAreaSource,
  type AreaBundle,
  type AreaBundleOptions,
  type AreaDataSource,
} from "./area-bundle";
import { COMPANY_OWNERSHIP_ENABLED } from "./site";
import {
  buildCrimeBundle,
  createCrimeSource,
  crimeStaleLineForWindow,
  type CrimeBundle,
  type CrimeBundleOptions,
  type CrimeDataSource,
} from "./crime";
import {
  buildFloodBundle,
  composeFloodLiveWarnings,
  createFloodSource,
  createFloodWarningSource,
  type FloodBundle,
  type FloodBundleOptions,
  type FloodDataSource,
} from "./flood";
import {
  buildNearbyBundle,
  createNearbySource,
  type NearbyBundle,
  type NearbyDataSource,
} from "./nearby";

// The bundle cache (plan step M6.8, decision D29).
//
// A repeat check of the same home should not recompute what
// has already been computed from the same filed data. This
// module wraps four of the five bundle builders — crime,
// flood, nearby and the area bundle — with a database cache
// (migration 0020's bundle_cache table, owned by the brain
// alone; no loader reads or writes it). Sold prices is
// deliberately NOT cached: its warm read is one indexed query
// plus an in-memory median, and its one real cost, the cold
// load, is already paid once per postcode by design.
//
// The rules the cache lives under:
//
//   - A miss is exactly today. The cache wraps the builders;
//     it never replaces them. Absent entry, moved version,
//     corrupt or shape-disagreeing entry, missing cache
//     table — every failure path lands on the existing
//     builder and its existing sources, unchanged, and a
//     failed cache write never fails the check.
//   - Invalidation is a per-brain VERSION VECTOR, never a
//     TTL. Each entry stores the last-success stamps (from
//     loader_run_items) of the loader items its brain's
//     answer depends on, plus the filed GUARD COUNTS for the
//     filings that can move no stamp: the hand-run operator
//     jobs (noise, priority habitats — loader_run_items is
//     written by the runner only, so a hand-run first filing
//     may move no stamp, and a cached not-filed state must
//     not survive the filing that ends it) and the
//     brain-invoked cold loads, whose artefacts are guarded
//     by content hash. A read recomputes the current vector
//     and compares: any difference is a miss. A TTL could
//     serve a superseded edition as current; the version
//     rule cannot (D9).
//   - The key is (postcode, brain, rung, home key). The rung
//     is part of the key, so a rung-1 entry can never serve
//     a rung-2 reader address-level facts; the home key
//     carries the resolved home at rung 1 and the narrowing
//     at rung 2. The postcode-point brains (crime, flood,
//     nearby) have no home dimension and file under the
//     empty home key. Rungs 3 and 4 are never cached — they
//     are constant named states. The resolution itself is
//     never cached: re-deriving it is what makes a directory
//     re-file safe, and the directory's serving fields ride
//     in every version's guards, so a moved point or a
//     changed area code busts every entry for the postcode.
//   - Crime's stale line is never stored. It is the one
//     now-dependent served element in the brain — it flips
//     on a calendar boundary with no data change — so the
//     entry stores the bundle with the line stripped, and
//     the line is recomputed at serve from the cached
//     window end (crimeStaleLineForWindow).
//   - Flood's live-warnings block is never stored either
//     (M6.22, decision D42) — it is not even derivable from
//     stored fields: the entry stores the filed answer with
//     the block stripped to null, and every serve composes
//     the block fresh from the Environment Agency's live
//     feed through the same onServe hook, so a cached
//     bundle can neither freeze a warning nor hide one.
//   - Writes SKIP any bundle carrying a load-failure state:
//     a crime bundle in its not-filed state, and an area
//     bundle whose EPC section is not-filed (the state a
//     failed cold load leaves behind). Those states are
//     retries in disguise — the lift lives inside the
//     builder, which a cache hit never calls — so freezing
//     one could hold a postcode in a failed state until an
//     unrelated filing moved a stamp. The stable not-filed
//     states whose filings move a guard count (flood's
//     per-layer, noise, priority habitats, solar) cache
//     safely under the same version discipline as facts.
//   - The short bundle (M6.7) gets no entries of its own:
//     it is a pure derivation over the full bundles, derived
//     on read from whichever bundles are warm.
//   - The area bundle's shape contract includes the
//     company-ownership key's PRESENCE (M6.13): the section
//     exists only while its flag is on, so an entry written
//     before a flip lacks the key and one written after a
//     flip back carries it. Either disagreement with the
//     current flag position degrades to a recompute — the
//     flip can never silently serve a bundle shaped for
//     the other position. The company's filed counts and
//     loader stamp ride in the area version vector from
//     this step on, flag off included, so the section's
//     own not-filed state caches safely: the first filing
//     moves the counts and busts the entry, whoever ran it.
//     From M6.16 the contract also requires the
//     building-safety key's presence: the section is
//     unconditional, so an entry written before the step
//     lacks the key and degrades to a recompute — a
//     pre-step entry never serves sectionless.
//   - From M6.21 the same presence rule covers the
//     constraints section's brownfield and built-up-area
//     sub-blocks, the heritage section's four new layers
//     and every served EPC certificate's improvements key;
//     the area vector carries the two new loaders' stamps
//     (brownfield quarterly, built-up areas static) PLUS a
//     filed-count guard for brownfield_sites, whose npm
//     entry point bypasses the runner exactly as the
//     tribunal loader's does. The new heritage layers and
//     built-up areas file into planning_layers through
//     loaders already in the vector (heritage) or carrying
//     their own stamp (built-up areas); EPC measures ride
//     the EPC artefact's content hash, unchanged.
//   - From M6.17 the same presence rule covers the
//     broadband and mobile keys, and the area vector
//     carries both Ofcom loaders' stamps PLUS content
//     hashes of the broadband and mobile answer keys:
//     both loaders are directly runnable outside the
//     runner (npm run load:broadband / load:mobile, and
//     the --file route a founder-downloaded release
//     takes) and file into postcode_cache.answers moving
//     no stamp — the operator trap in its exact shape, so
//     a hand-run re-filing busts the entry on the hash
//     alone.

export type CacheBrain = "crime" | "flood" | "nearby" | "area";

// The loader items each cached brain's answer depends on —
// the stamps half of the version vector. Pinned by test
// against LOADER_SCHEDULE (loaders/run-loaders.mjs): renaming
// a loader item fails the test loudly instead of silently
// un-invalidating a brain. The area list follows the reads
// createAreaSource actually makes: the planning-layer loaders
// (areas, green belt, heritage for listed buildings and
// monuments, nature designations, priority habitats), the
// EPC artefact (load-epc, including the runner's per-postcode
// re-files), council tax, Census and its LSOA bases, IMD,
// air, noise, the two benefits loaders, the PVGIS grid,
// company ownership (M6.13 — its tables are read only behind
// the flag, but the stamp guards the cached bundle's shape
// in either flag position), the tribunal building-safety
// decisions (M6.16 — the timed quarterly pass moves the
// stamp; the loader's direct entry point moves no stamp,
// so its filed count rides in the guards as well) and the
// two Ofcom loaders (M6.17 — STATIC class; their direct
// entry points move no stamp, so the answers they file
// ride in the guards as content hashes).
export const BRAIN_DEPENDENCIES: Record<CacheBrain, readonly string[]> = {
  crime: ["load-postcodes", "load-crime"],
  flood: [
    "load-postcodes",
    "load-flood-zones",
    "load-flood-rivers-sea",
    "load-flood-surface-water",
    "load-flood-defences",
    "load-flood-rivers-sea-climate",
    "load-flood-surface-water-climate",
  ],
  nearby: [
    "load-postcodes",
    "load-schools",
    "load-health",
    "load-transport",
    "load-nurseries",
    "load-osm-places",
    "load-os-greenspace",
    "load-ev-chargers",
  ],
  area: [
    "load-postcodes",
    "load-planning-areas",
    "load-green-belt",
    "load-heritage",
    "load-brownfield",
    "load-built-up-areas",
    "load-aqma",
    "load-nature-designations",
    "load-priority-habitats",
    "load-epc",
    "load-council-tax",
    "load-census",
    "load-lsoa-bases",
    "load-imd",
    "load-air-quality",
    "load-noise",
    "load-claimant-count",
    "load-dwp-uc",
    "load-pvgis",
    "load-company-ownership",
    "load-tribunal-building-safety",
    "load-broadband",
    "load-mobile",
  ],
};

// ------------------------------------------------------------------
// The version vector
// ------------------------------------------------------------------

export interface BundleVersion {
  // Loader item -> the ISO instant its last successful runner
  // item finished, or null when it has never succeeded.
  stamps: Record<string, string | null>;
  // The filed guard counts and content hashes (see the guard
  // readers below), keyed by guard name.
  guards: Record<string, number | string | null>;
}

// Canonical serialisation for version comparison: JSONB does
// not preserve key order, so both sides are compared through
// a key-sorted form.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

function versionsEqual(a: BundleVersion, b: BundleVersion): boolean {
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

// The directory's serving fields, taken from the freshly
// derived resolution itself — no extra read. A directory
// re-file that moves the point or changes the council or
// area codes changes this string and busts every entry.
function directoryGuard(resolution: Rung12Resolution): string {
  const d = resolution.directory;
  return [d.latitude, d.longitude, d.council ?? "", d.lsoaCode ?? "", d.msoaCode ?? ""].join("|");
}

// The content hash of one artefact inside postcode_cache's
// answers — the guard for the writes that happen outside the
// runner (brain-invoked cold loads, a loader run by hand).
// Null when the postcode or the artefact is absent.
async function artefactHash(
  db: AddressQueryable,
  postcode: string,
  key: "crime" | "epc" | "broadband" | "mobile",
): Promise<string | null> {
  const { rows } = await db.query(
    "SELECT md5((answers -> $2)::text) AS h FROM postcode_cache WHERE postcode = $1",
    [postcode, key],
  );
  return (rows[0]?.h as string | null) ?? null;
}

async function countOf(
  db: AddressQueryable,
  sql: string,
  params: readonly unknown[] = [],
): Promise<number> {
  const { rows } = await db.query(sql, params);
  return Number(rows[0]?.n ?? 0);
}

// The guards half of the version vector, per brain: the
// filed counts and content hashes whose movement can change
// the brain's answer without moving a runner stamp.
const GUARDS: Record<
  CacheBrain,
  (db: AddressQueryable, resolution: Rung12Resolution) => Promise<BundleVersion["guards"]>
> = {
  async crime(db, resolution) {
    const postcode = resolution.directory.postcode;
    return {
      directory: directoryGuard(resolution),
      crimeArtefact: await artefactHash(db, postcode, "crime"),
    };
  },

  async flood(db, resolution) {
    const { rows } = await db.query(
      "SELECT layer_type, count(*)::int AS n FROM flood_layers GROUP BY layer_type",
    );
    const byLayer = new Map(rows.map((row) => [row.layer_type as string, Number(row.n)]));
    const { rows: climateRows } = await db.query(
      "SELECT layer_type, count(*)::int AS n FROM flood_climate_layers GROUP BY layer_type",
    );
    const byClimate = new Map(climateRows.map((row) => [row.layer_type as string, Number(row.n)]));
    return {
      directory: directoryGuard(resolution),
      // The per-layer filed counts the flood source itself
      // reads — a layer's first filing (0 -> N) busts the
      // cached per-layer not-filed state, whoever ran it.
      floodZone: byLayer.get("flood_zone") ?? 0,
      rofrs: byLayer.get("rofrs") ?? 0,
      rofsw: byLayer.get("rofsw") ?? 0,
      // The defences count (M6.27): the sibling block's
      // table rides the same guard, so its first filing
      // busts a cached not-filed block the same way.
      floodDefences: await countOf(db, "SELECT count(*)::int AS n FROM flood_defences"),
      // The climate counts (M6.28): the scenario sources
      // file on their own quarterly cycle into their own
      // table, so each source's count rides the guard the
      // same way — a scenario re-filing busts the entry, a
      // first filing (0 -> N) busts a cached per-source
      // not-filed state, and the present-day counts above
      // keep their meaning untouched.
      rofrsCc: byClimate.get("rofrs_cc") ?? 0,
      rofswCc: byClimate.get("rofsw_cc") ?? 0,
    };
  },

  async nearby(db, resolution) {
    // Every nearby filing is a runner class — its stamp
    // moves — so the directory guard is the only extra.
    void db;
    return { directory: directoryGuard(resolution) };
  },

  async area(db, resolution) {
    const postcode = resolution.directory.postcode;
    return {
      directory: directoryGuard(resolution),
      // The EPC artefact is rewritten by brain-invoked cold
      // loads, outside the runner: guard its content.
      epcArtefact: await artefactHash(db, postcode, "epc"),
      // The operator-job trap: noise and priority habitats
      // are hand-run (D19) and may move no runner stamp.
      noiseSummary: await countOf(db, "SELECT count(*)::int AS n FROM noise_summary"),
      noiseForPostcode: await countOf(
        db,
        "SELECT count(*)::int AS n FROM noise_summary WHERE area_ref = $1",
        [postcode],
      ),
      priorityHabitats: await countOf(
        db,
        "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = 'priority_habitat'",
      ),
      // Air Quality Management Areas (M6.30): the same
      // planning_layers count-by-type guard — the loader's
      // npm entry point bypasses the runner, so a hand-run
      // quarterly re-filing (a revocation swap, say) moves
      // this count even when it moves no stamp, and a
      // cached not-filed block never survives the first
      // filing that ends it.
      aqmaFiled: await countOf(
        db,
        "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = 'aqma'",
      ),
      listedBuildings: await countOf(db, "SELECT count(*)::int AS n FROM listed_buildings"),
      // Brownfield (M6.21): the loader's npm entry point
      // (npm run load:brownfield) bypasses the runner and
      // moves no stamp, so a hand-run re-filing is guarded
      // by the table's own count, like listed buildings
      // above. Built-up areas ride their loader's stamp
      // alone: the loader has no per-postcode entry point,
      // and its static re-file is an operator re-run
      // through the runner.
      brownfieldSites: await countOf(db, "SELECT count(*)::int AS n FROM brownfield_sites"),
      solarGrid: await countOf(db, "SELECT count(*)::int AS n FROM solar_grid"),
      // The council-tax spring pass is a yearly operator job
      // (D16): if it ever runs outside the runner, the
      // charges table's own count is the guard that moves.
      councilTaxCharges: await countOf(db, "SELECT count(*)::int AS n FROM council_tax_charges"),
      // Company ownership (M6.13): the datasets re-file
      // monthly in full, so a re-filing that moves no stamp
      // — a hand-run pass — still moves these counts, per
      // dataset and for the snapshots; and a cached
      // not-filed section never survives the first filing
      // that ends it.
      companyTitlesCcod: await countOf(
        db,
        "SELECT count(*)::int AS n FROM company_titles WHERE dataset = 'ccod'",
      ),
      companyTitlesOcod: await countOf(
        db,
        "SELECT count(*)::int AS n FROM company_titles WHERE dataset = 'ocod'",
      ),
      companySnapshots: await countOf(db, "SELECT count(*)::int AS n FROM company_snapshots"),
      // Building safety (M6.16): the tribunal loader's
      // direct entry point (npm run
      // load:tribunal-building-safety) bypasses the runner
      // entirely and writes no loader_run_items row, so a
      // hand-run quarterly pass re-files the table while
      // moving no stamp — the operator trap in its exact
      // shape. The table's own count is the guard that
      // moves; a cached not-filed section never survives
      // the first filing that ends it. (Named residual,
      // the flood counts' own: a same-count content change
      // from a hand run moves neither stamp nor count; the
      // timed runner's stamp closes it on the primary
      // path.)
      tribunalDecisions: await countOf(
        db,
        "SELECT count(*)::int AS n FROM tribunal_building_safety_decisions",
      ),
      // Broadband and mobile (M6.17): both Ofcom loaders
      // file into postcode_cache.answers from entry
      // points that bypass the runner (their npm scripts
      // and the --file route), moving no stamp — the
      // operator trap in its exact shape. The filed
      // answers' content hashes are the guards that move:
      // a re-filed release busts the entry on the hash
      // alone, and a cached not-filed section never
      // survives the first filing that ends it.
      broadbandArtefact: await artefactHash(db, postcode, "broadband"),
      mobileArtefact: await artefactHash(db, postcode, "mobile"),
    };
  },
};

// ------------------------------------------------------------------
// The store
// ------------------------------------------------------------------

export interface BundleCache {
  // The current version vector for a brain and resolution,
  // or null when the cache's own reads fail (missing tables,
  // a broken connection): the cache then steps aside and the
  // builders answer exactly as they do today.
  versionFor(brain: CacheBrain, resolution: Rung12Resolution): Promise<BundleVersion | null>;
  readEntry(
    postcode: string,
    brain: CacheBrain,
    rung: number,
    homeKey: string,
  ): Promise<{ version: BundleVersion; bundle: unknown } | null>;
  // Best-effort by design: a failed write never surfaces.
  writeEntry(
    postcode: string,
    brain: CacheBrain,
    rung: number,
    homeKey: string,
    version: BundleVersion,
    bundle: unknown,
  ): Promise<void>;
}

export function createBundleCache(db: AddressQueryable): BundleCache {
  return {
    async versionFor(brain, resolution) {
      try {
        const stamps = await readStamps(db, BRAIN_DEPENDENCIES[brain]);
        const guards = await GUARDS[brain](db, resolution);
        return { stamps, guards };
      } catch {
        return null;
      }
    },

    async readEntry(postcode, brain, rung, homeKey) {
      try {
        const { rows } = await db.query(
          "SELECT version, bundle FROM bundle_cache WHERE postcode = $1 AND brain = $2 AND rung = $3 AND home_key = $4",
          [postcode, brain, rung, homeKey],
        );
        const row = rows[0];
        if (!row) return null;
        return { version: row.version as BundleVersion, bundle: row.bundle };
      } catch {
        return null;
      }
    },

    async writeEntry(postcode, brain, rung, homeKey, version, bundle) {
      try {
        await db.query(
          `INSERT INTO bundle_cache (postcode, brain, rung, home_key, version, bundle)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (postcode, brain, rung, home_key)
           DO UPDATE SET version = EXCLUDED.version, bundle = EXCLUDED.bundle, computed_at = now()`,
          [postcode, brain, rung, homeKey, JSON.stringify(version), JSON.stringify(bundle)],
        );
      } catch {
        // Best-effort: a failed cache write must never fail
        // the check (migration 0006's rule for the run
        // record, applied to the cache).
      }
    },
  };
}

// ------------------------------------------------------------------
// Keys
// ------------------------------------------------------------------

type Rung12Resolution = Extract<AddressResolution, { rung: 1 | 2 }>;

// The brains' matching normal form (the lib/address.ts
// convention): upper case, punctuation becomes spaces, runs
// collapse. Used for key material only — the key needs to be
// stable for the same resolved home, nothing more.
function normKey(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// The home half of the key: at rung 1 the resolved home's
// own parts (PAON | SAON | street — two flats in one
// building never share an entry); at rung 2 the narrowing
// the list was cut by (street | building).
export function homeKeyOf(resolution: Rung12Resolution): string {
  if (resolution.rung === 1) {
    const a = resolution.address;
    return [a.paon ?? "", a.saon ?? "", a.street ?? ""].map(normKey).join("|");
  }
  return [resolution.street ?? "", resolution.building ?? ""].map(normKey).join("|");
}

// ------------------------------------------------------------------
// The serve path
// ------------------------------------------------------------------

// The stored bundle must agree with its own key before
// anything is served from it: a hand-corrupted or misplaced
// entry degrades to a recompute, never to a wrong answer.
function keyAgreement(bundle: unknown, kinds: readonly string[], postcode: string, rung: number) {
  if (typeof bundle !== "object" || bundle === null) return false;
  const b = bundle as { kind?: unknown; postcode?: unknown; rung?: unknown };
  return kinds.includes(b.kind as string) && b.postcode === postcode && b.rung === rung;
}

interface ServeOptions<TBundle> {
  brain: CacheBrain;
  resolution: Rung12Resolution;
  homeKey: string;
  kinds: readonly string[];
  compute: () => Promise<TBundle>;
  // False for bundles carrying a load-failure state — they
  // are never written (see the header).
  cacheable: (bundle: TBundle) => boolean;
  // The form stored in the entry, when it differs from the
  // served form (crime stores its stale line stripped).
  storable?: (bundle: TBundle) => unknown;
  // The served form of a stored bundle (crime recomputes
  // its stale line here, at serve, from the cached window;
  // flood re-composes its live-warnings block here, at
  // serve, from the live feed — M6.22 — so the hook may be
  // asynchronous; a synchronous hook is awaited unchanged).
  onServe?: (bundle: TBundle) => TBundle | Promise<TBundle>;
  // A further shape contract on the stored bundle, beyond
  // key agreement: a stored bundle that fails it degrades
  // to a recompute, never to a serve (the area bundle's
  // company-key presence rule, M6.13).
  shapeOk?: (bundle: unknown) => boolean;
}

async function serveCached<TBundle>(
  cache: BundleCache,
  opts: ServeOptions<TBundle>,
): Promise<TBundle> {
  const { resolution } = opts;
  const postcode = resolution.directory.postcode;
  const rung = resolution.rung;

  // The version is read BEFORE the compute: an entry written
  // from it can only ever vouch for data at most as new as
  // the bundle it sits beside, and any filing that lands
  // during the compute moves the next read's version and
  // busts the entry. The dangerous direction — new stamps
  // beside an older bundle — cannot occur.
  const version = await cache.versionFor(opts.brain, resolution);
  if (version !== null) {
    const entry = await cache.readEntry(postcode, opts.brain, rung, opts.homeKey);
    if (
      entry &&
      versionsEqual(entry.version, version) &&
      keyAgreement(entry.bundle, opts.kinds, postcode, rung) &&
      (!opts.shapeOk || opts.shapeOk(entry.bundle))
    ) {
      const stored = entry.bundle as TBundle;
      return opts.onServe ? await opts.onServe(stored) : stored;
    }
  }

  const bundle = await opts.compute();
  if (version !== null && opts.cacheable(bundle)) {
    await cache.writeEntry(
      postcode,
      opts.brain,
      rung,
      opts.homeKey,
      version,
      opts.storable ? opts.storable(bundle) : bundle,
    );
  }
  return bundle;
}

// ------------------------------------------------------------------
// The cached builders — same shapes as the builders they wrap
// ------------------------------------------------------------------

export async function buildCrimeBundleCached(
  resolution: AddressResolution,
  source: CrimeDataSource,
  cache: BundleCache,
  options: CrimeBundleOptions = {},
): Promise<CrimeBundle> {
  if (resolution.rung === 3 || resolution.rung === 4)
    return buildCrimeBundle(resolution, source, options);
  const now = options.now ?? new Date();
  return serveCached(cache, {
    brain: "crime",
    resolution,
    homeKey: "",
    kinds: ["crime", "not-covered"],
    compute: () => buildCrimeBundle(resolution, source, options),
    // The not-filed state is a retry in disguise (M6.9's
    // handover): never written, so a later filing is always
    // seen by a fresh compute.
    cacheable: (bundle) => !(bundle.kind === "crime" && bundle.crime.state === "not-filed"),
    storable: (bundle) =>
      bundle.kind === "crime" && bundle.crime.state === "served"
        ? { ...bundle, crime: { ...bundle.crime, staleLine: null } }
        : bundle,
    onServe: (bundle) =>
      bundle.kind === "crime" && bundle.crime.state === "served"
        ? {
            ...bundle,
            crime: {
              ...bundle.crime,
              staleLine: crimeStaleLineForWindow(bundle.crime.windowTo, now),
            },
          }
        : bundle,
    // The M6.20 shape contract (D39, in the M6.18 pattern):
    // a served entry written before the step lacks the
    // calibration keys entirely, so it degrades to a
    // recompute rather than serving the calibration's
    // absence as current. (A recompute from a pre-step
    // artefact serves counts with calibration null —
    // correct, and the entry it writes is shape-valid:
    // the keys are present, their values null.) States
    // other than served carry no calibration and are
    // untouched by the contract.
    shapeOk: (bundle) => {
      if (typeof bundle !== "object" || bundle === null) return false;
      const b = bundle as { kind?: unknown; crime?: unknown };
      if (b.kind !== "crime") return true;
      const crime = b.crime as Record<string, unknown> | null | undefined;
      if (!crime || crime.state !== "served") return true;
      return "perHead" in crime && "englandFigure" in crime && "calibrationExplainer" in crime;
    },
  });
}

export async function buildFloodBundleCached(
  resolution: AddressResolution,
  source: FloodDataSource,
  cache: BundleCache,
  options: FloodBundleOptions = {},
): Promise<FloodBundle> {
  if (resolution.rung === 3 || resolution.rung === 4)
    return buildFloodBundle(resolution, source, options);
  return serveCached(cache, {
    brain: "flood",
    resolution,
    homeKey: "",
    kinds: ["flood", "not-covered"],
    compute: () => buildFloodBundle(resolution, source, options),
    // Flood's per-layer not-filed states cache safely: the
    // layers' filed counts are in the version's guards, so
    // a first filing busts the entry whoever ran it.
    cacheable: () => true,
    // The live-warnings block (M6.22, decision D42) is
    // never stored: the entry holds the filed answer with
    // the block stripped to null, and the block is composed
    // fresh on every serve — the crime stale-line pattern,
    // one step further (crime's line is recomputed from
    // stored fields; flood's block is re-fetched from the
    // live feed). A bundle cached before a warning is
    // raised serves the warning on its next read; a lapsed
    // warning disappears with no cache write in between.
    storable: (bundle) =>
      bundle.kind === "flood" && bundle.flood.state === "served"
        ? { ...bundle, flood: { ...bundle.flood, liveWarnings: null } }
        : bundle,
    onServe: async (bundle) => {
      if (bundle.kind !== "flood" || bundle.flood.state !== "served" || !options.warningSource)
        return bundle;
      const { latitude, longitude } = resolution.directory;
      return {
        ...bundle,
        flood: {
          ...bundle.flood,
          liveWarnings: await composeFloodLiveWarnings(
            options.warningSource,
            latitude,
            longitude,
            options.now ?? new Date(),
          ),
        },
      };
    },
    // The M6.22 shape contract, in the established pattern:
    // a stored served entry written before the step lacks
    // the liveWarnings key entirely, so it degrades to a
    // recompute rather than serving the block's absence as
    // current. (The stored value is null by design — the
    // key's presence is the contract.) The defences key
    // (M6.27) extends the same contract: a pre-M6.27 entry
    // carries no defences block and degrades to a recompute;
    // the stored form KEEPS the block (it is filed data,
    // unlike the live warnings), so presence is again the
    // whole test. The climate key (M6.28) extends it once
    // more, identically: a pre-M6.28 entry carries no
    // climate block and recomputes; the stored form keeps
    // the block whole (filed data, serve-time-stable).
    shapeOk: (bundle) => {
      if (typeof bundle !== "object" || bundle === null) return false;
      const b = bundle as { kind?: unknown; flood?: unknown };
      if (b.kind !== "flood") return true;
      const flood = b.flood as Record<string, unknown> | null | undefined;
      if (!flood || flood.state !== "served") return true;
      return "liveWarnings" in flood && "defences" in flood && "climate" in flood;
    },
  });
}

export async function buildNearbyBundleCached(
  resolution: AddressResolution,
  source: NearbyDataSource,
  cache: BundleCache,
): Promise<NearbyBundle> {
  if (resolution.rung === 3 || resolution.rung === 4) return buildNearbyBundle(resolution, source);
  return serveCached(cache, {
    brain: "nearby",
    resolution,
    homeKey: "",
    kinds: ["distances"],
    compute: () => buildNearbyBundle(resolution, source),
    cacheable: () => true,
    // The M6.18 shape contract: the secondary category's
    // answer carries the selective gloss's field
    // (nearestSelectiveLine, key present, value possibly
    // null). An entry written before M6.18 lacks the key,
    // so it degrades to a recompute rather than serving
    // the gloss's absence as current. The M6.22 contract
    // extends it in the same pattern: the bundle carries
    // the schoolDeadlines key (present, value null outside
    // England and Wales) — an entry written before the
    // step lacks it and degrades to a recompute. The
    // M6.24 contract extends it again: the categories must
    // include the maternity answer — an entry written
    // before the step holds twenty categories and degrades
    // to a recompute rather than serving a bundle with no
    // maternity answer as current. The M6.25 contract
    // extends it once more: every place the GP, A&E and
    // maternity answers serve must carry the cqcRating key
    // (the filed rating, or null where none files) — an
    // entry written before the step serves those places
    // without the key and degrades to a recompute rather
    // than serving ratingless health rows as current.
    shapeOk: (bundle) => {
      if (typeof bundle !== "object" || bundle === null) return false;
      if (!("schoolDeadlines" in bundle)) return false;
      const categories = (bundle as { categories?: unknown }).categories;
      if (!Array.isArray(categories)) return false;
      const byCategory = (key: string) =>
        categories.find(
          (c) =>
            typeof c === "object" && c !== null && (c as { category?: unknown }).category === key,
        );
      const secondary = byCategory("schools-secondary");
      const maternity = byCategory("maternity");
      if (!(
        typeof secondary === "object" &&
        secondary !== null &&
        "nearestSelectiveLine" in secondary &&
        typeof maternity === "object" &&
        maternity !== null
      ))
        return false;
      for (const key of ["gp", "ae", "maternity"]) {
        const answer = byCategory(key) as { places?: unknown } | undefined;
        if (!answer || !Array.isArray(answer.places)) return false;
        for (const place of answer.places) {
          if (typeof place !== "object" || place === null || !("cqcRating" in place)) return false;
        }
      }
      return true;
    },
  });
}

export async function buildAreaBundleCached(
  resolution: AddressResolution,
  source: AreaDataSource,
  cache: BundleCache,
  options: AreaBundleOptions = {},
): Promise<AreaBundle> {
  if (resolution.rung === 3 || resolution.rung === 4)
    return buildAreaBundle(resolution, source, options);
  // The flag position the caller is building for — the
  // shipped constant unless a test passes the seam value —
  // is part of the stored shape's contract (see shapeOk).
  const companyEnabled = options.companyOwnershipEnabled ?? COMPANY_OWNERSHIP_ENABLED;
  return serveCached(cache, {
    brain: "area",
    resolution,
    homeKey: homeKeyOf(resolution),
    kinds: ["area-bundle"],
    compute: () => buildAreaBundle(resolution, source, options),
    // An EPC section in its not-filed state means the cold
    // load was attempted and failed (or is not possible):
    // the retry lives inside buildEpc, which a cache hit
    // never calls, so the bundle is never written. (The
    // company section's own not-filed state is NOT a
    // write-skip: its guard counts sit in the version
    // vector, so the first filing busts the entry — the
    // stable not-filed reasoning in the header.)
    cacheable: (bundle) =>
      !(bundle.kind === "area-bundle" && bundle.sections.epc.state === "not-filed"),
    // The company key's presence must agree with the
    // current flag position: flag on + key absent, or flag
    // off + key present, degrades to a recompute — absence
    // by staleness would be indistinguishable from the flag
    // itself, and a flipped-off entry must never surface
    // the section it was written with. The building-safety
    // key (M6.16) is unconditional: it must be present, so
    // an entry written before the step degrades to a
    // recompute rather than serving sectionless. The
    // broadband and mobile keys (M6.17) are unconditional
    // in the same way. The M6.18 explainer fields extend
    // the contract in step (D37): the nature section's
    // ancient-woodland inventory line must be a string,
    // the council-tax and benefits sections must carry
    // their new line fields (keys present, values possibly
    // null), and every served EPC certificate must carry
    // its ratingLine key — an entry written before M6.18
    // degrades to a recompute rather than serving the new
    // lines' absence as current. Where the company section
    // is present (flag on), its snapshots must carry the
    // SIC line's key in the same way. The air section's
    // yardsticks key (M6.29) is unconditional in the same
    // way: the yardsticks derive from code constants and
    // the already-filed figures, no loader stamp in the
    // version vector moves when the step deploys, so only
    // this presence rule stops a pre-step entry serving
    // the block's absence as current (the M6.25 pattern).
    shapeOk: (bundle) => {
      if (typeof bundle !== "object" || bundle === null) return false;
      const sections = (bundle as { sections?: unknown }).sections;
      if (typeof sections !== "object" || sections === null) return false;
      if (!(
        "companyOwnership" in sections === companyEnabled &&
        "buildingSafety" in sections &&
        "broadband" in sections &&
        "mobile" in sections
      ))
        return false;
      const s = sections as Record<string, Record<string, unknown> | undefined>;
      const nature = s.nature;
      if (!nature || typeof nature.ancientWoodlandInventoryLine !== "string") return false;
      const councilTax = s.councilTax;
      if (!councilTax || !("bandsLine" in councilTax)) return false;
      const benefits = s.benefits;
      if (!benefits || !("basesLine" in benefits)) return false;
      const epc = s.epc;
      if (!epc || !Array.isArray(epc.certificates)) return false;
      if (
        !epc.certificates.every(
          (cert) => typeof cert === "object" && cert !== null && "ratingLine" in cert,
        )
      )
        return false;
      // The M6.21 presence rules, in the same pattern: the
      // constraints section must carry its brownfield and
      // built-up-area sub-blocks, the heritage section its
      // four new layers, and every served EPC certificate
      // its improvements key (present, value null for a
      // pre-widening artefact) — an entry written before
      // the step lacks all of them and degrades to a
      // recompute rather than serving their absence as
      // current.
      const constraints = s.constraints;
      if (!constraints || !("brownfield" in constraints) || !("builtUpArea" in constraints))
        return false;
      const heritage = s.heritage;
      if (
        !heritage ||
        !("worldHeritageSites" in heritage) ||
        !("battlefields" in heritage) ||
        !("protectedWrecks" in heritage) ||
        !("worldHeritageBufferZones" in heritage)
      )
        return false;
      if (
        !epc.certificates.every(
          (cert) => typeof cert === "object" && cert !== null && "improvements" in cert,
        )
      )
        return false;
      // The M6.29 presence rule, in the same pattern: the
      // air section must carry its yardsticks key (present
      // on every served bundle; the value is null in the
      // not-filed state) — an entry written before the
      // step lacks it and degrades to a recompute.
      const air = s.air;
      if (!air || !("yardsticks" in air)) return false;
      // The M6.30 presence rule, in the same pattern and
      // the same section: the air section must carry its
      // aqma key (present on every served bundle, in both
      // arms — the block's state carries not-filed). The
      // area version vector has no planning-layers
      // component that moves when the step deploys, so
      // only this rule stops a pre-step entry serving the
      // block's absence as current (the M6.25 pattern).
      if (!("aqma" in air)) return false;
      const company = s.companyOwnership;
      if (company) {
        const titles = [
          ...((company.ownTitles as unknown[]) ?? []),
          ...((company.buildingTitles as unknown[]) ?? []),
        ];
        const snapshotsOk = titles.every((title) => {
          const snapshot = (title as { snapshot?: unknown }).snapshot;
          return (
            snapshot === null ||
            (typeof snapshot === "object" && snapshot !== null && "sicCodesLine" in snapshot)
          );
        });
        if (!snapshotsOk) return false;
      }
      return true;
    },
  });
}

// ------------------------------------------------------------------
// The wired set — one database handle, the real sources, the
// cache. The shape a future check orchestrator calls.
// ------------------------------------------------------------------

export interface CachedBrains {
  buildCrimeBundle(
    resolution: AddressResolution,
    options?: CrimeBundleOptions,
  ): Promise<CrimeBundle>;
  buildFloodBundle(resolution: AddressResolution): Promise<FloodBundle>;
  buildNearbyBundle(resolution: AddressResolution): Promise<NearbyBundle>;
  buildAreaBundle(resolution: AddressResolution): Promise<AreaBundle>;
}

export function createCachedBrains(db: AddressQueryable): CachedBrains {
  const cache = createBundleCache(db);
  const crimeSource = createCrimeSource(db);
  const floodSource = createFloodSource(db);
  // The live flood-warnings feed (M6.22): composed at serve
  // time through the cached flood builder, never stored.
  const floodWarningSource = createFloodWarningSource();
  const nearbySource = createNearbySource(db);
  const areaSource = createAreaSource(db);
  return {
    buildCrimeBundle: (resolution, options) =>
      buildCrimeBundleCached(resolution, crimeSource, cache, options),
    buildFloodBundle: (resolution) =>
      buildFloodBundleCached(resolution, floodSource, cache, {
        warningSource: floodWarningSource,
      }),
    buildNearbyBundle: (resolution) => buildNearbyBundleCached(resolution, nearbySource, cache),
    buildAreaBundle: (resolution) => buildAreaBundleCached(resolution, areaSource, cache),
  };
}
