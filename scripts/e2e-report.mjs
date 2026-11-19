// The scheduled E2E run report (plan step M7.15, D68) —
// the email each scheduled suite sends when it finishes.
//
// D68's cadence terms: every scheduled run emails a short
// report to the project inbox — pass and fail counts,
// every failure named, with its screenshot or trace link.
// The scheduled workflow runs Playwright with the JSON
// reporter switched on (E2E_JSON_REPORT=1 in
// playwright.config.ts), uploads test-results/ as the
// run's artefacts, then calls this script. Screenshots
// and traces live in those artefacts, so the email links
// the run page that holds them (E2E_RUN_URL).
//
// The send follows the house pattern (the journey
// digest, the loaders' alerts): Resend, from the shared
// sender, to ALERT_EMAIL_TO or the project inbox. A run
// that died before Playwright wrote a results file still
// gets its email — the report says so in plain words and
// links the run. Flaky tests (passed on retry) are
// named, never silently green (founder ruling, 17 Nov
// 2026).
//
// Usage:
//   node scripts/e2e-report.mjs                 read test-results/results.json and email
//   node scripts/e2e-report.mjs --no-send       compose and print, send nothing
//   node scripts/e2e-report.mjs path/to.json    read a different results file
//
// Environment: RESEND_API_KEY (required to send),
// ALERT_EMAIL_TO (recipient override), E2E_SUITE (the
// run's label, e.g. "Smoke (nightly)"), E2E_RUN_URL
// (the workflow run's page).

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RESULTS = join(REPO_ROOT, "test-results", "results.json");

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function firstErrorOf(spec) {
  for (const test of spec.tests ?? []) {
    for (const result of test.results ?? []) {
      const error = (result.errors ?? [])[0];
      if (error?.message) {
        return stripAnsi(error.message).split("\n").slice(0, 4).join("\n").slice(0, 600);
      }
    }
  }
  return "";
}

function walkSuites(suite, prefix, out) {
  const parts = suite.title ? [...prefix, suite.title] : prefix;
  for (const spec of suite.specs ?? []) {
    out.push({ name: [...parts, spec.title].join(" › "), spec });
  }
  for (const child of suite.suites ?? []) {
    walkSuites(child, parts, out);
  }
}

// Reduce a Playwright JSON report to the email's facts:
// the counts, every failed spec named with its first
// error, and every flaky spec named. Counts come from
// the report's own stats when present (they are the
// runner's arithmetic), the names from walking the
// suites.
export function summariseResults(json) {
  const found = [];
  for (const suite of json.suites ?? []) {
    walkSuites(suite, [], found);
  }
  const failures = [];
  const flaky = [];
  for (const { name, spec } of found) {
    const statuses = (spec.tests ?? []).map((test) => test.status);
    if (statuses.includes("unexpected")) {
      failures.push({ name, error: firstErrorOf(spec) });
    } else if (statuses.includes("flaky")) {
      flaky.push(name);
    }
  }
  const stats = json.stats ?? {};
  const computed = {
    passed: found.filter((f) => (f.spec.tests ?? []).every((t) => t.status === "expected")).length,
    failed: failures.length,
    flaky: flaky.length,
    skipped: found.filter((f) => (f.spec.tests ?? []).some((t) => t.status === "skipped")).length,
  };
  const counts =
    typeof stats.expected === "number"
      ? {
          passed: stats.expected,
          failed: stats.unexpected ?? computed.failed,
          flaky: stats.flaky ?? computed.flaky,
          skipped: stats.skipped ?? computed.skipped,
        }
      : computed;
  return {
    ...counts,
    total: counts.passed + counts.failed + counts.flaky + counts.skipped,
    durationMs: typeof stats.duration === "number" ? stats.duration : null,
    failures,
    flakyNames: flaky,
  };
}

function humanDuration(durationMs) {
  if (durationMs === null) return "";
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// Compose the email. `summary` is null when the run
// produced no readable results file.
export function composeReport({ suite, runUrl, summary }) {
  if (!summary) {
    return {
      subject: `E2E ${suite}: no results — the run failed before the suite reported`,
      text: [
        `The scheduled ${suite} run has finished, but it produced no results file — the run failed before the suite could report (a setup, build or seeding failure, most likely).`,
        "",
        runUrl ? `The run, with its logs: ${runUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
  const subject =
    `E2E ${suite}: ${summary.passed} passed, ${summary.failed} failed` +
    (summary.flaky > 0 ? `, ${summary.flaky} flaky` : "");
  const lines = [
    `The scheduled ${suite} run has finished.`,
    "",
    `Passed: ${summary.passed}`,
    `Failed: ${summary.failed}`,
    `Flaky (passed on retry): ${summary.flaky}`,
    `Skipped: ${summary.skipped}`,
    `Total: ${summary.total}${summary.durationMs !== null ? ` in ${humanDuration(summary.durationMs)}` : ""}`,
  ];
  if (summary.failures.length > 0) {
    lines.push("", "Failures:");
    for (const failure of summary.failures) {
      lines.push(`- ${failure.name}`);
      if (failure.error) {
        lines.push(
          failure.error
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n"),
        );
      }
    }
  }
  if (summary.flakyNames.length > 0) {
    lines.push("", "Flaky (passed on retry):");
    for (const name of summary.flakyNames) {
      lines.push(`- ${name}`);
    }
  }
  if (runUrl) {
    lines.push("", `Screenshots and traces are in this run's artefacts: ${runUrl}`);
  }
  return { subject, text: lines.join("\n") };
}

async function main() {
  const args = process.argv.slice(2);
  const noSend = args.includes("--no-send");
  const pathArg = args.find((arg) => !arg.startsWith("--"));
  const resultsPath = pathArg
    ? isAbsolute(pathArg)
      ? pathArg
      : join(REPO_ROOT, pathArg)
    : DEFAULT_RESULTS;

  let summary = null;
  try {
    summary = summariseResults(JSON.parse(readFileSync(resultsPath, "utf8")));
  } catch (error) {
    console.error(
      `e2e-report: no readable results at ${resultsPath} — ${error instanceof Error ? error.message : error}`,
    );
  }

  const { subject, text } = composeReport({
    suite: process.env.E2E_SUITE ?? "scheduled suite",
    runUrl: process.env.E2E_RUN_URL ?? "",
    summary,
  });

  if (noSend) {
    console.log(`Subject: ${subject}\n\n${text}`);
    console.log("e2e-report: --no-send given; the report was not emailed.");
    return;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("e2e-report: RESEND_API_KEY is not set — the report was not emailed.");
    process.exit(1);
  }
  const recipient = process.env.ALERT_EMAIL_TO ?? "checkmynexthome@gmail.com";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Check My Next Home <onboarding@resend.dev>",
      to: [recipient],
      subject,
      text: `${text}\n`,
    }),
  });
  if (!response.ok) {
    console.error(
      `e2e-report: Resend answered HTTP ${response.status} — the report was not emailed.`,
    );
    process.exit(1);
  }
  console.log(`e2e-report: emailed to ${recipient}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`e2e-report: failed — ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
