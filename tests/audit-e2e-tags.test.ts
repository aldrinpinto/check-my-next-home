import { describe, expect, it } from "vitest";
import { evaluatePartition, parseListOutput } from "../scripts/audit-e2e-tags.mjs";

// The E2E tag audit (plan step M7.15, D68). From M7.15
// the push gate runs only the Smoke set and the full
// suite runs on cadence, so the Smoke/Regression
// partition has to be proved, not assumed: this test
// pins the audit's own behaviour — what counts as a
// listed test, and exactly which shapes of drift fail
// (untagged, double-tagged, a grep hit the full listing
// does not know, an empty Smoke set, no tests at all).

const LISTING = [
  "Listing tests:",
  "  [chromium] › home.e2e.ts:18:3 › home page — smoke › the landing serves",
  "  [chromium] › journey.e2e.ts:53:3 › checker journey — smoke › Birkdale: results",
  "  [chromium] › journey.e2e.ts:95:3 › checker journey — regression › the checking screen",
  "Total: 3 tests in 2 files",
  "",
].join("\n");

const SMOKE_LINES = [
  "[chromium] › home.e2e.ts:18:3 › home page — smoke › the landing serves",
  "[chromium] › journey.e2e.ts:53:3 › checker journey — smoke › Birkdale: results",
];
const REGRESSION_LINES = [
  "[chromium] › journey.e2e.ts:95:3 › checker journey — regression › the checking screen",
];

describe("parseListOutput", () => {
  it("keeps only the test lines, trimmed, and ignores headers and footers", () => {
    expect(parseListOutput(LISTING)).toEqual([...SMOKE_LINES, ...REGRESSION_LINES]);
  });

  it("returns an empty list for output with no test lines", () => {
    expect(parseListOutput("Listing tests:\nTotal: 0 tests in 0 files\n")).toEqual([]);
  });
});

describe("evaluatePartition", () => {
  it("passes an exact partition and reports the counts", () => {
    const verdict = evaluatePartition({
      all: [...SMOKE_LINES, ...REGRESSION_LINES],
      smoke: SMOKE_LINES,
      regression: REGRESSION_LINES,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.total).toBe(3);
    expect(verdict.smokeCount).toBe(2);
    expect(verdict.regressionCount).toBe(1);
    expect(verdict.problems).toEqual([]);
  });

  it("fails and names a test that carries neither tag", () => {
    const verdict = evaluatePartition({
      all: [...SMOKE_LINES, ...REGRESSION_LINES],
      smoke: SMOKE_LINES,
      regression: [],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.untagged).toEqual(REGRESSION_LINES);
    expect(verdict.problems.join("\n")).toContain(REGRESSION_LINES[0]);
  });

  it("fails and names a test that carries both tags", () => {
    const verdict = evaluatePartition({
      all: [...SMOKE_LINES, ...REGRESSION_LINES],
      smoke: SMOKE_LINES,
      regression: [...REGRESSION_LINES, SMOKE_LINES[0]],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.doubleTagged).toEqual([SMOKE_LINES[0]]);
  });

  it("fails when a tag set names a test the full listing does not", () => {
    const verdict = evaluatePartition({
      all: [...SMOKE_LINES, ...REGRESSION_LINES],
      smoke: [...SMOKE_LINES, "[chromium] › ghost.e2e.ts:1:1 › ghost › nowhere"],
      regression: REGRESSION_LINES,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("\n")).toContain("ghost.e2e.ts");
  });

  it("fails when the Smoke set is empty", () => {
    const verdict = evaluatePartition({
      all: [...SMOKE_LINES, ...REGRESSION_LINES],
      smoke: [],
      regression: [...SMOKE_LINES, ...REGRESSION_LINES],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("\n")).toContain("Smoke set is empty");
  });

  it("fails when the full listing collected nothing", () => {
    const verdict = evaluatePartition({ all: [], smoke: [], regression: [] });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("\n")).toContain("no tests at all");
  });
});
