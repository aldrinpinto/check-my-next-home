import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decideExitCode, dueDecision, summariseRun } from "../loaders/run-loaders.mjs";

// The runner's pure core (plan step M4.8): due-ness, the one-email
// summary, and the exit-code rule — any failure anywhere,
// including the email itself failing, means a non-zero exit.

describe("due-ness", () => {
  const now = new Date("2026-11-12T00:00:00Z");
  it("never loaded means due", () => {
    expect(dueDecision(null, 25, now).due).toBe(true);
  });
  it("a recent success is not due, an old one is", () => {
    expect(dueDecision("2026-11-01T00:00:00Z", 25, now).due).toBe(false);
    expect(dueDecision("2026-09-01T00:00:00Z", 25, now).due).toBe(true);
    expect(dueDecision("2026-09-01T00:00:00Z", 70, now).due).toBe(true);
  });
});

describe("run summary", () => {
  it("names the failed items in the subject and keeps the reassurance in the body", () => {
    const { status, subject, lines } = summariseRun("load", [
      { item: "load-crime", status: "failed", errorMessage: "boom\nstack" },
      { item: "load-epc", status: "succeeded", logLine: "load-epc · OK" },
      { item: "epc-deltas", status: "warning", logLine: "canary epc-deltas · HTTP 500" },
    ]);
    expect(status).toBe("failed");
    expect(subject).toContain("FAILED");
    expect(subject).toContain("load-crime");
    expect(subject).not.toContain("epc-deltas");
    expect(lines.join("\n")).toContain("the previous data is still serving");
  });

  it("warnings alone never fail a run", () => {
    const { status } = summariseRun("canary", [
      { item: "epc-deltas", status: "warning", logLine: "w" },
      { item: "onspd", status: "succeeded", logLine: "ok" },
    ]);
    expect(status).toBe("succeeded");
  });
});

describe("exit code", () => {
  const ok = [{ item: "a", status: "succeeded" }];
  it("is zero only when everything succeeded and the email sent", () => {
    expect(decideExitCode({ items: ok, alertStatus: "sent", noEmail: false })).toBe(0);
    expect(decideExitCode({ items: ok, alertStatus: "failed", noEmail: false })).toBe(1);
    expect(
      decideExitCode({
        items: [{ item: "a", status: "failed" }],
        alertStatus: "sent",
        noEmail: false,
      }),
    ).toBe(1);
    expect(decideExitCode({ items: ok, alertStatus: "not_required", noEmail: true })).toBe(0);
  });
});

describe("sources", () => {
  const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
  const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
  const migration = readFileSync(join(process.cwd(), "db/migrations/0006_loader_runs.sql"), "utf8");

  it("the migration records runs, items and the alert's own fate", () => {
    expect(migration).toContain("loader_runs");
    expect(migration).toContain("loader_run_items");
    expect(migration).toContain("alert_status");
    expect(migration).toContain("alert_error");
  });

  it("the runner sends one email via Resend and prints ALERT FAILED when it cannot", () => {
    expect(runner).toContain("api.resend.com/emails");
    expect(runner).toContain("onboarding@resend.dev");
    expect(runner).toContain("ALERT FAILED");
    expect(runner).toContain("loader-runs-fallback.jsonl");
  });

  it("the canary covers every source and keeps deltas warning-grade", () => {
    for (const probe of [
      "onspd",
      "ppd",
      "police",
      "epc",
      "gias",
      "ofsted",
      "ods",
      "cqc-directory",
      "cqc-ratings",
    ]) {
      expect(canary).toContain(probe);
    }
    expect(canary).toContain("warning-grade");
  });
});
