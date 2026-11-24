import { statfsSync } from "node:fs";

// One shared progress logger for the loaders (BUG-204, BUG-248).
//
// The complaint: every loader printed only its final summary
// line, so a running loader's log sat at 0 bytes for hours and
// nobody could tell whether it was working or where it was —
// the broadband sweep's ~346 batches gave no percentage at
// all. These lines are the fix: a short line to stdout as the
// work happens, timestamped, so tailing the log shows movement
// in real time.
//
// THE RUNNER CONTRACT. run-loaders.mjs takes a loader run's
// log line as the LAST stdout line starting with "load-" —
// the final summary. A progress line must therefore NEVER
// start with "load-": every line here starts with its ISO
// timestamp, so the runner keeps recording the summary and
// the run record is unchanged. The "progress" token in the
// middle makes the lines greppable (`grep progress`).
//
// TWO SHAPES, by loop grain —
//   - per-line loops (a 31.7M-line intake, a certificate
//     stream): call progress.count() behind a modulo guard,
//     so the check costs one remainder per line and a line
//     lands every N lines. Never log per row.
//   - per-batch loops (merge chunks, sweep batches, read
//     pages, stage flushes): a tally object — tick(done)
//     after each batch, finish(done) at the end. The tally
//     emits only when done crosses the next multiple of
//     `every`, and finish() always emits the closing line
//     unless the last tick already said the same number.
// A total is shown as done/total with a percentage only
// where the total is genuinely known (merge chunks, sweep
// batches, the service's numberMatched); where it is not,
// the line carries the count alone — never a guessed
// percentage.
//
// The log lines are ADDITIONS. No loader's final summary
// line, stamp, guard or swap changes in this file's name —
// the helper only ever writes to the `log` function it is
// given (console.log on the CLI path, the caller's own log
// where a loader already takes one, a collector in tests).
//
// HEALTH LINES (BUG-248). One log tells a run's whole story,
// so three more line types join the progress line, in the
// same shape — ISO timestamp first, never the loader name:
//   heartbeat: <ISO> <loader> heartbeat · <stage> · <done>/<total> · <elapsed> · RSS <x> MB · disk <y> GB free
//   warning: <ISO> <loader> warning · <what> · <value> (threshold <t>)
//   failure: <ISO> <loader> failed · <stage> · filed <x> of <y> · <error first line> · resume from <point>
// The heartbeat is coarse — every 15 minutes OR every 10
// batches, whichever comes first, never per batch or per
// row — and its throttle state is keyed per stage name, so
// one logger can serve several stages in one run. The
// failure line carries only the first line of the error:
// a stack trace never belongs in the log.

/**
 * One counted line's arguments: `done` against `total`
 * where the total is genuinely known (a percentage is
 * then shown); without a total the line carries the
 * count alone. `extra` is a trailing fact — rows filed,
 * keys removed — never a second count.
 * @typedef {Object} ProgressCount
 * @property {string} label
 * @property {number} done
 * @property {number} [total]
 * @property {string} [unit]
 * @property {string} [extra]
 */

/**
 * A throttled tally for a per-batch loop.
 * @typedef {Object} ProgressTally
 * @property {(done: number, extra?: string) => void} tick
 * @property {(done: number, extra?: string) => void} finish
 */

/**
 * The logger a loader writes its progress through.
 * @typedef {Object} ProgressLogger
 * @property {(message: string) => void} stage
 * @property {(args: ProgressCount) => void} count
 * @property {(args: { label: string, total?: number | null, every: number, unit?: string }) => ProgressTally} tally
 * @property {(args: { stage: string, done: number, total?: number | null, every?: number }) => boolean} heartbeat
 * @property {(args: { what: string, value: string, threshold: string }) => void} warning
 * @property {(args: { stage: string, filed: number, total?: number | null, error: unknown, resume: string }) => void} failed
 */

/**
 * @param {number} n
 * @returns {string}
 */
