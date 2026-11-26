// Resume support for the non-flood loaders (BUG-368).
//
// THE DEFECT (BUG-368, 26 Nov 2026): BUG-366 gave the five flood
// loaders persistent staging + a checkpoint; every other long
// loader still staged into a TEMP table inside one transaction
// spanning the whole run, so a kill anywhere lost the run's
// progress outright and the re-run started from zero. This module
// is the flood shape generalised: one checkpoint table for all
// loaders, and one handle per filing run, parameterised by the
// loader's own stage table.
//
// THE SHAPE: staging is a PERSISTENT table now (migration 0048),
// and a one-row-per-loader checkpoint records the last fully
// staged chunk — the resume point — plus the running totals,
// committed as the read proceeds. A killed run's staged rows
// survive; the next run resumes from the checkpoint instead of
// restarting. Each loader keeps its own stage table and its own
// swap SQL; only the resume mechanics live here.
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
//     republication between runs invalidates it. Loaders whose
//     total is genuinely unknown until the read ends pass
//     expected: null, and that check is skipped;
//   - the staged rows must form the read's contiguous prefix:
//     count n with seqs summing to n(2b+n-1)/2 is exactly the set
//     {b..b+n-1} (seqs are distinct — by the UNIQUE constraint,
//     or by GENERATED ALWAYS AS IDENTITY), so a gap is caught
//     here, up front, instead of failing at the swap after hours
//     of re-reading. The prefix may run PAST the checkpoint —
//     the interrupted chunk's flushed rows are staged rows too —
//     and prepare() trims that tail (DELETE WHERE seq past the
//     checkpoint), because the resumed run re-reads from the
//     checkpoint's input position and re-stages them with the
//     same seqs; only the checkpointed prefix must be present
//     (staged >= filed_count);
//   - the resume point must sit inside 0..expected (when the
//     expected total is known).
// Anything else is discarded (staging rows + checkpoint deleted)
// and the run starts from zero, with a log line saying why.
//
// THE IDEMPOTENCY that makes a mid-chunk kill harmless: every
// staged row carries seq, its ordinal in the staged set, dense
// from seqBase (0 for takeSeq-assigned tables, 1 for identity
// columns). A checkpoint is written after each fully staged
// chunk, so the checkpoint always sits on a chunk boundary and
// the interrupted chunk is simply re-read. The checkpoint's
// next_start_index is the input position consumed (lines read,
// rows offered, page start index — whatever the loader counts),
// so the resumed run skips exactly that much input and stages
// nothing twice.
//
// THE LOG (BUG-204, and the founder's 26 Nov refinement: every
// save must be visible): each checkpoint write emits one
// progress line, "checkpoint <read>/<expected> (<pct>%) · staged
// <filed> · resume from <next>". One line per committed chunk —
// never per row. A resume and a discard each earn one stage
// line; a successful swap earns one staging-cleared line. No
// progress line ever starts with "load-" (the runner contract).

import { formatCount } from "./progress.mjs";

export const LOADER_RESUME_CHECKPOINT_TABLE = "loader_checkpoint";

// --- checkpoint rows -------------------------------------------------

export async function readCheckpoint(client, loader) {
  const { rows } = await client.query(
    `SELECT loader, edition, expected, next_start_index, read_count, filed_count, state, updated_at
       FROM ${LOADER_RESUME_CHECKPOINT_TABLE} WHERE loader = $1`,
    [loader],
  );
  return rows[0] ?? null;
}

export async function writeCheckpoint(client, checkpoint) {
  await client.query(
    `INSERT INTO ${LOADER_RESUME_CHECKPOINT_TABLE}
       (loader, edition, expected, next_start_index, read_count, filed_count, state)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (loader) DO UPDATE SET
       edition = EXCLUDED.edition,
       expected = EXCLUDED.expected,
       next_start_index = EXCLUDED.next_start_index,
       read_count = EXCLUDED.read_count,
       filed_count = EXCLUDED.filed_count,
       state = EXCLUDED.state,
       updated_at = now()`,
    [
      checkpoint.loader,
      checkpoint.edition,
      checkpoint.expected ?? null,
      checkpoint.nextStartIndex,
      checkpoint.read,
      checkpoint.filed,
      JSON.stringify(checkpoint.state ?? {}),
    ],
  );
}

