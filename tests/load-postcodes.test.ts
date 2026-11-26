import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the postcode directory loader (plan step M4.1): it must
// file by upsert (never wiping cached answers), skip terminated
// postcodes, stamp the ONS source, and carry the golden-home proof.
// The fixture must hold the real directory rows for both golden
// homes, taken from the August 2026 edition.

const loader = readFileSync(join(process.cwd(), "loaders", "load-postcodes.mjs"), "utf8");
const fixtureCm = readFileSync(
  join(
    process.cwd(),
    "tests",
    "fixtures",
    "onspd",
    "Data",
    "multi_csv",
    "ONSPD_AUG_2026_UK_CM.csv",
  ),
  "utf8",
);
const fixtureE = readFileSync(
  join(process.cwd(), "tests", "fixtures", "onspd", "Data", "multi_csv", "ONSPD_AUG_2026_UK_E.csv"),
  "utf8",
);

describe("postcode directory loader", () => {
  it("stamps the ONS source and upserts instead of wiping", () => {
    expect(loader).toContain("ONS Postcode Directory");
    expect(loader).toContain("ON CONFLICT (postcode) DO UPDATE");
    expect(loader).not.toContain("DELETE FROM postcode_cache");
    expect(loader).not.toContain("TRUNCATE");
  });

  // Resume (BUG-368): the wiring is pinned in source — the
  // loader's main run is not exported, so no fake-DB unit
  // test can reach it. A kill-and-resume proof against a
  // real database is the local-db-spike rehearsal's job.
  it("stages into a persistent table and checkpoints per flush (BUG-368)", () => {
    expect(loader).toContain("CREATE TABLE IF NOT EXISTS onspd_stage");
    expect(loader).not.toContain("CREATE TEMP TABLE");
    expect(loader).toContain("resume.prepare({");
    expect(loader).toContain("resume.checkpoint");
    expect(loader).toContain("resume.clear()");
    expect(loader).toContain("--restart");
  });

  it("skips terminated postcodes and proves both golden homes", () => {
    expect(loader).toContain("doterm");
    expect(loader).toContain("CM3 2JT");
    expect(loader).toContain("E16 1GN");
    expect(loader).toContain("Braintree");
    expect(loader).toContain("Newham");
  });

  it("fixture holds the real golden-home rows", () => {
    expect(fixtureCm).toContain('"CM3 2JT"');
    expect(fixtureCm).toContain("E01021395");
    expect(fixtureE).toContain('"E16 1GN"');
    expect(fixtureE).toContain("E01003511");
    expect(
      existsSync(
        join(
          process.cwd(),
          "tests",
          "fixtures",
          "onspd",
          "Documents",
          "LAD Local Authority District names and codes UK as at 04_25.csv",
        ),
      ),
    ).toBe(true);
  });
});

// ------------------------------------------------------------------
// Progress logging (BUG-265): this loader's main run is not
// exported, so the wiring is pinned in its source — the
// end-to-end lines are pinned in
// tests/load-progress-bug265-d.test.ts.
// ------------------------------------------------------------------
describe("progress logging (BUG-265)", () => {
  it("creates one shared logger and logs the read, the staging tally and failures", () => {
    expect(loader).toContain('createProgressLogger({ name: "load-postcodes" })');
    expect(loader).toContain('progress.stage("reading the ONSPD directory")');
    expect(loader).toContain('progress.count({ label: "read", done: counts.total, unit: "rows" })');
    expect(loader).toContain('progress.tally({ label: "staging", every: 100, unit: "batches" })');
    expect(loader).toContain(
      "filing ${formatCount(counts.live)} live postcodes into postcode_cache",
    );
    expect(loader).toContain("progress.failed({");
  });
});
