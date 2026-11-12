import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the practice seed (plan step M3.6): every seeded row must
// carry the SEED stamp, both golden test homes must be covered, and
// the seed must never touch the orders tables.

const seed = readFileSync(join(process.cwd(), "db", "seed.mjs"), "utf8");

describe("practice seed", () => {
  it("stamps every row as fake practice data", () => {
    expect(seed).toContain("SEED — fake practice data (M3.6)");
    expect(seed).toContain("WHERE source_name = $1");
  });

  it("covers both golden test homes", () => {
    expect(seed).toContain("CM3 2JT");
    expect(seed).toContain("E16 1GN");
  });

  it("never seeds the orders tables", () => {
    expect(seed).not.toContain("INSERT INTO reports");
    expect(seed).not.toContain("INSERT INTO licence_keys");
    expect(seed).not.toContain('"reports"');
    expect(seed).not.toContain('"licence_keys"');
  });
});