export function formatCount(n) {
  return n.toLocaleString("en-GB");
}

// Heartbeat cadence: every 15 minutes OR every 10 batches,
// whichever comes first (BUG-248).
export const HEARTBEAT_EVERY_MS = 15 * 60 * 1000;
export const HEARTBEAT_EVERY_BATCHES = 10;
// Health thresholds (BUG-248). Disk free is in GB, RSS in MB.
export const DISK_FREE_WARN_GB = 15;
export const RSS_WARN_MB = 4096;
// A batch taking more than this multiple of the recent average
// earns a slow-batch warning (BUG-248).
export const SLOW_BATCH_FACTOR = 3;

// "95s" · "1m 30s" · "1h 1m" — for heartbeat elapsed times and
// batch durations. Seconds are dropped past the hour: a
// heartbeat is coarse, and "1h 1m" reads better than "1h 1m 7s".
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// The loader's own memory footprint and the free disk on the
// directory it stages into. Both reads are cheap and
// synchronous, like the rest of these helpers; either may fail
// (a directory that has gone away mid-run), in which case the
// value is null and the heartbeat line reads "unknown" instead
// — a health line must never throw.
export function readResources(diskDir = process.cwd()) {
  let rssMb = null;
  try {
    rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  } catch {
    rssMb = null;
  }
  let diskGb = null;
  try {
    const stats = statfsSync(diskDir);
    diskGb = (stats.bavail * stats.bsize) / 1e9;
  } catch {
    diskGb = null;
  }
  return { rssMb, diskGb };
}

// A pure slow-batch watch: feed each batch's duration in
// milliseconds and it reports whether that batch ran slow
// against the average of the batches before it. The first
// batch has no average to beat, so it can never be slow.
export function createBatchWatch({ slowFactor = SLOW_BATCH_FACTOR } = {}) {
  let totalMs = 0;
  let seen = 0;
  return {
    observe(tookMs) {
      const averageMs = seen === 0 ? null : totalMs / seen;
      const slow = averageMs !== null && tookMs > slowFactor * averageMs;
      totalMs += tookMs;
      seen += 1;
      return { tookMs, averageMs, slow };
    },
  };
}

/**
 * @param {ProgressCount} args
 * @returns {string}
 */
function renderCount({ label, done, total = null, unit = "", extra = "" }) {
  const counted =
    total !== null && total !== undefined && total > 0
      ? `${formatCount(done)}/${formatCount(total)}${unit ? ` ${unit}` : ""} (${Math.min(100, Math.round((done / total) * 100))}%)`
      : `${formatCount(done)}${unit ? ` ${unit}` : ""}`;
  return `${label} ${counted}${extra ? ` · ${extra}` : ""}`;
}

/**
 * @param {{ name: string, log?: (...args: any[]) => void, now?: () => number, diskDir?: string, resourceReader?: (diskDir: string) => { rssMb: number | null, diskGb: number | null } }} options
 * @returns {ProgressLogger}
 */
