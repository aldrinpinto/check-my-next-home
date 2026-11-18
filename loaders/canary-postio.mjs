// Postio canary probe (entry-point build, 18 Nov 2026).
//
// Postio is the entry point's paid backstop (decision
// D72): when the local filed list at a postcode is short,
// the picker supplements it from Postio, and a pick of a
// Postio-only home resolves through it. Two things can
// silently break that promise, and this probe watches both:
//
//   (a) THE KEY — absent (not wired on this server yet),
//       rejected (401/403: rotated, suspended or locked to
//       other origins), or the service unreachable. An
//       absent key is a SKIP in its own words, never a
//       failure: the backstop is founder-wired, and until
//       POSTIO_API_KEY lands in the server env the hybrid
//       is local-only BY DECISION, not by accident.
//   (b) THE BALANCE — Postio is prepaid; at zero the
//       billable calls are refused (HTTP 402) and every
//       pick falls back. Postio publishes NO balance
//       endpoint (checked against its OpenAPI spec,
//       18 Nov 2026), so the probe cannot read a number:
//       the account read goes through the seam below, whose
//       live implementation reports health from the free
//       GET /connect and a balance of null ("not published").
//       The low-balance verdict is real and tested against
//       the seam with fakes — the day Postio publishes a
//       balance read (or the founder wires one), the seam
//       returns it and this probe starts warning at the
//       threshold without further change. A warning here
//       rides the canary run's report and its Resend alert
//       email, like every canary warning.
//
// Deliberately standalone, like canary-council-tax.mjs:
// wired into canary.mjs's runCanaryProbes by one import
// and one run line. The probe spends nothing: /connect is
// free, and no billable call is ever made by a probe.

export const POSTIO_API_BASE_URL = "https://api.postio.co.uk/v1";
// The low-balance threshold, in lookups: at 2.6p a lookup,
// 100 lookups ≈ £2.60 — roughly a busy day's picks. Below
// it, top up (£10 ≈ 384 lookups, and top-ups never expire).
export const POSTIO_LOW_BALANCE_LOOKUPS = 100;

// The account read, behind the seam: given a fetch and a
// key, what can be known? lookupsRemaining is null when
// the provider publishes no balance read (today's truth).
export async function fetchPostioAccount(fetchImpl, apiKey, baseUrl = POSTIO_API_BASE_URL) {
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/connect`, {
      method: "GET",
      headers: { "x-api-key": apiKey, accept: "application/json" },
    });
  } catch {
    return { reachable: false, keyActive: false, lookupsRemaining: null };
  }
  if (response.status === 401 || response.status === 403) {
    return { reachable: true, keyActive: false, lookupsRemaining: null };
  }
  if (!response.ok) return { reachable: false, keyActive: false, lookupsRemaining: null };
  return { reachable: true, keyActive: true, lookupsRemaining: null };
}

// The decision, pure: account = { configured, reachable,
// keyActive, lookupsRemaining } → the probe's outcome in
// the canary family's shapes ({skipped} | {warning,
// logLine} | {logLine}).
export function postioVerdict(account) {
  if (!account.configured) {
    return {
      skipped:
        "POSTIO_API_KEY is not set — the address backstop is not wired on this server yet (the hybrid runs local-only, by decision)",
    };
  }
  if (!account.reachable) {
    // The canary house rule: an unreachable source is a
    // skip in its own words, NEVER read as a dead key or
    // an empty balance.
    return { skipped: "Postio did not answer — the backstop's health is unknown, not failed" };
  }
  if (!account.keyActive) {
    return {
      warning: true,
      logLine:
        "canary postio · WARNING — the Postio key was rejected (rotated, suspended, or locked to other origins): the address backstop is DOWN and picks are falling back to postcode-level checks until the key is fixed",
    };
  }
  if (
    account.lookupsRemaining !== null &&
    account.lookupsRemaining !== undefined &&
    account.lookupsRemaining < POSTIO_LOW_BALANCE_LOOKUPS
  ) {
    return {
      warning: true,
      logLine: `canary postio · WARNING — the Postio balance is low (${account.lookupsRemaining} lookups left, under the ${POSTIO_LOW_BALANCE_LOOKUPS}-lookup threshold): top up before it reaches zero and picks start falling back (£10 ≈ 384 lookups, top-ups never expire)`,
    };
  }
  return {
    logLine:
      account.lookupsRemaining === null || account.lookupsRemaining === undefined
        ? "canary postio · key active and the service reachable — balance not published by Postio (no balance endpoint), so a low balance cannot be read here; a zero balance still surfaces live as refused picks in the entry log"
        : `canary postio · key active, ${account.lookupsRemaining} lookups remaining`,
  };
}

export async function probePostio(fetchImpl = fetch) {
  const apiKey = process.env.POSTIO_API_KEY ?? null;
  if (!apiKey) return postioVerdict({ configured: false });
  const account = await fetchPostioAccount(
    fetchImpl,
    apiKey,
    process.env.POSTIO_API_BASE_URL ?? undefined,
  );
  return postioVerdict({ configured: true, ...account });
}
