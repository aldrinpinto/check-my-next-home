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

export const SUCCESS_REFRESH_MS = 5000;

export function startSuccessRefresh(
  refresh: () => void,
  delayMs: number = SUCCESS_REFRESH_MS,
): () => void {
  const timer = setInterval(refresh, delayMs);
  return () => clearInterval(timer);
}
