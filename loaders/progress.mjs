// One shared progress logger for the loaders (BUG-204).
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
 */

/**
 * @param {number} n
 * @returns {string}
 */
export function formatCount(n) {
  return n.toLocaleString("en-GB");
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
 * @param {{ name: string, log?: (...args: any[]) => void }} options
 * @returns {ProgressLogger}
 */
export function createProgressLogger({ name, log = console.log } = {}) {
  const emit = (message) => {
    log(`${new Date().toISOString()} ${name} progress · ${message}`);
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
  };
}
