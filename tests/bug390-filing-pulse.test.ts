import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgressLogger, withFilingPulse } from "../loaders/progress.mjs";

// BUG-390: the filing/swap phase printed one line and then
// went silent for ~30 minutes while a single INSERT...SELECT
// ran. The pulse is the fix for the indivisible step: a
// timer-driven stage line while the statement runs, so the
// log shows the step is alive and how long it has been in.

// Fake timers throughout: the pulse is a 10ms setInterval
// in these tests, and a real 35ms sleep under a loaded
// full-suite run fired it once instead of twice (prepush
// run 4) — wall-clock timing is not an assertion. Advancing
// the fake clock fires the interval exactly on schedule.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const collect = () => {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("progress.pulse", () => {
  it("emits a stage line every interval while the step runs, and stops on stop()", () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-flood-zones", log });
    const stop = progress.pulse({
      stage: "filing · copying shapes into flood_layers",
      intervalMs: 10,
    });
    vi.advanceTimersByTime(35);
    stop();
    expect(lines).toHaveLength(3);
    vi.advanceTimersByTime(35);
    expect(lines).toHaveLength(3);
    expect(
      lines.every((l) =>
        /progress · filing · copying shapes into flood_layers · still running · /.test(l),
      ),
    ).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
    expect(lines.every((l) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /.test(l))).toBe(true);
  });

  it("stop() is idempotent — stopping twice logs nothing extra", () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-flood-zones", log });
    const stop = progress.pulse({ stage: "filing · copying shapes", intervalMs: 10 });
    vi.advanceTimersByTime(15);
    stop();
    stop();
    const fired = lines.length;
    vi.advanceTimersByTime(25);
    expect(lines.length).toBe(fired);
  });

  it("throws on a non-positive interval, like the tally's every", () => {
    const { log } = collect();
    const progress = createProgressLogger({ name: "load-flood-zones", log });
    expect(() => progress.pulse({ stage: "filing · x", intervalMs: 0 })).toThrow(
      /positive integer/,
    );
    expect(() => progress.pulse({ stage: "filing · x", intervalMs: -5 })).toThrow(
      /positive integer/,
    );
  });
});

describe("withFilingPulse", () => {
  it("returns the work's value and stops the pulse on success", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-flood-zones", log });
    const pending = withFilingPulse(
      progress,
      { stage: "filing · copying shapes into flood_layers", intervalMs: 10 },
      async () => {
        await sleep(25);
        return 42;
      },
    );
    // Attach the assertion BEFORE advancing the clock: the
    // work resolves while the clock moves, and a promise
    // settling with no handler yet is an unhandled rejection
    // (or a lost resolution) under fake timers.
    const assertion = expect(pending).resolves.toBe(42);
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const fired = lines.length;
    await vi.advanceTimersByTimeAsync(30);
    expect(lines.length).toBe(fired);
  });

  it("stops the pulse and rethrows when the work fails", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-flood-zones", log });
    const pending = withFilingPulse(
      progress,
      { stage: "filing · copying shapes into flood_layers", intervalMs: 10 },
      async () => {
        await sleep(15);
        throw new Error("boom");
      },
    );
    // Attach the assertion BEFORE advancing the clock: the
    // work rejects while the clock moves, and a rejection
    // with no handler yet is flagged unhandled by vitest.
    const assertion = expect(pending).rejects.toThrow("boom");
    await vi.advanceTimersByTimeAsync(15);
    await assertion;
    const fired = lines.length;
    await vi.advanceTimersByTimeAsync(30);
    expect(lines.length).toBe(fired);
  });

  it("runs the work with no logger and no lines", async () => {
    await expect(withFilingPulse(null, { stage: "filing · x" }, async () => 7)).resolves.toBe(7);
  });
});
