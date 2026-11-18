// Shared filing machinery for the national picking index
// (plan step M7.15B, migration 0030).
//
// Two loader passes — the sales parts pass
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

// Rebuild the served union from the two extracts. Runs
// inside the caller's transaction. With includeEpc
// false the union is built from the sales extract alone
// — the kill switch's rebuild.
export async function rebuildPickingIndex(client, { includeEpc = true } = {}) {
  await client.query("DELETE FROM picking_index");
  if (includeEpc) {
    await client.query(
      `INSERT INTO picking_index
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
    await client.query(
      `INSERT INTO picking_index
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
export async function fileStagedExtract(client, { source, edition }) {
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
    await rebuildPickingIndex(client);
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
export async function removeEpcFromIndex(client) {
  await client.query("BEGIN");
  try {
    await rebuildPickingIndex(client, { includeEpc: false });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
