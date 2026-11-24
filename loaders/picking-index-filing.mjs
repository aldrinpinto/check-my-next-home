// Shared filing machinery for the national picking index
// (plan step M7.15B, migration 0030).
//// Two loader passes — the sales parts pass
// (load-picking-index.mjs) and the EPC certificate pass
// (load-epc-index.mjs) — each refresh their own retained
// extract and then rebuild the served union
// (picking_index) from the two extracts. The rebuild
// lives here, once, so the two passes can never drift
// apart on the merge rules:
//
//   - a home is its home key (postcode carried alongside,
//     as in the key's rung-1 form);
//   - on a collision the SALES parts win — they are the
//     register's own address parts — and the EPC
//     provenance is retained in the row's source tags and
//     per-source edition columns;
//   - provenance is data, never display: it exists for
//     audit and for the kill switch below.
//
// THE KILL SWITCH. The union is a build product of two
// retained extracts, so removing every EPC-derived row
// is removeEpcFromIndex: a rebuild from the sales
// extract alone. EPC-only rows vanish, merged rows keep
// their sales parts with the EPC tag stripped, and
// sales-only rows are byte-identical — a data operation,
// not a code change (the recorded mitigation for filing
// certificate addresses without the register's written
// clearance; founder decision, 18 Nov 2026). It is wired
// as `node loaders/load-epc-index.mjs --kill-switch` and
// pinned by tests/load-epc-index.test.ts.
//
// Freshness: each pass's proof is its DISTINCT counts.
// A re-extract whose distinct home count moves beyond
// COUNT_MOVEMENT_TOLERANCE against the currently filed
// edition is refused before anything swaps (the caller
// records the refusal on the editions row, so the
// picking-index canary item can report it) — a
// truncated or wrong-edition source file must never
// silently shrink the nation's picker.

// (BUG-204: formatCount for the rebuild's progress lines
// below — the only import this shared module takes.)
import { formatCount } from "./progress.mjs";