export async function clearCheckpoint(client, loader) {
  await client.query(`DELETE FROM ${LOADER_RESUME_CHECKPOINT_TABLE} WHERE loader = $1`, [loader]);
}

// --- staging ---------------------------------------------------------

// The staged shape: the row count, the sum of seqs and the
// greatest seq. Count + sum prove the staged rows are the
// read's contiguous prefix {b..b+n-1} — seqs are distinct, and
// n distinct integers from b summing to n(2b+n-1)/2 are
// exactly that set. Max is for the loaders whose staged set
// stops being a prefix after the intake (a dedupe deletes
// rows): their stagedCheck reads it instead.
export async function stagingCount(
  client,
  stageTable,
  { layerColumn = null, layerValue = null } = {},
) {
  const filter = layerColumn ? ` WHERE ${layerColumn} = $1` : "";
  const params = layerColumn ? [layerValue] : [];
  const { rows } = await client.query(
    `SELECT count(*)::int AS n, coalesce(sum(seq), 0)::bigint AS s, coalesce(max(seq), 0)::bigint AS m FROM ${stageTable}${filter}`,
    params,
  );
  return { count: rows[0].n, sum: Number(rows[0].s), max: Number(rows[0].m) };
}

export async function clearStaging(
  client,
  stageTable,
  { layerColumn = null, layerValue = null } = {},
) {
  const filter = layerColumn ? ` WHERE ${layerColumn} = $1` : "";
  const params = layerColumn ? [layerValue] : [];
  await client.query(`DELETE FROM ${stageTable}${filter}`, params);
}

// Drop the staged tail past the checkpoint — the interrupted
// chunk's flushed rows. The resumed run re-reads from the
// checkpoint's input position and re-stages them with the same
// seqs, so the tail is redundant, not data.
export async function trimStagingTail(
  client,
  stageTable,
  { filedCount, seqBase = 0, layerColumn = null, layerValue = null } = {},
) {
  const threshold = filedCount + seqBase;
  const filter = layerColumn ? ` AND ${layerColumn} = $2` : "";
  const params = layerColumn ? [threshold, layerValue] : [threshold];
  const res = await client.query(`DELETE FROM ${stageTable} WHERE seq >= $1${filter}`, params);
  return res.rowCount ?? 0;
}

// --- validation --------------------------------------------------------

