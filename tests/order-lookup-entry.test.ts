import { describe, expect, it, vi } from "vitest";

// BUG-107's guard, held for the order tool as for the
// worker entry (scripts/fulfil-reports.ts): importing
// scripts/order-lookup.ts must be side-effect-free —
// no lookup runs, nothing prints its run line, the
// process does not exit. The work lives inside main()
// and runs only on direct invocation; the direct
// invocation itself is proven on the host (recorded
// in the step's terminal report).
describe("scripts/order-lookup — the ops entry (BUG-107)", () => {
  it("importing the module runs nothing: main is exported, unexecuted", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("the entry must not exit on import");
    }) as typeof process.exit);
    try {
      const entry = await import("../scripts/order-lookup");
      expect(typeof entry.main).toBe("function");
      await new Promise((resolve) => setTimeout(resolve, 25));
      const printed = [...log.mock.calls, ...error.mock.calls].flat().join(" ");
      expect(printed).not.toContain("order-lookup:");
      expect(exit).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
      exit.mockRestore();
    }
  });
});
