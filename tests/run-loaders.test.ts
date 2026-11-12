import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEmailBodies,
  decideExitCode,
  dueDecision,
  summariseRun,
} from "../loaders/run-loaders.mjs";

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

  it("main() actually sends the human-readable bodies, not the raw lines", () => {
    // Regression guard: the readable-email builder once existed
    // and was unit-tested while main() still sent the old body.
    expect(runner).toContain("buildEmailBodies(run, items, recordNote)");
    expect(runner).toContain("sendRunEmail(subject, bodies.text, bodies.html)");
    expect(runner).not.toContain("emailBody");
  });

  it("the email gives sold prices and EPC a real detail, not a bare (updated)", () => {
    const items = [
      {
        item: "load-sold-prices",
        mode: "fixture",
        status: "succeeded",
        logLine: "load-sold-prices · edition 2026-07-20 · CM3 2JT 30 sales · golden homes OK · 0s",
      },
      {
        item: "load-epc",
        mode: "fixture",
        status: "succeeded",
        logLine:
          "load-epc · CM3 2JT 42 certificates · E16 1GN 12 certificates · golden homes OK · 0s",
      },
    ] as never;
    const { text } = buildEmailBodies(run, items, null);
    expect(text).toContain("Sold prices — updated fine (sales file dated 20 July 2026).");
    expect(text).toContain("Energy certificates (EPC) — updated fine (54 certificates checked).");
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

describe("the email a person reads", () => {
  const run = {
    id: "run-1",
    kind: "practice-break",
    environment: "ci",
    startedAt: new Date("2026-11-12T18:29:34Z"),
  };
  const bodies = buildEmailBodies(
    run,
    [
      {
        item: "load-postcodes",
        mode: "live",
        status: "succeeded",
        logLine: "load-postcodes · edition August 2026 (2026-08-01) · 6 live postcodes filed",
      },
      {
        item: "load-crime",
        mode: "live",
        status: "failed",
        errorMessage: "load-crime FAILED: CM3 2JT 2026-05: Police.uk response is not a list",
      },
    ],
    null,
  );

  it("leads with what happened and what to do, in plain words", () => {
    expect(bodies.text.indexOf("WHAT HAPPENED")).toBeLessThan(
      bodies.text.indexOf("load-postcodes · edition"),
    );
    expect(bodies.text).toContain("Nothing urgent");
    expect(bodies.text).toContain("Crime — FAILED. Nothing was filed");
    expect(bodies.text).toContain("Postcode directory — updated fine (edition August 2026)");
  });

  it("carries the same structure as HTML for mail clients", () => {
    expect(bodies.html).toContain("What happened");
    expect(bodies.html).toContain("What you need to do");
    expect(bodies.html).toContain("Collector by collector");
  });
});