// The resume contract, as a pure function (unit-tested): a checkpoint
// is trusted only when it belongs to this edition and this count,
// the staged rows form the read's contiguous prefix reaching at
// least as far as the checkpoint, and the resume point sits
// inside the read.
//
// stagedCheck, when given, replaces the prefix proof for a
// loader whose staged set stops being a prefix after the intake
// (a dedupe deletes rows, a merge replaces them): it receives
// the checkpoint and the staged shape and returns null to use
// the default proof, or { resumed, reason?, prefix? }. A check
// that accepts on another basis returns prefix: false, so
// prepare() never trims a tail it cannot re-stage — the
// loader's own step reconciliations are the guard there.
export function validateCheckpoint({
  checkpoint,
  edition,
  expected,
  staged,
  seqBase = 0,
  stagedCheck = null,
}) {
  if (!checkpoint) return { resumed: false, reason: "no checkpoint" };
  if (checkpoint.edition !== edition)
    return {
      resumed: false,
      reason: `edition changed (${checkpoint.edition} → ${edition})`,
    };
  if (
    expected !== null &&
    expected !== undefined &&
    checkpoint.expected !== null &&
    checkpoint.expected !== expected
  )
    return {
      resumed: false,
      reason: `expected count changed (${checkpoint.expected} → ${expected})`,
    };
  if (stagedCheck) {
    const override = stagedCheck(checkpoint, staged);
    if (override) return { prefix: false, ...override };
  }
  const { count, sum } = staged;
  const prefixSum = (count * (2 * seqBase + count - 1)) / 2;
  if (sum !== prefixSum)
    return {
      resumed: false,
      reason: `staged ${formatCount(count)} rows with a gap in their seqs — the staged prefix is not contiguous`,
    };
  if (count < checkpoint.filed_count)
    return {
      resumed: false,
      reason: `staged ${formatCount(count)} rows but the checkpoint says ${formatCount(checkpoint.filed_count)}`,
    };
  if (checkpoint.next_start_index < 0)
    return {
      resumed: false,
      reason: `resume point ${formatCount(checkpoint.next_start_index)} is negative`,
    };
  if (expected !== null && expected !== undefined && checkpoint.next_start_index > expected)
    return {
      resumed: false,
      reason: `resume point ${formatCount(checkpoint.next_start_index)} is outside 0–${formatCount(expected)}`,
    };
  return { resumed: true, checkpoint, prefix: true };
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
 * @param {{ loader: string, stageTable: string, layerColumn?: string | null, layerValue?: string | null, seqBase?: number, progress?: import("./progress.mjs").ProgressLogger | null, restart?: boolean }} [options]
 */
export function createLoaderResume(
  client,
  {
    loader,
    stageTable,
    layerColumn = null,
    layerValue = null,
    seqBase = 0,
    progress = null,
    restart = false,
  } = {},
) {
  const filter = { layerColumn, layerValue };
  let seqNext = seqBase;
  let lastCheckpoint = null;
  return {
    get loader() {
      return loader;
    },

    // The next seq to assign, and advance past count rows. Rows
    // are assigned their seq at flush time, so the counter only
    // ever advances for rows actually inserted — and on resume it
    // is seeded from the checkpoint, so a re-staged chunk reuses
    // exactly the seqs its rows already carry.
    takeSeq(count) {
      const base = seqNext;
      seqNext += count;
      return base;
    },

    // Decide, from the run's head (edition + expected) and the
    // staged rows, whether this run resumes or starts from zero.
    // A fresh start clears any staging rows for the loader first:
    // without a checkpoint they belong to no run at all, and a
    // new run must stage onto empty ground, or stale rows would
    // sit under its seqs and pass the swap's staged-count check
    // for data this run never read.
    /**
     * @param {{ edition: string, expected?: number | null, stagedCheck?: ((checkpoint: any, staged: any) => any) | null }} head
     * @returns {Promise<{ resumed: boolean, reason?: string, checkpoint?: any, prefix?: boolean }>}
     */
    async prepare({ edition, expected = null, stagedCheck = null }) {
      // --restart: the operator's explicit fresh start — discard
      // whatever a previous run left, checkpoint or not, and say so.
      if (restart) {
        await clearStaging(client, stageTable, filter);
        await clearCheckpoint(client, loader);
        seqNext = seqBase;
        lastCheckpoint = null;
        progress?.stage("restart requested — discarding checkpoint and staging · starting from 0");
        return { resumed: false, reason: "restart requested" };
      }
      const checkpoint = await readCheckpoint(client, loader);
      if (!checkpoint) {
        await clearStaging(client, stageTable, filter);
        seqNext = seqBase;
        lastCheckpoint = null;
        return { resumed: false };
      }
      const staged = await stagingCount(client, stageTable, filter);
      const check = validateCheckpoint({
        checkpoint,
        edition,
        expected,
        staged,
        seqBase,
        stagedCheck,
      });
      if (!check.resumed) {
        await clearStaging(client, stageTable, filter);
        await clearCheckpoint(client, loader);
        seqNext = seqBase;
        lastCheckpoint = null;
        progress?.stage(`discarding stale checkpoint · ${check.reason} · starting from 0`);
        return { resumed: false, reason: check.reason };
      }
      // The interrupted chunk's flushed rows sit past the
      // checkpoint; trim them so the resumed run re-stages
      // exactly that chunk with the same seqs.
      if (check.prefix !== false && staged.count > checkpoint.filed_count) {
        const trimmed = await trimStagingTail(client, stageTable, {
          filedCount: checkpoint.filed_count,
          seqBase,
          ...filter,
        });
        if (trimmed > 0)
          progress?.stage(
            `trimmed ${formatCount(trimmed)} staged rows past the checkpoint · resume re-stages them`,
          );
      }
      seqNext = seqBase + checkpoint.filed_count;
      lastCheckpoint = checkpoint;
      progress?.stage(
        `resuming from checkpoint · ${formatCount(checkpoint.filed_count)} rows staged · edition ${checkpoint.edition} · resume from ${formatCount(checkpoint.next_start_index)}`,
      );
      return { resumed: true, checkpoint };
    },

    // Build a checkpoint row (no I/O). A loader whose flush
    // and checkpoint must commit atomically — the sold-prices
    // intake, whose identity seqs cannot be re-staged — writes
    // the row inside its own transaction with writeCheckpoint
    // and calls noteCheckpoint after the commit; every other
    // loader uses checkpoint() below, which does both.
    /**
     * @param {{ edition: string, expected?: number | null, nextStartIndex: number, read: number, filed: number, state?: Record<string, unknown> }} row
     */
    checkpointRow({ edition, expected = null, nextStartIndex, read, filed, state = {} }) {
      return {
        loader,
        edition,
        expected: expected ?? null,
        nextStartIndex,
        read,
        filed,
        state,
      };
    },

    // Record a checkpoint row already written (by checkpoint()
    // or by the loader's own transaction) as the last one, and
    // log the save — one line per committed chunk, never per row.
    noteCheckpoint(row, { unit = "rows" } = {}) {
      lastCheckpoint = {
        loader: row.loader,
        edition: row.edition,
        expected: row.expected ?? null,
        next_start_index: row.nextStartIndex,
        read_count: row.read,
        filed_count: row.filed,
        state: row.state ?? {},
      };
      progress?.count({
        label: "checkpoint",
        done: row.read,
        total: row.expected ?? undefined,
        unit,
        extra: `staged ${formatCount(row.filed)} · resume from ${formatCount(row.nextStartIndex)}`,
      });
    },

    // Write the checkpoint for a fully staged chunk and log the
    // save — one line per committed chunk, never per row. The
    // line is the visible record that the chunk is durable now:
    // a kill after this line loses at most the chunk in flight.
    /**
     * @param {{ edition: string, expected?: number | null, nextStartIndex: number, read: number, filed: number, state?: Record<string, unknown>, unit?: string }} row
     */
    async checkpoint({
      edition,
      expected = null,
      nextStartIndex,
      read,
      filed,
      state = {},
      unit = "rows",
    }) {
      const row = this.checkpointRow({ edition, expected, nextStartIndex, read, filed, state });
      await writeCheckpoint(client, row);
      this.noteCheckpoint(row, { unit });
    },

    // The failure line's resume note — the phrase after
    // "resume from". It reports the last checkpoint written,
    // so a failure mid-read names the point the next run
    // resumes from, and a failure at the swap names the swap.
    resumeNote() {
      if (!lastCheckpoint) return "the start (nothing staged yet)";
      if (
        lastCheckpoint.expected !== null &&
        lastCheckpoint.expected !== undefined &&
        lastCheckpoint.next_start_index >= lastCheckpoint.expected
      )
        return `the swap — the staged read stands checkpointed (edition ${lastCheckpoint.edition})`;
      return `checkpoint ${formatCount(lastCheckpoint.next_start_index)} (edition ${lastCheckpoint.edition})`;
    },

    // Clear staging + checkpoint after a successful swap, in one
    // transaction so the two cannot diverge. A failure here must
    // never fail the run — the swap has already committed, and
    // leftovers are discarded by the next run's validation.
    async clear() {
      try {
        await client.query("BEGIN");
        await clearStaging(client, stageTable, filter);
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
