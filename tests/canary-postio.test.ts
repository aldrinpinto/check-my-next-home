import { afterEach, describe, expect, it } from "vitest";

import { fetchPostioAccount, postioVerdict, probePostio } from "../loaders/canary-postio.mjs";

// The Postio canary probe (entry-point build, 18 Nov
// 2026): it watches the address backstop's key and, behind
// its seam, its balance. The discipline is the canary house
// rule: not configured is a skip in its own words (the
// backstop is founder-wired), an unreachable source is a
// skip (never read as a dead key or an empty balance), a
// rejected key is a warning, and a balance under the
// threshold is the low-balance warning that rides the run's
// Resend alert. Postio publishes no balance endpoint, so
// the live account read reports lookupsRemaining: null and
// the low-balance branch is proven here against the seam.

const HEALTHY = { configured: true, reachable: true, keyActive: true, lookupsRemaining: null };

describe("postioVerdict — the watches", () => {
  it("not configured: a skip naming the missing key, never a failure", () => {
    const verdict = postioVerdict({ configured: false });
    expect(verdict.skipped).toContain("POSTIO_API_KEY is not set");
    expect(verdict.warning).toBeUndefined();
  });

  it("unreachable: a skip — the health is unknown, not failed", () => {
    const verdict = postioVerdict({ ...HEALTHY, reachable: false, keyActive: false });
    expect(verdict.skipped).toContain("did not answer");
    expect(verdict.warning).toBeUndefined();
  });

  it("a rejected key is the backstop-down warning", () => {
    const verdict = postioVerdict({ ...HEALTHY, keyActive: false });
    expect(verdict.warning).toBe(true);
    expect(verdict.logLine).toContain("key was rejected");
    expect(verdict.logLine).toContain("falling back");
  });

  it("a balance under the threshold is the low-balance warning", () => {
    const verdict = postioVerdict({ ...HEALTHY, lookupsRemaining: 42 });
    expect(verdict.warning).toBe(true);
    expect(verdict.logLine).toContain("42 lookups left");
    expect(verdict.logLine).toContain("top up");
  });

  it("a healthy balance reads plainly", () => {
    const verdict = postioVerdict({ ...HEALTHY, lookupsRemaining: 384 });
    expect(verdict.warning).toBeUndefined();
    expect(verdict.logLine).toContain("384 lookups remaining");
  });

  it("no published balance: healthy, and the line says the number cannot be read", () => {
    const verdict = postioVerdict(HEALTHY);
    expect(verdict.warning).toBeUndefined();
    expect(verdict.logLine).toContain("balance not published by Postio");
  });
});

describe("fetchPostioAccount — the live read, network stubbed", () => {
  it("a 200 from /connect is an active key with an unpublished balance", async () => {
    const account = await fetchPostioAccount(
      async () => new Response("{}", { status: 200 }),
      "pk_test",
    );
    expect(account).toEqual({ reachable: true, keyActive: true, lookupsRemaining: null });
  });

  it("a 401 is a rejected key; a network failure is unreachable", async () => {
    expect(
      await fetchPostioAccount(async () => new Response("", { status: 401 }), "pk_test"),
    ).toEqual({ reachable: true, keyActive: false, lookupsRemaining: null });
    expect(
      await fetchPostioAccount(async () => {
        throw new Error("down");
      }, "pk_test"),
    ).toEqual({ reachable: false, keyActive: false, lookupsRemaining: null });
  });
});

describe("probePostio — env-driven", () => {
  afterEach(() => {
    delete process.env.POSTIO_API_KEY;
  });

  it("skips while POSTIO_API_KEY is unset", async () => {
    delete process.env.POSTIO_API_KEY;
    const outcome = await probePostio(async () => new Response("{}", { status: 200 }));
    expect(outcome.skipped).toContain("POSTIO_API_KEY is not set");
  });

  it("reports healthy once the key is placed", async () => {
    process.env.POSTIO_API_KEY = "pk_test";
    const outcome = await probePostio(async () => new Response("{}", { status: 200 }));
    expect(outcome.warning).toBeUndefined();
    expect(outcome.logLine).toContain("key active");
  });
});
