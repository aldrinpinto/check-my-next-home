import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PostcodeBox from "../components/PostcodeBox";
import { POSTCODE_BOX_SEARCHING_LINE } from "../lib/home";
import {
  createSuggestCoordinator,
  SUGGEST_DEBOUNCE_MS,
  type SuggestCoordinator,
  type SuggestFetchImpl,
  type SuggestPayload,
} from "../lib/suggest-client";

// The suggest coordinator (BUG-196, 23 Nov 2026): the
// search box's per-keystroke fetch logic, tested at
// the framework-free seam (lib/suggest-client.ts) —
// the node harness has no DOM, so the component's own
// rendering of the coordinator's settles is pinned
// where it can be (the static-render test at the
// foot) and the panel's behaviour end-to-end by
// e2e/suggest.e2e.ts's BUG-008 / BUG-033 specs in CI.
//
// The fake fetch never rejects on abort by itself: a
// response already on the wire when the keystroke
// lands is exactly the ordering the sequence guard
// exists for, so the tests settle aborted fetches by
// hand and watch them being dropped. The abort itself
// is asserted on the signal each fetch was handed.

interface PendingCall {
  url: string;
  signal: AbortSignal;
  resolve: (payload: SuggestPayload) => void;
  rejectHttp: () => void;
  rejectNetwork: (error: Error) => void;
}

function createFakeFetch() {
  const calls: PendingCall[] = [];
  const fetchImpl: SuggestFetchImpl = (url, signal) =>
    new Promise((resolvePromise, rejectPromise) => {
      calls.push({
        url,
        signal,
        resolve: (payload) => resolvePromise({ ok: true, json: () => Promise.resolve(payload) }),
        rejectHttp: () => resolvePromise({ ok: false, json: () => Promise.resolve({}) }),
        rejectNetwork: (error) => rejectPromise(error),
      });
    });
  return { calls, fetchImpl };
}

function createHarness(debounceMs: number = SUGGEST_DEBOUNCE_MS) {
  const { calls, fetchImpl } = createFakeFetch();
  const responses: SuggestPayload[] = [];
  const flight: boolean[] = [];
  let failures = 0;
  const coordinator: SuggestCoordinator = createSuggestCoordinator(
    fetchImpl,
    {
      onResponse: (data) => responses.push(data),
      onFailure: () => {
        failures += 1;
      },
      onFlightChange: (inFlight) => flight.push(inFlight),
    },
    debounceMs,
  );
  return { calls, coordinator, responses, flight, failures: () => failures };
}

const PAYLOAD: SuggestPayload = {
  groups: [
    { label: "Postcodes", items: [{ label: "CM3 2JT", href: "/search/home?postcode=CM3+2JT" }] },
  ],
};

