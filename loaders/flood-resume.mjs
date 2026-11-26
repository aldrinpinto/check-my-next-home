// Resume support for the flood loaders (BUG-366).
//
// THE DEFECT (BUG-366, 26 Nov 2026): the flood-zones loader died at
// 59% of a 5-hour read when the EA service closed the connection,
// and the run's progress died with it. Staging was a TEMP table
// inside one transaction spanning the whole run, so the 243,750
// features already read were never durable anywhere and the re-run
// had to start from zero. There was no checkpoint to resume from.
//
// THE SHAPE (this module holds it once, for all five flood loaders):
// staging is a PERSISTENT table now (migration 0047), and a
// one-row-per-loader checkpoint records the last fully staged page
// — the resume point — plus the running totals, committed as the
// read proceeds. A killed run's staged rows survive; the next run
// resumes from the checkpoint instead of restarting.
//
// THE INVARIANT that makes this safe (BUG-248 atomicity, unchanged):
// the live tables still change ONLY on a complete, verified swap.
// Staging is never visible to the site. The swap runs in its own
// transaction at the end; a successful swap deletes the staging
// rows and the checkpoint, so nothing is left behind. A failed or
// aborted run leaves staging + checkpoint in place, and the next
// run picks them up.
//
// THE RESUME CONTRACT, enforced by validateCheckpoint:
//   - the checkpoint must belong to the same edition AND the same
//     service count (expected) as the run now starting — a
//     republication between runs invalidates it;
//   - the staged rows must form the read's contiguous prefix:
//     count n with seqs summing to n(n-1)/2 is exactly the set
//     {0..n-1} (seqs are distinct by the UNIQUE constraint), so
//     a gap is caught here, up front, instead of failing at
//     the swap after hours of re-reading. The prefix may run
//     PAST the checkpoint — the interrupted unit's flushed
//     chunks are staged rows too, and the resumed run
//     re-stages them as no-ops — only the checkpointed
//     prefix must be present (staged >= filed_count);
//   - the resume point must sit inside 0..expected.
// Anything else is discarded (staging rows + checkpoint deleted)
// and the run starts from zero, with a log line saying why.
//
// THE IDEMPOTENCY that makes a mid-page kill harmless: every staged
// row carries seq, its ordinal in the read, unique per layer. A
// resumed run re-fetches the page it was interrupted on and
// re-stages it; rows already flushed are ON CONFLICT DO NOTHING
// no-ops, so the staged set is exactly the read's prefix and the
// running totals — seeded from the checkpoint and advanced once
// per page — count every feature once. The checkpoint is written
// only after a whole page (or fixture part, or 1,000 defence
// rows) is staged, so the checkpoint always sits on a unit
// boundary and the interrupted unit is simply re-read.
//
// THE GOLDEN SIFT across a resume: the in-memory sift only ever
// sees the portion read in THIS process. On resume, the staged
// portion's candidates are rebuilt from the staging table
// (stagedGoldenRows): the envelope test mirrors the sift's bbox
// test — an item is retained when its bounding box comes within
// the golden window — so the rebuilt set is exactly what the
// live sift would have retained for that portion, and the
// golden checks run over the whole read either way.
//
// THE LOG (BUG-204, and the founder's 26 Nov refinement: every
// save must be visible): each checkpoint write emits one
// progress line, "checkpoint <read>/<expected> features (<pct>%) ·
// staged <filed> · resume from <next>". One line per committed
// chunk — a page of the live read, a part of a fixture, 1,000
// defence rows — never per row. A resume and a discard each earn
// one stage line; a successful swap earns one staging-cleared
// line. No progress line ever starts with "load-" (the runner
// contract).

import { GOLDEN_WINDOW_MILES } from "./flood-stream.mjs";
import { formatCount } from "./progress.mjs";

export const FLOOD_RESUME_CHECKPOINT_TABLE = "flood_loader_checkpoint";
export const FLOOD_RESUME_WINDOW_METRES = GOLDEN_WINDOW_MILES * 1609.344;

