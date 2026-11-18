// Canary probe for the national picking index (plan
// step M7.15B; migration 0030). Its own module, like
// canary-postio.mjs: a pure verdict function over the
// filed editions, a probe that reads them, and the
// friendly-name wiring in run-loaders.mjs.
//
// What the monthly canary says about the index:
//
//   - Not wired / not loaded yet: before the first
//     national run the index is empty BY PLAN (the runs
//     are supervised, after deploy), and the picker
//     serves filed data + the Postio supplement exactly
//     as it did before the preload existed. That state
//     is reported in the item's own words and counts as
//     skipped, never as a failure.
//   - Half-loaded: one source filed and the other never
//     — a warning; the union is serving half its design.
//   - Ageing: either source's edition more than
//     STALE_AFTER_DAYS old — a warning. The monthly
//     passes keep editions a month young; a stale
//     edition means a pass has been failing or a
//     download has not been filed (the re-extract
//     tolerance refusal is exactly the failure that
//     ages an edition this way).
//   - A refused re-extract: the loader records a refusal
//     on the editions row when a new extract's distinct
//     home count moves beyond tolerance; a refusal
//     recorded since the last successful filing is a
//     warning naming both counts.
//
// Like the Postio probe, this one spends nothing and
// judges nothing it cannot see: with no DATABASE_URL,
// or on a database the migration has not reached, it
// skips in its own words.

// A monthly pass keeps an edition at most ~31 days old;
// 45 leaves headroom for a late download without crying
// wolf, and still catches a missed month.
export const STALE_AFTER_DAYS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

// editions: the picking_index_editions rows as read by
// the probe — [{ source, edition, loaded_at, homes,
// previous_homes, last_rejected_homes, last_rejected_at }]
// with timestamps as Date or ISO string — or null when
// the table could not be read. Returns the canary
// outcome contract: { skipped } | { warning, logLine } |
// { logLine }.
export function pickingIndexVerdict(editions, now = new Date()) {
  if (editions === null) {
    return {
      skipped:
        "picking-index canary: the editions table could not be read (no DATABASE_URL, or migration 0030 has not run) — the index's freshness is unjudged this run",
    };
  }
  const bySource = new Map(editions.map((row) => [row.source, row]));
  const sales = bySource.get("sales");
  const epc = bySource.get("epc");
  const filed = (row) => row !== undefined && row.loaded_at !== null && row.loaded_at !== undefined;

  if (!filed(sales) && !filed(epc)) {
    return {
      skipped:
        "picking-index canary: the national preload has not run yet — the picker serves filed data + Postio, by design",
    };
  }

  const problems = [];
  const notes = [];
  for (const [label, row] of [
    ["sales", sales],
    ["epc", epc],
  ]) {
    if (!filed(row)) {
      problems.push(`the ${label} half of the picking index has never been filed`);
      continue;
    }
    const loadedAt = new Date(row.loaded_at).getTime();
    const ageDays = Math.floor((now.getTime() - loadedAt) / DAY_MS);
    if (ageDays > STALE_AFTER_DAYS) {
      problems.push(
        `the ${label} edition in the picking index is ${ageDays} days old (edition ${row.edition ?? "unnamed"}) — a monthly pass is overdue`,
      );
    } else {
      notes.push(`${label} edition ${row.edition ?? "unnamed"}, ${ageDays} days old`);
    }
    if (
      row.last_rejected_homes !== null &&
      row.last_rejected_homes !== undefined &&
      row.last_rejected_at !== null &&
      row.last_rejected_at !== undefined &&
      new Date(row.last_rejected_at).getTime() >= loadedAt
    ) {
      problems.push(
        `a ${label} re-extract was refused on count movement (${row.last_rejected_homes} distinct homes against the filed ${row.homes}) — the filed edition keeps serving; the new source file needs a look before the next pass`,
      );
    }
  }

  if (problems.length > 0) {
    return {
      warning: true,
      logLine: `picking-index canary: ${problems.join("; ")}`,
    };
  }
  return {
    logLine: `picking-index canary: both editions fresh (${notes.join("; ")}).`,
  };
}

export async function probePickingIndex() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString === "") {
    return pickingIndexVerdict(null);
  }
  let pg;
  try {
    pg = (await import("pg")).default;
  } catch {
    return pickingIndexVerdict(null);
  }
  const pool = new pg.Pool({ connectionString });
  try {
    const { rows } = await pool.query(
      `SELECT source, edition, loaded_at, postcodes, homes, streets,
              previous_homes, last_rejected_homes, last_rejected_at
         FROM picking_index_editions`,
    );
    return pickingIndexVerdict(rows);
  } catch {
    return pickingIndexVerdict(null);
  } finally {
    await pool.end().catch(() => {});
  }
}