describe("the suggest coordinator (BUG-196)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches after the debounce and settles the current response", async () => {
    const h = createHarness();
    h.coordinator.type("CM3");
    expect(h.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toBe("/api/suggest?q=CM3");
    expect(h.flight).toEqual([true]);
    h.calls[0].resolve(PAYLOAD);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.responses).toEqual([PAYLOAD]);
    expect(h.flight).toEqual([true, false]);
    expect(h.failures()).toBe(0);
  });

  it("coalesces a burst of keystrokes into the last value's fetch", async () => {
    const h = createHarness();
    h.coordinator.type("C");
    h.coordinator.type("CM");
    h.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toBe("/api/suggest?q=CM3");
  });

  it("below the 3-character floor it issues nothing and reports no flight", async () => {
    const h = createHarness();
    h.coordinator.type("CM");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS * 4);
    expect(h.calls).toHaveLength(0);
    expect(h.flight).toEqual([false]);
  });

  it("a new keystroke aborts the superseded fetch — cancel-and-replace, never skip", async () => {
    const h = createHarness();
    h.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    expect(h.calls).toHaveLength(1);
    h.coordinator.type("CM32");
    // The superseded fetch is cancelled the moment the
    // keystroke lands — its database work dies with it
    // (the bounded suggest source) — and the new
    // value's fetch is still issued on its own beat,
    // not skipped for one being in flight.
    expect(h.calls[0].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].url).toBe("/api/suggest?q=CM32");
    h.calls[1].resolve(PAYLOAD);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.responses).toEqual([PAYLOAD]);
  });

  it("a superseded response is dropped, and the flight signal holds until the current one settles", async () => {
    const h = createHarness();
    h.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.coordinator.type("CM32");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    expect(h.calls).toHaveLength(2);
    // The stale response lands first (it was already
    // on the wire): dropped — no repaint, no failure,
    // and the panel's flight state does not flicker
    // off while the current query is still out.
    h.calls[0].resolve({ groups: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.responses).toHaveLength(0);
    expect(h.failures()).toBe(0);
    expect(h.flight).not.toContain(false);
    h.calls[1].resolve(PAYLOAD);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.responses).toEqual([PAYLOAD]);
    expect(h.flight).toEqual([true, true, false]);
  });

  it("no second fetch when a stale response lands after the current answer settled (fix 5's cover)", async () => {
    const h = createHarness();
    h.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.coordinator.type("CM32");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.calls[1].resolve(PAYLOAD);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.responses).toEqual([PAYLOAD]);
    // The superseded fetch settles late: dropped, and
    // the discard check finds the current value
    // already answered — it must not fetch again.
    h.calls[0].resolve({ groups: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toHaveLength(2);
    expect(h.responses).toEqual([PAYLOAD]);
  });

  it("the current fetch's failure settles as a failure — HTTP and network alike", async () => {
    const http = createHarness();
    http.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    http.calls[0].rejectHttp();
    await vi.advanceTimersByTimeAsync(0);
    expect(http.failures()).toBe(1);
    expect(http.flight).toEqual([true, false]);

    const network = createHarness();
    network.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    network.calls[0].rejectNetwork(new Error("offline"));
    await vi.advanceTimersByTimeAsync(0);
    expect(network.failures()).toBe(1);
    expect(network.responses).toHaveLength(0);
  });

  it("a superseded fetch's failure is dropped like its success would be", async () => {
    const h = createHarness();
    h.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.coordinator.type("CM32");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.calls[0].rejectNetwork(new Error("aborted"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.failures()).toBe(0);
    h.calls[1].resolve(PAYLOAD);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.responses).toEqual([PAYLOAD]);
  });

  it("dropping below the floor aborts the in-flight fetch and settles nothing", async () => {
    const h = createHarness();
    h.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.coordinator.type("CM");
    expect(h.calls[0].signal.aborted).toBe(true);
    expect(h.flight).toEqual([true, false]);
    h.calls[0].resolve(PAYLOAD);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.responses).toHaveLength(0);
    expect(h.failures()).toBe(0);
  });

  it("dispose aborts the in-flight fetch and silences its settle", async () => {
    const h = createHarness();
    h.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.coordinator.dispose();
    expect(h.calls[0].signal.aborted).toBe(true);
    h.calls[0].resolve(PAYLOAD);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.responses).toHaveLength(0);
    expect(h.flight).toEqual([true]);
  });
});

describe("the searching line's place in the box", () => {
  it("is a live state only — the box's static render never carries it", () => {
    // The mid-flight line renders only while the
    // coordinator reports a flight; a server-rendered
    // (or not-yet-typed) box shows no panel at all.
    const html = renderToStaticMarkup(createElement(PostcodeBox));
    expect(html).not.toContain(POSTCODE_BOX_SEARCHING_LINE);
    expect(html).not.toContain("suggest__searching");
  });

  it("is the one plain line the panel holds mid-flight", () => {
    expect(POSTCODE_BOX_SEARCHING_LINE).toBe("Searching…");
  });
});
