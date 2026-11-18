// A small in-process rate limiter (entry-point build,
// 18 Nov 2026) — the suggestions endpoint's guard.
//
// The suggestions endpoint is a named exception to the
// per-submit robot check (D72 item 4): it serves local,
// open data only, and in exchange it is rate-limited per
// caller. The limiter is a sliding window in process
// memory — deliberately nothing more: the deployment is
// one small server, the data behind the limit is the open
// postcode list, and a limiter that needs a database round
// trip would eat the endpoint's 100ms budget. A restart
// resets the windows; that is acceptable for a guard whose
// job is to stop a script draining keystrokes, not to be a
// billing control.

const windows = new Map<string, number[]>();

export function rateLimitOk(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((at) => now - at < windowMs);
  if (hits.length >= limit) {
    windows.set(key, hits);
    return false;
  }
  hits.push(now);
  windows.set(key, hits);
  return true;
}

// Test hook: forget every window.
export function resetRateLimits(): void {
  windows.clear();
}
