// The search box's live-suggest coordinator (BUG-196,
// 23 Nov 2026). The fetch logic that used to live
// inline in components/PostcodeBox.tsx's effect —
// debounce, sequence guard, state settles — moved
// here, framework-free, so the per-keystroke
// behaviour is unit-testable in the node harness
// (tests/suggest-client.test.ts) and the component
// only renders what the coordinator settles.
//
// The behaviour it coordinates (entry-point build,
// 18 Nov 2026; D71 + D72): as the visitor types, the
// box asks /api/suggest — LOCAL FILED DATA ONLY,
// never Postio — after a ~140ms pause, and a response
// a newer keystroke has superseded is dropped, never
// repainted (the sequence guard). Two BUG-033 rules
// stand exactly as they were: the component clears
// the served list the moment the text changes, so no
// stale list ever sits clickable under new text; and
// the no-suggestions line belongs to a settled empty
// answer only, never a mid-flight one.
//
// What BUG-196 adds (founder-found live, 23 Nov
// 2026: at slow server speeds the panel blinked in
// and out on alternate keystrokes — each keystroke
// cleared it, and a superseded response was discarded
// with nothing repainting until a later keystroke's
// own response happened to land while still current):
//
//   * Cancel-and-replace (fix 3): every keystroke
//     aborts the superseded fetch through an
//     AbortController — never skip-while-in-flight,
//     and the abort is what lets the server cancel
//     the superseded query's database work (the
//     bounded suggest source, lib/server/
//     suggestions.ts) instead of leaving it running
//     against the shared pool.
//   * A flight signal (fix 4): the coordinator
//     reports whether the current query is in flight
//     from the keystroke until its response settles,
//     so the component can hold its plain "Searching…"
//     line in the panel's place — a state, never a
//     result: it carries no items and nothing
//     clickable, so BUG-033 is preserved exactly.
//   * The current value always has a live fetch
//     (fix 5): when a superseded response is
//     discarded, the coordinator checks the current
//     value is still covered — a fetch outstanding
//     for it, one scheduled, or an answer already
//     settled for it — and issues one on the spot if
//     it is somehow bare. In this design the
//     keystroke's own scheduled fetch is that cover
//     in every ordinary ordering; the check is the
//     cheap insurance the audit asked for against
//     edge orderings in the sequence guard, and the
//     tests pin the no-double-fetch orderings around
//     it.
//
// What BUG-203 adds (founder-found live, 24 Nov
// 2026: the panel sometimes showed "Searching…"
// then vanished with no dropdown — a failed fetch
// settled as a failure, and the box closed on it):
//
//   * One retry for the current query's failure:
//     a failed fetch — a statement timeout under
//     load, a transient drop — is retried once,
//     after SUGGEST_RETRY_MS, with the flight
//     signal held so "Searching…" stays up while
//     the retry is out. A retry that also fails
//     settles the honest failure, and the box opens
//     on its failure line instead of closing.
//     One retry per value, ever: a persistently
//     failing query settles, it does not retry
//     forever. A keystroke or an unmount cancels a
//     waiting retry, and the fix-5 cover counts a
//     waiting retry as cover for its value.

// The pause between the last keystroke and the fetch
// (the entry-point build's ~140ms, unchanged).
export const SUGGEST_DEBOUNCE_MS = 140;

// The pause before a failed fetch's one retry (BUG-203,
// 24 Nov 2026): a suggest request that fails — a
// statement timeout under load, a transient network
// drop — is usually clear on the next call, as the
// deploy's own first-two-calls-500-then-five-200s
// proved. The retry waits long enough for the
// transient to pass and short enough that the panel
// never sits on "Searching…" for it.
export const SUGGEST_RETRY_MS = 300;

// Suggestions start at 3 typed characters (D71) —
// the read model's own floor (SUGGEST_MIN_CHARS in
// lib/server/suggestions.ts), restated at this edge:
// below it the coordinator issues nothing.
export const SUGGEST_CLIENT_MIN_CHARS = 3;

// The /api/suggest payload, as the route serves it
// (the contract pinned by tests/entry-point.test.ts).
// The coordinator itself reads only the groups; the
// BUG-185 fields ride the same payload through to
// the component, which owns the wider-list row: the
// settled postcode the panel lists, when the answer
// is one postcode's own list, and whether the kill
// switch lets the row be offered.
export interface SuggestPayload {
  groups?: {
    label: string;
    items: { label: string; href: string | null; place?: string }[];
  }[];
  postcodeList?: { postcode: string };
  supplementEnabled?: boolean;
}