export function createProgressLogger({
  name,
  log = console.log,
  now = () => Date.now(),
  diskDir = process.cwd(),
  // The resource reader, injectable so tests can pin the
  // threshold behaviour with fixed values instead of
  // allocating 4 GB or finding a nearly-full disk. The
  // production default reads the real process and disk.
  resourceReader = readResources,
} = {}) {
  const startedAt = now();
  // Throttle state per stage name: the last done count that
  // earned a heartbeat, and the wall-clock time it fired.
  const heartbeatState = new Map();
  // Resource warnings fire once per resource per run, on the
  // crossing — a disk that stays under 15 GB free does not
  // earn a warning line every 15 minutes.
  const warned = new Set();
  const stamp = () => new Date(now()).toISOString();
  const emit = (message) => {
    log(`${stamp()} ${name} progress · ${message}`);
  };
  const warning = ({ what, value, threshold }) => {
    log(`${stamp()} ${name} warning · ${what} · ${value} (threshold ${threshold})`);
  };
  return {
    // A stage marker — always emitted, for the long steps
    // between counts (a swap starting, a rebuild phase).
    stage(message) {
      emit(message);
    },
    // One counted line, now.
    count(args) {
      emit(renderCount(args));
    },
    // A throttled tally for a per-batch loop. `every` is the
    // step between lines, in the same units as `done`.
    tally({ label, total = null, every, unit = "" }) {
      if (!Number.isInteger(every) || every <= 0)
        throw new Error(
          `progress tally for ${name}: "every" must be a positive integer, got ${every}`,
        );
      let next = every;
      let lastEmitted = null;
      return {
        tick(done, extra = "") {
          if (done >= next) {
            emit(renderCount({ label, done, total, unit, extra }));
            lastEmitted = done;
            next = Math.floor(done / every) * every + every;
          }
        },
        finish(done, extra = "") {
          if (done !== lastEmitted) emit(renderCount({ label, done, total, unit, extra }));
        },
      };
    },

    // A coarse health line: fires only when the stage has
    // advanced HEARTBEAT_EVERY_BATCHES since its last
    // heartbeat, or HEARTBEAT_EVERY_MS have passed since it
    // — whichever comes first. The first call for a stage
    // never fires on its own: a stage that finishes inside
    // one cadence window earns no heartbeat, only its
    // progress lines. Returns whether a line was printed.
    // After printing, the run's own resource use is checked:
    // disk free under DISK_FREE_WARN_GB, or RSS over
    // RSS_WARN_MB, earns a one-time warning line each.
    heartbeat({ stage, done, total = null, every = HEARTBEAT_EVERY_BATCHES }) {
      const state = heartbeatState.get(stage) ?? { lastDone: 0, lastTime: startedAt };
      const at = now();
      const dueByBatches = done - state.lastDone >= every;
      const dueByTime = at - state.lastTime >= HEARTBEAT_EVERY_MS;
      if (!dueByBatches && !dueByTime) return false;
      heartbeatState.set(stage, { lastDone: done, lastTime: at });
      const { rssMb, diskGb } = resourceReader(diskDir);
      const counted =
        total === null ? formatCount(done) : `${formatCount(done)}/${formatCount(total)}`;
      log(
        `${stamp()} ${name} heartbeat · ${stage} · ${counted} · ${formatDuration(at - startedAt)} · ` +
          `RSS ${rssMb === null ? "unknown" : `${formatCount(rssMb)} MB`} · ` +
          `disk ${diskGb === null ? "unknown" : `${diskGb.toFixed(1)} GB free`}`,
      );
      if (diskGb !== null && diskGb < DISK_FREE_WARN_GB && !warned.has("disk")) {
        warned.add("disk");
        warning({
          what: "disk free",
          value: `${diskGb.toFixed(1)} GB`,
          threshold: `${DISK_FREE_WARN_GB} GB`,
        });
      }
      if (rssMb !== null && rssMb > RSS_WARN_MB && !warned.has("rss")) {
        warned.add("rss");
        warning({
          what: "RSS",
          value: `${formatCount(rssMb)} MB`,
          threshold: `${formatCount(RSS_WARN_MB)} MB`,
        });
      }
      return true;
    },

    warning,

    // Printed by the loader itself, at the innermost catch
    // that knows the stage, before the error propagates and
    // the process exits. Only the first line of the error is
    // kept: a stack trace never belongs in the log. "filed
    // <x>" with no "of" when the total is unknown.
    failed({ stage, filed, total = null, error, resume }) {
      const firstLine = String(error?.message ?? error ?? "").split(/\r?\n/)[0];
      const filedText =
        total === null ? formatCount(filed) : `${formatCount(filed)} of ${formatCount(total)}`;
      log(
        `${stamp()} ${name} failed · ${stage} · filed ${filedText} · ` +
          `${firstLine} · resume from ${resume}`,
      );
    },
  };
}