// --- checkpoint rows -------------------------------------------------

export async function readCheckpoint(client, loader) {
  const { rows } = await client.query(
    `SELECT loader, layer_type, edition, expected, next_start_index, read_count, filed_count, geoless_count, per_label, updated_at
       FROM ${FLOOD_RESUME_CHECKPOINT_TABLE} WHERE loader = $1`,
    [loader],
  );
  return rows[0] ?? null;
}

export async function writeCheckpoint(client, checkpoint) {
  await client.query(
    `INSERT INTO ${FLOOD_RESUME_CHECKPOINT_TABLE}
       (loader, layer_type, edition, expected, next_start_index, read_count, filed_count, geoless_count, per_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (loader) DO UPDATE SET
       layer_type = EXCLUDED.layer_type,
       edition = EXCLUDED.edition,
       expected = EXCLUDED.expected,
       next_start_index = EXCLUDED.next_start_index,
       read_count = EXCLUDED.read_count,
       filed_count = EXCLUDED.filed_count,
       geoless_count = EXCLUDED.geoless_count,
       per_label = EXCLUDED.per_label,
       updated_at = now()`,
    [
      checkpoint.loader,
      checkpoint.layerType,
      checkpoint.edition,
      checkpoint.expected,
      checkpoint.nextStartIndex,
      checkpoint.read,
      checkpoint.filed,
      checkpoint.geoless,
      JSON.stringify(checkpoint.perLabel),
    ],
  );
}

export async function clearCheckpoint(client, loader) {
  await client.query(`DELETE FROM ${FLOOD_RESUME_CHECKPOINT_TABLE} WHERE loader = $1`, [loader]);
}

// --- staging ---------------------------------------------------------

