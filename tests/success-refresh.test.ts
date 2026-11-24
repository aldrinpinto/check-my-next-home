import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startSuccessRefresh, SUCCESS_REFRESH_MS } from "../lib/success-refresh";

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
