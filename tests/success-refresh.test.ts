import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SUCCESS_PROGRESS_LINE,
  SUCCESS_REFRESH_MS,
  SUCCESS_STALL_AFTER_MS,
  SUCCESS_STALLED_LINE,
  startSuccessRefresh,
} from "../lib/success-refresh";

// The success refresh beat (BUG-216, 24 Nov 2026):
// the preparing page re-reads its server state on a
// repeating beat — a soft refresh, never a document
// reload — so the "Check another home" box keeps its
// typed text and its open suggestion panel across the
// tick. The beat lives framework-free here so the node
// harness can pin its shape with fake timers; the
// component only wires the router's refresh into it.

describe("the success refresh beat (BUG-216)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls refresh once per interval, never before the first beat", () => {
    let calls = 0;
    const stop = startSuccessRefresh(() => {
      calls += 1;
    });
    vi.advanceTimersByTime(SUCCESS_REFRESH_MS - 1);
    expect(calls).toBe(0);
    vi.advanceTimersByTime(1);
    expect(calls).toBe(1);
    vi.advanceTimersByTime(SUCCESS_REFRESH_MS);
    expect(calls).toBe(2);
    stop();
  });

  it("a custom delay sets the beat", () => {
    let calls = 0;
    const stop = startSuccessRefresh(() => {
      calls += 1;
    }, 1000);
    vi.advanceTimersByTime(999);
    expect(calls).toBe(0);
    vi.advanceTimersByTime(1);
    expect(calls).toBe(1);
    stop();
  });

  it("stopping the beat ends it — no further refreshes", () => {
    let calls = 0;
    const stop = startSuccessRefresh(() => {
      calls += 1;
    });
    vi.advanceTimersByTime(SUCCESS_REFRESH_MS);
    expect(calls).toBe(1);
    stop();
    vi.advanceTimersByTime(SUCCESS_REFRESH_MS * 3);
    expect(calls).toBe(1);
  });

  it("the default beat is five seconds — the old reload's cadence, kept", () => {
    expect(SUCCESS_REFRESH_MS).toBe(5000);
  });
});

// BUG-332 + BUG-345 (25 Nov 2026): the beat is capped
// and the wait is honest — the progress line carries a
// plain wait estimate (no staged steps, no percentages),
// and after five minutes of preparing the beat stops
// and the stalled line says the report will arrive by
// email.
describe("the success refresh beat — the stall cap (BUG-332) and the honest wait (BUG-345)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("the stall point is five minutes of preparing", () => {
    expect(SUCCESS_STALL_AFTER_MS).toBe(5 * 60 * 1000);
  });

  it("the progress line promises only a wait estimate — no step, no percentage", () => {
    expect(SUCCESS_PROGRESS_LINE).toBe(
      "Your report is still being made — usually ready in about a minute.",
    );
    expect(SUCCESS_PROGRESS_LINE).not.toMatch(/\d+%/);
    expect(SUCCESS_PROGRESS_LINE).not.toMatch(/step \d/i);
  });

  it("the stalled line says the wait is longer than usual and the email is the road", () => {
    expect(SUCCESS_STALLED_LINE).toBe(
      "This is taking longer than usual — we'll email your report as soon as it's ready.",
    );
  });

  it("the beat stops at the stall point: no further refreshes, and the stall callback fires once", () => {
    let calls = 0;
    let stalled = 0;
    const stop = startSuccessRefresh(
      () => {
        calls += 1;
      },
      SUCCESS_REFRESH_MS,
      () => {
        stalled += 1;
      },
    );
    // 59 beats in the first 295 seconds…
    vi.advanceTimersByTime(SUCCESS_REFRESH_MS * 59);
    expect(calls).toBe(59);
    expect(stalled).toBe(0);
    // …the 60th tick is the stall point, not a refresh…
    vi.advanceTimersByTime(SUCCESS_REFRESH_MS);
    expect(calls).toBe(59);
    expect(stalled).toBe(1);
    // …and nothing more ever fires.
    vi.advanceTimersByTime(SUCCESS_REFRESH_MS * 12);
    expect(calls).toBe(59);
    expect(stalled).toBe(1);
    stop();
  });

  it("a short custom stall point stops the beat there, and stopping early still ends it", () => {
    let calls = 0;
    let stalled = 0;
    const stop = startSuccessRefresh(
      () => {
        calls += 1;
      },
      1000,
      () => {
        stalled += 1;
      },
      3000,
    );
    vi.advanceTimersByTime(2000);
    expect(calls).toBe(2);
    expect(stalled).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(calls).toBe(2);
    expect(stalled).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(calls).toBe(2);
    expect(stalled).toBe(1);
    stop();
  });

  it("without a stall callback the beat still stops at the stall point", () => {
    let calls = 0;
    const stop = startSuccessRefresh(
      () => {
        calls += 1;
      },
      1000,
      undefined,
      2000,
    );
    vi.advanceTimersByTime(1000);
    expect(calls).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(calls).toBe(1);
    vi.advanceTimersByTime(10000);
    expect(calls).toBe(1);
    stop();
  });
});
