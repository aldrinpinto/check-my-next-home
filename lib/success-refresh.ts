// The preparing page's quiet pulse (BUG-216, 24 Nov
// 2026): while the worker is still composing the
// report, the success page re-reads its server state on
// a short beat until the claim stands fulfilled and the
// full surface renders.
//
// The beat is a SOFT refresh, never a document reload.
// The page used to reload itself outright
// (window.location.reload() every 5s), which destroyed
// the whole client tree on every tick — the "Check
// another home" box lost its typed text and its open
// suggestion panel, so suggestions appeared, then
// vanished, then appeared again on the next keystroke,
// for as long as the report was preparing. A soft
// refresh re-fetches the route's server components and
// re-renders them in place while every client
// component — the box, its typed value, its open panel
// — keeps its state exactly. Once the claim stands
// fulfilled the server answers the ready view, the
// refresher unmounts, and the beat stops by itself.
//
// Framework-free, like the suggest coordinator
// (lib/suggest-client.ts): the beat's shape — repeat
// on the interval, stop on dispose — is unit-testable
// in the node harness (tests/success-refresh.test.ts),
// and the component (components/SuccessRefresher.tsx)
// only wires the App Router's refresh into it.
//
// BUG-332 + BUG-345 (25 Nov 2026): the beat is capped
// and the wait is honest. While the report is being
// made the page says so plainly with a wait estimate
// (BUG-345's progress line, below) — never a staged
// step or a percentage, which the page is not making
// (BUG-260's honesty rule). And the beat does not run
// forever: after SUCCESS_STALL_AFTER_MS of preparing
// it stops polling and the page says the wait is longer
// than usual and the report will arrive by email
// (BUG-332's stalled line). There is no re-send button
// on the stalled line — there is no delivery to re-send
// until the worker delivers, so the email is the road,
// not a control that cannot work yet. The stalled claim
// itself is logged for the owner by the component's
// beacon (see components/SuccessRefresher.tsx).

export const SUCCESS_REFRESH_MS = 5000;

// BUG-332: five minutes of "preparing" is the stated
// wait — in normal running the worker fulfils within a
// minute or two, so a buyer past this point is on a
// stalled worker and polling on helps nobody.
export const SUCCESS_STALL_AFTER_MS = 5 * 60 * 1000;

// BUG-345: the normal-case progress line — the wait
// estimate, in plain words. No step, no percentage, no
// staged progress: the page knows only that the report
// is still being made.
export const SUCCESS_PROGRESS_LINE =
  "Your report is still being made — usually ready in about a minute.";

// BUG-332: the stalled line — the wait is longer than
// usual, polling has stopped, and the email is the
// road: the report arrives there as soon as it is
// ready.
export const SUCCESS_STALLED_LINE =
  "This is taking longer than usual — we'll email your report as soon as it's ready.";

export function startSuccessRefresh(
  refresh: () => void,
  delayMs: number = SUCCESS_REFRESH_MS,
  // BUG-332: called exactly once when the beat reaches
  // the stall point, after the interval is cleared —
  // the component shows the stalled line there. Absent,
  // the beat still stops at the stall point; only the
  // call is skipped.
  onStalled?: () => void,
  stallAfterMs: number = SUCCESS_STALL_AFTER_MS,
): () => void {
  let elapsedMs = 0;
  let stalled = false;
  const timer = setInterval(() => {
    elapsedMs += delayMs;
    if (!stalled && elapsedMs >= stallAfterMs) {
      stalled = true;
      clearInterval(timer);
      onStalled?.();
      return;
    }
    refresh();
  }, delayMs);
  return () => clearInterval(timer);
}
