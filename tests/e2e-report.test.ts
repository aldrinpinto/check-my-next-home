import { describe, expect, it } from "vitest";
import { composeReport, summariseResults } from "../scripts/e2e-report.mjs";

// The scheduled E2E run report (plan step M7.15, D68).
// The email is the scheduled suite's only voice, so its
// facts are pinned here: the counts come from the
// report's own stats, every failure is named with its
// first error (ANSI stripped), flaky tests are named
// rather than silently green, and a run with no results
// file still composes an honest email.

const REPORT = {
  stats: { expected: 10, unexpected: 1, flaky: 1, skipped: 2, duration: 754_000 },
  suites: [
    {
      title: "journey.e2e.ts",
      specs: [],
      suites: [
        {
          title: "checker journey — regression",
          specs: [
            {
              title: "the whole-check failure state",
              ok: false,
              tests: [
                {
                  status: "unexpected",
                  results: [
                    {
                      status: "failed",
                      errors: [
                        {
                          message:
                            "\u001b[31mError: expect(locator).toBeVisible() failed\u001b[39m\n  at journey.e2e.ts:10:1",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              title: "refresh restores the results",
              ok: true,
              tests: [
                {
                  status: "flaky",
                  results: [{ status: "failed", errors: [] }, { status: "passed" }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("summariseResults", () => {
  it("takes the counts from the report stats and the total from them", () => {
    const summary = summariseResults(REPORT);
    expect(summary.passed).toBe(10);
    expect(summary.failed).toBe(1);
    expect(summary.flaky).toBe(1);
    expect(summary.skipped).toBe(2);
    expect(summary.total).toBe(14);
    expect(summary.durationMs).toBe(754_000);
  });

  it("names the failed spec by its full suite path, with the ANSI-stripped first error", () => {
    const summary = summariseResults(REPORT);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0].name).toBe(
      "journey.e2e.ts › checker journey — regression › the whole-check failure state",
    );
    expect(summary.failures[0].error).toContain("Error: expect(locator).toBeVisible() failed");
    expect(summary.failures[0].error).not.toContain("\u001b[");
  });

  it("names flaky specs separately from failures", () => {
    const summary = summariseResults(REPORT);
    expect(summary.flakyNames).toEqual([
      "journey.e2e.ts › checker journey — regression › refresh restores the results",
    ]);
  });
});

describe("composeReport", () => {
  it("leads with the counts, names every failure, and links the run for screenshots and traces", () => {
    const { subject, text } = composeReport({
      suite: "Regression (weekly)",
      runUrl: "https://github.com/aldrinpinto/check-my-next-home/actions/runs/123",
      summary: summariseResults(REPORT),
    });
    expect(subject).toBe("E2E Regression (weekly): 10 passed, 1 failed, 1 flaky");
    expect(text).toContain("Passed: 10");
    expect(text).toContain("Failed: 1");
    expect(text).toContain("Total: 14 in 12m 34s");
    expect(text).toContain("the whole-check failure state");
    expect(text).toContain("refresh restores the results");
    expect(text).toContain(
      "Screenshots and traces are in this run's artefacts: https://github.com/aldrinpinto/check-my-next-home/actions/runs/123",
    );
  });

  it("omits the failure and flaky sections when there are none", () => {
    const { subject, text } = composeReport({
      suite: "Smoke (nightly)",
      runUrl: "",
      summary: {
        passed: 8,
        failed: 0,
        flaky: 0,
        skipped: 0,
        total: 8,
        durationMs: 95_000,
        failures: [],
        flakyNames: [],
      },
    });
    expect(subject).toBe("E2E Smoke (nightly): 8 passed, 0 failed");
    expect(text).not.toContain("Failures:");
    expect(text).not.toContain("artefacts");
  });

  it("composes an honest no-results email when the run died before reporting", () => {
    const { subject, text } = composeReport({
      suite: "Smoke (nightly)",
      runUrl: "https://example.invalid/run",
      summary: null,
    });
    expect(subject).toContain("no results");
    expect(text).toContain("produced no results file");
    expect(text).toContain("https://example.invalid/run");
  });
});