// The home key's own normalisation, mirrored from
// lib/bundle-cache.ts's normKey + homeKeyOf rung 1 and
// lib/address.ts's normText (the loaders are standalone
// files; the sales loader's copies of the Price Paid
// record logic set the same precedent). One identity
// across price_paid, the extracts and the union: upper
// case, punctuation to spaces, runs collapsed.
export function normKeyPart(value) {
  return (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// The rung-1 home key for one set of address parts:
// normKey(paon) | normKey(saon) | normKey(street). The
// postcode is NOT part of this string — rows carry it as
// their own column, exactly as price_paid does.
export function homeKeyForParts(parts) {
  return [parts.paon, parts.saon, parts.street].map((part) => normKeyPart(part)).join("|");
}

// A re-extract may differ from the filed edition by at
// most this share of distinct homes before its proof
// refuses the swap. Two percent is far above a month's
// genuine churn (the nation adds well under a tenth of a
// percent of homes a month) and far below any plausible
// truncation or wrong-file accident.
export const COUNT_MOVEMENT_TOLERANCE = 0.02;
export function countMovementWithinTolerance(previousHomes, nextHomes) {
  if (previousHomes === null || previousHomes === undefined) return true;
  if (previousHomes === 0) return nextHomes === 0;
  return Math.abs(nextHomes - previousHomes) / previousHomes <= COUNT_MOVEMENT_TOLERANCE;
}

const PER_SOURCE = {
  sales: { stage: "picking_sales_stage", extract: "picking_sales_extract" },
  epc: { stage: "picking_epc_stage", extract: "picking_epc_extract" },
};

export function stageTableFor(source) {
  return PER_SOURCE[source].stage;
}

export function extractTableFor(source) {
  return PER_SOURCE[source].extract;
}

// The editions row for one source, or null when the
// table is absent (a database the migration has not
// reached — the canary's not-yet state).
export async function readEdition(client, source) {
  const { rows } = await client.query(
    `SELECT source, edition, loaded_at, postcodes, homes, streets,
            previous_homes, last_rejected_homes, last_rejected_at
       FROM picking_index_editions WHERE source = $1`,
    [source],
  );
  return rows[0] ?? null;
}

// The DISTINCT counts a staged pass will file: distinct
// postcodes, distinct homes (postcode + home key), from
// the stage — the tolerance check reads these before
// anything swaps.
export async function stagedCounts(client, source) {
  const { rows } = await client.query(
    `SELECT count(DISTINCT postcode) AS postcodes,
            count(DISTINCT (postcode, home_key)) AS homes
       FROM ${stageTableFor(source)}`,
  );
  return {
    postcodes: Number(rows[0].postcodes),
    homes: Number(rows[0].homes),
  };
}

// The DISTINCT counts actually filed in an extract, read
// back after the swap: distinct postcodes, homes (the
// extract's rows — it is keyed by home), and distinct
// streets-with-town (the grain the street-suggestion
// step, M7.15C, derives its street table from: a street
// name in two towns is two streets).
export async function extractCounts(client, source) {
  const { rows } = await client.query(
    `SELECT count(DISTINCT postcode) AS postcodes,
            count(*) AS homes,
            count(DISTINCT (street, town)) AS streets
       FROM ${extractTableFor(source)}`,
  );
  return {
    postcodes: Number(rows[0].postcodes),
    homes: Number(rows[0].homes),
    streets: Number(rows[0].streets),
  };
}

// Replace one source's extract with its staged rows,
// deduped in SQL on (postcode, home_key). Where one home
// key arrives in more than one written form (the two
// registers punctuate differently), the representative
// is chosen deterministically — the first form in
// (paon, saon, street, town) order — never by arrival.
export async function swapStagedExtract(client, source) {
  const stage = stageTableFor(source);
  const extract = extractTableFor(source);
  await client.query(`DELETE FROM ${extract}`);
  await client.query(
    `INSERT INTO ${extract} (postcode, paon, saon, street, town, home_key)
     SELECT postcode, paon, saon, street, town, home_key
       FROM (SELECT DISTINCT ON (postcode, home_key)
                    postcode, paon, saon, street, town, home_key
               FROM ${stage}
              ORDER BY postcode, home_key, paon, saon, street, town) deduped`,
  );
}

// Rebuild the derived street table (migration 0031)
// from the union index as it stands: one row per
// (street, postcode) the index holds homes on, with the
// street's display form, the town its homes file most
// (ties by name) and its home count. The normalisation
// is the home key's own recipe (normKeyPart above),
// written out in SQL so the table speaks the same form
// the ladder's street matching does. The SELECT mirrors
// migration 0031's initial build.
export async function rebuildPickingStreets(client) {
  await client.query("DELETE FROM picking_streets");
  await client.query(
    `WITH per_town AS (
       SELECT btrim(regexp_replace(regexp_replace(upper(street), '[^A-Z0-9]+', ' ', 'g'), ' +', ' ', 'g')) AS street_norm,
              postcode,
              town,
              count(*)::int AS homes,
              min(street) AS street_display
         FROM picking_index
        WHERE street IS NOT NULL
        GROUP BY 1, 2, 3
     ),
     per_street AS (
       SELECT street_norm,
              postcode,
              min(street_display) AS street_display,
              (array_agg(town ORDER BY homes DESC, town IS NULL, town))[1] AS town,
              sum(homes)::int AS home_count
         FROM per_town
        GROUP BY street_norm, postcode
     )
     INSERT INTO picking_streets (street_norm, street_display, town, town_norm, postcode, home_count)
     SELECT street_norm,
            street_display,
            town,
            CASE WHEN town IS NULL THEN ''
                 ELSE btrim(regexp_replace(regexp_replace(upper(town), '[^A-Z0-9]+', ' ', 'g'), ' +', ' ', 'g'))
            END,
            postcode,
            home_count
       FROM per_street
      WHERE street_norm <> ''`,
  );
}

// Rebuild the derived place table (migration 0032,
// derivation corrected by migration 0033) from the
// union index as it stands: one row per (place,
// district) the index holds homes under a filed town
// in, with the place's display form and its distinct
// postcode count. The normalisation is the home key's
// own recipe (normKeyPart above), written out in SQL.
// The SELECT mirrors migration 0033's rebuild.
//
// Two guards on the derivation, both from the
// M7.15D deploy follow-up (19 Nov 2026; the full
// diagnosis is in docs/entry-point.md):
//
//   * The district is the postcode's outward code
//     under the canonical grammar — the classifier's
//     own (lib/address.ts, normalisePostcode): the
//     compact form must parse as outward + inward, and
//     the outward is its leading group. The original
//     split_part(postcode, ' ', 1) filed whatever token
//     preceded the first space, including mis-keyed
//     tokens ('CRO' for CR0, 'NNR6') and the literal
//     postcode 'UNKNOWN' one deed carries. A postcode
//     that does not parse contributes no pair.
//   * A pair is filed only where the index holds MORE
//     THAN ONE home under the place's name in the
//     district — no single-record pairings. One deed
//     filed 'CM92 1LX' (a postcode the directory places
//     in Harlow) under the town CHELMSFORD, and the
//     pair (CHELMSFORD, CM92) was offered as a district
//     choice: the district has genuine directory
//     standing and the postcode is grammatically
//     valid, so neither a standing test nor a grammar
//     test can see a false pairing — corroboration
//     can. A genuine pairing in a national index of
//     this size rests on many homes; a lone home is a
//     mis-filing (a wrong town or a wrong postcode on
//     one record) with overwhelming probability. The
//     home itself stays in the index — only the
//     pairing is withheld.
export async function rebuildPickingPlaces(client) {
  await client.query("DELETE FROM picking_places");
  await client.query(
    `WITH per_place_town AS (
       SELECT btrim(regexp_replace(regexp_replace(upper(town), '[^A-Z0-9]+', ' ', 'g'), ' +', ' ', 'g')) AS place_norm,
              substring(regexp_replace(upper(postcode), '[^A-Z0-9]', '', 'g') from '^([A-Z]{1,2}[0-9][A-Z0-9]?)[0-9][A-Z]{2}$') AS outward,
              town,
              count(DISTINCT postcode)::int AS postcodes,
              count(*)::int AS homes
         FROM picking_index
        WHERE town IS NOT NULL
        GROUP BY 1, 2, 3
     ),
     per_place AS (
       SELECT place_norm,
              outward,
              (array_agg(town ORDER BY postcodes DESC, town))[1] AS place_display,
              sum(postcodes)::int AS postcode_count,
              sum(homes)::int AS home_count
         FROM per_place_town
        WHERE outward IS NOT NULL
        GROUP BY place_norm, outward
     )
     INSERT INTO picking_places (place_norm, place_display, outward, postcode_count)
     SELECT place_norm, place_display, outward, postcode_count
       FROM per_place
      WHERE place_norm <> ''
        AND home_count >= 2`,
  );
}

// The union's build and retired names (BUG-202). A
// rebuild constructs the new union under the build
// name and swaps it into the served name by rename —
// it never deletes and re-inserts the served table.
// The retired name holds the old union between the
// swap's two renames and is dropped in the same
// transaction.
export const UNION_BUILD_TABLE = "picking_index_build";
export const UNION_RETIRED_TABLE = "picking_index_retired";

// Rebuild the served union from the two extracts. Runs
// inside the caller's transaction. With includeEpc
// false the union is built from the sales extract alone
// — the kill switch's rebuild.
//
// The shape (BUG-202, the loader staging audit's
// slimming): the old rebuild deleted the union's
// 25.1M rows and re-inserted the join beside them in
// one transaction — a second heap copy plus the WAL
// for both halves of the churn, about a 10 GB
// transient on top of the retained stage. The new
// shape builds the union under a fresh name and swaps
// by rename:
//   - the build table is created inside the caller's
//     transaction, so its bulk insert and one-shot
//     index builds write no WAL (the same-transaction
//     creation rule Postgres applies to a fresh table);
//   - its indexes are built once, on the finished
//     copy, under build names — the primary key and
//     postcode index of migration 0030, the pattern
//     index of migration 0035;
//   - the swap is two renames and a drop inside the
//     same transaction, and the build's indexes are
//     renamed to the served names the migrations gave
//     them, so the table that serves carries exactly
//     the name, shape and index names readers and
//     later migrations expect. A reader sees the old
//     union under the served name or the new one —
//     never a missing or half-built table — and any
//     failure rolls the whole transaction back,
//     renames included, leaving the old union serving.
// The peak is one extra union copy, with no dead
// tuples left behind in the served table.
//
// The street table rebuilds at the end, from the
// union just swapped in — every path that changes the
// union (both filing passes and the EPC kill switch)
// refreshes the streets with it, so the suggestions
// can never name a street the served index does not
// hold (M7.15C). The place table (M7.15D) rebuilds
// beside it on the same paths, under the same rule
// for place names.
export async function rebuildPickingIndex(client, { includeEpc = true, progress = null } = {}) {
  // A leftover under either swap name can only be a
  // relic of a process that died outside a transaction
  // (the build and the swap are transactional, so a
  // failed pass leaves neither) — clear the ground.
  await client.query(`DROP TABLE IF EXISTS ${UNION_BUILD_TABLE}`);
  await client.query(`DROP TABLE IF EXISTS ${UNION_RETIRED_TABLE}`);
  await client.query(
    `CREATE TABLE ${UNION_BUILD_TABLE} (
       postcode text NOT NULL,
       paon text,
       saon text,
       street text,
       town text,
       home_key text NOT NULL,
       sources text[] NOT NULL,
       sales_edition text,
       epc_edition text
     )`,
  );
  // BUG-204: the rebuild's long steps are single
  // statements a log cannot see inside — stage markers
  // with the counts the statements return, so the log
  // moves between them. (The insert's rowCount is a
  // real pg result; a test fake returns no rowCount,
  // and the line then carries no count — never a crash.)
  progress?.stage(
    includeEpc
      ? "building union from the sales + EPC extracts"
      : "building union from the sales extract alone (kill switch)",
  );
  let built;
  if (includeEpc) {
    built = await client.query(
      `INSERT INTO ${UNION_BUILD_TABLE}
         (postcode, paon, saon, street, town, home_key, sources,
          sales_edition, epc_edition)
       SELECT COALESCE(s.postcode, e.postcode),
              COALESCE(s.paon, e.paon),
              COALESCE(s.saon, e.saon),
              COALESCE(s.street, e.street),
              COALESCE(s.town, e.town),
              COALESCE(s.home_key, e.home_key),
              CASE WHEN s.postcode IS NOT NULL AND e.postcode IS NOT NULL
                     THEN ARRAY['sales', 'epc']
                   WHEN s.postcode IS NOT NULL THEN ARRAY['sales']
                   ELSE ARRAY['epc'] END,
              CASE WHEN s.postcode IS NOT NULL
                     THEN (SELECT edition FROM picking_index_editions
                            WHERE source = 'sales')
                   ELSE NULL END,
              CASE WHEN e.postcode IS NOT NULL
                     THEN (SELECT edition FROM picking_index_editions
                            WHERE source = 'epc')
                   ELSE NULL END
         FROM picking_sales_extract s
         FULL OUTER JOIN picking_epc_extract e
           ON e.postcode = s.postcode AND e.home_key = s.home_key`,
    );
  } else {
    built = await client.query(
      `INSERT INTO ${UNION_BUILD_TABLE}
         (postcode, paon, saon, street, town, home_key, sources,
          sales_edition, epc_edition)
       SELECT s.postcode, s.paon, s.saon, s.street, s.town, s.home_key,
              ARRAY['sales'],
              (SELECT edition FROM picking_index_editions
                WHERE source = 'sales'),
              NULL
         FROM picking_sales_extract s`,
    );
  }
  const builtRows = built?.rowCount;
  progress?.stage(
    builtRows === undefined || builtRows === null
      ? "union built"
      : `union built — ${formatCount(builtRows)} homes`,
  );
  progress?.stage("indexing the built union");
  await client.query(`ALTER TABLE ${UNION_BUILD_TABLE} ADD PRIMARY KEY (postcode, home_key)`);
  await client.query(
    `CREATE INDEX ${UNION_BUILD_TABLE}_postcode_idx
       ON ${UNION_BUILD_TABLE} (postcode)`,
  );
  await client.query(
    `CREATE INDEX ${UNION_BUILD_TABLE}_postcode_prefix_idx
       ON ${UNION_BUILD_TABLE} (postcode text_pattern_ops)`,
  );
  // THE SWAP: the served name moves to the retired
  // table, the build takes the served name, the
  // retired table drops, and the build's indexes take
  // the served names — all inside the caller's
  // transaction, so the exchange is atomic and a
  // failure anywhere in the filing undoes it whole.
  progress?.stage("swapping the built union in");
  await client.query(`ALTER TABLE picking_index RENAME TO ${UNION_RETIRED_TABLE}`);
  await client.query(`ALTER TABLE ${UNION_BUILD_TABLE} RENAME TO picking_index`);
  await client.query(`DROP TABLE ${UNION_RETIRED_TABLE}`);
  await client.query(`ALTER INDEX ${UNION_BUILD_TABLE}_pkey RENAME TO picking_index_pkey`);
  await client.query(
    `ALTER INDEX ${UNION_BUILD_TABLE}_postcode_idx
       RENAME TO picking_index_postcode_idx`,
  );
  await client.query(
    `ALTER INDEX ${UNION_BUILD_TABLE}_postcode_prefix_idx
       RENAME TO picking_index_postcode_prefix_idx`,
  );
  progress?.stage("rebuilding the streets and places tables");
  await rebuildPickingStreets(client);
  await rebuildPickingPlaces(client);
}

// Record a filed edition and its proof counts on the
// editions row (inside the caller's swap transaction).
// previousHomes is the count the new edition replaces —
// the next re-extract's tolerance baseline. A successful
// filing clears any recorded refusal.
export async function recordEdition(client, source, filing) {
  await client.query(
    `INSERT INTO picking_index_editions
       (source, edition, loaded_at, postcodes, homes, streets, previous_homes)
     VALUES ($1, $2, now(), $3, $4, $5, $6)
     ON CONFLICT (source) DO UPDATE
        SET edition = EXCLUDED.edition,
            loaded_at = EXCLUDED.loaded_at,
            postcodes = EXCLUDED.postcodes,
            homes = EXCLUDED.homes,
            streets = EXCLUDED.streets,
            previous_homes = EXCLUDED.previous_homes,
            last_rejected_homes = NULL,
            last_rejected_at = NULL`,
    [
      source,
      filing.edition,
      filing.counts.postcodes,
      filing.counts.homes,
      filing.counts.streets,
      filing.previousHomes,
    ],
  );
}

// Record a refused re-extract on the editions row, in
// the caller's own statement (the filing transaction has
// already rolled back — this note must survive it). The
// picking-index canary item reports a refusal recorded
// since the last successful filing.
export async function recordRejection(client, source, rejectedHomes) {
  await client.query(
    `UPDATE picking_index_editions
        SET last_rejected_homes = $2, last_rejected_at = now()
      WHERE source = $1`,
    [source, rejectedHomes],
  );
}

// File one source's staged pass, end to end, in the
// order the union's provenance requires: tolerance proof
// first (nothing has swapped yet — a refusal leaves the
// filed edition serving and is the caller's to record),
// then inside one transaction: swap the extract, count
// what was filed, record the edition, and only then
// rebuild the union (the rebuild stamps each union row
// with the editions the editions table holds, so the new
// edition must be recorded before it runs).
export async function fileStagedExtract(client, { source, edition, progress = null }) {
  const current = await readEdition(client, source);
  const staged = await stagedCounts(client, source);
  if (!countMovementWithinTolerance(current?.homes ?? null, staged.homes)) {
    return {
      filed: false,
      staged,
      previousHomes: current?.homes ?? null,
    };
  }
  await client.query("BEGIN");
  try {
    await swapStagedExtract(client, source);
    const counts = await extractCounts(client, source);
    await recordEdition(client, source, {
      edition,
      counts,
      previousHomes: current?.homes ?? null,
    });
    await rebuildPickingIndex(client, { progress });
    await client.query("COMMIT");
    return { filed: true, counts, previousHomes: current?.homes ?? null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

// THE KILL SWITCH, as an operation: rebuild the served
// index from the sales extract alone, in one
// transaction. EPC-only rows vanish; merged rows keep
// their sales parts with the EPC provenance stripped;
// sales rows are untouched in substance. The EPC
// EXTRACT is deliberately left in place — the switch
// governs what serves, and a later EPC pass rebuilds
// the full union from the retained extracts.
export async function removeEpcFromIndex(client, { progress = null } = {}) {
  await client.query("BEGIN");
  try {
    await rebuildPickingIndex(client, { includeEpc: false, progress });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
