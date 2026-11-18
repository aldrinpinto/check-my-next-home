// The picking-index canary item (plan step M7.15B): the
// pure verdict over the filed editions — ageing,
// half-loaded, refused re-extracts — on the
// canary-postio pattern. The probe's database read is
// thin; the verdict is what's pinned.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { STALE_AFTER_DAYS, pickingIndexVerdict } from "../loaders/canary-picking-index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const canarySource = readFileSync(path.join(here, "../loaders/canary.mjs"), "utf8");

const NOW = new Date("2026-11-18T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

function edition(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    source: "sales",
    edition: "2026-11-01",
    loaded_at: daysAgo(10),
    postcodes: 100,
    homes: 1000,
    streets: 200,
    previous_homes: null,
    last_rejected_homes: null,
    last_rejected_at: null,
    ...partial,
  };
}

describe("pickingIndexVerdict", () => {
  it("skips in its own words when the editions cannot be read", () => {
    const outcome = pickingIndexVerdict(null, NOW);
    expect(outcome).toMatchObject({ skipped: expect.stringContaining("could not be read") });
  });

  it("skips in its own words before the first national run", () => {
    const outcome = pickingIndexVerdict(
      [
        edition({ source: "sales", loaded_at: null, edition: null }),
        edition({ source: "epc", loaded_at: null, edition: null }),
      ],
      NOW,
    );
    expect(outcome).toMatchObject({
      skipped: expect.stringContaining("has not run yet"),
    });
  });

  it("is quiet when both editions are fresh", () => {
    const outcome = pickingIndexVerdict(
      [edition({ source: "sales" }), edition({ source: "epc", edition: "2026-11-05" })],
      NOW,
    );
    expect(outcome).not.toHaveProperty("warning");
    expect(outcome).not.toHaveProperty("skipped");
    expect((outcome as { logLine: string }).logLine).toContain("both editions fresh");
  });

  it("warns when one half has never been filed", () => {
    const outcome = pickingIndexVerdict(
      [edition({ source: "sales" }), edition({ source: "epc", loaded_at: null, edition: null })],
      NOW,
    );
    expect(outcome).toMatchObject({ warning: true });
    expect((outcome as { logLine: string }).logLine).toContain(
      "the epc half of the picking index has never been filed",
    );
  });

  it("warns when an edition ages past the monthly rhythm", () => {
    const outcome = pickingIndexVerdict(
      [
        edition({ source: "sales", loaded_at: daysAgo(STALE_AFTER_DAYS + 15) }),
        edition({ source: "epc" }),
      ],
      NOW,
    );
    expect(outcome).toMatchObject({ warning: true });
    expect((outcome as { logLine: string }).logLine).toContain(`${STALE_AFTER_DAYS + 15} days old`);
  });

  it("warns when a re-extract was refused since the last filing", () => {
    const outcome = pickingIndexVerdict(
      [
        edition({
          source: "sales",
          loaded_at: daysAgo(10),
          homes: 1000,
          last_rejected_homes: 400,
          last_rejected_at: daysAgo(2),
        }),
        edition({ source: "epc" }),
      ],
      NOW,
    );
    expect(outcome).toMatchObject({ warning: true });
    expect((outcome as { logLine: string }).logLine).toContain("was refused");
    expect((outcome as { logLine: string }).logLine).toContain("400 distinct homes");
  });

  it("does not warn about a refusal an earlier successful filing superseded", () => {
    const outcome = pickingIndexVerdict(
      [
        edition({
          source: "sales",
          loaded_at: daysAgo(2),
          last_rejected_homes: 400,
          last_rejected_at: daysAgo(10),
        }),
        edition({ source: "epc" }),
      ],
      NOW,
    );
    expect(outcome).not.toHaveProperty("warning");
  });
});

describe("the canary wiring", () => {
  it("canary.mjs runs the picking-index item", () => {
    expect(canarySource).toContain('from "./canary-picking-index.mjs"');
    expect(canarySource).toContain('await run("picking-index", probePickingIndex)');
  });
});
