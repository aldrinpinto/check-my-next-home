import { describe, expect, it, vi } from "vitest";

// BUG-107's guard (found at the M9.6 deploy, fixed at
// M9.7): the fulfilment worker's entry must (a) carry
// no top-level await — tsx transforms it to CommonJS,
// whose output format refuses one, and the first cut
// died on the host before anything ran — and (b) run
// ONLY when executed directly: importing the module is
// side-effect-free. The first half is proven by the
// direct invocation itself (recorded in the step's
// terminal report: the entry starts and fails, if at
// all, on missing configuration like a normal
// program); this test holds the second half — an
// import here must not construct the worker, print its
// run line, or exit the process.

describe("scripts/fulfil-reports — the worker entry (BUG-107)", () => {
  it("importing the module runs nothing: main is exported, unexecuted", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("the entry must not exit on import");
    }) as typeof process.exit);
    try {
      const entry = await import("../scripts/fulfil-reports");
      expect(typeof entry.main).toBe("function");
      // Give any stray fire-and-forget run a beat to
      // betray itself before judging the silence.
      await new Promise((resolve) => setTimeout(resolve, 25));
      const printed = [...log.mock.calls, ...error.mock.calls].flat().join(" ");
      expect(printed).not.toContain("fulfil-reports:");
      expect(exit).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
      exit.mockRestore();
    }
  });
});
