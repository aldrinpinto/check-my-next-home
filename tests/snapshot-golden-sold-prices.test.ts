import { describe, expect, it } from "vitest";
import { diffSnapshots } from "../scripts/snapshot-golden-sold-prices";

// Guards the golden proof's comparison (Price Paid national
// step): the before/after diff of the served sold-prices
// snapshots must stay silent on identical figures — the
// snapshot's own timestamp aside — and name every figure
// that moved, by path.

const before = {
  takenAt: "2026-11-23T04:00:00.000Z",
  postcodes: {
    "CM3 2JT": {
      filedRows: 30,
      transactionIds: ["A", "B"],
      rung2: { median: { value: 610875, counted: 29 } },
    },
  },
};

describe("diffSnapshots — the golden before/after proof", () => {
  it("is silent on identical figures, the timestamp aside", () => {
    const after = { ...structuredClone(before), takenAt: "2026-12-23T04:00:00.000Z" };
    expect(diffSnapshots(before, after)).toEqual([]);
  });

  it("names a moved figure by its full path", () => {
    const after = structuredClone(before);
    (after.postcodes["CM3 2JT"].rung2.median as { value: number }).value = 615000;
    const diffs = diffSnapshots(before, after);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toContain("postcodes.CM3 2JT.rung2.median.value");
    expect(diffs[0]).toContain("610875");
    expect(diffs[0]).toContain("615000");
  });

  it("reports a changed transaction-id set as a length difference", () => {
    const after = structuredClone(before);
    after.postcodes["CM3 2JT"].transactionIds = ["A"];
    const diffs = diffSnapshots(before, after);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toContain("transactionIds");
  });
});
