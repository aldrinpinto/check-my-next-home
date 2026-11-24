import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PostcodeBox from "../components/PostcodeBox";
import { POSTCODE_BOX_SEARCHING_LINE, POSTCODE_BOX_SUGGESTIONS_FAILED_LINE } from "../lib/home";
import {
  createSuggestCoordinator,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_RETRY_MS,
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

  it("the current fetch's failure retries once, then settles as a failure — HTTP and network alike", async () => {
    // BUG-203 (24 Nov 2026): a failed fetch used to
    // settle the failure at once — and the box closed
    // on it, the panel's vanish. Now the failure waits
    // for one retry: the flight signal holds while the
    // retry is out, and only a retry that also fails
    // settles the failure.
    const http = createHarness();
    http.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    http.calls[0].rejectHttp();
    await vi.advanceTimersByTimeAsync(0);
    // No failure yet — and the flight signal has not
    // dropped: "Searching…" stays up while the retry
    // is out.
    expect(http.failures()).toBe(0);
    expect(http.flight).toEqual([true]);
    await vi.advanceTimersByTimeAsync(SUGGEST_RETRY_MS);
    expect(http.calls).toHaveLength(2);
    expect(http.calls[1].url).toBe("/api/suggest?q=CM3");
    http.calls[1].rejectHttp();
    await vi.advanceTimersByTimeAsync(0);
    expect(http.failures()).toBe(1);
    expect(http.flight).toEqual([true, false]);

    const network = createHarness();
    network.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    network.calls[0].rejectNetwork(new Error("offline"));
    await vi.advanceTimersByTimeAsync(0);
    expect(network.failures()).toBe(0);
    await vi.advanceTimersByTimeAsync(SUGGEST_RETRY_MS);
    expect(network.calls).toHaveLength(2);
    network.calls[1].rejectNetwork(new Error("offline"));
    await vi.advanceTimersByTimeAsync(0);
    expect(network.failures()).toBe(1);
    expect(network.responses).toHaveLength(0);
  });

  it("a retry that succeeds repaints — the failure never settles", async () => {
    const h = createHarness();
    h.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.calls[0].rejectHttp();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.failures()).toBe(0);
    await vi.advanceTimersByTimeAsync(SUGGEST_RETRY_MS);
    expect(h.calls).toHaveLength(2);
    h.calls[1].resolve(PAYLOAD);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.responses).toEqual([PAYLOAD]);
    expect(h.failures()).toBe(0);
    expect(h.flight).toEqual([true, false]);
  });

  it("one retry per value — a persistently failing query settles, it does not retry forever", async () => {
    const h = createHarness();
    h.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.calls[0].rejectHttp();
    await vi.advanceTimersByTimeAsync(SUGGEST_RETRY_MS);
    expect(h.calls).toHaveLength(2);
    h.calls[1].rejectHttp();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.failures()).toBe(1);
    // Even a long wait issues no third fetch for this
    // value: the failure has settled.
    await vi.advanceTimersByTimeAsync(SUGGEST_RETRY_MS * 10);
    expect(h.calls).toHaveLength(2);
    expect(h.failures()).toBe(1);
  });

  it("a keystroke while a retry waits cancels the retry — the new value's fetch covers it", async () => {
    const h = createHarness();
    h.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.calls[0].rejectHttp();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toHaveLength(1);
    h.coordinator.type("CM32");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    // The second call is the new value's fetch, not a
    // retry of the old one — and the old retry never
    // fires, however long the wait.
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].url).toBe("/api/suggest?q=CM32");
    await vi.advanceTimersByTimeAsync(SUGGEST_RETRY_MS * 4);
    expect(h.calls).toHaveLength(2);
    h.calls[1].resolve(PAYLOAD);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.responses).toEqual([PAYLOAD]);
    expect(h.failures()).toBe(0);
  });

  it("a superseded fetch's failure is dropped like its success would be — no retry for it", async () => {
    const h = createHarness();
    h.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.coordinator.type("CM32");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.calls[0].rejectNetwork(new Error("aborted"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.failures()).toBe(0);
    // No retry is issued for the superseded failure:
    // the current value's own fetch is its cover.
    await vi.advanceTimersByTimeAsync(SUGGEST_RETRY_MS * 2);
    expect(h.calls).toHaveLength(2);
    h.calls[1].resolve(PAYLOAD);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.responses).toEqual([PAYLOAD]);
  });

  it("dispose while a retry waits silences the retry", async () => {
    const h = createHarness();
    h.coordinator.type("CM3");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    h.calls[0].rejectHttp();
    await vi.advanceTimersByTimeAsync(0);
    h.coordinator.dispose();
    await vi.advanceTimersByTimeAsync(SUGGEST_RETRY_MS * 4);
    expect(h.calls).toHaveLength(1);
    expect(h.failures()).toBe(0);
    expect(h.flight).toEqual([true]);
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

describe("the settled-failure line's place in the box (BUG-203)", () => {
  it("is a live state only — the box's static render never carries it", () => {
    // The failure line renders only once a fetch has
    // failed after the coordinator's retry; a
    // server-rendered (or not-yet-typed) box shows no
    // panel at all — the failure is never a vanish,
    // and never a line the box carries before typing.
    const html = renderToStaticMarkup(createElement(PostcodeBox));
    expect(html).not.toContain(POSTCODE_BOX_SUGGESTIONS_FAILED_LINE);
    expect(html).not.toContain("suggest__failed");
  });

  it("is the one plain line the panel holds on a settled failure", () => {
    expect(POSTCODE_BOX_SUGGESTIONS_FAILED_LINE).toBe(
      "Suggestions didn't load — try again in a moment, or use the button to search anyway.",
    );
  });
});