// The staged shape: the row count and the sum of seqs.
// Together they prove the staged rows are the read's
// contiguous prefix {0..n-1} — seqs are distinct by the
// UNIQUE constraint, and n distinct non-negative integers
// summing to n(n-1)/2 are exactly that set.
export async function stagingCount(client, stageTable, layerType) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n, coalesce(sum(seq), 0)::bigint AS s FROM ${stageTable} WHERE layer_type = $1`,
    [layerType],
  );
  return { count: rows[0].n, sum: Number(rows[0].s) };
}

export async function clearStaging(client, stageTable, layerType) {
  await client.query(`DELETE FROM ${stageTable} WHERE layer_type = $1`, [layerType]);
}

// --- validation --------------------------------------------------------

// The resume contract, as a pure function (unit-tested): a checkpoint
// is trusted only when it belongs to this edition and this count,
// the staged rows form the read's contiguous prefix reaching at
// least as far as the checkpoint, and the resume point sits
// inside the read.
export function validateCheckpoint({ checkpoint, edition, expected, staged }) {
  if (!checkpoint) return { resumed: false, reason: "no checkpoint" };
  if (checkpoint.edition !== edition)
    return {
      resumed: false,
      reason: `edition changed (${checkpoint.edition} → ${edition})`,
    };
  if (checkpoint.expected !== expected)
    return {
      resumed: false,
      reason: `expected count changed (${checkpoint.expected} → ${expected})`,
    };
  const { count, sum } = staged;
  if (sum !== (count * (count - 1)) / 2)
    return {
      resumed: false,
      reason: `staged ${formatCount(count)} rows with a gap in their seqs — the staged prefix is not contiguous`,
    };
  if (count < checkpoint.filed_count)
    return {
      resumed: false,
      reason: `staged ${formatCount(count)} rows but the checkpoint says ${formatCount(checkpoint.filed_count)}`,
    };
  if (checkpoint.next_start_index < 0 || checkpoint.next_start_index > expected)
    return {
      resumed: false,
      reason: `resume point ${formatCount(checkpoint.next_start_index)} is outside 0–${formatCount(expected)}`,
    };
  return { resumed: true, checkpoint };
}

// --- staged golden candidates ------------------------------------------

// The staged portion's golden candidates, for rebuilding the sift
// after a resume. One query over all the golden homes: a staged row
// is returned when its bounding box (ST_Envelope — the same box the
// in-memory sift tests) comes within the golden window of any home.
// The geometry test would be stricter than the sift's bbox test and
// could drop a candidate the checks need; the envelope test cannot.
// A row near two homes is returned once (one OR per home, one row).
// Only the CHECKPOINTED prefix is returned (seq < filedCount):
// rows flushed past the checkpoint — the interrupted unit's
// staged chunks — are re-read and re-offered by the resumed run,
// so returning them here would duplicate them in the sift and
// inflate the golden counts.
export async function stagedGoldenRows(
  client,
  { stageTable, layerType, homes, filedCount = null },
) {
  const homeList = Object.values(homes);
  const windowParam = 2 + homeList.length * 2;
  const conditions = [];
  const params = [layerType];
  homeList.forEach((home, i) => {
    const base = 2 + i * 2;
    conditions.push(
      `ST_DWithin(ST_Envelope(geom)::geography, ST_SetSRID(ST_MakePoint($${base}, $${base + 1}), 4326)::geography, $${windowParam})`,
    );
    params.push(home.lng, home.lat);
  });
  params.push(FLOOD_RESUME_WINDOW_METRES);
  const seqFilter = filedCount === null ? "" : ` AND seq < $${windowParam + 1}`;
  if (filedCount !== null) params.push(filedCount);
  const { rows } = await client.query(
    `SELECT risk_label, detail, ST_AsGeoJSON(geom) AS geojson FROM ${stageTable}
      WHERE layer_type = $1 AND (${conditions.join(" OR ")})${seqFilter}`,
    params,
  );
  return rows;
}

// --- the per-run handle --------------------------------------------------

// One handle per filing run, owned by the loader's filer. It holds
// the client, the checkpoint row's identity, the seq counter for
// the staging inserts, and the last checkpoint written (which is
// what the failure line's resume note reports).
/**
 * One handle per filing run, owned by the loader's filer. It holds
 * the client, the checkpoint row's identity, the seq counter for
 * the staging inserts, and the last checkpoint written (which is
 * what the failure line's resume note reports).
 *
 * @param {any} client
 * @param {{ loader: string, layerType: string, stageTable: string, progress?: import("./progress.mjs").ProgressLogger | null, restart?: boolean }} [options]
 */
export function createFloodResume(
  client,
  { loader, layerType, stageTable, progress = null, restart = false } = {},
) {
  let seqNext = 0;
  let lastCheckpoint = null;
  // The filed count of the checkpoint this run resumed from —
  // the staged-golden rebuild is capped at it, so rows
  // flushed past the checkpoint are never returned twice.
  let resumedFiledCount = null;
  return {
    get loader() {
      return loader;
    },

    // The next seq to assign, and advance past count rows. Rows
    // are assigned their seq at flush time, so the counter only
    // ever advances for rows actually inserted — and on resume it
    // is seeded from the checkpoint, so a re-staged page reuses
    // exactly the seqs its rows already carry.
    takeSeq(count) {
      const base = seqNext;
      seqNext += count;
      return base;
    },

    // Decide, from the run's head (edition + expected) and the
    // staged rows, whether this run resumes or starts from zero.
    // A fresh start clears any staging rows for the layer first:
    // without a checkpoint they belong to no run at all, and a
    // new run must stage onto empty ground, or stale rows would
    // sit under its seqs and pass the swap's staged-count check
    // for data this run never read.
    async prepare({ edition, expected }) {
      // --restart: the operator's explicit fresh start — discard
      // whatever a previous run left, checkpoint or not, and say so.
      if (restart) {
        await clearStaging(client, stageTable, layerType);
        await clearCheckpoint(client, loader);
        seqNext = 0;
        lastCheckpoint = null;
        resumedFiledCount = null;
        progress?.stage("restart requested — discarding checkpoint and staging · starting from 0");
        return { resumed: false, reason: "restart requested" };
      }
      const checkpoint = await readCheckpoint(client, loader);
      if (!checkpoint) {
        await clearStaging(client, stageTable, layerType);
        seqNext = 0;
        lastCheckpoint = null;
        resumedFiledCount = null;
        return { resumed: false };
      }
      const staged = await stagingCount(client, stageTable, layerType);
      const check = validateCheckpoint({ checkpoint, edition, expected, staged });
      if (!check.resumed) {
        await clearStaging(client, stageTable, layerType);
        await clearCheckpoint(client, loader);
        seqNext = 0;
        lastCheckpoint = null;
        resumedFiledCount = null;
        progress?.stage(`discarding stale checkpoint · ${check.reason} · starting from 0`);
        return { resumed: false, reason: check.reason };
      }
      seqNext = checkpoint.filed_count;
      lastCheckpoint = checkpoint;
      resumedFiledCount = checkpoint.filed_count;
      progress?.stage(
        `resuming from checkpoint · ${formatCount(checkpoint.filed_count)}/${formatCount(checkpoint.expected)} features staged · edition ${checkpoint.edition} · resume from ${formatCount(checkpoint.next_start_index)}`,
      );
      return { resumed: true, checkpoint };
    },

    // Write the checkpoint for a fully staged unit (a page, a
    // fixture part, a block of defence rows) and log the save —
    // one line per committed chunk, never per row. The line is
    // the visible record that the unit is durable now: a kill
    // after this line loses at most the unit in flight.
    async checkpoint({ edition, expected, nextStartIndex, totals, unit = "features" }) {
      const row = {
        loader,
        layerType,
        edition,
        expected,
        nextStartIndex,
        read: totals.read,
        filed: totals.filed,
        geoless: totals.geoless,
        perLabel: totals.perLabel,
      };
      await writeCheckpoint(client, row);
      lastCheckpoint = {
        loader,
        layer_type: layerType,
        edition,
        expected,
        next_start_index: nextStartIndex,
        read_count: totals.read,
        filed_count: totals.filed,
        geoless_count: totals.geoless,
        per_label: totals.perLabel,
      };
      progress?.count({
        label: "checkpoint",
        done: totals.read,
        total: expected,
        unit,
        extra: `staged ${formatCount(totals.filed)} · resume from ${formatCount(nextStartIndex)}`,
      });
    },

    // The staged portion's golden candidates, mapped by the
    // caller (the loader owns the geometry conversion) —
    // capped at the checkpoint this run resumed from, so the
    // interrupted unit's rows are never returned twice.
    async stagedGoldenRows(homes) {
      return stagedGoldenRows(client, {
        stageTable,
        layerType,
        homes,
        filedCount: resumedFiledCount,
      });
    },

    // The failure line's resume note — the phrase after
    // "resume from". It reports the last checkpoint written,
    // so a failure mid-read names the point the next run
    // resumes from, and a failure at the swap names the swap.
    resumeNote() {
      if (!lastCheckpoint) return "the start (nothing staged yet)";
      if (lastCheckpoint.next_start_index >= lastCheckpoint.expected)
        return `the swap — the staged read stands checkpointed (edition ${lastCheckpoint.edition})`;
      return `checkpoint ${formatCount(lastCheckpoint.next_start_index)}/${formatCount(lastCheckpoint.expected)} features (edition ${lastCheckpoint.edition})`;
    },

    // Clear staging + checkpoint after a successful swap, in one
    // transaction so the two cannot diverge. A failure here must
    // never fail the run — the swap has already committed, and
    // leftovers are discarded by the next run's validation.
    async clear() {
      try {
        await client.query("BEGIN");
        await clearStaging(client, stageTable, layerType);
        await clearCheckpoint(client, loader);
        await client.query("COMMIT");
        lastCheckpoint = null;
        progress?.stage("staging cleared · checkpoint removed");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        progress?.stage(
          "staging cleanup failed — left for the next run to discard · " +
            String(error?.message ?? error ?? "").split(/\r?\n/)[0],
        );
      }
    },
  };
}