// The fetch the coordinator drives: the component
// hands it the browser's fetch with the abort signal
// attached; the tests hand it a fake.
export type SuggestFetchImpl = (
  url: string,
  signal: AbortSignal,
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export interface SuggestCoordinatorHandlers {
  // The current query's response settled with a
  // payload: repaint with it.
  onResponse: (data: SuggestPayload) => void;
  // The current query's fetch failed — after the
  // coordinator's one retry (BUG-203): the box's
  // settled-failure state (the panel opens on its
  // honest line, never closes silently).
  onFailure: () => void;
  // The current query is in flight (true from its
  // keystroke until its response settles): the box
  // holds its mid-flight line meanwhile.
  onFlightChange: (inFlight: boolean) => void;
}

export interface SuggestCoordinator {
  // One call per keystroke, with the field's trimmed
  // value.
  type: (typed: string) => void;
  // The box unmounted: cancel everything, settle
  // nothing further.
  dispose: () => void;
}

export function createSuggestCoordinator(
  fetchImpl: SuggestFetchImpl,
  handlers: SuggestCoordinatorHandlers,
  debounceMs: number = SUGGEST_DEBOUNCE_MS,
): SuggestCoordinator {
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  // The outstanding fetch, if any: the value it was
  // issued for and its controller, so its settle can
  // tell whether it is still the recorded one.
  let inFlight: { value: string; controller: AbortController } | null = null;
  // The value a debounce timer is currently scheduled
  // to fetch, if any.
  let pendingFor: string | null = null;
  // The value the field currently holds, and the
  // value whose answer has settled (a response or a
  // failure), if any.
  let current = "";
  let answeredFor: string | null = null;
  let disposed = false;
  // The one retry (BUG-203): the value a retry is
  // scheduled for, its timer, and the value that has
  // already had its retry — one retry per value, so a
  // persistently failing query settles honestly
  // instead of retrying forever.
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryFor: string | null = null;
  let retriedFor: string | null = null;

  function issue(typed: string) {
    const mySeq = (seq += 1);
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    const record = { value: typed, controller: ctrl };
    inFlight = record;
    void (async () => {
      let data: SuggestPayload | null = null;
      let failed = false;
      try {
        const response = await fetchImpl(
          `/api/suggest?q=${encodeURIComponent(typed)}`,
          ctrl.signal,
        );
        if (!response.ok) throw new Error("suggest-failed");
        data = (await response.json()) as SuggestPayload;
      } catch {
        failed = true;
      }
      if (inFlight === record) inFlight = null;
      if (disposed) return;
      if (mySeq !== seq) {
        // A newer keystroke superseded this response —
        // drop it, never repaint with stale suggestions;
        // then the fix-5 check: the current value must
        // still be covered.
        ensureCurrent();
        return;
      }
      if (failed && retriedFor !== typed) {
        // BUG-203 (24 Nov 2026): the current query's
        // fetch failed — a timeout under load, a
        // transient drop — and the failure is the
        // panel's vanish: the box closed on it with
        // nothing to show. One retry, once, for this
        // value: the flight signal HOLDS while it is
        // out, so "Searching…" stays up and the panel
        // never blinks away; a retry that also fails
        // settles the honest failure below.
        retriedFor = typed;
        retryFor = typed;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          retryFor = null;
          if (disposed) return;
          // A keystroke landed while the retry waited —
          // its own fetch covers the current value.
          if (current !== typed) return;
          issue(typed);
        }, SUGGEST_RETRY_MS);
        return;
      }
      answeredFor = typed;
      handlers.onFlightChange(false);
      if (failed) handlers.onFailure();
      else handlers.onResponse(data ?? {});
    })();
  }

  // Fix 5: after a superseded response is discarded,
  // the current value keeps a live fetch — issue one
  // on the spot if it is somehow neither outstanding,
  // scheduled, nor already answered. A retry waiting
  // for the current value (BUG-203) is cover too: the
  // value is neither bare nor in need of a second
  // fetch while its retry is still to run.
  function ensureCurrent() {
    if (disposed) return;
    if (current.length < SUGGEST_CLIENT_MIN_CHARS) return;
    if (answeredFor === current) return;
    if (inFlight !== null && inFlight.value === current) return;
    if (pendingFor === current) return;
    if (retryFor === current) return;
    issue(current);
  }

  return {
    type(typed: string) {
      if (disposed) return;
      if (typed !== current) {
        answeredFor = null;
        // A new value gets its own retry (BUG-203):
        // the old value's retry, if one was waiting,
        // belongs to text the visitor has already left.
        retriedFor = null;
      }
      current = typed;
      // The keystroke supersedes everything before
      // it: any in-flight response now belongs to the
      // old text (the sequence guard will drop it),
      // and its fetch is aborted — cancel-and-replace.
      // A retry waiting for the old value dies with
      // it: the keystroke's own fetch covers the new
      // one.
      seq += 1;
      controller?.abort();
      controller = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pendingFor = null;
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
      retryFor = null;
      if (typed.length < SUGGEST_CLIENT_MIN_CHARS) {
        handlers.onFlightChange(false);
        return;
      }
      handlers.onFlightChange(true);
      pendingFor = typed;
      timer = setTimeout(() => {
        timer = null;
        pendingFor = null;
        issue(typed);
      }, debounceMs);
    },
    dispose() {
      disposed = true;
      seq += 1;
      controller?.abort();
      controller = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pendingFor = null;
      // A waiting retry dies with the box (BUG-203):
      // it must not fetch — or settle — after unmount.
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
      retryFor = null;
    },
  };
}
