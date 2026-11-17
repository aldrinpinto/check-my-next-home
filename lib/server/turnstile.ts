// Turnstile verification (plan step M7.3, ruling 5; Key K5).
//
// The secret key is server-only (TURNSTILE_SECRET_KEY, from
// the server's secret file / .env.local — never the repo,
// never a log). Local and CI environments use Cloudflare's
// published test keys, whose tokens always verify; the real
// K5 keys are used only in the play and production
// environments (fold-in 8).
//
// The failure direction is closed: a missing secret, a
// missing token, a rejected token, or the verify call
// itself failing all refuse the search. There is no path
// where an unverified search proceeds — never a silent pass.

export type TurnstileVerdict = { ok: true } | { ok: false; reason: "rejected" | "unavailable" };

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(
  token: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileVerdict> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return { ok: false, reason: "unavailable" };
  // The verify endpoint is server configuration, never
  // user input: TURNSTILE_SITEVERIFY_URL exists so test
  // environments whose egress cannot reach Cloudflare can
  // point verification at a local stand-in (the local gate
  // does; CI and production use the real endpoint, where
  // the published test keys verify for real).
  const verifyUrl = process.env.TURNSTILE_SITEVERIFY_URL ?? SITEVERIFY_URL;
  try {
    const body = new URLSearchParams({ secret, response: token });
    const response = await fetchImpl(verifyUrl, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const data = (await response.json()) as { success?: unknown };
    return data.success === true ? { ok: true } : { ok: false, reason: "rejected" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
