// The E2E tag audit (plan step M7.15, D68) — keeps the
// Smoke/Regression partition honest at the gate.
//
// From M7.15 the CI push gate runs only the Smoke set
// (--grep @smoke) and the full suite runs on cadence in
// the scheduled workflow. That split is only safe if
// every Playwright test carries exactly one of the two
// D68 tags: an untagged test would be collected by
// neither grep set at the gate, and a double-tagged one
// would blur the line the gate stands on. This audit is
// the compensating control the step adopted — a
// `playwright test --list` partition check, wired into
// the prepush gate and the CI checks job.
//
// It collects three listings (all tests, --grep @smoke,
// --grep @regression) and proves the two tag sets
// partition the whole suite exactly: no test untagged,
// none double-tagged, none in a grep set that the full
// listing does not know, and the Smoke set non-empty.
// Collection only — no browser, no database, no server.
//
// Usage:
//   node scripts/audit-e2e-tags.mjs

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// One listed test per line in `playwright test --list`
// output, in the form:
//   [chromium] › file.e2e.ts:12:3 › describe › title
// Header and footer lines carry no "›" and are ignored.
// A test's identity is its whole trimmed line — the same
// line appears byte-identically in every listing that
// collects the test, so set arithmetic on lines is exact.
export function parseListOutput(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("›"));
}

// The partition proof. Inputs are the three listings as
// arrays of identity lines. Returns the counts and every
// violation found, named by the offending test lines.
export function evaluatePartition({ all, smoke, regression }) {
  const problems = [];
  const allSet = new Set(all);
  const smokeSet = new Set(smoke);
  const regressionSet = new Set(regression);

  if (allSet.size !== all.length) {
    problems.push("the full listing contains duplicate test lines — two tests share one identity");
  }
  if (allSet.size === 0) {
    problems.push("the full listing collected no tests at all");
  }
  if (smokeSet.size === 0) {
    problems.push("the Smoke set is empty — the push gate would run no E2E tests");
  }

  const untagged = [...allSet].filter((line) => !smokeSet.has(line) && !regressionSet.has(line));
  for (const line of untagged) {
    problems.push(`untagged (neither @smoke nor @regression): ${line}`);
  }

  const doubleTagged = [...smokeSet].filter((line) => regressionSet.has(line));
  for (const line of doubleTagged) {
    problems.push(`double-tagged (@smoke and @regression): ${line}`);
  }

  const unknown = [...smokeSet, ...regressionSet].filter((line) => !allSet.has(line));
  for (const line of unknown) {
    problems.push(`in a tag set but not in the full listing: ${line}`);
  }

  return {
    ok: problems.length === 0,
    total: allSet.size,
    smokeCount: smokeSet.size,
    regressionCount: regressionSet.size,
    untagged,
    doubleTagged,
    problems,
  };
}

function listTests(grepArgs) {
  const localBin = join(REPO_ROOT, "node_modules", ".bin", "playwright");
  const command = existsSync(localBin) ? localBin : "npx";
  const args = existsSync(localBin)
    ? ["test", "--list", ...grepArgs]
    : ["playwright", "test", "--list", ...grepArgs];
  const out = execFileSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return parseListOutput(out);
}

function main() {
  const verdict = evaluatePartition({
    all: listTests([]),
    smoke: listTests(["--grep", "@smoke"]),
    regression: listTests(["--grep", "@regression"]),
  });
  console.log(
    `audit-e2e-tags: ${verdict.total} tests — ${verdict.smokeCount} @smoke, ${verdict.regressionCount} @regression.`,
  );
  if (!verdict.ok) {
    for (const problem of verdict.problems) {
      console.error(`audit-e2e-tags: FAIL — ${problem}`);
    }
    console.error(
      "audit-e2e-tags: every E2E test must carry exactly one D68 tag (@smoke or @regression).",
    );
    process.exit(1);
  }
  console.log("audit-e2e-tags: the partition is exact — every test tagged exactly once.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
